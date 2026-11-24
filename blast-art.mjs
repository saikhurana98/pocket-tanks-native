const rings=[];
function outline(radius){
  if(rings[radius])return rings[radius];
  const points=[];
  let x=0,y=radius,error=radius*radius,threshold=error-radius;
  do{
    points.push(x,y,-x,y,x,-y,-x,-y,y,x,-y,x,y,-x,-y,-x);
    x++;error+=1-2*x;
    if(error<=threshold){y--;threshold-=2*y}
  }while(x<=y);
  rings[radius]=points;
  return points;
}
// The original keeps separate drawing and clearing fronts at 0x44bf94 and
// 0x44c373. Colors cycle between those fronts even after growth stops.
export function blastColor(actor,phase,r){
  if(r>=phase||r>=actor.radius-1)return -1;
  const cleared=Math.max(0,phase-actor.eraseDelay-1);
  if(actor.inward?(r>0&&r>=actor.radius-cleared):r<cleared)return -1;
  return (phase-r-1)%actor.colors.length;
}
export function blastSprite(actor,phase){
  const canvas=document.createElement("canvas"),size=2*actor.radius+2;
  canvas.width=canvas.height=size;
  const ctx=canvas.getContext("2d"),frame=ctx.createImageData(size,size);
  for(let r=0;r<actor.radius-1;r++){
    const color=blastColor(actor,phase,r);
    if(color<0)continue;
    const [red,green,blue]=actor.colors[color],points=outline(r);
    for(let i=0;i<points.length;i+=2){
      const at=((actor.radius+points[i+1])*size+actor.radius+points[i])*4;
      for(let k=at;k<=at+4;k+=4){frame.data[k]=red;frame.data[k+1]=green;frame.data[k+2]=blue;frame.data[k+3]=255}
    }
  }
  ctx.putImageData(frame,0,0);
  return canvas;
}
