import {weapons,volleys,prepareColliders,hitsTank,applyBlast} from "./match.mjs";
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
  return {engine,solid,tanks:scene.tanks.map(p=>p.slice()),turn:scene.turn,shots:0,ball:null,impact:null,move:null,trail:[],revision:0,
    mode,scores:[0,0],ammo:[[5,5],[5,5]],moves:mode==="match"?[4,4]:[99,99],
    selected:[0,0],weapon:0,finished:false,airborne:[null,null]};
}
export function floorAt(s,x,startY=0) {
  let y=Math.max(0,Math.min(H-1,Math.trunc(startY)));
  while(y>0&&s.solid[y*W+x])y--;
  while(y<H-1&&!s.solid[y*W+x])y++;
  return y;
}
export function launch(s,angle,power) {
  if(s.ball||s.impact||s.move||s.finished)return false;
  settleTerrain(s);
  const [x,y,slope]=s.tanks[s.turn],direction=360-angle,e=s.engine;
  s.weapon=s.selected[s.turn];
  if(s.mode==="match"){
    if(!s.ammo[s.turn][s.weapon])return false;
    s.ammo[s.turn][s.weapon]--;
  }
  s.tanks[s.turn][3]=direction;
  s.colliders=prepareColliders(s);
  e.setBlastRadius(weapons[s.weapon].radius);
  e.launch(e.muzzleX(x,slope,direction),e.muzzleY(y,slope,direction),direction,power);
  s.ball={x:e.x.value,y:e.y.value};s.shots++;s.trail=[];
  return true;
}
export function moveTank(s,direction) {
  if(s.ball||s.impact||s.move||s.finished||!s.moves[s.turn])return false;
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
  if(s.impact)s.settle={center:Math.trunc(s.impact.x),radius:weapons[s.weapon].radius};
  s.ball=null;s.impact=null;s.trail=[];
  if(s.mode==="match"&&s.shots===2*volleys){s.finished=true;return}
  s.turn=1-s.turn;
  if(s.mode==="match"&&!s.ammo[s.turn][s.selected[s.turn]])s.selected[s.turn]=s.ammo[s.turn].findIndex(n=>n>0);
}
function settleTerrain(s){
  if(!s.settle)return;
  const {center,radius}=s.settle;
  const left=Math.max(0,center-radius+1),right=Math.min(W-1,center+radius);
  for(let x=left;x<=right;x++){
    let dest=H-1;
    for(let y=H-1;y>=0;y--){
      if(!s.solid[y*W+x])continue;
      if(dest!==y){s.solid[dest*W+x]=1;s.solid[y*W+x]=0}
      dest--;
    }
  }
  for(const pose of s.tanks)if(Math.abs(pose[0]-center)<=radius+11)pose.splice(0,3,...groundPose(s,pose[0]));
  s.settle=null;
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
  settleTerrain(s);
  if(s.move){
    if(s.move.ticks++%8)return;
    const pose=s.tanks[s.turn],x=pose[0]+s.move.direction;
    if(x<12||x>=W-12){s.move=null;return}
    pose.splice(0,3,...groundPose(s,x));
    if(--s.move.remaining===0)s.move=null;
    return;
  }
  if(s.impact){
    const phase=e.blastStep(DT);
    if(phase!==s.impact.phase){
      s.impact.phase=phase;
      const {radius}=weapons[s.weapon];
      if(phase<radius)s.revision++;
      applyBlast(s,phase);
    }
    if(s.airborne.some(Boolean))moveAirborne(s);
    if(phase>=weapons[s.weapon].radius+11&&!s.airborne.some(Boolean))endTurn(s);
    return;
  }
  if(!s.ball)return;
  const event=e.step(DT,0);
  if(event===2){endTurn(s);return}
  s.ball.x=e.x.value;s.ball.y=e.y.value;
  if(event===1||hitsTank(s,s.ball.x,s.ball.y)){
    s.impact={x:s.ball.x,y:s.ball.y,phase:0,struck:[false,false]};s.ball=null;e.beginBlast();return;
  }
  s.trail.push([s.ball.x,s.ball.y]);
  if(s.trail.length>45)s.trail.shift();
}
