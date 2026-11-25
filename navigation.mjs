import widths from "./art/menu-font.json" with {type:"json"};
import {weapons} from "./match.mjs";

const colors=["Red","Orange","Yellow","Green","Cyan","Blue","Purple","Pink"];
export const ink=["#ff0000","#ff9600","#ffff00","#00ff00","#00ffff","#5872ff","#af42ff","#ff38ff"];
const menuImages=["launch","title","mode","setup","options","cpu","logo","ball","font","start0","start1","start2","depot0","depot1","depot2"];
menuImages.push("preset-load","preset-save","preset-delete");
export async function loadMenus(){
  return Object.fromEntries(await Promise.all(menuImages.map(async name=>{
    const img=new Image();img.src="./art/menu-"+name+".png";await img.decode();return [name,img];
  })));
}
export class Navigation{
  constructor(layer,display,art,actions){
    Object.assign(this,{layer,display,art,actions,page:null,players:[{name:"Player 1",color:0},{name:"Player 2",color:1}],
      available:weapons.map((w,i)=>i).sort((a,b)=>weapons[a].slot-weapons[b].slot),fonts:new Map(),timers:[]});
    try{const prefs=JSON.parse(localStorage.getItem("pt-deluxe-menu"));
      if(prefs?.players?.length===2)this.players=prefs.players;
      if(prefs?.removed?.length<weapons.length)this.removed=prefs.removed;
      this.presets=new Map(prefs?.presets??[]);
    }catch{}
    this.removed??=[];
    this.presets??=new Map();
  }
  save(){try{localStorage.setItem("pt-deluxe-menu",JSON.stringify({players:this.players,removed:this.removed,presets:[...this.presets]}))}catch{}}
  area(tag,label,x,y,w,h){
    const el=document.createElement(tag);el.setAttribute("aria-label",label);
    Object.assign(el.style,{left:x/8+"%",top:y/6+"%",width:w/8+"%",height:h/6+"%"});this.layer.append(el);return el;
  }
  button(label,x,y,w,h,fn){
    const el=this.area("button",label,x,y,w,h);
    el.onpointerenter=()=>this.hot=label;el.onpointerleave=()=>this.hot=null;
    el.onpointerdown=()=>this.pressed=label;
    el.onpointerup=el.onpointercancel=()=>this.pressed=null;
    el.onclick=()=>{this.actions.unlock();this.actions.effect("crick.wav");fn()};
    return el;
  }
  hide(){
    this.page=null;this.layer.replaceChildren();this.layer.hidden=true;this.hot=null;this.pressed=null;
    this.timers.forEach(clearTimeout);this.timers=[];
  }
  show(page){
    this.hide();this.page=page;this.layer.hidden=false;this.age=0;
    this.layer.closest("#board").setAttribute("aria-label","Pocket Tanks Deluxe "+page);
    this.layer.setAttribute("aria-label",page);document.getElementById("targets").hidden=true;
    document.getElementById("status").textContent=page==="mode"?"Select game mode":page;
    const go=(...args)=>this.button(...args.slice(0,-1),()=>this.show(args.at(-1)));
    if(page==="launch"){
      go("Start Game",547,500,180,50,"title");
      this.button("Visit Weapon Depot",75,500,272,50,()=>window.open("https://www.blitwise.com/pocket-tanks","_blank","noopener"));
      this.actions.track(null);
    }else if(page==="title"){
      this.logo={y:-315,vy:400,bounces:0,clock:0};this.actions.track("pocket");
      this.actions.effect("titlestart.wav");
      for(const ms of [1050,1999,2482])this.timers.push(setTimeout(()=>this.actions.effect("ballbounce.wav"),ms));
      go("Start",514,549,162,33,"mode");go("Quit",689,549,94,33,"launch");
    }else if(page==="mode"){
      for(const [i,label] of ["1 Player","2 Players","LAN Game","Target Practice","Return to Title","Options"].entries()){
        const y=[90,140,190,240,290,390][i];
        this.button(label,[277,255,265,167,166,286][i],y,[246,289,270,467,468,227][i],44,()=>{
          if(i<=1){this.single=i===0;this.show("player1")}
          else if(i===2)this.show("network");
          else if(i===3)this.actions.start("practice");
          else if(i===4)this.show("title");
          else {this.working=this.removed.slice();this.show("options")}
        });
      }
    }else if(page==="player1"||page==="player2"){
      const id=Number(page.slice(-1))-1,player=this.players[id];
      const input=this.area("input","Player "+(id+1)+" name",410,161,371,48);
      input.maxLength=14;input.value=player.name;input.autocomplete="off";input.spellcheck=false;
      input.oninput=()=>player.name=input.value;
      input.onfocus=()=>input.select();input.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();input.blur()}};
      colors.forEach((label,i)=>this.button(label,201+i*50,268,45,40,()=>{
        if(this.players[1-id].color!==i){player.color=i;this.save()}
      }));
      this.button("Continue",273,364,254,48,()=>{
        player.name=player.name.trim()||"Player "+(id+1);this.save();
        if(!id)this.show(this.single?"cpu":"player2");else this.actions.start("match");
      });
    }else if(page==="options"){
      const included=this.area("select","Available in game",40,117,161,216),removed=this.area("select","Removed list",255,117,161,216);
      included.size=removed.size=16;
      const populate=()=>{for(const el of [included,removed])el.replaceChildren();
        for(const i of this.available){const opt=new Option(weapons[i].name,i);(this.working.includes(i)?removed:included).add(opt)}};
      const transfer=out=>{const from=out?included:removed;if(from.selectedIndex<0)return;const i=Number(from.value);
        if(out)this.working.push(i);else this.working=this.working.filter(n=>n!==i);populate()};
      populate();included.ondblclick=()=>transfer(true);removed.ondblclick=()=>transfer(false);
      this.button("Remove weapon",210,190,36,33,()=>transfer(true));this.button("Include weapon",210,229,36,33,()=>transfer(false));
      this.button("Include All",70,345,102,21,()=>{this.working=[];populate()});
      this.button("Remove All",285,345,102,21,()=>{this.working=this.available.slice();populate()});
      this.button("Default",670,345,69,21,()=>{this.working=[];populate()});
      for(const [i,label] of ["Load","Save As","Delete"].entries()){
        this.button(label,456+i*72,345,68,21,()=>this.show("preset-"+["load","save","delete"][i]));
      }
      for(const [label,x,y,w,action] of [["Sound FX",117,399,38,"fx"],["Music",117,424,38,"music"],["Display",327,399,92,"full"],["LCD Fullscreen",327,424,92,"size"]])
        this.button(label,x,y,w,22,()=>this.actions.toggle(action));
      this.button("Save & Exit",469,405,167,36,()=>{if(this.working.length===weapons.length){this.actions.effect("warn.wav");return}this.removed=this.working.slice();this.save();this.show("mode")});
      go("Cancel",655,405,125,36,"mode");
    }else if(page.startsWith("preset-")){
      const action=page.slice(7),list=this.area("select","Saved settings",210,111,381,185);
      list.size=12;for(const name of this.presets.keys())list.add(new Option(name,name));
      list.selectedIndex=-1;
      const input=this.area("input","Settings name",210,305,381,22);
      input.className="preset-name";input.maxLength=40;input.autocomplete="off";
      list.onchange=()=>{input.value=list.value};
      const submit=()=>{
        const name=input.value.trim();if(!name||(action!=="save"&&!this.presets.has(name))){this.actions.effect("warn.wav");return}
        if(action==="save")this.presets.set(name,this.working.slice());
        else if(action==="load")this.working=this.presets.get(name).slice();
        else this.presets.delete(name);
        this.save();this.show("options");
      };
      input.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();submit()}};
      this.button(action,250,336,101,21,submit);go("Cancel",450,336,101,21,"options");
    }else if(page==="cpu"){
      this.level??=5;
      for(let i=1;i<=10;i++)this.button("Difficulty "+i,67+(i-1)*66,241,64,43,()=>this.level=i);
      this.button("Continue",270,365,260,48,()=>this.show("computer"));
    }else if(page==="network"||page==="computer"){
      const box=this.area("div","Mode availability",207,153,386,140);
      box.className="menu-dialog";box.textContent=page==="network"?"LAN play is unavailable in the native port.":"Computer play is unavailable in the native port.";
      const back=this.button("Return to game modes",315,242,170,35,()=>this.show("mode"));back.className="visible-button";back.textContent="Return";
    }
  }
  back(){const pages={launch:"launch",title:"launch",mode:"title",player1:"mode",player2:"player1",cpu:"player1",options:"mode",network:"mode",computer:"mode"};this.show(this.page.startsWith("preset-")?"options":pages[this.page])}
  font(text,x,y,{color="#fff",scale=1,center=false,right=false,maxWidth=Infinity}={}){
    const key=color;let atlas=this.fonts.get(key);
    if(!atlas){atlas=document.createElement("canvas");atlas.width=this.art.font.width;atlas.height=this.art.font.height;
      const ctx=atlas.getContext("2d");ctx.drawImage(this.art.font,0,0);ctx.globalCompositeOperation="multiply";ctx.fillStyle=color;
      ctx.fillRect(0,0,atlas.width,atlas.height);ctx.globalCompositeOperation="destination-in";ctx.drawImage(this.art.font,0,0);this.fonts.set(key,atlas)}
    const chars=[...text.toUpperCase()].map(ch=>ch.charCodeAt(0)),width=c=>widths[c]??18;
    const advance=chars.reduce((v,c)=>v+width(c),0);
    scale=Math.min(scale,maxWidth/advance);
    if(center)x-=Math.floor(advance*scale/2);else if(right)x-=Math.ceil(advance*scale);
    for(const code of chars){const w=width(code);if(widths[code])this.display.ctx.drawImage(atlas,code%16*48,Math.floor((code-32)/16)*44,w,40,Math.round(x),y,w*scale,40*scale);x+=w*scale}
  }
  draw(dt){
    const c=this.display.ctx,p=this.page;this.age+=dt;
    if(p.startsWith("preset-")){
      c.drawImage(this.art.options,0,0);c.drawImage(this.art[p],200,74);return;
    }
    c.drawImage(this.art[({player1:"setup",player2:"setup",network:"mode",computer:"cpu"})[p]??p],0,0);
    if(p==="launch"){
      const label=this.hot==="Start Game"?"start":this.hot==="Visit Weapon Depot"?"depot":null;
      if(label)c.drawImage(this.art[label+(this.pressed===this.hot?"2":"1")],label==="start"?547:75,501);
      c.fillStyle="#999";c.font="8px monospace";c.fillText(weapons.length+" weapons found",9,56);
    }else if(p==="title"){
      const logo=this.logo;logo.clock+=dt;
      while(logo.clock>=.004){logo.clock-=.004;if(logo.bounces===3)continue;logo.vy+=800*.004;logo.y+=logo.vy*.004;
        if(logo.y>73){logo.y=73;logo.vy*=-.45;logo.bounces++;this.actions.effect("logobounce.wav")}}
      c.drawImage(this.art.logo,190,Math.trunc(logo.y));
      const text=["Blitwise Productions Presents","Pocket Tanks","The Ultimate One-on-One Artillery Game"];
      for(let i=0;i<3;i++){const t=this.age-1.4-i*.45;if(t<0)continue;this.font(text[i],400+Math.max(0,1-t)*800,324+i*31,{scale:i===2?.53:.72,center:true})}
      for(let i=0;i<3;i++){
        const x=(this.age*(70+i*17)+i*291)%854-27,y=266-Math.abs(Math.sin(this.age*(1.5+i*.18)+i))*106;
        c.drawImage(this.art.ball,0,0,28,27,Math.trunc(x),Math.trunc(y),28-i*4,27-i*4)}
    }else if(p.startsWith("player")){
      const id=Number(p.slice(-1))-1,pl=this.players[id];
      this.font("Player "+(id+1),400,89,{center:true,color:"#aaa"});
      if(document.activeElement!==this.layer.querySelector("input"))this.font(pl.name,413,165);
      this.font(colors[pl.color],413,215,{color:ink[pl.color]});c.strokeStyle="#bbb";c.lineWidth=2;c.strokeRect(203+pl.color*50,269,42,37);
    }else if(p==="cpu"){
      c.strokeStyle="#bbb";c.lineWidth=2;c.strokeRect(68+(this.level-1)*66,244,62,37);
    }else if(p==="options"){
      for(const [act,x,y,w] of [["fx",119,401,34],["music",119,426,34],["full",329,401,87],["size",329,426,87]]){
        c.fillStyle="#c6c6c6";c.fillRect(x,y,w,17);c.fillStyle="#111";c.font="bold 12px sans-serif";c.textAlign="center";c.fillText(this.actions.optionLabel(act),x+w/2,y+13);c.textAlign="left"}
    }
  }
}
