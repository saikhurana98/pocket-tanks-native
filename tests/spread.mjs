import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {setup,launch,step} from "../sim.mjs";
import {weapons} from "../match.mjs";

const read=p=>readFileSync(new URL(p,import.meta.url));
const {instance}=await WebAssembly.instantiate(read("../engine/single-shot.wasm"));
for(const r of JSON.parse(gunzipSync(read("./captures/spread.json.gz")))){
  const s=setup(instance.exports,r),index=r.name==="3ShotTrigger"?2:3,radius=weapons[index].radius;
  s.selected[s.turn]=index;
  assert(launch(s,360-r.angle,r.power));
  const balls=s.balls.slice(),contacts=[];
  let tick=0,flight=0,blast=0;
  s.onBlastStep=b=>{
    const [expectedTick,x,y,front,hash]=r.blasts[blast++];
    assert.deepEqual([tick,b.x,b.y],[expectedTick,x,y],r.name+" blast order and origin");
    const cx=Math.trunc(x),cy=Math.trunc(y);let h=2166136261;
    for(let j=Math.max(0,cy-radius-2);j<=Math.min(449,cy+radius+2);j++){
      for(let i=Math.max(0,cx-radius-2);i<=Math.min(799,cx+radius+2);i++)h=Math.imul(h^s.solid[j*800+i],16777619);
    }
    assert.equal(h>>>0,hash,r.name+" shared terrain after blast update at tick "+tick+" front "+front);
  };
  for(;tick<=r.blasts.at(-1)[0];tick++){
    const active=s.blasts.slice();
    step(s);
    for(const b of s.blasts)if(!active.includes(b))contacts.push([tick,b.x,b.y]);
    while(r.frames[flight]?.[0]===tick){
      const [,id,...fields]=r.frames[flight++],b=balls[id];
      assert.deepEqual([b.x,b.y,b.vx,b.vy],fields,r.name+" flight tick "+tick+" projectile "+id);
    }
  }
  assert.equal(flight,r.frames.length);
  assert.equal(blast,r.blasts.length);
  assert.deepEqual(contacts,r.impacts);
  for(let i=0;s.inVolley&&i<2500;i++)step(s);
  assert.equal(s.inVolley,false);
  assert.equal(s.turn,1-r.turn);
  console.log(r.name,balls.length+" projectiles,",flight+" exact projectile updates,",blast+" matching crater hashes");
}
