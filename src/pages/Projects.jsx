import { useState } from 'react';
import { calcFor, money, newProject, uid } from '../lib/store.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

export default function Projects({ db, updateDb, openProject, setView, pushUndo, notify }) {
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [profileFilter, setProfileFilter] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [confirm, setConfirm] = useState(null); // {ids, names}

  // 增量 1 最小接线：工程列表展示所属配置方案 + 按方案筛选。
  const profileName = (p) => db.configurationProfiles?.find((x) => x.id === p.profileId)?.name ?? '—';
  const list = db.projects.filter((p) => (!q || p.name.includes(q)) && (!profileFilter || p.profileId === profileFilter));
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const add = () => {
    const n = name.trim();
    if (!n) return alert('请填写工程名称');
    const tpl = db.projects.find((p) => p.id === templateId);
    updateDb((d) => { d.projects.unshift(newProject(d, n, tpl)); });
    setName('');
  };
  /**
   * 删除工程（B2）：确认框 + 撤销快照（projects 数组全量）+ major 备份。
   * 删除前备份 + 撤销快照缺一不可；确认后 Toast 带“撤销”按钮。
   */
  const askDelete = (ids) => {
    const targets = db.projects.filter((p) => ids.includes(p.id));
    if (!targets.length) return;
    setConfirm({ ids: targets.map((p) => p.id), names: targets.map((p) => p.name) });
  };
  const doDelete = () => {
    if (!confirm) return;
    const { ids, names } = confirm;
    if (pushUndo) pushUndo(
      { scope: 'projects', projectsBefore: JSON.parse(JSON.stringify(db.projects)) },
      `删除 ${ids.length} 个工程`,
    );
    updateDb((d) => { d.projects = d.projects.filter((p) => !ids.includes(p.id)); }, { major: true });
    setSelected(new Set());
    setConfirm(null);
    if (notify) notify(`已删除 ${ids.length} 个工程，可撤销`, { undo: true });
    return names;
  };
  const remove = (id) => askDelete([id]);
  const duplicate = (p) => {
    const copy = JSON.parse(JSON.stringify(p));
    copy.id = uid(); copy.name = p.name + '（副本）'; copy.createdAt = new Date().toISOString();
    updateDb((d) => { d.projects.unshift(copy); });
  };
  const exportSelected = async () => {
    if (!selected.size) return alert('请先勾选要导出的工程');
    const dir = await window.api.openDir();
    if (!dir) return;
    let ok = 0;
    for (const p of db.projects.filter((x) => selected.has(x.id))) {
      const result = calcFor(db, p);
      const safe = p.name.replace(/[\\/:*?"<>|]/g, '_');
      await window.api.exportBudgetBook({ filePath: `${dir}/${safe}_概预算.xlsx`, project: p, result, profileId: p.profileId });
      ok++;
    }
    if (notify) notify(`已导出 ${ok} 个工程到 ${dir}`, { undo: false });
  };

  return (
    <div>
      <div className="toolbar">
        <input className="input" style={{ width: 260 }} placeholder="搜索工程名称…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={profileFilter} onChange={(e) => setProfileFilter(e.target.value)}>
          <option value="">全部配置方案</option>
          {(db.configurationProfiles || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input className="input" style={{ width: 260 }} placeholder="新工程名称" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">不套模板（空白）</option>
          {db.projects.map((p) => <option key={p.id} value={p.id}>套用模板：{p.name}</option>)}
        </select>
        <button className="btn primary" onClick={add}>＋ 新建工程</button>
        <button className="btn" onClick={exportSelected}>导出选中（Excel）</button>
        <button className="btn danger" disabled={!selected.size}
          onClick={() => askDelete([...selected])}>删除选中</button>
        <button className="btn" onClick={() => setView('batch')}>批量生成 →</button>
      </div>
      <table className="table">
        <thead><tr><th style={{ width: 30 }}><input type="checkbox" onChange={(e) => setSelected(e.target.checked ? new Set(list.map((x) => x.id)) : new Set())} /></th>
          <th>工程名称</th><th>配置方案</th><th>工程量行数</th><th>总计（含税）</th><th>更新时间</th><th>操作</th></tr></thead>
        <tbody>
          {list.map((p) => {
            const r = calcFor(db, p);
            return (
              <tr key={p.id}>
                <td><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} /></td>
                <td><a href="#" onClick={(e) => { e.preventDefault(); openProject(p.id); }}>{p.name}</a></td>
                <td>{profileName(p)}</td>
                <td>{p.quantities.length}</td>
                <td>{money(r.table1.grandIncl)}</td>
                <td>{new Date(p.updatedAt).toLocaleString('zh-CN')}</td>
                <td>
                  <button className="btn sm" onClick={() => openProject(p.id)}>打开</button>{' '}
                  <button className="btn sm" onClick={() => duplicate(p)}>复制</button>{' '}
                  <button className="btn sm danger" onClick={() => remove(p.id)}>删除</button>
                </td>
              </tr>
            );
          })}
          {!list.length && <tr><td colSpan={7} className="empty">暂无工程。先新建一个，或到“批量生成”从 Excel 导入。</td></tr>}
        </tbody>
      </table>
      {confirm && (
        <ConfirmDialog open
          title={confirm.ids.length === 1 ? '删除该工程？' : `删除选中的 ${confirm.ids.length} 个工程？`}
          impact={`将删除 ${confirm.ids.length} 个工程（含工程量、材料调整与费率覆盖），删除前已备份，可撤销。`}
          samples={confirm.names}
          confirmLabel="确认删除"
          onConfirm={doDelete}
          onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
