import assert from "node:assert/strict";
import fs from "node:fs";
import {setup,launch,step,DT,W} from "../sim.mjs";
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
function shoot(r){
  const s=setup(r.heights,r.positions),original=s.solid.slice(),arc=[];
  assert(launch(s,60,20));assert.equal(launch(s,60,20),false);
  for(let i=0;i<600 && !s.impact;i++){arc.push([s.ball.x,s.ball.y]);step(s)}
  assert(s.impact);const {x,y}=s.impact;
  const expected=new Set(r.removed.map(([a,b])=>b*W+a));let mismatches=0,removed=0;
  for(let j=0;j<original.length;j++){let lost=!!(original[j]&&!s.solid[j]);removed+=lost;mismatches+=lost!==expected.has(j)}
  while(s.impact)step(s);
  assert.equal(s.turn,1);assert.deepEqual(s.scores,[0,0]);assert(launch(s,120,20));
  return {x,y,arc,removed,mismatches};
}
const r=read("../reference.json"),a=shoot(r);assert.deepEqual([a.x,a.y],r.impact);
assert(a.mismatches<=5);
let errors=r.points.map(([x,y])=>{
  const n=a.arc.findIndex(p=>p[0]>=x),[u,v]=a.arc[n-1],[w,z]=a.arc[n];
  return Math.abs(v+(x-u)*(z-v)/(w-u)-y);
});
assert(Math.max(...errors)<1.1);
const b=shoot(read("./holdout.json"));assert(Math.hypot(b.x-222,b.y-208)<5);
console.log({impact:[a.x,a.y],flightSeconds:a.arc.length*DT,maximumPathError:Math.max(...errors),removed:a.removed,maskDisagreements:a.mismatches,holdout:[b.x,b.y]});
