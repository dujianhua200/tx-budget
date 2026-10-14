/**
 * 费率模型（v2，纯函数，无依赖）
 *
 * 具名字段替代 v1 rateGrid 魔法下标（§2.2.1、§10 B8）。
 * PROJECT_TYPES 顺序与 calc.mjs 一致，对应 rateGrid 列 G..K（下标 6..10）。
 */

export const PROJECT_TYPES = [
  '无线通信设备安装工程',
  '通信电源设备安装工程',
  '有线通信设备安装工程',
  '通信线路工程',
  '通信管道工程',
];

/**
 * 具名费率字段定义。gridN = v1 RATE_ITEMS 的 HLOOKUP 行号 n（rateGrid 行下标 = n + 1）。
 * taxRate（n=26）不在 defs 中：增值税率由 rates.vatRates 承载（见 §2.2.1）。
 */
export const RATE_FIELD_DEFS = [
  { key: 'techPrice', name: '技工费', unit: '元/工日', gridN: 3 },
  { key: 'laborPrice', name: '普工费', unit: '元/工日', gridN: 4 },
  { key: 'auxRate', name: '辅材费率', unit: '费率', gridN: 5 },
  { key: 'envRate', name: '环境保护费费', unit: '费率', gridN: 6 },
  { key: 'civilRate', name: '文明施工费', unit: '费率', gridN: 7 },
  { key: 'carryRate', name: '工地器材搬运费', unit: '费率', gridN: 8 },
  { key: 'disturbRate', name: '工程干扰费', unit: '费率', gridN: 9 },
  { key: 'handoverRate', name: '工程点交、场地清理费', unit: '费率', gridN: 10 },
  { key: 'tempNearRate', name: '临时设施费(35km以内)', unit: '费率', gridN: 11 },
  { key: 'tempFarRate', name: '临时设施费(35km以上)', unit: '费率', gridN: 12 },
  { key: 'vehicleRate', name: '工程车辆使用费', unit: '费率', gridN: 13 },
  { key: 'nightRate', name: '夜间施工增加费', unit: '费率', gridN: 14 },
  { key: 'winterRate', name: '冬雨季施工增加费', unit: '费率（null=按地区查表）', gridN: 15 },
  { key: 'toolRate', name: '生产工具用具使用费', unit: '费率', gridN: 16 },
  { key: 'utilityRate', name: '施工用水电蒸汽费', unit: '费率', gridN: 17 },
  { key: 'protectRate', name: '已完成工程及设备保护费', unit: '费率', gridN: 19 },
  { key: 'socialRate', name: '社会保障金', unit: '费率', gridN: 21 },
  { key: 'housingRate', name: '住房公积金', unit: '费率', gridN: 22 },
  { key: 'accidentRate', name: '危险作业意外伤害保险费', unit: '费率', gridN: 23 },
  { key: 'mgmtRate', name: '企业管理费', unit: '费率', gridN: 24 },
  { key: 'profitRate', name: '利润率', unit: '费率', gridN: 25 },
];

/** HLOOKUP 行号 n -> 具名字段 key（供按 n 读写的旧调用方映射，如 Settings 费率 Tab）。 */
export const RATE_GRID_N_TO_KEY = Object.fromEntries(
  RATE_FIELD_DEFS.map((d) => [d.gridN, d.key]),
);

const numOr = (v, fallback) => (typeof v === 'number' ? v : fallback);

/**
 * v1 rateGrid -> 具名费率 byProjectType。
 * 冬雨季行（gridN=15）在 rateGrid 中恒为 null，迁移为 winterRate: null（= 按 winterTable 查表，见 §2.2.1）；
 * 施工用水电蒸汽费（gridN=17）null 迁移为 0。
 */
export function rateGridToRates(rateGrid) {
  const byProjectType = {};
  for (let col = 0; col < PROJECT_TYPES.length; col++) {
    const row = {};
    for (const def of RATE_FIELD_DEFS) {
      const gridRow = rateGrid?.[def.gridN + 1];
      const v = gridRow?.[6 + col];
      if (def.key === 'winterRate') row[def.key] = null;
      else if (def.key === 'utilityRate') row[def.key] = numOr(v, 0);
      else row[def.key] = numOr(v, 0);
    }
    byProjectType[PROJECT_TYPES[col]] = row;
  }
  return byProjectType;
}

/**
 * 具名费率 -> rateGrid（逆向合成，仅供 v1 引擎读取的兼容垫片，增量 1）。
 * 生成 85 行 × 34 列的 null 矩阵，按 (gridN+1, 6+col) 填值；winterRate 一律写 null
 * （v1 引擎不读该格，冬雨季走 winterTable；winterRate 非 null 覆盖值在增量 2 引擎切换后才生效）。
 */
export function ratesToRateGrid(rates) {
  const grid = Array.from({ length: 85 }, () => Array(34).fill(null));
  const byProjectType = rates?.byProjectType || {};
  for (let col = 0; col < PROJECT_TYPES.length; col++) {
    const row = byProjectType[PROJECT_TYPES[col]] || {};
    for (const def of RATE_FIELD_DEFS) {
      if (def.key === 'winterRate') continue;
      const v = row[def.key];
      grid[def.gridN + 1][6 + col] = typeof v === 'number' ? v : null;
    }
  }
  return grid;
}

/** 具名费率读取：缺失返回 null（与 0 区分；winterRate 的 null 另有“查表”语义）。 */
export function rateForNamed(rates, projectType, key) {
  const v = rates?.byProjectType?.[projectType]?.[key];
  return typeof v === 'number' || v === null ? v : null;
}

/**
 * 冬雨季费率：该工程类型的 winterRate 非 null 则直接用它；null 则按地区查 winterTable。
 * winterRate === 0 是显式“费率为 0”，与 null（查表）不同。
 */
export function winterRateForNamed(rates, projectType, region) {
  const w = rates?.byProjectType?.[projectType]?.winterRate;
  if (typeof w === 'number') return w;
  const v = rates?.winterTable?.[region];
  return typeof v === 'number' ? v : 0;
}
