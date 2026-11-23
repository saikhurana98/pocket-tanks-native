import {W,H,DT,setup,launch,step,floorAt} from "./sim.mjs";
const $=id=>document.getElementById(id),canvas=document.querySelector("canvas"),ctx=canvas.getContext("2d");
const reference=await (await fetch("./reference.json")).json();
const ground=document.createElement("canvas");ground.width=W;ground.height=H;
const gx=ground.getContext("2d");let s,angle,power,clock,lag=0,audio,sound=true;
const sky=ctx.createLinearGradient(0,0,0,H);
sky.addColorStop(0,"#101623");sky.addColorStop(.58,"#242338");sky.addColorStop(1,"#5d4663");
function terrain(){
  const pixels=gx.createImageData(W,H);
  for(let x=0;x<W;x++){const surface=floorAt(s,x);
    for(let y=surface;y<H;y++){if(!s.solid[y*W+x])continue;
      const i=(y*W+x)*4,depth=y-surface;
      const grain=((x*73+y*19+(x^y)*7)%19)/3;
      const shade=depth<3?75:depth<12?39:depth<30?27:depth<65?14:0;
      pixels.data.set([31+shade*.65+grain,64+shade+grain,49+shade*.35,255],i);
    }}
  gx.putImageData(pixels,0,0);
}
function tank(x,color,deg){
  const y=floorAt(s,x)-5,rad=deg*Math.PI/180;
  ctx.save();ctx.translate(x,y);ctx.fillStyle="#151b1a";ctx.fillRect(-13,-2,26,6);
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(-14,-1);ctx.lineTo(-9,-6);ctx.lineTo(8,-6);ctx.lineTo(14,-1);ctx.fill();
  ctx.beginPath();ctx.arc(0,-6,5,Math.PI,2*Math.PI);ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(16*Math.cos(rad),-8-16*Math.sin(rad));ctx.stroke();
  for(let i=-8;i<=8;i+=8){ctx.fillStyle="#a1a793";ctx.fillRect(i,0,3,2)}ctx.restore();
}
function draw(){
  ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);ctx.drawImage(ground,0,0);
  s.positions.forEach((x,i)=>tank(x,i?"#ffbf46":"#ff7560",angle[i]));
  if(s.ball){ctx.strokeStyle="#ffe89b";ctx.lineWidth=2;ctx.beginPath();s.trail.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.fillStyle="#fff";ctx.fillRect(s.ball.x-1,s.ball.y-1,3,3)}
  if(s.impact){const k=s.impact.age/.85;ctx.fillStyle='rgba(255,198,85,'+(1-k)+')';ctx.beginPath();ctx.arc(s.impact.x,s.impact.y,21*Math.min(1,k*2.2),0,Math.PI*2);ctx.fill()}
}
function sync(){
  const busy=!!(s.ball||s.impact);for(const id of ["angle","power","fire"])$(id).disabled=busy;
  $("angle").value=angle[s.turn];$("power").value=power[s.turn];$("av").value=angle[s.turn]+"°";$("pv").value=power[s.turn];
  $("red").textContent=s.scores[0];$("gold").textContent=s.scores[1];$("count").textContent=s.shots+" shot"+(s.shots===1?"":"s");
  $("status").textContent=busy?(s.ball?"Shot in flight":"Impact"):"Player "+(s.turn+1)+" · Ready to fire";
}
function tone(start,end,duration){
  if(!sound||!audio||audio.state!=="running")return;
  const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime;
  o.frequency.setValueAtTime(start,t);o.frequency.exponentialRampToValueAtTime(end,t+duration);
  g.gain.setValueAtTime(.12,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);
  o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+duration);
}
function reset(){s=setup(reference.heights);angle=[60,120];power=[20,20];lag=0;clock=undefined;terrain();sync();draw();}
$("reset").onclick=reset;
for(const id of ["angle","power"])$(id).oninput=()=>{(id==="angle"?angle:power)[s.turn]=Number($(id).value);sync();draw()};
$("fire").onclick=()=>{if(!launch(s,angle[s.turn],power[s.turn]))return;
  if(sound && window.AudioContext){audio??=new AudioContext();audio.resume().then(()=>tone(200,48,.16)).catch(()=>{})}sync()};
$("sound").onclick=()=>{sound=!sound;$("sound").textContent=sound?"Sound on":"Sound off";$("sound").setAttribute("aria-pressed",sound)};
const main=document.querySelector("main");
function updateFull(){ $("full").textContent=document.fullscreenElement||main.classList.contains("expanded")?"Exit fullscreen":"Fullscreen" }
$("full").onclick=async()=>{if(document.fullscreenElement)await document.exitFullscreen();else if(main.classList.contains("expanded"))main.classList.remove("expanded");else try{await main.requestFullscreen()}catch{main.classList.add("expanded")}updateFull()};
document.addEventListener("fullscreenchange",updateFull);document.addEventListener("keydown",e=>{if(e.key==="Escape"){main.classList.remove("expanded");updateFull()}});
document.addEventListener("visibilitychange",()=>{clock=undefined;lag=0});
function frame(t){lag+=clock===undefined?0:Math.min(.1,(t-clock)/1000);clock=t;
  const active=!!(s.ball||s.impact);
  while(lag>=DT){const ball=s.ball,turn=s.turn;step(s);if(ball && s.impact){terrain();tone(125,30,.3);sync()}if(turn!==s.turn)sync();lag-=DT}
  if(active)draw();requestAnimationFrame(frame);
}
reset();requestAnimationFrame(frame);
