import {readFileSync,writeFileSync} from "node:fs";
import {basename} from "node:path";
import {gzipSync} from "node:zlib";
import {createHash} from "node:crypto";
const [, ,output,...inputs]=process.argv;
if(!output||!inputs.length)throw Error("Pass an output path and one or more original trace files");
const fixtures=inputs.map(file=>{
  const bytes=readFileSync(file),r=JSON.parse(bytes);
  const start=r.frames[0][0];
  const record={file:basename(file),sha256:createHash("sha256").update(bytes).digest("hex"),
    seed:r.seed,trigger:r.events[0][1].toLowerCase(),tanks:r.tanks,turn:r.turn,terrain:r.terrain,angle:r.events[0][4],power:r.events[0][5],
    frames:r.frames.map(f=>[f[0]-start,...f.slice(7,11)]),blasts:r.bursts.map(b=>[b[0]-start,b[2],b[3],b[5],b[7]])};
  if(/^(Super)?TracerTrigger$/i.test(r.events[0][1]))record.markers=r.events.slice(1).map(e=>[e[0]-start,e[2],e[3]]);
  if(file.includes("color-"))record.palettes=r.palettes;
  return record;
});
writeFileSync(output,gzipSync(JSON.stringify(fixtures),{level:9}));
