export const W=800, H=450, DT=.004;

export async function loadEngine() {
  const response=await fetch(new URL("./engine/single-shot.wasm",import.meta.url));
  if(!response.ok) throw Error("Could not load Single Shot");
  const {instance}=await WebAssembly.instantiate(await response.arrayBuffer(),{math:Math});
  return instance.exports;
}
export function setup(engine,scene) {
  const solid=new Uint8Array(engine.memory.buffer,0,W*H);
  let offset=0;
  for(const [i,length] of scene.terrain.runs.entries()) {
    solid.fill(i%2,offset,offset+length);
    offset+=length;
  }
  if(offset!==W*H)throw Error("Incomplete terrain");
  return {engine,solid,tanks:scene.tanks,turn:scene.turn,shots:0,ball:null,impact:null,trail:[],revision:0};
}
export function floorAt(s,x) {
  for(let y=0;y<H;y++) if(s.solid[y*W+x])return y;
  return H;
}
export function launch(s,angle,power) {
  if(s.ball||s.impact)return false;
  const [x,y,slope]=s.tanks[s.turn],direction=360-angle,e=s.engine;
  e.launch(e.muzzleX(x,slope,direction),e.muzzleY(y,slope,direction),direction,power);
  s.ball={x:e.x.value,y:e.y.value};s.shots++;s.trail=[];
  return true;
}
function endTurn(s){s.ball=null;s.impact=null;s.turn=1-s.turn;s.trail=[];}
export function step(s) {
  const e=s.engine;
  if(s.impact){
    const phase=e.blastStep(DT);
    if(phase!==s.impact.phase){
      s.impact.phase=phase;
      if(phase<=21)s.revision++;
      if(phase>=33)endTurn(s);
    }
    return;
  }
  if(!s.ball)return;
  const event=e.step(DT,0);
  if(event===2){endTurn(s);return}
  s.ball.x=e.x.value;s.ball.y=e.y.value;
  if(event===1){
    s.impact={x:s.ball.x,y:s.ball.y,phase:0};s.ball=null;e.beginBlast();return;
  }
  s.trail.push([s.ball.x,s.ball.y]);
  if(s.trail.length>11)s.trail.shift();
}
