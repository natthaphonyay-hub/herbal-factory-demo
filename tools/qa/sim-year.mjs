// บอทจำลองโรงงาน 1 ปี (ทีม QA): 9 บทบาททำงานประจำวันผ่านหน้าเว็บจริง (กดปุ่มและส่งฟอร์มแบบเดียวกับคน)
// ทุกสิ้นวันตรวจกฎที่ต้องจริงเสมอ วัดความเร็ว และวัดขนาดข้อมูลที่เก็บในเบราว์เซอร์ ทุก 30 วันปิดเปิดหน้าใหม่ ดูว่าข้อมูลยังอยู่ครบไหม
// วิธีรัน: node tools/qa/sim-year.mjs --days 365 --seed 1 --out <โฟลเดอร์ผล>
import { writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, launch, PAGE_HELPERS, sleep } from './lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const DAYS = Number(arg('days', 365));
const SEED = Number(arg('seed', 1));
const OUT = arg('out', join(process.cwd(), 'qa-out'));
const START = arg('start', '2026-11-06');
const RELOAD_EVERY = Number(arg('reload', 30));
const SCALE = Number(arg('scale', 1));
mkdirSync(OUT, { recursive: true });
const TAG = SCALE === 1 ? `seed${SEED}` : `scale${SCALE}-seed${SEED}`;
const LOG = join(OUT, `sim-${TAG}.jsonl`);
writeFileSync(LOG, '');
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// ---------- โค้ดที่รันในหน้าเว็บ (ห้ามอ้างตัวแปรฝั่ง Node) ----------
function driver() {
  const { data, ui, toasts, sleep } = window.qa;
  const { S, D } = data;
  const KEY = 'hfd-events-v1';
  let seed = 1;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pickOne = (a) => a[Math.floor(rnd() * a.length)];
  const as = (u) => { if (S.user !== u) data.setUser(u); };
  const go = (hash) => { history.replaceState(null, '', hash); ui.nav.route(); };
  let M;
  const reset = () => { M = { commitMs: [], acts: {}, fails: [], waits: {} }; };
  reset();
  const tally = (k, ok, extra) => {
    M.acts[k] = M.acts[k] || { ok: 0, fail: 0 };
    M.acts[k][ok ? 'ok' : 'fail'] += 1;
    if (!ok && M.fails.length < 60) M.fails.push({ k, ...extra });
  };
  const wait = (k) => { M.waits[k] = (M.waits[k] || 0) + 1; };
  function submit(k, type, inp, user) {
    as(user);
    const n0 = S.events.length, t0 = toasts.length, t = performance.now();
    // รอบแก้ QA: ค่าผิดปกติ (เช่น จำนวนมากกว่าปกติ) เว็บถามยืนยันก่อน บอทตรวจแล้วกดยืนยัน นับแยกไว้
    try { ui.actions.submitNew(type, inp); if (document.querySelector('dialog.dlg[open]')) { wait(`${k} ถูกถามยืนยัน`); confirmDialog(k, (d) => { const fld = d.querySelector('input[name]:not([type=hidden])'); if (fld && !fld.value) fld.value = 'ตรวจแล้ว (บอทจำลอง)'; }); } } catch (e) { tally(k, false, { err: String(e).slice(0, 200), inp }); return false; }
    const ok = S.events.length > n0;
    if (ok) M.commitMs.push(performance.now() - t);
    tally(k, ok, ok ? undefined : { toast: toasts.slice(t0).join(' | ').slice(0, 220), inp });
    return ok;
  }
  // กล่องยืนยันของเว็บ (เพิ่มรอบแก้ QA 2026-11-06): กรอกช่องในกล่องตามที่คนจะกรอก แล้วกดยืนยัน
  function confirmDialog(k, fill) {
    const d = document.querySelector('dialog.dlg[open]');
    if (!d) return;
    if (fill) fill(d);
    d.querySelector('[data-dlg="ok"]').click();
    const still = document.querySelector('dialog.dlg[open]');
    if (still) { tally(`${k} (กล่องยืนยันไม่ผ่าน)`, false, { why: (still.querySelector('.dlg-err')?.textContent || '').slice(0, 160) }); still.querySelector('[data-dlg="cancel"]')?.click(); }
  }
  function click(k, hash, sel, user, before, fill) {
    as(user);
    go(hash);
    const b = document.querySelector(sel);
    if (!b) { tally(k, false, { why: 'ไม่พบปุ่ม', hash, sel, at: location.hash, h1: (document.querySelector('#main h1')?.textContent || '').slice(0, 80), locked: !!document.querySelector('#main .locked'), user: S.user, near: (document.querySelector('#main')?.textContent || '').replace(/\s+/g, ' ').slice(0, 160) }); return false; }
    if (b.disabled) { tally(k, false, { why: 'ปุ่มกดไม่ได้', hash, sel }); return false; }
    if (before) before();
    const n0 = S.events.length, t0 = toasts.length, t = performance.now();
    try { b.click(); confirmDialog(k, fill); } catch (e) { tally(k, false, { err: String(e).slice(0, 200), hash }); return false; }
    const ok = S.events.length > n0;
    if (ok) M.commitMs.push(performance.now() - t);
    tally(k, ok, ok ? undefined : { toast: toasts.slice(t0).join(' | ').slice(0, 220), hash, sel });
    return ok;
  }
  function formSubmit(k, hash, formSel, fill, user) {
    as(user);
    go(hash);
    const f = document.querySelector(formSel);
    if (!f) { tally(k, false, { why: 'ไม่พบฟอร์ม', hash }); return false; }
    fill(f);
    const n0 = S.events.length, t0 = toasts.length, t = performance.now();
    try { f.requestSubmit(); } catch (e) { tally(k, false, { err: String(e).slice(0, 200), hash }); return false; }
    const ok = S.events.length > n0;
    if (ok) M.commitMs.push(performance.now() - t);
    tally(k, ok, ok ? undefined : { toast: toasts.slice(t0).join(' | ').slice(0, 220), hash });
    return ok;
  }
  const setVal = (f, name, v) => { const el = f.querySelector(`[name="${name}"]`); if (el) { el.value = v; return true; } return false; };
  const intUnit = (code) => data.isIntUnit(S.items.get(code)?.unit);
  const qtyStr = (code, q) => String(intUnit(code) ? Math.max(1, Math.round(q)) : Math.round(q * 100) / 100);

  window.qa.day = (iso, dayIdx, opt) => {
    seed = (opt.seed * 100003 + dayIdx) >>> 0;
    const K = opt.scale || 1;
    reset();
    const out = { day: iso, idx: dayIdx };
    // ---------- เปลี่ยนวัน แล้วคำนวณใหม่ ----------
    S.today = iso;
    window.__qaSetNow(Date.parse(`${iso}T09:00:00+07:00`));
    let t = performance.now();
    data.withoutEvent('__qa_none__', () => 0);
    out.rebuildMs = Math.round((performance.now() - t) / 2);
    const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
    const workday = dow !== 0 && dow !== 6;
    out.workday = workday;
    if (workday) {
      // 1 คลังรับของตามใบสั่งซื้อที่ถึงกำหนด
      for (const po of S.pos.filter((p) => !p.received_date && p.lot_no !== 'ก่อนเริ่มระบบ' && p.order_date < iso)) {
        const sl = data.supplierLead(po.supplier_id, po.item_code);
        const lead = Math.max(1, Math.round(sl.L + (rnd() - 0.5) * 2 * (sl.sL || 1)));
        // รอบแก้ QA: นับของจริง ราว 1 ใน 10 ครั้งผู้ขายส่งครึ่งเดียวก่อน ใบสั่งซื้อค้างยอดที่เหลือ
        const left = data.poLeft(po);
        const part = !po.received_qty && rnd() < 0.1;
        if (data.daysBetween(po.order_date, iso) >= lead) submit(part ? 'รับของบางส่วน' : 'รับของตามใบสั่งซื้อ', 'receive', { item: po.item_code, po: po.po_no, supplier: po.supplier_id, qty: qtyStr(po.item_code, part ? left / 2 : left), exp: '' }, 'U01');
      }
      // 2 ฝ่ายควบคุมคุณภาพบันทึกผลตรวจ (ของสดตรวจวันเดียวกัน ของอื่นวันถัดไป)
      for (const q of D.qcQueue.filter((x) => !x.result && (x.it?.kind === 'สด' ? x.waiting >= 0 : x.waiting >= 1)).slice(0, 12 * K)) {
        const pass = rnd() > 0.04;
        submit('บันทึกผลตรวจ', 'qcResult', { lot: q.lot.lot_no, result: pass ? 'ผ่านเกณฑ์' : 'ไม่ผ่านเกณฑ์', note: pass ? '' : 'ความชื้นเกินเกณฑ์ (บอทจำลอง)' }, 'U04');
      }
      // 3 หัวหน้าฝ่ายควบคุมคุณภาพอนุมัติปล่อยผ่านหรือไม่ผ่าน
      for (const q of D.qcQueue.filter((x) => x.result).slice(0, 12 * K)) {
        const lot = q.lot.lot_no;
        const res = q.result.result === 'ผ่านเกณฑ์' ? 'ผ่าน' : 'ไม่ผ่าน';
        click(res === 'ผ่าน' ? 'ปล่อยผ่าน' : 'ไม่ผ่าน', '#/qc?tab=queue', `[data-act="release"][data-lot="${lot}"][data-res="${res}"]`, 'U05', () => { const r = document.getElementById(`rs-${lot}`); if (r && res === 'ไม่ผ่าน') r.value = 'ผลตรวจไม่ผ่านเกณฑ์ (บอทจำลอง)'; });
      }
      // 4 เปิดงานผลิตและแปรรูปเมื่อของถึงจุดสั่ง (วันละไม่เกิน 3 งาน)
      let opened = 0;
      const needMake = [...D.itemStats.values()].filter((st) => st.it.make === 'make' && data.active(st.it) && (st.it.status || 'ผลิตอยู่') === 'ผลิตอยู่' && st.suggestQty > 0 && !st.activeJobs.length);
      for (const st of needMake.sort(() => rnd() - 0.5)) {
        if (opened >= 3 * K) break;
        const it = st.it;
        const room = it.lane === 'ผลิต' ? 'prod' : 'process';
        const q = Math.max(it.batch_or_pack || 1, st.suggestQty);
        // ของสดสำหรับงานแปรรูป: รับซื้อจากเกษตรกรก่อน ถ้าไม่พอ
        for (const n of data.bomNeeds(it.code, q)) {
          if (n.ok) continue;
          const src = S.items.get(n.code);
          if (src?.make === 'farm') {
            const sup = S.base.suppliers.filter((s) => s.approved === 'Y' && s.type !== 'บริษัท');
            submit('รับซื้อสมุนไพรสด', 'receive', { item: n.code, po: '', supplier: (pickOne(sup.length ? sup : S.base.suppliers)).supplier_id, qty: qtyStr(n.code, (n.need - n.have) * 1.08), exp: '' }, 'U01');
          }
        }
        if (submit(it.lane === 'ผลิต' ? 'เปิดงานผลิต' : 'เปิดงานแปรรูป', 'job', { room, item: it.code, qty: qtyStr(it.code, q) }, it.lane === 'ผลิต' ? 'U03' : 'U02')) opened += 1;
      }
      // 5 ย้ายงานบนบอร์ดวันละ 1 ขั้น (ข้ามงานที่วัตถุดิบยังไม่พอ)
      for (const c of D.board.slice()) {
        const j = c.job;
        if (c.stage === 'รอปล่อยผ่าน' || c.stage === 'ตรวจสอบแล้ว') continue;
        if (j.status === 'waiting' && c.stage !== 'จ่ายบันทึกการผลิต' && c.stage !== 'ตรวจรับ') { /* ขั้นที่ต้องเบิก */ }
        if (j.status === 'waiting' && data.bomNeeds(j.item_code, j.qty).some((n) => !n.ok)) { wait('งานรอวัตถุดิบ'); continue; }
        const user = j.lane === 'ผลิต' ? (rnd() < 0.5 ? 'U03' : 'U06') : 'U02';
        // ส่งตรวจ: กรอกจำนวนที่ได้จริง ส่วนใหญ่สูญเสีย 0 ถึง 4% ราว 1 ใน 20 งานได้น้อยกว่าสั่ง 20% ต้องใส่เหตุผล
        const fill = (d) => { const a = d.querySelector('[name="actual"]'); if (!a) return; const loss = rnd() < 0.05 ? 0.2 : rnd() * 0.04; a.value = qtyStr(j.item_code, j.qty * (1 - loss)); a.dispatchEvent(new Event('input', { bubbles: true })); const nt = d.querySelector('[name="note"]'); if (nt && nt.required) nt.value = 'ผลผลิตต่ำกว่าเกณฑ์ ชั่งซ้ำแล้ว (บอทจำลอง)'; };
        click(j.lane === 'ผลิต' ? 'ย้ายงานผลิต' : 'ย้ายงานแปรรูป', `#/job?id=${encodeURIComponent(j.job_id)}`, `[data-act="move"][data-job="${j.job_id}"][data-dir="1"]`, user, null, fill);
      }
      // 6 ใบขอซื้อสำหรับของที่ซื้อ เมื่อถึงจุดสั่งและยังไม่มีใบค้าง
      const openPrItems = new Set(D.prOpen.filter((x) => !x.r.received).map((x) => x.r.item_code));
      for (const st of [...D.itemStats.values()].filter((s) => s.it.make === 'buy' && data.active(s.it) && s.suggestQty > 0 && !s.openPOs.length && !openPrItems.has(s.it.code)).slice(0, 4 * K)) {
        submit('เขียนใบขอซื้อ', 'pr', { item: st.it.code, supplier: st.it.supplier_id, qty: qtyStr(st.it.code, st.suggestQty), unit_cost: String(st.it.cost || 1), purpose: 'เติมคลังตามจุดสั่งซื้อ (บอทจำลอง)' }, 'U01');
      }
      // 7 เดินใบขอซื้อวันละ 1 ขั้นต่อใบ (2% ไม่อนุมัติ)
      const BY = { head_ok: 'U00', dir_ok: 'U08', ordered: 'U01', inspected: 'U03', pay_requested: 'U01', paid: 'U08' };
      for (const x of D.prOpen.slice()) {
        const k = x.st.key;
        if (!BY[k]) continue;
        if (k === 'inspected' && dayIdx % 7 !== 0) { wait('ใบขอซื้อรอตรวจรับพัสดุ'); continue; }
        // รอบแก้ QA: ตรวจรับพัสดุย้ายไปห้องฝ่ายผลิต (ผู้ตรวจรับเข้าห้องคลังไม่ได้)
        const hash = k === 'inspected' ? '#/prod?tab=inspect' : `#/store?tab=buy&pr=${encodeURIComponent(x.r.pr_no)}`;
        if ((k === 'head_ok' || k === 'dir_ok') && rnd() < 0.02) { click('ไม่อนุมัติใบขอซื้อ', hash, `[data-act="prReject"][data-pr="${x.r.pr_no}"]`, BY[k], null, (d) => { d.querySelector('[name="reason"]').value = 'งบไม่พอ (บอทจำลอง)'; }); continue; }
        click(`ใบขอซื้อ ${k}`, hash, `[data-act="prStep"][data-pr="${x.r.pr_no}"][data-step="${k}"]`, BY[k], null, (d) => { const r = d.querySelector('[name="reason"]'); if (r) r.value = 'ไม่อนุมัติ (บอทจำลอง)'; });
      }
      // 8 ขายยาสำเร็จรูปให้ลูกค้า วันละ 1 ถึง 3 รายการ
      const fg = [...D.itemStats.values()].filter((s) => (s.it.kind === 'ยารับประทาน' || s.it.kind === 'ยาใช้ภายนอก') && s.released > 0 && (s.it.status || 'ผลิตอยู่') === 'ผลิตอยู่');
      const nSale = (1 + Math.floor(rnd() * 3)) * K;
      for (let i = 0; i < nSale && fg.length; i++) {
        // รอบแก้ QA: อ่านคงคลังล่าสุดทุกครั้ง (เดิมใช้ค่าตอนต้นวัน ขายรายการเดิมซ้ำในวันเดียวจึงเกินของที่มี)
        const s = D.itemStats.get(pickOne(fg).it.code);
        const cust = pickOne(S.base.customers);
        const q = Math.min(s.released * 0.4, 20 + rnd() * 200);
        if (q < 1) continue;
        submit('ขาย เบิกให้ลูกค้า', 'issue', { item: s.it.code, qty: qtyStr(s.it.code, q), to: cust.name }, 'U01');
      }
      // 9 รับชำระใบส่งของที่ครบกำหนด (ช้ากว่ากำหนดบ้าง)
      for (const v of S.invoices.filter((x) => !x.paid_date && x.due_date <= data.addDays(iso, -Math.floor(rnd() * 20))).slice(0, 4)) {
        // รอบแก้ QA: กรอกเลขใบเสร็จ ราว 1 ใน 10 ใบลูกค้าจ่ายครึ่งเดียวก่อน
        const half = !data.paidOf(v) && rnd() < 0.1;
        click(half ? 'รับชำระบางส่วน' : 'รับชำระ', `#/sales?tab=ar&cust=${encodeURIComponent(v.customer_id)}`, `[data-act="pay"][data-inv="${v.inv_no}"]`, 'U07', null, (d) => { d.querySelector('[name="receipt"]').value = `บร ${v.inv_no}`; if (half) { const a = d.querySelector('[name="amount"]'); a.value = String(Math.round(data.owedOf(v) / 2 * 100) / 100); } });
      }
      // 10 บันทึกถึงฝ่าย (ราว 1 ใน 3 วัน) และผู้รับเปิดอ่านบันทึกเก่า
      if (rnd() < 0.35) {
        const from = pickOne(['U01', 'U02', 'U03', 'U04', 'U05']);
        const room = pickOne(['store', 'process', 'prod', 'qc']);
        as(from);
        go('#/notes');
        const f = document.createElement('form');
        f.dataset.form = 'note';
        f.innerHTML = `<input name="subject" value="แจ้งเรื่องงานประจำวัน ${iso}"><textarea name="body">ข้อความจำลองจากบอท QA</textarea><input name="to_room" value="${room}"><input name="to_user" value=""><input name="ref" value="">`;
        document.getElementById('main').appendChild(f);
        const n0 = S.events.length;
        f.requestSubmit();
        tally('บันทึกถึงฝ่าย', S.events.length > n0, { toast: toasts.slice(-1)[0] || '' });
      }
      // รอบแก้ QA: ข้ามบันทึกที่ผู้อ่านเป็นคนส่งเอง (เดิมบอทพยายามเปิดอ่านซ้ำทุกวันแล้วนับเป็นไม่สำเร็จ)
      const READER = { store: 'U01', process: 'U02', prod: 'U03', qc: 'U05', sales: 'U07' };
      for (const n of S.notes.filter((x) => x.to_room && x.from !== (READER[x.to_room] || 'U00') && !(S.noteReads.get(x.id) || []).length).slice(0, 2)) {
        const reader = READER[n.to_room] || 'U00';
        as(reader);
        const n0 = S.events.length;
        go(`#/notes?id=${encodeURIComponent(n.id)}`);
        tally('เปิดอ่านบันทึก', S.events.length > n0, {});
      }
      // 11 คนแก้ของที่กรอกผิด (เลียนแบบความผิดพลาดจริงราว 3%): แก้จำนวนรับเข้า หรือลบรายการเบิกที่ยังไม่มีใครอ้างถึง
      if (rnd() < 0.03) {
        const ev = S.events.slice().reverse().find((e) => e.type === 'receive' && data.blockers(e.id).length === 0 && S.evState.get(e.id)?.status === 'active');
        if (ev) formSubmit('แก้ไขรับเข้า', `#/log?edit=${ev.id}`, 'form[data-form="amend"]', (f) => { setVal(f, 'qty', String(Math.round(Number(ev.input.qty) * 0.98 * 100) / 100)); setVal(f, 'reason', 'ชั่งซ้ำแล้วน้ำหนักไม่ตรง (บอทจำลอง)'); }, 'U01');
      }
      if (rnd() < 0.015) {
        const ev = S.events.slice().reverse().find((e) => e.type === 'issue' && S.evState.get(e.id)?.status === 'active');
        if (ev) formSubmit('ลบรายการเบิก', `#/log?del=${ev.id}`, 'form[data-form="void"]', (f) => { setVal(f, 'reason', 'บันทึกผิดลูกค้า (บอทจำลอง)'); }, 'U01');
      }
    }
    // ---------- วัดหน้าเว็บ ----------
    as('U00');
    t = performance.now(); go('#/overview'); out.overviewMs = Math.round(performance.now() - t);
    t = performance.now(); go('#/store?tab=stock'); out.stockMs = Math.round(performance.now() - t);
    t = performance.now(); go('#/log'); out.logMs = Math.round(performance.now() - t);
    out.overflow = document.documentElement.scrollWidth > innerWidth + 1;
    // ---------- กฎที่ต้องจริงเสมอ ----------
    out.v = window.qa.check(iso);
    out.events = S.events.length;
    let stored = null, chars = 0;
    try { const raw = localStorage.getItem(KEY); chars = raw ? raw.length : 0; stored = raw ? JSON.parse(raw).length : 0; } catch { stored = -1; }
    let total = 0;
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); total += k.length + (localStorage.getItem(k) || '').length; } } catch {}
    out.lsChars = chars; out.lsTotalChars = total; out.stored = stored; out.unsaved = S.events.length - stored;
    const cm = M.commitMs;
    out.commit = { n: cm.length, avg: cm.length ? Math.round(cm.reduce((a, b) => a + b, 0) / cm.length) : 0, max: cm.length ? Math.round(Math.max(...cm)) : 0 };
    out.acts = M.acts; out.fails = M.fails; out.waits = M.waits;
    out.alerts = D.alerts.length; out.expiring = D.expiries.length; out.qcQueue = D.qcQueue.length; out.board = D.board.filter((c) => c.stage !== 'ตรวจสอบแล้ว').length; out.prOpen = D.prOpen.length;
    return out;
  };

  // กฎที่ต้องจริงเสมอ: คืนจำนวนที่ผิดและตัวอย่าง
  window.qa.check = (iso) => {
    const v = {};
    const add = (k, x) => { v[k] = v[k] || { n: 0, ex: [] }; v[k].n += 1; if (v[k].ex.length < 4) v[k].ex.push(x); };
    const IN = new Set(['รับ', 'ยกมา']), OUT = new Set(['จ่าย', 'ตัดจ่ายหมดอายุ', 'ทำลาย', 'ส่งคืนผู้ขาย']);
    const bal = new Map();
    for (const m of S.moves) bal.set(m.lot_no, (bal.get(m.lot_no) || 0) + (IN.has(m.type) ? m.qty : OUT.has(m.type) ? -m.qty : 0));
    for (const l of S.lots) {
      if (l.qty_left < -1e-6) add('คงคลังติดลบ', `${l.lot_no} ${l.qty_left}`);
      const b = bal.get(l.lot_no);
      if (b !== undefined && Math.abs(b - l.qty_left) > 0.02 + Math.abs(l.qty_left) * 1e-6) add('รับจ่ายไม่ตรงคงเหลือ', `${l.lot_no} บัญชี ${Math.round(b * 100) / 100} คงเหลือ ${l.qty_left}`);
    }
    const dup = (arr, k) => { const seen = new Set(); for (const x of arr) { if (seen.has(x)) add(k, x); seen.add(x); } };
    dup(S.lots.map((l) => l.lot_no), 'เลขล็อตซ้ำ');
    dup(S.jobs.map((j) => j.job_id), 'เลขงานซ้ำ');
    dup(S.pos.map((p) => p.po_no), 'เลขใบสั่งซื้อซ้ำ');
    dup(S.invoices.map((x) => x.inv_no), 'เลขใบส่งของซ้ำ');
    dup(S.prs.map((r) => r.pr_no), 'เลขใบขอซื้อซ้ำ');
    dup(S.notes.map((n) => n.id), 'เลขบันทึกซ้ำ');
    // เบิกจากล็อตที่ยังไม่ปล่อยผ่านหรือหมดอายุแล้ว (เฉพาะรายการที่บอทกรอก)
    for (const e of S.events) {
      if (S.evState.get(e.id)?.status !== 'active') continue;
      for (const m of e.effects?.moves || []) {
        if (m.type !== 'จ่าย') continue;
        const l = S.lotMap.get(m.lot_no);
        if (!l) { add('เบิกจากล็อตที่ไม่มีอยู่', m.lot_no); continue; }
        if (l.status !== 'ตรวจสอบแล้ว' && !(l.status === 'ไม่ผ่าน' && l.release_date && l.release_date > m.date)) add('เบิกจากล็อตที่ไม่ได้ปล่อยผ่าน', `${m.lot_no} ${l.status} เบิก ${m.date}`);
        if (l.exp_date && l.exp_date <= m.date) add('เบิกของหมดอายุ', `${m.lot_no} หมด ${l.exp_date} เบิก ${m.date}`);
      }
    }
    // คนตรวจกับคนอนุมัติต้องคนละคน และผู้อนุมัติต้องเป็นหัวหน้าฝ่ายควบคุมคุณภาพ
    for (const r of S.releases) {
      if (!r.approver_id) continue;
      if (r.checker_id && r.checker_id === r.approver_id) add('คนตรวจกับคนอนุมัติคนเดียวกัน', r.lot_no);
      const role = data.staff(r.approver_id).role;
      if (role && role !== 'หัวหน้าฝ่ายควบคุมคุณภาพ') add('ผู้อนุมัติไม่ใช่หัวหน้าฝ่ายควบคุมคุณภาพ', `${r.lot_no} ${role}`);
    }
    // ใบส่งของ ยอดรวมต้องเท่ากับผลรวมรายการ
    const sum = new Map();
    for (const l of S.invoiceLines) sum.set(l.inv_no, (sum.get(l.inv_no) || 0) + l.amount);
    for (const x of S.invoices) if (Math.abs((sum.get(x.inv_no) || 0) - x.total) > 1) add('ยอดใบส่งของไม่ตรงรายการ', `${x.inv_no} ${x.total} รวม ${sum.get(x.inv_no) || 0}`);
    // งานที่จบแล้วต้องมีล็อตผลผลิตที่ปล่อยผ่าน
    for (const j of S.jobs) if (j.status === 'done' && j.out_lot) { const l = S.lotMap.get(j.out_lot); if (!l) add('งานจบแต่ไม่มีล็อตผลผลิต', j.job_id); }
    // ของหมดอายุค้างคลัง (ไม่ใช่กฎผิด แต่เป็นตัวชี้ของเสีย)
    let expiredLeft = 0, expiredFresh = 0;
    for (const l of S.lots) if (l.qty_left > 1e-9 && l.exp_date && l.exp_date <= iso) { expiredLeft += 1; if (S.items.get(l.item_code)?.kind === 'สด') expiredFresh += 1; }
    v._expiredLotsWithStock = expiredLeft; v._expiredFreshLots = expiredFresh;
    return v;
  };
  return true;
}

// ---------- ฝั่ง Node ----------
const srv = await startServer();
const br = await launch();
const page = br.page;
const startMs = Date.parse(`${START}T09:00:00+07:00`);
let day = START;
srv.state.metaBase = addDays(day, -1);
await page.send('Page.navigate', { url: `${srv.origin}/data/meta.json` });
await sleep(400);
await page.ev(`localStorage.clear(); localStorage.setItem('hfd-user', JSON.stringify('U00')); localStorage.setItem('qa-now', '${startMs}'); true`);
async function boot() {
  srv.state.metaBase = addDays(day, -1);
  await page.ev(`try { localStorage.setItem('qa-now', String(${Date.parse(`${day}T09:00:00+07:00`)})); } catch (e) {} true`).catch(() => {});
  const loadMs = await page.open(srv.origin, 'overview');
  await page.ev(PAGE_HELPERS);
  await page.ev(`(${driver.toString()})()`);
  return loadMs;
}
const t0 = Date.now();
let loadMs = await boot();
let lastPersist = null;
const summary = { seed: SEED, start: START, days: DAYS, started: new Date().toISOString(), reloads: [], errors: 0 };
for (let i = 0; i < DAYS; i++) {
  day = addDays(START, i);
  let rec;
  try {
    rec = await page.ev(`window.qa.day(${JSON.stringify(day)}, ${i}, { seed: ${SEED}, scale: ${SCALE} })`);
  } catch (e) {
    rec = { day, idx: i, crash: String(e.message || e).slice(0, 400) };
    summary.errors += 1;
    try { loadMs = await boot(); } catch {}
  }
  rec.pageErrors = page.errors.splice(0);
  rec.consoleErrors = page.consoleErrors.splice(0);
  rec.dialogs = page.dialogs.splice(0).length;
  // ปิดเปิดหน้าใหม่เป็นระยะ: ข้อมูลที่เห็นก่อนปิดต้องยังอยู่หลังเปิดใหม่
  if ((i + 1) % RELOAD_EVERY === 0 || i === DAYS - 1) {
    const before = rec.events;
    day = addDays(START, i + 1 < DAYS ? i + 1 : i);
    loadMs = await boot();
    const after = await page.ev(`window.qa.data.S.events.length`);
    lastPersist = { atDay: i, before, after, lost: before - after, loadMs };
    rec.reload = lastPersist;
    summary.reloads.push(lastPersist);
  }
  appendFileSync(LOG, JSON.stringify(rec) + '\n');
  if (i % 10 === 0) process.stdout.write(`วัน ${i} ${rec.day} เหตุการณ์ ${rec.events} ใช้เวลา ${Math.round((Date.now() - t0) / 1000)} วินาที\n`);
}
if (process.argv.includes('--diag')) {
  // งานที่รอวัตถุดิบ: ขาดอะไร และระบบเตือนให้สั่งของนั้นหรือยัง
  const rows = await page.ev(`(() => {
    const { data } = window.qa; const { S, D } = data;
    const out = [];
    for (const c of D.board) {
      const j = c.job; if (j.status !== 'waiting') continue;
      for (const n of data.bomNeeds(j.item_code, j.qty)) {
        if (n.ok) continue;
        const it = S.items.get(n.code); const st = D.itemStats.get(n.code);
        const openPr = S.prs.filter((r) => r.item_code === n.code && !r.paid && !r.rejected).map((r) => data.prStage(r).key);
        out.push({ job: j.job_id, waitDays: data.daysBetween(j.created_date, S.today), item: n.code, name: it && it.name, make: it && it.make, need: n.need, have: Math.round(n.have * 100) / 100, level: st && st.level, suggest: st && st.suggestQty, rop: st && Math.round(st.pol.rop), position: st && Math.round(st.position), released: st && Math.round(st.released), quarantine: st && Math.round(st.quarantine), onOrder: st && Math.round(st.onOrder), openPOs: st && st.openPOs.length, openPr });
      }
    }
    return out;
  })()`);
  writeFileSync(join(OUT, `sim-${TAG}-diag.json`), JSON.stringify(rows, null, 1));
}
summary.finished = new Date().toISOString();
summary.minutes = Math.round((Date.now() - t0) / 600) / 100;
writeFileSync(join(OUT, `sim-${TAG}-summary.json`), JSON.stringify(summary, null, 2));
br.close();
srv.close();
process.exit(0);
