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
  { id: 'H01', th: 'ขมิ้นชัน', sci: 'Curcuma longa L.', part: 'เหง้า', fresh: '1001', dry: '2001', powder: '3001', yd: 0.18, farm: ['F01', 'F02'], cost: 20 },
  { id: 'H02', th: 'ไพล', sci: 'Zingiber montanum (J.Koenig) Link ex A.Dietr.', part: 'เหง้า', fresh: '1002', dry: '2002', powder: '3002', yd: 0.16, farm: ['F01', 'F03'], cost: 18 },
  { id: 'H03', th: 'ฟ้าทะลายโจร', sci: 'Andrographis paniculata (Burm.f.) Nees', part: 'ส่วนเหนือดิน', fresh: '1003', dry: '2003', powder: '3003', yd: 0.22, farm: ['F04'], cost: 25 },
  { id: 'H04', th: 'มะขามป้อม', sci: 'Phyllanthus emblica L.', part: 'ผล', fresh: '1004', dry: '2004', yd: 0.15, farm: ['F05'], cost: 30 },
  { id: 'H05', th: 'ขิง', sci: 'Zingiber officinale Roscoe', part: 'เหง้า', fresh: '1005', dry: '2005', powder: '3005', yd: 0.12, farm: ['F02', 'F06'], cost: 35 },
  { id: 'H06', th: 'เพชรสังฆาต', sci: 'Cissus quadrangularis L.', part: 'ลำต้น', fresh: '1007', dry: '2007', powder: '3007', yd: 0.1, farm: ['F06'], cost: 22 },
  { id: 'H07', th: 'ตะไคร้', sci: 'Cymbopogon citratus (DC.) Stapf', part: 'ต้น', fresh: '1008', dry: '2008', yd: 0.25, farm: ['F03', 'F05'], cost: 12 },
  { id: 'H08', th: 'บอระเพ็ด', sci: 'Tinospora crispa (L.) Hook.f. & Thomson', part: 'เถา', fresh: '1009', dry: '2009', powder: '3009', yd: 0.2, farm: ['F04', 'F06'], cost: 15 },
  { id: 'H09', th: 'กระชาย', sci: 'Boesenbergia rotunda (L.) Mansf.', part: 'เหง้า', fresh: '1010', dry: '2010', powder: '3010', yd: 0.15, farm: ['F01'], cost: 40 },
  { id: 'H10', th: 'มะระขี้นก', sci: 'Momordica charantia L.', part: 'ผล', fresh: '1011', dry: '2011', powder: '3011', yd: 0.1, farm: ['F05'], cost: 30 },
  { id: 'H11', th: 'เถาวัลย์เปรียง', sci: 'Derris scandens (Roxb.) Benth.', part: 'เถา', fresh: '1012', dry: '2012', powder: '3012', yd: 0.25, farm: ['F04'], cost: 18 },
  { id: 'H12', th: 'รางจืด', sci: 'Thunbergia laurifolia Lindl.', part: 'ใบ', fresh: '1013', dry: '2013', powder: '3013', yd: 0.2, farm: ['F02', 'F03'], cost: 20 },
  { id: 'H13', th: 'หญ้าหนวดแมว', sci: 'Orthosiphon aristatus (Blume) Miq.', part: 'ส่วนเหนือดิน', fresh: '1014', dry: '2014', yd: 0.2, farm: ['F06'], cost: 18 },
  { id: 'H14', th: 'ชุมเห็ดเทศ', sci: 'Senna alata (L.) Roxb.', part: 'ใบ', fresh: '1015', dry: '2015', powder: '3015', yd: 0.2, farm: ['F03'], cost: 12 },
  { id: 'H15', th: 'บัวบก', sci: 'Centella asiatica (L.) Urb.', part: 'ทั้งต้น', fresh: '1016', dry: '2016', powder: '3016', yd: 0.12, farm: ['F01', 'F02'], cost: 35 },
  { id: 'H16', th: 'พญายอ', sci: 'Clinacanthus nutans (Burm.f.) Lindau', part: 'ใบ', fresh: '1017', dry: '2017', yd: 0.18, farm: ['F05'], cost: 25 },
  { id: 'H17', th: 'กระเจี๊ยบแดง', sci: 'Hibiscus sabdariffa L.', part: 'กลีบเลี้ยง', fresh: '1018', dry: '2018', yd: 0.15, farm: ['F06'], cost: 30 },
  { id: 'H18', th: 'ขมิ้นอ้อย', sci: 'Curcuma zedoaria (Christm.) Roscoe', part: 'เหง้า', fresh: '1019', dry: '2019', powder: '3019', yd: 0.18, farm: ['F04', 'F05'], cost: 22 },
  { id: 'H19', th: 'มะแว้งเครือ', sci: 'Solanum trilobatum L.', part: 'ผล', fresh: '1020', dry: '2020', yd: 0.2, farm: ['F03', 'F06'], cost: 40 },
];
const HERB_TH = new Map(HERBS.map((h) => [h.th, h]));

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
  { id: 'C01', name: 'คลังเวชภัณฑ์ รพ.ก (สมมุติ)', type: 'โรงพยาบาล', credit: 60, late: 15, w: 40, cycle: 14, off: 0, mix: 1 },
  { id: 'C02', name: 'รพ.ข (สมมุติ)', type: 'โรงพยาบาล', credit: 60, late: 35, w: 15, cycle: 14, off: 5, mix: 0.7 },
  { id: 'C03', name: 'รพ.ค (สมมุติ)', type: 'โรงพยาบาล', credit: 90, late: 50, w: 12, cycle: 28, off: 9, mix: 0.6 },
  { id: 'C04', name: 'รพ.สต.ง (สมมุติ)', type: 'รพ.สต.', credit: 30, late: 5, w: 6, cycle: 28, off: 3, mix: 0.25 },
  { id: 'C05', name: 'รพ.สต.จ (สมมุติ)', type: 'รพ.สต.', credit: 30, late: 12, w: 6, cycle: 28, off: 12, mix: 0.25 },
  { id: 'C06', name: 'รพ.สต.ฉ (สมมุติ)', type: 'รพ.สต.', credit: 30, late: 0, w: 5, cycle: 28, off: 19, mix: 0.25 },
  { id: 'C07', name: 'ร้านมูลนิธิ (สมมุติ)', type: 'ร้านค้า', credit: 0, late: 0, w: 10, cycle: 7, off: 2, mix: 0.4 },
  { id: 'C08', name: 'คลินิกแพทย์แผนไทย ช (สมมุติ)', type: 'คลินิก', credit: 30, late: 25, w: 6, cycle: 28, off: 15, mix: 0.3 },
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
  { id: 'U08', name: 'วิทย์ (สมมุติ)', role: 'ผู้อำนวยการโรงพยาบาล', dept: 'บริหาร' },
];

// ยาสำเร็จรูป 100 รายการ (ชื่อสมมุติ ใช้สมุนไพรเดี่ยวตามรูปแบบยา) 9 รายการแรกคงรหัสเดิม
const BUY = [
  { code: '91001', name: 'ขวดพลาสติกใส่แคปซูล 100 เม็ด', kind: 'บรรจุภัณฑ์', unit: 'ใบ', pack: 500, sup: 'S02', cost: 3.5 },
  { code: '91002', name: 'ขวดแก้วยาน้ำ 60 มล.', kind: 'บรรจุภัณฑ์', unit: 'ใบ', pack: 500, sup: 'S02', cost: 6 },
  { code: '91003', name: 'ซองชาพร้อมกล่อง 20 ซอง', kind: 'บรรจุภัณฑ์', unit: 'ชุด', pack: 200, sup: 'S06', cost: 12 },
  { code: '91004', name: 'หลอดอลูมิเนียม 30 ก.', kind: 'บรรจุภัณฑ์', unit: 'หลอด', pack: 1000, sup: 'S01', backup: 'S05', cost: 4.2 },
  { code: '91005', name: 'ขวดน้ำมัน 15 มล.', kind: 'บรรจุภัณฑ์', unit: 'ใบ', pack: 500, sup: 'S02', cost: 3 },
  { code: '91006', name: 'ผ้าดิบห่อลูกประคบ', kind: 'บรรจุภัณฑ์', unit: 'ผืน', pack: 500, sup: 'S06', cost: 6 },
  { code: '91007', name: 'ขวดลูกกลิ้ง 8 มล.', kind: 'บรรจุภัณฑ์', unit: 'ใบ', pack: 1000, sup: 'S02', cost: 4.5 },
  { code: '91008', name: 'ขวดพลาสติกใส่แคปซูล 50 เม็ด', kind: 'บรรจุภัณฑ์', unit: 'ใบ', pack: 500, sup: 'S02', cost: 2.5 },
  { code: '91009', name: 'ซองชาพร้อมกล่อง 10 ซอง', kind: 'บรรจุภัณฑ์', unit: 'ชุด', pack: 200, sup: 'S06', cost: 7 },
  { code: '91010', name: 'ขวดแก้วยาน้ำ 120 มล.', kind: 'บรรจุภัณฑ์', unit: 'ใบ', pack: 500, sup: 'S02', cost: 8 },
  { code: '91011', name: 'หลอดอลูมิเนียม 15 ก.', kind: 'บรรจุภัณฑ์', unit: 'หลอด', pack: 1000, sup: 'S05', cost: 3.2 },
  { code: '91012', name: 'ขวดน้ำมัน 30 มล.', kind: 'บรรจุภัณฑ์', unit: 'ใบ', pack: 500, sup: 'S02', cost: 4 },
  { code: '91013', name: 'ตลับยาหม่อง 10 ก.', kind: 'บรรจุภัณฑ์', unit: 'ใบ', pack: 1000, sup: 'S02', cost: 3.5 },
  { code: '91014', name: 'ตลับยาหม่อง 30 ก.', kind: 'บรรจุภัณฑ์', unit: 'ใบ', pack: 500, sup: 'S02', cost: 6 },
  { code: '91015', name: 'หลอดยาดม', kind: 'บรรจุภัณฑ์', unit: 'ใบ', pack: 1000, sup: 'S02', cost: 4 },
  { code: '91016', name: 'ขวดลูกกลิ้ง 3 มล.', kind: 'บรรจุภัณฑ์', unit: 'ใบ', pack: 1000, sup: 'S02', cost: 3.5 },
  { code: '91017', name: 'กระปุกผงยา 50 ก.', kind: 'บรรจุภัณฑ์', unit: 'ใบ', pack: 500, sup: 'S02', cost: 5 },
  { code: '91018', name: 'ขวดพลาสติกใส่แคปซูล 200 เม็ด', kind: 'บรรจุภัณฑ์', unit: 'ใบ', pack: 500, sup: 'S02', cost: 5.5 },
  { code: '91019', name: 'ขวดน้ำมัน 60 มล.', kind: 'บรรจุภัณฑ์', unit: 'ใบ', pack: 500, sup: 'S02', cost: 5.5 },
  { code: '91020', name: 'ตลับยาหม่อง 50 ก.', kind: 'บรรจุภัณฑ์', unit: 'ใบ', pack: 500, sup: 'S02', cost: 8 },
  { code: '92001', name: 'แคปซูลเปล่าเบอร์ 0', kind: 'เคมีภัณฑ์', unit: 'เม็ด', pack: 50000, sup: 'S07', shelf: 1095, cost: 0.05 },
  { code: '92002', name: 'น้ำเชื่อม', kind: 'เคมีภัณฑ์', unit: 'กก.', pack: 25, sup: 'S03', shelf: 365, cost: 45 },
  { code: '92003', name: 'ครีมเบส', kind: 'เคมีภัณฑ์', unit: 'กก.', pack: 20, sup: 'S03', shelf: 540, cost: 180 },
  { code: '92004', name: 'น้ำมันมะพร้าว', kind: 'เคมีภัณฑ์', unit: 'ลิตร', pack: 20, sup: 'S03', shelf: 365, cost: 90 },
  { code: '92005', name: 'การบูร เมนทอล พิมเสน', kind: 'เคมีภัณฑ์', unit: 'กก.', pack: 5, sup: 'S03', shelf: 1095, cost: 900 },
  { code: '92006', name: 'ขี้ผึ้งและวาสลีนสำหรับยาหม่อง', kind: 'เคมีภัณฑ์', unit: 'กก.', pack: 10, sup: 'S03', shelf: 730, cost: 120 },
];
const PRODUCTS = [];
const prod = (o) => PRODUCTS.push(o);
const H = (th, form) => HERB_TH.get(th)[form];
// 9 รายการเดิม (รหัสและสูตรเดิม)
prod({ code: '4001', name: 'ยาขมิ้นชันแคปซูล 500 มก. 100 แคปซูล', short: 'ขมิ้นชันแคปซูล 100', unit: 'ขวด', d: 36, price: 120, shelf: 730, batch: 600, days: [3, 5], bom: [['3001', 0.05], ['92001', 100], ['91001', 1]] });
prod({ code: '4002', name: 'ยาฟ้าทะลายโจรแคปซูล 500 มก. 100 แคปซูล', short: 'ฟ้าทะลายโจรแคปซูล 100', unit: 'ขวด', d: 30, price: 100, shelf: 730, batch: 600, days: [3, 5], bom: [['3003', 0.05], ['92001', 100], ['91001', 1]] });
prod({ code: '4003', name: 'ยาเพชรสังฆาตแคปซูล 400 มก. 100 แคปซูล', short: 'เพชรสังฆาตแคปซูล 100', unit: 'ขวด', d: 8, price: 150, shelf: 730, batch: 300, days: [3, 5], bom: [['3007', 0.04], ['92001', 100], ['91001', 1]] });
prod({ code: '4004', name: 'ยาแก้ไอมะขามป้อม 60 มล.', short: 'แก้ไอมะขามป้อม 60', unit: 'ขวด', d: 40, price: 35, shelf: 365, batch: 1000, days: [2, 4], key: true, bom: [['2004', 0.012], ['92002', 0.04], ['91002', 1]] });
prod({ code: '4005', name: 'ชาชงขิง 20 ซอง', short: 'ชาชงขิง 20', unit: 'กล่อง', d: 12, price: 45, shelf: 540, batch: 400, days: [2, 3], bom: [['2005', 0.04], ['91003', 1]] });
prod({ code: '5001', name: 'ครีมไพล 30 ก.', short: 'ครีมไพล 30', unit: 'หลอด', d: 45, price: 60, shelf: 540, batch: 1000, days: [2, 4], key: true, bom: [['2002', 0.004], ['92003', 0.026], ['91004', 1]] });
prod({ code: '5002', name: 'น้ำมันไพล 15 มล.', short: 'น้ำมันไพล 15', unit: 'ขวด', d: 40, price: 45, shelf: 730, batch: 1000, days: [2, 3], key: true, bom: [['2002', 0.003], ['92004', 0.014], ['91005', 1]] });
prod({ code: '5003', name: 'ลูกประคบสมุนไพร 200 ก.', short: 'ลูกประคบ 200', unit: 'ลูก', d: 30, price: 50, shelf: 180, batch: 600, days: [2, 3], key: true, bom: [['2002', 0.08], ['2001', 0.03], ['2008', 0.03], ['91006', 1]] });
prod({ code: '5004', name: 'พิมเสนน้ำ 8 มล.', short: 'พิมเสนน้ำ 8', unit: 'ขวด', d: 50, price: 25, shelf: 730, batch: 1500, days: [1, 2], key: true, bom: [['92005', 0.006], ['92004', 0.002], ['91007', 1]] });
// รายการใหม่ ความต้องการต่อวันกำหนดตายตัวจากรูปแบบยาและลำดับ (ไม่ใช้ตัวสุ่ม)
let oral = 5, ext = 4;
const nextOral = () => `4${String(++oral).padStart(3, '0')}`;
const nextExt = () => `5${String(++ext).padStart(3, '0')}`;
const vary = (base, i) => Math.max(1, Math.round(base * [1, 0.7, 1.3, 0.8, 1.1][i % 5]));
const CAPS = ['ขมิ้นชัน', 'ฟ้าทะลายโจร', 'เพชรสังฆาต', 'บอระเพ็ด', 'กระชาย', 'มะระขี้นก', 'เถาวัลย์เปรียง', 'รางจืด', 'ชุมเห็ดเทศ', 'บัวบก', 'ขมิ้นอ้อย', 'ไพล', 'ขิง'];
CAPS.forEach((th, i) => {
  const mg = th === 'เพชรสังฆาต' ? 400 : 500;
  if (i >= 3) prod({ code: nextOral(), name: `ยา${th}แคปซูล ${mg} มก. 100 แคปซูล`, short: `${th}แคปซูล 100`, unit: 'ขวด', d: vary(6, i), price: 110, shelf: 730, batch: 400, days: [3, 5], bom: [[H(th, 'powder'), mg / 1e4], ['92001', 100], ['91001', 1]] });
  prod({ code: nextOral(), name: `ยา${th}แคปซูล ${mg} มก. 50 แคปซูล`, short: `${th}แคปซูล 50`, unit: 'ขวด', d: vary(4, i + 1), price: 60, shelf: 730, batch: 500, days: [3, 5], bom: [[H(th, 'powder'), mg / 2e4], ['92001', 50], ['91008', 1]] });
  if (i < 4) prod({ code: nextOral(), name: `ยา${th}แคปซูล ${mg} มก. 200 แคปซูล`, short: `${th}แคปซูล 200`, unit: 'ขวด', d: vary(3, i + 2), price: 210, shelf: 730, batch: 300, days: [3, 5], bom: [[H(th, 'powder'), mg / 5e3], ['92001', 200], ['91018', 1]] });
});
const TEAS = ['ขิง', 'ตะไคร้', 'หญ้าหนวดแมว', 'รางจืด', 'กระเจี๊ยบแดง', 'บัวบก', 'มะระขี้นก', 'ชุมเห็ดเทศ'];
TEAS.forEach((th, i) => {
  if (i > 0) prod({ code: nextOral(), name: `ชาชง${th} 20 ซอง`, short: `ชาชง${th} 20`, unit: 'กล่อง', d: vary(5, i), price: 45, shelf: 540, batch: 300, days: [2, 3], bom: [[H(th, 'dry'), 0.04], ['91003', 1]] });
  prod({ code: nextOral(), name: `ชาชง${th} 10 ซอง`, short: `ชาชง${th} 10`, unit: 'กล่อง', d: vary(3, i + 3), price: 25, shelf: 540, batch: 300, days: [2, 3], bom: [[H(th, 'dry'), 0.02], ['91009', 1]] });
});
const SYRUPS = [['มะขามป้อม', 'ยาแก้ไอมะขามป้อม'], ['มะแว้งเครือ', 'ยาแก้ไอมะแว้ง'], ['ขิง', 'ยาน้ำขิง']];
SYRUPS.forEach(([th, nm], i) => {
  if (i > 0) prod({ code: nextOral(), name: `${nm} 60 มล.`, short: `${nm.replace('ยา', '')} 60`, unit: 'ขวด', d: vary(8, i), price: 35, shelf: 365, batch: 600, days: [2, 4], bom: [[H(th, 'dry'), 0.012], ['92002', 0.04], ['91002', 1]] });
  prod({ code: nextOral(), name: `${nm} 120 มล.`, short: `${nm.replace('ยา', '')} 120`, unit: 'ขวด', d: vary(4, i + 1), price: 60, shelf: 365, batch: 400, days: [2, 4], bom: [[H(th, 'dry'), 0.024], ['92002', 0.08], ['91010', 1]] });
});
['ขมิ้นชัน', 'ฟ้าทะลายโจร', 'บัวบก', 'กระชาย', 'มะระขี้นก', 'ขิง'].forEach((th, i) => prod({ code: nextOral(), name: `ผง${th}บรรจุกระปุก 50 ก.`, short: `ผง${th} 50`, unit: 'กระปุก', d: vary(2, i), price: 80, shelf: 365, batch: 200, days: [2, 3], bom: [[H(th, 'powder'), 0.05], ['91017', 1]] }));
const CREAMS = ['ไพล', 'พญายอ', 'บัวบก', 'ขมิ้นชัน', 'ชุมเห็ดเทศ', 'เถาวัลย์เปรียง'];
CREAMS.forEach((th, i) => {
  if (i > 0) prod({ code: nextExt(), name: `ครีม${th} 30 ก.`, short: `ครีม${th} 30`, unit: 'หลอด', d: vary(6, i), price: 60, shelf: 540, batch: 600, days: [2, 4], bom: [[H(th, 'dry'), 0.004], ['92003', 0.026], ['91004', 1]] });
  prod({ code: nextExt(), name: `ครีม${th} 15 ก.`, short: `ครีม${th} 15`, unit: 'หลอด', d: vary(5, i + 2), price: 35, shelf: 540, batch: 600, days: [2, 4], bom: [[H(th, 'dry'), 0.002], ['92003', 0.013], ['91011', 1]] });
});
const OILS = ['ไพล', 'เถาวัลย์เปรียง', 'ขิง', 'ตะไคร้', 'กระชาย'];
OILS.forEach((th, i) => {
  if (i > 0) prod({ code: nextExt(), name: `น้ำมัน${th} 15 มล.`, short: `น้ำมัน${th} 15`, unit: 'ขวด', d: vary(6, i), price: 45, shelf: 730, batch: 600, days: [2, 3], bom: [[H(th, 'dry'), 0.003], ['92004', 0.014], ['91005', 1]] });
  prod({ code: nextExt(), name: `น้ำมัน${th} 30 มล.`, short: `น้ำมัน${th} 30`, unit: 'ขวด', d: vary(4, i + 1), price: 80, shelf: 730, batch: 400, days: [2, 3], bom: [[H(th, 'dry'), 0.006], ['92004', 0.028], ['91012', 1]] });
  if (i < 2) prod({ code: nextExt(), name: `น้ำมัน${th} 60 มล.`, short: `น้ำมัน${th} 60`, unit: 'ขวด', d: vary(2, i + 2), price: 140, shelf: 730, batch: 300, days: [2, 3], bom: [[H(th, 'dry'), 0.012], ['92004', 0.056], ['91019', 1]] });
});
const BALMS = ['ไพล', 'ตะไคร้', 'ขมิ้นชัน', 'พญายอ', 'เถาวัลย์เปรียง'];
BALMS.forEach((th, i) => {
  prod({ code: nextExt(), name: `ยาหม่อง${th} 10 ก.`, short: `ยาหม่อง${th} 10`, unit: 'ตลับ', d: vary(8, i), price: 30, shelf: 730, batch: 800, days: [1, 3], bom: [[H(th, 'dry'), 0.001], ['92006', 0.008], ['92005', 0.001], ['91013', 1]] });
  prod({ code: nextExt(), name: `ยาหม่อง${th} 30 ก.`, short: `ยาหม่อง${th} 30`, unit: 'ตลับ', d: vary(4, i + 1), price: 70, shelf: 730, batch: 400, days: [1, 3], bom: [[H(th, 'dry'), 0.003], ['92006', 0.024], ['92005', 0.003], ['91014', 1]] });
  if (th === 'ไพล' || th === 'พญายอ') prod({ code: nextExt(), name: `ยาหม่อง${th} 50 ก.`, short: `ยาหม่อง${th} 50`, unit: 'ตลับ', d: vary(2, i + 2), price: 110, shelf: 730, batch: 200, days: [1, 3], bom: [[H(th, 'dry'), 0.005], ['92006', 0.04], ['92005', 0.005], ['91020', 1]] });
});
prod({ code: nextExt(), name: 'ยาดมสมุนไพร', short: 'ยาดมสมุนไพร', unit: 'หลอด', d: 10, price: 25, shelf: 730, batch: 1000, days: [1, 2], bom: [['2002', 0.002], ['2008', 0.001], ['92005', 0.001], ['91015', 1]] });
prod({ code: nextExt(), name: 'ยาดมตะไคร้', short: 'ยาดมตะไคร้', unit: 'หลอด', d: 6, price: 25, shelf: 730, batch: 1000, days: [1, 2], bom: [['2008', 0.003], ['92005', 0.001], ['91015', 1]] });
prod({ code: nextExt(), name: 'พิมเสนน้ำ 3 มล.', short: 'พิมเสนน้ำ 3', unit: 'ขวด', d: 12, price: 15, shelf: 730, batch: 1000, days: [1, 2], bom: [['92005', 0.0023], ['92004', 0.0008], ['91016', 1]] });
prod({ code: nextExt(), name: 'ลูกประคบสมุนไพร 100 ก.', short: 'ลูกประคบ 100', unit: 'ลูก', d: 10, price: 30, shelf: 180, batch: 600, days: [2, 3], bom: [['2002', 0.04], ['2001', 0.015], ['2008', 0.015], ['91006', 1]] });
if (PRODUCTS.length !== 100) throw new Error(`ยาสำเร็จรูป ${PRODUCTS.length} รายการ ต้องได้ 100`);
// ฉลาก 1 แบบต่อ 1 ผลิตภัณฑ์ รหัส 93001 ถึง 93100 ตามลำดับรายการ
PRODUCTS.forEach((p, i) => { const code = `93${String(i + 1).padStart(3, '0')}`; BUY.push({ code, name: `ฉลาก${p.short}`, kind: 'ฉลาก', unit: 'ดวง', pack: 2000, sup: 'S04', cost: 0.6 }); p.bom.push([code, 1]); });

// ---------- ทะเบียนรายการ ----------
const items = new Map();
const add = (o) => items.set(o.code, { shelf: 0, key: false, d: 0, ...o });
for (const h of HERBS) {
  add({ code: h.fresh, name: `${h.th}สด`, kind: 'สด', unit: 'กก.', shelf: 3, herb: h.id, make: 'farm', cost: h.cost });
  add({ code: h.dry, name: `${h.th}แห้ง`, kind: 'แห้ง', unit: 'กก.', shelf: 730, herb: h.id, make: 'make', lane: 'แปรรูป', from: h.fresh, yield: h.yd, batch: 20, days: [4, 7], cost: Math.round((h.cost / h.yd) * 100) / 100 });
  if (h.powder) add({ code: h.powder, name: `ผง${h.th}`, kind: 'ผง', unit: 'กก.', shelf: 365, herb: h.id, make: 'make', lane: 'แปรรูป', from: h.dry, yield: 0.95, batch: 15, days: [2, 3], cost: Math.round((h.cost / h.yd / 0.95) * 100) / 100 });
}
for (const b of BUY) add({ ...b, make: 'buy' });
for (const p of PRODUCTS) add({ code: p.code, name: p.name, kind: p.code.startsWith('4') ? 'ยารับประทาน' : 'ยาใช้ภายนอก', unit: p.unit, shelf: p.shelf, key: !!p.key, make: 'make', lane: 'ผลิต', batch: p.batch, days: p.days, price: p.price, bom: p.bom, d: p.d, cost: Math.round(p.bom.reduce((t, [c, q]) => t + q * (items.get(c).cost || 0), 0) * 100) / 100 });
const HERB_BY_CODE = new Map();
for (const h of HERBS) for (const c of [h.fresh, h.dry, h.powder].filter(Boolean)) HERB_BY_CODE.set(c, h);

// ความต้องการตามแผนต่อวัน กระจายจากยาสำเร็จรูปลงไปหาวัตถุดิบ
for (const p of PRODUCTS) for (const [c, q] of p.bom) { const it = items.get(c); it.d += p.d * q; if (p.key) it.key = true; }
for (const h of HERBS) if (h.powder) { const pw = items.get(h.powder); items.get(h.dry).d += pw.d / 0.95; if (pw.key) items.get(h.dry).key = true; }

const UNIT_INT = new Set(['ใบ', 'หลอด', 'ขวด', 'เม็ด', 'ชุด', 'ผืน', 'ดวง', 'ลูก', 'กล่อง', 'ตลับ', 'กระปุก']);
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
  const sd = it.lane === 'ผลิต' ? Math.sqrt(d * 12) : Math.sqrt(d * parentBatch); // ยาสำเร็จรูปขายเป็นรอบ 1 ถึง 4 สัปดาห์ ความต้องการรายวันจึงกระจุก
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
  if (it.code === '3001' && d >= -9 && !flags.qcDelay) { lot.relDue = 4; lot.qcDelay = true; flags.qcDelay = true; } // ฉากตัวอย่าง: ผลตรวจล่าช้า
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

// ลูกค้าสั่งเป็นรอบ (โรงพยาบาลทุก 2 ถึง 4 สัปดาห์ ร้านค้าทุกสัปดาห์) แต่ละรายสั่งเฉพาะรายการที่ตัวเองใช้
const wSum = CUSTOMERS.reduce((t, c) => t + c.w, 0);
const hash = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const stocks = (c, p) => c.mix >= 1 || hash(`${c.id}:${p.code}`) < c.mix;
function sell(d) {
  if (!isWeekday(d)) return;
  for (const c of CUSTOMERS) {
    const k = d - START - c.off;
    const onCycle = (x) => x >= 0 && x % c.cycle === 0;
    if (!(onCycle(k) || (dow(d) === 1 && (onCycle(k - 1) || onCycle(k - 2))))) continue; // รอบที่ตรงเสาร์อาทิตย์ เลื่อนมาวันจันทร์
    const day = d;
    const ls = [];
    for (const p of PRODUCTS) {
      if (!stocks(c, p)) continue;
      const q = poisson(p.d * (c.w / wSum) * c.cycle / Math.max(0.25, c.mix));
      if (q <= 0) continue;
      const { taken, short } = issueFEFO(p.code, q, day, c.name, 'FM-19 ใบเบิกยาสำเร็จรูป', 'U07');
      if (short > 0) shortages.push({ date: day, item_code: p.code, qty_short: short, customer_id: c.id });
      for (const t of taken) ls.push({ item_code: p.code, lot_no: t.lot, qty: t.qty, price: p.price, amount: t.qty * p.price });
    }
    if (!ls.length) continue;
    const inv = `IV${fy2(day)}-${pad(nextSeq(`IV-${fy2(day)}`), 4)}`;
    const total = ls.reduce((s2, l) => s2 + l.amount, 0);
    const due = day + c.credit;
    let paid = c.credit === 0 ? day : due + Math.max(0, Math.round(normal(c.late, c.late / 2 + 2)));
    if (paid > 0) paid = null;
    invoices.push({ inv_no: inv, date: day, customer_id: c.id, total, due, paid });
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
  if (d > START) sell(d);
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

// ผลตรวจที่เจ้าหน้าที่ฝ่ายควบคุมคุณภาพบันทึกแล้ว รอหัวหน้าฝ่ายอนุมัติปล่อยผ่าน (คนตรวจกับคนอนุมัติเป็นคนละคน)
// ล็อตที่รอมาครบเวลาตรวจปกติ (ยาสำเร็จรูป 5 วัน อื่นๆ 2 วัน) มีผลแล้ว ยกเว้นล็อตฉากตัวอย่างผลตรวจล่าช้า
// ไม่ใช้ตัวสุ่ม ไฟล์อื่นจึงเหมือนเดิมทุกตัวอักษร
const qcResults = lots.filter((l) => l.status === 'รอปล่อยผ่าน' && l.left > 1e-9 && !l.qcDelay).flatMap((l) => {
  const testDays = items.get(l.item).lane === 'ผลิต' ? 5 : 2;
  return -l.date_in >= testDays ? [{ date: l.date_in + testDays, lot_no: l.lot_no, item_code: l.item, result: 'ผ่านเกณฑ์', checker_id: 'U04', note: 'ผลตรวจผ่านเกณฑ์ตามข้อกำหนด (สมมุติ)' }] : [];
});

// ---------- ทะเบียนเครื่องมือ อุปกรณ์ (FM-43) และประวัติบำรุงรักษา สอบเทียบ (FM-08) ----------
// คอลัมน์ตาม FM-43 ฉบับ 2569 ชื่อบริษัทและหมายเลขทั้งหมดสมมุติ
const ASSETS = [
  ['EQ-01', 'เครื่องล้างสมุนไพร', 'ห้องรับและล้างวัตถุดิบ', 'U02', 2562, 'SOP-PD-10', 180, 0],
  ['EQ-02', 'เครื่องหั่นสมุนไพร', 'ห้องรับและล้างวัตถุดิบ', 'U02', 2562, 'SOP-PD-11', 180, 0],
  ['EQ-03', 'ตู้อบลมร้อน ตู้ที่ 1', 'ห้องอบ', 'U02', 2560, 'SOP-PD-13', 90, 0],
  ['EQ-04', 'ตู้อบลมร้อน ตู้ที่ 2', 'ห้องอบ', 'U02', 2564, 'SOP-PD-13', 90, 0],
  ['EQ-05', 'เครื่องบดสมุนไพร', 'ห้องบดร่อน', 'U02', 2561, 'SOP-PD-15', 90, 0],
  ['EQ-06', 'เครื่องร่อนผงยา', 'ห้องบดร่อน', 'U02', 2561, 'SOP-PD-16', 180, 0],
  ['EQ-07', 'เครื่องผสมผงยา', 'ห้องผสม', 'U03', 2563, 'SOP-PD-17', 180, 0],
  ['EQ-08', 'เครื่องบรรจุแคปซูลอัตโนมัติ', 'ห้องบรรจุแคปซูล', 'U03', 2566, 'SOP-PD-18', 90, 0],
  ['EQ-09', 'เครื่องบรรจุแคปซูลกึ่งอัตโนมัติ', 'ห้องบรรจุแคปซูล', 'U03', 2559, 'SOP-PD-18', 90, 0],
  ['EQ-10', 'เครื่องกวนผสมครีม', 'ห้องผลิตยาใช้ภายนอก', 'U03', 2563, 'SOP-PD-20', 180, 0],
  ['EQ-11', 'เครื่องบรรจุครีมลงหลอด', 'ห้องผลิตยาใช้ภายนอก', 'U03', 2565, 'SOP-PD-21', 90, 0],
  ['EQ-12', 'เครื่องบรรจุของเหลว', 'ห้องผลิตยาน้ำ', 'U03', 2562, 'SOP-PD-19', 180, 0],
  ['EQ-13', 'เครื่องซีลซองชา', 'ห้องบรรจุ', 'U03', 2560, 'SOP-PD-23', 180, 0],
  ['EQ-14', 'เครื่องปิดฝาขวด', 'ห้องบรรจุ', 'U03', 2564, 'SOP-PD-23', 180, 0],
  ['EQ-15', 'เครื่องชั่งละเอียด 0.01 ก.', 'ห้องควบคุมคุณภาพ', 'U05', 2565, 'SOP-QC-03', 180, 365],
  ['EQ-16', 'เครื่องชั่ง 30 กก.', 'คลังวัตถุดิบ', 'U01', 2561, 'SOP-PD-25', 365, 365],
  ['EQ-17', 'เครื่องวัดความชื้นสมุนไพร', 'ห้องควบคุมคุณภาพ', 'U05', 2566, 'SOP-QC-04', 180, 365],
  ['EQ-18', 'เทอร์โมไฮโกรมิเตอร์ ห้องผลิต', 'ห้องผลิตยาใช้ภายนอก', 'U05', 2565, 'FM-09', 365, 365],
  ['EQ-19', 'เทอร์โมไฮโกรมิเตอร์ คลังวัตถุดิบ', 'คลังวัตถุดิบ', 'U05', 2565, 'FM-09', 365, 365],
  ['EQ-20', 'เทอร์โมไฮโกรมิเตอร์ คลังยาสำเร็จรูป', 'คลังยาสำเร็จรูป', 'U05', 2565, 'FM-09', 365, 365],
  ['EQ-21', 'เครื่องวัดความเป็นกรดด่าง', 'ห้องควบคุมคุณภาพ', 'U05', 2564, 'SOP-QC-05', 365, 365],
  ['EQ-22', 'ตู้เย็นเก็บตัวอย่างเก็บสงวน', 'ห้องควบคุมคุณภาพ', 'U05', 2563, 'FM-26', 365, 0],
];
const VENDORS = ['บริษัท เครื่องจักรสมุนไพร ก จำกัด (สมมุติ)', 'บริษัท เครื่องมือวิทยาศาสตร์ ข จำกัด (สมมุติ)', 'ห้างหุ้นส่วน ช่างกล ค (สมมุติ)'];
// ฉากตัวอย่าง: สอบเทียบใกล้ครบ เกินกำหนด บำรุงรักษาใกล้ครบ และเครื่องชำรุด
const LAST = { 'EQ-15': { cal: -355 }, 'EQ-18': { cal: -370 }, 'EQ-08': { pm: -85 }, 'EQ-13': { pm: -40 } };
const assets = [];
const maint = [];
ASSETS.forEach(([id, name, room, owner, year, sop, pmDays, calDays], i) => {
  const vendor = VENDORS[i % VENDORS.length];
  const lastPm = LAST[id]?.pm ?? -((i * 13) % Math.max(20, pmDays - 10)) - 5;
  const lastCal = calDays ? (LAST[id]?.cal ?? -((i * 29) % (calDays - 40)) - 20) : null;
  for (let t = lastPm; t >= START; t -= pmDays) maint.push({ date: t, asset_id: id, type: 'บำรุงรักษาตามแผน', detail: 'ทำความสะอาด หล่อลื่น ตรวจสภาพและความปลอดภัยตามแผนบำรุงรักษา', by: 'ช่างโรงพยาบาล (สมมุติ)', checker_id: owner, result: 'ใช้งานได้' });
  if (calDays) for (let t = lastCal; t >= START - 30; t -= calDays) maint.push({ date: t, asset_id: id, type: 'สอบเทียบ', detail: 'สอบเทียบโดยหน่วยงานภายนอก มีใบรับรองผลการสอบเทียบ', by: VENDORS[1], checker_id: 'U05', result: 'ผ่านเกณฑ์' });
  let status = 'ใช้งาน', note = '';
  if (id === 'EQ-13') { status = 'ชำรุด'; note = 'ฮีตเตอร์ซีลเสีย รออะไหล่'; maint.push({ date: -3, asset_id: id, type: 'ซ่อม', detail: 'ซีลไม่ติด ตรวจพบฮีตเตอร์ซีลเสีย สั่งอะไหล่แล้ว', by: VENDORS[2], checker_id: owner, result: 'รออะไหล่' }); }
  assets.push({ asset_id: id, name, asset_no: `${6500 + (i % 7) * 10}-${String(1 + (i % 4)).padStart(3, '0')}-${String(i + 1).padStart(4, '0')}/${year}`, serial: `SN${year}${String(1000 + i * 37).slice(-4)}`, year, vendor, sop, room, owner_id: owner, status, pm_days: pmDays, cal_days: calDays, note });
});
maint.sort((a2, b2) => a2.date - b2.date || a2.asset_id.localeCompare(b2.asset_id));

// ---------- ใบขอซื้อ ตามขั้นตอนวิธีเฉพาะเจาะจง (ขอซื้อ เห็นชอบ อนุมัติ สั่งซื้อ ตรวจรับ ขอเบิกจ่าย จ่ายเงิน) ----------
const prs = pos.filter((x) => !x.history).map((x) => {
  const it = items.get(x.item);
  const insp = x.received !== null && x.received + 1 <= 0 ? x.received + 1 : null;
  const payReq = insp !== null && insp + 3 <= 0 ? insp + 3 : null;
  const paidOn = payReq !== null && payReq + 10 <= 0 ? payReq + 10 : null;
  return { pr_no: `ขซ${fy2(x.order - 3)}-${pad(nextSeq(`PR-${fy2(x.order - 3)}`), 3)}`, po_no: x.po_no, item_code: x.item, supplier_id: x.supplier, qty: x.qty, unit_cost: it.cost, amount: Math.round(x.qty * it.cost * 100) / 100, requested: x.order - 3, head_ok: x.order - 2, dir_ok: x.order - 1, ordered: x.order, received: x.received, inspected: insp, pay_requested: payReq, paid: paidOn,
    requested_by: 'U01', head_ok_by: 'U00', dir_ok_by: 'U08', ordered_by: 'U01', received_by: x.received !== null ? 'U01' : '', inspected_by: insp !== null ? 'U03' : '', pay_requested_by: payReq !== null ? 'U01' : '', paid_by: paidOn !== null ? 'U08' : '' };
});

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
// ผลิตภัณฑ์: เลข 24 หลัก (สมมุติ รูปแบบตัวเลขล้วน) สถานะ และเกณฑ์สูญเสีย ผลิตไม่เกิน 5% ครีมและเจล 15% บรรจุ 1% (เกณฑ์จาก FM-35 ตามที่พี่เคาะ)
const fgIndex = new Map(PRODUCTS.map((p, i) => [p.code, i]));
counts.items = csv('items', ['code', 'name', 'kind', 'unit', 'shelf_days', 'key', 'herb_id', 'make', 'lane', 'batch_or_pack', 'supplier_id', 'backup_supplier_id', 'price', 'cost', 'csl', 'code24', 'status', 'loss_pct', 'pack_loss_pct'],
  [...items.values()].map((it) => ({ code: it.code, name: it.name, kind: it.kind, unit: it.unit, shelf_days: it.shelf || '', key: it.key ? 'Y' : 'N', herb_id: it.herb || '', make: it.make, lane: it.lane || '', batch_or_pack: it.batch || it.pack || '', supplier_id: it.sup || '', backup_supplier_id: it.backup || '', price: it.price || '', cost: it.cost ?? '', code24: fgIndex.has(it.code) ? `9${it.code}${'0'.repeat(16)}${pad(fgIndex.get(it.code) + 1, 3)}` : '', status: fgIndex.has(it.code) ? 'ผลิตอยู่' : '', loss_pct: fgIndex.has(it.code) ? (it.name.startsWith('ครีม') ? 15 : 5) : '', pack_loss_pct: fgIndex.has(it.code) ? 1 : '', csl: it.make === 'farm' ? '' : it.key ? 0.95 : 0.9 })));
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
counts.qc_results = csv('qc_results', ['date', 'lot_no', 'item_code', 'result', 'checker_id', 'note'], qcResults.map((r) => ({ ...r, date: D(r.date) })));
counts.assets = csv('assets', ['asset_id', 'name', 'asset_no', 'serial', 'year', 'vendor', 'sop', 'room', 'owner_id', 'status', 'pm_days', 'cal_days', 'note'], assets);
counts.maintenance = csv('maintenance', ['date', 'asset_id', 'type', 'detail', 'by', 'checker_id', 'result'], maint.map((m) => ({ ...m, date: D(m.date) })));
counts.purchase_requests = csv('purchase_requests', ['pr_no', 'po_no', 'item_code', 'supplier_id', 'qty', 'unit_cost', 'amount', 'requested', 'head_ok', 'dir_ok', 'ordered', 'received', 'inspected', 'pay_requested', 'paid', 'requested_by', 'head_ok_by', 'dir_ok_by', 'ordered_by', 'received_by', 'inspected_by', 'pay_requested_by', 'paid_by'], prs.map((r) => ({ ...r, requested: D(r.requested), head_ok: D(r.head_ok), dir_ok: D(r.dir_ok), ordered: D(r.ordered), received: D(r.received), inspected: D(r.inspected), pay_requested: D(r.pay_requested), paid: D(r.paid) })));
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
