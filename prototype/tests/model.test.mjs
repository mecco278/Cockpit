import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeed } from './fixtures/demo-workspace.js';
import { addEntry, addTask, setTaskStatus, generateReview, applySuggestions, metrics, validateWorkspace, createRepository, STORAGE_KEY, reviewIsStale, MIGRATION_BACKUP_KEY, taskProgress, visibleTaskRows, expandTaskAncestors, setTaskPriority, sortByPriority, setToday, weeklyReviewEvidence } from '../model.js';
import { addProject } from '../model.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test('完整流程：完成行动、以记录生成并采纳草稿，保留其他项目', () => {
  const state = createSeed();
  const other = JSON.stringify(state.tasks.filter(t => t.projectId !== 'p-research'));
  const beforeCount = state.tasks.length;
  const entry = addEntry(state, { projectId: 'p-research', taskId: 't-r3', title: '完成条件清单草稿', outcome: '保留了一页输入条件。', next: '确认输入条件', taskStatus: 'done' });
  assert.equal(state.tasks.find(t => t.id === 't-r3').status, 'done');
  assert.equal(state.tasks.find(t => t.id === 't-r3').today, false);
  const review = generateReview(state, 'p-research');
  assert.ok(review.sourceIds.includes(entry.id));
  assert.equal(review.facts.done, 3);
  const revision = applySuggestions(state, review.id, [{ id: review.suggestions[0].id, title: '确认输入条件并写清验收方式', due: '2026-11-05', today: true }], '先处理比较条件，再执行验证。');
  assert.equal(state.tasks.length, beforeCount + 1);
  assert.equal(review.status, 'applied');
  assert.equal(review.suggestions[0].sourceEntryId, entry.id);
  assert.equal(review.suggestions[0].due, '');
  assert.equal(generateReview(state, 'p-research').suggestions.length, 0);
  assert.equal(revision.changes[0].title, '确认输入条件并写清验收方式');
  assert.equal(JSON.stringify(state.tasks.filter(t => t.projectId !== 'p-research')), other);
  assert.equal(state.entries.length, 6);
  assert.doesNotThrow(() => validateWorkspace(state));
});
test('过期复盘不能覆盖新进展，且重复采纳不会重复创建行动', () => {
  const state = createSeed();
  addEntry(state, { projectId: 'p-research', title: '验证草稿', next: '留下具体证据' });
  const old = generateReview(state, 'p-research');
  setTaskStatus(state, 't-r3', 'done');
  assert.ok(reviewIsStale(state, old));
  assert.throws(() => applySuggestions(state, old.id, [{ id: old.suggestions[0].id, title: '测试行动' }]), /已发生变化/);
  const fresh = generateReview(state, 'p-research');
  const edit = { id: fresh.suggestions[0].id, title: '测试行动' };
  applySuggestions(state, fresh.id, [edit], '测试理由');
  const count = state.tasks.length;
  assert.throws(() => applySuggestions(state, fresh.id, [edit], '测试理由'), /已经处理过/);
  assert.equal(state.tasks.length, count);
});
test('周复盘按实际完成日取证，并优先推荐仍可执行的到期行动', () => {
  const state = createSeed();
  const thisWeek = weeklyReviewEvidence(state, 'p-research', { today: '2026-11-06' });
  assert.deepEqual(thisWeek.completed.map(event => event.taskId), ['t-r2']);
  assert.equal(thisWeek.blockers[0].id, 'e-r3');
  assert.equal(thisWeek.focus.id, 't-r3');
  assert.deepEqual(thisWeek.waiting.map(task => task.id), ['t-r4']);
  const priorWeek = weeklyReviewEvidence(state, 'p-research', { weekStart: '2026-11-01', today: '2026-11-06' });
  assert.deepEqual(priorWeek.completed.map(event => event.taskId), ['t-r1']);
  assert.equal(priorWeek.blockers.length, 0);
  const project = state.projects.find(project => project.id === 'p-research');
  project.status = 'paused';
  assert.equal(weeklyReviewEvidence(state, project.id).focus, null);
});
test('仓储在异常时不提交部分修改，刷新后恢复完整数据', () => {
  const storage = memoryStorage(), repo = createRepository(storage);
  repo.replace(createSeed());
  const before = JSON.stringify(repo.state);
  assert.throws(() => repo.commit(state => { state.projects[0].goal = '不应该保存'; throw new Error('失败'); }));
  assert.equal(JSON.stringify(repo.state), before);
  repo.commit(state => addTask(state, { projectId: 'p-research', title: '保留可恢复的新增行动', due: '', minutes: 20 }));
  const restored = createRepository(storage);
  assert.equal(restored.state.tasks.length, 10);
  assert.deepEqual(restored.state, repo.state);
});
test('无效备份、跨项目关联与重复对象会被拒绝', () => {
  const bad = createSeed(); bad.tasks[0].projectId = 'missing';
  assert.throws(() => validateWorkspace(bad), /关联无效/);
  const duplicate = createSeed(); duplicate.tasks.push({ ...duplicate.tasks[0] });
  assert.throws(() => validateWorkspace(duplicate), /重复 ID/);
  const state = createSeed();
  assert.throws(() => addEntry(state, { projectId: 'p-report', taskId: 't-r3', title: '跨项目错误关联' }), /不属于该项目/);
});
test('浏览器存储不可写时仍可导出会话数据，并明确标记不可持久化', () => {
  const fixture = JSON.stringify(createSeed());
  const repo = createRepository({ getItem: () => fixture, setItem: () => { throw new Error('quota'); } });
  repo.commit(state => addEntry(state, { projectId: 'p-research', title: '临时会话中的进展' }));
  assert.equal(repo.writable, false);
  assert.equal(repo.state.entries.length, 6);
  assert.match(repo.loadError, /仅保留在当前会话/);
});
test('检测其他窗口改动，防止旧窗口静默覆盖', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify(createSeed()));
  const first = createRepository(storage), second = createRepository(storage);
  first.commit(state => addTask(state, { projectId: 'p-research', title: '窗口一的新增行动' }));
  assert.throws(() => second.commit(state => addTask(state, { projectId: 'p-report', title: '窗口二的新增行动' })), /另一个窗口/);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).tasks.length, 10);
  assert.equal(second.state.tasks.length, 9);
});
test('损坏的存储保留原文，不自动覆盖；正式导入需通过验证', () => {
  const storage = memoryStorage(); storage.setItem(STORAGE_KEY, '{broken');
  const repo = createRepository(storage);
  assert.equal(repo.writable, false);
  repo.commit(state => addProject(state, { name: '新的临时项目' }));
  assert.equal(storage.getItem(STORAGE_KEY), '{broken');
  assert.throws(() => repo.replace({ schemaVersion: 5 }));
  repo.replace(createSeed());
  assert.equal(repo.writable, true);
  assert.equal(metrics(repo.state, 'p-research').tasks, 6);
});

test('旧工作空间自动补齐紧急程度与层级，保留原始备份及全部体验记录', () => {
  const old = createSeed(); old.schemaVersion = 1;
  old.tasks.forEach(task => { delete task.priority; delete task.parentId; });
  delete old.settings.expandedTaskIds;
  old.tasks[2].title = '用户已经修改过的行动';
  const storage = memoryStorage(), raw = JSON.stringify(old);
  storage.setItem(STORAGE_KEY, raw);
  const repo = createRepository(storage);
  assert.equal(repo.state.schemaVersion, 3);
  assert.equal(repo.state.tasks[2].title, '用户已经修改过的行动');
  assert.equal(repo.state.tasks[2].priority, 'normal');
  assert.equal(repo.state.tasks[2].parentId, '');
  assert.deepEqual(repo.state.entries, old.entries);
  assert.equal(storage.getItem(MIGRATION_BACKUP_KEY), raw);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  repo.commit(state => setTaskPriority(state, 't-r3', 'urgent'));
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).schemaVersion, 3);
  assert.equal(storage.getItem(MIGRATION_BACKUP_KEY), raw);
  assert.equal(createRepository(storage).state.tasks[2].priority, 'urgent');
});

test('多层拆分折叠、汇总和末级统计不重复计算父事项', () => {
  const state = createSeed(), before = metrics(state, 'p-research').tasks;
  const child1 = addTask(state, { projectId: 'p-research', parentId: 't-r3', title: '写清输入条件', today: true });
  const child2 = addTask(state, { projectId: 'p-research', parentId: 't-r3', title: '写清验收方式' });
  const grandchild = addTask(state, { projectId: 'p-research', parentId: child1.id, title: '列出需要控制的条件' });
  assert.equal(state.tasks.find(t => t.id === 't-r3').today, false);
  assert.equal(child1.today, false);
  assert.equal(metrics(state, 'p-research').tasks, before + 1);
  assert.equal(visibleTaskRows(state, 'p-research').length, 6);
  expandTaskAncestors(state, grandchild.id);
  assert.equal(visibleTaskRows(state, 'p-research').find(row => row.task.id === grandchild.id).depth, 2);
  setTaskStatus(state, child2.id, 'done'); setTaskStatus(state, grandchild.id, 'done');
  assert.deepEqual(taskProgress(state, 't-r3'), { total: 2, done: 2, status: 'done', grouped: true });
  assert.throws(() => setTaskStatus(state, 't-r3', 'done'), /由子项汇总/);
  assert.throws(() => setToday(state, 't-r3', true), /选择具体子行动/);
  assert.throws(() => addEntry(state, { projectId: 'p-research', taskId: 't-r3', title: '错误地完成父事项', taskStatus: 'done' }), /父事项/);
  addEntry(state, { projectId: 'p-research', taskId: 't-r3', title: '记录父事项的阶段说明' });
  assert.doesNotThrow(() => validateWorkspace(state));
});

test('紧急程度独立于状态、按紧急程度排序，非法值被拒绝', () => {
  const state = createSeed();
  setTaskPriority(state, 't-e1', 'urgent');
  const selected = sortByPriority(state.tasks.filter(t => t.today));
  assert.equal(selected[0].id, 't-e1');
  assert.equal(selected[0].status, 'todo');
  assert.equal(selected[1].priority, 'high');
  assert.throws(() => setTaskPriority(state, 't-r3', 'random-color'), /无效/);
});

test('导入拒绝循环、跨项目父项及无效紧急程度', () => {
  const cycle = createSeed(); cycle.tasks[2].parentId = 't-r4'; cycle.tasks[3].parentId = 't-r3';
  assert.throws(() => validateWorkspace(cycle), /循环/);
  const cross = createSeed(); cross.tasks[2].parentId = 't-c1';
  assert.throws(() => validateWorkspace(cross), /关联无效/);
  const badColor = createSeed(); badColor.tasks[2].priority = '<script>';
  assert.throws(() => validateWorkspace(badColor), /关联无效/);
});

test('升级副本无法保存时仍保留读取到的旧项目，而非重置示例', () => {
  const old = createSeed(); old.schemaVersion = 1; old.projects[0].goal = '用户保留下来的项目目标';
  old.tasks.forEach(task => { delete task.priority; delete task.parentId; }); delete old.settings.expandedTaskIds;
  const raw = JSON.stringify(old);
  const repo = createRepository({ getItem: key => key === STORAGE_KEY ? raw : null, setItem: () => { throw new Error('quota'); } });
  assert.equal(repo.writable, false);
  assert.equal(repo.state.projects[0].goal, '用户保留下来的项目目标');
  assert.match(repo.loadError, /无法保存升级副本/);
});
