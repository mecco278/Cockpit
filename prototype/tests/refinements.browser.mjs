import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { createSeed } from './fixtures/demo-workspace.js';

const require = createRequire(import.meta.url), args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const { chromium } = require(option('--playwright-path', process.env.PLAYWRIGHT_PACKAGE || 'playwright'));
const executablePath = option('--browser-path', 'C:/Program Files/Google/Chrome/Application/chrome.exe');
const origin = option('--url', 'http://127.0.0.1:4317');
const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../test-results/refinements');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 });
const page = await context.newPage(), errors = [], checks = [], responsive = [];
page.on('pageerror', error => errors.push(error.message));
const readState = () => page.evaluate(() => JSON.parse(localStorage.getItem('xingjin.prototype.workspace.v1')));
const treeRow = id => page.locator(`[data-tree-id="${id}"]`);

async function addChild(parentId, title) {
  if (await page.locator('.graph-panel').count()) await page.getByRole('button', { name: '折叠列表', exact: true }).click();
  await treeRow(parentId).locator('[data-action="split-task"]').click();
  await page.locator('form input[name="title"]').fill(title);
  await page.getByRole('button', { name: '添加子事项', exact: true }).click();
  return (await readState()).tasks.find(task => task.title === title);
}
async function contrastAudit(selector = 'main *, .sidebar *, .topbar *') {
  return page.evaluate(selector => {
    const rgba = value => (value.match(/[\d.]+/g) || []).map(Number);
    const luminance = color => color.slice(0, 3).map(v => { const x = v / 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const ratio = (fg, bg) => { const a = luminance(fg), b = luminance(bg); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
    const results = [];
    for (const element of document.querySelectorAll(selector)) {
      if (!element.getBoundingClientRect().width || !element.getBoundingClientRect().height || ![...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim()) || ['OPTION', 'SCRIPT', 'STYLE'].includes(element.tagName)) continue;
      const style = getComputedStyle(element), foreground = rgba(style.color);
      if (style.visibility !== 'visible' || Number(style.opacity) === 0 || foreground.length < 3) continue;
      let parent = element, background = [255, 255, 255];
      while (parent) { const value = rgba(getComputedStyle(parent).backgroundColor); if (value.length === 3 || value[3] === 1) { background = value; break; } parent = parent.parentElement; }
      const value = ratio(foreground, background), size = parseFloat(style.fontSize), bold = parseInt(style.fontWeight) >= 700;
      const threshold = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      results.push({ text: element.textContent.trim().slice(0, 55), ratio: Number(value.toFixed(2)), threshold, className: element.className });
    }
    return results.filter(result => result.ratio + .01 < result.threshold).sort((a, b) => a.ratio - b.ratio);
  }, selector);
}
try {
  await page.goto(origin);
  const legacy = createSeed(); legacy.schemaVersion = 1;
  delete legacy.settings.expandedTaskIds;
  legacy.tasks.forEach(task => { delete task.priority; delete task.parentId; });
  legacy.tasks[2].title = '升级前已保存的条件清单';
  await page.evaluate(state => localStorage.setItem('xingjin.prototype.workspace.v1', JSON.stringify(state)), legacy);
  await page.reload();
  await page.getByRole('heading', { name: '今日工作台', exact: true }).waitFor();
  assert.match(await page.title(), /Cockpit/);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('xingjin.prototype.workspace.v1.before-v3'))), legacy);
  const colors = new Set();
  for (const priority of ['urgent', 'high', 'normal', 'low', 'urgent']) {
    await page.locator('[data-daily-task="t-r3"] [data-control="task-priority"]').selectOption(priority);
    const row = page.locator('[data-daily-task="t-r3"]');
    assert.equal(await row.getAttribute('data-priority'), priority);
    colors.add(await row.evaluate(el => getComputedStyle(el).backgroundColor));
  }
  assert.equal(colors.size, 4);
  let state = await readState();
  assert.equal(state.schemaVersion, 3);
  assert.equal(state.tasks[2].title, legacy.tasks[2].title);
  assert.deepEqual(state.entries, legacy.entries);
  assert.equal(state.tasks[2].status, 'doing');
  await page.reload();
  assert.equal(await page.locator('.today-task').first().getAttribute('data-daily-task'), 't-r3');
  assert.equal(await page.locator('[data-daily-task="t-r3"]').getAttribute('data-priority'), 'urgent');
  await page.screenshot({ path: path.join(output, 'cockpit-desktop.png'), fullPage: true });
  checks.push('Cockpit 命名、四档颜色与紧急程度、刷新保持、旧记录迁移及原文副本');
  await page.locator('[data-daily-task="t-r3"] [data-action="split-task"]').click();
  await page.locator('form input[name="title"]').fill('列出本轮输入条件');
  await page.getByRole('button', { name: '添加子事项', exact: true }).click();
  await page.getByRole('tab', { name: '行动树', exact: true }).waitFor();
  assert.equal(await page.getByRole('tab', { name: '行动树', exact: true }).getAttribute('aria-selected'), 'true');
  state = await readState();
  const child = state.tasks.find(t => t.title === '列出本轮输入条件');
  assert.equal(child.today, true);
  assert.equal(state.tasks.find(t => t.id === 't-r3').today, false);
  const sibling = await addChild('t-r3', '列出本轮验收方式');
  const grandchild = await addChild(child.id, '核对记录字段是否齐全');
  await treeRow(grandchild.id).locator('[data-action="split-task"]').click();
  await page.getByText('这次会拆到第 4 层或更深。', { exact: false }).waitFor();
  await page.locator('form input[name="title"]').fill('补齐缺失字段并保留说明');
  await page.getByRole('button', { name: '添加子事项', exact: true }).click();
  state = await readState();
  const deepest = state.tasks.find(t => t.title === '补齐缺失字段并保留说明');
  assert.equal(await treeRow(deepest.id).getByText('第 4 层', { exact: true }).count(), 1);
  assert.match(await treeRow('t-r3').innerText(), /0 \/ 2 最末级行动完成/);
  await treeRow('t-r3').locator('[data-action="toggle-branch"]').click();
  assert.equal(await treeRow(child.id).count(), 0);
  await page.reload(); await page.getByRole('tab', { name: '行动树', exact: true }).click(); if (await page.locator('.graph-panel').count()) await page.getByRole('button', { name: '折叠列表', exact: true }).click();
  assert.equal(await treeRow(child.id).count(), 0);
  await page.getByRole('button', { name: '展开全部', exact: true }).click();
  await treeRow('t-r3').locator('.title-button').click();
  await page.getByRole('dialog').getByRole('button', { name: '记进展', exact: true }).click();
  assert.equal(await page.locator('form select[name="taskStatus"]').isDisabled(), true);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: path.join(output, 'task-tree-desktop.png'), fullPage: true });
  await page.getByRole('tab', { name: '行动看板', exact: true }).click();
  assert.equal(await page.locator('[data-task-id="t-r3"]').count(), 0);
  assert.equal(await page.locator(`[data-task-id="${child.id}"]`).count(), 0);
  await page.locator(`[data-control="task-status"][data-id="${deepest.id}"]`).selectOption('done');
  await page.locator(`[data-control="task-status"][data-id="${sibling.id}"]`).selectOption('done');
  await page.getByRole('tab', { name: '行动树', exact: true }).click(); if (await page.locator('.graph-panel').count()) await page.getByRole('button', { name: '折叠列表', exact: true }).click();
  assert.match(await treeRow('t-r3').innerText(), /2 \/ 2 最末级行动完成/);
  checks.push('四层子事项、深层提示、展开折叠持久化、父项进度汇总及看板去重');
  const contrastFailures = [];
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    for (const hash of ['#today', '#project/p-research', '#progress', '#review/p-research']) {
      await page.goto(origin + '/' + hash);
      if (hash.includes('project')) await page.getByRole('tab', { name: '行动树', exact: true }).click(); if (await page.locator('.graph-panel').count()) await page.getByRole('button', { name: '折叠列表', exact: true }).click();
      const dimensions = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
      assert.ok(dimensions.content <= width + 1, `${width} ${hash} 横向溢出`);
      responsive.push({ width, hash, ...dimensions });
      const failures = await contrastAudit();
      if (failures.length) contrastFailures.push({ width, hash, failures });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto(origin + '/#project/p-research');
  const boardFailures = await contrastAudit();
  if (boardFailures.length) contrastFailures.push({ view: 'board', failures: boardFailures });
  await page.getByRole('button', { name: '新增行动', exact: true }).click();
  const taskFormFailures = await contrastAudit('dialog *');
  if (taskFormFailures.length) contrastFailures.push({ view: 'new-task-dialog', failures: taskFormFailures });
  await page.keyboard.press('Escape');
  await page.goto(origin + '/#review/p-research');
  await page.getByRole('button', { name: '生成本次复盘', exact: true }).first().click();
  const generatedFailures = await contrastAudit();
  if (generatedFailures.length) contrastFailures.push({ view: 'generated-review', failures: generatedFailures });
  await page.getByRole('button', { name: '预览计划调整', exact: true }).click();
  const adjustmentFailures = await contrastAudit('dialog *');
  if (adjustmentFailures.length) contrastFailures.push({ view: 'adjustment-dialog', failures: adjustmentFailures });
  await page.keyboard.press('Escape');
  checks.push('行动看板、已生成复盘、新建行动和计划调整弹窗的文字对比度');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + '/#project/p-research'); await page.getByRole('tab', { name: '行动树', exact: true }).click(); if (await page.locator('.graph-panel').count()) await page.getByRole('button', { name: '折叠列表', exact: true }).click();
  await page.screenshot({ path: path.join(output, 'task-tree-mobile.png'), fullPage: true });
  await page.goto(origin + '/#today');
  await page.screenshot({ path: path.join(output, 'cockpit-mobile.png'), fullPage: true });
  assert.deepEqual(errors, []);
  const report = { passed: !contrastFailures.length, browser: browser.version(), checks, responsive, contrastFailures, errors };
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.equal(contrastFailures.length, 0, '有可见文字的对比度低于目标，见报告');
} finally { await browser.close(); }
