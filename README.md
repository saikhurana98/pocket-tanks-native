# Pocket Tanks · Native Target Practice

A browser-native Single Shot practice range. Aim with the angle and power controls. Fire to hand control to the other player. Reset restores the recorded terrain. The game uses Canvas 2D, a fixed-step simulation and synthesized Web Audio effects. It requires no Wine, game executable, GPU-specific API, package installation or build step.

Serve this directory with a static HTTP server. Run the simulation comparison with `node tests/shot.mjs`.

## Reference shot

REA 6.10.1 drove one shot in the original Windows executable running under Boxedwine. The direct Windows capture surface on the test machine did not expose the game image. Build SHA-256: 8e50050faba34a18d47c6f314486ef2888e4552ab18095e3bb517ecffbb34caa. REA capture ID: ev_d68e7b3816586d97ece5c83e7d0b5f8b9d5bd94970b5dfb74dfde66f8520c0fa.

Player 1 used Single Shot at 60 degrees and power 20. In the 800 × 450 playfield the explosion began at approximately (134,255). The settled terrain lost 686 occupied pixels. The score stayed 0–0 and control passed to Player 2.

The initial surface heights come from the green terrain in the reference frame. The projectile observations record the rightmost visible projectile pixel and its vertical midpoint, followed by capture time in milliseconds. A quadratic fit to those observations and measured horizontal travel time supplied the shot speed and gravity. The crater is rasterized by a circle fitted to the observed blast. Tests compare against the observations and settled mask. A second capture on another terrain supplies an independent impact check.

## Sprint scope

Only the reference shot is calibrated. Other angles and powers extrapolate from it. The stylized artwork, sounds and near-target scoring are prototype behavior. Timing measurements include emulator and frame-capture overhead. Tank movement, original damage rules, other weapons, CPU play and full matches are future work.
