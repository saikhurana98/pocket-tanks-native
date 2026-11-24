import {readFileSync,writeFileSync} from "node:fs";
import {basename} from "node:path";
import {gzipSync} from "node:zlib";
import {createHash} from "node:crypto";
const [, ,output,...inputs]=process.argv;
if(!output||!inputs.length)throw Error("Pass an output path and one or more original trace files");
const fixtures=inputs.map(file=>{
  const bytes=readFileSync(file),r=JSON.parse(bytes);
  const start=r.frames[0]?.[0]??r.jets?.[0][0]??r.earth[0][0];
  const record={file:basename(file),sha256:createHash("sha256").update(bytes).digest("hex"),
    seed:r.seed,trigger:r.events[0][1].toLowerCase(),tanks:r.tanks,turn:r.turn,terrain:r.terrain,angle:r.events[0][4],power:r.events[0][5],
    frames:r.frames.map(f=>[f[0]-start,...f.slice(7,11)]),blasts:r.bursts.map(b=>[b[0]-start,b[2],b[3],b[5],b[7]])};
  if(/^(Super)?TracerTrigger$/i.test(r.events[0][1]))record.markers=r.events.slice(1).map(e=>[e[0]-start,e[2],e[3]]);
  if(file.includes("color-"))record.palettes=r.palettes;
  if(r.poses)record.poses=r.poses.map(([tick,...poses])=>[tick-start,...poses]);
  if(r.earthLines)record.cuts=r.earthLines.map(([tick,...sample])=>[tick-start,...sample]);
  if(r.finalTerrain!==undefined)record.finalTerrain=r.finalTerrain;
  if(r.materialCells?.length)record.materialCells=r.materialCells;
  if(r.fragments){
    record.shrapnel=r.fragments.map(([tick,x,y,age])=>[tick-start,x,y,age]);
    record.hits=(r.hits??[]).map(([tick,id,points])=>[tick-start,id,points]);
  }
  if(r.paintSamples)record.pixelBlends=r.paintSamples.map(([x,y,...rgba])=>rgba);
  if(r.particles?.length){
    // Undo the first CRT rand() advance to initialize the independent graphics stream.
    record.fxSeed=Math.imul(r.particleRandom[0][3]-2531011,0xb9b33155)>>>0;
    record.particles=r.particles.map(([tick,pool,x,y,vx,vy,r,g,b,alpha])=>[tick-start,x,y,vx,vy,r,g,b,alpha]);
    record.pool=r.particlePool.filter(row=>row[0]>=start).map(([tick,counter,period,clock,gravity,collision,head,...particle])=>
      [tick-start,counter,clock,...(head<0?[]:particle)]);
  }
  if(r.paint)record.paint=Object.fromEntries(r.paint.map(([depth,lines])=>[depth,lines.map(line=>line.map((v,i)=>i<4?v:v&255))]));
  if(r.jets){
    record.jump=r.jetPoses.filter(row=>row[0]>=start).map(row=>row[1+r.turn]);
    // Keep every airborne and settling tick, plus the first stationary grounded pose.
    const last=record.jump.findLastIndex((p,i)=>i>0&&p.some((v,k)=>v!==record.jump[i-1][k]));
    record.jump=record.jump.slice(0,last+2);
  }
  return record;
});
writeFileSync(output,gzipSync(JSON.stringify(fixtures),{level:9}));
