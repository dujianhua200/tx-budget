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
 * v2 口径（设计文档 §6、§7，增量 2）：
 *   - 表二：先算 table2Before（等价于 v1 在 discount=1 时的表二），再调 applyDiscount 得
 *     table2After；表一/表五/汇总表全部以 table2Before/table2After 为输入。
 *     v1 的表一折扣快捷公式已删除（实测错误：参考样本算出 280709.46，参考折后为 265267.65）。
 *   - 安全生产费 = 折前建安工程费除税价 × 2%（财资〔2022〕136 号）+ 增值税 0；费率可配置。
 *   - 汇总表：建安费 = 表一折后建安费 = 表二折后除税价（含主材）；v1 的 ×0.4 公式已删除。
 *   - 表五：按配置 table5Fees 逐项取费（basis 见 profiles.js DEFAULT_TABLE5_FEES）。
 *   - 费率：具名读取（libs.rates 优先；无 rates 但有 rateGrid 时经 rateGridToRates 转换）。
 *     winterRate 非 null 覆盖值直接用（0 是显式 0），null 则按地区查 winterTable。
 *   - 孤儿工程量行（定额编号不在库中）返回 warnings，不参与计算，不静默丢数。
 *
 * 约定：
 *   - 材料数量用原量 J（不加权），工日用加权量 AB（与母版一致）
 *   - 数量为 0 的行不参与计算；备选规则默认不计（enabled=false 可开启）
 *   - 金额 ROUND(x,2) 与 Excel 一致（均为非负数）
 */

import { rateGridToRates, winterRateForNamed, RATE_FIELD_DEFS } from './rates.mjs';
import { applyDiscount, DEFAULT_NO_DISCOUNT_KEYS, DEFAULT_ZERO_AFTER_DISCOUNT_KEYS } from './discount.mjs';
import { DEFAULT_TABLE5_FEES, DEFAULT_DISPATCH, resolveRates } from '../lib/profiles.js';

export const PROJECT_TYPES = [
  '无线通信设备安装工程',
  '通信电源设备安装工程',
  '有线通信设备安装工程',
  '通信线路工程',
  '通信管道工程',
];

/**
 * 费率矩阵 HLOOKUP 行号 -> 名称（兼容导出：由 RATE_FIELD_DEFS 派生 + 增值税率行）。
 * 引擎本身不再用魔法下标读写；Settings.jsx 费率 Tab 仍用本表过渡，增量 4 费率页重做时删除。
 */
export const RATE_ITEMS = [
  ...RATE_FIELD_DEFS.map((d) => ({ n: d.gridN, key: d.key, name: d.name })),
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

/** 勘察费：按勘察长度分段（v1 公式保留，§7.3）。勘察长度 = 测量类定额原量 / 10。 */
function surveyFeeFor(surveyKm) {
  if (!(surveyKm > 0)) return 0;
  if (surveyKm <= 1) return 2000 * 0.8;
  if (surveyKm <= 10) return (2000 + (surveyKm - 1) * 1530) * 0.8;
  if (surveyKm <= 50) return (15770 + (surveyKm - 10) * 1130) * 0.8;
  return surveyKm * 1219.4 * 0.8;
}

/**
 * 解析具名费率（§2.2.1、§10 B8）。
 * @returns {{ rate: object, warnings: array }} rate 含全部具名字段 + winterRate（生效值）+ jiaTax/yiTax/outputTax/taxRate。
 */
function resolveNamedRates(libs, projectType, region) {
  const warnings = [];
  const rate = {};
  const knownType = PROJECT_TYPES.includes(projectType);
  if (!knownType) {
    warnings.push({ code: 'unknownProjectType', message: `未知工程类型“${projectType}”，费率按 0 计算` });
    for (const def of RATE_FIELD_DEFS) rate[def.key] = 0;
    rate.winterRate = 0;
    return { rate, warnings };
  }
  let named = null;
  let source = 'none';
  if (libs.rates?.byProjectType) {
    named = libs.rates.byProjectType[projectType] || {};
    source = 'named';
  } else if (libs.rateGrid) {
    named = rateGridToRates(libs.rateGrid)[projectType] || {};
    source = 'grid';
  }
  if (source === 'none') {
    warnings.push({ code: 'missingRate', message: '未提供费率（既无 rates 也无 rateGrid），费率按 0 计算' });
    for (const def of RATE_FIELD_DEFS) rate[def.key] = 0;
    rate.winterRate = 0;
    return { rate, warnings };
  }
  for (const def of RATE_FIELD_DEFS) {
    if (def.key === 'winterRate') continue; // 冬雨季单独处理（null = 查表）
    const v = named[def.key];
    if (typeof v === 'number') rate[def.key] = v;
    else {
      // rateGrid 转换路径：null 已转为 0，不告警（沿用 v1 静默行为）；具名路径缺失字段才告警。
      if (source === 'named') {
        warnings.push({ code: `missingRate:${def.key}`, message: `费率缺失：${projectType} / ${def.name}，按 0 计算` });
      }
      rate[def.key] = 0;
    }
  }
  // 冬雨季：具名 winterRate 非 null 直接用（0 是显式 0）；null 则按地区查 winterTable。
  const ratesLike = libs.rates
    ? libs.rates
    : { byProjectType: rateGridToRates(libs.rateGrid), winterTable: libs.winterTable || {} };
  rate.winterRate = winterRateForNamed(ratesLike, projectType, region);
  if (named.winterRate == null && typeof ratesLike.winterTable?.[region] !== 'number') {
    warnings.push({ code: 'missingRate:winterTable', message: `冬雨季费率缺失：地区“${region}”不在 winterTable 中，按 0 计算` });
  }
  return { rate, warnings };
}

/**
 * 计算一个工程的全部预算表
 * @param {object} project { info, quantities:[{id?,quota,variant,unit,qty,coef}], materialAdjust, materialPriceOverrides, ruleOverrides, rateOverrides, table5Overrides }
 * @param {object} libs { quotas, materials, rules, rates?, winterTable?, discountRule?, table5Fees?, dispatch?, machinePrices, instrumentPrices, quotaMachines, quotaInstruments, rateGrid?（兼容旧调用，引擎不再直接读） }
 */
export function calcProject(project, libs) {
  const L = libs || {};
  const info = { ...DEFAULT_INFO, ...(project.info || {}) };
  const warnings = [];

  // ---- 0. 费率 + 折扣/增值税率（§2.4 优先级：rateOverrides > info > 配置方案 > 兜底）----
  const { rate, warnings: rateWarnings } = resolveNamedRates(L, info.工程类型, info.冬雨季施工费);
  warnings.push(...rateWarnings);
  const resolved = resolveRates(
    { rates: L.rates || null, discountRule: L.discountRule || null },
    project,
  );
  let discount = resolved.discount;
  if (!(typeof discount === 'number' && Number.isFinite(discount) && discount > 0 && discount <= 1)) {
    warnings.push({ code: 'invalidDiscount', message: `折扣率非法：${String(resolved.discount)}，按 1 计算` });
    discount = 1;
  }
  const jiaTax = resolved.jiaTax;
  const yiTax = resolved.yiTax;
  const outputTaxRate = resolved.outputTax;
  const safetyVatFallback = resolved.safetyVat;
  rate.jiaTax = jiaTax;
  rate.yiTax = yiTax;
  rate.outputTax = outputTaxRate;
  rate.taxRate = outputTaxRate; // 兼容旧 rate.taxRate 语义（= 销项税额税率）

  const quotas = L.quotas || [];
  const materials = L.materials || [];
  const rules = L.rules || [];
  const quotaByCode = new Map();
  const duplicateCodes = new Set();
  for (const q of quotas) {
    if (quotaByCode.has(q.code)) duplicateCodes.add(q.code);
    else quotaByCode.set(q.code, q);
  }
  const matByKey = new Map(materials.map((m) => [`${m.name}|${m.spec}`, m]));
  const machinePrice = new Map((L.machinePrices || []).map((m) => [m.code, m.price]));
  const instrumentPrice = new Map((L.instrumentPrices || []).map((m) => [m.code, m.price]));
  const ruleEnabled = new Map((project.ruleOverrides || []).map((o) => [o.ruleId, !!o.enabled]));

  // ---- 1. 工程量汇总：按定额编号汇总原量 J / 加权量 AB；按 (编号,变体) 汇总原量 ----
  // 孤儿行（编号不在库中）、无效行（数量<0 / 系数<=0）记警告且不参与计算（B7）。
  const byQuota = new Map(); // code -> { raw, weighted }
  const byVariant = new Map(); // code|variant -> raw qty
  const surveyCodes = ['TXL1-001', 'TXL1-002', 'TXL1-003'];
  let surveyRaw = 0;
  const orphanRowIds = [];
  const orphanCodes = new Set();
  const invalidRowIds = [];
  (project.quantities || []).forEach((q, qi) => {
    const rowId = q.id ?? `qty_${qi}`;
    if (!quotaByCode.has(q.quota)) {
      orphanRowIds.push(rowId);
      orphanCodes.add(q.quota);
      return;
    }
    const qty = num(q.qty);
    if (typeof q.qty === 'number' && qty < 0) {
      invalidRowIds.push(rowId);
      return;
    }
    if (!qty) return; // 数量为 0 / 非数字 → 不参与计算（沿用 v1 静默跳过）
    const coef = q.coef == null || q.coef === '' ? 1 : num(q.coef);
    if (typeof q.coef === 'number' && !(coef > 0)) {
      invalidRowIds.push(rowId);
      return;
    }
    if (!(coef > 0)) return; // 非数字系数 → 按 v1 视为 0，不参与计算
    const a = byQuota.get(q.quota) || { raw: 0, weighted: 0 };
    a.raw += qty;
    a.weighted += qty * coef;
    byQuota.set(q.quota, a);
    const vk = `${q.quota}|${q.variant || ''}`;
    byVariant.set(vk, (byVariant.get(vk) || 0) + qty);
    if (surveyCodes.includes(q.quota)) surveyRaw += qty;
  });
  const surveyKm = surveyRaw / 10;
  if (orphanRowIds.length) {
    warnings.push({
      code: 'orphanQty',
      message: `${orphanRowIds.length} 行工程量引用了库中不存在的定额编号，将不参与计算：${[...orphanCodes].join('、')}`,
      rowIds: orphanRowIds,
    });
  }
  if (invalidRowIds.length) {
    warnings.push({
      code: 'invalidQty',
      message: `${invalidRowIds.length} 行工程量数量/系数无效（数量<0 或系数<=0），将不参与计算`,
      rowIds: invalidRowIds,
    });
  }
  for (const code of duplicateCodes) {
    warnings.push({ code: 'duplicateCode', message: `定额库中编号“${code}”重复，计算按首条匹配，请去重` });
  }

  // ---- 2. 表三甲：工日 ----
  const table3A = [];
  let techSub = 0, laborSub = 0;
  for (const quota of quotas) {
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
    for (const quota of quotas) {
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
  const table3B = calcEquip(L.quotaMachines || [], machinePrice);
  const table3C = calcEquip(L.quotaInstruments || [], instrumentPrice);

  // ---- 4. 材料数量：定额主材关联 ----
  const matQty = new Map(); // key -> { auto, supply }
  for (const rule of rules) {
    // 孤儿定额的规则不参与计算（其工程量行已排除）。
    if (!quotaByCode.has(rule.quota)) continue;
    let q = 0;
    if (rule.kind === '变体') {
      q = num(byVariant.get(`${rule.quota}|${rule.variant || ''}`));
    } else if (rule.kind === '变体*') {
      // 母版公式：SUMIFS(变体项目名称 & "*") —— 前缀匹配：
      // 变体项目名称“架设吊线式墙壁光缆 6芯”同时匹配普通行与“…6芯 工日X0.5”行
      const prefix = rule.variant || '';
      let sum = 0;
      for (const qq of project.quantities || []) {
        if (qq.quota === rule.quota && num(qq.qty) && (qq.variant || '').startsWith(prefix)) sum += num(qq.qty);
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

  // ---- 5. 表二（折前）----
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
  // 调遣费（参数来自 libs.dispatch，缺失时用内置默认表）
  const dsp = L.dispatch || DEFAULT_DISPATCH();
  const priceTable = dsp.priceTable || DEFAULT_DISPATCH().priceTable;
  const peopleEquip = dsp.peopleEquip || DEFAULT_DISPATCH().peopleEquip;
  const peopleLine = dsp.peopleLine || DEFAULT_DISPATCH().peopleLine;
  const extraPer200km = dsp.extraPer200km ?? 48;
  const extraPeopleStep = dsp.extraPeopleStep ?? 3;
  const mileage = num(info.施工实际里程);
  const dispatchUnit = techDays === 0 ? 0 : approxLookup(mileage, priceTable) + (mileage > 4400 ? Math.ceil((mileage - 4400) / 200) * extraPer200km : 0);
  const isEquipDispatch = info.施工调遣分类 === '施工队伍调遣人数(无线、电源、设备）';
  const dispatchPeople = techDays === 0 ? 0
    : approxLookup(techDays, isEquipDispatch ? peopleEquip : peopleLine)
      + (isEquipDispatch ? Math.ceil(Math.max(0, techDays - 5000) / 1000) * extraPeopleStep : Math.ceil(Math.max(0, techDays - 30000) / 5000) * extraPeopleStep);
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
  t2.outputTax = r2((t2.exclTax - t2.jiaMat) * outputTaxRate + table4A.totalExcl * jiaTax);
  t2.inclTax = r2(t2.exclTax + t2.outputTax);
  const table2Before = t2;

  // ---- 6. 表二（折后）：逐项打折（§6.2），不再用 v1 快捷公式 ----
  const noDiscountKeys = L.discountRule?.noDiscountKeys ?? DEFAULT_NO_DISCOUNT_KEYS;
  const zeroAfterDiscountKeys = L.discountRule?.zeroAfterDiscountKeys ?? DEFAULT_ZERO_AFTER_DISCOUNT_KEYS;
  const table2After = applyDiscount(table2Before, {
    discountRate: discount,
    noDiscountKeys,
    zeroAfterDiscountKeys,
    outputTaxRate,
    jiaTax,
  });

  // ---- 7. 表五（可配置，§7.3）----
  const table5 = calcTable5({
    table2Before,
    table2After,
    surveyKm,
    feesConfig: L.table5Fees,
    overrides: project.table5Overrides,
    safetyVatFallback,
    warnings,
  });

  // ---- 8. 表一 ----
  const t1 = {};
  t1.beforeDiscount = table2Before.exclTax;
  t1.afterDiscount = table2After.exclTax;
  t1.taxBefore = table2Before.outputTax;
  t1.taxAfter = table2After.outputTax;
  t1.totalBefore = r2(t1.beforeDiscount + t1.taxBefore);
  t1.totalAfter = r2(t1.afterDiscount + t1.taxAfter);
  t1.otherFee = table5.totalExcl;
  t1.otherVat = table5.totalVat;
  t1.otherIncl = table5.totalIncl;
  t1.sumExcl = r2(t1.afterDiscount + t1.otherFee);
  t1.sumVat = r2(t1.taxAfter + t1.otherVat);
  t1.sumIncl = r2(t1.sumExcl + t1.sumVat);
  t1.equipFee = table4Equip.totalExcl;
  t1.equipVat = table4Equip.totalVat;
  t1.equipIncl = table4Equip.totalIncl;
  t1.grandExcl = r2(t1.sumExcl + t1.equipFee);
  t1.grandVat = r2(t1.sumVat + t1.equipVat);
  t1.grandIncl = r2(t1.sumIncl + t1.equipIncl);

  // ---- 9. 汇总表（§7.2：建安费 = 表一折后建安费；其他费用 = 表五总计；无自购物资行）----
  const hz = {};
  hz.constructionExcl = t1.afterDiscount;
  hz.constructionVat = t1.taxAfter;
  hz.constructionIncl = r2(hz.constructionExcl + hz.constructionVat);
  hz.other = table5.totalExcl;
  hz.otherVat = table5.totalVat;
  hz.otherIncl = table5.totalIncl;
  hz.totalExcl = r2(hz.constructionExcl + hz.other);
  hz.totalVat = r2(hz.constructionVat + hz.otherVat);
  hz.totalIncl = r2(hz.totalExcl + hz.totalVat);

  return {
    info, rate,
    techSub, laborSub, adjRate, techDays, laborDays,
    table3A, table3B, table3C,
    table4A, table4B, table4Equip,
    table2Before, table2After, table2: table2After,
    table5, table1: t1, summary: hz,
    warnings,
    discount, discountRule: { discountRate: discount, noDiscountKeys, zeroAfterDiscountKeys },
    surveyKm, surveyRaw,
  };
}

/**
 * 表五计算（§7.3）：按配置 table5Fees 逐项取费 + 工程级 table5Overrides 覆盖。
 * - basis: preDiscountExclTax / afterDiscountExclTax / laborTotal(折前人工费) /
 *   fixed / manual / surveyKm(勘察分段) / sum（= 子项和）。
 * - enabled=false 的行不输出、不计入总计；productionPrepFee（总计之后单独行）不计入总计。
 * - 单项 vatRate 缺失时：safetyFee 回落到 rates.vatRates.safetyVat，其余回落 0。
 * - 扁平字段（mgmt2/surveyFee/designFee/…/totalExcl…）保留，供旧调用方（excel.cjs / Workbench）读取。
 */
function calcTable5({ table2Before, table2After, surveyKm, feesConfig, overrides, safetyVatFallback, warnings }) {
  const feeList = (Array.isArray(feesConfig) && feesConfig.length ? feesConfig : DEFAULT_TABLE5_FEES());
  const overridesByKey = new Map((overrides || []).map((o) => [o.key, o]));
  const sorted = [...feeList].sort((a, b) => num(a.order) - num(b.order));
  const rows = [];
  for (const item of sorted) {
    const ov = overridesByKey.get(item.key);
    const enabled = ov?.enabled ?? item.enabled ?? true;
    if (!enabled) continue;
    rows.push({
      key: item.key, name: item.name, basis: item.basis, rate: item.rate ?? null,
      vatRate: item.vatRate ?? null, order: item.order ?? 0, note: item.note ?? '',
      enabled: true, _item: item, _ov: ov,
    });
  }
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const sumChildrenOf = (row) => {
    if (row.key === 'designTotal' && !row._item.children) return ['surveyFee', 'designFee'];
    return row._item.children || [];
  };
  // 除税价
  for (const row of rows) {
    const ov = row._ov;
    if (ov?.amount != null) row.excl = r2(num(ov.amount));
    else if (row.basis === 'preDiscountExclTax') row.excl = r2(table2Before.exclTax * num(row.rate));
    else if (row.basis === 'afterDiscountExclTax') row.excl = r2(table2After.exclTax * num(row.rate));
    else if (row.basis === 'laborTotal') row.excl = r2(table2Before.laborTotal * num(row.rate));
    else if (row.basis === 'fixed') row.excl = r2(num(row._item.amount));
    else if (row.basis === 'manual') row.excl = r2(num(row._item.amount));
    else if (row.basis === 'surveyKm') row.excl = r2(surveyFeeFor(surveyKm));
    else if (row.basis === 'sum') row.excl = null; // 子项求和，稍后填充
    else {
      warnings.push({ code: 'unknownTable5Basis', message: `表五费用项“${row.name}”的 basis“${row.basis}”未知，按 0 计算` });
      row.excl = 0;
    }
  }
  // sum 行：子项和（子项可能被禁用 → 按 0 计）。
  for (const row of rows) {
    if (row.basis === 'sum') {
      row.excl = r2(sumChildrenOf(row).reduce((s, k) => s + num(byKey.get(k)?.excl), 0));
    }
  }
  // 增值税 + 含税
  for (const row of rows) {
    const vr = row._item.vatRate ?? (row.key === 'safetyFee' ? safetyVatFallback : 0);
    row.vatRate = vr;
    row.vat = r2(row.excl * num(vr));
    row.incl = r2(row.excl + row.vat);
    row.amount = row.excl;
  }
  // 总计：排除 sum 行的子项（仅当该 sum 行启用时）与 productionPrepFee。
  const sumChildren = new Set();
  for (const row of rows) {
    if (row.basis === 'sum') for (const k of sumChildrenOf(row)) sumChildren.add(k);
  }
  const totalRows = rows.filter((r) => !sumChildren.has(r.key) && r.key !== 'productionPrepFee');
  const totalExcl = r2(totalRows.reduce((s, r) => s + r.excl, 0));
  const totalVat = r2(totalRows.reduce((s, r) => s + r.vat, 0));
  const totalIncl = r2(totalExcl + totalVat);

  const get = (k) => byKey.get(k);
  const f = (k, field) => num(get(k)?.[field]);
  const pp = get('productionPrepFee');
  const out = {
    rows: rows.map(({ _item, _ov, ...rest }) => rest),
    totalExcl, totalVat, totalIncl,
    mgmt2: f('mgmt2', 'excl'), mgmt2Vat: f('mgmt2', 'vat'), mgmt2Incl: f('mgmt2', 'incl'),
    surveyKm: r2(surveyKm),
    surveyFee: f('surveyFee', 'excl'), surveyVat: f('surveyFee', 'vat'),
    designFee: f('designFee', 'excl'), designVat: f('designFee', 'vat'),
    designTotal: f('designTotal', 'excl'), designTotalVat: f('designTotal', 'vat'),
    safetyFee: f('safetyFee', 'excl'), safetyVat: f('safetyFee', 'vat'), safetyIncl: f('safetyFee', 'incl'),
    productionPrepFee: num(pp?.excl), productionPrepVat: num(pp?.vat), productionPrepIncl: num(pp?.incl),
  };
  return out;
}
