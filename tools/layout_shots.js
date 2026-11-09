// The exploration screen at a range of screen sizes: a screenshot of each,
// and the measurements that matter (view and map size, overflow, scrolling).
// node tools/layout_shots.js index.html <outDir> [tag]   (needs: npm install playwright)
const { chromium } = require('playwright');
const path = require('path');
const SIZES = [
  ['phone_se', 375, 667, 2, true], ['se_safari', 375, 553, 2, true], ['phone', 390, 844, 3, true], ['phone_safari', 390, 664, 3, true], ['phone_land', 844, 390, 3, true],
  ['ipad_port', 820, 1180, 2, true], ['ipad_land', 1180, 820, 2, true],
  ['laptop_720', 1280, 720, 1, false], ['laptop_900', 1440, 900, 2, false],
  ['pete', 1667, 910, 2, false], ['hd', 1920, 1080, 1, false], ['big', 2560, 1400, 1, false],
  ['short_wide', 1280, 600, 1, false],
];
(async () => {
  const [html, outDir, tag] = process.argv.slice(2);
  const b = await chromium.launch();
  const report = [];
  for (const [name, w, h, dpr, touch] of SIZES) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: Math.min(dpr, 2), hasTouch: touch, isMobile: touch && w < 900 });
    const errs = [];
    p.on('pageerror', e => errs.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await p.goto('file://' + path.resolve(html));
    await p.waitForTimeout(500);
    await p.evaluate(() => {
      startBundled();
      ['chooser', 'menu', 'roster', 'town', 'about'].forEach(id => { var el = document.getElementById(id); if (el) el.classList.remove('on'); });
      startTestParty(PACK.testParties[0]);
      ['chooser', 'menu', 'roster', 'town', 'about'].forEach(id => { var el = document.getElementById(id); if (el) el.classList.remove('on'); });
      ['The way is blocked.', 'Open the chest — press Use.', 'Something is standing in the passage.'].forEach(t => say(t));
      say('Fascinating. And coming this way.', party[1].name);
      say('132 gold from the bodies.');
      say('You make a cold camp. The party recovers a little. 1 more stop worth making here.', null, 'say');
      party[1].bp = 0;
      redraw();
    });
    await p.waitForTimeout(250);
    const m = await p.evaluate(() => {
      const r = id => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
      const de = document.documentElement;
      const off = [];
      ['viewWrap', 'mapWrap', 'look', 'party', 'pad', 'threat'].forEach(id => {
        const b = document.getElementById(id).getBoundingClientRect();
        if (b.right > innerWidth + 0.5 || b.bottom > innerHeight + 0.5 || b.left < -0.5 || b.top < -0.5) off.push(id);
      });
      const pad = document.getElementById('pad');
      const lastBtn = pad.querySelector('[data-act=rest]').getBoundingClientRect();
      return { view: r('viewWrap'), map: r('mapWrap'), look: r('look'), mlog: r('mlog'), party: r('party'), pad: r('pad'),
               footer: (function () { const b = document.querySelector('#app footer').getBoundingClientRect(); return { y: Math.round(b.top), h: Math.round(b.height) }; })(),
               scrollW: de.scrollWidth, scrollH: de.scrollHeight, iw: innerWidth, ih: innerHeight, offscreen: off,
               restVisible: lastBtn.bottom <= innerHeight + 0.5 };
    });
    m.aspect = m.view ? +(m.view.w / Math.max(1, m.view.h)).toFixed(2) : null;
    await p.screenshot({ path: path.join(outDir, (tag || '') + name + '.png') });
    report.push({ name, w, h, view: m.view && (m.view.w + 'x' + m.view.h), aspect: m.aspect, map: m.map && (m.map.w + 'x' + m.map.h),
                  logH: m.mlog && m.mlog.h, offscreen: m.offscreen.join(',') || '-', hscroll: m.scrollW > m.iw, vscroll: m.scrollH > m.ih, restVisible: m.restVisible, errs: errs.length });
    if (errs.length) console.log(name, errs.slice(0, 3));
    await p.close();
  }
  console.table(report);
  await b.close();
})();
