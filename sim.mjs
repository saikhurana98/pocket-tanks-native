// Constants fitted to the recorded 60-degree, power-20 Single Shot.
// Coordinates use the original 800 x 450 playfield. Time is in seconds.
export const W=800, H=450, DT=1/120;
const speedPerPower=8.221, gravity=271.02;
export function setup(heights, positions=[47,683]) {
  const solid=new Uint8Array(W*H);
  for(let x=0;x<W;x++) for(let y=heights[x];y<H;y++) solid[y*W+x]=1;
  return {solid,positions,turn:0,scores:[0,0],shots:0,ball:null,impact:null,trail:[]};
}
export function floorAt(s,x) {
  for(let y=0;y<H;y++) if(s.solid[y*W+x]) return y;
  return H;
}
export function launch(s,angle,power) {
  if(s.ball || s.impact) return false;
  const rad=angle*Math.PI/180,x=s.positions[s.turn],y=floorAt(s,x)-14.15;
  s.ball={x:x+14*Math.cos(rad),y:y-14*Math.sin(rad),
    vx:power*speedPerPower*Math.cos(rad),vy:-power*speedPerPower*Math.sin(rad)};
  s.shots++; s.trail=[]; return true;
}
function endTurn(s) {s.ball=null;s.impact=null;s.turn=1-s.turn;s.trail=[];}
export function step(s) {
  if(s.impact) {s.impact.age+=DT;if(s.impact.age>=0.85) endTurn(s);return;}
  const b=s.ball;if(!b)return;
  const dx=b.vx*DT,dy=b.vy*DT+0.5*gravity*DT*DT;
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))));
  for(let n=1;n<=steps;n++){
    const x=Math.round(b.x+dx*n/steps),y=Math.round(b.y+dy*n/steps);
    if(x<0||x>=W||y>=H){endTurn(s);return;}
    if(y>=0 && s.solid[y*W+x]){
      for(let row=Math.max(0,y-23);row<Math.min(H,y+23);row++)
        for(let col=Math.max(0,x-23);col<Math.min(W,x+23);col++)
          if((col-x+0.5)**2+(row-y+0.75)**2<=21.25**2) s.solid[row*W+col]=0;
      // Only the reference miss is calibrated. Nearby tank hits award practice points.
      const other=s.positions[1-s.turn];
      if(Math.hypot(x-other,y-floorAt(s,other)+5)<28) s.scores[s.turn]+=10;
      s.impact={x,y,age:0};s.ball=null;return;
    }
  }
  b.x+=dx;b.y+=dy;b.vy+=gravity*DT;s.trail.push([b.x,b.y]);if(s.trail.length>10)s.trail.shift();
}
