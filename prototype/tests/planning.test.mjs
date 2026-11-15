import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeed } from './fixtures/demo-workspace.js';
import { addProject, addTask, addEntry, setTaskStatus, setProjectStatus, backfillCompletionDate, deadlineItems, deadlineReminders, calendarItems, generateReview, validateWorkspace, createRepository, updateProject, updateProjectDeadline, reviewPeriodEvidence, followUpTasks, setTaskFollowUp, saveIdea, searchWorkspace, isInToday, setToday, closeOutTodayTask } from '../model.js';
import { currentDate, shiftDate, weekRange, monthDays, validDate, chinaCalendarDay } from '../dates.js';
import { layoutTaskGraph } from '../graph.js';
import { updateEntry, convertEntryToTask, convertMindNodeToTask, createMindMap, saveMindNode, removeMindNode, reviewIsStale } from '../model.js';

test('编辑进展保留记录日期和关联，并令旧复盘失效', () => {
  const state = createSeed();
  const entry = addEntry(state, { projectId: 'p-research', taskId: 't-r3', title: '完成部分验证' });
  const review = generateReview(state, entry.projectId);
  const { id, date, createdAt, taskId } = entry;
  updateEntry(state, id, { title: '补全验证记录', outcome: '核对了条件', blocker: '仍缺测点', next: '整理测点对照表' });
  assert.deepEqual([entry.id, entry.date, entry.createdAt, entry.taskId, entry.kind], [id, date, createdAt, taskId, 'blocker']);
  assert.equal(reviewIsStale(state, review), true);
  const task = convertEntryToTask(state, id);
  assert.equal(task.status, 'todo');
  assert.equal(task.due, '');
  assert.equal(convertEntryToTask(state, id).id, task.id);
  assert.equal(generateReview(state, entry.projectId).suggestions.length, 0);
  assert.deepEqual(validateWorkspace(state).tasks.at(-1).source, { entryId: id });
});

test('导图想法转待办保留来源，可再次定位且不会重复创建', () => {
  const state = createSeed(), map = createMindMap(state, '资料梳理');
  const node = saveMindNode(state, map.id, { title: '查原始条件', color: 'blue', kind: 'idea', reference: '' });
  const input = { title: '核对原始条件', note: '先找原文', projectId: 'p-report' };
  const action = convertMindNodeToTask(state, map.id, node.id, input);
  assert.equal(convertMindNodeToTask(state, map.id, node.id, input).id, action.id);
  assert.equal(action.projectId, 'p-report');
  assert.equal(action.status, 'todo');
  assert.equal(validateWorkspace(state).tasks.at(-1).source.nodeId, node.id);
  removeMindNode(state, map.id, node.id);
  assert.equal(validateWorkspace(state).tasks.at(-1).source.label, '资料梳理 / 查原始条件');
});

test('新工作空间没有项目，创建首个项目与行动后可以重开', () => {
  const saved = new Map(), storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  const repo = createRepository(storage);
  assert.deepEqual(repo.state.projects, []);
  const p = repo.commit(state => addProject(state, { name: '我自己的新项目', goal: '完成一轮可追踪的验证', criteria: '形成一份总结', targetDate: currentDate(), firstAction: '写清本周的问题', today: true }));
  assert.equal(repo.state.projects.length, 1);
  assert.equal(p.isDemo, false);
  const task = repo.state.tasks.find(task => task.projectId === p.id);
  assert.equal(task.today, true); assert.equal(task.parentId, '');
  assert.equal(createRepository(storage).state.projects.at(-1).id, p.id);
  assert.doesNotThrow(() => validateWorkspace(repo.state));
  const before = JSON.stringify(repo.state);
  assert.throws(() => repo.commit(state => addProject(state, { name: '  ', criteria: '测试标准' })), /请填写项目名称/);
  assert.equal(JSON.stringify(repo.state), before);
});
test('完成记录保存实际日期，重复完成去重、重开保留历史，截止日期不充当完成日期', () => {
  const state = createSeed(), initial = state.completionEvents.length;
  const task = addTask(state, { projectId: 'p-research', title: '今天完成的独立行动', due: shiftDate(currentDate(), -4) });
  setTaskStatus(state, task.id, 'done');
  assert.equal(task.completedOn, currentDate());
  assert.notEqual(task.completedOn, task.due);
  setTaskStatus(state, task.id, 'done'); assert.equal(state.completionEvents.length, initial + 1);
  setTaskStatus(state, task.id, 'doing'); assert.equal(task.completedOn, ''); assert.equal(state.completionEvents.length, initial + 1);
  setTaskStatus(state, task.id, 'done'); assert.equal(state.completionEvents.length, initial + 2);
  assert.ok(calendarItems(state).some(item => item.id === task.id && item.category === 'completed' && item.date === currentDate()));
});
test('旧版没有完成日期时保留未知，不以截止日期或进展日期推断，可手动补记', () => {
  const old = createSeed(); old.schemaVersion = 2; delete old.completionEvents; old.tasks.forEach(task => delete task.completedOn);
  const state = validateWorkspace(old), task = state.tasks[0];
  assert.equal(task.completedOn, ''); assert.equal(state.completionEvents.length, 0);
  backfillCompletionDate(state, task.id, '2026-11-01');
  assert.equal(task.completedOn, '2026-11-01'); assert.equal(state.completionEvents[0].source, 'backfill');
  assert.throws(() => backfillCompletionDate(state, task.id, '2026-11-02'), /已有完成日期/);
});
test('逾期提醒区分今日截止与逾期，忽略已完成或已暂停项目', () => {
  const state = createSeed(), date = currentDate();
  const overdue = addTask(state, { projectId: 'p-report', title: '已经逾期的事项', due: shiftDate(date, -1) });
  const dueToday = addTask(state, { projectId: 'p-report', title: '今天截止的事项', due: date });
  let list = deadlineItems(state, date);
  assert.equal(list.find(item => item.id === overdue.id).overdue, true);
  assert.equal(list.find(item => item.id === dueToday.id).overdue, false);
  assert.equal(list.find(item => item.id === dueToday.id).today, true);
  setTaskStatus(state, overdue.id, 'done');
  assert.equal(deadlineItems(state, date).some(item => item.id === overdue.id), false);
  setProjectStatus(state, 'p-report', 'paused');
  assert.equal(deadlineItems(state, date).some(item => item.projectId === 'p-report'), false);
});
test('项目完成进入日历，恢复项目后保留完成历史', () => {
  const state = createSeed(); setProjectStatus(state, 'p-research', 'completed');
  assert.ok(calendarItems(state).some(item => item.type === 'project' && item.id === 'p-research' && item.category === 'completed'));
  assert.equal(deadlineItems(state).some(item => item.projectId === 'p-research'), false);
  setProjectStatus(state, 'p-research', 'active');
  assert.ok(state.completionEvents.some(event => event.type === 'project' && event.projectId === 'p-research'));
});
test('项目提醒按提前天数跨月起算；截止当天仍提醒，关闭逾期提醒不改变逾期状态', () => {
  const state = createSeed(), project = state.projects[0], id = project.id;
  const due = '2026-12-02', find = date => deadlineReminders(state, date).find(item => item.id === id);
  project.targetDate = due; // 旧数据没有配置，使用 3 天默认值。
  assert.equal(find('2026-11-28'), undefined);
  assert.equal(find('2026-11-29').daysUntil, 3);
  assert.equal(find('2026-12-02').reminder, 'today');
  assert.equal(find('2026-12-04').reminder, 'overdue');
  updateProjectDeadline(state, id, { targetDate: due, reminderDays: 0, remindOverdue: false });
  assert.equal(find('2026-12-01'), undefined);
  assert.equal(find('2026-12-02').reminder, 'today');
  assert.equal(find('2026-12-03'), undefined);
  assert.equal(deadlineItems(state, '2026-12-03').find(item => item.id === id).overdue, true);
  updateProject(state, { id, goal: '更新项目目标', criteria: '保留明确的完成标准' });
  assert.equal(project.targetDate, due);
  assert.equal(validateWorkspace(state).projects[0].reminderDays, 0);
  assert.throws(() => updateProjectDeadline(state, id, { targetDate: due, reminderDays: 1.5 }), /整数/);
  assert.throws(() => validateWorkspace({ ...state, projects: [{ ...project, remindOverdue: 'false' }] }), /提醒设置/);
  setProjectStatus(state, id, 'paused');
  assert.equal(find('2026-12-02'), undefined);
});
test('每周总结范围与来源正确，跨周记录不混入', () => {
  const state = createSeed(), range = weekRange();
  state.entries = [];
  addEntry(state, { projectId: 'p-research', title: '本周写下的验证成果', outcome: '保留了一份清单' });
  state.entries.push({ ...state.entries[0], id: 'previous-week', date: shiftDate(range.start, -1), createdAt: '2020-01-01T00:00:00Z' });
  const review = generateReview(state, 'p-research', { weekStart: range.start });
  assert.equal(review.weekStart, range.start); assert.equal(review.weekEnd, range.end);
  assert.equal(review.facts.periodEntries, 1); assert.equal(review.sourceIds.length, 1);
  assert.equal(review.sourceIds.includes('previous-week'), false); assert.equal(review.provider, 'rule-demo');
});
test('节点树分层连接且完成进度可传播到父节点', () => {
  const state = createSeed();
  const child = addTask(state, { projectId: 'p-research', parentId: 't-r3', title: '拆分出来的下一步' });
  state.settings.expandedTaskIds.push('t-r3');
  setTaskStatus(state, child.id, 'done');
  const graph = layoutTaskGraph(state, 'p-research');
  const parent = graph.nodes.find(node => node.id === 't-r3'), leaf = graph.nodes.find(node => node.id === child.id);
  assert.ok(leaf.y > parent.y); assert.equal(leaf.progress.status, 'done'); assert.equal(parent.progress.status, 'done');
  assert.ok(graph.edges.find(edge => edge.id.endsWith(':' + child.id)).done);
  assert.ok(graph.width > 0 && graph.height > 0);
});
test('日期与月历边界：星期一开始、42格、合法日期及闰年', () => {
  assert.equal(weekRange('2026-11-06').start, '2026-11-02');
  assert.equal(weekRange('2026-11-08').start, '2026-11-02');
  assert.equal(monthDays('2026-11').length, 42);
  assert.equal(monthDays('2026-11')[0], '2026-10-26');
  assert.equal(validDate('2026-02-30'), false); assert.equal(validDate('2028-02-29'), true);
});
test('日历将同日创建和完成合并，仍保存不同日期的实际完成记录', () => {
  const state = createSeed();
  const project = addProject(state, { name: '甲' });
  assert.equal(project.goal, ''); assert.equal(project.criteria, '');
  assert.equal(calendarItems(state, project.id)[0].category, 'created');
  setProjectStatus(state, project.id, 'completed');
  const sameDay = calendarItems(state, project.id);
  assert.equal(sameDay.length, 1); assert.equal(sameDay[0].alsoCreated, true);
  project.createdAt = '2026-11-02T18:00:00Z';
  const created = calendarItems(state, project.id).find(event => event.category === 'created');
  assert.equal(created.date, '2026-11-03'); assert.equal(created.status, 'completed');
  assert.equal(calendarItems(state, project.id).find(event => event.category === 'completed').date, currentDate());
  assert.equal(calendarItems(state, 'p-research').some(event => event.category === 'created'), false);
});
test('已知完成日期的旧项目无需完成事件也能显示完成标记', () => {
  const state = createSeed();
  const project = state.projects[0];
  project.status = 'completed';
  project.completedOn = '2026-10-25';
  const completed = calendarItems(state, project.id).filter(event => event.type === 'project' && event.category === 'completed');
  assert.deepEqual(completed.map(event => event.date), ['2026-10-25']);
  assert.equal(state.completionEvents.some(event => event.type === 'project'), false);
});
test('所选日期跨周跨月时使用不同范围，并排除未来进展', () => {
  const state = createSeed(), options = { date: '2026-11-06', today: '2026-11-06' };
  const week = reviewPeriodEvidence(state, 'p-research', options);
  const month = reviewPeriodEvidence(state, 'p-research', { ...options, period: 'month' });
  assert.deepEqual(month.range, { start: '2026-11-01', end: '2026-11-30' });
  assert.equal(week.completed.length, 1); assert.equal(month.completed.length, 2);
  assert.equal(reviewPeriodEvidence(state, 'p-research', { ...options, date: '2026-12-03', period: 'month' }).entries.length, 0);
});
test('节日和放假调休分开标注', () => {
  assert.deepEqual(chinaCalendarDay('2027-02-05'), { festival: '除夕', holiday: '春节', workday: false });
  assert.equal(chinaCalendarDay('2027-02-06').festival, '春节');
  assert.equal(chinaCalendarDay('2027-02-14').workday, true);
  assert.equal(chinaCalendarDay('2026-09-25').festival, '中秋节');
  assert.equal(chinaCalendarDay('2027-02-20').holiday, undefined);
});
test('跟进按日期排列，忽略已完成行动和暂停项目，日期独立于截止日', () => {
  const state = createSeed(), due = state.tasks.find(task => task.id === 't-r3').due;
  setTaskFollowUp(state, 't-r4', '2026-11-12');
  setTaskFollowUp(state, 't-r3', '2026-11-06');
  assert.deepEqual(followUpTasks(state).map(task => task.id), ['t-r3', 't-r4']);
  assert.equal(state.tasks.find(task => task.id === 't-r3').due, due);
  assert.throws(() => setTaskFollowUp(state, 't-r4', '2026-02-30'), /有效的跟进日期/);
  assert.doesNotThrow(() => validateWorkspace(state));
  setTaskStatus(state, 't-r3', 'done');
  assert.deepEqual(followUpTasks(state).map(task => task.id), ['t-r4']);
  setProjectStatus(state, 'p-research', 'paused');
  assert.equal(followUpTasks(state).length, 0);
  setProjectStatus(state, 'p-research', 'active');
  setTaskFollowUp(state, 't-r4', '');
  assert.equal(followUpTasks(state)[0].followUpOn, undefined);
});
test('全局搜索按关键词匹配四种内容的正文', () => {
  const state = createSeed();
  const project = addProject(state, { name: '自用项目', description: 'TEG 接口样例' });
  const task = addTask(state, { projectId: project.id, title: '验证连接', note: 'TEG 接口样例' });
  const entry = addEntry(state, { projectId: project.id, title: '实际输出', outcome: 'TEG 接口样例' });
  const idea = saveIdea(state, { title: '另一个想法', body: 'TEG 接口样例' });
  const result = searchWorkspace(state, '  ＴＥＧ 接口  ');
  assert.deepEqual(result.map(group => group.kind), ['project', 'task', 'entry', 'idea']);
  assert.deepEqual(result.map(group => group.rows[0].id), [project.id, task.id, entry.id, idea.id]);
});
test('收工安排跨月后进入今日，保留截止日期并处理待办和等待', () => {
  const state = createSeed(), day = '2026-11-30';
  const original = state.tasks.find(task => task.id === 't-r3');
  const due = original.due;
  const planned = closeOutTodayTask(state, original.id, 'tomorrow', day);
  assert.equal(planned.plannedOn, '2026-12-01');
  assert.equal(planned.status, 'doing');
  assert.equal(planned.due, due);
  assert.equal(isInToday(planned, day), false);
  assert.throws(() => closeOutTodayTask(state, planned.id, 'todo', day), /不在今日安排/);
  assert.equal(isInToday(planned, '2026-12-01'), true);
  assert.equal(isInToday(planned, '2026-12-02'), true);
  const restored = validateWorkspace(state);
  assert.equal(isInToday(restored.tasks.find(task => task.id === planned.id), '2026-12-01'), true);
  setToday(state, planned.id, false);
  assert.equal(isInToday(planned, '2026-12-01'), false);

  setTaskStatus(state, 't-c1', 'doing');
  const backlog = closeOutTodayTask(state, 't-c1', 'todo', day);
  assert.equal(backlog.status, 'todo');
  assert.equal(isInToday(backlog, '2026-12-01'), false);
  const waiting = closeOutTodayTask(state, 't-e1', 'waiting', day);
  assert.equal(waiting.status, 'waiting');
  assert.equal(isInToday(waiting, '2026-12-01'), false);
  assert.ok(followUpTasks(state).includes(waiting));
});
