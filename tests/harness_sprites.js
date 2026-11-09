// Miniature sprites: real renders where a pack has them, vectors where it doesn't.
// v4.9: the renders made from STL files are on the back burner until their
// sculptors give permission. The shipped game names none, the asset file
// carries none, and renders stay off unless ?figures=renders asks for them.
// The machinery is kept, and tested here against FIXTURE: the old atlas's
// index (positions, boxes and facings only, no image data) and a copy of the
// pack with its old render names put back.
const fs=require('fs');
const src=fs.readFileSync('./index.html','utf8');
const assetPath='./msdd_assets.js';
const ASSETS=require('fs').existsSync(assetPath)?require('fs').readFileSync(assetPath,'utf8'):'';

function grab(t){const re=new RegExp('/\\* ==== '+t+' START ==== \\*/([\\s\\S]*?)/\\* ==== '+t+' END ==== \\*/');
 const m=src.match(re); if(!m){console.error('FAIL: '+t+' missing');process.exit(1);} return m[1];}
const FIXTURE = {"mn.goblin":[0,0,256,256,[47,13,209,243],"front"],"mn.goblinArcher":[256,0,256,256,[36,13,220,243],"right"],
  "hero.fighter.m":[512,0,256,256,[54,13,203,243],"front"],"hero.fighter.f":[0,256,256,256,[61,13,195,243],"front"],
  "hero.wizard.f":[256,256,256,256,[35,13,222,243],"left"],"hero.priest.m":[512,256,256,256,[50,13,206,243],"front"]};
const FIX = 'var SPRITE_INDEX = ' + JSON.stringify(FIXTURE) + ', SPRITE_DATA = "data:image/png;base64,";';
// what ships
const SHIP=new Function(ASSETS+grab('SPRITE ATLAS')+grab('TEXTURE ATLAS')+grab('BUNDLED PACK')+grab('PACK CORE')+
 '\nreturn {SPRITE_INDEX,BUNDLED_PACK,validatePack,ATLAS_INDEX};')();
// the machinery, against the fixture
const S=new Function(FIX+grab('SPRITE ATLAS')+grab('TEXTURE ATLAS')+grab('BUNDLED PACK')+grab('PACK CORE')+
 '\nreturn {SPRITE_INDEX,SPRITE_DATA,BUNDLED_PACK,validatePack};')();

let pass=0,fail=0;
const ok=(n,c,x)=>{if(c){pass++;console.log('  ok   '+n);}else{fail++;console.log('  FAIL '+n+(x?'  -> '+x:''));}};
const SHIPPED=S.BUNDLED_PACK;
// the pack as it was before v4.9, with its render names, for the machinery
const P=JSON.parse(JSON.stringify(SHIPPED));
P.monsters['mn.goblin'].sprite='mn.goblin'; P.monsters['mn.goblinArcher'].sprite='mn.goblinArcher';
P.classes.fighter.sprites={male:'hero.fighter.m',female:'hero.fighter.f'};
P.classes.mage.sprites={female:'hero.wizard.f'}; P.classes.priest.sprites={male:'hero.priest.m'};
const OLD={Pete:'hero.fighter.m',Sharron:'hero.fighter.f',Mitz:'hero.priest.m',Simz:'hero.wizard.f'};
P.testParties.forEach(tp=>tp.members.forEach(m=>{ if(OLD[m.name]) m.sprite=OLD[m.name]; }));

console.log('\n[R0] the renders are on the back burner');
ok('the shipped asset file carries no renders', !/SPRITE_DATA|SPRITE_INDEX/.test(ASSETS) && Object.keys(SHIP.SPRITE_INDEX).length===0);
ok('only the textures', Object.keys(SHIP.ATLAS_INDEX).length > 0);
ok('the shipped pack names no render anywhere',
   !Object.values(SHIPPED.monsters).some(m=>m.sprite) &&
   !Object.values(SHIPPED.classes).some(c=>c.sprite||c.sprites) &&
   !SHIPPED.testParties.some(t=>t.members.some(m=>m.sprite)));
ok('every class names a drawn figure for each sex instead',
   Object.values(SHIPPED.classes).every(c=>c.minis && c.minis.male && c.minis.female));
ok('renders stay off unless ?figures=renders asks', /var RENDERS_ON = typeof location !== 'undefined' && \/\[\?&\]figures=renders\\b\//.test(src) &&
   /var FIGURES_DRAWN = !RENDERS_ON \|\|/.test(src) && /function drawSprite[^{]*\{\s*if \(FIGURES_DRAWN\) return false;/.test(src));
ok('and the image is not even loaded while they are off', /typeof SPRITE_DATA === 'undefined' \|\| \(typeof FIGURES_DRAWN !== 'undefined' && FIGURES_DRAWN\)/.test(src));
ok('the roster offers both sexes from the drawn figures alone', /SPRITE_INDEX\[r\] && !\(typeof FIGURES_DRAWN !== 'undefined' && FIGURES_DRAWN\)/.test(src));
ok('the shipped pack loads without a word about missing art', (()=>{ const r=SHIP.validatePack(JSON.parse(JSON.stringify(SHIPPED)));
   return r.ok && !r.warnings.some(w=>/atlas|sprite|render/i.test(w)); })());

console.log('\n[R1] the atlas machinery (against the fixture)');
ok('no renders in the game file', !/var SPRITE_DATA = 'data:/.test(src),
   'the game file should stay readable');
ok('it is indexed by name', Object.keys(S.SPRITE_INDEX).length>0, Object.keys(S.SPRITE_INDEX).join(', '));
ok('every entry carries a bounding box',
   Object.values(S.SPRITE_INDEX).every(v=>Array.isArray(v[4])&&v[4].length===4),
   'without one, sprites float above their base');
ok('bounding boxes are inside the tile',
   Object.values(S.SPRITE_INDEX).every(v=>v[4][0]>=0&&v[4][1]>=0&&v[4][2]<=v[2]&&v[4][3]<=v[3]));

console.log('\n[R2] a pack can point at them (the old Ashkeld, as a fixture)');
const withSprite=Object.keys(P.monsters).filter(k=>P.monsters[k].sprite);
ok('some monsters name a sprite', withSprite.length>0, withSprite.join(', '));
ok('every named sprite exists in the atlas',
   withSprite.every(k=>S.SPRITE_INDEX[P.monsters[k].sprite]),
   'a missing sprite would silently draw nothing');
ok('most monsters still have none', withSprite.length < Object.keys(P.monsters).length,
   'the fallback path must stay exercised');
ok('the validator warns about a sprite that is not there', (()=>{
  const b=JSON.parse(JSON.stringify(P));
  b.monsters['mn.skeleton'].sprite='mn.nothing';
  const r=S.validatePack(b);
  return r.ok && r.warnings.some(w=>/not in the atlas/.test(w));})(),
  'a bad sprite name should warn, not block play');

console.log('\n[R3] a missing sprite falls back to the vector');
ok('lookup returns null when unknown', /if \(!SPRITES_READY \|\| !ref\) return null;/.test(src));
ok('the draw call reports failure', /return false;[\s\S]{0,200}var bb = s\[4\]/.test(src) ||
   /if \(!s\) return false;/.test(src));
ok('combat falls back to drawMini', /if \(!drawSprite\(g, m\.ref[\s\S]{0,200}drawMini\(/.test(src));
// v4.1: a group feature has no single ref, so the corridor draws its leader
ok('the corridor falls back too', /if \(!drawSprite\(g, lead[\s\S]{0,200}drawMini\(/.test(src));
// v4.9: this used to pin `feat.group[0]`, the whole { ref, count } entry, which
// stopped the view drawing whenever a shield line came into sight. Now its ref.
ok('a group in the corridor shows its first member, by its ref',
   /var g0 = feat\.group && feat\.group\[0\];\s*var lead = feat\.ref \|\| \(g0 && \(typeof g0 === 'string' \? g0 : g0\.ref\)\);/.test(src));
ok('a failed atlas load leaves the game playable',
   /img\.onerror = function \(\) \{ SPRITES_READY = false;/.test(src));
ok('nothing is drawn for a monster with no sprite and no atlas',
   /typeof SPRITE_DATA === 'undefined'/.test(src));

console.log('\n[R4] they sit in the same light as the scene');
ok('sprites are tinted toward the palette', /function buildTintedSprites/.test(src));
// destination-in applies to the WHOLE canvas, so using it while drawing a
// sprite erases everything painted before it. Tinting happens once, offscreen.
const dsp0 = src.slice(src.indexOf('function drawSprite'), src.indexOf('/* ---------- textures'));
ok('no canvas-wide compositing happens at draw time',
   dsp0.indexOf('destination-in') < 0 && dsp0.indexOf("globalCompositeOperation") < 0,
   'a composite op inside drawSprite wipes earlier figures and the background');
ok('the tint is baked into offscreen sheets',
   /SPRITES_LIT = make\(/.test(src) && /SPRITES_DARK = make\(/.test(src));
ok('the alpha mask is restored after multiplying', (()=>{
  const b=src.slice(src.indexOf('function buildTintedSprites'), src.indexOf('function tile'));
  return /multiply/.test(b) && /destination-in/.test(b);})(),
  'without restoring alpha the tint paints the transparent margin');
ok('drawing several sprites cannot erase each other',
   (dsp0.match(/g\.drawImage\(SPRITES_/g)||[]).length >= 2 &&
   dsp0.indexOf('destination-in') < 0);
ok('distance darkens them', /if \(l < 0\.999 && SPRITES_DARK\)/.test(src));
ok('they cast a shadow so they stand on the floor', /a contact shadow first/.test(src));
ok('a dead foe is drawn faded, not removed',
   /alive \? 1 : 0\.15/.test(src));

console.log('\n[R5] scaling uses the figure, not the tile');
const dsp = src.slice(src.indexOf('function drawSprite'), src.indexOf('function loadAtlas'));
ok('height is derived from the bounding box', /var scale = hgt \/ bh;/.test(dsp),
   'scaling by tile height would shrink figures by their margin');
ok('width follows the aspect ratio', /var dw = bw \* scale/.test(dsp));
// dx and dy are declared together, so match the expression, not a whole line.
ok('the figure is placed on the ground line', /dy = groundY - dh/.test(dsp),
   'the sprite would float or sink instead of standing on the floor');
ok('and centred horizontally', /dx = cx - dw \/ 2/.test(dsp));
ok('a degenerate box is refused', /if \(bw < 1 \|\| bh < 1\) return false;/.test(dsp));

console.log('\n[R5b] mixed warbands, and which way a figure faces');
const M=new Function(FIX+grab('SPRITE ATLAS')+grab('TEXTURE ATLAS')+grab('BUNDLED PACK')+grab('PACK CORE')+
 'var __L=loadPack(BUNDLED_PACK);'+grab('MAP CORE')+grab('PARTY CORE')+grab('SAVE CORE')+
 grab('WORLD CORE')+grab('EVENT CORE')+grab('COMBAT CORE')+grab('TOWN CORE')+
 '\nreturn {makeRng,makeGroup,MONSTERS,validatePack,BUNDLED_PACK};')();

const spec=[{ref:'mn.goblin',count:2},{ref:'mn.goblinArcher',count:2}];
const grp=M.makeGroup(spec,M.makeRng(1));
ok('a group can mix monster types', grp.length===4, grp.length+' spawned');
ok('counts are honoured exactly',
   grp.filter(f=>f.ref==='mn.goblin').length===2 &&
   grp.filter(f=>f.ref==='mn.goblinArcher').length===2);
ok('each type keeps its own rank',
   grp.filter(f=>f.ref==='mn.goblin').every(f=>f.rank==='front') &&
   grp.filter(f=>f.ref==='mn.goblinArcher').every(f=>f.rank==='back'),
   'a mixed group is pointless if everything lands in one rank');
ok('lettering restarts per type',
   grp.filter(f=>/ A$/.test(f.name)).length===2,
   'both a Goblin A and an Archer A should exist');
ok('a single-type group is not lettered', (()=>{
  const one=M.makeGroup([{ref:'mn.goblin',count:1}],M.makeRng(2));
  return one.length===1 && one[0].name==='Goblin';})());
ok('an unknown ref is skipped, not fatal', (()=>{
  const g=M.makeGroup([{ref:'mn.nothing',count:2},{ref:'mn.goblin',count:1}],M.makeRng(3));
  return g.length===1;})());

const f1=M.BUNDLED_PACK.floors[0];
const scripted=Object.values(f1.features).filter(x=>x.type==='monster'&&x.group);
ok('floor 1 ships a mixed warband', scripted.length>0);
ok('it is two melee and two ranged', (()=>{
  if(!scripted.length) return false;
  const g=scripted[0].group;
  const melee=g.find(e=>e.ref==='mn.goblin'), ranged=g.find(e=>e.ref==='mn.goblinArcher');
  return melee && ranged && melee.count===2 && ranged.count===2;})());
ok('the validator rejects an empty group', (()=>{
  const b=JSON.parse(JSON.stringify(M.BUNDLED_PACK));
  Object.values(b.floors[0].features).forEach(x=>{ if(x.group) x.group=[]; });
  return !M.validatePack(b).ok;})());
ok('and a group naming a monster that does not exist', (()=>{
  const b=JSON.parse(JSON.stringify(M.BUNDLED_PACK));
  Object.values(b.floors[0].features).forEach(x=>{ if(x.group) x.group=[{ref:'mn.ghost',count:1}]; });
  return !M.validatePack(b).ok;})());

ok('sprites can be mirrored without a second image', /if \(flip\) \{/.test(dsp0) ||
   /g\.scale\(-1, 1\)/.test(src));
ok('mirroring is a transform, not a separate asset',
   /g\.scale\(-1, 1\)/.test(src) && !/mirror\.png|\.mirror'/.test(src),
   'a second image per figure would double the atlas');
ok('the flip is centred on the figure', /g\.translate\(cx, 0\)/.test(src) &&
   /g\.translate\(-cx, 0\)/.test(src),
   'flipping about the canvas origin would move the sprite off-screen');
ok('monsters ask to look toward the party', /\(alive \? 1 : 0\.15\) \* ea, 'right'/.test(src));

console.log('\n[R5c] the party has figures too');
ok('hero sprites are in the atlas',
   Object.keys(S.SPRITE_INDEX).some(k=>/^hero\./.test(k)),
   Object.keys(S.SPRITE_INDEX).filter(k=>/^hero\./.test(k)).join(', '));
// Superseded: a class now declares figures per sex rather than one flat field.
// What still matters is that every class resolves to a real figure.
ok('every class resolves to a figure for either sex',
   Object.keys(P.classes).every(c =>
     ['male','female'].every(sx => {
       const cls = P.classes[c];
       const byS = cls.sprites || {};
       const pick = byS[sx] || byS[sx === 'male' ? 'female' : 'male'] || cls.sprite;
       // v4.9: a class with no render yet (the rogue) names its drawn figure per sex
       return (pick && S.SPRITE_INDEX[pick]) || (cls.minis && cls.minis[sx]);
     })),
   'a party built from scratch should still get miniatures');
ok('the named test party gets its own each', (()=>{
  return (P.testParties||[]).every(tp=>tp.members.every(m=>(m.sprite && S.SPRITE_INDEX[m.sprite]) ||
    (!m.sprite && P.classes[m.class].minis && P.classes[m.class].minis[m.sex])));})());
ok('the two fighters are different figures', (()=>{
  const tp=(P.testParties||[])[0];
  const f=tp.members.filter(m=>m.class==='fighter').map(m=>m.sprite);
  return f.length===2 && f[0]!==f[1];})(),
  'Pete and Sharron should not be the same miniature');

ok('a character override beats the class default', /if \(ch\.sprite\) return ch\.sprite;/.test(src));
ok('the class supplies one otherwise', /return cls\.sprite \|\| null;/.test(src));
ok('and it prefers the matching sex', /ch\.sex \|\| 'female'/.test(src),
   'resolution must consider the character\'s sex at all');
ok('heroes fall back to the vector figure when no sprite resolves',
   /if \(!drewHero\) \{[\s\S]{0,120}drawHero\(/.test(src));
// Superseded: the party is no longer blanket-mirrored. It asks to look left,
// and each sculpt is flipped only if its own pose points the wrong way.
ok('the party asks to look toward the enemy',
   // v4.5: drawn through the stage at (fx, fy), the figure's own spot after motion
   // v4.7: its alpha follows the stage too, so the window is wider
   // v4.9: lit and alpha follow stone, a cube and hiding (heldLit, heldAlpha)
   /drawSprite\(g, null, (x, ground|fx, fy), hgt \* 1\.05, (1|heldLit),[\s\S]{0,160}'left', heroName/.test(src));
ok('drawSprite accepts an explicit name',
   /name \? SPRITE_INDEX\[name\]/.test(src),
   'heroes should not need a fake monster id to be drawn');
ok('the validator warns on a class sprite that is missing', (()=>{
  const b=JSON.parse(JSON.stringify(P));
  b.classes.fighter.sprite='hero.nothing';
  const r=S.validatePack(b);
  return r.ok && r.warnings.some(w=>/not in the atlas/.test(w));})());
ok('and on a party member naming one', (()=>{
  const b=JSON.parse(JSON.stringify(P));
  b.testParties[0].members[0].sprite='hero.nothing';
  const r=S.validatePack(b);
  return r.ok && r.warnings.some(w=>/not in the atlas/.test(w));})());

console.log('\n[R5d] male and female figures per class');
const H=new Function(FIX+grab('SPRITE ATLAS')+grab('BUNDLED PACK')+grab('PACK CORE')+
 'var __L=loadPack(' + JSON.stringify(P) + ');'+
 src.match(/function heroSpriteName\(ch\) \{[\s\S]*?\n\}/)[0]+
 src.match(/function classSexes\(classId\) \{[\s\S]*?\n\}/)[0]+
 '\nreturn {heroSpriteName,classSexes,CLASSES,SPRITE_INDEX};')();

ok('classes declare figures by sex (a render, or for the rogue a drawn figure)',
   Object.keys(P.classes).every(c=>(P.classes[c].sprites &&
     Object.keys(P.classes[c].sprites).length>0) || (P.classes[c].minis && P.classes[c].minis.male && P.classes[c].minis.female)),
   Object.keys(P.classes).map(c=>c+':'+Object.keys(P.classes[c].sprites||{}).length).join(' '));
ok('every declared figure is in the atlas',
   Object.keys(P.classes).every(c=>Object.values(P.classes[c].sprites||{})
     .every(v=>S.SPRITE_INDEX[v])));
ok('the fighter has both', H.classSexes('fighter').length===2, H.classSexes('fighter').join(','));
ok('and so, now, does every class, from the drawn figures', (()=>{
  const D=new Function(grab('SPRITE ATLAS')+grab('BUNDLED PACK')+grab('MINI CORE')+grab('PACK CORE')+'var __L=loadPack(BUNDLED_PACK); var FIGURES_DRAWN = true;'+
    src.match(/function classSexes\(classId\) \{[\s\S]*?\n\}/)[0]+'\nreturn {classSexes};')();
  return ['fighter','mage','priest'].every(c=>D.classSexes(c).length===2); })());
ok('and the two sculpts differ', (()=>{
  const a=H.heroSpriteName({class:'fighter',sex:'male'});
  const b=H.heroSpriteName({class:'fighter',sex:'female'});
  return a && b && a!==b;})(), 'a class with both sculpts must use the right one');

// Superseded in v4.1. A class with one render used to lend it to the other
// sex, because otherwise there was nothing worth drawing. Now the drawn library
// has a figure of each sex for every class, so a render is used only for the
// sex it was made for and the drawn figure covers the rest.
['fighter','priest','mage'].forEach(c=>{
  ['male','female'].forEach(sx=>{
    const r=H.heroSpriteName({class:c,sex:sx});
    const made=(P.classes[c].sprites||{})[sx];
    ok(c+' / '+sx+(made?' uses its render':' has no render, so draws'),
       made ? r===made && !!S.SPRITE_INDEX[r] : r===null, String(r));
  });
});
ok('a render is never borrowed from the other sex',
   H.heroSpriteName({class:'priest',sex:'female'})===null &&
   H.heroSpriteName({class:'mage',sex:'male'})===null,
   'a male wizard drawn as the female render was the old fallback');
ok('a character override still beats the class',
   H.heroSpriteName({class:'fighter',sex:'male',sprite:'hero.fighter.f'})==='hero.fighter.f');
ok('an unknown class resolves to nothing rather than throwing',
   H.heroSpriteName({class:'bard',sex:'male'})===null);
ok('a character with no sex still gets a figure',
   !!H.heroSpriteName({class:'fighter'}));

ok('the roster only offers a toggle where there is a choice',
   /if \(haveBoth\.length > 1\)/.test(src),
   'offering M/F for a class with one sculpt would be a lie');
ok('sex is stored on the character', /sex: sex \|\| 'female',/.test(src));
ok('and survives a save', /sex: c\.sex \|\| 'female',/.test(src) && /ch\.sex = r\.sex \|\| 'female';/.test(src));
ok('the sample party is Pete male, Sharron female', (()=>{
  const tp=(P.testParties||[])[0];
  const pete=tp.members.find(m=>m.name==='Pete');
  const sh=tp.members.find(m=>m.name==='Sharron');
  return pete.sex==='male' && sh.sex==='female' &&
         pete.sprite==='hero.fighter.m' && sh.sprite==='hero.fighter.f';})());
ok('an unknown sex in a pack is refused', (()=>{
  const b=JSON.parse(JSON.stringify(P));
  b.classes.fighter.sprites.other='hero.fighter.m';
  return !S.validatePack(b).ok;})());

console.log('\n[R5e] figures face the fight');
const flipFn=new Function(
  src.match(/function spriteNeedsFlip\(entry, want\) \{[\s\S]*?\n\}/)[0]+
  '\nreturn spriteNeedsFlip;')();

ok('every sprite records a natural facing',
   Object.values(S.SPRITE_INDEX).every(v=>['front','left','right'].indexOf(v[5])>=0),
   Object.entries(S.SPRITE_INDEX).map(([k,v])=>k.split('.').pop()+':'+v[5]).join(' '));

// The fault: mirroring the whole party turned a committed pose the wrong way.
function looksAt(key, want){
  const e=S.SPRITE_INDEX[key], nat=e[5], flip=flipFn(e,want);
  if (nat==='front') return flip ? 'left' : 'right';
  return flip ? (nat==='left'?'right':'left') : nat;
}
Object.keys(S.SPRITE_INDEX).forEach(k=>{
  const want = /^hero\./.test(k) ? 'left' : 'right';
  ok(k+' looks toward the enemy', looksAt(k,want)===want,
     'it is facing ' + looksAt(k,want) + ' on the ' + (want==='left'?'party':'foe') + ' side');
});
ok('a committed pose is left alone when already correct',
   flipFn(S.SPRITE_INDEX['hero.wizard.f'],'left')===false,
   'the wizard points left already; mirroring her aims her at the wall');
ok('a committed pose is flipped when wrong',
   flipFn(S.SPRITE_INDEX['hero.wizard.f'],'right')===true);
ok('a symmetrical sculpt may be flipped freely',
   flipFn(S.SPRITE_INDEX['hero.fighter.m'],'left')===true &&
   flipFn(S.SPRITE_INDEX['hero.fighter.m'],'right')===false);
ok('an unknown facing defaults to front rather than throwing',
   flipFn([0,0,256,256,[0,0,256,256]],'left')===true);

ok('the party asks to look left', /\(m\.bp > 0 \? (1|heldAlpha) : 0\.2\) \* \(e \? Math\.max\(0, Math\.min\(1, e\.alpha\)\) : 1\), 'left', heroName/.test(src));
ok('the foes ask to look right', /\(alive \? 1 : 0\.15\) \* ea, 'right'/.test(src));
ok('a corridor monster is left facing the viewer',
   /mH \* MINI_IN_VIEW, mLit, 1, false\)/.test(src),
   'a monster ahead of you is seen head-on, not from the side');

console.log('\n[R6] both views use them');
ok('combat draws sprites', /drawSprite\(g, m\.ref/.test(src));
ok('the corridor draws sprites', /drawSprite\(g, lead, mX/.test(src));
// v4.9: mid-square and taller (MINI_IN_VIEW), still a share of the passage height
ok('the corridor scales them down for distance', /mH \* MINI_IN_VIEW/.test(src) &&
   +(src.match(/var MINI_IN_VIEW = ([\d.]+);/) || [0, 9])[1] < 0.9,
   'a corridor monster should not fill the cell');
ok('loading redraws whatever is open',
   /loadSprites\(function \(\) \{ if \(party\.length\) redraw\(\); if \(cst\) renderCombat\(\); \}\)/.test(src));

console.log('\n[R9] no assets file: one line, not twenty');
{
  const V = new Function('var SPRITE_INDEX = {}, ATLAS_INDEX = {};' + grab('BUNDLED PACK') + grab('PACK CORE') +
    '\nreturn validatePack(JSON.parse(JSON.stringify(BUNDLED_PACK)));')();
  const atlas = V.warnings.filter(w => /atlas|not checked/.test(w));
  ok('without msdd_assets.js the pack says so once', atlas.length === 1 && /msdd_assets\.js/.test(atlas[0]), atlas.length + ' warnings');
  const W = new Function('var SPRITE_INDEX = {"mn.goblin":[0,0,1,1]}, ATLAS_INDEX = {"floor":[0,0,1,1]};' + grab('BUNDLED PACK') + grab('PACK CORE') +
    '\nreturn validatePack(' + JSON.stringify(P) + ');')();
  ok('with an atlas loaded, a missing name is still reported by name', W.warnings.some(w => /mn\.goblinArcher.*not in the atlas/.test(w)) &&
     !W.warnings.some(w => /msdd_assets\.js/.test(w)));
}

console.log('\n' + (fail?'FAILED':'PASSED') + ' — '+pass+' passed, '+fail+' failed\n');
process.exit(fail?1:0);
