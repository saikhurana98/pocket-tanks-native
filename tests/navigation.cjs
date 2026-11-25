const assert=require("node:assert/strict");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||"playwright-core");
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.EDGE_PATH});try{
 const page=await browser.newPage({viewport:{width:1000,height:780}}),errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.addInitScript(require("./record-sounds.cjs"));await page.goto(process.argv[2]);
 const menu=page.locator("#menu"),click=label=>menu.getByRole("button",{name:label,exact:true}).click(),screen=name=>page.waitForFunction(name=>document.querySelector("#menu").getAttribute("aria-label")===name,name);
 await screen("launch");await click("Start Game");await screen("title");await page.waitForFunction(()=>played.includes("titlestart.wav")&&played.includes("ballbounce.wav")&&played.includes("logobounce.wav"));
 await click("Start");await click("Options");const available=menu.getByRole("listbox",{name:"Available in game"}),removed=menu.getByRole("listbox",{name:"Removed list"});
 assert.equal(await available.locator("option").count(),60);await available.selectOption({label:"Single Shot"});await click("Remove weapon");assert.equal(await removed.locator("option").count(),1);
 await click("Save As");await menu.getByRole("textbox",{name:"Settings name"}).fill("No Single Shot");await click("save");
 await click("Include All");await click("Load");await menu.getByRole("listbox").selectOption("No Single Shot");await click("load");
 assert.equal(await removed.locator("option").count(),1);
 await click("Delete");await menu.getByRole("listbox").selectOption("No Single Shot");await click("delete");
 await click("Save & Exit");await click("Options");assert.equal(await removed.locator("option").count(),1);await click("Include All");await click("Save & Exit");
 await click("Target Practice");await page.locator("#fire").waitFor();await page.keyboard.press("Escape");await page.locator("#yes").press("Enter");await screen("title");
 await click("Start");await click("2 Players");await screen("player1");await menu.getByRole("textbox").fill("Ada");await click("Cyan");await click("Continue");await screen("player2");await click("Continue");
 await page.locator("#random").press("Enter");await page.locator("#fire").waitFor();await page.keyboard.press("Escape");await page.locator("#yes").press("Enter");await screen("title");
 assert.equal(errors.length,0,errors.join("\n"));console.log("PASS original menu routes, title cues, 60-item options, two-player setup, draft, practice, end game and title return.");
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
