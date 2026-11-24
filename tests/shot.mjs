import assert from "node:assert/strict";
import fs from "node:fs";
import {gunzipSync} from "node:zlib";
const fixture = JSON.parse(gunzipSync(fs.readFileSync(new URL("./captures/single-shot.json.gz",import.meta.url))));
const bytes = fs.readFileSync(new URL("../engine/single-shot.wasm",import.meta.url));
const {instance} = await WebAssembly.instantiate(bytes);
const engine = instance.exports, board = new Uint8Array(engine.memory.buffer);
const fields = ["x","y","vx","vy"];
let flightTicks=0, blastTicks=0, poseCount=0, maxFlightError=0, maxEventError=0;
assert(Object.keys(fixture).length >= 15, "Missing captured shots");
for(const [name, shot] of Object.entries(fixture)) {
  const [release, impact] = shot.events;
  assert.equal(release[0],"SingleShotTrigger");
  assert.equal(impact[0],"SingleShotExplosionTrigger");
  assert.equal(impact[1],shot.flight.length);
  let offset=0;
  for(const [i,length] of shot.terrain.runs.entries()) {
    board.fill(i%2,offset,offset+length);
    offset+=length;
  }
  assert.equal(offset,800*450);
  if (shot.pose) {
    const [x,y,slope,angle,power,coupled] = shot.pose;
    assert.equal(coupled,0);assert.equal(angle,release[4]);assert.equal(power,release[5]);
    assert.equal(engine.muzzleX(x,slope,angle),release[2],name+" muzzle X");
    assert.equal(engine.muzzleY(y,slope,angle),release[3],name+" muzzle Y");poseCount++;
  }
  engine.launch(...release.slice(2));
  function checkState(expected,tick) {
    for(const [k,field] of fields.entries()){
      const error=Math.abs(engine[field].value-expected[k]);maxFlightError=Math.max(maxFlightError,error);
      assert(error<=1e-10,`${name} tick ${tick} ${field}: ${error}`);
    }
  }
  for(const [i,[before,after]] of shot.flight.entries()){
    checkState(before,i);
    assert.equal(engine.step(shot.dt,shot.wind),i===shot.flight.length-1?1:0,name+" impact tick "+i);
    checkState(after,i);flightTicks++;
  }
  checkState([impact[2],impact[3],...shot.flight.at(-1)[1].slice(2)],"trigger");
  const eventError=Math.max(Math.abs(engine.impactAngle()-impact[4]),Math.abs(engine.impactPower()-impact[5]));
  maxEventError=Math.max(maxEventError,eventError);assert(eventError<1e-10,name+" trigger angle/power");
  if(shot.blast){
    assert.equal(shot.blast.length,166,name+" incomplete blast");
    engine.beginBlast();const expected=shot.blast[0].initial.slice();
    for(const [i,f] of shot.blast.entries()){
      engine.blastStep(f.dt);
      for(const k of f.changed) expected[k]^=1;
      for(let k=0;k<49*49;k++){
        const x=Math.trunc(f.center[0])-24+k%49,y=Math.trunc(f.center[1])-24+Math.floor(k/49);
        const actual=x<0||y<0||x>=800||y>=450?0:board[y*800+x];
        assert.equal(actual,expected[k],`${name} blast tick ${i} cell ${x},${y}`);
      }
      blastTicks++;
    }
  }
  console.log(name,release.slice(4),"flight",shot.flight.length,"blast",shot.blast?.length||0);
}
assert(flightTicks>=4623 && blastTicks>=1826 && poseCount>=6,"Missing original tick coverage");
console.log({shots:Object.keys(fixture).length,flightTicks,blastTicks,poseCount,maxFlightError,maxEventError});
