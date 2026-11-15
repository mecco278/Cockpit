import { tasksFor, taskProgress, metrics } from './model.js';

export function layoutTaskGraph(state, projectId, expandedIds = state.settings.expandedTaskIds, compact = false) {
  const project = state.projects.find(project => project.id === projectId);
  const rootId = 'project:' + projectId, expanded = new Set(expandedIds);
  const tasks = tasksFor(state, projectId), byParent = new Map();
  for (const task of tasks) { const key = task.parentId || rootId; const list = byParent.get(key) || []; list.push(task); byParent.set(key, list); }
  const nodes = [], stack = [{ id: rootId, task: null, parentId: '', depth: 0 }];
  while (stack.length) {
    const node = stack.pop(), children = byParent.get(node.id) || [];
    node.childCount = children.length; node.expanded = !node.task || expanded.has(node.id);
    const stats = node.task ? taskProgress(state, node.task.id) : metrics(state, projectId);
    node.progress = node.task ? stats : { done: stats.done, total: stats.tasks, status: project.status === 'completed' || (stats.tasks > 0 && stats.done === stats.tasks) ? 'done' : stats.done > 0 ? 'doing' : 'todo', grouped: true };
    node.label = node.task?.title || project.name; node.project = project;
    node.children = node.expanded ? children.map(task => task.id) : [];
    nodes.push(node);
    if (node.expanded) stack.push(...children.toReversed().map(task => ({ id: task.id, task, parentId: node.id, depth: node.depth + 1 })));
  }
  const [width, height, gapX, gapY] = compact ? [148, 70, 16, 40] : [244, 154, 30, 65];
  const byId = new Map(nodes.map(node => [node.id, node]));
  for (const node of nodes.toReversed()) node.span = Math.max(width, node.children.reduce((sum, id) => sum + byId.get(id).span, 0) + Math.max(0, node.children.length - 1) * gapX);
  const root = byId.get(rootId); root.left = 28;
  for (const node of nodes) {
    node.x = node.left + (node.span - width) / 2; node.y = 28 + node.depth * (height + gapY); node.width = width; node.height = height;
    let left = node.left + (node.span - node.children.reduce((sum, id) => sum + byId.get(id).span, 0) - Math.max(0, node.children.length - 1) * gapX) / 2;
    for (const id of node.children) { const child = byId.get(id); child.left = left; left += child.span + gapX; }
  }
  const edges = nodes.filter(node => node.parentId).map(node => {
    const parent = byId.get(node.parentId), x1 = parent.x + width / 2, y1 = parent.y + height, x2 = node.x + width / 2, y2 = node.y;
    return { id: parent.id + ':' + node.id, from: parent.id, to: node.id, done: node.progress.status === 'done', path: `M${x1},${y1} V${y1 + gapY / 2} H${x2} V${y2}` };
  });
  return { nodes, edges, width: root.span + 56, height: Math.max(...nodes.map(node => node.y + height)) + 28 };
}
