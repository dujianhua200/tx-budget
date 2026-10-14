/** 增量 2 引擎口径测试：打折模型（参考样本数）、安全生产费、汇总表口径、打折规则可定制、孤儿警告、winterRate 覆盖 */
import { readFileSync } from 'node:fs';
import { calcProject } from '../src/engine/calc.mjs';
import { applyDiscount, DEFAULT_NO_DISCOUNT_KEYS, DEFAULT_ZERO_AFTER_DISCOUNT_KEYS } from '../src/engine/discount.mjs';
import { seedToProfile, profileToLibs, DEFAULT_TABLE5_FEES } from '../src/lib/profiles.js';

const seed = JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url), 'utf-8'));
const libsGrid = {
  quotas: seed.quotas,
  materials: [...seed.materials_jia.map((m) => ({ ...m, supply: '甲供' })),
    ...seed.materials_yi.map((m) => ({ ...m, supply: '乙供' })),
    ...seed.materials_equip.map((m) => ({ ...m, supply: '设备' }))],
  rules: seed.rules.map((r, i) => ({ ...r, id: `r${i}` })),
  rateGrid: seed.rateGrid,
  winterTable: seed.winterTable,
  machinePrices: seed.machinePrices,
  instrumentPrices: seed.instrumentPrices,
  quotaMachines: seed.quotaMachines,
  quotaInstruments: seed.quotaInstruments,
};

let pass = 0, fail = 0;
const eq = (label, got, want, tol = 0.011) => {
  const ok = typeof got === 'number' && typeof want === 'number' ? Math.abs(got - want) <= tol : got === want;
  if (ok) pass++; else { fail++; console.log(`FAIL ${label}: got=${got} want=${want}`); }
  return ok;
};
const ok = (label, cond, extra = '') => {
  if (cond) pass++; else { fail++; console.log(`FAIL ${label} ${extra}`); }
};

// ============ 参考样本折前表二（实测自参考结算书表二折前表，见 v2-design §增量 2.4）============
const REF_BEFORE = {
  techFee: 144687.55, laborFee: 48230.63, laborTotal: 192918.18,
  jiaMat: 74246.30, yiMat: 0, mainMat: 74246.30, auxMat: 222.74, matTotal: 74469.04,
  machineFee: 5580.00, instrumentFee: 15455.26, directFee: 288422.48,
  envFee: 0, civilFee: 2893.77, carryFee: 6559.22, disturbFee: 11575.09, handoverFee: 6366.30,
  tempFee: 9645.91, vehicleFee: 9645.91, nightFee: 4822.95, winterFee: 3472.53, toolFee: 2893.77,
  utilityFee: 0, specialFee: 0, protectFee: 3858.36, earthFee: 0, dispatchFee: 5916.00, bigMachineFee: 0,
  measureFee: 67649.81, directTotal: 356072.29,
  sewageFee: 0, socialFee: 54981.68, housingFee: 8083.27, accidentFee: 1929.18, regFee: 64994.13,
  mgmtFee: 52859.58, indirectTotal: 117853.71, profit: 38583.64, exclTax: 512509.64,
  outputTax: 39443.70, inclTax: 551953.34, dispatchUnit: 0, dispatchPeople: 0,
};
// Q2 的 11 项措施（参考折前值；参考折后表为空 = 0，裁决 b）
const Q2_KEYS = ['carryFee', 'disturbFee', 'tempFee', 'nightFee', 'winterFee', 'utilityFee',
  'specialFee', 'protectFee', 'earthFee', 'dispatchFee', 'bigMachineFee'];
// 11 项置 0 的参考折前表（折后结果应与完整参考折前表一致，见下一节）
const REF_BEFORE_NO_Q2 = { ...REF_BEFORE };
for (const k of Q2_KEYS) REF_BEFORE_NO_Q2[k] = 0;
REF_BEFORE_NO_Q2.measureFee = 21799.75; // 文明 2893.77 + 点交 6366.30 + 车辆 9645.91 + 工具 2893.77
REF_BEFORE_NO_Q2.directTotal = 288422.48 + 21799.75;
REF_BEFORE_NO_Q2.exclTax = 466659.58;
REF_BEFORE_NO_Q2.outputTax = (466659.58 - 74246.30) * 0.09; // jiaTax=0 时的销项税额 = 35317.20（仅用于本测试的 before 占位）

const RULE_REF = { discountRate: 0.379, noDiscountKeys: [...DEFAULT_NO_DISCOUNT_KEYS], outputTaxRate: 0.09, jiaTax: 0 };

// ---- §12.1 逐项打折（11 项置 0，隔离验证其余逐项值）----
const after = applyDiscount(REF_BEFORE_NO_Q2, RULE_REF);
eq('折后技工费 54836.58', after.techFee, 54836.58);
eq('折后普工费 18279.41', after.laborFee, 18279.41);
eq('折后人工费 73115.99', after.laborTotal, 73115.99);
eq('折后机械费 2114.82', after.machineFee, 2114.82);
eq('折后仪表费 5857.54', after.instrumentFee, 5857.54);
eq('折后文明施工费不打折 2893.77', after.civilFee, 2893.77);
eq('折后点交 2412.83', after.handoverFee, 2412.83);
eq('折后车辆 3655.80', after.vehicleFee, 3655.80);
eq('折后工具 1096.74', after.toolFee, 1096.74);
eq('折后主材不打折 74246.30', after.mainMat, 74246.30);
eq('折后辅材不打折 222.74', after.auxMat, 222.74);
eq('折后企管 20033.78', after.mgmtFee, 20033.78);
eq('折后利润 14623.20', after.profit, 14623.20);
eq('折后规费合计（模型值 64994.13，参考 64994.14，差 0.01 为 §6.5 预期舍入）', after.regFee, 64994.13, 0.02);
eq('折后规费子项按 noDiscountKeys 保持折前值（社保）', after.socialFee, 54981.68);
eq('折后措施 10059.14', after.measureFee, 10059.14);
eq('折后除税价（模型值 265267.64，参考 265267.65，差 0.01 为规费舍入）', after.exclTax, 265267.64, 0.02);
eq('合计 = 明细和（折后直接费）', after.directFee, 155557.39);

// ---- 完整参考折前表 + §6.2 默认规则（Q2 裁决 b：11 项折后=0）→ 与参考折后表一致 ----
const afterFull = applyDiscount(REF_BEFORE, RULE_REF);
eq('完整参考表：11 项折后全部 = 0', Q2_KEYS.every((k) => afterFull[k] === 0), true);
for (const k of Q2_KEYS) eq(`完整参考表：${k} 折后=0`, afterFull[k], 0);
eq('完整参考表：折后措施 10059.14（= 参考值）', afterFull.measureFee, 10059.14);
eq('完整参考表：折后除税价 265267.64（参考 265267.65，差 0.01 为规费舍入）', afterFull.exclTax, 265267.64, 0.02);
eq('完整参考表与置 0 参考折前表折后一致（措施）', afterFull.measureFee, after.measureFee);
eq('完整参考表与置 0 参考折前表折后一致（除税价）', afterFull.exclTax, after.exclTax);
// Q2 零值清单可定制：清空则 11 项恢复打折（措施回到 27436.31）
const noZero = applyDiscount(REF_BEFORE, { ...RULE_REF, zeroAfterDiscountKeys: [] });
eq('定制：零值清单清空则 11 项恢复打折（措施 27436.31）', noZero.measureFee, 27436.31);
eq('定制：零值清单清空则搬运打折 2485.94', noZero.carryFee, 2485.94);
eq('定制：零值清单清空则干扰打折 4386.96', noZero.disturbFee, 4386.96);
eq('定制：零值清单清空则临时打折 3655.80', noZero.tempFee, 3655.80);
eq('定制：零值清单清空则夜间打折 1827.90', noZero.nightFee, 1827.90);
eq('定制：零值清单清空则冬雨打折 1316.09', noZero.winterFee, 1316.09);
eq('定制：零值清单清空则保护打折 1462.32', noZero.protectFee, 1462.32);
eq('定制：零值清单清空则调遣打折 2242.16', noZero.dispatchFee, 2242.16);
// 某项从零值清单移入不打折清单则保持折前值
const keepQ2 = applyDiscount(REF_BEFORE, {
  ...RULE_REF,
  noDiscountKeys: [...DEFAULT_NO_DISCOUNT_KEYS, 'carryFee'],
  zeroAfterDiscountKeys: DEFAULT_ZERO_AFTER_DISCOUNT_KEYS.filter((k) => k !== 'carryFee'),
});
eq('定制：搬运移入不打折清单则保持折前值', keepQ2.carryFee, 6559.22);
// 两清单同时含某项时折后=0 优先
const both = applyDiscount(REF_BEFORE, {
  ...RULE_REF, noDiscountKeys: [...DEFAULT_NO_DISCOUNT_KEYS, 'carryFee'],
});
eq('两清单同时含某项时折后=0 优先', both.carryFee, 0);

// ---- discount=1 时 after ≡ before（零值清单不生效，含 Q2 键） ----
const after1 = applyDiscount(REF_BEFORE, { ...RULE_REF, discountRate: 1 });
for (const k of ['techFee', 'laborFee', 'mainMat', 'civilFee', 'regFee', 'measureFee', 'exclTax', 'outputTax',
  'dispatchFee', 'winterFee', 'carryFee', 'tempFee']) {
  eq(`discount=1 时 ${k} 不变`, after1[k], REF_BEFORE[k]);
}
// ---- 非法折扣率抛错 ----
let threw = false;
try { applyDiscount(REF_BEFORE, { ...RULE_REF, discountRate: 0 }); } catch { threw = true; }
ok('折扣率 0 抛错', threw);
threw = false;
try { applyDiscount(REF_BEFORE, { ...RULE_REF, discountRate: 1.5 }); } catch { threw = true; }
ok('折扣率 >1 抛错', threw);

// ---- 打折规则可定制：折扣率 + 不打折清单 ----
const custom = applyDiscount(REF_BEFORE_NO_Q2, {
  discountRate: 0.5,
  noDiscountKeys: [...DEFAULT_NO_DISCOUNT_KEYS, 'machineFee'],
  outputTaxRate: 0.09, jiaTax: 0,
});
eq('定制：技工费 ×0.5', custom.techFee, 72343.78); // 144687.55×0.5=72343.775→72343.78
eq('定制：机械费加入不打折清单则保持', custom.machineFee, 5580.00);
eq('定制：主材仍不打折', custom.mainMat, 74246.30);
// 表二内含 safetyFee 行时同样按规则处理（§5.2）
const withSafety = applyDiscount({ ...REF_BEFORE_NO_Q2, safetyFee: 1000 }, RULE_REF);
eq('表二内 safetyFee 默认不打折', withSafety.safetyFee, 1000);
const withSafety2 = applyDiscount({ ...REF_BEFORE_NO_Q2, safetyFee: 1000 },
  { ...RULE_REF, noDiscountKeys: DEFAULT_NO_DISCOUNT_KEYS.filter((k) => k !== 'safetyFee') });
eq('表二内 safetyFee 移出清单则打折', withSafety2.safetyFee, 379.00);
// 销项税额按折后基数公式（Q5）：(265267.64-74246.30)×0.09 + 74246.30×0.13 = 26843.94
const afterTax = applyDiscount(REF_BEFORE_NO_Q2, { ...RULE_REF, jiaTax: 0.13 });
eq('折后销项税额按折后基数公式', afterTax.outputTax, 26843.94);

// ============ 引擎级：calcProject ============
const smallProject = (over = {}) => ({
  info: { 工程类型: '通信线路工程', 施工折扣: 1, 施工距离: '35KM以内', 施工调遣分类: '施工队伍调遣人数(线路、管道）', 冬雨季施工费: 'Ⅲ类地区', 甲供增值税: 0.13, 乙供增值税: 0.09 },
  quantities: [{ quota: 'TXL1-008', variant: '', unit: '', qty: 7, coef: 1 }],
  ...over,
});

// ---- 安全生产费 2% + VAT 0（§7.1）----
const rSafe = calcProject(smallProject(), libsGrid);
eq('安全生产费 = 折前除税价 × 2%', rSafe.table5.safetyFee, rSafe.table2Before.exclTax * 0.02);
eq('安全生产费增值税 0', rSafe.table5.safetyVat, 0);
eq('安全生产费含税 = 除税', rSafe.table5.safetyIncl, rSafe.table5.safetyFee);
eq('表五 rows 16 条', rSafe.table5.rows.length, 16);
ok('表五 rows 含 designTotal 合计行', rSafe.table5.rows.some((x) => x.key === 'designTotal' && x.basis === 'sum'));
eq('表五 designTotal = 勘察 + 设计', rSafe.table5.designTotal, rSafe.table5.surveyFee + rSafe.table5.designFee);
eq('表五总计 = 管理 + 勘察设计 + 安全（其余默认 0）', rSafe.table5.totalExcl,
  rSafe.table5.mgmt2 + rSafe.table5.designTotal + rSafe.table5.safetyFee);
// 安全生产费验证数：10250.19 = 512509.64 × 2%（用参考折前除税价直接验算口径公式）
eq('安全生产费验证数 10250.19 = 512509.64 × 2%', Math.round(512509.64 * 0.02 * 100) / 100, 10250.19);

// ---- 汇总表口径（§7.2）----
eq('汇总表建安费 = 表一折后建安费', rSafe.summary.constructionExcl, rSafe.table1.afterDiscount);
eq('汇总表建安费 = 表二折后除税价', rSafe.summary.constructionExcl, rSafe.table2After.exclTax);
eq('汇总表其他费用 = 表五总计', rSafe.summary.other, rSafe.table5.totalExcl);
eq('汇总表总计 = 建安 + 其他', rSafe.summary.totalExcl, rSafe.summary.constructionExcl + rSafe.summary.other);
eq('汇总表增值税 = 销项 + 表五增值税', rSafe.summary.totalVat, rSafe.summary.constructionVat + rSafe.summary.otherVat);
ok('汇总表无 selfMat（§7.2 无自购物资行）', !('selfMat' in rSafe.summary));

// ---- 表一不再用快捷公式 ----
const rDisc = calcProject(smallProject({ info: { 工程类型: '通信线路工程', 施工折扣: 0.379 } }), libsGrid);
eq('表一折后 = 表二折后除税价', rDisc.table1.afterDiscount, rDisc.table2After.exclTax);
eq('表一折后税 = 表二折后销项税额', rDisc.table1.taxAfter, rDisc.table2After.outputTax);
const shortcut = (rDisc.table2Before.exclTax - rDisc.table2Before.mainMat - rDisc.table2Before.regFee) * 0.379
  + rDisc.table2Before.mainMat + rDisc.table2Before.regFee;
ok('表一折后 ≠ v1 快捷公式值（快捷公式已删除）', Math.abs(rDisc.table1.afterDiscount - shortcut) > 1,
  `after=${rDisc.table1.afterDiscount} shortcut=${shortcut}`);
eq('表二折后 = 逐项打折（非快捷公式）', rDisc.table2.exclTax, rDisc.table2After.exclTax);
eq('表二折前保留', rDisc.table2Before.exclTax > rDisc.table2After.exclTax, true);

// ---- 表五可配置：费率 / 单项覆盖 / 禁用 / 折后基数 ----
const feesRate = DEFAULT_TABLE5_FEES().map((f) => (f.key === 'safetyFee' ? { ...f, rate: 0.03 } : f));
const rRate = calcProject(smallProject(), { ...libsGrid, table5Fees: feesRate });
eq('表五安全生产费率可配（0.03）', rRate.table5.safetyFee, rRate.table2Before.exclTax * 0.03);
const rOverride = calcProject(
  smallProject({ table5Overrides: [{ key: 'landFee', amount: 12345 }] }),
  libsGrid,
);
eq('表五单项覆盖 amount', rOverride.table5.rows.find((x) => x.key === 'landFee').excl, 12345);
eq('表五单项覆盖计入总计', rOverride.table5.totalExcl, rSafe.table5.totalExcl + 12345);
const feesDisabled = DEFAULT_TABLE5_FEES().map((f) => (f.key === 'mgmt2' ? { ...f, enabled: false } : f));
const rDisabled = calcProject(smallProject(), { ...libsGrid, table5Fees: feesDisabled });
ok('表五禁用项不输出', !rDisabled.table5.rows.some((x) => x.key === 'mgmt2'));
eq('表五禁用项不计入总计', rDisabled.table5.totalExcl, rSafe.table5.totalExcl - rSafe.table5.mgmt2);
const feesAfter = [...DEFAULT_TABLE5_FEES(),
  { key: 'customFee', name: '自定义费', basis: 'afterDiscountExclTax', rate: 0.01, vatRate: 0, amount: null, enabled: true, order: 15, note: '' }];
const rAfterBasis = calcProject(
  smallProject({ info: { 工程类型: '通信线路工程', 施工折扣: 0.379 } }),
  { ...libsGrid, table5Fees: feesAfter },
);
eq('表五 afterDiscountExclTax 基数用折后除税价', rAfterBasis.table5.rows.find((x) => x.key === 'customFee').excl,
  rAfterBasis.table2After.exclTax * 0.01);

// ---- 孤儿行警告（B7）：警告 + 不参与计算 + 保留行 ----
const rOrphan = calcProject(smallProject({
  quantities: [
    { id: 'qty_ok', quota: 'TXL1-008', variant: '', unit: '', qty: 7, coef: 1 },
    { id: 'qty_orphan', quota: 'NOPE-001', variant: '', unit: '', qty: 5, coef: 1 },
    { id: 'qty_neg', quota: 'TXL1-008', variant: '', unit: '', qty: -3, coef: 1 },
  ],
}), libsGrid);
const orphanWarn = rOrphan.warnings.find((w) => w.code === 'orphanQty');
ok('孤儿行警告存在', !!orphanWarn);
eq('孤儿行警告 rowIds', JSON.stringify(orphanWarn?.rowIds), JSON.stringify(['qty_orphan']));
ok('孤儿行不参与计算（表三甲无孤儿行）', !rOrphan.table3A.some((r) => r.code === 'NOPE-001'));
eq('孤儿行不影响工日（与无孤儿行一致）', rOrphan.techDays, rSafe.techDays);
ok('无效行警告存在', !!rOrphan.warnings.find((w) => w.code === 'invalidQty'));
eq('无效行不参与计算', rOrphan.laborDays, rSafe.laborDays);
// 孤儿定额的规则不产生材料
const libsOrphanRule = {
  ...libsGrid,
  rules: [...libsGrid.rules, { id: 'r_orphan', quota: 'NOPE-001', material: '光缆', spec: 'GYTS_6芯', unit: '千米', consumption: 1, supply: '甲供', kind: '通用', variant: '' }],
};
const rOrphanRule = calcProject(smallProject({
  quantities: [{ id: 'qty_o', quota: 'NOPE-001', variant: '', unit: '', qty: 5, coef: 1 }],
}), libsOrphanRule);
eq('孤儿定额的规则不产生材料', rOrphanRule.table4A.totalExcl, 0);
// 定额库编号重复警告
const libsDup = { ...libsGrid, quotas: [...libsGrid.quotas, libsGrid.quotas.find((q) => q.code === 'TXL1-008')] };
const rDup = calcProject(smallProject(), libsDup);
ok('编号重复警告存在', !!rDup.warnings.find((w) => w.code === 'duplicateCode'));

// ---- winterRate 覆盖（增量 1 遗留：引擎现消费覆盖值）----
const lineType = '通信线路工程';
const setWinter = (v) => {
  const libs = profileToLibs(seedToProfile(seed));
  libs.rates.byProjectType[lineType].winterRate = v;
  return libs;
};
const rWinterNull = calcProject(smallProject(), setWinter(null));
eq('winterRate null 查表（Ⅲ类 0.018）', rWinterNull.table2Before.winterFee, rWinterNull.table2Before.laborTotal * 0.018);
const rWinterOverride = calcProject(smallProject(), setWinter(0.05));
eq('winterRate 0.05 覆盖值生效', rWinterOverride.table2Before.winterFee, rWinterOverride.table2Before.laborTotal * 0.05);
const rWinterZero = calcProject(smallProject(), setWinter(0));
eq('winterRate 0 是显式 0（不查表）', rWinterZero.table2Before.winterFee, 0);
ok('具名费率路径与 rateGrid 路径一致', Math.abs(rWinterNull.table2Before.exclTax - rSafe.table2Before.exclTax) <= 0.011);

// ---- discountRule 可定制（经 libs）+ profile 层级折扣 ----
const rProfileDisc = calcProject(
  { info: { 工程类型: '通信线路工程' }, quantities: [{ quota: 'TXL1-008', variant: '', unit: '', qty: 7, coef: 1 }] },
  { ...libsGrid, discountRule: { discountRate: 0.5, noDiscountKeys: [...DEFAULT_NO_DISCOUNT_KEYS] } },
);
eq('profile 层级折扣率生效（info 缺施工折扣时）', rProfileDisc.discount, 0.5);
eq('profile 层级折扣：技工费 ×0.5', rProfileDisc.table2After.techFee, rProfileDisc.table2Before.techFee * 0.5);

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
