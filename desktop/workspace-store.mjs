import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { validateWorkspace } from '../prototype/model.js';
import { createEmptyWorkspace } from '../prototype/workspace.js';
import { currentDate } from '../prototype/dates.js';

const FORMAT = 'xingjin-prototype-backup';
const SQLITE_VERSION = 1;
const DAILY_LIMIT = 14;
const BACKUP_NAME = /^Cockpit-(daily|manual|before-import|before-reset)-(\d{4}-\d{2}-\d{2})-[\dTZ-]+-[0-9a-f]{8}\.json$/;
export const MAX_BACKUP_BYTES = 16 * 1024 * 1024;
const checksum = workspace => createHash('sha256').update(JSON.stringify(workspace)).digest('hex');

export function decodeBackup(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_BACKUP_BYTES) throw new Error('备份超过 16 MB 或格式不正确。');
  let backup;
  try { backup = JSON.parse(raw); } catch { throw new Error('无法读取 JSON 备份。'); }
  if (backup?.format !== FORMAT || ![1, 2, 3].includes(backup.version)) throw new Error('请选择 Cockpit 导出的 JSON 备份。');
  if (backup.sha256 !== undefined && (!backup.workspace || backup.sha256 !== checksum(backup.workspace))) throw new Error('备份内容与校验值不一致，未恢复。');
  return validateWorkspace(backup.workspace);
}

function encodeBackup(workspace, now) {
  const text = JSON.stringify({ format: FORMAT, version: 3, exportedAt: now.toISOString(), sha256: checksum(workspace), workspace });
  if (Buffer.byteLength(text) > MAX_BACKUP_BYTES) throw new Error('工作空间超过此版本支持的 16 MB 备份大小。');
  return text;
}

function atomicWrite(file, text) {
  const temporary = path.join(path.dirname(file), `.cockpit-${randomUUID()}.tmp`);
  try {
    const fd = openSync(temporary, 'wx');
    try { writeFileSync(fd, text, 'utf8'); fsyncSync(fd); }
    finally { closeSync(fd); }
    renameSync(temporary, file);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* Missing or locked: leave the original destination alone. */ }
    throw error;
  }
}

export function openWorkspaceStore(root, { clock = () => new Date() } = {}) {
  const backupDir = path.join(root, 'backups');
  mkdirSync(root, { recursive: true });
  const database = new DatabaseSync(path.join(root, 'workspace.sqlite'));
  let backupWarning = '';
  try {
    database.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL');
    const version = database.prepare('PRAGMA user_version').get().user_version;
    if (version === 0) {
      database.exec(`BEGIN IMMEDIATE;
        CREATE TABLE workspace (id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL CHECK (revision >= 1), payload TEXT NOT NULL);
        PRAGMA user_version=${SQLITE_VERSION};
        COMMIT;`);
    } else if (version !== SQLITE_VERSION) {
      throw new Error('工作空间由其他版本创建。请用兼容的 Cockpit 打开；原有数据未覆盖。');
    }
  } catch (error) { database.close(); throw error; }
  const select = database.prepare('SELECT revision, payload FROM workspace WHERE id = 1');
  const upsert = database.prepare('INSERT INTO workspace (id, revision, payload) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision, payload=excluded.payload');
  function read() {
    const row = select.get();
    if (!row) return { revision: 0, workspace: createEmptyWorkspace() };
    return { revision: row.revision, workspace: validateWorkspace(JSON.parse(row.payload)) };
  }
  function files() {
    mkdirSync(backupDir, { recursive: true });
    return readdirSync(backupDir, { withFileTypes: true }).flatMap(entry => {
      const match = BACKUP_NAME.exec(entry.name);
      if (!entry.isFile() || !match) return [];
      try { const stat = statSync(path.join(backupDir, entry.name)); return [{ name: entry.name, kind: match[1], day: match[2], mtime: stat.mtimeMs }]; }
      catch { return []; }
    }).sort((a, b) => b.mtime - a.mtime || b.name.localeCompare(a.name));
  }
  function snapshot(workspace, kind, now = clock()) {
    mkdirSync(backupDir, { recursive: true });
    const suffix = randomUUID().slice(0, 8), stamp = now.toISOString().replace(/[:.]/g, '-');
    const name = `Cockpit-${kind}-${currentDate(now)}-${stamp}-${suffix}.json`;
    atomicWrite(path.join(backupDir, name), encodeBackup(workspace, now));
    return name;
  }
  function daily(current) {
    if (!current.revision) return;
    const now = clock();
    try {
      if (!files().some(file => file.kind === 'daily' && file.day === currentDate(now))) snapshot(current.workspace, 'daily', now);
      for (const file of files().filter(file => file.kind === 'daily').slice(DAILY_LIMIT)) unlinkSync(path.join(backupDir, file.name));
      backupWarning = '';
    } catch { backupWarning = '本次自动备份或清理未完成。可手动创建备份。'; }
  }
  function info() {
    let latest = null;
    try { latest = files()[0] || null; } catch { /* A locked or inaccessible directory is reported in backupWarning. */ }
    return { dataDir: root, backupDir, lastBackupAt: latest ? new Date(latest.mtime).toISOString() : '', lastBackupName: latest?.name || '', backupWarning };
  }
  function write(workspace, expected, beforeKind = '') {
    const validated = validateWorkspace(workspace);
    const payload = JSON.stringify(validated);
    // Every saved workspace must fit into a restorable backup.
    encodeBackup(validated, clock());
    let revision;
    database.exec('BEGIN IMMEDIATE');
    try {
      const previous = read();
      if (!Number.isSafeInteger(expected) || previous.revision !== expected) throw new Error('项目数据已变化，请重新打开或重新选取备份后再试。');
      if (beforeKind) {
        try { snapshot(previous.workspace, beforeKind); }
        catch { throw new Error('无法保存操作前备份；原数据未改动。'); }
      }
      revision = expected + 1;
      upsert.run(revision, payload);
      database.exec('COMMIT');
    } catch (error) { database.exec('ROLLBACK'); throw error; }
    const saved = { workspace: validated, revision };
    daily(saved);
    return { ...saved, ...info() };
  }
  return {
    load() { const current = read(); daily(current); return { ...current, ...info() }; },
    status() { return info(); },
    commit(workspace, revision) { return write(workspace, revision); },
    restore(raw, revision) { return write(decodeBackup(raw), revision, 'before-import'); },
    reset(revision) { return write(createEmptyWorkspace(), revision, 'before-reset'); },
    backup() { const name = snapshot(read().workspace, 'manual'); backupWarning = ''; return { ...info(), name }; },
    exportTo(file) {
      if (path.extname(file).toLowerCase() !== '.json') throw new Error('备份文件须使用 .json 扩展名。');
      atomicWrite(file, encodeBackup(read().workspace, clock()));
    },
    close() { database.close(); }
  };
}
