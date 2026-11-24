const directions=[[0,-1],[1,0],[0,1],[-1,0]];
function solid(s,x,y){
  return s.solid[Math.max(0,Math.min(449,y))*800+Math.max(0,Math.min(799,x))];
}
// The original walks three occupied neighbors in each direction along the
// impact surface (0x478dd0 and 0x4794a0). Each side keeps its own heading.
function follow(s,x,y,heading,hand){
  for(let step=0;step<3;step++){
    let next=2;
    for(const turn of [hand,0,-hand,2]){
      const id=(heading+turn+4)%4,[dx,dy]=directions[id];
      if(solid(s,x+dx,y+dy)){next=id;break}
    }
    heading=next;x+=directions[next][0];y+=directions[next][1];
  }
  return [x,y];
}
export function outsideContact(s,b){
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
  const [ax,ay]=follow(s,x,y,first,1),[bx,by]=follow(s,x,y,(first+2)%4,-1);
  const normal=e.surfaceAngle(ay-by,ax-bx)+1.570795;
  b.x=e.x.value=e.surfaceCos(normal)+cx+sx;
  b.y=e.y.value=e.surfaceSin(normal)+cy+sy;
}
