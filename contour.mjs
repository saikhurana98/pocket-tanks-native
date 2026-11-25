const directions=[[0,-1],[1,0],[0,1],[-1,0]];
function solid(s,x,y){
  return s.solid[Math.max(0,Math.min(449,y))*800+Math.max(0,Math.min(799,x))];
}
// The original walks three occupied neighbors in each direction along the
// impact surface (0x478dd0 and 0x4794a0). Each side keeps its own heading.
export function walkContour(s,x,y,heading,hand,steps){
  for(let step=0;step<steps;step++){
    let next=2;
    for(const turn of [hand,0,-hand,2]){
      const id=(heading+turn+4)%4,[dx,dy]=directions[id];
      if((heading===2&&y>449&&turn===hand)||solid(s,x+dx,y+dy)){next=id;break}
    }
    heading=next;x+=directions[next][0];y+=directions[next][1];
  }
  return [x,y,heading];
}
export function outsideContact(s,b,bouncing=false){
  const e=s.engine,sx=b.vx/20,sy=b.vy/20;
  const cx=Math.trunc(e.contactX.value)+.5,cy=Math.trunc(e.contactY.value)+.5;
  const x=Math.trunc(cx+sx),y=Math.trunc(cy+sy);
  // Entry orientations at 0x479fe0 and 0x47a150.
  let first=3;
  if(solid(s,x,y-1)){
    if(!solid(s,x-1,y))first=2;
    else if(!solid(s,x,y+1))first=1;
    else if(!solid(s,x+1,y))first=0;
  }
  const [ax,ay]=walkContour(s,x,y,first,1,3),[bx,by]=walkContour(s,x,y,(first+2)%4,-1,3);
  const tangent=e.surfaceAngle(ay-by,ax-bx),normal=tangent+1.570795;
  b.x=e.x.value=e.surfaceCos(normal)+cx+(bouncing?0:sx);
  b.y=e.y.value=e.surfaceSin(normal)+cy+(bouncing?0:sy);
  return tangent;
}

// 0x434e28 reflects at the bottom edge. 0x43540b uses a terrain tangent
// and reflects the velocity in its local coordinate system.
export function rebound(s,b,bottom,rubber){
  const e=s.engine;
  let angle;
  if(bottom)angle=e.surfaceAngle(-Math.abs(b.vy),b.vx);
  else{
    const tangent=outsideContact(s,b,true);
    const incident=e.surfaceAngle(b.vy,b.vx)-tangent;
    angle=e.surfaceAngle(-e.surfaceSin(incident),e.surfaceCos(incident))+tangent;
  }
  const speed=Math.sqrt(b.vx*b.vx+b.vy*b.vy);
  const impulse=rubber?speed*.5:(b.actor.bounceImpulse||Math.max(.8,speed));
  b.vx=e.vx.value=e.surfaceCos(angle)*impulse;
  b.vy=e.vy.value=e.surfaceSin(angle)*impulse;
  if(rubber){b.rubberHits=(b.rubberHits??0)+1;s.onSound?.("rubberbullet.wav")}
  else{b.bounces--;if(b.actor.bounceSound)s.onSound?.(b.actor.bounceSound)}
  return (rubber&&(impulse<.5||b.rubberHits>20))||(!bottom&&Boolean(solid(s,Math.trunc(b.x),Math.trunc(b.y))));
}
