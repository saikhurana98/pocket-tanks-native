const assert = require("node:assert/strict");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const oracle = require("./captures/shot-presentations.json");
const impactTicks = require("./captures/presented-blast.json");
const controls = require("./captures/control-regions.json");
const hitGlyphs = require("./captures/hit-numbers.json").glyphs;

async function verifyHitGlyphs(page) {
  const actual=await page.evaluate(async strings=>{
    const {RangeDisplay,loadArt}=await import("./presentation.mjs");
    const range=await(await fetch("range.json")).json();
    const canvas=document.createElement("canvas");canvas.width=160;canvas.height=16;
    // Preserve transparency for comparison with the isolated original glyphs.
    canvas.getContext("2d",{alpha:true,willReadFrequently:true});
    const display=new RangeDisplay(canvas,await loadArt(),range);
    const out={};
    for(const text of strings){
      display.ctx.clearRect(0,0,160,16);
      const width=text.length*5+(text.startsWith("-")?1:0);
      display.hitNumber({text,x:Math.floor(width/2),y:0,phase:0});
      const pixels=display.ctx.getImageData(0,0,width,7);
      const hash=await crypto.subtle.digest("SHA-256",pixels.data);
      out[text]=Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,"0")).join("");
    }
    return out;
  },Object.keys(hitGlyphs));
  assert.deepEqual(actual,hitGlyphs);
  console.log("Floating hit glyphs: all ten digits, minus sign and spacing match the original");
}

async function verifyFilm(page) {
  const result = await page.evaluate(async () => {
    const {replayFilm} = await import("./tests/shot-film.mjs");
    return (await replayFilm()).map(f=>f.different);
  });
  assert.equal(result.length,57);
  result.forEach((n,i)=>assert.equal(n,0,`Frame ${i+1} differs in ${n} pixels`));
  console.log(`Single Shot crop replay: ${result.filter(n=>n===0).length}/${result.length} exact; ${result.reduce((a,b)=>a+b)} differing pixels`);
  const mismatches=await page.evaluate(async ref=>{
    const {loadEngine,setup,step,launch}=await import("./sim.mjs");
    const {RangeDisplay,loadArt}=await import("./presentation.mjs");
    const canvas=document.createElement("canvas");canvas.width=800;canvas.height=600;
    const range=await(await fetch("range.json")).json();
    const display=new RangeDisplay(canvas,await loadArt(),range),state=setup(await loadEngine(),range);
    const colors=new Map(ref.palette.map(([r,g,b],i)=>[r+g*256+b*65536,i+1]));
    display.bind(state);launch(state,60,20);
    const bad=[];let tick=0;
    for(const [last,hash] of ref.runs)while(tick<last){
      step(state);tick++;display.draw(state,{angles:[60,120],powers:[20,20],turnTime:0},tick*4);
      const rgba=display.ctx.getImageData(...ref.rect).data,mask=new Uint8Array(rgba.length/4);
      for(let k=0;k<mask.length;k++){
        const i=k*4,r=rgba[i],g=rgba[i+1],b=rgba[i+2];
        mask[k]=colors.get(r+256*g+65536*b)??(g>=24&&(g-24)%23===0&&b>=g&&r<30?g:0);
      }
      const digest=await crypto.subtle.digest("SHA-256",mask);
      if(Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join("")!==hash)bad.push(tick);
    }
    if(tick!==ref.flight+ref.impact)throw Error("Incomplete PC recording");
    return bad;
  },oracle);
  assert.deepEqual(mismatches,[],"PC effect visibility at consecutive physics updates");
  console.log("188 consecutive flight and 166 impact updates match the original effect masks");
  const errors = await page.evaluate(async ({ticks,foreground}) => {
    const {loadEngine,setup,launch,step} = await import("./sim.mjs");
    const engine = await loadEngine(),range = await (await fetch("range.json")).json();
    const state = setup(engine,range);
    launch(state,60,20);
    while(!state.blasts.length && state.inVolley)step(state);
    if(!state.blasts.length)throw Error("Expected a Single Shot impact");
    const read = async url => {
      const image = new Image();image.src=url;await image.decode();
      const c=document.createElement("canvas");c.width=image.width;c.height=image.height;
      const g=c.getContext("2d",{willReadFrequently:true});g.drawImage(image,0,0);return g;
    };
    const [reference,atlas]=await Promise.all([read("tests/captures/presented-blast.png"),read("art/blast.webp")]);
    let elapsed=0;
    return ticks.map((tick,i)=>{
      while(elapsed<tick){step(state);elapsed++}
      const phase=state.blasts[0]?.phase??0;
      const rgba=(g,index)=>g.getImageData(index%8*46,Math.floor(index/8)*46,46,46).data;
      const a=rgba(reference,i),b=rgba(atlas,phase);let diff=0;
      // The original draws the white floating score above the explosion.
      for(const pixel of foreground[i])b.fill(0,4*pixel,4*pixel+4);
      for(let k=0;k<a.length;k+=4)if(a[k]!==b[k]||a[k+1]!==b[k+1]||a[k+2]!==b[k+2]||a[k+3]!==b[k+3])diff++;
      return diff;
    });
  },{ticks:impactTicks,foreground:require("./captures/blast-foreground.json")});
  errors.forEach((n,i)=>assert.equal(n,0,`Impact update ${impactTicks[i]} differs`));
  console.log(`Display-boundary blast: ${errors.filter(n=>!n).length}/${errors.length} exact color masks`);
}

async function verifyDraft(page) {
  await page.evaluate(require("./record-sounds.cjs"));
  await page.evaluate(async () => {
    window.dealFrames=[];
    const {RangeDisplay}=await import("./presentation.mjs"),shop=RangeDisplay.prototype.shop;
    RangeDisplay.prototype.shop=function(state,ui) {
      const count=state.pool?.filter(w=>w!==null).length??0;
      if(window.dealFrames.at(-1)!==count)window.dealFrames.push(count);
      return shop.call(this,state,ui);
    };
  });
  await page.locator("#newmatch").evaluate(b=>b.click());
  await page.locator("#pick-0").press("Enter");
  await page.waitForFunction(()=>dealFrames.includes(19));
  await page.locator("#random").press("Enter");
  await page.waitForFunction(()=>played.filter(n=>n==="pickweap.wav").length>=19);
  await page.waitForFunction(()=>document.getElementById("status").textContent.startsWith("Player 1"));
  const {counts,played}=await page.evaluate(()=>({counts:dealFrames.slice(dealFrames.indexOf(19)),played}));
  assert.deepEqual(counts,Array.from({length:20},(_,i)=>19-i));
  assert.equal(played.filter(n=>n==="crick.wav").length,2);
  assert.equal(played.filter(n=>n==="pickweap.wav").length,19);
  await page.locator("#newmatch").evaluate(b=>b.click());
  await page.locator("#random").press("Enter");
  await page.waitForFunction(()=>document.getElementById("random").disabled);
  await page.locator("#practice").evaluate(b=>b.click());
  await page.waitForTimeout(250);
  const count=await page.evaluate(()=>played.length);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>played.length),count);
  console.log("Draft: 19 individual deals drawn, 19 sample starts, manual and Random clicks, mid-deal reset");
}
async function verifySoil(page) {
  const events=await page.evaluate(async()=>{
    const {loadEngine,setup,DT}=await import("./sim.mjs");
    const {advanceDirt}=await import("./soil.mjs");
    const scene=await(await fetch("range.json")).json(),s=setup(await loadEngine(),scene);
    const sounds=[];let elapsed=0;s.onSound=name=>sounds.push([elapsed,name]);
    // One tall column sustains an uninterrupted fall through all six sample slots.
    s.solid.fill(0);s.solid[800+400]=1;s.dirt.set(400,[1,449]);
    for(;elapsed<1400;elapsed++)advanceDirt(s,DT);
    s.dirt.clear();for(let i=0;i<12;i++,elapsed++)advanceDirt(s,DT);
    s.dirt.set(400,[1,449]);for(let i=0;i<12;i++,elapsed++)advanceDirt(s,DT);
    return sounds;
  });
  assert.deepEqual(events.map(v=>v[1]),[1,2,3,4,5,6,1,2,1].map(i=>"rocks_"+i+".wav"));
  for(let i=1;i<8;i++)assert([193,194].includes(events[i][0]-events[i-1][0]));
  console.log("Soil: six-sample cycle, 774 ms cadence and restart after silence");
}
async function verifyControls(page) {
  const pixelHash=rect=>page.evaluate(([x,y,w,h])=>{
    const ctx=document.querySelector("#board canvas").getContext("2d");
    const data=new Uint32Array(ctx.getImageData(x,y,w,h).data.buffer);
    let hash=2166136261;
    for(const p of data)hash=Math.imul(hash^p,16777619);
    return hash>>>0;
  },rect);
  for(const [area,key] of [["aim","ArrowRight"],["power","ArrowUp"],["escape","Escape"]]){
    await page.keyboard.press(key);
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    assert.equal(await pixelHash(controls[area].rect),controls[area].end,area+" PC control pixels");
  }
  await page.keyboard.press("Escape");
  console.log("Original angle and power readouts, and all 22,800 pixels of the end-game prompt");
}
(async()=>{
  if(!process.argv[2])throw Error("Pass the native port URL");
  const browser=await chromium.launch({executablePath:process.env.EDGE_PATH});
  try{
    const page=await browser.newPage();
    await page.goto(new URL("?mode=practice",process.argv[2]).href);await page.waitForFunction(()=>document.querySelector("#status").textContent.startsWith("Player"));
    await verifyFilm(page);await verifyHitGlyphs(page);await verifySoil(page);await verifyControls(page);
    // Start a fresh audio context so the draft monitor also observes sample decoding.
    await page.reload();await page.waitForFunction(()=>document.querySelector("#status").textContent.startsWith("Player"));
    await verifyDraft(page);
    await page.goto(new URL("tests/frame-review.html",process.argv[2]).href);
    await page.locator("#next").click();
    assert.equal(await page.locator("#number").textContent(),"2 of 57");
    await page.locator("#frame").press("End");assert.equal(await page.locator("#number").textContent(),"57 of 57");
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
