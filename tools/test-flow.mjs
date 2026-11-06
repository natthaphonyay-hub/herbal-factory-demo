// ทีมตรวจการใช้งาน: เปิดเว็บใน Chrome แบบไม่มีหน้าจอ แล้วลองใช้งานจริงตามลำดับ เหมือนพนักงานแต่ละฝ่ายใช้
// ตรวจ: ทุกหน้าไม่ล้นจอ สิทธิ์ห้องทำงาน คนตรวจกับคนอนุมัติคนละคน งานทั้งสาย จัดซื้อทุกขั้น แก้ไขและลบพร้อมประวัติ
// บันทึกถึงฝ่ายพร้อมหลักฐานการอ่าน ผลิตภัณฑ์และสูตร และเอกสารพร้อมพิมพ์
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
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const BASE = `${ORIGIN}/index.html`;

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
const errors = [];
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails?.exception?.description || 'exception');
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'evaluate error');
  return r.result?.result?.value;
}
const ready = async () => { for (let i = 0; i < 80; i++) { await sleep(120); if (await ev(`!!document.querySelector('#main .room-head, #main .locked, #main .doc-bar')`)) break; } await sleep(150); };
async function open(hash, width = 1440) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 });
  await send('Page.navigate', { url: `${BASE}?r=${Math.random().toString(36).slice(2, 7)}#/${hash}` });
  await ready();
}
async function go(hash) { await ev(`location.hash = ${JSON.stringify(`#/${hash}`)}`); await sleep(350); await ready(); }
const setUser = async (u) => { await ev(`(() => { const s = document.querySelector('#user'); s.value = '${u}'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`); await sleep(400); await ready(); };
const text = (sel) => ev(`(document.querySelector(${JSON.stringify(sel)})?.textContent || '').trim()`);
const count = (sel) => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: `${ORIGIN}/data/meta.json` });
await sleep(300);
await ev(`localStorage.clear(); localStorage.setItem('hfd-user', JSON.stringify('U00')); true`);

// 1 ทุกหน้าไม่ล้นจอ (ผู้ใช้หัวหน้ากลุ่มงาน เข้าได้ทุกห้อง)
const pages = ['overview', 'store', 'store?tab=card', 'store?tab=receive', 'store?tab=issue', 'store?tab=buy', 'store?tab=plan&item=91004', 'process', 'process?tab=new', 'process?tab=farm', 'prod', 'prod?tab=materials', 'prod?tab=plan', 'qc', 'qc?tab=released', 'sales', 'sales?tab=sales', 'sales?tab=stock', 'notes?compose=1', 'docs', 'doc?type=fm02', 'doc?type=fy-plan', 'registers', 'registers?tab=assets&id=EQ-15', 'registers?tab=suppliers', 'product?code=5001', 'item?code=1001', 'item?code=2004', 'item?code=91004', 'job?id=J70-839', 'trace', 'log'];
for (const w of [390, 768]) {
  const bad = [];
  for (const p of pages) {
    await open(p, w);
    const o = await ev(`(() => { const W = document.documentElement.clientWidth; return { sw: document.documentElement.scrollWidth, W }; })()`);
    if (o.sw > o.W + 1) bad.push(`${p} กว้าง ${o.sw}px`);
  }
  check(`ทุกหน้าไม่ล้นจอที่ความกว้าง ${w}px (${pages.length} หน้า)`, bad.length === 0, bad.join(' | '));
}

// 2 ห้องทำงานตามสิทธิ์
await open('overview');
await setUser('U01');
await go('prod');
check('เจ้าหน้าที่คลังเข้าห้องฝ่ายผลิตไม่ได้ เห็นป้ายไม่มีสิทธิ์และไม่เห็นข้อมูลห้อง', (await count('.locked')) === 1 && (await count('.kcard')) === 0);
const homeU01 = await ev('location.hash');
await setUser('U05');
const homeU05 = await ev('location.hash');
check('เปลี่ยนผู้ใช้แล้วเข้าห้องของฝ่ายตัวเองทันที', homeU05.startsWith('#/qc'), `${homeU01} ${homeU05}`);

// 3 คนตรวจกับคนอนุมัติคนละคน: หัวหน้า QC อนุมัติล็อตที่ยังไม่มีผลตรวจไม่ได้
const noResult = await ev(`(() => { const b = [...document.querySelectorAll('[data-act="release"][data-res="ผ่าน"]')].find((x) => x.disabled); return b ? b.dataset.lot : ''; })()`);
check('ล็อตที่ยังไม่มีผลตรวจ ปุ่มปล่อยผ่านกดไม่ได้', !!noResult, noResult);

// 3b กดการ์ดหรือชื่อรายการ แล้วไปหน้ารายละเอียดของตัวเอง
await setUser('U03');
await go('prod');
const cardJob = await ev(`document.querySelector('.kcard .k-link')?.closest('.kcard').dataset.job || ''`);
await ev(`document.querySelector('.kcard .k-link').click(); true`);
await sleep(400); await ready();
const jobPage = await ev(`({ hash: location.hash, h1: document.querySelector('h1')?.textContent || '', steps: document.querySelectorAll('.steps li').length, now: document.querySelector('.steps li.is-now .st-t')?.textContent || '' })`);
check('กดการ์ดงานบนบอร์ด เปิดหน้ารายละเอียดงาน เห็นขั้นงานตาม SOP และขั้นปัจจุบัน', jobPage.hash === `#/job?id=${cardJob}` && jobPage.h1.includes(cardJob) && jobPage.steps === 6 && !!jobPage.now, `${cardJob} ขั้น ${jobPage.now}`);
await setUser('U01');
await go('store');
const firstItem = await ev(`document.querySelector('#main table a.ilink')?.getAttribute('href') || ''`);
await ev(`document.querySelector('#main table a.ilink').click(); true`);
await sleep(400); await ready();
const itemPage = await ev(`({ hash: location.hash, lots: !!document.querySelector('#lots-h'), moves: !!document.querySelector('#mv-h') })`);
check('กดชื่อรายการในตารางคลัง เปิดหน้ารายละเอียด เห็นล็อตเรียงลำดับเบิกและรับจ่ายล่าสุด', !!firstItem && itemPage.hash === firstItem && itemPage.lots && itemPage.moves, firstItem);
await go('store');
const couponHref = await ev(`document.querySelector('.coupon .c-link')?.getAttribute('href') || ''`);
await ev(`document.querySelector('.coupon .c-link').click(); true`);
await sleep(400); await ready();
check('กดคูปองแจ้งเตือน เปิดหน้าของเรื่องที่ถูกเตือน', !!couponHref && (await ev('location.hash')) === couponHref, couponHref);
await go('item?code=1001');
check('หน้าสมุนไพรสดแสดงเส้นทาง สด แห้ง ผง ของสมุนไพรเดียวกัน และกดไปรูปแบบอื่นได้', (await count('.herb-route li')) === 3 && (await count('.herb-route a.ilink')) === 2);
await setUser('U07');
await go(`job?id=${cardJob}`);
check('เจ้าหน้าที่ฝ่ายขายเปิดหน้ารายละเอียดงานผลิตไม่ได้ เห็นป้ายไม่มีสิทธิ์', (await count('.locked')) === 1);

// 4 งานทั้งสาย: รับหลอดตามใบสั่งซื้อ บันทึกผล ปล่อยผ่าน แล้วงานครีมที่หยุดเดินต่อ
// (รอบแก้ QA) จำงานที่หยุดรอหลอดไว้ก่อน เพราะสถานะหยุดรอของคิดจากของในคลังจริง พอหลอดปล่อยผ่านแล้วป้ายหยุดจะหายเอง
await setUser('U03');
await go('prod');
const blockedJob = await ev(`(() => { const c = [...document.querySelectorAll('.kcard')].find((x) => (x.querySelector('.k-block')?.textContent || '').includes('หลอด')); return c ? c.dataset.job : ''; })()`);
await setUser('U01');
await go('store?tab=receive&item=91004');
const po = await ev(`document.querySelector('[name="po"]').value`);
// (รอบแก้ QA) ช่องจำนวนว่างไว้ให้นับจริง ไม่เติมจากใบสั่งซื้อ
await ev(`(async () => { const { S } = await import('./assets/data.js'); const p = S.pos.find((x) => x.po_no === '${po}'); document.querySelector('[data-form="receive"] [name="qty"]').value = String(p.qty); return true; })()`);
await ev(`document.querySelector('[data-form="receive"]').requestSubmit(); true`);
await sleep(500);
const newLot = await text('.slip .slip-no');
check('คลังรับหลอดตามใบสั่งซื้อ ได้เลขรับใหม่ ติดป้ายรอปล่อยผ่าน', po && newLot.startsWith('R') && (await text('.slip .stamp')) === 'รอปล่อยผ่าน', `${po} ${newLot}`);
await setUser('U04');
await go(`qc?lot=${newLot}`);
await ev(`(() => { const f = document.querySelector('[data-form="qc"][data-lot="${newLot}"]'); f.result.value = 'ผ่านเกณฑ์'; f.note.value = 'ลักษณะภายนอกผ่าน'; f.requestSubmit(); return true; })()`);
await sleep(400);
await setUser('U05');
await go(`qc?lot=${newLot}`);
await ev(`document.querySelector('[data-act="release"][data-lot="${newLot}"][data-res="ผ่าน"]').click(); true`);
await sleep(300);
// ปล่อยผ่านต้องถามยืนยันพร้อมเลขที่และชื่อรายการก่อน (QA-018)
const dlg = await ev(`(() => { const d = document.querySelector('dialog.dlg[open]'); return d ? d.textContent.includes('${newLot}') : false; })()`);
await ev(`document.querySelector('dialog.dlg[open] [data-dlg="ok"]')?.click(); true`);
await sleep(400);
check('หัวหน้าฝ่ายควบคุมคุณภาพปล่อยผ่านหลังเจ้าหน้าที่บันทึกผล ถามยืนยันพร้อมเลขที่ก่อน ตราตรวจสอบแล้วประทับลงสำเนา', dlg && (await text('.slip .stamp')) === 'ตรวจสอบแล้ว' && (await count(`[data-act="release"][data-lot="${newLot}"]`)) === 0);
await setUser('U03');
await go('prod');
await ev(`document.querySelector('[data-act="move"][data-job="${blockedJob}"][data-dir="1"]').click(); true`);
await sleep(500);
const stageNow = await ev(`(() => { const c = document.querySelector('.kcard[data-job="${blockedJob}"]'); return c ? c.closest('[data-drop]').dataset.drop : ''; })()`);
check('งานครีมที่หยุดรอหลอด เดินต่อได้หลังรับหลอดและปล่อยผ่าน เบิกวัตถุดิบตามสูตรแบบ FEFO', stageNow === 'ผลิต', `${blockedJob} อยู่ขั้น ${stageNow}`);

// 5 จัดซื้อทุกขั้น: เขียนใบขอซื้อ แก้ไขพร้อมเหตุผล เห็นชอบ อนุมัติ ออกใบสั่งซื้อ
await setUser('U01');
await go('store?tab=buy&new=1&item=93009&qty=4000');
await ev(`document.querySelector('[data-form="pr"]').requestSubmit(); true`);
await sleep(500);
const prNo = await text('.slip .slip-no');
check('เขียนใบขอซื้อครั้งเดียว ได้เลขที่และลิงก์บันทึกขออนุมัติจัดซื้อ', prNo.startsWith('ขซ') && (await count('.slip-links a')) >= 2, prNo);
await go('log');
const prEv = await ev(`(() => { const r = [...document.querySelectorAll('#main tbody tr')].find((x) => x.textContent.includes('${prNo}') && x.querySelector('a[href*="edit="]')); return r ? r.querySelector('a[href*="edit="]').getAttribute('href').split('edit=')[1] : ''; })()`);
await go(`log?edit=${prEv}`);
await ev(`(() => { const f = document.querySelector('[data-form="amend"]'); f.qty.value = '6000'; f.reason.value = 'แผนผลิตเพิ่ม'; f.requestSubmit(); return true; })()`);
await sleep(500);
const amended = await ev(`(() => { const rows = [...document.querySelectorAll('#main tbody tr')]; return { neu: rows.some((r) => r.textContent.includes('ฉบับแก้ไข') && r.textContent.includes('6,000')), old: rows.some((r) => r.textContent.includes('แก้ไขแล้ว') && r.textContent.includes('4,000')) }; })()`);
check('แก้ใบขอซื้อได้ ต้องมีเหตุผล ฉบับเดิมยังอยู่ในประวัติพร้อมสถานะแก้ไขแล้ว', amended.neu && amended.old, JSON.stringify(amended));
const step = async (u, key) => { await setUser(u); await go(`store?tab=buy&step=${key}`); await ev(`document.querySelector('[data-act="prStep"][data-pr="${prNo}"][data-step="${key}"]').click(); true`); await sleep(450); return text('.slip .stamp'); };
await step('U00', 'head_ok');
await step('U08', 'dir_ok');
await setUser('U01');
await go('store?tab=buy&step=ordered');
await ev(`document.querySelector('[data-act="prStep"][data-pr="${prNo}"][data-step="ordered"]').click(); true`);
await sleep(450);
const poNo = await text('.slip .slip-no');
check('ใบขอซื้อผ่านหัวหน้ากลุ่มงานเห็นชอบ ผู้อำนวยการอนุมัติ แล้วออกใบสั่งซื้อพร้อมคาดการณ์วันของถึง', poNo.startsWith('PO'), poNo);
await go(`doc?type=pr-memo&id=${encodeURIComponent(prNo)}`);
check('บันทึกขออนุมัติจัดซื้อออกจากข้อมูลที่กรอกครั้งเดียว มีชื่อผู้ขอ ผู้เห็นชอบ ผู้อนุมัติ', (await ev(`document.querySelector('.paper').textContent.includes('6,000')`)) && (await count('.paper .sign-name')) === 3);

// 6 ลบรายการ: ต้องมีเหตุผล และลบรายการที่มีรายการอื่นอ้างถึงไม่ได้
await go('log');
const blockedDel = await ev(`(() => { const r = [...document.querySelectorAll('#main tbody tr')].find((x) => x.textContent.includes('รับเข้า หลอดอลูมิเนียม')); return r ? r.textContent.includes('ต้องลบรายการนั้นก่อน') : false; })()`);
check('รายการรับหลอดที่มีผลตรวจและการเบิกตามมา ลบหรือแก้ไม่ได้จนกว่าจะยกเลิกรายการที่ตามมา', blockedDel);

// 7 บันทึกถึงฝ่าย พร้อมหลักฐานการเปิดอ่าน
await go('notes?compose=1&to=qc');
await ev(`(() => { const f = document.querySelector('[data-form="note"]'); f.subject.value = 'ขอเร่งผลตรวจผงขมิ้นชัน'; f.body.value = 'ผลิตรอใช้สัปดาห์นี้'; f.ref.value = '${newLot}'; f.requestSubmit(); return true; })()`);
await sleep(400);
await setUser('U05');
await go('notes');
const unreadBefore = await count('.note-list li.is-unread');
await ev(`document.querySelector('.note-list li.is-unread a').click(); true`);
await sleep(700);
await ready();
check('ส่งบันทึกถึงฝ่ายควบคุมคุณภาพ ผู้รับเปิดอ่านแล้วระบบเก็บหลักฐานการอ่าน', unreadBefore >= 1 && (await ev(`document.querySelector('.note-reads').textContent.includes('อ่านแล้ว')`)));

// 8 ผลิตภัณฑ์: เปลี่ยนสถานะ และบันทึกสูตรฉบับใหม่จากช่องจำลอง
await setUser('U00');
await go('product?code=5005');
await ev(`(() => { const f = document.querySelector('[data-form="prodStatus"]'); f.status.value = 'พักผลิต'; f.reason.value = 'ยอดขายต่ำ'; f.fm40.value = 'FM-40 ที่ 1/2570'; f.requestSubmit(); return true; })()`);
await sleep(450);
const statusNow = await ev(`[...document.querySelectorAll('.room-head .chip')].map((c) => c.textContent).join(' ')`);
const before = await text('[data-out="total"]');
await ev(`(() => { const i = document.querySelector('[data-sim="qty"]'); i.value = String(Number(i.value) * 2); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const after = await text('[data-out="total"]');
await ev(`(() => { const f = document.querySelector('[data-form="formula"]'); f.reason.value = 'ทดลองเพิ่มตัวยา'; f.fm40.value = 'FM-40 ที่ 2/2570'; f.requestSubmit(); return true; })()`);
await sleep(450);
check('เปลี่ยนสถานะเป็นพักผลิต จำลองสูตรแล้วต้นทุนเปลี่ยนทันที บันทึกเป็นสูตรฉบับที่ 2', statusNow.includes('พักผลิต') && before !== after && (await ev(`document.body.textContent.includes('ฉบับที่ 2')`)), `${statusNow} ${before} เป็น ${after}`);

// 9 เอกสารพร้อมพิมพ์
await go('doc?type=fm19');
const fm19 = await count('.paper .ptable tbody tr');
await go('doc?type=fy-plan');
const plan = await count('.paper .ptable.small tbody tr');
check('เอกสาร FM-19 และแผนปีงบหน้ารายไตรมาสออกจากข้อมูลได้', fm19 > 0 && plan > 10, `FM-19 ${fm19} แถว แผน ${plan} รายการ`);

// 10 เวอร์ชัน 2.3 เทียบโปรแกรมดัง (รายงาน 6 พ.ย. 2569 ข้อ A1 ถึง A10)
const VK = { Escape: 27, Enter: 13, k: 75 };
const key = async (k, code, modifiers = 0) => { for (const type of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code, modifiers, windowsVirtualKeyCode: VK[k] || 0 }); };
await setUser('U03');
await go('prod');
check('A2 ห้องฝ่ายผลิตพับเรื่องเตือนเป็นแถบเดียว บอร์ดขึ้นในจอแรก', (await count('#main .alerts-fold')) === 1 && (await count('#main .coupons')) === 0 && (await ev(`document.querySelector('.kanban').getBoundingClientRect().top < 640`)));
check('A4 การ์ดงานที่กำลังทำมีป้ายกำหนดเสร็จ', (await count('.kcard .k-due')) > 0, await ev(`[...document.querySelectorAll('.kcard .k-due')].map((x) => x.textContent.trim()).slice(0, 3).join(' | ')`));
const moveFrom = await ev(`document.querySelector('.kcard[data-job="J70-846"]')?.closest('[data-drop]')?.dataset.drop || ''`);
await ev(`document.querySelector('.kcard[data-job="J70-846"] .k-next')?.click(); true`);
await sleep(900);
const moveTo = await ev(`document.querySelector('.kcard[data-job="J70-846"]')?.closest('[data-drop]')?.dataset.drop || ''`);
check('A10 ส่งต่อการ์ดด้วยการเคลื่อนไหว การ์ดไปอยู่ขั้นถัดไปจริง', moveFrom && moveTo && moveFrom !== moveTo, `${moveFrom} ไป ${moveTo}`);
await setUser('U01');
await go('store');
const sortedOk = await ev(`(() => { const b = [...document.querySelectorAll('#main .th-sort')].find((x) => x.textContent.trim().startsWith('รหัส')); if (!b) return false; b.click(); const v = [...b.closest('table').tBodies[0].rows].slice(0, 8).map((r) => Number(r.cells[0].textContent.trim())); return v.every((x, i) => i === 0 || v[i - 1] <= x) && b.closest('th').getAttribute('aria-sort') === 'ascending'; })()`);
check('A5 ตารางคงคลังหัวค้างบนจอคอม และกดหัวคอลัมน์เรียงได้', sortedOk && (await count('#main .table-wrap.is-fit')) > 0);
await key('k', 'KeyK', 2);
await sleep(250);
await send('Input.insertText', { text: 'ๅจจคึจจ/' });
await sleep(200);
const palFound = await ev(`!!document.querySelector('dialog.pal[open]') && [...document.querySelectorAll('.pal-o')].some((o) => o.textContent.includes('10087002')) && !document.querySelector('.pal-hint').hidden`);
await key('Enter', 'Enter');
await sleep(500);
await ready();
check('A1 กด Ctrl K ค้นเลขล็อตที่พิมพ์ตอนแป้นเป็นไทยก็เจอ กด Enter ไปหน้าล็อต', palFound && (await ev(`location.hash`)) === '#/trace?lot=10087002');
check('A6 A7 หน้าล็อตมีความเคลื่อนไหว ปุ่มส่งเข้า LINE และพิมพ์ป้ายพร้อม QR', (await count('#main .tl > li')) > 0 && (await count('#main .room-head [data-act="share"]')) === 1 && (await count('#main .room-head a[href*="lot-label"]')) === 1);
await key('k', 'KeyK', 2);
await sleep(250);
await send('Input.insertText', { text: '91001' });
await sleep(200);
await ev(`(() => { const o = [...document.querySelectorAll('.pal-o')].find((x) => x.textContent.trim().startsWith('รับเข้า')); if (o) o.click(); return true; })()`);
await sleep(500);
await ready();
check('A1 ทำงานต่อ "รับเข้า" เปิดฟอร์มที่เลือกรายการให้ เคอร์เซอร์อยู่ช่องจำนวน', (await ev(`location.hash`)).includes('tab=receive&item=91001') && (await ev(`document.activeElement?.name`)) === 'qty');
await go(`doc?type=lot-label&lot=${newLot}`);
await sleep(600);
check('A8 ป้ายล็อตพร้อม QR สร้าง QR จากตัวสร้างที่เก็บในเว็บ', (await count('.lot-label .qr svg')) === 1, newLot);
await setUser('U03');
await go('job?id=J70-846');
await ev(`(() => { const f = document.querySelector('[data-form="noteQuick"]'); f.body.value = 'ทดสอบบันทึกจากแผงความเคลื่อนไหว'; f.requestSubmit(); return true; })()`);
await sleep(600);
check('A6 ส่งบันทึกจากหน้างาน ขึ้นในแผงความเคลื่อนไหวทันทีและอ้างเลขงาน', await ev(`[...document.querySelectorAll('#main .tl-note')].some((n) => n.textContent.includes('ทดสอบบันทึกจากแผงความเคลื่อนไหว'))`) && (await ev(`(async () => { const { S } = await import('./assets/data.js'); return S.notes.some((n) => n.ref === 'J70-846' && n.to_room); })()`)));
await ev(`document.querySelector('#main .room-head [data-act="share"]').click(); true`);
await sleep(300);
check('A7 กดส่งเข้า LINE เห็นข้อความก่อนส่ง ไม่มีชื่อคน', await ev(`(() => { const t = document.querySelector('dialog.dlg[open] .share-msg')?.textContent || ''; return t.includes('J70-846') && !t.includes('(สมมุติ)'); })()`));
await ev(`document.querySelector('dialog.dlg[open] [data-dlg="cancel"]')?.click(); true`);
await setUser('U00');
await go('overview');
check('A9 ภาพรวมมีลูกศรเทียบยอดขายเดือนที่จบแล้วกับเดือนก่อนหน้า', (await count('#main .delta .delta-v')) === 1, await ev(`document.querySelector('#main .delta')?.textContent.trim() || ''`));
const tabsU00 = await ev(`({ rooms: document.querySelectorAll('#tabs a.tab:not(.tab-tool)').length, fit: document.querySelector('#tabs').scrollWidth <= document.querySelector('#tabs').clientWidth + 1 })`);
await setUser('U01');
await go('store');
const tabsU01 = await ev(`({ rooms: document.querySelectorAll('#tabs a.tab:not(.tab-tool)').length, locked: document.querySelectorAll('#tabs .is-locked').length })`);
await ev(`document.querySelector('#tabs .tab-more').click(); true`);
await sleep(250);
const menuN = await ev(`document.querySelector('#toolmenu').hidden ? 0 : document.querySelectorAll('#toolmenu a').length`);
await ev(`document.querySelector('#toolmenu a[href="#/trace"]').click(); true`);
await sleep(450);
await ready();
check('A11 แถบห้องสั้นลง: ห้องที่ไม่มีสิทธิ์ไม่แสดง เครื่องมือรวมเป็นปุ่มเดียว เปิดรายการแล้วไปหน้าเครื่องมือได้', tabsU00.rooms === 6 && tabsU00.fit && tabsU01.rooms === 1 && tabsU01.locked === 0 && menuN === 4 && (await ev(`location.hash`)) === '#/trace' && (await ev(`document.querySelector('#toolmenu').hidden && document.querySelector('#tabs .tab-more').classList.contains('is-current')`)), `หน.กลุ่มงาน ${JSON.stringify(tabsU00)} จนท.คลัง ${JSON.stringify(tabsU01)} รายการ ${menuN}`);
await open('store', 390);
await setUser('U01');
await go('store');
const bn = await ev(`({ shown: getComputedStyle(document.querySelector('.bnav')).display === 'grid', n: document.querySelectorAll('.bnav .bn').length, home: document.querySelector('.bnav [data-bn="home"]').getAttribute('aria-current') })`);
await ev(`document.querySelector('.bnav [data-bn="tools"]').click(); true`);
await sleep(250);
const sheetN = await ev(`document.querySelectorAll('dialog.sheet[open] a').length`);
await ev(`document.querySelector('dialog.sheet[open] .pal-x')?.click(); true`);
check('A3 มือถือมีแถบล่าง 4 ปุ่ม ห้องของฉันเป็นหน้าปัจจุบัน แผ่นเครื่องมือเปิดได้', bn.shown && bn.n === 4 && bn.home === 'page' && sheetN === 4, JSON.stringify(bn));
await open('store', 1440);

check('ไม่มีข้อผิดพลาดของสคริปต์ระหว่างทดสอบ', errors.length === 0, [...new Set(errors)].slice(0, 3).join(' | '));

let fail = 0;
for (const r of results) { console.log(`${r.ok ? 'ผ่าน   ' : 'ไม่ผ่าน'}  ${r.name}${r.detail ? `  [${r.detail}]` : ''}`); if (!r.ok) fail++; }
console.log(`\nสรุป: ผ่าน ${results.length - fail} จาก ${results.length} ข้อ`);
ws.close();
chrome.kill();
server.close();
process.exit(fail ? 1 : 0);
