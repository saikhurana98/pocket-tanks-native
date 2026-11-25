import {test} from "node:test";
import assert from "node:assert/strict";
import {once} from "node:events";
import WebSocket from "ws";
process.env.PORT="0";
const {server}=await import("../server/serve.mjs");
if(!server.listening)await once(server,"listening");
const origin="http://127.0.0.1:"+server.address().port;
function client(t){
  const ws=new WebSocket(origin.replace("http","ws")+"/rooms",{origin});
  t.after(()=>ws.terminate());
  const queue=[],waiters=[];
  ws.on("message",bytes=>{
    const value=JSON.parse(bytes);
    if(waiters.length)waiters.shift()(value);else queue.push(value);
  });
  return {ws,send:m=>ws.send(JSON.stringify(m)),next:()=>queue.length?queue.shift():new Promise(resolve=>waiters.push(resolve))};
}
test("room creation, admission, ordered turns, acknowledgments and disconnect",{timeout:10000},async t=>{
  t.after(()=>server.close());
  const [a,b,c]=Array.from({length:3},()=>client(t));
  await Promise.all([a,b,c].map(p=>once(p.ws,"open")));
  b.send({type:"join",code:"ABSENT"});assert.equal((await b.next()).type,"error");
  a.send({type:"create"});const {code}=await a.next();assert.match(code,/^[A-HJ-NP-Z2-9]{6}$/);
  b.send({type:"join",code});const starts=await Promise.all([a.next(),b.next()]);
  assert.deepEqual(starts.map(m=>m.seat),[0,1]);assert.equal(starts[0].seed,starts[1].seed);
  c.send({type:"join",code});assert.equal((await c.next()).type,"error");
  const ack=(p,seq,digest="1234abcd")=>p.send({type:"ack",seq,digest});
  const pick=(p,seq,slot)=>p.send({type:"command",seq,command:{kind:"pick",slot}});
  ack(a,0);pick(a,0,0);assert.equal((await a.next()).type,"error");
  ack(b,0);for(const p of [a,b])assert.deepEqual(await p.next(),{type:"turn",seat:0,seq:0});
  pick(b,0,1);assert.equal((await b.next()).type,"error");
  pick(a,0,22);assert.equal((await a.next()).type,"error");
  pick(a,0,0);for(const p of [a,b])assert.equal((await p.next()).seq,1);
  ack(a,1);ack(b,1);for(const p of [a,b])assert.equal((await p.next()).seat,1);
  pick(b,0,1);assert.equal((await b.next()).type,"error");
  pick(b,1,0);assert.equal((await b.next()).type,"error");
  pick(b,1,1);for(const p of [a,b])assert.equal((await p.next()).seq,2);
  ack(a,2);ack(b,2,"00000000");for(const p of [a,b])assert.match((await p.next()).reason,/disagree/);
  c.send({type:"create"});const second=await c.next();const d=client(t);await once(d.ws,"open");
  d.send({type:"join",code:second.code});await Promise.all([c.next(),d.next()]);d.ws.close();
  assert.match((await c.next()).reason,/disconnected/);
  const foreign=new WebSocket(origin.replace("http","ws")+"/rooms",{origin:"https://example.org"});
  await once(foreign,"error");
  assert.equal((await fetch(origin+"/server/serve.mjs")).status,404);
  assert.equal((await fetch(origin+"/package-lock.json")).status,404);
  assert.equal((await (await fetch(origin+"/healthz")).json()).ok,true);
});
