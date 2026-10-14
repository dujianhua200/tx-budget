import { useState } from 'react';

/**
 * 导入差异预览（v2 增量 4，§8.3）：新增 / 更新（字段级 diff + 逐字段勾选，默认全采用）
 * / 跳过 / 错误四组 + 每组整组勾选 + 模式（合并默认 / 全部替换，替换须输入当前方案名确认）
 * + 错误行知晓勾选。确认后输出 decisions 给调用方落库。
 */
export default function ImportDiffPreview({ open, viewLabel, profileName, classification, parseErrors, allowReplace = true, onConfirm, onCancel }) {
  const [addedKeys, setAddedKeys] = useState(() => new Set((classification?.added || []).map((a) => a.key)));
  const [updatedChoices, setUpdatedChoices] = useState(() => {
    const m = {};
    for (const u of classification?.updated || []) {
      m[u.key] = {};
      for (const d of u.diffs) m[u.key][d.field] = true;
    }
    return m;
  });
  const [mode, setMode] = useState('merge');
  const [replaceName, setReplaceName] = useState('');
  const [ackErrors, setAckErrors] = useState(false);
  if (!open || !classification) return null;

  const { added, updated, skipped, errors } = classification;
  const totalErrors = errors.length + (parseErrors?.length || 0);
  const replaceOk = mode !== 'replace' || replaceName.trim() === (profileName || '');
  const canConfirm = totalErrors === 0 || ackErrors;
  const toggleAdded = (key) => setAddedKeys((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const toggleUpdatedField = (key, field) => setUpdatedChoices((prev) => ({
    ...prev, [key]: { ...prev[key], [field]: !(prev[key]?.[field] ?? true) },
  }));
  const fmtVal = (v) => (v === null || v === undefined || v === '' ? '（空）' : String(v));

  return (
    <div className="modal-overlay">
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>导入差异预览 — {viewLabel}</h3>
        <p className="muted">
          新增 {added.length} 条、更新 {updated.length} 条、跳过 {skipped.length} 条、
          错误 {errors.length} 条{parseErrors?.length ? `（解析错误 ${parseErrors.length} 条）` : ''}。
          任何导入都不会在无预览、无确认的情况下覆盖现有数据。
        </p>
        {parseErrors?.length ? (
          <div className="diff-errors">
            <strong>解析错误：</strong>
            <ul>{parseErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        ) : null}
        {errors.length ? (
          <div className="diff-errors">
            <strong>错误行（不会导入）：</strong>
            <ul>{errors.map((e, i) => <li key={i}>{e.errors.join('；')}</li>)}</ul>
          </div>
        ) : null}
        <div className="row">
          <label><input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} /> 合并（默认）</label>
          {allowReplace && (
            <label><input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} /> 全部替换（整表替换为文件内容）</label>
          )}
          {mode === 'replace' && (
            <span>请输入当前方案名确认：<input className="input" value={replaceName} onChange={(e) => setReplaceName(e.target.value)} placeholder={profileName} /></span>
          )}
        </div>
        {mode === 'merge' && added.length > 0 && (
          <div>
            <h4>新增（{added.length}）</h4>
            <table className="table"><tbody>
              {added.map((a) => (
                <tr key={a.key}>
                  <td><input type="checkbox" checked={addedKeys.has(a.key)} onChange={() => toggleAdded(a.key)} /></td>
                  <td>{a.key.split('\0').join(' / ') || '(空主键)'}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        )}
        {mode === 'merge' && updated.length > 0 && (
          <div>
            <h4>更新（{updated.length}，字段级 diff，默认全部采用新值）</h4>
            <table className="table"><tbody>
              {updated.map((u) => (
                <tr key={u.key}>
                  <td>{u.key.split('\0').join(' / ')}</td>
                  <td>{u.diffs.map((d) => (
                    <label key={d.field} className="diff-check">
                      <input type="checkbox" checked={updatedChoices[u.key]?.[d.field] ?? true} onChange={() => toggleUpdatedField(u.key, d.field)} />
                      {d.label}：{fmtVal(d.from)} → {fmtVal(d.to)}
                    </label>
                  ))}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        )}
        {mode === 'replace' && (
          <p className="diff-warn">全部替换将用文件内 {added.length + updated.length} 条有效行替换整表；替换前会自动做一次方案级备份，删除内容可撤销。</p>
        )}
        {skipped.length > 0 && (
          <div>
            <h4>跳过（{skipped.length}，与现有完全相同）</h4>
            <p className="muted">{skipped.slice(0, 10).map((s) => s.key.split('\0').join(' / ')).join('、')}{skipped.length > 10 ? ' …' : ''}</p>
          </div>
        )}
        {totalErrors > 0 && (
          <label className="row"><input type="checkbox" checked={ackErrors} onChange={(e) => setAckErrors(e.target.checked)} /> 我已知晓并跳过错误行</label>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onCancel}>取消</button>
          <button
            className="btn primary"
            disabled={!canConfirm || !replaceOk}
            onClick={() => onConfirm({ mode, addedKeys: [...addedKeys], updatedChoices })}
          >确认导入</button>
        </div>
      </div>
    </div>
  );
}
