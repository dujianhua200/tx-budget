/** Excel 导入/导出（纯函数，可在 Node 中单测） */
const ExcelJS = require('exceljs');

async function importQuantities(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const projects = [];
  const ws0 = wb.worksheets[0];
  const isSimple = String(ws0.getCell(1, 1).value ?? '').trim() === '工程名称';
  const ws = wb.getWorksheet('工程量');
  if (ws && !isSimple) {
    const names = [];
    for (let c = 2; c <= 10; c++) names.push(String(ws.getCell(1, c).value ?? '').trim());
    for (let p = 0; p < 9; p++) {
      const name = names[p];
      if (!name) continue;
      const quantities = [];
      for (let r = 4; r <= ws.rowCount; r++) {
        const code = ws.getCell(r, 2).value;
        const variant = ws.getCell(r, 3).value;
        const qty = Number(ws.getCell(r, 5 + p).value) || 0;
        if (code && qty) quantities.push({ quota: String(code).trim(), variant: String(variant ?? ''), unit: '', qty, coef: 1 });
      }
      if (quantities.length) projects.push({ name, quantities });
    }
    if (projects.length) return { kind: 'v3', projects };
  }
  // 简易格式：第一行表头 [工程名称, 定额编号, 项目名称, 数量, 工日系数]
  const byName = new Map();
  for (let r = 2; r <= ws0.rowCount; r++) {
    const pname = String(ws0.getCell(r, 1).value ?? '').trim();
    const code = ws0.getCell(r, 2).value;
    const qty = Number(ws0.getCell(r, 4).value) || 0;
    if (!pname || !code || !qty) continue;
    if (!byName.has(pname)) byName.set(pname, []);
    byName.get(pname).push({
      quota: String(code).trim(), variant: String(ws0.getCell(r, 3).value ?? ''),
      unit: '', qty, coef: Number(ws0.getCell(r, 5).value) || 1,
    });
  }
  for (const [name, quantities] of byName) projects.push({ name, quantities });
  return { kind: 'simple', projects };
}

async function importQuotas(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  const header = {};
  for (let c = 1; c <= ws.columnCount; c++) {
    const v = String(ws.getCell(1, c).value ?? '').trim();
    if (v) header[v] = c;
  }
  const hasNamed = header['定额编号'] && header['定额名称'];
  const col = hasNamed
    ? { code: header['定额编号'], name: header['定额名称'], unit: header['单位'], tech: header['技工'], labor: header['普工'], coef: header['系数'], book: header['分册名称'] }
    : { code: 4, name: 5, unit: 6, tech: 7, labor: 8, coef: 9, book: 3 };
  const quotas = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const code = ws.getCell(r, col.code).value;
    if (!code) continue;
    quotas.push({
      code: String(code).trim(), name: String(ws.getCell(r, col.name).value ?? ''),
      unit: String(ws.getCell(r, col.unit).value ?? ''),
      tech: Number(ws.getCell(r, col.tech).value) || 0,
      labor: Number(ws.getCell(r, col.labor).value) || 0,
      coef: Number(ws.getCell(r, col.coef).value) || 1,
      book: String(ws.getCell(r, col.book).value ?? ''), alias: '',
    });
  }
  return quotas;
}

async function exportQuotas(filePath, quotas) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('定额库');
  ws.columns = [
    { header: '定额编号', width: 14 }, { header: '定额名称', width: 46 },
    { header: '单位', width: 10 }, { header: '技工', width: 10 },
    { header: '普工', width: 10 }, { header: '系数', width: 8 }, { header: '分册名称', width: 16 },
  ];
  ws.getRow(1).font = { bold: true };
  quotas.forEach((q) => ws.addRow([q.code, q.name, q.unit, q.tech, q.labor, q.coef, q.book]));
  await wb.xlsx.writeFile(filePath);
  return true;
}

/**
 * 通用库导入/导出（v2 增量 4，§8.2/§8.3）。
 * 列头与 libraryDefs 的列 label 对应（定额技工/普工沿用旧 importQuotas 的“技工/普工”表头，
 * 导入时同时接受“技工/单位/普工/单位”别名）。布尔列导出写“是/否”，导入时反向解析。
 * importLibrary 返回 {rows, errors}：errors 为字符串数组（文件级或“第N行：…”行级），
 * 行级错误行不进 rows；errors 非空时调用方仍可预览有效行，但确认导入须先勾选知晓（§8.3）。
 */
const EXCEL_COLUMNS = {
  quotas: [
    { field: 'code', header: '定额编号', type: 'text', required: true },
    { field: 'name', header: '定额名称', type: 'text', required: true, aliases: [] },
    { field: 'unit', header: '单位', type: 'text' },
    { field: 'tech', header: '技工', type: 'number', aliases: ['技工/单位'] },
    { field: 'labor', header: '普工', type: 'number', aliases: ['普工/单位'] },
    { field: 'coef', header: '系数', type: 'number' },
    { field: 'book', header: '分册名称', type: 'text', aliases: ['分册'] },
    { field: 'alias', header: '别名', type: 'text' },
  ],
  shortlist: [
    { field: 'code', header: '定额编号', type: 'text', required: true },
    { field: 'name', header: '定额名称', type: 'text', required: true },
    { field: 'unit', header: '单位', type: 'text' },
    { field: 'coef', header: '系数', type: 'number' },
  ],
  materials: [
    { field: 'name', header: '名称', type: 'text', required: true },
    { field: 'spec', header: '规格', type: 'text' },
    { field: 'unit', header: '单位', type: 'text' },
    { field: 'priceExcl', header: '除税单价', type: 'number' },
    { field: 'supply', header: '供货', type: 'select', options: ['甲供', '乙供', '设备'] },
    { field: 'remark', header: '备注', type: 'text' },
  ],
  rulesVariant: [
    { field: 'quota', header: '定额编号', type: 'text', required: true },
    { field: 'material', header: '材料', type: 'text', required: true },
    { field: 'spec', header: '规格', type: 'text' },
    { field: 'unit', header: '单位', type: 'text' },
    { field: 'consumption', header: '单位消耗量', type: 'number' },
    { field: 'supply', header: '供货', type: 'select', options: ['甲供', '乙供', '设备'] },
    { field: 'kind', header: '类型', type: 'select', options: ['变体', '变体*', '通用', '备选'] },
    { field: 'variant', header: '变体项目名称', type: 'text' },
    { field: 'remark', header: '备注', type: 'text' },
    { field: 'appliesTo', header: '适用工程', type: 'text' },
  ],
  rulesAlt: null, // 与 rulesVariant 同表同列，导出时复用 rulesVariant 列
  machinePrices: [
    { field: 'code', header: '机械编号', type: 'text', required: true },
    { field: 'name', header: '机械名称', type: 'text', required: true },
    { field: 'unit', header: '单位', type: 'text' },
    { field: 'price', header: '台班单价', type: 'number' },
  ],
  instrumentPrices: [
    { field: 'code', header: '仪表编号', type: 'text', required: true },
    { field: 'name', header: '仪表名称', type: 'text', required: true },
    { field: 'unit', header: '单位', type: 'text' },
    { field: 'price', header: '台班单价', type: 'number' },
  ],
  quotaMachines: [
    { field: 'quota', header: '定额编号', type: 'text', required: true },
    { field: 'mcode', header: '机械编号', type: 'text', required: true },
    { field: 'mname', header: '机械名称', type: 'text' },
    { field: 'unit', header: '单位', type: 'text' },
    { field: 'qty', header: '数量(台班)', type: 'number' },
  ],
  quotaInstruments: [
    { field: 'quota', header: '定额编号', type: 'text', required: true },
    { field: 'mcode', header: '仪表编号', type: 'text', required: true },
    { field: 'mname', header: '仪表名称', type: 'text' },
    { field: 'unit', header: '单位', type: 'text' },
    { field: 'qty', header: '数量(台班)', type: 'number' },
  ],
  rates: [
    { field: '工程类型', header: '工程类型', type: 'text', required: true },
    { field: '费率项目', header: '费率项目', type: 'text', required: true },
    { field: '数值', header: '数值', type: 'number' },
    { field: '单位', header: '单位', type: 'text' },
  ],
  table5Fees: [
    { field: 'key', header: '费用 key', type: 'text', required: true },
    { field: 'name', header: '费用名称', type: 'text', required: true },
    { field: 'basis', header: '取费依据', type: 'select', options: ['manual', 'preDiscountExclTax', 'afterDiscountExclTax', 'laborTotal', 'fixed', 'surveyKm', 'sum'] },
    { field: 'rate', header: '费率', type: 'number' },
    { field: 'vatRate', header: '增值税率', type: 'number' },
    { field: 'amount', header: '固定金额', type: 'number' },
    { field: 'enabled', header: '启用', type: 'checkbox' },
    { field: 'order', header: '序号', type: 'number' },
    { field: 'note', header: '备注', type: 'text' },
  ],
};
EXCEL_COLUMNS.rulesAlt = EXCEL_COLUMNS.rulesVariant;

const parseBool = (v) => {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim();
  if (['是', 'true', '1', '启用', 'TRUE'].includes(s)) return true;
  if (['否', 'false', '0', '禁用', 'FALSE'].includes(s)) return false;
  return null;
};

async function importLibrary(filePath, kind) {
  const cols = EXCEL_COLUMNS[kind];
  if (!cols) return { rows: [], errors: [`未知库类型：${kind}`] };
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(filePath);
  } catch (e) {
    return { rows: [], errors: [`文件打不开（${filePath}）：${e.message}`] };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], errors: ['文件无工作表'] };
  const headerToCol = {};
  for (let c = 1; c <= ws.columnCount; c++) {
    const v = String(ws.getCell(1, c).value ?? '').trim();
    if (v) headerToCol[v] = c;
  }
  const colIndex = {};
  const missing = [];
  for (const col of cols) {
    const found = headerToCol[col.header] ?? (col.aliases || []).map((a) => headerToCol[a]).find((x) => x != null);
    if (found) colIndex[col.field] = found;
    else if (col.required) missing.push(col.header);
  }
  if (missing.length) return { rows: [], errors: [`表头缺失必填列：${missing.join('、')}（首行应为：${cols.map((c) => c.header).join(' / ')}）`] };
  const rows = [];
  const errors = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const raw = {};
    let allEmpty = true;
    for (const col of cols) {
      const idx = colIndex[col.field];
      const v = idx ? ws.getCell(r, idx).value : undefined;
      if (v !== '' && v != null) allEmpty = false;
      raw[col.field] = v;
    }
    if (allEmpty) continue;
    const row = {};
    const rowErrors = [];
    for (const col of cols) {
      const v = raw[col.field];
      if (col.type === 'number') {
        if (v === '' || v == null) row[col.field] = null;
        else if (Number.isFinite(Number(v))) row[col.field] = Number(v);
        else rowErrors.push(`${col.header}不是有效数字`);
      } else if (col.type === 'checkbox') {
        if (v === '' || v == null) row[col.field] = true;
        else {
          const b = parseBool(v);
          if (b == null) rowErrors.push(`${col.header}应为是/否`);
          else row[col.field] = b;
        }
      } else if (col.type === 'select') {
        row[col.field] = v == null ? '' : String(v).trim();
        if (row[col.field] && !col.options.includes(row[col.field])) rowErrors.push(`${col.header}非法取值“${row[col.field]}”`);
      } else {
        row[col.field] = v == null ? '' : String(v).trim();
      }
      if (col.required && (row[col.field] === '' || row[col.field] == null)) rowErrors.push(`${col.header}必填`);
    }
    if (rowErrors.length) errors.push(`第 ${r} 行：${rowErrors.join('；')}`);
    else rows.push(row);
  }
  return { rows, errors };
}

async function exportLibrary(filePath, kind, rows) {
  const cols = EXCEL_COLUMNS[kind];
  if (!cols) throw new Error(`未知库类型：${kind}`);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.columns = cols.map((c) => ({ header: c.header, width: 18 }));
  ws.getRow(1).font = { bold: true };
  for (const row of rows || []) {
    ws.addRow(cols.map((c) => {
      const v = row?.[c.field];
      if (c.type === 'checkbox') return v ? '是' : '否';
      if (v == null || v === '') return null;
      return v;
    }));
  }
  await wb.xlsx.writeFile(filePath);
  return true;
}

module.exports = { importQuantities, importQuotas, exportQuotas, importLibrary, exportLibrary, EXCEL_COLUMNS };
