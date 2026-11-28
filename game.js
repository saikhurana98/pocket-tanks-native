import {Navigation,loadMenus,ink} from "./navigation.mjs";
import {Online} from "./online.mjs";
import {DT,loadEngine,setup,launch,moveTank,step} from "./sim.mjs";
import {RangeDisplay,loadArt} from "./presentation.mjs";
import {weapons,inventory,openShop,pickWeapon,advanceDraft,volleys} from "./match.mjs";
import {advanceComputer,computerPlayer,computerRoll,computerTurn} from "./computer.mjs";

const $=id=>document.getElementById(id);
const main=document.querySelector("main"),board=$("board");
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const wrap=n=>(n%360+360)%360;
const weaponButtons=weapons.map((w,i)=>["choose","big","three","five"][i]??"weapon-"+i);
const labels={angleleft:"Increase angle",angleright:"Decrease angle",powerleft:"Decrease power",powerright:"Increase power",
  moveleft:"Move tank left",moveright:"Move tank right",angle:"Adjust aim",power:"Adjust power",move:"Select movement direction",
  fire:"Fire Single Shot",weapon:"Choose weapon",weaponup:"Previous weapon",weapondown:"Next weapon",
  exit:"End game",yes:"End game",no:"Continue playing",random:"Random weapons"};
const ui={hover:null,pressed:null,mode:null,dialog:false,ended:false,turnTime:0};
let engine,scene,matchScene,display,s,clock,lag=0,hold,gesture,adjust,lastPoint,sound=true,context;
const music=new Audio();music.preload="none";music.loop=true;music.volume=.4;
let navigation,track=null,musicEnabled=true,fxEnabled=true,unlocked=false;
function musicScene(name){
  if(track!==name){music.pause();track=name;if(name)music.src="./audio/"+name+".mp3";else music.removeAttribute("src")}
  if(name&&unlocked&&sound&&musicEnabled&&!document.hidden)music.play().catch(()=>{});
}
const sounds=new Map(),mediaVoices=new Map();
let preparedWeapon;
function loadSound(file){
  if(!sounds.has(file)){
    sounds.set(file,fetch("./audio/"+file).then(r=>{
      if(!r.ok)throw Error(file);
      return r.arrayBuffer();
    }).then(bytes=>context.decodeAudioData(bytes)).catch(()=>{sounds.delete(file);return null}));
  }
  return sounds.get(file);
}
function prepareWeaponSounds(){
  if(!context||!unlocked||!sound||!fxEnabled||!s||s.pool)return;
  const weapon=weapons[s.selected[s.turn]];
  if(weapon===preparedWeapon)return;
  preparedWeapon=weapon;
  const files=new Set();
  for(const actor of Object.values(weapon.actors)){
    for(const file of [actor.sound,actor.bounceSound,actor.dropSound])if(file)files.add(file);
    if(actor.dirt||(["dirtball","dirtslinger","magicwall"].includes(actor.type)&&actor.dirtFall!==false))
      for(let i=1;i<=6;i++)files.add("rocks_"+i+".wav");
  }
  for(const steps of Object.values(weapon.triggers))for(const step of steps)if(step.sound)files.add(step.sound);
  for(const file of files)loadSound(file);
}
function unlockAudio(){
  if(!sound)return;
  unlocked=true;
  if(window.AudioContext){
    context??=new AudioContext();
    loadSound("cannon.wav");
    loadSound("crick.wav");
    if(s?.pool)loadSound("pickweap.wav");
    context.resume().catch(()=>{});
    prepareWeaponSounds();
  }
  musicScene(track);
}
async function effect(which){
  if(!sound||!fxEnabled)return;
  if(context?.state==="running"){
    const buffer=await loadSound(which);
    if(!sound||!fxEnabled)return;
    if(buffer&&context.state==="running"){
      const src=context.createBufferSource();src.buffer=buffer;src.connect(context.destination);src.start();
      return;
    }
  }
  if(!mediaVoices.has(which))mediaVoices.set(which,[]);
  const voices=mediaVoices.get(which);
  let voice=voices.find(audio=>audio.paused||audio.ended);
  if(!voice){voice=new Audio("./audio/"+which);voices.push(voice)}
  voice.play().catch(()=>{});
}
function busy(){return s.inVolley||s.move}
function stopHold(){clearTimeout(hold);clearInterval(hold);hold=null}
function finishAdjust(){
  adjust=null;ui.mode=null;
  if(document.pointerLockElement===board)document.exitPointerLock();
}
function sync(){
  prepareWeaponSounds();
  const player=id=>s.computer?display.players[id].name:"Player "+(id+1);
  let status=ui.ended?"Game ended":s.move?"Moving":s.ball||s.jumpSettling||s.cutters.length?"Shot in flight":s.inVolley?"Impact":player(s.turn)+(computerTurn(s)?" · Aiming":" · Ready to fire");
  if(s.pool)status="Weapon shop · "+player((s.draft[0].length+s.draft[1].length)%2)+" picks";
  else if(ui.finalShop)status="Weapon shop · Deal complete";
  else if(s.finished){
    const [a,b]=s.scores;status="Game over · "+(a===b?"Tie":player(a>b?0:1)+" wins")+" · "+a+" to "+b;
  }else if(s.mode==="match")status+=" · Volley "+Math.min(volleys,Math.floor((s.shots-(s.inVolley?1:0))/2)+1)+" · Score "+s.scores.join(" to ");
  if($("status").textContent!==status)$("status").textContent=status;
  $("angle").setAttribute("aria-label","Adjust aim, "+Math.round(ui.angles[s.turn])%360+" degrees");
  $("power").setAttribute("aria-label","Adjust power, "+Math.round(ui.powers[s.turn]));
  $("fire").setAttribute("aria-label","Fire "+weapons[s.selected[s.turn]].name);
  $("board").setAttribute("aria-label","Pocket Tanks Deluxe "+(s.computer?"single-player match":s.mode==="match"?"two-player match":"Target Practice"));
  for(const button of $("targets").children){
    const id=button.id;
    const slot=id.startsWith("pick-")?Number(id.slice(5)):-1;
    const stock=weaponButtons.indexOf(id);
    if(ui.finalShop)button.hidden=true;
    else if(slot>=0||id==="random"){
      button.hidden=!s.pool||(slot>=0&&s.pool[slot]===null);
      if(slot>=0&&!button.hidden)button.setAttribute("aria-label","Draft "+weapons[s.pool[slot]].name);
    }
    else if(s.pool||ui.ended)button.hidden=true;
    else if(ui.dialog||s.finished)button.hidden=(s.finished&&(s.victory?.age??0)<3)||(id!=="yes"&&id!=="no");
    else if(ui.mode==="weapon"){
      const row=ui.weaponItems.indexOf(stock)-ui.weaponTop;
      const arrow=id==="weaponup"||id==="weapondown";
      button.hidden=!arrow&&(stock<0||!ui.weaponItems.includes(stock)||row<0||row>=5);
      if(stock>=0&&!button.hidden)button.style.top=(462+row*23)/6+"%";
    }
    else button.hidden=stock>=0||id==="yes"||id==="no";
    const dialogControl=["exit","yes","no"].includes(id);
    button.disabled=((online.active&&!online.allowed)||computerTurn(s)||!!busy())&&!dialogControl||!!s.autoDraft||id.startsWith("move")&&!s.moves[s.turn];
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
function reset(mode=s?.computer?"solo":s?.mode||"practice",roomSeed){
  navigation?.hide();$("targets").hidden=false;
  stopHold();finishAdjust();gesture=null;lag=0;clock=undefined;
  const solo=mode==="solo";
  if(solo)mode="match";
  const range=mode==="match"?matchScene:scene;
  s=setup(engine,roomSeed===undefined?range:{...range,seed:roomSeed},mode);
  s.onSound=effect;
  s.onAimChange=(id,direction,power)=>{ui.angles[id]=wrap(360-direction);ui.powers[id]=power};
  display.bind(s);
  if(navigation){
    if(roomSeed===undefined)s.catalog=navigation.available.filter(i=>!navigation.removed.includes(i));
    let players=navigation.players;
    if(solo){
      s.computer=computerPlayer(navigation.level??5,s.seed);
      let color;
      do{color=computerRoll(s.computer,ink.length)}while(color===players[0].color);
      players=[players[0],{name:"CPU-"+s.computer.level,color}];
    }else if(players[0].color===players[1].color){
      players=[players[0],{...players[1],color:(players[0].color+1)%ink.length}];
    }
    display.players=roomSeed===undefined?players.map((p,i)=>({...p,ink:ink[p.color],custom:p.color!==i||p.name!=="Player "+(i+1)})):null;
    display.menuFont=navigation.font.bind(navigation);
  }
  if(mode==="match")openShop(s);
  musicScene(mode==="match"?"pocket":"ingame");
  Object.assign(ui,{angles:s.tanks.map(p=>wrap(360-p[3])),powers:s.tanks.map(p=>p[4]),turnTime:performance.now(),
    hover:null,pressed:null,mode:null,dialog:false,ended:false,finalShop:null});
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
    if(p.x>=385&&p.x<410&&p.y>=544&&p.y<586)return p.y<564?"weaponup":"weapondown";
    const row=Math.floor((p.y-462)/23);
    if(p.x<245||p.x>377||row<0||row>=5)return "dismiss";
    return weaponButtons[ui.weaponItems[ui.weaponTop+row]]??"dismiss";
  }
  if(p.x>746&&p.y>=581)return "exit";
  for(const id of ["angleleft","angleright","powerleft","powerright","moveleft","moveright","fire","angle","move","power","weaponup","weapondown","weapon"]){
    const b=display.buttons[id];if(p.x>=b.x&&p.x<b.x+b.w&&p.y>=b.y&&p.y<b.y+b.h)return id;
  }
  return null;
}
function beginAdjust(id,p){
  effect("crick.wav");
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
function applyRoomCommand(cmd){
  const turn=s.turn;
  if(cmd.kind==="fire"){
    s.selected[turn]=cmd.weapon;ui.angles[turn]=cmd.angle;ui.powers[turn]=cmd.power;
    launch(s,cmd.angle,cmd.power);
  }else if(cmd.kind==="move"){moveTank(s,cmd.direction);effect("crick.wav")}
  else if(cmd.kind==="random"){s.autoDraft=true;effect("crick.wav")}
  else if(cmd.kind==="pick"){pickWeapon(s,cmd.slot);effect("crick.wav");if(!s.pool)ui.finalShop="pending"}
  finishAdjust();stopHold();sync();
}
const online=new Online({start:seed=>reset("match",seed),apply:applyRoomCommand,sync,
  exit:()=>{reset("practice");navigation.show("mode")}});
function action(id,p){
  if(online.active){
    if(id==="exit"||s.finished&&(id==="no"||id==="yes")){
      const again=s.finished&&id==="yes";online.leave();if(again)online.open();return;
    }
    if(!online.allowed)return;
    if(id==="fire"){online.command({kind:"fire",weapon:s.selected[s.turn],angle:ui.angles[s.turn],power:ui.powers[s.turn]});return}
    if(id==="moveleft"||id==="moveright"){online.command({kind:"move",direction:id==="moveleft"?-1:1});return}
    if(id==="random"){online.command({kind:"random"});return}
    if(id?.startsWith("pick-")){online.command({kind:"pick",slot:Number(id.slice(5))});return}
  }
  if(ui.ended||ui.finalShop)return;
  if(s.pool){
    if(s.autoDraft||computerTurn(s))return;
    if(id==="random"){s.autoDraft=true;effect("crick.wav")}
    else if(id?.startsWith("pick-")&&pickWeapon(s,Number(id.slice(5))))effect("crick.wav");
    if(!s.pool)ui.finalShop="pending";
    sync();return;
  }
  if(s.finished){
    if((s.victory?.age??0)<3)return;
    if(id==="yes"||id==="no")effect("crick.wav");
    if(id==="yes")reset();
    if(id==="no")navigation.show("title");
    return;
  }
  if(id==="exit"||id==="no"){effect("crick.wav");ui.dialog=id==="exit";finishAdjust();ui.pressed=null;stopHold();sync();return}
  if(id==="yes"){
    effect("crick.wav");
    ui.dialog=false;ui.ended=true;finishAdjust();stopHold();sync();navigation.show("title");return;
  }
  if(busy()||ui.dialog||computerTurn(s))return;
  const turn=s.turn;
  const choice=weaponButtons.indexOf(id);
  if(choice>=0){
    if(s.mode==="practice"||s.ammo[turn][choice]){s.selected[turn]=choice;effect("crick.wav")}
    ui.mode=null;sync();return;
  }
  switch(id){
    case "angleleft":case "angleright":ui.angles[turn]=wrap(ui.angles[turn]+(id==="angleleft"?1:-1));effect("crick.wav");break;
    case "powerleft":case "powerright":ui.powers[turn]=clamp(ui.powers[turn]+(id==="powerleft"?-1:1),1,100);effect("crick.wav");break;
    case "angle":case "power":beginAdjust(id,p);break;
    case "moveleft":case "moveright":if(moveTank(s,id==="moveleft"?-1:1))effect("crick.wav");ui.mode=null;break;
    case "move":ui.mode="move";break;
    case "weapon":
      effect("crick.wav");
      ui.mode="weapon";ui.weaponItems=inventory(s);ui.weaponTop=ui.weaponItems.indexOf(s.selected[turn])-2;break;
    case "dismiss":ui.mode=null;break;
    case "weaponup":case "weapondown":{
      const direction=id==="weaponup"?-1:1;
      if(ui.mode==="weapon"){ui.weaponTop=clamp(ui.weaponTop+direction,-2,ui.weaponItems.length-3);break}
      const items=inventory(s);
      s.selected[turn]=items[(items.indexOf(s.selected[turn])+direction+items.length)%items.length];
      break;
    }
    case "fire":if(launch(s,ui.angles[turn],ui.powers[turn]))ui.mode=null;break;
  }
  sync();
}
board.addEventListener("pointerdown",e=>{
  if(navigation?.page||!s||e.button!==0||gesture)return;
  if(ui.ended){reset();return}
  unlockAudio();const p=boardPoint(e);lastPoint=p;ui.pointer=e.pointerType==="mouse"?p:null;let id=hit(p);
  if(computerTurn(s)&&!["exit","yes","no"].includes(id))return;
  if(adjust){if(document.pointerLockElement!==board)slide(p);finishAdjust();effect("crick.wav");gesture={pointer:e.pointerId,commit:true};sync();return}
  board.setPointerCapture(e.pointerId);
  if(ui.mode==="move")id=p.x<s.tanks[s.turn][0]?"moveleft":"moveright";
  gesture={id,p,pointer:e.pointerId};ui.pressed=id;ui.hover=id;
  if(id&&!busy()&&["angleleft","angleright","powerleft","powerright"].includes(id)){
    action(id,p);gesture.done=true;hold=setTimeout(()=>{hold=setInterval(()=>action(id,p),65)},350);
  }
  sync();
});
board.addEventListener("pointermove",e=>{
  if(navigation?.page||!s||ui.ended||gesture&&e.pointerId!==gesture.pointer)return;
  const p=boardPoint(e);lastPoint=p;
  ui.pointer=e.pointerType==="mouse"?p:null;
  if(!busy()&&!computerTurn(s)&&(!online.active||online.allowed)&&gesture?.p&&!adjust&&!gesture.done&&["angle","power"].includes(gesture.id)&&e.pointerType==="touch"&&Math.abs(p.x-gesture.p.x)>2){
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
  else if(!g.commit&&g.done&&g.dragged&&adjust){finishAdjust();effect("crick.wav")}
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
board.addEventListener("wheel",e=>{
  if(ui.mode!=="weapon"||!e.deltaY)return;
  e.preventDefault();action(e.deltaY>0?"weapondown":"weaponup",boardPoint(e));
},{passive:false});
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
    for(const voices of mediaVoices.values())for(const voice of voices){voice.pause();voice.currentTime=0}
  }
};
function stretch(value){
  main.classList.toggle("stretched",value);$("size").setAttribute("aria-pressed",String(value));
  $("size").textContent=value?"Stretch on":"Stretch off";
  try{localStorage.setItem("pt-stretched",String(value))}catch{}
}
try{stretch(localStorage.getItem("pt-stretched")==="true")}catch{}
$("size").onclick=()=>stretch(!main.classList.contains("stretched"));
function toggleOption(id){
  if(id==="fx")fxEnabled=!fxEnabled;
  else if(id==="music"){musicEnabled=!musicEnabled;if(musicEnabled)musicScene(track);else music.pause()}
  else $(id).click();
}
function optionLabel(id){
  if(id==="fx")return fxEnabled?"On":"Off";
  if(id==="music")return musicEnabled?"On":"Off";
  if(id==="size")return main.classList.contains("stretched")?"Stretched":"Normal";
  return document.fullscreenElement||main.classList.contains("expanded")?"Fullscreen":"Windowed";
}
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
  if($("room-ui").open)return;
  if(e.key==="F7"||e.key==="F8"){e.preventDefault();if(!e.repeat)$(e.key==="F7"?"full":"size").click();return}
  if(e.key==="F5"||e.key==="F6"){e.preventDefault();if(!e.repeat)toggleOption(e.key==="F5"?"fx":"music");return}
  if(navigation?.page){if(e.key==="Escape"){e.preventDefault();navigation.back()}return}
  if(!s)return;
  if(ui.ended&&(e.key==="Enter"||e.key===" ")){e.preventDefault();reset();unlockAudio();return}
  if(ui.mode==="weapon"&&(e.key==="ArrowUp"||e.key==="ArrowDown")){
    e.preventDefault();action(e.key==="ArrowUp"?"weaponup":"weapondown",lastPoint);return;
  }
  if(e.key==="Escape"){e.preventDefault();if(ui.mode){finishAdjust();sync()}else action(ui.dialog?"no":"exit",lastPoint);return}
  if(ui.dialog||ui.ended||e.target.closest("nav"))return;
  const id={ArrowLeft:"angleleft",ArrowRight:"angleright",ArrowUp:"powerright",ArrowDown:"powerleft"," ":"fire"}[e.key];
  if(id){if(e.key===" "&&e.target.matches("button"))return;e.preventDefault();unlockAudio();action(id,lastPoint)}
});
function frame(t){
  const dt=clock===undefined?0:Math.min(.1,(t-clock)/1000);clock=t;
  if(navigation?.page){navigation.draw(dt);requestAnimationFrame(frame);return}
  if(ui.finalShop==="shown"){musicScene("ingame");ui.finalShop=null;ui.turnTime=t;sync()}
  if(!ui.dialog&&!ui.ended){
    lag+=dt;while(lag>=DT){
      const ball=s.ball,active=s.inVolley,moving=s.move,turn=s.turn,score=s.scores[s.turn];
      const drafting=!!s.pool;
      if(advanceDraft(s,DT)||(!ui.finalShop&&advanceComputer(s))){
        if(drafting&&!s.pool)ui.finalShop="pending";
        ui.turnTime=t;sync();
      }
      step(s);
      if(turn!==s.turn||moving&&!s.move||active!==s.inVolley||ball&&!s.ball||score!==s.scores[turn]){ui.turnTime=t;sync()}
      lag-=DT;
    }
    if(s.finished&&s.victory?.age>=3&&$("yes").hidden)sync();
    display.draw(s,ui,t);
    if(ui.finalShop==="pending")ui.finalShop="shown";
    if(online.active&&!s.autoDraft&&!ui.finalShop&&!busy())online.settled(s);
  }else if(ui.dialog)display.draw(s,ui,t);
  requestAnimationFrame(frame);
}
document.addEventListener("visibilitychange",()=>{clock=undefined;lag=0;stopHold();if(document.hidden)music.pause();else musicScene(track)});
try{
  const [module,practice,match,art,menus]=await Promise.all([loadEngine(),fetch("./range.json").then(r=>r.json()),fetch("./match-range.json").then(r=>r.json()),loadArt(),loadMenus()]);
  engine=module;scene=practice;matchScene=match;display=new RangeDisplay(board.querySelector("canvas"),art,scene);
  // Create overlapping arrow buttons last so keyboard and pointer users can reach them.
  for(const id of ["move","angle","power","weapon","fire","moveleft","moveright","angleleft","angleright","powerleft","powerright","weaponup","weapondown"]){
    const {x,y,w,h}=display.buttons[id];target(id,x,y,w,h);
  }
  target("exit",748,582,52,18);target("yes",329,277,63,22);target("no",409,277,63,22);
  weaponButtons.forEach((id,i)=>{labels[id]="Select "+weapons[i].name;target(id,245,462+i*23,132,23)});
  target("random",360,408,88,32);
  for(let i=0;i<20;i++){
    const id="pick-"+i;labels[id]="Draft weapon";
    target(id,262+158*Math.floor(i/10),124+i%10*27,134,24);
  }
  navigation=new Navigation($("menu"),display,menus,{start:reset,online:online.endpoint?()=>online.open():null,track:musicScene,effect,unlock:unlockAudio,toggle:toggleOption,optionLabel});
  $("online").disabled=false;
  const mode=new URLSearchParams(location.search).get("mode");reset(mode==="match"?"match":"practice");
  if(mode==="solo"){navigation.single=true;navigation.show("player1")}
  else if(mode!=="practice"&&mode!=="match")navigation.show("launch");
  requestAnimationFrame(frame);
}catch(e){$("loading").textContent="Could not load Target Practice. Reload to try again.";console.error(e)}
