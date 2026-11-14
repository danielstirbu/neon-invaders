/* =====================================================================
   NEON INVADERS — synthwave neon space shooter
   HTML5 Canvas + ES6 + Web Audio API (procedural SFX, no assets)
   ===================================================================== */
'use strict';

/* ------------------------------------------------------------------ */
/* Constants & helpers                                                  */
/* ------------------------------------------------------------------ */
const VIEW_W = 960;
const VIEW_H = 600;
const HUD_H = 46;
const TAU = Math.PI * 2;
const HS_KEY = 'neonInvaders.highscore.v1';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dist2 = (x1, y1, x2, y2) => (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);

function loadHigh() {
  try { return parseInt(localStorage.getItem(HS_KEY) || '0', 10) || 0; }
  catch (e) { return 0; }
}
function saveHigh(v) {
  try { localStorage.setItem(HS_KEY, String(v)); } catch (e) { /* storage blocked */ }
}

const POWER_DEFS = {
  shield: { color: '#00f0ff', label: 'S', name: 'SHIELD' },
  triple: { color: '#ffb300', label: 'T', name: 'TRIPLE SHOT' },
  laser:  { color: '#ff2bd6', label: 'L', name: 'LASER BEAM' },
  speed:  { color: '#39ff14', label: 'B', name: 'SPEED BOOST' },
};
const POWER_KEYS = Object.keys(POWER_DEFS);

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */
const Input = {
  keys: new Set(),
  pressed: new Set(),
  init() {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'arrowleft' || k === 'arrowright' || k === 'arrowup' || k === 'arrowdown') {
        e.preventDefault();
      }
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  },
  down(k) { return this.keys.has(k); },
  vpress(k) { if (!this.keys.has(k)) this.pressed.add(k); this.keys.add(k); },
  vrelease(k) { this.keys.delete(k); },
  hit(k) {
    if (this.pressed.has(k)) { this.pressed.delete(k); return true; }
    return false;
  },
  endFrame() { this.pressed.clear(); },
};

/* ------------------------------------------------------------------ */
/* AudioEngine — all sound synthesized at runtime via Web Audio API    */
/* ------------------------------------------------------------------ */
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.musicOn = false;
    this._nbuf = null;
    this.step = 0;
    this.nextTime = 0;
  }
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      return true;
    } catch (e) {
      this.ctx = null;
      return false;
    }
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }
  tone(opts = {}) {
    if (!this.ctx || this.muted) return;
    const { type = 'square', f0 = 440, f1 = null, dur = 0.1, vol = 0.15, t0 = null } = opts;
    const t = t0 != null ? t0 : this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(f0, 1), t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0001), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }
  getNoiseBuf() {
    if (!this._nbuf) {
      const ctx = this.ctx;
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this._nbuf = buf;
    }
    return this._nbuf;
  }
  noise(opts = {}) {
    if (!this.ctx || this.muted) return;
    const { dur = 0.3, vol = 0.2, lp = 1000, lpEnd = null, t0 = null } = opts;
    const t = t0 != null ? t0 : this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.getNoiseBuf();
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(lp, t);
    if (lpEnd) f.frequency.exponentialRampToValueAtTime(Math.max(lpEnd, 40), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0001), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.03);
  }
  /* --- SFX --- */
  shoot() { this.tone({ type: 'square', f0: 760, f1: 190, dur: 0.07, vol: 0.05 }); }
  laserPulse() { this.tone({ type: 'sawtooth', f0: 150, f1: 70, dur: 0.06, vol: 0.045 }); }
  hit() {
    this.noise({ dur: 0.08, vol: 0.1, lp: 2600 });
    this.tone({ type: 'triangle', f0: 320, f1: 90, dur: 0.09, vol: 0.09 });
  }
  explode() {
    this.noise({ dur: 0.3, vol: 0.2, lp: 900, lpEnd: 140 });
    this.tone({ type: 'sine', f0: 190, f1: 45, dur: 0.28, vol: 0.16 });
  }
  bigExplode() {
    if (!this.ctx) return;
    this.noise({ dur: 0.8, vol: 0.28, lp: 1500, lpEnd: 70 });
    this.tone({ type: 'sine', f0: 120, f1: 28, dur: 0.7, vol: 0.26 });
    this.tone({ type: 'square', f0: 70, f1: 25, dur: 0.5, vol: 0.1, t0: this.ctx.currentTime + 0.06 });
  }
  powerup() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      this.tone({ type: 'sine', f0: f, dur: 0.12, vol: 0.09, t0: t + i * 0.07 }));
  }
  dash() { this.tone({ type: 'sawtooth', f0: 220, f1: 940, dur: 0.16, vol: 0.06 }); }
  playerHit() {
    this.noise({ dur: 0.4, vol: 0.24, lp: 700, lpEnd: 90 });
    this.tone({ type: 'sawtooth', f0: 320, f1: 45, dur: 0.42, vol: 0.2 });
  }
  shieldHit() {
    this.tone({ type: 'triangle', f0: 900, f1: 300, dur: 0.18, vol: 0.12 });
    this.noise({ dur: 0.12, vol: 0.08, lp: 4000 });
  }
  waveClear() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [392, 523.25, 659.25, 783.99].forEach((f, i) =>
      this.tone({ type: 'square', f0: f, dur: 0.16, vol: 0.07, t0: t + i * 0.1 }));
  }
  bossWarn() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      this.tone({ type: 'square', f0: 110, f1: 55, dur: 0.28, vol: 0.16, t0: t + i * 0.42 });
    }
  }
  comboBlip(step) {
    this.tone({ type: 'sine', f0: 440 * Math.pow(1.0595, clamp(step, 0, 24)), dur: 0.05, vol: 0.04 });
  }
  gameOver() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [330, 294, 262, 196, 131].forEach((f, i) =>
      this.tone({ type: 'sawtooth', f0: f, f1: f * 0.9, dur: 0.34, vol: 0.11, t0: t + i * 0.24 }));
  }
  /* --- procedural synthwave backing loop --- */
  musicStart() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
  }
  musicStop() { this.musicOn = false; }
  musicPump() {
    if (!this.ctx || !this.musicOn) return;
    const bass = [55, 55, 65.41, 55, 82.41, 55, 65.41, 49];
    const stepDur = 0.136;
    while (this.nextTime < this.ctx.currentTime + 0.25) {
      const t = this.nextTime;
      const s = this.step % 16;
      if (!this.muted) {
        this.tone({ type: 'square', f0: bass[Math.floor(s / 2) % 8], dur: 0.12, vol: 0.03, t0: t });
        if (s % 4 === 2) this.noise({ dur: 0.03, vol: 0.018, lp: 6500, t0: t });
        if (s % 8 === 0) this.tone({ type: 'triangle', f0: 220, f1: 110, dur: 0.5, vol: 0.018, t0: t });
      }
      this.step++;
      this.nextTime += stepDur;
    }
  }
}
/* ------------------------------------------------------------------ */
/* Particles, floating text, starfield                                */
/* ------------------------------------------------------------------ */
class Particle {
  constructor(x, y, color, opts = {}) {
    this.x = x; this.y = y;
    const ang = opts.angle != null ? opts.angle : rand(0, TAU);
    const spd = opts.speed != null ? opts.speed : rand(40, 320);
    this.vx = Math.cos(ang) * spd;
    this.vy = Math.sin(ang) * spd;
    this.life = this.maxLife = opts.life != null ? opts.life : rand(0.35, 0.9);
    this.size = opts.size != null ? opts.size : rand(1.5, 3.5);
    this.color = color;
    this.drag = opts.drag != null ? opts.drag : 2.2;
    this.grav = opts.grav || 0;
  }
  update(dt) {
    this.life -= dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const d = Math.max(0, 1 - this.drag * dt);
    this.vx *= d; this.vy *= d;
    this.vy += this.grav * dt;
  }
  draw(ctx) {
    const t = clamp(this.life / this.maxLife, 0, 1);
    ctx.globalAlpha = t;
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 8;
    const s = this.size * (0.4 + 0.6 * t);
    ctx.fillRect(this.x - s / 2, this.y - s / 2, s, s);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}

class FloatingText {
  constructor(x, y, text, color, size = 14) {
    this.x = x; this.y = y; this.text = text; this.color = color;
    this.life = this.maxLife = 1.0;
    this.size = size;
  }
  update(dt) {
    this.life -= dt;
    this.y -= 34 * dt;
  }
  draw(ctx) {
    const t = clamp(this.life / this.maxLife, 0, 1);
    ctx.globalAlpha = t;
    ctx.font = `bold ${this.size}px "Share Tech Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 10;
    ctx.fillText(this.text, this.x, this.y);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}

class ParticleSystem {
  constructor() {
    this.particles = [];
    this.texts = [];
  }
  burst(x, y, color, n = 18, opts = {}) {
    const count = Math.min(n, 900 - this.particles.length);
    for (let i = 0; i < count; i++) this.particles.push(new Particle(x, y, color, opts));
  }
  ring(x, y, color, n = 14, speed = 180) {
    const count = Math.min(n, 900 - this.particles.length);
    for (let i = 0; i < count; i++) {
      this.particles.push(new Particle(x, y, color, { angle: (i / count) * TAU, speed, life: 0.5, drag: 3 }));
    }
  }
  trail(x, y, color) {
    if (this.particles.length > 860) return;
    this.particles.push(new Particle(x, y, color, { speed: rand(10, 46), life: rand(0.18, 0.42), size: rand(1, 2.4), drag: 3 }));
  }
  text(x, y, str, color, size) { this.texts.push(new FloatingText(x, y, str, color, size)); }
  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.update(dt);
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.update(dt);
      if (t.life <= 0) this.texts.splice(i, 1);
    }
  }
  draw(ctx) {
    for (const p of this.particles) p.draw(ctx);
    for (const t of this.texts) t.draw(ctx);
  }
  clear() { this.particles.length = 0; this.texts.length = 0; }
}

class Starfield {
  constructor() {
    this.layers = [
      { speed: 16, size: 1, alpha: 0.35, stars: [] },
      { speed: 40, size: 1.6, alpha: 0.6, stars: [] },
      { speed: 82, size: 2.4, alpha: 0.9, stars: [] },
    ];
    for (const l of this.layers) {
      const n = Math.floor((VIEW_W * VIEW_H) / (l.speed < 30 ? 3600 : l.speed < 60 ? 6500 : 12000));
      for (let i = 0; i < n; i++) {
        l.stars.push({ x: rand(0, VIEW_W), y: rand(0, VIEW_H), tw: rand(0, TAU) });
      }
    }
  }
  update(dt) {
    for (const l of this.layers) {
      for (const s of l.stars) {
        s.y += l.speed * dt;
        s.tw += dt * 2.4;
        if (s.y > VIEW_H) { s.y = -2; s.x = rand(0, VIEW_W); }
      }
    }
  }
  draw(ctx) {
    for (const l of this.layers) {
      for (const s of l.stars) {
        const a = l.alpha * (0.65 + 0.35 * Math.sin(s.tw));
        ctx.globalAlpha = a;
        ctx.fillStyle = l.speed > 60 ? '#bfe9ff' : '#8f7bd8';
        ctx.fillRect(s.x, s.y, l.size, l.size);
      }
    }
    ctx.globalAlpha = 1;
  }
}
/* ------------------------------------------------------------------ */
/* Player, bullets, enemy bullets, power-up drops                      */
/* ------------------------------------------------------------------ */
class Player {
  constructor(game) {
    this.game = game;
    this.reset();
  }
  reset() {
    this.w = 34; this.h = 24;
    this.x = VIEW_W / 2;
    this.y = VIEW_H - 58;
    this.vx = 0;
    this.baseSpeed = 330;
    this.shootCd = 0;
    this.dashCd = 0;
    this.dashTime = 0;
    this.dashDir = 0;
    this.invuln = 2.0;
    this.lives = 3;
    this.shieldTime = 0;
    this.tripleTime = 0;
    this.laserTime = 0;
    this.speedTime = 0;
    this.engineT = 0;
  }
  get hitRadius() { return 13; }
  get alive() { return this.lives > 0; }

  activate(type) {
    const DUR = { shield: 10, triple: 12, laser: 9, speed: 9 };
    if (type === 'shield') this.shieldTime = Math.max(this.shieldTime, DUR.shield);
    else if (type === 'triple') this.tripleTime = Math.max(this.tripleTime, DUR.triple);
    else if (type === 'laser') this.laserTime = Math.max(this.laserTime, DUR.laser);
    else if (type === 'speed') this.speedTime = Math.max(this.speedTime, DUR.speed);
  }

  update(dt) {
    const g = this.game;
    const left = Input.down('arrowleft') || Input.down('a');
    const right = Input.down('arrowright') || Input.down('d');
    let dir = (right ? 1 : 0) - (left ? 1 : 0);

    this.dashCd = Math.max(0, this.dashCd - dt);
    this.dashTime = Math.max(0, this.dashTime - dt);
    if ((Input.hit('shift')) && this.dashCd <= 0) {
      this.dashDir = dir !== 0 ? dir : (this.vx >= 0 ? 1 : -1);
      this.dashTime = 0.16;
      this.dashCd = 1.3;
      this.invuln = Math.max(this.invuln, 0.3);
      g.audio.dash();
      g.particles.burst(this.x, this.y, '#00f0ff', 14, { speed: 160, life: 0.4 });
    }

    const speed = this.baseSpeed * (this.speedTime > 0 ? 1.55 : 1);
    const dashBoost = this.dashTime > 0 ? 900 * this.dashDir : 0;
    const target = dir * speed + dashBoost;
    this.vx = lerp(this.vx, target, clamp(dt * (this.dashTime > 0 ? 22 : 10), 0, 1));
    this.x = clamp(this.x + this.vx * dt, 20, VIEW_W - 20);

    this.engineT += dt;
    if (Math.abs(this.vx) > 30 || this.dashTime > 0) {
      g.particles.trail(this.x - this.vx * 0.012, this.y + 12, this.dashTime > 0 ? '#ffffff' : '#b026ff');
    }

    /* shooting — hold to fire continuously */
    this.shootCd = Math.max(0, this.shootCd - dt);
    const firing = Input.down(' ') || Input.down('k') || Input.down('enter');
    if (firing && this.shootCd <= 0) {
      if (this.laserTime > 0) {
        g.spawnPlayerLaser(this.x, this.y - 16);
        g.audio.laserPulse();
        this.shootCd = 0.13;
      } else {
        if (this.tripleTime > 0) {
          g.spawnPlayerBullet(this.x, this.y - 18, 0, -720);
          g.spawnPlayerBullet(this.x - 10, this.y - 10, -150, -690);
          g.spawnPlayerBullet(this.x + 10, this.y - 10, 150, -690);
        } else {
          g.spawnPlayerBullet(this.x - 6, this.y - 12, 0, -720);
          g.spawnPlayerBullet(this.x + 6, this.y - 12, 0, -720);
        }
        g.audio.shoot();
        this.shootCd = 0.14;
      }
    }

    /* timers */
    this.invuln = Math.max(0, this.invuln - dt);
    this.shieldTime = Math.max(0, this.shieldTime - dt);
    this.tripleTime = Math.max(0, this.tripleTime - dt);
    this.laserTime = Math.max(0, this.laserTime - dt);
    this.speedTime = Math.max(0, this.speedTime - dt);
  }

  hit() {
    if (this.invuln > 0 || !this.alive) return false;
    const g = this.game;
    if (this.shieldTime > 0) {
      this.shieldTime = 0;
      this.invuln = 1.2;
      g.audio.shieldHit();
      g.particles.ring(this.x, this.y, '#00f0ff', 22, 240);
      g.addShake(6);
      g.particles.text(this.x, this.y - 30, 'SHIELD SPART', '#00f0ff', 13);
      return false;
    }
    this.lives -= 1;
    this.invuln = 2.4;
    g.audio.playerHit();
    g.addShake(16);
    g.particles.burst(this.x, this.y, '#ff3860', 46, { speed: 340, life: 1 });
    g.particles.ring(this.x, this.y, '#ffb300', 18, 200);
    g.resetCombo();
    if (this.lives <= 0) g.onPlayerDestroyed(this.x, this.y);
    return true;
  }

  draw(ctx) {
    if (!this.alive) return;
    const blink = this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0;
    if (blink) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(clamp(this.vx / 2600, -0.22, 0.22));

    /* engine plume */
    const plume = 8 + Math.sin(this.engineT * 34) * 3 + (this.dashTime > 0 ? 12 : 0);
    ctx.fillStyle = '#b026ff';
    ctx.shadowColor = '#b026ff';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(-5, 10); ctx.lineTo(0, 10 + plume); ctx.lineTo(5, 10);
    ctx.closePath();
    ctx.fill();

    /* hull */
    ctx.strokeStyle = '#00f0ff';
    ctx.fillStyle = 'rgba(0,240,255,0.10)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(11, 2);
    ctx.lineTo(17, 10);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 11);
    ctx.lineTo(-6, 7);
    ctx.lineTo(-17, 10);
    ctx.lineTo(-11, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    /* cockpit */
    ctx.fillStyle = '#ff2bd6';
    ctx.shadowColor = '#ff2bd6';
    ctx.beginPath();
    ctx.arc(0, -3, 3.4, 0, TAU);
    ctx.fill();
    ctx.restore();

    /* shield bubble */
    if (this.shieldTime > 0) {
      const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 110);
      const fade = this.shieldTime < 2 ? (0.3 + 0.7 * Math.abs(Math.sin(this.shieldTime * 8))) : 1;
      ctx.save();
      ctx.globalAlpha = 0.8 * fade;
      ctx.strokeStyle = '#00f0ff';
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 22;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 28 * pulse + 4, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }
}

class Bullet {
  constructor(x, y, vx, vy, laser = false) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.laser = laser;
    this.dead = false;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y < -30 || this.y > VIEW_H + 30 || this.x < -40 || this.x > VIEW_W + 40) this.dead = true;
  }
  draw(ctx) {
    ctx.save();
    if (this.laser) {
      ctx.strokeStyle = '#ff2bd6';
      ctx.shadowColor = '#ff2bd6';
      ctx.shadowBlur = 20;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x - this.vx * 0.02, this.y - this.vy * 0.012);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    } else {
      ctx.fillStyle = '#00f0ff';
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 12;
      ctx.fillRect(this.x - 1.6, this.y - 8, 3.2, 14);
    }
    ctx.restore();
  }
}

class EnemyBullet {
  constructor(x, y, vx, vy, color = '#ff2bd6') {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.color = color;
    this.r = 4.5;
    this.dead = false;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y < -20 || this.y > VIEW_H + 20 || this.x < -20 || this.x > VIEW_W + 20) this.dead = true;
  }
  draw(ctx) {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * 0.45, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

class PowerUp {
  constructor(x, y, type) {
    this.x = x; this.y = y; this.type = type;
    this.vy = 92;
    this.t = rand(0, TAU);
    this.dead = false;
    this.r = 13;
  }
  update(dt) {
    this.t += dt;
    this.y += this.vy * dt;
    this.x += Math.sin(this.t * 2.6) * 26 * dt;
    if (this.y > VIEW_H + 24) this.dead = true;
  }
  draw(ctx) {
    const def = POWER_DEFS[this.type];
    const pulse = 1 + 0.12 * Math.sin(this.t * 7);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.t * 1.6);
    ctx.strokeStyle = def.color;
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 18;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const px = Math.cos(a) * 13 * pulse, py = Math.sin(a) * 13 * pulse;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = def.color;
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 10;
    ctx.font = 'bold 13px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.label, 0, 1);
    ctx.restore();
  }
}
/* ------------------------------------------------------------------ */
/* Enemies: Grunt (swarm), Zigzag, Orbiter (rotating formation), Boss  */
/* ------------------------------------------------------------------ */
class Enemy {
  constructor(game, x, y) {
    this.game = game;
    this.x = x; this.y = y;
    this.t = rand(0, TAU);
    this.entering = true;
    this.dead = false;
    this.flash = 0;
    this.fireCd = rand(1.4, 4.2);
  }
  /* generic bullet-impact handling; returns true if enemy died */
  damage(dmg) {
    this.hp -= dmg;
    this.flash = 0.08;
    if (this.hp <= 0) {
      this.dead = true;
      return true;
    }
    this.game.audio.hit();
    return false;
  }
  maybeFire(dt) {
    if (this.entering) return;
    this.fireCd -= dt;
    if (this.fireCd <= 0) {
      this.fireCd = rand(2.2, 5.5) / this.game.difficulty();
      if (this.y > HUD_H + 20 && this.y < VIEW_H - 140) this.game.enemyFireAt(this.x, this.y + 10, 170);
    }
  }
  updateCommon(dt) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
  }
  advanceEntry(dt, speed = 300) {
    this.y += speed * dt;
    if (this.y >= this.homeY) { this.y = this.homeY; this.entering = false; }
  }
  drawFlash(ctx, drawShape) {
    if (this.flash > 0) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 22;
      drawShape(true);
      ctx.restore();
      return;
    }
    drawShape(false);
  }
}

class GruntEnemy extends Enemy {
  constructor(game, x, y, wave) {
    super(game, x, y);
    this.homeY = y;
    this.baseX = x;
    this.w = 26; this.h = 20;
    this.hp = 1 + Math.floor(wave / 4);
    this.maxHp = this.hp;
    this.points = 100;
    this.color = '#39ff14';
    this.dropChance = 0.09;
  }
  update(dt) {
    this.updateCommon(dt);
    if (this.entering) {
      this.advanceEntry(dt);
    } else {
      this.y = this.homeY + Math.sin(this.t * 1.7) * 7;
      this.x = this.baseX + Math.sin(this.t * 0.75) * 24;
    }
    this.maybeFire(dt);
  }
  draw(ctx) {
    this.drawFlash(ctx, (white) => {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.strokeStyle = white ? '#ffffff' : this.color;
      ctx.fillStyle = white ? '#ffffff' : 'rgba(57,255,20,0.10)';
      ctx.lineWidth = 2;
      ctx.shadowColor = white ? '#ffffff' : this.color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(-13, -6); ctx.lineTo(-7, -10); ctx.lineTo(7, -10); ctx.lineTo(13, -6);
      ctx.lineTo(13, 4); ctx.lineTo(6, 10); ctx.lineTo(-6, 10); ctx.lineTo(-13, 4);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = white ? '#ffffff' : '#ffb300';
      ctx.shadowColor = '#ffb300';
      ctx.fillRect(-5, -3, 3.4, 4);
      ctx.fillRect(2, -3, 3.4, 4);
      ctx.restore();
    });
  }
}

class ZigzagEnemy extends Enemy {
  constructor(game, x, y, wave) {
    super(game, x, y);
    this.homeY = y;
    this.baseX = x;
    this.w = 24; this.h = 22;
    this.hp = 2 + Math.floor(wave / 3);
    this.maxHp = this.hp;
    this.points = 150;
    this.color = '#ffb300';
    this.dropChance = 0.13;
    this.slide = rand(60, 110) * (Math.random() < 0.5 ? -1 : 1);
    this.phase = rand(0, TAU);
  }
  update(dt) {
    this.updateCommon(dt);
    if (this.entering) {
      this.advanceEntry(dt);
    } else {
      this.x += this.slide * dt;
      if (this.x < 36 || this.x > VIEW_W - 36) { this.slide *= -1; this.x = clamp(this.x, 36, VIEW_W - 36); }
      this.y = this.homeY + Math.abs(Math.sin(this.t * 3 + this.phase)) * 26 - 13;
    }
    this.maybeFire(dt);
  }
  draw(ctx) {
    this.drawFlash(ctx, (white) => {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(Math.sin(this.t * 3) * 0.35);
      ctx.strokeStyle = white ? '#ffffff' : this.color;
      ctx.fillStyle = white ? '#ffffff' : 'rgba(255,179,0,0.10)';
      ctx.lineWidth = 2;
      ctx.shadowColor = white ? '#ffffff' : this.color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(0, -12); ctx.lineTo(12, 0); ctx.lineTo(0, 12); ctx.lineTo(-12, 0);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 3.4, 0, TAU);
      ctx.fillStyle = white ? '#ffffff' : '#ff2bd6';
      ctx.shadowColor = '#ff2bd6';
      ctx.fill();
      ctx.restore();
    });
  }
}

class OrbiterEnemy extends Enemy {
  constructor(game, cx, cy, radius, phase, speed, y, wave) {
    super(game, cx, cy);
    this.cx = cx; this.cy = cy;
    this.homeY = y;
    this.radius = radius;
    this.phase = phase;
    this.speed = speed;
    this.enterOff = VIEW_H;
    this.w = 20; this.h = 20;
    this.hp = 2 + Math.floor(wave / 4);
    this.maxHp = this.hp;
    this.points = 200;
    this.color = '#b026ff';
    this.dropChance = 0.15;
  }
  update(dt) {
    this.updateCommon(dt);
    this.cx = clamp(this.cx, 60, VIEW_W - 60);
    this.phase += this.speed * dt;
    const ox = this.cx + Math.cos(this.phase) * this.radius;
    const oy = this.cy + Math.sin(this.phase) * this.radius * 0.55;
    if (this.entering) {
      this.enterOff -= 320 * dt;
      if (this.enterOff <= 0) { this.enterOff = 0; this.entering = false; }
    }
    this.x = ox;
    this.y = oy + this.enterOff;
    if (!this.entering && this.y < HUD_H + 16) this.y = HUD_H + 16;
    this.maybeFire(dt);
  }
  draw(ctx) {
    this.drawFlash(ctx, (white) => {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.phase * 2);
      ctx.strokeStyle = white ? '#ffffff' : this.color;
      ctx.fillStyle = white ? '#ffffff' : 'rgba(176,38,255,0.12)';
      ctx.lineWidth = 2;
      ctx.shadowColor = white ? '#ffffff' : this.color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU - Math.PI / 2;
        const px = Math.cos(a) * 11, py = Math.sin(a) * 11;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    });
  }
}

class BossEnemy extends Enemy {
  constructor(game, wave) {
    super(game, VIEW_W / 2, -90);
    this.homeY = 120;
    this.wave = wave;
    this.tier = Math.floor(wave / 5);
    this.w = 120; this.h = 60;
    this.hp = 55 + this.tier * 40 + wave * 6;
    this.maxHp = this.hp;
    this.points = 2500 + this.tier * 800;
    this.color = '#ff2bd6';
    this.dropChance = 1;
    this.fireTimer = 2.4;
    this.pattern = 0;
    this.patternTimer = 6;
    this.contactCd = 0;
    /* own clock for entry→sway so position stays continuous (this.t starts random) */
    this.moveT = 0;
  }
  update(dt) {
    this.updateCommon(dt);
    const g = this.game;
    if (this.entering) {
      this.advanceEntry(dt, 95);
      this.x = VIEW_W / 2;
    } else {
      this.moveT += dt;
      this.x = VIEW_W / 2 + Math.sin(this.moveT * 0.55) * (VIEW_W / 2 - 150);
      this.y = this.homeY + Math.sin(this.moveT * 1.3) * 22;
    }

    this.contactCd = Math.max(0, this.contactCd - dt);
    const p = g.player;
    if (p.alive && p.invuln <= 0 && dist2(this.x, this.y, p.x, p.y) < 52 * 52 && this.contactCd <= 0) {
      this.contactCd = 1;
      p.hit();
    }

    this.patternTimer -= dt;
    if (this.patternTimer <= 0) {
      this.pattern = (this.pattern + 1) % 3;
      this.patternTimer = rand(5, 8);
    }

    this.fireTimer -= dt;
    if (this.fireTimer <= 0 && !this.entering) {
      const d = g.difficulty();
      if (this.pattern === 0) {
        /* wide fan */
        for (let i = -3; i <= 3; i++) {
          const a = Math.PI / 2 + i * 0.24;
          g.spawnEnemyBullet(this.x, this.y + 26, Math.cos(a) * 210 * d, Math.sin(a) * 210 * d, '#ff2bd6');
        }
        this.fireTimer = 1.5 / d;
        g.audio.tone({ type: 'sawtooth', f0: 240, f1: 120, dur: 0.12, vol: 0.06 });
      } else if (this.pattern === 1) {
        /* aimed triple burst */
        for (let i = 0; i < 3; i++) {
          const a = Math.atan2(p.y - this.y, p.x - this.x) + rand(-0.09, 0.09);
          g.spawnEnemyBullet(this.x, this.y + 20, Math.cos(a) * 280 * d, Math.sin(a) * 280 * d, '#ff3860');
        }
        this.fireTimer = 0.42 / d;
      } else {
        /* rotating spiral */
        for (let i = 0; i < 2; i++) {
          const a = this.t * 3.2 + i * Math.PI;
          g.spawnEnemyBullet(this.x, this.y, Math.cos(a) * 170 * d, Math.abs(Math.sin(a)) * 170 * d + 60, '#b026ff');
        }
        this.fireTimer = 0.16 / d;
      }
    }
  }
  onDeath() {
    const g = this.game;
    g.audio.bigExplode();
    g.addShake(26);
    g.particles.burst(this.x, this.y, '#ff2bd6', 90, { speed: 420, life: 1.2 });
    g.particles.burst(this.x, this.y, '#ffb300', 60, { speed: 320, life: 1 });
    g.particles.burst(this.x, this.y, '#ffffff', 40, { speed: 520, life: 0.7 });
    g.particles.ring(this.x, this.y, '#00f0ff', 30, 340);
    g.guaranteeDrops(this.x, this.y, 2);
  }
  draw(ctx) {
    const flash = this.flash > 0;
    ctx.save();
    ctx.translate(this.x, this.y);
    const col = flash ? '#ffffff' : this.color;

    /* hull */
    ctx.strokeStyle = col;
    ctx.fillStyle = 'rgba(255,43,214,0.08)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = col;
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.moveTo(-64, -6);
    ctx.lineTo(-40, -28); ctx.lineTo(40, -28); ctx.lineTo(64, -6);
    ctx.lineTo(48, 22); ctx.lineTo(20, 32); ctx.lineTo(-20, 32); ctx.lineTo(-48, 22);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    /* wings */
    ctx.beginPath();
    ctx.moveTo(-64, -6); ctx.lineTo(-86, 12); ctx.lineTo(-52, 14);
    ctx.moveTo(64, -6); ctx.lineTo(86, 12); ctx.lineTo(52, 14);
    ctx.stroke();

    /* core eye — pulses with remaining hp */
    const pulse = 10 + 4 * Math.sin(this.t * (5 + (1 - this.hp / this.maxHp) * 9));
    ctx.fillStyle = flash ? '#ffffff' : '#ff3860';
    ctx.shadowColor = '#ff3860';
    ctx.shadowBlur = 26;
    ctx.beginPath();
    ctx.arc(0, 2, pulse, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 2, pulse * 0.4, 0, TAU);
    ctx.fill();

    /* side pods */
    ctx.fillStyle = flash ? '#ffffff' : '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 14;
    ctx.fillRect(-50, 2, 10, 12);
    ctx.fillRect(40, 2, 10, 12);
    ctx.restore();

    /* HP bar */
    const bw = 180;
    const frac = clamp(this.hp / this.maxHp, 0, 1);
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(this.x - bw / 2, this.y - 48, bw, 6);
    ctx.fillStyle = frac > 0.4 ? '#ff2bd6' : '#ff3860';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 10;
    ctx.fillRect(this.x - bw / 2, this.y - 48, bw * frac, 6);
    ctx.restore();
  }
}
/* ------------------------------------------------------------------ */
/* Game — state machine, wave director, collisions, HUD, rendering     */
/* ------------------------------------------------------------------ */
const STATE = { MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', GAMEOVER: 'gameover' };

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audio = new AudioEngine();
    this.particles = new ParticleSystem();
    this.stars = new Starfield();
    this.player = new Player(this);
    this.high = loadHigh();

    this.state = STATE.MENU;
    this.time = 0;
    this.shake = 0;
    this.flashAlpha = 0;

    this.playerBullets = [];
    this.enemyBullets = [];
    this.enemies = [];
    this.powerups = [];

    this.score = 0;
    this.wave = 1;
    this.combo = 0;
    this.comboTimer = 0;
    this.maxCombo = 1;

    this.wavePhase = 'active';   /* active | cleared | spawning */
    this.waveTimer = 0;
    this.banner = null;          /* { title, sub, time } */
    this.bossRef = null;

    this.newRecord = false;

    /* exposed for automation / testing */
    window.__game = this;
  }

  /* ---------------- lifecycle ---------------- */
  startRun() {
    this.audio.ensure();
    this.player.reset();
    this.playerBullets.length = 0;
    this.enemyBullets.length = 0;
    this.enemies.length = 0;
    this.powerups.length = 0;
    this.particles.clear();
    this.score = 0;
    this.wave = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.maxCombo = 1;
    this.shake = 0;
    this.flashAlpha = 0;
    this.newRecord = false;
    this.bossRef = null;
    this.state = STATE.PLAYING;
    UI.showScreen('none');
    this.audio.musicStart();
    this.nextWave();
  }

  toMenu() {
    this.state = STATE.MENU;
    this.audio.musicStop();
    UI.showScreen('start');
    UI.refreshHigh(this.high);
  }

  togglePause() {
    if (this.state === STATE.PLAYING) { this.state = STATE.PAUSED; this.audio.musicStop(); }
    else if (this.state === STATE.PAUSED) { this.state = STATE.PLAYING; this.audio.musicStart(); }
  }

  difficulty() { return 1 + (this.wave - 1) * 0.07; }

  addShake(v) { this.shake = Math.min(30, this.shake + v); }

  /* ---------------- combo / score ---------------- */
  addScore(base) {
    const mult = clamp(1 + Math.floor(this.combo / 4), 1, 10);
    this.score += Math.round(base * mult);
  }
  bumpCombo() {
    this.combo += 1;
    this.comboTimer = 2.6;
    this.maxCombo = Math.max(this.maxCombo, this.comboMult());
    if (this.combo % 4 === 0) this.audio.comboBlip(this.combo);
  }
  comboMult() { return clamp(1 + Math.floor(this.combo / 4), 1, 10); }
  resetCombo() { this.combo = 0; this.comboTimer = 0; }

  /* ---------------- wave director ---------------- */
  nextWave() {
    this.wave += 1;
    this.wavePhase = 'spawning';
    this.waveTimer = 0;
    if (this.isBossWave(this.wave)) {
      this.banner = { title: 'ATENTIE: BOSS', sub: `URCA TIER ${Math.floor(this.wave / 5)}`, time: 2.6 };
      this.audio.bossWarn();
    } else {
      this.banner = { title: `VALUL ${this.wave}`, sub: 'DEFENSE ONLINE', time: 2.0 };
      this.audio.waveClear();
    }
  }
  isBossWave(w) { return w % 5 === 0; }

  buildWave() {
    const w = this.wave;
    this.enemies.length = 0;
    if (this.isBossWave(w)) {
      this.bossRef = new BossEnemy(this, w);
      this.enemies.push(this.bossRef);
      const escorts = 4 + Math.min(4, Math.floor(w / 5));
      for (let i = 0; i < escorts; i++) {
        const x = 110 + (i % 2) * (VIEW_W - 220);
        const y = 200 + Math.floor(i / 2) * 60;
        this.enemies.push(new ZigzagEnemy(this, x, -30 - i * 46, w).atY(y));
      }
      return;
    }
    const rows = Math.min(5, 2 + Math.floor(w / 2));
    const cols = Math.min(9, 4 + Math.floor(w / 2));
    const gapX = Math.min(96, (VIEW_W - 160) / cols);
    const startX = VIEW_W / 2 - ((cols - 1) * gapX) / 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * gapX;
        const homeY = HUD_H + 74 + r * 58;
        const roll = Math.random();
        let e;
        if (r === 0 && w >= 3 && roll < 0.5) e = new ZigzagEnemy(this, x, -30 - r * 52, w);
        else e = new GruntEnemy(this, x, -30 - r * 52, w);
        e.homeY = homeY;
        e.baseX = x;
        this.enemies.push(e);
      }
    }
    /* rotating formations from wave 2 */
    if (w >= 2) {
      const clusters = Math.min(3, Math.floor(w / 2));
      for (let k = 0; k < clusters; k++) {
        const cx = rand(180, VIEW_W - 180);
        const cy = rand(HUD_H + 110, VIEW_H - 230);
        const radius = rand(46, 74);
        const speed = (Math.random() < 0.5 ? -1 : 1) * rand(1.1, 1.9);
        const n = 5;
        for (let i = 0; i < n; i++) {
          const phase = (i / n) * TAU;
          const e = new OrbiterEnemy(this, cx, cy - VIEW_H, radius, phase, speed, cy, w);
          e.x = cx + Math.cos(phase) * radius;
          e.y = cy + Math.sin(phase) * radius * 0.55 - VIEW_H;
          e.homeY = cy;
          this.enemies.push(e);
        }
      }
    }
  }

  /* ---------------- spawning helpers ---------------- */
  spawnPlayerBullet(x, y, vx, vy) { this.playerBullets.push(new Bullet(x, y, vx, vy)); }
  spawnPlayerLaser(x, y) { this.playerBullets.push(new Bullet(x, y, 0, -1250, true)); }
  spawnEnemyBullet(x, y, vx, vy, color) { this.enemyBullets.push(new EnemyBullet(x, y, vx, vy, color)); }
  enemyFireAt(x, y, speed) {
    const p = this.player;
    if (!p.alive) return;
    const a = Math.atan2(p.y - y, p.x - x) + rand(-0.12, 0.12);
    this.spawnEnemyBullet(x, y, Math.cos(a) * speed, Math.sin(a) * speed, '#ff2bd6');
  }
  maybeDrop(enemy) {
    if (Math.random() < enemy.dropChance) {
      this.powerups.push(new PowerUp(enemy.x, enemy.y, pick(POWER_KEYS)));
    }
  }
  guaranteeDrops(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.powerups.push(new PowerUp(x + rand(-40, 40), y + rand(-16, 16), pick(POWER_KEYS)));
    }
  }

  onEnemyKilled(e) {
    this.bumpCombo();
    this.addScore(e.points);
    this.particles.text(e.x, e.y - 14, `+${e.points}`, e.color, 13);
    this.particles.burst(e.x, e.y, e.color, 22, { speed: 260 });
    this.particles.ring(e.x, e.y, '#ffffff', 10, 150);
    this.audio.explode();
    this.addShake(3.5);
    this.maybeDrop(e);
    if (e instanceof BossEnemy) e.onDeath();
    if (e === this.bossRef) this.bossRef = null;
  }

  onPlayerDestroyed(x, y) {
    this.audio.bigExplode();
    this.audio.gameOver();
    this.audio.musicStop();
    this.addShake(30);
    this.flashAlpha = 0.9;
    this.particles.burst(x, y, '#00f0ff', 80, { speed: 420, life: 1.3 });
    this.particles.burst(x, y, '#ffffff', 40, { speed: 560, life: 0.8 });
    this.state = STATE.GAMEOVER;
    this.newRecord = this.score > this.high;
    if (this.newRecord) { this.high = this.score; saveHigh(this.high); }
    UI.showGameOver(this);
  }

  /* ---------------- update ---------------- */
  update(dt) {
    this.time += dt;
    this.stars.update(dt);
    this.particles.update(dt);
    this.audio.musicPump();
    this.shake = Math.max(0, this.shake - dt * 34);
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 1.4);

    if (this.state !== STATE.PLAYING) return;

    if (this.banner) {
      this.banner.time -= dt;
      if (this.banner.time <= 0) this.banner = null;
    }

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.resetCombo();
    }

    if (this.wavePhase === 'spawning') {
      this.waveTimer += dt;
      if (this.waveTimer >= 1.6) { this.buildWave(); this.wavePhase = 'active'; }
    }

    this.player.update(dt);

    for (const b of this.playerBullets) b.update(dt);
    for (const b of this.enemyBullets) b.update(dt);
    for (const e of this.enemies) e.update(dt);
    for (const p of this.powerups) p.update(dt);

    this.collide();

    this.playerBullets = this.playerBullets.filter((b) => !b.dead);
    this.enemyBullets = this.enemyBullets.filter((b) => !b.dead);
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.powerups = this.powerups.filter((p) => !p.dead);

    if (this.wavePhase === 'active' && this.enemies.length === 0) {
      this.nextWave();
    }
  }

  /* ---------------- collisions ---------------- */
  collide() {
    const p = this.player;
    /* player bullets vs enemies */
    for (const b of this.playerBullets) {
      if (b.dead) continue;
      for (const e of this.enemies) {
        if (e.dead || e.entering) continue;
        const r = (e instanceof BossEnemy ? 54 : e.w * 0.62);
        if (dist2(b.x, b.y, e.x, e.y) < r * r) {
          if (b.laser) {
            /* laser pierces but slows down per hit */
            if (e.damage(2)) this.onEnemyKilled(e);
            b.vx *= 0.86;
            b.vy *= 0.93;
            if (Math.abs(b.vy) < 320) b.dead = true;
            this.particles.burst(b.x, b.y, '#ff2bd6', 5, { speed: 120, life: 0.25 });
          } else {
            b.dead = true;
            this.particles.burst(b.x, b.y, '#00f0ff', 5, { speed: 130, life: 0.3 });
            if (e.damage(1)) this.onEnemyKilled(e);
          }
          if (b.dead) break;
        }
      }
    }
    if (!p.alive) return;
    /* enemy bullets vs player */
    for (const b of this.enemyBullets) {
      if (b.dead) continue;
      if (dist2(b.x, b.y, p.x, p.y) < (b.r + p.hitRadius) * (b.r + p.hitRadius)) {
        b.dead = true;
        p.hit();
        if (!p.alive) return;
      }
    }
    /* enemy body vs player */
    for (const e of this.enemies) {
      if (e.dead || e.entering) continue;
      const r = (e instanceof BossEnemy ? 50 : e.w * 0.55) + p.hitRadius * 0.6;
      if (dist2(e.x, e.y, p.x, p.y) < r * r) {
        if (p.invuln <= 0) {
          p.hit();
          if (!(e instanceof BossEnemy)) {
            e.damage(999);
            this.onEnemyKilled(e);
          }
          if (!p.alive) return;
        }
      }
    }
    /* powerups vs player */
    for (const pu of this.powerups) {
      if (pu.dead) continue;
      if (dist2(pu.x, pu.y, p.x, p.y) < (pu.r + 16) * (pu.r + 16)) {
        pu.dead = true;
        p.activate(pu.type);
        this.audio.powerup();
        const def = POWER_DEFS[pu.type];
        this.particles.ring(pu.x, pu.y, def.color, 16, 200);
        this.particles.text(p.x, p.y - 34, def.name, def.color, 15);
        this.addScore(50);
      }
    }
  }

  /* ---------------- rendering ---------------- */
  drawBackground(ctx) {
    /* sky gradient */
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#0a0322');
    g.addColorStop(0.62, '#12073a');
    g.addColorStop(1, '#2b0a52');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    this.stars.draw(ctx);

    /* retro sun */
    const sunY = VIEW_H - 118;
    const sun = ctx.createLinearGradient(0, sunY - 96, 0, sunY + 30);
    sun.addColorStop(0, '#ffb300');
    sun.addColorStop(0.55, '#ff2bd6');
    sun.addColorStop(1, '#b026ff');
    ctx.save();
    ctx.beginPath();
    ctx.arc(VIEW_W / 2, sunY, 96, 0, TAU);
    ctx.clip();
    ctx.fillStyle = sun;
    ctx.fillRect(VIEW_W / 2 - 100, sunY - 100, 200, 200);
    ctx.fillStyle = '#12073a';
    for (let i = 0; i < 6; i++) {
      const yy = sunY - 34 + i * 14;
      ctx.fillRect(VIEW_W / 2 - 100, yy, 200, 3 + i * 1.4);
    }
    ctx.restore();

    /* perspective grid */
    ctx.save();
    ctx.strokeStyle = 'rgba(255,43,214,0.30)';
    ctx.lineWidth = 1;
    const horizon = VIEW_H - 118;
    for (let i = -10; i <= 10; i++) {
      ctx.beginPath();
      ctx.moveTo(VIEW_W / 2 + i * 46, horizon);
      ctx.lineTo(VIEW_W / 2 + i * 190, VIEW_H);
      ctx.stroke();
    }
    const scroll = (this.time * 42) % 30;
    for (let j = 0; j < 6; j++) {
      const t = (j * 30 + scroll) / 180;
      const yy = horizon + t * t * 118;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(VIEW_W, yy);
      ctx.stroke();
    }
    ctx.restore();

    /* horizon glow line */
    ctx.fillStyle = 'rgba(0,240,255,0.5)';
    ctx.fillRect(0, horizon - 1, VIEW_W, 1.5);
  }

  drawHUD(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(5,2,16,0.55)';
    ctx.fillRect(0, 0, VIEW_W, HUD_H);
    ctx.fillStyle = 'rgba(0,240,255,0.4)';
    ctx.fillRect(0, HUD_H, VIEW_W, 1);

    ctx.font = '15px "Share Tech Mono", monospace';
    ctx.textBaseline = 'middle';

    /* score */
    ctx.textAlign = 'left';
    ctx.fillStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 8;
    ctx.fillText(`SCOR ${this.score}`, 16, 17);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(`BEST ${this.high}`, 16, 35);

    /* wave */
    ctx.textAlign = 'center';
    ctx.fillStyle = '#39ff14';
    ctx.shadowColor = '#39ff14';
    ctx.shadowBlur = 8;
    ctx.fillText(`VAL ${this.wave}${this.isBossWave(this.wave) ? ' • BOSS' : ''}`, VIEW_W / 2, 17);
    ctx.shadowBlur = 0;

    /* combo */
    if (this.comboMult() > 1) {
      ctx.fillStyle = '#ffb300';
      ctx.shadowColor = '#ffb300';
      ctx.shadowBlur = 10;
      ctx.fillText(`COMBO x${this.comboMult()}`, VIEW_W / 2, 35);
      ctx.shadowBlur = 0;
      const barW = 90;
      const frac = clamp(this.comboTimer / 2.6, 0, 1);
      ctx.fillStyle = 'rgba(255,179,0,0.2)';
      ctx.fillRect(VIEW_W / 2 - barW / 2, 43, barW, 3);
      ctx.fillStyle = '#ffb300';
      ctx.fillRect(VIEW_W / 2 - barW / 2, 43, barW * frac, 3);
    }

    /* lives as ship glyphs */
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ff2bd6';
    ctx.shadowColor = '#ff2bd6';
    ctx.shadowBlur = 8;
    let livesStr = '';
    for (let i = 0; i < this.player.lives; i++) livesStr += '▲ ';
    ctx.fillText(livesStr.trim() || '—', VIEW_W - 16, 17);
    ctx.shadowBlur = 0;

    /* dash cooldown pip */
    const dashFrac = 1 - clamp(this.player.dashCd / 1.3, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(VIEW_W - 96, 32, 80, 4);
    ctx.fillStyle = dashFrac >= 1 ? '#00f0ff' : 'rgba(0,240,255,0.5)';
    ctx.fillRect(VIEW_W - 96, 32, 80 * dashFrac, 4);

    /* active power-up timers */
    const t = this.player;
    const active = [
      ['shield', t.shieldTime], ['triple', t.tripleTime], ['laser', t.laserTime], ['speed', t.speedTime],
    ].filter((x) => x[1] > 0);
    let px = VIEW_W - 16;
    ctx.textAlign = 'right';
    ctx.font = '12px "Share Tech Mono", monospace';
    for (const [type, time] of active) {
      const def = POWER_DEFS[type];
      ctx.fillStyle = def.color;
      ctx.shadowColor = def.color;
      ctx.shadowBlur = 6;
      const label = `${def.name} ${time.toFixed(1)}s`;
      ctx.fillText(label, px, 45);
      px -= ctx.measureText(label).width + 14;
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  drawBanner(ctx) {
    if (!this.banner) return;
    const t = this.banner.time;
    const a = clamp(t > 1.5 ? (2.6 - t) * 1.6 : t, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = 'bold 42px "Orbitron", "Share Tech Mono", monospace';
    const isBoss = this.banner.title.includes('BOSS');
    ctx.fillStyle = isBoss ? '#ff2bd6' : '#00f0ff';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 26;
    ctx.fillText(this.banner.title, VIEW_W / 2, VIEW_H / 2 - 60);
    ctx.font = '15px "Share Tech Mono", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.shadowBlur = 8;
    ctx.fillText(this.banner.sub, VIEW_W / 2, VIEW_H / 2 - 28);
    ctx.restore();
  }

  draw(ctx) {
    const sx = this.shake > 0.2 ? rand(-this.shake, this.shake) : 0;
    const sy = this.shake > 0.2 ? rand(-this.shake, this.shake) : 0;

    ctx.save();
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    ctx.translate(sx, sy);

    this.drawBackground(ctx);

    for (const pu of this.powerups) pu.draw(ctx);
    for (const e of this.enemies) e.draw(ctx);
    for (const b of this.playerBullets) b.draw(ctx);
    for (const b of this.enemyBullets) b.draw(ctx);
    if (this.state === STATE.PLAYING || this.state === STATE.PAUSED) this.player.draw(ctx);
    this.particles.draw(ctx);

    ctx.restore();

    this.drawBanner(ctx);
    this.drawHUD(ctx);

    if (this.flashAlpha > 0) {
      ctx.fillStyle = `rgba(255,60,110,${this.flashAlpha * 0.55})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    if (this.state === STATE.MENU) {
      /* idle demo: drifting particles for the menu backdrop */
      if (Math.random() < 0.12) {
        this.particles.trail(rand(0, VIEW_W), rand(HUD_H, VIEW_H), pick(['#00f0ff', '#ff2bd6', '#b026ff']));
      }
    }
  }
}

/* helper for chaining in boss escort layout */
Enemy.prototype.atY = function (y) { this.homeY = y; return this; };
/* ------------------------------------------------------------------ */
/* UI wiring + main loop                                               */
/* ------------------------------------------------------------------ */
const TouchControls = {
  isTouch: false,
  box: null,
  init(game) {
    this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    this.box = document.getElementById('touch-controls');
    if (!this.isTouch) {
      this.box.classList.add('hidden');
      return;
    }
    const hold = (id, key) => {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic event */ }
        el.classList.add('pressed');
        Input.vpress(key);
      });
      const up = () => { el.classList.remove('pressed'); Input.vrelease(key); };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
    };
    hold('tc-left', 'arrowleft');
    hold('tc-right', 'arrowright');
    hold('tc-fire', ' ');
    const tap = (id, fn) => {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.classList.add('pressed');
        fn();
      });
      const up = () => el.classList.remove('pressed');
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
    };
    tap('tc-dash', () => Input.pressed.add('shift'));
    tap('tc-pause', () => {
      if (game.state === STATE.PLAYING || game.state === STATE.PAUSED) game.togglePause();
    });
    tap('tc-mute', () => this.toggleMute(game));
  },
  toggleMute(game) {
    const m = !game.audio.muted;
    game.audio.setMuted(m);
    document.getElementById('mute-badge').classList.toggle('hidden', !m);
  },
  sync(game) {
    if (!this.isTouch) return;
    const show = game.state === STATE.PLAYING || game.state === STATE.PAUSED;
    this.box.classList.toggle('hidden', !show);
  },
};

const UI = {
  els: {},
  game: null,
  init(game) {
    this.game = game;
    const id = (s) => document.getElementById(s);
    this.els = {
      overlay: id('overlay'),
      start: id('screen-start'),
      over: id('screen-over'),
      pause: id('pause-badge'),
      mute: id('mute-badge'),
      hsStart: id('hs-start'),
      finalScore: id('final-score'),
      finalWave: id('final-wave'),
      finalCombo: id('final-combo'),
      newRecord: id('new-record'),
      btnStart: id('btn-start'),
      btnRestart: id('btn-restart'),
      btnMenu: id('btn-menu'),
    };
    this.els.btnStart.addEventListener('click', () => this.game.startRun());
    this.els.btnRestart.addEventListener('click', () => this.game.startRun());
    this.els.btnMenu.addEventListener('click', () => this.game.toMenu());
    TouchControls.init(game);
    this.refreshHigh(game.high);
    this.showScreen('start');

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'm') {
        const m = !game.audio.muted;
        game.audio.setMuted(m);
        this.els.mute.classList.toggle('hidden', !m);
      }
      if (k === 'p' || k === 'escape') {
        if (game.state === STATE.PLAYING || game.state === STATE.PAUSED) game.togglePause();
      }
      if (k === 'enter') {
        if (game.state === STATE.MENU) this.game.startRun();
        else if (game.state === STATE.GAMEOVER) this.game.startRun();
      }
    });
  },
  showScreen(which) {
    this.els.start.classList.toggle('hidden', which !== 'start');
    this.els.over.classList.toggle('hidden', which !== 'over');
    this.els.overlay.classList.toggle('hidden', which === 'none');
  },
  refreshHigh(v) { this.els.hsStart.textContent = String(v); },
  showGameOver(game) {
    this.els.finalScore.textContent = String(game.score);
    this.els.finalWave.textContent = String(game.wave);
    this.els.finalCombo.textContent = `x${game.maxCombo}`;
    this.els.newRecord.classList.toggle('hidden', !game.newRecord);
    this.refreshHigh(game.high);
    this.showScreen('over');
  },
  syncPause(game) {
    this.els.pause.classList.toggle('hidden', game.state !== STATE.PAUSED);
  },
};

/* canvas scaling: keep internal 960x600, fit viewport via CSS */
function fitCanvas(canvas) {
  /* pin the shell to the real visible viewport: innerHeight excludes the
     Android toolbar, unlike 100vh/dvh edge cases */
  const shell = document.querySelector('.game-shell');
  if (shell) shell.style.height = `${window.innerHeight}px`;
  const stage = canvas.parentElement;
  const availW = stage.clientWidth * 0.98;
  const availH = stage.clientHeight * 0.98;
  const scale = Math.min(availW / VIEW_W, availH / VIEW_H);
  canvas.style.width = `${Math.floor(VIEW_W * scale)}px`;
  canvas.style.height = `${Math.floor(VIEW_H * scale)}px`;
}

let lastTime = 0;
function frame(now) {
  const game = window.__game;
  const dt = clamp((now - lastTime) / 1000, 0.0001, 1 / 30);
  lastTime = now;
  game.update(dt);
  game.draw(game.ctx);
  UI.syncPause(game);
  TouchControls.sync(game);
  Input.endFrame();
  requestAnimationFrame(frame);
}

window.addEventListener('DOMContentLoaded', () => {
  Input.init();
  const canvas = document.getElementById('game');
  const game = new Game(canvas);
  UI.init(game);
  fitCanvas(canvas);
  window.addEventListener('resize', () => fitCanvas(canvas));
  lastTime = performance.now();
  requestAnimationFrame(frame);
});
