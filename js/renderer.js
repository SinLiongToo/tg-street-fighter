/**
 * TAIGI FIGHTER 700 - Enhanced Arcade Canvas Renderer
 * High-fidelity 60FPS retro fighting game visual engine.
 * Features:
 * - Multi-layer parallax Taiwanese stages (Night Market, Temple, Harbor, Dadaocheng)
 * - Richly animated fighters with detailed anatomy, cloth physics & aura FX
 * - Authentic Capcom-style hit sparks, shockwaves, fireballs & lightning
 * - Ground reflections, volumetric smoke, and dynamic lighting
 */
class ArcadeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;

    // Camera & Screen Shake
    this.shake = 0;
    this.shakeDecay = 0.88;
    this.time = 0;

    // Visual particles, projectiles, floating texts & ambient props
    this.particles = [];
    this.projectiles = [];
    this.floatingTexts = [];
    this.lightningFlash = 0;

    // Banner overlay animation state
    this.banner = null;

    // CRT scanline overlay state
    this.crtEnabled = true;

    // Pixel-art mode: world rendered at half resolution, upscaled crisp
    this.pixelMode = true;
    this.pixelScale = 0.5;
    this.lowCanvas = null;
    this.lowCtx = null;

    // Hit-stop (freeze frames on impact) & per-fighter pose animation state
    this.hitstop = 0;
    this.fighterRefs = null;
    this.anims = {
      player: this.createAnimState(),
      enemy: this.createAnimState()
    };
    this.reducedMotion = !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    // Current stage
    this.currentStage = 0;
    this.stages = [
      { name: '夜市擂台・大東夜市', theme: 'night_market' },
      { name: '廟口廣場・鎮瀾宮前', theme: 'temple' },
      { name: '港都碼頭・旗津夕陽', theme: 'harbor' },
      { name: '大稻埕天台・終極決戰', theme: 'dadaocheng' }
    ];

    // Pre-calculated ambient stars & clouds
    this.stars = [];
    for (let i = 0; i < 40; i++) {
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * 220,
        size: Math.random() * 2 + 1,
        blinkSpeed: Math.random() * 0.05 + 0.02,
        phase: Math.random() * Math.PI * 2
      });
    }

    // Floating embers / leaves
    this.embers = [];
    for (let i = 0; i < 25; i++) {
      this.embers.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: -(Math.random() * 1.5 + 0.8),
        vy: Math.random() * 0.8 - 0.4,
        size: Math.random() * 3 + 1.5,
        alpha: Math.random() * 0.7 + 0.3
      });
    }
  }

  setStage(stageIndex) {
    this.currentStage = stageIndex % this.stages.length;
    this.projectiles = [];
    this.particles = [];
  }

  triggerShake(intensity = 16) {
    this.shake = this.reducedMotion ? intensity * 0.3 : intensity;
  }

  // --- Fighter Pose Animation Engine ---
  // Game logic only flips `fighter.state`; this layer turns those discrete
  // states into motion: wind-up, lunge, recoil, knockback, jumps, falls,
  // and smooth blending back to idle.

  createAnimState() {
    return { state: null, t: 0, dx: 0, dy: 0, rot: 0, ghosts: [] };
  }

  // Root motion for each state (the body pose itself comes from the
  // limited-frame rig in js/fighters.js). Attacks dash in to make contact,
  // then hop back to their starting spot.
  poseTarget(state, t) {
    const clamp01 = v => Math.max(0, Math.min(1, v));
    const easeOut = v => 1 - Math.pow(1 - clamp01(v), 3);
    const easeIn = v => Math.pow(clamp01(v), 2);
    const p = { dx: 0, dy: 0, rot: 0, snap: true, ghost: false };

    // Shared dash-in / hold / hop-back curve
    const dashAttack = (reach, windup, hitEnd, backEnd) => {
      if (t < windup) {
        p.dx = -6;
      } else if (t < hitEnd) {
        p.dx = -6 + (reach + 6) * easeOut((t - windup) / 5);
        p.ghost = t < windup + 8;
      } else if (t < backEnd) {
        const u = (t - hitEnd) / (backEnd - hitEnd);
        p.dx = reach * (1 - easeOut(u));
        p.dy = -22 * Math.sin(Math.PI * u);
      }
    };

    switch (state) {
      case 'punch_light':
      case 'punch_heavy':
      case 'punch':
        dashAttack(180, 3, 26, 40);
        break;
      case 'kick':
        dashAttack(165, 3, 26, 40);
        break;
      case 'hadouken': {
        // Brace and slide back from the blast
        p.dx = t < 4 ? 0 : -16 * easeOut((t - 4) / 8);
        p.ghost = t >= 4 && t < 12;
        break;
      }
      case 'shoryuken': {
        const reach = 220;
        if (t < 6) {
          p.dx = reach * easeOut(t / 6);           // low dash in
          p.ghost = true;
        } else if (t < 42) {
          const u = (t - 6) / 36;
          p.dx = reach + 16 * u;
          p.dy = -150 * Math.sin(Math.PI * u);     // rising uppercut arc
          p.ghost = u < 0.45;
        } else if (t < 48) {
          p.dx = reach + 16;                       // landing crouch
        } else if (t < 62) {
          const u = (t - 48) / 14;
          p.dx = (reach + 16) * (1 - easeOut(u));
          p.dy = -22 * Math.sin(Math.PI * u);
        }
        break;
      }
      case 'hit':
        p.dx = -34 * easeOut(t / 10);
        p.snap = t < 12;
        break;
      case 'dizzy':
        // Stepped wobble, like a 4-frame sprite loop
        p.rot = [-0.06, 0, 0.06, 0][Math.floor(this.time / 14) % 4];
        p.dx = [-4, 0, 4, 0][Math.floor(this.time / 14) % 4];
        break;
      case 'knockdown': {
        const fall = 20, bounce = 10;
        if (t < fall) {
          // Launched backward, spinning toward the floor
          const u = t / fall;
          p.dx = -90 * easeOut(u);
          p.dy = -60 * Math.sin(Math.PI * u);
          p.rot = -Math.PI / 2 * easeIn(u);
        } else if (t < fall + bounce) {
          const u = (t - fall) / bounce;
          p.dx = -90 - 12 * u;
          p.dy = -26 - 16 * Math.sin(Math.PI * u);
          p.rot = -Math.PI / 2;
        } else {
          p.dx = -102;
          p.dy = -26;
          p.rot = -Math.PI / 2;
        }
        break;
      }
      case 'win':
        // Victory hop
        p.dy = t < 24 ? -50 * Math.sin(Math.PI * t / 24) : 0;
        break;
      default:
        p.snap = false;
        break;
    }
    return p;
  }

  stepFighterAnim(key, fighter, dir) {
    const a = this.anims[key];
    if (a.state !== fighter.state) {
      a.state = fighter.state;
      a.t = 0;
    } else {
      a.t++;
    }

    const tgt = this.poseTarget(a.state, a.t);
    // Scripted states follow their curves exactly; idle eases home
    // (e.g. getting back up after a knockdown).
    const k = tgt.snap ? 1 : 0.22;
    a.dx += (tgt.dx - a.dx) * k;
    a.dy += (tgt.dy - a.dy) * k;
    a.rot += (tgt.rot - a.rot) * k;

    // Afterimage trail (stores the sprite frame, not just the position)
    if (tgt.ghost && !this.reducedMotion) {
      if (a.t % 2 === 0) {
        a.ghosts.unshift({ dx: a.dx, dy: a.dy, rot: a.rot, state: a.state, t: a.t });
        if (a.ghosts.length > 4) a.ghosts.pop();
      }
    } else if (a.ghosts.length && a.t % 2 === 0) {
      a.ghosts.pop();
    }

    // Impact events: dust & thud when a fighter touches down
    const worldX = fighter.x + a.dx * dir;
    if (a.state === 'knockdown' && a.t === 20) {
      this.addDust(worldX - 40 * dir, 462);
      this.addDust(worldX - 90 * dir, 462);
      this.triggerShake(8);
    } else if (a.state === 'shoryuken' && (a.t === 1 || a.t === 42)) {
      this.addDust(worldX, 462);
    } else if (a.state === 'win' && a.t === 24) {
      this.addDust(worldX, 462);
    } else if ((a.state === 'punch_heavy' || a.state === 'punch' || a.state === 'kick') && a.t === 3) {
      this.addDust(worldX - 10 * dir, 462);
    }
  }

  applyPose(ctx, pose, dir) {
    ctx.translate(pose.dx * dir, pose.dy);
    if (dir < 0) ctx.scale(-1, 1);
    ctx.rotate(pose.rot);
  }

  drawFighter(ctx, fighter, key, dir, drawFn) {
    const a = this.anims[key];
    const view = Object.assign({}, fighter);

    // Afterimages (oldest first, faintest)
    for (let i = a.ghosts.length - 1; i >= 0; i--) {
      const g = a.ghosts[i];
      ctx.save();
      ctx.globalAlpha = 0.3 * (1 - i / 4);
      ctx.translate(fighter.x, fighter.y);
      this.applyPose(ctx, g, dir);
      view.state = g.state;
      view.animT = g.t;
      drawFn.call(this, ctx, view);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(fighter.x, fighter.y);
    // Impact jitter while frozen in hit-stop
    if (a.state === 'hit' && this.hitstop > 0) {
      ctx.translate((Math.random() - 0.5) * 8, 0);
    }
    this.applyPose(ctx, a, dir);
    view.state = a.state || fighter.state;
    view.animT = a.t;
    drawFn.call(this, ctx, view);
    ctx.restore();
  }

  showBanner(text, subtext = '', color = '#ffdf00', duration = 90) {
    this.banner = {
      text,
      subtext,
      color,
      scale: 3.0,
      alpha: 1,
      timer: 0,
      maxTime: duration
    };
  }

  addHitSpark(x, y, isHeavy = false) {
    const count = isHeavy ? 24 : 14;
    // Freeze-frame on impact sells the weight of the hit
    this.hitstop = Math.max(this.hitstop, isHeavy ? 6 : 4);
    // Arcade-style starburst impact flash (stepped frames)
    this.particles.push({
      type: 'impact',
      x,
      y,
      vx: 0,
      vy: 0,
      size: isHeavy ? 72 : 50,
      angle: Math.random() * Math.PI,
      alpha: 1,
      decay: isHeavy ? 0.1 : 0.14
    });
    // Shockwave ring
    this.particles.push({
      type: 'shockwave',
      x,
      y,
      radius: 10,
      maxRadius: isHeavy ? 80 : 50,
      color: isHeavy ? '#ff3b30' : '#ffea00',
      alpha: 1,
      decay: 0.08
    });

    // Starburst spark particles
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (Math.random() * 8 + 4) * (isHeavy ? 1.6 : 1.1);
      this.particles.push({
        type: 'spark',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 7 + 3,
        color: ['#ffffff', '#fff566', '#ff4d4f', '#ff9800', '#00e5ff'][Math.floor(Math.random() * 5)],
        alpha: 1,
        decay: Math.random() * 0.06 + 0.04
      });
    }
  }

  addDust(x, y) {
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        type: 'dust',
        x: x + (Math.random() * 30 - 15),
        y: y + Math.random() * 4,
        vx: (Math.random() - 0.5) * 3,
        vy: -Math.random() * 2 - 0.5,
        size: Math.random() * 6 + 4,
        color: '#c4b5a5',
        alpha: 0.8,
        decay: 0.045
      });
    }
  }

  addFireball(fromX, fromY, toX, isPlayer = true, isSuper = false) {
    const dir = isPlayer ? 1 : -1;
    this.projectiles.push({
      x: fromX,
      y: fromY,
      targetX: toX,
      vx: dir * (isSuper ? 22 : 14),
      isPlayer,
      isSuper,
      radius: isSuper ? 36 : 22,
      color: isSuper ? '#00e5ff' : (isPlayer ? '#00d2ff' : '#ff5722'),
      timer: 0
    });
  }

  addFloatingText(text, x, y, color = '#ffea00') {
    this.floatingTexts.push({
      text,
      x,
      y,
      vy: -3.4,
      alpha: 1,
      color,
      decay: 0.02,
      age: 0
    });
  }

  // --- Main Update Loop ---

  update() {
    // Shake decay
    if (this.shake > 0.1) {
      this.shake *= this.shakeDecay;
    } else {
      this.shake = 0;
    }

    // Hit-stop: the whole scene holds for a few frames on impact
    if (this.hitstop > 0) {
      this.hitstop--;
      return;
    }

    this.time++;

    if (this.fighterRefs) {
      this.stepFighterAnim('player', this.fighterRefs.player, 1);
      this.stepFighterAnim('enemy', this.fighterRefs.enemy, -1);
    }

    // Lightning flash timer decay
    if (this.lightningFlash > 0) {
      this.lightningFlash--;
    } else if (this.currentStage === 3 && Math.random() < 0.008) {
      this.lightningFlash = Math.floor(Math.random() * 5 + 3);
    }

    // Update ambient embers
    for (let e of this.embers) {
      e.x += e.vx;
      e.y += e.vy;
      if (e.x < -10) e.x = this.width + 10;
      if (e.y < 0 || e.y > this.height) e.y = Math.random() * this.height;
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (p.type === 'shockwave') {
        p.radius += (p.maxRadius - p.radius) * 0.25;
        p.alpha -= p.decay;
      } else {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;
      }
      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Update projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.x += proj.vx;
      proj.timer++;

      // Swirling plasma trail particles
      for (let t = 0; t < (proj.isSuper ? 3 : 1); t++) {
        this.particles.push({
          type: 'spark',
          x: proj.x - proj.vx * 0.4 + (Math.random() * 16 - 8),
          y: proj.y + (Math.random() * 20 - 10),
          vx: -proj.vx * 0.15,
          vy: (Math.random() - 0.5) * 3,
          size: proj.radius * (Math.random() * 0.4 + 0.2),
          color: proj.color,
          alpha: 0.9,
          decay: 0.08
        });
      }

      // Hit target check
      if ((proj.isPlayer && proj.x >= proj.targetX) || (!proj.isPlayer && proj.x <= proj.targetX)) {
        this.addHitSpark(proj.x, proj.y, proj.isSuper);
        this.triggerShake(proj.isSuper ? 25 : 14);
        this.projectiles.splice(i, 1);
      }
    }

    // Update floating texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.age++;
      ft.y += ft.vy;
      ft.vy *= 0.95;
      if (ft.age > 25) ft.alpha -= ft.decay * 1.6;
      if (ft.alpha <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // Update banner
    if (this.banner) {
      this.banner.timer++;
      if (this.banner.timer < 16) {
        // Slam in with a slight overshoot (easeOutBack)
        const u = this.banner.timer / 16;
        const c1 = 1.70158, c3 = c1 + 1;
        const eob = 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
        this.banner.scale = 3.0 - 2.0 * eob;
      } else {
        this.banner.scale = 1.0;
      }
      if (this.banner.timer > this.banner.maxTime - 20) {
        this.banner.alpha = (this.banner.maxTime - this.banner.timer) / 20;
      }
      if (this.banner.timer >= this.banner.maxTime) {
        this.banner = null;
      }
    }
  }

  // --- Main Render Pipeline ---

  render(player, enemy, gameState) {
    const main = this.ctx;
    this.fighterRefs = { player, enemy };
    const pa = this.anims.player, ea = this.anims.enemy;

    // Pixel mode: draw the world into a half-resolution buffer, then blow it
    // up with nearest-neighbour scaling for chunky arcade pixels. Text and
    // banners are drawn afterwards at full resolution so they stay legible.
    const pixel = this.pixelMode && this.ensureLowRes();
    const ctx = pixel ? this.lowCtx : main;
    ctx.save();
    if (pixel) {
      ctx.setTransform(this.pixelScale, 0, 0, this.pixelScale, 0, 0);
    }

    // 1. Screen Shake
    const shakeX = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const shakeY = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    ctx.translate(shakeX, shakeY);

    // 2. Draw Stage Background with Parallax
    this.drawStage(ctx);

    // 3. Draw Ambient Embers / Cherry Petals
    this.drawEmbers(ctx);

    // 4. Draw Floor Dynamic Shadows
    this.drawFloorShadow(ctx, player.x + pa.dx, 462, 55, pa, 1);
    this.drawFloorShadow(ctx, enemy.x - ea.dx, 462, 60, ea, -1);

    // 5. Draw Projectiles Floor Illumination (glow on ground as fireball travels)
    this.drawProjectilesGroundGlow(ctx);

    // 6. Draw Fighters (the one currently attacking is drawn on top)
    const enemyFirst = player.state !== 'idle' && enemy.state !== 'punch';
    if (enemyFirst) this.drawFighter(ctx, enemy, 'enemy', -1, this.drawEnemy);
    this.drawFighter(ctx, player, 'player', 1, this.drawPlayer);
    if (!enemyFirst) this.drawFighter(ctx, enemy, 'enemy', -1, this.drawEnemy);

    // 7. Draw Projectiles & Plasma Energy
    this.drawProjectiles(ctx);

    // 8. Draw Particles & Shockwaves
    this.drawParticles(ctx);

    ctx.restore();

    if (pixel) {
      main.save();
      main.setTransform(1, 0, 0, 1, 0, 0);
      main.imageSmoothingEnabled = false;
      main.drawImage(this.lowCanvas, 0, 0, this.width, this.height);
      main.restore();
    }

    main.save();
    main.translate(shakeX, shakeY);

    // 9. Draw Floating Hit Texts
    this.drawFloatingTexts(main);

    // 10. Draw Banner Overlay (ROUND 1, FIGHT, KO)
    if (this.banner) {
      this.drawBanner(main);
    }

    main.restore();

    // 11. CRT Scanlines & Glass Vignette
    if (this.crtEnabled) {
      this.drawScanlines(main);
    }
  }

  // Lazily create the half-resolution buffer used by pixel mode
  ensureLowRes() {
    if (!this.lowCanvas) {
      try {
        this.lowCanvas = document.createElement('canvas');
        this.lowCanvas.width = Math.round(this.width * this.pixelScale);
        this.lowCanvas.height = Math.round(this.height * this.pixelScale);
        this.lowCtx = this.lowCanvas.getContext('2d');
      } catch (err) {
        this.lowCtx = null;
      }
    }
    return !!this.lowCtx;
  }

  // --- Dispatch Stage Renderer ---
  drawStage(ctx) {
    const stage = this.stages[this.currentStage] || this.stages[0];
    switch (stage.theme) {
      case 'night_market':
        this.drawNightMarket(ctx);
        break;
      case 'temple':
        this.drawTempleStage(ctx);
        break;
      case 'harbor':
        this.drawHarborStage(ctx);
        break;
      case 'dadaocheng':
        this.drawDadaochengStage(ctx);
        break;
      default:
        this.drawNightMarket(ctx);
    }
  }

  // --- Stage 1: Night Market (大東夜市) ---
  drawNightMarket(ctx) {
    // 1. Midnight Sky with purple-indigo gradient
    const sky = ctx.createLinearGradient(0, 0, 0, 360);
    sky.addColorStop(0, '#0a061c');
    sky.addColorStop(0.5, '#190e38');
    sky.addColorStop(1, '#2c1654');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.width, 360);

    // Twinkling stars
    ctx.fillStyle = '#fff';
    for (let s of this.stars) {
      const blink = Math.sin(this.time * s.blinkSpeed + s.phase) * 0.5 + 0.5;
      ctx.globalAlpha = blink;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Distant City Skyline Silhouettes
    ctx.fillStyle = '#110926';
    ctx.beginPath();
    ctx.moveTo(0, 260);
    ctx.lineTo(80, 260); ctx.lineTo(80, 220); ctx.lineTo(130, 220); ctx.lineTo(130, 250);
    ctx.lineTo(220, 250); ctx.lineTo(220, 190); ctx.lineTo(270, 190); ctx.lineTo(270, 260);
    ctx.lineTo(400, 260); ctx.lineTo(400, 210); ctx.lineTo(450, 210); ctx.lineTo(450, 260);
    ctx.lineTo(600, 260); ctx.lineTo(600, 180); ctx.lineTo(660, 180); ctx.lineTo(660, 260);
    ctx.lineTo(780, 260); ctx.lineTo(780, 230); ctx.lineTo(840, 230); ctx.lineTo(840, 260);
    ctx.lineTo(this.width, 260);
    ctx.lineTo(this.width, 380);
    ctx.lineTo(0, 380);
    ctx.fill();

    // Food Stall Rooftops with striped canvas
    for (let x = 0; x < this.width; x += 160) {
      ctx.fillStyle = (x % 320 === 0) ? '#d32f2f' : '#f57c00';
      ctx.beginPath();
      ctx.moveTo(x - 20, 250);
      ctx.lineTo(x + 80, 180);
      ctx.lineTo(x + 180, 250);
      ctx.closePath();
      ctx.fill();
      // Stall shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x, 250, 140, 130);
    }

    // Swaying Glowing Lanterns & String Lights
    const lanternCount = 7;
    for (let i = 0; i < lanternCount; i++) {
      const lx = 80 + i * 135;
      const sway = Math.sin(this.time * 0.04 + i * 1.2) * 8;
      // Cord
      ctx.strokeStyle = '#5d4037';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lx, 50);
      ctx.lineTo(lx + sway, 130);
      ctx.stroke();

      // Glowing Lantern
      ctx.save();
      ctx.translate(lx + sway, 130);
      // Outer glow
      const lGlow = ctx.createRadialGradient(0, 0, 8, 0, 0, 40);
      lGlow.addColorStop(0, 'rgba(255, 61, 0, 0.8)');
      lGlow.addColorStop(0.5, 'rgba(255, 145, 0, 0.3)');
      lGlow.addColorStop(1, 'rgba(255, 61, 0, 0)');
      ctx.fillStyle = lGlow;
      ctx.beginPath();
      ctx.arc(0, 0, 40, 0, Math.PI * 2);
      ctx.fill();

      // Lantern Body
      ctx.fillStyle = '#d32f2f';
      ctx.beginPath();
      ctx.ellipse(0, 0, 18, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      // Gold rims
      ctx.strokeStyle = '#ffeb3b';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Gold Calligraphy character
      ctx.fillStyle = '#ffea00';
      ctx.font = 'bold 13px serif';
      ctx.textAlign = 'center';
      ctx.fillText(['福', '吉', '春', '滿', '順', '讚', '旺'][i % 7], 0, 5);
      // Tassel
      ctx.strokeStyle = '#ff3d00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 26);
      ctx.lineTo(sway * 0.5, 48);
      ctx.stroke();
      ctx.restore();
    }

    // High-tech Neon Signs with pulsing glow
    const neonSigns = [
      { text: '蚵仔煎', x: 130, y: 220, color: '#00e5ff', glow: '#00b0ff' },
      { text: '珍珠奶茶', x: 340, y: 205, color: '#ffea00', glow: '#ffd600' },
      { text: '大腸包小腸', x: 590, y: 215, color: '#ff2d55', glow: '#ff1744' },
      { text: '鹹酥雞', x: 830, y: 210, color: '#69f0ae', glow: '#00e676' }
    ];

    neonSigns.forEach(s => {
      ctx.save();
      const flicker = (Math.sin(this.time * 0.08 + s.x) > -0.85) ? 1 : 0.3;
      ctx.globalAlpha = flicker;
      ctx.font = '900 22px "Noto Sans TC", sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = s.glow;
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(s.text, s.x, s.y);
      ctx.lineWidth = 2;
      ctx.strokeStyle = s.color;
      ctx.strokeText(s.text, s.x, s.y);
      ctx.restore();
    });

    // Food Stall Steam wafting up
    for (let st = 0; st < 4; st++) {
      const stX = 180 + st * 230;
      const stY = 320 - ((this.time * 1.5 + st * 45) % 90);
      const stAlpha = 1 - ((this.time * 1.5 + st * 45) % 90) / 90;
      ctx.fillStyle = `rgba(255, 255, 255, ${stAlpha * 0.18})`;
      ctx.beginPath();
      ctx.arc(stX + Math.sin(this.time * 0.05 + st) * 15, stY, 20 + st * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Audience silhouettes cheering
    ctx.fillStyle = '#140c26';
    for (let c = 30; c < this.width; c += 42) {
      const bob = Math.sin(this.time * 0.12 + c * 0.8) * 5;
      ctx.beginPath();
      ctx.arc(c, 345 + bob, 11, 0, Math.PI * 2);
      ctx.rect(c - 13, 356 + bob, 26, 40);
      ctx.fill();
      // Occasionally waving cheering pennant
      if (c % 126 === 30) {
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(c + 8, 350 + bob);
        ctx.lineTo(c + 20, 320 + bob);
        ctx.stroke();
        ctx.fillStyle = '#ff3d00';
        ctx.fillRect(c + 20, 315 + bob, 18, 12);
      }
    }

    // Reflective Wet Stone Floor with Neon Puddle Reflections
    const floor = ctx.createLinearGradient(0, 380, 0, this.height);
    floor.addColorStop(0, '#2c1b42');
    floor.addColorStop(0.2, '#1e102f');
    floor.addColorStop(1, '#0e0618');
    ctx.fillStyle = floor;
    ctx.fillRect(0, 380, this.width, this.height - 380);

    // Neon puddles on floor
    neonSigns.forEach(s => {
      ctx.save();
      const pGrad = ctx.createRadialGradient(s.x, 430, 5, s.x, 430, 70);
      pGrad.addColorStop(0, s.glow.replace(')', ', 0.35)').replace('rgb', 'rgba'));
      pGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.ellipse(s.x, 430, 65, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Floor stone perspective lines
    ctx.strokeStyle = 'rgba(255, 220, 255, 0.08)';
    ctx.lineWidth = 2;
    for (let x = -200; x < this.width + 200; x += 110) {
      ctx.beginPath();
      ctx.moveTo(x, 380);
      ctx.lineTo(x * 1.6 - 280, this.height);
      ctx.stroke();
    }
  }

  // --- Stage 2: Temple Plaza (大甲鎮瀾宮) ---
  drawTempleStage(ctx) {
    // Sunset orange-magenta sacred sky
    const sky = ctx.createLinearGradient(0, 0, 0, 380);
    sky.addColorStop(0, '#2b0938');
    sky.addColorStop(0.4, '#7a1945');
    sky.addColorStop(0.75, '#c93b3b');
    sky.addColorStop(1, '#ff9800');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.width, 380);

    // Intricate Temple Swallowtail Eaves (燕尾脊) & Coiling Ceramic Dragons
    ctx.fillStyle = '#22081f';
    ctx.beginPath();
    ctx.moveTo(0, 160);
    ctx.quadraticCurveTo(this.width * 0.25, 90, this.width * 0.5, 130);
    ctx.quadraticCurveTo(this.width * 0.75, 90, this.width, 160);
    ctx.lineTo(this.width, 380);
    ctx.lineTo(0, 380);
    ctx.fill();

    // Golden Dragon Crest on Roof Ridge
    ctx.save();
    ctx.fillStyle = '#ffca28';
    ctx.shadowColor = '#ff6f00';
    ctx.shadowBlur = 15;
    // Left Dragon
    ctx.beginPath();
    ctx.moveTo(this.width * 0.22, 105);
    ctx.lineTo(this.width * 0.26, 85);
    ctx.lineTo(this.width * 0.28, 108);
    ctx.fill();
    // Right Dragon
    ctx.beginPath();
    ctx.moveTo(this.width * 0.78, 105);
    ctx.lineTo(this.width * 0.74, 85);
    ctx.lineTo(this.width * 0.72, 108);
    ctx.fill();
    // Central Flaming Pearl (火珠)
    ctx.fillStyle = '#ff1744';
    ctx.beginPath();
    ctx.arc(this.width * 0.5, 115, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Red Lacquered Pillars with Golden Dragon Spiral
    [80, 220, this.width - 240, this.width - 100].forEach((px, idx) => {
      ctx.fillStyle = '#8b0000';
      ctx.fillRect(px, 160, 32, 220);
      // Gold coiling dragon stripe
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 3;
      for (let y = 175; y < 380; y += 30) {
        ctx.beginPath();
        ctx.moveTo(px, y);
        ctx.lineTo(px + 32, y + 15);
        ctx.stroke();
      }
    });

    // Volumetric Billowing Incense Smoke
    for (let i = 0; i < 8; i++) {
      const sy = 330 - ((this.time * 1.8 + i * 35) % 180);
      const sx = this.width / 2 + Math.sin(this.time * 0.04 + i * 1.2) * 38;
      const sAlpha = 1 - ((this.time * 1.8 + i * 35) % 180) / 180;
      ctx.fillStyle = `rgba(255, 248, 225, ${sAlpha * 0.25})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 22 + i * 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Grand Bronze Incense Cauldron (天公爐) in Center Background
    ctx.save();
    ctx.fillStyle = '#3e2723';
    ctx.beginPath();
    ctx.ellipse(this.width / 2, 330, 52, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(this.width / 2 - 46, 330, 92, 45);
    // Gold Inscription
    ctx.fillStyle = '#ffea00';
    ctx.font = 'bold 16px serif';
    ctx.textAlign = 'center';
    ctx.fillText('國泰民安', this.width / 2, 360);
    ctx.restore();

    // Stone Lions on Pedestals
    this.drawStoneLion(ctx, 150, 330, false);
    this.drawStoneLion(ctx, this.width - 170, 330, true);

    // Temple Flagstone Floor
    ctx.fillStyle = '#331d27';
    ctx.fillRect(0, 380, this.width, this.height - 380);
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.14)';
    for (let x = 0; x < this.width; x += 90) {
      ctx.strokeRect(x, 380, 84, 42);
      ctx.strokeRect(x - 45, 422, 84, 48);
      ctx.strokeRect(x, 470, 84, 70);
    }
  }

  drawStoneLion(ctx, x, y, flip) {
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.fillStyle = '#546e7a';
    ctx.fillRect(-22, 0, 44, 48); // Pedestal
    // Lion Body
    ctx.beginPath();
    ctx.arc(0, -18, 20, 0, Math.PI * 2); // Head
    ctx.rect(-16, -10, 32, 25); // Body
    ctx.fill();
    // Mane curls
    ctx.fillStyle = '#37474f';
    ctx.beginPath();
    ctx.arc(-16, -22, 8, 0, Math.PI * 2);
    ctx.arc(0, -30, 9, 0, Math.PI * 2);
    ctx.arc(16, -22, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // --- Stage 3: Harbor Stage (旗津夕陽港) ---
  drawHarborStage(ctx) {
    // Dynamic Multi-Color Sunset
    const sky = ctx.createLinearGradient(0, 0, 0, 300);
    sky.addColorStop(0, '#101538');
    sky.addColorStop(0.3, '#4a154b');
    sky.addColorStop(0.65, '#e03e52');
    sky.addColorStop(0.85, '#ff7a00');
    sky.addColorStop(1, '#ffc72c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.width, 300);

    // Glowing Setting Sun with God Rays
    ctx.save();
    const sunGrad = ctx.createRadialGradient(this.width / 2, 230, 20, this.width / 2, 230, 160);
    sunGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    sunGrad.addColorStop(0.3, 'rgba(255, 235, 59, 0.85)');
    sunGrad.addColorStop(0.7, 'rgba(255, 87, 34, 0.4)');
    sunGrad.addColorStop(1, 'rgba(255, 87, 34, 0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(this.width / 2, 230, 160, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Harbor Cranes Silhouettes
    ctx.strokeStyle = '#1b1c3a';
    ctx.lineWidth = 4;
    [120, 240, 750, 880].forEach(cx => {
      ctx.beginPath();
      ctx.moveTo(cx, 280); ctx.lineTo(cx, 160);
      ctx.lineTo(cx + 60, 130); ctx.lineTo(cx - 30, 140);
      ctx.stroke();
    });

    // Multi-Layer Rolling Ocean Waves
    for (let l = 0; l < 3; l++) {
      const wy = 280 + l * 32;
      const speed = this.time * 0.03 * (l + 1);
      ctx.fillStyle = ['#1a2a4f', '#132140', '#0d172e'][l];
      ctx.beginPath();
      ctx.moveTo(0, wy);
      for (let x = 0; x <= this.width; x += 40) {
        const h = Math.sin(x * 0.03 + speed) * (6 + l * 2);
        ctx.lineTo(x, wy + h);
      }
      ctx.lineTo(this.width, 380);
      ctx.lineTo(0, 380);
      ctx.closePath();
      ctx.fill();
      // Wave Whitecap Foam
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Moored Taiwanese Fishing Vessel with Bunting Flags & Flag
    const shipBob = Math.sin(this.time * 0.04) * 7;
    ctx.save();
    ctx.translate(680, 245 + shipBob);
    // Hull
    ctx.fillStyle = '#263238';
    ctx.beginPath();
    ctx.moveTo(-80, 25);
    ctx.lineTo(95, 25);
    ctx.lineTo(75, 65);
    ctx.lineTo(-60, 65);
    ctx.closePath();
    ctx.fill();
    // Red Keel line
    ctx.fillStyle = '#d32f2f';
    ctx.fillRect(-60, 55, 135, 10);
    // Wheelhouse
    ctx.fillStyle = '#eceff1';
    ctx.fillRect(-20, -10, 48, 35);
    // Windows
    ctx.fillStyle = '#ffeb3b';
    ctx.fillRect(-12, -4, 12, 10);
    ctx.fillRect(4, -4, 12, 10);
    // Mast
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(4, -10);
    ctx.lineTo(4, -60);
    ctx.stroke();
    // Bunting triangular flags
    const bColors = ['#ff1744', '#ffea00', '#00e676', '#00b0ff'];
    for (let f = 0; f < 4; f++) {
      ctx.fillStyle = bColors[f];
      ctx.beginPath();
      ctx.moveTo(-35 + f * 16, -30 + f * 6);
      ctx.lineTo(-20 + f * 16, -25 + f * 6);
      ctx.lineTo(-28 + f * 16, -15 + f * 6);
      ctx.fill();
    }
    // Taiwan Flag at top
    ctx.fillStyle = '#d32f2f';
    ctx.fillRect(6, -60, 24, 15);
    ctx.fillStyle = '#0d47a1';
    ctx.fillRect(6, -60, 12, 8);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(12, -56, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Wooden Pier Deck with Timber Planks & Heavy Bollards
    const deck = ctx.createLinearGradient(0, 380, 0, this.height);
    deck.addColorStop(0, '#4e342e');
    deck.addColorStop(0.5, '#3e2723');
    deck.addColorStop(1, '#241410');
    ctx.fillStyle = deck;
    ctx.fillRect(0, 380, this.width, this.height - 380);

    // Wet timber sheen
    ctx.strokeStyle = '#271202';
    ctx.lineWidth = 3;
    for (let y = 380; y < this.height; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(this.width, y);
      ctx.stroke();
    }
  }

  // --- Stage 4: Dadaocheng Rooftop (大稻埕茶行天台決戰) ---
  drawDadaochengStage(ctx) {
    // Dark Thunderstorm Night Sky
    const sky = ctx.createLinearGradient(0, 0, 0, 380);
    sky.addColorStop(0, '#040510');
    sky.addColorStop(0.6, '#111329');
    sky.addColorStop(1, '#211e42');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.width, 380);

    // Gigantic Majestic Full Moon with Crater Details
    ctx.save();
    const moonX = 720, moonY = 130, moonR = 68;
    // Lunar Bloom
    const mBloom = ctx.createRadialGradient(moonX, moonY, moonR, moonX, moonY, moonR + 90);
    mBloom.addColorStop(0, 'rgba(230, 245, 255, 0.7)');
    mBloom.addColorStop(0.4, 'rgba(128, 216, 255, 0.25)');
    mBloom.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = mBloom;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR + 90, 0, Math.PI * 2);
    ctx.fill();

    // Moon Disc
    ctx.fillStyle = '#fffdf0';
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fill();

    // Lunar Maria / Craters
    ctx.fillStyle = '#e2dfd2';
    ctx.beginPath();
    ctx.arc(moonX - 18, moonY - 12, 22, 0, Math.PI * 2);
    ctx.arc(moonX + 16, moonY + 20, 28, 0, Math.PI * 2);
    ctx.arc(moonX - 10, moonY + 25, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Thunderstorm Sheet Lightning
    if (this.lightningFlash > 0) {
      ctx.fillStyle = `rgba(220, 235, 255, ${0.45 * (this.lightningFlash / 5)})`;
      ctx.fillRect(0, 0, this.width, this.height);
      // Lightning bolt fork
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#80d8ff';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.moveTo(380, 0); ctx.lineTo(360, 90); ctx.lineTo(410, 130); ctx.lineTo(390, 240);
      ctx.stroke();
    }

    // Dadaocheng Baroque Red-Brick Gable Architecture
    ctx.fillStyle = '#5c1919';
    ctx.fillRect(0, 250, this.width, 130);

    // Ornate Pediments & Balusters
    for (let x = 30; x < this.width; x += 110) {
      ctx.fillStyle = '#7a2222';
      ctx.fillRect(x, 220, 75, 40);
      ctx.beginPath();
      ctx.arc(x + 37, 220, 26, Math.PI, 0);
      ctx.fill();
      // Stone Urns
      ctx.fillStyle = '#3e1111';
      ctx.fillRect(x + 28, 185, 18, 12);
    }

    // Rooftop Slate Tile Deck
    const roofFloor = ctx.createLinearGradient(0, 380, 0, this.height);
    roofFloor.addColorStop(0, '#262833');
    roofFloor.addColorStop(0.3, '#1c1d26');
    roofFloor.addColorStop(1, '#0e0f14');
    ctx.fillStyle = roofFloor;
    ctx.fillRect(0, 380, this.width, this.height - 380);

    // Stone Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
    for (let x = 0; x < this.width; x += 65) {
      ctx.strokeRect(x, 380, 60, 32);
      ctx.strokeRect(x - 30, 412, 60, 38);
      ctx.strokeRect(x, 450, 60, 45);
      ctx.strokeRect(x - 30, 495, 60, 50);
    }
  }

  // --- Ambient Embers / Cherry Petals ---
  drawEmbers(ctx) {
    for (let e of this.embers) {
      ctx.save();
      ctx.globalAlpha = e.alpha;
      ctx.fillStyle = (this.currentStage === 3) ? '#ff4081' : (this.currentStage === 0 ? '#ffab00' : '#ff5722');
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // --- Dynamic Floor Shadows ---
  drawFloorShadow(ctx, x, y, radius, pose, dir) {
    ctx.save();
    // Shadow shrinks and fades as the fighter leaves the ground,
    // and stretches out (behind the feet) when lying flat
    const lift = Math.min(1, Math.max(0, -(pose.dy + (Math.abs(pose.rot) > 1 ? 26 : 0)) / 140));
    const flat = Math.min(1, Math.abs(pose.rot) / (Math.PI / 2));
    const r = radius * (1 - 0.6 * lift) * (1 + 0.9 * flat);
    const alpha = 0.5 * (1 - 0.6 * lift);
    x -= 60 * flat * dir;
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, 14 * (1 - 0.4 * lift), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawProjectilesGroundGlow(ctx) {
    this.projectiles.forEach(p => {
      ctx.save();
      const glowGrad = ctx.createRadialGradient(p.x, 460, 5, p.x, 460, 60);
      glowGrad.addColorStop(0, p.color.replace(')', ', 0.4)').replace('rgb', 'rgba'));
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.ellipse(p.x, 460, 60, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // Fighters (drawPlayer / drawEnemy) are drawn by the jointed rig in js/fighters.js

  // --- Projectiles & Special Moves ---
  drawProjectiles(ctx) {
    this.projectiles.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);

      // Multi-layer Glowing Ki Blast
      const kiGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, p.radius);
      kiGrad.addColorStop(0, '#ffffff');
      kiGrad.addColorStop(0.4, p.color);
      kiGrad.addColorStop(0.8, '#0091ea');
      kiGrad.addColorStop(1, 'rgba(0, 145, 234, 0)');
      ctx.fillStyle = kiGrad;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();

      // Swirling Energy Ring
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = p.isSuper ? 4 : 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.radius * 0.9, p.radius * 0.4, this.time * 0.25, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    });
  }

  // --- Particles & Shockwaves ---
  drawParticles(ctx) {
    this.particles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      if (p.type === 'shockwave') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.type === 'impact') {
        // Two-layer jagged star; size steps instead of tweening
        ctx.globalAlpha = 1;
        const scale = p.alpha > 0.7 ? 0.75 : (p.alpha > 0.35 ? 1 : 0.6);
        const star = (r, inner, color, outline) => {
          ctx.beginPath();
          for (let k = 0; k < 16; k++) {
            const rr = (k % 2 ? inner : r) * (k % 4 === 0 ? 1 : 0.78);
            const aa = p.angle + k * Math.PI / 8;
            ctx.lineTo(p.x + Math.cos(aa) * rr, p.y + Math.sin(aa) * rr);
          }
          ctx.closePath();
          if (outline) {
            ctx.lineWidth = 4;
            ctx.strokeStyle = outline;
            ctx.stroke();
          }
          ctx.fillStyle = color;
          ctx.fill();
        };
        star(p.size * scale, p.size * scale * 0.38, '#ffd54f', '#e65100');
        star(p.size * scale * 0.6, p.size * scale * 0.22, '#ffffff', null);
      } else if (p.type === 'spark') {
        // Short streak along the travel direction
        ctx.strokeStyle = p.color;
        ctx.lineCap = 'butt';
        ctx.lineWidth = Math.max(2, p.size * 0.55);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 1.6, p.y - p.vy * 1.6);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  // --- Floating Hit Texts ---
  drawFloatingTexts(ctx) {
    this.floatingTexts.forEach(ft => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.alpha);
      // Pop in big, then settle to normal size
      const pop = ft.age < 8 ? 1.7 - 0.7 * (ft.age / 8) : 1;
      ctx.translate(ft.x, ft.y);
      ctx.scale(pop, pop);
      ctx.translate(-ft.x, -ft.y);
      ctx.font = '900 26px "Noto Sans TC", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#000';
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.shadowColor = ft.color;
      ctx.shadowBlur = 10;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    });
  }

  // --- Capcom Style Beveled Fight Banners ---
  drawBanner(ctx) {
    const b = this.banner;
    ctx.save();
    ctx.translate(this.width / 2, this.height / 2 - 35);
    ctx.scale(b.scale, b.scale);
    ctx.globalAlpha = b.alpha;

    ctx.textAlign = 'center';
    ctx.font = '900 68px "Impact", "Charis SIL", "Noto Sans TC", sans-serif';

    // Heavy Black Drop Shadow
    ctx.fillStyle = '#000000';
    ctx.fillText(b.text, 6, 6);

    // Deep Bevel Stroke
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#6a0a00';
    ctx.strokeText(b.text, 0, 0);

    // Gold/Red Flame Gradient Fill
    const grad = ctx.createLinearGradient(0, -45, 0, 25);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.25, b.color);
    grad.addColorStop(0.7, '#ff6f00');
    grad.addColorStop(1, '#b71c1c');
    ctx.fillStyle = grad;
    ctx.fillText(b.text, 0, 0);

    // Inner bright stroke
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fff9c4';
    ctx.strokeText(b.text, 0, 0);

    if (b.subtext) {
      ctx.font = '700 24px "Noto Sans TC", sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#000';
      ctx.strokeText(b.subtext, 0, 48);
      ctx.fillStyle = '#ffeb3b';
      ctx.fillText(b.subtext, 0, 48);
    }

    ctx.restore();
  }

  // --- CRT Scanlines & Glass Bezel Reflection ---
  drawScanlines(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
    for (let y = 0; y < this.height; y += 4) {
      ctx.fillRect(0, y, this.width, 2);
    }
    // Vignette glass reflection
    const vig = ctx.createRadialGradient(
      this.width / 2, this.height / 2, this.width / 3,
      this.width / 2, this.height / 2, this.width / 1.35
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }
}

window.ArcadeRenderer = ArcadeRenderer;
