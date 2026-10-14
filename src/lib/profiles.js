/**
 * 配置方案管理（v2，纯函数，无 Electron / DOM 依赖，主进程与渲染进程共用）
 *
 * 落地设计文档 §2（数据模型）、§4（迁移方案）、§2.4（取值优先级）、§3.3（db:savePatch）。
 * 增量 1 不碰计算引擎口径：本文件只做数据结构转换与补丁合并，不做任何费用计算。
 */
import { rateGridToRates, ratesToRateGrid } from '../engine/rates.mjs';
import { DEFAULT_NO_DISCOUNT_KEYS, DEFAULT_ZERO_AFTER_DISCOUNT_KEYS } from '../engine/discount.mjs';

export { DEFAULT_NO_DISCOUNT_KEYS, DEFAULT_ZERO_AFTER_DISCOUNT_KEYS };

export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const nowISO = () => new Date().toISOString();

/** 默认不打折清单（§6.2）：单一来源见 src/engine/discount.mjs，此处重导出（增量 2）。 */

/** 打折规则默认值（§2.2.1 discountRule）。 */
export function DEFAULT_DISCOUNT_RULE(discountRate = 1) {
  return {
    discountRate,
    noDiscountKeys: [...DEFAULT_NO_DISCOUNT_KEYS],
    zeroAfterDiscountKeys: [...DEFAULT_ZERO_AFTER_DISCOUNT_KEYS],
    methodText: {
      discounted: '{base}X{rate}%',
      restored: '{base}/{rate}%',
    },
  };
}

/**
 * 表五费用项默认值（§7.3，14 项）。
 * designTotal 的 basis 取 'sum'（= 5.1 + 5.2 之和，不独立取费；见增量 1 架构补充）。
 */
export function DEFAULT_TABLE5_FEES() {
  return [
    { key: 'landFee', name: '建设用地及综合赔补费', basis: 'manual', rate: 0, vatRate: 0, amount: null, enabled: true, order: 1, note: '默认空值' },
    { key: 'mgmt2', name: '项目建设管理费', basis: 'preDiscountExclTax', rate: 0.02, vatRate: 0.06, amount: null, enabled: true, order: 2, note: 'v1 公式保留' },
    { key: 'feasibilityFee', name: '可行性研究费', basis: 'manual', rate: 0, vatRate: 0, amount: null, enabled: true, order: 3, note: '默认空值' },
    { key: 'researchFee', name: '研究试验费', basis: 'manual', rate: 0, vatRate: 0, amount: null, enabled: true, order: 4, note: '默认空值' },
    { key: 'designTotal', name: '勘察设计费', basis: 'sum', rate: null, vatRate: 0.06, amount: null, enabled: true, order: 5, note: '5.1+5.2 之和，不独立取费' },
    { key: 'surveyFee', name: '其中：勘察费', basis: 'surveyKm', rate: null, vatRate: 0.06, amount: null, enabled: true, order: 5.1, note: 'v1 分段公式保留；勘察长度=测量类定额原量/10' },
    { key: 'designFee', name: '其中：设计费', basis: 'preDiscountExclTax', rate: 0.0495, vatRate: 0.06, amount: null, enabled: true, order: 5.2, note: 'exclTax × 0.045 × 1.1' },
    { key: 'envEvalFee', name: '环境影响评价费', basis: 'manual', rate: 0, vatRate: 0, amount: null, enabled: true, order: 6, note: '默认空值' },
    { key: 'supervisionFee', name: '建设工程监理费', basis: 'manual', rate: 0, vatRate: 0, amount: null, enabled: true, order: 7, note: '默认空值' },
    { key: 'safetyFee', name: '安全生产费', basis: 'preDiscountExclTax', rate: 0.02, vatRate: 0, amount: null, enabled: true, order: 8, note: '财资〔2022〕136号，通信工程 2%，增值税 0' },
    { key: 'importTechFee', name: '引进技术及进口设备其他费', basis: 'manual', rate: 0, vatRate: 0, amount: null, enabled: true, order: 9, note: '默认空值' },
    { key: 'insuranceFee', name: '工程保险费', basis: 'manual', rate: 0, vatRate: 0, amount: null, enabled: true, order: 10, note: '默认空值' },
    { key: 'tenderFee', name: '工程招标代理费', basis: 'manual', rate: 0, vatRate: 0, amount: null, enabled: true, order: 11, note: '默认空值' },
    { key: 'patentFee', name: '专利及专利技术使用费', basis: 'manual', rate: 0, vatRate: 0, amount: null, enabled: true, order: 12, note: '默认空值' },
    { key: 'otherFee', name: '其他费用', basis: 'manual', rate: 0, vatRate: 0, amount: null, enabled: true, order: 13, note: '默认空值' },
    { key: 'productionPrepFee', name: '生产准备及开办费(运营费)', basis: 'manual', rate: 0, vatRate: 0, amount: null, enabled: true, order: 14, note: '总计之后单独行，不计入总计' },
  ];
}

/**
 * 调遣费参数默认值（§2.2.1 dispatch；数值原样搬运自 v1 calc.mjs 的 DISPATCH_* 常量，增量 2 起由引擎消费）。
 */
export function DEFAULT_DISPATCH() {
  return {
    priceTable: [
      [0, 0], [35.0001, 141], [100.0001, 174], [200.0001, 240], [400.0001, 295],
      [600.0001, 356], [800.0001, 372], [1000.0001, 417], [1200.0001, 565],
      [1400.0001, 598], [1600.0001, 634],
    ],
    peopleEquip: [
      [0, 5], [500.0001, 10], [1000.0001, 17], [2000.0001, 24], [3000.0001, 30], [4000.0001, 35],
    ],
    peopleLine: [
      [0, 5], [500.0001, 10], [1000.0001, 17], [2000.0001, 24], [3000.0001, 30],
      [4000.0001, 35], [5000.0001, 40], [6000.0001, 45], [7000.0001, 50],
      [8000.0001, 55], [9000.0001, 60], [10000.0001, 80], [15000.0001, 95],
      [20000.0001, 105], [25000.0001, 120],
    ],
    extraPer200km: 48,
    extraPeopleStep: 3,
  };
}

/** 8 张库表的行 id 前缀（确定性生成，保证同输入同输出）。 */
const ID_PREFIX = {
  quotas: 'quota', shortlist: 'short', materials: 'mat', rules: 'rule',
  machinePrices: 'mach', instrumentPrices: 'inst', quotaMachines: 'qm', quotaInstruments: 'qi',
};

/** 给库表行补稳定 id（已有 id 保留；缺失时用确定性 <前缀>_<序号>）。 */
function withIds(rows, kind) {
  return (rows || []).map((r, i) => {
    const row = { ...r };
    if (row.id == null || row.id === '') row.id = `${ID_PREFIX[kind]}_${i}`;
    return row;
  });
}

/** 空费率（createProfile 无种子时使用：全部字段 0，winterRate null=查表）。 */

function buildProfile(input, { id, name, source, isBuiltIn, defaultInfo }) {
  const di = defaultInfo || {};
  const jiaTax = di.甲供增值税 ?? 0.13;
  const yiTax = di.乙供增值税 ?? 0.09;
  const ts = nowISO();
  return {
    id,
    name,
    description: '',
    createdAt: ts,
    updatedAt: ts,
    source,
    isBuiltIn: !!isBuiltIn,
    libraries: {
      quotas: withIds(input.quotas, 'quotas'),
      shortlist: withIds(input.shortlist, 'shortlist'),
      materials: withIds(input.materials, 'materials'),
      rules: withIds(input.rules, 'rules').map((r) => ({
        ...r,
        appliesTo: r.appliesTo ?? '全',
      })),
      machinePrices: withIds(input.machinePrices, 'machinePrices'),
      instrumentPrices: withIds(input.instrumentPrices, 'instrumentPrices'),
      quotaMachines: withIds(input.quotaMachines, 'quotaMachines'),
      quotaInstruments: withIds(input.quotaInstruments, 'quotaInstruments'),
    },
    rates: {
      byProjectType: input.rateGrid ? rateGridToRates(input.rateGrid) : {},
      winterTable: { ...(input.winterTable || {}) },
      vatRates: { jiaTax, yiTax, outputTax: yiTax, safetyVat: 0 },
    },
    discountRule: DEFAULT_DISCOUNT_RULE(di.施工折扣 ?? 1),
    table5Fees: DEFAULT_TABLE5_FEES(),
    dispatch: DEFAULT_DISPATCH(),
  };
}

/**
 * seed.json（v1 形状）-> 配置方案。
 * 显式忽略 seed.infoDefaults（§2.4：母版残留值不作为计算默认值），默认值取 opts.defaultInfo。
 */
export function seedToProfile(seed, name = '默认配置', opts = {}) {
  const s = seed || {};
  const materials = [
    ...(s.materials_jia || []).map((m, i) => ({ ...m, id: `jia${i}`, supply: '甲供' })),
    ...(s.materials_yi || []).map((m, i) => ({ ...m, id: `yi${i}`, supply: '乙供' })),
    ...(s.materials_equip || []).map((m, i) => ({ ...m, id: `eq${i}`, supply: '设备' })),
  ];
  return buildProfile(
    {
      quotas: s.quotas || [],
      shortlist: s.shortlist || [],
      materials,
      rules: s.rules || [],
      rateGrid: s.rateGrid || null,
      winterTable: s.winterTable || {},
      machinePrices: s.machinePrices || [],
      instrumentPrices: s.instrumentPrices || [],
      quotaMachines: s.quotaMachines || [],
      quotaInstruments: s.quotaInstruments || [],
    },
    {
      id: opts.id || 'prof_default',
      name,
      source: opts.source || 'seed',
      isBuiltIn: opts.isBuiltIn ?? true,
      defaultInfo: opts.defaultInfo || { 施工折扣: 1, 甲供增值税: 0.13, 乙供增值税: 0.09 },
    },
  );
}

/**
 * v1 libraries（defaultDb() / v1 db 顶层 libraries 形状）-> 配置方案。
 * materials / rules 保留 v1 已有 id；其余表补确定性 id。
 */
export function v1LibrariesToProfile(libraries, settings, opts = {}) {
  const L = libraries || {};
  return buildProfile(
    {
      quotas: L.quotas || [],
      shortlist: L.shortlist || [],
      materials: L.materials || [],
      rules: L.rules || [],
      rateGrid: L.rateGrid || null,
      winterTable: L.winterTable || {},
      machinePrices: L.machinePrices || [],
      instrumentPrices: L.instrumentPrices || [],
      quotaMachines: L.quotaMachines || [],
      quotaInstruments: L.quotaInstruments || [],
    },
    {
      id: opts.id || 'prof_default',
      name: opts.name || '默认配置',
      source: opts.source || 'migrated-v1',
      isBuiltIn: opts.isBuiltIn ?? true,
      defaultInfo: settings?.defaultInfo || { 施工折扣: 1, 甲供增值税: 0.13, 乙供增值税: 0.09 },
    },
  );
}

/**
 * 单工程迁移（§4.2 步骤 3）。
 * rateOverrides：v1 零散字段原样保留；taxRate 同步为 yiTax/outputTax（仅当后两者为空时）。
 */
export function migrateProject(project) {
  const p = { ...(project || {}) };
  p.profileId = p.profileId || 'prof_default';
  p.quantities = (p.quantities || []).map((q, i) => {
    const row = { ...q };
    if (row.id == null || row.id === '') row.id = `qty_${i}`;
    return row;
  });
  const ro = { ...(p.rateOverrides || {}) };
  if (ro.taxRate != null) {
    if (ro.yiTax == null) ro.yiTax = ro.taxRate;
    if (ro.outputTax == null) ro.outputTax = ro.taxRate;
  }
  p.rateOverrides = ro;
  if (!Array.isArray(p.table5Overrides)) p.table5Overrides = [];
  if (!Array.isArray(p.warningsDismissed)) p.warningsDismissed = [];
  return p;
}

/** v1 db -> v2 db（纯函数，§4.2 步骤 1–5；写回由调用方执行）。 */
export function migrateV1ToV2(v1db) {
  const v1 = v1db || {};
  const profile = v1LibrariesToProfile(v1.libraries || {}, v1.settings || {});
  const settings = clone(v1.settings || {});
  settings.activeProfileId = 'prof_default';
  if (!settings.defaultInfo) {
    settings.defaultInfo = {
      工程类型: '通信线路工程', 施工折扣: 1, 施工距离: '35KM以内',
      施工调遣分类: '施工队伍调遣人数(线路、管道）',
      冬雨季施工费: 'Ⅲ类地区', 甲供增值税: 0.13, 乙供增值税: 0.09,
    };
  }
  return {
    version: 2,
    configurationProfiles: [profile],
    projects: (v1.projects || []).map(migrateProject),
    settings,
    v1Backup: { migratedAt: nowISO(), v1Db: clone(v1) },
    meta: { saveVersion: 0 },
  };
}

/** 迁移自检（§4.4 结构自检；计算自检由调用方/测试做，见 tests/migration.test.mjs）。 */
export function migrateSelfCheck(v1db, v2db) {
  const failures = [];
  const v1 = v1db || {};
  const v2 = v2db || {};
  if (v2.version !== 2) failures.push('version 应为 2');
  if ('libraries' in v2) failures.push('v2 不应保留顶层 libraries');
  const profiles = v2.configurationProfiles || [];
  if (profiles.length !== 1) failures.push(`configurationProfiles 应为 1 条，实际 ${profiles.length}`);
  const profile = profiles[0];
  if (profile) {
    if (profile.name !== '默认配置') failures.push(`方案名应为“默认配置”，实际 ${profile.name}`);
    if (profile.id !== 'prof_default') failures.push(`方案 id 应为 prof_default，实际 ${profile.id}`);
    const tables = ['quotas', 'shortlist', 'materials', 'rules', 'machinePrices', 'instrumentPrices', 'quotaMachines', 'quotaInstruments'];
    for (const t of tables) {
      const a = (v1.libraries?.[t] || []).length;
      const b = (profile.libraries?.[t] || []).length;
      if (a !== b) failures.push(`库表 ${t} 行数不一致：v1=${a} v2=${b}`);
    }
    // 费率全量对照：具名费率必须等于 rateGrid 转换结果
    const expectRates = rateGridToRates(v1.libraries?.rateGrid || []);
    if (JSON.stringify(profile.rates?.byProjectType) !== JSON.stringify(expectRates)) {
      failures.push('rates.byProjectType 与 rateGrid 转换结果不一致');
    }
    // 全部行 id 唯一且非空
    for (const t of tables) {
      const ids = (profile.libraries?.[t] || []).map((r) => r.id);
      if (ids.some((x) => x == null || x === '')) failures.push(`库表 ${t} 存在空 id`);
      if (new Set(ids).size !== ids.length) failures.push(`库表 ${t} 存在重复 id`);
    }
  }
  for (const p of v2.projects || []) {
    if (!p.profileId) failures.push(`工程 ${p.id || p.name} 缺少 profileId`);
    const ids = (p.quantities || []).map((q) => q.id);
    if (ids.some((x) => x == null || x === '')) failures.push(`工程 ${p.name} 工程量存在空 id`);
    if (new Set(ids).size !== ids.length) failures.push(`工程 ${p.name} 工程量存在重复 id`);
  }
  if (v2.settings?.activeProfileId !== 'prof_default') failures.push('settings.activeProfileId 应为 prof_default');
  if (!v2.v1Backup?.v1Db) failures.push('缺少 v1Backup');
  else if (JSON.stringify(v2.v1Backup.v1Db) !== JSON.stringify(v1)) failures.push('v1Backup 与 v1 原数据不一致');
  return { ok: failures.length === 0, failures };
}

/** 按 id 取方案；找不到返回 null（调用方决定是否回落）。 */
export function getProfile(db, profileId) {
  if (!db || !profileId) return null;
  return (db.configurationProfiles || []).find((p) => p.id === profileId) || null;
}

/** 激活方案：settings.activeProfileId 命中失败时回落到第 1 个方案。 */
export function activeProfile(db) {
  if (!db) return null;
  return getProfile(db, db.settings?.activeProfileId)
    || (db.configurationProfiles || [])[0]
    || null;
}

/**
 * 取库表集合：v2 按方案取（projectOrProfileId 可为工程对象 / 方案 id / 省略取激活方案），
 * v1 db 取顶层 db.libraries（兼容分支）。
 */
export function profileLibraries(db, projectOrProfileId) {
  if (!db) return null;
  if (db.configurationProfiles) {
    let profile = null;
    if (projectOrProfileId && typeof projectOrProfileId === 'object') {
      profile = getProfile(db, projectOrProfileId.profileId) || activeProfile(db);
    } else if (typeof projectOrProfileId === 'string') {
      profile = getProfile(db, projectOrProfileId) || activeProfile(db);
    } else {
      profile = activeProfile(db);
    }
    return profile?.libraries || null;
  }
  return db.libraries || null;
}

/**
 * 方案 -> calcProject 的 libs（§3.1.1）。
 * rateGrid 为兼容垫片：v1 引擎仍读 rateGrid，增量 2 引擎切换为直接读 rates 后可删除该字段。
 */
export function profileToLibs(profile) {
  if (!profile) return null;
  return {
    quotas: profile.libraries?.quotas || [],
    materials: profile.libraries?.materials || [],
    rules: profile.libraries?.rules || [],
    shortlist: profile.libraries?.shortlist || [],
    machinePrices: profile.libraries?.machinePrices || [],
    instrumentPrices: profile.libraries?.instrumentPrices || [],
    quotaMachines: profile.libraries?.quotaMachines || [],
    quotaInstruments: profile.libraries?.quotaInstruments || [],
    rates: profile.rates || null,
    winterTable: profile.rates?.winterTable || {},
    discountRule: profile.discountRule || null,
    table5Fees: profile.table5Fees || [],
    dispatch: profile.dispatch || null,
    rateGrid: ratesToRateGrid(profile.rates),
  };
}

/**
 * 取值优先级（§2.4）：工程 rateOverrides（非 null）> 工程 info > 配置方案 rates/discountRule > 兜底。
 */
export function resolveRates(profile, project) {
  const info = project?.info || {};
  const ro = project?.rateOverrides || {};
  const vat = profile?.rates?.vatRates || {};
  const rule = profile?.discountRule || {};
  const pick = (roVal, infoVal, profileVal, fallback) => {
    if (roVal != null) return roVal;
    if (infoVal != null) return infoVal;
    if (profileVal != null) return profileVal;
    return fallback;
  };
  return {
    discount: pick(ro.discount, info.施工折扣, rule.discountRate, 1),
    jiaTax: pick(ro.jiaTax, info.甲供增值税, vat.jiaTax, 0.13),
    yiTax: pick(ro.yiTax ?? ro.taxRate, info.乙供增值税, vat.yiTax, 0.09),
    outputTax: pick(ro.outputTax ?? ro.taxRate, info.乙供增值税, vat.outputTax ?? vat.yiTax, 0.09),
    safetyVat: pick(ro.safetyVat, undefined, vat.safetyVat, 0),
  };
}

/**
 * 增量保存：把 patch 合并进 db（纯函数，§3.3 db:savePatch）。
 * patch 键白名单：profile / project / configurationProfiles / projects / settings / settingsPatch。
 * baseVersion 与 db.meta.saveVersion 不匹配时返回冲突，不改数据。
 */
export function applySavePatch(db, args = {}) {
  const { profileId, projectId, patch, baseVersion } = args;
  const current = db?.meta?.saveVersion ?? 0;
  if (baseVersion != null && baseVersion !== current) {
    return { ok: false, conflict: true, version: current };
  }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, error: 'patch 必须为对象', version: current };
  }
  const allowed = new Set(['profile', 'project', 'configurationProfiles', 'projects', 'settings', 'settingsPatch']);
  for (const k of Object.keys(patch)) {
    if (!allowed.has(k)) return { ok: false, error: `未知补丁键：${k}`, version: current };
  }
  const next = clone(db || {});
  if (!next.configurationProfiles) next.configurationProfiles = [];
  if (!Array.isArray(next.projects)) next.projects = [];
  if (!next.settings) next.settings = {};

  if (patch.profile != null) {
    const id = profileId || patch.profile.id;
    const idx = next.configurationProfiles.findIndex((p) => p.id === id);
    if (idx < 0) return { ok: false, error: `配置方案不存在：${id}`, version: current };
    next.configurationProfiles[idx] = {
      ...clone(patch.profile), id: next.configurationProfiles[idx].id, updatedAt: nowISO(),
    };
  }
  if (patch.project != null) {
    const id = projectId || patch.project.id;
    const idx = next.projects.findIndex((p) => p.id === id);
    if (idx < 0) return { ok: false, error: `工程不存在：${id}`, version: current };
    next.projects[idx] = {
      ...clone(patch.project), id: next.projects[idx].id, updatedAt: nowISO(),
    };
  }
  if (patch.configurationProfiles != null) {
    if (!Array.isArray(patch.configurationProfiles)) return { ok: false, error: 'configurationProfiles 必须为数组', version: current };
    next.configurationProfiles = clone(patch.configurationProfiles);
  }
  if (patch.projects != null) {
    if (!Array.isArray(patch.projects)) return { ok: false, error: 'projects 必须为数组', version: current };
    next.projects = clone(patch.projects);
  }
  if (patch.settings != null) {
    if (typeof patch.settings !== 'object' || Array.isArray(patch.settings)) {
      return { ok: false, error: 'settings 必须为对象', version: current };
    }
    next.settings = clone(patch.settings);
  }
  if (patch.settingsPatch != null) {
    if (typeof patch.settingsPatch !== 'object' || Array.isArray(patch.settingsPatch)) {
      return { ok: false, error: 'settingsPatch 必须为对象', version: current };
    }
    next.settings = { ...next.settings, ...clone(patch.settingsPatch) };
  }
  const version = current + 1;
  next.meta = { ...(next.meta || {}), saveVersion: version };
  return { ok: true, version, db: next };
}

/** 配置方案导出文件（§4.5）：格式版本号 profileFormat: 1。 */
export function exportProfile(profile) {
  return { profileFormat: 1, exportedAt: nowISO(), profile: clone(profile) };
}

/** 配置方案导入：校验格式 + 必备字段；成功赋新 id、source='imported'。失败抛 Error。 */
export function importProfile(json) {
  if (!json || typeof json !== 'object') throw new Error('方案文件不是有效 JSON 对象');
  if (json.profileFormat !== 1) throw new Error(`不支持的方案格式版本：${json.profileFormat}（期望 1）`);
  const p = json.profile;
  if (!p || typeof p !== 'object') throw new Error('方案文件缺少 profile 字段');
  if (!p.libraries || typeof p.libraries !== 'object') throw new Error('方案缺少 libraries');
  const tables = ['quotas', 'shortlist', 'materials', 'rules', 'machinePrices', 'instrumentPrices', 'quotaMachines', 'quotaInstruments'];
  for (const t of tables) {
    if (!Array.isArray(p.libraries[t])) throw new Error(`方案 libraries.${t} 必须为数组`);
  }
  if (!p.rates || typeof p.rates.byProjectType !== 'object') throw new Error('方案缺少 rates.byProjectType');
  if (!p.name || typeof p.name !== 'string') throw new Error('方案缺少 name');
  const ts = nowISO();
  return {
    ...clone(p),
    id: uid(),
    name: p.name,
    source: 'imported',
    isBuiltIn: false,
    createdAt: ts,
    updatedAt: ts,
  };
}

/** 新建空白方案（增量 4 配置方案管理页使用；本增量提供纯函数）。 */
export function createProfile(name, seedLibs) {
  if (seedLibs) {
    return seedToProfile(seedLibs, name, {
      id: uid(), source: 'user-created', isBuiltIn: false,
      defaultInfo: { 施工折扣: 1, 甲供增值税: 0.13, 乙供增值税: 0.09 },
    });
  }
  const ts = nowISO();
  return {
    id: uid(),
    name,
    description: '',
    createdAt: ts,
    updatedAt: ts,
    source: 'user-created',
    isBuiltIn: false,
    libraries: {
      quotas: [], shortlist: [], materials: [], rules: [],
      machinePrices: [], instrumentPrices: [], quotaMachines: [], quotaInstruments: [],
    },
    rates: {
      byProjectType: {},
      winterTable: { 'Ⅰ类地区': 0.036, 'Ⅱ类地区': 0.025, 'Ⅲ类地区': 0.018 },
      vatRates: { jiaTax: 0.13, yiTax: 0.09, outputTax: 0.09, safetyVat: 0 },
    },
    discountRule: DEFAULT_DISCOUNT_RULE(1),
    table5Fees: DEFAULT_TABLE5_FEES(),
    dispatch: DEFAULT_DISPATCH(),
  };
}

/** 复制方案：新 id、名 +“（副本）”、isBuiltIn=false，与原方案数据隔离。 */
export function duplicateProfile(profile) {
  const copy = clone(profile);
  copy.id = uid();
  copy.name = `${profile.name}（副本）`;
  copy.source = 'user-created';
  copy.isBuiltIn = false;
  const ts = nowISO();
  copy.createdAt = ts;
  copy.updatedAt = ts;
  return copy;
}
