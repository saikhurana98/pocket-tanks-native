(module
  ;; 32-bit Pocket Tanks Deluxe, SingleShotBullet path.
  ;; 0x4398f0 uses the game CRT's sin and cos. Angles here use screen coordinates.
  ;; First-quadrant arctangent used by the CRT angle routine below.
  ;; Range reduction and coefficients adapted from fdlibm s_atan.c, netlib.org/fdlibm.
  ;; Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
  ;; Developed at SunSoft, a Sun Microsystems, Inc. business.
  ;; Permission to use, copy, modify, and distribute this software is freely granted,
  ;; provided that this notice is preserved.
  (func $atan2 (param $y f64) (param $x f64) (result f64)
    (local $r f64) (local $hi f64) (local $lo f64)
    (local $z f64) (local $w f64) (local $odd f64) (local $even f64) (local $tail f64)
    (if (f64.eq (local.get $y) (f64.const 0)) (then (return (f64.const 0))))
    (local.set $r (f64.div (local.get $y) (local.get $x)))
    (if (f64.ge (local.get $r) (f64.const 0.4375))
      (then
        (if (f64.lt (local.get $r) (f64.const 0.6875))
          (then
            (local.set $hi (f64.const 0.4636476090008061))
            (local.set $lo (f64.const 2.2698777452961687e-17))
            (local.set $r (f64.div (f64.sub (f64.mul (f64.const 2) (local.get $r)) (f64.const 1))
                                  (f64.add (f64.const 2) (local.get $r)))))
          (else (if (f64.lt (local.get $r) (f64.const 1.1875))
            (then
              (local.set $hi (f64.const 0.7853981633974483))
              (local.set $lo (f64.const 3.061616997868383e-17))
              (local.set $r (f64.div (f64.sub (local.get $r) (f64.const 1))
                                    (f64.add (local.get $r) (f64.const 1)))))
            (else (if (f64.lt (local.get $r) (f64.const 2.4375))
              (then
                (local.set $hi (f64.const 0.982793723247329))
                (local.set $lo (f64.const 1.3903311031230998e-17))
                (local.set $r (f64.div (f64.sub (local.get $r) (f64.const 1.5))
                                      (f64.add (f64.const 1) (f64.mul (f64.const 1.5) (local.get $r))))))
              (else
                (local.set $hi (f64.const 1.5707963267948966))
                (local.set $lo (f64.const 6.123233995736766e-17))
                (local.set $r (f64.div (f64.const -1) (local.get $r)))))))))))
    (local.set $z (f64.mul (local.get $r) (local.get $r)))
    (local.set $w (f64.mul (local.get $z) (local.get $z)))
    ;; Odd powers of x squared.
    f64.const 0.016285820115365782
    local.get $w   f64.mul   f64.const 0.049768779946159324   f64.add
    local.get $w   f64.mul   f64.const 0.06661073137387531   f64.add
    local.get $w   f64.mul   f64.const 0.09090887133436507   f64.add
    local.get $w   f64.mul   f64.const 0.14285714272503466   f64.add
    local.get $w   f64.mul   f64.const 0.3333333333333293   f64.add
    local.get $z   f64.mul   local.set $odd
    ;; Even powers of x squared.
    f64.const -0.036531572744216916
    local.get $w   f64.mul   f64.const -0.058335701337905735   f64.add
    local.get $w   f64.mul   f64.const -0.0769187620504483   f64.add
    local.get $w   f64.mul   f64.const -0.11111110405462356   f64.add
    local.get $w   f64.mul   f64.const -0.19999999999876483   f64.add
    local.get $w   f64.mul   local.set $even
    (local.set $tail (f64.mul (local.get $r) (f64.add (local.get $odd) (local.get $even))))
    (if (result f64) (f64.eq (local.get $hi) (f64.const 0))
      (then (f64.sub (local.get $r) (local.get $tail)))
      (else (f64.sub (local.get $hi) (f64.sub (f64.sub (local.get $tail) (local.get $lo)) (local.get $r))))))
  (memory (export "memory") 6)
  ;; CRT sine/cosine game-angle path, 0x4c6c65..0x4c6da6 and
  ;; 0x4c6e35..0x4c6f76. Both routines use the same 64 table rows.
  ;; The four doubles in each row are at offsets 0, 8, 16, and 24.
  (func $trig (param $x f64) (param $shift i32) (result f64)
    (local $n f64) (local $row i32)
    (local $t0 f64) (local $t1 f64) (local $t2 f64) (local $t3 f64)
    (local $r1 f64) (local $low f64) (local $r f64) (local $square f64)
    (local $err f64) (local $gain f64) (local $base f64) (local $small f64)
    (local $mid f64) (local $main f64) (local $sinePoly f64) (local $cosinePoly f64) (local $tail f64)
    (if (f64.lt (f64.abs (local.get $x)) (f64.const 1e-30))
      (then (return (select (f64.const 1) (local.get $x) (local.get $shift)))))
    (local.set $n (f64.nearest (f64.mul (local.get $x) (f64.const 10.185916357881302))))
    (local.set $row (i32.add (i32.const 361000) (i32.shl
      (i32.and (i32.add (i32.trunc_f64_s (local.get $n)) (local.get $shift)) (i32.const 63)) (i32.const 5))))
    (local.set $t0 (f64.load (local.get $row)))
    (local.set $t1 (f64.load offset=8 (local.get $row)))
    (local.set $t2 (f64.load offset=16 (local.get $row)))
    (local.set $t3 (f64.load offset=24 (local.get $row)))
    (local.set $r1 (f64.sub (local.get $x) (f64.mul (f64.const 0.09817477042088285) (local.get $n))))
    (local.set $low (f64.mul (local.get $n) (f64.const 3.798187816439979e-12)))
    (local.set $r (f64.sub (local.get $r1) (local.get $low)))
    (local.set $err (f64.sub (f64.mul (local.get $n) (f64.const 1.2639164054974691e-22))
      (f64.sub (f64.sub (local.get $r1) (local.get $r)) (local.get $low))))
    (local.set $square (f64.mul (local.get $r) (local.get $r)))
    (local.set $gain (f64.add (local.get $t0) (local.get $t3)))
    (local.set $base (f64.mul (local.get $t0) (local.get $r)))
    (local.set $small (f64.mul (local.get $t3) (local.get $r)))
    (local.set $mid (f64.add (local.get $small) (local.get $t1)))
    (local.set $main (f64.add (local.get $base) (local.get $mid)))
    (local.set $sinePoly (f64.add
      (f64.add (f64.mul (f64.const 0.008333333333333333) (local.get $square)) (f64.const -0.16666666666666666))
      (f64.mul (f64.add (f64.mul (f64.mul (f64.const 0.0000027557319223985893) (local.get $r1)) (local.get $r))
        (f64.const -0.0001984126984126984)) (f64.mul (local.get $square) (local.get $square)))))
    (local.set $cosinePoly (f64.add
      (f64.add (f64.mul (f64.const 0.041666666666666664) (local.get $square)) (f64.const -0.5))
      (f64.mul (f64.add (f64.mul (f64.mul (f64.const 0.0000248015873015873) (local.get $r1)) (local.get $r))
        (f64.const -0.001388888888888889)) (f64.mul (local.get $square) (local.get $square)))))
    (local.set $tail (f64.add (f64.mul (local.get $err) (f64.sub (f64.mul (local.get $t1) (local.get $r)) (local.get $gain))) (local.get $t2)))
    (local.set $tail (f64.add (local.get $tail) (f64.add (f64.sub (local.get $t1) (local.get $mid)) (local.get $small))))
    (local.set $tail (f64.add (local.get $tail) (f64.add (f64.sub (local.get $mid) (local.get $main)) (local.get $base))))
    (local.set $tail (f64.add (local.get $tail) (f64.mul (local.get $sinePoly)
      (f64.mul (f64.mul (local.get $gain) (local.get $r)) (local.get $square)))))
    (local.set $tail (f64.add (local.get $tail) (f64.mul (local.get $cosinePoly) (f64.mul (local.get $t1) (local.get $square)))))
    (f64.add (local.get $main) (local.get $tail)))
  (func $sin (param $x f64) (result f64) (call $trig (local.get $x) (i32.const 0)))
  (func $cos (param $x f64) (result f64) (call $trig (local.get $x) (i32.const 16)))
  (global $x (export "x") (mut f64) (f64.const 0))
  (global $y (export "y") (mut f64) (f64.const 0))
  (global $vx (export "vx") (mut f64) (f64.const 0))
  (global $vy (export "vy") (mut f64) (f64.const 0))
  (func (export "launch") (param $originX f64) (param $originY f64) (param $degrees f64) (param $power f64)
    (local $angle f64) (local $speed f64)
    (global.set $x (local.get $originX))
    (global.set $y (local.get $originY))
    (local.set $angle (f64.mul (f64.div (local.get $degrees) (f64.const 180)) (f64.const 3.141592653589793)))
    (if (f64.ne (local.get $power) (f64.const 0))
      (then (local.set $speed (f64.add (f64.mul (local.get $power) (f64.const 0.11)) (f64.const 1.1)))))
    (global.set $vx (f64.mul (call $cos (local.get $angle)) (local.get $speed)))
    (global.set $vy (f64.mul (call $sin (local.get $angle)) (local.get $speed))))
  ;; 0x43512f..0x435193. Convert toward zero, clamp, then read one terrain byte.
  (func $cell (param $coord f64) (param $max f64) (result i32)
    (i32.trunc_f64_s (f64.min (local.get $max) (f64.max (f64.const 0) (local.get $coord)))))
  (func $terrainAt (param $x f64) (param $y f64) (result i32)
    (i32.load8_u (i32.add (call $cell (local.get $x) (f64.const 799))
      (i32.mul (i32.const 800) (call $cell (local.get $y) (f64.const 449))))))
  (func $solid (result i32) (call $terrainAt (global.get $x) (global.get $y)))
  ;; 0x44e1b0 and 0x472530. Fire and superball use different velocity scales.
  (func (export "advancePlasma") (param $x f64) (param $y f64) (param $vx f64)
    (param $vy f64) (param $dt f64) (param $scale f64) (result f64 f64 f64)
    (local.set $vy (f64.add (local.get $vy) (f64.mul (f64.const 5.4) (local.get $dt))))
    (local.set $scale (f64.mul (local.get $scale) (local.get $dt)))
    (f64.add (local.get $x) (f64.mul (local.get $vx) (local.get $scale)))
    (f64.add (local.get $y) (f64.mul (local.get $vy) (local.get $scale)))
    (local.get $vy))
  ;; 0x44e363 and 0x472921. Backtrack in twentieths of the contact velocity.
  (func (export "backtrackPlasma") (param $x f64) (param $y f64) (param $vx f64) (param $vy f64) (result f64 f64)
    (local $count i32)
    (local.set $vx (f64.div (local.get $vx) (f64.const 20)))
    (local.set $vy (f64.div (local.get $vy) (f64.const 20)))
    (block $done (loop $sample
      (br_if $done (i32.eqz (call $terrainAt (local.get $x) (local.get $y))))
      (local.set $x (f64.sub (local.get $x) (local.get $vx)))
      (local.set $y (f64.sub (local.get $y) (local.get $vy)))
      (br_if $sample (i32.lt_u (local.tee $count (i32.add (local.get $count) (i32.const 1))) (i32.const 20)))))
    (local.get $x) (local.get $y))
  ;; 0x4890f5..0x4891e1. The EXE uses two distinct pi constants for the beam.
  (func (export "zapEndpoint") (param $x f64) (param $y f64) (param $tx f64) (param $ty f64) (result f64 f64)
    (local $dx f64) (local $dy f64) (local $length f64) (local $angle f64)
    (local.set $dx (f64.sub (local.get $tx) (local.get $x)))
    (local.set $dy (f64.sub (local.get $ty) (local.get $y)))
    (local.set $length (f64.trunc (f64.sqrt (f64.add (f64.mul (local.get $dx) (local.get $dx))
      (f64.mul (local.get $dy) (local.get $dy))))))
    (local.set $angle (f64.div (f64.mul (f64.div (f64.mul (call $crtAtan (local.get $dy) (local.get $dx))
      (f64.const 180)) (f64.const 3.1415927)) (f64.const 3.14159)) (f64.const 180)))
    (local.set $dx (f64.mul (call $cos (local.get $angle)) (f64.const 0.3)))
    (local.set $dy (f64.mul (call $sin (local.get $angle)) (f64.const 0.3)))
    (block $done (loop $sample
      (br_if $done (f64.le (local.get $length) (f64.const 0)))
      (br_if $done (call $terrainAt (local.get $x) (local.get $y)))
      (local.set $x (f64.add (local.get $x) (local.get $dx)))
      (local.set $y (f64.add (local.get $y) (local.get $dy)))
      (local.set $length (f64.sub (local.get $length) (f64.const 0.3)))
      (br $sample)))
    (local.get $x) (local.get $y))
  ;; 0x4343ea selects down, up or disabled gravity. At 0x435800 the
  ;; underground projectile selects empty cells instead of occupied cells.
  (global $gravity (mut f64) (f64.const 1))
  (global $drag (mut f64) (f64.const 0))
  (func (export "setDrag") (param $value f64) (global.set $drag (local.get $value)))
  (global $hitAir (mut i32) (i32.const 0))
  (global $contactX (export "contactX") (mut f64) (f64.const 0))
  (global $contactY (export "contactY") (mut f64) (f64.const 0))
  (export "surfaceAngle" (func $crtAtan))
  (export "surfaceCos" (func $cos))
  (export "surfaceSin" (func $sin))
  (global $fresh (mut i32) (i32.const 0))
  (global $dropX (mut f64) (f64.const -9999))
  (global $dropping (export "dropping") (mut i32) (i32.const 0))
  (func (export "dropTarget") (param $x f64) (global.set $dropX (local.get $x)))
  (global $targetX (mut f64) (f64.const 0))
  (global $targetY (mut f64) (f64.const 0))
  (global $distance (mut f64) (f64.const 0))
  (global $approach (export "approach") (mut i32) (i32.const 0))
  (global $approachX (export "approachX") (mut f64) (f64.const 0))
  (global $approachY (export "approachY") (mut f64) (f64.const 0))
  (global $approachAngle (export "approachAngle") (mut f64) (f64.const 0))
  (global $approachPower (export "approachPower") (mut f64) (f64.const 0))
  (global $homingRange (mut f64) (f64.const 0))
  (global $homingMagnitude (mut f64) (f64.const 0))
  (func (export "homing") (param $range f64) (param $magnitude f64)
    (global.set $homingRange (local.get $range)) (global.set $homingMagnitude (local.get $magnitude)))
  (func (export "proximityTarget") (param $x f64) (param $y f64) (param $range f64)
    (global.set $targetX (local.get $x)) (global.set $targetY (local.get $y))
    (global.set $distance (local.get $range)))
  (func (export "setFlightMode") (param $g f64) (param $air i32) (param $first i32)
    (global.set $fresh (local.get $first))
    (global.set $gravity (local.get $g)) (global.set $hitAir (local.get $air)))
  (func $contact (result i32) (i32.xor (global.get $hitAir) (i32.ne (call $solid) (i32.const 0))))
  (global $bottomContact (export "bottomContact") (mut i32) (i32.const 0))
  (func (export "step") (param $dt f64) (param $wind f64) (result i32)
    (local $scale f64) (local $sx f64) (local $sy f64) (local $remaining f64)
    (global.set $bottomContact (i32.const 0))
    ;; 0x4343f7..0x4344bc. The update stores each velocity before using it.
    (if (f64.ne (global.get $gravity) (f64.const 0)) (then
      (global.set $vy (f64.add (f64.mul (global.get $gravity) (f64.mul (f64.const 5.4) (local.get $dt))) (global.get $vy)))))
    ;; Preserve the signed zero on stationary, non-colliding emitters.
    ;; Their next trigger obtains its direction from both velocity sign bits.
    (if (i32.eqz (global.get $hitAir)) (then
      (global.set $vx (f64.add (f64.mul (f64.mul (local.get $wind) (f64.const 0.02)) (local.get $dt)) (global.get $vx)))))
    ;; 0x434451 applies the specified drag along the reverse velocity vector.
    (if (f64.ne (global.get $drag) (f64.const 0)) (then
      (local.set $sx (call $crtAtan (f64.neg (global.get $vy)) (f64.neg (global.get $vx))))
      (local.set $scale (f64.mul (global.get $drag) (local.get $dt)))
      (global.set $vx (f64.add (global.get $vx) (f64.mul (call $cos (local.get $sx)) (local.get $scale))))
      (global.set $vy (f64.add (global.get $vy) (f64.mul (call $sin (local.get $sx)) (local.get $scale))))))
    (local.set $scale (f64.mul (local.get $dt) (f64.const 50)))
    (global.set $x (f64.add (f64.mul (local.get $scale) (global.get $vx)) (global.get $x)))
    (global.set $y (f64.add (f64.mul (local.get $scale) (global.get $vy)) (global.get $y)))
    ;; 0x43454f..0x4345be. Within three pixels of the opposing tank,
    ;; damp lateral velocity once per tick and stop motion against gravity.
    (global.set $dropping (f64.le (f64.abs (f64.sub (global.get $x) (global.get $dropX))) (f64.const 3)))
    (if (global.get $dropping) (then
      (global.set $vx (f64.mul (global.get $vx) (f64.const 0.5)))
      (if (f64.lt (f64.mul (global.get $vy) (global.get $gravity)) (f64.const 0))
        (then (global.set $vy (f64.const 0))))))
    ;; 0x434712..0x4347a2 tests the opposing tank's anchor before terrain contact.
    (global.set $approach (i32.const 0))
    (if (f64.gt (global.get $distance) (f64.const 0)) (then
      (local.set $sx (f64.sub (global.get $x) (global.get $targetX)))
      (local.set $sy (f64.sub (global.get $y) (global.get $targetY)))
      (global.set $approach (f64.lt (f64.sqrt (f64.add
        (f64.mul (local.get $sx) (local.get $sx)) (f64.mul (local.get $sy) (local.get $sy)))) (global.get $distance)))
      (if (global.get $approach) (then
        (global.set $approachX (global.get $x)) (global.set $approachY (global.get $y))
        (global.set $approachAngle (call $impactAngle)) (global.set $approachPower (call $impactPower))))))
    ;; 0x434c40..0x434cd5. Acceleration toward the target after updating position.
    (if (f64.gt (global.get $homingRange) (f64.const 0)) (then
      (local.set $sx (f64.sub (global.get $targetX) (global.get $x)))
      (local.set $sy (f64.sub (global.get $targetY) (global.get $y)))
      (if (f64.lt (f64.sqrt (f64.add (f64.mul (local.get $sx) (local.get $sx))
        (f64.mul (local.get $sy) (local.get $sy)))) (global.get $homingRange)) (then
        (local.set $scale (f64.mul (global.get $homingMagnitude) (local.get $dt)))
        (local.set $remaining (call $crtAtan (local.get $sy) (local.get $sx)))
        (global.set $vx (f64.add (global.get $vx) (f64.mul (call $cos (local.get $remaining)) (local.get $scale))))
        (global.set $vy (f64.add (global.get $vy) (f64.mul (call $sin (local.get $remaining)) (local.get $scale))))))))
    (if (i32.or (f64.lt (global.get $x) (f64.const 0)) (f64.ge (global.get $x) (f64.const 800)))
      (then (return (i32.const 2))))
    ;; 0x4350cf..0x435109 removes upward-moving shells above the field
    ;; when their gravity mode cannot bring them back.
    (if (i32.and (f64.le (global.get $gravity) (f64.const 0))
          (i32.and (f64.le (global.get $y) (f64.const 0)) (f64.le (global.get $vy) (f64.const 0))))
      (then (return (i32.const 2))))
    (if (f64.ge (global.get $y) (f64.const 450))
      (then (global.set $bottomContact (i32.const 1)) (global.set $y (f64.const 449)) (return (i32.const 1))))
    (if (i32.eq (global.get $hitAir) (i32.const 2)) (then (return (i32.const 0))))
    (if (i32.eqz (call $contact)) (then (return (i32.const 0))))
    ;; 0x4351a3..0x43526e and 0x4354f9..0x435508, ordinary terrain.
    (local.set $sx (f64.div (global.get $vx) (f64.const 20)))
    (local.set $sy (f64.div (global.get $vy) (f64.const 20)))
    (local.set $remaining (local.get $dt))
    (block $done (loop $back
      (br_if $done (i32.and (global.get $fresh) (i32.eqz (global.get $hitAir))))
      (br_if $done (f64.le (local.get $remaining) (f64.const 0)))
      (br_if $done (i32.eqz (call $contact)))
      (global.set $x (f64.sub (global.get $x) (local.get $sx)))
      (global.set $y (f64.sub (global.get $y) (local.get $sy)))
      (local.set $remaining (f64.sub (local.get $remaining) (f64.div (local.get $dt) (f64.const 20))))
      (br $back)))
    (global.set $contactX (global.get $x))
    (global.set $contactY (global.get $y))
    (global.set $x (f64.add (local.get $sx) (global.get $x)))
    (global.set $y (f64.add (local.get $sy) (global.get $y)))
    (i32.const 1))
  ;; Eight symmetric pixels per iteration, integer recurrence from 0x429000.
  (func $erasePixel (param $cx i32) (param $cy i32)
    (if (i32.and (i32.lt_u (local.get $cx) (i32.const 800)) (i32.lt_u (local.get $cy) (i32.const 450)))
      (then (i32.store8 (i32.add (i32.mul (local.get $cy) (i32.const 800)) (local.get $cx)) (i32.const 0)))))
  (func $rowPair (param $cx i32) (param $cy i32) (param $dx i32)
    (call $erasePixel (i32.sub (local.get $cx) (local.get $dx)) (local.get $cy))
    (call $erasePixel (i32.add (local.get $cx) (local.get $dx)) (local.get $cy)))
  (func $ring (param $cx i32) (param $cy i32) (param $r i32)
    (local $i i32) (local $j i32) (local $error i32) (local $limit i32)
    (local.set $j (local.get $r))
    (local.set $error (i32.mul (local.get $r) (local.get $r)))
    (local.set $limit (i32.sub (local.get $error) (local.get $r)))
    (loop $octant
      (call $rowPair (local.get $cx) (i32.sub (local.get $cy) (local.get $j)) (local.get $i))
      (call $rowPair (local.get $cx) (i32.add (local.get $cy) (local.get $j)) (local.get $i))
      (call $rowPair (local.get $cx) (i32.sub (local.get $cy) (local.get $i)) (local.get $j))
      (call $rowPair (local.get $cx) (i32.add (local.get $cy) (local.get $i)) (local.get $j))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (local.set $error (i32.add (local.get $error) (i32.sub (i32.const 1) (i32.mul (i32.const 2) (local.get $i)))))
      (if (i32.le_s (local.get $error) (local.get $limit))
        (then (local.set $j (i32.sub (local.get $j) (i32.const 1)))
          (local.set $limit (i32.sub (local.get $limit) (i32.mul (local.get $j) (i32.const 2))))))
      (br_if $octant (i32.le_s (local.get $i) (local.get $j)))))
  (global $blastAge (export "blastAge") (mut f64) (f64.const 0))
  (global $phase (export "phase") (mut i32) (i32.const 0))
  (global $radius (mut i32) (i32.const 22))
  ;; Convex polygon test at 0x433d60. Edge coordinates count as hits.
  (func (export "insideHull") (param $x i32) (param $y i32) (param $base i32) (param $count i32) (result i32)
    (local $node i32) (local $next i32) (local $end i32) (local $ax i32) (local $ay i32)
    (local.set $node (local.get $base))
    (local.set $end (i32.add (local.get $base) (i32.shl (local.get $count) (i32.const 3))))
    (loop $edge
      (local.set $next (i32.add (local.get $node) (i32.const 8)))
      (if (i32.eq (local.get $next) (local.get $end)) (then (local.set $next (local.get $base))))
      (local.set $ax (i32.load (local.get $node)))
      (local.set $ay (i32.load offset=4 (local.get $node)))
      (if (i32.gt_s (i32.add
        (i32.mul (i32.sub (i32.load offset=4 (local.get $next)) (local.get $ay)) (i32.sub (local.get $x) (local.get $ax)))
        (i32.mul (i32.sub (local.get $ax) (i32.load (local.get $next))) (i32.sub (local.get $y) (local.get $ay)))) (i32.const 0))
        (then (return (i32.const 0))))
      (local.set $node (local.get $next))
      (br_if $edge (i32.ne (local.get $node) (local.get $base))))
    (i32.const 1))
  ;; Game random stream at 0x4422fc..0x442322. The next unsigned 32-bit
  ;; state, reduced modulo the pack operand, supplies the RND operation.
  (func (export "nextRandom") (param $seed i32) (result i32)
    (i32.sub (i32.mul (i32.and (local.get $seed) (i32.const 1)) (i32.const 0x5eb0a82f))
             (i32.mul (i32.shr_u (local.get $seed) (i32.const 1)) (i32.const 0x429eaf9d))))
  (global $eraseTerrain (mut i32) (i32.const 1))
  (func (export "setTerrainErase") (param $enabled i32) (global.set $eraseTerrain (local.get $enabled)))
  (func (export "setBlastRadius") (param $size i32)
    (global.set $radius (local.get $size)))
  ;; 0x447de0..0x447e15 copies a falling section down one pixel, bottom first.
  (func (export "dropColumn") (param $x i32) (param $top i32) (param $bottom i32)
    (local $at i32) (local $first i32)
    (local.set $first (i32.add (local.get $x) (i32.mul (local.get $top) (i32.const 800))))
    (local.set $at (i32.add (local.get $x) (i32.mul (local.get $bottom) (i32.const 800))))
    (block $clear (loop $copy
      (br_if $clear (i32.le_s (local.get $at) (local.get $first)))
      (i32.store8 (local.get $at) (i32.load8_u (i32.sub (local.get $at) (i32.const 800))))
      (local.set $at (i32.sub (local.get $at) (i32.const 800)))
      (br $copy)))
    (i32.store8 (local.get $first) (i32.const 0)))
  ;; 0x44c40a..0x44c465 and 0x44c595..0x44c5bf. The integer conversion
  ;; occurs separately on each coordinate and again after the square root.
  (func (export "blastDamage") (param $cx f64) (param $cy f64)
    (param $tankX f64) (param $tankY f64) (param $front i32) (param $damage i32) (result i32)
    (local $dx f64) (local $dy f64) (local $distance i32) (local $outside i32)
    (if (i32.le_s (global.get $radius) (i32.const 0)) (then (return (i32.const 0))))
    (local.set $dx (f64.sub (f64.trunc (local.get $cx)) (f64.trunc (local.get $tankX))))
    (local.set $dy (f64.sub (f64.trunc (local.get $cy)) (f64.trunc (local.get $tankY))))
    (local.set $distance (i32.trunc_f64_s (f64.sqrt (f64.add
      (f64.mul (local.get $dx) (local.get $dx)) (f64.mul (local.get $dy) (local.get $dy))))))
    (if (i32.gt_s (i32.sub (local.get $distance) (i32.const 14)) (local.get $front))
      (then (return (i32.const 0))))
    (local.set $outside (i32.sub (local.get $distance) (i32.const 15)))
    (if (i32.lt_s (local.get $outside) (i32.const 0)) (then (local.set $outside (i32.const 0))))
    (i32.div_s (i32.mul (i32.sub (global.get $radius) (local.get $outside)) (local.get $damage)) (global.get $radius)))
  ;; 0x4419f0..0x441a2d. Positive hits on the firing tank subtract from
  ;; the active player's score and the result is bounded at zero.
  (func (export "scoreHit") (param $score i32) (param $points i32) (param $self i32) (result i32)
    (local $sum i32)
    (if (i32.le_s (local.get $points) (i32.const 0)) (then (return (local.get $score))))
    (local.set $sum (i32.add (local.get $score) (select (i32.sub (i32.const 0) (local.get $points))
      (local.get $points) (local.get $self))))
    (select (local.get $sum) (i32.const 0) (i32.gt_s (local.get $sum) (i32.const 0))))
  (func (export "beginBlast")
    (global.set $blastAge (f64.const 0)) (global.set $phase (i32.const 0)))
  (func (export "blastStep") (param $dt f64) (result i32)
    (local $cx i32) (local $cy i32)
    (global.set $blastAge (f64.add (global.get $blastAge) (local.get $dt)))
    ;; Strict threshold at 0x44bc7f. DOUBLE_UP_FLAG requests a second
    ;; outline one pixel to the right (0x44c049 and 0x44c07a).
    (if (f64.gt (global.get $blastAge) (f64.const 0.02)) (then
      (global.set $blastAge (f64.sub (global.get $blastAge) (f64.const 0.02)))
      (if (i32.and (global.get $eraseTerrain) (i32.lt_s (global.get $phase) (i32.sub (global.get $radius) (i32.const 1)))) (then
        (local.set $cx (i32.trunc_f64_s (global.get $x)))
        (local.set $cy (i32.trunc_f64_s (global.get $y)))
        (call $ring (local.get $cx) (local.get $cy) (global.get $phase))
        (call $ring (i32.add (local.get $cx) (i32.const 1)) (local.get $cy) (global.get $phase))))
      (global.set $phase (i32.add (global.get $phase) (i32.const 1)))))
    (global.get $phase))

  ;; Tank muzzle lookup (0x476410 and 0x4764a0), independent turret mode.
  ;; Here the original uses a different pi constant than its velocity helper.
  (func $mountAngle (param $degrees f64) (result f64)
    (f64.mul (f64.div (local.get $degrees) (f64.const 180)) (f64.const 3.1415927)))
  (func (export "muzzleX") (param $x f64) (param $slope f64) (param $angle f64) (result f64)
    (local $origin f64)
    (local.set $origin (f64.trunc (f64.sub (f64.add
      (f64.add (f64.mul (call $cos (call $mountAngle (f64.sub (local.get $slope) (f64.const 90)))) (f64.const 7)) (local.get $x))
      (f64.mul (call $cos (call $mountAngle (f64.trunc (local.get $angle)))) (f64.const 15))) (f64.const 1))))
    (if (i32.and (f64.eq (local.get $slope) (f64.const 0))
          (i32.and (f64.gt (local.get $angle) (f64.const 250)) (f64.lt (local.get $angle) (f64.const 300))))
      (then (local.set $origin (f64.sub (local.get $origin) (f64.const 0.1)))))
    (local.get $origin))
  (func (export "muzzleY") (param $y f64) (param $slope f64) (param $angle f64) (result f64)
    (f64.trunc (f64.sub (f64.add
      (f64.add (f64.mul (call $sin (call $mountAngle (f64.sub (local.get $slope) (f64.const 90)))) (f64.const 7)) (local.get $y))
      (f64.mul (call $sin (call $mountAngle (f64.trunc (local.get $angle)))) (f64.const 15))) (f64.const 1))))
  ;; 0x4c724c..0x4c726b operates in the positive quadrant first, then
  ;; reflects the angle along X and Y. This order affects secondary launches.
  (func $crtAtan (param $y f64) (param $x f64) (result f64)
    (local $a f64)
    (local.set $a (call $atan2 (f64.abs (local.get $y)) (f64.abs (local.get $x))))
    (if (f64.lt (f64.copysign (f64.const 1) (local.get $x)) (f64.const 0))
      (then (local.set $a (f64.sub (f64.const 3.141592653589793) (local.get $a)))))
    (f64.copysign (local.get $a) (local.get $y)))
  (func $impactAngle (export "impactAngle") (result f64)
    (f64.div (f64.mul (call $crtAtan (global.get $vy) (global.get $vx)) (f64.const 180)) (f64.const 3.141592653589793)))
  (func $impactPower (export "impactPower") (result f64)
    (local $p f64)
    (local.set $p (f64.div (f64.sub (f64.sqrt (f64.add
      (f64.mul (global.get $vy) (global.get $vy)) (f64.mul (global.get $vx) (global.get $vx)))) (f64.const 1.1)) (f64.const 0.11)))
    (select (local.get $p) (f64.const 0.0001) (f64.ne (local.get $p) (f64.const 0))))
  ;; Original CRT table at 0x4e44c0, one row per pi/32.
  (data (i32.const 361000)
    "\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\f0\3f"
    "\31\6d\6d\17\2e\b9\73\bf\2c\b4\29\bc\a6\17\b9\3f\00\00\00\e0\18\27\3e\bc\00\00\00\00\00\00\f0\3f"
    "\fb\69\14\01\06\ad\93\bf\0b\a6\69\3c\b8\f8\c8\3f\00\00\00\c0\19\6d\62\bc\00\00\00\00\00\00\f0\3f"
    "\5a\22\9d\93\ea\0b\a6\bf\06\9f\d5\2e\06\94\d2\3f\00\00\00\a0\8d\d2\75\bc\00\00\00\00\00\00\f0\3f"
    "\cf\95\6b\86\a1\7c\b3\bf\63\a9\ae\a6\e2\7d\d8\3f\00\00\00\e0\ed\2c\67\bc\00\00\00\00\00\00\f0\3f"
    "\79\12\fa\73\68\3a\be\bf\3b\f6\06\38\5d\2b\de\3f\00\00\00\20\89\0d\5e\3c\00\00\00\00\00\00\f0\3f"
    "\74\79\c5\5b\67\92\c5\bf\c8\68\ae\39\3b\c7\e1\3f\00\00\00\20\dd\25\8b\3c\00\00\00\00\00\00\f0\3f"
    "\fd\a2\ab\53\fe\0d\cd\bf\d6\1d\09\25\f3\4c\e4\3f\00\00\00\20\6a\07\68\3c\00\00\00\00\00\00\f0\3f"
    "\32\ef\fc\99\79\82\ca\3f\cd\3b\7f\66\9e\a0\e6\3f\00\00\00\20\34\dd\8b\bc\00\00\00\00\00\00\e0\3f"
    "\58\77\24\94\cc\33\c1\3f\41\17\15\6b\80\bc\e8\3f\00\00\00\20\e1\c5\82\bc\00\00\00\00\00\00\e0\3f"
    "\87\8c\e6\9a\b3\73\ac\3f\a3\a1\0e\29\66\9b\ea\3f\00\00\00\e0\30\f6\39\3c\00\00\00\00\00\00\e0\3f"
    "\4e\9c\90\7f\2c\4a\9d\bf\b1\bd\80\f1\b2\38\ec\3f\00\00\00\80\b1\e0\76\bc\00\00\00\00\00\00\e0\3f"
    "\75\5a\45\65\75\08\be\bf\46\8d\32\cf\6b\90\ed\3f\00\00\00\20\e6\57\74\3c\00\00\00\00\00\00\e0\3f"
    "\2d\f8\ac\76\31\a0\a4\3f\da\2d\c6\56\41\9f\ee\3f\00\00\00\e0\b1\60\87\3c\00\00\00\00\00\00\d0\3f"
    "\d5\67\59\0e\1f\1d\ac\bf\b0\5c\f7\cf\97\62\ef\3f\00\00\00\20\17\62\75\3c\00\00\00\00\00\00\d0\3f"
    "\50\2f\59\0f\65\a1\9b\bf\26\25\d1\a3\8d\d8\ef\3f\00\00\00\40\f6\7d\88\bc\00\00\00\00\00\00\c0\3f"
    "\00\00\00\00\00\00\00\00\00\00\00\00\00\00\f0\3f\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00"
    "\50\2f\59\0f\65\a1\9b\3f\26\25\d1\a3\8d\d8\ef\3f\00\00\00\40\f6\7d\88\bc\00\00\00\00\00\00\c0\bf"
    "\d5\67\59\0e\1f\1d\ac\3f\b0\5c\f7\cf\97\62\ef\3f\00\00\00\20\17\62\75\3c\00\00\00\00\00\00\d0\bf"
    "\2d\f8\ac\76\31\a0\a4\bf\da\2d\c6\56\41\9f\ee\3f\00\00\00\e0\b1\60\87\3c\00\00\00\00\00\00\d0\bf"
    "\75\5a\45\65\75\08\be\3f\46\8d\32\cf\6b\90\ed\3f\00\00\00\20\e6\57\74\3c\00\00\00\00\00\00\e0\bf"
    "\4e\9c\90\7f\2c\4a\9d\3f\b1\bd\80\f1\b2\38\ec\3f\00\00\00\80\b1\e0\76\bc\00\00\00\00\00\00\e0\bf"
    "\87\8c\e6\9a\b3\73\ac\bf\a3\a1\0e\29\66\9b\ea\3f\00\00\00\e0\30\f6\39\3c\00\00\00\00\00\00\e0\bf"
    "\58\77\24\94\cc\33\c1\bf\41\17\15\6b\80\bc\e8\3f\00\00\00\20\e1\c5\82\bc\00\00\00\00\00\00\e0\bf"
    "\32\ef\fc\99\79\82\ca\bf\cd\3b\7f\66\9e\a0\e6\3f\00\00\00\20\34\dd\8b\bc\00\00\00\00\00\00\e0\bf"
    "\fd\a2\ab\53\fe\0d\cd\3f\d6\1d\09\25\f3\4c\e4\3f\00\00\00\20\6a\07\68\3c\00\00\00\00\00\00\f0\bf"
    "\74\79\c5\5b\67\92\c5\3f\c8\68\ae\39\3b\c7\e1\3f\00\00\00\20\dd\25\8b\3c\00\00\00\00\00\00\f0\bf"
    "\79\12\fa\73\68\3a\be\3f\3b\f6\06\38\5d\2b\de\3f\00\00\00\20\89\0d\5e\3c\00\00\00\00\00\00\f0\bf"
    "\cf\95\6b\86\a1\7c\b3\3f\63\a9\ae\a6\e2\7d\d8\3f\00\00\00\e0\ed\2c\67\bc\00\00\00\00\00\00\f0\bf"
    "\5a\22\9d\93\ea\0b\a6\3f\06\9f\d5\2e\06\94\d2\3f\00\00\00\a0\8d\d2\75\bc\00\00\00\00\00\00\f0\bf"
    "\fb\69\14\01\06\ad\93\3f\0b\a6\69\3c\b8\f8\c8\3f\00\00\00\c0\19\6d\62\bc\00\00\00\00\00\00\f0\bf"
    "\31\6d\6d\17\2e\b9\73\3f\2c\b4\29\bc\a6\17\b9\3f\00\00\00\e0\18\27\3e\bc\00\00\00\00\00\00\f0\bf"
    "\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\f0\bf"
    "\31\6d\6d\17\2e\b9\73\3f\2c\b4\29\bc\a6\17\b9\bf\00\00\00\e0\18\27\3e\3c\00\00\00\00\00\00\f0\bf"
    "\fb\69\14\01\06\ad\93\3f\0b\a6\69\3c\b8\f8\c8\bf\00\00\00\c0\19\6d\62\3c\00\00\00\00\00\00\f0\bf"
    "\5a\22\9d\93\ea\0b\a6\3f\06\9f\d5\2e\06\94\d2\bf\00\00\00\a0\8d\d2\75\3c\00\00\00\00\00\00\f0\bf"
    "\cf\95\6b\86\a1\7c\b3\3f\63\a9\ae\a6\e2\7d\d8\bf\00\00\00\e0\ed\2c\67\3c\00\00\00\00\00\00\f0\bf"
    "\79\12\fa\73\68\3a\be\3f\3b\f6\06\38\5d\2b\de\bf\00\00\00\20\89\0d\5e\bc\00\00\00\00\00\00\f0\bf"
    "\74\79\c5\5b\67\92\c5\3f\c8\68\ae\39\3b\c7\e1\bf\00\00\00\20\dd\25\8b\bc\00\00\00\00\00\00\f0\bf"
    "\fd\a2\ab\53\fe\0d\cd\3f\d6\1d\09\25\f3\4c\e4\bf\00\00\00\20\6a\07\68\bc\00\00\00\00\00\00\f0\bf"
    "\32\ef\fc\99\79\82\ca\bf\cd\3b\7f\66\9e\a0\e6\bf\00\00\00\20\34\dd\8b\3c\00\00\00\00\00\00\e0\bf"
    "\58\77\24\94\cc\33\c1\bf\41\17\15\6b\80\bc\e8\bf\00\00\00\20\e1\c5\82\3c\00\00\00\00\00\00\e0\bf"
    "\87\8c\e6\9a\b3\73\ac\bf\a3\a1\0e\29\66\9b\ea\bf\00\00\00\e0\30\f6\39\bc\00\00\00\00\00\00\e0\bf"
    "\4e\9c\90\7f\2c\4a\9d\3f\b1\bd\80\f1\b2\38\ec\bf\00\00\00\80\b1\e0\76\3c\00\00\00\00\00\00\e0\bf"
    "\75\5a\45\65\75\08\be\3f\46\8d\32\cf\6b\90\ed\bf\00\00\00\20\e6\57\74\bc\00\00\00\00\00\00\e0\bf"
    "\2d\f8\ac\76\31\a0\a4\bf\da\2d\c6\56\41\9f\ee\bf\00\00\00\e0\b1\60\87\bc\00\00\00\00\00\00\d0\bf"
    "\d5\67\59\0e\1f\1d\ac\3f\b0\5c\f7\cf\97\62\ef\bf\00\00\00\20\17\62\75\bc\00\00\00\00\00\00\d0\bf"
    "\50\2f\59\0f\65\a1\9b\3f\26\25\d1\a3\8d\d8\ef\bf\00\00\00\40\f6\7d\88\3c\00\00\00\00\00\00\c0\bf"
    "\00\00\00\00\00\00\00\00\00\00\00\00\00\00\f0\bf\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00"
    "\50\2f\59\0f\65\a1\9b\bf\26\25\d1\a3\8d\d8\ef\bf\00\00\00\40\f6\7d\88\3c\00\00\00\00\00\00\c0\3f"
    "\d5\67\59\0e\1f\1d\ac\bf\b0\5c\f7\cf\97\62\ef\bf\00\00\00\20\17\62\75\bc\00\00\00\00\00\00\d0\3f"
    "\2d\f8\ac\76\31\a0\a4\3f\da\2d\c6\56\41\9f\ee\bf\00\00\00\e0\b1\60\87\bc\00\00\00\00\00\00\d0\3f"
    "\75\5a\45\65\75\08\be\bf\46\8d\32\cf\6b\90\ed\bf\00\00\00\20\e6\57\74\bc\00\00\00\00\00\00\e0\3f"
    "\4e\9c\90\7f\2c\4a\9d\bf\b1\bd\80\f1\b2\38\ec\bf\00\00\00\80\b1\e0\76\3c\00\00\00\00\00\00\e0\3f"
    "\87\8c\e6\9a\b3\73\ac\3f\a3\a1\0e\29\66\9b\ea\bf\00\00\00\e0\30\f6\39\bc\00\00\00\00\00\00\e0\3f"
    "\58\77\24\94\cc\33\c1\3f\41\17\15\6b\80\bc\e8\bf\00\00\00\20\e1\c5\82\3c\00\00\00\00\00\00\e0\3f"
    "\32\ef\fc\99\79\82\ca\3f\cd\3b\7f\66\9e\a0\e6\bf\00\00\00\20\34\dd\8b\3c\00\00\00\00\00\00\e0\3f"
    "\fd\a2\ab\53\fe\0d\cd\bf\d6\1d\09\25\f3\4c\e4\bf\00\00\00\20\6a\07\68\bc\00\00\00\00\00\00\f0\3f"
    "\74\79\c5\5b\67\92\c5\bf\c8\68\ae\39\3b\c7\e1\bf\00\00\00\20\dd\25\8b\bc\00\00\00\00\00\00\f0\3f"
    "\79\12\fa\73\68\3a\be\bf\3b\f6\06\38\5d\2b\de\bf\00\00\00\20\89\0d\5e\bc\00\00\00\00\00\00\f0\3f"
    "\cf\95\6b\86\a1\7c\b3\bf\63\a9\ae\a6\e2\7d\d8\bf\00\00\00\e0\ed\2c\67\3c\00\00\00\00\00\00\f0\3f"
    "\5a\22\9d\93\ea\0b\a6\bf\06\9f\d5\2e\06\94\d2\bf\00\00\00\a0\8d\d2\75\3c\00\00\00\00\00\00\f0\3f"
    "\fb\69\14\01\06\ad\93\bf\0b\a6\69\3c\b8\f8\c8\bf\00\00\00\c0\19\6d\62\3c\00\00\00\00\00\00\f0\3f"
    "\31\6d\6d\17\2e\b9\73\bf\2c\b4\29\bc\a6\17\b9\bf\00\00\00\e0\18\27\3e\3c\00\00\00\00\00\00\f0\3f")
)
