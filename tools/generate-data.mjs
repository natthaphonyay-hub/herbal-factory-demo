// สร้างข้อมูลจำลองของโรงงานยาสมุนไพร โดยจำลองการทำงานย้อนหลัง 1 ปีทีละวัน
// ทุกตัวเลขลงกันได้: รับเข้า เบิก ผลิต ปล่อยผ่าน ขาย และรับชำระ มาจากเหตุการณ์ชุดเดียวกัน
// ข้อมูลทั้งหมดเป็นของสมมุติ ห้ามใช้แทนข้อมูลจริงของโรงงาน
// วิธีรัน: node tools/generate-data.mjs   (ผลลัพธ์อยู่ในโฟลเดอร์ data/)

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const BASE_ISO = '2026-11-05'; // วันอ้างอิงของข้อมูล (เว็บเลื่อนทุกวันที่ให้ตรงกับวันที่เปิดดู)
const BASE_MS = Date.UTC(2026, 10, 5);
const START = -365;

// ---------- สุ่มแบบกำหนดเมล็ด (ได้ข้อมูลชุดเดิมทุกครั้ง) ----------
let seed = 20261105;
function rnd() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const normal = (m, s) => m + s * randn();
const randint = (a, b) => a + Math.floor(rnd() * (b - a + 1));
function poisson(lam) {
  if (lam <= 0) return 0;
  if (lam > 30) return Math.max(0, Math.round(normal(lam, Math.sqrt(lam))));
  const L = Math.exp(-lam);
  let k = 0, p = 1;
  do { k++; p *= rnd(); } while (p > L);
  return k - 1;
}
function weighted(list) {
  const total = list.reduce((s, x) => s + x.w, 0);
  let r = rnd() * total;
  for (const x of list) { r -= x.w; if (r <= 0) return x; }
  return list[list.length - 1];
}

// ---------- วันที่ ----------
const iso = (d) => new Date(BASE_MS + d * 86400000).toISOString().slice(0, 10);
const dow = (d) => new Date(BASE_MS + d * 86400000).getUTCDay();
const isWeekday = (d) => dow(d) !== 0 && dow(d) !== 6;
function fy2(d) {
  const dt = new Date(BASE_MS + d * 86400000);
  const y = dt.getUTCFullYear() + (dt.getUTCMonth() >= 9 ? 1 : 0) + 543;
  return String(y).slice(-2);
}

// ---------- ข้อมูลหลัก (สมมุติ ใช้โครงรหัสตาม SOP-PD-07) ----------
const HERBS = [
  { id: 'H01', th: 'ขมิ้นชัน', sci: 'Curcuma longa L.', part: 'เหง้า', fresh: '1001', dry: '2001', powder: '3001', yd: 0.18, farm: ['F01', 'F02'] },
  { id: 'H02', th: 'ไพล', sci: 'Zingiber montanum (J.Koenig) Link ex A.Dietr.', part: 'เหง้า', fresh: '1002', dry: '2002', yd: 0.16, farm: ['F01', 'F03'] },
  { id: 'H03', th: 'ฟ้าทะลายโจร', sci: 'Andrographis paniculata (Burm.f.) Nees', part: 'ส่วนเหนือดิน', fresh: '1003', dry: '2003', powder: '3003', yd: 0.22, farm: ['F04'] },
  { id: 'H04', th: 'มะขามป้อม', sci: 'Phyllanthus emblica L.', part: 'ผล', fresh: '1004', dry: '2004', yd: 0.15, farm: ['F05'] },
  { id: 'H05', th: 'ขิง', sci: 'Zingiber officinale Roscoe', part: 'เหง้า', fresh: '1005', dry: '2005', yd: 0.12, farm: ['F02', 'F06'] },
  { id: 'H06', th: 'เพชรสังฆาต', sci: 'Cissus quadrangularis L.', part: 'ลำต้น', fresh: '1007', dry: '2007', powder: '3007', yd: 0.1, farm: ['F06'] },
  { id: 'H07', th: 'ตะไคร้', sci: 'Cymbopogon citratus (DC.) Stapf', part: 'ต้น', fresh: '1008', dry: '2008', yd: 0.25, farm: ['F03', 'F05'] },
];

const SUPPLIERS = [
  { id: 'S01', name: 'บริษัท บรรจุภัณฑ์โลหะ ก จำกัด (สมมุติ)', type: 'บริษัท', standard: '', approved: 'Y', lt: [62, 8], note: 'ซื้อผ่าน e-bidding' },
  { id: 'S02', name: 'บริษัท ภาชนะยา ข จำกัด (สมมุติ)', type: 'บริษัท', standard: '', approved: 'Y', lt: [21, 5], note: '' },
  { id: 'S03', name: 'บริษัท เคมีภัณฑ์ ค จำกัด (สมมุติ)', type: 'บริษัท', standard: '', approved: 'Y', lt: [12, 3], note: '' },
  { id: 'S04', name: 'โรงพิมพ์ ง (สมมุติ)', type: 'บริษัท', standard: '', approved: 'Y', lt: [10, 2], note: '' },
  { id: 'S05', name: 'บริษัท หลอดยา จ จำกัด (สมมุติ)', type: 'บริษัท', standard: '', approved: 'Y', lt: [21, 4], note: 'ผู้ขายสำรองหลอดอลูมิเนียม' },
  { id: 'S06', name: 'ร้านผ้าและกล่อง ฉ (สมมุติ)', type: 'บริษัท', standard: '', approved: 'Y', lt: [14, 3], note: '' },
  { id: 'S07', name: 'บริษัท แคปซูล ช จำกัด (สมมุติ)', type: 'บริษัท', standard: '', approved: 'Y', lt: [18, 4], note: '' },
  { id: 'F01', name: 'กลุ่มผู้ปลูก ก (สมมุติ)', type: 'เกษตรกร', standard: 'GAP', approved: 'Y', lt: [1, 0], note: 'สมาชิก' },
  { id: 'F02', name: 'กลุ่มผู้ปลูก ข (สมมุติ)', type: 'เกษตรกร', standard: 'เกษตรอินทรีย์', approved: 'Y', lt: [1, 0], note: 'สมาชิก' },
  { id: 'F03', name: 'กลุ่มผู้ปลูก ค (สมมุติ)', type: 'เกษตรกร', standard: 'ทั่วไป', approved: 'Y', lt: [1, 0], note: 'สมาชิก' },
  { id: 'F04', name: 'กลุ่มผู้ปลูก ง (สมมุติ)', type: 'เกษตรกร', standard: 'GAP', approved: 'Y', lt: [1, 0], note: 'สมาชิก' },
  { id: 'F05', name: 'กลุ่มผู้ปลูก จ (สมมุติ)', type: 'เกษตรกร', standard: 'ทั่วไป', approved: 'Y', lt: [1, 0], note: 'ไม่เป็นสมาชิก' },
  { id: 'F06', name: 'กลุ่มผู้ปลูก ฉ (สมมุติ)', type: 'เกษตรกร', standard: 'GAP', approved: 'Y', lt: [1, 0], note: 'สมาชิก' },
];
const supById = new Map(SUPPLIERS.map((s) => [s.id, s]));

const CUSTOMERS = [
  { id: 'C01', name: 'คลังเวชภัณฑ์ รพ.ก (สมมุติ)', type: 'โรงพยาบาล', credit: 60, late: 15, w: 40 },
  { id: 'C02', name: 'รพ.ข (สมมุติ)', type: 'โรงพยาบาล', credit: 60, late: 35, w: 15 },
  { id: 'C03', name: 'รพ.ค (สมมุติ)', type: 'โรงพยาบาล', credit: 90, late: 50, w: 12 },
  { id: 'C04', name: 'รพ.สต.ง (สมมุติ)', type: 'รพ.สต.', credit: 30, late: 5, w: 6 },
  { id: 'C05', name: 'รพ.สต.จ (สมมุติ)', type: 'รพ.สต.', credit: 30, late: 12, w: 6 },
  { id: 'C06', name: 'รพ.สต.ฉ (สมมุติ)', type: 'รพ.สต.', credit: 30, late: 0, w: 5 },
  { id: 'C07', name: 'ร้านมูลนิธิ (สมมุติ)', type: 'ร้านค้า', credit: 0, late: 0, w: 10 },
  { id: 'C08', name: 'คลินิกแพทย์แผนไทย ช (สมมุติ)', type: 'คลินิก', credit: 30, late: 25, w: 6 },
];

const STAFF = [
  { id: 'U00', name: 'กานต์ (สมมุติ)', role: 'หัวหน้ากลุ่มงาน', dept: 'บริหาร' },
  { id: 'U01', name: 'ดาว (สมมุติ)', role: 'เจ้าหน้าที่ฝ่ายจัดซื้อและคลัง', dept: 'ฝ่ายจัดซื้อและคลัง' },
  { id: 'U02', name: 'ต้น (สมมุติ)', role: 'หัวหน้าฝ่ายแปรรูปสมุนไพร', dept: 'ฝ่ายแปรรูปสมุนไพร' },
  { id: 'U03', name: 'เอ (สมมุติ)', role: 'หัวหน้าฝ่ายผลิต', dept: 'ฝ่ายผลิต' },
  { id: 'U04', name: 'ฝน (สมมุติ)', role: 'เจ้าหน้าที่ฝ่ายควบคุมคุณภาพ', dept: 'ฝ่ายควบคุมคุณภาพ' },
  { id: 'U05', name: 'แพร (สมมุติ)', role: 'หัวหน้าฝ่ายควบคุมคุณภาพ', dept: 'ฝ่ายควบคุมคุณภาพ' },
  { id: 'U06', name: 'นก (สมมุติ)', role: 'พนักงานฝ่ายผลิต', dept: 'ฝ่ายผลิต' },
  { id: 'U07', name: 'บีม (สมมุติ)', role: 'เจ้าหน้าที่ฝ่ายขาย', dept: 'ฝ่ายจัดซื้อและคลัง' },
];

const PRODUCTS = [
  { code: '4001', name: 'ยาขมิ้นชันแคปซูล 500 มก. 100 แคปซูล', short: 'ขมิ้นชันแคปซูล', unit: 'ขวด', d: 36, price: 120, shelf: 730, batch: 600, days: [3, 5], bom: [['3001', 0.05], ['92001', 100], ['91001', 1], ['93001', 1]] },
  { code: '4002', name: 'ยาฟ้าทะลายโจรแคปซูล 500 มก. 100 แคปซูล', short: 'ฟ้าทะลายโจรแคปซูล', unit: 'ขวด', d: 30, price: 100, shelf: 730, batch: 600, days: [3, 5], bom: [['3003', 0.05], ['92001', 100], ['91001', 1], ['93002', 1]] },
  { code: '4003', name: 'ยาเพชรสังฆาตแคปซูล 400 มก. 100 แคปซูล', short: 'เพชรสังฆาตแคปซูล', unit: 'ขวด', d: 8, price: 150, shelf: 730, batch: 300, days: [3, 5], bom: [['3007', 0.04], ['92001', 100], ['91001', 1], ['93003', 1]] },
  { code: '4004', name: 'ยาแก้ไอมะขามป้อม 60 มล.', short: 'แก้ไอมะขามป้อม', unit: 'ขวด', d: 40, price: 35, shelf: 365, batch: 1000, days: [2, 4], key: true, bom: [['2004', 0.012], ['92002', 0.04], ['91002', 1], ['93004', 1]] },
  { code: '4005', name: 'ชาชงขิง 20 ซอง', short: 'ชาชงขิง', unit: 'กล่อง', d: 12, price: 45, shelf: 540, batch: 400, days: [2, 3], bom: [['2005', 0.04], ['91003', 1], ['93005', 1]] },
  { code: '5001', name: 'ครีมไพล 30 ก.', short: 'ครีมไพล', unit: 'หลอด', d: 45, price: 60, shelf: 540, batch: 1000, days: [2, 4], key: true, bom: [['2002', 0.004], ['92003', 0.026], ['91004', 1], ['93006', 1]] },
  { code: '5002', name: 'น้ำมันไพล 15 มล.', short: 'น้ำมันไพล', unit: 'ขวด', d: 40, price: 45, shelf: 730, batch: 1000, days: [2, 3], key: true, bom: [['2002', 0.003], ['92004', 0.014], ['91005', 1], ['93007', 1]] },
  { code: '5003', name: 'ลูกประคบสมุนไพร 200 ก.', short: 'ลูกประคบ', unit: 'ลูก', d: 30, price: 50, shelf: 180, batch: 600, days: [2, 3], key: true, bom: [['2002', 0.08], ['2001', 0.03], ['2008', 0.03], ['91006', 1], ['93008', 1]] },
  { code: '5004', name: 'พิมเสนน้ำ 8 มล.', short: 'พิมเสนน้ำ', unit: 'ขวด', d: 50, price: 25, shelf: 730, batch: 1500, days: [1, 2], key: true, bom: [['92005', 0.006], ['92004', 0.002], ['91007', 1], ['93009', 1]] },
];

const BUY = [
  { code: '91001', name: 'ขวดพลาสติกใส่แคปซูล 100 เม็ด', kind: 'บรรจุภัณฑ์', unit: 'ใบ', pack: 500, sup: 'S02' },
  { code: '91002', name: 'ขวดแก้วยาน้ำ 60 มล.', kind: 'บรรจุภัณฑ์', unit: 'ใบ', pack: 500, sup: 'S02' },
  { code: '91003', name: 'ซองชาพร้อมกล่อง 20 ซอง', kind: 'บรรจุภัณฑ์', unit: 'ชุด', pack: 200, sup: 'S06' },
  { code: '91004', name: 'หลอดอลูมิเนียม 30 ก.', kind: 'บรรจุภัณฑ์', unit: 'หลอด', pack: 1000, sup: 'S01', backup: 'S05' },
  { code: '91005', name: 'ขวดน้ำมัน 15 มล.', kind: 'บรรจุภัณฑ์', unit: 'ใบ', pack: 500, sup: 'S02' },
  { code: '91006', name: 'ผ้าดิบห่อลูกประคบ', kind: 'บรรจุภัณฑ์', unit: 'ผืน', pack: 500, sup: 'S06' },
  { code: '91007', name: 'ขวดลูกกลิ้ง 8 มล.', kind: 'บรรจุภัณฑ์', unit: 'ใบ', pack: 1000, sup: 'S02' },
  { code: '92001', name: 'แคปซูลเปล่าเบอร์ 0', kind: 'เคมีภัณฑ์', unit: 'เม็ด', pack: 50000, sup: 'S07', shelf: 1095 },
  { code: '92002', name: 'น้ำเชื่อม', kind: 'เคมีภัณฑ์', unit: 'กก.', pack: 25, sup: 'S03', shelf: 365 },
  { code: '92003', name: 'ครีมเบส', kind: 'เคมีภัณฑ์', unit: 'กก.', pack: 20, sup: 'S03', shelf: 540 },
  { code: '92004', name: 'น้ำมันมะพร้าว', kind: 'เคมีภัณฑ์', unit: 'ลิตร', pack: 20, sup: 'S03', shelf: 365 },
  { code: '92005', name: 'การบูร เมนทอล พิมเสน', kind: 'เคมีภัณฑ์', unit: 'กก.', pack: 5, sup: 'S03', shelf: 1095 },
];
PRODUCTS.forEach((p, i) => BUY.push({ code: `9300${i + 1}`, name: `ฉลาก${p.short}`, kind: 'ฉลาก', unit: 'ดวง', pack: 2000, sup: 'S04' }));

// ---------- ทะเบียนรายการ ----------
const items = new Map();
const add = (o) => items.set(o.code, { shelf: 0, key: false, d: 0, ...o });
for (const h of HERBS) {
  add({ code: h.fresh, name: `${h.th}สด`, kind: 'สด', unit: 'กก.', shelf: 3, herb: h.id, make: 'farm' });
  add({ code: h.dry, name: `${h.th}แห้ง`, kind: 'แห้ง', unit: 'กก.', shelf: 730, herb: h.id, make: 'make', lane: 'แปรรูป', from: h.fresh, yield: h.yd, batch: 20, days: [4, 7] });
  if (h.powder) add({ code: h.powder, name: `ผง${h.th}`, kind: 'ผง', unit: 'กก.', shelf: 365, herb: h.id, make: 'make', lane: 'แปรรูป', from: h.dry, yield: 0.95, batch: 15, days: [2, 3] });
}
for (const p of PRODUCTS) add({ code: p.code, name: p.name, kind: p.code.startsWith('4') ? 'ยารับประทาน' : 'ยาใช้ภายนอก', unit: p.unit, shelf: p.shelf, key: !!p.key, make: 'make', lane: 'ผลิต', batch: p.batch, days: p.days, price: p.price, bom: p.bom, d: p.d });
for (const b of BUY) add({ ...b, make: 'buy' });
const HERB_BY_CODE = new Map();
for (const h of HERBS) for (const c of [h.fresh, h.dry, h.powder].filter(Boolean)) HERB_BY_CODE.set(c, h);

// ความต้องการตามแผนต่อวัน กระจายจากยาสำเร็จรูปลงไปหาวัตถุดิบ
for (const p of PRODUCTS) for (const [c, q] of p.bom) { const it = items.get(c); it.d += p.d * q; if (p.key) it.key = true; }
for (const h of HERBS) if (h.powder) { const pw = items.get(h.powder); items.get(h.dry).d += pw.d / 0.95; if (pw.key) items.get(h.dry).key = true; }

const UNIT_INT = new Set(['ใบ', 'หลอด', 'ขวด', 'เม็ด', 'ชุด', 'ผืน', 'ดวง', 'ลูก', 'กล่อง']);
const rq = (code, q) => (UNIT_INT.has(items.get(code).unit) ? Math.round(q) : Math.round(q * 100) / 100);

// นโยบายเติมของตามแผน (ใช้สูตรเดียวกับเว็บ ดู assets/logic.js)
function policy(it) {
  const d = it.d;
  if (d <= 0) return { rop: 0, S: 0 };
  let L, sL;
  if (it.make === 'buy') { const s = supById.get(it.sup); [L, sL] = s.lt; }
  else { L = (it.days[0] + it.days[1]) / 2 + (it.lane === 'ผลิต' ? 7 + 3 : 3) + 1; sL = 2; }
  const parentBatch = Math.max(1, ...PRODUCTS.flatMap((p) => p.bom.filter(([c]) => c === it.code).map(([, q]) => p.batch * q)),
    ...HERBS.filter((h) => h.dry === it.code && h.powder).map((h) => items.get(h.powder).batch / 0.95));
  const sd = it.lane === 'ผลิต' ? Math.sqrt(d) : Math.sqrt(d * parentBatch);
  const z = it.key ? 1.65 : 1.28;
  const rop = d * L + z * Math.sqrt(L * sd * sd + d * d * sL * sL);
  return { rop, S: rop + d * 30 };
}
for (const it of items.values()) Object.assign(it, policy(it));

// ---------- สถานะจำลอง ----------
const lots = [];
const moves = [];
const pos = [];
const jobs = [];
const jobInputs = [];
const releases = [];
const invoices = [];
const invLines = [];
const shortages = [];
const counters = new Map();
const nextSeq = (key) => { const n = (counters.get(key) || 0) + 1; counters.set(key, n); return n; };
const pad = (n, w) => String(n).padStart(w, '0');
const lotsByItem = new Map();
const lotIndex = new Map();
let moveSeq = 0;

function addMove(d, item, lot, type, qty, party, doc, user) {
  moves.push({ move_id: `M${pad(++moveSeq, 6)}`, date: d, item_code: item, lot_no: lot, type, qty: rq(item, qty), party, doc_no: doc, user_id: user });
}
function newLot(o) {
  const lot = { left: o.qty_in, release: null, relDue: null, ...o };
  lots.push(lot);
  lotIndex.set(lot.lot_no, lot);
  if (!lotsByItem.has(lot.item)) lotsByItem.set(lot.item, []);
  lotsByItem.get(lot.item).push(lot);
  return lot;
}
function internalLotNo(code, d) { const fy = fy2(d); return `${code}${fy}${pad(nextSeq(`${code}-${fy}`), 2)}`; }
function purchaseLotNo(d) { const fy = fy2(d); return `R${fy}-${pad(nextSeq(`R-${fy}`), 4)}`; }
const usable = (lot, d) => lot.status === 'ตรวจสอบแล้ว' && lot.left > 1e-9 && (lot.exp === null || lot.exp > d);
const releasedQty = (code, d) => (lotsByItem.get(code) || []).filter((l) => usable(l, d)).reduce((s, l) => s + l.left, 0);
const quarantineQty = (code) => (lotsByItem.get(code) || []).filter((l) => l.status === 'รอปล่อยผ่าน').reduce((s, l) => s + l.left, 0);
function onOrder(code) {
  let q = 0;
  for (const p of pos) if (p.item === code && p.received === null && !p.history) q += p.qty;
  for (const j of jobs) if (j.item === code && (j.status === 'waiting' || j.status === 'running')) q += j.qty;
  return q;
}

// จ่ายของตามหลักหมดอายุก่อนจ่ายก่อน (FEFO) ถ้าวันหมดอายุเท่ากันใช้ล็อตที่รับก่อน
function issueFEFO(code, qty, d, party, doc, user, jobId) {
  const avail = (lotsByItem.get(code) || []).filter((l) => usable(l, d))
    .sort((a, b) => (a.exp ?? 1e9) - (b.exp ?? 1e9) || a.date_in - b.date_in);
  let need = qty;
  const taken = [];
  for (const l of avail) {
    if (need <= 1e-9) break;
    const q = rq(code, Math.min(l.left, need));
    if (q <= 0) continue;
    l.left = rq(code, l.left - q);
    need = rq(code, need - q);
    addMove(d, code, l.lot_no, 'จ่าย', q, party, doc, user);
    if (jobId) jobInputs.push({ job_id: jobId, lot_no: l.lot_no, item_code: code, qty: q });
    taken.push({ lot: l.lot_no, qty: q });
  }
  return { taken, short: Math.max(0, rq(code, need)) };
}

const REQ_FORM = { 'สด': 'FM-28', 'แห้ง': 'FM-29', 'ผง': 'FM-30', 'เคมีภัณฑ์': 'FM-31', 'บรรจุภัณฑ์': 'FM-32', 'ฉลาก': 'FM-33' };

function release(lot, d, result, note = '') {
  lot.status = result === 'ผ่าน' ? 'ตรวจสอบแล้ว' : 'ไม่ผ่าน';
  lot.release = d;
  releases.push({ date: d, lot_no: lot.lot_no, item_code: lot.item, result, checker_id: 'U04', approver_id: 'U05', note });
  const j = jobs.find((x) => x.out_lot === lot.lot_no);
  if (j) { j.status = 'done'; j.release = d; }
}

// ---------- ยอดยกมา และประวัติระยะส่งของก่อนเริ่มจำลอง ----------
for (const it of items.values()) {
  if (it.make === 'farm' || it.d <= 0) continue;
  const total = it.make === 'buy' ? Math.ceil(it.S / it.pack) * it.pack : it.S;
  const parts = total > (it.batch || it.pack || 1) * 1.5 ? 2 : 1;
  for (let k = 0; k < parts; k++) {
    const qty = rq(it.code, total / parts);
    const age = it.shelf ? randint(10, Math.max(20, Math.floor(it.shelf / 4))) : randint(10, 120);
    const dIn = START - age - k * 15;
    const lotNo = it.make === 'buy' ? purchaseLotNo(dIn) : internalLotNo(it.code, dIn);
    const exp = it.shelf ? dIn + it.shelf - (it.make === 'buy' ? randint(30, 90) : 0) : null;
    const lot = newLot({ lot_no: lotNo, item: it.code, qty_in: qty, date_in: dIn, exp, status: 'ตรวจสอบแล้ว', source: 'ยกมา', ref: '' });
    lot.release = dIn + 2;
    addMove(START, it.code, lotNo, 'ยกมา', qty, 'ยอดยกมาจากระบบเดิม', 'FM-02', 'U01');
  }
}
for (const it of items.values()) {
  if (it.make !== 'buy') continue;
  const sups = [it.sup, it.backup].filter(Boolean);
  for (const sid of sups) {
    const n = sid === it.sup ? 6 : 3;
    const [m, s] = supById.get(sid).lt;
    for (let k = 0; k < n; k++) {
      const od = START - 100 - k * randint(45, 70);
      const lt = Math.max(2, Math.round(normal(m, s)));
      pos.push({ po_no: `PO${fy2(od)}-${pad(nextSeq(`PO-${fy2(od)}`), 3)}`, supplier: sid, item: it.code, qty: it.pack * randint(2, 6), order: od, quoted: od + m, arrive: od + lt, received: od + lt, lot: '', history: true });
    }
  }
}

// ---------- การทำงานแต่ละวัน ----------
const flags = { tubeLock: false, qcDelay: false, adjusted: false };
let jobSeq = 0;

function placePO(it, qty, d, supId) {
  const s = supById.get(supId || it.sup);
  const [m, sd] = s.lt;
  const lt = Math.max(2, Math.round(normal(m, sd)));
  const po = { po_no: `PO${fy2(d)}-${pad(nextSeq(`PO-${fy2(d)}`), 3)}`, supplier: s.id, item: it.code, qty, order: d, quoted: d + m, arrive: d + lt, received: null, lot: '', history: false };
  pos.push(po);
  return po;
}

function createJob(it, qty, d) {
  const j = { job_id: `J${fy2(d)}-${pad(++jobSeq, 3)}`, lane: it.lane, item: it.code, qty: rq(it.code, qty), created: d, start: null, end: null, release: null, out_lot: '', status: 'waiting', wait: '' };
  jobs.push(j);
  return j;
}

function tryStart(j, d) {
  if (!isWeekday(d)) return;
  const it = items.get(j.item);
  if (it.lane === 'แปรรูป' && items.get(it.from).make === 'farm') {
    // รับซื้อสมุนไพรสดจากเกษตรกร ตรวจปล่อยผ่านวันเดียวกัน (SOP-QC-06 ข้อ 4.1) แล้วเบิกเข้าแปรรูปทั้งล็อต
    const fresh = items.get(it.from);
    const h = HERB_BY_CODE.get(it.code);
    const farmer = supById.get(h.farm[randint(0, h.farm.length - 1)]);
    const fq = rq(fresh.code, j.qty / it.yield);
    const lotNo = internalLotNo(fresh.code, d);
    const lot = newLot({ lot_no: lotNo, item: fresh.code, qty_in: fq, date_in: d, exp: d + fresh.shelf, status: 'รอปล่อยผ่าน', source: 'รับซื้อ', ref: farmer.id });
    addMove(d, fresh.code, lotNo, 'รับ', fq, farmer.name, 'FM-23 ใบรับซื้อวัตถุดิบสมุนไพร', 'U01');
    release(lot, d, 'ผ่าน', 'ตรวจรับสมุนไพรสดก่อนแปรรูป');
    issueFEFO(fresh.code, fq, d, `งานแปรรูป ${j.job_id}`, 'FM-28', 'U02', j.job_id);
  } else {
    const needs = it.lane === 'แปรรูป' ? [[it.from, j.qty / it.yield]] : it.bom.map(([c, q]) => [c, q * j.qty]);
    for (const [c, q] of needs) {
      if (releasedQty(c, d) + 1e-9 < rq(c, q)) { j.wait = items.get(c).name; return; }
    }
    for (const [c, q] of needs) issueFEFO(c, rq(c, q), d, `${it.lane === 'ผลิต' ? 'งานผลิต' : 'งานแปรรูป'} ${j.job_id}`, REQ_FORM[items.get(c).kind] || 'FM-28', it.lane === 'ผลิต' ? 'U03' : 'U02', j.job_id);
  }
  j.status = 'running';
  j.wait = '';
  j.start = d;
  j.end = d + randint(it.days[0], it.days[1]);
}

function completeJob(j, d) {
  const it = items.get(j.item);
  const lotNo = internalLotNo(it.code, d);
  const lot = newLot({ lot_no: lotNo, item: it.code, qty_in: j.qty, date_in: d, exp: d + it.shelf, status: 'รอปล่อยผ่าน', source: 'ผลิต', ref: j.job_id });
  lot.relDue = d + (it.lane === 'ผลิต' ? randint(5, 9) : randint(2, 4)); // รอผลตรวจ เช่น เชื้อจุลินทรีย์
  if (it.code === '3001' && d >= -9 && !flags.qcDelay) { lot.relDue = 4; flags.qcDelay = true; } // ฉากตัวอย่าง: ผลตรวจล่าช้า
  addMove(d, it.code, lotNo, 'รับ', j.qty, it.lane === 'ผลิต' ? 'ฝ่ายผลิต' : 'ฝ่ายแปรรูปสมุนไพร', `บันทึกการผลิต ${j.job_id}`, it.lane === 'ผลิต' ? 'U03' : 'U02');
  j.status = 'qc';
  j.out_lot = lotNo;
}

function receivePO(po, d) {
  const it = items.get(po.item);
  const s = supById.get(po.supplier);
  const lotNo = purchaseLotNo(d);
  const exp = it.shelf ? d + it.shelf - randint(30, 120) : null;
  const lot = newLot({ lot_no: lotNo, item: it.code, qty_in: po.qty, date_in: d, exp, status: 'รอปล่อยผ่าน', source: 'ใบสั่งซื้อ', ref: po.po_no });
  lot.relDue = d + randint(1, 3);
  addMove(d, it.code, lotNo, 'รับ', po.qty, s.name, `FM-01 ${po.po_no}`, 'U01');
  po.received = d;
  po.lot = lotNo;
}

const custW = CUSTOMERS.map((c) => ({ ...c }));
function sell(d) {
  const lines = new Map();
  for (const p of PRODUCTS) {
    const q = poisson(p.d * 7 / 5);
    if (q <= 0) continue;
    let left = q;
    const orders = Math.min(left, 1 + poisson(1.2));
    for (let k = 0; k < orders && left > 0; k++) {
      const c = weighted(custW);
      const qq = k === orders - 1 ? left : Math.max(1, Math.round(left * (0.3 + rnd() * 0.4)));
      left -= qq;
      const { taken, short } = issueFEFO(p.code, qq, d, c.name, 'FM-19 ใบเบิกยาสำเร็จรูป', 'U07');
      if (short > 0) shortages.push({ date: d, item_code: p.code, qty_short: short, customer_id: c.id });
      for (const t of taken) {
        if (!lines.has(c.id)) lines.set(c.id, []);
        lines.get(c.id).push({ item_code: p.code, lot_no: t.lot, qty: t.qty, price: p.price, amount: t.qty * p.price });
      }
    }
  }
  for (const [cid, ls] of lines) {
    const c = CUSTOMERS.find((x) => x.id === cid);
    const inv = `IV${fy2(d)}-${pad(nextSeq(`IV-${fy2(d)}`), 4)}`;
    const total = ls.reduce((s, l) => s + l.amount, 0);
    const due = d + c.credit;
    let paid = c.credit === 0 ? d : due + Math.max(0, Math.round(normal(c.late, c.late / 2 + 2)));
    if (paid > 0) paid = null;
    invoices.push({ inv_no: inv, date: d, customer_id: cid, total, due, paid });
    for (const l of ls) invLines.push({ inv_no: inv, ...l });
  }
}

// ของที่งานซึ่งรอวัตถุดิบอยู่ต้องใช้ (กันไว้ก่อน จะได้สั่งเติมให้พอ)
function allocatedFor(code) {
  let q = 0;
  for (const j of jobs) {
    if (j.status !== 'waiting') continue;
    const it = items.get(j.item);
    if (it.lane === 'ผลิต') { for (const [c, u] of it.bom) if (c === code) q += u * j.qty; }
    else if (it.from === code) q += j.qty / it.yield;
  }
  return q;
}

function replenish(it, d) {
  if (!isWeekday(d) || it.make === 'farm' || it.d <= 0) return;
  if (it.code === '91004' && flags.tubeLock) return;
  const position = releasedQty(it.code, d) + quarantineQty(it.code) + onOrder(it.code) - allocatedFor(it.code);
  if (position > it.rop) return;
  if (it.make === 'buy') {
    placePO(it, Math.ceil((it.S - position) / it.pack) * it.pack, d);
  } else {
    const j = createJob(it, it.batch, d); // งานละ 1 รุ่นการผลิต
    tryStart(j, d);
  }
}

function hooks(d) {
  // ฉากตัวอย่างที่ต้องเห็นในเว็บ ณ วันอ้างอิง (สร้างแบบมีเหตุการณ์รองรับครบ)
  if (d === -60) {
    flags.tubeLock = true;
    for (const po of pos) if (po.item === '91004' && !po.history && po.received === null && po.arrive > -20) po.arrive = -20;
  }
  if (d === -46) { const it = items.get('91004'); const po = placePO(it, 3000, d, 'S01'); po.arrive = 16; }
  if (d === -8 && !jobs.some((j) => j.item === '5001' && j.status === 'waiting')) {
    const j = createJob(items.get('5001'), 1000, d);
    tryStart(j, d);
  }
  if (d === -10 && !flags.adjusted) {
    // ปรับยอดรับหลอดล็อตล่าสุดให้เหลือ 270 หลอด (แก้ทั้งยอดรับและยอดคงเหลือเท่ากัน บัญชีคุมยังลงกัน)
    const target = 270;
    const ls = (lotsByItem.get('91004') || []).filter((l) => usable(l, d)).sort((a, b) => b.date_in - a.date_in);
    let delta = target - ls.reduce((s, l) => s + l.left, 0);
    for (const l of ls) {
      if (delta === 0) break;
      const ch = delta > 0 ? delta : -Math.min(l.left, -delta);
      l.left += ch; l.qty_in += ch; delta -= ch;
      const mv = moves.find((m) => m.lot_no === l.lot_no && (m.type === 'รับ' || m.type === 'ยกมา'));
      mv.qty += ch;
      const po = pos.find((p) => p.lot === l.lot_no);
      if (po) po.qty += ch;
    }
    flags.adjusted = true;
  }
  if (d === -9) { const it = items.get('3001'); const j = createJob(it, 15, d); tryStart(j, d); }
}

for (let d = START; d <= 0; d++) {
  if (isWeekday(d)) {
    for (const po of pos) if (!po.history && po.received === null && po.arrive <= d) receivePO(po, d);
    for (const j of jobs) if (j.status === 'running' && j.end <= d) completeJob(j, d);
    for (const l of lots) {
      if (l.status === 'รอปล่อยผ่าน' && l.relDue !== null && l.relDue <= d) {
        const reject = l.source === 'ใบสั่งซื้อ' ? rnd() < 0.02 : rnd() < 0.01;
        release(l, d, reject ? 'ไม่ผ่าน' : 'ผ่าน', reject ? 'ผลตรวจไม่เป็นไปตามข้อกำหนด' : '');
      }
    }
  }
  for (const l of lots) {
    if (l.exp !== null && l.exp <= d && l.left > 1e-9 && l.status === 'ตรวจสอบแล้ว') {
      addMove(d, l.item, l.lot_no, 'ตัดจ่ายหมดอายุ', l.left, 'แยกเก็บรอทำลาย', 'FM-11', 'U01');
      l.left = 0;
      l.status = 'หมดอายุ';
    }
    if (l.status === 'ไม่ผ่าน' && l.left > 1e-9 && l.release !== null && d - l.release >= 5 && isWeekday(d)) {
      addMove(d, l.item, l.lot_no, l.source === 'ใบสั่งซื้อ' ? 'ส่งคืนผู้ขาย' : 'ทำลาย', l.left, l.source === 'ใบสั่งซื้อ' ? 'ผู้ขาย' : 'คณะกรรมการทำลาย', 'SOP-QC-12', 'U01');
      l.left = 0;
    }
  }
  hooks(d);
  for (const j of jobs) if (j.status === 'waiting') tryStart(j, d);
  if (d > START && isWeekday(d)) sell(d);
  for (const it of items.values()) replenish(it, d);
}

// ฉากตัวอย่าง: ล็อตเคมีภัณฑ์ที่ผู้ขายส่งมาอายุสั้น (วันหมดอายุตามฉลากผู้ขาย)
const scenarioLots = [];
function shortDate(code, daysLeft) {
  const l = (lotsByItem.get(code) || []).filter((x) => usable(x, 0)).sort((a, b) => a.exp - b.exp)[0];
  if (l) { l.exp = Math.max(l.date_in + 30, daysLeft); scenarioLots.push(l.lot_no); }
}
shortDate('92003', 12);
shortDate('92002', 45);

// ---------- เขียนไฟล์ ----------
mkdirSync(OUT, { recursive: true });
const esc = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function csv(name, cols, rows) {
  const out = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
  writeFileSync(join(OUT, `${name}.csv`), out);
  return rows.length;
}
const D = (x) => (x === null || x === undefined ? '' : iso(x));
const counts = {};
counts.items = csv('items', ['code', 'name', 'kind', 'unit', 'shelf_days', 'key', 'herb_id', 'make', 'lane', 'batch_or_pack', 'supplier_id', 'backup_supplier_id', 'price', 'csl'],
  [...items.values()].map((it) => ({ code: it.code, name: it.name, kind: it.kind, unit: it.unit, shelf_days: it.shelf || '', key: it.key ? 'Y' : 'N', herb_id: it.herb || '', make: it.make, lane: it.lane || '', batch_or_pack: it.batch || it.pack || '', supplier_id: it.sup || '', backup_supplier_id: it.backup || '', price: it.price || '', csl: it.make === 'farm' ? '' : it.key ? 0.95 : 0.9 })));
counts.herbs = csv('herbs', ['herb_id', 'name_th', 'name_sci', 'part'], HERBS.map((h) => ({ herb_id: h.id, name_th: h.th, name_sci: h.sci, part: h.part })));
counts.bom = csv('bom', ['out_item', 'in_item', 'qty_per_unit'], [
  ...PRODUCTS.flatMap((p) => p.bom.map(([c, q]) => ({ out_item: p.code, in_item: c, qty_per_unit: q }))),
  ...HERBS.flatMap((h) => [{ out_item: h.dry, in_item: h.fresh, qty_per_unit: Math.round((1 / h.yd) * 1000) / 1000 }, ...(h.powder ? [{ out_item: h.powder, in_item: h.dry, qty_per_unit: Math.round((1 / 0.95) * 1000) / 1000 }] : [])]),
]);
counts.suppliers = csv('suppliers', ['supplier_id', 'name', 'type', 'standard', 'approved', 'quoted_lead_days', 'note'], SUPPLIERS.map((s) => ({ supplier_id: s.id, name: s.name, type: s.type, standard: s.standard, approved: s.approved, quoted_lead_days: s.lt[0], note: s.note })));
counts.customers = csv('customers', ['customer_id', 'name', 'type', 'credit_days'], CUSTOMERS.map((c) => ({ customer_id: c.id, name: c.name, type: c.type, credit_days: c.credit })));
counts.staff = csv('staff', ['user_id', 'name', 'role', 'dept'], STAFF.map((s) => ({ user_id: s.id, name: s.name, role: s.role, dept: s.dept })));
counts.lots = csv('lots', ['lot_no', 'item_code', 'qty_in', 'qty_left', 'date_in', 'exp_date', 'status', 'release_date', 'source', 'source_ref'],
  lots.map((l) => ({ lot_no: l.lot_no, item_code: l.item, qty_in: rq(l.item, l.qty_in), qty_left: rq(l.item, l.left), date_in: D(l.date_in), exp_date: D(l.exp), status: l.status, release_date: D(l.release), source: l.source, source_ref: l.ref })));
counts.moves = csv('moves', ['move_id', 'date', 'item_code', 'lot_no', 'type', 'qty', 'party', 'doc_no', 'user_id'], moves.map((m) => ({ ...m, date: D(m.date) })));
counts.purchase_orders = csv('purchase_orders', ['po_no', 'supplier_id', 'item_code', 'qty', 'order_date', 'quoted_date', 'received_date', 'lot_no'],
  pos.map((p) => ({ po_no: p.po_no, supplier_id: p.supplier, item_code: p.item, qty: p.qty, order_date: D(p.order), quoted_date: D(p.quoted), received_date: D(p.received), lot_no: p.lot || (p.history ? 'ก่อนเริ่มระบบ' : '') })));
counts.jobs = csv('jobs', ['job_id', 'lane', 'item_code', 'qty', 'created_date', 'start_date', 'end_date', 'release_date', 'out_lot', 'status', 'wait_reason'],
  jobs.map((j) => ({ job_id: j.job_id, lane: j.lane, item_code: j.item, qty: j.qty, created_date: D(j.created), start_date: D(j.start), end_date: D(j.end), release_date: D(j.release), out_lot: j.out_lot, status: j.status, wait_reason: j.wait })));
counts.job_inputs = csv('job_inputs', ['job_id', 'lot_no', 'item_code', 'qty'], jobInputs);
counts.releases = csv('releases', ['date', 'lot_no', 'item_code', 'result', 'checker_id', 'approver_id', 'note'], releases.map((r) => ({ ...r, date: D(r.date) })));
counts.invoices = csv('invoices', ['inv_no', 'date', 'customer_id', 'total', 'due_date', 'paid_date'], invoices.map((v) => ({ inv_no: v.inv_no, date: D(v.date), customer_id: v.customer_id, total: v.total, due_date: D(v.due), paid_date: D(v.paid) })));
counts.invoice_lines = csv('invoice_lines', ['inv_no', 'item_code', 'lot_no', 'qty', 'price', 'amount'], invLines);
counts.shortages = csv('shortages', ['date', 'item_code', 'qty_short', 'customer_id'], shortages.map((s) => ({ ...s, date: D(s.date) })));
writeFileSync(join(OUT, 'meta.json'), JSON.stringify({
  base_date: BASE_ISO, start_date: iso(START), seed: 20261105,
  note: 'ข้อมูลจำลองทั้งหมด ห้ามใช้แทนข้อมูลจริง',
  scenario: {
    short_dated_lots: scenarioLots,
    note: 'ล็อตใน short_dated_lots ปรับวันหมดอายุหลังจำลอง เพื่อแสดงกรณีผู้ขายส่งของอายุสั้น ตัวตรวจ FEFO ย้อนหลังจึงยกเว้นล็อตเหล่านี้',
  },
  counts,
}, null, 2) + '\n');
console.log(JSON.stringify(counts));
