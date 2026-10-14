import { useEffect, useRef, useState} from 'react';
import Projects from './pages/Projects.jsx';
import Workbench from './pages/Workbench.jsx';
import Batch from './pages/Batch.jsx';
import Settings from './pages/Settings.jsx';
import Profiles from './pages/Profiles.jsx';
import Sidebar from './components/Sidebar.jsx';
import TopBar from './components/TopBar.jsx';
import StatusBar from './components/StatusBar.jsx';
import { createUndoStack} from './lib/undo.js';
import { createSaveQueue} from './lib/saveQueue.js';
import { restoreProjectSnapshot} from './lib/workbench.js';
import { LIBRARY_VIEW_MAP} from './lib/libraryDefs.js';
import { setViewRows} from './lib/libraryOps.js';
import { newProject} from './lib/store.js';
import {
saveStatusInitial, saveStatusTransition, statusHintFor, resolveEditingProfile,
} from './lib/v3.js';
import './styles.css';

/** 只把变化的分支放进 patch（configurationProfiles / projects / settings），不发全量保存。 */
function diffBranches(prev, next) {
const patch = {};
for (const key of ['configurationProfiles', 'projects', 'settings']) {
if (JSON.stringify(prev[key])!== JSON.stringify(next[key])) patch[key] = next[key];
}
return patch;
}

export default function App() {
const [db, setDb] = useState(null);
const [loadError, setLoadError] = useState(null);
// v3.0 §13.4：导航状态 section/tab 单一事实源，旧 4 按钮顶导航已删除。
const [nav, setNav] = useState({ section: 'projects', tab: null});
const [openId, setOpenId] = useState(null);
const [toast, setToast] = useState(null); // { msg, showUndo, key}
const [undoTick, setUndoTick] = useState(0);
const [saveState, setSaveState] = useState(() => saveStatusInitial());
const [selectedCount, setSelectedCount] = useState(0);
const dbRef = useRef(null);
const undoStack = useRef(createUndoStack(50));
const toastTimer = useRef(null);
useEffect(() => { dbRef.current = db;}, [db]);

/**
* 保存节流（v2 增量 5，B3）+ v3.0 §13.7 完成通知：
* updateDb 只把补丁推进队列，800ms 内聚合为一次 savePatch；
* onFlushStart → saving；onSettled（队列排空时）→ saved / 已自动保存 HH:MM。
*/
const saveQueueRef = useRef(null);
if (!saveQueueRef.current) {
saveQueueRef.current = createSaveQueue(async (pending) => {
const res = await window.api.savePatch({
patch: pending.patch, baseVersion: pending.baseVersion, major:!!pending.major,
}).catch(() => null);
if (res?.ok) {
setDb((cur) => (cur? {...cur, meta: {...(cur.meta || {}), saveVersion: res.version}}: cur));
return;
}
if (res?.conflict) {
const fresh = await window.api.getDb().catch(() => null);
if (!fresh || fresh.error) return;
const patch2 = diffBranches(fresh, dbRef.current);
if (!Object.keys(patch2).length) { setDb(fresh); return;}
const res2 = await window.api.savePatch({
patch: patch2, baseVersion: fresh.meta?.saveVersion?? 0, major:!!pending.major,
}).catch(() => null);
if (res2?.ok) {
if (dbRef.current) {
const merged = {...dbRef.current, meta: {...(dbRef.current.meta || {}), saveVersion: res2.version}};
dbRef.current = merged;
setDb(merged);
}
} else {
const f2 = await window.api.getDb().catch(() => null);
if (f2 &&!f2.error) setDb(f2);
}
return;
}
// 其他保存错误：重拉覆盖，避免本地与磁盘分叉（错误本身由主进程日志记录）
const f = await window.api.getDb().catch(() => null);
if (f &&!f.error) setDb(f);
}, {
delayMs: 800,
onFlushStart: () => setSaveState((s) => saveStatusTransition(s, 'saveStart')),
onSettled: ({ source}) => {
// 队列未排空（保存期间又有新编辑）时保持 saving，等最后一桶完成再置 saved。
if (saveQueueRef.current.pending()) return;
setSaveState((s) => saveStatusTransition(s, source === 'manual'? 'saveDone': 'autoSaveDone'));
},
});
}
/** 强制排空保存队列（保存按钮 / 导出前调，等待写盘完成后再读磁盘/导出）。 */
const flushSaves = () => saveQueueRef.current.flush({ source: 'manual'});

// 关闭窗口前：有待保存时提示并尽力排空（排空本身是异步，提示留给用户确认）。
useEffect(() => {
const onBeforeUnload = (e) => {
if (saveQueueRef.current.pending()) {
e.preventDefault();
e.returnValue = '有未保存的更改，仍要退出？';
void saveQueueRef.current.flush({ source: 'manual'});
}
};
window.addEventListener('beforeunload', onBeforeUnload);
return () => window.removeEventListener('beforeunload', onBeforeUnload);
}, []);

const notify = (msg, opts = {}) => {
if (toastTimer.current) clearTimeout(toastTimer.current);
setToast({ msg, showUndo:!!opts.undo, key: Date.now()});
toastTimer.current = setTimeout(() => setToast(null), 5000);
};
const pushUndo = (snapshot, label) => {
undoStack.current.push(snapshot, label);
setUndoTick((t) => t + 1);
};

useEffect(() => {
window.api.getDb().then((res) => {
if (res?.error) { setLoadError(res.error); return;}
setDb(res);
}).catch((e) => setLoadError(`数据加载失败：${e.message}`));
}, []);

const retryLoad = async () => {
setLoadError(null);
try {
const res = await window.api.reloadDb();
if (res?.error) { setLoadError(res.error); return;}
setDb(res);
} catch (e) { setLoadError(`数据加载失败：${e.message}`);}
};

/**
* 增量保存（§3.3 db:savePatch + 增量 5 saveQueue 节流）：
* 乐观更新本地状态，补丁推进队列聚合 800ms 后一次发送；行内编辑打字不再每次写盘。
* baseVersion 取本次编辑前本地状态的版本；队列内首个补丁的版本为本次发送的 baseVersion。
* opts.major=true 时触发滚动备份（批量删除 / 全部替换导入 / 删方案 / 删工程，B2）。
*
* 注意：以下定义（updateDb / handleUndo / 键盘撤销 useEffect）必须放在 early return 之前。
* 增量 8 修复：键盘撤销的 useEffect 原先在 `if (loadError) / if (!db)` 提前返回之后，
* 首渲染（db=null）时不执行、数据加载后才执行 → Hooks 数量变化 → React 抛
* "Rendered more hooks than during the previous render"，整树卸载、页面空白。
* 规则：本组件内所有 Hooks 与被 Hooks 回调引用的函数定义，一律放在 early return 之前。
*/
const updateDb = (fn, opts = {}) => {
const prev = dbRef.current;
if (!prev) return;
const next = JSON.parse(JSON.stringify(prev));
fn(next);
const patch = diffBranches(prev, next);
if (!Object.keys(patch).length) return;
const baseVersion = prev.meta?.saveVersion?? 0;
dbRef.current = next;
setDb(next);
setSaveState((s) => saveStatusTransition(s, 'edit'));
saveQueueRef.current.markDirty({ patch, baseVersion, major:!!opts.major});
};
const openProject = (id) => {
// v3.0 §13.2：记录最近打开时间，供工程列表最近置顶。
updateDb((d) => {
const p = d.projects.find((x) => x.id === id);
if (p) p.lastOpenedAt = Date.now();
});
setOpenId(id);
setNav({ section: 'current', tab: 'info'});
};
const project = openId && db? db.projects.find((p) => p.id === openId): null;
const projectProfile = project? (db?.configurationProfiles || []).find((p) => p.id === project.profileId): null;
const editingProfile = db? resolveEditingProfile(db): null;
const inLibraryOrFee = nav.section === 'libraries' || nav.section === 'feeRules';

/** 顶栏：新建工程并打开（重名时自动加序号后缀）。 */
const handleNewProject = () => {
const cur = dbRef.current;
if (!cur) return;
const names = new Set((cur.projects || []).map((p) => p.name));
let name = '新工程';
for (let i = 2; names.has(name); i++) name = `新工程 (${i})`;
const created = newProject(cur, name);
updateDb((d) => { d.projects.unshift(created);});
setOpenId(created.id);
setNav({ section: 'current', tab: 'info'});
notify(`已新建工程“${name}”，请在工程信息中完善`, { undo: false});
};
/** 顶栏：有打开工程时跳报表导出，否则跳工程列表。 */
const handleExportNav = () => {
if (project) setNav({ section: 'current', tab: 'export'});
else setNav({ section: 'projects', tab: null});
};

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
updateDb((d) => { restoreProjectSnapshot(d, snap);});
}
notify(`已撤销：${item.label}`, { undo: false});
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

if (loadError) {
return (
<div style={{ padding: 40}}>
<h2>数据加载失败</h2>
<p style={{ color: '#b00', whiteSpace: 'pre-wrap'}}>{loadError}</p>
<button className="btn primary" onClick={retryLoad}>重试</button>
<p className="muted" style={{ marginTop: 12}}>迁移失败时原数据未改动，v1 快照已保存为 budget-data.v1-backup-*.json。</p>
</div>
);
}
if (!db) return <div style={{ padding: 40}}>正在加载数据…</div>;

return (
<div className="app">
<TopBar
projectName={project?.name} profileName={projectProfile?.name}
editingProfileName={editingProfile?.name} showEditing={inLibraryOrFee}
saveState={saveState}
onNew={handleNewProject}
onOpen={() => setNav({ section: 'projects', tab: null})}
onSave={() => void flushSaves()}
onManage={() => setNav({ section: 'projects', tab: null})}
onExport={handleExportNav}
onClose={() => window.close()}
canUndo={canUndo} onUndo={handleUndo} undoLabel={undoStack.current.peekLabel()}
/>
<div className="app-body">
<Sidebar nav={nav} setNav={setNav} hasProject={!!project} editingProfileName={editingProfile?.name} />
<main className="main">
{nav.section === 'projects' && <Projects db={db} updateDb={updateDb} openProject={openProject} setNav={setNav} pushUndo={pushUndo} notify={notify} onSelectionChange={setSelectedCount} />}
{nav.section === 'current' && project && <Workbench db={db} project={project} updateDb={updateDb} back={() => setNav({ section: 'projects', tab: null})} pushUndo={pushUndo} notify={notify} flushSaves={flushSaves} tab={nav.tab || 'info'} />}
{nav.section === 'current' &&!project && <div className="empty">请先在“工程”列表中打开一个工程。</div>}
{nav.section === 'batch' && <Batch db={db} updateDb={updateDb} openProject={openProject} pushUndo={pushUndo} notify={notify} />}
{(nav.section === 'libraries' || nav.section === 'feeRules' || nav.section === 'settings') && (
<Settings db={db} updateDb={updateDb} pushUndo={pushUndo} notify={notify} section={nav.section} tab={nav.tab} />
)}
{nav.section === 'profiles' && <Profiles db={db} updateDb={updateDb} pushUndo={pushUndo} notify={notify} setNav={setNav} />}
</main>
</div>
<StatusBar hint={statusHintFor(nav)} projectName={project?.name} profileName={projectProfile?.name} selectedCount={nav.section === 'projects'? selectedCount: undefined} />
{toast && (
<div className="toast">
<span>{toast.msg}</span>
{toast.showUndo && <button className="btn sm primary" onClick={() => { setToast(null); handleUndo();}}>撤销</button>}
<button className="btn sm" onClick={() => setToast(null)}>×</button>
</div>
)}
</div>
);
}
