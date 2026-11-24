# Pocket Tanks Deluxe · Native web port

[Play a two-player match](https://saikhurana98.github.io/pocket-tanks-native/?mode=match) · [Play Target Practice](https://saikhurana98.github.io/pocket-tanks-native/)

Two people can play ten volleys on the same device. Pick weapons in the shop, or use Random to deal the remaining choices. Each player has ten rounds and four moves. The current shop contains ten copies each of Single Shot and Big Shot. The score counts hits on the opponent, deducts self-hits and stops at zero. After the final volley, choose Play Again to draft a fresh arsenal. Target Practice has an unlimited supply of both weapons. Each mode uses a different range captured from the Windows game.

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
| `0x4755e0`, `0x433d60` | Rotate the original hull and turret collision polygons and test the projectile against their edges. |
| `0x44c40a`–`0x44c5c5`, `0x4419f0` | Test both tank centers against the expanding blast, apply distance falloff once per tank and update the firing player's score. |
| `0x44c637`, `0x475430`, `0x474e50` | Derive the knockback angle and impulse, advance the thrown tank and resolve terrain contact. |

## Original presentation and input

The native canvas renders the PC game's 800 × 600 frame. The playfield is 800 × 450 and the instrument panel occupies the bottom 150 pixels. The panel, hover and pressed controls, cursor and weapon popup use original art-bank imagery. The terrain texture, tank artwork, full-circle aim readouts, power meter and player indicators were sampled from the original renderer. The shell and blast erase the live terrain. After the blast, unsupported dirt moves down with its texture.

The Windows game exposes F7 for display mode and F8 for LCD fullscreen. On the reference Windows desktop its window had an 800 × 600 client. The executable contains Desktop and Stretched options, a centered presentation branch and a StretchBlt path. Here F7 toggles fullscreen and F8 toggles stretch. Fit preserves the 4:3 frame. Stretch maps that entire frame to the available viewport, with input independently mapped back to logical X and Y before hit-testing. The playfield, HUD and shot engine keep their PC coordinates. Actual monitor scaling on the PC depends on its display configuration.

Click either triangle for a one-unit adjustment. Click the Angle or Power heading, move horizontally, and click to commit. The original executable changes one unit per four logical pixels. A touch drag on either control also adjusts it. Escape opens the end-game prompt. The browser toolbar provides fullscreen, stretch, sound and reset.

The visual regression replays the opening of the captured range and the first settled shot. With matching indicator and pointer poses, both complete RGBA frames match the original capture byte for byte. It also checks the color and shape of the blast in 29 original frames and 39 observed terrain positions traversed by a tank. The test hashes come from the original framebuffer and the original process's pose data. Measurements cover one range. The timing of the moving arrow, the trail between captured ticks, moving-tank artwork on other slopes and settling on other terrains have less coverage. The full installation contains 320 distinct weapon names across 14 .wep packs and 16 .weap packs. CPU opponents, the remaining weapon behaviors, procedural terrain, selectable wind and full menu parity are outstanding.

## Reference and replay

REA 6.10.1 and Rizin supplied the original disassembly. For runtime measurements, an instrumented Boxedwine reference runner executed the unmodified game and exposed guest memory between basic blocks. The observer recorded the release and explosion trigger arguments, terrain occupancy, and projectile position and velocity at entry and return. For eleven shots it also recorded a 49 × 49 occupancy window around the blast after each explosion update. The published game runs the WebAssembly port directly.

The executable SHA-256 is `8e50050faba34a18d47c6f314486ef2888e4552ab18095e3bb517ecffbb34caa`. The REA-controlled shot has capture ID `ev_2ed57d71facf8a619f4d388f69764f34fa584e583cb78893592e73b911ea7aa1`. Its [raw guest-state observations](tests/captures/rea-shot.raw.json.gz) include both trigger events, basic-block paths, the starting terrain and register-derived projectile fields. The [replay fixtures](tests/captures/single-shot.json.gz) include a SHA-256 of each source trace. To pack raw shots in the same format, run `node tests/captures/pack.mjs OUTPUT.json.gz INPUT.json [...]`.

Run `node tests/shot.mjs` from this directory. The test initializes memory from each shot, launches once, advances the module and compares its state at every tick. It checks 15 shots fired in both directions at five different powers, 4,623 projectile updates, 1,826 explosion updates and six independent muzzle observations. All recorded projectile positions and velocities matched exactly on the test machine. The largest difference in explosion angle or power was 1.42 × 10⁻¹⁴. All compared terrain cells matched.

Run `node tests/match.mjs` for six further shots recorded from the original executable. The capture includes both weapons, ricochet-free hull and turret contact, splash damage, a self-hit that reduced a score from 12 to zero, and a thrown tank. Replay checks 1,637 projectile ticks, 1,696 terrain hashes after blast updates, the hit tick and points, and 129 tank positions during knockback. The scoring routine has REA evidence ID `ev_036e4351178553f9c18d80f6ca5c10886a1dc7cb5dea85b26850ae87140abaf4`. The complete-match browser test covers drafting, consuming both types of ammunition, a 60-point hit, twenty shots, game over and rematch on desktop and touch.

## Run locally

Serve this directory over HTTP, for example with `python -m http.server 8080`, and visit `http://localhost:8080`. The compiled module is included. To rebuild with WABT 1.0.39, run `wat2wasm engine/single-shot.wat -o engine/single-shot.wasm`.

With Playwright Core and Chromium installed, run `node tests/browser.cjs http://localhost:8080`. Set `PLAYWRIGHT_MODULE` for a nonstandard module location and `EDGE_PATH` for the browser executable. The browser test checks the visual capture hashes, two turns, the crater and reset, original sound effects, movement, the weapon selector, and the end-game prompt. It exercises both fitted and stretched coordinates in desktop and GPU-disabled touch viewports, including fullscreen.
