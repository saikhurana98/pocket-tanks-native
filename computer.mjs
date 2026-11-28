import {inventory,pickWeapon,prepareColliders,weapons} from "./match.mjs";
import {DT,H,W,launch,moveTank} from "./sim.mjs";

export function computerPlayer(level,seed){
  return {level,seed,wait:0,search:null,aimed:false,moved:false};
}

// The CPU calls the Windows C runtime rand() at 0x4b3b6f.
export function computerRoll(cpu,bound){
  cpu.seed=(Math.imul(cpu.seed,214013)+2531011)>>>0;
  return ((cpu.seed>>>16)&32767)%bound;
}

export function computerTurn(s){
  if(!s.computer||s.finished)return false;
  return s.pool?s.draft[0].length>s.draft[1].length:s.turn===1;
}

function occupied(s,x,y){
  const col=Math.min(W-1,Math.max(0,Math.trunc(x))),row=Math.min(H-1,Math.max(0,Math.trunc(y)));
  return !!s.solid[row*W+col];
}

// 0x4438b0 generates a trial using the selected weapon's aiming flags.
// 0x442e90 advances it to a tank, terrain transition or field boundary.
function candidate(s,search){
  const cpu=s.computer,e=s.engine,[x,y,slope]=s.tanks[1],[tx,ty]=s.tanks[0];
  const aim=weapons[s.selected[1]].aim;
  const direction=aim?.direct
    ? Math.trunc(e.surfaceAngle(ty-y,tx-x)*180/3.1415927-35+computerRoll(cpu,70))
    : 225+computerRoll(cpu,90);
  const power=40+computerRoll(cpu,60);
  let px=e.muzzleX(x,slope,direction),py=e.muzzleY(y,slope,direction);
  e.launch(px,py,direction,power);
  const vx=e.vx.value;
  let vy=e.vy.value,inSoil=false,crossings=aim?.crossings??0;
  // All trial velocities leave this field within the bound, including
  // vertical shots. A cap also keeps malformed pack settings bounded.
  for(let tick=0;tick<3000;tick++){
    if(!aim?.direct)vy+=5.4*DT;
    px+=vx*DT*50;py+=vy*DT*50;
    if(px<0||px>=W||py>=H||(aim?.direct&&py<0))break;
    const solid=!!s.solid[Math.max(0,Math.trunc(py))*W+Math.trunc(px)];
    if(solid!==inSoil){inSoil=solid;if(--crossings<0)break}
    let hit=false;
    for(const tank of search.tanks){
      if(Math.abs(px-tank.center[0])<=20&&Math.abs(py-tank.center[1])<=20&&
         (e.insideHull(px,py,tank.address,8)||e.insideHull(px,py,tank.address+64,4))){hit=true;break}
    }
    if(hit)break;
  }
  const error=(px-tx)**2+(py-ty)**2;
  if(error<search.error){
    search.error=error;
    if(search.trials<search.limit)Object.assign(search,{angle:(720-direction)%360,power});
  }
}

export function advanceComputer(s){
  if(!computerTurn(s)||s.inVolley||s.move||s.autoDraft)return false;
  const cpu=s.computer;
  if(s.pool){
    if((cpu.wait+=DT)<.48)return false;
    // 0x46e9e0 takes the first available slot with maximum weapon weight.
    let best=-1;
    s.pool.forEach((weapon,i)=>{
      if(weapon!==null&&(best<0||weapons[weapon].aim.weight>weapons[s.pool[best]].aim.weight))best=i;
    });
    pickWeapon(s,best);
    cpu.wait=0;s.onSound?.("pickweap.wav");return true;
  }
  if(cpu.aimed){
    if((cpu.wait+=DT)<.48)return false;
    launch(s,cpu.search.angle,cpu.search.power);
    Object.assign(cpu,{aimed:false,moved:false,wait:0,search:null});
    return true;
  }
  // 0x457d38 retains the best of 30 + 23 * (difficulty - 1) trials.
  // Spread the work across ticks so painting and input continue during aim.
  cpu.search??={trials:0,limit:30+23*(cpu.level-1),error:Infinity,tanks:prepareColliders(s)};
  const search=cpu.search;
  for(let i=0;i<2;i++){candidate(s,search);search.trials++}
  if(search.trials<400)return false;
  const [x,y,slope,dir]=s.tanks[1],aim=weapons[s.selected[1]].aim,e=s.engine;
  const buried=direction=>occupied(s,e.muzzleX(x,slope,direction),e.muzzleY(y,slope,direction));
  if(search.error>100**2&&!cpu.moved&&s.moves[1]&&!(aim.direct&&aim.crossings)&&!buried(dir)){
    const clear=d=>[1,2,3].every(i=>!occupied(s,x+i*d,y-i));
    let d=x<s.tanks[0][0]?-1:1;
    if(!clear(d))d=-d;
    if(clear(d)&&x+d>=15&&x+d<=W-15&&moveTank(s,d)){
      cpu.moved=true;cpu.search=null;return true;
    }
  }
  if(search.error>200**2&&aim.direct&&!aim.crossings)search.angle=100-computerRoll(cpu,20);
  if(buried(360-search.angle)&&!(aim.direct&&aim.crossings>=2)){
    const stock=inventory(s);
    s.selected[1]=stock.reduce((best,w)=>weapons[w].aim.dirtRemoval>weapons[best].aim.dirtRemoval?w:best);
    search.power=1;
  }
  s.tanks[1][3]=(360-search.angle)%360;s.tanks[1][4]=search.power;
  s.onAimChange?.(1,s.tanks[1][3],search.power);
  cpu.aimed=true;return true;
}
