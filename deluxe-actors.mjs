import {walkContour,outsideContact} from "./contour.mjs";
import {damageCenter,hitsTank} from "./match.mjs";
import {queueDirtBounds} from "./soil.mjs";
import {startEmitter} from "./particles.mjs";
import vectors from "./engine/tank-offsets.json" with {type:"json"};

const integer=Math.trunc;
function cell(s,x,y){
  return s.solid[Math.max(0,Math.min(449,integer(y)))*800+Math.max(0,Math.min(799,integer(x)))];
}
function heading(s,x,y,hand){
  let first=3;
  if(cell(s,x,y-1)){
    if(!cell(s,x-1,y))first=2;
    else if(!cell(s,x,y+1))first=1;
    else if(!cell(s,x+1,y))first=0;
  }
  return hand===1?first:(first+2)%4;
}
function tangent(s,x,y,limit=1){
  let a=[x,y,heading(s,x,y,1)],b=[x,y,heading(s,x,y,-1)],angle=0;
  for(let k=0;k<limit;k++){
    a=walkContour(s,...a,1,3+k);b=walkContour(s,...b,-1,3+k);
    angle=(s.engine.surfaceAngle(b[1]-a[1],b[0]-a[0])*180/3.1415927+361)%360;
    if(integer(angle)%90)break;
  }
  return angle;
}
function deposit(s,x,y,material,color){
  x=integer(x);y=integer(y);
  if(x<0||x>=800||y<0||y>=450)return;
  const at=y*800+x;
  if(s.solid[at])return;
  s.solid[at]=material;
  s.onDeposit?.(x,y,color);
}
function bounds(s,a){
  const [left,top,right,bottom]=a.bounds;
  queueDirtBounds(s,left,top,right,bottom);
}
export function beginActor(s,actor,x,y,angle,power,x2=x,y2=y){
  const e=s.engine,r=angle/180*3.1415927;
  const speed=power*.11+1.1;
  const a={actor,x,y,age:0,clock:0,depth:0,frame:0,trail:[],vx:e.surfaceCos(r)*speed,vy:e.surfaceSin(r)*speed};
  if(actor.type==="lightning"){
    // 0x466650 takes both pairs of trigger coordinates. Coincident ends
    // receive a one-pixel horizontal separation before distance testing.
    if(x===x2&&y===y2)x2+=x<798?1:-1;
    a.end=[integer(x2),integer(y2)];a.x=integer(x);a.y=integer(y);
  }else if(actor.type==="cruiser"){
    a.x=integer(x);a.y=integer(y);
    a.slope=tangent(s,a.x,a.y,10);
    const left=a.vx<0,upside=a.slope>90&&a.slope<=270;
    let right=a.vx!==0&&(left===upside);
    if(actor.direction==="REVERSE")right=!right;
    if(actor.direction==="DOWNHILL")right=a.slope<180&&(a.slope>=2||a.vx>0);
    a.hand=right?-1:1;a.heading=heading(s,a.x,a.y,a.hand);
    a.history=Array.from({length:6},()=>[a.x,a.y]);
  }else if(actor.type==="zapper"){
    const id=1-s.turn,[cx,cy]=damageCenter(s.tanks[id]);
    a.alpha=actor.lowAlpha;a.alphaDirection=1;
    a.end=e.zapEndpoint(x,y,cx,cy);
    if(Math.hypot(cx-a.end[0],cy-a.end[1])<=14)award(s,id,actor.damage);
    if(actor.emitter)startEmitter(s.fx,actor.emitter,...a.end);
  }else if(actor.type==="dirtslinger"){
    a.angle=(tangent(s,integer(x),integer(y))+270)%360;
  }else if(actor.type==="magicwall"&&actor.emitter){
    const emitter={...actor.emitter,seconds:actor.height*.02};
    startEmitter(s.fx,emitter,x,y);a.source=s.fx.emitters.at(-1);
  }
  return a;
}
function award(s,id,points){
  s.scores[s.turn]=s.engine.scoreHit(s.scores[s.turn],points,id===s.turn);
  s.hitNumbers.push({x:s.tanks[id][0],y:s.tanks[id][1]-15,phase:s.nextHitPhase%359,text:String(id===s.turn?-points:points)});
  s.nextHitPhase+=60;
}
// Terrain writers at 0x448260, 0x45f710 and 0x44a5e0.
function grow(s,a,dt){
  const w=a.actor,ball=w.type==="dirtball",wall=w.type==="magicwall",interval=ball?1/30:wall?.02:1/60;
  a.clock+=dt;if(a.clock<=interval)return true;a.clock-=interval;
  const depth=++a.depth,limit=w.radius??w.height;
  const color=w.low.map((v,i)=>v+integer((w.high[i]-v)*(depth-1)/limit));
  if(ball){
    let angle=0;
    for(let i=0;i<w.spikes;i++,angle+=6.2831854/w.spikes)
      deposit(s,a.x+depth*s.engine.surfaceCos(angle),a.y+depth*s.engine.surfaceSin(angle),w.material,color);
    a.bounds=[integer(a.x-depth-1),integer(a.y-depth-1),integer(a.x+depth+1),integer(a.y+depth+1)];
  }else if(wall){
    const left=integer(a.x-w.width*.5),y=integer(a.y-depth);
    for(let i=0;i<w.width;i++)deposit(s,left+i,y,w.material,color);
    if(a.source)a.source.y=y;
    a.bounds=[left,y,left+w.width,integer(a.y)];
  }else{
    const [dx,dy]=vectors[integer(a.angle)].map(v=>v/1024);
    const cx=a.x+depth*dx,cy=a.y+depth*dy,half=depth/limit*w.width*.5;
    const x1=integer(cx+dy*half),y1=integer(cy-dx*half),x2=integer(cx-dy*half),y2=integer(cy+dx*half);
    const length=Math.hypot(x2-x1,y2-y1),rad=s.engine.surfaceAngle(y2-y1,x2-x1);
    const sx=s.engine.surfaceCos(rad),sy=s.engine.surfaceSin(rad);
    let px=x1,py=y1;
    for(let n=length;n>0;n--,px+=sx,py+=sy){
      const ix=integer(px),iy=integer(py);
      for(let j=0;j<2;j++)for(let i=0;i<2;i++)deposit(s,ix+i,iy+j,w.material,color);
    }
    a.bounds=[Math.min(integer(a.x),x1,x2)-6,Math.min(integer(a.y),y1,y2)-6,
      Math.max(integer(a.x),x1,x2)+6,Math.max(integer(a.y),y1,y2)+6];
  }
  if(depth<limit&&(!wall||a.y-depth>15))return true;
  if(a.source)a.source.age=a.source.definition.seconds;
  if(w.dirtFall!==false)bounds(s,a);
  return false;
}
function cruise(s,a,dt,trigger){
  a.clock+=dt;
  const interval=a.actor.moveHz?1/a.actor.moveHz:.01;
  if(a.clock>interval){
    a.clock-=interval;
    if(!a.actor.ignoreGlue&&(cell(s,a.x,a.y)&32))return detonate();
    if(cell(s,a.x,a.y)){
      [a.x,a.y,a.heading]=walkContour(s,a.x,a.y,a.heading,a.hand,1);
      a.slope=tangent(s,a.x,a.y,3);
    }else if(a.y>=449){a.y=449;a.x-=a.hand}
    else {a.y++;a.slope=90;a.heading=heading(s,a.x,a.y,a.hand)}
    if(a.x<0||a.x>=800)return false;
    if(cell(s,a.x,a.y)&&[-1,0,1].every(dy=>[-1,0,1].every(dx=>cell(s,a.x+dx,a.y+dy))))return detonate();
    if(a.actor.bump&&(a.history[5][1]-a.y>Math.abs(a.actor.bump)
        ||a.heading===(a.hand===1?1:3)))return detonate();
    a.history.unshift([a.x,a.y]);a.history.pop();
    if([2,4].every(i=>a.x===a.history[i][0]&&a.y===a.history[i][1]))return detonate();
    a.trail.push([a.x,a.y]);if(a.trail.length>a.actor.trailLength)a.trail.shift();
    if(!a.actor.passTank&&hitsTank(s,a.x,a.y))return detonate();
  }
  if(a.actor.repeat&&a.age>=(a.nextRepeat??a.actor.repeatTime)){
    trigger(a.actor.repeat,a.x,a.y,a.slope,1);a.nextRepeat=(a.nextRepeat??a.actor.repeatTime)+a.actor.repeatTime;
  }
  if(a.age>a.actor.seconds){if(a.actor.timeout){trigger(a.actor.timeout,a.x,a.y,a.slope,1);return false}return detonate()}
  return true;
  function detonate(){trigger(a.actor.onImpact,a.x,a.y,tangent(s,a.x,a.y,5),1);return false}
}
function splat(s,a){
  const w=a.actor;
  if(!w.splat)return;
  let left=[integer(a.x),integer(a.y),3];
  let right=[left[0],left[1],1];
  const radius=w.thickness-1,flag=w.splat==="GLUE"?32:64;
  for(let i=0;i<=w.splatSize;i++){
    for(const [x,y] of [left,right]){
      for(let j=y-radius;j<=y+radius;j++)for(let k=x-radius;k<=x+radius;k++){
        if(k<0||k>=800||j<0||j>=450)continue;
        const idx=j*800+k,old=s.solid[idx];
        if(!old||(old&flag))continue;
        s.solid[idx]=(old&~96)|flag;
        s.onTint?.(k,j,w.tint,200);
      }
    }
    left=walkContour(s,...left,1,1);right=walkContour(s,...right,-1,1);
  }
}
function plasma(s,a,dt){
  const w=a.actor,fire=w.type==="fire"||w.type==="fog",scale=fire?50:20;
  if(!a.rest){
    if(w.weightless){a.x+=a.vx*dt*scale;a.y+=a.vy*dt*scale}
    else [a.x,a.y,a.vy]=s.engine.advancePlasma(a.x,a.y,a.vx,a.vy,dt,scale);
    if(a.x<0||a.x>=800)return false;
    if(a.y>=449||cell(s,a.x,a.y)){
      if(fire){
        a.rest=true;
        if(a.y>=449)a.y=449;
        else [a.x,a.y]=s.engine.backtrackPlasma(a.x,a.y,a.vx,a.vy);
      }
      else{
        if(a.y>=449){a.vy=-w.bounceImpulse}
        else{
          splat(s,a);
          [a.x,a.y]=s.engine.backtrackPlasma(a.x,a.y,a.vx,a.vy);
          const e=s.engine;
          e.contactX.value=a.x;e.contactY.value=a.y;
          const surface=outsideContact(s,a,true),incident=e.surfaceAngle(a.vy,a.vx)-surface;
          const reflected=e.surfaceAngle(-e.surfaceSin(incident),e.surfaceCos(incident))+surface;
          const impulse=w.bounceImpulse||Math.max(.8,Math.hypot(a.vx,a.vy));
          a.vx=e.surfaceCos(reflected)*impulse;a.vy=e.surfaceSin(reflected)*impulse;
          if(Math.abs(a.vx)<.05)a.vx=a.vx<0?-.05:.05;
          if(cell(s,a.x,a.y))return false;
        }
      }
    }
  }
  if(fire&&a.rest&&a.y<449&&!cell(s,a.x,a.y)){a.rest=false;a.vx=0;a.vy=0}
  if(w.damageRate)for(const [id,pose] of s.tanks.entries()){
    const [x,y]=damageCenter(pose);
    if(Math.hypot(a.x-x,a.y-y)>14+w.damageRadius)continue;
    s.burn[id]+=w.damageRate*dt;
    if(s.burn[id]>=1){const n=integer(s.burn[id]);s.burn[id]-=n;award(s,id,n)}
  }
  return a.age<=w.seconds;
}
export function advanceActor(s,a,dt,trigger){
  a.age+=dt;
  if(a.actor.animation)a.frame=Math.floor(a.age*a.actor.animation.speed)%a.actor.animation.frames.length;
  switch(a.actor.type){
    case "cruiser":return cruise(s,a,dt,trigger);
    case "lightning":{
      // 0x466910 tests the distance to the discharge once and expires
      // the actor after its 150-update lifetime (default at 0x466d8d).
      if(++a.clock===2){
        const dx=a.end[0]-a.x,dy=a.end[1]-a.y;
        for(const [id,pose] of s.tanks.entries()){
          const [cx,cy]=damageCenter(pose);
          const t=Math.max(0,Math.min(1,((cx-a.x)*dx+(cy-a.y)*dy)/(dx*dx+dy*dy||1)));
          if(Math.hypot(cx-a.x-dx*t,cy-a.y-dy*t)<10)award(s,id,a.actor.damage);
        }
      }
      return a.clock<=150;
    }
    case "zapper":{
      const {lowAlpha,highAlpha,flashRate}=a.actor;
      const interval=1/(2*(highAlpha-lowAlpha)*flashRate);
      a.clock+=dt;
      while(a.clock>interval){
        a.clock-=interval;a.alpha+=a.alphaDirection;
        if(a.alpha>highAlpha){a.alpha=highAlpha-1;a.alphaDirection=-1}
        if(a.alpha<lowAlpha){a.alpha=lowAlpha+1;a.alphaDirection=1}
      }
      return a.age<=a.actor.seconds;
    }
    case "fire":case "fog":case "superball":return plasma(s,a,dt);
    default:return grow(s,a,dt);
  }
}
