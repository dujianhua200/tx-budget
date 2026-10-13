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

async function exportProject(filePath, project, result) {
  const wb = new ExcelJS.Workbook();
  wb.creator = '通信概预算';
  const money = (n) => (typeof n === 'number' ? Math.round(n * 100) / 100 : n);
  const mk = (name, headers) => {
    const ws = wb.addWorksheet(name);
    ws.columns = headers.map((h) => ({ header: h, width: 16 }));
    ws.getRow(1).font = { bold: true };
    return ws;
  };
  const t1 = mk('表一', ['费用名称', '除税价', '增值税', '含税价']);
  [
    ['建筑安装工程费（折前）', result.table1.beforeDiscount, result.table1.taxBefore, result.table1.totalBefore],
    ['建筑安装工程费（折后）', result.table1.afterDiscount, result.table1.taxAfter, result.table1.totalAfter],
    ['工程建设其他费', result.table1.otherFee, result.table1.otherVat, result.table1.otherIncl],
    ['合计', result.table1.sumExcl, result.table1.sumVat, result.table1.sumIncl],
    ['需要安装的设备费', result.table1.equipFee, result.table1.equipVat, result.table1.equipIncl],
    ['总计', result.table1.grandExcl, result.table1.grandVat, result.table1.grandIncl],
  ].forEach((r) => t1.addRow(r.map(money)));
  const t2 = mk('表二', ['费用名称', '金额（元）']);
  const R = result.table2;
  [
    ['人工费', R.laborTotal], ['其中：技工费', R.techFee], ['其中：普工费', R.laborFee],
    ['材料费', R.matTotal], ['其中：主要材料费', R.mainMat], ['其中：甲供材料', R.jiaMat],
    ['其中：乙供材料', R.yiMat], ['其中：辅助材料费', R.auxMat],
    ['机械使用费', R.machineFee], ['仪器仪表费', R.instrumentFee],
    ['直接工程费', R.directFee], ['措施费', R.measureFee],
    ['其中：环境保护费', R.envFee], ['其中：文明施工费', R.civilFee],
    ['其中：工地器材搬运费', R.carryFee], ['其中：工程干扰费', R.disturbFee],
    ['其中：工程点交、场地清理费', R.handoverFee], ['其中：临时设施费', R.tempFee],
    ['其中：工程车辆使用费', R.vehicleFee], ['其中：夜间施工增加费', R.nightFee],
    ['其中：冬雨季施工增加费', R.winterFee], ['其中：生产工具用具使用费', R.toolFee],
    ['其中：施工用水电蒸汽费', R.utilityFee], ['其中：已完工程及设备保护费', R.protectFee],
    ['其中：施工队伍调遣费', R.dispatchFee],
    ['直接费', R.directTotal], ['规费', R.regFee], ['其中：社会保障费', R.socialFee],
    ['其中：住房公积金', R.housingFee], ['其中：危险作业意外伤害保险费', R.accidentFee],
    ['企业管理费', R.mgmtFee], ['间接费', R.indirectTotal], ['利润', R.profit],
    ['建筑安装工程费（除税价）', R.exclTax], ['销项税额', R.outputTax],
    ['建筑安装工程费（含税价）', R.inclTax],
  ].forEach((r) => t2.addRow(r.map(money)));
  const t3a = mk('表三甲', ['定额编号', '项目名称', '单位', '数量', '技工单耗', '普工单耗', '技工工日', '普工工日']);
  result.table3A.forEach((r) => t3a.addRow([r.code, r.name, r.unit, money(r.qty), r.techUnit, r.laborUnit, money(r.tech), money(r.labor)]));
  t3a.addRow(['小计', '', '', '', '', '', money(result.techSub), money(result.laborSub)]);
  t3a.addRow(['调整', '', '', '', '', '', money(result.techDays - result.techSub), money(result.laborDays - result.laborSub)]);
  t3a.addRow(['合计', '', '', '', '', '', money(result.techDays), money(result.laborDays)]);
  const t3b = mk('表三乙', ['定额编号', '定额名称', '数量', '机械名称', '单位', '消耗量', '单价', '台班数', '金额']);
  result.table3B.rows.forEach((r) => t3b.addRow([r.quota, r.quotaName, money(r.qty), r.equipName, r.equipUnit, r.consumption, r.price, money(r.sessions), money(r.amount)]));
  t3b.addRow(['合计', '', '', '', '', '', '', '', money(result.table3B.total)]);
  const t3c = mk('表三丙', ['定额编号', '定额名称', '数量', '仪表名称', '单位', '消耗量', '单价', '台班数', '金额']);
  result.table3C.rows.forEach((r) => t3c.addRow([r.quota, r.quotaName, money(r.qty), r.equipName, r.equipUnit, r.consumption, r.price, money(r.sessions), money(r.amount)]));
  t3c.addRow(['合计', '', '', '', '', '', '', '', money(result.table3C.total)]);
  const matSheet = (name, t) => {
    const ws = mk(name, ['名称', '规格', '单位', '数量', '除税单价', '增值税/单位', '含税单价', '除税合计', '增值税合计', '含税合计']);
    t.rows.forEach((r) => ws.addRow([r.name, r.spec, r.unit, money(r.qty), money(r.priceExcl), money(r.priceVat), money(r.priceIncl), money(r.amtExcl), money(r.amtVat), money(r.amtIncl)]));
    ws.addRow(['合计', '', '', '', '', '', '', money(t.totalExcl), money(t.totalVat), money(t.totalIncl)]);
  };
  matSheet('表四甲（主材）', result.table4A);
  matSheet('表四乙(乙供）', result.table4B);
  matSheet('表四甲（设备）', result.table4Equip);
  const t5 = mk('表五', ['费用名称', '除税价', '增值税', '含税价']);
  const F = result.table5;
  [['项目建设管理费', F.mgmt2, F.mgmt2Vat, F.mgmt2Incl], ['勘察设计费', F.designTotal, F.designTotalVat, F.designTotal + F.designTotalVat],
   ['其中：勘察费', F.surveyFee, F.surveyVat, F.surveyFee + F.surveyVat], ['其中：设计费', F.designFee, F.designVat, F.designFee + F.designVat],
   ['安全生产费', F.safetyFee, F.safetyVat, F.safetyIncl], ['总计', F.totalExcl, F.totalVat, F.totalIncl]]
    .forEach((r) => t5.addRow(r.map(money)));
  const hz = mk('汇总表', ['费用名称', '除税价', '增值税', '含税价']);
  const S = result.summary;
  [['施工费（折后）', S.constructionExcl, S.constructionVat, S.constructionIncl],
   ['工程建设其它费', S.other, S.otherVat, S.otherIncl],
   ['自购物资', S.selfMat, S.selfMatVat, S.selfMatIncl],
   ['总计', S.totalExcl, S.totalVat, S.totalIncl]].forEach((r) => hz.addRow(r.map(money)));
  const q = mk('工程量明细', ['定额编号', '项目名称', '单位', '数量', '工日系数']);
  (project.quantities || []).forEach((r) => q.addRow([r.quota, r.variant, r.unit, r.qty, r.coef]));
  const inf = mk('工程信息', ['项目', '内容']);
  Object.entries(project.info || {}).forEach(([k, v]) => inf.addRow([k, v]));
  await wb.xlsx.writeFile(filePath);
  return true;
}

module.exports = { importQuantities, importQuotas, exportQuotas, exportProject };
