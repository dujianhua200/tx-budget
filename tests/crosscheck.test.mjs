/** 引擎 vs LibreOffice 重算母版：全链路逐项比对 */
import { readFileSync } from 'node:fs';

// 增量 6：夹具进仓库（tests/fixtures/lo_values.json），由
// scripts/rebuild_crosscheck_fixture.py 从 v3.0 母版经 LibreOffice 真实重算生成，
// 不再依赖 /tmp 临时文件；缺失夹具时直接失败，不许再跳过。
const lo = JSON.parse(readFileSync(new URL('./fixtures/lo_values.json', import.meta.url), 'utf-8'));
import { calcProject } from '../src/engine/calc.mjs';

const seed = JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url), 'utf-8'));
const libs = {
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
const quantities = [
  { quota: 'TXL1-002', variant: '光(电)缆工程施工测量 架空', unit: '', qty: 10, coef: 1 },
  { quota: 'TXL3-187', variant: '挂钩法架设架空光缆 平原 6芯', unit: '', qty: 2, coef: 1 },
  { quota: 'TXL3-187', variant: '挂钩法架设架空光缆 平原 24芯', unit: '', qty: 3, coef: 1 },
  { quota: 'TXL4-053', variant: '架设吊线式墙壁光缆 6芯(工日X0.5)', unit: '', qty: 4, coef: 0.5 },
  { quota: 'TXL7-023', variant: '安装光分纤箱、光分路箱 架空式 二槽位（SMC）', unit: '', qty: 5, coef: 1 },
  { quota: 'TXL7-023', variant: '安装光分纤箱、光分路箱 架空式 48芯', unit: '', qty: 1, coef: 1 },
  { quota: 'TXL7-043', variant: '安装落地式光缆交接箱 288芯', unit: '', qty: 2, coef: 1 },
];
const res = calcProject({
  info: { 工程类型: '通信线路工程', 施工折扣: 1, 施工实际里程: 36, 冬雨季施工费: 'Ⅲ类地区', 乙供增值税: 0.09, 甲供增值税: 0.13 },
  quantities,
}, libs);

let pass = 0, fail = 0;
const cmp = (label, engine, loVal) => {
  const ok = Math.abs(engine - loVal) <= 0.011;
  if (ok) pass++; else { fail++; console.log(`FAIL ${label}: engine=${engine} LO=${loVal}`); }
};
// LO 表二 I8 为 #N/A（母版嵌套 TEXT/HLOOKUP 在 LO 下失效），按母版本意 冬雨季 0.018 计算：D9×0.018
const loFixed = { ...lo, '表二!I8': Math.round(res.table2.laborTotal * 0.018 * 100) / 100 };
const checks = [
  ['表三甲 H66(技工小计)', res.techSub, loFixed['表三甲!H66']],
  ['表三甲 I66(普工小计)', res.laborSub, loFixed['表三甲!I66']],
  ['表三甲 H68(技工合计)', res.techDays, loFixed['表三甲!H68']],
  ['表三甲 I68(普工合计)', res.laborDays, loFixed['表三甲!I68']],
  ['表三乙 J52(机械费)', res.table3B.total, loFixed['表三乙!J52']],
  ['表三丙 J57(仪表费)', res.table3C.total, loFixed['表三丙!J57']],
  ['表四甲 I63(甲供除税)', res.table4A.totalExcl, loFixed['表四甲（主材）!I63']],
  ['表四甲 J63(甲供增值税)', res.table4A.totalVat, loFixed['表四甲（主材）!J63']],
  ['表四乙 I63(乙供除税)', res.table4B.totalExcl, loFixed['表四乙(乙供）!I63']],
  ['表二 D9(人工费)', res.table2.laborTotal, loFixed['表二!D9']],
  ['表二 D13(主材费)', res.table2.mainMat, loFixed['表二!D13']],
  ['表二 D16(辅材费)', res.table2.auxMat, loFixed['表二!D16']],
  ['表二 D17(机械费)', res.table2.machineFee, loFixed['表二!D17']],
  ['表二 D18(仪表费)', res.table2.instrumentFee, loFixed['表二!D18']],
  ['表二 I14(调遣费)', res.table2.dispatchFee, 1410],
  ['表二 I8(冬雨季)', res.table2.winterFee, loFixed['表二!I8']],
  ['表二 I16(间接费)', res.table2.indirectTotal, loFixed['表二!I16']],
  ['表二 I23(利润)', res.table2.profit, loFixed['表二!I23']],
  ['表二 I24(销项税)', res.table2.outputTax, loFixed['表二!I24']],
  ['表二 D6(除税价)', res.table2.exclTax, loFixed['表二!D6']],
  ['表二 D5(含税价)', res.table2.inclTax, loFixed['表二!D5']],  ['表一 G6(折前)', res.table1.beforeDiscount, loFixed['表一!G6']],
  ['表一 G7(折后)', res.table1.afterDiscount, loFixed['表一!G7']],
  // 增量 6 修正（增量 2 遗留：表一合计含表五总计，故安全生产费口径变化同样影响表一；
  // 增量 2 只换算了表五断言，漏了表一三处断言，合成夹具掩盖了该遗漏，真实 LO 夹具暴露）：
  // 合计除税 = LO 值 + 折前除税价×0.005（安全生产费 1.5%→2% 的除税差额）
  ['表一 J9(合计除税，新口径)', res.table1.sumExcl, loFixed['表一!J9'] + loFixed['表二!D6'] * 0.005],
  // 增量 2 口径：taxAfter 改按折后销项税额（v1 是 outputTax − 甲供增值税），故含税合计 = LO 值 + 甲供增值税
  // 增量 6 补：再 + 折前除税价×0.005（安全生产费除税差额）− 折前除税价×0.015×0.09（旧安全生产费增值税归零）
  ['表一 L9(合计含税，新口径)', res.table1.sumIncl,
    loFixed['表一!L9'] + loFixed['表四甲（主材）!J63']
    + loFixed['表二!D6'] * 0.005 - loFixed['表二!D6'] * 0.015 * 0.09],
  ['表一 L12(总计含税，新口径)', res.table1.grandIncl,
    loFixed['表一!L12'] + loFixed['表四甲（主材）!J63']
    + loFixed['表二!D6'] * 0.005 - loFixed['表二!D6'] * 0.015 * 0.09],
  // 增量 2 口径：安全生产费 1.5%+9% → 2%+0，故表五总计除税 = LO 值 + 折前除税价×0.005，
  // 总计增值税 = LO 值 − 折前除税价×0.015×0.09（旧安全生产费增值税部分归零）
  ['表五 D23(其他费除税，新口径)', res.table5.totalExcl, loFixed['表五!D23'] + loFixed['表二!D6'] * 0.005],
  ['表五 E23(其他费增值税，新口径)', res.table5.totalVat, loFixed['表五!E23'] - loFixed['表二!D6'] * 0.015 * 0.09],
  // 增量 2 口径：汇总表 = 表一折后建安费 + 表五总计（v1 的 ×0.4/自购物资公式已删除）。
  // 折扣=1 时折后除税价 = LO 表二 D6，折后销项税额 = LO 表二 I24。
  ['汇总表 L11(总计含税，新口径)', res.summary.totalIncl,
    loFixed['表二!D6'] + (loFixed['表五!D23'] + loFixed['表二!D6'] * 0.005)
    + loFixed['表二!I24'] + (loFixed['表五!E23'] - loFixed['表二!D6'] * 0.015 * 0.09)],
];
for (const [label, e, l] of checks) cmp(label, e, l);
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
