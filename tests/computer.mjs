import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {setup,step} from "../sim.mjs";
import {advanceComputer,computerPlayer,computerRoll} from "../computer.mjs";
import {openShop,pickWeapon,weapons} from "../match.mjs";

const read=file=>readFileSync(new URL(file,import.meta.url));
const {instance}=await WebAssembly.instantiate(read("../engine/single-shot.wasm"));
const range=JSON.parse(read("../match-range.json"));
const seed=1,originalRandom=computerPlayer(5,seed);
assert.deepEqual(Array.from({length:4},()=>computerRoll(originalRandom,32768)),[41,18467,6334,26500]);
const match=setup(instance.exports,{...range,seed},"match");
match.computer=computerPlayer(5,seed);
openShop(match);
// PC level 5 draft captured using REA. Both columns are in top-to-bottom order.
const originalDeal=["Scrambler","Drillers","Crazy Ivan","Stinger","Badger","Liquid Nitrogen","Drillers","Boomerang","Fire Wall","Tracer",
  "Saucer Attack","Rainbow Dirt","Cluster Bombs","Comet","Snowballs","Great Wall","Power Grid","Zipper","Stinger","Laser Grenade"];
match.pool=originalDeal.map(name=>weapons.findIndex(w=>w.name===name));
assert(match.pool.every(id=>id>=0));
pickWeapon(match,0);
for(let tick=0;tick<250;tick++)advanceComputer(match);
assert.deepEqual(match.draft.map(hand=>hand.map(id=>weapons[id].name)),[["Scrambler"],["Power Grid"]]);

function shot(level,name,seed,scene=range){
  const id=weapons.findIndex(w=>w.name===name);
  const s=setup(instance.exports,{...scene,seed,turn:1},"match");
  s.selected[1]=id;s.computer=computerPlayer(level,seed);
  for(let tick=0;!s.inVolley&&tick<3000;tick++){advanceComputer(s);if(s.move)step(s)}
  assert.equal(s.shots,1);assert.equal(s.ammo[1][s.weapon],1);
  return s.tanks[1].slice(3,5);
}
// REA sampled the PC random seed, collision mask and tank poses at 0x442de0,
// all 400 candidate pairs at 0x442e90, and the final trigger at 0x486370.
const pc=JSON.parse(read("./captures/cpu-5.json")),stream=computerPlayer(5,pc.seed);
assert.equal(pc.limit,122);
assert.deepEqual(Array.from({length:400},()=>[225+computerRoll(stream,90),40+computerRoll(stream,60)]),pc.candidates);
const weapon=weapons.find(w=>w.entry===pc.release[0].toLowerCase());
assert.deepEqual(shot(5,weapon.name,pc.seed,pc),pc.release.slice(1));
for(const name of ["Single Shot","Railgun"]){
  const easy=shot(1,name,12345),hard=shot(10,name,12345);
  assert.deepEqual(shot(10,name,12345),hard);
  assert(easy.concat(hard).every(Number.isFinite));
  if(name==="Single Shot")assert.notDeepEqual(easy,hard);
  console.log(name,"level 1",easy,"level 10",hard);
}
console.log("PASS original CPU draft pick, 400 PC trials and Super Zapper release at direction 262 and power 97.");
