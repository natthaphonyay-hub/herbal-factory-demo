// ชิ้นส่วนหน้าจอที่ทุกห้องใช้ร่วมกัน: ตัวเลข ตราประทับ คูปอง สำเนาคาร์บอน ปุ่มเลือกรายการ และการตรวจสิทธิ์
import { CAN, DEPTS, ROLE_ABBR } from './config.js';
import { S, currentUser, isIntUnit, isFG, thaiDate, thaiLongDate, daysBetween, staff } from './data.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = (n, d = 0) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d });
export const num2 = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const unitOf = (code) => S.items.get(code)?.unit || '';
export const qn = (code, q) => (isIntUnit(unitOf(code)) ? num(q) : num2(q));
export const qty = (code, q) => `${qn(code, q)} ${unitOf(code)}`;
export const qh = (code, q) => `<span class="num">${qn(code, q)}</span><span class="u">${esc(unitOf(code))}</span>`;
export const money = (n) => `${num(n)} บาท`;
export const baht = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const mill = (n) => (n / 1e6).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const short = (name) => String(name || '').replace(' (สมมุติ)', '');
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

export function toast(msg, level = 'ok') {
  const el = document.createElement('div');
  el.className = `toast toast-${level}`;
  el.textContent = msg;
  $('#toast').appendChild(el);
  setTimeout(() => el.remove(), 5600);
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
export const nav = { route: () => {} };
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
  return `<section class="slip" aria-label="${esc(o.k)}">
    <div><div class="slip-k">${esc(o.k)}</div><div class="slip-no">${esc(o.no)}</div></div>
    <div class="slip-main"><div class="t">${esc(o.title)}</div>${(o.lines || []).map((l) => `<div class="d">${esc(l)}</div>`).join('')}
      ${o.links ? `<div class="slip-links">${o.links.map(([t, href]) => `<a href="${href}">${I.doc}${esc(t)}</a>`).join('')}</div>` : ''}</div>
    ${stamp(o.stamp[0], o.stamp[1], true)}
    <button type="button" class="slip-x" data-act="slipClose" aria-label="ปิดสำเนา">${I.close}</button>
  </section>`;
}

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
const keepCodes = (html) => html.replace(/((?:[A-Z]{1,3}|[ก-ฮ]{2})\d{2}-\d{3,4}|\d{8})/g, '<span class="nowrap">$1</span>');
export function coupon(a) {
  return `<article class="coupon lv-${a.level}">
    <div class="stub"><span class="stub-k">${esc(a.stub.k)}</span><span class="stub-n">${esc(a.stub.n)}${a.stub.u ? `<small>${esc(a.stub.u)}</small>` : ''}</span><span class="stub-ref">${esc(a.stub.ref || '')}</span></div>
    <div class="cbody"><h3><span class="sr">${LEVEL_TEXT[a.level]} </span>${subjectHref(a) ? `<a class="c-link" href="${subjectHref(a)}">${keepCodes(esc(a.title))}</a>` : keepCodes(esc(a.title))}</h3>
      <dl class="fields">${a.fields.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      ${a.timeline ? routeBar(a.timeline) : ''}
      <a class="go" href="#/${a.go}">${esc(a.actionText)}${I.arrow}</a></div>
    ${stamp(a.stamp, a.level)}
  </article>`;
}
const compactAlert = (a) => `<li>${chip(a.stamp, a.level)}<span class="t">${subjectHref(a) ? `<a href="${subjectHref(a)}">${keepCodes(esc(a.title))}</a>` : keepCodes(esc(a.title))}<span class="d">${esc(a.detail)}</span></span><a href="#/${a.go}">${esc(a.actionText)}</a></li>`;
export function alertsBlock(alerts, emptyText) {
  if (!alerts.length) return `<p class="alerts-quiet">${chip('ปกติ', 'ok')} ${esc(emptyText || 'ไม่มีแจ้งเตือนของฝ่ายวันนี้ ระบบจะขึ้นคูปองเมื่อมีของใกล้หมด ของมาไม่ทัน ของใกล้หมดอายุ เครื่องมือใกล้ครบกำหนด หรืองานหยุด')}</p>`;
  const top = alerts.slice(0, 3);
  const rest = alerts.slice(3);
  return `<section class="alerts" aria-labelledby="al-h"><h2 id="al-h" class="sr">แจ้งเตือน ${alerts.length} เรื่อง</h2>
    <div class="coupons">${top.map(coupon).join('')}</div>
    ${rest.length ? `<details class="more"><summary>เรื่องอื่นอีก ${rest.length} เรื่อง</summary><ul class="alist">${rest.map(compactAlert).join('')}</ul></details>` : ''}
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
