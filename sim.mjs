import {weapons,volleys,roll,prepareColliders,hitsTank,applyBlast,throwTank,advanceHitNumbers} from "./match.mjs";
import {outsideContact,rebound} from "./contour.mjs";
import {queueDirt,advanceDirt} from "./soil.mjs";
import {advanceCutter,startCutter} from "./cutter.mjs";
import {moveParticles,emitParticles,startEmitter} from "./particles.mjs";
export const W=800, H=450, DT=.004;

export async function loadEngine() {
  const response=await fetch(new URL("./engine/single-shot.wasm",import.meta.url));
  if(!response.ok) throw Error("Could not load Single Shot");
  const {instance}=await WebAssembly.instantiate(await response.arrayBuffer());
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
  for(const [cell,material] of scene.materialCells??[])solid[cell]=material;
  const seed=scene.seed??crypto.getRandomValues(new Uint32Array(1))[0];
  return {engine,solid,tanks:scene.tanks.map(p=>p.slice()),turn:scene.turn,shots:0,move:null,revision:0,
    seed,pending:[],tick:0,balls:[],blasts:[],markers:[],get ball(){return this.balls[0]},get impact(){return this.blasts[0]},
    mode,scores:[0,0],ammo:scene.tanks.map(()=>weapons.map(()=>2)),moves:mode==="match"?[4,4]:[99,99],
    dirtFalling:false,rockTime:.774,rockIndex:5,
    hitNumbers:[],nextHitPhase:0,hitPhaseTime:0,
    fragments:[],fx:{seed:scene.fxSeed??seed,particles:[],emitters:[],ticks:0,clock:0,previous:DT},
    selected:[0,0],weapon:0,finished:false,airborne:[null,null],cutters:[],craters:[],dirt:new Map(),dirtAge:0,inVolley:false};
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
  s.dirtFalling=false;
  const [x,y,slope]=s.tanks[s.turn],direction=360-angle,e=s.engine;
  s.weapon=s.selected[s.turn];
  if(s.mode==="match"){
    if(!s.ammo[s.turn][s.weapon])return false;
    s.ammo[s.turn][s.weapon]--;
  }
  s.tanks[s.turn][3]=direction;
  s.colliders=prepareColliders(s);
  const weapon=weapons[s.weapon],ox=e.muzzleX(x,slope,direction),oy=e.muzzleY(y,slope,direction);
  s.groundAge=[2*DT,2*DT];
  s.tick=-1;
  queueTrigger(s,weapon.entry,ox,oy,direction,power);
  releaseDue(s);
  s.shots++;s.inVolley=true;
  return true;
}
function applyExpression(s,previous,initial,expression){
  if(!expression)return previous;
  let v=previous;
  const tokens=expression.split(/\s+/);
  for(let i=0;i<tokens.length;i++){
    const op=tokens[i];
    if(op==="RESET")v=initial;
    else if(op==="RND"){
      const bound=Math.trunc(Number(tokens[++i]));
      if(bound)v+=roll(s,bound);
    }
    else if(op==="SET")v=Math.fround(Number(tokens[++i]));
    else if(op==="+")v+=Math.fround(Number(tokens[++i]));
    else if(op==="-")v-=Math.fround(Number(tokens[++i]));
    else if(op==="/")v/=Math.fround(Number(tokens[++i]));
    else throw Error("Unknown trigger operation "+op);
  }
  return v;
}
function queueTrigger(s,name,x,y,angle,power){
  const program=weapons[s.weapon],base={xoffset:x,yoffset:y,angle,power},values={...base};
  let elapsed=0;
  for(const command of program.triggers[name]){
    elapsed+=command.delay;
    s.pending.push({tick:s.tick+Math.ceil(elapsed/4),actor:program.actors[command.actor],base,values,command});
  }
}
function releaseDue(s){
  s.pending=s.pending.filter(command=>{
    if(command.tick>s.tick)return true;
    const {actor,base,values,command:definition}=command,e=s.engine;
    for(const key of Object.keys(base))values[key]=applyExpression(s,values[key],base[key],definition[key]);
    const {xoffset:x,yoffset:y,angle,power}=values;
    if(definition.sound)s.onSound?.(definition.sound);
    if(actor.sound)s.onSound?.(actor.sound);
    if(actor.type==="bullet"){
      e.launch(x,y,angle,power);
      const ball={actor,bounces:actor.bounces??0,frame:0,frameTime:0,age:0,fresh:true,x,y,vx:e.vx.value,vy:e.vy.value,trail:[]};
      s.balls.push(ball);
    }else if(actor.type==="marker"){
      const marker={x,y,actor,age:0};s.markers.push(marker);s.onMarker?.(marker);
    }else if(actor.type==="cutter"){
      s.cutters.push(startCutter(e,actor,x,y,angle,power));
    }else if(actor.type==="shrapnel"){
      s.fragments.push({actor,x,y,age:0,struck:[false,false],phase:actor.radius});
    }else if(actor.type==="jump"){
      // 0x45a760. Jump Jets offsets the tank three pixels along the barrel before takeoff.
      throwTank(s,s.turn,angle,power*.11+1.1,3);
      s.groundAge[s.turn]=DT;s.jumpSettling=true;
    }else{
      s.blasts.push({actor,x,y,phase:0,age:0,struck:[false,false]});
      if(actor.erase)addCrater(s,x,actor.radius);
    }
    return false;
  });
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
  return [x,y,angle<0?360-Math.trunc(-angle*100)/100:angle];
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
// 0x47454b and 0x4748e0. A grounded tank checks its supports every 20 ms.
// The clock pauses while it is airborne. The checks follow the hull normal.
function settleTank(s,pose,id){
  s.groundAge[id]+=DT;
  if(s.groundAge[id]<=.02)return false;
  s.groundAge[id]-=.02;
  const occupied=(x,y)=>s.solid[Math.max(0,Math.min(H-1,Math.trunc(y)))*W+Math.max(0,Math.min(W-1,Math.trunc(x)))];
  const radians=(pose[2]-90)/180*3.1415927;
  const dx=s.engine.surfaceCos(radians),dy=s.engine.surfaceSin(radians);
  const normal=distance=>occupied(pose[0]+distance*dx,pose[1]+distance*dy);
  if([0,1,2,3,4].every(normal))return false;

  let x=Math.trunc(pose[0]),y=Math.trunc(pose[1]),moved=false;
  const floor=floorAt(s,x,y);
  if(occupied(x,y)&&x>17&&x<W-17&&![2,3,4,5,6,7].some(normal)){
    const rise=floorAt(s,x+4,floor)-floorAt(s,x-4,floor);
    if(Math.abs(Math.atan2(rise,9)*180/3.1415927)>60){
      const next=x+Math.sign(rise);
      if([1,2,3,4].some(n=>!occupied(x,y-n))||!occupied(next,y)){
        x=next;pose[0]=x;pose[2]=groundPose(s,x,y)[2];moved=true;
      }
    }
  }
  if(!occupied(x,y)&&y<H-1){
    pose[1]=Math.min(H-1,pose[1]+1);y++;moved=true;
    if([-1,0,1].some(offset=>occupied(x+offset,y)))pose[2]=groundPose(s,x,y)[2];
    if(floor-y>6)s.airborne[id]=[0,0];
  }
  return moved;
}
export function step(s) {
  if(s.pool)return;
  stepActors(s);
  advanceHitNumbers(s,DT);
}
function stepActors(s) {
  const e=s.engine;
  moveParticles(s.fx,DT);
  if(s.move){
    if(s.move.ticks++%8)return;
    const pose=s.tanks[s.turn],x=pose[0]+s.move.direction;
    if(x<12||x>=W-12){s.move=null;return}
    pose.splice(0,3,...groundPose(s,x));
    if(--s.move.remaining===0)s.move=null;
    return;
  }
  if(!s.inVolley){if(s.fx.emitters.length)emitParticles(s,DT);return}
  s.tick++;
  s.balls=s.balls.filter(ball=>{
    e.x.value=ball.x;e.y.value=ball.y;e.vx.value=ball.vx;e.vy.value=ball.vy;
    e.setFlightMode(ball.actor.gravity,Number(ball.actor.hitAir),Number(ball.fresh));
    ball.fresh=false;
    const [targetX,targetY]=s.tanks[1-s.turn];
    e.dropTarget(ball.actor.dropSound?targetX:-9999);
    e.proximityTarget(targetX,targetY,ball.actor.distance??0);
    e.homing(ball.actor.homingRange??0,ball.actor.homingMagnitude??0);
    let event=e.step(DT,0);
    ball.age+=DT;
    if(e.dropping.value&&!ball.dropped){s.onSound?.(ball.actor.dropSound);ball.dropped=true}
    ball.x=e.x.value;ball.y=e.y.value;ball.vx=e.vx.value;ball.vy=e.vy.value;
    if(e.approach.value)queueTrigger(s,ball.actor.onApproach,e.approachX.value,e.approachY.value,e.approachAngle.value,e.approachPower.value);
    if(event===2)return false;
    if(event===1){
      const bottom=Boolean(e.bottomContact.value);
      const key=Math.trunc(ball.y)*W+Math.trunc(ball.x);
      const flags=bottom?0:s.solid[key];
      if(flags&32)ball.bounces=0;
      const rubber=Boolean((flags&64)&&!(flags&32));
      if(ball.bounces||rubber){
        event=rebound(s,ball,bottom,rubber)?1:0;
        if(!event&&!rubber&&ball.actor.bounceEmitter)startEmitter(s.fx,ball.actor.bounceEmitter,ball.x,ball.y);
        if(!event&&ball.actor.onBounce)queueTrigger(s,ball.actor.onBounce,ball.x,ball.y,e.impactAngle(),e.impactPower());
      }
      else if(ball.actor.outside&&!bottom)outsideContact(s,ball);
    }
    const timer=ball.actor.onTimer&&ball.age>=ball.actor.time;
    if(timer||event===1||hitsTank(s,ball.x,ball.y)){
      queueTrigger(s,timer?ball.actor.onTimer:ball.actor.onImpact,ball.x,ball.y,e.impactAngle(),e.impactPower());
      return false;
    }
    if(e.approach.value)return false;
    if(ball.actor.animation){
      const {speed,frames}=ball.actor.animation;
      ball.frameTime+=DT;
      while(speed>0&&ball.frameTime>1/speed){ball.frameTime-=1/speed;ball.frame=(ball.frame+1)%frames.length}
    }
    ball.trail.push([ball.x,ball.y]);
    if(ball.trail.length>45)ball.trail.shift();
    return true;
  });
  s.blasts=s.blasts.filter(blast=>{
    const weapon=blast.actor;
    e.setBlastRadius(weapon.radius);e.setTerrainErase(Number(weapon.erase));
    e.x.value=blast.x;e.y.value=blast.y;e.blastAge.value=blast.age;e.phase.value=blast.phase;
    const before=blast.phase;blast.phase=e.blastStep(DT);blast.age=e.blastAge.value;
    const eroded=weapon.erase&&before!==blast.phase&&blast.phase<weapon.radius;
    if(eroded)s.revision++;
    if(before!==blast.phase)applyBlast(s,blast);
    s.onBlastStep?.(blast,eroded);
    const active=blast.phase<weapon.radius+weapon.eraseDelay+1;
    if(!active&&weapon.dirt)queueDirt(s,blast,weapon.radius);
    return active;
  });
  s.markers=s.markers.filter(m=>{m.age+=DT;return m.age<m.actor.seconds});
  s.fragments=s.fragments.filter(hit=>{
    if(!hit.age){
      e.setBlastRadius(hit.actor.radius);
      applyBlast(s,hit,hit.actor.radius);
      startEmitter(s.fx,hit.actor.emitter,hit.x,hit.y);
    }
    hit.age+=DT;
    return hit.age<hit.actor.seconds;
  });
  s.cutters=s.cutters.filter(cut=>advanceCutter(s,cut,DT));
  releaseDue(s);
  if(s.fx.emitters.length)emitParticles(s,DT);
  advanceDirt(s,DT);
  const airborne=s.airborne.map(Boolean);
  let moved=airborne.some(Boolean);
  if(moved)moveAirborne(s);
  s.tanks.forEach((pose,id)=>{
    if(airborne[id])return;
    const groundedTick=s.groundAge[id]+DT>.02,changed=settleTank(s,pose,id);
    if(changed)moved=true;
    if(s.jumpSettling&&id===s.turn&&groundedTick&&!changed)s.jumpSettling=false;
  });
  if(moved)s.colliders=prepareColliders(s);
  if(!s.ball&&!s.impact&&!s.pending.length&&!s.fragments.length&&!s.markers.length&&!s.cutters.length&&!s.dirt.size&&!s.airborne.some(Boolean)&&!s.jumpSettling)endTurn(s);
}
