import offsets from "./engine/tank-offsets.json" with {type:"json"};

import programs from "./engine/weapons.json" with {type:"json"};

export const weapons=programs.map(program=>{
  const primaryBlast=Object.values(program.actors).find(a=>a.type==="blast");
  return {...program,radius:primaryBlast?.radius??0,damage:primaryBlast?.damage??0};
});
export function inventory(state){
  return catalog.filter(i=>state.mode==="practice"||state.ammo[state.turn][i]>0);
}
export const volleys=10;
const catalog=weapons.map((_,i)=>i).sort((a,b)=>weapons[a].slot-weapons[b].slot);
export function roll(state,bound){
  state.seed=state.engine.nextRandom(state.seed)>>>0;
  return state.seed%bound;
}
export function deal(state,catalog){
  // shop.cpp, 0x46cf10. Draw positions without replacement, then draw weapons with replacement.
  const positions=Array.from({length:2*volleys},(_,i)=>i),order=[];
  while(positions.length)order.push(positions.splice(roll(state,positions.length),1)[0]);
  const pool=Array(2*volleys);
  for(const slot of order)pool[slot]=catalog[roll(state,catalog.length)];
  return pool;
}
export function openShop(state){
  state.pool=deal(state,catalog);
  state.autoDraft=false;
  state.draftTime=0;
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
export function advanceDraft(state,seconds){
  if(!state.pool||!state.autoDraft)return false;
  state.draftTime+=seconds;
  if(state.draftTime<.1)return false;
  state.draftTime-=.1;
  const remaining=state.pool.flatMap((w,i)=>w===null?[]:[i]);
  pickWeapon(state,remaining[roll(state,remaining.length)]);
  state.onSound?.("pickweap.wav");
  if(!state.pool)state.autoDraft=false;
  return true;
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
// 0x475430 applies the impulse and takes one full velocity step at launch.
export function throwTank(state,id,angle,impulse,offset=0){
  const pose=state.tanks[id],[cosine,sine]=rotation(angle),c=cosine/1024,s=sine/1024;
  pose[0]+=c*offset;pose[1]+=s*offset;
  state.airborne[id]=[c*impulse,s*impulse];
  pose[0]+=state.airborne[id][0];pose[1]+=state.airborne[id][1];
}
export function applyBlast(state,hit,front=Math.min(hit.phase,hit.actor.radius-1)){
  const weapon=hit.actor;
  state.tanks.forEach((pose,id)=>{
    if(hit.struck[id])return;
    const [cx,cy]=damageCenter(pose);
    const points=state.engine.blastDamage(hit.x,hit.y,cx,cy,front,weapon.damage);
    if(points<=0)return;
    hit.struck[id]=true;
    state.scores[state.turn]=state.engine.scoreHit(state.scores[state.turn],points,id===state.turn);
    if(!weapon.knockback)return;
    // 0x44c637..0x44c715, normal throw with default intensity and no angle override.
    const dx=Math.trunc(pose[0])-Math.trunc(hit.x),dy=Math.trunc(pose[1])-Math.trunc(hit.y);
    const radians=Math.fround(Math.atan2(dy,dx)),degrees=Math.fround(radians*180/3.1415927);
    const direction=315-Math.abs(degrees)*.5;
    throwTank(state,id,direction,points*.038);
  });
}
