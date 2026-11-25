import {randomInt} from "node:crypto";
import {readFile} from "node:fs/promises";
import {WebSocketServer} from "ws";
import {openShop,pickWeapon,advanceDraft,volleys} from "../match.mjs";

const {instance}=await WebAssembly.instantiate(await readFile(new URL("../engine/single-shot.wasm",import.meta.url)));
const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const send=(socket,message)=>{if(socket.readyState===1)socket.send(JSON.stringify(message))};
const broadcast=(room,message)=>room.players.forEach(socket=>send(socket,message));
function accept(room,command){
  const s=room.match;
  if(!command||typeof command!=="object")return false;
  if(s.pool){
    if(command.kind==="pick"&&Number.isInteger(command.slot)&&pickWeapon(s,command.slot)){
      room.turn=s.pool?1-room.turn:0;
      return true;
    }
    if(command.kind!=="random")return false;
    s.autoDraft=true;
    while(s.pool)advanceDraft(s,.1);
    room.turn=0;
    return true;
  }
  if(s.shots>=2*volleys)return false;
  if(command.kind==="move"&&[-1,1].includes(command.direction)&&s.moves[room.turn]>0){
    s.moves[room.turn]--;
    return true;
  }
  const {weapon,angle,power}=command;
  if(command.kind!=="fire"||!Number.isInteger(weapon)||!(s.ammo[room.turn][weapon]>0)||
    !Number.isFinite(angle)||angle<0||angle>=360||!Number.isFinite(power)||power<1||power>100)return false;
  s.ammo[room.turn][weapon]--;
  s.shots++;
  room.turn=s.shots===2*volleys?-1:1-room.turn;
  return true;
}
export function attachRooms(server){
  const rooms=new Map();
  const ws=new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false});
  server.on("upgrade",(req,socket,head)=>{
    let sameOrigin=false;
    try{const url=new URL(req.headers.origin);sameOrigin=["http:","https:"].includes(url.protocol)&&url.host===req.headers.host}catch{}
    if(req.url!=="/rooms"||!sameOrigin||ws.clients.size>=128){socket.destroy();return}
    ws.handleUpgrade(req,socket,head,client=>ws.emit("connection",client));
  });
  function end(room,reason){
    if(!rooms.delete(room.code))return;
    for(const peer of room.players){send(peer,{type:"ended",reason});peer.close(1000)}
  }
  ws.on("connection",socket=>{
    let room,windowStart=Date.now(),messages=0;
    socket.alive=true;
    socket.on("pong",()=>{socket.alive=true});
    socket.on("error",()=>socket.terminate());
    const error=reason=>send(socket,{type:"error",reason});
    socket.on("message",(raw,binary)=>{
      if(Date.now()-windowStart>=1000){windowStart=Date.now();messages=0}
      if(++messages>64||binary){socket.close(1008);return}
      let m;
      try{m=JSON.parse(raw)}catch{return error("Invalid message.")}
      if(!m||typeof m!=="object")return error("Invalid message.");
      if(!room){
        if(m.type==="create"){
          if(rooms.size>=64)return error("All rooms are occupied.");
          let code;
          do{code=Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join("")}while(rooms.has(code));
          room={code,players:[socket],seq:0,turn:0,acks:new Map(),ready:false,active:Date.now()};
          rooms.set(code,room);return send(socket,{type:"waiting",code});
        }
        if(m.type!=="join")return error("Create or join a room first.");
        const found=rooms.get(m.code);
        if(!found||found.players.length!==1)return error("Room unavailable. Check the code.");
        room=found;room.players.push(socket);room.active=Date.now();
        const seed=randomInt(2**32);
        room.match={engine:instance.exports,seed,tanks:[0,1],shots:0,moves:[4,4]};openShop(room.match);
        return room.players.forEach((peer,seat)=>send(peer,{type:"start",code:room.code,seed,seat}));
      }
      if(m.type==="leave")return end(room,"A player left the room.");
      if(room.players.length!==2)return error("Waiting for the second player.");
      if(m.seq!==room.seq)return error("Outdated turn.");
      if(m.type==="ack"){
        if(room.ready||room.acks.has(socket)||typeof m.digest!=="string"||!/^[0-9a-f]{8}$/.test(m.digest))return error("Unexpected acknowledgment.");
        room.active=Date.now();room.acks.set(socket,m.digest);
        if(room.acks.size===2){
          if(new Set(room.acks.values()).size!==1)return end(room,"The two games disagree. Create a new room.");
          room.ready=true;broadcast(room,{type:"turn",seq:room.seq,seat:room.turn});
        }
        return;
      }
      if(m.type!=="command"||!room.ready||room.players[room.turn]!==socket)return error("Wait for your turn.");
      if(!accept(room,m.command))return error("That move is unavailable.");
      room.ready=false;room.acks.clear();room.active=Date.now();room.seq++;
      broadcast(room,{type:"apply",seq:room.seq,command:m.command});
    });
    socket.on("close",()=>{if(room)end(room,"The other player disconnected.")});
  });
  const timer=setInterval(()=>{
    for(const room of rooms.values())if(Date.now()-room.active>30*60*1000)end(room,"The idle room expired.");
    for(const peer of ws.clients){
      if(!peer.alive){peer.terminate();continue}
      peer.alive=false;peer.ping();
    }
  },30000);
  timer.unref();
  server.on("close",()=>{clearInterval(timer);ws.close()});
  return ws;
}
