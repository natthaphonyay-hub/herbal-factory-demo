// บันทึกถึงฝ่าย: ส่งข้อความระหว่างฝ่ายแบบอีเมลภายใน เก็บเวลาส่ง เวลาเปิดอ่าน และการตอบกลับเป็นหลักฐาน ลบหรือแก้ไม่ได้
import { ROOMS } from './config.js';
import { S, commit, currentUser, staff, inboxOf, isRead, myRooms, thaiDate } from './data.js';
import { esc, short, I, chip, who, toast, nav, setHash, head } from './ui.js';

const roomTitle = (id) => ROOMS.find((r) => r.id === id)?.title || id;
const when = (iso) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
// ลิงก์จากเลขที่อ้างอิง (เลขที่ผลิต ใบสั่งซื้อ ใบขอซื้อ งาน ใบส่งของ)
function refLink(ref) {
  if (!ref) return '';
  const r = ref.trim();
  if (S.lotMap.has(r)) return `<a href="#/trace?lot=${encodeURIComponent(r)}">${esc(r)}</a>`;
  if (S.pos.some((p) => p.po_no === r)) return `<a href="#/store?tab=buy&po=${encodeURIComponent(r)}">${esc(r)}</a>`;
  if (S.prs.some((p) => p.pr_no === r)) return `<a href="#/store?tab=buy&pr=${encodeURIComponent(r)}">${esc(r)}</a>`;
  const job = S.jobs.find((j) => j.job_id === r);
  if (job) return `<a href="#/${job.lane === 'ผลิต' ? 'prod' : 'process'}?tab=board&job=${encodeURIComponent(r)}">${esc(r)}</a>`;
  if (S.invoices.some((v) => v.inv_no === r)) return `<a href="#/doc?type=fm19&inv=${encodeURIComponent(r)}">${esc(r)}</a>`;
  return esc(r);
}
const toText = (n) => (n.to_user ? short(staff(n.to_user).name) : roomTitle(n.to_room));

export function viewNotes(p) {
  const box = p.get('box') || 'in';
  const id = p.get('id');
  const me = S.user;
  const inbox = inboxOf(me).slice().reverse();
  const sent = S.notes.filter((n) => n.from === me).slice().reverse();
  const list = box === 'sent' ? sent : inbox;
  const open = S.notes.find((n) => n.id === id);
  const compose = p.get('compose');
  const replyTo = S.notes.find((n) => n.id === p.get('reply'));
  const refs = [...S.lots.slice(-60).map((l) => l.lot_no), ...S.pos.slice(-30).map((x) => x.po_no), ...S.prs.slice(-30).map((x) => x.pr_no), ...S.jobs.slice(-30).map((j) => j.job_id)];
  let right;
  if (compose || replyTo) {
    const toRoom = replyTo ? '' : (p.get('to') || '');
    right = `<section class="panel" aria-labelledby="nc-h"><div class="panel-h"><h2 id="nc-h">${replyTo ? 'ตอบกลับ' : 'เขียนบันทึกถึงฝ่าย'}</h2><a href="#/notes">ยกเลิก</a></div>
      <form data-form="note" class="form-grid" data-reply="${esc(replyTo?.id || '')}">
        ${replyTo ? `<input type="hidden" name="to_user" value="${esc(replyTo.from)}"><label class="f">ถึง<input class="in" value="${esc(short(staff(replyTo.from).name))} ${esc(staff(replyTo.from).role)}" disabled></label>` : `<label class="f">ถึงฝ่าย<select class="in" name="to_room" required>${ROOMS.filter((r) => r.id !== 'overview').map((r) => `<option value="${r.id}" ${r.id === toRoom ? 'selected' : ''}>${esc(r.title)}</option>`).join('')}<option value="overview" ${toRoom === 'overview' ? 'selected' : ''}>หัวหน้ากลุ่มงาน และผู้อำนวยการ</option></select></label>`}
        <label class="f">อ้างถึงเลขที่ (ถ้ามี)<input class="in" name="ref" list="noteRefs" value="${esc(p.get('ref') || replyTo?.ref || '')}" placeholder="เลขที่ผลิต ใบสั่งซื้อ ใบขอซื้อ หรือเลขงาน"></label>
        <datalist id="noteRefs">${refs.map((r) => `<option value="${esc(r)}">`).join('')}</datalist>
        <label class="f wide">เรื่อง<input class="in" name="subject" required value="${esc(replyTo ? `ตอบ: ${replyTo.subject.replace(/^ตอบ: /, '')}` : '')}"></label>
        <label class="f wide">ข้อความ<textarea class="in ta" name="body" required rows="6"></textarea></label>
        <div class="form-actions"><button type="submit" class="btn btn-solid">ส่งบันทึก</button></div>
        <p class="form-note wide">ส่งแล้วแก้หรือลบไม่ได้ ระบบเก็บเวลาส่งและเวลาที่ผู้รับเปิดอ่านเป็นหลักฐาน</p></form></section>`;
  } else if (open && (open.from === me || inbox.includes(open))) {
    const reads = S.noteReads.get(open.id) || [];
    const thread = S.notes.filter((n) => n.reply_to === open.id || (open.reply_to && (n.id === open.reply_to || n.reply_to === open.reply_to)) ).filter((n) => n.id !== open.id);
    right = `<article class="panel note-open" aria-labelledby="no-h"><div class="panel-h"><h2 id="no-h">${esc(open.subject)}</h2><span class="meta">${esc(when(open.at))}</span></div>
      <div class="note-meta">${who(staff(open.from))}<span class="muted">ถึง ${esc(toText(open))}</span>${open.ref ? `<span>อ้างถึง ${refLink(open.ref)}</span>` : ''}</div>
      <div class="note-body">${esc(open.body).replace(/\n/g, '<br>')}</div>
      <div class="note-reads"><span class="stub-k">หลักฐานการเปิดอ่าน</span>${reads.length ? reads.map((r) => `<span>${chip('อ่านแล้ว', 'ok')} ${esc(short(staff(r.user).name))} ${esc(when(r.at))}</span>`).join('') : '<span class="muted">ยังไม่มีผู้รับเปิดอ่าน</span>'}</div>
      ${thread.length ? `<div class="note-thread"><span class="stub-k">ในเรื่องเดียวกัน</span>${thread.map((n) => `<a href="#/notes?id=${n.id}">${esc(short(staff(n.from).name))} ${esc(when(n.at))} ${esc(n.subject)}</a>`).join('')}</div>` : ''}
      <div class="form-actions"><a class="btn btn-solid" href="#/notes?reply=${open.id}">${I.reply}ตอบกลับ</a></div></article>`;
  } else {
    right = `<section class="panel"><p class="empty">เลือกบันทึกทางซ้ายเพื่อเปิดอ่าน หรือเขียนบันทึกใหม่ถึงฝ่ายอื่น ทุกฉบับเก็บเวลาส่ง เวลาเปิดอ่าน และการตอบกลับเป็นหลักฐาน ลบหรือแก้ไม่ได้</p></section>`;
  }
  const rooms = myRooms(me);
  return head('บันทึกถึงฝ่าย', [], `<a class="btn btn-solid" href="#/notes?compose=1">${I.plus}เขียนบันทึก</a>`, `ถึงห้องของฉัน ${[...rooms].map(roomTitle).join(' ') || 'ไม่มี'} ยังไม่ได้อ่าน ${inbox.filter((n) => !isRead(n)).length} ฉบับ`) + `
  <div class="work notes-work">
    <section class="panel" aria-labelledby="nl-h"><div class="panel-h"><h2 id="nl-h">${box === 'sent' ? 'ส่งแล้ว' : 'กล่องเข้า'}</h2></div>
      <nav class="seg" aria-label="กล่องบันทึก"><a href="#/notes" ${box === 'in' ? 'aria-current="page"' : ''}>กล่องเข้า ${inbox.length}</a><a href="#/notes?box=sent" ${box === 'sent' ? 'aria-current="page"' : ''}>ส่งแล้ว ${sent.length}</a></nav>
      <ul class="note-list">${list.map((n) => { const unread = box === 'in' && !isRead(n); return `<li class="${unread ? 'is-unread' : ''}${n.id === id ? ' is-on' : ''}"><a href="#/notes?id=${n.id}${box === 'sent' ? '&box=sent' : ''}"><span class="t">${unread ? '<span class="sr">ยังไม่ได้อ่าน </span>' : ''}${esc(n.subject)}</span><span class="d">${box === 'sent' ? `ถึง ${esc(toText(n))}` : `จาก ${esc(short(staff(n.from).name))} ${esc(staff(n.from).role)}`} ${esc(thaiDate(n.at.slice(0, 10)))}${box === 'sent' ? ` ${(S.noteReads.get(n.id) || []).length ? 'มีผู้อ่านแล้ว' : 'ยังไม่มีผู้อ่าน'}` : ''}</span></a></li>`; }).join('') || '<li class="empty">ยังไม่มีบันทึก</li>'}</ul></section>
    <div class="stack">${right}</div></div>`;
}

// เปิดอ่านแล้วบันทึกหลักฐานการอ่านหนึ่งครั้ง (เฉพาะผู้รับ)
export function afterNotes(p) {
  const n = S.notes.find((x) => x.id === p.get('id'));
  if (!n || n.from === S.user || isRead(n) || !inboxOf(S.user).includes(n)) return;
  commit({ type: 'noteRead', summary: `เปิดอ่าน ${n.subject}`, effects: { noteRead: [{ note: n.id }] } });
  nav.route();
}

function submitNote(form) {
  const f = new FormData(form);
  const subject = String(f.get('subject') || '').trim(), body = String(f.get('body') || '').trim();
  if (!subject || !body) return toast('ใส่เรื่องและข้อความก่อน', 'warn');
  const id = `N${Date.now().toString(36)}`;
  const note = { id, to_room: f.get('to_room') || '', to_user: f.get('to_user') || '', subject, body, ref: String(f.get('ref') || '').trim(), reply_to: form.dataset.reply || '' };
  commit({ type: 'note', summary: `บันทึกถึง ${note.to_user ? short(staff(note.to_user).name) : roomTitle(note.to_room)}: ${subject}`, effects: { notes: [note] } });
  toast(`ส่งบันทึกแล้ว ${currentUser() ? '' : ''}`.trim());
  setHash('notes', { id, box: 'sent' });
}
export const notesHandlers = { click: {}, submit: { note: submitNote } };
