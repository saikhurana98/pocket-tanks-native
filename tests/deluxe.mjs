import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {blastColor} from "../blast-art.mjs";
import {cutterStripes} from "../cutter.mjs";
import {deal,weapons} from "../match.mjs";
import {setup,launch,step} from "../sim.mjs";
const read=p=>readFileSync(new URL(p,import.meta.url));
const {instance}=await WebAssembly.instantiate(read("../engine/single-shot.wasm"));
// Shop records at 0x55e4b0, read in screen order after the original dealt from all installed packs.
assert.deepEqual(deal({engine:instance.exports,seed:3930},Array.from({length:320},(_,i)=>i)),
  [24,247,278,30,287,47,212,138,180,100,205,301,175,193,208,113,149,206,96,225]);
for(const trace of JSON.parse(gunzipSync(read("./captures/deluxe.json.gz")))){
  if(process.argv[2]&&!trace.file.includes(process.argv[2]))continue;
  const s=setup(instance.exports,trace);
  s.selected[s.turn]=weapons.findIndex(w=>w.entry===trace.trigger);
  if(trace.palettes){
    const blast=Object.values(weapons[s.selected[s.turn]].actors).find(a=>a.type==="blast");
    const base=trace.palettes[1][0];
    for(const [phase,indices] of Object.entries(trace.palettes)){
      for(const [radius,index] of indices.entries()){
        const color=blastColor(blast,Number(phase),radius);
        assert.equal(color<0?0:base-color,index,trace.file+" ring "+radius+" at phase "+phase);
      }
    }
  }
  assert(launch(s,360-trace.angle,trace.power));
  let frame=0,burst=0,tick=0;
  const markers=[];s.onMarker=m=>markers.push([tick,m.x,m.y]);
  const cuts=[];
  s.onCut=line=>{
    const [x,y,a,b]=line;let hash=2166136261;
    for(let j=Math.max(0,Math.min(y,b)-2);j<=Math.min(449,Math.max(y,b)+2);j++)
      for(let i=Math.max(0,Math.min(x,a)-2);i<=Math.min(799,Math.max(x,a)+2);i++)hash=Math.imul(hash^Number(Boolean(s.solid[j*800+i])),16777619);
    const sample=[tick,...line,hash>>>0];assert.deepEqual(sample,trace.cuts[cuts.length],trace.file+" cut "+cuts.length);cuts.push(sample);
  };
  s.onBlastStep=b=>{
    const r=b.actor.radius,cx=Math.trunc(b.x),cy=Math.trunc(b.y);
    let hash=2166136261;
    for(let y=Math.max(0,cy-r-2);y<=Math.min(449,cy+r+2);y++)
      for(let x=Math.max(0,cx-r-2);x<=Math.min(799,cx+r+2);x++)hash=Math.imul(hash^Number(Boolean(s.solid[y*800+x])),16777619);
    assert.deepEqual([tick,b.x,b.y,r,hash>>>0],trace.blasts[burst++],trace.file+" blast at "+tick);
  };
  for(;s.inVolley&&tick<10000;tick++){
    if(trace.jump&&tick<trace.jump.length){
      const [mode,x,y,vx,vy,slope]=trace.jump[tick],id=trace.turn;
      assert.deepEqual([s.airborne[id]?2:1,...s.tanks[id].slice(0,2)],[mode,x,y],trace.file+" jump at "+tick);
      if(mode===2)assert.deepEqual(s.airborne[id],[vx,vy]);
      assert(Math.abs(s.tanks[id][2]-slope)<1e-12,trace.file+" jump slope at "+tick);
    }
    if(trace.poses&&tick<trace.poses.length){
      const [originalTick,...poses]=trace.poses[tick];
      assert.equal(tick,originalTick);
      poses.forEach(([mode,x,y,slope,age],id)=>{
        assert.deepEqual([s.airborne[id]?2:1,...s.tanks[id].slice(0,2),s.groundAge[id]],
          [mode,x,y,age],trace.file+" tank "+id+" at "+tick);
        assert(Math.abs(s.tanks[id][2]-slope)<1e-12,trace.file+" tank slope at "+tick);
      });
    }
    const active=s.balls.slice();
    step(s);
    for(const cut of s.cutters){
      const expected=trace.paint?.[cut.depth];
      if(expected)assert.deepEqual(cutterStripes(cut),expected,trace.file+" cutter draw at depth "+cut.depth);
    }
    for(const b of active)assert.deepEqual([tick,b.x,b.y,b.vx,b.vy],trace.frames[frame++],trace.file+" projectile at "+tick);
  }
  if(trace.markers)assert.deepEqual(markers,trace.markers);
  if(trace.cuts)assert.equal(cuts.length,trace.cuts.length);
  if(trace.finalTerrain!==undefined){
    let hash=2166136261;
    for(const cell of s.solid)hash=Math.imul(hash^Number(Boolean(cell)),16777619);
    assert.equal(hash>>>0,trace.finalTerrain,trace.file+" settled terrain");
  }
  if(trace.jump)assert(tick>=trace.jump.length,trace.file+" ended before landing and settling");
  assert.equal(s.turn,1-trace.turn);
  assert.equal(frame,trace.frames.length);
  assert.equal(burst,trace.blasts.length);
  console.log(trace.file,frame+" projectile updates,",burst+" blast samples,",cuts.length+" terrain cuts,",(trace.jump?.length??0)+" jump poses");
}
