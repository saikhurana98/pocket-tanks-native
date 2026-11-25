import {createRequire} from "node:module";
import {once} from "node:events";
import assert from "node:assert/strict";
import {resolve} from "node:path";
const [base,revision,release]=process.argv.slice(2);
const {WebSocket}=createRequire(resolve(release,"package.json"))("ws");
const origin=new URL(base).origin;
const socketURL=new URL("/rooms",origin);socketURL.protocol=socketURL.protocol==="https:"?"wss:":"ws:";
const clients=[];
const timeout=setTimeout(()=>{console.error("Room smoke check timed out");process.exit(1)},12000);
try{
  const health=await (await fetch(new URL("/healthz",origin))).json();assert.equal(health.revision,revision);
  assert.match(await (await fetch(origin)).text(),/name="pocket-rooms"/);
  for(let i=0;i<2;i++){const socket=new WebSocket(socketURL,{origin});clients.push(socket);await once(socket,"open")}
  const [a,b]=clients;
  const next=socket=>once(socket,"message").then(([data])=>JSON.parse(data));
  const created=next(a);a.send(JSON.stringify({type:"create"}));const {code}=await created;assert.match(code,/^[A-Z2-9]{6}$/);
  const start=clients.map(next);b.send(JSON.stringify({type:"join",code}));assert.deepEqual((await Promise.all(start)).map(m=>m.seat),[0,1]);
  const turns=clients.map(next);
  for(const s of clients)s.send(JSON.stringify({type:"ack",seq:0,digest:"00000000"}));
  for(const m of await Promise.all(turns))assert.equal(m.type,"turn");
  console.log("Healthy revision "+revision+"; two clients joined and received the opening turn.");
}finally{clearTimeout(timeout);for(const s of clients)s.terminate()}
