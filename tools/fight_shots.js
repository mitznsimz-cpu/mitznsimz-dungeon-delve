// The fight screen at a range of screen sizes: a screenshot of each, and the
// sizes that matter (stage, the tallest figure, the log, the actions, overflow).
// node tools/fight_shots.js index.html <outDir> [tag]   (needs: npm install playwright)
const { chromium } = require('playwright');
const path = require('path');
const SIZES = [
  ['se_safari', 375, 553, 2, true], ['phone_safari', 390, 664, 3, true], ['phone', 390, 844, 3, true], ['phone_land', 844, 390, 3, true],
  ['ipad_port', 820, 1180, 2, true], ['ipad_land', 1180, 820, 2, true],
  ['laptop_720', 1280, 720, 1, false], ['laptop_900', 1440, 900, 2, false],
  ['pete', 1667, 910, 2, false], ['hd', 1920, 1080, 1, false], ['big', 2560, 1400, 1, false],
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
      var tp = PACK.testParties.find(function (t) { return /rogue/i.test(t.name || t.label || ''); }) || PACK.testParties[PACK.testParties.length - 1];
      startTestParty(tp);
      ['chooser', 'menu', 'roster', 'town', 'about'].forEach(id => { var el = document.getElementById(id); if (el) el.classList.remove('on'); });
      startCombat(null, [{ ref: 'mn.goblin', count: 2 }, { ref: 'mn.goblinArcher', count: 1 }]);
      renderCombat();
    });
    await p.waitForTimeout(400);
    const m = await p.evaluate(() => {
      const r = sel => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), r: b.right, b: b.bottom }; };
      const list = document.getElementById('cRoster') || document.querySelectorAll('#roster')[1];
      const lb = list.getBoundingClientRect();
      const acts = [...document.querySelectorAll('#acts button')];
      const lastAct = acts.length ? acts[acts.length - 1].getBoundingClientRect() : { bottom: 0 };
      const hits = (typeof foeHits !== 'undefined' ? foeHits : []).concat(typeof allyHits !== 'undefined' ? allyHits : []);
      const fig = hits.length ? Math.round(Math.max.apply(null, hits.map(x => x.h / 1.2))) : 0;
      const figMin = hits.length ? Math.round(Math.min.apply(null, hits.map(x => x.h / 1.2))) : 0;
      const off = ['#foeWrap', '#clog', '#tgt', '#acts'].filter(s => { const q = r(s); return q && (q.r > innerWidth + .5 || q.b > innerHeight + .5); });
      return { stage: r('#foeWrap'), log: r('#clog'), acts: r('#acts'), nActs: acts.length, fig, figMin,
               list: lb.width > 0 && lb.height > 0 ? Math.round(lb.width) + 'x' + Math.round(lb.height) : 'hidden',
               lastActVisible: lastAct.bottom <= innerHeight + 0.5, off, dpr: devicePixelRatio };
    });
    await p.screenshot({ path: path.join(outDir, (tag || '') + name + '.png') });
    report.push({ name, size: w + 'x' + h, stage: m.stage.w + 'x' + m.stage.h, figs: m.figMin + '-' + m.fig, log: m.log.h, list: m.list,
                  acts: m.nActs, lastAct: m.lastActVisible, off: m.off.join(',') || '-', errs: errs.length });
    if (errs.length) console.log(name, errs.slice(0, 3));
    await p.close();
  }
  console.table(report);
  await b.close();
})();
