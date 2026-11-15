import { createEmptyWorkspace, STATUS, PRIORITY } from './workspace.js';
import { currentDate, validDate, weekRange, monthRange, shiftDate, daysBetween } from './dates.js';

export const STORAGE_KEY = 'xingjin.prototype.workspace.v1';
export const MIGRATION_BACKUP_KEY = STORAGE_KEY + '.before-v3';
export const DEFAULT_PROJECT_REMINDER_DAYS = 3;
export const MAX_PROJECT_REMINDER_DAYS = 365;
export const projectReminder = project => ({
  days: project.reminderDays ?? DEFAULT_PROJECT_REMINDER_DAYS,
  overdue: project.remindOverdue ?? true,
});
const validReminderDays = days => Number.isInteger(days) && days >= 0 && days <= MAX_PROJECT_REMINDER_DAYS;
function projectDeadlineSettings(input) {
  const targetDate = input.targetDate || '';
  if (targetDate && !validDate(targetDate)) throw new Error('项目截止日期无效。');
  const reminderDays = input.reminderDays ?? DEFAULT_PROJECT_REMINDER_DAYS, remindOverdue = input.remindOverdue ?? true;
  if (!validReminderDays(reminderDays)) throw new Error(`提前提醒天数须为 0–${MAX_PROJECT_REMINDER_DAYS} 的整数。`);
  if (typeof remindOverdue !== 'boolean') throw new Error('逾期提醒设置无效。');
  return { targetDate, reminderDays, remindOverdue };
}
export const clone = value => structuredClone(value);
export const uid = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
export const BOARD_COLORS = { original: '默认', mint: '薄荷绿', blue: '晴空蓝', amber: '暖杏黄', violet: '薰衣草紫', rose: '珊瑚粉' };
const defaultWidgetLayout = { left: ['actions', 'closeout', 'recent'], right: ['capacity', 'followup', 'focus', 'rhythm'] };
const widgetIds = Object.values(defaultWidgetLayout).flat();
export function widgetLayout(state) {
  if (state.settings.widgetOrder) return state.settings.widgetOrder;
  const { left, right } = state.settings.widgetLayout || defaultWidgetLayout;
  return Array.from({ length: Math.max(left.length, right.length) }, (_, i) => [left[i], right[i]]).flat().filter(Boolean);
}
export const WIDGET_BOARD = { columns: 4, rows: 160, minHeight: 2, maxHeight: 14 };
const widgetHeights = { actions: 5, capacity: 2, closeout: 2, followup: 3, recent: 4, focus: 4, rhythm: 3 };
export function widgetBoard(state) {
  if (state.settings.widgetBoard) return state.settings.widgetBoard;
  let x = 0, y = 0, rowHeight = 0;
  const board = {};
  for (const id of widgetLayout(state)) {
    const w = state.settings.widgetSizes?.[id] || 2, h = widgetHeights[id];
    if (x + w > WIDGET_BOARD.columns) { x = 0; y += rowHeight; rowHeight = 0; }
    board[id] = { x, y, w, h };
    x += w;
    rowHeight = Math.max(rowHeight, h);
  }
  return board;
}
const widgetOverlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const validWidgetBox = box => box && [box.x, box.y, box.w, box.h].every(Number.isInteger) &&
  box.x >= 0 && box.y >= 0 && box.w >= 1 && box.h >= WIDGET_BOARD.minHeight &&
  box.x + box.w <= WIDGET_BOARD.columns && box.y + box.h <= WIDGET_BOARD.rows && box.h <= WIDGET_BOARD.maxHeight;
export function placeWidget(state, id, box) {
  if (!widgetIds.includes(id) || !validWidgetBox(box)) throw new Error('小组件位置或尺寸无效。');
  const board = clone(widgetBoard(state)), displaced = [];
  for (const key of Object.keys(board)) {
    if (key !== id && widgetOverlap(board[key], box)) {
      displaced.push([key, board[key]]);
      delete board[key];
    }
  }
  board[id] = { ...box };
  displaced.sort(([, a], [, b]) => a.y - b.y || a.x - b.x);
  for (const [key, item] of displaced) {
    item.y = box.y + box.h;
    while (Object.values(board).some(other => widgetOverlap(item, other))) item.y++;
    if (!validWidgetBox(item)) throw new Error('下方空间不足，请移动到其他位置。');
    board[key] = item;
  }
  state.settings.widgetBoard = board;
}
export function setWidgetColor(state, id, color) {
  if (!widgetIds.includes(id) || !Object.hasOwn(BOARD_COLORS, color)) throw new Error('小组件颜色无效。');
  (state.settings.widgetColors ??= {})[id] = color;
}
export const MIND_CANVAS = { width: 16000, height: 12000, nodeWidth: 190, nodeHeight: 104 };
export function createMindMap(state, title) {
  const name = requiredText(title, '导图名称', 1);
  if (name.length > 100 || (state.mindMaps?.length || 0) >= 100) throw new Error('导图名称或数量超出限制。');
  const map = { id: uid('map'), title: name, nodes: [{ id: uid('node'), title: name, note: '', color: 'mint', x: 70, y: 140 }], links: [] };
  (state.mindMaps ??= []).push(map);
  return map;
}
function requireMindMap(state, id) {
  const map = state.mindMaps?.find(item => item.id === id);
  if (!map) throw new Error('没有找到这张导图。');
  return map;
}
export function mindSize(node) {
  return { width: node.width ?? MIND_CANVAS.nodeWidth, height: node.height ?? MIND_CANVAS.nodeHeight };
}
export function clampMindPosition(x, y, node = {}) {
  const { width, height } = mindSize(node);
  return { x: Math.round(Math.max(0, Math.min(MIND_CANVAS.width - width, x))),
    y: Math.round(Math.max(0, Math.min(MIND_CANVAS.height - height, y))) };
}
export function clampMindSize(width, height, node) {
  return { width: Math.round(Math.max(150, Math.min(660, MIND_CANVAS.width - node.x, width))),
    height: Math.round(Math.max(86, Math.min(600, MIND_CANVAS.height - node.y, height))) };
}
export function resizeMindNode(state, mapId, id, width, height) {
  const node = requireMindMap(state, mapId).nodes.find(item => item.id === id);
  if (!node || !Number.isFinite(width) || !Number.isFinite(height)) throw new Error('节点尺寸无效。');
  Object.assign(node, clampMindSize(width, height, node));
}
export function saveMindNode(state, mapId, values, nodeId = '', parentId = '') {
  const map = requireMindMap(state, mapId);
  const title = requiredText(values.title, '节点名称', 1), note = values.note?.trim() || '';
  if (title.length > 120 || note.length > 4000 || !Object.hasOwn(BOARD_COLORS, values.color)) throw new Error('节点内容或颜色无效。');
  const fields = { title, note, color: values.color };
  if (values.kind !== undefined) {
    if (!['idea', 'literature', 'topic'].includes(values.kind) || typeof values.reference !== 'string' || values.reference.length > 2000) throw new Error('节点类型或来源无效。');
    fields.kind = values.kind;
    fields.reference = values.reference.trim();
  }
  if (nodeId) {
    const node = map.nodes.find(item => item.id === nodeId);
    if (!node) throw new Error('没有找到这个节点。');
    return Object.assign(node, fields);
  }
  const parent = parentId && map.nodes.find(item => item.id === parentId);
  if (parentId && !parent) throw new Error('没有找到上级节点。');
  if (map.nodes.length >= 300 || (parent && map.links.length >= 1000)) throw new Error('这张导图已达节点或连线数量上限。');
  const manual = Number.isFinite(values.x) && Number.isFinite(values.y);
  const origin = manual ? clampMindPosition(values.x, values.y) : parent ? clampMindPosition(parent.x + mindSize(parent).width + 60, parent.y) : { x: 70, y: 140 };
  let position = origin;
  for (let i = 0; !manual && i < 300; i++) {
    position = clampMindPosition((origin.x + Math.floor(i / 12) * 220) % 2600, (origin.y + (i % 12) * 126) % 1680);
    if (!map.nodes.some(node => position.x < node.x + mindSize(node).width + 10 && node.x < position.x + 200 &&
      position.y < node.y + mindSize(node).height + 10 && node.y < position.y + 114)) break;
  }
  const node = { id: uid('node'), ...fields, ...position };
  map.nodes.push(node);
  if (parent) map.links.push({ from: parent.id, to: node.id, branch: true });
  return node;
}
export function linkMindNodes(state, mapId, from, to) {
  const map = requireMindMap(state, mapId);
  if (from === to || ![from, to].every(id => map.nodes.some(node => node.id === id))) throw new Error('请选择两个不同的节点。');
  if (map.links.some(link => link.from === from && link.to === to)) throw new Error('这两个节点已有这条连线。');
  if (map.links.length >= 1000) throw new Error('这张导图已达连线数量上限。');
  map.links.push({ from, to });
}
export function labelMindLink(state, mapId, from, to, label) {
  const link = requireMindMap(state, mapId).links.find(item => item.from === from && item.to === to);
  if (!link || typeof label !== 'string' || label.length > 120) throw new Error('连线说明无效。');
  link.label = label.trim();
}
export function unlinkMindNodes(state, mapId, from, to) {
  const map = requireMindMap(state, mapId);
  map.links = map.links.filter(link => link.from !== from || link.to !== to);
}
export function moveMindNode(state, mapId, nodeId, x, y) {
  const node = requireMindMap(state, mapId).nodes.find(item => item.id === nodeId);
  if (!node || !Number.isFinite(x) || !Number.isFinite(y)) throw new Error('节点位置无效。');
  Object.assign(node, clampMindPosition(x, y, node));
}
export function removeMindNode(state, mapId, id) {
  const map = requireMindMap(state, mapId);
  if (map.nodes[0]?.id === id) throw new Error('中心主题可以编辑。');
  map.nodes = map.nodes.filter(node => node.id !== id);
  map.links = map.links.filter(link => link.from !== id && link.to !== id);
  for (const group of map.groups || []) group.nodes = group.nodes.filter(node => node !== id);
  if (map.groups) map.groups = map.groups.filter(group => group.nodes.length);
}
export function saveMindGroup(state, mapId, title, nodes) {
  const map = requireMindMap(state, mapId);
  const name = requiredText(title, '分组名称', 1);
  const ids = new Set(nodes);
  if (name.length > 80 || ids.size < 2 || [...ids].some(id => !map.nodes.some(node => node.id === id))) throw new Error('请选择至少两个节点并填写分组名称。');
  const remaining = (map.groups || []).map(group => ({ ...group, nodes: group.nodes.filter(id => !ids.has(id)) })).filter(group => group.nodes.length);
  map.groups = [...remaining, { id: uid('group'), title: name, nodes: [...ids] }];
}
export function removeMindGroup(state, mapId, id) {
  const map = requireMindMap(state, mapId);
  map.groups = (map.groups || []).filter(group => group.id !== id);
}
const validCapacity = value => value && validDate(value.date) && Number.isInteger(value.minutes) && value.minutes >= 0 && value.minutes <= 1440;
export function setDailyCapacity(state, minutes) {
  if (minutes === null) { delete state.settings.dailyCapacity; return; }
  const capacity = { date: currentDate(), minutes };
  if (!validCapacity(capacity)) throw new Error('今日可用时间须在 0 到 24 小时之间。');
  state.settings.dailyCapacity = capacity;
}
export function saveIdea(state, input, id = '') {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (!body || body.length > 10000 || title.length > 100) throw new Error('请填写想法内容，标题最多 100 字，正文最多 10000 字。');
  const updatedAt = new Date().toISOString();
  if (id) {
    const idea = state.ideas?.find(item => item.id === id);
    if (!idea) throw new Error('没有找到这张便签。');
    return Object.assign(idea, { title, body, updatedAt });
  }
  if (state.ideas?.length >= 10000) throw new Error('便签已达数量上限。');
  const idea = { id: uid('idea'), title, body, createdAt: updatedAt, updatedAt };
  (state.ideas ??= []).push(idea);
  return idea;
}
export function removeIdea(state, id) {
  const index = state.ideas?.findIndex(idea => idea.id === id) ?? -1;
  if (index < 0) throw new Error('没有找到这张便签。');
  state.ideas.splice(index, 1);
}
export const projectById = (state, id) => state.projects.find(p => p.id === id);
export const tasksFor = (state, id) => state.tasks.filter(t => t.projectId === id);
export const childrenFor = (state, id) => state.tasks.filter(t => t.parentId === id);
export const isLeafTask = (state, id) => !state.tasks.some(t => t.parentId === id);
export const executableTasks = (state, projectId) => {
  const parents = new Set(state.tasks.map(t => t.parentId).filter(Boolean));
  return state.tasks.filter(t => (!projectId || t.projectId === projectId) && !parents.has(t.id));
};
export const sortByPriority = tasks => [...tasks].sort((a, b) => PRIORITY[a.priority || 'normal'].rank - PRIORITY[b.priority || 'normal'].rank);
export function followUpTasks(state) {
  const active = new Set(state.projects.filter(project => project.status === 'active').map(project => project.id));
  const tasks = executableTasks(state).filter(task => active.has(task.projectId)
    && task.status !== 'done' && (task.status === 'waiting' || task.followUpOn));
  return sortByPriority(tasks).sort((a, b) => (a.followUpOn || '9999-99-99').localeCompare(b.followUpOn || '9999-99-99'));
}
export function searchWorkspace(state, query) {
  const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase();
  const terms = normalize(query).trim().split(/\s+/u).filter(Boolean);
  if (!terms.length) return [];
  const projectNames = new Map(state.projects.map(project => [project.id, project.name]));
  const groups = [
    ['project', '项目', state.projects.map(project => ({ id: project.id, title: project.name,
      context: project.category, text: [project.goal, project.criteria, project.description].filter(Boolean).join(' ') }))],
    ['task', '行动', state.tasks.map(task => ({ id: task.id, title: task.title, context: projectNames.get(task.projectId), text: task.note }))],
    ['entry', '进展记录', state.entries.map(entry => ({ id: entry.id, title: entry.title,
      context: projectNames.get(entry.projectId), text: [entry.outcome, entry.blocker, entry.next].filter(Boolean).join(' ') }))],
    ['idea', '便签', (state.ideas || []).map(idea => ({ id: idea.id, title: idea.title || idea.body.split(/\r?\n/, 1)[0].slice(0, 100), text: idea.body }))]
  ];
  return groups.map(([kind, label, rows]) => {
    const matches = [];
    for (const row of rows) {
      const title = normalize(row.title);
      const combined = `${title} ${normalize(row.text)}`;
      if (!terms.every(term => combined.includes(term))) continue;
      const score = title === terms.join(' ') ? 2 : terms.every(term => title.includes(term)) ? 1 : 0;
      matches.push({ ...row, score });
    }
    matches.sort((a, b) => b.score - a.score);
    return { kind, label, total: matches.length, rows: matches.slice(0, 12) };
  }).filter(group => group.total);
}
export function ancestorsFor(state, id) {
  const byId = new Map(state.tasks.map(t => [t.id, t]));
  const ancestors = [], seen = new Set([id]);
  let task = byId.get(id);
  while (task?.parentId) {
    task = byId.get(task.parentId);
    if (!task || seen.has(task.id)) throw new Error('子事项层级包含无效关联或循环。');
    seen.add(task.id); ancestors.unshift(task);
  }
  return ancestors;
}
export function taskProgress(state, id) {
  const byParent = new Map();
  for (const task of state.tasks) { const list = byParent.get(task.parentId) || []; list.push(task); byParent.set(task.parentId, list); }
  const stack = [state.tasks.find(t => t.id === id)], leaves = [], seen = new Set();
  while (stack.length) {
    const task = stack.pop(); if (!task || seen.has(task.id)) continue;
    seen.add(task.id); const children = byParent.get(task.id) || [];
    if (children.length) stack.push(...children); else leaves.push(task);
  }
  const done = leaves.filter(t => t.status === 'done').length;
  const status = done === leaves.length && leaves.length ? 'done' : leaves.some(t => t.status === 'doing') ? 'doing' : leaves.some(t => t.status === 'waiting') ? 'waiting' : 'todo';
  return { total: leaves.length, done, status, grouped: !!byParent.get(id)?.length };
}
export function visibleTaskRows(state, projectId) {
  const expanded = new Set(state.settings.expandedTaskIds);
  const tasks = tasksFor(state, projectId), byParent = new Map();
  for (const task of tasks) { const list = byParent.get(task.parentId) || []; list.push(task); byParent.set(task.parentId, list); }
  const stack = (byParent.get('') || []).toReversed().map(task => ({ task, depth: 0 })), rows = [];
  while (stack.length) {
    const row = stack.pop(), children = byParent.get(row.task.id) || [];
    rows.push({ ...row, children: children.length, expanded: expanded.has(row.task.id), progress: taskProgress(state, row.task.id) });
    if (expanded.has(row.task.id)) stack.push(...children.toReversed().map(task => ({ task, depth: row.depth + 1 })));
  }
  return rows;
}
export function expandTaskAncestors(state, taskId) {
  state.settings.expandedTaskIds = [...new Set([...state.settings.expandedTaskIds, ...ancestorsFor(state, taskId).map(t => t.id)])];
}
export const entriesFor = (state, id) => state.entries.filter(e => !id || e.projectId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export function metrics(state, projectId) {
  const tasks = executableTasks(state, projectId);
  const ms = state.milestones.filter(m => !projectId || m.projectId === projectId);
  const entries = state.entries.filter(e => !projectId || e.projectId === projectId);
  return { tasks: tasks.length, done: tasks.filter(t => t.status === 'done').length, waiting: tasks.filter(t => t.status === 'waiting').length, milestones: ms.length, accepted: ms.filter(m => m.done).length, entries: entries.length };
}
function requireProject(state, id) {
  const project = projectById(state, id);
  if (!project) throw new Error('没有找到这个项目。');
  return project;
}
function requiredText(value, label, minimum = 2) {
  if (typeof value !== 'string' || value.trim().length < minimum) throw new Error(`${label}至少填写${minimum === 1 ? '一个字' : '两个字'}。`);
  if (value.length > 10000) throw new Error(`${label}内容过长。`);
  return value.trim();
}
function optionalProjectText(value = '') {
  if (typeof value !== 'string' || value.length > 10000) throw new Error('项目目标或完成标准内容过长。');
  return value.trim();
}
function bump(state, projectId) { requireProject(state, projectId).revision++; }

export function addProject(state, input) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) throw new Error('请填写项目名称。');
  const goal = optionalProjectText(input.goal), criteria = optionalProjectText(input.criteria);
  if (name.length > 80) throw new Error('项目名称请控制在 80 字以内。');
  const deadline = projectDeadlineSettings(input);
  const firstTitle = input.firstAction?.trim() || '';
  if (firstTitle && firstTitle.length < 2) throw new Error('首个行动至少填写两个字。');
  const project = { id: uid('project'), name, goal, criteria, subtitle: input.category || '个人项目', category: input.category || '个人项目', color: ['green', 'orange', 'blue'].includes(input.color) ? input.color : 'green', description: input.description?.trim() || '', ...deadline, status: 'active', revision: 1, isDemo: false, completedOn: '', createdAt: new Date().toISOString() };
  state.projects.push(project);
  if (firstTitle) addTask(state, { projectId: project.id, title: firstTitle, today: !!input.today, due: input.targetDate || '', minutes: 25 });
  return project;
}
export function createProjectFromIdea(state, ideaId, input) {
  const idea = state.ideas?.find(item => item.id === ideaId);
  if (!idea) throw new Error('没有找到这张便签。');
  if (idea.projectId) throw new Error('这张便签已经转为项目，可从白板打开。');
  const project = addProject(state, { ...input, description: input.description ?? idea.body });
  idea.projectId = project.id;
  return project;
}
function transitionTaskStatus(state, task, status, date = currentDate()) {
  if (task.status === status) return;
  if (status === 'done') {
    task.completedOn = date; task.today = false;
    delete task.plannedOn;
    state.completionEvents.push({ id: uid('completion'), type: 'task', projectId: task.projectId, taskId: task.id, title: task.title, date, source: 'recorded' });
  } else task.completedOn = '';
  task.status = status;
}
export function setProjectStatus(state, id, status) {
  const project = requireProject(state, id);
  if (!['active', 'paused', 'completed'].includes(status)) throw new Error('项目状态无效。');
  if (project.status === status) return;
  project.status = status;
  if (status === 'completed') {
    project.completedOn = currentDate();
    state.completionEvents.push({ id: uid('completion'), type: 'project', projectId: id, taskId: '', title: project.name, date: project.completedOn, source: 'recorded' });
  } else project.completedOn = '';
  bump(state, id);
}
export function backfillCompletionDate(state, taskId, date) {
  const task = state.tasks.find(task => task.id === taskId);
  if (!task || task.status !== 'done' || !isLeafTask(state, taskId)) throw new Error('只为已完成的最末级行动补记日期。');
  if (task.completedOn) throw new Error('这项行动已有完成日期。');
  if (!validDate(date) || date > currentDate()) throw new Error('请选择今天或之前的有效完成日期。');
  task.completedOn = date;
  state.completionEvents.push({ id: uid('completion'), type: 'task', projectId: task.projectId, taskId, title: task.title, date, source: 'backfill' });
  bump(state, task.projectId);
}
export function deadlineItems(state, today = currentDate()) {
  const projects = state.projects.filter(project => project.status === 'active');
  const projectIds = new Set(projects.map(project => project.id));
  const tasks = executableTasks(state).filter(task => task.status !== 'done' && projectIds.has(task.projectId) && validDate(task.due));
  function item(type, id, projectId, title, date, preference = { days: 0, overdue: true }) {
    const daysUntil = daysBetween(today, date);
    return { id, type, projectId, title, date, daysUntil, overdue: daysUntil < 0, today: daysUntil === 0,
      reminder: daysUntil < 0 ? (preference.overdue ? 'overdue' : '') : daysUntil === 0 ? 'today' : daysUntil <= preference.days ? 'upcoming' : '' };
  }
  return [
    ...tasks.map(task => item('task', task.id, task.projectId, task.title, task.due)),
    ...projects.filter(project => validDate(project.targetDate)).map(project => item('project', project.id, project.id, project.name, project.targetDate, projectReminder(project)))
  ].sort((a, b) => a.date.localeCompare(b.date));
}
export const deadlineReminders = (state, today = currentDate()) => deadlineItems(state, today).filter(item => item.reminder);
export function calendarItems(state, projectId = '') {
  const projects = state.projects.filter(project => !projectId || project.id === projectId);
  const created = new Map();
  for (const project of projects) {
    if (!/^\d{4}-\d{2}-\d{2}T/.test(project.createdAt || '')) continue;
    const time = new Date(project.createdAt);
    if (Number.isFinite(time.getTime())) created.set(project.id, { id: project.id, projectId: project.id, type: 'project', title: project.name, date: currentDate(time), category: 'created', status: project.status });
  }
  const completionEvents = state.completionEvents.filter(event => !projectId || event.projectId === projectId);
  const datedProjects = new Set(completionEvents.filter(event => event.type === 'project').map(event => `${event.projectId}:${event.date}`));
  for (const project of projects) {
    const date = project.completedOn;
    if (project.status === 'completed' && validDate(date) && !datedProjects.has(`${project.id}:${date}`)) {
      completionEvents.push({ id: `project-completion:${project.id}:${date}`, type: 'project', projectId: project.id, title: project.name, date });
    }
  }
  const completed = completionEvents.map(event => {
    const creation = event.type === 'project' && created.get(event.projectId);
    const alsoCreated = creation?.date === event.date && creation.status === 'completed';
    if (alsoCreated) created.delete(event.projectId);
    return { ...event, eventId: event.id, id: event.type === 'task' ? event.taskId : event.projectId, category: 'completed', alsoCreated };
  });
  return [
    ...completed, ...created.values(),
    ...deadlineItems(state).filter(item => !projectId || item.projectId === projectId).map(item => ({ ...item, category: 'deadline' }))
  ];
}

export function addEntry(state, input) {
  const project = requireProject(state, input.projectId);
  const task = input.taskId ? state.tasks.find(t => t.id === input.taskId && t.projectId === project.id) : null;
  if (input.taskId && !task) throw new Error('关联行动不属于该项目，请重新选择。');
  if (task && input.taskStatus && !isLeafTask(state, task.id)) throw new Error('这是已拆分的父事项，请更新具体子行动；父事项进度由子项汇总。');
  const title = requiredText(input.title, '进展内容');
  if (task && input.taskStatus && !STATUS[input.taskStatus]) throw new Error('行动状态无效。');
  const entry = { id: uid('entry'), projectId: project.id, taskId: task?.id || '', date: currentDate(), createdAt: new Date().toISOString(), title, outcome: (input.outcome || '').trim(), blocker: (input.blocker || '').trim(), next: (input.next || '').trim(), kind: input.blocker?.trim() ? 'blocker' : 'progress', userCreated: true };
  if (task && input.taskStatus) transitionTaskStatus(state, task, input.taskStatus);
  state.entries.push(entry);
  bump(state, project.id);
  return entry;
}
export function updateEntry(state, id, input) {
  const entry = state.entries.find(item => item.id === id);
  if (!entry) throw new Error('没有找到这条进展记录。');
  const title = requiredText(input.title, '进展内容');
  const outcome = (input.outcome || '').trim(), blocker = (input.blocker || '').trim(), next = (input.next || '').trim();
  if (title.length > 200 || outcome.length > 3000 || blocker.length > 2000 || next.length > 2000) throw new Error('记录内容超出长度限制。');
  if (title === entry.title && outcome === entry.outcome && blocker === entry.blocker && next === entry.next) return entry;
  Object.assign(entry, { title, outcome, blocker, next, kind: blocker ? 'blocker' : 'progress' });
  bump(state, entry.projectId);
  return entry;
}
export function taskFromEntry(state, id) {
  const linked = state.tasks.find(task => task.source?.entryId === id);
  if (linked) return linked;
  const accepted = state.reviews.flatMap(review => review.suggestions).find(suggestion => suggestion.sourceEntryId === id && suggestion.taskId);
  return accepted && state.tasks.find(task => task.id === accepted.taskId);
}
export function convertEntryToTask(state, id) {
  const entry = state.entries.find(item => item.id === id);
  if (!entry) throw new Error('没有找到这条进展记录。');
  const existing = taskFromEntry(state, id);
  if (existing) return existing;
  if (requireProject(state, entry.projectId).status !== 'active') throw new Error('请先恢复这个项目。');
  const title = requiredText(entry.next, '记录里的下一步');
  if (title.length > 200) throw new Error('请先编辑记录，将下一步缩短到 200 字以内。');
  const task = addTask(state, { projectId: entry.projectId, title, minutes: 25 });
  task.source = { entryId: id };
  return task;
}
export function convertMindNodeToTask(state, mapId, nodeId, input) {
  const map = requireMindMap(state, mapId);
  const node = map.nodes.find(item => item.id === nodeId);
  if (!node) throw new Error('没有找到这个节点。');
  const existing = state.tasks.find(task => task.source?.mapId === mapId && task.source?.nodeId === nodeId);
  if (existing) return existing;
  if (node === map.nodes[0] || (node.kind || 'idea') !== 'idea') throw new Error('请选择一张想法卡。');
  if (requireProject(state, input.projectId).status !== 'active') throw new Error('请选择进行中的项目。');
  if (input.title?.trim().length > 200 || input.note?.trim().length > 4000) throw new Error('行动内容超出长度限制。');
  const task = addTask(state, { projectId: input.projectId, title: input.title, note: input.note, minutes: 25 });
  task.source = { mapId, nodeId, label: `${map.title} / ${node.title}` };
  return task;
}
export function addTask(state, input) {
  requireProject(state, input.projectId);
  const title = requiredText(input.title, '行动名称');
  const parent = input.parentId ? state.tasks.find(t => t.id === input.parentId && t.projectId === input.projectId) : null;
  if (input.parentId && !parent) throw new Error('上级事项不存在，或不属于该项目。');
  if (parent?.status === 'done' && isLeafTask(state, parent.id)) throw new Error('已完成的行动请先恢复为待办，再继续拆分。');
  const priority = input.priority || parent?.priority || 'normal';
  if (!PRIORITY[priority]) throw new Error('紧急程度无效。');
  if (input.milestoneId && !state.milestones.some(m => m.id === input.milestoneId && m.projectId === input.projectId)) throw new Error('里程碑不属于该项目。');
  if (input.due && !validDate(input.due)) throw new Error('行动截止日期无效。');
  const task = { id: uid('task'), projectId: input.projectId, milestoneId: input.milestoneId || parent?.milestoneId || '', parentId: parent?.id || '', completedOn: '', priority, title, note: input.note?.trim() || '', status: 'todo', minutes: Math.max(0, Math.min(1440, Number(input.minutes) || 0)), due: input.due || '', today: !!input.today };
  if (parent) { parent.today = false; delete parent.plannedOn; }
  state.tasks.push(task); bump(state, input.projectId); return task;
}
export function setTaskPriority(state, taskId, priority) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task || !PRIORITY[priority]) throw new Error('行动或紧急程度无效。');
  if (task.priority !== priority) { task.priority = priority; bump(state, task.projectId); }
}
export function updateTaskDeadline(state, taskId, date) {
  const task = state.tasks.find(task => task.id === taskId);
  if (!task || (date && !validDate(date))) throw new Error('行动或截止日期无效。');
  task.due = date; bump(state, task.projectId);
}
export function setTaskFollowUp(state, taskId, date) {
  const task = state.tasks.find(item => item.id === taskId);
  if (!task || task.status === 'done' || !isLeafTask(state, taskId)) throw new Error('请选择一项尚未完成的末级行动。');
  if (date === '') delete task.followUpOn;
  else if (validDate(date)) task.followUpOn = date;
  else throw new Error('请选择有效的跟进日期。');
}
export function setTaskStatus(state, taskId, status) {
  if (!STATUS[status]) throw new Error('行动状态无效。');
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) throw new Error('行动不存在。');
  if (!isLeafTask(state, taskId)) throw new Error('父事项进度由子项汇总，请更新最末级行动。');
  if (task.status === status) return;
  transitionTaskStatus(state, task, status);
  bump(state, task.projectId);
}
export function isInToday(task, today) {
  return !!task && (task.plannedOn ? task.plannedOn <= (today ?? currentDate()) : task.today);
}
export function setToday(state, taskId, selected) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task || task.status === 'done') throw new Error('只能选择尚未完成的行动。');
  if (!isLeafTask(state, taskId)) throw new Error('该事项已拆分，请选择具体子行动加入 Cockpit。');
  if (requireProject(state, task.projectId).status !== 'active') throw new Error('请先恢复这个项目。');
  task.today = !!selected;
  delete task.plannedOn;
}
export function closeOutTodayTask(state, taskId, choice, today = currentDate()) {
  const task = state.tasks.find(item => item.id === taskId);
  if (!task || !isInToday(task, today)) throw new Error('这项行动已不在今日安排中。');
  if (!['tomorrow', 'todo', 'waiting'].includes(choice)) throw new Error('请选择有效的收工安排。');
  const tomorrow = choice === 'tomorrow' ? shiftDate(today, 1) : '';
  setToday(state, taskId, false);
  if (tomorrow) task.plannedOn = tomorrow;
  else setTaskStatus(state, taskId, choice);
  return task;
}
export function acceptMilestone(state, id, done) {
  const milestone = state.milestones.find(m => m.id === id);
  if (!milestone) throw new Error('里程碑不存在。');
  milestone.done = !!done; bump(state, milestone.projectId);
}
export function updateProject(state, input) {
  const project = requireProject(state, input.id);
  if (input.targetDate && !validDate(input.targetDate)) throw new Error('项目截止日期无效。');
  const goal = optionalProjectText(input.goal ?? project.goal), criteria = optionalProjectText(input.criteria ?? project.criteria);
  Object.assign(project, { goal, criteria });
  if (input.targetDate !== undefined) project.targetDate = input.targetDate || '';
  bump(state, input.id);
}
export function updateProjectDeadline(state, id, input) {
  const project = requireProject(state, id), deadline = projectDeadlineSettings(input);
  const dateChanged = project.targetDate !== deadline.targetDate;
  Object.assign(project, deadline);
  if (dateChanged) bump(state, id);
}
export function reviewIsStale(state, review) { return requireProject(state, review.projectId).revision !== review.baseRevision; }
export function reviewPeriodEvidence(state, projectId, { date, period = 'week', today = currentDate() } = {}) {
  const project = requireProject(state, projectId);
  const range = (period === 'month' ? monthRange : weekRange)(date || today);
  const inRange = date => date >= range.start && date <= range.end && date <= today;
  const entries = entriesFor(state, projectId).filter(e => inRange(e.date)).sort((a, b) => b.date.localeCompare(a.date));
  const completedByTask = new Map();
  for (const event of state.completionEvents) {
    if (event.projectId !== projectId || event.type !== 'task' || !inRange(event.date)) continue;
    const previous = completedByTask.get(event.taskId);
    if (!previous || previous.date < event.date) completedByTask.set(event.taskId, event);
  }
  const completed = [...completedByTask.values()].sort((a, b) => b.date.localeCompare(a.date));
  const tasks = executableTasks(state, projectId);
  const waiting = tasks.filter(t => t.status === 'waiting');
  const blockers = entries.filter(entry => entry.blocker);
  const focus = project.status === 'active' && tasks.filter(t => ['todo', 'doing'].includes(t.status)).sort((a, b) => {
    const dueRank = task => task.due && task.due <= today ? 0 : 1;
    return dueRank(a) - dueRank(b)
      || PRIORITY[a.priority || 'normal'].rank - PRIORITY[b.priority || 'normal'].rank
      || (a.due || '9999').localeCompare(b.due || '9999');
  })[0];
  return { range, entries, completed, waiting, blockers, focus: focus || null };
}
export function weeklyReviewEvidence(state, projectId, { weekStart, today } = {}) {
  return reviewPeriodEvidence(state, projectId, { date: weekStart, today });
}
export function generateReview(state, projectId, options = {}) {
  const project = requireProject(state, projectId);
  const { range, entries, completed, waiting, blockers, focus } = weeklyReviewEvidence(state, projectId, options);
  const stats = metrics(state, projectId);
  const tasks = tasksFor(state, projectId), taskById = new Map(tasks.map(task => [task.id, task]));
  const byTitle = new Set(tasks.map(task => task.title.trim()));
  const handledEntries = new Set(state.reviews.filter(r => r.projectId === projectId)
    .flatMap(r => r.suggestions.filter(s => s.status !== 'pending').map(s => s.sourceEntryId)));
  const next = project.status === 'active' && entries.find(entry => {
    const title = entry.next?.trim(), linked = taskById.get(entry.taskId);
    return entry.userCreated && title?.length >= 2 && title.length <= 200 && !byTitle.has(title) && !handledEntries.has(entry.id) && !taskFromEntry(state, entry.id)
      && (!linked || linked.status === 'done');
  });
  const blocker = blockers[0];
  const sources = [...new Set([blocker?.id, next?.id, ...entries.map(e => e.id)].filter(Boolean))].slice(0, 4);
  const strategy = focus ? `先推进已有行动「${focus.title}」。` : waiting.length ? `先核对「${waiting[0].title}」在等什么。` : '可以等有新的进展或行动时再复盘。';
  const review = {
    id: uid('review'), projectId, createdAt: new Date().toISOString(), date: currentDate(), weekStart: range.start, weekEnd: range.end, kind: 'weekly', baseRevision: project.revision, provider: 'rule-demo', promptVersion: 'local-weekly-2', status: 'pending',
    facts: { ...stats, periodEntries: entries.length, periodCompleted: completed.length }, sourceIds: sources,
    summary: `所选周记录了 ${entries.length} 条进展，${completed.length} 项行动有完成记录，${blockers.length} 条记录写了阻碍。`,
    hypothesis: blocker ? `记录「${blocker.title}」提到：${blocker.blocker}` : '所选周的进展记录未填写阻碍。',
    strategy,
    suggestions: next ? [{ id: uid('suggestion'), title: next.next.trim(), note: '', sourceEntryId: next.id, minutes: 0, milestoneId: '', due: '', selected: true, status: 'pending' }] : []
  };
  state.reviews.push(review); return review;
}
export function applySuggestions(state, reviewId, edits, reason) {
  const review = state.reviews.find(r => r.id === reviewId);
  if (!review) throw new Error('没有找到这次复盘。');
  if (reviewIsStale(state, review)) throw new Error('项目在这次复盘后已发生变化，请重新生成复盘再调整。');
  if (requireProject(state, review.projectId).status === 'completed') throw new Error('项目已完成；如需新增行动，请先恢复项目，再生成总结。');
  const pending = edits.filter(edit => review.suggestions.some(s => s.id === edit.id && s.status === 'pending'));
  if (!pending.length) throw new Error('这些建议已经处理过，或尚未选择建议。');
  const unique = [...new Map(pending.map(e => [e.id, e])).values()];
  unique.forEach(e => requiredText(e.title, '行动名称'));
  const project = requireProject(state, review.projectId);
  const from = project.revision;
  const changes = [];
  for (const edit of unique) {
    const suggestion = review.suggestions.find(s => s.id === edit.id);
    const task = { id: uid('task'), projectId: project.id, milestoneId: suggestion.milestoneId, parentId: '', completedOn: '', priority: 'normal', title: edit.title.trim(), note: edit.note?.trim() || suggestion.note, due: edit.due || '', minutes: suggestion.minutes, status: 'todo', today: !!edit.today, sourceSuggestionId: suggestion.id };
    state.tasks.push(task); suggestion.status = 'applied'; suggestion.taskId = task.id;
    changes.push({ type: 'add-task', taskId: task.id, title: task.title, due: task.due, today: task.today });
  }
  project.revision++;
  const revision = { id: uid('revision'), projectId: project.id, reviewId, from, to: project.revision, createdAt: new Date().toISOString(), date: currentDate(), reason: reason?.trim() || review.strategy, changes };
  state.revisions.push(revision);
  review.baseRevision = project.revision;
  review.status = review.suggestions.every(s => s.status !== 'pending') ? 'applied' : 'partial';
  return revision;
}

function validateMindMaps(maps) {
  if (!Array.isArray(maps) || maps.length > 100) throw new Error('导图数据无效。');
  const ids = new Set();
  const validText = (value, limit) => typeof value === 'string' && value.length <= limit;
  for (const map of maps) {
    if (!map || typeof map.id !== 'string' || !map.id || ids.has(map.id) || !validText(map.title, 100) || !map.title.trim() || !Array.isArray(map.nodes) || !map.nodes.length || map.nodes.length > 300 || !Array.isArray(map.links) || map.links.length > 1000) throw new Error('导图数据无效。');
    ids.add(map.id);
    const nodes = new Set();
    for (const node of map.nodes) {
      if (!node || typeof node.id !== 'string' || !node.id || nodes.has(node.id) || !validText(node.title, 120) || !node.title.trim() || !validText(node.note, 4000) || !Object.hasOwn(BOARD_COLORS, node.color) || !Number.isInteger(node.x) || !Number.isInteger(node.y)) throw new Error('导图节点无效。');
      const size = mindSize(node), resized = clampMindSize(size.width, size.height, node);
      if ((node.kind !== undefined && !['idea', 'literature', 'topic'].includes(node.kind)) || (node.reference !== undefined && !validText(node.reference, 2000))) throw new Error('导图节点来源无效。');
      if (size.width !== resized.width || size.height !== resized.height) throw new Error('导图节点尺寸无效。');
      const bounds = clampMindPosition(node.x, node.y, node);
      if (node.x !== bounds.x || node.y !== bounds.y) throw new Error('导图节点位置无效。');
      nodes.add(node.id);
    }
    const links = new Set();
    for (const link of map.links) {
      if (!link || link.from === link.to || !nodes.has(link.from) || !nodes.has(link.to) || (link.label !== undefined && !validText(link.label, 120)) || (link.branch !== undefined && typeof link.branch !== 'boolean')) throw new Error('导图连线无效。');
      const key = JSON.stringify([link.from, link.to]);
      if (links.has(key)) throw new Error('导图连线重复。');
      links.add(key);
    }
    if (map.groups !== undefined) {
      if (!Array.isArray(map.groups) || map.groups.length > 150) throw new Error('导图分组无效。');
      const groupIds = new Set(), members = new Set();
      for (const group of map.groups) {
        if (!group || typeof group.id !== 'string' || groupIds.has(group.id) || !validText(group.title, 80) || !group.title.trim() || !Array.isArray(group.nodes) || !group.nodes.length) throw new Error('导图分组无效。');
        groupIds.add(group.id);
        for (const id of group.nodes) {
          if (!nodes.has(id) || members.has(id)) throw new Error('导图分组的节点无效。');
          members.add(id);
        }
      }
    }
  }
}

export function validateWorkspace(data) {
  if (!data || ![1, 2, 3].includes(data.schemaVersion) || !['personal', 'demo'].includes(data.workspaceKind) || !/^\d{4}-\d{2}-\d{2}$/.test(data.scenarioDate)) throw new Error('不是支持的 Cockpit 工作空间备份。');
  data = clone(data);
  const arrays = ['projects', 'milestones', 'tasks', 'entries', 'reviews', 'revisions', 'feedback'];
  if (data.ideas !== undefined) arrays.push('ideas');
  for (const key of arrays) if (!Array.isArray(data[key]) || data[key].length > 10000) throw new Error(`备份中的 ${key} 数据无效。`);
  if (data.schemaVersion === 1) {
    data.tasks.forEach(task => { task.parentId ??= ''; task.priority ??= 'normal'; });
    if (data.settings) data.settings.expandedTaskIds ??= [];
    data.schemaVersion = 2;
  }
  if (data.schemaVersion === 2) {
    data.tasks.forEach(task => { task.completedOn ??= ''; });
    data.completionEvents ??= [];
    data.schemaVersion = 3;
  }
  if (!Array.isArray(data.completionEvents) || data.completionEvents.length > 50000) throw new Error('完成记录无效。');
  if (!data.settings || typeof data.settings.guide !== 'boolean' || typeof data.settings.welcomed !== 'boolean') throw new Error('工作空间设置无效。');
  if (!Array.isArray(data.settings.expandedTaskIds) || data.settings.expandedTaskIds.some(id => typeof id !== 'string')) throw new Error('折叠状态无效。');
  if (['showRhythm', 'showCapacity', 'showFollowUp', 'showCloseout'].some(key => data.settings[key] !== undefined && typeof data.settings[key] !== 'boolean')) throw new Error('工作台显示偏好无效。');
  if (data.settings.dailyCapacity !== undefined && !validCapacity(data.settings.dailyCapacity)) throw new Error('今日可用时间无效。');
  const { widgetLayout: layout, widgetColors: colors } = data.settings;
  const { widgetOrder: order, widgetSizes: sizes } = data.settings;
  const board = data.settings.widgetBoard;
  if (board !== undefined) {
    if (!board || Object.keys(board).length !== widgetIds.length || !widgetIds.every(id => validWidgetBox(board[id]))) throw new Error('小组件坐标无效。');
    const boxes = Object.values(board);
    if (boxes.some((box, index) => boxes.slice(index + 1).some(other => widgetOverlap(box, other)))) throw new Error('小组件坐标有重叠。');
  }
  if (order !== undefined && (!Array.isArray(order) || order.length !== widgetIds.length || !widgetIds.every(id => order.includes(id)))) throw new Error('工作台网格排列无效。');
  if (sizes !== undefined && (!sizes || typeof sizes !== 'object' || Array.isArray(sizes) || Object.entries(sizes).some(([id, size]) => !widgetIds.includes(id) || ![1, 2, 4].includes(size)))) throw new Error('小组件宽度无效。');
  if (layout !== undefined) {
    if (!layout || Object.keys(layout).length !== 2 || !Array.isArray(layout.left) || !Array.isArray(layout.right)) throw new Error('工作台排列无效。');
    const widgets = [...layout.left, ...layout.right];
    if (widgets.length !== widgetIds.length || !widgetIds.every(id => widgets.includes(id))) throw new Error('工作台排列无效。');
  }
  if (colors !== undefined && (!colors || typeof colors !== 'object' || Array.isArray(colors) || Object.entries(colors).some(([id, color]) => !widgetIds.includes(id) || !Object.hasOwn(BOARD_COLORS, color)))) throw new Error('工作台配色无效。');
  if (data.mindMaps !== undefined) validateMindMaps(data.mindMaps);
  for (const key of arrays) {
    const ids = new Set();
    for (const item of data[key]) {
      if (!item || typeof item.id !== 'string' || ids.has(item.id)) throw new Error(`${key} 存在无效或重复 ID。`);
      ids.add(item.id);
    }
  }
  const hasProject = id => data.projects.some(p => p.id === id);
  const text = value => typeof value === 'string' && value.length <= 10000;
  for (const idea of data.ideas || []) {
    if (!text(idea.title) || idea.title.length > 100 || !text(idea.body) || !idea.body.trim()
        || ![idea.createdAt, idea.updatedAt].every(date => typeof date === 'string' && Number.isFinite(Date.parse(date)))) throw new Error('随手记便签无效。');
    if (idea.projectId !== undefined && !hasProject(idea.projectId)) throw new Error('随手记关联的项目不存在。');
  }
  for (const p of data.projects) if (![p.name, p.goal, p.criteria, p.subtitle, p.category, p.description, p.targetDate].every(text) || !['active', 'paused', 'completed'].includes(p.status) || !['green', 'orange', 'blue'].includes(p.color) || !Number.isSafeInteger(p.revision) || p.revision < 1) throw new Error('项目字段无效。');
  for (const p of data.projects) if (p.completedOn !== undefined && p.completedOn !== '' && !validDate(p.completedOn)) throw new Error('项目完成日期无效。');
  for (const p of data.projects) if ((p.reminderDays !== undefined && !validReminderDays(p.reminderDays)) || (p.remindOverdue !== undefined && typeof p.remindOverdue !== 'boolean')) throw new Error('项目提醒设置无效。');
  for (const m of data.milestones) if (!hasProject(m.projectId) || ![m.title, m.criteria, m.date].every(text) || typeof m.done !== 'boolean') throw new Error('里程碑数据无效。');
  const taskById = new Map(data.tasks.map(task => [task.id, task]));
  for (const t of data.tasks) if (!hasProject(t.projectId) || typeof t.status !== 'string' || !Object.hasOwn(STATUS, t.status) || typeof t.priority !== 'string' || !Object.hasOwn(PRIORITY, t.priority) || typeof t.parentId !== 'string' || ![t.title, t.note, t.due].every(text) || !Number.isFinite(t.minutes) || typeof t.today !== 'boolean' || (t.milestoneId && !data.milestones.some(m => m.id === t.milestoneId && m.projectId === t.projectId)) || (t.parentId && taskById.get(t.parentId)?.projectId !== t.projectId)) throw new Error('行动或其关联无效。');
  for (const task of data.tasks.filter(item => item.source !== undefined)) {
    const source = task.source;
    if (source?.entryId ? !data.entries.some(entry => entry.id === source.entryId && entry.projectId === task.projectId)
      : !source || ![source.mapId, source.nodeId, source.label].every(value => text(value) && value.length)) throw new Error('行动来源无效。');
  }
  if (data.tasks.some(task => task.followUpOn !== undefined && !validDate(task.followUpOn))) throw new Error('行动跟进日期无效。');
  if (data.tasks.some(task => task.plannedOn !== undefined && !validDate(task.plannedOn))) throw new Error('行动安排日期无效。');
  const checked = new Set();
  for (const task of data.tasks) {
    const path = new Set(); let current = task;
    while (current && !checked.has(current.id)) {
      if (path.has(current.id)) throw new Error('子事项层级包含循环，无法导入。');
      path.add(current.id); current = taskById.get(current.parentId);
    }
    for (const id of path) checked.add(id);
  }
  for (const e of data.entries) if (!hasProject(e.projectId) || ![e.title, e.outcome, e.blocker, e.next, e.date, e.createdAt].every(text) || !['progress', 'blocker'].includes(e.kind) || (e.taskId && !data.tasks.some(t => t.id === e.taskId && t.projectId === e.projectId))) throw new Error('记录或其关联无效。');
  for (const r of data.reviews) {
    if (!hasProject(r.projectId) || ![r.summary, r.hypothesis, r.strategy, r.createdAt, r.date].every(text) || !Number.isSafeInteger(r.baseRevision) || !Array.isArray(r.suggestions) || !Array.isArray(r.sourceIds) || !r.facts || !['tasks', 'done', 'waiting', 'milestones', 'accepted', 'entries', 'periodEntries'].every(k => Number.isFinite(r.facts[k])) || r.sourceIds.some(id => !data.entries.some(e => e.id === id && e.projectId === r.projectId))) throw new Error('复盘数据无效。');
    if (new Set(r.suggestions.map(s => s.id)).size !== r.suggestions.length) throw new Error('复盘建议 ID 重复。');
    for (const s of r.suggestions) if (!s || ![s.id, s.title, s.note, s.due].every(text) || !['pending', 'applied', 'dismissed'].includes(s.status) || !Number.isFinite(s.minutes) || typeof s.selected !== 'boolean' || (s.sourceEntryId !== undefined && !r.sourceIds.includes(s.sourceEntryId)) || (s.milestoneId && !data.milestones.some(m => m.id === s.milestoneId && m.projectId === r.projectId)) || (s.taskId && !data.tasks.some(t => t.id === s.taskId && t.projectId === r.projectId))) throw new Error('复盘建议无效。');
  }
  for (const r of data.revisions) if (!hasProject(r.projectId) || ![r.reason, r.createdAt, r.date].every(text) || !Number.isSafeInteger(r.from) || !Number.isSafeInteger(r.to) || !Array.isArray(r.changes) || r.changes.some(c => ![c.title, c.due].every(text) || !data.tasks.some(t => t.id === c.taskId && t.projectId === r.projectId))) throw new Error('计划历史无效。');
  for (const f of data.feedback) if (![f.text, f.category, f.page, f.createdAt].every(text)) throw new Error('体验反馈无效。');
  const eventIds = new Set();
  for (const event of data.completionEvents) {
    if (!event || typeof event.id !== 'string' || eventIds.has(event.id) || !['task', 'project'].includes(event.type) || !hasProject(event.projectId) || !validDate(event.date) || !text(event.title) || (event.type === 'task' && taskById.get(event.taskId)?.projectId !== event.projectId)) throw new Error('完成记录或关联无效。');
    eventIds.add(event.id);
  }
  for (const task of data.tasks) if (typeof task.completedOn !== 'string' || (task.completedOn && !validDate(task.completedOn))) throw new Error('行动完成日期无效。');
  return clone(data);
}

export function createRepository(storage) {
  let state, writable = true, loadError = '', lastSavedRaw = null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    lastSavedRaw = raw;
    const parsed = raw ? JSON.parse(raw) : null;
    state = parsed ? validateWorkspace(parsed) : createEmptyWorkspace();
    if (parsed && parsed.schemaVersion < 3) {
      try { if (!storage.getItem(MIGRATION_BACKUP_KEY)) storage.setItem(MIGRATION_BACKUP_KEY, raw); }
      catch { writable = false; loadError = '已有数据已读取，但无法保存升级副本；暂不覆盖原数据，请先导出本次体验。'; }
    }
  } catch { state = createEmptyWorkspace(); writable = false; loadError = '无法读取原有浏览器数据，当前使用临时空白工作空间。请先导出本次记录或检查浏览器存储。'; }
  return {
    get state() { return state; },
    get writable() { return writable; },
    get loadError() { return loadError; },
    commit(fn) {
      const next = clone(state);
      const result = fn(next);
      if (writable) {
        if (storage.getItem(STORAGE_KEY) !== lastSavedRaw) throw new Error('另一个窗口已更新体验数据。请先导出当前数据，再刷新后继续。');
        try { const raw = JSON.stringify(next); storage.setItem(STORAGE_KEY, raw); lastSavedRaw = raw; }
        catch { writable = false; loadError = '浏览器存储不可用，本次修改仅保留在当前会话。请使用导出保存体验数据。'; }
      }
      state = next; return result;
    },
    replace(next) {
      const validated = validateWorkspace(next);
      const raw = JSON.stringify(validated);
      storage.setItem(STORAGE_KEY, raw); lastSavedRaw = raw;
      state = validated; writable = true; loadError = '';
    },
    reset() { this.replace(createEmptyWorkspace()); }
  };
}
