const assert=require("node:assert/strict");
const {createHash}=require("node:crypto");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||"playwright-core");

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.EDGE_PATH});
  try{
    const page=await browser.newPage();
    await page.goto(process.argv[2]);await page.locator("#menu button").first().waitFor();
    const result=await page.evaluate(async()=>{
      const {menuGroups,glyphPosition,orbitSprites,drawCredits}=await import("./menu-motion.mjs");
      const {Navigation,loadMenus}=await import("./navigation.mjs");
      const {loadEngine,setup,launch,step}=await import("./sim.mjs");
      const {RangeDisplay,loadArt}=await import("./presentation.mjs");
      const {weapons}=await import("./match.mjs");
      const canvas=document.createElement("canvas");canvas.width=800;canvas.height=600;
      const [menus,art,engine,scene]=await Promise.all([loadMenus(),loadArt(),loadEngine(),fetch("range.json").then(r=>r.json())]);
      const display=new RangeDisplay(canvas,art,scene),ctx=display.ctx;
      const nav=new Navigation(document.createElement("div"),display,menus,{});
      nav.page="mode";nav.age=0;
      const groups=menuGroups("mode");
      const starts=groups.map(g=>glyphPosition(g,0,.056).map(v=>+v.toFixed(3)));
      const pixelDifference=()=>{
        const frame=ctx.getImageData(0,0,800,450).data;
        ctx.drawImage(menus.mode,0,0);const original=ctx.getImageData(0,0,800,450).data;
        let changed=0;
        for(let i=0;i<frame.length;i+=4)if(frame[i]!==original[i]||frame[i+1]!==original[i+1]||frame[i+2]!==original[i+2])changed++;
        return changed;
      };
      nav.draw(.25);const entering=pixelDifference();
      nav.draw(3);
      nav.leaveLetters(null,()=>{});nav.draw(0);const settled=pixelDifference();
      nav.leaveLetters(1,()=>{});nav.draw(.4);const leaving=pixelDifference();
      const orbit=orbitSprites(3.58,-120).map(b=>[b.x,b.y,b.frame]);
      const credits=[9,26.216,40.404,54.832].map(seconds=>{
        const draws=[];
        const capture={save(){},restore(){},beginPath(){},rect(){},clip(){},
          drawImage(_,sx,sy,w,h,x,y){draws.push([String.fromCharCode(32+sy/32*16+sx/32),x,y])}};
        drawCredits(capture,menus.credits,seconds);
        return draws;
      });

      // PC framebuffer coordinates from original Target Practice, flat terrain.
      // The first group of each run samples the outbound path; the last groups
      // for Napalm and Hail Storm also exercise their secondary actors.
      const cases=[
        ["Single Shot",0,100,42,[[41,260,284],[99,294,165],[153,326,68]]],
        ["Chain Reaction",1,49,2919929754,[[35,558,335],[86,542,284],[141,525,242]]],
        ["Fire Bolt",0,49,2503951733,[[22,242,355],[170,289,227],[327,338,196],[484,387,271]]],
        ["Napalm",0,49,1529545598,[[37,248,333],[86,263,284],[633,426,399]]],
        ["Hail Storm",1,49,1529545598,[[38,557,332],[93,540,278],[622,381,398]]]
      ];
      const samples=[];
      for(const [name,turn,power,seed,checkpoints] of cases){
        const field={...scene,seed,turn,tanks:[[235,400,0,284,power],[575,400,0,256,power]],terrain:{runs:[320000,40000]}};
        const s=setup(engine,field);display.reset(field);display.bind(s);
        // Isolate flight pixels from the randomly coloured PC terrain.
        display.g.fillStyle="#000";display.g.fillRect(0,0,800,450);
        s.selected[turn]=weapons.findIndex(w=>w.name===name);launch(s,360-field.tanks[turn][3],power);
        const ui={angles:[76,104],turnTime:0,powers:[power,power]};
        for(const [tick,x,y] of checkpoints){
          while(s.tick<tick&&s.inVolley)step(s);
          display.draw(s,ui,tick*4);
          const rgba=ctx.getImageData(x-6,y-6,13,13).data;
          let peak=0;
          for(let i=0;i<rgba.length;i+=4){
            const [r,g,b]=rgba.subarray(i,i+3);
            let intensity=Math.max(r,g,b);
            if(name==="Fire Bolt"||(name==="Napalm"&&tick>600))intensity=r>g&&g>b?r:0;
            if(name==="Hail Storm"&&tick>600)intensity=b>g&&g>r?b:0;
            peak=Math.max(peak,intensity);
          }
          samples.push([name,tick,peak]);
        }
      }
      return {starts,entering,settled,leaving,orbit,credits,samples};
    });
    assert.deepEqual(result.starts,[[-28.632,90],[794.632,140],[-26.632,190],[794.632,240],[-26.632,290],[292,444.632]]);
    assert(result.entering>10000);assert.equal(result.settled,0);assert(result.leaving>5000);
    assert.deepEqual(result.orbit,[[153,194,107],[245,278,17],[716,199,47],[545,155,157],[346,159,197]]);
    assert.deepEqual(result.credits.map(row=>createHash("sha256").update(JSON.stringify(row)).digest("hex")),[
      "33be9d7795d69940d06f3a45516dbbc731e9b3f4a70f7d70b20a0e039e418315",
      "eb7a4555b91ba8706ab28ac35dbdd3cc6fefb9c4abb31468a57456f7ba46833a",
      "9abe87ac7daa88bd65fb4a33523479ea79ef26b3dbf095f2ffc10ab43bdde662",
      "24fe7a75dcd3a68af72dc7f8eb91ee667bff5052cf2308f165256d8522bf4523"
    ]);
    for(const [weapon,tick,peak] of result.samples){
      assert(peak>=96,`${weapon} at PC tick ${tick}, peak ${peak}`);
      if(weapon==="Fire Bolt")assert.equal(peak,231,"original peak red at tick "+tick);
      if(weapon==="Single Shot")assert.equal(peak,254,"original peak cyan at tick "+tick);
    }
    console.log("PASS PC menu glyph coordinates, settled screen pixels, exit motion, five orbit sprites and",result.samples.length,"visible projectile samples.");
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
