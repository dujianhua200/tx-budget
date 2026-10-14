/** 打印导出测试（v2 增量 3，Node 直跑，不依赖 Electron） */
import { readFileSync, mkdtempSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ExcelJS from 'exceljs';
import { calcProject } from '../src/engine/calc.mjs';
import { DISCOUNT_LINE_DEFS, renderMethodText, DEFAULT_NO_DISCOUNT_KEYS } from '../src/engine/discount.mjs';
import { seedToProfile, profileToLibs } from '../src/lib/profiles.js';

const TMP = mkdtempSync(join(tmpdir(), 'txbudget-print-'));
const tmp = (f) => join(TMP, f);
const require = createRequire(import.meta.url);
const { exportBudgetBook, paginateTable3A } = require('../electron/printExport.cjs');
const { SHEET_ORDER, LAYOUT } = require('../electron/printLayout.cjs');
const seed = JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url), 'utf-8'));
const fixture = JSON.parse(readFileSync(new URL('./fixtures/reference-book.json', import.meta.url), 'utf-8'));

let pass = 0, fail = 0;
const eq = (label, got, want, tol = 0.011) => {
  const ok = typeof got === 'number' && typeof want === 'number' ? Math.abs(got - want) <= tol : got === want;
  if (ok) pass++; else { fail++; console.log(`FAIL ${label}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
};
const ok = (label, cond) => { if (cond) pass++; else { fail++; console.log(`FAIL ${label}`); } };
const cell = (ws, r, c) => ws.getCell(r, c).value ?? null;
const numCell = (ws, r, c) => { const v = cell(ws, r, c); return typeof v === 'number' ? v : null; };

// 表二行序（与 printExport.cjs 的 TABLE2_LEFT / TABLE2_RIGHT 一致）。
const T2_LEFT_KEYS = ['inclTax', 'exclTax', 'directTotal', 'directFee', 'laborTotal', 'techFee', 'laborFee', 'matTotal', 'mainMat', 'auxMat', 'machineFee', 'instrumentFee', 'measureFee', 'civilFee', 'carryFee', 'disturbFee', 'handoverFee', 'tempFee', 'vehicleFee'];
const T2_RIGHT_KEYS = ['nightFee', 'winterFee', 'toolFee', 'utilityFee', 'specialFee', 'protectFee', 'earthFee', 'dispatchFee', 'bigMachineFee', 'indirectTotal', 'regFee', 'sewageFee', 'socialFee', 'housingFee', 'accidentFee', 'mgmtFee', 'profit', 'outputTax', null];
const t2Value = (ws, key) => {
  const li = T2_LEFT_KEYS.indexOf(key);
  if (li >= 0) return numCell(ws, 5 + li, 4);
  const ri = T2_RIGHT_KEYS.indexOf(key);
  if (ri >= 0) return numCell(ws, 5 + ri, 10);
  return undefined;
};
const t2Method = (ws, key) => {
  const li = T2_LEFT_KEYS.indexOf(key);
  if (li >= 0) return cell(ws, 5 + li, 3);
  const ri = T2_RIGHT_KEYS.indexOf(key);
  if (ri >= 0) return cell(ws, 5 + ri, 8);
  return undefined;
};

// ---- 1. 参考夹具导出（profile=null，回落引擎 rows）：版式 + 数值双重验收 ----
await exportBudgetBook(tmp('reference.xlsx'), fixture.project, fixture.result, null);
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(tmp('reference.xlsx'));
eq('11 张表', wb.worksheets.length, 11);
eq('表名顺序', wb.worksheets.map((w) => w.name).join('|'), SHEET_ORDER.join('|'));
const mergesOf = (ws) => ws.model.merges || [];
eq('封面合并区 16', mergesOf(wb.getWorksheet('报表封面')).length, 16);
eq('汇总表合并区 14', mergesOf(wb.getWorksheet('建设项目总算表(汇总表)')).length, 14);
eq('表一合并区 15', mergesOf(wb.getWorksheet('工程总表(表一)')).length, 15);
eq('表二合并区 29', mergesOf(wb.getWorksheet('工程费用表(表二)')).length, 29);
eq('表二折前合并区 29', mergesOf(wb.getWorksheet('工程费用表(表二)折前')).length, 29);
eq('表三甲合并区 78', mergesOf(wb.getWorksheet('工程量表(表三)甲')).length, 78);
eq('表三乙合并区 17', mergesOf(wb.getWorksheet('机械台班表(表三)乙')).length, 17);
eq('表三丙合并区 17', mergesOf(wb.getWorksheet('仪器仪表使用表(表三)丙')).length, 17);
eq('表四甲合并区 16', mergesOf(wb.getWorksheet('主要材料表(表四)甲')).length, 16);
eq('表五甲合并区 35', mergesOf(wb.getWorksheet('工程其他费用表(表五)甲')).length, 35);
for (const ws of wb.worksheets) {
  eq(`${ws.name} 横向`, ws.pageSetup.orientation, 'landscape');
  eq(`${ws.name} A4`, ws.pageSetup.paperSize, 9);
  eq(`${ws.name} fitToPage 关闭`, ws.pageSetup.fitToPage, false);
  eq(`${ws.name} 缩放 100`, ws.pageSetup.scale, 100);
  ok(`${ws.name} 无打印区域`, !ws.pageSetup.printArea);
  ok(`${ws.name} 无重复标题行`, !ws.pageSetup.printTitles);
}
eq('封面列宽 A', wb.getWorksheet('报表封面').getColumn(1).width, 21.37);
eq('表二列宽 C', wb.getWorksheet('工程费用表(表二)').getColumn(3).width, 30.03);
// 页边距（ExcelJS 要求放在 pageSetup.margins 里；读回可验证）。
for (const ws of wb.worksheets) {
  const m = ws.pageSetup.margins || {};
  for (const k of ['left', 'right', 'top', 'bottom', 'header', 'footer']) {
    eq(`${ws.name} 页边距 ${k}`, m[k], LAYOUT[ws.name].margins[k], 1e-6);
  }
}
eq('表二折前行 22 行高 35.30', wb.getWorksheet('工程费用表(表二)折前').getRow(22).height, 35.3);
eq('表二折后行 22 行高 20.15', wb.getWorksheet('工程费用表(表二)').getRow(22).height, 20.15);
// 数值单元格不得为文本型数字：只扫描各表数值列（序号/规格等文本列不在内）。
const NUM_COLS = {
  '建设项目总算表(汇总表)': [5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  '工程总表(表一)': [5, 6, 7, 8, 9, 10, 11, 12],
  '工程费用表(表二)': [4, 10],
  '工程费用表(表二)折前': [4, 10],
  '工程量表(表三)甲': [6, 7, 8, 9, 10],
  '机械台班表(表三)乙': [5, 7, 8, 9, 10],
  '仪器仪表使用表(表三)丙': [5, 7, 8, 9, 10],
  '主要材料表(表四)甲': [5, 6, 7, 8, 9],
  '工程其他费用表(表五)甲': [5, 6, 7],
};
let textNum = 0;
for (const ws of wb.worksheets) {
  const cols = NUM_COLS[ws.name] || [];
  ws.eachRow((row) => row.eachCell((c) => {
    if (cols.includes(c.col) && typeof c.value === 'string' && /^-?\d+(\.\d+)?$/.test(c.value.trim())) { textNum++; console.log(`文本型数字 ${ws.name} ${c.address} = ${c.value}`); }
  }));
}
eq('文本型数字 0 个', textNum, 0);
// 分页符：ExcelJS 读回会丢 rowBreaks，故直接读 xlsx 内 sheet XML 断言。
const rowBreakIds = (file, sheetNo) => {
  const xml = execSync(`unzip -p ${file} xl/worksheets/sheet${sheetNo}.xml`, { encoding: 'utf-8' });
  return [...xml.matchAll(/<brk id="(\d+)"[^>]*\/>/g)].map((m) => Number(m[1]));
};

// 封面 / 编制说明
const cover = wb.getWorksheet('报表封面');
eq('封面标题', cell(cover, 1, 1), '通信建设工程预算书');
eq('封面工程编号', cell(cover, 2, 5), '9MA24CE0000019');
eq('封面工程造价', cell(cover, 6, 2), '275517.84元');
eq('封面编制日期', cell(cover, 15, 1), '2026年5月13日');
const notes = wb.getWorksheet('编制说明');
ok('编制说明含折扣句', String(cell(notes, 2, 1)).includes('施工折扣按37.9%计取'));
ok('编制说明含总费用', String(cell(notes, 2, 1)).includes('工程总费用：275517.84'));
ok('编制说明含编制依据', String(cell(notes, 2, 1)).includes('一、编制依据'));

// 汇总表 / 表一
const hz = wb.getWorksheet('建设项目总算表(汇总表)');
eq('汇总表标题', cell(hz, 1, 1), '建设项目总预算表（汇总表）');
eq('汇总表建安费', numCell(hz, 6, 7), 265267.65);
eq('汇总表其他费用', numCell(hz, 6, 8), 10250.19);
eq('汇总表总价值除税', numCell(hz, 6, 10), 275517.84);
eq('汇总表总价值含税', numCell(hz, 6, 12), 275517.84);
eq('汇总表表格编号', cell(hz, 6, 2), '通信线路-1');
eq('汇总表总计行', cell(hz, 7, 3), '工程总计');
eq('汇总表表尾', String(cell(hz, 25, 1)).includes('施工负责人'), true);
const t1 = wb.getWorksheet('工程总表(表一)');
eq('表一标题', cell(t1, 1, 1), '工程预算总表(表一)');
eq('表一工程费', numCell(t1, 7, 7), 265267.65);
eq('表一其他费', numCell(t1, 8, 8), 10250.19);
eq('表一总计', numCell(t1, 9, 10), 275517.84);
eq('表一总计含税', numCell(t1, 9, 12), 275517.84);

// 表二折前 / 折后（参考值）
const t2b = wb.getWorksheet('工程费用表(表二)折前');
const t2a = wb.getWorksheet('工程费用表(表二)');
eq('表二折前标题', cell(t2b, 1, 1), '建筑安装工程费用预算表（表二折前）');
eq('表二折后标题', cell(t2a, 1, 1), '建筑安装工程费用预算表（表二）');
for (const k of T2_LEFT_KEYS.concat(T2_RIGHT_KEYS.filter(Boolean))) {
  eq(`表二折前 ${k}`, t2Value(t2b, k), fixture.result.table2Before[k] || null);
  eq(`表二折后 ${k}`, t2Value(t2a, k), fixture.result.table2After[k] || null);
}
eq('表二折前技工方法', t2Method(t2b, 'techFee'), '技工总工日X114');
eq('表二折后技工方法', t2Method(t2a, 'techFee'), '技工总工日X114X37.9%');
eq('表二折后文明方法', t2Method(t2a, 'civilFee'), '人工费X1.5%/37.9%');
eq('表二折后规费方法', t2Method(t2a, 'regFee'), '(1-4之和)/37.9%');
eq('表二折后社保方法', t2Method(t2a, 'socialFee'), '人工费X28.5%');
eq('表二折前调遣方法', t2Method(t2b, 'dispatchFee'), '174X17X2');
eq('表二折后调遣方法（Q2 折后=0，方法列为空）', t2Method(t2a, 'dispatchFee'), null);
eq('表二折后搬运方法（Q2 折后=0，方法列为空）', t2Method(t2a, 'carryFee'), null);
eq('表二折后冬雨方法（Q2 折后=0，方法列为空）', t2Method(t2a, 'winterFee'), null);
eq('表二折前销项方法', t2Method(t2b, 'outputTax'), '销项税额');
eq('表二折前水电方法为空（费率 0）', t2Method(t2b, 'utilityFee'), null);

// 表三甲：分页 + 合计 + 不取费
const t3a = wb.getWorksheet('工程量表(表三)甲');
eq('表三甲分页符 1 个', rowBreakIds(tmp('reference.xlsx'), 7).length, 1);
eq('表三甲分页符在 29 行后', rowBreakIds(tmp('reference.xlsx'), 7)[0], 29);
eq('表三甲第 2 页标题', cell(t3a, 30, 1), '建筑安装工程量预算表（表三）甲');
eq('表三甲第 1 页页码', cell(t3a, 2, 10), '第1页 共2页');
eq('表三甲第 2 页页码', cell(t3a, 31, 10), '第2页 共2页');
eq('表三甲合计行标签', cell(t3a, 52, 3), '定额工日合计');
eq('表三甲技工合计', numCell(t3a, 52, 9), 1269.189);
eq('表三甲普工合计', numCell(t3a, 52, 10), 790.666);
eq('表三甲 TXL1-002 数量', numCell(t3a, 8, 6), 724.063);
eq('表三甲 TXL1-002 技工单耗', numCell(t3a, 8, 7), 0.23);
eq('表三甲 TXL1-002 技工合计', numCell(t3a, 8, 9), 166.534);
let noFeeRow = 0;
for (let r = 6; r <= 58; r++) {
  if (cell(t3a, r, 2) === '不取费') { noFeeRow = r; eq('不取费行工日为空', numCell(t3a, r, 9), null); }
}
ok('表三甲含不取费行', noFeeRow > 0);
eq('表三甲表尾行 58', String(cell(t3a, 58, 1)).includes('施工负责人'), true);

// 表三乙 / 表三丙
const t3b = wb.getWorksheet('机械台班表(表三)乙');
eq('表三乙小计标签', cell(t3b, 11, 7), '小计');
eq('表三乙小计', numCell(t3b, 11, 10), 5580.00);
eq('表三乙首行金额', numCell(t3b, 6, 10), 3507.84);
eq('表三乙首行机械', cell(t3b, 6, 6), '光纤熔接机');
const t3c = wb.getWorksheet('仪器仪表使用表(表三)丙');
eq('表三丙合计标签', cell(t3c, 14, 7), '合计');
eq('表三丙合计', numCell(t3c, 14, 10), 15455.26);

// 表四甲
const t4a = wb.getWorksheet('主要材料表(表四)甲');
eq('表四甲标题', cell(t4a, 1, 1), '国内器材预算表（表四）甲');
eq('表四甲甲供分组头', cell(t4a, 7, 2), '『甲供材料』');
eq('表四甲甲供小计', cell(t4a, 24, 2), '甲供材料小计');
eq('表四甲甲供小计值', numCell(t4a, 24, 7), 74246.30);
eq('表四甲总计', cell(t4a, 25, 2), '总计');
eq('表四甲总计值', numCell(t4a, 25, 7), 74246.30);
eq('表四甲首行单价 5 位小数', numCell(t4a, 8, 6), 0.67714);
eq('表四甲首行合计', numCell(t4a, 8, 7), 48076.63);
eq('表四甲分路器备注', cell(t4a, 22, 10), '移交县公司');
let hasYiGroup = false;
for (let r = 1; r <= t4a.rowCount; r++) if (cell(t4a, r, 2) === '『乙供材料』') hasYiGroup = true;
eq('表四甲无乙供分组（整组省略）', hasYiGroup, false);

// 表五甲
const t5 = wb.getWorksheet('工程其他费用表(表五)甲');
eq('表五甲标题', cell(t5, 1, 1), '工程建设其他费预算表（表五）甲');
eq('表五甲安全生产费', numCell(t5, 15, 5), 10250.19);
eq('表五甲安全生产费方法', cell(t5, 15, 3), '折前建安工程费除税价X2%');
eq('表五甲管理费方法', cell(t5, 7, 3), '折前建安工程费除税价X2%');
eq('表五甲设计费方法', cell(t5, 12, 3), '折前建安工程费除税价X4.95%');
eq('表五甲勘察设计费方法', cell(t5, 10, 3), '5.1+5.2之和');
eq('表五甲总计标签', cell(t5, 21, 2), '   总  计');
eq('表五甲总计', numCell(t5, 21, 5), 10250.19);
eq('表五甲生产准备行', cell(t5, 22, 2), '生产准备及开办费(运营费)');
eq('表五甲生产准备值为空', numCell(t5, 22, 5), null);
ok('表五甲表尾编制+日期同格', String(cell(t5, 28, 5)).includes('编制：adu') && String(cell(t5, 28, 5)).includes('编制日期：2026年5月13日'));
eq('表五甲空项为空', numCell(t5, 6, 5), null);

// ---- 2. 方法列与 discount.mjs 逐项一致（合成用例） ----
const rateSyn = {
  techPrice: 114, laborPrice: 61, auxRate: 0.003, envRate: 0, civilRate: 0.015,
  carryRate: 0.034, disturbRate: 0.06, handoverRate: 0.033, tempNearRate: 0.026,
  tempFarRate: 0.05, vehicleRate: 0.05, nightRate: 0.025, winterRate: 0.018,
  toolRate: 0.015, utilityRate: 0.005, protectRate: 0.02, socialRate: 0.285,
  housingRate: 0.0419, accidentRate: 0.01, mgmtRate: 0.274, profitRate: 0.2,
  jiaTax: 0.13, yiTax: 0.09, outputTax: 0.09,
};
const allKeys = [...T2_LEFT_KEYS, ...T2_RIGHT_KEYS.filter(Boolean)];
const t2syn = {};
for (const k of allKeys) t2syn[k] = 100;
t2syn.dispatchUnit = 174; t2syn.dispatchPeople = 17;
const synResult = {
  table2Before: t2syn, table2After: t2syn, table2: t2syn,
  table5: { rows: [] }, table1: {}, rate: rateSyn,
  discount: 0.379, discountRule: { discountRate: 0.379, noDiscountKeys: [...DEFAULT_NO_DISCOUNT_KEYS] },
};
await exportBudgetBook(tmp('syn-methods.xlsx'), { info: { 工程类型: '通信线路工程', 施工距离: '35KM以内' }, quantities: [] }, synResult, null, { includeSheets: ['工程费用表(表二)', '工程费用表(表二)折前'] });
const wbs = new ExcelJS.Workbook();
await wbs.xlsx.readFile(tmp('syn-methods.xlsx'));
const vars = {
  techPrice: '114', laborPrice: '61', auxRate: 0.3, civilRate: 1.5, carryRate: 3.4,
  disturbRate: 6, handoverRate: 3.3, tempRate: 2.6, vehicleRate: 5, nightRate: 2.5,
  winterRate: 1.8, toolRate: 1.5, utilityRate: 0.5, protectRate: 2, socialRate: 28.5,
  housingRate: 4.19, accidentRate: 1, mgmtRate: 27.4, profitRate: 20,
  discountRate: 0.379,
};
const noDisc = new Set(DEFAULT_NO_DISCOUNT_KEYS);
if (noDisc.has('mainMat')) { noDisc.add('jiaMat'); noDisc.add('yiMat'); }
if (noDisc.has('regFee')) ['sewageFee', 'socialFee', 'housingFee', 'accidentFee'].forEach((k) => noDisc.add(k));
// Q2 裁决 b：11 项措施费折后=0，折后表方法列为空（synResult 未给零值清单，printExport 按默认零值集处理）
const ZERO_KEYS = new Set(['carryFee', 'disturbFee', 'tempFee', 'nightFee', 'winterFee', 'utilityFee',
  'specialFee', 'protectFee', 'earthFee', 'dispatchFee', 'bigMachineFee']);
for (const k of allKeys) {
  const def = DISCOUNT_LINE_DEFS.find((d) => d.key === k);
  if (!def) { fail++; console.log(`FAIL 方法列缺 DEFS: ${k}`); continue; }
  const beforeWant = k === 'dispatchFee' ? '174X17X2' : renderMethodText(def, 'before', vars);
  const afterWant = ZERO_KEYS.has(k) ? null
    : renderMethodText(def, noDisc.has(k) ? 'restored' : 'discounted', vars);
  eq(`方法列折前 ${k}`, t2Method(wbs.getWorksheet('工程费用表(表二)折前'), k), beforeWant);
  eq(`方法列折后 ${k}`, t2Method(wbs.getWorksheet('工程费用表(表二)'), k), afterWant);
}
eq('方法列折前调遣', t2Method(wbs.getWorksheet('工程费用表(表二)折前'), 'dispatchFee'), '174X17X2');

// ---- 3. 合成工程：引擎值回读 + 变体级重建 + 设备费列 ----
const profile = seedToProfile(seed, '默认配置', {
  id: 'prof_default', source: 'seed', isBuiltIn: true,
  defaultInfo: {
    工程类型: '通信线路工程', 施工折扣: 1, 施工距离: '35KM以内',
    施工调遣分类: '施工队伍调遣人数(线路、管道）',
    冬雨季施工费: 'Ⅲ类地区', 甲供增值税: 0.13, 乙供增值税: 0.09,
  },
});
const libs = profileToLibs(profile);
const project = {
  name: '合成工程', profileId: 'prof_default',
  info: { 工程类型: '通信线路工程', 施工折扣: 0.8, 施工实际里程: 36, 冬雨季施工费: 'Ⅲ类地区', 乙供增值税: 0.09, 甲供增值税: 0.13, 编制: 'tester', 编制日期: '2026-10-14', 建设单位: '测试建设单位', 建设项目名称: '合成工程', 单项工程名称: '通信线路工程', 表格编号: 'YD-' },
  quantities: [
    { id: 'q1', quota: 'TXL1-002', variant: '光(电)缆工程施工测量 架空', unit: '', qty: 10, coef: 1 },
    { id: 'q2', quota: 'TXL3-187', variant: '挂钩法架设架空光缆 平原 6芯', unit: '', qty: 2, coef: 1 },
    { id: 'q3', quota: 'TXL3-187', variant: '挂钩法架设架空光缆 平原 24芯', unit: '', qty: 3, coef: 1 },
    { id: 'q4', quota: 'TXL1-008', variant: '', unit: '', qty: 7, coef: 1 },
    { id: 'q5', quota: 'UNKNOWN-999', variant: '不存在的定额', unit: '', qty: 5, coef: 1 },
    { id: 'q6', quota: '不取费', variant: '机架（箱）内安装光分路器（不取费）1:4', unit: '台', qty: 24, coef: 1 },
  ],
};
const res = calcProject(project, libs);
await exportBudgetBook(tmp('synthetic.xlsx'), project, res, profile);
const wbx = new ExcelJS.Workbook();
await wbx.xlsx.readFile(tmp('synthetic.xlsx'));
const t2x = wbx.getWorksheet('工程费用表(表二)');
for (const k of allKeys) eq(`合成工程表二折后 ${k}`, t2Value(t2x, k), res.table2After[k] || null);
const t2xb = wbx.getWorksheet('工程费用表(表二)折前');
for (const k of allKeys) eq(`合成工程表二折前 ${k}`, t2Value(t2xb, k), res.table2Before[k] || null);
const t1x = wbx.getWorksheet('工程总表(表一)');
eq('合成工程表一总计含税', numCell(t1x, 9, 12), res.table1.grandIncl);
eq('合成工程表一工程费除税', numCell(t1x, 7, 10), res.table1.afterDiscount + res.table1.equipFee);
const hzx = wbx.getWorksheet('建设项目总算表(汇总表)');
eq('合成工程汇总表总计含税', numCell(hzx, 6, 12), res.table1.grandIncl);
eq('合成工程封面造价', cell(wbx.getWorksheet('报表封面'), 6, 2), `${res.table1.grandIncl.toFixed(2)}元`);
const t3ax = wbx.getWorksheet('工程量表(表三)甲');
let txl3187 = 0; let orphanRow = 0; let noFeeRowX = 0;
for (let r = 6; r <= t3ax.rowCount; r++) {
  if (cell(t3ax, r, 2) === 'TXL3-187') txl3187++;
  if (cell(t3ax, r, 2) === 'UNKNOWN-999') { orphanRow = r; }
  if (cell(t3ax, r, 2) === '不取费') { noFeeRowX = r; }
}
eq('合成工程 TXL3-187 按变体拆 2 行', txl3187, 2);
ok('合成工程孤儿行渲染', orphanRow > 0);
if (orphanRow) eq('孤儿行工日为空', numCell(t3ax, orphanRow, 9), null);
ok('合成工程不取费行渲染', noFeeRowX > 0);
if (noFeeRowX) {
  eq('不取费行名称取变体', cell(t3ax, noFeeRowX, 3), '机架（箱）内安装光分路器（不取费）1:4');
  eq('不取费行工日为空', numCell(t3ax, noFeeRowX, 9), null);
}
const t3bx = wbx.getWorksheet('机械台班表(表三)乙');
let bSub = null;
for (let r = 1; r <= t3bx.rowCount; r++) if (cell(t3bx, r, 7) === '小计') bSub = numCell(t3bx, r, 10);
eq('合成工程表三乙小计 = 引擎', bSub, res.table3B.total);
const t3cx = wbx.getWorksheet('仪器仪表使用表(表三)丙');
let cSub = null;
for (let r = 1; r <= t3cx.rowCount; r++) if (cell(t3cx, r, 7) === '合计') cSub = numCell(t3cx, r, 10);
eq('合成工程表三丙合计 = 引擎', cSub, res.table3C.total);
const t4ax = wbx.getWorksheet('主要材料表(表四)甲');
let aSub = null; let aTotal = null;
for (let r = 1; r <= t4ax.rowCount; r++) {
  if (cell(t4ax, r, 2) === '甲供材料小计') aSub = numCell(t4ax, r, 7);
  if (cell(t4ax, r, 2) === '总计') aTotal = numCell(t4ax, r, 7);
}
eq('合成工程表四甲甲供小计 = 引擎', aSub, res.table4A.totalExcl || null);
eq('合成工程表四甲总计 = 三组和', aTotal, (res.table4A.totalExcl || 0) + (res.table4B.totalExcl || 0) + (res.table4Equip.totalExcl || 0) || null);
const t5x = wbx.getWorksheet('工程其他费用表(表五)甲');
let safetyCell = null; let totalCell = null;
for (let r = 1; r <= t5x.rowCount; r++) {
  if (cell(t5x, r, 2) === '安全生产费') safetyCell = numCell(t5x, r, 5);
  if (cell(t5x, r, 2) === '   总  计') totalCell = numCell(t5x, r, 5);
}
eq('合成工程表五安全生产费 = 引擎', safetyCell, res.table5.safetyFee || null);
eq('合成工程表五总计 = 引擎', totalCell, res.table5.totalExcl || null);
ok('合成工程表五总计行在生产准备行之前', (() => {
  let tr = 0; let pr = 0;
  for (let r = 1; r <= t5x.rowCount; r++) {
    if (cell(t5x, r, 2) === '   总  计') tr = r;
    if (cell(t5x, r, 2) === '生产准备及开办费(运营费)') pr = r;
  }
  return tr > 0 && pr > tr;
})());

// profile=null 时表三甲回落引擎聚合行
await exportBudgetBook(tmp('synthetic-noprofile.xlsx'), project, res, null);
const wbn = new ExcelJS.Workbook();
await wbn.xlsx.readFile(tmp('synthetic-noprofile.xlsx'));
const t3an = wbn.getWorksheet('工程量表(表三)甲');
let aggRows = 0;
for (let r = 6; r <= t3an.rowCount; r++) if (cell(t3an, r, 2) === 'TXL3-187') aggRows++;
eq('无 profile 时表三甲按编号聚合 1 行', aggRows, 1);

// ---- 4. 设备费列：封面 = 汇总表总计 = 表一总计 ----
const equipResult = JSON.parse(JSON.stringify(fixture.result));
equipResult.table4Equip = {
  rows: [{ key: '设备A|规格', name: '设备A', spec: '规格', unit: '台', qty: 2, priceExcl: 500, priceVat: 65, priceIncl: 565, amtExcl: 1000, amtVat: 130, amtIncl: 1130, unmatched: false }],
  totalExcl: 1000, totalVat: 130, totalIncl: 1130,
};
equipResult.table1 = { ...equipResult.table1, equipFee: 1000, equipVat: 130, equipIncl: 1130, grandExcl: 276517.84, grandVat: 130, grandIncl: 276647.84 };
await exportBudgetBook(tmp('equip.xlsx'), fixture.project, equipResult, null);
const wbe = new ExcelJS.Workbook();
await wbe.xlsx.readFile(tmp('equip.xlsx'));
eq('设备费封面', cell(wbe.getWorksheet('报表封面'), 6, 2), '276647.84元');
eq('设备费汇总表 E 列', numCell(wbe.getWorksheet('建设项目总算表(汇总表)'), 6, 5), 1000);
eq('设备费汇总表总计', numCell(wbe.getWorksheet('建设项目总算表(汇总表)'), 6, 12), 276647.84);
eq('设备费表一 E 列', numCell(wbe.getWorksheet('工程总表(表一)'), 7, 5), 1000);
eq('设备费表一总计', numCell(wbe.getWorksheet('工程总表(表一)'), 9, 12), 276647.84);
let equipGroup = false;
const t4ae = wbe.getWorksheet('主要材料表(表四)甲');
for (let r = 1; r <= t4ae.rowCount; r++) if (cell(t4ae, r, 2) === '『设备』') equipGroup = true;
eq('设备费表四甲有设备分组', equipGroup, true);
eq('设备费表四甲总计', (() => { for (let r = 1; r <= t4ae.rowCount; r++) if (cell(t4ae, r, 2) === '总计') return numCell(t4ae, r, 7); return null; })(), 75246.30);

// ---- 5. 分页算法 + 溢出分页 ----
eq('paginate 0', JSON.stringify(paginateTable3A(0)), JSON.stringify([0]));
eq('paginate 1', JSON.stringify(paginateTable3A(1)), JSON.stringify([1]));
eq('paginate 22', JSON.stringify(paginateTable3A(22)), JSON.stringify([22]));
eq('paginate 23', JSON.stringify(paginateTable3A(23)), JSON.stringify([23, 0]));
eq('paginate 24', JSON.stringify(paginateTable3A(24)), JSON.stringify([23, 1]));
eq('paginate 40', JSON.stringify(paginateTable3A(40)), JSON.stringify([23, 17]));
eq('paginate 41', JSON.stringify(paginateTable3A(41)), JSON.stringify([23, 18, 0]));
// 表三甲 50 组 → 3 页
const manyQuantities = seed.quotas.slice(0, 50).map((q, i) => ({ id: `m${i}`, quota: q.code, variant: `变体${i}`, unit: '', qty: 1, coef: 1 }));
const manyProject = { ...project, quantities: manyQuantities };
const manyRes = calcProject(manyProject, libs);
await exportBudgetBook(tmp('many3a.xlsx'), manyProject, manyRes, profile);
const wbm = new ExcelJS.Workbook();
await wbm.xlsx.readFile(tmp('many3a.xlsx'));
const t3am = wbm.getWorksheet('工程量表(表三)甲');
eq('表三甲 50 行 → 2 个分页符', JSON.stringify(rowBreakIds(tmp('many3a.xlsx'), 7)), JSON.stringify([29, 58]));
eq('表三甲 50 行第 3 页标题', cell(t3am, 59, 1), '建筑安装工程量预算表（表三）甲');
eq('表三甲 50 行第 3 页页码', cell(t3am, 60, 10), '第3页 共3页');
// 表三乙 30 行 → 2 页，表尾只在末页
const fakeB = { ...fixture.result, table3B: { rows: Array.from({ length: 30 }, (_, i) => ({ quota: `Q${i}`, quotaName: `项目${i}`, unit: '处', qty: 1, equipName: '机械', equipUnit: '台班', consumption: 1, price: 10, sessions: 1, amount: 10 })), total: 300 } };
await exportBudgetBook(tmp('overflow3b.xlsx'), fixture.project, fakeB, null, { includeSheets: ['机械台班表(表三)乙'] });
const wbo = new ExcelJS.Workbook();
await wbo.xlsx.readFile(tmp('overflow3b.xlsx'));
const t3bo = wbo.getWorksheet('机械台班表(表三)乙');
eq('表三乙溢出分页符在 28 行后', JSON.stringify(rowBreakIds(tmp('overflow3b.xlsx'), 1)), JSON.stringify([28]));
eq('表三乙溢出第 2 页标题', cell(t3bo, 29, 1), '建筑安装工程机械使用费预算表（表三）乙');
eq('表三乙溢出表尾在末页', String(cell(t3bo, 56, 1)).includes('施工负责人'), true);
eq('表三乙溢出第 1 页无表尾', cell(t3bo, 28, 1), 23);
// 表四甲 30 行 → 2 页
const fake4 = { ...fixture.result, table4A: { rows: Array.from({ length: 30 }, (_, i) => ({ key: `M${i}|S`, name: `材料${i}`, spec: 'S', unit: '个', qty: 1, priceExcl: 10, priceVat: 0, priceIncl: 10, amtExcl: 10, amtVat: 0, amtIncl: 10, unmatched: false })), totalExcl: 300, totalVat: 0, totalIncl: 300 }, table4B: { rows: [], totalExcl: 0, totalVat: 0, totalIncl: 0 }, table4Equip: { rows: [], totalExcl: 0, totalVat: 0, totalIncl: 0 } };
await exportBudgetBook(tmp('overflow4a.xlsx'), fixture.project, fake4, null, { includeSheets: ['主要材料表(表四)甲'] });
const wbo4 = new ExcelJS.Workbook();
await wbo4.xlsx.readFile(tmp('overflow4a.xlsx'));
const t4ao = wbo4.getWorksheet('主要材料表(表四)甲');
eq('表四甲溢出分页符在 29 行后', JSON.stringify(rowBreakIds(tmp('overflow4a.xlsx'), 1)), JSON.stringify([29]));
eq('表四甲溢出第 2 页标题', cell(t4ao, 30, 1), '国内器材预算表（表四）甲');
// includeSheets 子集
await exportBudgetBook(tmp('subset.xlsx'), fixture.project, fixture.result, null, { includeSheets: ['工程费用表(表二)'] });
const wbsub = new ExcelJS.Workbook();
await wbsub.xlsx.readFile(tmp('subset.xlsx'));
eq('includeSheets 子集 1 张', wbsub.worksheets.length, 1);

// ---- 6. 错误输入抛错（不静默返回 true） ----
let threw = false;
try { await exportBudgetBook('', fixture.project, fixture.result, null); } catch { threw = true; }
eq('空路径抛错', threw, true);
threw = false;
try { await exportBudgetBook(tmp('bad.xlsx'), fixture.project, {}, null); } catch { threw = true; }
eq('缺 result 抛错', threw, true);

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
