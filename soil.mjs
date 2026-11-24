const width=800,height=450,interval=1/30;
const rockInterval=.774;

// Each bound in 0x447a90 follows empty cells down to earth, then follows
// solid cells upward to the empty cell immediately above that layer.
function edge(s,x,y){
  while(y<height-1&&!s.solid[y*width+x])y++;
  while(y>0&&s.solid[y*width+x])y--;
  return y;
}
export function queueDirt(s,blast,radius){
  const x=Math.trunc(blast.x),y=Math.trunc(blast.y);
  queueDirtBounds(s,x-radius,y-radius,x+radius,y+radius);
}
export function queueDirtBounds(s,left,upper,right,lower){
  for(let col=Math.max(0,left);col<=Math.min(width-1,right);col++){
    const old=s.dirt.get(col);
    const top=edge(s,col,Math.max(0,Math.min(old?.[0]??height-1,upper)));
    const bottom=edge(s,col,Math.min(height-1,Math.max(old?.[1]??0,lower)));
    if(top<bottom)s.dirt.set(col,[top,bottom]);
    else s.dirt.delete(col);
  }
}
export function advanceDirt(s,dt){
  s.dirtAge+=dt;
  if(s.dirtAge>interval){
    s.dirtFalling=s.dirt.size>0;
    dropColumns(s);
  }
  // 0x448046 retains the last column scan's activity between 30 Hz updates.
  if(!s.dirtFalling){
    s.rockTime=rockInterval;
    s.rockIndex=5;
    return;
  }
  s.rockTime+=dt;
  if(s.rockTime>=rockInterval){
    s.rockTime-=rockInterval;
    s.rockIndex=(s.rockIndex+1)%6;
    s.onSound?.("rocks_"+(s.rockIndex+1)+".wav");
  }
}
function dropColumns(s){
  s.dirtAge-=interval;
  const changes=[];
  for(const [x,bounds] of s.dirt){
    let [top,bottom]=bounds;
    s.engine.dropColumn(x,top,bottom);
    changes.push([x,top,bottom]);top++;
    while(bottom>top&&s.solid[bottom*width+x])bottom--;
    if(top>=bottom)s.dirt.delete(x);
    else {bounds[0]=top;bounds[1]=bottom}
  }
  if(changes.length)s.onDirtStep?.(changes);
}
