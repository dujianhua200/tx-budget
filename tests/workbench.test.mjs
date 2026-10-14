/** 工作台测试（v2 增量 5，Node 直跑，不依赖 Electron/React） */
import { readFileSync } from 'node:fs';
import { createSaveQueue } from '../src/lib/saveQueue.js';
import {
  orphanWarning, invalidWarning, orphanRowIds, invalidRowIds,
  duplicateCodes, rowStatus, deleteOrphanRows, dismissWarningCode,
  restoreProjectSnapshot,
} from '../src/lib/workbench.js';
import { seedToProfile, duplicateProfile } from '../src/lib/profiles.js';
import { newProject, calcFor } from '../src/lib/store.js';

let pass = 0, fail = 0;
const eq = (label, got, want, tol = 0.011) => {
  const ok = typeof got === 'number' && typeof want === 'number' ? Math.abs(got - want) <= tol : JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${label}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
};
const ok = (label, cond) => { if (cond) pass++; else { fail++; console.log(`FAIL ${label}`); } };

const seed = JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url), 'utf-8'));
const profile = seedToProfile(seed, '默认配置');
const quota = profile.libraries.quotas.find((q) => Number(q.tech) > 0);
if (!quota) throw new Error('seed 中无技工>0 的定额，无法构造夹具');

const mkDb = (profiles) => ({
  version: 2,
  configurationProfiles: profiles,
  projects: [],
  settings: { activeProfileId: profiles[0].id, defaultInfo: {} },
  meta: { saveVersion: 7 },
});

// ---- 1. saveQueue 节流：连续 markDirty 聚合为一次发送（假时钟） ----
{
  let nextId = 0;
  const timers = new Map();
  const fakeSet = (fn, ms) => { const id = ++nextId; timers.set(id, { fn, ms }); return id; };
  const fakeClear = (id) => timers.delete(id);
  const runAll = () => { for (const t of [...timers.values()]) t.fn(); timers.clear(); };
  const sent = [];
  const q = createSaveQueue(async (pending) => { sent.push(pending); }, { delayMs: 800, setTimeoutFn: fakeSet, clearTimeoutFn: fakeClear });
  ok('队列初始无待发送', !q.pending());
  q.markDirty({ patch: { projects: ['v1'] }, baseVersion: 7, major: false });
  q.markDirty({ patch: { projects: ['v2'] }, baseVersion: 8, major: false });
  q.markDirty({ patch: { settings: { a: 1 } }, baseVersion: 9, major: true });
  ok('markDirty 后 pending', q.pending());
  eq('定时器未触发前不发送', sent.length, 0);
  runAll();
  await new Promise((r) => setTimeout(r, 0));
  eq('800ms 内 3 次 markDirty 只发 1 次', sent.length, 1);
  eq('分支后写覆盖（projects 取最新）', sent[0].patch.projects, ['v2']);
  eq('settings 分支合并进来', sent[0].patch.settings, { a: 1 });
  eq('baseVersion 取首个补丁的版本', sent[0].baseVersion, 7);
  eq('major 取 OR', sent[0].major, true);
  ok('发送后 pending 清空', !q.pending());
}

// ---- 2. saveQueue flush() 立即发送，不等定时器 ----
{
  const sent = [];
  const q = createSaveQueue(async (p) => { sent.push(p); }, { delayMs: 800 });
  q.markDirty({ patch: { projects: ['x'] }, baseVersion: 3, major: false });
  await q.flush();
  eq('flush 立即发送 1 次', sent.length, 1);
  eq('flush 发送内容', sent[0].patch.projects, ['x']);
  ok('flush 后 pending 清空', !q.pending());
}

// ---- 3. saveQueue 发送期间的新编辑进下一桶，不丢失（导出前 flush 契约） ----
{
  let release;
  const gate = new Promise((r) => { release = r; });
  const sent = [];
  const q = createSaveQueue(async (p) => { sent.push(p); await gate; }, { delayMs: 800 });
  q.markDirty({ patch: { projects: ['a'] }, baseVersion: 1, major: false });
  const f = q.flush();
  q.markDirty({ patch: { projects: ['b'] }, baseVersion: 2, major: false });
  release();
  await f;
  eq('发送期间新编辑触发第二次发送', sent.length, 2);
  eq('第二桶为新补丁', sent[1].patch.projects, ['b']);
}

// ---- 4. saveQueue 真实定时器：连续输入聚合 ----
{
  const sent = [];
  const q = createSaveQueue(async (p) => { sent.push(p); }, { delayMs: 10 });
  for (let i = 0; i < 20; i++) q.markDirty({ patch: { projects: [i] }, baseVersion: i, major: false });
  await new Promise((r) => setTimeout(r, 60));
  eq('真实定时器：20 次连续 markDirty 只发 1 次', sent.length, 1);
  eq('真实定时器：取最后一次补丁', sent[0].patch.projects, [19]);
}

// ---- 5. 工作台 helpers：行状态优先级 / 重复编号 / 孤儿删除 / 忽略 ----
{
  const warnings = [
    { code: 'orphanQty', message: 'm', rowIds: ['r1'] },
    { code: 'invalidQty', message: 'm', rowIds: ['r2'] },
    { code: 'duplicateCode', message: 'm' },
  ];
  eq('orphanWarning 取出', orphanWarning(warnings)?.code, 'orphanQty');
  eq('invalidWarning 取出', invalidWarning(warnings)?.code, 'invalidQty');
  eq('orphanRowIds', orphanRowIds(warnings), ['r1']);
  eq('invalidRowIds', invalidRowIds(warnings), ['r2']);
  eq('无警告时 orphanRowIds 为空', orphanRowIds([]), []);
  const dup = duplicateCodes([{ code: 'A' }, { code: 'B' }, { code: 'A' }]);
  eq('重复编号集合', [...dup], ['A']);
  const ctx = { orphanIds: new Set(['r1']), invalidIds: new Set(['r2']), dupCodes: dup };
  eq('状态优先级：孤儿 > 无效 > 重复', rowStatus({ id: 'r1', quota: 'A' }, ctx), 'orphan');
  eq('状态：无效', rowStatus({ id: 'r2', quota: 'X' }, ctx), 'invalid');
  eq('状态：重复', rowStatus({ id: 'r9', quota: 'A' }, ctx), 'duplicate');
  eq('状态：正常为空', rowStatus({ id: 'r9', quota: 'X' }, ctx), '');
  const proj = { quantities: [{ id: 'r1', quota: 'NOPE' }, { id: 'r2', quota: 'A' }] };
  eq('删除孤儿行只删目标', deleteOrphanRows(proj, new Set(['r1'])).map((r) => r.id), ['r2']);
  eq('删除孤儿行不改原对象', proj.quantities.length, 2);
  eq('忽略警告去重', dismissWarningCode({ warningsDismissed: ['orphanQty'] }, 'orphanQty'), ['orphanQty']);
  eq('忽略警告追加', dismissWarningCode({ warningsDismissed: [] }, 'orphanQty'), ['orphanQty']);
}

// ---- 6. 工程删除撤销：restoreProjectSnapshot（单工程 / 数组） ----
{
  const db = mkDb([profile]);
  const p1 = newProject(db, '工程A');
  const p2 = newProject(db, '工程B');
  db.projects = [p1, p2];
  // 单删后撤销：不存在时重新插入
  const draft1 = JSON.parse(JSON.stringify(db));
  draft1.projects = [p2];
  ok('单工程快照恢复', restoreProjectSnapshot(draft1, { scope: 'project', projectId: p1.id, projectBefore: p1 }));
  eq('单工程恢复后数量', draft1.projects.length, 2);
  eq('单工程恢复后含被删工程', draft1.projects.some((p) => p.id === p1.id), true);
  // 单工程存在时原位替换（改名后恢复旧名）
  const draft2 = JSON.parse(JSON.stringify(db));
  draft2.projects[0].name = '被改名';
  restoreProjectSnapshot(draft2, { scope: 'project', projectId: p1.id, projectBefore: p1 });
  eq('单工程恢复为快照内容', draft2.projects[0].name, '工程A');
  // 批量删除后撤销：整数组写回
  const draft3 = JSON.parse(JSON.stringify(db));
  draft3.projects = [];
  ok('数组快照恢复', restoreProjectSnapshot(draft3, { scope: 'projects', projectsBefore: [p1, p2] }));
  eq('数组恢复后数量', draft3.projects.length, 2);
  eq('未知 scope 返回 false', restoreProjectSnapshot(draft3, { scope: 'table' }), false);
}

// ---- 7. 录入联动计算：改数量重算、孤儿行警告且不参与计算、切方案重算 ----
{
  const db = mkDb([profile]);
  const p = newProject(db, '联动工程');
  p.info.工程类型 = '通信线路工程';
  p.info.施工折扣 = 1;
  p.quantities = [
    { id: 'q1', quota: quota.code, variant: quota.name, unit: quota.unit, qty: 10, coef: 1 },
    { id: 'q2', quota: 'UNKNOWN-999', variant: '不存在的定额', unit: '米', qty: 5, coef: 1 },
    { id: 'q3', quota: quota.code, variant: quota.name, unit: quota.unit, qty: -1, coef: 1 },
  ];
  db.projects = [p];
  const r1 = calcFor(db, p);
  eq('孤儿警告含行 id', orphanRowIds(r1.warnings), ['q2']);
  eq('无效警告含行 id', invalidRowIds(r1.warnings), ['q3']);
  eq('孤儿行不参与计算：表三甲无 UNKNOWN 行', r1.table3A.some((r) => r.code === 'UNKNOWN-999'), false);
  eq('无效行不参与计算：工日仅计 q1', r1.techSub, Math.round(10 * Number(quota.tech) * 100) / 100);
  // 改数量 → 重算联动
  const p2 = JSON.parse(JSON.stringify(p));
  p2.quantities[0].qty = 20;
  const r2 = calcFor(db, p2);
  eq('数量 10→20，技工工日小计翻倍', r2.techSub, r1.techSub * 2);
  // 切方案（技工费 114→200）→ 重算联动
  const copy = duplicateProfile(profile);
  copy.rates.byProjectType['通信线路工程'].techPrice = 200;
  const db2 = mkDb([profile, copy]);
  const p3 = JSON.parse(JSON.stringify(p));
  p3.profileId = copy.id;
  p3.quantities = [p3.quantities[0]];
  const r3 = calcFor(db2, p3);
  ok('切方案后技工费变化', Math.abs(r3.table2.techFee - r1.table2.techFee) > 0.01);
  eq('切方案后技工费按新费率 200/工日', r3.table2.techFee / r3.techDays, 200, 0.02);
  // 忽略警告：warningsDismissed 不影响计算，只供界面过滤
  const p4 = JSON.parse(JSON.stringify(p));
  p4.warningsDismissed = dismissWarningCode(p4, 'orphanQty');
  eq('忽略后 warningsDismissed 记录', p4.warningsDismissed, ['orphanQty']);
  eq('忽略不影响引擎警告本身', orphanRowIds(calcFor(db, p4).warnings), ['q2']);
}

console.log(`workbench: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
