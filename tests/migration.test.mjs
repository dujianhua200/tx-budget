/** v1 -> v2 迁移测试（§4、§12.1）：迁移 / 备份保留 / 回滚 / 计算对照 */
import { readFileSync, mkdtempSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { calcProject } from '../src/engine/calc.mjs';
import {
  migrateV1ToV2, migrateSelfCheck, seedToProfile, profileToLibs,
} from '../src/lib/profiles.js';

const require = createRequire(import.meta.url);
const dbStore = require('../electron/dbStore.cjs');
const seed = JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url), 'utf-8'));

let pass = 0, fail = 0;
const eq = (label, got, want, tol = 0) => {
  const ok = typeof got === 'number' && typeof want === 'number' && tol > 0
    ? Math.abs(got - want) <= tol : JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${label}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
};
const ok = (label, cond, extra = '') => {
  if (cond) pass++; else { fail++; console.log(`FAIL ${label} ${extra}`); }
};

// ---- v1 夹具：小规模但覆盖关键结构（2 个工程、重复 (quota,variant) 行、含 taxRate 的旧 rateOverrides）----
function v1Fixture() {
  return {
    version: 1,
    libraries: {
      quotas: [
        { code: 'TXL3-187', name: '挂钩法架设架空光缆', unit: '千米', tech: 1.0, labor: 2.0, coef: 1, book: '线路册', alias: '' },
        { code: 'TXL1-008', name: '测试定额', unit: '米', tech: 0.5, labor: 0.5, coef: 1, book: '线路册', alias: '' },
        { code: 'TXL7-023', name: '安装光分纤箱', unit: '处', tech: 1.2, labor: 0.8, coef: 1, book: '线路册', alias: '' },
      ],
      shortlist: [
        { code: 'TXL3-187', name: '挂钩法架设架空光缆 平原 6芯', unit: '千米', coef: 1 },
        { code: 'TXL1-008', name: '测试短单', unit: '米', coef: 1 },
      ],
      materials: [
        { id: 'jia0', name: '光缆', spec: 'GYTS_6芯', unit: '千米', priceExcl: 1000, supply: '甲供', remark: '' },
        { id: 'yi0', name: '抱杆', spec: '2槽', unit: '根', priceExcl: 50, supply: '乙供', remark: '' },
        { id: 'eq0', name: '设备', spec: 'X型', unit: '台', priceExcl: 500, supply: '设备', remark: '' },
      ],
      rules: [
        { id: 'rule0', quota: 'TXL3-187', material: '光缆', spec: 'GYTS_6芯', unit: '千米', consumption: 1.007, supply: '甲供', kind: '变体', variant: '挂钩法架设架空光缆 平原 6芯', remark: '' },
        { id: 'rule1', quota: 'TXL3-187', material: '抱杆', spec: '2槽', unit: '根', consumption: 1, supply: '乙供', kind: '变体', variant: '挂钩法架设架空光缆 平原 6芯', remark: '' },
      ],
      rateGrid: seed.rateGrid,
      winterTable: seed.winterTable,
      machinePrices: [
        { code: 'TXJ001', name: '光纤熔接机', unit: '台班', price: 144 },
        { code: 'TXJ002', name: '带状光纤熔接机', unit: '台班', price: 209 },
      ],
      instrumentPrices: [
        { code: 'TXY001', name: '光时域反射仪', unit: '台班', price: 300 },
        { code: 'TXY002', name: '数字传输分析仪', unit: '台班', price: 674 },
      ],
      quotaMachines: [
        { quota: 'TXL1-008', mcode: 'TXJ001', mname: '光纤熔接机', unit: '台班', qty: 0.5 },
        { quota: 'TXL3-187', mcode: 'TXJ002', mname: '带状光纤熔接机', unit: '台班', qty: 0.2 },
      ],
      quotaInstruments: [
        { quota: 'TXL1-008', mcode: 'TXY001', mname: '光时域反射仪', unit: '台班', qty: 0.3 },
        { quota: 'TXL3-187', mcode: 'TXY002', mname: '数字传输分析仪', unit: '台班', qty: 0.1 },
      ],
    },
    projects: [
      {
        id: 'p1', name: '工程A', createdAt: '2026-01-01', updatedAt: '2026-01-01',
        info: { 工程类型: '通信线路工程', 施工折扣: 1, 施工距离: '35KM以内', 施工调遣分类: '施工队伍调遣人数(线路、管道）', 冬雨季施工费: 'Ⅲ类地区', 甲供增值税: 0.13, 乙供增值税: 0.09 },
        quantities: [
          { quota: 'TXL3-187', variant: '挂钩法架设架空光缆 平原 6芯', unit: '', qty: 2, coef: 1 },
          // 重复 (quota,variant) 行：迁移后必须保留多行，不合并
          { quota: 'TXL3-187', variant: '挂钩法架设架空光缆 平原 6芯', unit: '', qty: 3, coef: 1 },
          { quota: 'TXL1-008', variant: '', unit: '', qty: 7, coef: 1 },
        ],
        materialAdjust: [], materialPriceOverrides: [], ruleOverrides: [],
        rateOverrides: { taxRate: 0.09 },
      },
      {
        id: 'p2', name: '工程B', createdAt: '2026-01-01', updatedAt: '2026-01-01',
        info: { 工程类型: '通信线路工程', 施工折扣: 1 },
        quantities: [{ quota: 'TXL7-023', variant: '', unit: '', qty: 1, coef: 1 }],
        materialAdjust: [], materialPriceOverrides: [], ruleOverrides: [],
      },
    ],
    settings: {
      company: '测试单位',
      defaultInfo: {
        工程类型: '通信线路工程', 施工折扣: 0.51, 施工距离: '35KM以内',
        施工调遣分类: '施工队伍调遣人数(线路、管道）',
        冬雨季施工费: 'Ⅲ类地区', 甲供增值税: 0.13, 乙供增值税: 0.09,
      },
    },
  };
}

const v1 = v1Fixture();
const v2 = migrateV1ToV2(v1);

// ---- 结构断言 ----
eq('迁移后 version=2', v2.version, 2);
eq('方案数 1', v2.configurationProfiles.length, 1);
const prof = v2.configurationProfiles[0];
eq('方案 id', prof.id, 'prof_default');
eq('方案名 默认配置', prof.name, '默认配置');
eq('方案来源', prof.source, 'migrated-v1');
ok('顶层 libraries 已删除', !('libraries' in v2));
ok('v1Backup 存在', !!v2.v1Backup?.v1Db);
eq('v1Backup 与 v1 原数据深相等', v2.v1Backup.v1Db, v1);
eq('settings.activeProfileId', v2.settings.activeProfileId, 'prof_default');
eq('settings.company 保留', v2.settings.company, '测试单位');
for (const t of ['quotas', 'shortlist', 'materials', 'rules', 'machinePrices', 'instrumentPrices', 'quotaMachines', 'quotaInstruments']) {
  eq(`库表 ${t} 行数相等`, prof.libraries[t].length, v1.libraries[t].length);
}
eq('工程数', v2.projects.length, 2);
for (const p of v2.projects) eq(`工程 ${p.name} profileId`, p.profileId, 'prof_default');
eq('工程A 工程量行数（重复行保留）', v2.projects[0].quantities.length, 3);
ok('工程量行 id 全部非空且唯一',
  v2.projects[0].quantities.every((q) => q.id) && new Set(v2.projects[0].quantities.map((q) => q.id)).size === 3);
eq('rateOverrides.taxRate 同步 yiTax', v2.projects[0].rateOverrides.yiTax, 0.09);
eq('rateOverrides.taxRate 同步 outputTax', v2.projects[0].rateOverrides.outputTax, 0.09);
eq('table5Overrides 补空数组', v2.projects[0].table5Overrides, []);
eq('warningsDismissed 补空数组', v2.projects[0].warningsDismissed, []);
eq('rules.appliesTo 默认全', prof.libraries.rules[0].appliesTo, '全');
ok('库行 id 全部非空且唯一', (() => {
  for (const t of ['quotas', 'shortlist', 'materials', 'rules', 'machinePrices', 'instrumentPrices', 'quotaMachines', 'quotaInstruments']) {
    const ids = prof.libraries[t].map((r) => r.id);
    if (ids.some((x) => !x) || new Set(ids).size !== ids.length) return false;
  }
  return true;
})());

// ---- 费率断言 ----
const line = prof.rates.byProjectType['通信线路工程'];
eq('线路技工费 114', line.techPrice, 114);
eq('线路普工费 61', line.laborPrice, 61);
eq('线路辅材费率 0.003', line.auxRate, 0.003);
eq('线路冬雨季费率 null=查表', line.winterRate, null);
eq('线路施工用水电蒸汽费 null->0', line.utilityRate, 0);
eq('vatRates.jiaTax', prof.rates.vatRates.jiaTax, 0.13);
eq('vatRates.yiTax', prof.rates.vatRates.yiTax, 0.09);
eq('vatRates.outputTax=yiTax', prof.rates.vatRates.outputTax, 0.09);
eq('vatRates.safetyVat=0', prof.rates.vatRates.safetyVat, 0);
eq('winterTable Ⅲ类', prof.rates.winterTable['Ⅲ类地区'], 0.018);
// 方案级默认折扣取自 v1 settings.defaultInfo.施工折扣（0.51），不是 seed.infoDefaults
eq('discountRule.discountRate 取自 v1 defaultInfo', prof.discountRule.discountRate, 0.51);
eq('discountRule.noDiscountKeys 含 safetyFee', prof.discountRule.noDiscountKeys.includes('safetyFee'), true);
eq('discountRule.zeroAfterDiscountKeys 含 carryFee（Q2 裁决 b）', prof.discountRule.zeroAfterDiscountKeys.includes('carryFee'), true);
eq('discountRule.zeroAfterDiscountKeys 11 项', prof.discountRule.zeroAfterDiscountKeys.length, 11);
// 表五安全生产费按新口径 2%（v1 是 1.5%）
eq('表五安全生产费率 0.02', prof.table5Fees.find((f) => f.key === 'safetyFee').rate, 0.02);
eq('表五安全生产费增值税 0', prof.table5Fees.find((f) => f.key === 'safetyFee').vatRate, 0);
eq('表五费用项数', prof.table5Fees.length, 16);
eq('dispatch priceTable 第 2 项', prof.dispatch.priceTable[1], [35.0001, 141]);
eq('dispatch extraPer200km', prof.dispatch.extraPer200km, 48);

// ---- 迁移自检 ----
const check = migrateSelfCheck(v1, v2);
ok('迁移自检通过', check.ok, check.failures.join('；'));
// 自检应能发现篡改
const tampered = JSON.parse(JSON.stringify(v2));
tampered.configurationProfiles[0].libraries.quotas.pop();
ok('自检能发现行数不一致', !migrateSelfCheck(v1, tampered).ok);

// ---- 计算对照：v1 libs vs profileToLibs，增量 1 引擎未改，须全量相等 ----
const v1Libs = {
  quotas: v1.libraries.quotas, materials: v1.libraries.materials, rules: v1.libraries.rules,
  rateGrid: v1.libraries.rateGrid, winterTable: v1.libraries.winterTable,
  machinePrices: v1.libraries.machinePrices, instrumentPrices: v1.libraries.instrumentPrices,
  quotaMachines: v1.libraries.quotaMachines, quotaInstruments: v1.libraries.quotaInstruments,
};
const projectA = v2.projects[0];
const r1 = calcProject(projectA, v1Libs);
const r2 = calcProject(projectA, profileToLibs(prof));
eq('计算对照 techDays', r2.techDays, r1.techDays, 0.011);
eq('计算对照 laborDays', r2.laborDays, r1.laborDays, 0.011);
eq('计算对照 table2.exclTax', r2.table2.exclTax, r1.table2.exclTax, 0.011);
eq('计算对照 table4A.totalExcl', r2.table4A.totalExcl, r1.table4A.totalExcl, 0.011);
eq('计算对照 table3B.total', r2.table3B.total, r1.table3B.total, 0.011);
eq('计算对照 table3C.total', r2.table3C.total, r1.table3C.total, 0.011);
eq('计算对照 table3A 行数', r2.table3A.length, r1.table3A.length);
console.log(`迁移对照：v1 table2.exclTax=${r1.table2.exclTax} v2=${r2.table2.exclTax}；techDays=${r1.techDays}/${r2.techDays}；table4A=${r1.table4A.totalExcl}/${r2.table4A.totalExcl}`);

// ---- seedToProfile：真实种子 ----
const seedProf = seedToProfile(seed);
eq('种子定额数', seedProf.libraries.quotas.length, seed.quotas.length);
eq('种子短单数', seedProf.libraries.shortlist.length, seed.shortlist.length);
eq('种子材料数（甲供+乙供+设备）', seedProf.libraries.materials.length, seed.materials_jia.length + seed.materials_yi.length + seed.materials_equip.length);
eq('种子规则数', seedProf.libraries.rules.length, seed.rules.length);
eq('种子规则 appliesTo', seedProf.libraries.rules[0].appliesTo, '全');
eq('种子方案折扣率（忽略 seed.infoDefaults 的 0.51，用 1）', seedProf.discountRule.discountRate, 1);
eq('种子方案线路技工费', seedProf.rates.byProjectType['通信线路工程'].techPrice, 114);
ok('种子方案材料 id 为 jia/yi/eq 前缀', seedProf.libraries.materials.every((m) => /^(jia|yi|eq)\d+$/.test(m.id)));

// ---- 文件层：备份保留 + 回滚（dbStore）----
const TMP = mkdtempSync(join(tmpdir(), 'txbudget-mig-'));
const v1Raw = JSON.stringify(v1);
const backupName = dbStore.writeV1BackupSync(TMP, v1Raw);
ok('v1 备份文件名形如 budget-data.v1-backup-*.json', backupName.startsWith('budget-data.v1-backup-') && backupName.endsWith('.json'));
eq('v1 备份内容与原文件一致', readFileSync(join(TMP, backupName), 'utf-8'), v1Raw);
eq('listV1Backups 找到备份', dbStore.listV1Backups(TMP), [backupName]);
// 滚动备份清理永不碰 v1 备份
for (let i = 0; i < 7; i++) writeFileSync(join(TMP, `budget-data.backup-2026-01-0${i}T00-00-00.json`), '{}');
const deleted = dbStore.pruneRollingBackupsSync(TMP, 5);
eq('滚动备份保留 5 份，删 2 份', deleted.length, 2);
ok('清理后 v1 备份仍在', existsSync(join(TMP, backupName)));
// 回滚：v2 文件被 v1 备份覆盖，且回滚前 v2 被保留
writeFileSync(join(TMP, 'budget-data.json'), JSON.stringify(v2));
const rb = dbStore.rollbackToV1BackupSync(TMP, backupName);
eq('回滚后数据文件内容 = v1', JSON.parse(readFileSync(join(TMP, 'budget-data.json'), 'utf-8')), v1);
ok('回滚前 v2 已保留为 v2-before-rollback 文件', rb.preservedAs && existsSync(join(TMP, rb.preservedAs)));
eq('保留的 v2 与迁移产物一致', JSON.parse(readFileSync(join(TMP, rb.preservedAs), 'utf-8')), v2);
ok('v1 备份在回滚后仍在（可再次回滚）', existsSync(join(TMP, backupName)));
console.log('备份文件列表:', readdirSync(TMP).sort().join(','));

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
