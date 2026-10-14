/** 打包闭包测试（增量 8，§3.4）：主进程动态 import 的文件（含传递 import 闭包）必须被 build.files glob 覆盖；asar 必须关闭。
 * 回归 v2.0.0 事故：files 漏 src/，main.cjs:8 的动态 import 在打包后解析失败 → loadDb 抛错 → 无窗口。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));

let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) pass++; else { fail++; console.log(`FAIL ${label} ${extra}`); }
};

// glob -> RegExp：** => .*，* => [^/]*，? => [^/]，其余正则元字符转义
function globToRegExp(glob) {
  let re = '^';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { re += '.*'; i++; }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if ('.+()|^$[]\\{}'.includes(c)) re += '\\' + c;
    else re += c;
  }
  return new RegExp(re + '$');
}

const files = pkg.build?.files;
ok('build.files 存在且为数组', Array.isArray(files) && files.length > 0);
const globs = (files || []).map(globToRegExp);
const covered = (relPosix) => globs.some((re) => re.test(relPosix));
const toPosix = (p) => p.split(sep).join('/');

// 1. asar 必须关闭：主进程动态 import() 走 Node ESM loader，不经过 Electron 的 asar 补丁路径
ok('build.asar === false（asar 内 ESM import 行为不确定，见 §3.4）', pkg.build?.asar === false);

// 2. 收集主进程动态 import 目标 + 传递 ESM import 闭包
const importSpecRe = /(?:from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\))/g;
const closure = new Set();
function collectFrom(fileAbs) {
  const rel = toPosix(relative(ROOT, fileAbs));
  if (closure.has(rel)) return;
  closure.add(rel);
  let src;
  try { src = readFileSync(fileAbs, 'utf-8'); } catch { return; }
  for (const m of src.matchAll(importSpecRe)) {
    const spec = m[1] || m[2];
    if (!spec || !spec.startsWith('.')) continue; // 只跟相对路径；裸包名不由 files 闭包覆盖
    const target = resolve(dirname(fileAbs), spec);
    // 带 / 不带扩展名都试：import 目标可能是 .js / .mjs / .cjs
    const candidates = [target, `${target}.js`, `${target}.mjs`, `${target}.cjs`, join(target, 'index.js')];
    const found = candidates.find((c) => existsSync(c));
    if (!found) { ok(`import 目标存在：${rel} -> ${spec}`, false); continue; }
    collectFrom(found);
  }
}

const electronDir = join(ROOT, 'electron');
const cjsFiles = readdirSync(electronDir).filter((f) => f.endsWith('.cjs'));
ok('electron/*.cjs 非空', cjsFiles.length > 0);
const dynamicTargets = [];
for (const f of cjsFiles) {
  const abs = join(electronDir, f);
  const src = readFileSync(abs, 'utf-8');
  for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    const target = resolve(dirname(abs), spec);
    dynamicTargets.push(toPosix(relative(ROOT, target)));
    collectFrom(target);
  }
}
ok('electron/*.cjs 至少一个动态 import（main.cjs -> profiles.js）', dynamicTargets.length >= 1);
for (const t of dynamicTargets) {
  ok(`动态 import 目标被 files 覆盖：${t}`, covered(t));
  ok(`动态 import 目标存在于源码树：${t}`, existsSync(join(ROOT, t)));
}
// 传递闭包（profiles.js -> rates.mjs / discount.mjs）全部被覆盖
for (const rel of [...closure].sort()) {
  ok(`import 闭包被 files 覆盖：${rel}`, covered(rel));
}
// 3. 主入口被覆盖
ok(`package.json main 被 files 覆盖：${pkg.main}`, typeof pkg.main === 'string' && covered(toPosix(pkg.main)));
// 4. files 中无 glob 的条目必须真实存在（防拼写错误导致静默漏打）
for (const entry of files || []) {
  if (!/[*?[\]]/.test(entry)) {
    ok(`files 条目存在：${entry}`, existsSync(join(ROOT, entry)));
  }
}

console.log(`\npackaging: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
