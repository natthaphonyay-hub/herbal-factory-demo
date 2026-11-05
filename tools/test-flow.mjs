// ทีมตรวจการใช้งาน: เปิดเว็บใน Chrome แบบไม่มีหน้าจอ แล้วลองใช้งานจริงตามลำดับ
// ตรวจ 3 เรื่อง: ทุกหน้าไม่ล้นจอที่ความกว้างมือถือและแท็บเล็ต, สิทธิ์ตามบทบาท, งานทั้งสายตั้งแต่รับของถึงปล่อยผ่านและเดินงานผลิต
// วิธีรัน: node tools/test-flow.mjs   (ต้องมี Google Chrome ในเครื่อง)

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.csv': 'text/csv', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const body = await readFile(join(ROOT, p === '/' ? 'index.html' : p));
    res.writeHead(200, { 'content-type': `${TYPES[extname(p)] || 'application/octet-stream'}; charset=utf-8` });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/index.html`;

const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'hfd-'))}`, 'about:blank'], { stdio: 'ignore' });
let ws;
for (let i = 0; i < 50 && !ws; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = list.find((t) => t.type === 'page');
    if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
  } catch { await new Promise((r) => setTimeout(r, 200)); }
}
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'evaluate error');
  return r.result?.result?.value;
}
async function open(hash, width = 1440) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 });
  await send('Page.navigate', { url: `${BASE}#/${hash}` });
  for (let i = 0; i < 60; i++) { await sleep(150); if (await ev(`!!document.querySelector('#main .lead, #main section')`)) break; }
  await sleep(200);
}
async function go(hash) { await ev(`location.hash = ${JSON.stringify(`#/${hash}`)}`); await sleep(400); }

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); };

await send('Page.enable');
await send('Runtime.enable');

// 1 ไม่ล้นจอ
const pages = ['overview', 'board', 'stock?tab=list', 'stock?tab=card', 'stock?tab=receive', 'stock?tab=issue', 'purchase', 'qc', 'sales', 'trace?lot=50017001', 'log'];
for (const w of [390, 768]) {
  const bad = [];
  for (const p of pages) {
    await open(p, w);
    const over = await ev(`(() => { const W = document.documentElement.clientWidth; const out = [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); if (r.width === 0) return false; let a = e.parentElement; while (a) { const s = getComputedStyle(a); if (s.overflowX === 'auto' || s.overflowX === 'hidden' || s.overflowX === 'scroll') return false; a = a.parentElement; } return r.right > W + 1; }).map((e) => (e.tagName + '.' + String(e.className).split(' ')[0] + ' ' + Math.round(e.getBoundingClientRect().right))); return { sw: document.documentElement.scrollWidth, W, out: out.slice(0, 4) }; })()`);
    if (over.sw > over.W + 1) bad.push(`${p} กว้าง ${over.sw}px (${over.out.join(', ')})`);
  }
  check(`ทุกหน้าไม่ล้นจอที่ความกว้าง ${w}px`, bad.length === 0, bad.join(' | '));
}

// 2 สิทธิ์ตามบทบาท และงานทั้งสาย
await open('overview', 1440);
await ev(`localStorage.clear()`);
await open('qc', 1440);
const setUser = (u) => ev(`(() => { const s = document.querySelector('#user'); s.value = '${u}'; s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; })()`);
await setUser('U00');
await sleep(300);
const firstLot = await ev(`document.querySelector('[data-act="release"]')?.dataset.lot`);
await ev(`document.querySelector('[data-act="release"]').click()`);
await sleep(300);
const stillHold = await ev(`!!document.querySelector('[data-act="release"][data-lot="${firstLot}"]')`);
check('หัวหน้ากลุ่มงานปล่อยผ่านไม่ได้ (เฉพาะหัวหน้าฝ่ายควบคุมคุณภาพ)', stillHold === true);

await setUser('U01');
await go('stock?tab=receive&item=91004');
const po = await ev(`(() => { const s = document.querySelector('[name="po"]'); const o = [...s.options].find((x) => x.value); s.value = o ? o.value : ''; return s.value; })()`);
await ev(`(() => { const f = document.querySelector('[data-form="receive"]'); f.qty.value = '3000'; f.requestSubmit(); })()`);
await sleep(500);
const newLot = await ev(`[...document.querySelectorAll('[data-act="release"]')].map((b) => b.dataset.lot).find((x) => x.startsWith('R'))`);
check('คลังรับหลอดตามใบสั่งซื้อแล้ว ล็อตใหม่ขึ้นคิวรอปล่อยผ่าน', !!po && !!newLot, `ใบสั่งซื้อ ${po} ล็อต ${newLot}`);

await setUser('U05');
await sleep(300);
await ev(`document.querySelector('[data-act="release"][data-lot="${newLot}"][data-res="ผ่าน"]').click()`);
await sleep(400);
const released = await ev(`!document.querySelector('[data-act="release"][data-lot="${newLot}"]')`);
check('หัวหน้าฝ่ายควบคุมคุณภาพปล่อยผ่านได้ ป้ายเปลี่ยนเป็นตรวจสอบแล้ว', released === true);

await setUser('U03');
await go('board?lane=ผลิต');
const blockedJob = await ev(`(() => { const c = [...document.querySelectorAll('.card')].find((x) => x.textContent.includes('หยุด รอ')); return c ? c.dataset.job : null; })()`);
await ev(`document.querySelector('[data-act="move"][data-job="${blockedJob}"][data-dir="1"]').click()`);
await sleep(400);
const nowStage = await ev(`(() => { const c = document.querySelector('.card[data-job="${blockedJob}"]'); return c ? c.closest('[data-drop]').dataset.drop + (c.textContent.includes('หยุด รอ') ? ' (ยังหยุด)' : '') : 'ไม่พบ'; })()`);
check('งานผลิตครีมไพลที่หยุดรอหลอด เดินต่อได้หลังรับหลอดและปล่อยผ่าน', nowStage === 'ผลิต', `${blockedJob} อยู่ขั้น ${nowStage}`);

await go('stock?tab=card&item=91004');
const cardRows = await ev(`document.querySelectorAll('tr.row-new').length`);
check('บัตรคุมวัสดุ FM-02 ของหลอดมีรายการรับและเบิกใหม่', cardRows >= 2, `${cardRows} รายการใหม่`);

await go('log');
const logRows = await ev(`document.querySelectorAll('#main tbody tr').length`);
check('ประวัติการแก้ไขบันทึกครบทุกการกระทำ (รับเข้า ปล่อยผ่าน ย้ายงาน)', logRows === 3, `${logRows} รายการ`);

await ev(`localStorage.clear()`);
let fail = 0;
for (const r of results) { console.log(`${r.ok ? 'ผ่าน   ' : 'ไม่ผ่าน'}  ${r.name}${r.detail ? `  [${r.detail}]` : ''}`); if (!r.ok) fail++; }
console.log(`\nสรุป: ผ่าน ${results.length - fail} จาก ${results.length} ข้อ`);
ws.close();
chrome.kill();
server.close();
process.exit(fail ? 1 : 0);
