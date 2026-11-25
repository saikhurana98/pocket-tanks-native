const assert=require("node:assert/strict");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||"playwright-core");
(async()=>{
  const launch={headless:true,args:["--autoplay-policy=no-user-gesture-required","--disable-background-timer-throttling","--disable-renderer-backgrounding"]};
  if(process.env.EDGE_PATH)launch.executablePath=process.env.EDGE_PATH;
  const browser=await chromium.launch(launch);
  try{
    const pages=[],errors=[];
    for(let seat=0;seat<2;seat++){
      const page=await browser.newPage();
      page.on("pageerror",e=>errors.push(e.message));
      await page.addInitScript(()=>{
        let t=0;window.requestAnimationFrame=cb=>setTimeout(()=>cb(t+=96),8);
      });
      await page.goto(process.argv[2]+(seat===0?"/":"/?mode=practice"));
      await page.locator("#loading").waitFor({state:"hidden"});
      if(seat===0){
        for(const name of ["Start Game","Start","LAN Game"])await page.getByRole("button",{name,exact:true}).click();
      }else await page.locator("#online").click();
      pages.push(page);
    }
    const [a,b]=pages;
    await a.locator("#create-room").click();
    await a.waitForFunction(()=>document.querySelector("#room-message").textContent.includes("Player 2"));
    const code=(await a.locator("#room-message").innerText()).match(/Room (\w{6})/)[1];
    await b.locator("#room-code").fill(code);await b.locator("#join-button").click();
    const waitTurn=page=>page.waitForFunction(()=>document.querySelector("#room-info").textContent.endsWith("Your turn"),null,{timeout:120000});
    const press=(page,id)=>page.locator("#"+id).evaluate(button=>button.click());
    await waitTurn(a);await press(a,"pick-0");await waitTurn(b);await press(b,"pick-1");
    await waitTurn(a);await press(a,"random");await waitTurn(a);
    await press(a,"moveright");await waitTurn(a);await press(a,"angleleft");await press(a,"powerright");
    for(let shot=0;shot<20;shot++){
      const page=pages[shot%2];await waitTurn(page);await press(page,"fire");
      if(shot===0)console.log("Room",code,"drafted, moved and fired");
    }
    for(const page of pages)await page.waitForFunction(()=>document.querySelector("#room-info").textContent.endsWith("Match complete"),null,{timeout:120000});
    const scores=await Promise.all(pages.map(p=>p.locator("#status").textContent()));
    assert.match(scores[0],/Game over/);assert.equal(scores[0],scores[1]);
    await a.locator("#online").click();await b.locator("#room-ui").waitFor();
    assert.match(await b.locator("#room-message").textContent(),/disconnected|left/);
    assert.deepEqual(errors,[]);console.log("20 synchronized shots across independent browser contexts · "+scores[0]);
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
