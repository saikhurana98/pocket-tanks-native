import {createServer} from "node:http";
import {readFile,stat} from "node:fs/promises";
import {createReadStream} from "node:fs";
import {fileURLToPath} from "node:url";
import {extname,join} from "node:path";
import {attachRooms} from "./rooms.mjs";

const root=fileURLToPath(new URL("../",import.meta.url));
const html=(await readFile(join(root,"index.html"),"utf8")).replace("</head>",'<meta name="pocket-rooms" content="/rooms"></head>');
const mime={".html":"text/html; charset=utf-8",".css":"text/css",".js":"text/javascript",".mjs":"text/javascript",".json":"application/json",".wasm":"application/wasm",".png":"image/png",".webp":"image/webp",".bin":"application/octet-stream",".wav":"audio/wav",".mp3":"audio/mpeg"};
const publicFile=/^\/(?:[\w-]+\.(?:mjs|js|css|json)|(?:art|audio|engine)\/[\w.-]+\.(?:png|webp|bin|wav|mp3|json|wasm))$/;
export const server=createServer(async(req,res)=>{
  const path=(req.url??"").split("?")[0];
  if(req.method!=="GET"&&req.method!=="HEAD"){res.writeHead(405,{Allow:"GET, HEAD"}).end();return}
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Cache-Control","no-cache");
  if(path==="/healthz"){res.writeHead(200,{"Content-Type":"application/json"}).end(JSON.stringify({ok:true,revision:process.env.REVISION||"local"}));return}
  if(path==="/"||path==="/index.html"){res.writeHead(200,{"Content-Type":mime[".html"]}).end(html);return}
  if(!publicFile.test(path)||path.startsWith("/package")){res.writeHead(404).end();return}
  const file=join(root,path);
  try{
    const info=await stat(file);
    if(!info.isFile())throw Error();
    res.writeHead(200,{"Content-Type":mime[extname(file)],"Content-Length":info.size});
    if(req.method==="HEAD")res.end();
    else createReadStream(file).on("error",()=>res.destroy()).pipe(res);
  }catch{res.writeHead(404).end()}
});
attachRooms(server);
server.listen(Number(process.env.PORT??8080),process.env.HOST||"127.0.0.1",()=>console.log("Pocket Tanks listening on port "+server.address().port));
