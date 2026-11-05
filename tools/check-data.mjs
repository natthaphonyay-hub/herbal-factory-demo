// ทีมตรวจข้อมูล: ตรวจว่าข้อมูลจำลองไม่ขัดกันเอง ก่อนขึ้นเว็บทุกครั้ง
// วิธีรัน: node tools/check-data.mjs   (ผ่านทุกข้อ = exit 0)

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1 || r[0] !== '').map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
const load = (n) => parseCSV(readFileSync(join(DIR, `${n}.csv`), 'utf8'));
const meta = JSON.parse(readFileSync(join(DIR, 'meta.json'), 'utf8'));
const T = Object.fromEntries(['items', 'lots', 'moves', 'purchase_orders', 'jobs', 'job_inputs', 'releases', 'invoices', 'invoice_lines', 'suppliers', 'customers', 'staff', 'bom'].map((n) => [n, load(n)]));

const results = [];
const check = (name, problems) => results.push({ name, ok: problems.length === 0, problems });
const items = new Map(T.items.map((x) => [x.code, x]));
const lots = new Map(T.lots.map((x) => [x.lot_no, x]));
const base = meta.base_date;
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const IN = new Set(['รับ', 'ยกมา']);
const OUT = new Set(['จ่าย', 'ตัดจ่ายหมดอายุ', 'ทำลาย', 'ส่งคืนผู้ขาย']);

// 1 การอ้างถึงกัน
{
  const p = [];
  for (const l of T.lots) if (!items.has(l.item_code)) p.push(`ล็อต ${l.lot_no} อ้างรหัส ${l.item_code} ที่ไม่มี`);
  for (const m of T.moves) {
    const l = lots.get(m.lot_no);
    if (!l) p.push(`${m.move_id} อ้างล็อต ${m.lot_no} ที่ไม่มี`);
    else if (l.item_code !== m.item_code) p.push(`${m.move_id} รหัสไม่ตรงกับล็อต`);
  }
  for (const x of T.job_inputs) if (!lots.has(x.lot_no)) p.push(`วัตถุดิบของงาน ${x.job_id} อ้างล็อตที่ไม่มี`);
  for (const x of T.invoice_lines) if (!lots.has(x.lot_no)) p.push(`ใบส่งของ ${x.inv_no} อ้างล็อตที่ไม่มี`);
  const sup = new Set(T.suppliers.map((s) => s.supplier_id));
  for (const x of T.purchase_orders) if (!sup.has(x.supplier_id)) p.push(`${x.po_no} อ้างผู้ขายที่ไม่มี`);
  const cus = new Set(T.customers.map((c) => c.customer_id));
  for (const x of T.invoices) if (!cus.has(x.customer_id)) p.push(`${x.inv_no} อ้างลูกค้าที่ไม่มี`);
  for (const j of T.jobs) if (j.out_lot && !lots.has(j.out_lot)) p.push(`${j.job_id} อ้างล็อตผลผลิตที่ไม่มี`);
  check('การอ้างถึงกันครบ (ทุกรหัส ทุกล็อต ทุกผู้ขาย มีอยู่จริง)', p);
}

// 2 บัญชีคุมแต่ละล็อตลงกัน และไม่ติดลบระหว่างทาง
const byLot = new Map();
for (const m of T.moves) { if (!byLot.has(m.lot_no)) byLot.set(m.lot_no, []); byLot.get(m.lot_no).push(m); }
{
  const p = [];
  for (const l of T.lots) {
    const ms = (byLot.get(l.lot_no) || []).slice().sort((a, b) => a.date.localeCompare(b.date) || a.move_id.localeCompare(b.move_id));
    let bal = 0, rec = 0;
    for (const m of ms) {
      const q = Number(m.qty);
      if (IN.has(m.type)) { bal += q; rec += q; } else if (OUT.has(m.type)) bal -= q;
      if (bal < -0.011) { p.push(`${l.lot_no} ยอดติดลบวันที่ ${m.date}`); break; }
    }
    if (Math.abs(rec - Number(l.qty_in)) > 0.011) p.push(`${l.lot_no} ยอดรับ ${rec} ไม่ตรงทะเบียนล็อต ${l.qty_in}`);
    if (Math.abs(bal - Number(l.qty_left)) > 0.011) p.push(`${l.lot_no} คงเหลือคำนวณ ${bal.toFixed(2)} ไม่ตรง ${l.qty_left}`);
  }
  check('บัญชีคุมรายล็อตลงกัน (รับ ลบ จ่าย = คงเหลือ) และไม่ติดลบ', p);
}

// 3 จ่ายได้เฉพาะของที่ปล่อยผ่านแล้วและยังไม่หมดอายุ
{
  const p = [];
  for (const m of T.moves) {
    if (m.type !== 'จ่าย') continue;
    const l = lots.get(m.lot_no);
    if (!l.release_date || m.date < l.release_date) p.push(`${m.move_id} จ่ายล็อต ${l.lot_no} ก่อนปล่อยผ่าน`);
    if (l.status === 'ไม่ผ่าน') p.push(`${m.move_id} จ่ายล็อตที่ไม่ผ่าน`);
    if (l.exp_date && m.date >= l.exp_date) p.push(`${m.move_id} จ่ายล็อตหมดอายุ ${l.lot_no}`);
  }
  check('จ่ายเฉพาะล็อตที่ตรวจสอบแล้ว และยังไม่หมดอายุ (ระเบียบ V8.9 ข้อ 77, WHO TRS 1025 ภาคผนวก 7 ข้อ 12.17)', p);
}

// 4 จ่ายตามหลักหมดอายุก่อนจ่ายก่อน
{
  const p = [];
  const skip = new Set(meta.scenario?.short_dated_lots || []);
  const byItem = new Map();
  for (const m of T.moves) { if (!byItem.has(m.item_code)) byItem.set(m.item_code, []); byItem.get(m.item_code).push(m); }
  for (const [code, ms] of byItem) {
    ms.sort((a, b) => a.date.localeCompare(b.date) || a.move_id.localeCompare(b.move_id));
    const bal = new Map();
    for (const m of ms) {
      const q = Number(m.qty);
      if (m.type === 'จ่าย' && !skip.has(m.lot_no)) {
        const me = lots.get(m.lot_no);
        for (const [ln, b] of bal) {
          if (ln === m.lot_no || b <= 0.011 || skip.has(ln)) continue;
          const o = lots.get(ln);
          const usable = o.release_date && o.release_date <= m.date && o.status !== 'ไม่ผ่าน' && (!o.exp_date || o.exp_date > m.date);
          if (usable && o.exp_date && me.exp_date && o.exp_date < me.exp_date) { p.push(`${m.move_id} ${code} จ่าย ${m.lot_no} ทั้งที่ ${ln} หมดอายุก่อน`); break; }
        }
      }
      bal.set(m.lot_no, (bal.get(m.lot_no) || 0) + (IN.has(m.type) ? q : OUT.has(m.type) ? -q : 0));
    }
  }
  check('จ่ายแบบ FEFO ทุกครั้ง (WHO TRS 1025 ภาคผนวก 7 ข้อ 12.30)', p);
}

// 5 เลขที่ผลิตตาม SOP-PD-07
{
  const p = [];
  const fy = (iso) => { const [y, m] = iso.split('-').map(Number); return String((m >= 10 ? y + 1 : y) + 543).slice(-2); };
  for (const l of T.lots) {
    if (/^R\d{2}-\d{4}$/.test(l.lot_no)) { if (!l.item_code.startsWith('9')) p.push(`${l.lot_no} เลขรับของซื้อแต่รหัสไม่ใช่หมวด 9`); continue; }
    const m = /^([1-5]\d{3})(\d{2})(\d{2,3})$/.exec(l.lot_no);
    if (!m) { p.push(`${l.lot_no} รูปแบบไม่ตรง SOP-PD-07`); continue; }
    if (m[1] !== l.item_code) p.push(`${l.lot_no} 4 หลักแรกไม่ตรงรหัส ${l.item_code}`);
    if (m[2] !== fy(l.date_in)) p.push(`${l.lot_no} ปีงบไม่ตรงวันที่ ${l.date_in}`);
  }
  check('เลขที่ผลิต 8 หลักตาม SOP-PD-07 (ประเภท ชื่อ ปีงบ ครั้งที่)', p);
}

// 6 ใบส่งของ
{
  const p = [];
  const sum = new Map();
  for (const x of T.invoice_lines) sum.set(x.inv_no, (sum.get(x.inv_no) || 0) + Number(x.amount));
  const credit = new Map(T.customers.map((c) => [c.customer_id, Number(c.credit_days)]));
  for (const v of T.invoices) {
    if (Math.abs((sum.get(v.inv_no) || 0) - Number(v.total)) > 0.01) p.push(`${v.inv_no} ยอดรวมไม่ตรงรายการ`);
    if (days(v.date, v.due_date) !== credit.get(v.customer_id)) p.push(`${v.inv_no} วันครบกำหนดไม่ตรงเครดิต`);
    if (v.paid_date && v.paid_date > base) p.push(`${v.inv_no} รับชำระหลังวันอ้างอิง`);
  }
  check('ใบส่งของ ยอดรวมตรงรายการ และวันครบกำหนดตรงเครดิตลูกค้า', p);
}

// 7 ฉากตัวอย่างที่เว็บต้องแสดง ณ วันอ้างอิง
{
  const p = [];
  if (!T.purchase_orders.some((x) => x.item_code === '91004' && !x.received_date && x.lot_no !== 'ก่อนเริ่มระบบ')) p.push('ไม่มีใบสั่งซื้อหลอดที่ค้างรับ');
  if (!T.jobs.some((j) => j.item_code === '5001' && j.status === 'waiting')) p.push('ไม่มีงานผลิตครีมไพลที่รอหลอด');
  if (!T.lots.some((l) => l.status === 'รอปล่อยผ่าน' && days(l.date_in, base) > 3)) p.push('ไม่มีล็อตรอปล่อยผ่านเกิน 3 วัน');
  const live = T.lots.filter((l) => l.status === 'ตรวจสอบแล้ว' && Number(l.qty_left) > 0 && l.exp_date);
  if (!live.some((l) => days(base, l.exp_date) <= 30)) p.push('ไม่มีล็อตที่จะหมดอายุใน 30 วัน');
  if (!live.some((l) => days(base, l.exp_date) > 30 && days(base, l.exp_date) <= 90)) p.push('ไม่มีล็อตที่จะหมดอายุใน 31 ถึง 90 วัน');
  check('ฉากตัวอย่างครบ (หลอดจะขาด งานรอหลอด รอปล่อยผ่านนาน ใกล้หมดอายุ)', p);
}

let fail = 0;
for (const r of results) {
  console.log(`${r.ok ? 'ผ่าน   ' : 'ไม่ผ่าน'}  ${r.name}${r.ok ? '' : `  (${r.problems.length} จุด)`}`);
  if (!r.ok) { fail++; r.problems.slice(0, 5).forEach((x) => console.log(`         - ${x}`)); }
}
console.log(`\nสรุป: ผ่าน ${results.length - fail} จาก ${results.length} ข้อ`);
process.exit(fail ? 1 : 0);
