import {blastSprite} from "./blast-art.mjs";
import sprites from "./art/animated-shells.json" with {type:"json"};
import widths from "./art/arsenal.json" with {type:"json"};
import {weapons,volleys} from "./match.mjs";
const pngs=["tracer-labels","animated-shells","match","big-blast","shop","match-range","arsenal","three-blast","five-blast"];
const sources = ["range","sky","aim","arrows","angle","power","bar","controls","blast","hulls","barrels","end","weapon","second",...pngs];
export async function loadArt() {
  const images = await Promise.all(sources.map(async name => {
    const image = new Image();
    image.src = "./art/"+name+(pngs.includes(name)?".png":".webp");
    await image.decode();
    return [name,image];
  }));
  const [response,cursors] = await Promise.all([fetch("./art/controls.json"),fetch("./art/cursors.bin")]);
  if (!response.ok||!cursors.ok) throw Error("Could not load the controls");
  return {images:Object.fromEntries(images),buttons:await response.json(),cursors:new Uint8Array(await cursors.arrayBuffer())};
}

export class RangeDisplay {
  constructor(canvas,art,scene) {
    this.ctx=canvas.getContext("2d",{alpha:false,willReadFrequently:true});
    this.art=art.images;
    this.buttons=art.buttons;
    this.cursors=art.cursors;
    this.blastFrames=new Map();
    const mask=document.createElement("canvas");
    mask.width=40;mask.height=153;
    const maskContext=mask.getContext("2d");
    maskContext.drawImage(this.art["tracer-labels"],0,0);
    this.tracerMask=maskContext.getImageData(0,0,mask.width,mask.height).data;
    this.scene=scene;
    this.ground=document.createElement("canvas");
    this.ground.width=800;this.ground.height=450;
    this.g=this.ground.getContext("2d",{willReadFrequently:true});
    const strip=document.createElement("canvas");
    strip.width=1;strip.height=450;
    const sky=strip.getContext("2d");sky.drawImage(this.art.sky,0,0);
    this.sky=sky.getImageData(0,0,1,450).data;
    this.reset();
  }
  reset(scene=this.scene,mode="practice"){
    this.scene=scene;this.match=mode==="match";
    this.g.drawImage(this.match?this.art["match-range"]:this.art.range,0,0);
    this.pixels=this.g.getImageData(0,0,800,450);
    this.painted=new Uint8Array(800*450);
    let offset=0;
    for(const [i,n] of this.scene.terrain.runs.entries()){
      this.painted.fill(i%2,offset,offset+n);offset+=n;
    }
  }
  bind(state){
    state.onBlastStep=(b,eroded)=>{if(eroded)this.updateGround(state,b.x,b.actor.radius)};
    state.onDirtStep=changes=>this.dropSoil(state,changes);
  }
  dropSoil(state,changes){
    const rgba=new Uint32Array(this.pixels.data.buffer),sky=new Uint32Array(this.sky.buffer);
    let left=799,right=0,minY=449,maxY=0;
    for(const [x,top,bottom] of changes){
      left=Math.min(left,x);right=Math.max(right,x);minY=Math.min(minY,top);maxY=Math.max(maxY,bottom);
      for(let y=bottom;y>=top;y--){
        const i=y*800+x;this.painted[i]=state.solid[i];
        rgba[i]=this.painted[i]?rgba[i-800]:sky[y];
      }
    }
    this.g.putImageData(this.pixels,0,0,left,minY,right-left+1,maxY-minY+1);
  }
  updateGround(state,center,radius){
    const left=Math.max(0,Math.trunc(center)-radius+1),right=Math.min(799,Math.trunc(center)+radius);
    const rgba=new Uint32Array(this.pixels.data.buffer),sky=new Uint32Array(this.sky.buffer);
    for(let x=left;x<=right;x++){
      for(let y=449;y>=0;y--){
        const i=y*800+x;
        if(!state.solid[i]){
          if(this.painted[i]){rgba[i]=sky[y];this.painted[i]=0}
        }
      }
    }
    this.g.putImageData(this.pixels,0,0,left,0,right-left+1,450);
  }
  tile(name,n,cols,w,h,x,y,sourceWidth=w) {
    this.ctx.drawImage(this.art[name],n%cols*sourceWidth,Math.floor(n/cols)*h,w,h,x,y,w,h);
  }
  tracer(label,cx,cy){
    const x=Math.trunc(cx)-20,y=Math.trunc(cy)-8;
    const left=Math.max(0,x),top=Math.max(0,y);
    const w=Math.min(800,x+40)-left,h=Math.min(450,y+17)-top;
    if(w<=0||h<=0)return;
    const pixels=this.ctx.getImageData(left,top,w,h),row=(Number(label)/5+4)*17;
    for(let j=0;j<h;j++)for(let i=0;i<w;i++){
      const amount=this.tracerMask[((row+top-y+j)*40+left-x+i)*4];
      if(!amount)continue;
      const p=(j*w+i)*4;
      for(let k=p;k<p+3;k++)pixels.data[k]+=Math.trunc((255-pixels.data[k])*amount/255);
    }
    this.ctx.putImageData(pixels,left,top);
  }
  cursor(pointer,hot,busy){
    const w=busy?21:hot?29:20,h=busy?25:hot?35:24,offset=busy?5980:hot?1920:0;
    const x=Math.trunc(pointer.x)-1,y=Math.trunc(pointer.y)-1;
    const left=Math.max(x,0),top=Math.max(y,0),right=Math.min(800,x+w),bottom=Math.min(600,y+h);
    if(left>=right||top>=bottom)return;
    const pixels=this.ctx.getImageData(left,top,right-left,bottom-top);
    for(let j=top;j<bottom;j++)for(let i=left;i<right;i++){
      const a=offset+((j-y)*w+i-x)*4,b=((j-top)*pixels.width+i-left)*4,alpha=this.cursors[a+3];
      for(let c=0;c<3;c++)pixels.data[b+c]=Math.floor((this.cursors[a+c]*alpha+pixels.data[b+c]*(255-alpha))/255);
    }
    this.ctx.putImageData(pixels,left,top);
  }
  tank(pose,id,angle){
    const [x,y,slope]=pose,[ox,oy,os]=this.scene.tanks[id];
    if(x===ox&&y===oy&&slope===os){
      if(!this.match){this.tile("aim",angle+id*23*16,16,52,40,x-26,y-31);return}
      if(angle===(360-this.scene.tanks[id][3])%360){
        this.ctx.drawImage(this.art["match-range"],id*52,450,52,40,x-26,y-31,52,40);return;
      }
    }
    const k=Math.round(slope/5)%72,piv=(slope-90)*Math.PI/180;
    const cx=x+Math.trunc(7*Math.cos(piv)),cy=y+Math.trunc(7*Math.sin(piv))+7;
    this.ctx.save();
    this.ctx.translate(cx,cy);
    if(angle>180)this.ctx.scale(1,-1);
    this.tile("barrels",angle>180?360-angle:angle,16,48,48,-24,-28);
    this.ctx.restore();
    this.tile("hulls",k+id*72,16,48,48,x-24,y-28);
  }
  projectile(weapon,ball) {
    const positions=ball.trail;
    if(!positions.length)return;
    if(weapon.pixel){this.ctx.fillStyle="rgb("+weapon.trail.join(",")+")";this.ctx.fillRect(Math.trunc(ball.x),Math.trunc(ball.y),weapon.size+1,weapon.size+1);return}
    const samples=[];
    const length=weapon.trailLength;
    const size=weapon.size+1;
    for(let i=0;i<length;i++){
      const p=positions[positions.length-1-(length-1-i)*2];
      if(p)samples.push([Math.trunc(p[0]),Math.trunc(p[1]),1+(i+1)*Math.floor(255/length)]);
    }
    if(!samples.length)return;
    const left=Math.max(0,Math.min(...samples.map(p=>p[0]))),top=Math.max(0,Math.min(...samples.map(p=>p[1])));
    const right=Math.min(800,Math.max(...samples.map(p=>p[0]))+size),bottom=Math.min(450,Math.max(...samples.map(p=>p[1]))+size);
    if(right<=left||bottom<=top)return;
    const pixels=this.ctx.getImageData(left,top,right-left,bottom-top),base=pixels.data.slice();
    for(const [x,y,a] of samples)for(let j=y;j<y+size;j++)for(let i=x;i<x+size;i++){
      if(i<left||j<top||i>=right||j>=bottom)continue;
      const k=((j-top)*pixels.width+i-left)*4;
      for(let c=0;c<3;c++){const color=weapon.trail[c];pixels.data[k+c]=Math.trunc((base[k+c]*(255-a)+color*a)/255)}
    }
    this.ctx.putImageData(pixels,left,top);
  }
  score(value,right){
    const widths=[25,13,23,23,23,23,23,21,23,23],digits=String(value).split("").map(Number);
    const width=digits.reduce((n,d)=>n+widths[d],0),c=this.ctx;
    let x=right?793-width:5;
    c.fillStyle="#000";c.fillRect(right?600:0,33,200,26);
    for(const d of digits){c.drawImage(this.art.match,d*32,0,widths[d],26,x,33,widths[d],26);x+=widths[d]}
  }
  shop(s,ui){
    const c=this.ctx;c.drawImage(this.art.shop,0,0);
    const item=(w,x,y)=>{
      c.drawImage(this.art.arsenal,1,w*24,22,22,x,y,22,22);
      c.drawImage(this.art.arsenal,140,w*24,widths[w],23,x+25,y,widths[w],23);
    };
    s.pool.forEach((w,i)=>{if(w!==null)item(w,262+158*Math.floor(i/10),124+(i%10)*27)});
    s.draft.forEach((row,player)=>row.forEach((w,j)=>item(w,28+player*605,124+j*27)));
    const active=(s.draft[0].length+s.draft[1].length)%2;
    c.drawImage(this.art.match,275,90,55,31,active?565:177,190,55,31);
    c.save();if(active){c.translate(800,0);c.scale(-1,1)}
    c.drawImage(this.art.match,275,121,55,64,177,221,55,64);c.restore();
    if(ui.pointer)this.cursor(ui.pointer,!!ui.hover,false);
  }
  draw(s,ui,t){
    const c=this.ctx;
    if(s.pool){this.shop(s,ui);return}
    c.drawImage(this.art.range,0,450,800,150,0,450,800,150);
    c.drawImage(this.ground,0,0);
    if(s.turn===1){c.drawImage(this.art.second,0,1,800,150,0,450,800,150);c.drawImage(this.art.second,0,0,800,1,0,31,800,1)}
    c.save();c.beginPath();c.rect(0,0,800,450);c.clip();
    s.tanks.forEach((p,i)=>this.tank(p,i,Math.round(ui.angles[i])%360));
    const busy=s.inVolley||s.move;
    if(!busy&&!ui.mode&&!s.finished){
      const id=s.turn,[x,y]=s.tanks[id];
      const phase=t-ui.turnTime<25?60:Math.floor((t-ui.turnTime)/25)%60;
      this.tile("arrows",phase+id*72,12,26,60,x-13,y-(id?65:60));
    }
    for(const ball of s.balls){
      this.projectile(ball.actor,ball);
      const animation=ball.actor.animation;
      if(animation){
        const [sx,sy,w,h]=sprites[animation.frames[ball.frame]];
        c.save();c.translate(Math.trunc(ball.x),Math.trunc(ball.y));
        if(animation.rotate)c.rotate(Math.atan2(ball.vy,ball.vx)+Math.PI/2);
        c.imageSmoothingEnabled=false;
        c.drawImage(this.art["animated-shells"],sx,sy,w,h,animation.rotate?-Math.trunc(w/2):-animation.offsetX,
          animation.rotate?-Math.trunc(h/2):-animation.offsetY,w,h);
        c.restore();
      }
    }
    for(const b of s.blasts){
      const a=b.actor,size=a.radius*2+2,x=Math.trunc(b.x)-a.radius,y=Math.trunc(b.y)-a.radius;
      if(a.atlas)this.tile(a.atlas,b.phase,8,size,size,x,y);
      else {
        let cached=this.blastFrames.get(b);
        if(cached?.phase!==b.phase){
          cached={phase:b.phase,image:blastSprite(a,b.phase)};
          this.blastFrames.set(b,cached);
        }
        c.drawImage(cached.image,x,y);
      }
    }
    for(const b of this.blastFrames.keys())if(!s.blasts.includes(b))this.blastFrames.delete(b);
    for(const m of s.markers){
      this.tracer(m.actor.label,m.x,m.y);
    }
    c.restore();
    const hot=busy?null:ui.pressed||ui.hover,btn=this.buttons[hot];
    if(btn){const [sx,sy]=btn.states[ui.pressed?1:0];c.drawImage(this.art.controls,sx,sy,btn.w,btn.h,btn.x,btn.y,btn.w,btn.h)}
    if(hot==="weapon")c.drawImage(this.art.range,244,553,134,25,244,553,134,25);
    this.tile("angle",Math.round(ui.angles[s.turn])%360,16,42,20,502,497);
    this.tile("power",Math.round(ui.powers[s.turn]),16,42,20,502,564,43);
    this.tile("bar",Math.round(ui.powers[s.turn]),8,120,15,437,539);
    if(ui.mode==="angle"||ui.mode==="power"){
      const y=ui.mode==="angle"?497:564,im=c.getImageData(502,y,42,20);
      for(let i=0;i<im.data.length;i+=4)if(im.data[i]>30){im.data[i+2]=0;im.data[i]>>=1;im.data[i+1]>>=1}
      c.putImageData(im,502,y);
    }
    if(ui.mode==="angle"){
      const [x,y,slope]=s.tanks[s.turn],r=-ui.angles[s.turn]*Math.PI/180,p=(slope-90)*Math.PI/180;
      const dx=Math.round(x+7*Math.cos(p)+75*Math.cos(r)),dy=Math.round(y+7*Math.sin(p)+75*Math.sin(r));
      c.fillStyle="#fff";for(const [a,b,w,h] of [[-8,0,5,1],[4,0,5,1],[0,-8,1,5],[0,4,1,5]])c.fillRect(dx+a,dy+b,w,h);
    }
    const selected=s.selected[s.turn];
    if(selected>0)c.drawImage(this.art.arsenal,0,24*selected,134,23,244,555,134,23);
    if(s.scores[0])this.score(s.scores[0],false);
    if(s.scores[1])this.score(s.scores[1],true);
    if(s.mode==="match"){
      const volley=s.finished?volleys:Math.min(volleys-1,Math.floor((s.shots-(s.inVolley?1:0))/2));
      c.drawImage(this.art.match,0,26+volley*20,120,20,340,0,120,20);
      this.tile("power",s.moves[s.turn],16,42,20,264,495,43);
      if(s.finished){
        c.fillStyle="#000";c.fillRect(245,556,132,21);
        c.drawImage(this.art.match,0,250,332,74,234,198,332,74);
      }
    }
    if(ui.mode==="weapon"){
      c.drawImage(this.art.weapon,236,438);
      c.fillStyle="#000";c.fillRect(245,462,132,115);
      for(let row=0;row<5;row++){
        const i=ui.weaponItems[ui.weaponTop+row];
        if(i===undefined)continue;
        const y=462+row*23,width=widths[i];
        c.drawImage(this.art.arsenal,1,i*24,22,22,245,y,22,22);
        c.drawImage(this.art.arsenal,i===selected?254:140,i*24,width,23,323-Math.ceil(width/2),y,width,23);
      }
    }
    if(ui.dialog)c.drawImage(this.art.end,280,205);
    if(ui.pointer&&(!ui.mode||ui.mode==="weapon"||ui.dialog)){
      this.cursor(ui.pointer,ui.hover,busy);
    }
  }
}
