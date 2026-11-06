// ทะเบียน (ผลิตภัณฑ์ เครื่องมือ FM-43 ผู้ขาย FM-46 ลูกค้า วัสดุ) และหน้าข้อมูลผลิตภัณฑ์ (สูตร ต้นทุน จำลองราคา)
// ทุกการแก้ทะเบียนเป็นเหตุการณ์ที่มีเหตุผล ฉบับเดิมยังอยู่ ลบ = เลิกใช้ (ข้อมูลเก่ายังอ้างถึงได้)
import { CONFIG } from './config.js';
import { S, D, commit, currentUser, staff, active, producing, isFG, thaiDate, daysBetween, assetDue, costOf, bomOf, bomVersions, nextAssetId, MASTER, addDays } from './data.js';
import { esc, num, baht, qty, qh, short, I, chip, tableWrap, supName, who, toast, can, deny, roleNote, nav, setHash, showSlip, slipBlock, head, seg, itemPicker, codeOf, itemLink, jobLink, openDialog, actions } from './ui.js';
import { lotsPanel, movesPanel } from './detail.js';

const STATUS_LV = { 'ผลิตอยู่': 'ok', 'พักผลิต': 'warn', 'ยกเลิกผลิต': 'exp' };
const TABLE_KEY = { suppliers: 'supMaster', customers: 'custMaster', items: 'productMaster', assets: 'assetMaster' };
const TABLE_TH = { suppliers: 'ทะเบียนผู้ขาย', customers: 'ทะเบียนลูกค้า', items: 'ทะเบียนรายการ', assets: 'ทะเบียนเครื่องมือ' };
// ช่องที่แก้ได้ในแต่ละทะเบียน [ชื่อช่อง, ป้าย, ชนิด, ตัวเลือก]
const FIELDS = {
  suppliers: [['name', 'ชื่อผู้ผลิต / จำหน่าย', 'text'], ['type', 'ประเภท', 'select', ['บริษัท', 'เกษตรกร']], ['standard', 'มาตรฐาน', 'text'], ['approved', 'ผ่านการคัดเลือก (FM-46)', 'select', [['Y', 'ผ่าน'], ['N', 'ยังไม่ผ่าน']]], ['quoted_lead_days', 'ระยะส่งที่แจ้ง (วัน)', 'number'], ['note', 'หมายเหตุ', 'text']],
  customers: [['name', 'ชื่อลูกค้า', 'text'], ['type', 'ประเภท', 'select', ['โรงพยาบาล', 'รพ.สต.', 'ร้านค้า', 'คลินิก']], ['credit_days', 'เครดิต (วัน)', 'number']],
  items: [['name', 'ชื่อรายการ', 'text'], ['unit', 'หน่วยนับ', 'text'], ['cost', 'ราคาต่อหน่วย (บาท)', 'number'], ['batch_or_pack', 'ขั้นต่ำต่อครั้ง หรือขนาดรุ่น', 'number'], ['shelf_days', 'อายุ (วัน)', 'number']],
  product: [['name', 'ชื่อผลิตภัณฑ์', 'text'], ['code24', 'เลข 24 หลัก', 'text'], ['shelf_days', 'อายุยา (วัน)', 'number'], ['price', 'ราคาขาย (บาท)', 'number'], ['batch_or_pack', 'ขนาดรุ่น', 'number'], ['loss_pct', 'เกณฑ์สูญเสียผลิต (%)', 'number'], ['pack_loss_pct', 'เกณฑ์สูญเสียบรรจุ (%)', 'number']],
  assets: [['name', 'รายการเครื่องมือ / อุปกรณ์', 'text'], ['asset_no', 'หมายเลขครุภัณฑ์', 'text'], ['serial', 'หมายเลขเครื่อง', 'text'], ['room', 'ตำแหน่งที่ตั้ง (ห้อง)', 'text'], ['owner_id', 'ผู้รับผิดชอบ', 'staff'], ['status', 'สถานะ', 'select', ['ใช้งาน', 'ชำรุด', 'เลิกใช้']], ['sop', 'SOP ที่เกี่ยวข้อง', 'text'], ['pm_days', 'รอบบำรุงรักษา (วัน)', 'number'], ['cal_days', 'รอบสอบเทียบ (วัน 0 = ไม่ต้อง)', 'number'], ['note', 'หมายเหตุ', 'text']],
};
// ช่องผ่านการคัดเลือกของผู้ขาย แก้ได้เฉพาะหัวหน้าฝ่ายควบคุมคุณภาพ ช่องอื่นของผู้ขายแก้ได้เฉพาะผู้ดูแลทะเบียน (QP-12 ข้อ 4.3, QA-016)
const lockedField = (table, k) => table === 'suppliers' && (k === 'approved' ? !can('supApprove') : !can('supMaster'));
const field = (row, [k, label, type, opts], table = '') => {
  const v = row?.[k] ?? '';
  const off = lockedField(table, k) ? ' disabled' : '';
  if (type === 'select') return `<label class="f">${esc(label)}${k === 'approved' && table === 'suppliers' ? '<span class="sub-l">อนุมัติโดยหัวหน้าฝ่ายควบคุมคุณภาพ (QP-12 ข้อ 4.3)</span>' : ''}<select class="in" name="${k}"${off}>${opts.map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`; }).join('')}</select></label>`;
  if (type === 'staff') return `<label class="f">${esc(label)}<select class="in" name="${k}">${S.base.staff.map((s) => `<option value="${s.user_id}" ${s.user_id === v ? 'selected' : ''}>${esc(short(s.name))} ${esc(s.role)}</option>`).join('')}</select></label>`;
  return `<label class="f">${esc(label)}<input class="in" name="${k}" ${type === 'number' ? 'type="number" step="any" min="0"' : 'maxlength="200"'} value="${esc(v)}" ${k === 'code24' ? 'inputmode="numeric" pattern="[0-9]{24}" title="ตัวเลข 24 หลัก"' : ''}${off}></label>`;
};
function masterForm(table, row, extra = {}) {
  const fields = FIELDS[extra.fieldsKey || table];
  const key = row ? row[MASTER[table]] : '';
  return `<form data-form="master" data-table="${table}" data-key="${esc(key)}" data-create="${row ? '' : '1'}" data-back="${esc(extra.back || '')}" class="form-grid">
    ${fields.map((f) => field(row, f, table)).join('')}
    ${extra.fm40 ? '<label class="f">เลขคำขอดำเนินการด้านเอกสาร FM-40<input class="in" name="fm40" maxlength="60" placeholder="เช่น FM-40 ที่ 12/2570"></label>' : ''}
    <label class="f wide">เหตุผลที่${row ? 'แก้ไข' : 'เพิ่ม'} (ต้องกรอก)<input class="in" name="reason" required maxlength="300"></label>
    <div class="form-actions"><button type="submit" class="btn btn-solid" ${can(extra.perm || TABLE_KEY[table]) || (table === 'suppliers' && can('supApprove')) ? '' : 'disabled'}>บันทึก</button><a class="btn" href="${esc(extra.back || '#/registers')}">ยกเลิก</a></div></form>`;
}
function historyOf(pred, title = 'ประวัติการแก้ทะเบียนนี้') {
  const evs = S.events.filter((e) => S.evState.get(e.id)?.status === 'active' && e.type !== 'void' && pred(e)).slice().reverse().slice(0, 30);
  return `<section class="panel" aria-labelledby="hi-h"><div class="panel-h"><h2 id="hi-h">${esc(title)}</h2><a href="#/log">ดูประวัติทั้งหมด</a></div>
    ${evs.length ? `<ul class="mini">${evs.map((e) => `<li><span class="t">${esc(e.summary)}<span class="d">${esc(new Date(e.at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }))} ${esc(short(staff(e.user).name))} เหตุผล ${esc(e.reason || '-')}${e.fm40 ? ` อ้าง ${esc(e.fm40)}` : ''}</span></span><a class="btn btn-sm" href="#/log?del=${e.id}">ยกเลิกการแก้</a></li>`).join('')}</ul>` : '<p class="empty">ยังไม่มีการแก้ไขในเว็บ ทะเบียนตั้งต้นมาจากข้อมูลจำลอง</p>'}</section>`;
}

// ================= หน้าทะเบียน =================
export function viewRegisters(p) {
  const VIEWS_R = { products: regProducts, assets: regAssets, suppliers: (q) => regSimple(q, 'suppliers'), customers: (q) => regSimple(q, 'customers'), items: regItems };
  // ลิงก์ที่ชื่อแท็บผิดหรือลิงก์เก่า กลับไปแท็บแรก ไม่ให้หน้าพัง (QA-025)
  const tab = VIEWS_R[p.get('tab')] ? p.get('tab') : 'products';
  const tabs = [['products', 'ผลิตภัณฑ์'], ['assets', 'เครื่องมือ FM-43'], ['suppliers', 'ผู้ขาย FM-46'], ['customers', 'ลูกค้า'], ['items', 'วัสดุและวัตถุดิบ']];
  const body = VIEWS_R[tab](p);
  return head('ทะเบียน', [], '', 'ทุกทะเบียนแก้ไขได้ ต้องใส่เหตุผล ฉบับเดิมเก็บในประวัติ ลบ = เลิกใช้ ข้อมูลเก่ายังอ้างถึงได้') + slipBlock('registers') + seg('registers', tabs, tab) + body;
}

function regProducts(p) {
  const st = p.get('st') || '', kind = p.get('kind') || '', q = (p.get('q') || '').trim().toLowerCase();
  const all = [...S.items.values()].filter(isFG);
  const rows = all.filter((it) => (!st || (it.status || 'ผลิตอยู่') === st) && (!kind || it.kind === kind) && (!q || it.name.toLowerCase().includes(q) || it.code.includes(q) || (it.code24 || '').includes(q)));
  const link = (o) => { const x = new URLSearchParams({ tab: 'products', st, kind, q: p.get('q') || '', ...o }); for (const [k, v] of [...x]) if (!v) x.delete(k); return `#/registers?${x}`; };
  return `<section class="panel" aria-labelledby="rp-h"><div class="panel-h"><h2 id="rp-h">ทะเบียนผลิตภัณฑ์</h2><span class="meta">${rows.length} จาก ${all.length} รายการ ต้นทุนคิดจากสูตรปัจจุบัน <a href="#/doc?type=products">${I.print}พิมพ์ทะเบียน</a></span></div>
    <div class="filters">${[['', 'ทุกสถานะ'], ['ผลิตอยู่', 'ผลิตอยู่'], ['พักผลิต', 'พักผลิต'], ['ยกเลิกผลิต', 'ยกเลิกผลิต']].map(([k, t]) => `<a class="fchip" href="${link({ st: k })}" ${k === st ? 'aria-current="true"' : ''}>${t} <span class="num">${k ? all.filter((it) => (it.status || 'ผลิตอยู่') === k).length : all.length}</span></a>`).join('')}
      ${['ยารับประทาน', 'ยาใช้ภายนอก'].map((k) => `<a class="fchip" href="${link({ kind: kind === k ? '' : k })}" ${k === kind ? 'aria-current="true"' : ''}>${k}</a>`).join('')}
      <form class="search" data-form="regSearch" data-tab="products" role="search"><label class="sr" for="rq">ค้นผลิตภัณฑ์</label><input class="in" id="rq" name="q" value="${esc(p.get('q') || '')}" placeholder="ค้นชื่อ รหัส หรือเลข 24 หลัก"><input type="hidden" name="st" value="${esc(st)}"><input type="hidden" name="kind" value="${esc(kind)}"><button class="btn btn-sm" type="submit">${I.search}ค้น</button></form></div>
    ${tableWrap(`<table class="stack-t"><thead><tr><th>รหัส</th><th>ผลิตภัณฑ์</th><th>เลข 24 หลัก (สมมุติ)</th><th class="r">ต้นทุนต่อหน่วย</th><th class="r">ราคาขาย</th><th class="r">กำไรขั้นต้น</th><th>สถานะ</th></tr></thead><tbody>
    ${rows.map((it) => { const c = costOf(it.code); const m = it.price ? ((it.price - c.total) / it.price) * 100 : 0; return `<tr><td class="code">${it.code}</td><td class="t-name"><a href="#/product?code=${it.code}">${esc(it.name)}</a><span class="sub-l">${esc(it.kind)} หน่วย${esc(it.unit)}</span></td><td class="code">${esc(it.code24 || '-')}</td><td class="r"><span class="num">${baht(c.total)}</span></td><td class="r"><span class="num">${num(it.price)}</span></td><td class="r"><span class="num"${m < 20 ? ' style="color:var(--warn)"' : ''}>${num(m, 1)}%</span></td><td>${chip(it.status || 'ผลิตอยู่', STATUS_LV[it.status || 'ผลิตอยู่'])}</td></tr>`; }).join('')}</tbody></table>`, 'ทะเบียนผลิตภัณฑ์')}
    <p class="note">ต้นทุนต่อหน่วย = วัตถุดิบ + บรรจุภัณฑ์และฉลาก + ค่าสูญเสียคิดเป็นเงิน (ผลิตไม่เกิน 5% ครีมและเจล 15% บรรจุ 1% ตามเกณฑ์จาก FM-35) ยังไม่รวมค่าแรงและค่าโสหุ้ย กดชื่อผลิตภัณฑ์เพื่อดูสูตร จำลองราคา หรือเปลี่ยนสถานะ</p></section>
    ${historyOf((e) => e.type === 'formula' || (e.type === 'master' && e.effects?.master?.[0]?.table === 'items' && isFG(S.items.get(e.effects.master[0].key))), 'ประวัติการแก้ผลิตภัณฑ์และสูตร')}`;
}

function dueChip(left, warnDays) {
  if (left === null) return '<span class="muted">-</span>';
  return chip(left < 0 ? `เกิน ${-left} วัน` : `อีก ${left} วัน`, left < 0 ? 'crit' : left <= warnDays ? 'warn' : 'ok');
}
function regAssets(p) {
  const id = p.get('id');
  const add = p.get('add');
  const rows = S.base.assets.map((a) => ({ a, d: assetDue(a) }));
  let detail = '';
  if (add) detail = `<section class="panel" aria-labelledby="aa-h"><div class="panel-h"><h2 id="aa-h">เพิ่มเครื่องมือใหม่</h2><span class="meta">รหัสถัดไป <span class="mono">${esc(nextAssetId())}</span></span></div>${roleNote('assetMaster', 'แก้ทะเบียนเครื่องมือ')}${masterForm('assets', null, { back: '#/registers?tab=assets' })}</section>`;
  const sel = rows.find((x) => x.a.asset_id === id);
  if (sel) {
    const log = S.maint.filter((m) => m.asset_id === id).sort((a, b) => b.date.localeCompare(a.date));
    detail = `<section class="panel" aria-labelledby="ad-h"><div class="panel-h"><h2 id="ad-h">${esc(sel.a.asset_id)} ${esc(sel.a.name)}</h2><span class="meta"><a href="#/doc?type=fm08&id=${sel.a.asset_id}">${I.print}พิมพ์ FM-08</a> <a href="#/registers?tab=assets">ปิด</a></span></div>
      ${p.get('edit') ? `${roleNote('assetMaster', 'แก้ทะเบียนเครื่องมือ')}${masterForm('assets', sel.a, { back: `#/registers?tab=assets&id=${id}` })}` : `<dl class="fields" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr))">${FIELDS.assets.map(([k, label]) => `<div><dt>${esc(label)}</dt><dd>${esc(k === 'owner_id' ? short(staff(sel.a[k]).name) : sel.a[k])}</dd></div>`).join('')}<div><dt>ปีที่ได้มา</dt><dd>${esc(sel.a.year)}</dd></div><div><dt>บริษัท ผู้จำหน่าย</dt><dd>${esc(sel.a.vendor)}</dd></div></dl>
      <div class="form-actions" style="margin-top:12px"><a class="btn btn-sm" href="#/registers?tab=assets&id=${id}&edit=1">${I.edit}แก้ไขทะเบียน</a></div>`}</section>
      <section class="panel" aria-labelledby="am-h"><div class="panel-h"><h2 id="am-h">บันทึกบำรุงรักษาและซ่อม FM-08</h2><span class="meta">สอบเทียบครั้งถัดไป ${sel.d.nextCal ? esc(thaiDate(sel.d.nextCal)) : '-'} บำรุงรักษาครั้งถัดไป ${sel.d.nextPm ? esc(thaiDate(sel.d.nextPm)) : '-'}</span></div>
      ${roleNote('assetMaster', 'บันทึก FM-08')}
      <form data-form="maint" data-id="${esc(id)}" class="form-grid">
        <label class="f">ประเภท<select class="in" name="type"><option>บำรุงรักษาตามแผน</option><option>ซ่อม</option><option>สอบเทียบ</option></select></label>
        <label class="f">ผล<select class="in" name="result"><option>ใช้งานได้</option><option>ผ่านเกณฑ์</option><option>รออะไหล่</option><option>ไม่ผ่านเกณฑ์</option></select></label>
        <label class="f wide">รายละเอียดการบำรุงรักษาและซ่อมบำรุง<input class="in" name="detail" required placeholder="เช่น เปลี่ยนสายพาน ทำความสะอาด ตรวจความปลอดภัย"></label>
        <label class="f">ซ่อมบำรุงโดย<input class="in" name="by" required value="ช่างโรงพยาบาล (สมมุติ)"></label>
        <div class="form-actions"><button type="submit" class="btn btn-solid" ${can('assetMaster') ? '' : 'disabled'}>บันทึก FM-08</button></div></form>
      ${tableWrap(`<table style="margin-top:12px"><thead><tr><th>ว.ด.ป.</th><th>ประเภท</th><th>รายละเอียด</th><th>ซ่อมบำรุงโดย</th><th>ผู้ตรวจสอบรับมอบงาน</th><th>ผล</th></tr></thead><tbody>${log.map((m) => `<tr><td class="nowrap">${esc(thaiDate(m.date))}</td><td>${esc(m.type)}</td><td>${esc(m.detail)}</td><td>${esc(m.by)}</td><td>${esc(short(staff(m.checker_id).name))}</td><td>${esc(m.result)}</td></tr>`).join('')}</tbody></table>`, 'บันทึก FM-08')}</section>`;
  }
  return `${detail}<section class="panel" aria-labelledby="ra-h"><div class="panel-h"><h2 id="ra-h">ทะเบียนเครื่องมือ อุปกรณ์ FM-43</h2><span class="meta"><a href="#/doc?type=fm43">${I.print}พิมพ์ FM-43</a> <a class="btn btn-sm" href="#/registers?tab=assets&add=1">${I.plus}เพิ่มเครื่องมือ</a></span></div>
    ${tableWrap(`<table class="stack-t"><thead><tr><th>รหัส</th><th>รายการเครื่องมือ / อุปกรณ์</th><th>หมายเลขครุภัณฑ์</th><th>ห้อง</th><th>ผู้รับผิดชอบ</th><th>สถานะ</th><th>สอบเทียบ</th><th>บำรุงรักษา</th></tr></thead><tbody>
    ${rows.map(({ a, d }) => `<tr${a.asset_id === id ? ' class="is-target" data-target' : ''}><td class="code">${esc(a.asset_id)}</td><td class="t-name"><a href="#/registers?tab=assets&id=${a.asset_id}">${esc(a.name)}</a><span class="sub-l">${esc(a.sop)}</span></td><td class="code">${esc(a.asset_no)}</td><td>${esc(a.room)}</td><td>${who(staff(a.owner_id))}</td><td>${chip(a.status, a.status === 'ใช้งาน' ? 'ok' : a.status === 'ชำรุด' ? 'warn' : 'exp')}</td><td>${a.cal_days ? dueChip(d.calLeft, CONFIG.calWarnDays) : '<span class="muted">ไม่ต้อง</span>'}</td><td>${a.status === 'ใช้งาน' ? dueChip(d.pmLeft, CONFIG.pmWarnDays) : '<span class="muted">-</span>'}</td></tr>`).join('')}</tbody></table>`, 'ทะเบียนเครื่องมือ')}
    <p class="note">ปรับปรุงทะเบียนทุกครั้งที่รับเครื่องใหม่ ย้ายตำแหน่ง ชำรุด หรือเลิกใช้ และทบทวนปีละ 1 ครั้ง (FM-43) รอบบำรุงรักษาตาม SOP-MH-00 และรอบสอบเทียบตาม PR-02 เตือนก่อนครบ ${CONFIG.calWarnDays} และ ${CONFIG.pmWarnDays} วัน (ค่าตั้งต้น รอหัวหน้ากลุ่มงานกำหนด)</p></section>
    ${historyOf((e) => e.type === 'maint' || (e.type === 'master' && e.effects?.master?.[0]?.table === 'assets'))}`;
}

function regSimple(p, table) {
  const keyCol = MASTER[table];
  const editKey = p.get('edit');
  const rows = S.base[table];
  const sel = rows.find((r) => r[keyCol] === editKey);
  const cols = table === 'suppliers' ? [['name', 'ชื่อผู้ผลิต / จำหน่าย'], ['type', 'ประเภท'], ['standard', 'มาตรฐาน'], ['approved', 'ผ่านคัดเลือก'], ['quoted_lead_days', 'ระยะส่งที่แจ้ง'], ['note', 'หมายเหตุ']] : [['name', 'ชื่อลูกค้า'], ['type', 'ประเภท'], ['credit_days', 'เครดิต (วัน)']];
  const perm = TABLE_KEY[table];
  const note = table === 'suppliers' && can('supApprove') && !can(perm) ? `<p class="form-note">หัวหน้าฝ่ายควบคุมคุณภาพแก้ได้เฉพาะช่องผ่านการคัดเลือก (อนุมัติผู้ขายตาม QP-12 ข้อ 4.3) ช่องอื่นแก้โดยผู้ดูแลทะเบียนผู้ขาย</p>` : roleNote(perm, `แก้${TABLE_TH[table]}`);
  return `${sel ? `<section class="panel" aria-labelledby="re-h"><div class="panel-h"><h2 id="re-h">แก้ไข ${esc(sel.name)}</h2><a href="#/registers?tab=${table}">ปิด</a></div>${note}${masterForm(table, sel, { back: `#/registers?tab=${table}` })}</section>` : ''}
  <section class="panel" aria-labelledby="rs-h"><div class="panel-h"><h2 id="rs-h">${table === 'suppliers' ? 'ทะเบียนผู้ขายที่ได้รับการคัดเลือก FM-46' : 'ทะเบียนลูกค้า'}</h2><span class="meta">${rows.length} ราย ${table === 'suppliers' ? `<a href="#/doc?type=fm46">${I.print}พิมพ์ FM-46</a>` : ''}</span></div>
    ${tableWrap(`<table class="stack-t"><thead><tr><th>รหัส</th>${cols.map(([, t]) => `<th>${esc(t)}</th>`).join('')}<th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>
    ${rows.map((r) => `<tr${r[keyCol] === editKey ? ' class="is-target" data-target' : ''}><td class="code">${esc(r[keyCol])}</td>${cols.map(([k]) => (k === 'approved' ? `<td>${r[k] === 'Y' ? chip('ผ่าน', 'ok') : chip('ยังไม่ผ่าน', 'crit')}</td>` : `<td${k === 'name' ? ' class="t-name"' : ''}>${esc(r[k])}</td>`)).join('')}<td>${active(r) ? chip('ใช้อยู่', 'ok') : chip('เลิกใช้', 'exp')}</td>
      <td class="nowrap"><a class="btn btn-sm" href="#/registers?tab=${table}&edit=${encodeURIComponent(r[keyCol])}">${I.edit}แก้ไข</a> <button type="button" class="btn btn-sm${active(r) ? ' btn-crit' : ''}" data-act="toggleActive" data-table="${table}" data-key="${esc(r[keyCol])}" ${can(perm) ? '' : 'disabled'}>${active(r) ? 'เลิกใช้' : 'กลับมาใช้'}</button></td></tr>`).join('')}</tbody></table>`, TABLE_TH[table])}
    ${table === 'suppliers' ? '<p class="note">ผู้ขายที่ยังไม่ผ่านการคัดเลือกและอนุมัติ ห้ามสั่งซื้อและห้ามรับของ (หมายเหตุท้าย FM-46) ระบบไม่ให้เขียนใบขอซื้อหรือบันทึกรับเข้ากับผู้ขายที่ยังไม่ผ่านการคัดเลือก ผู้อนุมัติผู้ขายคือหัวหน้าฝ่ายควบคุมคุณภาพ คนละคนกับผู้ซื้อ (QP-12 ข้อ 3.2.1 และ 4.3)</p>' : ''}</section>
    ${historyOf((e) => e.type === 'master' && e.effects?.master?.[0]?.table === table)}`;
}

function regItems(p) {
  const kind = p.get('kind') || '', q = (p.get('q') || '').trim().toLowerCase();
  const editKey = p.get('edit');
  const all = [...S.items.values()].filter((it) => !isFG(it));
  const rows = all.filter((it) => (!kind || it.kind === kind) && (!q || it.name.toLowerCase().includes(q) || it.code.includes(q)));
  const sel = S.items.get(editKey);
  const link = (o) => { const x = new URLSearchParams({ tab: 'items', kind, q: p.get('q') || '', ...o }); for (const [k, v] of [...x]) if (!v) x.delete(k); return `#/registers?${x}`; };
  return `${sel ? `<section class="panel" aria-labelledby="ie-h"><div class="panel-h"><h2 id="ie-h">แก้ไข ${esc(sel.name)}</h2><a href="${link({ edit: '' })}">ปิด</a></div>${roleNote('productMaster', 'แก้ทะเบียนรายการ')}${masterForm('items', sel, { back: link({ edit: '' }) })}</section>` : ''}
  <section class="panel" aria-labelledby="ri-h"><div class="panel-h"><h2 id="ri-h">ทะเบียนวัสดุและวัตถุดิบ</h2><span class="meta">${rows.length} จาก ${all.length} รายการ</span></div>
    <div class="filters">${['', 'สด', 'แห้ง', 'ผง', 'บรรจุภัณฑ์', 'เคมีภัณฑ์', 'ฉลาก'].map((k) => `<a class="fchip" href="${link({ kind: k })}" ${k === kind ? 'aria-current="true"' : ''}>${esc(k || 'ทั้งหมด')}</a>`).join('')}
      <form class="search" data-form="regSearch" data-tab="items" role="search"><label class="sr" for="iq">ค้นรายการ</label><input class="in" id="iq" name="q" value="${esc(p.get('q') || '')}" placeholder="ค้นชื่อหรือรหัส"><input type="hidden" name="kind" value="${esc(kind)}"><button class="btn btn-sm" type="submit">${I.search}ค้น</button></form></div>
    ${tableWrap(`<table class="stack-t"><thead><tr><th>รหัส</th><th>รายการ</th><th>ประเภท</th><th>หน่วย</th><th class="r">ราคาต่อหน่วย</th><th>ผู้ขายประจำ</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>
    ${rows.slice(0, 120).map((it) => `<tr${it.code === editKey ? ' class="is-target" data-target' : ''}><td class="code">${it.code}</td><td class="t-name">${itemLink(it)}</td><td>${esc(it.kind)}</td><td>${esc(it.unit)}</td><td class="r"><span class="num">${baht(it.cost || 0)}</span></td><td>${esc(it.supplier_id ? short(supName(it.supplier_id)) : it.make === 'farm' ? 'เกษตรกร' : 'ผลิตเอง')}</td><td>${active(it) ? chip('ใช้อยู่', 'ok') : chip('เลิกใช้', 'exp')}</td>
      <td class="nowrap"><a class="btn btn-sm" href="${link({ edit: it.code })}">${I.edit}แก้ไข</a> <button type="button" class="btn btn-sm${active(it) ? ' btn-crit' : ''}" data-act="toggleActive" data-table="items" data-key="${it.code}" ${can('productMaster') ? '' : 'disabled'}>${active(it) ? 'เลิกใช้' : 'กลับมาใช้'}</button></td></tr>`).join('')}</tbody></table>`, 'ทะเบียนวัสดุและวัตถุดิบ')}
    ${rows.length > 120 ? '<p class="note">แสดง 120 รายการแรก ใช้ตัวกรองหรือช่องค้น</p>' : ''}</section>
    ${historyOf((e) => e.type === 'master' && e.effects?.master?.[0]?.table === 'items' && !isFG(S.items.get(e.effects.master[0].key)))}`;
}

// ================= หน้าข้อมูลผลิตภัณฑ์ =================
// แถวในตารางสูตร (ใช้ทั้งตอนเปิดหน้าและตอนกดเพิ่มแถว) บนมือถือเรียงเป็นแผ่นมีป้ายกำกับ
const simRow = (r, i) => `<tr data-line="${esc(r.code)}"><td class="t-name">${itemLink(r.code, r.name)}<span class="sub-l">${esc(r.kind)} ${esc(r.code)}</span></td>
    <td class="r t-qty" data-l="ปริมาณต่อหน่วย"><label class="sr" for="sq-${i}">ปริมาณต่อหน่วย ${esc(r.name)}</label><input class="in in-sm in-num" id="sq-${i}" data-sim="qty" value="${r.qty}" type="number" step="any" min="0"><span class="u">${esc(r.unit)}</span></td>
    <td class="r t-price" data-l="ราคาต่อหน่วย (บาท)"><label class="sr" for="sp-${i}">ราคาต่อหน่วย ${esc(r.name)}</label><input class="in in-sm in-num" id="sp-${i}" data-sim="price" value="${r.price}" type="number" step="any" min="0"></td>
    <td class="r t-amt" data-l="ต้นทุน (บาท)"><span class="num" data-out="amt">${baht(r.amount)}</span></td><td class="t-del"><button type="button" class="btn-ico" data-act="simDel" aria-label="ลบแถว ${esc(r.name)}">${I.close}</button></td></tr>`;
export function viewProduct(p) {
  const code = p.get('code');
  const it = S.items.get(code);
  if (!it || !isFG(it)) return head('ข้อมูลผลิตภัณฑ์', [], '', 'ไม่พบรหัสนี้') + '<p class="empty"><a href="#/registers?tab=products">กลับไปทะเบียนผลิตภัณฑ์</a></p>';
  const status = it.status || 'ผลิตอยู่';
  const c = costOf(code);
  const vs = bomVersions(code);
  const margin = it.price ? ((it.price - c.total) / it.price) * 100 : 0;
  const from = addDays(S.today, -365);
  const inv = new Set(S.invoices.filter((v) => v.date > from && v.date <= S.today).map((v) => v.inv_no));
  const sold = S.invoiceLines.filter((l) => l.item_code === code && inv.has(l.inv_no)).reduce((t, l) => ({ q: t.q + l.qty, a: t.a + l.amount }), { q: 0, a: 0 });
  const st = D.itemStats.get(code);
  const jobs = S.jobs.filter((j) => j.item_code === code).slice(-5).reverse();
  const acts = `<a class="btn" href="#/product?code=${code}&edit=1">${I.edit}แก้ไขข้อมูล</a><a class="btn" href="#/doc?type=formula&code=${code}">${I.print}พิมพ์สูตรและต้นทุน</a>`;
  const lineRow = (l, i) => simRow({ code: l.in_item, name: l.item?.name || l.in_item, kind: l.item?.kind || '', unit: l.item?.unit || '', qty: l.qty_per_unit, price: l.unit, amount: l.amount }, i);
  const mats = [...S.items.values()].filter((x) => !isFG(x) && x.make !== 'farm' && active(x));
  return head(it.name, [], acts, `รหัส ${esc(code)} เลข 24 หลัก ${esc(it.code24 || '-')} ${chip(status, STATUS_LV[status])}`) + slipBlock('product') + `
  ${p.get('edit') ? `<section class="panel" aria-labelledby="pe-h"><div class="panel-h"><h2 id="pe-h">แก้ไขข้อมูลผลิตภัณฑ์</h2><a href="#/product?code=${code}">ปิด</a></div>${roleNote('productMaster', 'แก้ข้อมูลผลิตภัณฑ์')}${masterForm('items', it, { fieldsKey: 'product', fm40: true, perm: 'productMaster', back: `#/product?code=${code}` })}</section>` : ''}
  <div class="work">
    <section class="panel" aria-labelledby="pi-h"><div class="panel-h"><h2 id="pi-h">ข้อมูลผลิตภัณฑ์</h2><span class="meta">${esc(it.kind)}</span></div>
      <dl class="fields fields-auto">
        <div><dt>รหัส</dt><dd class="num">${code}</dd></div><div class="span2"><dt>เลข 24 หลัก (สมมุติ)</dt><dd class="mono">${esc(it.code24 || '-')}</dd></div><div><dt>หน่วย</dt><dd>${esc(it.unit)}</dd></div><div><dt>ขนาดรุ่น</dt><dd>${esc(qty(code, it.batch_or_pack))}</dd></div>
        <div><dt>อายุยา</dt><dd>${num(it.shelf_days)} วัน</dd></div><div><dt>ราคาขาย</dt><dd>${num(it.price)} บาท</dd></div><div><dt>เกณฑ์สูญเสีย ผลิต บรรจุ</dt><dd>${num(it.loss_pct)}% ${num(it.pack_loss_pct)}%</dd></div><div><dt>สินค้าหลัก</dt><dd>${it.key === 'Y' ? 'ใช่ ระดับบริการ 95%' : 'ไม่ใช่ ระดับบริการ 90%'}</dd></div></dl>
      <div class="status-row"><span class="stub-k">เปลี่ยนสถานะ</span>
        <form data-form="prodStatus" data-code="${code}" class="inline-form"><label class="sr" for="ps">สถานะใหม่</label><select class="in in-sm" id="ps" name="status">${['ผลิตอยู่', 'พักผลิต', 'ยกเลิกผลิต'].map((s) => `<option ${s === status ? 'selected' : ''}>${s}</option>`).join('')}</select><label class="sr" for="pr">เหตุผล</label><input class="in in-sm" id="pr" name="reason" required placeholder="เหตุผล เช่น ยอดขายต่ำ 2 ปี"><label class="sr" for="pf">เลข FM-40</label><input class="in in-sm" id="pf" name="fm40" placeholder="FM-40 ที่"><button class="btn btn-sm" type="submit" ${can('productMaster') ? '' : 'disabled'}>บันทึกสถานะ</button></form></div>
      <p class="note">ยกเลิกผลิตแล้ว ระบบไม่เตือนให้ผลิตเพิ่ม และไม่ขึ้นให้เปิดงาน แต่ของในคลังยังขายได้จนหมด เปลี่ยนเลข 24 หลัก อายุยา หรือฉลาก แก้ในระบบโรงงานผ่านคำขอ FM-40</p></section>
    <section class="panel" aria-labelledby="ps-h"><div class="panel-h"><h2 id="ps-h">ขายและผลิต 12 เดือน</h2></div>
      <dl class="fields"><div><dt>ขาย</dt><dd>${esc(qty(code, sold.q))}</dd></div><div><dt>ยอดขาย</dt><dd>${num(sold.a)} บาท</dd></div><div><dt>คงคลังตรวจสอบแล้ว</dt><dd>${esc(qty(code, st?.released || 0))}</dd></div><div><dt>กำไรขั้นต้นต่อหน่วย</dt><dd>${baht((it.price || 0) - c.total)} บาท (${num(margin, 1)}%)</dd></div></dl>
      <ul class="mini" style="margin-top:10px">${jobs.map((j) => `<li><span class="t">${jobLink(j.job_id)} ${esc(qty(code, j.qty))}<span class="d">${esc(thaiDate(j.created_date))} ${esc(j.out_lot || '')}</span></span>${chip(j.status === 'done' ? 'ตรวจสอบแล้ว' : j.status === 'qc' ? 'รอปล่อยผ่าน' : j.status === 'waiting' ? 'รอเริ่ม' : 'กำลังผลิต', j.status === 'done' ? 'ok' : 'ink')}</li>`).join('') || '<li class="empty">ยังไม่มีงานผลิต</li>'}</ul></section>
  </div>
  ${lotsPanel(code, p.get('lots') === 'all', `#/product?code=${code}&lots=all`)}
  <section class="panel sim" aria-labelledby="sf-h" data-code="${code}"><div class="panel-h"><h2 id="sf-h">สูตรต่อ 1 ${esc(it.unit)} ฉบับที่ ${vs.length} และต้นทุน</h2><span class="meta">แก้ตัวเลขในช่องเพื่อจำลองราคา ยังไม่บันทึกจนกว่าจะกดบันทึกเป็นสูตรฉบับใหม่</span></div>
    ${tableWrap(`<table class="sim-t stack-t"><thead><tr><th>วัตถุดิบและบรรจุภัณฑ์</th><th class="r">ปริมาณต่อหน่วย</th><th class="r">ราคาต่อหน่วย (บาท)</th><th class="r">ต้นทุน (บาท)</th><th><span class="sr">ลบแถว</span></th></tr></thead><tbody>${c.lines.map(lineRow).join('')}</tbody></table>`, 'สูตรและต้นทุน')}
    <div class="sim-add">${itemPicker({ name: 'add', items: mats, value: '', label: 'เพิ่มวัตถุดิบหรือบรรจุภัณฑ์', id: 'sim', required: false })}<button type="button" class="btn btn-sm" data-act="simAdd">${I.plus}เพิ่มแถว</button></div>
    <div class="sim-grid">
      <label class="f">เกณฑ์สูญเสียผลิต (%)<input class="in in-num" data-sim="loss" type="number" step="any" min="0" value="${c.lossPct}"></label>
      <label class="f">เกณฑ์สูญเสียบรรจุ (%)<input class="in in-num" data-sim="packLoss" type="number" step="any" min="0" value="${c.packLossPct}"></label>
      <label class="f">ค่าแรงและค่าใช้จ่ายอื่นต่อหน่วย (บาท) ถ้ามี<input class="in in-num" data-sim="other" type="number" step="any" min="0" value="0"></label>
      <label class="f">กำไรที่ต้องการ (% ของต้นทุน)<input class="in in-num" data-sim="markup" type="number" step="any" min="0" value="${Math.max(0, Math.round(((it.price || 0) / Math.max(0.01, c.total) - 1) * 100))}"></label>
    </div>
    <dl class="sim-out">
      <div><dt>วัตถุดิบ</dt><dd><span class="num" data-out="material">${baht(c.material)}</span></dd></div>
      <div><dt>บรรจุภัณฑ์และฉลาก</dt><dd><span class="num" data-out="packaging">${baht(c.packaging)}</span></dd></div>
      <div><dt>ค่าสูญเสีย</dt><dd><span class="num" data-out="loss">${baht(c.loss + c.packLoss)}</span></dd></div>
      <div><dt>ต้นทุนต่อหน่วย</dt><dd><span class="num big" data-out="total">${baht(c.total)}</span></dd></div>
      <div><dt>ราคาประมาณการ</dt><dd><span class="num big" data-out="price">${baht(it.price || 0)}</span></dd></div>
      <div><dt>ราคาขายปัจจุบัน ${num(it.price)} บาท กำไร</dt><dd><span class="num" data-out="margin">${num(margin, 1)}%</span></dd></div>
      <div><dt>ต้นทุนต่อรุ่น ${esc(qty(code, it.batch_or_pack))}</dt><dd><span class="num" data-out="batch">${num(c.total * (it.batch_or_pack || 0))}</span> บาท</dd></div>
    </dl>
    <form data-form="formula" data-code="${code}" class="form-grid sim-save">
      <label class="f">เหตุผลที่เปลี่ยนสูตร (ต้องกรอก)<input class="in" name="reason" required placeholder="เช่น เปลี่ยนขนาดแคปซูลตามผลทดลองผลิต"></label>
      <label class="f">เลขคำขอ FM-40<input class="in" name="fm40" required placeholder="เช่น FM-40 ที่ 15/2570"></label>
      <div class="form-actions"><button type="submit" class="btn btn-solid" ${can('formulaEdit') ? '' : 'disabled'}>บันทึกเป็นสูตรฉบับใหม่</button><button type="button" class="btn" data-act="simReset">ล้างค่ากลับเป็นสูตรปัจจุบัน</button></div>
      ${can('formulaEdit') ? '' : `<p class="form-note wide">จำลองได้ทุกคน บันทึกเป็นสูตรฉบับใหม่ได้เฉพาะหัวหน้ากลุ่มงานหรือหัวหน้าฝ่ายผลิต</p>`}
    </form>
    <p class="note">ราคาต่อหน่วยวัตถุดิบมาจากราคาที่เคยซื้อในทะเบียนรายการ (สมุนไพรแห้ง = ราคาสด ÷ อัตราได้ผลแห้ง) ค่าสูญเสียคิดเป็นเงินจากเกณฑ์ผลิตและบรรจุ ราคาประมาณการ = ต้นทุน × (1 + กำไรที่ต้องการ) ใช้ประกอบการตั้งราคาเท่านั้น ค่าแรงและค่าโสหุ้ยกรอกเองเพราะไม่มีในข้อมูล</p>
  </section>
  <section class="panel" aria-labelledby="fv-h"><div class="panel-h"><h2 id="fv-h">ประวัติสูตร</h2><span class="meta">${vs.length} ฉบับ</span></div>
    <ul class="mini">${vs.slice().reverse().map((v) => `<li><span class="t">ฉบับที่ ${v.v} ${v.rows.length} รายการ<span class="d">${v.at ? `${esc(new Date(v.at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }))} ${esc(short(staff(v.user).name))}` : 'ตั้งต้น'} ${esc(v.reason)}${v.fm40 ? ` อ้าง ${esc(v.fm40)}` : ''}</span></span>${v.v === vs.length ? chip('ใช้อยู่', 'ok') : chip('ฉบับเก่า', 'exp')}</li>`).join('')}</ul></section>
  ${movesPanel(code)}
  ${historyOf((e) => (e.type === 'master' && e.effects?.master?.[0]?.key === code) || (e.type === 'formula' && e.effects?.formula?.[0]?.item === code), 'ประวัติการแก้ผลิตภัณฑ์นี้')}`;
}

// คำนวณใหม่ทันทีเมื่อแก้ตัวเลขในช่องจำลอง (ไม่วาดหน้าใหม่ เคอร์เซอร์ไม่หลุด)
function readSim(box) {
  const rows = [...box.querySelectorAll('tr[data-line]')].map((tr) => ({ in_item: tr.dataset.line, qty_per_unit: Number(tr.querySelector('[data-sim="qty"]').value) || 0, price: Number(tr.querySelector('[data-sim="price"]').value) || 0 }));
  const val = (k) => Number(box.querySelector(`[data-sim="${k}"]`)?.value) || 0;
  return { rows, lossPct: val('loss'), packLossPct: val('packLoss'), other: val('other'), markup: val('markup') };
}
export function recalcSim(box) {
  const code = box.dataset.code;
  const it = S.items.get(code);
  const s = readSim(box);
  const c = costOf(code, s.rows.map((r) => ({ in_item: r.in_item, qty_per_unit: r.qty_per_unit })), { prices: Object.fromEntries(s.rows.map((r) => [r.in_item, r.price])), lossPct: s.lossPct, packLossPct: s.packLossPct, other: s.other });
  const set = (k, v) => { const el = box.querySelector(`[data-out="${k}"]`); if (el) el.textContent = v; };
  box.querySelectorAll('tr[data-line]').forEach((tr, i) => { const el = tr.querySelector('[data-out="amt"]'); if (el) el.textContent = baht(c.lines[i]?.amount || 0); });
  set('material', baht(c.material)); set('packaging', baht(c.packaging)); set('loss', baht(c.loss + c.packLoss)); set('total', baht(c.total));
  set('price', baht(c.total * (1 + s.markup / 100))); set('margin', `${num(it.price ? ((it.price - c.total) / it.price) * 100 : 0, 1)}%`); set('batch', num(c.total * (it.batch_or_pack || 0)));
}
export function onSimInput(e) {
  const box = e.target.closest('.sim');
  if (box && e.target.dataset.sim) recalcSim(box);
}

// ================= บันทึก =================
function submitMaster(form) {
  const table = form.dataset.table;
  const create = form.dataset.create === '1';
  const f = new FormData(form);
  const reason = String(f.get('reason') || '').trim();
  if (!reason) return toast('ใส่เหตุผลก่อน', 'warn');
  const keyCol = MASTER[table];
  const key = create ? (table === 'assets' ? nextAssetId() : '') : form.dataset.key;
  const row = create ? null : S.base[table].find((r) => r[keyCol] === key);
  const isProduct = !create && table === 'items' && isFG(row);
  const perm = isProduct ? 'productMaster' : TABLE_KEY[table];
  if (!can(perm) && !(table === 'suppliers' && can('supApprove'))) return deny(perm, 'แก้ทะเบียน');
  const patch = {};
  for (const [k, v] of f) {
    if (k === 'reason' || k === 'fm40') continue;
    const num1 = ['quoted_lead_days', 'credit_days', 'cost', 'batch_or_pack', 'shelf_days', 'price', 'loss_pct', 'pack_loss_pct', 'pm_days', 'cal_days'].includes(k);
    const val = num1 ? Number(v) : String(v).trim();
    if (create || String(row[k] ?? '') !== String(val)) patch[k] = val;
  }
  if (patch.code24 !== undefined && !/^\d{24}$/.test(patch.code24)) return toast('เลข 24 หลักต้องเป็นตัวเลข 24 ตัว', 'warn');
  if (!Object.keys(patch).length) return toast('ไม่มีช่องไหนเปลี่ยน', 'warn');
  // คนซื้อแก้สถานะผ่านการคัดเลือกเองไม่ได้ และหัวหน้าฝ่ายควบคุมคุณภาพแก้ได้เฉพาะช่องนี้ (QA-016)
  if (table === 'suppliers') {
    if ('approved' in patch && !can('supApprove')) return deny('supApprove', 'เปลี่ยนสถานะผ่านการคัดเลือกของผู้ขาย');
    if (Object.keys(patch).some((k) => k !== 'approved') && !can('supMaster')) return deny('supMaster', 'แก้ข้อมูลอื่นของผู้ขาย');
  }
  if (create) Object.assign(patch, { [keyCol]: key, year: new Date().getFullYear() + 543, vendor: '', active: '' });
  const diff = create ? 'เพิ่มใหม่' : Object.keys(patch).map((k) => `${k} ${row[k] ?? '-'} เป็น ${patch[k]}`).join(', ');
  const name = create ? patch.name : row.name;
  commit({ type: 'master', reason, fm40: String(f.get('fm40') || '').trim(), summary: `${create ? 'เพิ่ม' : 'แก้'}${TABLE_TH[table]} ${key} ${name} (${diff})`, effects: { master: [{ table, key, patch, create }] } });
  showSlip(isProduct ? 'product' : 'registers', { k: `บันทึกการแก้${TABLE_TH[table]}`, no: key, title: name, lines: [diff, `เหตุผล ${reason}`], stamp: ['บันทึกแล้ว', 'ink'] });
  location.hash = form.dataset.back || '#/registers';
}
function toggleActive(b) {
  const table = b.dataset.table, key = b.dataset.key;
  const perm = TABLE_KEY[table];
  if (!can(perm)) return deny(perm, 'แก้ทะเบียน');
  const row = S.base[table].find((r) => r[MASTER[table]] === key);
  const off = active(row);
  openDialog({
    title: `${off ? 'เลิกใช้' : 'กลับมาใช้'} ${row.name}`, ok: off ? 'ยืนยันเลิกใช้' : 'ยืนยันกลับมาใช้', tone: off ? 'crit' : 'solid',
    body: `<p>${off ? 'เลิกใช้แล้วจะเลือกในฟอร์มใหม่ไม่ได้ ข้อมูลเก่ายังอ้างถึงได้' : 'กลับมาใช้แล้วจะเลือกในฟอร์มได้อีกครั้ง'}</p><label class="f">เหตุผล (ต้องกรอก)<input class="in" name="reason" maxlength="300" required autofocus></label>`,
    onOk: (fd) => actions.guard(() => {
      const reason = String(fd.get('reason') || '').trim();
      if (!reason) return 'ต้องมีเหตุผล';
      commit({ type: 'master', reason, summary: `${off ? 'เลิกใช้' : 'กลับมาใช้'} ${TABLE_TH[table]} ${key} ${row.name}`, effects: { master: [{ table, key, patch: { active: off ? 'N' : '' } }] } });
      toast(off ? 'เลิกใช้แล้ว ข้อมูลเก่ายังอ้างถึงได้' : 'กลับมาใช้แล้ว');
      nav.route();
      return true;
    }),
  });
}
function submitStatus(form) {
  if (!can('productMaster')) return deny('productMaster', 'เปลี่ยนสถานะผลิตภัณฑ์');
  const code = form.dataset.code;
  const it = S.items.get(code);
  const f = new FormData(form);
  const status = f.get('status');
  const reason = String(f.get('reason') || '').trim();
  if (!reason) return toast('ใส่เหตุผลก่อน', 'warn');
  if (status === (it.status || 'ผลิตอยู่')) return toast('สถานะเดิม', 'warn');
  commit({ type: 'master', reason, fm40: String(f.get('fm40') || '').trim(), summary: `เปลี่ยนสถานะ ${code} ${it.name} จาก ${it.status || 'ผลิตอยู่'} เป็น ${status}`, effects: { master: [{ table: 'items', key: code, patch: { status } }] } });
  showSlip('product', { k: 'เปลี่ยนสถานะผลิตภัณฑ์', no: code, title: it.name, lines: [`${it.status || 'ผลิตอยู่'} เป็น ${status}`, `เหตุผล ${reason}`], stamp: [status, STATUS_LV[status]] });
  nav.route();
}
function submitFormula(form) {
  if (!can('formulaEdit')) return deny('formulaEdit', 'บันทึกสูตรฉบับใหม่');
  const box = form.closest('.sim');
  const code = box.dataset.code;
  const f = new FormData(form);
  const reason = String(f.get('reason') || '').trim(), fm40 = String(f.get('fm40') || '').trim();
  if (!reason || !fm40) return toast('ใส่เหตุผลและเลขคำขอ FM-40 ก่อน', 'warn');
  const s = readSim(box);
  const rows = s.rows.filter((r) => r.qty_per_unit > 0).map((r) => ({ in_item: r.in_item, qty_per_unit: r.qty_per_unit }));
  if (!rows.length) return toast('สูตรต้องมีอย่างน้อย 1 รายการ', 'warn');
  const before = bomOf(code);
  const changed = rows.length !== before.length || rows.some((r) => !before.find((b) => b.in_item === r.in_item && Number(b.qty_per_unit) === r.qty_per_unit));
  if (!changed) return toast('สูตรไม่เปลี่ยน (เปลี่ยนแค่ราคาไม่ต้องบันทึกเป็นสูตรใหม่ แก้ราคาที่ทะเบียนรายการ)', 'warn');
  const it = S.items.get(code);
  const v = bomVersions(code).length + 1;
  commit({ type: 'formula', reason, fm40, summary: `บันทึกสูตร ${code} ${it.name} ฉบับที่ ${v} (${rows.length} รายการ)`, effects: { formula: [{ item: code, rows, reason, fm40 }] } });
  showSlip('product', { k: 'สูตรฉบับใหม่', no: `${code} ฉบับที่ ${v}`, title: it.name, lines: [`อ้าง ${fm40}`, `เหตุผล ${reason}`, 'งานผลิตที่เปิดหลังจากนี้เบิกวัตถุดิบตามสูตรฉบับนี้'], stamp: ['บันทึกแล้ว', 'ink'], links: [['พิมพ์สูตรและต้นทุน', `#/doc?type=formula&code=${code}`]] });
  nav.route();
}
function submitMaint(form) {
  if (!can('assetMaster')) return deny('assetMaster', 'บันทึก FM-08');
  const id = form.dataset.id;
  const a = S.base.assets.find((x) => x.asset_id === id);
  const f = new FormData(form);
  const m = { date: S.today, asset_id: id, type: f.get('type'), detail: String(f.get('detail') || '').trim(), by: String(f.get('by') || '').trim(), checker_id: S.user, result: f.get('result') };
  if (!m.detail || !m.by) return toast('ใส่รายละเอียดและผู้ซ่อมบำรุง', 'warn');
  const fx = { maint: [m] };
  if (m.type === 'ซ่อม' && m.result === 'รออะไหล่' && a.status !== 'ชำรุด') fx.master = [{ table: 'assets', key: id, patch: { status: 'ชำรุด' } }];
  if (m.result === 'ใช้งานได้' && a.status === 'ชำรุด') fx.master = [{ table: 'assets', key: id, patch: { status: 'ใช้งาน', note: '' } }];
  commit({ type: 'maint', summary: `FM-08 ${id} ${a.name} ${m.type} ${m.result}`, effects: fx });
  showSlip('registers', { k: 'สำเนาบันทึก FM-08', no: id, title: `${a.name} ${m.type}`, lines: [m.detail, `โดย ${m.by} ผู้ตรวจสอบรับมอบงาน ${short(currentUser().name)}`], stamp: [m.result, m.result === 'ใช้งานได้' || m.result === 'ผ่านเกณฑ์' ? 'ok' : 'warn'], links: [['พิมพ์ FM-08', `#/doc?type=fm08&id=${id}`]] });
  nav.route();
}

export const registerHandlers = {
  click: {
    toggleActive,
    simDel: (b) => { const box = b.closest('.sim'); b.closest('tr').remove(); recalcSim(box); },
    simAdd: (b) => {
      const box = b.closest('.sim');
      const inp = box.querySelector('input[name="add"]');
      const code = codeOf(inp.value);
      const it = S.items.get(code);
      if (!it) return toast('เลือกรายการจากที่ขึ้นให้เลือกก่อน', 'warn');
      if (box.querySelector(`tr[data-line="${CSS.escape(code)}"]`)) return toast('มีรายการนี้ในสูตรแล้ว', 'warn');
      const i = box.querySelectorAll('tr[data-line]').length + 100;
      box.querySelector('.sim-t tbody').insertAdjacentHTML('beforeend', simRow({ code, name: it.name, kind: it.kind, unit: it.unit, qty: 0, price: it.cost || 0, amount: 0 }, i));
      inp.value = '';
      box.querySelector(`#sq-${i}`).focus();
    },
    simReset: () => nav.route(),
  },
  submit: {
    master: submitMaster, prodStatus: submitStatus, formula: submitFormula, maint: submitMaint,
    regSearch: (form) => { const f = new FormData(form); const o = { tab: form.dataset.tab }; for (const [k, v] of f) if (v) o[k] = String(v).trim(); setHash('registers', o); },
  },
  change: {},
};
export { daysBetween, qh, D };
