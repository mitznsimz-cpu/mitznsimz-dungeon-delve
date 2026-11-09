// Choosing and switching adventures, and the split asset file.
const fs=require('fs');
const src=fs.readFileSync('./index.html','utf8');
const assets=fs.existsSync('./msdd_assets.js')
  ? fs.readFileSync('./msdd_assets.js','utf8') : '';
let pass=0,fail=0;
const ok=(n,c,x)=>{if(c){pass++;console.log('  ok   '+n);}else{fail++;console.log('  FAIL '+n+(x?'  -> '+x:''));}};

console.log('\n[A1] there is a front screen, and a way back to it');
ok('a chooser screen exists', /id="chooser"/.test(src));
ok('it is what opens first', /<div id="chooser" class="on">/.test(src));
ok('the roster no longer opens first', !/<div id="roster" class="on">/.test(src),
   'two screens claiming to be first would overlap');
ok('it can be opened from anywhere', /function openChooser/.test(src));
ok('town has a way out', /id="changeAdv"/.test(src));
ok('so does the menu', /id="backToChooser"/.test(src));
ok('and the roster', /Other adventures/.test(src));
ok('every route calls the same function', (src.match(/openChooser\(\)/g)||[]).length >= 4,
   (src.match(/openChooser\(\)/g)||[]).length + ' call sites');

console.log('\n[A1b] the first screen is filled at boot');
// It was marked visible in the markup but only populated by openChooser(),
// so launching the game showed a heading and nothing else.
const boot = src.slice(src.lastIndexOf('readPalette();'));
ok('boot renders the chooser', /renderChooser\(\);/.test(boot),
   'the first screen would open empty');
ok('and remembers the bundled pack first', /rememberBase\(\);\s*\n\s*renderChooser\(\);/.test(boot),
   'renderChooser names BUNDLED_BASE, so it must exist by then');
ok('boot still sets up the roster behind it', /renderRoster\(\);/.test(boot));
// The loader callbacks contain a redraw() too, so compare against the final
// unconditional one at the end of boot.
ok('the chooser is rendered before the first unconditional redraw',
   boot.indexOf('renderChooser()') < boot.lastIndexOf('redraw();'));

// Simulate a boot render and count what the player would actually see.
(function () {
  const nodes = {};
  const mk = id => ({ id, innerHTML: '', className: '', style: { cssText: '' }, children: [],
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    appendChild(c){ this.children.push(c); this.innerHTML += c.innerHTML || ''; },
    addEventListener(){}, dataset: {}, textContent: '' });
  global.document = { getElementById: id => nodes[id] || (nodes[id] = mk(id)),
                      querySelectorAll: () => [], createElement: () => mk('new') };
  const list = new Function(assets +
    src.match(/\/\* ==== BUNDLED PACK START ==== \*\/([\s\S]*?)\/\* ==== BUNDLED PACK END ==== \*\//)[0] +
    'var party=[]; var BUNDLED_BASE=null; var bringParty=true; var gold=0;' +
    'function partyCanTravel(){return party.length>0;}' +
    'function partySummary(){return "";}' +
    'function esc(s){return String(s);}' +
    'function rememberBase(){ if(!BUNDLED_BASE) BUNDLED_BASE=JSON.parse(JSON.stringify(BUNDLED_PACK)); }' +
    src.match(/function renderChooser\(\) \{[\s\S]*?\n\}/)[0] +
    '\nrememberBase(); renderChooser(); return document.getElementById("chooseList");')();
  ok('a fresh launch offers something to click', list.children.length >= 3,
     list.children.length + ' options');
  ok('the written adventure is one of them', /Ashkeld/.test(list.innerHTML));
  ok('so is the generator', /Endless Delve/.test(list.innerHTML));
  ok('resume is absent with no party', !/Carry on/.test(list.innerHTML),
     'nothing to carry on with before a party exists');
})();

console.log('\n[A2] every option is offered');
['The written adventure','Endless Delve','Load an adventure','Export what you are playing']
  .forEach(t=>ok('offers: '+t, src.indexOf(t)>=0));
ok('resuming is offered only mid-run', /if \(inPlay\) \{[\s\S]{0,200}'Carry on'/.test(src));
ok('exporting is offered only mid-run', /if \(inPlay\) \{[\s\S]{0,400}Export what you are playing/.test(src));
ok('the bundled adventure is named from the pack', /opt\(base\.name,/.test(src));

console.log('\n[A3] switching does not leak the old run');
ok('there is one reset routine', /function resetRun/.test(src));
ok('it clears the party', /party = \[\];/.test(src.slice(src.indexOf('function resetRun'),
                                                        src.indexOf('function refreshRosterForPack'))));
const reset=src.slice(src.indexOf('function resetRun'), src.indexOf('function refreshRosterForPack'));
['world = {}','questFlags = {}','gold = 0','threat = 0','lightTurns = 0','msgLog = []','cst = null']
  .forEach(bit=>ok('reset clears '+bit.split(' ')[0], reset.indexOf(bit)>=0));
ok('it closes any open overlay', /\['combat', 'town', 'evt'\]/.test(reset),
   'a fight or a shop left open would survive the switch');
ok('it resets the map view', /mapView\.scale = null/.test(reset));
// resetRun now takes a flag saying whether the party travels, so match the
// call rather than the exact old form.
ok('loading a pack uses it',
   /resetRun\(carry\)/.test(src.slice(src.indexOf('function applyPack'),
                                      src.indexOf('function applyPack')+2500)));
ok('every entry point uses it', (src.match(/resetRun\(carry\)/g)||[]).length >= 3,
   (src.match(/resetRun\(carry\)/g)||[]).length + ' call sites');
ok('and each decides whether the party comes along',
   (src.match(/var carry = bringParty && partyCanTravel\(\)/g)||[]).length >= 3);
ok('the written adventure is reloaded from a clean copy',
   /loadPack\(JSON\.parse\(JSON\.stringify\(BUNDLED_BASE \|\| BUNDLED_PACK\)\)\)/.test(src),
   'reloading the mutated pack would carry state across');

console.log('\n[A3b] finding the way out, and how deep to go');
ok('the exit is a named place, not a coincidence', /function isExitCell/.test(src));
ok('stepping on it opens the town', /if \(isExitCell\(floor, pos\.x, pos\.y\)\) \{/.test(src));
ok('it is described when you stand on it',
   /isExitCell\(floor, x, y\)\) return /.test(src),
   'the exit cell must produce a description of its own');
ok('the automap marks it', /the way out, so it can be found again/.test(src),
   'a player who wanders off should be able to find their way back');
ok('the marker only shows once the cell is known', /ex\[floor\.entry\.join\(','\)\]/.test(src),
   'marking an unexplored exit would give the map away');
ok('the marker carries an arrow at readable zoom',
   src.indexOf("fillText('\\u2191'") >= 0,
   'an unlabelled dot is not obviously the way out');

ok('the floor count accepts a number or "endless"', /A number, or "endless"/.test(src));
ok('a finite run can go much deeper than before', (()=>{
  const m=src.match(/Math\.min\((\d+), parseInt\(depthRaw/);
  return m && +m[1] >= 20;})(), 'the old cap was 12');
ok('"endless" is recognised', /var endless = \/\^e\/i\.test/.test(src));
ok('an endless run starts with a few floors and grows', /endless \? 3 :/.test(src));
ok('the game builds the next floor when you reach it', /function ensureFloorExists/.test(src));
ok('it is called before the floor is loaded',
   src.indexOf('ensureFloorExists(target.floor)') < src.indexOf('var next = packFloor(target.floor)'));

console.log('\n[A3c] a veteran party can travel');
// The series' signature: characters carried from one game to the next.
ok('a party can be brought to a new adventure', /function partyCanTravel/.test(src));
ok('the chooser offers the choice', /id="bringParty"/.test(src));
ok('it is on by default', /var bringParty = true;/.test(src));
ok('resetRun can keep them', /function resetRun\(keepParty\)/.test(src));
ok('the world still resets around them', /function resetRunInner/.test(src));
const keep=src.slice(src.indexOf('function resetRun(keepParty)'), src.indexOf('function resetRunInner'));
ok('carried characters arrive rested', /c\.effects = \[\];/.test(keep) && /c\.status = \[\];/.test(keep));
ok('cooldowns and stances are cleared', /c\.cooldowns = \{\};/.test(keep));
ok('nobody arrives dead', /if \(c\.bp <= 0\) c\.bp = 1;/.test(keep));
ok('their gold comes with them', /carriedGold/.test(keep));
ok('ranks are rebuilt for the new floor', /normalisePositions\(party\)/.test(keep));

console.log('\n[A3d] the way home from depth');
ok('there is a word of recall', /kind === 'recall'/.test(src));
ok('it works in a fight', /st\.recall = true;/.test(src));
ok('and takes you to town afterwards', /if \(wentHome\) pendingRecall = true;/.test(src));
ok('a scroll does the same for parties without a priest',
   /ITEMS\[held\.ref\]\.use\.kind === 'recall'/.test(src));
ok('the scroll is consumed', /party\[userIdx\]\.pack\.splice\(packIndex, 1\)/.test(src));
ok('there is a function that does the travelling', /function returnToTown/.test(src));
ok('it puts you at the mouth of the dungeon', /pos = \{ x: home\.entry\[0\], y: home\.entry\[1\]/.test(src));
ok('an enemy can send you home too', /hasTrait\(foe, 'banish'\)/.test(src));
ok('but rarely', (()=>{
  const m=src.match(/hasTrait\(foe, 'banish'\)[\s\S]{0,60}rng\(\) < ([\d.]+)/);
  return m && +m[1] <= 0.06;})(), 'a coin-flip banish would be miserable');

console.log('\n[A4] the images live in their own file');
ok('an asset file was produced', assets.length > 0);
// v4.9: renders made from STL files are on the back burner until their
// sculptors say yes, so the shipped asset file carries the textures only
ok('it carries no figure renders', !/SPRITE_DATA|SPRITE_INDEX/.test(assets));
ok('and the textures', /var ATLAS_DATA = 'data:image\/jpeg;base64,/.test(assets));
ok('the game file no longer carries them',
   !/var SPRITE_DATA = 'data:/.test(src) && !/var ATLAS_DATA = 'data:/.test(src));
ok('it is pulled in with a script tag, not fetched',
   /<script src="msdd_assets\.js"><\/script>/.test(src),
   'fetch() is blocked on file://, so the game must not depend on it');
ok('the script tag comes before the game', src.indexOf('msdd_assets.js') < src.indexOf('function openChooser'));

ok('the game still runs without the asset file',
   /if \(typeof SPRITE_INDEX === 'undefined'\) \{ var SPRITE_INDEX = \{\}; \}/.test(src) &&
   /if \(typeof ATLAS_INDEX === 'undefined'\) \{ var ATLAS_INDEX = \{\}; \}/.test(src));
ok('the sprite loader checks first, and stays idle while renders are off',
   /if \(typeof SPRITE_DATA === 'undefined' \|\| \(typeof FIGURES_DRAWN !== 'undefined' && FIGURES_DRAWN\)\)/.test(src));
ok('the texture loader checks too', /if \(typeof ATLAS_DATA === 'undefined'\)/.test(src));
ok('the procedural masonry is still there to fall back on', /function masonrySide/.test(src));
ok('so are the vector miniatures', /function drawMini/.test(src));

const kb = s => Math.round(s.length/1024);
// v4.1 raised this from 400, v4.2 to 700: the shared miniature library (about
// 260 kb: Hold the Line's detailed figures at full precision, plus the Delve's
// heroes and its earlier sculpts kept on record) lives in the game file on
// purpose, because every figure must still draw when msdd_assets.js is missing.
// v4.3 to 800: minis 2.1.0 adds Hold the Line's 22 Phase 3 figures (about 45 kb)
// and terrain its drawing and rules (about 40 kb).
// v4.6 to 880: minis 2.3.0's seven terrain figures (about 17 kb) and the
// bestiary's 22 new monsters with habitats (about 8 kb).
// v4.8 to 960: the dungeon's finds, traps and mechanisms, drawn and ruled (about 60 kb).
// v4.9: minis 2.4.0 brings Hold the Line's 103 poses (about 240 kb of figure
// data), so the shared library is now held to its own budget and the rest of
// the game to the one it had
// v4.9 again: minis 2.5.0 brings Hold the Line's eleven female heroes with
// their poses (about 125 kb), so the library's budget goes from 640 to 760.
const coreKb = kb((src.match(/\/\* ==== MINI CORE START ==== \*\/[\s\S]*?\/\* ==== MINI CORE END ==== \*\//) || [''])[0]);
ok('the game file is much smaller than it was, not counting the shared minis', kb(src) - coreKb < 700, (kb(src) - coreKb) + ' kb');
ok('and the shared minis keep to their own budget', coreKb < 760, coreKb + ' kb');
// The shared miniature library is in the game on purpose (above); what the
// assets file must outweigh is the rest of it.
const miniCore = (src.match(/\/\* ==== MINI CORE START ==== \*\/[\s\S]*?\/\* ==== MINI CORE END ==== \*\//) || [''])[0];
// v4.9: with the renders out, the asset file is the textures alone (about 128 kb)
ok('and the textures stay small', kb(assets) > 60 && kb(assets) < 200, kb(assets) + ' kb');

console.log('\n[A9] the game has its own icon, in the Encounter Tracker\'s family');
{
  const head = src.slice(0, src.indexOf('<style>'));
  const svgLink = head.match(/<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,([^"]+)">/);
  const svg = svgLink ? decodeURIComponent(svgLink[1]) : '';
  ok('the tab icon is drawn inside the page, as the tracker\'s is', !!svgLink && /^<svg [^>]*viewBox='0 0 32 32'/.test(svg));
  ok('a gold archway on dark, the tracker\'s colours', /fill='#1E1B16'/.test(svg) && /fill='#C9A227'/.test(svg) && /stroke='#8a6818'/.test(svg) && / A10\.5 10\.5 0 0 1 /.test(svg));
  ok('with a paw: a pad and four toes', (svg.match(/<ellipse /g) || []).length === 1 && (svg.match(/<circle /g) || []).length === 4);
  const pngSize = uri => { const b = Buffer.from(uri.split(',')[1], 'base64');
    return b.slice(1, 4).toString() === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };
  const p32 = head.match(/<link rel="icon" type="image\/png" sizes="32x32" href="(data:image\/png;base64,[^"]+)">/);
  const touch = head.match(/<link rel="apple-touch-icon" href="(data:image\/png;base64,[^"]+)">/);
  ok('a 32-pixel picture for browsers without SVG icons', !!p32 && pngSize(p32[1]).join() === '32,32');
  ok('and a 180-pixel one for an iPhone or iPad home screen', !!touch && pngSize(touch[1]).join() === '180,180');
  ok('each icon once', (head.match(/rel="icon"/g) || []).length === 2 && (head.match(/rel="apple-touch-icon"/g) || []).length === 1);
  const man = JSON.parse(fs.readFileSync('./msdd.webmanifest', 'utf8'));
  const ic = man.icons || [];
  ok('the app icons: the archway as SVG, 192 and 512, and a maskable one for Android', ic.length === 4 &&
     ic.some(i => i.src === 'icon.svg') && ic.some(i => i.src === 'icon-192.png' && i.sizes === '192x192') &&
     ic.some(i => i.src === 'icon-512.png' && i.purpose === 'any') && ic.some(i => i.src === 'icon-maskable-512.png' && i.purpose === 'maskable'));
  const beside = ['icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
  ok('they are all beside the game', beside.every(f => fs.existsSync('./' + f)));
  ok('and its icon.svg is the same archway', fs.existsSync('./icon.svg') && fs.readFileSync('./icon.svg', 'utf8').trim() === svg.trim());
  const sizeOf = f => { const b = fs.readFileSync('./' + f); return [b.readUInt32BE(16), b.readUInt32BE(20)].join(); };
  ok('at the sizes they say', sizeOf('icon-192.png') === '192,192' && sizeOf('icon-512.png') === '512,512' && sizeOf('icon-maskable-512.png') === '512,512');
  const sw = fs.existsSync('./sw.js') ? fs.readFileSync('./sw.js', 'utf8') : '';
  ok('and kept for offline play', beside.every(f => sw.indexOf("'./" + f + "'") >= 0));
}

console.log('\n[A10] About, Ko-fi and the website, to the Mitz & Simz standard');
{
  const KOFI = 'https://ko-fi.com/mitznsimz', WORDS = '☕ Enjoying it? Buy Pete some dice, or Mitz &amp; Simz some treats.';
  const block = id => { const a = src.indexOf('<div id="' + id + '"'); return a < 0 ? '' : src.slice(a, src.indexOf('</div></div>', a)); };
  const about = block('about'), chooser = block('chooser'), menu = block('menu');
  ok('there is an About screen', !!about && /<h2 id="aboutTitle">Mitz &amp; Simz: Dungeon Delve<\/h2>/.test(about));
  ok('with the Ko-fi line, word for word', about.indexOf('href="' + KOFI + '"') >= 0 && about.indexOf(WORDS) >= 0);
  ok('and the website, as .co.uk', /href="https:\/\/mitznsimz\.co\.uk"/.test(about) && !/mitznsimz\.com/.test(src));
  ok('who made it', /Made by Pete at MitzNSimz, Folkestone/.test(about));
  ok('the other games and the tracker', ['mitznsimz-hold-the-line/', 'mitznsimz-tarokk/', 'DnD-Encounter-Tracker/'].every(r => about.indexOf('https://mitznsimz-cpu.github.io/' + r) >= 0));
  ok('where to report bugs', /github\.com\/mitznsimz-cpu\/mitznsimz-dungeon-delve\/issues/.test(about) && /mailto:mitznsimz@gmail\.com/.test(about));
  ok('and that nothing is tracked', /No ads and no tracking/.test(about));
  const links = (src.match(/<a [^>]*href="https?:[^"]*"[^>]*>/g) || []);
  ok('every link opens a new tab and sends no referrer', links.length >= 9 && links.every(a => /target="_blank"/.test(a) && /rel="noopener noreferrer"/.test(a)), links.length + ' links');
  ok('and none carries a tracking tag', !links.some(a => /[?&](utm_|ref=|fbclid|gclid)/.test(a)));
  ok('one discreet line on the front screen', /<p class="supportLine">/.test(chooser) && chooser.indexOf(WORDS) >= 0 && /MitzNSimz\.co\.uk<\/a>/.test(chooser));
  ok('About from the front screen and from the menu', /id="chooserAbout"/.test(chooser) && /id="openAbout"/.test(menu) &&
     /getElementById\('chooserAbout'\)\.addEventListener\('click', function \(e\) \{ e\.preventDefault\(\); openAbout\(\); \}\)/.test(src) &&
     /getElementById\('openAbout'\)\.addEventListener\('click', openAbout\)/.test(src));
  ok('never during play: no links in fights, the town or the dungeon', ['combat', 'town', 'evt'].every(id => !/ko-fi|mitznsimz\.co\.uk/.test(block(id))) &&
     (src.match(/href="https:\/\/ko-fi\.com/g) || []).length === 3);   // front screen, menu, About
  ok('while it is open the keys stay with it, and Escape closes it', /if \(aboutOpen\(\)\) \{ if \(e\.key === 'Escape'\) \{ closeAbout\(\); e\.preventDefault\(\); \} return; \}/.test(src));
  ok('it shows the version in the header', /function openAbout\(\) \{\s+var v = document\.querySelector\('h1 small'\)/.test(src));
}

console.log('\n' + (fail?'FAILED':'PASSED') + ' — '+pass+' passed, '+fail+' failed\n');
process.exit(fail?1:0);
