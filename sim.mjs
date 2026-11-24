import {weapons,volleys,prepareColliders,hitsTank,applyBlast} from "./match.mjs";
import {queueDirt,advanceDirt} from "./soil.mjs";
export const W=800, H=450, DT=.004;

export async function loadEngine() {
  const response=await fetch(new URL("./engine/single-shot.wasm",import.meta.url));
  if(!response.ok) throw Error("Could not load Single Shot");
  const {instance}=await WebAssembly.instantiate(await response.arrayBuffer(),{math:Math});
  return instance.exports;
}
export function setup(engine,scene,mode="practice") {
  const solid=new Uint8Array(engine.memory.buffer,0,W*H);
  let offset=0;
  for(const [i,length] of scene.terrain.runs.entries()) {
    solid.fill(i%2,offset,offset+length);
    offset+=length;
  }
  if(offset!==W*H)throw Error("Incomplete terrain");
  return {engine,solid,tanks:scene.tanks.map(p=>p.slice()),turn:scene.turn,shots:0,move:null,revision:0,
    balls:[],blasts:[],get ball(){return this.balls[0]},get impact(){return this.blasts[0]},
    mode,scores:[0,0],ammo:[[3,3,2,2],[3,3,2,2]],moves:mode==="match"?[4,4]:[99,99],
    selected:[0,0],weapon:0,finished:false,airborne:[null,null],craters:[],dirt:new Map(),dirtAge:0,inVolley:false};
}
export function floorAt(s,x,startY=0) {
  let y=Math.max(0,Math.min(H-1,Math.trunc(startY)));
  while(y>0&&s.solid[y*W+x])y--;
  while(y<H-1&&!s.solid[y*W+x])y++;
  return y;
}
export function launch(s,angle,power) {
  if(s.inVolley||s.move||s.finished||s.pool)return false;
  s.dirtAge=DT;
  const [x,y,slope]=s.tanks[s.turn],direction=360-angle,e=s.engine;
  s.weapon=s.selected[s.turn];
  if(s.mode==="match"){
    if(!s.ammo[s.turn][s.weapon])return false;
    s.ammo[s.turn][s.weapon]--;
  }
  s.tanks[s.turn][3]=direction;
  s.colliders=prepareColliders(s);
  const weapon=weapons[s.weapon],ox=e.muzzleX(x,slope,direction),oy=e.muzzleY(y,slope,direction);
  e.setBlastRadius(weapon.radius);
  for(const offset of weapon.spread){
    e.launch(ox,oy,direction+offset,power);
    s.balls.push({x:ox,y:oy,vx:e.vx.value,vy:e.vy.value,trail:[]});
  }
  s.shots++;s.inVolley=true;
  return true;
}
export function moveTank(s,direction) {
  if(s.inVolley||s.move||s.finished||s.pool||!s.moves[s.turn])return false;
  if(s.mode==="match")s.moves[s.turn]--;
  s.move={direction,remaining:59,ticks:0};
  return true;
}
export function groundPose(s,x,startY=0) {
  x=Math.max(0,Math.min(W-1,Math.trunc(x)));
  const y=floorAt(s,x,startY);
  const rise=floorAt(s,Math.min(W-1,x+4),y)-floorAt(s,Math.max(0,x-4),y);
  const angle=Math.atan2(rise,9)*180/3.1415927;
  return [x,y,angle<0?Math.round((360+angle)*100)/100:angle];
}
function endTurn(s){
  s.inVolley=false;
  if(s.craters.length){
    for(const pose of s.tanks)if(s.craters.some(([a,b])=>pose[0]>=a-12&&pose[0]<=b+11))pose.splice(0,3,...groundPose(s,pose[0]));
    s.craters=[];
  }
  if(s.mode==="match"&&s.shots===2*volleys){s.finished=true;return}
  s.turn=1-s.turn;
  if(s.mode==="match"&&!s.ammo[s.turn][s.selected[s.turn]])s.selected[s.turn]=s.ammo[s.turn].findIndex(n=>n>0);
}
function addCrater(s,x,radius){
  let left=Math.max(0,Math.trunc(x)-radius+1),right=Math.min(W-1,Math.trunc(x)+radius);
  s.craters=s.craters.filter(([a,b])=>{
    if(a>right+1||b<left-1)return true;
    left=Math.min(left,a);right=Math.max(right,b);return false;
  });
  s.craters.push([left,right]);
}
function moveAirborne(s){
  for(const [id,v] of s.airborne.entries()){
    if(!v)continue;
    const pose=s.tanks[id];v[1]+=5.4*DT;
    pose[0]+=v[0]*(DT*50);pose[1]+=v[1]*(DT*50);
    if(pose[0]<15||pose[0]>W-15){v[0]*=-1;pose[0]=Math.max(15,Math.min(W-15,pose[0]))}
    const x=Math.trunc(pose[0]),y=Math.trunc(pose[1]);
    if(y>=H-1||s.solid[y*W+x]){
      if(y<H-1&&[1,2,3,4].every(n=>s.solid[Math.max(0,y-n)*W+x])){
        pose[0]-=v[0];pose[1]-=v[1];s.airborne[id]=null;continue;
      }
      const [,surface,slope]=groundPose(s,x,y);
      pose[1]=surface;pose[2]=slope;s.airborne[id]=null;
    }
  }
}
export function step(s) {
  const e=s.engine;
  if(s.move){
    if(s.move.ticks++%8)return;
    const pose=s.tanks[s.turn],x=pose[0]+s.move.direction;
    if(x<12||x>=W-12){s.move=null;return}
    pose.splice(0,3,...groundPose(s,x));
    if(--s.move.remaining===0)s.move=null;
    return;
  }
  if(!s.inVolley)return;
  const weapon=weapons[s.weapon],newBlasts=[];
  s.balls=s.balls.filter(ball=>{
    e.x.value=ball.x;e.y.value=ball.y;e.vx.value=ball.vx;e.vy.value=ball.vy;
    const event=e.step(DT,0);
    ball.x=e.x.value;ball.y=e.y.value;ball.vx=e.vx.value;ball.vy=e.vy.value;
    if(event===2)return false;
    if(event===1||hitsTank(s,ball.x,ball.y)){
      newBlasts.push({x:ball.x,y:ball.y,phase:0,age:0,struck:[false,false]});
      addCrater(s,ball.x,weapon.radius);s.onContact?.();return false;
    }
    ball.trail.push([ball.x,ball.y]);
    if(ball.trail.length>45)ball.trail.shift();
    return true;
  });
  s.blasts=s.blasts.filter(blast=>{
    e.x.value=blast.x;e.y.value=blast.y;e.blastAge.value=blast.age;e.phase.value=blast.phase;
    const before=blast.phase;blast.phase=e.blastStep(DT);blast.age=e.blastAge.value;
    const eroded=before!==blast.phase&&blast.phase<weapon.radius;
    if(eroded)s.revision++;
    if(before!==blast.phase)applyBlast(s,blast);
    s.onBlastStep?.(blast,eroded);
    const active=blast.phase<weapon.radius+weapon.colorLength-1;
    if(!active)queueDirt(s,blast,weapon.radius);
    return active;
  });
  s.blasts.push(...newBlasts);
  advanceDirt(s,DT);
  if(s.airborne.some(Boolean)){moveAirborne(s);s.colliders=prepareColliders(s)}
  if(!s.ball&&!s.impact&&!s.dirt.size&&!s.airborne.some(Boolean))endTurn(s);
}
