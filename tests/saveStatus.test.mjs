/** 保存状态机测试（v3.0 §13.7，Node 直跑，不依赖 Electron/React） */
import { createSaveQueue } from '../src/lib/saveQueue.js';
import { saveStatusInitial, saveStatusTransition, saveStatusText } from '../src/lib/v3.js';

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${label}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
};
const ok = (label, cond) => { if (cond) pass++; else { fail++; console.log(`FAIL ${label}`); } };

// ---- 1. 状态机：dirty → saving → saved ----
const s0 = saveStatusInitial();
eq('初始 saved', s0.status, 'saved');
eq('初始文案 ✓ 已保存', saveStatusText(s0), '✓ 已保存');
const s1 = saveStatusTransition(s0, 'edit');
eq('edit → dirty', s1.status, 'dirty');
eq('dirty 文案 ● 未保存', saveStatusText(s1), '● 未保存');
const s2 = saveStatusTransition(s1, 'saveStart');
eq('dirty + saveStart → saving', s2.status, 'saving');
eq('saving 文案 保存中…', saveStatusText(s2), '保存中…');
const s3 = saveStatusTransition(s2, 'saveDone');
eq('saving + saveDone → saved', s3.status, 'saved');
ok('手动保存文案 ✓ 已保存 HH:MM', /^✓ 已保存 \d{2}:\d{2}$/.test(saveStatusText(s3)));
const s4 = saveStatusTransition(s1, 'autoSaveDone');
ok('自动保存文案 已自动保存 HH:MM', /^已自动保存 \d{2}:\d{2}$/.test(saveStatusText(s4)));
eq('saved 时 saveStart 不切 saving（无脏数据不显示保存中）', saveStatusTransition(s0, 'saveStart').status, 'saved');
eq('未知事件保持状态', saveStatusTransition(s1, 'bogus').status, 'dirty');

// ---- 2. saveQueue 完成通知：onFlushStart / onSettled ----
{
  const starts = [], settled = [];
  const q = createSaveQueue(async () => {}, {
    delayMs: 800,
    onFlushStart: ({ source }) => starts.push(source),
    onSettled: ({ source }) => settled.push(source),
  });
  q.markDirty({ patch: { projects: ['x'] }, baseVersion: 0 });
  await q.flush({ source: 'manual' });
  eq('显式 flush 触发 1 次 onFlushStart', starts, ['manual']);
  eq('显式 flush 触发 1 次 onSettled(manual)', settled, ['manual']);
}
{
  const settled = [];
  const timers = [];
  const fakeSet = (fn) => { timers.push(fn); return timers.length; };
  const fakeClear = () => {};
  const q = createSaveQueue(async () => {}, {
    delayMs: 800, setTimeoutFn: fakeSet, clearTimeoutFn: fakeClear,
    onSettled: ({ source }) => settled.push(source),
  });
  q.markDirty({ patch: { projects: ['x'] }, baseVersion: 0 });
  for (const fn of timers) fn();
  await new Promise((r) => setTimeout(r, 0));
  eq('定时触发 flush 的 onSettled source=auto', settled, ['auto']);
}
{
  // 保存按钮排空队列：flush 等待写盘完成才返回（导出前调用契约）。
  let done = false;
  const q = createSaveQueue(async () => { await new Promise((r) => setTimeout(r, 20)); done = true; }, { delayMs: 800 });
  q.markDirty({ patch: { projects: ['x'] }, baseVersion: 0 });
  await q.flush({ source: 'manual' });
  ok('flush 返回时写盘已完成', done);
}

console.log(`\nsaveStatus: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
