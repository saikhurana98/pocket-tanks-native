import frames from "./art/plasma-frames.json" with {type:"json"};

const width=800,height=450,pitch=width+2;
const colors={TRANS:[255,170,0],GAS:[0,200,255],FOG:[255,255,255]};

function stamp(fx,key,ball,animation,index){
  const [w,h,indices]=frames[animation.frames[index]];
  const x=Math.trunc(ball.x)-Math.floor(w/2)-animation.offsetX;
  const y=Math.trunc(ball.y)-Math.floor(h/2)-animation.offsetY;
  if(x+w<=0||y+h<=0||x>=width||y>=height)return;
  const fields=fx.plasma??={};
  const field=fields[key]??={heat:new Uint8Array(pitch*(height+2)),left:width,top:height,right:0,bottom:0};
  for(let j=Math.max(0,-y);j<Math.min(h,height-y);j++){
    let k=(y+j+1)*pitch+x+1;
    for(let i=Math.max(0,-x);i<Math.min(w,width-x);i++){
      const value=indices[j*w+i];
      if(value)field.heat[k+i]=value;
    }
  }
  field.left=Math.min(field.left,x);field.top=Math.min(field.top,y);
  field.right=Math.max(field.right,x+w);field.bottom=Math.max(field.bottom,y+h);
}

function diffuse(field,fire){
  const left=Math.max(0,field.left-1),right=Math.min(width,field.right+1);
  const top=Math.max(0,field.top-1),bottom=Math.min(height,field.bottom+1);
  Object.assign(field,{left:width,top:height,right:0,bottom:0});
  const heat=field.heat;
  // 0x428020 processes rows in place, left to right. Fire draws heat upward,
  // while gas includes all four neighbours.
  for(let y=top;y<bottom;y++){
    let k=(y+1)*pitch+left+1;
    for(let x=left;x<right;x++,k++){
      const sum=heat[k]+heat[k-1]+heat[k+1]+heat[k+pitch];
      const value=fire?sum>>2:Math.floor((sum+heat[k-pitch])/5);
      heat[k]=value;
      if(value){
        if(x<field.left)field.left=x;
        if(y<field.top)field.top=y;
        if(x>=field.right)field.right=x+1;
        if(y>=field.bottom)field.bottom=y+1;
      }
    }
  }
}

export function advancePlasmaFields(fx,balls,dt,projectiles=[]){
  fx.plasmaClock=(fx.plasmaClock??0)+dt;
  while(fx.plasmaClock>.01){
    fx.plasmaClock-=.01;
    for(const ball of balls){
      const key=ball.actor.blend;
      if(!Object.hasOwn(colors,key))continue;
      if(ball.actor.animation)stamp(fx,key,ball,ball.actor.animation,ball.frame);
    }
    for(const ball of projectiles){
      const p=ball.actor.plasma;
      if(p)stamp(fx,p.blend,ball,p,Math.floor(ball.age*p.speed)%p.frames.length);
    }
    if(!fx.plasma)continue;
    for(const [key,field] of Object.entries(fx.plasma)){
      diffuse(field,key==="TRANS");
      if(field.right<=field.left)delete fx.plasma[key];
    }
    if(!Object.keys(fx.plasma).length)fx.plasma=null;
  }
}

export function paintPlasma(ctx,fx){
  if(!fx.plasma)return;
  for(const key of Object.keys(colors)){
    const field=fx.plasma[key];if(!field)continue;
    const {left,top,right,bottom,heat}=field,rgb=colors[key];
    const pixels=ctx.getImageData(left,top,right-left,bottom-top);
    let pos=0;
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++,pos+=4){
      const alpha=heat[(y+1)*pitch+x+1]*8;
      if(alpha)for(let c=0;c<3;c++)pixels.data[pos+c]+=((rgb[c]-pixels.data[pos+c])*alpha)>>8;
    }
    ctx.putImageData(pixels,left,top);
  }
}
