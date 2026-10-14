import { calcProject, PROJECT_TYPES, RATE_ITEMS } from '../engine/calc.mjs';
import { uid, getProfile, activeProfile, profileLibraries, profileToLibs } from './profiles.js';

export { uid };
export { getProfile, activeProfile, profileToLibs };

export const money = (n) => (typeof n === 'number' && Number.isFinite(n)
  ? n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
export const num2 = (n) => (typeof n === 'number' && Number.isFinite(n)
  ? (Math.round(n * 100) / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '—');

/**
 * 解析计算用 libs：v2 按工程 profileId 取方案（回落激活方案）；v1 db 走兼容分支（读顶层 libraries）。
 * profileToLibs 仍附一份 rateGrid 兼容垫片供旧调用方兼容，引擎（增量 2 起）不再读它，改读具名 rates。
 */
export function calcLibs(db, project) {
  if (db?.configurationProfiles) {
    const profile = getProfile(db, project?.profileId) || activeProfile(db);
    if (profile) return profileToLibs(profile);
  }
  const L = db.libraries;
  if (!L) return { quotas: [], materials: [], rules: [], rateGrid: [], winterTable: {}, machinePrices: [], instrumentPrices: [], quotaMachines: [], quotaInstruments: [] };
  return {
    quotas: L.quotas, materials: L.materials, rules: L.rules,
    rateGrid: L.rateGrid, winterTable: L.winterTable,
    machinePrices: L.machinePrices, instrumentPrices: L.instrumentPrices,
    quotaMachines: L.quotaMachines, quotaInstruments: L.quotaInstruments,
  };
}

/** 取当前方案库表集合（供页面使用；projectOrProfileId 可为工程对象 / 方案 id / 省略取激活方案）。 */
export function getLibraries(db, projectOrProfileId) {
  return profileLibraries(db, projectOrProfileId) || { quotas: [], shortlist: [], materials: [], rules: [], machinePrices: [], instrumentPrices: [], quotaMachines: [], quotaInstruments: [] };
}

export function calcFor(db, project) {
  return calcProject(project, calcLibs(db, project));
}

export function newProject(db, name, template) {
  const info = { ...(db.settings?.defaultInfo || {}), 建设项目名称: name, 单项工程名称: name };
  const profileId = template?.profileId
    ?? db.settings?.activeProfileId
    ?? db.configurationProfiles?.[0]?.id
    ?? 'prof_default';
  const withIds = (rows) => (rows || []).map((q) => ({ ...q, id: q.id || uid() }));
  const p = {
    id: uid(), name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    profileId,
    info, quantities: [], materialAdjust: [], materialPriceOverrides: [], ruleOverrides: [],
    rateOverrides: {}, table5Overrides: [], warningsDismissed: [],
  };
  if (template) {
    p.info = { ...template.info, 建设项目名称: name, 单项工程名称: name };
    p.quantities = withIds(JSON.parse(JSON.stringify(template.quantities || [])));
    p.materialAdjust = JSON.parse(JSON.stringify(template.materialAdjust || []));
    p.materialPriceOverrides = JSON.parse(JSON.stringify(template.materialPriceOverrides || []));
    p.ruleOverrides = JSON.parse(JSON.stringify(template.ruleOverrides || []));
    p.rateOverrides = JSON.parse(JSON.stringify(template.rateOverrides || {}));
    p.table5Overrides = JSON.parse(JSON.stringify(template.table5Overrides || []));
    p.warningsDismissed = JSON.parse(JSON.stringify(template.warningsDismissed || []));
  }
  return p;
}
export { PROJECT_TYPES, RATE_ITEMS };
