// หน้าเว็บทั้งหมด หัวข้อยึดเอกสารของโรงงาน (ระเบียบ V8.9, SOP, FM)
import { CONFIG, LANES, CAN, REQ_FORM } from './config.js';
import { S, D, loadAll, commit, resetEvents, staff, currentUser, setUser, usable, round, nextLotNo, newMove, thaiDate, thaiLongDate, daysBetween, addDays, toCSV } from './data.js';
import { fefoPick } from './logic.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const INT_UNITS = new Set(['ใบ', 'หลอด', 'ขวด', 'เม็ด', 'ชุด', 'ผืน', 'ดวง', 'ลูก', 'กล่อง']);
const num = (n, d = 0) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d });
const num2 = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
function qty(code, q) { const it = S.items.get(code); const int = it && INT_UNITS.has(it.unit); return `${int ? num(q) : num2(q)} ${it ? it.unit : ''}`; }
const money = (n) => `${num(n)} บาท`;
const mill = (n) => (n / 1e6).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PAGES = [
  { id: 'overview', no: '01', title: 'ภาพรวมโรงงาน', render: viewOverview },
  { id: 'board', no: '02', title: 'บอร์ดงาน', render: viewBoard },
  { id: 'stock', no: '03', title: 'คลัง รับเข้า เบิกออก', render: viewStock },
  { id: 'purchase', no: '04', title: 'จัดซื้อ', render: viewPurchase },
  { id: 'qc', no: '05', title: 'ควบคุมคุณภาพ', render: viewQC },
  { id: 'sales', no: '06', title: 'ขาย ลูกหนี้', render: viewSales },
  { id: 'trace', no: '07', title: 'ไล่ย้อนล็อต', render: viewTrace },
  { id: 'log', no: '08', title: 'ประวัติการแก้ไข', render: viewLog },
];

// ---------- ชิ้นส่วนที่ใช้ซ้ำ ----------
const ICON = {
  crit: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>',
  warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 22 20H2Z"/><path d="M12 9v5M12 17v.5"/></svg>',
  ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 10 17 19 7"/></svg>',
};
const LEVEL_TEXT = { crit: 'วิกฤต', warn: 'เฝ้าระวัง', ok: 'ปกติ' };
const chip = (level, text = LEVEL_TEXT[level]) => `<span class="chip chip-${level}${level === 'crit' ? ' blink' : ''}">${ICON[level]}${esc(text)}</span>`;
const TAG_CLASS = { 'รอปล่อยผ่าน': 'hold', 'ตรวจสอบแล้ว': 'pass', 'ไม่ผ่าน': 'fail', 'หมดอายุ': 'exp' };
const tag = (status) => `<span class="tag tag-${TAG_CLASS[status] || 'exp'}"><i aria-hidden="true"></i>${esc(status)}</span>`;
const avatar = (u) => `<span class="avatar" aria-hidden="true">${esc((u.name || '?').replace(/[เแโใไ]/, '').charAt(0))}</span>`;
const tableWrap = (inner) => `<div class="table-wrap">${inner}</div>`;

function toast(msg, level = 'ok') {
  const box = $('#toast');
  const el = document.createElement('div');
  el.className = `toast toast-${level}`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 5200);
}
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- หัวกระดาษและเมนู ----------
function renderChrome(page) {
  $('#sheet-name').textContent = `${page.no} ${page.title}`;
  $('#sheet-date').textContent = thaiLongDate(S.today);
  $('#nav').innerHTML = PAGES.map((p) => `<a href="#/${p.id}" ${p.id === page.id ? 'aria-current="page"' : ''}><span class="mono">${p.no}</span>${esc(p.title)}</a>`).join('');
  const sel = $('#user');
  sel.innerHTML = S.base.staff.map((s) => `<option value="${s.user_id}" ${s.user_id === S.user ? 'selected' : ''}>${esc(s.name)} ${esc(s.role)}</option>`).join('');
  document.title = `${page.title} | ระบบหลังบ้านโรงงานยาสมุนไพร (ข้อมูลจำลอง)`;
}

function route() {
  const [, id = 'overview', qs = ''] = location.hash.match(/^#\/([^?]*)\??(.*)$/) || [];
  const page = PAGES.find((p) => p.id === id) || PAGES[0];
  const params = new URLSearchParams(qs);
  renderChrome(page);
  $('#main').innerHTML = page.render(params);
  $('#main').focus({ preventScroll: true });
}

// ---------- 01 ภาพรวมโรงงาน ----------
function monthSales() {
  const months = [];
  const [y, m] = S.today.split('-').map(Number);
  for (let i = 12; i >= 1; i--) {
    const dt = new Date(Date.UTC(y, m - 1 - i, 1));
    months.push(dt.toISOString().slice(0, 7));
  }
  const sum = new Map(months.map((k) => [k, 0]));
  for (const v of S.base.invoices) { const k = v.date.slice(0, 7); if (sum.has(k)) sum.set(k, sum.get(k) + v.total); }
  return months.map((k) => ({ month: k, total: sum.get(k) }));
}
function arAging() {
  const b = [0, 0, 0, 0];
  let overdue = 0, total = 0;
  for (const v of S.base.invoices) {
    if (v.paid_date) continue;
    const age = daysBetween(v.date, S.today);
    b[age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3] += v.total;
    total += v.total;
    if (v.due_date < S.today) overdue += v.total;
  }
  return { b, total, overdue };
}
const TH_MONTH = new Intl.DateTimeFormat('th-TH', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const monthLabel = (ym) => TH_MONTH.format(new Date(`${ym}-01T00:00:00Z`));

function salesBars(ms) {
  const max = Math.max(...ms.map((x) => x.total), 1);
  return `<div class="bars" role="img" aria-label="ยอดขายรายเดือน 12 เดือน ล่าสุด ${monthLabel(ms[ms.length - 1].month)} ${mill(ms[ms.length - 1].total)} ล้านบาท">${ms.map((x, i) => `<div class="bar${i === ms.length - 1 ? ' bar-now' : ''}" style="height:${Math.max(4, Math.round((x.total / max) * 100))}%" title="${monthLabel(x.month)} ${mill(x.total)} ล้านบาท"></div>`).join('')}</div>
  <div class="bars-axis mono"><span>${monthLabel(ms[0].month)}</span><span>${monthLabel(ms[6].month)}</span><span class="strong">${monthLabel(ms[ms.length - 1].month)} = ${mill(ms[ms.length - 1].total)} ล้าน</span></div>`;
}
function agingBar(ar) {
  const labels = ['0 ถึง 30 วัน', '31 ถึง 60 วัน', '61 ถึง 90 วัน', 'เกิน 90 วัน'];
  return `<div class="aging" role="img" aria-label="ลูกหนี้ตามอายุหนี้ ${labels.map((l, i) => `${l} ${mill(ar.b[i])} ล้าน`).join(' ')}">${ar.b.map((v, i) => `<div class="seg seg-${i}" style="flex:${Math.max(v, 0.0001)} 1 0" title="${labels[i]} ${mill(v)} ล้านบาท"></div>`).join('')}</div>
  <div class="aging-legend">${labels.map((l, i) => `<span><i class="sw seg-${i}"></i>${l} ${mill(ar.b[i])}</span>`).join('')}</div>`;
}

function keyStockoutDays() {
  const [y, m] = S.today.split('-').map(Number);
  const fyStart = `${m >= 10 ? y : y - 1}-10-01`;
  const keys = new Set([...S.items.values()].filter((i) => i.key === 'Y' && i.lane === 'ผลิต').map((i) => i.code));
  return new Set(S.base.shortages.filter((s) => s.date >= fyStart && s.date <= S.today && keys.has(s.item_code)).map((s) => s.date)).size;
}

function schematic() {
  const n = (lane, st) => D.board.filter((c) => c.job.lane === lane && c.stage === st).length;
  const s1 = n('แปรรูป', 'ตรวจรับ');
  const s2 = n('แปรรูป', 'คัดแยก ล้าง');
  const s3 = n('แปรรูป', 'ตาก อบ') + n('แปรรูป', 'ลดขนาด บดร่อน');
  const s4 = D.qcQueue.length;
  const qcLate = D.qcQueue.some((q) => q.waiting > CONFIG.qcWaitWarnDays);
  const s5 = S.lots.filter(usable).length;
  const exp = D.expiries.length;
  const s6 = D.board.filter((c) => c.job.lane === 'ผลิต' && ['จ่ายบันทึกการผลิต', 'เบิกวัตถุดิบ', 'ผลิต', 'บรรจุ'].includes(c.stage)).length;
  const blockedCard = D.board.find((c) => c.blocked);
  const s7 = S.base.invoices.filter((v) => daysBetween(v.date, S.today) < 7 && v.date <= S.today).length;
  let feeder = '';
  if (blockedCard) {
    const it = [...S.items.values()].find((x) => x.name === blockedCard.blocked);
    const st = it && D.itemStats.get(it.code);
    const sup = it && S.base.suppliers.find((s) => s.supplier_id === it.supplier_id);
    const days = st && Number.isFinite(st.cover) ? Math.max(0, Math.floor(st.cover)) : 0;
    feeder = `<path d="M 500 344 L 500 306" class="pipe-crit-outer"/><path d="M 500 344 L 500 306" class="pipe-inner"/><path class="flowcrit" d="M 500 344 L 500 312" marker-end="url(#hc)" style="fill:none;stroke:var(--crit);stroke-width:2.4"/>
    <rect x="425" y="344" width="150" height="52" class="box box-dash-crit"/><text x="500" y="366" text-anchor="middle" class="t-name">${esc(sup ? `ผู้ขาย${it.name.split(' ')[0]}` : 'ผู้ขาย')}</text>
    <text x="500" y="385" text-anchor="middle" class="t-mono t-crit">ส่งเฉลี่ย ${st ? Math.round(st.lt.L) : '-'} วัน</text>
    <g class="blink"><rect x="586" y="350" width="118" height="28" class="fill-crit-solid"/><text x="645" y="369" text-anchor="middle" class="t-on-crit">ขาดใน ${days} วัน</text></g>`;
  }
  const box = (x, y, w, code, name, count, unit, level = '') => `<rect x="${x}" y="${y}" width="${w}" height="76" class="box ${level ? `box-${level}` : ''}"/>
    <text x="${x + 8}" y="${y + 16}" class="t-code">${code}</text>${name}
    <text x="${x + w - 8}" y="${y + 68}" text-anchor="end" class="t-mono ${level ? `t-${level}` : 't-ok'}">${count} ${unit}</text>`;
  const nm = (x, y, t) => `<text x="${x}" y="${y}" text-anchor="middle" class="t-name">${t}</text>`;
  return `<svg viewBox="0 0 820 420" role="img" aria-label="ผังกระบวนการผลิต 7 สถานี ${blockedCard ? `งานผลิตหยุดรอ${esc(blockedCard.blocked)}` : 'ไม่มีงานหยุด'}" class="schematic">
  <defs><marker id="hb" orient="auto" markerWidth="6" markerHeight="6" refX="2" refY="3" overflow="visible"><path d="M0 0 L6 3 L0 6 Z" class="head-ok"/></marker>
  <marker id="hc" orient="auto" markerWidth="6" markerHeight="6" refX="2" refY="3" overflow="visible"><path d="M0 0 L6 3 L0 6 Z" class="head-crit"/></marker></defs>
  <g class="pipe-outer"><path d="M 130 98 L 170 98"/><path d="M 300 98 L 340 98"/><path d="M 470 98 L 510 98"/><path d="M 640 98 L 680 98"/><path d="M 740 136 L 740 230"/><path d="M 680 268 L 575 268"/><path d="M 425 268 L 300 268"/></g>
  <g class="pipe-inner-g"><path d="M 130 98 L 170 98"/><path d="M 300 98 L 340 98"/><path d="M 470 98 L 510 98"/><path d="M 640 98 L 680 98"/><path d="M 740 136 L 740 230"/><path d="M 680 268 L 575 268"/><path d="M 425 268 L 300 268"/></g>
  <g class="flow-g"><path class="flow" d="M 130 98 L 164 98" marker-end="url(#hb)"/><path class="flow" d="M 300 98 L 334 98" marker-end="url(#hb)"/><path class="flow" d="M 470 98 L 504 98" marker-end="url(#hb)"/><path class="flow" d="M 640 98 L 674 98" marker-end="url(#hb)"/><path class="flow" d="M 740 136 L 740 224" marker-end="url(#hb)"/><path class="flow" d="M 680 268 L 581 268" marker-end="url(#hb)"/><path class="flow" d="M 425 268 L 306 268" marker-end="url(#hb)"/></g>
  ${feeder}
  <rect x="20" y="70" width="110" height="56" class="box box-dash"/>${nm(75, 96, 'เกษตรกร')}<text x="75" y="114" text-anchor="middle" class="t-mono t-muted">${S.base.suppliers.filter((s) => s.type === 'เกษตรกร').length} กลุ่ม</text>
  ${box(170, 60, 130, 'ST-01', nm(235, 104, 'รับวัตถุดิบสด'), s1, 'งาน')}
  ${box(340, 60, 130, 'ST-02', nm(405, 104, 'คัดแยก ล้าง'), s2, 'งาน')}
  ${box(510, 60, 130, 'ST-03', nm(575, 104, 'ตาก อบ บด'), s3, 'งาน')}
  ${box(680, 60, 120, 'ST-04', nm(740, 96, 'รอปล่อยผ่าน') + nm(740, 113, '(QC)'), s4, 'ล็อต', qcLate ? 'warn' : '')}
  ${box(680, 230, 120, 'ST-05', nm(740, 274, 'คลัง'), s5, 'ล็อต', exp ? 'warn' : '')}
  ${exp ? `<rect x="680" y="316" width="120" height="24" class="fill-warn-soft"/><text x="740" y="333" text-anchor="middle" class="t-warn-dark">ใกล้หมดอายุ ${exp}</text>` : ''}
  ${blockedCard ? '<rect class="blink box-dash-crit" x="419" y="224" width="162" height="88" style="fill:none"/>' : ''}
  ${box(425, 230, 150, 'ST-06', nm(500, 274, 'ผลิต บรรจุ'), s6, 'งาน', blockedCard ? 'crit' : '')}
  ${box(170, 230, 130, 'ST-07', nm(235, 274, 'จ่ายออก'), s7, 'ใบส่งของ')}
  </svg>`;
}

function alertCard(a, compact = false) {
  const go = { supply: 'purchase', reorder: 'purchase', expiry: 'stock', qc: 'qc', blocked: 'board' }[a.kind];
  let tl = '';
  if (a.timeline && a.timeline.stockout) {
    const t0 = a.timeline.order, t1 = a.timeline.expected;
    const span = Math.max(1, daysBetween(t0, t1));
    const pct = (d) => Math.min(100, Math.max(0, (daysBetween(t0, d) / span) * 100));
    const so = pct(a.timeline.stockout), now = pct(S.today);
    tl = `<div class="timeline" role="img" aria-label="สั่ง ${thaiDate(t0)} วันนี้ ${thaiDate(S.today)} ของหมด ${thaiDate(a.timeline.stockout)} คาดถึง ${thaiDate(t1)}">
      <div class="tl-track"></div><div class="tl-ok" style="width:${so}%"></div>${so < 100 ? `<div class="tl-late blink" style="left:${so}%"></div>` : ''}
      <div class="tl-now" style="left:${now}%"></div>
      <span class="tl-l mono">${thaiDate(t0)}</span><span class="tl-n mono" style="left:${Math.min(now, 80)}%">วันนี้</span><span class="tl-r mono">หมด ${thaiDate(a.timeline.stockout)} ถึง ${thaiDate(t1)}</span></div>`;
  }
  return `<article class="alert alert-${a.level}">
    <div class="alert-head">${chip(a.level)}<span class="muted small">${esc(a.topic)}</span></div>
    <div class="alert-title">${esc(a.title)}</div>
    ${compact ? '' : `<div class="small sec">${esc(a.detail)}</div>`}${compact ? '' : tl}
    <div class="row-wrap"><a class="btn ${a.level === 'crit' ? 'btn-crit' : 'btn-line'}" href="#/${go}">${esc(a.action)}</a></div>
  </article>`;
}

function viewOverview() {
  const active = S.jobs.filter((j) => ['waiting', 'running', 'qc'].includes(j.status));
  const qcLate = D.qcQueue.filter((q) => q.waiting > CONFIG.qcWaitWarnDays).length;
  const inv = [...D.itemStats.values()].filter((s) => s.level !== 'ok');
  const invCrit = inv.filter((s) => s.level === 'crit').length;
  const ms = monthSales();
  const last = ms[ms.length - 1], prev = ms[ms.length - 2];
  const ar = arAging();
  const ksd = keyStockoutDays();
  const crit = D.alerts.filter((a) => a.level === 'crit').length;
  const warn = D.alerts.filter((a) => a.level === 'warn').length;
  const stageStrip = (lane) => LANES[lane].stages.map((st) => `<li><span class="mono">${D.board.filter((c) => c.job.lane === lane && c.stage === st).length}</span>${esc(st)}</li>`).join('');
  return `
  <div class="lead"><h1>วันนี้มี <span class="t-crit-text">${crit} เรื่องวิกฤต</span> และ ${warn} เรื่องเฝ้าระวัง</h1></div>
  <section class="tiles" aria-label="ตัวเลขสำคัญ">
    <div class="tile"><div class="tile-h"><span>งานในสายผลิต</span><span class="mono">K-01</span></div><div class="tile-n"><span class="mono">${active.length}</span><span>งาน</span></div><div class="small muted">แปรรูป ${active.filter((j) => j.lane === 'แปรรูป').length} ผลิต ${active.filter((j) => j.lane === 'ผลิต').length}</div></div>
    <div class="tile ${qcLate ? 'tile-warn' : ''}"><div class="tile-h"><span>รอปล่อยผ่าน</span><span class="mono">K-02</span></div><div class="tile-n"><span class="mono">${D.qcQueue.length}</span><span>ล็อต</span></div>${qcLate ? chip('warn', `เกิน ${CONFIG.qcWaitWarnDays} วัน ${qcLate} ล็อต`) : '<div class="small muted">ไม่มีล็อตค้างนาน</div>'}</div>
    <div class="tile ${invCrit ? 'tile-crit' : ''}"><div class="tile-h"><span>ของถึงจุดสั่งซื้อ</span><span class="mono">K-03</span></div><div class="tile-n"><span class="mono">${inv.length}</span><span>รายการ</span></div>${invCrit ? chip('crit', `วิกฤต ${invCrit} รายการ`) : '<div class="small muted">ไม่มีรายการวิกฤต</div>'}</div>
    <div class="tile"><div class="tile-h"><span>ยอดขาย ${monthLabel(last.month)}</span><span class="mono">K-04</span></div><div class="tile-n"><span class="mono">${mill(last.total)}</span><span>ล้านบาท</span></div><div class="small muted">${prev.total ? `${last.total >= prev.total ? 'เพิ่ม' : 'ลด'} ${num(Math.abs((last.total / prev.total - 1) * 100))}% จาก ${monthLabel(prev.month)}` : ''}</div></div>
    <div class="tile"><div class="tile-h"><span>ลูกหนี้ค้างชำระ</span><span class="mono">K-05</span></div><div class="tile-n"><span class="mono">${mill(ar.total)}</span><span>ล้านบาท</span></div><div class="small muted">เกินกำหนดชำระ ${mill(ar.overdue)} ล้าน</div></div>
    <div class="tile"><div class="tile-h"><span>วันที่สินค้าหลักขาดสต็อก</span><span class="mono">K-06</span></div><div class="tile-n"><span class="mono">${ksd}</span><span>วัน</span></div><div class="small muted">ปีงบนี้ ตัวชี้วัด 2.1 ของ HC07</div></div>
  </section>
  <div class="cols">
    <section class="panel panel-2" aria-label="ผังกระบวนการผลิต">
      <div class="panel-h"><h2>ผังกระบวนการ วัตถุดิบถึงยา</h2><span class="mono muted small">DWG 01-A ข้อมูล ณ ${thaiDate(S.today)}</span></div>
      ${schematic()}
      <div class="strips"><div><div class="small muted">ฝ่ายแปรรูปสมุนไพร</div><ol class="strip">${stageStrip('แปรรูป')}</ol></div><div><div class="small muted">ฝ่ายผลิต</div><ol class="strip">${stageStrip('ผลิต')}</ol></div></div>
    </section>
    <section class="panel panel-1" aria-label="แจ้งเตือนอัจฉริยะ">
      <div class="panel-h"><h2>หมายเหตุแจ้งเตือน</h2><span class="mono muted small">${D.alerts.length} เรื่อง</span></div>
      ${D.alerts.slice(0, 4).map((a) => alertCard(a)).join('') || '<p class="muted">ไม่มีเรื่องต้องดูวันนี้</p>'}
      ${D.alerts.length > 4 ? `<details class="more"><summary>ดูอีก ${D.alerts.length - 4} เรื่อง</summary>${D.alerts.slice(4).map((a) => alertCard(a, true)).join('')}</details>` : ''}
    </section>
  </div>
  <div class="cols">
    <section class="panel panel-2" aria-label="งานเด่นบนบอร์ด">
      <div class="panel-h"><h2>บอร์ดงาน งานอยู่ขั้นไหน ในมือใคร</h2><a href="#/board">เปิดบอร์ดเต็ม</a></div>
      <div class="mini-cards">${D.board.slice().sort((a, b) => (b.blocked ? 1 : 0) - (a.blocked ? 1 : 0) || b.days - a.days).slice(0, 5).map((c) => cardHTML(c, true)).join('')}</div>
    </section>
    <section class="panel panel-1" aria-label="ขายและลูกหนี้">
      <div class="panel-h"><h2>ขายและลูกหนี้</h2><a href="#/sales">ดูรายลูกค้า</a></div>
      <div class="small muted">ยอดขายรายเดือน (ล้านบาท)</div>${salesBars(ms)}
      <div class="small muted" style="margin-top:12px">ลูกหนี้ค้างตามอายุหนี้ รวม ${mill(ar.total)} ล้านบาท</div>${agingBar(ar)}
    </section>
  </div>`;
}

// ---------- 02 บอร์ดงาน ----------
function cardHTML(c, mini = false) {
  const lane = LANES[c.job.lane];
  const idx = lane.stages.indexOf(c.stage);
  const lot = c.job.out_lot ? `<span class="mono small">${esc(c.job.out_lot)}</span>` : `<span class="mono small muted">${esc(c.job.job_id)}</span>`;
  const level = c.blocked ? 'crit' : c.stage === 'รอปล่อยผ่าน' && c.days > CONFIG.qcWaitWarnDays ? 'warn' : '';
  return `<div class="card ${level ? `card-${level}` : ''}" ${mini ? '' : `draggable="true" data-job="${esc(c.job.job_id)}"`}>
    ${mini ? `<div class="small muted">${esc(c.stage)}</div>` : ''}
    <div class="card-t">${esc(c.it.name)}</div>
    <div class="row-sb">${lot}<span class="small">${qty(c.it.code, c.job.qty)}</span></div>
    ${c.blocked ? `<div class="small t-crit-text blink strong">หยุด รอ${esc(c.blocked)}</div>` : ''}
    <div class="row-sb"><span class="who">${avatar(c.owner)}<span class="small">${esc(c.owner.name.replace(' (สมมุติ)', ''))}<br><span class="muted">${esc(c.owner.role)}</span></span></span><span class="small ${level === 'warn' ? 't-warn-dark strong' : 'muted'}">${c.days} วัน</span></div>
    ${mini ? '' : `<div class="card-act"><button type="button" class="btn-ico" data-act="move" data-job="${esc(c.job.job_id)}" data-dir="-1" ${idx <= 0 ? 'disabled' : ''} aria-label="ย้อนไปขั้นก่อนหน้า">‹</button><button type="button" class="btn-ico" data-act="move" data-job="${esc(c.job.job_id)}" data-dir="1" ${idx >= lane.stages.length - 1 ? 'disabled' : ''} aria-label="ไปขั้นถัดไป">›</button></div>`}
  </div>`;
}

function viewBoard(params) {
  const show = params.get('lane') || 'all';
  const lanes = Object.entries(LANES).filter(([k]) => show === 'all' || show === k);
  const user = currentUser();
  return `
  <div class="lead"><h1>บอร์ดงาน</h1><p class="muted">ย้ายการ์ดได้ทีละขั้นด้วยปุ่มลูกศรหรือลากวาง ผู้ใช้ตอนนี้: <strong>${esc(user.name)}</strong> ${esc(user.role)} ขั้น "ตรวจสอบแล้ว" ย้ายได้เฉพาะหัวหน้าฝ่ายควบคุมคุณภาพ (SOP-QC-06, SOP-QC-07)</p></div>
  <div class="seg-ctl" role="group" aria-label="เลือกฝ่าย">${[['all', 'ทุกฝ่าย'], ['แปรรูป', 'ฝ่ายแปรรูปสมุนไพร'], ['ผลิต', 'ฝ่ายผลิต']].map(([k, t]) => `<a href="#/board?lane=${encodeURIComponent(k)}" ${show === k ? 'aria-current="true"' : ''}>${t}</a>`).join('')}</div>
  ${lanes.map(([k, lane]) => `
    <section class="panel lane" aria-label="${esc(lane.title)}">
      <div class="panel-h"><h2>${esc(lane.title)}</h2><span class="small muted">${D.board.filter((c) => c.job.lane === k).length} งาน</span></div>
      <div class="kanban">${lane.stages.map((st) => {
        const cards = D.board.filter((c) => c.job.lane === k && c.stage === st);
        return `<div class="col" data-drop="${esc(st)}" data-lane="${esc(k)}"><div class="col-h"><span class="strong">${esc(st)}</span><span class="mono small">${cards.length}</span></div><div class="small muted">${esc(lane.sop[st])}</div>${cards.map((c) => cardHTML(c)).join('') || '<div class="empty small muted">ไม่มีงาน</div>'}</div>`;
      }).join('')}</div>
    </section>`).join('')}`;
}

function moveJob(jobId, dir) {
  const card = D.board.find((c) => c.job.job_id === jobId);
  if (!card) return;
  const lane = LANES[card.job.lane];
  const idx = lane.stages.indexOf(card.stage);
  const to = lane.stages[idx + dir];
  if (!to) return;
  if (dir < 0 && (card.stage === 'รอปล่อยผ่าน' || card.stage === 'ตรวจสอบแล้ว')) return toast('งานที่ส่งตรวจแล้วย้อนกลับจากบอร์ดไม่ได้ ใช้หน้าควบคุมคุณภาพแทน', 'warn');
  if (to === 'ตรวจสอบแล้ว') return releaseLot(card.job.out_lot, 'ผ่าน', '');
  const user = currentUser();
  const movers = CAN[`move${card.job.lane}`];
  if (!movers.includes(user.role)) return toast(`การ์ด${lane.title}ย้ายได้เฉพาะ ${movers.join(' หรือ ')} เปลี่ยนผู้ใช้ที่มุมขวาบน`, 'warn');
  const job = card.job;
  const fx = { stage: [{ job_id: jobId, stage: to }] };
  let summary = `ย้าย ${jobId} ${card.it.name} จาก "${card.stage}" ไป "${to}"`;
  if (job.status === 'waiting' && dir > 0) {
    const needs = S.base.bom.filter((b) => b.out_item === job.item_code).map((b) => ({ code: b.in_item, q: round(b.in_item, b.qty_per_unit * job.qty) }));
    for (const n of needs) {
      const have = (S.lotsByItem.get(n.code) || []).filter(usable).reduce((s, l) => s + l.qty_left, 0);
      if (have + 1e-9 < n.q) return toast(`วัตถุดิบไม่พอ: ${S.items.get(n.code).name} มี ${qty(n.code, have)} ต้องใช้ ${qty(n.code, n.q)}`, 'crit');
    }
    fx.moves = []; fx.inputs = [];
    for (const n of needs) {
      const { picks } = fefoPick((S.lotsByItem.get(n.code) || []).filter(usable), n.q);
      for (const p of picks) {
        const q = round(n.code, p.qty);
        fx.moves.push(newMove({ item_code: n.code, lot_no: p.lot_no, type: 'จ่าย', qty: q, party: `งานผลิต ${jobId}`, doc_no: REQ_FORM[S.items.get(n.code).kind] || 'FM-28' }));
        fx.inputs.push({ job_id: jobId, lot_no: p.lot_no, item_code: n.code, qty: q });
      }
    }
    fx.jobs = [{ job_id: jobId, patch: { status: 'running', start_date: S.today, end_date: addDays(S.today, 3), wait_reason: '' } }];
    summary += ` เบิกวัตถุดิบตามสูตร ${needs.length} รายการ แบบ FEFO`;
  }
  if (to === 'รอปล่อยผ่าน' && !job.out_lot) {
    const it = S.items.get(job.item_code);
    const lotNo = nextLotNo(job.item_code);
    fx.lots = [{ lot_no: lotNo, item_code: job.item_code, qty_in: job.qty, date_in: S.today, exp_date: it.shelf_days ? addDays(S.today, it.shelf_days) : '', status: 'รอปล่อยผ่าน', release_date: '', source: 'ผลิต', source_ref: jobId }];
    fx.moves = [...(fx.moves || []), newMove({ item_code: job.item_code, lot_no: lotNo, type: 'รับ', qty: job.qty, party: lane.title, doc_no: `บันทึกการผลิต ${jobId}` })];
    fx.jobs = [{ job_id: jobId, patch: { status: 'qc', out_lot: lotNo, end_date: S.today } }];
    summary += ` ออกเลขที่ผลิต ${lotNo} ติดป้ายรอปล่อยผ่าน`;
  }
  commit({ type: 'stage', summary, effects: fx });
  toast(summary);
  route();
}

function releaseLot(lotNo, result, reason) {
  const user = currentUser();
  if (!CAN.release.includes(user.role)) return toast('ปล่อยผ่านหรือไม่ผ่านได้เฉพาะหัวหน้าฝ่ายควบคุมคุณภาพ (SOP-QC-06, SOP-QC-07, ระเบียบ V8.9 ข้อ 89) เปลี่ยนผู้ใช้ที่มุมขวาบน', 'warn');
  const lot = S.lotMap.get(lotNo);
  if (!lot || lot.status !== 'รอปล่อยผ่าน') return toast('ล็อตนี้ไม่ได้อยู่ในสถานะรอปล่อยผ่าน', 'warn');
  if (result === 'ไม่ผ่าน' && !reason) return toast('ใส่เหตุผลที่ไม่ผ่านก่อน', 'warn');
  const it = S.items.get(lot.item_code);
  const fx = {
    status: [{ lot_no: lotNo, status: result === 'ผ่าน' ? 'ตรวจสอบแล้ว' : 'ไม่ผ่าน', release_date: S.today }],
    releases: [{ date: S.today, lot_no: lotNo, item_code: lot.item_code, result, checker_id: 'U04', approver_id: S.user, note: reason || '' }],
  };
  const job = S.jobs.find((j) => j.out_lot === lotNo);
  if (job) { fx.jobs = [{ job_id: job.job_id, patch: { status: 'done', release_date: S.today } }]; fx.stage = [{ job_id: job.job_id, stage: 'ตรวจสอบแล้ว' }]; }
  const summary = `${result === 'ผ่าน' ? 'ปล่อยผ่าน เปลี่ยนป้ายเป็นตรวจสอบแล้ว' : 'ไม่ผ่าน แยกเก็บ'} ล็อต ${lotNo} ${it.name}`;
  commit({ type: 'release', summary, reason, effects: fx });
  toast(summary, result === 'ผ่าน' ? 'ok' : 'warn');
  route();
}

// ---------- 03 คลัง ----------
function viewStock(params) {
  const tab = params.get('tab') || 'list';
  const tabs = [['list', 'คงคลัง'], ['card', 'บัตรคุมวัสดุ FM-02'], ['receive', 'รับเข้า FM-01'], ['issue', 'เบิกออก ใบเบิก']];
  const nav = `<div class="seg-ctl" role="tablist" aria-label="งานคลัง">${tabs.map(([k, t]) => `<a role="tab" href="#/stock?tab=${k}" ${tab === k ? 'aria-current="true" aria-selected="true"' : 'aria-selected="false"'}>${t}</a>`).join('')}</div>`;
  let body = '';
  if (tab === 'list') body = stockList(params);
  if (tab === 'card') body = stockCard(params);
  if (tab === 'receive') body = receiveForm(params);
  if (tab === 'issue') body = issueForm(params);
  return `<div class="lead"><h1>คลัง รับเข้า เบิกออก</h1><p class="muted">ฝ่ายจัดซื้อและคลัง ของทุกล็อตที่รับเข้าหรือผลิตเสร็จติดป้ายรอปล่อยผ่านทันที (ระเบียบ V8.9 ข้อ 77) เบิกได้เฉพาะของที่ตรวจสอบแล้ว เรียงจากวันหมดอายุก่อน (FEFO)</p></div>${nav}${body}`;
}

const KINDS = ['ยารับประทาน', 'ยาใช้ภายนอก', 'แห้ง', 'ผง', 'บรรจุภัณฑ์', 'เคมีภัณฑ์', 'ฉลาก'];
function stockList(params) {
  const kind = params.get('kind') || '';
  const rows = [...D.itemStats.values()].filter((s) => !kind || s.it.kind === kind).sort((a, b) => ({ crit: 0, warn: 1, ok: 2 }[a.level] - { crit: 0, warn: 1, ok: 2 }[b.level]) || a.it.code.localeCompare(b.it.code));
  return `<section class="panel"><div class="panel-h"><h2>คงคลังรายรายการ</h2>
    <div class="row-wrap"><label class="small" for="kind">ประเภท</label><select id="kind" data-act="kind">${['', ...KINDS].map((k) => `<option value="${k}" ${k === kind ? 'selected' : ''}>${k || 'ทั้งหมด'}</option>`).join('')}</select>
    <button type="button" class="btn btn-line" data-act="export">ส่งออก CSV</button></div></div>
    ${tableWrap(`<table><thead><tr><th>รหัส</th><th>รายการ</th><th>ประเภท</th><th class="r">ตรวจสอบแล้ว</th><th class="r">รอปล่อยผ่าน</th><th class="r">ใช้ต่อวัน</th><th class="r">พอใช้</th><th class="r">จำนวนอย่างต่ำ</th><th class="r">จำนวนอย่างสูง</th><th class="r">ค้างรับ ค้างผลิต</th><th>สถานะ</th></tr></thead><tbody>
    ${rows.map((s) => `<tr><td class="mono">${s.it.code}</td><td><a href="#/stock?tab=card&item=${s.it.code}">${esc(s.it.name)}</a></td><td>${esc(s.it.kind)}</td>
      <td class="r">${qty(s.it.code, s.released)}</td><td class="r">${s.quarantine ? qty(s.it.code, s.quarantine) : '-'}</td><td class="r">${num(s.u.mean, 1)}</td>
      <td class="r">${Number.isFinite(s.cover) ? `${num(Math.floor(s.cover))} วัน` : '-'}</td><td class="r">${num(s.pol.rop)}</td><td class="r">${num(s.pol.S)}</td><td class="r">${s.onOrder ? num(s.onOrder) : '-'}</td><td>${chip(s.level)}</td></tr>`).join('')}
    </tbody></table>`)}
    <p class="small muted">จำนวนอย่างต่ำ = จุดสั่งซื้อ ใช้วันละ × ระยะส่งเฉลี่ย + สต็อกกันชน และจำนวนอย่างสูง = ระดับเติมเต็ม รอบทบทวน ${CONFIG.reviewDays} วัน คิดใหม่ทุกวันจากรายการเบิก ${CONFIG.demandWindowDays} วันล่าสุด สูตรอยู่ในหน้าจัดซื้อ</p></section>`;
}

function stockCard(params) {
  const code = params.get('item') || '91004';
  const it = S.items.get(code);
  const st = D.itemStats.get(code);
  const ms = S.moves.filter((m) => m.item_code === code).sort((a, b) => a.date.localeCompare(b.date) || a.move_id.localeCompare(b.move_id));
  let bal = 0;
  const lines = ms.map((m) => { const q = m.qty; const inQ = ['รับ', 'ยกมา'].includes(m.type) ? q : 0; const outQ = inQ ? 0 : q; bal += inQ - outQ; const lot = S.lotMap.get(m.lot_no); return { m, inQ, outQ, bal, exp: lot?.exp_date }; }).slice(-60);
  const opts = [...D.itemStats.values()].map((s) => `<option value="${s.it.code}" ${s.it.code === code ? 'selected' : ''}>${s.it.code} ${esc(s.it.name)}</option>`).join('');
  return `<section class="panel"><div class="panel-h"><h2>บัตรคุมวัสดุ (FM-02 บันทึกการรับ-จ่าย บัญชีควบคุมวัสดุ)</h2><div class="row-wrap"><label class="small" for="cardItem">รายการ</label><select id="cardItem" data-act="cardItem">${opts}</select></div></div>
  <dl class="fm-head"><div><dt>ประเภท</dt><dd>${esc(it.kind)}</dd></div><div><dt>ชื่อหรือชนิดวัสดุ</dt><dd>${esc(it.name)}</dd></div><div><dt>รหัส</dt><dd class="mono">${code}</dd></div><div><dt>หน่วยที่นับ</dt><dd>${esc(it.unit)}</dd></div>
  <div><dt>จำนวนอย่างสูง</dt><dd class="mono">${num(st.pol.S)}</dd></div><div><dt>จำนวนอย่างต่ำ</dt><dd class="mono">${num(st.pol.rop)}</dd></div><div><dt>ที่เก็บ</dt><dd>${['ยารับประทาน', 'ยาใช้ภายนอก'].includes(it.kind) ? 'คลังยาสำเร็จรูป' : it.kind === 'บรรจุภัณฑ์' || it.kind === 'ฉลาก' ? 'คลังบรรจุภัณฑ์' : 'คลังวัตถุดิบ'}</dd></div></dl>
  ${tableWrap(`<table><thead><tr><th>วัน เดือน ปี</th><th>รับจาก/จ่ายให้</th><th>เลขที่เอกสาร</th><th>Lot No.</th><th>Exp.</th><th class="r">รับ</th><th class="r">จ่าย</th><th class="r">คงเหลือ</th><th>ผู้บันทึก</th></tr></thead><tbody>
  ${lines.map((x) => `<tr${x.m.move_id.startsWith('W') ? ' class="row-new"' : ''}><td>${thaiDate(x.m.date)}</td><td>${esc(x.m.party)}</td><td>${esc(x.m.doc_no)}</td><td class="mono">${esc(x.m.lot_no)}</td><td>${x.exp ? thaiDate(x.exp) : '-'}</td>
  <td class="r">${x.inQ ? (INT_UNITS.has(it.unit) ? num(x.inQ) : num2(x.inQ)) : ''}</td><td class="r">${x.outQ ? (INT_UNITS.has(it.unit) ? num(x.outQ) : num2(x.outQ)) : ''}${x.m.type !== 'จ่าย' && x.outQ ? ` <span class="small muted">${esc(x.m.type)}</span>` : ''}</td><td class="r strong">${(INT_UNITS.has(it.unit) ? num(x.bal) : num2(x.bal))}</td><td>${esc(staff(x.m.user_id).name.replace(' (สมมุติ)', ''))}</td></tr>`).join('')}
  </tbody></table>`)}
  <p class="small muted">แสดง 60 รายการล่าสุด คงเหลือรวมทุกสถานะ (รวมของรอปล่อยผ่าน)</p></section>`;
}

function receiveForm(params) {
  const buyables = [...S.items.values()].filter((i) => i.make === 'buy' || i.make === 'farm');
  const code = params.get('item') || '91004';
  const it = S.items.get(code);
  const openPOs = S.pos.filter((p) => p.item_code === code && !p.received_date && p.lot_no !== 'ก่อนเริ่มระบบ');
  const sups = it.make === 'farm' ? S.base.suppliers.filter((s) => s.type === 'เกษตรกร') : S.base.suppliers.filter((s) => s.type !== 'เกษตรกร');
  return `<section class="panel form-panel"><div class="panel-h"><h2>รับเข้า (FM-01 บันทึกการตรวจรับ)</h2><span class="small muted">ผู้ใช้: ${esc(currentUser().name)} ${esc(currentUser().role)}</span></div>
  <form data-form="receive" class="form-grid">
    <label>รายการ<select name="item" data-act="recvItem">${buyables.map((i) => `<option value="${i.code}" ${i.code === code ? 'selected' : ''}>${i.code} ${esc(i.name)}</option>`).join('')}</select></label>
    <label>อ้างใบสั่งซื้อ<select name="po">${['<option value="">ไม่อ้าง</option>', ...openPOs.map((p) => `<option value="${p.po_no}">${p.po_no} สั่ง ${thaiDate(p.order_date)} ${qty(code, p.qty)}</option>`)].join('')}</select></label>
    <label>${it.make === 'farm' ? 'เกษตรกร (FM-23)' : 'ผู้ขาย'}<select name="supplier">${sups.map((s) => `<option value="${s.supplier_id}" ${s.supplier_id === it.supplier_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
    <label>จำนวน (${esc(it.unit)})<input name="qty" type="number" min="0.01" step="any" required value="${openPOs[0] ? openPOs[0].qty : ''}"></label>
    <label>วันหมดอายุตามฉลากผู้ขาย<input name="exp" type="date"></label>
    <div class="form-note small muted">เมื่อบันทึก ระบบออกเลข${it.make === 'farm' ? 'ที่รับตาม SOP-PD-07' : 'รับ'} ${esc(nextLotNo(code))} ติดป้ายรอปล่อยผ่าน และส่งเข้าคิวฝ่ายควบคุมคุณภาพ</div>
    <div class="row-wrap"><button type="submit" class="btn btn-solid">บันทึกรับเข้า</button></div>
  </form></section>`;
}

function issueForm(params) {
  const items = [...D.itemStats.values()].filter((s) => s.released > 0);
  const code = params.get('item') || items[0]?.it.code;
  const it = S.items.get(code);
  const lots = (S.lotsByItem.get(code) || []).filter(usable).sort((a, b) => (a.exp_date || '9999').localeCompare(b.exp_date || '9999') || a.date_in.localeCompare(b.date_in));
  const doc = REQ_FORM[it.kind];
  return `<section class="panel form-panel"><div class="panel-h"><h2>เบิกออก (${esc(doc)} ${it.kind === 'ยารับประทาน' || it.kind === 'ยาใช้ภายนอก' ? 'ใบเบิกยาสำเร็จรูป' : 'ใบเบิก'})</h2><span class="small muted">ผู้ใช้: ${esc(currentUser().name)} ${esc(currentUser().role)}</span></div>
  <form data-form="issue" class="form-grid">
    <label>รายการ<select name="item" data-act="issueItem">${items.map((s) => `<option value="${s.it.code}" ${s.it.code === code ? 'selected' : ''}>${s.it.code} ${esc(s.it.name)}</option>`).join('')}</select></label>
    <label>จำนวน (${esc(it.unit)})<input name="qty" type="number" min="0.01" step="any" required data-act="issueQty"></label>
    <label>จ่ายให้<input name="to" required placeholder="เช่น งานผลิต J70-350 หรือ คลังเวชภัณฑ์ รพ.ก" list="toList"></label>
    <datalist id="toList">${S.jobs.filter((j) => j.status !== 'done').map((j) => `<option value="งานผลิต ${j.job_id}">`).join('')}${S.base.customers.map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist>
    <div class="form-note"><div class="small strong">ล็อตที่ระบบจะเบิก เรียงหมดอายุก่อนจ่ายก่อน (FEFO)</div><div id="fefo" class="small">${lots.map((l) => `<div class="row-sb"><span class="mono">${esc(l.lot_no)}</span><span>หมดอายุ ${l.exp_date ? thaiDate(l.exp_date) : '-'}</span><span>${qty(code, l.qty_left)}</span></div>`).join('') || 'ไม่มีล็อตที่ตรวจสอบแล้ว'}</div></div>
    <div class="row-wrap"><button type="submit" class="btn btn-solid">บันทึกเบิก</button></div>
  </form></section>`;
}

function submitReceive(form) {
  if (!CAN.receive.includes(currentUser().role)) return toast('รับเข้าได้เฉพาะเจ้าหน้าที่ฝ่ายจัดซื้อและคลัง เปลี่ยนผู้ใช้ที่มุมขวาบน', 'warn');
  const f = new FormData(form);
  const code = f.get('item'), po = f.get('po'), q = round(code, Number(f.get('qty')));
  if (!(q > 0)) return toast('ใส่จำนวนก่อน', 'warn');
  const it = S.items.get(code);
  const sup = S.base.suppliers.find((s) => s.supplier_id === f.get('supplier'));
  const lotNo = nextLotNo(code);
  const exp = f.get('exp') || (it.shelf_days ? addDays(S.today, it.shelf_days) : '');
  const fx = {
    lots: [{ lot_no: lotNo, item_code: code, qty_in: q, date_in: S.today, exp_date: exp, status: 'รอปล่อยผ่าน', release_date: '', source: po ? 'ใบสั่งซื้อ' : it.make === 'farm' ? 'รับซื้อ' : 'รับเข้า', source_ref: po || sup.supplier_id }],
    moves: [newMove({ item_code: code, lot_no: lotNo, type: 'รับ', qty: q, party: sup.name, doc_no: po ? `FM-01 ${po}` : it.make === 'farm' ? 'FM-23 ใบรับซื้อวัตถุดิบสมุนไพร' : 'FM-01' })],
  };
  if (po) fx.po = [{ po_no: po, received_date: S.today, lot_no: lotNo }];
  const summary = `รับเข้า ${it.name} ${qty(code, q)} จาก ${sup.name} ออกเลข ${lotNo} ติดป้ายรอปล่อยผ่าน`;
  commit({ type: 'receive', summary, effects: fx });
  toast(summary);
  location.hash = '#/qc';
}

function submitIssue(form) {
  if (!CAN.issue.includes(currentUser().role)) return toast('เบิกออกได้เฉพาะเจ้าหน้าที่ฝ่ายจัดซื้อและคลัง เปลี่ยนผู้ใช้ที่มุมขวาบน', 'warn');
  const f = new FormData(form);
  const code = f.get('item'), q = round(code, Number(f.get('qty'))), to = String(f.get('to') || '').trim();
  if (!(q > 0) || !to) return toast('ใส่จำนวนและผู้รับก่อน', 'warn');
  const it = S.items.get(code);
  const { picks, short } = fefoPick((S.lotsByItem.get(code) || []).filter(usable), q);
  if (short > 1e-9) return toast(`ของที่ตรวจสอบแล้วไม่พอ ขาด ${qty(code, short)}`, 'crit');
  const fx = { moves: picks.map((p) => newMove({ item_code: code, lot_no: p.lot_no, type: 'จ่าย', qty: round(code, p.qty), party: to, doc_no: REQ_FORM[it.kind] })) };
  const summary = `เบิก ${it.name} ${qty(code, q)} ให้ ${to} จาก ${picks.length} ล็อต (${picks.map((p) => p.lot_no).join(', ')})`;
  commit({ type: 'issue', summary, effects: fx });
  toast(summary);
  route();
}

// ---------- 04 จัดซื้อ ----------
function viewPurchase() {
  const open = [...D.itemStats.values()].flatMap((s) => s.poViews.map((v) => ({ s, v }))).sort((a, b) => a.v.prob - b.v.prob);
  const toOrder = [...D.itemStats.values()].filter((s) => s.it.make === 'buy' && s.suggestQty > 0 && !s.openPOs.length);
  const sups = S.base.suppliers.filter((s) => s.type !== 'เกษตรกร').map((s) => {
    const xs = S.pos.filter((p) => p.supplier_id === s.supplier_id && p.received_date);
    const lts = xs.map((p) => daysBetween(p.order_date, p.received_date));
    const n = lts.length, mean = n ? lts.reduce((a, b) => a + b, 0) / n : 0;
    const sd = n > 1 ? Math.sqrt(lts.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1)) : 0;
    const onTime = n ? xs.filter((p) => p.received_date <= p.quoted_date).length / n : 0;
    return { s, n, mean, sd, onTime };
  });
  return `<div class="lead"><h1>จัดซื้อ</h1><p class="muted">ฝ่ายจัดซื้อและคลัง ใบสั่งซื้อที่ค้างรับทุกใบมีโอกาสมาทันคำนวณจากประวัติส่งของจริงของผู้ขายรายนั้น</p></div>
  <section class="panel"><div class="panel-h"><h2>ใบสั่งซื้อค้างรับ จะมาทันไหม</h2><span class="small muted">${open.length} ใบ</span></div>
  ${tableWrap(`<table><thead><tr><th>เลขที่</th><th>รายการ</th><th>ผู้ขาย</th><th class="r">จำนวน</th><th>วันที่สั่ง</th><th class="r">ส่งเฉลี่ย</th><th>คาดถึง</th><th>ของหมด</th><th class="r">โอกาสทัน</th><th>ผล</th></tr></thead><tbody>
  ${open.map(({ s, v }) => `<tr><td class="mono">${v.po.po_no}</td><td>${esc(s.it.name)}</td><td>${esc(v.sl.supplier.name)}</td><td class="r">${qty(s.it.code, v.po.qty)}</td><td>${thaiDate(v.po.order_date)}</td>
  <td class="r">${num(v.sl.L)} ±${num(v.sl.sL)} วัน <span class="small muted">(${v.sl.n} ครั้ง${v.sl.quoted ? ' ใช้ค่าที่แจ้ง' : ''})</span></td><td>${thaiDate(v.expected)}</td><td>${s.stockoutDate ? thaiDate(s.stockoutDate) : '-'}</td><td class="r strong">${num(v.prob * 100)}%</td><td>${chip(v.verdict.level, v.verdict.text)}</td></tr>`).join('')}
  </tbody></table>`)}</section>
  <section class="panel"><div class="panel-h"><h2>รายการที่ถึงจำนวนอย่างต่ำ ควรสั่งซื้อ</h2><span class="small muted">${toOrder.length} รายการ</span></div>
  ${toOrder.length ? tableWrap(`<table><thead><tr><th>รายการ</th><th class="r">ตรวจสอบแล้ว</th><th class="r">จำนวนอย่างต่ำ</th><th class="r">แนะนำสั่ง</th><th>ผู้ขาย</th><th class="r">ส่งเฉลี่ย</th></tr></thead><tbody>
  ${toOrder.map((s) => `<tr><td>${esc(s.it.name)}</td><td class="r">${qty(s.it.code, s.released)}</td><td class="r">${num(s.pol.rop)}</td><td class="r strong">${qty(s.it.code, s.suggestQty)}</td><td>${esc(s.lt.supplier?.name || '')}</td><td class="r">${num(s.lt.L)} วัน</td></tr>`).join('')}</tbody></table>`) : '<p class="muted">ยังไม่มีรายการที่ถึงจุดสั่งซื้อโดยไม่มีใบสั่งซื้อค้าง</p>'}</section>
  <section class="panel"><div class="panel-h"><h2>ทะเบียนผู้ขายที่ได้รับการคัดเลือก (FM-46) กับระยะส่งของจริง</h2></div>
  ${tableWrap(`<table><thead><tr><th>ผู้ขาย</th><th class="r">ระยะส่งที่แจ้ง</th><th class="r">ระยะส่งจริง</th><th class="r">ส่งตามนัด</th><th>หมายเหตุ</th></tr></thead><tbody>
  ${sups.map((x) => `<tr><td>${esc(x.s.name)}</td><td class="r">${x.s.quoted_lead_days} วัน</td><td class="r">${x.n ? `${num(x.mean)} ±${num(x.sd)} วัน (${x.n} ครั้ง)` : '-'}</td><td class="r">${x.n ? `${num(x.onTime * 100)}%` : '-'}</td><td class="small">${esc(x.s.note)}</td></tr>`).join('')}</tbody></table>`)}</section>
  <section class="panel note"><h2>วิธีคิด</h2>
  <ul class="small">
    <li>สต็อกกันชน = Z × √(L̄·σd² + d̄²·σL²) เมื่อทั้งปริมาณใช้และระยะส่งของแกว่ง (Gallego, Columbia 2004 ข้อ 1.3.1 และ King, APICS magazine 2011)</li>
    <li>จำนวนอย่างต่ำ (จุดสั่งซื้อ) = d̄ × L̄ + สต็อกกันชน และจำนวนอย่างสูง = d̄ × (R + L̄) + Z × σ(R+L) (MIT OCW ESD.260J 2006 บทที่ 11 และ 12)</li>
    <li>โอกาสมาทัน = Φ((วันที่ของหมด − วันที่สั่ง − L̄) ÷ σL) หลักเดียวกับระดับบริการ = P[ปริมาณใช้ช่วงรอของ ≤ จุดสั่งซื้อ] (MIT บทที่ 11)</li>
    <li>ระดับบริการเป้าหมาย ${num(CONFIG.cslKey * 100)}% สำหรับสินค้าหลักกับบรรจุภัณฑ์ของสินค้าหลัก และ ${num(CONFIG.cslOther * 100)}% สำหรับรายการอื่น ตัดสิน ทัน เมื่อถึงเป้า เสี่ยง เมื่อ 50% ขึ้นไป ไม่ทัน เมื่อต่ำกว่า 50% (เกณฑ์ตั้งเอง รอพี่เคาะ แก้ได้ที่ assets/config.js)</li>
  </ul></section>`;
}

// ---------- 05 ควบคุมคุณภาพ ----------
function viewQC() {
  const user = currentUser();
  const canRelease = CAN.release.includes(user.role);
  const recent = S.releases.slice().sort((a, b) => b.date.localeCompare(a.date)).filter((r) => ['ยารับประทาน', 'ยาใช้ภายนอก'].includes(S.items.get(r.item_code).kind)).slice(0, 15);
  return `<div class="lead"><h1>ควบคุมคุณภาพ</h1><p class="muted">ฝ่ายควบคุมคุณภาพ ป้ายแดง "รอปล่อยผ่าน" เปลี่ยนเป็นป้ายเขียว "ตรวจสอบแล้ว" หรือ "ไม่ผ่าน" ได้โดยหัวหน้าฝ่ายควบคุมคุณภาพเท่านั้น (SOP-QC-06, SOP-QC-07, ระเบียบ V8.9 ข้อ 89 และ 92)</p>
  ${canRelease ? '' : `<p class="small">${chip('warn', 'ผู้ใช้ตอนนี้ปล่อยผ่านไม่ได้')} เปลี่ยนผู้ใช้เป็น แพร หัวหน้าฝ่ายควบคุมคุณภาพ ที่มุมขวาบนเพื่อทดลอง</p>`}</div>
  <section class="panel"><div class="panel-h"><h2>คิวรอปล่อยผ่าน</h2><span class="small muted">${D.qcQueue.length} ล็อต</span></div>
  ${tableWrap(`<table><thead><tr><th>ป้าย</th><th>Lot No.</th><th>รายการ</th><th class="r">จำนวน</th><th>รับหรือผลิตเสร็จ</th><th class="r">รอมาแล้ว</th><th>ที่มา</th><th>เหตุผล (ถ้าไม่ผ่าน)</th><th>ตัดสิน</th></tr></thead><tbody>
  ${D.qcQueue.map((q) => `<tr><td>${tag('รอปล่อยผ่าน')}</td><td class="mono">${esc(q.lot.lot_no)}</td><td>${esc(q.it.name)}</td><td class="r">${qty(q.it.code, q.lot.qty_left)}</td><td>${thaiDate(q.lot.date_in)}</td>
  <td class="r ${q.waiting > CONFIG.qcWaitWarnDays ? 't-warn-dark strong' : ''}">${q.waiting} วัน</td><td class="small">${esc(q.lot.source)} ${esc(q.lot.source_ref)}</td>
  <td><label class="sr" for="rs-${esc(q.lot.lot_no)}">เหตุผล ${esc(q.lot.lot_no)}</label><input id="rs-${esc(q.lot.lot_no)}" class="in-sm" placeholder="เช่น ความชื้นเกินเกณฑ์"></td>
  <td class="nowrap"><button type="button" class="btn btn-solid btn-sm" data-act="release" data-lot="${esc(q.lot.lot_no)}" data-res="ผ่าน" ${canRelease ? '' : 'aria-disabled="true"'}>ปล่อยผ่าน</button> <button type="button" class="btn btn-line btn-sm" data-act="release" data-lot="${esc(q.lot.lot_no)}" data-res="ไม่ผ่าน" ${canRelease ? '' : 'aria-disabled="true"'}>ไม่ผ่าน</button></td></tr>`).join('') || '<tr><td colspan="9" class="muted">ไม่มีล็อตรอปล่อยผ่าน</td></tr>'}
  </tbody></table>`)}</section>
  <section class="panel"><div class="panel-h"><h2>บันทึกการปล่อยผ่านผลิตภัณฑ์สำเร็จรูป (FM-35)</h2><span class="small muted">15 รายการล่าสุด</span></div>
  ${tableWrap(`<table><thead><tr><th>ว/ด/ป</th><th>ผลิตภัณฑ์สำเร็จรูป</th><th>Lot No.</th><th>ผลการตรวจ</th><th>ผู้ตรวจ/ผู้อนุมัติปล่อยผ่าน</th><th>หมายเหตุ</th></tr></thead><tbody>
  ${recent.map((r) => `<tr><td>${thaiDate(r.date)}</td><td>${esc(S.items.get(r.item_code).name)}</td><td class="mono">${esc(r.lot_no)}</td><td>${r.result === 'ผ่าน' ? tag('ตรวจสอบแล้ว') : tag('ไม่ผ่าน')}</td><td>${esc(staff(r.checker_id).name.replace(' (สมมุติ)', ''))} / ${esc(staff(r.approver_id).name.replace(' (สมมุติ)', ''))}</td><td class="small">${esc(r.note)}</td></tr>`).join('')}
  </tbody></table>`)}</section>`;
}

// ---------- 06 ขาย ลูกหนี้ ----------
function viewSales() {
  const ms = monthSales();
  const ar = arAging();
  const from = addDays(S.today, -365);
  const rows = S.base.customers.map((c) => {
    const inv = S.base.invoices.filter((v) => v.customer_id === c.customer_id);
    const sales = inv.filter((v) => v.date > from && v.date <= S.today).reduce((s, v) => s + v.total, 0);
    const out = inv.filter((v) => !v.paid_date).reduce((s, v) => s + v.total, 0);
    const over = inv.filter((v) => !v.paid_date && v.due_date < S.today).reduce((s, v) => s + v.total, 0);
    const oldest = inv.filter((v) => !v.paid_date).reduce((m, v) => Math.max(m, daysBetween(v.date, S.today)), 0);
    return { c, sales, out, over, oldest };
  }).sort((a, b) => b.out - a.out);
  const overdue = S.base.invoices.filter((v) => !v.paid_date && v.due_date < S.today).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 12);
  const cname = (id) => S.base.customers.find((c) => c.customer_id === id)?.name || id;
  return `<div class="lead"><h1>ขาย ลูกหนี้</h1><p class="muted">ยอดขายมาจากใบเบิกยาสำเร็จรูป (FM-19) ที่จ่ายจริงในคลัง ข้อมูลลูกค้าเป็นของสมมุติ</p></div>
  <section class="tiles"><div class="tile"><div class="tile-h"><span>ยอดขาย 12 เดือน</span></div><div class="tile-n"><span class="mono">${mill(ms.reduce((s, x) => s + x.total, 0))}</span><span>ล้านบาท</span></div></div>
  <div class="tile"><div class="tile-h"><span>ลูกหนี้ค้างชำระ</span></div><div class="tile-n"><span class="mono">${mill(ar.total)}</span><span>ล้านบาท</span></div></div>
  <div class="tile ${ar.overdue ? 'tile-warn' : ''}"><div class="tile-h"><span>เกินกำหนดชำระ</span></div><div class="tile-n"><span class="mono">${mill(ar.overdue)}</span><span>ล้านบาท</span></div></div></section>
  <div class="cols"><section class="panel panel-2"><div class="panel-h"><h2>ยอดขายรายเดือน</h2></div>${salesBars(ms)}</section>
  <section class="panel panel-1"><div class="panel-h"><h2>ลูกหนี้ตามอายุหนี้</h2></div>${agingBar(ar)}</section></div>
  <section class="panel"><div class="panel-h"><h2>ขายให้ใคร ค้างเท่าไร</h2></div>
  ${tableWrap(`<table><thead><tr><th>ลูกค้า</th><th>ประเภท</th><th class="r">เครดิต</th><th class="r">ยอดขาย 12 เดือน</th><th class="r">ค้างชำระ</th><th class="r">เกินกำหนด</th><th class="r">ใบเก่าสุด</th></tr></thead><tbody>
  ${rows.map((x) => `<tr><td>${esc(x.c.name)}</td><td>${esc(x.c.type)}</td><td class="r">${x.c.credit_days} วัน</td><td class="r">${money(x.sales)}</td><td class="r strong">${money(x.out)}</td><td class="r ${x.over ? 't-crit-text' : ''}">${x.over ? money(x.over) : '-'}</td><td class="r">${x.oldest ? `${x.oldest} วัน` : '-'}</td></tr>`).join('')}</tbody></table>`)}</section>
  <section class="panel"><div class="panel-h"><h2>ใบส่งของเกินกำหนดชำระ</h2><span class="small muted">12 ใบที่ค้างนานสุด</span></div>
  ${tableWrap(`<table><thead><tr><th>เลขที่</th><th>ลูกค้า</th><th>วันที่</th><th>ครบกำหนด</th><th class="r">เกินมา</th><th class="r">ยอด</th></tr></thead><tbody>
  ${overdue.map((v) => `<tr><td class="mono">${v.inv_no}</td><td>${esc(cname(v.customer_id))}</td><td>${thaiDate(v.date)}</td><td>${thaiDate(v.due_date)}</td><td class="r t-crit-text">${daysBetween(v.due_date, S.today)} วัน</td><td class="r">${money(v.total)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">ไม่มี</td></tr>'}</tbody></table>`)}</section>`;
}

// ---------- 07 ไล่ย้อนล็อต ----------
function traceTree(lotNo, depth = 0) {
  const lot = S.lotMap.get(lotNo);
  if (!lot) return '';
  const it = S.items.get(lot.item_code);
  const job = S.jobs.find((j) => j.out_lot === lotNo);
  const src = lot.source === 'ใบสั่งซื้อ' ? `ซื้อตาม ${lot.source_ref}` : lot.source === 'รับซื้อ' ? `รับซื้อจาก ${S.base.suppliers.find((s) => s.supplier_id === lot.source_ref)?.name || lot.source_ref}` : lot.source === 'ผลิต' ? `ผลิตตามงาน ${lot.source_ref}` : lot.source;
  const kids = job && depth < 3 ? S.jobInputs.filter((x) => x.job_id === job.job_id) : [];
  return `<li><span class="mono strong">${esc(lotNo)}</span> ${esc(it.name)} ${tag(lot.status)} <span class="small muted">${esc(src)} รับหรือผลิต ${thaiDate(lot.date_in)}</span>${kids.length ? `<ul>${kids.map((k) => `<li class="small">ใช้ ${qty(k.item_code, k.qty)}<ul>${traceTree(k.lot_no, depth + 1)}</ul></li>`).join('')}</ul>` : ''}</li>`;
}
function forward(lotNo, depth = 0, acc = new Map()) {
  for (const l of S.base.invoice_lines.filter((x) => x.lot_no === lotNo)) {
    const inv = S.base.invoices.find((v) => v.inv_no === l.inv_no);
    const k = inv.customer_id;
    acc.set(k, (acc.get(k) || 0) + l.qty);
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
  const lotNo = params.get('lot') || '';
  const lot = S.lotMap.get(lotNo);
  const sample = S.lots.filter((l) => ['ยารับประทาน', 'ยาใช้ภายนอก'].includes(S.items.get(l.item_code).kind) && l.source === 'ผลิต').slice(-3).map((l) => l.lot_no).concat(S.lots.filter((l) => S.items.get(l.item_code).kind === 'สด').slice(-2).map((l) => l.lot_no));
  let body = '';
  if (lotNo && !lot) body = `<p>${chip('warn', 'ไม่พบเลขนี้')} ลองเลขอื่น</p>`;
  if (lot) {
    const fw = forward(lotNo);
    const downstream = usedIn(lotNo);
    const cname = (id) => S.base.customers.find((c) => c.customer_id === id)?.name || id;
    body = `<div class="cols"><section class="panel panel-1"><div class="panel-h"><h2>ไล่ย้อนต้นทาง</h2></div><ul class="tree">${traceTree(lotNo)}</ul></section>
    <section class="panel panel-1"><div class="panel-h"><h2>ไล่ไปปลายทาง จำลองเรียกคืน</h2></div>
    ${downstream.length ? `<p class="small">ล็อตนี้ถูกใช้ผลิตต่อเป็น ${downstream.map((x) => `<a class="mono" href="#/trace?lot=${x}">${x}</a>`).join(', ')}</p>` : ''}
    ${fw.size ? `<p class="small strong">ถ้าต้องเรียกคืน ต้องแจ้ง ${fw.size} ราย (แบบฟอร์ม FM-07 บันทึกการเรียกคืน และ FM-10 ใบเรียกคืนผลิตภัณฑ์สำเร็จรูป)</p>${tableWrap(`<table><thead><tr><th>ลูกค้า</th><th class="r">จำนวนที่ได้รับ</th></tr></thead><tbody>${[...fw].map(([k, v]) => `<tr><td>${esc(cname(k))}</td><td class="r">${num(v)}</td></tr>`).join('')}</tbody></table>`)}` : '<p class="muted small">ยังไม่มีการจ่ายออกให้ลูกค้า</p>'}</section></div>`;
  }
  return `<div class="lead"><h1>ไล่ย้อนล็อต</h1><p class="muted">ใส่เลขที่ผลิต 8 หลัก (SOP-PD-07) หรือเลขรับ เพื่อดูว่ามาจากวัตถุดิบล็อตไหน ใครส่งมา และถ้ามีปัญหาต้องเรียกคืนจากใคร</p></div>
  <form data-form="trace" class="row-wrap trace-form"><label class="sr" for="lotq">เลขที่ผลิต</label><input id="lotq" name="lot" class="mono" value="${esc(lotNo)}" placeholder="เช่น ${esc(sample[0] || '')}" list="lotList"><datalist id="lotList">${S.lots.slice(-200).map((l) => `<option value="${l.lot_no}">`).join('')}</datalist><button class="btn btn-solid" type="submit">ไล่ย้อน</button>
  <span class="small muted">ลองเลข: ${sample.map((x) => `<a class="mono" href="#/trace?lot=${x}">${x}</a>`).join(' ')}</span></form>${body}`;
}

// ---------- 08 ประวัติการแก้ไข ----------
function viewLog() {
  const evs = S.events.slice().reverse();
  return `<div class="lead"><h1>ประวัติการแก้ไข</h1><p class="muted">ทุกการรับเข้า เบิก ย้ายงาน และปล่อยผ่าน ที่ทดลองกรอก บันทึกต่อท้ายอย่างเดียว ไม่แก้ทับ บอกได้ว่าใคร ทำอะไร เมื่อไร และเหตุผล ข้อมูลส่วนนี้เก็บในเบราว์เซอร์เครื่องนี้เท่านั้น</p></div>
  <section class="panel"><div class="panel-h"><h2>เหตุการณ์ที่ทดลองกรอก</h2><div class="row-wrap"><button type="button" class="btn btn-line" data-act="exportLog" ${evs.length ? '' : 'disabled'}>ส่งออก CSV</button><button type="button" class="btn btn-line" data-act="reset" ${evs.length ? '' : 'disabled'}>ล้างที่ทดลองกรอก</button></div></div>
  ${evs.length ? tableWrap(`<table><thead><tr><th>เวลา</th><th>ผู้ใช้</th><th>บทบาท</th><th>ทำอะไร</th><th>เหตุผล</th></tr></thead><tbody>${evs.map((e) => `<tr><td class="nowrap">${new Date(e.at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</td><td>${esc(staff(e.user).name.replace(' (สมมุติ)', ''))}</td><td>${esc(staff(e.user).role)}</td><td>${esc(e.summary)}</td><td>${esc(e.reason || '')}</td></tr>`).join('')}</tbody></table>`) : '<p class="muted">ยังไม่มี ลองรับของ เบิกของ ย้ายการ์ด หรือปล่อยผ่าน แล้วกลับมาดูหน้านี้</p>'}</section>`;
}

// ---------- เหตุการณ์จากผู้ใช้ ----------
function bind() {
  window.addEventListener('hashchange', route);
  $('#user').addEventListener('change', (e) => { setUser(e.target.value); toast(`เปลี่ยนผู้ใช้เป็น ${currentUser().name} ${currentUser().role}`); route(); });
  $('#theme').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    $('#theme').setAttribute('aria-pressed', String(dark));
    try { localStorage.setItem('hfd-theme', dark ? 'dark' : 'light'); } catch { /* ไม่จำก็ได้ */ }
  });
  const main = $('#main');
  main.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
    const act = b.dataset.act;
    if (act === 'move') moveJob(b.dataset.job, Number(b.dataset.dir));
    if (act === 'release') { const lot = b.dataset.lot; const reason = $(`#rs-${CSS.escape(lot)}`)?.value.trim() || ''; releaseLot(lot, b.dataset.res, reason); }
    if (act === 'export') { download('lots-ข้อมูลจำลอง.csv', toCSV(S.lots, ['lot_no', 'item_code', 'qty_in', 'qty_left', 'date_in', 'exp_date', 'status', 'release_date', 'source', 'source_ref'])); download('moves-ข้อมูลจำลอง.csv', toCSV(S.moves, ['move_id', 'date', 'item_code', 'lot_no', 'type', 'qty', 'party', 'doc_no', 'user_id'])); }
    if (act === 'exportLog') download('ประวัติการแก้ไข-ข้อมูลจำลอง.csv', toCSV(S.events.map((x) => ({ ...x, user_name: staff(x.user).name, role: staff(x.user).role })), ['at', 'user', 'user_name', 'role', 'type', 'summary', 'reason']));
    if (act === 'reset' && confirm('ล้างทุกอย่างที่ทดลองกรอกในเบราว์เซอร์นี้ แล้วกลับไปใช้ข้อมูลจำลองตั้งต้น?')) { resetEvents(); toast('กลับไปใช้ข้อมูลจำลองตั้งต้นแล้ว'); route(); }
  });
  main.addEventListener('change', (e) => {
    const act = e.target.dataset.act;
    if (act === 'kind') location.hash = `#/stock?tab=list&kind=${encodeURIComponent(e.target.value)}`;
    if (act === 'cardItem') location.hash = `#/stock?tab=card&item=${e.target.value}`;
    if (act === 'recvItem') location.hash = `#/stock?tab=receive&item=${e.target.value}`;
    if (act === 'issueItem') location.hash = `#/stock?tab=issue&item=${e.target.value}`;
  });
  main.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    if (form.dataset.form === 'receive') submitReceive(form);
    if (form.dataset.form === 'issue') submitIssue(form);
    if (form.dataset.form === 'trace') location.hash = `#/trace?lot=${encodeURIComponent(new FormData(form).get('lot').trim())}`;
  });
  // ลากวางการ์ดบนบอร์ด (ย้ายได้ทีละขั้น)
  let dragJob = null;
  main.addEventListener('dragstart', (e) => { const c = e.target.closest('[data-job][draggable]'); if (c) { dragJob = c.dataset.job; e.dataTransfer.effectAllowed = 'move'; } });
  main.addEventListener('dragover', (e) => { if (dragJob && e.target.closest('[data-drop]')) e.preventDefault(); });
  main.addEventListener('drop', (e) => {
    const col = e.target.closest('[data-drop]');
    if (!col || !dragJob) return;
    e.preventDefault();
    const card = D.board.find((c) => c.job.job_id === dragJob);
    dragJob = null;
    if (!card || card.job.lane !== col.dataset.lane) return toast('ย้ายข้ามฝ่ายไม่ได้', 'warn');
    const st = LANES[card.job.lane].stages;
    const diff = st.indexOf(col.dataset.drop) - st.indexOf(card.stage);
    if (diff === 0) return;
    if (Math.abs(diff) !== 1) return toast('ย้ายได้ทีละขั้น ตามลำดับงานใน SOP', 'warn');
    moveJob(card.job.job_id, diff);
  });
}

async function start() {
  try { const t = localStorage.getItem('hfd-theme'); if (t) document.documentElement.dataset.theme = t; } catch { /* ใช้ค่าตั้งต้น */ }
  try {
    await loadAll();
  } catch (err) {
    $('#main').innerHTML = `<section class="panel"><h2>เปิดข้อมูลจำลองไม่ได้</h2><p>${esc(err.message)}</p><p class="small muted">ถ้าเปิดไฟล์จากเครื่องโดยตรง ให้เปิดผ่านเว็บเซิร์ฟเวอร์ เช่น python3 -m http.server</p></section>`;
    return;
  }
  bind();
  route();
}
start();
