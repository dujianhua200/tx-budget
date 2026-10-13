/** 引擎单元测试：对标 v3.0 母版 LibreOffice 实测值（2026-10-13，15/15 通过） */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { calcProject } from '../src/engine/calc.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(readFileSync(join(dir, '../data/seed.json'), 'utf-8'));
const libs = {
  quotas: seed.quotas,
  materials: [...seed.materials_jia.map((m) => ({ ...m, supply: '甲供' })),
    ...seed.materials_yi.map((m) => ({ ...m, supply: '乙供' })),
    ...seed.materials_equip.map((m) => ({ ...m, supply: '设备' }))],
  rules: seed.rules.map((r, i) => ({ ...r, id: `r${i}` })),
  rateGrid: seed.rateGrid,
  machinePrices: seed.machinePrices,
  instrumentPrices: seed.instrumentPrices,
  quotaMachines: seed.quotaMachines,
  quotaInstruments: seed.quotaInstruments,
};

let pass = 0, fail = 0;
const eq = (label, got, want, tol = 0.011) => {
  const ok = Math.abs(got - want) <= tol;
  if (ok) pass++; else { fail++; console.log(`FAIL ${label}: got=${got} want=${want}`); }
  return ok;
};

// ---- 场景 A：v3.0 实测场景 ----
const variantOf = (quota, kind) => libs.rules.filter((r) => r.quota === quota && r.kind === kind).map((r) => r.variant);
const v187 = variantOf('TXL3-187', '变体');
const v7023 = variantOf('TXL7-023', '变体');
console.log('TXL3-187 变体:', v187);
console.log('TXL7-023 变体:', v7023);
console.log('TXL4-053 变体*规则:', libs.rules.filter((r) => r.quota === 'TXL4-053').map((r) => `${r.kind}|${r.material}|${r.spec}|${r.consumption}`));
console.log('TXL7-043 规则:', libs.rules.filter((r) => r.quota === 'TXL7-043').map((r) => `${r.kind}|${r.variant}|${r.material}|${r.spec}|${r.consumption}`));

const quantities = [];
// v3.0 实测：TXL3-187 只填 6芯=2、24芯=3（12芯留空）
quantities.push({ quota: 'TXL3-187', variant: v187.find((v) => v.endsWith('6芯')), unit: '', qty: 2, coef: 1 });
quantities.push({ quota: 'TXL3-187', variant: v187.find((v) => v.endsWith('24芯')), unit: '', qty: 3, coef: 1 });
quantities.push({ quota: 'TXL4-053', variant: '架设吊线式墙壁光缆 6芯(工日X0.5)', unit: '', qty: 4, coef: 0.5 });
// v3.0 实测：TXL7-023 只填两个变体：二槽位(SMC)=5、48芯=1（四槽位留空）
quantities.push({ quota: 'TXL7-023', variant: v7023[0], unit: '', qty: 5, coef: 1 });
quantities.push({ quota: 'TXL7-023', variant: v7023[4], unit: '', qty: 1, coef: 1 });
quantities.push({ quota: 'TXL7-043', variant: libs.rules.find((r) => r.quota === 'TXL7-043' && r.kind === '变体')?.variant || '', unit: '', qty: 2, coef: 1 });

const res = calcProject({ info: { 工程类型: '通信线路工程', 施工折扣: 1 }, quantities }, libs);
const matQty = (name, spec) => {
  for (const t of [res.table4A, res.table4B, res.table4Equip]) {
    const row = t.rows.find((r) => r.name === name && r.spec === spec);
    if (row) return row.qty;
  }
  return 0;
};
console.log('--- 场景 A 材料数量 ---');
eq('GYTS_6芯', matQty('光缆', 'GYTS_6芯'), 2.4168);
eq('GYTS_24芯', matQty('光缆', 'GYTS_24芯'), 3.021);
eq('GYTS_12芯应为空', matQty('光缆', 'GYTS_12芯'), 0);
eq('抱杆2槽SMC=5', matQty('抱杆2槽（SMC）', ''), 5);
eq('抱杆4槽SMC应为空', matQty('抱杆4槽（SMC）', ''), 0);
eq('48芯分纤箱SMC=1', matQty('48芯分纤箱（SMC）', ''), 1);
eq('288芯光交=2', matQty('光缆交接箱', '288芯'), 2);
eq('备选144芯光交不计', matQty('光缆交接箱', '144芯'), 0);
for (const t of [res.table4A, res.table4B]) {
  for (const r of t.rows) console.log(`  ${r.name}|${r.spec} qty=${r.qty} auto=${r.autoQty}`);
}
console.log('表三甲 技工/普工工日:', res.techDays, res.laborDays);
console.log('表二 除税价/含税价:', res.table2.exclTax, res.table2.inclTax);
console.log('表一 总计:', res.table1.grandExcl, res.table1.grandVat, res.table1.grandIncl);
console.log('汇总表 总计:', res.summary.totalExcl, res.summary.totalVat, res.summary.totalIncl);

// ---- 场景 B：空工程 ----
const resB = calcProject({ info: {}, quantities: [] }, libs);
eq('空工程除税价', resB.table2.exclTax, 0);
eq('空工程表一总计', resB.table1.grandIncl, 0);

// ---- 场景 C：TXL1-008 机械/仪表（v2.1 实测：空压机 5.95 台班）----
const resC = calcProject({ info: {}, quantities: [{ quota: 'TXL1-008', variant: '', unit: '', qty: 7, coef: 1 }] }, libs);
const air = resC.table3B.rows.find((r) => r.equipName.includes('空气压缩机'));
console.log('TXL1-008 空气压缩机台班:', air?.sessions, '金额:', air?.amount);
eq('空气压缩机台班 5.95', air?.sessions || 0, 5.95);
const cutter = resC.table3B.rows.find((r) => r.equipName.includes('切割机'));
eq('路面切割机台班 3.5', cutter?.sessions || 0, 3.5);

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
