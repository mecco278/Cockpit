import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session, shell } from 'electron';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeBackup, openWorkspaceStore } from './workspace-store.mjs';

const scheme = 'cockpit', base = 'cockpit://app/';
const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, '..', 'prototype');
const files = new Set(['index.html', 'app.js', 'desktop-repository.js', 'model.js', 'workspace.js', 'dates.js', 'graph.js', 'views-v3.js', 'styles.css', 'refinements.css', 'evolution.css', 'favicon.svg']);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
const testRoot = process.env.COCKPIT_DESKTOP_TEST_ROOT;
const dataRoot = testRoot ? path.resolve(testRoot) : path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'Cockpit');
let store, mainWindow;

protocol.registerSchemesAsPrivileged([{ scheme, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
app.setName('Cockpit');
app.setAppUserModelId('Cockpit.Personal.Windows');
const profile = path.join(dataRoot, 'Profile');
mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);

function isAppPage(url) {
  try { const parsed = new URL(url); return parsed.protocol === scheme + ':' && parsed.host === 'app' && ['/', '/index.html'].includes(parsed.pathname); }
  catch { return false; }
}
function installChannels() {
  const register = (name, handler) => ipcMain.handle('cockpit:' + name, async (event, ...args) => {
    if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== event.sender.mainFrame || !isAppPage(event.senderFrame?.url)) {
      return { ok: false, error: '操作来源无效。' };
    }
    try { return { ok: true, value: await handler(...args) }; }
    catch (error) { return { ok: false, error: error.message || '操作失败，未保存。' }; }
  });
  register('load', () => store.load());
  register('commit', (workspace, revision) => store.commit(workspace, revision));
  register('inspect', raw => decodeBackup(raw));
  register('restore', (raw, revision) => store.restore(raw, revision));
  register('reset', revision => store.reset(revision));
  register('backup', () => store.backup());
  register('open-backups', async () => {
    const { backupDir } = store.status();
    mkdirSync(backupDir, { recursive: true });
    const error = await shell.openPath(backupDir);
    if (error) throw new Error('无法打开备份目录。');
  });
  register('export', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出 Cockpit 备份',
      defaultPath: path.join(app.getPath('documents'), 'Cockpit-备份.json'),
      filters: [{ name: 'Cockpit JSON 备份', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return false;
    store.exportTo(result.filePath);
    return true;
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(async () => {
    store = openWorkspaceStore(dataRoot);
    store.load(); // Refuse to start over a corrupt or unsupported workspace.
    protocol.handle(scheme, request => {
      const url = new URL(request.url);
      const filename = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (url.host !== 'app' || !files.has(filename) || !['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 404 });
      return new Response(request.method === 'HEAD' ? null : readFileSync(path.join(assets, filename)), {
        headers: { 'Content-Type': types[path.extname(filename)], 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }
      });
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    // Remove older UI cache entries when reusing the same portable app folder.
    await session.defaultSession.clearCache().catch(() => {});
    Menu.setApplicationMenu(null);
    installChannels();
    mainWindow = new BrowserWindow({
      width: 1280, height: 920, minWidth: 700, minHeight: 540, show: !testRoot, backgroundColor: '#f2f4ee',
      webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }
    });
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event, url) => { if (!isAppPage(url)) event.preventDefault(); });
    await mainWindow.loadURL(base);
  }).catch(error => {
    if (testRoot) console.error(error.message);
    else dialog.showErrorBox('Cockpit 无法打开数据', `请保留原工作空间及备份。\n位置：${dataRoot}\n\n${error.message}`);
    app.exit(1);
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => store?.close());
}
