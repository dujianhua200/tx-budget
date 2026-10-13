/** 主进程：窗口、JSON 数据存储、Excel 导入/导出 */
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const userDir = app.getPath('userData');
const DB_FILE = path.join(userDir, 'budget-data.json');
const SEED_FILE = path.join(__dirname, '..', 'data', 'seed.json');

let db = null;

function defaultDb() {
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8'));
  return {
    version: 1,
    libraries: {
      quotas: seed.quotas,
      shortlist: seed.shortlist,
      materials: [
        ...seed.materials_jia.map((m, i) => ({ ...m, id: `jia${i}`, supply: '甲供' })),
        ...seed.materials_yi.map((m, i) => ({ ...m, id: `yi${i}`, supply: '乙供' })),
        ...seed.materials_equip.map((m, i) => ({ ...m, id: `eq${i}`, supply: '设备' })),
      ],
      rules: seed.rules.map((r, i) => ({ ...r, id: `rule${i}` })),
      rateGrid: seed.rateGrid,
      winterTable: seed.winterTable,
      machinePrices: seed.machinePrices,
      instrumentPrices: seed.instrumentPrices,
      quotaMachines: seed.quotaMachines,
      quotaInstruments: seed.quotaInstruments,
    },
    projects: [],
    settings: {
      company: '',
      defaultInfo: {
        工程类型: '通信线路工程', 施工折扣: 1, 施工距离: '35KM以内',
        施工调遣分类: '施工队伍调遣人数(线路、管道）',
        冬雨季施工费: 'Ⅲ类地区', 甲供增值税: 0.13, 乙供增值税: 0.09,
      },
    },
  };
}

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      // 补齐新字段（老版本数据兼容）
      if (!db.libraries) db.libraries = defaultDb().libraries;
      if (!db.settings) db.settings = defaultDb().settings;
      return db;
    }
  } catch (e) { console.error('loadDb failed, start fresh:', e.message); }
  db = defaultDb();
  return db;
}

function saveDb() {
  try {
    fs.mkdirSync(userDir, { recursive: true });
    // 保留 5 份备份
    if (fs.existsSync(DB_FILE)) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      fs.copyFileSync(DB_FILE, path.join(userDir, `budget-data.backup-${stamp}.json`));
      const backs = fs.readdirSync(userDir).filter((f) => f.startsWith('budget-data.backup-')).sort();
      while (backs.length > 5) fs.unlinkSync(path.join(userDir, backs.shift()));
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db));
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

app.whenReady().then(() => {
  loadDb();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('db:get', () => db);
ipcMain.handle('db:save', (_e, next) => { db = next; saveDb(); return true; });
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


/* ---------- Excel 导入/导出（实现在 excel.cjs，可单测） ---------- */
const excel = require('./excel.cjs');
ipcMain.handle('excel:importQuantities', (_e, filePath) => excel.importQuantities(filePath));
ipcMain.handle('excel:importQuotas', (_e, filePath) => excel.importQuotas(filePath));
ipcMain.handle('excel:exportQuotas', (_e, args) => excel.exportQuotas(args.filePath, args.quotas));
ipcMain.handle('excel:exportProject', (_e, args) => excel.exportProject(args.filePath, args.project, args.result));
