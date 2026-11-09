// MSDD v4.7 — sound: Hold the Line's shared sound.js, loaded beside the game,
// driven against a fake Web Audio so it runs headless; and the Delve's side:
// every sound the game asks for exists, the settings are kept, and the game
// is simply silent without the file.
const fs = require('fs');
const src = fs.readFileSync('./index.html', 'utf8');

function grab(tag) {
  const re = new RegExp('/\\* ==== ' + tag + ' START ==== \\*/([\\s\\S]*?)/\\* ==== ' + tag + ' END ==== \\*/');
  const mm = src.match(re);
  if (!mm) { console.error('FAIL: ' + tag + ' markers missing'); process.exit(1); }
  return mm[1];
}
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? '  -> ' + x : '')); } };

/* A Web Audio that builds nothing and remembers what it was asked for. */
function fakeAudio() {
  const log = { ctx: 0, osc: 0, noise: 0, filt: 0, started: 0, resumed: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
  const node = extra => Object.assign({ connect() {}, disconnect() {} }, extra || {});
  class AC {
    constructor() { log.ctx++; this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 8000; this.destination = node(); }
    resume() { log.resumed++; this.state = 'running'; return Promise.resolve(); }
    createGain() { return node({ gain: param() }); }
    createOscillator() { log.osc++; return node({ type: 'sine', frequency: param(), start() { log.started++; }, stop() {} }); }
    createBufferSource() { log.noise++; return node({ buffer: null, start() { log.started++; }, stop() {} }); }
    createBiquadFilter() { log.filt++; return node({ type: 'lowpass', frequency: param(), Q: param() }); }
    createBuffer(ch, len) { const d = new Float32Array(len); return { getChannelData: () => d }; }
  }
  return { AC, log };
}
function loadSound(withAudio) {
  const ss = fs.readFileSync('./sound.js', 'utf8');
  const fa = fakeAudio(), listeners = {};
  const doc = { addEventListener(k, fn) { listeners[k] = fn; }, removeEventListener(k) { delete listeners[k]; } };
  const win = withAudio ? { AudioContext: fa.AC } : {};
  const MS = new Function('window', 'document', ss + '\nreturn MitzSound;')(win, doc);
  return { MS, log: fa.log, listeners };
}

console.log('\n[SO1] sound.js beside the game');
ok('sound.js sits beside the game', fs.existsSync('./sound.js'), 'copy sound.js from Hold the Line into this folder');
const base = fs.existsSync('./sound.js') ? loadSound(true) : null;
ok('it loads on its own', !!(base && base.MS && base.MS.create));
ok('it is version 1.x', base && /^1\.\d+\.\d+$/.test(base.MS.VERSION), base && base.MS.VERSION);
const NAMES = base ? base.MS.create().NAMES : [];
ok('seventeen sounds, all made in the browser', NAMES.length === 17, NAMES.join(','));
ok('the game loads it beside itself, after motion.js', /<script src="motion\.js"><\/script>\s*<script src="sound\.js"><\/script>/.test(src));
ok('and plays on silent without it', /typeof MitzSound !== 'undefined' && MitzSound\.create/.test(src) &&
   /function sfx\(name, gain\) \{\s+if \(!SOUND\) return false;/.test(src));

console.log('\n[SO2] how it behaves (a fake Web Audio)');
if (base) {
  const { MS, log, listeners } = loadSound(true);
  const snd = MS.create({ enabled: true, volume: 0.7 });
  ok('nothing plays before a click or a key (browsers forbid it)', snd.play('clang') === false && !snd.ready());
  ok('the first click is listened for', typeof listeners.pointerdown === 'function' && typeof listeners.keydown === 'function');
  listeners.pointerdown();
  ok('and it starts the audio', log.resumed === 1 && snd.ready());
  ok('a clang plays, made of tones and noise', snd.play('clang') === true && log.osc >= 5 && log.noise >= 1 && log.started >= 6);
  ok('the same sound twice within 45 ms plays once', snd.play('clang') === false);
  ok('an unknown sound plays nothing', snd.play('kazoo') === false);
  snd.enabled(false);
  ok('switched off, nothing plays', snd.play('thud') === false && snd.enabled() === false);
  snd.enabled(true);
  ok('the volume stays between 0 and 1', snd.volume(2) === 1 && snd.volume(-1) === 0 && snd.volume(0.4) === 0.4);
  let threw = null, played = 0;
  NAMES.forEach(n => {
    const p = loadSound(true).MS.create(); p.unlock();
    try { if (p.play(n)) played++; } catch (e) { threw = n + ': ' + e.message; }
  });
  ok('all seventeen sounds build without a throw', !threw && played === NAMES.length, threw || played);
  const s2 = loadSound(true).MS.create(); s2.unlock();
  let n = 0; NAMES.slice(0, 12).forEach(nm => { if (s2.play(nm)) n++; });
  ok('at most ten play at once', n === 10, n);
  const s3 = loadSound(false).MS.create();
  let quiet = true;
  try { s3.unlock(); quiet = s3.play('clang') === false && !s3.ready(); } catch (e) { quiet = false; }
  ok('with no Web Audio at all it is silent, not broken', quiet);
} else ok('sound.js to drive', false);
pageChecks();

function pageChecks() {
  console.log('\n[SO3] the game asks only for sounds that exist');
  const stage = grab('STAGE CORE');
  const asked = new Set();
  (src.match(/sfx\('([a-z]+)'/g) || []).forEach(m => asked.add(m.slice(5, -1)));
  (stage.match(/sound\([^,]+, '([a-z]+)'/g) || []).forEach(m => asked.add(m.match(/'([a-z]+)'/)[1]));
  const tables = stage.match(/STAGE_(HIT|DEATH)_SOUND = \{[^}]+\}/g) || [];
  tables.forEach(t => (t.match(/'([a-z]+)'/g) || []).forEach(q => asked.add(q.slice(1, -1))));
  ok('the game asks for ' + asked.size + ' different sounds', asked.size >= 14, [...asked].join(','));
  const missing = [...asked].filter(n => NAMES.indexOf(n) < 0);
  ok('every one of them is in sound.js', missing.length === 0, missing.join(','));
  ok('ranged shots twang, workings whoosh', /flies === 'arrow' \? 'twang' : 'whoosh'/.test(stage));
  ok('a fight opens with the dice for initiative, and a horn for a boss', /sfx\('horn'\);\s+sfx\('dice', 0\.7\);/.test(src));
  ok('doors, chests, coins, stairs, traps, rubble and webs all sound', ['door', 'clack', 'coin', 'thump', 'crack', 'crumble'].every(n => asked.has(n)) &&
     /sfx\(r\.kind === 'web' \? \(r\.lightCost \? 'whoosh' : 'whiff'\) : 'crumble'\)/.test(src));
  ok('the town: coins for the shop, a chime from the temple, a clang at the anvil',
     /if \(r\.ok\) \{ gold = r\.gold; sfx\('coin'\); \}/.test(src) && /doRest\(party, gold\);\s+if \(r\.ok\) \{ gold = r\.gold; sfx\('chime'\); \}/.test(src) &&
     /sfx\('clang', 0\.6\)/.test(src));
  ok('a turn\'s sounds wait for their beat, and a skip silences the rest',
     /STAGE\.sounds\.push\(setTimeout\(function \(\) \{ sfx\(name, gain\); \}, Math\.round\(delay \* 1000\)\)\)/.test(src) &&
     /function stageHush\(\) \{/.test(src));

  console.log('\n[SO4] the settings');
  ok('the menu has sound, volume and reduced motion', /id="soundToggle"/.test(src) && /id="soundVol" min="0" max="100"/.test(src) &&
     /id="motionToggle"/.test(src));
  ok('M turns the sound on and off, and the footer says so', /if \(k === 'm'\) \{\s+setSound\(!PREFS\.sound\);/.test(src) && /M sound/.test(src));
  ok('typing a campaign name no longer walks the party', /if \(tag === 'INPUT' \|\| tag === 'TEXTAREA' \|\| tag === 'SELECT'\) return;/.test(src));
  // run the settings code itself, against a fake browser
  const a = src.indexOf('var PREFS = loadPrefs();'), b = src.indexOf('var reduceMotion = PREFS.reduce');
  const block = src.slice(a, src.indexOf('\n', b) + 1);
  const run = (stored, systemReduce, withSound) => {
    const store = {}; if (stored !== undefined) store['dev_prefs'] = stored;
    const els = {};
    const el = () => ({ textContent: '', value: '', disabled: false, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
    ['soundToggle', 'soundVol', 'motionToggle', 'settingsNote'].forEach(id => { els[id] = el(); });
    const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
    const MS = withSound ? loadSound(true).MS : undefined;
    const f = new Function('localStorage', 'MSDD_NS', 'MitzSound', 'document', 'matchMedia', 'stageHush',
      block + '\nreturn { PREFS: PREFS, SOUND: SOUND, setSound: setSound, setVolume: setVolume, setReduceMotion: setReduceMotion,' +
      ' renderSettings: renderSettings, rm: function () { return reduceMotion; }, sfx: sfx, soundOn: soundOn };');
    const api = f(ls, 'dev_', MS, { getElementById: id => els[id] }, () => ({ matches: systemReduce }), () => {});
    return { api, store, els };
  };
  const d = run(undefined, false, true);
  ok('first time: sound on at 70%, motion as the system has it', d.api.PREFS.sound === true && d.api.PREFS.volume === 0.7 && d.api.rm() === false);
  ok('a system that asks for reduced motion gets it', run(undefined, true, true).api.rm() === true);
  d.api.setSound(false); d.api.setVolume(0.3); d.api.setReduceMotion(true);
  const saved = JSON.parse(d.store['dev_prefs']);
  ok('changes are kept in this browser', saved.sound === false && saved.volume === 0.3 && saved.reduce === true);
  ok('and the menu says what they are', d.els.soundToggle.textContent === 'Sound: off' && d.els.soundToggle.attrs['aria-pressed'] === 'false' &&
     d.els.soundVol.value === '30' && d.els.soundVol.disabled && d.els.motionToggle.textContent === 'Reduced motion: on');
  const back = run(d.store['dev_prefs'], false, true);
  ok('next visit they come back, even over the system setting', back.api.PREFS.sound === false && back.api.rm() === true &&
     back.api.SOUND.enabled() === false && back.api.SOUND.volume() === 0.3);
  ok('a spoiled setting is ignored, not fatal', run('{not json', false, true).api.PREFS.sound === true);
  const silent = run(undefined, false, false);
  ok('without sound.js: no player, sfx does nothing, the button says why', silent.api.SOUND === null && silent.api.sfx('clang') === false &&
     !silent.api.soundOn() && (silent.api.renderSettings(), silent.els.soundToggle.disabled && /not beside the game/.test(silent.els.settingsNote.textContent)));

  console.log('\n' + (fail ? 'FAILED' : 'PASSED') + ' \u2014 ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
