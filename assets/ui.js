// ชิ้นส่วนหน้าจอที่ทุกห้องใช้ร่วมกัน: ตัวเลข ตราประทับ คูปอง สำเนาคาร์บอน ปุ่มเลือกรายการ และการตรวจสิทธิ์
import { CAN, DEPTS, ROLE_ABBR, ROOMS, canEnter } from './config.js';
import { S, currentUser, isIntUnit, isFG, thaiDate, thaiLongDate, daysBetween, staff } from './data.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = (n, d = 0) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d });
export const num2 = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const unitOf = (code) => S.items.get(code)?.unit || '';
export const qn = (code, q) => (isIntUnit(unitOf(code)) ? num(q) : num2(q));
// ตัวเลขกับหน่วยไม่แยกบรรทัด (ตรวจความเรียบร้อย ข้อ 17)
export const qty = (code, q) => `${qn(code, q)} ${unitOf(code)}`;
export const qh = (code, q) => `<span class="qty"><span class="num">${qn(code, q)}</span><span class="u">${esc(unitOf(code))}</span></span>`;
export const money = (n) => `${num(n)} บาท`;
export const baht = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const mill = (n) => (n / 1e6).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const short = (name) => String(name || '').replace(' (สมมุติ)', '');
export const dateTime = (iso) => new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
// เวลาแบบ "เมื่อวาน" "3 วันที่ผ่านมา" ต้องมีวันที่จริงกำกับเสมอ (รายงานเทียบโปรแกรมดังข้อ A6) เกิน 6 วันแสดงแค่วันที่
const REL = typeof Intl.RelativeTimeFormat === 'function' ? new Intl.RelativeTimeFormat('th', { numeric: 'auto' }) : null;
export function relWhen(value) {
  const v = String(value || '');
  if (!v) return '';
  // เวลาจากเว็บเก็บแบบสากล (UTC) แปลงเป็นวันที่ของเครื่องก่อน ไม่งั้นรายการก่อน 7 โมงเช้าจะขึ้นเป็นวันก่อน
  const dt = new Date(v);
  const day = v.length > 10 ? new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : v.slice(0, 10);
  const d = daysBetween(day, S.today);
  const time = v.length > 10 ? new Date(v).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '';
  const rel = REL && d >= 0 && d <= 6 ? REL.format(-d, 'day') : '';
  return [rel, thaiDate(day), d === 0 && time ? time : ''].filter(Boolean).join(' ');
}
// ที่อยู่เต็มของหน้าในระบบ ใช้ในข้อความที่ส่งออกนอกระบบ (LINE) และใน QR
export const absUrl = (hash) => `${location.origin}${location.pathname}${hash.startsWith('#') ? hash : `#/${hash}`}`;
export const LEVEL_TEXT = { crit: 'วิกฤต', warn: 'เฝ้าระวัง', ok: 'ปกติ' };
const TH_MONTH = new Intl.DateTimeFormat('th-TH', { month: 'short', year: '2-digit', timeZone: 'UTC' });
export const monthLabel = (ym) => TH_MONTH.format(new Date(`${ym}-01T00:00:00Z`));

export const svg = (d, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
export const I = {
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  left: svg('<path d="M15 6l-6 6 6 6"/>'),
  right: svg('<path d="M9 6l6 6-6 6"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  download: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  print: svg('<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="1.5"/><path d="M7 14h10v6H7z"/>'),
  doc: svg('<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>'),
  trace: svg('<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6H14a4 4 0 0 1 0 8h-4a4 4 0 0 0 0 8h5.5"/>'),
  log: svg('<path d="M7 4h10l3 3v13H7z"/><path d="M10 10h7M10 14h7M10 18h4"/><path d="M4 7v13"/>'),
  notes: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>'),
  docs: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 11h6M9 15h6"/>'),
  registers: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  reply: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v4"/>'),
  // เพิ่มรอบเทียบโปรแกรมดัง (เวอร์ชัน 2.3): แชร์ หน้าแรก เครื่องมือ QR ลูกศรเรียงและลูกศรเทียบ
  share: svg('<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1"/>'),
  home: svg('<path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>'),
  grid: svg('<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>'),
  qr: svg('<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2"/>'),
  sort: svg('<path d="m8 10 4-4 4 4M8 14l4 4 4-4"/>', 'ic ic-sort'),
  sortUp: svg('<path d="m7 14 5-5 5 5"/>', 'ic ic-sort'),
  sortDown: svg('<path d="m7 10 5 5 5-5"/>', 'ic ic-sort'),
  chev: svg('<path d="m7 10 5 5 5-5"/>', 'ic ic-chev'),
  up: svg('<path d="M12 19V5M6 11l6-6 6 6"/>', 'ic ic-delta'),
  down: svg('<path d="M12 5v14M6 13l6 6 6-6"/>', 'ic ic-delta'),
};
export const chip = (text, lv) => `<span class="chip ch-${lv}">${esc(text)}</span>`;
const LOT_LV = { 'รอปล่อยผ่าน': 'hold', 'ตรวจสอบแล้ว': 'pass', 'ไม่ผ่าน': 'fail', 'หมดอายุ': 'exp' };
export const lotChip = (status) => chip(status, LOT_LV[status] || 'exp');
export const stamp = (text, lv, anim = false) => `<span class="stamp st-${lv}${anim ? ' stamp-in' : ''}">${esc(text)}</span>`;
// ลิงก์ไปหน้ารายละเอียด: ยาสำเร็จรูปไปหน้าผลิตภัณฑ์ (สูตร ต้นทุน คลัง) รายการอื่นไปหน้ารายการ งานไปหน้างาน
export const itemHref = (code) => (isFG(S.items.get(code)) ? `#/product?code=${encodeURIComponent(code)}` : `#/item?code=${encodeURIComponent(code)}`);
export function itemLink(itOrCode, text) {
  const it = typeof itOrCode === 'string' ? S.items.get(itOrCode) : itOrCode;
  if (!it) return esc(text ?? itOrCode);
  return `<a class="ilink" href="${itemHref(it.code)}">${esc(text ?? it.name)}</a>`;
}
export const jobHref = (id) => `#/job?id=${encodeURIComponent(id)}`;
export const jobLink = (id, text) => `<a class="mono" href="${jobHref(id)}">${esc(text ?? id)}</a>`;
// คูปองแต่ละใบกดไปหน้าของเรื่องนั้น: งานที่หยุด รายการ เครื่องมือ หรือลูกค้า
const subjectHref = (a) => (a.job ? jobHref(a.job) : a.item ? itemHref(a.item) : a.asset ? `#/registers?tab=assets&id=${encodeURIComponent(a.asset)}` : a.customer ? `#/sales?tab=ar&cust=${encodeURIComponent(a.customer)}` : '');
export const tableWrap = (inner, label) => `<div class="table-wrap" role="region" aria-label="${esc(label)}" tabindex="0">${inner}</div>`;
export const supName = (id) => S.base.suppliers.find((s) => s.supplier_id === id)?.name || id;
export const custName = (id) => S.base.customers.find((c) => c.customer_id === id)?.name || id;

// วงกลมตามสีฝ่าย + ตัวย่อตำแหน่ง (พี่ขอ 2026-11-05 ให้การ์ดไม่รก)
export const deptOf = (u) => DEPTS[u.dept] || DEPTS['บริหาร'];
export const roleAbbr = (role) => ROLE_ABBR[role] || role;
export function avatar(u) {
  const d = deptOf(u);
  return `<span class="avatar" style="background:${d.color}" aria-hidden="true">${esc(short(u.name).replace(/^[เแโใไ]/, '').charAt(0))}</span>`;
}
export const who = (u) => `<span class="who">${avatar(u)}<span class="who-t">${esc(short(u.name))}<span class="who-r" title="${esc(u.role)}">${esc(roleAbbr(u.role))}</span></span></span>`;
export function deptLegend() {
  return `<span class="legend" aria-label="สีประจำฝ่าย">${Object.entries(DEPTS).map(([name, d]) => `<span><i style="background:${d.color}"></i>${esc(d.abbr === 'บริหาร' ? 'บริหาร' : d.abbr)}</span>`).join('')}</span>`;
}

// ข้อผิดที่เกิดตอนส่งฟอร์ม ขึ้นในฟอร์มเหนือปุ่มบันทึก ไม่ขึ้นเป็นข้อความลอยมุมจอที่หายเอง (ตรวจความเรียบร้อย ข้อ 16)
export const formCtx = { form: null };
export function showFormError(form, msg) {
  let el = form.querySelector('.form-err');
  if (!el) {
    el = document.createElement('p');
    el.className = 'form-err';
    el.setAttribute('role', 'alert');
    const acts = form.querySelector('.form-actions');
    if (acts) acts.before(el); else form.append(el);
  }
  el.textContent = msg;
  el.scrollIntoView({ block: 'nearest' });
}
export function toast(msg, level = 'ok') {
  if (level !== 'ok' && formCtx.form && formCtx.form.isConnected) return showFormError(formCtx.form, msg);
  const el = document.createElement('div');
  el.className = `toast toast-${level}`;
  el.innerHTML = `<span class="toast-t"></span><button type="button" class="toast-x" aria-label="ปิดข้อความ">${I.close}</button>`;
  el.querySelector('.toast-t').textContent = msg;
  el.querySelector('.toast-x').addEventListener('click', () => el.remove());
  $('#toast').appendChild(el);
  setTimeout(() => el.remove(), level === 'ok' ? 5600 : 9000);
}
// ข้อความที่มีปุ่มทำต่อ เช่น ย้อนการย้ายการ์ด (ข้อ B4): นับถอยหลังให้เห็น หยุดนับเมื่อชี้เมาส์หรือโฟกัสอยู่ (WCAG 2.2.1)
export function toastAction(msg, { label, onAct, ms = 8000 }) {
  const el = document.createElement('div');
  el.className = 'toast toast-ok toast-act';
  el.innerHTML = `<span class="toast-t"></span><span class="toast-sec" aria-hidden="true"></span><button type="button" class="toast-b"></button><button type="button" class="toast-x" aria-label="ปิดข้อความ">${I.close}</button>`;
  el.querySelector('.toast-t').textContent = msg;
  const b = el.querySelector('.toast-b');
  b.textContent = label;
  const sec = el.querySelector('.toast-sec');
  let left = ms, last = Date.now(), paused = false, iv = 0;
  const done = () => { clearInterval(iv); el.remove(); };
  const tick = () => {
    const now = Date.now();
    if (!paused) left -= now - last;
    last = now;
    sec.textContent = `อีก ${Math.max(0, Math.ceil(left / 1000))} วินาที`;
    if (left <= 0) done();
  };
  el.addEventListener('mouseenter', () => { paused = true; });
  el.addEventListener('mouseleave', () => { paused = false; });
  el.addEventListener('focusin', () => { paused = true; });
  el.addEventListener('focusout', () => { paused = false; });
  b.addEventListener('click', () => { done(); onAct(); });
  el.querySelector('.toast-x').addEventListener('click', done);
  tick();
  iv = setInterval(tick, 250);
  $('#toast').appendChild(el);
  return el;
}
export function download(name, text, type = 'text/csv;charset=utf-8') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export const can = (key) => (CAN[key] || []).includes(currentUser().role);
export const deny = (key, what) => toast(`${what}ได้เฉพาะ${(CAN[key] || []).join(' หรือ ')} เปลี่ยนผู้ใช้ที่มุมขวาบนเพื่อทดลอง`, 'warn');
export const roleNote = (key, what) => (can(key) ? '' : `<p class="form-note">ผู้ใช้ตอนนี้ ${esc(short(currentUser().name))} ${esc(currentUser().role)} ดูได้อย่างเดียว ${esc(what)}ได้เฉพาะ${esc((CAN[key] || []).join(' หรือ '))}</p>`);

// ---------- กล่องยืนยันกลาง (QA-037 QA-002 QA-018) ----------
// ใช้ <dialog> ของเบราว์เซอร์: โฟกัสอยู่ในกล่อง กด Esc ปิด ส่วนอื่นของหน้ากดไม่ได้จนกว่าจะปิด
// กันดับเบิลคลิก: คลิกที่สองของดับเบิลคลิก และคลิกเมาส์ภายใน 0.45 วินาทีหลังกล่องเปิด ไม่นับ (คลิกจากแป้นพิมพ์ไม่โดน)
// onOk คืนข้อความ = ยังบันทึกไม่ได้ แสดงในกล่องแล้วรอแก้ คืน false = ไม่ปิดกล่อง (ตรวจค่าใน onOk เอง ข้อความเป็นไทยและเห็นชัดในกล่อง)
let dlgOpen = null;
export function closeDialog() {
  const d = dlgOpen;
  dlgOpen = null;
  if (!d) return;
  if (d.open) d.close();
  d.remove();
}
export function openDialog({ title, body, ok = 'ยืนยัน', tone = 'solid', cancel = 'ยกเลิก', onOk, onInput }) {
  closeDialog();
  const d = document.createElement('dialog');
  d.className = 'dlg';
  d.setAttribute('aria-labelledby', 'dlg-h');
  d.innerHTML = `<form class="dlg-f" novalidate><h2 id="dlg-h" tabindex="-1">${esc(title)}</h2><div class="dlg-b">${body}</div><p class="dlg-err" role="alert" hidden></p>
    <div class="dlg-a"><button type="button" class="btn" data-dlg="cancel">${esc(cancel)}</button><button type="submit" class="btn btn-${tone}" data-dlg="ok">${esc(ok)}</button></div></form>`;
  document.body.appendChild(d);
  const f = d.querySelector('form');
  const t0 = performance.now();
  d.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (e.detail > 1 || (e.detail === 1 && performance.now() - t0 < 450)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (b.dataset.dlg === 'cancel') closeDialog();
  }, true);
  d.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.repeat) e.preventDefault(); });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const err = d.querySelector('.dlg-err');
    const r = onOk(new FormData(f), f);
    if (typeof r === 'string') { err.textContent = r; err.hidden = false; return; }
    if (r !== false && dlgOpen === d) closeDialog();
  });
  if (onInput) f.addEventListener('input', () => onInput(f));
  d.addEventListener('close', () => { if (dlgOpen === d) dlgOpen = null; d.remove(); });
  dlgOpen = d;
  d.showModal();
  (d.querySelector('[autofocus]') || d.querySelector('#dlg-h')).focus();
  if (onInput) onInput(f);
  return d;
}

// ---------- แถบเตือนที่เก็บข้อมูล (แสดงทุกหน้าจนกว่าจะแก้) ----------
export function storeBanner() {
  const st = S.store;
  if (st.broken) {
    const n = st.broken.salvage.length;
    return `<section class="sysalert" role="alert"><div><strong>อ่านข้อมูลที่ทดลองกรอกในเครื่องนี้ไม่ได้ (ข้อมูลเสีย)</strong>
      <p>ระบบหยุดบันทึกไว้ก่อน ข้อมูลเดิมยังอยู่ ไม่ถูกเขียนทับ ${n ? `ตอนนี้แสดง ${num(n)} รายการที่อ่านได้` : 'อ่านรายการไม่ได้เลย'} ดาวน์โหลดข้อมูลเดิมเก็บไว้ก่อน แล้วเลือกทางแก้</p></div>
      <div class="sys-acts"><button type="button" class="btn btn-sm" data-sys="download">${I.download}ดาวน์โหลดข้อมูลเดิม</button>${n ? `<button type="button" class="btn btn-sm btn-solid" data-sys="salvage">กู้ ${num(n)} รายการที่อ่านได้</button>` : ''}<button type="button" class="btn btn-sm btn-crit" data-sys="restart">ล้างแล้วเริ่มใหม่</button></div></section>`;
  }
  const use = (st.chars + st.other) / 5000000;
  if (st.full || use >= 0.8) {
    return `<section class="sysalert${st.full ? '' : ' is-warn'}" role="${st.full ? 'alert' : 'status'}"><div><strong>${st.full ? 'บันทึกไม่ได้ ที่เก็บข้อมูลในเบราว์เซอร์เต็ม' : `ที่เก็บข้อมูลในเบราว์เซอร์ใช้ไปแล้ว ${num(use * 100)}%`}</strong>
      <p>${st.full ? 'รายการล่าสุดยังไม่ถูกบันทึก ' : 'ใกล้เต็มแล้ว ถ้าเต็มจะบันทึกไม่ได้ '}ให้หัวหน้ากลุ่มงานส่งออกประวัติเก็บไว้ แล้วล้างข้อมูลทดลองที่หน้าประวัติการแก้ไข (ต้นแบบนี้เก็บข้อมูลในเบราว์เซอร์ ไม่เหมาะกับงานจริง)</p></div>
      <div class="sys-acts"><a class="btn btn-sm" href="#/log">ไปหน้าประวัติการแก้ไข</a></div></section>`;
  }
  return '';
}

// ตัวนำทาง (app.js ตั้งค่าให้ตอนเริ่ม) เพื่อให้ทุกส่วนสั่งวาดหน้าใหม่ได้
export const nav = { route: () => {}, prev: null };
// ปุ่มย้อนกลับไปหน้าที่เพิ่งมา บอกชื่อหน้าที่จะกลับไป (พี่ขอ 2026-11-06)
export const backLink = (cls = 'back') => (nav.prev ? `<a class="${cls}" href="${esc(nav.prev.hash)}" data-back>${I.left}กลับไป ${esc(nav.prev.title || 'หน้าก่อน')}</a>` : '');
export const backBar = () => (nav.prev ? `<nav class="backbar" aria-label="ย้อนกลับ">${backLink()}</nav>` : '');
// การกระทำที่ app.js ลงทะเบียนไว้ให้ส่วนอื่นเรียกใช้ (เลี่ยงการ import วนกลับมาที่ app.js)
export const actions = { submitNew: () => {}, guard: (fn) => fn() };
export function setHash(id, o = {}) {
  const x = new URLSearchParams(o);
  for (const [k, v] of [...x]) if (v === '' || v === undefined || v === 'undefined' || v === null) x.delete(k);
  const next = `#/${id}${[...x].length ? `?${x}` : ''}`;
  if (location.hash === next) nav.route(); else location.hash = next;
}

// ---------- สำเนาคาร์บอน: ใบที่ได้หลังบันทึก แสดงหนึ่งครั้งพร้อมตราประทับลงมา ----------
export const slipState = { slip: null };
export function showSlip(room, o) { slipState.slip = { room, o, shown: false }; }
export function slipBlock(room) {
  const s = slipState.slip;
  if (!s || s.room !== room) return '';
  const { o } = s;
  return `<section class="slip" aria-label="${esc(o.k)}" tabindex="-1">
    <div class="slip-id"><div class="slip-k">${esc(o.k)}</div><div class="slip-no">${esc(o.no)}</div>${stamp(o.stamp[0], o.stamp[1], true)}</div>
    <div class="slip-main"><div class="t">${keepCodes(esc(o.title))}</div>${(o.lines || []).map((l) => `<div class="d">${keepCodes(esc(l))}</div>`).join('')}
      ${o.links ? `<div class="slip-links">${o.links.map(([t, href]) => `<a href="${href}">${I.doc}${esc(t)}</a>`).join('')}</div>` : ''}
      ${o.qr ? lotQR(o.qr, 'slip-qr') : ''}</div>
    <button type="button" class="slip-x" data-act="slipClose" aria-label="ปิดสำเนา">${I.close}</button>
  </section>`;
}

// ---------- QR ประจำล็อต (รายงานเทียบโปรแกรมดังข้อ A8) ----------
// QR เป็นลิงก์ไปหน้าล็อตในระบบ สแกนด้วยกล้องมือถือได้เลย ไม่ต้องมีตัวสแกนในเว็บ (ตัวสแกนในเว็บยังใช้ไม่ได้ทุกเบราว์เซอร์)
// ตัวสร้าง QR เก็บในเว็บเอง (assets/vendor, MIT) โหลดเมื่อหน้านั้นมี QR เท่านั้น
export const lotHref = (lotNo) => `#/trace?lot=${encodeURIComponent(lotNo)}`;
export function lotQR(lotNo, cls = '') {
  return `<div class="lot-qr${cls ? ` ${cls}` : ''}"><span class="qr" data-qr="${esc(absUrl(lotHref(lotNo)))}" role="img" aria-label="QR เปิดหน้าล็อต ${esc(lotNo)}"></span>
    <p><strong>สแกนด้วยกล้องมือถือ</strong> เปิดหน้าล็อต <span class="mono">${esc(lotNo)}</span> ได้ทันที <a href="#/doc?type=lot-label&lot=${encodeURIComponent(lotNo)}">${I.print}พิมพ์ป้ายล็อตพร้อม QR</a></p></div>`;
}
let qrLib = null;
function loadQR() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (!qrLib) {
    qrLib = new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = new URL('./vendor/qrcode-generator-1.4.4.min.js', import.meta.url).href;
      s.onload = () => ok(window.qrcode);
      s.onerror = () => { qrLib = null; fail(new Error('โหลดตัวสร้าง QR ไม่ได้')); };
      document.head.appendChild(s);
    });
  }
  return qrLib;
}
export function renderQR(root) {
  const els = [...root.querySelectorAll('[data-qr]:empty')];
  if (!els.length) return;
  loadQR().then((qrcode) => {
    for (const el of els) {
      if (!el.isConnected) continue;
      const q = qrcode(0, 'M');
      q.addData(el.dataset.qr);
      q.make();
      el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      el.querySelector('svg')?.setAttribute('aria-hidden', 'true');
    }
  }).catch((e) => { for (const el of els) el.textContent = e.message; });
}

// ---------- ส่งสรุปเข้า LINE (รายงานเทียบโปรแกรมดังข้อ A7) ----------
// ใช้ลิงก์ line.me/R/share?text= ของ LINE เปิดหน้าเลือกเพื่อนหรือกลุ่มพร้อมข้อความ ให้เห็นข้อความก่อนส่งทุกครั้ง
// ข้อความมีแค่สรุปกับลิงก์ ไม่ใส่ชื่อคน คนเปิดลิงก์ต้องเข้าระบบเอง (ระบบจริง)
export function shareLine(text) {
  const d = openDialog({
    title: 'ส่งข้อความนี้เข้า LINE', ok: 'เปิด LINE', cancel: 'ยกเลิก',
    body: `<div class="share-msg">${esc(text)}</div>
      <p class="dlg-note">กดเปิด LINE แล้วเลือกกลุ่มหรือคนที่จะส่ง ระบบส่งแค่ข้อความสรุปกับลิงก์ ไม่มีชื่อคน คนที่เปิดลิงก์ต้องเข้าระบบเอง</p>
      <p><button type="button" class="btn btn-sm" data-share-copy>${I.doc}คัดลอกข้อความ</button></p>`,
    onOk: () => { window.open(`https://line.me/R/share?text=${encodeURIComponent(text)}`, '_blank', 'noopener'); return true; },
  });
  d.querySelector('[data-share-copy]')?.addEventListener('click', (e) => {
    const b = e.currentTarget;
    const done = () => { b.textContent = 'คัดลอกแล้ว'; };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => { b.textContent = 'คัดลอกไม่ได้ ให้กดค้างที่ข้อความแล้วคัดลอกเอง'; });
    else b.textContent = 'คัดลอกไม่ได้ ให้กดค้างที่ข้อความแล้วคัดลอกเอง';
  });
  return d;
}
export const shareBtn = (text, label = 'ส่งเข้า LINE', cls = 'btn') => `<button type="button" class="${cls}" data-act="share" data-share="${esc(text)}">${I.share}${label ? esc(label) : '<span class="sr">ส่งเรื่องนี้เข้า LINE</span>'}</button>`;

// ---------- หัวห้อง คูปองแจ้งเตือน และแท็บงาน ----------
export function head(title, alerts = [], acts = '', sub = '') {
  const c = alerts.filter((a) => a.level === 'crit').length;
  const w = alerts.filter((a) => a.level === 'warn').length;
  const line = sub || (c || w ? `${c ? `<strong>วิกฤต ${c} เรื่อง</strong>` : ''}${c && w ? ' ' : ''}${w ? `เฝ้าระวัง ${w} เรื่อง` : ''}` : 'ไม่มีเรื่องต้องตามวันนี้');
  return `<header class="room-head"><div><h1>${esc(title)}</h1><p class="sub">${esc(thaiLongDate(S.today))} ${line}</p></div>${acts ? `<div class="acts">${acts}</div>` : ''}</header>`;
}

function routeBar(t) {
  const span = Math.max(1, daysBetween(t.order, t.expected));
  const pct = (d) => Math.min(100, Math.max(0, (daysBetween(t.order, d) / span) * 100));
  const so = pct(t.stockout);
  const now = pct(S.today);
  const gap = Math.max(0, daysBetween(t.stockout, t.expected));
  return `<div class="route" role="img" aria-label="สั่ง ${esc(thaiDate(t.order))} วันนี้ ${esc(thaiDate(S.today))} ของหมด ${esc(thaiDate(t.stockout))} คาดว่าของมาถึง ${esc(thaiDate(t.expected))}${gap ? ` ขาดของ ${gap} วัน` : ''}">
    <span class="r-cover" style="width:${so}%"></span>${so < 100 ? `<span class="r-gap" style="left:${so}%;width:${100 - so}%"></span>` : ''}<span class="r-now" style="left:${now}%"></span><span class="r-lab" style="left:${Math.min(88, Math.max(12, now))}%">วันนี้</span></div>
    <div class="route-k" aria-hidden="true"><span>สั่ง ${esc(thaiDate(t.order))}</span><span>ถึง ${esc(thaiDate(t.expected))}</span></div>
    ${gap ? `<div class="route-gap" aria-hidden="true">ของหมดก่อนของมาถึง ${gap} วัน</div>` : ''}`;
}
// รหัส เลขที่ผลิต เลขรับ ใบสั่งซื้อ ใบขอซื้อ ไม่ให้ตัดบรรทัดกลางรหัส
export const keepCodes = (html) => html.replace(/((?:[A-Z]{1,3}|[ก-ฮ]{2})\d{2}-\d{3,4}|[A-Z]{2,3}-\d{2,4}|\d{8})/g, '<span class="mono">$1</span>');
// การ์ดที่ผู้ใช้ตอนนี้ทำเองไม่ได้ (ห้องปลายทางล็อก) แสดงเป็นแจ้งให้ทราบ บอกว่าฝ่ายไหนเป็นคนทำ (QA-033)
function goOrInfo(a) {
  const id = String(a.go || '').split('?')[0];
  const room = ROOMS.find((r) => r.id === id);
  if (room && !canEnter(room, currentUser().role)) return `<span class="go go-info">${I.lock}แจ้งให้ทราบ ${esc(room.id === 'overview' ? 'หัวหน้ากลุ่มงาน' : `ฝ่าย${room.title.replace(/^ฝ่าย/, '')}`)}เป็นผู้ทำ</span>`;
  const t = esc(a.actionText), k = t.lastIndexOf(' ');
  return `<a class="go" href="#/${a.go}">${k > 0 ? t.slice(0, k + 1) : ''}<span class="nowrap">${k > 0 ? t.slice(k + 1) : t}${I.arrow}</span></a>`;
}
const fieldVal = (v) => { const t = esc(v); const m = t.match(/^([\d,.]+)(?:\s|\u00A0)?(\S*)$/); return m ? `<span class="num">${m[1]}</span>${m[2] ? `<span class="u">${m[2]}</span>` : ''}` : keepCodes(t); };
export function coupon(a) {
  return `<article class="coupon lv-${a.level}">
    <div class="stub"><span class="stub-k">${esc(a.stub.k)}</span><span class="stub-n">${esc(a.stub.n)}${a.stub.u ? `<small>${esc(a.stub.u)}</small>` : ''}</span><span class="stub-ref">${keepCodes(esc(a.stub.ref || ''))}</span></div>
    <div class="cbody"><h3><span class="sr">${LEVEL_TEXT[a.level]} </span>${subjectHref(a) ? `<a class="c-link" href="${subjectHref(a)}">${keepCodes(esc(a.title))}</a>` : keepCodes(esc(a.title))}</h3>
      <dl class="fields">${a.fields.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${fieldVal(v)}</dd></div>`).join('')}</dl>
      ${a.timeline ? routeBar(a.timeline) : ''}
      <div class="c-acts">${goOrInfo(a)}<span class="c-tools">${snzBtn(a, 'เตือนพรุ่งนี้')}${shareBtn(alertText(a), '', 'btn-ico c-share')}</span></div></div>
    ${stamp(a.stamp, a.level)}
  </article>`;
}
// ข้อความสรุปเรื่องเตือนสำหรับส่งเข้า LINE: ระดับ หัวเรื่อง รายละเอียด และลิงก์หน้าของเรื่อง ไม่มีชื่อคน
function alertText(a) {
  const href = subjectHref(a) || (a.go ? `#/${a.go}` : '');
  const fields = (a.fields || []).filter(([k]) => !/ผู้|คน/.test(k)).slice(0, 4).map(([k, v]) => `${k} ${v}`).join(' ');
  return [`${LEVEL_TEXT[a.level]} ${a.stamp}: ${a.title}`, a.detail || fields, href ? `เปิดดูในระบบ ${absUrl(href)}` : ''].filter(Boolean).join('\n');
}
// ผู้ใช้ตอนนี้ทำเรื่องนี้เองได้ไหม (เข้าห้องปลายทางได้) เรื่องที่ฝ่ายอื่นทำเป็นแค่แจ้งให้ทราบ เลื่อนเตือนไม่ได้
export const canAct = (a) => { const room = ROOMS.find((r) => r.id === String(a.go || '').split('?')[0]); return !room || canEnter(room, currentUser().role); };
// เลื่อนไปเตือนพรุ่งนี้ (ข้อ B5): เฉพาะเรื่องระดับเฝ้าระวังที่ผู้ใช้ทำเองได้ เรื่องวิกฤตเลื่อนไม่ได้
const snzBtn = (a, label = 'เตือนอีกครั้งพรุ่งนี้') => (a.level === 'warn' && a.key && canAct(a) ? `<button type="button" class="snz" data-act="snooze" data-key="${esc(a.key)}" aria-label="เลื่อนเรื่อง ${esc(a.title)} ไป${esc(label)}">${esc(label)}</button>` : '');
const compactAlert = (a, cls = '') => `<li${cls ? ` class="${cls}"` : ''}>${chip(a.stamp, a.level)}<span class="t">${subjectHref(a) ? `<a href="${subjectHref(a)}">${keepCodes(esc(a.title))}</a>` : keepCodes(esc(a.title))}<span class="d">${esc(a.detail)}</span></span><span class="al-acts">${goOrInfo(a).replace('class="go"', 'class="go-l"')}${snzBtn(a)}</span></li>`;
// เรื่องที่เลื่อนไว้: บอกว่าใครเลื่อน เมื่อไร และจะเตือนอีกวันไหน กดให้กลับมาเตือนตอนนี้ได้
function snoozedBlock(xs) {
  if (!xs.length) return '';
  return `<details class="more snz-fold"><summary>เลื่อนไว้ ${xs.length} เรื่อง จะเตือนอีกครั้งพรุ่งนี้</summary><ul class="alist">${xs.map((a) => `<li>${chip(a.stamp, a.level)}<span class="t">${subjectHref(a) ? `<a href="${subjectHref(a)}">${keepCodes(esc(a.title))}</a>` : keepCodes(esc(a.title))}<span class="d">เลื่อนโดย ${esc(short(staff(a.snooze.user).name))} ${esc(relWhen(a.snooze.at))} เตือนอีกครั้ง ${esc(thaiDate(a.snooze.until))}</span></span><span class="al-acts">${canAct(a) ? `<button type="button" class="snz" data-act="unsnooze" data-key="${esc(a.key)}" aria-label="ให้เรื่อง ${esc(a.title)} กลับมาเตือนตอนนี้">เตือนตอนนี้</button>` : ''}</span></li>`).join('')}</ul></details>`;
}
export function alertsBlock(alerts, emptyText, opt = {}) {
  // เรื่องที่ห้องนี้ทำเองได้ขึ้นก่อน เรื่องที่แจ้งให้ทราบ (ฝ่ายอื่นทำ) ตามหลัง ในแต่ละกลุ่มยังเรียงวิกฤตก่อนเหมือนเดิม
  alerts = [...alerts.filter(canAct), ...alerts.filter((a) => !canAct(a))];
  const snz = snoozedBlock(opt.snoozed || []);
  // แท็บอื่นที่ไม่ใช่แท็บแรกของห้อง: พับแจ้งเตือนเป็นแถบเดียว งานของแท็บขึ้นก่อน (QA-026 ตรวจความเรียบร้อย ข้อ 10)
  if (opt.fold && alerts.length) {
    const c = alerts.filter((a) => a.level === 'crit').length;
    return `<details class="alerts-fold"><summary>${I.right}<span>แจ้งเตือนของฝ่าย ${alerts.length} เรื่อง${c ? ` <strong class="tx-crit">วิกฤต ${c} เรื่อง</strong>` : ''}</span><span class="fold-hint">กดเพื่อดู</span></summary><ul class="alist">${alerts.map((a) => compactAlert(a)).join('')}</ul></details>${snz}`;
  }
  if (!alerts.length) { const lv = opt.quietLevel || 'ok'; return `<p class="alerts-quiet">${chip(LEVEL_TEXT[lv], lv)} ${esc(emptyText || 'ไม่มีแจ้งเตือนของฝ่ายวันนี้ ระบบจะขึ้นคูปองเมื่อมีของใกล้หมด ของมาไม่ทัน ของใกล้หมดอายุ เครื่องมือใกล้ครบกำหนด หรืองานหยุด')}</p>${snz}`; }
  const top = alerts.slice(0, 3);
  const rest = alerts.slice(3);
  // จอมือถือแสดงคูปองใบแรกใบเดียว ใบที่เหลือรวมไว้ในรายการพับ งานของแท็บขึ้นเร็วขึ้น
  const phoneRest = top.slice(1);
  const nDesk = rest.length, nPhone = rest.length + phoneRest.length;
  return `<section class="alerts" aria-labelledby="al-h"><h2 id="al-h" class="sr">แจ้งเตือน ${alerts.length} เรื่อง</h2>
    <div class="coupons">${top.map(coupon).join('')}</div>
    ${nPhone ? `<details class="more${nDesk ? '' : ' ph-only'}"><summary><span class="ph-hide">เรื่องอื่นอีก ${nDesk} เรื่อง</span><span class="ph-only">เรื่องอื่นอีก ${nPhone} เรื่อง</span></summary><ul class="alist">${phoneRest.map((a) => compactAlert(a, 'ph-only')).join('')}${rest.map((a) => compactAlert(a)).join('')}</ul></details>` : ''}
    ${snz}
  </section>`;
}
export const seg = (room, tabs, cur, extra = '') => `<nav class="seg" aria-label="งานในห้อง">${tabs.map(([k, t]) => `<a href="#/${room}?tab=${k}${extra}" ${k === cur ? 'aria-current="page"' : ''}>${esc(t)}</a>`).join('')}</nav>`;

// ช่องเลือกรายการแบบพิมพ์ค้นได้ (รายการมีหลายร้อย) ค่าที่ส่งคือรหัสคำแรก
export function itemPicker({ name, items, value, act = '', label = 'รายการ', id = '', required = true }) {
  const dl = `dl-${name}-${id || 'x'}`;
  const cur = items.find((i) => i.code === value);
  return `<label class="f">${esc(label)}<input class="in" name="${name}" list="${dl}" ${act ? `data-act="${act}"` : ''} value="${cur ? esc(`${cur.code} ${cur.name}`) : ''}" placeholder="พิมพ์รหัสหรือชื่อเพื่อค้น" autocomplete="off" ${required ? 'required' : ''}></label>
    <datalist id="${dl}">${items.map((i) => `<option value="${esc(`${i.code} ${i.name}`)}">`).join('')}</datalist>`;
}
export const codeOf = (v) => String(v || '').trim().split(/\s+/)[0];
export { staff };
