# Pocket Tanks · Native Target Practice

[Play Target Practice](https://saikhurana98.github.io/pocket-tanks-native/)

Single Shot runs in the browser as a 1,303-byte WebAssembly module. The practice range starts from a terrain bitmap and two tank poses recorded in Pocket Tanks Deluxe. Choose an angle and power to fire. Each shot changes the terrain for the next player.

## What was ported

The WebAssembly text in [engine/single-shot.wat](engine/single-shot.wat) identifies the corresponding addresses in the 32-bit Windows executable. It uses binary64 arithmetic, an 800 × 450 collision bitmap and the original 4 ms update interval. Sine, cosine and atan2 use the browser's math library. JavaScript handles input, scheduling, audio and Canvas rendering.

| Original address | Behavior in the port |
| --- | --- |
| `0x476410`, `0x4764a0` | Compute the muzzle position for an independently aimed turret on a sloped tank. |
| `0x4398f0` | Convert the requested shot angle and power into initial velocity. |
| `0x4343d0` | Update velocity and position in the original operation order. |
| `0x43512f`–`0x435508` | Sample ordinary terrain and backtrack through the last update to resolve contact. |
| `0x435add`–`0x435b6a` | Compute the angle and power passed to the explosion trigger. |
| `0x44bc50`, `0x429000` | Advance the blast timer and erase paired integer circle outlines from the terrain. |

The canvas artwork and practice controls are custom. This slice covers ordinary terrain impacts in still air. Tank hits, scoring, tank movement and the original post-blast soil settling are outside the verified path. Screen-edge exits and nonzero wind also lack reference coverage.

## Reference and replay

REA 6.10.1 and Rizin supplied the original disassembly. For runtime measurements, an instrumented Boxedwine reference runner executed the unmodified game and exposed guest memory between basic blocks. The observer recorded the release and explosion trigger arguments, terrain occupancy, and projectile position and velocity at entry and return. For eleven shots it also recorded a 49 × 49 occupancy window around the blast after each explosion update. The published game runs the WebAssembly port directly.

The executable SHA-256 is `8e50050faba34a18d47c6f314486ef2888e4552ab18095e3bb517ecffbb34caa`. The REA-controlled shot has capture ID `ev_2ed57d71facf8a619f4d388f69764f34fa584e583cb78893592e73b911ea7aa1`. Its [raw guest-state observations](tests/captures/rea-shot.raw.json.gz) include both trigger events, basic-block paths, the starting terrain and register-derived projectile fields. The [replay fixtures](tests/captures/single-shot.json.gz) include a SHA-256 of each source trace. To pack raw shots in the same format, run `node tests/captures/pack.mjs OUTPUT.json.gz INPUT.json [...]`.

Run `node tests/shot.mjs` from this directory. The test initializes memory from each shot, launches once, advances the module and compares its state at every tick. It checks 15 shots fired in both directions at five different powers, 4,623 projectile updates, 1,826 explosion updates and six independent muzzle observations. All recorded projectile positions and velocities matched exactly on the test machine. The largest difference in explosion angle or power was 1.42 × 10⁻¹⁴. All compared terrain cells matched.

## Run locally

Serve this directory over HTTP, for example with `python -m http.server 8080`, and visit `http://localhost:8080`. The compiled module is included. To rebuild with WABT 1.0.39, run `wat2wasm engine/single-shot.wat -o engine/single-shot.wasm`.

With Playwright Core and Chromium installed, run `node tests/browser.cjs http://localhost:8080`. Set `PLAYWRIGHT_MODULE` for a nonstandard module location and `EDGE_PATH` for the browser executable. This exercises two turns, terrain changes and reset, audio buffer playback, angle and power controls, and fullscreen on desktop and in a touch viewport with GPU acceleration disabled.
