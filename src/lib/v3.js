/**
 * v3.0 纯逻辑（§13 / §13.11）：导航、费率树、表五公式、保存状态、导出勾选、工程信息派生。
 * 无 React / Electron / DOM 依赖，可在 Node 直测；UI 组件只消费这里的函数。
 */
import { DISCOUNT_LINE_DEFS } from '../engine/discount.mjs';
import { RATE_FIELD_DEFS } from '../engine/rates.mjs';

// ---------------------------------------------------------------- 导出勾选
/** 11 张表（与 electron/printExport.cjs 的 SHEET_ORDER 一致；此处为渲染侧单一来源）。 */
export const SHEET_NAMES = [
  '报表封面',
  '编制说明',
  '建设项目总算表(汇总表)',
  '工程总表(表一)',
  '工程费用表(表二)',
  '工程费用表(表二)折前',
  '工程量表(表三)甲',
  '机械台班表(表三)乙',
  '仪器仪表使用表(表三)丙',
  '主要材料表(表四)甲',
  '工程其他费用表(表五)甲',
];
/** 导出勾选左树分组（§13.11 P12 左树勾选结构）。 */
export const EXPORT_GROUPS = [
  { id: 'cover', label: '封面与说明', sheets: ['报表封面', '编制说明'] },
  { id: 'total', label: '汇总与总表', sheets: ['建设项目总算表(汇总表)', '工程总表(表一)'] },
  { id: 't2', label: '费用表（表二）', sheets: ['工程费用表(表二)', '工程费用表(表二)折前'] },
  { id: 't3', label: '工程量与台班（表三）', sheets: ['工程量表(表三)甲', '机械台班表(表三)乙', '仪器仪表使用表(表三)丙'] },
  { id: 't4', label: '材料（表四）', sheets: ['主要材料表(表四)甲'] },
  { id: 't5', label: '其他费用（表五）', sheets: ['工程其他费用表(表五)甲'] },
];
export const defaultExportSelection = () => [...SHEET_NAMES];
/** 解析 settings.exportSelection：非法/缺失 → 全选；过滤掉不在 11 张表内的条目。 */
export function resolveExportSelection(settings) {
  const sel = settings?.exportSelection;
  if (!Array.isArray(sel)) return defaultExportSelection();
  const kept = sel.filter((s) => SHEET_NAMES.includes(s));
  return kept.length ? kept : defaultExportSelection();
}
/** 勾选切换（单张表）：全取消时保留空数组（导出按钮置灰，调用方处理）。 */
export function toggleExportSelection(selection, sheet) {
  const set = new Set(selection || []);
  if (set.has(sheet)) set.delete(sheet); else set.add(sheet);
  return SHEET_NAMES.filter((s) => set.has(s));
}
/** 勾选切换（整组）：组内全选 → 全取消；否则全选该组。 */
export function toggleExportGroup(selection, groupSheets) {
  const set = new Set(selection || []);
  const all = groupSheets.every((s) => set.has(s));
  for (const s of groupSheets) { if (all) set.delete(s); else set.add(s); }
  return SHEET_NAMES.filter((s) => set.has(s));
}

// ---------------------------------------------------------------- 配置方案：编辑目标 vs 新建默认
/** 编辑目标方案 id：editingProfileId 命中失败 → 回落 activeProfileId → 第一个方案（§13.8）。 */
export function resolveEditingProfileId(db) {
  const ids = new Set((db?.configurationProfiles || []).map((p) => p.id));
  const editing = db?.settings?.editingProfileId;
  if (editing && ids.has(editing)) return editing;
  const active = db?.settings?.activeProfileId;
  if (active && ids.has(active)) return active;
  return db?.configurationProfiles?.[0]?.id || null;
}
export function resolveEditingProfile(db) {
  const id = resolveEditingProfileId(db);
  return (db?.configurationProfiles || []).find((p) => p.id === id) || null;
}
/** 置编辑目标（纯函数：返回新 settings，不碰 activeProfileId）。 */
export function setEditingProfileId(settings, profileId) {
  return { ...(settings || {}), editingProfileId: profileId };
}

// ---------------------------------------------------------------- 导航与底栏提示
/** 导航状态（§13.4）：section + tab 单一事实源。 */
export const NAV_SECTIONS = ['projects', 'current', 'batch', 'libraries', 'feeRules', 'profiles', 'settings'];
export const CURRENT_TABS = ['info', 'workload-3a', 'workload-4a', 'workload-equip', 'workload-3b', 'workload-3c', 'fee', 'table5', 'export'];
/** 底栏操作提示（§13.11.5），随视图变化。 */
export function statusHintFor(nav) {
  const map = {
    projects: '点工程名打开工程；勾选后可批量导出/删除',
    info: '填写工程信息；取费标准切换即切换工程所用配置方案',
    'workload-3a': '输定额编号回车下一行；数量填 0 即不计',
    'workload-4a': '数量 = 自动计算 ＋ 手动调整；单价只影响本工程',
    'workload-equip': '仅显示 supply = 设备 的材料行',
    'workload-3b': '机械台班由定额—机械映射自动汇总',
    'workload-3c': '仪器仪表台班由定额—仪表映射自动汇总',
    fee: '点左树切换费用组；费率可直接在右表编辑',
    table5: '勾选启用/停用费用项；手动项金额可覆盖',
    export: '勾选要出的表后点导出',
    batch: '批量新建 / 导入 / 导出 / 改价 / 改折扣 / 删除',
    libraries: '编辑的是“正在编辑方案”的库，不影响新建默认方案',
    feeRules: '点左树切换费用组；费率可直接在右表编辑',
    profiles: '编辑内容置编辑目标；设为默认只影响新建工程',
    settings: '整库备份 / 导入导出',
  };
  if (nav?.section === 'current') return map[nav.tab] || '';
  return map[nav?.section] || '';
}

// ---------------------------------------------------------------- 工程列表：最近置顶
/** 按 lastOpenedAt 降序；无 lastOpenedAt 的保持原有相对顺序排在后面（§13.2）。 */
export function sortProjectsRecent(projects) {
  const withTs = [];
  const without = [];
  for (const p of projects || []) {
    if (typeof p.lastOpenedAt === 'number') withTs.push(p); else without.push(p);
  }
  withTs.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  return [...withTs, ...without];
}

// ---------------------------------------------------------------- 工程信息：打折单选派生
/** 打折选项派生（§13.11.3）：施工折扣 = 1 → 不打折，否则打折；不新增数据字段。 */
export function discountOption(info) {
  const d = info?.施工折扣;
  return (typeof d === 'number' && d !== 1) ? 'discount' : 'noDiscount';
}
/**
 * 应用打折单选：'noDiscount' → 施工折扣 = 1；
 * 'discount' → 恢复上次折扣率 lastRate（合法 (0,1)），无上次折扣率时不改值、返回 needsInput=true 由界面提示输入。
 */
export function applyDiscountOption(info, option, lastRate) {
  const next = { ...(info || {}) };
  if (option === 'noDiscount') { next.施工折扣 = 1; return { info: next, needsInput: false }; }
  if (typeof lastRate === 'number' && lastRate > 0 && lastRate < 1) {
    next.施工折扣 = lastRate;
    return { info: next, needsInput: false };
  }
  if (typeof next.施工折扣 === 'number' && next.施工折扣 !== 1) return { info: next, needsInput: false };
  return { info: next, needsInput: true };
}
/** 切换工程所用配置方案（纯函数：改 profileId，调用方负责确认与重算）。 */
export function switchProjectProfile(project, profileId) {
  return { ...project, profileId };
}

// ---------------------------------------------------------------- 定额联想
/** 定额编号联想：常用短单在前、全库在后，按 code+name 去重，上限 50（§13.5）。 */
export function quotaSuggestions(libs, keyword, limit = 50) {
  const kw = (keyword || '').trim();
  if (!kw) return [];
  const inShort = (libs?.shortlist || []).filter((r) => r.code?.includes(kw) || r.name?.includes(kw));
  const seen = new Set(inShort.map((r) => `${r.code}|${r.name}`));
  const inFull = (libs?.quotas || []).filter((r) => (r.code?.includes(kw) || r.name?.includes(kw))
    && !seen.has(`${r.code}|${r.name}`));
  return [...inShort, ...inFull].slice(0, limit);
}

// ---------------------------------------------------------------- 取费左树（§13.11.2）
/**
 * 左树：由表二费用结构派生（DISCOUNT_LINE_DEFS 全覆盖：每个 leaf key 恰好出现一次）。
 * 节点：{ id, label, kind: 'group' | 'leaf', key?, children? }；叶子 key 即表二 key。
 */
const leaf = (key) => {
  const def = DISCOUNT_LINE_DEFS.find((d) => d.key === key);
  return { id: `leaf:${key}`, label: def?.label || key, kind: 'leaf', key };
};
const group = (id, label, children) => ({ id, label, kind: 'group', children });
export const FEE_TREE = group('root:all', '建筑安装工程费', [
  group('g:direct', '直接费', [
    group('g:labor', '人工费', [leaf('techFee'), leaf('laborFee'), leaf('laborTotal')]),
    group('g:material', '材料费', [leaf('jiaMat'), leaf('yiMat'), leaf('mainMat'), leaf('auxMat'), leaf('matTotal')]),
    group('g:machine', '机械使用费', [leaf('machineFee')]),
    group('g:instrument', '仪器仪表费', [leaf('instrumentFee')]),
    group('g:directFee', '直接工程费', [leaf('directFee')]),
  ]),
  group('g:measure', '措施费', [
    leaf('envFee'), leaf('civilFee'), leaf('carryFee'), leaf('disturbFee'), leaf('handoverFee'),
    leaf('tempFee'), leaf('vehicleFee'), leaf('nightFee'), leaf('winterFee'), leaf('toolFee'),
    leaf('utilityFee'), leaf('specialFee'), leaf('protectFee'), leaf('earthFee'), leaf('dispatchFee'),
    leaf('bigMachineFee'), leaf('measureFee'),
  ]),
  group('g:directTotal', '直接费合计', [leaf('directTotal')]),
  group('g:reg', '规费', [leaf('sewageFee'), leaf('socialFee'), leaf('housingFee'), leaf('accidentFee'), leaf('regFee')]),
  group('g:mgmt', '企业管理费', [leaf('mgmtFee')]),
  group('g:indirect', '间接费', [leaf('indirectTotal')]),
  group('g:profit', '利润', [leaf('profit')]),
  group('g:tax', '税金', [leaf('outputTax')]),
  group('g:total', '合计', [leaf('exclTax'), leaf('inclTax')]),
]);
/** 按 id 找树节点（找不到返回 null）。 */
export function findFeeNode(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  for (const c of node.children || []) {
    const hit = findFeeNode(c, id);
    if (hit) return hit;
  }
  return null;
}
/** 节点下全部叶子 key（叶子节点自身返回 [key]）。 */
export function feeLeavesOf(node) {
  if (!node) return [];
  if (node.kind === 'leaf') return [node.key];
  return (node.children || []).flatMap(feeLeavesOf);
}
/** 费率 key → 费率字段（rates.byProjectType[工程类型] 内）；无对应费率的项返回 null。 */
export const FEE_RATE_FIELD = {
  techFee: 'techPrice', laborFee: 'laborPrice', auxMat: 'auxRate',
  envFee: 'envRate', civilFee: 'civilRate', carryFee: 'carryRate', disturbFee: 'disturbRate',
  handoverFee: 'handoverRate', tempFee: 'tempNearRate', vehicleFee: 'vehicleRate',
  nightFee: 'nightRate', winterFee: 'winterRate', toolFee: 'toolRate', utilityFee: 'utilityRate',
  protectFee: 'protectRate', socialFee: 'socialRate', housingFee: 'housingRate',
  accidentFee: 'accidentRate', mgmtFee: 'mgmtRate', profit: 'profitRate',
};
/** 计算式（依据）文本：取 DISCOUNT_LINE_DEFS 的 methodBefore，用费率占位符填充。 */
export function feeBasisText(key, vars) {
  const def = DISCOUNT_LINE_DEFS.find((d) => d.key === key);
  if (!def?.methodBefore) return '';
  return def.methodBefore.replace(/\{(\w+)\}/g, (_, k) => {
    if (k === 'discountPct') {
      const r = vars?.discountRate;
      return typeof r === 'number' ? String(Number((r * 100).toFixed(4))) : `{${k}}`;
    }
    const v = vars?.[k];
    if (v == null) return `{${k}}`;
    // 费率占位符显示为百分比数字（如 auxRate 0.003 → 0.3），价格占位符原样显示。
    if (String(k).endsWith('Rate') && k !== 'discountRate') return String(Number((v * 100).toFixed(4)));
    return String(v);
  });
}
/**
 * 右表行：点树节点 → 该组费用项，列：费用名称 / 计算基数 / 费率 / 金额 / 计算式。
 * 金额取 result.table2Before（折前）；费率取 profile.rates.byProjectType[projectType]。
 */
export function feeRowsForNode(nodeId, { profile, result, projectType } = {}) {
  const node = findFeeNode(FEE_TREE, nodeId);
  if (!node) return [];
  const rates = profile?.rates?.byProjectType?.[projectType] || {};
  const winterTable = profile?.rates?.winterTable || {};
  const vars = { ...rates, discountRate: profile?.discountRule?.discountRate ?? 1 };
  // 方法模板用 {tempRate}；费率模型存 tempNearRate / tempFarRate，展示取 tempNearRate。
  if (vars.tempRate == null) vars.tempRate = rates.tempNearRate ?? null;
  // winterRate：null = 按 winterTable 查（以 Ⅲ类地区为默认展示口径，与 rates.mjs 一致）。
  if (vars.winterRate == null) vars.winterRate = winterTable['Ⅲ类地区'] ?? null;
  return feeLeavesOf(node).map((key) => {
    const def = DISCOUNT_LINE_DEFS.find((d) => d.key === key);
    const rateField = FEE_RATE_FIELD[key] || null;
    let rate = rateField ? rates[rateField] ?? null : null;
    if (key === 'winterFee') rate = vars.winterRate;
    const basis = feeBasisText(key, vars);
    // 计算基数 = 方法模板中第一个 X 之前的部分（如“人工费X3%”→“人工费”）；无 X 则为模板全文。
    const base = basis.includes('X') ? basis.split('X')[0] : basis;
    return {
      key,
      name: def?.label || key,
      basis,
      base,
      rate,
      rateField,
      amount: result?.table2Before?.[key] ?? null,
    };
  });
}
/** 费率字段元数据（供费率编辑写回 rates.byProjectType 用）。 */
export function rateFieldDef(key) {
  return RATE_FIELD_DEFS.find((d) => d.key === key) || null;
}

// ---------------------------------------------------------------- 表五公式（§13.11.4）
const pctText = (rate) => {
  if (typeof rate !== 'number') return '';
  const v = Number((rate * 100).toFixed(4));
  return `${v}%`;
};
/**
 * 表五公式列：由 table5Fees 的 basis + rate + 取费基数说明生成。
 * manual → “手动输入”；safetyFee → “折前建安工程费除税价 × {rate}%”。
 */
export function table5Formula(fee) {
  if (!fee) return '';
  if (fee.basis === 'manual') return '手动输入';
  if (fee.key === 'safetyFee') return `折前建安工程费除税价 × ${pctText(fee.rate)}`;
  switch (fee.basis) {
    case 'preDiscountExclTax': return `折前建安工程费除税价 × ${pctText(fee.rate)}`;
    case 'afterDiscountExclTax': return `折后建安工程费除税价 × ${pctText(fee.rate)}`;
    case 'laborTotal': return `人工费 × ${pctText(fee.rate)}`;
    case 'fixed': return fee.amount != null ? `固定金额 ${fee.amount}` : '固定金额';
    case 'surveyKm': return '按勘察长度分段计取';
    case 'sum': return '子项之和';
    default: return fee.note || '';
  }
}
/**
 * 表五视图行：全量费用项（不只手动项），列：费用名称 / 计算基数 / 费率 / 金额 / 公式 / 启用。
 * 金额取 result.table5.rows（引擎已含 overrides 覆盖）；启用 = override.enabled ?? fee.enabled。
 * 注意：引擎不输出 enabled=false 的行；此处以配置项为准补回停用行（金额为空，启用=false）。
 */
export function buildTable5ViewRows(profile, project, result) {
  const fees = [...(profile?.table5Fees || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const byKey = new Map((result?.table5?.rows || []).map((r) => [r.key, r]));
  const overrides = new Map(((project?.table5Overrides) || []).map((o) => [o.key, o]));
  return fees.map((fee) => {
    const ov = overrides.get(fee.key);
    const enabled = ov?.enabled ?? fee.enabled ?? true;
    const row = byKey.get(fee.key);
    return {
      key: fee.key,
      name: fee.name,
      basis: fee.basis,
      rate: fee.rate ?? null,
      amount: enabled && row ? (row.excl ?? row.amount ?? null) : null,
      formula: table5Formula(fee),
      enabled,
    };
  });
}

// ---------------------------------------------------------------- 保存状态（§13.7）
/**
 * 保存状态机：saved（已保存/已自动保存）| dirty（● 未保存）| saving（保存中…）。
 * state: { status, at: 'HH:MM' | null, auto: bool }
 */
export function saveStatusInitial() {
  return { status: 'saved', at: null, auto: false };
}
export function saveStatusTransition(state, event) {
  const cur = state || saveStatusInitial();
  if (event === 'edit') return { status: 'dirty', at: cur.at, auto: false };
  if (event === 'saveStart') return cur.status === 'dirty' ? { status: 'saving', at: cur.at, auto: false } : cur;
  if (event === 'saveDone') return { status: 'saved', at: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }), auto: false };
  if (event === 'autoSaveDone') return { status: 'saved', at: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }), auto: true };
  return cur;
}
export function saveStatusText(state) {
  const cur = state || saveStatusInitial();
  if (cur.status === 'dirty') return '● 未保存';
  if (cur.status === 'saving') return '保存中…';
  if (cur.status === 'saved' && cur.at) return cur.auto ? `已自动保存 ${cur.at}` : `✓ 已保存 ${cur.at}`;
  return '✓ 已保存';
}
