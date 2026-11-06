// เวอร์ชัน 2.4 (ข้อ B ในรายงานเทียบโปรแกรมดัง): คีย์ลัด แถบยังไม่ได้บันทึก และจำตัวกรองบอร์ดของแต่ละคน
// คีย์ลัดพาไปหน้าหรือเปิดฟอร์มเปล่าเท่านั้น ไม่มีคีย์ลัดบันทึก ปล่อยผ่าน หรืออนุมัติ (การตัดสินรายล็อตต้องกดเองทีละครั้ง)
import { ROOMS, canEnter, homeRoom } from './config.js';
import { currentUser } from './data.js';
import { I, esc, can } from './ui.js';

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
const CTRL_K = IS_MAC ? '⌘ K' : 'Ctrl K';

// ---------- จำตัวกรองที่ใช้ล่าสุด (ข้อ B2) ----------
// เก็บในเบราว์เซอร์เครื่องนั้นของแต่ละผู้ใช้ เป็นความสะดวก ถ้าเบราว์เซอร์ไม่ให้เก็บก็ใช้ค่าตั้งต้น ไม่กระทบข้อมูล
export function viewGet(key) { try { return localStorage.getItem(`hfd-view-${key}`) || ''; } catch { return ''; } }
export function viewSet(key, v) { try { localStorage.setItem(`hfd-view-${key}`, v); } catch { /* เบราว์เซอร์ไม่ให้เก็บ ใช้ค่าตั้งต้นไป */ } }

// ---------- คีย์ลัด (ข้อ B1) ----------
function boardHref() {
  const role = currentUser().role;
  const home = homeRoom(role);
  const lanes = ['prod', 'process'];
  const id = lanes.includes(home) ? home : lanes.find((r) => { const room = ROOMS.find((x) => x.id === r); return room && canEnter(room, role); });
  return id ? `#/${id}?tab=board` : '';
}
function keyList() {
  const rows = [[[CTRL_K], 'ค้นทุกอย่าง ล็อต รายการ งาน และหน้า'], [['g', 'h'], 'กลับห้องของฉัน'], [['g', 'n'], 'บันทึกถึงฝ่าย']];
  if (boardHref()) rows.push([['g', 'b'], 'บอร์ดงานของฝ่าย']);
  if (can('receive')) rows.push([['r'], 'เปิดฟอร์มรับเข้า FM-01']);
  if (can('issue')) rows.push([['i'], 'เปิดฟอร์มเบิกออก']);
  rows.push([['?'], 'เปิดรายการคีย์ลัดนี้'], [['Esc'], 'ปิดกล่องที่เปิดอยู่']);
  return rows;
}
let keysDlg = null;
export function openKeys() {
  if (!keysDlg || keysDlg.open || document.querySelector('dialog[open]')) return;
  keysDlg.querySelector('.keys-l').innerHTML = keyList().map(([ks, t]) => `<dt>${ks.map((k) => `<kbd>${esc(k)}</kbd>`).join('<span class="keys-then">แล้ว</span>')}</dt><dd>${esc(t)}</dd>`).join('');
  keysDlg.showModal();
  keysDlg.querySelector('.keys-x').focus();
}
const TYPING = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
const go = (h) => { if (h && location.hash !== h) location.hash = h; };
let gAt = 0;
function onKey(e) {
  if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target instanceof Element && e.target.closest(TYPING)) return;
  if (document.querySelector('dialog[open]')) return;
  // อ่านตำแหน่งแป้น (code) จึงใช้ได้ทั้งตอนแป้นเป็นภาษาไทยและอังกฤษ
  const code = e.code;
  if ((code === 'Slash' && e.shiftKey) || e.key === '?') { e.preventDefault(); gAt = 0; openKeys(); return; }
  if (e.shiftKey) return;
  const now = performance.now();
  if (gAt && now - gAt < 1500) {
    gAt = 0;
    const dest = code === 'KeyH' ? `#/${homeRoom(currentUser().role)}` : code === 'KeyN' ? '#/notes' : code === 'KeyB' ? boardHref() : '';
    if (dest) { e.preventDefault(); go(dest); }
    return;
  }
  if (code === 'KeyG') { gAt = now; return; }
  if (code === 'KeyR' && can('receive')) { e.preventDefault(); go('#/store?tab=receive'); }
  if (code === 'KeyI' && can('issue')) { e.preventDefault(); go('#/store?tab=issue'); }
}

// ---------- แถบยังไม่ได้บันทึก (ข้อ B3) ----------
// ต่อจากตัวถามก่อนออก (QA-029): กรอกค้างเมื่อไรขึ้นแถบใต้แถบหัว บอกว่าฟอร์มไหนยังไม่ได้บันทึก มีปุ่มบันทึกกับล้างที่กรอก
// แถบลอยทับ ไม่ดันเนื้อหาเลื่อนลงตอนพิมพ์ ยังบันทึกด้วยการกดปุ่มเหมือนเดิม ไม่บันทึกเองระหว่างพิมพ์
const FORM_NAME = { receive: 'ฟอร์มรับเข้า', issue: 'ฟอร์มเบิกออก', job: 'ฟอร์มเปิดงาน', qc: 'ผลตรวจ', pr: 'ใบขอซื้อ', amend: 'การแก้ไข', void: 'การลบ', note: 'บันทึกถึงฝ่าย', noteQuick: 'บันทึกถึงฝ่าย', master: 'ทะเบียน', formula: 'สูตร', maint: 'บันทึกบำรุงรักษา', prodStatus: 'สถานะผลิตภัณฑ์' };
let bar = null, cur = null, deps = null, pending = 0;
const submitOf = (f) => f.querySelector('button[type="submit"], button:not([type])');
function placeBar() {
  const h = document.querySelector('.bar');
  bar.style.top = `${(h ? Math.max(0, Math.round(h.getBoundingClientRect().bottom)) : 0) + 8}px`;
}
export function updSaveBar() {
  pending = 0;
  if (!bar) return;
  const f = deps.dirtyForm();
  cur = f;
  if (!f) {
    if (!bar.hidden) { bar.hidden = true; document.body.classList.remove('has-savebar'); }
    return;
  }
  const text = `${FORM_NAME[f.dataset.form] || 'ฟอร์มนี้'}ยังไม่ได้บันทึก ถ้าออกจากหน้านี้ ระบบจะถามก่อน`;
  const t = bar.querySelector('.sb-t');
  if (t.textContent !== text) t.textContent = text;
  const sb = submitOf(f);
  const save = bar.querySelector('.sb-save');
  save.textContent = (sb?.textContent || '').replace(/\s+/g, ' ').trim() || 'บันทึก';
  save.hidden = !sb;
  placeBar();
  if (bar.hidden) { bar.hidden = false; document.body.classList.add('has-savebar'); }
}
const queue = () => { if (!pending) pending = requestAnimationFrame(updSaveBar); };

export function initQuick(d) {
  deps = d;
  keysDlg = document.createElement('dialog');
  keysDlg.className = 'keys';
  keysDlg.setAttribute('aria-labelledby', 'keys-h');
  keysDlg.innerHTML = `<div class="keys-head"><h2 id="keys-h">คีย์ลัด</h2><button type="button" class="pal-x keys-x" aria-label="ปิด">${I.close}</button></div>
    <dl class="keys-l"></dl>
    <p class="keys-n">ใช้ได้ทั้งแป้นไทยและอังกฤษ ไม่ทำงานตอนกำลังพิมพ์ในช่องกรอก คีย์ลัดพาไปหน้าหรือเปิดฟอร์มเปล่าเท่านั้น ไม่มีคีย์ลัดบันทึก ปล่อยผ่าน หรืออนุมัติ</p>`;
  document.body.appendChild(keysDlg);
  keysDlg.querySelector('.keys-x').addEventListener('click', () => keysDlg.close());
  keysDlg.addEventListener('click', (e) => { if (e.target === keysDlg) keysDlg.close(); });
  document.addEventListener('keydown', onKey);
  document.addEventListener('click', (e) => { if (e.target.closest?.('[data-keys-open]')) openKeys(); });

  bar = document.createElement('div');
  bar.className = 'savebar';
  bar.hidden = true;
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'ฟอร์มที่ยังไม่ได้บันทึก');
  bar.innerHTML = `<span class="sb-dot" aria-hidden="true"></span><span class="sb-t" aria-live="polite"></span><span class="sb-acts"><button type="button" class="btn btn-sm sb-clear">ล้างที่กรอก</button><button type="button" class="btn btn-sm sb-save">บันทึก</button></span>`;
  document.body.appendChild(bar);
  bar.querySelector('.sb-save').addEventListener('click', () => {
    if (!cur || !cur.isConnected) return updSaveBar();
    const sb = submitOf(cur);
    cur.requestSubmit(sb || undefined);
  });
  bar.querySelector('.sb-clear').addEventListener('click', () => deps.rerender());
  document.addEventListener('input', queue, true);
  document.addEventListener('change', queue, true);
  addEventListener('resize', () => { if (!bar.hidden) placeBar(); });
}
