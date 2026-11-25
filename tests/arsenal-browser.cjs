const assert=require("node:assert/strict");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||"playwright-core");
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.EDGE_PATH});
  try{
    const page=await browser.newPage(),errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.goto(new URL("?mode=practice",process.argv[2]).href);
    await page.locator("#fire").waitFor();
    const result=await page.evaluate(async()=>{
      const {setup,step,launch,loadEngine}=await import("./sim.mjs");
      const {weapons}=await import("./match.mjs");
      const {RangeDisplay,loadArt}=await import("./presentation.mjs");
      const [engine,art,scene]=await Promise.all([loadEngine(),loadArt(),fetch("range.json").then(r=>r.json())]);
      const canvas=document.createElement("canvas");canvas.width=800;canvas.height=600;
      const display=new RangeDisplay(canvas,art,scene),soundFiles=new Set();
      let frames=0,completed=0;
      for(const [id,w] of weapons.entries()){
        const s=setup(engine,{...scene,seed:42});
        display.reset();display.bind(s);s.selected[s.turn]=id;
        s.onSound=f=>soundFiles.add(f);
        for(const a of Object.values(w.actors))for(const key of ["sound","bounceSound","dropSound"])if(a[key])soundFiles.add(a[key]);
        for(const commands of Object.values(w.triggers))for(const c of commands)if(c.sound)soundFiles.add(c.sound);
        const ui={angles:[60,120],powers:[20,20],turnTime:0};
        launch(s,60,20);
        let tick=0,shape="";
        while(s.inVolley&&tick++<18000){
          step(s);const actors=[...s.balls,...s.special,...s.blasts].map(a=>a.actor.type).join();
          if(tick%24===0||shape!==actors){display.draw(s,ui,tick*4);frames++}
          shape=actors;
        }
        if(s.inVolley)throw Error(w.name+" volley did not finish");
        completed++;
      }
      for(const f of ["pop.wav","bigpop.wav","wooshpop.wav","cannonpop.wav","titlestart.wav","ballbounce.wav","logobounce.wav","crick.wav","pickweap.wav","rubberbullet.wav"])soundFiles.add(f);
      const ctx=new AudioContext();
      try{
        for(const f of soundFiles){
          const response=await fetch("./audio/"+f);if(!response.ok)throw Error(f+" HTTP "+response.status);
          const audio=await ctx.decodeAudioData(await response.arrayBuffer());if(!audio.length)throw Error("Empty "+f);
        }
      }finally{await ctx.close()}
      return {completed,frames,sounds:soundFiles.size};
    });
    assert.equal(result.completed,60);assert.deepEqual(errors,[]);
    console.log("PASS",result.completed,"weapons,",result.frames,"rendered frames,",result.sounds,"decoded sounds");
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
