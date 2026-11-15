import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const require = createRequire(import.meta.url);
const { chromium } = require(option('--playwright-path', process.env.PLAYWRIGHT_PACKAGE || 'playwright'));

const socket = createServer().listen(0, '127.0.0.1');
await once(socket, 'listening');
const { port } = socket.address();
await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [fileURLToPath(new URL('../server.mjs', import.meta.url))], {
  env: { ...process.env, PROTOTYPE_PORT: String(port) }, windowsHide: true, stdio: 'ignore',
});
const serverExit = once(server, 'exit');
let browser;
try {
  let healthy = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { healthy = (await fetch(`${origin}/health`)).ok; } catch { /* Wait for the test server. */ }
    if (healthy) break;
    await delay(100);
  }
  assert.ok(healthy, 'Test server did not start');
  browser = await chromium.launch({ headless: true, executablePath: option('--browser-path', 'C:/Program Files/Google/Chrome/Application/chrome.exe') });
  const context = await browser.newContext();
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/?v=0.3.1#today`);
  await page.locator('.brand').waitFor();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
  await page.close();

  server.kill();
  await serverExit;
  await assert.rejects(fetch(`${origin}/health`), 'The test server must actually be stopped');

  const offlinePage = await context.newPage();
  offlinePage.on('pageerror', error => errors.push(error.message));
  const response = await offlinePage.goto(`${origin}/?v=0.3.1#today`);
  assert.ok(response?.fromServiceWorker(), 'The disconnected page must come from the offline copy');
  await offlinePage.getByRole('button', { name: '新增项目', exact: true }).first().click();
  await offlinePage.locator('input[name="name"]').fill('离线恢复验证项目');
  await offlinePage.locator('textarea[name="goal"]').fill('服务停止后仍然能创建项目');
  await offlinePage.locator('textarea[name="criteria"]').fill('刷新后能继续查看该项目');
  await offlinePage.getByRole('button', { name: '创建项目', exact: true }).click();
  const heading = offlinePage.getByRole('heading', { name: '离线恢复验证项目', exact: true });
  await heading.waitFor();
  await offlinePage.reload();
  await heading.waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: reopened Cockpit after actual server shutdown, created a project offline, and retained it after reload.');
} finally {
  try { if (browser) await browser.close(); }
  finally { if (!server.killed && server.exitCode === null) { server.kill(); await serverExit; } }
}
