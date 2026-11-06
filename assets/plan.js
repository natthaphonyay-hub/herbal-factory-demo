// พยากรณ์ความต้องการรายเดือนของทุกรายการในคลัง และทางไปเอกสารสรุปคงคลังกับแผนปีงบหน้า
// วิธีพยากรณ์: ปรับเรียบเอกซ์โพเนนเชียลแบบมีแนวโน้มหน่วง (Hyndman และ Athanasopoulos, FPP3 2021 บทที่ 8)
import { S, D, monthlyUsage, active, producing, isFG, fyOf } from './data.js';
import { holtForecast, holdoutError } from './logic.js';
import { esc, num, qty, qh, I, chip, tableWrap, monthLabel, itemHref } from './ui.js';

const KINDS = ['ยารับประทาน', 'ยาใช้ภายนอก', 'แห้ง', 'ผง', 'บรรจุภัณฑ์', 'เคมีภัณฑ์', 'ฉลาก'];
const cache = new Map();
// ผลพยากรณ์ของรายการหนึ่ง (เก็บไว้ตามจำนวนรายการเคลื่อนไหว จะคิดใหม่เมื่อมีการบันทึก)
export function forecastOf(code) {
  const key = `${code}:${S.movesByItem.get(code)?.length || 0}:${S.today}`;
  if (cache.has(key)) return cache.get(key);
  const hist = monthlyUsage(code, 12);
  const xs = hist.map((h) => h.qty);
  const f = holtForecast(xs, 24);
  const err = holdoutError(xs, 3);
  const r = { hist, xs, fc: f.fc, err, avg: xs.reduce((a, b) => a + b, 0) / xs.length, total: xs.reduce((a, b) => a + b, 0) };
  cache.set(key, r);
  return r;
}
// เดือนข้างหน้า (คีย์ปี-เดือน) นับจากเดือนถัดไป
export function nextMonths(n) {
  const [y, m] = S.today.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1 + i, 1)).toISOString().slice(0, 7));
}
export const reliability = (err) => (err === null ? { t: 'ข้อมูลน้อย', lv: 'exp' } : err <= 0.15 ? { t: `แม่น ±${num(err * 100)}%`, lv: 'ok' } : err <= 0.35 ? { t: `พอใช้ ±${num(err * 100)}%`, lv: 'warn' } : { t: `แกว่ง ±${num(err * 100)}%`, lv: 'crit' });

export function chart(code) {
  const f = forecastOf(code);
  const it = S.items.get(code);
  const months = [...f.hist.map((h) => ({ k: h.month, v: h.qty, a: true })), ...nextMonths(12).map((k, i) => ({ k, v: f.fc[i], a: false }))];
  const W = 760, H = 220, base = 180, top = 20, step = W / months.length, bw = Math.min(26, step - 6);
  const max = Math.max(...months.map((m) => m.v), 1);
  const y = (v) => base - ((base - top) * v) / max;
  const line = months.map((m, i) => `${i ? 'L' : 'M'}${(i * step + step / 2).toFixed(1)} ${y(m.v).toFixed(1)}`).join('');
  return `<figure class="fc-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="ยอดเบิกรายเดือน 12 เดือนที่ผ่านมาและพยากรณ์ 12 เดือนข้างหน้า ของ ${esc(it.name)}">
    <line class="base" x1="0" x2="${W}" y1="${base}" y2="${base}"/>
    ${months.map((m, i) => `<rect class="${m.a ? 'fc-act' : 'fc-fc'}" x="${(i * step + (step - bw) / 2).toFixed(1)}" y="${y(m.v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(base - y(m.v)).toFixed(1)}" rx="3"><title>${esc(monthLabel(m.k))} ${m.a ? 'เบิกจริง' : 'พยากรณ์'} ${num(m.v)} ${esc(it.unit)}</title></rect>${i % 3 === 0 ? `<text class="ax" x="${(i === 0 ? 2 : i * step + step / 2).toFixed(1)}" y="${base + 18}" text-anchor="${i === 0 ? 'start' : 'middle'}">${esc(monthLabel(m.k))}</text>` : ''}`).join('')}
    <path class="fc-line" d="${line}"/>
    <line class="fc-now" x1="${12 * step}" x2="${12 * step}" y1="${top - 6}" y2="${base}"/><text class="ax" x="${12 * step + 6}" y="${top + 4}">เริ่มพยากรณ์</text>
  </svg><figcaption class="legend"><span><i class="fc-act"></i>เบิกจริงรายเดือน</span><span><i class="fc-fc"></i>พยากรณ์</span></figcaption></figure>`;
}

// scope: 'store' = ทุกรายการ หรือ 'แปรรูป' / 'ผลิต' = รายการที่ฝ่ายนั้นผลิต
export function viewPlan(p, scope, room) {
  const kind = p.get('kind') || '';
  const q = (p.get('q') || '').trim().toLowerCase();
  const sel = p.get('item') || '';
  const pool = [...D.itemStats.values()].filter((s) => active(s.it) && (scope === 'store' ? true : s.it.lane === scope && s.it.make === 'make') && (!isFG(s.it) || producing(s.it)));
  const rows = pool.filter((s) => (!kind || s.it.kind === kind) && (!q || s.it.name.toLowerCase().includes(q) || s.it.code.includes(q)))
    .map((s) => ({ s, f: forecastOf(s.it.code) })).filter((x) => x.f.total > 0)
    .sort((a, b) => (b.f.fc[0] * (b.s.it.cost || 0)) - (a.f.fc[0] * (a.s.it.cost || 0)));
  const link = (o) => { const x = new URLSearchParams({ tab: 'plan', kind, q: p.get('q') || '', ...o }); for (const [k, v] of [...x]) if (!v) x.delete(k); return `#/${room}?${x}`; };
  const kinds = scope === 'store' ? KINDS : [...new Set(pool.map((s) => s.it.kind))];
  const fcPool = pool.filter((s) => (!q || s.it.name.toLowerCase().includes(q) || s.it.code.includes(q)) && forecastOf(s.it.code).total > 0);
  const nOf = (k) => fcPool.filter((s) => !k || s.it.kind === k).length;
  const fyNow = fyOf(S.today);
  const selRow = sel && D.itemStats.get(sel);
  return `<div class="work">
    <section class="panel" aria-labelledby="fc-h"><div class="panel-h"><h2 id="fc-h">พยากรณ์ความต้องการรายเดือน</h2><span class="meta">${rows.length} รายการที่มีการเบิกใน 12 เดือน เรียงตามมูลค่าเดือนหน้า</span></div>
      <div class="filters">${['', ...kinds].map((k) => `<a class="fchip" href="${link({ kind: k })}" ${k === kind ? 'aria-current="true"' : ''}>${esc(k || 'ทั้งหมด')} <span class="num">${nOf(k)}</span></a>`).join('')}
        <form class="search" data-form="planSearch" data-room="${room}" role="search"><label class="sr" for="pq">ค้นรายการ</label><input class="in" id="pq" name="q" value="${esc(p.get('q') || '')}" placeholder="ค้นชื่อหรือรหัส"><input type="hidden" name="kind" value="${esc(kind)}"><button class="btn btn-sm" type="submit">${I.search}ค้น</button></form></div>
      ${tableWrap(`<table><thead><tr><th>รายการ</th><th class="r">เบิก 12 เดือน</th><th class="r">เฉลี่ยต่อเดือน</th><th class="r">พยากรณ์เดือนหน้า</th><th class="r">3 เดือนข้างหน้า</th><th>ความแม่นย้อนหลัง</th><th class="r">คงคลังพอใช้</th></tr></thead><tbody>
      ${rows.slice(0, 50).map(({ s, f }) => { const rel = reliability(f.err); const months = f.fc[0] > 0 ? (s.released + s.quarantine) / f.fc[0] : null; return `<tr${sel === s.it.code ? ' class="is-target"' : ''}><td><a href="${link({ item: s.it.code })}">${esc(s.it.name)}</a><span class="sub-l mono">${s.it.code}</span></td><td class="r">${qh(s.it.code, f.total)}</td><td class="r"><span class="num">${num(f.avg)}</span></td><td class="r"><span class="num"><b>${num(f.fc[0])}</b></span></td><td class="r"><span class="num">${num(f.fc[0] + f.fc[1] + f.fc[2])}</span></td><td>${chip(rel.t, rel.lv)}</td><td class="r">${months === null ? '-' : `<span class="num">${num(months, 1)}</span><span class="u">เดือน</span>`}</td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">ไม่มีรายการที่มีการเบิก</td></tr>'}</tbody></table>`, 'พยากรณ์ความต้องการ')}
      ${rows.length > 50 ? `<p class="note">แสดง 50 รายการแรกจาก ${rows.length} ใช้ตัวกรองหรือช่องค้นเพื่อหารายการอื่น</p>` : ''}
      <p class="note">พยากรณ์ด้วยวิธีปรับเรียบเอกซ์โพเนนเชียลแบบมีแนวโน้มหน่วง เลือกค่าพารามิเตอร์ที่คลาดเคลื่อนน้อยสุดจากข้อมูล 12 เดือน (Hyndman และ Athanasopoulos, Forecasting: Principles and Practice 3rd ed. 2021 บทที่ 8) ความแม่นย้อนหลัง = ตัด 3 เดือนล่าสุดออก พยากรณ์จากเดือนที่เหลือ แล้วเทียบของจริง เกณฑ์แม่น พอใช้ แกว่ง ที่ 15% และ 35% (ค่าตั้งต้น รอหัวหน้ากลุ่มงานกำหนด)</p>
    </section>
    <div class="stack">
      ${selRow ? `<section class="panel" aria-labelledby="fd-h"><div class="panel-h"><h2 id="fd-h">${esc(selRow.it.name)}</h2><span class="meta"><a href="${itemHref(selRow.it.code)}">ดูรายละเอียด</a> <a href="${link({ item: '' })}">ปิด</a></span></div>${chart(sel)}
        <dl class="fields" style="margin-top:10px"><div><dt>คงคลังตรวจสอบแล้ว</dt><dd>${esc(qty(sel, selRow.released))}</dd></div><div><dt>พยากรณ์ 12 เดือนข้างหน้า</dt><dd>${esc(qty(sel, forecastOf(sel).fc.slice(0, 12).reduce((a, b) => a + b, 0)))}</dd></div><div><dt>จำนวนอย่างต่ำ</dt><dd>${esc(qty(sel, selRow.pol.rop))}</dd></div><div><dt>ความแม่นย้อนหลัง</dt><dd>${esc(reliability(forecastOf(sel).err).t)}</dd></div></dl></section>` : ''}
      <section class="panel" aria-labelledby="pd-h"><div class="panel-h"><h2 id="pd-h">เอกสารจากข้อมูลนี้</h2></div>
        <ul class="doc-list">
          <li><a href="#/doc?type=stock-summary${scope === 'store' ? '' : `&lane=${encodeURIComponent(scope)}`}">${I.doc}สรุปคงคลัง ณ วันนี้</a><span class="d">มูลค่าคงคลังตามประเภท ของถึงจุดสั่งซื้อ ใกล้หมดอายุ และของไม่เคลื่อนไหว</span></li>
          <li><a href="#/doc?type=fy-plan&fy=${fyNow + 1}${scope === 'store' ? '' : `&lane=${encodeURIComponent(scope)}`}">${I.doc}แผน${scope === 'store' ? 'จัดซื้อและผลิต' : scope === 'ผลิต' ? 'ผลิต' : 'แปรรูป'} ปีงบ ${fyNow + 1} รายไตรมาส</a><span class="d">จากพยากรณ์ หักของที่คาดว่าเหลือต้นปี บวกสต็อกกันชน พร้อมงบประมาณ</span></li>
          <li><a href="#/doc?type=fy-plan&fy=${fyNow}${scope === 'store' ? '' : `&lane=${encodeURIComponent(scope)}`}">${I.doc}แผนปีงบ ${fyNow} (ปีปัจจุบัน ส่วนที่เหลือ)</a><span class="d">ใช้ทบทวนแผนระหว่างปี</span></li>
        </ul></section>
    </div></div>`;
}
