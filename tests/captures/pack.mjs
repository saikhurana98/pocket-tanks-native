// Usage: node tests/captures/pack.mjs OUTPUT.json.gz INPUT.json [...]
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const [output, ...inputs] = process.argv.slice(2);
assert(output && inputs.length, "Supply an output path and at least one raw shot");
const shots = {};
for (const input of inputs) {
  const raw = fs.readFileSync(input);
  const { events, frames, terrain, explosion, pose } = JSON.parse(raw);
  const name = path.basename(input, ".json");
  assert(!Object.hasOwn(shots, name), "Duplicate shot name " + name);
  assert.deepEqual(events.map(e => e[0]), ["SingleShotTrigger", "SingleShotExplosionTrigger"]);
  assert.equal(events[1][1], frames.length);
  assert(frames.length && frames.every(f => f.post?.length === 4 && f.pre?.length === 4));
  const dt = frames[0].dt, wind = frames[0].wind;
  assert(frames.every(f => f.dt === dt && f.wind === wind), "Variable inputs require per-tick storage");
  const shot = {
    events, terrain, dt, wind, pose,
    flight: frames.map(f => [f.pre, f.post]),
    sha256: createHash("sha256").update(raw).digest("hex")
  };
  if (explosion) {
    assert.equal(explosion.length, 166);
    assert.equal(explosion[0].initial.length, 49 * 49);
    shot.blast = explosion.map(f => ({
      dt: f.dt, center: [f.cx, f.cy], initial: f.initial, changed: f.changes
    }));
  }
  shots[name] = shot;
}
fs.writeFileSync(output, gzipSync(JSON.stringify(shots), { level: 9 }));
