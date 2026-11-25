import widths from "./art/menu-font.json" with {type:"json"};
import smallFont from "./art/menu-credits.json" with {type:"json"};

// Text-group records at 0x4ed380 and 0x4ed650. The PC counts spaces for
// alignment but only queues actors for visible glyphs.
const modes=[
  ["1 PLAYER",90,"left",true,.1875],["2 PLAYERS",140,"right",false,.1666],
  ["LAN GAME",190,"left",true,.123],["TARGET PRACTICE",240,"right",false,.1],
  ["RETURN TO TITLE",290,"left",true,.1],["OPTIONS",390,"bottom",false,.1]
];

function row(text,x,y,align,side,reverse,interval,acceleration,ink){
  const letters=[...text.toUpperCase()].map(ch=>({ch,w:widths[ch.charCodeAt(0)]??20}));
  const span=letters.reduce((sum,letter)=>sum+letter.w+1,0);
  if(align==="center")x-=Math.floor(span/2);
  if(align==="right")x-=span;
  const glyphs=[];
  for(const {ch,w} of letters){
    if(ch!==" "){
      const originX=side==="left"?-w:side==="right"?799:x;
      const originY=side==="top"?-38:side==="bottom"?449:y;
      glyphs.push({ch,x,y,w,originX,originY,ink});
    }
    x+=w+1;
  }
  if(reverse)glyphs.reverse();
  return {glyphs,interval,acceleration};
}

export function menuGroups(page,player,colorName,colorInk,editing){
  if(page==="mode")return modes.map(([text,y,side,reverse,interval])=>
    row(text,400,y,"center",side,reverse,interval,3000));
  return [
    row("Player "+page.slice(-1),400,90,"center","top",false,.1,2000,"#aaa"),
    row("NAME:",385,165,"right","left",true,.1,2000),
    row(editing?"":player.name,415,165,"left","right",false,.1,2000,"#fff"),
    row("COLOR:",385,215,"right","left",true,.1,2000),
    row(colorName,415,215,"left","right",false,.1,2000,colorInk),
    ...Array.from({length:8},(_,i)=>row("0",225+i*50,265,"center",i<4?"left":"right",false,0,1000)),
    row("CONTINUE",400,365,"center","bottom",true,.1,2000)
  ];
}

const step=.004;
function travel(acceleration,ticks,speed){return speed*step*ticks+acceleration*step*step*ticks*(ticks+1)/2}
function distance(glyph){return Math.abs(glyph.originX-glyph.x)+Math.abs(glyph.originY-glyph.y)}

export function glyphPosition(group,index,seconds,exiting=false){
  const glyph=group.glyphs[index],order=exiting?group.glyphs.length-1-index:index;
  const ticks=Math.max(0,Math.floor(seconds/step+1e-8)-1-Math.floor(order*group.interval/step));
  const delta=Math.min(distance(glyph),travel(group.acceleration,ticks,exiting?0:group.speed??0));
  const dx=Math.sign(glyph.x-glyph.originX),dy=Math.sign(glyph.y-glyph.originY);
  return exiting?[glyph.x-dx*delta,glyph.y-dy*delta]:[glyph.originX+dx*delta,glyph.originY+dy*delta];
}

// The title queues a whole page in a single group, including the blank rows.
// Unlike the mode menu it clips the actors between the two rainbow dividers.
const divider="-".repeat(33);
const pages=[
  ["BLITWISE PRODUCTIONS PRESENTS","POCKET TANKS","","THE ULTIMATE ONE-ON-ONE","ARTILLERY GAME","","VISIT WWW.BLITWISE.COM","FOR MORE GREAT GAMES"],
  ["TOP 5","2 PLAYER BATTLES",divider],
  ["MOST RECENT","2 PLAYER BATTLES",divider],
  ["GREETINGS GO OUT TO:","","MIKE BOEH, SIMEON PEEBLER,","MIKE AUSTIN, ROB LUNT,","ERIC GIESEKE (SIDEWINDER),","ED AND AL MACKEY, SHANE MONROE,","AND EVERYONE ELSE WHO INSPIRED","ME TO FINISH THIS GAME"]
];
function creditGroup(lines,page){
  const glyphs=[];
  for(const [index,text] of lines.entries()){
    const letters=Array.from(text,ch=>smallFont[ch.charCodeAt(0)]??[15,29]);
    const span=letters.reduce((sum,[w])=>sum+w+1,0);
    let x=400-Math.floor(span/2);
    const y=322+25*index,row=[];
    for(const [j,[w,h]] of letters.entries()){
      const ch=text[j];
      if(ch!==" "){
        const originX=page!==0?x:index%2?799:-w;
        const originY=page===0?y:page===3?538:317-h;
        row.push({ch,x,y,w,h,originX,originY});
      }
      x+=w+1;
    }
    if(page===0&&index%2===0)row.reverse();
    glyphs.push(...row);
  }
  return {glyphs,interval:.04,acceleration:2000,speed:200};
}
const credits=pages.map(creditGroup);
const creditDurations=credits.map(group=>12+groupDuration(group,true));
const creditCycle=creditDurations.reduce((sum,n)=>sum+n,0);

export function drawCredits(ctx,atlas,seconds){
  let time=Math.max(0,seconds)%creditCycle,page=0;
  while(page<credits.length-1&&time>=creditDurations[page])time-=creditDurations[page++];
  const group=credits[page],exit=time>=12;
  ctx.save();ctx.beginPath();ctx.rect(0,317,800,222);ctx.clip();
  for(const [i,g] of group.glyphs.entries()){
    const [x,y]=glyphPosition(group,i,exit?time-12:Math.max(0,time-.04),exit).map(Math.trunc);
    if(x+g.w<=0||x>=800||y+g.h<=317||y>=539)continue;
    const code=g.ch.charCodeAt(0);
    ctx.drawImage(atlas,(code%16)*32,Math.floor((code-32)/16)*32,g.w,g.h,x,y,g.w,g.h);
  }
  ctx.restore();
}

export function groupDuration(group,exiting){
  return group.glyphs.reduce((max,glyph,index)=>{
    const order=exiting?group.glyphs.length-1-index:index;
    const ticks=Math.ceil((Math.sqrt(1+8*distance(glyph)/(group.acceleration*step*step))-1)/2);
    return Math.max(max,(1+Math.floor(order*group.interval/step)+ticks)*step);
  },0);
}

// Five points on the unit circle pass through the PC title's two yaw
// rotations and a fixed 20-degree tilt before perspective division.
export function orbitSprites(time,center){
  const rad=3.14159/180,yaw=-70*rad*time,spin=20*rad*time,tilt=20*rad;
  const frame=Math.floor(time*30+1e-8)%10;
  return Array.from({length:5},(_,i)=>{
    const phase=i*72*3.1415927/180+yaw;
    const x=Math.cos(phase)*Math.cos(tilt),y=Math.cos(phase)*Math.sin(tilt),z=Math.sin(phase);
    const depth=400+250*(Math.sin(spin)*x+Math.cos(spin)*z);
    const projectedX=400+Math.trunc(400*250*(Math.cos(spin)*x-Math.sin(spin)*z)/depth+.5);
    const projectedY=Math.trunc(300-Math.trunc(400*125*y/depth-.5)+center);
    const size=Math.min(19,Math.max(0,Math.trunc((depth-150)/25)));
    return {x:projectedX,y:projectedY,depth,frame:size*10+frame};
  });
}

// The plates contain the original shaded glyphs. Remove each scanline's
// background colour once so vertical travel doesn't carry a coloured box.
export function menuInk(plate){
  const sheet=document.createElement("canvas");sheet.width=800;sheet.height=450;
  const ctx=sheet.getContext("2d");ctx.drawImage(plate,0,0);
  const image=ctx.getImageData(0,0,800,450),bytes=image.data;
  for(let y=0;y<450;y++){
    const start=y*800*4;
    for(let p=start;p<start+3200;p+=4){
      if(bytes[p]===bytes[start]&&bytes[p+1]===bytes[start+1]&&bytes[p+2]===bytes[start+2])bytes[p+3]=0;
    }
  }
  ctx.putImageData(image,0,0);return sheet;
}
