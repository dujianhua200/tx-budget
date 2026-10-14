import { useState } from 'react';
import { money, num2 } from '../../lib/store.js';
import QuotaAutocomplete from '../QuotaAutocomplete.jsx';

/**
 * 工作量 · 表三甲（v3.0 §13.5）：定额编号联想 + 数量回车下一行 + 右侧常驻小计（建安费/除税价）。
 * props: { project, libs, result, warnings..., orphanIds, invalidIds, dupCodes, callbacks }
 */
const STATUS_TEXT = { orphan: '⚠ 未建档', invalid: '⚠ 数量无效', duplicate: '⚠ 编号重复' };

export default function WorkbenchQuantities({
  project, libs, result, orphanWarn, invalidWarn, dismissed, orphanCount, orphanCodes,
  orphanIds, invalidIds, dupCodes, rowStatus, setQty, addQtyRow, deleteQty, deleteOrphans,
  dismissWarning, locateOrphan,
}) {
  const [kw, setKw] = useState('');
  const [picked, setPicked] = useState(null);
  const [addQty, setAddQty] = useState('');
  const [highlightId, setHighlightId] = useState(null);

  const doAdd = () => {
    if (!picked) return;
    addQtyRow({ code: picked.code, name: picked.name, unit: picked.unit, coef: picked.coef ?? 1, qty: Number(addQty) || 0 });
    setKw(''); setPicked(null); setAddQty('');
    document.querySelector('.wb-addrow input')?.focus();
  };
  const focusNextQty = (currentId) => {
    const ids = project.quantities.map((r) => r.id);
    const idx = ids.indexOf(currentId);
    const next = ids[idx + 1];
    if (next) document.querySelector(`[data-qty-input="${next}"]`)?.focus();
  };

  return (
    <div>
      <div className="wb-subtotal">
        <span>建安费（除税价）<b>{result ? money(result.table2After?.exclTax) : '—'}</b> 元</span>
        <span>建安费（含税）<b>{result ? money(result.table2After?.inclTax) : '—'}</b> 元</span>
        <span>总计（含税）<b>{result ? money(result.table1?.grandIncl) : '—'}</b> 元</span>
      </div>
      <div className="toolbar wb-addrow">
        <QuotaAutocomplete libs={libs} value={kw}
          onChange={(v) => { setKw(v); if (picked && v !== picked.code) setPicked(null); }}
          onPick={(row) => { setPicked(row); setKw(row.code); }}
          placeholder="输入定额编号 / 项目名称，回车选第一条…" />
        <input className="input" style={{ width: 140 }} type="number" placeholder="数量，回车添加"
          value={addQty} onChange={(e) => setAddQty(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') doAdd(); }} />
        <button className="btn primary" disabled={!picked} onClick={doAdd}>添加</button>
        <span className="muted">选定额 → 输数量 → 回车添加；工程量表内数量回车跳下一行。</span>
      </div>
      {orphanWarn && !dismissed.includes('orphanQty') && orphanCount > 0 && (
        <div className="wb-warn">
          <span>{orphanWarn.message}</span>
          <button className="btn sm" onClick={() => {
            const first = project.quantities.find((r) => orphanIds.has(r.id));
            if (first) { setHighlightId(first.id); setTimeout(() => setHighlightId(null), 2000); locateOrphan(); }
          }}>定位</button>
          <button className="btn sm" onClick={deleteOrphans}>删除孤儿行</button>
          <button className="btn sm" onClick={() => dismissWarning('orphanQty')}>忽略此警告</button>
        </div>
      )}
      {invalidWarn && !dismissed.includes('invalidQty') && (
        <div className="wb-warn">
          <span>{invalidWarn.message}</span>
          <button className="btn sm" onClick={() => dismissWarning('invalidQty')}>忽略此警告</button>
        </div>
      )}
      <table className="table"><thead><tr><th>#</th><th>定额编号</th><th>项目名称</th><th>单位</th><th>数量</th><th>工日系数</th><th>状态</th><th></th></tr></thead>
        <tbody>{project.quantities.map((r, i) => {
          const st = rowStatus(r, { orphanIds, invalidIds, dupCodes });
          return (
            <tr key={r.id ?? i} id={`qty-row-${r.id}`} className={r.id === highlightId ? 'wb-row-hl' : ''}>
              <td>{i + 1}</td><td>{r.quota}</td><td>{r.variant}</td><td>{r.unit}</td>
              <td><input className="cell-input" data-qty-input={r.id} type="number" value={r.qty}
                onChange={(e) => setQty(r.id, 'qty', Number(e.target.value))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusNextQty(r.id); } }} /></td>
              <td><input className="cell-input" type="number" step="0.1" value={r.coef} onChange={(e) => setQty(r.id, 'coef', Number(e.target.value))} /></td>
              <td>{STATUS_TEXT[st] || ''}</td>
              <td><button className="btn sm danger" onClick={() => deleteQty(r)}>删除</button></td>
            </tr>
          );
        })}
        {!project.quantities.length && <tr><td colSpan={8} className="empty">暂无工程量。搜索上方定额添加，或用“批量生成”从 Excel 导入。</td></tr>}
        </tbody></table>
      <p className="muted">共 {project.quantities.length} 行，其中孤儿 {orphanCount} 行。
        {result && <> · 工日小计 {num2(result.techSub)} / {num2(result.laborSub)}，调整 {result.adjRate * 100}%，合计 {num2(result.techDays)} / {num2(result.laborDays)}</>}</p>
    </div>
  );
}
