import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {setup,launch,step} from "../sim.mjs";
import {weapons} from "../match.mjs";
import {drawWinner} from "../victory.mjs";

const file=name=>readFileSync(new URL(name,import.meta.url));
const {instance}=await WebAssembly.instantiate(file("../engine/single-shot.wasm"));
const {shots,actors,sequence}=JSON.parse(gunzipSync(file("./captures/deluxe-actors.json.gz")));
const engine=instance.exports;
const surfaces=new Map();
function fire(r){
  const s=setup(engine,r);
  if(surfaces.has(r.source))s.solid.set(surfaces.get(r.source));
  s.selected[s.turn]=weapons.findIndex(w=>w.entry===r.entry);
  assert(launch(s,r.angle,r.power));
  return s;
}
let previous;
for(const r of sequence){
  if(previous){
    const recorded=setup(engine,r).solid;
    assert(Buffer.from(previous).map(v=>Number(!!v)).equals(Buffer.from(recorded)),r.source+" starting occupancy");
    surfaces.set(r.source,previous);
  }
  const s=fire(r);
  for(let tick=0;s.inVolley&&tick<20000;tick++)step(s);
  assert(!s.inVolley);previous=s.solid.slice();
}
assert(surfaces.get("base-pending-25-Roller.json")[423*800+262]&32,"Glue Bomb coating survives to Roller");
let flight=0,blasts=0,track=0,actorRows=0;
for(const r of shots){
  const s=fire(r);let tick=0,b=0,h=0,g=0;
  s.onBlastStep=hit=>{
    const expected=r.blasts[h++];
    assert.deepEqual([tick,hit.x,hit.y],expected,r.source+" blast "+h);
  };
  while(s.inVolley&&tick<20000){
    const active=s.balls.slice();
    if(r.track&&s.special.length)assert.deepEqual([s.special[0].x,s.special[0].y],r.track[g++],r.source+" contour");
    step(s);
    for(const a of active)assert.deepEqual([tick,a.x,a.y,a.vx,a.vy],r.flight[b++],r.source+" flight");
    tick++;
  }
  assert(!s.inVolley);assert.equal(b,r.flight.length);assert.equal(h,r.blasts.length);
  if(r.track)assert.equal(g,r.track.length);
  flight+=b;blasts+=h;track+=g;
}
for(const r of actors){
  const s=fire(r);let i=0,tick=0;
  while(s.inVolley&&tick<20000){
    step(s);tick++;
    // Dirtballs update before the interpreter dispatches the current tick.
    // The other recorded actor pools update after it.
    while(i<r.rows.length){
      const [at,pc,x,y,...end]=r.rows[i];
      if(at!==tick+Number(pc===0x448260))break;
      const a=s.special.find(a=>a.actor.type===({[0x448260]:"dirtball",[0x444f60]:"cruiser",[0x44e1b0]:"fire",
        [0x472530]:"superball",[0x489290]:"zapper",[0x45f710]:"magicwall",[0x44a5e0]:"dirtslinger"})[pc]);
      assert(a,r.source+" missing actor at "+at);assert.deepEqual([a.x,a.y],[x,y],r.source+" at "+at);
      if(end.length)assert.deepEqual(a.end,end,r.source+" beam endpoint");
      i++;
    }
  }
  assert.equal(i,r.rows.length,r.source);actorRows+=i;
  let hash=2166136261;
  for(const cell of s.solid)hash=Math.imul(hash^Number(!!cell),16777619);
  assert.equal(hash>>>0,r.mask,r.source+" final terrain");
}
assert.equal(new Set(shots.map(r=>r.entry)).size,21);
console.log(shots.length+" shots, "+flight+" exact projectile ticks, "+track+" exact ground positions, "+blasts+" blast updates");
console.log(actors.length+" terrain hashes and "+actorRows+" original actor positions matched, including consecutive shots from Glue Bomb through Roller");

const scene=JSON.parse(file("../range.json"));
assert.equal(weapons.length,60);
for(const [id,w] of weapons.entries()){
  for(const [angle,power] of [[60,20],[83,65],[9,13],[33,95],[270,1]]){
    const s=fire({...scene,seed:123456,entry:w.entry,angle,power});
    let t=0;while(s.inVolley&&t++<18000)step(s);
    assert(!s.inVolley,w.name+" did not settle");assert(s.tanks.flat().every(Number.isFinite),w.name);
  }
}
const ref=[[146,214],[167,219],[174,220],[187,217],[200,211],[213,204],[224,201]];
const calls=[];
drawWinner({drawImage:(...args)=>calls.push(args.slice(5,7))},{},{tanks:[[187,271]],victory:{winner:0,phase:19}});
assert.deepEqual(calls,ref,"Seven letter positions from PC victory frame 1");
for(const scores of [[9,0],[0,9],[9,9]]){
  const s=setup(engine,scene,"match"),cues=new Set();s.scores=scores;s.finished=true;s.onSound=f=>cues.add(f);
  for(let i=0;i<1000;i++)step(s);
  assert.equal(s.victory.winner,scores[0]===scores[1]?-1:Number(scores[1]>scores[0]));
  assert.equal(cues.size,scores[0]===scores[1]?0:4);
  assert.equal(s.fx.particles.length>0,s.victory.winner>=0);
}
console.log("300 completed volleys, both winners, original glyph positions, four firework cues and tie");
