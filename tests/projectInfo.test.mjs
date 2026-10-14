/** 工程信息表单测试（v3.0 §13.11.3，Node 直跑）：新字段可选回落、打折单选派生、取费标准切换方案 */
import { discountOption, applyDiscountOption, switchProjectProfile } from '../src/lib/v3.js';

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${label}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
};
const ok = (label, cond) => { if (cond) pass++; else { fail++; console.log(`FAIL ${label}`); } };

// ---- 1. 新字段可选：旧数据缺省空（表单读取时 ?? '' 回落） ----
const oldInfo = { 建设项目名称: '某工程', 单项工程名称: '某工程', 施工折扣: 1 };
eq('旧数据施工单位缺省空', oldInfo['施工单位'] ?? '', '');
eq('旧数据设计单位缺省空', oldInfo['设计单位'] ?? '', '');
const newInfo = { ...oldInfo, 施工单位: '中通一局', 设计单位: '某设计院' };
eq('新字段可填', newInfo['施工单位'], '中通一局');
eq('新字段可填 2', newInfo['设计单位'], '某设计院');

// ---- 2. 工程名称 3 个字段分供封面/表一/表二标题，不合并 ----
const names = { 建设项目名称: '建设项目A', 单项工程名称: '单项工程B', 单段工程名称: '单段工程C' };
eq('三名称字段独立', [names['建设项目名称'], names['单项工程名称'], names['单段工程名称']],
  ['建设项目A', '单项工程B', '单段工程C']);

// ---- 3. 打折单选派生：施工折扣 = 1 ↔ 不打折 ----
eq('折扣 1 → 不打折', discountOption({ 施工折扣: 1 }), 'noDiscount');
eq('折扣 0.379 → 打折', discountOption({ 施工折扣: 0.379 }), 'discount');
eq('缺省 → 不打折', discountOption({}), 'noDiscount');
eq('undefined → 不打折', discountOption({ 施工折扣: undefined }), 'noDiscount');

// ---- 4. 应用打折单选 ----
eq('选不打折 → 折扣置 1', applyDiscountOption({ 施工折扣: 0.379 }, 'noDiscount').info['施工折扣'], 1);
eq('选打折恢复上次折扣率', applyDiscountOption({ 施工折扣: 1 }, 'discount', 0.379).info['施工折扣'], 0.379);
{
  const r = applyDiscountOption({ 施工折扣: 1 }, 'discount', null);
  eq('选打折但无上次折扣率 → 不改值', r.info['施工折扣'], 1);
  ok('选打折但无上次折扣率 → needsInput', r.needsInput);
}
{
  const r = applyDiscountOption({ 施工折扣: 0.5 }, 'discount', null);
  eq('选打折且当前已有折扣 → 保持当前', r.info['施工折扣'], 0.5);
  ok('选打折且当前已有折扣 → 不需输入', !r.needsInput);
}
eq('非法 lastRate（=1）不恢复', applyDiscountOption({ 施工折扣: 1 }, 'discount', 1).needsInput, true);
eq('非法 lastRate（0）不恢复', applyDiscountOption({ 施工折扣: 1 }, 'discount', 0).needsInput, true);
ok('applyDiscountOption 不改原对象', (() => { const src = { 施工折扣: 0.379 }; applyDiscountOption(src, 'noDiscount'); return src['施工折扣'] === 0.379; })());

// ---- 5. 取费标准切换方案：只改 profileId ----
const project = { id: 'p1', name: '工程A', profileId: 'prof_a', info: { 施工折扣: 1 }, quantities: [] };
const switched = switchProjectProfile(project, 'prof_b');
eq('切换后 profileId', switched.profileId, 'prof_b');
eq('切换不改其他字段', switched.name, '工程A');
eq('切换不改原对象', project.profileId, 'prof_a');

console.log(`\nprojectInfo: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
