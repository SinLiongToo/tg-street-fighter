/**
 * TAIGI FIGHTER 700 - Jointed Fighter Rig (90s arcade sprite style)
 *
 * Fighters are drawn from a small skeleton (hips, knees, shoulders, elbows)
 * solved with 2-bone IK, with thick dark outlines and two-tone cel shading.
 *
 * Animation is limited-frame on purpose: each key pose is held for a few
 * ticks and then snaps to the next one, like hand-drawn arcade sprites,
 * instead of being tweened. Root motion (dash, knockback, jumps, falls)
 * comes from ArcadeRenderer.poseTarget().
 *
 * Local space: origin at the feet, facing +x, y grows downward.
 */
(function () {
  const DEG = Math.PI / 180;

  // ---------- Geometry helpers ----------

  // 2-bone IK: returns { j: middle joint, e: end point }.
  // `pick` chooses between the two bend solutions.
  function ik(ax, ay, tx, ty, l1, l2, pick) {
    const dx = tx - ax, dy = ty - ay;
    const d = Math.hypot(dx, dy) || 0.001;
    const dc = Math.max(Math.abs(l1 - l2) + 0.01, Math.min(l1 + l2 - 0.01, d));
    const th = Math.atan2(dy, dx);
    const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + dc * dc - l2 * l2) / (2 * l1 * dc))));
    const j1 = { x: ax + Math.cos(th - a) * l1, y: ay + Math.sin(th - a) * l1 };
    const j2 = { x: ax + Math.cos(th + a) * l1, y: ay + Math.sin(th + a) * l1 };
    const j = pick(j1, j2);
    const ux = tx - j.x, uy = ty - j.y;
    const ul = Math.hypot(ux, uy) || 0.001;
    return { j, e: { x: j.x + ux / ul * l2, y: j.y + uy / ul * l2 } };
  }
  const kneeForward = (a, b) => (a.x >= b.x ? a : b);
  const elbowDown = (a, b) => (a.y >= b.y ? a : b);

  function line(ctx, a, b) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Limb segment: outline, shade body, offset highlight (cel shading)
  function seg(ctx, a, b, w, mat, pal) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = w + 5;
    line(ctx, a, b);
    ctx.strokeStyle = mat.s;
    ctx.lineWidth = w;
    line(ctx, a, b);
    const o = w * 0.16;
    ctx.strokeStyle = mat.c;
    ctx.lineWidth = w * 0.55;
    line(ctx, { x: a.x - o, y: a.y - o }, { x: b.x - o, y: b.y - o });
  }

  // Round blob (head, fist): outline, shade, offset lit disc
  function blob(ctx, x, y, r, mat, pal) {
    ctx.fillStyle = pal.outline;
    ctx.beginPath(); ctx.arc(x, y, r + 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = mat.s;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = mat.c;
    ctx.beginPath(); ctx.arc(x + r * 0.15, y - r * 0.15, r * 0.78, 0, Math.PI * 2); ctx.fill();
  }

  function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  }

  const add = (p, v, k = 1) => ({ x: p.x + v.x * k, y: p.y + v.y * k });

  // ---------- Characters ----------

  const M = (c, s) => ({ c, s });

  const CHARACTERS = {
    player: {
      build: 1.0,
      pants: M('#f4f4fa', '#bdbdcf'), top: M('#f4f4fa', '#c4c4d6'),
      skin: M('#e0a36d', '#a8703f'), glove: M('#e53935', '#8e1b1b'),
      feet: 'skin', sleeves: 'short', torsoStyle: 'gi', head: 'player',
      hipW: 13, shW: 18
    },
    // Index = stage / P2 character
    enemies: [
      { // 火雞哥 - night market brawler
        build: 1.06,
        pants: M('#37474f', '#1c262b'), top: M('#d32f2f', '#8e1b1b'),
        skin: M('#d4a27a', '#9c6c48'), glove: M('#2b2b2b', '#0d0d0d'),
        feet: 'boot', sleeves: 'none', torsoStyle: 'vest', head: 'bandanna',
        hipW: 14, shW: 20
      },
      { // 鐵拳廟公伯 - temple master
        build: 1.0,
        pants: M('#2b2b2b', '#121212'), top: M('#ef6c00', '#a84300'),
        skin: M('#dcb48c', '#a47e5a'), glove: M('#dcb48c', '#a47e5a'),
        feet: 'boot', sleeves: 'long', torsoStyle: 'tang', head: 'elder',
        hipW: 13, shW: 18
      },
      { // 港都海霸王 - harbor sailor
        build: 1.14,
        pants: M('#1565c0', '#0b3c7a'), top: M('#ffffff', '#b8c4d6'),
        skin: M('#bf8452', '#86562e'), glove: M('#bf8452', '#86562e'),
        feet: 'boot', sleeves: 'none', torsoStyle: 'stripes', head: 'sailor',
        hipW: 15, shW: 22
      },
      { // 考官修羅 - final boss
        build: 1.1,
        pants: M('#2a0a4a', '#140326'), top: M('#6a1b9a', '#3a0b5a'),
        skin: M('#a993c4', '#6e5a88'), glove: M('#1a0033', '#0a0014'),
        feet: 'boot', sleeves: 'none', torsoStyle: 'sash', head: 'demon',
        hipW: 14, shW: 20, aura: true
      }
    ]
  };

  const FLASH_MAT = M('#ffffff', '#ffd9b3');

  function flashPalette(ch) {
    const out = Object.assign({}, ch);
    ['pants', 'top', 'skin', 'glove'].forEach(k => { out[k] = FLASH_MAT; });
    return out;
  }

  // ---------- Key poses ----------
  // hip: hip joint; lean: torso lean in degrees (+ = forward);
  // fF/fB: front/back foot targets; hF/hB: front/back hand targets.

  const STANCE = {
    hip: [0, -60], lean: 8, tilt: 0,
    fF: [24, 0], fB: [-26, 0],
    hF: [38, -98], hB: [22, -110],
    hands: 'fist'
  };
  const P = (over) => Object.assign({}, STANCE, over);

  const POSES = {
    punchWind: P({ hip: [-4, -58], lean: -4, hF: [14, -96], hB: [-4, -94] }),
    punchExtend: P({ hip: [4, -58], lean: 12, fF: [34, 0], hF: [64, -104], hB: [2, -92] }),
    punchActive: P({ hip: [8, -56], lean: 18, fF: [40, 0], fB: [-30, 0], hF: [112, -104], hB: [-6, -84] }),
    hopBack: P({ hip: [0, -64], lean: 2, fF: [16, -6], fB: [-18, -10], hF: [34, -104], hB: [20, -114] }),

    kickChamber: P({ hip: [-2, -62], lean: -6, fF: [20, -34], fB: [-14, 0], hF: [30, -104], hB: [14, -112] }),
    kickActive: P({ hip: [-4, -64], lean: -20, fF: [84, -98], fB: [-16, 0], hF: [24, -114], hB: [-30, -96] }),

    hadoWind: P({ hip: [-6, -54], lean: -6, fF: [26, 0], fB: [-34, 0], hF: [-14, -80], hB: [-18, -84], hands: 'palm' }),
    hadoPush: P({ hip: [4, -52], lean: 12, fF: [40, 0], fB: [-36, 0], hF: [90, -92], hB: [86, -80], hands: 'palm' }),
    hadoRecover: P({ hip: [0, -58], lean: 4 }),

    shoCrouch: P({ hip: [0, -42], lean: 16, fF: [26, 0], fB: [-24, 0], hF: [26, -56], hB: [16, -80] }),
    shoRise: P({ hip: [0, -70], lean: -4, fF: [16, -34], fB: [-8, -4], hF: [16, -184], hB: [-20, -74] }),
    shoFall: P({ hip: [0, -66], lean: 6, fF: [22, -26], fB: [-10, -20], hF: [30, -112], hB: [16, -100] }),

    hitRecoil: P({ hip: [-6, -62], lean: -24, tilt: -20, fF: [16, 0], fB: [-30, 0], hF: [20, -126], hB: [-36, -104] }),
    hurtGuard: P({ lean: 2, hF: [32, -94], hB: [18, -106] }),

    dizzy: P({ lean: -6, tilt: 14, hF: [26, -70], hB: [6, -72] }),

    koAir: P({ hip: [0, -66], lean: -10, tilt: -25, fF: [26, -10], fB: [4, -18], hF: [34, -140], hB: [-12, -150] }),
    koLying: P({ hip: [0, -64], lean: 0, tilt: -10, fF: [10, 0], fB: [-4, -2], hF: [12, -168], hB: [-8, -162] }),

    win: P({ hip: [0, -66], lean: 0, fF: [20, 0], fB: [-22, 0], hF: [12, -186], hB: [-18, -72] })
  };

  // Idle: 4-frame stepped bob (0,1,2,1), held 9 ticks per frame
  function idlePose(time, slow) {
    const step = [0, 1, 2, 1][Math.floor(time / (slow ? 14 : 9)) % 4] * 2;
    const base = slow ? POSES.dizzy : STANCE;
    return Object.assign({}, base, {
      hip: [base.hip[0], base.hip[1] + step],
      hF: [base.hF[0], base.hF[1] + step],
      hB: [base.hB[0], base.hB[1] + step]
    });
  }

  // Frame tables: [untilTick, pose]. Past the last entry -> idle stance.
  const SEQUENCES = {
    punch_heavy: [[3, 'punchWind'], [5, 'punchExtend'], [26, 'punchActive'], [40, 'hopBack']],
    punch_light: [[3, 'punchWind'], [5, 'punchExtend'], [24, 'punchActive'], [38, 'hopBack']],
    punch: [[3, 'punchWind'], [5, 'punchExtend'], [26, 'punchActive'], [40, 'hopBack']],
    kick: [[3, 'kickChamber'], [26, 'kickActive'], [30, 'kickChamber'], [40, 'hopBack']],
    hadouken: [[4, 'hadoWind'], [30, 'hadoPush'], [40, 'hadoRecover']],
    shoryuken: [[6, 'shoCrouch'], [24, 'shoRise'], [42, 'shoFall'], [48, 'shoCrouch'], [62, 'hopBack']],
    hit: [[18, 'hitRecoil'], [Infinity, 'hurtGuard']],
    knockdown: [[20, 'koAir'], [Infinity, 'koLying']],
    win: [[Infinity, 'win']]
  };

  function poseFor(state, t, time) {
    if (state === 'dizzy') return idlePose(time, true);
    const seq = SEQUENCES[state];
    if (seq) {
      for (const [until, name] of seq) {
        if (t < until) return POSES[name];
      }
    }
    return idlePose(time, false);
  }

  // ---------- Body drawing ----------

  function solve(pose, ch) {
    const hip = { x: pose.hip[0], y: pose.hip[1] };
    const lean = pose.lean * DEG;
    const up = { x: Math.sin(lean), y: -Math.cos(lean) };   // hip -> neck
    const fwd = { x: Math.cos(lean), y: Math.sin(lean) };   // body-forward
    const neck = add(hip, up, 48);
    const shoulder = add(neck, up, -6);

    const legF = ik(hip.x + 3, hip.y, pose.fF[0], pose.fF[1], 36, 36, kneeForward);
    const legB = ik(hip.x - 3, hip.y, pose.fB[0], pose.fB[1], 36, 36, kneeForward);
    const armF = ik(shoulder.x + 2, shoulder.y, pose.hF[0], pose.hF[1], 27, 27, elbowDown);
    const armB = ik(shoulder.x - 2, shoulder.y, pose.hB[0], pose.hB[1], 27, 27, elbowDown);

    return {
      hip, neck, up, fwd, lean,
      shoulderF: { x: shoulder.x + 2, y: shoulder.y }, shoulderB: { x: shoulder.x - 2, y: shoulder.y },
      hipF: { x: hip.x + 3, y: hip.y }, hipB: { x: hip.x - 3, y: hip.y },
      legF, legB, armF, armB,
      head: add(neck, up, 17),
      tilt: (pose.tilt || 0) * DEG
    };
  }

  function drawLeg(ctx, hipPt, leg, ch, pal, dim) {
    const pants = dim ? M(ch.pants.s, ch.pants.s) : ch.pants;
    seg(ctx, hipPt, leg.j, 20, pants, pal);
    seg(ctx, leg.j, leg.e, 16, pants, pal);
    // Foot points perpendicular to the shin (toes forward when standing)
    const sx = leg.e.x - leg.j.x, sy = leg.e.y - leg.j.y;
    const sl = Math.hypot(sx, sy) || 1;
    const footDir = { x: sy / sl, y: -sx / sl };
    const toePt = { x: leg.e.x + footDir.x * 13, y: leg.e.y + footDir.y * 13 };
    const footMat = ch.feet === 'boot' ? M('#2a2a2a', '#0e0e0e') : ch.skin;
    seg(ctx, leg.e, toePt, ch.feet === 'boot' ? 11 : 9, dim ? M(footMat.s, footMat.s) : footMat, pal);
  }

  function drawArm(ctx, shoulderPt, arm, ch, pal, dim, hands) {
    const upperMat = ch.sleeves === 'none' ? ch.skin : ch.top;
    const foreMat = ch.sleeves === 'long' ? ch.top : ch.skin;
    const d = (m) => (dim ? M(m.s, m.s) : m);
    seg(ctx, shoulderPt, arm.j, 14, d(upperMat), pal);
    seg(ctx, arm.j, arm.e, 12, d(foreMat), pal);
    if (ch.sleeves === 'long') {
      // Cuff
      seg(ctx, arm.e, arm.e, 13, d(ch.top), pal);
    }
    const glove = d(ch.glove);
    if (hands === 'palm') {
      const ang = Math.atan2(arm.e.y - arm.j.y, arm.e.x - arm.j.x);
      ctx.save();
      ctx.translate(arm.e.x, arm.e.y);
      ctx.rotate(ang);
      ctx.fillStyle = pal.outline;
      ctx.beginPath(); ctx.ellipse(4, 0, 9.5, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = glove.s;
      ctx.beginPath(); ctx.ellipse(4, 0, 7, 5.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = glove.c;
      ctx.beginPath(); ctx.ellipse(5, -1.5, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else {
      blob(ctx, arm.e.x, arm.e.y, 8, glove, pal);
    }
  }

  function drawTorso(ctx, s, ch, pal, time) {
    const hL = add(s.hip, s.fwd, -ch.hipW), hR = add(s.hip, s.fwd, ch.hipW);
    const nL = add(s.neck, s.fwd, -ch.shW), nR = add(s.neck, s.fwd, ch.shW);
    const shape = [hL, hR, add(nR, s.up, -2), add(s.neck, s.up, 3), add(nL, s.up, -2)];

    ctx.lineJoin = 'round';
    poly(ctx, shape);
    ctx.lineWidth = 5;
    ctx.strokeStyle = pal.outline;
    ctx.stroke();
    ctx.fillStyle = ch.top.s;
    ctx.fill();
    // Lit front 2/3 of the torso
    poly(ctx, [add(hL, s.fwd, 9), hR, add(nR, s.up, -2), add(s.neck, s.up, 3), add(add(nL, s.up, -2), s.fwd, 9)]);
    ctx.fillStyle = ch.top.c;
    ctx.fill();

    ctx.save();
    poly(ctx, shape);
    ctx.clip();
    const style = ch.torsoStyle;
    if (style === 'gi' || style === 'vest') {
      // Open collar showing the chest
      const w = style === 'vest' ? 11 : 7;
      poly(ctx, [add(s.neck, s.fwd, -w + 3), add(s.neck, s.fwd, w + 3), add(add(s.neck, s.up, style === 'vest' ? -40 : -24), s.fwd, 6)]);
      ctx.fillStyle = ch.skin.c;
      ctx.fill();
      ctx.strokeStyle = style === 'vest' ? ch.top.s : '#9e9eb5';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else if (style === 'stripes') {
      ctx.fillStyle = '#1565c0';
      for (let k = 0; k < 4; k++) {
        const c = add(s.hip, s.up, 10 + k * 10);
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(s.lean);
        ctx.fillRect(-30, -2.5, 60, 5);
        ctx.restore();
      }
    } else if (style === 'tang') {
      // Frog-button closures down the front
      ctx.strokeStyle = '#ffd54f';
      ctx.lineWidth = 2.5;
      for (let k = 0; k < 4; k++) {
        const c = add(add(s.hip, s.up, 14 + k * 9), s.fwd, 7);
        line(ctx, add(c, s.fwd, -5), add(c, s.fwd, 5));
      }
    } else if (style === 'sash') {
      ctx.strokeStyle = '#ff1744';
      ctx.lineWidth = 7;
      line(ctx, add(add(s.neck, s.fwd, 16), s.up, -4), add(add(s.hip, s.fwd, -12), s.up, 6));
    }
    ctx.restore();

    // Belt / waist sash with swinging knot tails
    const beltCol = ch.torsoStyle === 'gi' ? '#151515' : (ch.torsoStyle === 'tang' ? '#5d4037' : '#3e2723');
    const bL = add(add(hL, s.fwd, -1), s.up, 4), bR = add(add(hR, s.fwd, 1), s.up, 4);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = pal.outline; ctx.lineWidth = 11; line(ctx, bL, bR);
    ctx.strokeStyle = beltCol; ctx.lineWidth = 7; line(ctx, bL, bR);
    if (ch.torsoStyle === 'gi') {
      const knot = add(add(s.hip, s.fwd, 5), s.up, 4);
      const sw = [0, 2, 0, -2][Math.floor(time / 8) % 4];
      ctx.lineCap = 'round';
      ctx.strokeStyle = pal.outline; ctx.lineWidth = 7;
      line(ctx, knot, { x: knot.x + 6 + sw, y: knot.y + 17 });
      line(ctx, knot, { x: knot.x - 2 + sw, y: knot.y + 19 });
      ctx.strokeStyle = beltCol; ctx.lineWidth = 4;
      line(ctx, knot, { x: knot.x + 6 + sw, y: knot.y + 17 });
      line(ctx, knot, { x: knot.x - 2 + sw, y: knot.y + 19 });
    }
  }

  function drawHead(ctx, s, ch, pal, state, time) {
    const hurt = state === 'hit' || state === 'knockdown' || state === 'dizzy';
    ctx.save();
    ctx.translate(s.head.x, s.head.y);
    ctx.rotate(s.lean + s.tilt);
    const r = 15;

    // Behind-the-head pieces
    if (ch.head === 'player') {
      // Headband tails streaming back (stepped flutter)
      const f = [0, 3, 6, 3][Math.floor(time / 6) % 4];
      ctx.lineCap = 'round';
      ctx.strokeStyle = pal.outline; ctx.lineWidth = 8;
      line(ctx, { x: -12, y: -6 }, { x: -34, y: -2 + f });
      line(ctx, { x: -12, y: -4 }, { x: -30, y: 8 + f * 0.6 });
      ctx.strokeStyle = '#e53935'; ctx.lineWidth = 4.5;
      line(ctx, { x: -12, y: -6 }, { x: -34, y: -2 + f });
      line(ctx, { x: -12, y: -4 }, { x: -30, y: 8 + f * 0.6 });
    } else if (ch.head === 'bandanna') {
      ctx.lineCap = 'round';
      ctx.strokeStyle = pal.outline; ctx.lineWidth = 7;
      line(ctx, { x: -13, y: -8 }, { x: -24, y: 2 });
      ctx.strokeStyle = '#ff1744'; ctx.lineWidth = 4;
      line(ctx, { x: -13, y: -8 }, { x: -24, y: 2 });
    }

    blob(ctx, 0, 0, r, ch.skin, pal);

    // Hair / headgear
    ctx.lineJoin = 'round';
    if (ch.head === 'player') {
      poly(ctx, [
        { x: -15, y: -2 }, { x: -22, y: -12 }, { x: -12, y: -12 }, { x: -10, y: -24 },
        { x: -1, y: -16 }, { x: 6, y: -25 }, { x: 9, y: -14 }, { x: 18, y: -13 }, { x: 13, y: -6 }
      ]);
      ctx.fillStyle = '#1e1a26'; ctx.strokeStyle = pal.outline; ctx.lineWidth = 3;
      ctx.stroke(); ctx.fill();
      ctx.lineCap = 'butt';
      ctx.strokeStyle = pal.outline; ctx.lineWidth = 8;
      line(ctx, { x: -14, y: -7 }, { x: 15, y: -8 });
      ctx.strokeStyle = '#e53935'; ctx.lineWidth = 5;
      line(ctx, { x: -14, y: -7 }, { x: 15, y: -8 });
    } else if (ch.head === 'bandanna') {
      ctx.beginPath(); ctx.arc(0, -1, r + 1, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath();
      ctx.fillStyle = '#ff1744'; ctx.strokeStyle = pal.outline; ctx.lineWidth = 3;
      ctx.stroke(); ctx.fill();
      // White polka dots
      ctx.fillStyle = '#fff';
      [[-6, -9], [3, -12], [9, -6]].forEach(([x, y]) => { ctx.fillRect(x, y, 2.5, 2.5); });
    } else if (ch.head === 'elder') {
      // Bald crown with white side hair, long brows & beard
      ctx.fillStyle = '#f5f5f5'; ctx.strokeStyle = pal.outline; ctx.lineWidth = 2.5;
      poly(ctx, [{ x: -15, y: -2 }, { x: -12, y: 6 }, { x: -6, y: 4 }, { x: -9, y: -6 }]);
      ctx.stroke(); ctx.fill();
      poly(ctx, [{ x: 4, y: 7 }, { x: 15, y: 5 }, { x: 10, y: 24 }, { x: 4, y: 34 }, { x: 0, y: 20 }]);
      ctx.stroke(); ctx.fill();
      ctx.fillRect(5, -8, 10, 3);
    } else if (ch.head === 'sailor') {
      ctx.strokeStyle = pal.outline; ctx.lineWidth = 3;
      poly(ctx, [{ x: -15, y: -8 }, { x: 15, y: -8 }, { x: 13, y: -20 }, { x: -13, y: -20 }]);
      ctx.fillStyle = '#ffffff'; ctx.stroke(); ctx.fill();
      ctx.fillStyle = '#0d47a1'; ctx.fillRect(-15, -11, 30, 4);
      poly(ctx, [{ x: 8, y: -9 }, { x: 22, y: -7 }, { x: 15, y: -4 }]);
      ctx.fillStyle = '#111'; ctx.stroke(); ctx.fill();
      // Stubble
      ctx.fillStyle = 'rgba(40, 25, 15, 0.45)';
      ctx.beginPath(); ctx.arc(4, 6, 9, 0, Math.PI); ctx.fill();
    } else if (ch.head === 'demon') {
      poly(ctx, [
        { x: -15, y: -3 }, { x: -26, y: -26 }, { x: -9, y: -14 }, { x: -2, y: -34 },
        { x: 5, y: -15 }, { x: 22, y: -28 }, { x: 15, y: -5 }
      ]);
      ctx.fillStyle = '#ff0055'; ctx.strokeStyle = pal.outline; ctx.lineWidth = 3;
      ctx.stroke(); ctx.fill();
    }

    // Eyes & brow (pixel-ish blocks)
    ctx.fillStyle = ch.head === 'demon' ? '#ff1744' : '#111';
    if (hurt) {
      ctx.fillRect(4, -3, 8, 2.5);
      ctx.fillRect(5, 6, 6, 2);
    } else {
      ctx.fillRect(6, -4, 5, 4);
      ctx.fillStyle = ch.head === 'elder' ? '#f5f5f5' : '#111';
      ctx.fillRect(4, -8, 9, 2);
      ctx.fillStyle = '#5a2a1a';
      ctx.fillRect(7, 7, 6, 2);
    }
    if (ch.head === 'demon' && !hurt) {
      ctx.shadowColor = '#ff1744';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#ff5c8a';
      ctx.fillRect(6, -4, 5, 4);
      ctx.shadowBlur = 0;
    }
    ctx.restore();

    // Gold chain (night market brawler)
    if (ch.head === 'bandanna') {
      ctx.strokeStyle = '#ffd54f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      const c = add(s.neck, s.up, -6);
      ctx.arc(c.x + 4, c.y, 10, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
    }
  }

  function drawAura(ctx, time) {
    // Stepped purple flame aura for the final boss
    const frame = Math.floor(time / 4) % 3;
    ctx.save();
    for (let a = 0; a < 7; a++) {
      const ax = Math.sin(a * 2.3 + frame) * 34;
      const ay = -20 - ((a * 23 + frame * 11) % 130);
      const g = ctx.createRadialGradient(ax, ay, 3, ax, ay, 26);
      g.addColorStop(0, 'rgba(234, 128, 252, 0.9)');
      g.addColorStop(0.5, 'rgba(124, 77, 255, 0.45)');
      g.addColorStop(1, 'rgba(124, 77, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(ax, ay, 26, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawFX(ctx, s, state, t, time) {
    if (state === 'hadouken' && t >= 4 && t < 30) {
      const c = { x: (s.armF.e.x + s.armB.e.x) / 2 + 8, y: (s.armF.e.y + s.armB.e.y) / 2 };
      const r = [26, 32, 29][Math.floor(time / 3) % 3];
      const g = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.45, '#80deea');
      g.addColorStop(1, 'rgba(0, 229, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
    }
    if (state === 'shoryuken' && t >= 6 && t < 24) {
      // Stepped flame licks along the rising arm
      const fr = Math.floor(time / 3) % 2;
      for (let k = 0; k < 5; k++) {
        const u = k / 4;
        const px = s.armF.j.x + (s.armF.e.x - s.armF.j.x) * u + (k % 2 ? 7 : -7) * (fr ? 1 : -1);
        const py = s.armF.j.y + (s.armF.e.y - s.armF.j.y) * u + 6;
        ctx.fillStyle = k % 2 ? '#ffea00' : '#ff3d00';
        ctx.beginPath();
        ctx.moveTo(px - 8, py + 8);
        ctx.lineTo(px, py - 16);
        ctx.lineTo(px + 8, py + 8);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawDizzyStars(ctx, s, time) {
    const frame = Math.floor(time / 6) % 6;
    for (let k = 0; k < 3; k++) {
      const ang = (frame / 6 + k / 3) * Math.PI * 2;
      const x = s.head.x + Math.cos(ang) * 26;
      const y = s.head.y - 26 + Math.sin(ang) * 7;
      ctx.fillStyle = '#ffd700';
      ctx.strokeStyle = '#3e2723';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let p = 0; p < 10; p++) {
        const rr = p % 2 ? 2.5 : 6.5;
        const aa = p * Math.PI / 5 - Math.PI / 2;
        ctx.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
    }
  }

  function drawRig(ctx, ch, state, t, time) {
    const flash = state === 'hit' && t < 10 && Math.floor(t / 2) % 2 === 0;
    const c = flash ? flashPalette(ch) : ch;
    const pal = { outline: flash ? '#ff6d00' : '#160b08' };
    const pose = poseFor(state, t, time);

    ctx.save();
    ctx.scale(ch.build, ch.build);
    if (ch.aura) drawAura(ctx, time);

    const s = solve(pose, ch);
    drawArm(ctx, s.shoulderB, s.armB, c, pal, true, pose.hands);
    drawLeg(ctx, s.hipB, s.legB, c, pal, true);
    drawLeg(ctx, s.hipF, s.legF, c, pal, false);
    drawTorso(ctx, s, c, pal, time);
    drawHead(ctx, s, c, pal, state, time);
    drawFX(ctx, s, state, t, time);
    drawArm(ctx, s.shoulderF, s.armF, c, pal, false, pose.hands);
    if (state === 'dizzy') drawDizzyStars(ctx, s, time);
    ctx.restore();
  }

  // ---------- Hook into ArcadeRenderer ----------

  Object.assign(ArcadeRenderer.prototype, {
    drawPlayer(ctx, p) {
      drawRig(ctx, CHARACTERS.player, p.state, p.animT || 0, this.time);
    },
    drawEnemy(ctx, e) {
      const ch = CHARACTERS.enemies[this.currentStage % CHARACTERS.enemies.length];
      drawRig(ctx, ch, e.state, e.animT || 0, this.time);
    }
  });
})();
