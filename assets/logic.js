// สูตรคำนวณการแจ้งเตือน แยกไว้ไฟล์เดียวให้ตรวจง่าย
// ที่มา: MIT OCW ESD.260J (2006) บทที่ 11 และ 12, Gallego Columbia IEOR 4000 (2004) ข้อ 1.3.1,
// King, APICS magazine ก.ค. ถึง ส.ค. 2011, WHO TRS 1025 ภาคผนวก 7 (2020) ข้อ 12.30 และ 13.4

// ฟังก์ชันการแจกแจงปกติสะสม Φ(x) (Abramowitz และ Stegun 7.1.26)
export function normCdf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

// ค่า Z จากระดับบริการ (ผกผันของ Φ ด้วยการแบ่งครึ่งช่วง)
export function zFor(p) {
  let lo = -6, hi = 6;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (normCdf(mid) < p) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

export function meanSd(xs) {
  if (!xs.length) return { n: 0, mean: 0, sd: 0 };
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sd = xs.length > 1 ? Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1)) : 0;
  return { n: xs.length, mean, sd };
}

// สต็อกกันชน จุดสั่งซื้อ และระดับเติมเต็ม
// σDL = √(L̄·σd² + d̄²·σL²)   SS = Z·σDL   ROP = d̄·L̄ + SS   S = d̄·(R + L̄) + Z·σ(R+L)
export function policy({ d, sd, L, sL, csl, R }) {
  const z = zFor(csl);
  const sDL = Math.sqrt(L * sd * sd + d * d * sL * sL);
  const ss = z * sDL;
  const rop = d * L + ss;
  const sRL = Math.sqrt((R + L) * sd * sd + d * d * sL * sL);
  const S = d * (R + L) + z * sRL;
  return { z, sDL, ss, rop, S };
}

// โอกาสที่ของที่สั่งแล้วจะมาถึงก่อนของหมด: P = Φ((วันที่ของหมด − วันที่สั่ง − L̄) ÷ σL)
export function onTimeProbability({ daysFromOrderToStockout, L, sL }) {
  if (sL <= 0) return daysFromOrderToStockout >= L ? 1 : 0;
  return normCdf((daysFromOrderToStockout - L) / sL);
}

// ตัดสินผลจากโอกาสมาทัน (in-house): ถึงเป้า = ทัน, 50% ขึ้นไป = เสี่ยง, ต่ำกว่า 50% = ไม่ทัน
export function onTimeVerdict(p, target) {
  if (p >= target) return { level: 'ok', text: 'ทัน' };
  if (p >= 0.5) return { level: 'warn', text: 'เสี่ยง' };
  return { level: 'crit', text: 'ไม่ทัน' };
}

// ระดับเตือนวันหมดอายุ (WHO TRS 1025 ภาคผนวก 7 ข้อ 13.4 ให้ตรวจเป็นระยะ ตัวเลขวันเป็น in-house)
export function expiryLevel(daysLeft, cfg) {
  if (daysLeft === null || daysLeft === undefined) return null;
  if (daysLeft <= 0) return 'expired';
  if (daysLeft <= cfg.expiryCritDays) return 'crit';
  if (daysLeft <= cfg.expiryWarnDays) return 'warn';
  return 'ok';
}

// เลือกล็อตตามหลักหมดอายุก่อนจ่ายก่อน ถ้าวันหมดอายุเท่ากันใช้ล็อตที่รับก่อน (WHO TRS 1025 ภาคผนวก 7 ข้อ 12.30)
export function fefoPick(lots, qty) {
  const sorted = lots.slice().sort((a, b) => (a.exp_date || '9999').localeCompare(b.exp_date || '9999') || a.date_in.localeCompare(b.date_in));
  const picks = [];
  let need = qty;
  for (const l of sorted) {
    if (need <= 1e-9) break;
    const q = Math.min(l.qty_left, need);
    if (q > 0) { picks.push({ lot_no: l.lot_no, qty: q }); need -= q; }
  }
  return { picks, short: Math.max(0, need) };
}
