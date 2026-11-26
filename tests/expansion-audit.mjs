import assert from "node:assert/strict";
import fs from "node:fs";
import {gunzipSync} from "node:zlib";
import {setup,launch,step} from "../sim.mjs";
import {weapons} from "../match.mjs";

const read=name=>fs.readFileSync(new URL(name,import.meta.url));
const {instance}=await WebAssembly.instantiate(read("../engine/single-shot.wasm"));
const range=JSON.parse(read("../range.json"));
const records=JSON.parse(gunzipSync(read("./captures/expansion-audit.json.gz")));
assert.deepEqual(records.map(r=>r.name),weapons.slice(60).map(w=>w.name));
let triggerMatches=0,soundMatches=0;
const failures=[];
for(const record of records){
  const {id,name,tanks,seed,turn}=record;
  const s=setup(instance.exports,{...range,tanks,seed,turn}),events=[],sounds=[];
  s.selected[turn]=id;
  s.onTrigger=(...args)=>events.push([events.length?s.tick+1:-1,...args]);
  s.onSound=file=>sounds.push([s.tick+1,file]);
  assert(launch(s,360-tanks[turn][3],tanks[turn][4]),name);
  for(let i=0;s.inVolley&&i<30000;i++)step(s);
  assert(!s.inVolley,name+" did not finish");
  // The PC dispatches NONE to its empty-trigger handler.
  const expected=record.events.filter(row=>row[1].toLowerCase()!=="none");
  const sameEvents=expected.length===events.length&&expected.every(([tick,key,...args],i)=>{
    const actual=events[i];
    return tick===actual[0]&&key.toLowerCase()===actual[1]&&args.every((v,j)=>Math.abs(v-actual[j+2])<1e-7);
  });
  const sameSounds=record.sounds.length===sounds.length&&record.sounds.every(([tick,file],i)=>tick===sounds[i][0]&&file===sounds[i][1]);
  if(sameEvents)triggerMatches++;
  if(sameSounds)soundMatches++;
  if(!sameEvents&&(record.checkEvents||process.argv.includes("--strict")))failures.push(name+" trigger sequence");
  if(!sameSounds&&(record.checkSounds||process.argv.includes("--strict")))failures.push(name+" sound sequence");
}
console.log(records.length+" original PC shots, "+triggerMatches+" matching trigger sequences, "+soundMatches+" matching sound sequences");
assert.deepEqual(failures,[]);

