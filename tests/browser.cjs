const assert=require("node:assert/strict");
const playwright=require(process.env.PLAYWRIGHT_MODULE||"playwright-core");
const golden=require("./captures/presentation.json");
const matchGolden=require("./captures/match-presentation.json");
const spreadGolden=require("./captures/spread-presentation.json");
const url=process.argv[2];
if(!url)throw Error("Pass the native Target Practice URL");

async function pixelParity(page){
  const results=await page.evaluate(async gold=>{
    const {RangeDisplay,loadArt}=await import("./presentation.mjs");
    const {loadEngine,setup,launch,step,groundPose}=await import("./sim.mjs");
    const canvas=document.createElement("canvas");canvas.width=800;canvas.height=600;
    const scene=await(await fetch("range.json")).json(),art=await loadArt();
    const display=new RangeDisplay(canvas,art,scene),s=setup(await loadEngine(),scene);
    const ui={angles:[60,120],powers:[20,20],turnTime:0,pointer:{x:799,y:599}};
    const digest=async pixels=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",pixels)),x=>x.toString(16).padStart(2,"0")).join("");
    const frame=async()=>{display.draw(s,ui,0);return digest(display.ctx.getImageData(0,0,800,600).data)};
    const poses=gold.groundPoses.map(([x])=>groundPose(s,x));
    display.bind(s);
    const initial=await frame();launch(s,60,20);
    for(let i=0;i<1000&&s.turn===0;i++){
      step(s);
    }
    const after=await frame();
    const fx=document.createElement("canvas");fx.width=46;fx.height=46;const g=fx.getContext("2d",{willReadFrequently:true});
    const blasts=[];
    for(const {phase} of gold.blast){
      g.clearRect(0,0,46,46);g.drawImage(art.images.blast,phase%8*46,Math.floor(phase/8)*46,46,46,0,0,46,46);
      blasts.push(await digest(g.getImageData(0,0,46,46).data));
    }
    return {frames:[initial,after],blasts,poses};
  },golden);
  assert.deepEqual(results.frames,golden.frames,"Original framebuffer RGBA mismatch");
  assert.deepEqual(results.blasts,golden.blast.map(f=>f.sha256),"Explosion pixels differ");
  for(const [i,actual] of results.poses.entries()){
    const expected=golden.groundPoses[i];assert.deepEqual(actual.slice(0,2),expected.slice(0,2));assert(Math.abs(actual[2]-expected[2])<1e-10);
  }
  console.log("PASS two complete 800 x 600 original frames, "+results.blasts.length+" captured blast images, "+results.poses.length+" terrain poses");
  const match=await page.evaluate(async gold=>{
    const {RangeDisplay,loadArt}=await import("./presentation.mjs");
    const {setup,loadEngine}=await import("./sim.mjs");
    const scene=await(await fetch("./match-range.json")).json(),art=await loadArt();
    const s=setup(await loadEngine(),scene,"match"),board=document.createElement("canvas");
    board.width=800;board.height=600;
    const display=new RangeDisplay(board,art,scene);display.reset(scene,"match");
    display.draw(s,{angles:s.tanks.map(t=>360-t[3]),powers:s.tanks.map(t=>t[4]),turnTime:0},0);
    const g=board.getContext("2d"),field=g.getImageData(0,0,800,450).data,[x,y]=s.tanks[s.turn];
    for(let j=y-100;j<y-20;j++)field.fill(0,(j*800+x-20)*4,(j*800+x+20)*4);
    const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),v=>v.toString(16).padStart(2,"0")).join("");
    const matchField=await hash(field),fx=document.createElement("canvas");fx.width=fx.height=102;
    const ctx=fx.getContext("2d",{willReadFrequently:true}),blast=[];
    for(const {phase} of gold.blast){
      ctx.clearRect(0,0,102,102);
      ctx.drawImage(art.images["big-blast"],phase%8*102,Math.floor(phase/8)*102,102,102,0,0,102,102);
      blast.push(await hash(ctx.getImageData(0,0,102,102).data));
    }
    return {matchField,blast};
  },matchGolden);
  assert.equal(match.matchField,matchGolden.matchField,"Two-player opening field differs from original");
  assert.deepEqual(match.blast,matchGolden.blast.map(f=>f.sha256));
  console.log("PASS original two-player field and "+match.blast.length+" captured Big Shot blast frames");
  const spread=await page.evaluate(async reference=>{
    const {loadArt}=await import("./presentation.mjs");
    const art=await loadArt(),result=[];
    for(const [atlas,films] of Object.entries(reference)){
      for(const {size,phases} of films){
        const canvas=document.createElement("canvas");canvas.width=canvas.height=size;
        const ctx=canvas.getContext("2d",{willReadFrequently:true});
        for(const {phase} of phases){
          ctx.clearRect(0,0,size,size);
          ctx.drawImage(art.images[atlas],phase%8*size,Math.floor(phase/8)*size,size,size,0,0,size,size);
          const hash=await crypto.subtle.digest("SHA-256",ctx.getImageData(0,0,size,size).data);
          result.push(Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,"0")).join(""));
        }
      }
    }
    return result;
  },spreadGolden);
  assert.deepEqual(spread,Object.values(spreadGolden).flat().flatMap(f=>f.phases.map(p=>p.sha256)));
  console.log("PASS "+spread.length+" spread-weapon blast phases from the original framebuffer");
  const tracerPixels=await page.evaluate(async()=>{
    const {loadArt,RangeDisplay}=await import("./presentation.mjs");
    const scene=await(await fetch("./range.json")).json(),canvas=document.createElement("canvas");
    canvas.width=40;canvas.height=153;
    const display=new RangeDisplay(canvas,await loadArt(),scene),ctx=display.ctx;
    ctx.fillStyle="#000";ctx.fillRect(0,0,40,153);
    for(let i=0;i<9;i++)display.tracer((i-4)*5,20,17*i+8);
    const hash=await crypto.subtle.digest("SHA-256",ctx.getImageData(0,0,canvas.width,canvas.height).data);
    return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,"0")).join("");
  });
  assert.equal(tracerPixels,"aa24771fffc52d1d441e6cbb021b5af829a268020f4e7276aff8c6282090969e","Original tracer label pixels");
}

async function projectileParity(page){
  const totals=await page.evaluate(async()=>{
    const {loadEngine,setup,launch,step}=await import("./sim.mjs");
    const {weapons}=await import("./match.mjs");
    const {paintParticles}=await import("./particles.mjs");
    const engine=await loadEngine();
    const response=await fetch("./tests/captures/deluxe.json.gz");
    if(!response.ok)throw Error("Missing original Deluxe shots");
    const traces=await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).json();
    let updates=0,blends=0;
    for(const trace of traces){
      const state=setup(engine,trace);
      state.selected[state.turn]=weapons.findIndex(w=>w.entry===trace.trigger);
      if(!launch(state,360-trace.angle,trace.power))throw Error("Could not launch "+trace.file);
      let frame=0;
      for(let tick=0;state.inVolley&&tick<10000;tick++){
        const active=state.balls.slice();
        step(state);
        for(const ball of active){
          const row=trace.frames[frame++];
          if(!row||tick!==row[0]||ball.x!==row[1]||ball.y!==row[2]||ball.vx!==row[3]||ball.vy!==row[4])
            throw Error(trace.file+" projectile diverged at tick "+tick);
        }
      }
      if(state.inVolley||frame!==trace.frames.length)throw Error(trace.file+" incomplete replay");
      updates+=frame;
      if(trace.pixelBlends){
        const samples=trace.pixelBlends,canvas=document.createElement("canvas");
        canvas.width=800;canvas.height=Math.ceil(samples.length/800);
        const ctx=canvas.getContext("2d",{willReadFrequently:true}),base=ctx.createImageData(800,canvas.height);
        const particles=samples.map(([before,r,g,b,alpha],i)=>{
          base.data.set([before>>>16&255,before>>>8&255,before&255,255],i*4);
          return {x:i%800,y:Math.floor(i/800),color:[r,g,b],alpha};
        });
        ctx.putImageData(base,0,0);
        paintParticles(ctx,{fx:{particles},solid:new Uint8Array(800*canvas.height)});
        const pixels=ctx.getImageData(0,0,800,canvas.height).data;
        samples.forEach((row,i)=>{
          const rgb=(pixels[4*i]<<16)|(pixels[4*i+1]<<8)|pixels[4*i+2];
          if(rgb!==(row[5]&0xffffff))throw Error(trace.file+" particle color at "+i);
        });
        blends+=samples.length;
      }
    }
    return [traces.length,updates,blends];
  });
  console.log("PASS "+totals[0]+" original volleys, "+totals[1]+" exact projectile updates and "+totals[2]+" particle pixel comparisons in browser");
}

async function exercise(browser,touch){
  const page=await browser.newPage({viewport:touch?{width:390,height:750}:{width:1366,height:768},isMobile:touch,hasTouch:touch});
  try{
    const errors=[],requests=[];page.on("pageerror",e=>errors.push(e.message));page.on("response",r=>requests.push([r.status(),r.url()]));
    await page.addInitScript(()=>{
      // The deal includes Super Skipper, Sniper Rifle, Laser, Popcorn, Color Bomb and an opening Single Shot.
      const fill=Crypto.prototype.getRandomValues;
      Crypto.prototype.getRandomValues=function(bytes){
        if(bytes instanceof Uint32Array&&bytes.length===1){bytes[0]=51;return bytes}
        return fill.call(this,bytes);
      };
    });
    await page.addInitScript(require("./record-sounds.cjs"));
    await page.goto(url);await page.waitForFunction(()=>document.querySelector("#status").textContent.startsWith("Player 1"));
    assert(!requests.some(([,u])=>u.includes("/audio/")),"Audio downloaded before first interaction");
    if(!touch){await pixelParity(page);await projectileParity(page)}
    const screen=page.locator("#board");
    const xy=async(x,y)=>{const r=await screen.boundingBox();return [r.x+x*r.width/800,r.y+y*r.height/600]};
    const tap=async(x,y)=>{const [cx,cy]=await xy(x,y);if(touch)await page.touchscreen.tap(cx,cy);else await page.mouse.click(cx,cy)};
    const click=async id=>touch?page.locator(id).tap():page.locator(id).click();
    const status=prefix=>page.waitForFunction(v=>document.querySelector("#status").textContent.startsWith(v),prefix);
    const pixel=()=>page.locator("canvas").evaluate(c=>Array.from(c.getContext("2d").getImageData(153,216,1,1).data));
    const initial=await pixel();
    for(const stretched of [false,true]){
      if(stretched)await click("#size");
      const r=await screen.boundingBox();assert(stretched?Math.abs(r.width/r.height-4/3)>.2:Math.abs(r.width/r.height-4/3)<.01);
      await tap(552,506);assert.equal(await page.locator("#angle").getAttribute("aria-label"),"Adjust aim, 59 degrees");
      await tap(493,505);await tap(552,574);assert.equal(await page.locator("#power").getAttribute("aria-label"),"Adjust power, 21");
      await tap(493,574);
    }
    if(!touch){
      for(const [x,y,control,expected] of [[520,482,"angle","Adjust aim, 55 degrees"],[497,548,"power","Adjust power, 25"]]){
        await tap(x,y);
        let target=await xy(x+20,y+30);
        if(browser.browserType().name()==="firefox"&&await page.evaluate(()=>!!document.pointerLockElement)){
          // Firefox's automation driver places a locked pointer at viewport center after each event.
          const {width,height}=await screen.boundingBox(),viewport=page.viewportSize();
          target=[viewport.width/2+20*width/800,viewport.height/2+30*height/600];
        }
        await page.mouse.move(...target);await page.mouse.down();await page.mouse.up();
        assert.equal(await page.locator("#"+control).getAttribute("aria-label"),expected);
      }
      await click("#reset");
    }
    await tap(405,493);await status("Shot in flight");await status("Player 2");assert.notDeepEqual(await pixel(),initial);
    await page.waitForFunction(()=>played.includes("cannon.wav")&&played.includes("expmedium2.wav"));
    await tap(405,493);await status("Player 1");await click("#reset");assert.deepEqual(await pixel(),initial);
    await tap(248,490);await status("Moving");await status("Player 1");
    for(const [name,id] of [["3 Shot","#three"],["5 Shot","#five"],["Flash Blast","#weapon-9"]]){
      await tap(311,566);
      for(let i=0;i<60&&!(await page.locator(id).isVisible());i++)await tap(397,575);
      await click(id);
      assert.equal(await page.locator("#fire").getAttribute("aria-label"),"Fire "+name);
    }
    await click("#full");await page.waitForFunction(()=>document.fullscreenElement||document.querySelector(".expanded"));
    if(browser.browserType().name()==="firefox"){
      await page.waitForFunction(height=>innerHeight===height,page.viewportSize().height);
    }
    await tap(552,574);assert.equal(await page.locator("#power").getAttribute("aria-label"),"Adjust power, 21");
    await tap(770,590);assert(await page.locator("#no").isVisible());await click("#full");await tap(440,288);
    await click("#sound");assert.equal(await page.locator("#sound").getAttribute("aria-pressed"),"false");
    await click("#newmatch");await status("Weapon shop · Player 1");
    const dealt=await page.locator('[id^="pick-"]').evaluateAll(buttons=>buttons.map(b=>b.getAttribute("aria-label").slice(6)));
    assert.equal(dealt.length,20);assert.equal(dealt[0],"Single Shot");
    await tap(300,135);await status("Weapon shop · Player 2");
    assert(await page.locator("#pick-0").isHidden());
    await tap(300,162);await status("Weapon shop · Player 1");await tap(402,423);
    await status("Player 1");
    await page.locator("#power").focus();
    for(let p=20;p<57;p++)await page.keyboard.press("ArrowUp");
    assert.equal(await page.locator("#power").getAttribute("aria-label"),"Adjust power, 57");
    const fired=[];
    // A shell can strike in a single 4 ms step. Record status transitions
    // before pressing Fire, including shells that land before the next poll.
    await page.evaluate(()=>{
      new MutationObserver(records=>{
        for(const record of records)for(const node of record.addedNodes){
          if(node.textContent.startsWith("Shot in flight"))window.sawLaunch=true;
        }
      }).observe(document.getElementById("status"),{childList:true});
    });
    for(let n=0;n<20;n++){
      const ready=await page.locator("#status").textContent();
      assert(ready.includes("Volley "+(1+Math.floor(n/2))+" ·"),ready);
      fired.push(await page.locator("#fire").getAttribute("aria-label"));
      await page.evaluate(()=>{window.sawLaunch=false});
      await tap(405,493);
      await page.waitForFunction(()=>window.sawLaunch);
      await status(n===19?"Game over":"Player "+(n%2===0?2:1));
      if(n===0)assert.match(await page.locator("#status").textContent(),/Score 60 to 0$/);
    }
    assert.deepEqual(fired.map(label=>label.slice(5)).sort(),dealt.sort());
    assert(await page.locator("#fire").isHidden());
    await tap(320,253);await status("Weapon shop");await tap(402,423);await status("Player 1");
    await click("#practice");await status("Player 1");
    assert.equal(await page.locator("#fire").getAttribute("aria-label"),"Fire Single Shot");
    console.log("PASS ten-volley match, manual and random draft, every drafted weapon, game over, rematch and return to practice");
    assert.deepEqual(errors,[]);assert(!requests.some(([s,u])=>s>=400||/\.(exe|dll)(\?|$)|boxedwine/i.test(u)));
    console.log("PASS "+(touch?"touch / GPU disabled":"desktop")+" fitted and stretched pointer mapping, turns, blast, movement, audio, weapon menu, fullscreen and reset");
  }finally{await page.close()}
}
const browserName=process.argv[3]||"chromium";
(async()=>{for(const touch of browserName==="chromium"?[false,true]:[false]){
  const options=browserName==="firefox"?{firefoxUserPrefs:{
    "full-screen-api.transition-duration.enter":"0 0","full-screen-api.transition-duration.leave":"0 0"
  }}:{};
  if(browserName==="chromium")Object.assign(options,{executablePath:process.env.EDGE_PATH,args:touch?["--disable-gpu","--disable-webgl"]:[]});
  const browser=await playwright[browserName].launch(options);
  try{await exercise(browser,touch)}finally{await browser.close()}
}})().catch(e=>{console.error(e);process.exitCode=1});
