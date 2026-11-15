import { STATUS } from './workspace.js';
import { currentDate, monthDays, weekRange, chinaCalendarDay } from './dates.js';
import { calendarItems, deadlineReminders, executableTasks, metrics, projectById, projectReminder, sortByPriority } from './model.js';
import { layoutTaskGraph } from './graph.js';

const reminderGroups = [['overdue', '已逾期'], ['today', '今天截止'], ['upcoming', '即将截止']];
const reminderLabel = item => item.reminder === 'overdue' ? `逾期 ${-item.daysUntil} 天` : item.reminder === 'today' ? '今天截止' : `还有 ${item.daysUntil} 天`;
export function deadlinePanel(state, h) {
  const items = deadlineReminders(state);
  if (!items.length) return '';
  return `<section class="deadline-banner" aria-label="截止提醒"><div class="deadline-summary">${h.icon('flag')}<strong>截止提醒</strong>${reminderGroups.map(([key, label]) => { const count = items.filter(item => item.reminder === key).length; return count ? `<span class="deadline-chip ${key}">${label} ${count}</span>` : ''; }).join('')}</div>${h.btn(`查看 ${h.icon('arrow')}`, 'show-deadlines', 'aria-label="查看截止提醒详情"', 'btn btn-small')}</section>`;
}
export function focusProjectCard(state, projectId, h) {
  const project = projectById(state, projectId), stats = metrics(state, projectId);
  const next = sortByPriority(executableTasks(state, projectId).filter(task => task.status !== 'done'))[0];
  return `<section class="focus-card"><div class="focus-eyebrow">当前关注 ${h.icon('flag')}</div><h2>${h.esc(project.name)}</h2><p>${h.esc(project.subtitle)}</p><div class="focus-milestone"><span>下一步行动</span><strong>${h.esc(next?.title || (stats.tasks ? '行动已全部完成，可以核对项目目标。' : '添加第一项可执行行动。'))}</strong></div><progress class="focus-progress" value="${stats.done}" max="${Math.max(1, stats.tasks)}" aria-label="${stats.done}/${stats.tasks} 行动完成"></progress><div class="focus-bottom"><span>${stats.done} / ${stats.tasks} 最末级行动完成</span>${h.btn(`进入项目 ${h.icon('arrow')}`, 'open-project', `data-id="${h.esc(project.id)}"`, 'focus-link')}</div></section>`;
}
export function projectDetailPage(state, ui, h) {
  const project = projectById(state, ui.projectId), stats = metrics(state, project.id), week = weekRange();
  const entries = state.entries.filter(entry => entry.projectId === project.id && entry.date >= week.start && entry.date <= week.end);
  const reminder = projectReminder(project);
  const reminderCaption = reminder.days ? `提前 ${reminder.days} 天提醒` : '截止当天提醒';
  const treeVisible = ui.tab === 'tree' && ui.treeMode === 'map';
  const treeShortcut = treeVisible ? '' : h.btn('查看项目行动树', 'project-tab', 'data-tab="tree" data-jump="tree"');
  const headingActions = treeShortcut + h.btn(`${h.icon('plus')}新增行动`, 'new-task', '', 'btn btn-primary');
  return `${h.pageHeading('', h.esc(project.name), '', headingActions)}<section class="project-overview"><div class="project-overview-heading"><div class="inline-labels">${h.pill(project.isDemo === false ? '我的项目' : '演示项目', project.isDemo === false ? 'green' : 'demo')}${h.pill(({ active: '进行中', paused: '已暂停', completed: '已完成' })[project.status], project.status === 'active' ? 'green' : '')}<span class="muted small">${h.esc(project.category)}</span></div></div><details class="project-summary" data-project-summary="${h.esc(project.id)}" ${ui.projectOverviewOpen === project.id ? 'open' : ''}><summary id="project-overview-toggle">目标与完成标准</summary><div class="project-goal"><div class="goal-row"><div><span class="section-label">项目目标</span><h2>${h.esc(project.goal || '未设置项目目标')}</h2></div>${h.btn(h.icon('edit'), 'edit-project', 'aria-label="编辑目标与完成标准"', 'icon-btn')}</div><p><strong>完成标准</strong>${h.esc(project.criteria || '未设置')}</p></div></details><div class="project-stats"><div><strong>${stats.done}<span> / ${stats.tasks}</span></strong><small>最末级行动已完成</small></div><div><strong>${entries.length}</strong><small>条本周进展记录</small></div><div class="project-deadline-stat"><strong>${h.shortDate(project.targetDate)}</strong><small>${project.targetDate ? reminderCaption : '项目截止日期'}</small>${h.btn('截止与提醒', 'project-deadline', '', 'text-btn deadline-edit')}</div></div></section><div class="project-toolbar"><div class="tabs" role="tablist" aria-label="项目内容">${[['board', '行动看板'], ['tree', '行动树'], ['weekly', '每周复盘'], ['resources', '项目说明']].map(([tab, name]) => `<button type="button" role="tab" id="project-tab-${tab}" aria-controls="project-content" aria-selected="${ui.tab === tab}" tabindex="${ui.tab === tab ? 0 : -1}" class="tab ${ui.tab === tab ? 'active' : ''}" data-action="project-tab" data-tab="${tab}">${name}</button>`).join('')}</div><div class="toolbar-links">${h.btn('项目日历', 'project-calendar', '', 'text-btn')}${h.btn(project.status === 'active' ? '暂停项目' : '恢复项目', 'toggle-project', '', 'text-btn')}${project.status !== 'completed' ? h.btn('完成项目', 'complete-project', '', 'text-btn') : ''}</div></div>${project.status === 'completed' ? '<div class="notice">项目已标记完成，已记录完成日期。可以在日历中回看；未完成的旧行动仍保留在项目中。</div>' : ''}<div id="project-content" role="tabpanel" aria-labelledby="project-tab-${ui.tab}">${ui.tab === 'board' ? `<div class="kanban-board">${Object.entries(STATUS).map(([status, label]) => {
    const tasks = sortByPriority(executableTasks(state, project.id).filter(task => task.status === status));
    return `<section class="kanban-column status-${status}" data-drop-status="${status}" aria-label="${label}行动"><div class="kanban-heading"><h3><span class="status-symbol">${({ todo: '○', doing: '◐', waiting: 'Ⅱ', done: '✓' })[status]}</span>${label}</h3><span class="status-total">${tasks.length}</span></div><div class="kanban-tasks">${tasks.map(h.taskCard).join('') || '<div class="kanban-empty">暂时没有行动</div>'}</div>${status === 'todo' ? h.btn(`${h.icon('plus')}添加行动`, 'new-task', '', 'kanban-add') : ''}</section>`;
  }).join('')}</div>` : ''}${ui.tab === 'tree' ? (ui.treeMode === 'list' ? `<div class="tree-mode-bar">${h.btn('切换节点图', 'tree-mode', 'data-mode="map"', 'btn btn-primary')}</div>${h.taskList()}` : graphView(state, ui, h)) : ''}${ui.tab === 'weekly' ? weeklyPanel(state, ui, h) : ''}${ui.tab === 'resources' ? `<section class="panel project-notes"><div class="section-heading"><h2>项目说明</h2>${h.pill(project.isDemo === false ? '我的项目' : '示例内容')}</div><p>${h.esc(project.description || '暂无项目说明。')}</p>${h.btn('查看项目进展', 'project-progress', '', 'btn')}</section>` : ''}</div>`;
}
export function deadlinesBody(state, h) {
  const items = deadlineReminders(state);
  if (!items.length) return '<div class="inline-empty">当前没有截止提醒。</div>';
  return reminderGroups.map(([key, label]) => {
    const group = items.filter(item => item.reminder === key);
    if (!group.length) return '';
    return `<section class="deadline-group ${key}" aria-label="${label}"><h3>${label} <span>${group.length}</span></h3><div class="deadline-list">${group.map(item => `<button type="button" class="deadline-item ${key} ${item.overdue ? 'late' : ''}" data-action="${item.type === 'task' ? 'task-detail' : 'open-project-from-modal'}" data-id="${h.esc(item.id)}"><span class="deadline-type">${item.type === 'task' ? '行动' : '项目'}</span><span><strong>${h.esc(item.title)}</strong><small>${item.type === 'task' ? `${h.esc(projectById(state, item.projectId).name)} · ` : ''}截止 ${item.date}</small></span><b>${reminderLabel(item)}</b></button>`).join('')}</div></section>`;
  }).join('');
}
export function calendarPage(state, ui, h) {
  const today = currentDate(), projectId = ui.calendarProject === 'all' ? '' : ui.calendarProject;
  const events = calendarItems(state, projectId).filter(item => ui.calendarType === 'all'
    || item.category === ui.calendarType || (ui.calendarType === 'created' && item.alsoCreated));
  const byDate = new Map();
  for (const item of events) {
    const list = byDate.get(item.date) || [];
    list.push(item); byDate.set(item.date, list);
  }
  const selected = byDate.get(ui.calendarDate) || [];
  const unknown = executableTasks(state, projectId).filter(task => task.status === 'done' && !task.completedOn);
  const selectedHoliday = chinaCalendarDay(ui.calendarDate);
  const calendarTypes = [['all', '全部项目事项'], ['created', '只看项目创建'], ['completed', '只看完成记录'], ['deadline', '只看截止安排']];
  const selectedHolidayLabels = [selectedHoliday.festival, selectedHoliday.holiday && (selectedHoliday.holiday + '假期'), selectedHoliday.workday && '调休上班'].filter(Boolean);
  const projectEmblem = kind => h.icon(kind, `calendar-emblem ${kind}`);
  const dayCells = monthDays(ui.calendarMonth).map(date => {
    const list = byDate.get(date) || [];
    const created = list.filter(item => item.category === 'created' && item.status !== 'completed').length;
    const projectsFinished = list.filter(item => item.type === 'project' && (item.category === 'completed' || (item.category === 'created' && item.status === 'completed'))).length;
    const actionsFinished = list.filter(item => item.type === 'task' && item.category === 'completed').length;
    const due = list.filter(item => item.category === 'deadline');
    const { festival, holiday, workday } = chinaCalendarDay(date);
    const label = [date, festival, holiday && (holiday + '假期'), workday && '调休上班', created && (created + ' 个新建项目'),
      projectsFinished && (projectsFinished + ' 个项目完成标记'), actionsFinished && (actionsFinished + ' 项行动完成记录'), due.length && (due.length + ' 项截止')].filter(Boolean).join('，');
    return `<button type="button" class="calendar-day ${date.slice(0, 7) !== ui.calendarMonth ? 'outside' : ''} ${date === today ? 'today' : ''} ${date === ui.calendarDate ? 'selected' : ''}" data-action="calendar-day" data-date="${date}" aria-pressed="${date === ui.calendarDate}" aria-label="${label}">
      <span class="calendar-day-top"><strong>${Number(date.slice(8))}</strong>${holiday || workday ? `<small class="calendar-holiday-mark ${workday ? 'workday' : ''}">${workday ? '班' : '休'}</small>` : ''}</span>
      ${festival ? `<span class="calendar-festival">${festival}</span>` : ''}
      <span class="calendar-markers">
        ${created ? `<span class="cal-count created">${projectEmblem('project-start')}${created}</span>` : ''}
        ${projectsFinished ? `<span class="cal-count completed project-finish">${projectEmblem('project-finish')}${projectsFinished}</span>` : ''}
        ${actionsFinished ? `<span class="cal-count completed">✓ ${actionsFinished}</span>` : ''}
        ${due.length ? `<span class="cal-count ${due.some(item => item.overdue) ? 'late' : 'due'}">${due.some(item => item.overdue) ? '!' : '◆'} ${due.length}</span>` : ''}
      </span></button>`;
  }).join('');
  const detailRows = selected.map(item => {
    const label = item.alsoCreated ? '创建并完成'
      : item.category === 'completed' ? (item.type === 'project' ? '已记录完成' : '✓ 已记录完成')
      : item.category === 'created' ? (item.status === 'completed' ? '项目创建 · 现已完成' : item.status === 'paused' ? '项目创建 · 已暂停' : '项目创建')
      : item.overdue ? '! 截止已过' : '◆ 截止安排';
    const pendingCreation = item.category === 'created' && item.status !== 'completed';
    const emblem = item.type === 'project' && item.category !== 'deadline' ? projectEmblem(pendingCreation ? 'project-start' : 'project-finish') : '';
    const style = pendingCreation ? 'created' : item.category !== 'deadline' ? `completed${emblem ? ' project-finish' : ''}` : item.overdue ? 'late' : 'due';
    const project = projectById(state, item.projectId);
    const detail = item.category === 'created' && item.status === 'completed' && project.completedOn ? ` · 实际完成于 ${h.shortDate(project.completedOn)}` : '';
    return `<button type="button" class="calendar-event ${style}" data-action="${item.type === 'task' ? 'task-detail' : 'open-project'}" data-id="${h.esc(item.id)}">
      <span class="calendar-event-kind">${emblem}${label} · ${item.type === 'task' ? '行动' : '项目'}</span><strong>${h.esc(item.title)}</strong>
      <small>${h.esc(project.name)}${detail}${item.source === 'backfill' ? ' · 手动补记' : ''}${item.category === 'completed' && item.type === 'task' && state.tasks.find(task => task.id === item.taskId)?.status !== 'done' ? ' · 当前已重新打开' : ''}</small></button>`;
  }).join('');
  return `${h.pageHeading('', '日历', '', h.btn('回到今天', 'calendar-today', '', 'btn'))}${deadlinePanel(state, h)}
  <div class="calendar-filters"><label>项目<select data-control="calendar-project"><option value="all">全部项目</option>${h.projectOptions(ui.calendarProject)}</select></label>
  <label>查看内容<select data-control="calendar-type">${calendarTypes.map(([value, label]) => `<option value="${value}" ${ui.calendarType === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
  <label>跳到日期<input type="date" value="${ui.calendarDate}" data-control="calendar-date" /></label></div>
  <div class="calendar-layout"><section class="panel calendar-panel"><div class="calendar-month"><h2>${Number(ui.calendarMonth.slice(0, 4))}年 ${Number(ui.calendarMonth.slice(5))}月</h2><div>${h.btn('←', 'calendar-month', 'data-direction="-1" aria-label="上个月"', 'icon-btn')}${h.btn('→', 'calendar-month', 'data-direction="1" aria-label="下个月"', 'icon-btn')}</div></div>
  <div class="calendar-weekdays">${['一', '二', '三', '四', '五', '六', '日'].map(day => `<span>${day}</span>`).join('')}</div>
  <div class="calendar-grid">${dayCells}</div><div class="calendar-legend"><span>${projectEmblem('project-start')} 项目创建</span><span>${projectEmblem('project-finish')} 项目完成</span><span class="completed">✓ 行动完成</span><span class="due">◆ 截止安排</span><span class="late">! 已逾期</span><span>休 / 班为放假调休</span></div></section>
  <section class="panel calendar-detail"><div class="section-heading"><h2>${h.shortDate(ui.calendarDate)}</h2><span class="pill">${selected.length} 项</span></div>
  ${selectedHolidayLabels.length ? `<div class="calendar-holiday-detail">${selectedHolidayLabels.map(label => h.pill(label, 'orange')).join('')}</div>` : ''}
  <div class="calendar-event-list">${detailRows || '<div class="inline-empty">当天没有符合筛选条件的项目事项。</div>'}</div></section></div>
  ${unknown.length ? `<section class="panel undated-panel"><h3>${unknown.length} 项已完成行动尚未记录完成日期</h3><p>旧数据缺少实际完成时间，可以根据自己的记录补记。</p><div>${unknown.map(task => h.btn(`${h.esc(task.title)} · 补记日期`, 'backfill-date', `data-id="${h.esc(task.id)}"`, 'btn btn-small')).join('')}</div></section>` : ''}`;
}
export function weeklyPanel(state, ui, h) {
  const range = weekRange(ui.weekStart), project = projectById(state, ui.projectId);
  const latest = state.reviews.filter(review => review.projectId === project.id && review.weekStart === range.start).at(-1);
  return `<section class="panel weekly-panel"><div class="section-heading"><div><h2>每周复盘</h2></div><span class="pill demo">本地规则</span></div><div class="week-controls"><label>选择一周<input type="date" value="${range.start}" data-control="week-start" /></label><span>${range.start} — ${range.end}</span>${h.btn('查看所选周复盘', 'weekly-detail', '', 'btn btn-primary')}${h.btn('保存每周复盘', 'generate-weekly', '', 'btn btn-small')}</div>${latest ? `<div class="weekly-snapshot"><h3>本周已保存的总结</h3><p>${h.esc(latest.summary)}</p>${h.btn('查看已保存的复盘 →', 'weekly-detail', `data-id="${h.esc(latest.id)}"`, 'text-btn')}</div>` : ''}</section>`;
}
export function graphView(state, ui, h, { workspace = false, compare = false, expanded, compact = false } = {}) {
  const graph = layoutTaskGraph(state, ui.projectId, expanded, compact), scale = ui.treeZoom;
  return `<section class="panel graph-panel ${compact ? 'compact-graph' : ''}"><div class="graph-toolbar"><div><h2>${workspace ? h.esc(graph.nodes[0].project.name) : '项目行动树'}</h2><p>点击节点查看详情。完成的节点与连线会点亮，父节点汇总子行动进度。</p></div><div class="graph-controls">${h.btn('−', 'graph-zoom', 'data-step="-0.15" aria-label="缩小行动树"', 'icon-btn')}<span class="graph-scale">${Math.round(scale * 100)}%</span>${h.btn('+', 'graph-zoom', 'data-step="0.15" aria-label="放大行动树"', 'icon-btn')}${workspace ? h.btn('适应窗口', 'graph-fit', '', 'btn btn-small') : h.btn('居中', 'graph-center', '', 'btn btn-small')}${h.btn('展开全部', 'expand-tree', '', 'btn btn-small')}${workspace ? h.btn('前两层', 'tree-overview', '', 'btn btn-small') : h.btn('全部收起', 'collapse-tree', '', 'btn btn-small')}${workspace ? h.btn('紧凑视图', 'graph-compact', `aria-pressed="${compact}"`, 'btn btn-small') : ''}${compare ? '' : h.btn('折叠列表', 'tree-mode', 'data-mode="list"', 'btn btn-small')}</div></div><div class="graph-legend"><span>○ 未开始</span><span>◐ 正在推进</span><span class="lit">✓ 已完成 / 已点亮</span><span>拖动空白处或滚动查看分支</span></div><div class="graph-viewport" data-scale="${scale}" ${workspace ? '' : `style="height:${Math.min(650, Math.max(410, graph.height * scale + 10))}px"`} tabindex="0" role="region" aria-label="可滚动的项目行动树"><div class="graph-scroll-size" style="width:${graph.width * scale}px;height:${graph.height * scale}px;--graph-content-height:${graph.height * scale}px"><div class="graph-canvas" style="width:${graph.width}px;height:${graph.height}px;left:50%;margin-left:${-graph.width * scale / 2}px;transform:scale(${scale})"><svg class="graph-edges" width="${graph.width}" height="${graph.height}" aria-hidden="true">${graph.edges.map(edge => `<path d="${edge.path}" data-graph-from="${h.esc(edge.from)}" data-graph-to="${h.esc(edge.to)}" class="${edge.done ? 'lit' : ''}" />`).join('')}</svg>${graph.nodes.map(node => {
    const task = node.task, done = node.progress.status === 'done', title = task ? h.esc(task.title) : h.esc(node.project.name);
    if (compact) {
      const status = node.progress.status, glyph = { todo: '○', doing: '◐', waiting: 'Ⅱ', done: '✓' }[status];
      const toggle = task && node.childCount ? h.btn(node.expanded ? '−' : '+', 'toggle-branch', `data-id="${h.esc(node.id)}" aria-label="${node.expanded ? '收起' : '展开'}分支：${title}"`, 'compact-branch') : '';
      return `<article class="graph-node ${done ? 'lit' : ''} ${!task ? 'root-node' : ''}" data-graph-id="${h.esc(node.id)}" data-complete="${done}" style="left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px">
        <span class="node-status ${status}" aria-label="${STATUS[status]}">${glyph}</span><button type="button" class="graph-node-title" title="${title}" data-action="${task ? 'task-detail' : 'edit-project'}" ${task ? `data-id="${h.esc(task.id)}"` : ''}>${title}</button>
        <span class="compact-ratio" aria-label="${node.progress.done}/${node.progress.total} 最末级行动完成">${node.progress.done}/${node.progress.total}</span>${toggle}</article>`;
    }
    return `<article class="graph-node ${done ? 'lit' : ''} ${!task ? 'root-node' : ''}" data-graph-id="${h.esc(node.id)}" data-complete="${done}" style="left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px"><div class="graph-node-top"><span>${!task ? '项目目标' : node.childCount ? '分支事项' : '可执行行动'}</span><span class="node-status ${done ? 'done' : node.progress.status}">${done ? (!task && node.project.status !== 'completed' ? '✓ 行动全完成' : '✓ 已点亮') : STATUS[node.progress.status]}</span></div><button type="button" class="graph-node-title" data-action="${task ? 'task-detail' : 'edit-project'}" ${task ? `data-id="${h.esc(task.id)}"` : ''}>${title}</button><div class="node-progress"><progress value="${node.progress.done}" max="${Math.max(1, node.progress.total)}" aria-label="${node.progress.done}/${node.progress.total} 最末级行动完成"></progress><span>${node.progress.done}/${node.progress.total} 完成</span></div><div class="graph-node-actions">${task && node.childCount ? h.btn(node.expanded ? '收起分支' : `展开 ${node.childCount} 项`, 'toggle-branch', `data-id="${h.esc(task.id)}"`, 'text-btn') : !task ? h.btn('新增行动', 'new-task', '', 'text-btn') : h.btn(done ? '查看成果' : '完成并记录', done ? 'task-detail' : 'complete-task', `data-id="${h.esc(task.id)}"`, 'text-btn')}${task && !done ? h.btn('+ 拆分', 'split-task', `data-id="${h.esc(task.id)}"`, 'text-btn') : ''}</div></article>`;
  }).join('')}</div></div></div></section>`;
}
