const fs=require("node:fs"),path=require("node:path");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||"playwright-core");
const [url,first,end,tag]=process.argv.slice(2);
if(!url||!first||!end||!tag||!process.argv[6])throw Error("Pass URL, first weapon index, exclusive end, empty output directory, and PC capture directory");
const dir=path.resolve(process.argv[6]),output=path.resolve(tag);
fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.EDGE_PATH});
 try{
 const page=await browser.newPage();
 await page.goto(new URL("?mode=practice",url).href);
 await page.locator("#fire").waitFor({timeout:90000});
 await page.evaluate(async()=>{
  const {loadEngine,setup,launch,step}=await import("./sim.mjs"),{RangeDisplay,loadArt}=await import("./presentation.mjs");
  const range=await(await fetch("./range.json")).json(),art=await loadArt(),engine=await loadEngine(),board=document.createElement("canvas");
  board.width=800;board.height=600;
  window.compare=async function(r,compressed){
   const bytes=Uint8Array.from(atob(compressed),c=>c.charCodeAt(0)),reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
   const scene={...range,...r.initial,tanks:r.tanks,seed:r.seed,turn:r.turn,fxSeed:r.fxSeed??r.seed};
   const display=new RangeDisplay(board,art,scene),s=setup(engine,scene);
   if(r.initial?.ground){
     const image=new Image();image.src="data:image/png;base64,"+r.initial.ground;await image.decode();
     const c=document.createElement("canvas");c.width=800;c.height=450;const ctx=c.getContext("2d");ctx.drawImage(image,0,0);
     const ground=ctx.getImageData(0,0,800,450).data,back=display.pixels.data;
     for(let j=0;j<360000;j++){
       if(ground[4*j+3])back.set(ground.subarray(4*j,4*j+4),4*j);
       else if(j>=800*60){const y=Math.floor(j/800);back.set(display.sky.subarray(y*4,y*4+4),4*j)}
     }
     display.g.putImageData(display.pixels,0,0);
   }
   display.bind(s);s.selected[s.turn]=r.id;
   const sounds=[],events=[];
   s.onSound=file=>sounds.push([s.tick+1,file]);
   s.onTrigger=(...args)=>events.push([events.length?s.tick+1:-1,...args]);
   const angles=r.tanks.map(t=>360-t[3]),powers=r.tanks.map(t=>t[4]);
   launch(s,angles[r.turn],powers[r.turn]);
   let time=0,pos=0,buffer=new Uint8Array(0),eof=false;
   const pc=new Uint32Array(360000),previousPc=pc.slice(),counts=[],pcSounds=r.sounds.map(([tick,file,caller])=>[tick,file.toLowerCase().replaceAll("\\","/").replace(/^.*?weapdata\//,"").replace(/^sfx\//,""),caller]);
   let previousWeb=null,firstImages;
   const regions={flight:[0,0,0],impact:[0,0,0]};
   async function take(n){
    while(buffer.length-pos<n){
     const next=await reader.read();
     if(next.done){eof=true;if(buffer.length===pos)return null;throw Error("Truncated frame")}
     const merged=new Uint8Array(buffer.length-pos+next.value.length);merged.set(buffer.subarray(pos));merged.set(next.value,buffer.length-pos);pos=0;buffer=merged;
    }
    // Copy to a word-aligned buffer across compressed stream boundaries.
    const words=new Int32Array(buffer.slice(pos,pos+n).buffer);pos+=n;return words;
   }
   while(!eof){
    const h=await take(8);if(!h)break;
    const [tick,length]=h,words=await take(length*4);let i=0;
    while(i<length){const start=words[i++],size=words[i++];pc.set(words.subarray(i,i+size),start);i+=size}
    while(time<tick){step(s);time++}
    display.draw(s,{angles,powers,turnTime:0},Math.max(0,time*4));
    const im=display.ctx.getImageData(0,0,800,450),actual=new Uint32Array(im.data.buffer);
    if(!counts.length && r.debug){
      const c=document.createElement("canvas");c.width=800;c.height=450;const ctx=c.getContext("2d");
      ctx.putImageData(new ImageData(new Uint8ClampedArray(pc.buffer),800,450),0,0);
      firstImages=[c.toDataURL(),board.toDataURL()];
    }
    let different=0,airborne=0,belowScore=0,changedMismatch=0,changed=0;
    for(let j=0;j<360000;j++){
      const moving=previousWeb && (pc[j]!==previousPc[j]||actual[j]!==previousWeb[j]);
      if(moving)changed++;
      if(actual[j]!==pc[j]){different++;if(!s.solid[j])airborne++;if(j>=800*60)belowScore++;if(moving)changedMismatch++}
    }
    const check=(region,x,y,radius)=>{
      const x0=Math.max(0,Math.trunc(x)-radius),y0=Math.max(0,Math.trunc(y)-radius);
      const x1=Math.min(800,Math.trunc(x)+radius+1),y1=Math.min(450,Math.trunc(y)+radius+1);
      if(x0>=x1||y0>=y1)return;
      let errors=0;for(let row=y0;row<y1;row++)for(let col=x0;col<x1;col++){const j=row*800+col;if(pc[j]!==actual[j])errors++}
      region[0]++;if(!errors)region[1]++;region[2]+=errors;
    };
    for(const ball of s.balls)check(regions.flight,ball.x,ball.y,12);
    for(const blast of s.blasts)check(regions.impact,blast.x,blast.y,blast.actor.radius+1);
    counts.push([tick,different,airborne,belowScore,changed,changedMismatch]);
    previousWeb=actual;previousPc.set(pc);
   }
   while(s.inVolley && time<30000){step(s);time++}
   const ticks=r.events.every((e,i)=>events[i]&&e[0]===events[i][0]&&e[1].toLowerCase()===events[i][1]&&e.slice(2).every((n,j)=>Math.abs(n-events[i][j+2])<1e-8))&&r.events.length===events.length;
   return {name:r.name,id:r.id,frames:counts.length,exactFrames:counts.filter(f=>!f[1]).length,counts,regions,eventsMatch:ticks,pcEvents:r.events,nativeEvents:events,pcSounds,nativeSounds:sounds,finished:!s.inVolley,firstImages};
  };
 });
 for(let id=+first;id<+end;id++){
  const dest=path.join(output,id+".json");if(fs.existsSync(dest))throw Error("Result already exists: "+dest);
  const ref=path.join(dir,id+".json");if(!fs.existsSync(ref))throw Error("Missing PC capture: "+ref);
  const r=JSON.parse(fs.readFileSync(ref)),encoded=fs.readFileSync(path.join(dir,id+".frames.gz")).toString("base64");
  r.debug=Boolean(process.env.PT_FRAME_DEBUG);
  const result=await page.evaluate(([r,encoded])=>window.compare(r,encoded),[r,encoded]);
  if(result.firstImages){result.firstImages.forEach((data,i)=>fs.writeFileSync(path.join(output,id+"-"+i+".png"),Buffer.from(data.split(",")[1],"base64")));delete result.firstImages}
  if(result.frames!==r.frames)throw Error("Lost frame in "+r.name);
  fs.writeFileSync(dest,JSON.stringify(result));console.log(id,r.name,result.exactFrames+"/"+result.frames,result.eventsMatch,result.pcSounds.length,result.nativeSounds.length);
 }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

