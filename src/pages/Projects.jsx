import { useState } from 'react';
import { calcFor, money, newProject, uid } from '../lib/store.js';

export default function Projects({ db, updateDb, openProject, setView }) {
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [selected, setSelected] = useState(new Set());

  const list = db.projects.filter((p) => !q || p.name.includes(q));
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const add = () => {
    const n = name.trim();
    if (!n) return alert('请填写工程名称');
    const tpl = db.projects.find((p) => p.id === templateId);
    updateDb((d) => { d.projects.unshift(newProject(d, n, tpl)); });
    setName('');
  };
  const remove = (id) => {
    if (!confirm('删除该工程？此操作不可恢复。')) return;
    updateDb((d) => { d.projects = d.projects.filter((p) => p.id !== id); });
  };
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
      await window.api.exportProject({ filePath: `${dir}/${safe}_概预算.xlsx`, project: p, result });
      ok++;
    }
    alert(`已导出 ${ok} 个工程到 ${dir}`);
  };

  return (
    <div>
      <div className="toolbar">
        <input className="input" style={{ width: 260 }} placeholder="搜索工程名称…" value={q} onChange={(e) => setQ(e.target.value)} />
        <input className="input" style={{ width: 260 }} placeholder="新工程名称" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">不套模板（空白）</option>
          {db.projects.map((p) => <option key={p.id} value={p.id}>套用模板：{p.name}</option>)}
        </select>
        <button className="btn primary" onClick={add}>＋ 新建工程</button>
        <button className="btn" onClick={exportSelected}>导出选中（Excel）</button>
        <button className="btn" onClick={() => setView('batch')}>批量生成 →</button>
      </div>
      <table className="table">
        <thead><tr><th style={{ width: 30 }}><input type="checkbox" onChange={(e) => setSelected(e.target.checked ? new Set(list.map((x) => x.id)) : new Set())} /></th>
          <th>工程名称</th><th>工程量行数</th><th>总计（含税）</th><th>更新时间</th><th>操作</th></tr></thead>
        <tbody>
          {list.map((p) => {
            const r = calcFor(db, p);
            return (
              <tr key={p.id}>
                <td><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} /></td>
                <td><a href="#" onClick={(e) => { e.preventDefault(); openProject(p.id); }}>{p.name}</a></td>
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
          {!list.length && <tr><td colSpan={6} className="empty">暂无工程。先新建一个，或到“批量生成”从 Excel 导入。</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
