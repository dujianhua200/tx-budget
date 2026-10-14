/** LibreOffice 往返验证（不在 npm test 内：LO 在 CI 未必可用）。
 * 导出夹具工程 → soffice --headless 转换为 xlsx → ExcelJS 读回，与原导出逐单元格比对。
 * 本导出写值不写公式，LO 能打开并转换即证明文件结构合法；数值一致即往返保真。
 * 用法：node scripts/verify-print-export.mjs
 */
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import ExcelJS from 'exceljs';

const require = createRequire(import.meta.url);
const { exportBudgetBook } = require('../electron/printExport.cjs');
const fixture = JSON.parse(readFileSync(new URL('../tests/fixtures/reference-book.json', import.meta.url), 'utf-8'));

const OUT = mkdtempSync(join(tmpdir(), 'txbudget-lo-'));
const src = join(OUT, 'reference.xlsx');
await exportBudgetBook(src, fixture.project, fixture.result, null);
const loDir = join(OUT, 'lo');
execSync(`soffice --headless --convert-to xlsx --outdir ${loDir} ${src}`, { stdio: 'inherit' });
const converted = join(loDir, 'reference.xlsx');

const wb1 = new ExcelJS.Workbook(); await wb1.xlsx.readFile(src);
const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.readFile(converted);

let checked = 0, mismatch = 0;
/** LO 会把字符串按字体拆成 richText 分段（ASCII→宋体、CJK→Noto），文本相同但表示不同；比对前展平。 */
const textOf = (v) => (v && typeof v === 'object' && Array.isArray(v.richText))
  ? v.richText.map((r) => r.text || '').join('') : v;
for (const ws1 of wb1.worksheets) {
  const ws2 = wb2.getWorksheet(ws1.name);
  if (!ws2) { mismatch++; console.log(`FAIL 缺表 ${ws1.name}`); continue; }
  ws1.eachRow((row) => row.eachCell((c) => {
    if (c.value == null) return;
    checked++;
    const v2 = textOf(ws2.getCell(c.address).value);
    const ok = typeof c.value === 'number' && typeof v2 === 'number'
      ? Math.abs(c.value - v2) <= 0.011 : c.value === v2;
    if (!ok) { mismatch++; console.log(`FAIL ${ws1.name} ${c.address}: 原导出=${JSON.stringify(c.value)} LO转换后=${JSON.stringify(v2)}`); }
  }));
}
console.log(`\nLO 往返：比对 ${checked} 个非空单元格，${mismatch} 处不一致`);
console.log(`原文件：${src}\nLO 转换：${converted}`);
process.exit(mismatch ? 1 : 0);
