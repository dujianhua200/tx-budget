import { calcProject, PROJECT_TYPES, RATE_ITEMS } from '../engine/calc.mjs';

export const money = (n) => (typeof n === 'number' && Number.isFinite(n)
  ? n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
export const num2 = (n) => (typeof n === 'number' && Number.isFinite(n)
  ? (Math.round(n * 100) / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '—');
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function calcLibs(db) {
  const L = db.libraries;
  return {
    quotas: L.quotas, materials: L.materials, rules: L.rules,
    rateGrid: L.rateGrid, winterTable: L.winterTable,
    machinePrices: L.machinePrices, instrumentPrices: L.instrumentPrices,
    quotaMachines: L.quotaMachines, quotaInstruments: L.quotaInstruments,
  };
}
export function calcFor(db, project) {
  return calcProject(project, calcLibs(db));
}
export function newProject(db, name, template) {
  const info = { ...(db.settings?.defaultInfo || {}), 建设项目名称: name, 单项工程名称: name };
  const p = {
    id: uid(), name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    info, quantities: [], materialAdjust: [], materialPriceOverrides: [], ruleOverrides: [],
  };
  if (template) {
    p.info = { ...template.info, 建设项目名称: name, 单项工程名称: name };
    p.quantities = JSON.parse(JSON.stringify(template.quantities || []));
    p.materialAdjust = JSON.parse(JSON.stringify(template.materialAdjust || []));
    p.materialPriceOverrides = JSON.parse(JSON.stringify(template.materialPriceOverrides || []));
    p.ruleOverrides = JSON.parse(JSON.stringify(template.ruleOverrides || []));
  }
  return p;
}
export { PROJECT_TYPES, RATE_ITEMS };
