import offsets from "./engine/tank-offsets.json" with {type:"json"};

// Values from the Original weapon pack, SingleShotExplosion and BigShotExplosion.
export const weapons=[
  {name:"Single Shot",radius:22,damage:60,trail:[16,255,255],effect:1,spread:[0],trailLength:11,colorLength:12,atlas:"blast"},
  {name:"Big Shot",radius:50,damage:30,trail:[255,0,255],effect:2,spread:[0],trailLength:11,colorLength:12,atlas:"big-blast"},
  {name:"3 Shot",radius:25,damage:20,trail:[97,227,189],effect:1,spread:[-4,0,4],trailLength:12,colorLength:10,atlas:"three-blast"},
  {name:"5 Shot",radius:20,damage:20,trail:[97,227,189],effect:1,spread:[-4,-2,0,2,4],trailLength:12,colorLength:12,atlas:"five-blast"}
];
export const volleys=10;
export function openShop(state){
  // The supported pool supplies twenty choices for the original ten volleys.
  state.pool=Array.from({length:2*volleys},(_,i)=>i%weapons.length);
  state.draft=[[],[]];
  state.ammo=state.tanks.map(()=>weapons.map(()=>0));
}
export function pickWeapon(state,slot){
  if(!state.pool||state.pool[slot]==null)return false;
  const player=(state.draft[0].length+state.draft[1].length)%2;
  const weapon=state.pool[slot];
  state.draft[player].push(weapon);
  state.ammo[player][weapon]++;
  state.pool[slot]=null;
  if(state.draft[1].length===volleys){
    state.selected=state.draft.map(items=>items[0]);
    state.pool=null;
  }
  return true;
}
export function randomDraft(state){
  while(state.pool){
    const remaining=state.pool.flatMap((w,i)=>w===null?[]:[i]);
    pickWeapon(state,remaining[Math.floor(Math.random()*remaining.length)]);
  }
}
const hull=[[4,-10],[11,-4],[11,-1],[3,2],[-3,2],[-11,-1],[-11,-4],[-5,-10]];
const barrel=[[2,-12],[2,0],[-2,0],[-2,-12]];
const rotation=angle=>offsets[(Math.trunc(angle)%360+360)%360];

// 0x474330 places the damage center using the integer sine and cosine tables.
export function damageCenter([x,y,slope]){
  const [c,s]=rotation(Math.trunc(slope)-90);
  return [x+c/128,y+s/128];
}

// 0x4759a4 and 0x475a48. Hull vertices round after translation. Barrel
// vertices and the barrel pivot each round before the two are added.
export function prepareColliders(state){
  const first=800*450,vertices=new Int32Array(state.engine.memory.buffer,first,48);
  return state.tanks.map(([x,y,slope,angle],id)=>{
    const [c,s]=rotation(slope),[bc,bs]=rotation(Math.trunc(angle)-270);
    const pivot=(slope-90)*3.1415927/180;
    const px=Math.trunc(x+7*Math.cos(pivot)),py=Math.trunc(y+7*Math.sin(pivot));
    const start=id*24;
    hull.forEach(([a,b],i)=>{
      vertices[start+i*2]=x+(a*c-b*s)/1024;
      vertices[start+i*2+1]=y+(a*s+b*c)/1024;
    });
    barrel.forEach(([a,b],i)=>{
      vertices[start+16+i*2]=px+Math.trunc((a*bc-b*bs)/1024);
      vertices[start+17+i*2]=py+Math.trunc((a*bs+b*bc)/1024);
    });
    return {center:damageCenter(state.tanks[id]),address:first+start*4};
  });
}
export function hitsTank(state,x,y){
  return state.colliders.some(({center:[cx,cy],address})=>
    Math.abs(x-cx)<=20 && Math.abs(y-cy)<=20 &&
    (state.engine.insideHull(x,y,address,8)||state.engine.insideHull(x,y,address+64,4)));
}
export function applyBlast(state,hit){
  const weapon=weapons[state.weapon],front=Math.min(hit.phase,weapon.radius-1);
  state.tanks.forEach((pose,id)=>{
    if(hit.struck[id])return;
    const [cx,cy]=damageCenter(pose);
    const points=state.engine.blastDamage(hit.x,hit.y,cx,cy,front,weapon.damage);
    if(points<=0)return;
    hit.struck[id]=true;
    state.scores[state.turn]=state.engine.scoreHit(state.scores[state.turn],points,id===state.turn);
    // 0x44c637..0x44c715, normal throw with default intensity and no angle override.
    const dx=Math.trunc(pose[0])-Math.trunc(hit.x),dy=Math.trunc(pose[1])-Math.trunc(hit.y);
    const radians=Math.fround(Math.atan2(dy,dx)),degrees=Math.fround(radians*180/3.1415927);
    const direction=315-Math.abs(degrees)*.5;
    const [c,s]=rotation(direction),impulse=points*.038;
    state.airborne[id]=[c/1024*impulse,s/1024*impulse];
    pose[0]+=state.airborne[id][0];
    pose[1]+=state.airborne[id][1];
  });
}
