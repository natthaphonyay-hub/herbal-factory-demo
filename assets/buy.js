// จัดซื้อวิธีเฉพาะเจาะจง: กรอกใบขอซื้อครั้งเดียว ระบบออกเอกสารแต่ละขั้น และบอกว่าตอนนี้รอใคร
// ขั้นตอนตามชุดแบบฟอร์มวิธีเฉพาะเจาะจงใน OF06 (พ.ร.บ. จัดซื้อจัดจ้าง 2560 ม.56 (2)(ข) ระเบียบกระทรวงการคลัง 2560 ข้อ 22 และ 79)
import { CONFIG, PROC, PROC_STEPS, CAN } from './config.js';
import { S, D, commit, currentUser, thaiDate, daysBetween, addDays, poForecast, prStage, nextPrNo, nextPoNo, active, staff, isIntUnit } from './data.js';
import { esc, num, baht, qty, qh, short, I, chip, tableWrap, supName, toast, can, deny, roleNote, nav, setHash, showSlip, itemPicker, codeOf, actions, itemLink, openDialog } from './ui.js';

const STEP = Object.fromEntries(PROC_STEPS.map((s, i) => [s.key, { ...s, i }]));
const DOCS = {
  requested: [['บันทึกขออนุมัติจัดซื้อ', 'pr-memo']],
  dir_ok: [['รายงานขออนุมัติจัดซื้อโดยวิธีเฉพาะเจาะจง', 'pr-report']],
  ordered: [['ใบสั่งซื้อ', 'po']],
  received: [['FM-01 บันทึกการตรวจรับ', 'fm01']],
  inspected: [['ใบตรวจรับพัสดุ', 'inspect']],
  pay_requested: [['บันทึกขออนุมัติเบิกจ่าย', 'pay']],
};
export const docLinks = (r) => PROC_STEPS.filter((s) => r[s.key] && DOCS[s.key]).flatMap((s) => DOCS[s.key]).map(([t, type]) => (type === 'fm01' ? `<a href="#/doc?type=fm01&from=${r.received}&to=${r.received}">${I.doc}${esc(t)}</a>` : `<a href="#/doc?type=${type}&id=${encodeURIComponent(r.pr_no)}">${I.doc}${esc(t)}</a>`)).join('');

// ตัวสร้างใบขอซื้อ (ใช้ทั้งตอนเขียนใหม่และตอนแก้ไข)
export function buildPR(inp, keep = {}) {
  const it = S.items.get(inp.item);
  if (!it || it.make !== 'buy') return { error: 'เลือกรายการที่ซื้อจากผู้ขาย' };
  const sup = S.base.suppliers.find((s) => s.supplier_id === inp.supplier);
  if (!sup) return { error: 'เลือกผู้ขาย' };
  if (sup.approved !== 'Y') return { error: 'ผู้ขายรายนี้ยังไม่ผ่านการคัดเลือกในทะเบียน FM-46 ห้ามสั่งซื้อ' };
  const q = Number(inp.qty), unit = Number(inp.unit_cost);
  if (!(q > 0) || inp.unit_cost === '' || inp.unit_cost === undefined || !(unit >= 0)) return { error: 'ใส่จำนวนและราคาต่อหน่วย' };
  if (isIntUnit(it.unit) && !Number.isInteger(q)) return { error: `${it.unit} นับเป็นชิ้น ใส่จำนวนเต็ม (กรอก ${inp.qty})` };
  // ราคา 0 บาทต้องมีเหตุผล เช่น ได้รับบริจาค (QA-035)
  const zero = String(inp.zero_reason || '').trim();
  if (unit === 0 && !zero) return { error: 'ราคาต่อหน่วย 0 บาท ต้องใส่เหตุผลในช่อง "ถ้าราคา 0 บาท ใส่เหตุผล" เช่น ได้รับบริจาค' };
  const amount = Math.round(q * unit * 100) / 100;
  if (amount > PROC.specificMax) return { error: `วงเงิน ${baht(amount)} บาท เกิน ${num(PROC.specificMax)} บาท ใช้วิธีเฉพาะเจาะจงไม่ได้ ต้องใช้วิธีประกวดราคา` };
  const prNo = keep.pr || nextPrNo();
  const date = keep.date || S.today;
  // ขอซื้อรายการเดิมซ้ำในช่วงใกล้กัน: รวมแล้วเกินวงเงิน = อาจแบ่งซื้อ ให้ผู้ขอซื้อยืนยันพร้อมเหตุผล (QA-017)
  if (!inp.sure) {
    const recent = S.prs.filter((r) => r.item_code === inp.item && !r.rejected && r.pr_no !== keep.pr && Math.abs(daysBetween(r.requested, date)) <= CONFIG.splitWindowDays);
    const sum = recent.reduce((t, r) => t + r.amount, 0) + amount;
    if (recent.length && sum > PROC.specificMax) return { confirm: { title: 'อาจเป็นการแบ่งซื้อ ตรวจก่อนส่ง', ok: 'ยืนยัน ส่งขออนุมัติ', msgs: [`${it.name} มีใบขอซื้อในช่วง ${CONFIG.splitWindowDays} วันแล้ว ${recent.length} ใบ (${recent.map((r) => r.pr_no).join(', ')}) รวมใบนี้ ${baht(sum)} บาท เกินวงเงินวิธีเฉพาะเจาะจง ${num(PROC.specificMax)} บาท`, 'ถ้าเป็นความต้องการเดียวกัน ต้องรวมเป็นใบเดียวและใช้วิธีจัดซื้อที่ตรงกับวงเงินรวม ห้ามแบ่งซื้อให้วงเงินแต่ละใบต่ำลง'], field: { name: 'split_note', label: 'เหตุผลที่ไม่ใช่การแบ่งซื้อ (ผู้ขอซื้อยืนยัน)' } } };
    const pending = recent.filter((r) => !r.ordered);
    if (pending.length) return { confirm: { title: 'มีใบขอซื้อรายการนี้ค้างอยู่', msgs: [`${it.name} มีใบขอซื้อที่ยังไม่ออกใบสั่งซื้อ ${pending.map((r) => r.pr_no).join(', ')} ขอซื้อเพิ่มอีกใบหรือไม่`] } };
    const past = S.prs.filter((r) => r.item_code === inp.item && r.pr_no !== keep.pr).slice(-10).map((r) => r.qty).sort((a, b) => a - b);
    const med = past.length >= 3 ? past[Math.floor(past.length / 2)] : 0;
    if (med > 0 && q > med * CONFIG.unusualQtyX && q > past[past.length - 1] * 2) return { confirm: { title: 'จำนวนขอซื้อผิดปกติ ตรวจอีกครั้ง', msgs: [`ขอซื้อ ${qty(inp.item, q)} มากกว่าที่เคยขอราว ${num(q / med, 1)} เท่า (ปกติครั้งละราว ${qty(inp.item, med)}) ตรวจว่าไม่ได้พิมพ์ศูนย์เกิน`] } };
  }
  return {
    summary: `เขียนใบขอซื้อ ${prNo} ${it.name} ${qty(inp.item, q)} จาก ${sup.name} ${baht(amount)} บาท`, room: 'store',
    effects: { newPr: [{ pr_no: prNo, po_no: '', item_code: inp.item, supplier_id: inp.supplier, qty: q, unit_cost: unit, amount, requested: date, requested_by: keep.user || S.user, purpose: inp.purpose || '', zero_reason: zero, split_note: String(inp.split_note || '').trim() }] },
    slip: { k: 'สำเนาบันทึกขออนุมัติจัดซื้อ', no: prNo, title: `${it.name} ${qty(inp.item, q)} ${baht(amount)} บาท`, lines: [`${sup.name} วิธีเฉพาะเจาะจง ${amount > PROC.formSplit ? 'วงเงินเกิน 100,000 บาท' : 'วงเงินไม่เกิน 100,000 บาท'}`, 'ส่งหัวหน้ากลุ่มงานเห็นชอบ แล้วผู้อำนวยการอนุมัติ'], stamp: ['ส่งขออนุมัติ', 'ink'], links: [['พิมพ์บันทึกขออนุมัติจัดซื้อ', `#/doc?type=pr-memo&id=${encodeURIComponent(prNo)}`]] },
    after: `#/store?tab=buy&pr=${encodeURIComponent(prNo)}`,
  };
}

function prForm(p) {
  const buy = [...S.items.values()].filter((i) => i.make === 'buy' && active(i));
  const sugg = [...D.itemStats.values()].find((s) => s.it.make === 'buy' && s.suggestQty > 0 && !s.openPOs.length && active(s.it));
  const code = buy.some((i) => i.code === p.get('item')) ? p.get('item') : (sugg ? sugg.it.code : buy[0].code);
  const it = S.items.get(code);
  const st = D.itemStats.get(code);
  const sups = S.base.suppliers.filter((s) => s.type !== 'เกษตรกร' && active(s));
  const supId = sups.some((s) => s.supplier_id === p.get('sup')) ? p.get('sup') : it.supplier_id;
  const q = Number(p.get('qty')) || st.suggestQty || it.batch_or_pack || 0;
  const f = poForecast(code, supId);
  const tag = (s) => (s.supplier_id === it.supplier_id ? ' (ผู้ขายประจำ)' : s.supplier_id === it.backup_supplier_id ? ' (ผู้ขายสำรอง)' : '') + (s.approved === 'Y' ? '' : ' ยังไม่ผ่านคัดเลือก');
  const amount = q * (it.cost || 0);
  return `<section class="panel" aria-labelledby="pf-h"><div class="panel-h"><h2 id="pf-h">เขียนใบขอซื้อ กรอกครั้งเดียว</h2><span class="meta">เลขที่ถัดไป <span class="mono">${esc(nextPrNo())}</span></span></div>
    ${roleNote('requested', 'เขียนใบขอซื้อ')}
    <form data-form="pr" class="form-grid">
      ${itemPicker({ name: 'item', items: buy, value: code, act: 'prItem', label: 'รายการ', id: 'pr' })}
      <label class="f">ผู้ขาย (จากทะเบียน FM-46)<select class="in" name="supplier" data-act="prSup">${sups.map((s) => `<option value="${s.supplier_id}" ${s.supplier_id === supId ? 'selected' : ''}>${esc(s.name)}${esc(tag(s))}</option>`).join('')}</select></label>
      <label class="f">จำนวน (${esc(it.unit)})<input class="in" name="qty" type="number" min="1" step="${isIntUnit(it.unit) ? '1' : 'any'}" required value="${q}"></label>
      <label class="f">ราคาต่อหน่วย (บาท) ราคาที่เคยซื้อ<input class="in" name="unit_cost" type="number" min="0" step="any" required value="${it.cost ?? ''}"></label>
      <label class="f wide">เหตุผลความจำเป็น<input class="in" name="purpose" maxlength="300" value="ใช้ผลิตยาสมุนไพรตามแผน ${esc(it.name)} ถึงจำนวนอย่างต่ำ" required></label>
      <label class="f wide">ถ้าราคา 0 บาท ใส่เหตุผล (เช่น ได้รับบริจาค)<input class="in" name="zero_reason" maxlength="200"></label>
      <div class="form-note">ผู้ขายรายนี้ส่งเฉลี่ย <span class="num">${num(f.sl.L)} ±${num(f.sl.sL)}</span> วัน (${f.sl.n} ครั้ง${f.sl.quoted ? ' ใช้ค่าที่ผู้ขายแจ้ง' : ''}) ถ้าได้รับอนุมัติภายใน 2 วัน คาดว่าของถึง ${esc(thaiDate(addDays(f.expected, 2)))}
        ${f.stockoutDate ? `ของในคลังหมด ${esc(thaiDate(f.stockoutDate))} โอกาสมาทัน <span class="num">${num(f.prob * 100)}%</span> ${chip(f.verdict.text, f.verdict.level)}` : ''}
        ยอดเงินประมาณ <span class="num">${baht(amount)}</span> บาท ${amount > PROC.specificMax ? chip('เกินวงเงินวิธีเฉพาะเจาะจง', 'crit') : chip(amount > PROC.formSplit ? 'แบบฟอร์มวงเงินเกิน 100,000 บาท' : 'แบบฟอร์มวงเงินไม่เกิน 100,000 บาท', 'ink')}
        ระบบจะออกบันทึกขออนุมัติ รายงานขออนุมัติ ใบสั่งซื้อ ใบตรวจรับพัสดุ และบันทึกขออนุมัติเบิกจ่ายให้เองตามขั้น</div>
      <div class="form-actions"><button type="submit" class="btn btn-solid" ${can('requested') ? '' : 'disabled'}>ส่งขออนุมัติ</button><a class="btn" href="#/store?tab=buy">ยกเลิก</a></div>
    </form></section>`;
}

// ปุ่มของขั้นถัดไป ตามบทบาทผู้ใช้ตอนนี้
function nextAction(r, st) {
  if (st.key === 'done' || st.key === 'rejected') return '';
  const allowed = can(st.key);
  if (st.key === 'received') return `<a class="btn btn-sm${allowed ? ' btn-solid' : ''}" href="#/store?tab=receive&item=${r.item_code}&po=${encodeURIComponent(r.po_no)}">รับของ FM-01</a>`;
  const label = { head_ok: 'เห็นชอบ', dir_ok: 'อนุมัติ', ordered: 'ออกใบสั่งซื้อ', inspected: 'ตรวจรับพัสดุ', pay_requested: 'ขออนุมัติเบิกจ่าย', paid: 'บันทึกจ่ายเงินแล้ว', requested: 'ส่งขออนุมัติ' }[st.key];
  const reject = ['head_ok', 'dir_ok'].includes(st.key) && allowed ? `<button type="button" class="btn btn-sm btn-crit" data-act="prReject" data-pr="${esc(r.pr_no)}">ไม่อนุมัติ</button>` : '';
  return allowed ? `<button type="button" class="btn btn-sm btn-solid" data-act="prStep" data-pr="${esc(r.pr_no)}" data-step="${st.key}">${esc(label)}</button>${reject}` : `<span class="sub-l">รอ ${esc(STEP[st.key].who)}${st.key === 'inspected' ? ' (ทำในห้องฝ่ายผลิต แท็บตรวจรับพัสดุ)' : ''}</span>`;
}

export function viewBuy(p) {
  const stepF = p.get('step') || '';
  const target = p.get('pr') || '';
  const poT = p.get('po') || '';
  const all = S.prs.map((r) => ({ r, st: prStage(r) }));
  const open = all.filter((x) => x.st.key !== 'done' && x.st.key !== 'rejected');
  const shown = open.filter((x) => !stepF || x.st.key === stepF).sort((a, b) => a.st.idx - b.st.idx || a.r.requested.localeCompare(b.r.requested));
  const counts = Object.fromEntries(PROC_STEPS.map((s) => [s.key, open.filter((x) => x.st.key === s.key).length]));
  const done = all.filter((x) => x.st.key === 'done').sort((a, b) => b.r.paid.localeCompare(a.r.paid)).slice(0, 8);
  const rejected = all.filter((x) => x.st.key === 'rejected');
  const pipe = `<ol class="pipe" aria-label="ขั้นตอนจัดซื้อและจำนวนใบที่รออยู่">${PROC_STEPS.map((s, i) => `<li><a href="#/store?tab=buy${stepF === s.key ? '' : `&step=${s.key}`}" ${stepF === s.key ? 'aria-current="true"' : ''}><span class="pipe-i">${i + 1}</span><span class="pipe-t">รอ${esc(s.title)}</span><span class="num">${counts[s.key]}</span><span class="pipe-w">${esc(s.who.replace('เจ้าหน้าที่ฝ่ายจัดซื้อและคลัง', 'จนท.คลัง'))}</span></a></li>`).join('')}</ol>`;
  const row = ({ r, st }) => {
    const it = S.items.get(r.item_code);
    const waited = daysBetween(st.since, S.today);
    const late = waited > CONFIG.procWaitDays && ['head_ok', 'dir_ok', 'ordered', 'inspected', 'pay_requested'].includes(st.key);
    return `<tr${target === r.pr_no || (poT && r.po_no === poT) ? ' class="is-target" data-target' : ''}><td class="code">${esc(r.pr_no)}${r.po_no ? `<span class="sub-l">${esc(r.po_no)}</span>` : ''}</td><td class="t-name">${itemLink(it)}<span class="sub-l">${esc(short(supName(r.supplier_id)))}</span></td><td class="r">${qh(r.item_code, r.qty)}</td><td class="r"><span class="num">${baht(r.amount)}</span></td>
      <td>${chip(`รอ${st.title}`, late ? 'warn' : 'ink')}<span class="sub-l">${waited} วันในขั้นนี้</span></td><td><div class="doc-links">${docLinks(r)}</div></td><td><div class="inline-form">${nextAction(r, st)}</div></td></tr>`;
  };
  const poOpen = [...D.itemStats.values()].flatMap((s) => s.poViews.map((v) => ({ s, v }))).sort((a, b) => a.v.prob - b.v.prob);
  return `${p.get('new') ? prForm(p) : ''}
  <section class="panel" aria-labelledby="pp-h"><div class="panel-h"><h2 id="pp-h">ใบขอซื้อ อยู่ขั้นไหน รอใคร</h2><span class="meta">${open.length} ใบที่ยังไม่จบ กดขั้นตอนเพื่อกรอง</span></div>
    ${pipe}
    ${tableWrap(`<table class="stack-t"><thead><tr><th>เลขที่</th><th>รายการ</th><th class="r">จำนวน</th><th class="r">ยอดเงิน (บาท)</th><th>สถานะ</th><th>เอกสารที่ออกแล้ว</th><th>ขั้นถัดไป</th></tr></thead><tbody>${shown.map(row).join('') || '<tr><td colspan="7" class="empty">ไม่มีใบขอซื้อในขั้นนี้</td></tr>'}</tbody></table>`, 'ใบขอซื้อที่ยังไม่จบ')}
    <p class="note">ผู้ขอซื้อ ผู้เห็นชอบ ผู้อนุมัติ และผู้ตรวจรับพัสดุ เป็นคนละคน (ผู้ตรวจรับพัสดุตามคำสั่งแต่งตั้ง สมมุติให้เป็นหัวหน้าฝ่ายผลิต) วงเงินวิธีเฉพาะเจาะจงไม่เกิน ${num(PROC.specificMax)} บาท ตามกฎกระทรวงกำหนดวงเงินฯ พ.ศ. 2560</p></section>
  <div class="work">
    <section class="panel" aria-labelledby="po-h"><div class="panel-h"><h2 id="po-h">ใบสั่งซื้อค้างรับ จะมาทันไหม</h2><span class="meta">${poOpen.length} ใบ คำนวณจากประวัติส่งของจริงของผู้ขาย</span></div>
    ${tableWrap(`<table class="stack-t"><thead><tr><th>เลขที่</th><th>รายการ</th><th class="r">จำนวน</th><th>คาดถึง</th><th>ของหมด</th><th class="r">โอกาสทัน</th><th>ผล</th></tr></thead><tbody>
    ${poOpen.map(({ s, v }) => `<tr${poT === v.po.po_no ? ' class="is-target" data-target' : ''}><td class="code">${esc(v.po.po_no)}</td><td class="t-name">${itemLink(s.it)}<span class="sub-l">${esc(short(v.sl.supplier.name))} ส่งเฉลี่ย ${num(v.sl.L)} ±${num(v.sl.sL)} วัน</span></td><td class="r">${qh(s.it.code, v.po.qty)}</td><td class="nowrap">${esc(thaiDate(v.expected))}</td><td class="nowrap">${s.stockoutDate ? esc(thaiDate(s.stockoutDate)) : '-'}</td><td class="r"><span class="num"><b>${num(v.prob * 100)}%</b></span></td><td>${chip(v.verdict.text, v.verdict.level)}</td></tr>`).join('')}</tbody></table>`, 'ใบสั่งซื้อค้างรับ')}</section>
    <section class="panel" aria-labelledby="dn-h"><div class="panel-h"><h2 id="dn-h">จบแล้วล่าสุด</h2><span class="meta">จ่ายเงินแล้ว ${all.filter((x) => x.st.key === 'done').length} ใบ ไม่อนุมัติ ${rejected.length} ใบ</span></div>
    <ul class="mini">${done.map(({ r }) => `<li><span class="t"><span class="mono">${esc(r.pr_no)}</span> ${itemLink(r.item_code)}<span class="d">จ่ายเงิน ${esc(thaiDate(r.paid))} ${baht(r.amount)} บาท</span></span><span class="doc-links">${docLinks(r)}</span></li>`).join('') || '<li class="empty">ยังไม่มี</li>'}
    ${rejected.map(({ r }) => `<li><span class="t"><span class="mono">${esc(r.pr_no)}</span> ${itemLink(r.item_code)}<span class="d">ไม่อนุมัติ ${esc(thaiDate(r.rejected))} ${esc(r.reject_reason || '')}</span></span>${chip('ไม่อนุมัติ', 'crit')}</li>`).join('')}</ul>
    <ul class="note"><li>สต็อกกันชน = Z × √(L̄·σd² + d̄²·σL²) (Gallego, Columbia 2004 ข้อ 1.3.1 และ King, APICS magazine 2011)</li><li>จำนวนอย่างต่ำ = d̄ × L̄ + สต็อกกันชน และจำนวนอย่างสูง = d̄ × (R + L̄) + Z × σ(R+L) (MIT OCW ESD.260J 2006 บทที่ 11 และ 12)</li><li>โอกาสมาทัน = Φ((วันที่ของหมด − วันที่สั่ง − L̄) ÷ σL) ทัน เมื่อถึงระดับบริการเป้าหมาย เสี่ยง เมื่อ 50% ขึ้นไป (ค่าตั้งต้น รอหัวหน้ากลุ่มงานกำหนด)</li></ul></section>
  </div>`;
}

// ใบขอซื้อที่รอตรวจรับพัสดุ แสดงในห้องฝ่ายผลิต เพราะผู้ตรวจรับพัสดุ (สมมุติให้เป็นหัวหน้าฝ่ายผลิต) เข้าห้องคลังไม่ได้ (QA-001)
export const inspectQueue = () => S.prs.map((r) => ({ r, st: prStage(r) })).filter((x) => x.st.key === 'inspected').sort((a, b) => a.st.since.localeCompare(b.st.since));
export function viewInspect() {
  const xs = inspectQueue();
  const allowed = can('inspected');
  return `<section class="panel" aria-labelledby="ins-h"><div class="panel-h"><h2 id="ins-h">ใบขอซื้อรอตรวจรับพัสดุ</h2><span class="meta">${xs.length ? `${xs.length} ใบ ของมาถึงแล้ว คลังบันทึกรับ FM-01 แล้ว` : 'ไม่มีใบค้างตรวจรับ'}</span></div>
    ${allowed ? '' : `<p class="form-note">ผู้ใช้ตอนนี้ ${esc(short(currentUser().name))} ${esc(currentUser().role)} ดูได้อย่างเดียว ตรวจรับพัสดุได้เฉพาะ${esc(CAN.inspected.join(' หรือ '))} (ผู้ตรวจรับตามคำสั่งแต่งตั้ง)</p>`}
    ${xs.length ? tableWrap(`<table class="stack-t"><thead><tr><th>เลขที่</th><th>รายการ</th><th class="r">จำนวน</th><th class="r">ยอดเงิน (บาท)</th><th>รับของเมื่อ</th><th>เอกสาร</th><th>ตรวจรับ</th></tr></thead><tbody>
    ${xs.map(({ r, st }) => { const waited = daysBetween(st.since, S.today); return `<tr><td class="code">${esc(r.pr_no)}<span class="sub-l">${esc(r.po_no)}</span></td><td class="t-name">${itemLink(r.item_code)}<span class="sub-l">${esc(short(supName(r.supplier_id)))}</span></td><td class="r" data-l="จำนวน">${qh(r.item_code, r.qty)}</td><td class="r" data-l="ยอดเงิน"><span class="num">${baht(r.amount)}</span></td>
      <td class="nowrap" data-l="รับของเมื่อ">${esc(thaiDate(r.received))}<span class="sub-l">รอมา ${waited} วัน</span></td><td data-l="เอกสาร"><div class="doc-links">${docLinks(r)}</div></td>
      <td data-l="ตรวจรับ"><button type="button" class="btn btn-sm${allowed ? ' btn-solid' : ''}" data-act="prStep" data-pr="${esc(r.pr_no)}" data-step="inspected" ${allowed ? '' : 'disabled'}>ตรวจรับพัสดุ</button></td></tr>`; }).join('')}</tbody></table>`, 'ใบขอซื้อรอตรวจรับพัสดุ') : '<p class="empty">ไม่มีใบขอซื้อรอตรวจรับพัสดุ</p>'}
    <p class="note">ตรวจของจริงเทียบใบสั่งซื้อและบันทึกรับ FM-01 ก่อนกด ผู้ตรวจรับต้องไม่ใช่ผู้ขอซื้อหรือผู้รับของ หลังตรวจรับ ฝ่ายจัดซื้อและคลังขออนุมัติเบิกจ่ายต่อได้</p></section>`;
}

function stepAction(b) {
  const pr = S.prs.find((r) => r.pr_no === b.dataset.pr);
  const key = b.dataset.step;
  if (!pr) return;
  const st = prStage(pr);
  if (st.key !== key) return toast('ขั้นตอนเปลี่ยนไปแล้ว ลองใหม่', 'warn');
  if (!can(key)) return deny(key, STEP[key].title);
  const byKey = Object.keys(pr).filter((k) => k.endsWith('_by')).map((k) => pr[k]);
  if (['head_ok', 'dir_ok', 'inspected'].includes(key) && pr.requested_by === S.user) return toast('ผู้ขอซื้อกับผู้อนุมัติหรือผู้ตรวจรับต้องเป็นคนละคน', 'warn');
  if (key === 'inspected' && byKey.includes(S.user) && pr.received_by === S.user) return toast('ผู้รับของกับผู้ตรวจรับพัสดุต้องเป็นคนละคน', 'warn');
  const it = S.items.get(pr.item_code);
  const patch = { [key]: S.today, [`${key}_by`]: S.user };
  const fx = { prStep: [{ pr_no: pr.pr_no, patch }] };
  let slip = { k: STEP[key].doc ? `สำเนา${STEP[key].doc}` : STEP[key].title, no: pr.pr_no, title: `${it.name} ${qty(pr.item_code, pr.qty)} ${baht(pr.amount)} บาท`, lines: [`${STEP[key].title} โดย ${short(currentUser().name)} ${thaiDate(S.today)}`], stamp: [key === 'paid' ? 'จ่ายเงินแล้ว' : key === 'dir_ok' ? 'อนุมัติ' : key === 'head_ok' ? 'เห็นชอบ' : 'บันทึกแล้ว', key === 'paid' || key === 'dir_ok' || key === 'head_ok' ? 'ok' : 'ink'] };
  if (key === 'ordered') {
    const poNo = nextPoNo();
    const sup = S.base.suppliers.find((s) => s.supplier_id === pr.supplier_id);
    patch.po_no = poNo;
    fx.newPo = [{ po_no: poNo, supplier_id: pr.supplier_id, item_code: pr.item_code, qty: pr.qty, order_date: S.today, quoted_date: addDays(S.today, sup.quoted_lead_days), received_date: '', lot_no: '' }];
    const fc = poForecast(pr.item_code, pr.supplier_id);
    slip = { ...slip, k: 'สำเนาใบสั่งซื้อ', no: poNo, lines: [`${sup.name} คาดถึง ${thaiDate(fc.expected)}`, fc.stockoutDate ? `ของในคลังหมด ${thaiDate(fc.stockoutDate)} โอกาสมาทัน ${Math.round(fc.prob * 100)}%` : ''], stamp: [fc.verdict.text, fc.verdict.level] };
  }
  const docs = DOCS[key];
  if (docs) slip.links = docs.map(([t, type]) => [`พิมพ์${t}`, `#/doc?type=${type}&id=${encodeURIComponent(pr.pr_no)}`]);
  const ev = commit({ type: 'prStep', summary: `${STEP[key].title} ${pr.pr_no} ${it.name}${patch.po_no ? ` ออกใบสั่งซื้อ ${patch.po_no}` : ''}`, effects: fx });
  slip.links = [...(slip.links || []), ['ยกเลิกขั้นนี้ถ้ากดผิด', `#/log?del=${ev.id}`]];
  showSlip((location.hash.match(/^#\/([^?]*)/) || [])[1] || 'store', slip);
  nav.route();
}
function rejectAction(b) {
  const pr = S.prs.find((r) => r.pr_no === b.dataset.pr);
  if (!pr) return;
  const st = prStage(pr);
  if (!can(st.key)) return deny(st.key, 'ไม่อนุมัติ');
  const it = S.items.get(pr.item_code);
  openDialog({
    title: `ไม่อนุมัติ ${pr.pr_no}`, ok: 'ยืนยันไม่อนุมัติ', tone: 'crit',
    body: `<p><strong>${esc(it.name)}</strong> ${esc(qty(pr.item_code, pr.qty))} ${esc(baht(pr.amount))} บาท</p><label class="f">เหตุผลที่ไม่อนุมัติ (ต้องกรอก)<input class="in" name="reason" maxlength="300" required autofocus></label>`,
    onOk: (fd) => actions.guard(() => {
      const reason = String(fd.get('reason') || '').trim();
      if (!reason) return 'ไม่อนุมัติต้องมีเหตุผล';
      commit({ type: 'prStep', reason, summary: `ไม่อนุมัติ ${pr.pr_no} ${it.name}`, effects: { prStep: [{ pr_no: pr.pr_no, patch: { rejected: S.today, rejected_by: S.user, reject_reason: reason } }] } });
      toast('บันทึกไม่อนุมัติแล้ว พร้อมเหตุผล');
      nav.route();
      return true;
    }),
  });
}

export const buyHandlers = {
  click: { prStep: stepAction, prReject: rejectAction },
  submit: {
    pr: (form) => { const f = new FormData(form); actions.submitNew('pr', { item: codeOf(f.get('item')), supplier: f.get('supplier'), qty: f.get('qty'), unit_cost: f.get('unit_cost'), purpose: String(f.get('purpose') || '').trim(), zero_reason: String(f.get('zero_reason') || '').trim() }); },
  },
  change: {
    prItem: (t) => {
      const code = codeOf(t.value);
      const it = S.items.get(code);
      const why = !it ? `ไม่พบรหัส ${code} เลือกจากรายการที่ขึ้นให้เลือก` : !active(it) ? `${it.code} ${it.name} เลิกใช้แล้ว` : it.make !== 'buy' ? `${it.code} ${it.name} ไม่ใช่ของที่ซื้อจากผู้ขาย เขียนใบขอซื้อไม่ได้` : '';
      t.setAttribute('aria-invalid', why ? 'true' : 'false');
      if (why) return toast(why, 'warn');
      setHash('store', { tab: 'buy', new: 1, item: code });
    },
    prSup: (t) => { const f = t.form; setHash('store', { tab: 'buy', new: 1, item: codeOf(f.item.value), sup: t.value, qty: f.qty.value }); },
  },
};
export { staff, CAN };
