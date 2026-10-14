import { useMemo, useRef, useState } from 'react';
import { filterRows, sortRows, paginate, formatPageRange } from '../lib/libraryOps.js';
import ConfirmDialog from './ConfirmDialog.jsx';

/**
 * 通用库表组件（v2 增量 4，§8.2）：搜索 + 排序 + 分页（文案 `共 N 条，显示 M–K 条`）
 * + 复选（行首 + 表头三态 + 全选本页 / 全选全部）+ 行内编辑 + 删除确认
 * + 导入 / 导出 / 批量删除 / 新增工具栏。全部库 Tab 复用。
 *
 * props:
 *   view: LIBRARY_VIEWS 中的视图定义
 *   rows: 当前视图行（已由父级经 getViewRows 取出）
 *   referenceInfo(rows) -> { projects: string[], rules: number, rowRefs }（删除影响说明；可为空）
 *   onEdit(id, patch) / onAdd() / onDelete(ids) / onImport() / onExport(format, scope)
 */
export default function LibraryTable({ view, rows, referenceInfo, onEdit, onAdd, onDelete, onImport, onExport }) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState(new Set());
  const [confirm, setConfirm] = useState(null); // { ids, title, impact, samples }
  const headerCheckRef = useRef(null);

  const filtered = useMemo(
    () => sortRows(filterRows(rows, view.columns, query), sortKey, sortDir, view.columns),
    [rows, view.columns, query, sortKey, sortDir],
  );
  const paged = useMemo(() => paginate(filtered, page, pageSize), [filtered, page, pageSize]);
  const pageIds = useMemo(() => paged.rows.map((r) => r.id), [paged.rows]);
  const allChecked = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someChecked = pageIds.some((id) => selected.has(id)) && !allChecked;
  if (headerCheckRef.current) headerCheckRef.current.indeterminate = someChecked;

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };
  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectPage = (checked) => setSelected((prev) => {
    const next = new Set(prev);
    for (const id of pageIds) { if (checked) next.add(id); else next.delete(id); }
    return next;
  });
  const selectAll = () => setSelected(new Set(filtered.map((r) => r.id)));

  const askDelete = (ids) => {
    const targets = (rows || []).filter((r) => ids.includes(r.id));
    const info = referenceInfo ? referenceInfo(targets) : { projects: [], rules: 0 };
    const samples = targets.map((r) => view.columns.map((c) => r[c.key]).filter((v) => v !== '' && v != null).slice(0, 2).join(' / '));
    const impactParts = [`将删除 ${targets.length} 条${view.label}。`];
    if (info.projects?.length) {
      impactParts.push(`其中 ${info.projects.length} 个工程引用了这些行，删除后这些工程的工程量行将显示孤儿警告（不级联删除工程量行）。`);
    }
    if (info.rules) impactParts.push(`另有 ${info.rules} 条关联规则引用了这些行。`);
    setConfirm({
      ids,
      title: `删除 ${targets.length} 条${view.label}？`,
      impact: impactParts.join('\n'),
      samples,
    });
  };

  const doExport = (format) => {
    let scope = 'all';
    if (query && filtered.length < (rows || []).length) {
      // 非删除选择：确定 = 全部，取消 = 仅筛选（§8.2）。
      scope = window.confirm(`导出全部 ${(rows || []).length} 条还是仅筛选出的 ${filtered.length} 条？\n确定 = 全部，取消 = 仅筛选`) ? 'all' : 'filtered';
    }
    onExport(format, scope, scope === 'filtered' ? filtered : rows);
  };

  const cellEditor = (row, col) => {
    const v = row[col.key];
    if (col.type === 'readonly') return <span>{v ?? ''}</span>;
    if (col.type === 'checkbox') {
      return <input type="checkbox" checked={!!v} onChange={(e) => onEdit(row.id, { [col.key]: e.target.checked })} />;
    }
    if (col.type === 'select') {
      return (
        <select className="input" value={v ?? ''} onChange={(e) => onEdit(row.id, { [col.key]: e.target.value })}>
          <option value="">—</option>
          {col.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (col.type === 'number') {
      return (
        <input
          className="cell-input" type="number" step="any"
          value={v ?? ''}
          placeholder={col.key === '数值' && row._section === 'byProjectType' && row._key === 'winterRate' ? '空=按地区查表' : undefined}
          onChange={(e) => onEdit(row.id, { [col.key]: e.target.value === '' ? null : Number(e.target.value) })}
        />
      );
    }
    return (
      <input className="cell-input" value={v ?? ''} onChange={(e) => onEdit(row.id, { [col.key]: e.target.value })} />
    );
  };

  return (
    <div>
      <div className="toolbar">
        <input className="input" style={{ width: 300 }} placeholder={`搜索${view.label}…`} value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
        <button className="btn" onClick={onImport}>导入</button>
        <button className="btn" onClick={() => doExport('xlsx')}>导出 Excel</button>
        <button className="btn" onClick={() => doExport('json')}>导出 JSON</button>
        {view.allowDelete && (
          <button className="btn" disabled={selected.size === 0} onClick={() => askDelete([...selected])}>
            批量删除{selected.size ? `（${selected.size}）` : ''}
          </button>
        )}
        {view.allowAdd && <button className="btn primary" onClick={onAdd}>＋ 新增</button>}
      </div>
      <table className="table">
        <thead><tr>
          {view.selectable && (
            <th style={{ width: 28 }}>
              <input ref={headerCheckRef} type="checkbox" checked={allChecked} onChange={(e) => selectPage(e.target.checked)} />
            </th>
          )}
          {view.columns.map((c) => (
            <th key={c.key} onClick={() => toggleSort(c.key)} style={{ cursor: 'pointer' }}>
              {c.label}{sortKey === c.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
            </th>
          ))}
          {view.allowDelete && <th style={{ width: 60 }}></th>}
        </tr></thead>
        <tbody>
          {paged.rows.map((row) => (
            <tr key={row.id}>
              {view.selectable && (
                <td><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleOne(row.id)} /></td>
              )}
              {view.columns.map((c) => <td key={c.key}>{cellEditor(row, c)}</td>)}
              {view.allowDelete && (
                <td><button className="btn sm danger" onClick={() => askDelete([row.id])}>删除</button></td>
              )}
            </tr>
          ))}
          {paged.rows.length === 0 && (
            <tr><td colSpan={(view.columns.length + (view.selectable ? 1 : 0) + (view.allowDelete ? 1 : 0))} className="empty">无数据</td></tr>
          )}
        </tbody>
      </table>
      <div className="pagination">
        <span>{query ? `搜索“${query}”` : ''}{formatPageRange(filtered.length, paged.page, pageSize)}</span>
        <span>
          <button className="btn sm" disabled={paged.page <= 1} onClick={() => setPage(paged.page - 1)}>上一页</button>
          <span style={{ margin: '0 8px' }}>第 {paged.page} / {paged.totalPages} 页</span>
          <button className="btn sm" disabled={paged.page >= paged.totalPages} onClick={() => setPage(paged.page + 1)}>下一页</button>
        </span>
        <label>每页 <select className="input" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
          <option value={50}>50</option><option value={100}>100</option><option value={200}>200</option>
        </select></label>
        {view.selectable && (
          <span>
            <button className="btn sm" onClick={() => selectPage(true)}>全选本页</button>
            <button className="btn sm" onClick={selectAll}>全选全部（{filtered.length} 条）</button>
            <button className="btn sm" onClick={() => setSelected(new Set())}>清除选择</button>
          </span>
        )}
      </div>
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        impact={confirm?.impact}
        samples={confirm?.samples}
        confirmLabel="确认删除"
        onCancel={() => setConfirm(null)}
        onConfirm={() => { const ids = confirm.ids; setConfirm(null); setSelected(new Set()); onDelete(ids); }}
      />
    </div>
  );
}
