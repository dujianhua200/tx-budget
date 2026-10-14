#!/usr/bin/env node
/**
 * 版式常量生成器（v2 增量 3，设计文档 §5.4）。
 * 读 docs/print-layout-spec.raw.json（参考结算书实测提取），输出 electron/printLayout.cjs。
 * 版式调整只改 raw.json 后重跑本脚本，不手写常量。
 * 用法：node scripts/genPrintLayout.cjs
 */
const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, '..', 'docs', 'print-layout-spec.raw.json');
const OUT = path.join(__dirname, '..', 'electron', 'printLayout.cjs');

// 工作表名 = 参考文件表名（§5.1：工作表名沿用参考文件，内标题改预算口径）。
const SHEET_ORDER = [
  '报表封面',
  '编制说明',
  '建设项目总算表(汇总表)',
  '工程总表(表一)',
  '工程费用表(表二)',
  '工程费用表(表二)折前',
  '工程量表(表三)甲',
  '机械台班表(表三)乙',
  '仪器仪表使用表(表三)丙',
  '主要材料表(表四)甲',
  '工程其他费用表(表五)甲',
];

// 固定单页表的表尾行（§5.4；表三甲分页，表尾行由分页算法定，此处记 null）。
const FOOTER_ROW = {
  报表封面: null,
  编制说明: null,
  '建设项目总算表(汇总表)': 25,
  '工程总表(表一)': 27,
  '工程费用表(表二)': 24,
  '工程费用表(表二)折前': 24,
  '工程量表(表三)甲': null,
  '机械台班表(表三)乙': 28,
  '仪器仪表使用表(表三)丙': 27,
  '主要材料表(表四)甲': 29,
  '工程其他费用表(表五)甲': 28,
};

function colLetters(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function main() {
  const raw = JSON.parse(fs.readFileSync(RAW, 'utf-8'));
  const layout = {};
  for (const name of SHEET_ORDER) {
    const sh = raw[name];
    if (!sh) throw new Error(`raw.json 缺少工作表：${name}`);
    const colWidths = [];
    for (let c = 1; c <= sh.max_column; c++) {
      const L = colLetters(c);
      colWidths.push(sh.col_widths[L] ?? sh.default_col_width);
    }
    const rowHeights = {};
    for (let r = 1; r <= sh.max_row; r++) {
      rowHeights[r] = sh.row_heights[String(r)] ?? sh.default_row_height;
    }
    layout[name] = {
      colWidths,
      rowHeights,
      defaultRowHeight: sh.default_row_height,
      margins: {
        left: sh.page_margins.left, right: sh.page_margins.right,
        top: sh.page_margins.top, bottom: sh.page_margins.bottom,
        header: sh.page_margins.header, footer: sh.page_margins.footer,
      },
      merged: [...sh.merged],
      maxRow: sh.max_row,
      maxColumn: sh.max_column,
      footerRow: FOOTER_ROW[name],
    };
  }
  const out = `/** 版式常量（生成文件，勿手改）。生成器：scripts/genPrintLayout.cjs；来源：docs/print-layout-spec.raw.json。 */\n`
    + `const SHEET_ORDER = ${JSON.stringify(SHEET_ORDER, null, 2)};\n\n`
    + `const LAYOUT = ${JSON.stringify(layout, null, 2)};\n\n`
    + `module.exports = { SHEET_ORDER, LAYOUT };\n`;
  fs.writeFileSync(OUT, out);
  console.log(`已生成 ${OUT}（${SHEET_ORDER.length} 张表）`);
}

main();
