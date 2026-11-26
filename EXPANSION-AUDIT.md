# Expansion weapon comparison

On November 26, 2026, the comparison replayed two shots for each of the 260 expansion weapons against the native modules served by GitHub Pages at commit `8cafda2`. All 520 volleys completed. Visual and sound differences remain.

| Measure | Result |
| --- | ---: |
| Presented frames compared on original, undisturbed PC terrain | 43,391 |
| Exact complete 800 × 450 playfield frames | 0 |
| Exact projectile regions | 92,317 of 297,904 |
| Exact explosion regions | 29,191 of 108,304 |
| Weapons with the same sound files starting on the same ticks on undisturbed terrain | 194 of 260 |
| Weapons with matching sound starts in both shots | 187 of 260 |
| Weapons with matching scripted trigger sequences in both shots | 165 of 260 |

Mega Nuke matched 33 of 34 projectile regions and all 49 explosion regions on its undisturbed-terrain shot. Bubble Wrap matched 97 of 99 projectile regions and zero of 32 explosion regions. Volcano played its recorded eruption sample one simulation tick early at tick 1,523. The moving underline beneath the active player name and the tank graphics also contribute to the whole-playfield differences. [Per-weapon results](tests/captures/expansion-audit-results.csv)

## What was measured

REA connected to the reference player running the original Windows executable. Each shot used the trigger spelling from its installed pack. The recorder saved every presented playfield image between launch and turn change as lossless pixel deltas. It also recorded tank poses, initial game RNG state, trigger arguments and the original sound-start calls. Simulation ticks are 4 ms. A display frame can span multiple ticks.

The first 260 shots used a controlled collision map. The PC retained parts of the previous terrain bitmap until they needed repainting. These 45,889 frames are retained with the trace. The visual totals above use the second set of 260 shots on undisturbed PC terrain, with the initial terrain bitmap and collision map read directly from the original. Both sets contribute to the two-shot timing counts.

The browser loaded the production renderer and WebAssembly and replayed the captured initial conditions. It compared every pixel in the playfield at the recorded presentation counters. Additional windows cover 25 × 25 pixels around each native projectile and the bounding square around each native explosion, clipped to the playfield. Several windows may occur on one frame. The full-field comparison also catches effects missing from the native actor lists. The results CSV includes the first differing sound and trigger ticks for the undisturbed-terrain shot. Blank mismatch fields mean the sequence matched.

The audio comparison uses the selected sample and its simulation tick. Starts on the same tick are simultaneous in the results CSV. Device output latency and the mixed audio waveform were outside the measurement. The live menu regression also checked that Oil Slick's launch samples decoded before firing and that the browser started the launch sound.

## Reproduction

`node tests/expansion-audit.mjs` replays the controlled shots against the archived PC event and sound sequences. CI preserves the passing sequences, including the recorded order of sounds started on the same tick. Add `--strict` to list every outstanding sequence difference.

To repeat the full image comparison, unpack the original capture archive from the audit workspace. Its SHA-256 is `378aef62a030a23b02045e2ca926ee74bf035c34bf722c92a6aa58f8afa7db67`. From this repository run the following command with an empty results directory and Playwright Chromium installed.

```sh
node tests/expansion-frames.cjs https://saikhurana98.github.io/pocket-tanks-native/ 60 320 ./frame-results /path/to/unpacked/natural
```

The output contains per-frame pixel counts, projectile and explosion region totals, and both versions of the trigger and sound timelines. The raw archive is a test input and players do not download it when opening the game.

