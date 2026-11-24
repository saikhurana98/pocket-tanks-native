import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {walkContour} from "../contour.mjs";

const captures=JSON.parse(gunzipSync(readFileSync(new URL("./captures/contours.json.gz",import.meta.url))));
for(const {trigger,terrain,heading,hand,path} of captures){
  const solid=new Uint8Array(800*450);
  let offset=0;
  for(const [i,length] of terrain.runs.entries()){
    solid.fill(i%2,offset,offset+length);
    offset+=length;
  }
  assert.equal(offset,solid.length);
  let [,x,y,clock]=path[0],direction=heading,moves=0;
  for(const [tick,row] of path.entries()){
    assert.deepEqual([tick,x,y,clock],row,trigger+" ground pose at tick "+tick);
    if(tick===path.length-1)break;
    clock+=.004;
    if(clock>.01){
      assert(solid[y*800+x],trigger+" left the ground in this reference");
      clock-=.01;
      [x,y,direction]=walkContour({solid},x,y,direction,hand,1);
      moves++;
    }
  }
  console.log(trigger,path.length+" exact ground poses,",moves+" moves");
}
