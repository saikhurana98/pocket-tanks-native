import {RangeDisplay,loadArt} from "../presentation.mjs";
import {loadEngine,setup,launch,step} from "../sim.mjs";

export async function replayFilm() {
  const capture = await (await fetch("tests/captures/single-shot-film.json")).json();
  const {frames,size,columns,angle,power} = capture;
  const image = new Image();
  image.src = "tests/captures/single-shot-film.png";
  await image.decode();
  const sheet = document.createElement("canvas");
  sheet.width = image.width;
  sheet.height = image.height;
  const original = sheet.getContext("2d",{willReadFrequently:true});
  original.drawImage(image,0,0);

  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 600;
  const range = await (await fetch("range.json")).json();
  const display = new RangeDisplay(canvas,await loadArt(),range);
  const state = setup(await loadEngine(),range);
  display.bind(state);
  const ui = {angles:[angle,120],powers:[power,20],turnTime:0};
  if (!launch(state,angle,power)) throw Error("Single Shot launch failed");
  let elapsed = 0;

  // The historical animation callback read the screen and the simulation
  // counters separately. These presentation intervals were established by
  // a second PC-only replay before comparing any native pixels.
  return frames.map(([flight,impact,x,y],i) => {
    const presented=capture.presented[i];
    while (elapsed < presented[0]) {
      step(state);
      elapsed++;
    }
    display.draw(state,ui,elapsed*4);
    const pc = original.getImageData(i%columns*size,Math.floor(i/columns)*size,size,size);
    const web = display.ctx.getImageData(x,y,size,size);
    const mask = new ImageData(size,size);
    let different = 0;
    for (let j=0;j<pc.data.length;j+=4) {
      const changed = pc.data[j]!==web.data[j] || pc.data[j+1]!==web.data[j+1] ||
        pc.data[j+2]!==web.data[j+2] || pc.data[j+3]!==web.data[j+3];
      mask.data[j] = changed ? 255 : 0;
      mask.data[j+1] = changed ? 235 : 0;
      mask.data[j+3] = 255;
      if (changed) different++;
    }
    return {flight,impact,presented,x,y,pc,web,mask,different};
  });
}
