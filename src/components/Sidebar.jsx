import { useState } from 'react';
import { LIBRARY_VIEWS } from '../lib/libraryDefs.js';

/**
 * 左侧边栏（v3.0 §13.4）：一次只显示一个功能；可收起；导航状态 section/tab 单一事实源（App 持有）。
 * props: { nav, setNav, hasProject, editingProfileName }
 */
const LIBRARY_GROUPS = [
  { label: '库', keys: ['quotas', 'shortlist', 'materials', 'machinePrices', 'instrumentPrices'] },
  { label: '映射关系', keys: ['rulesVariant', 'rulesAlt', 'quotaMachines', 'quotaInstruments'] },
];
const FEE_RULE_TABS = [
  { key: 'rates', label: '费率' },
  { key: 'table5fees', label: '表五费用' },
  { key: 'discount', label: '打折规则' },
  { key: 'rulesAlt', label: '关联规则' },
];
const CURRENT_ITEMS = [
  { key: 'info', label: '工程信息' },
  { key: 'workload-3a', label: '工作量 · 表三甲' },
  { key: 'workload-4a', label: '工作量 · 材料汇总' },
  { key: 'workload-equip', label: '工作量 · 安装设备' },
  { key: 'workload-3b', label: '工作量 · 机械' },
  { key: 'workload-3c', label: '工作量 · 仪器仪表' },
  { key: 'fee', label: '费用（表二）' },
  { key: 'table5', label: '表五' },
  { key: 'export', label: '报表导出' },
];

export default function Sidebar({ nav, setNav, hasProject, editingProfileName }) {
  const [collapsed, setCollapsed] = useState(false);
  const go = (section, tab = null) => setNav({ section, tab });
  const isCurrent = nav.section === 'current';
  if (collapsed) {
    return (
      <aside className="sidebar collapsed">
        <button className="btn sm" onClick={() => setCollapsed(false)} title="展开侧边栏">▶</button>
      </aside>
    );
  }
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span>导航</span>
        <button className="btn sm" onClick={() => setCollapsed(true)} title="收起侧边栏">◀</button>
      </div>
      <div className="sidebar-group">
        <button className={nav.section === 'projects' ? 'side-item active' : 'side-item'} onClick={() => go('projects')}>工程</button>
      </div>
      <div className="sidebar-group">
        <div className="side-label">当前工程 {!hasProject && <span className="muted">（先选工程）</span>}</div>
        {CURRENT_ITEMS.map((it) => (
          <button key={it.key} className={isCurrent && nav.tab === it.key ? 'side-item active indent' : 'side-item indent'}
            disabled={!hasProject} onClick={() => go('current', it.key)}>{it.label}</button>
        ))}
      </div>
      <div className="sidebar-group">
        <button className={nav.section === 'batch' ? 'side-item active' : 'side-item'} onClick={() => go('batch')}>批量生成</button>
      </div>
      <div className="sidebar-group">
        <div className="side-label">基础库</div>
        {LIBRARY_GROUPS.map((g) => (
          <div key={g.label}>
            <div className="side-sublabel">{g.label}</div>
            {LIBRARY_VIEWS.filter((v) => g.keys.includes(v.key)).map((v) => (
              <button key={v.key} className={nav.section === 'libraries' && nav.tab === v.key ? 'side-item active indent' : 'side-item indent'}
                onClick={() => go('libraries', v.key)}>{v.label}</button>
            ))}
          </div>
        ))}
        <div className="side-note">正在编辑方案：{editingProfileName || '—'}</div>
      </div>
      <div className="sidebar-group">
        <div className="side-label">取费规则</div>
        {FEE_RULE_TABS.map((t) => (
          <button key={t.key} className={nav.section === 'feeRules' && nav.tab === t.key ? 'side-item active indent' : 'side-item indent'}
            onClick={() => go('feeRules', t.key)}>{t.label}</button>
        ))}
        <div className="side-note">正在编辑方案：{editingProfileName || '—'}</div>
      </div>
      <div className="sidebar-group">
        <button className={nav.section === 'profiles' ? 'side-item active' : 'side-item'} onClick={() => go('profiles')}>配置方案</button>
        <button className={nav.section === 'settings' ? 'side-item active' : 'side-item'} onClick={() => go('settings')}>设置</button>
      </div>
    </aside>
  );
}
