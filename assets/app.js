// หน้าเว็บหลัก: ห้องทำงานแยกฝ่ายตามสิทธิ์ หัวข้อยึดเอกสารของโรงงาน (ระเบียบ V8.9, SOP, FM)
import { CONFIG, LANES, CAN, REQ_FORM, ROOMS, TOOLS, STAGE_OWNER, canEnter, homeRoom } from './config.js';
import {
  S, D, loadAll, commit, resetEvents, staff, currentUser, setUser, usable, isFG, isIntUnit, round, nextLotNo, nextJobId, nextInvNo,
  newMove, thaiDate, thaiFullDate, daysBetween, addDays, toCSV, roomAlerts, bomOf, bomNeeds, active, producing, eventById, blockers, withoutEvent, unreadNotes,
  onExternalChange, repairStore, eventsJSON, owedOf, paidOf, poLeft,
} from './data.js';
import { fefoPick } from './logic.js';
import {
  $, esc, num, qn, qty, qh, money, baht, mill, short, I, svg, chip, lotChip, stamp, tableWrap, supName, custName, who, deptLegend,
  toast, download, can, deny, roleNote, nav, setHash, slipState, showSlip, slipBlock, head, alertsBlock, seg, itemPicker, codeOf, monthLabel, actions, itemLink, jobLink, jobHref,
  openDialog, closeDialog, storeBanner, backBar,
} from './ui.js';
import { viewBuy, buyHandlers, buildPR, viewInspect, inspectQueue } from './buy.js';
import { viewPlan } from './plan.js';
import { viewRegisters, viewProduct, registerHandlers, onSimInput } from './registers.js';
import { viewDocs } from './docs.js';
import { viewNotes, notesHandlers, afterNotes } from './notes.js';
import { viewItem, viewJob } from './detail.js';

// ================= ภาพรวมโรงงาน =================
export function monthSales() {
  const months = [];
  const [y, m] = S.today.split('-').map(Number);
  for (let i = 11; i >= 0; i--) months.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  const sum = new Map(months.map((k) => [k, 0]));
  for (const v of S.invoices) { const k = v.date.slice(0, 7); if (sum.has(k) && v.date <= S.today) sum.set(k, sum.get(k) + v.total); }
  return months.map((k) => ({ month: k, total: sum.get(k) }));
}
function arAging() {
  const b = [0, 0, 0, 0];
  let overdue = 0, total = 0;
  for (const v of S.invoices) {
    if (v.paid_date || v.date > S.today) continue;
    const owed = owedOf(v);
    const age = daysBetween(v.date, S.today);
    b[age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3] += owed;
    total += owed;
    if (v.due_date < S.today) overdue += owed;
  }
  return { b, total, overdue };
}
function keyStockoutDays() {
  const [y, m] = S.today.split('-').map(Number);
  const fyStart = `${m >= 10 ? y : y - 1}-10-01`;
  const keys = new Set([...S.items.values()].filter((i) => i.key === 'Y' && i.lane === 'ผลิต').map((i) => i.code));
  return new Set(S.base.shortages.filter((s) => s.date >= fyStart && s.date <= S.today && keys.has(s.item_code)).map((s) => s.date)).size;
}
function salesBars(ms) {
  const W = 600, H = 190, top = 26, base = 158, bw = 30, step = W / ms.length;
  const max = Math.max(...ms.map((x) => x.total), 1);
  const last = ms[ms.length - 1];
  return `<figure class="bars"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="ยอดขายรายเดือน 12 เดือน ล่าสุด ${esc(monthLabel(last.month))} ${mill(last.total)} ล้านบาท">
    <line class="base" x1="0" x2="${W}" y1="${base}" y2="${base}"/>
    ${ms.map((x, i) => { const h = Math.max(2, Math.round(((base - top) * x.total) / max)); const cx = i * step + step / 2; const now = i === ms.length - 1; return `<rect class="${now ? 'bar-now' : 'bar-b'}" x="${cx - bw / 2}" y="${base - h}" width="${bw}" height="${h}" rx="3"><title>${esc(monthLabel(x.month))} ${mill(x.total)} ล้านบาท</title></rect>${i % 2 === ms.length % 2 || now ? `<text class="ax" x="${cx}" y="${base + 18}" text-anchor="middle">${esc(monthLabel(x.month))}</text>` : ''}${now ? `<text class="val" x="${cx}" y="${base - h - 8}" text-anchor="middle">${mill(x.total)}</text>` : ''}`; }).join('')}
  </svg><figcaption class="note">ล้านบาท แท่งสีม่วงคือเดือนนี้ (ถึงวันนี้) ชี้ที่แท่งเพื่อดูยอด</figcaption></figure>`;
}
function agingBar(ar) {
  const labels = ['0 ถึง 30 วัน', '31 ถึง 60 วัน', '61 ถึง 90 วัน', 'เกิน 90 วัน'];
  return `<div class="aging" role="img" aria-label="ลูกหนี้ตามอายุหนี้ ${labels.map((l, i) => `${l} ${mill(ar.b[i])} ล้านบาท`).join(' ')}">${ar.b.map((v, i) => `<span class="ag-${i}" style="flex:${Math.max(v, 1)} 1 0" title="${labels[i]} ${mill(v)} ล้านบาท"></span>`).join('')}</div>
    <div class="aging-legend">${labels.map((l, i) => `<span><i class="ag-${i}"></i>${l}<span class="num">${mill(ar.b[i])}</span></span>`).join('')}</div>`;
}
export function stripCells(cells) {
  return `<section class="strip" style="--cells:${cells.length}" aria-label="ตัวเลขสำคัญ">${cells.map((c) => `<div class="cell${c.lv ? ` is-${c.lv}` : ''}"><div class="cell-k">${esc(c.k)}</div><div class="cell-n"><span class="num">${esc(c.n)}</span><span>${esc(c.u)}</span></div><div class="cell-d">${c.d}</div></div>`).join('')}</section>`;
}

// ผังสายการผลิต วัตถุดิบถึงลูกค้า ตั๋วซ้อนหนาตามจำนวนงานหรือล็อต ช่วงที่ของขาดกะพริบแดง
function flowMap() {
  const n = (lane, sts) => D.board.filter((c) => c.job.lane === lane && sts.includes(c.stage)).length;
  const qcRaw = D.qcQueue.filter((q) => !isFG(q.it)).length;
  const qcFg = D.qcQueue.filter((q) => isFG(q.it)).length;
  const blocked = D.board.filter((c) => c.blocked && c.job.lane === 'ผลิต');
  const supply = D.alerts.find((a) => a.kind === 'supply' && a.level === 'crit' && a.item === '91004') || D.alerts.find((a) => a.kind === 'supply' && a.level === 'crit');
  const farms = S.base.suppliers.filter((s) => s.type === 'เกษตรกร').length;
  const vendors = S.base.suppliers.filter((s) => s.type !== 'เกษตรกร').length;
  const shipped = S.invoices.filter((v) => v.date <= S.today && daysBetween(v.date, S.today) < 7).length;
  const st = [
    { id: 'farm', name: 'เกษตรกร', n: farms, u: 'ราย', x: 10, y: 30 },
    { id: 'recv', name: 'ตรวจรับ', n: n('แปรรูป', ['ตรวจรับ']), u: 'งาน', x: 190, y: 30 },
    { id: 'wash', name: 'คัดแยก ล้าง', n: n('แปรรูป', ['คัดแยก ล้าง']), u: 'งาน', x: 370, y: 30 },
    { id: 'dry', name: 'ตาก อบ บดร่อน', n: n('แปรรูป', ['ตาก อบ', 'ลดขนาด บดร่อน']), u: 'งาน', x: 550, y: 30 },
    { id: 'qc1', name: 'รอปล่อยผ่าน วัตถุดิบ', n: qcRaw, u: 'ล็อต', x: 730, y: 30, lv: D.qcQueue.some((q) => !isFG(q.it) && q.waiting > CONFIG.qcWaitWarnDays) ? 'warn' : '' },
    { id: 'store', name: 'คลัง', n: S.lots.filter(usable).length, u: 'ล็อต', x: 730, y: 190, lv: D.expiries.length ? 'warn' : '', tag: D.expiries.length ? `ใกล้หมดอายุ ${D.expiries.length} ล็อต` : '' },
    { id: 'prod', name: 'ผลิต บรรจุ', n: n('ผลิต', ['จ่ายบันทึกการผลิต', 'เบิกวัตถุดิบ', 'ผลิต', 'บรรจุ']), u: 'งาน', x: 550, y: 190, lv: blocked.length ? 'crit' : '', tag: blocked.length ? `มีงานหยุด ${blocked.length} งาน` : '' },
    { id: 'qc2', name: 'รอปล่อยผ่าน ยาสำเร็จรูป', n: qcFg, u: 'ล็อต', x: 370, y: 190 },
    { id: 'ship', name: 'จ่ายออก 7 วัน', n: shipped, u: 'ใบ', x: 190, y: 190 },
    { id: 'cust', name: 'ลูกค้า', n: S.base.customers.length, u: 'ราย', x: 10, y: 190, lv: D.overdue.length ? 'warn' : '', tag: D.overdue.length ? `ค้างเกินกำหนด ${D.overdue.length} ราย` : '' },
  ];
  const W = 140, H = 84;
  const layers = (k) => (k <= 0 ? 0 : k < 5 ? 1 : k < 25 ? 2 : 3);
  const card = (s) => {
    const L = layers(s.n);
    const back = Array.from({ length: L }, (_, i) => L - i).map((k) => `<rect class="st-layer" x="${s.x + k * 4}" y="${s.y + k * 4}" width="${W}" height="${H}" rx="5"/>`).join('');
    const nTxt = s.n.toLocaleString('th-TH');
    return `<g>${back}<rect class="st-card${s.lv ? ` st-${s.lv}` : ''}" x="${s.x}" y="${s.y}" width="${W}" height="${H}" rx="5"/>
      <text class="st-name" x="${s.x + 12}" y="${s.y + 22}">${esc(s.name)}</text>
      <text class="st-n" x="${s.x + 12}" y="${s.y + 56}">${nTxt}</text><text class="st-u" x="${s.x + 12 + nTxt.length * 14 + 6}" y="${s.y + 56}">${esc(s.u)}</text>
      ${s.tag ? `<text class="${s.lv === 'crit' ? 'st-tag' : 'st-tag-w'}" x="${s.x + 12}" y="${s.y + 75}">${esc(s.tag)}</text>` : ''}</g>`;
  };
  const by = Object.fromEntries(st.map((s) => [s.id, s]));
  const hLeg = (a, b, crit = false) => {
    const A = by[a], B = by[b];
    const y = A.y + H / 2;
    const [x1, x2] = A.x < B.x ? [A.x + W + 4, B.x - 10] : [A.x - 4, B.x + W + 14];
    return `<path class="${crit ? 'leg-crit' : 'leg'}" d="M${x1} ${y}H${x2}" marker-end="url(#${crit ? 'mc' : 'mh'})"/>`;
  };
  const legs = [hLeg('farm', 'recv'), hLeg('recv', 'wash'), hLeg('wash', 'dry'), hLeg('dry', 'qc1'),
    `<path class="leg" d="M${730 + W / 2} ${30 + H + 6}V${190 - 12}" marker-end="url(#mh)"/>`,
    hLeg('store', 'prod', blocked.length > 0), hLeg('prod', 'qc2'), hLeg('qc2', 'ship'), hLeg('ship', 'cust')].join('');
  const tube = blocked.find((c) => c.blocked.startsWith('หลอด')) || blocked[0];
  const gate = tube ? `<g class="gate-stamp" transform="translate(452 146) rotate(-4)"><rect width="236" height="30" rx="4"/><text x="118" y="20" text-anchor="middle">หยุด รอ${esc(tube.blocked.length > 20 ? `${tube.blocked.slice(0, 19)}…` : tube.blocked)}</text></g>` : '';
  const feed = `<rect class="st-card${supply ? ' st-crit' : ''}" x="730" y="300" width="${W}" height="50" rx="5"/><text class="st-name" x="742" y="321">ผู้ขาย</text><text class="st-u" x="742" y="340">${vendors} ราย</text>
    <path class="${supply ? 'leg-crit' : 'feed'}" d="M800 298V${190 + H + 10}" marker-end="url(#${supply ? 'mc' : 'mh'})"/>
    ${supply ? `<text class="st-tag" x="720" y="318" text-anchor="end">${esc(supply.stub.ref)} คาดถึง ${esc(supply.fields[3][1])}</text><text class="st-tag" x="720" y="336" text-anchor="end">หลังวันที่ของหมด ${esc(supply.fields[2][1])}</text>` : ''}`;
  const list = st.map((s) => `<li class="${s.lv === 'crit' ? 'is-crit' : ''}"><span><span class="t">${esc(s.name)}</span>${s.tag ? `<span class="d">${esc(s.tag)}</span>` : ''}</span><span><span class="num">${s.n.toLocaleString('th-TH')}</span> ${esc(s.u)}</span></li>`).join('');
  return `<div class="map"><svg viewBox="0 0 880 360" role="img" aria-label="ผังสายการผลิต จากเกษตรกรถึงลูกค้า ${tube ? `งานผลิตหยุดรอ${esc(tube.blocked)}` : 'ไม่มีงานหยุด'}">
    <defs><marker id="mh" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path class="leg-head" d="M0 0L8 4L0 8Z"/></marker>
    <marker id="mc" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path class="leg-crit-head" d="M0 0L8 4L0 8Z"/></marker></defs>
    ${legs}${st.map(card).join('')}${gate}${feed}</svg>
    <ol class="map-list">${list}</ol></div>`;
}

function viewOverview(p) {
  const alerts = D.alerts;
  const active1 = S.jobs.filter((j) => ['waiting', 'running', 'qc'].includes(j.status));
  const qcLate = D.qcQueue.filter((q) => q.waiting > CONFIG.qcWaitWarnDays).length;
  const inv = [...D.itemStats.values()].filter((s) => s.level !== 'ok' && active(s.it));
  const invCrit = inv.filter((s) => s.level === 'crit').length;
  const ms = monthSales();
  const last = ms[ms.length - 1], prev = ms[ms.length - 2];
  const ar = arAging();
  const ksd = keyStockoutDays();
  const fg = [...S.items.values()].filter(isFG);
  const roomRows = ROOMS.filter((r) => r.id !== 'overview').map((r) => {
    const a = roomAlerts(r.id);
    const c = a.filter((x) => x.level === 'crit').length, w = a.filter((x) => x.level === 'warn').length;
    return `<tr><td><a href="#/${r.id}">${esc(r.title)}</a></td><td class="r"><span class="num"${c ? ' style="color:var(--crit)"' : ''}>${c}</span></td><td class="r"><span class="num">${w}</span></td><td>${a[0] ? esc(a[0].title) : '<span class="muted">ไม่มี</span>'}</td></tr>`;
  }).join('');
  return head('ภาพรวมโรงงาน', alerts) + alertsBlock(alerts, 'ไม่มีเรื่องต้องตามวันนี้') + `
  <div class="work">
    <section class="panel" aria-labelledby="map-h"><div class="panel-h"><h2 id="map-h">สายการผลิต วัตถุดิบถึงลูกค้า</h2><span class="meta">งานในสาย ${num(active1.length)} งาน (แปรรูป ${active1.filter((j) => j.lane === 'แปรรูป').length} ผลิต ${active1.filter((j) => j.lane === 'ผลิต').length}) รอปล่อยผ่าน ${num(D.qcQueue.length)} ล็อต${qcLate ? ` เกิน ${CONFIG.qcWaitWarnDays} วัน ${qcLate} ล็อต` : ''}</span></div>${flowMap()}<p class="panel-foot">ตั๋วซ้อนหนา = งานหรือล็อตมาก ข้อมูล ณ ${esc(thaiDate(S.today))}</p></section>
    <section class="panel" aria-labelledby="rs-h"><div class="panel-h"><h2 id="rs-h">แจ้งเตือนแยกตามฝ่าย</h2><span class="meta">ของถึงจุดสั่งซื้อ ${num(inv.length)} รายการ${invCrit ? ` วิกฤต ${invCrit}` : ''}</span></div>
      ${tableWrap(`<table class="roomsum"><thead><tr><th>ห้องทำงาน</th><th class="r">วิกฤต</th><th class="r">เฝ้าระวัง</th><th>เรื่องแรก</th></tr></thead><tbody>${roomRows}</tbody></table>`, 'แจ้งเตือนแยกตามฝ่าย')}
      <p class="panel-foot">ผลิตภัณฑ์ที่ผลิตอยู่ ${num(fg.filter(producing).length)} จาก ${fg.length} รายการ <a href="#/registers?tab=products">ดูทะเบียนผลิตภัณฑ์</a> กดชื่อฝ่ายเพื่อเข้าห้อง</p>
    </section>
  </div>
  ${laneBoard('แปรรูป', p, false)}${laneBoard('ผลิต', p, false)}
  <div class="work" style="margin-top:16px">
    <section class="panel" aria-labelledby="sl-h"><div class="panel-h"><h2 id="sl-h">ยอดขายรายเดือน</h2><span class="meta">${esc(monthLabel(last.month))} ถึงวันนี้ ${mill(last.total)} ล้านบาท${prev.total ? ` เดือนก่อน ${mill(prev.total)} ล้าน` : ''}</span></div>${salesBars(ms)}<p class="panel-foot">สินค้าหลักขาด ${ksd} วันในปีงบนี้ <a href="#/sales?tab=sales">ดูรายผลิตภัณฑ์</a></p></section>
    <section class="panel" aria-labelledby="ar-h"><div class="panel-h"><h2 id="ar-h">ลูกหนี้ตามอายุหนี้</h2><span class="meta">รวม ${mill(ar.total)} ล้านบาท เกินกำหนด ${mill(ar.overdue)} ล้าน</span></div>${agingBar(ar)}<a class="more-link" href="#/sales?tab=ar">ดูรายลูกค้า</a></section>
  </div>`;
}

// ================= บอร์ดงาน =================
function kcard(c, canMove, target) {
  const L = LANES[c.job.lane];
  const idx = L.stages.indexOf(c.stage);
  const late = c.stage === 'รอปล่อยผ่าน' && c.days > CONFIG.qcWaitWarnDays;
  return `<article class="kcard${c.blocked ? ' is-blocked' : ''}${target === c.job.job_id ? ' is-target' : ''}" data-job="${esc(c.job.job_id)}" ${canMove ? 'draggable="true"' : ''}>
    <div class="k-top"><span class="mono">${esc(c.job.job_id)}</span>${c.job.out_lot ? `<span class="mono">${esc(c.job.out_lot)}</span>` : ''}</div>
    <h3 class="k-t"><a class="k-link" href="${jobHref(c.job.job_id)}" draggable="false">${esc(c.it.name)}</a></h3>
    <div class="k-q"><span>จำนวน</span><span>${qh(c.it.code, c.job.qty)}</span></div>
    ${c.blocked ? `<div class="k-block">หยุด รอ${esc(c.blocked)}</div>` : ''}
    <div class="k-act">${who(c.owner)}<span class="days${late ? ' warn' : ''}">${c.days} วัน</span></div>
    ${canMove ? `<div class="k-move"><button type="button" class="btn-ico" data-act="move" data-job="${esc(c.job.job_id)}" data-dir="-1" ${idx <= 0 ? 'disabled' : ''} aria-label="ย้อน ${esc(c.job.job_id)} ไปขั้นก่อนหน้า">${I.left}</button><button type="button" class="btn-ico" data-act="move" data-job="${esc(c.job.job_id)}" data-dir="1" ${idx >= L.stages.length - 1 ? 'disabled' : ''} aria-label="ย้าย ${esc(c.job.job_id)} ไปขั้นถัดไป">${I.right}</button></div>` : ''}
  </article>`;
}
function laneBoard(laneKey, p, allowMove = true) {
  const L = LANES[laneKey];
  const q = (p.get('q') || '').trim().toLowerCase();
  const only = p.get('only') || '';
  const target = p.get('job');
  const all = D.board.filter((c) => c.job.lane === laneKey);
  const stuck = (c) => c.blocked || (c.stage === 'รอปล่อยผ่าน' && c.days > CONFIG.qcWaitWarnDays);
  const cards = all.filter((c) => (!q || c.it.name.toLowerCase().includes(q) || c.job.job_id.toLowerCase().includes(q) || (c.job.out_lot || '').includes(q)) && (only !== 'stuck' || stuck(c)));
  const canMove = allowMove && can(`move${laneKey}`);
  const hint = canMove ? 'ย้ายการ์ดทีละขั้นด้วยปุ่มลูกศรหรือลากวาง' : `ย้ายได้เฉพาะ${CAN[`move${laneKey}`].join(' หรือ ')}`;
  const here = (location.hash.match(/^#\/([^?]*)/) || [])[1] || (laneKey === 'ผลิต' ? 'prod' : 'process');
  const base = new URLSearchParams(location.hash.split('?')[1] || '');
  const link = (o) => { const x = new URLSearchParams(base); for (const [k, v] of Object.entries(o)) { if (v) x.set(k, v); else x.delete(k); } x.delete('job'); return `#/${here}?${x}`; };
  return `<section class="panel lane" aria-labelledby="lane-${laneKey}"><div class="panel-h"><h2 id="lane-${laneKey}">บอร์ดงาน${esc(L.title)} งานอยู่ขั้นไหน ในมือใคร</h2><span class="meta">${cards.length} จาก ${all.length} งาน ${esc(hint)}</span></div>
    <div class="filters">
      <a class="fchip" href="${link({ only: '' })}" ${only ? '' : 'aria-current="true"'}>ทุกงาน <span class="num">${all.length}</span></a>
      <a class="fchip" href="${link({ only: 'stuck' })}" ${only === 'stuck' ? 'aria-current="true"' : ''}>ติดขัดหรือรอนาน <span class="num">${all.filter(stuck).length}</span></a>
      <form class="search" data-form="boardSearch" data-here="${esc(here)}" role="search"><label class="sr" for="bq-${laneKey}">ค้นงานบนบอร์ด${esc(L.title)}</label><input class="in" id="bq-${laneKey}" name="q" value="${esc(p.get('q') || '')}" placeholder="ค้นชื่อยา เลขงาน เลขที่ผลิต"><button class="btn btn-sm" type="submit">${I.search}ค้น</button></form>
      ${deptLegend()}</div>
    <div class="kanban">${L.stages.map((st) => {
      const cs = cards.filter((c) => c.stage === st);
      return `<section class="kcol${cs.length ? '' : ' is-empty'}" data-drop="${esc(st)}" data-lane="${esc(laneKey)}" aria-label="${esc(st)} ${cs.length} งาน"><div class="kcol-h"><strong>${esc(st)}</strong><span class="num">${cs.length}</span></div><div class="kcol-s">${esc(L.sop[st])}</div><div class="kcol-b">${cs.map((c) => kcard(c, canMove, target)).join('') || '<div class="k-empty">ไม่มีงาน</div>'}</div></section>`;
    }).join('')}</div></section>`;
}


// ย้ายการ์ดทีละขั้น ขั้นที่ออกเลขที่ผลิต (เข้ารอปล่อยผ่าน) ต้องกรอกจำนวนที่ได้จริงก่อน (QA-006 WHO GMP ข้อ 16.20)
function moveCheck(jobId, dir) {
  const card = D.board.find((c) => c.job.job_id === jobId);
  if (!card) return { error: 'ไม่พบงานนี้บนบอร์ด' };
  const lane = LANES[card.job.lane];
  const idx = lane.stages.indexOf(card.stage);
  const to = lane.stages[idx + dir];
  if (!to) return { error: 'ย้ายต่อไม่ได้แล้ว' };
  if (dir < 0 && (card.stage === 'รอปล่อยผ่าน' || card.stage === 'ตรวจสอบแล้ว')) return { error: 'งานที่ส่งตรวจแล้วย้อนกลับจากบอร์ดไม่ได้ ใช้ห้องฝ่ายควบคุมคุณภาพแทน' };
  if (to === 'ตรวจสอบแล้ว') return { error: 'ขั้นตรวจสอบแล้วเปลี่ยนได้จากห้องฝ่ายควบคุมคุณภาพเท่านั้น หลังบันทึกผลตรวจและหัวหน้าฝ่ายอนุมัติ (SOP-QC-06, SOP-QC-07)' };
  if (!can(`move${card.job.lane}`)) return { deny: `move${card.job.lane}`, what: `ย้ายการ์ด${lane.title}` };
  return { card, lane, to };
}
// เกณฑ์ร้อยละผลผลิต: ยาสำเร็จรูปใช้เกณฑ์สูญเสียผลิตและบรรจุของผลิตภัณฑ์ (FM-35) งานแปรรูปใช้ค่าตั้งต้นใน config
export function yieldRule(it) {
  const loss = isFG(it) ? Number(it.loss_pct ?? 5) + Number(it.pack_loss_pct ?? 1) : CONFIG.processLossPct;
  return { loss, min: 100 - loss, max: 100 + CONFIG.yieldOverPct };
}
function moveJob(jobId, dir) {
  const c = moveCheck(jobId, dir);
  if (c.deny) return deny(c.deny, c.what);
  if (c.error) return toast(c.error, 'warn');
  if (c.to === 'รอปล่อยผ่าน' && !c.card.job.out_lot) return askOutput(c);
  return doMove(jobId, dir, null);
}
function askOutput({ card }) {
  const job = card.job, it = card.it;
  const rule = yieldRule(it);
  const intU = isIntUnit(it.unit);
  const body = `<dl class="fields dlg-fields"><div><dt>งาน</dt><dd class="mono">${esc(job.job_id)}</dd></div><div><dt>รายการ</dt><dd><strong>${esc(it.name)}</strong></dd></div>
      <div><dt>สั่ง${job.lane === 'ผลิต' ? 'ผลิต' : 'แปรรูป'}</dt><dd>${qh(it.code, job.qty)}</dd></div><div><dt>เกณฑ์ผลผลิต</dt><dd>ไม่ต่ำกว่า ${num(rule.min)}%<span class="sub-l">${isFG(it) ? `สูญเสียผลิต ${num(it.loss_pct ?? 5)}% บรรจุ ${num(it.pack_loss_pct ?? 1)}% (FM-35)` : 'ค่าตั้งต้นงานแปรรูป รอเคาะเกณฑ์'}</span></dd></div></dl>
    <label class="f">จำนวนที่ได้จริง (${esc(it.unit)}) นับหรือชั่งจริง<input class="in" name="actual" type="number" min="0" step="${intU ? '1' : 'any'}" required autofocus placeholder="สั่ง${job.lane === 'ผลิต' ? 'ผลิต' : 'แปรรูป'} ${esc(qn(it.code, job.qty))}"></label>
    <p class="dlg-yield" data-out="yield" aria-live="polite">กรอกจำนวนที่ได้จริง ระบบคิดร้อยละผลผลิตให้</p>
    <label class="f" data-yield-note hidden>เหตุผลที่ผลผลิตเบี่ยงเบนจากเกณฑ์ (ต้องกรอก บันทึกเพื่อสอบสวน)<input class="in" name="note" maxlength="300" placeholder="เช่น ผงติดเครื่องบด ชั่งซ้ำแล้ว"></label>
    <p class="dlg-note">เมื่อยืนยัน ระบบออกเลขที่ผลิต <span class="mono">${esc(nextLotNo(it.code))}</span> ตามจำนวนที่ได้จริง ติดป้ายรอปล่อยผ่าน และส่งเข้าคิวฝ่ายควบคุมคุณภาพ</p>`;
  const read = (f) => { const v = Number(f.actual.value); return f.actual.value === '' || !Number.isFinite(v) ? null : v; };
  openDialog({
    title: `ส่งตรวจ ${job.job_id} กรอกจำนวนที่ได้จริง`, body, ok: 'ยืนยัน ออกเลขที่ผลิต',
    onInput: (f) => {
      const v = read(f), out = f.querySelector('[data-out="yield"]'), note = f.querySelector('[data-yield-note]');
      if (v === null) { out.textContent = 'กรอกจำนวนที่ได้จริง ระบบคิดร้อยละผลผลิตให้'; out.className = 'dlg-yield'; note.hidden = true; return; }
      const y = (v / job.qty) * 100;
      const off = y < rule.min || y > rule.max;
      out.textContent = `ร้อยละผลผลิต ${num(y, 1)}% ${off ? (y > rule.max ? 'เกินจำนวนที่สั่ง ตรวจการนับอีกครั้ง' : `ต่ำกว่าเกณฑ์ ${num(rule.min)}%`) : 'อยู่ในเกณฑ์'}`;
      out.className = `dlg-yield ${off ? 'is-off' : 'is-ok'}`;
      note.hidden = !off;
      f.note.required = off;
    },
    onOk: (fd, f) => guard(() => {
      const v = read(f);
      if (v === null) return 'กรอกจำนวนที่ได้จริงก่อน';
      if (!(v > 0)) return 'จำนวนที่ได้จริงต้องมากกว่า 0 ถ้าผลิตไม่ได้เลย ให้แจ้งหัวหน้ากลุ่มงานและบันทึกความเบี่ยงเบน';
      if (intU && !Number.isInteger(v)) return `${it.unit} นับเป็นชิ้น ใส่จำนวนเต็ม`;
      const y = (v / job.qty) * 100;
      const note = String(fd.get('note') || '').trim();
      if ((y < rule.min || y > rule.max) && !note) return 'ผลผลิตเบี่ยงเบนจากเกณฑ์ ต้องใส่เหตุผล';
      return doMove(job.job_id, 1, { actual: round(it.code, v), yieldPct: Math.round(y * 10) / 10, note });
    }),
  });
}
function doMove(jobId, dir, out) {
  const c = moveCheck(jobId, dir);
  if (c.deny) { deny(c.deny, c.what); return true; }
  if (c.error) { toast(c.error, 'warn'); return true; }
  const { card, lane, to } = c;
  const job = card.job;
  const fx = { stage: [{ job_id: jobId, stage: to }] };
  let summary = `ย้าย ${jobId} ${card.it.name} จาก "${card.stage}" ไป "${to}"`;
  if (job.status === 'waiting' && dir > 0) {
    const needs = bomNeeds(job.item_code, job.qty);
    const lack = needs.find((n) => !n.ok);
    if (lack) { toast(`วัตถุดิบไม่พอ: ${S.items.get(lack.code).name} มี ${qty(lack.code, lack.have)} ต้องใช้ ${qty(lack.code, lack.need)}`, 'crit'); return true; }
    fx.moves = []; fx.inputs = [];
    for (const n of needs) {
      const { picks } = fefoPick((S.lotsByItem.get(n.code) || []).filter(usable), n.need);
      for (const pk of picks) {
        const q = round(n.code, pk.qty);
        fx.moves.push(newMove({ item_code: n.code, lot_no: pk.lot_no, type: 'จ่าย', qty: q, party: `งาน${card.job.lane === 'ผลิต' ? 'ผลิต' : 'แปรรูป'} ${jobId}`, doc_no: REQ_FORM[S.items.get(n.code).kind] || 'FM-28' }));
        fx.inputs.push({ job_id: jobId, lot_no: pk.lot_no, item_code: n.code, qty: q });
      }
    }
    fx.jobs = [{ job_id: jobId, patch: { status: 'running', start_date: S.today, end_date: addDays(S.today, 3), wait_reason: '' } }];
    summary += ` เบิกวัตถุดิบตามสูตร ${needs.length} รายการ แบบหมดอายุก่อนจ่ายก่อน`;
  }
  let lotNo = '';
  if (to === 'รอปล่อยผ่าน' && !job.out_lot) {
    if (!out) return askOutput(c);
    const it = S.items.get(job.item_code);
    lotNo = nextLotNo(job.item_code);
    fx.lots = [{ lot_no: lotNo, item_code: job.item_code, qty_in: out.actual, date_in: S.today, exp_date: it.shelf_days ? addDays(S.today, it.shelf_days) : '', status: 'รอปล่อยผ่าน', release_date: '', source: 'ผลิต', source_ref: jobId }];
    fx.moves = [...(fx.moves || []), newMove({ item_code: job.item_code, lot_no: lotNo, type: 'รับ', qty: out.actual, party: lane.title, doc_no: `บันทึกการผลิต ${jobId}` })];
    fx.jobs = [{ job_id: jobId, patch: { status: 'qc', out_lot: lotNo, end_date: S.today, actual_qty: out.actual, yield_pct: out.yieldPct, yield_note: out.note } }];
    summary += ` ได้จริง ${qty(job.item_code, out.actual)} ผลผลิต ${num(out.yieldPct, 1)}%${out.note ? ` (${out.note})` : ''} ออกเลขที่ผลิต ${lotNo} ติดป้ายรอปล่อยผ่าน`;
  }
  commit({ type: 'stage', summary, effects: fx });
  const room = card.job.lane === 'ผลิต' ? 'prod' : 'process';
  if (lotNo) showSlip(room, { k: 'สำเนาเลขที่ผลิต SOP-PD-07', no: lotNo, title: `${card.it.name} ${qty(card.it.code, out.actual)}`, lines: [`ได้จริง ${qty(card.it.code, out.actual)} จากที่สั่ง ${qty(card.it.code, job.qty)} ผลผลิต ${num(out.yieldPct, 1)}%${out.note ? ` เหตุผล ${out.note}` : ''}`, `งาน ${jobId} ส่งเข้าคิวฝ่ายควบคุมคุณภาพแล้ว ของยังเบิกไม่ได้จนกว่าจะปล่อยผ่าน`], stamp: ['รอปล่อยผ่าน', 'crit'] });
  else if (fx.inputs) showSlip(room, { k: 'สำเนาใบเบิกวัตถุดิบ', no: jobId, title: `เบิกวัตถุดิบตามสูตร ${card.it.name}`, lines: [`${fx.inputs.length} ล็อต เรียงหมดอายุก่อนจ่ายก่อน`], stamp: ['จ่ายแล้ว', 'ink'], links: [['พิมพ์ใบเบิก FM-28 ถึง FM-33', `#/doc?type=req&job=${encodeURIComponent(jobId)}`]] });
  else toast(summary);
  nav.route();
  return true;
}

// ================= ฝ่ายแปรรูปสมุนไพร และ ฝ่ายผลิต =================
function viewLaneRoom(p, room) {
  const lane = room.lane;
  const L = LANES[lane];
  const alerts = roomAlerts(room.id);
  const tab = p.get('tab') || 'board';
  const word = lane === 'ผลิต' ? 'ผลิต' : 'แปรรูป';
  const nIns = lane === 'ผลิต' ? inspectQueue().length : 0;
  const tabs = lane === 'ผลิต' ? [['board', 'บอร์ดงาน'], ['new', 'เปิดงานผลิต'], ['materials', 'วัตถุดิบพอไหม'], ['inspect', `ตรวจรับพัสดุ${nIns ? ` (${nIns})` : ''}`], ['plan', 'พยากรณ์และแผน']] : [['board', 'บอร์ดงาน'], ['new', 'เปิดงานแปรรูป'], ['farm', 'รับจากเกษตรกร'], ['plan', 'พยากรณ์และแผน']];
  const acts = `<a class="btn btn-solid" href="#/${room.id}?tab=new">เปิดงาน${word}</a>`;
  let body;
  if (tab === 'new') body = jobForm(room, p);
  else if (tab === 'materials') body = materialsCheck();
  else if (tab === 'farm') body = farmReceipts();
  else if (tab === 'inspect' && lane === 'ผลิต') body = viewInspect();
  else if (tab === 'plan') body = viewPlan(p, lane, room.id);
  else body = laneBoard(lane, p);
  return head(`ห้องทำงาน${L.title}`, alerts, acts) + slipBlock(room.id) + alertsBlock(alerts, '', { fold: tab === 'new' || tab === 'inspect' }) + seg(room.id, tabs, tab) + body;
}

function jobForm(room, p) {
  const lane = room.lane;
  const key = `open${lane}`;
  const items = [...S.items.values()].filter((i) => i.make === 'make' && i.lane === lane && producing(i));
  const sug = items.find((i) => D.itemStats.get(i.code)?.suggestQty > 0);
  const code = items.some((i) => i.code === p.get('item')) ? p.get('item') : (sug || items[0]).code;
  const it = S.items.get(code);
  const st = D.itemStats.get(code);
  const q = Number(p.get('qty')) || st.suggestQty || it.batch_or_pack || 0;
  const needs = bomNeeds(code, q);
  const first = LANES[lane].stages[0];
  return `<section class="panel" aria-labelledby="jf-h"><div class="panel-h"><h2 id="jf-h">เปิดงาน${lane === 'ผลิต' ? 'ผลิต' : 'แปรรูป'}</h2><span class="meta">เลขงานถัดไป <span class="mono">${esc(nextJobId())}</span> เลือกได้ ${items.length} รายการที่ผลิตอยู่</span></div>
    ${roleNote(key, 'เปิดงาน')}${askedNote(p, code, 'job')}
    <form data-form="job" data-room="${room.id}" class="form-grid">
      ${itemPicker({ name: 'item', items, value: code, act: 'jobItem', label: `รายการที่จะ${lane === 'ผลิต' ? 'ผลิต' : 'แปรรูป'}`, id: room.id })}
      <label class="f">จำนวน (${esc(it.unit)}) รุ่นละ ${esc(qty(code, it.batch_or_pack || 0))}<input class="in" name="qty" type="number" ${qtyAttrs(it)} required value="${q}" data-act="jobQty"></label>
      <div class="form-note">พอใช้อีก ${Number.isFinite(st.cover) ? `${num(Math.floor(st.cover))} วัน` : 'ไม่มีการเบิก'} จำนวนอย่างต่ำ ${esc(qty(code, st.pol.rop))} แนะนำ ${st.suggestQty ? esc(qty(code, st.suggestQty)) : 'ยังไม่ถึงจุดที่ต้องเพิ่ม'} งานจะเริ่มที่ขั้น "${esc(first)}" <a href="#/product?code=${code}">ดูสูตรและต้นทุน</a>
        ${tableWrap(`<table style="margin-top:8px"><thead><tr><th>วัตถุดิบตามสูตร</th><th class="r">ต้องใช้</th><th class="r">ตรวจสอบแล้วในคลัง</th><th>พอไหม</th></tr></thead><tbody>${needs.map((n) => `<tr><td>${itemLink(n.code)}</td><td class="r">${qh(n.code, n.need)}</td><td class="r">${qh(n.code, n.have)}</td><td>${n.ok ? chip('พอ', 'ok') : chip('ไม่พอ', 'crit')}</td></tr>`).join('')}</tbody></table>`, 'วัตถุดิบตามสูตร')}
      </div>
      <div class="form-actions"><button type="submit" class="btn btn-solid" ${can(key) ? '' : 'disabled'}>เปิดงาน</button></div>
    </form></section>`;
}

function materialsCheck() {
  const jobs = S.jobs.filter((j) => j.lane === 'ผลิต' && j.status === 'waiting');
  const rows = jobs.flatMap((j) => { const ns = bomNeeds(j.item_code, j.qty); return ns.map((n, i) => `<tr${n.ok ? '' : ' class="is-target"'}>${i === 0 ? `<td rowspan="${ns.length}">${jobLink(j.job_id)}<span class="sub-l">${itemLink(j.item_code)} ${esc(qty(j.item_code, j.qty))}</span></td>` : ''}<td>${itemLink(n.code)}</td><td class="r">${qh(n.code, n.need)}</td><td class="r">${qh(n.code, n.have)}</td><td>${n.ok ? chip('พอ', 'ok') : chip('ไม่พอ', 'crit')}</td></tr>`); });
  return `<section class="panel" aria-labelledby="mc-h"><div class="panel-h"><h2 id="mc-h">วัตถุดิบสำหรับงานที่รอเบิก</h2><span class="meta">${jobs.length} งาน เทียบสูตรกับของที่ตรวจสอบแล้วในคลัง</span></div>
    ${rows.length ? tableWrap(`<table><thead><tr><th>งาน</th><th>วัตถุดิบ</th><th class="r">ต้องใช้</th><th class="r">ตรวจสอบแล้ว</th><th>พอไหม</th></tr></thead><tbody>${rows.join('')}</tbody></table>`, 'วัตถุดิบสำหรับงานที่รอเบิก') : '<p class="empty">ไม่มีงานรอเบิก งานที่เปิดใหม่จะขึ้นที่นี่</p>'}</section>`;
}

function farmReceipts() {
  const from = addDays(S.today, -60);
  const lots = S.lots.filter((l) => S.items.get(l.item_code)?.kind === 'สด' && l.date_in > from && l.date_in <= S.today).sort((a, b) => b.date_in.localeCompare(a.date_in));
  const farms = new Map();
  for (const l of lots) { const k = l.source_ref; const x = farms.get(k) || { n: 0, kg: 0 }; x.n += 1; x.kg += l.qty_in; farms.set(k, x); }
  return `<div class="work"><section class="panel" aria-labelledby="fr-h"><div class="panel-h"><h2 id="fr-h">วัตถุดิบสดที่รับเข้า 60 วันล่าสุด</h2><span class="meta">ใบรับซื้อวัตถุดิบสมุนไพร FM-23 กดเลขที่เพื่อพิมพ์</span></div>
    ${tableWrap(`<table><thead><tr><th>วันที่รับ</th><th>เลขที่รับ</th><th>สมุนไพร</th><th>เกษตรกร</th><th class="r">จำนวน</th><th>ป้าย</th></tr></thead><tbody>${lots.slice(0, 60).map((l) => `<tr><td class="nowrap">${esc(thaiDate(l.date_in))}</td><td class="code"><a href="#/doc?type=fm23&lot=${l.lot_no}">${esc(l.lot_no)}</a></td><td>${itemLink(l.item_code)}</td><td>${esc(supName(l.source_ref))}</td><td class="r">${qh(l.item_code, l.qty_in)}</td><td>${lotChip(l.status)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">ไม่มีรายการ</td></tr>'}</tbody></table>`, 'วัตถุดิบสดที่รับเข้า')}</section>
    <section class="panel" aria-labelledby="fm-h"><div class="panel-h"><h2 id="fm-h">ส่งของมาจากใคร</h2><span class="meta">60 วันล่าสุด</span></div>
    ${tableWrap(`<table><thead><tr><th>เกษตรกร</th><th class="r">ครั้ง</th><th class="r">รวม</th></tr></thead><tbody>${[...farms].sort((a, b) => b[1].kg - a[1].kg).map(([k, x]) => `<tr><td>${esc(supName(k))}</td><td class="r"><span class="num">${x.n}</span></td><td class="r"><span class="num">${num(x.kg)}</span><span class="u">กก.</span></td></tr>`).join('')}</tbody></table>`, 'เกษตรกรที่ส่งของ')}</section></div>`;
}

// ================= ฝ่ายจัดซื้อและคลัง =================
function itemStatus(s) {
  const ex = D.expiries.find((e) => e.it.code === s.it.code);
  if (!active(s.it)) return { lv: 'exp', t: 'เลิกใช้' };
  if (isFG(s.it) && !producing(s.it)) return { lv: 'exp', t: s.it.status };
  if (s.level === 'crit') return { lv: 'crit', t: s.poViews.some((v) => v.verdict.level === 'crit') ? 'ของจะขาด' : 'วิกฤต' };
  if (ex) return { lv: ex.level, t: ex.daysLeft <= 0 ? 'มีล็อตหมดอายุ' : 'ใกล้หมดอายุ' };
  if (s.level === 'warn') return { lv: 'warn', t: 'ถึงจุดสั่งซื้อ' };
  return { lv: 'ok', t: 'ปกติ' };
}

function viewStore(p) {
  const alerts = roomAlerts('store');
  const tab = p.get('tab') || 'stock';
  const acts = `<a class="btn" href="#/store?tab=issue">เบิกออก</a><a class="btn" href="#/store?tab=buy&new=1">เขียนใบขอซื้อ</a><a class="btn btn-solid" href="#/store?tab=receive">รับเข้า FM-01</a>`;
  const tabs = [['stock', 'คงคลัง'], ['card', 'บัตรคุม FM-02'], ['receive', 'รับเข้า FM-01'], ['issue', 'เบิกออก'], ['buy', 'จัดซื้อ'], ['plan', 'พยากรณ์และแผน']];
  let body;
  if (tab === 'card') body = stockCard(p);
  else if (tab === 'receive') body = receiveForm(p);
  else if (tab === 'issue') body = issueForm(p);
  else if (tab === 'buy') body = viewBuy(p);
  else if (tab === 'plan') body = viewPlan(p, 'store', 'store');
  else body = storeStock(p);
  // แท็บที่เป็นฟอร์ม: พับการ์ดเตือนไว้ ให้ฟอร์มขึ้นก่อน (QA-026 มือถือต้องเลื่อนผ่านการ์ดเตือนก่อนถึงฟอร์ม)
  const formTab = tab === 'receive' || tab === 'issue' || (tab === 'buy' && !!p.get('new'));
  return head('ห้องทำงานฝ่ายจัดซื้อและคลัง', alerts, acts) + slipBlock('store') + alertsBlock(alerts, '', { fold: formTab }) + seg('store', tabs, tab) + body;
}

function poStubs(limit = 5) {
  const open = [...D.itemStats.values()].flatMap((s) => s.poViews.map((v) => ({ s, v }))).sort((a, b) => a.v.prob - b.v.prob);
  return `<section class="side-list" aria-labelledby="ps-h"><div class="side-h"><h2 id="ps-h">ใบสั่งซื้อค้างรับ</h2><span class="meta">เรียงจากโอกาสมาทันน้อยสุด</span></div>
    <ul class="pstubs">${open.slice(0, limit).map(({ s, v }) => `<li class="pstub"><a href="#/store?tab=buy&po=${encodeURIComponent(v.po.po_no)}"><span class="ps-b"><span class="ps-t"><span class="mono">${esc(v.po.po_no)}</span> ${esc(s.it.name)}</span><span class="ps-s">${esc(short(v.sl.supplier.name))} คาดถึง ${esc(thaiDate(v.expected))}</span></span><span class="ps-p lv-${v.verdict.level}">${num(v.prob * 100)}%<small>${esc(v.verdict.text)}</small></span></a></li>`).join('') || '<li class="empty">ไม่มีใบสั่งซื้อค้าง</li>'}</ul>
    ${open.length > limit ? `<a class="more-link" href="#/store?tab=buy">ดูทั้ง ${open.length} ใบ</a>` : ''}</section>`;
}
function expiringList(limit = 5) {
  const xs = D.expiries.slice(0, limit);
  return `<section class="side-list" aria-labelledby="ex-h"><div class="side-h"><h2 id="ex-h">ล็อตใกล้หมดอายุ</h2><span class="meta">ภายใน ${CONFIG.expiryWarnDays} วัน ${D.expiries.length} ล็อต</span></div>
    ${xs.length ? `<ul class="mini">${xs.map((e) => `<li><span class="t">${itemLink(e.it)}<span class="d"><span class="mono">${esc(e.lot.lot_no)}</span> คงเหลือ ${esc(qty(e.it.code, e.lot.qty_left))}</span></span>${chip(e.daysLeft <= 0 ? 'หมดอายุแล้ว' : `${e.daysLeft} วัน`, e.level)}</li>`).join('')}</ul>` : '<p class="empty">ไม่มีล็อตใกล้หมดอายุ</p>'}</section>`;
}

const KINDS = ['ยารับประทาน', 'ยาใช้ภายนอก', 'แห้ง', 'ผง', 'บรรจุภัณฑ์', 'เคมีภัณฑ์', 'ฉลาก'];
function storeStock(p) {
  const kind = p.get('kind') || '', lv = p.get('lv') || '', qRaw = (p.get('q') || '').trim(), q = qRaw.toLowerCase();
  const showAll = p.get('all') === '1';
  const all = [...D.itemStats.values()].filter((s) => active(s.it)).map((s) => ({ s, stt: itemStatus(s) }));
  const inKind = all.filter(({ s }) => !kind || s.it.kind === kind);
  const order = { crit: 0, warn: 1, ok: 2, exp: 3 };
  const rows = inKind.filter(({ s, stt }) => (!lv || stt.lv === lv) && (!q || s.it.name.toLowerCase().includes(q) || s.it.code.includes(q)))
    .sort((a, b) => order[a.stt.lv] - order[b.stt.lv] || a.s.it.code.localeCompare(b.s.it.code));
  const LIMIT = 60;
  const shown = showAll ? rows : rows.slice(0, LIMIT);
  const link = (o) => { const x = new URLSearchParams({ tab: 'stock', kind, lv, q: qRaw, ...o }); for (const [k, v] of [...x]) if (!v) x.delete(k); return `#/store?${x}`; };
  const kindChips = [['', 'ทั้งหมด', all.length], ...KINDS.map((k) => [k, k, all.filter(({ s }) => s.it.kind === k).length])]
    .map(([k, t, n]) => `<a class="fchip" href="${link({ kind: k })}" ${k === kind ? 'aria-current="true"' : ''}>${esc(t)} <span class="num">${n}</span></a>`).join('');
  const lvChips = [['crit', 'วิกฤต'], ['warn', 'เฝ้าระวัง']].map(([k, t]) => `<a class="fchip" href="${link({ lv: lv === k ? '' : k })}" ${lv === k ? 'aria-current="true"' : ''}>${t} <span class="num">${inKind.filter((x) => x.stt.lv === k).length}</span></a>`).join('');
  return `<div class="work"><section class="panel" aria-labelledby="st-h"><div class="panel-h"><h2 id="st-h">คงคลังของฝ่าย</h2><span class="meta">${rows.length} รายการ คิดใหม่ทุกวันจากรายการเบิก ${CONFIG.demandWindowDays} วันล่าสุด</span></div>
    <div class="filters" aria-label="กรองตามประเภท">${kindChips}</div>
    <div class="filters" aria-label="กรองตามสถานะและค้นหา">${lvChips}
      <form class="search" data-form="filter" role="search"><label class="sr" for="q">ค้นหารายการหรือรหัส</label><input class="in" id="q" name="q" value="${esc(qRaw)}" placeholder="ค้นชื่อหรือรหัส"><input type="hidden" name="kind" value="${esc(kind)}"><input type="hidden" name="lv" value="${esc(lv)}"><button class="btn btn-sm" type="submit">${I.search}ค้น</button></form>
      <button type="button" class="btn btn-sm" data-act="export">${I.download}ส่งออก CSV</button></div>
    ${tableWrap(`<table><thead><tr><th>รหัส</th><th>รายการ</th><th class="r">ตรวจสอบแล้ว</th><th class="r">ใช้ต่อวัน</th><th class="r">พอใช้</th><th class="r">จำนวนอย่างต่ำ</th><th class="r">ค้างรับ ค้างผลิต</th><th>สถานะ</th></tr></thead><tbody>
    ${shown.map(({ s, stt }) => `<tr><td class="code">${s.it.code}</td><td>${itemLink(s.it)}${s.quarantine ? `<span class="sub-l">รอปล่อยผ่าน ${esc(qty(s.it.code, s.quarantine))}</span>` : ''}</td>
      <td class="r">${qh(s.it.code, s.released)}${s.reserved ? `<span class="sub-l">จองให้งาน ${esc(qty(s.it.code, s.reserved))}</span>` : ''}</td><td class="r"><span class="num">${num(s.u.mean, 1)}</span></td><td class="r">${Number.isFinite(s.cover) ? `<span class="num">${num(Math.floor(s.cover))}</span><span class="u">วัน</span>` : '<span class="muted">-</span>'}</td>
      <td class="r"><span class="num">${num(s.pol.rop)}</span></td><td class="r">${s.onOrder ? `<span class="num">${num(s.onOrder)}</span>` : '<span class="muted">-</span>'}</td><td>${chip(stt.t, stt.lv)}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">ไม่พบรายการตามที่กรอง ลองล้างตัวกรอง</td></tr>'}
    </tbody></table>`, 'คงคลังของฝ่าย')}
    ${rows.length > shown.length ? `<a class="more-link" href="${link({ all: '1' })}">แสดงทั้งหมด ${rows.length} รายการ</a>` : ''}
    <p class="note">จำนวนอย่างต่ำ = จุดสั่งซื้อ (ใช้วันละ × ระยะส่งเฉลี่ย + สต็อกกันชน) ตรงกับช่องในบัตรคุม FM-02 สูตรและที่มาอยู่ในแท็บจัดซื้อ</p></section>
    <div class="stack">${poStubs()}${expiringList()}</div></div>`;
}

function stockCard(p) {
  const code = S.items.get(p.get('item')) && D.itemStats.get(p.get('item')) ? p.get('item') : '91004';
  const it = S.items.get(code);
  const st = D.itemStats.get(code);
  const ms = (S.movesByItem.get(code) || []).slice().sort((a, b) => a.date.localeCompare(b.date) || a.move_id.localeCompare(b.move_id));
  let bal = 0;
  const lines = ms.map((m) => { const inQ = ['รับ', 'ยกมา'].includes(m.type) ? m.qty : 0; const outQ = inQ ? 0 : m.qty; bal += inQ - outQ; return { m, inQ, outQ, bal, exp: S.lotMap.get(m.lot_no)?.exp_date }; }).slice(-60).reverse();
  const where = isFG(it) ? 'คลังยาสำเร็จรูป' : it.kind === 'บรรจุภัณฑ์' || it.kind === 'ฉลาก' ? 'คลังบรรจุภัณฑ์' : 'คลังวัตถุดิบ';
  const items = [...D.itemStats.values()].map((s) => s.it);
  return `<section class="panel" aria-labelledby="fm2-h"><div class="panel-h"><h2 id="fm2-h">บัตรคุมวัสดุ FM-02 บันทึกการรับ-จ่าย บัญชีควบคุมวัสดุ</h2>
    <a class="btn btn-sm" href="#/doc?type=fm02&item=${code}">${I.print}พิมพ์ FM-02</a></div>
    <form class="form-grid" data-form="pick" data-to="store" data-tab="card" style="margin-bottom:12px">${itemPicker({ name: 'item', items, value: code, act: 'pickItem', label: 'รายการ', id: 'card' })}</form>
    <dl class="fields" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:14px">
      <div><dt>ประเภท</dt><dd>${esc(it.kind)}</dd></div><div><dt>ชื่อหรือชนิดวัสดุ</dt><dd>${itemLink(it)}</dd></div><div><dt>รหัส</dt><dd class="num">${code}</dd></div><div><dt>หน่วยที่นับ</dt><dd>${esc(it.unit)}</dd></div>
      <div><dt>จำนวนอย่างสูง</dt><dd class="num">${num(st.pol.S)}</dd></div><div><dt>จำนวนอย่างต่ำ</dt><dd class="num">${num(st.pol.rop)}</dd></div><div><dt>ที่เก็บ</dt><dd>${where}</dd></div><div><dt>คงเหลือรวม</dt><dd>${esc(qty(code, st.released + st.quarantine + st.rejected))}</dd></div></dl>
    ${tableWrap(`<table><thead><tr><th>วัน เดือน ปี</th><th>รับจาก จ่ายให้</th><th>เลขที่เอกสาร</th><th>Lot No.</th><th>Exp.</th><th class="r">รับ</th><th class="r">จ่าย</th><th class="r">คงเหลือ</th><th>ผู้บันทึก</th></tr></thead><tbody>
    ${lines.map((x) => `<tr${x.m.move_id.startsWith('W') ? ' class="row-new"' : ''}><td class="nowrap">${esc(thaiDate(x.m.date))}${x.m.move_id.startsWith('W') ? ` ${chip('ใหม่', 'ink')}` : ''}</td><td>${esc(x.m.party)}</td><td>${esc(x.m.doc_no)}</td><td class="code">${esc(x.m.lot_no)}</td><td class="nowrap">${x.exp ? esc(thaiDate(x.exp)) : '-'}</td>
    <td class="r">${x.inQ ? `<span class="num">${qn(code, x.inQ)}</span>` : ''}</td><td class="r">${x.outQ ? `<span class="num">${qn(code, x.outQ)}</span>${x.m.type !== 'จ่าย' ? `<span class="u">${esc(x.m.type)}</span>` : ''}` : ''}</td><td class="r"><span class="num"><b>${qn(code, x.bal)}</b></span></td><td>${esc(short(staff(x.m.user_id).name))}</td></tr>`).join('')}
    </tbody></table>`, 'บัตรคุมวัสดุ FM-02')}
    <p class="note">แสดง 60 รายการล่าสุด ใหม่สุดอยู่บน คงเหลือรวมทุกสถานะ (รวมของรอปล่อยผ่าน)</p></section>`;
}

// ช่องวันหมดอายุ: แสดงวันที่แบบไทย (ปี พ.ศ.) ข้างช่องทันทีที่เลือก ให้ผู้กรอกเทียบกับฉลากก่อนบันทึก (QA-003)
function expField(value = '') {
  return `<label class="f">วันหมดอายุตามฉลากผู้ขาย (ปฏิทินใช้ปี ค.ศ.)<input class="in" name="exp" type="date" value="${esc(value)}" data-exp aria-describedby="exp-th"><span class="exp-th" id="exp-th" data-out="exp" aria-live="polite">${expText(value)}</span></label>`;
}
function expText(v) {
  if (!v) return 'ไม่ใส่ = ใช้อายุตามทะเบียนรายการ';
  const bad = expProblem(v);
  return bad ? `<span class="tx-crit">${esc(bad)}</span>` : `ตรงกับ ${esc(thaiFullDate(v))}`;
}
// รหัสที่พิมพ์ในช่องเลือกรายการแต่ใช้ในฟอร์มนี้ไม่ได้: บอกเหตุผล ไม่สลับไปรายการอื่นเงียบๆ (QA-014)
export function whyNotHere(form, code) {
  const it = S.items.get(code);
  if (!it) return `ไม่พบรหัส ${code} เลือกจากรายการที่ขึ้นให้เลือก`;
  const name = `${it.code} ${it.name}`;
  if (!active(it)) return `${name} เลิกใช้แล้ว`;
  if (form === 'receive') return it.make === 'make' ? `${name} เป็นของที่โรงงานผลิตหรือแปรรูปเอง รับเข้าจากภายนอกไม่ได้ ของที่ผลิตเองเข้าคลังผ่านบอร์ดงาน` : `${name} รับเข้าในฟอร์มนี้ไม่ได้`;
  if (form === 'job') {
    if (it.make !== 'make') return `${name} เป็นของที่ซื้อหรือรับจากเกษตรกร เปิดงานผลิตไม่ได้`;
    if (!producing(it)) return `${name} สถานะ${it.status} เปิดงานไม่ได้ (เปลี่ยนสถานะที่หน้าข้อมูลผลิตภัณฑ์)`;
    return `${name} เป็นงานของ${it.lane === 'ผลิต' ? 'ฝ่ายผลิต' : 'ฝ่ายแปรรูปสมุนไพร'} เปิดในห้องของฝ่ายนั้น`;
  }
  if (form === 'issue') return `${name} ยังไม่มีของที่ตรวจสอบแล้วให้เบิก`;
  if (form === 'pr') return `${name} ไม่ใช่ของที่ซื้อจากผู้ขาย เขียนใบขอซื้อไม่ได้`;
  return `${name} ใช้ในช่องนี้ไม่ได้`;
}
const askedNote = (p, code, form) => { const a = p.get('item'); return a && a !== code ? `<p class="form-note tx-warn">${esc(whyNotHere(form, a))} จึงแสดง ${esc(code)} แทน</p>` : ''; };
function receiveForm(p) {
  const buyables = [...S.items.values()].filter((i) => (i.make === 'buy' || i.make === 'farm') && active(i));
  const code = buyables.some((i) => i.code === p.get('item')) ? p.get('item') : '91004';
  const it = S.items.get(code);
  const openPOs = S.pos.filter((x) => x.item_code === code && !x.received_date && x.lot_no !== 'ก่อนเริ่มระบบ');
  // รับได้เฉพาะผู้ขายที่ผ่านการคัดเลือกและยังใช้อยู่ในทะเบียน FM-46 (QA-007)
  const sups = (it.make === 'farm' ? S.base.suppliers.filter((s) => s.type === 'เกษตรกร') : S.base.suppliers.filter((s) => s.type !== 'เกษตรกร')).filter((s) => active(s) && s.approved === 'Y');
  const blockedSup = S.base.suppliers.find((s) => s.supplier_id === it.supplier_id && (s.approved !== 'Y' || !active(s)));
  const poSel = p.get('po') && openPOs.some((x) => x.po_no === p.get('po')) ? p.get('po') : (openPOs[0]?.po_no || '');
  const po = openPOs.find((x) => x.po_no === poSel);
  return `<section class="panel" aria-labelledby="rv-h"><div class="panel-h"><h2 id="rv-h">รับเข้า FM-01 บันทึกการตรวจรับ</h2><span class="meta">เลขรับถัดไป <span class="mono">${esc(nextLotNo(code))}</span></span></div>
    ${roleNote('receive', 'บันทึกรับเข้า')}${askedNote(p, code, 'receive')}
    ${blockedSup ? `<p class="form-note tx-warn">ผู้ขายประจำ ${esc(blockedSup.name)} ยังไม่ผ่านการคัดเลือกหรือเลิกใช้ในทะเบียน FM-46 จึงไม่อยู่ในรายการ</p>` : ''}
    <form data-form="receive" class="form-grid">
      ${itemPicker({ name: 'item', items: buyables, value: code, act: 'recvItem', label: 'รายการ', id: 'recv' })}
      <label class="f">อ้างใบสั่งซื้อ<select class="in" name="po"><option value="">ไม่อ้าง</option>${openPOs.map((x) => `<option value="${x.po_no}" ${x.po_no === poSel ? 'selected' : ''}>${x.po_no} สั่ง ${esc(thaiDate(x.order_date))} ${esc(qty(code, x.qty))}${x.received_qty ? ` ค้างรับ ${esc(qty(code, poLeft(x)))}` : ''}</option>`).join('')}</select></label>
      <label class="f">${it.make === 'farm' ? 'เกษตรกร (FM-23)' : 'ผู้ขาย'}<select class="in" name="supplier">${sups.map((s) => `<option value="${s.supplier_id}" ${s.supplier_id === (po ? po.supplier_id : it.supplier_id) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <label class="f">จำนวนที่นับได้จริง (${esc(it.unit)})<input class="in" name="qty" type="number" ${qtyAttrs(it)} required placeholder="${po ? `ค้างรับตามใบสั่งซื้อ ${esc(qn(code, poLeft(po)))}` : 'นับหรือชั่งจริงแล้วกรอก'}"></label>
      ${expField()}
      ${openPOs.length ? '<label class="f f-check"><input type="checkbox" name="close" value="1"> ปิดใบสั่งซื้อแม้รับไม่ครบ (ผู้ขายแจ้งว่าจะไม่ส่งส่วนที่เหลือ)</label>' : ''}
      <div class="form-note">นับของจริงแล้วกรอก ไม่ต้องเท่าใบสั่งซื้อ ถ้าผู้ขายส่งไม่ครบ ใบสั่งซื้อจะค้างยอดที่เหลือไว้รอรับครั้งต่อไป เมื่อบันทึก ระบบออกเลข${it.make === 'farm' ? 'ที่รับตาม SOP-PD-07' : 'รับ'} <span class="mono">${esc(nextLotNo(code))}</span> ติดป้าย ${lotChip('รอปล่อยผ่าน')} ส่งเข้าคิวฝ่ายควบคุมคุณภาพ และเมื่อรับครบตามใบสั่งซื้อที่มาจากใบขอซื้อ ใบขอซื้อจะเลื่อนไปขั้นตรวจรับพัสดุ ของจะเบิกได้หลังหัวหน้าฝ่ายควบคุมคุณภาพปล่อยผ่าน (ระเบียบ V8.9 ข้อ 77)</div>
      <div class="form-actions"><button type="submit" class="btn btn-solid" ${can('receive') ? '' : 'disabled'}>บันทึกรับเข้า</button></div>
    </form></section>`;
}

function issueForm(p) {
  const items = [...D.itemStats.values()].filter((s) => s.released > 0).map((s) => s.it);
  const code = items.some((i) => i.code === p.get('item')) ? p.get('item') : items[0]?.code;
  const it = S.items.get(code);
  const lots = (S.lotsByItem.get(code) || []).filter(usable).sort((a, b) => (a.exp_date || '9999').localeCompare(b.exp_date || '9999') || a.date_in.localeCompare(b.date_in));
  const doc = REQ_FORM[it.kind];
  return `<section class="panel" aria-labelledby="is-h"><div class="panel-h"><h2 id="is-h">เบิกออก ${esc(doc)} ${isFG(it) ? 'ใบเบิกยาสำเร็จรูป' : 'ใบเบิก'}</h2><span class="meta">เบิกได้เฉพาะของที่ตรวจสอบแล้ว เรียงหมดอายุก่อนจ่ายก่อน</span></div>
    ${roleNote('issue', 'บันทึกเบิก')}
    ${askedNote(p, code, 'issue')}
    <form data-form="issue" class="form-grid">
      ${itemPicker({ name: 'item', items, value: code, act: 'issueItem', label: 'รายการ', id: 'issue' })}
      <label class="f">จำนวน (${esc(it.unit)})<input class="in" name="qty" type="number" ${qtyAttrs(it)} required></label>
      ${isFG(it) ? `<label class="f wide">จ่ายให้ลูกค้า (เลือกจากทะเบียนลูกค้า ระบบออกใบส่งของให้)<select class="in" name="to" required><option value="">เลือกลูกค้า</option>${S.base.customers.filter(active).map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('')}</select></label>`
        : `<label class="f wide">จ่ายให้<input class="in" name="to" required list="toList" maxlength="120" placeholder="เช่น งานผลิต J70-350"></label>
      <datalist id="toList">${S.jobs.filter((j) => j.status !== 'done').slice(-80).map((j) => `<option value="งานผลิต ${j.job_id}">`).join('')}</datalist>`}
      <div class="form-note"><strong>ล็อตที่ระบบจะเบิก เรียงวันหมดอายุก่อน (FEFO)</strong><div class="fefo">${lots.map((l) => `<div><span class="mono">${esc(l.lot_no)}</span><span>หมดอายุ ${l.exp_date ? esc(thaiDate(l.exp_date)) : '-'}</span><span>${qh(code, l.qty_left)}</span></div>`).join('') || 'ไม่มีล็อตที่ตรวจสอบแล้ว'}</div></div>
      <div class="form-actions"><button type="submit" class="btn btn-solid" ${can('issue') ? '' : 'disabled'}>บันทึกเบิก</button></div>
    </form></section>`;
}

// ================= ฝ่ายควบคุมคุณภาพ =================
function viewQC(p) {
  const alerts = roomAlerts('qc');
  const tab = p.get('tab') || 'queue';
  const tabs = [['queue', 'คิวรอปล่อยผ่าน'], ['released', 'บันทึกการปล่อยผ่าน FM-35'], ['rejected', 'ล็อตไม่ผ่าน']];
  let body;
  if (tab === 'released') body = qcReleased(p);
  else if (tab === 'rejected') body = qcRejected();
  else body = qcQueue(p);
  return head('ห้องทำงานฝ่ายควบคุมคุณภาพ', alerts) + slipBlock('qc') + alertsBlock(alerts) + seg('qc', tabs, tab) + body;
}
function qcQueue(p) {
  const target = p.get('lot');
  const isHead = can('release'), isChecker = can('qcRecord');
  const whoNote = isHead ? 'หัวหน้าฝ่ายควบคุมคุณภาพ อนุมัติปล่อยผ่านหรือไม่ผ่านได้ หลังเจ้าหน้าที่บันทึกผลตรวจ' : isChecker ? 'เจ้าหน้าที่ฝ่ายควบคุมคุณภาพ บันทึกผลตรวจได้ การอนุมัติเป็นของหัวหน้าฝ่าย' : 'ดูได้อย่างเดียว';
  const resultCell = (q) => {
    if (q.result) return `${chip(q.result.result, q.result.result === 'ผ่านเกณฑ์' ? 'ok' : 'crit')}<span class="sub-l">${esc(short(staff(q.result.checker_id).name))} ${esc(thaiDate(q.result.date))} ${esc(q.result.note || '')}</span>`;
    if (isChecker) return `<form data-form="qc" data-lot="${esc(q.lot.lot_no)}" class="inline-form"><label class="sr" for="qr-${esc(q.lot.lot_no)}">ผลตรวจ ${esc(q.lot.lot_no)}</label><select class="in in-sm" id="qr-${esc(q.lot.lot_no)}" name="result"><option>ผ่านเกณฑ์</option><option>ไม่ผ่านเกณฑ์</option></select><label class="sr" for="qn-${esc(q.lot.lot_no)}">หมายเหตุ ${esc(q.lot.lot_no)}</label><input class="in in-sm" id="qn-${esc(q.lot.lot_no)}" name="note" placeholder="หมายเหตุ เช่น ความชื้น 8%"><button type="submit" class="btn btn-sm">บันทึกผล</button></form>`;
    return '<span class="muted">รอเจ้าหน้าที่บันทึกผลตรวจ</span>';
  };
  const decideCell = (q) => {
    if (!isHead) return `<span class="muted">${q.result ? 'รอหัวหน้าฝ่ายอนุมัติ' : '-'}</span>`;
    const id = `rs-${q.lot.lot_no}`;
    const pass = q.result && q.result.result === 'ผ่านเกณฑ์';
    return `<div class="inline-form"><button type="button" class="btn btn-solid btn-sm" data-act="release" data-lot="${esc(q.lot.lot_no)}" data-res="ผ่าน" ${pass ? '' : 'disabled'}>ปล่อยผ่าน</button><button type="button" class="btn btn-crit btn-sm" data-act="release" data-lot="${esc(q.lot.lot_no)}" data-res="ไม่ผ่าน" ${q.result ? '' : 'disabled'}>ไม่ผ่าน</button>
      <label class="sr" for="${esc(id)}">เหตุผลที่ไม่ผ่าน ${esc(q.lot.lot_no)}</label><input class="in in-sm" id="${esc(id)}" placeholder="เหตุผลถ้าไม่ผ่าน" value="${q.result && q.result.result !== 'ผ่านเกณฑ์' ? esc(q.result.note || '') : ''}" ${q.result ? '' : 'disabled'}></div>${q.result ? '' : '<span class="sub-l">รอผลตรวจก่อน</span>'}`;
  };
  return `<section class="panel" aria-labelledby="qq-h"><div class="panel-h"><h2 id="qq-h">คิวรอปล่อยผ่าน</h2><span class="meta">${D.qcQueue.length} ล็อต ผู้ใช้ตอนนี้: ${esc(whoNote)}</span></div>
  ${tableWrap(`<table class="stack-t qc-t"><thead><tr><th>ป้าย</th><th>เลขที่</th><th>รายการ</th><th class="r">จำนวน</th><th>รับหรือผลิตเสร็จ</th><th class="r">รอมาแล้ว</th><th>ผลตรวจ (เจ้าหน้าที่)</th><th>อนุมัติ (หัวหน้าฝ่าย)</th></tr></thead><tbody>
  ${D.qcQueue.map((q) => `<tr${target === q.lot.lot_no ? ' class="is-target" data-target' : ''}><td>${lotChip('รอปล่อยผ่าน')}</td><td class="code">${esc(q.lot.lot_no)}</td><td class="t-name">${itemLink(q.it)}<span class="sub-l">${esc(q.lot.source)} ${q.lot.source === 'ผลิต' && q.lot.source_ref ? jobLink(q.lot.source_ref) : esc(q.lot.source === 'รับซื้อ' ? supName(q.lot.source_ref) : q.lot.source_ref)}</span></td><td class="r" data-l="จำนวน">${qh(q.it.code, q.lot.qty_left)}</td><td class="nowrap" data-l="รับหรือผลิตเสร็จ">${esc(thaiDate(q.lot.date_in))}</td>
  <td class="r" data-l="รอมาแล้ว"><span class="num"${q.waiting > CONFIG.qcWaitWarnDays ? ' style="color:var(--warn)"' : ''}>${q.waiting}</span><span class="u">วัน</span></td><td class="t-wide" data-l="ผลตรวจ (เจ้าหน้าที่)">${resultCell(q)}</td><td class="t-wide" data-l="อนุมัติ (หัวหน้าฝ่าย)">${decideCell(q)}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">ไม่มีล็อตรอปล่อยผ่าน</td></tr>'}
  </tbody></table>`, 'คิวรอปล่อยผ่าน')}
  <p class="note">ป้ายแดง รอปล่อยผ่าน เปลี่ยนเป็นป้ายเขียว ตรวจสอบแล้ว หรือ ไม่ผ่าน ได้โดยหัวหน้าฝ่ายควบคุมคุณภาพเท่านั้น คนบันทึกผลกับคนอนุมัติเป็นคนละคน (SOP-QC-06, SOP-QC-07, ระเบียบ V8.9 ข้อ 89 และ 92)</p></section>`;
}
function qcReleased(p) {
  const kind = p.get('kind') || 'fg';
  const rs = S.releases.filter((r) => (kind === 'all' ? true : kind === 'fg' ? isFG(S.items.get(r.item_code)) : !isFG(S.items.get(r.item_code)))).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  const fchip = (k, t) => `<a class="fchip" href="#/qc?tab=released&kind=${k}" ${k === kind ? 'aria-current="true"' : ''}>${t}</a>`;
  return `<section class="panel" aria-labelledby="qr-h"><div class="panel-h"><h2 id="qr-h">บันทึกการปล่อยผ่าน${kind === 'fg' ? 'ผลิตภัณฑ์สำเร็จรูป FM-35' : ''}</h2><a class="btn btn-sm" href="#/doc?type=fm35&month=${S.today.slice(0, 7)}">${I.print}พิมพ์ FM-35 เดือนนี้</a></div>
  <div class="filters">${fchip('fg', 'ยาสำเร็จรูป')}${fchip('raw', 'วัตถุดิบ')}${fchip('all', 'ทั้งหมด')}</div>
  ${tableWrap(`<table><thead><tr><th>ว/ด/ป</th><th>รายการ</th><th>Lot No.</th><th>ผลการตรวจ</th><th>ผู้ตรวจ</th><th>ผู้อนุมัติปล่อยผ่าน</th><th>หมายเหตุ</th></tr></thead><tbody>
  ${rs.map((r) => `<tr><td class="nowrap">${esc(thaiDate(r.date))}</td><td>${itemLink(r.item_code)}</td><td class="code">${esc(r.lot_no)}</td><td>${r.result === 'ผ่าน' ? lotChip('ตรวจสอบแล้ว') : lotChip('ไม่ผ่าน')}</td><td>${esc(short(staff(r.checker_id).name))}</td><td>${esc(short(staff(r.approver_id).name))}</td><td>${esc(r.note)}</td></tr>`).join('')}
  </tbody></table>`, 'บันทึกการปล่อยผ่าน')}</section>`;
}
function qcRejected() {
  const lots = S.lots.filter((l) => l.status === 'ไม่ผ่าน').sort((a, b) => (b.release_date || '').localeCompare(a.release_date || '')).slice(0, 30);
  return `<section class="panel" aria-labelledby="rj-h"><div class="panel-h"><h2 id="rj-h">ล็อตไม่ผ่าน แยกเก็บ รอส่งคืนหรือทำลาย</h2><span class="meta">SOP-QC-12</span></div>
  ${lots.length ? tableWrap(`<table><thead><tr><th>Lot No.</th><th>รายการ</th><th class="r">คงเหลือ</th><th>วันที่ตัดสิน</th><th>ที่มา</th><th>ป้าย</th></tr></thead><tbody>${lots.map((l) => `<tr><td class="code">${esc(l.lot_no)}</td><td>${itemLink(l.item_code)}</td><td class="r">${qh(l.item_code, l.qty_left)}</td><td class="nowrap">${esc(thaiDate(l.release_date))}</td><td>${esc(l.source)}</td><td>${lotChip('ไม่ผ่าน')}</td></tr>`).join('')}</tbody></table>`, 'ล็อตไม่ผ่าน') : '<p class="empty">ยังไม่มีล็อตไม่ผ่าน</p>'}</section>`;
}

// ปล่อยผ่านหรือไม่ผ่าน: ถามยืนยันพร้อมเลขที่และชื่อรายการก่อนทุกครั้ง เพราะแก้หรือลบไม่ได้ (QA-018 QA-037 WHO TRS 1033 ข้อ 11.13)
function releaseCheck(lotNo, result) {
  if (!can('release')) return { deny: true };
  const lot = S.lotMap.get(lotNo);
  if (!lot || lot.status !== 'รอปล่อยผ่าน') return { error: 'ล็อตนี้ไม่ได้อยู่ในสถานะรอปล่อยผ่าน' };
  const res = S.qcResults.get(lotNo);
  if (!res) return { error: 'ยังไม่มีผลตรวจจากเจ้าหน้าที่ฝ่ายควบคุมคุณภาพ อนุมัติไม่ได้' };
  if (res.checker_id === S.user) return { error: 'คนบันทึกผลกับคนอนุมัติต้องเป็นคนละคน' };
  if (result === 'ผ่าน' && res.result !== 'ผ่านเกณฑ์') return { error: 'ผลตรวจไม่ผ่านเกณฑ์ ปล่อยผ่านไม่ได้' };
  return { lot, res, it: S.items.get(lot.item_code) };
}
function askRelease(lotNo, result, reasonDraft) {
  const c = releaseCheck(lotNo, result);
  if (c.deny) return deny('release', 'ปล่อยผ่านหรือไม่ผ่าน');
  if (c.error) return toast(c.error, 'warn');
  const { lot, res, it } = c;
  const pass = result === 'ผ่าน';
  const body = `<dl class="fields dlg-fields"><div><dt>เลขที่</dt><dd class="mono dlg-big">${esc(lotNo)}</dd></div><div><dt>รายการ</dt><dd><strong>${esc(it.name)}</strong></dd></div>
      <div><dt>จำนวน</dt><dd>${qh(it.code, lot.qty_left)}</dd></div><div><dt>ผลตรวจ</dt><dd>${chip(res.result, res.result === 'ผ่านเกณฑ์' ? 'ok' : 'crit')}</dd></div>
      <div><dt>ผู้ตรวจ</dt><dd>${esc(short(staff(res.checker_id).name))} ${esc(thaiDate(res.date))}</dd></div><div><dt>เปลี่ยนป้ายเป็น</dt><dd>${lotChip(pass ? 'ตรวจสอบแล้ว' : 'ไม่ผ่าน')}</dd></div></dl>
    ${pass ? '' : `<label class="f">เหตุผลที่ไม่ผ่าน (ต้องกรอก)<input class="in" name="reason" required maxlength="300" value="${esc(reasonDraft || res.note || '')}" autofocus></label>`}
    <p class="dlg-note">${pass ? 'ปล่อยผ่านแล้วของล็อตนี้เบิกได้ทันที ' : 'ไม่ผ่านแล้วของล็อตนี้ต้องแยกเก็บ '}การอนุมัตินี้แก้หรือลบไม่ได้ ถ้าผิดต้องทำรายงานความเบี่ยงเบน FM-51 ตรวจเลขที่และชื่อรายการให้ตรงกับของจริงก่อนกดยืนยัน</p>`;
  openDialog({
    title: pass ? `ยืนยันปล่อยผ่าน ${lotNo}` : `ยืนยันไม่ผ่าน ${lotNo}`, body, ok: pass ? 'ยืนยันปล่อยผ่าน' : 'ยืนยันไม่ผ่าน', tone: pass ? 'solid' : 'crit',
    onOk: (fd) => guard(() => {
      const reason = String(fd.get('reason') || '').trim();
      if (!pass && !reason) return 'ใส่เหตุผลที่ไม่ผ่านก่อน';
      return doRelease(lotNo, result, reason);
    }),
  });
}
function doRelease(lotNo, result, reason) {
  const c = releaseCheck(lotNo, result);
  if (c.deny || c.error) return c.error || 'ไม่มีสิทธิ์';
  const { lot, res, it } = c;
  const fx = {
    status: [{ lot_no: lotNo, status: result === 'ผ่าน' ? 'ตรวจสอบแล้ว' : 'ไม่ผ่าน', release_date: S.today }],
    releases: [{ date: S.today, lot_no: lotNo, item_code: lot.item_code, result, checker_id: res.checker_id, approver_id: S.user, note: reason || res.note || '' }],
  };
  const job = S.jobs.find((j) => j.out_lot === lotNo);
  if (job) { fx.jobs = [{ job_id: job.job_id, patch: { status: 'done', release_date: S.today } }]; fx.stage = [{ job_id: job.job_id, stage: 'ตรวจสอบแล้ว' }]; }
  commit({ type: 'release', summary: `${result === 'ผ่าน' ? 'ปล่อยผ่าน เปลี่ยนป้ายเป็นตรวจสอบแล้ว' : 'ไม่ผ่าน แยกเก็บ'} ล็อต ${lotNo} ${it.name}`, reason, effects: fx });
  showSlip('qc', { k: isFG(it) ? 'สำเนาบันทึกการปล่อยผ่าน FM-35' : 'สำเนาบันทึกการปล่อยผ่าน SOP-QC-06', no: lotNo, title: `${it.name} ${qty(lot.item_code, lot.qty_left)}`, lines: [`ผู้ตรวจ ${short(staff(res.checker_id).name)} ผู้อนุมัติ ${short(currentUser().name)} ${thaiDate(S.today)}`, result === 'ผ่าน' ? 'ของล็อตนี้เบิกได้แล้ว ฝ่ายจัดซื้อและคลังเห็นทันที' : `เหตุผล ${reason} แยกเก็บรอส่งคืนหรือทำลาย`], stamp: result === 'ผ่าน' ? ['ตรวจสอบแล้ว', 'ok'] : ['ไม่ผ่าน', 'crit'], links: isFG(it) ? [['พิมพ์ FM-35 เดือนนี้', `#/doc?type=fm35&month=${S.today.slice(0, 7)}`]] : [] });
  nav.route();
  return true;
}

// ================= ขาย ลูกหนี้ =================
function viewSales(p) {
  const alerts = roomAlerts('sales');
  const tab = p.get('tab') || 'ar';
  const ms = monthSales();
  const ar = arAging();
  const tabs = [['ar', 'ลูกหนี้'], ['sales', 'ยอดขาย'], ['stock', 'ยาพร้อมขาย']];
  const body = tab === 'sales' ? salesTab(ms, p) : tab === 'stock' ? fgStock(p) : arTab(p, ar);
  return head('ห้องทำงานขาย ลูกหนี้', alerts) + slipBlock('sales') + stripCells([
    { k: 'ยอดขาย 12 เดือน', n: mill(ms.reduce((s, x) => s + x.total, 0)), u: 'ล้านบาท', d: `เดือนนี้ถึงวันนี้ ${mill(ms[ms.length - 1].total)} ล้าน` },
    { k: 'ลูกหนี้ค้างชำระ', n: mill(ar.total), u: 'ล้านบาท', d: `${S.invoices.filter((v) => !v.paid_date && v.date <= S.today).length} ใบ` },
    { k: 'เกินกำหนดชำระ', n: mill(ar.overdue), u: 'ล้านบาท', lv: ar.overdue ? 'crit' : '', d: `${D.overdue.length} ราย` },
  ]) + alertsBlock(alerts) + seg('sales', tabs, tab) + body;
}
function arTab(p, ar) {
  const cust = p.get('cust') || '';
  const from = addDays(S.today, -365);
  const rows = S.base.customers.map((c) => {
    const inv = S.invoices.filter((v) => v.customer_id === c.customer_id && v.date <= S.today);
    return { c, sales: inv.filter((v) => v.date > from).reduce((s, v) => s + v.total, 0), out: inv.filter((v) => !v.paid_date).reduce((s, v) => s + owedOf(v), 0), over: inv.filter((v) => !v.paid_date && v.due_date < S.today).reduce((s, v) => s + owedOf(v), 0), oldest: inv.filter((v) => !v.paid_date).reduce((m, v) => Math.max(m, daysBetween(v.date, S.today)), 0) };
  }).sort((a, b) => b.over - a.over || b.out - a.out);
  // ค้นเลขใบส่งของหรือชื่อลูกค้าได้จากหน้าหลัก และดูใบค้างทั้งหมดได้ ไม่ต้องกดชื่อลูกค้าก่อน (QA-024)
  const qInv = (p.get('inv') || '').trim();
  const scopeAll = p.get('all') === '1';
  const open = S.invoices.filter((v) => !v.paid_date && v.date <= S.today);
  const nOver = open.filter((v) => v.due_date < S.today).length;
  const list = open.filter((v) => (cust ? v.customer_id === cust : qInv ? v.inv_no.toLowerCase().includes(qInv.toLowerCase()) || custName(v.customer_id).includes(qInv) : scopeAll || v.due_date < S.today)).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const more = Math.max(1, Math.floor(Number(p.get('more'))) || 1);
  const unpaid = list.slice(0, 25 * more);
  const arLink = (o) => { const x = new URLSearchParams({ tab: 'ar', ...o }); for (const [k, v] of [...x]) if (!v) x.delete(k); return `#/sales?${x}`; };
  const canPay = can('payment');
  return `<div class="work"><section class="panel" aria-labelledby="cu-h"><div class="panel-h"><h2 id="cu-h">ขายให้ใคร ค้างเท่าไร</h2><span class="meta">กดชื่อลูกค้าเพื่อดูใบค้าง</span></div>
    ${tableWrap(`<table><thead><tr><th>ลูกค้า</th><th class="r">เครดิต</th><th class="r">ยอดขาย 12 เดือน</th><th class="r">ค้างชำระ</th><th class="r">เกินกำหนด</th><th class="r">ใบเก่าสุด</th></tr></thead><tbody>
    ${rows.map((x) => `<tr${cust === x.c.customer_id ? ' class="is-target" data-target' : ''}><td><a href="#/sales?tab=ar&cust=${x.c.customer_id}">${esc(x.c.name)}</a><span class="sub-l">${esc(x.c.type)}${active(x.c) ? '' : ' เลิกใช้'}</span></td><td class="r"><span class="num">${x.c.credit_days}</span><span class="u">วัน</span></td><td class="r"><span class="num">${num(x.sales)}</span></td><td class="r"><span class="num"><b>${num(x.out)}</b></span></td><td class="r">${x.over ? `<span class="num" style="color:var(--crit)">${num(x.over)}</span>` : '<span class="muted">-</span>'}</td><td class="r">${x.oldest ? `<span class="num">${x.oldest}</span><span class="u">วัน</span>` : '-'}</td></tr>`).join('')}</tbody></table>`, 'ลูกหนี้รายลูกค้า')}
    <p class="note">หน่วยเป็นบาท ยอดขายมาจากใบส่งของที่ออกพร้อมใบเบิกยาสำเร็จรูป FM-19</p></section>
    <section class="panel" aria-labelledby="iv-h"><div class="panel-h"><h2 id="iv-h">${cust ? `ใบค้างชำระของ ${esc(custName(cust))}` : qInv ? `ผลค้น "${esc(qInv)}"` : scopeAll ? 'ใบค้างชำระทั้งหมด' : 'ใบส่งของเกินกำหนดชำระ'}</h2><span class="meta">${num(list.length)} ใบ เรียงครบกำหนดก่อน</span></div>
    <div class="filters"><a class="fchip" href="${arLink({})}" ${!cust && !qInv && !scopeAll ? 'aria-current="true"' : ''}>เกินกำหนด <span class="num">${num(nOver)}</span></a><a class="fchip" href="${arLink({ all: '1' })}" ${scopeAll && !cust && !qInv ? 'aria-current="true"' : ''}>ค้างชำระทั้งหมด <span class="num">${num(open.length)}</span></a>
      <form class="search" data-form="arSearch" role="search"><label class="sr" for="arq">ค้นเลขใบส่งของหรือชื่อลูกค้า</label><input class="in" id="arq" name="inv" value="${esc(qInv)}" maxlength="60" placeholder="ค้นเลขใบส่งของ เช่น IV70-0016"><button class="btn btn-sm" type="submit">${I.search}ค้น</button></form></div>
    ${roleNote('payment', 'บันทึกรับชำระ')}
    ${unpaid.length ? `<ul class="mini">${unpaid.map((v) => { const late = daysBetween(v.due_date, S.today); return `<li><span class="t"><a class="mono" href="#/doc?type=fm19&inv=${encodeURIComponent(v.inv_no)}">${esc(v.inv_no)}</a> ${cust ? '' : esc(short(custName(v.customer_id)))}<span class="d">ครบกำหนด ${esc(thaiDate(v.due_date))}${late > 0 ? ` เกินมา ${late} วัน` : ''} ยอด ${esc(money(v.total))}${paidOf(v) > 0 ? ` รับแล้ว ${esc(money(paidOf(v)))} ค้าง ${esc(money(owedOf(v)))}` : ''}</span></span><button type="button" class="btn btn-sm" data-act="pay" data-inv="${esc(v.inv_no)}" ${canPay ? '' : 'disabled'}>รับชำระ</button></li>`; }).join('')}</ul>${list.length > unpaid.length ? `<a class="more-link" href="${arLink({ cust, inv: qInv, all: scopeAll ? '1' : '', more: String(more + 1) })}">แสดงเพิ่มอีก ${num(Math.min(25, list.length - unpaid.length))} ใบ (เหลือ ${num(list.length - unpaid.length)} ใบ)</a>` : ''}` : `<p class="empty">${qInv ? 'ไม่พบใบค้างชำระตามที่ค้น' : 'ไม่มีใบค้างชำระ'}</p>`}
    <div style="margin-top:16px">${agingBar(ar)}</div></section></div>`;
}
function salesTab(ms, p) {
  const q = (p.get('q') || '').trim().toLowerCase();
  const from = addDays(S.today, -365);
  const inv = new Map(S.invoices.filter((v) => v.date > from && v.date <= S.today).map((v) => [v.inv_no, v]));
  const by = new Map();
  for (const l of S.invoiceLines) { if (!inv.has(l.inv_no)) continue; const x = by.get(l.item_code) || { q: 0, amt: 0 }; x.q += l.qty; x.amt += l.amount; by.set(l.item_code, x); }
  const rows = [...by].filter(([code]) => !q || S.items.get(code).name.toLowerCase().includes(q) || code.includes(q)).sort((a, b) => b[1].amt - a[1].amt);
  const total = [...by.values()].reduce((t, x) => t + x.amt, 0);
  return `<div class="work"><section class="panel" aria-labelledby="ms-h"><div class="panel-h"><h2 id="ms-h">ยอดขายรายเดือน</h2><span class="meta">12 เดือนล่าสุด</span></div>${salesBars(ms)}</section>
  <section class="panel" aria-labelledby="bp-h"><div class="panel-h"><h2 id="bp-h">ขายอะไร 12 เดือน</h2><span class="meta">${by.size} ผลิตภัณฑ์ รวม ${mill(total)} ล้านบาท</span></div>
  <form class="search" data-form="salesSearch" role="search" style="margin:0 0 10px"><label class="sr" for="sq">ค้นผลิตภัณฑ์</label><input class="in" id="sq" name="q" value="${esc(p.get('q') || '')}" placeholder="ค้นชื่อหรือรหัส"><button class="btn btn-sm" type="submit">${I.search}ค้น</button></form>
  ${tableWrap(`<table><thead><tr><th>ผลิตภัณฑ์</th><th class="r">จำนวน</th><th class="r">ยอดขาย (บาท)</th><th class="r">สัดส่วน</th></tr></thead><tbody>${rows.slice(0, 40).map(([code, x]) => `<tr><td>${itemLink(code)}</td><td class="r">${qh(code, x.q)}</td><td class="r"><span class="num">${num(x.amt)}</span></td><td class="r"><span class="num">${num((x.amt / Math.max(1, total)) * 100, 1)}%</span></td></tr>`).join('')}</tbody></table>`, 'ยอดขายรายผลิตภัณฑ์')}
  ${rows.length > 40 ? `<p class="note">แสดง 40 อันดับแรกจาก ${rows.length} ใช้ช่องค้นเพื่อหารายการอื่น</p>` : ''}</section></div>`;
}
function fgStock(p) {
  const q = (p.get('q') || '').trim().toLowerCase();
  const lots = S.lots.filter((l) => usable(l) && isFG(S.items.get(l.item_code)) && (!q || S.items.get(l.item_code).name.toLowerCase().includes(q) || l.lot_no.includes(q))).sort((a, b) => a.item_code.localeCompare(b.item_code) || (a.exp_date || '').localeCompare(b.exp_date || ''));
  return `<section class="panel" aria-labelledby="fg-h"><div class="panel-h"><h2 id="fg-h">ยาสำเร็จรูปพร้อมขาย</h2><span class="meta">${lots.length} ล็อตที่ตรวจสอบแล้ว เรียงหมดอายุก่อนในแต่ละรายการ</span></div>
  <form class="search" data-form="fgSearch" role="search" style="margin:0 0 10px"><label class="sr" for="fq">ค้นยาพร้อมขาย</label><input class="in" id="fq" name="q" value="${esc(p.get('q') || '')}" placeholder="ค้นชื่อยาหรือเลขที่ผลิต"><button class="btn btn-sm" type="submit">${I.search}ค้น</button></form>
  ${tableWrap(`<table><thead><tr><th>ผลิตภัณฑ์</th><th>Lot No.</th><th class="r">คงเหลือ</th><th>หมดอายุ</th><th>ขายก่อน</th></tr></thead><tbody>${lots.slice(0, 80).map((l) => { const d = daysBetween(S.today, l.exp_date); return `<tr><td>${itemLink(l.item_code)}</td><td class="code">${esc(l.lot_no)}</td><td class="r">${qh(l.item_code, l.qty_left)}</td><td class="nowrap">${esc(thaiDate(l.exp_date))}</td><td>${d <= CONFIG.expiryWarnDays ? chip(`เหลือ ${d} วัน`, d <= CONFIG.expiryCritDays ? 'crit' : 'warn') : '<span class="muted">-</span>'}</td></tr>`; }).join('')}</tbody></table>`, 'ยาสำเร็จรูปพร้อมขาย')}
  ${lots.length > 80 ? '<p class="note">แสดง 80 ล็อตแรก ใช้ช่องค้นเพื่อหารายการอื่น</p>' : ''}</section>`;
}

// ================= ไล่ย้อนล็อต =================
function traceTree(lotNo, depth = 0) {
  const lot = S.lotMap.get(lotNo);
  if (!lot) return '';
  const it = S.items.get(lot.item_code);
  const job = S.jobs.find((j) => j.out_lot === lotNo);
  const src = lot.source === 'ใบสั่งซื้อ' ? `ซื้อตาม ${lot.source_ref}` : lot.source === 'รับซื้อ' ? `รับซื้อจาก ${supName(lot.source_ref)}` : lot.source === 'ผลิต' ? `ผลิตตามงาน ${lot.source_ref}` : lot.source;
  const kids = job && depth < 3 ? S.jobInputs.filter((x) => x.job_id === job.job_id) : [];
  return `<li><span class="mono">${esc(lotNo)}</span> ${itemLink(it)} ${lotChip(lot.status)} <span class="muted">${esc(src)} ${esc(thaiDate(lot.date_in))}</span>${kids.length ? `<ul>${kids.map((k) => `<li>ใช้ ${esc(qty(k.item_code, k.qty))}<ul>${traceTree(k.lot_no, depth + 1)}</ul></li>`).join('')}</ul>` : ''}</li>`;
}
function forward(lotNo, depth = 0, acc = new Map()) {
  for (const l of S.invoiceLines.filter((x) => x.lot_no === lotNo)) {
    const inv = S.invoices.find((v) => v.inv_no === l.inv_no);
    if (inv) acc.set(inv.customer_id, (acc.get(inv.customer_id) || 0) + l.qty);
  }
  if (depth < 3) for (const x of S.jobInputs.filter((y) => y.lot_no === lotNo)) { const j = S.jobs.find((jj) => jj.job_id === x.job_id); if (j && j.out_lot) forward(j.out_lot, depth + 1, acc); }
  return acc;
}
function usedIn(lotNo, depth = 0) {
  if (depth > 3) return [];
  const out = [];
  for (const x of S.jobInputs.filter((y) => y.lot_no === lotNo)) { const j = S.jobs.find((jj) => jj.job_id === x.job_id); if (j && j.out_lot) { out.push(j.out_lot); out.push(...usedIn(j.out_lot, depth + 1)); } }
  return out;
}
function viewTrace(params) {
  const lotNo = (params.get('lot') || '').trim();
  const lot = S.lotMap.get(lotNo);
  const sample = S.lots.filter((l) => isFG(S.items.get(l.item_code)) && l.source === 'ผลิต').slice(-3).map((l) => l.lot_no).concat(S.lots.filter((l) => S.items.get(l.item_code).kind === 'สด').slice(-2).map((l) => l.lot_no));
  let body = '';
  if (lotNo && !lot) body = `<p class="alerts-quiet">${chip('ไม่พบเลขนี้', 'warn')} ลองเลขอื่น หรือกดเลขตัวอย่าง</p>`;
  if (lot) {
    const fw = forward(lotNo);
    const down = usedIn(lotNo);
    body = `<div class="work"><section class="panel" aria-labelledby="tb-h"><div class="panel-h"><h2 id="tb-h">ไล่ย้อนต้นทาง</h2></div><ul class="tree">${traceTree(lotNo)}</ul></section>
    <section class="panel" aria-labelledby="tf-h"><div class="panel-h"><h2 id="tf-h">ไล่ไปปลายทาง จำลองเรียกคืน</h2></div>
    ${down.length ? `<p>ล็อตนี้ถูกใช้ผลิตต่อเป็น ${down.map((x) => `<a class="mono" href="#/trace?lot=${x}">${x}</a>`).join(', ')}</p>` : ''}
    ${fw.size ? `<p style="margin:6px 0 10px"><strong>ถ้าต้องเรียกคืน ต้องแจ้ง ${fw.size} ราย</strong> (FM-07 บันทึกการเรียกคืน และ FM-10 ใบเรียกคืนผลิตภัณฑ์สำเร็จรูป)</p>${tableWrap(`<table><thead><tr><th>ลูกค้า</th><th class="r">จำนวนที่ได้รับ</th></tr></thead><tbody>${[...fw].map(([k, v]) => `<tr><td>${esc(custName(k))}</td><td class="r"><span class="num">${num(v)}</span></td></tr>`).join('')}</tbody></table>`, 'ลูกค้าที่ต้องแจ้งเรียกคืน')}` : '<p class="empty">ยังไม่มีการจ่ายออกให้ลูกค้า</p>'}</section></div>`;
  }
  return `<header class="room-head"><div><h1>ไล่ย้อนล็อต</h1><p class="sub">ใส่เลขที่ผลิต 8 หลัก (SOP-PD-07) หรือเลขรับ ดูว่ามาจากวัตถุดิบล็อตไหน ใครส่งมา และถ้ามีปัญหาต้องเรียกคืนจากใคร</p></div></header>
  <form data-form="trace" class="trace-form" role="search"><label class="sr" for="lotq">เลขที่ผลิตหรือเลขรับ</label><input class="in" id="lotq" name="lot" value="${esc(lotNo)}" placeholder="เช่น ${esc(sample[0] || '')}" list="lotList"><datalist id="lotList">${S.lots.slice(-200).map((l) => `<option value="${l.lot_no}">`).join('')}</datalist><button class="btn btn-solid" type="submit">${I.trace}ไล่ย้อน</button>
  <span class="samples">ลองเลข${sample.map((x) => `<a href="#/trace?lot=${x}">${x}</a>`).join('')}</span></form>${body}`;
}

// ================= ตัวสร้างรายการ (ใช้ทั้งตอนบันทึกใหม่และตอนแก้ไข) =================
// วันหมดอายุที่กรอกมือ: ช่องวันที่ใช้ปี ค.ศ. คนไทยมักใส่ปี พ.ศ. (QA-003) และห้ามรับของที่หมดอายุแล้ว (QA-015)
export function expProblem(exp, date = S.today) {
  if (!exp) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exp) || Number.isNaN(Date.parse(`${exp}T00:00:00Z`))) return 'วันหมดอายุไม่ถูกต้อง เลือกวันจากปฏิทิน';
  const y = Number(exp.slice(0, 4));
  if (y >= 2400) return `ปี ${y} เป็นปี พ.ศ. ช่องนี้ใช้ปี ค.ศ. ให้ใส่ ${y - 543} (${y} ลบ 543)`;
  if (y > Number(date.slice(0, 4)) + CONFIG.maxShelfYears) return `วันหมดอายุไกลเกิน ${CONFIG.maxShelfYears} ปี ตรวจปีกับฉลากอีกครั้ง`;
  if (exp <= date) return `ของหมดอายุแล้ว (${thaiDate(exp)}) รับเข้าไม่ได้ แยกเก็บแล้วแจ้งผู้ขาย`;
  return '';
}
function buildReceive(inp, keep = {}) {
  const it = S.items.get(inp.item);
  if (!it || !(it.make === 'buy' || it.make === 'farm')) return { error: it ? `${it.code} ${it.name} เป็นของที่โรงงานผลิตหรือแปรรูปเอง รับเข้าจากภายนอกไม่ได้ ของที่ผลิตเองเข้าคลังผ่านบอร์ดงาน` : 'ไม่พบรายการ เลือกจากรายการที่ขึ้นให้เลือก' };
  if (!active(it)) return { error: `${it.name} เลิกใช้แล้ว รับเข้าไม่ได้` };
  if (intProblem(it, inp.qty)) return { error: intProblem(it, inp.qty) };
  const q = round(inp.item, Number(inp.qty));
  if (!(q > 0)) return { error: 'ใส่จำนวนก่อน' };
  const sup = S.base.suppliers.find((s) => s.supplier_id === inp.supplier);
  if (!sup) return { error: 'เลือกผู้ขาย' };
  if (sup.approved !== 'Y' || !active(sup)) return { error: `${sup.name} ${active(sup) ? 'ยังไม่ผ่านการคัดเลือกในทะเบียน FM-46' : 'เลิกใช้แล้วในทะเบียน FM-46'} รับของจากผู้ขายรายนี้ไม่ได้` };
  if (inp.po) {
    const po = S.pos.find((x) => x.po_no === inp.po);
    if (!po) return { error: `ไม่พบใบสั่งซื้อ ${inp.po}` };
    if (po.item_code !== inp.item) return { error: `${inp.po} สั่ง ${po.item_code} ${S.items.get(po.item_code)?.name || ''} ไม่ใช่ ${it.name} เลือกใบสั่งซื้อให้ตรงรายการ หรือเลือกไม่อ้าง` };
    if (po.received_date) return { error: `${inp.po} รับของครบและปิดใบแล้ว` };
    if (po.supplier_id !== inp.supplier) return { error: `${inp.po} สั่งจาก ${supName(po.supplier_id)} ผู้ขายที่เลือกไม่ตรงกับใบสั่งซื้อ` };
  }
  const date = keep.date || S.today;
  const bad = expProblem(inp.exp, date);
  if (bad) return { error: bad };
  const po = inp.po ? S.pos.find((x) => x.po_no === inp.po) : null;
  const left = po ? poLeft(po) : 0;
  if (!inp.sure) {
    const warns = [unusualQty(inp.item, 'รับ', q), po && q > left * 1.001 ? `รับ ${qty(inp.item, q)} เกินที่ค้างรับใน ${po.po_no} (ค้าง ${qty(inp.item, left)})` : ''].filter(Boolean);
    if (warns.length) return { confirm: { title: 'จำนวนรับเข้าผิดปกติ ตรวจอีกครั้ง', msgs: warns } };
  }
  // รับไม่ครบ: ใบสั่งซื้อค้างยอดที่เหลือ ปิดใบเมื่อรับครบหรือผู้ใช้ติ๊กว่าผู้ขายจะไม่ส่งส่วนที่เหลือ (QA-011)
  const closePo = po ? q >= left - 1e-9 || inp.close === '1' : false;
  const lotNo = keep.lot || nextLotNo(inp.item, date);
  const exp = inp.exp || (it.shelf_days ? addDays(date, it.shelf_days) : '');
  const fx = {
    lots: [{ lot_no: lotNo, item_code: inp.item, qty_in: q, date_in: date, exp_date: exp, status: 'รอปล่อยผ่าน', release_date: '', source: inp.po ? 'ใบสั่งซื้อ' : it.make === 'farm' ? 'รับซื้อ' : 'รับเข้า', source_ref: inp.po || sup.supplier_id }],
    moves: [newMove({ item_code: inp.item, lot_no: lotNo, type: 'รับ', qty: q, party: sup.name, doc_no: inp.po ? `FM-01 ${inp.po}` : it.make === 'farm' ? 'FM-23 ใบรับซื้อวัตถุดิบสมุนไพร' : 'FM-01', date, user_id: keep.user || S.user })],
  };
  let poLine = '';
  if (po) {
    fx.po = [{ po_no: po.po_no, recv: q, lot_no: lotNo, date, close: closePo }];
    const pr = S.prs.find((r) => r.po_no === po.po_no && !r.received);
    if (pr && closePo) fx.prStep = [{ pr_no: pr.pr_no, patch: { received: date, received_by: keep.user || S.user } }];
    poLine = closePo ? `${po.po_no} ${q >= left - 1e-9 ? 'รับครบแล้ว ปิดใบสั่งซื้อ' : `ปิดใบสั่งซื้อ ผู้ขายจะไม่ส่งอีก ${qty(inp.item, left - q)}`}` : `${po.po_no} รับบางส่วน ยังค้างรับ ${qty(inp.item, left - q)}`;
  }
  return {
    summary: `รับเข้า ${it.name} ${qty(inp.item, q)} จาก ${sup.name} ออกเลข ${lotNo} ติดป้ายรอปล่อยผ่าน${poLine ? ` (${poLine})` : ''}`, effects: fx, room: 'store',
    slip: { k: 'สำเนาบันทึกการตรวจรับ FM-01', no: lotNo, title: `${it.name} ${qty(inp.item, q)}`, lines: [`รับจาก ${sup.name}${inp.po ? ` ตาม ${inp.po}` : ''} ${thaiDate(date)}`, poLine, 'ติดป้ายรอปล่อยผ่านแล้ว ส่งเข้าคิวฝ่ายควบคุมคุณภาพ'].filter(Boolean), stamp: ['รอปล่อยผ่าน', 'crit'], links: [['พิมพ์ FM-01', `#/doc?type=fm01&from=${date}&to=${date}`]].concat(it.make === 'farm' ? [['พิมพ์ FM-23', `#/doc?type=fm23&lot=${lotNo}`]] : []) },
  };
}
function buildIssue(inp, keep = {}) {
  const it = S.items.get(inp.item);
  if (!it) return { error: 'ไม่พบรายการ เลือกจากรายการที่ขึ้นให้เลือก' };
  if (intProblem(it, inp.qty)) return { error: intProblem(it, inp.qty) };
  const q = round(inp.item, Number(inp.qty));
  const to = String(inp.to || '').trim();
  if (!(q > 0) || !to) return { error: 'ใส่จำนวนและผู้รับก่อน' };
  if (to.length > 120) return { error: 'ชื่อผู้รับยาวเกิน 120 ตัวอักษร' };
  // ยาสำเร็จรูปต้องออกให้ลูกค้าในทะเบียนเท่านั้น จึงเกิดใบส่งของ ลูกหนี้ และไล่ย้อนเรียกคืนได้ (QA-005)
  if (isFG(it) && !S.base.customers.some((c) => c.name === to && active(c))) return { error: `"${to}" ไม่อยู่ในทะเบียนลูกค้า ยาสำเร็จรูปต้องเลือกผู้รับจากทะเบียนลูกค้า (ลูกค้าใหม่ให้เพิ่มในทะเบียนก่อน) เพื่อออกใบส่งของและไล่ย้อนเรียกคืนได้` };
  const { picks, short: lack } = fefoPick((S.lotsByItem.get(inp.item) || []).filter(usable), q);
  if (lack > 1e-9) return { error: `ของที่ตรวจสอบแล้วไม่พอ ขาด ${qty(inp.item, lack)}` };
  const odd = !inp.sure && unusualQty(inp.item, 'จ่าย', q);
  if (odd) return { confirm: { title: 'จำนวนเบิกผิดปกติ ตรวจอีกครั้ง', msgs: [odd] } };
  const date = keep.date || S.today;
  const fx = { moves: picks.map((pk) => newMove({ item_code: inp.item, lot_no: pk.lot_no, type: 'จ่าย', qty: round(inp.item, pk.qty), party: to, doc_no: REQ_FORM[it.kind], date, user_id: keep.user || S.user })) };
  const lines = [`จาก ${picks.length} ล็อต ${picks.map((pk) => `${pk.lot_no} ${qn(inp.item, pk.qty)}`).join(' ')}`];
  const cust = S.base.customers.find((c) => c.name === to);
  let invNo = '';
  if (cust && isFG(it)) {
    invNo = keep.inv || nextInvNo();
    const price = it.price || 0;
    fx.invoiceLines = picks.map((pk) => ({ inv_no: invNo, item_code: inp.item, lot_no: pk.lot_no, qty: round(inp.item, pk.qty), price, amount: Math.round(round(inp.item, pk.qty) * price) }));
    const total = fx.invoiceLines.reduce((s, l) => s + l.amount, 0);
    fx.invoices = [{ inv_no: invNo, date, customer_id: cust.customer_id, total, due_date: addDays(date, cust.credit_days), paid_date: '' }];
    lines.push(`ออกใบส่งของ ${invNo} ยอด ${money(total)} ครบกำหนด ${thaiDate(addDays(date, cust.credit_days))} ขึ้นในห้องขาย ลูกหนี้แล้ว`);
  }
  return {
    summary: `เบิก ${it.name} ${qty(inp.item, q)} ให้ ${to} จาก ${picks.length} ล็อต (${picks.map((pk) => pk.lot_no).join(', ')})${invNo ? ` ออกใบส่งของ ${invNo}` : ''}`, effects: fx, room: 'store',
    slip: { k: `สำเนาใบเบิก ${REQ_FORM[it.kind]}`, no: invNo || picks[0].lot_no, title: `${it.name} ${qty(inp.item, q)} ให้ ${to}`, lines, stamp: ['จ่ายแล้ว', 'ink'], links: invNo ? [['พิมพ์ FM-19 ใบเบิกยาสำเร็จรูป', `#/doc?type=fm19&inv=${encodeURIComponent(invNo)}`]] : [] },
  };
}
function buildJob(inp, keep = {}) {
  const room = ROOMS.find((r) => r.id === inp.room);
  const it = S.items.get(inp.item);
  if (!room || !it || it.lane !== room.lane || it.make !== 'make') return { error: 'ไม่พบรายการ เลือกจากรายการที่ขึ้นให้เลือก' };
  if (!producing(it)) return { error: `${it.code} ${it.name} ${active(it) ? `สถานะ${it.status}` : 'เลิกใช้แล้ว'} เปิดงานไม่ได้ (เปลี่ยนสถานะที่หน้าข้อมูลผลิตภัณฑ์)` };
  if (intProblem(it, inp.qty)) return { error: intProblem(it, inp.qty) };
  const q = round(inp.item, Number(inp.qty));
  if (!(q > 0)) return { error: 'ใส่จำนวนก่อน' };
  const lane = room.lane;
  const jobId = keep.job || nextJobId();
  const first = LANES[lane].stages[0];
  const lack = bomNeeds(inp.item, q).find((n) => !n.ok);
  return {
    summary: `เปิดงาน${lane === 'ผลิต' ? 'ผลิต' : 'แปรรูป'} ${jobId} ${it.name} ${qty(inp.item, q)}`, room: room.id,
    effects: { newJobs: [{ job_id: jobId, lane, item_code: inp.item, qty: q, created_date: keep.date || S.today, start_date: '', end_date: '', release_date: '', out_lot: '', status: 'waiting', wait_reason: '' }], stage: [{ job_id: jobId, stage: first }] },
    slip: { k: 'สำเนาใบเปิดงาน', no: jobId, title: `${it.name} ${qty(inp.item, q)}`, lines: [`เริ่มที่ขั้น "${first}" บนบอร์ด${LANES[lane].title}`, lack ? `ระวัง ${S.items.get(lack.code).name} ยังไม่พอตามสูตร` : 'วัตถุดิบตามสูตรพอ เบิกได้เมื่อย้ายไปขั้นถัดไป'], stamp: ['เปิดงานแล้ว', 'ink'] },
    after: `#/${room.id}?tab=board&job=${encodeURIComponent(jobId)}`,
  };
}
function buildQC(inp, keep = {}) {
  const lot = S.lotMap.get(inp.lot);
  if (!lot || lot.status !== 'รอปล่อยผ่าน') return { error: 'ล็อตนี้ไม่ได้อยู่ในคิวรอปล่อยผ่าน' };
  const note = String(inp.note || '').trim();
  if (inp.result === 'ไม่ผ่านเกณฑ์' && !note) return { error: 'ผลไม่ผ่านเกณฑ์ต้องใส่หมายเหตุว่าไม่ผ่านข้อใด' };
  const it = S.items.get(lot.item_code);
  const date = keep.date || S.today;
  return {
    summary: `บันทึกผลตรวจ ${inp.lot} ${it.name} ${inp.result}${note ? ` (${note})` : ''}`, room: 'qc',
    effects: { qcResults: [{ date, lot_no: inp.lot, item_code: lot.item_code, result: inp.result, checker_id: S.user, note }] },
    slip: { k: 'บันทึกผลตรวจ', no: inp.lot, title: `${it.name} ${qty(lot.item_code, lot.qty_left)}`, lines: [`ผู้ตรวจ ${short(currentUser().name)} ${thaiDate(date)}${note ? ` หมายเหตุ ${note}` : ''}`, 'รอหัวหน้าฝ่ายควบคุมคุณภาพอนุมัติ'], stamp: [inp.result, inp.result === 'ผ่านเกณฑ์' ? 'ok' : 'crit'] },
  };
}
// ตัวสร้างของแต่ละประเภท + สิทธิ์ที่ต้องมีเพื่อบันทึก แก้ หรือลบ
const BUILD = {
  receive: { build: buildReceive, key: () => 'receive', what: 'รับเข้า' },
  issue: { build: buildIssue, key: () => 'issue', what: 'เบิกออก' },
  job: { build: buildJob, key: (inp) => `open${ROOMS.find((r) => r.id === inp.room)?.lane}`, what: 'เปิดงาน' },
  qcResult: { build: buildQC, key: () => 'qcRecord', what: 'บันทึกผลตรวจ' },
  pr: { build: buildPR, key: () => 'requested', what: 'เขียนใบขอซื้อ' },
};
const DEL_KEY = { payment: 'payment', maint: 'assetMaster', formula: 'formulaEdit' };
// บันทึกไม่สำเร็จ (ที่เก็บเต็ม ข้อมูลเสีย หรือแท็บอื่นเพิ่งบันทึก) ต้องบอกผู้ใช้ทันที ห้ามขึ้นว่าบันทึกแล้ว (QA-008 ถึง QA-010)
function saveFailed(e) {
  closeDialog();
  slipState.slip = null;
  toast(e.message, e.kind === 'stale' || e.kind === 'size' ? 'warn' : 'crit');
  route();
}
function guard(fn) {
  try { return fn(); } catch (e) { if (e && e.name === 'SaveError') { saveFailed(e); return null; } throw e; }
}
export function submitNew(type, inp) { return guard(() => submitNewRaw(type, inp)); }
function submitNewRaw(type, inp) {
  const b = BUILD[type];
  if (!can(b.key(inp))) return deny(b.key(inp), b.what);
  const r = b.build(inp);
  if (r.error) return toast(r.error, 'warn');
  if (r.confirm) return askSure(type, inp, r.confirm);
  const ev = commit({ type, input: inp, summary: r.summary, effects: r.effects });
  showSlip(r.room, { ...r.slip, links: [...(r.slip.links || []), ['แก้ไขหรือลบรายการนี้', `#/log?edit=${ev.id}`]] });
  if (r.after) location.hash = r.after; else nav.route();
}
// ค่าที่ผิดปกติแต่อาจถูกจริง (จำนวนมากผิดปกติ รับเกินใบสั่งซื้อ ขอซื้อซ้ำ) ให้ถามยืนยันก่อน ไม่บันทึกทันที (QA-012 QA-017)
function askSure(type, inp, c) {
  openDialog({
    title: c.title || 'ตรวจอีกครั้งก่อนบันทึก', ok: c.ok || 'ตรวจแล้ว ถูกต้อง บันทึก', cancel: 'กลับไปแก้',
    body: `<ul class="dlg-list">${c.msgs.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>${c.field ? `<label class="f">${esc(c.field.label)}<input class="in" name="${esc(c.field.name)}" maxlength="300" autofocus></label>` : ''}`,
    onOk: (fd) => guard(() => {
      const extra = { sure: '1' };
      if (c.field) { const v = String(fd.get(c.field.name) || '').trim(); if (!v) return `กรอก${c.field.label}ก่อน`; extra[c.field.name] = v; }
      submitNewRaw(type, { ...inp, ...extra });
      return true;
    }),
  });
}
// จำนวนผิดปกติ: มากกว่า CONFIG.unusualQtyX เท่าของค่ากลาง และมากกว่า 2 เท่าของครั้งที่มากที่สุด ใน 20 ครั้งล่าสุดของรายการนี้ (in-house)
// ข้อมูลตั้งต้น ยอดขายจริงแกว่งได้ถึงราว 4.6 เท่าของค่ากลาง เงื่อนไขคู่จึงจับการพิมพ์ศูนย์เกิน (10 เท่า) ได้ โดยไม่ถามบ่อยเกิน
function unusualQty(code, type, q) {
  const xs = (S.movesByItem.get(code) || []).filter((m) => m.type === type).slice(-20).map((m) => m.qty).sort((a, b) => a - b);
  if (xs.length < 3) return '';
  const med = xs[Math.floor(xs.length / 2)];
  return med > 0 && q > med * CONFIG.unusualQtyX && q > xs[xs.length - 1] * 2 ? `${type === 'รับ' ? 'รับ' : 'เบิก'} ${qty(code, q)} มากกว่าที่เคย${type === 'รับ' ? 'รับ' : 'เบิก'}ราว ${num(q / med, 1)} เท่า (ปกติครั้งละราว ${qty(code, med)}) ตรวจว่าไม่ได้พิมพ์ศูนย์เกิน` : '';
}
// ของที่นับเป็นชิ้น ใส่ทศนิยมไม่ได้ ไม่ปัดให้เงียบๆ (QA-013)
export const intProblem = (it, raw) => (it && isIntUnit(it.unit) && raw !== '' && !Number.isInteger(Number(raw)) ? `${it.unit} นับเป็นชิ้น ใส่จำนวนเต็ม (กรอก ${raw})` : '');
const qtyAttrs = (it) => (isIntUnit(it.unit) ? 'min="1" step="1"' : 'min="0.01" step="any"');
// เก็บเลขที่และวันที่เดิมไว้ เวลาแก้ไขจะได้เลขเดิม
function keepOf(ev) {
  const fx = ev.effects || {};
  return {
    lot: fx.lots?.[0]?.lot_no, inv: fx.invoices?.[0]?.inv_no, job: fx.newJobs?.[0]?.job_id, pr: fx.newPr?.[0]?.pr_no,
    date: fx.lots?.[0]?.date_in || fx.moves?.[0]?.date || fx.newJobs?.[0]?.created_date || fx.qcResults?.[0]?.date || fx.newPr?.[0]?.requested || ev.at.slice(0, 10), user: ev.user,
  };
}

// ================= ประวัติการแก้ไข: แก้ไขหรือลบได้ ต้องมีเหตุผล ฉบับเดิมยังอยู่ =================
const KIND_TH = { receive: 'รับเข้า', issue: 'เบิกออก', job: 'เปิดงาน', qcResult: 'ผลตรวจ', release: 'ปล่อยผ่าน', stage: 'ย้ายงาน', payment: 'รับชำระ', pr: 'ใบขอซื้อ', prStep: 'ขั้นจัดซื้อ', master: 'ทะเบียน', formula: 'สูตร', maint: 'FM-08', note: 'บันทึกถึงฝ่าย', amend: 'แก้ไข', void: 'ลบ' };
const sameKey = (e) => JSON.stringify(e.effects?.prStep?.[0]?.pr_no || e.effects?.formula?.[0]?.item || (e.effects?.master || []).map((m) => `${m.table}:${m.key}`));
function editInfo(ev) {
  const type = ev.type === 'amend' ? ev.of : ev.type;
  const st = S.evState.get(ev.id)?.status;
  if (ev.type === 'void' || st !== 'active') return { ok: false, why: '' };
  if (type === 'release') return { ok: false, why: 'การอนุมัติปล่อยผ่านแก้หรือลบไม่ได้ ถ้าผิดให้ทำรายงานความเบี่ยงเบน FM-51' };
  if (type === 'note') return { ok: false, why: 'เก็บเป็นหลักฐาน ลบหรือแก้ไม่ได้' };
  if (type === 'stage') return { ok: false, why: 'ย้อนงานด้วยปุ่มลูกศรบนบอร์ด' };
  if (['prStep', 'formula', 'master', 'maint'].includes(type)) {
    const k = sameKey(ev);
    const later = S.events.slice(S.events.indexOf(ev) + 1).find((f) => f.type !== 'void' && S.evState.get(f.id)?.status === 'active' && (f.type === ev.type || (type === 'prStep' && f.type === 'receive' && JSON.stringify(f.effects?.prStep?.[0]?.pr_no) === k)) && sameKey(f) === k);
    if (later) return { ok: false, why: `มีรายการหลังจากนี้ (${later.summary}) ต้องลบรายการนั้นก่อน` };
  }
  const bl = blockers(ev.id);
  if (bl.length) return { ok: false, why: `มีรายการหลังจากนี้อ้างถึง (${bl[0].summary}) ต้องลบรายการนั้นก่อน` };
  return { ok: true, editable: !!BUILD[type] && !!ev.input };
}
function permKey(ev) {
  const type = ev.type === 'amend' ? ev.of : ev.type;
  if (BUILD[type]) return BUILD[type].key(ev.input || {});
  if (type === 'prStep') return Object.keys(ev.effects?.prStep?.[0]?.patch || {}).find((k) => CAN[k]) || 'requested';
  if (type === 'master') return { suppliers: 'supMaster', customers: 'custMaster', items: 'productMaster', assets: 'assetMaster' }[ev.effects?.master?.[0]?.table] || 'itemMaster';
  return DEL_KEY[type] || 'itemMaster';
}
function editPanel(ev) {
  const type = ev.type === 'amend' ? ev.of : ev.type;
  const inp = ev.input || {};
  let fields = '';
  if (type === 'receive') {
    const it = S.items.get(inp.item);
    const sups = S.base.suppliers.filter((s) => (it.make === 'farm' ? s.type === 'เกษตรกร' : s.type !== 'เกษตรกร'));
    fields = `<input type="hidden" name="item" value="${esc(inp.item)}"><input type="hidden" name="po" value="${esc(inp.po || '')}">
      <label class="f">รายการ<input class="in" value="${esc(`${inp.item} ${it.name}`)}" disabled></label>
      <label class="f">ผู้ขาย<select class="in" name="supplier">${sups.map((s) => `<option value="${s.supplier_id}" ${s.supplier_id === inp.supplier ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <label class="f">จำนวน (${esc(it.unit)})<input class="in" name="qty" type="number" ${qtyAttrs(it)} required value="${esc(inp.qty)}"></label>
      ${expField(inp.exp || '')}`;
  } else if (type === 'issue') {
    const it = S.items.get(inp.item);
    fields = `<input type="hidden" name="item" value="${esc(inp.item)}"><label class="f">รายการ<input class="in" value="${esc(`${inp.item} ${it.name}`)}" disabled></label>
      <label class="f">จำนวน (${esc(it.unit)})<input class="in" name="qty" type="number" ${qtyAttrs(it)} required value="${esc(inp.qty)}"></label>
      ${isFG(it) ? `<label class="f wide">จ่ายให้ลูกค้า<select class="in" name="to" required>${S.base.customers.filter((c) => active(c) || c.name === inp.to).map((c) => `<option value="${esc(c.name)}" ${c.name === inp.to ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : `<label class="f wide">จ่ายให้<input class="in" name="to" required maxlength="120" value="${esc(inp.to)}"></label>`}`;
  } else if (type === 'job') {
    const it = S.items.get(inp.item);
    fields = `<input type="hidden" name="room" value="${esc(inp.room)}"><input type="hidden" name="item" value="${esc(inp.item)}"><label class="f">รายการ<input class="in" value="${esc(`${inp.item} ${it.name}`)}" disabled></label>
      <label class="f">จำนวน (${esc(it.unit)})<input class="in" name="qty" type="number" ${qtyAttrs(it)} required value="${esc(inp.qty)}"></label>`;
  } else if (type === 'qcResult') {
    fields = `<input type="hidden" name="lot" value="${esc(inp.lot)}"><label class="f">ผลตรวจ<select class="in" name="result"><option ${inp.result === 'ผ่านเกณฑ์' ? 'selected' : ''}>ผ่านเกณฑ์</option><option ${inp.result === 'ไม่ผ่านเกณฑ์' ? 'selected' : ''}>ไม่ผ่านเกณฑ์</option></select></label>
      <label class="f">หมายเหตุ<input class="in" name="note" value="${esc(inp.note || '')}"></label>`;
  } else if (type === 'pr') {
    const it = S.items.get(inp.item);
    fields = `<input type="hidden" name="item" value="${esc(inp.item)}"><input type="hidden" name="supplier" value="${esc(inp.supplier)}"><label class="f">รายการ<input class="in" value="${esc(`${inp.item} ${it.name}`)}" disabled></label>
      <label class="f">จำนวน (${esc(it.unit)})<input class="in" name="qty" type="number" step="any" min="1" required value="${esc(inp.qty)}"></label>
      <label class="f">ราคาต่อหน่วย (บาท)<input class="in" name="unit_cost" type="number" step="any" min="0" required value="${esc(inp.unit_cost)}"></label>
      <label class="f wide">เหตุผลความจำเป็น<input class="in" name="purpose" maxlength="300" value="${esc(inp.purpose || '')}"></label>
      <label class="f wide">ถ้าราคา 0 บาท ใส่เหตุผล<input class="in" name="zero_reason" maxlength="200" value="${esc(inp.zero_reason || '')}"></label>`;
  }
  return `<section class="panel" aria-labelledby="ed-h"><div class="panel-h"><h2 id="ed-h">แก้ไขรายการ</h2><span class="meta">ฉบับเดิมยังอยู่ในประวัติ</span></div>
    <p class="form-note">เดิม: ${esc(ev.summary)}</p>
    <form data-form="amend" data-id="${esc(ev.id)}" class="form-grid">${fields}
      <label class="f wide">เหตุผลที่แก้ไข (ต้องกรอก)<input class="in" name="reason" required placeholder="เช่น ชั่งซ้ำแล้วได้น้ำหนักจริง 2,950 หลอด"></label>
      <div class="form-actions"><button type="submit" class="btn btn-solid">บันทึกการแก้ไข</button><a class="btn" href="#/log">ยกเลิก</a></div></form></section>`;
}
function voidPanel(ev) {
  return `<section class="panel" aria-labelledby="vd-h"><div class="panel-h"><h2 id="vd-h">ลบรายการ</h2><span class="meta">ลบแล้วรายการไม่มีผลกับข้อมูล แต่ยังอยู่ในประวัติพร้อมเหตุผล</span></div>
    <p class="form-note">จะลบ: ${esc(ev.summary)}</p>
    <form data-form="void" data-id="${esc(ev.id)}" class="form-grid"><label class="f wide">เหตุผลที่ลบ (ต้องกรอก)<input class="in" name="reason" required placeholder="เช่น บันทึกซ้ำ"></label>
      <div class="form-actions"><button type="submit" class="btn btn-crit">ยืนยันลบ</button><a class="btn" href="#/log">ยกเลิก</a></div></form></section>`;
}
// หน้าประวัติแบ่งหน้าละ 100 รายการ ค้นได้ คิดสถานะแก้ลบได้เฉพาะแถวที่แสดง (QA-022 หน้าประวัติช้าเมื่อข้อมูลมาก)
const LOG_PAGE = 100;
function viewLog(p) {
  const editId = p.get('edit'), delId = p.get('del');
  const show = p.get('show') || '';
  const qRaw = (p.get('q') || '').trim(), q = qRaw.toLowerCase();
  const all = [];
  for (let i = S.events.length - 1; i >= 0; i--) {
    const e = S.events[i];
    if (e.type === 'noteRead') continue;
    if (show && !(e.type === 'amend' || e.type === 'void' || S.evState.get(e.id)?.status !== 'active')) continue;
    if (q && !`${e.summary} ${e.reason || ''} ${staff(e.user).name} ${KIND_TH[e.type] || e.type}`.toLowerCase().includes(q)) continue;
    all.push(e);
  }
  const pages = Math.max(1, Math.ceil(all.length / LOG_PAGE));
  const pg = Math.min(pages, Math.max(1, Math.floor(Number(p.get('page'))) || 1));
  const evs = all.slice((pg - 1) * LOG_PAGE, pg * LOG_PAGE);
  const link = (o) => { const x = new URLSearchParams({ show, q: qRaw, ...o }); for (const [k, v] of [...x]) if (!v || (k === 'page' && v === '1')) x.delete(k); return `#/log${[...x].length ? `?${x}` : ''}`; };
  const pager = pages > 1 ? `<nav class="pager" aria-label="หน้าของประวัติ">${pg > 1 ? `<a class="btn btn-sm" href="${link({ page: String(pg - 1) })}">${I.left}ใหม่กว่า</a>` : ''}<span>หน้า ${num(pg)} จาก ${num(pages)}</span>${pg < pages ? `<a class="btn btn-sm" href="${link({ page: String(pg + 1) })}">เก่ากว่า${I.right}</a>` : ''}</nav>` : '';
  const target = eventById(editId || delId);
  let panel = '';
  if (target) {
    const info = editInfo(target);
    const key = permKey(target);
    if (!info.ok) panel = `<p class="alerts-quiet">${chip('แก้หรือลบไม่ได้', 'warn')} ${esc(info.why || 'รายการนี้ถูกแก้ไขหรือลบไปแล้ว')}</p>`;
    else if (!can(key)) panel = `<p class="alerts-quiet">${chip('ไม่มีสิทธิ์', 'warn')} แก้หรือลบรายการนี้ได้เฉพาะ${esc((CAN[key] || []).join(' หรือ '))}</p>`;
    else if (editId && info.editable) panel = editPanel(target);
    else panel = voidPanel(target);
  }
  const statusChip = (e) => {
    const st = S.evState.get(e.id)?.status;
    if (e.type === 'void') return chip('ลบ', 'crit');
    if (st === 'amended') return chip('แก้ไขแล้ว', 'warn');
    if (st === 'void') return chip('ลบแล้ว', 'crit');
    if (e.type === 'amend') return chip('ฉบับแก้ไข', 'ink');
    return chip('ใช้อยู่', 'ok');
  };
  const rows = evs.map((e) => {
    const st = S.evState.get(e.id)?.status;
    const info = editInfo(e);
    const acts = info.ok ? `${info.editable ? `<a class="btn btn-sm" href="#/log?edit=${e.id}">${I.edit}แก้ไข</a> ` : ''}<a class="btn btn-sm btn-crit" href="#/log?del=${e.id}">ลบ</a>` : `<span class="sub-l">${esc(info.why)}</span>`;
    return `<tr${(editId || delId) === e.id ? ' class="is-target" data-target' : ''}><td class="nowrap">${esc(new Date(e.at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }))}</td><td>${esc(short(staff(e.user).name))}<span class="sub-l">${esc(staff(e.user).role)}</span></td><td>${chip(KIND_TH[e.type] || e.type, 'ink')}</td><td${st && st !== 'active' ? ' class="struck"' : ''}>${esc(e.summary)}${e.before ? `<span class="sub-l">ฉบับเดิม: ${esc(e.before)}</span>` : ''}</td><td>${esc(e.reason || '')}</td><td>${statusChip(e)}</td><td>${acts}</td></tr>`;
  }).join('');
  return `<header class="room-head"><div><h1>ประวัติการแก้ไข</h1><p class="sub">ทุกรายการที่บันทึกในเว็บแก้ไขหรือลบได้ ต้องใส่เหตุผล ฉบับเดิมไม่หาย บอกได้ว่าใคร ทำอะไร จากค่าอะไรเป็นค่าอะไร เมื่อไร</p></div>
  <div class="acts"><button type="button" class="btn" data-act="exportLog" ${S.events.length ? '' : 'disabled'}>${I.download}ส่งออก CSV</button><button type="button" class="btn btn-crit" data-act="reset" ${S.events.length && can('reset') ? '' : 'disabled'} title="${can('reset') ? 'ดาวน์โหลดสำรองให้ก่อนล้าง' : 'เฉพาะหัวหน้ากลุ่มงาน'}">ล้างข้อมูลทดลองทั้งหมด</button></div></header>
  ${panel}
  <section class="panel" aria-labelledby="lg-h"><div class="panel-h"><h2 id="lg-h">รายการที่บันทึกในเว็บ</h2><span class="meta">${num(all.length)} รายการ${q ? ` ที่ตรงกับ "${esc(qRaw)}"` : ''} หน้าละ ${LOG_PAGE} รายการ เก็บในเบราว์เซอร์เครื่องนี้เท่านั้น</span></div>
  <div class="filters"><a class="fchip" href="${link({ show: '' })}" ${show ? '' : 'aria-current="true"'}>ทั้งหมด</a><a class="fchip" href="${link({ show: 'changed' })}" ${show ? 'aria-current="true"' : ''}>เฉพาะที่แก้ไขหรือลบ</a>
    <form class="search" data-form="logSearch" role="search"><label class="sr" for="lgq">ค้นประวัติ</label><input class="in" id="lgq" name="q" value="${esc(qRaw)}" maxlength="80" placeholder="ค้นเลขที่ ชื่อรายการ ผู้ใช้ เหตุผล"><input type="hidden" name="show" value="${esc(show)}"><button class="btn btn-sm" type="submit">${I.search}ค้น</button></form></div>
  ${evs.length ? tableWrap(`<table><thead><tr><th>เวลา</th><th>ผู้ใช้</th><th>ประเภท</th><th>ทำอะไร</th><th>เหตุผล</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${rows}</tbody></table>`, 'ประวัติการแก้ไข') + pager : `<p class="empty">${q || show ? 'ไม่พบรายการตามที่ค้นหรือกรอง' : 'ยังไม่มี ลองรับของ เบิกของ เขียนใบขอซื้อ ย้ายการ์ด บันทึกผลตรวจ หรือแก้ทะเบียน แล้วกลับมาดูหน้านี้'}</p>`}</section>`;
}
function submitAmend(form) {
  const target = eventById(form.dataset.id);
  if (!target) return;
  const type = target.type === 'amend' ? target.of : target.type;
  const b = BUILD[type];
  const f = new FormData(form);
  const reason = String(f.get('reason') || '').trim();
  if (!reason) return toast('ใส่เหตุผลที่แก้ไขก่อน', 'warn');
  const inp = { ...target.input };
  for (const [k, v] of f) if (k !== 'reason') inp[k] = v;
  if (!can(b.key(inp))) return deny(b.key(inp), `แก้ไข${b.what}`);
  const info = editInfo(target);
  if (!info.ok) return toast(info.why, 'warn');
  const r = withoutEvent(target.id, () => b.build(inp, keepOf(target)));
  if (r.error) return toast(r.error, 'warn');
  const diff = Object.keys(inp).filter((k) => String(inp[k]) !== String(target.input[k])).map((k) => `${k} ${target.input[k] || '-'} เป็น ${inp[k] || '-'}`).join(', ');
  commit({ type: 'amend', of: type, target: target.id, input: inp, reason, before: target.summary, summary: `แก้ไข${b.what}: ${r.summary}${diff ? ` (${diff})` : ''}`, effects: r.effects });
  toast('บันทึกการแก้ไขแล้ว ฉบับเดิมเก็บไว้ในประวัติ');
  location.hash = '#/log?show=changed';
}
function submitVoid(form) {
  const target = eventById(form.dataset.id);
  if (!target) return;
  const reason = String(new FormData(form).get('reason') || '').trim();
  if (!reason) return toast('ใส่เหตุผลที่ลบก่อน', 'warn');
  const key = permKey(target);
  if (!can(key)) return deny(key, 'ลบรายการนี้');
  const info = editInfo(target);
  if (!info.ok) return toast(info.why, 'warn');
  commit({ type: 'void', target: target.id, reason, summary: `ลบ: ${target.summary}`, effects: {} });
  toast('ลบรายการแล้ว ยังดูได้ในประวัติพร้อมเหตุผล');
  location.hash = '#/log?show=changed';
}

// รับชำระ: กรอกจำนวนเงิน วันที่รับเงิน และเลขใบเสร็จ รับบางส่วนได้ ใบส่งของค้างยอดที่เหลือ (QA-034)
function recordPayment(invNo) {
  if (!can('payment')) return deny('payment', 'บันทึกรับชำระ');
  const v = S.invoices.find((x) => x.inv_no === invNo);
  if (!v || v.paid_date || owedOf(v) <= 0) return toast('ใบนี้ชำระครบแล้ว', 'warn');
  const owed = owedOf(v);
  const body = `<dl class="fields dlg-fields"><div><dt>ใบส่งของ</dt><dd class="mono dlg-big">${esc(invNo)}</dd></div><div><dt>ลูกค้า</dt><dd><strong>${esc(custName(v.customer_id))}</strong></dd></div>
      <div><dt>ยอดใบนี้</dt><dd>${esc(money(v.total))}</dd></div><div><dt>ค้างชำระ</dt><dd><strong>${esc(baht(owed))} บาท</strong>${paidOf(v) > 0 ? `<span class="sub-l">รับแล้ว ${esc(money(paidOf(v)))}</span>` : ''}</dd></div></dl>
    <label class="f">จำนวนเงินที่รับ (บาท)<input class="in" name="amount" type="number" min="0.01" step="0.01" max="${owed}" value="${owed}" required></label>
    <label class="f">วันที่รับเงิน<input class="in" name="date" type="date" value="${S.today}" min="${v.date}" max="${S.today}" required></label>
    <label class="f">เลขที่ใบเสร็จรับเงิน<input class="in" name="receipt" maxlength="30" required autofocus placeholder="เช่น บร 0123/2570"></label>
    <p class="dlg-note">รับน้อยกว่ายอดค้างได้ ใบส่งของจะค้างยอดที่เหลือ บันทึกแล้วลบได้จากประวัติการแก้ไขถ้าบันทึกผิด</p>`;
  openDialog({
    title: `รับชำระ ${invNo}`, body, ok: 'บันทึกรับชำระ',
    onOk: (fd) => guard(() => {
      const amount = Math.round(Number(fd.get('amount')) * 100) / 100;
      const date = String(fd.get('date') || '');
      const receipt = String(fd.get('receipt') || '').trim();
      if (!(amount > 0)) return 'ใส่จำนวนเงินที่รับ';
      if (amount > owed + 0.005) return `รับเกินยอดค้าง (ค้าง ${baht(owed)} บาท)`;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > S.today || date < v.date) return `วันที่รับเงินต้องอยู่ระหว่างวันที่ออกใบ ${thaiDate(v.date)} ถึงวันนี้`;
      if (!receipt) return 'ใส่เลขที่ใบเสร็จรับเงิน';
      const part = amount < owed - 0.005;
      const ev = commit({ type: 'payment', input: { inv: invNo, amount, date, receipt }, summary: `รับชำระ ${invNo} ${custName(v.customer_id)} ${money(amount)} ใบเสร็จ ${receipt}${part ? ` (บางส่วน ค้างอีก ${money(owed - amount)})` : ''}`, effects: { paid: [{ inv_no: invNo, amount, date, receipt }] } });
      showSlip('sales', { k: 'สำเนาใบรับชำระ', no: invNo, title: `${custName(v.customer_id)} ${money(amount)}`, lines: [`ใบเสร็จ ${receipt} รับเงิน ${thaiDate(date)} ครบกำหนด ${thaiDate(v.due_date)}`, part ? `รับบางส่วน ใบนี้ยังค้าง ${money(owed - amount)}` : 'ชำระครบแล้ว'], stamp: [part ? 'รับบางส่วน' : 'รับชำระแล้ว', part ? 'warn' : 'ok'], links: [['ลบรายการนี้ถ้าบันทึกผิด', `#/log?del=${ev.id}`]] });
      nav.route();
      return true;
    }),
  });
}

// ล้างข้อมูลทดลอง: เฉพาะหัวหน้ากลุ่มงาน และดาวน์โหลดสำรองให้ก่อนทุกครั้ง (QA-021)
function askReset() {
  if (!can('reset')) return deny('reset', 'ล้างข้อมูลทดลอง');
  openDialog({
    title: 'ล้างข้อมูลทดลองทั้งหมด', ok: 'ดาวน์โหลดสำรองแล้วล้าง', tone: 'crit',
    body: `<p>รายการที่ทดลองกรอกในเบราว์เซอร์นี้ ${num(S.events.length)} รายการจะหายจากหน้าจอ แล้วกลับไปใช้ข้อมูลจำลองตั้งต้น ระบบจะดาวน์โหลดไฟล์สำรอง (JSON) และประวัติการแก้ไข (CSV) ให้ก่อนล้าง</p>`,
    onOk: () => guard(() => {
      download(`ข้อมูลทดลอง-สำรองก่อนล้าง-${S.today}.json`, eventsJSON(), 'application/json');
      download(`ประวัติการแก้ไข-ก่อนล้าง-${S.today}.csv`, logCSV());
      resetEvents();
      slipState.slip = null;
      toast('ดาวน์โหลดสำรองแล้ว และกลับไปใช้ข้อมูลจำลองตั้งต้นแล้ว');
      route();
      return true;
    }),
  });
}
const logCSV = () => toCSV(S.events.map((x) => ({ ...x, user_name: staff(x.user).name, role: staff(x.user).role })), ['at', 'user', 'user_name', 'role', 'type', 'summary', 'reason', 'target']);

// ================= แถบด้านบน =================
function renderChrome(id) {
  const user = currentUser();
  const tabId = id === 'product' ? 'registers' : id === 'doc' ? 'docs' : id;
  const unread = unreadNotes().length;
  $('#tabs').innerHTML = ROOMS.map((r) => {
    const ok = canEnter(r, user.role);
    const n = ok ? roomAlerts(r.id).filter((a) => a.level === 'crit').length : 0;
    return `<a class="tab${ok ? '' : ' is-locked'}" href="#/${r.id}" ${r.id === tabId ? 'aria-current="page"' : ''}>${ok ? '' : I.lock}${esc(r.title)}${ok ? '' : '<span class="sr"> (ไม่มีสิทธิ์เข้า)</span>'}${n ? `<span class="count" title="วิกฤต ${n} เรื่อง"><span class="sr">วิกฤต </span>${n}<span class="sr"> เรื่อง</span></span>` : ''}</a>`;
  }).join('') + '<span class="tab-sep" aria-hidden="true"></span>'
    + TOOLS.map((t) => `<a class="tab tab-tool" href="#/${t.id}" ${t.id === tabId ? 'aria-current="page"' : ''}>${I[t.id] || ''}${esc(t.title)}${t.id === 'notes' && unread ? `<span class="count count-ink" title="ยังไม่ได้อ่าน ${unread} ฉบับ"><span class="sr">ยังไม่ได้อ่าน </span>${unread}</span>` : ''}</a>`).join('');
  $('#user').innerHTML = S.base.staff.map((s) => `<option value="${s.user_id}" ${s.user_id === S.user ? 'selected' : ''}>${esc(short(s.name))} ${esc(s.role)}</option>`).join('');
  $('#tabs [aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function viewLocked(room) {
  const user = currentUser();
  const people = S.base.staff.filter((s) => room.roles.includes(s.role));
  return `<div class="locked"><article class="coupon">
    <div class="stub">${svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>')}<span class="stub-k">ล็อกตามสิทธิ์</span><span class="stub-k">${room.roles.length} บทบาทเข้าได้</span></div>
    <div class="cbody"><h1 class="k-t" style="font-size:1.25rem;padding-right:110px">${room.id === 'overview' ? 'ภาพรวมโรงงาน' : `ห้องทำงาน${esc(room.title)}`}</h1>
      <p>ผู้ใช้ตอนนี้ ${esc(short(user.name))} ${esc(user.role)} ยังไม่มีสิทธิ์เข้าห้องนี้ ข้อมูล การกรอง และการแจ้งเตือนของห้องนี้แสดงเฉพาะผู้มีสิทธิ์</p>
      <div><div class="stub-k">เปิดได้เฉพาะ</div><div class="roles">${room.roles.map((r) => chip(r, 'ink')).join('')}</div></div>
      <div class="try">${people.map((s) => `<button type="button" class="btn btn-sm" data-act="become" data-user="${s.user_id}">ลองเป็น ${esc(short(s.name))} ${esc(s.role)}</button>`).join('')}</div>
    </div>${stamp('ไม่มีสิทธิ์เข้า', 'crit')}
  </article></div>`;
}

// ================= เส้นทางหน้า =================
// หน้ารายละเอียดงาน: เห็นได้เมื่อเข้าห้องของฝ่ายนั้นได้ เป็นผู้ถืองานในขั้นใดขั้นหนึ่ง หรือเป็นฝ่ายควบคุมคุณภาพที่ต้องตรวจบันทึกการผลิตก่อนปล่อยผ่าน
function viewJobGuarded(p) {
  const job = S.jobs.find((j) => j.job_id === p.get('id'));
  if (!job) return viewJob(p);
  const room = ROOMS.find((r) => r.id === (job.lane === 'ผลิต' ? 'prod' : 'process'));
  const role = currentUser().role;
  const owners = LANES[job.lane].stages.map((st) => staff(STAGE_OWNER[st]).role);
  const ok = ['overview', 'qc'].some((id) => canEnter(ROOMS.find((r) => r.id === id), role)) || canEnter(room, role) || owners.includes(role);
  return ok ? viewJob(p) : viewLocked(room);
}
const viewItemOrProduct = (p) => (isFG(S.items.get(p.get('code'))) ? viewProduct(p) : viewItem(p));
const VIEWS = { item: viewItemOrProduct, job: viewJobGuarded, overview: viewOverview, store: viewStore, process: viewLaneRoom, prod: viewLaneRoom, qc: viewQC, sales: viewSales, notes: viewNotes, docs: viewDocs, doc: viewDocs, registers: viewRegisters, product: viewProduct, trace: viewTrace, log: viewLog };
const TITLES = { product: 'ข้อมูลผลิตภัณฑ์', doc: 'เอกสาร', item: 'รายละเอียดรายการ', job: 'รายละเอียดงาน' };
let lastId = '';
function parseHash() {
  const m = location.hash.match(/^#\/([^?]*)\??(.*)$/);
  return { id: m ? m[1] : '', params: new URLSearchParams(m ? m[2] : '') };
}
function route() {
  const { id, params } = parseHash();
  const user = currentUser();
  if (!VIEWS[id]) { location.replace(`#/${homeRoom(user.role)}`); return; }
  if (slipState.slip && slipState.slip.shown) slipState.slip = null;
  const room = ROOMS.find((r) => r.id === id);
  renderChrome(id);
  const main = $('#main');
  document.body.classList.toggle('is-doc', id === 'doc');
  closeDialog();
  navVisit(location.hash);
  const view = room && !canEnter(room, user.role) ? viewLocked(room) : VIEWS[id](params, room);
  main.innerHTML = storeBanner() + (id === 'doc' ? '' : backBar()) + view;
  navTitle(main);
  if (slipState.slip) slipState.slip.shown = true;
  const title = room ? room.title : TITLES[id] || TOOLS.find((t) => t.id === id)?.title || '';
  document.title = `${title} | ระบบหลังบ้านโรงงานยาสมุนไพร (ข้อมูลจำลอง)`;
  if (id === 'notes') guard(() => afterNotes(params));
  const target = main.querySelector('[data-target], .kcard.is-target');
  if (target) target.scrollIntoView({ block: 'center', inline: 'center' });
  else if (id !== lastId) window.scrollTo(0, 0);
  if (id !== lastId) main.focus({ preventScroll: true });
  lastId = id;
  snapForms();
}
nav.route = route;
actions.submitNew = submitNew;
actions.guard = (fn) => guard(fn);

const HANDLERS = {
  click: { ...buyHandlers.click, ...registerHandlers.click, ...notesHandlers.click },
  submit: { ...buyHandlers.submit, ...registerHandlers.submit, ...notesHandlers.submit },
  change: { ...buyHandlers.change, ...registerHandlers.change },
};

// ---------- ความยาวข้อความ (QA-023) ----------
// ทุกช่องข้อความมีเพดาน: ช่องบรรทัดเดียว 300 ตัวอักษร ช่องข้อความยาว 5,000 ตัวอักษร (หรือตาม maxlength ของช่อง)
const TEXT_MAX = { input: 300, textarea: 5000 };
function tooLong(form) {
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    const isArea = el.tagName === 'TEXTAREA';
    if (!isArea && !(el.tagName === 'INPUT' && ['text', 'search', 'hidden'].includes(el.type))) continue;
    const max = Number(el.getAttribute('maxlength')) || (isArea ? TEXT_MAX.textarea : el.type === 'hidden' ? 2000 : TEXT_MAX.input);
    if (el.value.length > max) {
      const NAME_TH = { body: 'ข้อความ', subject: 'เรื่อง', reason: 'เหตุผล', note: 'หมายเหตุ', ref: 'อ้างถึงเลขที่', to: 'จ่ายให้', purpose: 'เหตุผลความจำเป็น', detail: 'รายละเอียด' };
      const label = (el.closest('label')?.childNodes[0]?.textContent || NAME_TH[el.name] || el.name).trim();
      if (el.type !== 'hidden') { el.setAttribute('aria-invalid', 'true'); el.focus(); }
      return `ช่อง${label} ยาว ${num(el.value.length)} ตัวอักษร เกินที่รับได้ ${num(max)} ตัวอักษร ตัดให้สั้นลงก่อนบันทึก`;
    }
  }
  return '';
}

// ---------- ปุ่มย้อนกลับไปหน้าที่เพิ่งมา (พี่ขอเพิ่ม 2026-11-06) ----------
// จำหน้าที่เปิดเรียงตามเวลาในแท็บนี้ เปลี่ยนแค่ตัวกรองหรือคำค้นถือเป็นหน้าเดิม กดย้อนกลับแล้วถอยทีละหน้า
const NAV_KEY = 'hfd-nav';
const FILTER_PARAMS = ['q', 'kind', 'lv', 'only', 'all', 'show', 'step', 'page', 'st', 'more', 'inv', 'r'];
let navStack = (() => { try { const a = JSON.parse(sessionStorage.getItem(NAV_KEY) || '[]'); return Array.isArray(a) ? a.slice(-50) : []; } catch { return []; } })();
let navBackTo = null;
const pageKey = (h) => { const m = String(h || '').match(/^#\/([^?]*)\??(.*)$/); if (!m) return String(h || ''); const x = new URLSearchParams(m[2]); for (const k of FILTER_PARAMS) x.delete(k); return `${m[1]}?${[...x].map(([k, v]) => `${k}=${v}`).sort().join('&')}`; };
function navVisit(hash) {
  const key = pageKey(hash);
  if (navBackTo && key === navBackTo) { while (navStack.length > 1 && navStack[navStack.length - 1].key !== key) navStack.pop(); }
  const top = navStack[navStack.length - 1];
  if (top && top.key === key) top.hash = hash; else navStack.push({ key, hash, title: '' });
  navBackTo = null;
  if (navStack.length > 50) navStack = navStack.slice(-50);
  nav.prev = navStack.length > 1 ? navStack[navStack.length - 2] : null;
}
function navTitle(main) {
  const top = navStack[navStack.length - 1];
  if (!top) return;
  const h1 = (main.querySelector('h1')?.textContent || document.title.split('|')[0]).replace(/^ห้องทำงาน/, '').replace(/\s+/g, ' ').trim();
  const tab = main.querySelector('.seg [aria-current="page"]')?.textContent.trim();
  top.title = `${h1.slice(0, 48)}${tab ? ` (${tab.replace(/\s*\(\d+\)$/, '')})` : ''}`;
  try { sessionStorage.setItem(NAV_KEY, JSON.stringify(navStack)); } catch { /* ไม่จำก็ใช้ได้ */ }
}
function goBack() {
  const prev = nav.prev;
  if (!prev) return;
  navBackTo = prev.key;
  if (location.hash === prev.hash) route(); else location.hash = prev.hash;
}

// ---------- ฟอร์มที่กรอกค้าง (QA-029) ----------
// จำค่าตอนวาดหน้า ถ้าจะออกจากหน้าโดยค่าเปลี่ยนแต่ยังไม่มีการบันทึก ให้ถามก่อน (ช่องเลือกรายการที่พาเปลี่ยนหน้าเองไม่นับ)
const ENTRY_FORMS = new Set(['receive', 'issue', 'job', 'qc', 'pr', 'amend', 'void', 'note', 'master', 'formula', 'maint', 'prodStatus']);
const formSnap = new WeakMap();
let snapEvents = 0;
const serial = (f) => JSON.stringify([...f.elements].filter((el) => el.name && !el.dataset.act && !['hidden', 'submit', 'button'].includes(el.type)).map((el) => [el.name, el.type === 'checkbox' ? el.checked : el.value]));
function snapForms() {
  snapEvents = S.events.length;
  for (const f of $('#main').querySelectorAll('form[data-form]')) if (ENTRY_FORMS.has(f.dataset.form)) formSnap.set(f, serial(f));
}
export function dirtyForm() {
  if (S.events.length !== snapEvents) return null;
  for (const f of $('#main').querySelectorAll('form[data-form]')) { const s0 = formSnap.get(f); if (s0 !== undefined && s0 !== serial(f)) return f; }
  return null;
}
const pageOf = (h) => { const m = String(h || '').match(/^#\/([^?]*)\??(.*)$/); return m ? `${m[1]}|${new URLSearchParams(m[2]).get('tab') || ''}` : ''; };

// ---------- แถบเตือนที่เก็บข้อมูล ----------
function sysAction(kind) {
  const b = S.store.broken;
  if (kind === 'download') return download(`ข้อมูลทดลอง-สำรอง-${S.today}.json`, b ? b.raw || '' : eventsJSON(), 'application/json');
  if (kind === 'salvage') { repairStore(true); toast(`กู้ ${num(S.events.length)} รายการแล้ว ข้อมูลเดิมเก็บสำเนาไว้ในเครื่อง`); return route(); }
  if (kind === 'restart') {
    openDialog({
      title: 'ล้างข้อมูลที่เสียแล้วเริ่มใหม่', ok: 'ล้างแล้วเริ่มใหม่', tone: 'crit',
      body: '<p>รายการที่ทดลองกรอกทั้งหมดจะหายจากหน้าจอ ระบบเก็บสำเนาข้อมูลเดิมไว้ในเครื่องถ้ายังมีที่ ควรกดดาวน์โหลดข้อมูลเดิมเก็บไว้ก่อน</p>',
      onOk: () => guard(() => { repairStore(false); toast('เริ่มใหม่จากข้อมูลจำลองตั้งต้นแล้ว'); route(); return true; }),
    });
  }
}

// ช่องตัวเลข: ข้อความเตือนภาษาไทยที่บอกชัดว่าต้องพิมพ์อย่างไร แทนข้อความของเบราว์เซอร์ (QA-030)
function numberMessage(el) {
  const v = el.validity;
  if (v.badInput || v.valueMissing) return 'ใส่จำนวนเป็นตัวเลขอารบิก เช่น 1000 ไม่ใส่จุลภาค และไม่ใช้เลขไทย';
  if (v.stepMismatch) return el.step === '1' ? 'หน่วยนี้นับเป็นชิ้น ใส่จำนวนเต็ม' : 'ทศนิยมเกินที่ช่องนี้รับได้';
  if (v.rangeUnderflow) return `ต้องไม่น้อยกว่า ${el.min}`;
  if (v.rangeOverflow) return `ต้องไม่เกิน ${el.max}`;
  return '';
}

function bind() {
  document.addEventListener('invalid', (e) => { const el = e.target; if (el instanceof HTMLInputElement && el.type === 'number') { el.setCustomValidity(''); const m = numberMessage(el); if (m) el.setCustomValidity(m); } }, true);
  document.addEventListener('input', (e) => { const el = e.target; if (el instanceof HTMLInputElement && el.type === 'number') el.setCustomValidity(''); if (el.getAttribute?.('aria-invalid') === 'true' && !el.dataset.act) el.removeAttribute('aria-invalid'); }, true);
  let curHash = location.hash;
  window.addEventListener('hashchange', () => {
    const next = location.hash;
    if (next === curHash) return;
    if (dirtyForm() && pageOf(next) !== pageOf(curHash)) {
      history.replaceState(null, '', curHash);
      openDialog({
        title: 'ยังไม่ได้บันทึก', ok: 'ออกโดยไม่บันทึก', tone: 'crit', cancel: 'อยู่ต่อ',
        body: '<p>ค่าที่กรอกในฟอร์มนี้ยังไม่ได้บันทึก ถ้าออกจากหน้านี้ค่าที่กรอกจะหาย</p>',
        onOk: () => { snapEvents = -1; curHash = next; history.pushState(null, '', next); route(); return true; },
      });
      return;
    }
    curHash = next;
    route();
  });
  window.addEventListener('beforeunload', (e) => { if (dirtyForm()) { e.preventDefault(); e.returnValue = ''; } });
  // แท็บอื่นบันทึก: วาดหน้าใหม่ด้วยข้อมูลล่าสุด ถ้ากรอกค้างอยู่ ไม่วาดทับ แค่บอก
  onExternalChange((n) => {
    if (n === 'broken' || !dirtyForm()) { route(); if (n !== 'broken' && n) toast(`มีการบันทึกจากแท็บอื่น ${num(n)} รายการ หน้าจออัปเดตแล้ว`); return; }
    toast('มีการบันทึกจากแท็บอื่น ข้อมูลอัปเดตแล้ว ค่าที่กรอกค้างยังอยู่ ตรวจอีกครั้งก่อนกดบันทึก', 'warn');
  });
  $('#user').addEventListener('change', (e) => {
    setUser(e.target.value);
    slipState.slip = null;
    const u = currentUser();
    toast(`เปลี่ยนผู้ใช้เป็น ${short(u.name)} ${u.role}`);
    const next = `#/${homeRoom(u.role)}`;
    if (location.hash === next) route(); else location.hash = next;
  });
  const main = $('#main');
  // กันดับเบิลคลิกและกดรัว (QA-002 QA-037): ปุ่มที่บันทึกข้อมูล คลิกที่สองของดับเบิลคลิก หรือคลิกซ้ำภายใน 0.6 วินาที ไม่นับ
  // หลังคลิกแรก หน้าจอวาดใหม่และการ์ดหรือแถวถัดไปอาจเลื่อนมาอยู่ใต้เมาส์พอดี คลิกที่สองจึงไปโดนรายการอื่น (คลิกจากแป้นพิมพ์ไม่โดนกัน)
  const COMMIT_ACTS = new Set(['move', 'release', 'pay', 'prStep', 'prReject', 'toggleActive', 'reset', 'become']);
  let lastTap = -1e9;
  main.addEventListener('click', (e) => {
    if (e.target.closest('[data-back]') && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); return goBack(); }
    const sys = e.target.closest('[data-sys]');
    if (sys) return guard(() => sysAction(sys.dataset.sys));
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT' || b.disabled) return;
    const act = b.dataset.act;
    if (COMMIT_ACTS.has(act) && e.detail > 0) {
      const now = performance.now();
      if (e.detail > 1 || now - lastTap < 600) { e.preventDefault(); return; }
      lastTap = now;
    }
    guard(() => clickAct(b, act, e));
  });
  function clickAct(b, act, e) {
    if (HANDLERS.click[act]) return HANDLERS.click[act](b, e);
    if (act === 'move') moveJob(b.dataset.job, Number(b.dataset.dir));
    if (act === 'release') askRelease(b.dataset.lot, b.dataset.res, document.getElementById(`rs-${b.dataset.lot}`)?.value.trim() || '');
    if (act === 'pay') recordPayment(b.dataset.inv);
    if (act === 'become') { setUser(b.dataset.user); toast(`เปลี่ยนผู้ใช้เป็น ${short(currentUser().name)} ${currentUser().role}`); route(); }
    if (act === 'slipClose') { slipState.slip = null; route(); }
    if (act === 'print') window.print();
    if (act === 'export') { download('lots-ข้อมูลจำลอง.csv', toCSV(S.lots, ['lot_no', 'item_code', 'qty_in', 'qty_left', 'date_in', 'exp_date', 'status', 'release_date', 'source', 'source_ref'])); download('moves-ข้อมูลจำลอง.csv', toCSV(S.moves, ['move_id', 'date', 'item_code', 'lot_no', 'type', 'qty', 'party', 'doc_no', 'user_id'])); }
    if (act === 'exportLog') download('ประวัติการแก้ไข-ข้อมูลจำลอง.csv', logCSV());
    if (act === 'reset') askReset();
  }
  main.addEventListener('change', (e) => {
    const t = e.target;
    const act = t.dataset.act;
    if (!act) return;
    if (HANDLERS.change[act]) return HANDLERS.change[act](t, e);
    const f = t.form;
    const code = codeOf(t.value);
    if (['pickItem', 'recvItem', 'issueItem', 'jobItem'].includes(act)) {
      const ok = t.list ? [...t.list.options].some((o) => codeOf(o.value) === code) : !!S.items.get(code);
      t.setAttribute('aria-invalid', ok ? 'false' : 'true');
      if (!ok) return toast(whyNotHere({ recvItem: 'receive', issueItem: 'issue', jobItem: 'job', pickItem: 'card' }[act], code), 'warn');
    }
    if (act === 'pickItem') setHash(f.dataset.to, { tab: f.dataset.tab, item: code });
    if (act === 'recvItem') setHash('store', { tab: 'receive', item: code });
    if (act === 'issueItem') setHash('store', { tab: 'issue', item: code });
    if (act === 'jobItem') setHash(f.dataset.room, { tab: 'new', item: code });
    if (act === 'jobQty') setHash(f.dataset.room, { tab: 'new', item: codeOf(f.item.value), qty: t.value });
  });
  main.addEventListener('input', (e) => {
    if (e.target.matches('[data-exp]')) { const o = e.target.closest('label')?.querySelector('[data-out="exp"]'); if (o) o.innerHTML = expText(e.target.value); }
    onSimInput(e);
  });
  main.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    guard(() => submitForm(form, e));
  });
  function submitForm(form, e) {
    const kind = form.dataset.form;
    const long = tooLong(form);
    if (long) return toast(long, 'warn');
    if (HANDLERS.submit[kind]) return HANDLERS.submit[kind](form, e);
    const f = new FormData(form);
    if (kind === 'receive') submitNew('receive', { item: codeOf(f.get('item')), po: f.get('po') || '', supplier: f.get('supplier'), qty: f.get('qty'), exp: f.get('exp') || '', close: f.get('close') ? '1' : '' });
    if (kind === 'issue') submitNew('issue', { item: codeOf(f.get('item')), qty: f.get('qty'), to: String(f.get('to') || '').trim() });
    if (kind === 'job') submitNew('job', { room: form.dataset.room, item: codeOf(f.get('item')), qty: f.get('qty') });
    if (kind === 'qc') submitNew('qcResult', { lot: form.dataset.lot, result: f.get('result'), note: String(f.get('note') || '').trim() });
    if (kind === 'amend') submitAmend(form);
    if (kind === 'void') submitVoid(form);
    if (kind === 'trace') setHash('trace', { lot: String(f.get('lot') || '').trim() });
    if (kind === 'filter') setHash('store', { tab: 'stock', kind: f.get('kind'), lv: f.get('lv'), q: String(f.get('q') || '').trim() });
    if (kind === 'pick') { const code = codeOf(f.get('item')); if (S.items.get(code)) setHash(form.dataset.to, { tab: form.dataset.tab, item: code }); }
    if (kind === 'boardSearch') { const x = new URLSearchParams(location.hash.split('?')[1] || ''); const q = String(f.get('q') || '').trim(); if (q) x.set('q', q); else x.delete('q'); x.delete('job'); location.hash = `#/${form.dataset.here}?${x}`; }
    if (kind === 'salesSearch') setHash('sales', { tab: 'sales', q: String(f.get('q') || '').trim() });
    if (kind === 'logSearch') setHash('log', { show: f.get('show') || '', q: String(f.get('q') || '').trim() });
    if (kind === 'arSearch') setHash('sales', { tab: 'ar', inv: String(f.get('inv') || '').trim() });
    if (kind === 'docOpen') { const o = { type: form.dataset.type }; for (const [k, v] of f) o[k] = v; setHash('doc', o); }
    if (kind === 'planSearch') setHash(form.dataset.room, { tab: 'plan', kind: f.get('kind'), q: String(f.get('q') || '').trim() });
    if (kind === 'fgSearch') setHash('sales', { tab: 'stock', q: String(f.get('q') || '').trim() });
  }
  // ลากวางการ์ดบนบอร์ด (ย้ายได้ทีละขั้น)
  let dragJob = null;
  const colOf = (e) => e.target.closest('[data-drop]');
  main.addEventListener('dragstart', (e) => { const c = e.target.closest('.kcard[draggable]'); if (c) { dragJob = c.dataset.job; e.dataTransfer.effectAllowed = 'move'; } });
  main.addEventListener('dragover', (e) => { const col = colOf(e); if (dragJob && col) { e.preventDefault(); col.classList.add('is-over'); } });
  main.addEventListener('dragleave', (e) => { const col = colOf(e); if (col && !col.contains(e.relatedTarget)) col.classList.remove('is-over'); });
  main.addEventListener('dragend', () => { dragJob = null; main.querySelectorAll('.is-over').forEach((x) => x.classList.remove('is-over')); });
  main.addEventListener('drop', (e) => {
    const col = colOf(e);
    if (!col || !dragJob) return;
    e.preventDefault();
    const card = D.board.find((c) => c.job.job_id === dragJob);
    dragJob = null;
    if (!card || card.job.lane !== col.dataset.lane) return toast('ย้ายข้ามฝ่ายไม่ได้', 'warn');
    const st = LANES[card.job.lane].stages;
    const diff = st.indexOf(col.dataset.drop) - st.indexOf(card.stage);
    if (diff === 0) return route();
    if (Math.abs(diff) !== 1) { toast('ย้ายได้ทีละขั้น ตามลำดับงานใน SOP', 'warn'); return route(); }
    moveJob(card.job.job_id, diff);
  });
}

async function start() {
  try {
    await loadAll();
  } catch (err) {
    $('#main').innerHTML = `<section class="panel"><h2>เปิดข้อมูลจำลองไม่ได้</h2><p>${esc(err.message)}</p><p class="note">ถ้าเปิดไฟล์จากเครื่องโดยตรง ให้เปิดผ่านเว็บเซิร์ฟเวอร์ เช่น python3 -m http.server</p></section>`;
    return;
  }
  bind();
  route();
}
start();
