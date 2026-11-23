// Set PLAYWRIGHT_MODULE and EDGE_PATH for a locally installed Playwright and Edge.
const assert=require("node:assert/strict");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const url=process.argv[2];
if(!url) throw Error("Pass the HTTP URL of the native practice range");
(async()=>{
  for(const touch of [false,true]){
    const browser=await chromium.launch({executablePath:process.env.EDGE_PATH,args:touch?["--disable-gpu","--disable-webgl"]:[]});
    try{
      const page=await browser.newPage({viewport:touch?{width:390,height:750}:{width:1200,height:850},hasTouch:touch,isMobile:touch});
      const errors=[];page.on("pageerror",e=>errors.push(e.message));
      const responses=[];page.on("response",r=>responses.push([r.status(),r.url()]));
      await page.goto(url);
      const click=id=>touch?page.locator(id).tap():page.locator(id).click();
      await page.waitForFunction(()=>document.querySelector("#status").textContent.startsWith("Player 1"));
      const pixel=()=>page.locator("canvas").evaluate(c=>Array.from(c.getContext("2d").getImageData(134,263,1,1).data));
      const before=await pixel();
      await click("#fire");assert(await page.locator("#fire").isDisabled());
      await page.waitForFunction(()=>document.querySelector("#status").textContent.startsWith("Player 2"));
      const after=await pixel();assert.notDeepEqual(before,after);
      assert.equal(await page.locator("#gold").textContent(),"0");assert.equal(await page.locator("#red").textContent(),"0");
      assert.equal(await page.locator("#angle").inputValue(),"120");
      await page.locator("#angle").fill("90");await page.locator("#power").fill("72");
      await click("#fire");await page.waitForFunction(()=>document.querySelector("#status").textContent.startsWith("Player 1"));
      assert.equal(await page.locator("#count").textContent(),"2 shots");
      await click("#reset");assert.deepEqual(await pixel(),before);
      await click("#sound");assert.equal(await page.locator("#sound").getAttribute("aria-pressed"),"false");
      await click("#full");await page.waitForFunction(()=>document.fullscreenElement || document.querySelector(".expanded"));
      await click("#full");await page.waitForFunction(()=>!document.fullscreenElement && !document.querySelector(".expanded"));
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.deepEqual(errors,[]);assert(!responses.some(([s,u])=>s>=400||/\.(exe|wasm|dll)(\?|$)/.test(u)));
      console.log("PASS",touch?"390px touch / GPU disabled":"desktop", "fire, crater, alternate turn, angle, power, reset, mute, fullscreen");
    }finally{await browser.close()}
  }
})().catch(e=>{console.error(e);process.exitCode=1});
