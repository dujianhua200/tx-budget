import { saveStatusText } from '../lib/v3.js';

/**
 * 顶栏（v3.0 §13.11.5）：新建工程 / 打开工程 / 保存工程 / 工程管理 / 导出 + 当前工程名 +
 * 当前方案名 + 保存状态；退出 = 关闭窗口。基础库/取费规则页另显示“正在编辑方案：XXX”。
 */
export default function TopBar({
  projectName, profileName, editingProfileName, showEditing, saveState,
  onNew, onOpen, onSave, onManage, onExport, onClose, canUndo, onUndo, undoLabel,
}) {
  return (
    <header className="header">
      <span className="logo">通信概预算</span>
      <div className="topbar-tools">
        <button className="btn sm topbtn" onClick={onNew}>新建工程</button>
        <button className="btn sm topbtn" onClick={onOpen}>打开工程</button>
        <button className="btn sm topbtn primary" onClick={onSave}>保存工程</button>
        <button className="btn sm topbtn" onClick={onManage}>工程管理</button>
        <button className="btn sm topbtn" onClick={onExport}>导出</button>
      </div>
      <span className="topbar-current">
        {projectName ? <>当前工程：<b>{projectName}</b></> : <span className="muted">未打开工程</span>}
        {profileName && <> · 方案：{profileName}</>}
      </span>
      {showEditing && editingProfileName && (
        <span className="topbar-editing">正在编辑方案：{editingProfileName}</span>
      )}
      <span className="topbar-save" title="保存状态">{saveStatusText(saveState)}</span>
      <button className="btn sm topbtn" disabled={!canUndo} onClick={onUndo} title="撤销上一次删除/导入（Cmd/Ctrl+Z）">
        撤销{canUndo && undoLabel ? `：${undoLabel}` : ''}
      </button>
      <button className="btn sm topbtn" onClick={onClose} title="关闭窗口">退出</button>
    </header>
  );
}
