import { useState } from 'react';
import { calcFor, money, newProject } from '../lib/store.js';

/** 批量生成：批量新建 / 批量导入 / 批量导出 / 批量改价 / 批量改费率 */
export default function Batch({ db, updateDb, openProject }) {
  const [names, setNames] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [multiplier, setMultiplier] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const [matKey, setMatKey] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [discount, setDiscount] = useState(1);
  const [msg, setMsg] = useState('');

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const batchCreate = () => {
    const list = names.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!list.length) return alert('请先粘贴工程名称，每行一个');
    const tpl = db.projects.find((p) => p.id === templateId);
    const created = list.map((n) => {
      const p = newProject(db, n, tpl);
      if (tpl && multiplier !== 1) p.quantities.forEach((q) => { q.qty = Math.round(q.qty * multiplier * 100) / 100; });
      return p;
    });
    updateDb((d) => { d.projects.unshift(...created); });
    setNames('');
    setMsg(`已批量新建 ${created.length} 个工程${tpl ? `（套用模板 ${tpl.name}${multiplier !== 1 ? `，数量×${multiplier}` : ''}）` : ''}。`);
  };

  const importExcel = async () => {
    const file = await window.api.openFile([{ name: 'Excel', extensions: ['xlsx', 'xls'] }]);
    if (!file) return;
    const { kind, projects } = await window.api.importQuantities(file);
    if (!projects.length) return alert('该文件未识别到工程量：支持 v3.0 母版“工程量”表，或简易四列（工程名称/定额编号/项目名称/数量/工日系数）。');
    const created = projects.map((p) => {
      const np = newProject(db, p.name);
      np.quantities = p.quantities.map((q) => {
        const short = db.libraries.shortlist.find((s) => s.code === q.quota && s.name === q.variant);
        const quota = db.libraries.quotas.find((x) => x.code === q.quota);
        return { ...q, unit: short?.unit ?? quota?.unit ?? '', coef: q.coef || short?.coef || 1 };
      });
      return np;
    });
    updateDb((d) => { d.projects.unshift(...created); });
    setMsg(`已从 ${kind === 'v3' ? 'v3.0 母版' : '简易表格'} 导入 ${created.length} 个工程。`);
  };

  const batchExport = async () => {
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
    setMsg(`已批量导出 ${ok} 个工程到 ${dir}。`);
  };

  const batchPrice = () => {
    if (!matKey || newPrice === '') return alert('请选择材料并填写新单价（除税）');
    if (!selected.size) return alert('请先勾选要改价的工程');
    const price = Number(newPrice);
    updateDb((d) => {
      for (const p of d.projects.filter((x) => selected.has(x.id))) {
        const ex = p.materialPriceOverrides.find((a) => a.key === matKey);
        if (ex) ex.priceExcl = price; else p.materialPriceOverrides.push({ key: matKey, priceExcl: price });
      }
    });
    setMsg(`已将 ${selected.size} 个工程的 ${matKey} 除税单价改为 ${price} 元。`);
  };

  const batchDiscount = () => {
    if (!selected.size) return alert('请先勾选要改费率的工程');
    updateDb((d) => {
      for (const p of d.projects.filter((x) => selected.has(x.id))) p.info.施工折扣 = Number(discount);
    });
    setMsg(`已将 ${selected.size} 个工程的施工折扣改为 ${discount}。`);
  };

  return (
    <div>
      <h2>批量生成工程</h2>
      <div className="batch-grid">
        <section className="card">
          <h3>① 批量新建（粘贴工程名称 + 套模板）</h3>
          <textarea className="input" rows={6} style={{ width: '100%' }} placeholder={'每行一个工程名称，例如：\n张湾村光缆线路工程\n李庄村光缆线路工程\n…'} value={names} onChange={(e) => setNames(e.target.value)} />
          <div className="row">
            <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">不套模板（空白）</option>
              {db.projects.map((p) => <option key={p.id} value={p.id}>套用模板：{p.name}</option>)}
            </select>
            <label>数量倍数 <input className="input" style={{ width: 70 }} type="number" step="0.1" value={multiplier} onChange={(e) => setMultiplier(Number(e.target.value))} /></label>
            <button className="btn primary" onClick={batchCreate}>批量新建</button>
          </div>
          <p className="muted">套模板会复制模板的全部工程量、材料调整与费率；数量倍数可把模板工程量整体放大/缩小。</p>
        </section>
        <section className="card">
          <h3>② 从 Excel 批量导入工程量</h3>
          <p className="muted">支持两种格式：① v3.0 母版的“工程量”表（B1 当前工程、B2:J2 工程名称、E:M 各工程量，一次导入 9 个工程）；② 简易表：第一行表头 [工程名称, 定额编号, 项目名称, 数量, 工日系数]。</p>
          <button className="btn primary" onClick={importExcel}>选择 Excel 文件导入</button>
        </section>
        <section className="card">
          <h3>③ 批量改价 / 改费率（勾选下方工程后应用）</h3>
          <div className="row">
            <select className="input" value={matKey} onChange={(e) => setMatKey(e.target.value)}>
              <option value="">选择材料</option>
              {db.libraries.materials.map((m) => <option key={m.id} value={`${m.name}|${m.spec}`}>{m.name} {m.spec}（{m.supply}，现价 {m.priceExcl}）</option>)}
            </select>
            <input className="input" style={{ width: 110 }} type="number" placeholder="新除税单价" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
            <button className="btn" onClick={batchPrice}>批量改价</button>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <label>施工折扣 <input className="input" style={{ width: 80 }} type="number" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} /></label>
            <button className="btn" onClick={batchDiscount}>批量改折扣</button>
          </div>
          <p className="muted">改价/改费率只影响勾选的工程，不改全局默认价（全局默认价在“定制设置 → 材料库/费率”中改）。</p>
        </section>
        <section className="card">
          <h3>④ 批量导出预算书</h3>
          <p className="muted">勾选下方工程，一键导出每个工程的完整预算书 Excel（表一~表五 + 明细）。</p>
          <button className="btn primary" onClick={batchExport}>批量导出选中工程</button>
        </section>
      </div>
      {msg && <div className="notice">{msg}</div>}
      <table className="table">
        <thead><tr><th style={{ width: 30 }}><input type="checkbox" onChange={(e) => setSelected(e.target.checked ? new Set(db.projects.map((x) => x.id)) : new Set())} /></th>
          <th>工程名称</th><th>工程量行数</th><th>总计（含税）</th><th>操作</th></tr></thead>
        <tbody>{db.projects.map((p) => {
          const r = calcFor(db, p);
          return <tr key={p.id}><td><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} /></td>
            <td>{p.name}</td><td>{p.quantities.length}</td><td>{money(r.table1.grandIncl)}</td>
            <td><button className="btn sm" onClick={() => openProject(p.id)}>打开</button></td></tr>;
        })}
        {!db.projects.length && <tr><td colSpan={5} className="empty">暂无工程。</td></tr>}
        </tbody></table>
    </div>
  );
}
