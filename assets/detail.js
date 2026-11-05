// หน้ารายละเอียด: รายการ (สมุนไพร วัตถุดิบ บรรจุภัณฑ์ ฉลาก) และงานบนบอร์ด
// กดเข้ามาได้จากการ์ดงาน คูปองแจ้งเตือน และชื่อรายการในตารางทุกห้อง ยาสำเร็จรูปใช้หน้าผลิตภัณฑ์ (registers.js) ที่ดึงส่วนคลังจากไฟล์นี้
import { CONFIG, LANES, STAGE_OWNER } from './config.js';
import { S, D, staff, isFG, active, usable, bomOf, bomNeeds, stageOf, supplierLead, prStage, thaiDate, daysBetween } from './data.js';
import { esc, num, num2, qn, qty, qh, I, chip, lotChip, tableWrap, supName, short, who, can, head, alertsBlock, slipBlock, itemLink, jobLink, LEVEL_TEXT } from './ui.js';
import { chart } from './plan.js';

const IN_TYPES = new Set(['รับ', 'ยกมา']);
const KIND_ORDER = ['สด', 'แห้ง', 'ผง'];
const kindRank = (k) => { const i = KIND_ORDER.indexOf(k); return i < 0 ? 9 : i; };
const lotLink = (no) => `<a class="mono" href="#/trace?lot=${encodeURIComponent(no)}">${esc(no)}</a>`;
const when = (iso) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
const sumLots = (code, f) => (S.lotsByItem.get(code) || []).filter(f).reduce((t, l) => t + l.qty_left, 0);
const field = (k, v, cls = '') => `<div${cls ? ` class="${cls}"` : ''}><dt>${esc(k)}</dt><dd>${v}</dd></div>`;

function expCell(l) {
  if (!l.exp_date) return '<span class="muted">ไม่กำหนด</span>';
  const d = daysBetween(S.today, l.exp_date);
  const lv = d <= CONFIG.expiryCritDays ? 'crit' : d <= CONFIG.expiryWarnDays ? 'warn' : '';
  return `${esc(thaiDate(l.exp_date))}<span class="sub-l${lv ? ` tx-${lv}` : ''}">${d < 0 ? `หมดอายุมาแล้ว ${num(-d)} วัน` : `อีก ${num(d)} วัน`}</span>`;
}
function lotSource(l) {
  if (l.source === 'ผลิต' && l.source_ref) return `ผลิตจากงาน ${jobLink(l.source_ref)}`;
  if (l.source === 'ใบสั่งซื้อ' && l.source_ref) {
    const po = S.pos.find((x) => x.po_no === l.source_ref);
    return `ซื้อตาม <span class="mono">${esc(l.source_ref)}</span>${po ? `<span class="sub-l">${esc(short(supName(po.supplier_id)))}</span>` : ''}`;
  }
  if (l.source === 'รับซื้อ' && l.source_ref) return `รับซื้อจาก ${esc(short(supName(l.source_ref)))}`;
  return esc(l.source || '-');
}

// ล็อตของรายการ เรียงตามลำดับที่จะเบิก (ตรวจสอบแล้วและหมดอายุก่อน ขึ้นก่อน)
export function lotsPanel(code, showAll, allHref) {
  const ls = S.lotsByItem.get(code) || [];
  const live = ls.filter((l) => l.qty_left > 1e-9);
  const rank = (l) => (usable(l) ? 0 : l.status === 'รอปล่อยผ่าน' ? 1 : 2);
  live.sort((a, b) => rank(a) - rank(b) || (a.exp_date || '9999').localeCompare(b.exp_date || '9999') || a.date_in.localeCompare(b.date_in));
  const used = ls.filter((l) => l.qty_left <= 1e-9).sort((a, b) => b.date_in.localeCompare(a.date_in));
  const rows = showAll ? [...live, ...used.slice(0, 30)] : live;
  const firstUsable = live.find(usable);
  const body = rows.map((l) => `<tr${l.qty_left <= 1e-9 ? ' class="is-used"' : ''}><td>${lotLink(l.lot_no)}${l === firstUsable ? ` ${chip('เบิกล็อตนี้ก่อน', 'ink')}` : ''}</td><td>${lotChip(l.qty_left <= 1e-9 ? 'ใช้หมดแล้ว' : l.status)}</td><td class="r">${qh(code, l.qty_left)}</td><td class="nowrap">${esc(thaiDate(l.date_in))}</td><td class="nowrap">${expCell(l)}</td><td>${lotSource(l)}</td></tr>`).join('');
  const sum = (st) => live.filter((l) => (st === 'ok' ? usable(l) : l.status === st)).length;
  return `<section class="panel" aria-labelledby="lots-h"><div class="panel-h"><h2 id="lots-h">ล็อตในคลัง เรียงตามลำดับเบิก</h2><span class="meta">เบิกได้ ${sum('ok')} ล็อต รอปล่อยผ่าน ${sum('รอปล่อยผ่าน')} ล็อต${sum('ไม่ผ่าน') ? ` ไม่ผ่าน ${sum('ไม่ผ่าน')} ล็อต` : ''}</span></div>
    ${rows.length ? tableWrap(`<table class="lots-t"><thead><tr><th>Lot No.</th><th>ป้าย</th><th class="r">คงเหลือ</th><th>รับหรือผลิตเมื่อ</th><th>หมดอายุ</th><th>ที่มา</th></tr></thead><tbody>${body}</tbody></table>`, 'ล็อตในคลัง') : '<p class="empty">ไม่มีของในคลังตอนนี้</p>'}
    <p class="panel-foot">เบิกจากล็อตบนสุดก่อน คือหมดอายุก่อนจ่ายก่อน ถ้าวันหมดอายุเท่ากันใช้ล็อตที่รับก่อน (WHO TRS 1025 ภาคผนวก 7 ข้อ 12.30) ล็อตที่ยังรอปล่อยผ่านเบิกไม่ได้${used.length && !showAll ? ` <a href="${allHref}">ดูล็อตที่ใช้หมดแล้ว ${num(used.length)} ล็อต</a>` : ''}</p></section>`;
}

// ความเคลื่อนไหวล่าสุด แบบบัตรคุม FM-02
export function movesPanel(code, n = 15) {
  const ms = S.moves.filter((m) => m.item_code === code).sort((a, b) => b.date.localeCompare(a.date) || String(b.move_id).localeCompare(String(a.move_id))).slice(0, n);
  const body = ms.map((m) => {
    const inn = IN_TYPES.has(m.type);
    return `<tr><td class="nowrap">${esc(thaiDate(m.date))}</td><td>${esc(m.type)}</td><td>${m.lot_no ? lotLink(m.lot_no) : '-'}</td><td class="r"><span class="num${inn ? '' : ' tx-out'}">${inn ? '+' : '−'}${qn(code, m.qty)}</span><span class="u">${esc(S.items.get(code)?.unit || '')}</span></td><td>${esc(m.party || '')}</td><td>${esc(m.doc_no || '')}</td><td class="nowrap">${esc(short(staff(m.user_id).name))}</td></tr>`;
  }).join('');
  return `<section class="panel" aria-labelledby="mv-h"><div class="panel-h"><h2 id="mv-h">รับจ่ายล่าสุด</h2><a href="#/doc?type=fm02&item=${encodeURIComponent(code)}">${I.print}พิมพ์บัตรคุม FM-02</a></div>
    ${ms.length ? tableWrap(`<table><thead><tr><th>วันที่</th><th>รายการ</th><th>Lot No.</th><th class="r">จำนวน</th><th>รับจากหรือจ่ายให้</th><th>เอกสาร</th><th>ผู้บันทึก</th></tr></thead><tbody>${body}</tbody></table>`, 'รับจ่ายล่าสุด') : '<p class="empty">ยังไม่มีการรับจ่าย</p>'}</section>`;
}

// ผลตรวจและการปล่อยผ่านล่าสุดของรายการ
export function releasesPanel(code, n = 5) {
  const rs = S.releases.filter((r) => r.item_code === code).sort((a, b) => b.date.localeCompare(a.date)).slice(0, n);
  return `<section class="panel" aria-labelledby="rl-h"><div class="panel-h"><h2 id="rl-h">ปล่อยผ่านล่าสุด</h2><span class="meta">ผู้บันทึกผลกับผู้อนุมัติเป็นคนละคน</span></div>
    <ul class="mini">${rs.map((r) => `<li><span class="t">${lotLink(r.lot_no)} ${esc(thaiDate(r.date))}<span class="d">ตรวจ ${esc(short(staff(r.checker_id).name))} อนุมัติ ${esc(short(staff(r.approver_id).name))}${r.note ? ` ${esc(r.note)}` : ''}</span></span>${lotChip(r.result === 'ผ่าน' ? 'ตรวจสอบแล้ว' : 'ไม่ผ่าน')}</li>`).join('') || '<li class="empty">ยังไม่มีการปล่อยผ่าน</li>'}</ul></section>`;
}

// สมุนไพรเดียวกันคนละรูปแบบ สด แห้ง ผง และอัตราที่ใช้แปรรูปตามสูตร
function herbRoute(it) {
  if (!it.herb_id) return '';
  const herb = (S.base.herbs || []).find((h) => h.herb_id === it.herb_id);
  const fam = [...S.items.values()].filter((x) => x.herb_id === it.herb_id && !isFG(x) && active(x)).sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || a.code.localeCompare(b.code));
  if (!fam.length) return '';
  const li = fam.map((m) => {
    const st = D.itemStats.get(m.code);
    const b = bomOf(m.code).find((x) => fam.some((f) => f.code === x.in_item));
    const ratio = b ? `ใช้${esc(S.items.get(b.in_item).name)} ${num2(b.qty_per_unit)} ${esc(S.items.get(b.in_item).unit)} ต่อ 1 ${esc(m.unit)}` : m.make === 'farm' ? 'รับซื้อจากเกษตรกร' : '';
    const name = m.code === it.code ? `<strong>${esc(m.name)}</strong>` : itemLink(m);
    return `<li${m.code === it.code ? ' aria-current="true"' : ''}><span class="hr-dot" aria-hidden="true"></span><span><span class="t">${esc(m.kind)} ${name} <span class="mono">${esc(m.code)}</span></span>${ratio ? `<span class="d">${ratio}</span>` : ''}</span><span class="num">${qh(m.code, st ? st.released : sumLots(m.code, usable))}</span></li>`;
  }).join('');
  return `<section class="panel" aria-labelledby="hr-h"><div class="panel-h"><h2 id="hr-h">เส้นทาง${esc(herb ? herb.name_th : 'สมุนไพร')}</h2>${herb ? `<span class="meta"><i>${esc(herb.name_sci)}</i> ส่วนที่ใช้ ${esc(herb.part)}</span>` : ''}</div>
    <ol class="herb-route">${li}</ol><p class="panel-foot">ตัวเลขด้านขวา = คงคลังที่ตรวจสอบแล้ว เบิกได้</p></section>`;
}

// ได้มาจากไหน: ผู้ขาย ใบสั่งซื้อ ใบขอซื้อ เกษตรกร หรืองานที่ผลิต
function supplyPanel(it, st) {
  const parts = [];
  if (it.supplier_id) {
    const lead = (id, label) => { const sl = supplierLead(id, it.code); if (!sl.supplier) return ''; return `<li><span class="t">${esc(label)} ${esc(short(sl.supplier.name))}<span class="d">${sl.quoted ? `ส่งตามที่เสนอราคา ${num(sl.L)} วัน (ประวัติยังน้อย)` : `ส่งจริงเฉลี่ย ${num(sl.L)} ±${num(sl.sL)} วัน จาก ${num(sl.n)} ครั้ง`}</span></span>${sl.supplier.approved === 'Y' ? chip('ผ่านคัดเลือก FM-46', 'ok') : chip('ยังไม่ผ่านคัดเลือก', 'warn')}</li>`; };
    parts.push(lead(it.supplier_id, 'ผู้ขายหลัก'));
    if (it.backup_supplier_id) parts.push(lead(it.backup_supplier_id, 'ผู้ขายสำรอง'));
    for (const v of st?.poViews || []) parts.push(`<li><span class="t"><span class="mono">${esc(v.po.po_no)}</span> สั่ง ${esc(qty(it.code, v.po.qty))}<span class="d">สั่ง ${esc(thaiDate(v.po.order_date))} คาดถึง ${esc(thaiDate(v.expected))} โอกาสทัน ${num(v.prob * 100)}%</span></span>${chip(v.verdict.text, v.verdict.level)}</li>`);
    for (const r of S.prs.filter((x) => x.item_code === it.code && !x.rejected && !x.paid && !x.po_no)) parts.push(`<li><span class="t"><a class="mono" href="#/store?tab=buy&pr=${encodeURIComponent(r.pr_no)}">${esc(r.pr_no)}</a> ขอซื้อ ${esc(qty(it.code, r.qty))}<span class="d">รอ${esc(prStage(r).title)}</span></span>${chip('ใบขอซื้อ', 'ink')}</li>`);
  }
  if (it.make === 'farm') {
    const farm = (S.lotsByItem.get(it.code) || []).filter((l) => l.source === 'รับซื้อ').sort((a, b) => b.date_in.localeCompare(a.date_in)).slice(0, 5);
    for (const l of farm) parts.push(`<li><span class="t">${esc(short(supName(l.source_ref)))}<span class="d">${esc(thaiDate(l.date_in))} ${lotLink(l.lot_no)}</span></span><span>${qh(it.code, l.qty_in)}</span></li>`);
  }
  if (it.lane) {
    const jobs = S.jobs.filter((j) => j.item_code === it.code).sort((a, b) => b.created_date.localeCompare(a.created_date)).slice(0, 5);
    for (const j of jobs) parts.push(`<li><span class="t">${jobLink(j.job_id)} ${esc(qty(it.code, j.qty))}<span class="d">เปิดงาน ${esc(thaiDate(j.created_date))}${j.out_lot ? ` ได้ ${esc(j.out_lot)}` : ''}</span></span>${chip(stageOf(j), stageOf(j) === 'ตรวจสอบแล้ว' ? 'ok' : 'ink')}</li>`);
    const ins = bomOf(it.code);
    if (ins.length) parts.push(`<li><span class="t">ทำจาก<span class="d">${ins.map((b) => `${itemLink(b.in_item)} ${num2(b.qty_per_unit)} ${esc(S.items.get(b.in_item)?.unit || '')}`).join(' และ ')} ต่อ 1 ${esc(it.unit)}</span></span></li>`);
  }
  if (!parts.length) return '';
  return `<section class="panel" aria-labelledby="sp-h"><div class="panel-h"><h2 id="sp-h">ได้มาจากไหน</h2></div><ul class="mini">${parts.join('')}</ul></section>`;
}

// ใช้ทำอะไร: ผลิตภัณฑ์หรือรูปแบบถัดไปที่มีรายการนี้ในสูตร
function usedInPanel(it) {
  const outs = [...new Map(S.bom.filter((r) => r.in_item === it.code).map((r) => [r.out_item, r])).values()].map((r) => ({ r, o: S.items.get(r.out_item) })).filter((x) => x.o && active(x.o));
  if (!outs.length) return '';
  const top = outs.slice(0, 12);
  return `<section class="panel" aria-labelledby="ui-h"><div class="panel-h"><h2 id="ui-h">ใช้ทำอะไร</h2><span class="meta">${num(outs.length)} รายการมีในสูตร</span></div>
    <ul class="mini">${top.map(({ r, o }) => `<li><span class="t">${itemLink(o)}<span class="d">ใช้ ${num2(r.qty_per_unit)} ${esc(it.unit)} ต่อ 1 ${esc(o.unit)}</span></span><span class="mono">${esc(o.code)}</span></li>`).join('')}</ul>
    ${outs.length > top.length ? `<p class="panel-foot">และอีก ${num(outs.length - top.length)} รายการ</p>` : ''}</section>`;
}

export function viewItem(p) {
  const code = p.get('code');
  const it = S.items.get(code);
  if (!it) return head('ไม่พบรายการ', [], '', 'ไม่พบรหัสนี้ในทะเบียน') + '<p class="empty"><a href="#/registers?tab=items">กลับไปทะเบียนวัตถุดิบและบรรจุภัณฑ์</a></p>';
  const st = D.itemStats.get(code);
  const alerts = D.alerts.filter((a) => a.item === code);
  const acts = [
    it.supplier_id && can('requested') ? `<a class="btn btn-solid" href="#/store?tab=buy&new=1&item=${encodeURIComponent(code)}">${I.plus}เขียนใบขอซื้อ</a>` : '',
    `<a class="btn" href="#/registers?tab=items&edit=${encodeURIComponent(code)}">${I.edit}แก้ข้อมูลในทะเบียน</a>`,
  ].join('');
  const sub = `รหัส <span class="mono">${esc(code)}</span> ${esc(it.kind)} หน่วยนับ ${esc(it.unit)} ${active(it) ? (st ? chip(LEVEL_TEXT[st.level], st.level) : '') : chip('เลิกใช้แล้ว', 'exp')}`;
  const cover = st && Number.isFinite(st.cover) ? `${num(st.cover)} วัน<span class="sub-l">ถึง ${esc(thaiDate(st.stockoutDate))}</span>` : 'ไม่มีการเบิกใน 90 วัน';
  const stock = st ? `<dl class="fields fields-auto">
      ${field('ตรวจสอบแล้ว เบิกได้', qh(code, st.released))}${field('รอปล่อยผ่าน', qh(code, st.quarantine))}${field('ไม่ผ่าน', qh(code, st.rejected))}
      ${field('สั่งแล้วรอรับหรือกำลังผลิต', qh(code, st.onOrder))}${field('ใช้เฉลี่ยต่อวัน', `<span class="num">${num2(st.u.mean)}</span><span class="u">${esc(it.unit)}</span>`)}${field('พอใช้อีก', cover)}
      ${field('สต็อกกันชน', qh(code, st.pol.ss))}${field('จุดสั่งซื้อ', qh(code, st.pol.rop))}${field('ระดับเติมเต็ม', qh(code, st.pol.S))}
      ${field('แนะนำสั่งหรือผลิตเพิ่ม', st.suggestQty > 0 ? qh(code, st.suggestQty) : 'ยังไม่ต้อง')}${field('ระดับบริการเป้าหมาย', `${num(st.target * 100)}%`)}${field('อายุหลังรับหรือผลิต', it.shelf_days ? `${num(it.shelf_days)} วัน` : 'ไม่กำหนด')}
    </dl>` : `<dl class="fields fields-auto">${field('ตรวจสอบแล้ว เบิกได้', qh(code, sumLots(code, usable)))}${field('รอปล่อยผ่าน', qh(code, sumLots(code, (l) => l.status === 'รอปล่อยผ่าน')))}${field('อายุหลังรับ', it.shelf_days ? `${num(it.shelf_days)} วัน` : 'ไม่กำหนด')}</dl>
      <p class="panel-foot">${it.make === 'farm' ? 'สมุนไพรสดรับจากเกษตรกรแล้วเข้าแปรรูปต่อเลย ระบบจึงไม่ตั้งจุดสั่งซื้อให้ ใช้ความต้องการของรูปแบบแห้งและผงวางแผนรับซื้อแทน' : 'ยังไม่มีประวัติการเบิกพอคำนวณจุดสั่งซื้อ'}</p>`;
  return head(it.name, alerts, acts, sub) + alertsBlock(alerts, 'ไม่มีแจ้งเตือนของรายการนี้วันนี้') + `
  <div class="work">
    <div class="stack">
      <section class="panel" aria-labelledby="st-h"><div class="panel-h"><h2 id="st-h">คงคลังและเกณฑ์สั่ง</h2><span class="meta">ใช้เฉลี่ยจากการเบิก 90 วันล่าสุด</span></div>${stock}</section>
      <section class="panel" aria-labelledby="fc-h"><div class="panel-h"><h2 id="fc-h">เบิกรายเดือนและพยากรณ์</h2></div>${chart(code)}</section>
      ${releasesPanel(code)}
    </div>
    <div class="stack">${herbRoute(it)}${supplyPanel(it, st)}${usedInPanel(it)}</div>
  </div>
  ${lotsPanel(code, p.get('lots') === 'all', `#/item?code=${encodeURIComponent(code)}&lots=all`)}
  ${movesPanel(code)}`;
}

// ================= หน้ารายละเอียดงาน =================
export function viewJob(p) {
  const id = p.get('id');
  const job = S.jobs.find((j) => j.job_id === id);
  if (!job) return head('ไม่พบงาน', [], '', 'ไม่พบเลขงานนี้') + '<p class="empty"><a href="#/prod">กลับไปบอร์ดงานฝ่ายผลิต</a></p>';
  const it = S.items.get(job.item_code);
  const L = LANES[job.lane];
  const roomId = job.lane === 'ผลิต' ? 'prod' : 'process';
  const card = D.board.find((c) => c.job.job_id === id);
  const stage = card ? card.stage : stageOf(job);
  const idx = L.stages.indexOf(stage);
  const owner = staff(STAGE_OWNER[stage]);
  const blocked = card?.blocked || '';
  const canMove = !!card && can(`move${job.lane}`);
  const qcStage = stage === 'รอปล่อยผ่าน' || stage === 'ตรวจสอบแล้ว';
  const alerts = D.alerts.filter((a) => a.job === id);
  const acts = [
    canMove ? `<button type="button" class="btn" data-act="move" data-job="${esc(id)}" data-dir="-1" ${idx <= 0 || qcStage ? 'disabled' : ''}>${I.left}ย้อนขั้น</button><button type="button" class="btn btn-solid" data-act="move" data-job="${esc(id)}" data-dir="1" ${qcStage ? 'disabled' : ''}>เลื่อนไปขั้นถัดไป${I.right}</button>` : '',
    `<a class="btn" href="#/${roomId}?tab=board&job=${encodeURIComponent(id)}">ดูบนบอร์ด</a>`,
  ].join('');
  const sub = `${esc(L.title)} ${chip(stage, stage === 'ตรวจสอบแล้ว' ? 'ok' : stage === 'รอปล่อยผ่าน' ? 'crit' : 'ink')}${blocked ? ` ${chip(`หยุด รอ${blocked}`, 'crit')}` : ''}`;
  const steps = `<ol class="steps" style="--n:${L.stages.length}" aria-label="ขั้นตอนงาน${esc(L.title)}">${L.stages.map((s, i) => `<li class="${i < idx ? 'is-done' : i === idx ? 'is-now' : ''}"${i === idx ? ' aria-current="step"' : ''}><span class="st-t">${esc(s)}</span><span class="st-s">${esc(L.sop[s])}</span>${i === idx ? `<span class="st-w">${who(owner)}${card ? `<span class="days">${num(card.days)} วัน</span>` : ''}</span>` : ''}</li>`).join('')}</ol>`;
  const info = `<dl class="fields fields-auto">
      ${field(job.lane === 'ผลิต' ? 'ผลิตภัณฑ์' : 'สมุนไพร', itemLink(it))}${field('จำนวน', qh(it.code, job.qty))}${field('ผู้ถืองานตอนนี้', who(owner))}
      ${field('เปิดงาน', esc(thaiDate(job.created_date)))}${field('เริ่มทำ', job.start_date ? esc(thaiDate(job.start_date)) : 'ยังไม่เริ่ม')}${field(job.status === 'running' ? 'คาดว่าเสร็จ' : 'ทำเสร็จ', job.end_date ? esc(thaiDate(job.end_date)) : '-')}
      ${field('ปล่อยผ่าน', job.release_date ? esc(thaiDate(job.release_date)) : '-')}${field('เลขที่ผลิต', job.out_lot ? lotLink(job.out_lot) : 'ออกเมื่อส่งตรวจ')}${blocked ? field('หยุดรอ', `<span class="tx-crit">${esc(blocked)}</span>`) : ''}
    </dl>`;
  // ผลผลิตและการปล่อยผ่าน
  let out;
  if (job.out_lot) {
    const lot = S.lotMap.get(job.out_lot);
    const res = S.qcResults.get(job.out_lot);
    const rel = S.releases.find((r) => r.lot_no === job.out_lot);
    out = `<ul class="mini">
      <li><span class="t">${lotLink(job.out_lot)}<span class="d">${lot ? `คงเหลือ ${esc(qty(it.code, lot.qty_left))} หมดอายุ ${esc(thaiDate(lot.exp_date) || 'ไม่กำหนด')}` : ''}</span></span>${lot ? lotChip(lot.status) : ''}</li>
      <li><span class="t">ผลตรวจ<span class="d">${res ? `${esc(short(staff(res.checker_id).name))} ${esc(thaiDate(res.date))} ${esc(res.note || '')}` : rel ? `${esc(short(staff(rel.checker_id).name))} บันทึกผลแล้ว` : 'รอเจ้าหน้าที่ฝ่ายควบคุมคุณภาพบันทึกผล'}</span></span>${res ? chip(res.result, res.result === 'ผ่านเกณฑ์' ? 'ok' : 'crit') : rel ? chip('บันทึกแล้ว', 'ok') : chip('รอผล', 'warn')}</li>
      <li><span class="t">อนุมัติปล่อยผ่าน<span class="d">${rel ? `${esc(short(staff(rel.approver_id).name))} ${esc(thaiDate(rel.date))}` : 'รอหัวหน้าฝ่ายควบคุมคุณภาพ'}</span></span>${rel ? lotChip(rel.result === 'ผ่าน' ? 'ตรวจสอบแล้ว' : 'ไม่ผ่าน') : lotChip('รอปล่อยผ่าน')}</li></ul>
      ${rel && isFG(it) ? `<p class="panel-foot"><a href="#/doc?type=fm35&month=${rel.date.slice(0, 7)}">${I.print}บันทึกการปล่อยผ่าน FM-35 เดือนนั้น</a></p>` : ''}`;
  } else {
    out = '<p class="empty">ยังไม่มีเลขที่ผลิต ระบบออกเลขให้เมื่อย้ายงานไปขั้นรอปล่อยผ่าน แล้วติดป้ายรอปล่อยผ่านทันที (SOP-PD-07)</p>';
  }
  // วัตถุดิบ: เบิกแล้วแสดงล็อตที่จ่าย ยังไม่เบิกแสดงที่ต้องใช้ตามสูตรเทียบของในคลัง
  const issued = S.jobInputs.filter((x) => x.job_id === id);
  const inputs = issued.length
    ? tableWrap(`<table class="stack-t"><thead><tr><th>วัตถุดิบ</th><th>Lot No.</th><th class="r">จำนวนที่เบิก</th><th>ป้ายล็อต</th></tr></thead><tbody>${issued.map((x) => `<tr><td class="t-name">${itemLink(x.item_code)}</td><td data-l="Lot No.">${lotLink(x.lot_no)}</td><td class="r" data-l="จำนวนที่เบิก">${qh(x.item_code, x.qty)}</td><td data-l="ป้ายล็อต">${lotChip(S.lotMap.get(x.lot_no)?.status || '-')}</td></tr>`).join('')}</tbody></table>`, 'วัตถุดิบที่เบิก')
      + `<p class="panel-foot">เบิกแบบหมดอายุก่อนจ่ายก่อน <a href="#/doc?type=req&job=${encodeURIComponent(id)}">${I.print}พิมพ์ใบเบิก FM-28 ถึง FM-33</a></p>`
    : bomOf(job.item_code).length
      ? tableWrap(`<table class="stack-t"><thead><tr><th>วัตถุดิบตามสูตร</th><th class="r">ต้องใช้</th><th class="r">ตรวจสอบแล้วในคลัง</th><th>พอไหม</th></tr></thead><tbody>${bomNeeds(job.item_code, job.qty).map((n) => `<tr><td class="t-name">${itemLink(n.code)}</td><td class="r" data-l="ต้องใช้">${qh(n.code, n.need)}</td><td class="r" data-l="มีในคลัง">${qh(n.code, n.have)}</td><td data-l="พอไหม">${n.ok ? chip('พอ', 'ok') : chip('ไม่พอ', 'crit')}</td></tr>`).join('')}</tbody></table>`, 'วัตถุดิบตามสูตร')
        + '<p class="panel-foot">ยังไม่เบิก ระบบเบิกให้ตามสูตรเมื่อเลื่อนงานจากขั้นเบิกวัตถุดิบ</p>'
      : '<p class="empty">ไม่มีสูตรในระบบ</p>';
  const evs = S.events.filter((e) => (e.summary || '').includes(id) || JSON.stringify(e.effects || {}).includes(`"${id}"`)).slice(-12).reverse();
  return head(`${id} ${it.name}`, alerts, acts, sub) + slipBlock(roomId) + (alerts.length ? alertsBlock(alerts) : '') + `
  <section class="panel" aria-labelledby="jr-h"><div class="panel-h"><h2 id="jr-h">งานอยู่ขั้นไหน ในมือใคร</h2><span class="meta">ขั้นงานตาม SOP ของ${esc(L.title)}</span></div>${steps}</section>
  <div class="work">
    <section class="panel" aria-labelledby="ji-h"><div class="panel-h"><h2 id="ji-h">ข้อมูลงาน</h2></div>${info}</section>
    <section class="panel" aria-labelledby="jo-h"><div class="panel-h"><h2 id="jo-h">ผลผลิตและการปล่อยผ่าน</h2></div>${out}</section>
  </div>
  <section class="panel" aria-labelledby="jm-h"><div class="panel-h"><h2 id="jm-h">${issued.length ? 'วัตถุดิบที่เบิก' : 'วัตถุดิบตามสูตร'}</h2></div>${inputs}</section>
  <section class="panel" aria-labelledby="jh-h"><div class="panel-h"><h2 id="jh-h">บันทึกในเว็บของงานนี้</h2><a href="#/log">ดูประวัติทั้งหมด</a></div>
    <ul class="mini">${evs.map((e) => `<li><span class="t">${esc(e.summary)}<span class="d">${esc(short(staff(e.user).name))} ${esc(when(e.at))}${e.reason ? ` เหตุผล ${esc(e.reason)}` : ''}</span></span></li>`).join('') || '<li class="empty">ยังไม่มีการบันทึกจากเว็บ งานนี้มาจากข้อมูลตั้งต้น</li>'}</ul></section>`;
}
