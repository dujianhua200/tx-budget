/**
 * 打印导出（v2 增量 3，设计文档 §5）。
 * exportBudgetBook(filePath, project, result, profile, opts) 生成 11 张表的真实 .xlsx。
 * - 只渲染引擎输出（增量 2 的 table2Before/table2After、table5.rows 等），不重算口径。
 * - 数值单元格为数值型；为 0 的金额/工日/台班/数量输出空单元格（参考文件惯例）。
 * - 版式常量来自 electron/printLayout.cjs（由 scripts/genPrintLayout.cjs 从 raw.json 生成）。
 * - 方法列模板自持一份（与 src/engine/discount.mjs 的 DISCOUNT_LINE_DEFS 逐项一致，
 *   仅 dispatchFee 用“单价X人数X2”实际数值写法，与参考折前表一致；一致性由 tests/print.test.mjs 锁定）。
 * - ExcelJS 分页符是数组 push（ws.rowBreaks.push({id})），设计文档 §5.5 的 append 写法有误。
 * CJS 模块，可在 Node 直测，不依赖 Electron。
 */
const ExcelJS = require('exceljs');
const { SHEET_ORDER, LAYOUT } = require('./printLayout.cjs');

const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
/** 导出数值：0 / 空 / 非数字 → 空单元格（参考惯例），其余原样写数值型。 */
const money = (v) => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
};
/** 文本用金额：无千分位，2 位小数（与参考文本一致，如 275517.84）。 */
const fmt2 = (v) => Number(num(v)).toFixed(2);
/** 去尾零的小数（如 12.345 / 0 / 36.5），用于调整备注与里程。 */
const fmtTrim = (v) => String(Math.round(Number(num(v)) * 1000) / 1000);
/** 费率/折扣转百分比数字（去浮点噪声：0.015→1.5，0.379→37.9）。 */
const pct = (x) => Number((Number(num(x)) * 100).toFixed(4));

/** v3.0 §13.6：各表表名标题 + 编制说明标题 → Noto Sans CJK SC（与参考结算书一致）；其余宋体/黑体照旧。 */
const F_TITLE = { name: 'Noto Sans CJK SC', size: 18, bold: true };
const F_TITLE_COVER = { name: 'Noto Sans CJK SC', size: 36, bold: true };
const F_NOTES_TITLE = { name: 'Noto Sans CJK SC', size: 21, bold: true };
const F_COVER_VAL = { name: '黑体', size: 18, bold: true };
const F_COVER_LABEL = { name: '宋体', size: 18, bold: true };
const F_COVER_NO = { name: '宋体', size: 12, bold: true };
const F_INFO = { name: '宋体', size: 9 };
const F_HEAD = { name: '宋体', size: 10 };
const F_DATA = { name: '宋体', size: 10 };
const F_FOOT = { name: '宋体', size: 10 };
const F_NOTES = { name: '宋体', size: 12 };

const A_CENTER = { horizontal: 'center', vertical: 'center', wrapText: true };
const A_LEFT = { horizontal: 'left', vertical: 'center', wrapText: true };
const A_RIGHT = { horizontal: 'right', vertical: 'center', wrapText: true };
const A_LEFT_TOP = { horizontal: 'left', vertical: 'top', wrapText: true };

const B_HEAD = {
  top: { style: 'medium' }, bottom: { style: 'medium' },
  left: { style: 'thin' }, right: { style: 'thin' },
};
const B_DATA = {
  top: { style: 'thin' }, bottom: { style: 'thin' },
  left: { style: 'thin' }, right: { style: 'thin' },
};
const B_BOTTOM_MEDIUM = { bottom: { style: 'medium' } };

const MONEY_FMT = '#,##0.00';
const DAYS_FMT = '0.000';
const QTY3_FMT = '#,##0.000';
const PRICE5_FMT = '#,##0.00000';

function colLetter(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function parseRange(range) {
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range);
  const col = (s) => { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
  return { r1: Number(m[2]), c1: col(m[1]), r2: Number(m[4]), c2: col(m[3]) };
}

/** 写单个单元格（值 + 样式；null / '' 为空白单元格）。 */
function setCell(ws, r, c, value, opt = {}) {
  const cell = ws.getCell(r, c);
  cell.value = (value === '' || value == null) ? null : value;
  if (opt.font) cell.font = opt.font;
  if (opt.alignment) cell.alignment = opt.alignment;
  if (opt.numFmt) cell.numFmt = opt.numFmt;
  if (opt.border) cell.border = opt.border;
  return cell;
}
/** 合并区：左上角写值，其余格只写边框（ExcelJS 合并后只显示左上角边框，需逐格设置）。
 * 幂等：固定表先应用 LAYOUT 合并区，表尾/空白行又可能合并同一区，重复合并会抛错，故跳过已存在的。 */
function mergeCells(ws, range, border) {
  const existing = ws.model.merges || [];
  if (existing.includes(range)) { if (border) paintMergeBorder(ws, range, border); return; }
  ws.mergeCells(range);
  if (border) paintMergeBorder(ws, range, border);
}
function paintMergeBorder(ws, range, border) {
  const { r1, c1, r2: r2e, c2 } = parseRange(range);
  for (let r = r1; r <= r2e; r++) {
    for (let c = c1; c <= c2; c++) ws.getCell(r, c).border = border;
  }
}
/** 整行涂边框（headRows 用 B_HEAD，dataRows 用 B_DATA）。 */
function paintBorders(ws, maxCol, headRows, dataRows) {
  for (const r of headRows) for (let c = 1; c <= maxCol; c++) ws.getCell(r, c).border = B_HEAD;
  for (const r of dataRows) for (let c = 1; c <= maxCol; c++) ws.getCell(r, c).border = B_DATA;
}
/** 工作表基础设置：列宽 + 页面（A4 横向、缩放 100%、fitToPage 关闭、无打印区域/重复标题/Excel 页眉页脚）。 */
function applySheetBase(ws, layoutName) {
  const L = LAYOUT[layoutName];
  ws.columns = L.colWidths.map((w) => ({ width: w }));
  ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: false, scale: 100, margins: { ...L.margins } };
}
/** 固定单页表：按 raw 行高逐行设置。 */
function applyFixedRowHeights(ws, layoutName) {
  const L = LAYOUT[layoutName];
  for (let r = 1; r <= L.maxRow; r++) ws.getRow(r).height = L.rowHeights[r] ?? L.defaultRowHeight;
}
/** 估算数据行高：换行符与超长文本按 7.2pt/行递增（2 行 = 23.75，与参考表三丙一致）。 */
function estimateRowHeight(cells) {
  let lines = 1;
  for (const { text, width } of cells) {
    if (text == null || text === '') continue;
    const s = String(text);
    const nl = s.split('\n').length;
    const wrapped = Math.max(1, Math.ceil(s.replace(/\n/g, '').length / Math.max(10, width || 20)));
    lines = Math.max(lines, nl, wrapped);
  }
  return 16.55 + (lines - 1) * 7.2;
}

/** 日期 → “YYYY年M月D日”；解析失败返回 ''。 */
function formatDateCn(s) {
  if (s instanceof Date && !Number.isNaN(s.getTime())) {
    return `${s.getFullYear()}年${s.getMonth() + 1}月${s.getDate()}日`;
  }
  if (typeof s === 'string' && s.trim()) {
    const t = s.trim();
    const m1 = /^(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(t);
    if (m1) return `${Number(m1[1])}年${Number(m1[2])}月${Number(m1[3])}日`;
    const m2 = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(t);
    if (m2) return `${Number(m2[1])}年${Number(m2[2])}月${Number(m2[3])}日`;
  }
  return '';
}
function todayCn() {
  const d = new Date();
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 表尾四段式（施工负责人 / 审核 / 编制 / 编制日期），按给定合并区写。 */
function writeFooter(ws, row, merges, ctx, opts = {}) {
  const { leader, audit, compiler, date } = ctx.footer;
  const texts = [
    `${leader}施工负责人：${ctx.info.工程负责人 || ''}`,
    `${audit}审核：${ctx.info.审核 || ''}`,
    `${compiler}编制：${ctx.info.编制 || ''}`,
    `${date}编制日期：${ctx.dateStr}`,
  ];
  merges.forEach((range, i) => {
    mergeCells(ws, range);
    const { r1, c1 } = parseRange(range);
    setCell(ws, r1, c1, texts[i], { font: F_FOOT, alignment: A_LEFT });
  });
  void opts;
}

// ---------------------------------------------------------------------------
// 表二：固定双栏布局（左栏行 5–23，右栏行 5–23）与方法列模板（§6.4，镜像 DISCOUNT_LINE_DEFS）
// ---------------------------------------------------------------------------
const TABLE2_LEFT = [
  { seq: '', label: '建安工程费(含税价)', key: 'inclTax' },
  { seq: '', label: '建安工程费(除税价)', key: 'exclTax' },
  { seq: '一', label: '直接费', key: 'directTotal' },
  { seq: '(一)', label: '直接工程费', key: 'directFee' },
  { seq: '1', label: '人工费', key: 'laborTotal' },
  { seq: '⑴', label: '技工费', key: 'techFee' },
  { seq: '⑵', label: '普工费', key: 'laborFee' },
  { seq: '2', label: '材料费', key: 'matTotal' },
  { seq: '⑴', label: '主要材料费', key: 'mainMat' },
  { seq: '⑵', label: '辅助材料费', key: 'auxMat' },
  { seq: '3', label: '机械使用费', key: 'machineFee' },
  { seq: '4', label: '仪表使用费', key: 'instrumentFee' },
  { seq: '(二)', label: '措施项目费', key: 'measureFee' },
  { seq: '1', label: '文明施工费', key: 'civilFee' },
  { seq: '2', label: '工地器材搬运费', key: 'carryFee' },
  { seq: '3', label: '工程干扰费', key: 'disturbFee' },
  { seq: '4', label: '工程点交、场地清理费', key: 'handoverFee' },
  { seq: '5', label: '临时设施费', key: 'tempFee' },
  { seq: '6', label: '工程车辆使用费', key: 'vehicleFee' },
];
const TABLE2_RIGHT = [
  { seq: '7', label: '夜间施工增加费', key: 'nightFee' },
  { seq: '8', label: '冬雨季施工增加费', key: 'winterFee' },
  { seq: '9', label: '生产工具用具使用费', key: 'toolFee' },
  { seq: '10', label: '施工用水电蒸汽费', key: 'utilityFee' },
  { seq: '11', label: '特殊地区施工增加费', key: 'specialFee' },
  { seq: '12', label: '已完工程及设备保护费', key: 'protectFee' },
  { seq: '13', label: '运土费', key: 'earthFee' },
  { seq: '14', label: '施工队伍调遣费', key: 'dispatchFee' },
  { seq: '15', label: '大型施工机械调遣费', key: 'bigMachineFee' },
  { seq: '二', label: '间接费', key: 'indirectTotal' },
  { seq: '(一)', label: '规费', key: 'regFee' },
  { seq: '1', label: '工程排污费', key: 'sewageFee' },
  { seq: '2', label: '社会保障费', key: 'socialFee' },
  { seq: '3', label: '住房公积金', key: 'housingFee' },
  { seq: '4', label: '危险作业意外伤害保险\n费', key: 'accidentFee' },
  { seq: '(二)', label: '企业管理费', key: 'mgmtFee' },
  { seq: '三', label: '利润', key: 'profit' },
  { seq: '四', label: '销项税额', key: 'outputTax' },
  { seq: '', label: '', key: null },
];
const TABLE2_METHODS = {
  techFee: { before: '技工总工日X{techPrice}', discounted: '技工总工日X{techPrice}X{discountPct}%', restored: '技工总工日X{techPrice}/{discountPct}%' },
  laborFee: { before: '普工总工日X{laborPrice}', discounted: '普工总工日X{laborPrice}X{discountPct}%', restored: '普工总工日X{laborPrice}/{discountPct}%' },
  laborTotal: { before: '技工费+普工费', discounted: '技工费+普工费', restored: '技工费+普工费' },
  jiaMat: { before: '甲供材料费用', discounted: '甲供材料费用X{discountPct}%', restored: '甲供材料费用' },
  yiMat: { before: '乙供材料费用', discounted: '乙供材料费用X{discountPct}%', restored: '乙供材料费用' },
  mainMat: { before: '主材费用', discounted: '主材费用', restored: '主材费用' },
  auxMat: { before: '主要材料费X{auxRate}%', discounted: '主要材料费X{auxRate}%X{discountPct}%', restored: '主要材料费X{auxRate}%' },
  matTotal: { before: '主要材料费+辅助材料费', discounted: '主要材料费+辅助材料费', restored: '主要材料费+辅助材料费' },
  machineFee: { before: '机械费合计', discounted: '机械费合计X{discountPct}%', restored: '机械费合计' },
  instrumentFee: { before: '仪表费合计', discounted: '仪表费合计X{discountPct}%', restored: '仪表费合计' },
  directFee: { before: '1-4之和', discounted: '1-4之和', restored: '1-4之和' },
  civilFee: { before: '人工费X{civilRate}%', discounted: '人工费X{civilRate}%X{discountPct}%', restored: '人工费X{civilRate}%/{discountPct}%' },
  carryFee: { before: '人工费X{carryRate}%', discounted: '人工费X{carryRate}%X{discountPct}%', restored: '人工费X{carryRate}%' },
  disturbFee: { before: '人工费X{disturbRate}%', discounted: '人工费X{disturbRate}%X{discountPct}%', restored: '人工费X{disturbRate}%' },
  handoverFee: { before: '人工费X{handoverRate}%', discounted: '人工费X{handoverRate}%', restored: '人工费X{handoverRate}%' },
  tempFee: { before: '人工费X{tempRate}%', discounted: '人工费X{tempRate}%X{discountPct}%', restored: '人工费X{tempRate}%/{discountPct}%' },
  vehicleFee: { before: '人工费X{vehicleRate}%', discounted: '人工费X{vehicleRate}%', restored: '人工费X{vehicleRate}%' },
  nightFee: { before: '人工费X{nightRate}%', discounted: '人工费X{nightRate}%X{discountPct}%', restored: '人工费X{nightRate}%' },
  winterFee: { before: '人工费X{winterRate}%', discounted: '人工费X{winterRate}%X{discountPct}%', restored: '人工费X{winterRate}%' },
  toolFee: { before: '人工费X{toolRate}%', discounted: '人工费X{toolRate}%', restored: '人工费X{toolRate}%' },
  utilityFee: { before: '人工费X{utilityRate}%', discounted: '人工费X{utilityRate}%X{discountPct}%', restored: '人工费X{utilityRate}%' },
  specialFee: { before: '工日X8X0', discounted: '工日X8X0X{discountPct}%', restored: '工日X8X0' },
  protectFee: { before: '人工费X{protectRate}%', discounted: '人工费X{protectRate}%X{discountPct}%', restored: '人工费X{protectRate}%' },
  earthFee: { before: '运土费', discounted: '运土费X{discountPct}%', restored: '运土费' },
  dispatchFee: { before: '调遣单价X人数X2', discounted: '调遣单价X人数X2X{discountPct}%', restored: '调遣单价X人数X2' },
  bigMachineFee: { before: '大型施工机械调遣费', discounted: '大型施工机械调遣费X{discountPct}%', restored: '大型施工机械调遣费' },
  measureFee: { before: '1-15之和', discounted: '1-15之和', restored: '1-15之和' },
  directTotal: { before: '(一)+(二)', discounted: '(一)+(二)', restored: '(一)+(二)' },
  sewageFee: { before: '工程排污费', discounted: '工程排污费X{discountPct}%', restored: '工程排污费' },
  socialFee: { before: '人工费X{socialRate}%', discounted: '人工费X{socialRate}%', restored: '人工费X{socialRate}%' },
  housingFee: { before: '人工费X{housingRate}%', discounted: '人工费X{housingRate}%', restored: '人工费X{housingRate}%' },
  accidentFee: { before: '人工费X{accidentRate}%', discounted: '人工费X{accidentRate}%', restored: '人工费X{accidentRate}%' },
  regFee: { before: '1-4之和', discounted: '1-4之和', restored: '(1-4之和)/{discountPct}%' },
  mgmtFee: { before: '人工费X{mgmtRate}%', discounted: '人工费X{mgmtRate}%', restored: '人工费X{mgmtRate}%' },
  indirectTotal: { before: '(一)+(二)', discounted: '(一)+(二)', restored: '(一)+(二)' },
  profit: { before: '人工费X{profitRate}%', discounted: '人工费X{profitRate}%', restored: '人工费X{profitRate}%' },
  exclTax: { before: '一+二+三', discounted: '一+二+三', restored: '一+二+三' },
  outputTax: { before: '销项税额', discounted: '销项税额', restored: '销项税额' },
  inclTax: { before: '一+二+三+四', discounted: '一+二+三+四', restored: '一+二+三+四' },
};
/** noDiscountKeys 合计项联动子项（与 discount.mjs DISCOUNT_PARENT_CHILDREN 一致）。 */
function effectiveNoDisc(list) {
  const s = new Set(list || []);
  if (s.has('mainMat')) { s.add('jiaMat'); s.add('yiMat'); }
  if (s.has('regFee')) ['sewageFee', 'socialFee', 'housingFee', 'accidentFee'].forEach((k) => s.add(k));
  return s;
}
/** 默认折后=0 清单（与 discount.mjs DEFAULT_ZERO_AFTER_DISCOUNT_KEYS 一致，Q2 裁决 b）。 */
const DEFAULT_ZERO_AFTER_DISCOUNT_KEYS = [
  'carryFee', 'disturbFee', 'tempFee', 'nightFee', 'winterFee', 'utilityFee',
  'specialFee', 'protectFee', 'earthFee', 'dispatchFee', 'bigMachineFee',
];
/** 折后=0 生效集合：仅折扣率 < 1 时生效（与引擎 applyDiscount 一致）。 */
function effectiveZeroKeys(list, discount) {
  if (!(discount < 1)) return new Set();
  return new Set(list ?? DEFAULT_ZERO_AFTER_DISCOUNT_KEYS);
}
/** 渲染表二一行的方法列。mode: 'before' | 'after'。 */
function table2Method(key, mode, ctx) {
  if (!key) return '';
  // 折后=0 的项：折后表整行空（含方法列，与参考折后表一致）；折前表不受影响。
  if (mode === 'after' && ctx.zeroKeys?.has(key)) return '';
  const tpl = TABLE2_METHODS[key];
  if (!tpl) return '';
  // 调遣费：用实际数值写法（与参考折前表“174X17X2”一致），不套用 DEFS 的文字模板。
  if (key === 'dispatchFee') {
    const base = `${fmtTrim(ctx.t2.dispatchUnit || 0)}X${fmtTrim(ctx.t2.dispatchPeople || 0)}X2`;
    if (mode === 'before') return base;
    return ctx.noDisc.has(key) ? base : `${base}X${ctx.vars.discountPct}%`;
  }
  // 施工用水电蒸汽费率为 0 时方法列为空（参考折前表该行方法列为空）。
  if (key === 'utilityFee' && !(num(ctx.rate.utilityRate) > 0)) return '';
  const modeKey = mode === 'before' ? 'before' : (ctx.noDisc.has(key) ? 'restored' : 'discounted');
  const t = tpl[modeKey] || '';
  return t.replace(/\{(\w+)\}/g, (_, k) => String(ctx.vars[k] ?? `{${k}}`));
}

/** 表三甲分页（§5.3）：首 23、后续每页数据 ≤18（含合计行占 1 槽，末页数据 ≤17）。 */
function paginateTable3A(n) {
  if (n <= 22) return [n];
  const chunks = [23];
  let rest = n - 23;
  while (rest > 17) { chunks.push(18); rest -= 18; }
  chunks.push(rest); // rest ∈ [0,17]；0 = 合计行独占一页
  return chunks;
}
/** 通用溢出分页（表三乙/丙、表四甲、表五甲）：非末页满页，末页留 1 行表尾。 */
function chunkSequence(n, pageTotal, headerRows) {
  const fullCap = pageTotal - headerRows;
  const lastCap = pageTotal - headerRows - 1;
  if (n <= lastCap) return [n];
  const chunks = [];
  let rest = n;
  while (rest > lastCap) { const take = Math.min(fullCap, rest - 1); chunks.push(take); rest -= take; }
  chunks.push(rest);
  return chunks;
}

/** 导出上下文：从 project/result/profile 汇总各表共用的显示值。 */
function buildCtx(project, result, profile) {
  const info = { ...(project.info || {}), ...((result && result.info) || {}) };
  const t2b = result.table2Before || result.table2 || null;
  const t2a = result.table2After || result.table2 || null;
  if (!t2b || !t2a) throw new Error('result 缺少 table2Before/table2After，无法导出表二');
  const t5 = result.table5 || null;
  if (!t5 || !Array.isArray(t5.rows)) throw new Error('result 缺少 table5.rows，无法导出表五');
  const t1 = result.table1 || {};
  const rate = result.rate || {};
  const discount = typeof result.discount === 'number' ? result.discount : 1;
  const noDisc = effectiveNoDisc(result.discountRule?.noDiscountKeys);
  const zeroKeys = effectiveZeroKeys(result.discountRule?.zeroAfterDiscountKeys, discount);
  const tempRate = info.施工距离 === '35KM以内' ? rate.tempNearRate : rate.tempFarRate;
  const vars = {
    techPrice: fmtTrim(rate.techPrice), laborPrice: fmtTrim(rate.laborPrice),
    auxRate: pct(rate.auxRate), civilRate: pct(rate.civilRate), carryRate: pct(rate.carryRate),
    disturbRate: pct(rate.disturbRate), handoverRate: pct(rate.handoverRate), tempRate: pct(tempRate),
    vehicleRate: pct(rate.vehicleRate), nightRate: pct(rate.nightRate), winterRate: pct(rate.winterRate),
    toolRate: pct(rate.toolRate), utilityRate: pct(rate.utilityRate), protectRate: pct(rate.protectRate),
    socialRate: pct(rate.socialRate), housingRate: pct(rate.housingRate), accidentRate: pct(rate.accidentRate),
    mgmtRate: pct(rate.mgmtRate), profitRate: pct(rate.profitRate),
    discountPct: pct(discount), discountRate: discount,
  };
  const dateFromInfo = formatDateCn(info.编制日期);
  const dateStr = dateFromInfo || todayCn();
  // 表格编号前缀：info.表格编号（以 - 结尾直接拼，否则补 -；为空用“通信线路-”）。
  let prefix = (info.表格编号 || '').trim();
  if (!prefix) prefix = '通信线路-';
  else if (!prefix.endsWith('-')) prefix += '-';
  const libByKey = new Map();
  const mats = profile?.libraries?.materials;
  if (Array.isArray(mats)) for (const m of mats) libByKey.set(`${m.name}|${m.spec}`, m);
  const quotaByCode = new Map();
  const quotas = profile?.libraries?.quotas;
  if (Array.isArray(quotas)) {
    for (const q of quotas) if (!quotaByCode.has(q.code)) quotaByCode.set(q.code, q);
  }
  return {
    project, result, profile, info,
    projectName: info.建设项目名称 || info.单项工程名称 || project.name || '',
    singleName: info.单项工程名称 || info.工程类型 || '',
    company: info.建设单位 || '',
    dateStr, coverDateStr: dateFromInfo || `${todayCn()}（导出日）`,
    prefix, libByKey, quotaByCode,
    t2b, t2a, t5, t1, rate, discount, noDisc, zeroKeys, vars,
    footer: { leader: '      ', audit: '', compiler: '', date: '' },
  };
}
/** 信息行页码文本。 */
const pageText = (p, total) => `第${p}页 共${total}页`;

// ---------------------------------------------------------------------------
// 1. 报表封面
// ---------------------------------------------------------------------------
function buildCover(wb, ctx) {
  const ws = wb.addWorksheet('报表封面');
  applySheetBase(ws, '报表封面');
  applyFixedRowHeights(ws, '报表封面');
  for (const m of LAYOUT['报表封面'].merged) mergeCells(ws, m);
  const { info } = ctx;
  setCell(ws, 1, 1, '通信建设工程预算书', { font: F_TITLE_COVER, alignment: A_CENTER });
  setCell(ws, 2, 5, info.项目编号 || info.表格编号 || '', { font: F_COVER_NO, alignment: A_CENTER });
  const labels = [' 建设单位：', ' 工程名称：', ' 工程造价：', ' 设计单位：', ' 施工单位：', ' 监理单位：', ' 编制单位：', ' 参审人员：'];
  const values = [
    ctx.company, ctx.projectName, `${fmt2(ctx.t1.grandIncl)}元`,
    info.设计单位 || '', info.施工单位 || '', info.监理单位 || '',
    info.编制单位 || '', info.参审人员 || '',
  ];
  labels.forEach((lab, i) => {
    const r = 4 + i;
    setCell(ws, r, 1, lab, { font: F_COVER_LABEL, alignment: A_LEFT });
    setCell(ws, r, 2, values[i], { font: F_COVER_VAL, alignment: A_LEFT });
  });
  setCell(ws, 13, 1, ' 编制人：', { font: F_COVER_LABEL, alignment: A_LEFT });
  setCell(ws, 13, 2, info.编制 || '', { font: F_COVER_VAL, alignment: A_LEFT });
  setCell(ws, 13, 3, ' 审核人：', { font: F_COVER_LABEL, alignment: A_LEFT });
  setCell(ws, 13, 4, info.审核 || '', { font: F_COVER_VAL, alignment: A_LEFT });
  setCell(ws, 14, 1, ' 资格证号：', { font: F_COVER_LABEL, alignment: A_LEFT });
  setCell(ws, 14, 2, info.编制资格证号 || info.编制证号 || '', { font: F_COVER_VAL, alignment: A_LEFT });
  setCell(ws, 14, 3, ' 资格证号：', { font: F_COVER_LABEL, alignment: A_LEFT });
  setCell(ws, 14, 4, info.审核资格证号 || info.审核证号 || '', { font: F_COVER_VAL, alignment: A_LEFT });
  setCell(ws, 15, 1, ctx.coverDateStr, { font: F_COVER_VAL, alignment: A_CENTER });
}

// ---------------------------------------------------------------------------
// 2. 编制说明
// ---------------------------------------------------------------------------
const NO_DISC_LABELS = {
  mainMat: '主要材料费', auxMat: '辅助材料费', civilFee: '文明施工费', regFee: '规费',
  socialFee: '社会保障费', housingFee: '住房公积金', accidentFee: '危险作业意外伤害保险费',
  sewageFee: '工程排污费', safetyFee: '安全生产费', jiaMat: '甲供材料', yiMat: '乙供材料',
};
function buildNotes(wb, ctx) {
  const ws = wb.addWorksheet('编制说明');
  applySheetBase(ws, '编制说明');
  applyFixedRowHeights(ws, '编制说明');
  setCell(ws, 1, 1, '编制说明', { font: F_NOTES_TITLE, alignment: A_CENTER, border: B_BOTTOM_MEDIUM });
  const { info, t1 } = ctx;
  let discountLine = '';
  if (ctx.discount < 1) {
    const keys = [...(ctx.result.discountRule?.noDiscountKeys || [])];
    const labels = [];
    for (const k of keys) {
      if (k === 'regFee') { if (!labels.includes('规费')) labels.push('规费'); continue; }
      if (['socialFee', 'housingFee', 'accidentFee', 'sewageFee'].includes(k) && keys.includes('regFee')) continue;
      if (['jiaMat', 'yiMat'].includes(k) && keys.includes('mainMat')) continue;
      const lab = NO_DISC_LABELS[k];
      if (lab && !labels.includes(lab)) labels.push(lab);
    }
    discountLine = `\n  5.施工折扣按${ctx.vars.discountPct}%计取，打折不含${labels.join('、')}。`;
  }
  const text = '一、编制依据：'
    + '\n  1.本工程定额套用中华人民共和国工业和信息化部《通信建设工程预算定额》与《通信建设工程施工机械、仪表台班费用定额》2017年版。'
    + '\n  2.取费标准及其它费用均按照工信部通信(2016)451号文发布的《通信建设工程概算、预算编制办法》、《通信建设工程费用定额》执行。'
    + '\n  3.勘查设计费：参照国家计委、建设部《关于发布<工程勘查设计费管理规定》的通知》计价格(2002)10号规定。'
    + '\n  4.建设工程监理费：根据《国家发展改革委关于进一步开放建设项目专业服务价格的通知》(发改价格(2015)299号）文件要求。'
    + discountLine
    + '\n\n二、造价分析：'
    + `\n  1.本工程属${info.工程类型 || ''},工程共分为：${info.工程类型 || ''}一个分项工程。`
    + `\n    第一个分项工程所在地距基地为${fmtTrim(info.施工实际里程)}公里，由企业施工。 `
    + `\n  2.工程总费用：${fmt2(t1.grandIncl)}，增值税${fmt2(t1.grandVat)}，`
    + `\n    其中建筑安装工程费：${fmt2(t1.afterDiscount)}，小型建筑工程费：0.00，`
    + `\n    安装设备费：${fmt2(t1.equipFee)}，不安装设备费：0.00，`
    + `\n    其他费用：${fmt2(t1.otherFee)}，预备费：0.00。`;
  setCell(ws, 2, 1, text, { font: F_NOTES, alignment: A_LEFT_TOP });
}

// ---------------------------------------------------------------------------
// 3. 汇总表
// ---------------------------------------------------------------------------
function buildSummary(wb, ctx) {
  const ws = wb.addWorksheet('建设项目总算表(汇总表)');
  const name = '建设项目总算表(汇总表)';
  applySheetBase(ws, name);
  applyFixedRowHeights(ws, name);
  for (const m of LAYOUT[name].merged) mergeCells(ws, m);
  const { t1, t5 } = ctx;
  const equipExcl = num(t1.equipFee);
  const equipVat = num(t1.equipVat);
  const after = num(t1.afterDiscount);
  const other = num(t1.otherFee);
  const otherVat = num(t1.otherVat);
  const taxAfter = num(t1.taxAfter);
  const prodPrep = num(t5.productionPrepFee);
  const totalExcl = equipExcl + after + other;
  const totalVat = equipVat + taxAfter + otherVat;
  setCell(ws, 1, 1, '建设项目总预算表（汇总表）', { font: F_TITLE, alignment: A_CENTER });
  setCell(ws, 2, 1, `建设项目名称：${ctx.projectName}`, { font: F_INFO, alignment: A_LEFT });
  setCell(ws, 2, 6, `建设单位名称：${ctx.company}`, { font: F_INFO, alignment: A_LEFT });
  setCell(ws, 2, 11, '表格编号：-总', { font: F_INFO, alignment: A_LEFT });
  setCell(ws, 2, 13, pageText(1, 1), { font: F_INFO, alignment: A_RIGHT });
  const headers3 = ['序\n号', '表格编号', '工程名称', '小型建筑\n工程费', '需要安装\n的设备费', '不需要安装\n的设备、工\n器具费', '建筑安装\n工程费', '其他费用', '预备费', '总 价 值', null, null, null, '生产准备\n及开办费'];
  headers3.forEach((h, i) => { if (h) setCell(ws, 3, i + 1, h, { font: F_HEAD, alignment: A_CENTER }); });
  setCell(ws, 4, 4, '（元）', { font: F_HEAD, alignment: A_CENTER });
  setCell(ws, 4, 10, '除税价', { font: F_HEAD, alignment: A_CENTER });
  setCell(ws, 4, 11, '增值税', { font: F_HEAD, alignment: A_CENTER });
  setCell(ws, 4, 12, '含税价', { font: F_HEAD, alignment: A_CENTER });
  setCell(ws, 4, 13, '其中外币\n()', { font: F_HEAD, alignment: A_CENTER });
  setCell(ws, 4, 14, '（元）', { font: F_HEAD, alignment: A_CENTER });
  const roman = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ', 'Ⅺ', 'Ⅻ', 'XIII', 'XIV'];
  roman.forEach((r, i) => setCell(ws, 5, i + 1, r, { font: F_DATA, alignment: A_CENTER }));
  const rowVals = [null, null, null, null, equipExcl, null, after, other, null, totalExcl, totalVat, totalExcl + totalVat, null, prodPrep];
  const writeDataRow = (r, seq, tableNo, feeName) => {
    setCell(ws, r, 1, seq, { font: F_DATA, alignment: A_CENTER });
    setCell(ws, r, 2, tableNo, { font: F_DATA, alignment: A_CENTER });
    setCell(ws, r, 3, feeName, { font: F_DATA, alignment: A_LEFT });
    rowVals.forEach((v, i) => {
      if (i < 3) return;
      setCell(ws, r, i + 1, money(v), { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
    });
  };
  writeDataRow(6, 1, `${ctx.prefix}1`, ctx.singleName);
  writeDataRow(7, 2, '', '工程总计');
  paintBorders(ws, 14, [3, 4], [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
  writeFooter(ws, 25, ['A25:D25', 'E25:G25', 'H25:J25', 'K25:N25'], ctx, {});
}

// ---------------------------------------------------------------------------
// 4. 表一
// ---------------------------------------------------------------------------
function buildTable1(wb, ctx) {
  const ws = wb.addWorksheet('工程总表(表一)');
  const name = '工程总表(表一)';
  applySheetBase(ws, name);
  applyFixedRowHeights(ws, name);
  for (const m of LAYOUT[name].merged) mergeCells(ws, m);
  const { t1 } = ctx;
  const equipExcl = num(t1.equipFee);
  const equipVat = num(t1.equipVat);
  const after = num(t1.afterDiscount);
  const other = num(t1.otherFee);
  const otherVat = num(t1.otherVat);
  const taxAfter = num(t1.taxAfter);
  setCell(ws, 1, 1, '工程预算总表(表一)', { font: F_TITLE, alignment: A_CENTER });
  setCell(ws, 2, 1, `建设项目名称：${ctx.projectName}`, { font: F_INFO, alignment: A_LEFT });
  setCell(ws, 3, 1, `项目名称：${ctx.singleName}`, { font: F_INFO, alignment: A_LEFT });
  setCell(ws, 3, 5, `建设单位名称：${ctx.company}`, { font: F_INFO, alignment: A_LEFT });
  setCell(ws, 3, 10, '表格编号：-1', { font: F_INFO, alignment: A_LEFT });
  setCell(ws, 3, 12, pageText(1, 1), { font: F_INFO, alignment: A_RIGHT });
  const headers4 = ['序\n号', '表格编号', '费用名称', '小型建筑\n工程费', '需要安装\n的设备费', '不需要安装\n的设备、工\n器具费', '建筑安装\n工程费', '其他费用', '预备费', '总 价 值', null, null, null];
  headers4.forEach((h, i) => { if (h) setCell(ws, 4, i + 1, h, { font: F_HEAD, alignment: A_CENTER }); });
  setCell(ws, 5, 4, '（元）', { font: F_HEAD, alignment: A_CENTER });
  setCell(ws, 5, 10, '除税价', { font: F_HEAD, alignment: A_CENTER });
  setCell(ws, 5, 11, '增值税', { font: F_HEAD, alignment: A_CENTER });
  setCell(ws, 5, 12, '含税价', { font: F_HEAD, alignment: A_CENTER });
  setCell(ws, 5, 13, '其中外币\n()', { font: F_HEAD, alignment: A_CENTER });
  const roman = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ', 'Ⅺ', 'Ⅻ', 'XIII'];
  roman.forEach((r, i) => setCell(ws, 6, i + 1, r, { font: F_DATA, alignment: A_CENTER }));
  const writeRow = (r, seq, tableNo, feeName, e, g, h) => {
    const excl = num(e) + num(g) + num(h);
    const vat = r === 7 ? num(equipVat) + taxAfter : r === 8 ? otherVat : num(equipVat) + taxAfter + otherVat;
    setCell(ws, r, 1, seq, { font: F_DATA, alignment: A_CENTER });
    setCell(ws, r, 2, tableNo, { font: F_DATA, alignment: A_CENTER });
    setCell(ws, r, 3, feeName, { font: F_DATA, alignment: A_LEFT });
    setCell(ws, r, 5, money(e), { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
    setCell(ws, r, 7, money(g), { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
    setCell(ws, r, 8, money(h), { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
    setCell(ws, r, 10, money(excl), { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
    setCell(ws, r, 11, money(vat), { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
    setCell(ws, r, 12, money(excl + vat), { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
  };
  writeRow(7, 1, `${ctx.prefix}2`, '工程费', equipExcl, after, 0);
  writeRow(8, 2, `${ctx.prefix}5甲`, '工程建设其他费', 0, 0, other);
  writeRow(9, 3, '', '总 计', equipExcl, after, other);
  paintBorders(ws, 13, [4, 5], [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]);
  writeFooter(ws, 27, ['A27:D27', 'E27:G27', 'H27:J27', 'K27:M27'], ctx, {});
}

// ---------------------------------------------------------------------------
// 5/6. 表二（折后 / 折前）：版式完全一致，仅方法列与数值不同
// ---------------------------------------------------------------------------
function buildTable2(wb, ctx, after) {
  const sheetName = after ? '工程费用表(表二)' : '工程费用表(表二)折前';
  const ws = wb.addWorksheet(sheetName);
  applySheetBase(ws, sheetName);
  applyFixedRowHeights(ws, sheetName);
  for (const m of LAYOUT[sheetName].merged) mergeCells(ws, m);
  const t2 = after ? ctx.t2a : ctx.t2b;
  const mctx = { t2, rate: ctx.rate, vars: ctx.vars, noDisc: ctx.noDisc, zeroKeys: ctx.zeroKeys };
  setCell(ws, 1, 1, after ? '建筑安装工程费用预算表（表二）' : '建筑安装工程费用预算表（表二折前）', { font: F_TITLE, alignment: A_CENTER });
  setCell(ws, 2, 1, `工程名称：${ctx.singleName}`, { font: F_INFO, alignment: A_LEFT });
  setCell(ws, 2, 4, `建设单位名称：${ctx.company}`, { font: F_INFO, alignment: A_LEFT });
  setCell(ws, 2, 9, '表格编号：-2', { font: F_INFO, alignment: A_LEFT });
  setCell(ws, 2, 10, pageText(1, 1), { font: F_INFO, alignment: A_RIGHT });
  setCell(ws, 3, 1, '序号', { font: F_HEAD, alignment: A_CENTER });
  setCell(ws, 3, 2, '费用名称', { font: F_HEAD, alignment: A_CENTER });
  setCell(ws, 3, 3, '依据和计算方法', { font: F_HEAD, alignment: A_CENTER });
  setCell(ws, 3, 4, '合计(元)', { font: F_HEAD, alignment: A_CENTER });
  setCell(ws, 3, 5, ' ', { font: F_HEAD, alignment: A_LEFT });
  setCell(ws, 3, 6, '序号', { font: F_HEAD, alignment: A_CENTER });
  setCell(ws, 3, 7, '费用名称', { font: F_HEAD, alignment: A_CENTER });
  setCell(ws, 3, 8, '依据和计算方法', { font: F_HEAD, alignment: A_CENTER });
  setCell(ws, 3, 10, '合计(元)', { font: F_HEAD, alignment: A_CENTER });
  for (const [c, v] of [[1, 'Ⅰ'], [2, 'Ⅱ'], [3, 'Ⅲ'], [4, 'Ⅳ'], [6, 'Ⅰ'], [7, 'Ⅱ'], [8, 'Ⅲ'], [10, 'Ⅳ']]) {
    setCell(ws, 4, c, v, { font: F_DATA, alignment: A_CENTER });
  }
  const writeSide = (rows, cols) => {
    rows.forEach((row, i) => {
      const r = 5 + i;
      const [seqC, labelC, methodC, valueC] = cols;
      setCell(ws, r, seqC, row.seq || null, { font: F_DATA, alignment: A_CENTER });
      setCell(ws, r, labelC, row.label || null, { font: F_DATA, alignment: A_LEFT });
      const method = row.key ? table2Method(row.key, after ? 'after' : 'before', mctx) : '';
      setCell(ws, r, methodC, method || null, { font: F_DATA, alignment: A_LEFT });
      setCell(ws, r, valueC, row.key ? money(t2[row.key]) : null, { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
    });
  };
  writeSide(TABLE2_LEFT, [1, 2, 3, 4]);
  writeSide(TABLE2_RIGHT, [6, 7, 8, 10]);
  paintBorders(ws, 10, [3, 4], Array.from({ length: 19 }, (_, i) => 5 + i));
  // 表尾：A24:B24 / C24:D24 / F24:H24 / I24:J24（E24 为间隔列，留空格）。
  mergeCells(ws, 'A24:B24');
  setCell(ws, 24, 1, `施工负责人：${ctx.info.工程负责人 || ''}`, { font: F_FOOT, alignment: A_LEFT });
  mergeCells(ws, 'C24:D24');
  setCell(ws, 24, 3, `     审核：${ctx.info.审核 || ''}`, { font: F_FOOT, alignment: A_LEFT });
  setCell(ws, 24, 5, ' ', { font: F_FOOT, alignment: A_LEFT });
  mergeCells(ws, 'F24:H24');
  setCell(ws, 24, 6, `编制：${ctx.info.编制 || ''}`, { font: F_FOOT, alignment: A_LEFT });
  mergeCells(ws, 'I24:J24');
  setCell(ws, 24, 9, `    编制日期：${ctx.dateStr}`, { font: F_FOOT, alignment: A_LEFT });
}

/** 工程量按 (定额编号, 变体) 分组（首次出现顺序；孤儿行单独成组，见 §11）。 */
function groupQuantities(project, quotaByCode) {
  const entries = [];
  const map = new Map();
  for (const q of project.quantities || []) {
    const quota = quotaByCode.get(q.quota);
    const qty = num(q.qty);
    if (quota) {
      const coef = q.coef == null || q.coef === '' ? 1 : num(q.coef);
      if (!(qty > 0) || !(coef > 0)) continue; // 零/无效行不参与计算（与引擎一致）
      const key = `q|${q.quota}|${q.variant || ''}`;
      let e = map.get(key);
      if (!e) { e = { kind: 'normal', code: q.quota, variant: q.variant || '', weighted: 0 }; map.set(key, e); entries.push(e); }
      e.weighted += qty * coef;
    } else {
      if (!(qty > 0)) continue;
      const coef = typeof q.coef === 'number' && q.coef > 0 ? q.coef : 1;
      const key = `o|${q.quota}|${q.variant || ''}`;
      let e = map.get(key);
      if (!e) { e = { kind: 'orphan', code: q.quota, variant: q.variant || '', unit: q.unit || '', weighted: 0 }; map.set(key, e); entries.push(e); }
      e.weighted += qty * coef;
    }
  }
  return entries;
}
/** 定额库项目名称 + 变体后缀（变体为空时取定额库 name）。 */
function displayName(quota, variant) {
  return variant ? `${quota.name} ${variant}` : quota.name;
}

// ---------------------------------------------------------------------------
// 7. 表三甲（分页：每页 29 行）
// ---------------------------------------------------------------------------
function buildTable3A(wb, ctx) {
  const ws = wb.addWorksheet('工程量表(表三)甲');
  applySheetBase(ws, '工程量表(表三)甲');
  const { result } = ctx;
  const hasProfile = ctx.profile?.libraries?.quotas && Array.isArray(ctx.profile.libraries.quotas);
  let entries;
  if (hasProfile) {
    entries = groupQuantities(ctx.project, ctx.quotaByCode).map((e) => {
      if (e.kind === 'orphan') {
        const isNoFee = e.code === '不取费' || e.code.includes('不取费') || e.code.includes('预留');
        return {
          code: isNoFee ? '不取费' : e.code,
          name: e.code === '不取费' ? e.variant : (isNoFee ? `${e.code}${e.variant ? ` ${e.variant}` : ''}` : e.variant),
          unit: e.unit, qty: r2(e.weighted), techUnit: null, laborUnit: null, tech: null, labor: null,
        };
      }
      const quota = ctx.quotaByCode.get(e.code);
      return {
        code: e.code, name: displayName(quota, e.variant), unit: quota.unit,
        qty: r2(e.weighted), techUnit: num(quota.tech), laborUnit: num(quota.labor),
        tech: r2(e.weighted * num(quota.tech)), labor: r2(e.weighted * num(quota.labor)),
      };
    });
  } else {
    entries = (result.table3A || []).map((r) => ({
      code: r.code, name: r.name, unit: r.unit, qty: r.qty,
      techUnit: r.techUnit, laborUnit: r.laborUnit, tech: r.tech, labor: r.labor,
    }));
  }
  const N = entries.length;
  const chunks = paginateTable3A(N);
  const totalPages = chunks.length;
  const techSub = num(result.techSub);
  const laborSub = num(result.laborSub);
  const techDays = result.techDays != null ? num(result.techDays) : entries.reduce((s, e) => s + num(e.tech), 0);
  const laborDays = result.laborDays != null ? num(result.laborDays) : entries.reduce((s, e) => s + num(e.labor), 0);
  let adjNote = '';
  const techAdj = techDays - techSub;
  const laborAdj = laborDays - laborSub;
  if (Math.abs(techAdj) > 0.0005 || Math.abs(laborAdj) > 0.0005) {
    adjNote = `（其中调整技工 +${fmtTrim(techAdj)} / 普工 +${fmtTrim(laborAdj)} 工日）`;
  }
  let cursor = 0;
  chunks.forEach((size, pi) => {
    const base = pi * 29;
    const page = pi + 1;
    const isLast = pi === totalPages - 1;
    mergeCells(ws, `A${base + 1}:J${base + 1}`);
    setCell(ws, base + 1, 1, '建筑安装工程量预算表（表三）甲', { font: F_TITLE, alignment: A_CENTER });
    mergeCells(ws, `A${base + 2}:C${base + 2}`);
    setCell(ws, base + 2, 1, `工程名称：${ctx.singleName}`, { font: F_INFO, alignment: A_LEFT });
    mergeCells(ws, `D${base + 2}:G${base + 2}`);
    setCell(ws, base + 2, 4, `建设单位名称：${ctx.company}`, { font: F_INFO, alignment: A_LEFT });
    mergeCells(ws, `H${base + 2}:I${base + 2}`);
    setCell(ws, base + 2, 8, '表格编号：-3甲', { font: F_INFO, alignment: A_LEFT });
    setCell(ws, base + 2, 10, pageText(page, totalPages), { font: F_INFO, alignment: A_RIGHT });
    mergeCells(ws, `A${base + 3}:A${base + 4}`);
    setCell(ws, base + 3, 1, '序号', { font: F_HEAD, alignment: A_CENTER });
    mergeCells(ws, `B${base + 3}:B${base + 4}`);
    setCell(ws, base + 3, 2, '定额编号', { font: F_HEAD, alignment: A_CENTER });
    mergeCells(ws, `C${base + 3}:D${base + 4}`);
    setCell(ws, base + 3, 3, '项目名称', { font: F_HEAD, alignment: A_CENTER });
    mergeCells(ws, `E${base + 3}:E${base + 4}`);
    setCell(ws, base + 3, 5, '单位', { font: F_HEAD, alignment: A_CENTER });
    mergeCells(ws, `F${base + 3}:F${base + 4}`);
    setCell(ws, base + 3, 6, '数量', { font: F_HEAD, alignment: A_CENTER });
    mergeCells(ws, `G${base + 3}:H${base + 3}`);
    setCell(ws, base + 3, 7, '单位定额值（工日）', { font: F_HEAD, alignment: A_CENTER });
    mergeCells(ws, `I${base + 3}:J${base + 3}`);
    setCell(ws, base + 3, 9, '合计值（工日）', { font: F_HEAD, alignment: A_CENTER });
    setCell(ws, base + 4, 7, '技工', { font: F_HEAD, alignment: A_CENTER });
    setCell(ws, base + 4, 8, '普工', { font: F_HEAD, alignment: A_CENTER });
    setCell(ws, base + 4, 9, '技工', { font: F_HEAD, alignment: A_CENTER });
    setCell(ws, base + 4, 10, '普工', { font: F_HEAD, alignment: A_CENTER });
    const roman = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ'];
    mergeCells(ws, `C${base + 5}:D${base + 5}`);
    roman.forEach((v, i) => setCell(ws, base + 5, [1, 2, 3, 5, 6, 7, 8, 9, 10][i], v, { font: F_DATA, alignment: A_CENTER }));
    for (let i = 0; i < size; i++) {
      const e = entries[cursor];
      const r = base + 6 + i;
      mergeCells(ws, `C${r}:D${r}`);
      setCell(ws, r, 1, cursor + 1, { font: F_DATA, alignment: A_CENTER });
      setCell(ws, r, 2, e.code, { font: F_DATA, alignment: A_CENTER });
      setCell(ws, r, 3, e.name, { font: F_DATA, alignment: A_LEFT });
      setCell(ws, r, 5, e.unit, { font: F_DATA, alignment: A_CENTER });
      setCell(ws, r, 6, money(e.qty), { font: F_DATA, alignment: A_RIGHT, numFmt: QTY3_FMT });
      setCell(ws, r, 7, money(e.techUnit), { font: F_DATA, alignment: A_RIGHT, numFmt: DAYS_FMT });
      setCell(ws, r, 8, money(e.laborUnit), { font: F_DATA, alignment: A_RIGHT, numFmt: DAYS_FMT });
      setCell(ws, r, 9, money(e.tech), { font: F_DATA, alignment: A_RIGHT, numFmt: DAYS_FMT });
      setCell(ws, r, 10, money(e.labor), { font: F_DATA, alignment: A_RIGHT, numFmt: DAYS_FMT });
      ws.getRow(r).height = estimateRowHeight([{ text: e.name, width: 42 }]);
      cursor++;
    }
    if (isLast) {
      const r = base + 6 + size;
      mergeCells(ws, `C${r}:D${r}`);
      setCell(ws, r, 1, N + 1, { font: F_DATA, alignment: A_CENTER });
      setCell(ws, r, 3, `定额工日合计${adjNote}`, { font: F_DATA, alignment: A_LEFT });
      setCell(ws, r, 9, money(techDays), { font: F_DATA, alignment: A_RIGHT, numFmt: DAYS_FMT });
      setCell(ws, r, 10, money(laborDays), { font: F_DATA, alignment: A_RIGHT, numFmt: DAYS_FMT });
      ws.getRow(r).height = 16.55;
      // 空白填充行同样合并 C:D（与参考一致；直至表尾前一行）。
      for (let br = r + 1; br <= base + 28; br++) mergeCells(ws, `C${br}:D${br}`);
    }
    const footerRow = base + 29;
    mergeCells(ws, `A${footerRow}:C${footerRow}`);
    setCell(ws, footerRow, 1, `施工负责人：${ctx.info.工程负责人 || ''}`, { font: F_FOOT, alignment: A_LEFT });
    mergeCells(ws, `D${footerRow}:F${footerRow}`);
    setCell(ws, footerRow, 4, `审核：${ctx.info.审核 || ''}`, { font: F_FOOT, alignment: A_LEFT });
    mergeCells(ws, `G${footerRow}:H${footerRow}`);
    setCell(ws, footerRow, 7, `编制：${ctx.info.编制 || ''}`, { font: F_FOOT, alignment: A_LEFT });
    mergeCells(ws, `I${footerRow}:J${footerRow}`);
    setCell(ws, footerRow, 9, `编制日期：${ctx.dateStr}`, { font: F_FOOT, alignment: A_LEFT });
    ws.getRow(base + 1).height = 23.05;
    ws.getRow(base + 2).height = 13.7;
    for (let r = base + 3; r <= base + 27; r++) if (!ws.getRow(r).height) ws.getRow(r).height = 16.55;
    ws.getRow(base + 28).height = 17.3;
    ws.getRow(footerRow).height = 15.1;
    paintBorders(ws, 10, [base + 3, base + 4], Array.from({ length: 24 }, (_, i) => base + 5 + i));
    if (!isLast) ws.rowBreaks.push({ id: base + 29 });
  });
}

// ---------------------------------------------------------------------------
// 8/9. 表三乙 / 表三丙（溢出按通用规则分页）
// ---------------------------------------------------------------------------
function buildEquipRows(ctx, kind) {
  const engineTable = kind === 'machine' ? ctx.result.table3B : ctx.result.table3C;
  const libs = ctx.profile?.libraries;
  const hasProfile = libs && Array.isArray(libs.quotas)
    && Array.isArray(kind === 'machine' ? libs.quotaMachines : libs.quotaInstruments);
  if (!hasProfile) {
    return {
      rows: (engineTable?.rows || []).map((r) => ({ ...r })),
      total: num(engineTable?.total),
    };
  }
  const mappings = kind === 'machine' ? libs.quotaMachines : libs.quotaInstruments;
  const priceMap = new Map(((kind === 'machine' ? libs.machinePrices : libs.instrumentPrices) || []).map((m) => [m.code, m.price]));
  const byCode = new Map();
  for (const m of mappings) {
    if (!byCode.has(m.quota)) byCode.set(m.quota, []);
    byCode.get(m.quota).push(m);
  }
  const rows = [];
  for (const g of groupQuantities(ctx.project, ctx.quotaByCode)) {
    if (g.kind !== 'normal') continue;
    const quota = ctx.quotaByCode.get(g.code);
    for (const m of byCode.get(g.code) || []) {
      const sessions = g.weighted * num(m.qty);
      const price = num(priceMap.get(m.mcode));
      rows.push({
        quota: g.code, quotaName: displayName(quota, g.variant), unit: quota.unit,
        qty: r2(g.weighted), equipName: m.mname, equipUnit: m.unit,
        consumption: num(m.qty), price, sessions: r2(sessions), amount: r2(sessions * price),
      });
    }
  }
  return { rows, total: num(engineTable?.total) };
}
function buildTable3BC(wb, ctx, kind) {
  const isMachine = kind === 'machine';
  const sheetName = isMachine ? '机械台班表(表三)乙' : '仪器仪表使用表(表三)丙';
  const ws = wb.addWorksheet(sheetName);
  applySheetBase(ws, sheetName);
  const { rows, total } = buildEquipRows(ctx, kind);
  const seqRows = [...rows, { subtotal: true }];
  const pageTotal = LAYOUT[sheetName].maxRow;
  const headerRows = 5;
  const chunks = chunkSequence(seqRows.length, pageTotal, headerRows);
  const totalPages = chunks.length;
  const equipHeader = isMachine ? '机械名称' : '仪表名称';
  const totalLabel = isMachine ? '小计' : '合计';
  const tableNo = isMachine ? '-3乙' : '-3丙';
  let cursor = 0;
  let seqNo = 0; // 数据行序号，跨页连续
  chunks.forEach((size, pi) => {
    const base = pi * pageTotal;
    const page = pi + 1;
    const isLast = pi === totalPages - 1;
    mergeCells(ws, `A${base + 1}:J${base + 1}`);
    setCell(ws, base + 1, 1, isMachine ? '建筑安装工程机械使用费预算表（表三）乙' : '建筑安装工程仪器仪表使用费预算表（表三）丙', { font: F_TITLE, alignment: A_CENTER });
    mergeCells(ws, `A${base + 2}:C${base + 2}`);
    setCell(ws, base + 2, 1, `工程名称：${ctx.singleName}`, { font: F_INFO, alignment: A_LEFT });
    mergeCells(ws, `D${base + 2}:F${base + 2}`);
    setCell(ws, base + 2, 4, `建设单位名称：${ctx.company}`, { font: F_INFO, alignment: A_LEFT });
    mergeCells(ws, `G${base + 2}:H${base + 2}`);
    setCell(ws, base + 2, 7, `表格编号：${tableNo}`, { font: F_INFO, alignment: A_LEFT });
    mergeCells(ws, `I${base + 2}:J${base + 2}`);
    setCell(ws, base + 2, 9, pageText(page, totalPages), { font: F_INFO, alignment: A_RIGHT });
    for (const [c, v] of [[1, '序\n号'], [2, '定额编号'], [3, '项目名称'], [4, '单位'], [5, '数量'], [6, equipHeader]]) {
      mergeCells(ws, `${colLetter(c)}${base + 3}:${colLetter(c)}${base + 4}`);
      setCell(ws, base + 3, c, v, { font: F_HEAD, alignment: A_CENTER });
    }
    mergeCells(ws, `G${base + 3}:H${base + 3}`);
    setCell(ws, base + 3, 7, '单位定额值', { font: F_HEAD, alignment: A_CENTER });
    mergeCells(ws, `I${base + 3}:J${base + 3}`);
    setCell(ws, base + 3, 9, '合计值', { font: F_HEAD, alignment: A_CENTER });
    setCell(ws, base + 4, 7, '数量(台班)', { font: F_HEAD, alignment: A_CENTER });
    setCell(ws, base + 4, 8, '单价(元)', { font: F_HEAD, alignment: A_CENTER });
    setCell(ws, base + 4, 9, '数量(台班)', { font: F_HEAD, alignment: A_CENTER });
    setCell(ws, base + 4, 10, '合价(元)', { font: F_HEAD, alignment: A_CENTER });
    const roman = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ'];
    roman.forEach((v, i) => setCell(ws, base + 5, i + 1, v, { font: F_DATA, alignment: A_CENTER }));
    for (let i = 0; i < size; i++) {
      const item = seqRows[cursor];
      const r = base + 6 + i;
      if (item.subtotal) {
        setCell(ws, r, 1, seqNo + 1, { font: F_DATA, alignment: A_CENTER });
        setCell(ws, r, 7, totalLabel, { font: F_DATA, alignment: A_CENTER });
        setCell(ws, r, 10, money(total), { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
      } else {
        seqNo++;
        setCell(ws, r, 1, seqNo, { font: F_DATA, alignment: A_CENTER });
        setCell(ws, r, 2, item.quota, { font: F_DATA, alignment: A_CENTER });
        setCell(ws, r, 3, item.quotaName, { font: F_DATA, alignment: A_LEFT });
        setCell(ws, r, 4, item.unit, { font: F_DATA, alignment: A_CENTER });
        setCell(ws, r, 5, money(item.qty), { font: F_DATA, alignment: A_RIGHT, numFmt: QTY3_FMT });
        setCell(ws, r, 6, item.equipName, { font: F_DATA, alignment: A_LEFT });
        setCell(ws, r, 7, money(item.consumption), { font: F_DATA, alignment: A_RIGHT, numFmt: DAYS_FMT });
        setCell(ws, r, 8, money(item.price), { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
        setCell(ws, r, 9, money(item.sessions), { font: F_DATA, alignment: A_RIGHT, numFmt: DAYS_FMT });
        setCell(ws, r, 10, money(item.amount), { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
        ws.getRow(r).height = estimateRowHeight([{ text: item.quotaName, width: 30 }]);
      }
      cursor++;
    }
    const footerRow = base + pageTotal;
    if (isLast) {
      mergeCells(ws, `A${footerRow}:C${footerRow}`);
      setCell(ws, footerRow, 1, `施工负责人：${ctx.info.工程负责人 || ''}`, { font: F_FOOT, alignment: A_LEFT });
      mergeCells(ws, `D${footerRow}:F${footerRow}`);
      setCell(ws, footerRow, 4, `审核：${ctx.info.审核 || ''}`, { font: F_FOOT, alignment: A_LEFT });
      mergeCells(ws, `G${footerRow}:H${footerRow}`);
      setCell(ws, footerRow, 7, `编制：${ctx.info.编制 || ''}`, { font: F_FOOT, alignment: A_LEFT });
      mergeCells(ws, `I${footerRow}:J${footerRow}`);
      setCell(ws, footerRow, 9, `编制日期：${ctx.dateStr}`, { font: F_FOOT, alignment: A_LEFT });
    }
    const L = LAYOUT[sheetName];
    for (let k = 1; k <= headerRows; k++) ws.getRow(base + k).height = L.rowHeights[k];
    for (let r = base + headerRows + 1; r <= base + pageTotal - (isLast ? 1 : 0); r++) {
      if (!ws.getRow(r).height) ws.getRow(r).height = 16.55;
    }
    if (isLast) {
      ws.getRow(base + pageTotal - 1).height = 17.3;
      ws.getRow(footerRow).height = 15.1;
    }
    const headRows = [base + 3, base + 4];
    const dataRows = [];
    for (let r = base + 5; r <= base + pageTotal - (isLast ? 1 : 0); r++) dataRows.push(r);
    paintBorders(ws, 10, headRows, dataRows);
    if (!isLast) ws.rowBreaks.push({ id: base + pageTotal });
  });
}

// ---------------------------------------------------------------------------
// 10. 表四甲（甲供 / 乙供 / 设备三组；无某组则整组省略）
// ---------------------------------------------------------------------------
function buildTable4A(wb, ctx) {
  const ws = wb.addWorksheet('主要材料表(表四)甲');
  const sheetName = '主要材料表(表四)甲';
  applySheetBase(ws, sheetName);
  const groups = [
    { label: '『甲供材料』', sublabel: '甲供材料小计', table: ctx.result.table4A },
    { label: '『乙供材料』', sublabel: '乙供材料小计', table: ctx.result.table4B },
    { label: '『设备』', sublabel: '设备小计', table: ctx.result.table4Equip },
  ].filter((g) => (g.table?.rows || []).length > 0);
  const seqRows = [];
  for (const g of groups) {
    seqRows.push({ type: 'group', label: g.label });
    for (const r of g.table.rows) seqRows.push({ type: 'data', ...r });
    seqRows.push({ type: 'subtotal', label: g.sublabel, table: g.table });
  }
  seqRows.push({ type: 'total' });
  const pageTotal = LAYOUT[sheetName].maxRow;
  const headerRows = 6;
  const chunks = chunkSequence(seqRows.length, pageTotal, headerRows);
  const totalPages = chunks.length;
  let cursor = 0;
  let seqNo = 0;
  chunks.forEach((size, pi) => {
    const base = pi * pageTotal;
    const page = pi + 1;
    const isLast = pi === totalPages - 1;
    mergeCells(ws, `A${base + 1}:J${base + 1}`);
    setCell(ws, base + 1, 1, '国内器材预算表（表四）甲', { font: F_TITLE, alignment: A_CENTER });
    mergeCells(ws, `A${base + 2}:J${base + 2}`);
    setCell(ws, base + 2, 1, '（主材）表', { font: F_HEAD, alignment: A_CENTER });
    mergeCells(ws, `A${base + 3}:C${base + 3}`);
    setCell(ws, base + 3, 1, `工程名称：${ctx.singleName}`, { font: F_INFO, alignment: A_LEFT });
    mergeCells(ws, `D${base + 3}:G${base + 3}`);
    setCell(ws, base + 3, 4, `建设单位名称：${ctx.company}`, { font: F_INFO, alignment: A_LEFT });
    mergeCells(ws, `H${base + 3}:I${base + 3}`);
    setCell(ws, base + 3, 8, '表格编号：-4甲A', { font: F_INFO, alignment: A_LEFT });
    setCell(ws, base + 3, 10, pageText(page, totalPages), { font: F_INFO, alignment: A_RIGHT });
    for (const [c, v] of [[1, '序号'], [2, '名 称'], [3, '规格程式'], [4, '单位'], [5, '数量']]) {
      mergeCells(ws, `${colLetter(c)}${base + 4}:${colLetter(c)}${base + 5}`);
      setCell(ws, base + 4, c, v, { font: F_HEAD, alignment: A_CENTER });
    }
    setCell(ws, base + 4, 6, '单价(元)', { font: F_HEAD, alignment: A_CENTER });
    mergeCells(ws, `G${base + 4}:I${base + 4}`);
    setCell(ws, base + 4, 7, '合计(元)', { font: F_HEAD, alignment: A_CENTER });
    mergeCells(ws, `J${base + 4}:J${base + 5}`);
    setCell(ws, base + 4, 10, '备 注', { font: F_HEAD, alignment: A_CENTER });
    setCell(ws, base + 5, 6, '除税价', { font: F_HEAD, alignment: A_CENTER });
    setCell(ws, base + 5, 7, '除税价', { font: F_HEAD, alignment: A_CENTER });
    setCell(ws, base + 5, 8, '增值税', { font: F_HEAD, alignment: A_CENTER });
    setCell(ws, base + 5, 9, '含税价', { font: F_HEAD, alignment: A_CENTER });
    const roman = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ'];
    roman.forEach((v, i) => setCell(ws, base + 6, i + 1, v, { font: F_DATA, alignment: A_CENTER }));
    for (let i = 0; i < size; i++) {
      const item = seqRows[cursor];
      const r = base + 7 + i;
      if (item.type === 'group') {
        setCell(ws, r, 2, item.label, { font: F_DATA, alignment: A_LEFT });
      } else if (item.type === 'subtotal') {
        setCell(ws, r, 2, item.label, { font: F_DATA, alignment: A_LEFT });
        setCell(ws, r, 7, money(item.table.totalExcl), { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
        setCell(ws, r, 8, money(item.table.totalVat), { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
        setCell(ws, r, 9, money(item.table.totalIncl), { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
      } else if (item.type === 'total') {
        setCell(ws, r, 2, '总计', { font: F_DATA, alignment: A_LEFT });
        const sum = (k) => groups.reduce((s, g) => s + num(g.table[k]), 0);
        setCell(ws, r, 7, money(sum('totalExcl')), { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
        setCell(ws, r, 8, money(sum('totalVat')), { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
        setCell(ws, r, 9, money(sum('totalIncl')), { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
      } else {
        seqNo++;
        const lib = ctx.libByKey.get(item.key);
        const remark = item.remark || (item.unmatched ? '未建档' : (lib?.remark || ''));
        setCell(ws, r, 1, seqNo, { font: F_DATA, alignment: A_CENTER });
        setCell(ws, r, 2, item.name, { font: F_DATA, alignment: A_LEFT });
        setCell(ws, r, 3, item.spec, { font: F_DATA, alignment: A_LEFT });
        setCell(ws, r, 4, item.unit, { font: F_DATA, alignment: A_CENTER });
        setCell(ws, r, 5, money(item.qty), { font: F_DATA, alignment: A_RIGHT, numFmt: QTY3_FMT });
        setCell(ws, r, 6, money(item.priceExcl), { font: F_DATA, alignment: A_RIGHT, numFmt: PRICE5_FMT });
        setCell(ws, r, 7, money(item.amtExcl), { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
        setCell(ws, r, 8, money(item.amtVat), { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
        setCell(ws, r, 9, money(item.amtIncl), { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
        setCell(ws, r, 10, remark || null, { font: F_DATA, alignment: A_LEFT });
        ws.getRow(r).height = estimateRowHeight([{ text: item.name, width: 27 }, { text: item.spec, width: 21 }]);
      }
      cursor++;
    }
    const footerRow = base + pageTotal;
    if (isLast) {
      mergeCells(ws, `A${footerRow}:B${footerRow}`);
      setCell(ws, footerRow, 1, `施工负责人：${ctx.info.工程负责人 || ''}`, { font: F_FOOT, alignment: A_LEFT });
      mergeCells(ws, `C${footerRow}:D${footerRow}`);
      setCell(ws, footerRow, 3, `审核：${ctx.info.审核 || ''}`, { font: F_FOOT, alignment: A_LEFT });
      mergeCells(ws, `E${footerRow}:G${footerRow}`);
      setCell(ws, footerRow, 5, `编制：${ctx.info.编制 || ''}`, { font: F_FOOT, alignment: A_LEFT });
      mergeCells(ws, `H${footerRow}:J${footerRow}`);
      setCell(ws, footerRow, 8, `编制日期：${ctx.dateStr}`, { font: F_FOOT, alignment: A_LEFT });
    }
    const L = LAYOUT[sheetName];
    for (let k = 1; k <= headerRows; k++) ws.getRow(base + k).height = L.rowHeights[k];
    for (let r = base + headerRows + 1; r <= base + pageTotal - (isLast ? 1 : 0); r++) {
      if (!ws.getRow(r).height) ws.getRow(r).height = 16.55;
    }
    if (isLast) {
      ws.getRow(base + pageTotal - 1).height = 17.3;
      ws.getRow(footerRow).height = 15.1;
    }
    paintBorders(ws, 10, [base + 4, base + 5], (() => { const a = []; for (let r = base + 6; r <= base + pageTotal - (isLast ? 1 : 0); r++) a.push(r); return a; })());
    if (!isLast) ws.rowBreaks.push({ id: base + pageTotal });
  });
}

// ---------------------------------------------------------------------------
// 11. 表五甲（生产准备费恒在总计之后，不计入总计）
// ---------------------------------------------------------------------------
function table5Method(row, feeRows) {
  const rate = num(row.rate);
  if (row.basis === 'preDiscountExclTax') return `折前建安工程费除税价X${pct(rate)}%`;
  if (row.basis === 'afterDiscountExclTax') return `折后建安工程费除税价X${pct(rate)}%`;
  if (row.basis === 'laborTotal') return `人工费X${pct(rate)}%`;
  if (row.basis === 'surveyKm') return num(row.excl) ? '按勘察里程分段计取' : '';
  if (row.basis === 'sum') {
    const kids = feeRows.filter((r) => num(r.order) > num(row.order) && num(r.order) < num(row.order) + 1);
    return `${kids.map((k) => String(k.order)).join('+')}之和`;
  }
  if (row.basis === 'fixed') return num(row.excl) ? '固定金额' : '';
  if (row.basis === 'manual') return num(row.excl) ? '按工程给定金额计取' : '';
  return '';
}
function buildTable5(wb, ctx) {
  const ws = wb.addWorksheet('工程其他费用表(表五)甲');
  const sheetName = '工程其他费用表(表五)甲';
  applySheetBase(ws, sheetName);
  const allRows = [...ctx.t5.rows].sort((a, b) => num(a.order) - num(b.order));
  const prodPrep = allRows.find((r) => r.key === 'productionPrepFee');
  const fees = allRows.filter((r) => r.key !== 'productionPrepFee');
  const seqRows = [...fees.map((r) => ({ type: 'fee', row: r })), { type: 'total' }];
  if (prodPrep) seqRows.push({ type: 'prodPrep', row: prodPrep });
  const pageTotal = LAYOUT[sheetName].maxRow;
  const headerRows = 5;
  const chunks = chunkSequence(seqRows.length, pageTotal, headerRows);
  const totalPages = chunks.length;
  let cursor = 0;
  chunks.forEach((size, pi) => {
    const base = pi * pageTotal;
    const page = pi + 1;
    const isLast = pi === totalPages - 1;
    mergeCells(ws, `A${base + 1}:H${base + 1}`);
    setCell(ws, base + 1, 1, '工程建设其他费预算表（表五）甲', { font: F_TITLE, alignment: A_CENTER });
    mergeCells(ws, `A${base + 2}:C${base + 2}`);
    setCell(ws, base + 2, 1, `工程名称：${ctx.singleName}`, { font: F_INFO, alignment: A_LEFT });
    mergeCells(ws, `D${base + 2}:E${base + 2}`);
    setCell(ws, base + 2, 4, `建设单位名称：${ctx.company}`, { font: F_INFO, alignment: A_LEFT });
    mergeCells(ws, `F${base + 2}:G${base + 2}`);
    setCell(ws, base + 2, 6, '表格编号：-5甲', { font: F_INFO, alignment: A_LEFT });
    setCell(ws, base + 2, 8, pageText(page, totalPages), { font: F_INFO, alignment: A_RIGHT });
    mergeCells(ws, `A${base + 3}:A${base + 4}`);
    setCell(ws, base + 3, 1, '序号', { font: F_HEAD, alignment: A_CENTER });
    mergeCells(ws, `B${base + 3}:B${base + 4}`);
    setCell(ws, base + 3, 2, '费用名称', { font: F_HEAD, alignment: A_CENTER });
    // v3.0 修正：表头“计算依据及方法”合并 C3:D4（与参考结算书 raw.json 合并区一致；此前误写 C3:D3）。
    mergeCells(ws, `C${base + 3}:D${base + 4}`);
    setCell(ws, base + 3, 3, '计算依据及方法', { font: F_HEAD, alignment: A_CENTER });
    mergeCells(ws, `E${base + 3}:G${base + 3}`);
    setCell(ws, base + 3, 5, '金 额（元）', { font: F_HEAD, alignment: A_CENTER });
    mergeCells(ws, `H${base + 3}:H${base + 4}`);
    setCell(ws, base + 3, 8, '备注', { font: F_HEAD, alignment: A_CENTER });
    setCell(ws, base + 4, 5, '除税价', { font: F_HEAD, alignment: A_CENTER });
    setCell(ws, base + 4, 6, '增值税', { font: F_HEAD, alignment: A_CENTER });
    setCell(ws, base + 4, 7, '含税价', { font: F_HEAD, alignment: A_CENTER });
    mergeCells(ws, `C${base + 5}:D${base + 5}`);
    const romanMap = [[1, 'Ⅰ'], [2, 'Ⅱ'], [3, 'Ⅲ'], [5, 'Ⅳ'], [6, 'Ⅴ'], [7, 'Ⅵ'], [8, 'Ⅶ']];
    romanMap.forEach(([c, v]) => setCell(ws, base + 5, c, v, { font: F_DATA, alignment: A_CENTER }));
    for (let i = 0; i < size; i++) {
      const item = seqRows[cursor];
      const r = base + 6 + i;
      mergeCells(ws, `C${r}:D${r}`);
      if (item.type === 'fee' || item.type === 'prodPrep') {
        const row = item.row;
        setCell(ws, r, 1, String(row.order), { font: F_DATA, alignment: A_CENTER });
        setCell(ws, r, 2, row.name, { font: F_DATA, alignment: A_LEFT });
        setCell(ws, r, 3, table5Method(row, fees) || null, { font: F_DATA, alignment: A_LEFT });
        setCell(ws, r, 5, money(row.excl), { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
        setCell(ws, r, 6, money(row.vat), { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
        setCell(ws, r, 7, money(row.incl), { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
        ws.getRow(r).height = estimateRowHeight([{ text: row.name, width: 33 }]);
      } else {
        setCell(ws, r, 2, '   总  计', { font: F_DATA, alignment: A_LEFT });
        setCell(ws, r, 5, money(ctx.t5.totalExcl), { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
        setCell(ws, r, 6, money(ctx.t5.totalVat), { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
        setCell(ws, r, 7, money(ctx.t5.totalIncl), { font: F_DATA, alignment: A_RIGHT, numFmt: MONEY_FMT });
      }
      cursor++;
    }
    const footerRow = base + pageTotal;
    if (isLast) {
      // 空白填充行合并 C:D（与参考一致；直至表尾前一行）。
      for (let br = base + 6 + size; br <= base + pageTotal - 1; br++) mergeCells(ws, `C${br}:D${br}`);
      mergeCells(ws, `A${footerRow}:B${footerRow}`);
      setCell(ws, footerRow, 1, `施工负责人：${ctx.info.工程负责人 || ''}`, { font: F_FOOT, alignment: A_LEFT });
      mergeCells(ws, `C${footerRow}:D${footerRow}`);
      setCell(ws, footerRow, 3, `审核：${ctx.info.审核 || ''}`, { font: F_FOOT, alignment: A_LEFT });
      mergeCells(ws, `E${footerRow}:H${footerRow}`);
      setCell(ws, footerRow, 5, `编制：${ctx.info.编制 || ''}${' '.repeat(23)}编制日期：${ctx.dateStr}`, { font: F_FOOT, alignment: A_LEFT });
    }
    const L = LAYOUT[sheetName];
    for (let k = 1; k <= headerRows; k++) ws.getRow(base + k).height = L.rowHeights[k];
    for (let r = base + headerRows + 1; r <= base + pageTotal - (isLast ? 1 : 0); r++) {
      if (!ws.getRow(r).height) ws.getRow(r).height = 16.55;
    }
    if (isLast) {
      ws.getRow(base + pageTotal - 1).height = 17.3;
      ws.getRow(footerRow).height = 15.1;
    }
    paintBorders(ws, 8, [base + 3, base + 4], (() => { const a = []; for (let r = base + 5; r <= base + pageTotal - (isLast ? 1 : 0); r++) a.push(r); return a; })());
    if (!isLast) ws.rowBreaks.push({ id: base + pageTotal });
  });
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------
async function exportBudgetBook(filePath, project, result, profile, opts = {}) {
  if (!filePath || typeof filePath !== 'string') throw new Error('导出路径为空');
  if (!project || typeof project !== 'object') throw new Error('缺少工程 project');
  if (!result || typeof result !== 'object') throw new Error('缺少计算结果 result');
  const ctx = buildCtx(project, result, profile);
  const wb = new ExcelJS.Workbook();
  wb.creator = '通信概预算';
  // v3.0：导出勾选传 include（与 includeSheets 同义，任一传入即生效；缺省全选）。
  const include = new Set(opts.include || opts.includeSheets || SHEET_ORDER);
  if (include.has('报表封面')) buildCover(wb, ctx);
  if (include.has('编制说明')) buildNotes(wb, ctx);
  if (include.has('建设项目总算表(汇总表)')) buildSummary(wb, ctx);
  if (include.has('工程总表(表一)')) buildTable1(wb, ctx);
  if (include.has('工程费用表(表二)')) buildTable2(wb, ctx, true);
  if (include.has('工程费用表(表二)折前')) buildTable2(wb, ctx, false);
  if (include.has('工程量表(表三)甲')) buildTable3A(wb, ctx);
  if (include.has('机械台班表(表三)乙')) buildTable3BC(wb, ctx, 'machine');
  if (include.has('仪器仪表使用表(表三)丙')) buildTable3BC(wb, ctx, 'instrument');
  if (include.has('主要材料表(表四)甲')) buildTable4A(wb, ctx);
  if (include.has('工程其他费用表(表五)甲')) buildTable5(wb, ctx);
  await wb.xlsx.writeFile(filePath);
  return true;
}

module.exports = { exportBudgetBook, paginateTable3A, chunkSequence };
