// The pack language interleaves timed commands, loops and conditionals.
export function compileScript(fields,resolveActor,normalizeSound){
  const code=[],stack=[];
  let command;
  function flush(){if(command){if(command.actor)code.push(command);command=null}}
  function control(op,arg){
    flush();
    if(op==="LOOP"||op==="IF"){stack.push(code.length);code.push({op,arg});return}
    // Star Cruiser ships a standalone ELSE/ENDIF pair without an opening IF.
    if(!stack.length&&["ELSE","ENDIF"].includes(op))return;
    const pos=stack.pop(),entry=code[pos];
    if(op==="ELSE"&&entry?.op==="IF"){entry.to=code.length+1;stack.push(code.length);code.push({op:"ELSE"});return}
    if(op==="ENDIF"&&["IF","ELSE"].includes(entry?.op)){entry.to=code.length;return}
    if(op==="ENDLOOP"&&entry?.op==="LOOP"){code.push({op,to:pos+1});entry.to=code.length;return}
    throw Error("Unbalanced "+op);
  }
  for(const [key,raw] of fields){
    const parts=raw.split(/\b(ENDLOOP|ENDIF|ELSE|IF|LOOP)\b/);
    const value=parts[0].trim();
    if(key==="TIMEDELAY"){flush();command={delay:parseFloat(value)||0}}
    else if(command){
      if(key==="COMMAND")command.actor=resolveActor(value);
      else if(key==="SOUND_EFFECT"&&value.toUpperCase()!=="NONE")command.sound=normalizeSound(value);
      else if(["XOFFSET","YOFFSET","XOFFSET2","YOFFSET2","ANGLE","POWER","AX","BX"].includes(key)&&!/^NONEE?$/i.test(value))command[key.toLowerCase()]=value;
    }
    for(let i=1;i<parts.length;i+=2)control(parts[i],parts[i+1].trim());
  }
  flush();
  if(stack.length)throw Error("Unterminated pack control statement");
  return code;
}
