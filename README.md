# Pocket Tanks Deluxe · Native web port

[Open the game](https://saikhurana98.github.io/pocket-tanks-native/) · [Play a two-player match](https://saikhurana98.github.io/pocket-tanks-native/?mode=match) · [Play Target Practice](https://saikhurana98.github.io/pocket-tanks-native/?mode=practice)

Two people can play ten volleys on the same device. Pick weapons in the shop, or use Random to deal the remaining choices. Each player has ten rounds and four moves. The shop uses the PC game's deal routine to fill twenty positions from the playable roster. A weapon can appear more than once. The score counts hits on the opponent, deducts self-hits and stops at zero. After the final volley, choose Play Again to draft a fresh arsenal. Target Practice has unlimited ammunition for each playable weapon. Each mode uses a different range captured from the Windows game.

[Read the frame and sound audit](PRESENTATION.md) or [step through Single Shot](https://saikhurana98.github.io/pocket-tanks-native/tests/frame-review.html).

## Online matches

On the home server, choose **LAN Game** or **Online match**, create a room, and share its six-character code with the other player. Each browser runs the native game locally. The server checks the draft, ammunition, movement allowance and turn order. Both browsers compare their terrain and match state after each command before the next player can act. Leaving the room or restarting the service ends that match. GitHub Pages hosts the single-device modes and the frame viewer.

For local multiplayer, use Node 24, run `npm ci` and `npm start`, and open `http://127.0.0.1:8080` in two browsers. The [Proxmox agent prompt](deploy/PROXMOX-AGENT.md) covers LAN hosting, the private deployment runner and testing through the deployed URL.

## Installed weapon packs

The native game loads all 30 packs from this PC installation. Original and Deluxe contribute 30 weapons each. The 28 expansions contribute another 260, for 320 distinct weapons. Target Practice, the weapon options, the local shop and the room-code shop use the same catalog. The Ambush file declares Carpet Bomb twice and the catalog includes it once. [Pack counts](engine/packs.json)

The importer retains the original slots and resolves each expansion's linked triggers, actors and media. The expansion regression checks a 20-slot deal against the original PC shop. The full expansion audit compared two shots per weapon on the live site, including every presented playfield frame, trigger sequences and sound-start ticks. Visual and audio differences remain. [Expansion audit and per-weapon results](EXPANSION-AUDIT.md)

The two base packs contain the following weapons.

Single Shot, Big Shot, 3 Shot, 5 Shot, Jackhammer, Heatseeker, Tracer, Pile Driver, Dirt Mover, Crazy Ivan, Spider, Sniper Rifle, Ground Hog, Worm, Homing Worm, Skipper, Chain Reaction, Pineapple, Firecracker, Homing Missile, Tommy Gun, Mountain Mover, Scatter Shot, Jump Jets, Laser Battery, Digger, Fission Bomb, Late Bloomer, Color Bomb, Potholes, Popcorn, Sprinkler, Well Digger, Super Tracer, Minigun, Laser, Super Skipper, Crater Maker, Flash Blast, Magic Wall, Dirt Slinger, Zapper, Napalm, Hail Storm, Dirtball, Cruiser, Mud Pie, Pin Cushion, Cannon Ball, Wacky Tank, Glue Bomb, Fire Bolt, Boomerang, Bouncy Dirt, Big Dirtball, Super Zapper, Cruball, Mega Cruiser, Roller, Heavy Roller.

Both modes use the same weapon programs. Delays, offsets, linked impact and proximity triggers, underground shells, seeded random spreads, heat seeking, terrain erosion and tracer labels come from the original pack definitions and executable routines. The browser runs the simulation and draws the scene locally.

The launcher leads through the title and mode menu. Two-player setup records each tank’s name and color before drafting. Options can save named weapon selections in this browser. At the end of a match, the seven letters of Winner! move above the winning tank. Fireworks and their four explosion samples continue through the replay prompt, which opens after three simulation seconds.

## What was ported

The WebAssembly text in [engine/single-shot.wat](engine/single-shot.wat) identifies the corresponding addresses in the 32-bit Windows executable. It uses binary64 arithmetic, an 800 × 450 collision bitmap and the original 4 ms update interval. The projectile and muzzle routines use the original Windows runtime's sine and cosine polynomials and lookup table. The Wasm module also computes projectile angles with a fixed binary64 arctangent so guided trajectories are reproducible across browser engines. The same Wasm module advances fire and Superball movement, backtracks through surface contacts, and traces electrical beams through the collision bitmap. JavaScript dispatches weapon actors and handles input, scheduling, audio and Canvas rendering.

| Original address | Behavior in the port |
| --- | --- |
| `0x476410`, `0x4764a0` | Compute the muzzle position for an independently aimed turret on a sloped tank. |
| `0x4398f0` | Convert the requested shot angle and power into initial velocity. |
| `0x4c6c65`, `0x4c6e35` | Compute sine and cosine for launch using the original 64-row table and binary64 operation order. |
| `0x447a90`, `0x447d10` | Track columns above craters and move unsupported terrain at the original 30 Hz cadence, including while other blasts are active. |
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

The visual regression replays the opening of the captured range and the first settled shot. With matching indicator and pointer poses, both complete RGBA frames match the original capture byte for byte. It also checks the color and shape of the blast in 29 original frames and 39 observed terrain positions traversed by a tank. The test hashes come from the original framebuffer and the original process's pose data. The two-player opening field is checked separately with the moving arrow masked, along with 33 original frames of the Big Shot blast. The timing of the moving arrow, the trail between captured ticks, moving-tank artwork on other slopes and settling on other terrains have less coverage. CPU and LAN play, configurable terrain and wind, and frame-level comparisons of every menu animation and weapon effect remain open. Both playable modes use captured terrain. Custom tank colors use the original sprite shading with a browser-side tint.

## Reference and replay

REA 6.10.1 and Rizin supplied the original disassembly. For runtime measurements, an instrumented Boxedwine reference runner executed the unmodified game and exposed guest memory between basic blocks. The observer recorded the release and explosion trigger arguments, terrain occupancy, and projectile position and velocity at entry and return. For eleven shots it also recorded a 49 × 49 occupancy window around the blast after each explosion update. The published game runs the WebAssembly port directly.

The executable SHA-256 is `8e50050faba34a18d47c6f314486ef2888e4552ab18095e3bb517ecffbb34caa`. The REA-controlled shot has capture ID `ev_2ed57d71facf8a619f4d388f69764f34fa584e583cb78893592e73b911ea7aa1`. Its [raw guest-state observations](tests/captures/rea-shot.raw.json.gz) include both trigger events, basic-block paths, the starting terrain and register-derived projectile fields. The [replay fixtures](tests/captures/single-shot.json.gz) include a SHA-256 of each source trace. To pack raw shots in the same format, run `node tests/captures/pack.mjs OUTPUT.json.gz INPUT.json [...]`.

Run `node tests/shot.mjs` from this directory. The test initializes memory from each shot, launches once, advances the module and compares its state at every tick. It checks 15 shots fired in both directions at five different powers, 4,623 projectile updates, 1,826 explosion updates and six independent muzzle observations. All recorded projectile positions, velocities and explosion trigger arguments matched exactly in the replay. All compared terrain cells matched.

Run `node tests/match.mjs` for six further shots recorded from the original executable. The capture includes both weapons, ricochet-free hull and turret contact, splash damage, a self-hit that reduced a score from 12 to zero, and a thrown tank. Replay checks 1,637 projectile ticks, 1,696 terrain hashes after blast updates, the hit tick and points, and 129 tank positions during knockback. The scoring routine has REA evidence ID `ev_036e4351178553f9c18d80f6ca5c10886a1dc7cb5dea85b26850ae87140abaf4`. The complete-match browser test covers drafting, consuming exactly the twenty rounds shown in the shop, a 60-point hit, twenty shots, game over and rematch on desktop and touch.

Run `node tests/spread.mjs` for four further volleys recorded in Target Practice. The three-projectile and five-projectile weapons share the terrain as shells strike and earlier craters settle. Each weapon was traced twice. The test compares all 5,014 recorded projectile positions and velocities, the tick and coordinates of all 16 impacts, and 2,586 terrain hashes sampled after individual blast updates. The recorded projectile states and hashes match exactly. The browser checks 12 distinct 3 Shot blast phases and 21 distinct 5 Shot blast phases against pixels captured from the original renderer. Full-frame visual comparisons during overlapping blasts and for the moving trails are still outstanding.

Run `node tests/deluxe.mjs` for 101 additional volleys and the shop replay. The shots compare 257,401 projectile updates and 100,183 per-explosion terrain samples with the original. Each sample hashes every occupied or empty pixel in the clipped blast window. Sniper Rifle, Laser, Popcorn and Color Bomb use the PC shrapnel damage and lifetime routine. Four controlled direct hits check 100-point Sniper Rifle hits and 70-point Laser hits in both directions. The particle tests compare 1,386 positions, velocities and colors at emission, the first live particle and its fade timer during each recorded update, and 2,055 individual framebuffer color blends. The ten Skipper and Super Skipper captures cover ordinary terrain, the bottom edge and special surface materials. Four of those captures used deliberately placed surface flags in the reference game. Twelve Dirt Mover, Digger and Well Digger captures compare 3,480 terrain cuts with pixel occupancy hashes and the line coordinates and colors from 67 PC rendering updates. The three settled playfield hashes match across all 360,000 cells. Four Crazy Ivan volleys exercise projectiles that seek a moving tank. Two also compare 3,948 tank poses during flight, knockback, landing and downhill sliding. Four Jump Jets launches compare 598 launch, flight, landing and settling poses. Separate checks compare tracer locations and two original blast color sequences. The test suite also reproduces all twenty screen positions and weapon IDs in a captured 320-weapon PC shop deal.

Run `node tests/contour.mjs` for the ground paths of Cruiser, Boomerang, Mega Cruiser, Roller, Heavy Roller and Cruball. Starting with each captured impact position and heading, the contour routine reproduces 1,006 moves and 2,533 tick positions on the six recorded surfaces. These six weapons also run in the shop and in Target Practice.

To regenerate the programs, pack counts and available sound files, run `node tools/import-base.mjs "PATH_TO_POCKET_TANKS_DELUXE"`. Then run `python tools/expansion-art.py "PATH_TO_POCKET_TANKS_DELUXE"` with Pillow installed to build the HUD and projectile atlases. The importer checks each pack header against its distinct weapon definitions. It reports missing references in the supplied files. To rebuild the Deluxe test fixture from raw original captures, run `node tests/captures/pack-programs.mjs OUTPUT.json.gz TRACE.json [...]`. Raw shots include the terrain, tank poses, active player and initial random state when recorded.

## Run locally

Run `node tests/deluxe-actors.mjs` for 27 more PC shots and 19 secondary-actor traces. The suite compares 7,477 projectile updates, 2,533 ground positions, 10,996 actor positions, two electrical beam endpoints and 19 whole-field occupancy hashes. All 2,988 recorded blast centers and update ticks match. One Roller shot depends on glue from an earlier turn. The suite replays the original sequence starting at Glue Bomb, verifies the full occupancy bitmap before each subsequent shot, and checks that Roller detonates on the coated cell. A second PC run verifies its behavior on the same terrain without the coating. It also fires each weapon at five angle and power combinations and checks seven positions from the original victory lettering.

The browser tests in `tests/navigation.cjs` and `tests/arsenal-browser.cjs` accept the game URL. They exercise the menus, weapon presets, shop and exit routes, render all 320 weapon programs, and decode the referenced sounds. Run `node tests/expansions.mjs` for the expansion simulation and PC comparisons.

Serve this directory over HTTP, for example with `python -m http.server 8080`, and visit `http://localhost:8080`. The compiled module is included. To rebuild with WABT 1.0.39, run `wat2wasm engine/single-shot.wat -o engine/single-shot.wasm`.

With Playwright Core and Chromium installed, run `node tests/browser.cjs http://localhost:8080`. Set `PLAYWRIGHT_MODULE` for a nonstandard module location and `EDGE_PATH` for the browser executable. The browser test replays the 101 Deluxe shots against the original projectile state at every tick. It also checks the visual capture hashes, two turns, the crater and reset, original sound effects, movement, the weapon selector, and the end-game prompt. It exercises both fitted and stretched coordinates in desktop and GPU-disabled touch viewports, including fullscreen. Pass `firefox` or `webkit` as the second argument after the URL to run a desktop match in that engine. Music loads on the first interaction. Effects use decoded Web Audio buffers or HTML audio playback when the audio context is suspended or unavailable.
