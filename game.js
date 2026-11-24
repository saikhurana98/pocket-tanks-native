import {DT,loadEngine,setup,launch,moveTank,step} from "./sim.mjs";
import {RangeDisplay,loadArt} from "./presentation.mjs";
import {weapons,openShop,pickWeapon,randomDraft,volleys} from "./match.mjs";

const $=id=>document.getElementById(id);
const main=document.querySelector("main"),board=$("board");
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const wrap=n=>(n%360+360)%360;
const weaponButtons=["choose","big","three","five"];
const labels={angleleft:"Increase angle",angleright:"Decrease angle",powerleft:"Decrease power",powerright:"Increase power",
  moveleft:"Move tank left",moveright:"Move tank right",angle:"Adjust aim",power:"Adjust power",move:"Select movement direction",
  fire:"Fire Single Shot",weapon:"Choose weapon",weaponup:"Previous weapon",weapondown:"Next weapon",
  exit:"End game",yes:"End game",no:"Continue playing",random:"Random weapons"};
const ui={hover:null,pressed:null,mode:null,dialog:false,ended:false,turnTime:0};
let engine,scene,matchScene,display,s,clock,lag=0,hold,gesture,adjust,lastPoint,sound=true,context,sounds;
const music=new Audio();music.preload="none";music.loop=true;music.volume=.4;
const effects=["cannon","expmedium2","expmedium"].map(name=>"./audio/"+name+".wav");
const mediaVoices=effects.map(()=>[]);
function unlockAudio(){
  if(!sound)return;
  if(!music.getAttribute("src"))music.src="./audio/ingame.mp3";
  if(window.AudioContext){
    context??=new AudioContext();
    sounds??=Promise.all(effects.map(async url=>{
      const r=await fetch(url);if(!r.ok)throw Error(url);
      return context.decodeAudioData(await r.arrayBuffer());
    })).catch(()=>null);
    context.resume().catch(()=>{});
  }
  music.play().catch(()=>{});
}
async function effect(which){
  if(!sound)return;
  if(context?.state==="running"){
    const buffers=await sounds;
    if(!sound)return;
    if(buffers&&context.state==="running"){
      const src=context.createBufferSource();src.buffer=buffers[which];src.connect(context.destination);src.start();
      return;
    }
  }
  const voices=mediaVoices[which];
  let voice=voices.find(audio=>audio.paused||audio.ended);
  if(!voice){voice=new Audio(effects[which]);voices.push(voice)}
  voice.play().catch(()=>{});
}
function busy(){return s.inVolley||s.move}
function stopHold(){clearTimeout(hold);clearInterval(hold);hold=null}
function finishAdjust(){
  adjust=null;ui.mode=null;
  if(document.pointerLockElement===board)document.exitPointerLock();
}
function sync(){
  let status=ui.ended?"Game ended":s.move?"Moving":s.ball?"Shot in flight":s.inVolley?"Impact":"Player "+(s.turn+1)+" · Ready to fire";
  if(s.pool)status="Weapon shop · Player "+((s.draft[0].length+s.draft[1].length)%2+1)+" picks";
  else if(s.finished){
    const [a,b]=s.scores;status="Game over · "+(a===b?"Tie":"Player "+(a>b?1:2)+" wins")+" · "+a+" to "+b;
  }else if(s.mode==="match")status+=" · Volley "+Math.min(volleys,Math.floor((s.shots-(s.inVolley?1:0))/2)+1)+" · Score "+s.scores.join(" to ");
  if($("status").textContent!==status)$("status").textContent=status;
  $("angle").setAttribute("aria-label","Adjust aim, "+Math.round(ui.angles[s.turn])%360+" degrees");
  $("power").setAttribute("aria-label","Adjust power, "+Math.round(ui.powers[s.turn]));
  $("fire").setAttribute("aria-label","Fire "+weapons[s.selected[s.turn]].name);
  $("board").setAttribute("aria-label",s.mode==="match"?"Pocket Tanks Deluxe two-player match":"Pocket Tanks Deluxe Target Practice");
  for(const button of $("targets").children){
    const id=button.id;
    const slot=id.startsWith("pick-")?Number(id.slice(5)):-1;
    const stock=weaponButtons.indexOf(id);
    if(slot>=0||id==="random")button.hidden=!s.pool||(slot>=0&&s.pool[slot]===null);
    else if(s.pool||ui.ended)button.hidden=true;
    else if(ui.dialog||s.finished)button.hidden=id!=="yes"&&id!=="no";
    else if(ui.mode==="weapon")button.hidden=stock<0||(s.mode==="match"&&!s.ammo[s.turn][stock]);
    else button.hidden=stock>=0||id==="yes"||id==="no";
    button.disabled=!!busy()&&id!=="exit"||id.startsWith("move")&&!s.moves[s.turn];
  }
  for(const [id,x] of [["yes",s.finished?278:329],["no",s.finished?423:409]]){
    const b=$(id);b.style.left=x/8+"%";b.style.top=(s.finished?239:277)/6+"%";
    b.style.width=(s.finished?(id==="yes"?96:72):63)/8+"%";b.style.height=(s.finished?34:22)/6+"%";
    b.setAttribute("aria-label",s.finished?(id==="yes"?"Play again":"Leave match"):labels[id]);
  }
  board.classList.toggle("busy",!!busy());
  board.classList.toggle("hot",!!ui.hover);
  board.classList.toggle("adjust",ui.mode==="angle"||ui.mode==="power");
  main.classList.toggle("tools",ui.dialog||ui.ended);
}
function reset(mode=s?.mode||"practice"){
  stopHold();finishAdjust();gesture=null;lag=0;clock=undefined;
  const range=mode==="match"?matchScene:scene;
  s=setup(engine,range,mode);
  s.onContact=()=>effect(weapons[s.weapon].effect);
  display.bind(s);
  if(mode==="match")openShop(s);
  Object.assign(ui,{angles:s.tanks.map(p=>wrap(360-p[3])),powers:s.tanks.map(p=>p[4]),turnTime:performance.now(),
    hover:null,pressed:null,mode:null,dialog:false,ended:false});
  $("loading").hidden=true;$("loading").setAttribute("role","status");$("loading").removeAttribute("tabindex");
  display.reset(range,mode);sync();display.draw(s,ui,ui.turnTime);
  $("reset").textContent=mode==="match"?"Restart match":"Reset range";
}
function target(id,x,y,w,h){
  const b=document.createElement("button");b.id=id;b.type="button";b.setAttribute("aria-label",labels[id]);
  Object.assign(b.style,{left:x/8+"%",top:y/6+"%",width:w/8+"%",height:h/6+"%"});
  b.onclick=e=>{if(e.detail===0){unlockAudio();action(id,lastPoint||{x:x+w/2,y:y+h/2})}};
  $("targets").append(b);
}
function boardPoint(e){const r=board.getBoundingClientRect();return {x:Math.round((e.clientX-r.left)*800/r.width),y:Math.round((e.clientY-r.top)*600/r.height)}}
function hit(p){
  if(s.pool){
    if(p.x>=360&&p.x<=448&&p.y>=408&&p.y<=440)return "random";
    const col=p.x>=418&&p.x<562?1:p.x>=260&&p.x<398?0:-1;
    const row=Math.floor((p.y-124)/27),i=col*10+row;
    return col>=0&&row>=0&&row<10&&s.pool[i]!==null?"pick-"+i:null;
  }
  if(s.finished)return p.y>=239&&p.y<=273?(p.x>=278&&p.x<=374?"yes":p.x>=423&&p.x<=495?"no":null):null;
  if(ui.dialog)return p.y>=277&&p.y<=299?(p.x>=329&&p.x<=391?"yes":p.x>=409&&p.x<=471?"no":null):null;
  if(ui.mode==="weapon"){
    const index=Math.floor((p.y-462)/23);
    if(p.x<245||p.x>377||!weaponButtons[index])return "dismiss";
    return weaponButtons[index];
  }
  if(p.x>746&&p.y>=581)return "exit";
  for(const id of ["angleleft","angleright","powerleft","powerright","moveleft","moveright","fire","angle","move","power","weaponup","weapondown","weapon"]){
    const b=display.buttons[id];if(p.x>=b.x&&p.x<b.x+b.w&&p.y>=b.y&&p.y<b.y+b.h)return id;
  }
  return null;
}
function beginAdjust(id,p){
  ui.mode=id;
  adjust={at:p,angle:ui.angles[s.turn],power:ui.powers[s.turn],relativeX:0};
}
function slide(p){
  if(!adjust)return;
  const dx=p.x-adjust.at.x;
  if(ui.mode==="angle")ui.angles[s.turn]=wrap(adjust.angle-dx/4);
  if(ui.mode==="power")ui.powers[s.turn]=clamp(adjust.power+dx/4,1,100);
  sync();
}
function action(id,p){
  if(ui.ended)return;
  if(s.pool){
    if(id==="random")randomDraft(s);
    else if(id?.startsWith("pick-"))pickWeapon(s,Number(id.slice(5)));
    sync();return;
  }
  if(s.finished){
    if(id==="yes")reset("match");
    if(id==="no")reset("practice");
    return;
  }
  if(id==="exit"||id==="no"){ui.dialog=id==="exit";finishAdjust();ui.pressed=null;stopHold();sync();return}
  if(id==="yes"){
    ui.dialog=false;ui.ended=true;music.pause();$("loading").textContent=s.mode==="match"?"Start two-player match":"Start Target Practice";
    $("loading").hidden=false;$("loading").setAttribute("role","button");$("loading").tabIndex=0;$("loading").focus();sync();return;
  }
  if(busy()||ui.dialog)return;
  const turn=s.turn;
  switch(id){
    case "angleleft":case "angleright":ui.angles[turn]=wrap(ui.angles[turn]+(id==="angleleft"?1:-1));break;
    case "powerleft":case "powerright":ui.powers[turn]=clamp(ui.powers[turn]+(id==="powerleft"?-1:1),1,100);break;
    case "angle":case "power":beginAdjust(id,p);break;
    case "moveleft":case "moveright":moveTank(s,id==="moveleft"?-1:1);ui.mode=null;break;
    case "move":ui.mode="move";break;
    case "weapon":ui.mode="weapon";break;
    case "dismiss":ui.mode=null;break;
    case "weaponup":case "weapondown":{
      const direction=id==="weaponup"?-1:1;
      for(let i=1;i<=weapons.length;i++){
        const next=(s.selected[turn]+i*direction+weapons.length)%weapons.length;
        if(s.mode==="practice"||s.ammo[turn][next]){s.selected[turn]=next;break}
      }
      break;
    }
    case "choose":case "big":case "three":case "five":{
      const next=weaponButtons.indexOf(id);
      if(s.mode==="practice"||s.ammo[turn][next])s.selected[turn]=next;
      ui.mode=null;break;
    }
    case "fire":if(launch(s,ui.angles[turn],ui.powers[turn])){ui.mode=null;effect(0)}break;
  }
  sync();
}
board.addEventListener("pointerdown",e=>{
  if(!s||e.button!==0||gesture)return;
  if(ui.ended){reset();return}
  unlockAudio();const p=boardPoint(e);lastPoint=p;ui.pointer=e.pointerType==="mouse"?p:null;let id=hit(p);
  if(adjust){if(document.pointerLockElement!==board)slide(p);finishAdjust();gesture={pointer:e.pointerId,commit:true};sync();return}
  board.setPointerCapture(e.pointerId);
  if(ui.mode==="move")id=p.x<s.tanks[s.turn][0]?"moveleft":"moveright";
  gesture={id,p,pointer:e.pointerId};ui.pressed=id;ui.hover=id;
  if(id&&!busy()&&["angleleft","angleright","powerleft","powerright"].includes(id)){
    action(id,p);gesture.done=true;hold=setTimeout(()=>{hold=setInterval(()=>action(id,p),65)},350);
  }
  sync();
});
board.addEventListener("pointermove",e=>{
  if(!s||ui.ended||gesture&&e.pointerId!==gesture.pointer)return;
  const p=boardPoint(e);lastPoint=p;
  ui.pointer=e.pointerType==="mouse"?p:null;
  if(gesture?.p&&!adjust&&!gesture.done&&["angle","power"].includes(gesture.id)&&e.pointerType==="touch"&&Math.abs(p.x-gesture.p.x)>2){
    beginAdjust(gesture.id,gesture.p);gesture.done=true;
  }
  if(adjust&&document.pointerLockElement===board){
    adjust.relativeX+=e.movementX*800/board.getBoundingClientRect().width;
    slide({x:adjust.at.x+Math.round(adjust.relativeX)});
  }else if(adjust)slide(p);
  if(gesture?.p&&Math.hypot(p.x-gesture.p.x,p.y-gesture.p.y)>2)gesture.dragged=true;
  ui.hover=hit(p);board.classList.toggle("hot",!!ui.hover);
});
function release(e,cancel){
  if(!gesture||gesture.pointer!==e.pointerId)return;
  const g=gesture;gesture=null;stopHold();ui.pressed=null;
  if(cancel)finishAdjust();
  else if(!g.commit&&g.done&&g.dragged&&adjust)finishAdjust();
  else if(!g.commit&&!g.done&&g.id&&(ui.mode==="move"||g.id===hit(boardPoint(e)))){
    action(g.id,boardPoint(e));
    if(adjust&&e.pointerType==="mouse"&&board.requestPointerLock){
      // Relative mouse travel lets the original adjustment continue at the screen edge.
      try{board.requestPointerLock()?.catch(()=>{})}catch{}
    }
  }
  if(e.pointerType!=="mouse")ui.hover=null;
  sync();
}
board.addEventListener("pointerup",e=>release(e,false));
board.addEventListener("pointercancel",e=>release(e,true));
board.addEventListener("lostpointercapture",e=>release(e,true));
board.addEventListener("pointerleave",()=>{if(!gesture){ui.pointer=null;ui.hover=null;board.classList.remove("hot")}});
$("reset").onclick=()=>{if(s)reset()};
$("newmatch").onclick=()=>{if(s){unlockAudio();reset("match")}};
$("practice").onclick=()=>{if(s)reset("practice")};
$("sound").onclick=()=>{
  sound=!sound;$("sound").textContent=sound?"Sound on":"Sound off";$("sound").setAttribute("aria-pressed",String(sound));
  if(sound)unlockAudio();else {
    music.pause();context?.suspend().catch(()=>{});
    for(const voices of mediaVoices)for(const voice of voices){voice.pause();voice.currentTime=0}
  }
};
function stretch(value){
  main.classList.toggle("stretched",value);$("size").setAttribute("aria-pressed",String(value));
  $("size").textContent=value?"Stretch on":"Stretch off";
  try{localStorage.setItem("pt-stretched",String(value))}catch{}
}
try{stretch(localStorage.getItem("pt-stretched")==="true")}catch{}
$("size").onclick=()=>stretch(!main.classList.contains("stretched"));
function fullLabel(){$("full").textContent=document.fullscreenElement||main.classList.contains("expanded")?"Exit fullscreen":"Fullscreen"}
$("full").onclick=async()=>{
  if(document.fullscreenElement)await document.exitFullscreen();
  else if(main.classList.contains("expanded"))main.classList.remove("expanded");
  else try{await main.requestFullscreen()}catch{main.classList.add("expanded")}
  fullLabel();
};
document.addEventListener("fullscreenchange",fullLabel);
document.addEventListener("pointerlockchange",()=>{
  if(document.pointerLockElement===board&&adjust)adjust.locked=true;
  else if(adjust?.locked){finishAdjust();sync()}
});
document.addEventListener("keydown",e=>{
  if(e.key==="F7"||e.key==="F8"){e.preventDefault();if(!e.repeat)$(e.key==="F7"?"full":"size").click();return}
  if(!s)return;
  if(ui.ended&&(e.key==="Enter"||e.key===" ")){e.preventDefault();reset();unlockAudio();return}
  if(e.key==="Escape"){e.preventDefault();if(ui.mode){finishAdjust();sync()}else action(ui.dialog?"no":"exit",lastPoint);return}
  if(ui.dialog||ui.ended||e.target.closest("nav"))return;
  const id={ArrowLeft:"angleleft",ArrowRight:"angleright",ArrowUp:"powerright",ArrowDown:"powerleft"," ":"fire"}[e.key];
  if(id){if(e.key===" "&&e.target.matches("button"))return;e.preventDefault();unlockAudio();action(id,lastPoint)}
});
function frame(t){
  const dt=clock===undefined?0:Math.min(.1,(t-clock)/1000);clock=t;
  if(!ui.dialog&&!ui.ended){
    lag+=dt;while(lag>=DT){
      const ball=s.ball,active=s.inVolley,moving=s.move,turn=s.turn,score=s.scores[s.turn];
      step(s);
      if(turn!==s.turn||moving&&!s.move||active!==s.inVolley||ball&&!s.ball||score!==s.scores[turn]){ui.turnTime=t;sync()}
      lag-=DT;
    }
    display.draw(s,ui,t);
  }else if(ui.dialog)display.draw(s,ui,t);
  requestAnimationFrame(frame);
}
document.addEventListener("visibilitychange",()=>{clock=undefined;lag=0;stopHold();if(document.hidden)music.pause();else if(sound&&context)music.play().catch(()=>{})});
try{
  const [module,practice,match,art]=await Promise.all([loadEngine(),fetch("./range.json").then(r=>r.json()),fetch("./match-range.json").then(r=>r.json()),loadArt()]);
  engine=module;scene=practice;matchScene=match;display=new RangeDisplay(board.querySelector("canvas"),art,scene);
  // Create overlapping arrow buttons last so keyboard and pointer users can reach them.
  for(const id of ["move","angle","power","weapon","fire","moveleft","moveright","angleleft","angleright","powerleft","powerright","weaponup","weapondown"]){
    const {x,y,w,h}=display.buttons[id];target(id,x,y,w,h);
  }
  target("exit",748,582,52,18);target("yes",329,277,63,22);target("no",409,277,63,22);
  weaponButtons.forEach((id,i)=>{labels[id]="Select "+weapons[i].name;target(id,245,462+i*23,132,23)});
  target("random",360,408,88,32);
  for(let i=0;i<20;i++){
    const id="pick-"+i;labels[id]="Draft "+weapons[i%weapons.length].name;
    target(id,262+158*Math.floor(i/10),124+i%10*27,134,24);
  }
  reset(new URLSearchParams(location.search).get("mode")==="match"?"match":"practice");requestAnimationFrame(frame);
}catch(e){$("loading").textContent="Could not load Target Practice. Reload to try again.";console.error(e)}
