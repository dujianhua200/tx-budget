/**
 * 通信工程概预算计算引擎（纯 JS，无任何依赖，可在 Node / 浏览器 / Electron 中运行）
 *
 * 口径：2017 451号文，宇翔表二格式。公式链与 v3.0 母版逐一对齐：
 *   工程量(填量,原量J) --加权(AB=量×系数)--> 定额(技工/普工)
 *   --> 表三甲(工日,含≤100×15%/≤250×10%调整)
 *   --> 表三乙(机械,按定额-机械对) / 表三丙(仪表,按定额-仪表对)
 *   --> 定额主材关联(变体 / 变体星 / 通用 / 备选) --> 甲供/乙供/设备主材数量
 *   --> 表四甲/表四乙(除税/增值税/含税) --> 表二(取费) --> 表一/表五/汇总表
 *
 * 约定：
 *   - 材料数量用原量 J（不加权），工日用加权量 AB（与母版一致）
 *   - 数量为 0 的行不参与计算；备选规则默认不计（enabled=false 可开启）
 *   - 金额 ROUND(x,2) 与 Excel 一致（均为非负数）
 */

export const PROJECT_TYPES = [
  '无线通信设备安装工程',
  '通信电源设备安装工程',
  '有线通信设备安装工程',
  '通信线路工程',
  '通信管道工程',
];

/** 费率矩阵 HLOOKUP 行号 -> 名称（对应母版 费率!G3:K28 的 HLOOKUP 第二参数） */
export const RATE_ITEMS = [
  { n: 3, key: 'techPrice', name: '技工费' },
  { n: 4, key: 'laborPrice', name: '普工费' },
  { n: 5, key: 'auxRate', name: '辅材费率' },
  { n: 6, key: 'envRate', name: '环境保护费费' },
  { n: 7, key: 'civilRate', name: '文明施工费' },
  { n: 8, key: 'carryRate', name: '工地器材搬运费' },
  { n: 9, key: 'disturbRate', name: '工程干扰费' },
  { n: 10, key: 'handoverRate', name: '工程点交、场地清理费' },
  { n: 11, key: 'tempNearRate', name: '临时设施费(35km以内)' },
  { n: 12, key: 'tempFarRate', name: '临时设施费(35km以上)' },
  { n: 13, key: 'vehicleRate', name: '工程车辆使用费' },
  { n: 14, key: 'nightRate', name: '夜间施工增加费' },
  { n: 15, key: 'winterRate', name: '冬雨季施工增加费' },
  { n: 16, key: 'toolRate', name: '生产工具用具使用费' },
  { n: 17, key: 'utilityRate', name: '施工用水电蒸汽费' },
  { n: 19, key: 'protectRate', name: '已完成工程及设备保护费' },
  { n: 21, key: 'socialRate', name: '社会保障金' },
  { n: 22, key: 'housingRate', name: '住房公积金' },
  { n: 23, key: 'accidentRate', name: '危险作业意外伤害保险费' },
  { n: 24, key: 'mgmtRate', name: '企业管理费' },
  { n: 25, key: 'profitRate', name: '利润率' },
  { n: 26, key: 'taxRate', name: '增值税率' },
];

export const DEFAULT_INFO = {
  建设单位: '',
  建设项目名称: '',
  单项工程名称: '',
  合同编号: '',
  工程类型: '通信线路工程',
  区县: '',
  编制日期: '',
  施工折扣: 1,
  段落起点: '',
  段落终点: '',
  监理单位: '',
  表格编号: 'YD-',
  单段工程名称: '',
  项目编号: '',
  施工距离: '35KM以内',
  施工实际里程: '',
  施工调遣分类: '施工队伍调遣人数(线路、管道）',
  施工现场海拔: 0,
  冬雨季施工费: 'Ⅲ类地区',
  甲供增值税: 0.13,
  乙供增值税: 0.09,
  工程负责人: '',
  审核: '',
  编制: '',
};

/** 调遣单价表：里程阈值 -> 单价（母版 费率!G31:Z32 前 11 列） */
const DISPATCH_PRICE = [
  [0, 0], [35.0001, 141], [100.0001, 174], [200.0001, 240], [400.0001, 295],
  [600.0001, 356], [800.0001, 372], [1000.0001, 417], [1200.0001, 565],
  [1400.0001, 598], [1600.0001, 634],
];
/** 调遣人数表：工日阈值 -> 人数 */
const DISPATCH_PEOPLE_EQUIP = [
  [0, 5], [500.0001, 10], [1000.0001, 17], [2000.0001, 24], [3000.0001, 30], [4000.0001, 35],
];
const DISPATCH_PEOPLE_LINE = [
  [0, 5], [500.0001, 10], [1000.0001, 17], [2000.0001, 24], [3000.0001, 30],
  [4000.0001, 35], [5000.0001, 40], [6000.0001, 45], [7000.0001, 50],
  [8000.0001, 55], [9000.0001, 60], [10000.0001, 80], [15000.0001, 95],
  [20000.0001, 105], [25000.0001, 120],
];

const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
/** Excel HLOOKUP 近似匹配：取 <= key 的最大阈值对应的值 */
function approxLookup(key, table) {
  let v = table[0][1];
  for (const [t, val] of table) {
    if (key >= t) v = val;
    else break;
  }
  return v;
}

export function rateFor(rateGrid, projectType, hlookupN) {
  const col = PROJECT_TYPES.indexOf(projectType);
  if (col < 0) return 0;
  const row = rateGrid[3 + hlookupN - 2];
  if (!row) return 0;
  const v = row[6 + col];
  return typeof v === 'number' ? v : 0;
}

/** 冬雨季费率：按 冬雨季施工费（Ⅰ/Ⅱ/Ⅲ类地区）在冬雨季表中查（母版 费率!T18:V19） */
export function winterRateFor(winterTable, region) {
  if (!winterTable) return 0;
  const v = winterTable[region];
  return typeof v === 'number' ? v : 0;
}

/**
 * 计算一个工程的全部预算表
 * @param {object} project { info, quantities:[{quota,variant,unit,qty,coef}], materialAdjust:[{key,delta}], materialPriceOverrides:[{key,priceExcl}], ruleOverrides:[{ruleId,enabled}] }
 * @param {object} libs { quotas, materials, rules, rateGrid, machinePrices, instrumentPrices, quotaMachines, quotaInstruments }
 */
export function calcProject(project, libs) {
  const info = { ...DEFAULT_INFO, ...(project.info || {}) };
  const rate = {};
  for (const item of RATE_ITEMS) rate[item.key] = rateFor(libs.rateGrid, info.工程类型, item.n);
  // 冬雨季：母版冬雨季表按地区类别查（矩阵中该行是 TEXT/HLOOKUP 公式，不直接取）
  rate.winterRate = winterRateFor(libs.winterTable, info.冬雨季施工费);
  // 增值税率：母版 = 综合信息!B32（乙供增值税），不是矩阵常量
  rate.taxRate = num(info.乙供增值税 ?? 0.09);
  if (project.rateOverrides?.taxRate != null) rate.taxRate = project.rateOverrides.taxRate;
  const jiaTax = num(project.rateOverrides?.jiaTax ?? info.甲供增值税 ?? 0.13);
  const yiTax = num(project.rateOverrides?.yiTax ?? info.乙供增值税 ?? 0.09);
  const discount = num(project.rateOverrides?.discount ?? info.施工折扣 ?? 1);

  const quotaByCode = new Map(libs.quotas.map((q) => [q.code, q]));
  const matByKey = new Map(libs.materials.map((m) => [`${m.name}|${m.spec}`, m]));
  const machinePrice = new Map(libs.machinePrices.map((m) => [m.code, m.price]));
  const instrumentPrice = new Map(libs.instrumentPrices.map((m) => [m.code, m.price]));
  const ruleEnabled = new Map((project.ruleOverrides || []).map((o) => [o.ruleId, !!o.enabled]));

  // ---- 1. 工程量汇总：按定额编号汇总原量 J / 加权量 AB；按 (编号,变体) 汇总原量 ----
  const byQuota = new Map(); // code -> { raw, weighted }
  const byVariant = new Map(); // code|variant -> raw qty
  const surveyCodes = ['TXL1-001', 'TXL1-002', 'TXL1-003'];
  let surveyRaw = 0;
  for (const q of project.quantities || []) {
    const qty = num(q.qty);
    if (!qty) continue;
    const coef = q.coef == null || q.coef === '' ? 1 : num(q.coef);
    const a = byQuota.get(q.quota) || { raw: 0, weighted: 0 };
    a.raw += qty;
    a.weighted += qty * coef;
    byQuota.set(q.quota, a);
    const vk = `${q.quota}|${q.variant || ''}`;
    byVariant.set(vk, (byVariant.get(vk) || 0) + qty);
    if (surveyCodes.includes(q.quota)) surveyRaw += qty;
  }
  const surveyKm = surveyRaw / 10;

  // ---- 2. 表三甲：工日 ----
  const table3A = [];
  let techSub = 0, laborSub = 0;
  for (const quota of libs.quotas) {
    const agg = byQuota.get(quota.code);
    if (!agg || !agg.weighted) continue;
    const tech = r2(agg.weighted * num(quota.tech));
    const labor = r2(agg.weighted * num(quota.labor));
    techSub += tech;
    laborSub += labor;
    table3A.push({ code: quota.code, name: quota.name, unit: quota.unit, qty: r2(agg.weighted), techUnit: num(quota.tech), laborUnit: num(quota.labor), tech, labor });
  }
  const totalDays = techSub + laborSub;
  const adjRate = totalDays <= 100 ? 0.15 : totalDays <= 250 ? 0.1 : 0;
  const techDays = techSub + techSub * adjRate;
  const laborDays = laborSub + laborSub * adjRate;

  // ---- 3. 表三乙 / 表三丙：机械 / 仪表（按 定额-机械 对，定额顺序）----
  function calcEquip(mappings, priceMap) {
    const byQuotaMap = new Map();
    for (const m of mappings) {
      if (!byQuotaMap.has(m.quota)) byQuotaMap.set(m.quota, []);
      byQuotaMap.get(m.quota).push(m);
    }
    const rows = [];
    let total = 0;
    for (const quota of libs.quotas) {
      const agg = byQuota.get(quota.code);
      if (!agg || !agg.weighted) continue;
      const ms = byQuotaMap.get(quota.code);
      if (!ms) continue;
      for (const m of ms) {
        const sessions = agg.weighted * num(m.qty);
        const price = num(priceMap.get(m.mcode));
        const amount = sessions * price;
        total += amount;
        rows.push({ quota: quota.code, quotaName: quota.name, unit: quota.unit, qty: r2(agg.weighted), equipName: m.mname, equipUnit: m.unit, consumption: num(m.qty), price, sessions: r2(sessions), amount: r2(amount) });
      }
    }
    return { rows, total: r2(total) };
  }
  const table3B = calcEquip(libs.quotaMachines, machinePrice);
  const table3C = calcEquip(libs.quotaInstruments, instrumentPrice);

  // ---- 4. 材料数量：定额主材关联 ----
  const matQty = new Map(); // key -> { auto, supply }
  for (const rule of libs.rules) {
    let q = 0;
    if (rule.kind === '变体') {
      q = num(byVariant.get(`${rule.quota}|${rule.variant || ''}`));
    } else if (rule.kind === '变体*') {
      // 母版公式：SUMIFS(变体项目名称 & "*") —— 前缀匹配：
      // 变体项目名称“架设吊线式墙壁光缆 6芯”同时匹配普通行与“…6芯 工日X0.5”行
      const prefix = rule.variant || '';
      let sum = 0;
      for (const q of project.quantities || []) {
        if (q.quota === rule.quota && num(q.qty) && (q.variant || '').startsWith(prefix)) sum += num(q.qty);
      }
      q = sum;
    } else if (rule.kind === '通用') {
      q = num(byQuota.get(rule.quota)?.raw);
    } else if (rule.kind === '备选') {
      if (ruleEnabled.get(rule.id)) q = num(byVariant.get(`${rule.quota}|${rule.variant || ''}`));
    }
    if (!q) continue;
    const key = `${rule.material}|${rule.spec}`;
    const cur = matQty.get(key) || { auto: 0, supply: rule.supply };
    cur.auto += q * num(rule.consumption);
    matQty.set(key, cur);
  }
  // 手动调整
  const adjustByKey = new Map((project.materialAdjust || []).map((a) => [a.key, num(a.delta)]));
  const priceOverride = new Map((project.materialPriceOverrides || []).map((p) => [p.key, num(p.priceExcl)]));

  function buildMatTable(supply) {
    const rows = [];
    let totalExcl = 0, totalVat = 0;
    for (const [key, v] of matQty) {
      const lib = matByKey.get(key);
      const libSupply = lib ? (lib.supply || v.supply) : v.supply;
      if (libSupply !== supply) continue;
      const [name, spec] = key.split('|');
      const qty = v.auto + (adjustByKey.get(key) || 0);
      if (!qty) continue;
      const taxRate = supply === '甲供' ? jiaTax : supply === '乙供' ? yiTax : jiaTax;
      const priceExcl = priceOverride.has(key) ? priceOverride.get(key) : num(lib?.priceExcl);
      const priceVat = priceExcl * taxRate;
      const priceIncl = priceExcl + priceVat;
      const amtExcl = qty * priceExcl;
      const amtVat = qty * priceVat;
      totalExcl += amtExcl;
      totalVat += amtVat;
      rows.push({
        key, name, spec, unit: lib?.unit || '', qty: r2(qty), autoQty: r2(v.auto),
        delta: adjustByKey.get(key) || 0, priceExcl: r2(priceExcl), priceVat: r2(priceVat),
        priceIncl: r2(priceIncl), amtExcl: r2(amtExcl), amtVat: r2(amtVat), amtIncl: r2(amtExcl + amtVat),
        unmatched: !lib,
      });
    }
    return { rows, totalExcl: r2(totalExcl), totalVat: r2(totalVat), totalIncl: r2(totalExcl + totalVat) };
  }
  const table4A = buildMatTable('甲供');   // 表四甲（主材）
  const table4B = buildMatTable('乙供');   // 表四乙
  const table4Equip = buildMatTable('设备'); // 表四甲（设备）

  // ---- 5. 表二 ----
  const t2 = {};
  t2.techFee = r2(techDays * rate.techPrice);
  t2.laborFee = r2(laborDays * rate.laborPrice);
  t2.laborTotal = r2(t2.techFee + t2.laborFee);
  t2.jiaMat = table4A.totalExcl;
  t2.yiMat = table4B.totalExcl;
  t2.mainMat = r2(t2.jiaMat + t2.yiMat);
  t2.auxMat = r2(t2.mainMat * rate.auxRate);
  t2.matTotal = r2(t2.mainMat + t2.auxMat);
  t2.machineFee = table3B.total;
  t2.instrumentFee = table3C.total;
  t2.directFee = r2(t2.laborTotal + t2.matTotal + t2.machineFee + t2.instrumentFee);
  // 措施费
  t2.envFee = r2(t2.laborTotal * rate.envRate);
  t2.civilFee = r2(t2.laborTotal * rate.civilRate);
  t2.carryFee = r2(t2.laborTotal * rate.carryRate);
  t2.disturbFee = r2(t2.laborTotal * rate.disturbRate);
  t2.handoverFee = r2(t2.laborTotal * rate.handoverRate);
  const tempRate = info.施工距离 === '35KM以内' ? rate.tempNearRate : rate.tempFarRate;
  t2.tempFee = r2(t2.laborTotal * tempRate);
  t2.vehicleFee = r2(t2.laborTotal * rate.vehicleRate);
  t2.nightFee = r2(t2.laborTotal * rate.nightRate);
  t2.winterFee = r2(t2.laborTotal * rate.winterRate);
  t2.toolFee = r2(t2.laborTotal * rate.toolRate);
  t2.utilityFee = r2(t2.laborTotal * rate.utilityRate);
  t2.specialFee = 0;
  t2.protectFee = r2(t2.laborTotal * rate.protectRate);
  t2.earthFee = 0;
  // 调遣费
  const mileage = num(info.施工实际里程);
  const dispatchUnit = techDays === 0 ? 0 : approxLookup(mileage, DISPATCH_PRICE) + (mileage > 4400 ? Math.ceil((mileage - 4400) / 200) * 48 : 0);
  const isEquipDispatch = info.施工调遣分类 === '施工队伍调遣人数(无线、电源、设备）';
  const dispatchPeople = techDays === 0 ? 0
    : approxLookup(techDays, isEquipDispatch ? DISPATCH_PEOPLE_EQUIP : DISPATCH_PEOPLE_LINE)
      + (isEquipDispatch ? Math.ceil(Math.max(0, techDays - 5000) / 1000) * 3 : Math.ceil(Math.max(0, techDays - 30000) / 5000) * 3);
  t2.dispatchUnit = dispatchUnit;
  t2.dispatchPeople = dispatchPeople;
  t2.dispatchFee = r2(dispatchUnit * dispatchPeople * 2);
  t2.bigMachineFee = 0;
  t2.measureFee = r2(t2.envFee + t2.civilFee + t2.carryFee + t2.disturbFee + t2.handoverFee
    + t2.tempFee + t2.vehicleFee + t2.nightFee + t2.winterFee + t2.toolFee + t2.utilityFee
    + t2.specialFee + t2.protectFee + t2.earthFee + t2.dispatchFee + t2.bigMachineFee);
  t2.directTotal = r2(t2.directFee + t2.measureFee);
  // 间接费
  t2.sewageFee = 0;
  t2.socialFee = r2(t2.laborTotal * rate.socialRate);
  t2.housingFee = r2(t2.laborTotal * rate.housingRate);
  t2.accidentFee = r2(t2.laborTotal * rate.accidentRate);
  t2.regFee = r2(t2.sewageFee + t2.socialFee + t2.housingFee + t2.accidentFee);
  t2.mgmtFee = r2(t2.laborTotal * rate.mgmtRate);
  t2.indirectTotal = r2(t2.regFee + t2.mgmtFee);
  t2.profit = r2(t2.laborTotal * rate.profitRate);
  t2.exclTax = r2(t2.directTotal + t2.indirectTotal + t2.profit);
  t2.outputTax = r2((t2.exclTax - t2.jiaMat) * rate.taxRate + table4A.totalExcl * jiaTax);
  t2.inclTax = r2(t2.exclTax + t2.outputTax);

  // ---- 6. 表五 ----
  const t5 = {};
  t5.mgmt2 = r2(t2.exclTax * 0.02);
  t5.mgmt2Vat = r2(t5.mgmt2 * 0.06);
  t5.mgmt2Incl = r2(t5.mgmt2 + t5.mgmt2Vat);
  // 勘察费（按勘察长度分段）
  let surveyFee = 0;
  if (surveyKm > 0) {
    if (surveyKm <= 1) surveyFee = 2000 * 0.8;
    else if (surveyKm <= 10) surveyFee = (2000 + (surveyKm - 1) * 1530) * 0.8;
    else if (surveyKm <= 50) surveyFee = (15770 + (surveyKm - 10) * 1130) * 0.8;
    else surveyFee = surveyKm * 1219.4 * 0.8;
  }
  t5.surveyKm = r2(surveyKm);
  t5.surveyFee = r2(surveyFee);
  t5.surveyVat = r2(t5.surveyFee * 0.06);
  t5.designFee = r2(t2.exclTax * 0.045 * 1.1);
  t5.designVat = r2(t5.designFee * 0.06);
  t5.designTotal = r2(t5.surveyFee + t5.designFee);
  t5.designTotalVat = r2(t5.surveyVat + t5.designVat);
  t5.safetyFee = r2(t2.exclTax * 0.015);
  t5.safetyVat = r2(t5.safetyFee * rate.taxRate);
  t5.safetyIncl = r2(t5.safetyFee + t5.safetyVat);
  t5.totalExcl = r2(t5.mgmt2 + t5.designTotal + t5.safetyFee);
  t5.totalVat = r2(t5.mgmt2Vat + t5.designTotalVat + t5.safetyVat);
  t5.totalIncl = r2(t5.totalExcl + t5.totalVat);

  // ---- 7. 表一 ----
  const t1 = {};
  t1.beforeDiscount = t2.exclTax;
  t1.afterDiscount = r2((t2.exclTax - t2.mainMat - t2.regFee) * discount + t2.mainMat + t2.regFee);
  t1.taxBefore = t2.outputTax;
  t1.taxAfter = r2(t2.outputTax - table4A.totalVat);
  t1.totalBefore = r2(t1.beforeDiscount + t1.taxBefore);
  t1.totalAfter = r2(t1.afterDiscount + t1.taxAfter);
  t1.otherFee = t5.totalExcl;
  t1.otherVat = t5.totalVat;
  t1.otherIncl = t5.totalIncl;
  t1.sumExcl = r2(t1.afterDiscount + t1.otherFee);
  t1.sumVat = r2(t1.taxAfter + t1.otherVat);
  t1.sumIncl = r2(t1.sumExcl + t1.sumVat);
  t1.equipFee = table4Equip.totalExcl;
  t1.equipVat = table4Equip.totalVat;
  t1.equipIncl = table4Equip.totalIncl;
  t1.grandExcl = r2(t1.sumExcl + t1.equipFee);
  t1.grandVat = r2(t1.sumVat + t1.equipVat);
  t1.grandIncl = r2(t1.sumIncl + t1.equipIncl);

  // ---- 8. 汇总表 ----
  const hz = {};
  hz.construction = (t2.exclTax - t2.mainMat - t2.regFee) * discount + t2.regFee;
  hz.constructionExcl = hz.construction;
  hz.constructionVat = hz.construction * yiTax;
  hz.constructionIncl = hz.construction + hz.constructionVat;
  hz.other = t5.mgmt2 + t5.designTotal * 0.4 + t5.safetyFee;
  hz.otherVat = hz.other * yiTax;
  hz.otherIncl = hz.other + hz.otherVat;
  hz.selfMat = t2.yiMat;
  hz.selfMatVat = hz.selfMat * yiTax;
  hz.selfMatIncl = hz.selfMat + hz.selfMatVat;
  hz.totalExcl = hz.construction + hz.other + hz.selfMat;
  hz.totalVat = hz.constructionVat + hz.otherVat + hz.selfMatVat;
  hz.totalIncl = hz.totalExcl + hz.totalVat;

  return {
    info, rate,
    techSub, laborSub, adjRate, techDays, laborDays,
    table3A, table3B, table3C,
    table4A, table4B, table4Equip,
    table2: t2, table5: t5, table1: t1, summary: hz,
    surveyKm, surveyRaw,
  };
}
