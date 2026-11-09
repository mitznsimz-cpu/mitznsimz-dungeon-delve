// Presentation guardrails: palette consistency and contrast.
const fs = require('fs');
const src = fs.readFileSync('./index.html', 'utf8');
const css = src.slice(0, src.indexOf('</style>'));

let pass=0, fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ok   '+n);} else {fail++;console.log('  FAIL '+n+(x?'  -> '+x:''));} };

const vars = {};
(css.match(/--[a-z-]+:\s*#[0-9A-Fa-f]{6}/g)||[]).forEach(m=>{
  const [k,v] = m.split(':'); vars[k.trim()] = v.trim();
});

console.log('\n[L1] the palette is defined once');
['--ink','--stone','--gold','--red','--text','--text-dim','--line'].forEach(k=>{
  ok(k + ' defined', !!vars[k], Object.keys(vars).join(' '));
});
ok('no orphaned old palette names', !/--sigil|--bone|--rust\b/.test(src),
   'old tokens still referenced');

console.log('\n[L2] text is actually readable');
function lum(hex){
  const n=parseInt(hex.slice(1),16);
  const ch=[n>>16&255,n>>8&255,n&255].map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
  return 0.2126*ch[0]+0.7152*ch[1]+0.0722*ch[2];
}
function contrast(a,b){const l1=lum(a),l2=lum(b);const hi=Math.max(l1,l2),lo=Math.min(l1,l2);return (hi+0.05)/(lo+0.05);}

const bg = vars['--ink'];
const checks = [['--text',7.0],['--text-dim',4.5],['--gold',4.5],['--red',3.0]];
checks.forEach(([k,min])=>{
  const c = contrast(vars[k], bg);
  ok(k + ' on --ink >= ' + min + ':1', c >= min, c.toFixed(1)+':1');
});
ok('--text-dim is genuinely lighter than --line',
   lum(vars['--text-dim']) > lum(vars['--line']) * 2,
   lum(vars['--text-dim']).toFixed(3)+' vs '+lum(vars['--line']).toFixed(3));

console.log('\n[L3] canvas and CSS share one source of truth');
ok('canvas reads CSS variables', /getPropertyValue\('--'/.test(src));
ok('no raw hex left in the renderer',
   !/(strokeStyle|fillStyle)\s*=\s*'#[0-9A-Fa-f]{6}'/.test(
     src.slice(src.indexOf('dungeon view'), src.indexOf('loop & input'))),
   'hardcoded colour in the view layer');

console.log('\n[L4] solid surfaces, not wireframe');
const view = src.slice(src.indexOf('function drawView'), src.indexOf('function drawFeature'));
ok('walls are filled', /poly\(g, \[xn, tn, xf, tf/.test(view));
ok('floor slabs are drawn', /floor slab/.test(view));
ok('ceiling slabs are drawn', /ceiling slab/.test(view));
ok('walls are built from filled blocks, not lines',
   /masonrySide\(g,/.test(view) && /masonryFace\(g,/.test(view),
   'wall texture would be invisible against dark stone');
ok('distance fog applied', /fog\(/.test(view));
ok('vignette applied', /createRadialGradient/.test(view));

console.log('\n[L5] projection geometry: side passages must be on screen');
// Rebuild the projection exactly as the renderer does, from the shipped source.
const scaleM = src.match(/var SCALE = \[([^\]]+)\]/);
const SCALE = scaleM[1].split(',').map(Number);
const maxdM = src.match(/var MAXD = (\d+), MAXO = (\d+)/);
const MAXD = +maxdM[1], MAXO = +maxdM[2];
// baseW/baseH may be written as `c.w` or `c.w * 0.46` — read either form.
const bwM = src.match(/var baseW = c\.w(?: \* ([\d.]+))?, baseH = c\.h(?: \* ([\d.]+))?/);
const BW = bwM[1] ? +bwM[1] : 1.0;
const BH = bwM[2] ? +bwM[2] : 1.0;

function planeScale(fi){ if(fi<=0) return SCALE[0];
  const i=Math.floor(fi), t=fi-i;
  if(i>=SCALE.length-1) return SCALE[SCALE.length-1];
  return SCALE[i]+(SCALE[i+1]-SCALE[i])*t; }

const VW = 1000, cx = VW/2;
const px = (o,fi) => cx + o*(VW*BW)*planeScale(fi);

ok('SCALE covers every render plane', SCALE.length >= MAXD+1, SCALE.length+' for MAXD '+MAXD);
ok('scale is strictly decreasing with depth',
   SCALE.every((v,i)=>i===0||v<SCALE[i-1]), SCALE.join(','));

// The single most visible framing fault: if plane 0 does not cover the
// viewport, the background shows around the corridor as a black border.
ok('the near plane fills the viewport horizontally',
   px(-0.5,0) <= 0.001 && px(0.5,0) >= VW-0.001,
   'leaves ' + px(-0.5,0).toFixed(0) + 'px / ' + (VW-px(0.5,0)).toFixed(0) + 'px of void');
ok('baseW is full-bleed', BW >= 1.0, String(BW));
ok('baseH is full-bleed', BH >= 1.0, String(BH));

// ...but it must still open out enough that side passages are visible.
let noSide = 0;
for (let d=1; d<MAXD; d++) if (px(0.5,d) >= VW) noSide++;
ok('side passages have screen space from depth 1', noSide===0,
   noSide+' depth(s) show no side passage at all');
ok('the corridor narrows fast enough to see past it',
   (px(0.5,1)-px(-0.5,1))/VW <= 0.62,
   (100*(px(0.5,1)-px(-0.5,1))/VW).toFixed(0)+'% of width at depth 1');
ok('corridor is not absurdly squat', BH >= 0.5 && BH <= 1.2, String(BH));

console.log('\n[L6] walls are actually lit, not merely present');
// Reproduce every darkening pass the renderer applies, and check what
// luminance the near wall really reaches on screen.
function rgbMix(a,b,t){
  const pa=parseInt(a.slice(1),16), pb=parseInt(b.slice(1),16);
  return [Math.round((pa>>16&255)*(1-t)+(pb>>16&255)*t),
          Math.round((pa>>8&255)*(1-t)+(pb>>8&255)*t),
          Math.round((pa&255)*(1-t)+(pb&255)*t)];
}
function rgbLum(c){
  const ch=c.map(x=>{x/=255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4);});
  return 0.2126*ch[0]+0.7152*ch[1]+0.0722*ch[2];
}
const toneM2 = src.match(/hexMix\(base \|\| PAL\.stone, PAL\.pitch, ([\d.]+) \+ fog\(fi\) \* ([\d.]+)\)/);
const T0=+toneM2[1], TK=+toneM2[2];
const litVigM = src.match(/vg\.addColorStop\(1, currentSight\(\) != null \? 'rgba\(0,0,0,[\d.]+\)' : 'rgba\(0,0,0,([\d.]+)\)'\)/);
const LITVIG = +litVigM[1];
const fogAt = d => Math.min(1, d/(MAXD-1));
const wallLum = d => {
  let c = rgbMix(vars['--stone'], vars['--pitch'], T0 + fogAt(d)*TK);
  c = c.map(x => Math.round(x*(1-LITVIG)));
  return rgbLum(c);
};
const inkLum = rgbLum([parseInt(vars['--ink'].slice(1,3),16),
                       parseInt(vars['--ink'].slice(3,5),16),
                       parseInt(vars['--ink'].slice(5,7),16)]);

ok('the nearest wall is properly lit', wallLum(0) >= 0.12,
   wallLum(0).toFixed(3) + ' — below 0.12 reads as a black wedge, not stone');
ok('the nearest wall stands well clear of the background', wallLum(0) > inkLum*20,
   wallLum(0).toFixed(3)+' vs ink '+inkLum.toFixed(3));
ok('the farthest wall is still visible', wallLum(MAXD-1) >= 0.03,
   wallLum(MAXD-1).toFixed(3));
ok('depth still falls off monotonically',
   [0,1,2,3].every(d => wallLum(d) > wallLum(d+1)),
   [0,1,2,3,4].map(d=>wallLum(d).toFixed(3)).join(' '));
ok('near-to-far contrast is a real gradient', wallLum(0) / wallLum(MAXD-1) >= 2.5,
   (wallLum(0)/wallLum(MAXD-1)).toFixed(1)+'x');
ok('the lit vignette no longer smothers the periphery', LITVIG <= 0.22, String(LITVIG));
ok('the vignette starts outside the near field',
   /createRadialGradient\(cx, cy, Math\.min\(c\.w, c\.h\) \* 0\.4[0-9]/.test(src),
   'inner radius too small — it dims the nearest walls hardest');
ok('a lantern pool lights the near floor', /lantern pool/.test(src));

console.log('\n[L6b] distant surfaces stay readable');
const toneM = src.match(/hexMix\(base \|\| PAL\.stone, PAL\.pitch, ([\d.]+) \+ fog\(fi\) \* ([\d.]+)\)/);
const t0 = +toneM[1], tk = +toneM[2];
const deepest = t0 + tk;   // fog() maxes at 1
ok('farthest wall is not effectively black', deepest <= 0.75,
   'mixes '+(100*deepest).toFixed(0)+'% toward black at the back of the cone');
ok('nearest wall is close to full colour', t0 <= 0.15, String(t0));

// The vignette is now conditional: lit corridors stay open, dark cells close in.
const vigAll = [...src.matchAll(/rgba\(0,0,0,([\d.]+)\)'/g)].map(m => +m[1]);
const litVig = Math.min.apply(null, vigAll.filter(v => v > 0));
ok('lit vignette does not compound the fog into black', litVig <= 0.45, String(litVig));
ok('dark cells get a heavier vignette', vigAll.some(v => v >= 0.7),
   'no darkened state found — dark cells would look the same as lit ones');

console.log('\n[L7] walls follow line of sight');
const view2 = src.slice(src.indexOf('function drawView'), src.indexOf('function drawUnderfoot'));
ok('the near face of a sideways-seen cell is drawn',
   /near face/.test(view2) && /visKeys\[behindKey\]/.test(view2),
   'a cell seen through a side opening would show a hole instead of stone');
ok('visible-cell keys are indexed before drawing', /var visKeys = \{\}/.test(view2));
ok('far face still drawn', /far face/.test(view2));
ok('side walls still drawn', /side walls/.test(view2));

console.log('\n[L8] what you stand on is drawn underfoot, not ahead');
// Superseded: the caption moved off the canvas into the region panel, because
// it collided with the message overlay. What still matters is that a feature on
// your own cell is never projected into the passage ahead.
ok('depth-0 features are not drawn into the corridor',
   /if \(feat && cell\.d > 0\) drawFeature/.test(src),
   'a chest underfoot would appear to be in the next cell');
ok('the region panel reports what is underfoot instead',
   /underfootLabel\(feat, pos\.x, pos\.y\)/.test(src));
ok('spent chests read as empty, sprung traps go quiet',
   /if \(feat\.type === 'chest' && spent\) return 'an empty chest';/.test(src) &&
   // v4.8: a trap is only named once it has been found, and goes quiet once sprung
   /if \(feat\.type === 'trap'\) return spent \|\| !isSpotted\(world, floor\.id, x \+ ',' \+ y\) \? null/.test(src));
ok('a taken staff is not announced underfoot',
   /if \(feat\.type === 'staff' && questFlags\.gotStaff\) return null;/.test(src));

console.log('\n[L9] darkness and light');
ok('a DARK cell bit exists', /DARK_BIT = 32/.test(src));
ok('sight is limited in the dark', /function sightRange/.test(src));
ok('visibility honours the limit',
   /visibleCells\(floor, pos\.x, pos\.y, pos\.f, currentSight\(\)/.test(src));
ok('light burns down as you walk', /tickLight\(1\)/.test(src));
ok('a light source can be kindled', /out_lightTurns = it\.use\.turns/.test(src));

console.log('\n[L10] turn animation');
ok('turning is animated', /turning = d; turnT = 0; animating = true/.test(src));
ok('the view slides during a turn', /var slide = turning/.test(src));
ok('reduced motion skips it', /if \(reduceMotion\) \{ redraw\(\); return; \}[\s\S]{0,80}turning = d/.test(src) ||
   /reduceMotion/.test(src.slice(src.indexOf('function turn('), src.indexOf('function turn(') + 400)));

console.log('\n[L11] messages persist, and Use is explicit');
ok('messages go to a log, not a timer', /var msgLog = \[\]/.test(src) && /function renderMsgLog/.test(src));
ok('the log has a home in the layout', /id="mlog"/.test(src));
ok('repeats collapse with a count', /last\.n = \(last\.n \|\| 1\) \+ 1/.test(src));
ok('the overlay echo lingers, not flashes',
   (src.match(/msgEl\.classList\.remove\('on'\); \}, (\d+)\)/)||[])[1] >= 5000,
   'overlay hides too quickly');

ok('there is an explicit Use action', /function interactHere/.test(src));
ok('Use has a button', /data-act="use"/.test(src));
ok('Use has a key', /k === ' ' \|\| k === 'enter' \|\| k === 'u'/.test(src));
ok('the button says what it will do', /function refreshUseButton/.test(src) &&
   /b\.textContent = what \|\| 'Use'/.test(src));
ok('chests wait to be opened', /case 'chest':\s+if \(spent\) return null;[\s\S]{0,400}return 'Open the chest';/.test(src));
ok('stairs wait to be taken', /return stairTarget\(feat\) \? 'Go down' : null/.test(src));
ok('traps still spring on their own',
   /Traps still spring by themselves/.test(src));
ok('walking no longer loots a chest',
   !/else if \(feat && feat\.type === 'chest'\) \{\s+if \(consumed/.test(src),
   'step() still auto-opens chests');

console.log('\n[L12] combat reads as a battle line');
const cv = src.slice(src.indexOf('function drawFoes'), src.indexOf('function renderRosterList'));
ok('ranks run left to right, not stacked', /THEIR BACK/.test(cv) && /YOUR FRONT/.test(cv));
ok('their front and our front meet in the middle',
   /band\(foeFrontList, c\.w \* 0\.24, c\.w \* 0\.47/.test(cv) &&
   // v4.8: someone freed from a cell takes the near end of our front rank
   /var frontX0 = al \? 0\.585 : 0\.53;/.test(cv) && /band\(pFront,\s+c\.w \* frontX0, c\.w \* 0\.76/.test(cv));
ok('back ranks sit on the outside',
   /band\(foeBackList,\s+c\.w \* 0\.02, c\.w \* 0\.24/.test(cv) &&
   /band\(pBack,\s+c\.w \* 0\.76, c\.w \* 0\.98/.test(cv));
ok('figures are capped, not scaled to the panel', /Math\.min\(c\.h \* 0\.46, step \* 1\.35, 128\)/.test(cv),
   'figure size would balloon on a wide screen');
ok('every rank is captioned', (cv.match(/THEIR BACK|THEIR FRONT|YOUR FRONT|YOUR BACK/g)||[]).length===4);
ok('band order is fixed by position, not array order', /\.sort\(byPos\)/.test(cv),
   'characters would jump sideways after a rank swap');

console.log('\n[L13] whose turn it is, unmistakably');
ok('the active hero gets a pool of light', /function spotlight/.test(cv));
ok('and a marker above them', /function marker/.test(cv));
ok('their name is highlighted', /label\(x, ground, m\.name\.slice\(0, 8\)[\s\S]{0,60}isNow \|\| isAlly\)/.test(cv),
   'the active hero name is no longer emphasised');
ok('the banner names them large', /#cturn \.who\{color:var\(--gold\);font-size:14px/.test(src));
ok('the banner states their rank', /front rank' : 'back rank'/.test(src));
ok('the banner says when the enemy is acting', /they act/.test(src));
ok('the combat panel is height-capped', /max-height:46vh/.test(src));
ok('actions spread out on wide screens', /@media \(min-width:760px\)\{#acts\{grid-template-columns:repeat\(4,1fr\)\}/.test(src));

console.log('\n[L14] you can see what you are about to hit');
ok('the target wears a reticle', /function reticle/.test(cv));
ok('it is drawn on the selected foe', /if \(targeted\) reticle\(x, ground, hgt, step\)/.test(cv));
ok('and on the chosen ally when a heal is ready', /if \(isAlly\) reticle\(x, ground, hgt, step, true\)/.test(cv));
ok('the target is captioned on the figure', /TARGET/.test(cv));
ok('foe and ally reticles are different colours', /friendly \? PAL\.gold : PAL\.red/.test(cv));

ok('figures are tappable', /function combatCanvasPick/.test(src) && /foeHits\.push/.test(cv));
ok('the party strip picks the heal target', /selAlly = ci; renderCombat\(\)/.test(src));
ok('action buttons name their target', /withTarget\(ranged \? 'Shoot' : 'Attack', 'attack'\)/.test(src));
ok('spells name their target too', /withTarget\(sp\.name \+ ' \(' \+ sp\.mp \+ '\)', 'cast:' \+ sid\)/.test(src));
ok('a plain-language target line is shown', /function renderTargetLine/.test(src));
ok('unreachable foes say so in the roster', /out of reach/.test(src));

// Test the property — separate selections exist — not the exact declaration,
// which grows every time a new target kind is added.
ok('ally and foe targets are tracked separately',
   /selFoe = 0/.test(src) && /selAlly = 0/.test(src) &&
   /var idx = t\.side === 'ally' \? selAlly/.test(src));
ok('the action decides which index is sent',
   /var idx = t\.side === 'ally' \? selAlly/.test(src) && /: selFoe;/.test(src),
   'ally spells would receive the enemy index');
ok('selection is re-validated each turn', /function retarget/.test(src));

console.log('\n[L15] nothing overlaps at the foot of the view');
const viewFns = src.slice(src.indexOf('function drawView'), src.indexOf('function drawFeature'));
ok('the canvas draws no caption over the scene', !/drawUnderfoot/.test(src),
   'a canvas caption and the message overlay shared the same strip');
ok('what is underfoot is reported in the region panel',
   /Underfoot: ' \+ esc\(extra\)/.test(src));
ok('the overlay has a readable backdrop',
   /#msg\{[\s\S]{0,260}background:rgba\(8,6,5,\.86\)/.test(src));
ok('the overlay is inset from the panel edges',
   /max-width:calc\(100% - 24px\)/.test(src));
ok('only one element sits at the bottom of the view',
   (src.match(/fillText\('underfoot/g) || []).length === 0);
ok('the message log has room for several lines', (()=>{
  const m = src.match(/#mlog\{[\s\S]{0,200}?max-height:(\d+)px/);
  return m && +m[1] >= 100;})(), 'the log panel is too short to read history in');

console.log('\n[L16] stone reads as stone');
ok('each block gets its own tone', /function stoneHash/.test(src));
ok('the variation is positional, so it does not shimmer',
   /stoneHash\(cellX, cellY/.test(src), 'blocks would crawl as the party moves');
ok('side walls foreshorten their blocks',
   /planeScale\(fi \+ t0\)/.test(src), 'blocks would be evenly spaced, killing the perspective');
ok('mortar joints are drawn', /mortar/.test(src) && /strokeStyle = mortar/.test(src));
ok('surfaces meet with a contact shadow', /function contactShade/.test(src));
ok('the floor is paved, not flat', /flagstone seams/.test(src));
ok('enough courses to read as masonry', (()=>{
  const m = src.match(/var COURSES = (\d+), SLICES = (\d+)/);
  return m && +m[1] >= 4 && +m[2] >= 4;})(), 'too few blocks to read as stone');

console.log('\n[L17] doors are portals, not pictures');
const feat = src.slice(src.indexOf('function drawFeature'), src.indexOf('function drawMini'));
// Appearance is covered in [L21]. What matters structurally is *where* a door
// is projected: onto its own cell's near plane, never flattened onto a far
// wall that may not exist. That is the fault that made it float.
ok('it is drawn on the cell near plane, not a far wall',
   /var pL = px\(cell\.o - 0\.5, near\), pR = px\(cell\.o \+ 0\.5, near\)/.test(feat),
   'the arch would float where the cell has no far wall');
ok('it spans the full height of that plane',
   /var pT = ty\(near\), pB = by\(near\)/.test(feat));
ok('its three states are all handled',
   /undiscovered\) \{/.test(feat) && /!isOpen\) \{/.test(feat) && /\} else \{/.test(feat),
   'shut, open and undiscovered must each draw something different');
ok('the view supplies a sight blocker', /sightBlocker\(\)/.test(src));
ok('and the map uses the same one',
   (src.match(/sightBlocker\(\)/g) || []).length >= 2,
   'the automap would record cells the party cannot actually see');

console.log('\n[L18] the heal target can actually be chosen');
// The party bar sits inside #app, underneath a fixed, full-screen #combat
// overlay — so anything only clickable there is unreachable during a fight.
ok('the combat overlay does cover the party bar',
   /#combat\{position:fixed;inset:0/.test(src),
   'if this stops being true, revisit where the ally picker lives');
ok('the combat panel carries its own party list', /Your party/.test(src));
ok('those rows are clickable when a heal is ready',
   /if \(pickable\) row\.addEventListener\('click', function \(\) \{ selAlly = i;/.test(src));
ok('party figures on the canvas are hit-tested too', /allyHits\.push/.test(src));
ok('the pick handler checks both sides',
   /var foe = nearest\(foeHits\)/.test(src) && /var ally = nearest\(allyHits\)/.test(src));
ok('the chosen ally is marked in the list', /rrow\.ally\.friend\{border-color:var\(--gold\)/.test(src));
ok('the acting character is marked too', /rrow\.acting\{background/.test(src));
ok('the list shows BP and MP so the choice is informed',
   /c\.bp \+ '\/' \+ maxBP\(c\)/.test(src) && /' \\u00b7 ' \+ c\.mp \+ 'mp'/.test(src));
ok('a heal defaults to whoever most needs it', /default the heal target to whoever most needs it/.test(src));
ok('the prompt does not point at anything unreachable',
   !/a name below/.test(src), 'the copy referred to the hidden party bar');

console.log('\n[L19] both logs keep their history');
ok('the dungeon log holds hundreds of lines, not a dozen',
   /msgLog\.length > 400/.test(src), 'history was being thrown away');
ok('and renders all of them', /msgLog\.forEach\(function \(m\)/.test(src) &&
   !/msgLog\.slice\(-12\)/.test(src));
ok('the combat log renders its whole history',
   /groupLog\(cst\.log, cst\.log\.length\)/.test(src) && !/cst\.log\.slice\(-40\)/.test(src));
ok('groupLog is finally wired up', /groupLog\(cst\.log/.test(src),
   'it existed since v1.0 and was never called');
ok('repeats show a count in the combat log too',
   /e\.text \+ \(e\.n > 1 \? '  \\u00d7' \+ e\.n : ''\)/.test(src) ||
   /e\.text \+ \(e\.n > 1 \? '  ×' \+ e\.n : ''\)/.test(src));

ok('scrolling up is not fought by the renderer', /function atBottom/.test(src));
ok('both logs use it', (src.match(/atBottom\(host\)/g) || []).length >= 2);
ok('the newest line is only followed when already at the bottom',
   /if \(follow\) host\.scrollTop = host\.scrollHeight;/.test(src));

ok('the combat log reads oldest to newest',
   !/flex-direction:column-reverse/.test(src),
   'reversed order makes scrolling back through a fight confusing');
ok('the scrollbars are visible against the dark theme',
   /::-webkit-scrollbar-thumb/.test(src) && /scrollbar-color:/.test(src));
ok('both panels have room to show several lines',
   /max-height:136px/.test(src) && /#clog\{flex:0 0 136px/.test(src));
ok('scrolling a log does not scroll the page', (src.match(/overscroll-behavior:contain/g)||[]).length >= 2);
ok('the fight result is carried into the dungeon log',
   /carry the result into the dungeon log/.test(src),
   'combat history vanished when the overlay closed');

console.log('\n[L20] a blocked view is never a hole');
ok('a sight-blocking cell gets an opaque backstop',
   /A cell that stops the eye leaves a hole/.test(src) &&
   /if \(blocksSight && blocksSight\(cell\.x, cell\.y\)( && terr !== 'fog')?\)/.test(src),
   'the corridor beyond a shut door was left unpainted');
// v4.3: a fog bank also stops the eye, and backs itself with haze, not stone
ok('a fog bank is its own backstop',
   /kind === 'fog'\)[\s\S]{0,1400}fillRect\(xLf, (tf|t\.ty\(t\.far\))/.test(src),
   'the corridor beyond a fog bank would be a hole');
ok('the backstop is masoned, not a flat fill',
   /if \(blocksSight[\s\S]{0,200}masonryFace/.test(src));
ok('the blocker predicate is computed once per frame',
   /var blocksSight = sightBlocker\(\);/.test(src));

// The door must read as darker wood against lit stone — not as a silhouette.
// rgbMix returns an array; chaining it needs a way back to hex.
const toHex = c => '#' + c.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
const tone = (hex, mixTo, t) => toHex(rgbMix(hex, mixTo, t));
const leafM = src.match(/hexMix\(hexMix\(PAL\.floor, PAL\.stone, ([\d.]+)\), PAL\.pitch, fog\(near\) \* ([\d.]+)\)/);
ok('the door leaf tone is derived, not hardcoded dark', !!leafM,
   'expected a lit wood tone for a closed door');
if (leafM) {
  const woodMix = +leafM[1], leafFog = +leafM[2];
  const wallFogM = src.match(/hexMix\(base \|\| PAL\.stone, PAL\.pitch, ([\d.]+) \+ fog\(fi\) \* ([\d.]+)\)/);
  const ratioAt = d => {
    const f = Math.min(1, d / (MAXD - 1));
    const leaf = rgbLum(rgbMix(tone(vars['--floor'], vars['--stone'], woodMix),
                               vars['--pitch'], f * leafFog));
    const wall = rgbLum(rgbMix(vars['--stone'], vars['--pitch'], +wallFogM[1] + f * +wallFogM[2]));
    return leaf / wall;
  };
  ok('a shut door is visible against its own frame', ratioAt(1) >= 0.30,
     ratioAt(1).toFixed(2) + 'x the wall — below 0.30 it reads as a silhouette');
  ok('but still clearly darker than stone', ratioAt(1) <= 0.75, ratioAt(1).toFixed(2) + 'x');
  ok('that holds at every depth', [1,2,3,4].every(d => ratioAt(d) >= 0.30 && ratioAt(d) <= 0.75),
     [1,2,3,4].map(d => ratioAt(d).toFixed(2)).join(' '));
}

console.log('\n[L21] objects are built, not blobbed');
const fx = src.slice(src.indexOf('function drawFeature'), src.indexOf('function drawMini'));

ok('the door is a timber frame, not a hole in stone', /A timber frame set into the stonework/.test(fx));
ok('the frame is wood, distinct from the wall',
   /timber/.test(fx) && /PAL\.floor/.test(fx),
   'a frame drawn in the wall tone would vanish into the masonry');
ok('posts and lintel are drawn separately',
   /g\.fillRect\(pL, pT, post, pH\)/.test(fx) && /g\.fillRect\(pL, pT, pW, beam\)/.test(fx));
ok('the timber has grain', /var grain = function/.test(fx));
ok('the grain is hashed so it holds still', /stoneHash\(cell\.x, cell\.y, i, salt, 91\)/.test(fx));
ok('the leaf is planked', /board joints/.test(fx));
ok('it hangs on tapering strap hinges', /iron strap hinges, tapering to a point/.test(fx));
ok('there is a handle on the swinging edge', /handle and lock, on the swinging edge/.test(fx));
ok('a locked door shows an escutcheon', /feat\.locked\) \{[\s\S]{0,200}fillRect\(hx - ew \/ 2/.test(fx));
ok('an open door shows the leaf swung back', /the leaf swung back against a jamb/.test(fx));
ok('an undiscovered seam still gives nothing away', /no tell at all: plain masonry/.test(fx));

ok('the chest is drawn at a readable size', (()=>{
  const m = fx.match(/var cw = Math\.min\(h \* ([\d.]+), wdt \* ([\d.]+)\)/);
  return m && +m[1] >= 0.28;})(), 'a chest below ~0.28 of cell height is a smudge at distance');
ok('it casts a shadow onto the floor', /cast shadow, so it sits on the floor/.test(fx));
ok('it has iron straps and corner brackets',
   /var strapW/.test(fx) && /corner brackets/.test(fx.slice(0, fx.indexOf('lever'))) ||
   /\[\[bx, byy\], \[bx \+ cw - br, byy\]/.test(fx));
ok('a shut chest shows a hasp', /hasp and lockplate/.test(fx));
ok('an opened one shows its empty inside', /the inside, now empty/.test(fx));

ok('the shrine niche is arched and dressed', /a shallow arched niche cut back into the wall/.test(fx));
ok('it has a shelf and a figure', /a shelf, and a worn figure standing on it/.test(fx));
ok('an offering bowl sits at its feet', /an offering bowl at its feet/.test(fx));
ok('unspent shrines are lit by candles', /candle stubs either side/.test(fx));

console.log('\n[L22] textured surfaces');
// The atlas moved to msdd_assets.js so the game file stays readable.
const assetPath='./msdd_assets.js';
const ASSETS=require('fs').existsSync(assetPath)?require('fs').readFileSync(assetPath,'utf8'):'';
ok('an atlas ships alongside the game', /var ATLAS_DATA = 'data:image\/jpeg;base64,/.test(ASSETS));
ok('the game file itself is free of it', !/var ATLAS_DATA = 'data:/.test(src));
ok('it is indexed by slot name', /var ATLAS_INDEX = \{/.test(ASSETS));
ok('the texture payload stays modest', (()=>{
  const m = ASSETS.match(/var ATLAS_DATA = '(data:image\/jpeg;base64,[^']+)'/);
  return m && m[1].length < 200 * 1024;})(),
  'wall textures should stay small even in their own file');

ok('the atlas is tinted once, not per frame', /function buildTintedAtlas/.test(src) &&
   /g\.globalCompositeOperation = 'multiply'/.test(src),
   'multiply-compositing every wall every frame would be slow');
ok('walls are sliced in world depth, not screen space',
   /planeScale\(fi \+ u0\)/.test(src),
   'linear screen slicing smears the texture instead of foreshortening it');
ok('floor and ceiling recede too', /function texGround/.test(src));
ok('faces square-on are a single blit', /function texFace/.test(src));
ok('enough slices to hide the stepping', (()=>{
  const m = src.match(/var TEX_SLICES = (\d+)/); return m && +m[1] >= 24;})());

ok('every surface falls back to the procedural masonry',
   (src.match(/if \(!tex(Side|Face|Ground)\(/g) || []).length >= 5,
   'a failed atlas load would leave blank walls');
ok('doors take a timber texture', /texFace\(g, feat\.locked \? 'door\.gate' : 'door\.plain'/.test(src));
ok('a locked door gets the fortified one', /feat\.locked \? 'door\.gate'/.test(src));

ok('materials are pack content, not hardcoded', /function wallTileFor/.test(src) &&
   /\(floorDef && floorDef\.materials\) \|\| \{\}/.test(src));
ok('the validator warns on an unknown texture', /which is not in the atlas/.test(src));
ok('fog is computed once per cell', (()=>{
  const m=src.match(/fogN\s*=\s*[\d.]+\s*\+\s*fog\(near\)/);
  return !!m && (src.match(/fogN/g)||[]).length >= 3;})(),
  'recomputing fog per surface would drift between them');

console.log('\n[L23] stairs read as going somewhere');
const st = src.slice(src.indexOf('// Descending: the treads used to fill the whole well'),
                     src.indexOf('if (feat.sealed)'));
ok('down and up are drawn differently',
   /the shaft itself: black at the back/.test(st) && /a flight rising in front of you occludes/.test(st));
ok('the shaft is drawn behind the treads', (()=>{
  const g0=st.indexOf('createLinearGradient'), t0=st.indexOf('for (var i = 0');
  return g0>=0 && t0>=0 && g0<t0;})(),
  'treads painted first would be covered by the shaft');
// Test the draw call, not the word in the comment above it.
ok('both flights draw a riser under each tread',
   (st.match(/g\.fillRect\(midX - [vw]1 \/ 2, [yz]1, [vw]1, Math\.max\(0\.7, h \* [\d.]+\)\)/g) || []).length === 2,
   'a flight without risers is just stripes on the floor');
ok('direction is marked unambiguously', /a marker at the head of the flight/.test(st));

// The fault: treads were painted over the entire well, so the dark never showed.
const reachM = st.match(/var steps = (\d+), reach = ([\d.]+);/);
ok('the flight is parameterised', !!reachM);
ok('part of the well is left as void', reachM && +reachM[2] <= 0.8,
   reachM ? (100*+reachM[2]).toFixed(0) + '% covered by treads' : 'no reach limit',
   );
ok('a lip shadow marks where the floor stops', /a hard shadow at the near lip/.test(st));

// An ascending flight must occlude the wall behind it.
const riseM = st.match(/var riseH = h \* ([\d.]+)/);
ok('an ascending flight is tall enough to occlude', riseM && +riseM[1] >= 0.5,
   riseM ? (100*+riseM[1]).toFixed(0) + '% of cell height' : 'no rise');
ok('it is opaque, not a wash', /g\.closePath\(\); g\.fill\(\);/.test(st));
ok('the landing above is dark', /the landing above: dark/.test(st));

// Tone ramps must run opposite ways and stay legible against the wall.
const dM = st.match(/var d = ([\d.]+) \+ f0 \* ([\d.]+) \+ fog\(far\) \* ([\d.]+)/);
const uM = st.match(/var r = ([\d.]+) \+ g0 \* ([\d.]+) \+ fog\(far\) \* ([\d.]+)/);
ok('both ramps are parameterised', !!dM && !!uM);
if (dM && uM && reachM) {
  const tread = t => rgbLum(rgbMix(vars['--stone'], vars['--pitch'], Math.min(0.96, t)));
  const f = 0.25, steps = +reachM[1], reach = +reachM[2];
  const down = [...Array(steps)].map((_, i) =>
    tread(+dM[1] + ((i/steps)*reach) * +dM[2] + f * +dM[3]));
  const up = [...Array(7)].map((_, j) => tread(+uM[1] + (j/7) * +uM[2] + f * +uM[3]));
  ok('descending treads darken with depth', down.every((v,i)=>i===0||v<down[i-1]),
     down.map(v=>v.toFixed(3)).join(' '));
  ok('ascending treads darken as they recede', up.every((v,i)=>i===0||v<up[i-1]),
     up.map(v=>v.toFixed(3)).join(' '));
  ok('the nearest tread is visible stone', down[0] >= 0.08, down[0].toFixed(3));
  ok('but darker than the wall behind it', down[0] < 0.213, down[0].toFixed(3));
  ok('the flight has real contrast end to end', down[0] / down[down.length-1] >= 3,
     (down[0]/down[down.length-1]).toFixed(1) + 'x');
}

console.log('\n[L24] the map can be explored, not just glanced at');
const mp = src.slice(src.indexOf('var mapView ='), src.indexOf('function renderMsgLog'));
ok('the map has a view of its own',
   /mapView\s*=\s*\{/.test(src) && /mapView\.scale/.test(src) &&
   /mapView\.ox/.test(src) && /mapView\.follow/.test(src));
ok('it can be fitted to the floor', /function mapFit\(/.test(src));
ok('it can be zoomed', /function mapZoom\(/.test(src));
ok('zoom is clamped both ways', (()=>{
  const m=src.match(/Math\.max\(fit \* ([\d.]+), Math\.min\(fit \* ([\d.]+)/);
  return m && +m[1] > 0 && +m[2] > +m[1];})(),
  'unclamped zoom lets the map vanish or fill the screen with one cell');
ok('it can be centred on the party', /function mapCentreOn/.test(src));
ok('dragging pans it', /mapView\.ox = drag\.ox \+ dx/.test(src));
ok('touch drags too', /touchmove/.test(src));
ok('the wheel zooms', /addEventListener\('wheel'/.test(src));
ok('panning stops it snapping back', /mapView\.follow = false;/.test(src),
   'the view would fight the player, as the logs used to');
ok('a drag is not mistaken for a tap', /if \(moved > 6\) return;/.test(src));
ok('there are buttons for people not using a mouse',
   /data-map="in"/.test(src) && /data-map="out"/.test(src) &&
   /data-map="fit"/.test(src) && /data-map="here"/.test(src));
ok('the floor extent is outlined, so panned-away edges still read',
   /the extent of the floor/.test(src));
ok('it reports how much is still unknown', /explored  \\u00b7 /.test(src));
ok('a new floor resets the view', /a new floor, a fresh view/.test(src));

console.log('\n[L24b] the hit flash');
ok('an inverted sheet is built at load', /SPRITES_FLASH = inv;/.test(src));
ok('the inversion is a real pixel invert', /255 - d\.data\[i\]/.test(src));
ok('it is built once, not per frame',
   src.indexOf('SPRITES_FLASH = inv') > src.indexOf('function buildTintedSprites'),
   'inverting per draw would be slow');
ok('a tainted canvas falls back rather than throwing', /SPRITES_FLASH = null;      \/\/ tainted/.test(src));
ok('a struck sprite draws the inverted frame', /if \(flash && SPRITES_FLASH\)/.test(src));
// v4.1: monsters and heroes share one drawn-figure path, so one check covers
// both; the behaviour itself is exercised in the minis harness.
// v4.2: the shared library names the finish 'negative'
ok('drawn figures go negative when struck', /finish === 'negative' \? MINI_NEGATIVE/.test(src) && /miniLook\(opts\.flash \? 'negative' : 'lit'/.test(src));
ok('monsters and heroes both pass the flash through',
   /drawMini[\s\S]{0,400}flash: flash/.test(src) && /drawHero[\s\S]{0,400}flash: flash/.test(src));
ok('they get a pale plate so it reads as inverted', /black-on-white, not black-on-black/.test(src));
ok('there is a slash mark for small figures', /function strikeMark/.test(src));
ok('both sides can flash', /wasStruck\(cst, 'foes'/.test(src) && /wasStruck\(cst, 'party'/.test(src));

console.log('\n[L25] the automap follows what was actually seen');
const map = src.slice(src.indexOf('function drawMap'), src.indexOf('loop & input'));
ok('map reads the explored set', /here\(\)\.explored/.test(map));
ok('map skips unseen cells', /if \(!ex\[/.test(map));
ok('no fog overlay — unexplored is absent', !/fog|rgba\(0,0,0/.test(map));
ok('facing is shown', /pos\.f\]/.test(map));

console.log('\n' + (fail?'FAILED':'PASSED') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail?1:0);
