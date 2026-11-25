const el=id=>document.getElementById(id);
function fingerprint(s){
  let hash=2166136261;
  const mix=value=>{hash=Math.imul(hash^value,16777619)};
  for(const value of s.solid)mix(value);
  const state=JSON.stringify([s.seed,s.tanks,s.scores,s.moves,s.shots,s.turn,s.ammo,s.pool,s.draft,s.burn,s.finished]);
  for(let i=0;i<state.length;i++)mix(state.charCodeAt(i));
  return (hash>>>0).toString(16).padStart(8,"0");
}
export class Online{
  constructor(actions){
    this.actions=actions;
    this.endpoint=document.querySelector('meta[name="pocket-rooms"]')?.content;
    el("online").hidden=!this.endpoint;
    el("online").onclick=()=>this.open();
    el("create-room").onclick=()=>this.connect({type:"create"});
    el("join-room").onsubmit=e=>{e.preventDefault();this.connect({type:"join",code:el("room-code").value.trim().toUpperCase()})};
    el("close-room").onclick=()=>this.leave();
    el("room-ui").oncancel=e=>{e.preventDefault();this.leave()};
  }
  open(){
    if(this.active){this.leave();return}
    el("room-message").textContent="";
    el("room-ui").showModal();
  }
  leave(){
    const hadMatch=this.active;
    const socket=this.socket;
    this.socket=null;this.active=false;this.allowed=false;this.pending=false;
    if(socket)socket.close();
    el("room-ui").close();el("room-info").textContent="";
    el("online").textContent="Online match";
    this.lock(false);
    if(hadMatch)this.actions.exit();
  }
  lock(value){
    for(const id of ["create-room","room-code","join-button"])el(id).disabled=value;
    for(const id of ["practice","newmatch","reset"])el(id).disabled=!!this.active;
  }
  connect(message){
    if(this.socket)return;
    const url=new URL(this.endpoint,location.href);url.protocol=url.protocol==="https:"?"wss:":"ws:";
    const socket=new WebSocket(url);this.socket=socket;this.lock(true);
    el("room-message").textContent="Connecting…";
    socket.onopen=()=>socket.send(JSON.stringify(message));
    socket.onmessage=event=>{
      if(this.socket!==socket)return;
      const m=JSON.parse(event.data);
      if(m.type==="waiting")el("room-message").textContent="Room "+m.code+" · Waiting for Player 2";
      if(m.type==="error"){
        if(!this.active){this.socket=null;socket.close();this.lock(false);el("room-message").textContent=m.reason}
        else {this.allowed=this.turn===this.seat;el("room-info").textContent=m.reason;this.actions.sync()}
      }
      if(m.type==="ended")this.disconnected(m.reason);
      if(m.type==="start"){
        this.active=true;this.seat=m.seat;this.code=m.code;this.seq=0;this.turn=null;this.allowed=false;
        el("room-ui").close();el("online").textContent="Leave room";this.lock(true);
        this.actions.start(m.seed);this.pending=true;this.label("Starting match");
      }
      if(m.type==="apply"){
        this.allowed=false;this.seq=m.seq;this.pending=true;
        this.actions.apply(m.command);this.label("Playing turn");
      }
      if(m.type==="turn"){
        this.turn=m.seat;this.allowed=this.turn===this.seat;
        this.label(m.seat<0?"Match complete":this.allowed?"Your turn":"Waiting for Player "+(m.seat+1));this.actions.sync();
      }
    };
    socket.onclose=()=>{if(this.socket===socket)this.disconnected("Connection closed.")};
  }
  label(message){el("room-info").textContent="Room "+this.code+" · Player "+(this.seat+1)+" · "+message}
  disconnected(reason){
    this.leave();el("room-ui").showModal();el("room-message").textContent=reason;
  }
  command(command){
    if(!this.allowed||this.socket?.readyState!==1)return;
    this.allowed=false;this.label("Sending move");this.socket.send(JSON.stringify({type:"command",seq:this.seq,command}));
    this.actions.sync();
  }
  settled(s){
    if(!this.pending||this.socket?.readyState!==1)return;
    this.pending=false;this.socket.send(JSON.stringify({type:"ack",seq:this.seq,digest:fingerprint(s)}));
  }
}
