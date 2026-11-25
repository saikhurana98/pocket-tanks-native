import confetti from "./engine/confetti.json" with {type:"json"};
import widths from "./art/treb20.json" with {type:"json"};
import offsetsTable from "./engine/tank-offsets.json" with {type:"json"};
import {startEmitter} from "./particles.mjs";

const offsets=[0,21,28,41,54,67,78];
const sounds=[null,"bigpop.wav","pop.wav","wooshpop.wav","cannonpop.wav"];
function random(state,limit){
  state.seed=(Math.imul(state.seed,214013)+2531011)>>>0;
  return ((state.seed>>>16)&32767)%limit;
}
// Match-end update and draw in the Deluxe EXE, 0x457600 and 0x4578c0.
export function advanceVictory(s,dt){
  const v=s.victory??={age:0,phase:0,phaseTime:0,untilBurst:0,seed:s.fx.seed,
    winner:s.scores[0]===s.scores[1]?-1:Number(s.scores[1]>s.scores[0])};
  v.age+=dt;
  if(v.winner<0)return;
  v.phaseTime+=dt;
  while(v.phaseTime>1/300){v.phase=(v.phase+1)%360;v.phaseTime-=1/300}
  v.untilBurst-=dt;
  if(v.untilBurst>0)return;
  v.untilBurst+=.2-random(v,1000)*.0001;
  const angle=3.926990875+random(v,1000)*.00157079635;
  const radius=50+random(v,1000)*.03;
  const [x,y]=s.tanks[v.winner];
  startEmitter(s.fx,confetti[random(v,4)],x+s.engine.surfaceCos(angle)*radius,y+s.engine.surfaceSin(angle)*radius);
  const cue=sounds[random(v,5)];
  if(cue)s.onSound?.(cue);
}
export function drawWinner(ctx,font,s){
  const v=s.victory;
  if(!v||v.winner<0)return;
  const [x,y]=s.tanks[v.winner];
  let phase=v.phase;
  for(const [i,ch] of [..."Winner!"].entries()){
    const code=ch.charCodeAt(0),dy=offsetsTable[phase][1]/1024;
    ctx.drawImage(font,code%16*32,Math.floor((code-32)/16)*20,widths[code],20,
      Math.trunc(x-40.5+offsets[i]),Math.trunc(y-60+dy*10),widths[code],20);
    phase+=40;if(phase>359)phase-=359;
  }
}
