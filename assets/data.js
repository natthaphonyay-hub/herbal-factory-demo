// โหลดข้อมูลจำลอง เลื่อนวันที่ให้ตรงวันนี้ เล่นเหตุการณ์ที่ผู้ใช้ทดลองกรอก แล้วคำนวณสถานะทั้งหมด
import { CONFIG, LANES, STAGE_OWNER, REQ_FORM } from './config.js';
import { meanSd, policy, onTimeProbability, onTimeVerdict, expiryLevel, fefoPick } from './logic.js';

const FILES = ['items', 'herbs', 'bom', 'suppliers', 'customers', 'staff', 'lots', 'moves', 'purchase_orders', 'jobs', 'job_inputs', 'releases', 'invoices', 'invoice_lines', 'shortages'];
const DATE_FIELDS = {
  lots: ['date_in', 'exp_date', 'release_date'], moves: ['date'], purchase_orders: ['order_date', 'quoted_date', 'received_date'],
  jobs: ['created_date', 'start_date', 'end_date', 'release_date'], releases: ['date'], invoices: ['date', 'due_date', 'paid_date'], shortages: ['date'],
};
const NUM_FIELDS = {
  lots: ['qty_in', 'qty_left'], moves: ['qty'], purchase_orders: ['qty'], jobs: ['qty'], job_inputs: ['qty'], invoices: ['total'],
  invoice_lines: ['qty', 'price', 'amount'], items: ['shelf_days', 'batch_or_pack', 'price', 'csl'], suppliers: ['quoted_lead_days'],
  customers: ['credit_days'], bom: ['qty_per_unit'], shortages: ['qty_short'],
};
const IN = new Set(['รับ', 'ยกมา']);
const OUT = new Set(['จ่าย', 'ตัดจ่ายหมดอายุ', 'ทำลาย', 'ส่งคืนผู้ขาย']);
const KEY = 'hfd-events-v1';

// ---------- เครื่องมือ ----------
export function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1 || r[0] !== '').map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
export function toCSV(rows, cols) {
  const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}
export function localISO(d = new Date()) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
export const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
export function fy2(iso) { const [y, m] = iso.split('-').map(Number); return String((m >= 10 ? y + 1 : y) + 543).slice(-2); }
const UNIT_INT = new Set(['ใบ', 'หลอด', 'ขวด', 'เม็ด', 'ชุด', 'ผืน', 'ดวง', 'ลูก', 'กล่อง']);

function store(get, set) {
  try { if (set === undefined) return JSON.parse(localStorage.getItem(get) || 'null'); localStorage.setItem(get, JSON.stringify(set)); } catch { /* เบราว์เซอร์ไม่ให้เก็บ ใช้ต่อได้แต่ไม่จำ */ }
  return null;
}

// ---------- สถานะของเว็บ ----------
export const S = {
  today: localISO(), shift: 0, meta: null, base: null, events: [], user: 'U00',
  items: new Map(), lots: [], lotMap: new Map(), moves: [], pos: [], jobs: [], releases: [], stageOverride: new Map(),
};

export async function loadAll() {
  const out = {};
  await Promise.all(FILES.map(async (f) => {
    const r = await fetch(`data/${f}.csv`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`โหลด data/${f}.csv ไม่ได้ (${r.status})`);
    out[f] = parseCSV(await r.text());
  }));
  S.meta = await (await fetch('data/meta.json', { cache: 'no-cache' })).json();
  S.shift = daysBetween(S.meta.base_date, S.today);
  for (const [t, cols] of Object.entries(DATE_FIELDS)) for (const r of out[t]) for (const c of cols) if (r[c]) r[c] = addDays(r[c], S.shift);
  for (const [t, cols] of Object.entries(NUM_FIELDS)) for (const r of out[t]) for (const c of cols) if (r[c] !== '') r[c] = Number(r[c]);
  S.base = out;
  S.events = store(KEY) || [];
  S.user = store('hfd-user') || 'U00';
  rebuild();
}

export function staff(id) { return S.base.staff.find((s) => s.user_id === id) || { name: id, role: '' }; }
export const currentUser = () => staff(S.user);
export function setUser(id) { S.user = id; store('hfd-user', id); }

// ---------- เหตุการณ์ (บันทึกเพิ่มต่อท้ายอย่างเดียว ไม่แก้ของเก่า) ----------
export function commit(event) {
  const ev = { id: `E${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), user: S.user, ...event };
  S.events.push(ev);
  store(KEY, S.events);
  rebuild();
  return ev;
}
export function resetEvents() { S.events = []; store(KEY, []); rebuild(); }

function rebuild() {
  const b = S.base;
  S.items = new Map(b.items.map((x) => [x.code, x]));
  S.lots = b.lots.map((l) => ({ ...l }));
  S.moves = b.moves.slice();
  S.pos = b.purchase_orders.map((p) => ({ ...p }));
  S.jobs = b.jobs.map((j) => ({ ...j }));
  S.releases = b.releases.slice();
  S.jobInputs = b.job_inputs.slice();
  S.stageOverride = new Map();
  S.lotMap = new Map(S.lots.map((l) => [l.lot_no, l]));
  for (const ev of S.events) apply(ev.effects || {});
  S.lotsByItem = new Map();
  for (const l of S.lots) { if (!S.lotsByItem.has(l.item_code)) S.lotsByItem.set(l.item_code, []); S.lotsByItem.get(l.item_code).push(l); }
  compute();
}

function apply(fx) {
  for (const l of fx.lots || []) { const n = { ...l, qty_left: 0 }; S.lots.push(n); S.lotMap.set(n.lot_no, n); }
  for (const m of fx.moves || []) {
    S.moves.push(m);
    const l = S.lotMap.get(m.lot_no);
    if (l) l.qty_left = round(l.item_code, l.qty_left + (IN.has(m.type) ? m.qty : OUT.has(m.type) ? -m.qty : 0));
  }
  for (const s of fx.status || []) { const l = S.lotMap.get(s.lot_no); if (l) Object.assign(l, s); }
  for (const r of fx.releases || []) S.releases.push(r);
  for (const p of fx.po || []) { const po = S.pos.find((x) => x.po_no === p.po_no); if (po) Object.assign(po, p); }
  for (const j of fx.jobs || []) { const job = S.jobs.find((x) => x.job_id === j.job_id); if (job) Object.assign(job, j.patch); }
  for (const x of fx.inputs || []) S.jobInputs.push(x);
  for (const s of fx.stage || []) S.stageOverride.set(s.job_id, s.stage);
}

export function round(code, q) { const it = S.items.get(code); return it && UNIT_INT.has(it.unit) ? Math.round(q) : Math.round(q * 100) / 100; }
export const usable = (l) => l.status === 'ตรวจสอบแล้ว' && l.qty_left > 1e-9 && (!l.exp_date || l.exp_date > S.today);

// ---------- เลขที่ผลิตและเลขรับ ตาม SOP-PD-07 ----------
export function nextLotNo(code, date = S.today) {
  const fy = fy2(date);
  if (code.startsWith('9')) {
    const n = S.lots.filter((l) => l.lot_no.startsWith(`R${fy}-`)).map((l) => Number(l.lot_no.slice(4))).reduce((a, b) => Math.max(a, b), 0);
    return `R${fy}-${String(n + 1).padStart(4, '0')}`;
  }
  const n = S.lots.filter((l) => l.item_code === code && l.lot_no.startsWith(`${code}${fy}`)).map((l) => Number(l.lot_no.slice(6))).reduce((a, b) => Math.max(a, b), 0);
  return `${code}${fy}${String(n + 1).padStart(2, '0')}`;
}
let moveSeq = 0;
export function newMove(o) { moveSeq += 1; return { move_id: `W${Date.now().toString(36)}${moveSeq}`, date: S.today, user_id: S.user, ...o }; }

// ---------- คำนวณสถานะทั้งหมด ----------
export const D = { itemStats: new Map(), alerts: [], board: [], qcQueue: [], expiries: [] };

function leadStats(item) {
  if (item.make === 'buy') {
    const sup = S.base.suppliers.find((s) => s.supplier_id === item.supplier_id);
    const xs = S.pos.filter((p) => p.item_code === item.code && p.supplier_id === item.supplier_id && p.received_date)
      .sort((a, b) => b.order_date.localeCompare(a.order_date)).slice(0, 10).map((p) => daysBetween(p.order_date, p.received_date));
    const st = meanSd(xs);
    if (st.n < CONFIG.minLeadSamples) return { L: sup.quoted_lead_days, sL: sup.quoted_lead_days * 0.2, n: st.n, quoted: true, supplier: sup };
    return { L: st.mean, sL: st.sd, n: st.n, quoted: false, supplier: sup };
  }
  const xs = S.jobs.filter((j) => j.item_code === item.code && j.status === 'done' && j.release_date)
    .sort((a, b) => b.created_date.localeCompare(a.created_date)).slice(0, 10).map((j) => daysBetween(j.created_date, j.release_date));
  const st = meanSd(xs);
  return { L: st.n ? st.mean : 7, sL: st.n > 1 ? st.sd : 2, n: st.n, quoted: false, supplier: null };
}

export function supplierLead(supplierId, itemCode) {
  const sup = S.base.suppliers.find((s) => s.supplier_id === supplierId);
  let xs = S.pos.filter((p) => p.supplier_id === supplierId && p.item_code === itemCode && p.received_date).map((p) => daysBetween(p.order_date, p.received_date));
  if (xs.length < CONFIG.minLeadSamples) xs = S.pos.filter((p) => p.supplier_id === supplierId && p.received_date).map((p) => daysBetween(p.order_date, p.received_date));
  const st = meanSd(xs);
  if (st.n < CONFIG.minLeadSamples) return { L: sup.quoted_lead_days, sL: sup.quoted_lead_days * 0.2, n: st.n, quoted: true, supplier: sup };
  return { L: st.mean, sL: st.sd, n: st.n, quoted: false, supplier: sup };
}

function usageStats(code) {
  const W = CONFIG.demandWindowDays;
  const from = addDays(S.today, -W);
  const perDay = new Map();
  for (const m of S.moves) if (m.item_code === code && m.type === 'จ่าย' && m.date > from && m.date <= S.today) perDay.set(m.date, (perDay.get(m.date) || 0) + m.qty);
  const xs = [];
  for (let i = W - 1; i >= 0; i--) xs.push(perDay.get(addDays(S.today, -i)) || 0);
  return meanSd(xs);
}

export function stageOf(job) {
  if (S.stageOverride.has(job.job_id)) return S.stageOverride.get(job.job_id);
  const lane = job.lane;
  if (job.status === 'waiting') return lane === 'ผลิต' ? 'เบิกวัตถุดิบ' : 'ตรวจรับ';
  if (job.status === 'running') {
    const total = Math.max(1, daysBetween(job.start_date, job.end_date));
    const frac = daysBetween(job.start_date, S.today) / total;
    if (lane === 'ผลิต') return frac < 0.6 ? 'ผลิต' : 'บรรจุ';
    if (S.items.get(job.item_code).kind === 'ผง') return 'ลดขนาด บดร่อน';
    return frac < 0.15 ? 'ตรวจรับ' : frac < 0.45 ? 'คัดแยก ล้าง' : frac < 0.85 ? 'ตาก อบ' : 'ลดขนาด บดร่อน';
  }
  if (job.status === 'qc') return 'รอปล่อยผ่าน';
  return 'ตรวจสอบแล้ว';
}

function compute() {
  const today = S.today;
  D.itemStats = new Map();
  D.expiries = [];
  for (const it of S.items.values()) {
    if (it.make === 'farm') continue;
    const ls = S.lotsByItem.get(it.code) || [];
    const released = ls.filter(usable).reduce((s, l) => s + l.qty_left, 0);
    const quarantine = ls.filter((l) => l.status === 'รอปล่อยผ่าน').reduce((s, l) => s + l.qty_left, 0);
    const rejected = ls.filter((l) => l.status === 'ไม่ผ่าน' && l.qty_left > 0).reduce((s, l) => s + l.qty_left, 0);
    const u = usageStats(it.code);
    const lt = leadStats(it);
    const pol = policy({ d: u.mean, sd: u.sd, L: lt.L, sL: lt.sL, csl: it.csl || CONFIG.cslOther, R: CONFIG.reviewDays });
    const openPOs = S.pos.filter((p) => p.item_code === it.code && !p.received_date && p.lot_no !== 'ก่อนเริ่มระบบ');
    const activeJobs = S.jobs.filter((j) => j.item_code === it.code && (j.status === 'waiting' || j.status === 'running'));
    const onOrder = openPOs.reduce((s, p) => s + p.qty, 0) + activeJobs.reduce((s, j) => s + j.qty, 0);
    const position = released + quarantine + onOrder;
    const cover = u.mean > 0 ? (released + quarantine) / u.mean : Infinity;
    const stockoutDate = Number.isFinite(cover) ? addDays(today, Math.floor(cover)) : null;
    const target = it.csl || CONFIG.cslOther;
    const poViews = openPOs.map((p) => {
      const sl = supplierLead(p.supplier_id, it.code);
      const expected = addDays(p.order_date, Math.round(sl.L));
      const prob = stockoutDate ? onTimeProbability({ daysFromOrderToStockout: daysBetween(p.order_date, stockoutDate), L: sl.L, sL: sl.sL }) : 1;
      return { po: p, sl, expected, prob, verdict: onTimeVerdict(prob, target), lateDays: stockoutDate ? daysBetween(stockoutDate, expected) : 0 };
    });
    let level = 'ok';
    if (u.mean > 0 && released <= pol.ss) level = 'crit';
    if (poViews.some((v) => v.verdict.level === 'crit')) level = 'crit';
    if (level === 'ok' && (position <= pol.rop || poViews.some((v) => v.verdict.level === 'warn'))) level = 'warn';
    const pack = it.batch_or_pack || 1;
    const suggestQty = position <= pol.rop ? Math.max(pack, Math.ceil((pol.S - position) / pack) * pack) : 0;
    D.itemStats.set(it.code, { it, released, quarantine, rejected, u, lt, pol, openPOs, poViews, activeJobs, onOrder, position, cover, stockoutDate, level, suggestQty, target });
    for (const l of ls) {
      if (l.status !== 'ตรวจสอบแล้ว' || l.qty_left <= 0 || !l.exp_date) continue;
      const left = daysBetween(today, l.exp_date);
      const lv = expiryLevel(left, CONFIG);
      if (lv && lv !== 'ok') D.expiries.push({ lot: l, it, daysLeft: left, level: lv === 'expired' ? 'crit' : lv });
    }
  }
  D.expiries.sort((a, b) => a.daysLeft - b.daysLeft);

  D.qcQueue = S.lots.filter((l) => l.status === 'รอปล่อยผ่าน' && l.qty_left > 0)
    .map((l) => ({ lot: l, it: S.items.get(l.item_code), waiting: daysBetween(l.date_in, today), job: S.jobs.find((j) => j.out_lot === l.lot_no) }))
    .sort((a, b) => b.waiting - a.waiting);

  D.board = S.jobs.filter((j) => j.status !== 'done' || (j.release_date && daysBetween(j.release_date, today) <= CONFIG.boardDoneDays))
    .map((j) => {
      const stage = stageOf(j);
      const it = S.items.get(j.item_code);
      const since = stage === 'รอปล่อยผ่าน' ? (j.end_date || j.created_date) : stage === 'ตรวจสอบแล้ว' ? j.release_date : (j.start_date || j.created_date);
      return { job: j, it, stage, owner: staff(STAGE_OWNER[stage]), days: since ? Math.max(0, daysBetween(since, today)) : 0, blocked: j.status === 'waiting' && j.wait_reason ? j.wait_reason : '' };
    });

  buildAlerts();
}

function buildAlerts() {
  const A = [];
  const fmtQ = (code, q) => `${Math.round(q).toLocaleString('th-TH')} ${S.items.get(code).unit}`;
  for (const st of D.itemStats.values()) {
    const { it } = st;
    for (const v of st.poViews) {
      if (v.verdict.level === 'ok') continue;
      const backup = it.backup_supplier_id ? S.base.suppliers.find((s) => s.supplier_id === it.backup_supplier_id) : null;
      const bl = backup ? supplierLead(backup.supplier_id, it.code) : null;
      let action = `โทรเร่ง${v.sl.supplier.name}`;
      if (backup && v.verdict.level === 'crit') {
        const gap = Math.max(0, daysBetween(S.today, v.expected)) * st.u.mean + st.pol.ss - (st.released + st.quarantine);
        const pack = it.batch_or_pack || 1;
        action = `สั่งเพิ่มจาก${backup.name} ${fmtQ(it.code, Math.max(pack, Math.ceil(gap / pack) * pack))} (ส่งเฉลี่ย ${Math.round(bl.L)} วัน)`;
      }
      A.push({
        level: v.verdict.level, kind: 'supply', topic: 'supply chain', item: it.code,
        title: `${it.name} จะขาดใน ${Math.max(0, Math.floor(st.cover))} วัน`,
        detail: `สั่ง ${thaiDate(v.po.order_date)} ${v.sl.supplier.name} ส่งเฉลี่ย ${Math.round(v.sl.L)} วัน (±${Math.round(v.sl.sL)} วัน จาก ${v.sl.n} ครั้ง${v.sl.quoted ? ' ใช้ค่าที่ผู้ขายแจ้ง' : ''}) คาดถึง ${thaiDate(v.expected)}${v.lateDays > 0 ? ` ช้ากว่าวันที่ของหมด ${v.lateDays} วัน` : ''} โอกาสทัน ${Math.round(v.prob * 100)}%`,
        action, timeline: { order: v.po.order_date, stockout: st.stockoutDate, expected: v.expected }, sort: v.prob,
      });
    }
    if (st.poViews.length === 0 && st.u.mean > 0 && st.position <= st.pol.rop) {
      const make = it.make !== 'buy';
      A.push({
        level: st.released <= st.pol.ss ? 'crit' : 'warn', kind: 'reorder', topic: make ? 'คงคลังเทียบความต้องการ' : 'ถึงจุดสั่งซื้อ', item: it.code,
        title: make ? `${it.name} พอจ่ายอีก ${Math.max(0, Math.floor(st.cover))} วัน` : `${it.name} ถึงจำนวนอย่างต่ำแล้ว`,
        detail: `คงคลังตรวจสอบแล้ว ${fmtQ(it.code, st.released)} ใช้วันละ ${st.u.mean.toFixed(1)} ${it.unit} จำนวนอย่างต่ำ ${fmtQ(it.code, st.pol.rop)} ${st.activeJobs.length ? `มีงานค้าง ${st.activeJobs.length} งาน` : ''}`,
        action: make ? `เปิดงาน${it.lane === 'ผลิต' ? 'ผลิต' : 'แปรรูป'} ${fmtQ(it.code, st.suggestQty)}` : `สั่งซื้อ ${fmtQ(it.code, st.suggestQty)} จาก${S.base.suppliers.find((s) => s.supplier_id === it.supplier_id)?.name || 'ผู้ขาย'}`,
        sort: st.cover / 100,
      });
    }
  }
  for (const e of D.expiries) {
    A.push({
      level: e.level, kind: 'expiry', topic: 'วันหมดอายุ', item: e.it.code,
      title: e.daysLeft <= 0 ? `${e.it.name} ล็อต ${e.lot.lot_no} หมดอายุแล้ว` : `${e.it.name} ล็อต ${e.lot.lot_no} หมดอายุใน ${e.daysLeft} วัน`,
      detail: `คงเหลือ ${fmtQ(e.it.code, e.lot.qty_left)} หมดอายุ ${thaiDate(e.lot.exp_date)}`,
      action: e.daysLeft <= 0 ? 'ย้ายออกจากของที่ใช้ได้ แยกเก็บรอทำลาย' : 'ให้เบิกล็อตนี้ก่อน ตามหลักหมดอายุก่อนจ่ายก่อน', sort: e.daysLeft / 1000,
    });
  }
  for (const q of D.qcQueue) {
    if (q.waiting <= CONFIG.qcWaitWarnDays) continue;
    A.push({ level: 'warn', kind: 'qc', topic: 'รอปล่อยผ่าน', item: q.it.code, title: `${q.it.name} ล็อต ${q.lot.lot_no} รอปล่อยผ่าน ${q.waiting} วัน`, detail: `เกินเกณฑ์ ${CONFIG.qcWaitWarnDays} วัน ของยังเบิกไม่ได้จนกว่าหัวหน้าฝ่ายควบคุมคุณภาพจะปล่อยผ่าน`, action: 'ตามผลตรวจ', sort: 1 / q.waiting });
  }
  for (const c of D.board) {
    if (!c.blocked) continue;
    A.push({ level: 'crit', kind: 'blocked', topic: 'งานหยุด', item: c.it.code, title: `งาน ${c.job.job_id} ${c.it.name} หยุดรอ${c.blocked}`, detail: `วัตถุดิบไม่พอเบิกตามสูตร จึงยังเริ่มผลิตไม่ได้`, action: 'ดูบอร์ดงาน', sort: 0.001 });
  }
  const rank = { crit: 0, warn: 1, ok: 2 };
  D.alerts = A.sort((a, b) => rank[a.level] - rank[b.level] || a.sort - b.sort);
}

// ---------- รูปแบบวันที่ไทย ----------
const TH = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });
const THL = new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const thaiDate = (iso) => (iso ? TH.format(new Date(`${iso}T00:00:00Z`)) : '');
export const thaiLongDate = (iso) => THL.format(new Date(`${iso}T00:00:00Z`));
export { REQ_FORM, LANES };
