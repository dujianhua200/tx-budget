/**
 * 数据文件层（v2）：原子写 + 备份策略（§4.3）。
 * 仅依赖 fs/path，不依赖 Electron，可在 Node 中直测。
 */
const fs = require('fs');
const path = require('path');

const ROLLING_PREFIX = 'budget-data.backup-';
const V1_BACKUP_PREFIX = 'budget-data.v1-backup-';
const ROLLING_KEEP = 5;
const BACKUP_MIN_INTERVAL_MS = 60 * 60 * 1000; // 滚动备份最小间隔 1 小时

const stamp = (d = new Date()) => d.toISOString().replace(/[:.]/g, '-').slice(0, 19);

/** 原子写：写临时文件 -> fsync -> rename 覆盖，避免写一半崩溃导致 JSON 损坏。 */
function atomicWriteFileSync(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, content);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, filePath);
}

/** 迁移前一次性快照文件名（与滚动备份区分，永不自动删除）。 */
function v1BackupFileName(now = new Date()) {
  return `${V1_BACKUP_PREFIX}${stamp(now)}.json`;
}

/** 写 v1 迁移快照，返回文件名。 */
function writeV1BackupSync(dir, rawContent, now = new Date()) {
  const name = v1BackupFileName(now);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), rawContent);
  return name;
}

/** 列出全部 v1 迁移快照（按文件名排序，即按时间排序）。 */
function listV1Backups(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.startsWith(V1_BACKUP_PREFIX)).sort();
}

/**
 * 滚动备份清理：只处理 budget-data.backup-*，永不碰 v1-backup-*。
 * 返回被删除的文件名列表。
 */
function pruneRollingBackupsSync(dir, keep = ROLLING_KEEP) {
  if (!fs.existsSync(dir)) return [];
  const backs = fs.readdirSync(dir).filter((f) => f.startsWith(ROLLING_PREFIX)).sort();
  const deleted = [];
  while (backs.length > keep) {
    const victim = backs.shift();
    fs.unlinkSync(path.join(dir, victim));
    deleted.push(victim);
  }
  return deleted;
}

/** 是否需要做滚动备份：重大操作强制；否则距最近一次滚动备份 >= 1 小时才做。 */
function shouldBackup(dir, { major = false } = {}, now = new Date()) {
  if (major) return true;
  if (!fs.existsSync(dir)) return true;
  const backs = fs.readdirSync(dir).filter((f) => f.startsWith(ROLLING_PREFIX)).sort();
  if (!backs.length) return true;
  const latest = path.join(dir, backs[backs.length - 1]);
  try {
    return now.getTime() - fs.statSync(latest).mtimeMs >= BACKUP_MIN_INTERVAL_MS;
  } catch {
    return true;
  }
}

/** 滚动备份文件名。 */
function rollingBackupFileName(now = new Date()) {
  return `${ROLLING_PREFIX}${stamp(now)}.json`;
}

/**
 * 回滚：用指定的 v1 备份覆盖当前数据文件。
 * 回滚前先把当前 v2 文件存为 budget-data.v2-before-rollback-<戳>.json（§4.3）。
 * 返回 { restoredFrom, preservedAs }；preservedAs 为 null 表示当时无数据文件。
 */
function rollbackToV1BackupSync(dir, backupFile, dbFileName = 'budget-data.json') {
  const dbPath = path.join(dir, dbFileName);
  const backupPath = path.join(dir, backupFile);
  if (!fs.existsSync(backupPath)) throw new Error(`备份文件不存在：${backupFile}`);
  let preservedAs = null;
  if (fs.existsSync(dbPath)) {
    preservedAs = `budget-data.v2-before-rollback-${stamp()}.json`;
    fs.copyFileSync(dbPath, path.join(dir, preservedAs));
  }
  fs.copyFileSync(backupPath, dbPath);
  return { restoredFrom: backupFile, preservedAs };
}

module.exports = {
  atomicWriteFileSync,
  v1BackupFileName,
  writeV1BackupSync,
  listV1Backups,
  pruneRollingBackupsSync,
  shouldBackup,
  rollingBackupFileName,
  rollbackToV1BackupSync,
  ROLLING_KEEP,
};
