import rotation from "./engine/tank-offsets.json" with {type:"json"};
import {queueDirtBounds} from "./soil.mjs";

const vector=a=>rotation[(a%360+360)%360].map(n=>n/1024);

// 0x448f70 backs up from the trigger origin along its integer-degree direction.
export function startCutter(e,actor,x,y,angle,power){
  const radians=angle/180*3.1415927,speed=power*.11+1.1;
  const direction=Math.trunc(e.surfaceAngle(e.surfaceSin(radians)*speed,e.surfaceCos(radians)*speed)*180/3.1415927);
  const [dx,dy]=vector(direction);
  return {actor,x:x-dx*actor.backup,y:y-dy*actor.backup,dx,dy,side:vector(direction-90),opposite:vector(direction+90),
    bounds:[Math.trunc(x),Math.trunc(y),Math.trunc(x),Math.trunc(y)],age:0,depth:0,lines:[]};
}

// 0x428e10 uses different error thresholds on X-major and Y-major lines.
export function rasterLine([x,y,endX,endY],plot){
  const dx=Math.abs(endX-x),dy=Math.abs(endY-y),sx=Math.sign(endX-x),sy=Math.sign(endY-y);
  const horizontal=dx>dy,major=Math.max(dx,dy),minor=Math.min(dx,dy);
  let error=0;
  for(let i=0;i<=major;i++){
    plot(x,y);error+=minor;
    if(error>(horizontal?major:0)){error-=major;if(horizontal)y+=sy;else x+=sx}
    if(horizontal)x+=sx;else y+=sy;
  }
}
export function advanceCutter(s,cut,dt){
  cut.age+=dt;
  if(cut.age<=1/120)return true;
  cut.age-=1/120;cut.depth++;
  const a=cut.actor,width=a.minWidth+(a.maxWidth-a.minWidth)/a.height*cut.depth;
  const x=cut.x+cut.dx*cut.depth,y=cut.y+cut.dy*cut.depth;
  const endpoint=(v,i)=>((i?y:x)+v*width*.5)|0;
  const line=[...cut.side.map(endpoint),...cut.opposite.map(endpoint)];
  cut.lines.unshift(line);
  if(cut.lines.length>a.thickness)cut.lines.pop();
  rasterLine(line,(px,py)=>{
    for(let j=Math.max(0,py);j<=Math.min(449,py+1);j++)
      for(let i=Math.max(0,px);i<=Math.min(799,px+1);i++)s.solid[j*800+i]=0;
  });
  const b=cut.bounds;
  b[0]=Math.min(b[0],line[0],line[2]);b[1]=Math.min(b[1],line[1],line[3]);
  b[2]=Math.max(b[2],line[0],line[2]);b[3]=Math.max(b[3],line[1],line[3]);
  s.revision++;s.onCut?.(line);
  if(cut.depth<a.height)return true;
  if(a.dirt)queueDirtBounds(s,b[0]-6,b[1]-6,b[2]+6,b[3]+6);
  return false;
}

// 0x4494c0. Near maximum depth the PC shortens and darkens the remaining band.
export function cutterStripes(cut){
  const {actor,depth,lines}=cut,count=Math.min(actor.thickness,actor.height-depth);
  const change=actor.high.map((c,i)=>Math.trunc((c-actor.low[i])/actor.thickness));
  return lines.slice(0,count).map((line,i)=>[...line,
    ...actor.high.map((c,k)=>c-(actor.thickness-count+i)*change[k])]);
}
