/** Hooks 顺序回归测试（增量 8）：App.jsx 内所有 Hooks 必须在 early return 之前调用。
 * 回归 v2.0.1 冒烟发现的空白页：键盘撤销的 useEffect 原先在 `if (loadError) / if (!db)`
 * 提前返回之后，首渲染（db=null）时不执行、数据加载后才执行 → Hooks 数量变化 →
 * React 抛 "Rendered more hooks than during the previous render"，整树卸载、页面空白。
 * 本测试做静态检查：App.jsx 中最后一个 Hook 调用必须在第一个 early return 之前。
 */
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'src', 'App.jsx'), 'utf-8');
const lines = src.split('\n');

let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) pass++; else { fail++; console.log(`FAIL ${label} ${extra}`); }
};

const hookRe = /\buse(State|Effect|Ref|Memo|Callback|Context|Reducer|ImperativeHandle|LayoutEffect|DebugValue|Id|Transition|DeferredValue|SyncExternalStore)\s*\(/;
const hookLines = [];
lines.forEach((line, i) => {
  if (hookRe.test(line)) hookLines.push(i + 1);
});
const earlyReturnLines = [];
lines.forEach((line, i) => {
  if (/^\s*if \((loadError|!db)\)/.test(line)) earlyReturnLines.push(i + 1);
});

ok('App.jsx 含有 Hooks 调用', hookLines.length > 0, `hookLines=${hookLines}`);
ok('App.jsx 含有 early return', earlyReturnLines.length > 0, `earlyReturnLines=${earlyReturnLines}`);
if (hookLines.length && earlyReturnLines.length) {
  const lastHook = Math.max(...hookLines);
  const firstEarlyReturn = Math.min(...earlyReturnLines);
  ok(
    `最后一个 Hook（行 ${lastHook}）在第一个 early return（行 ${firstEarlyReturn}）之前`,
    lastHook < firstEarlyReturn,
    'Hooks 在 early return 之后调用会导致“Rendered more hooks”整树卸载',
  );
}

console.log(`\nhooks: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
