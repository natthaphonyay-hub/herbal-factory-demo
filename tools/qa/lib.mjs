// เครื่องมือกลางของทีม QA: เปิดเว็บในเครื่องผ่านเซิร์ฟเวอร์เล็ก เปิด Chrome แบบไม่มีหน้าจอ คุยผ่าน DevTools Protocol
// มีนาฬิกาจำลอง (เลื่อนวันได้) และให้เซิร์ฟเวอร์ตรึงข้อมูลจำลองไว้ที่วันเริ่ม เพื่อจำลองการใช้งานต่อเนื่องหลายเดือน
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.csv': 'text/csv', '.json': 'application/json' };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// state.metaBase: ถ้าตั้งไว้ จะส่ง meta.json ที่แก้ base_date ให้ข้อมูลจำลองเลื่อนเท่าเดิมทุกวันที่จำลอง
export async function startServer() {
  const state = { metaBase: null, hits: 0 };
  const server = createServer(async (req, res) => {
    try {
      const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let body = await readFile(join(ROOT, p === '/' ? 'index.html' : p));
      if (p === '/data/meta.json' && state.metaBase) { const m = JSON.parse(body); m.base_date = state.metaBase; body = Buffer.from(JSON.stringify(m)); }
      state.hits += 1;
      res.writeHead(200, { 'content-type': `${TYPES[extname(p)] || 'application/octet-stream'}; charset=utf-8`, 'cache-control': 'no-store' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { origin: `http://127.0.0.1:${server.address().port}`, state, close: () => server.close() };
}

// นาฬิกาจำลอง ใส่ก่อนสคริปต์ของเว็บทุกครั้งที่เปิดหน้า
export const FAKE_CLOCK = `(() => {
  const RD = Date;
  let fixed = null;
  try { const v = localStorage.getItem('qa-now'); if (v) fixed = Number(v); } catch {}
  let t0 = RD.now();
  window.__qaSetNow = (ms) => { fixed = ms; t0 = RD.now(); try { localStorage.setItem('qa-now', String(ms)); } catch {} };
  const now = () => (fixed == null ? RD.now() : fixed + (RD.now() - t0));
  class QD extends RD { constructor(...a) { if (a.length === 0) super(now()); else super(...a); } static now() { return now(); } }
  QD.UTC = RD.UTC; QD.parse = RD.parse;
  window.Date = QD;
})();`;

export async function launch() {
  const port = 9300 + Math.floor(Math.random() * 600);
  const dir = mkdtempSync(join(tmpdir(), 'hfd-qa-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-ipc-flooding-protection', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore' });
  let first = null;
  for (let i = 0; i < 80 && !first; i++) {
    try { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); first = list.find((t) => t.type === 'page'); } catch { await sleep(200); }
    if (!first) await sleep(150);
  }
  if (!first) throw new Error('เปิด Chrome ไม่ได้');
  const newPage = async () => {
    const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    return connect(t.webSocketDebuggerUrl);
  };
  const firstPage = await connect(first.webSocketDebuggerUrl);
  const close = () => { try { chrome.kill('SIGKILL'); } catch {} try { rmSync(dir, { recursive: true, force: true }); } catch {} };
  return { page: firstPage, newPage, close };
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
  let id = 0;
  const pending = new Map();
  const page = { errors: [], consoleErrors: [], dialogs: [], promptText: 'บอท QA ทดสอบ', dialogAccept: true };
  page.send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
    if (d.method === 'Runtime.exceptionThrown') page.errors.push(d.params.exceptionDetails?.exception?.description || d.params.exceptionDetails?.text || 'exception');
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') page.consoleErrors.push(d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    if (d.method === 'Page.javascriptDialogOpening') {
      page.dialogs.push({ type: d.params.type, message: d.params.message });
      page.send('Page.handleJavaScriptDialog', { accept: page.dialogAccept, promptText: page.promptText });
    }
  });
  page.ev = async (expr) => {
    const r = await page.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text || 'evaluate error');
    return r.result?.result?.value;
  };
  page.ready = async (ms = 15000) => {
    const t = Date.now();
    while (Date.now() - t < ms) {
      try { if (await page.ev(`!!document.querySelector('#main .room-head, #main .locked, #main .doc-bar, #main .panel')`)) return Date.now() - t; } catch {}
      await sleep(60);
    }
    return -1;
  };
  page.open = async (origin, hash = 'overview', width = 1440) => {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 });
    const t = Date.now();
    await page.send('Page.navigate', { url: `${origin}/index.html?r=${Math.random().toString(36).slice(2, 7)}#/${hash}` });
    const w = await page.ready();
    return w < 0 ? -1 : Date.now() - t;
  };
  page.close = () => { try { ws.close(); } catch {} };
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_CLOCK });
  return page;
}

// ตัวช่วยในหน้าเว็บ: ดึงโมดูลของเว็บ (ผ่าน import map ได้ตัวเดียวกับที่เว็บใช้) จับข้อความแจ้งเตือน ปิดกล่องยืนยัน
export const PAGE_HELPERS = `(async () => {
  if (window.qa) return true;
  const data = await import('./assets/data.js');
  const ui = await import('./assets/ui.js');
  const cfg = await import('./assets/config.js');
  const toasts = [];
  const box = document.getElementById('toast');
  if (box) new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.textContent.trim()) toasts.push(n.textContent.trim()); }).observe(box, { childList: true, subtree: true });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const go = async (hash) => { if (location.hash !== hash) { location.hash = hash; await sleep(1); await sleep(1); } else ui.nav.route(); };
  const lastToast = () => toasts[toasts.length - 1] || '';
  window.qa = { data, ui, cfg, toasts, sleep, go, lastToast };
  return true;
})()`;
