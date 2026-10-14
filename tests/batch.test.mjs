/** 批量操作测试（v2 增量 4，Node 直跑，不依赖 Electron） */
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ExcelJS from 'exceljs';
import { LIBRARY_VIEWS, LIBRARY_VIEW_MAP } from '../src/lib/libraryDefs.js';
import {
  getViewRows, setViewRows, classifyImport, applyImport, paginate, formatPageRange,
  filterRows, sortRows, countReferences, validateRow, normalizeImportedRows,
} from '../src/lib/libraryOps.js';
import { createUndoStack } from '../src/lib/undo.js';
import { seedToProfile, exportProfile, importProfile } from '../src/lib/profiles.js';

const TMP = mkdtempSync(join(tmpdir(), 'txbudget-batch-'));
const tmp = (f) => join(TMP, f);
const require = createRequire(import.meta.url);
const excel = require('../electron/excel.cjs');
const configIO = require('../electron/configIO.cjs');
const seed = JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url), 'utf-8'));

let pass = 0, fail = 0;
const eq = (label, got, want, tol = 0.011) => {
  const ok = typeof got === 'number' && typeof want === 'number' ? Math.abs(got - want) <= tol : JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${label}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
};
const ok = (label, cond) => { if (cond) pass++; else { fail++; console.log(`FAIL ${label}`); } };

const quotasView = LIBRARY_VIEW_MAP.quotas;
const profile = seedToProfile(seed, '默认配置');
const existingQuotas = getViewRows(profile, quotasView).slice(0, 3);
const q0 = existingQuotas[0];

// ---- 1. 导入差异分类：新增 / 更新 / 跳过 / 错误 / 文件内主键重复 ----
const incoming = [
  { code: 'NEW-001', name: '新增定额', unit: '米', tech: 1, labor: 2, coef: 1, book: '', alias: '' },
  { ...q0, tech: Number(q0.tech) + 1 }, // 更新：技工变化
  { ...existingQuotas[1] }, // 跳过：完全相同（用另一行，避免与更新行同主键）
  { code: '', name: '缺编号', unit: '', tech: 0, labor: 0, coef: 1, book: '', alias: '' }, // 错误：必填为空
  { code: 'NEW-001', name: '重复主键', unit: '米', tech: 1, labor: 2, coef: 1, book: '', alias: '' }, // 错误：文件内主键重复
];
const cls = classifyImport(quotasView, existingQuotas, incoming);
eq('分类：新增 1', cls.added.length, 1);
eq('分类：更新 1', cls.updated.length, 1);
eq('分类：跳过 1', cls.skipped.length, 1);
eq('分类：错误 2', cls.errors.length, 2);
eq('更新 diff 仅技工字段', cls.updated[0].diffs.map((d) => d.field), ['tech']);
eq('更新 diff from/to', [cls.updated[0].diffs[0].from, cls.updated[0].diffs[0].to], [Number(q0.tech), Number(q0.tech) + 1]);

// ---- 2. 合并落库：逐字段采用 / 保留 ----
const merged = applyImport(quotasView, existingQuotas, cls, {
  mode: 'merge', addedKeys: ['NEW-001'],
  updatedChoices: { [cls.updated[0].key]: { tech: false } },
});
eq('合并后行数（+1 新增）', merged.length, existingQuotas.length + 1);
eq('合并：未勾选字段保留旧值', merged.find((r) => r.id === q0.id).tech, Number(q0.tech));
eq('合并：新增行有 id', !!merged.find((r) => r.code === 'NEW-001')?.id, true);
const merged2 = applyImport(quotasView, existingQuotas, cls, {
  mode: 'merge', addedKeys: ['NEW-001'],
  updatedChoices: { [cls.updated[0].key]: { tech: true } },
});
eq('合并：勾选字段采用新值', merged2.find((r) => r.id === q0.id).tech, Number(q0.tech) + 1);
// 合并：不勾选新增行则不追加
const merged3 = applyImport(quotasView, existingQuotas, cls, { mode: 'merge', addedKeys: [], updatedChoices: {} });
eq('合并：未勾选新增行不追加', merged3.length, existingQuotas.length);

// ---- 3. 全部替换 ----
const replaced = applyImport(quotasView, existingQuotas, cls, { mode: 'replace' });
eq('替换后行数 = 文件有效行', replaced.length, 2);
eq('替换：已存在主键复用原 id', replaced.find((r) => r.code === q0.code)?.id, q0.id);
eq('替换：新增行补 id', !!replaced.find((r) => r.code === 'NEW-001')?.id, true);

// ---- 4. 分页与显示范围（B4） ----
const many = Array.from({ length: 120 }, (_, i) => ({ id: `r${i}`, code: `C${i}` }));
const pg2 = paginate(many, 2, 50);
eq('分页第 2 页行数', pg2.rows.length, 50);
eq('分页第 2 页 from', pg2.from, 51);
eq('分页第 2 页 to', pg2.to, 100);
eq('分页总页数', pg2.totalPages, 3);
eq('分页越界钳制到末页', paginate(many, 99, 50).page, 3);
eq('分页文案', formatPageRange(120, 2, 50), '共 120 条，显示 51–100 条');
eq('分页文案空表', formatPageRange(0, 1, 50), '共 0 条，显示 0–0 条');
eq('分页文案末页', formatPageRange(2622, 53, 50), '共 2622 条，显示 2601–2622 条');

// ---- 5. 搜索与排序 ----
const rows5 = [
  { id: 'a', code: 'TXL3-1', name: '架设', tech: 2 },
  { id: 'b', code: 'TXL1-1', name: '测量', tech: 10 },
  { id: 'c', code: 'TXL3-2', name: '接续', tech: 1 },
];
eq('搜索 TXL3', filterRows(rows5, quotasView.columns, 'TXL3').length, 2);
eq('搜索大小写不敏感', filterRows(rows5, quotasView.columns, 'txl3').length, 2);
eq('排序数值升序', sortRows(rows5, 'tech', 'asc', quotasView.columns).map((r) => r.id), ['c', 'a', 'b']);
eq('排序数值降序', sortRows(rows5, 'tech', 'desc', quotasView.columns).map((r) => r.id), ['b', 'a', 'c']);

// ---- 6. 撤销栈 ----
const stack = createUndoStack(50);
ok('撤销栈初始不可撤销', !stack.canUndo());
stack.push({ scope: 'table' }, '删 1');
stack.push({ scope: 'table' }, '删 2');
eq('撤销 LIFO', stack.undo().label, '删 2');
eq('撤销后 size', stack.size(), 1);
const stack2 = createUndoStack(50);
for (let i = 0; i < 55; i++) stack2.push({ i }, `op${i}`);
eq('撤销栈上限 50', stack2.size(), 50);
eq('撤销栈上限后最旧被丢弃（首个弹出为最新）', stack2.undo().label, 'op54');

// ---- 7. 按 id 删除：重复编号不误伤（B7） ----
const dupProfile = seedToProfile(seed, '默认配置');
const qv = LIBRARY_VIEW_MAP.quotas;
const baseRows = getViewRows(dupProfile, qv).slice(0, 2);
const dupRows = [
  ...baseRows,
  { ...baseRows[0], id: 'dup-id-1' }, // 与首行同 code，不同 id
  { ...baseRows[0], id: 'dup-id-2' },
];
const afterDelete = dupRows.filter((r) => r.id !== 'dup-id-1');
eq('按 id 删除只删目标行', afterDelete.length, dupRows.length - 1);
eq('按 id 删除后同编号行仍在', afterDelete.filter((r) => r.code === baseRows[0].code).length, 2);
const written = setViewRows(dupProfile, qv, afterDelete);
eq('setViewRows 写回行数', getViewRows(written, qv).length, afterDelete.length);

// ---- 8. rules 两视图切片隔离 ----
const rulesProfile = seedToProfile(seed, '默认配置');
const variantRows = getViewRows(rulesProfile, LIBRARY_VIEW_MAP.rulesVariant);
const altRows = getViewRows(rulesProfile, LIBRARY_VIEW_MAP.rulesAlt);
ok('变体视图行 kind 均非备选', variantRows.every((r) => r.kind !== '备选'));
ok('备选视图行 kind 均为备选', altRows.every((r) => r.kind === '备选'));
const altBefore = altRows.length;
const nextVariant = variantRows.slice(1);
const afterVariantSet = setViewRows(rulesProfile, LIBRARY_VIEW_MAP.rulesVariant, nextVariant);
eq('变体视图 setRows 不动备选行', getViewRows(afterVariantSet, LIBRARY_VIEW_MAP.rulesAlt).length, altBefore);
eq('变体视图 setRows 生效', getViewRows(afterVariantSet, LIBRARY_VIEW_MAP.rulesVariant).length, nextVariant.length);

// ---- 9. 费率视图：展开 / 写回 / winterRate null 语义 ----
const ratesProfile = seedToProfile(seed, '默认配置');
const rateRows = getViewRows(ratesProfile, LIBRARY_VIEW_MAP.rates);
ok('费率行含增值税率四项', rateRows.filter((r) => r['工程类型'] === '增值税率').length === 4);
ok('费率行含冬雨季三行', rateRows.filter((r) => r['工程类型'] === '冬雨季表').length === 3);
const vatRow = rateRows.find((r) => r._section === 'vatRates' && r._key === 'jiaTax');
eq('甲供增值税默认值', vatRow['数值'], 0.13);
const editedRates = rateRows.map((r) => (r.id === vatRow.id ? { ...r, 数值: 0.11 } : r));
const winterRow = rateRows.find((r) => r._section === 'byProjectType' && r._key === 'winterRate');
const editedRates2 = editedRates.map((r) => (r.id === winterRow.id ? { ...r, 数值: null } : r));
const ratesWritten = setViewRows(ratesProfile, LIBRARY_VIEW_MAP.rates, editedRates2);
eq('费率写回增值税率', ratesWritten.rates.vatRates.jiaTax, 0.11);
eq('费率写回 winterRate null（查表）不变成 0', ratesWritten.rates.byProjectType['通信线路工程'].winterRate, null);
// 费率导入归一化与未知项目归错误
const normRates = normalizeImportedRows(LIBRARY_VIEW_MAP.rates, [
  { 工程类型: '通信线路工程', 费率项目: '技工费', 数值: 120, 单位: '元/工日' },
  { 工程类型: '通信线路工程', 费率项目: '不存在的费率', 数值: 1, 单位: '' },
]);
eq('费率导入归一化补 _key', normRates[0]._key, 'techPrice');
const rateCls = classifyImport(LIBRARY_VIEW_MAP.rates, rateRows, normRates);
eq('费率未知项目归错误组', rateCls.errors.length, 1);
eq('费率已知项目归更新组', rateCls.updated.length, 1);
eq('费率更新 diff 字段', rateCls.updated[0].diffs.map((d) => d.field), ['数值']);

// ---- 10. 删除影响计数 ----
const db10 = {
  configurationProfiles: [profile],
  projects: [{ name: '工程A', quantities: [{ quota: q0.code, variant: '', qty: 1 }] }],
};
const refs = countReferences(db10, profile, quotasView, [q0]);
eq('定额引用工程数', refs.projects, ['工程A']);
ok('定额引用规则数 >= 0', refs.rules >= 0);
const matView = LIBRARY_VIEW_MAP.materials;
const matRefs = countReferences(db10, profile, matView, [{ id: 'x', name: '不存在的材料', spec: '' }]);
eq('无引用材料规则数 0', matRefs.rules, 0);

// ---- 11. 行校验 ----
eq('校验必填为空', validateRow(quotasView, { code: '', name: 'x' }).length > 0, true);
eq('校验数值非法', validateRow(quotasView, { code: 'A', name: 'x', tech: 'abc' }).length > 0, true);
eq('校验合法行', validateRow(quotasView, { code: 'A', name: 'x', tech: 1 }).length, 0);
eq('校验 select 非法', validateRow(matView, { name: 'm', supply: '自购' }).length > 0, true);

// ---- 12. Excel 导出/导入往返 ----
const qRows = [
  { code: 'T-1', name: '定额一', unit: '米', tech: 1.5, labor: 2.5, coef: 1, book: '线路册', alias: '' },
  { code: 'T-1', name: '定额一（同编号第二行）', unit: '米', tech: 0, labor: 3, coef: 0.5, book: '线路册', alias: '' },
];
await excel.exportLibrary(tmp('quotas.xlsx'), 'quotas', qRows);
const qImp = await excel.importLibrary(tmp('quotas.xlsx'), 'quotas');
eq('定额导出回读行数（含同编号多行）', qImp.rows.length, 2);
eq('定额导出回读技工', qImp.rows[0].tech, 1.5);
eq('定额导出回读无解析错误', qImp.errors.length, 0);

const mRows = [{ name: '光缆', spec: 'GYTS-12', unit: '千米', priceExcl: 1234.56, supply: '甲供', remark: '' }];
await excel.exportLibrary(tmp('materials.xlsx'), 'materials', mRows);
const mImp = await excel.importLibrary(tmp('materials.xlsx'), 'materials');
eq('材料导出回读', mImp.rows[0].priceExcl, 1234.56);

const qmRows = [{ quota: 'TXL1-008', mcode: 'M1', mname: '空压机', unit: '台班', qty: 5.95 }];
await excel.exportLibrary(tmp('qm.xlsx'), 'quotaMachines', qmRows);
const qmImp = await excel.importLibrary(tmp('qm.xlsx'), 'quotaMachines');
eq('映射导出回读', qmImp.rows[0].qty, 5.95);

const rRows = [
  { 工程类型: '通信线路工程', 费率项目: '技工费', 数值: 114, 单位: '元/工日' },
  { 工程类型: '冬雨季表', 费率项目: '冬雨季施工增加费（Ⅲ类地区）', 数值: null, 单位: '费率' },
];
await excel.exportLibrary(tmp('rates.xlsx'), 'rates', rRows);
const rImp = await excel.importLibrary(tmp('rates.xlsx'), 'rates');
eq('费率导出回读行数', rImp.rows.length, 2);
eq('费率导出回读数值', rImp.rows[0]['数值'], 114);
eq('费率空值回读为 null', rImp.rows[1]['数值'], null);

const t5Rows = [
  { key: 'safetyFee', name: '安全生产费', basis: 'preDiscountExclTax', rate: 0.02, vatRate: 0, amount: null, enabled: true, order: 8, note: '' },
  { key: 'landFee', name: '建设用地及综合赔补费', basis: 'manual', rate: 0, vatRate: 0, amount: null, enabled: false, order: 1, note: '' },
];
await excel.exportLibrary(tmp('t5.xlsx'), 'table5Fees', t5Rows);
const t5Imp = await excel.importLibrary(tmp('t5.xlsx'), 'table5Fees');
eq('表五导出回读费率', t5Imp.rows[0].rate, 0.02);
eq('表五布尔回读 true', t5Imp.rows[0].enabled, true);
eq('表五布尔回读 false', t5Imp.rows[1].enabled, false);

// 导入解析错误：数值非法 + 必填为空 + 表头缺失
const wbBad = new ExcelJS.Workbook();
const wsBad = wbBad.addWorksheet('Sheet1');
wsBad.addRow(['定额编号', '定额名称', '单位', '技工', '普工', '系数', '分册名称', '别名']);
wsBad.addRow(['BAD-1', '坏定额', '米', '不是数字', 1, 1, '', '']);
wsBad.addRow(['', '缺编号', '米', 1, 1, 1, '', '']);
wsBad.addRow(['GOOD-1', '好定额', '米', 1, 1, 1, '', '']);
await wbBad.xlsx.writeFile(tmp('bad.xlsx'));
const badImp = await excel.importLibrary(tmp('bad.xlsx'), 'quotas');
eq('解析错误行被排除', badImp.rows.length, 1);
eq('解析错误行数', badImp.errors.length, 2);
const wbHead = new ExcelJS.Workbook();
wbHead.addWorksheet('Sheet1').addRow(['不对的表头', '名称']);
await wbHead.xlsx.writeFile(tmp('badhead.xlsx'));
const headImp = await excel.importLibrary(tmp('badhead.xlsx'), 'quotas');
eq('表头缺失整文件错误', headImp.rows.length, 0);
ok('表头缺失有错误信息', headImp.errors.length > 0);

// ---- 13. Excel 列头与 libraryDefs 列 label 对齐（防漂移） ----
for (const view of LIBRARY_VIEWS) {
  const cols = excel.EXCEL_COLUMNS[view.key];
  ok(`Excel 列存在：${view.key}`, !!cols);
  for (const col of view.columns) {
    const match = cols.find((c) => c.header === col.label || (c.aliases || []).includes(col.label));
    ok(`Excel 列头对齐 ${view.key}.${col.label}`, !!match);
  }
}

// ---- 14. configIO 真实路径往返 + 非法 JSON 报错 ----
const prof = seedToProfile(seed, '默认配置');
const exp = configIO.exportProfileToFile(tmp('prof.json'), prof, { exportProfile });
eq('configIO 导出 ok', exp.ok, true);
const back = configIO.importProfileFromFile(tmp('prof.json'), { importProfile });
eq('configIO 导入回读名', back.name, '默认配置');
eq('configIO 导入赋新 id（不等于原 id）', back.id === prof.id, false);
eq('configIO 导入费率一致', back.rates.byProjectType['通信线路工程'].techPrice, 114);
writeFileSync(tmp('broken.json'), '{ not json');
let threw = false;
try { configIO.importProfileFromFile(tmp('broken.json'), { importProfile }); } catch (e) { threw = /JSON/.test(e.message); }
ok('configIO 非法 JSON 抛错', threw);
let threw2 = false;
try { configIO.importProfileFromFile(tmp('missing.json'), { importProfile }); } catch (e) { threw2 = /读取失败/.test(e.message); }
ok('configIO 缺失文件抛错', threw2);
const backup = configIO.exportConfigBackup(tmp('backup.json'), { version: 2, configurationProfiles: [prof], projects: [] });
eq('configIO 整库备份 ok', backup.ok, true);

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
