import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {setup,launch,step} from "../sim.mjs";
import {weapons,applyBlast,damageCenter,hitNumberLeft} from "../match.mjs";

const read=path=>readFileSync(new URL(path,import.meta.url));
const {instance}=await WebAssembly.instantiate(read("../engine/single-shot.wasm"));
const e=instance.exports;
const fixtures=JSON.parse(gunzipSync(read("./captures/match.json.gz")));
for(const [name,r] of Object.entries(fixtures)){
  const shot=setup(e,{tanks:r.tanks.map(t=>t.slice(0,5)),turn:r.turn,terrain:{runs:r.runs}},"match");
  const [release,impact]=r.events;
  const weapon=release[0]==="BigShotTrigger"?1:0;
  shot.selected[shot.turn]=weapon;
  shot.scores=r.before.slice();
  assert(launch(shot,360-release[3],release[4]));
  assert.deepEqual([e.x.value,e.y.value],release.slice(1,3),name+" muzzle");
  for(const [i,expected] of r.flight.entries()){
    assert(shot.ball,name+" early collision "+i);
    step(shot);
    assert.deepEqual([e.x.value,e.y.value,e.vx.value,e.vy.value],expected,name+" flight tick "+i);
  }
  assert(shot.impact,name+" missed collision on final projectile tick");
  assert.deepEqual([shot.impact.x,shot.impact.y],impact.slice(1,3));
  const originalHitTicks=[];
  const radius=weapons[weapon].radius,cx=Math.trunc(impact[1]),cy=Math.trunc(impact[2]);
  for(const [i,[front,hash]] of r.blast.entries()){
    assert(shot.impact,name+" early end of explosion");
    assert.equal(Math.min(shot.impact.phase,radius-1),front,name+" expanding front "+i);
    const struck=shot.impact.struck.slice();
    const current=shot.impact;
    step(shot);
    current.struck.forEach((value,id)=>{if(value&&!struck[id])originalHitTicks.push([i+1,id])});
    const thrown=r.air?.find(frame=>frame.tick===i+1);
    if(thrown){
      const id=r.hits[0].index;
      assert.deepEqual(shot.tanks[id].slice(0,2),thrown.post.slice(0,2),name+" thrown tank position "+i);
      if(thrown.state===2)assert.deepEqual(shot.airborne[id],thrown.post.slice(2),name+" thrown tank velocity "+i);
      else assert.equal(shot.airborne[id],null,name+" landed tank "+i);
    }
    let h=2166136261;
    for(let y=Math.max(0,cy-radius-2);y<=Math.min(449,cy+radius+2);y++)
      for(let x=Math.max(0,cx-radius-2);x<=Math.min(799,cx+radius+2);x++)h=Math.imul(h^shot.solid[y*800+x],16777619);
    assert.equal(h>>>0,hash,name+" crater tick "+i);
  }
  assert.deepEqual(originalHitTicks,r.hits.map(h=>[h.tick,h.index]),name+" hit timing");
  assert.deepEqual(shot.hitNumbers.map(label=>Number(label.text)),
    r.hits.map(h=>h.index===r.turn?-h.damage:h.damage),name+" signed hit labels");
  for(const h of r.hits){
    assert.equal(e.blastDamage(impact[1],impact[2],...h.center,h.phase,weapons[weapon].damage),h.damage,name+" damage");
  }
  const expected=r.endScores??r.hits.reduce((scores,h)=>{
    scores[r.turn]=Math.max(0,scores[r.turn]+(h.index===r.turn?-1:1)*h.damage);return scores;
  },r.before.slice());
  assert.deepEqual(shot.scores,expected,name+" scoreboard");
  console.log(name,r.flight.length+" flight ticks,",r.blast.length+" blast ticks,",shot.scores);
}

const film=JSON.parse(read("./captures/hit-numbers.json"));
const scene={tanks:[0,1].map(()=>[...film.tank,0,90,5]),turn:1,terrain:{runs:[800*450]}};
const state=setup(e,scene);
const [x,y]=damageCenter(state.tanks[0]);
const hit={x,y,struck:[false,false],actor:{radius:22,damage:60,knockback:false}};
applyBlast(state,hit,21);
applyBlast(state,hit,21);
assert.deepEqual(state.hitNumbers.map(label=>Number(label.text)),film.points);
let tick=0;
for(const [target,left,right,top] of film.frames){
  while(tick<target){step(state);tick++}
  if(top<=-20)continue;
  assert.deepEqual(state.hitNumbers.map(hitNumberLeft),[left,right],"floating hit x at tick "+tick);
  assert(state.hitNumbers.every(label=>Math.trunc(label.y)===top),"floating hit y at tick "+tick);
}
assert.equal(state.hitNumbers.length,0);
assert.deepEqual(state.scores,[0,0]);
hit.struck=[true,false];applyBlast(state,hit,21);
assert.equal(state.hitNumbers[0].text,"-60");
assert.equal(state.scores[1],0);
assert.equal(state.hitNumbers[0].phase,0);
console.log("Original paired hit paths, independent lifetime, repeated contact and zero-score self-hit");
