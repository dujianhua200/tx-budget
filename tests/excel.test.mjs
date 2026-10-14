/** Excel 导入/导出单测（Node 直跑，不依赖 Electron） */
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ExcelJS from 'exceljs';
import { calcProject } from '../src/engine/calc.mjs';

// 临时文件写进测试自己建的目录，不依赖外部已存在的 /tmp/bt
const TMP = mkdtempSync(join(tmpdir(), 'txbudget-test-'));
const tmp = (f) => join(TMP, f);

const require = createRequire(import.meta.url);
const excel = require('../electron/excel.cjs');
const { exportBudgetBook } = require('../electron/printExport.cjs');
const seed = JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url), 'utf-8'));

let pass = 0, fail = 0;
const eq = (label, got, want, tol = 0.011) => {
  const ok = typeof got === 'number' && typeof want === 'number' ? Math.abs(got - want) <= tol : got === want;
  if (ok) pass++; else { fail++; console.log(`FAIL ${label}: got=${got} want=${want}`); }
};

// ---- 导出：用引擎结果导出预算书，再读回校验 ----
const libs = {
  quotas: seed.quotas,
  materials: [...seed.materials_jia.map((m) => ({ ...m, supply: '甲供' })), ...seed.materials_yi.map((m) => ({ ...m, supply: '乙供' }))],
  rules: seed.rules.map((r, i) => ({ ...r, id: `r${i}` })),
  rateGrid: seed.rateGrid, winterTable: seed.winterTable,
  machinePrices: seed.machinePrices, instrumentPrices: seed.instrumentPrices,
  quotaMachines: seed.quotaMachines, quotaInstruments: seed.quotaInstruments,
};
const project = {
  name: '测试工程',
  info: { 工程类型: '通信线路工程', 施工折扣: 1, 施工实际里程: 36, 冬雨季施工费: 'Ⅲ类地区', 乙供增值税: 0.09, 甲供增值税: 0.13 },
  quantities: [
    { quota: 'TXL1-002', variant: '光(电)缆工程施工测量 架空', unit: '', qty: 10, coef: 1 },
    { quota: 'TXL3-187', variant: '挂钩法架设架空光缆 平原 6芯', unit: '', qty: 2, coef: 1 },
    { quota: 'TXL1-008', variant: '', unit: '', qty: 7, coef: 1 },
  ],
};
const result = calcProject(project, libs);
const t2After = result.table2After ?? result.table2;
await exportBudgetBook(tmp('export-test.xlsx'), project, result, null);
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(tmp('export-test.xlsx'));
eq('导出 11 张表', wb.worksheets.length, 11);
const t2 = wb.getWorksheet('工程费用表(表二)');
const findRow = (ws, label, labelCol, valueCol) => {
  for (let r = 1; r <= ws.rowCount; r++) if (String(ws.getCell(r, labelCol).value) === label) return ws.getCell(r, valueCol).value;
  return undefined;
};
eq('导出表二 人工费', findRow(t2, '人工费', 2, 4), t2After.laborTotal);
eq('导出表二 除税价', findRow(t2, '建安工程费(除税价)', 2, 4), t2After.exclTax);
eq('导出表二 调遣费', findRow(t2, '施工队伍调遣费', 7, 10), t2After.dispatchFee);
const t1 = wb.getWorksheet('工程总表(表一)');
eq('导出表一 总计含税', findRow(t1, '总 计', 3, 12), result.table1.grandIncl);
eq('导出表一 总计除税', findRow(t1, '总 计', 3, 10), result.table1.grandExcl);
const t3b = wb.getWorksheet('机械台班表(表三)乙');
eq('导出表三乙 合计', findRow(t3b, '小计', 7, 10), result.table3B.total);
console.log('导出 sheets:', wb.worksheets.map((w) => w.name).join(','));

// ---- 导入定额库：写一个小定额表再读回 ----
const wq = new ExcelJS.Workbook();
const wsq = wq.addWorksheet('定额库');
wsq.addRow(['定额编号', '定额名称', '单位', '技工', '普工', '系数', '分册名称']);
wsq.addRow(['TEST-001', '测试定额', '米', 1.5, 2.5, 1, '线路册']);
wsq.addRow(['TEST-002', '测试定额二', '处', 0, 3, 0.5, '线路册']);
await wq.xlsx.writeFile(tmp('quotas-test.xlsx'));
const imported = await excel.importQuotas(tmp('quotas-test.xlsx'));
eq('导入定额条数', imported.length, 2);
eq('导入定额技工', imported[0].tech, 1.5);
eq('导入定额系数', imported[1].coef, 0.5);

// ---- 导入工程量（简易格式） ----
const wi = new ExcelJS.Workbook();
const wsi = wi.addWorksheet('工程量');
wsi.addRow(['工程名称', '定额编号', '项目名称', '数量', '工日系数']);
wsi.addRow(['工程A', 'TXL3-187', '挂钩法架设架空光缆 平原 6芯', 5, 1]);
wsi.addRow(['工程A', 'TXL1-008', '', 2, 1]);
wsi.addRow(['工程B', 'TXL3-187', '挂钩法架设架空光缆 平原 24芯', 3, 1]);
await wi.xlsx.writeFile(tmp('import-test.xlsx'));
const imp = await excel.importQuantities(tmp('import-test.xlsx'));
eq('导入工程数', imp.projects.length, 2);
eq('工程A 行数', imp.projects.find((p) => p.name === '工程A').quantities.length, 2);
eq('工程B 数量', imp.projects.find((p) => p.name === '工程B').quantities[0].qty, 3);

// ---- 导出定额库再读回 ----
await excel.exportQuotas(tmp('quotas-export.xlsx'), imported);
const reimported = await excel.importQuotas(tmp('quotas-export.xlsx'));
eq('定额导出再导入', reimported.length, 2);

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
