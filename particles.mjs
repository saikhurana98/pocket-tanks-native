// The particle system has its own CRT random stream (0x4b3b6f). Drawing a
// particle never advances the weapon shop or projectile spread generator.
function random1000(fx){
  fx.seed=(Math.imul(fx.seed,214013)+2531011)>>>0;
  return ((fx.seed>>>16)&32767)%1000;
}

export function startEmitter(fx,definition,x,y){
  const source={definition,x,y,age:0,clocks:definition.nodes.map(()=>0)};
  fx.emitters.push(source);
  return source;
}

// The stationary radial nodes in these base packs have no rotating pivot.
// 0x41c2aa draws speed and angle separately for each particle.
export function emitParticles(s,dt){
  const fx=s.fx,e=s.engine;
  fx.emitters=fx.emitters.filter(source=>{
    const {definition,x,y}=source;
    if(source.stopped)return false;
    const pivots=[];
    definition.nodes.forEach(([rate,low,high,spread,color,transform],i)=>{
      let px=x,py=y,direction=0;
      if(transform){
        const parent=pivots[transform.parent];
        if(parent)[px,py]=parent;
        const radians=3.1415927/180;
        const pivot=(transform.pivot+source.age*transform.spin)*radians;
        px+=transform.distance*e.surfaceCos(pivot);py+=transform.distance*e.surfaceSin(pivot);
        direction=(transform.angle+source.age*transform.rotation)*radians;
      }
      pivots.push([px,py]);
      const interval=1/rate;
      source.clocks[i]+=dt;
      while(source.clocks[i]>interval){
        source.clocks[i]-=interval;
        const speed=random1000(fx)*((low-high)/1000)+low;
        const angle=random1000(fx)*(spread/1000)-spread*.5+direction;
        // 0x41c344 and 0x41c35b add the stationary source velocity.
        const particle={x:px,y:py,vx:e.surfaceCos(angle)*speed+0,vy:e.surfaceSin(angle)*speed+0,color,alpha:transform?.alpha??255};
        fx.particles.push(particle);s.onParticle?.(particle);
      }
    });
    source.age+=dt;
    return source.age<definition.seconds;
  });
}

// 0x4262f0 advances this pool every other tick with the sum of both tick
// durations. Its opacity timer counts down independently at 384 Hz.
export function moveParticles(fx,dt){
  fx.ticks++;
  if(fx.ticks%2){fx.previous=dt;return}
  const elapsed=dt+fx.previous;
  fx.clock+=elapsed;
  let fade=0;
  while(fx.clock>1/384){fx.clock-=1/384;fade++}
  if(!fx.particles.length)return;
  fx.particles=fx.particles.filter(p=>{
    p.alpha-=fade;
    if(p.alpha<=40)return false;
    p.x+=p.vx*elapsed;p.y+=p.vy*elapsed;
    return true;
  });
}

// 0x4265dd skips solid cells. The 32-bit framebuffer blends each channel
// with an eight-bit denominator at 0x42d4d0.
export function blendParticle(data,pos,color,alpha){
  for(let i=0;i<3;i++)data[pos+i]+=((color[i]-data[pos+i])*alpha)>>8;
}

export function paintParticles(ctx,s){
  if(!s.fx.particles.length)return;
  const visible=[];
  let left=800,top=450,right=-1,bottom=-1;
  for(const p of s.fx.particles){
    const x=Math.trunc(p.x),y=Math.trunc(p.y);
    if(x<0||x>=800||y<0||y>=450||s.solid[y*800+x])continue;
    visible.push([p,x,y]);left=Math.min(left,x);right=Math.max(right,x);
    top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  if(!visible.length)return;
  const pixels=ctx.getImageData(left,top,right-left+1,bottom-top+1);
  for(const [p,x,y] of visible){
    const pos=((y-top)*pixels.width+x-left)*4;
    blendParticle(pixels.data,pos,p.color,p.alpha);
  }
  ctx.putImageData(pixels,left,top);
}
