const assert=require("node:assert/strict");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||"playwright-core");

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.EDGE_PATH});
  try{
    const page=await browser.newPage(),errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.addInitScript(()=>{
      let time=performance.now();
      window.requestAnimationFrame=cb=>setTimeout(()=>cb(time+=80),8);
      // Reproduce the same expansion deal on CI and on the public site.
      const random=crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues=array=>{
        if(array instanceof Uint32Array&&array.length===1){array[0]=12345;return array}
        return random(array);
      };
    });
    const url=new URL(process.argv[2]);
    await page.goto(url.href);
    const menu=page.locator("#menu");
    const click=name=>menu.getByRole("button",{name,exact:true}).click();
    const press=id=>page.locator("#"+id).press("Enter");
    const status=prefix=>page.waitForFunction(p=>document.querySelector("#status").textContent.startsWith(p),prefix,{timeout:90000});
    await click("Start Game");await click("Start");await click("1 Player");
    await menu.getByRole("textbox").fill("Ada");
    await click("Continue");await click("Difficulty 10");
    assert.equal(await menu.getByRole("button",{name:"Difficulty 10",exact:true}).getAttribute("aria-pressed"),"true");
    await click("Continue");
    await status("Weapon shop · Ada picks");
    for(let pick=0;pick<10;pick++){
      const slot=page.locator('button[id^="pick-"]:visible').first();
      await slot.press("Enter");
      await status("Weapon shop · CPU-10 picks");
      assert(await page.locator("#random").isDisabled());
      if(pick<9)await status("Weapon shop · Ada picks");
    }
    for(let volley=1;volley<=10;volley++){
      await status("Ada · Ready to fire · Volley "+volley+" ·");
      await press("fire");await status("CPU-10 · Aiming");
      assert(await page.locator("#fire").isDisabled());
      if(volley===1){
        await page.keyboard.press("Escape");
        assert(await page.locator("#no").isVisible());
        await page.waitForTimeout(250);
        assert.match(await page.locator("#status").textContent(),/^CPU-10 · Aiming/);
        await press("no");
      }
    }
    await status("Game over");const result=await page.locator("#status").textContent();
    await page.locator("#yes").waitFor();await press("yes");
    await status("Weapon shop · Ada picks");await press("pick-0");await status("Weapon shop · CPU-10 picks");
    await status("Weapon shop · Ada picks");await press("random");await status("Ada · Ready to fire");
    await page.locator("#newmatch").evaluate(b=>b.click());
    await status("Weapon shop · Player 1 picks");await press("pick-0");await status("Weapon shop · Player 2 picks");
    assert(await page.locator("#random").isEnabled());
    url.search="?mode=solo";await page.goto(url.href);
    await click("Continue");await click("Difficulty 1");await click("Continue");
    await press("pick-0");await status("Weapon shop · CPU-1 picks");await status("Weapon shop · Ada picks");
    assert.deepEqual(errors,[]);console.log("PASS solo manual draft, 20 shots, pause, rematch, random deal, hot-seat and solo link. "+result);
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
