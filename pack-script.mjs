// Timed commands retain their own registers when a weapon starts another trigger.
import {roll} from "./match.mjs";
const precedence={"||":1,"&&":2,"==":3,">":3,"<":3,">=":3,"<=":3,"+":4,"-":4,"*":5,"/":5,"%":5};
const operations={"||":(a,b)=>Number(!!(a||b)),"&&":(a,b)=>Number(!!(a&&b)),"==":(a,b)=>Number(a===b),
  ">":(a,b)=>Number(a>b),"<":(a,b)=>Number(a<b),">=":(a,b)=>Number(a>=b),"<=":(a,b)=>Number(a<=b),
  "+":(a,b)=>a+b,"-":(a,b)=>a-b,"*":(a,b)=>a*b,"/":(a,b)=>b?a/b:0,"%":(a,b)=>b?a%b:0};
const expressions=new Map();
function infix(source){
  if(expressions.has(source))return expressions.get(source);
  const tokens=source.trim().split(/\s+/);let index=0;
  function parse(minimum){
    const token=tokens[index++];let value;
    if(token==="("){value=parse(0);if(tokens[index++]!==")")throw Error(source)}
    else if(["COS","SIN","FLOOR"].includes(token)){
      const argument=parse(6);
      value=lookup=>{const n=argument(lookup);return token==="FLOOR"?Math.floor(n):Math[token.toLowerCase()](n*Math.PI/180)};
    }else value=lookup=>Number.isFinite(+token)?+token:lookup(token);
    while(index<tokens.length&&precedence[tokens[index]]>=minimum){
      const op=tokens[index++],right=parse(precedence[op]+1),left=value;
      value=lookup=>operations[op](left(lookup),right(lookup));
    }
    return value;
  }
  const evaluate=parse(0);
  if(index!==tokens.length)throw Error("Unexpected pack expression: "+source);
  expressions.set(source,evaluate);return evaluate;
}
function evaluate(s,frame,key,expression,condition=false){
  const values=frame.values,base=frame.base;
  const lookup=word=>{
    if(Number.isFinite(+word))return Number(word);
    switch(word){
      case "CURRENT":return values[key]??0;
      case "RESET":return base[key]??0;
      case "RND":return roll(s,0x100000000);
      case "LOOP_COUNT":return frame.loops.at(-1)?.index??0;
      case "X":return values.xoffset;case "Y":return values.yoffset;
      case "STANK_X":return s.tanks[s.turn][0];case "STANK_Y":return s.tanks[s.turn][1];
      case "CTANK_X":return s.tanks[1-s.turn][0];case "CTANK_Y":return s.tanks[1-s.turn][1];
      case "STANK_DIRECT":return s.tanks[s.turn][3];case "CTANK_DIRECT":return s.tanks[1-s.turn][3];
      default:if(Object.hasOwn(values,word.toLowerCase()))return values[word.toLowerCase()];
        throw Error("Unknown pack register "+word);
    }
  };
  if(expression.startsWith("INFIX ")||condition){
    const source=expression.replace(/^INFIX\s+/,"").replace(/^SET\s+/,"")
      .replace(/^(\d+) RND (\d+)$/,"$1 + ( RND % $2 )");
    return infix(source)(lookup);
  }
  const tokens=expression.split(/\s+/);
  let result=values[key];
  for(let i=0;i<tokens.length;i++){
    const op=tokens[i];
    if(op==="RESET")result=base[key];
    else if(op==="RND"){const bound=Number(tokens[++i]);if(bound)result+=roll(s,bound)}
    else if(op==="SET")result=Number(tokens[++i]);
    else if(operations[op])result=operations[op](result,Number(tokens[++i]));
    else result=lookup(op);
  }
  return result;
}
export function triggerFrame(code,x,y,angle,power,registers){
  const base={xoffset:x,yoffset:y,xoffset2:x,yoffset2:y,angle,power,ax:registers?.ax??0,bx:registers?.bx??0};
  return {code,base,values:{...base},loops:[],pc:0,elapsed:0,scheduled:false};
}
export function advanceTrigger(s,frame,dispatch){
  for(;frame.pc<frame.code.length;){
    const step=frame.code[frame.pc];
    if(step.op){
      frame.pc++;
      if(step.op==="LOOP"){
        const count=Math.trunc(evaluate(s,frame,"ax",step.arg,step.arg.startsWith("INFIX ")));
        if(count<=0)frame.pc=step.to;else frame.loops.push({count,index:0});
      }else if(step.op==="ENDLOOP"){
        const loop=frame.loops.at(-1);
        if(++loop.index<loop.count)frame.pc=step.to;else frame.loops.pop();
      }else if(step.op==="ELSE"||!evaluate(s,frame,"ax",step.arg,true))frame.pc=step.to;
      continue;
    }
    if(!frame.scheduled){frame.elapsed+=step.delay;frame.scheduled=true}
    if(s.tick<frame.start+Math.ceil(frame.elapsed/4))return true;
    for(const key of Object.keys(step))if(Object.hasOwn(frame.values,key))frame.values[key]=evaluate(s,frame,key,step[key]);
    frame.scheduled=false;frame.pc++;
    dispatch(step,frame.values);
  }
  return false;
}
