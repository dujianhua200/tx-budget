/**
 * 底栏（v3.0 §13.11.5）：操作提示（随视图变化）+ 当前工程 / 方案 / 选中行计数。
 */
export default function StatusBar({ hint, projectName, profileName, selectedCount }) {
  return (
    <footer className="statusbar">
      <span className="status-hint">{hint}</span>
      <span className="status-right">
        {projectName ? `工程：${projectName}` : '未打开工程'}
        {profileName ? ` · 方案：${profileName}` : ''}
        {typeof selectedCount === 'number' ? ` · 选中 ${selectedCount} 行` : ''}
      </span>
    </footer>
  );
}
