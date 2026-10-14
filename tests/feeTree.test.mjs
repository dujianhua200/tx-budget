/** 取费左树测试（v3.0 §13.11.2，Node 直跑）：左树由表二费用结构派生、点节点切换右表 */
import { readFileSync } from 'node:fs';
import { DISCOUNT_LINE_DEFS } from '../src/engine/discount.mjs';
import { seedToProfile } from '../src/lib/profiles.js';
import { FEE_TREE, findFeeNode, feeLeavesOf, feeRowsForNode, feeBasisText } from '../src/lib/v3.js';

const seed = JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url), 'utf-8'));
const fixture = JSON.parse(readFileSync(new URL('./fixtures/reference-book.json', import.meta.url), 'utf-8'));
const profile = seedToProfile(seed, '默认配置');
const result = fixture.result;

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${label}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
};
const ok = (label, cond) => { if (cond) pass++; else { fail++; console.log(`FAIL ${label}`); } };

const collect = (node, acc = []) => {
  if (node.kind === 'leaf') acc.push(node.key);
  for (const c of node.children || []) collect(c, acc);
  return acc;
};
const allLeaves = collect(FEE_TREE);
const defKeys = DISCOUNT_LINE_DEFS.map((d) => d.key);

// ---- 1. 左树覆盖表二费用结构：每个 key 恰好出现一次 ----
eq('左树叶子 = 表二全部 key（无遗漏）', [...new Set(allLeaves)].sort(), [...new Set(defKeys)].sort());
eq('左树叶子无重复', allLeaves.length, new Set(allLeaves).size);
eq('左树根节点', FEE_TREE.label, '建筑安装工程费');
ok('左树含直接费/措施费/规费/税金分组',
  ['g:direct', 'g:measure', 'g:reg', 'g:tax'].every((id) => !!findFeeNode(FEE_TREE, id)));

// ---- 2. 点节点切换右表分组 ----
const measureLeaves = feeLeavesOf(findFeeNode(FEE_TREE, 'g:measure'));
ok('措施费组含 16 项措施明细 + 合计', measureLeaves.includes('carryFee') && measureLeaves.includes('measureFee'));
eq('措施费组叶子数', measureLeaves.length, 17);
const laborLeaves = feeLeavesOf(findFeeNode(FEE_TREE, 'g:labor'));
eq('人工费组', laborLeaves, ['techFee', 'laborFee', 'laborTotal']);
eq('叶子节点自身返回 [key]', feeLeavesOf(findFeeNode(FEE_TREE, 'leaf:techFee')), ['techFee']);
eq('不存在的节点返回 []', feeLeavesOf(findFeeNode(FEE_TREE, 'nope')), []);
eq('不存在的节点右表为空', feeRowsForNode('nope', { profile, result, projectType: '通信线路工程' }), []);

// ---- 3. 右表行：费用名称 / 计算基数 / 费率 / 金额 / 计算式 ----
const laborRows = feeRowsForNode('g:labor', { profile, result, projectType: '通信线路工程' });
eq('人工费组右表 3 行', laborRows.map((r) => r.key), ['techFee', 'laborFee', 'laborTotal']);
const tech = laborRows[0];
eq('技工费费率 = 114（种子费率）', tech.rate, 114);
eq('技工费计算基数', tech.base, '技工总工日');
ok('技工费计算式含费率', tech.basis.includes('114'));
eq('技工费金额取折前表二', tech.amount, result.table2Before.techFee);
const rootRows = feeRowsForNode('root:all', { profile, result, projectType: '通信线路工程' });
eq('根节点右表 = 全部表二项', rootRows.length, defKeys.length);
const measureRows = feeRowsForNode('g:measure', { profile, result, projectType: '通信线路工程' });
const civil = measureRows.find((r) => r.key === 'civilFee');
eq('文明施工费计算基数', civil.base, '人工费');
eq('文明施工费费率 = 1.5% 的原始值 0.015', civil.rate, 0.015);
ok('文明施工费计算式含 1.5', civil.basis.includes('1.5'));

// ---- 4. 计算式渲染 ----
eq('费率占位符转百分比', feeBasisText('civilFee', { civilRate: 0.015 }), '人工费X1.5%');
eq('价格占位符原样', feeBasisText('techFee', { techPrice: 114 }), '技工总工日X114');

console.log(`\nfeeTree: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
