/** 引擎 vs LibreOffice 重算母版：全链路逐项比对 */
import { readFileSync } from 'node:fs';
import { calcProject } from '../src/engine/calc.mjs';

const seed = JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url), 'utf-8'));
const lo = JSON.parse(readFileSync('/tmp/bt/lo_values.json', 'utf-8'));
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
  ['表二 D5(含税价)', res.table2.inclTax, loFixed['表二!D5']],
  ['表一 G6(折前)', res.table1.beforeDiscount, loFixed['表一!G6']],
  ['表一 G7(折后)', res.table1.afterDiscount, loFixed['表一!G7']],
  ['表一 J9(合计除税)', res.table1.sumExcl, loFixed['表一!J9']],
  ['表一 L9(合计含税)', res.table1.sumIncl, loFixed['表一!L9']],
  ['表一 L12(总计含税)', res.table1.grandIncl, loFixed['表一!L12']],
  ['表五 D23(其他费除税)', res.table5.totalExcl, loFixed['表五!D23']],
  ['表五 E23(其他费增值税)', res.table5.totalVat, loFixed['表五!E23']],
  ['汇总表 L11(总计含税)', res.summary.totalIncl, loFixed['汇总表!L11']],
];
for (const [label, e, l] of checks) cmp(label, e, l);
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
