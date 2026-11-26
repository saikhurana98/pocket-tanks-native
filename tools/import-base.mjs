import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {compileScript} from "./pack-script.mjs";

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
      const line=raw.trim().replaceAll("\\","/"),field=/^(\w+):\s*(.*)$/.exec(line);
      if(field)fields.push([field[1],field[2]]);
      else if(/^(IF|ELSE|ENDIF|LOOP|ENDLOOP)\b/.test(line))fields.push(["FLOW",line]);
      else if(line&&fields.length)fields.at(-1)[1]+=" "+line;
    }
    if(type==="WEAPON")roster.push(name.trim());
    blocks.set(name.trim().toLowerCase(),{type,name:name.trim(),fields});
  }
  const [label,count]=text.trimStart().split(/\r?\n/),unique=[...new Set(roster)];
  if(unique.length!==Number(count))throw Error(file+" declares "+count+" weapons but contains "+unique.length);
  return {blocks,roster:unique,file,label:label.trim()};
}
const folder=path.join(installation,"weapdata");
const index=file=>Number(file.match(/\d+/)?.[0]??1);
const packFiles=fs.readdirSync(folder).filter(f=>/^weaplist_?\d*\.wea?p$/i.test(f)).sort((a,b)=>index(a)-index(b));
const packs=packFiles.map(readPack);
let slot=0;
for(const pack of packs){pack.start=slot;slot+=pack.roster.length}
const palette=decode("art.bbk").match(/<PALETTE number="11"[^>]*>([\s\S]*?)<\/PALETTE>/)[1].trim().split(/\s+/).map(Number);
const rgb=i=>{const offset=(i&255)*3;return palette.slice(offset,offset+3)};
const supported=["Single Shot","Big Shot","3 Shot","5 Shot","Jackhammer","Pile Driver","Mountain Mover","Potholes","Crater Maker","Flash Blast","Laser Battery","Ground Hog","Worm","Late Bloomer","Fission Bomb","Sprinkler","Homing Missile","Tommy Gun","Minigun","Firecracker","Scatter Shot","Tracer","Super Tracer"];
supported.push("Homing Worm","Pineapple","Spider","Chain Reaction","Heatseeker","Crazy Ivan","Jump Jets");
supported.push("Dirt Mover","Digger","Well Digger");
supported.push("Skipper","Super Skipper");
supported.push("Sniper Rifle","Laser");
supported.push("Popcorn","Color Bomb");
for(const {roster} of packs)for(const name of roster)if(!supported.includes(name))supported.push(name);
const atlas={"Single Shot":"blast","Big Shot":"big-blast","3 Shot":"three-blast","5 Shot":"five-blast"};
const sounds=new Set(["cannon.wav","expmedium2.wav","expmedium.wav"]);
const soundName=name=>{
  const file=name.toLowerCase();
  if(!fs.existsSync(path.join(folder,file))){console.warn("Missing original sound "+file);return undefined}
  sounds.add(file);return file;
};
const emitters=new Map();
for(const file of fs.readdirSync(folder).filter(f=>/^emitter_?\d*\.emit?$/i.test(f))){
  const text=decode(path.join("weapdata",file));
  emitters.set(index(file),new Map(Array.from(text.matchAll(/<EMITTER\s+name="([^"]+)">([\s\S]*?)<\/EMITTER>/gi),m=>[m[1].toLowerCase(),m[2]])));
}
function radialEmitter(pack,id,seconds){
  if(!id||id.toUpperCase()==="NONE")return undefined;
  const key=id.toLowerCase();
  const emitter=emitters.get(index(pack.file))?.get(key)??[...emitters.values()].find(entries=>entries.has(key))?.get(key);
  if(!emitter){console.warn(pack.file+": no emitter definition for "+id);return undefined}
  const nodes=Array.from(emitter.matchAll(/<NODE\s+([\s\S]*?)\/>/gi),m=>{
    const f=Object.fromEntries(Array.from(m[1].matchAll(/(\w+)="([^"]*)"/g),a=>a.slice(1)));
    const node=[+f.particlesPerSecond,+f.particleLowSpeed_PPS,+f.particleHighSpeed_PPS,
      +f.spraySpread/180*3.1415927,[+f.r,+f.g,+f.b]];
    if(+f.pivitParent!==-1||+f.pivitDistance||+f.pivitRotationSpeed_DPS||+f.sprayAngle||+f.sprayRotationSpeed_DPS||+f.a!==255)
      node.push({parent:+f.pivitParent,distance:+f.pivitDistance,pivot:+f.pivitAngle,spin:+f.pivitRotationSpeed_DPS,
        angle:+f.sprayAngle,rotation:+f.sprayRotationSpeed_DPS,alpha:+f.a});
    return node;
  });
  if(!nodes.length)throw Error("Empty emitter "+id);
  return {seconds,nodes};
}
function compile(pack,name){
  const actors={},triggers={};
  const expansion=pack.start>=60;
  function visit(id){
    const key=id.toLowerCase();
    if(key==="none")return null;
    if(actors[key]||triggers[key])return key;
    const block=pack.blocks.get(key)??packs.find(p=>p.blocks.has(key))?.blocks.get(key);
    if(!block){
      if(expansion){console.warn(pack.file+": no definition for "+id);return null}
      throw Error("Missing "+id);
    }
    const f=Object.fromEntries(block.fields);
    if(block.type==="TRIGGER"){
      const steps=triggers[key]=[];
      if(expansion){steps.push(...compileScript(block.fields,visit,soundName));return key}
      for(const [k,v] of block.fields){
        if(k==="TIMEDELAY")steps.push({delay:Number(v)});
        else if(k==="COMMAND")steps.at(-1).actor=visit(v);
        else if(k==="SOUND_EFFECT"&&v!=="NONE"){steps.at(-1).sound=v;sounds.add(v)}
        else if(["XOFFSET","YOFFSET","ANGLE","POWER"].includes(k)&&v!=="NONE")steps.at(-1)[k.toLowerCase()]=v;
      }
    }else if(block.type==="BULLET"){
      const bullet=actors[key]={type:"bullet",trail:rgb(+f.DRAW_COLOR),trailLength:/BULLET_(NONE|NOTHING)/i.test(f.DRAW_METHOD)?0:+f.TRAIL_LENGTH,
        gravity:({DOWN:1,UP:-1})[f.GRAVITY_MODE]??0,hitAir:f.COLLISION_METHOD==="HIT_AIR",outside:f.COLLISION_LOCATION==="COLLIDE_OUTSIDE",
        size:+f.DRAW_SIZE,pixel:f.DRAW_METHOD==="BULLET_PIXEL"};
      bullet.onImpact=visit(f.EXPLOSION_TRIGGER??"NONE");
      if(expansion){
        if(f.COLLISION_METHOD==="HIT_NOTHING")bullet.passTerrain=true;
        if(f.BYPASS_TANK_FLAG==="TRUE")bullet.passTank=true;
        if(f.BYPASS_BOUNCYDIRT_FLAG==="TRUE")bullet.passRubber=true;
        if(f.REPEAT_TRIGGER_FLAG==="TRUE"){bullet.repeat=visit(f.REPEAT_TRIGGER);bullet.repeatTime=+f.REPEAT_TRIGGER_TIME}
        if(f.VERTICAL_VELOCITY_FLAG==="TRUE"){bullet.velocityTrigger=visit(f.VERTICAL_VELOCITY_TRIGGER);bullet.vertical=+f.VERTICAL_VELOCITY_MAGNITUDE}
        if(f.DROPRISE_DETONATION_FLAG==="TRUE")bullet.dropTrigger=visit(f.DROPRISE_DETONATION_TRIGGER);
        if(f.DRAG)bullet.drag=+f.DRAG;
        if(f.BULLET_PLASMA_FLAG==="TRUE"){
          const frames=f.BULLET_PLASMA_ANIM.split(/\s+/).filter(n=>n!=="DONE");
          bullet.plasma={frames,speed:Number(f.BULLET_PLASMA_ANIM_SPEED??1),offsetX:0,offsetY:0,
            blend:f.BULLET_PLASMA_MODE==="FOG"?"FOG":"TRANS"};
        }
      }
      if(f.DRAW_ANIM&&f.DRAW_ANIM!=="NONE"){
        actors[key].animation={frames:f.DRAW_ANIM.split(/\s+/).filter(x=>x!=="DONE"),speed:+f.DRAW_ANIM_SPEED,rotate:f.DRAW_ANIM_ROTATE==="TRUE",offsetX:Number(f.DRAW_ANIM_XOFFSET??0),offsetY:Number(f.DRAW_ANIM_YOFFSET??0)};
      }
      if(f.BULLET_EMITTER_NAME&&f.BULLET_EMITTER_NAME!=="NONE")actors[key].flightEmitter=radialEmitter(pack,f.BULLET_EMITTER_NAME,.004);
      if(f.TIMED_DETONATION_FLAG==="TRUE"){
        actors[key].time=Number(f.TIMED_DETONATION_TIME);actors[key].onTimer=visit(f.TIMED_DETONATION_TRIGGER);
      }
      if(f.DROPRISE_FLAG==="TRUE"){
        actors[key].dropSound=f.DROPRISE_SOUND_EFFECT&&f.DROPRISE_SOUND_EFFECT!=="NONE"?soundName(f.DROPRISE_SOUND_EFFECT):"";
        if(!actors[key].dropSound)actors[key].drop=true;
      }
      if(f.PROXIMITY_FLAG==="TRUE"){
        actors[key].distance=Number(f.PROXIMITY_DISTANCE);actors[key].onApproach=visit(f.PROXIMITY_TRIGGER);
      }
      if(f.HOMING_FLAG==="TRUE"){
        actors[key].homingRange=Number(f.HOMING_DISTANCE);actors[key].homingMagnitude=Number(f.HOMING_MAGNITUDE);
      }
      if(Number(f.BOUNCE_COUNT)>0){
        actors[key].bounces=Number(f.BOUNCE_COUNT);
        actors[key].bounceImpulse=Number(f.BOUNCE_IMPULSE);
        if(f.BOUNCE_SOUND_EFFECT&&f.BOUNCE_SOUND_EFFECT!=="NONE"){
          actors[key].bounceSound=soundName(f.BOUNCE_SOUND_EFFECT);
        }
        if(f.BOUNCE_EMITTER_NAME&&f.BOUNCE_EMITTER_NAME!=="NONE")
          actors[key].bounceEmitter=radialEmitter(pack,f.BOUNCE_EMITTER_NAME,+f.BOUNCE_EMITTER_TIME);
        if(f.BOUNCE_TRIGGER&&f.BOUNCE_TRIGGER!=="NONE")actors[key].onBounce=visit(f.BOUNCE_TRIGGER);
      }
    }else if(block.type==="EXPLOSION"){
      const colors=Array.from({length:+f.DRAW_COLOR_LENGTH},(_,i)=>rgb(+f.DRAW_COLOR+i*Number(f.DRAW_COLOR_DIRECTION)));
      actors[key]={type:"blast",radius:+f.RADIUS,damage:+f.DAMAGE,erase:f.ERASE_TERRAIN_FLAG==="TRUE",
        dirt:f.DIRTFALL_FLAG==="TRUE",knockback:f.THROW_TANK_FLAG==="TRUE",eraseDelay:+f.ERASE_DELAY,
        inward:f.ERASE_DIRECTION==="EXPLOSION_IN",colors};
      if(f.DOUBLE_UP_FLAG==="FALSE")actors[key].singlePixel=true;
      if(f.DRAW_DIRECTION==="EXPLOSION_IN")actors[key].drawIn=true;
      if(f.RANDOMIZE_ANGLEPOWER_FLAG==="TRUE")actors[key].randomize=true;
      if(atlas[name])actors[key].atlas=atlas[name];
    }else if(block.type==="SHRAPNEL"){
      actors[key]={type:"shrapnel",radius:+f.RADIUS,damage:+f.DAMAGE,knockback:f.THROW_TANK_FLAG==="TRUE",
        seconds:+f.TOTAL_TIME,emitter:radialEmitter(pack,f.EMITTER_NAME,+f.EMITTER_TIME)};
    }else if(block.type==="TRACER"){
      actors[key]={type:"marker",label:f.TEXT,seconds:Number(f.DISPLAY_TIME)};
    }else if(block.type==="JUMPJETS"){
      actors[key]={type:"jump"};
    }else if(block.type==="DIRTMOVER"){
      actors[key]={type:"cutter",minWidth:+f.MIN_WIDTH,maxWidth:+f.MAX_WIDTH,height:+f.HEIGHT,thickness:+f.THICKNESS,
        backup:+f.BACKUP_DISTANCE,dirt:f.DIRTFALL_FLAG==="TRUE",low:f.LOW_COLOR.split(/\s+/).map(Number),high:f.HIGH_COLOR.split(/\s+/).map(Number)};
    }else if(block.type==="LIGHTNING"){
      const color=(prefix,defaults)=>["RED","GREEN","BLUE"].map((k,i)=>Number(f[prefix+"_"+k]??defaults[i]));
      actors[key]={type:"lightning",damage:Number(f.DAMAGE??50),run:[Number(f.RUN_LENGTH_MIN??3),Number(f.RUN_LENGTH_MAX??10)],
        jump:[Number(f.JUMP_LENGTH_MIN??50),Number(f.JUMP_LENGTH_MAX??150)],from:color("COLOR_START",[200,200,255]),to:color("COLOR_END",[0,0,255])};
    }else if(["CRUISER","DIRTBALL","DIRTSLINGER","MAGICWALL","FIRE","FOG","SUPERBALL","ZAPPER"].includes(block.type)){
      const a=actors[key]={type:block.type.toLowerCase()};
      if(f.EXPLOSION_TRIGGER)a.onImpact=visit(f.EXPLOSION_TRIGGER);
      if(f.DRAW_ANIM&&f.DRAW_ANIM!=="NONE")a.animation={frames:f.DRAW_ANIM.split(/\s+/).filter(n=>n!=="DONE"),speed:+(f.DRAW_ANIM_SPEED??f.DRAW_SPEED),
        offsetX:Number(f.DRAW_ANIM_XOFFSET??0),offsetY:Number(f.DRAW_ANIM_YOFFSET??0)};
      if(f.EMITTER_NAME)a.emitter=radialEmitter(pack,f.EMITTER_NAME,Number(f.EMITTER_TIME??.03));
      if(f.ACTIVE_TIME||f.BURN_TIME)a.seconds=Number(f.ACTIVE_TIME??f.BURN_TIME)/1000;
      for(const [key,field] of Object.entries({radius:"RADIUS",damage:"DAMAGE",width:"WIDTH",height:"HEIGHT",material:"DIRT_INDEX",
        spikes:"SPIKE_COUNT",damageRate:"DAMAGE_PER_SECOND",damageRadius:"DAMAGE_RADIUS",bounceImpulse:"BOUNCE_IMPULSE",size:"DRAW_SIZE",
        trailLength:"TRAIL_LENGTH",bump:"BUMP_DELTA",flashRate:"FLASH_PER_SECOND",splatSize:"SPLAT_SIZE",thickness:"SPLAT_THICKNESS"}))
        if(f[field]!==undefined)a[key]=+f[field];
      for(const [key,field] of [["direction","DIRECTION_MODE"],["splat","SPLAT_MODE"],["blend","BLIT_MODE"]])if(f[field])a[key]=f[field];
      for(const [key,field] of [["low","LOW_COLOR"],["high","HIGH_COLOR"],["color","COLOR"]])if(f[field])a[key]=f[field].split(/\s+/).map(Number);
      if(f.DRAW_COLOR)a.trail=rgb(+f.DRAW_COLOR);
      if(expansion){
        if(f.GRAVITY_FLAG==="FALSE")a.weightless=true;
        if(f.REPEAT_TRIGGER_FLAG==="TRUE"){a.repeat=visit(f.REPEAT_TRIGGER);a.repeatTime=+f.REPEAT_TRIGGER_TIME}
        if(f.TIMEOUT_TRIGGER)a.timeout=visit(f.TIMEOUT_TRIGGER);
        if(f.FPS_SPEED)a.moveHz=+f.FPS_SPEED;
        if(f.BYPASS_TANK_FLAG==="TRUE")a.passTank=true;
        if(f.IGNORE_GLUE_FLAG==="TRUE")a.ignoreGlue=true;
        if(f.SPLAT_MODE==="NORMAL"||f.SPLAT_MODE==="NONE")delete a.splat;
        if(a.blend==="FIRE")a.blend="TRANS";
        if(a.blend==="FOG"||f.PLASMA_TYPE==="FOG")a.blend="FOG";
        if(f.PLASMA_TYPE==="GAS")a.blend="GAS";
      }
      if(a.splat)a.tint=rgb(a.splat==="GLUE"?233:37);
      if(a.type==="zapper"){a.lowAlpha=Number(f.LOW_ALPHA);a.highAlpha=Number(f.HIGH_ALPHA)}
    }else throw Error("Unsupported actor "+block.type);
    const animation=actors[key]?.animation;
    if(expansion&&actors[key]?.knockback){
      const a=actors[key];
      a.throwMagnitude=Number(f.THROW_TANK_MAGNITUDE??0);
      a.fixedThrow=["SET","EXPLOSION_THROW_SET"].includes(f.THROW_TANK_STYLE);
      if(f.THROW_TANK_ANGLE_FLAG==="TRUE"){
        a.throwAngle=Number(f.THROW_TANK_ANGLE??0);a.throwSpread=Number(f.THROW_TANK_ANGLE_SPREAD??0);
      }
    }
    if(animation){
      animation.frames=animation.frames.map(file=>file.replace(/^\/+/, "")).filter(file=>file.toUpperCase()!=="NONE"&&fs.existsSync(path.join(folder,file)));
      if(!animation.frames.length)delete actors[key].animation;
    }
    if(actors[key]&&f.SOUND_EFFECT&&f.SOUND_EFFECT!=="NONE")actors[key].sound=soundName(f.SOUND_EFFECT);
    return key;
  }
  const source=Object.fromEntries(pack.blocks.get(name.toLowerCase()).fields);
  return {name,slot:pack.start+pack.roster.indexOf(name),entry:visit(source.TRIGGER),actors,triggers,...(expansion?{pack:index(pack.file),icon:source.ICON.toLowerCase()}: {})};
}
const weapons=supported.map(name=>{
  try{return compile(packs.find(p=>p.roster.includes(name)),name)}catch(e){throw Error(name+": "+e.message,{cause:e})}
});
// These 8-bit BMPs store field strengths. Their display palettes are unrelated
// to the fire and gas colours selected by the game's compositor.
const plasmaFrames={};
for(const weapon of weapons)for(const actor of Object.values(weapon.actors)){
  const stamp=actor.plasma??(["TRANS","GAS","FOG"].includes(actor.blend)?actor.animation:null);
  if(!stamp)continue;
  for(const name of stamp.frames){
    if(plasmaFrames[name])continue;
    const bmp=fs.readFileSync(path.join(installation,"weapdata",name));
    const offset=bmp.readUInt32LE(10),w=bmp.readInt32LE(18),h=bmp.readInt32LE(22);
    if(bmp.readUInt16LE(28)!==8||bmp.readUInt32LE(30)!==0||h<=0)throw Error(name);
    const stride=(w+3)&~3,indices=[];
    for(let y=h-1;y>=0;y--)indices.push(...bmp.subarray(offset+y*stride,offset+y*stride+w));
    plasmaFrames[name]=[w,h,indices];
  }
}
fs.writeFileSync(path.join(project,"art","plasma-frames.json"),JSON.stringify(plasmaFrames)+"\n");
fs.writeFileSync(path.join(project,"engine","weapons.json"),JSON.stringify(weapons)+"\n");
fs.writeFileSync(path.join(project,"engine","packs.json"),JSON.stringify(packs.map(p=>({id:index(p.file),name:p.label,count:p.roster.length})))+"\n");
for(const sound of sounds){
  const dest=path.join(project,"audio",sound);fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.copyFileSync(path.join(folder,sound),dest);
}
console.log("Imported "+weapons.length+" distinct weapons from "+packs.length+" pack files.");
