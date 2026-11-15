import { currentDate } from './dates.js';

export const STATUS = { todo: '待办', doing: '进行中', waiting: '等待中', done: '已完成' };
export const PROJECT_STATUS = { active: '进行中', paused: '已暂停', completed: '已完成' };
export const PRIORITY = { urgent: { label: '紧急', color: '红色', rank: 0 }, high: { label: '重要', color: '橙色', rank: 1 }, normal: { label: '常规', color: '白色', rank: 2 }, low: { label: '从容', color: '蓝色', rank: 3 } };

export function createEmptyWorkspace() {
  return {
    schemaVersion: 3,
    workspaceKind: 'personal',
    scenarioDate: currentDate(),
    settings: { guide: true, welcomed: false, expandedTaskIds: [] },
    projects: [],
    milestones: [],
    tasks: [],
    entries: [],
    completionEvents: [],
    reviews: [],
    revisions: [],
    feedback: [],
  };
}
