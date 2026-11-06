// กล่องค้นทุกอย่าง กด Ctrl K (Mac ใช้ ⌘ K) แบบ GitHub และ Linear (รายงานเทียบโปรแกรมดังข้อ A1)
// แถบล่าง 4 ปุ่มบนมือถือ แบบ Material ของ Google และแผ่นเครื่องมือบนมือถือ (ข้อ A3) อยู่ในไฟล์นี้ด้วย เพราะปุ่มค้นหาของแถบล่างเปิดกล่องเดียวกัน
// กล่องค้นพาไปหน้าเท่านั้น ไม่ทำรายการแทนคน ไม่มีคำสั่งปล่อยผ่านหรืออนุมัติ และเห็นเฉพาะของในห้องที่ผู้ใช้มีสิทธิ์
import { ROOMS, TOOLS, LANES, STAGE_OWNER, canEnter, homeRoom } from './config.js';
import { S, D, staff, currentUser, isFG, active } from './data.js';
import { $, esc, I, chip, lotChip, can, itemHref, jobHref, lotHref, nav } from './ui.js';

export const palette = { focusAfter: '' };
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
const KEY_TEXT = IS_MAC ? '⌘ K' : 'Ctrl K';

// แป้นเกษมณี: พิมพ์ตอนแป้นยังเป็นภาษาไทยก็หาเจอ (แป้นไทยไม่มีตัวเลขแถวบน เลขล็อตจึงกลายเป็นตัวไทย) และกลับกัน
const EN = '`1234567890-=qwertyuiop[]\\asdfghjkl;\'zxcvbnm,./~!@#$%^&*()_+QWERTYUIOP{}|ASDFGHJKL:"ZXCVBNM<>?';
const TH = '_ๅ/-ภถุึคตจขชๆไำพะัีรนยบลฃฟหกดเ้่าสวงผปแอิืทมใฝ%+๑๒๓๔ู฿๕๖๗๘๙๐"ฎฑธํ๊ณฯญฐ,ฅฤฆฏโฌ็๋ษศซ.()ฉฮฺ์?ฒฬฦ';
const TH2EN = new Map([...TH].map((c, i) => [c, EN[i]]));
const EN2TH = new Map([...EN].map((c, i) => [c, TH[i]]));
const HAS_TH = /[฀-๿]/;
const toEN = (s) => [...s].map((c) => TH2EN.get(c) ?? c).join('');
const toTH = (s) => [...s].map((c) => EN2TH.get(c) ?? c).join('');

let dlg = null, input = null, list = null, status = null, hint = null;
let results = [], activeIdx = 0;

const roleNow = () => currentUser().role;
const room = (id) => ROOMS.find((r) => r.id === id);
// หน้างานเปิดได้เมื่อเข้าห้องของฝ่ายนั้นได้ เป็นผู้ถืองานในขั้นใดขั้นหนึ่ง หรือเป็นภาพรวมหรือฝ่ายควบคุมคุณภาพ (เหมือนหน้ารายละเอียดงาน)
function canSeeJob(job) {
  const role = roleNow();
  const r = room(job.lane === 'ผลิต' ? 'prod' : 'process');
  const owners = LANES[job.lane].stages.map((st) => staff(STAGE_OWNER[st]).role);
  return ['overview', 'qc'].some((id) => canEnter(room(id), role)) || canEnter(r, role) || owners.includes(role);
}
const recentKey = () => `hfd-recent-${S.user}`;
function recentGet() { try { return JSON.parse(localStorage.getItem(recentKey()) || '[]').slice(0, 6); } catch { return []; } }
function recentPut(o) {
  try {
    const keep = { href: o.href, code: o.code, name: o.name, kind: o.kind };
    const xs = [keep, ...recentGet().filter((x) => x.href !== o.href)].slice(0, 6);
    localStorage.setItem(recentKey(), JSON.stringify(xs));
  } catch { /* เบราว์เซอร์ไม่ให้เก็บ ข้ามไป */ }
}

const ICON = { lot: I.qr, item: I.registers, job: I.log, po: I.doc, page: I.right, act: I.arrow, recent: I.trace };
// คะแนนการตรงกัน: ตรงทั้งคำดีสุด ขึ้นต้นดีกว่าอยู่กลาง ไม่ตรงคืน -1
function score(hay, q) {
  if (!hay) return -1;
  const h = String(hay).toLowerCase();
  const i = h.indexOf(q);
  if (i < 0) return -1;
  return (h === q ? 0 : i === 0 ? 1 : 3) + i / 1000;
}
const best = (q, ...fields) => fields.reduce((m, f) => { const s = score(f, q); return s >= 0 && (m < 0 || s < m) ? s : m; }, -1);

function search(raw) {
  const q0 = raw.trim().toLowerCase();
  const alts = [q0];
  if (q0 && HAS_TH.test(q0)) alts.push(toEN(q0).toLowerCase());
  else if (q0 && /[a-z;',.[\]\\/`-]/i.test(q0)) alts.push(toTH(q0));
  const pick = (cands, fn, n) => {
    const out = [];
    for (const c of cands) {
      let s = -1, alt = 0;
      alts.forEach((q, k) => { if (!q) return; const v = fn(c, q); if (v >= 0 && (s < 0 || v < s)) { s = v; alt = k; } });
      if (s >= 0) out.push({ ...c, s: s + (alt ? 0.5 : 0), alt });
    }
    return out.sort((a, b) => a.s - b.s).slice(0, n);
  };
  const storeOk = canEnter(room('store'), roleNow());
  const lots = pick(S.lots.map((l) => ({ kind: 'lot', code: l.lot_no, name: S.items.get(l.item_code)?.name || '', href: lotHref(l.lot_no), lot: l })), (c, q) => best(q, c.code), 3);
  const items = pick([...S.items.values()].map((it) => ({ kind: 'item', code: it.code, name: it.name, href: itemHref(it.code), it })), (c, q) => best(q, c.code, c.name), 4);
  const jobs = pick(S.jobs.filter(canSeeJob).map((j) => ({ kind: 'job', code: j.job_id, name: S.items.get(j.item_code)?.name || '', href: jobHref(j.job_id), job: j })), (c, q) => { const s = best(q, c.code, c.job.out_lot); if (s >= 0) return s; if (q.length < 3) return -1; const n = best(q, c.name); return n < 0 ? -1 : n + (c.job.status === 'done' ? 1 : 0.5); }, 3);
  const docs = storeOk ? pick([
    ...S.pos.map((x) => ({ kind: 'po', code: x.po_no, name: S.items.get(x.item_code)?.name || '', href: `#/store?tab=buy&po=${encodeURIComponent(x.po_no)}`, open: !x.received_date })),
    ...S.prs.map((x) => ({ kind: 'po', code: x.pr_no, name: S.items.get(x.item_code)?.name || '', href: `#/store?tab=buy&pr=${encodeURIComponent(x.pr_no)}` })),
  ], (c, q) => best(q, c.code), 3) : [];
  const pages = pick([...ROOMS.filter((r) => canEnter(r, roleNow())).map((r) => ({ kind: 'page', code: '', name: r.id === 'overview' ? r.title : `ห้อง${r.title}`, href: `#/${r.id}` })), ...TOOLS.map((t) => ({ kind: 'page', code: '', name: t.title, href: `#/${t.id}` }))], (c, q) => best(q, c.name), 4);
  // ทำงานต่อจากผลที่ตรงที่สุด: เปิดฟอร์มที่เลือกรายการให้แล้ว ยังต้องตรวจและกดบันทึกเอง
  const acts = [];
  // รหัสตรงทั้งตัว: ทำงานต่อของสิ่งนั้นอย่างเดียว ไม่ปนกับผลที่ตรงบางส่วน
  const exact = (xs) => xs.find((x) => String(x.code).toLowerCase() === (x.alt ? alts[x.alt] : q0));
  const exItem = exact(items), exLot = exact(lots);
  const lot = exLot || (!exItem && lots[0]?.s < 2 ? lots[0] : null);
  if (lot) {
    acts.push({ kind: 'act', code: 'ไล่ย้อน', name: `ล็อต ${lot.code} ${lot.name}`, href: lotHref(lot.code), meta: 'ดูต้นทางและปลายทาง' });
    acts.push({ kind: 'act', code: 'พิมพ์ป้าย', name: `ล็อต ${lot.code} พร้อม QR`, href: `#/doc?type=lot-label&lot=${encodeURIComponent(lot.code)}`, meta: 'ป้ายติดถุงหรือกล่อง' });
  }
  const top = exItem ? exItem.it : !exLot && items[0]?.s < 2 ? items[0].it : null;
  if (top && !isFG(top) && active(top)) {
    if (can('receive') && ['buy', 'farm'].includes(top.make)) acts.push({ kind: 'act', code: 'รับเข้า', name: `${top.code} ${top.name}`, href: `#/store?tab=receive&item=${encodeURIComponent(top.code)}`, focus: 'qty', meta: 'ฟอร์ม FM-01 เลือกรายการให้แล้ว' });
    if (can('issue') && (D.itemStats.get(top.code)?.released || 0) > 0) acts.push({ kind: 'act', code: 'เบิก', name: `${top.code} ${top.name}`, href: `#/store?tab=issue&item=${encodeURIComponent(top.code)}`, focus: 'qty', meta: 'เรียงหมดอายุก่อนจ่ายก่อนให้' });
    if (can('requested') && top.supplier_id) acts.push({ kind: 'act', code: 'ขอซื้อ', name: `${top.code} ${top.name}`, href: `#/store?tab=buy&new=1&item=${encodeURIComponent(top.code)}`, meta: 'เขียนใบขอซื้อ' });
  }
  const conv = [lots, items, jobs, docs].flat().find((x) => x.alt);
  // พิมพ์รหัสหรือเลขล็อตตรงทั้งตัว: ขึ้นผลนั้นผลเดียว แล้วตามด้วยทำงานต่อทันที (กดลูกศรลงครั้งเดียวถึง) ไม่ต้องเลื่อนผ่านผลที่ตรงบางส่วน
  const G = { lots: ['ล็อต', exLot ? [exLot] : lots], items: ['รายการ', exItem ? [exItem] : items], acts: ['ทำงานต่อ', acts], jobs: ['งาน', jobs], docs: ['ใบสั่งซื้อและใบขอซื้อ', docs], pages: ['หน้า', pages] };
  const order = exItem ? ['items', 'acts', 'lots', 'jobs', 'docs', 'pages'] : exLot ? ['lots', 'acts', 'items', 'jobs', 'docs', 'pages'] : ['lots', 'items', 'acts', 'jobs', 'docs', 'pages'];
  return { groups: order.map((k) => G[k]), conv: conv ? alts[conv.alt] : '' };
}

function metaOf(o) {
  if (o.kind === 'lot') return lotChip(o.lot.status);
  if (o.kind === 'item') return o.it && !active(o.it) ? chip('เลิกใช้แล้ว', 'exp') : `<span>${esc(o.it?.kind || '')}</span>`;
  if (o.kind === 'job') return `<span>${esc(o.job.lane)} ${o.job.status === 'done' ? 'เสร็จแล้ว' : o.job.status === 'qc' ? 'รอปล่อยผ่าน' : o.job.status === 'waiting' ? 'ยังไม่เริ่ม' : 'กำลังทำ'}</span>`;
  if (o.kind === 'po') return o.open === undefined ? '<span>ใบขอซื้อ</span>' : `<span>${o.open ? 'ค้างรับ' : 'รับแล้ว'}</span>`;
  return o.meta ? `<span>${esc(o.meta)}</span>` : '';
}
function mark(text, q) {
  const t = String(text || '');
  if (!q) return esc(t);
  const i = t.toLowerCase().indexOf(q);
  return i < 0 ? esc(t) : `${esc(t.slice(0, i))}<mark>${esc(t.slice(i, i + q.length))}</mark>${esc(t.slice(i + q.length))}`;
}
function render() {
  const raw = input.value;
  const q = raw.trim().toLowerCase();
  let groups, conv = '';
  if (!q) {
    const rec = recentGet().map((x) => ({ ...x, kind: 'recent' }));
    const pages = [...ROOMS.filter((r) => canEnter(r, roleNow())).map((r) => ({ kind: 'page', code: '', name: r.id === 'overview' ? r.title : `ห้อง${r.title}`, href: `#/${r.id}` })), ...TOOLS.map((t) => ({ kind: 'page', code: '', name: t.title, href: `#/${t.id}` }))];
    groups = [['เพิ่งเปิด', rec], ['ห้องและเครื่องมือ', pages]];
  } else ({ groups, conv } = search(raw));
  results = [];
  const html = groups.filter(([, xs]) => xs.length).map(([g, xs], gi) => `<div role="group" aria-labelledby="pal-g${gi}"><div class="pal-g" id="pal-g${gi}" role="presentation">${esc(g)}</div>${xs.map((o) => {
    const i = results.push(o) - 1;
    const hq = o.alt ? conv : q;
    return `<div class="pal-o" role="option" id="pal-o${i}" data-i="${i}" aria-selected="false"><span class="pal-ic">${ICON[o.kind] || ''}</span>${o.code ? `<span class="pal-code${o.kind === 'act' ? ' is-act' : ''}">${o.kind === 'act' ? esc(o.code) : mark(o.code, hq)}</span>` : ''}<span class="pal-name">${o.kind === 'act' ? esc(o.name) : mark(o.name, hq)}</span><span class="pal-meta">${metaOf(o)}</span></div>`;
  }).join('')}</div>`).join('');
  list.innerHTML = html || `<p class="pal-empty">ไม่พบ "${esc(raw.trim())}" ลองพิมพ์รหัสรายการ 4 ถึง 5 หลัก เลขล็อต 8 หลัก เลขงาน หรือชื่อบางส่วน</p>`;
  hint.hidden = !conv;
  if (conv) hint.innerHTML = `พิมพ์ตอนแป้นเป็นอีกภาษา ค้นเป็น <span class="mono">${esc(conv)}</span> ให้ด้วย`;
  status.textContent = q ? `พบ ${results.length} รายการ` : '';
  setActive(0);
}
function setActive(i) {
  if (!results.length) { input.removeAttribute('aria-activedescendant'); return; }
  activeIdx = (i + results.length) % results.length;
  for (const el of list.querySelectorAll('.pal-o')) el.setAttribute('aria-selected', String(Number(el.dataset.i) === activeIdx));
  const el = list.querySelector(`#pal-o${activeIdx}`);
  input.setAttribute('aria-activedescendant', `pal-o${activeIdx}`);
  el?.scrollIntoView({ block: 'nearest' });
}
function choose(i) {
  const o = results[i];
  if (!o) return;
  if (o.kind !== 'recent') recentPut(o);
  palette.focusAfter = o.focus || '';
  dlg.close();
  if (location.hash === o.href) nav.route(); else location.hash = o.href;
}
export function openPalette() {
  if (!dlg || dlg.open || document.querySelector('dialog.dlg[open]')) return;
  input.value = '';
  render();
  dlg.showModal();
  input.focus();
}

// ---------- แถบล่างบนมือถือ ----------
const TOOL_PAGES = ['docs', 'doc', 'registers', 'product', 'trace', 'log'];
let sheet = null;
export function syncBottomNav(id, unread = 0) {
  const bn = $('.bnav');
  if (!bn) return;
  const home = homeRoom(roleNow());
  const homeA = bn.querySelector('[data-bn="home"]');
  homeA.setAttribute('href', `#/${home}`);
  const cur = { home: id === home, notes: id === 'notes', tools: TOOL_PAGES.includes(id) };
  for (const [k, on] of Object.entries(cur)) { const el = bn.querySelector(`[data-bn="${k}"]`); if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); }
  const c = bn.querySelector('.bn-count');
  c.hidden = !unread;
  c.textContent = unread ? String(unread) : '';
  bn.querySelector('[data-bn="notes"]').setAttribute('aria-label', unread ? `บันทึก ยังไม่ได้อ่าน ${unread} ฉบับ` : 'บันทึก');
}
function openTools() {
  if (sheet.open) return;
  sheet.showModal();
  sheet.querySelector('a')?.focus();
}

export function initPalette() {
  // กล่องค้น
  dlg = document.createElement('dialog');
  dlg.className = 'pal';
  dlg.setAttribute('aria-label', 'ค้นทุกอย่าง');
  dlg.innerHTML = `<div class="pal-in">${I.search}<label class="sr" for="pal-q">ค้นล็อต รายการ งาน ใบสั่งซื้อ หรือหน้า</label>
      <input id="pal-q" class="pal-q" type="text" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="pal-list" placeholder="พิมพ์เลขล็อต รหัส เลขงาน หรือชื่อ">
      <button type="button" class="pal-x" aria-label="ปิดกล่องค้น">${I.close}</button></div>
    <p class="pal-hint" hidden></p>
    <div class="pal-list" id="pal-list" role="listbox" aria-label="ผลการค้น"></div>
    <p class="pal-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> เลือก</span><span><kbd>Enter</kbd> เปิด</span><span><kbd>Esc</kbd> ปิด</span><span class="pal-k">กด <kbd>${esc(KEY_TEXT)}</kbd> ได้ทุกหน้า</span></p>
    <p class="sr" aria-live="polite" id="pal-status"></p>`;
  document.body.appendChild(dlg);
  input = dlg.querySelector('#pal-q');
  list = dlg.querySelector('#pal-list');
  status = dlg.querySelector('#pal-status');
  hint = dlg.querySelector('.pal-hint');
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIdx + 1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIdx - 1); }
    if (e.key === 'Enter') { e.preventDefault(); choose(activeIdx); }
  });
  list.addEventListener('click', (e) => { const o = e.target.closest('.pal-o'); if (o) choose(Number(o.dataset.i)); });
  list.addEventListener('mousemove', (e) => { const o = e.target.closest('.pal-o'); if (o && Number(o.dataset.i) !== activeIdx) setActive(Number(o.dataset.i)); });
  dlg.querySelector('.pal-x').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.code === 'KeyK' || e.key.toLowerCase() === 'k')) {
      e.preventDefault();
      if (dlg.open) dlg.close(); else openPalette();
    }
  });
  // ช่องค้นบนแถบหัว (จอคอม) บอกคีย์ลัดตามเครื่อง
  for (const k of document.querySelectorAll('.kbar kbd')) k.textContent = KEY_TEXT;

  // แถบล่างบนมือถือ
  const bn = document.createElement('nav');
  bn.className = 'bnav';
  bn.setAttribute('aria-label', 'เมนูหลักบนมือถือ');
  bn.innerHTML = `<a class="bn" data-bn="home" href="#/">${I.home}<span>ห้องของฉัน</span></a>
    <button class="bn" type="button" data-palette-open>${I.search}<span>ค้นหา</span></button>
    <a class="bn" data-bn="notes" href="#/notes">${I.notes}<span>บันทึก</span><span class="bn-count" hidden></span></a>
    <button class="bn" type="button" data-bn="tools" aria-haspopup="dialog">${I.grid}<span>เครื่องมือ</span></button>`;
  document.body.appendChild(bn);
  sheet = document.createElement('dialog');
  sheet.className = 'sheet';
  sheet.setAttribute('aria-label', 'เครื่องมือ');
  sheet.innerHTML = `<div class="sheet-h"><h2>เครื่องมือ</h2><button type="button" class="pal-x" aria-label="ปิด">${I.close}</button></div>
    <ul class="sheet-list">${TOOLS.filter((t) => t.id !== 'notes').map((t) => `<li><a href="#/${t.id}">${I[t.id] || ''}<span>${esc(t.title)}</span></a></li>`).join('')}</ul>`;
  document.body.appendChild(sheet);
  sheet.querySelector('.pal-x').addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('a')) sheet.close(); });
  bn.querySelector('[data-bn="tools"]').addEventListener('click', openTools);
  document.addEventListener('click', (e) => { if (e.target.closest('[data-palette-open]')) openPalette(); });
}
