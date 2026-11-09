// Drawn miniatures: the library of unpainted figures used wherever a pack has
// no render. Since v4.2 the library is the shared file both Mitz & Simz games
// use (mitznsimz_minis.js), embedded here as MINI CORE; [M8] holds it to that. Checks the sculpts are sound, that every monster and hero resolves
// to one, that nothing drawn is clipped by its cache canvas, and that the
// figures stand, scale, flash, fade and fall the way the battle line needs.
const fs=require('fs');
const src=fs.readFileSync('./index.html','utf8');

function grab(t){const re=new RegExp('/\\* ==== '+t+' START ==== \\*/([\\s\\S]*?)/\\* ==== '+t+' END ==== \\*/');
 const m=src.match(re); if(!m){console.error('FAIL: '+t+' missing');process.exit(1);} return m[1];}

/* ---------- a recording canvas ----------
   Tracks the transform, samples every curve and arc it is given, and keeps the
   extent of everything filled or stroked, stroke width included. */
function mockCtx(cv){
  let m=[1,0,0,1,0,0], stack=[], cur=[], last=null;
  const ext=[Infinity,Infinity,-Infinity,-Infinity];
  const tx=(x,y)=>[m[0]*x+m[2]*y+m[4], m[1]*x+m[3]*y+m[5]];
  const scaleOf=()=>Math.sqrt(Math.abs(m[0]*m[3]-m[1]*m[2]));
  const push=(p)=>{cur.push(p); last=p;};
  const mark=(pad)=>cur.forEach(p=>{
    ext[0]=Math.min(ext[0],p[0]-pad); ext[1]=Math.min(ext[1],p[1]-pad);
    ext[2]=Math.max(ext[2],p[0]+pad); ext[3]=Math.max(ext[3],p[1]+pad);});
  const ctx={
    canvas:cv, calls:[], ext, globalAlpha:1, fillStyle:'#000', strokeStyle:'#000', lineWidth:1,
    lineJoin:'miter', lineCap:'butt', globalCompositeOperation:'source-over',
    save(){stack.push([m.slice(),this.globalAlpha,this.fillStyle,this.strokeStyle,this.lineWidth,this.globalCompositeOperation]);this.calls.push(['save']);},
    restore(){const t=stack.pop(); if(t){[m,this.globalAlpha,this.fillStyle,this.strokeStyle,this.lineWidth,this.globalCompositeOperation]=t;} this.calls.push(['restore']);},
    translate(x,y){m=[m[0],m[1],m[2],m[3],m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];this.calls.push(['translate',x,y]);},
    scale(a,b){m=[m[0]*a,m[1]*a,m[2]*b,m[3]*b,m[4],m[5]];this.calls.push(['scale',a,b]);},
    rotate(r){const c=Math.cos(r),s=Math.sin(r);m=[m[0]*c+m[2]*s,m[1]*c+m[3]*s,-m[0]*s+m[2]*c,-m[1]*s+m[3]*c,m[4],m[5]];this.calls.push(['rotate',r]);},
    setTransform(a,b,c,d,e,f){m=[a,b,c,d,e,f];this.calls.push(['setTransform']);},
    beginPath(){cur=[];last=null;}, closePath(){},
    moveTo(x,y){push(tx(x,y));}, lineTo(x,y){push(tx(x,y));},
    quadraticCurveTo(cx,cy,x,y){const p0=last||tx(cx,cy),c=tx(cx,cy),p1=tx(x,y);
      for(let i=1;i<=16;i++){const t=i/16,u=1-t;push([u*u*p0[0]+2*u*t*c[0]+t*t*p1[0],u*u*p0[1]+2*u*t*c[1]+t*t*p1[1]]);}},
    bezierCurveTo(ax,ay,bx,by,x,y){const p0=last||tx(ax,ay),a=tx(ax,ay),b=tx(bx,by),p1=tx(x,y);
      for(let i=1;i<=16;i++){const t=i/16,u=1-t;push([u*u*u*p0[0]+3*u*u*t*a[0]+3*u*t*t*b[0]+t*t*t*p1[0],u*u*u*p0[1]+3*u*u*t*a[1]+3*u*t*t*b[1]+t*t*t*p1[1]]);}},
    arcTo(x1,y1){push(tx(x1,y1));},
    arc(x,y,r){for(let i=0;i<48;i++){const a=i/48*Math.PI*2;push(tx(x+r*Math.cos(a),y+r*Math.sin(a)));}},
    ellipse(x,y,rx,ry,rot){const c=Math.cos(rot||0),s=Math.sin(rot||0);
      for(let i=0;i<48;i++){const a=i/48*Math.PI*2,ex=rx*Math.cos(a),ey=ry*Math.sin(a);push(tx(x+ex*c-ey*s,y+ex*s+ey*c));}
      this.calls.push(['ellipse',this.fillStyle]);},
    fill(){mark(0);this.calls.push(['fill',this.fillStyle,this.globalAlpha]);},
    stroke(){mark(this.lineWidth/2*scaleOf());this.calls.push(['stroke']);},
    fillRect(x,y,w,h){this.calls.push(['fillRect',x,y,w,h,this.globalCompositeOperation]);},
    drawImage(img,...a){this.calls.push(['drawImage',img,a,m.slice(),this.globalAlpha]);},
    createLinearGradient(){return {addColorStop(){}};},
    createRadialGradient(){return {addColorStop(){}};}
  };
  return ctx;
}
const created=[];
function mockCanvas(){const c={width:0,height:0,_g:null,getContext(){return this._g||(this._g=mockCtx(this));}};created.push(c);return c;}

const hexMixSrc=src.match(/function hexMix\(a, b, t\) \{[\s\S]*?\n\}/)[0];
const viewSrc=src.slice(src.indexOf('/* ---------- drawn miniatures ----------'), src.indexOf('/* ---------- automap ----------'));
const API=['MINI_LIBRARY','MINI_CLASSIC','miniForMonster','miniForHero','miniKnown','miniBounds','miniCheck','miniDraw','miniTinted',
 'MINI_PLASTIC','MINI_NEGATIVE','MINI_BY_NAME','MINI_BY_ART','registerPackMinis','validatePack','loadPack','BUNDLED_PACK',
 'drawFigure','drawMini','drawHero','miniFoot','MINI_TIERS','MINI_REF_H',
 'miniId','MINI_ALIASES','MINI_VIEWS','MINI_SIZES','MINI_FACTIONS','MITZ_MINIS_VERSION','MitzMinis',
 'miniSprite','miniSetCanvasFactory','miniClearCache','miniBase'];
const M=new Function('mockCanvas','created',
 'var document={createElement:function(){return mockCanvas();}};var devicePixelRatio=1;'+
 'var PAL={stone:"#C69A60",text:"#F4E9D6",pitch:"#080605"};'+hexMixSrc+
 grab('MINI CORE')+grab('BUNDLED PACK')+grab('PACK CORE')+'\nvar __L=loadPack(BUNDLED_PACK);\n'+viewSrc+
 '\nreturn {'+API.join(',')+',cache:function(){return MINI_SPRITES;},monsters:function(){return MONSTERS;},classes:function(){return CLASSES;}};')(mockCanvas,created);

let pass=0,fail=0;
const ok=(n,c,x)=>{if(c){pass++;console.log('  ok   '+n);}else{fail++;console.log('  FAIL '+n+(x?'  -> '+x:''));}};
const P=M.BUNDLED_PACK, LIB=M.MINI_LIBRARY, IDS=Object.keys(LIB);
const HEROES=['fighter.m','fighter.f','wizard.m','wizard.f','priest.m','priest.f'];

console.log('\n[M1] the library is sound');
ok('there is a sizeable library', IDS.length>=45, IDS.length+' sculpts');
ok('every sculpt passes the same check a pack sculpt must',
   IDS.every(id=>M.miniCheck(id,LIB[id]).length===0),
   IDS.map(id=>M.miniCheck(id,LIB[id]).join('; ')).filter(Boolean).join(' | '));
ok('every sculpt has a display name', IDS.every(id=>typeof LIB[id].name==='string' && LIB[id].name.length));
ok('a hero of each class and sex', HEROES.every(id=>LIB[id] && LIB[id].faction==='hero'), HEROES.filter(id=>!LIB[id]).join(','));
ok('the male and female figures are different sculpts',
   [['fighter.m','fighter.f'],['wizard.m','wizard.f'],['priest.m','priest.f']].every(([a,b])=>JSON.stringify(LIB[a].ops)!==JSON.stringify(LIB[b].ops)));
// 2.5.0: every hero is .m and .f
ok('monsters are not heroes', IDS.filter(id=>!/^(fighter|wizard|priest|ranger|bard|cleric|rogue|barbarian|paladin|druid|monk|warlock|sorcerer|tinker)\.(m|f)$/.test(id)).every(id=>LIB[id].faction!=='hero'));
// 2.1.0: Hold the Line's Phase 3 figures
const P3 = ['paladin','druid','monk','warlock','sorcerer','tinker','ankheg','hobgoblin','imp','wolf.rider','troll',
  'ooze.cube','rust.monster','medusa','vampire','necromancer','dragon.red','barricade','font.holy','caltrops','oil.flask','ballista'];
// 2.5.0: the heroes among them are .m now, and the plain id finds that
P3.forEach((id,i)=>{ P3[i]=M.miniId(id)||id; });
ok('2.1.0 carries the 22 Phase 3 figures', P3.every(id=>LIB[id]), P3.filter(id=>!LIB[id]).join(','));
ok('the six heroes stand on hero bases', P3.slice(0,6).every(id=>LIB[id].faction==='hero'));
ok('the defenders and the ballista stand on the neutral base', P3.slice(17).every(id=>LIB[id].faction==='neutral'));
ok("Hold the Line's names for them resolve", [['wolfRider','wolf.rider'],['gelCube','ooze.cube'],['rustMonster','rust.monster'],
  ['redDragon','dragon.red'],['font','font.holy'],['oil','oil.flask']].every(([a,b])=>M.miniId(a)===b));
ok('the young red dragon is large, leaving room for others', LIB['dragon.red'].size==='large');
ok('no figure ships a measured box (miniBounds measures its own)',
   (()=>{const a=src.indexOf('var MINI_SHARED_FIGURES = {'), b=src.indexOf('\n};', a);
         return a>0 && b>a && src.slice(a,b).indexOf('"_box"')<0;})());
ok('every figure has a faction and a rules size', IDS.every(id=>M.MINI_FACTIONS[LIB[id].faction] && M.MINI_SIZES[LIB[id].size]),
   IDS.filter(id=>!(M.MINI_FACTIONS[LIB[id].faction] && M.MINI_SIZES[LIB[id].size])).join(','));
ok('the sculpts face a declared way', IDS.every(id=>!LIB[id].face || LIB[id].face==='left' || LIB[id].face==='right'));
ok('the sculpts are pure data', IDS.every(id=>LIB[id].ops.every(op=>Array.isArray(op) && typeof op[0]==='string')),
   'a function in the ops would stop a pack from writing its own');

console.log('\n[M2] nothing drawn falls outside its box');
// The box sizes the cached canvas. Anything outside it would be clipped. Drawn
// at the smallest tier, where the outline is thickest relative to the figure.
const PAD=0.03, LW=Math.max(1.1/40,0.014);
const outside=[];
IDS.forEach(id=>{
  const g=mockCtx({});
  M.miniDraw(g, LIB[id], LW, M.MINI_PLASTIC, {faction: LIB[id].faction});
  const b=M.miniBounds(LIB[id]), e=g.ext;
  if(e[0]<b[0]-PAD||e[1]<b[1]-PAD||e[2]>b[2]+PAD||e[3]>b[3]+PAD)
    outside.push(id+' ['+e.map(v=>v.toFixed(3))+'] vs ['+b.map(v=>v.toFixed(3))+']');
});
ok('every sculpt stays inside its box, outline and all', !outside.length, outside.join(' | '));
ok('every sculpt draws something', IDS.every(id=>{const g=mockCtx({}); M.miniDraw(g,LIB[id],LW,M.MINI_PLASTIC,'monster');
   return g.calls.filter(c=>c[0]==='fill').length>=4;}));
ok('the base is part of the box', IDS.every(id=>{const b=M.miniBounds(LIB[id]),rx=LIB[id].rx||0.3;
   return b[0]<=-rx+1e-9 && b[2]>=rx-1e-9 && b[3]>=rx*0.36*1.55-1e-9;}));
// v4.2: the sculpting box is ±1 wide since Hold the Line's horror and colossus joined
ok('every figure fits the sculpting box', IDS.every(id=>{const b=M.miniBounds(LIB[id]);
   return (b[3]-b[1])>0.25 && (b[2]-b[0])<=2 && b[1]>=-2;}), IDS.filter(id=>{const b=M.miniBounds(LIB[id]); return !((b[3]-b[1])>0.25 && (b[2]-b[0])<=2 && b[1]>=-2);}).join(','));

console.log('\n[M3] every monster and hero resolves to a figure');
const mons=P.monsters, mids=Object.keys(mons);
ok('every monster in the pack names a sculpt', mids.every(k=>typeof mons[k].mini==='string'), mids.filter(k=>!mons[k].mini).join(','));
ok('every named sculpt is in the library', mids.every(k=>M.miniKnown(mons[k].mini)), mids.filter(k=>!M.miniKnown(mons[k].mini)).join(','));
const distinct=new Set(mids.map(k=>mons[k].mini));
ok('the bestiary is not one silhouette', distinct.size>=36, distinct.size+' distinct for '+mids.length+' monsters');
ok('a monster\'s own mini wins', mids.every(k=>M.miniForMonster(k,mons[k])===mons[k].mini));
// a pack that never heard of `mini` should still get the right figures by name
const byName=mids.filter(k=>{const d=Object.assign({},mons[k]); delete d.mini; return M.miniForMonster(k,d)!==mons[k].mini;});
ok('without `mini`, the name alone finds the same figure', byName.length===0,
   byName.map(k=>mons[k].name+' -> '+M.miniForMonster(k,Object.assign({},mons[k],{mini:undefined}))).join(', '));
// 2.1.0: a hobgoblin, a troll and a necromancer have figures of their own now
[['Frost Goblin','goblin'],['Hobgoblin Captain','hobgoblin'],['Giant Rat','rat'],['Vampire Bat','bat'],
 ['Hill Giant','ogre'],['Cave Troll','troll'],['Plague Zombie','ghoul'],['Banshee','wraith'],['Bandit','brigand'],
 ['Cultist','mage.renegade'],['Fire Beetle','beetle'],['Black Pudding','gloom'],['Will-o-wisp','wisp'],
 ['Salamander','salamander'],['Will-o-the-Ember','ember'],['Clockwork Guard','sentinel'],['Death Knight','bone.knight'],['Necromancer','necromancer'],
 ['Crossbowman','brigand.archer'],['Giant Scorpion','wolf'],['Barrow Lich','lich'],['Imp','imp'],
 ['Goblin Wolf Rider','wolf.rider'],['Gelatinous Cube','ooze.cube'],['Young Red Dragon','dragon.red'],
 ['Rust Monster','rust.monster'],['Medusa','medusa'],['Vampire Lord','vampire'],['Ankheg','ankheg'],
 ['Goblin Chief','goblin.chief'],
 // 2.3.0: the Delve's terrain bestiary
 ['Barrow Mummy','mummy'],['Giant Crab','crab'],['Giant Frog','frog'],['Drowned Dead','drowned'],
 ['Animated Armour','armour.animated'],['Mimic','mimic'],['Gloom Eel','serpent'],['Iron Sentinel','sentinel']].forEach(([name,want])=>{
  const got=M.miniForMonster('mn.custom',{name:name,art:'beast.quad'});
  ok('"'+name+'" is drawn as '+want, got===want, got);
});
ok('a nameless thing falls back to its art family',
   Object.keys(M.MINI_BY_ART).every(a=>M.miniForMonster('mn.zz',{name:'Zzyzx',art:a})===M.MINI_BY_ART[a]));
ok('an unknown family still gets a figure', M.miniKnown(M.miniForMonster('mn.zz',{name:'Zzyzx',art:'strange.thing'})));
ok('no def at all still gets a figure', M.miniKnown(M.miniForMonster(null,null)));
ok('an unknown mini name falls back rather than blanking',
   M.miniForMonster('mn.goblin',{name:'Goblin',art:'humanoid.small',mini:'no.such'})==='goblin');

const C=M.classes();
[['fighter','male','fighter.m'],['fighter','female','fighter.f'],['mage','male','wizard.m'],['mage','female','wizard.f'],
 ['priest','male','priest.m'],['priest','female','priest.f']].forEach(([c,sx,want])=>{
  ok(c+' / '+sx+' draws as '+want, M.miniForHero({class:c,sex:sx},C[c])===want);
});
// 2.1.0: a class with a figure of its own gets it, not the nearest of the three
// 2.5.0: and of the sex asked for, now that every hero is .m and .f
ok('a pack class is matched by its words', M.miniForHero({class:'paladin',sex:'female'},{name:'Paladin'})==='paladin.f' &&
   M.miniForHero({class:'cleric',sex:'male'},{name:'Cleric'})==='cleric.m' &&
   M.miniForHero({class:'rogue',sex:'male'},{name:'Rogue'})==='rogue.m' &&
   M.miniForHero({class:'knight',sex:'female'},{name:'Knight'})==='fighter.f' &&
   M.miniForHero({class:'hunter',sex:'male'},{name:'Hunter'})==='ranger.m');
// a plain hero id is the .m figure (2.5.0)
ok('a class may name its figures by sex', M.miniForHero({class:'x',sex:'male'},{minis:{male:'bard',female:'ranger'}})==='bard.m' &&
   M.miniForHero({class:'x',sex:'female'},{minis:{male:'bard',female:'ranger.f'}})==='ranger.f');
ok('a character may name its own', M.miniForHero({class:'fighter',sex:'male',mini:'ranger'},C.fighter)==='ranger.m');
ok('an unknown class still gets a figure of the right sex',
   M.miniForHero({class:'zz',sex:'female'},{name:'Zz'})==='fighter.f' && M.miniForHero({class:'zz',sex:'male'},{name:'Zz'})==='fighter.m');

console.log('\n[M4] a pack may sculpt its own');
const blob={name:'Bog Blob',rx:0.28,ops:[['S',['ell',0,-0.2,0.2,0.18]],['D',0.8,['circ',-0.05,-0.24,0.02],['circ',0.05,-0.24,0.02]]]};
const withMini=()=>{const b=JSON.parse(JSON.stringify(P)); b.minis={'bog.blob':JSON.parse(JSON.stringify(blob))};
  b.monsters['mn.gloom'].mini='bog.blob'; return b;};
let r=M.validatePack(withMini());
ok('a sound pack sculpt validates', r.ok, r.errors.join('; '));
ok('and raises no warning about the monster that uses it', !r.warnings.some(w=>/bog\.blob/.test(w)), r.warnings.filter(w=>/bog/.test(w)).join('; '));
ok('it joins the library when the pack loads', (()=>{const L=M.loadPack(withMini()); return L.ok && M.miniKnown('bog.blob');})());
ok('and the monster draws with it', M.miniForMonster('mn.gloom',M.monsters()['mn.gloom'])==='bog.blob');
M.loadPack(JSON.parse(JSON.stringify(P)));   // back to the bundled pack for the rest
const bad=(ops,extra)=>{const b=JSON.parse(JSON.stringify(P)); b.minis={'bad.one':Object.assign({ops:ops},extra||{})}; return M.validatePack(b);};
r=bad([['S',['blob',0,0,1]]]); ok('an unknown shape is refused', !r.ok && r.errors.some(e=>/bad shape/.test(e)), r.errors.join('; '));
r=bad([['Z',1,2]]); ok('an unknown op is refused', !r.ok && r.errors.some(e=>/unknown kind/.test(e)));
r=bad([['R',0.02,0,0]]); ok('a rod with one point is refused', !r.ok && r.errors.some(e=>/two points/.test(e)));
r=bad([]); ok('an empty sculpt is refused', !r.ok && r.errors.some(e=>/no ops/.test(e)));
r=bad([['S',['circ',0,-3,0.2]]]); ok('one that reaches out of the sculpting box is refused', !r.ok && r.errors.some(e=>/sculpting box/.test(e)));
r=bad([['S',['circ',0,-0.3,0.2]]],{rx:2}); ok('an absurd base is refused', !r.ok && r.errors.some(e=>/base radius/.test(e)));
ok('a pack sculpt cannot replace a built-in', (()=>{const b=JSON.parse(JSON.stringify(P));
   b.minis={'goblin':JSON.parse(JSON.stringify(blob))}; const v=M.validatePack(b); const before=LIB.goblin.ops.length;
   M.loadPack(b); const kept=M.MINI_LIBRARY.goblin.ops.length===before && !M.MINI_LIBRARY.goblin.fromPack;
   M.loadPack(JSON.parse(JSON.stringify(P)));
   return v.ok && v.warnings.some(w=>/built-in/.test(w)) && kept;})());
ok('a monster naming a missing sculpt warns, not fails', (()=>{const b=JSON.parse(JSON.stringify(P));
   b.monsters['mn.goblin'].mini='nope'; const v=M.validatePack(b); return v.ok && v.warnings.some(w=>/mn\.goblin.*nope.*drawn as "goblin"/.test(w));})());
ok('a class figure for an unknown sex fails', (()=>{const b=JSON.parse(JSON.stringify(P));
   b.classes.fighter.minis={other:'fighter.m'}; return !M.validatePack(b).ok;})());
ok('a class naming a missing figure warns', (()=>{const b=JSON.parse(JSON.stringify(P));
   b.classes.mage.minis={male:'nobody'}; const v=M.validatePack(b); return v.ok && v.warnings.some(w=>/nobody/.test(w));})());
ok('the bundled pack itself validates clean of mini warnings', !M.validatePack(JSON.parse(JSON.stringify(P))).warnings.some(w=>/miniature|mini "/i.test(w)));

console.log('\n[M5] figures stand, scale, flash, fade and fall');
const imgs=g=>g.calls.filter(c=>c[0]==='drawImage');
function draw(id,opts,figH){const g=mockCtx({}); const okd=M.drawFigure(g,id,100,200,figH==null?100:figH,opts||{}); return {g,okd};}
function shownHeight(id,figH){const {g}=draw(id,{},figH); const d=imgs(g)[0]; const b=M.miniBounds(LIB[id]);
  const u=d[2][2]/(b[2]-b[0]+2*PAD); return {u, h:(b[3]-b[1])*u, bottom:d[3][5]+d[3][3]*(d[2][1]+d[2][3])-PAD*u, d};}
ok('an unknown sculpt draws nothing and says so', (()=>{const {g,okd}=draw('no.such'); return okd===false && imgs(g).length===0;})());
ok('a zero height draws nothing', draw('goblin',{},0).okd===false);
const F=shownHeight('fighter.m',100);
ok('a man-sized figure is drawn at the height asked for', Math.abs(F.h-100)<2.5, F.h.toFixed(1));
ok('the base stands on the ground line', Math.abs(F.bottom-200)<1.5, F.bottom.toFixed(2));
ok('so does a small one and a big one', ['rat','goblin','colossus','wisp'].every(id=>Math.abs(shownHeight(id,100).bottom-200)<1.5),
   ['rat','goblin','colossus','wisp'].map(id=>id+':'+shownHeight(id,100).bottom.toFixed(1)).join(' '));
const hG=shownHeight('goblin',100).h, hR=shownHeight('rat',100).h, hC=shownHeight('colossus',100).h, hO=shownHeight('ogre',100).h;
ok('a goblin is smaller than a fighter', hG<F.h, hG.toFixed(1));
ok('but not a smudge beside one', hG>=0.7*F.h, hG.toFixed(1)+' vs '+F.h.toFixed(1));
ok('a rat is smaller still', hR<hG, hR.toFixed(1));
ok('an ogre and a colossus loom', hO>F.h && hC>F.h, hO.toFixed(1)+' / '+hC.toFixed(1));
ok('but stay inside a sensible slot', hC<1.5*F.h, hC.toFixed(1));

let n0=created.length; draw('priest.f'); const n1=created.length; draw('priest.f');
ok('a figure is drawn once and then reused', n1>n0 && created.length===n1, (n1-n0)+' then '+(created.length-n1));
ok('a bigger draw uses a finer cache', (()=>{draw('priest.f',{},30); const a=created.length; draw('priest.f',{},280); return created.length>a;})());
// 2.2.0 adds the pose to the key (empty for the plain figure)
ok('the cache keys by figure, size, finish, base, view, light and pose', Object.keys(M.cache()).every(k=>k.split('|').length===8));

let t=draw('goblin',{flash:true});
const plate=t.g.calls.findIndex(c=>c[0]==='fill' && c[1]==='#F4E9D6'), firstImg=t.g.calls.findIndex(c=>c[0]==='drawImage');
ok('a struck figure gets a bright plate behind it', plate>=0 && plate<firstImg);
ok('and is drawn from the negative', Object.keys(M.cache()).some(k=>/^goblin\|\d+\|negative\|/.test(k)));
ok('the negative is a true inverse of the plastic', ['hi','mid','lo','out'].every(k=>{
   const a=parseInt(M.MINI_PLASTIC[k].slice(1),16), b=parseInt(M.MINI_NEGATIVE[k].slice(1),16);
   return [16,8,0].every(s=>((a>>s)&255)+((b>>s)&255)===255);}));
ok('a struck figure is not also darkened', imgs(t.g).length===1);

t=draw('goblin',{lit:0.4});
ok('in the dark a shadowed copy is laid over it', imgs(t.g).length===2 && Math.abs(imgs(t.g)[1][4]-0.6)<1e-9,
   imgs(t.g).map(c=>c[4]).join(','));
t=draw('goblin',{lit:1});
ok('in full light there is only one', imgs(t.g).length===1);
ok('the main canvas is never composited', (()=>{const g=mockCtx({});
   ['goblin','fighter.m','colossus'].forEach(id=>{M.drawFigure(g,id,50,90,80,{lit:0.3});M.drawFigure(g,id,50,90,80,{flash:true});});
   return g.globalCompositeOperation==='source-over' && !g.calls.some(c=>c[0]==='setTransform');})(),
   'compositing on the shared canvas wipes everything already drawn');
ok('the shadow is made offscreen', created.some(c=>c._g && c._g.calls.some(k=>k[0]==='fillRect' && k[5]==='source-atop')));

const flips=(id,want)=>draw(id,{want:want}).g.calls.some(c=>c[0]==='scale' && c[1]===-1);
ok('a right-facing figure turns to look left', flips('fighter.m','left'));
ok('and is left alone when right is wanted', !flips('fighter.m','right'));
ok('a figure sculpted facing left is not turned to look left', !flips('ranger','left'));
ok('but is turned to look right', flips('ranger','right'));
ok('no preference, no turning', !flips('goblin',undefined) && !flips('goblin',false));
const rot=(id,dir)=>(draw(id,{topple:dir}).g.calls.find(c=>c[0]==='rotate')||[])[1];
ok('a fallen figure is knocked over', Math.abs(Math.abs(rot('goblin',-1))-Math.PI/2*0.94)<1e-9);
ok('either way', rot('goblin',-1)<0 && rot('goblin',1)>0);
ok('a standing one is not', rot('goblin',0)===undefined);

console.log('\n[M6] monsters and heroes through the game\'s own calls');
const keysAfter=fn=>{const before=new Set(Object.keys(M.cache())); fn(); return Object.keys(M.cache()).filter(k=>!before.has(k));};
const anyKey=(fn,re)=>{const g=mockCtx({}); const ks=keysAfter(()=>fn(g)); const all=Object.keys(M.cache()); return ks.concat(all).some(k=>re.test(k));};
ok('a pack monster draws its own sculpt', anyKey(g=>M.drawMini(g,50,90,80,3,'humanoid.large',1,false,'mn.lizardfolk','right'),/^lizardfolk\|/));
ok('a boss stands on a gold-rimmed base', anyKey(g=>M.drawMini(g,50,90,80,3,'humanoid.large',1,false,'mn.goblinChief','right'),/^goblin\.chief\|\d+\|lit\|monster\+boss\|/));
ok('an ordinary monster does not', anyKey(g=>M.drawMini(g,50,90,80,1,'humanoid.small',1,false,'mn.goblin','right'),/^goblin\|\d+\|lit\|monster\|/));
ok('an unknown ref falls back on the art it was given', anyKey(g=>M.drawMini(g,50,90,80,1,'beast.wing',1,false,'mn.nothing'),/^bat\|/));
ok('the old call shape still works', M.drawMini(mockCtx({}),50,90,80,2,'undead',0.5)===true);
ok('a hero draws in the class and sex', anyKey(g=>M.drawHero(g,50,90,80,'mage','ok',1,false,{class:'mage',sex:'male'}),/^wizard\.m\|\d+\|lit\|hero\|/));
ok('without the character, the class alone still draws', M.drawHero(mockCtx({}),50,90,80,'priest','ok',1,false)===true);
t={g:mockCtx({})}; M.drawHero(t.g,50,90,80,'fighter','down',1,false,{class:'fighter',sex:'female'});
ok('a fallen hero is knocked over and faded', t.g.calls.some(c=>c[0]==='rotate' && c[1]>0) && Math.abs(imgs(t.g)[0][4]-0.4)<1e-9);
t={g:mockCtx({})}; M.drawHero(t.g,50,90,80,'fighter','hurt',1,false,{class:'fighter',sex:'female'});
ok('a hurt one still stands', !t.g.calls.some(c=>c[0]==='rotate'));
ok('heroes look toward the enemy', (()=>{const g=mockCtx({}); M.drawHero(g,50,90,80,'fighter','ok',1,false,{class:'fighter',sex:'male'});
   return g.calls.some(c=>c[0]==='scale' && c[1]===-1);})());

console.log('\n[M7] wiring in the game');
ok('the library sits before the pack loader', src.indexOf('==== MINI CORE START') < src.indexOf('==== PACK CORE START'));
ok('loading a pack registers its sculpts', /if \(typeof registerPackMinis === 'function'\) registerPackMinis\(p\);/.test(src));
// v4.5: drawn through the stage; a figure the stage felled is turned over by the stage
ok('combat passes the monster\'s ref, the way it faces, and its slot width', /drawMini\(g, (x, ground|fx, fy), hgt \* 1\.05, m\.level, m\.art, alive \? 1 : 0\.5, (hitNow|flashNow),\s+m\.ref, 'right', alive( \|\| felled)? \? 0 : -1, null, step \* 1\.15\)/.test(src));
ok('a wide figure is held to its slot', (()=>{ const g=mockCtx({}); M.drawFigure(g,'colossus',100,200,100,{maxW:60});
   const d=g.calls.find(c=>c[0]==='drawImage'), b=M.miniBounds(LIB.colossus), u=d[2][2]/(b[2]-b[0]+2*PAD);
   return (b[2]-b[0])*u <= 60.5; })());
ok('a narrow one is not shrunk by it', (()=>{ const a=mockCtx({}), b=mockCtx({}); M.drawFigure(a,'goblin',100,200,100,{}); M.drawFigure(b,'goblin',100,200,100,{maxW:200});
   return a.calls.find(c=>c[0]==='drawImage')[2][2] === b.calls.find(c=>c[0]==='drawImage')[2][2]; })());
// v4.5: combat figures are drawn through the stage, at (fx, fy) after motion
ok('drawn monsters stand at the same height a render would', /drawSprite\(g, m\.ref, (x, ground|fx, fy), hgt \* 1\.05/.test(src));
ok('combat passes the character, not just the class', /drawHero\(g, (x, ground|fx, fy), hgt \* 1\.05, m\.class, woundState\(m\), (1|heldLit), (pHit|flashNow), m(, pFelled)?\)/.test(src));
ok('the corridor draws at a render\'s height too', /drawMini\(g, midX, bot - h \* 0\.04, h \* 0\.62,/.test(src));
ok('renders still come first', /if \(!drawSprite\(g, m\.ref[\s\S]{0,300}drawMini\(/.test(src) && /if \(!drewHero\) \{[\s\S]{0,120}drawHero\(/.test(src));
ok('?figures=drawn shows the drawn library everywhere', /figures=drawn/.test(src) && /if \(FIGURES_DRAWN\) return false;/.test(src));
ok('the roster offers both sexes for every class', (()=>{
  const cs=new Function('CLASSES','SPRITE_INDEX','miniForHero','miniKnown',
    src.match(/function classSexes\(classId\) \{[\s\S]*?\n\}/)[0]+'\nreturn classSexes;')(C,{},M.miniForHero,M.miniKnown);
  return Object.keys(C).every(c=>cs(c).length===2);})());
ok('more than ten foes still get letters', /var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';/.test(src));

console.log('\n[M8] one library for both games');
const SHARED = './mitznsimz_minis.js';
ok('the library carries a version stamp', /^\d+\.\d+\.\d+$/.test(M.MITZ_MINIS_VERSION), M.MITZ_MINIS_VERSION);
ok('the canonical file sits beside the game', fs.existsSync(SHARED), 'copy mitznsimz_minis.js into this folder');
if (fs.existsSync(SHARED)) {
  const canon = fs.readFileSync(SHARED, 'utf8');
  const block = src.match(/\/\* ==== MINI CORE START ==== \*\/[\s\S]*?\/\* ==== MINI CORE END ==== \*\//)[0];
  ok('the game embeds it word for word', canon.trim() === block.trim(),
     'run the sync: the embedded MINI CORE differs from mitznsimz_minis.js');
  const stamp = (canon.match(/MITZ_MINIS_VERSION = '([^']+)'/) || [])[1];
  ok('and at the same version', stamp === M.MITZ_MINIS_VERSION, stamp + ' vs ' + M.MITZ_MINIS_VERSION);
  const alone = new Function('var module={exports:{}};' + canon + '\nreturn module.exports;')();
  ok('the file loads on its own, as Hold the Line loads it', alone && alone.version === M.MITZ_MINIS_VERSION && Object.keys(alone.library).length === IDS.length);
  ok('and touches no page: no document, no window', !/\bdocument\.|\bwindow\./.test(canon.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
}
const HTL_API = ['sprite', 'has', 'SIZES', 'VIEWS', 'flash', 'clearCache', 'setCanvasFactory'];
ok('Hold the Line\'s calls are on MitzMinis', HTL_API.every(k => M.MitzMinis[k] !== undefined), HTL_API.filter(k => M.MitzMinis[k] === undefined).join(','));
ok('and the rest of the library is too', ['draw', 'check', 'bounds', 'id', 'forMonster', 'forHero', 'register', 'library', 'aliases'].every(k => M.MitzMinis[k] !== undefined));
const HTL_IDS = 'fighter ranger bard wizard goblin orc ogre goblinArcher goblinShaman goblinChief kobold brigand brigandArcher renegadeMage fallenPriest orcRaider orcChampion lizardfolk boneKnight cryptWarden ironSentinel gargoyle clayGolem stoneColossus skeleton skelArcher ghoul wight wraith barrowLich boneTitan shade direRat caveBat warrenHound tombSpider caveSerpent direWolf giantBeetle caveBear rotGrub deepLeech gloom shadeWisp emberWisp deepHorror'.split(' ');
const AWAITED = ['cleric', 'rogue', 'barbarian', 'proxy'];
ok('every Hold the Line name finds a figure', HTL_IDS.every(i => M.miniKnown(i)), HTL_IDS.filter(i => !M.miniKnown(i)).join(','));
ok('apart from the four it is converting, at most', AWAITED.concat(HTL_IDS).filter(i => !M.miniKnown(i)).every(i => AWAITED.indexOf(i) >= 0));
ok('every alias points at a real figure', Object.keys(M.MINI_ALIASES).every(a => LIB[M.MINI_ALIASES[a]]), Object.keys(M.MINI_ALIASES).filter(a => !LIB[M.MINI_ALIASES[a]]).join(','));
ok('an alias is never also a figure of its own', Object.keys(M.MINI_ALIASES).every(a => !LIB[a]));
ok('a pack id that is a name in either game needs no `mini`', M.miniForMonster('mn.caveBat') === 'bat' && M.miniForMonster('mn.goblinArcher') === 'goblin.archer');
ok('a pack may name a figure by its alias', M.miniForMonster('mn.x', { name: 'X', mini: 'barrowLich' }) === 'lich');

const STANDS = IDS.filter(id => LIB[id].ops.some(op => op[0] === 'T'));
ok('flyers stand on clear stands', ['bat', 'wisp', 'ember', 'wraith', 'shade'].every(id => STANDS.indexOf(id) >= 0), STANDS.join(','));
ok('a stand is inside its figure\'s box', STANDS.every(id => { const op = LIB[id].ops.find(o => o[0] === 'T'), b = M.miniBounds(LIB[id]); return op[2] >= b[1] && op[1] >= b[0] && op[1] <= b[2]; }));
ok('a stand with no top is refused', M.miniCheck('x', { ops: [['T', 0]] }).some(e => /top of the stand/.test(e)));
ok('a stand draws see-through, never solid', (() => { const g = mockCtx({}); M.miniDraw(g, LIB.bat, LW, M.MINI_PLASTIC, 'monster');
   return g.calls.length > 0; })() && !LIB.bat.ops.some(op => op[0] === 'R' && op[2] === 0 && op[3] === -0.02));

ok('at eye level the base is flatter', M.miniFoot(LIB.goblin, 'front') < M.miniFoot(LIB.goblin, 'tabletop'));
ok('and the figure still stands on the line', (() => { const g = mockCtx({}); M.drawFigure(g, 'goblin', 100, 200, 100, { view: 'front' });
   const d = g.calls.find(c => c[0] === 'drawImage'), b = M.miniBounds(LIB.goblin), u = d[2][2] / (b[2] - b[0] + 2 * PAD);
   return Math.abs(d[3][5] - 200 + M.miniFoot(LIB.goblin, 'front') * u) < 0.5; })());
ok('the corridor draws at eye level, combat on the table', /lit, false, lead, null, 0, 'front'\)/.test(src) && !/drawMini\(g, x, ground[^;]*'front'/.test(src));
ok('a neutral figure stands on walnut', (() => { const g = mockCtx({}); M.miniDraw(g, LIB.goblin, LW, M.MINI_PLASTIC, { faction: 'neutral' });
   return g.calls.some(c => c[0] === 'fill' && c[1] === M.MINI_FACTIONS.neutral.side); })());
ok('the old words still work: foe is a monster, boss a monster with a gold rim', (() => {
   const a = mockCtx({}), b = mockCtx({}); M.miniDraw(a, LIB.goblin, LW, M.MINI_PLASTIC, 'foe'); M.miniDraw(b, LIB.goblin, LW, M.MINI_PLASTIC, 'boss');
   return a.calls.some(c => c[0] === 'fill' && c[1] === M.MINI_FACTIONS.monster.side) && b.calls.some(c => c[0] === 'fill' && c[1] === M.MINI_FACTIONS.monster.side); })());
ok('Hold the Line\'s flash is a cream silhouette, made offscreen', (() => { const n = created.length; const s = M.MitzMinis.flash('goblin', 40);
   const cv = created[created.length - 1]; return s && created.length === n + 1 && cv._g.calls.some(k => k[0] === 'fillRect' && k[5] === 'source-in'); })());
ok('without a canvas factory the library draws nothing, and does not reach for a page', (() => {
   M.miniSetCanvasFactory(null); const none = M.miniSprite('goblin', 40, {}) === null;
   M.miniSetCanvasFactory(function (w, h) { const c = mockCanvas(); c.width = w; c.height = h; return c; });
   return none && M.miniSprite('goblin', 40, {}) !== null; })());
ok('a v4.1 pack figure, size as a number, still loads as its scale', (() => {
   const b = JSON.parse(JSON.stringify(P)); b.minis = { 'old.blob': { rx: 0.28, size: 1.2, kind: 'hero', ops: [['S', ['ell', 0, -0.2, 0.2, 0.18]]] } };
   M.loadPack(b); const f = M.MINI_LIBRARY['old.blob']; M.loadPack(JSON.parse(JSON.stringify(P)));
   return f && f.scale === 1.2 && f.size === 'medium' && f.faction === 'hero'; })());
ok('a rules size that is not one is refused', M.miniCheck('x', { size: 'gigantic', ops: [['S', ['circ', 0, -0.2, 0.1]]] }).some(e => /tiny, small, medium, large or huge/.test(e)));

console.log('\n[M9] 2.2.0: materials and poses');
{
  const MM = M.MitzMinis, base = LIB.goblin.ops;
  const strike = JSON.parse(JSON.stringify(base)).concat([['R', 0.03, 0.1, -0.4, 0.35, -0.7]]);
  ok('the stamp is 2.2.0 or later', /^2\.(2|[3-9])\.\d+$/.test(M.MITZ_MINIS_VERSION), M.MITZ_MINIS_VERSION);
  ok('eight materials', MM.MATERIALS.join() === 'metal,bone,stone,ooze,flesh,ember,spirit,wood');
  ok('a figure without one reads as flesh', MM.material('goblin') === 'flesh' && MM.material('no.such') === 'flesh');
  ok('a material outside the eight is refused', M.miniCheck('x', { material: 'jelly', ops: base }).some(e => /material "jelly"/.test(e)));
  ok('one of the eight is fine', M.miniCheck('x', { material: 'stone', ops: base }).length === 0);
  ok('poses are checked op by op', M.miniCheck('x', { ops: base, poses: { strike: [['Q', 1]] } }).some(e => /pose "strike" op 0/.test(e)));
  ok('a pose must stay in the sculpting box', M.miniCheck('x', { ops: base, poses: { strike: [['R', 0.03, 0, 0, 1.5, -0.5]] } }).some(e => /pose "strike" reaches outside/.test(e)));
  ok('pose names are lower case words', M.miniCheck('x', { ops: base, poses: { 'Big Swing': strike } }).some(e => /pose named/.test(e)));
  ok('poses must be a { name: ops } object', M.miniCheck('x', { ops: base, poses: [strike] }).some(e => /not a \{ name: ops \}/.test(e)));
  ok('a sound posed figure passes', M.miniCheck('x', { ops: base, material: 'flesh', poses: { strike: strike, cast: base } }).length === 0);
  const b = JSON.parse(JSON.stringify(P));
  b.minis = { 'posed.gob': { name: 'Posed', faction: 'monster', size: 'small', rx: 0.26, material: 'metal', ops: base, poses: { strike: strike } } };
  M.loadPack(b);
  ok('a pack figure keeps its material and poses', MM.material('posed.gob') === 'metal' && MM.has('posed.gob', 'strike'));
  ok('has(id, pose) knows which poses exist', MM.has('posed.gob') && MM.has('posed.gob', 'strike') && !MM.has('posed.gob', 'cast') && !MM.has('goblin', 'strike'));
  // 2.4.0: the goblin leans back in hurt now; the colossus is too big to have any pose
  ok('poses(id) lists them', MM.poses('posed.gob').join() === 'strike' && MM.poses('colossus').length === 0);
  ok('list() still lists figures only', MM.list().every(id => !/strike/.test(id)) && MM.list().indexOf('posed.gob') >= 0);
  const plain = M.miniSprite('posed.gob', 40, {}), posed = M.miniSprite('posed.gob', 40, { pose: 'strike' }),
        missing = M.miniSprite('posed.gob', 40, { pose: 'cast' });
  ok('sprite draws the pose', posed && posed.pose === 'strike' && posed !== plain);
  ok('and falls back to the plain figure for a pose it lacks', missing === plain && missing.pose === null);
  ok('a pose has its own box', JSON.stringify(MM.box('posed.gob', 'strike')) !== JSON.stringify(MM.box('posed.gob')));
  ok('a pose stands on the same base', posed.foot === plain.foot);
  ok('the game draws a pose when asked (v4.5: the stage asks mid-move)', (() => {
    const g = mockCtx({}); M.drawFigure(g, 'posed.gob', 100, 200, 100, { pose: 'strike' });
    return Object.keys(M.cache()).some(k => /^posed\.gob\|.*\|strike$/.test(k)); })());
  M.loadPack(JSON.parse(JSON.stringify(P)));
  ok('every shared figure with poses or a material passes the checker', IDS.every(id => M.miniCheck(id, LIB[id]).length === 0));
}

console.log('\n[M10] 2.3.0: Hold the Line\'s material map');
{
  const MM = M.MitzMinis;
  // as posted in the roadmap thread with Hold the Line v1.4; anything unlisted reads as flesh
  const MAP = {"fighter.m":"metal","fighter.f":"metal","paladin":"metal","bone.knight":"metal","crypt.warden":"metal",
    "sentinel":"metal","hobgoblin":"metal","orc.champion":"metal","rust.monster":"metal","caltrops":"metal",
    "skeleton":"bone","skeleton.archer":"bone","bone.titan":"bone","lich":"bone",
    "gargoyle":"stone","golem.clay":"stone","colossus":"stone","font.holy":"stone","oil.flask":"stone",
    "gloom":"ooze","ooze.cube":"ooze","leech":"ooze","grub":"ooze","ember":"ember","dragon.red":"ember",
    "wraith":"spirit","wisp":"spirit","shade":"spirit","barricade":"wood","ballista":"wood"};
  const off = Object.keys(MAP).filter(id => MM.material(id) !== MAP[id]);
  ok('all thirty figures are made of what Hold the Line says', off.length === 0, off.join());
  const DELVE = { 'mummy': 'flesh', 'crab': 'bone', 'frog': 'flesh', 'drowned': 'flesh', 'armour.animated': 'metal',
                  'mimic': 'wood', 'salamander': 'ember' };
  ok('the Delve\'s seven keep theirs', Object.keys(DELVE).every(id => MM.material(id) === DELVE[id]));
  // 2.5.0: the paladin is paladin.m and paladin.f now, both of metal
  const listed = id => MAP[id] || MAP[id.replace(/\.(m|f)$/, '')];
  const notFlesh = MM.list().filter(id => !listed(id) && !DELVE[id] && !M.MINI_LIBRARY[id].fromPack && MM.material(id) !== 'flesh');
  ok('everything else is still flesh', notFlesh.length === 0, notFlesh.map(id => id + ':' + MM.material(id)).join());
  ok('the names both games use find the same material', MM.material('ironSentinel') === 'metal' &&
     MM.material('gelCube') === 'ooze' && MM.material('barrowLich') === 'bone');
  ok('a classic sculpt brought back keeps the figure\'s material', (() => {
    if (!M.MINI_CLASSIC['skeleton']) return true;
    const keep = M.MINI_LIBRARY['skeleton'];
    const r = MM.useClassic('skeleton'), mat = MM.material('skeleton');
    M.MINI_LIBRARY['skeleton'] = keep; M.miniClearCache();
    return r && mat === 'bone'; })());
}

console.log('\n[M11] 2.4.0: Hold the Line\'s poses');
{
  const ML = M.MINI_LIBRARY, MM = M.MitzMinis;
  // the library's own figures, not the ones earlier checks registered from packs
  const own = IDS.filter(id => ML[id]);
  const posed = own.filter(id => ML[id].poses && Object.keys(ML[id].poses).length);
  const count = posed.reduce((a, id) => a + Object.keys(ML[id].poses).length, 0);
  ok('the stamp is 2.4.0 or later', /^2\.([4-9]|\d\d)\.\d+$/.test(M.MITZ_MINIS_VERSION), M.MITZ_MINIS_VERSION);
  // 2.5.0 added eleven .f figures and five poses on the ranger, paladin and tinker; the rest is 2.4.0's
  const NEW25 = { 'ranger.m': ['strike'], 'paladin.m': ['strike', 'guard'], 'tinker.m': ['strike', 'cast'] };
  const posed24 = posed.filter(id => !/^(ranger|bard|cleric|rogue|barbarian|paladin|druid|monk|warlock|sorcerer|tinker)\.f$/.test(id));
  const count24 = posed24.reduce((a, id) => a + Object.keys(ML[id].poses).filter(p => !(NEW25[id] || []).includes(p)).length, 0);
  ok('103 poses on 80 figures, as handed over', posed24.length === 80 && count24 === 103, posed24.length + ' / ' + count24);
  // (the proxy, Hold the Line's stand-in for an unknown figure, has none either)
  ok('every figure leans back in hurt but the colossus, the horror and the proxy',
     own.filter(id => !(ML[id].poses && ML[id].poses.hurt)).sort().join() === 'colossus,horror,proxy',
     own.filter(id => !(ML[id].poses && ML[id].poses.hurt)).join());
  ok('every pose of every figure passes the checker', posed.every(id => M.miniCheck(id, ML[id]).length === 0),
     posed.filter(id => M.miniCheck(id, ML[id]).length).join());
  // the Delve's heroes, now that they are all drawn
  const want = { 'fighter.m': ['strike', 'guard'], 'fighter.f': ['strike', 'guard'], 'wizard.m': ['cast'], 'wizard.f': ['cast'],
                 'priest.m': ['cast'], 'priest.f': ['cast'], 'rogue.m': ['strike'], 'rogue.f': ['strike'] };
  ok('the Delve\'s heroes strike, guard and cast', Object.keys(want).every(id => want[id].every(p => MM.has(id, p))),
     Object.keys(want).map(id => id + ':' + MM.poses(id).join('/')).join(' '));
  ok('and the bosses do theirs', MM.has('goblin.chief', 'strike') && MM.has('lich', 'cast') && MM.has('shade', 'cast') && MM.has('dragon.red', 'breath'));
  ok('the stage asks for the poses they have', /var STAGE_POSES = \{[^}]*strike[^}]*\}/.test(src) && /hurt/.test(src.match(/var STAGE_POSES = \{[^}]*\}/)[0]));
  ok('a pose draws a different sprite from the figure as it stands', (() => {
    M.miniClearCache();
    const a = M.miniSprite('fighter.m', 72, {}), b = M.miniSprite('fighter.m', 72, { pose: 'strike' });
    return a && b && a !== b && b.pose === 'strike'; })());
  ok('a figure without that pose falls back to itself', (() => {
    const a = M.miniSprite('colossus', 72, {}), b = M.miniSprite('colossus', 72, { pose: 'hurt' });
    return a === b && b.pose === null; })());
  ok('a classic sculpt swapped back in has no poses of the shared figure\'s', (() => {
    const id = Object.keys(M.MINI_CLASSIC).filter(k => ML[k].poses)[0];
    return !!id && !(M.MINI_CLASSIC[id].poses && Object.keys(M.MINI_CLASSIC[id].poses).length); })());
  ok('three more of Hold the Line\'s names', M.miniId('giantCrab') === 'crab' && M.miniId('giantFrog') === 'frog' &&
     M.miniId('animatedArmour') === 'armour.animated');
}

console.log('\n[M12] 2.5.0: Hold the Line\'s female heroes, and poses by where the foe stands');
{
  const ML = M.MINI_LIBRARY, MM = M.MitzMinis;
  const own = IDS.filter(id => ML[id]);
  const posed = own.filter(id => ML[id].poses && Object.keys(ML[id].poses).length);
  const count = posed.reduce((a, id) => a + Object.keys(ML[id].poses).length, 0);
  const ELEVEN = ['barbarian', 'bard', 'cleric', 'druid', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'tinker', 'warlock'];
  ok('the stamp is 2.5.0 or later', /^2\.([5-9]|\d\d)\.\d+$/.test(M.MITZ_MINIS_VERSION), M.MITZ_MINIS_VERSION);
  ok('94 figures, 133 poses on 91 of them', own.length === 94 && posed.length === 91 && count === 133,
     own.length + ' / ' + count + ' on ' + posed.length);
  ok('eleven more heroines, every one a hero', ELEVEN.every(b => ML[b + '.f'] && ML[b + '.f'].faction === 'hero'),
     ELEVEN.filter(b => !ML[b + '.f']).join());
  ok('each the same size, base, top and material as her .m', ELEVEN.every(b => ['name', 'size', 'rx', 'top', 'material'].every(k => ML[b + '.f'][k] === ML[b + '.m'][k])),
     ELEVEN.filter(b => !['name', 'size', 'rx', 'top', 'material'].every(k => ML[b + '.f'][k] === ML[b + '.m'][k])).join());
  ok('and a figure of her own', ELEVEN.every(b => JSON.stringify(ML[b + '.f'].ops) !== JSON.stringify(ML[b + '.m'].ops)));
  ok('each has his poses, and hurt', ELEVEN.every(b => MM.has(b + '.f', 'hurt') && MM.poses(b + '.m').every(p => MM.has(b + '.f', p))),
     ELEVEN.map(b => b + '.f:' + MM.poses(b + '.f').join('/')).join(' '));
  ok('the plain id is the .m figure', ELEVEN.every(b => M.miniId(b) === b + '.m' && !ML[b]), ELEVEN.map(b => b + '>' + M.miniId(b)).join(' '));
  ok('so Hold the Line\'s names still find them', ['cleric', 'rogue', 'barbarian', 'ranger', 'bard'].every(M.miniKnown));
  ok('the ranger draws, the paladin strikes and guards, the tinker aims and builds',
     MM.has('ranger', 'strike') && MM.has('paladin', 'strike') && MM.has('paladin', 'guard') && MM.has('tinker', 'strike') && MM.has('tinker', 'cast'));
  ok('the Delve\'s own ranger and bard are kept as the classic .m', !!M.MINI_CLASSIC['ranger.m'] && !!M.MINI_CLASSIC['bard.m'] &&
     !M.MINI_CLASSIC['ranger'] && !M.MINI_CLASSIC['bard']);
  ok('and still come back on request', (() => { const keep = ML['ranger.m']; const r = MM.useClassic('ranger'); const back = ML['ranger.m'] === M.MINI_CLASSIC['ranger.m'];
     ML['ranger.m'] = keep; M.miniClearCache(); return r && back; })());
  ok('the brigand archer is still made from the Delve\'s ranger', ML['brigand.archer'] && ML['brigand.archer'].ops.length > ML['ranger.m'].ops.length - 1 &&
     M.miniCheck('brigand.archer', ML['brigand.archer']).length === 0);
  ok('a woman of any of their classes gets her figure', ELEVEN.every(b => M.miniForHero({ class: b, sex: 'female' }, { name: b }) === b + '.f'),
     ELEVEN.map(b => M.miniForHero({ class: b, sex: 'female' }, { name: b })).join());
  ok('and a man his', ELEVEN.every(b => M.miniForHero({ class: b, sex: 'male' }, { name: b }) === b + '.m'));
  const R = M.classes().rogue, wren = (P.testParties.filter(t => t.id === 'tp.rogue')[0] || { members: [] }).members.filter(m => m.name === 'Wren')[0];
  ok('the Rogue is rogue.m or rogue.f', R.minis.male === 'rogue.m' && R.minis.female === 'rogue.f' &&
     M.miniForHero({ class: 'rogue', sex: 'female' }, R) === 'rogue.f' && M.miniForHero({ class: 'rogue', sex: 'male' }, R) === 'rogue.m');
  ok('so Wren is drawn as a woman now', !!wren && M.miniForHero(wren, R) === 'rogue.f');
  // facing: a pose has the foe at +x whichever way the figure stands
  const flipsP = (id, want, pose) => draw(id, { want: want, pose: pose }).g.calls.some(c => c[0] === 'scale' && c[1] === -1);
  ok('a left-facing monster turns to face the party', flipsP('wolf', 'right'));
  ok('but its pose is not turned with it: hurt leans away from the party', !flipsP('wolf', 'right', 'hurt'));
  ok('the same for every left-facing figure with poses', own.filter(id => ML[id].face === 'left' && ML[id].poses).every(id =>
     Object.keys(ML[id].poses).every(p => !flipsP(id, 'right', p) && flipsP(id, 'left', p))));
  ok('a hero mid-move is mirrored toward the monsters on the left', flipsP('fighter.m', 'left', 'strike') && flipsP('rogue.f', 'left', 'hurt'));
  ok('the ranger too, though she stands facing left', !flipsP('ranger.m', 'left') && flipsP('ranger.m', 'left', 'strike'));
  ok('a monster mid-blow is not', !flipsP('goblin.chief', 'right', 'strike') && !flipsP('goblin', 'right', 'hurt'));
  ok('a pose the figure lacks draws it plain, turned the plain way', !flipsP('colossus', 'right', 'hurt') && flipsP('wolf', 'right', 'cast'));
}

console.log('\n' + (fail?'FAILED':'PASSED') + ' — '+pass+' passed, '+fail+' failed\n');
process.exit(fail?1:0);
