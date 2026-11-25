import fs from "node:fs";
import path from "node:path";
import {gzipSync} from "node:zlib";
import {createHash} from "node:crypto";
import {weapons} from "../../match.mjs";

const root=process.argv[2];
if(!root)throw Error("Pass the directory with the PC logic captures");
function read(filename){
  const bytes=fs.readFileSync(path.join(root,filename));
  return {...JSON.parse(bytes),source:filename,sha256:createHash("sha256").update(bytes).digest("hex")};
}
function fixture(r){
  return {source:r.source,sha256:r.sha256,terrain:r.terrain,materialCells:r.materialCells,
    tanks:r.tanks,turn:r.turn,seed:r.seed,entry:r.events[0][1].toLowerCase(),angle:360-r.events[0][4],power:r.events[0][5]};
}
const shots=fs.readdirSync(root).filter(f=>/^base-pending-|^cruise-ref-/.test(f)).map(read)
  .filter(r=>weapons.slice(39).some(w=>w.entry===r.events[0][1].toLowerCase())).map(r=>{
    const offset=r.frames[0][0];
    return {...fixture(r),flight:r.frames.map(q=>[q[0]-offset,...q.slice(7,11)]),
      blasts:r.bursts.map(q=>[q[0]-offset,q[2],q[3]]),track:r.cruise?.map(q=>q.slice(2,4))};
  });
const actors=[];
for(const dir of ["actor-lab","actor-replay","zap-hits"]){
  const folder=path.join(root,dir);
  if(!fs.existsSync(folder))continue;
  for(const file of fs.readdirSync(folder).filter(f=>f.endsWith(".json"))){
    const r=read(dir+"/"+file);
    if(!r.rows.length)continue;
    if(dir==="actor-replay"){
      if(![43,47,57].includes(parseInt(file)))continue;
      const base=shots.find(s=>s.entry===r.events[0][1].toLowerCase());
      r.turn=base.turn;
    }
    actors.push({...fixture(r),mask:r.terrainHash,rows:r.rows.map(q=>q.slice(0,q[1]===0x489290?6:4))});
  }
}
fs.writeFileSync(new URL("deluxe-actors.json.gz",import.meta.url),gzipSync(JSON.stringify({shots,actors}),{level:9}));
console.log(shots.length+" projectile traces, "+actors.length+" actor traces");
