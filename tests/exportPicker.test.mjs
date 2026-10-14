/** 导出勾选测试（v3.0 §13.6，Node 直跑）：默认全选 / 持久化解析 / 导出 include 生效 */
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ExcelJS from 'exceljs';
import {
  SHEET_NAMES, EXPORT_GROUPS, defaultExportSelection, resolveExportSelection,
  toggleExportSelection, toggleExportGroup,
} from '../src/lib/v3.js';

const require = createRequire(import.meta.url);
const { exportBudgetBook } = require('../electron/printExport.cjs');
const fixture = JSON.parse(readFileSync(new URL('./fixtures/reference-book.json', import.meta.url), 'utf-8'));
const TMP = mkdtempSync(join(tmpdir(), 'txbudget-exportpicker-'));

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${label}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
};
const ok = (label, cond) => { if (cond) pass++; else { fail++; console.log(`FAIL ${label}`); } };

// ---- 1. 默认全选 ----
eq('11 张表', SHEET_NAMES.length, 11);
eq('默认全选 = 全部 11 张', defaultExportSelection(), SHEET_NAMES);
eq('分组覆盖全部 11 张（无遗漏无重复）', EXPORT_GROUPS.flatMap((g) => g.sheets).sort(), [...SHEET_NAMES].sort());

// ---- 2. 持久化解析 ----
eq('无 exportSelection → 全选', resolveExportSelection({}), SHEET_NAMES);
eq('合法子集原样保留', resolveExportSelection({ exportSelection: ['报表封面', '编制说明'] }), ['报表封面', '编制说明']);
eq('非法条目过滤', resolveExportSelection({ exportSelection: ['报表封面', '不存在的表'] }), ['报表封面']);
eq('空数组 → 全选（缺省全选）', resolveExportSelection({ exportSelection: [] }), SHEET_NAMES);
eq('非数组 → 全选', resolveExportSelection({ exportSelection: '报表封面' }), SHEET_NAMES);

// ---- 3. 单张切换（保持 SHEET_NAMES 顺序） ----
eq('取消一表', toggleExportSelection(SHEET_NAMES, '报表封面'), SHEET_NAMES.filter((s) => s !== '报表封面'));
eq('取消后再选回', toggleExportSelection(SHEET_NAMES.filter((s) => s !== '报表封面'), '报表封面'), SHEET_NAMES);

// ---- 4. 整组切换 ----
const t2 = ['工程费用表(表二)', '工程费用表(表二)折前'];
eq('整组全选时切换 → 整组取消', toggleExportGroup(SHEET_NAMES, t2), SHEET_NAMES.filter((s) => !t2.includes(s)));
eq('整组部分选时切换 → 整组补齐（其余表不变）', toggleExportGroup(['工程费用表(表二)'], t2), t2);

// ---- 5. 导出 include 生效：只出勾选的表 ----
{
  const file = join(TMP, 'subset.xlsx');
  await exportBudgetBook(file, fixture.project, fixture.result, null, { include: ['报表封面', '编制说明'] });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  eq('include 子集只出 2 张表', wb.worksheets.map((w) => w.name), ['报表封面', '编制说明']);
}
{
  // includeSheets 别名同样生效（主进程透传口径）。
  const file = join(TMP, 'subset2.xlsx');
  await exportBudgetBook(file, fixture.project, fixture.result, null, { includeSheets: ['工程费用表(表二)'] });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  eq('includeSheets 别名只出 1 张表', wb.worksheets.map((w) => w.name), ['工程费用表(表二)']);
}
{
  const file = join(TMP, 'all.xlsx');
  await exportBudgetBook(file, fixture.project, fixture.result, null, { include: [...SHEET_NAMES] });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  eq('include 全选出 11 张表', wb.worksheets.length, 11);
}

console.log(`\nexportPicker: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
