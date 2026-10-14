/**
 * 导出布局 vs 2024 参考结算书逐项比对（v3.0 §13.6，Node 直跑）。
 * 参考文件：~/workspace/user/files/2024__________________31_-9MA24CE0000019.xls（.xls，经 LibreOffice 转 xlsx 后比对）。
 * 比对项：表名顺序 / 列宽 / 行高 / 合并区 / 页边距 / 页面设置 / 表名标题字体。
 * 差一处即失败。注意：标题措辞不比对（参考是“结算”口径，导出是“预算”口径，见 §5.1）；
 * 非标题单元格的字体名称不比对（§13.6：其余宋体/黑体照旧，参考文件多处为 Noto）。
 */
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import ExcelJS from 'exceljs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REF_XLS = resolve(ROOT, '..', 'user', 'files', '2024__________________31_-9MA24CE0000019.xls');
const require = createRequire(import.meta.url);
const { exportBudgetBook } = require('../electron/printExport.cjs');
const { SHEET_ORDER } = require('../electron/printLayout.cjs');
const fixture = JSON.parse(readFileSync(new URL('./fixtures/reference-book.json', import.meta.url), 'utf-8'));

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

if (!existsSync(REF_XLS)) {
  console.log(`FAIL 参考结算书不存在：${REF_XLS}`);
  process.exit(1);
}
const TMP = mkdtempSync(join(tmpdir(), 'txbudget-layout-'));
execSync(`soffice --headless --convert-to xlsx --outdir ${TMP} ${REF_XLS}`, { stdio: 'pipe' });
const refFile = join(TMP, '2024__________________31_-9MA24CE0000019.xlsx');
if (!existsSync(refFile)) { console.log('FAIL LibreOffice 转换参考结算书失败'); process.exit(1); }

const oursFile = join(TMP, 'ours.xlsx');
await exportBudgetBook(oursFile, fixture.project, fixture.result, null);

const load = async (f) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(f); return wb; };
const ours = await load(oursFile);
const ref = await load(refFile);

eq('表名顺序与参考一致', ours.worksheets.map((w) => w.name).join('|'), SHEET_ORDER.join('|'));
eq('参考表名顺序与 SHEET_ORDER 一致', ref.worksheets.map((w) => w.name).join('|'), SHEET_ORDER.join('|'));

const TITLE_SIZE = { 报表封面: 36, 编制说明: 21 };
for (const name of SHEET_ORDER) {
  const ws = ours.getWorksheet(name);
  const rw = ref.getWorksheet(name);
  ok(`${name} 参考中有此表`, !!rw);
  if (!rw) continue;
  // 列宽（LO 转换后的参考列宽即真实列宽；容差 0.1 覆盖浮点表示差异）
  eq(`${name} 列数`, ws.columnCount, rw.columnCount);
  for (let c = 1; c <= rw.columnCount; c++) {
    near(`${name} 列宽 ${String.fromCharCode(64 + c)}`, ws.getColumn(c).width, rw.getColumn(c).width, 0.1);
  }
  // 行高（固定版式：行数与每行行高逐项比对；容差 0.6pt）
  eq(`${name} 行数`, ws.rowCount, rw.rowCount);
  for (let r = 1; r <= rw.rowCount; r++) {
    const a = ws.getRow(r).height, b = rw.getRow(r).height;
    if (a == null && b == null) { pass++; continue; }
    near(`${name} 行高 ${r}`, a, b, 0.6);
  }
  // 合并区：集合精确相等
  const m1 = [...(ws.model.merges || [])].sort();
  const m2 = [...(rw.model.merges || [])].sort();
  eq(`${name} 合并区`, m1.join(';'), m2.join(';'));
  // 页边距
  for (const k of ['left', 'right', 'top', 'bottom', 'header', 'footer']) {
    near(`${name} 页边距 ${k}`, ws.pageSetup.margins?.[k], rw.pageSetup.margins?.[k], 0.001);
  }
  // 页面设置
  eq(`${name} 横向`, ws.pageSetup.orientation, 'landscape');
  eq(`${name} A4`, ws.pageSetup.paperSize, 9);
  eq(`${name} fitToPage 关闭`, ws.pageSetup.fitToPage, false);
  eq(`${name} 缩放 100`, ws.pageSetup.scale, 100);
  // 表名标题字体：Noto Sans CJK SC + 对应字号 + 加粗
  const font = ws.getCell(1, 1).font || {};
  eq(`${name} 标题字体`, font.name, 'Noto Sans CJK SC');
  eq(`${name} 标题字号`, font.size, TITLE_SIZE[name] ?? 18);
  eq(`${name} 标题加粗`, font.bold, true);
  const rfont = rw.getCell(1, 1).font || {};
  eq(`${name} 参考标题字体为 Noto`, rfont.name, 'Noto Sans CJK SC');
  eq(`${name} 参考标题字号与导出一致`, rfont.size, font.size);
}

console.log(`\nlayoutCompare: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
