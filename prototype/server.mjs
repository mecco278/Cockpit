import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PROTOTYPE_PORT || 4317);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };
const allowed = new Set(['index.html', 'app.js', 'model.js', 'workspace.js', 'dates.js', 'graph.js', 'views-v3.js', 'styles.css', 'refinements.css', 'evolution.css', 'favicon.svg']);
const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
async function serviceWorker() {
  const names = ['service-worker.js', ...allowed];
  const files = await Promise.all(names.map(name => readFile(path.join(root, name))));
  const hash = createHash('sha256');
  files.forEach((contents, i) => hash.update(`${names[i]}:${contents.length}:`).update(contents));
  const urls = ['/', ...[...allowed].filter(name => name !== 'index.html').map(name => `/${name}`)];
  return `const SHELL_ID = ${JSON.stringify(hash.digest('hex'))};\nconst SHELL_URLS = ${JSON.stringify(urls)};\n${files[0]}`;
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/health' && ['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ app: 'xingjin-prototype', version }));
      return;
    }
    const name = decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
    if (!['GET', 'HEAD'].includes(req.method) || (!allowed.has(name) && name !== 'service-worker.js')) { res.writeHead(404); res.end('Not found'); return; }
    const body = name === 'service-worker.js' ? await serviceWorker() : await readFile(path.join(root, name));
    res.writeHead(200, { 'Content-Type': types[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(400); res.end('Bad request'); }
});
server.on('error', err => { console.error(err.code === 'EADDRINUSE' ? `端口 ${port} 已被占用。如果原型已启动，请访问 http://127.0.0.1:${port}；或设置 PROTOTYPE_PORT 后重试。` : err.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`Cockpit 原型 Local: ${url}\n仅监听本机。按 Ctrl+C 停止。`);
  if (process.argv.includes('--open') && process.platform === 'win32') {
    const child = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => console.log(`请在浏览器中打开 ${url}`)); child.unref();
  }
});
