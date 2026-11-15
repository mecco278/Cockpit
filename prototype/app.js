import { STATUS, PROJECT_STATUS, PRIORITY } from './workspace.js';
import {
  createRepository, uid, projectById, tasksFor, entriesFor, metrics, addEntry, updateEntry, addTask, setTaskStatus, setToday,
  taskFromEntry, convertEntryToTask, convertMindNodeToTask,
  acceptMilestone, updateProject, generateReview, reviewIsStale, applySuggestions, validateWorkspace, childrenFor,
  isLeafTask, executableTasks, sortByPriority, ancestorsFor, taskProgress, visibleTaskRows, expandTaskAncestors,
  setTaskPriority, addProject, setProjectStatus, backfillCompletionDate, deadlineReminders, updateTaskDeadline,
  projectReminder, updateProjectDeadline, MAX_PROJECT_REMINDER_DAYS, reviewPeriodEvidence, setDailyCapacity, saveIdea, removeIdea,
  createProjectFromIdea, calendarItems, followUpTasks, setTaskFollowUp, searchWorkspace, isInToday, closeOutTodayTask,
  BOARD_COLORS, widgetBoard, placeWidget, WIDGET_BOARD, setWidgetColor, MIND_CANVAS, createMindMap, saveMindNode, linkMindNodes,
  clampMindPosition, clampMindSize, mindSize, resizeMindNode, moveMindNode, removeMindNode, unlinkMindNodes, labelMindLink, saveMindGroup, removeMindGroup
} from './model.js';
import { currentDate, shiftDate, weekRange, shiftMonth, validDate } from './dates.js';
import { calendarPage, deadlinesBody, deadlinePanel, focusProjectCard, projectDetailPage, graphView } from './views-v3.js';

const storage = { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) };
const app = document.querySelector('#app');
const modalRoot = document.querySelector('#modal-root');
const desktop = globalThis.cockpitDesktop;
if (location.protocol === 'cockpit:' && !desktop) {
  app.textContent = '无法连接 Windows 数据服务。请关闭并重新打开 Cockpit。';
  throw new Error('Cockpit desktop bridge unavailable');
}
const repo = desktop ? await (await import('./desktop-repository.js')).createDesktopRepository(desktop) : createRepository(storage);
const pageNames = { today: '今日工作台', project: '项目详情', tree: '行动树', mind: '思维导图', progress: '进度记录', review: '进展回顾', calendar: '日历', ideas: '随手记' };
const ui = { page: 'today', projectId: '', tab: 'board', filterProject: 'all', filterKind: 'all', search: '', reviewId: '', modal: null, returnFocus: null, treeMode: 'map', treeZoom: 1, graphCenterRequested: false, weekStart: weekRange().start, reviewDate: currentDate(), reviewPeriod: 'week', calendarMonth: currentDate().slice(0, 7), calendarDate: currentDate(), calendarProject: 'all', calendarType: 'all', closeoutExpanded: false };
const closeoutChoices = [['tomorrow', '明天再做'], ['todo', '退回待办'], ['waiting', '转为等待']];
Object.assign(ui, { widgetEditing: false, widgetLayoutView: false, sidebarExpanded: false, projectOverviewOpen: '', treeCompare: '', treeScales: new Map(), treeBranches: new Map(), mindId: '', mindSelected: '', mindMulti: new Set(), mindLinkFrom: '', mindZoom: 1, mindFocus: '' });
ui.compactTrees = new Set();
const icons = {
  tree: '<path d="M5 4v13m0-10h8m-8 9h8"/><rect x="13" y="4" width="7" height="6" rx="1.5"/><rect x="13" y="13" width="7" height="6" rx="1.5"/>',
  mind: '<path d="m8 11 8-5m-8 7 8 5m2-10v8"/><circle cx="5" cy="12" r="3"/><circle cx="18" cy="5" r="3"/><circle cx="18" cy="19" r="3"/>',
  today: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M7 2v4m10-4v4M3 10h18m-13 5h3m3 0h2"/>',
  projects: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 15h7m-7 5h7"/>',
  progress: '<path d="M8 4h11a2 2 0 0 1 2 2v14H8a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Zm0 0v16m4-11h5m-5 4h5"/>',
  review: '<path d="M4 19V9m6 10V4m6 15v-6m5-9-3 3-2-2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>', chevron: '<path d="m9 5 7 7-7 7"/>',
  check: '<path d="m5 12 4 4L19 6"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  link: '<path d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 3 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
  settings: '<path d="m9 3-.5 3-3 1-2-1-2 4 2.5 2-.5 3-2 1 2 4 3-1 2 1 1 3h5l1-3 2-1 3 1 2-4-2-2v-3l2-2-2-4-3 1-2-1-.5-3Z" transform="translate(1 -1) scale(.9)"/><circle cx="12" cy="12" r="3"/>',
  feedback: '<path d="M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5Z"/><path d="M8 10h8m-8 4h5"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>', spark: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/>',
  flag: '<path d="M5 21V3m0 1c5-4 9 4 15 0v10c-6 4-10-4-15 0"/>',
  'project-start': '<path d="M5 4h14l-3.5 4 3.5 4H5Z" fill="currentColor"/><path d="M5 3v18m-2 0h6" stroke-width="2"/>',
  'project-finish': '<path d="M6 4h13l-3.5 4L19 12H6Z" fill="currentColor"/><path d="M6 3v18m-3 0h7" stroke-width="2"/>',
  note: '<path d="M5 3h14a2 2 0 0 1 2 2v9l-7 7H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 21v-5a2 2 0 0 1 2-2h5M7 8h10m-10 4h6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>', dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  undo: '<path d="M4 9h10a6 6 0 0 1 0 12m-6-8L4 9l4-4"/>', folder: '<path d="M3 7V4h6l2 3h10v13H3Z"/>', edit: '<path d="m15 4 5 5M4 20l4-1L21 6l-5-5L3 14l-1 7Z"/>',
  play: '<path d="m9 5 11 7-11 7Z"/>', pause: '<path d="M8 5v14m8-14v14"/>', upload: '<path d="M12 16V3m-4 4 4-4 4 4M4 16v5h16v-5"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.projects}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shortDate = date => date ? `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日` : '未设日期';
const btn = (label, action, extra = '', cls = 'btn') => `<button type="button" class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
const projectOptions = selected => repo.state.projects.map(p => `<option value="${esc(p.id)}" ${p.id === selected ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
const taskOptions = (projectId, selected) => '<option value="">不关联具体行动</option>' + tasksFor(repo.state, projectId).map(t => `<option value="${esc(t.id)}" ${t.id === selected ? 'selected' : ''}>${esc(t.title)}</option>`).join('');
const pill = (label, cls = '') => `<span class="pill ${cls}">${esc(label)}</span>`;
const projectTag = project => `<span class="project-tag"><i class="dot ${esc(project.color)}"></i>${esc(project.name)}</span>`;
function helpers() { return { esc, shortDate, icon, btn, pill, projectTag, projectOptions, pageHeading, taskCard, taskList }; }
function setReviewDate(date) {
  ui.reviewDate = date;
  ui.weekStart = weekRange(date).start;
  ui.reviewId = '';
}
function reviewControls(week, month) {
  const periodLabel = ui.reviewPeriod === 'week' ? '周' : '月';
  const rangeCard = (period, title, data) => `<button type="button" class="review-range-card" data-action="review-period" data-period="${period}" aria-pressed="${ui.reviewPeriod === period}"><strong>${title}</strong><span>${shortDate(data.range.start)} — ${shortDate(data.range.end)}</span><span>${data.completed.length} 项完成 · ${data.entries.length} 条进展 · ${data.blockers.length} 条阻碍</span></button>`;
  return `<div class="week-controls review-week-controls"><label>参考日期<input type="date" value="${ui.reviewDate}" data-control="review-date" /></label>
    ${btn(`上一${periodLabel}`, 'review-shift', 'data-direction="-1"', 'btn btn-small')}${btn('回到当前', 'review-current', '', 'btn btn-small')}${btn(`下一${periodLabel}`, 'review-shift', 'data-direction="1"', 'btn btn-small')}</div>
    <div class="review-range-cards">${rangeCard('week', '周进展', week)}${rangeCard('month', '月进展', month)}</div>`;
}
function priorityOptions(selected = 'normal') {
  return Object.entries(PRIORITY).map(([value, p]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${p.color} · ${p.label}</option>`).join('');
}
function priorityControl(task) {
  return `<label class="priority-control"><span class="sr-only">调整紧急程度：${esc(task.title)}</span><select data-control="task-priority" data-id="${esc(task.id)}" class="priority-select priority-${esc(task.priority)}">${priorityOptions(task.priority)}</select></label>`;
}
function parentBreadcrumb(task) {
  const parent = repo.state.tasks.find(t => t.id === task.parentId);
  return parent ? `<button type="button" class="parent-breadcrumb" data-action="open-tree" data-id="${esc(task.id)}" title="查看上级事项：${esc(parent.title)}">${icon('folder')}<span>${esc(parent.title)}</span></button>` : '';
}
function todayTaskCard(task) {
  return `<article class="today-task" data-priority="${esc(task.priority)}" data-daily-task="${esc(task.id)}"><button type="button" class="task-check" data-action="complete-task" data-id="${esc(task.id)}" title="完成这项行动并留下记录" aria-label="完成并记录：${esc(task.title)}">${icon('check')}</button><div class="today-task-body"><div class="task-title-line"><button type="button" class="title-button" data-action="task-detail" data-id="${esc(task.id)}">${esc(task.title)}</button>${task.status === 'doing' ? pill('进行中', 'green') : task.status === 'waiting' ? pill('等待中', 'orange') : ''}</div>${parentBreadcrumb(task)}<div class="task-meta">${projectTag(projectById(repo.state, task.projectId))}<span>${icon('clock')}${task.minutes || '—'} 分钟</span><span>${shortDate(task.due)}</span></div></div><div class="task-row-actions">${priorityControl(task)}<div class="today-secondary-actions">${btn('记进展', 'new-entry', `data-task="${esc(task.id)}" title="记录进展，默认保留行动状态"`, 'text-btn')}${btn(icon('dots'), 'today-task-more', `data-id="${esc(task.id)}" aria-label="更多操作：${esc(task.title)}" aria-haspopup="dialog"`, 'icon-btn')}</div></div></article>`;
}
function taskList() {
  const rows = visibleTaskRows(repo.state, ui.projectId);
  const hasDeepTasks = tasksFor(repo.state, ui.projectId).some(task => ancestorsFor(repo.state, task.id).length >= 3);
  return `<section class="panel task-tree"><div class="tree-intro"><div><h2>从大事项，走到下一步</h2><p>父事项汇总最末级行动的进度。分支可折叠，长任务树可以一次只看一条路径。</p></div><div class="button-row">${btn('展开全部', 'expand-tree', '', 'btn btn-small')}${btn('全部收起', 'collapse-tree', '', 'btn btn-small')}</div></div>${hasDeepTasks ? '<div class="notice warning tree-warning">部分事项已拆到第 4 层或更深。如果已经能直接执行，可以先行动和记录，暂时停止继续拆分。</div>' : ''}<div class="tree-rows">${rows.map(({ task, depth, children, expanded, progress }) => `<article class="tree-row" data-tree-id="${esc(task.id)}" data-priority="${esc(task.priority)}" style="--tree-depth:${Math.min(depth, 3)}"><div class="tree-main"><div class="tree-title">${children ? btn(icon('chevron'), 'toggle-branch', `data-id="${esc(task.id)}" aria-label="${expanded ? '收起' : '展开'}子事项：${esc(task.title)}" aria-expanded="${expanded}"`, `branch-toggle ${expanded ? 'expanded' : ''}`) : `<span class="tree-leaf-marker ${task.status === 'done' ? 'done' : ''}">${icon(task.status === 'done' ? 'check' : 'flag')}</span>`}<button type="button" class="title-button" data-action="task-detail" data-id="${esc(task.id)}">${esc(task.title)}</button>${depth >= 3 ? pill(`第 ${depth + 1} 层`, 'orange') : ''}</div><div class="tree-meta">${children ? `<span class="group-progress">${progress.done} / ${progress.total} 最末级行动完成</span><span>${children} 个直接子事项</span>` : `<span>${STATUS[task.status]}</span><span>${task.minutes} 分钟</span><span>${shortDate(task.due)}</span>`}</div></div><div class="tree-actions">${priorityControl(task)}${task.status !== 'done' || children ? btn(`${icon('plus')}拆分`, 'split-task', `data-id="${esc(task.id)}"`, 'btn btn-small') : ''}${!children && task.status !== 'done' ? btn(isInToday(task) ? '移出今日' : '加入今日', 'toggle-today', `data-id="${esc(task.id)}"`, 'btn btn-small') : ''}</div></article>`).join('')}</div></section>`;
}
let toastTimer;
function toast(message) {
  const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 4200);
}
async function commit(fn, message) {
  try { const result = await repo.commit(fn); render(); if (message) toast(repo.writable ? message : `${message}；当前仅保留在本次会话，请导出。`); return result; }
  catch (error) { toast(error.message); return null; }
}
function routeFromHash() {
  const [page, id] = location.hash.slice(1).split('/');
  ui.page = Object.hasOwn(pageNames, page) ? page : 'today';
  if (id && projectById(repo.state, id)) ui.projectId = id;
  if (!projectById(repo.state, ui.projectId)) ui.projectId = repo.state.projects[0]?.id || '';
}
function go(page, projectId) {
  if (projectId) ui.projectId = projectId;
  const hash = `#${page}${ui.projectId && ['project', 'review', 'tree'].includes(page) ? '/' + ui.projectId : ''}`;
  if (location.hash === hash) { routeFromHash(); render(); } else location.hash = hash;
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function topHeader() {
  const reminderCount = deadlineReminders(repo.state).length;
  const toggle = btn(icon('projects'), 'sidebar-toggle', `aria-label="${ui.sidebarExpanded ? '收起导航' : '展开导航'}" aria-expanded="${ui.sidebarExpanded}" aria-controls="main-sidebar"`, 'icon-btn sidebar-toggle');
  const search = btn(`${icon('search')}<span>全局搜索</span><kbd>Ctrl+K</kbd>`, 'global-search', 'aria-label="全局搜索" aria-keyshortcuts="Control+K" aria-haspopup="dialog"', 'btn btn-small global-search-trigger');
  return `<header class="topbar"><div class="breadcrumb">${toggle}<strong>${pageNames[ui.page]}</strong></div><div class="top-actions">${search}${btn(`${icon('flag')}${reminderCount ? `<span class="deadline-badge" aria-hidden="true">${reminderCount}</span>` : ''}`, 'show-deadlines', 'aria-label="查看截止提醒"', 'icon-btn deadline-header')}<span class="saved-indicator"><i></i>${desktop ? '桌面本机保存' : repo.writable ? '本机保存' : '会话模式'}</span>${btn(`${icon('plus')}<span>记进展</span>`, 'new-entry', '', 'btn btn-primary btn-small')}${btn(icon('settings'), 'settings', desktop ? 'aria-label="数据与备份设置"' : 'aria-label="数据与体验设置"', 'icon-btn')}</div></header>`;
}
function projectShortcuts(action = 'open-project') {
  return `<div class="project-list">${repo.state.projects.map(p => {
    const selected = ui.projectId === p.id && ui.page === 'project';
    return `<button type="button" class="project-shortcut ${selected ? 'selected' : ''}" data-action="${action}" data-id="${esc(p.id)}" ${selected ? 'aria-current="page"' : ''}><i class="dot ${esc(p.color)}" aria-hidden="true"></i><span class="project-shortcut-name">${esc(p.name)}</span>${p.status !== 'active' ? `<small>${p.status === 'paused' ? '暂停' : '完成'}</small>` : ''}</button>`;
  }).join('')}</div>`;
}
const projectAddButton = () => btn(`${icon('plus')}新增`, 'new-project', 'aria-label="新增项目"', 'btn btn-small sidebar-add');
function sidebar() {
  const nav = [['today', 'today', '今日工作台'], ['project', 'projects', '我的项目'], ['tree', 'tree', '行动树'], ['mind', 'mind', '思维导图'], ['progress', 'progress', '进度记录'], ['review', 'review', '进展回顾'], ['calendar', 'today', '日历'], ['ideas', 'note', '随手记']];
  return `<aside class="sidebar" id="main-sidebar"><a href="#today" class="brand" aria-label="Cockpit首页" title="Cockpit 首页"><span class="brand-mark"><i></i><i></i><i></i></span><span>Cockpit</span></a>
  <nav aria-label="主导航">${nav.map(([page, glyph, name]) => `<button type="button" data-action="${page === 'project' ? 'show-projects' : 'nav'}" data-page="${page}" title="${name}" class="nav-item ${page === 'project' ? 'mobile-projects-nav' : ''} ${ui.page === page ? 'active' : ''}" ${page === 'project' ? 'aria-haspopup="dialog"' : ui.page === page ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${name}</span></button>`).join('')}</nav>
  <section class="sidebar-projects" aria-labelledby="sidebar-project-label"><div class="sidebar-project-heading"><h2 id="sidebar-project-label">我的项目</h2>${projectAddButton()}</div>${projectShortcuts()}</section>
  <div class="sidebar-bottom">${btn(`${icon('feedback')}<span>体验反馈</span>`, 'feedback', '', 'nav-item')}${btn(`${icon('settings')}<span>${desktop ? '数据与备份' : '数据与体验'}</span>`, 'settings', '', 'nav-item')}</div></aside>`;
}
function pageHeading(kicker, title, description, actions = '') {
  return `<div class="page-heading"><div>${kicker ? `<div class="eyebrow">${kicker}</div>` : ''}<h1>${title}</h1>${description ? `<p>${description}</p>` : ''}</div>${actions ? `<div class="heading-actions">${actions}</div>` : ''}</div>`;
}
const firstProjectButton = () => btn('创建首个项目', 'new-project', '', 'btn btn-primary');
function emptyProjectPage(title, glyph) {
  return pageHeading('', title, '') + `<section class="panel empty-state">${icon(glyph)}<h2>还没有项目</h2>${firstProjectButton()}</section>`;
}
function entrySnippet(entry, compact = false) {
  const project = projectById(repo.state, entry.projectId);
  return `<button type="button" class="entry-snippet ${compact ? 'compact' : ''}" data-action="view-entry" data-id="${esc(entry.id)}"><span class="timeline-mark ${entry.kind === 'blocker' ? 'orange' : 'green'}">${icon(entry.kind === 'blocker' ? 'flag' : 'check')}</span><span class="snippet-body"><strong>${esc(entry.title)}</strong><span>${projectTag(project)}<span>${shortDate(entry.date)}</span>${entry.userCreated ? '' : '<span class="new-label">示例</span>'}</span>${compact ? '' : `<small>${esc(entry.outcome || entry.blocker || entry.next)}</small>`}</span>${icon('chevron')}</button>`;
}
function timeBudgetLabel(minutes) {
  const hours = Math.floor(minutes / 60), remaining = minutes % 60;
  return hours ? `${hours} 小时${remaining ? ` ${remaining} 分钟` : ''}` : `${minutes} 分钟`;
}
function currentCapacity() {
  const capacity = repo.state.settings.dailyCapacity;
  return capacity?.date === currentDate() ? capacity.minutes : null;
}
function capacityCard(selected, completed) {
  const estimate = tasks => tasks.reduce((sum, task) => sum + Math.max(0, task.minutes), 0);
  const pendingMinutes = estimate(selected), doneMinutes = estimate(completed);
  const estimated = pendingMinutes + doneMinutes;
  const unestimated = [...selected, ...completed].filter(task => task.minutes <= 0).length;
  const budget = currentCapacity(), difference = budget === null ? null : budget - estimated;
  const message = difference === null ? '未设置今日可用时间' : difference < 0
    ? `超出 ${timeBudgetLabel(-difference)}` : difference > 0 ? `预计还可排 ${timeBudgetLabel(difference)}` : '预计已排满';
  return `<section class="panel capacity-panel ${difference < 0 ? 'over-capacity' : ''}">
    <div class="section-heading"><h3>今日容量</h3>${icon('clock')}</div>
    <div class="capacity-numbers"><div><span>预计占用</span><strong>${timeBudgetLabel(estimated)}</strong></div><div><span>可用时间</span><strong>${budget === null ? '未设置' : timeBudgetLabel(budget)}</strong></div></div>
    ${budget === null ? '' : `<progress value="${Math.min(estimated, Math.max(budget, 1))}" max="${Math.max(budget, 1)}" aria-label="今日容量用量"></progress>`}
    <p class="capacity-balance">${message}</p>
    <div class="capacity-footer"><p class="capacity-detail">待做 ${timeBudgetLabel(pendingMinutes)} · 已完成估时 ${timeBudgetLabel(doneMinutes)}${unestimated ? ` · ${unestimated} 项未估时` : ''}</p>
    <div class="button-row">${btn(budget === null ? '设置可用时间' : '调整可用时间', 'capacity-settings', '', 'btn btn-small')}${btn('调整今日重点', 'pick-today', '', 'text-btn')}</div></div>
  </section>`;
}
function followUpCard(state) {
  const tasks = followUpTasks(state), today = currentDate();
  const dueCount = tasks.filter(task => task.followUpOn && task.followUpOn <= today).length;
  const rows = items => `<ul class="follow-up-list">${items.map(task => {
    const date = task.followUpOn;
    const label = !date ? '未设跟进日期' : date < today ? `已到期 · ${shortDate(date)}` : date === today ? '今天跟进' : shortDate(date);
    return `<li class="follow-up-row"><div>${btn(esc(task.title), 'task-detail', `data-id="${esc(task.id)}"`, 'title-button')}<small>${esc(projectById(state, task.projectId).name)}</small>
    <span class="follow-up-date ${date && date <= today ? 'due' : ''}">${date ? icon('clock') : ''}${label}</span></div>${btn(date ? '改日期' : '设日期', 'task-follow-up', `data-id="${esc(task.id)}" aria-label="${date ? '修改' : '设置'}跟进日期：${esc(task.title)}"`, 'btn btn-small')}</li>`;
  }).join('')}</ul>`;
  return `<section class="panel follow-up-panel"><div class="section-heading"><h3>待跟进</h3>${dueCount ? pill(`${dueCount} 项该跟进`, 'follow-up-chip') : pill(`${tasks.length} 项`)}</div>
    ${tasks.length ? rows(tasks.slice(0, 3)) : '<p class="muted small">暂无待跟进事项</p>'}
    ${tasks.length > 3 ? `<details class="follow-up-more"><summary>查看其余 ${tasks.length - 3} 项</summary>${rows(tasks.slice(3))}</details>` : ''}</section>`;
}
function closeoutCard(tasks) {
  const open = ui.closeoutExpanded;
  const preview = !open && tasks.length ? `<ul class="closeout-preview">${tasks.slice(0, 2).map(task => `<li title="${esc(task.title)}">${esc(task.title)}</li>`).join('')}</ul>` : '';
  const rows = open ? tasks.map(task => `<li class="closeout-row" data-closeout-task="${esc(task.id)}"><div>
    ${btn(esc(task.title), 'task-detail', `data-id="${esc(task.id)}"`, 'title-button')}<div class="closeout-meta">${projectTag(projectById(repo.state, task.projectId))}${pill(STATUS[task.status], task.status === 'waiting' ? 'orange' : '')}</div></div>
    <div class="closeout-actions" role="group" aria-label="安排${esc(task.title)}">${closeoutChoices.map(([choice, label]) => btn(label, 'closeout-task', `data-id="${esc(task.id)}" data-choice="${choice}"`, 'btn btn-small')).join('')}</div></li>`).join('') : '';
  return `<section class="panel closeout-panel" aria-labelledby="closeout-title"><div class="section-heading"><div class="closeout-heading"><h2 id="closeout-title">收工清单</h2>${pill(`${tasks.length} 项未完成`)}</div>
    ${btn(open ? '收起' : '展开清单', 'toggle-closeout', `aria-expanded="${open}" aria-controls="closeout-list"`, 'btn btn-small')}</div>
    ${preview}<div id="closeout-list"${open ? '' : ' hidden'}>${open ? (tasks.length ? `<ul class="closeout-list">${rows}</ul>` : '<p class="muted small">今日没有未完成的行动。</p>') : ''}</div></section>`;
}
const boardColorOptions = selected => Object.entries(BOARD_COLORS).map(([id, label]) =>
  `<option value="${id}" ${id === selected ? 'selected' : ''}>${label}</option>`).join('');
const widgetNames = { actions: '今日重点', closeout: '收工清单', recent: '最近进展', capacity: '今日容量', followup: '待跟进', focus: '当前项目', rhythm: '近七天记录节奏' };
const widgetBoxStyle = ({ x, y, w, h }) => `grid-column:${x + 1}/span ${w};grid-row:${y + 1}/span ${h};`;
function widgetGrid(widgets, state) {
  const board = widgetBoard(state);
  const cards = Object.keys(board).filter(id => widgets[id]).sort((a, b) => board[a].y - board[b].y || board[a].x - board[b].x);
  const height = Math.max(...cards.map(id => board[id].y + board[id].h), 1);
  const rows = ui.widgetEditing ? Math.min(WIDGET_BOARD.rows, height + 5) : height;
  return `<div class="widget-board ${ui.widgetEditing ? 'editing-widgets' : ui.widgetLayoutView ? 'show-widget-layout' : ''}"><div class="widget-grid" style="--widget-rows:${rows}" data-rows="${rows}">${cards.map(id => {
    const color = state.settings.widgetColors?.[id] || 'original', box = board[id];
    const controls = ui.widgetEditing ? `<div class="widget-controls">
      <button type="button" class="widget-handle" data-widget-drag title="拖动或用方向键移动" aria-label="移动${widgetNames[id]}">${icon('dots')}<span>${widgetNames[id]}</span></button>
      ${btn(icon('settings'), 'widget-box', `data-id="${id}" aria-label="设置${widgetNames[id]}位置和尺寸"`, 'widget-box-button')}
      <select data-control="widget-color" data-id="${id}" aria-label="${widgetNames[id]}颜色">${boardColorOptions(color)}</select>
    </div><button type="button" class="widget-resize" data-widget-resize title="拖边框或用方向键调整大小" aria-label="调整${widgetNames[id]}尺寸"></button>` : '';
    return `<div class="workbench-widget" data-color="${color}" data-widget-id="${id}" data-size="${box.w}" style="${widgetBoxStyle(box)}">${controls}<div class="widget-body">${widgets[id]}</div></div>`;
  }).join('')}${ui.widgetEditing ? '<div class="widget-drop-preview" hidden></div>' : ''}</div></div>`;
}
function todayPage() {
  const state = repo.state, today = currentDate();
  const selected = sortByPriority(executableTasks(state).filter(t => isInToday(t, today) && t.status !== 'done' && projectById(state, t.projectId).status === 'active'));
  const doneIds = new Set(state.completionEvents.filter(event => event.type === 'task' && event.date === today).map(event => event.taskId));
  const completed = state.tasks.filter(task => task.status === 'done' && doneIds.has(task.id));
  const focus = projectById(state, ui.projectId);
  const days = Array.from({ length: 7 }, (_, index) => shiftDate(currentDate(), index - 6));
  const values = days.map(day => state.entries.filter(e => e.date === day).length);
  const max = Math.max(...values, 1);
  const widgets = {
    actions: !focus ? `<section class="panel empty-state">${icon('projects')}<h2>还没有项目</h2>${firstProjectButton()}</section>` : `<section class="panel action-panel"><div class="section-heading"><h2>今日重点 <span class="count">${selected.length}</span></h2>${btn(`${icon('plus')}选择行动`, 'pick-today', '', 'btn btn-primary btn-small')}</div>
  <div class="daily-summary"><span><strong>${completed.length}</strong> 项已完成</span><span class="summary-divider"></span><span>预计 <strong>${selected.reduce((sum, t) => sum + t.minutes, 0)}</strong> 分钟</span></div>
  <div class="today-tasks">${selected.length ? selected.map(todayTaskCard).join('') : `<div class="empty-state">${icon('flag')}<h3>今日还未选择行动</h3>${btn('选择今日行动', 'pick-today', '', 'btn btn-primary')}</div>`}</div></section>`,
    closeout: state.settings.showCloseout !== false && closeoutCard(selected),
    recent: `<section class="panel recent-panel"><div class="section-heading"><h2>最近进展</h2>${btn(`全部记录 ${icon('arrow')}`, 'nav', 'data-page="progress"', 'text-btn')}</div>${entriesFor(state).slice(0, 3).map(e => entrySnippet(e, true)).join('')}</section>`,
    capacity: state.settings.showCapacity !== false && capacityCard(selected, completed),
    followup: state.settings.showFollowUp !== false && followUpCard(state),
    focus: focus && focusProjectCard(state, focus.id, helpers()),
    rhythm: state.settings.showRhythm !== false && `<section class="panel rhythm-panel"><div class="section-heading"><h3>近七天记录节奏</h3>${pill(`${values.reduce((a, b) => a + b, 0)} 条记录`)}</div><div class="bar-chart" role="img" aria-label="最近七天记录数：${values.join('、')}">${values.map((v, i) => `<div class="bar-column"><span class="bar-value">${v || ''}</span><div class="bar-track"><div class="bar ${i === 6 ? 'current' : ''}" style="height:${v ? 16 + v / max * 74 : 4}%"></div></div><span class="bar-label">${['日', '一', '二', '三', '四', '五', '六'][new Date(days[i] + 'T12:00:00Z').getUTCDay()]}</span></div>`).join('')}</div></section>`
  };
  const date = `<time class="today-date" datetime="${today}">${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</time>`;
  const controls = ui.widgetEditing ? btn('完成摆放', 'widget-edit', '', 'btn btn-primary btn-small') :
    btn('记想法', 'write-idea', '', 'btn btn-small') + btn('自定义工作台', 'workbench-settings', 'aria-haspopup="dialog"', 'btn btn-small') +
    btn(ui.widgetLayoutView ? '紧凑查看' : '查看摆放', 'widget-view', `aria-pressed="${ui.widgetLayoutView}"`, 'btn btn-small widget-view-toggle');
  return `${pageHeading('', '今日工作台', date, controls)}
  ${deadlinePanel(state, helpers())}${widgetGrid(widgets, state)}`;
}
function ideasPage() {
  const ideas = (repo.state.ideas || []).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const cards = ideas.map(idea => {
    const action = idea.projectId
      ? btn('查看项目', 'open-idea-project', `data-id="${esc(idea.projectId)}"`, 'btn btn-small')
      : btn('转为项目', 'convert-idea', `data-id="${esc(idea.id)}"`, 'btn btn-small');
    return `<article class="idea-card"><button type="button" class="idea-open" data-action="write-idea" data-id="${esc(idea.id)}"><strong>${esc(idea.title || '便签')}</strong><span>${esc(idea.body)}</span></button>
      <footer class="idea-card-footer"><time datetime="${esc(idea.updatedAt)}">${shortDate(currentDate(new Date(idea.updatedAt)))}</time>${action}</footer></article>`;
  }).join('');
  return `${pageHeading('', '随手记', '', btn(`${icon('plus')}新建便签`, 'write-idea', '', 'btn btn-primary'))}
    <section class="idea-board" aria-label="随手记白板">${cards}
    ${btn(`${icon('plus')}记下一个想法`, 'write-idea', '', 'idea-card idea-add')}</section>`;
}
function projectPage() {
  return ui.projectId ? projectDetailPage(repo.state, ui, helpers()) : emptyProjectPage('我的项目', 'projects');
}
function treeBranchIds(id) {
  return ui.treeBranches.get(id) || tasksFor(repo.state, id).filter(task => !task.parentId).map(task => task.id);
}
function actionTreePage() {
  const state = repo.state;
  if (!ui.projectId) return emptyProjectPage('行动树', 'tree');
  const others = state.projects.filter(p => p.id !== ui.projectId);
  const compare = others.find(p => p.id === ui.treeCompare);
  const picker = `<label class="workspace-picker"><span>项目</span><select data-control="tree-project" aria-label="选择行动树项目">${projectOptions(ui.projectId)}</select></label>`;
  const compareControls = compare ? `<label class="workspace-picker"><span>对照项目</span><select data-control="tree-compare-project" aria-label="选择对照项目">${others.map(p => `<option value="${esc(p.id)}" ${p.id === compare.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` + btn('关闭对照', 'tree-compare') :
    btn('并排对照', 'tree-compare', others.length ? '' : 'disabled');
  const pane = id => `<div class="tree-pane" data-tree-project="${esc(id)}">${graphView(state, { ...ui, projectId: id, treeZoom: ui.treeScales.get(id) || 1 }, helpers(), { workspace: true, compare: Boolean(compare), expanded: treeBranchIds(id), compact: ui.compactTrees.has(id) })}</div>`;
  const content = ui.treeMode === 'list' ? `<div class="tree-mode-bar">${btn('切换节点图', 'tree-mode', 'data-mode="map"', 'btn btn-primary')}</div>${taskList()}` :
    `<div class="tree-workspace ${compare ? 'split' : ''}">${pane(ui.projectId)}${compare ? pane(compare.id) : ''}</div>`;
  return pageHeading('', '行动树', '', picker + compareControls + btn('打开项目详情', 'open-project', `data-id="${esc(ui.projectId)}"`)) + content;
}
function currentMindMap() {
  return repo.state.mindMaps?.find(map => map.id === ui.mindId) || repo.state.mindMaps?.[0];
}
function mindLinkGeometry(from, to) {
  const a = mindSize(from), b = mindSize(to);
  const dx = to.x + b.width / 2 - from.x - a.width / 2;
  const dy = to.y + b.height / 2 - from.y - a.height / 2;
  if (Math.abs(dx) < Math.abs(dy) * .65) {
    const direction = to.y >= from.y ? 1 : -1;
    const x1 = from.x + a.width / 2, x2 = to.x + b.width / 2;
    const y1 = from.y + (direction === 1 ? a.height : 0), y2 = to.y + (direction === 1 ? 0 : b.height);
    const bend = Math.max(24, Math.abs(y2 - y1) / 2) * direction;
    return { path: `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`, x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  }
  const direction = dx >= 0 ? 1 : -1;
  const x1 = from.x + (direction === 1 ? a.width : 0), x2 = to.x + (direction === 1 ? 0 : b.width);
  const y1 = from.y + a.height / 2, y2 = to.y + b.height / 2;
  const bend = Math.max(28, Math.abs(x2 - x1) / 2) * direction;
  return { path: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`, x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}
const mindAction = (mapId, nodeId) => repo.state.tasks.find(task => task.source?.mapId === mapId && task.source?.nodeId === nodeId);
const canConvertMindNode = (map, node) => node.id !== map.nodes[0].id && (node.kind || 'idea') === 'idea';
const mindKinds = { idea: '想法', literature: '文献', topic: '主题' };
function mindGroupStyle(group, nodes) {
  const members = group.nodes.map(id => nodes.get(id));
  const left = Math.max(0, Math.min(...members.map(n => n.x)) - 26);
  const top = Math.max(0, Math.min(...members.map(n => n.y)) - 39);
  const right = Math.max(...members.map(n => n.x + mindSize(n).width)) + 26;
  const bottom = Math.max(...members.map(n => n.y + mindSize(n).height)) + 24;
  return `left:${left}px;top:${top}px;width:${right - left}px;height:${bottom - top}px`;
}
function mindPage() {
  const map = currentMindMap();
  const addMap = btn(`${icon('plus')}新建导图`, 'mind-new', '', 'btn btn-primary');
  if (!map) return pageHeading('', '思维导图', '', addMap) + `<section class="panel mind-empty"><div class="empty-state">${icon('mind')}<h2>新建一张导图</h2><p>从一个主题开始，添加分支和连线。</p>${btn('创建第一张导图', 'mind-new', '', 'btn btn-primary')}</div></section>`;
  const selected = map.nodes.find(node => node.id === ui.mindSelected) || map.nodes[0];
  const selectedNode = id => ui.mindMulti.size ? ui.mindMulti.has(id) : selected.id === id;
  const picker = `<label class="workspace-picker"><span>导图</span><select data-control="mind-map" aria-label="切换导图">${repo.state.mindMaps.map(item => `<option value="${esc(item.id)}" ${item.id === map.id ? 'selected' : ''}>${esc(item.title)}</option>`).join('')}</select></label>`;
  const width = Math.min(MIND_CANVAS.width, Math.max(2800, ...map.nodes.map(n => n.x + mindSize(n).width + 760)));
  const height = Math.min(MIND_CANVAS.height, Math.max(1800, ...map.nodes.map(n => n.y + mindSize(n).height + 590)));
  const nodes = new Map(map.nodes.map(node => [node.id, node]));
  const links = map.links.map(link => ({ ...link, ...mindLinkGeometry(nodes.get(link.from), nodes.get(link.to)) }));
  const zoom = ui.mindZoom;
  return pageHeading('', '思维导图', '', picker + addMap) + `<section class="panel mind-panel">
  <div class="mind-toolbar">
    ${btn(`${icon('plus')}添加分支`, 'mind-branch', `data-id="${esc(selected.id)}" title="Alt+Enter 添加子分支"`, 'btn btn-small btn-primary')}
    ${btn('想法卡', 'mind-add', '', 'btn btn-small')}
    ${btn('文献卡', 'mind-add-literature', '', 'btn btn-small')}
    ${btn('编辑节点', 'mind-edit', `data-id="${esc(selected.id)}"`, 'btn btn-small')}
    ${btn(ui.mindLinkFrom ? '取消连线' : '连接节点', 'mind-connect', `data-id="${esc(selected.id)}" aria-pressed="${Boolean(ui.mindLinkFrom)}"`, 'btn btn-small')}
    ${btn('管理连线', 'mind-links', `data-id="${esc(selected.id)}" ${map.links.some(link => link.from === selected.id) ? '' : 'disabled'}`, 'btn btn-small')}
    ${btn(ui.mindMulti.size > 1 ? `新建分组（${ui.mindMulti.size}）` : '新建分组', 'mind-group', `title="按住 Shift 选中至少两张卡片" ${ui.mindMulti.size > 1 ? '' : 'disabled'}`, 'btn btn-small')}
    ${btn(mindAction(map.id, selected.id) ? '查看关联行动' : '转为项目行动', 'mind-convert', `data-id="${esc(selected.id)}" ${canConvertMindNode(map, selected) || mindAction(map.id, selected.id) ? '' : 'hidden'}`, 'btn btn-small')}
    <div class="mind-zoom">${btn('−', 'mind-zoom', 'data-step="-0.15" aria-label="缩小导图"', 'icon-btn')}<span class="mind-scale">${Math.round(zoom * 100)}%</span>${btn('+', 'mind-zoom', 'data-step="0.15" aria-label="放大导图"', 'icon-btn')}${btn('全图', 'mind-fit', 'title="缩放至全图"', 'btn btn-small')}${btn('定位主题', 'mind-center', '', 'btn btn-small')}</div>
  </div>
  <div class="mind-selection" aria-live="polite">${ui.mindLinkFrom ? `从 <strong>${esc(nodes.get(ui.mindLinkFrom)?.title)}</strong> 连线，请点选目标节点` : `已选中 <strong>${esc(selected.title)}</strong> · Shift 多选 · Alt+Enter 加子分支`}</div>
  <div class="mind-viewport ${ui.mindLinkFrom ? 'mind-linking' : ''}" data-map-id="${esc(map.id)}" data-zoom="${zoom}" data-width="${width}" data-height="${height}" tabindex="0" role="region" aria-label="思维导图画布">
    <div class="mind-scroll" style="width:${width * zoom}px;height:${height * zoom}px"><div class="mind-world" style="width:${width}px;height:${height}px;transform:scale(${zoom})">
      ${(map.groups || []).map(group => `<div class="mind-group-frame" data-mind-group="${esc(group.id)}" style="${mindGroupStyle(group, nodes)}"><span>${esc(group.title)}</span>${btn(icon('close'), 'mind-ungroup', `data-id="${esc(group.id)}" aria-label="解除${esc(group.title)}分组"`, 'mind-ungroup')}</div>`).join('')}
      <svg class="mind-links" width="${width}" height="${height}" aria-hidden="true"><defs><marker id="mind-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" fill="currentColor"/></marker></defs>
      ${links.map((link, index) => `<path class="mind-curve" data-link-index="${index}" data-from="${esc(link.from)}" data-to="${esc(link.to)}" d="${link.path}" marker-end="url(#mind-arrow)"/>`).join('')}</svg>
      ${links.map((link, index) => link.label ? `<span class="mind-edge-label" data-link-label="${index}" style="left:${link.x}px;top:${link.y}px">${esc(link.label)}</span>` : '').join('')}
      ${map.nodes.map((node, index) => `<article class="mind-node ${selectedNode(node.id) ? 'selected' : ''}" data-mind-node="${esc(node.id)}" data-color="${esc(node.color)}" style="left:${node.x}px;top:${node.y}px;width:${mindSize(node).width}px;height:${mindSize(node).height}px">
      <div class="mind-handle" data-mind-drag title="拖动节点"><span>${index === 0 ? '中心主题' : mindKinds[node.kind || 'idea']}</span></div><span class="mind-port" data-mind-port="right" title="拖动连接节点"></span><span class="mind-port" data-mind-port="left" title="拖动连接节点"></span><span class="mind-resize" data-mind-resize title="拖动调整大小"></span>
      <button type="button" class="mind-node-content" data-action="mind-select" data-id="${esc(node.id)}" aria-pressed="${selectedNode(node.id)}" title="${esc(node.title)}"><strong>${esc(node.title)}</strong>${node.note ? `<small>${esc(node.note)}</small>` : ''}${node.reference ? `<small class="mind-reference" title="${esc(node.reference)}">${esc(node.reference)}</small>` : ''}</button>
      </article>`).join('')}
    </div></div>
  </div></section>`;
}
function taskCard(task) {
  const todaySelected = isInToday(task);
  return `<article class="task-card ${task.status === 'done' ? 'is-done' : ''}" draggable="true" data-task-id="${esc(task.id)}" data-priority="${esc(task.priority)}"><button type="button" class="task-card-title" data-action="task-detail" data-id="${esc(task.id)}">${esc(task.title)}</button>${parentBreadcrumb(task)}<div class="card-topline">${priorityControl(task)}${task.parentId ? pill('子行动') : ''}</div>${task.note ? `<p>${esc(task.note)}</p>` : ''}<div class="card-meta"><span>${icon('clock')}${task.minutes || '—'} 分钟</span><span>截止 ${shortDate(task.due)}</span>${task.status === 'done' && task.completedOn ? `<span class="completion-date">✓ ${shortDate(task.completedOn)}完成</span>` : ''}${todaySelected ? pill('今日', 'green') : task.plannedOn ? pill(`计划 ${shortDate(task.plannedOn)}`) : ''}</div><div class="card-controls"><label class="sr-only" for="status-${esc(task.id)}">${esc(task.title)}的状态</label><select id="status-${esc(task.id)}" data-control="task-status" data-id="${esc(task.id)}">${Object.entries(STATUS).map(([v, label]) => `<option value="${v}" ${task.status === v ? 'selected' : ''}>${label}</option>`).join('')}</select>${btn(icon('progress'), 'new-entry', `data-task="${esc(task.id)}" aria-label="记录进展：${esc(task.title)}"`, 'icon-btn tiny')}${task.status !== 'done' ? btn('拆分', 'split-task', `data-id="${esc(task.id)}"`, 'text-btn') : ''}${task.status !== 'done' ? btn(icon(todaySelected ? 'check' : 'plus'), 'toggle-today', `data-id="${esc(task.id)}" aria-label="${todaySelected ? '移出今日' : '加入今日'}：${esc(task.title)}"`, `icon-btn tiny ${todaySelected ? 'selected' : ''}`) : ''}</div></article>`;
}
function progressPage() {
  if (!ui.projectId) return emptyProjectPage('进度记录', 'progress');
  let entries = entriesFor(repo.state, ui.filterProject === 'all' ? '' : ui.filterProject);
  if (ui.filterKind !== 'all') entries = entries.filter(e => e.kind === ui.filterKind);
  if (ui.search) entries = entries.filter(e => `${e.title} ${e.outcome} ${e.blocker} ${e.next}`.toLowerCase().includes(ui.search.toLowerCase()));
  return `${pageHeading('', '进度记录', '', btn(`${icon('plus')}新增记录`, 'new-entry', '', 'btn btn-primary'))}
  <div class="filter-bar"><label>项目 <select data-control="filter-project"><option value="all">全部项目</option>${projectOptions(ui.filterProject)}</select></label><label>类型 <select data-control="filter-kind"><option value="all">全部记录</option><option value="progress" ${ui.filterKind === 'progress' ? 'selected' : ''}>进展与成果</option><option value="blocker" ${ui.filterKind === 'blocker' ? 'selected' : ''}>遇到的阻碍</option></select></label><label class="search-field"><span class="sr-only">搜索记录</span><input type="search" placeholder="搜索进展内容…" value="${esc(ui.search)}" data-control="search" /></label><span class="filter-count">${entries.length} 条记录</span></div>
  <section class="journal">${entries.length ? entries.map(entry => `<article class="journal-entry"><div class="journal-date"><strong>${shortDate(entry.date)}</strong><span>${entry.userCreated ? '手动记录' : '示例'}</span></div><div class="panel journal-card"><div class="journal-card-heading">${projectTag(projectById(repo.state, entry.projectId))}${pill(entry.kind === 'blocker' ? '遇到阻碍' : '进展与成果', entry.kind === 'blocker' ? 'orange' : 'green')}</div><h2>${esc(entry.title)}</h2>${entry.outcome ? `<div class="journal-field"><span>成果</span><p>${esc(entry.outcome)}</p></div>` : ''}${entry.blocker ? `<div class="journal-field blocker"><span>阻碍</span><p>${esc(entry.blocker)}</p></div>` : ''}${entry.next ? `<div class="journal-field"><span>下一步</span><p>${esc(entry.next)}</p></div>` : ''}<div class="journal-footer"><span>${entry.taskId ? `${icon('link')}${esc(repo.state.tasks.find(t => t.id === entry.taskId)?.title || '')}` : '项目级记录'}</span><div class="journal-actions">${btn('编辑', 'edit-entry', `data-id="${esc(entry.id)}" aria-label="编辑记录：${esc(entry.title)}"`, 'text-btn')}${btn('查看详情', 'view-entry', `data-id="${esc(entry.id)}"`, 'text-btn')}</div></div></div></article>`).join('') : `<div class="panel empty-state">${icon('progress')}<h3>这里还没有匹配的记录</h3><p>试试调整筛选，或留下第一条进展。</p>${btn('新增记录', 'new-entry', '', 'btn btn-primary')}</div>`}</section>`;
}
function currentReview() {
  const all = repo.state.reviews.filter(r => r.projectId === ui.projectId);
  return all.find(r => r.id === ui.reviewId) || all.filter(r => r.weekStart === ui.weekStart).at(-1);
}
function reviewDecision(project, { entries, completed, waiting, blockers, focus }) {
  const periodLabel = ui.reviewPeriod === 'week' ? '所选周' : '所选月';
  const buttonForTask = (task, label) => btn(label, 'task-detail', `data-id="${esc(task.id)}"`, 'btn btn-small');
  const entryButton = entry => btn('查看原记录', 'view-entry', `data-id="${esc(entry.id)}"`, 'text-btn');
  const completionRows = events => `<ul class="decision-completions">${events.map(event => `<li>${icon('check')}${btn(esc(event.title), 'task-detail', `data-id="${esc(event.taskId)}"`, 'title-button')}<time datetime="${event.date}">${shortDate(event.date)}</time></li>`).join('')}</ul>`;
  const records = entries.filter(entry => entry.outcome || !entry.blocker);
  const more = (label, items, renderItems) => items.length > 3 ? `<details class="decision-more"><summary>${label}（${items.length}）</summary>${renderItems(items.slice(3))}</details>` : '';
  const blockerRows = items => items.map(blocker => {
    const linked = taskFromEntry(repo.state, blocker.id);
    const action = linked ? buttonForTask(linked, '查看已转行动') : blocker.next.trim().length >= 2 && project.status === 'active'
      ? btn(`${icon('plus')}转为待办行动`, 'convert-blocker', `data-id="${esc(blocker.id)}"`, 'btn btn-small') : '';
    return `<div class="decision-blocker"><strong>${esc(blocker.title)}</strong><p>${esc(blocker.blocker)}</p>${blocker.next ? `<p><strong>记录里的下一步</strong> ${esc(blocker.next)}</p>` : ''}<div class="button-row">${entryButton(blocker)}${action}</div></div>`;
  }).join('');
  const waitingTask = waiting[0];
  const nextAction = `<section class="panel decision-focus"><div class="section-heading"><h2>下一步先做什么</h2>${pill('项目当前状态')}</div>
    ${focus ? `<h3>${esc(focus.title)}</h3><p>${esc(STATUS[focus.status])}${focus.due ? ` · 截止 ${shortDate(focus.due)}` : ''}${focus.minutes ? ` · 预计 ${focus.minutes} 分钟` : ''} · ${PRIORITY[focus.priority || 'normal'].label}</p>
    <div class="button-row">${isInToday(focus) ? pill('已在今日', 'green') : btn('加入今日', 'review-add-today', `data-id="${esc(focus.id)}"`, 'btn btn-primary btn-small')}${buttonForTask(focus, '查看行动')}</div>
    <details class="decision-why"><summary>为什么优先这项</summary><p>在待办和进行中的行动里，先看到期或逾期的事项，再按紧急程度和截止日期选出一项。</p></details>` : `<p>${project.status === 'active' ? '目前没有可直接推进的行动。' : `项目${PROJECT_STATUS[project.status]}。`}</p>`}
  </section>`;
  return `<div class="weekly-decision">
  <section class="panel decision-card"><div class="section-heading"><h2>${periodLabel}的进展</h2>${pill(`${completed.length} 项有完成记录 · ${entries.length} 条进展`)}</div>
    ${completed.length ? completionRows(completed.slice(0, 3)) + more('展开全部完成事项', completed, completionRows) : '<p class="muted">暂无行动完成记录。</p>'}
    ${records.slice(0, 3).map(entry => entrySnippet(entry)).join('')}${more('展开全部进展记录', records, items => items.map(entry => entrySnippet(entry)).join(''))}
  </section>
  <section class="panel decision-card"><div class="section-heading"><h2>阻碍与等待</h2>${pill(`${blockers.length} 条阻碍`, blockers.length ? 'orange' : '')}</div>
    ${blockers.length ? blockerRows(blockers.slice(0, 3)) + more('展开全部阻碍', blockers, blockerRows) : '<p class="muted">所选范围暂无阻碍记录。</p>'}
    ${waitingTask ? `<div class="decision-waiting"><div><strong>当前等待中的行动（${waiting.length}）</strong><p>${esc(waitingTask.title)}</p></div>${buttonForTask(waitingTask, '查看等待行动')}</div>` : ''}
  </section>${nextAction}</div>`;
}
function reviewPage() {
  if (!ui.projectId) return emptyProjectPage('进展回顾', 'review');
  const state = repo.state, project = projectById(state, ui.projectId), review = currentReview(), stats = review?.facts || metrics(state, project.id);
  const week = reviewPeriodEvidence(state, project.id, { date: ui.reviewDate });
  const month = reviewPeriodEvidence(state, project.id, { date: ui.reviewDate, period: 'month' });
  const stale = review && reviewIsStale(state, review);
  const chosen = review?.suggestions.filter(s => s.status === 'pending' && s.selected) || [];
  const revisions = state.revisions.filter(r => r.projectId === project.id).toReversed();
  return `${pageHeading('', '进展回顾', '', `<label class="sr-only" for="review-project">回顾项目</label><select id="review-project" data-control="review-project">${projectOptions(project.id)}</select>`)}
  ${reviewControls(week, month)}<div class="review-snapshot-shortcut">${btn('查看周复盘与调整历史', 'jump-review-snapshots', '', 'text-btn')}</div>${reviewDecision(project, ui.reviewPeriod === 'week' ? week : month)}
  <details class="review-snapshots" ${ui.reviewSnapshotsOpen ? 'open' : ''}><summary>复盘快照与调整历史</summary>
  <div class="review-scope"><span>周复盘 · ${validDate(review?.weekStart) ? review.weekStart : ui.weekStart} — ${validDate(review?.weekEnd) ? review.weekEnd : shiftDate(ui.weekStart, 6)}</span><div class="button-row">${pill('本地规则', 'demo')}${btn(review ? '重新生成复盘' : '生成本次复盘', 'generate-review', '', 'btn btn-small')}</div></div>
  ${stale ? '<div class="notice warning">项目在本次复盘后已变化。以下保留当时的分析快照；请重新生成复盘后再采纳建议。</div>' : ''}
  ${!review ? '<p class="muted">还没有保存所选周的复盘。</p>' : `
  <div class="review-layout"><div class="main-column"><section class="panel review-facts"><div class="section-heading"><h2>已保存的复盘</h2>${pill('生成时快照')}</div><div class="fact-grid"><div><strong>${review.facts.periodEntries}</strong><span>条范围内记录</span></div>${Number.isSafeInteger(stats.periodCompleted) ? `<div><strong>${stats.periodCompleted}</strong><span>项当周有完成记录</span></div>` : `<div><strong>${stats.done}<small> / ${stats.tasks}</small></strong><span>生成时项目累计完成</span></div>`}<div><strong>${stats.waiting}</strong><span>生成时等待的行动</span></div></div><p class="review-summary">${esc(review.summary)}</p><div class="source-label">${icon('link')}本次参考的记录 · 点击核对</div>${review.sourceIds.length ? review.sourceIds.map(id => state.entries.find(e => e.id === id)).filter(Boolean).map(e => entrySnippet(e, true)).join('') : '<p class="muted">范围内还没有进展记录。</p>'}</section>
  <section class="panel reasoning-panel"><div class="section-heading"><h2>可能卡在哪里</h2>${pill('分析假设', 'orange')}</div><p>${esc(review.hypothesis)}</p><div class="strategy-line">${icon('arrow')}<div><span>建议尝试的策略</span><strong>${esc(review.strategy)}</strong></div></div></section></div>
  <div class="side-column"><section class="suggestions-panel panel"><div class="section-heading"><h2>行动草稿</h2></div>
  ${review.suggestions.length ? `<div class="suggestion-list">${review.suggestions.map(s => `<div class="suggestion ${s.status !== 'pending' ? 'processed' : ''}"><label><input type="checkbox" data-control="suggestion" data-id="${esc(s.id)}" ${s.selected && s.status === 'pending' ? 'checked' : ''} ${s.status !== 'pending' || stale ? 'disabled' : ''} /><strong>${esc(s.title)}</strong></label>${s.note ? `<p>${esc(s.note)}</p>` : ''}<div class="suggestion-meta">${s.sourceEntryId ? btn('查看原记录', 'view-entry', `data-id="${esc(s.sourceEntryId)}"`, 'text-btn') : ''}${s.status === 'applied' ? pill('已加入项目', 'green') : s.status === 'dismissed' ? pill('暂不采纳') : pill('待你确认')}</div></div>`).join('')}</div>${review.suggestions.some(s => s.status === 'pending') ? `${btn('预览计划调整', 'preview-adjustment', `data-id="${esc(review.id)}" ${!chosen.length || stale ? 'disabled' : ''}`, 'btn btn-primary btn-full')}${btn('暂不采纳', 'dismiss-suggestions', `data-id="${esc(review.id)}"`, 'text-btn full')}` : btn('查看项目行动 →', 'open-project', `data-id="${esc(project.id)}"`, 'text-btn full')}` : '<p>本次没有需要新增的行动草稿。可以从上方查看已有行动。</p>'}</section></div></div>`}
  <section class="panel revision-panel"><div class="section-heading"><div><span class="section-label">保留每次调整的来由</span><h2>计划调整历史</h2></div><span class="muted small">${revisions.length} 次调整</span></div>${revisions.length ? revisions.map(r => `<div class="revision-row"><div class="revision-icon">${icon('undo')}</div><div><h3>新增 ${r.changes.length} 项下一步行动</h3><p>${esc(r.reason)}</p><small>${shortDate(r.date)} · 数据修订 ${r.from} → ${r.to}</small></div>${btn('查看差异', 'view-revision', `data-id="${esc(r.id)}"`, 'btn btn-small')}</div>`).join('') : '<div class="inline-empty">采纳一条建议后，这里会留下调整内容与原因。</div>'}</section>
  ${state.reviews.some(r => r.projectId === project.id && r.id !== review?.id) ? `<section class="review-history"><h3>历史复盘</h3><div>${state.reviews.filter(r => r.projectId === project.id).toReversed().map(r => btn(`${shortDate(validDate(r.weekStart) ? r.weekStart : r.date)} · ${r.facts.periodEntries} 条记录`, 'open-review', `data-id="${esc(r.id)}"`, `btn btn-small ${r.id === review?.id ? 'is-active' : ''}`)).join('')}</div></section>` : ''}</details>`;
}
function fitTreeGraph(viewport, minimum = .86) {
  const world = viewport.querySelector('.graph-canvas'), scroll = world.parentElement;
  const width = parseFloat(world.style.width), height = parseFloat(world.style.height);
  const scale = Math.max(minimum, Math.min(1, (viewport.clientWidth - 12) / width, (viewport.clientHeight - 12) / height));
  scroll.style.width = `${width * scale}px`;
  scroll.style.height = `${height * scale}px`;
  scroll.style.setProperty('--graph-content-height', `${height * scale}px`);
  world.style.marginLeft = `${-width * scale / 2}px`;
  world.style.transform = `scale(${scale})`;
  viewport.dataset.scale = scale;
  viewport.closest('.graph-panel').querySelector('.graph-scale').textContent = `${Math.round(scale * 100)}%`;
  return scale;
}
function highlightGraphBranch(node, active) {
  const canvas = node.closest('.graph-canvas');
  const edges = canvas.querySelectorAll('.graph-edges path');
  if (!active) {
    for (const edge of edges) edge.classList.remove('branch-highlight');
    return;
  }
  const incoming = new Map(), outgoing = new Map();
  for (const edge of edges) {
    const { graphFrom, graphTo } = edge.dataset;
    incoming.set(graphTo, edge);
    if (!outgoing.has(graphFrom)) outgoing.set(graphFrom, []);
    outgoing.get(graphFrom).push(edge);
    edge.classList.remove('branch-highlight');
  }
  const id = node.dataset.graphId;
  for (let edge = incoming.get(id); edge; edge = incoming.get(edge.dataset.graphFrom)) edge.classList.add('branch-highlight');
  const descendants = [...(outgoing.get(id) || [])];
  while (descendants.length) {
    const edge = descendants.pop();
    edge.classList.add('branch-highlight');
    descendants.push(...(outgoing.get(edge.dataset.graphTo) || []));
  }
}
for (const [eventName, active] of [['pointerover', true], ['pointerout', false], ['focusin', true], ['focusout', false]]) {
  app.addEventListener(eventName, event => {
    const node = event.target.closest('.graph-node');
    if (node && !node.contains(event.relatedTarget)) highlightGraphBranch(node, active);
  });
}
function appFocusKey(element = document.activeElement) {
  if (!app.contains(element)) return null;
  const data = Object.entries(element.dataset).filter(([key]) => ['action', 'control', 'id', 'task', 'tab', 'page', 'date', 'direction', 'choice', 'widgetDrag', 'widgetResize', 'step'].includes(key));
  if (!element.id && !data.length) return null;
  const scope = element.closest('.tree-pane, .workbench-widget, .topbar, .sidebar, main');
  const sameControl = other => other.tagName === element.tagName && (!element.id || other.id === element.id) && data.every(([key, value]) => other.dataset[key] === value);
  return { pane: scope?.dataset.treeProject, widget: scope?.dataset.widgetId,
    region: scope?.matches('.topbar') ? '.topbar' : scope?.matches('.sidebar') ? '.sidebar' : 'main',
    sameControl, index: [...(scope || app).querySelectorAll(element.tagName)].filter(sameControl).indexOf(element), tag: element.tagName };
}
function restoreAppFocus(key) {
  if (!key) return;
  const scope = key.pane ? [...app.querySelectorAll('.tree-pane')].find(el => el.dataset.treeProject === key.pane) :
    key.widget ? [...app.querySelectorAll('.workbench-widget')].find(el => el.dataset.widgetId === key.widget) : app.querySelector(key.region);
  const element = [...(scope?.querySelectorAll(key.tag) || [])].filter(key.sameControl)[key.index];
  if (element?.getClientRects().length && !element.closest('[hidden]') && !element.disabled) element.focus({ preventScroll: true });
}
function render() {
  const focus = appFocusKey();
  const boardLeft = app.querySelector('.widget-board')?.scrollLeft || 0;
  const widgetScrolls = new Map([...app.querySelectorAll('.widget-body')].map(body => [body.parentElement.dataset.widgetId, body.scrollTop]));
  const previousGraphs = new Map([...document.querySelectorAll('.graph-viewport')].map(graph => [graph.closest('.tree-pane')?.dataset.treeProject || '', { left: graph.scrollLeft, top: graph.scrollTop }]));
  const oldMind = document.querySelector('.mind-viewport');
  const previousMind = oldMind && { id: oldMind.dataset.mapId, zoom: Number(oldMind.dataset.zoom), left: oldMind.scrollLeft, top: oldMind.scrollTop };
  document.title = `${pageNames[ui.page]} · Cockpit`;
  const page = { today: todayPage, project: projectPage, tree: actionTreePage, mind: mindPage, progress: progressPage, review: reviewPage, calendar: () => calendarPage(repo.state, ui, helpers()), ideas: ideasPage }[ui.page];
  app.classList.toggle('sidebar-expanded', ui.sidebarExpanded);
  app.innerHTML = `${sidebar()}<div class="app-main">${topHeader()}<main id="main-content" class="${ui.page === 'tree' ? 'full-tree-page' : ['today', 'project'].includes(ui.page) ? `workspace-page ${ui.page}-workspace` : ''}">${!repo.writable ? `<div class="notice warning">${esc(repo.loadError)}</div>` : ''}${page()}</main></div>`;
  for (const graph of document.querySelectorAll('.graph-viewport')) {
    const id = graph.closest('.tree-pane')?.dataset.treeProject;
    if (id && !ui.treeScales.has(id)) fitTreeGraph(graph, ui.compactTrees.has(id) ? .25 : .86);
    const previous = previousGraphs.get(id || '');
    const center = ui.graphCenterRequested === true || ui.graphCenterRequested === id;
    graph.scrollLeft = previous && !center ? previous.left : (graph.scrollWidth - graph.clientWidth) / 2;
    graph.scrollTop = previous && !center ? previous.top : 0;
  }
  ui.graphCenterRequested = false;
  const board = app.querySelector('.widget-board');
  if (board) board.scrollLeft = boardLeft;
  for (const body of app.querySelectorAll('.widget-body')) body.scrollTop = widgetScrolls.get(body.parentElement.dataset.widgetId) || 0;
  if (!modalRoot.querySelector('dialog[open]')) restoreAppFocus(focus);
  const viewport = document.querySelector('.mind-viewport');
  if (viewport) {
    const node = currentMindMap().nodes.find(item => item.id === ui.mindFocus);
    if (node) {
      viewport.scrollLeft = (node.x + mindSize(node).width / 2) * ui.mindZoom - viewport.clientWidth / 2;
      viewport.scrollTop = (node.y + mindSize(node).height / 2) * ui.mindZoom - viewport.clientHeight / 2;
    } else if (previousMind?.id === viewport.dataset.mapId) {
      const ratio = ui.mindZoom / previousMind.zoom;
      viewport.scrollLeft = (previousMind.left + viewport.clientWidth / 2) * ratio - viewport.clientWidth / 2;
      viewport.scrollTop = (previousMind.top + viewport.clientHeight / 2) * ratio - viewport.clientHeight / 2;
    }
    ui.mindFocus = '';
  }
}

function dialog(title, body, footer = '', form = '', wide = false) {
  if (!modalRoot.contains(document.activeElement)) ui.returnFocus = appFocusKey();
  const old = modalRoot.querySelector('dialog'); if (old) old.close();
  modalRoot.innerHTML = `<dialog class="dialog ${wide ? 'dialog-wide' : ''}" aria-labelledby="dialog-title"><div class="dialog-heading"><h2 id="dialog-title">${title}</h2>${btn(icon('close'), 'close-modal', 'aria-label="关闭对话框"', 'icon-btn')}</div>${form ? `<form data-form="${form}">` : '<div>'}<div class="dialog-body">${body}<p class="form-error" role="alert" hidden></p></div>${footer ? `<div class="dialog-footer">${footer}</div>` : ''}${form ? '</form>' : '</div>'}</dialog>`;
  const element = modalRoot.querySelector('dialog'); element.showModal();
  element.addEventListener('cancel', event => { event.preventDefault(); closeModal(); });
  element.addEventListener('click', event => { if (event.target === element) { const r = element.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeModal(); } });
}
function closeModal() {
  const focus = ui.returnFocus;
  modalRoot.querySelector('dialog')?.close();
  modalRoot.innerHTML = '';
  ui.modal = null;
  ui.returnFocus = null;
  restoreAppFocus(focus);
}
const cancelButton = () => btn('取消', 'close-modal');
function mindNodeDialog(id = '', parentId = '', position = null, kind = parentId ? 'topic' : 'idea') {
  const map = currentMindMap(), node = map.nodes.find(item => item.id === id);
  const parent = map.nodes.find(item => item.id === parentId);
  ui.modal = { mapId: map.id, id, parentId, position };
  const title = node ? '编辑节点' : parent ? '添加分支' : kind === 'literature' ? '新增文献卡' : '新增想法卡';
  const color = node?.color || (kind === 'literature' ? 'blue' : parent ? 'amber' : 'original');
  const remove = node && node.id !== map.nodes[0].id ? btn('删除节点', 'mind-delete-confirm', `data-id="${esc(id)}"`, 'btn btn-danger') : '';
  dialog(title, `${parent ? `<p class="muted small">从 ${esc(parent.title)} 添加分支</p>` : ''}
    <label>节点名称<input name="title" required maxlength="120" value="${esc(node?.title)}" autofocus></label>
    <label>节点说明<textarea name="note" rows="4" maxlength="4000">${esc(node?.note)}</textarea></label>
    <div class="form-row"><label>卡片类型<select name="kind">${Object.entries(mindKinds).map(([value, label]) => `<option value="${value}" ${(node?.kind || kind) === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>来源（选填）<input name="reference" maxlength="2000" value="${esc(node?.reference)}" placeholder="DOI、链接或引文"></label></div>
    <label>节点颜色<select name="color">${boardColorOptions(color)}</select></label>`,
  `${remove}${cancelButton()}<button type="submit" class="btn btn-primary">保存节点</button>`, 'mind-node');
}
function mindLinksDialog(from) {
  const map = currentMindMap(), links = map.links.filter(link => link.from === from);
  dialog('管理连线', `<div class="mind-link-list">${links.map(link => `<div><span>${esc(map.nodes.find(node => node.id === link.to)?.title)}</span>${btn(link.label ? '修改说明' : '添加说明', 'mind-link-label', `data-id="${esc(from)}" data-to="${esc(link.to)}"`, 'btn btn-small')}${btn('移除连线', 'mind-unlink', `data-id="${esc(from)}" data-to="${esc(link.to)}"`, 'btn btn-small')}</div>`).join('')}</div>`, btn('关闭', 'close-modal'));
}
function globalSearchDialog() {
  ui.modal = { kind: 'global-search' };
  dialog('全局搜索', `<label for="global-search-input" class="sr-only">搜索项目、行动、进展记录和便签</label><input id="global-search-input" type="search" data-control="global-search" placeholder="输入关键词" autocomplete="off" autofocus />
    <p class="sr-only" data-search-status role="status"></p><div class="global-search-results"><p class="muted small">可搜索项目、行动、进展记录和便签。</p></div>`, '', '', true);
}
function renderSearchResults(query) {
  const results = modalRoot.querySelector('.global-search-results');
  if (!results) return;
  const groups = searchWorkspace(repo.state, query);
  modalRoot.querySelector('[data-search-status]').textContent = query.trim() ? `${groups.reduce((count, group) => count + group.total, 0)} 条匹配结果` : '';
  results.innerHTML = groups.length ? groups.map(({ kind, label, total, rows }) => `<section class="global-search-group"><h3>${label} <span>${total}</span></h3>
    ${rows.map(row => btn(`<strong>${esc(row.title)}</strong>${row.context ? `<small>${esc(row.context)}</small>` : ''}${row.text ? `<span>${esc(row.text.slice(0, 120))}</span>` : ''}`, 'global-search-open', `data-kind="${kind}" data-id="${esc(row.id)}"`, 'global-search-result')).join('')}
    ${total > rows.length ? `<p class="muted small">显示前 ${rows.length} 条，可缩小关键词。</p>` : ''}</section>`).join('')
    : `<p class="muted small">${query.trim() ? '没有找到匹配内容。' : '可搜索项目、行动、进展记录和便签。'}</p>`;
  results.scrollTop = 0;
}
function newEntry(taskId, complete = false, entryId = '') {
  if (!repo.state.projects.length) return newProject();
  const entry = repo.state.entries.find(item => item.id === entryId);
  const task = repo.state.tasks.find(t => t.id === taskId);
  const canUpdateTask = task && isLeafTask(repo.state, task.id);
  const projectId = task?.projectId || (ui.filterProject !== 'all' && ui.page === 'progress' ? ui.filterProject : ui.projectId);
  ui.modal = { kind: 'entry', complete, entryId };
  const association = entry ? `<div class="inline-labels">${projectTag(projectById(repo.state, entry.projectId))}<span class="muted small">原记录日期 ${esc(entry.date)}</span></div>` :
    `<div class="form-row"><label>所属项目<select name="projectId" data-control="entry-project">${projectOptions(projectId)}</select></label><label>关联行动<select name="taskId" data-control="entry-task">${taskOptions(projectId, taskId)}</select></label></div>`;
  dialog(entry ? '编辑进展记录' : complete ? '完成行动，留下一点成果' : '记录一次进展', `${association}<label>这次推进了什么 <span class="required">*</span><input name="title" placeholder="例如：整理了验证条件清单的第一版" value="${esc(entry?.title ?? (complete && task ? ('完成：' + task.title).slice(0, 200) : ''))}" required minlength="2" maxlength="200" autofocus /></label><label>留下了什么成果<textarea name="outcome" rows="2" maxlength="3000" placeholder="可以是一份清单、一次验证，或一个更明确的结论。">${esc(entry?.outcome)}</textarea></label><div class="form-row"><label>遇到的阻碍<textarea name="blocker" rows="2" maxlength="2000" placeholder="没有可以留空。">${esc(entry?.blocker)}</textarea></label><label>接下来准备做什么<textarea name="next" rows="2" maxlength="2000" placeholder="写下一项能开始的行动。">${esc(entry?.next)}</textarea></label></div>${entry ? '' : `<label>同步更新关联行动<select name="taskStatus" ${!canUpdateTask ? 'disabled' : ''}><option value="">保持原状态</option>${Object.entries(STATUS).map(([v, label]) => `<option value="${v}" ${complete && v === 'done' ? 'selected' : ''}>${label}</option>`).join('')}</select></label><p class="muted small">保存日期 ${currentDate()}（北京时间）。记录会参与每周总结。</p>`}`, `${cancelButton()}<button class="btn btn-primary" type="submit">${icon('check')}保存进展${complete ? '并完成' : ''}</button>`, 'entry', true);
}
function openTask(taskId) {
  const task = repo.state.tasks.find(t => t.id === taskId); if (!task) return;
  const progress = taskProgress(repo.state, taskId), children = childrenFor(repo.state, taskId);
  ui.modal = { kind: 'task', taskId };
  const followUp = !children.length && task.status !== 'done' ? `<div class="task-follow-up"><span>下次跟进 ${shortDate(task.followUpOn)}</span>${btn('设置跟进日期', 'task-follow-up', `data-id="${esc(task.id)}"`, 'btn btn-small')}</div>` : '';
  const source = task.source;
  const map = repo.state.mindMaps?.find(item => item.id === source?.mapId);
  const from = source?.entryId ? btn('查看来源记录', 'view-entry', `data-id="${esc(source.entryId)}"`, 'text-btn')
    : map?.nodes.some(node => node.id === source?.nodeId) ? btn('打开来源导图', 'open-source-map', `data-id="${esc(task.id)}"`, 'text-btn') : '';
  const provenance = source ? `<div class="task-source">${icon('link')}<span>${esc(source.label || '来自进展记录')}</span>${from}</div>` : '';
  dialog(children.length ? '事项与子行动' : '行动详情', `<div class="inline-labels">${projectTag(projectById(repo.state, task.projectId))}${pill(STATUS[progress.status], progress.status === 'waiting' ? 'orange' : 'green')}${priorityControl(task)}</div><h3 class="task-detail-title">${esc(task.title)}</h3>${parentBreadcrumb(task)}<p class="preserve">${esc(task.note || '暂无补充说明。')}</p>${provenance}<div class="detail-meta"><span>${icon('clock')}${task.minutes} 分钟</span><span>截止 ${shortDate(task.due)}</span>${task.completedOn ? `<span class="completion-date">✓ 完成于 ${task.completedOn}</span>` : ''}</div>${task.status === 'done' && !children.length && !task.completedOn ? `<div class="notice">这项旧行动没有明确的完成日期。可以根据自己的记录补记，系统不会用截止日期代替。</div>${btn('补记完成日期', 'backfill-date', `data-id="${esc(task.id)}"`, 'btn btn-small')}` : ''}${children.length ? `<div class="notice">${progress.done} / ${progress.total} 个最末级行动已完成。父事项的进度由子项汇总。</div><div class="child-detail-list">${children.map(child => btn(`${esc(child.title)} ${icon('chevron')}`, 'task-detail', `data-id="${esc(child.id)}"`, 'child-detail-link')).join('')}</div>` : '<div class="notice">完成并记录后，这个节点会在行动树中点亮，实际完成日期也会进入日历。</div>'}${followUp}`, `${btn('设置截止日期', 'task-deadline', `data-id="${esc(task.id)}"`)}${task.status !== 'done' || children.length ? btn('拆分子事项', 'split-task', `data-id="${esc(task.id)}"`) : ''}${btn(`${icon('progress')}记进展`, 'new-entry', `data-task="${esc(task.id)}"`, 'btn btn-primary')}`);
}
function openEntry(id) {
  const entry = repo.state.entries.find(e => e.id === id); if (!entry) return;
  ui.modal = { kind: 'view-entry', entryId: id };
  dialog('记录详情与来源', `<div class="inline-labels">${projectTag(projectById(repo.state, entry.projectId))}${pill(entry.userCreated ? '手动记录' : '示例')}<span class="muted small">${shortDate(entry.date)}</span></div><h3 class="task-detail-title">${esc(entry.title)}</h3>${[['成果', entry.outcome], ['阻碍', entry.blocker], ['下一步', entry.next]].filter(([, text]) => text).map(([label, text]) => `<div class="detail-field"><span>${label}</span><p class="preserve">${esc(text)}</p></div>`).join('')}<p class="fine-print">来源 ID：${esc(entry.id)}</p>`, `${btn('关闭', 'close-modal')}${btn('查看所属项目', 'open-project-from-modal', `data-id="${esc(entry.projectId)}"`, 'btn btn-primary')}`);
}
function pickToday() {
  ui.modal = { kind: 'pick' };
  const options = sortByPriority(executableTasks(repo.state).filter(task => task.status !== 'done' && projectById(repo.state, task.projectId).status === 'active'));
  if (!options.length) return dialog('选择今日行动', '<p>暂无可安排的行动。可以在项目中添加行动。</p>', btn('关闭', 'close-modal'));
  dialog('为今天选几件重要的事', `<p class="muted">先选择现在有条件开始的行动。勾选后立即保存。</p><div class="pick-list">${options.map(task => `<label class="pick-item"><input type="checkbox" data-control="pick-task" value="${esc(task.id)}" ${isInToday(task) ? 'checked' : ''} /><span class="pick-copy"><strong>${esc(task.title)}</strong><span class="pick-meta"><small>${esc(projectById(repo.state, task.projectId).name)}</small><small>${task.minutes} 分钟</small><small>${STATUS[task.status]}</small></span></span></label>`).join('')}</div>`, btn('完成选择', 'close-modal', '', 'btn btn-primary'), '', true);
  modalRoot.querySelector('dialog').classList.add('pick-dialog');
}
function newTask(parentId = '', defaultProject = ui.projectId) {
  const parent = repo.state.tasks.find(task => task.id === parentId), projectId = parent?.projectId || defaultProject;
  const depth = parent ? ancestorsFor(repo.state, parent.id).length + 1 : 0;
  ui.modal = { kind: 'new-task', parentId: parent?.id || '' };
  dialog(parent ? '把大事项拆成下一步' : '新增一项可执行行动', `${parent ? `<div class="parent-context"><span>上级事项 · 新子项位于第 ${depth + 1} 层</span><strong>${esc(parent.title)}</strong></div>${depth >= 3 ? '<div class="notice warning">这次会拆到第 4 层或更深。如果已经清楚怎么开始，建议先执行并记录，再决定是否继续拆分。</div>' : ''}` : ''}<label>所属项目<select name="projectId" data-control="task-project" ${parent ? 'disabled' : ''}>${projectOptions(projectId)}</select></label><label>行动名称 <span class="required">*</span><input name="title" required minlength="2" maxlength="200" placeholder="写成一件具体、可以开始的事" autofocus /></label><label>补充说明<textarea name="note" rows="2" maxlength="3000" placeholder="怎样算完成，或开始前需要什么？"></textarea></label><div class="form-row"><label>紧急程度<select name="priority">${priorityOptions(parent?.priority)}</select></label><label>截止日期<input type="date" name="due" value="${esc(parent?.due || currentDate())}" /></label></div><label>预计分钟<input type="number" name="minutes" value="25" min="0" max="1440" /></label><label class="check-label"><input type="checkbox" name="today" ${parent && isInToday(parent) ? 'checked' : ''} />同时加入今日</label>`, `${cancelButton()}<button type="submit" class="btn btn-primary">${icon('plus')}${parent ? '添加子事项' : '添加行动'}</button>`, 'new-task');
}
function milestoneOptions(projectId) { return '<option value="">独立行动</option>' + repo.state.milestones.filter(m => m.projectId === projectId).map(m => `<option value="${esc(m.id)}">${esc(m.title)}</option>`).join(''); }
function editProject(projectId = ui.projectId) {
  const p = projectById(repo.state, projectId); ui.modal = { kind: 'edit-project', id: p.id };
  dialog('编辑目标与完成标准', `<label>项目目标<textarea name="goal" rows="3" maxlength="2000">${esc(p.goal)}</textarea></label><label>怎样算完成<textarea name="criteria" rows="3" maxlength="2000">${esc(p.criteria)}</textarea></label>`, `${cancelButton()}<button type="submit" class="btn btn-primary">保存目标</button>`, 'edit-project');
}
function projectPicker() {
  ui.modal = { kind: 'projects' };
  dialog('我的项目', projectShortcuts('open-project-from-modal'), projectAddButton());
}
function projectReminderFields(project = {}, required = true) {
  const preference = projectReminder(project);
  return `<div class="reminder-form-fields"><label>提前几天提醒<input type="number" name="reminderDays" min="0" max="${MAX_PROJECT_REMINDER_DAYS}" step="1" value="${preference.days}" ${required ? 'required' : ''} aria-describedby="reminder-days-help" /></label><small id="reminder-days-help" class="muted">填 0 则不提前；截止当天仍提醒。</small><label class="check-label"><input type="checkbox" name="remindOverdue" ${preference.overdue ? 'checked' : ''} />逾期后继续提醒</label></div>`;
}
const projectReminderValues = form => ({ reminderDays: form.elements.reminderDays.value === '' ? undefined : form.elements.reminderDays.valueAsNumber, remindOverdue: form.elements.remindOverdue.checked });
function projectDeadlineDialog() {
  const project = projectById(repo.state, ui.projectId);
  ui.modal = { kind: 'project-deadline', id: project.id };
  dialog('截止与提醒', `<p class="deadline-project-name">${esc(project.name)}</p><label>项目截止日期<input name="targetDate" type="date" value="${esc(project.targetDate)}" /></label>${projectReminderFields(project)}<p class="muted small">未设日期时不提醒。提醒仅在应用打开时显示。</p>`, `${cancelButton()}<button type="submit" class="btn btn-primary">保存提醒</button>`, 'project-deadline');
}
function newProject(ideaId = '') {
  const idea = ideaId ? repo.state.ideas?.find(item => item.id === ideaId) : null;
  if (ideaId && (!idea || idea.projectId)) return;
  const draftName = (idea?.title || idea?.body.split(/\r?\n/, 1)[0] || '').slice(0, 80).replace(/[\uD800-\uDBFF]$/, '');
  const description = idea ? `<label><span id="idea-project-description-label">项目说明</span><textarea name="description" aria-labelledby="idea-project-description-label" maxlength="10000" rows="4">${esc(idea.body)}</textarea></label>` : '';
  ui.modal = { kind: 'new-project', ideaId };
  dialog(idea ? '把便签转为项目' : '新增项目', `<label>项目名称 <span class="required">*</span><input name="name" value="${esc(draftName)}" required maxlength="80" placeholder="例如：完成本月研究计划" autofocus /></label>${description}<label>项目目标（选填）<textarea name="goal" maxlength="2000" rows="2"></textarea></label><label>怎样算完成（选填）<textarea name="criteria" maxlength="2000" rows="2"></textarea></label><div class="form-row"><label>分类<select name="category"><option value="">个人项目（默认）</option><option>研究探索</option><option>课程学习</option><option>工作计划</option><option>生活安排</option></select></label><label>项目截止日期<input type="date" name="targetDate" /></label></div><details class="reminder-options"><summary>提醒设置</summary>${projectReminderFields({}, false)}</details><label>首个行动（可选）<input name="firstAction" maxlength="200" /></label><label class="check-label"><input type="checkbox" name="today" />将首个行动加入今日</label>`, `${cancelButton()}<button type="submit" class="btn btn-primary">创建项目</button>`, 'new-project', true);
}
function completeProjectDialog() {
  const project = projectById(repo.state, ui.projectId), stats = metrics(repo.state, project.id);
  ui.modal = { kind: 'complete-project', id: project.id };
  dialog('核对目标，完成项目', `<h3>${esc(project.name)}</h3>${project.criteria ? `<div class="detail-field"><span>项目完成标准</span><p>${esc(project.criteria)}</p></div>` : ''}<p>当前 ${stats.done}/${stats.tasks} 项最末级行动已完成。</p><label class="check-label"><input type="checkbox" required name="confirmed" />我确认这个项目已完成。</label><p class="muted small">实际完成日期记录为 ${currentDate()}，可在日历中查看。</p>`, `${cancelButton()}<button type="submit" class="btn btn-primary">确认完成项目</button>`, 'complete-project');
}
function completionDateDialog(id) {
  const task = repo.state.tasks.find(task => task.id === id); if (!task) return;
  ui.modal = { kind: 'completion-date', id };
  dialog('补记实际完成日期', `<h3>${esc(task.title)}</h3><p>请依据自己的记录选择实际完成日期。补记后会明确标识为手动补记。</p><label>实际完成日期<input type="date" name="date" max="${currentDate()}" required /></label>`, `${cancelButton()}<button type="submit" class="btn btn-primary">保存完成日期</button>`, 'completion-date');
}
function taskDeadlineDialog(id) {
  const task = repo.state.tasks.find(task => task.id === id); if (!task) return;
  ui.modal = { kind: 'task-deadline', id };
  dialog('调整截止日期', `<h3>${esc(task.title)}</h3><label>截止日期<input type="date" name="date" value="${esc(task.due)}" /></label><p>留空表示未设置截止日期。调整不会改变已有的实际完成记录。</p>`, `${cancelButton()}<button type="submit" class="btn btn-primary">保存截止日期</button>`, 'task-deadline');
}
function taskFollowUpDialog(id) {
  const task = repo.state.tasks.find(item => item.id === id);
  if (!task || task.status === 'done' || !isLeafTask(repo.state, id)) return;
  ui.modal = { kind: 'task-follow-up', id };
  dialog('设置跟进日期', `<h3>${esc(task.title)}</h3><label>下次跟进日期<input type="date" name="followUpOn" value="${esc(task.followUpOn)}" autofocus /></label><p class="muted small">留空可清除跟进日期。</p>`, `${cancelButton()}<button type="submit" class="btn btn-primary">保存跟进日期</button>`, 'task-follow-up');
}
function milestoneDialog(id) {
  const m = repo.state.milestones.find(m => m.id === id); if (!m) return;
  ui.modal = { kind: 'milestone', id };
  dialog(m.done ? '撤销这个里程碑的验收？' : '核对里程碑成果', `<h3>${esc(m.title)}</h3><div class="detail-field"><span>验收条件</span><p>${esc(m.criteria)}</p></div><label class="check-label"><input type="checkbox" required name="confirmed" />${m.done ? '确认重新开放该里程碑，保留已有任务与记录。' : '我已核对成果，确认满足以上条件。'}</label>`, `${cancelButton()}<button type="submit" class="btn btn-primary">${m.done ? '确认撤销' : '确认验收'}</button>`, 'milestone');
}
function previewAdjustment(id) {
  const review = repo.state.reviews.find(r => r.id === id);
  if (!review || reviewIsStale(repo.state, review)) return toast('请先重新生成复盘。');
  const chosen = review.suggestions.filter(s => s.selected && s.status === 'pending');
  if (!chosen.length) return toast('先选择至少一项建议。');
  const source = chosen.length === 1 && repo.state.entries.find(entry => entry.id === chosen[0].sourceEntryId);
  const reason = source ? `根据「${source.title}」记录里的下一步安排。` : review.strategy;
  ui.modal = { kind: 'adjustment', id };
  dialog('预览计划调整', `<div class="notice">本次会新增 ${chosen.length} 项行动。你可以先修改名称和安排。</div><div class="adjustment-list">${chosen.map(s => `<fieldset data-suggestion-id="${esc(s.id)}"><legend>新增行动</legend><label>行动名称<input name="title-${esc(s.id)}" value="${esc(s.title)}" required minlength="2" maxlength="200" /></label><label>行动说明<textarea name="note-${esc(s.id)}" rows="2" maxlength="3000">${esc(s.note)}</textarea></label><div class="form-row"><label>目标日期<input type="date" name="due-${esc(s.id)}" value="${esc(s.due)}" /></label><label class="check-label align-bottom"><input type="checkbox" name="today-${esc(s.id)}" />同时加入今日</label></div></fieldset>`).join('')}</div><label>这次为什么调整<textarea name="reason" rows="2" maxlength="2000">${esc(reason)}</textarea></label>`, `${cancelButton()}<button type="submit" class="btn btn-primary">${icon('check')}确认采纳并保存</button>`, 'adjustment', true);
}
function revisionDialog(id) {
  const r = repo.state.revisions.find(r => r.id === id); if (!r) return;
  ui.modal = { kind: 'revision', id };
  dialog('这次计划改变了什么', `<div class="inline-labels">${pill('已保存', 'green')}<span class="muted small">数据修订 ${r.from} → ${r.to}</span></div><div class="detail-field"><span>调整理由</span><p>${esc(r.reason)}</p></div><div class="diff-list">${r.changes.map(c => `<div><span class="diff-plus">+</span><div><strong>${esc(c.title)}</strong><small>新增待办 · ${shortDate(c.due)}${c.today ? ' · 加入今日' : ''}</small></div></div>`).join('')}</div><p class="muted small">原有行动和进度记录已保留。</p>`, `${btn('关闭', 'close-modal')}${btn('查看项目行动', 'open-project-from-modal', `data-id="${esc(r.projectId)}"`, 'btn btn-primary')}`);
}
function feedbackDialog() {
  ui.modal = { kind: 'feedback' };
  dialog('记录这次体验中的想法', `<p class="muted">哪里顺手，哪里卡住，或希望换一种方式？保存后可复制给我，作为下一轮调整的依据。</p><label>反馈类型<select name="category"><option>使用流程</option><option>页面与信息</option><option>视觉与交互</option><option>想增加的功能</option></select></label><label>具体想法 <span class="required">*</span><textarea name="text" rows="5" required minlength="2" maxlength="3000" placeholder="例如：记进展时，我更希望先选择成果，再关联行动。" autofocus></textarea></label><p class="fine-print">${desktop ? '保存在本机工作空间。' : '保存在当前浏览器，可在“数据与体验”中复制。'}</p>`, `${cancelButton()}<button type="submit" class="btn btn-primary">保存体验反馈</button>`, 'feedback');
}
function workbenchSettings() {
  ui.modal = { kind: 'workbench' };
  const widgets = [['showCapacity', '今日容量'], ['showFollowUp', '待跟进'], ['showRhythm', '近七天记录节奏'], ['showCloseout', '收工清单']];
  dialog('自定义工作台', `<div class="workbench-setting-section"><div><h3>摆放与配色</h3><p>移动卡片、调整尺寸或更换颜色。</p></div>${btn('摆放小组件', 'widget-edit', '', 'btn btn-small')}</div><h3 class="workbench-display-title">显示组件</h3>` + widgets.map(([key, label]) => `<label class="check-label"><input type="checkbox" name="${key}" ${repo.state.settings[key] !== false ? 'checked' : ''} />显示${label}</label>`).join(''), `${cancelButton()}<button type="submit" class="btn btn-primary">保存显示设置</button>`, 'workbench');
}
function capacitySettings() {
  const budget = currentCapacity();
  ui.modal = { kind: 'capacity' };
  const clear = budget === null ? '' : btn('清除时长', 'clear-capacity', '', 'text-btn');
  dialog('设置今日可用时间', `<div class="form-row"><label>小时<input type="number" min="0" max="24" step="1" name="hours" value="${budget === null ? '' : Math.floor(budget / 60)}" autofocus /></label><label>分钟<input type="number" min="0" max="59" step="1" name="minutes" value="${budget === null ? '' : budget % 60}" /></label></div>`, `${clear}${cancelButton()}<button type="submit" class="btn btn-primary">保存可用时间</button>`, 'capacity');
}
function ideaDialog(id = '') {
  const idea = id ? repo.state.ideas?.find(item => item.id === id) : null;
  if (id && !idea) return;
  ui.modal = { kind: 'idea', id };
  const remove = idea ? btn('删除便签', 'delete-idea', `data-id="${esc(id)}"`, 'btn btn-danger-soft') : '';
  dialog(idea ? '编辑便签' : '记下一个想法', `<label>想法<textarea name="body" rows="8" maxlength="10000" required autofocus>${esc(idea?.body)}</textarea></label><label>标题（选填）<input name="title" maxlength="100" value="${esc(idea?.title)}" /></label>`, `${remove}${cancelButton()}<button type="submit" class="btn btn-primary">保存便签</button>`, 'idea', true);
}
function confirmDeleteIdea(id) {
  const idea = repo.state.ideas?.find(item => item.id === id);
  if (!idea) return;
  ui.modal = { kind: 'delete-idea', id };
  const preview = idea.title || idea.body.slice(0, 80);
  dialog('删除这张便签？', `<p class="preserve">${esc(preview)}</p>`, `${cancelButton()}${btn('确认删除', 'confirm-delete-idea', '', 'btn btn-danger')}`);
}
function settingsDialog() {
  if (desktop) {
    const status = repo.status;
    const last = status.lastBackupAt ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(status.lastBackupAt)) : '尚无备份';
    ui.modal = { kind: 'settings' };
    return dialog('数据与备份', `<div class="settings-status"><span class="status-orb"></span><div><strong>项目保存在这台电脑</strong><p class="preserve">${esc(status.dataDir)}</p></div>${pill('Windows 便携版')}</div>
      <section class="settings-section"><h3>本机备份</h3><p>最近备份：${esc(last)}。每天首次使用时备份已有数据，保留最近 14 份每日副本。</p>${status.backupWarning ? `<div class="notice warning">${esc(status.backupWarning)}</div>` : ''}<div class="button-row">${btn('立即备份', 'desktop-backup', '', 'btn btn-primary')}${btn('打开备份文件夹', 'open-backups')}${btn('导出到其他位置', 'export-data')}</div></section>
      <section class="settings-section"><h3>迁移与恢复</h3><p>可导入浏览器原型或 Windows 版导出的 JSON。确认替换前会自动保存桌面版现有数据。</p><div class="button-row">${btn('导入 JSON 备份', 'choose-import')}${btn('清空工作空间', 'confirm-reset', '', 'btn btn-danger-soft')}<input type="file" id="import-file" accept="application/json,.json" hidden /></div></section>`, btn('完成', 'close-modal', '', 'btn btn-primary'), '', true);
  }
  ui.modal = { kind: 'settings' };
  dialog('数据与体验', `<div class="settings-status"><span class="status-orb"></span><div><strong>${repo.writable ? '体验数据保存在当前浏览器' : '当前为临时会话模式'}</strong><p>${repo.writable ? '刷新后可继续体验；清除浏览器数据会移除本机副本。' : esc(repo.loadError)}</p></div>${pill('浏览器预览')}</div><div class="notice">当前为浏览器交互原型，尚未使用正式 SQLite 数据库；AI 反馈为本地规则演示，没有连接模型、插件或外部账户。</div><section class="settings-section"><h3>保存与恢复</h3><p>导出包含项目、记录、复盘、调整历史和体验反馈。导入会替换本浏览器的原型数据。</p><div class="button-row">${btn(`${icon('download')}导出体验备份`, 'export-data')}${btn(`${icon('upload')}导入备份`, 'choose-import')}<input type="file" id="import-file" accept="application/json,.json" hidden /></div></section><section class="settings-section"><h3>清空工作空间</h3><div class="button-row">${btn('清空工作空间', 'confirm-reset', '', 'btn btn-danger-soft')}</div></section><section class="settings-section"><div class="section-heading"><h3>我的体验反馈 <span class="muted">${repo.state.feedback.length}</span></h3>${btn('写反馈', 'feedback', '', 'text-btn')}</div>${repo.state.feedback.length ? `<div class="feedback-list">${repo.state.feedback.toReversed().map(f => `<div><span class="pill">${esc(f.category)}</span><p>${esc(f.text)}</p></div>`).join('')}</div>${btn('复制全部反馈', 'copy-feedback', '', 'btn btn-small')}` : '<p class="muted">还没有保存反馈。体验后可以随时记录。</p>'}</section>`, btn('完成', 'close-modal', '', 'btn btn-primary'), '', true);
}
function confirmReset() {
  ui.modal = { kind: 'reset', revision: repo.revision };
  dialog('清空工作空间？', desktop ? '<p>将清空当前项目、行动、进展、便签和导图。Cockpit 会先保留一份本机备份。</p>' : '<p>将清空当前浏览器中的工作空间。可以先导出备份。</p>', `${btn('先导出备份', 'export-data')}${cancelButton()}${btn('确认重置', 'reset-data', '', 'btn btn-danger')}`);
}
async function exportData() {
  if (desktop) {
    try { if (await desktop.exportBackup()) toast('备份已导出。'); }
    catch (error) { toast(error.message); }
    return;
  }
  const blob = new Blob([JSON.stringify({ format: 'xingjin-prototype-backup', version: 3, exportedAt: new Date().toISOString(), workspace: repo.state }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `Cockpit_体验备份_${currentDate()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('已导出体验备份。');
}
document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]'); if (!target || target.disabled) return;
  const { action, id, page, task, tab } = target.dataset;
  const pane = target.closest('.tree-pane');
  const treeProject = pane?.dataset.treeProject || ui.projectId;
  if (action === 'nav') {
    ui.sidebarExpanded = false;
    if (page === 'tree') { ui.treeMode = 'map'; ui.graphCenterRequested = true; }
    if (page === 'mind') { ui.mindLinkFrom = ''; ui.mindFocus = currentMindMap()?.nodes[0].id || ''; }
    return go(page);
  }
  if (action === 'sidebar-toggle') { ui.sidebarExpanded = !ui.sidebarExpanded; render(); return; }
  if (action === 'widget-view') { ui.widgetLayoutView = !ui.widgetLayoutView; render(); return; }
  if (action === 'widget-edit') {
    if (ui.modal?.kind === 'workbench') closeModal();
    ui.widgetEditing = !ui.widgetEditing;
    render();
    app.querySelector(ui.widgetEditing ? '[data-action="widget-edit"]' : '[data-action="workbench-settings"]')?.focus({ preventScroll: true });
    return;
  }
  if (action === 'widget-box') {
    const box = widgetBoard(repo.state)[id];
    ui.modal = { id };
    const field = (label, name, value, min, max) => `<label>${label}<input type="number" name="${name}" min="${min}" max="${max}" value="${value}" required></label>`;
    return dialog(`摆放 · ${widgetNames[id]}`, `<div class="form-row">${field('起始列', 'x', box.x + 1, 1, WIDGET_BOARD.columns)}${field('起始行', 'y', box.y + 1, 1, WIDGET_BOARD.rows)}</div><div class="form-row">${field('宽度（格）', 'w', box.w, 1, WIDGET_BOARD.columns)}${field('高度（格）', 'h', box.h, WIDGET_BOARD.minHeight, WIDGET_BOARD.maxHeight)}</div>`, cancelButton() + '<button type="submit" class="btn btn-primary">保存位置</button>', 'widget-box');
  }
  if (action === 'mind-new') {
    ui.modal = { kind: 'mind-new' };
    return dialog('新建导图', '<label>导图名称<input name="title" required maxlength="100" placeholder="输入中心主题" autofocus></label>',
      `${cancelButton()}<button type="submit" class="btn btn-primary">创建导图</button>`, 'mind-new');
  }
  if (action === 'mind-inline-cancel') return target.closest('form').remove();
  if (action === 'mind-add') return mindNodeDialog();
  if (action === 'mind-add-literature') return mindNodeDialog('', '', null, 'literature');
  if (action === 'mind-group') {
    if (ui.mindMulti.size < 2) return;
    ui.modal = { mapId: currentMindMap().id, nodes: [...ui.mindMulti] };
    return dialog('新建分组', '<label>分组名称<input name="title" required maxlength="80" autofocus></label>',
      cancelButton() + '<button type="submit" class="btn btn-primary">建立分组</button>', 'mind-group');
  }
  if (action === 'mind-ungroup') {
    const mapId = currentMindMap().id;
    return commit(state => removeMindGroup(state, mapId, id), '已解除分组。');
  }
  if (action === 'mind-branch') return mindNodeDialog('', id);
  if (action === 'mind-edit') return mindNodeDialog(id);
  if (action === 'mind-convert') {
    const map = currentMindMap(), node = map.nodes.find(item => item.id === id);
    const existing = mindAction(map.id, id);
    if (existing) return openTask(existing.id);
    if (!node || !canConvertMindNode(map, node)) return;
    const projects = repo.state.projects.filter(project => project.status === 'active');
    if (!projects.length) return toast('请先创建或恢复一个进行中的项目。');
    ui.modal = { kind: 'mind-convert', mapId: map.id, nodeId: id };
    return dialog('转为项目行动', `<label>所属项目<select name="projectId">${projects.map(project => `<option value="${esc(project.id)}" ${project.id === ui.projectId ? 'selected' : ''}>${esc(project.name)}</option>`).join('')}</select></label>
      <label>行动名称<input name="title" required minlength="2" maxlength="200" value="${esc(node.title)}" autofocus></label>
      <label>补充说明<textarea name="note" rows="3" maxlength="4000">${esc(node.note)}</textarea></label>`,
      cancelButton() + '<button type="submit" class="btn btn-primary">加入项目待办</button>', 'mind-convert');
  }
  if (action === 'mind-connect') { ui.mindLinkFrom = ui.mindLinkFrom ? '' : id; render(); return; }
  if (action === 'mind-select') {
    const from = ui.mindLinkFrom;
    if (from === id) { toast('请选择另一个节点。'); return; }
    if (event.shiftKey && !from) {
      const previous = ui.mindSelected || currentMindMap().nodes[0].id;
      if (!ui.mindMulti.size && previous !== id) ui.mindMulti.add(previous);
      if (ui.mindMulti.has(id)) ui.mindMulti.delete(id);
      else ui.mindMulti.add(id);
    } else ui.mindMulti.clear();
    ui.mindSelected = ui.mindMulti.size && !ui.mindMulti.has(id) ? [...ui.mindMulti].at(-1) : id;
    ui.mindLinkFrom = '';
    if (from) {
      const mapId = currentMindMap().id;
      const linked = await commit(state => { linkMindNodes(state, mapId, from, id); return true; }, '连线已保存。');
      if (!linked) render();
      return;
    }
    syncMindSelection(ui.mindSelected);
    return;
  }
  if (action === 'mind-links') return mindLinksDialog(id);
  if (action === 'mind-link-label') {
    const map = currentMindMap(), to = target.dataset.to;
    const link = map.links.find(item => item.from === id && item.to === to);
    ui.modal = { mapId: map.id, from: id, to };
    return dialog('编辑连线说明', `<label>说明<input name="label" maxlength="120" value="${esc(link.label)}" autofocus></label>`, cancelButton() + '<button type="submit" class="btn btn-primary">保存说明</button>', 'mind-link-label');
  }
  if (action === 'mind-unlink') {
    const mapId = currentMindMap().id;
    const removed = await commit(state => { unlinkMindNodes(state, mapId, id, target.dataset.to); return true; }, '已移除连线。');
    if (removed) closeModal();
    return;
  }
  if (action === 'mind-delete-confirm') {
    const node = currentMindMap().nodes.find(item => item.id === id);
    return dialog('删除节点', `<p>删除「${esc(node.title)}」和与它相连的连线？</p>`,
      cancelButton() + btn('删除节点', 'mind-delete', `data-id="${esc(id)}"`, 'btn btn-danger'));
  }
  if (action === 'mind-delete') {
    const mapId = currentMindMap().id;
    const removed = await commit(state => { removeMindNode(state, mapId, id); return true; }, '已删除节点。');
    if (removed) { ui.mindMulti.delete(id); ui.mindLinkFrom = ''; closeModal(); render(); }
    return;
  }
  if (action === 'mind-zoom') return setMindZoom(ui.mindZoom + Number(target.dataset.step));
  if (action === 'mind-fit') return fitMindMap();
  if (action === 'mind-center') { ui.mindFocus = currentMindMap().nodes[0].id; render(); return; }
  if (action === 'global-search') return globalSearchDialog();
  if (action === 'global-search-open') {
    const kind = target.dataset.kind;
    closeModal();
    if (kind === 'project') { ui.tab = 'board'; return go('project', id); }
    if (kind === 'task') return openTask(id);
    if (kind === 'entry') return openEntry(id);
    if (kind === 'idea') return ideaDialog(id);
    return;
  }
  if (action === 'show-projects') return projectPicker();
  if (action === 'new-project') return newProject();
  if (action === 'project-deadline') return projectDeadlineDialog();
  if (action === 'complete-project') return completeProjectDialog();
  if (action === 'backfill-date') return completionDateDialog(id);
  if (action === 'task-deadline') return taskDeadlineDialog(id);
  if (action === 'task-follow-up') return taskFollowUpDialog(id);
  if (action === 'show-deadlines') { ui.modal = { kind: 'deadlines' }; return dialog('截止提醒', deadlinesBody(repo.state, helpers()), btn('查看日历', 'open-calendar-from-modal', '', 'btn btn-primary'), '', true); }
  if (action === 'open-calendar-from-modal') { closeModal(); return go('calendar'); }
  if (action === 'project-calendar') {
    const project = projectById(repo.state, ui.projectId);
    const events = calendarItems(repo.state, project.id).filter(item => item.type === 'project');
    const creation = events.find(item => item.category === 'created' || item.alsoCreated);
    const completion = events.find(item => item.category === 'completed' && item.date === project.completedOn)
      || events.findLast(item => item.category === 'completed');
    const date = project.status === 'completed' ? completion?.date || creation?.date : creation?.date || completion?.date;
    ui.calendarDate = date || (validDate(project.targetDate) ? project.targetDate : currentDate());
    ui.calendarMonth = ui.calendarDate.slice(0, 7);
    ui.calendarProject = project.id; ui.calendarType = 'all';
    return go('calendar');
  }
  if (action === 'workbench-settings') return workbenchSettings();
  if (action === 'toggle-closeout') {
    ui.closeoutExpanded = !ui.closeoutExpanded;
    render();
    app.querySelector('[data-action="toggle-closeout"]')?.focus({ preventScroll: true });
    return;
  }
  if (action === 'closeout-task') {
    const choice = target.dataset.choice;
    const messages = { tomorrow: '已安排明天再做。', todo: '已退回待办。', waiting: '已转为等待。' };
    const changed = await commit(state => closeOutTodayTask(state, id, choice), messages[choice]);
    if (changed) (app.querySelector('.closeout-actions button') || app.querySelector('[data-action="toggle-closeout"]'))?.focus({ preventScroll: true });
    return;
  }
  if (action === 'capacity-settings') return capacitySettings();
  if (action === 'clear-capacity') {
    const cleared = await commit(state => { setDailyCapacity(state, null); return true; }, '已清除今日可用时间。');
    if (cleared && ui.modal?.kind === 'capacity') closeModal();
    return;
  }
  if (action === 'write-idea') return ideaDialog(id);
  if (action === 'convert-idea') return newProject(id);
  if (action === 'open-idea-project') { ui.tab = 'resources'; return go('project', id); }
  if (action === 'delete-idea') return confirmDeleteIdea(id);
  if (action === 'confirm-delete-idea') {
    const ideaId = ui.modal.id;
    const removed = await commit(state => { removeIdea(state, ideaId); return true; }, '便签已删除。');
    if (removed && ui.modal?.kind === 'delete-idea') closeModal();
    return;
  }
  if (action === 'calendar-day') { ui.calendarDate = target.dataset.date; render(); return; }
  if (action === 'calendar-month') { ui.calendarMonth = shiftMonth(ui.calendarMonth, Number(target.dataset.direction)); ui.calendarDate = ui.calendarMonth + '-01'; render(); return; }
  if (action === 'calendar-today') { ui.calendarDate = currentDate(); ui.calendarMonth = currentDate().slice(0, 7); render(); return; }
  if (action === 'review-period') {
    ui.reviewPeriod = target.dataset.period;
    render();
    app.querySelector(`.review-range-card[data-period="${ui.reviewPeriod}"]`)?.focus({ preventScroll: true });
    return;
  }
  if (action === 'review-shift' || action === 'review-current') {
    const direction = Number(target.dataset.direction);
    const date = action === 'review-current' ? currentDate() : ui.reviewPeriod === 'month'
      ? shiftMonth(ui.reviewDate.slice(0, 7), direction) + '-01' : shiftDate(ui.reviewDate, direction * 7);
    setReviewDate(date); render();
    app.querySelector(`[data-action="${action}"]${action === 'review-shift' ? `[data-direction="${direction}"]` : ''}`)?.focus({ preventScroll: true });
    return;
  }
  if (action === 'tree-compare') {
    const other = repo.state.projects.find(p => p.id !== ui.projectId);
    ui.treeCompare = ui.treeCompare ? '' : other?.id || '';
    ui.treeMode = 'map';
    ui.graphCenterRequested = true;
    render();
    return;
  }
  if (action === 'graph-fit' && pane) {
    const viewport = pane.querySelector('.graph-viewport');
    ui.treeScales.set(treeProject, fitTreeGraph(viewport, .3));
    viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
    viewport.scrollTop = 0;
    return;
  }
  if (action === 'graph-compact' && pane) {
    if (!ui.compactTrees.delete(treeProject)) ui.compactTrees.add(treeProject);
    ui.treeScales.delete(treeProject);
    ui.graphCenterRequested = treeProject;
    render();
    return;
  }
  if (pane && ['tree-overview', 'expand-tree', 'toggle-branch'].includes(action)) {
    if (action === 'tree-overview') {
      ui.treeBranches.delete(treeProject);
      ui.treeScales.delete(treeProject);
      ui.graphCenterRequested = treeProject;
    } else if (action === 'expand-tree') {
      ui.treeBranches.set(treeProject, tasksFor(repo.state, treeProject).map(task => task.id));
    } else {
      const expanded = new Set(treeBranchIds(treeProject));
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      ui.treeBranches.set(treeProject, [...expanded]);
    }
    render();
    return;
  }
  if (action === 'graph-zoom' && pane) {
    const scale = Number(pane.querySelector('.graph-viewport').dataset.scale);
    ui.treeScales.set(treeProject, Math.max(.3, Math.min(1.65, scale + Number(target.dataset.step))));
    ui.graphCenterRequested = treeProject;
    render();
    return;
  }
  if (action === 'tree-mode') { ui.treeMode = target.dataset.mode; ui.graphCenterRequested = true; render(); return; }
  if (action === 'graph-zoom') { ui.treeZoom = Math.max(.5, Math.min(1.45, ui.treeZoom + Number(target.dataset.step))); ui.graphCenterRequested = true; render(); return; }
  if (action === 'graph-center') { ui.graphCenterRequested = true; render(); return; }
  if (action === 'generate-weekly') {
    const review = await commit(state => generateReview(state, ui.projectId, { weekStart: ui.weekStart }));
    if (review) { ui.reviewPeriod = 'week'; ui.reviewId = review.id; ui.reviewSnapshotsOpen = true; go('review', ui.projectId); toast('每周复盘已保存。'); } return;
  }
  if (action === 'weekly-detail') { ui.reviewPeriod = 'week'; ui.reviewId = id || ''; ui.reviewSnapshotsOpen = Boolean(id); return go('review', ui.projectId); }
  if (action === 'open-project') { ui.tab = 'board'; return go('project', id); }
  if (action === 'open-project-from-modal') { closeModal(); ui.tab = 'board'; return go('project', id); }
  if (action === 'close-modal') return closeModal();
  if (action === 'new-entry') return newEntry(task);
  if (action === 'complete-task') return newEntry(id, true);
  if (action === 'task-detail') return openTask(id);
  if (action === 'open-source-map') {
    const source = repo.state.tasks.find(item => item.id === id)?.source;
    if (!source) return;
    closeModal();
    ui.mindId = source.mapId;
    ui.mindSelected = ui.mindFocus = source.nodeId;
    ui.mindMulti.clear();
    ui.mindLinkFrom = '';
    ui.mindZoom = 1;
    return go('mind');
  }
  if (action === 'view-entry') return openEntry(id);
  if (action === 'edit-entry') return newEntry('', false, id);
  if (action === 'jump-review-snapshots') {
    const snapshots = app.querySelector('.review-snapshots');
    ui.reviewSnapshotsOpen = true;
    snapshots.open = true;
    const summary = snapshots.querySelector('summary');
    summary.focus({ preventScroll: true });
    summary.scrollIntoView({ block: 'start' });
    return;
  }
  if (action === 'convert-blocker') {
    const created = await commit(state => convertEntryToTask(state, id), '已加入项目待办。');
    if (created) app.querySelector(`.decision-blocker [data-id="${CSS.escape(created.id)}"]`)?.focus({ preventScroll: true });
    return;
  }
  if (action === 'pick-today') return pickToday();
  if (action === 'review-add-today') {
    const added = await commit(state => { setToday(state, id, true); return true; }, '已将这项行动加入今日。');
    if (added) app.querySelector('.decision-focus [data-action="task-detail"]')?.focus({ preventScroll: true });
    return;
  }
  if (action === 'today-task-more') {
    const task = repo.state.tasks.find(item => item.id === id);
    if (!task) return;
    ui.modal = { kind: 'today-task-more' };
    return dialog('行动操作', `<p>${esc(task.title)}</p>`, btn('拆分', 'split-task', `data-id="${esc(id)}"`) +
      btn('从今日移除', 'remove-today', `data-id="${esc(id)}"`));
  }
  if (action === 'remove-today') {
    if (ui.modal?.kind === 'today-task-more') closeModal();
    const changed = await commit(state => { setToday(state, id, false); return true; }, '今日安排已更新。');
    if (changed && document.activeElement === document.body) (app.querySelector('.today-task [data-action="task-detail"]') || app.querySelector('[data-action="pick-today"]'))?.focus();
    return;
  }
  if (action === 'toggle-today') return commit(state => setToday(state, id, !isInToday(state.tasks.find(t => t.id === id))), '今日安排已更新。');
  if (action === 'new-task') return newTask('', treeProject);
  if (action === 'split-task') {
    if (ui.modal?.kind === 'today-task-more') closeModal();
    return newTask(id);
  }
  if (action === 'toggle-branch') return commit(state => { const expanded = new Set(state.settings.expandedTaskIds); if (expanded.has(id)) expanded.delete(id); else expanded.add(id); state.settings.expandedTaskIds = [...expanded]; });
  if (action === 'expand-tree' || action === 'collapse-tree') return commit(state => {
    const expanded = state.settings.expandedTaskIds.filter(id => state.tasks.find(t => t.id === id)?.projectId !== treeProject);
    if (action === 'expand-tree') expanded.push(...state.tasks.filter(t => t.projectId === treeProject && !isLeafTask(state, t.id)).map(t => t.id));
    state.settings.expandedTaskIds = expanded;
  });
  if (action === 'open-tree') {
    const task = repo.state.tasks.find(t => t.id === id);
    if (!task) return;
    closeModal();
    await commit(state => expandTaskAncestors(state, id));
    ui.tab = 'tree'; ui.treeMode = 'map'; ui.graphCenterRequested = true;
    return go('project', task.projectId);
  }
  if (action === 'project-tab') {
    ui.tab = tab;
    if (target.getAttribute('role') === 'tab') target.focus({ preventScroll: true });
    if (tab === 'tree') { ui.treeMode = 'map'; ui.graphCenterRequested = true; }
    render();
    if (target.dataset.jump === 'tree') {
      const graph = app.querySelector('.graph-viewport');
      graph?.focus({ preventScroll: true });
      app.querySelector('.project-toolbar')?.scrollIntoView({ block: 'start' });
    }
    return;
  }
  if (action === 'project-review') { ui.reviewId = ''; return go('review', ui.projectId); }
  if (action === 'project-progress') { ui.filterProject = ui.projectId; return go('progress'); }
  if (action === 'edit-project') return editProject(treeProject);
  if (action === 'milestone') return milestoneDialog(id);
  if (action === 'toggle-project') return commit(state => { const p = projectById(state, ui.projectId); setProjectStatus(state, p.id, p.status === 'active' ? 'paused' : 'active'); }, '项目状态已更新。暂停项目的行动不会出现在今日。');
  if (action === 'generate-review') {
    const review = await commit(state => generateReview(state, ui.projectId, { weekStart: ui.weekStart }));
    if (review) { ui.reviewId = review.id; render(); toast('已保存所选周的复盘。'); } return;
  }
  if (action === 'preview-adjustment') return previewAdjustment(id);
  if (action === 'dismiss-suggestions') return commit(state => { const r = state.reviews.find(r => r.id === id); r.suggestions.filter(s => s.status === 'pending').forEach(s => s.status = 'dismissed'); r.status = r.suggestions.some(s => s.status === 'applied') ? 'partial' : 'dismissed'; }, '已保留本次复盘，其余建议暂不采纳。');
  if (action === 'view-revision') return revisionDialog(id);
  if (action === 'open-review') {
    const review = repo.state.reviews.find(r => r.id === id);
    if (validDate(review?.weekStart)) setReviewDate(review.weekStart);
    ui.reviewPeriod = 'week'; ui.reviewId = id;
    render(); return;
  }
  if (action === 'settings') return settingsDialog();
  if (action === 'feedback') return feedbackDialog();
  if (action === 'export-data') return exportData();
  if (action === 'desktop-backup' && desktop) {
    try { await repo.backup(); if (ui.modal?.kind === 'settings') settingsDialog(); toast('备份已保存。'); }
    catch (error) { toast(error.message); }
    return;
  }
  if (action === 'open-backups' && desktop) {
    try { await desktop.openBackups(); } catch (error) { toast(error.message); }
    return;
  }
  if (action === 'choose-import') return document.querySelector('#import-file').click();
  if (action === 'confirm-reset') return confirmReset();
  if (action === 'reset-data') { try { await repo.reset(ui.modal.revision); ui.projectId = repo.state.projects[0]?.id || ''; ui.reviewId = ''; ui.filterProject = 'all'; ui.search = ''; closeModal(); go('today'); render(); toast('工作空间已清空。'); } catch (error) { toast(desktop ? error.message : '无法写入浏览器存储，重置未生效。'); } return; }
  if (action === 'confirm-import') {
    try { if (desktop) await repo.restore(ui.modal.raw, ui.modal.revision); else repo.replace(ui.modal.workspace); ui.projectId = repo.state.projects[0]?.id || ''; ui.reviewId = ''; ui.filterProject = 'all'; ui.search = ''; closeModal(); go('today'); render(); toast('备份已恢复。'); } catch (err) { toast(err.message); } return;
  }
  if (action === 'copy-feedback') {
    const text = repo.state.feedback.map(f => `[${f.category} / ${f.page}]\n${f.text}`).join('\n\n');
    try { await navigator.clipboard.writeText(text); toast('反馈已复制，可以粘贴到聊天中。'); }
    catch { ui.modal = { kind: 'copy-feedback' }; dialog('复制体验反馈', `<textarea rows="8" aria-label="体验反馈文本" readonly>${esc(text)}</textarea><p class="muted small">可以选中以上文本，复制后发到聊天。</p>`, btn('完成', 'close-modal', '', 'btn btn-primary')); } return;
  }
});

document.addEventListener('change', async event => {
  const target = event.target, control = target.dataset.control;
  if (control === 'widget-color') return commit(state => setWidgetColor(state, target.dataset.id, target.value), '小组件颜色已保存。');
  if (control === 'tree-project') {
    if (target.value === ui.treeCompare) ui.treeCompare = ui.projectId;
    ui.graphCenterRequested = true;
    return go('tree', target.value);
  }
  if (control === 'tree-compare-project') { ui.treeCompare = target.value; render(); return; }
  if (control === 'mind-map') {
    ui.mindId = target.value;
    ui.mindSelected = '';
    ui.mindMulti.clear();
    ui.mindLinkFrom = '';
    ui.mindZoom = 1;
    ui.mindFocus = currentMindMap().nodes[0].id;
    render();
    return;
  }
  if (control === 'review-project') { ui.reviewId = ''; return go('review', target.value); }
  if (control === 'calendar-project') { ui.calendarProject = target.value; render(); return; }
  if (control === 'calendar-type') { ui.calendarType = target.value; render(); return; }
  if (control === 'calendar-date' && validDate(target.value)) { ui.calendarDate = target.value; ui.calendarMonth = target.value.slice(0, 7); render(); return; }
  if (['week-start', 'review-date'].includes(control) && validDate(target.value)) { setReviewDate(target.value); render(); return; }
  if (control === 'task-status') return commit(state => setTaskStatus(state, target.dataset.id, target.value), '行动状态已更新。');
  if (control === 'task-priority') {
    const taskId = target.dataset.id, priority = target.value;
    await commit(state => setTaskPriority(state, taskId, priority), `已改为${PRIORITY[priority].label}，卡片颜色与排序已更新。`);
    if (ui.modal?.kind === 'task') openTask(taskId);
    return;
  }
  if (control === 'filter-project') { ui.filterProject = target.value; render(); return; }
  if (control === 'filter-kind') { ui.filterKind = target.value; render(); return; }
  if (control === 'pick-task') return commit(state => setToday(state, target.value, target.checked));
  if (control === 'entry-project') {
    const form = target.form; form.elements.taskId.innerHTML = taskOptions(target.value, ''); form.elements.taskStatus.disabled = true; form.elements.taskStatus.value = ''; return;
  }
  if (control === 'entry-task') { target.form.elements.taskStatus.disabled = !target.value || !isLeafTask(repo.state, target.value); if (target.form.elements.taskStatus.disabled) target.form.elements.taskStatus.value = ''; return; }
  if (control === 'task-project') return;
  if (control === 'suggestion') {
    ui.reviewId = currentReview().id;
    return commit(state => { const r = state.reviews.find(r => r.id === ui.reviewId); r.suggestions.find(s => s.id === target.dataset.id).selected = target.checked; });
  }
  if (target.id === 'import-file') {
    const file = target.files?.[0]; if (!file) return;
    try {
      if (desktop) {
        const revision = repo.revision;
        if (file.size > 16 * 1024 * 1024) throw new Error('备份超过 16 MB。');
        const raw = await file.text(), workspace = await desktop.inspectBackup(raw);
        if (!target.isConnected) return;
        ui.modal = { kind: 'import', raw, revision };
        return dialog('核对要导入的备份', `<p class="preserve">${esc(file.name)}</p><p>备份包含 <strong>${workspace.projects.length}</strong> 个项目、<strong>${workspace.tasks.length}</strong> 项行动、<strong>${workspace.entries.length}</strong> 条进展、<strong>${workspace.reviews.length}</strong> 次复盘和 <strong>${workspace.ideas?.length || 0}</strong> 张随手记便签。</p><div class="notice warning">确认后将替换当前桌面工作空间。系统会先保存一份当前桌面备份；浏览器原型里的数据仍保留。</div>`, `${cancelButton()}${btn('确认恢复备份', 'confirm-import', '', 'btn btn-primary')}`);
      }
      if (file.size > 4 * 1024 * 1024) throw new Error('备份超过 4 MB，原型暂不支持。');
      const backup = JSON.parse(await file.text());
      if (backup.format !== 'xingjin-prototype-backup' || ![1, 2, 3].includes(backup.version)) throw new Error('不是Cockpit原型的备份文件。');
      const workspace = validateWorkspace(backup.workspace);
      ui.modal = { kind: 'import', workspace };
      dialog('确认恢复这份备份？', `<p>已检查数据格式和关联。本备份包含 ${workspace.projects.length} 个项目、${workspace.entries.length} 条记录和 ${workspace.feedback.length} 条体验反馈。</p><div class="notice warning">恢复会替换当前浏览器的全部原型数据。可以先导出当前体验。</div>`, `${btn('先导出当前数据', 'export-data')}${cancelButton()}${btn('确认恢复备份', 'confirm-import', '', 'btn btn-primary')}`);
    } catch (err) { toast(err.message || '无法读取备份，现有数据未改变。'); target.value = ''; }
  }
});
document.addEventListener('input', event => {
  if (event.target.dataset.control === 'global-search' && !event.isComposing) renderSearchResults(event.target.value);
  if (event.target.dataset.control === 'search') {
    ui.search = event.target.value;
    const start = event.target.selectionStart; render();
    const input = document.querySelector('[data-control="search"]'); input.focus(); input.setSelectionRange?.(start, start);
  }
});
document.addEventListener('compositionend', event => {
  if (event.target.dataset.control === 'global-search') renderSearchResults(event.target.value);
});
document.addEventListener('keydown', event => {
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === 'Escape' && ui.sidebarExpanded && !ui.modal) {
    ui.sidebarExpanded = false;
    render();
    app.querySelector('[data-action="sidebar-toggle"]')?.focus({ preventScroll: true });
    return;
  }
  if (event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
    if (ui.modal && ui.modal.kind !== 'global-search') return;
    event.preventDefault();
    if (ui.modal) modalRoot.querySelector('#global-search-input')?.focus(); else globalSearchDialog();
    return;
  }
  const projectTab = event.target.closest('[role="tab"][data-action="project-tab"]');
  if (projectTab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    const tabs = [...projectTab.parentElement.querySelectorAll('[role="tab"]')];
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 :
      (tabs.indexOf(projectTab) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    tabs[index].click();
    return;
  }
  if (ui.modal?.kind !== 'global-search') return;
  const input = modalRoot.querySelector('#global-search-input');
  const results = [...modalRoot.querySelectorAll('.global-search-result')];
  if (!results.length) return;
  if (event.key === 'Enter' && event.target === input) {
    event.preventDefault(); results[0].click();
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    const targets = [input, ...results], index = targets.indexOf(event.target);
    if (index < 0) return;
    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    targets[Math.max(0, Math.min(index + direction, targets.length - 1))].focus();
  }
});
document.addEventListener('submit', async event => {
  const form = event.target.closest('[data-form]'); if (!form) return; event.preventDefault();
  if (form.dataset.saving) return;
  form.dataset.saving = 'true';
  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  const values = Object.fromEntries(new FormData(form)); let result;
  const errorEl = form.querySelector('.form-error');
  try {
    const kind = form.dataset.form;
    const sourceIdeaId = kind === 'new-project' ? ui.modal.ideaId : '';
    if (kind === 'mind-new') {
      result = await repo.commit(state => createMindMap(state, values.title));
      ui.mindId = result.id;
      ui.mindMulti.clear();
      ui.mindSelected = result.nodes[0].id;
      ui.mindFocus = ui.mindSelected;
      ui.mindLinkFrom = '';
      ui.mindZoom = 1;
    }
    if (kind === 'widget-box') {
      const id = ui.modal.id;
      result = await repo.commit(state => { placeWidget(state, id, { x: Number(values.x) - 1, y: Number(values.y) - 1, w: Number(values.w), h: Number(values.h) }); return true; });
    }
    if (kind === 'mind-group') {
      const { mapId, nodes } = ui.modal;
      result = await repo.commit(state => { saveMindGroup(state, mapId, values.title, nodes); return true; });
    }
    if (kind === 'mind-link-label') {
      const { mapId, from, to } = ui.modal;
      result = await repo.commit(state => { labelMindLink(state, mapId, from, to, values.label); return true; });
    }
    if (kind === 'mind-inline') {
      const mapId = currentMindMap().id, id = form.closest('.mind-node').dataset.mindNode;
      const node = currentMindMap().nodes.find(item => item.id === id);
      result = await repo.commit(state => saveMindNode(state, mapId, { ...values, color: node.color }, id));
      ui.mindSelected = id;
    }
    if (kind === 'mind-node') {
      const { mapId, id, parentId, position } = ui.modal;
      result = await repo.commit(state => saveMindNode(state, mapId, { ...values, ...position }, id, parentId));
      ui.mindSelected = result.id;
      ui.mindFocus = result.id;
      ui.mindLinkFrom = '';
    }
    if (kind === 'mind-convert') {
      const { mapId, nodeId } = ui.modal;
      result = await repo.commit(state => convertMindNodeToTask(state, mapId, nodeId, values));
    }
    if (kind === 'workbench') result = await repo.commit(state => {
      state.settings.showRhythm = values.showRhythm === 'on';
      state.settings.showCapacity = values.showCapacity === 'on';
      state.settings.showFollowUp = values.showFollowUp === 'on';
      state.settings.showCloseout = values.showCloseout === 'on';
      return true;
    });
    if (kind === 'capacity') result = await repo.commit(state => {
      if (!values.hours && !values.minutes) throw new Error('请填写小时或分钟。');
      setDailyCapacity(state, Number(values.hours) * 60 + Number(values.minutes));
      return true;
    });
    if (kind === 'idea') {
      const ideaId = ui.modal.id;
      result = await repo.commit(state => saveIdea(state, values, ideaId));
    }
    if (kind === 'new-project') {
      const input = { ...values, ...projectReminderValues(form), today: values.today === 'on' };
      result = await repo.commit(state => sourceIdeaId ? createProjectFromIdea(state, sourceIdeaId, input) : addProject(state, input));
    }
    if (kind === 'project-deadline') result = await repo.commit(state => { updateProjectDeadline(state, ui.modal.id, { ...values, ...projectReminderValues(form) }); return true; });
    if (kind === 'complete-project') result = await repo.commit(state => { setProjectStatus(state, ui.modal.id, 'completed'); return true; });
    if (kind === 'completion-date') result = await repo.commit(state => { backfillCompletionDate(state, ui.modal.id, values.date); return true; });
    if (kind === 'task-deadline') result = await repo.commit(state => { updateTaskDeadline(state, ui.modal.id, values.date); return true; });
    if (kind === 'task-follow-up') {
      const taskId = ui.modal.id;
      result = await repo.commit(state => { setTaskFollowUp(state, taskId, values.followUpOn); return true; });
    }
    if (kind === 'entry') {
      const entryId = ui.modal.entryId;
      result = await repo.commit(state => entryId ? updateEntry(state, entryId, values) : addEntry(state, values));
    }
    if (kind === 'new-task') result = await repo.commit(state => {
      const parent = state.tasks.find(task => task.id === ui.modal.parentId);
      const created = addTask(state, { ...values, projectId: parent?.projectId || values.projectId, parentId: parent?.id || '', today: values.today === 'on' });
      if (parent) { expandTaskAncestors(state, created.id); ui.projectId = created.projectId; ui.tab = 'tree'; ui.treeMode = 'map'; ui.graphCenterRequested = true; }
      return created;
    });
    if (kind === 'edit-project') result = await repo.commit(state => { updateProject(state, { ...values, id: ui.modal.id }); return true; });
    if (kind === 'milestone') result = await repo.commit(state => { const m = state.milestones.find(m => m.id === ui.modal.id); acceptMilestone(state, m.id, !m.done); return true; });
    if (kind === 'adjustment') {
      const edits = [...form.querySelectorAll('[data-suggestion-id]')].map(field => { const id = field.dataset.suggestionId; return { id, title: values['title-' + id], note: values['note-' + id], due: values['due-' + id], today: values['today-' + id] === 'on' }; });
      result = await repo.commit(state => applySuggestions(state, ui.modal.id, edits, values.reason));
    }
    if (kind === 'feedback') result = await repo.commit(state => { const entry = { id: uid('feedback'), category: values.category, text: values.text.trim(), page: ui.page, createdAt: new Date().toISOString() }; if (entry.text.length < 2) throw new Error('请至少填写两个字。'); state.feedback.push(entry); return entry; });
    if (result) { if (form.isConnected) closeModal(); if (kind === 'new-task' && result.parentId) go('project', result.projectId); else if (kind === 'new-project') { ui.tab = sourceIdeaId ? 'resources' : 'board'; go('project', result.id); } else render(); toast(!repo.writable ? '已更新，但浏览器无法保存；请导出本次体验。' : kind === 'entry' ? '进展已保存，Cockpit 与复盘数据已同步更新。' : kind === 'mind-convert' ? `已加入「${projectById(repo.state, result.projectId).name}」待办。` : kind === 'adjustment' ? '调整已保存，新的行动已加入项目。' : kind === 'feedback' ? '反馈已保存在本机。' : '已保存。'); }
  } catch (error) { if (errorEl.isConnected) { errorEl.textContent = error.message; errorEl.hidden = false; } else toast(error.message); }
  finally { delete form.dataset.saving; if (submit) submit.disabled = false; }
});
let draggedTask = '';
document.addEventListener('dragstart', event => {
  const card = event.target.closest('[data-task-id]'); if (!card) return;
  draggedTask = card.dataset.taskId; event.dataTransfer.setData('text/plain', draggedTask); event.dataTransfer.effectAllowed = 'move'; card.classList.add('dragging');
});
document.addEventListener('dragover', event => {
  const column = event.target.closest('[data-drop-status]');
  if (column && draggedTask) { event.preventDefault(); column.classList.add('drag-over'); }
});
document.addEventListener('dragleave', event => {
  const zone = event.target.closest('[data-drop-status]');
  if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove('drag-over');
});
document.addEventListener('drop', event => {
  const column = event.target.closest('[data-drop-status]'); if (!column || !draggedTask) return;
  event.preventDefault(); const taskId = draggedTask; draggedTask = '';
  commit(state => setTaskStatus(state, taskId, column.dataset.dropStatus), '行动状态已更新。');
});
document.addEventListener('dragend', () => {
  draggedTask = '';
  document.querySelectorAll('.dragging, .drag-over').forEach(el => el.classList.remove('dragging', 'drag-over'));
});
document.addEventListener('toggle', event => {
  const details = event.target;
  if (details.dataset.projectSummary && details.isConnected) ui.projectOverviewOpen = details.open ? details.dataset.projectSummary : '';
  if (details.classList.contains('review-snapshots') && details.isConnected) ui.reviewSnapshotsOpen = details.open;
}, true);
window.addEventListener('resize', () => {
  for (const pane of document.querySelectorAll('.tree-pane')) {
    const project = pane.dataset.treeProject;
    const viewport = pane.querySelector('.graph-viewport');
    if (!ui.treeScales.has(project)) {
      fitTreeGraph(viewport, ui.compactTrees.has(project) ? .25 : .86);
      viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
    }
  }
});
window.addEventListener('hashchange', () => { closeModal(); routeFromHash(); render(); });
window.addEventListener('storage', event => { if (event.key === 'xingjin.prototype.workspace.v1') { toast('另一个窗口修改了体验数据。请导出本窗口的改动，再刷新以读取最新内容。'); } });
routeFromHash(); render();

let widgetDrag = null;
function widgetTargetBox(box, dx, dy, rows, resize) {
  if (resize) return { ...box,
    w: Math.max(1, Math.min(WIDGET_BOARD.columns - box.x, box.w + dx)),
    h: Math.max(WIDGET_BOARD.minHeight, Math.min(WIDGET_BOARD.maxHeight, rows - box.y, box.h + dy)) };
  return { ...box, x: Math.max(0, Math.min(WIDGET_BOARD.columns - box.w, box.x + dx)),
    y: Math.max(0, Math.min(rows - box.h, box.y + dy)) };
}
async function saveWidgetBox(id, box, focus, origin) {
  const before = new Map([...document.querySelectorAll('.widget-grid > .workbench-widget')].map(card => [card.dataset.widgetId, card.getBoundingClientRect()]));
  if (origin) before.set(id, origin);
  const saved = await commit(state => { placeWidget(state, id, box); return true; }, '小组件位置已保存。');
  if (!saved) return;
  for (const card of document.querySelectorAll('.widget-grid > .workbench-widget')) {
    const old = before.get(card.dataset.widgetId), now = card.getBoundingClientRect();
    if (card.dataset.widgetId === id && focus) card.querySelector(focus)?.focus({ preventScroll: true });
    if (!old || matchMedia('(prefers-reduced-motion: reduce)').matches || (old.x === now.x && old.y === now.y)) continue;
    card.animate([{ transform: `translate(${old.x - now.x}px,${old.y - now.y}px)` }, { transform: 'none' }],
      { duration: 230, easing: 'cubic-bezier(.2,.72,.28,1)' });
  }
}
function startWidgetDrag(event) {
  const handle = event.target.closest('[data-widget-drag], [data-widget-resize]');
  if (!handle || event.button !== 0 || widgetDrag) return false;
  const card = handle.closest('.workbench-widget'), grid = card.parentElement;
  const rect = card.getBoundingClientRect(), box = widgetBoard(repo.state)[card.dataset.widgetId];
  widgetDrag = { card, grid, handle, rect, box, preview: grid.querySelector('.widget-drop-preview'),
    resize: handle.hasAttribute('data-widget-resize'), x: event.clientX, y: event.clientY,
    scrollTop: window.scrollY, scrollLeft: grid.parentElement.scrollLeft,
    pitchX: (grid.clientWidth + 12) / WIDGET_BOARD.columns, pitchY: 84, pointer: event.pointerId };
  handle.setPointerCapture(event.pointerId);
  event.preventDefault();
  return true;
}
function updateWidgetDrag(event) {
  const drag = widgetDrag;
  if (drag?.pointer !== event.pointerId || !drag.card.isConnected) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (!drag.started && Math.hypot(dx, dy) < 5) return;
  if (!drag.started) {
    drag.started = true;
    drag.preview.hidden = false;
    if (!drag.resize) {
      drag.ghost = drag.card.cloneNode(true);
      drag.ghost.classList.add('widget-ghost');
      drag.ghost.inert = true;
      drag.ghost.setAttribute('aria-hidden', 'true');
      drag.ghost.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      Object.assign(drag.ghost.style, { width: drag.rect.width + 'px', height: drag.rect.height + 'px', left: drag.rect.left + 'px', top: drag.rect.top + 'px' });
      document.body.append(drag.ghost);
      drag.card.classList.add('widget-dragging');
    }
  }
  if (drag.ghost) drag.ghost.style.transform = `translate3d(${dx}px,${dy}px,0) scale(1.015)`;
  const x = Math.round((dx + drag.grid.parentElement.scrollLeft - drag.scrollLeft) / drag.pitchX);
  const y = Math.round((dy + window.scrollY - drag.scrollTop) / drag.pitchY);
  const rows = Number(drag.grid.dataset.rows);
  drag.target = widgetTargetBox(drag.box, x, y, rows, drag.resize);
  drag.preview.style.cssText = widgetBoxStyle(drag.target);
  if (event.clientY > innerHeight - 48) window.scrollBy(0, 20);
  if (event.clientY < 48) window.scrollBy(0, -20);
}
function finishWidgetDrag(event) {
  const drag = widgetDrag;
  if (drag?.pointer !== event.pointerId) return false;
  widgetDrag = null;
  const finish = () => {
    drag.ghost?.remove();
    drag.card.classList.remove('widget-dragging');
    drag.preview.hidden = true;
  };
  if (event.type === 'pointerup' && drag.target && Object.keys(drag.box).some(key => drag.box[key] !== drag.target[key])) {
    saveWidgetBox(drag.card.dataset.widgetId, drag.target, null, drag.ghost?.getBoundingClientRect()).finally(finish);
  } else finish();
  return true;
}
document.addEventListener('keydown', event => {
  const handle = event.target.closest('[data-widget-drag], [data-widget-resize]');
  const vector = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (!handle || !vector) return;
  event.preventDefault();
  const card = handle.closest('.workbench-widget'), id = card.dataset.widgetId;
  const resize = handle.hasAttribute('data-widget-resize'), box = widgetBoard(repo.state)[id];
  const target = widgetTargetBox(box, ...vector, Number(card.parentElement.dataset.rows), resize);
  if (Object.keys(box).some(key => box[key] !== target[key])) saveWidgetBox(id, target, resize ? '[data-widget-resize]' : '[data-widget-drag]');
});
function syncMindSelection(id) {
  const map = currentMindMap();
  const node = map.nodes.find(item => item.id === id);
  for (const card of document.querySelectorAll('.mind-node')) {
    const selected = ui.mindMulti.size ? ui.mindMulti.has(card.dataset.mindNode) : card.dataset.mindNode === id;
    card.classList.toggle('selected', selected);
    card.querySelector('.mind-node-content')?.setAttribute('aria-pressed', selected);
  }
  for (const button of document.querySelectorAll('.mind-toolbar button[data-id]')) button.dataset.id = id;
  const group = document.querySelector('[data-action="mind-group"]');
  group.disabled = ui.mindMulti.size < 2;
  group.textContent = group.disabled ? '新建分组' : `新建分组（${ui.mindMulti.size}）`;
  const convert = document.querySelector('[data-action="mind-convert"]');
  const linked = mindAction(map.id, id);
  convert.hidden = !linked && !canConvertMindNode(map, node);
  convert.textContent = linked ? '查看关联行动' : '转为项目行动';
  document.querySelector('[data-action="mind-links"]').disabled = !map.links.some(link => link.from === id);
  document.querySelector('.mind-selection strong').textContent = ui.mindMulti.size > 1 ? `${ui.mindMulti.size} 张卡片` : node.title;
}
function setMindZoom(value, clientX, clientY) {
  const viewport = document.querySelector('.mind-viewport');
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();
  const x = clientX === undefined ? viewport.clientWidth / 2 : clientX - rect.left;
  const y = clientY === undefined ? viewport.clientHeight / 2 : clientY - rect.top;
  const zoom = Math.max(.2, Math.min(2, value)), ratio = zoom / ui.mindZoom;
  const left = (viewport.scrollLeft + x) * ratio - x, top = (viewport.scrollTop + y) * ratio - y;
  const scroll = viewport.querySelector('.mind-scroll');
  scroll.style.width = `${Number(viewport.dataset.width) * zoom}px`;
  scroll.style.height = `${Number(viewport.dataset.height) * zoom}px`;
  scroll.firstElementChild.style.transform = `scale(${zoom})`;
  viewport.dataset.zoom = ui.mindZoom = zoom;
  viewport.scrollLeft = left;
  viewport.scrollTop = top;
  document.querySelector('.mind-scale').textContent = `${Math.round(zoom * 100)}%`;
}
function fitMindMap() {
  const viewport = document.querySelector('.mind-viewport'), nodes = currentMindMap().nodes;
  const left = Math.min(...nodes.map(n => n.x)), right = Math.max(...nodes.map(n => n.x + mindSize(n).width));
  const top = Math.min(...nodes.map(n => n.y)), bottom = Math.max(...nodes.map(n => n.y + mindSize(n).height));
  setMindZoom(Math.min(1, (viewport.clientWidth - 64) / (right - left), (viewport.clientHeight - 64) / (bottom - top)));
  viewport.scrollLeft = (left + right) * ui.mindZoom / 2 - viewport.clientWidth / 2;
  viewport.scrollTop = (top + bottom) * ui.mindZoom / 2 - viewport.clientHeight / 2;
}
function canvasPoint(event, viewport) {
  const rect = viewport.getBoundingClientRect();
  return { x: (event.clientX - rect.left + viewport.scrollLeft) / ui.mindZoom, y: (event.clientY - rect.top + viewport.scrollTop) / ui.mindZoom };
}
document.addEventListener('wheel', event => {
  if (!event.ctrlKey || !event.target.closest('.mind-viewport')) return;
  event.preventDefault();
  setMindZoom(ui.mindZoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12), event.clientX, event.clientY);
}, { passive: false });
document.addEventListener('dblclick', event => {
  const viewport = event.target.closest('.mind-viewport');
  if (!viewport || event.target.closest('form, [data-mind-port], [data-mind-resize]')) return;
  const card = event.target.closest('.mind-node');
  if (!card) return mindNodeDialog('', '', canvasPoint(event, viewport));
  const node = currentMindMap().nodes.find(item => item.id === card.dataset.mindNode);
  viewport.querySelector('.mind-inline')?.remove();
  const form = document.createElement('form');
  form.className = 'mind-inline';
  form.dataset.form = 'mind-inline';
  form.innerHTML = `<input name="title" aria-label="节点名称" required maxlength="120" value="${esc(node.title)}"><textarea name="note" aria-label="节点说明" maxlength="4000" rows="4">${esc(node.note)}</textarea><p class="form-error" role="alert" hidden></p><div>${btn('取消', 'mind-inline-cancel', '', 'btn btn-small')}<button class="btn btn-primary btn-small" type="submit">保存</button></div>`;
  card.append(form);
  form.elements.title.focus();
  form.elements.title.select();
});
document.addEventListener('keydown', event => {
  if (event.isComposing || event.keyCode === 229) return;
  const form = event.target.closest('.mind-inline');
  if (!form) {
    const viewport = event.target.closest('.mind-viewport');
    if (!viewport || event.target.closest('input, textarea, select, [contenteditable]') || event.key !== 'Enter' || (!event.altKey && !event.ctrlKey) || modalRoot.querySelector('dialog[open]')) return;
    const map = currentMindMap(), selected = map.nodes.find(n => n.id === ui.mindSelected) || map.nodes[0];
    event.preventDefault();
    if (event.altKey) mindNodeDialog('', selected.id);
    else {
      const parent = map.links.find(link => link.to === selected.id && link.branch)?.from || '';
      mindNodeDialog('', parent, { x: selected.x, y: selected.y + mindSize(selected).height + 26 }, selected.kind || 'topic');
    }
    return;
  }
  if (event.key === 'Escape') { event.preventDefault(); form.remove(); }
  if (event.key === 'Enter' && event.ctrlKey) { event.preventDefault(); form.requestSubmit(); }
});
let graphDrag = null, mindDrag = null;
document.addEventListener('pointerdown', event => {
  if (startWidgetDrag(event)) return;
  const handle = event.target.closest('[data-mind-drag], [data-mind-resize], [data-mind-port], .mind-node-content');
  if (handle && event.button === 0) {
    const card = handle.closest('.mind-node'), map = currentMindMap();
    if (ui.mindLinkFrom && handle.matches('.mind-node-content')) return;
    const node = map.nodes.find(item => item.id === card.dataset.mindNode);
    const nodes = new Map(map.nodes.map(item => [item.id, item]));
    const world = card.closest('.mind-world'), viewport = world.closest('.mind-viewport');
    const curves = [...world.querySelectorAll('.mind-curve')].filter(path => path.dataset.from === node.id || path.dataset.to === node.id);
    const kind = handle.dataset.mindPort ? 'link' : handle.hasAttribute('data-mind-resize') ? 'size' : 'move';
    const group = map.groups?.find(item => item.nodes.includes(node.id));
    const frame = group && [...world.querySelectorAll('.mind-group-frame')].find(el => el.dataset.mindGroup === group.id);
    mindDrag = { card, handle, mapId: map.id, node, nodes, curves, viewport, kind, group, frame, x: event.clientX, y: event.clientY, id: event.pointerId };
    if (!handle.matches('.mind-node-content')) {
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
    return;
  }
  const viewport = event.target.closest('.graph-viewport, .mind-viewport');
  if (!viewport || event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('button, input, select, textarea')) return;
  if (event.target === viewport && (event.offsetX >= viewport.clientWidth || event.offsetY >= viewport.clientHeight)) return;
  graphDrag = { viewport, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, id: event.pointerId };
  viewport.setPointerCapture(event.pointerId); viewport.classList.add('panning');
});
document.addEventListener('pointermove', event => {
  if (widgetDrag) return updateWidgetDrag(event);
  if (graphDrag?.id === event.pointerId) {
    graphDrag.viewport.scrollLeft = graphDrag.left - event.clientX + graphDrag.x;
    graphDrag.viewport.scrollTop = graphDrag.top - event.clientY + graphDrag.y;
  }
  if (mindDrag?.id !== event.pointerId) return;
  const { card, node, nodes, curves, x, y, viewport, handle, kind } = mindDrag;
  if (!mindDrag.started && Math.hypot(event.clientX - x, event.clientY - y) < 5) return;
  if (!mindDrag.started) {
    mindDrag.started = true;
    handle.setPointerCapture(event.pointerId);
    if (kind === 'link') {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('class', 'mind-curve mind-preview');
      viewport.querySelector('.mind-links').append(path);
      mindDrag.preview = path;
    }
  }
  if (kind === 'link') {
    const point = canvasPoint(event, viewport), direction = handle.dataset.mindPort === 'right' ? 1 : -1;
    const size = mindSize(node), startX = node.x + (direction === 1 ? size.width : 0), startY = node.y + size.height / 2;
    const bend = Math.max(28, Math.abs(point.x - startX) / 2) * direction;
    mindDrag.preview.setAttribute('d', `M ${startX} ${startY} C ${startX + bend} ${startY}, ${point.x - bend} ${point.y}, ${point.x} ${point.y}`);
    return;
  }
  const dx = (event.clientX - x) / ui.mindZoom, dy = (event.clientY - y) / ui.mindZoom;
  const size = mindSize(node);
  const changes = kind === 'size' ? clampMindSize(size.width + dx, size.height + dy, node) : clampMindPosition(node.x + dx, node.y + dy, node);
  const position = { ...node, ...changes };
  mindDrag.position = position;
  for (const [key, value] of Object.entries(changes)) card.style[{ x: 'left', y: 'top' }[key] || key] = `${value}px`;
  nodes.set(node.id, position);
  if (mindDrag.frame) mindDrag.frame.style.cssText = mindGroupStyle(mindDrag.group, nodes);
  for (const curve of curves) {
    const geometry = mindLinkGeometry(nodes.get(curve.dataset.from), nodes.get(curve.dataset.to));
    curve.setAttribute('d', geometry.path);
    const label = viewport.querySelector(`[data-link-label="${curve.dataset.linkIndex}"]`);
    if (label) {
      label.style.left = `${geometry.x}px`;
      label.style.top = `${geometry.y}px`;
    }
  }
});
function endCanvasDrag(event) {
  if (finishWidgetDrag(event)) return;
  if (graphDrag?.id === event.pointerId) { graphDrag.viewport.classList.remove('panning'); graphDrag = null; }
  if (mindDrag?.id !== event.pointerId) return;
  const { mapId, node, position, kind, viewport, preview, started } = mindDrag;
  mindDrag = null;
  preview?.remove();
  if (!started) return;
  if (event.type === 'pointercancel') { render(); return; }
  if (kind === 'link') {
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const target = hit?.closest('.mind-node')?.dataset.mindNode;
    if (target && target !== node.id) commit(state => { linkMindNodes(state, mapId, node.id, target); return true; }, '连线已保存。');
    else if (!target && hit?.closest('.mind-viewport') === viewport) mindNodeDialog('', node.id, canvasPoint(event, viewport));
    return;
  }
  if (!position) return;
  ui.mindSelected = node.id;
  commit(state => {
    if (kind === 'size') resizeMindNode(state, mapId, node.id, position.width, position.height);
    else moveMindNode(state, mapId, node.id, position.x, position.y);
    return true;
  }).then(result => { if (!result) render(); });
}
document.addEventListener('pointerup', endCanvasDrag);
document.addEventListener('pointercancel', endCanvasDrag);
let lastDate = currentDate();
setInterval(() => { const date = currentDate(); if (date !== lastDate && !ui.modal) { lastDate = date; render(); } }, 60000);

if (!desktop) Promise.resolve().then(() => navigator.serviceWorker?.register('./service-worker.js', { updateViaCache: 'none' })).catch(() => {
  // This browser may disallow offline storage; the local launcher still works.
});
