import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { decodeBackup, openWorkspaceStore } from '../workspace-store.mjs';
import { addEntry, addProject } from '../../prototype/model.js';
import { createSeed } from '../../prototype/tests/fixtures/demo-workspace.js';

const folder = () => mkdtempSync(path.join(tmpdir(), 'cockpit-store-test-'));
const raw = (workspace, version = 3) => JSON.stringify({ format: 'xingjin-prototype-backup', version, workspace });
function addFixture(workspace, name) {
  const project = addProject(workspace, { name, goal: '核对实际工作记录', criteria: '完成后能从另一份备份恢复', firstAction: '创建首个验证行动' });
  addEntry(workspace, { projectId: project.id, title: '一条必须保留的进展' });
  return project.id;
}

test('保存后重开，并将浏览器 v1 备份恢复到独立目录', () => {
  const root = folder(), a = openWorkspaceStore(root);
  const legacy = createSeed(), id = addFixture(legacy, '从浏览器迁移的项目');
  legacy.schemaVersion = 1; delete legacy.completionEvents;
  legacy.tasks.forEach(task => { delete task.parentId; delete task.priority; delete task.completedOn; });
  const saved = a.restore(raw(legacy, 1), 0);
  assert.equal(saved.workspace.schemaVersion, 3);
  assert.equal(saved.workspace.projects.at(-1).id, id);
  const exported = path.join(root, 'copied.json');
  a.exportTo(exported); a.close();
  const reopened = openWorkspaceStore(root);
  assert.deepEqual(reopened.load().workspace, saved.workspace); reopened.close();
  const isolated = openWorkspaceStore(folder());
  assert.deepEqual(isolated.restore(readFileSync(exported, 'utf8'), 0).workspace, saved.workspace);
  const tampered = JSON.parse(readFileSync(exported, 'utf8')); tampered.workspace.projects[0].name = 'tampered';
  assert.throws(() => isolated.restore(JSON.stringify(tampered), 1), /校验值不一致/);
  assert.deepEqual(isolated.load().workspace, saved.workspace); isolated.close();
});
test('拒绝过期导入预览；确认替换前保留可恢复的原始工作空间', () => {
  const root = folder(), a = openWorkspaceStore(root), other = openWorkspaceStore(root);
  const preview = a.load(), latest = other.load();
  addFixture(latest.workspace, '预览之后才加入的项目'); other.commit(latest.workspace, latest.revision);
  assert.throws(() => a.restore(raw(createSeed()), preview.revision), /数据已变化/);
  const saved = a.load();
  assert.equal(saved.workspace.projects.at(-1).name, '预览之后才加入的项目');
  a.restore(raw(createSeed()), saved.revision);
  const snapshot = readdirSync(saved.backupDir).find(file => file.includes('before-import'));
  assert.deepEqual(decodeBackup(readFileSync(path.join(saved.backupDir, snapshot), 'utf8')), saved.workspace);
  a.close(); other.close();
});
test('导入拒绝无效完成日期与行动枚举，保留原工作空间', () => {
  const store = openWorkspaceStore(folder());
  try {
    const saved = store.commit(createSeed(), 0);
    const invalidDate = createSeed();
    invalidDate.projects[0].completedOn = {};
    assert.throws(() => store.restore(raw(invalidDate), saved.revision), /项目完成日期无效/);
    const invalidStatus = createSeed();
    invalidStatus.tasks[0].status = 'constructor';
    assert.throws(() => store.restore(raw(invalidStatus), saved.revision), /行动或其关联无效/);
    assert.deepEqual(store.load().workspace, saved.workspace);
  } finally { store.close(); }
});
test('磁盘不能写备份时可保存主库，但拒绝覆盖和重置', () => {
  const root = folder(); writeFileSync(path.join(root, 'backups'), 'simulates a directory that cannot be written');
  const a = openWorkspaceStore(root), current = a.load();
  addFixture(current.workspace, '保存在主库的项目');
  const saved = a.commit(current.workspace, current.revision);
  assert.match(saved.backupWarning, /未完成/);
  assert.throws(() => a.restore(raw(createSeed()), saved.revision), /原数据未改动/);
  assert.throws(() => a.reset(saved.revision), /原数据未改动/);
  assert.deepEqual(a.load().workspace, saved.workspace); a.close();
});
test('每日副本按天去重并保留最近 14 份，手动备份保留', () => {
  let now = new Date('2026-11-01T02:00:00Z');
  const a = openWorkspaceStore(folder(), { clock: () => now });
  const initial = a.load(); assert.equal(initial.lastBackupAt, '');
  const saved = a.commit(initial.workspace, 0); assert.ok(saved.lastBackupAt);
  a.backup();
  for (let i = 1; i <= 15; i++) {
    now = new Date(Date.UTC(2026, 10, i + 1, 2)); a.load(); a.load();
  }
  const files = readdirSync(saved.backupDir);
  assert.equal(files.filter(name => name.includes('-daily-')).length, 14);
  assert.equal(files.some(name => name.includes('-daily-2026-11-01')), false);
  assert.equal(files.filter(name => name.includes('-manual-')).length, 1); a.close();
});
test('拒绝打开未来版本的主库并保留版本号', () => {
  const root = folder(), file = path.join(root, 'workspace.sqlite');
  const a = new DatabaseSync(file); a.exec('PRAGMA user_version=99'); a.close();
  assert.throws(() => openWorkspaceStore(root), /其他版本/);
  const b = new DatabaseSync(file); assert.equal(b.prepare('PRAGMA user_version').get().user_version, 99); b.close();
});

test('首次启动和明确清空后都保持零项目，清空前保留本机副本', () => {
  const root = folder(), store = openWorkspaceStore(root);
  try {
    const initial = store.load();
    assert.deepEqual(initial.workspace.projects, []);
    assert.deepEqual(initial.workspace.tasks, []);
    assert.deepEqual(initial.workspace.entries, []);
    const active = store.commit(createSeed(), initial.revision);
    const reset = store.reset(active.revision);
    const backup = readdirSync(reset.backupDir).find(file => file.includes('before-reset'));
    assert.deepEqual(decodeBackup(readFileSync(path.join(reset.backupDir, backup), 'utf8')), active.workspace);
    assert.deepEqual(store.load().workspace.projects, []);
  } finally { store.close(); }
  const reopened = openWorkspaceStore(root);
  try { assert.deepEqual(reopened.load().workspace.projects, []); }
  finally { reopened.close(); }
});
