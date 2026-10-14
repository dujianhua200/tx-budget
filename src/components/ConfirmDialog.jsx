/** 确认框组件（v2 增量 4，§8.4）：标题 + 影响说明 + 受影响名称示例（前 5 条）+ 确认/取消。 */
export default function ConfirmDialog({ open, title, impact, samples, confirmLabel, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {impact ? <p style={{ whiteSpace: 'pre-wrap' }}>{impact}</p> : null}
        {samples?.length ? (
          <p className="muted">例如：{samples.slice(0, 5).join('、')}{samples.length > 5 ? ` 等 ${samples.length} 条` : ''}</p>
        ) : null}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onCancel}>取消</button>
          <button className="btn danger-btn" onClick={onConfirm}>{confirmLabel || '确认删除'}</button>
        </div>
      </div>
    </div>
  );
}
