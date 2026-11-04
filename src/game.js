/*
 * TIDEBREAKER — dự án eyerim
 * Game hành động 2D trên trình duyệt: hai phi công cùng điều khiển một Titan-Frame
 * để chặn quái vật Abyssal trước khi chúng san phẳng thành phố ven biển.
 * Không dùng thư viện ngoài — mở index.html là chơi được.
 */
(() => {
  'use strict';

  // ============================================================ HẰNG SỐ
  const W = 1280;
  const H = 720;
  const GROUND = 610;
  const WORLD_W = 3400;
  const CITY_END = 2330;
  const SHORE_X = 2760;
  // Thu nhỏ đều toàn bộ Titan (giữ nguyên tỷ lệ) để thấp hơn quái vật một chút.
  const TITAN_SCALE = 0.64;
  const TITAN_HALF = Math.round(55 * TITAN_SCALE);
  // Chiều cao Titan (từ chân tới đỉnh đầu, toạ độ gốc 450px) và tầm chắc trúng của chiêu I = 2 lần chiều cao.
  const TITAN_HEIGHT = 450 * TITAN_SCALE;
  const SPECIAL_RANGE = 2 * TITAN_HEIGHT;
  // Nâng phần thân trên để chân dài ra: chân ≈ 55% chiều cao Titan.
  const BODY_LIFT = 66;
  const CHARGE_TIME = 2.4; // giây để nạp đầy vũ khí L (pháo plasma / tên lửa)
  const CHARGE_LOCK = 0.8; // phải nạp tối thiểu chừng này giây mới bắn được
  const CHARGE_MIN = 15; // năng lượng tốn ngay khi bắt đầu nạp
  const CHARGE_MAX = 50; // tổng năng lượng khi nạp đầy
  const REGEN_DELAY = 1.2;
  const JET_REACH = 560; // quái trong khoảng này thì cú đấm phản lực chắc chắn trúng // năng lượng ngừng hồi sau khi tiêu
  const SYNC_WINDOW = 0.16;
  const PHASE2_SPEED = 1.35;
  const BLOCK_COST = 10; // năng lượng tốn mỗi lần đỡ đòn
  const LOSE_CITY = 0.4;
  const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
  const PI2 = Math.PI * 2;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  canvas.width = W;
  canvas.height = H;
  function fit() {
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = Math.floor(W * s) + 'px';
    canvas.style.height = Math.floor(H * s) + 'px';
  }
  window.addEventListener('resize', fit);
  fit();

  // ============================================================ TIỆN ÍCH
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIn = (t) => t * t * t;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function seeded(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.round(clamp(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt, 0, 255));
    return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  function ellipse(x, y, rx, ry, rot = 0) {
    ctx.beginPath();
    // bán kính âm làm canvas thật ném lỗi và dừng cả vòng lặp game → luôn chặn về ≥ 0
    ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot, 0, PI2);
  }

  // ============================================================ BÀN PHÍM
  const down = new Set();
  const pressed = new Set();
  const NO_SCROLL = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  window.addEventListener('keydown', (e) => {
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
    if (NO_SCROLL.has(e.code)) e.preventDefault();
    sfx.unlock();
  });
  window.addEventListener('keyup', (e) => down.delete(e.code));
  window.addEventListener('blur', () => down.clear());
  const held = (c) => down.has(c);
  const tap = (c) => pressed.has(c);
  const tapAny = (...cs) => cs.some(tap);

  // ============================================================ ÂM THANH (tổng hợp bằng WebAudio)
  const sfx = {
    ac: null,
    out: null,
    muted: false,
    unlock() {
      if (this.ac) {
        if (this.ac.state === 'suspended') this.ac.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      this.out = this.ac.createGain();
      this.out.gain.value = 0.45;
      this.out.connect(this.ac.destination);
    },
    tone(f, dur, type = 'square', vol = 0.15, slideTo = null, delay = 0) {
      if (!this.ac || this.muted) return;
      const t = this.ac.currentTime + delay;
      const o = this.ac.createOscillator();
      const g = this.ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(this.out);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
    noise(dur, vol = 0.2, freq = 800, delay = 0) {
      if (!this.ac || this.muted) return;
      const t = this.ac.currentTime + delay;
      const n = Math.max(1, Math.floor(this.ac.sampleRate * dur));
      const buf = this.ac.createBuffer(1, n, this.ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = this.ac.createBufferSource();
      src.buffer = buf;
      const f = this.ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = freq;
      const g = this.ac.createGain();
      g.gain.value = vol;
      src.connect(f);
      f.connect(g);
      g.connect(this.out);
      src.start(t);
    },
    punch() { this.noise(0.18, 0.35, 700); this.tone(95, 0.15, 'sine', 0.3, 40); },
    heavy() { this.noise(0.4, 0.5, 450); this.tone(65, 0.4, 'sawtooth', 0.22, 25); },
    whiff() { this.noise(0.12, 0.08, 1800); },
    swing() { this.noise(0.25, 0.12, 900); },
    sync() { this.tone(660, 0.12, 'square', 0.08); this.tone(990, 0.18, 'square', 0.08, null, 0.06); },
    counter() { this.tone(520, 0.1, 'square', 0.1); this.tone(780, 0.1, 'square', 0.1, null, 0.07); this.tone(1170, 0.2, 'square', 0.1, null, 0.14); },
    block() { this.tone(320, 0.08, 'square', 0.1, 200); this.noise(0.08, 0.15, 2400); },
    hurt() { this.noise(0.45, 0.5, 350); this.tone(140, 0.4, 'sawtooth', 0.15, 50); },
    roar() { this.tone(110, 1.2, 'sawtooth', 0.22, 45); this.tone(83, 1.3, 'square', 0.08, 40); this.noise(1.2, 0.3, 300); },
    warn() { this.tone(440, 0.09, 'triangle', 0.1); },
    spit() { this.noise(0.3, 0.2, 1200); this.tone(300, 0.3, 'sine', 0.1, 120); },
    cannon() {},
    cannonShot(lv) { this.tone(900 - 500 * lv, 0.25 + 0.4 * lv, 'sawtooth', 0.1 + 0.08 * lv, 80); this.noise(0.15 + 0.5 * lv, 0.2 + 0.3 * lv, 3000 - 2000 * lv); },
    jetIgnite() { this.noise(0.5, 0.25, 900); this.tone(90, 0.5, 'sawtooth', 0.08, 260); },
    satCall() { [0, 0.12, 0.24].forEach((d) => this.tone(1400, 0.07, 'square', 0.06, null, d)); },
    satIncoming() { this.tone(2200, 0.5, 'sine', 0.05, 500); },
    jetBoom() { this.noise(0.7, 0.5, 1400); this.tone(70, 0.5, 'sawtooth', 0.2, 30); },
    chargeStart() { this.tone(180, CHARGE_TIME, 'sawtooth', 0.05, 1100); },
    chargeFull() { this.tone(1320, 0.12, 'square', 0.07); this.tone(1760, 0.2, 'square', 0.07, null, 0.08); },
    dash() { this.tone(180, 0.25, 'sawtooth', 0.08, 600); this.noise(0.3, 0.2, 1500); },
    collapse() { this.noise(1.5, 0.45, 260); this.tone(50, 1.2, 'sine', 0.2, 30); },
    beam() { this.tone(200, 1.5, 'sawtooth', 0.18, 900); this.noise(1.5, 0.25, 1600); },
    thunder() { this.noise(2.2, 0.35, 180, 0.3); },
    cheer() {
      // tiếng hò reo của đám đông: nhiễu lọc dải giữa, to dần rồi tắt
      if (!this.ac || this.muted) return;
      for (let i = 0; i < 3; i++) this.noise(2.6, 0.18, 600 + i * 500, 0.7 + i * 0.05);
      this.tone(392, 0.25, 'square', 0.07, null, 0.75);
      this.tone(523, 0.25, 'square', 0.07, null, 0.95);
      this.tone(659, 0.6, 'square', 0.07, null, 1.15);
    },
    buy() { this.tone(520, 0.08, 'square', 0.08); this.tone(780, 0.12, 'square', 0.08, null, 0.07); },
    deny() { this.tone(160, 0.15, 'square', 0.08); },
  };

  // ============================================================ NHẠC NỀN (sáng tác riêng, tổng hợp bằng WebAudio)
  // Rock giao hưởng 132 BPM, Mi thứ, vòng Em – C – G – D. Bốn tầng cường độ tự đổi theo trận đấu:
  // 0 pad · 1 + trống nhẹ & bass · 2 + snare & guitar power chord · 3 + giai điệu lead & crash.
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const SONG = {
    bpm: 132,
    chords: [
      { bass: 40, pad: [64, 67, 71] }, // Em
      { bass: 36, pad: [60, 64, 67] }, // C
      { bass: 43, pad: [62, 67, 71] }, // G
      { bass: 38, pad: [62, 66, 69] }, // D
    ],
    // [bước 16 trong ô nhịp, nốt MIDI, độ dài tính bằng bước]
    melody: [
      [[0, 71, 3], [3, 76, 3], [6, 79, 2], [8, 78, 2], [10, 76, 2], [12, 74, 4]],
      [[0, 72, 3], [3, 76, 3], [6, 79, 4], [10, 81, 2], [12, 79, 4]],
      [[0, 83, 4], [4, 81, 2], [6, 79, 2], [8, 74, 4], [12, 79, 4]],
      [[0, 78, 6], [6, 76, 2], [8, 74, 2], [10, 76, 6]],
    ],
    gallop: new Set([0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15]),
  };

  // Nhạc của người chơi: đặt file vào music/theme.mp3 (hoặc .ogg/.m4a), hoặc kéo thả file vào cửa sổ game.
  // Có file thì game chơi file đó thay cho nhạc tổng hợp.
  const userTrack = {
    audio: null,
    ok: false,
    name: '',
    tries: ['music/theme.mp3', 'music/theme.ogg', 'music/theme.m4a'],
    init() {
      if (typeof Audio === 'undefined') return;
      this.audio = new Audio();
      this.audio.loop = true;
      this.audio.preload = 'auto';
      this.audio.addEventListener('canplay', () => {
        this.ok = true;
        if (sfx.ac) this.audio.play().catch(() => {});
      });
      this.audio.addEventListener('error', () => {
        if (this.name) return;
        const next = this.tries.shift();
        if (next) this.audio.src = next;
      });
      this.audio.src = this.tries.shift();
    },
    load(file) {
      if (!this.audio) return;
      this.name = file.name;
      this.ok = false;
      this.audio.src = URL.createObjectURL(file);
      this.audio.play().catch(() => {});
      floatText(game.titan ? game.titan.x : W / 2, GROUND - (420 + BODY_LIFT) * TITAN_SCALE, '♪ ' + file.name, '#7ff6ff', 20);
    },
    update() {
      if (!this.audio || !this.ok) return;
      const vol = sfx.muted ? 0 : game.state === 'paused' ? 0.25 : game.state === 'fight' ? 0.85 : 0.6;
      this.audio.volume += (vol - this.audio.volume) * 0.1;
      if (this.audio.paused && sfx.ac && !sfx.muted) this.audio.play().catch(() => {});
    },
  };
  userTrack.init();
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && /^audio\//.test(f.type)) {
      sfx.unlock();
      userTrack.load(f);
    }
  });

  const music = {
    ready: false,
    step: 0,
    nextT: 0,
    level: 0,
    init() {
      const ac = sfx.ac;
      if (!ac || this.ready) return;
      this.ready = true;
      this.bus = ac.createGain();
      this.bus.gain.value = 0;
      this.bus.connect(ac.destination);
      // guitar: méo tiếng bằng waveshaper rồi lọc bớt dải cao
      this.dist = ac.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / curve.length) * 2 - 1) * 7);
      this.dist.curve = curve;
      const gf = ac.createBiquadFilter();
      gf.type = 'lowpass';
      gf.frequency.value = 2400;
      const gg = ac.createGain();
      gg.gain.value = 0.16;
      this.dist.connect(gf);
      gf.connect(gg);
      gg.connect(this.bus);
      // lead: có delay vọng
      this.leadIn = ac.createGain();
      this.leadIn.gain.value = 1;
      const dl = ac.createDelay(1);
      dl.delayTime.value = (60 / SONG.bpm) * 0.75;
      const fb = ac.createGain();
      fb.gain.value = 0.28;
      this.leadIn.connect(this.bus);
      this.leadIn.connect(dl);
      dl.connect(fb);
      fb.connect(dl);
      dl.connect(this.bus);
      // nhiễu trắng dùng chung cho trống
      const n = ac.sampleRate;
      this.noiseBuf = ac.createBuffer(1, n, n);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.nextT = ac.currentTime + 0.1;
    },
    targetLevel() {
      const T = game.titan;
      const K = game.kaiju;
      switch (game.state) {
        case 'fight':
          if (game.beam || (K && K.phase2 && !K.dying) || (T && T.link >= 100)) return 3;
          return 2;
        case 'paused':
        case 'gameover':
          return 0;
        default:
          return 1;
      }
    },
    update() {
      if (!sfx.ac) return;
      this.init();
      const ac = sfx.ac;
      userTrack.update();
      const vol = sfx.muted || userTrack.ok ? 0 : game.state === 'paused' ? 0.12 : 0.3;
      this.bus.gain.setTargetAtTime(vol, ac.currentTime, 0.15);
      if (this.nextT < ac.currentTime - 0.3) this.nextT = ac.currentTime + 0.05; // tab bị ẩn → bắt nhịp lại
      const spb = 60 / SONG.bpm / 4;
      while (this.nextT < ac.currentTime + 0.12) {
        this.play(this.step, this.nextT, spb);
        this.nextT += spb;
        this.step++;
      }
    },
    note(t, midi, dur, o = {}) {
      const ac = sfx.ac;
      const osc = ac.createOscillator();
      osc.type = o.type || 'sawtooth';
      osc.frequency.value = mtof(midi);
      if (o.detune) osc.detune.value = o.detune;
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.cutoff || 2000;
      const g = ac.createGain();
      const vol = o.vol || 0.1;
      const att = o.attack || 0.005;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + att);
      g.gain.setValueAtTime(vol, t + Math.max(att, dur * 0.7));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(f);
      f.connect(g);
      g.connect(o.dest || this.bus);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    },
    hit(t, dur, vol, type, freq) {
      const ac = sfx.ac;
      const src = ac.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ac.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f);
      f.connect(g);
      g.connect(this.bus);
      src.start(t, Math.random() * 0.5, dur + 0.05);
    },
    kick(t, vol = 0.9) {
      const ac = sfx.ac;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      o.connect(g);
      g.connect(this.bus);
      o.start(t);
      o.stop(t + 0.35);
    },
    tom(t, f0) {
      const ac = sfx.ac;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.25);
      g.gain.setValueAtTime(0.6, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g);
      g.connect(this.bus);
      o.start(t);
      o.stop(t + 0.32);
    },
    play(step, t, spb) {
      const s = step % 16;
      const bar = Math.floor(step / 16);
      const loopBar = bar % 8;
      const ch = SONG.chords[loopBar % 4];
      const sectionA = loopBar < 4;
      if (s === 0) this.level = this.targetLevel();
      const L = this.level;
      const barDur = spb * 16;

      // pad hợp âm
      if (s === 0) {
        for (const m of ch.pad) {
          this.note(t, m, barDur, { type: 'sawtooth', vol: 0.022, cutoff: L >= 2 ? 1400 : 800, attack: 0.25, detune: -6 });
          this.note(t, m - 12, barDur, { type: 'triangle', vol: 0.03, cutoff: 1200, attack: 0.25 });
        }
      }
      if (L >= 1) {
        if (s === 0 || s === 8 || (L >= 2 && (s === 10 || s === 3))) this.kick(t, L >= 2 ? 0.9 : 0.55);
        if (s % 2 === 0) this.hit(t, 0.04, L >= 2 ? 0.09 : 0.05, 'highpass', 7500);
        if (s % 2 === 0) this.note(t, ch.bass, spb * 1.8, { type: 'sawtooth', vol: 0.12, cutoff: 500 });
      }
      if (L >= 2) {
        if (s === 4 || s === 12) {
          this.hit(t, 0.2, 0.45, 'bandpass', 1800);
          this.note(t, 55, 0.08, { type: 'triangle', vol: 0.15, cutoff: 3000 });
        }
        if (SONG.gallop.has(s)) {
          const accent = s % 4 === 0;
          const len = accent ? spb * 1.6 : spb * 0.8;
          const root = ch.bass + 12;
          for (const iv of [0, 7, 12]) this.note(t, root + iv, len, { type: 'sawtooth', vol: accent ? 0.2 : 0.13, cutoff: 4000, dest: this.dist, detune: iv === 12 ? 7 : 0 });
        }
        // trống dồn cuối đoạn B
        if (!sectionA && loopBar === 7 && s >= 12) this.tom(t, [180, 150, 120, 95][s - 12]);
      }
      if ((L >= 2 && sectionA) || L >= 3) {
        const mel = SONG.melody[loopBar % 4];
        for (const [st, m, len] of mel) {
          if (st !== s) continue;
          const dur = len * spb;
          this.note(t, m, dur, { type: 'sawtooth', vol: 0.07, cutoff: 3200, attack: 0.02, detune: -8, dest: this.leadIn });
          this.note(t, m, dur, { type: 'sawtooth', vol: 0.07, cutoff: 3200, attack: 0.02, detune: 8, dest: this.leadIn });
          if (L >= 3) this.note(t, m - 12, dur, { type: 'square', vol: 0.04, cutoff: 1800, attack: 0.02, dest: this.leadIn });
        }
      }
      if (L >= 3 && s === 0 && loopBar % 4 === 0) this.hit(t, 1.4, 0.18, 'highpass', 4500);
    },
  };

  // ============================================================ HIỆU ỨNG
  const fx = { particles: [], texts: [], rings: [], shake: 0, flash: 0, hitstop: 0 };

  function burst(x, y, n, color, speed = 300, life = 0.6, size = 4, grav = 600, dust = false) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * PI2;
      const s = speed * (0.3 + Math.random() * 0.7);
      fx.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - speed * 0.25,
        life: life * (0.6 + Math.random() * 0.4),
        max: life,
        color, size, grav, dust,
      });
    }
    if (fx.particles.length > 1000) fx.particles.splice(0, fx.particles.length - 1000);
  }

  function floatText(x, y, str, color = '#fff', size = 24, life = 1.1) {
    fx.texts.push({ x, y, str, color, size, life });
  }

  function shake(a) {
    fx.shake = Math.max(fx.shake, a);
  }

  // ============================================================ DỮ LIỆU GAME
  // Đòn của Titan. arm L = phi công 1, arm R = phi công 2.
  const TMOVES = {
    jab: { arm: 'L', windup: 0.07, active: 0.08, recover: 0.16, dmg: 6, range: 170, kb: 140 },
    hook: { arm: 'R', windup: 0.1, active: 0.08, recover: 0.22, dmg: 9, range: 175, kb: 200 },
    blade: { arm: 'R', windup: 0.32, active: 0.2, recover: 0.42, dmg: 24, range: 320, kb: 440, heavy: true },
    cannon: { arm: 'R', windup: 0.06, active: 0.08, recover: 0.34, projectile: true },
    // Cú đấm phản lực: động cơ ở khuỷu tay mồi lửa rồi phóng cả Titan lao tới.
    // Phím I: bấm 1 lần là tụ chiêu (windup 1s); bị trúng đòn trong lúc tụ thì mất chiêu.
    jet: { arm: 'R', windup: 1.0, active: 0.18, recover: 0.5, dmg: 34, range: 330, kb: 150, heavy: true, energy: 25 },
  };

  // Các Titan có thể chọn. Cả hai đều là thiết kế riêng của game.
  // stats: điểm 1–5 chỉ để hiển thị trên màn hình chọn.
  // moves: đòn thay thế cho ô K (blade) và L (cannon) của Titan đó.
  const TITANS = [
    {
      id: 'vanguard', name: 'EYERIM VANGUARD', role: 'CHIẾN ĐẤU TRỰC DIỆN · GIÁP NẶNG',
      desc: 'Khung giáp trắng-thép bền bỉ. Kiếm xích tầm xa và pháo plasma nạp lực.',
      hp: 150, speed: 270, power: 1, quick: 1, regen: 1,
      stats: { armor: 5, speed: 3, power: 4, energy: 3 },
      weapons: [['I', 'Đấm phản lực — lao tới, chắc trúng'], ['K', 'Kiếm xích — chém nặng, tầm xa'], ['L', 'Pháo plasma — giữ để nạp, thả để bắn']],
      special: 'jetpunch',
      ult: 'reactor', ultName: 'XUNG LÒ PHẢN ỨNG',
      head: 'visor', missiles: false, wristBlades: false,
      pal: {
        front: { hi: '#f2f5f8', armor: '#c9d1db', lo: '#7d8a99', frame: '#262f3a', frameHi: '#3d4958', accent: '#ff8a1f', line: 'rgba(8,14,22,0.6)' },
        back: { hi: '#9aa5b2', armor: '#76828f', lo: '#4c5663', frame: '#161c24', frameHi: '#252e39', accent: '#a65a17', line: 'rgba(4,7,10,0.6)' },
      },
      moves: {},
    },
    {
      id: 'tempest', name: 'EYERIM TEMPEST', role: 'TẤN CÔNG CHỚP NHOÁNG · CƠ ĐỘNG',
      desc: 'Khung giáp đỏ thẫm nhẹ và nhanh. Lưỡi kép ở cổ tay, ngực là bệ phóng 6 tên lửa.',
      hp: 115, speed: 340, power: 0.9, quick: 0.75, regen: 1.3,
      stats: { armor: 3, speed: 5, power: 3, energy: 5 },
      weapons: [['I', 'Đập phản lực — bay lên, nện xuống đầu quái'], ['K', 'Lưỡi kép cổ tay — chém nhanh, choáng'], ['L', '6 tên lửa — giữ đủ 2s mới phóng, nạp lại 4,5s']],
      special: 'leap',
      ult: 'orbital', ultName: 'MƯA TÊN LỬA VỆ TINH',
      head: 'sensor', missiles: true, wristBlades: true,
      pal: {
        front: { hi: '#e7a3a0', armor: '#a8343a', lo: '#5e1a20', frame: '#1d2024', frameHi: '#353a41', accent: '#5dffb0', line: 'rgba(16,6,8,0.6)' },
        back: { hi: '#8f5457', armor: '#6a2228', lo: '#3a1014', frame: '#121417', frameHi: '#22262b', accent: '#2f9a6a', line: 'rgba(8,3,4,0.6)' },
      },
      moves: {
        blade: { arm: 'R', windup: 0.16, active: 0.14, recover: 0.26, dmg: 17, range: 240, kb: 300, heavy: true },
        // tên lửa: mở nắp + khóa mục tiêu lâu, hồi lâu (đòn mạnh nên phải trả giá bằng thời gian)
        cannon: { arm: 'R', windup: 0.4, active: 0.1, recover: 0.8, projectile: true },
        // đập phản lực: gồng → bay lên → nện xuống đầu quái (tay bận suốt cú nhảy)
        jet: { arm: 'R', windup: 1.0, active: 0.2, recover: 0.7, dmg: 36, range: 330, kb: 150, heavy: true, energy: 25 },
      },
    },
  ];
  const STRIKE_DELAY = 0.9; // TEMPEST (chiêu đặc biệt): giây từ lúc khóa tới khi mỗi tên lửa vệ tinh rơi trúng
  const LEAP = { up: 0.34, smash: 0.14, fall: 0.32 }; // TEMPEST: thời lượng các pha đập phản lực
  const MISSILE_CHARGE = 2.0; // TEMPEST: giữ L đủ chừng này giây mới phóng được (thả sớm = hủy)
  const LINK_HOLD = 5; // giây Link được khóa ở 100% để kịp tung chiêu đặc biệt
  const MISSILE_RELOAD = 4.5; // giây để nạp lại đủ 6 tên lửa sau mỗi loạt
  const curDef = () => TITANS[game.titanIdx] || TITANS[0];
  const tmove = (T, name) => (T.def.moves[name] || TMOVES[name]);

  // Đòn của quái vật Abyssal.
  const KMOVES = {
    claw: { windup: 0.48, active: 0.15, recover: 0.42, range: 200, dmg: 17, kb: 320, minD: 0, maxD: 270, weight: 3 },
    tail: { windup: 0.6, active: 0.2, recover: 0.5, range: 300, dmg: 14, kb: 420, minD: 0, maxD: 330, weight: 2 },
    spit: { windup: 0.56, active: 0.1, recover: 0.5, dmg: 13, minD: 300, maxD: 1200, weight: 2 },
    charge: { windup: 0.75, active: 0.75, recover: 0.85, dmg: 26, kb: 650, minD: 350, maxD: 1000, weight: 2, unblockable: true },
    roar: { windup: 0.85, active: 0.3, recover: 0.7, range: 520, dmg: 9, kb: 250, minD: 0, maxD: 500, weight: 1, linkDrain: 20 },
  };
  const MOVE_LABEL = {
    claw: 'VUỐT',
    tail: 'QUẬT ĐUÔI',
    spit: 'PHUN AXIT',
    charge: 'LAO HÚC — KHÔNG ĐỠ ĐƯỢC',
    roar: 'GẦM — HÚT LINK',
  };

  const WAVES = [
    { cat: 'CẤP I', name: 'BRINECRAWLER', hp: 520, scale: 1.15, speed: 110, color: '#2d6b5e', glow: '#6dffcf', moves: ['claw', 'tail'], aggression: 1.15, combo: 0.2, district: 'Cảng Hải Đăng' },
    { cat: 'CẤP II', name: 'GORGEMAW', hp: 760, scale: 1.3, speed: 130, color: '#5b3a6e', glow: '#ff7bf2', moves: ['claw', 'tail', 'spit', 'charge'], aggression: 1.3, combo: 0.4, district: 'Quận Kính' },
    { cat: 'CẤP III', name: 'LEVIATHRAX', hp: 1050, scale: 1.45, speed: 145, color: '#6e2a2a', glow: '#ffb347', moves: ['claw', 'tail', 'spit', 'charge', 'roar'], aggression: 1.45, combo: 0.6, district: 'Trung tâm Thái Bình' },
  ];
  for (const w of WAVES) {
    w.dark = shade(w.color, -0.4);
    w.belly = shade(w.color, 0.18);
    w.plate = shade(w.color, -0.22);
    w.rim = shade(w.color, 0.32);
    w.flashPal = { body: shade(w.color, 0.55), dark: shade(w.color, 0.25), belly: shade(w.color, 0.7), plate: shade(w.color, 0.4), rim: '#ffffff' };
  }

  const UPGRADES = [
    { id: 'armor', name: 'Giáp hợp kim', desc: '+30 HP tối đa cho Titan', cost: 40 },
    { id: 'reactor', name: 'Lò phản ứng', desc: '+35% tốc độ hồi năng lượng', cost: 35 },
    { id: 'blade', name: 'Lõi plasma', desc: '+25% sát thương vũ khí hạng nặng (K, L) và TIDEBREAKER', cost: 45 },
    { id: 'neural', name: 'Bộ khuếch đại Link', desc: 'Cửa sổ đồng bộ rộng hơn, Link giảm chậm hơn', cost: 40 },
  ];
  const UPGRADE_MAX = 3;
  const upgradeCost = (u) => u.cost + game.upgrades[u.id] * 20;

  const game = {
    state: 'title',
    titanIdx: 0,
    pick: 0,
    t: 0,
    stateT: 0,
    wave: 0,
    scrap: 0,
    upgrades: { armor: 0, reactor: 0, blade: 0, neural: 0 },
    titan: null,
    kaiju: null,
    buildings: [],
    projectiles: [],
    strikes: [],
    barrage: null,
    beam: null,
    cam: 0,
    showHelp: false,
    helpT: 0,
    bannerT: 0,
    waveTime: 0,
    lightning: 0,
    result: null,
    reason: '',
  };

  function mods() {
    const u = game.upgrades;
    return {
      blade: 1 + 0.25 * u.blade,
      regen: 7 * (1 + 0.35 * u.reactor) * curDef().regen,
      sync: SYNC_WINDOW + 0.05 * u.neural,
      decay: Math.max(0.3, 1.5 - 0.35 * u.neural),
    };
  }

  // ============================================================ TẠO ĐỐI TƯỢNG
  function makeTitan(def = curDef()) {
    const maxHp = def.hp + game.upgrades.armor * 30;
    return {
      def,
      x: 2200, vx: 0, facing: 1, missileCD: 0, leap: null, leapHits: 0,
      hp: maxHp, maxHp, ghost: maxHp,
      energy: 100, link: 60,
      guard: false, moving: false,
      dashT: 0, inv: 0, stagger: 0, hitFlash: 0, walkT: 0, muzzle: 0,
      p1Flash: 0, p2Flash: 0,
      arms: { L: null, R: null },
      syncPending: null, syncCount: 0,
      charge: null, regenDelay: 0, linkHold: 0, slide: null,
      beaming: false,
      celebrate: null, airY: 0,
    };
  }

  function makeKaiju(def) {
    return {
      def,
      x: 3170, y: 340, vx: 0, facing: -1,
      hp: def.hp, maxHp: def.hp, ghost: def.hp,
      state: 'emerge', t: 0, move: null, lastMove: null,
      stunDur: 0, poiseT: 0, hitFlash: 0, cooldown: 1, walkT: 0, swipe: 0,
      half: 130 * def.scale,
      phase2: false, dying: false, deathT: 0,
      target: null, smashT: 0, chargeHit: false, dodged: false,
    };
  }

  const BUILDING_COLORS = ['#121c2b', '#162236', '#0f1825', '#1a2638', '#141f30'];
  function makeCity(seed) {
    const r = seeded(seed);
    const list = [];
    let x = 120;
    while (x < CITY_END - 80) {
      const w = Math.floor(80 + r() * 110);
      const h = Math.floor(170 + r() * 290);
      const windows = [];
      for (let wy = 14; wy < h - 24; wy += 22) {
        for (let wx = 8; wx < w - 12; wx += 16) {
          if (r() < 0.38) windows.push({ x: wx, y: wy, c: r() < 0.75 ? '#ffd58a' : '#9fd8ff', k: r() });
        }
      }
      const cracks = [];
      for (let i = 0; i < 3; i++) {
        const pts = [[r() * w, r() * h * 0.5]];
        for (let j = 0; j < 4; j++) {
          const last = pts[pts.length - 1];
          pts.push([clamp(last[0] + (r() - 0.5) * 40, 0, w), last[1] + 20 + r() * 40]);
        }
        cracks.push(pts);
      }
      const rubble = [];
      for (let i = 0; i <= 8; i++) rubble.push(0.4 + r() * 0.6);
      list.push({
        x, w, h, hp: 100, maxHp: 100,
        color: BUILDING_COLORS[Math.floor(r() * BUILDING_COLORS.length)],
        windows, cracks, rubble,
        antenna: h > 380,
        tilt: (r() - 0.5) * 0.35,
        fallen: false, collapse: 0, hitT: -9,
      });
      x += w + Math.floor(10 + r() * 40);
    }
    return list;
  }

  // Thành phố xa (parallax), tạo một lần.
  const farLayers = [0.22, 0.45].map((par, li) => {
    const r = seeded(77 + li * 31);
    const arr = [];
    let x = -200;
    while (x < WORLD_W * par + W + 400) {
      const w = 40 + r() * 90;
      const h = (li ? 110 : 200) + r() * (li ? 170 : 160);
      const wins = [];
      for (let i = 0; i < 12; i++) if (r() < 0.7) wins.push([r() * (w - 4), r() * (h - 10)]);
      arr.push({ x, w, h, wins });
      x += w + r() * 20 - 5;
    }
    return {
      par, arr,
      color: li ? '#0d1a2b' : '#08111e',
      win: li ? 'rgba(255,210,140,0.35)' : 'rgba(150,200,255,0.22)',
    };
  });

  const rain = [];
  for (let i = 0; i < 260; i++) rain.push({ x: Math.random() * (W + 200), y: Math.random() * H, l: rand(12, 26), s: rand(0.7, 1.2) });

  // ============================================================ THÀNH PHỐ
  function buildingAt(x) {
    for (const b of game.buildings) if (!b.fallen && x >= b.x && x <= b.x + b.w) return b;
    return null;
  }

  function damageBuilding(b, amt) {
    if (!b || b.fallen) return;
    b.hp -= amt;
    burst(b.x + b.w / 2, GROUND - b.h * rand(0.3, 0.9), 10, '#8c93a3', 220, 1, 6, 200, true);
    if (b.hp <= 0) {
      b.hp = 0;
      b.fallen = true;
      b.collapse = 0;
      sfx.collapse();
      shake(9);
      floatText(b.x + b.w / 2, GROUND - b.h - 20, 'TÒA NHÀ SỤP ĐỔ!', '#ff6b5e', 22);
    }
  }

  function cityIntegrity() {
    let hp = 0;
    let max = 0;
    for (const b of game.buildings) {
      hp += Math.max(0, b.hp);
      max += b.maxHp;
    }
    return max ? hp / max : 1;
  }

  // ============================================================ ĐIỀU KHIỂN TITAN
  function titanAttack(name, level = 0) {
    const T = game.titan;
    const m = tmove(T, name);
    const M = mods();
    if (T.arms[m.arm] || T.beaming) return;
    if (m.arm === 'R' && T.charge && name !== 'cannon') return; // tay phải đang nạp vũ khí L
    if (m.arm === 'L' && T.guard) return;
    if (m.energy && T.energy < m.energy) {
      floatText(T.x, GROUND - (370 + BODY_LIFT) * TITAN_SCALE, 'THIẾU NĂNG LƯỢNG', '#ff9b5e', 18);
      sfx.deny();
      return;
    }
    if (m.energy) {
      T.energy -= m.energy;
      T.regenDelay = REGEN_DELAY;
    }
    if (name === 'jet') sfx.jetIgnite();
    const quick = name === 'jab' || name === 'hook' ? T.def.quick : 1;
    T.arms[m.arm] = { name, m, t: 0, windup: m.windup * quick * (T.link < 25 ? 1.6 : 1), fired: false, sync: false, level };
    if (m.arm === 'L') T.p1Flash = 0.3;
    else T.p2Flash = 0.3;

    // Đồng bộ: hai bán cầu ra đòn gần như cùng lúc.
    const other = m.arm === 'L' ? 'R' : 'L';
    if (T.syncPending && T.syncPending.arm === other && game.t - T.syncPending.t <= M.sync) {
      T.syncPending = null;
      T.arms[m.arm].sync = true;
      onSync();
    } else {
      T.syncPending = { arm: m.arm, t: game.t };
    }
  }

  function onSync() {
    const T = game.titan;
    const K = game.kaiju;
    T.syncCount++;
    if (T.link >= 100 && K && !K.dying && K.state !== 'emerge') {
      fireBeam();
      return;
    }
    T.link = Math.min(100, T.link + 12);
    if (T.link >= 100 && T.linkHold <= 0) T.linkHold = LINK_HOLD;
    sfx.sync();
    floatText(T.x, GROUND - (390 + BODY_LIFT) * TITAN_SCALE, T.link >= 100 ? 'LINK 100%!' : 'ĐỒNG BỘ!', '#7ff6ff', 26);
  }

  function fireBeam() {
    const T = game.titan;
    T.arms.L = null;
    T.arms.R = null;
    T.beaming = true;
    T.guard = false;
    T.charge = null;
    T.linkHold = 0;
    floatText(T.x, GROUND - (410 + BODY_LIFT) * TITAN_SCALE, T.def.ultName + '!', '#ffffff', 36);
    if (T.def.ult === 'orbital') {
      // TEMPEST: gọi một loạt 6 tên lửa vệ tinh, khóa chắc vào quái, rơi nối tiếp nhau
      game.barrage = { t: 0, dur: STRIKE_DELAY + 5 * 0.2 + 0.4 };
      const K = game.kaiju;
      const M = mods();
      for (let i = 0; i < 6; i++) {
        game.strikes.push({ t: -i * 0.2, lock: true, dmg: 16 * M.blade, kb: i === 5 ? 700 : 60, dir: T.facing, x: K ? K.x : T.x, y: K ? GROUND - 230 * K.def.scale : GROUND - 200 });
      }
      sfx.satCall();
      shake(8);
      fx.flash = 0.3;
      return;
    }
    // VANGUARD: lò phản ứng trên ngực phóng tia năng lượng toàn lực
    game.beam = { t: 0, dur: 1.5, tick: 0 };
    sfx.beam();
    shake(16);
    fx.flash = 0.6;
  }

  function resolveTitanHit(a) {
    const T = game.titan;
    const K = game.kaiju;
    const M = mods();
    const m = a.m;
    if (m.projectile && T.def.missiles) {
      launchMissiles(T, a);
      return;
    }
    if (m.projectile) {
      const x0 = T.x + T.facing * 225 * TITAN_SCALE;
      const y0 = GROUND - (256 + BODY_LIFT) * TITAN_SCALE;
      let vx = T.facing * 1150;
      let vy = 0;
      if (K && !K.dying) {
        const dx = K.x - x0;
        const dy = GROUND - 150 * K.def.scale + K.y - y0;
        const len = Math.hypot(dx, dy) || 1;
        if (dx * T.facing > 0) {
          vx = (dx / len) * 1150;
          vy = (dy / len) * 1150;
        }
      }
      const lv = a.level;
      const heavy = lv >= 0.6;
      game.projectiles.push({
        owner: 'titan', x: x0, y: y0, vx, vy, g: 0,
        r: 10 + 22 * lv, dmg: (12 + 40 * lv) * M.blade * (a.sync ? 1.5 : 1),
        kb: 140 + 560 * lv, heavy, life: 2,
      });
      shake(3 + 12 * lv);
      T.vx -= T.facing * 500 * lv; // giật lùi khi bắn phát mạnh
      if (lv >= 0.99) floatText(T.x, GROUND - (400 + BODY_LIFT) * TITAN_SCALE, 'PLASMA TỐI ĐA!', '#bff8ff', 26);
      T.muzzle = 0.12;
      sfx.cannon();
      burst(x0, y0, 10, '#9ff', 200, 0.3, 4, 0);
      return;
    }
    if (!K || K.dying || K.state === 'emerge') {
      sfx.whiff();
      return;
    }
    if (a.name === 'jet' && T.def.special === 'leap') {
      startLeap(T, a);
      return;
    }
    if (a.name === 'jet') {
      sfx.jetBoom();
      shake(10);
      fx.rings.push({ x: T.x - T.facing * 40, y: GROUND - (BODY_LIFT + 250) * TITAN_SCALE, r: 0, max: 160, life: 0.4, color: '#ffb347' });
      T.facing = K.x >= T.x ? 1 : -1;
      const jdx = (K.x - T.x) * T.facing;
      if (specialCanHit(K)) {
        // chắc chắn trúng: Titan trượt tới sát quái rồi mới giáng đòn
        const sync = a.sync;
        T.slide = {
          from: T.x, t: 0, dur: 0.12 + 0.12 * clamp(jdx / (JET_REACH + K.half), 0, 1),
          onArrive: () => {
            const KK = game.kaiju;
            if (!KK || KK.dying) return;
            let dmg = m.dmg;
            let kb = m.kb;
            if (sync) {
              dmg *= 1.6;
              kb *= 1.4;
            }
            damageKaiju(dmg, kb, true, KK.x - T.facing * KK.half * 0.6, GROUND - 210 * KK.def.scale, T.facing);
            fx.rings.push({ x: KK.x - T.facing * KK.half * 0.6, y: GROUND - 210 * KK.def.scale, r: 0, max: 220, life: 0.45, color: '#ffd36b' });
          },
        };
      } else {
        T.vx += T.facing * 1500; // ngoài tầm (quá 2 lần chiều cao Titan): vẫn lao tới nhưng hụt
        sfx.whiff();
      }
      return;
    }
    const dx = (K.x - T.x) * T.facing;
    if (dx > -40 && dx < m.range + K.half) {
      let dmg = m.dmg * (a.name === 'blade' ? M.blade : T.def.power);
      let kb = m.kb;
      if (a.sync) {
        dmg *= 1.6;
        kb *= 1.4;
      }
      const hx = K.x - T.facing * K.half * 0.6;
      const hy = GROUND - (a.name === 'blade' ? 170 : 210) * K.def.scale;
      damageKaiju(dmg, kb, !!m.heavy || a.sync, hx, hy, T.facing);
    } else {
      sfx.whiff();
    }
  }

  // Chiêu I (đặc trưng của từng Titan) dùng chung một luật: quái đã lên bờ, còn sống và mép thân quái
  // cách Titan không quá SPECIAL_RANGE (2 lần chiều cao Titan) thì chắc chắn trúng;
  // trúng xong Titan đứng sát quái, trong tầm chém của vũ khí K.
  const specialGap = (T, K) => Math.max(0, Math.abs(K.x - T.x) - K.half);
  const specialCanHit = (K, T = game.titan) => !!(K && !K.dying && K.state !== 'emerge' && specialGap(T, K) <= SPECIAL_RANGE);
  const specialStandX = (T, K) => K.x - T.facing * (K.half + TITAN_HALF - 12);

  // TEMPEST · ĐẬP PHẢN LỰC: thruster lưng đẩy Titan vọt lên trên đầu quái rồi nện hai nắm đấm xuống.
  function leapTarget(T, L) {
    const K = game.kaiju;
    if (L.inRange && K && !K.dying && K.state !== 'emerge') {
      const s = K.def.scale;
      const headX = K.x + K.facing * 182 * s;
      const headY = 192 * s - K.y;
      // nắm đấm ở tư thế đập cách thân ~109px ngang, ~190px dọc (đã nhân tỷ lệ Titan)
      return { headX, headY, tx: headX - T.facing * 109, impactY: Math.max(20, headY - 190) };
    }
    return { headX: null, tx: L.fromX + T.facing * SPECIAL_RANGE * 0.6, impactY: 0 };
  }

  function startLeap(T, a) {
    const K = game.kaiju;
    if (K && !K.dying) T.facing = K.x >= T.x ? 1 : -1;
    const inRange = specialCanHit(K);
    T.leap = { t: 0, fromX: T.x, inRange, hit: false, sync: a.sync, m: a.m };
    T.vx = 0;
    sfx.dash();
    shake(5);
    burst(T.x, GROUND - 6, 26, '#8c93a3', 300, 1.1, 9, -30, true);
    fx.rings.push({ x: T.x, y: GROUND - 8, r: 0, max: 200, life: 0.4, color: '#5dffb0' });
  }

  function updateLeap(T, dt) {
    const L = T.leap;
    L.t += dt;
    T.vx = 0;
    const tg = L.hit ? null : leapTarget(T, L);
    if (tg) {
      L.tx = tg.tx;
      L.impactY = tg.impactY;
      L.headX = tg.headX;
      L.headY = tg.headY;
    }
    const apex = L.impactY + 150;
    if (L.t < LEAP.up) {
      const k = L.t / LEAP.up;
      T.x = lerp(L.fromX, L.tx, easeOut(k));
      T.airY = apex * Math.sin((k * Math.PI) / 2);
      burst(T.x - T.facing * 30, GROUND - (BODY_LIFT + 150) * TITAN_SCALE - T.airY, 3, pick(['#ffffff', '#a8ffd8', '#5dffb0']), 160, 0.3, 5, 500);
      return;
    }
    if (L.t < LEAP.up + LEAP.smash) {
      const k = (L.t - LEAP.up) / LEAP.smash;
      T.x = L.tx;
      T.airY = lerp(apex, L.impactY, k * k);
      return;
    }
    if (!L.hit) {
      L.hit = true;
      leapImpact(T, L);
      const K = game.kaiju;
      L.landFrom = T.x;
      L.landTo = L.headX != null && K && !K.dying ? specialStandX(T, K) : T.x;
      L.fallFrom = T.airY;
    }
    const k = clamp((L.t - LEAP.up - LEAP.smash) / LEAP.fall, 0, 1);
    const KF = game.kaiju;
    if (L.headX != null && KF && !KF.dying) L.landTo = specialStandX(T, KF); // bám theo quái nếu nó bị đẩy lùi
    T.x = lerp(L.landFrom, L.landTo, easeOut(k));
    T.airY = (L.fallFrom + 50 * Math.sin(k * Math.PI)) * (1 - k * k);
    if (k >= 1) {
      T.airY = 0;
      T.leap = null;
      shake(6);
      burst(T.x, GROUND - 6, 20, '#8c93a3', 240, 1, 8, -20, true);
    }
  }

  function leapImpact(T, L) {
    const K = game.kaiju;
    sfx.jetBoom();
    if (L.headX != null && K && !K.dying) {
      let dmg = L.m.dmg;
      let kb = L.m.kb;
      if (L.sync) {
        dmg *= 1.6;
        kb *= 1.4;
      }
      const hy = GROUND - L.headY;
      damageKaiju(dmg, kb, true, L.headX, hy, T.facing);
      fx.rings.push({ x: L.headX, y: hy, r: 0, max: 240, life: 0.45, color: '#5dffb0' });
      burst(L.headX, hy, 30, pick(['#ffffff', '#a8ffd8', '#ffd36b']), 520, 0.6, 5, 400);
      shake(16);
      fx.flash = 0.25;
      T.leapHits = (T.leapHits || 0) + 1;
    } else {
      // hụt: nện xuống đất
      shake(9);
      burst(T.x + T.facing * 60, GROUND - 6, 30, '#8c93a3', 360, 1.2, 9, -30, true);
      fx.rings.push({ x: T.x + T.facing * 60, y: GROUND - 8, r: 0, max: 260, life: 0.5, color: '#8c93a3' });
    }
  }

  // TEMPEST: loạt tên lửa từ hai bệ trên ngực, bay vồng lên rồi tự dẫn vào quái.
  function launchMissiles(T, a) {
    const lv = a.level;
    const n = 6;
    T.missileCD = MISSILE_RELOAD;
    const M = mods();
    for (let i = 0; i < n; i++) {
      const c = i % 3;
      const r = Math.floor(i / 3);
      game.projectiles.push({
        owner: 'titan', missile: true, home: 0.16 + i * 0.035,
        x: T.x + T.facing * (LAUNCHER.x - 21 + c * 21) * TITAN_SCALE,
        y: GROUND - (-LAUNCHER.y + BODY_LIFT + 12 - r * 24) * TITAN_SCALE,
        vx: T.facing * (200 + c * 70 + rand(-30, 30)), vy: -(560 + r * 140 + rand(-40, 40)), g: 0,
        r: 7, dmg: 9 * M.blade * (a.sync ? 1.5 : 1),
        kb: 120, heavy: i === n - 1, life: 3,
      });
    }
    shake(6);
    floatText(T.x, GROUND - (400 + BODY_LIFT) * TITAN_SCALE, '6 TÊN LỬA!', '#5dffb0', 24);
    T.muzzle = 0.12;
    sfx.cannon();
    burst(T.x + T.facing * LAUNCHER.x * TITAN_SCALE, GROUND - (-LAUNCHER.y + BODY_LIFT) * TITAN_SCALE, 16, '#ffd36b', 240, 0.4, 4, 0);
  }

  function damageKaiju(dmg, kb, heavy, hx, hy, dir, quiet = false) {
    const K = game.kaiju;
    if (!K || K.dying) return;
    K.hp -= dmg;
    K.hitFlash = 0.1;
    K.vx += dir * kb;
    const charging = K.state === 'active' && K.move === 'charge';
    if (heavy && K.state === 'windup') {
      // Đòn nặng trúng lúc quái đang gồng → phản đòn.
      K.state = 'stun';
      K.t = 0;
      K.stunDur = 1.3;
      K.move = null;
      K.poiseT = 2.6;
      floatText(K.x, GROUND - 340 * K.def.scale, 'PHẢN ĐÒN!', '#ffe066', 34);
      sfx.counter();
      game.titan.link = Math.min(100, game.titan.link + 8);
      if (game.titan.link >= 100 && game.titan.linkHold <= 0) game.titan.linkHold = LINK_HOLD;
    } else if (heavy && !charging && K.poiseT <= 0 && K.state !== 'stun' && K.state !== 'emerge') {
      // Choáng ngắn, sau đó quái vật được miễn choáng một lúc để không bị khóa cứng.
      K.state = 'stun';
      K.t = 0;
      K.stunDur = 0.35;
      K.move = null;
      K.poiseT = 3;
    }
    if (!quiet) {
      burst(hx, hy, heavy ? 28 : 12, K.def.glow, heavy ? 520 : 320, 0.55, heavy ? 6 : 4);
      burst(hx, hy, 6, '#ffffff', 400, 0.2, 3);
      shake(heavy ? 12 : 5);
      fx.hitstop = heavy ? 0.07 : 0.035;
      if (heavy) sfx.heavy();
      else sfx.punch();
      floatText(hx, hy - 40, String(Math.round(dmg)), heavy ? '#ffd36b' : '#ffffff', heavy ? 30 : 22);
    }
    if (K.hp <= 0) killKaiju();
  }

  function killKaiju() {
    const K = game.kaiju;
    if (!K || K.dying) return;
    K.dying = true;
    K.hp = 0;
    K.deathT = 0;
    K.state = 'dead';
    sfx.roar();
    shake(22);
    fx.flash = 0.4;
    burst(K.x, GROUND - 160 * K.def.scale, 70, K.def.glow, 700, 1.2, 7, 300);
    floatText(K.x, GROUND - 380 * K.def.scale, 'ĐÃ HẠ GỤC!', '#7ff6ff', 40);
    const T = game.titan;
    T.celebrate = { t: -0.5, landed: false };
    T.charge = null;
    T.guard = false;
  }

  function hitTitan(dmg, kb, dir, opts = {}) {
    const T = game.titan;
    if (game.state !== 'fight') return;
    if (T.inv > 0) {
      floatText(T.x, GROUND - (370 + BODY_LIFT) * TITAN_SCALE, 'NÉ!', '#9ff', 22);
      return;
    }
    // Trúng bất kỳ đòn nào cũng làm mất phát nạp và hủy đòn đang gồng.
    if (T.charge) {
      floatText(T.x, GROUND - (400 + BODY_LIFT) * TITAN_SCALE, 'MẤT PHÁT NẠP', '#ff9b5e', 20);
      T.charge = null;
      sfx.deny();
    }
    for (const side of ['L', 'R']) {
      const arm = T.arms[side];
      if (arm && !arm.fired) {
        if (arm.name === 'jet') {
          floatText(T.x, GROUND - (420 + BODY_LIFT) * TITAN_SCALE, 'MẤT CHIÊU!', '#ff5e4d', 26);
          sfx.deny();
        }
        T.arms[side] = null;
      }
    }
    T.slide = null;
    let d = dmg;
    let blocked = T.guard && !opts.unblockable;
    if (blocked && T.energy < BLOCK_COST) {
      // hết năng lượng → vỡ thế thủ, lãnh trọn đòn
      blocked = false;
      T.guard = false;
      floatText(T.x, GROUND - (400 + BODY_LIFT) * TITAN_SCALE, 'VỠ THẾ THỦ!', '#ff5e4d', 26);
      d *= 1.33;
    }
    if (blocked) {
      d *= 0.35;
      T.energy -= BLOCK_COST;
      T.regenDelay = REGEN_DELAY;
      T.vx += dir * kb * 0.35;
      if (opts.linkDrain && T.linkHold <= 0) T.link = Math.max(0, T.link - opts.linkDrain * 0.4);
      sfx.block();
      shake(4);
      burst(T.x + T.facing * 60, GROUND - (BODY_LIFT + 260) * TITAN_SCALE, 14, '#dff4ff', 380, 0.3, 3, 300);
    } else {
      if (T.guard) d *= 0.75;
      T.vx += dir * kb;
      T.hitFlash = 0.15;
      T.stagger = 0.35;
      T.arms.L = null;
      T.arms.R = null;
      if (T.linkHold <= 0) T.link = Math.max(0, T.link - 6 - (opts.linkDrain || 0));
      sfx.hurt();
      shake(14);
      fx.hitstop = 0.06;
      burst(T.x, GROUND - (BODY_LIFT + 220) * TITAN_SCALE, 20, '#ffb04a', 420, 0.6, 5);
    }
    T.hp -= d;
    floatText(T.x, GROUND - (350 + BODY_LIFT) * TITAN_SCALE, (blocked ? 'ĐỠ -' : '-') + Math.round(d), blocked ? '#bfe8ff' : '#ff6b5e', blocked ? 18 : 26);
    if (T.hp <= 0) {
      T.hp = 0;
      endWave('titan');
    }
  }

  // Pháo plasma: giữ L để nạp (càng lâu càng mạnh, càng tốn năng lượng), thả L để bắn.
  function updateCharge(dt) {
    const T = game.titan;
    if (!T.charge) {
      if (!tap('KeyL') || T.arms.R || T.beaming) return;
      if (T.def.missiles && T.missileCD > 0) {
        floatText(T.x, GROUND - (370 + BODY_LIFT) * TITAN_SCALE, `ĐANG NẠP ĐẠN · ${T.missileCD.toFixed(1)}s`, '#ffd36b', 18);
        sfx.deny();
        return;
      }
      if (T.energy < CHARGE_MIN) {
        floatText(T.x, GROUND - (370 + BODY_LIFT) * TITAN_SCALE, 'THIẾU NĂNG LƯỢNG', '#ff9b5e', 18);
        sfx.deny();
        return;
      }
      T.energy -= CHARGE_MIN;
      T.charge = { t: 0, level: 0, spent: CHARGE_MIN, full: false };
      T.p2Flash = 0.3;
      sfx.chargeStart();
    }
    const C = T.charge;
    T.regenDelay = REGEN_DELAY;
    // TEMPEST: tất cả hoặc không — giữ đủ MISSILE_CHARGE mới phóng, thả sớm thì hủy.
    if (T.def.missiles) {
      if (held('KeyL')) {
        if (C.t < MISSILE_CHARGE) {
          const want = Math.min(1, (C.t + dt) / MISSILE_CHARGE);
          const cost = CHARGE_MIN + (CHARGE_MAX - CHARGE_MIN) * want - C.spent;
          if (cost <= T.energy) {
            T.energy -= cost;
            C.spent += cost;
            C.t += dt;
            C.level = want;
          }
          if (C.t >= MISSILE_CHARGE && !C.full) {
            C.full = true;
            C.level = 1;
            sfx.chargeFull();
          }
        }
        if (Math.random() < 0.3 + C.level) {
          const a = rand(0, PI2);
          const d = 40 + 30 * C.level;
          burst(T.x + T.facing * LAUNCHER.x * TITAN_SCALE + Math.cos(a) * d, GROUND - (-LAUNCHER.y + BODY_LIFT) * TITAN_SCALE + Math.sin(a) * d, 1, '#ffd36b', 30, 0.25, 3, 0);
        }
        return;
      }
      T.charge = null;
      if (C.full) {
        titanAttack('cannon', 1);
        sfx.cannonShot(1);
      } else {
        T.energy = Math.min(100, T.energy + C.spent); // hủy: hoàn lại năng lượng
        floatText(T.x, GROUND - (370 + BODY_LIFT) * TITAN_SCALE, 'HỦY PHÓNG — CHƯA KHÓA XONG', '#ff9b5e', 18);
        sfx.deny();
      }
      return;
    }
    // thả L sớm: vẫn tự nạp cho đủ thời gian tối thiểu rồi mới bắn
    if (!held('KeyL') && C.t < CHARGE_LOCK) C.release = true;
    if (held('KeyL') || C.t < CHARGE_LOCK) {
      // chỉ nạp tiếp khi còn năng lượng để trả
      const want = Math.min(1, (C.t + dt) / CHARGE_TIME);
      const cost = CHARGE_MIN + (CHARGE_MAX - CHARGE_MIN) * want - C.spent;
      if (cost <= T.energy) {
        T.energy -= cost;
        C.spent += cost;
        C.t += dt;
        C.level = want;
      } else if (C.t < CHARGE_LOCK) {
        C.t += dt; // hết năng lượng: giữ mức hiện tại nhưng vẫn đếm đủ thời gian tối thiểu
      }
      if (C.level >= 1 && !C.full) {
        C.full = true;
        sfx.chargeFull();
      }
      if (Math.random() < 0.3 + C.level) {
        const a = rand(0, PI2);
        const d = 40 + 30 * C.level;
        const mis = T.def.missiles;
        const fx0 = T.x + T.facing * (mis ? LAUNCHER.x : 225) * TITAN_SCALE;
        const fy0 = GROUND - (mis ? -LAUNCHER.y + BODY_LIFT : 256 + BODY_LIFT) * TITAN_SCALE;
        burst(fx0 + Math.cos(a) * d, fy0 + Math.sin(a) * d, 1, mis ? '#ffd36b' : '#bff8ff', 30, 0.25, 3, 0);
      }
      return;
    }
    const lv = C.level;
    T.charge = null;
    titanAttack('cannon', lv);
    sfx.cannonShot(lv);
  }

  // ĂN MỪNG CHIẾN THẮNG: khuỵu gối lấy đà → thruster bật nhảy xoay nửa vòng → đáp đất dang tay.
  const CEL = { crouch: 0.35, jump: 0.75, hold: 1.9 };
  function celebratePhase(c) {
    const t = Math.max(0, c.t);
    if (c.t < 0) return { name: 'wait', k: 0 };
    if (t < CEL.crouch) return { name: 'crouch', k: t / CEL.crouch };
    if (t < CEL.crouch + CEL.jump) return { name: 'jump', k: (t - CEL.crouch) / CEL.jump };
    return { name: 'pose', k: clamp((t - CEL.crouch - CEL.jump) / CEL.hold, 0, 1) };
  }

  function updateCelebration(T, dt) {
    const c = T.celebrate;
    c.t += dt;
    T.vx *= Math.pow(0.01, dt);
    T.x += T.vx * dt;
    T.arms.L = null;
    T.arms.R = null;
    T.moving = false;
    const ph = celebratePhase(c);
    if (ph.name === 'jump') {
      T.airY = Math.sin(ph.k * Math.PI) * 170;
      if (!c.launched) {
        c.launched = true;
        sfx.dash();
        sfx.cheer();
        burst(T.x, GROUND - 6, 24, '#8c93a3', 260, 1.2, 9, -30, true);
      }
      burst(T.x - T.facing * 60, GROUND - (BODY_LIFT + 200) * TITAN_SCALE - T.airY, 3, pick(['#bff8ff', '#7fe3ff', '#ffffff']), 160, 0.35, 5, 400);
    } else {
      T.airY = 0;
    }
    if (ph.name === 'pose' && !c.landed) {
      c.landed = true;
      T.facing = -T.facing; // đã xoay nửa vòng trên không
      shake(20);
      fx.flash = 0.35;
      sfx.jetBoom();
      fx.rings.push({ x: T.x, y: GROUND - 10, r: 0, max: 520, life: 0.8, color: '#7ff6ff' });
      burst(T.x, GROUND - 6, 60, '#8c93a3', 520, 1.6, 10, -20, true);
      burst(T.x, GROUND - (BODY_LIFT + 260) * TITAN_SCALE, 40, '#bff8ff', 600, 0.9, 5, 300);
      game.cheerT = 2.4;
    }
  }

  function updateTitan(dt) {
    const T = game.titan;
    const K = game.kaiju;
    const M = mods();
    const live = K && !K.dying && K.state !== 'emerge';
    T.hitFlash -= dt;
    T.p1Flash -= dt;
    T.p2Flash -= dt;
    T.inv -= dt;
    T.dashT -= dt;
    T.muzzle -= dt;
    if (T.missileCD > 0) T.missileCD -= dt;
    T.ghost = Math.max(T.hp, T.ghost - 40 * dt);
    if (T.regenDelay > 0) T.regenDelay -= dt;
    else T.energy = Math.min(100, T.energy + M.regen * dt);

    if (T.celebrate) {
      updateCelebration(T, dt);
      return;
    }
    if (T.beaming) {
      T.x += T.vx * dt;
      T.vx *= Math.pow(0.01, dt);
      return;
    }

    if (T.leap) {
      updateLeap(T, dt);
      for (const side of ['L', 'R']) {
        const a = T.arms[side];
        if (!a) continue;
        a.t += dt;
        if (a.t >= a.windup + a.m.active + a.m.recover && !T.leap) T.arms[side] = null;
      }
      return;
    }
    if (T.slide) {
      const S = T.slide;
      S.t += dt;
      const target = K && !K.dying ? specialStandX(T, K) : S.from;
      T.x = lerp(S.from, target, easeOut(clamp(S.t / S.dur, 0, 1)));
      T.vx = 0;
      if (Math.random() < 0.8) burst(T.x - T.facing * 50, GROUND - 6, 3, '#8c93a3', 160, 0.8, 8, -20, true);
      if (S.t >= S.dur) {
        T.slide = null;
        S.onArrive();
      }
    }
    if (K && !K.dying && !T.arms.L && !T.arms.R) T.facing = K.x >= T.x ? 1 : -1;

    let move = (held('KeyD') ? 1 : 0) - (held('KeyA') ? 1 : 0);
    if (T.stagger > 0) {
      T.stagger -= dt;
      move = 0;
    }
    T.guard = held('KeyS') && T.stagger <= 0 && !T.arms.L && !T.charge;

    let spd = T.def.speed;
    if (T.guard) spd *= 0.35;
    if (T.link < 25) spd *= 0.6;
    if (T.arms.R && T.arms.R.name === 'blade') spd *= T.def.wristBlades ? 0.6 : 0.3;
    if (T.charge) spd *= 0.45;
    if (T.def.missiles && T.arms.R && T.arms.R.name === 'cannon') spd *= 0.4;

    if (tap('KeyW') && T.stagger <= 0 && T.dashT <= 0) {
      if (T.energy >= 20) {
        const dir = move || -T.facing;
        T.vx = dir * 1150;
        T.dashT = 0.5;
        T.inv = 0.32;
        T.energy -= 20;
        T.regenDelay = REGEN_DELAY;
        sfx.dash();
        burst(T.x - dir * 40, GROUND - 120, 18, '#7fe3ff', 250, 0.4, 5, 0);
      } else {
        floatText(T.x, GROUND - (370 + BODY_LIFT) * TITAN_SCALE, 'THIẾU NĂNG LƯỢNG', '#ff9b5e', 18);
        sfx.deny();
      }
    }

    if (T.stagger <= 0) {
      if (tap('KeyF')) titanAttack('jab');
      if (tap('KeyJ')) titanAttack('hook');
      if (tap('KeyK')) titanAttack('blade');
      if (tap('KeyI')) titanAttack('jet');
      updateCharge(dt);
    }
    if (T.beaming) return; // vừa kích hoạt TIDEBREAKER

    T.x += (move * spd + T.vx) * dt;
    T.vx *= Math.pow(0.005, dt);
    if (Math.abs(T.vx) < 5) T.vx = 0;
    T.moving = move !== 0;
    if (move) T.walkT += dt * move * T.facing * (spd / 270) * (270 / T.def.speed) ** 0.5;
    T.x = clamp(T.x, 80, SHORE_X + 320);

    // Bị hất văng vào tòa nhà.
    if (Math.abs(T.vx) > 450 && T.dashT <= 0) {
      const b = buildingAt(T.x);
      if (b && game.t - b.hitT > 0.6) {
        b.hitT = game.t;
        damageBuilding(b, Math.abs(T.vx) * 0.03);
      }
    }

    // Link chạm 100% được khóa LINK_HOLD giây (không mất vì trúng đòn), hết giờ mà chưa dùng chiêu đặc biệt thì tụt về 85.
    if (T.linkHold > 0) {
      T.link = 100;
      T.linkHold -= dt;
      if (T.linkHold <= 0) {
        T.linkHold = 0;
        T.link = 85;
        floatText(T.x, GROUND - (400 + BODY_LIFT) * TITAN_SCALE, 'LINK TỤT', '#ff9b5e', 20);
      }
    }
    if (T.link > 40 && T.link < 100) T.link = Math.max(40, T.link - M.decay * dt);
    if (T.syncPending && game.t - T.syncPending.t > M.sync) {
      T.syncPending = null;
      if (T.linkHold <= 0) T.link = Math.max(0, T.link - 2);
    }

    for (const side of ['L', 'R']) {
      const a = T.arms[side];
      if (!a) continue;
      a.t += dt;
      if (!a.fired && a.t >= a.windup) {
        a.fired = true;
        resolveTitanHit(a);
      }
      if (a.name === 'jet' && T.def.special !== 'leap' && a.t < a.windup + a.m.active + 0.12) {
        const n = a.t < a.windup ? 1 : 4;
        burst(T.x - T.facing * 30, GROUND - (BODY_LIFT + 230) * TITAN_SCALE, n, pick(['#ffd36b', '#ff9b3d', '#ffffff']), 160, 0.35, 4, -40);
        if (a.t >= a.windup) burst(T.x - T.facing * 60, GROUND - 230, 2, '#8c93a3', 120, 0.9, 9, -20, true);
      }
      if (a.t >= a.windup + a.m.active + a.m.recover) T.arms[side] = null;
    }

    // Không cho hai bên đè lên nhau (trừ khi lướt né hoặc quái lao húc).
    if (live && !T.slide && T.dashT < 0.18 && !(K.state === 'active' && K.move === 'charge')) {
      const min = K.half + TITAN_HALF - 10;
      const d = T.x - K.x;
      if (Math.abs(d) < min) {
        const s = d === 0 ? -1 : Math.sign(d);
        const push = min - Math.abs(d);
        T.x += s * push * 0.6;
        K.x -= s * push * 0.4;
      }
    }
  }

  // ============================================================ AI QUÁI VẬT
  function chooseMove(K, ad) {
    const opts = K.def.moves.filter((n) => {
      const m = KMOVES[n];
      return ad >= m.minD && ad <= m.maxD && !(n === 'roar' && K.lastMove === 'roar');
    });
    if (!opts.length) return null;
    let r = Math.random() * opts.reduce((s, n) => s + KMOVES[n].weight, 0);
    for (const n of opts) {
      r -= KMOVES[n].weight;
      if (r <= 0) return n;
    }
    return opts[opts.length - 1];
  }

  function updateKaiju(dt) {
    const K = game.kaiju;
    const T = game.titan;
    if (!K) return;
    const def = K.def;
    K.t += dt;
    K.hitFlash -= dt;
    K.swipe -= dt;
    K.poiseT -= dt;
    K.ghost = Math.max(Math.max(0, K.hp), K.ghost - 60 * dt);

    if (K.dying) {
      K.deathT += dt;
      K.x += K.vx * dt;
      K.vx *= Math.pow(0.05, dt);
      K.y += dt * 45 * K.deathT;
      if (Math.random() < dt * 30) burst(K.x + rand(-K.half, K.half), GROUND - rand(40, 220) * def.scale + K.y, 2, def.glow, 120, 1, 4, -60);
      return;
    }

    const fast = K.phase2 ? PHASE2_SPEED : 1;
    if (!K.phase2 && K.hp < K.maxHp * 0.5) {
      K.phase2 = true;
      floatText(K.x, GROUND - 350 * def.scale, 'CUỒNG NỘ!', '#ff5a5a', 34);
      sfx.roar();
      shake(10);
    }

    const d = T.x - K.x;
    const ad = Math.abs(d);
    const mv = K.move ? KMOVES[K.move] : null;
    // Titan ở quá xa, hoặc đã vòng ra phía biển → quái vật tiến thẳng vào thành phố.
    const cityMode = ad > 750 || (d > 0 && ad > 320);

    switch (K.state) {
      case 'emerge': {
        const p = clamp(K.t / 2.6, 0, 1);
        K.y = 340 * (1 - easeOut(p));
        K.x -= 35 * dt;
        K.walkT += dt;
        if (Math.random() < dt * 25) burst(K.x + rand(-K.half, K.half), GROUND - 5, 3, '#cfe9ff', 260, 0.9, 4, 500);
        if (p >= 1) {
          K.y = 0;
          K.state = 'roarIntro';
          K.t = 0;
          sfx.roar();
          shake(18);
          fx.rings.push({ x: K.x, y: GROUND - 200, r: 0, max: 700, life: 1, color: def.glow });
        }
        break;
      }
      case 'roarIntro':
        if (K.t > 1.3) {
          K.state = 'idle';
          K.t = 0;
          K.cooldown = 0.8;
        }
        break;
      case 'idle': {
        K.cooldown -= dt;
        if (cityMode) {
          K.facing = -1;
          const b = buildingAt(K.x - K.half * 0.4);
          if (b) {
            K.state = 'smash';
            K.t = 0;
            K.target = b;
            K.smashT = 0.5;
          } else {
            K.x -= def.speed * fast * dt;
            K.walkT += dt;
          }
          break;
        }
        K.facing = d >= 0 ? 1 : -1;
        if (K.cooldown <= 0) {
          const name = chooseMove(K, ad);
          if (name) {
            K.move = name;
            K.lastMove = name;
            K.state = 'windup';
            K.t = 0;
            sfx.warn();
            break;
          }
        }
        if (ad > 230) {
          K.x += K.facing * def.speed * fast * dt;
          K.walkT += dt;
        }
        break;
      }
      case 'smash':
        K.facing = -1;
        K.smashT -= dt;
        if (K.smashT <= 0) {
          K.smashT = 0.75 / fast;
          K.swipe = 0.3;
          damageBuilding(K.target, 16);
          shake(5);
          sfx.punch();
        }
        if (!K.target || K.target.fallen || !cityMode) {
          K.state = 'idle';
          K.t = 0;
          K.cooldown = 0.4;
          K.target = null;
        }
        break;
      case 'windup':
        if (K.t >= mv.windup / fast) {
          K.state = 'active';
          K.t = 0;
          kaijuActiveStart(K);
        }
        break;
      case 'active':
        kaijuActiveUpdate(K, dt);
        if (K.state === 'active' && K.t >= mv.active) {
          K.state = 'recover';
          K.t = 0;
        }
        break;
      case 'recover': {
        // Combo: sau cú vuốt, quái có thể nối ngay đòn tiếp theo (rút ngắn thời gian hồi).
        const comboReady = K.move === 'claw' && !K.comboed && ad < 330 && K.t >= (mv.recover / fast) * 0.35;
        if (comboReady && Math.random() < (def.combo || 0) * (K.phase2 ? 1.4 : 1)) {
          K.comboed = true;
          K.move = Math.random() < 0.5 ? 'tail' : 'claw';
          K.lastMove = K.move;
          K.state = 'windup';
          K.t = KMOVES[K.move].windup * 0.25; // gồng nhanh hơn bình thường
          K.facing = d >= 0 ? 1 : -1;
          floatText(K.x, GROUND - 360 * def.scale, 'COMBO!', '#ff9b5e', 22);
          sfx.warn();
          break;
        }
        if (comboReady) K.comboed = true;
        if (K.t >= mv.recover / fast) {
          K.state = 'idle';
          K.t = 0;
          K.move = null;
          K.comboed = false;
          K.cooldown = rand(0.35, 1.0) / def.aggression / fast;
        }
        break;
      }
      case 'stun':
        if (K.t >= K.stunDur) {
          K.state = 'idle';
          K.t = 0;
          K.move = null;
          K.comboed = false;
          K.cooldown = 0.35;
        }
        break;
    }

    K.x += K.vx * dt;
    K.vx *= Math.pow(0.03, dt);
    // Bị đánh văng xuyên qua tòa nhà → thành phố chịu thiệt hại.
    if (Math.abs(K.vx) > 330) {
      const b = buildingAt(K.x);
      if (b && game.t - b.hitT > 0.5) {
        b.hitT = game.t;
        damageBuilding(b, Math.abs(K.vx) * 0.05);
      }
    }
    K.x = clamp(K.x, 120, WORLD_W - 120);
  }

  function kaijuActiveStart(K) {
    const T = game.titan;
    const mv = KMOVES[K.move];
    const s = K.def.scale;
    const dx = (T.x - K.x) * K.facing;
    switch (K.move) {
      case 'claw':
      case 'tail':
        K.swipe = 0.3;
        sfx.swing();
        if (dx > -60 && dx < mv.range * s + TITAN_HALF) hitTitan(mv.dmg, mv.kb, K.facing);
        break;
      case 'spit': {
        const x0 = K.x + K.facing * K.half * 1.2;
        const y0 = GROUND - 190 * s;
        const dist = Math.max(200, Math.abs(T.x - x0));
        const tf = dist / 700;
        const g = 900;
        const vx = (Math.sign(T.x - x0) || K.facing) * 700;
        const vy = (GROUND - 200 - y0 - 0.5 * g * tf * tf) / tf;
        game.projectiles.push({ owner: 'kaiju', x: x0, y: y0, vx, vy, g, r: 16, dmg: mv.dmg, life: 3, color: K.def.glow });
        sfx.spit();
        break;
      }
      case 'charge':
        K.chargeHit = false;
        K.dodged = false;
        sfx.roar();
        break;
      case 'roar':
        sfx.roar();
        shake(14);
        fx.rings.push({ x: K.x, y: GROUND - 200 * s, r: 0, max: mv.range, life: 0.6, color: K.def.glow });
        if (Math.abs(T.x - K.x) < mv.range) hitTitan(mv.dmg, mv.kb, Math.sign(T.x - K.x) || 1, { linkDrain: mv.linkDrain });
        break;
    }
  }

  function kaijuActiveUpdate(K, dt) {
    if (K.move !== 'charge') return;
    const T = game.titan;
    const mv = KMOVES.charge;
    K.x += K.facing * 860 * dt;
    K.walkT += dt * 2.5;
    if (Math.random() < dt * 40) burst(K.x - K.facing * K.half, GROUND - 10, 2, '#9aa3ad', 200, 0.6, 6, 300, true);
    if (!K.chargeHit && Math.abs(T.x - K.x) < K.half + TITAN_HALF) {
      if (T.inv > 0) {
        if (!K.dodged) {
          K.dodged = true;
          floatText(T.x, GROUND - (370 + BODY_LIFT) * TITAN_SCALE, 'NÉ!', '#9ff', 24);
        }
      } else {
        K.chargeHit = true;
        hitTitan(mv.dmg, mv.kb, K.facing, { unblockable: true });
        K.t = mv.active;
      }
    }
    const b = buildingAt(K.x + K.facing * K.half * 0.5);
    if (b && game.t - b.hitT > 0.8) {
      b.hitT = game.t;
      damageBuilding(b, 30);
      K.state = 'stun';
      K.t = 0;
      K.stunDur = 1.1;
      K.move = null;
      shake(12);
      floatText(K.x, GROUND - 340 * K.def.scale, 'ĐÂM VÀO TÒA NHÀ!', '#ff8b6b', 24);
    }
  }

  // ============================================================ ĐẠN, CHÙM TIA, THÀNH PHỐ
  function updateProjectiles(dt) {
    const T = game.titan;
    const K = game.kaiju;
    for (const p of game.projectiles) {
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.owner === 'titan') {
        if (p.missile) {
          p.home -= dt;
          if (p.home <= 0 && K && !K.dying) {
            const tx = K.x;
            const ty = GROUND - 170 * K.def.scale + K.y;
            const d = Math.hypot(tx - p.x, ty - p.y) || 1;
            const sp = 980;
            const k = Math.min(1, 6 * dt);
            p.vx += ((tx - p.x) / d * sp - p.vx) * k;
            p.vy += ((ty - p.y) / d * sp - p.vy) * k;
          }
          if (Math.random() < 0.7) burst(p.x, p.y, 1, pick(['#ffd36b', '#ff9b3d', '#b8c2cc']), 40, 0.35, 4, -30);
        } else burst(p.x, p.y, 1, '#8ff', 40, 0.25, 3, 0);
        // tên lửa vừa rời bệ chưa kích nổ: bay vồng lên trước rồi mới lao vào quái
        if (p.missile && p.home > 0) continue;
        if (K && !K.dying && K.state !== 'emerge' && Math.abs(p.x - K.x) < K.half && p.y > GROUND - 270 * K.def.scale + K.y && p.y < GROUND) {
          p.life = 0;
          damageKaiju(p.dmg, p.kb, p.heavy, p.x, p.y, Math.sign(p.vx));
          continue;
        }
      } else {
        if (Math.random() < 0.6) burst(p.x, p.y, 1, p.color, 60, 0.4, 4, 200);
        if (Math.abs(p.x - T.x) < TITAN_HALF + 10 && p.y > GROUND - (330 + BODY_LIFT) * TITAN_SCALE && p.y < GROUND) {
          p.life = 0;
          hitTitan(p.dmg, 160, Math.sign(p.vx));
          burst(p.x, p.y, 16, p.color, 300, 0.6, 5);
          continue;
        }
      }
      if (p.y >= GROUND) {
        p.life = 0;
        if (p.owner === 'kaiju') {
          damageBuilding(buildingAt(p.x), 14);
          burst(p.x, GROUND - 4, 18, p.color, 280, 0.7, 5);
        } else {
          burst(p.x, GROUND - 4, 10, '#8ff', 200, 0.4, 4);
        }
      }
      if (p.x < -100 || p.x > WORLD_W + 100) p.life = 0;
    }
    game.projectiles = game.projectiles.filter((p) => p.life > 0);
  }

  // TEMPEST · MƯA TÊN LỬA VỆ TINH: các tên lửa khóa chắc vào đầu quái, rơi nối tiếp; xong thì Titan hạ tay.
  function updateStrikes(dt) {
    const T = game.titan;
    const K = game.kaiju;
    for (const S of game.strikes) {
      S.t += dt;
      if (S.t < 0) continue;
      if (S.lock && K && !K.dying) {
        // vòng ngắm bám theo đầu quái → chắc chắn trúng
        S.x = K.x + K.facing * 120 * K.def.scale;
        S.y = GROUND - 230 * K.def.scale + K.y;
      }
      if (!S.warned && S.t >= STRIKE_DELAY - 0.4) {
        S.warned = true;
        sfx.satIncoming();
      }
      if (S.t >= STRIKE_DELAY && !S.done) {
        S.done = true;
        sfx.jetBoom();
        shake(12);
        fx.rings.push({ x: S.x, y: S.y, r: 0, max: 260, life: 0.5, color: '#ffd36b' });
        burst(S.x, S.y, 36, pick(['#ffffff', '#ffd36b', '#ff9b3d']), 520, 0.7, 6, 300);
        if (K && !K.dying) {
          damageKaiju(S.dmg, S.kb, S.kb > 300, S.x, S.y, S.dir, true);
          if (K.state !== 'dead' && !K.dying) {
            K.state = 'stun';
            K.t = 0;
            K.stunDur = 0.5;
            K.move = null;
          }
        }
      }
    }
    game.strikes = game.strikes.filter((S) => S.t < STRIKE_DELAY + 0.3);
    const B = game.barrage;
    if (B) {
      B.t += dt;
      if (B.t >= B.dur) {
        game.barrage = null;
        if (T) {
          T.beaming = false;
          T.link = 45;
        }
      }
    }
  }

  function updateBeam(dt) {
    const B = game.beam;
    if (!B) return;
    const T = game.titan;
    const K = game.kaiju;
    const M = mods();
    B.t += dt;
    B.tick -= dt;
    shake(6);
    if (B.tick <= 0 && K && !K.dying) {
      B.tick = 0.1;
      if ((K.x - T.x) * T.facing > 0) {
        damageKaiju(5.5 * M.blade, 70, false, K.x, GROUND - 190 * K.def.scale, T.facing, true);
        if (K.state !== 'dead') {
          K.state = 'stun';
          K.t = 0;
          K.stunDur = 0.6;
          K.move = null;
        }
        burst(K.x - T.facing * K.half * 0.5, GROUND - 190 * K.def.scale, 8, '#c8ffff', 500, 0.5, 4, 200);
      }
    }
    if (B.t >= B.dur) {
      if (K && !K.dying && (K.x - T.x) * T.facing > 0) {
        damageKaiju(15 * M.blade, 900, true, K.x, GROUND - 190 * K.def.scale, T.facing);
      }
      game.beam = null;
      T.beaming = false;
      T.link = 45;
    }
  }

  function updateBuildings(dt) {
    for (const b of game.buildings) {
      if (b.fallen && b.collapse < 1) {
        b.collapse = Math.min(1, b.collapse + dt / 1.6);
        if (Math.random() < dt * 40) burst(b.x + rand(0, b.w), GROUND - rand(0, 40), 2, '#8c8f99', 160, 1.4, 8, -30, true);
      } else if (!b.fallen && b.hp < 45 && Math.random() < dt * 6) {
        burst(b.x + rand(0.2, 0.8) * b.w, GROUND - b.h, 1, pick(['#ff9b3d', '#ffcf5a', '#ff5e3a']), 60, 1, 3, -80);
      }
    }
  }

  function updateAmbient(dt) {
    fx.shake = Math.max(0, fx.shake - 45 * dt);
    fx.flash = Math.max(0, fx.flash - dt * 1.5);
    game.lightning = Math.max(0, game.lightning - dt * 2.5);
    if (Math.random() < dt * 0.05) {
      game.lightning = 1;
      sfx.thunder();
    }
    for (const p of fx.particles) {
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.dust) {
        p.vx *= Math.pow(0.2, dt);
        p.vy *= Math.pow(0.2, dt);
      }
      if (p.y > GROUND && p.grav > 0) {
        p.y = GROUND;
        p.vy *= -0.3;
        p.vx *= 0.6;
      }
      p.life -= dt;
    }
    fx.particles = fx.particles.filter((p) => p.life > 0);
    for (const t of fx.texts) {
      t.y -= 45 * dt;
      t.life -= dt;
    }
    fx.texts = fx.texts.filter((t) => t.life > 0);
    for (const r of fx.rings) {
      r.life -= dt;
      r.r = lerp(r.r, r.max, 1 - Math.pow(0.002, dt));
    }
    fx.rings = fx.rings.filter((r) => r.life > 0);
    for (const d of rain) {
      d.y += 950 * d.s * dt;
      d.x -= 220 * d.s * dt;
      if (d.y > H) {
        d.y = -30;
        d.x = Math.random() * (W + 200);
      }
    }
  }

  function updateCamera(dt) {
    const T = game.titan;
    const K = game.kaiju;
    let target;
    if (K && !K.dying && Math.abs(K.x - T.x) < 1000) target = (T.x + K.x) / 2 - W / 2;
    else target = T.x - W / 2 + T.facing * 120;
    target = clamp(target, 0, WORLD_W - W);
    game.cam = lerp(game.cam, target, 1 - Math.pow(0.02, dt));
  }

  // ============================================================ LUỒNG GAME
  function setupWave() {
    const def = WAVES[game.wave];
    game.buildings = makeCity(1000 + game.wave * 7919);
    game.titan = makeTitan();
    game.kaiju = makeKaiju(def);
    game.projectiles = [];
    game.strikes = [];
    game.barrage = null;
    game.beam = null;
    fx.particles.length = 0;
    fx.texts.length = 0;
    fx.rings.length = 0;
    game.state = 'fight';
    game.stateT = 0;
    game.waveTime = 0;
    game.bannerT = 4;
    game.cheerT = 0;
    game.helpT = 0;
    game.showHelp = false; // vào trận là ẩn hướng dẫn; bấm H để xem lại
    game.cam = clamp(game.titan.x - W / 2 + 300, 0, WORLD_W - W);
  }

  function newRun() {
    game.wave = 0;
    game.scrap = 0;
    game.upgrades = { armor: 0, reactor: 0, blade: 0, neural: 0 };
    setupWave();
  }

  function toTitle() {
    game.state = 'title';
    game.stateT = 0;
    game.kaiju = null;
    game.titan = makeTitan();
    game.buildings = makeCity(1);
    game.projectiles = [];
    game.strikes = [];
    game.barrage = null;
    game.beam = null;
  }

  function endWave(reason) {
    if (game.state !== 'fight') return;
    game.state = 'gameover';
    game.reason = reason;
    game.stateT = 0;
    game.beam = null;
    game.titan.beaming = false;
  }

  function finishWave() {
    const T = game.titan;
    const integ = cityIntegrity();
    const hpf = T.hp / T.maxHp;
    const gain = 60 + Math.round(integ * 80) + Math.round(hpf * 40) + T.syncCount * 2;
    game.scrap += gain;
    game.result = { gain, integ, hpf, time: game.waveTime, syncs: T.syncCount };
    game.state = 'clear';
    game.stateT = 0;
  }

  function simulate(dt) {
    updateTitan(dt);
    updateKaiju(dt);
    updateProjectiles(dt);
    updateBeam(dt);
    updateStrikes(dt);
    updateBuildings(dt);
    if (game.state !== 'fight') return;
    if (cityIntegrity() < LOSE_CITY) endWave('city');
    else if (game.kaiju && game.kaiju.dying && game.kaiju.deathT > 3.6) finishWave();
  }

  function update(dt) {
    game.t += dt;
    game.stateT += dt;
    updateAmbient(dt);
    if (tap('KeyM')) sfx.muted = !sfx.muted;

    switch (game.state) {
      case 'title':
        game.cam = clamp(1100 + Math.sin(game.t * 0.08) * 900, 0, WORLD_W - W);
        if (tapAny('Enter', 'NumpadEnter', 'Space')) {
          game.state = 'select';
          game.stateT = 0;
          game.pick = game.titanIdx;
          sfx.buy();
        }
        return;
      case 'select': {
        game.cam = clamp(1100 + Math.sin(game.t * 0.08) * 900, 0, WORLD_W - W);
        const d = (tapAny('KeyD', 'ArrowRight') ? 1 : 0) - (tapAny('KeyA', 'ArrowLeft') ? 1 : 0);
        if (d) {
          game.pick = (game.pick + d + TITANS.length) % TITANS.length;
          sfx.dash();
        }
        if (tapAny('Escape')) {
          game.state = 'title';
          game.stateT = 0;
        } else if (game.stateT > 0.2 && tapAny('Enter', 'NumpadEnter', 'Space')) {
          game.titanIdx = game.pick;
          newRun();
        }
        return;
      }
      case 'fight':
        if (tapAny('KeyP', 'Escape')) {
          game.state = 'paused';
          break;
        }
        if (tap('KeyH')) game.showHelp = !game.showHelp;
        game.helpT -= dt;
        game.bannerT -= dt;
        game.cheerT -= dt;
        if (fx.hitstop > 0) {
          fx.hitstop -= dt;
          break;
        }
        game.waveTime += dt;
        simulate(dt);
        break;
      case 'paused':
        if (tapAny('KeyP', 'Escape', 'Enter')) game.state = 'fight';
        break;
      case 'clear':
        updateBuildings(dt);
        game.cheerT -= dt;
        if (game.stateT > 0.8 && tapAny('Enter', 'NumpadEnter', 'Space')) {
          game.state = game.wave >= WAVES.length - 1 ? 'win' : 'upgrade';
          game.stateT = 0;
        }
        break;
      case 'upgrade':
        UPGRADES.forEach((u, i) => {
          if (!tapAny('Digit' + (i + 1), 'Numpad' + (i + 1))) return;
          const cost = upgradeCost(u);
          if (game.upgrades[u.id] < UPGRADE_MAX && game.scrap >= cost) {
            game.scrap -= cost;
            game.upgrades[u.id]++;
            sfx.buy();
          } else {
            sfx.deny();
          }
        });
        if (game.stateT > 0.3 && tapAny('Enter', 'NumpadEnter', 'Space')) {
          game.wave++;
          setupWave();
        }
        break;
      case 'gameover':
        updateBuildings(dt);
        if (game.stateT > 0.8) {
          if (tapAny('Enter', 'NumpadEnter', 'Space')) setupWave();
          else if (tap('KeyT')) toTitle();
        }
        break;
      case 'win':
        if (game.stateT > 1 && tapAny('Enter', 'NumpadEnter', 'Space')) toTitle();
        break;
    }
    if (game.state !== 'title') updateCamera(dt);
  }

  // ============================================================ VẼ: BỐI CẢNH
  const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND);
  skyGrad.addColorStop(0, '#02050b');
  skyGrad.addColorStop(0.55, '#0a1729');
  skyGrad.addColorStop(1, '#173450');
  const seaGrad = ctx.createLinearGradient(0, GROUND - 10, 0, H);
  seaGrad.addColorStop(0, 'rgba(18,58,88,0.92)');
  seaGrad.addColorStop(1, 'rgba(2,10,20,0.97)');
  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.55)');

  function drawSky() {
    ctx.fillStyle = skyGrad;
    ctx.fillRect(-30, -30, W + 60, GROUND + 30);
    // mặt trăng sau mây
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#cfe3ff';
    ctx.shadowColor = '#cfe3ff';
    ctx.shadowBlur = 60;
    ellipse(980 - game.cam * 0.05, 120, 38, 38);
    ctx.fill();
    ctx.restore();
    // dải mây
    ctx.fillStyle = 'rgba(30,50,75,0.35)';
    for (let i = 0; i < 6; i++) {
      const x = ((i * 380 - game.cam * 0.08 + game.t * 8) % (W + 600)) - 300;
      ellipse(x, 90 + (i % 3) * 45, 260, 26);
      ctx.fill();
    }
    if (game.lightning > 0) {
      ctx.fillStyle = `rgba(180,210,255,${game.lightning * 0.35})`;
      ctx.fillRect(-30, -30, W + 60, H + 60);
    }
  }

  function drawFarCity() {
    farLayers.forEach((layer, li) => {
      const off = game.cam * layer.par;
      ctx.fillStyle = layer.color;
      for (const b of layer.arr) {
        const x = b.x - off;
        if (x > W + 10 || x + b.w < -10) continue;
        ctx.fillRect(x, GROUND - b.h, b.w, b.h);
      }
      ctx.fillStyle = layer.win;
      for (const b of layer.arr) {
        const x = b.x - off;
        if (x > W + 10 || x + b.w < -10) continue;
        for (const w of b.wins) ctx.fillRect(x + w[0], GROUND - b.h + w[1], 3, 4);
      }
      if (li === 0) drawSearchlights();
    });
  }

  function drawSearchlights() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    [380, 1150, 1900, 2600].forEach((wx, i) => {
      const x = wx - game.cam * 0.35;
      if (x < -400 || x > W + 400) return;
      const a = -Math.PI / 2 + Math.sin(game.t * 0.35 + i * 1.7) * 0.5;
      const len = 700;
      const spread = 0.06;
      const g = ctx.createLinearGradient(x, GROUND - 200, x + Math.cos(a) * len, GROUND - 200 + Math.sin(a) * len);
      g.addColorStop(0, 'rgba(160,200,255,0.16)');
      g.addColorStop(1, 'rgba(160,200,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, GROUND - 200);
      ctx.lineTo(x + Math.cos(a - spread) * len, GROUND - 200 + Math.sin(a - spread) * len);
      ctx.lineTo(x + Math.cos(a + spread) * len, GROUND - 200 + Math.sin(a + spread) * len);
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
  }

  function drawCranes() {
    for (const wx of [2470, 2650]) {
      const x = wx - game.cam;
      if (x < -300 || x > W + 300) continue;
      ctx.strokeStyle = '#0e1724';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(x, GROUND);
      ctx.lineTo(x, GROUND - 330);
      ctx.lineTo(x + 200, GROUND - 330);
      ctx.moveTo(x - 60, GROUND - 330);
      ctx.lineTo(x, GROUND - 330);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, GROUND - 380);
      ctx.lineTo(x + 200, GROUND - 330);
      ctx.moveTo(x, GROUND - 380);
      ctx.lineTo(x - 60, GROUND - 330);
      ctx.moveTo(x + 170, GROUND - 330);
      ctx.lineTo(x + 170, GROUND - 200);
      ctx.stroke();
      if (Math.sin(game.t * 3 + wx) > 0.2) {
        ctx.fillStyle = '#ff3b3b';
        ctx.fillRect(x - 3, GROUND - 386, 6, 6);
      }
    }
  }

  function drawBuildings() {
    for (const b of game.buildings) {
      const x = b.x - game.cam;
      if (x > W + 40 || x + b.w < -40) continue;
      if (b.collapse >= 1) {
        drawRubble(x, b, 1);
        continue;
      }
      const off = b.fallen ? easeIn(b.collapse) * b.h : 0;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - 60, -100, b.w + 120, GROUND + 100);
      ctx.clip();
      ctx.translate(x, GROUND - b.h + off);
      if (b.fallen) {
        ctx.translate(b.w / 2, b.h);
        ctx.rotate(b.tilt * b.collapse);
        ctx.translate(-b.w / 2, -b.h);
      }
      ctx.fillStyle = b.color;
      ctx.fillRect(0, 0, b.w, b.h);
      ctx.fillStyle = 'rgba(120,170,220,0.08)';
      ctx.fillRect(0, 0, 3, b.h);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, b.w, 6);
      if (b.antenna) {
        ctx.fillStyle = b.color;
        ctx.fillRect(b.w / 2 - 2, -40, 4, 40);
        if (Math.sin(game.t * 2 + b.x) > 0) {
          ctx.fillStyle = '#ff4040';
          ctx.fillRect(b.w / 2 - 3, -44, 6, 5);
        }
      }
      const frac = b.hp / b.maxHp;
      for (const w of b.windows) {
        if (frac < w.k * 0.95) continue;
        ctx.fillStyle = w.c;
        ctx.fillRect(w.x, w.y, 6, 9);
      }
      if (frac < 0.7) {
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth = 2;
        const n = frac < 0.4 ? 3 : frac < 0.55 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const pts = b.cracks[i];
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (const p of pts) ctx.lineTo(p[0], p[1]);
          ctx.stroke();
        }
      }
      if (frac < 0.45 && !b.fallen) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const fl = 0.5 + Math.random() * 0.3;
        const g = ctx.createRadialGradient(b.w / 2, 0, 0, b.w / 2, 0, b.w * 0.8);
        g.addColorStop(0, `rgba(255,140,50,${fl})`);
        g.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = g;
        ctx.fillRect(-b.w * 0.3, -b.w * 0.8, b.w * 1.6, b.w * 1.2);
        ctx.restore();
      }
      ctx.restore();
      if (b.fallen) drawRubble(x, b, b.collapse);
    }
  }

  function drawRubble(x, b, k) {
    const hgt = 46 * easeOut(k);
    ctx.fillStyle = '#1a222e';
    ctx.beginPath();
    ctx.moveTo(x - 10, GROUND);
    b.rubble.forEach((r, i) => ctx.lineTo(x - 10 + ((b.w + 20) * i) / (b.rubble.length - 1), GROUND - hgt * r));
    ctx.lineTo(x + b.w + 10, GROUND);
    ctx.closePath();
    ctx.fill();
  }

  function drawGround() {
    const shore = SHORE_X - game.cam;
    ctx.fillStyle = '#0a0f17';
    ctx.fillRect(-30, GROUND, shore + 30, H - GROUND + 30);
    const dock = CITY_END - game.cam;
    ctx.fillStyle = '#121a25';
    ctx.fillRect(dock, GROUND, shore - dock, 22);
    ctx.fillStyle = '#2a3b52';
    ctx.fillRect(-30, GROUND, shore + 30, 2);
    // vệt nước mưa phản chiếu
    ctx.fillStyle = 'rgba(120,170,230,0.05)';
    for (let i = 0; i < 14; i++) {
      const x = ((i * 233 - game.cam) % (W + 200) + W + 200) % (W + 200) - 100;
      if (x < shore) ctx.fillRect(x, GROUND + 20 + (i % 4) * 22, 120, 3);
    }
  }

  function drawSea() {
    const shore = SHORE_X - game.cam;
    if (shore > W + 20) return;
    ctx.fillStyle = seaGrad;
    ctx.beginPath();
    ctx.moveTo(shore, H + 30);
    for (let x = shore; x <= W + 40; x += 20) {
      ctx.lineTo(x, GROUND - 8 + Math.sin((x + game.cam) * 0.02 + game.t * 2) * 5);
    }
    ctx.lineTo(W + 40, H + 30);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,225,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = shore; x <= W + 40; x += 20) {
      const y = GROUND - 8 + Math.sin((x + game.cam) * 0.02 + game.t * 2) * 5;
      if (x === shore) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function drawRain() {
    ctx.strokeStyle = 'rgba(160,190,230,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of rain) {
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.l * 0.23, d.y + d.l);
    }
    ctx.stroke();
  }

  // ============================================================ VẼ: TITAN
  // EYERIM VANGUARD — thiết kế riêng của game: giáp trắng-thép, sọc cam, kính mắt một dải,
  // lò phản ứng lục giác có cánh turbine.
  function linkColor(l) {
    if (l >= 100) return Math.sin(game.t * 12) > 0 ? '#ffffff' : '#7ff6ff';
    if (l >= 60) return '#4ff0ff';
    if (l >= 25) return '#6fa8ff';
    return '#ff8a3d';
  }

  const MECH = {
    front: { hi: '#f2f5f8', armor: '#c9d1db', lo: '#7d8a99', frame: '#262f3a', frameHi: '#3d4958', accent: '#ff8a1f', line: 'rgba(8,14,22,0.6)' },
    back: { hi: '#9aa5b2', armor: '#76828f', lo: '#4c5663', frame: '#161c24', frameHi: '#252e39', accent: '#a65a17', line: 'rgba(4,7,10,0.6)' },
    flash: { hi: '#ffffff', armor: '#f4f7fa', lo: '#c4ccd6', frame: '#8a96a6', frameHi: '#b4c0cc', accent: '#ffd0a0', line: 'rgba(8,14,22,0.4)' },
  };

  function poly(pts, fill, stroke, lw = 1.5) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  }

  // Vẽ chi tiết bên trong một đa giác (bị cắt theo đúng viền đa giác).
  function clipPoly(pts, fn) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.clip();
    fn();
    ctx.restore();
  }

  // Vệt nước mưa chảy trên giáp (toạ độ cục bộ).
  function rainSheen(x0, x1, y0, y1, seed) {
    ctx.strokeStyle = 'rgba(220,240,255,0.18)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const x = lerp(x0, x1, ((i * 0.37 + seed) % 1));
      const y = lerp(y0, y1, ((game.t * 0.6 + i * 0.29 + seed) % 1));
      ctx.moveTo(x, y);
      ctx.lineTo(x + 1, y + 14);
    }
    ctx.stroke();
  }

  function vGrad(y0, y1, c0, c1, c2) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, c0);
    g.addColorStop(0.5, c1);
    g.addColorStop(1, c2);
    return g;
  }

  // IK hai đoạn: trả về khớp giữa và điểm cuối thực tế.
  function ik(sx, sy, tx, ty, l1, l2, bend) {
    const dx = tx - sx;
    const dy = ty - sy;
    const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 1, l1 + l2 - 0.5);
    const base = Math.atan2(dy, dx);
    const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const ang = base + bend * a;
    const jx = sx + Math.cos(ang) * l1;
    const jy = sy + Math.sin(ang) * l1;
    const fa = Math.atan2(ty - jy, tx - jx);
    return { jx, jy, ex: jx + Math.cos(fa) * l2, ey: jy + Math.sin(fa) * l2 };
  }

  // Vẽ trong hệ toạ độ của một đoạn chi: gốc tại (x1,y1), trục +x hướng về (x2,y2).
  function seg(x1, y1, x2, y2, fn) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    ctx.save();
    ctx.translate(x1, y1);
    ctx.rotate(Math.atan2(y2 - y1, x2 - x1));
    fn(len);
    ctx.restore();
  }

  function armPose(T, side) {
    const a = T.arms[side];
    const breathe = Math.sin(game.t * 2 + (side === 'L' ? 0 : 1.2)) * 3;
    const rest = side === 'L' ? { x: -64, y: -166 + breathe } : { x: 76, y: -160 + breathe };
    if (T.celebrate) return celebrateArm(T, side);
    if (T.def.special === 'leap' && (T.leap || (T.arms.R && T.arms.R.name === 'jet'))) return leapArm(T, side);
    if (T.beaming) {
      // TEMPEST giơ tay phải lên trời gọi vệ tinh; VANGUARD dang tay để lộ lò phản ứng
      if (T.def.ult === 'orbital') return side === 'L' ? { x: 30, y: -250 } : { x: 70, y: -450 };
      return side === 'L' ? { x: -120, y: -230 } : { x: -10, y: -150 };
    }
    if (side === 'R' && T.charge) return T.def.missiles ? { x: 70, y: -196 } : { x: 200, y: -256, charging: true };
    if (!a) {
      if (T.guard) return side === 'L' ? { x: 46, y: -318 } : { x: 92, y: -278 };
      if (T.stagger > 0) return side === 'L' ? { x: -96, y: -210 } : { x: 30, y: -196 };
      return rest;
    }
    const blade = a.name === 'blade';
    const wb = blade && T.def.wristBlades;
    const mis = a.name === 'cannon' && T.def.missiles;
    if (wb || mis) {
      // TEMPEST: lưỡi kép chém ngang từ trên vai xuống; phóng tên lửa thì tay hạ xuống mở bệ ngực
      const back2 = mis ? { x: 70, y: -196 } : { x: 60, y: -340 };
      const reach2 = mis ? { x: 80, y: -200 } : { x: 215, y: -236 };
      const w2 = a.windup;
      const act2 = a.m.active;
      let q;
      if (a.t < w2) q = { x: lerp(rest.x, back2.x, easeOut(a.t / w2)), y: lerp(rest.y, back2.y, easeOut(a.t / w2)) };
      else if (a.t < w2 + act2) {
        const k = easeOut(clamp((a.t - w2) / act2, 0, 1));
        q = { x: lerp(back2.x, reach2.x, k), y: lerp(back2.y, reach2.y, k) };
      } else {
        const k = easeInOut(clamp((a.t - w2 - act2) / a.m.recover, 0, 1));
        q = { x: lerp(reach2.x, rest.x, k), y: lerp(reach2.y, rest.y, k) };
      }
      q.wrist = wb;
      q.a = a;
      q.phase = a.t < w2 ? 'windup' : a.t < w2 + act2 ? 'active' : 'recover';
      return q;
    }
    const back = blade ? { x: 30, y: -372 } : a.name === 'cannon' ? { x: 196, y: -256 } : a.name === 'jet' ? { x: -40, y: -232 } : side === 'L' ? { x: -96, y: -252 } : { x: 6, y: -250 };
    const reach = blade ? { x: 190, y: -200 } : a.name === 'cannon' ? { x: 200, y: -256 } : a.name === 'jet' ? { x: 232, y: -258 } : { x: a.m.range * 0.92, y: -254 };
    const w = a.windup;
    const act = a.m.active;
    let p;
    if (a.t < w) {
      const k = easeOut(a.t / w);
      p = { x: lerp(rest.x, back.x, k), y: lerp(rest.y, back.y, k) };
    } else if (a.t < w + act) {
      const k = easeOut(clamp((a.t - w) / act, 0, 1));
      p = { x: lerp(back.x, reach.x, Math.min(1, k * 1.6)), y: lerp(back.y, reach.y, Math.min(1, k * 1.6)) };
    } else {
      const k = easeInOut(clamp((a.t - w - act) / a.m.recover, 0, 1));
      p = { x: lerp(reach.x, rest.x, k), y: lerp(reach.y, rest.y, k) };
    }
    p.blade = blade;
    p.cannon = a.name === 'cannon';
    p.jet = a.name === 'jet';
    p.a = a;
    p.phase = a.t < w ? 'windup' : a.t < w + act ? 'active' : 'recover';
    return p;
  }

  // Độ ngả người theo đòn đang đánh (cho cảm giác có trọng lượng).
  // Động cơ phản lực ở khuỷu tay: lửa phụt ngược hướng cẳng tay.
  function drawElbowJet(p, k, lc) {
    const a = p.a;
    const w = a.windup;
    let power;
    if (a.t < w) power = 0.25 + 0.5 * (a.t / w);
    else if (a.t < w + a.m.active + 0.12) power = 1.25;
    else power = Math.max(0, 1 - (a.t - w - a.m.active - 0.12) / (a.m.recover * 0.6));
    if (power <= 0) return;
    const ang = Math.atan2(k.ey - k.jy, k.ex - k.jx) + Math.PI; // ngược hướng cú đấm
    ctx.save();
    ctx.translate(k.jx, k.jy);
    ctx.rotate(ang);
    // vòi phun
    rr(-6, -13, 22, 26, 5);
    ctx.fillStyle = '#262f3a';
    ctx.fill();
    ctx.fillStyle = '#ff8a1f';
    ctx.fillRect(10, -13, 5, 26);
    ctx.globalCompositeOperation = 'lighter';
    const flick = 0.85 + Math.random() * 0.3;
    const L = (60 + 150 * power) * flick;
    const Wd = 12 + 8 * power;
    const g = ctx.createLinearGradient(16, 0, 16 + L, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.18, 'rgba(255,220,120,0.9)');
    g.addColorStop(0.55, 'rgba(255,120,30,0.6)');
    g.addColorStop(1, 'rgba(255,60,10,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(16, -Wd);
    ctx.quadraticCurveTo(16 + L * 0.5, -Wd * 1.2, 16 + L, 0);
    ctx.quadraticCurveTo(16 + L * 0.5, Wd * 1.2, 16, Wd);
    ctx.closePath();
    ctx.fill();
    // lõi xanh nóng + vành sốc
    ctx.fillStyle = `rgba(150,220,255,${0.6 * power})`;
    ellipse(24, 0, 10 + 6 * power, 6 + 3 * power);
    ctx.fill();
    if (power > 1) {
      ctx.strokeStyle = 'rgba(255,230,180,0.6)';
      ctx.lineWidth = 3;
      for (let i = 1; i <= 3; i++) {
        ellipse(16 + i * 34, 0, 5, Wd * (1.1 - i * 0.2));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function celebrateArm(T, side) {
    const ph = celebratePhase(T.celebrate);
    const low = side === 'L' ? { x: -40, y: -150 } : { x: 50, y: -150 };
    const up = side === 'L' ? { x: -30, y: -400 } : { x: 70, y: -404 };
    const spread = side === 'L' ? { x: -150, y: -176 } : { x: 162, y: -182 };
    const mix = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
    if (ph.name === 'wait') return mix(side === 'L' ? { x: -64, y: -166 } : { x: 76, y: -160 }, low, 0.5);
    if (ph.name === 'crouch') return mix(low, low, 1);
    if (ph.name === 'jump') return ph.k < 0.6 ? mix(low, up, easeOut(ph.k / 0.6)) : mix(up, spread, easeInOut((ph.k - 0.6) / 0.4));
    const shakeArm = Math.sin(game.t * 40) * 2 * (1 - ph.k);
    return { x: spread.x, y: spread.y + shakeArm };
  }

  function leapArm(T, side) {
    const L = T.leap;
    const rest = side === 'L' ? { x: -64, y: -166 } : { x: 76, y: -160 };
    const mix = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
    const low = side === 'L' ? { x: -40, y: -150 } : { x: 30, y: -150 };
    const up = side === 'L' ? { x: 20, y: -420 } : { x: 60, y: -424 };
    const smash = side === 'L' ? { x: 150, y: -240 } : { x: 170, y: -230 };
    if (!L) {
      const a = T.arms.R;
      return mix(rest, low, easeOut(clamp(a.t / a.windup, 0, 1)));
    }
    if (L.t < LEAP.up) return mix(low, up, easeOut(L.t / LEAP.up));
    if (L.t < LEAP.up + LEAP.smash) return mix(up, smash, easeOut((L.t - LEAP.up) / LEAP.smash));
    return mix(smash, rest, easeInOut(clamp((L.t - LEAP.up - LEAP.smash) / LEAP.fall, 0, 1)));
  }

  function titanLean(T) {
    if (T.leap) {
      const t = T.leap.t;
      if (t < LEAP.up) return -0.08;
      if (t < LEAP.up + LEAP.smash) return 0.3;
      return 0.3 * (1 - clamp((t - LEAP.up - LEAP.smash) / LEAP.fall, 0, 1));
    }
    if (T.celebrate) {
      const ph = celebratePhase(T.celebrate);
      return ph.name === 'crouch' ? 0.1 * ph.k : ph.name === 'pose' ? -0.1 : 0;
    }
    let lean = 0;
    for (const side of ['L', 'R']) {
      const a = T.arms[side];
      if (!a) continue;
      const w = a.windup;
      if (a.t < w) lean -= 0.05 * (a.t / w);
      else if (a.t < w + a.m.active + a.m.recover * 0.5) lean += a.name === 'blade' ? 0.12 : a.name === 'jet' ? 0.16 : 0.07;
    }
    if (T.stagger > 0) lean -= 0.12;
    if (T.guard) lean -= 0.03;
    if (Math.abs(T.vx) > 300) lean += 0.08 * Math.sign(T.vx) * T.facing;
    return lean;
  }

  function drawTitanArm(T, side, sx, sy, P, lc) {
    const p = armPose(T, side);
    if (p.charging) p.ch = T.charge;
    const k = ik(sx, sy, p.x, p.y, 82, 88, 1);
    // bắp tay: khung dày + hai lớp giáp + piston phía trong
    seg(sx, sy, k.jx, k.jy, (len) => {
      rr(-6, -18, len + 10, 36, 12);
      ctx.fillStyle = P.frame;
      ctx.fill();
      ctx.fillStyle = P.frameHi;
      ctx.fillRect(len * 0.2, 10, len * 0.55, 6);
      poly([[8, -22], [len * 0.55, -24], [len * 0.6, 4], [10, 8]], vGrad(-24, 8, P.hi, P.armor, P.lo), P.line);
      poly([[len * 0.5, -20], [len - 8, -18], [len - 4, 6], [len * 0.55, 6]], vGrad(-20, 6, P.hi, P.armor, P.lo), P.line);
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(12, -16);
      ctx.lineTo(len * 0.5, -18);
      ctx.stroke();
    });
    if (p.jet) drawElbowJet(p, k, lc);
    // khớp khuỷu tròn lớn
    drawJointDisc(k.jx, k.jy, 19, P);
    // cẳng tay: găng giáp to bản, loe về cổ tay, có khe tản nhiệt phát sáng + nắm đấm khối
    seg(k.jx, k.jy, k.ex, k.ey, (len) => {
      rr(-4, -18, len + 6, 36, 10);
      ctx.fillStyle = P.frame;
      ctx.fill();
      poly([[4, -22], [len * 0.5, -28], [len - 4, -30], [len + 6, -22], [len + 6, 22], [len - 4, 30], [len * 0.5, 26], [4, 20]], vGrad(-30, 30, P.hi, P.armor, P.lo), P.line);
      // tấm giáp ốp mặt ngoài
      poly([[len * 0.12, -16], [len * 0.45, -22], [len * 0.45, 2], [len * 0.12, 4]], vGrad(-22, 4, P.hi, P.armor, P.lo), P.line);
      poly([[len * 0.48, -24], [len * 0.56, -25], [len * 0.56, 25], [len * 0.48, 23]], P.accent);
      ctx.save();
      ctx.globalAlpha *= 0.55 + 0.45 * Math.sin(game.t * 6);
      ctx.fillStyle = lc;
      for (let i = 0; i < 3; i++) ctx.fillRect(len * 0.64 + i * 9, -10, 4, 20);
      ctx.restore();
      // nắm đấm
      rr(len - 2, -22, 44, 44, 9);
      ctx.fillStyle = P.frame;
      ctx.fill();
      rr(len + 14, -25, 30, 50, 8);
      ctx.fillStyle = vGrad(-25, 25, P.hi, P.armor, P.lo);
      ctx.fill();
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = P.lo;
      for (let i = 0; i < 4; i++) ctx.fillRect(len + 18, -18 + i * 11, 22, 3);
      if (T.def.wristBlades) drawWristBlade(p, len, P);
      if (p.blade) drawChainSword(p, len, lc, P);
      if (p.cannon || p.charging) drawArmCannon(p, len, lc, P, T);
    });
  }

  // KIẾM XÍCH: lưỡi kiếm cứng nhiều đốt. Khi rút, các đốt trượt ra nối tiếp nhau dọc một đường thẳng
  // (lộ dây xích năng lượng ở khe nối), rồi khóa chặt thành một lưỡi liền.
  function drawChainSword(p, len, lc, P) {
    const a = p.a;
    const w = a.windup;
    const act = a.m.active;
    let ext;
    if (a.t < w) ext = easeOut(clamp(a.t / w, 0, 1));
    else if (a.t < w + act) ext = 1;
    else ext = 1 - easeInOut(clamp((a.t - w - act) / a.m.recover, 0, 1));
    const n = 7;
    const segLen = 28;
    const base = len + 34;
    const locked = ext > 0.98;
    // vị trí từng đốt: đốt sau chỉ trượt ra khi đốt trước đã ra
    const xs = [];
    let x = base;
    for (let i = 0; i < n; i++) {
      const e = clamp(ext * (n + 2) / 2 - i * 0.5, 0, 1);
      xs.push(x);
      x += lerp(4, segLen + (locked ? 0 : 5), e);
    }
    const tipX = x;
    ctx.save();
    // dây xích năng lượng chạy dọc sống lưỡi
    ctx.shadowColor = lc;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = lc;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(base, 0);
    ctx.lineTo(tipX, 0);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // các đốt lưỡi (thon dần về mũi)
    for (let i = n - 1; i >= 0; i--) {
      const x0 = xs[i];
      const hw = lerp(15, 8, i / (n - 1));
      const hw2 = lerp(15, 8, (i + 1) / (n - 1));
      if (i === n - 1) {
        poly([[x0, -hw], [x0 + segLen, -hw2 * 0.6], [x0 + segLen + 34, 0], [x0 + segLen, hw2 * 0.6], [x0, hw]], P.hi, P.line);
      } else {
        poly([[x0, -hw], [x0 + segLen, -hw2], [x0 + segLen + 4, 0], [x0 + segLen, hw2], [x0, hw]], P.armor, P.line);
      }
      // gờ lưỡi sắc phát sáng
      ctx.save();
      ctx.shadowColor = lc;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = lc;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0, hw);
      ctx.lineTo(x0 + segLen + (i === n - 1 ? 34 : 4), i === n - 1 ? 0 : hw2);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = P.frame;
      ctx.fillRect(x0 + 4, -3, 10, 6);
    }
    // chuôi gắn vào cẳng tay
    rr(len + 20, -18, 18, 36, 4);
    ctx.fillStyle = P.frame;
    ctx.fill();
    ctx.fillStyle = P.accent;
    ctx.fillRect(len + 24, -18, 6, 36);
    ctx.restore();
  }

  // Vệt chém sáng (vẽ trong hệ toạ độ thân Titan, quanh vai trước).
  // TEMPEST: lưỡi kim loại gập dọc mặt ngoài cẳng tay; khi chém thì bật ra phía trước nắm đấm.
  function drawWristBlade(p, len, P) {
    let ext = 0;
    if (p.wrist && p.a) {
      const a = p.a;
      const w = a.windup;
      if (a.t < w) ext = a.t / w;
      else if (a.t < w + a.m.active + a.m.recover * 0.5) ext = 1;
      else ext = 1 - clamp((a.t - w - a.m.active - a.m.recover * 0.5) / (a.m.recover * 0.5), 0, 1);
    }
    ext = easeOut(ext);
    const base = len * 0.2;
    const L = len * 0.85 + 95 * ext;
    const yOff = -30 + 16 * ext; // bật từ mép giáp ra thẳng trục cẳng tay
    ctx.save();
    // chân lưỡi
    rr(base - 4, yOff - 4, 26, 10, 3);
    ctx.fillStyle = P.frame;
    ctx.fill();
    // lưỡi: sống dày, lưỡi vát, mũi nhọn
    poly([[base, yOff - 3], [base + L - 26, yOff - 7], [base + L, yOff + 1], [base + L - 26, yOff + 6], [base, yOff + 5]], vGrad(yOff - 7, yOff + 6, '#f4f7fa', '#b9c3cd', '#6b7682'), P.line);
    ctx.strokeStyle = ext > 0.5 ? 'rgba(160,255,215,0.9)' : 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(base + 6, yOff - 3);
    ctx.lineTo(base + L - 6, yOff - 1);
    ctx.stroke();
    ctx.fillStyle = P.accent;
    ctx.fillRect(base + 4, yOff - 1, 10, 3);
    ctx.restore();
  }

  function drawSlashTrail(T, sx, sy) {
    const a = T.arms.R;
    if (!a || a.name !== 'blade') return;
    if (T.def.wristBlades) {
      const t = a.t - a.windup;
      if (t < 0 || t > a.m.active + 0.08) return;
      const k = clamp(t / (a.m.active + 0.08), 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(120,255,200,${0.6 * (1 - k)})`;
      ctx.lineWidth = 16 * (1 - k * 0.6);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(sx, sy + 20, 250, -1.1, 0.35);
      ctx.stroke();
      ctx.restore();
      return;
    }
    const w = a.windup;
    const t = a.t - w;
    if (t < 0 || t > a.m.active + 0.1) return;
    const k = clamp(t / (a.m.active + 0.1), 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(160,240,255,${0.55 * (1 - k)})`;
    ctx.lineWidth = 26 * (1 - k * 0.6);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(sx, sy, 330, -1.45, 0.25);
    ctx.stroke();
    ctx.restore();
  }

  // PHÁO PLASMA: cẳng tay biến hình thành nòng pháo, vòng năng lượng tụ lại rồi khai hỏa.
  function drawArmCannon(p, len, lc, P) {
    let deploy;
    let charge;
    let firing = false;
    if (p.ch) {
      deploy = clamp(p.ch.t / 0.12 + 0.3, 0, 1);
      charge = p.ch.level;
    } else {
      const a = p.a;
      const w = a.windup;
      deploy = a.t < w + a.m.active ? 1 : 1 - clamp((a.t - w - a.m.active) / a.m.recover, 0, 1);
      charge = a.t < w + a.m.active ? a.level : 0;
      firing = a.t >= w && a.t < w + a.m.active + 0.06;
    }
    const bx = len + 20;
    const bl = 70 * easeOut(deploy);
    // các tấm giáp tách ra
    poly([[len - 30, -24 - 10 * deploy], [len + 20, -26 - 12 * deploy], [len + 24, -16], [len - 28, -16]], P.armor, P.line);
    poly([[len - 30, 24 + 10 * deploy], [len + 20, 26 + 12 * deploy], [len + 24, 16], [len - 28, 16]], P.armor, P.line);
    // nòng
    rr(bx, -15, bl + 10, 30, 6);
    ctx.fillStyle = P.frame;
    ctx.fill();
    ctx.fillStyle = P.accent;
    ctx.fillRect(bx + 6, -15, 8, 30);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // vòng năng lượng hội tụ về họng pháo
    for (let i = 0; i < 3; i++) {
      const k = (game.t * (1.2 + charge * 2.5) + i / 3) % 1;
      ctx.strokeStyle = `rgba(127,246,255,${(1 - k) * 0.8 * deploy})`;
      ctx.lineWidth = 3;
      ellipse(bx + bl * k + 10, 0, 10 + (1 - k) * 22, 18 + (1 - k) * 26);
      ctx.stroke();
    }
    const r = 6 + charge * 22 + (firing ? 20 : 0) + (charge >= 1 ? Math.sin(game.t * 30) * 3 : 0);
    const g = ctx.createRadialGradient(bx + bl + 12, 0, 0, bx + bl + 12, 0, r * 2.2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, lc);
    g.addColorStop(1, 'rgba(80,200,255,0)');
    ctx.fillStyle = g;
    ellipse(bx + bl + 12, 0, r * 2.2, r * 2.2);
    ctx.fill();
    ctx.restore();
  }

  function drawPauldron(sx, sy, P, withCannon, T, bob, side) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(0.82 * (side < 0 ? -1 : 1), 0.82);
    poly([[-6, -40], [-34, -64], [16, -38]], P.lo, P.line);
    poly([[-42, -18], [-8, -40], [36, -32], [54, -8], [46, 24], [-32, 28]], vGrad(-40, 28, P.hi, P.armor, P.lo), P.line);
    poly([[-34, -4], [46, -14], [50, -5], [-32, 4]], P.accent);
    poly([[-28, 12], [44, 6], [42, 22], [-26, 26]], P.lo, P.line);
    ctx.fillStyle = P.frame;
    for (let i = 0; i < 3; i++) {
      ellipse(-16 + i * 22, -24 + i * 2, 2.5, 2.5);
      ctx.fill();
    }
    if (withCannon) {
      rr(-30, -58, 62, 18, 5);
      ctx.fillStyle = P.frame;
      ctx.fill();
      rr(24, -55, 30, 12, 3);
      ctx.fillStyle = P.frameHi;
      ctx.fill();
      ctx.fillStyle = P.accent;
      ctx.fillRect(-24, -54, 10, 10);
      if (T.muzzle > 0) {
        ctx.save();
        ctx.shadowColor = '#9ff';
        ctx.shadowBlur = 30;
        ctx.fillStyle = '#e6ffff';
        ellipse(64, -49, 22, 11);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // Khớp tròn cơ khí (gối, cổ chân): vòng khung tối, đĩa giáp, trục giữa.
  function drawJointDisc(x, y, r, P) {
    ellipse(x, y, r, r);
    ctx.fillStyle = P.frame;
    ctx.fill();
    ellipse(x, y, r * 0.72, r * 0.72);
    ctx.fillStyle = vGrad(y - r, y + r, P.frameHi, P.lo, P.frame);
    ctx.fill();
    ctx.strokeStyle = P.line;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ellipse(x, y, r * 0.3, r * 0.3);
    ctx.fillStyle = P.hi;
    ctx.fill();
  }

  // Chân hạng nặng: đùi khối, khớp gối tròn lớn, ống chân giáp nhiều lớp có khe tản nhiệt,
  // khớp cổ chân tròn và bàn chân to bè.
  function drawTitanLeg(hx, hy, fx, fy, P, lift) {
    // Tổng chiều dài chân ≈ khoảng cách hông–cổ chân khi đứng → chân gần như thẳng;
    // chỉ gập gối khi thủ, nhún hoặc nhấc chân bước.
    const k = ik(hx, hy, fx, fy - 26, 94, 100, -1);
    const armorG = (a, b) => vGrad(a, b, P.hi, P.armor, P.lo);
    // đùi: khung + piston thủy lực phía sau + giáp trước
    seg(hx, hy, k.jx, k.jy, (len) => {
      ctx.scale(1, 1.35); // đùi dày
      rr(-10, -20, len + 14, 40, 14);
      ctx.fillStyle = P.frame;
      ctx.fill();
      // piston (mặt sau đùi)
      ctx.fillStyle = P.frameHi;
      ctx.fillRect(len * 0.15, 12, len * 0.6, 8);
      ctx.fillStyle = P.lo;
      ctx.fillRect(len * 0.55, 14, len * 0.35, 4);
      // giáp đùi trước, hai lớp chồng
      poly([[0, -26], [len * 0.55, -28], [len * 0.62, -6], [4, 2]], armorG(-28, 2), P.line);
      poly([[len * 0.5, -25], [len - 2, -22], [len + 2, -2], [len * 0.56, -4]], armorG(-25, -2), P.line);
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(8, -18);
      ctx.lineTo(len * 0.5, -20);
      ctx.stroke();
    });
    // ống chân: khung + giáp lớn loe dần về cổ chân
    seg(k.jx, k.jy, k.ex, k.ey, (len) => {
      ctx.scale(1, 1.3); // ống chân dày
      rr(-6, -16, len + 8, 32, 10);
      ctx.fillStyle = P.frame;
      ctx.fill();
      poly([[2, -24], [len * 0.45, -28], [len - 2, -30], [len + 6, -20], [len + 4, 10], [len * 0.5, 6], [4, 4]], armorG(-30, 10), P.line);
      // tấm giáp phụ phía sau bắp chân
      poly([[len * 0.15, 8], [len * 0.7, 10], [len * 0.62, 24], [len * 0.2, 20]], armorG(8, 24), P.line);
      // khe tản nhiệt
      ctx.strokeStyle = P.frame;
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 4; i++) {
        const x = len * (0.5 + i * 0.1);
        ctx.beginPath();
        ctx.moveTo(x, -22);
        ctx.lineTo(x + 6, -8);
        ctx.stroke();
      }
      // chỉ màu dọc mép giáp
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(6, -20);
      ctx.lineTo(len * 0.42, -24);
      ctx.stroke();
    });
    // khớp gối tròn lớn + mảnh giáp chụp phía trên
    drawJointDisc(k.jx, k.jy, 23, P);
    ctx.save();
    ctx.translate(k.jx, k.jy);
    ctx.scale(1.25, 1.25);
    poly([[4, -26], [22, -20], [28, -4], [18, 0], [8, -12]], armorG(-26, 0), P.line);
    ctx.restore();
    // bàn chân
    ctx.save();
    ctx.translate(k.ex, k.ey);
    ctx.rotate(-lift * 0.25);
    ctx.translate(0, 26);
    ctx.scale(1.2, 1.2);
    ctx.translate(0, -26);
    poly([[-34, 26], [52, 26], [50, 14], [30, 4], [8, -6], [-18, -6], [-32, 8]], P.frame, P.line);
    // giáp mu bàn chân
    poly([[-10, -4], [16, -8], [40, 8], [36, 16], [-6, 14]], armorG(-8, 16), P.line);
    // mũi chân + gót
    poly([[34, 12], [54, 16], [54, 26], [32, 26]], P.lo, P.line);
    poly([[-36, 14], [-20, 10], [-20, 26], [-38, 26]], P.lo, P.line);
    ctx.fillStyle = P.accent;
    ctx.fillRect(4, 16, 22, 3);
    ctx.restore();
    // khớp cổ chân tròn (vẽ sau cùng để nằm trên bàn chân)
    drawJointDisc(k.ex, k.ey, 16, P);
  }

  // TEMPEST: đầu cảm biến — khối đầu thấp, vây chắn hai bên, một mắt tròn lớn có ống kính xoay.
  function drawSensorHead(hy, F, lc) {
    ctx.save();
    ctx.translate(-8, 0);
    ctx.scale(1.15, 1.15);
    ctx.translate(0, -hy * (1 - 1 / 1.15));
    // khối đầu
    poly([[-18, hy - 12], [-6, hy - 26], [30, hy - 28], [46, hy - 14], [44, hy + 8], [24, hy + 14], [-14, hy + 12]], vGrad(hy - 28, hy + 14, F.hi, F.armor, F.lo), F.line);
    // vây chắn sau đầu + ăng-ten ngắn
    poly([[-18, hy - 12], [-36, hy - 8], [-30, hy + 8], [-14, hy + 10]], F.lo, F.line);
    ctx.strokeStyle = F.frameHi;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(4, hy - 26);
    ctx.lineTo(-6, hy - 44);
    ctx.stroke();
    ctx.fillStyle = F.accent;
    ellipse(-6, hy - 45, 3, 3);
    ctx.fill();
    // mắt tròn
    ellipse(28, hy - 6, 13, 13);
    ctx.fillStyle = F.frame;
    ctx.fill();
    ctx.save();
    ctx.shadowColor = lc;
    ctx.shadowBlur = 22;
    ellipse(30, hy - 6, 8, 8);
    ctx.fillStyle = lc;
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(30, hy - 6);
    ctx.rotate(game.t * 3);
    ctx.strokeStyle = 'rgba(10,30,30,0.6)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      ctx.rotate(PI2 / 3);
      ctx.beginPath();
      ctx.moveTo(2, 0);
      ctx.lineTo(7, 0);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ellipse(32, hy - 8, 2, 2);
    ctx.fill();
    // hàm dưới
    ctx.fillStyle = F.frame;
    ctx.fillRect(10, hy + 8, 28, 3);
    ctx.restore();
  }

  // Độ mở nắp bệ phóng tên lửa (0 → 1) theo trạng thái nạp/phóng.
  function launcherOpen(T) {
    const a = T.arms.R;
    if (T.charge) return clamp(T.charge.t / 0.15, 0, 1);
    if (a && a.name === 'cannon') return a.t < a.windup + a.m.active ? 1 : 1 - clamp((a.t - a.windup - a.m.active) / a.m.recover, 0, 1);
    return 0;
  }

  // Tâm bệ phóng trên ngực (toạ độ nội bộ của Titan, trước khi nâng thân).
  const LAUNCHER = { x: 5, y: -264 };

  // TEMPEST: ngực là bệ phóng 6 ống (3×2). Hai nắp giáp trượt lên/xuống để lộ đầu đạn.
  function drawChestLauncher(T, by, F, lc) {
    const open = easeOut(launcherOpen(T));
    const cx = LAUNCHER.x;
    const cy = LAUNCHER.y + by;
    const w = 66;
    const h = 50;
    ctx.save();
    ctx.translate(cx, cy);
    // khung bệ
    poly([[-w / 2 - 6, -h / 2 - 4], [w / 2 + 8, -h / 2 - 6], [w / 2 + 12, h / 2 + 2], [-w / 2 - 4, h / 2 + 6]], F.frameHi, F.line, 2);
    rr(-w / 2, -h / 2, w, h, 5);
    ctx.fillStyle = '#0b0d10';
    ctx.fill();
    // 6 ống phóng + đầu đạn
    const ready = T.missileCD > 0 ? Math.floor(6 * (1 - T.missileCD / MISSILE_RELOAD)) : 6;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        const loaded = r * 3 + c < ready;
        const x = -w / 2 + 12 + c * 21;
        const y = -h / 2 + 13 + r * 24;
        ellipse(x, y, 8.5, 8.5);
        ctx.fillStyle = F.frame;
        ctx.fill();
        ctx.strokeStyle = F.frameHi;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        if (loaded) {
          ellipse(x, y, 5, 5);
          ctx.fillStyle = '#d9dee4';
          ctx.fill();
          ellipse(x, y, 2.4, 2.4);
          ctx.fillStyle = open > 0.5 ? '#ffd36b' : F.accent;
          ctx.fill();
        }
      }
    }
    // hai nắp giáp trượt ra trên/dưới
    const slide = open * (h / 2 + 2);
    ctx.save();
    rr(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 5);
    ctx.clip();
    poly([[-w / 2 - 2, -h / 2 - 2 - slide], [w / 2 + 2, -h / 2 - 2 - slide], [w / 2 + 2, -slide], [-w / 2 - 2, -slide]], vGrad(-h / 2, 0, F.hi, F.armor, F.lo), F.line);
    poly([[-w / 2 - 2, slide], [w / 2 + 2, slide], [w / 2 + 2, h / 2 + 2 + slide], [-w / 2 - 2, h / 2 + 2 + slide]], vGrad(0, h / 2, F.armor, F.lo, F.lo), F.line);
    ctx.fillStyle = F.accent;
    ctx.fillRect(-w / 2 + 6, -6 - slide, w - 12, 3);
    ctx.fillRect(-w / 2 + 6, 3 + slide, w - 12, 3);
    ctx.restore();
    // đèn trạng thái hai bên (theo màu Link)
    ctx.save();
    ctx.shadowColor = lc;
    ctx.shadowBlur = 14;
    ctx.fillStyle = lc;
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(-w / 2 - 12, -h / 2 + 6 + i * 14, 4, 8);
      ctx.fillRect(w / 2 + 10, -h / 2 + 6 + i * 14, 4, 8);
    }
    ctx.restore();
    // khói/chớp lửa khi vừa phóng
    if (T.muzzle > 0 && T.def.missiles) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,210,120,${T.muzzle / 0.12 * 0.8})`;
      ellipse(0, 0, w * 0.7, h * 0.7);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // 0 → 1: lò phản ứng sáng rực khi VANGUARD tung chiêu đặc biệt
  function reactorBoost(T) {
    return T.beaming && T.def.ult === 'reactor' ? 1 : 0;
  }

  // Tên lửa vệ tinh: vòng ngắm bám mục tiêu + tia dẫn đường từ trời + tên lửa lao xuống.
  function drawStrikes() {
    for (const S of game.strikes) {
      if (S.done || S.t < 0) continue;
      const x = S.x - game.cam;
      const k = clamp(S.t / STRIKE_DELAY, 0, 1);
      const col = '#5dffb0';
      ctx.save();
      // tia dẫn đường mờ từ trên trời
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(93,255,176,${0.15 + 0.25 * k})`;
      ctx.lineWidth = 2 + 4 * k;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, S.y);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      // vòng ngắm co dần và xoay
      const r = 70 - 40 * k;
      ctx.save();
      ctx.translate(x, S.y);
      ctx.rotate(game.t * 2);
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ellipse(0, 0, r, r);
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        ctx.rotate(PI2 / 4);
        ctx.beginPath();
        ctx.moveTo(r - 12, 0);
        ctx.lineTo(r + 14, 0);
        ctx.stroke();
      }
      ctx.fillStyle = col;
      ellipse(0, 0, 4, 4);
      ctx.fill();
      ctx.restore();
      // tên lửa lao xuống trong 0,35s cuối
      const fall = clamp((S.t - (STRIKE_DELAY - 0.35)) / 0.35, 0, 1);
      if (fall > 0) {
        const my = lerp(-80, S.y, fall * fall);
        ctx.globalCompositeOperation = 'lighter';
        const tg = ctx.createLinearGradient(x, my - 220, x, my);
        tg.addColorStop(0, 'rgba(255,120,30,0)');
        tg.addColorStop(1, 'rgba(255,230,160,0.95)');
        ctx.fillStyle = tg;
        ctx.fillRect(x - 7, my - 220, 14, 220);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#d9dee4';
        rr(x - 8, my - 40, 16, 44, 6);
        ctx.fill();
        ctx.fillStyle = '#5dffb0';
        ctx.fillRect(x - 8, my - 6, 16, 6);
        poly([[x - 8, my - 30], [x - 18, my - 44], [x - 8, my - 40]], '#8a94a0');
        poly([[x + 8, my - 30], [x + 18, my - 44], [x + 8, my - 40]], '#8a94a0');
      }
      ctx.restore();
    }
  }

  function drawTitan(T) {
    if (!T) return;
    const ja = T.arms.R;
    if (ja && ja.name === 'jet' && ja.t < ja.windup) {
      const K = game.kaiju;
      const inRange = specialCanHit(K);
      const x0 = T.x - game.cam;
      // vạch báo kéo tới đúng chỗ Titan sẽ đứng sau đòn (sát quái)
      const len = inRange ? specialStandX(T, K) - T.x : (K ? Math.sign(K.x - T.x) || T.facing : T.facing) * SPECIAL_RANGE;
      const k = ja.t / ja.windup;
      ctx.fillStyle = inRange ? `rgba(127,246,255,${0.15 + 0.25 * k})` : `rgba(255,155,61,${0.12 + 0.2 * k})`;
      ctx.fillRect(Math.min(x0, x0 + len), GROUND - 5, Math.abs(len), 10);
      ctx.fillRect(x0 + len - (len > 0 ? 4 : 0), GROUND - 22, 4, 34);
    }
    const flash = T.hitFlash > 0;
    const lc = linkColor(T.link);
    const F = flash ? MECH.flash : T.def.pal.front;
    const B = flash ? MECH.flash : T.def.pal.back;
    // Chu kỳ bước đi: hai chân lệch pha, thân nhún theo nhịp bước.
    const ph = T.walkT * 6.5;
    const s1 = Math.sin(ph);
    const s2 = Math.sin(ph + Math.PI);
    const bob = T.moving ? -Math.abs(Math.cos(ph)) * 8 + 4 : Math.sin(game.t * 2) * 2.5;
    let lift1 = T.moving ? Math.max(0, Math.cos(ph)) : 0;
    let lift2 = T.moving ? Math.max(0, -Math.cos(ph)) : 0;
    let crouch = T.guard ? 14 : T.stagger > 0 ? 10 : 0;
    let flameK = null; // độ mạnh lửa thruster phụt xuống (null = tắt)
    const ra = T.arms.R;
    if (T.def.special === 'leap' && !T.leap && ra && ra.name === 'jet' && ra.t < ra.windup) {
      const k = ra.t / ra.windup;
      crouch = 26 * easeOut(k);
      if (k > 0.5) flameK = 0.9 - (k - 0.5);
    }
    if (T.leap) {
      if (T.airY > 6) {
        lift1 = 0.8;
        lift2 = 0.6;
        crouch = 10;
      }
      if (T.leap.t < LEAP.up + LEAP.smash) flameK = T.leap.t < LEAP.up ? 0 : 0.5;
    }
    let spin = 1;
    let spreadFeet = 0;
    let celPh = null;
    if (T.celebrate) {
      celPh = celebratePhase(T.celebrate);
      if (celPh.name === 'crouch') crouch = 26 * easeOut(celPh.k);
      else if (celPh.name === 'jump') {
        crouch = celPh.k < 0.15 ? 26 * (1 - celPh.k / 0.15) : celPh.k > 0.85 ? 30 * ((celPh.k - 0.85) / 0.15) : -10;
        spin = Math.cos(celPh.k * Math.PI); // xoay nửa vòng (lật mặt) trên không
        if (Math.abs(spin) < 0.12) spin = 0.12 * Math.sign(spin || 1);
      } else if (celPh.name === 'pose') {
        crouch = 30 * (1 - easeOut(Math.min(1, celPh.k * 3))) + 6;
        spreadFeet = 1;
      }
      if (celPh.name === 'jump') spreadFeet = celPh.k > 0.7 ? (celPh.k - 0.7) / 0.3 : 0;
    }
    const by = bob + crouch;

    // tia lửa bắn ra khi giáp còn dưới 35%
    if (T.hp / T.maxHp < 0.35 && Math.random() < 0.08) {
      burst(T.x + rand(-50, 50), GROUND - (BODY_LIFT + rand(180, 320)) * TITAN_SCALE, 4, pick(['#ffd36b', '#ff9b3d', '#ffffff']), 220, 0.4, 3, 700);
    }

    // bụi khi bàn chân chạm đất
    if (T.moving) {
      const c = Math.cos(ph);
      if (T.lastStep !== undefined && Math.sign(c) !== Math.sign(T.lastStep)) {
        burst(T.x + (c > 0 ? 1 : -1) * 20 * T.facing, GROUND - 4, 6, '#7d8591', 120, 0.8, 7, -20, true);
        if (Math.random() < 0.5) shake(1.5);
      }
      T.lastStep = c;
    }

    ctx.save();
    ctx.translate(T.x - game.cam, GROUND);
    ctx.fillStyle = `rgba(0,0,0,${0.42 * (1 - T.airY / 300)})`;
    ellipse(0, 2, 105 * TITAN_SCALE * (1 - T.airY / 400), 11);
    ctx.fill();
    ctx.translate(0, -T.airY);
    ctx.scale(T.facing * TITAN_SCALE * spin, TITAN_SCALE);
    if (T.inv > 0) ctx.globalAlpha = 0.6 + 0.3 * Math.sin(game.t * 60);

    // thruster phụt lửa xuống khi bật nhảy ăn mừng
    if (celPh && celPh.name === 'jump' && celPh.k < 0.75) flameK = celPh.k;
    if (flameK != null) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const fx0 = -78 + i * 9;
        const l = rand(120, 200) * (1 - flameK * 0.8);
        const g = ctx.createLinearGradient(0, -210 - BODY_LIFT, 0, -210 - BODY_LIFT + l);
        g.addColorStop(0, 'rgba(220,250,255,0.95)');
        g.addColorStop(0.4, 'rgba(120,210,255,0.7)');
        g.addColorStop(1, 'rgba(60,140,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(fx0 - 7, -212 - BODY_LIFT);
        ctx.lineTo(fx0, -212 - BODY_LIFT + l);
        ctx.lineTo(fx0 + 7, -212 - BODY_LIFT);
        ctx.fill();
      }
      ctx.restore();
    }

    // lửa thruster khi lướt
    if (T.dashT > 0.2) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const dir = -Math.sign(T.vx * T.facing || -1);
      for (let i = 0; i < 3; i++) {
        const l = rand(60, 120);
        const g = ctx.createLinearGradient(-70, 0, -70 + dir * l, 0);
        g.addColorStop(0, 'rgba(180,240,255,0.9)');
        g.addColorStop(1, 'rgba(60,140,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-60 + (dir > 0 ? -10 : 0), -290 - BODY_LIFT + i * 30 + by);
        ctx.lineTo(-60 + dir * l, -280 - BODY_LIFT + i * 30 + by);
        ctx.lineTo(-60 + (dir > 0 ? -10 : 0), -270 - BODY_LIFT + i * 30 + by);
        ctx.fill();
      }
      ctx.restore();
    }

    // Toàn thân xoay nhẹ quanh hông theo độ ngả người.
    const lean = titanLean(T);
    const hip = -158 - BODY_LIFT + by;

    // chân sau + tay sau (trong bóng tối)
    drawTitanLeg(-26, hip + 6, -34 - 44 * spreadFeet + s2 * (T.moving ? 24 : 0) - crouch * 0.5, -lift2 * 22, B, lift2);

    ctx.save();
    ctx.translate(0, hip);
    ctx.rotate(lean);
    ctx.translate(0, -hip - BODY_LIFT);
    drawTitanArm(T, 'L', -60, -284 + by, B, lc);
    drawPauldron(-62, -290 + by, B, !T.def.missiles, T, by, -1);
    ctx.restore();

    drawTitanLeg(26, hip + 6, 36 + 50 * spreadFeet + s1 * (T.moving ? 24 : 0) + crouch * 0.6, -lift1 * 22, F, lift1);

    // hông + váy giáp
    rr(-42, hip - 18, 84, 34, 8);
    ctx.fillStyle = F.frame;
    ctx.fill();
    poly([[2, hip - 14], [46, hip - 10], [40, hip + 26], [8, hip + 22]], vGrad(hip - 14, hip + 26, F.hi, F.armor, F.lo), F.line);
    poly([[-46, hip - 12], [-6, hip - 14], [-10, hip + 20], [-40, hip + 24]], vGrad(hip - 14, hip + 24, B.hi, B.armor, B.lo), B.line);

    ctx.save();
    ctx.translate(0, hip);
    ctx.rotate(lean);
    ctx.translate(0, -hip - BODY_LIFT);

    // ba lô thruster
    poly([[-92, -306 + by], [-60, -318 + by], [-50, -214 + by], [-84, -206 + by]], F.frame, F.line);
    ctx.save();
    ctx.globalAlpha *= 0.5 + 0.5 * Math.sin(game.t * 5);
    ctx.fillStyle = lc;
    for (let i = 0; i < 3; i++) ctx.fillRect(-84, -290 + i * 26 + by, 8, 14);
    ctx.restore();

    // eo
    rr(-28, -216 + by, 56, 52, 6);
    ctx.fillStyle = F.frame;
    ctx.fill();
    ctx.fillStyle = F.frameHi;
    for (let i = 0; i < 3; i++) ctx.fillRect(-22, -206 + i * 13 + by, 44, 4);

    // ngực
    poly(
      [[-62, -214 + by], [46, -216 + by], [80, -256 + by], [72, -302 + by], [36, -322 + by], [-46, -320 + by], [-72, -280 + by]],
      vGrad(-322 + by, -214 + by, F.hi, F.armor, F.lo), F.line, 2,
    );
    const chestPts = [[-62, -214 + by], [46, -216 + by], [80, -256 + by], [72, -302 + by], [36, -322 + by], [-46, -320 + by], [-72, -280 + by]];
    clipPoly(chestPts, () => {
      // dải phản quang ánh trăng ở mép trên + đường ghép giáp + đinh tán
      ctx.fillStyle = flash ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.moveTo(-46, -320 + by);
      ctx.lineTo(36, -322 + by);
      ctx.lineTo(44, -312 + by);
      ctx.lineTo(-50, -308 + by);
      ctx.fill();
      ctx.strokeStyle = F.line;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-72, -280 + by);
      ctx.lineTo(-34, -262 + by);
      ctx.moveTo(80, -256 + by);
      ctx.lineTo(44, -262 + by);
      ctx.moveTo(-40, -300 + by);
      ctx.lineTo(-56, -232 + by);
      ctx.moveTo(56, -300 + by);
      ctx.lineTo(62, -236 + by);
      ctx.stroke();
      ctx.fillStyle = F.frame;
      for (const [x, y] of [[-60, -284], [-48, -240], [64, -284], [58, -240], [-30, -310], [24, -312]]) {
        ellipse(x, y + by, 2.4, 2.4);
        ctx.fill();
      }
      // xước xát và vết cháy xém khi giáp bị tổn hại
      const dmg = 1 - T.hp / T.maxHp;
      if (dmg > 0.3) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.7, (dmg - 0.3) * 1.4);
        const g = ctx.createRadialGradient(-36, -250 + by, 2, -36, -250 + by, 34);
        g.addColorStop(0, 'rgba(20,14,10,0.95)');
        g.addColorStop(1, 'rgba(20,14,10,0)');
        ctx.fillStyle = g;
        ctx.fillRect(-80, -300 + by, 90, 100);
        ctx.strokeStyle = 'rgba(30,20,15,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(48, -310 + by);
        ctx.lineTo(60, -284 + by);
        ctx.lineTo(54, -270 + by);
        ctx.moveTo(-58, -226 + by);
        ctx.lineTo(-40, -242 + by);
        ctx.stroke();
        ctx.restore();
      }
      rainSheen(-60, 70, -322 + by, -220 + by, 0.13);
    });
    poly([[-56, -300 + by], [-20, -316 + by], [-24, -240 + by], [-62, -232 + by]], 'rgba(0,0,0,0.12)');
    poly([[-44, -226 + by], [42, -228 + by], [32, -214 + by], [-38, -212 + by]], F.accent);
    poly([[-22, -298 + by], [30, -300 + by], [44, -262 + by], [32, -230 + by], [-20, -228 + by], [-34, -262 + by]], F.frame, F.line);

    if (T.def.missiles) drawChestLauncher(T, by, F, lc);
    else {
      // lò phản ứng lục giác + cánh turbine xoay
      const rx = 5;
      const ry = -264 + by;
      ctx.save();
      ctx.translate(rx, ry);
      const hex = (r) => {
        const pts = [];
        for (let i = 0; i < 6; i++) pts.push([Math.cos((i / 6) * PI2 + Math.PI / 6) * r, Math.sin((i / 6) * PI2 + Math.PI / 6) * r]);
        return pts;
      };
      poly(hex(27), F.frameHi);
      ctx.shadowColor = lc;
      ctx.shadowBlur = 34 + 50 * reactorBoost(T);
      poly(hex(21), reactorBoost(T) > 0.6 ? '#ffffff' : lc);
      ctx.shadowBlur = 0;
      ctx.rotate(game.t * (T.link >= 100 || reactorBoost(T) > 0 ? 14 + 16 * reactorBoost(T) : 5));
      ctx.strokeStyle = 'rgba(10,30,40,0.55)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        ctx.rotate(PI2 / 6);
        ctx.beginPath();
        ctx.moveTo(4, 0);
        ctx.quadraticCurveTo(12, 6, 18, 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      ellipse(0, 0, 6, 6);
      ctx.fill();
      ctx.restore();
    }


    // cổ + đầu
    rr(-14, -334 + by, 32, 16, 4);
    ctx.fillStyle = F.frame;
    ctx.fill();
    const hy = -340 + by;
    if (T.def.head === 'sensor') drawSensorHead(hy, F, lc);
    else {
      ctx.save();
      ctx.translate(-12, 0);
      ctx.scale(1.2, 1.2);
      ctx.translate(0, -hy * (1 - 1 / 1.2));
      poly([[-16, hy - 16], [18, hy - 26], [42, hy - 14], [48, hy + 4], [32, hy + 14], [-12, hy + 12]], vGrad(hy - 26, hy + 14, F.hi, F.armor, F.lo), F.line);
      poly([[-16, hy - 16], [-40, hy - 30], [-8, hy - 22]], F.accent);
      poly([[0, hy - 22], [20, hy - 36], [26, hy - 22]], F.lo, F.line);
      ctx.save();
      ctx.shadowColor = lc;
      ctx.shadowBlur = 22;
      poly([[10, hy - 8], [48, hy - 4], [46, hy + 4], [8, hy + 2]], lc);
      ctx.restore();
      ctx.fillStyle = F.frame;
      ctx.fillRect(14, hy + 6, 26, 3);
      ctx.restore();
    }

    // tay trước + giáp vai trước
    drawSlashTrail(T, 66, -280 + by);
    drawTitanArm(T, 'R', 66, -280 + by, F, lc);
    drawPauldron(68, -288 + by, F, false, T, by, 1);
    ctx.restore();

    ctx.restore();
  }

  // ============================================================ VẼ: QUÁI VẬT
  function kaijuPalette(def, flash) {
    if (flash) return def.flashPal;
    return { body: def.color, dark: def.dark, belly: def.belly, plate: def.plate, rim: def.rim };
  }

  function drawTail(K, bx, by, baseAng, C, glow, pulse) {
    const pts = [[bx, by]];
    let x = bx;
    let y = by;
    let a = baseAng;
    const n = 10;
    for (let i = 0; i < n; i++) {
      a += 0.1 + Math.sin(game.t * 2.4 - i * 0.6) * 0.06;
      x += Math.cos(a) * 36;
      y += Math.sin(a) * 36;
      pts.push([x, y]);
    }
    // đường viền thon dần
    const left = [];
    const right = [];
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[Math.min(pts.length - 1, i + 1)];
      const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
      const w = lerp(34, 4, i / (pts.length - 1));
      left.push([pts[i][0] + Math.cos(ang - Math.PI / 2) * w, pts[i][1] + Math.sin(ang - Math.PI / 2) * w]);
      right.push([pts[i][0] + Math.cos(ang + Math.PI / 2) * w, pts[i][1] + Math.sin(ang + Math.PI / 2) * w]);
    }
    poly(left.concat(right.reverse()), C.dark);
    // giáp đốt đuôi + gai
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      const ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
      const w = lerp(30, 6, i / (pts.length - 1));
      ctx.save();
      ctx.translate(p[0], p[1]);
      ctx.rotate(ang);
      poly([[-4, -w], [26, -w * 0.8], [22, 0], [-6, 0]], C.plate);
      ctx.save();
      ctx.globalAlpha *= 0.35 + pulse * 0.5;
      ctx.shadowColor = glow;
      ctx.shadowBlur = 10;
      poly([[4, -w], [12, -w - 10 - (i % 2) * 6], [18, -w * 0.85]], glow);
      ctx.restore();
      ctx.restore();
    }
    const tip = pts[pts.length - 1];
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = 20;
    ctx.fillStyle = glow;
    ellipse(tip[0], tip[1], 7, 7);
    ctx.fill();
    ctx.restore();
  }

  function drawKaijuLeg(x, step, lift, C, glow) {
    const fx = x - 6 + step * 26;
    const fy = -lift * 18;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = C.dark;
    ctx.lineWidth = 56;
    ctx.beginPath();
    ctx.moveTo(x, -120);
    ctx.lineTo(x + 30, -78);
    ctx.stroke();
    ctx.strokeStyle = C.body;
    ctx.lineWidth = 34;
    ctx.beginPath();
    ctx.moveTo(x + 30, -78);
    ctx.lineTo(fx - 14, fy - 32);
    ctx.stroke();
    ctx.lineWidth = 24;
    ctx.beginPath();
    ctx.moveTo(fx - 14, fy - 32);
    ctx.lineTo(fx, fy - 8);
    ctx.stroke();
    ctx.restore();
    poly([[fx - 26, fy], [fx + 44, fy], [fx + 30, fy - 18], [fx - 18, fy - 20]], C.dark);
    ctx.fillStyle = '#e9efe0';
    for (let i = 0; i < 3; i++) poly([[fx + 18 + i * 10, fy - 2], [fx + 34 + i * 10, fy + 2], [fx + 22 + i * 10, fy - 10]], '#d8dccd');
    ctx.save();
    ctx.globalAlpha *= 0.6;
    ctx.fillStyle = glow;
    ellipse(x + 30, -78, 5, 5);
    ctx.fill();
    ctx.restore();
  }

  function drawKaijuArm(sx, sy, claw, C, glow, far) {
    const k = ik(sx, sy, claw.x, claw.y, 88, 92, 1);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = far ? C.dark : C.body;
    ctx.lineWidth = 46;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(k.jx, k.jy);
    ctx.stroke();
    ctx.lineWidth = 34;
    ctx.beginPath();
    ctx.moveTo(k.jx, k.jy);
    ctx.lineTo(k.ex, k.ey);
    ctx.stroke();
    ctx.restore();
    // giáp cẳng tay
    seg(k.jx, k.jy, k.ex, k.ey, (len) => {
      poly([[6, -20], [len - 6, -16], [len - 14, -2], [10, -4]], C.plate);
      for (let i = 0; i < 3; i++) poly([[14 + i * 22, -20], [22 + i * 22, -34], [28 + i * 22, -18]], far ? C.dark : C.plate);
      // vuốt
      ctx.save();
      ctx.translate(len, 0);
      ctx.fillStyle = far ? C.dark : C.body;
      ellipse(4, 0, 22, 18);
      ctx.fill();
      ctx.shadowColor = glow;
      ctx.shadowBlur = far ? 0 : 14;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(14, i * 12 - 5);
        ctx.quadraticCurveTo(46, i * 16 - 8, 58, i * 20 + 14);
        ctx.quadraticCurveTo(40, i * 14 + 2, 14, i * 12 + 5);
        ctx.closePath();
        ctx.fillStyle = far ? C.dark : glow;
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function drawKaiju(K) {
    const def = K.def;
    const s = def.scale;
    const flash = K.hitFlash > 0;
    const C = kaijuPalette(def, flash);
    const mv = K.move ? KMOVES[K.move] : null;
    const fast = K.phase2 ? PHASE2_SPEED : 1;
    const wind = K.state === 'windup' && mv ? clamp(K.t / (mv.windup / fast), 0, 1) : 0;
    const glow = wind > 0.55 ? '#ff4d4d' : def.glow;
    const pulse = 0.5 + 0.5 * Math.sin(game.t * (K.phase2 ? 9 : 3));
    const ph = K.walkT * 5;
    const step = Math.sin(ph);
    const lift1 = Math.max(0, Math.cos(ph));
    const lift2 = Math.max(0, -Math.cos(ph));
    const breathe = Math.sin(game.t * 1.6) * 4;
    const tremble = wind > 0 ? Math.sin(game.t * 70) * wind * 2.5 : 0;

    ctx.save();
    ctx.translate(K.x - game.cam + tremble, GROUND + K.y);
    if (K.dying) ctx.globalAlpha = clamp(1 - (K.deathT - 1.8) / 1.3, 0, 1);
    if (K.y < 60) {
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ellipse(0, 2 - K.y, 200 * s, 13);
      ctx.fill();
    }
    ctx.scale(K.facing * s, s);
    if (K.dying) ctx.rotate(-Math.min(0.35, K.deathT * 0.15));

    // Tư thế: hạ thấp khi gồng lao húc, ngửa lên khi gầm, giật lùi khi bị đánh.
    let tilt = Math.sin(game.t * 1.6) * 0.015;
    if (K.move === 'charge') tilt = K.state === 'windup' ? 0.12 * wind : 0.14;
    if (K.move === 'roar' || K.state === 'roarIntro') tilt = K.state === 'windup' ? -0.12 * wind : -0.16;
    if (K.state === 'stun') tilt = -0.1;
    if (K.hitFlash > 0) tilt -= 0.06;
    ctx.translate(0, -110);
    ctx.rotate(tilt);
    ctx.translate(0, 110);
    const by = breathe * 0.5;

    // tay xa
    const rest = { x: 160, y: -60 + breathe };
    const raised = { x: 60, y: -320 };
    const slash = { x: 290, y: -40 };
    let claw = rest;
    if (K.move === 'claw' && mv) {
      if (K.state === 'windup') claw = { x: lerp(rest.x, raised.x, easeOut(wind)), y: lerp(rest.y, raised.y, easeOut(wind)) };
      else if (K.state === 'active') claw = slash;
      else if (K.state === 'recover') {
        const k = easeInOut(clamp(K.t / (mv.recover / fast), 0, 1));
        claw = { x: lerp(slash.x, rest.x, k), y: lerp(slash.y, rest.y, k) };
      }
    } else if (K.state === 'smash') {
      claw = K.swipe > 0 ? slash : { x: lerp(rest.x, raised.x, 0.75), y: lerp(rest.y, raised.y, 0.75) };
    } else if (K.move === 'charge') {
      claw = { x: 210, y: -30 };
    } else if (K.state === 'roarIntro' || K.move === 'roar') {
      claw = { x: 120, y: -230 };
    }
    const farClaw = { x: claw.x - 40 + Math.sin(game.t * 2 + 1) * 6, y: claw.y + 14 };
    drawKaijuArm(70, -170 + by, farClaw, C, glow, true);
    drawKaijuLeg(-80, -step, lift2, { ...C, body: C.dark }, glow);

    // đuôi
    let swing = Math.sin(game.t * 1.7) * 0.15;
    if (K.move === 'tail' && mv) {
      if (K.state === 'windup') swing = -0.3 * wind;
      else if (K.state === 'active') swing = 2.75;
      else if (K.state === 'recover') swing = 2.75 * (1 - easeInOut(clamp(K.t / (mv.recover / fast), 0, 1)));
    }
    drawTail(K, -135, -135 + by, Math.PI + 0.12 + swing, C, glow, pulse);

    // thân gù cơ bắp
    const bodyPath = () => {
      ctx.beginPath();
      ctx.moveTo(-155, -110 + by);
      ctx.bezierCurveTo(-158, -190, -90, -215 + by, -20, -238 + by);
      ctx.bezierCurveTo(40, -268 + by, 115, -258 + by, 145, -205 + by);
      ctx.bezierCurveTo(158, -160, 135, -96, 102, -78);
      ctx.bezierCurveTo(40, -58, -60, -60, -112, -70);
      ctx.bezierCurveTo(-142, -76, -156, -92, -155, -110 + by);
      ctx.closePath();
    };
    const bodyGrad = ctx.createLinearGradient(0, -270, 0, -60);
    bodyGrad.addColorStop(0, C.rim);
    bodyGrad.addColorStop(0.4, C.body);
    bodyGrad.addColorStop(1, C.dark);
    ctx.fillStyle = bodyGrad;
    bodyPath();
    ctx.fill();
    ctx.save();
    bodyPath();
    ctx.clip();
    // da vảy
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1.5;
    for (let row = 0; row < 9; row++) {
      const y = -250 + row * 20 + by;
      ctx.beginPath();
      for (let x = -160 + (row % 2) * 9; x < 160; x += 18) {
        ctx.moveTo(x, y);
        ctx.arc(x + 9, y, 9, Math.PI, 0, true);
      }
      ctx.stroke();
    }
    // khối cơ vai & đùi
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(60, -230 + by);
    ctx.quadraticCurveTo(30, -160, 70, -100);
    ctx.moveTo(-70, -200 + by);
    ctx.quadraticCurveTo(-110, -140, -80, -84);
    ctx.stroke();
    // gân phát quang đập theo nhịp
    ctx.save();
    ctx.globalAlpha *= 0.25 + pulse * 0.45;
    ctx.strokeStyle = glow;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-120, -150);
    ctx.quadraticCurveTo(-60, -170, -20, -140);
    ctx.quadraticCurveTo(10, -120, 50, -150);
    ctx.moveTo(-20, -140);
    ctx.lineTo(-30, -105);
    ctx.moveTo(50, -150);
    ctx.quadraticCurveTo(80, -170, 110, -150);
    ctx.stroke();
    ctx.restore();
    // ánh ướt dọc lưng
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-120, -175 + by);
    ctx.bezierCurveTo(-80, -205 + by, -20, -230 + by, 40, -248 + by);
    ctx.stroke();
    rainSheen(-140, 140, -250 + by, -80, 0.57);
    ctx.restore();

    // bụng phát quang
    ctx.save();
    ctx.globalAlpha *= 0.25 + pulse * 0.25;
    ctx.strokeStyle = def.glow;
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-90 + i * 40, -78 + Math.abs(i - 2) * 3);
      ctx.quadraticCurveTo(-75 + i * 40, -100, -62 + i * 40, -82 + Math.abs(i - 2) * 3);
      ctx.stroke();
    }
    ctx.restore();

    // mai giáp + đường nối phát sáng + gai lưng
    const spine = [[-128, -170], [-92, -202], [-50, -226], [0, -244], [52, -252], [104, -236]];
    spine.forEach(([x, y], i) => {
      y += by;
      ctx.save();
      ctx.translate(x, y + 16);
      ctx.rotate(-0.35 + i * 0.12);
      ctx.fillStyle = C.plate;
      ctx.beginPath();
      ctx.ellipse(0, 0, 40, 26, 0, Math.PI, PI2);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.globalAlpha *= 0.4 + 0.6 * Math.max(pulse * 0.6, wind);
      ctx.strokeStyle = glow;
      ctx.shadowColor = glow;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 40, 26, 0, Math.PI * 1.05, PI2 * 0.98);
      ctx.stroke();
      const h = 30 + (i % 2) * 18 + (K.phase2 ? 14 : 0);
      ctx.shadowBlur = 20 + wind * 20;
      poly([[-14, -20], [-24, -20 - h], [10, -24]], glow);
      ctx.restore();
      ctx.restore();
    });

    drawKaijuLeg(40, step, lift1, C, glow);

    // cổ + đầu
    let jaw = 0.08 + Math.sin(game.t * 2) * 0.04;
    if (K.state === 'roarIntro') jaw = 0.75;
    if (K.move === 'roar') jaw = K.state === 'windup' ? 0.2 + wind * 0.55 : 0.75;
    if (K.move === 'spit') jaw = K.state === 'windup' ? 0.15 + wind * 0.45 : 0.6;
    if (K.move === 'charge' && K.state !== 'windup') jaw = 0.45;
    if (K.move === 'claw' && K.state === 'active') jaw = 0.35;
    if (K.state === 'stun') jaw = 0.3 + Math.sin(game.t * 8) * 0.05;
    const hx = 182;
    const hy = -192 + by + (K.move === 'charge' ? 22 : 0);

    ctx.fillStyle = C.body;
    ctx.beginPath();
    ctx.moveTo(90, -240 + by);
    ctx.quadraticCurveTo(hx - 20, hy - 50, hx - 10, hy - 20);
    ctx.lineTo(hx - 20, hy + 26);
    ctx.quadraticCurveTo(130, -110, 96, -110);
    ctx.closePath();
    ctx.fill();

    if (jaw > 0.2) {
      ctx.save();
      ctx.shadowColor = def.glow;
      ctx.shadowBlur = 34;
      ctx.fillStyle = def.glow;
      ctx.globalAlpha *= 0.7;
      ellipse(hx + 26, hy + 20, 44, 16 * jaw + 4);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(hx - 40, hy + 10);
    ctx.rotate(jaw);
    poly([[0, -6], [118, 2], [108, 22], [70, 30], [0, 26]], C.dark);
    for (let i = 0; i < 6; i++) poly([[22 + i * 15, 0], [27 + i * 15, -13], [33 + i * 15, 1]], '#e9efe0');
    ctx.restore();

    if (jaw > 0.25) {
      // nước dãi axit nhỏ xuống
      ctx.save();
      ctx.strokeStyle = def.glow;
      ctx.globalAlpha *= 0.7;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const x = hx - 10 + i * 26;
        const len = 18 + ((game.t * 40 + i * 13) % 26);
        ctx.beginPath();
        ctx.moveTo(x, hy + 22);
        ctx.lineTo(x + 2, hy + 22 + len);
        ctx.stroke();
      }
      ctx.restore();
    }
    const headGrad = ctx.createLinearGradient(0, hy - 60, 0, hy + 20);
    headGrad.addColorStop(0, C.rim);
    headGrad.addColorStop(1, C.body);
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.moveTo(hx - 50, hy - 32);
    ctx.quadraticCurveTo(hx + 10, hy - 66, hx + 74, hy - 24);
    ctx.lineTo(hx + 98, hy - 4);
    ctx.lineTo(hx + 86, hy + 12);
    ctx.lineTo(hx - 44, hy + 20);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 6; i++) poly([[hx - 18 + i * 16, hy + 12], [hx - 12 + i * 16, hy + 27], [hx - 6 + i * 16, hy + 12]], '#e9efe0');

    // sừng + giáp trán
    poly([[hx - 24, hy - 44], [hx - 92, hy - 84], [hx - 120, hy - 76], [hx - 40, hy - 30]], C.dark);
    poly([[hx, hy - 50], [hx - 40, hy - 100], [hx - 56, hy - 96], [hx - 14, hy - 40]], C.plate);
    poly([[hx - 40, hy - 38], [hx + 36, hy - 46], [hx + 58, hy - 30], [hx - 4, hy - 24]], C.plate);

    // ba con mắt — con lớn đỏ rực khi đang gồng
    const ex = hx + 30;
    const ey = hy - 22;
    const blink = (game.t % 4.3) < 0.12 ? 0.15 : 1;
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = 26 + wind * 24;
    ctx.fillStyle = glow;
    ellipse(ex, ey, 16, 11 * blink);
    ctx.fill();
    ellipse(ex - 24, ey + 6, 5, 4 * blink);
    ctx.fill();
    ellipse(ex + 26, ey + 10, 4, 3 * blink);
    ctx.fill();
    ctx.restore();
    if (blink > 0.5) {
      ctx.fillStyle = '#05080c';
      ellipse(ex + 4, ey, 3.5, 9);
      ctx.fill();
    }

    // tay gần
    drawKaijuArm(100, -160 + by, claw, C, glow, false);

    ctx.restore();

    // cảnh báo đòn sắp ra
    if (K.state === 'windup' && mv) {
      const sx = K.x - game.cam;
      const top = GROUND - 340 * s;
      const danger = mv.unblockable || K.move === 'roar';
      const col = danger ? '#ff4d4d' : '#ffd84d';
      const bl = Math.sin(game.t * 30) > 0 ? 1 : 0.6;
      text('!', sx, top - 14, { size: 46, align: 'center', color: col, glow: col, alpha: bl });
      text(MOVE_LABEL[K.move], sx, top + 14, { size: 16, align: 'center', color: col });
      if (K.move === 'charge') {
        ctx.fillStyle = `rgba(255,60,60,${0.12 + wind * 0.2})`;
        const x0 = K.facing > 0 ? sx : sx - 640;
        ctx.fillRect(x0, GROUND - 6, 640, 12);
      }
    }
  }

  // ============================================================ VẼ: ĐẠN, CHÙM TIA, HẠT
  function drawProjectiles() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of game.projectiles) {
      if (p.owner === 'titan' && p.missile) {
        // tên lửa: thân thon, đầu sáng, lửa đuôi
        const x = p.x - game.cam;
        const ang = Math.atan2(p.vy, p.vx);
        ctx.save();
        ctx.translate(x, p.y);
        ctx.rotate(ang);
        const fl = 18 + Math.random() * 14;
        const fg = ctx.createLinearGradient(-8, 0, -8 - fl, 0);
        fg.addColorStop(0, 'rgba(255,240,180,0.95)');
        fg.addColorStop(1, 'rgba(255,90,20,0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.moveTo(-8, -4);
        ctx.lineTo(-8 - fl, 0);
        ctx.lineTo(-8, 4);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#d9dee4';
        rr(-9, -3.5, 16, 7, 3);
        ctx.fill();
        ctx.fillStyle = '#5dffb0';
        ctx.fillRect(4, -3.5, 4, 7);
        ctx.restore();
        continue;
      }
      if (p.owner === 'titan') {
        // khối plasma: lõi trắng, quầng xanh, vệt đuôi
        const x = p.x - game.cam;
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const tx = x - (p.vx / sp) * 110;
        const ty = p.y - (p.vy / sp) * 110;
        const tg = ctx.createLinearGradient(x, p.y, tx, ty);
        tg.addColorStop(0, 'rgba(127,246,255,0.8)');
        tg.addColorStop(1, 'rgba(60,140,255,0)');
        ctx.strokeStyle = tg;
        ctx.lineCap = 'round';
        ctx.lineWidth = p.r * 1.4;
        ctx.beginPath();
        ctx.moveTo(x, p.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        const g = ctx.createRadialGradient(x, p.y, 0, x, p.y, p.r * 2.4);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.3, 'rgba(150,250,255,0.9)');
        g.addColorStop(1, 'rgba(60,160,255,0)');
        ctx.fillStyle = g;
        ellipse(x, p.y, p.r * 2.4 + Math.sin(game.t * 50) * 3, p.r * 2.4);
        ctx.fill();
        continue;
      }
      const c = p.color;
      ctx.shadowColor = c;
      ctx.shadowBlur = 20;
      ctx.fillStyle = c;
      ellipse(p.x - game.cam, p.y, p.r, p.r * 0.8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ellipse(p.x - game.cam, p.y, p.r * 0.4, p.r * 0.4);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBeam() {
    const B = game.beam;
    if (!B) return;
    const T = game.titan;
    const k = Math.min(1, B.t / 0.15) * Math.min(1, (B.dur - B.t) / 0.25);
    // tia phóng ra từ lò phản ứng trên ngực
    const x0 = T.x - game.cam + T.facing * 5 * TITAN_SCALE;
    const y0 = GROUND - (264 + BODY_LIFT) * TITAN_SCALE - T.airY;
    const len = 1700 * T.facing;
    const wob = Math.sin(game.t * 60) * 6;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(80,220,255,${0.25 * k})`;
    ctx.fillRect(Math.min(x0, x0 + len), y0 - 55 - wob, Math.abs(len), 110 + wob * 2);
    ctx.fillStyle = `rgba(140,240,255,${0.55 * k})`;
    ctx.fillRect(Math.min(x0, x0 + len), y0 - 26, Math.abs(len), 52);
    ctx.fillStyle = `rgba(255,255,255,${0.9 * k})`;
    ctx.fillRect(Math.min(x0, x0 + len), y0 - 9, Math.abs(len), 18);
    ctx.shadowColor = '#bff';
    ctx.shadowBlur = 50;
    ellipse(x0, y0, Math.max(0, 50 * k + wob), Math.max(0, 50 * k + wob));
    ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    for (const p of fx.particles) {
      if (!p.dust) continue;
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1) * 0.5;
      ctx.fillStyle = p.color;
      const sz = p.size * (2 - p.life / p.max);
      ctx.fillRect(p.x - game.cam - sz / 2, p.y - sz / 2, sz, sz);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of fx.particles) {
      if (p.dust) continue;
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - game.cam - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawRings() {
    for (const r of fx.rings) {
      ctx.save();
      ctx.globalAlpha = clamp(r.life, 0, 1);
      ctx.strokeStyle = r.color;
      ctx.shadowColor = r.color;
      ctx.shadowBlur = 20;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(r.x - game.cam, r.y, r.r, 0, PI2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawTexts() {
    for (const t of fx.texts) {
      text(t.str, t.x - game.cam, t.y, {
        size: t.size, align: 'center', color: t.color,
        alpha: clamp(t.life * 1.5, 0, 1), glow: 'rgba(0,0,0,0.9)', blur: 6,
      });
    }
  }

  // ============================================================ VẼ: GIAO DIỆN
  function text(str, x, y, o = {}) {
    ctx.save();
    ctx.font = `${o.weight || 700} ${o.size || 18}px ${FONT}`;
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.base || 'alphabetic';
    ctx.globalAlpha *= o.alpha == null ? 1 : o.alpha;
    if (o.glow) {
      ctx.shadowColor = o.glow;
      ctx.shadowBlur = o.blur || 16;
    }
    ctx.fillStyle = o.color || '#e8f1ff';
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function wrapText(str, x, y, maxW, lineH, o = {}) {
    ctx.save();
    ctx.font = `${o.weight || 700} ${o.size || 18}px ${FONT}`;
    const words = str.split(' ');
    let line = '';
    let yy = y;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        text(line, x, yy, o);
        line = w;
        yy += lineH;
      } else {
        line = test;
      }
    }
    if (line) text(line, x, yy, o);
    ctx.restore();
  }

  function panel(x, y, w, h, border = 'rgba(120,190,255,0.25)') {
    ctx.fillStyle = 'rgba(6,14,26,0.78)';
    rr(x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function bar(x, y, w, h, f, color, ghost) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    rr(x, y, w, h, h / 2);
    ctx.fill();
    if (ghost != null && ghost > f) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      rr(x, y, w * clamp(ghost, 0, 1), h, h / 2);
      ctx.fill();
    }
    if (f > 0) {
      ctx.fillStyle = color;
      rr(x, y, Math.max(h, w * clamp(f, 0, 1)), h, h / 2);
      ctx.fill();
    }
  }

  function drawHUD() {
    const T = game.titan;
    const K = game.kaiju;
    const lc = linkColor(T.link);

    // Titan
    panel(20, 16, 380, 104);
    text('TITAN-FRAME', 36, 38, { size: 12, color: '#7f9bb8' });
    text(T.def.name, 36, 60, { size: 20 });
    const hpf = T.hp / T.maxHp;
    bar(36, 70, 348, 14, hpf, hpf < 0.3 ? '#ff5e4d' : '#4ff0a0', T.ghost / T.maxHp);
    text(`${Math.ceil(T.hp)} / ${T.maxHp}`, 384, 98, { size: 11, align: 'right', color: '#a9bdd2' });
    bar(36, 92, 220, 8, T.energy / 100, '#5fb8ff');
    text(T.regenDelay > 0 ? 'NĂNG LƯỢNG · ĐANG CHỜ HỒI' : 'NĂNG LƯỢNG', 36, 114, { size: 10, color: T.regenDelay > 0 ? '#ff9b5e' : '#7f9bb8' });

    // Thanh nạp vũ khí L phía trên Titan
    const barY = GROUND - (BODY_LIFT + 420) * TITAN_SCALE;
    const sp = T.arms.R;
    if (sp && sp.name === 'jet' && sp.t < sp.windup) {
      const k = sp.t / sp.windup;
      const x = T.x - game.cam - 70;
      const col = T.def.pal.front.accent;
      text(T.def.special === 'leap' ? 'TỤ CHIÊU · ĐẬP PHẢN LỰC' : 'TỤ CHIÊU · ĐẤM PHẢN LỰC', x + 70, barY - 8, { size: 13, align: 'center', color: '#ffffff', glow: col, blur: 8 });
      bar(x, barY, 140, 10, k, col);
      text('trúng đòn = mất chiêu', x + 70, barY + 24, { size: 11, align: 'center', color: '#ff9b5e' });
    }
    if (T.def.missiles && T.missileCD > 0 && !T.charge) {
      const x = T.x - game.cam - 70;
      text(`NẠP ĐẠN ${Math.floor(6 * (1 - T.missileCD / MISSILE_RELOAD))}/6`, x + 70, barY - 8, { size: 13, align: 'center', color: '#ffd36b', glow: '#ff9b3d', blur: 6 });
      bar(x, barY, 140, 8, 1 - T.missileCD / MISSILE_RELOAD, '#ffd36b');
    }
    if (T.charge && T.def.missiles) {
      const k = clamp(T.charge.t / MISSILE_CHARGE, 0, 1);
      const x = T.x - game.cam - 70;
      const ok = T.charge.full;
      text(ok ? 'SẴN SÀNG — THẢ L ĐỂ PHÓNG' : `KHÓA MỤC TIÊU ${Math.floor(k * 100)}%`, x + 70, barY - 8, { size: 13, align: 'center', color: ok ? '#ffffff' : '#ffd36b', glow: ok ? '#5dffb0' : '#ff9b3d', blur: ok ? 14 : 6 });
      bar(x, barY, 140, 10, k, ok && Math.sin(game.t * 30) > 0 ? '#ffffff' : ok ? '#5dffb0' : '#ffd36b');
      if (!ok) text('thả sớm = hủy', x + 70, barY + 24, { size: 11, align: 'center', color: '#ff9b5e' });
    } else if (T.charge) {
      const lv = T.charge.level;
      const x = T.x - game.cam - 70;
      const y = barY;
      const full = lv >= 1;
      const wname = T.def.missiles ? 'TÊN LỬA' : 'PLASMA';
      text(full ? wname + ' TỐI ĐA — THẢ L' : 'NẠP ' + wname, x + 70, y - 8, { size: 13, align: 'center', color: full ? '#ffffff' : '#bff8ff', glow: '#4ff0ff', blur: full ? 14 : 6 });
      bar(x, y, 140, 10, lv, full && Math.sin(game.t * 30) > 0 ? '#ffffff' : '#7ff6ff');
      ctx.fillStyle = 'rgba(255,211,107,0.9)';
      ctx.fillRect(x + 140 * 0.6 - 1, y - 2, 2, 14);
      // vạch tối thiểu: chưa qua vạch thì chưa bắn được
      const lockK = CHARGE_LOCK / CHARGE_TIME;
      ctx.fillStyle = T.charge.t < CHARGE_LOCK ? 'rgba(255,94,77,0.95)' : 'rgba(255,255,255,0.5)';
      ctx.fillRect(x + 140 * lockK - 1, y - 2, 2, 14);
      if (T.charge.t < CHARGE_LOCK) text('ĐANG KHÓA MỤC TIÊU…', x + 70, y + 24, { size: 11, align: 'center', color: '#ff9b5e' });
    }

    // Neural Link
    const cx = W / 2;
    panel(cx - 175, 12, 350, 92, T.link >= 100 ? lc : undefined);
    text('NEURAL LINK', cx, 32, { size: 12, align: 'center', color: '#7f9bb8' });
    text(Math.round(T.link) + '%', cx, 68, { size: 32, align: 'center', color: lc, glow: lc, blur: 12 });
    bar(cx - 140, 80, 280, 8, T.link / 100, lc);
    const nodes = [
      { x: cx - 130, lbl: 'P1', f: T.p1Flash, side: 'L' },
      { x: cx + 130, lbl: 'P2', f: T.p2Flash, side: 'R' },
    ];
    if (T.syncPending) {
      const M = mods();
      const rem = 1 - (game.t - T.syncPending.t) / M.sync;
      const from = T.syncPending.arm === 'L' ? nodes[0].x : nodes[1].x;
      const to = from === nodes[0].x ? nodes[1].x : nodes[0].x;
      ctx.strokeStyle = `rgba(127,246,255,${clamp(rem, 0, 1)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(from, 54);
      ctx.lineTo(lerp(from, to, clamp(rem, 0, 1)), 54);
      ctx.stroke();
    }
    for (const n of nodes) {
      const on = clamp(n.f / 0.3, 0, 1);
      ctx.save();
      ctx.shadowColor = '#7ff6ff';
      ctx.shadowBlur = 20 * on;
      ctx.fillStyle = on > 0 ? `rgba(127,246,255,${0.3 + on * 0.7})` : 'rgba(127,160,200,0.25)';
      ellipse(n.x, 54, 16, 16);
      ctx.fill();
      ctx.restore();
      text(n.lbl, n.x, 59, { size: 13, align: 'center', color: on > 0.3 ? '#03101a' : '#cfe0f0' });
    }
    if (T.link >= 100 && !T.beaming) {
      const hold = T.linkHold > 0 ? ` · ${T.linkHold.toFixed(1)}s` : '';
      text(`${T.def.ultName} SẴN SÀNG — ĐỒNG BỘ F + J${hold}`, cx, 128, { size: 16, align: 'center', color: lc, glow: lc, alpha: 0.7 + 0.3 * Math.sin(game.t * 8) });
      if (T.linkHold > 0) bar(cx - 140, 136, 280, 5, T.linkHold / LINK_HOLD, T.linkHold < 1.5 ? '#ff9b5e' : lc);
    } else if (T.link < 25) {
      text('LINK BẤT ỔN — TITAN CHẬM CHẠP', cx, 128, { size: 15, align: 'center', color: '#ff8a3d', alpha: 0.7 + 0.3 * Math.sin(game.t * 8) });
    }

    // Quái vật
    if (K) {
      const def = K.def;
      panel(W - 400, 16, 380, 80);
      text(`${def.cat} · ABYSSAL`, W - 384, 38, { size: 12, color: '#c8909a' });
      text(def.name, W - 384, 60, { size: 20, color: def.glow, glow: def.glow, blur: 8 });
      if (K.phase2 && !K.dying) text('CUỒNG NỘ', W - 36, 60, { size: 13, align: 'right', color: '#ff5a5a', alpha: 0.6 + 0.4 * Math.sin(game.t * 10) });
      bar(W - 384, 72, 348, 12, Math.max(0, K.hp) / K.maxHp, '#ff5e7a', K.ghost / K.maxHp);
      // mũi tên khi quái vật ngoài màn hình
      const sx = K.x - game.cam;
      if (!K.dying && (sx < -60 || sx > W + 60)) {
        const left = sx < 0;
        const ax = left ? 30 : W - 30;
        const ay = GROUND - 200;
        ctx.fillStyle = '#ff5e7a';
        ctx.beginPath();
        ctx.moveTo(ax + (left ? -14 : 14), ay);
        ctx.lineTo(ax + (left ? 12 : -12), ay - 16);
        ctx.lineTo(ax + (left ? 12 : -12), ay + 16);
        ctx.closePath();
        ctx.fill();
        text(`${Math.round(Math.abs(K.x - T.x) / 10)} m`, ax + (left ? 20 : -20), ay + 36, { size: 13, align: left ? 'left' : 'right', color: '#ff9aa9' });
      }
    }

    // Thành phố
    const integ = cityIntegrity();
    panel(cx - 230, H - 62, 460, 46);
    text(`THÀNH PHỐ · ${WAVES[game.wave].district.toUpperCase()}`, cx - 214, H - 42, { size: 12, color: '#7f9bb8' });
    text(Math.round(integ * 100) + '%', cx + 214, H - 42, { size: 12, align: 'right', color: integ < 0.55 ? '#ff6b5e' : '#cfe0f0' });
    bar(cx - 214, H - 34, 428, 9, integ, integ < 0.55 ? '#ff6b5e' : '#ffd36b');
    const mark = cx - 214 + 428 * LOSE_CITY;
    ctx.fillStyle = '#ff3b3b';
    ctx.fillRect(mark - 1, H - 38, 2, 17);

    text('H hướng dẫn · P tạm dừng · M nhạc & âm thanh' + (sfx.muted ? ' (tắt)' : ''), 20, H - 18, { size: 12, color: 'rgba(200,220,240,0.5)', weight: 600 });

    if (game.showHelp || game.helpT > 0) drawHelp(game.showHelp ? 1 : clamp(game.helpT, 0, 1), 150);

    if (game.cheerT > 0) {
      const age = 2.4 - game.cheerT;
      const pop = age < 0.18 ? lerp(2.2, 0.9, age / 0.18) : age < 0.3 ? lerp(0.9, 1, (age - 0.18) / 0.12) : 1;
      ctx.save();
      ctx.translate(cx, 250);
      ctx.scale(pop, pop);
      text('EYERIIIM!', 0, 0, { size: 96, align: 'center', color: '#ffffff', glow: '#4ff0ff', blur: 34, weight: 900, alpha: clamp(game.cheerT / 0.4, 0, 1) });
      ctx.restore();
    }

    if (game.bannerT > 0 && K) {
      const a = clamp(game.bannerT, 0, 1) * clamp((4 - game.bannerT) * 3, 0, 1);
      text(`${K.def.cat} — ${K.def.name}`, cx, GROUND - 380, { size: 44, align: 'center', color: K.def.glow, glow: K.def.glow, alpha: a });
      text(`ĐANG ĐỔ BỘ VÀO ${WAVES[game.wave].district.toUpperCase()}`, cx, GROUND - 345, { size: 18, align: 'center', color: '#e8f1ff', alpha: a });
    }
  }

  function drawHelp(alpha, y) {
    const x = W / 2 - 340;
    const w = 680;
    const h = 250;
    ctx.save();
    ctx.globalAlpha = alpha;
    panel(x, y, w, h);
    text('HƯỚNG DẪN ĐIỀU KHIỂN', W / 2, y + 32, { size: 17, align: 'center', color: '#7ff6ff' });
    const c1 = x + 30;
    const c2 = x + 360;
    text('PHI CÔNG 1 · BÁN CẦU TRÁI', c1, y + 64, { size: 13, color: '#9fc1e0' });
    text('PHI CÔNG 2 · BÁN CẦU PHẢI', c2, y + 64, { size: 13, color: '#9fc1e0' });
    const l1 = [['A / D', 'di chuyển'], ['W', 'lướt né (20 năng lượng)'], ['S', 'giữ để đỡ đòn'], ['F', 'đấm trái']];
    const def = game.titan ? game.titan.def : curDef();
    const l2 = def.missiles
      ? [['J', 'đấm phải'], ['I', 'đập phản lực: bay lên nện đầu quái (25 NL)'], ['K', 'lưỡi kép cổ tay — chém nhanh'], ['L', 'giữ đủ 2s rồi thả: phóng 6 tên lửa (thả sớm = hủy)']]
      : [['J', 'đấm phải'], ['I', 'cú đấm phản lực (25 năng lượng)'], ['K', 'kiếm xích — đòn nặng, tầm xa'], ['L', 'giữ để nạp pháo plasma, thả để bắn']];
    l1.forEach((l, i) => {
      text(l[0], c1, y + 90 + i * 22, { size: 15, color: '#ffd36b' });
      text(l[1], c1 + 62, y + 90 + i * 22, { size: 15, weight: 500 });
    });
    l2.forEach((l, i) => {
      text(l[0], c2, y + 90 + i * 22, { size: 15, color: '#ffd36b' });
      text(l[1], c2 + 40, y + 90 + i * 22, { size: 15, weight: 500 });
    });
    const tips = [
      'ĐỒNG BỘ: hai phi công ra đòn gần như cùng lúc → sát thương ×2, Link tăng.',
      `LINK 100%: giữ 5 giây — đồng bộ F + J trong lúc đó để tung ${def.ultName}.`,
      'Đòn nặng (K, L nạp đầy, đồng bộ) trúng lúc quái đang gồng (!) → PHẢN ĐÒN.',
    ];
    tips.forEach((t, i) => text(t, c1, y + 190 + i * 20, { size: 13, weight: 500, color: '#cfe0f0' }));
    ctx.restore();
  }

  function dim(a = 0.6) {
    ctx.fillStyle = `rgba(2,6,12,${a})`;
    ctx.fillRect(0, 0, W, H);
  }

  function drawTitle() {
    dim(0.5);
    const pulse = 0.75 + 0.25 * Math.sin(game.t * 2);
    text('TIDEBREAKER', W / 2, 150, { size: 96, align: 'center', color: '#e8fbff', glow: '#4ff0ff', blur: 30 * pulse, weight: 900 });
    text('EYERIM  ·  HAI PHI CÔNG  ·  MỘT CỖ MÁY  ·  MỘT THÀNH PHỐ', W / 2, 190, { size: 16, align: 'center', color: '#7ff6ff' });
    text('Năm 2049, các khe nứt dưới đáy Thái Bình Dương thả ra quái vật Abyssal. Hãy giữ vững bờ biển.', W / 2, 226, { size: 16, align: 'center', weight: 500, color: '#cfe0f0' });
    drawHelp(1, 262);
    text(userTrack.ok ? `♪ Đang phát nhạc của bạn${userTrack.name ? ': ' + userTrack.name : ' (music/)'}` : 'Muốn dùng nhạc riêng? Kéo thả file nhạc vào cửa sổ, hoặc đặt vào music/theme.mp3', W / 2, 578, { size: 13, align: 'center', weight: 500, color: '#7f9bb8' });
    text('Chơi một mình: tay trái A S D W F, tay phải J K L', W / 2, 548, { size: 14, align: 'center', weight: 500, color: '#9fc1e0' });
    if (Math.sin(game.t * 4) > -0.3) text('NHẤN ENTER ĐỂ CHỌN TITAN', W / 2, 600, { size: 24, align: 'center', color: '#ffd36b', glow: '#ff9b3d' });
  }

  // Vẽ Titan làm avatar trong thẻ chọn: đặt chân tại (cx, gy), phóng to theo s.
  const avatarTitans = {};
  function drawTitanAvatar(def, cx, gy, s, active) {
    const T = avatarTitans[def.id] || (avatarTitans[def.id] = makeTitan(def));
    T.x = game.cam + cx;
    T.facing = 1;
    T.link = active ? 100 : 60;
    ctx.save();
    ctx.translate(cx, gy);
    ctx.scale(s, s);
    ctx.translate(-cx, -GROUND);
    drawTitan(T);
    ctx.restore();
  }

  function drawSelect() {
    dim(0.62);
    text('CHỌN TITAN', W / 2, 70, { size: 40, align: 'center', color: '#e8fbff', glow: '#4ff0ff', blur: 20, weight: 900 });
    text('Hai phi công · một cỗ máy — chọn khung giáp cho chiến dịch', W / 2, 98, { size: 15, align: 'center', weight: 500, color: '#9fc1e0' });
    const cw = 470;
    const ch = 500;
    const top = 124;
    const STAT = [['armor', 'GIÁP'], ['speed', 'TỐC ĐỘ'], ['power', 'HỎA LỰC'], ['energy', 'NĂNG LƯỢNG']];
    TITANS.forEach((def, i) => {
      const sel = i === game.pick;
      const x = W / 2 + (i - (TITANS.length - 1) / 2) * (cw + 30) - cw / 2;
      const acc = def.pal.front.accent;
      ctx.save();
      ctx.globalAlpha = sel ? 1 : 0.55;
      panel(x, top, cw, ch, sel ? acc : 'rgba(120,190,255,0.25)');
      if (sel) {
        ctx.save();
        ctx.shadowColor = acc;
        ctx.shadowBlur = 24;
        ctx.strokeStyle = acc;
        ctx.lineWidth = 2;
        rr(x, top, cw, ch, 10);
        ctx.stroke();
        ctx.restore();
      }
      // khung avatar
      const ax = x + 16;
      const ay = top + 16;
      const aw = 180;
      const ah = 300;
      const ag = ctx.createLinearGradient(0, ay, 0, ay + ah);
      ag.addColorStop(0, 'rgba(30,50,80,0.6)');
      ag.addColorStop(1, 'rgba(8,16,28,0.9)');
      ctx.fillStyle = ag;
      rr(ax, ay, aw, ah, 8);
      ctx.fill();
      ctx.save();
      rr(ax, ay, aw, ah, 8);
      ctx.clip();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(ax, ay + ah - 26, aw, 26);
      drawTitanAvatar(def, ax + aw / 2 - 4, ay + ah - 22, 0.92, sel);
      ctx.restore();
      // tên + vai trò
      const tx = ax + aw + 18;
      text(def.name.replace('EYERIM ', ''), tx, top + 50, { size: 30, weight: 900, color: '#ffffff', glow: sel ? acc : null, blur: 12 });
      text('EYERIM · TITAN-FRAME', tx, top + 70, { size: 11, color: '#7f9bb8' });
      wrapText(def.role, tx, top + 96, cw - aw - 50, 16, { size: 12, color: acc });
      // chỉ số
      STAT.forEach(([k, label], j) => {
        const y = top + 140 + j * 40;
        text(label, tx, y, { size: 12, color: '#9fc1e0' });
        for (let n = 0; n < 5; n++) {
          ctx.fillStyle = n < def.stats[k] ? acc : 'rgba(255,255,255,0.1)';
          rr(tx + n * 47, y + 7, 42, 9, 3);
          ctx.fill();
        }
      });
      text(`HP ${def.hp} · TỐC ĐỘ ${def.speed}`, tx, top + 312, { size: 12, weight: 500, color: '#cfe0f0' });
      // mô tả + vũ khí
      wrapText(def.desc, x + 20, top + 346, cw - 40, 19, { size: 14, weight: 500, color: '#cfe0f0' });
      text('VŨ KHÍ', x + 20, top + 404, { size: 12, color: '#7f9bb8' });
      [...def.weapons, ['★', 'Link 100%: ' + def.ultName]].forEach(([key, w], j) => {
        const y = top + 424 + j * 22;
        rr(x + 20, y - 15, 22, 20, 4);
        ctx.fillStyle = 'rgba(255,211,107,0.15)';
        ctx.fill();
        text(key, x + 31, y, { size: 13, align: 'center', color: '#ffd36b' });
        text(w, x + 52, y, { size: 14, weight: 500 });
      });
      ctx.restore();
      if (sel) text('▼', x + cw / 2, top - 6, { size: 16, align: 'center', color: acc, alpha: 0.6 + 0.4 * Math.sin(game.t * 6) });
    });
    text('A / D hoặc ← / → để chọn  ·  ENTER xuất kích  ·  ESC quay lại', W / 2, top + ch + 34, { size: 15, align: 'center', weight: 500, color: '#9fc1e0' });
  }

  function drawClear() {
    dim(0.55);
    const r = game.result;
    const def = WAVES[game.wave];
    panel(W / 2 - 280, 170, 560, 340, def.glow);
    text('ĐÃ HẠ GỤC', W / 2, 220, { size: 18, align: 'center', color: '#9fc1e0' });
    text(def.name, W / 2, 268, { size: 44, align: 'center', color: def.glow, glow: def.glow });
    const rows = [
      ['Thời gian', `${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')}`],
      ['Thành phố còn lại', Math.round(r.integ * 100) + '%'],
      ['Giáp Titan còn lại', Math.round(r.hpf * 100) + '%'],
      ['Số lần đồng bộ', String(r.syncs)],
    ];
    rows.forEach((row, i) => {
      text(row[0], W / 2 - 220, 320 + i * 30, { size: 17, weight: 500, color: '#cfe0f0' });
      text(row[1], W / 2 + 220, 320 + i * 30, { size: 17, align: 'right' });
    });
    text(`PHẾ LIỆU +${r.gain}`, W / 2, 460, { size: 26, align: 'center', color: '#ffd36b', glow: '#ff9b3d' });
    const next = game.wave >= WAVES.length - 1 ? 'ENTER — HOÀN THÀNH CHIẾN DỊCH' : 'ENTER — VỀ XƯỞNG SỬA CHỮA';
    if (game.stateT > 0.8) text(next, W / 2, 492, { size: 15, align: 'center', color: '#9fc1e0' });
  }

  function drawUpgrade() {
    dim(0.75);
    text('XƯỞNG SỬA CHỮA', W / 2, 110, { size: 40, align: 'center', color: '#e8fbff', glow: '#4ff0ff' });
    text(`PHẾ LIỆU: ${game.scrap}`, W / 2, 152, { size: 22, align: 'center', color: '#ffd36b' });
    UPGRADES.forEach((u, i) => {
      const x = 70 + i * 290;
      const y = 200;
      const lvl = game.upgrades[u.id];
      const cost = upgradeCost(u);
      const maxed = lvl >= UPGRADE_MAX;
      const can = !maxed && game.scrap >= cost;
      panel(x, y, 270, 260, can ? 'rgba(255,211,107,0.6)' : undefined);
      text(`[${i + 1}]`, x + 20, y + 36, { size: 18, color: '#ffd36b' });
      text(u.name, x + 20, y + 72, { size: 20 });
      wrapText(u.desc, x + 20, y + 104, 230, 22, { size: 15, weight: 500, color: '#cfe0f0' });
      for (let k = 0; k < UPGRADE_MAX; k++) {
        ctx.fillStyle = k < lvl ? '#4ff0ff' : 'rgba(255,255,255,0.12)';
        rr(x + 20 + k * 40, y + 180, 32, 10, 5);
        ctx.fill();
      }
      text(maxed ? 'TỐI ĐA' : `${cost} phế liệu`, x + 20, y + 230, { size: 17, color: maxed ? '#4ff0ff' : can ? '#ffd36b' : '#7f8ea0' });
    });
    const next = WAVES[game.wave + 1];
    text(`ENTER — XUẤT KÍCH: ${next.cat} ${next.name}`, W / 2, 540, { size: 22, align: 'center', color: '#ffd36b', glow: '#ff9b3d' });
    text('Giữa các đợt, giáp Titan được sửa lại đầy đủ và thành phố mới cần bảo vệ.', W / 2, 580, { size: 14, align: 'center', weight: 500, color: '#9fc1e0' });
  }

  function drawGameOver() {
    dim(0.6);
    const city = game.reason === 'city';
    text(city ? 'THÀNH PHỐ THẤT THỦ' : 'TITAN-FRAME BỊ HẠ', W / 2, 280, { size: 56, align: 'center', color: '#ff5e4d', glow: '#ff2a1a', weight: 900 });
    text(city ? 'Quá nhiều tòa nhà đã sụp đổ. Hãy giữ quái vật ở phía bờ biển.' : 'Hãy đỡ đòn khi thấy dấu ! vàng, và lướt né đòn lao húc màu đỏ.', W / 2, 330, { size: 18, align: 'center', weight: 500 });
    if (game.stateT > 0.8) {
      text('ENTER — THỬ LẠI ĐỢT NÀY', W / 2, 400, { size: 22, align: 'center', color: '#ffd36b' });
      text('T — VỀ MÀN HÌNH CHÍNH', W / 2, 436, { size: 16, align: 'center', color: '#9fc1e0' });
    }
  }

  function drawWin() {
    dim(0.65);
    text('BỜ BIỂN ĐÃ AN TOÀN', W / 2, 260, { size: 60, align: 'center', color: '#e8fbff', glow: '#4ff0ff', weight: 900 });
    text('Ba quái vật Abyssal đã bị đẩy lùi. Khe nứt tạm thời im lặng... lúc này.', W / 2, 310, { size: 18, align: 'center', weight: 500 });
    text(`Tổng phế liệu thu được: ${game.scrap}`, W / 2, 360, { size: 20, align: 'center', color: '#ffd36b' });
    if (game.stateT > 1) text('ENTER — CHƠI LẠI', W / 2, 430, { size: 22, align: 'center', color: '#ffd36b' });
  }

  function render() {
    const sh = fx.shake;
    ctx.save();
    ctx.translate(rand(-sh, sh), rand(-sh, sh));
    drawSky();
    drawFarCity();
    drawCranes();
    drawBuildings();
    drawGround();
    if (game.kaiju) drawKaiju(game.kaiju);
    if (game.state !== 'select') drawTitan(game.titan);
    drawStrikes();
    drawBeam();
    drawProjectiles();
    drawRings();
    drawParticles();
    drawSea();
    drawTexts();
    ctx.restore();
    drawRain();
    if (fx.flash > 0) {
      ctx.fillStyle = `rgba(220,240,255,${fx.flash * 0.6})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);

    switch (game.state) {
      case 'title':
        drawTitle();
        break;
      case 'select':
        drawSelect();
        break;
      case 'fight':
        drawHUD();
        break;
      case 'paused':
        drawHUD();
        dim(0.5);
        text('TẠM DỪNG', W / 2, H / 2 - 120, { size: 48, align: 'center', glow: '#4ff0ff' });
        drawHelp(1, H / 2 - 90);
        break;
      case 'clear':
        drawHUD();
        drawClear();
        break;
      case 'upgrade':
        drawUpgrade();
        break;
      case 'gameover':
        drawHUD();
        drawGameOver();
        break;
      case 'win':
        drawWin();
        break;
    }
  }

  // ============================================================ VÒNG LẶP
  toTitle();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    music.update();
    pressed.clear();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Móc kiểm thử (chỉ dùng khi chạy test tự động).
  if (window.__TIDEBREAKER_TEST__) {
    window.__TIDEBREAKER_TEST__.game = game;
    window.__TIDEBREAKER_TEST__.hitTitan = hitTitan;
  }
})();
