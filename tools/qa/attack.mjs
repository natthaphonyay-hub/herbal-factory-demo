// บอทมือพลาดและบอทจอมป่วน (ทีม QA): ลองทำผิดแบบคนจริงตามประเภทความผิดพลาดของคน (พลาดมือ ลืม เข้าใจผิด ฝ่าฝืน)
// และลองทำข้อมูลเสียหายโดยตั้งใจ แต่ละกรณีเริ่มจากข้อมูลจำลองตั้งต้นใหม่ทุกครั้ง ผลแต่ละกรณี: ระบบกัน ตรวจเจอ หรือหลุด
// วิธีรัน: node tools/qa/attack.mjs --out <โฟลเดอร์ผล>
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, launch, PAGE_HELPERS, sleep } from './lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('out', join(process.cwd(), 'qa-out'));
const ONLY = arg('only', '');
const WIDTH = Number(arg('width', 1440));
mkdirSync(OUT, { recursive: true });
const DAY = '2026-11-06';
const srv = await startServer();
srv.state.metaBase = '2026-11-05';
const br = await launch();
let page = br.page;

// ตัวช่วยในหน้าเว็บสำหรับกรณีทดสอบ
const H = `(() => {
  const { data, ui } = window.qa;
  // อ่านข้อความแจ้งจากหน้าจอตรงๆ (ตัวดักเดิมทำงานช้ากว่าหนึ่งจังหวะ ข้อความจึงว่างในรอบก่อน)
  // รอบตรวจความเรียบร้อย: ข้อผิดตอนส่งฟอร์มขึ้นในฟอร์ม (.form-err) ไม่ลอยมุมจอ จึงอ่านทั้งสองที่
  const toasts = { get length() { return document.querySelectorAll('#toast .toast').length; }, slice: (a) => [...[...document.querySelectorAll('#toast .toast')].slice(a).map((x) => x.textContent.trim()), ...[...document.querySelectorAll('#main .form-err')].map((x) => x.textContent.trim())] };
  const S = data.S;
  const as = (u) => data.setUser(u);
  const go = (h) => { history.replaceState(null, '', h); ui.nav.route(); };
  const n = () => S.events.length;
  const dlgText = () => { const d = document.querySelector('dialog.dlg[open]'); return d ? 'ถามยืนยัน: ' + (d.querySelector('.dlg-b')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160) : ''; };
  const submit = (type, inp, u) => { if (u) as(u); const n0 = n(), t0 = toasts.length; ui.actions.submitNew(type, inp); return { ok: n() > n0, added: n() - n0, toast: toasts.slice(t0).join(' | ') || dlgText(), ev: S.events[S.events.length - 1] }; };
  // กล่องยืนยันของเว็บ (เพิ่มรอบแก้ QA 2026-11-06): กดยืนยันให้ เจตนาของแต่ละกรณีเหมือนเดิม
  const okDialog = (vals = {}) => { const d = document.querySelector('dialog.dlg[open]'); if (!d) return false; for (const [k, v] of Object.entries(vals)) { const el = d.querySelector('[name="' + k + '"]'); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } } d.querySelector('[data-dlg="ok"]').click(); return true; };
  const click = (sel, u, hash, vals) => { if (u) as(u); if (hash) go(hash); const b = document.querySelector(sel); if (!b) return { found: false }; const n0 = n(), t0 = toasts.length; b.click(); const dialog = okDialog(vals); return { found: true, disabled: b.disabled, dialog, ok: n() > n0, added: n() - n0, toast: toasts.slice(t0).join(' | ') }; };
  const form = (hash, sel, vals, u) => { if (u) as(u); go(hash); const f = document.querySelector(sel); if (!f) return { found: false }; for (const [k, v] of Object.entries(vals)) { const el = f.querySelector('[name="' + k + '"]'); if (el) el.value = v; } const n0 = n(), t0 = toasts.length; const valid = f.checkValidity(); f.requestSubmit(); return { found: true, valid, ok: n() > n0, added: n() - n0, toast: toasts.slice(t0).join(' | '), ev: S.events[S.events.length - 1] }; };
  const lot = (no) => S.lotMap.get(no);
  const recvLot = (r) => r.ev?.effects?.lots?.[0]?.lot_no;
  // หัวหน้ากลุ่มงานตั้งผู้ขายรายหนึ่ง (ไม่ใช่ผู้ขายของ 91004) เป็นไม่ผ่านการคัดเลือก ผ่านฟอร์มทะเบียน
  const unapprove = () => {
    const sup = S.base.suppliers.find((s) => s.type !== 'เกษตรกร' && s.supplier_id !== S.items.get('91004').supplier_id);
    // รอบแก้ QA: อนุมัติหรือถอนการคัดเลือกผู้ขายเป็นหน้าที่หัวหน้าฝ่ายควบคุมคุณภาพ (QP-12 ข้อ 4.3) จึงใช้ U05
    as('U05'); go('#/registers?tab=suppliers&edit=' + encodeURIComponent(sup.supplier_id));
    const f = document.querySelector('form[data-form="master"]');
    const ap = f && f.querySelector('[name="approved"]');
    if (!ap) return null;
    ap.value = 'N';
    const rs = f.querySelector('[name="reason"]'); if (rs) rs.value = 'ผลประเมินผู้ขายไม่ผ่าน (ทดสอบ)';
    f.requestSubmit();
    const now = S.base.suppliers.find((s) => s.supplier_id === sup.supplier_id);
    return now.approved === 'Y' ? null : now;
  };
  window.qa2 = { S, data, ui, toasts, as, go, n, submit, click, form, lot, recvLot, unapprove, okDialog };
  return true;
})()`;

async function fresh(user = 'U00', hash = 'overview') {
  await page.send('Page.navigate', { url: `${srv.origin}/data/meta.json` });
  await sleep(150);
  await page.ev(`localStorage.clear(); localStorage.setItem('hfd-user', JSON.stringify('${user}')); localStorage.setItem('qa-now', '${Date.parse(`${DAY}T09:00:00+07:00`)}'); true`);
  await page.open(srv.origin, hash, WIDTH);
  await page.ev(PAGE_HELPERS);
  await page.ev(H);
  page.errors.length = 0; page.consoleErrors.length = 0; page.dialogs.length = 0;
}
async function reload(hash = 'overview') {
  await page.open(srv.origin, hash);
  await page.ev(PAGE_HELPERS);
  await page.ev(H);
}
const run = (fn, ...args) => page.ev(`(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`);
// คลิกเมาส์จริงสองครั้งติดกัน (ดับเบิลคลิก) ที่ตำแหน่งปุ่ม
async function dblclick(sel) {
  const r = await page.ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return null; b.scrollIntoView({ block: 'center' }); const x = b.getBoundingClientRect(); return { x: x.left + x.width / 2, y: x.top + x.height / 2 }; })()`);
  if (!r) return false;
  const m = (type, clickCount) => page.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount });
  await m('mouseMoved', 0); await m('mousePressed', 1); await m('mouseReleased', 1);
  await sleep(90);
  await m('mousePressed', 2); await m('mouseReleased', 2);
  await sleep(250);
  return true;
}

const results = [];
const CASES = [];
const def = (id, group, title, expect, fn) => CASES.push({ id, group, title, expect, fn });

// ================= พลาดมือ (slip) =================
def('S01', 'พลาดมือ', 'รับเข้าจำนวนเกินปกติ 10 เท่า (เติมศูนย์เกิน)', 'ระบบเตือนหรือถามยืนยันเมื่อจำนวนผิดปกติมาก', async () => {
  await fresh('U01');
  return run(() => {
    const { S, submit } = window.qa2;
    const code = '91004';
    const qs = S.moves.filter((m) => m.item_code === code && m.type === 'รับ').map((m) => m.qty).sort((a, b) => a - b);
    const med = qs[Math.floor(qs.length / 2)] || 1000;
    const sup = S.items.get(code).supplier_id;
    const r = submit('receive', { item: code, po: '', supplier: sup, qty: String(med * 10), exp: '' });
    return { pass: !r.ok, actual: r.ok ? `บันทึกได้ทันที ${med * 10} (ปกติรับครั้งละราว ${med}) ไม่มีคำเตือน` : `ถูกกัน: ${r.toast}`, toast: r.toast };
  });
});
def('S02', 'พลาดมือ', 'พิมพ์จำนวนแบบมีจุลภาค 1,000 หรือเลขไทย ๑๐๐', 'ไม่บันทึกค่าผิด และบอกชัดว่าต้องพิมพ์อย่างไร', async () => {
  await fresh('U01');
  return run(() => {
    const { form } = window.qa2;
    const a = form('#/store?tab=receive&item=91004', 'form[data-form="receive"]', { qty: '1,000' });
    const ma = document.querySelector('form[data-form="receive"] [name="qty"]')?.validationMessage || '';
    const b = form('#/store?tab=receive&item=91004', 'form[data-form="receive"]', { qty: '๑๐๐' });
    const mb = document.querySelector('form[data-form="receive"] [name="qty"]')?.validationMessage || '';
    // รอบแก้ QA (QA-030): ผ่านเมื่อไม่บันทึก และข้อความเตือนบอกชัดว่าต้องพิมพ์ตัวเลขอารบิก ไม่ใส่จุลภาค
    const clear = /อารบิก/.test(ma) && /จุลภาค/.test(ma);
    return { pass: !a.ok && !b.ok && clear, actual: `จุลภาค: ${a.ok ? 'บันทึกได้' : `ไม่บันทึก ข้อความเตือน "${ma}"`} | เลขไทย: ${b.ok ? 'บันทึกได้' : `ไม่บันทึก ข้อความเตือน "${mb}"`}` };
  });
});
def('S03', 'พลาดมือ', 'ใส่ทศนิยมกับของที่นับเป็นชิ้น (เช่น 2.6 หลอด)', 'ไม่ปัดเงียบๆ ต้องเตือนหรือไม่ยอมรับ', async () => {
  await fresh('U01');
  return run(() => {
    const { S, submit, data } = window.qa2;
    const it = [...S.items.values()].find((i) => i.make === 'buy' && data.isIntUnit(i.unit));
    const r = submit('receive', { item: it.code, po: '', supplier: it.supplier_id, qty: '2.6', exp: '' });
    const q = r.ev?.effects?.lots?.[0]?.qty_in;
    return { pass: !r.ok, actual: r.ok ? `กรอก 2.6 ${it.unit} ระบบบันทึก ${q} ${it.unit} โดยไม่บอก` : `ถูกกัน: ${r.toast}` };
  });
});
def('S04', 'พลาดมือ', 'พิมพ์รหัสรายการผิดในช่องรับเข้า (พิมพ์ 2001 ขมิ้นชันแห้ง ซึ่งไม่ใช่ของที่รับจากภายนอก)', 'บอกว่ารหัสนี้รับเข้าไม่ได้ และไม่เปลี่ยนรายการเอง', async () => {
  await fresh('U01');
  return run(() => {
    const { go, toasts } = window.qa2;
    go('#/store?tab=receive&item=91009');
    const inp = document.querySelector('form[data-form="receive"] [name="item"]');
    const t0 = toasts.length;
    inp.value = '2001';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    return new Promise((ok) => setTimeout(() => {
      const now = document.querySelector('form[data-form="receive"] [name="item"]')?.value || '';
      ok({ pass: now.startsWith('2001') || toasts.length > t0, actual: `หลังพิมพ์ 2001 ช่องรายการกลายเป็น "${now}" ${toasts.length > t0 ? 'มีข้อความ: ' + toasts.slice(t0).join(' | ') : 'ไม่มีข้อความเตือน'}` });
    }, 60));
  });
});
def('S05', 'พลาดมือ', 'กดปุ่มบันทึกรับเข้าสองครั้งติดกัน (ดับเบิลคลิก)', 'บันทึกครั้งเดียว', async () => {
  await fresh('U01', 'store?tab=receive&item=91004');
  await run(() => { const f = document.querySelector('form[data-form="receive"]'); f.querySelector('[name="qty"]').value = '500'; return true; });
  const n0 = await page.ev('window.qa2.n()');
  await dblclick('form[data-form="receive"] button[type="submit"]');
  const n1 = await page.ev('window.qa2.n()');
  return { pass: n1 - n0 === 1, actual: `ดับเบิลคลิกแล้วเกิดรายการ ${n1 - n0} รายการ` };
});
def('S06', 'พลาดมือ', 'ดับเบิลคลิกปุ่มย้ายการ์ดบนบอร์ดฝ่ายผลิต', 'ย้ายการ์ดใบที่ตั้งใจ 1 ขั้นเท่านั้น', async () => {
  await fresh('U03', 'prod?tab=board');
  const target = await run(() => { const c = window.qa2.data.D.board.find((x) => x.job.lane === 'ผลิต' && x.job.status === 'running' && (x.stage === 'ผลิต' || x.stage === 'บรรจุ')); if (!c) return null; const b = document.querySelector(`[data-act="move"][data-job="${c.job.job_id}"][data-dir="1"]`); if (!b) return null; b.id = 'qa-target'; return `${c.job.job_id} (ขั้น ${c.stage})`; });
  if (!target) return { pass: true, actual: 'ไม่พบการ์ดที่ย้ายได้ ทดสอบไม่ได้', skip: true };
  const n0 = await page.ev('window.qa2.n()');
  await dblclick('#qa-target');
  const evs = await run((n0) => window.qa2.S.events.slice(n0).map((e) => e.summary), n0);
  const moved = evs.length;
  return { pass: moved === 1, actual: `ตั้งใจย้าย ${target} 1 ครั้ง เกิด ${moved} รายการ: ${evs.join(' / ')}` };
});
def('S07', 'พลาดมือ', 'ดับเบิลคลิกปุ่มปล่อยผ่านในคิวฝ่ายควบคุมคุณภาพ', 'ปล่อยผ่านเฉพาะล็อตที่ตั้งใจ ล็อตเดียว', async () => {
  await fresh('U01');
  await run(() => { const { submit, S } = window.qa2; const it = S.items.get('91004'); for (let i = 0; i < 3; i++) submit('receive', { item: '91004', po: '', supplier: it.supplier_id, qty: String(1000 + i), exp: '' }, 'U01'); const lots = S.lots.filter((l) => l.status === 'รอปล่อยผ่าน'); for (const l of lots) submit('qcResult', { lot: l.lot_no, result: 'ผ่านเกณฑ์', note: '' }, 'U04'); return lots.length; });
  await run(() => { window.qa2.as('U05'); window.qa2.go('#/qc?tab=queue'); const b = document.querySelector('[data-act="release"][data-res="ผ่าน"]:not([disabled])'); if (b) b.id = 'qa-target'; return b?.dataset.lot; });
  const lotT = await page.ev(`document.getElementById('qa-target')?.dataset.lot || ''`);
  const n0 = await page.ev('window.qa2.n()');
  await dblclick('#qa-target');
  // รอบแก้ QA: ดับเบิลคลิกแล้วต้องยังไม่มีอะไรถูกปล่อยผ่าน กล่องยืนยันต้องแสดงเลขล็อตที่ตั้งใจ แล้วกดยืนยันครั้งเดียว
  const before = await run((n0) => window.qa2.S.events.slice(n0).length, n0);
  const shown = await page.ev(`(() => { const d = document.querySelector('dialog.dlg[open]'); return d ? (d.querySelector('.dlg-big')?.textContent || d.textContent).trim().slice(0, 40) : ''; })()`);
  await run(() => window.qa2.okDialog());
  const evs = await run((n0) => window.qa2.S.events.slice(n0).map((e) => e.summary), n0);
  return { pass: before === 0 && shown.includes(lotT) && evs.length === 1 && evs[0].includes(lotT), actual: `ตั้งใจปล่อยผ่าน ${lotT} ดับเบิลคลิกแล้วบันทึกไป ${before} รายการ กล่องยืนยันแสดง "${shown}" กดยืนยันแล้วเกิด ${evs.length} รายการ: ${evs.join(' / ')}` };
});
def('S08', 'พลาดมือ', 'ดับเบิลคลิกปุ่มรับชำระในหน้าลูกหนี้', 'รับชำระเฉพาะใบที่ตั้งใจ ใบเดียว', async () => {
  await fresh('U07', 'sales?tab=ar');
  const inv = await run(() => { const b = document.querySelector('[data-act="pay"]:not([disabled])'); if (b) b.id = 'qa-target'; return b?.dataset.inv || null; });
  if (!inv) return { pass: true, actual: 'ไม่พบปุ่มรับชำระ ทดสอบไม่ได้', skip: true };
  const n0 = await page.ev('window.qa2.n()');
  await dblclick('#qa-target');
  // รอบแก้ QA: รับชำระมีกล่องกรอกจำนวนเงิน วันที่ เลขใบเสร็จ ดับเบิลคลิกแล้วต้องยังไม่บันทึก กรอกเลขใบเสร็จแล้วยืนยันครั้งเดียว
  const before = await run((n0) => window.qa2.S.events.slice(n0).length, n0);
  const shown = await page.ev(`document.querySelector('dialog.dlg[open] .dlg-big')?.textContent || ''`);
  await run(() => window.qa2.okDialog({ receipt: 'บร QA-1' }));
  const evs = await run((n0) => window.qa2.S.events.slice(n0).map((e) => e.summary), n0);
  return { pass: before === 0 && shown === inv && evs.length === 1 && evs[0].includes(inv), actual: `ตั้งใจรับชำระ ${inv} ดับเบิลคลิกแล้วบันทึกไป ${before} รายการ กล่องแสดง "${shown}" ยืนยันแล้วเกิด ${evs.length} รายการ: ${evs.join(' / ')}` };
});
def('S09', 'พลาดมือ', 'พิมพ์ชื่อลูกค้าผิดนิดเดียวตอนเบิกยาให้ลูกค้า (ไม่มีวรรค)', 'ระบบไม่ยอมให้ของออกโดยไม่มีใบส่งของ หรือถามยืนยัน', async () => {
  await fresh('U01');
  return run(() => {
    const { S, submit, data } = window.qa2;
    const st = [...S.items.values()].find((i) => (i.kind === 'ยารับประทาน' || i.kind === 'ยาใช้ภายนอก') && (S.lotsByItem.get(i.code) || []).some(data.usable));
    const cust = S.base.customers[1];
    const typo = cust.name.replace(/\s/g, '');
    const inv0 = S.invoices.length;
    const r = submit('issue', { item: st.code, qty: '5', to: typo });
    return { pass: !r.ok || S.invoices.length > inv0, actual: r.ok ? `ของออกจากคลัง 5 ${st.unit} ให้ "${typo}" แต่ไม่เกิดใบส่งของและลูกหนี้ (ชื่อจริง "${cust.name}")` : `ถูกกัน: ${r.toast}` };
  });
});

// ================= ลืม (lapse) =================
def('L01', 'ลืม', 'ลืมใส่วันหมดอายุ ตอนรับของที่ทะเบียนไม่มีอายุเก็บ', 'บังคับใส่วันหมดอายุสำหรับของที่หมดอายุได้ (สมุนไพร เคมีภัณฑ์)', async () => {
  await fresh('U01');
  return run(() => {
    const { S, submit } = window.qa2;
    const it = [...S.items.values()].find((i) => i.make === 'buy' && !i.shelf_days && ['เคมีภัณฑ์', 'แห้ง', 'ผง', 'สด'].includes(i.kind)) || [...S.items.values()].find((i) => i.make === 'buy' && !i.shelf_days);
    const r = submit('receive', { item: it.code, po: '', supplier: it.supplier_id, qty: '10', exp: '' });
    const l = r.ev?.effects?.lots?.[0];
    return { pass: !r.ok || !!l?.exp_date, actual: r.ok ? `รับ ${it.code} ${it.name} (${it.kind}) ได้โดยไม่มีวันหมดอายุ ล็อตนี้จะไม่ขึ้นเตือนหมดอายุเลย` : `ถูกกัน: ${r.toast}` };
  });
});
def('L02', 'ลืม', 'กรอกฟอร์มค้างไว้แล้วกดไปหน้าอื่น', 'เตือนว่ายังไม่ได้บันทึก', async () => {
  await fresh('U01', 'store?tab=receive&item=91004');
  return run(() => {
    const f = document.querySelector('form[data-form="receive"]');
    f.querySelector('[name="qty"]').value = '777';
    let warned = false;
    const h = (e) => { warned = true; };
    window.addEventListener('beforeunload', h);
    location.hash = '#/store?tab=stock';
    return new Promise((ok) => setTimeout(() => { const still = document.querySelector('form[data-form="receive"]'); ok({ pass: warned || !!still, actual: still ? 'ยังอยู่หน้าเดิม' : 'ไปหน้าอื่นทันที ค่าที่กรอกหายโดยไม่มีคำเตือน' }); }, 80));
  });
});
def('L03', 'ลืม', 'ล็อตรอปล่อยผ่านค้างคิว 10 วัน ไม่มีใครตรวจ', 'มีแจ้งเตือนในห้องฝ่ายควบคุมคุณภาพหรือภาพรวม', async () => {
  await fresh('U01');
  return run(() => {
    const { S, submit, data } = window.qa2;
    const it = S.items.get('91004');
    const r = submit('receive', { item: '91004', po: '', supplier: it.supplier_id, qty: '300', exp: '' });
    const lotNo = r.ev.effects.lots[0].lot_no;
    S.today = data.addDays(S.today, 10);
    data.withoutEvent('__x', () => 0);
    const hits = data.D.alerts.filter((a) => JSON.stringify(a).includes(lotNo));
    const q = data.D.qcQueue.find((x) => x.lot.lot_no === lotNo);
    return { pass: hits.length > 0, actual: hits.length ? `มีเตือน ${hits.length} รายการ: ${hits.map((a) => a.title).join(' / ')}` : `ไม่มีเตือนเฉพาะล็อตนี้ (อยู่ในคิว ${q?.waiting} วัน เห็นได้เมื่อเปิดคิวเอง)` };
  });
});

// ================= เข้าใจผิด (mistake) =================
def('K01', 'เข้าใจผิด', 'รับของอ้างใบสั่งซื้อของอีกรายการ', 'ไม่ยอมให้ปิดใบสั่งซื้อด้วยของคนละรายการ', async () => {
  await fresh('U01');
  return run(() => {
    const { S, submit } = window.qa2;
    const po = S.pos.find((p) => !p.received_date && p.lot_no !== 'ก่อนเริ่มระบบ');
    if (!po) return { pass: true, actual: 'ไม่มีใบสั่งซื้อค้าง', skip: true };
    const other = [...S.items.values()].find((i) => i.make === 'buy' && i.code !== po.item_code);
    const r = submit('receive', { item: other.code, po: po.po_no, supplier: po.supplier_id, qty: String(po.qty), exp: '' });
    const after = S.pos.find((p) => p.po_no === po.po_no);
    return { pass: !r.ok, actual: r.ok ? `รับ ${other.code} โดยอ้าง ${po.po_no} (สั่ง ${po.item_code}) ได้ ใบสั่งซื้อถูกปิดว่ารับแล้ว ${after.received_date}` : `ถูกกัน: ${r.toast}` };
  });
});
def('K02', 'เข้าใจผิด', 'ผู้ขายส่งของไม่ครบ (ส่งครึ่งเดียว) แล้วรับตามจริง', 'ใบสั่งซื้อยังค้างส่วนที่ขาด', async () => {
  await fresh('U01');
  return run(() => {
    const { S, submit } = window.qa2;
    const po = S.pos.find((p) => !p.received_date && p.lot_no !== 'ก่อนเริ่มระบบ');
    if (!po) return { pass: true, actual: 'ไม่มีใบสั่งซื้อค้าง', skip: true };
    const r = submit('receive', { item: po.item_code, po: po.po_no, supplier: po.supplier_id, qty: String(Math.round(po.qty / 2)), exp: '' });
    const after = S.pos.find((p) => p.po_no === po.po_no);
    return { pass: !after.received_date, actual: after.received_date ? `รับ ${Math.round(po.qty / 2)} จาก ${po.qty} ใบสั่งซื้อปิดว่ารับครบแล้ว ส่วนที่ขาดหายจากระบบ` : 'ใบสั่งซื้อยังเปิดอยู่' };
  });
});
def('K03', 'เข้าใจผิด', 'ใส่ปีหมดอายุเป็น พ.ศ. (2570) ในช่องวันที่', 'ไม่ยอมรับปีที่ไกลเกินจริง หรือถามยืนยัน', async () => {
  await fresh('U01');
  return run(() => {
    const { S, submit } = window.qa2;
    const it = S.items.get('91009') || [...S.items.values()].find((i) => i.make === 'buy');
    const r = submit('receive', { item: it.code, po: '', supplier: it.supplier_id, qty: '50', exp: '2570-03-01' });
    return { pass: !r.ok, actual: r.ok ? `บันทึกวันหมดอายุ ${r.ev.effects.lots[0].exp_date} (ค.ศ. 2570 อีก 544 ปี) ล็อตนี้จะถูกเบิกเป็นลำดับสุดท้ายและไม่เตือนหมดอายุ` : `ถูกกัน: ${r.toast}` };
  });
});
def('K04', 'เข้าใจผิด', 'รับของที่หมดอายุแล้ว (วันหมดอายุก่อนวันรับ)', 'เตือนหรือไม่ยอมรับ', async () => {
  await fresh('U01');
  return run(() => {
    const { S, submit } = window.qa2;
    const it = S.items.get('91009') || [...S.items.values()].find((i) => i.make === 'buy');
    const r = submit('receive', { item: it.code, po: '', supplier: it.supplier_id, qty: '50', exp: '2026-01-01' });
    return { pass: !r.ok, actual: r.ok ? 'บันทึกได้โดยไม่มีคำเตือน (ติดป้ายรอปล่อยผ่านตามปกติ)' : `ถูกกัน: ${r.toast}` };
  });
});
def('K05', 'เข้าใจผิด', 'รับของจากผู้ขายที่ยังไม่ผ่านการคัดเลือก (FM-46)', 'ไม่ยอมรับหรือเตือน (ใบขอซื้อกันไว้แล้ว แต่รับเข้าต้องกันด้วย)', async () => {
  await fresh('U01');
  return run(() => {
    const { S, submit } = window.qa2;
    const sup = window.qa2.unapprove();
    if (!sup) return { pass: true, actual: 'ตั้งผู้ขายเป็นไม่ผ่านการคัดเลือกไม่ได้ ทดสอบไม่ได้', skip: true };
    const r = submit('receive', { item: '91004', po: '', supplier: sup.supplier_id, qty: '100', exp: '' }, 'U01');
    return { pass: !r.ok, actual: r.ok ? `รับของจาก ${sup.name} (ยังไม่ผ่านคัดเลือก) ได้ ไม่มีคำเตือน` : `ถูกกัน: ${r.toast}` };
  });
});
def('K06', 'เข้าใจผิด', 'แบ่งใบขอซื้อรายการเดียวกันเป็นหลายใบในวันเดียว ให้แต่ละใบไม่เกินวงเงิน', 'เตือนว่าซื้อซ้ำรายการเดิมในช่วงใกล้กัน', async () => {
  await fresh('U01');
  return run(() => {
    const { S, submit } = window.qa2;
    const it = [...S.items.values()].find((i) => i.make === 'buy' && S.base.suppliers.find((s) => s.supplier_id === i.supplier_id)?.approved === 'Y');
    const unit = 100;
    const a = submit('pr', { item: it.code, supplier: it.supplier_id, qty: '4000', unit_cost: String(unit), purpose: 'ทดสอบ' });
    const b = submit('pr', { item: it.code, supplier: it.supplier_id, qty: '4000', unit_cost: String(unit), purpose: 'ทดสอบ' });
    return { pass: !(a.ok && b.ok) || /ซ้ำ|แบ่ง/.test(b.toast), actual: a.ok && b.ok ? 'ออกใบขอซื้อ 2 ใบ ใบละ 400,000 บาท รวม 800,000 บาท เกินวงเงินวิธีเฉพาะเจาะจง 500,000 บาท ระบบไม่เตือน' : `ใบที่สอง: ${b.toast}` };
  });
});
def('K07', 'เข้าใจผิด', 'แก้จำนวนรับเข้าหลังฝ่ายควบคุมคุณภาพปล่อยผ่านแล้ว', 'ไม่ยอมให้แก้ และบอกเหตุผลชัด', async () => {
  await fresh('U01');
  return run(() => {
    const { S, submit, click, form, data } = window.qa2;
    const it = S.items.get('91004');
    const r = submit('receive', { item: '91004', po: '', supplier: it.supplier_id, qty: '300', exp: '' }, 'U01');
    const lotNo = r.ev.effects.lots[0].lot_no;
    submit('qcResult', { lot: lotNo, result: 'ผ่านเกณฑ์', note: '' }, 'U04');
    click(`[data-act="release"][data-lot="${lotNo}"][data-res="ผ่าน"]`, 'U05', '#/qc?tab=queue');
    const f = form(`#/log?edit=${r.ev.id}`, 'form[data-form="amend"]', { qty: '30', reason: 'พิมพ์ผิด' }, 'U01');
    const msg = document.querySelector('#main')?.textContent.match(/(ต้อง|ยกเลิก|แก้ไม่ได้)[^\n]{0,80}/)?.[0] || '';
    return { pass: !f.ok, actual: f.ok ? 'แก้จำนวนได้ทั้งที่ปล่อยผ่านแล้ว' : `แก้ไม่ได้ ${f.found ? f.toast : 'ไม่มีฟอร์มแก้ไข ' + msg}` };
  });
});
def('K08', 'เข้าใจผิด', 'เจ้าหน้าที่ฝ่ายควบคุมคุณภาพกดปล่อยผ่านเอง', 'ไม่ยอม เฉพาะหัวหน้าฝ่ายควบคุมคุณภาพ', async () => {
  await fresh('U01');
  return run(() => {
    const { S, submit, click } = window.qa2;
    const it = S.items.get('91004');
    const r = submit('receive', { item: '91004', po: '', supplier: it.supplier_id, qty: '300', exp: '' }, 'U01');
    const lotNo = r.ev.effects.lots[0].lot_no;
    submit('qcResult', { lot: lotNo, result: 'ผ่านเกณฑ์', note: '' }, 'U04');
    const c = click(`[data-act="release"][data-lot="${lotNo}"][data-res="ผ่าน"]`, 'U04', '#/qc?tab=queue');
    return { pass: !c.ok, actual: c.ok ? 'ปล่อยผ่านได้' : `ไม่ได้: ${c.found ? (c.disabled ? 'ปุ่มกดไม่ได้' : c.toast) : 'ไม่มีปุ่ม'}` };
  });
});

def('K09', 'เข้าใจผิด', 'ยาที่เปลี่ยนสถานะเป็นเลิกผลิตแล้ว ยังพิมพ์รหัสเปิดงานผลิตได้ไหม', 'เปิดงานไม่ได้ และบอกว่ายาเลิกผลิตแล้ว', async () => {
  await fresh('U00');
  return run(() => {
    const { S, go, toasts } = window.qa2;
    const it = [...S.items.values()].find((i) => (i.kind === 'ยารับประทาน' || i.kind === 'ยาใช้ภายนอก') && i.lane === 'ผลิต' && (i.status || 'ผลิตอยู่') === 'ผลิตอยู่');
    window.qa2.as('U00'); go('#/product?code=' + it.code);
    const f = document.querySelector('form[data-form="prodStatus"]');
    const sel = f && f.querySelector('[name="status"]');
    if (!sel) return { pass: true, actual: 'ไม่พบฟอร์มเปลี่ยนสถานะ', skip: true };
    const opt = [...sel.options].map((o) => o.value).find((v) => v && v !== 'ผลิตอยู่');
    sel.value = opt; const rs = f.querySelector('[name="reason"]'); if (rs) rs.value = 'ทดสอบ'; const fm = f.querySelector('[name="fm40"]'); if (fm) fm.value = 'FM-40 ทดสอบ';
    f.requestSubmit();
    const st = S.items.get(it.code).status;
    // ทางที่ 1 ช่องรายการในฟอร์มเปิดงาน พิมพ์รหัสเอง
    window.qa2.as('U03'); go('#/prod?tab=new');
    const inp = document.querySelector('form[data-form="job"] [name="item"]');
    const t0 = toasts.length;
    if (inp) { inp.value = it.code; inp.dispatchEvent(new Event('change', { bubbles: true })); }
    return new Promise((ok) => setTimeout(() => {
      const now = document.querySelector('form[data-form="job"] [name="item"]')?.value || '';
      // ทางที่ 2 ส่งฟอร์มด้วยรหัสนั้นตรงๆ
      const r = window.qa2.submit('job', { room: 'prod', item: it.code, qty: '100' }, 'U03');
      ok({ pass: !r.ok && (now.startsWith(it.code) || toasts.length > t0), actual: `ตั้ง ${it.code} ${it.name} เป็น "${st}" แล้ว | พิมพ์รหัสในฟอร์มเปิดงาน ช่องกลายเป็น "${now.slice(0, 40)}" ${toasts.length > t0 ? 'มีข้อความ ' + toasts.slice(t0).join(' / ') : 'ไม่มีข้อความ'} | ส่งฟอร์มด้วยรหัสนี้: ${r.ok ? 'เปิดงานได้ ' + (r.ev?.summary || '') : 'ไม่ได้ ' + r.toast}` });
    }, 60));
  });
});

// ================= ฝ่าฝืน (violation) =================
def('V01', 'ฝ่าฝืน', 'คนเดียวสลับชื่อผู้ใช้เอง บันทึกผลตรวจแล้วอนุมัติปล่อยผ่านเอง', 'ระบบรู้ว่าเป็นคนเดียวกัน (ต้องมีการเข้าสู่ระบบรายคน)', async () => {
  await fresh('U01');
  return run(() => {
    const { S, submit, click } = window.qa2;
    const it = S.items.get('91004');
    const r = submit('receive', { item: '91004', po: '', supplier: it.supplier_id, qty: '300', exp: '' }, 'U01');
    const lotNo = r.ev.effects.lots[0].lot_no;
    submit('qcResult', { lot: lotNo, result: 'ผ่านเกณฑ์', note: '' }, 'U04');
    const c = click(`[data-act="release"][data-lot="${lotNo}"][data-res="ผ่าน"]`, 'U05', '#/qc?tab=queue');
    return { pass: !c.ok, actual: c.ok ? 'คนเดียวกดเลือกผู้ใช้ 3 ชื่อ รับเข้า บันทึกผลตรวจ และปล่อยผ่านได้ครบ ประวัติขึ้นเป็น 3 คน' : 'ถูกกัน' };
  });
});
def('V02', 'ฝ่าฝืน', 'ตั้งนาฬิกาเครื่องย้อนหลัง 30 วัน แล้วบันทึก', 'ระบบใช้เวลาของเซิร์ฟเวอร์ ไม่ใช่เวลาเครื่องผู้ใช้', async () => {
  await fresh('U01');
  await page.ev(`window.__qaSetNow(${Date.parse('2026-10-07T09:00:00+07:00')}); true`);
  await reload('overview');
  return run(() => {
    const { S, submit } = window.qa2;
    const it = S.items.get('91004');
    const r = submit('receive', { item: '91004', po: '', supplier: it.supplier_id, qty: '300', exp: '' }, 'U01');
    return { pass: false, actual: `บันทึกได้ วันที่รับ ${r.ev?.effects?.lots?.[0]?.date_in} เวลาในประวัติ ${r.ev?.at} (ย้อนหลังตามนาฬิกาเครื่อง)` };
  });
});
def('V03', 'ฝ่าฝืน', 'เจ้าหน้าที่ฝ่ายขายกดล้างข้อมูลทดลองทั้งหมด', 'เฉพาะผู้มีสิทธิ์ และเก็บสำรองก่อนล้าง', async () => {
  await fresh('U01');
  await run(() => { const { S, submit } = window.qa2; const it = S.items.get('91004'); submit('receive', { item: '91004', po: '', supplier: it.supplier_id, qty: '300', exp: '' }, 'U01'); return true; });
  return run(() => {
    const { S, click } = window.qa2;
    const n0 = S.events.length;
    window.confirm = () => true;
    const c = click('[data-act="reset"]', 'U07', '#/log');
    return { pass: S.events.length === n0, actual: c.found ? (S.events.length < n0 ? `ล้างได้ รายการ ${n0} รายการหายหมด ไม่มีสำรอง` : 'กดแล้วไม่ล้าง') : 'ไม่พบปุ่ม (เข้าหน้าไม่ได้)' };
  });
});
def('V04', 'ฝ่าฝืน', 'เจ้าหน้าที่จัดซื้อแก้ทะเบียนผู้ขายให้ "ผ่านการคัดเลือก" เอง แล้วออกใบขอซื้อ', 'คนอนุมัติผู้ขายต้องไม่ใช่คนซื้อ', async () => {
  await fresh('U01');
  return run(() => {
    const { S, go } = window.qa2;
    const sup = window.qa2.unapprove();
    if (!sup) return { pass: true, actual: 'ตั้งผู้ขายเป็นไม่ผ่านการคัดเลือกไม่ได้ ทดสอบไม่ได้', skip: true };
    window.qa2.as('U01');
    go(`#/registers?tab=suppliers&edit=${encodeURIComponent(sup.supplier_id)}`);
    const f = document.querySelector('form[data-form="master"]');
    if (!f) return { pass: true, actual: 'เจ้าหน้าที่จัดซื้อเปิดฟอร์มแก้ทะเบียนผู้ขายไม่ได้' };
    const ap = f.querySelector('[name="approved"]');
    if (!ap) return { pass: true, actual: 'ฟอร์มไม่มีช่องผ่านการคัดเลือก' };
    ap.value = 'Y';
    const rs = f.querySelector('[name="reason"]'); if (rs) rs.value = 'ทดสอบ';
    const n0 = S.events.length;
    f.requestSubmit();
    const ok = S.events.length > n0;
    return { pass: !ok, actual: ok ? `เจ้าหน้าที่ฝ่ายจัดซื้อและคลังเปลี่ยน ${sup.name} เป็นผ่านการคัดเลือกเองได้ แล้วซื้อจากรายนี้ได้ทันที` : 'บันทึกไม่ได้' };
  });
});

// ================= จงใจทำเสียหาย (sabotage) =================
def('X01', 'จงใจทำเสียหาย', 'แก้ผลตรวจ "ไม่ผ่านเกณฑ์" เป็น "ผ่านเกณฑ์" ในที่เก็บข้อมูลของเบราว์เซอร์ แล้วปล่อยผ่าน', 'ระบบตรวจเจอว่าข้อมูลถูกแก้นอกระบบ', async () => {
  await fresh('U01');
  const lotNo = await run(() => { const { S, submit } = window.qa2; const it = S.items.get('91004'); const r = submit('receive', { item: '91004', po: '', supplier: it.supplier_id, qty: '300', exp: '' }, 'U01'); const l = r.ev.effects.lots[0].lot_no; submit('qcResult', { lot: l, result: 'ไม่ผ่านเกณฑ์', note: 'ปนเปื้อน' }, 'U04'); return l; });
  await page.ev(`(() => { const k = 'hfd-events-v1'; const a = JSON.parse(localStorage.getItem(k)); for (const e of a) for (const r of e.effects?.qcResults || []) { r.result = 'ผ่านเกณฑ์'; r.note = ''; } for (const e of a) if (e.summary) e.summary = e.summary.replace('ไม่ผ่านเกณฑ์ (ปนเปื้อน)', 'ผ่านเกณฑ์'); localStorage.setItem(k, JSON.stringify(a)); return true; })()`);
  await reload('qc?tab=queue');
  return run((lotNo) => {
    const { click } = window.qa2;
    const c = click(`[data-act="release"][data-lot="${lotNo}"][data-res="ผ่าน"]`, 'U05', '#/qc?tab=queue');
    return { pass: !c.ok, actual: c.ok ? `ล็อต ${lotNo} ที่ผลจริงไม่ผ่าน ถูกปล่อยผ่านได้ หลังแก้ข้อมูลในเบราว์เซอร์ ไม่มีร่องรอยในประวัติ` : 'ถูกกัน' };
  }, lotNo);
});
def('X02', 'จงใจทำเสียหาย', 'ปลอมรายการ "ปล่อยผ่าน" ใส่ที่เก็บข้อมูลโดยตรง (ไม่ผ่านหน้าจอ)', 'ระบบไม่เชื่อรายการปลอม', async () => {
  await fresh('U01');
  const lotNo = await run(() => { const { S, submit } = window.qa2; const it = S.items.get('91004'); const r = submit('receive', { item: '91004', po: '', supplier: it.supplier_id, qty: '300', exp: '' }, 'U01'); return r.ev.effects.lots[0].lot_no; });
  const fake = { id: 'Efake1', at: '2026-11-06T03:00:00.000Z', user: 'U05', type: 'release', summary: `ปล่อยผ่าน เปลี่ยนป้ายเป็นตรวจสอบแล้ว ล็อต ${lotNo}`, effects: { status: [{ lot_no: lotNo, status: 'ตรวจสอบแล้ว', release_date: '2026-11-06' }], releases: [{ date: '2026-11-06', lot_no: lotNo, item_code: '91004', result: 'ผ่าน', checker_id: 'U04', approver_id: 'U05', note: '' }] } };
  await page.ev(`(() => { const k = 'hfd-events-v1'; const a = JSON.parse(localStorage.getItem(k)); a.push(${JSON.stringify(fake)}); localStorage.setItem(k, JSON.stringify(a)); return true; })()`);
  await reload('overview');
  return run((lotNo) => { const l = window.qa2.lot(lotNo); return { pass: l.status !== 'ตรวจสอบแล้ว', actual: l.status === 'ตรวจสอบแล้ว' ? `ล็อต ${lotNo} ไม่เคยตรวจ แต่ขึ้นสถานะตรวจสอบแล้ว เบิกใช้ได้ ประวัติแสดงว่าหัวหน้าฝ่ายควบคุมคุณภาพอนุมัติ` : `สถานะ ${l.status}` }; }, lotNo);
});
def('X03', 'จงใจทำเสียหาย', 'ทำที่เก็บข้อมูลเสีย (JSON พัง) แล้วมีคนบันทึกรายการถัดไป', 'ระบบหยุดและเตือน ไม่เขียนทับข้อมูลเก่า', async () => {
  await fresh('U01');
  await run(() => { const { S, submit } = window.qa2; const it = S.items.get('91004'); for (let i = 0; i < 5; i++) submit('receive', { item: '91004', po: '', supplier: it.supplier_id, qty: String(100 + i), exp: '' }, 'U01'); return true; });
  const before = await page.ev(`localStorage.getItem('hfd-events-v1').length`);
  await page.ev(`localStorage.setItem('hfd-events-v1', localStorage.getItem('hfd-events-v1').slice(0, -5)); true`);
  await reload('overview');
  const loaded = await page.ev('window.qa2.n()');
  const warn = await page.ev(`document.body.textContent.includes('เสีย') || document.body.textContent.includes('อ่านข้อมูลไม่ได้')`);
  await run(() => { const { S, submit } = window.qa2; const it = S.items.get('91004'); submit('receive', { item: '91004', po: '', supplier: it.supplier_id, qty: '999', exp: '' }, 'U01'); return true; });
  const after = await page.ev(`localStorage.getItem('hfd-events-v1').length`);
  const kept = after === before - 5;
  return { pass: (loaded > 0 || warn) && kept, actual: `ก่อนพัง ${before} ตัวอักษร 5 รายการ เปิดใหม่เห็น ${loaded} รายการ ${warn ? 'มีคำเตือน' : 'ไม่มีคำเตือน'} บันทึกรายการถัดไปแล้วที่เก็บ ${kept ? `ยังเป็นข้อมูลเดิม ${after} ตัวอักษร ไม่ถูกเขียนทับ` : `เหลือ ${after} ตัวอักษร (ข้อมูลเก่าถูกเขียนทับหายถาวร)`}` };
});
def('X04', 'จงใจทำเสียหาย', 'ใส่รายการรูปร่างแปลกลงที่เก็บข้อมูล (อ้างล็อตที่ไม่มี ตัวเลขเป็นข้อความ)', 'เว็บยังเปิดได้ และบอกว่ารายการไหนเสีย', async () => {
  await fresh('U01');
  await page.ev(`localStorage.setItem('hfd-events-v1', JSON.stringify([{ id: 'Ebad', at: new Date().toISOString(), user: 'U01', type: 'receive', summary: 'แปลก', effects: { moves: [{ item_code: 'ZZZ', lot_no: 'NOLOT', type: 'จ่าย', qty: 'สิบ', date: '2026-11-06' }], lots: [{ lot_no: 'L1', item_code: 'NOITEM', qty_in: 'x', status: 'ตรวจสอบแล้ว' }] } }])); true`);
  const ms = await page.open(srv.origin, 'store?tab=stock');
  const ok = ms >= 0 && await page.ev(`!!document.querySelector('#main .room-head')`);
  const errs = page.errors.splice(0);
  return { pass: ok && errs.length === 0, actual: ok ? `เปิดได้ ${errs.length ? 'แต่มีข้อผิดพลาด ' + errs[0].slice(0, 160) : 'ไม่มีข้อผิดพลาด'}` : `เปิดไม่ขึ้น ${errs[0] ? errs[0].slice(0, 200) : ''}` };
});
def('X05', 'จงใจทำเสียหาย', 'ฝังสคริปต์ในทุกช่องข้อความ (บันทึกถึงฝ่าย เหตุผล ผู้รับ หมายเหตุผลตรวจ วัตถุประสงค์ใบขอซื้อ) แล้วเปิดทุกหน้า', 'ไม่มีสคริปต์ทำงานเลย', async () => {
  await fresh('U01');
  const P = `<img src=x onerror="window.__xss=(window.__xss||0)+1">`;
  await run((P) => {
    const { S, submit, form, go } = window.qa2;
    const it = S.items.get('91004');
    const r = submit('receive', { item: '91004', po: '', supplier: it.supplier_id, qty: '300', exp: '' }, 'U01');
    const lotNo = r.ev.effects.lots[0].lot_no;
    submit('qcResult', { lot: lotNo, result: 'ไม่ผ่านเกณฑ์', note: P }, 'U04');
    window.qa2.as('U05'); go('#/qc?tab=queue');
    const rs = document.getElementById(`rs-${lotNo}`); if (rs) rs.value = P;
    document.querySelector(`[data-act="release"][data-lot="${lotNo}"][data-res="ไม่ผ่าน"]`)?.click();
    // รอบแก้ QA: ยาสำเร็จรูปต้องเลือกผู้รับจากทะเบียนลูกค้า จึงใช้วัตถุดิบ (ช่องผู้รับยังพิมพ์เองได้) เป็นที่ฝังสคริปต์แทน
    const fg = [...S.items.values()].find((i) => !(i.kind === 'ยารับประทาน' || i.kind === 'ยาใช้ภายนอก') && (S.lotsByItem.get(i.code) || []).some(window.qa2.data.usable));
    submit('issue', { item: fg.code, qty: '1', to: P }, 'U01');
    const b = [...S.items.values()].find((i) => i.make === 'buy' && S.base.suppliers.find((s) => s.supplier_id === i.supplier_id)?.approved === 'Y');
    submit('pr', { item: b.code, supplier: b.supplier_id, qty: '10', unit_cost: '5', purpose: P }, 'U01');
    window.qa2.as('U03'); go('#/notes');
    const f = document.createElement('form'); f.dataset.form = 'note';
    f.innerHTML = '<input name="subject"><textarea name="body"></textarea><input name="to_room" value="store"><input name="to_user" value=""><input name="ref">';
    f.querySelector('[name="subject"]').value = P; f.querySelector('[name="body"]').value = P; f.querySelector('[name="ref"]').value = P;
    document.getElementById('main').appendChild(f); f.requestSubmit();
    const ev = S.events.find((e) => e.type === 'issue');
    form(`#/log?del=${ev.id}`, 'form[data-form="void"]', { reason: P }, 'U01');
    return true;
  }, P);
  const pages = ['overview', 'store?tab=stock', 'store?tab=issue', 'store?tab=buy', 'qc?tab=queue', 'qc?tab=rejected', 'qc?tab=released', 'sales?tab=ar', 'sales?tab=sales', 'notes', 'notes?box=sent', 'log', 'log?show=changed', 'docs', 'registers', 'trace?lot=x'];
  const users = { overview: 'U00', notes: 'U01', 'notes?box=sent': 'U03' };
  for (const h of pages) { await run((h, u) => { window.qa2.as(u); window.qa2.go('#/' + h); return true; }, h, users[h] || 'U00'); await sleep(60); }
  const docs = await run(() => [...document.querySelectorAll('a[href^="#/doc"]')].slice(0, 12).map((a) => a.getAttribute('href')));
  for (const h of docs) { await run((h) => { window.qa2.go(h); return true; }, h); await sleep(40); }
  const fired = await page.ev('window.__xss || 0');
  return { pass: !fired, actual: fired ? `สคริปต์ทำงาน ${fired} ครั้ง` : `เปิด ${pages.length + docs.length} หน้า ไม่มีสคริปต์ทำงาน (ข้อความถูกแสดงเป็นตัวอักษร)` };
});
def('X06', 'จงใจทำเสียหาย', 'ฝังสคริปต์ในลิงก์ (ช่องค้นหาและเลขล็อตในที่อยู่เว็บ)', 'ไม่มีสคริปต์ทำงาน', async () => {
  await fresh('U00');
  const P = encodeURIComponent(`<img src=x onerror="window.__xss=(window.__xss||0)+1">`);
  const hashes = [`trace?lot=${P}`, `store?tab=stock&q=${P}`, `sales?tab=sales&q=${P}`, `notes?id=${P}`, `item?code=${P}`, `product?code=${P}`, `job?id=${P}`, `doc?type=${P}`, `doc?type=fm02&item=${P}`, `prod?tab=board&q=${P}`, `registers?tab=${P}`, `log?edit=${P}`];
  const crashes = [];
  for (const h of hashes) { const r = await run((h) => { try { window.qa2.go('#/' + h); return ''; } catch (e) { return String(e).split('\n')[0].slice(0, 100); } }, h); if (r) crashes.push(`${h.split('?')[0]}: ${r}`); await sleep(40); }
  const fired = await page.ev('window.__xss || 0');
  page.errors.splice(0);
  return { pass: !fired, actual: `${fired ? `สคริปต์ทำงาน ${fired} ครั้ง` : `ลอง ${hashes.length} ลิงก์ ไม่มีสคริปต์ทำงาน`}${crashes.length ? ` (หน้าพัง ${crashes.length} ลิงก์ ดู F04)` : ''}` };
});
def('X07', 'จงใจทำเสียหาย', 'ใส่สูตร Excel ในเหตุผล (=HYPERLINK) แล้วส่งออกประวัติเป็น CSV', 'ไฟล์ส่งออกกันสูตร (ขึ้นต้นด้วย = + - @ ต้องใส่เครื่องหมายกัน)', async () => {
  await fresh('U01');
  const csv = await run(() => {
    const { S, submit, form, data } = window.qa2;
    const it = S.items.get('91004');
    const r = submit('receive', { item: '91004', po: '', supplier: it.supplier_id, qty: '300', exp: '' }, 'U01');
    form(`#/log?del=${r.ev.id}`, 'form[data-form="void"]', { reason: '=HYPERLINK("http://example.invalid","กดดูหลักฐาน")' }, 'U01');
    return data.toCSV(S.events, ['at', 'user', 'type', 'summary', 'reason', 'target']);
  });
  const bad = csv.split('\n').some((line) => line.split(',').some((c) => /^"?[=+\-@]/.test(c)));
  return { pass: !bad, actual: bad ? 'ไฟล์ CSV มีช่องที่ขึ้นต้นด้วย = เปิดใน Excel แล้วกลายเป็นสูตร' : 'กันไว้แล้ว' };
});
def('X08', 'จงใจทำเสียหาย', 'ที่เก็บข้อมูลในเบราว์เซอร์ใกล้เต็ม แล้วบันทึกรายการใหม่', 'เตือนผู้ใช้ทันทีว่าบันทึกไม่ได้ ข้อมูลไม่หายเงียบ', async () => {
  await fresh('U01');
  const fill = await page.ev(`(() => { let s = 'x'.repeat(1024 * 256); let n = 0; try { for (n = 0; n < 200; n++) localStorage.setItem('qa-fill-' + n, s); } catch (e) {} let r = 'x'.repeat(4096); let m = 0; try { for (m = 0; m < 5000; m++) localStorage.setItem('qa-fill-s' + m, r); } catch (e) {} let t = 'x'.repeat(128); let a = 0; try { for (a = 0; a < 100000; a++) localStorage.setItem('qa-fill-t' + a, t); } catch (e) {} let b = 0; try { for (b = 0; b < 100000; b++) localStorage.setItem('qa-fill-u' + b, 'x'); } catch (e) {} return n * 256 + m * 4; })()`);
  const res = await run(() => { const { S, submit, toasts } = window.qa2; const it = S.items.get('91004'); const t0 = toasts.length; const r = submit('receive', { item: '91004', po: '', supplier: it.supplier_id, qty: '321', exp: '' }, 'U01'); return { ok: r.ok, inMem: S.events.length, toast: toasts.slice(t0).join(' | ') }; });
  await reload('overview');
  const after = await page.ev('window.qa2.n()');
  await page.ev(`(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('qa-fill')) localStorage.removeItem(k); return true; })()`);
  return { pass: after === res.inMem || /บันทึกไม่ได้|เต็ม/.test(res.toast), actual: `ถมที่เก็บ ${fill} KB แล้วบันทึก หน้าจอขึ้น "${res.toast.slice(0, 120)}" (เห็นว่าบันทึกแล้ว ${res.inMem} รายการ) เปิดใหม่เหลือ ${after} รายการ` };
});
def('X09', 'จงใจทำเสียหาย', 'เปิดเว็บ 2 แท็บ แท็บแรกรับของ แท็บสองส่งบันทึก', 'รายการจากทั้งสองแท็บอยู่ครบ', async () => {
  await fresh('U01');
  const p2 = await br.newPage();
  await p2.open(srv.origin, 'overview');
  await p2.ev(PAGE_HELPERS); await p2.ev(H);
  await run(() => { const { S, submit } = window.qa2; const it = S.items.get('91004'); submit('receive', { item: '91004', po: '', supplier: it.supplier_id, qty: '555', exp: '' }, 'U01'); return true; });
  await p2.ev(`(() => { const { go, S } = window.qa2; window.qa2.as('U03'); go('#/notes'); const f = document.createElement('form'); f.dataset.form = 'note'; f.innerHTML = '<input name="subject" value="จากแท็บสอง"><textarea name="body">ทดสอบ</textarea><input name="to_room" value="store"><input name="to_user" value=""><input name="ref" value="">'; document.getElementById('main').appendChild(f); f.requestSubmit(); return S.events.length; })()`);
  await reload('overview');
  const types = await page.ev(`window.qa2.S.events.map((e) => e.type).join(',')`);
  p2.close();
  return { pass: types.includes('receive') && types.includes('note'), actual: `เปิดใหม่เหลือรายการ: ${types || 'ไม่มี'} ${types.includes('receive') ? '' : '(รายการรับของจากแท็บแรกหายเพราะแท็บสองเขียนทับ)'}` };
});
def('X10', 'จงใจทำเสียหาย', 'ส่งบันทึกถึงฝ่ายสองครั้งในเสี้ยววินาทีเดียวกัน', 'เลขบันทึกไม่ซ้ำ', async () => {
  await fresh('U03');
  return run(() => {
    const { S, go } = window.qa2;
    go('#/notes');
    const mk = () => { const f = document.createElement('form'); f.dataset.form = 'note'; f.innerHTML = '<input name="subject" value="ซ้ำ"><textarea name="body">ทดสอบ</textarea><input name="to_room" value="store"><input name="to_user" value=""><input name="ref" value="">'; document.getElementById('main').appendChild(f); return f; };
    const a = mk(), b = mk();
    a.requestSubmit(); b.requestSubmit();
    const ids = S.notes.map((n) => n.id);
    return { pass: new Set(ids).size === ids.length, actual: `เลขบันทึก ${ids.join(', ')}` };
  });
});
def('X12', 'จงใจทำเสียหาย', 'พยายามลบประวัติการลบ และแก้รายการปล่อยผ่าน', 'ทำไม่ได้ ประวัติคงอยู่', async () => {
  await fresh('U01');
  return run(() => {
    const { S, submit, form, click, go } = window.qa2;
    const it = S.items.get('91004');
    const r = submit('receive', { item: '91004', po: '', supplier: it.supplier_id, qty: '300', exp: '' }, 'U01');
    form(`#/log?del=${r.ev.id}`, 'form[data-form="void"]', { reason: 'ทดสอบ' }, 'U01');
    const v = S.events.find((e) => e.type === 'void');
    const f1 = form(`#/log?del=${v.id}`, 'form[data-form="void"]', { reason: 'ลบรายการลบ' }, 'U00');
    const r2 = submit('receive', { item: '91004', po: '', supplier: it.supplier_id, qty: '300', exp: '' }, 'U01');
    const lotNo = r2.ev.effects.lots[0].lot_no;
    submit('qcResult', { lot: lotNo, result: 'ผ่านเกณฑ์', note: '' }, 'U04');
    click(`[data-act="release"][data-lot="${lotNo}"][data-res="ผ่าน"]`, 'U05', '#/qc?tab=queue');
    const rel = S.events.find((e) => e.type === 'release');
    const f2 = form(`#/log?del=${rel.id}`, 'form[data-form="void"]', { reason: 'ลบการอนุมัติ' }, 'U05');
    return { pass: !f1.ok && !f2.ok, actual: `ลบรายการลบ: ${f1.ok ? 'ทำได้' : 'ทำไม่ได้'} | ลบการปล่อยผ่าน: ${f2.ok ? 'ทำได้' : 'ทำไม่ได้'}` };
  });
});
def('X13', 'จงใจทำเสียหาย', 'ลบรายการรับเข้า แล้วรับใหม่ เลขรับเดิมถูกใช้ซ้ำไหม', 'เลขที่ถูกยกเลิกแล้วไม่ถูกนำมาใช้ซ้ำ', async () => {
  await fresh('U01');
  return run(() => {
    const { S, submit, form } = window.qa2;
    const it = S.items.get('91004');
    const a = submit('receive', { item: '91004', po: '', supplier: it.supplier_id, qty: '300', exp: '' }, 'U01');
    const lotA = a.ev.effects.lots[0].lot_no;
    form(`#/log?del=${a.ev.id}`, 'form[data-form="void"]', { reason: 'บันทึกผิด' }, 'U01');
    const b = submit('receive', { item: '91004', po: '', supplier: it.supplier_id, qty: '310', exp: '' }, 'U01');
    const lotB = b.ev.effects.lots[0].lot_no;
    return { pass: lotA !== lotB, actual: `เลขรับที่ถูกลบ ${lotA} เลขรับใหม่ ${lotB}${lotA === lotB ? ' (เลขซ้ำ ถ้าพิมพ์ป้ายเลขเดิมไปแล้วจะสับสน)' : ''}` };
  });
});

// ================= ทำงานไม่ครบขั้น หรือหน้าเว็บพัง =================
def('F01', 'ทำงานไม่ครบขั้น', 'เดินใบขอซื้อจนของมาถึง แล้วให้หัวหน้าฝ่ายผลิตตรวจรับพัสดุ', 'หัวหน้าฝ่ายผลิตหาปุ่มตรวจรับพัสดุเจอและกดได้', async () => {
  await fresh('U01');
  return run(() => {
    const { S, submit, click, go, data } = window.qa2;
    const it = [...S.items.values()].find((i) => i.make === 'buy' && S.base.suppliers.find((s) => s.supplier_id === i.supplier_id)?.approved === 'Y');
    const r = submit('pr', { item: it.code, supplier: it.supplier_id, qty: '100', unit_cost: '10', purpose: 'ทดสอบ' }, 'U01');
    const pr = r.ev.effects.newPr[0].pr_no;
    const h = `#/store?tab=buy&pr=${encodeURIComponent(pr)}`;
    click(`[data-act="prStep"][data-pr="${pr}"][data-step="head_ok"]`, 'U00', h);
    click(`[data-act="prStep"][data-pr="${pr}"][data-step="dir_ok"]`, 'U08', h);
    click(`[data-act="prStep"][data-pr="${pr}"][data-step="ordered"]`, 'U01', h);
    const po = S.prs.find((x) => x.pr_no === pr).po_no;
    submit('receive', { item: it.code, po, supplier: it.supplier_id, qty: '100', exp: '' }, 'U01');
    const st = data.prStage(S.prs.find((x) => x.pr_no === pr)).title;
    window.qa2.as('U03');
    const places = [];
    for (const hh of ['#/overview', '#/prod', '#/prod?tab=board', '#/prod?tab=inspect', h, '#/store?tab=buy', '#/notes', '#/registers', '#/docs']) { go(hh); if (document.querySelector(`[data-act="prStep"][data-pr="${pr}"][data-step="inspected"]`)) places.push(hh); }
    go(h);
    const locked = !!document.querySelector('#main .locked');
    let done = '';
    if (places.length) { const c = click(`[data-act="prStep"][data-pr="${pr}"][data-step="inspected"]`, 'U03', places[places.length - 1]); done = c.ok ? ` กดตรวจรับได้ ใบไปขั้น "${data.prStage(S.prs.find((x) => x.pr_no === pr)).title}"` : ` กดแล้วไม่สำเร็จ ${c.toast}`; }
    return { pass: places.length > 0 && done.includes('กดตรวจรับได้'), actual: `ใบ ${pr} อยู่ขั้น "${st}" หัวหน้าฝ่ายผลิตเจอปุ่มตรวจรับใน ${places.length ? places.join(', ') : `ไม่มีหน้าไหนเลย${locked ? ' (ห้องฝ่ายจัดซื้อและคลังล็อกสำหรับหัวหน้าฝ่ายผลิต)' : ''}`}${done}` };
  });
});
def('F02', 'ใช้ยาก', 'รับชำระใบส่งของที่ยังไม่ถึงกำหนด', 'หาปุ่มรับชำระเจอจากหน้าลูกหนี้หลัก', async () => {
  await fresh('U01');
  return run(() => {
    const { S, submit, go, data } = window.qa2;
    const fg = [...S.items.values()].find((i) => i.kind === 'ยารับประทาน' && (S.lotsByItem.get(i.code) || []).some(data.usable));
    const cust = S.base.customers[0];
    const r = submit('issue', { item: fg.code, qty: '3', to: cust.name }, 'U01');
    const inv = r.ev.effects.invoices?.[0]?.inv_no;
    window.qa2.as('U07');
    go('#/sales?tab=ar'); const main = !!document.querySelector(`[data-act="pay"][data-inv="${inv}"]`);
    // รอบแก้ QA: หน้าลูกหนี้หลักมีช่องค้นเลขใบส่งของ และตัวกรองค้างชำระทั้งหมด ลองพิมพ์เลขใบในช่องค้นแบบคน
    const f = document.querySelector('form[data-form="arSearch"]');
    const allChip = !!document.querySelector('a.fchip[href*="all=1"]');
    if (f) { f.querySelector('[name="inv"]').value = inv; f.requestSubmit(); }
    return new Promise((ok) => setTimeout(() => {
      const found = !!document.querySelector(`[data-act="pay"][data-inv="${inv}"]`);
      ok({ pass: main || (found && allChip), actual: `ใบ ${inv} (ยังไม่ถึงกำหนด) หน้าลูกหนี้หลัก${main ? 'เห็นปุ่ม' : 'ไม่เห็นปุ่มในรายการเกินกำหนด'} ${f ? `มีช่องค้นเลขใบส่งของ พิมพ์เลขใบแล้ว${found ? 'เห็นปุ่มรับชำระทันที' : 'ยังไม่เห็นปุ่ม'}` : 'ไม่มีช่องค้น'} ${allChip ? 'มีตัวกรองค้างชำระทั้งหมด' : 'ไม่มีตัวกรองดูทั้งหมด'}` });
    }, 120));
  });
});
def('F03', 'ทำงานไม่ครบขั้น', 'งานผลิตเสร็จ ได้ของจริงน้อยกว่าที่สั่งผลิต', 'กรอกจำนวนที่ได้จริงได้ ระบบคิดร้อยละผลผลิตให้ (ตรงกับ FM-35)', async () => {
  await fresh('U03');
  return run(() => {
    const { S, data, go } = window.qa2;
    let c = data.D.board.find((x) => x.job.lane === 'ผลิต' && x.stage === 'บรรจุ');
    if (!c) {
      const p = data.D.board.find((x) => x.job.lane === 'ผลิต' && x.stage === 'ผลิต' && x.job.status === 'running');
      if (!p) return { pass: true, actual: 'ไม่พบงานขั้นผลิตหรือบรรจุ', skip: true };
      go('#/job?id=' + encodeURIComponent(p.job.job_id));
      document.querySelector(`[data-act="move"][data-job="${p.job.job_id}"][data-dir="1"]`)?.click();
      c = data.D.board.find((x) => x.job.job_id === p.job.job_id);
    }
    go('#/job?id=' + encodeURIComponent(c.job.job_id));
    const b = document.querySelector(`[data-act="move"][data-job="${c.job.job_id}"][data-dir="1"]`);
    const n0 = S.events.length; if (b) b.click();
    // รอบแก้ QA: กดย้ายเข้ารอปล่อยผ่านแล้วต้องมีช่องจำนวนที่ได้จริง ลองกรอกได้น้อยกว่าสั่ง 20% (ต่ำกว่าเกณฑ์) โดยไม่ใส่เหตุผลก่อน
    const d = document.querySelector('dialog.dlg[open]');
    const fields = d ? [...d.querySelectorAll('input, select, textarea')].map((x) => x.name || x.id).filter(Boolean) : [];
    const actual = Math.round(c.job.qty * 0.8);
    window.qa2.okDialog({ actual: String(actual) });
    const needReason = S.events.length === n0 && !!document.querySelector('dialog.dlg[open] .dlg-err:not([hidden])');
    const msg = document.querySelector('dialog.dlg[open] .dlg-err')?.textContent || '';
    window.qa2.okDialog({ actual: String(actual), note: 'ผงติดเครื่องบด (บอท QA)' });
    const ev = S.events.slice(n0)[0];
    const lot = (ev?.effects?.lots || [])[0];
    const j = S.jobs.find((x) => x.job_id === c.job.job_id);
    return { pass: fields.includes('actual') && needReason && lot?.qty_in === actual && j.yield_pct === 80, actual: `ย้าย ${c.job.job_id} เข้ารอปล่อยผ่าน ${d ? 'มีกล่องกรอกจำนวนที่ได้จริง' : 'ไม่มีกล่องกรอก'} กรอก ${actual} จาก ${c.job.qty} ${needReason ? `ระบบให้ใส่เหตุผลก่อน (${msg.slice(0, 50)})` : 'ไม่ถามเหตุผล'} ออกล็อต ${lot?.lot_no || '-'} จำนวน ${lot?.qty_in} ร้อยละผลผลิต ${j?.yield_pct}` };
  });
});
def('F04', 'หน้าเว็บพัง', 'เปิดลิงก์ที่ชื่อแท็บหรือรหัสผิด (เช่น พิมพ์ลิงก์เอง หรือลิงก์เก่า)', 'ขึ้นหน้าปกติหรือบอกว่าไม่พบ ไม่พังทั้งหน้า', async () => {
  await fresh('U00');
  const out = [];
  for (const h of ['registers?tab=xyz', 'store?tab=xyz', 'qc?tab=xyz', 'sales?tab=xyz', 'prod?tab=xyz', 'process?tab=xyz', 'docs?tab=xyz', 'doc?type=xyz', 'notes?box=xyz', 'notes?id=xyz', 'log?edit=xyz', 'log?del=xyz', 'item?code=0000', 'product?code=0000', 'job?id=xyz', 'trace?lot=xyz']) {
    const r = await run((h) => { try { window.qa2.go('#/' + h); return (document.querySelector('#main h1')?.textContent || '(ไม่มีหัวข้อ)').slice(0, 40); } catch (e) { return 'พัง: ' + String(e).split('\n')[0].slice(0, 90); } }, h);
    out.push(`${h} = ${r}`);
  }
  page.errors.splice(0);
  const bad = out.filter((x) => x.includes('พัง'));
  return { pass: !bad.length, actual: bad.length ? `พัง ${bad.length} จาก ${out.length} ลิงก์: ${bad.join(' | ')}` : `ทุกลิงก์เปิดได้ ${out.length} ลิงก์` };
});
def('F05', 'ทำงานไม่ครบขั้น', 'เปิดงานผลิตในเว็บ ทั้งที่วัตถุดิบตามสูตรไม่พอ (เพิ่มรอบแก้ QA ตรวจ QA-032)', 'งานขึ้นป้ายหยุดรอของบนบอร์ด และมีแจ้งเตือนในห้องฝ่ายผลิต', async () => {
  await fresh('U03');
  return run(() => {
    const { S, data, submit } = window.qa2;
    const it = [...S.items.values()].find((i) => i.make === 'make' && i.lane === 'ผลิต' && (i.status || 'ผลิตอยู่') === 'ผลิตอยู่' && data.bomOf(i.code).length && data.bomNeeds(i.code, (i.batch_or_pack || 100) * 40).some((n) => !n.ok));
    if (!it) return { pass: true, actual: 'ไม่พบยาที่วัตถุดิบไม่พอ ทดสอบไม่ได้', skip: true };
    const q = (it.batch_or_pack || 100) * 40;
    const r = submit('job', { room: 'prod', item: it.code, qty: String(q) }, 'U03');
    const id = r.ev?.effects?.newJobs?.[0]?.job_id;
    const card = data.D.board.find((c) => c.job.job_id === id);
    const al = data.roomAlerts('prod').find((a) => a.job === id);
    return { pass: !!card?.blocked && !!al, actual: `เปิดงาน ${id} ${it.name} ${q} ${r.ok ? '' : 'ไม่สำเร็จ ' + r.toast} บอร์ด${card?.blocked ? `ขึ้นหยุดรอ${card.blocked}` : 'ไม่ขึ้นหยุดรอ'} ห้องฝ่ายผลิต${al ? `มีแจ้งเตือน "${al.title}"` : 'ไม่มีแจ้งเตือน'}` };
  });
});
def('K10', 'เข้าใจผิด', 'แก้จำนวนรับเข้าเป็นจำนวนผิดปกติ (เติมศูนย์เกิน) ในหน้าประวัติ (เพิ่มหลังรอบแก้ QA)', 'ถามยืนยันก่อน และล็อตเดิมไม่หายจากคลัง', async () => {
  await fresh('U01');
  return run(() => {
    const { S, submit, form } = window.qa2;
    const it = S.items.get('91004');
    const r = submit('receive', { item: '91004', po: '', supplier: it.supplier_id, qty: '3000', exp: '' }, 'U01');
    const lotNo = r.ev.effects.lots[0].lot_no;
    const n0 = S.events.length;
    const f = form(`#/log?edit=${r.ev.id}`, 'form[data-form="amend"]', { qty: '30000', reason: 'ชั่งซ้ำ' }, 'U01');
    const asked = !!document.querySelector('dialog.dlg[open]');
    const lotAfterAsk = window.qa2.lot(lotNo)?.qty_in;
    window.qa2.okDialog();
    const lotAfterOk = window.qa2.lot(lotNo)?.qty_in;
    return { pass: asked && S.events.length === n0 + 1 && lotAfterAsk === 3000 && lotAfterOk === 30000, actual: `แก้ 3,000 เป็น 30,000: ${asked ? 'ถามยืนยันก่อน' : 'ไม่ถาม'} ระหว่างถามล็อต ${lotNo} ยังเป็น ${lotAfterAsk} ยืนยันแล้วเป็น ${lotAfterOk} เกิดรายการ ${S.events.length - n0}` };
  });
});
def('K11', 'เข้าใจผิด', 'แก้จำนวนของการรับครั้งแรก หลังผู้ขายส่งส่วนที่เหลือจนใบสั่งซื้อปิดแล้ว (เพิ่มหลังรอบแก้ QA)', 'แก้ได้ ใบสั่งซื้อยังปิดอยู่', async () => {
  await fresh('U01');
  return run(() => {
    const { S, submit, form } = window.qa2;
    const po = S.pos.find((p) => !p.received_date && p.lot_no !== 'ก่อนเริ่มระบบ');
    if (!po) return { pass: true, actual: 'ไม่มีใบสั่งซื้อค้าง', skip: true };
    const half = Math.round(po.qty / 2);
    const a = submit('receive', { item: po.item_code, po: po.po_no, supplier: po.supplier_id, qty: String(half), exp: '' }, 'U01');
    submit('receive', { item: po.item_code, po: po.po_no, supplier: po.supplier_id, qty: String(po.qty - half), exp: '' }, 'U01');
    const closed1 = !!S.pos.find((p) => p.po_no === po.po_no).received_date;
    const n0 = S.events.length;
    const f = form(`#/log?edit=${a.ev.id}`, 'form[data-form="amend"]', { qty: String(half - 10), reason: 'นับซ้ำ' }, 'U01');
    const closed2 = !!S.pos.find((p) => p.po_no === po.po_no).received_date;
    return { pass: closed1 && S.events.length === n0 + 1 && closed2, actual: `รับ ${half} แล้วรับส่วนที่เหลือ ใบสั่งซื้อ${closed1 ? 'ปิด' : 'ยังเปิด'} แก้ครั้งแรกเป็น ${half - 10}: ${S.events.length > n0 ? 'แก้ได้' : `แก้ไม่ได้ ${f.toast}`} ใบสั่งซื้อ${closed2 ? 'ยังปิดอยู่' : 'กลับมาเปิด'}` };
  });
});
// ไว้ท้ายสุด เพราะอาจทำให้หน้าเว็บค้าง
def('X11', 'จงใจทำเสียหาย', 'วางข้อความยาวมากในบันทึกถึงฝ่าย (ข้อความไทย 5,000 และ 30,000 ตัวอักษร และแบบไม่มีวรรค 100,000 ตัวอักษร)', 'จำกัดความยาว และหน้าเว็บไม่ค้าง', async () => {
  await fresh('U03');
  const one = (body) => run((body) => {
    const { S, go } = window.qa2;
    window.qa2.as('U03'); go('#/notes');
    const f = document.createElement('form'); f.dataset.form = 'note';
    f.innerHTML = '<input name="subject" value="ข้อความยาว"><textarea name="body"></textarea><input name="to_room" value="store"><input name="to_user" value=""><input name="ref" value="">';
    f.querySelector('textarea').value = body; document.getElementById('main').appendChild(f);
    const n0 = S.notes.length; f.requestSubmit();
    const id = S.notes[S.notes.length - 1]?.id;
    const t = performance.now();
    window.qa2.as('U01'); go('#/notes?id=' + encodeURIComponent(id)); void document.body.offsetHeight;
    return { saved: S.notes.length > n0, ms: Math.round(performance.now() - t) };
  }, body);
  const unit = 'ขมิ้นชันแห้งรับเข้าคลังวันนี้ตรวจรับแล้วรอผลวิเคราะห์ ';
  const a = await one(unit.repeat(Math.ceil(5000 / unit.length)).slice(0, 5000));
  const b = await one(unit.repeat(Math.ceil(30000 / unit.length)).slice(0, 30000));
  const c = await Promise.race([one('ก'.repeat(100000)), sleep(45000).then(() => ({ timeout: true }))]);
  // รอบแก้ QA: เดิมกรณีนี้ตั้งเป็นหลุดไว้เลย (ไม่มีเพดาน) ตอนนี้วัดจริง ผ่านเมื่อข้อความยาวผิดปกติไม่ถูกบันทึกและหน้าเว็บไม่ค้าง
  const msg = await page.ev(`[...document.querySelectorAll('#toast .toast')].map((x) => x.textContent).filter((t) => t.includes('ยาว')).slice(-1)[0] || ''`);
  return { pass: a.saved && !b.saved && !c.saved && !c.timeout, actual: `5,000 ตัวอักษร ${a.saved ? 'รับไว้' : 'ไม่รับ'} เปิดอ่าน ${a.ms} มิลลิวินาที | 30,000 ตัวอักษร ${b.saved ? 'รับไว้' : 'ไม่รับ'} | 100,000 ตัวอักษรไม่มีวรรค ${c.timeout ? 'หน้าเว็บค้างเกิน 45 วินาที' : c.saved ? `รับไว้ เปิดอ่าน ${c.ms} มิลลิวินาที` : 'ไม่รับ หน้าเว็บไม่ค้าง'}${msg ? ` ข้อความ: ${msg.slice(0, 90)}` : ''}` };
});

// ---------- รัน ----------
const t0 = Date.now();
for (const c of CASES) {
  if (ONLY && !ONLY.split(',').includes(c.id)) continue;
  let r;
  try { r = await c.fn(); } catch (e) { r = { pass: false, actual: `บอทพังระหว่างทดสอบ: ${String(e.message || e).slice(0, 300)}`, botError: true }; }
  const rec = { id: c.id, group: c.group, title: c.title, expect: c.expect, ...r, pageErrors: page.errors.splice(0).slice(0, 3), dialogs: page.dialogs.splice(0).map((d) => `${d.type}: ${d.message}`).slice(0, 3) };
  results.push(rec);
  process.stdout.write(`${rec.pass ? 'ผ่าน' : 'หลุด'} ${c.id} ${c.title}\n   ${rec.actual}\n`);
}
writeFileSync(join(OUT, 'attack-results.json'), JSON.stringify({ at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), results }, null, 2));
br.close();
srv.close();
process.exit(0);
