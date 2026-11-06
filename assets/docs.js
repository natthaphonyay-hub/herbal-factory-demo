// ศูนย์เอกสาร: ข้อมูลที่กรอกครั้งเดียว ออกเป็นแบบฟอร์มพร้อมพิมพ์ ช่องของแต่ละฟอร์มยึดแบบฟอร์ม FM ฉบับ GMP 2569 ของโรงงาน
// และชุดแบบฟอร์มจัดซื้อวิธีเฉพาะเจาะจง (OF06) ช่องที่ระบบไม่มีข้อมูลเว้นว่างให้เขียนเอง ไม่เติมเดา
import { ORG, PROC, PROC_STEPS, REQ_FORM } from './config.js';
import { S, D, staff, isFG, active, producing, thaiDate, thaiFullDate, daysBetween, addDays, fyOf, costOf, bomVersions, assetDue, prStage } from './data.js';
import { esc, num, num2, baht, qn, qty, short, I, chip, supName, custName, head, itemPicker, nav, backLink } from './ui.js';
import { forecastOf, nextMonths } from './plan.js';

const TYPES = [
  ['GMP แบบฟอร์มโรงงาน', [
    ['fm01', 'FM-01 บันทึกการตรวจรับ', 'ช่วงวันที่รับ'],
    ['fm02', 'FM-02 บันทึกการรับ-จ่าย บัญชีควบคุมวัสดุ', 'เลือกรายการ'],
    ['fm19', 'FM-19 ใบเบิกยาสำเร็จรูป', 'เลือกใบส่งของ'],
    ['req', 'FM-28 ถึง FM-33 ใบเบิกวัตถุดิบ บรรจุภัณฑ์ ฉลาก', 'เลือกงานผลิต'],
    ['fm23', 'FM-23 ใบรับซื้อวัตถุดิบสมุนไพร', 'เลือกเลขที่รับ'],
    ['fm35', 'FM-35 บันทึกการปล่อยผ่านผลิตภัณฑ์สำเร็จรูป', 'เลือกเดือน'],
    ['fm43', 'FM-43 ทะเบียนเครื่องมือ อุปกรณ์', ''],
    ['fm08', 'FM-08 บันทึกบำรุงรักษาและซ่อมเครื่องจักร', 'เลือกเครื่อง'],
    ['fm46', 'FM-46 ทะเบียนผู้ขายที่ได้รับการคัดเลือก', ''],
  ]],
  ['ผลิตภัณฑ์', [['products', 'ทะเบียนผลิตภัณฑ์', ''], ['formula', 'สูตรและต้นทุนต่อหน่วย', 'เลือกผลิตภัณฑ์']]],
  ['จัดซื้อวิธีเฉพาะเจาะจง', [
    ['pr-memo', 'บันทึกขออนุมัติจัดซื้อ', 'เลือกใบขอซื้อ'], ['pr-report', 'รายงานขออนุมัติจัดซื้อโดยวิธีเฉพาะเจาะจง', 'เลือกใบขอซื้อ'],
    ['po', 'ใบสั่งซื้อ', 'เลือกใบขอซื้อ'], ['inspect', 'ใบตรวจรับพัสดุ', 'เลือกใบขอซื้อ'], ['pay', 'บันทึกขออนุมัติเบิกจ่าย', 'เลือกใบขอซื้อ'],
  ]],
  ['สรุปและแผน', [['stock-summary', 'สรุปคงคลัง ณ วันนี้', ''], ['fy-plan', 'แผนจัดซื้อและผลิตปีงบ รายไตรมาส', 'เลือกปีงบ']]],
];
const TITLE = Object.fromEntries(TYPES.flatMap(([, xs]) => xs.map(([k, t]) => [k, t])));

// ---------- ตัวช่วย ----------
const blank = '<span class="blank"></span>';
const tick = (on) => `<span class="box${on ? ' on' : ''}" aria-label="${on ? 'เลือก' : 'ไม่เลือก'}">${on ? '✓' : ''}</span>`;
const sign = (role, name = '', date = '') => `<div class="sign"><div class="sign-line">ลงชื่อ ${name ? `<span class="sign-name">${esc(name)}</span>` : blank}</div><div>(${name ? esc(name) : blank})</div><div>${esc(role)}</div>${date ? `<div>วันที่ ${esc(thaiFullDate(date))}</div>` : '<div>วันที่ ' + blank + '</div>'}</div>`;
function paper(code, title, body, opt = {}) {
  return `<article class="paper${opt.landscape ? ' landscape' : ''}" aria-label="${esc(title)}">
    ${code ? `<div class="paper-code">${esc(code)}</div>` : ''}
    ${opt.noOrg ? '' : `<header class="paper-h"><div class="paper-org">${esc(ORG.factory)} ${esc(ORG.center)} ${esc(ORG.hospital)}</div><h2 class="paper-title">${esc(title)}</h2>${opt.sub ? `<div class="paper-sub">${opt.sub}</div>` : ''}</header>`}
    ${body}
    <footer class="paper-f">พิมพ์จากระบบต้นแบบ ข้อมูลจำลอง ใช้เป็นตัวอย่างเท่านั้น พิมพ์เมื่อ ${esc(thaiFullDate(S.today))}</footer></article>`;
}
// วันที่ เลขล็อต เลขเอกสาร และรหัส SOP ในแบบพิมพ์ ไม่ตัดกลางบรรทัด
const NW_RE = /(\d{1,2} [ก-๙]{1,3}\.[ก-๙]{1,3}\.(?: \d{2,4})?|(?:[A-Z]{1,3}|[ก-ฮ]{2})\d{2}-\d{3,4}|[A-Z]{2,3}(?:-[A-Z]{2,3})?-\d{2,4}|\d{8})/g;
const nw = (html) => html.replace(/>([^<]+)</g, (m, t) => `>${t.replace(NW_RE, '<span class="nw">$1</span>')}<`);
const TH_MONTH_LONG = new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const thMonthLong = (ym) => TH_MONTH_LONG.format(new Date(`${ym}-01T00:00:00Z`));
const table = (heads, rows, cls = '') => `<table class="ptable ${cls}"><thead><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${nw(rows.join('')) || `<tr><td colspan="${heads.length}" class="center">ไม่มีรายการ</td></tr>`}</tbody></table>`;
const kindTH = (it) => ({ 'แห้ง': 'วัตถุดิบ', 'ผง': 'วัตถุดิบ', 'สด': 'วัตถุดิบ', 'เคมีภัณฑ์': 'สารเคมี', 'บรรจุภัณฑ์': 'บรรจุภัณฑ์', 'ฉลาก': 'ฉลาก' }[it.kind] || it.kind);
export function bahtText(n) {
  const D1 = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const P = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
  const read6 = (s) => {
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const d = Number(s[i]), p = s.length - i - 1;
      if (!d) continue;
      if (p === 0 && d === 1 && s.length > 1 && /[1-9]/.test(s.slice(0, -1))) out += 'เอ็ด';
      else if (p === 1 && d === 2) out += 'ยี่';
      else if (p === 1 && d === 1) out += '';
      else out += D1[d];
      out += P[p];
    }
    return out;
  };
  const readInt = (s) => { s = s.replace(/^0+/, ''); if (!s) return 'ศูนย์'; if (s.length <= 6) return read6(s); return `${readInt(s.slice(0, -6))}ล้าน${read6(s.slice(-6))}`; };
  const [i, f] = Math.abs(Number(n) || 0).toFixed(2).split('.');
  return `${readInt(i)}บาท${f === '00' ? 'ถ้วน' : `${read6(String(Number(f)))}สตางค์`}`;
}

// ---------- หน้ารายการเอกสาร ----------
function picker(type) {
  const prs = S.prs.slice().sort((a, b) => b.requested.localeCompare(a.requested)).slice(0, 60);
  const opt = (v, t) => `<option value="${esc(v)}">${esc(t)}</option>`;
  const sel = (name, opts) => `<label class="sr" for="dp-${type}">${esc(TITLE[type])}</label><select class="in in-sm" id="dp-${type}" name="${name}">${opts}</select>`;
  if (type === 'fm01') return `<label class="sr" for="dp-f">ตั้งแต่วันที่</label><input class="in in-sm" id="dp-f" type="date" name="from" value="${addDays(S.today, -7)}"><label class="sr" for="dp-t">ถึงวันที่</label><input class="in in-sm" id="dp-t" type="date" name="to" value="${S.today}">`;
  if (type === 'fm02') return sel('item', [...D.itemStats.values()].filter((s) => active(s.it)).map((s) => opt(s.it.code, `${s.it.code} ${s.it.name}`)).join(''));
  if (type === 'fm19') return sel('inv', S.invoices.filter((v) => v.date <= S.today).slice(-40).reverse().map((v) => opt(v.inv_no, `${v.inv_no} ${short(custName(v.customer_id))} ${thaiDate(v.date)}`)).join(''));
  if (type === 'req') return sel('job', S.jobs.filter((j) => j.status !== 'waiting').slice(-40).reverse().map((j) => opt(j.job_id, `${j.job_id} ${S.items.get(j.item_code).name}`)).join(''));
  if (type === 'fm23') return sel('lot', S.lots.filter((l) => S.items.get(l.item_code)?.kind === 'สด').slice(-40).reverse().map((l) => opt(l.lot_no, `${l.lot_no} ${S.items.get(l.item_code).name} ${thaiDate(l.date_in)}`)).join(''));
  if (type === 'fm35') return sel('month', Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(...S.today.split('-').map(Number).slice(0, 2).map((x, k) => (k === 1 ? x - 1 - i : x)), 1)); const k = d.toISOString().slice(0, 7); return opt(k, thMonthLong(k)); }).join(''));
  if (type === 'fm08') return sel('id', S.base.assets.map((a) => opt(a.asset_id, `${a.asset_id} ${a.name}`)).join(''));
  if (type === 'formula') return sel('code', [...S.items.values()].filter(isFG).map((it) => opt(it.code, `${it.code} ${it.name}`)).join(''));
  if (['pr-memo', 'pr-report', 'po', 'inspect', 'pay'].includes(type)) return sel('id', prs.map((r) => opt(r.pr_no, `${r.pr_no} ${S.items.get(r.item_code).name} ${prStage(r).title}`)).join(''));
  if (type === 'fy-plan') { const fy = fyOf(S.today); return sel('fy', [fy + 1, fy].map((y) => opt(y, `ปีงบ ${y}`)).join('')); }
  return '';
}
function docList() {
  return head('เอกสาร', [], '', 'ข้อมูลที่กรอกในระบบครั้งเดียว ออกเป็นแบบฟอร์มพร้อมพิมพ์หรือบันทึกเป็น PDF ไม่ต้องกรอกซ้ำ') + `<div class="doc-groups">${TYPES.map(([g, xs]) => `<section class="panel" aria-labelledby="dg-${esc(g)}"><div class="panel-h"><h2 id="dg-${esc(g)}">${esc(g)}</h2></div>
    <ul class="doc-list">${xs.map(([k, t, hint]) => `<li><form data-form="docOpen" data-type="${k}" class="doc-row"><span class="t">${I.doc}${esc(t)}${hint ? `<span class="d">${esc(hint)}</span>` : ''}</span><span class="inline-form">${picker(k)}<button class="btn btn-sm" type="submit">เปิด</button></span></form></li>`).join('')}</ul></section>`).join('')}</div>
    <p class="note">ช่องที่ระบบไม่มีข้อมูล เช่น ที่อยู่ผู้ขาย เกรดสมุนไพร หรือลายมือชื่อ เว้นว่างไว้ให้เขียนเอง หัวเอกสารใช้ชื่อหน่วยงานสมมุติ เปลี่ยนเป็นชื่อจริงได้เมื่อใช้ภายในหน่วยงาน</p>`;
}

// ---------- แบบฟอร์มแต่ละชนิด ----------
function fm01(p) {
  const from = p.get('from') || addDays(S.today, -7), to = p.get('to') || S.today;
  const rows = S.moves.filter((m) => m.type === 'รับ' && m.date >= from && m.date <= to && !isFG(S.items.get(m.item_code)) && !String(m.doc_no).startsWith('บันทึกการผลิต')).sort((a, b) => a.date.localeCompare(b.date));
  return paper('FM-01', 'บันทึกการตรวจรับ', table(['ว/ด/ป รับ', 'รายการ', 'ประเภท', 'เลขที่รุ่น', 'ปริมาณ', 'ผู้ผลิต/จำหน่าย', 'ผลการตรวจรับ<br>ผ่าน ไม่ผ่าน', 'ผลการแก้ไขกรณีภาชนะบรรจุเสียหายหรือสกปรก', 'ผู้ตรวจรับ', 'ผู้รับใบส่งของ'],
    rows.map((m) => { const it = S.items.get(m.item_code); const l = S.lotMap.get(m.lot_no); return `<tr><td>${esc(thaiDate(m.date))}</td><td>${esc(it.name)}</td><td>${esc(kindTH(it))}</td><td>${esc(m.lot_no)}</td><td class="r">${esc(qty(m.item_code, m.qty))}</td><td>${esc(m.party)}</td><td class="center">${tick(l?.status !== 'ไม่ผ่าน')} ${tick(l?.status === 'ไม่ผ่าน')}</td><td></td><td>${esc(short(staff(m.user_id).name))}</td><td>${esc(short(staff(m.user_id).name))}</td></tr>`; })), { landscape: true, sub: `ช่วงวันที่ ${esc(thaiFullDate(from))} ถึง ${esc(thaiFullDate(to))}` });
}
function fm02(p) {
  const code = S.items.get(p.get('item')) ? p.get('item') : '91004';
  const it = S.items.get(code);
  const st = D.itemStats.get(code);
  const [y, m] = S.today.split('-').map(Number);
  const fyStart = `${m >= 10 ? y : y - 1}-10-01`;
  const ms = (S.movesByItem.get(code) || []).slice().sort((a, b) => a.date.localeCompare(b.date) || a.move_id.localeCompare(b.move_id));
  let bal = 0, open = 0;
  const lines = [];
  for (const mv of ms) {
    const inQ = ['รับ', 'ยกมา'].includes(mv.type) ? mv.qty : 0, outQ = inQ ? 0 : mv.qty;
    bal += inQ - outQ;
    if (mv.date < fyStart) { open = bal; continue; }
    lines.push({ mv, inQ, outQ, bal });
  }
  const where = isFG(it) ? 'คลังยาสำเร็จรูป' : it.kind === 'บรรจุภัณฑ์' || it.kind === 'ฉลาก' ? 'คลังบรรจุภัณฑ์' : 'คลังวัตถุดิบ';
  const headBox = `<div class="fm02-h"><div>ส่วนราชการ ${esc(ORG.hospital)}</div><div>หน่วยงาน ${esc(ORG.factory)} ${esc(ORG.center)}</div><div>แผ่นที่ 1</div>
    <div>ประเภท ${esc(it.kind)} ชื่อหรือชนิดวัสดุ ${esc(it.name)}</div><div>รหัส ${esc(code)}</div><div>ขนาดหรือลักษณะ ${esc(it.unit)}</div><div>จำนวนอย่างสูง ${num(st.pol.S)}</div><div>หน่วยที่นับ ${esc(it.unit)} ที่เก็บ ${where}</div><div>จำนวนอย่างต่ำ ${num(st.pol.rop)}</div></div>`;
  const rows = [`<tr><td>${esc(thaiDate(fyStart))}</td><td>ยอดยกมาต้นปีงบ</td><td></td><td></td><td></td><td></td><td></td><td></td><td class="r">${qn(code, open)}</td><td></td></tr>`].concat(lines.map((x) => { const l = S.lotMap.get(x.mv.lot_no); return `<tr><td>${esc(thaiDate(x.mv.date))}</td><td>${esc(x.mv.party)}</td><td>${esc(x.mv.doc_no)}</td><td>${esc(x.mv.lot_no)}</td><td>${l?.exp_date ? esc(thaiDate(l.exp_date)) : ''}</td><td class="r">${it.cost ? num2(it.cost) : ''}</td><td class="r">${x.inQ ? qn(code, x.inQ) : ''}</td><td class="r">${x.outQ ? qn(code, x.outQ) : ''}</td><td class="r">${qn(code, x.bal)}</td><td>${x.mv.type !== 'จ่าย' && x.mv.type !== 'รับ' ? esc(x.mv.type) : ''}</td></tr>`; }));
  return paper('FM-02', 'บันทึกการรับ-จ่าย บัญชีควบคุมวัสดุ', headBox + table(['วัน เดือน ปี', 'รับจาก/จ่ายให้', 'เลขที่เอกสาร', 'Lot No.', 'Exp.', 'ราคาต่อหน่วย (บาท)', 'รับ', 'จ่าย', 'คงเหลือ', 'หมายเหตุ'], rows), { landscape: true, noOrg: true });
}
function reqPaper(code, title, no, date, to, purpose, rows, lotCol = true) {
  return paper(code, title, `<div class="memo-top"><div>ใบเบิกเลขที่ ${esc(no)}</div><div>วันที่ ${esc(thaiFullDate(date))}</div></div>
    <p>เรียน ${esc(to)}</p><p class="indent">ด้วย${esc(purpose)}</p>
    ${table(['ลำดับที่', 'รายการ', ...(lotCol ? ['เลขที่ผลิต (Lot No.)'] : []), 'หน่วย', 'จำนวนเบิก', 'จำนวนจ่าย', 'หมายเหตุ'], rows)}
    <div class="signs four">${sign('ผู้เบิก')}${sign('ผู้จ่าย')}${sign('ผู้รับ')}${sign('ผู้อนุมัติเบิกจ่าย')}</div>`, { noOrg: true });
}
function fm19(p) {
  const v = S.invoices.find((x) => x.inv_no === p.get('inv')) || S.invoices[S.invoices.length - 1];
  const lines = S.invoiceLines.filter((l) => l.inv_no === v.inv_no);
  return reqPaper('FM-19', `ใบเบิกผลิตภัณฑ์สมุนไพรสำเร็จรูป ${ORG.hospital}`, v.inv_no, v.date, 'หัวหน้าฝ่ายจัดซื้อและคลัง', ` ${custName(v.customer_id)} มีความประสงค์ที่จะเบิกผลิตภัณฑ์สมุนไพรสำเร็จรูปเพื่อสำหรับใช้ในราชการดังรายการต่อไปนี้`,
    lines.map((l, i) => { const it = S.items.get(l.item_code); return `<tr><td class="center">${i + 1}</td><td>${esc(it.name)}</td><td>${esc(l.lot_no)}</td><td>${esc(it.unit)}</td><td class="r">${qn(l.item_code, l.qty)}</td><td class="r">${qn(l.item_code, l.qty)}</td><td></td></tr>`; }));
}
function req(p) {
  const job = S.jobs.find((j) => j.job_id === p.get('job')) || S.jobs.filter((j) => j.status !== 'waiting').pop();
  const ins = S.jobInputs.filter((x) => x.job_id === job.job_id);
  const out = S.items.get(job.item_code);
  const byForm = new Map();
  for (const x of ins) { const f = REQ_FORM[S.items.get(x.item_code).kind] || 'FM-28'; if (!byForm.has(f)) byForm.set(f, []); byForm.get(f).push(x); }
  const names = { 'FM-28': 'ใบเบิกสมุนไพรสด', 'FM-29': 'ใบเบิกสมุนไพรแห้ง', 'FM-30': 'ใบเบิกสมุนไพรผง', 'FM-31': 'ใบเบิกสารเคมี', 'FM-32': 'ใบเบิกบรรจุภัณฑ์', 'FM-33': 'ใบเบิกฉลาก' };
  const date = S.moves.find((m) => m.party.endsWith(job.job_id) && m.type === 'จ่าย')?.date || job.start_date || S.today;
  if (!byForm.size) return paper('', 'ใบเบิก', `<p>งาน ${esc(job.job_id)} ยังไม่ได้เบิกวัตถุดิบ</p>`);
  return [...byForm].sort().map(([f, xs], k) => reqPaper(f, `${names[f]} ${ORG.hospital}`, `${job.job_id}-${k + 1}`, date, 'หัวหน้าฝ่ายจัดซื้อและคลัง', `${job.lane === 'ผลิต' ? 'ฝ่ายผลิต' : 'ฝ่ายแปรรูปสมุนไพร'} ${ORG.factory} มีความประสงค์ที่จะเบิก${names[f].replace('ใบเบิก', '')}เพื่อผลิต ${out.name} งาน ${job.job_id} ดังรายการต่อไปนี้`,
    xs.map((x, i) => { const it = S.items.get(x.item_code); return `<tr><td class="center">${i + 1}</td><td>${esc(it.name)}</td><td>${esc(x.lot_no)}</td><td>${esc(it.unit)}</td><td class="r">${qn(x.item_code, x.qty)}</td><td class="r">${qn(x.item_code, x.qty)}</td><td></td></tr>`; }))).join('');
}
function fm23(p) {
  const lot = S.lotMap.get(p.get('lot')) || S.lots.filter((l) => S.items.get(l.item_code)?.kind === 'สด').pop();
  const it = S.items.get(lot.item_code);
  const sup = S.base.suppliers.find((s) => s.supplier_id === lot.source_ref) || {};
  const member = sup.note === 'สมาชิก';
  const amount = lot.qty_in * (it.cost || 0);
  const dow = new Date(`${lot.date_in}T00:00:00Z`).getUTCDay();
  return paper('FM-23', 'ใบรับซื้อวัตถุดิบสมุนไพร', `<div class="memo-top"><div>วันที่ ${esc(thaiFullDate(lot.date_in))}</div><div>เวลา ${blank}</div></div>
    <div class="fm-lines"><div>ชื่อผู้ขาย ${esc(sup.name || '')} กลุ่มเพาะปลูก ${tick(member)} เป็นสมาชิก เลขที่ ${blank} ${tick(!member)} ไม่เป็นสมาชิก</div><div>ที่อยู่ ${blank}</div><div>โทรศัพท์ ${blank}</div>
    <div>มีการนัดหมายก่อนนำมาจำหน่ายอย่างน้อย 1 วัน ${tick(false)} นัด ${tick(false)} ไม่นัด</div>
    <div>นำสมุนไพรมาขายในวัน ${['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์'].map((d, i) => `${tick(dow === i + 1)} ${d}`).join(' ')}</div>
    <div>ได้รับการรับรองมาตรฐาน ${['ทั่วไป', 'GAP', 'เกษตรอินทรีย์'].map((s) => `${tick(sup.standard === s)} ${s}`).join(' ')}</div>
    <div>สภาพวัตถุดิบ ${tick(false)} สด ใหม่ ${tick(false)} ค้างคืน ${tick(false)} มีส่วนเน่าเสีย ${tick(false)} เน่าเสีย มีสิ่งแปลกปลอม</div>
    <div>สรุปการรับซื้อ ${tick(lot.status !== 'ไม่ผ่าน')} รับซื้อ ${tick(lot.status === 'ไม่ผ่าน')} ไม่รับซื้อ</div></div>
    ${table(['ลำดับ', 'รายการ', 'เกรด', 'ราคา/หน่วย', 'จำนวน', 'มูลค่า', 'หมายเหตุ'], [`<tr><td class="center">1</td><td>${esc(it.name)} เลขที่รับ ${esc(lot.lot_no)}</td><td></td><td class="r">${num2(it.cost || 0)}</td><td class="r">${esc(qty(it.code, lot.qty_in))}</td><td class="r">${baht(amount)}</td><td></td></tr>`, `<tr><td colspan="5" class="r">มูลค่ารวม (${esc(bahtText(amount))})</td><td class="r">${baht(amount)}</td><td>บาท</td></tr>`])}
    <div class="signs">${sign('ผู้ตรวจเช็ค/รับซื้อ')}${sign('ผู้ขาย', sup.name ? short(sup.name) : '')}</div>`, { noOrg: true });
}
function fm35(p) {
  const month = p.get('month') || S.today.slice(0, 7);
  const rs = S.releases.filter((r) => r.date.startsWith(month) && isFG(S.items.get(r.item_code))).sort((a, b) => a.date.localeCompare(b.date));
  return paper('FM-35', 'บันทึกการปล่อยผ่านผลิตภัณฑ์สำเร็จรูป', table(['ว/ด/ป', 'ผลิตภัณฑ์สำเร็จรูป', 'Lot No.', 'ผ่าน', 'ไม่ผ่าน', 'แก้ไข', 'ทำลาย', 'ผู้ตรวจ/ ผู้อนุมัติปล่อยผ่าน', 'หมายเหตุ'],
    rs.map((r) => `<tr><td>${esc(thaiDate(r.date))}</td><td>${esc(S.items.get(r.item_code).name)}</td><td>${esc(r.lot_no)}</td><td class="center">${tick(r.result === 'ผ่าน')}</td><td class="center">${tick(r.result !== 'ผ่าน')}</td><td class="center">${tick(false)}</td><td class="center">${tick(false)}</td><td>${esc(short(staff(r.checker_id).name))} / ${esc(short(staff(r.approver_id).name))}</td><td>${esc(r.note || '')}</td></tr>`)), { landscape: true, sub: `เดือน${esc(thMonthLong(month))}` });
}
function fm43() {
  const rows = S.base.assets.map((a, i) => `<tr><td class="center">${i + 1}</td><td>${esc(a.name)}</td><td>${esc(a.asset_no)}</td><td>${esc(a.serial)}</td><td class="center">${esc(a.year)}</td><td>${esc(a.vendor)}</td><td>${esc(a.sop)}</td><td>${esc(a.room)}</td><td>${esc(short(staff(a.owner_id).name))}</td><td>${esc(a.status)}</td><td>${esc(a.note || '')}</td></tr>`);
  return paper('FM-43', 'ทะเบียนเครื่องมือ อุปกรณ์ (Equipment Register)', table(['ลำดับ', 'รายการเครื่องมือ / อุปกรณ์', 'หมายเลขครุภัณฑ์', 'หมายเลขเครื่อง', 'ปี พ.ศ. ที่ได้มา', 'บริษัท / ผู้จำหน่าย', 'SOP ที่เกี่ยวข้อง', 'ตำแหน่งที่ตั้ง (ห้อง)', 'ผู้รับผิดชอบ', 'สถานะ (ใช้งาน / ชำรุด / เลิกใช้)', 'หมายเหตุ'], rows)
    + '<p class="pnote">หมายเหตุ ปรับปรุงทะเบียนทุกครั้งที่รับเครื่องใหม่ ย้ายตำแหน่ง ชำรุด หรือเลิกใช้ และทบทวนทั้งฉบับปีละ 1 ครั้ง เครื่องที่ใช้ในการผลิตและควบคุมคุณภาพต้องมี SOP การใช้และบำรุงรักษา</p>', { landscape: true, sub: `ปรับปรุง ณ วันที่ ${esc(thaiFullDate(S.today))}` });
}
function fm08(p) {
  const a = S.base.assets.find((x) => x.asset_id === p.get('id')) || S.base.assets[0];
  const log = S.maint.filter((m) => m.asset_id === a.asset_id).sort((x, y) => x.date.localeCompare(y.date));
  const d = assetDue(a);
  return paper('FM-08', 'บันทึกประวัติการบำรุงรักษาและซ่อมแซมอุปกรณ์เครื่องจักร', `<div class="fm-lines"><div>หน่วยงาน ${esc(ORG.factory)}</div><div>ชื่ออุปกรณ์ ${esc(a.name)} ยี่ห้อ / รุ่น ${esc(a.vendor)}</div><div>รหัสเครื่อง ${esc(a.asset_id)} หมายเลขเครื่อง ${esc(a.serial)} วันที่เริ่มใช้งาน ปี พ.ศ. ${esc(a.year)}</div><div>บำรุงรักษาครั้งถัดไป ${d.nextPm ? esc(thaiFullDate(d.nextPm)) : '-'} สอบเทียบครั้งถัดไป ${d.nextCal ? esc(thaiFullDate(d.nextCal)) : 'ไม่ต้องสอบเทียบ'}</div></div>`
    + table(['ว.ด.ป.', 'รายละเอียดการบำรุงรักษาและซ่อมบำรุง', 'ซ่อมบำรุงโดย', 'ผู้ตรวจสอบรับมอบงาน', 'หมายเหตุ'], log.map((m) => `<tr><td>${esc(thaiDate(m.date))}</td><td>${esc(m.type)} ${esc(m.detail)}</td><td>${esc(m.by)}</td><td>${esc(short(staff(m.checker_id).name))}</td><td>${esc(m.result)}</td></tr>`)), { noOrg: true });
}
function fm46() {
  const fy = fyOf(S.today);
  const sups = S.base.suppliers.filter((s) => s.approved === 'Y' && active(s));
  const what = (s) => [...new Set([...S.items.values()].filter((i) => i.supplier_id === s.supplier_id || i.backup_supplier_id === s.supplier_id).map((i) => i.kind))].join(' ') || (s.type === 'เกษตรกร' ? 'สมุนไพรสด' : '');
  return paper('FM-46', 'ทะเบียนผู้ขายที่ได้รับการคัดเลือก', table(['ลำดับ', 'ประเภทที่ส่งมอบ', 'ชื่อผู้ผลิต / จำหน่าย', 'ที่อยู่', 'ผู้แทนขาย', 'เบอร์โทรศัพท์ / Email', 'วันที่ผ่านการคัดเลือก', 'ผู้อนุมัติ / (ว/ด/ป)', 'หมายเหตุ'],
    sups.map((s, i) => `<tr><td class="center">${i + 1}</td><td>${esc(what(s))}</td><td>${esc(s.name)}</td><td></td><td></td><td></td><td></td><td></td><td>${esc(s.note || '')}</td></tr>`))
    + '<p class="pnote">หมายเหตุ ประเมินผู้ขายทุกสิ้นปีโดยฝ่ายผลิตและฝ่ายควบคุมคุณภาพ ตาม QP-12 การประเมินผู้ขาย ข้อ 4.6 ผู้ขายที่ยังไม่ผ่านการคัดเลือกและอนุมัติ ห้ามสั่งซื้อ</p>', { landscape: true, sub: `ประจำปีงบประมาณ ${fy}` });
}
function products() {
  const rows = [...S.items.values()].filter(isFG).map((it, i) => { const c = costOf(it.code); return `<tr><td class="center">${i + 1}</td><td>${esc(it.code)}</td><td>${esc(it.name)}</td><td>${esc(it.code24 || '')}</td><td>${esc(it.unit)}</td><td class="r">${num(it.shelf_days)}</td><td class="r">${baht(c.total)}</td><td class="r">${num(it.price)}</td><td>${esc(it.status || 'ผลิตอยู่')}</td></tr>`; });
  return paper('', 'ทะเบียนผลิตภัณฑ์', table(['ลำดับ', 'รหัส', 'ผลิตภัณฑ์', 'เลข 24 หลัก (สมมุติ)', 'หน่วย', 'อายุยา (วัน)', 'ต้นทุนต่อหน่วย (บาท)', 'ราคาขาย (บาท)', 'สถานะ'], rows), { landscape: true, sub: `ณ วันที่ ${esc(thaiFullDate(S.today))}` });
}
function formula(p) {
  const it = S.items.get(p.get('code')) && isFG(S.items.get(p.get('code'))) ? S.items.get(p.get('code')) : [...S.items.values()].find(isFG);
  const c = costOf(it.code);
  const vs = bomVersions(it.code);
  const v = vs[vs.length - 1];
  const batch = it.batch_or_pack || 0;
  return paper('', 'สูตรและต้นทุนต่อหน่วย (ประมาณการ)', `<div class="fm-lines"><div>ผลิตภัณฑ์ ${esc(it.name)} รหัส ${esc(it.code)} เลข 24 หลัก ${esc(it.code24 || '-')}</div><div>สูตรฉบับที่ ${v.v} ${v.fm40 ? `อ้าง ${esc(v.fm40)}` : ''} ขนาดรุ่น ${esc(qty(it.code, batch))}</div></div>`
    + table(['ลำดับ', 'วัตถุดิบและบรรจุภัณฑ์', 'ต่อ 1 หน่วย', 'ต่อรุ่น', 'ราคาต่อหน่วย (บาท)', 'ต้นทุนต่อหน่วยผลิตภัณฑ์ (บาท)'], c.lines.map((l, i) => `<tr><td class="center">${i + 1}</td><td>${esc(l.item?.name || l.in_item)}</td><td class="r">${num2(l.qty_per_unit)} ${esc(l.item?.unit || '')}</td><td class="r">${num2(l.qty_per_unit * batch)} ${esc(l.item?.unit || '')}</td><td class="r">${num2(l.unit)}</td><td class="r">${baht(l.amount)}</td></tr>`).concat([
      `<tr><td colspan="5" class="r">วัตถุดิบ</td><td class="r">${baht(c.material)}</td></tr>`, `<tr><td colspan="5" class="r">บรรจุภัณฑ์และฉลาก</td><td class="r">${baht(c.packaging)}</td></tr>`,
      `<tr><td colspan="5" class="r">ค่าสูญเสีย ผลิต ${num(c.lossPct)}% บรรจุ ${num(c.packLossPct)}%</td><td class="r">${baht(c.loss + c.packLoss)}</td></tr>`, `<tr><td colspan="5" class="r"><b>ต้นทุนต่อหน่วย (ยังไม่รวมค่าแรงและค่าโสหุ้ย)</b></td><td class="r"><b>${baht(c.total)}</b></td></tr>`,
      `<tr><td colspan="5" class="r">ราคาขายปัจจุบัน กำไรขั้นต้น</td><td class="r">${num(it.price)} (${num(it.price ? ((it.price - c.total) / it.price) * 100 : 0, 1)}%)</td></tr>`]))
    + `<div class="signs">${sign('ผู้จัดทำ')}${sign('ผู้ตรวจสอบ')}</div>`);
}

// ---------- จัดซื้อ ----------
const prOf = (p) => S.prs.find((r) => r.pr_no === p.get('id')) || S.prs[S.prs.length - 1];
const nameOf = (id) => (id ? short(staff(id).name) : '');
function itemTable(r) {
  const it = S.items.get(r.item_code);
  return table(['ลำดับ', 'รายการ', 'จำนวน', 'หน่วย', 'ราคาต่อหน่วย (บาท)', 'จำนวนเงิน (บาท)'], [`<tr><td class="center">1</td><td>${esc(it.name)}</td><td class="r">${qn(r.item_code, r.qty)}</td><td>${esc(it.unit)}</td><td class="r">${num2(r.unit_cost)}</td><td class="r">${baht(r.amount)}</td></tr>`, `<tr><td colspan="5" class="r">รวมเป็นเงิน (${esc(bahtText(r.amount))})</td><td class="r"><b>${baht(r.amount)}</b></td></tr>`]);
}
const memoHead = (r, subject, date, no) => `<div class="memo"><div class="memo-title">บันทึกข้อความ</div>
  <div class="memo-line"><b>ส่วนราชการ</b> ${esc(ORG.center)} ${esc(ORG.hospital)}</div>
  <div class="memo-line two"><span><b>ที่</b> ${esc(ORG.bookNo)}${esc(no)}</span><span><b>วันที่</b> ${esc(thaiFullDate(date))}</span></div>
  <div class="memo-line"><b>เรื่อง</b> ${esc(subject)}</div><div class="memo-line"><b>เรียน</b> ${esc(ORG.director)}</div></div>`;
function prMemo(p) {
  const r = prOf(p);
  const it = S.items.get(r.item_code);
  const fy = fyOf(r.requested);
  return paper('', 'บันทึกข้อความ', `${memoHead(r, 'ขออนุมัติดำเนินการจัดซื้อวัสดุสำหรับผลิตยาสมุนไพร', r.requested, r.pr_no.replace(/\D/g, ''))}
    <p class="indent">ตามที่${esc(ORG.factory)} ได้จัดทำแผนปฏิบัติการจัดซื้อจัดจ้าง ประจำปีงบประมาณ พ.ศ. ${fy} ด้วย${esc(ORG.fund)} ปีงบประมาณ ${fy} นั้น บัดนี้ มีความประสงค์ที่จะขออนุมัติดำเนินการจัดซื้อวัสดุ ตามรายการดังต่อไปนี้</p>
    <p class="indent">- ${esc(it.kind)} 1 รายการ ${esc(supName(r.supplier_id))} รวมเป็นเงิน ${baht(r.amount)} บาท</p>
    ${itemTable(r)}
    <p class="indent">เหตุผลความจำเป็น ${esc(r.purpose || 'ใช้ผลิตยาสมุนไพรตามแผน')} โดยวิธีเฉพาะเจาะจง วงเงินไม่เกิน ${num(PROC.specificMax)} บาท</p>
    <p class="indent">จึงเรียนมาเพื่อโปรดพิจารณาอนุมัติ</p>
    <div class="signs three">${sign('ผู้ขอซื้อ', nameOf(r.requested_by), r.requested)}${sign('หัวหน้ากลุ่มงาน เห็นชอบ', nameOf(r.head_ok_by), r.head_ok)}${sign('ผู้อำนวยการ อนุมัติ', nameOf(r.dir_ok_by), r.dir_ok)}</div>`, { noOrg: true });
}
function prReport(p) {
  const r = prOf(p);
  const it = S.items.get(r.item_code);
  const lead = S.base.suppliers.find((s) => s.supplier_id === r.supplier_id)?.quoted_lead_days || 0;
  return paper('', 'รายงานขออนุมัติจัดซื้อโดยวิธีเฉพาะเจาะจง', `${memoHead(r, `รายงานขอซื้อ${it.name} โดยวิธีเฉพาะเจาะจง`, r.requested, r.pr_no.replace(/\D/g, ''))}
    <p class="indent">ด้วย${esc(ORG.factory)} มีความประสงค์จะซื้อ ${esc(it.name)} จำนวน ${esc(qty(r.item_code, r.qty))} โดยวิธีเฉพาะเจาะจง ซึ่งมีรายละเอียดดังต่อไปนี้</p>
    <ol class="plist"><li>เหตุผลความจำเป็นที่ต้องซื้อ ${esc(r.purpose || 'ใช้ผลิตยาสมุนไพรตามแผน')}</li><li>รายละเอียดของพัสดุ ตามรายการแนบ</li><li>ราคากลางของพัสดุที่จะซื้อ เป็นเงิน ${baht(r.amount)} บาท</li><li>วงเงินที่จะซื้อ ${esc(ORG.fund)} เป็นเงิน ${baht(r.amount)} บาท (${esc(bahtText(r.amount))})</li><li>กำหนดเวลาที่ต้องการใช้พัสดุ ภายใน ${lead} วัน นับถัดจากวันลงนามในใบสั่งซื้อ</li><li>ซื้อโดยวิธีเฉพาะเจาะจง ตามพระราชบัญญัติการจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. 2560 มาตรา 56 วรรคหนึ่ง (2) (ข)</li><li>หลักเกณฑ์การพิจารณาคัดเลือกข้อเสนอ ใช้เกณฑ์ราคา</li><li>ผู้ตรวจรับพัสดุ ตามคำสั่งแต่งตั้ง</li></ol>
    ${itemTable(r)}
    <p class="indent">จึงเรียนมาเพื่อโปรดพิจารณา หากเห็นชอบขอได้โปรดอนุมัติให้ดำเนินการตามรายละเอียดในรายงานขอซื้อดังกล่าวข้างต้น</p>
    <div class="signs three">${sign('เจ้าหน้าที่', nameOf(r.requested_by), r.requested)}${sign('หัวหน้าเจ้าหน้าที่ เห็นชอบ', nameOf(r.head_ok_by), r.head_ok)}${sign('ผู้อำนวยการ อนุมัติ', nameOf(r.dir_ok_by), r.dir_ok)}</div>`, { noOrg: true });
}
function poDoc(p) {
  const r = prOf(p);
  const sup = S.base.suppliers.find((s) => s.supplier_id === r.supplier_id);
  const date = r.ordered || S.today;
  return paper('', 'ใบสั่งซื้อ', `<div class="fm-lines"><div>ผู้ขาย ${esc(sup?.name || '')}</div><div>ใบสั่งซื้อเลขที่ ${esc(r.po_no || 'ยังไม่ออก')} วันที่ ${r.ordered ? esc(thaiFullDate(r.ordered)) : blank}</div><div>ส่วนราชการ ${esc(ORG.hospital)} อ้างใบขอซื้อ ${esc(r.pr_no)}</div></div>
    <p class="indent">ตามที่ ${esc(sup?.name || '')} ได้เสนอราคาไว้ ซึ่งได้รับราคาและตกลงซื้อ ตามรายการดังต่อไปนี้</p>${itemTable(r)}
    <ol class="plist"><li>กำหนดส่งมอบภายใน ${sup?.quoted_lead_days || '-'} วัน นับถัดจากวันที่ผู้ขายได้รับใบสั่งซื้อ (ภายในวันที่ ${esc(thaiFullDate(addDays(date, sup?.quoted_lead_days || 0)))})</li><li>สถานที่ส่งมอบ ${esc(ORG.factory)}</li><li>ระยะเวลารับประกัน ${blank}</li></ol>
    <div class="signs">${sign('ผู้สั่งซื้อ (ผู้อำนวยการ)', nameOf(r.dir_ok_by), r.ordered)}${sign('ผู้รับใบสั่งซื้อ (ผู้ขาย)')}</div>`);
}
function inspectDoc(p) {
  const r = prOf(p);
  const it = S.items.get(r.item_code);
  const lot = S.pos.find((x) => x.po_no === r.po_no)?.lot_no;
  return paper('', 'ใบตรวจรับพัสดุ', `<div class="fm-lines"><div>เขียนที่ ${esc(ORG.factory)}</div><div>วันที่ ${r.inspected ? esc(thaiFullDate(r.inspected)) : blank}</div></div>
    <p class="indent">ตามที่ ${esc(ORG.hospital)} ได้ซื้อ ${esc(it.name)} จาก ${esc(supName(r.supplier_id))} ตามใบสั่งซื้อเลขที่ ${esc(r.po_no || '-')} ลงวันที่ ${r.ordered ? esc(thaiFullDate(r.ordered)) : '-'} บัดนี้ผู้ขายได้ส่งมอบพัสดุ เมื่อวันที่ ${r.received ? esc(thaiFullDate(r.received)) : blank} ${lot && lot !== 'ก่อนเริ่มระบบ' ? `(เลขรับในคลัง ${esc(lot)})` : ''}</p>
    ${itemTable(r)}
    <p class="indent">ผู้ตรวจรับพัสดุได้ตรวจรับพัสดุแล้ว ${r.inspected ? 'ถูกต้องครบถ้วนตามใบสั่งซื้อ' : blank} จึงลงลายมือชื่อไว้เป็นหลักฐาน</p>
    <div class="signs">${sign('ผู้ตรวจรับพัสดุ', nameOf(r.inspected_by), r.inspected)}</div>`);
}
function payDoc(p) {
  const r = prOf(p);
  const it = S.items.get(r.item_code);
  return paper('', 'บันทึกข้อความ', `${memoHead(r, 'ขออนุมัติเบิกจ่ายเงิน', r.pay_requested || S.today, r.pr_no.replace(/\D/g, ''))}
    <p class="indent">ตามที่ได้รับอนุมัติให้ซื้อ ${esc(it.name)} จำนวน ${esc(qty(r.item_code, r.qty))} จาก ${esc(supName(r.supplier_id))} ตามใบสั่งซื้อเลขที่ ${esc(r.po_no || '-')} และผู้ตรวจรับพัสดุได้ตรวจรับเรียบร้อยแล้ว เมื่อวันที่ ${r.inspected ? esc(thaiFullDate(r.inspected)) : blank} นั้น</p>
    <p class="indent">จึงขออนุมัติเบิกจ่ายเงินให้แก่ ${esc(supName(r.supplier_id))} เป็นเงิน ${baht(r.amount)} บาท (${esc(bahtText(r.amount))}) จาก${esc(ORG.fund)}</p>
    <p class="indent">จึงเรียนมาเพื่อโปรดพิจารณาอนุมัติ</p>
    <div class="signs">${sign('เจ้าหน้าที่', nameOf(r.pay_requested_by), r.pay_requested)}${sign('ผู้อำนวยการ อนุมัติ', nameOf(r.paid_by), r.paid)}</div>
    <p class="pnote">แบบฟอร์ม${r.amount > PROC.formSplit ? 'วงเงินมากกว่า 100,000 บาท' : 'วงเงินไม่เกิน 100,000 บาท'} ตามชุดแบบฟอร์มวิธีเฉพาะเจาะจง</p>`, { noOrg: true });
}

// ---------- สรุปคงคลัง และแผนปีงบ ----------
const inScope = (it, lane) => (!lane ? true : it.lane === lane && it.make === 'make');
function stockSummary(p) {
  const lane = p.get('lane') || '';
  const stats = [...D.itemStats.values()].filter((s) => active(s.it) && inScope(s.it, lane));
  const from90 = addDays(S.today, -90);
  const groups = new Map();
  for (const s of stats) {
    const k = s.it.kind;
    const g = groups.get(k) || { n: 0, value: 0, low: 0, exp: 0, expV: 0, slow: 0, slowV: 0 };
    const v = (s.released + s.quarantine) * (s.it.cost || 0);
    g.n += 1; g.value += v;
    if (s.level !== 'ok') g.low += 1;
    const ex = D.expiries.filter((e) => e.it.code === s.it.code);
    g.exp += ex.length; g.expV += ex.reduce((t, e) => t + e.lot.qty_left * (s.it.cost || 0), 0);
    const moved = (S.movesByItem.get(s.it.code) || []).some((m) => m.type === 'จ่าย' && m.date > from90);
    if (!moved && s.released + s.quarantine > 0) { g.slow += 1; g.slowV += v; }
    groups.set(k, g);
  }
  const tot = [...groups.values()].reduce((t, g) => ({ n: t.n + g.n, value: t.value + g.value, low: t.low + g.low, exp: t.exp + g.exp, expV: t.expV + g.expV, slow: t.slow + g.slow, slowV: t.slowV + g.slowV }), { n: 0, value: 0, low: 0, exp: 0, expV: 0, slow: 0, slowV: 0 });
  const top = stats.map((s) => ({ s, v: (s.released + s.quarantine) * (s.it.cost || 0) })).sort((a, b) => b.v - a.v).slice(0, 15);
  const crit = stats.filter((s) => s.level === 'crit');
  return paper('', `สรุปคงคลัง${lane ? ` ${lane === 'ผลิต' ? 'ยาสำเร็จรูป' : 'วัตถุดิบแปรรูป'}` : ''} ณ วันที่ ${thaiFullDate(S.today)}`,
    table(['ประเภท', 'จำนวนรายการ', 'มูลค่าคงคลัง (บาท)', 'ถึงจุดสั่งซื้อหรือวิกฤต', 'ล็อตใกล้หมดอายุ 90 วัน', 'มูลค่าใกล้หมดอายุ (บาท)', 'ไม่เคลื่อนไหว 90 วัน', 'มูลค่าไม่เคลื่อนไหว (บาท)'],
      [...groups].map(([k, g]) => `<tr><td>${esc(k)}</td><td class="r">${g.n}</td><td class="r">${baht(g.value)}</td><td class="r">${g.low}</td><td class="r">${g.exp}</td><td class="r">${baht(g.expV)}</td><td class="r">${g.slow}</td><td class="r">${baht(g.slowV)}</td></tr>`).concat(`<tr><td><b>รวม</b></td><td class="r"><b>${tot.n}</b></td><td class="r"><b>${baht(tot.value)}</b></td><td class="r"><b>${tot.low}</b></td><td class="r"><b>${tot.exp}</b></td><td class="r"><b>${baht(tot.expV)}</b></td><td class="r"><b>${tot.slow}</b></td><td class="r"><b>${baht(tot.slowV)}</b></td></tr>`))
    + `<h2 class="ph2">มูลค่าคงคลังสูงสุด 15 รายการ</h2>` + table(['รายการ', 'คงคลัง', 'ราคาต่อหน่วย', 'มูลค่า (บาท)', 'พอใช้'], top.map(({ s, v }) => `<tr><td>${esc(s.it.name)}</td><td class="r">${esc(qty(s.it.code, s.released + s.quarantine))}</td><td class="r">${num2(s.it.cost || 0)}</td><td class="r">${baht(v)}</td><td class="r">${Number.isFinite(s.cover) ? `${num(s.cover)} วัน` : '-'}</td></tr>`))
    + `<h2 class="ph2">รายการวิกฤต ${crit.length} รายการ</h2>` + table(['รายการ', 'คงคลังตรวจสอบแล้ว', 'จำนวนอย่างต่ำ', 'ค้างรับ ค้างผลิต'], crit.map((s) => `<tr><td>${esc(s.it.name)}</td><td class="r">${esc(qty(s.it.code, s.released))}</td><td class="r">${num(s.pol.rop)}</td><td class="r">${num(s.onOrder)}</td></tr>`))
    + `<p class="pnote">มูลค่าคิดจากราคาต่อหน่วยในทะเบียนรายการ (ยาสำเร็จรูปคิดจากต้นทุนตามสูตร) คงคลังรวมของที่ตรวจสอบแล้วและรอปล่อยผ่าน</p><div class="signs">${sign('ผู้จัดทำ')}${sign('หัวหน้าฝ่ายจัดซื้อและคลัง')}</div>`, { landscape: true });
}
function fyPlan(p) {
  const fy = Number(p.get('fy')) || fyOf(S.today) + 1;
  const lane = p.get('lane') || '';
  const ceYear = fy - 543; // ปีงบ fy เริ่ม 1 ต.ค. ของปี ค.ศ. ก่อนหน้า
  const fyMonths = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(ceYear - 1, 9 + i, 1)).toISOString().slice(0, 7));
  const ahead = nextMonths(24);
  const curMonth = S.today.slice(0, 7);
  const rows = [];
  const stats = [...D.itemStats.values()].filter((s) => active(s.it) && inScope(s.it, lane) && (!isFG(s.it) || producing(s.it)) && (lane || s.it.make === 'buy' || isFG(s.it)));
  for (const s of stats) {
    const f = forecastOf(s.it.code);
    if (!f.total) continue;
    // พยากรณ์ของเดือนในปีงบ (เดือนที่ผ่านแล้วหรือเดือนนี้ใช้ค่าเฉลี่ยรายเดือน)
    const fcOf = (k) => { const i = ahead.indexOf(k); return i >= 0 ? f.fc[i] : k <= curMonth ? 0 : f.fc[f.fc.length - 1]; };
    const monthsFy = fyMonths.map(fcOf);
    const need = monthsFy.reduce((a, b) => a + b, 0);
    const beforeFy = ahead.filter((k) => k < fyMonths[0]).reduce((t, k) => t + fcOf(k), 0);
    const opening = Math.max(0, s.released + s.quarantine + s.onOrder - beforeFy);
    const pack = s.it.batch_or_pack || 1;
    const plan = Math.max(0, Math.ceil((need + s.pol.ss - opening) / pack) * pack);
    if (plan <= 0) continue;
    const q = [0, 1, 2, 3].map((k) => monthsFy.slice(k * 3, k * 3 + 3).reduce((a, b) => a + b, 0));
    const qs = q.map((x) => (need > 0 ? Math.round((plan * x) / need) : 0));
    const unit = isFG(s.it) ? costOf(s.it.code).total : s.it.cost || 0;
    rows.push({ s, need, opening, plan, qs, unit, budget: plan * unit });
  }
  rows.sort((a, b) => b.budget - a.budget);
  const total = rows.reduce((t, r) => t + r.budget, 0);
  const byKind = new Map();
  for (const r of rows) byKind.set(r.s.it.kind, (byKind.get(r.s.it.kind) || 0) + r.budget);
  const what = lane === 'ผลิต' ? 'แผนผลิตยาสำเร็จรูป' : lane === 'แปรรูป' ? 'แผนแปรรูปสมุนไพร' : 'แผนจัดซื้อวัสดุและแผนผลิต';
  return paper('', `${what} ปีงบประมาณ ${fy} รายไตรมาส`,
    `<p class="pnote">ปีงบ ${fy} เริ่ม ${esc(thaiFullDate(`${fyMonths[0]}-01`))} ถึง ${esc(thaiFullDate(new Date(Date.UTC(ceYear, 9, 0)).toISOString().slice(0, 10)))} จำนวนที่ต้องซื้อหรือผลิต = พยากรณ์ใช้ทั้งปี + สต็อกกันชน − คงคลังที่คาดว่าเหลือต้นปี ปัดเป็นหน่วยสั่งซื้อหรือขนาดรุ่น งบประมาณ = จำนวน × ราคาต่อหน่วยล่าสุด (ยาสำเร็จรูปใช้ต้นทุนตามสูตร)</p>`
    + table(['ประเภท', 'งบประมาณ (บาท)'], [...byKind].sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r">${baht(v)}</td></tr>`).concat(`<tr><td><b>รวม</b></td><td class="r"><b>${baht(total)}</b></td></tr>`))
    + table(['รายการ', 'หน่วย', 'พยากรณ์ใช้ทั้งปี', 'คาดเหลือต้นปี', 'สต็อกกันชน', 'ต้องซื้อหรือผลิต', 'ไตรมาส 1', 'ไตรมาส 2', 'ไตรมาส 3', 'ไตรมาส 4', 'ราคาต่อหน่วย', 'งบประมาณ (บาท)'],
      rows.map((r) => `<tr><td>${esc(r.s.it.name)}<span class="ps">${esc(r.s.it.code)}</span></td><td>${esc(r.s.it.unit)}</td><td class="r">${qn(r.s.it.code, r.need)}</td><td class="r">${qn(r.s.it.code, r.opening)}</td><td class="r">${qn(r.s.it.code, r.s.pol.ss)}</td><td class="r"><b>${qn(r.s.it.code, r.plan)}</b></td>${r.qs.map((x) => `<td class="r">${qn(r.s.it.code, x)}</td>`).join('')}<td class="r">${num2(r.unit)}</td><td class="r">${baht(r.budget)}</td></tr>`), 'small')
    + `<div class="signs three">${sign('ผู้จัดทำ')}${sign('หัวหน้ากลุ่มงาน')}${sign('ผู้อำนวยการ อนุมัติ')}</div>`, { landscape: true, sub: `${rows.length} รายการ งบประมาณรวม ${baht(total)} บาท จากพยากรณ์ ณ ${esc(thaiFullDate(S.today))}` });
}

const RENDER = { fm01, fm02, fm19, req, fm23, fm35, fm43, fm08, fm46, products, formula, 'pr-memo': prMemo, 'pr-report': prReport, po: poDoc, inspect: inspectDoc, pay: payDoc, 'stock-summary': stockSummary, 'fy-plan': fyPlan };
export function viewDocs(p) {
  const type = p.get('type');
  if (!type || !RENDER[type]) return docList();
  return `<div class="doc-bar">${nav.prev ? backLink('btn') : `<a class="btn" href="#/docs">${I.left}กลับไปรายการเอกสาร</a>`}<h1 class="doc-bar-t">${esc(TITLE[type])}</h1><button type="button" class="btn btn-solid" data-act="print">${I.print}พิมพ์หรือบันทึกเป็น PDF</button></div>
    <div class="papers">${RENDER[type](p)}</div>`;
}
export { chip, daysBetween, PROC_STEPS };
