const assert=require("node:assert/strict");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||"playwright-core");
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.EDGE_PATH});try{
 const page=await browser.newPage({viewport:{width:1000,height:780}}),errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.addInitScript(require("./record-sounds.cjs"));await page.goto(process.argv[2]);
 const menu=page.locator("#menu"),click=label=>menu.getByRole("button",{name:label,exact:true}).click(),screen=name=>page.waitForFunction(name=>document.querySelector("#menu").getAttribute("aria-label")===name,name);
 await screen("launch");
 assert.equal(await page.locator("#status").textContent(),"30 weapon packs detected, 320 weapons found.");
 const panel=await page.evaluate(async()=>{
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   const rgba=document.querySelector("#board canvas").getContext("2d").getImageData(0,0,121,320).data;
   return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",rgba)),n=>n.toString(16).padStart(2,"0")).join("");
 });
 assert.equal(panel,"ccf4d3f2de8d7c12ac9b1eed6c30af0364797e3cbffea85d988d72ad9b698288","original PC launcher pack panel");
 await click("Start Game");await screen("title");await page.waitForFunction(()=>played.includes("titlestart.wav")&&played.includes("ballbounce.wav")&&played.includes("logobounce.wav"));
 await click("Start");await click("Options");await screen("options");const available=menu.getByRole("listbox",{name:"Available in game"}),removed=menu.getByRole("listbox",{name:"Removed list"});
 assert.equal(await available.locator("option").count(),320);await available.selectOption({label:"Single Shot"});await click("Remove weapon");assert.equal(await removed.locator("option").count(),1);
 await click("Save As");await menu.getByRole("textbox",{name:"Settings name"}).fill("No Single Shot");await click("save");
 await click("Include All");await click("Load");await menu.getByRole("listbox").selectOption("No Single Shot");await click("load");
 assert.equal(await removed.locator("option").count(),1);
 await click("Delete");await menu.getByRole("listbox").selectOption("No Single Shot");await click("delete");
 await click("Save & Exit");await click("Options");await screen("options");assert.equal(await removed.locator("option").count(),1);await click("Include All");await click("Save & Exit");
 await click("Target Practice");await page.locator("#fire").waitFor();
 await page.locator("#weaponup").press("Enter");
 assert.equal(await page.locator("#fire").getAttribute("aria-label"),"Fire Oil Slick");
 await page.locator("#fire").press("Enter");
 await page.waitForFunction(()=>document.querySelector("#status").textContent.startsWith("Player 2"),null,{timeout:60000});
 await page.keyboard.press("Escape");await page.locator("#yes").press("Enter");await screen("title");
 await click("Start");await click("2 Players");await screen("player1");await menu.getByRole("textbox").fill("Ada");await click("Cyan");await click("Continue");await screen("player2");await click("Continue");
 await page.locator("#random").waitFor();await page.locator("#random").press("Enter");await page.locator("#fire").waitFor();await page.keyboard.press("Escape");await page.locator("#yes").press("Enter");await screen("title");
 assert.equal(errors.length,0,errors.join("\n"));console.log("PASS original menu routes, title cues, 320-item options, two-player setup, draft, practice, end game and title return.");
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
