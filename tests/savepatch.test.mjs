/** db:savePatch 增量保存测试（§3.3）：成功 / 冲突 / 方案级 / 工程级 / 非法补丁 + resolveRates 优先级 + 费率往返 */
import { readFileSync } from 'node:fs';
import {
  migrateV1ToV2, applySavePatch, resolveRates, duplicateProfile, importProfile, exportProfile,
} from '../src/lib/profiles.js';
import { rateGridToRates, ratesToRateGrid, rateForNamed, winterRateForNamed } from '../src/engine/rates.mjs';

const seed = JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url), 'utf-8'));

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${label}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
};
const ok = (label, cond, extra = '') => {
  if (cond) pass++; else { fail++; console.log(`FAIL ${label} ${extra}`); }
};
const throws = (label, fn) => {
  try { fn(); fail++; console.log(`FAIL ${label}: 未抛错`); } catch { pass++; }
};

// ---- 基础 v2 db（迁移产物，saveVersion=0）----
function freshDb() {
  return migrateV1ToV2({
    version: 1,
    libraries: {
      quotas: [], shortlist: [], materials: [], rules: [],
      rateGrid: seed.rateGrid, winterTable: seed.winterTable,
      machinePrices: [], instrumentPrices: [], quotaMachines: [], quotaInstruments: [],
    },
    projects: [
      { id: 'p1', name: '工程A', info: { 工程类型: '通信线路工程', 施工折扣: 1 }, quantities: [], materialAdjust: [], materialPriceOverrides: [], ruleOverrides: [] },
      { id: 'p2', name: '工程B', info: { 工程类型: '通信线路工程', 施工折扣: 1 }, quantities: [], materialAdjust: [], materialPriceOverrides: [], ruleOverrides: [] },
    ],
    settings: { company: '', defaultInfo: { 工程类型: '通信线路工程', 施工折扣: 1, 甲供增值税: 0.13, 乙供增值税: 0.09 } },
  });
}

const db0 = freshDb();
eq('初始 saveVersion=0', db0.meta.saveVersion, 0);

// ---- 成功：整分支 projects 替换 ----
const projects2 = JSON.parse(JSON.stringify(db0.projects));
projects2[0].name = '工程A-改名';
const r1 = applySavePatch(db0, { patch: { projects: projects2 }, baseVersion: 0 });
eq('成功保存 ok', r1.ok, true);
eq('成功保存 version=1', r1.version, 1);
eq('保存后工程改名生效', r1.db.projects[0].name, '工程A-改名');
eq('保存后 saveVersion=1', r1.db.meta.saveVersion, 1);
eq('原 db 不被修改（纯函数）', db0.projects[0].name, '工程A');

// ---- 冲突：baseVersion 不匹配 ----
const stale = applySavePatch(r1.db, { patch: { projects: projects2 }, baseVersion: 0 });
eq('过期 baseVersion 返回冲突', stale.conflict, true);
eq('冲突时 ok=false', stale.ok, false);
eq('冲突时返回当前 version=1', stale.version, 1);
eq('冲突时不改数据', stale.db, undefined);
// 冲突后用正确 baseVersion 可重试成功
const retry = applySavePatch(r1.db, { patch: { projects: projects2 }, baseVersion: 1 });
eq('冲突后正确 baseVersion 重试成功', retry.ok, true);
eq('重试后 version=2', retry.version, 2);

// ---- 方案级补丁：只改目标方案 ----
const db2 = freshDb();
const prof = JSON.parse(JSON.stringify(db2.configurationProfiles[0]));
prof.name = '新方案名';
const rProf = applySavePatch(db2, { profileId: 'prof_default', patch: { profile: prof }, baseVersion: 0 });
eq('方案级补丁成功', rProf.ok, true);
eq('方案改名生效', rProf.db.configurationProfiles[0].name, '新方案名');
eq('方案级补丁保留方案 id', rProf.db.configurationProfiles[0].id, 'prof_default');
ok('方案级补丁更新 updatedAt', typeof rProf.db.configurationProfiles[0].updatedAt === 'string');
eq('方案级补丁不改工程', rProf.db.projects[0].name, '工程A');
// 方案不存在 -> 错误
const rNoProf = applySavePatch(db2, { profileId: 'prof_missing', patch: { profile: prof }, baseVersion: 0 });
eq('不存在的方案返回错误', rNoProf.ok, false);
ok('不存在的方案错误信息含 id', String(rNoProf.error).includes('prof_missing'));

// ---- 工程级补丁：只改目标工程 ----
const db3 = freshDb();
const p1 = JSON.parse(JSON.stringify(db3.projects[0]));
p1.quantities = [{ id: 'qty_0', quota: 'TXL1-008', variant: '', unit: '', qty: 5, coef: 1 }];
const rProj = applySavePatch(db3, { projectId: 'p1', patch: { project: p1 }, baseVersion: 0 });
eq('工程级补丁成功', rProj.ok, true);
eq('工程级补丁改了目标工程', rProj.db.projects[0].quantities.length, 1);
eq('工程级补丁未改其他工程', rProj.db.projects[1].quantities.length, 0);
eq('工程级补丁保留工程 id', rProj.db.projects[0].id, 'p1');
// 工程不存在 -> 错误
const rNoProj = applySavePatch(db3, { projectId: 'px', patch: { project: p1 }, baseVersion: 0 });
eq('不存在的工程返回错误', rNoProj.ok, false);

// ---- settingsPatch 浅合并 ----
const rSet = applySavePatch(db3, { patch: { settingsPatch: { company: '新单位' } }, baseVersion: 0 });
eq('settingsPatch 合并 company', rSet.db.settings.company, '新单位');
eq('settingsPatch 保留 defaultInfo', !!rSet.db.settings.defaultInfo, true);

// ---- 非法补丁 ----
eq('未知补丁键返回错误', applySavePatch(db3, { patch: { bogus: 1 }, baseVersion: 0 }).ok, false);
eq('patch 非对象返回错误', applySavePatch(db3, { patch: null, baseVersion: 0 }).ok, false);
eq('baseVersion 省略时视为不校验（兼容旧调用）', applySavePatch(db3, { patch: { settingsPatch: { company: 'X' } } }).ok, true);

// ---- 按 id 删除：重复 (quota,variant) 行只删目标行（B7）----
const db4 = freshDb();
const q1 = JSON.parse(JSON.stringify(db4.projects[0]));
q1.quantities = [
  { id: 'qty_a', quota: 'TXL3-187', variant: 'V', unit: '', qty: 2, coef: 1 },
  { id: 'qty_b', quota: 'TXL3-187', variant: 'V', unit: '', qty: 3, coef: 1 },
];
const rQ = applySavePatch(db4, { projectId: 'p1', patch: { project: q1 }, baseVersion: 0 });
const after = rQ.db.projects[0].quantities.filter((x) => x.id !== 'qty_a');
eq('按 id 删除只删目标行', after.length, 1);
eq('按 id 删除保留另一行', after[0].id, 'qty_b');
eq('按 id 删除保留另一行数量', after[0].qty, 3);

// ---- resolveRates 优先级（§2.4）：rateOverrides > info > 配置方案 ----
const prof2 = freshDb().configurationProfiles[0];
prof2.rates.vatRates = { jiaTax: 0.13, yiTax: 0.09, outputTax: 0.09, safetyVat: 0 };
prof2.discountRule.discountRate = 0.8;
eq('无覆盖时取配置方案', resolveRates(prof2, { info: {} }), { discount: 0.8, jiaTax: 0.13, yiTax: 0.09, outputTax: 0.09, safetyVat: 0 });
eq('info 覆盖配置方案', resolveRates(prof2, { info: { 施工折扣: 0.5, 乙供增值税: 0.11 } }).discount, 0.5);
eq('info 乙供增值税覆盖', resolveRates(prof2, { info: { 乙供增值税: 0.11 } }).yiTax, 0.11);
eq('rateOverrides 覆盖 info', resolveRates(prof2, { info: { 施工折扣: 0.5 }, rateOverrides: { discount: 0.6 } }).discount, 0.6);
eq('旧 taxRate 同步为 yiTax/outputTax', resolveRates(prof2, { info: {}, rateOverrides: { taxRate: 0.07 } }).yiTax, 0.07);
eq('旧 taxRate 同步为 outputTax', resolveRates(prof2, { info: {}, rateOverrides: { taxRate: 0.07 } }).outputTax, 0.07);
eq('yiTax 优先于 taxRate', resolveRates(prof2, { info: {}, rateOverrides: { taxRate: 0.07, yiTax: 0.12 } }).yiTax, 0.12);

// ---- 费率往返：rateGrid -> 具名 -> rateGrid -> 具名，全量相等 ----
const named1 = rateGridToRates(seed.rateGrid);
const grid2 = ratesToRateGrid({ byProjectType: named1 });
const named2 = rateGridToRates(grid2);
eq('费率往返全量相等', named2, named1);
eq('具名读取 线路技工费', rateForNamed({ byProjectType: named1 }, '通信线路工程', 'techPrice'), 114);
eq('具名读取 未知工程类型 null', rateForNamed({ byProjectType: named1 }, '不存在的工程', 'techPrice'), null);
eq('冬雨季 null 查表', winterRateForNamed({ byProjectType: named1, winterTable: seed.winterTable }, '通信线路工程', 'Ⅲ类地区'), 0.018);
eq('冬雨季覆盖值优先', winterRateForNamed(
  { byProjectType: { 通信线路工程: { winterRate: 0.05 } }, winterTable: seed.winterTable },
  '通信线路工程', 'Ⅲ类地区'), 0.05);
eq('冬雨季覆盖值 0 是显式 0', winterRateForNamed(
  { byProjectType: { 通信线路工程: { winterRate: 0 } }, winterTable: seed.winterTable },
  '通信线路工程', 'Ⅲ类地区'), 0);

// ---- 方案复制 / 导出导入 ----
const dup = duplicateProfile(prof2);
ok('复制方案新 id', dup.id !== prof2.id);
eq('复制方案名 +副本', dup.name, `${prof2.name}（副本）`);
eq('复制方案 isBuiltIn=false', dup.isBuiltIn, false);
eq('复制方案费率与原相同', dup.rates, prof2.rates);
const exp = exportProfile(prof2);
eq('导出格式版本 1', exp.profileFormat, 1);
const imp = importProfile(exp);
ok('导入赋新 id', imp.id !== prof2.id);
eq('导入 source=imported', imp.source, 'imported');
eq('导入后费率相等', imp.rates, prof2.rates);
throws('导入非法格式抛错', () => importProfile({ profileFormat: 99, profile: prof2 }));
throws('导入缺 libraries 抛错', () => importProfile({ profileFormat: 1, profile: { name: 'x' } }));

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
