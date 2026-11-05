// โหลดข้อมูลจำลอง เลื่อนวันที่ให้ตรงวันนี้ เล่นเหตุการณ์ที่ผู้ใช้ทดลองกรอก แล้วคำนวณสถานะทั้งหมด
// ทุกการกรอกเป็นเหตุการณ์ต่อท้าย (ไม่แก้ของเก่า) การแก้ไขและการลบก็เป็นเหตุการณ์ที่มีเหตุผล ฉบับเดิมยังอยู่ในประวัติเสมอ
import { CONFIG, LANES, STAGE_OWNER, REQ_FORM, PROC_STEPS, ROOMS } from './config.js';
import { meanSd, policy, onTimeProbability, onTimeVerdict, expiryLevel } from './logic.js';

const FILES = ['items', 'herbs', 'bom', 'suppliers', 'customers', 'staff', 'lots', 'moves', 'purchase_orders', 'jobs', 'job_inputs', 'releases', 'qc_results', 'invoices', 'invoice_lines', 'shortages', 'assets', 'maintenance', 'purchase_requests'];
const DATE_FIELDS = {
  lots: ['date_in', 'exp_date', 'release_date'], moves: ['date'], purchase_orders: ['order_date', 'quoted_date', 'received_date'],
  jobs: ['created_date', 'start_date', 'end_date', 'release_date'], releases: ['date'], qc_results: ['date'], invoices: ['date', 'due_date', 'paid_date'], shortages: ['date'],
  maintenance: ['date'], purchase_requests: ['requested', 'head_ok', 'dir_ok', 'ordered', 'received', 'inspected', 'pay_requested', 'paid'],
};
const NUM_FIELDS = {
  lots: ['qty_in', 'qty_left'], moves: ['qty'], purchase_orders: ['qty'], jobs: ['qty'], job_inputs: ['qty'], invoices: ['total'],
  invoice_lines: ['qty', 'price', 'amount'], items: ['shelf_days', 'batch_or_pack', 'price', 'cost', 'csl', 'loss_pct', 'pack_loss_pct'], suppliers: ['quoted_lead_days'],
  customers: ['credit_days'], bom: ['qty_per_unit'], shortages: ['qty_short'], assets: ['year', 'pm_days', 'cal_days'], purchase_requests: ['qty', 'unit_cost', 'amount'],
};
// ทะเบียนที่แก้ไขได้ และคอลัมน์ที่เป็นกุญแจ
export const MASTER = { suppliers: 'supplier_id', customers: 'customer_id', items: 'code', assets: 'asset_id' };
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
export function fyOf(iso) { const [y, m] = iso.split('-').map(Number); return (m >= 10 ? y + 1 : y) + 543; }
const UNIT_INT = new Set(['ใบ', 'หลอด', 'ขวด', 'เม็ด', 'ชุด', 'ผืน', 'ดวง', 'ลูก', 'กล่อง', 'ตลับ', 'กระปุก']);
export const isIntUnit = (u) => UNIT_INT.has(u);

function store(get, set) {
  try { if (set === undefined) return JSON.parse(localStorage.getItem(get) || 'null'); localStorage.setItem(get, JSON.stringify(set)); } catch { /* เบราว์เซอร์ไม่ให้เก็บ ใช้ต่อได้แต่ไม่จำ */ }
  return null;
}

// ---------- สถานะของเว็บ ----------
export const S = {
  today: localISO(), shift: 0, meta: null, base: null, orig: null, events: [], user: 'U00',
  items: new Map(), lots: [], lotMap: new Map(), moves: [], pos: [], jobs: [], releases: [], stageOverride: new Map(),
  invoices: [], invoiceLines: [], qcResults: new Map(), prs: [], maint: [], notes: [], noteReads: new Map(), evState: new Map(),
  bom: [], bomVer: new Map(),
};

export async function loadAll() {
  const out = {};
  // โหลดซ้ำอีก 2 ครั้งถ้าเครือข่ายสะดุด
  const get = async (url, tries = 3) => {
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`โหลด ${url} ไม่ได้ (${r.status})`);
      return r;
    } catch (err) {
      if (tries <= 1) throw err;
      await new Promise((ok) => setTimeout(ok, 400));
      return get(url, tries - 1);
    }
  };
  await Promise.all(FILES.map(async (f) => { out[f] = parseCSV(await (await get(`data/${f}.csv`)).text()); }));
  S.meta = await (await get('data/meta.json')).json();
  S.shift = daysBetween(S.meta.base_date, S.today);
  for (const [t, cols] of Object.entries(DATE_FIELDS)) for (const r of out[t]) for (const c of cols) if (r[c]) r[c] = addDays(r[c], S.shift);
  for (const [t, cols] of Object.entries(NUM_FIELDS)) for (const r of out[t]) for (const c of cols) if (r[c] !== '' && r[c] !== undefined) r[c] = Number(r[c]);
  S.base = out;
  S.orig = Object.fromEntries(Object.keys(MASTER).map((t) => [t, out[t].map((x) => ({ ...x }))]));
  S.events = store(KEY) || [];
  S.user = store('hfd-user') || 'U00';
  if (!out.staff.some((s) => s.user_id === S.user)) S.user = 'U00';
  rebuild();
}

export function staff(id) { return S.base.staff.find((s) => s.user_id === id) || { name: id, role: '', dept: '' }; }
export const currentUser = () => staff(S.user);
export function setUser(id) { S.user = id; store('hfd-user', id); }
export const active = (row) => !!row && row.active !== 'N';
export const producing = (it) => active(it) && (it.status || 'ผลิตอยู่') === 'ผลิตอยู่';

// ---------- เหตุการณ์ ----------
export function commit(event) {
  const ev = { id: `E${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), user: S.user, ...event };
  S.events.push(ev);
  store(KEY, S.events);
  rebuild();
  return ev;
}
export function resetEvents() { S.events = []; store(KEY, []); rebuild(); }
export const eventById = (id) => S.events.find((e) => e.id === id);

// สถานะของแต่ละรายการ: ใช้อยู่ / แก้ไขแล้ว (มีฉบับใหม่) / ลบแล้ว
function eventStates(events) {
  const st = new Map(events.map((e) => [e.id, { status: 'active' }]));
  for (const e of events) if ((e.type === 'void' || e.type === 'amend') && st.has(e.target)) st.set(e.target, { status: e.type === 'void' ? 'void' : 'amended', by: e.id });
  return st;
}

// รายการที่สร้างขึ้นและรายการที่อ้างถึง ใช้ตัดสินว่าแก้หรือลบได้ไหม (ถ้ามีรายการหลังจากนี้อ้างถึง ต้องยกเลิกรายการนั้นก่อน)
const K = (p, v) => `${p}:${v}`;
function keysOf(fx) {
  const created = new Set(), touched = new Set();
  for (const l of fx.lots || []) created.add(K('lot', l.lot_no));
  for (const p of fx.newPo || []) created.add(K('po', p.po_no));
  for (const j of fx.newJobs || []) created.add(K('job', j.job_id));
  for (const v of fx.invoices || []) created.add(K('inv', v.inv_no));
  for (const r of fx.newPr || []) created.add(K('pr', r.pr_no));
  for (const n of fx.notes || []) created.add(K('note', n.id));
  for (const r of fx.qcResults || []) { created.add(K('qc', r.lot_no)); touched.add(K('lot', r.lot_no)); }
  for (const m of fx.moves || []) touched.add(K('lot', m.lot_no));
  for (const s of fx.status || []) touched.add(K('lot', s.lot_no));
  for (const r of fx.releases || []) { touched.add(K('lot', r.lot_no)); touched.add(K('qc', r.lot_no)); }
  for (const p of fx.po || []) touched.add(K('po', p.po_no));
  for (const j of fx.jobs || []) touched.add(K('job', j.job_id));
  for (const x of fx.inputs || []) { touched.add(K('lot', x.lot_no)); touched.add(K('job', x.job_id)); }
  for (const s of fx.stage || []) touched.add(K('job', s.job_id));
  for (const l of fx.invoiceLines || []) touched.add(K('inv', l.inv_no));
  for (const p of fx.paid || []) touched.add(K('inv', p.inv_no));
  for (const r of fx.prStep || []) touched.add(K('pr', r.pr_no));
  for (const r of fx.noteRead || []) touched.add(K('note', r.note));
  return { created, touched };
}
export function blockers(evId) {
  const i = S.events.findIndex((e) => e.id === evId);
  if (i < 0) return [];
  const { created } = keysOf(S.events[i].effects || {});
  if (!created.size) return [];
  const out = [];
  for (const f of S.events.slice(i + 1)) {
    if (f.type === 'void' || f.target === evId || S.evState.get(f.id)?.status !== 'active') continue;
    const { touched } = keysOf(f.effects || {});
    if ([...created].some((k) => touched.has(k))) out.push(f);
  }
  return out;
}
// คำนวณสถานะชั่วคราวโดยไม่นับรายการหนึ่ง (ใช้ตอนแก้ไข เพื่อคิดใหม่จากสถานะก่อนรายการนั้น)
export function withoutEvent(evId, fn) {
  rebuild(new Set([evId]));
  try { return fn(); } finally { rebuild(); }
}

function rebuild(exclude = null) {
  const b = S.base;
  for (const t of Object.keys(MASTER)) b[t] = S.orig[t].map((x) => ({ ...x }));
  S.items = new Map(b.items.map((x) => [x.code, x]));
  S.lots = b.lots.map((l) => ({ ...l }));
  S.moves = b.moves.slice();
  S.pos = b.purchase_orders.map((p) => ({ ...p }));
  S.jobs = b.jobs.map((j) => ({ ...j }));
  S.releases = b.releases.slice();
  S.jobInputs = b.job_inputs.slice();
  S.invoices = b.invoices.map((v) => ({ ...v }));
  S.invoiceLines = b.invoice_lines.slice();
  S.qcResults = new Map(b.qc_results.map((r) => [r.lot_no, r]));
  S.prs = b.purchase_requests.map((r) => ({ ...r }));
  S.maint = b.maintenance.slice();
  S.bom = b.bom.map((r) => ({ ...r }));
  S.bomVer = new Map();
  S.notes = [];
  S.noteReads = new Map();
  S.stageOverride = new Map();
  S.lotMap = new Map(S.lots.map((l) => [l.lot_no, l]));
  S.evState = eventStates(S.events);
  for (const ev of S.events) {
    if (ev.type === 'void' || (exclude && exclude.has(ev.id)) || S.evState.get(ev.id).status !== 'active') continue;
    apply(ev.effects || {}, ev);
  }
  S.lotsByItem = new Map();
  for (const l of S.lots) { if (!S.lotsByItem.has(l.item_code)) S.lotsByItem.set(l.item_code, []); S.lotsByItem.get(l.item_code).push(l); }
  S.movesByItem = new Map();
  for (const m of S.moves) { if (!S.movesByItem.has(m.item_code)) S.movesByItem.set(m.item_code, []); S.movesByItem.get(m.item_code).push(m); }
  compute();
}

function apply(fx, ev) {
  for (const m of fx.master || []) {
    const rows = S.base[m.table];
    const row = rows.find((r) => r[MASTER[m.table]] === m.key);
    if (row) Object.assign(row, m.patch);
    else if (m.create) { const n = { ...m.patch }; rows.push(n); if (m.table === 'items') S.items.set(n.code, n); }
  }
  for (const f of fx.formula || []) {
    const before = S.bom.filter((r) => r.out_item === f.item).map((r) => ({ ...r }));
    if (!S.bomVer.has(f.item)) S.bomVer.set(f.item, [{ v: 1, rows: before, at: '', user: '', reason: 'สูตรตั้งต้นในทะเบียน', fm40: '' }]);
    S.bom = S.bom.filter((r) => r.out_item !== f.item).concat(f.rows.map((r) => ({ out_item: f.item, in_item: r.in_item, qty_per_unit: r.qty_per_unit })));
    const vs = S.bomVer.get(f.item);
    vs.push({ v: vs.length + 1, rows: f.rows, at: ev.at, user: ev.user, reason: f.reason, fm40: f.fm40 || '', ev: ev.id });
  }
  for (const p of fx.newPo || []) S.pos.push({ ...p });
  for (const j of fx.newJobs || []) S.jobs.push({ ...j });
  for (const r of fx.newPr || []) S.prs.push({ ...r });
  for (const l of fx.lots || []) { const n = { ...l, qty_left: 0 }; S.lots.push(n); S.lotMap.set(n.lot_no, n); }
  for (const m of fx.moves || []) {
    S.moves.push(m);
    const l = S.lotMap.get(m.lot_no);
    if (l) l.qty_left = round(l.item_code, l.qty_left + (IN.has(m.type) ? m.qty : OUT.has(m.type) ? -m.qty : 0));
  }
  for (const s of fx.status || []) { const l = S.lotMap.get(s.lot_no); if (l) Object.assign(l, s); }
  for (const r of fx.releases || []) S.releases.push(r);
  for (const r of fx.qcResults || []) S.qcResults.set(r.lot_no, r);
  for (const p of fx.po || []) { const po = S.pos.find((x) => x.po_no === p.po_no); if (po) Object.assign(po, p); }
  for (const j of fx.jobs || []) { const job = S.jobs.find((x) => x.job_id === j.job_id); if (job) Object.assign(job, j.patch); }
  for (const x of fx.inputs || []) S.jobInputs.push(x);
  for (const s of fx.stage || []) S.stageOverride.set(s.job_id, s.stage);
  for (const v of fx.invoices || []) S.invoices.push({ ...v });
  for (const l of fx.invoiceLines || []) S.invoiceLines.push(l);
  for (const p of fx.paid || []) { const v = S.invoices.find((x) => x.inv_no === p.inv_no); if (v) v.paid_date = p.paid_date; }
  for (const r of fx.prStep || []) { const pr = S.prs.find((x) => x.pr_no === r.pr_no); if (pr) Object.assign(pr, r.patch); }
  for (const m of fx.maint || []) S.maint.push({ ...m });
  for (const n of fx.notes || []) S.notes.push({ ...n, at: ev.at, from: ev.user, ev: ev.id });
  for (const r of fx.noteRead || []) { if (!S.noteReads.has(r.note)) S.noteReads.set(r.note, []); S.noteReads.get(r.note).push({ user: ev.user, at: ev.at }); }
}

export function round(code, q) { const it = S.items.get(code); return it && UNIT_INT.has(it.unit) ? Math.round(q) : Math.round(q * 100) / 100; }
export const usable = (l) => l.status === 'ตรวจสอบแล้ว' && l.qty_left > 1e-9 && (!l.exp_date || l.exp_date > S.today);
export const isFG = (it) => !!it && (it.kind === 'ยารับประทาน' || it.kind === 'ยาใช้ภายนอก');
export const bomOf = (code) => S.bom.filter((r) => r.out_item === code);
export function bomVersions(code) {
  return S.bomVer.get(code) || [{ v: 1, rows: bomOf(code).map((r) => ({ in_item: r.in_item, qty_per_unit: r.qty_per_unit })), at: '', user: '', reason: 'สูตรตั้งต้นในทะเบียน', fm40: '' }];
}

// ต้นทุนต่อหน่วย (ประมาณการ): วัตถุดิบ + บรรจุภัณฑ์และฉลาก + ค่าสูญเสียคิดเป็นเงิน (เกณฑ์ผลิตและบรรจุจาก FM-35 ตามที่พี่เคาะ 2026-10-19)
// ค่าแรงและค่าโสหุ้ยไม่มีในข้อมูล ให้ผู้ใช้กรอกเอง
const PACK_KINDS = new Set(['บรรจุภัณฑ์', 'ฉลาก']);
export function costOf(code, rows = null, opt = {}) {
  const it = S.items.get(code);
  const lines = (rows || bomOf(code).map((r) => ({ in_item: r.in_item, qty_per_unit: r.qty_per_unit }))).map((r) => {
    const m = S.items.get(r.in_item);
    const unit = opt.prices && opt.prices[r.in_item] !== undefined ? Number(opt.prices[r.in_item]) : Number(m?.cost || 0);
    return { ...r, item: m, unit, amount: Number(r.qty_per_unit) * unit, pack: m ? PACK_KINDS.has(m.kind) : false };
  });
  const material = lines.filter((l) => !l.pack).reduce((t, l) => t + l.amount, 0);
  const packaging = lines.filter((l) => l.pack).reduce((t, l) => t + l.amount, 0);
  const lossPct = opt.lossPct ?? it?.loss_pct ?? 5;
  const packLossPct = opt.packLossPct ?? it?.pack_loss_pct ?? 1;
  const loss = material * lossPct / 100;
  const packLoss = packaging * packLossPct / 100;
  const other = Number(opt.other || 0);
  const total = material + packaging + loss + packLoss + other;
  return { lines, material, packaging, loss, packLoss, other, total, lossPct, packLossPct };
}

// ---------- เลขที่เอกสาร ----------
// เลขที่ผลิตและเลขรับ ตาม SOP-PD-07
export function nextLotNo(code, date = S.today) {
  const fy = fy2(date);
  if (code.startsWith('9')) {
    const n = S.lots.filter((l) => l.lot_no.startsWith(`R${fy}-`)).map((l) => Number(l.lot_no.slice(4))).reduce((a, b) => Math.max(a, b), 0);
    return `R${fy}-${String(n + 1).padStart(4, '0')}`;
  }
  const n = S.lots.filter((l) => l.item_code === code && l.lot_no.startsWith(`${code}${fy}`)).map((l) => Number(l.lot_no.slice(6))).reduce((a, b) => Math.max(a, b), 0);
  return `${code}${fy}${String(n + 1).padStart(2, '0')}`;
}
function nextSeq(list, prefix, width) {
  const n = list.filter((x) => x.startsWith(prefix)).map((x) => Number(x.slice(prefix.length))).filter(Number.isFinite).reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(n + 1).padStart(width, '0')}`;
}
export const nextPoNo = () => nextSeq(S.pos.map((p) => p.po_no), `PO${fy2(S.today)}-`, 3);
export const nextJobId = () => nextSeq(S.jobs.map((j) => j.job_id), `J${fy2(S.today)}-`, 3);
export const nextInvNo = () => nextSeq(S.invoices.map((v) => v.inv_no), `IV${fy2(S.today)}-`, 4);
export const nextPrNo = () => nextSeq(S.prs.map((r) => r.pr_no), `ขซ${fy2(S.today)}-`, 3);
export const nextAssetId = () => nextSeq(S.base.assets.map((a) => a.asset_id), 'EQ-', 2);
let moveSeq = 0;
export function newMove(o) { moveSeq += 1; return { move_id: `W${Date.now().toString(36)}${moveSeq}`, date: S.today, user_id: S.user, ...o }; }

// ---------- คำนวณสถานะทั้งหมด ----------
export const D = { itemStats: new Map(), alerts: [], board: [], qcQueue: [], expiries: [], overdue: [], assetDue: [], prOpen: [] };

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

// คาดการณ์ใบสั่งซื้อใหม่ก่อนกดบันทึก: จะถึงเมื่อไร ทันก่อนของหมดไหม
export function poForecast(itemCode, supplierId, orderDate = S.today) {
  const st = D.itemStats.get(itemCode);
  const sl = supplierLead(supplierId, itemCode);
  const expected = addDays(orderDate, Math.round(sl.L));
  const prob = st && st.stockoutDate ? onTimeProbability({ daysFromOrderToStockout: daysBetween(orderDate, st.stockoutDate), L: sl.L, sL: sl.sL }) : 1;
  return { sl, expected, prob, verdict: onTimeVerdict(prob, st ? st.target : CONFIG.cslOther), stockoutDate: st ? st.stockoutDate : null };
}

function usageStats(code) {
  const W = CONFIG.demandWindowDays;
  const from = addDays(S.today, -W);
  const perDay = new Map();
  for (const m of S.movesByItem.get(code) || []) if (m.type === 'จ่าย' && m.date > from && m.date <= S.today) perDay.set(m.date, (perDay.get(m.date) || 0) + m.qty);
  const xs = [];
  for (let i = W - 1; i >= 0; i--) xs.push(perDay.get(addDays(S.today, -i)) || 0);
  return meanSd(xs);
}
// ยอดเบิกรายเดือนย้อนหลัง n เดือนเต็ม (ไม่นับเดือนปัจจุบัน) เรียงเก่าไปใหม่
export function monthlyUsage(code, n = 12) {
  const [y, m] = S.today.split('-').map(Number);
  const keys = [];
  for (let i = n; i >= 1; i--) keys.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  const sum = new Map(keys.map((k) => [k, 0]));
  for (const mv of S.movesByItem.get(code) || []) { if (mv.type !== 'จ่าย') continue; const k = mv.date.slice(0, 7); if (sum.has(k)) sum.set(k, sum.get(k) + mv.qty); }
  return keys.map((k) => ({ month: k, qty: sum.get(k) }));
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

// ขั้นตอนถัดไปของใบขอซื้อ (ขั้นแรกที่ยังไม่มีวันที่) และวันที่ของขั้นล่าสุด
export function prStage(pr) {
  if (pr.rejected) return { key: 'rejected', title: 'ไม่อนุมัติ', idx: -1, since: pr.rejected };
  let since = pr.requested;
  for (let i = 0; i < PROC_STEPS.length; i++) { const st = PROC_STEPS[i]; if (!pr[st.key]) return { key: st.key, title: st.title, idx: i, since }; since = pr[st.key]; }
  return { key: 'done', title: 'จ่ายเงินแล้ว', idx: PROC_STEPS.length, since };
}

// วันครบกำหนดบำรุงรักษาและสอบเทียบของเครื่องมือ (จากบันทึก FM-08 ล่าสุด)
export function assetDue(a) {
  const last = (type) => S.maint.filter((m) => m.asset_id === a.asset_id && m.type === type).reduce((x, m) => (!x || m.date > x ? m.date : x), '');
  const lastPm = last('บำรุงรักษาตามแผน');
  const lastCal = last('สอบเทียบ');
  const nextPm = a.pm_days ? (lastPm ? addDays(lastPm, a.pm_days) : S.today) : '';
  const nextCal = a.cal_days ? (lastCal ? addDays(lastCal, a.cal_days) : S.today) : '';
  return { lastPm, lastCal, nextPm, nextCal, pmLeft: nextPm ? daysBetween(S.today, nextPm) : null, calLeft: nextCal ? daysBetween(S.today, nextCal) : null };
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
      if (lv && lv !== 'ok') D.expiries.push({ lot: l, it, daysLeft: left, level: lv === 'expired' ? 'crit' : lv, usePerDay: u.mean });
    }
  }
  D.expiries.sort((a, b) => a.daysLeft - b.daysLeft);

  D.qcQueue = S.lots.filter((l) => l.status === 'รอปล่อยผ่าน' && l.qty_left > 0)
    .map((l) => ({ lot: l, it: S.items.get(l.item_code), waiting: daysBetween(l.date_in, today), job: S.jobs.find((j) => j.out_lot === l.lot_no), result: S.qcResults.get(l.lot_no) || null }))
    .sort((a, b) => b.waiting - a.waiting);

  D.board = S.jobs.filter((j) => j.status !== 'done' || (j.release_date && daysBetween(j.release_date, today) <= CONFIG.boardDoneDays))
    .map((j) => {
      const stage = stageOf(j);
      const it = S.items.get(j.item_code);
      const since = stage === 'รอปล่อยผ่าน' ? (j.end_date || j.created_date) : stage === 'ตรวจสอบแล้ว' ? j.release_date : (j.start_date || j.created_date);
      return { job: j, it, stage, owner: staff(STAGE_OWNER[stage]), days: since ? Math.max(0, daysBetween(since, today)) : 0, blocked: j.status === 'waiting' && j.wait_reason ? j.wait_reason : '' };
    });

  // ลูกหนี้เกินกำหนดชำระ รายลูกค้า
  const byCust = new Map();
  for (const v of S.invoices) {
    if (v.paid_date || v.due_date >= today || v.date > today) continue;
    const x = byCust.get(v.customer_id) || { customer: S.base.customers.find((c) => c.customer_id === v.customer_id), amount: 0, count: 0, oldest: null };
    x.amount += v.total; x.count += 1;
    if (!x.oldest || v.due_date < x.oldest.due_date) x.oldest = v;
    byCust.set(v.customer_id, x);
  }
  D.overdue = [...byCust.values()].map((x) => ({ ...x, days: daysBetween(x.oldest.due_date, today) })).sort((a, b) => b.amount - a.amount);

  // เครื่องมือ และใบขอซื้อที่ยังไม่จบ
  D.assetDue = S.base.assets.filter((a) => a.status !== 'เลิกใช้' && active(a)).map((a) => ({ a, ...assetDue(a) }));
  D.prOpen = S.prs.map((r) => ({ r, st: prStage(r) })).filter((x) => x.st.key !== 'done' && x.st.key !== 'rejected');

  buildAlerts();
}

// ---------- แจ้งเตือนแยกฝ่าย ----------
const laneRoom = (lane) => (lane === 'ผลิต' ? 'prod' : 'process');
const ownerRoom = (id) => { const d = staff(id).dept; return d === 'ฝ่ายแปรรูปสมุนไพร' ? 'process' : d === 'ฝ่ายผลิต' ? 'prod' : d === 'ฝ่ายควบคุมคุณภาพ' ? 'qc' : 'store'; };
function fmtQ(code, q) { const it = S.items.get(code); const n = it && UNIT_INT.has(it.unit) ? Math.round(q) : Math.round(q * 10) / 10; return `${n.toLocaleString('th-TH')} ${it ? it.unit : ''}`; }
const thb = (n) => `${Math.round(n).toLocaleString('th-TH')} บาท`;

function buildAlerts() {
  const A = [];
  for (const st of D.itemStats.values()) {
    const { it } = st;
    if (!active(it) || (isFG(it) && !producing(it))) continue;
    const days = Math.max(0, Math.floor(st.cover));
    for (const v of st.poViews) {
      if (v.verdict.level === 'ok') continue;
      const sup = v.sl.supplier;
      let actionText = `โทรเร่ง${sup.name}`;
      let go = `store?tab=buy&po=${encodeURIComponent(v.po.po_no)}`;
      const backup = it.backup_supplier_id ? S.base.suppliers.find((s) => s.supplier_id === it.backup_supplier_id) : null;
      if (backup && v.verdict.level === 'crit') {
        const bl = supplierLead(backup.supplier_id, it.code);
        const bExp = addDays(S.today, Math.round(bl.L));
        if (bExp < v.expected) {
          const gap = Math.max(0, daysBetween(S.today, v.expected)) * st.u.mean + st.pol.ss - (st.released + st.quarantine);
          const pack = it.batch_or_pack || 1;
          const q = Math.max(pack, Math.ceil(gap / pack) * pack);
          actionText = `ขอซื้อเพิ่มจาก${backup.name} ${fmtQ(it.code, q)} ถึงราว ${thaiDate(bExp)}`;
          go = `store?tab=buy&new=1&item=${it.code}&sup=${backup.supplier_id}&qty=${q}`;
        } else {
          actionText = `โทรเร่งผู้ขายเดิม ผู้ขายสำรองส่งเฉลี่ย ${Math.round(bl.L)} วัน ช้ากว่าใบนี้`;
        }
      }
      A.push({
        level: v.verdict.level, kind: 'supply', item: it.code, rooms: ['store'],
        title: `${it.name} ${days <= 0 ? 'หมดวันนี้' : `จะขาดใน ${days} วัน`}`,
        stamp: v.verdict.text,
        stub: { k: 'โอกาสทัน', n: `${Math.round(v.prob * 100)}%`, ref: v.po.po_no },
        fields: [['สั่งเมื่อ', thaiDate(v.po.order_date)], ['ผู้ขายส่งเฉลี่ย', `${Math.round(v.sl.L)} ±${Math.round(v.sl.sL)} วัน`], ['ของหมด', thaiDate(st.stockoutDate)], ['คาดถึง', thaiDate(v.expected)]],
        detail: `${v.po.po_no} ${sup.name} คาดถึง ${thaiDate(v.expected)}${v.lateDays > 0 ? ` ช้ากว่าวันที่ของหมด ${v.lateDays} วัน` : ''} โอกาสทัน ${Math.round(v.prob * 100)}%`,
        actionText, go, timeline: { order: v.po.order_date, stockout: st.stockoutDate, expected: v.expected }, sort: v.prob,
      });
    }
    if (st.poViews.length === 0 && st.u.mean > 0 && st.position <= st.pol.rop) {
      const make = it.make !== 'buy';
      const level = st.released <= st.pol.ss ? 'crit' : 'warn';
      if (make) {
        const room = laneRoom(it.lane);
        A.push({
          level, kind: 'reorder', item: it.code, rooms: isFG(it) ? [room, 'sales'] : [room],
          title: `${it.name} ${days <= 0 ? 'หมดวันนี้' : `พอจ่ายอีก ${days} วัน`}`,
          stamp: 'ต้องผลิตเพิ่ม',
          stub: { k: 'พอใช้อีก', n: String(days), u: 'วัน', ref: it.code },
          fields: [['ตรวจสอบแล้ว', fmtQ(it.code, st.released)], ['ใช้ต่อวัน', fmtQ(it.code, st.u.mean)], ['จำนวนอย่างต่ำ', fmtQ(it.code, st.pol.rop)], ['งานค้าง', `${st.activeJobs.length} งาน`]],
          detail: `คงคลังตรวจสอบแล้ว ${fmtQ(it.code, st.released)} จำนวนอย่างต่ำ ${fmtQ(it.code, st.pol.rop)}`,
          actionText: `เปิดงาน${it.lane === 'ผลิต' ? 'ผลิต' : 'แปรรูป'} ${fmtQ(it.code, st.suggestQty)}`,
          go: `${room}?tab=new&item=${it.code}&qty=${st.suggestQty}`, sort: st.cover / 100,
        });
      } else {
        const sup = S.base.suppliers.find((s) => s.supplier_id === it.supplier_id);
        if (S.prs.some((r) => r.item_code === it.code && !r.ordered && !r.rejected)) continue;
        A.push({
          level, kind: 'reorder', item: it.code, rooms: ['store'],
          title: `${it.name} ถึงจำนวนอย่างต่ำแล้ว`,
          stamp: level === 'crit' ? 'ของจะขาด' : 'ถึงจุดสั่งซื้อ',
          stub: { k: 'คงคลัง', n: Math.round(st.released).toLocaleString('th-TH'), u: it.unit, ref: it.code },
          fields: [['จำนวนอย่างต่ำ', fmtQ(it.code, st.pol.rop)], ['แนะนำสั่ง', fmtQ(it.code, st.suggestQty)], ['ผู้ขาย', sup ? sup.name : '-'], ['ส่งเฉลี่ย', `${Math.round(st.lt.L)} วัน`]],
          detail: `คงคลังตรวจสอบแล้ว ${fmtQ(it.code, st.released)} จำนวนอย่างต่ำ ${fmtQ(it.code, st.pol.rop)} แนะนำสั่ง ${fmtQ(it.code, st.suggestQty)}`,
          actionText: `เขียนใบขอซื้อ ${fmtQ(it.code, st.suggestQty)}`,
          go: `store?tab=buy&new=1&item=${it.code}&qty=${st.suggestQty}`, sort: st.cover / 100,
        });
      }
    }
  }
  for (const e of D.expiries) {
    const expired = e.daysLeft <= 0;
    const waste = e.usePerDay > 0 ? Math.max(0, e.lot.qty_left - e.usePerDay * Math.max(0, e.daysLeft)) : e.lot.qty_left;
    A.push({
      level: e.level, kind: 'expiry', item: e.it.code, lot: e.lot.lot_no, rooms: isFG(e.it) ? ['store', 'sales'] : ['store'],
      title: expired ? `${e.it.name} ล็อต ${e.lot.lot_no} หมดอายุแล้ว` : `${e.it.name} ล็อต ${e.lot.lot_no} ${e.daysLeft === 0 ? 'หมดอายุวันนี้' : `หมดอายุใน ${e.daysLeft} วัน`}`,
      stamp: expired ? 'หมดอายุแล้ว' : 'ใกล้หมดอายุ',
      stub: expired ? { k: 'หมดอายุมาแล้ว', n: String(-e.daysLeft), u: 'วัน', ref: e.lot.lot_no } : { k: 'หมดอายุใน', n: String(e.daysLeft), u: 'วัน', ref: e.lot.lot_no },
      fields: [['คงเหลือ', fmtQ(e.it.code, e.lot.qty_left)], ['หมดอายุ', thaiDate(e.lot.exp_date)], ['ใช้ต่อวัน', e.usePerDay > 0 ? fmtQ(e.it.code, e.usePerDay) : 'ไม่มีการเบิก'], ['ใช้ไม่ทัน', waste > 0.05 ? `ราว ${fmtQ(e.it.code, waste)}` : 'ใช้ทัน']],
      detail: `คงเหลือ ${fmtQ(e.it.code, e.lot.qty_left)} หมดอายุ ${thaiDate(e.lot.exp_date)}`,
      actionText: expired ? 'แยกเก็บรอทำลาย ดูบัตรคุม' : 'เบิกล็อตนี้ก่อน ตามหลักหมดอายุก่อนจ่ายก่อน',
      go: expired ? `store?tab=card&item=${e.it.code}` : `store?tab=issue&item=${e.it.code}`, sort: e.daysLeft / 1000,
    });
  }
  for (const q of D.qcQueue) {
    if (q.waiting <= CONFIG.qcWaitWarnDays) continue;
    A.push({
      level: 'warn', kind: 'qc', item: q.it.code, lot: q.lot.lot_no, rooms: ['qc'],
      title: `${q.it.name} รอปล่อยผ่าน ${q.waiting} วัน`,
      stamp: 'รอนาน',
      stub: { k: 'รอมาแล้ว', n: String(q.waiting), u: 'วัน', ref: q.lot.lot_no },
      fields: [['เลขที่', q.lot.lot_no], ['จำนวน', fmtQ(q.it.code, q.lot.qty_left)], ['ผลตรวจ', q.result ? `${q.result.result} รออนุมัติ` : 'ยังไม่บันทึก'], ['เกณฑ์', `ไม่เกิน ${CONFIG.qcWaitWarnDays} วัน`]],
      detail: `เกินเกณฑ์ ${CONFIG.qcWaitWarnDays} วัน ของยังเบิกไม่ได้จนกว่าหัวหน้าฝ่ายควบคุมคุณภาพจะปล่อยผ่าน`,
      actionText: q.result ? 'อนุมัติปล่อยผ่าน' : 'ตามผลตรวจ',
      go: `qc?lot=${encodeURIComponent(q.lot.lot_no)}`, sort: 1 / q.waiting,
    });
  }
  for (const c of D.board) {
    if (!c.blocked) continue;
    const mat = [...S.items.values()].find((x) => x.name === c.blocked);
    const ms = mat && D.itemStats.get(mat.code);
    const next = ms && ms.poViews.slice().sort((a, b) => a.expected.localeCompare(b.expected))[0];
    const room = laneRoom(c.job.lane);
    A.push({
      level: 'crit', kind: 'blocked', item: c.it.code, job: c.job.job_id, rooms: [room],
      title: `${c.it.name} หยุดรอ${c.blocked}`,
      stamp: 'หยุดรอของ',
      stub: { k: 'หยุดมาแล้ว', n: String(c.days), u: 'วัน', ref: c.job.job_id },
      fields: [['รอ', c.blocked], ['ของจะมา', next ? `${thaiDate(next.expected)} ${next.po.po_no}` : 'ยังไม่มีใบสั่งซื้อ'], ['จำนวนผลิต', fmtQ(c.it.code, c.job.qty)], ['ผู้ถืองาน', c.owner.name.replace(' (สมมุติ)', '')]],
      detail: 'วัตถุดิบไม่พอเบิกตามสูตร จึงยังเริ่มผลิตไม่ได้',
      actionText: 'ดูงานบนบอร์ด', go: `${room}?tab=board&job=${encodeURIComponent(c.job.job_id)}`, sort: 0.001,
    });
  }
  for (const o of D.overdue) {
    A.push({
      level: o.days >= CONFIG.arCritDays ? 'crit' : 'warn', kind: 'ar', customer: o.customer.customer_id, rooms: ['sales'],
      title: `${o.customer.name} ค้างเกินกำหนด ${thb(o.amount)}`,
      stamp: 'เกินกำหนด',
      stub: { k: 'เกินกำหนด', n: String(o.days), u: 'วัน', ref: o.oldest.inv_no },
      fields: [['ยอดเกินกำหนด', thb(o.amount)], ['จำนวนใบ', `${o.count} ใบ`], ['ใบเก่าสุดครบกำหนด', thaiDate(o.oldest.due_date)], ['เครดิต', `${o.customer.credit_days} วัน`]],
      detail: `${o.count} ใบ ใบเก่าสุด ${o.oldest.inv_no} ครบกำหนด ${thaiDate(o.oldest.due_date)}`,
      actionText: 'ดูใบค้างและบันทึกรับชำระ', go: `sales?tab=ar&cust=${o.customer.customer_id}`, sort: 1 / (o.amount + 1),
    });
  }
  // เครื่องมือ: สอบเทียบ บำรุงรักษา และเครื่องชำรุด (แผน SOP-MH-00 และ PR-02 บันทึกใน FM-08)
  for (const x of D.assetDue) {
    const room = ownerRoom(x.a.owner_id);
    const push = (level, stampText, k, n, title) => A.push({
      level, kind: 'asset', asset: x.a.asset_id, rooms: [room], title, stamp: stampText,
      stub: { k, n: String(n), u: 'วัน', ref: x.a.asset_id },
      fields: [['เครื่อง', x.a.name], ['ห้อง', x.a.room], ['ผู้รับผิดชอบ', staff(x.a.owner_id).name.replace(' (สมมุติ)', '')], ['สถานะ', x.a.status]],
      detail: `${x.a.asset_id} ${x.a.room}`, actionText: 'ดูทะเบียนและบันทึก FM-08', go: `registers?tab=assets&id=${x.a.asset_id}`, sort: n / 1000,
    });
    if (x.a.status === 'ชำรุด') { const rep = S.maint.filter((m) => m.asset_id === x.a.asset_id && m.type === 'ซ่อม').map((m) => m.date).sort().pop(); push('warn', 'ชำรุด', 'แจ้งซ่อมมาแล้ว', rep ? Math.max(0, daysBetween(rep, S.today)) : 0, `${x.a.name} ชำรุด ${x.a.note || ''}`.trim()); }
    if (x.calLeft !== null && x.calLeft <= CONFIG.calWarnDays) push(x.calLeft < 0 ? 'crit' : 'warn', x.calLeft < 0 ? 'เกินกำหนดสอบเทียบ' : 'ใกล้สอบเทียบ', x.calLeft < 0 ? 'เกินกำหนดมาแล้ว' : 'ครบสอบเทียบใน', Math.abs(x.calLeft), `${x.a.name} ${x.calLeft < 0 ? `เกินกำหนดสอบเทียบ ${-x.calLeft} วัน` : (x.calLeft === 0 ? 'ครบกำหนดสอบเทียบวันนี้' : `ครบกำหนดสอบเทียบใน ${x.calLeft} วัน`)}`);
    if (x.pmLeft !== null && x.pmLeft <= CONFIG.pmWarnDays && x.a.status === 'ใช้งาน') push(x.pmLeft < 0 ? 'crit' : 'warn', x.pmLeft < 0 ? 'เกินกำหนดบำรุงรักษา' : 'ใกล้บำรุงรักษา', x.pmLeft < 0 ? 'เกินกำหนดมาแล้ว' : 'ครบบำรุงรักษาใน', Math.abs(x.pmLeft), `${x.a.name} ${x.pmLeft < 0 ? `เกินกำหนดบำรุงรักษา ${-x.pmLeft} วัน` : (x.pmLeft === 0 ? 'ครบกำหนดบำรุงรักษาวันนี้' : `ครบกำหนดบำรุงรักษาใน ${x.pmLeft} วัน`)}`);
  }
  // ใบขอซื้อรอเห็นชอบหรือรออนุมัติ
  for (const stKey of ['head_ok', 'dir_ok']) {
    const xs = D.prOpen.filter((x) => x.st.key === stKey);
    if (!xs.length) continue;
    const oldest = Math.max(...xs.map((x) => daysBetween(x.st.since, S.today)));
    const step = PROC_STEPS.find((s) => s.key === stKey);
    A.push({
      level: 'warn', kind: 'proc', rooms: ['store'],
      title: `ใบขอซื้อรอ${step.title} ${xs.length} ใบ`,
      stamp: stKey === 'head_ok' ? 'รอเห็นชอบ' : 'รออนุมัติ',
      stub: { k: 'รอ', n: String(xs.length), u: 'ใบ', ref: '' },
      fields: [['ขั้นตอน', step.title], ['ผู้ทำขั้นนี้', step.who], ['รอนานสุด', `${oldest} วัน`], ['ยอดรวม', thb(xs.reduce((t, x) => t + x.r.amount, 0))]],
      detail: `${xs.length} ใบ รอนานสุด ${oldest} วัน`, actionText: 'เปิดรายการจัดซื้อ', go: `store?tab=buy&step=${stKey}`, sort: 1 / (oldest + 1),
    });
  }
  // เรียงวิกฤตก่อน แล้วเรื่องที่หยุดสายการผลิตก่อนเรื่องเงิน
  const rank = { crit: 0, warn: 1, ok: 2 };
  const kind = { blocked: 0, supply: 1, expiry: 2, asset: 3, reorder: 4, qc: 5, proc: 6, ar: 7 };
  D.alerts = A.sort((a, b) => rank[a.level] - rank[b.level] || kind[a.kind] - kind[b.kind] || a.sort - b.sort);
}
export const roomAlerts = (room) => (room === 'overview' ? D.alerts : D.alerts.filter((a) => a.rooms.includes(room)));

// โน้ตถึงฝ่ายที่ผู้ใช้ยังไม่ได้เปิดอ่าน
export function myRooms(user = S.user) { const role = staff(user).role; return new Set(ROOMS.filter((r) => r.roles.includes(role)).map((r) => r.id)); }
export function inboxOf(user = S.user) { const rooms = myRooms(user); return S.notes.filter((n) => n.from !== user && (n.to_user === user || rooms.has(n.to_room))); }
export const isRead = (n, user = S.user) => (S.noteReads.get(n.id) || []).some((r) => r.user === user);
export const unreadNotes = (user = S.user) => inboxOf(user).filter((n) => !isRead(n, user));

// ---------- รูปแบบวันที่ไทย ----------
const TH = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });
const THL = new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const THF = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const thaiDate = (iso) => (iso ? TH.format(new Date(`${iso}T00:00:00Z`)) : '');
export const thaiLongDate = (iso) => THL.format(new Date(`${iso}T00:00:00Z`));
export const thaiFullDate = (iso) => (iso ? THF.format(new Date(`${iso}T00:00:00Z`)) : '');
export { REQ_FORM, LANES };
