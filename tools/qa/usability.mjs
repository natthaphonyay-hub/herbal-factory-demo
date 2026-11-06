// ผู้ตรวจความใช้ง่าย (ทีม QA): เปิดหน้างานหลักของแต่ละบทบาทบนคอมและมือถือ จับภาพ ตรวจการเข้าถึงเบื้องต้นด้วยโค้ดในเครื่อง (ไม่โหลดสคริปต์ภายนอก)
// วัดขนาดปุ่มบนมือถือ ข้อความเล็กเกินไป และหน้าล้นจอ ผลลง usability-results.json ภาพลงโฟลเดอร์ ภาพ/
// วิธีรัน: node tools/qa/usability.mjs --out <โฟลเดอร์ผล> --shots <โฟลเดอร์ภาพ>
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, launch, PAGE_HELPERS, sleep } from './lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('out', join(process.cwd(), 'qa-out'));
const SHOTS = arg('shots', join(OUT, 'ภาพ'));
mkdirSync(OUT, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

// งานหลักของแต่ละบทบาท (หน้าเริ่มของงาน)
const TASKS = [
  ['01-คลัง-รับเข้า', 'U01', 'store?tab=receive&item=91004'],
  ['02-คลัง-เบิกออก', 'U01', 'store?tab=issue'],
  ['03-คลัง-จัดซื้อ', 'U01', 'store?tab=buy'],
  ['04-คลัง-คงคลัง', 'U01', 'store?tab=stock'],
  ['05-QC-คิวรอปล่อยผ่าน-เจ้าหน้าที่', 'U04', 'qc?tab=queue'],
  ['06-QC-คิวรอปล่อยผ่าน-หัวหน้า', 'U05', 'qc?tab=queue'],
  ['07-ผลิต-บอร์ด', 'U03', 'prod?tab=board'],
  ['08-ผลิต-เปิดงาน', 'U03', 'prod?tab=new'],
  ['09-หน้างาน', 'U03', 'job?id=J70-839'],
  ['10-ขาย-ลูกหนี้', 'U07', 'sales?tab=ar'],
  ['11-บันทึกถึงฝ่าย', 'U03', 'notes'],
  ['12-ภาพรวม', 'U00', 'overview'],
  ['13-ประวัติการแก้ไข', 'U00', 'log'],
  ['14-ทะเบียน', 'U00', 'registers'],
  ['15-ผลิตภัณฑ์', 'U00', 'product?code=4089'],
  ['16-รายการ-ขมิ้นชันสด', 'U00', 'item?code=1001'],
];

const srv = await startServer();
srv.state.metaBase = '2026-11-05';
const br = await launch();
const page = br.page;
await page.send('Page.navigate', { url: `${srv.origin}/data/meta.json` });
await sleep(200);
await page.ev(`localStorage.clear(); localStorage.setItem('qa-now', '${Date.parse('2026-11-06T09:00:00+07:00')}'); true`);

async function shot(name, width) {
  const m = await page.ev(`({ w: document.documentElement.scrollWidth, h: Math.min(document.documentElement.scrollHeight, 4200) })`);
  await page.send('Emulation.setDeviceMetricsOverride', { width, height: m.h, deviceScaleFactor: 1, mobile: width < 700 });
  await sleep(150);
  const r = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(SHOTS, `${name}-${width}.png`), Buffer.from(r.result.data, 'base64'));
  await page.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 });
}

const results = [];
for (const [name, user, hash] of TASKS) {
  const rec = { name, user, hash };
  for (const width of [1440, 390]) {
    await page.ev(`localStorage.setItem('hfd-user', JSON.stringify('${user}')); true`);
    const ms = await page.open(srv.origin, hash, width);
    await sleep(250);
    const m = await page.ev(`(() => {
      const vw = innerWidth;
      const overflow = document.documentElement.scrollWidth > vw + 1;
      const small = [...document.querySelectorAll('a, button, input, select, textarea, summary, [role="button"]')].filter((e) => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && (r.width < 24 || r.height < 24) && !(e.tagName === 'A' && getComputedStyle(e.parentElement).display.includes('inline') && e.closest('p, li, td')); });
      const tinyText = [...document.querySelectorAll('#main *')].filter((e) => e.children.length === 0 && e.textContent.trim() && parseFloat(getComputedStyle(e).fontSize) < 12).length;
      const h1 = document.querySelector('#main h1')?.textContent.trim().slice(0, 60) || '';
      // รอบแก้ QA: ตำแหน่งฟอร์มแรกจากบนสุดของหน้า (QA-026 ฟอร์มรับเข้าบนมือถืออยู่ลึก)
      const fm = document.querySelector('#main form[data-form="receive"], #main form[data-form="issue"], #main form[data-form="job"], #main form[data-form="pr"]');
      const formTop = fm ? Math.round(fm.getBoundingClientRect().top + scrollY) : null;
      const nestedScroll = [...document.querySelectorAll('#main .kcol-b')].filter((e) => e.scrollHeight > e.clientHeight + 2 && getComputedStyle(e).overflowY !== 'visible').length;
      const locked = !!document.querySelector('#main .locked');
      return { formTop, nestedScroll, overflow, smallTargets: small.length, smallEx: small.slice(0, 4).map((e) => (e.getAttribute('aria-label') || e.textContent || e.name || e.tagName).trim().slice(0, 30)), tinyText, h1, locked, height: document.documentElement.scrollHeight, buttons: document.querySelectorAll('#main button:not([disabled])').length, inputs: document.querySelectorAll('#main input, #main select, #main textarea').length };
    })()`);
    rec[width] = { loadMs: ms, ...m };
    if (width === 1440) {
      rec.a11y = await page.ev(`(() => {
        const name = (e) => (e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent || '').trim();
        const labelled = (e) => e.closest('label') || (e.id && document.querySelector('label[for="' + e.id + '"]')) || e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.type === 'hidden' || e.type === 'submit';
        const out = {};
        out.unlabeledInputs = [...document.querySelectorAll('#main input, #main select, #main textarea')].filter((e) => !labelled(e)).map((e) => e.name || e.id || e.type).slice(0, 6);
        out.namelessButtons = [...document.querySelectorAll('#main button, #main a[href]')].filter((e) => !name(e) && !e.querySelector('img[alt]:not([alt=""])')).length;
        out.imgNoAlt = [...document.querySelectorAll('#main img')].filter((e) => !e.hasAttribute('alt')).length;
        const hs = [...document.querySelectorAll('#main h1, #main h2, #main h3, #main h4')].map((h) => Number(h.tagName[1]));
        out.headingSkips = hs.filter((h, i) => i > 0 && h - hs[i - 1] > 1).length;
        out.h1Count = hs.filter((h) => h === 1).length;
        out.lang = document.documentElement.lang;
        out.tablesNoHeader = [...document.querySelectorAll('#main table')].filter((t) => !t.querySelector('th')).length;
        return out;
      })()`);
    }
    await shot(name, width);
  }
  results.push(rec);
  process.stdout.write(`${name} ${rec[1440].h1} มือถือ ล้นจอ ${rec[390].overflow} ปุ่มเล็ก ${rec[390].smallTargets} a11y ${JSON.stringify(rec.a11y)}\n`);
}
writeFileSync(join(OUT, 'usability-results.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
br.close();
srv.close();
process.exit(0);
