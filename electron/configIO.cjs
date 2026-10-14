/** 配置文件 IO（v2 增量 4，B1：全部经主进程 fs 写真实路径，不走浏览器下载）。 */
const fs = require('fs');

/**
 * 导出单个配置方案为 JSON 文件。
 * helpers = { exportProfile }（由 main.cjs 传入 profiles.js 的函数，避免 CJS 直接 require ESM）。
 */
function exportProfileToFile(filePath, profile, helpers) {
  if (!filePath) throw new Error('未选择导出路径');
  if (!profile) throw new Error('配置方案不存在');
  const data = helpers.exportProfile(profile);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return { ok: true, filePath };
}

/**
 * 从 JSON 文件导入配置方案（结构与版本校验由 helpers.importProfile 做）。
 * 文件缺失 / JSON 非法 / 结构校验失败时抛 Error（含可定位信息）。
 */
function importProfileFromFile(filePath, helpers) {
  if (!filePath) throw new Error('未选择导入文件');
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    throw new Error(`方案文件读取失败（${filePath}）：${e.message}`);
  }
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new Error(`方案文件不是有效 JSON（${filePath}）：${e.message}`);
  }
  return helpers.importProfile(json);
}

/** 整库备份 JSON 写真实路径。 */
function exportConfigBackup(filePath, db) {
  if (!filePath) throw new Error('未选择导出路径');
  fs.writeFileSync(filePath, JSON.stringify(db ?? {}, null, 2), 'utf-8');
  return { ok: true, filePath };
}

module.exports = { exportProfileToFile, importProfileFromFile, exportConfigBackup };
