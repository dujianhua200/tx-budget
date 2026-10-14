/** 主进程：窗口、JSON 数据存储（v2）、Excel 导入/导出 */
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const dbStore = require('./dbStore.cjs');

// profiles.js 是 ESM 纯函数模块，主进程用动态 import 加载一次并复用。
const profilesPromise = import('../src/lib/profiles.js');

const userDir = app.getPath('userData');
const DB_FILE = path.join(userDir, 'budget-data.json');
const SEED_FILE = path.join(__dirname, '..', 'data', 'seed.json');
const PKG_FILE = path.join(__dirname, '..', 'package.json');

let db = null;
let loadError = null;

const DEFAULT_INFO = {
  工程类型: '通信线路工程', 施工折扣: 1, 施工距离: '35KM以内',
  施工调遣分类: '施工队伍调遣人数(线路、管道）',
  冬雨季施工费: 'Ⅲ类地区', 甲供增值税: 0.13, 乙供增值税: 0.09,
};

/** 首次启动：seed.json -> v2 db（seedToProfile 显式忽略 seed.infoDefaults，见 §2.4）。 */
function defaultDbV2(profiles, seed) {
  const profile = profiles.seedToProfile(seed, '默认配置', {
    id: 'prof_default', source: 'seed', isBuiltIn: true, defaultInfo: DEFAULT_INFO,
  });
  return {
    version: 2,
    configurationProfiles: [profile],
    projects: [],
    settings: { company: '', activeProfileId: 'prof_default', defaultInfo: { ...DEFAULT_INFO } },
    v1Backup: null,
    meta: { saveVersion: 0 },
  };
}

/** v2 文件内存修复：补 meta / activeProfileId / 工程 profileId（不写回，下次保存时落地）。 */
function repairV2(parsed) {
  if (!parsed.meta || typeof parsed.meta.saveVersion !== 'number') {
    parsed.meta = { ...(parsed.meta || {}), saveVersion: 0 };
  }
  if (!Array.isArray(parsed.configurationProfiles) || !parsed.configurationProfiles.length) {
    throw new Error('v2 数据文件缺少 configurationProfiles');
  }
  if (!parsed.settings) parsed.settings = {};
  if (!parsed.settings.activeProfileId) {
    parsed.settings.activeProfileId = parsed.configurationProfiles[0].id;
  }
  for (const p of parsed.projects || []) {
    if (!p.profileId) p.profileId = parsed.settings.activeProfileId;
    if (!Array.isArray(p.table5Overrides)) p.table5Overrides = [];
    if (!Array.isArray(p.warningsDismissed)) p.warningsDismissed = [];
  }
  return parsed;
}

/**
 * 加载数据（窗口创建前完成，迁移同步阻塞，见 §4.1）。
 * 任一步骤失败：内存保留原数据、不写回，loadError 置错误信息，db 置 null。
 */
async function loadDb() {
  loadError = null;
  const profiles = await profilesPromise;
  let seed;
  try {
    seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8'));
  } catch (e) {
    loadError = `种子文件读取失败：${e.message}`;
    db = null;
    return null;
  }
  if (!fs.existsSync(DB_FILE)) {
    db = defaultDbV2(profiles, seed);
    return db;
  }
  let raw;
  try {
    raw = fs.readFileSync(DB_FILE, 'utf-8');
  } catch (e) {
    loadError = `数据文件读取失败：${e.message}`;
    db = null;
    return null;
  }
  let parsed = null;
  let parsedFromBackup = false;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    // 文件损坏：保留损坏文件，尝试最近滚动备份恢复（B9，见 §10）。
    try {
      const stampStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      fs.renameSync(DB_FILE, path.join(userDir, `budget-data.corrupt-${stampStr}.json`));
    } catch { /* 保留损坏文件失败也不阻塞恢复 */ }
    try {
      const backs = fs.readdirSync(userDir).filter((f) => f.startsWith('budget-data.backup-')).sort();
      if (backs.length) {
        parsed = JSON.parse(fs.readFileSync(path.join(userDir, backs[backs.length - 1]), 'utf-8'));
        parsedFromBackup = true;
      }
    } catch { parsed = null; }
    if (!parsed) {
      loadError = '数据文件已损坏且无可用备份，请从 v1 备份或手动备份恢复。损坏文件已保留为 budget-data.corrupt-<时间戳>.json。';
      db = null;
      return null;
    }
  }
  if (parsed.version != null && parsed.version > 2) {
    loadError = '数据版本高于本软件版本，请升级软件后再打开（v2 数据文件不可用 v1 打开）。';
    db = null;
    return null;
  }
  if (parsed.version === 2) {
    try {
      db = repairV2(parsed);
      if (parsedFromBackup) loadError = '数据文件已损坏，已从最近滚动备份恢复，请核对数据。';
      return db;
    } catch (e) {
      loadError = `v2 数据文件校验失败：${e.message}`;
      db = null;
      return null;
    }
  }
  if (parsed.version === 1 || (!parsed.version && parsed.libraries)) {
    // v1 -> v2 迁移（§4.2）：先备份，再转换，再自检，自检通过才写回。
    try {
      const backupFile = dbStore.writeV1BackupSync(userDir, parsedFromBackup
        ? JSON.stringify(parsed)
        : raw);
      void backupFile;
      const v2 = profiles.migrateV1ToV2(parsed);
      const check = profiles.migrateSelfCheck(parsed, v2);
      if (!check.ok) throw new Error(check.failures.join('；'));
      db = v2;
      dbStore.atomicWriteFileSync(DB_FILE, JSON.stringify(db));
      return db;
    } catch (e) {
      loadError = `v1 数据迁移失败：${e.message}（原数据未改动，v1 快照已保存为 budget-data.v1-backup-*.json）`;
      db = null;
      return null;
    }
  }
  loadError = '无法识别的数据文件格式。';
  db = null;
  return null;
}

/** 保存：原子写 + 滚动备份节流（§4.3）。调用前 db 已是新状态；备份复制的是磁盘上的旧文件。 */
function saveDb({ major = false } = {}) {
  if (!db) return;
  try {
    fs.mkdirSync(userDir, { recursive: true });
    if (fs.existsSync(DB_FILE) && dbStore.shouldBackup(userDir, { major })) {
      fs.copyFileSync(DB_FILE, path.join(userDir, dbStore.rollingBackupFileName()));
      dbStore.pruneRollingBackupsSync(userDir, 5);
    }
    dbStore.atomicWriteFileSync(DB_FILE, JSON.stringify(db));
  } catch (e) { console.error('saveDb failed:', e.message); }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 840, minWidth: 1000, minHeight: 620,
    title: '通信概预算',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  if (process.env.VITE_DEV) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  // 冒烟模式：加载 4 秒后打印页面文本并退出（仅 TXBUDGET_SMOKE=1 时）
  if (process.env.TXBUDGET_SMOKE) {
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const text = await win.webContents.executeJavaScript('document.body.innerText.slice(0,600)');
          const hasApi = await win.webContents.executeJavaScript('!!window.api');
          console.log('SMOKE hasApi=' + hasApi + ' text=' + JSON.stringify(text));
        } catch (e) { console.log('SMOKE ERROR ' + e.message); }
        app.quit();
      }, 4000);
    });
  }
}

app.whenReady().then(async () => {
  await loadDb();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('db:get', () => (loadError && !db ? { error: loadError } : db));
ipcMain.handle('db:reload', async () => {
  await loadDb();
  return loadError && !db ? { error: loadError } : db;
});
// 兼容旧调用：全量保存（渲染进程新代码优先用 db:savePatch）。
ipcMain.handle('db:save', (_e, next) => {
  if (!next || typeof next !== 'object') return false;
  db = next;
  db.meta = { ...(db.meta || {}), saveVersion: (db.meta?.saveVersion ?? 0) + 1 };
  saveDb();
  return true;
});
ipcMain.handle('db:savePatch', async (_e, args) => {
  if (!db) return { ok: false, error: '数据未加载' };
  const profiles = await profilesPromise;
  const res = profiles.applySavePatch(db, args || {});
  if (!res.ok) return res;
  db = res.db;
  saveDb({ major: !!args?.major });
  return { ok: true, version: res.version };
});
ipcMain.handle('app:getVersion', () => {
  let version = '';
  try { version = JSON.parse(fs.readFileSync(PKG_FILE, 'utf-8')).version || ''; } catch { /* ignore */ }
  return { version, dbVersion: db?.version ?? null };
});
ipcMain.handle('dialog:openFile', async (_e, opts) => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: opts?.filters });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('dialog:saveFile', async (_e, opts) => {
  const r = await dialog.showSaveDialog({ defaultPath: opts?.defaultPath, filters: opts?.filters });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('dialog:openDir', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});


/* ---------- Excel 导入/导出 + 打印导出（实现在 excel.cjs / printExport.cjs，可单测） ---------- */
const excel = require('./excel.cjs');
const configIO = require('./configIO.cjs');
const printExport = require('./printExport.cjs');
ipcMain.handle('excel:importQuantities', (_e, filePath) => excel.importQuantities(filePath));
ipcMain.handle('excel:importQuotas', (_e, filePath) => excel.importQuotas(filePath));
ipcMain.handle('excel:exportQuotas', (_e, args) => excel.exportQuotas(args.filePath, args.quotas));
// 通用库导入/导出（v2 增量 4，§8）：解析只做格式校验，分类由渲染进程 classifyImport 做。
ipcMain.handle('excel:importLibrary', (_e, args) => excel.importLibrary(args.filePath, args.kind));
ipcMain.handle('excel:exportLibrary', (_e, args) => {
  if (typeof args?.filePath === 'string' && args.filePath.endsWith('.json')) {
    fs.writeFileSync(args.filePath, JSON.stringify(args.rows ?? [], null, 2), 'utf-8');
    return true;
  }
  return excel.exportLibrary(args.filePath, args.kind, args.rows);
});
// 配置方案导入/导出 + 整库备份（v2 增量 4，B1：经主进程 fs 写真实路径）。
ipcMain.handle('db:exportProfile', async (_e, args) => {
  const profiles = await profilesPromise;
  const p = (db?.configurationProfiles || []).find((x) => x.id === args?.profileId);
  if (!p) return { ok: false, error: `配置方案不存在：${args?.profileId}` };
  try {
    return configIO.exportProfileToFile(args.filePath, p, profiles);
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('db:importProfile', async (_e, args) => {
  const profiles = await profilesPromise;
  if (!db) return { ok: false, error: '数据未加载' };
  try {
    const profile = configIO.importProfileFromFile(args.filePath, profiles);
    const names = new Set((db.configurationProfiles || []).map((x) => x.name));
    if (names.has(profile.name)) profile.name = `${profile.name}（导入）`;
    db.configurationProfiles.push(profile);
    saveDb({ major: true });
    return { ok: true, profile };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('db:exportBackup', (_e, args) => {
  try {
    return configIO.exportConfigBackup(args.filePath, db);
  } catch (e) { return { ok: false, error: e.message }; }
});
// 打印导出（§5）：主进程按 profileId 取方案，经主进程 fs 写真实路径（B1）。
ipcMain.handle('excel:exportBudgetBook', (_e, args) => {
  const profileId = args?.profileId || args?.project?.profileId;
  const profile = (db?.configurationProfiles || []).find((p) => p.id === profileId) || null;
  // v3.0：导出勾选透传（渲染进程 ExportPicker 的 include / includeSheets）。
  return printExport.exportBudgetBook(args.filePath, args.project, args.result, profile, {
    includeSheets: args.includeSheets || args.include,
  });
});
