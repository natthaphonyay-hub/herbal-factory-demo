// ตรวจเจาะจุดที่บอทจำลองหาปุ่มไม่เจอ: ผู้ตรวจรับพัสดุ รับชำระ ปล่อยผ่าน ย้ายงาน
import { startServer, launch, PAGE_HELPERS, sleep } from './lib.mjs';
const srv = await startServer(); srv.state.metaBase = '2026-11-05';
const br = await launch(); const page = br.page;
await page.send('Page.navigate', { url: `${srv.origin}/data/meta.json` }); await sleep(200);
await page.ev(`localStorage.clear(); localStorage.setItem('hfd-user', JSON.stringify('U00')); localStorage.setItem('qa-now', '${Date.parse('2026-11-06T09:00:00+07:00')}'); true`);
await page.open(srv.origin, 'overview'); await page.ev(PAGE_HELPERS);
const out = await page.ev(`(() => {
  const { data, ui, cfg } = window.qa; const { S, D } = data;
  const go = (h) => { history.replaceState(null, '', h); ui.nav.route(); };
  const r = {};
  // 1 ผู้ตรวจรับพัสดุ (หัวหน้าฝ่ายผลิต) เห็นปุ่มตรวจรับที่ไหนบ้าง
  data.setUser('U03');
  const insp = D.prOpen.filter((x) => x.st.key === 'inspected');
  r.prAtInspected = insp.length;
  const found = [];
  for (const h of ['#/overview', '#/prod', '#/prod?tab=board', '#/prod?tab=inspect', '#/store?tab=buy', '#/notes', '#/registers', '#/docs', '#/process']) { go(h); const n = document.querySelectorAll('[data-step="inspected"]').length; const locked = !!document.querySelector('#main .locked'); found.push(h + (locked ? ' ล็อก' : '') + ' ปุ่ม ' + n); }
  r.inspectButtons = found;
  // 2 ลูกหนี้: ใบค้างชำระทั้งหมด กับปุ่มรับชำระที่เห็น
  data.setUser('U07'); go('#/sales?tab=ar');
  r.unpaid = S.invoices.filter((v) => !v.paid_date && v.date <= S.today).length;
  r.payButtons = document.querySelectorAll('[data-act="pay"]').length;
  r.arText = (document.querySelector('[data-act="pay"]')?.closest('section')?.querySelector('.panel-h')?.textContent || '').trim().slice(0, 120);
  // 3 คิวปล่อยผ่าน
  data.setUser('U05'); go('#/qc?tab=queue');
  r.queueWithResult = D.qcQueue.filter((x) => x.result).length; r.queue = D.qcQueue.length;
  r.releaseButtons = document.querySelectorAll('[data-act="release"][data-res="ผ่าน"]').length;
  // 4 หน้างาน: ปุ่มย้ายหายในขั้นไหน
  const miss = {};
  for (const c of D.board) { if (c.stage === 'รอปล่อยผ่าน' || c.stage === 'ตรวจสอบแล้ว') continue; data.setUser(c.job.lane === 'ผลิต' ? 'U06' : 'U02'); go('#/job?id=' + encodeURIComponent(c.job.job_id)); const b = document.querySelector('[data-act="move"][data-dir="1"]'); if (!b) { const k = c.job.lane + ' ' + c.stage + (document.querySelector('#main .locked') ? ' ล็อก' : ''); miss[k] = (miss[k] || 0) + 1; } }
  r.moveMissing = miss;
  return r;
})()`);
console.log(JSON.stringify(out, null, 1));
br.close(); srv.close(); process.exit(0);
