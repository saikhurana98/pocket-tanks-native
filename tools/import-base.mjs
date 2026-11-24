import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const installation=process.argv[2];
if(!installation)throw Error("Pass the Pocket Tanks Deluxe installation directory");
const project=fileURLToPath(new URL("../",import.meta.url));
function decode(file){
  const bytes=fs.readFileSync(path.join(installation,file));
  for(let i=0;i<bytes.length;i++)bytes[i]^=i%2?24:3;
  for(let i=0;i+16<=bytes.length;i+=16){
    for(const j of [0,1,5,6]){
      const a=i+j,b=a+8;
      [bytes[a],bytes[b]]=[bytes[b],bytes[a]];
    }
  }
  return bytes.toString("latin1");
}
function readPack(file){
  const text=decode(path.join("weapdata",file)).replace(/\/\/[^\n]*/g,"");
  const blocks=new Map(),roster=[];
  for(const [,type,name,body] of text.matchAll(/^\s*(\w+):[ \t]*([^\r\n]+?)\s*\{([^}]*)\}/gm)){
    const fields=[];
    for(const raw of body.split(/\r?\n/)){
      const line=raw.trim(),field=/^(\w+):\s*(.*)$/.exec(line);
      if(field)fields.push([field[1],field[2]]);
      else if(line&&fields.length)fields.at(-1)[1]+=" "+line;
    }
    if(type==="WEAPON")roster.push(name.trim());
    blocks.set(name.trim().toLowerCase(),{type,name:name.trim(),fields});
  }
  if(roster.length!==30)throw Error(file+" has "+roster.length+" weapons");
  return {blocks,roster};
}
const packs=["weaplist.wep","weaplist2.wep"].map(readPack);
const palette=decode("art.bbk").match(/<PALETTE number="11"[^>]*>([\s\S]*?)<\/PALETTE>/)[1].trim().split(/\s+/).map(Number);
const rgb=i=>palette.slice(i*3,i*3+3);
const supported=["Single Shot","Big Shot","3 Shot","5 Shot","Jackhammer","Pile Driver","Mountain Mover","Potholes","Crater Maker","Flash Blast","Laser Battery","Ground Hog","Worm","Late Bloomer","Fission Bomb","Sprinkler","Homing Missile","Tommy Gun","Minigun","Firecracker","Scatter Shot","Tracer","Super Tracer"];
supported.push("Homing Worm","Pineapple","Spider","Chain Reaction","Heatseeker");
const atlas={"Single Shot":"blast","Big Shot":"big-blast","3 Shot":"three-blast","5 Shot":"five-blast"};
const sounds=new Set(["cannon.wav","expmedium2.wav","expmedium.wav"]);
function compile(pack,name){
  const actors={},triggers={};
  function visit(id){
    const key=id.toLowerCase();
    if(actors[key]||triggers[key])return key;
    const block=pack.blocks.get(key);
    if(!block)throw Error("Missing "+id);
    const f=Object.fromEntries(block.fields);
    if(block.type==="TRIGGER"){
      const steps=triggers[key]=[];
      for(const [k,v] of block.fields){
        if(k==="TIMEDELAY")steps.push({delay:Number(v)});
        else if(k==="COMMAND")steps.at(-1).actor=visit(v);
        else if(k==="SOUND_EFFECT"&&v!=="NONE"){steps.at(-1).sound=v;sounds.add(v)}
        else if(["XOFFSET","YOFFSET","ANGLE","POWER"].includes(k)&&v!=="NONE")steps.at(-1)[k.toLowerCase()]=v;
      }
    }else if(block.type==="BULLET"){
      if(!["DOWN","UP","NONE","OFF"].includes(f.GRAVITY_MODE)||!["HIT_AIR","HIT_TERRAIN"].includes(f.COLLISION_METHOD))throw Error(id);
      actors[key]={type:"bullet",trail:rgb(+f.DRAW_COLOR),trailLength:f.DRAW_METHOD==="BULLET_NONE"?0:+f.TRAIL_LENGTH,
        gravity:({DOWN:1,UP:-1})[f.GRAVITY_MODE]??0,hitAir:f.COLLISION_METHOD==="HIT_AIR",outside:f.COLLISION_LOCATION==="COLLIDE_OUTSIDE",
        size:+f.DRAW_SIZE,pixel:f.DRAW_METHOD==="BULLET_PIXEL",onImpact:visit(f.EXPLOSION_TRIGGER)};
      if(f.DRAW_ANIM&&f.DRAW_ANIM!=="NONE"){
        actors[key].animation={frames:f.DRAW_ANIM.split(/\s+/).filter(x=>x!=="DONE"),speed:+f.DRAW_ANIM_SPEED,rotate:f.DRAW_ANIM_ROTATE==="TRUE",offsetX:Number(f.DRAW_ANIM_XOFFSET??0),offsetY:Number(f.DRAW_ANIM_YOFFSET??0)};
      }
      if(f.TIMED_DETONATION_FLAG==="TRUE"){
        actors[key].time=Number(f.TIMED_DETONATION_TIME);actors[key].onTimer=visit(f.TIMED_DETONATION_TRIGGER);
      }
      if(f.DROPRISE_FLAG==="TRUE"){
        actors[key].dropSound=f.DROPRISE_SOUND_EFFECT;sounds.add(f.DROPRISE_SOUND_EFFECT);
      }
      if(f.PROXIMITY_FLAG==="TRUE"){
        actors[key].distance=Number(f.PROXIMITY_DISTANCE);actors[key].onApproach=visit(f.PROXIMITY_TRIGGER);
      }
      if(f.HOMING_FLAG==="TRUE"){
        actors[key].homingRange=Number(f.HOMING_DISTANCE);actors[key].homingMagnitude=Number(f.HOMING_MAGNITUDE);
      }
    }else if(block.type==="EXPLOSION"){
      if(f.DRAW_DIRECTION!=="EXPLOSION_OUT"||f.DOUBLE_UP_FLAG!=="TRUE")throw Error(id);
      const colors=Array.from({length:+f.DRAW_COLOR_LENGTH},(_,i)=>rgb(+f.DRAW_COLOR+i*Number(f.DRAW_COLOR_DIRECTION)));
      actors[key]={type:"blast",radius:+f.RADIUS,damage:+f.DAMAGE,erase:f.ERASE_TERRAIN_FLAG==="TRUE",
        dirt:f.DIRTFALL_FLAG==="TRUE",knockback:f.THROW_TANK_FLAG==="TRUE",eraseDelay:+f.ERASE_DELAY,
        inward:f.ERASE_DIRECTION==="EXPLOSION_IN",colors};
      if(atlas[name])actors[key].atlas=atlas[name];
    }else if(block.type==="TRACER"){
      actors[key]={type:"marker",label:f.TEXT,seconds:Number(f.DISPLAY_TIME)};
    }else throw Error("Unsupported actor "+block.type);
    if(actors[key]&&f.SOUND_EFFECT&&f.SOUND_EFFECT!=="NONE"){actors[key].sound=f.SOUND_EFFECT;sounds.add(f.SOUND_EFFECT)}
    return key;
  }
  const source=Object.fromEntries(pack.blocks.get(name.toLowerCase()).fields);
  return {name,slot:packs.indexOf(pack)*30+pack.roster.indexOf(name),entry:visit(source.TRIGGER),actors,triggers};
}
const weapons=supported.map(name=>compile(packs.find(p=>p.roster.includes(name)),name));
fs.writeFileSync(path.join(project,"engine","weapons.json"),JSON.stringify(weapons)+"\n");
for(const sound of sounds)fs.copyFileSync(path.join(installation,"weapdata",sound),path.join(project,"audio",sound));
console.log("Read "+packs.map(p=>p.roster.length).join(" + ")+" base weapons. Compiled "+weapons.length+" playable weapon programs.");
