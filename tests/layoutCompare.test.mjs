/**
 * 导出布局 vs 2024 参考结算书逐项比对（v3.0 §13.6，Node 直跑，无外部依赖）。
 * 参考版式以 fixture 固化在仓库内（tests/fixtures/reference-layout.json）：
 * 由 2024 参考结算书（2024__________________31_-9MA24CE0000019.xls）经 LibreOffice 转 xlsx 后
 * 提取的列宽/行高/合并/页边距/页面设置/标题字体，仅版式，不含金额与单位信息。
 * （此前版本直接读仓库外的参考 .xls，CI 环境无此文件导致 Test 步骤失败；本版本改为 fixture 比对。）
 * 比对项：表名顺序 / 列宽 / 行高 / 合并区 / 页边距 / 页面设置 / 表名标题字体。
 * 差一处即失败。注意：标题措辞不比对（参考是“结算”口径，导出是“预算”口径，见 §5.1）；
 * 非标题单元格的字体名称不比对（§13.6：其余宋体/黑体照旧，参考文件多处为 Noto）。
 */
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ExcelJS from 'exceljs';

const require = createRequire(import.meta.url);
const { exportBudgetBook } = require('../electron/printExport.cjs');
const { SHEET_ORDER } = require('../electron/printLayout.cjs');
const fixture = JSON.parse(readFileSync(new URL('./fixtures/reference-book.json', import.meta.url), 'utf-8'));
const refLayout = JSON.parse(readFileSync(new URL('./fixtures/reference-layout.json', import.meta.url), 'utf-8'));

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  if (got === want) pass++;
  else { fail++; console.log(`FAIL ${label}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
};
const near = (label, got, want, tol) => {
  if (typeof got === 'number' && typeof want === 'number' && Math.abs(got - want) <= tol) pass++;
  else { fail++; console.log(`FAIL ${label}: got=${got} want=${want} tol=${tol}`); }
};
const ok = (label, cond) => { if (cond) pass++; else { fail++; console.log(`FAIL ${label}`); } };

const TMP = mkdtempSync(join(tmpdir(), 'txbudget-layout-'));
const oursFile = join(TMP, 'ours.xlsx');
await exportBudgetBook(oursFile, fixture.project, fixture.result, null);

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(oursFile);

eq('表名顺序与参考一致', wb.worksheets.map((w) => w.name).join('|'), SHEET_ORDER.join('|'));
eq('fixture 表名顺序与 SHEET_ORDER 一致', refLayout.sheetOrder.join('|'), SHEET_ORDER.join('|'));

const TITLE_SIZE = { 报表封面: 36, 编制说明: 21 };
for (const name of SHEET_ORDER) {
  const ws = wb.getWorksheet(name);
  const ref = refLayout.sheets[name];
  ok(`${name} fixture 中有此表`, !!ref);
  if (!ref) continue;
  // 列宽（容差 0.1 覆盖浮点表示差异）
  eq(`${name} 列数`, ws.columnCount, ref.columnCount);
  ref.widths.forEach((w, i) => near(`${name} 列宽 ${String.fromCharCode(65 + i)}`, ws.getColumn(i + 1).width, w, 0.1));
  // 行高（固定版式：行数与每行行高逐项比对；容差 0.6pt）
  eq(`${name} 行数`, ws.rowCount, ref.rowCount);
  ref.heights.forEach((h, i) => {
    const a = ws.getRow(i + 1).height;
    if (a == null && h == null) { pass++; return; }
    near(`${name} 行高 ${i + 1}`, a, h, 0.6);
  });
  // 合并区：集合精确相等
  eq(`${name} 合并区`, [...(ws.model.merges || [])].sort().join(';'), [...ref.merges].sort().join(';'));
  // 页边距
  for (const k of ['left', 'right', 'top', 'bottom', 'header', 'footer']) {
    near(`${name} 页边距 ${k}`, ws.pageSetup.margins?.[k], ref.margins?.[k], 0.001);
  }
  // 页面设置
  eq(`${name} 横向`, ws.pageSetup.orientation, ref.orientation);
  eq(`${name} A4`, ws.pageSetup.paperSize, ref.paperSize);
  eq(`${name} fitToPage 关闭`, ws.pageSetup.fitToPage, ref.fitToPage);
  eq(`${name} 缩放 100`, ws.pageSetup.scale, ref.scale);
  // 表名标题字体：Noto Sans CJK SC + 对应字号 + 加粗
  const font = ws.getCell(1, 1).font || {};
  eq(`${name} 标题字体`, font.name, 'Noto Sans CJK SC');
  eq(`${name} 标题字号`, font.size, TITLE_SIZE[name] ?? 18);
  eq(`${name} 标题加粗`, font.bold, true);
  eq(`${name} 参考标题字体为 Noto`, ref.titleFont.name, 'Noto Sans CJK SC');
  eq(`${name} 参考标题字号与导出一致`, ref.titleFont.size, font.size);
}

console.log(`\nlayoutCompare: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
