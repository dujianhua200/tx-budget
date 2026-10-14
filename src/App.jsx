import { useEffect, useRef, useState } from 'react';
import Projects from './pages/Projects.jsx';
import Workbench from './pages/Workbench.jsx';
import Batch from './pages/Batch.jsx';
import Settings from './pages/Settings.jsx';
import Profiles from './pages/Profiles.jsx';
import { createUndoStack } from './lib/undo.js';
import { createSaveQueue } from './lib/saveQueue.js';
import { restoreProjectSnapshot } from './lib/workbench.js';
import { LIBRARY_VIEW_MAP } from './lib/libraryDefs.js';
import { setViewRows } from './lib/libraryOps.js';
import './styles.css';

/** 只把变化的分支放进 patch（configurationProfiles / projects / settings），不发全量保存。 */
function diffBranches(prev, next) {
  const patch = {};
  for (const key of ['configurationProfiles', 'projects', 'settings']) {
    if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) patch[key] = next[key];
  }
  return patch;
}

export default function App() {
  const [db, setDb] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [view, setView] = useState('projects');
  const [openId, setOpenId] = useState(null);
  const [toast, setToast] = useState(null); // { msg, showUndo, key }
  const [undoTick, setUndoTick] = useState(0);
  const dbRef = useRef(null);
  const undoStack = useRef(createUndoStack(50));
  const toastTimer = useRef(null);
  useEffect(() => { dbRef.current = db; }, [db]);

  /**
   * 保存节流（v2 增量 5，B3）：updateDb 只把补丁推进队列，800ms 内聚合为一次 savePatch。
   * saveFn 负责发请求 + 冲突重试（重拉后以本地最新状态重算补丁重发，等价重放）。
   */
  const saveQueueRef = useRef(null);
  if (!saveQueueRef.current) {
    saveQueueRef.current = createSaveQueue(async (pending) => {
      const res = await window.api.savePatch({
        patch: pending.patch, baseVersion: pending.baseVersion, major: !!pending.major,
      }).catch(() => null);
      if (res?.ok) {
        setDb((cur) => (cur ? { ...cur, meta: { ...(cur.meta || {}), saveVersion: res.version } } : cur));
        return;
      }
      if (res?.conflict) {
        const fresh = await window.api.getDb().catch(() => null);
        if (!fresh || fresh.error) return;
        const patch2 = diffBranches(fresh, dbRef.current);
        if (!Object.keys(patch2).length) { setDb(fresh); return; }
        const res2 = await window.api.savePatch({
          patch: patch2, baseVersion: fresh.meta?.saveVersion ?? 0, major: !!pending.major,
        }).catch(() => null);
        if (res2?.ok) {
          if (dbRef.current) {
            const merged = { ...dbRef.current, meta: { ...(dbRef.current.meta || {}), saveVersion: res2.version } };
            dbRef.current = merged;
            setDb(merged);
          }
        } else {
          const f2 = await window.api.getDb().catch(() => null);
          if (f2 && !f2.error) setDb(f2);
        }
        return;
      }
      // 其他保存错误：重拉覆盖，避免本地与磁盘分叉（错误本身由主进程日志记录）
      const f = await window.api.getDb().catch(() => null);
      if (f && !f.error) setDb(f);
    }, { delayMs: 800 });
  }
  /** 强制排空保存队列（导出前 / 切换工程前调，等待写盘完成后再读磁盘/导出）。 */
  const flushSaves = () => saveQueueRef.current.flush();

  // 关闭窗口前：有待保存时提示并尽力排空（排空本身是异步，提示留给用户确认）。
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (saveQueueRef.current.pending()) {
        e.preventDefault();
        e.returnValue = '有未保存的更改，仍要退出？';
        void saveQueueRef.current.flush();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const notify = (msg, opts = {}) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, showUndo: !!opts.undo, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };
  const pushUndo = (snapshot, label) => {
    undoStack.current.push(snapshot, label);
    setUndoTick((t) => t + 1);
  };

  useEffect(() => {
    window.api.getDb().then((res) => {
      if (res?.error) { setLoadError(res.error); return; }
      setDb(res);
    }).catch((e) => setLoadError(`数据加载失败：${e.message}`));
  }, []);

  const retryLoad = async () => {
    setLoadError(null);
    try {
      const res = await window.api.reloadDb();
      if (res?.error) { setLoadError(res.error); return; }
      setDb(res);
    } catch (e) { setLoadError(`数据加载失败：${e.message}`); }
  };

  if (loadError) {
    return (
      <div style={{ padding: 40 }}>
        <h2>数据加载失败</h2>
        <p style={{ color: '#b00', whiteSpace: 'pre-wrap' }}>{loadError}</p>
        <button className="btn primary" onClick={retryLoad}>重试</button>
        <p className="muted" style={{ marginTop: 12 }}>迁移失败时原数据未改动，v1 快照已保存为 budget-data.v1-backup-*.json。</p>
      </div>
    );
  }
  if (!db) return <div style={{ padding: 40 }}>正在加载数据…</div>;

  /**
   * 增量保存（§3.3 db:savePatch + 增量 5 saveQueue 节流）：
   * 乐观更新本地状态，补丁推进队列聚合 800ms 后一次发送；行内编辑打字不再每次写盘。
   * baseVersion 取本次编辑前本地状态的版本；队列内首个补丁的版本为本次发送的 baseVersion。
   * opts.major=true 时触发滚动备份（批量删除 / 全部替换导入 / 删方案 / 删工程，B2）。
   */
  const updateDb = (fn, opts = {}) => {
    const prev = dbRef.current;
    if (!prev) return;
    const next = JSON.parse(JSON.stringify(prev));
    fn(next);
    const patch = diffBranches(prev, next);
    if (!Object.keys(patch).length) return;
    const baseVersion = prev.meta?.saveVersion ?? 0;
    dbRef.current = next;
    setDb(next);
    saveQueueRef.current.markDirty({ patch, baseVersion, major: !!opts.major });
  };
  const openProject = (id) => { setOpenId(id); setView('detail'); };
  const project = openId ? db.projects.find((p) => p.id === openId) : null;

  /** 撤销（B2）：弹出快照并写回（经 updateDb + savePatch，与正常保存同一链路）。 */
  const handleUndo = () => {
    const item = undoStack.current.undo();
    setUndoTick((t) => t + 1);
    if (!item) return;
    const snap = item.snapshot;
    if (snap.scope === 'table') {
      const v = LIBRARY_VIEW_MAP[snap.viewKey];
      if (!v) return;
      updateDb((d) => {
        const i = d.configurationProfiles.findIndex((p) => p.id === snap.profileId);
        if (i >= 0) d.configurationProfiles[i] = setViewRows(d.configurationProfiles[i], v, snap.rowsBefore);
      });
    } else if (snap.scope === 'profiles') {
      updateDb((d) => {
        d.configurationProfiles = snap.profilesBefore;
        d.settings = snap.settingsBefore;
      });
    } else if (snap.scope === 'project' || snap.scope === 'projects') {
      updateDb((d) => { restoreProjectSnapshot(d, snap); });
    }
    notify(`已撤销：${item.label}`, { undo: false });
  };
  const canUndo = undoStack.current.canUndo();
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="app">
      <header className="header">
        <span className="logo">通信概预算</span>
        <nav>
          <button className={view === 'projects' || view === 'detail' ? 'nav active' : 'nav'} onClick={() => setView('projects')}>工程</button>
          <button className={view === 'batch' ? 'nav active' : 'nav'} onClick={() => setView('batch')}>批量生成</button>
          <button className={view === 'settings' ? 'nav active' : 'nav'} onClick={() => setView('settings')}>定制设置</button>
          <button className={view === 'profiles' ? 'nav active' : 'nav'} onClick={() => setView('profiles')}>配置方案</button>
        </nav>
        <span className="muted">451号文 · 宇翔表二格式 · {db.projects.length} 个工程</span>
        <button className="btn sm" style={{ marginLeft: 'auto' }} disabled={!canUndo} onClick={handleUndo} title="撤销上一次删除/导入（Cmd/Ctrl+Z）">
          撤销{canUndo ? `：${undoStack.current.peekLabel()}` : ''}
        </button>
      </header>
      <main className="main">
        {(view === 'projects') && <Projects db={db} updateDb={updateDb} openProject={openProject} setView={setView} pushUndo={pushUndo} notify={notify} />}
        {view === 'detail' && project && <Workbench db={db} project={project} updateDb={updateDb} back={() => setView('projects')} pushUndo={pushUndo} notify={notify} flushSaves={flushSaves} />}
        {view === 'detail' && !project && <div className="empty">该工程已被删除。</div>}
        {view === 'batch' && <Batch db={db} updateDb={updateDb} openProject={openProject} pushUndo={pushUndo} notify={notify} />}
        {view === 'settings' && <Settings db={db} updateDb={updateDb} pushUndo={pushUndo} notify={notify} />}
        {view === 'profiles' && <Profiles db={db} updateDb={updateDb} pushUndo={pushUndo} notify={notify} />}
      </main>
      {toast && (
        <div className="toast">
          <span>{toast.msg}</span>
          {toast.showUndo && <button className="btn sm primary" onClick={() => { setToast(null); handleUndo(); }}>撤销</button>}
          <button className="btn sm" onClick={() => setToast(null)}>×</button>
        </div>
      )}
    </div>
  );
}
