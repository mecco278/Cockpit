export const SCENARIO_DATE = '2026-11-04';

export function createSeed() {
  return {
    schemaVersion: 3,
    workspaceKind: 'demo',
    scenarioDate: SCENARIO_DATE,
    settings: { guide: true, welcomed: false, expandedTaskIds: [] },
    projects: [
      { id: 'p-research', name: '柔性热电研究', subtitle: '最小验证与阶段复盘', category: '研究探索', color: 'green', status: 'active', goal: '完成一轮边界清晰、可以复现的最小验证，判断下一阶段该优先推进什么。', criteria: '整理验证条件、保留一组完整基线记录，并形成包含局限性的阶段说明。', targetDate: '2026-11-15', revision: 1, description: '先把问题缩小，再让每一次记录成为下一步的依据。此项目及所有任务、数据均为虚构示例。' },
      { id: 'p-report', name: '课程文献汇报', subtitle: '从阅读到清晰表达', category: '课程学习', color: 'orange', status: 'active', goal: '围绕一个核心问题完成文献梳理和汇报结构。', criteria: '完成一份论点清楚、来源明确的提纲，并进行一次试讲。', targetDate: '2026-11-12', revision: 1, description: '用于体验跨项目查看和独立记录的示例项目。' },
      { id: 'p-english', name: '英语口语练习', subtitle: '建立可持续的日常练习', category: '能力积累', color: 'blue', status: 'active', goal: '坚持简短口语练习，积累可复用的纠错记录。', criteria: '完成一周练习，并总结三个最值得改进的表达问题。', targetDate: '2026-11-10', revision: 1, description: '用于体验轻量行动管理的示例项目。' }
    ],
    milestones: [
      { id: 'm-r1', projectId: 'p-research', title: '明确最小验证问题', criteria: '用一句话写清验证问题，列出必要条件与不讨论的范围。', done: true, date: '2026-11-02' },
      { id: 'm-r2', projectId: 'p-research', title: '完成一组可比较的基线', criteria: '使用统一条件保留一组可追溯的基线记录，并说明缺失信息。', done: false, date: '2026-11-09' },
      { id: 'm-r3', projectId: 'p-research', title: '形成阶段结论与下一步', criteria: '关联已有记录，说明结论、局限与下一阶段行动。', done: false, date: '2026-11-15' },
      { id: 'm-c1', projectId: 'p-report', title: '完成汇报提纲', criteria: '明确核心问题，给出三个支持论点及文献来源。', done: false, date: '2026-11-08' },
      { id: 'm-e1', projectId: 'p-english', title: '完成本周练习复盘', criteria: '保留七次练习记录并总结三个表达问题。', done: false, date: '2026-11-10' }
    ],
    tasks: [
      { id: 't-r1', projectId: 'p-research', milestoneId: 'm-r1', title: '写清本轮要验证的核心问题', note: '先用一句话界定目标，避免同时扩展多个方向。', status: 'done', minutes: 25, due: '2026-11-02', today: false },
      { id: 't-r2', projectId: 'p-research', milestoneId: 'm-r1', title: '整理已有资料与观察记录', note: '区分已有事实、暂时假设与仍缺少的信息。', status: 'done', minutes: 40, due: '2026-11-03', today: false },
      { id: 't-r3', projectId: 'p-research', milestoneId: 'm-r2', title: '整理最小验证的条件清单', note: '列出需要统一的条件、记录字段与验收方式。先完成草稿即可。', status: 'doing', minutes: 30, due: '2026-11-04', today: true },
      { id: 't-r4', projectId: 'p-research', milestoneId: 'm-r2', title: '核对基线记录是否可直接比较', note: '当前阻碍：已有记录的条件不够统一，需要先补齐清单。', status: 'waiting', minutes: 30, due: '2026-11-07', today: false },
      { id: 't-r5', projectId: 'p-research', milestoneId: 'm-r2', title: '执行一轮最小基线验证', note: '条件清单确认后开始，保留原始记录。', status: 'todo', minutes: 60, due: '2026-11-09', today: false },
      { id: 't-r6', projectId: 'p-research', milestoneId: 'm-r3', title: '整理阶段成果与局限', note: '只写已有记录支持的发现，保留不确定性。', status: 'todo', minutes: 40, due: '2026-11-14', today: false },
      { id: 't-c1', projectId: 'p-report', milestoneId: 'm-c1', title: '选定汇报的三个核心论点', note: '每个论点关联一篇关键文献。', status: 'todo', minutes: 25, due: '2026-11-06', today: true },
      { id: 't-c2', projectId: 'p-report', milestoneId: 'm-c1', title: '将阅读笔记整理成汇报提纲', note: '先确定逻辑顺序，再考虑页面。', status: 'todo', minutes: 45, due: '2026-11-08', today: false },
      { id: 't-e1', projectId: 'p-english', milestoneId: 'm-e1', title: '完成一次 10 分钟口语练习', note: '录下回答，记住一个需要调整的表达。', status: 'todo', minutes: 10, due: '2026-11-04', today: true }
    ].map(task => ({ ...task, parentId: '', completedOn: ({ 't-r1': '2026-11-01', 't-r2': '2026-11-02' })[task.id] || '', priority: ({ 't-r3': 'high', 't-r4': 'high', 't-e1': 'low' })[task.id] || 'normal' })),
    entries: [
      { id: 'e-r1', projectId: 'p-research', taskId: 't-r1', date: '2026-11-01', createdAt: '2026-11-01T09:30:00+08:00', title: '缩小了本轮研究问题的范围', outcome: '写下核心问题，暂时搁置两个扩展方向。', blocker: '', next: '整理已有资料，确认哪些事实可以支撑最小验证。', kind: 'progress', userCreated: false },
      { id: 'e-r2', projectId: 'p-research', taskId: 't-r2', date: '2026-11-02', createdAt: '2026-11-02T15:00:00+08:00', title: '整理了已有资料和观察记录', outcome: '形成一份示例资料索引，将事实与待验证假设分开。', blocker: '', next: '列出验证条件。', kind: 'progress', userCreated: false },
      { id: 'e-c1', projectId: 'p-report', taskId: '', date: '2026-11-02', createdAt: '2026-11-02T17:20:00+08:00', title: '初步确定了文献汇报主题', outcome: '准备围绕一个核心问题组织内容。', blocker: '', next: '选定三个核心论点。', kind: 'progress', userCreated: false },
      { id: 'e-r3', projectId: 'p-research', taskId: 't-r4', date: '2026-11-03', createdAt: '2026-11-03T14:40:00+08:00', title: '发现基线记录的条件还不统一', outcome: '确认需要先整理条件清单，再比较结果。', blocker: '已有记录缺少统一条件，暂时无法直接比较。', next: '先做清单和验收标准，再开始一轮最小验证。', kind: 'blocker', userCreated: false },
      { id: 'e-e1', projectId: 'p-english', taskId: '', date: '2026-11-03', createdAt: '2026-11-03T20:10:00+08:00', title: '完成一次简短的口语自我介绍', outcome: '保留了一段示例练习记录，发现回答可以更具体。', blocker: '', next: '下一次补充一个具体例子。', kind: 'progress', userCreated: false }
    ],
    completionEvents: [
      { id: 'completion-r1', type: 'task', projectId: 'p-research', taskId: 't-r1', title: '写清本轮要验证的核心问题', date: '2026-11-01', source: 'seed' },
      { id: 'completion-r2', type: 'task', projectId: 'p-research', taskId: 't-r2', title: '整理已有资料与观察记录', date: '2026-11-02', source: 'seed' }
    ],
    reviews: [], revisions: [], feedback: []
  };
}
