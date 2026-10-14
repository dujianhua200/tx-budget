/** 配置方案编辑目标测试（v3.0 §13.8，Node 直跑）：editingProfileId 与 activeProfileId 分离 */
import { resolveEditingProfileId, resolveEditingProfile, setEditingProfileId } from '../src/lib/v3.js';

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${label}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
};
const ok = (label, cond) => { if (cond) pass++; else { fail++; console.log(`FAIL ${label}`); } };

const p1 = { id: 'prof_a', name: '方案A' };
const p2 = { id: 'prof_b', name: '方案B' };
const mkDb = (settings) => ({ configurationProfiles: [p1, p2], settings });

// ---- 1. editingProfileId 命中时为编辑目标 ----
eq('editingProfileId 命中', resolveEditingProfileId(mkDb({ activeProfileId: 'prof_a', editingProfileId: 'prof_b' })), 'prof_b');
eq('编辑目标对象', resolveEditingProfile(mkDb({ activeProfileId: 'prof_a', editingProfileId: 'prof_b' }))?.name, '方案B');

// ---- 2. 置编辑目标不碰 activeProfileId ----
const settings = { activeProfileId: 'prof_a', editingProfileId: 'prof_b' };
const next = setEditingProfileId(settings, 'prof_a');
eq('置编辑目标后 editing=prof_a', next.editingProfileId, 'prof_a');
eq('置编辑目标后 active 仍 prof_a（本例同值，换目标再验）', next.activeProfileId, 'prof_a');
const next2 = setEditingProfileId(settings, 'prof_b');
eq('置编辑目标不改 active', next2.activeProfileId, 'prof_a');
eq('setEditingProfileId 不改原对象', settings.editingProfileId, 'prof_b');

// ---- 3. 缺省回落：旧数据无 editingProfileId → activeProfileId ----
eq('无 editingProfileId 回落 active', resolveEditingProfileId(mkDb({ activeProfileId: 'prof_b' })), 'prof_b');
// ---- 4. editingProfileId 指向不存在的方案 → 回落 active ----
eq('editingProfileId 不存在回落 active', resolveEditingProfileId(mkDb({ activeProfileId: 'prof_a', editingProfileId: 'prof_gone' })), 'prof_a');
// ---- 5. active 也不存在 → 第一个方案 ----
eq('active 也不存在回落第一个', resolveEditingProfileId(mkDb({ activeProfileId: 'prof_gone' })), 'prof_a');
// ---- 6. 无方案 → null ----
eq('无方案返回 null', resolveEditingProfileId({ configurationProfiles: [], settings: {} }), null);
ok('无方案时 resolveEditingProfile 返回 null', resolveEditingProfile({ configurationProfiles: [], settings: {} }) === null);

// ---- 7. 旧数据行为与 v2 一致：无 editingProfileId 时编辑目标即新建默认 ----
const v2db = mkDb({ activeProfileId: 'prof_b' });
eq('v2 旧数据：编辑目标 = 新建默认', resolveEditingProfileId(v2db), v2db.settings.activeProfileId);

console.log(`\nprofileEditTarget: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
