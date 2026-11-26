import assert from "node:assert/strict";
import fs from "node:fs";
import {gunzipSync} from "node:zlib";
import {setup,launch,step} from "../sim.mjs";
import {weapons,inventory,openShop} from "../match.mjs";
const read=name=>fs.readFileSync(new URL(name,import.meta.url));
const {instance}=await WebAssembly.instantiate(read("../engine/single-shot.wasm"));
const scene=JSON.parse(read("../range.json"));
assert.equal(weapons.length,320);
assert.equal(new Set(weapons.map(w=>w.name)).size,320);
assert.equal(new Set(weapons.map(w=>w.slot)).size,320);
assert.equal(new Set(weapons.slice(60).map(w=>w.pack)).size,28);
assert.equal(weapons.filter(w=>w.name==="Carpet Bomb").length,1);
assert.equal(inventory(setup(instance.exports,scene)).length,320);
const match=setup(instance.exports,{...scene,seed:3930},"match");
openShop(match);
assert.deepEqual(match.pool.map(i=>weapons[i].slot),[24,247,278,30,287,47,212,138,180,100,205,301,175,193,208,113,149,206,96,225]);
for(const r of JSON.parse(gunzipSync(read("./captures/expansion-shots.json.gz")))){
  const s=setup(instance.exports,r),events=[];
  s.selected[s.turn]=weapons.findIndex(w=>w.name===r.name);
  s.onTrigger=(...args)=>events.push([events.length?s.tick+1:-1,...args]);
  launch(s,360-r.events[0][4],r.events[0][5]);
  let t=0;while(s.inVolley&&t++<30000)step(s);
  assert(!s.inVolley,r.name);assert.equal(events.length,r.events.length,r.name);
  for(const [i,[tick,trigger,x,y,angle,power]] of r.events.entries()){
    const actual=events[i];
    assert.deepEqual(actual.slice(0,4),[tick,trigger.toLowerCase(),x,y],r.name+" trigger "+i);
    assert(Math.abs(actual[4]-angle)<1e-10&&Math.abs(actual[5]-power)<1e-10,r.name+" launch vector "+i);
  }
  let hash=2166136261;
  for(const v of s.solid)hash=Math.imul(hash^Number(!!v),16777619);
  assert.equal(hash>>>0,r.terrainHash,r.name+" final PC terrain");
}
const failures=[];
let count=0;
for(const [id,w] of weapons.entries()){
  if(!w.pack||id<Number(process.argv[2]??60)||id>=Number(process.argv[3]??320))continue;
  if(process.env.PT_VERBOSE)console.log("Firing",id,w.name);
  try{
    const s=setup(instance.exports,{...scene,seed:123456});
    s.selected[s.turn]=id;
    assert(launch(s,Number(process.env.PT_ANGLE??60),Number(process.env.PT_POWER??20)));
    let tick=0;
    while(s.inVolley&&tick++<30000)step(s);
    assert(!s.inVolley,"still active at tick "+tick+" "+JSON.stringify([s.balls.map(b=>b.actor),s.special.map(a=>a.actor.type),s.pending.length]).slice(0,300));
    assert(s.tanks.flat().every(Number.isFinite));
    count++;
  }catch(error){failures.push(w.name+": "+error.message)}
}
console.log(count+" expansion volleys completed");
assert.deepEqual(failures,[]);
