import { EXPORT_GROUPS, SHEET_NAMES, toggleExportSelection, toggleExportGroup } from '../lib/v3.js';

/**
 * 导出勾选（v3.0 §13.6 / §13.11 P12）：左树勾选要出的表，默认全选。
 * props: { selection, onChange(selection), onExport(selection), disabled }
 */
export default function ExportPicker({ selection, onChange, onExport, disabled }) {
  const sel = selection || [];
  const all = sel.length === SHEET_NAMES.length;
  return (
    <div className="export-picker">
      <div className="export-tree">
        <label className="export-group">
          <input type="checkbox" checked={all}
            onChange={() => onChange(all ? [] : [...SHEET_NAMES])} />
          <b>全部表（{sel.length}/{SHEET_NAMES.length}）</b>
        </label>
        {EXPORT_GROUPS.map((g) => {
          const checkedCount = g.sheets.filter((s) => sel.includes(s)).length;
          const groupChecked = checkedCount === g.sheets.length;
          return (
            <div key={g.id} className="export-group-block">
              <label className="export-group">
                <input type="checkbox" checked={groupChecked}
                  ref={(el) => { if (el) el.indeterminate = checkedCount > 0 && !groupChecked; }}
                  onChange={() => onChange(toggleExportGroup(sel, g.sheets))} />
                {g.label}
              </label>
              <div className="export-leaves">
                {g.sheets.map((s) => (
                  <label key={s} className="export-leaf">
                    <input type="checkbox" checked={sel.includes(s)}
                      onChange={() => onChange(toggleExportSelection(sel, s))} />
                    {s}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="row">
        <button className="btn primary" disabled={disabled || !sel.length} onClick={() => onExport(sel)}>
          导出勾选的表（{sel.length} 张）
        </button>
        {!sel.length && <span className="muted">至少勾选 1 张表。</span>}
      </div>
    </div>
  );
}
