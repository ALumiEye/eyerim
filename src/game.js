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
  let ctx = canvas.getContext('2d');
  const titanGallery = window.__TITAN_GALLERY__ === true;
  canvas.width = W;
  canvas.height = H;
  function fit() {
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = Math.floor(W * s) + 'px';
    canvas.style.height = Math.floor(H * s) + 'px';
  }
  if (!titanGallery) {
    window.addEventListener('resize', fit);
    fit();
  }

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

  // ============================================================ CHUỘT
  // Mỗi khung hình, phần vẽ đăng ký các vùng bấm được; sự kiện chuột dùng vùng của khung vừa vẽ.
  let zones = [];
  let zonesNext = [];
  const zone = (x, y, w, h, click, hover) => zonesNext.push({ x, y, w, h, click, hover });
  function toCanvas(e) {
    if (!canvas.getBoundingClientRect) return null;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
  }
  function zoneAt(e) {
    const p = toCanvas(e);
    if (!p) return null;
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      if (p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h) return { z, p };
    }
    return null;
  }
  window.addEventListener('mousemove', (e) => {
    const hit = zoneAt(e);
    if (canvas.style) canvas.style.cursor = hit ? 'pointer' : 'default';
    if (hit && hit.z.hover) hit.z.hover(hit.p);
  });
  window.addEventListener('mousedown', (e) => {
    const hit = zoneAt(e);
    if (!hit) return;
    e.preventDefault();
    sfx.unlock();
    hit.z.click(hit.p);
  });

  // ============================================================ CÀI ĐẶT ÂM THANH (lưu trong trình duyệt)
  const AUDIO_KEY = 'eyerim.tidebreaker.audio';
  const audioCfg = (() => {
    const cfg = { music: 0.8, sfx: 0.8, muted: false };
    try {
      const saved = JSON.parse(localStorage.getItem(AUDIO_KEY));
      if (saved && typeof saved === 'object') {
        if (Number.isFinite(saved.music)) cfg.music = Math.min(1, Math.max(0, saved.music));
        if (Number.isFinite(saved.sfx)) cfg.sfx = Math.min(1, Math.max(0, saved.sfx));
        cfg.muted = !!saved.muted;
      }
    } catch (e) { /* bỏ qua */ }
    return cfg;
  })();
  function applyAudio(save = true) {
    sfx.muted = audioCfg.muted;
    if (sfx.out) sfx.out.gain.value = 0.45 * audioCfg.sfx;
    if (save) {
      try { localStorage.setItem(AUDIO_KEY, JSON.stringify(audioCfg)); } catch (e) { /* bỏ qua */ }
    }
  }

  // ============================================================ ÂM THANH (tổng hợp bằng WebAudio)
  const sfx = {
    ac: null,
    out: null,
    muted: audioCfg.muted,
    unlock() {
      if (this.ac) {
        if (this.ac.state === 'suspended') this.ac.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      this.out = this.ac.createGain();
      this.out.gain.value = 0.45 * audioCfg.sfx;
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
    // sấm: xa thì trễ và nhỏ; gần thì có tiếng "rắc" sắc rồi mới ầm
    thunder(delay = 0.3, vol = 0.35, crack = false) {
      if (crack) {
        this.noise(0.18, vol * 1.3, 3200, delay);
        this.noise(0.5, vol, 900, delay + 0.03);
      }
      this.noise(2.4, vol, 170, delay + (crack ? 0.08 : 0));
    },
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
      const vol = (sfx.muted ? 0 : game.state === 'paused' ? 0.25 : game.state === 'fight' ? 0.85 : 0.6) * audioCfg.music;
      this.audio.volume += (vol - this.audio.volume) * 0.1;
      if (this.audio.paused && sfx.ac && !sfx.muted && audioCfg.music > 0) this.audio.play().catch(() => {});
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
        case 'deploy':
          return game.deploy.t > AIR_T ? 3 : game.deploy.t > POD_T ? 2 : 1;
        default:
          return 1;
      }
    },
    update() {
      if (!sfx.ac) return;
      this.init();
      const ac = sfx.ac;
      userTrack.update();
      const vol = (sfx.muted || userTrack.ok ? 0 : game.state === 'paused' ? 0.12 : 0.3) * audioCfg.music;
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
  const fx = { particles: [], texts: [], rings: [], blasts: [], shake: 0, flash: 0, hitstop: 0 };

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

  // Các Titan có thể chọn. Vanguard vẽ theo ảnh tham chiếu ở thư mục gốc.
  // stats: điểm 1–5 chỉ để hiển thị trên màn hình chọn.
  // moves: đòn thay thế cho ô K (blade) và L (cannon) của Titan đó.
  const TITANS = [
    {
      id: 'vanguard', name: 'EYERIM VANGUARD', role: 'CHIẾN ĐẤU TRỰC DIỆN · GIÁP NẶNG',
      desc: 'Giáp xanh thép, vai sọc trắng, kính vàng và lò cam. Kiếm xích tầm xa, pháo plasma nạp lực.',
      // Thông số hư cấu EyeRim; chiều cao đo từ đế chân đến đỉnh đầu, không tính vây.
      heightM: 80, massTonnes: 2400,
      model: { crown: 396 + BODY_LIFT, sole: 4 },
      hp: 150, speed: 270, power: 1, quick: 1, regen: 1,
      stats: { armor: 5, speed: 3, power: 4, energy: 3 },
      weapons: [['I', 'Đấm phản lực — lao tới, chắc trúng'], ['K', 'Kiếm xích — chém nặng, tầm xa'], ['L', 'Pháo plasma — giữ để nạp, thả để bắn']],
      special: 'jetpunch',
      ult: 'reactor', ultName: 'XUNG LÒ PHẢN ỨNG',
      head: 'visor', missiles: false, wristBlades: false,
      pal: {
        front: { hi: '#7993a5', armor: '#3d566e', lo: '#213247', frame: '#111b23', frameHi: '#596873', accent: '#ab4d45', line: '#15202c', steel: '#a7b6ba', visor: '#eec260' },
        back: { hi: '#526d83', armor: '#2d4359', lo: '#172738', frame: '#0c151e', frameHi: '#40515e', accent: '#723b3c', line: '#0f1a25', steel: '#788f98', visor: '#ae8c48' },
      },
      moves: {},
    },
    {
      id: 'tempest', name: 'EYERIM TEMPEST', role: 'TẤN CÔNG CHỚP NHOÁNG · CƠ ĐỘNG',
      desc: 'Giáp bạc xám kiểu Striker Eureka, vai rộng và kính tối. Lưỡi kép cổ tay, ngực phóng 6 tên lửa.',
      heightM: 80, massTonnes: 1850,
      model: { crown: 372 + BODY_LIFT, sole: 0 },
      hp: 115, speed: 340, power: 0.9, quick: 0.75, regen: 1.3,
      stats: { armor: 3, speed: 5, power: 3, energy: 5 },
      weapons: [['I', 'Đập phản lực — bay lên, nện xuống đầu quái'], ['K', 'Lưỡi kép cổ tay — chém nhanh, choáng'], ['L', '6 tên lửa — giữ đủ 2s mới phóng, nạp lại 4,5s']],
      special: 'leap',
      ult: 'orbital', ultName: 'MƯA TÊN LỬA VỆ TINH',
      head: 'sensor', missiles: true, wristBlades: true,
      pal: {
        front: { hi: '#a6adb0', armor: '#707b83', lo: '#434f59', frame: '#1c242a', frameHi: '#505b61', accent: '#b59a68', line: 'rgba(17,25,32,0.85)', trim: '#4e8292' },
        back: { hi: '#76818a', armor: '#4e5b66', lo: '#303c47', frame: '#121b24', frameHi: '#384851', accent: '#87734e', line: 'rgba(9,17,27,0.85)', trim: '#345d70' },
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
  const MISSILE_DMG = 10; // TEMPEST: sát thương mỗi tên lửa (6 quả mỗi loạt)
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
  const upgradeMax = () => UPGRADE_MAX;
  const upgradeCost = (u) => u.cost + game.upgrades[u.id] * 20;

  // ============================================================ CHẾ ĐỘ CHƠI
  const MODES = [
    {
      id: 'campaign', name: 'CHIẾN DỊCH', tag: '3 đợt · xưởng nâng cấp giữa các đợt', color: '#4ff0ff',
      desc: 'Chặn ba quái vật Abyssal ở ba quận ven biển. Thu phế liệu sau mỗi đợt để nâng cấp Titan.',
      rules: ['Ba quái vật mạnh dần: Cấp I → Cấp III', 'Nâng cấp giáp, lò phản ứng, lõi plasma, Link', 'Thua đợt nào thì chơi lại đúng đợt đó'],
    },
    {
      id: 'rush', name: 'ĐUA THỜI GIAN', tag: '3 quái liên tiếp · không nâng cấp', color: '#5dffb0',
      desc: 'Hạ gục cả ba quái vật nhanh nhất có thể. Đồng hồ chạy suốt trận, không có xưởng sửa chữa.',
      rules: ['Đánh liền 3 đợt bằng Titan gốc, không nâng cấp', 'Đồng hồ chỉ dừng ở màn tổng kết mỗi đợt', 'Thua đợt nào là chạy lại từ đầu'],
    },
    {
      id: 'duel', name: 'ĐẤU TỰ DO', tag: 'Chọn quái vật · chọn độ khó', color: '#ff7bf2',
      desc: 'Đấu một trận với quái vật bất kỳ ở độ khó tùy chọn. Hợp để tập phản đòn, né lao húc và đồng bộ.',
      rules: ['Chọn 1 trong 3 quái vật Abyssal', 'Bốn độ khó: Dễ · Thường · Khó · Ác mộng', 'Mỗi tổ hợp thắng được đánh dấu lại'],
    },
  ];
  const DIFFS = [
    { name: 'DỄ', hp: 0.7, dmg: 0.6, aggr: 0.85, color: '#5dffb0' },
    { name: 'THƯỜNG', hp: 1, dmg: 1, aggr: 1, color: '#4ff0ff' },
    { name: 'KHÓ', hp: 1.35, dmg: 1.35, aggr: 1.2, color: '#ffd36b' },
    { name: 'ÁC MỘNG', hp: 1.8, dmg: 1.7, aggr: 1.4, color: '#ff5e4d' },
  ];
  const modeDef = () => MODES.find((m) => m.id === game.mode) || MODES[0];
  // Menu chính = các chế độ + mục cài đặt âm thanh ở cuối.
  const MENU = [...MODES, {
    id: 'training', name: 'HUẤN LUYỆN PHI CÔNG', tag: 'Xem chiêu thức · chỉ số từng đòn', color: '#ffd36b',
    desc: 'Xem Titan diễn từng chiêu thức cùng chỉ số: sát thương, tầm đánh, năng lượng, thời gian gồng, ra đòn và hồi chiêu.',
    rules: ['Vanguard và Tempest, mỗi Titan 10 chiêu thức', 'Dùng chung bộ vẽ với trang mẫu trong thư mục titans/', 'Không đánh quái: chỉ xem, so sánh và học phím'],
  }, {
    id: 'settings', name: 'CÀI ĐẶT', tag: 'Nhạc nền · hiệu ứng âm thanh', color: '#b9c8ff',
    desc: 'Chỉnh riêng âm lượng nhạc nền và hiệu ứng âm thanh. Cài đặt được lưu lại cho lần chơi sau.',
    rules: ['A / D hoặc bấm vào thanh để chỉnh mức', 'Phím M bật/tắt toàn bộ âm thanh mọi lúc', 'Mở lại được trong trận từ menu tạm dừng'],
  }];

  // Quái vật cho đợt i theo chế độ đang chơi. dmgMul nhân sát thương quái gây cho Titan.
  function waveDef(i) {
    if (game.mode === 'duel') {
      const base = WAVES[game.duel.kaiju];
      const d = DIFFS[game.duel.diff];
      return { ...base, hp: Math.round(base.hp * d.hp), aggression: base.aggression * d.aggr, dmgMul: d.dmg, diff: d.name };
    }
    return { ...WAVES[i], dmgMul: 1 };
  }
  const isLastWave = () => game.mode === 'duel' || game.wave >= WAVES.length - 1;
  const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${Math.floor((t * 10) % 10)}`;

  // Kỷ lục lưu trong trình duyệt; không có localStorage (chế độ riêng tư, test) thì chỉ giữ trong phiên.
  const RECORD_KEY = 'eyerim.tidebreaker.records';
  const records = (() => {
    try {
      const r = JSON.parse(localStorage.getItem(RECORD_KEY));
      if (r && typeof r === 'object') return { rush: 0, duel: {}, ...r };
    } catch (e) { /* bỏ qua */ }
    return { rush: 0, duel: {} };
  })();
  function saveRecords() {
    try { localStorage.setItem(RECORD_KEY, JSON.stringify(records)); } catch (e) { /* bỏ qua */ }
  }
  const duelWins = () => Object.keys(records.duel).length;

  const game = {
    state: 'title',
    mode: 'campaign',
    menu: 0,
    menuY: 0,
    pauseIdx: 0,
    pauseFrom: 'fight',
    pauseConfirm: null,
    settingsOpen: false,
    settingsRow: 0,
    menuT: 1,
    duel: { kaiju: 0, diff: 1, row: 0 },
    kdef: null,
    runTime: 0,
    newRecord: false,
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
    // Link chỉ tăng khi đòn đồng bộ đánh trúng quái (xem syncLinkGain).
    sfx.sync();
    floatText(T.x, GROUND - (390 + BODY_LIFT) * TITAN_SCALE, 'ĐỒNG BỘ!', '#7ff6ff', 26);
  }

  // Đòn đồng bộ đã đánh trúng quái → Link +12 (mỗi lần đồng bộ chỉ cộng một lần).
  const SYNC_LINK_GAIN = 12;
  function syncLinkGain(token) {
    if (token) {
      if (token.paid) return;
      token.paid = true;
    }
    const T = game.titan;
    if (!T || T.beaming) return;
    T.link = Math.min(100, T.link + SYNC_LINK_GAIN);
    if (T.link >= 100 && T.linkHold <= 0) T.linkHold = LINK_HOLD;
    floatText(T.x, GROUND - (420 + BODY_LIFT) * TITAN_SCALE, T.link >= 100 ? 'LINK 100%!' : `LINK +${SYNC_LINK_GAIN}`, '#7ff6ff', 22);
  }

  function fireBeam() {
    const T = game.titan;
    T.arms.L = null;
    T.arms.R = null;
    T.beaming = true;
    T.guard = false;
    T.charge = null;
    T.linkHold = 0;
    game.ultFx = { t: 0 };
    if (T.def.ult === 'orbital') {
      // TEMPEST: gọi một loạt 6 tên lửa vệ tinh, khóa chắc vào quái, rơi nối tiếp nhau
      const K = game.kaiju;
      game.barrage = { t: 0, dur: STRIKE_DELAY + 5 * 0.2 + 0.4, sx: K ? K.x : T.x };
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
    // sóng xung kích bung ra từ lò phản ứng
    const rp = reactorPos(T);
    for (let i = 0; i < 3; i++) fx.rings.push({ x: rp.x + game.cam, y: rp.y, r: 10, max: 160 + i * 110, life: 0.5 + i * 0.15, color: i ? '#7ff6ff' : '#ffffff' });
    burst(rp.x + game.cam, rp.y, 40, '#bff8ff', 700, 0.5, 4, 0);
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
      const scale = titanDrawScale(T);
      const x0 = T.x + T.facing * 225 * scale;
      const y0 = GROUND - (256 + BODY_LIFT + T.def.model.sole) * scale;
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
        kb: 140 + 560 * lv, heavy, life: 2, syncTok: a.sync ? { paid: false } : null,
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
            if (sync) syncLinkGain();
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
      if (a.sync) syncLinkGain();
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
      if (L.sync) syncLinkGain();
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
    const syncTok = a.sync ? { paid: false } : null; // cả loạt chỉ cộng Link một lần
    for (let i = 0; i < n; i++) {
      const c = i % 3;
      const r = Math.floor(i / 3);
      game.projectiles.push({
        owner: 'titan', missile: true, home: 0.16 + i * 0.035,
        x: T.x + T.facing * (LAUNCHER.x - 21 + c * 21) * TITAN_SCALE,
        y: GROUND - (-LAUNCHER.y + BODY_LIFT + 12 - r * 24) * TITAN_SCALE,
        vx: T.facing * (200 + c * 70 + rand(-30, 30)), vy: -(560 + r * 140 + rand(-40, 40)), g: 0,
        r: 7, dmg: MISSILE_DMG * M.blade * (a.sync ? 1.5 : 1),
        kb: 120, heavy: i === n - 1, life: 3, syncTok,
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
    dmg *= (game.kdef && game.kdef.dmgMul) || 1;
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
        const scale = titanDrawScale(T);
        const fx0 = T.x + T.facing * (mis ? LAUNCHER.x : 225) * scale;
        const fy0 = GROUND - ((mis ? -LAUNCHER.y + BODY_LIFT : 256 + BODY_LIFT) + T.def.model.sole) * scale;
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
          if (p.syncTok) syncLinkGain(p.syncTok);
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
    for (const b of fx.blasts) b.t += dt;
    fx.blasts = fx.blasts.filter((b) => b.t < 1.6);
    if (game.barrage && K && !K.dying) game.barrage.sx = lerp(game.barrage.sx, K.x, 1 - Math.pow(0.05, dt));
    for (const S of game.strikes) {
      S.t += dt;
      if (S.t < 0) continue;
      const mp = missilePos(S);
      if (mp) burst(mp.x, mp.y - 30, 1, '#8a8f99', 40, 0.7, 7, -30, true); // vệt khói
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
        const big = S.kb > 300; // quả cuối cùng
        fx.rings.push({ x: S.x, y: S.y, r: 0, max: big ? 420 : 260, life: big ? 0.8 : 0.5, color: '#ffd36b' });
        if (big) fx.rings.push({ x: S.x, y: S.y, r: 0, max: 600, life: 1, color: '#ffffff' });
        fx.blasts.push({ x: S.x, y: S.y, t: 0, big });
        burst(S.x, S.y, big ? 80 : 36, pick(['#ffffff', '#ffd36b', '#ff9b3d']), big ? 760 : 520, 0.7, 6, 300);
        burst(S.x, GROUND - 6, big ? 24 : 10, '#5a5048', 340, 1.1, 7, 500); // mảnh vỡ
        if (big) {
          fx.flash = 0.6;
          shake(26);
        }
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
        burst(K.x - T.facing * K.half * 0.45, reactorPos(T).y, 10, pick(['#ffffff', '#bff8ff', '#7ff6ff']), 800, 0.4, 3, 400);
      }
      // bụi bị tia thổi tung dọc mặt đất
      burst(T.x + T.facing * rand(150, 1200), GROUND - 4, 2, '#9fb6c8', 220, 0.8, 9, -40, true);
    }
    if (B.t >= B.dur) {
      if (K && !K.dying && (K.x - T.x) * T.facing > 0) {
        damageKaiju(15 * M.blade, 900, true, K.x, GROUND - 190 * K.def.scale, T.facing);
        const ey = reactorPos(T).y;
        for (let i = 0; i < 3; i++) fx.rings.push({ x: K.x, y: ey, r: 20, max: 220 + i * 140, life: 0.6 + i * 0.15, color: i ? '#7ff6ff' : '#ffffff' });
        burst(K.x, ey, 70, '#dfffff', 900, 0.7, 5, 300);
        fx.flash = 0.7;
        shake(26);
        sfx.jetBoom();
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

  // ---------- Sấm chớp ngẫu nhiên (chỉ là hiệu ứng, không gây sát thương) ----------
  const bolts = [];
  let nextBolt = 3;
  // Đường sét zigzag từ (x0, y0) xuống (x1, y1), kèm các nhánh phụ.
  function boltPath(x0, y0, x1, y1, jag, steps) {
    const pts = [[x0, y0]];
    for (let i = 1; i < steps; i++) {
      const k = i / steps;
      const px = lerp(x0, x1, k) + rand(-1, 1) * jag * (1 - k * 0.5);
      const py = lerp(y0, y1, k) + rand(-0.3, 0.3) * ((y1 - y0) / steps);
      pts.push([px, py]);
    }
    pts.push([x1, y1]);
    return pts;
  }
  function spawnBolt() {
    const near = Math.random() < 0.35;
    const depth = near ? rand(0.7, 1) : rand(0, 0.55);
    const sx = rand(60, W - 60);
    const y0 = rand(30, 80);
    const y1 = near ? GROUND - rand(0, 10) : GROUND - rand(120, 200);
    const scale = 0.5 + depth * 0.7;
    const main = boltPath(sx, y0, sx + rand(-120, 120) * scale, y1, 26 * scale, 12 + Math.floor(depth * 8));
    const branches = [];
    const nb = 1 + Math.floor(Math.random() * (2 + depth * 3));
    for (let b = 0; b < nb; b++) {
      const at = main[2 + Math.floor(Math.random() * (main.length - 5))];
      const len = rand(60, 160) * scale;
      const dir = Math.random() < 0.5 ? -1 : 1;
      branches.push(boltPath(at[0], at[1], at[0] + dir * len * rand(0.5, 1), at[1] + len, 14 * scale, 5 + Math.floor(Math.random() * 3)));
    }
    bolts.push({ main, branches, t: 0, life: 0.5, depth, cam0: game.cam, par: 0.22 + depth * 0.78, hit: near });
    game.lightning = Math.max(game.lightning, 0.45 + 0.55 * depth);
    sfx.thunder(0.05 + (1 - depth) * 1.8, 0.18 + 0.3 * depth, near);
    if (near) burst(main[main.length - 1][0] + game.cam, main[main.length - 1][1], 18, '#dfe9ff', 420, 0.4, 3, 500);
  }
  // Độ sáng theo thời gian: lóe → tối → lóe lại → tắt dần.
  const boltK = (t) => (t < 0.06 ? 1 : t < 0.12 ? 0.25 : t < 0.2 ? 0.95 : Math.max(0, 1 - (t - 0.2) / 0.3));
  function updateBolts(dt) {
    for (const b of bolts) {
      const before = b.t;
      b.t += dt;
      if (before < 0.12 && b.t >= 0.12) game.lightning = Math.max(game.lightning, 0.35 + 0.5 * b.depth); // nhịp chớp thứ hai
    }
    for (let i = bolts.length - 1; i >= 0; i--) if (bolts[i].t > bolts[i].life) bolts.splice(i, 1);
    nextBolt -= dt;
    if (nextBolt <= 0) {
      spawnBolt();
      nextBolt = Math.random() < 0.25 ? rand(0.15, 0.5) : rand(4, 11); // thỉnh thoảng hai tia liền nhau
    }
  }
  function strokePath(pts, ox) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0] + ox, pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + ox, pts[i][1]);
    ctx.stroke();
  }
  function drawBolts() {
    for (const b of bolts) {
      const k = boltK(b.t);
      if (k <= 0) continue;
      const ox = -(game.cam - b.cam0) * b.par;
      const sc = 0.5 + b.depth * 0.8;
      const top = b.main[0];
      const end = b.main[b.main.length - 1];
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // mây quanh gốc tia sáng lên
      const cg = ctx.createRadialGradient(top[0] + ox, top[1], 0, top[0] + ox, top[1], 260 * sc);
      cg.addColorStop(0, `rgba(190,215,255,${0.45 * k})`);
      cg.addColorStop(1, 'rgba(190,215,255,0)');
      ctx.fillStyle = cg;
      ellipse(top[0] + ox, top[1], 260 * sc, 120 * sc);
      ctx.fill();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const [w, col] of [[12 * sc, `rgba(130,170,255,${0.22 * k})`], [5 * sc, `rgba(190,215,255,${0.6 * k})`], [1.8 * sc, `rgba(255,255,255,${k})`]]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        strokePath(b.main, ox);
        ctx.lineWidth = w * 0.55;
        for (const br of b.branches) strokePath(br, ox);
      }
      // chỗ sét đánh xuống
      if (b.hit) {
        const gg = ctx.createRadialGradient(end[0] + ox, end[1], 0, end[0] + ox, end[1], 90);
        gg.addColorStop(0, `rgba(255,255,255,${0.9 * k})`);
        gg.addColorStop(0.4, `rgba(170,200,255,${0.4 * k})`);
        gg.addColorStop(1, 'rgba(170,200,255,0)');
        ctx.fillStyle = gg;
        ellipse(end[0] + ox, end[1], 90, 40);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function updateAmbient(dt) {
    fx.shake = Math.max(0, fx.shake - 45 * dt);
    fx.flash = Math.max(0, fx.flash - dt * 1.5);
    game.lightning = Math.max(0, game.lightning - dt * 2.5);
    updateBolts(dt);
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
    const def = (game.kdef = waveDef(game.wave));
    game.buildings = makeCity(1000 + game.wave * 7919 + (game.mode === 'duel' ? game.duel.kaiju * 131 : 0));
    game.titan = makeTitan();
    game.kaiju = makeKaiju(def);
    game.projectiles = [];
    game.strikes = [];
    game.barrage = null;
    game.beam = null;
    fx.particles.length = 0;
    fx.texts.length = 0;
    fx.rings.length = 0;
    fx.blasts.length = 0;
    game.ultFx = null;
    game.ultDim = 0;
    game.state = 'fight';
    game.stateT = 0;
    game.waveTime = 0;
    game.bannerT = 4;
    game.cheerT = 0;
    game.helpT = 0;
    game.showHelp = false; // vào trận là ẩn hướng dẫn; bấm H để xem lại
    game.cam = clamp(game.titan.x - W / 2 + 300, 0, WORLD_W - W);
  }

  function newRun(cutscene = false) {
    game.runTime = 0;
    game.newRecord = false;
    game.wave = 0;
    game.scrap = 0;
    game.upgrades = { armor: 0, reactor: 0, blade: 0, neural: 0 };
    if (cutscene) startDeploy(true);
    else setupWave();
  }

  // ============================================================ PHIM XUẤT KÍCH
  // 3 cảnh: trang bị giáp (0 → POD_T) · vào buồng lái (POD_T → AIR_T) · vận chuyển đường không (AIR_T → DEPLOY_END).
  const POD_T = 6.5;
  const AIR_T = 10.5;
  const DEPLOY_END = 17;
  const PIECES = [
    ['GIÀY TỪ TÍNH', 0.05, -10], ['GIÁP ỐNG CHÂN', 0.15, -36], ['GIÁP ĐÙI', 0.25, -74],
    ['GIÁP NGỰC · LÕI', 0.38, -128], ['ĐAI LƯNG', 0.46, -101], ['GIÁP VAI', 0.54, -146],
    ['GĂNG TAY', 0.62, -105], ['CỘT SỐNG THẦN KINH', 0.72, -151], ['MŨ BẢO HỘ', 0.82, -164],
  ];
  const suitK = (t) => clamp((t - 0.5) / 5, 0, 1);
  const RELEASE_T = 4.2; // trong cảnh vận chuyển: lúc cắt cáp
  const HANG_Y = 430;
  const SEA_Y = 604;
  const FALL_G = 900;
  const SPLASH_T = RELEASE_T + Math.sqrt((2 * (SEA_Y - HANG_Y)) / FALL_G);
  const DEPLOY_CUES = [
    ...PIECES.map(([, st]) => [0.5 + 5 * (st + 0.12), () => sfx.block()]),
    [0.5 + 5 * 0.94, () => sfx.chargeFull()],
    [POD_T + 0.45, () => sfx.block()],
    [POD_T + 0.75, () => sfx.heavy()],
    [POD_T + 2.4, () => { sfx.sync(); sfx.chargeFull(); }],
    [POD_T + 3.0, () => { sfx.jetBoom(); shake(10); }],
    [AIR_T + 0.1, () => sfx.jetIgnite()],
    [AIR_T + RELEASE_T, () => { sfx.warn(); sfx.dash(); }],
    [AIR_T + SPLASH_T, () => { sfx.collapse(); sfx.jetBoom(); }],
  ];
  function startDeploy(full) {
    game.state = 'deploy';
    game.stateT = 0;
    game.titan = makeTitan();
    const t0 = full ? 0 : AIR_T;
    game.deploy = { t: t0, t0, full, def: curDef(), district: waveDef(game.wave).district };
  }
  function updateDeploy(dt) {
    const D = game.deploy;
    const prev = D.t;
    D.t += dt;
    for (const [ct, fn] of DEPLOY_CUES) if (ct > prev && ct <= D.t) fn();
    const skip = D.t - D.t0 > 0.3 && tapAny('Enter', 'NumpadEnter', 'Space', 'Escape');
    if (skip || D.t >= DEPLOY_END) setupWave();
  }

  function toTitle() {
    game.state = 'title';
    game.stateT = 0;
    game.showHelp = false;
    game.settingsOpen = false;
    game.menuT = 1;
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
    game.result = { gain, integ, hpf, time: game.waveTime, syncs: T.syncCount, runTime: game.runTime };
    game.newRecord = false;
    if (game.mode === 'rush' && isLastWave() && (!records.rush || game.runTime < records.rush)) {
      records.rush = game.runTime;
      game.newRecord = true;
    } else if (game.mode === 'duel') {
      const key = game.duel.kaiju + '-' + game.duel.diff;
      game.newRecord = !records.duel[key];
      records.duel[key] = true;
    }
    if (game.newRecord) saveRecords();
    game.state = 'clear';
    game.stateT = 0;
  }

  function simulate(dt) {
    if (game.ultFx) {
      game.ultFx.t += dt;
      if (game.ultFx.t > 1.2) game.ultFx = null;
    }
    const ultOn = game.beam || game.barrage ? 1 : 0;
    game.ultDim = lerp(game.ultDim || 0, ultOn, 1 - Math.pow(0.002, dt));
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

  // ---------- menu chính / tạm dừng / cài đặt ----------
  function setMenu(i) {
    if (i === game.menu) return;
    game.menu = i;
    game.menuT = 0;
    sfx.dash();
  }
  function chooseMenu() {
    const m = MENU[game.menu];
    if (m.id === 'settings') {
      openSettings();
      return;
    }
    if (m.id === 'training') {
      openTraining();
      return;
    }
    game.mode = m.id;
    game.state = game.mode === 'duel' ? 'duel' : 'select';
    game.stateT = 0;
    game.pick = game.titanIdx;
    game.showHelp = false;
    sfx.buy();
  }

  function openPause() {
    game.pauseFrom = game.state;
    game.state = 'paused';
    game.pauseIdx = 0;
    game.pauseConfirm = null;
    game.showHelp = false;
  }
  function resumeGame() {
    game.state = game.pauseFrom || 'fight';
    game.showHelp = false;
    game.pauseConfirm = null;
  }
  function pauseItems() {
    const items = [
      { id: 'resume', name: 'TIẾP TỤC' },
      { id: 'settings', name: 'CÀI ĐẶT ÂM THANH' },
      { id: 'help', name: 'HƯỚNG DẪN ĐIỀU KHIỂN' },
    ];
    if (game.pauseFrom === 'fight') {
      items.push({ id: 'restart', name: game.mode === 'rush' ? 'CHƠI LẠI TỪ ĐẦU' : 'CHƠI LẠI ĐỢT NÀY' });
    }
    items.push({ id: 'quit', name: 'THOÁT VỀ MENU CHÍNH' });
    return items;
  }
  function choosePause(id) {
    if (id === 'resume') resumeGame();
    else if (id === 'settings') openSettings();
    else if (id === 'help') game.showHelp = true;
    else if (game.pauseConfirm !== id) {
      // thoát / chơi lại làm mất tiến độ: bấm lần hai để xác nhận
      game.pauseConfirm = id;
      sfx.warn();
    } else if (id === 'restart') {
      game.pauseConfirm = null;
      if (game.mode === 'rush') newRun();
      else setupWave();
    } else if (id === 'quit') {
      game.pauseConfirm = null;
      toTitle();
    }
  }
  function updatePause() {
    if (game.showHelp) {
      if (tapAny('Escape', 'Enter', 'NumpadEnter', 'Space', 'KeyH')) game.showHelp = false;
      return;
    }
    const items = pauseItems();
    const d = (tapAny('KeyS', 'ArrowDown') ? 1 : 0) - (tapAny('KeyW', 'ArrowUp') ? 1 : 0);
    if (d) {
      game.pauseIdx = (game.pauseIdx + d + items.length) % items.length;
      game.pauseConfirm = null;
      sfx.dash();
    }
    if (tapAny('KeyP', 'Escape')) resumeGame();
    else if (tapAny('Enter', 'NumpadEnter', 'Space')) choosePause(items[game.pauseIdx].id);
  }

  const SETTINGS_ROWS = ['music', 'sfx', 'muted', 'close'];
  function openSettings() {
    game.settingsOpen = true;
    game.settingsRow = 0;
    sfx.buy();
  }
  function setVolume(key, v) {
    const nv = Math.round(clamp(v, 0, 1) * 10) / 10;
    if (nv === audioCfg[key]) return;
    audioCfg[key] = nv;
    applyAudio();
    if (key === 'sfx') sfx.buy(); // nghe thử mức hiệu ứng mới
  }
  function settingsAction(row) {
    const id = SETTINGS_ROWS[row];
    if (id === 'muted') {
      audioCfg.muted = !audioCfg.muted;
      applyAudio();
      sfx.buy();
    } else if (id === 'close') game.settingsOpen = false;
  }
  function updateSettings() {
    const d = (tapAny('KeyS', 'ArrowDown') ? 1 : 0) - (tapAny('KeyW', 'ArrowUp') ? 1 : 0);
    if (d) {
      game.settingsRow = (game.settingsRow + d + SETTINGS_ROWS.length) % SETTINGS_ROWS.length;
      sfx.dash();
    }
    const id = SETTINGS_ROWS[game.settingsRow];
    const dx = (tapAny('KeyD', 'ArrowRight') ? 1 : 0) - (tapAny('KeyA', 'ArrowLeft') ? 1 : 0);
    if (dx && (id === 'music' || id === 'sfx')) setVolume(id, audioCfg[id] + dx * 0.1);
    else if (dx && id === 'muted') settingsAction(game.settingsRow);
    if (tapAny('Escape', 'KeyO')) game.settingsOpen = false;
    else if (tapAny('Enter', 'NumpadEnter', 'Space')) settingsAction(game.settingsRow);
  }

  function update(dt) {
    game.t += dt;
    game.stateT += dt;
    updateAmbient(dt);
    if (tap('KeyM')) {
      audioCfg.muted = !audioCfg.muted;
      applyAudio();
    }
    if (game.settingsOpen) {
      updateSettings();
      if (game.state === 'title' || game.state === 'duel') game.cam = clamp(1100 + Math.sin(game.t * 0.08) * 900, 0, WORLD_W - W);
      return;
    }

    switch (game.state) {
      case 'title': {
        game.cam = clamp(1100 + Math.sin(game.t * 0.08) * 900, 0, WORLD_W - W);
        game.menuT += dt;
        game.menuY = lerp(game.menuY, game.menu, 1 - Math.pow(0.0005, dt));
        if (tap('KeyH')) game.showHelp = !game.showHelp;
        if (game.showHelp) {
          if (tapAny('Escape', 'Enter', 'NumpadEnter', 'Space')) game.showHelp = false;
          return;
        }
        let next = game.menu + (tapAny('KeyS', 'ArrowDown') ? 1 : 0) - (tapAny('KeyW', 'ArrowUp') ? 1 : 0);
        MENU.forEach((m, i) => { if (tapAny('Digit' + (i + 1), 'Numpad' + (i + 1))) next = i; });
        setMenu((next + MENU.length) % MENU.length);
        if (tapAny('Enter', 'NumpadEnter', 'Space')) chooseMenu();
        return;
      }
      case 'duel': {
        game.cam = clamp(1100 + Math.sin(game.t * 0.08) * 900, 0, WORLD_W - W);
        const D = game.duel;
        const dy = (tapAny('KeyS', 'ArrowDown') ? 1 : 0) - (tapAny('KeyW', 'ArrowUp') ? 1 : 0);
        if (dy) {
          D.row = (D.row + dy + 2) % 2;
          sfx.dash();
        }
        const dx = (tapAny('KeyD', 'ArrowRight') ? 1 : 0) - (tapAny('KeyA', 'ArrowLeft') ? 1 : 0);
        if (dx) {
          if (D.row === 0) D.kaiju = (D.kaiju + dx + WAVES.length) % WAVES.length;
          else D.diff = clamp(D.diff + dx, 0, DIFFS.length - 1);
          sfx.dash();
        }
        if (tapAny('Escape')) {
          game.state = 'title';
          game.stateT = 0;
        } else if (game.stateT > 0.2 && tapAny('Enter', 'NumpadEnter', 'Space')) {
          game.state = 'select';
          game.stateT = 0;
          game.pick = game.titanIdx;
          sfx.buy();
        }
        return;
      }
      case 'select': {
        game.cam = clamp(1100 + Math.sin(game.t * 0.08) * 900, 0, WORLD_W - W);
        const d = (tapAny('KeyD', 'ArrowRight') ? 1 : 0) - (tapAny('KeyA', 'ArrowLeft') ? 1 : 0);
        if (d) {
          game.pick = (game.pick + d + TITANS.length) % TITANS.length;
          sfx.dash();
        }
        if (tapAny('Escape')) {
          game.state = game.mode === 'duel' ? 'duel' : 'title';
          game.stateT = 0;
        } else if (game.stateT > 0.2 && tapAny('Enter', 'NumpadEnter', 'Space')) {
          game.titanIdx = game.pick;
          newRun(true);
        }
        return;
      }
      case 'deploy':
        updateDeploy(dt);
        return;
      case 'training':
        game.cam = clamp(1100 + Math.sin(game.t * 0.08) * 900, 0, WORLD_W - W);
        updateTraining(dt);
        return;
      case 'fight':
        if (tapAny('KeyP', 'Escape')) {
          openPause();
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
        game.runTime += dt;
        simulate(dt);
        break;
      case 'paused':
        updatePause();
        break;
      case 'clear':
        updateBuildings(dt);
        game.cheerT -= dt;
        if (tapAny('Escape', 'KeyP')) {
          openPause();
          break;
        }
        if (game.stateT > 0.8 && tapAny('Enter', 'NumpadEnter', 'Space')) {
          if (isLastWave()) {
            game.state = 'win';
            game.stateT = 0;
          } else if (game.mode === 'rush') {
            game.wave++;
            setupWave();
          } else {
            game.state = 'upgrade';
            game.stateT = 0;
            game.shopLog = [];
            game.shopSel = 0;
          }
        }
        break;
      case 'upgrade':
        if (tapAny('Escape', 'KeyP')) {
          openPause();
          break;
        }
        game.weldBoost = Math.max(0, (game.weldBoost || 0) - dt);
        UPGRADES.forEach((u, i) => {
          if (tapAny('Digit' + (i + 1), 'Numpad' + (i + 1))) buyUpgrade(i);
        });
        {
          const dx = (tapAny('KeyD', 'ArrowRight') ? 1 : 0) - (tapAny('KeyA', 'ArrowLeft') ? 1 : 0);
          if (dx) {
            game.shopSel = ((game.shopSel || 0) + dx + UPGRADES.length) % UPGRADES.length;
            sfx.dash();
          }
          if (tapAny('KeyW', 'ArrowUp', 'Equal', 'NumpadAdd')) buyUpgrade(game.shopSel || 0);
          if (tapAny('KeyS', 'ArrowDown', 'Minus', 'NumpadSubtract')) sellUpgrade(game.shopSel || 0);
        }
        if (game.stateT > 0.3 && tapAny('Enter', 'NumpadEnter', 'Space')) {
          game.wave++;
          startDeploy(false); // chỉ cảnh máy bay đưa Titan ra trận
        }
        break;
      case 'gameover':
        updateBuildings(dt);
        if (game.stateT > 0.8) {
          if (tapAny('Enter', 'NumpadEnter', 'Space')) {
            if (game.mode === 'rush') newRun();
            else setupWave();
          } else if (tap('KeyT')) toTitle();
        }
        break;
      case 'win':
        if (game.stateT > 1 && tapAny('Enter', 'NumpadEnter', 'Space')) {
          if (game.mode === 'duel') {
            game.state = 'duel';
            game.stateT = 0;
            game.kaiju = null;
          } else toTitle();
        } else if (game.stateT > 1 && tap('KeyT')) toTitle();
        break;
    }
    if (game.state !== 'title' && game.state !== 'duel') updateCamera(dt);
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
  // VANGUARD: dáng nghiêng, giáp navy, kính vàng và cơ khí theo ảnh mẫu ở root.
  // Các đoạn chi vẫn dùng IK để giữ đủ động tác chiến đấu.
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
    const rest = T.def.id === 'vanguard'
      ? (side === 'L' ? { x: 112, y: -249 + breathe } : { x: 30, y: -161 + breathe })
      : (side === 'L' ? { x: -64, y: -166 + breathe } : { x: 76, y: -160 + breathe });
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

  // VANGUARD: giáp xanh thép nhiều lớp theo gipsy danger.jpeg, không đổi bộ vẽ Tempest.
  function drawVanguardJoint(x, y, r, P) {
    const steel = P.steel || '#d8e5e9';
    ctx.fillStyle = P.frame;
    ellipse(x, y, r + 3, r + 3); ctx.fill();
    ctx.fillStyle = vGrad(y - r, y + r, steel, P.frameHi, P.lo);
    ellipse(x, y, r, r); ctx.fill();
    ctx.strokeStyle = steel; ctx.lineWidth = 1.5;
    ellipse(x, y, r - 3, r - 3); ctx.stroke();
    ctx.fillStyle = P.frame;
    ellipse(x, y, r * 0.55, r * 0.55); ctx.fill();
    ctx.fillStyle = P.frameHi;
    ellipse(x, y, r * 0.34, r * 0.34); ctx.fill();
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      ctx.fillStyle = steel;
      ellipse(x + Math.cos(a) * r * 0.77, y + Math.sin(a) * r * 0.77, 1.1, 1.1); ctx.fill();
    }
  }

  // Đường ráp và cạnh bắt sáng dùng chung cho các tấm giáp Vanguard.
  function vanguardSeam(points, color, width = 1) {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.stroke();
  }

  // Đường chia tấm, ốc chìm và vết xước ngắn; cắt trong từng tấm giáp.
  function vanguardPanel(points, P, seed = 0) {
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    clipPoly(points, () => {
      for (let i = 1; i <= 3; i++) {
        const y = y0 + (y1 - y0) * i / 4;
        vanguardSeam([[x0, y], [x1, y + 2]], P.line, 0.65);
        vanguardSeam([[x0, y + 1], [x1, y + 3]], P.frameHi, 0.55);
      }
      for (let i = 0; i < 6; i++) {
        const x = x0 + 5 + ((i * 0.381 + seed) % 1) * Math.max(1, x1 - x0 - 10);
        const y = y0 + 6 + ((i * 0.273 + seed) % 1) * Math.max(1, y1 - y0 - 12);
        ctx.fillStyle = P.frame; ellipse(x, y, 1.4, 1.4); ctx.fill();
        vanguardSeam([[x - 1, y - 1], [x + 0.5, y - 1]], P.steel || P.hi, 0.8);
        if (i % 2 === 0) vanguardSeam([[x + 3, y + 4], [x + 7, y + 3]], P.frameHi, 0.6);
      }
    });
  }

  function drawVanguardArm(T, side, sx, sy, P, lc) {
    const p = armPose(T, side);
    if (p.charging) p.ch = T.charge;
    const cannon = p.cannon || p.charging;
    const k = ik(sx, sy, p.x, p.y, cannon ? 96 : 83, cannon ? 120 : 108, 1);
    const steel = P.steel || '#d8e5e9';
    seg(sx, sy, k.jx, k.jy, len => {
      poly([[-12, -19], [len - 5, -20], [len + 7, 16], [-4, 23]], P.frame, P.line);
      // Thanh truyền sáng nằm giữa giáp và bắp tay, không tô đặc cả khớp.
      poly([[8, 12], [len - 3, 9], [len + 1, 20], [12, 27]], P.frameHi, P.line);
      vanguardSeam([[18, 18], [len - 8, 15]], steel, 4);
      poly([[-7, -25], [25, -30], [len - 12, -24], [len - 4, -8], [len - 19, 14], [0, 18]], vGrad(-30, 18, P.hi, P.armor, P.lo), P.line, 2);
      poly([[-7, -25], [25, -30], [len - 12, -24], [len - 18, -17], [19, -18]], P.hi, P.line, 0.8);
      poly([[11, 1], [len - 18, -5], [len - 19, 14], [0, 18]], P.lo, P.line);
      vanguardSeam([[9, -20], [28, -23], [len - 18, -17]], steel);
      vanguardSeam([[11, 6], [len - 24, 2]], P.accent, 2);
      // Sọc trắng đôi trên bắp tay theo ảnh mặt trước.
      for (const x of [21, 32]) poly([[x, -27], [x + 5, -27], [x + 8, -4], [x + 3, -3]], steel, P.line, 0.5);
      vanguardPanel([[38, -20], [len - 17, -19], [len - 19, -5], [42, -3]], P, 0.19);
      for (let i = 0; i < 3; i++) {
        const x = 24 + i * 10;
        vanguardSeam([[x, -12], [x + 5, -2]], P.frame, 2);
      }
    });
    if (p.jet) drawElbowJet(p, k, lc);
    drawVanguardJoint(k.jx, k.jy, 14, P);
    seg(k.jx, k.jy, k.ex, k.ey, len => {
      if (cannon) {
        drawVanguardPlasma(p, len, P);
        return;
      }
      // Giáp cẳng tay vát dài, hai thanh dẫn và bàn tay có đốt.
      poly([[-7, -13], [len + 12, -14], [len + 17, 17], [-8, 19]], P.frame, P.line);
      poly([[4, 13], [len - 10, 14], [len - 8, 24], [17, 27]], P.frameHi, P.line);
      vanguardSeam([[19, 19], [len - 18, 18]], steel, 3);
      poly([[-9, -21], [18, -32], [len * 0.67, -30], [len + 2, -15], [len + 7, 9], [len - 14, 23], [21, 24], [-10, 10]], vGrad(-32, 24, P.hi, P.armor, P.lo), P.line, 2);
      poly([[18, -32], [len * 0.67, -30], [len + 2, -15], [len - 9, -11], [len * 0.59, -21], [10, -23]], P.hi, P.line, 0.8);
      poly([[13, 3], [len - 6, -2], [len + 7, 9], [len - 14, 23], [21, 24]], P.lo, P.line);
      poly([[17, -18], [len * 0.59, -18], [len - 20, -8], [len - 25, 3], [21, 6], [5, -2]], P.armor, P.line);
      vanguardSeam([[19, -16], [len * 0.57, -16], [len - 24, -7]], steel, 1.5);
      // Mảng đỏ dày chạy sát mép giáp và vây bảo vệ ngoài cẳng tay.
      poly([[16, -29], [27, -30], [len - 25, -26], [len - 21, -20], [29, -23], [19, -19]], P.accent, P.line, 0.8);
      poly([[3, 18], [27, 27], [len - 22, 27], [len - 9, 18], [len - 24, 35], [25, 35], [-6, 23]], P.lo, P.line);
      vanguardSeam([[10, 24], [29, 31], [len - 26, 31]], steel, 1.2);
      vanguardSeam([[23, 10], [len - 23, 7], [len - 14, 16]], P.accent, 2);
      vanguardPanel([[20, -17], [len * 0.57, -17], [len - 24, -7], [len - 27, 2], [23, 5]], P, 0.31);
      for (const x of [18, len - 26]) {
        ctx.fillStyle = steel; ellipse(x, -8, 2, 2); ctx.fill();
      }
      // Hai vòng cổ tay, bốn đốt ngón nằm dưới mu bàn tay bọc giáp.
      poly([[len - 9, -16], [len + 5, -15], [len + 9, 17], [len - 7, 20]], steel, P.line);
      poly([[len + 4, -15], [len + 26, -12], [len + 34, -1], [len + 28, 17], [len + 8, 18]], P.armor, P.line, 2);
      poly([[len + 8, -13], [len + 26, -12], [len + 30, -5], [len + 10, -4]], P.hi);
      for (let i = 0; i < 4; i++) {
        const x = len + 8 + i * 5;
        poly([[x, 3], [x + 4, 2], [x + 5, 15], [x + 1, 19]], P.frameHi, P.line, 0.8);
      }
      poly([[len - 1, 14], [len + 6, 13], [len + 12, 27], [len + 4, 29], [len - 3, 23]], P.lo, P.line);
      if (p.blade) drawChainSword(p, len, lc, P);
    });
  }

  function drawVanguardLeg(hx, hy, fx, fy, P, lift) {
    const k = ik(hx, hy, fx, fy - 26, 99, 101, -1);
    const steel = P.steel || '#d8e5e9';
    seg(hx, hy, k.jx, k.jy, len => {
      poly([[-10, -21], [len, -17], [len + 4, 22], [-8, 26]], P.frame, P.line);
      poly([[8, 18], [len - 12, 16], [len - 8, 26], [15, 33]], P.frameHi, P.line);
      vanguardSeam([[18, 25], [len - 17, 22]], steel, 4);
      poly([[-11, -27], [18, -35], [len * 0.66, -31], [len - 9, -19], [len - 6, 8], [len - 20, 21], [9, 26], [-15, 9]], vGrad(-35, 26, P.hi, P.armor, P.lo), P.line, 2);
      poly([[-11, -27], [18, -35], [len * 0.66, -31], [len * 0.61, -21], [17, -23], [-5, -15]], P.hi, P.line, 0.8);
      poly([[6, 2], [len * 0.66, -8], [len - 6, 8], [len - 20, 21], [9, 26]], P.lo, P.line);
      poly([[15, -19], [len * 0.62, -19], [len - 23, -8], [len - 29, 7], [14, 14]], P.armor, P.line);
      vanguardSeam([[7, -22], [20, -28], [len * 0.55, -25]], steel, 1.2);
      vanguardSeam([[16, 12], [len - 29, 5], [len - 23, 13]], P.accent, 2.5);
      poly([[4, -28], [16, -31], [30, -28], [27, -23], [14, -25], [7, -22]], P.accent, P.line, 0.6);
      poly([[30, -18], [len - 25, -14], [len - 23, 2], [len - 35, 9], [29, 7]], P.lo, P.line);
      vanguardPanel([[32, -15], [len - 29, -11], [len - 27, 0], [len - 36, 6], [32, 4]], P, 0.24);
      poly([[len - 31, -15], [len - 23, -12], [len - 25, -7]], steel);
      for (let i = 0; i < 4; i++) {
        const x = len * 0.5 + i * 7;
        vanguardSeam([[x, -14], [x + 7, -6]], P.frame, 1.4);
      }
    });
    seg(k.jx, k.jy, k.ex, k.ey, len => {
      poly([[-7, -17], [len + 5, -14], [len + 6, 22], [-4, 24]], P.frame, P.line);
      // Sau bắp chân lộ cơ khí; mặt trước là tấm giáp lớn vát cạnh.
      poly([[14, 15], [len - 10, 14], [len - 5, 27], [26, 34]], P.frameHi, P.line);
      vanguardSeam([[29, 27], [len - 13, 22]], steel, 4);
      for (let i = 0; i < 5; i++) {
        const x = 30 + i * 10;
        vanguardSeam([[x, 20], [x + 5, 31]], P.frame, 3);
      }
      poly([[-7, -23], [20, -37], [48, -35], [len - 18, -24], [len + 1, -11], [len + 6, 12], [len - 11, 26], [38, 30], [9, 14]], vGrad(-37, 30, P.hi, P.armor, P.lo), P.line, 2);
      poly([[20, -37], [48, -35], [len - 18, -24], [len + 1, -11], [len - 12, -5], [len - 26, -17], [23, -25]], P.hi, P.line, 0.8);
      poly([[14, 0], [len - 20, -3], [len + 6, 12], [len - 11, 26], [38, 30], [9, 14]], P.lo, P.line);
      poly([[24, -24], [len - 30, -18], [len - 16, -3], [len - 21, 14], [41, 19], [22, 7]], P.armor, P.line);
      vanguardSeam([[31, -19], [len - 35, -14], [len - 25, -3], [len - 29, 12]], P.accent, 3);
      vanguardSeam([[27, -27], [47, -26], [len - 24, -16]], steel, 1.2);
      // Chia giáp ống chân thành hai khoang, viền trắng và dải đỏ ngang.
      poly([[42, -29], [48, -28], [51, 17], [45, 20]], P.lo, P.line);
      poly([[43, -29], [47, -28], [49, -18], [45, -19]], steel);
      poly([[50, -27], [54, -26], [55, -18], [51, -18]], P.accent);
      vanguardPanel([[26, -22], [40, -22], [42, 15], [27, 11]], P, 0.43);
      vanguardPanel([[54, -20], [len - 31, -16], [len - 20, -3], [len - 24, 14], [55, 18]], P, 0.08);
      poly([[len - 17, -24], [len - 10, -18], [len - 11, -11], [len - 19, -17]], P.visor || '#f1d084');
      for (const [x, y] of [[24, -16], [43, 15], [len - 17, 8]]) {
        ctx.fillStyle = steel; ellipse(x, y, 1.5, 1.5); ctx.fill();
      }
    });
    // Gối kép có thanh truyền chéo, giáp gối tách khỏi giáp đùi.
    drawVanguardJoint(k.jx - 9, k.jy - 2, 14, P);
    poly([[k.jx - 7, k.jy - 19], [k.jx + 16, k.jy - 21], [k.jx + 28, k.jy - 6], [k.jx + 18, k.jy + 6]], steel, P.line);
    drawVanguardJoint(k.jx + 19, k.jy - 7, 10, P);
    poly([[k.jx + 7, k.jy - 28], [k.jx + 31, k.jy - 24], [k.jx + 39, k.jy - 11], [k.jx + 21, k.jy - 14]], P.armor, P.line);
    ctx.save(); ctx.translate(k.ex, k.ey); ctx.rotate(-lift * 0.25);
    poly([[-22, 1], [-9, -10], [13, -8], [28, 7], [57, 17], [63, 24], [58, 28], [-36, 28], [-40, 20], [-31, 11]], vGrad(-10, 28, P.hi, P.armor, P.lo), P.line, 2);
    poly([[12, -5], [28, 7], [57, 17], [40, 19], [9, 8], [-5, 7]], P.hi, P.line);
    poly([[-39, 22], [59, 22], [63, 27], [58, 30], [-39, 30]], P.frame, P.line);
    vanguardSeam([[-25, 19], [9, 18], [37, 24], [55, 24]], steel, 1.2);
    drawVanguardJoint(0, 0, 12, P);
    poly([[-15, 5], [-7, 12], [-10, 22], [-22, 20], [-27, 12]], P.lo, P.line);
    drawVanguardJoint(-17, 14, 6, P);
    ctx.restore();
  }

  function drawVanguardBody(T, F, B, lc, by, hip, lean, s1, s2, lift1, lift2, crouch, spreadFeet) {
    const steel = F.steel || '#d8e5e9';
    drawVanguardLeg(-19, hip + 6, -35 - 44 * spreadFeet + s2 * (T.moving ? 24 : 0) - crouch * 0.5, -lift2 * 22, B, lift2);
    drawVanguardLeg(17, hip + 6, 25 + 50 * spreadFeet + s1 * (T.moving ? 24 : 0) + crouch * 0.6, -lift1 * 22, F, lift1);
    poly([[-44, hip - 19], [24, hip - 23], [44, hip - 3], [29, hip + 24], [-29, hip + 23], [-47, hip + 6]], F.frame, F.line, 2);
    drawVanguardJoint(-22, hip + 5, 16, F);
    poly([[-38, hip - 15], [-10, hip - 22], [18, hip - 13], [27, hip + 3], [13, hip + 19], [-15, hip + 12], [-37, hip + 14]], F.armor, F.line);
    poly([[-35, hip - 15], [-10, hip - 22], [18, hip - 13], [12, hip - 6], [-13, hip - 10]], F.hi);
    poly([[17, hip - 12], [34, hip - 13], [45, hip + 2], [29, hip + 26], [18, hip + 17]], F.lo, F.line);
    vanguardSeam([[-26, hip - 8], [-8, hip - 13], [11, hip - 5]], F.accent, 2);

    ctx.save();
    ctx.translate(0, hip); ctx.rotate(lean); ctx.translate(0, -hip - BODY_LIFT + by);
    drawVanguardArm(T, 'L', -31, -302, B, lc);
    // Ba tấm tản nhiệt xòe sau cổ và vai theo ảnh lưng.
    poly([[-54, -330], [-60, -386], [-43, -414], [-20, -408], [-25, -349]], B.lo, F.line, 2);
    poly([[-57, -385], [-43, -409], [-24, -405], [-33, -375], [-33, -344]], F.armor, F.line);
    vanguardPanel([[-54, -383], [-42, -405], [-28, -402], [-36, -374], [-37, -351]], F, 0.37);
    vanguardSeam([[-43, -403], [-43, -386], [-39, -371]], F.accent, 1.8);
    poly([[-52, -338], [-86, -377], [-100, -373], [-88, -346], [-66, -320]], B.armor, F.line, 2);
    poly([[-87, -372], [-98, -369], [-84, -348], [-65, -330], [-62, -338]], F.hi, F.line);
    poly([[-35, -350], [-20, -398], [-7, -407], [0, -405], [-13, -381], [-13, -344]], F.lo, F.line);
    vanguardSeam([[-19, -394], [-8, -403], [-1, -402]], steel, 1.5);
    // Trục cơ khí và lò xo màu đồng nằm giữa các mảng giáp lưng.
    poly([[-69, -325], [-51, -329], [-35, -302], [-40, -245], [-58, -230], [-73, -247]], B.frame, F.line);
    for (let i = 0; i < 7; i++) {
      const y = -309 + i * 10;
      poly([[-64, y], [-49, y - 3], [-45, y + 4], [-60, y + 7]], B.frameHi, F.line, 0.7);
      vanguardSeam([[-68, y + 1], [-60, y + 5]], '#9b926e', 2);
    }
    poly([[-75, -315], [-59, -326], [-49, -312], [-53, -284], [-66, -279], [-79, -292]], F.armor, F.line);
    vanguardPanel([[-73, -311], [-60, -319], [-55, -309], [-59, -289], [-68, -286]], F, 0.17);
    // Eo cơ khí gọn, ba vòng giáp bụng xếp chéo nối xuống hông.
    poly([[-37, -236], [31, -238], [29, -162], [-27, -155], [-42, -186]], F.frame, F.line);
    vanguardSeam([[-29, -230], [-33, -178]], steel, 4);
    for (let i = 0; i < 4; i++) {
      const y = -224 + i * 15;
      poly([[-24, y], [24, y - 7], [32, y + 2], [25, y + 12], [-23, y + 15], [-32, y + 6]], vGrad(y - 7, y + 15, F.armor, F.lo, F.frame), F.line);
      vanguardSeam([[-19, y + 2], [22, y - 4]], F.frameHi, 1.5);
    }
    // Ngực nở thành vòm ngang, các đường sườn hội tụ vào lò phản ứng.
    poly([[-53, -317], [-30, -345], [5, -348], [43, -330], [68, -304], [73, -282], [51, -260], [13, -252], [-39, -266]], vGrad(-348, -252, F.hi, F.armor, F.lo), F.line, 2);
    poly([[-27, -338], [7, -340], [43, -324], [65, -303], [67, -293], [29, -310], [-15, -319]], F.armor, F.line);
    vanguardPanel([[-20, -332], [7, -335], [39, -321], [58, -305], [29, -315], [-13, -322]], F, 0.22);
    vanguardSeam([[-16, -324], [21, -320], [52, -306], [65, -294]], steel, 1.5);
    vanguardSeam([[-15, -294], [29, -279], [64, -286]], F.frame, 3);
    // Thân ngực có chiều sâu: lưng tối, giáp cổ và ngực trước chia mặt vát.
    poly([[-52, -306], [-38, -340], [-9, -351], [23, -337], [43, -304], [53, -269], [35, -231], [-10, -220], [-41, -238], [-57, -270]], vGrad(-351, -220, F.hi, F.armor, F.lo), F.line, 2);
    poly([[-38, -340], [-9, -351], [23, -337], [39, -313], [11, -316], [-16, -329], [-43, -321]], F.armor, F.line);
    poly([[-9, -351], [23, -337], [39, -313], [25, -317], [10, -335]], F.hi, F.line, 0.8);
    poly([[-42, -315], [-12, -323], [18, -309], [38, -289], [33, -277], [-7, -284], [-44, -275]], F.lo, F.line);
    for (let i = 0; i < 4; i++) vanguardSeam([[-28, -307 + i * 6], [9, -306 + i * 6]], F.frameHi, 2);
    poly([[14, -310], [38, -305], [51, -278], [44, -260], [27, -271], [13, -289]], F.armor, F.line);
    vanguardSeam([[22, -302], [37, -296], [44, -279]], steel, 1.2);
    poly([[-44, -271], [-10, -278], [31, -256], [35, -231], [8, -220], [-30, -230], [-48, -250]], F.armor, F.line);
    poly([[-43, -263], [-15, -268], [14, -251], [18, -241], [-16, -248]], F.hi, F.line, 0.8);
    vanguardSeam([[-32, -248], [-13, -238], [18, -237]], F.accent, 2.5);
    // Giáp bụng dọc che một phần ống xếp, vẫn để lộ eo cơ khí phía sau.
    poly([[-4, -231], [17, -236], [28, -221], [22, -177], [12, -161], [0, -171]], F.armor, F.line);
    poly([[3, -227], [11, -229], [15, -216], [12, -179], [7, -171]], F.hi, F.line, 0.8);
    vanguardPanel([[15, -223], [23, -218], [18, -184], [14, -176]], F, 0.18);
    // Lò cam tua-bin như ảnh mới; chuyển sang trắng nóng khi tung tuyệt chiêu.
    // Giữ (29,-264) trùng điểm xuất phát chùm tia tối thượng.
    ctx.save(); ctx.translate(29, -264); ctx.scale(0.76, 1);
    drawVanguardJoint(0, 0, 28, F);
    const boost = reactorBoost(T);
    ctx.shadowColor = '#ff9b35'; ctx.shadowBlur = 10 + boost * 40;
    ctx.fillStyle = '#913917'; ellipse(0, 0, 22, 22); ctx.fill();
    ctx.strokeStyle = '#eaaa4a'; ctx.lineWidth = 2; ellipse(0, 0, 20, 20); ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const a = i * PI2 / 12 + game.t * (boost ? 8 : 0.3);
      ctx.save(); ctx.rotate(a);
      poly([[4, -1], [10, -8], [19, -9], [20, -4], [13, -4], [6, 2]], i % 2 ? '#f4a33d' : '#cc6a22', '#ffc064', 0.6);
      ctx.restore();
    }
    ctx.fillStyle = boost ? '#fff8db' : '#ffd77a'; ellipse(0, 0, 5 + boost * 2, 5 + boost * 2); ctx.fill();
    ctx.restore();
    // Cổ có piston, mũ giáp cong và kính vàng hẹp hướng về trước.
    poly([[-13, -340], [-12, -360], [13, -359], [26, -337], [14, -329]], F.frameHi, F.line);
    vanguardSeam([[-5, -354], [5, -337]], steel, 4);
    poly([[-23, -361], [-23, -376], [-13, -390], [5, -396], [23, -390], [34, -379], [37, -366], [30, -349], [12, -341], [-3, -347]], vGrad(-396, -341, F.hi, F.armor, F.lo), F.line, 2);
    poly([[-23, -376], [-13, -390], [5, -396], [23, -390], [30, -381], [8, -385], [-8, -381]], F.armor, F.line, 0.8);
    vanguardSeam([[-14, -386], [4, -391], [19, -386]], steel, 1.5);
    poly([[3, -380], [29, -379], [37, -370], [34, -358], [21, -355], [6, -362], [-1, -370]], F.frame, F.line);
    ctx.save(); ctx.shadowColor = '#f5cf79'; ctx.shadowBlur = 4;
    poly([[8, -373], [27, -373], [32, -368], [28, -365], [20, -363], [9, -367], [5, -370]], F.visor || '#f1d084');
    ctx.restore();
    vanguardSeam([[9, -373], [27, -372], [31, -368]], '#fff0ba', 1.5);
    vanguardSeam([[18, -376], [17, -362]], F.frameHi, 1.4);
    poly([[2, -361], [11, -353], [28, -352], [22, -342], [12, -339], [-2, -348]], F.armor, F.line);
    for (let i = 0; i < 3; i++) vanguardSeam([[12, -350 + i * 3], [23, -351 + i * 3]], F.frame, 1.2);
    drawVanguardJoint(-14, -365, 6, F);
    poly([[0, -393], [4, -394], [9, -381], [5, -380]], F.accent, F.line, 0.7);
    // Mặt nạ cơ khí và lưới tản nhiệt bên dưới kính.
    poly([[10, -360], [17, -357], [21, -346], [16, -341], [8, -348]], F.frameHi, F.line);
    for (let i = 0; i < 4; i++) vanguardSeam([[11 + i * 2, -354], [13 + i * 2, -346]], F.frame, 0.8);
    // Vai gần rộng và nghiêng, phủ lên cánh tay nhưng không che đầu.
    drawSlashTrail(T, -27, -304);
    drawVanguardArm(T, 'R', -27, -304, F, lc);
    // Vai dạng khiên: đỉnh gần ngang, cạnh dưới chéo và hai sọc sáng.
    drawVanguardJoint(-54, -321, 16, F);
    poly([[-67, -340], [-53, -355], [-15, -354], [8, -342], [16, -323], [5, -297], [-13, -278], [-57, -292], [-71, -314]], vGrad(-355, -278, F.hi, F.armor, F.lo), F.line, 2);
    poly([[-67, -340], [-53, -355], [-15, -354], [8, -342], [9, -334], [-19, -343], [-51, -343], [-64, -329]], F.hi, F.line, 0.8);
    poly([[-62, -331], [-51, -340], [-20, -339], [6, -330], [4, -311], [-16, -287], [-54, -299]], F.armor, F.line);
    poly([[-65, -320], [-54, -299], [-16, -287], [4, -311], [5, -297], [-13, -278], [-57, -292], [-71, -314]], F.lo, F.line);
    for (const x of [-47, -35]) poly([[x, -351], [x + 5, -351], [x + 9, -337], [x + 5, -303], [x, -297], [x - 1, -309], [x + 3, -337]], steel, F.line, 0.5);
    vanguardPanel([[-60, -330], [-49, -337], [-22, -335], [-1, -327], [-3, -313], [-19, -292], [-52, -302]], F, 0.49);
    vanguardSeam([[-61, -325], [-54, -303], [-16, -291], [0, -311]], steel, 1);
    vanguardSeam([[-62, -316], [-57, -296], [-16, -283]], F.accent, 1.5);
    ctx.save(); ctx.translate(-21, -307); ctx.rotate(0.14);
    ctx.font = '900 18px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#acb8b8'; ctx.fillText('34', 0, 0); ctx.restore();
    if (T.hp / T.maxHp < 0.7) vanguardSeam([[-16, -332], [-8, -319], [-14, -306]], F.frame, 2);
    rainSheen(-43, 24, -335, -230, 0.13);
    ctx.restore();
  }

  // TEMPEST: góc nghiêng theo striker-eureka.jpg ở root, vai vòm và đường viền vàng/xanh.
  function drawTempestShoulder(x, y, P, side) {
    ctx.save(); ctx.translate(x, y); ctx.scale(side, 1);
    poly([[-23, 10], [-30, -9], [-25, -32], [-11, -43], [16, -45], [35, -35], [44, -18], [41, 4], [27, 18], [3, 22]], P.armor, P.line, 2);
    poly([[-25, -32], [-11, -43], [16, -45], [35, -35], [40, -23], [12, -31], [-10, -27]], P.accent, P.line);
    poly([[-10, -27], [12, -31], [40, -23], [41, -3], [27, 18], [3, 22], [-15, 10]], P.hi, P.line);
    poly([[24, -22], [40, -23], [41, -3], [27, 18], [15, 17]], P.armor);
    ctx.strokeStyle = P.trim || P.lo; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-19, -25); ctx.lineTo(11, -35); ctx.lineTo(34, -29); ctx.stroke();
    ctx.strokeStyle = P.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(5, -5); ctx.lineTo(26, 5); ctx.stroke();
    ctx.restore();
  }

  function drawTempestArm(T, side, sx, sy, P, lc) {
    const p = armPose(T, side);
    const k = ik(sx, sy, p.x, p.y, 83, 94, 1);
    seg(sx, sy, k.jx, k.jy, (len) => {
      poly([[-8, -16], [len + 4, -15], [len + 4, 17], [-8, 18]], P.frame, P.line);
      poly([[3, -22], [len * 0.6, -24], [len - 5, -13], [len - 9, 14], [0, 15]], P.armor, P.line);
      poly([[3, -22], [len * 0.6, -24], [len * 0.55, -14], [2, -12]], P.hi);
      poly([[len * 0.48, -24], [len * 0.74, -20], [len * 0.78, 14], [len * 0.56, 17]], P.accent, P.line, 1);
      ctx.strokeStyle = P.trim || P.lo; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(len * 0.56, -22); ctx.lineTo(len * 0.63, 14); ctx.stroke();
      ctx.fillStyle = P.hi; ctx.fillRect(12, 14, Math.max(1, len - 30), 3);
    });
    drawJointDisc(k.jx, k.jy, 15, P);
    seg(k.jx, k.jy, k.ex, k.ey, (len) => {
      poly([[-10, -16], [len + 9, -15], [len + 12, 17], [-4, 19]], P.frame, P.line);
      // Cẳng tay hình khiên lớn, hai vây ngắn phía sau và ổ trục tròn xanh lam.
      for (let i = 0; i < 2; i++) {
        const x = 13 + i * 27;
        poly([[x, 12], [x + 10, 35], [x + 22, 36], [x + 25, 17]], P.armor, P.line);
        poly([[x + 7, 27], [x + 10, 35], [x + 22, 36], [x + 23, 29]], P.accent);
      }
      poly([[-5, -21], [25, -31], [len - 18, -25], [len + 4, -8], [len - 5, 23], [len * 0.45, 30], [4, 17]], P.armor, P.line, 2);
      poly([[-5, -21], [25, -31], [len - 18, -25], [len - 25, -16], [22, -19]], P.hi, P.line, 1);
      ctx.fillStyle = P.trim || P.lo; ellipse(len * 0.44, -1, 17, 17); ctx.fill();
      ctx.strokeStyle = P.hi; ctx.lineWidth = 2; ellipse(len * 0.44, -1, 12, 12); ctx.stroke();
      ctx.fillStyle = P.accent; ellipse(len * 0.44, -1, 9, 9); ctx.fill();
      ctx.strokeStyle = P.frame; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(len * 0.44 - 1, -8); ctx.lineTo(len * 0.44 - 1, 6); ctx.stroke();
      poly([[len - 8, -16], [len + 25, -15], [len + 32, -3], [len + 24, 18], [len - 7, 17]], P.frame, P.line);
      for (let i = 0; i < 3; i++) poly([[len + 12, -12 + i * 10], [len + 26, -10 + i * 10], [len + 23, -4 + i * 10], [len + 10, -5 + i * 10]], P.lo, P.line, 1);
      drawWristBlade(p, len, P);
    });
  }

  function drawTempestBody(T, F, B, lc, by, hip, lean, s1, s2, lift1, lift2, crouch, spreadFeet) {
    drawTitanLeg(-22, hip + 6, -28 - 44 * spreadFeet + s2 * (T.moving ? 24 : 0) - crouch * 0.5, -lift2 * 22, B, lift2);
    ctx.save();
    ctx.translate(0, hip); ctx.rotate(lean); ctx.translate(0, -hip - BODY_LIFT);
    drawTempestArm(T, 'L', -30, -292 + by, B, lc);
    drawTempestShoulder(-34, -301 + by, B, -1);
    ctx.restore();
    drawTitanLeg(22, hip + 6, 31 + 50 * spreadFeet + s1 * (T.moving ? 24 : 0) + crouch * 0.6, -lift1 * 22, F, lift1);
    // Hông hẹp với giáp nhọn, tương phản với hai vai rộng.
    poly([[-43, hip - 19], [35, hip - 19], [44, hip + 7], [14, hip + 27], [-37, hip + 18]], F.frame, F.line);
    poly([[-42, hip - 15], [-8, hip - 19], [-12, hip + 16], [-34, hip + 23], [-46, hip + 6]], B.armor, B.line);
    poly([[0, hip - 19], [36, hip - 15], [45, hip + 5], [19, hip + 23], [3, hip + 11]], F.armor, F.line);
    poly([[-6, hip - 12], [11, hip - 11], [17, hip + 11], [4, hip + 27], [-9, hip + 8]], F.lo, F.line);
    ctx.save();
    ctx.translate(0, hip); ctx.rotate(lean); ctx.translate(0, -hip - BODY_LIFT + by);
    // Vây lưng dạng lưỡi nhọn sau hai vai.
    poly([[-62, -271], [-77, -337], [-70, -397], [-44, -415], [-43, -352], [-27, -301]], B.armor, B.line, 2);
    poly([[-70, -397], [-44, -415], [-43, -401], [-63, -385]], B.hi, B.line, 1);
    poly([[-74, -321], [-90, -309], [-82, -269], [-55, -257]], B.armor, B.line);
    poly([[-74, -266], [-81, -208], [-66, -196], [-50, -257]], B.lo, B.line);
    ctx.strokeStyle = B.line; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(-64, -384 + i * 12); ctx.lineTo(-49, -392 + i * 12); ctx.stroke();
    }
    poly([[-34, -232], [37, -232], [28, -166], [-25, -166]], F.frame, F.line);
    // Bụng cơ khí chia đốt hình chữ V.
    for (let i = 0; i < 4; i++) {
      const y = -221 + i * 13;
      const w = 31 - i * 2;
      poly([[-w, y], [0, y + 5], [w, y - 1], [w - 2, y + 8], [0, y + 14], [-w + 2, y + 8]], i % 2 ? F.lo : F.frameHi, F.line, 1);
    }
    // Giáp ngực rộng hình tam giác, không có lò phản ứng tròn.
    poly([[-46, -310], [-23, -330], [21, -328], [54, -301], [68, -268], [50, -237], [18, -216], [-30, -231], [-48, -269]], F.armor, F.line, 2);
    poly([[-23, -330], [21, -328], [54, -301], [61, -281], [26, -288], [-25, -305]], F.hi, F.line);
    poly([[26, -288], [61, -281], [68, -268], [50, -237], [18, -216], [23, -247]], F.lo, F.line);
    poly([[-48, -269], [-22, -277], [-10, -237], [18, -216], [-30, -231]], F.lo, F.line);
    ctx.strokeStyle = F.trim; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-21, -308); ctx.lineTo(23, -294); ctx.lineTo(57, -280); ctx.stroke();
    poly([[-17, -323], [8, -326], [22, -303], [12, -291], [-16, -293], [-26, -306]], F.frame, F.line);
    ctx.fillStyle = F.accent;
    ctx.fillRect(-12, -309, 23, 3);
    // Sáu tên lửa vẫn thẳng với tọa độ phóng trong logic hiện tại.
    drawChestLauncher(T, 0, F, lc);
    // Đèn đỏ nằm dọc mép ngực vát như ảnh tham chiếu, không che các ống phóng.
    poly([[39, -282], [54, -275], [51, -251], [37, -242]], F.frame, F.line);
    ctx.fillStyle = '#dc4849';
    for (let i = 0; i < 4; i++) {
      poly([[40, -275 + i * 6], [48, -273 + i * 6], [47, -270 + i * 6], [40, -271 + i * 6]], '#dc4849');
    }
    // Cổ giáp cao bao hai bên đầu nhỏ.
    poly([[-38, -316], [-35, -346], [-22, -352], [-13, -328], [0, -318]], F.armor, F.line);
    poly([[27, -327], [40, -352], [48, -344], [50, -317], [33, -307]], F.lo, F.line);
    drawSensorHead(-340, F, lc);
    // Ký hiệu nhỏ trên ngực.
    ctx.save(); ctx.translate(-43, -294); ctx.rotate(-0.12);
    ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = F.frame; ctx.fillText('STRIKER', 0, 0); ctx.fillText('E-01', 0, 10); ctx.restore();
    drawSlashTrail(T, -18, -291);
    drawTempestArm(T, 'R', -18, -291, F, lc);
    drawTempestShoulder(-21, -303, F, 1);
    if (T.hp / T.maxHp < 0.7) {
      ctx.strokeStyle = F.frame; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-53, -312); ctx.lineTo(-43, -294); ctx.lineTo(-49, -281); ctx.stroke();
    }
    ctx.restore();
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
    // Hai lưỡi song song, sống tối và lưỡi vát bạc theo ảnh Striker Eureka.
    for (const dy of [-8, 8]) {
      const tip = base + L - (dy > 0 ? 12 : 0);
      poly([[base, yOff + dy - 3], [tip - 28, yOff + dy - 7], [tip + 18, yOff + dy], [tip - 22, yOff + dy + 6], [base, yOff + dy + 5]], P.lo, P.line);
      poly([[base + 7, yOff + dy - 1], [tip - 27, yOff + dy - 4], [tip + 18, yOff + dy], [tip - 22, yOff + dy + 2]], P.hi);
      ctx.fillStyle = P.accent;
      ctx.fillRect(base + 8, yOff + dy, 20, 3);
    }
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

  // VANGUARD theo plasma.jpeg: giáp mở hai bên, cáp lộ ra, ngón tay tách quanh họng.
  function drawVanguardPlasma(p, len, P) {
    const a = p.a;
    const deploy = p.ch
      ? easeOut(clamp(p.ch.t / 0.2, 0, 1))
      : 1 - easeInOut(clamp((a.t - a.windup - a.m.active) / a.m.recover, 0, 1));
    const charge = clamp(p.ch ? p.ch.level : a.level || 0, 0, 1);
    const firing = !!a && a.t >= a.windup && a.t < a.windup + a.m.active + 0.06;
    const steel = P.steel || P.hi;
    const muzzle = len + 24;
    // Khung cẳng tay giữ nguyên độ dài, không mọc thêm một nòng súng dài.
    poly([[-8, -17], [len - 7, -20], [len + 24, -12], [len + 26, 13], [len - 7, 23], [-7, 18]], P.frame, P.line, 2);
    poly([[3, -17], [24, -24], [42, -20], [43, 18], [23, 24], [0, 16]], P.armor, P.line);
    poly([[9, -18], [24, -24], [40, -20], [37, -14], [18, -11]], P.hi, P.line, 0.7);
    // Ba ray dọc và bó cáp uốn thành nhánh trước vòng tụ plasma.
    for (let i = 0; i < 3; i++) {
      const y = -11 + i * 11;
      poly([[32, y - 3], [len - 10, y - 3], [len + 6, y], [len - 10, y + 3], [32, y + 3]], P.frameHi, P.line, 0.8);
      vanguardSeam([[35, y - 1], [len - 14, y - 1], [len + 3, y + 1]], steel, 1);
    }
    for (let i = 0; i < 5; i++) {
      const y = -14 + i * 7;
      const points = [[38, y], [58, y - 3], [76, y + (i % 2 ? 4 : -5)], [len - 34, y * 0.8], [len - 8, y * 0.65]];
      vanguardSeam(points, P.frame, 4);
      vanguardSeam(points, i % 2 ? steel : P.frameHi, 1.5);
    }
    // Hai nắp giáp lớn có bản lề, mở lên trên và xuống dưới cẳng tay.
    for (const side of [-1, 1]) {
      ctx.save(); ctx.scale(1, side);
      const gap = 15 * deploy;
      poly([[22, 18], [36, 18 + gap], [len - 26, 25 + gap], [len - 5, 18], [len - 16, 9], [42, 9]], P.frameHi, P.line);
      for (const x of [40, len - 32]) {
        vanguardSeam([[x, 11], [x + 6, 21 + gap]], steel, 3);
        drawVanguardJoint(x + 6, 21 + gap, 4, P);
      }
      const plate = [[15, 22 + gap], [34, 33 + gap], [len - 30, 35 + gap], [len - 7, 25 + gap], [len - 19, 16 + gap], [39, 15 + gap]];
      poly(plate, vGrad(15 + gap, 35 + gap, P.hi, P.armor, P.lo), P.line, 2);
      poly([[34, 33 + gap], [len - 30, 35 + gap], [len - 7, 25 + gap], [len - 16, 36 + gap], [len - 32, 44 + gap], [36, 41 + gap]], P.lo, P.line);
      vanguardSeam([[23, 25 + gap], [42, 21 + gap], [len - 23, 22 + gap]], steel, 1.2);
      vanguardPanel(plate, P, side < 0 ? 0.18 : 0.56);
      // Ngàm/ngón tay mở ra phía trước, có bản lề và hai đốt rõ ràng.
      const spread = 13 * deploy;
      poly([[len - 22, 13], [len - 5, 17 + spread], [len + 24, 25 + spread], [len + 47, 20 + spread], [len + 51, 12 + spread], [len + 27, 17 + spread], [len + 2, 9 + spread], [len - 18, 6]], P.armor, P.line, 1.5);
      vanguardSeam([[len - 7, 16 + spread], [len + 24, 22 + spread], [len + 44, 17 + spread]], steel, 1.4);
      drawVanguardJoint(len - 8, 12 + spread, 6, P);
      drawVanguardJoint(len + 25, 21 + spread, 4, P);
      // Cụm ngón phía sau gập ra ngoài, để lộ khoảng rỗng trong lòng bàn tay.
      poly([[len - 29, 26 + gap], [len - 23, 44 + gap], [len - 4, 49 + gap], [len + 10, 42 + gap], [len + 9, 28 + gap], [len - 1, 24 + gap]], P.lo, P.line);
      poly([[len - 19, 30 + gap], [len - 15, 40 + gap], [len - 5, 42 + gap], [len + 3, 37 + gap], [len + 2, 29 + gap]], P.frame, steel, 0.7);
      ctx.restore();
    }
    // Vòng cổ ngắn, họng elip nhìn nghiêng và thấu kính trắng ở tâm.
    poly([[len - 10, -18], [muzzle, -19], [muzzle + 3, 18], [len - 10, 20]], P.lo, P.line);
    vanguardSeam([[len - 5, -17], [len - 5, 18]], steel, 3);
    ctx.fillStyle = P.frame; ellipse(muzzle, 0, 11, 22); ctx.fill();
    ctx.strokeStyle = steel; ctx.lineWidth = 3; ellipse(muzzle + 1, 0, 9, 19); ctx.stroke();
    ctx.save();
    ctx.shadowColor = '#429dff'; ctx.shadowBlur = 12 + charge * 18;
    ctx.fillStyle = '#1956ad'; ellipse(muzzle + 3, 0, 8, 17); ctx.fill();
    ctx.strokeStyle = '#65c8ff'; ctx.lineWidth = 2; ellipse(muzzle + 4, 0, 6, 14); ctx.stroke();
    ctx.fillStyle = '#e6faff'; ellipse(muzzle + 5, 0, 4 + charge * 2, 10 + charge * 3); ctx.fill();
    // Hồ quang xanh không đều giữa các ngàm, sáng mạnh khi nạp đầy.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const angle = game.t * 7 + i * PI2 / 5;
      const reach = 19 + charge * 20 + (firing ? 12 : 0);
      const y = Math.sin(angle) * reach;
      const x = muzzle + Math.cos(angle) * reach * 0.6;
      vanguardSeam([[muzzle + 4, 0], [muzzle + 7 + Math.sin(game.t * 28 + i) * 6, y * 0.35], [x - 5, y * 0.65], [x + 3, y]], i % 2 ? '#89d4ff' : '#397aff', 1.2 + charge);
    }
    if (firing) {
      const g = ctx.createRadialGradient(muzzle + 8, 0, 1, muzzle + 8, 0, 54);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, '#afddff'); g.addColorStop(1, 'rgba(40,100,255,0)');
      ctx.fillStyle = g; ellipse(muzzle + 8, 0, 54, 42); ctx.fill();
    }
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

  // TEMPEST / Striker Eureka: đầu nhỏ thấp giữa cổ giáp, kính đen hẹp, không mắt tròn.
  function drawSensorHead(hy, F, lc) {
    ctx.save();
    ctx.translate(7, hy + 4);
    // Gáy vát và hai má giáp ôm sát đầu.
    poly([[-29, -12], [-21, -30], [-5, -36], [20, -31], [32, -18], [34, 0], [21, 13], [-12, 12], [-25, 2]], F.armor, F.line);
    poly([[-21, -30], [-5, -36], [20, -31], [29, -21], [4, -24], [-14, -21]], F.hi, F.line, 1);
    poly([[-29, -12], [-14, -21], [-12, 6], [-22, 5]], F.lo, F.line);
    poly([[-9, -17], [27, -17], [32, -8], [22, -2], [-9, -5]], F.frame, F.line);
    // Hai khe mắt rất hẹp, ngăn nhau bởi sống mũi bọc giáp.
    ctx.fillStyle = '#a8c9c6';
    ctx.fillRect(-4, -12, 12, 2);
    ctx.fillRect(15, -11, 11, 2);
    poly([[9, -18], [14, -17], [17, 0], [10, 5], [5, 0]], F.hi, F.line, 1);
    poly([[-9, -3], [6, 3], [21, 0], [24, 8], [14, 14], [-4, 10]], F.lo, F.line);
    ctx.fillStyle = F.frame;
    for (let i = 0; i < 3; i++) ctx.fillRect(0, 4 + i * 3, 11, 1);
    poly([[25, -20], [34, -14], [36, 1], [27, 9], [24, 0]], F.armor, F.line);
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

  // Cùng chiều cao đầu–chân; chỉ scale đồng nhất X/Y, không bóp riêng thân hay chân.
  function titanDrawScale(T) {
    return TITAN_SCALE * (372 + BODY_LIFT) / (T.def.model.crown + T.def.model.sole);
  }

  function titanSpecLabel(def) {
    return `${def.heightM} m · ${def.massTonnes.toLocaleString('vi-VN')} tấn`;
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
    const modelScale = titanDrawScale(T);
    ctx.scale(T.facing * modelScale * spin, modelScale);
    ctx.translate(0, -T.def.model.sole);
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

    if (T.def.id === 'vanguard') {
      drawVanguardBody(T, F, B, lc, by, hip, lean, s1, s2, lift1, lift2, crouch, spreadFeet);
      ctx.restore();
      return;
    }
    if (T.def.id === 'tempest') {
      drawTempestBody(T, F, B, lc, by, hip, lean, s1, s2, lift1, lift2, crouch, spreadFeet);
      ctx.restore();
      return;
    }

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


  // ---------- Hiệu ứng chiêu đặc biệt ----------
  // Vị trí lò phản ứng trên ngực (tọa độ màn hình).
  function reactorPos(T) {
    const scale = titanDrawScale(T);
    return {
      x: T.x - game.cam + T.facing * (T.def.id === 'vanguard' ? 29 : 5) * scale,
      y: GROUND - (264 + BODY_LIFT + T.def.model.sole) * scale - T.airY,
    };
  }

  // Một lớp tia: thót ở gốc, phồng ra rồi chạy hết chiều dài.
  function beamBand(x0, xEnd, y0, hw, rgb, a) {
    if (hw <= 0.5) return;
    const dir = Math.sign(xEnd - x0) || 1;
    const g = ctx.createLinearGradient(0, y0 - hw, 0, y0 + hw);
    g.addColorStop(0, `rgba(${rgb},0)`);
    g.addColorStop(0.5, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0, y0 - hw * 0.3);
    ctx.lineTo(x0 + dir * 110, y0 - hw);
    ctx.lineTo(xEnd, y0 - hw);
    ctx.lineTo(xEnd, y0 + hw);
    ctx.lineTo(x0 + dir * 110, y0 + hw);
    ctx.lineTo(x0, y0 + hw * 0.3);
    ctx.closePath();
    ctx.fill();
  }

  function drawBeam() {
    const B = game.beam;
    if (!B) return;
    const T = game.titan;
    const K = game.kaiju;
    const k = Math.min(1, B.t / 0.15) * Math.min(1, (B.dur - B.t) / 0.25);
    const { x: x0, y: y0 } = reactorPos(T);
    const dir = T.facing;
    const len = 1700;
    const xEnd = x0 + len * dir;
    const t = game.t;
    const pulse = 1 + 0.14 * Math.sin(t * 41) + 0.07 * Math.sin(t * 23);
    const w0 = 70 * k * pulse;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // mặt đất phản sáng dưới tia
    const gl = ctx.createLinearGradient(0, GROUND - 30, 0, GROUND + 30);
    gl.addColorStop(0, 'rgba(80,220,255,0)');
    gl.addColorStop(0.5, `rgba(80,220,255,${0.28 * k})`);
    gl.addColorStop(1, 'rgba(80,220,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(Math.min(x0, xEnd), GROUND - 30, len, 60);
    // các lớp tia từ quầng ngoài tới lõi trắng
    beamBand(x0, xEnd, y0, w0 * 1.5, '50,170,255', 0.14);
    beamBand(x0, xEnd, y0, w0 * 1.0, '80,220,255', 0.28);
    beamBand(x0, xEnd, y0, w0 * 0.6, '140,240,255', 0.5);
    beamBand(x0, xEnd, y0, w0 * 0.32, '215,255,255', 0.8);
    beamBand(x0, xEnd, y0, w0 * 0.14, '255,255,255', 1);
    // hai sợi năng lượng xoắn quanh trục tia
    ctx.lineWidth = 3;
    for (const ph of [0, Math.PI]) {
      ctx.strokeStyle = `rgba(200,255,255,${0.75 * k})`;
      ctx.beginPath();
      for (let d = 60; d <= len; d += 12) {
        const y = y0 + Math.sin(d * 0.028 - t * 34 + ph) * w0 * 0.55 * Math.min(1, d / 160);
        if (d === 60) ctx.moveTo(x0 + dir * d, y);
        else ctx.lineTo(x0 + dir * d, y);
      }
      ctx.stroke();
    }
    // vệt sáng chạy dọc tia
    ctx.strokeStyle = `rgba(255,255,255,${0.8 * k})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 26; i++) {
      const d = (i * 137 + t * 2800) % len;
      const y = y0 + (((i * 53) % 50) - 25) * k;
      ctx.moveTo(x0 + dir * d, y);
      ctx.lineTo(x0 + dir * (d + 70), y);
    }
    ctx.stroke();
    // tia sét lách tách quanh tia
    ctx.strokeStyle = `rgba(190,250,255,${0.9 * k})`;
    ctx.lineWidth = 1.6;
    for (let a = 0; a < 4; a++) {
      let d = rand(120, len - 200);
      let y = y0 + rand(-1, 1) * w0 * 0.5;
      ctx.beginPath();
      ctx.moveTo(x0 + dir * d, y);
      for (let s = 0; s < 7; s++) {
        d += rand(14, 30);
        y = y0 + rand(-1, 1) * w0 * 0.95;
        ctx.lineTo(x0 + dir * d, y);
      }
      ctx.stroke();
    }
    // mặt trời lò phản ứng + tia sáng xoay + vệt lóa ngang
    const R = 64 * k * pulse;
    if (R > 1) {
      const sun = ctx.createRadialGradient(x0, y0, 0, x0, y0, R * 1.8);
      sun.addColorStop(0, 'rgba(255,255,255,1)');
      sun.addColorStop(0.3, 'rgba(190,250,255,0.9)');
      sun.addColorStop(0.65, 'rgba(80,210,255,0.35)');
      sun.addColorStop(1, 'rgba(80,210,255,0)');
      ctx.fillStyle = sun;
      ellipse(x0, y0, R * 1.8, R * 1.8);
      ctx.fill();
      ctx.save();
      ctx.translate(x0, y0);
      ctx.rotate(t * 2.4);
      ctx.fillStyle = `rgba(170,245,255,${0.35 * k})`;
      for (let i = 0; i < 12; i++) {
        ctx.rotate(PI2 / 12);
        const L = R * (i % 2 ? 2.2 : 3.2);
        ctx.beginPath();
        ctx.moveTo(0, -R * 0.12);
        ctx.lineTo(L, 0);
        ctx.lineTo(0, R * 0.12);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      const fl = ctx.createLinearGradient(x0 - 420, 0, x0 + 420, 0);
      fl.addColorStop(0, 'rgba(120,230,255,0)');
      fl.addColorStop(0.5, `rgba(220,255,255,${0.7 * k})`);
      fl.addColorStop(1, 'rgba(120,230,255,0)');
      ctx.fillStyle = fl;
      ctx.fillRect(x0 - 420, y0 - 3, 840, 6);
      ctx.fillRect(x0 - 2, y0 - 120 * k, 4, 240 * k);
    }
    // điểm va chạm trên thân quái
    if (K && !K.dying && (K.x - T.x) * dir > 0) {
      const xi = K.x - game.cam - dir * K.half * 0.45;
      const yi = y0;
      const r = 110 * k * (1 + 0.2 * Math.sin(t * 50));
      if (r > 1) {
        const hit = ctx.createRadialGradient(xi, yi, 0, xi, yi, r);
        hit.addColorStop(0, 'rgba(255,255,255,1)');
        hit.addColorStop(0.35, 'rgba(170,245,255,0.8)');
        hit.addColorStop(1, 'rgba(60,180,255,0)');
        ctx.fillStyle = hit;
        ellipse(xi, yi, r, r * 1.2);
        ctx.fill();
      }
      ctx.strokeStyle = `rgba(190,250,255,${0.6 * k})`;
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const p = (t * 3 + i / 3) % 1;
        ctx.globalAlpha = (1 - p) * k;
        ctx.beginPath();
        ctx.ellipse(xi, yi, 40 + p * 160, (40 + p * 160) * 1.25, 0, 0, PI2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // Vệ tinh vũ khí của TEMPEST (tọa độ màn hình).
  function satellitePos() {
    const B = game.barrage;
    if (!B) return null;
    const enter = easeOut(clamp(B.t / 0.5, 0, 1));
    const leave = clamp((B.t - (B.dur - 0.5)) / 0.5, 0, 1);
    return { x: B.sx - game.cam, y: lerp(-90, 170, enter) - leave * leave * 260 };
  }

  function drawSatellite() {
    const P = satellitePos();
    if (!P) return;
    const B = game.barrage;
    const t = game.t;
    const open = easeOut(clamp((B.t - 0.25) / 0.35, 0, 1));
    ctx.save();
    ctx.translate(P.x, P.y);
    // tấm pin mặt trời bung ra
    for (const sg of [-1, 1]) {
      ctx.fillStyle = '#1f3d63';
      const pw = 90 * open;
      ctx.fillRect(sg > 0 ? 30 : -30 - pw, -10, pw, 20);
      ctx.strokeStyle = 'rgba(127,200,255,0.5)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        const x = sg * (30 + (pw * i) / 6);
        ctx.beginPath();
        ctx.moveTo(x, -10);
        ctx.lineTo(x, 10);
        ctx.stroke();
      }
      ctx.fillStyle = '#5a6672';
      ctx.fillRect(sg > 0 ? 22 : -30, -2, 8, 4);
    }
    // thân + ống phóng
    ctx.fillStyle = '#9aa5b0';
    poly([[-24, -18], [24, -18], [30, 0], [24, 18], [-24, 18], [-30, 0]], '#9aa5b0');
    ctx.fillStyle = '#5c6772';
    ctx.fillRect(-22, -4, 44, 8);
    ctx.fillStyle = '#b59a68';
    ctx.fillRect(-24, -18, 48, 4);
    // ống kính ngắm
    const glow = 0.6 + 0.4 * Math.sin(t * 12);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const lg = ctx.createRadialGradient(0, 22, 0, 0, 22, 34);
    lg.addColorStop(0, `rgba(255,255,255,${glow})`);
    lg.addColorStop(0.3, `rgba(255,90,70,${0.8 * glow})`);
    lg.addColorStop(1, 'rgba(255,60,40,0)');
    ctx.fillStyle = lg;
    ellipse(0, 22, 34, 34);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = Math.sin(t * 6) > 0 ? '#5dffb0' : '#1d5a40';
    ellipse(-20, -12, 2.5, 2.5);
    ctx.fill();
    ellipse(20, -12, 2.5, 2.5);
    ctx.fill();
    ctx.restore();
  }

  // Vị trí tên lửa đang lao xuống (tọa độ thế giới), null nếu chưa phóng / đã nổ.
  const STRIKE_FALL = 0.5;
  function missilePos(S) {
    const B = game.barrage;
    const f = (S.t - (STRIKE_DELAY - STRIKE_FALL)) / STRIKE_FALL;
    if (f < 0 || f > 1 || S.done) return null;
    const sx = B ? B.sx : S.x;
    const sy = B ? 190 : -60;
    return { x: lerp(sx, S.x, f), y: lerp(sy, S.y, f * f), f };
  }

  function drawStrikes() {
    drawSatellite();
    const P = satellitePos();
    // ngắm: vòng nhỏ cho mọi quả, khung khóa + đếm ngược cho quả kế tiếp
    const next = game.strikes.find((S) => !S.done && S.t >= 0);
    for (const S of game.strikes) {
      if (S.done || S.t < 0) continue;
      const x = S.x - game.cam;
      const k = clamp(S.t / STRIKE_DELAY, 0, 1);
      ctx.save();
      // tia laser đánh dấu từ vệ tinh
      if (P) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255,70,60,${(0.25 + 0.5 * k) * (0.7 + 0.3 * Math.sin(game.t * 50))})`;
        ctx.lineWidth = 1 + 3 * k;
        ctx.beginPath();
        ctx.moveTo(P.x, P.y + 22);
        ctx.lineTo(x, S.y);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
      const r = 70 - 40 * k;
      ctx.save();
      ctx.translate(x, S.y);
      ctx.rotate(game.t * 2);
      ctx.strokeStyle = '#ff5e4d';
      ctx.lineWidth = 2.5;
      ellipse(0, 0, r, r);
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        ctx.rotate(PI2 / 4);
        ctx.beginPath();
        ctx.moveTo(r - 12, 0);
        ctx.lineTo(r + 14, 0);
        ctx.stroke();
      }
      ctx.restore();
      if (S === next) {
        const b = 90 - 40 * k;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          ctx.moveTo(x + sx * b, S.y + sy * (b - 22));
          ctx.lineTo(x + sx * b, S.y + sy * b);
          ctx.lineTo(x + sx * (b - 22), S.y + sy * b);
        }
        ctx.stroke();
        const left = Math.max(0, STRIKE_DELAY - S.t);
        text(`KHÓA MỤC TIÊU · ${left.toFixed(1)}s`, x, S.y - b - 12, { size: 14, weight: 900, align: 'center', color: '#ff8a7a', glow: '#ff3b2a', blur: 8 });
      }
      // tên lửa lao từ vệ tinh xuống, nghiêng theo hướng bay
      const M = missilePos(S);
      if (M) {
        const mx = M.x - game.cam;
        const prev = missilePos({ ...S, t: S.t - 0.03 }) || M;
        const ang = Math.atan2(M.y - prev.y, M.x - prev.x || 0.0001) - Math.PI / 2;
        ctx.save();
        ctx.translate(mx, M.y);
        ctx.rotate(ang);
        ctx.globalCompositeOperation = 'lighter';
        const tg = ctx.createLinearGradient(0, -260, 0, -30);
        tg.addColorStop(0, 'rgba(255,120,30,0)');
        tg.addColorStop(1, 'rgba(255,235,170,0.95)');
        ctx.fillStyle = tg;
        ctx.fillRect(-8, -260, 16, 230);
        const fg = ctx.createRadialGradient(0, -36, 0, 0, -36, 30);
        fg.addColorStop(0, 'rgba(255,255,220,1)');
        fg.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.fillStyle = fg;
        ellipse(0, -36, 30, 30);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#d9dee4';
        rr(-8, -40, 16, 44, 6);
        ctx.fill();
        ctx.fillStyle = '#5dffb0';
        ctx.fillRect(-8, -6, 16, 6);
        poly([[-8, -30], [-18, -44], [-8, -40]], '#8a94a0');
        poly([[8, -30], [18, -44], [8, -40]], '#8a94a0');
        ctx.restore();
      }
      ctx.restore();
    }
    drawBlasts();
  }

  // Vụ nổ của tên lửa vệ tinh: quả cầu lửa, cột sáng, khói, vết cháy.
  function drawBlasts() {
    for (const b of fx.blasts) {
      const x = b.x - game.cam;
      const big = b.big ? 1.8 : 1;
      const t = b.t;
      const grow = easeOut(clamp(t / 0.22, 0, 1));
      const fade = clamp(1 - (t - 0.15) / 0.75, 0, 1);
      ctx.save();
      // vết cháy trên mặt đất
      ctx.fillStyle = `rgba(20,10,6,${0.5 * clamp(1 - t / 1.6, 0, 1)})`;
      ellipse(x, GROUND + 2, 120 * big, 12);
      ctx.fill();
      // khói bốc lên
      const sm = clamp((t - 0.2) / 1.2, 0, 1);
      if (sm > 0) {
        for (let i = 0; i < 5; i++) {
          const ox = (i - 2) * 30 * big;
          ctx.fillStyle = `rgba(40,36,40,${0.45 * (1 - sm)})`;
          ellipse(x + ox + Math.sin(i * 2 + t) * 10, b.y - sm * 140 * big - (i % 2) * 20, (40 + sm * 50) * big, (30 + sm * 40) * big);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'lighter';
      // cột sáng
      const pil = clamp(1 - t / 0.45, 0, 1);
      if (pil > 0) {
        const pg = ctx.createLinearGradient(x - 40 * big, 0, x + 40 * big, 0);
        pg.addColorStop(0, 'rgba(255,200,120,0)');
        pg.addColorStop(0.5, `rgba(255,240,200,${0.8 * pil})`);
        pg.addColorStop(1, 'rgba(255,200,120,0)');
        ctx.fillStyle = pg;
        ctx.fillRect(x - 40 * big, 0, 80 * big, b.y);
      }
      // quả cầu lửa
      const R = 140 * big * grow;
      if (R > 1 && fade > 0) {
        const fg = ctx.createRadialGradient(x, b.y, 0, x, b.y, R);
        fg.addColorStop(0, `rgba(255,255,240,${fade})`);
        fg.addColorStop(0.25, `rgba(255,220,120,${0.95 * fade})`);
        fg.addColorStop(0.55, `rgba(255,120,40,${0.7 * fade})`);
        fg.addColorStop(1, 'rgba(180,40,20,0)');
        ctx.fillStyle = fg;
        ellipse(x, b.y, R, R * 0.9);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // Dải băng chéo khi tung chiêu: hai vệt kính phi công + tên chiêu.
  function drawUltCutin() {
    const U = game.ultFx;
    if (!U || U.t > 1.1) return;
    const T = game.titan;
    const glow = T.def.ult === 'orbital' ? '#5dffb0' : '#7ff6ff';
    const acc = T.def.pal.front.accent;
    const inK = easeOut(clamp(U.t / 0.2, 0, 1));
    const out = easeIn(clamp((U.t - 0.8) / 0.25, 0, 1));
    const by = 150;
    const bh = 128;
    ctx.save();
    ctx.translate((1 - inK) * -W + out * W, 0);
    ctx.fillStyle = 'rgba(2,8,16,0.88)';
    ctx.beginPath();
    ctx.moveTo(0, by + 26);
    ctx.lineTo(W, by - 26);
    ctx.lineTo(W, by + bh - 26);
    ctx.lineTo(0, by + bh + 26);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.clip();
    // vệt tốc độ
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 18; i++) {
      const y = by - 20 + ((i * 41) % (bh + 40));
      const x = ((i * 173 + U.t * 2400) % (W + 400)) - 400;
      ctx.fillRect(x, y, 260, 2);
    }
    // hai vệt kính phi công
    for (const [i, col] of [[0, '#7ff6ff'], [1, '#ffb347']]) {
      ctx.save();
      ctx.shadowColor = col;
      ctx.shadowBlur = 24;
      ctx.fillStyle = col;
      rr(70, by + 22 + i * 44, 170, 16, 8);
      ctx.fill();
      ctx.restore();
      text(i ? 'P2' : 'P1', 256, by + 36 + i * 44, { size: 13, weight: 900, color: col });
    }
    ctx.restore();
    ctx.strokeStyle = acc;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, by + 26);
    ctx.lineTo(W, by - 26);
    ctx.moveTo(0, by + bh + 26);
    ctx.lineTo(W, by + bh - 26);
    ctx.stroke();
    text('ĐỒNG BỘ THẦN KINH 100%  ·  P1 + P2', 320, by + 38, { size: 14, weight: 900, color: '#cfe0f0' });
    text(T.def.ultName + '!', 316, by + 96, { size: 58, weight: 900, color: '#ffffff', glow, blur: 26 });
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
    drawModeBadge();

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
      panel(W - 400, 16, 380, 104);
      text(`${def.cat} · ABYSSAL`, W - 384, 38, { size: 12, color: '#c8909a' });
      text(def.name, W - 384, 60, { size: 20, color: def.glow, glow: def.glow, blur: 8 });
      if (K.phase2 && !K.dying) text('CUỒNG NỘ', W - 36, 60, { size: 13, align: 'right', color: '#ff5a5a', alpha: 0.6 + 0.4 * Math.sin(game.t * 10) });
      const khp = Math.max(0, K.hp);
      bar(W - 384, 72, 348, 12, khp / K.maxHp, '#ff5e7a', K.ghost / K.maxHp);
      // vạch 50%: dưới mốc này quái vào trạng thái cuồng nộ
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(W - 384 + 348 * 0.5 - 1, 69, 2, 18);
      text(`${Math.round((khp / K.maxHp) * 100)}%`, W - 384, 104, { size: 11, color: '#c8909a' });
      text(`${Math.ceil(khp)} / ${K.maxHp}`, W - 36, 104, { size: 13, align: 'right', color: '#ffd0d8' });
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
    text(`THÀNH PHỐ · ${game.kdef.district.toUpperCase()}`, cx - 214, H - 42, { size: 12, color: '#7f9bb8' });
    text(Math.round(integ * 100) + '%', cx + 214, H - 42, { size: 12, align: 'right', color: integ < 0.55 ? '#ff6b5e' : '#cfe0f0' });
    bar(cx - 214, H - 34, 428, 9, integ, integ < 0.55 ? '#ff6b5e' : '#ffd36b');
    const mark = cx - 214 + 428 * LOSE_CITY;
    ctx.fillStyle = '#ff3b3b';
    ctx.fillRect(mark - 1, H - 38, 2, 17);

    text('H hướng dẫn · ESC / P tạm dừng, cài đặt & thoát · M tắt tiếng' + (sfx.muted ? ' (đang tắt)' : ''), 20, H - 18, { size: 12, color: 'rgba(200,220,240,0.5)', weight: 600 });
    if (game.state === 'fight') {
      // nút tạm dừng bấm bằng chuột
      const px = W - 64;
      const py = H - 62;
      panel(px, py, 44, 44, 'rgba(120,190,255,0.35)');
      ctx.fillStyle = '#cfe0f0';
      rr(px + 14, py + 12, 6, 20, 2);
      ctx.fill();
      rr(px + 25, py + 12, 6, 20, 2);
      ctx.fill();
      text('ESC', px + 22, py + 58, { size: 9, align: 'center', color: 'rgba(200,220,240,0.5)' });
      zone(px, py, 44, 44, openPause);
    }

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

    if (game.bannerT > 0 && K && !game.ultFx) {
      const a = clamp(game.bannerT, 0, 1) * clamp((4 - game.bannerT) * 3, 0, 1);
      text(`${K.def.cat} — ${K.def.name}`, cx, GROUND - 380, { size: 44, align: 'center', color: K.def.glow, glow: K.def.glow, alpha: a });
      text(`ĐANG ĐỔ BỘ VÀO ${game.kdef.district.toUpperCase()}`, cx, GROUND - 345, { size: 18, align: 'center', color: '#e8f1ff', alpha: a });
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
      'ĐỒNG BỘ: hai phi công ra đòn gần như cùng lúc → sát thương ×2; đánh trúng quái thì Link +12.',
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

  // ---------- Menu chính: logo, danh sách chế độ bên trái, chi tiết bên phải, bản tin chạy chữ ----------
  const TICKER_ITEMS = [
    'BẢN TIN KHẨN: khe nứt Thái Bình Dương mở rộng thêm 40 m trong đêm qua',
    'Bộ Phòng vệ Duyên hải nâng mức cảnh báo lên CẤP ĐỎ',
    'Cảng Hải Đăng sơ tán 120.000 dân',
    'Titan-Frame VANGUARD và TEMPEST sẵn sàng xuất kích',
    'Phi công nhắc nhau: đồng bộ F + J để nhân đôi sát thương',
    'Đòn lao húc màu đỏ không đỡ được — hãy lướt né',
  ];
  const TICKER = TICKER_ITEMS.join('     ◆     ');
  // Tiêu đề ngắn cho dải chữ trên TV, đổi theo từng câu phát thanh viên đọc.
  const TV_HEADLINES = ['KHE NỨT MỞ RỘNG THÊM 40 M', 'CẢNH BÁO CẤP ĐỎ TOÀN BỜ BIỂN', 'SƠ TÁN 120.000 DÂN CẢNG HẢI ĐĂNG', 'HAI TITAN SẴN SÀNG XUẤT KÍCH'];

  // TV bản tin trên menu chính: nữ phát thanh viên trong trường quay, ảnh trực tiếp từ khe nứt.
  // Vẽ trong hệ tọa độ 320×180 rồi thu theo kích thước khung.
  function drawNewsTV(x, y, w) {
    const sc = w / 320;
    const h = 180 * sc;
    const t = game.t;
    const seg = 5.5; // mỗi câu tin
    const idx = Math.floor(t / seg) % TV_HEADLINES.length;
    const phase = t % seg;
    const talking = phase > 0.4 && phase < seg - 0.7;

    // vỏ TV
    ctx.save();
    ctx.shadowColor = 'rgba(79,240,255,0.35)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#0c1118';
    rr(x - 8, y - 8, w + 16, h + 16, 8);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(160,190,220,0.25)';
    ctx.lineWidth = 1;
    rr(x - 8, y - 8, w + 16, h + 16, 8);
    ctx.stroke();
    ctx.fillStyle = Math.sin(t * 2) > 0 ? '#5dffb0' : '#2a6b50';
    ellipse(x + w - 4, y + h + 4, 1.6, 1.6);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.translate(x, y);
    ctx.scale(sc, sc);

    // trường quay
    const bg = ctx.createLinearGradient(0, 0, 0, 180);
    bg.addColorStop(0, '#123a63');
    bg.addColorStop(1, '#061527');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 320, 180);
    ctx.strokeStyle = 'rgba(127,246,255,0.08)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= 320; gx += 20) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, 140);
      ctx.stroke();
    }
    // quầng sáng sau lưng
    const halo = ctx.createRadialGradient(118, 80, 5, 118, 80, 90);
    halo.addColorStop(0, 'rgba(120,200,255,0.35)');
    halo.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, 320, 180);

    // màn hình phụ: ảnh trực tiếp khe nứt + bóng quái vật
    const ix = 198;
    const iy = 26;
    const iw = 106;
    const ih = 64;
    ctx.fillStyle = '#05080e';
    ctx.fillRect(ix - 3, iy - 3, iw + 6, ih + 6);
    const sea = ctx.createLinearGradient(0, iy, 0, iy + ih);
    sea.addColorStop(0, '#3a1420');
    sea.addColorStop(0.6, '#1b0d18');
    sea.addColorStop(1, '#0a1a2a');
    ctx.fillStyle = sea;
    ctx.fillRect(ix, iy, iw, ih);
    const kx = ix + 62 + Math.sin(t * 0.6) * 4;
    const ky = iy + ih - 12;
    ctx.fillStyle = '#05060a';
    ctx.beginPath();
    ctx.moveTo(kx - 30, ky + 12);
    ctx.lineTo(kx - 22, ky - 14);
    ctx.lineTo(kx - 14, ky - 26);
    ctx.lineTo(kx - 6, ky - 22);
    ctx.lineTo(kx - 2, ky - 34);
    ctx.lineTo(kx + 4, ky - 24);
    ctx.lineTo(kx + 12, ky - 30);
    ctx.lineTo(kx + 14, ky - 18);
    ctx.lineTo(kx + 26, ky - 8);
    ctx.lineTo(kx + 32, ky + 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = Math.sin(t * 3) > -0.6 ? '#ff5050' : '#5a1818';
    ellipse(kx - 15, ky - 19, 1.8, 1.2);
    ctx.fill();
    ctx.fillStyle = 'rgba(40,90,130,0.85)';
    ctx.fillRect(ix, ky + 6, iw, ih - (ky + 6 - iy));
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let ny = iy; ny < iy + ih; ny += 3) ctx.fillRect(ix, ny, iw, 1);
    ctx.fillStyle = '#c62828';
    ctx.fillRect(ix, iy, 46, 11);
    text('TRỰC TIẾP', ix + 23, iy + 8.5, { size: 7.5, weight: 900, align: 'center', color: '#ffffff' });
    text('KHE NỨT · THÁI BÌNH DƯƠNG', ix + iw / 2, iy + ih + 12, { size: 7, weight: 700, align: 'center', color: '#9fc1e0' });

    // ---- phát thanh viên đứng dẫn: vest công sở ôm eo, váy bút chì, giày cao gót ----
    const cx = 116;
    const nod = talking ? Math.sin(t * 2.6) * 1.2 : 0;
    const hip = 2 + Math.sin(t * 0.9) * 0.6; // dồn trọng tâm sang một bên hông
    const skin = '#f3cdb0';
    const skinSh = '#dfa98a';
    const hair = '#2b1712';
    const hairHi = '#5a3326';
    const suit = '#b3102a';
    const suitSh = '#7c0a1d';
    const suitHi = '#e2344c';
    const skirt = '#1b1d28';
    const skirtHi = '#3a3e52';
    // sàn trường quay
    const floor = ctx.createLinearGradient(0, 140, 0, 180);
    floor.addColorStop(0, '#0d2540');
    floor.addColorStop(1, '#040d18');
    ctx.fillStyle = floor;
    ctx.fillRect(0, 142, 320, 38);
    ctx.fillStyle = 'rgba(79,240,255,0.5)';
    ctx.fillRect(0, 142, 320, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ellipse(cx + 1, 147.5, 16, 2.4);
    ctx.fill();

    // tóc dài phía sau lưng
    ctx.save();
    ctx.translate(cx + hip * 0.3, 21 + nod * 0.4);
    ctx.scale(0.42, 0.42);
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.moveTo(-20, -14);
    ctx.bezierCurveTo(-40, 14, -26, 44, -36, 72);
    ctx.quadraticCurveTo(-20, 80, -8, 70);
    ctx.lineTo(8, 70);
    ctx.quadraticCurveTo(20, 80, 36, 72);
    ctx.bezierCurveTo(26, 44, 40, 14, 20, -14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // chân + giày cao gót đỏ
    const leg = (hx, kx, ax, fd) => {
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.moveTo(hx - 4.2, 80);
      ctx.quadraticCurveTo(kx - 4, 96, kx - 2.4, 108);
      ctx.quadraticCurveTo(kx - 3.6, 122, ax - 1.4, 139);
      ctx.lineTo(ax + 1.4, 139);
      ctx.quadraticCurveTo(kx + 3.2, 120, kx + 2.4, 108);
      ctx.quadraticCurveTo(kx + 4, 94, hx + 4.2, 80);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#c8102e';
      ctx.beginPath();
      ctx.moveTo(ax - 1.8, 138.5);
      ctx.lineTo(ax + 2, 138.5);
      ctx.quadraticCurveTo(ax + 4 * fd, 143, ax + 6.5 * fd, 146.5);
      ctx.lineTo(ax - 1.5 * fd, 146.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#8a0a1e';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax - 1.4 * fd, 141);
      ctx.lineTo(ax - 1.6 * fd, 147);
      ctx.stroke();
    };
    leg(cx - 5 + hip, cx - 3, cx - 2, -1);
    leg(cx + 5 + hip, cx + 3.5, cx + 3, 1);

    // váy bút chì ôm hông, dài tới gối
    ctx.fillStyle = skirt;
    ctx.beginPath();
    ctx.moveTo(cx - 7.5, 61);
    ctx.bezierCurveTo(cx - 12 + hip, 66, cx - 15 + hip, 72, cx - 13.5 + hip, 80);
    ctx.quadraticCurveTo(cx - 11.5, 94, cx - 9.5, 104);
    ctx.lineTo(cx + 9.5, 104);
    ctx.quadraticCurveTo(cx + 12.5, 94, cx + 14.5 + hip, 80);
    ctx.bezierCurveTo(cx + 16 + hip, 72, cx + 12 + hip, 66, cx + 7.5, 61);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = skirtHi;
    ctx.lineWidth = 1;
    ctx.beginPath(); // ánh sáng trên đường cong hông
    ctx.moveTo(cx + 11 + hip, 69);
    ctx.quadraticCurveTo(cx + 14.5 + hip, 76, cx + 12.5 + hip, 88);
    ctx.moveTo(cx - 2, 90);
    ctx.lineTo(cx - 1, 104);
    ctx.stroke();

    // tay trái chống hông (vẽ trước thân)
    ctx.strokeStyle = suitSh;
    ctx.lineCap = 'round';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx - 12, 39);
    ctx.quadraticCurveTo(cx - 23, 48, cx - 21, 56);
    ctx.lineTo(cx - 12.5 + hip, 66);
    ctx.stroke();
    ctx.fillStyle = skin;
    ellipse(cx - 12 + hip, 66.5, 2.6, 2.2);
    ctx.fill();

    // cổ
    ctx.fillStyle = skin;
    ctx.fillRect(cx - 2.4 + hip * 0.3, 28, 4.8, 10);

    // áo vest ôm: vai, ngực đầy, eo thắt, vạt peplum ôm hông
    ctx.fillStyle = suit;
    ctx.beginPath();
    ctx.moveTo(cx - 13.5, 37.5);
    ctx.quadraticCurveTo(cx - 6, 34.5, cx - 3.2, 35.5);
    ctx.lineTo(cx + 3.2, 35.5);
    ctx.quadraticCurveTo(cx + 6, 34.5, cx + 13.5, 37.5);
    ctx.bezierCurveTo(cx + 15, 44, cx + 14, 50, cx + 11, 53);
    ctx.quadraticCurveTo(cx + 7, 57, cx + 7.5, 61);
    ctx.quadraticCurveTo(cx + 11 + hip, 64, cx + 12.5 + hip, 70);
    ctx.lineTo(cx - 11.5 + hip, 70);
    ctx.quadraticCurveTo(cx - 10 + hip, 64, cx - 7.5, 61);
    ctx.quadraticCurveTo(cx - 7, 57, cx - 11, 53);
    ctx.bezierCurveTo(cx - 14, 50, cx - 15, 44, cx - 13.5, 37.5);
    ctx.closePath();
    ctx.fill();
    // cổ áo sơ mi trắng chữ V
    ctx.fillStyle = '#f4f4f6';
    ctx.beginPath();
    ctx.moveTo(cx - 3.6, 35.5);
    ctx.lineTo(cx + 3.6, 35.5);
    ctx.lineTo(cx, 50);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(cx - 2.2, 35.5);
    ctx.lineTo(cx + 2.2, 35.5);
    ctx.lineTo(cx, 44);
    ctx.closePath();
    ctx.fill();
    // ve áo + khối ngực + đường may eo
    ctx.fillStyle = suitSh;
    ctx.beginPath();
    ctx.moveTo(cx - 3.6, 35.5);
    ctx.lineTo(cx - 7, 37);
    ctx.lineTo(cx - 4.5, 43);
    ctx.lineTo(cx - 6.5, 44);
    ctx.lineTo(cx, 54);
    ctx.closePath();
    ctx.moveTo(cx + 3.6, 35.5);
    ctx.lineTo(cx + 7, 37);
    ctx.lineTo(cx + 4.5, 43);
    ctx.lineTo(cx + 6.5, 44);
    ctx.lineTo(cx, 54);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = suitSh;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(cx - 12.5, 49);
    ctx.quadraticCurveTo(cx - 8, 53, cx - 3, 50.5);
    ctx.moveTo(cx + 12.5, 49);
    ctx.quadraticCurveTo(cx + 8, 53, cx + 3, 50.5);
    ctx.moveTo(cx - 8, 55);
    ctx.quadraticCurveTo(cx - 6, 61, cx - 9 + hip, 68);
    ctx.moveTo(cx + 8, 55);
    ctx.quadraticCurveTo(cx + 6, 61, cx + 9 + hip, 68);
    ctx.stroke();
    ctx.strokeStyle = suitHi;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(cx - 11.5, 42);
    ctx.quadraticCurveTo(cx - 9, 45, cx - 6, 46);
    ctx.moveTo(cx + 11.5, 42);
    ctx.quadraticCurveTo(cx + 9, 45, cx + 6, 46);
    ctx.stroke();
    ctx.fillStyle = '#ffd36b';
    ellipse(cx + 0.3, 59, 1.1, 1.1);
    ctx.fill();
    // micro cài ve áo
    ctx.fillStyle = '#111';
    ellipse(cx - 5.5, 41, 0.9, 0.9);
    ctx.fill();

    // tay phải chỉ sang màn hình trực tiếp khi đọc tin
    const g = talking ? 0.5 + 0.5 * Math.sin(t * 1.6) : 0.15;
    const ex = cx + 21;
    const ey = 50 - g * 3;
    const hx = cx + 30 + g * 2;
    const hy = 44 - g * 8;
    ctx.strokeStyle = suit;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx + 12, 39);
    ctx.quadraticCurveTo(cx + 18, 43, ex, ey);
    ctx.lineTo(hx - 2, hy + 1);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = skin;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(-0.6 - g * 0.3);
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.2, 2, 0, 0, PI2);
    ctx.fill();
    ctx.fillRect(1.5, -1.6, 3, 1.1); // ngón tay chỉ
    ctx.restore();

    ctx.save();
    ctx.translate(cx + hip * 0.3, 21 + nod * 0.4);
    ctx.scale(0.42, 0.42);
    ctx.rotate(Math.sin(t * 1.1) * 0.035 - 0.03);
    // mặt trái xoan
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(-15.5, -6);
    ctx.quadraticCurveTo(-15, 13, 0, 20);
    ctx.quadraticCurveTo(15, 13, 15.5, -6);
    ctx.quadraticCurveTo(15.5, -22, 0, -22);
    ctx.quadraticCurveTo(-15.5, -22, -15.5, -6);
    ctx.fill();
    // bông tai dài
    ctx.strokeStyle = '#ffd36b';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-15.5, 4);
    ctx.lineTo(-15.5, 11);
    ctx.moveTo(15.5, 4);
    ctx.lineTo(15.5, 11);
    ctx.stroke();
    ctx.fillStyle = '#fff1b8';
    ellipse(-15.5, 12, 1.4, 1.8);
    ctx.fill();
    ellipse(15.5, 12, 1.4, 1.8);
    ctx.fill();
    // má hồng
    ctx.fillStyle = 'rgba(236,110,125,0.3)';
    ellipse(-9, 7, 4.2, 2.4);
    ctx.fill();
    ellipse(9, 7, 4.2, 2.4);
    ctx.fill();
    // mắt: phấn mắt khói, kẻ mắt xếch, mi dày, chớp mắt định kỳ
    const blink = (t % 3.7) < 0.12 ? 0.15 : 1;
    for (const [ex, dir] of [[-6.5, -1], [6.5, 1]]) {
      ctx.fillStyle = 'rgba(120,60,90,0.35)';
      ellipse(ex, -2.2, 4.6, 2.8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ellipse(ex, 0, 3.5, 2.4 * blink);
      ctx.fill();
      ctx.fillStyle = '#4a2a18';
      ellipse(ex + 0.3, 0.2, 2, 2.2 * blink);
      ctx.fill();
      if (blink > 0.5) {
        ctx.fillStyle = '#ffffff';
        ellipse(ex + 1, -0.7, 0.6, 0.6);
        ctx.fill();
      }
      ctx.strokeStyle = '#120806';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(ex - 3.8 * dir, -0.4 * blink);
      ctx.quadraticCurveTo(ex, -3.4 * blink, ex + 3.8 * dir, -0.6 * blink);
      ctx.lineTo(ex + 5.6 * dir, -2.6 * blink); // đuôi mắt xếch
      ctx.stroke();
    }
    // lông mày cong thanh
    ctx.strokeStyle = '#2e1a12';
    ctx.lineWidth = 1.1;
    for (const ex of [-6.5, 6.5]) {
      ctx.beginPath();
      ctx.moveTo(ex - 3.8, -6.2);
      ctx.quadraticCurveTo(ex + (ex < 0 ? 0.6 : -0.6), -9, ex + 3.8, -6.6);
      ctx.stroke();
    }
    // mũi
    ctx.strokeStyle = skinSh;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(0.5, 2);
    ctx.quadraticCurveTo(1.8, 7, -0.6, 8);
    ctx.stroke();
    // môi son đỏ: mấp máy khi đọc tin, mỉm cười khi nghỉ
    const open = talking ? Math.max(0, Math.sin(t * 15)) * (0.5 + 0.5 * Math.abs(Math.sin(t * 3.3))) : 0;
    ctx.fillStyle = '#d0112b';
    if (open > 0.08) {
      ctx.beginPath();
      ctx.ellipse(0, 12.8, 4.6, 1.5 + open * 2.4, 0, 0, PI2);
      ctx.fill();
      ctx.fillStyle = '#5a1018';
      ctx.beginPath();
      ctx.ellipse(0, 13, 3.1, 0.4 + open * 1.7, 0, 0, PI2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(-4.8, 12.2);
      ctx.quadraticCurveTo(-2, 10.6, 0, 11.6);
      ctx.quadraticCurveTo(2, 10.6, 4.8, 12.2);
      ctx.quadraticCurveTo(0, 16.4, -4.8, 12.2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ellipse(1.2, 13.8, 1.4, 0.5);
      ctx.fill();
    }
    // tóc mái rẽ ngôi lệch + lọn sóng ôm mặt
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.moveTo(-18, 8);
    ctx.quadraticCurveTo(-22, -25, 2, -26);
    ctx.quadraticCurveTo(21, -25, 18, 8);
    ctx.quadraticCurveTo(16, -10, 6, -16);
    ctx.quadraticCurveTo(-6, -4, -14, -8);
    ctx.quadraticCurveTo(-15, 0, -18, 8);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-17, -4);
    ctx.bezierCurveTo(-24, 12, -16, 22, -22, 40);
    ctx.lineTo(-15, 36);
    ctx.bezierCurveTo(-11, 22, -18, 10, -14, -2);
    ctx.closePath();
    ctx.moveTo(17, -4);
    ctx.bezierCurveTo(24, 12, 16, 22, 22, 40);
    ctx.lineTo(15, 36);
    ctx.bezierCurveTo(11, 22, 18, 10, 14, -2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = hairHi;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-11, -20);
    ctx.quadraticCurveTo(2, -24, 13, -17);
    ctx.moveTo(-20, 14);
    ctx.quadraticCurveTo(-17, 24, -20, 34);
    ctx.moveTo(20, 14);
    ctx.quadraticCurveTo(17, 24, 20, 34);
    ctx.stroke();
    ctx.restore();

    // dải chữ dưới màn hình (lower third)
    const lt = 152;
    ctx.fillStyle = '#c62828';
    ctx.fillRect(10, lt, 66, 16);
    text('TIN KHẨN', 43, lt + 11.5, { size: 9, weight: 900, align: 'center', color: '#ffffff' });
    ctx.fillStyle = 'rgba(244,247,250,0.95)';
    ctx.fillRect(76, lt, 234, 16);
    const slide = clamp(phase / 0.35, 0, 1);
    ctx.save();
    ctx.beginPath();
    ctx.rect(76, lt, 234, 16);
    ctx.clip();
    text(TV_HEADLINES[idx], 82 - (1 - easeOut(slide)) * 40, lt + 11.5, { size: 9, weight: 900, color: '#0b1a2c', alpha: slide });
    ctx.restore();
    ctx.fillStyle = 'rgba(6,16,30,0.9)';
    ctx.fillRect(10, lt + 16, 300, 11);
    text('BẢN TIN 2049 · MẠNG PHÒNG VỆ DUYÊN HẢI', 16, lt + 24.5, { size: 7, weight: 700, color: '#9fc1e0' });

    // nhãn TRỰC TIẾP + giờ
    ctx.fillStyle = 'rgba(6,16,30,0.75)';
    ctx.fillRect(8, 8, 64, 14);
    ctx.fillStyle = Math.sin(t * 5) > 0 ? '#ff3b3b' : '#6a1a1a';
    ellipse(16, 15, 3, 3);
    ctx.fill();
    text('TRỰC TIẾP', 23, 18.5, { size: 8, weight: 900, color: '#ffffff' });
    text('21:4' + (7 + (Math.floor(t / 60) % 3)), 312, 18.5, { size: 8, weight: 700, align: 'right', color: '#cfe0f0' });

    // hiệu ứng màn hình: vạch quét, lóa kính, nhấp nháy
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let sy = 0; sy < 180; sy += 3) ctx.fillRect(0, sy, 320, 1);
    const glare = ctx.createLinearGradient(0, 0, 320, 180);
    glare.addColorStop(0, 'rgba(255,255,255,0.10)');
    glare.addColorStop(0.35, 'rgba(255,255,255,0)');
    glare.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glare;
    ctx.fillRect(0, 0, 320, 180);
    const flick = 0.03 + 0.03 * Math.sin(t * 37);
    ctx.fillStyle = `rgba(160,220,255,${flick})`;
    ctx.fillRect(0, 0, 320, 180);
    ctx.restore();
  }

  function drawCorners(x, y, w, h, col, len = 18) {
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
      ctx.moveTo(cx, cy + sy * len);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + sx * len, cy);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawScanlines(alpha = 0.05) {
    ctx.fillStyle = `rgba(127,246,255,${alpha})`;
    for (let y = (game.t * 24) % 4; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  }

  function modeRecord(id) {
    if (id === 'rush') return records.rush ? `TỐT NHẤT: ${fmtTime(records.rush)}` : 'CHƯA CÓ KỶ LỤC';
    if (id === 'duel') return `ĐÃ THẮNG ${duelWins()}/${WAVES.length * DIFFS.length}`;
    if (id === 'training') return `${TITANS.length} TITAN · ${TRAIN_MOVES.length} CHIÊU THỨC`;
    if (id === 'settings') return audioCfg.muted ? 'ĐANG TẮT TIẾNG' : `NHẠC ${Math.round(audioCfg.music * 100)}% · HIỆU ỨNG ${Math.round(audioCfg.sfx * 100)}%`;
    return `${WAVES.length} QUÁI VẬT · ${UPGRADES.length} NÂNG CẤP`;
  }

  function drawLogo(x, y, size) {
    const pulse = 0.75 + 0.25 * Math.sin(game.t * 2);
    text('TIDEBREAKER', x + 3, y + 3, { size, weight: 900, color: 'rgba(0,0,0,0.6)' });
    text('TIDEBREAKER', x, y, { size, weight: 900, color: '#e8fbff', glow: '#4ff0ff', blur: 26 * pulse });
    // vạch sáng quét ngang dưới logo
    ctx.save();
    ctx.font = `900 ${size}px ${FONT}`;
    const lw = ctx.measureText('TIDEBREAKER').width;
    ctx.restore();
    const ly = y + size * 0.2;
    ctx.fillStyle = 'rgba(79,240,255,0.25)';
    ctx.fillRect(x, ly, lw, 2);
    const sweep = ((game.t * 0.45) % 1.4) - 0.2;
    const g = ctx.createLinearGradient(x + lw * (sweep - 0.15), 0, x + lw * (sweep + 0.15), 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, ly - 1, lw, 4);
    return lw;
  }

  function drawTitle() {
    const shade = ctx.createLinearGradient(0, 0, W, 0);
    shade.addColorStop(0, 'rgba(2,6,12,0.9)');
    shade.addColorStop(0.5, 'rgba(2,6,12,0.62)');
    shade.addColorStop(1, 'rgba(2,6,12,0.35)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, H);
    drawScanlines(0.035);

    // thanh trạng thái trên cùng
    const blink = Math.sin(game.t * 5) > 0;
    ctx.fillStyle = blink ? '#ff3b3b' : 'rgba(255,59,59,0.35)';
    ellipse(70, 38, 6, 6);
    ctx.fill();
    text('CẢNH BÁO KHE NỨT · CẤP ĐỘ ĐỎ', 86, 43, { size: 12, color: '#ff8a7a' });
    text('MẠNG PHÒNG VỆ DUYÊN HẢI · 2049', 900, 43, { size: 12, align: 'right', color: '#7f9bb8' });
    ctx.fillStyle = 'rgba(120,190,255,0.18)';
    ctx.fillRect(64, 58, 836, 1);
    drawNewsTV(W - 64 - 286, 26, 286);

    drawLogo(60, 138, 84);
    text('EYERIM  ·  HAI PHI CÔNG  ·  MỘT CỖ MÁY  ·  MỘT THÀNH PHỐ', 64, 186, { size: 14, color: '#7ff6ff' });

    // danh sách chế độ
    const mx = 64;
    const my = 216;
    const mw = 470;
    const mh = 64;
    const gap = 10;
    const sel = MENU[game.menu];
    const hy = my + game.menuY * (mh + gap);
    ctx.save();
    ctx.shadowColor = sel.color;
    ctx.shadowBlur = 22;
    ctx.fillStyle = 'rgba(10,26,44,0.92)';
    rr(mx, hy, mw, mh, 8);
    ctx.fill();
    ctx.restore();
    MENU.forEach((m, i) => {
      const y = my + i * (mh + gap);
      const on = i === game.menu;
      if (!on) panel(mx, y, mw, mh, 'rgba(120,190,255,0.16)');
      text(String(i + 1).padStart(2, '0'), mx + 22, y + 29, { size: 14, color: on ? m.color : '#4d6580' });
      text(m.name, mx + 66, y + 29, { size: 21, weight: 900, color: on ? '#ffffff' : '#a9bdd2', glow: on ? m.color : null, blur: 10 });
      text(m.tag, mx + 66, y + 50, { size: 12, weight: 500, color: on ? '#cfe0f0' : '#6f87a0' });
      if (!game.showHelp) zone(mx, y, mw, mh, () => { setMenu(i); chooseMenu(); }, () => setMenu(i));
    });
    ctx.fillStyle = sel.color;
    rr(mx, hy, 5, mh, 2);
    ctx.fill();
    ctx.strokeStyle = sel.color;
    ctx.lineWidth = 1.5;
    rr(mx, hy, mw, mh, 8);
    ctx.stroke();
    text('▶', mx + mw - 28, hy + mh / 2 + 7, { size: 18, align: 'center', color: sel.color, alpha: 0.6 + 0.4 * Math.sin(game.t * 6) });

    // khung chi tiết chế độ (trượt vào khi đổi lựa chọn)
    const k = easeOut(clamp(game.menuT / 0.28, 0, 1));
    const dx = 572 + (1 - k) * 36;
    const dy = my;
    const dw = 644;
    const dh = MENU.length * mh + (MENU.length - 1) * gap;
    ctx.save();
    ctx.globalAlpha = k;
    panel(dx, dy, dw, dh, 'rgba(120,190,255,0.2)');
    drawCorners(dx - 4, dy - 4, dw + 8, dh + 8, sel.color);
    text(sel.id === 'settings' ? 'ÂM THANH' : sel.id === 'training' ? 'XƯỞNG CHUYỂN ĐỘNG' : `CHẾ ĐỘ ${String(game.menu + 1).padStart(2, '0')}`, dx + 32, dy + 38, { size: 12, color: sel.color });
    text(sel.name, dx + 32, dy + 76, { size: 34, weight: 900, color: '#ffffff', glow: sel.color, blur: 14 });
    wrapText(sel.desc, dx + 32, dy + 108, dw - 64, 22, { size: 15, weight: 500, color: '#cfe0f0' });
    ctx.fillStyle = 'rgba(120,190,255,0.18)';
    ctx.fillRect(dx + 32, dy + 162, dw - 64, 1);
    text(sel.id === 'settings' ? 'MẸO' : sel.id === 'training' ? 'NỘI DUNG' : 'LUẬT CHƠI', dx + 32, dy + 190, { size: 12, color: '#7f9bb8' });
    sel.rules.forEach((r, i) => {
      const ry = dy + 218 + i * 28;
      ctx.save();
      ctx.translate(dx + 38, ry - 5);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = sel.color;
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
      text(r, dx + 56, ry, { size: 15, weight: 600, color: '#e8f1ff' });
    });
    // kỷ lục + nút bắt đầu
    const by = dy + dh - 62;
    text(modeRecord(sel.id), dx + 32, by + 36, { size: 15, color: '#ffd36b' });
    const bw = 220;
    const bx = dx + dw - bw - 28;
    const glow = 0.6 + 0.4 * Math.sin(game.t * 4);
    ctx.save();
    ctx.shadowColor = sel.color;
    ctx.shadowBlur = 18 * glow;
    ctx.fillStyle = sel.color;
    rr(bx, by + 8, bw, 44, 6);
    ctx.fill();
    ctx.restore();
    text(sel.id === 'settings' ? 'ENTER  ·  MỞ CÀI ĐẶT' : sel.id === 'training' ? 'ENTER  ·  VÀO XEM' : 'ENTER  ·  BẮT ĐẦU', bx + bw / 2, by + 36, { size: 16, weight: 900, align: 'center', color: '#03101a' });
    ctx.restore();
    if (!game.showHelp) zone(bx, by + 8, bw, 44, chooseMenu);

    // gợi ý phím + nhạc
    text('W / S hoặc ↑ / ↓ chọn  ·  1–5 chọn nhanh  ·  ENTER / chuột xác nhận  ·  H hướng dẫn  ·  M tắt tiếng' + (sfx.muted ? ' (đang tắt)' : ''), 64, 600, { size: 13, weight: 600, color: '#9fc1e0' });
    text(userTrack.ok ? `♪ Đang phát nhạc của bạn${userTrack.name ? ': ' + userTrack.name : ' (music/)'}` : '♪ Kéo thả file nhạc vào cửa sổ, hoặc đặt vào music/theme.mp3', W - 64, 600, { size: 12, align: 'right', weight: 500, color: '#7f9bb8' });
    text('Chơi một mình: tay trái A S D W F, tay phải J K L', 64, 622, { size: 12, weight: 500, color: '#6f87a0' });

    // bản tin chạy chữ
    const ty = H - 64;
    ctx.fillStyle = 'rgba(4,10,20,0.88)';
    ctx.fillRect(0, ty, W, 34);
    ctx.fillStyle = 'rgba(255,59,59,0.5)';
    ctx.fillRect(0, ty, W, 1);
    ctx.fillStyle = '#c62828';
    ctx.fillRect(0, ty, 150, 34);
    text('TIN KHẨN', 75, ty + 22, { size: 13, weight: 900, align: 'center', color: '#ffffff' });
    ctx.save();
    ctx.beginPath();
    ctx.rect(150, ty, W - 150, 34);
    ctx.clip();
    ctx.font = `600 14px ${FONT}`;
    const tw = ctx.measureText(TICKER + '     ◆     ').width;
    const off = (game.t * 70) % tw;
    for (let x = 170 - off; x < W; x += tw) text(TICKER + '     ◆     ', x, ty + 22, { size: 14, weight: 600, color: '#ffd0c8' });
    ctx.restore();

    if (game.showHelp) {
      dim(0.6);
      drawHelp(1, 230);
      text('H / ESC — đóng', W / 2, 510, { size: 14, align: 'center', color: '#9fc1e0' });
    }
  }

  // Menu tạm dừng: tiếp tục, cài đặt, hướng dẫn, chơi lại, thoát (thoát/chơi lại cần bấm 2 lần).
  function drawPause() {
    dim(0.62);
    const items = pauseItems();
    const pw = 460;
    const ih = 52;
    const ph = 130 + items.length * (ih + 8) + 40;
    const px = W / 2 - pw / 2;
    const py = H / 2 - ph / 2;
    const m = modeDef();
    panel(px, py, pw, ph, 'rgba(120,190,255,0.3)');
    drawCorners(px - 4, py - 4, pw + 8, ph + 8, m.color);
    text('TẠM DỪNG', W / 2, py + 54, { size: 40, weight: 900, align: 'center', color: '#ffffff', glow: '#4ff0ff', blur: 16 });
    const where = game.kdef ? ` · ${game.kdef.name}` : '';
    text(m.name + where, W / 2, py + 84, { size: 13, align: 'center', color: m.color });
    items.forEach((it, i) => {
      const y = py + 110 + i * (ih + 8);
      const on = i === game.pauseIdx;
      const danger = it.id === 'quit' || it.id === 'restart';
      const confirm = game.pauseConfirm === it.id;
      const col = confirm ? '#ff5e4d' : danger ? '#ff9b7a' : '#4ff0ff';
      if (on) {
        ctx.save();
        ctx.shadowColor = col;
        ctx.shadowBlur = 16;
        ctx.fillStyle = confirm ? 'rgba(90,16,12,0.95)' : 'rgba(12,30,50,0.95)';
        rr(px + 30, y, pw - 60, ih, 6);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        rr(px + 30, y, pw - 60, ih, 6);
        ctx.stroke();
        ctx.fillStyle = col;
        rr(px + 30, y, 4, ih, 2);
        ctx.fill();
      } else panel(px + 30, y, pw - 60, ih, 'rgba(120,190,255,0.14)');
      const label = confirm ? (it.id === 'quit' ? 'BẤM LẦN NỮA ĐỂ THOÁT' : 'BẤM LẦN NỮA ĐỂ CHƠI LẠI') : it.name;
      text(label, W / 2, y + 33, { size: 17, weight: 800, align: 'center', color: on ? '#ffffff' : danger ? '#ff9b7a' : '#cfe0f0' });
      if (!game.showHelp && !game.settingsOpen) {
        zone(px + 30, y, pw - 60, ih, () => {
          if (game.pauseIdx !== i) game.pauseConfirm = null;
          game.pauseIdx = i;
          choosePause(it.id);
        }, () => {
          if (game.pauseIdx === i) return;
          game.pauseIdx = i;
          game.pauseConfirm = null;
        });
      }
    });
    const note = game.pauseConfirm ? 'Tiến độ đợt đang chơi sẽ mất. Di chuyển sang mục khác để hủy.' : 'W / S chọn  ·  ENTER xác nhận  ·  ESC tiếp tục';
    text(note, W / 2, py + ph - 22, { size: 13, align: 'center', weight: 600, color: game.pauseConfirm ? '#ff9b7a' : '#9fc1e0' });
    if (game.showHelp) {
      dim(0.5);
      drawHelp(1, H / 2 - 140);
      text('ENTER / ESC — đóng', W / 2, H / 2 + 140, { size: 14, align: 'center', color: '#9fc1e0' });
    }
  }

  // Bảng cài đặt âm thanh (mở từ menu chính hoặc menu tạm dừng).
  function drawSettings() {
    dim(0.6);
    const pw = 620;
    const ph = 400;
    const px = W / 2 - pw / 2;
    const py = H / 2 - ph / 2;
    panel(px, py, pw, ph, 'rgba(185,200,255,0.4)');
    drawCorners(px - 4, py - 4, pw + 8, ph + 8, '#b9c8ff');
    text('CÀI ĐẶT ÂM THANH', W / 2, py + 52, { size: 30, weight: 900, align: 'center', color: '#ffffff', glow: '#b9c8ff', blur: 14 });
    const rows = [
      { id: 'music', label: 'NHẠC NỀN', sub: userTrack.ok ? 'Đang phát nhạc của bạn' + (userTrack.name ? ': ' + userTrack.name : '') : 'Nhạc rock giao hưởng tổng hợp' },
      { id: 'sfx', label: 'HIỆU ỨNG', sub: 'Đòn đánh, va chạm, tiếng gầm, giao diện' },
      { id: 'muted', label: 'TẮT TIẾNG', sub: 'Phím M dùng được mọi lúc' },
      { id: 'close', label: 'XONG', sub: '' },
    ];
    rows.forEach((r, i) => {
      const y = py + 84 + i * 70;
      const on = i === game.settingsRow;
      const rx = px + 30;
      const rw = pw - 60;
      if (on) {
        ctx.fillStyle = 'rgba(30,44,80,0.9)';
        rr(rx, y, rw, 58, 6);
        ctx.fill();
        ctx.strokeStyle = '#b9c8ff';
        ctx.lineWidth = 1.5;
        rr(rx, y, rw, 58, 6);
        ctx.stroke();
      }
      if (r.id === 'close') {
        text('XONG', W / 2, y + 36, { size: 18, weight: 900, align: 'center', color: on ? '#ffffff' : '#cfe0f0' });
        zone(rx, y, rw, 58, () => { game.settingsRow = i; settingsAction(i); }, () => { game.settingsRow = i; });
        return;
      }
      text(r.label, rx + 20, y + 27, { size: 16, weight: 800, color: on ? '#ffffff' : '#cfe0f0' });
      text(r.sub, rx + 20, y + 46, { size: 11, weight: 500, color: '#7f9bb8' });
      if (r.id === 'muted') {
        const sw = 86;
        const sx = rx + rw - sw - 20;
        const onOff = audioCfg.muted;
        ctx.fillStyle = onOff ? '#ff5e4d' : 'rgba(255,255,255,0.12)';
        rr(sx, y + 15, sw, 28, 14);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ellipse(onOff ? sx + sw - 14 : sx + 14, y + 29, 10, 10);
        ctx.fill();
        text(onOff ? 'BẬT' : 'TẮT', onOff ? sx + 30 : sx + sw - 30, y + 34, { size: 12, weight: 900, align: 'center', color: onOff ? '#ffffff' : '#9fc1e0' });
        zone(rx, y, rw, 58, () => { game.settingsRow = i; settingsAction(i); }, () => { game.settingsRow = i; });
        return;
      }
      // thanh 10 nấc
      const v = audioCfg[r.id];
      const bx = rx + 250;
      const bw = rw - 250 - 80;
      const seg = bw / 10;
      for (let k = 0; k < 10; k++) {
        ctx.fillStyle = k < Math.round(v * 10) ? (audioCfg.muted ? '#6f7d99' : '#b9c8ff') : 'rgba(255,255,255,0.1)';
        rr(bx + k * seg + 2, y + 20, seg - 4, 18, 3);
        ctx.fill();
      }
      text(Math.round(v * 100) + '%', rx + rw - 20, y + 35, { size: 16, weight: 800, align: 'right', color: on ? '#ffffff' : '#cfe0f0' });
      if (on) {
        text('◀', bx - 18, y + 35, { size: 13, align: 'center', color: '#b9c8ff' });
        text('▶', bx + bw + 14, y + 35, { size: 13, align: 'center', color: '#b9c8ff' });
      }
      zone(rx, y, rw, 58, (pt) => {
        game.settingsRow = i;
        if (pt.x >= bx - 10 && pt.x <= bx + bw + 10) setVolume(r.id, Math.ceil(clamp((pt.x - bx) / bw, 0, 1) * 10) / 10);
      }, () => { game.settingsRow = i; });
    });
    text('W / S chọn  ·  A / D chỉnh mức  ·  ENTER bật/tắt  ·  ESC đóng', W / 2, py + ph - 20, { size: 13, align: 'center', weight: 600, color: '#9fc1e0' });
  }

  // ---------- Phim xuất kích: vẽ ----------
  // Phi công trong hệ đơn vị riêng: chân ở y = 0, đỉnh đầu ở y ≈ -178. k = tiến độ lắp giáp 0..1.
  function drawPilot(x, gy, s, k, o) {
    const up = o.armsUp || 0;
    const SUIT = '#141a24';
    const SUIT2 = '#262f3e';
    const PLATE = '#dfe5ea';
    const PLATE_SH = '#9aa7b3';
    const acc = o.accent;
    const piece = (st) => clamp((k - st) / 0.12, 0, 1);
    const drop = (p) => (1 - easeOut(p)) * -150;
    const J = (sg) => ({
      sh: [17 * sg, -145],
      el: [lerp(22, 34, up) * sg, lerp(-118, -166, up)],
      ha: [lerp(21, 22, up) * sg, lerp(-92, -198, up)],
      hip: [8 * sg, -96],
      kn: [9 * sg, -50],
      ft: [10 * sg, -4],
    });
    const L = J(-1);
    const R = J(1);
    const limb = (pts, w, col) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    };
    const withPiece = (st, fn) => {
      const p = piece(st);
      if (p <= 0) return;
      ctx.save();
      ctx.globalAlpha *= Math.min(1, p * 1.6);
      ctx.translate(0, drop(p));
      fn();
      ctx.restore();
    };
    ctx.save();
    ctx.translate(x, gy);
    ctx.scale(s, s);
    // bộ đồ lót thần kinh
    limb([L.hip, L.kn, L.ft], 11, SUIT);
    limb([R.hip, R.kn, R.ft], 11, SUIT);
    ctx.fillStyle = SUIT;
    ctx.beginPath();
    ctx.moveTo(-19, -148);
    ctx.lineTo(19, -148);
    ctx.lineTo(13, -94);
    ctx.lineTo(-13, -94);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-4, -158, 8, 12);
    limb([L.sh, L.el, L.ha], 9, SUIT);
    limb([R.sh, R.el, R.ha], 9, SUIT);
    // đường mạch thần kinh trên bộ đồ
    ctx.strokeStyle = acc;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -146);
    ctx.lineTo(0, -98);
    ctx.moveTo(-6, -50);
    ctx.lineTo(-9, -10);
    ctx.moveTo(6, -50);
    ctx.lineTo(9, -10);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // đầu + tóc (trước khi mũ hạ xuống)
    if (piece(0.82) < 1) {
      ctx.fillStyle = '#e9c2a0';
      ellipse(0, -164, 10, 11.5);
      ctx.fill();
      ctx.fillStyle = '#1d140f';
      ellipse(-3.5, -165, 1.3, 1.6);
      ctx.fill();
      ellipse(3.5, -165, 1.3, 1.6);
      ctx.fill();
      ctx.fillStyle = o.hairCol;
      ctx.beginPath();
      if (o.hair === 'pony') {
        ctx.moveTo(-11, -162);
        ctx.quadraticCurveTo(-12, -178, 0, -177);
        ctx.quadraticCurveTo(12, -178, 11, -162);
        ctx.quadraticCurveTo(6, -171, -11, -162);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(8, -172);
        ctx.quadraticCurveTo(22, -168, 17, -142);
        ctx.quadraticCurveTo(14, -160, 6, -166);
        ctx.fill();
      } else {
        ctx.moveTo(-11, -163);
        ctx.lineTo(-10, -175);
        ctx.lineTo(-5, -172);
        ctx.lineTo(-2, -179);
        ctx.lineTo(2, -173);
        ctx.lineTo(7, -178);
        ctx.lineTo(8, -171);
        ctx.lineTo(11, -163);
        ctx.quadraticCurveTo(2, -170, -11, -163);
        ctx.fill();
      }
    }
    // ---- các mảnh giáp ----
    withPiece(0.05, () => {
      for (const S of [L, R]) {
        ctx.fillStyle = PLATE;
        rr(S.ft[0] - 7.5, -22, 15, 22, 3);
        ctx.fill();
        ctx.fillStyle = acc;
        ctx.fillRect(S.ft[0] - 7.5, -4, 15, 4);
      }
    });
    withPiece(0.15, () => {
      for (const S of [L, R]) {
        ctx.fillStyle = PLATE;
        rr(S.kn[0] - 7, -48, 14, 27, 4);
        ctx.fill();
        ctx.fillStyle = PLATE_SH;
        ellipse(S.kn[0], -48, 6, 4);
        ctx.fill();
      }
    });
    withPiece(0.25, () => {
      for (const S of [L, R]) {
        ctx.fillStyle = PLATE;
        rr((S.hip[0] + S.kn[0]) / 2 - 8, -92, 16, 36, 5);
        ctx.fill();
        ctx.fillStyle = acc;
        ctx.fillRect((S.hip[0] + S.kn[0]) / 2 - 1, -88, 2, 26);
      }
    });
    withPiece(0.38, () => {
      ctx.fillStyle = PLATE;
      ctx.beginPath();
      ctx.moveTo(-21, -150);
      ctx.lineTo(21, -150);
      ctx.lineTo(17, -112);
      ctx.lineTo(0, -104);
      ctx.lineTo(-17, -112);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = PLATE_SH;
      ctx.beginPath();
      ctx.moveTo(-17, -112);
      ctx.lineTo(0, -104);
      ctx.lineTo(17, -112);
      ctx.lineTo(0, -108);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = acc;
      ctx.fillRect(-19, -141, 9, 2.5);
      ctx.fillRect(10, -141, 9, 2.5);
      ctx.save();
      ctx.shadowColor = o.visor;
      ctx.shadowBlur = 14;
      ctx.fillStyle = o.visor;
      ellipse(0, -130, 5.5, 5.5);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffffff';
      ellipse(0, -130, 2.2, 2.2);
      ctx.fill();
    });
    withPiece(0.46, () => {
      ctx.fillStyle = PLATE_SH;
      rr(-15, -107, 30, 11, 3);
      ctx.fill();
      ctx.fillStyle = acc;
      rr(-4, -105, 8, 7, 2);
      ctx.fill();
    });
    withPiece(0.54, () => {
      for (const sg of [-1, 1]) {
        ctx.fillStyle = PLATE;
        ellipse(21 * sg, -146, 10, 7.5);
        ctx.fill();
        ctx.fillStyle = acc;
        ctx.fillRect(21 * sg - 6, -147, 12, 2);
      }
    });
    withPiece(0.62, () => {
      for (const S of [L, R]) {
        limb([S.el, S.ha], 11, PLATE);
        limb([S.el, S.ha], 2, acc);
        ctx.fillStyle = PLATE_SH;
        ellipse(S.ha[0], S.ha[1], 5.5, 5.5);
        ctx.fill();
      }
    });
    withPiece(0.72, () => {
      ctx.fillStyle = SUIT2;
      rr(-12, -156, 24, 8, 3);
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = Math.sin(o.t * 6 + i) > 0 ? acc : 'rgba(255,255,255,0.2)';
        ellipse(-6 + i * 6, -152, 1.4, 1.4);
        ctx.fill();
      }
    });
    withPiece(0.82, () => {
      ctx.fillStyle = PLATE;
      ellipse(0, -165, 13.5, 14.5);
      ctx.fill();
      ctx.fillStyle = PLATE_SH;
      ctx.fillRect(-13, -160, 26, 5);
      ctx.fillStyle = acc;
      ctx.fillRect(-1.2, -180, 2.4, 10);
      ctx.fillStyle = '#0b1118';
      rr(-11, -170, 22, 8, 3);
      ctx.fill();
      if (k > 0.94) {
        const on = clamp((k - 0.94) / 0.04, 0, 1);
        ctx.save();
        ctx.globalAlpha *= on;
        ctx.shadowColor = o.visor;
        ctx.shadowBlur = 18;
        ctx.fillStyle = o.visor;
        rr(-10, -169, 20, 6, 3);
        ctx.fill();
        ctx.restore();
      }
    });
    // tia lửa khi mỗi mảnh khớp vào
    for (const [, st, cy] of PIECES) {
      const age = (k - st - 0.12) * 5;
      if (age <= 0 || age > 0.35) continue;
      const a = 1 - age / 0.35;
      ctx.strokeStyle = `rgba(255,214,120,${a})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * PI2 + st * 9;
        const r0 = 10 + age * 30;
        const r1 = r0 + 6 + age * 40;
        ctx.moveTo(Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
        ctx.lineTo(Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Cánh tay robot từ trần cầm mảnh giáp đang được lắp.
  function drawGantryArm(px, gy, s, k, side) {
    let ty = -120;
    for (const [, st, cy] of PIECES) {
      const p = clamp((k - st) / 0.12, 0, 1);
      if (p > 0 && p < 1) {
        ty = cy + (1 - easeOut(p)) * -150;
        break;
      }
    }
    if (k >= 0.94) ty = -230;
    const tx = px + side * 34 * s;
    const tyw = gy + ty * s;
    const bx = px + side * 190;
    const by = 56;
    const ex = (bx + tx) / 2 + side * 70;
    const ey = Math.min(by + 60, (by + tyw) / 2 - 30);
    ctx.lineCap = 'round';
    for (const [w, col] of [[16, '#2d3644'], [7, '#566273']]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(ex, ey);
      ctx.lineTo(tx, tyw);
      ctx.stroke();
    }
    ctx.fillStyle = '#1b222d';
    for (const [jx, jy] of [[bx, by], [ex, ey]]) {
      ellipse(jx, jy, 10, 10);
      ctx.fill();
    }
    ctx.fillStyle = '#ffb347';
    ellipse(ex, ey, 3, 3);
    ctx.fill();
    // kẹp
    ctx.strokeStyle = '#8a96a6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tx, tyw);
    ctx.lineTo(tx - side * 10, tyw - 8);
    ctx.moveTo(tx, tyw);
    ctx.lineTo(tx - side * 10, tyw + 8);
    ctx.stroke();
  }

  const PILOTS = [
    { name: 'PHI CÔNG 1', side: 'BÁN CẦU TRÁI', hair: 'short', hairCol: '#1d1410', visor: '#7ff6ff' },
    { name: 'PHI CÔNG 2', side: 'BÁN CẦU PHẢI', hair: 'pony', hairCol: '#6b2e1a', visor: '#ffb347' },
  ];

  function drawSuitUp(lt) {
    const def = game.deploy.def;
    const acc = def.pal.front.accent;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0b1424');
    bg.addColorStop(1, '#04070d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // tường khoang: dầm thép + sàn treo
    for (let x = 40; x < W; x += 160) {
      ctx.fillStyle = '#0f1a2b';
      ctx.fillRect(x, 0, 26, 600);
      ctx.fillStyle = 'rgba(127,246,255,0.06)';
      ctx.fillRect(x + 26, 0, 2, 600);
    }
    ctx.fillStyle = '#132036';
    ctx.fillRect(0, 196, W, 10);
    ctx.fillStyle = 'rgba(255,211,107,0.25)';
    for (let x = 0; x < W; x += 24) ctx.fillRect(x, 206, 2, 30);
    ctx.fillStyle = '#131c28';
    ctx.fillRect(0, 236, W, 4);
    text('KHOANG TRANG BỊ 07 · CĂN CỨ DUYÊN HẢI', W / 2, 186, { size: 13, align: 'center', color: 'rgba(159,193,224,0.55)' });
    // sàn + vạch cảnh báo
    ctx.fillStyle = '#0a0f17';
    ctx.fillRect(0, 600, W, 120);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 600, W, 12);
    ctx.clip();
    for (let x = -20; x < W; x += 28) {
      ctx.fillStyle = '#d6a520';
      ctx.beginPath();
      ctx.moveTo(x, 612);
      ctx.lineTo(x + 12, 600);
      ctx.lineTo(x + 24, 600);
      ctx.lineTo(x + 12, 612);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    const xs = [440, 840];
    const k0 = suitK(lt);
    xs.forEach((px, i) => {
      const P = PILOTS[i];
      const k = clamp(k0 - i * 0.03, 0, 1);
      // đèn chiếu từ trần
      const cone = ctx.createLinearGradient(0, 60, 0, 600);
      cone.addColorStop(0, 'rgba(200,230,255,0.16)');
      cone.addColorStop(1, 'rgba(200,230,255,0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(px - 30, 60);
      ctx.lineTo(px + 30, 60);
      ctx.lineTo(px + 150, 600);
      ctx.lineTo(px - 150, 600);
      ctx.closePath();
      ctx.fill();
      // bệ đứng
      ctx.fillStyle = '#18202d';
      ellipse(px, 604, 100, 18);
      ctx.fill();
      ctx.save();
      ctx.shadowColor = P.visor;
      ctx.shadowBlur = 16;
      ctx.strokeStyle = P.visor;
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(lt * 3 + i);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(px, 604, 90, 14, 0, 0, PI2);
      ctx.stroke();
      ctx.restore();
      // hơi nước
      for (let n = 0; n < 5; n++) {
        const age = (lt * 0.7 + n * 0.37 + i * 0.2) % 1.6;
        ctx.fillStyle = `rgba(220,235,255,${0.12 * (1 - age / 1.6)})`;
        ellipse(px + (n - 2) * 34 + Math.sin(age * 3 + n) * 8, 600 - age * 70, 18 + age * 22, 10 + age * 12);
        ctx.fill();
      }
      drawGantryArm(px, 600, 1.85, k, i === 0 ? -1 : 1);
      drawPilot(px, 600, 1.85, k, { ...P, accent: acc, t: lt });
      text(P.name, px, 646, { size: 16, weight: 900, align: 'center', color: P.visor, glow: P.visor, blur: 8 });
    });
    // bảng kiểm tra giáp hai bên
    xs.forEach((px, i) => {
      const P = PILOTS[i];
      const k = clamp(k0 - i * 0.03, 0, 1);
      const bw = 214;
      const bx = i === 0 ? 40 : W - 40 - bw;
      const by = 270;
      panel(bx, by, bw, 46 + PIECES.length * 22, P.visor);
      text(`${P.name} · ${P.side}`, bx + 14, by + 26, { size: 11, color: P.visor });
      PIECES.forEach(([name, st], j) => {
        const y = by + 52 + j * 22;
        const done = k >= st + 0.12;
        const busy = !done && k >= st;
        text(name, bx + 14, y, { size: 12, weight: 600, color: done ? '#e8f1ff' : busy ? '#ffd36b' : '#4d6580' });
        text(done ? 'OK' : busy ? '···' : '—', bx + bw - 14, y, { size: 12, weight: 900, align: 'right', color: done ? '#5dffb0' : busy ? '#ffd36b' : '#4d6580' });
      });
    });
    if (k0 >= 1) {
      const a = clamp((lt - 5.6) / 0.3, 0, 1);
      text('GIÁP THẦN KINH SẴN SÀNG', W / 2, 120, { size: 34, weight: 900, align: 'center', color: '#ffffff', glow: '#7ff6ff', blur: 18, alpha: a });
    }
  }

  function drawConnPod(lt) {
    const def = game.deploy.def;
    const acc = def.pal.front.accent;
    const hp = clamp((lt - 0.9) / 1.5, 0, 1);
    const dropK = clamp((lt - 3.0) / 0.25, 0, 1);
    ctx.save();
    if (lt > 3.0) ctx.translate(0, Math.sin(lt * 70) * 9 * Math.max(0, 1 - (lt - 3.0) / 0.8) + dropK * 6);
    ctx.fillStyle = '#070b12';
    ctx.fillRect(-20, -20, W + 40, H + 40);
    // cửa kính buồng lái nhìn ra biển đêm mưa bão
    const wx = 230;
    const wy = 70;
    const ww = 820;
    const wh = 270;
    ctx.save();
    rr(wx, wy, ww, wh, 40);
    ctx.clip();
    const sky = ctx.createLinearGradient(0, wy, 0, wy + wh);
    sky.addColorStop(0, '#0c1c33');
    sky.addColorStop(1, '#1b3552');
    ctx.fillStyle = sky;
    ctx.fillRect(wx, wy, ww, wh);
    if ((lt * 1.3) % 2.6 < 0.08) {
      ctx.fillStyle = 'rgba(200,225,255,0.35)';
      ctx.fillRect(wx, wy, ww, wh);
    }
    ctx.strokeStyle = 'rgba(170,200,230,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 70; i++) {
      const rx = wx + ((i * 97 + lt * 600) % ww);
      const ry = wy + ((i * 53 + lt * 900) % wh);
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 6, ry + 18);
    }
    ctx.stroke();
    // sóng não của hai phi công khớp dần
    const wave = (col, f, ph, amp) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = wx + 60; x <= wx + ww - 60; x += 6) {
        const y = wy + 175 + Math.sin(x * 0.025 * f + lt * 5 + ph) * amp;
        if (x === wx + 60) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    ctx.save();
    ctx.globalAlpha = clamp((lt - 0.6) / 0.4, 0, 1);
    ctx.shadowBlur = 12;
    ctx.shadowColor = PILOTS[0].visor;
    wave(PILOTS[0].visor, 1, 0, 22);
    ctx.shadowColor = PILOTS[1].visor;
    wave(PILOTS[1].visor, 1 + (1 - hp) * 0.45, (1 - hp) * 2.6, 22 * (1 + (1 - hp) * 0.6));
    if (hp >= 1) wave('rgba(255,255,255,0.8)', 1, 0, 22);
    ctx.restore();
    ctx.restore();
    // khung kính + gân thép
    ctx.strokeStyle = '#1e2836';
    ctx.lineWidth = 18;
    rr(wx, wy, ww, wh, 40);
    ctx.stroke();
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(W / 2, wy);
    ctx.lineTo(W / 2, wy + wh);
    ctx.stroke();
    ctx.fillStyle = '#3a4656';
    for (let i = 0; i < 14; i++) {
      ellipse(wx + 30 + i * 58, wy + wh + 2, 2.5, 2.5);
      ctx.fill();
    }
    // tiến độ bắt tay thần kinh
    if (lt > 0.6) {
      const done = hp >= 1;
      const label = lt > 3.05 ? 'BUỒNG LÁI ĐÃ KHÓA VÀO ĐẦU TITAN' : done ? 'ĐỒNG BỘ THẦN KINH 100%' : `BẮT TAY THẦN KINH ${Math.floor(hp * 100)}%`;
      text(label, W / 2, wy + 64, { size: 26, weight: 900, align: 'center', color: done ? '#ffffff' : '#bff8ff', glow: done ? '#5dffb0' : '#4ff0ff', blur: done ? 22 : 10 });
      bar(W / 2 - 200, wy + 80, 400, 8, hp, done ? '#5dffb0' : '#4ff0ff');
    }
    // sàn + bệ chuyển động
    ctx.fillStyle = '#0c121c';
    ctx.fillRect(0, 590, W, 140);
    const xs = [500, 780];
    xs.forEach((px, i) => {
      const P = PILOTS[i];
      ctx.fillStyle = '#1a2332';
      ellipse(px, 604, 90, 16);
      ctx.fill();
      ctx.strokeStyle = acc;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(px, 604, 80, 12, 0, 0, PI2);
      ctx.stroke();
      // cáp cột sống thần kinh từ trần
      const cab = clamp((lt - 0.55) / 0.3, 0, 1);
      if (cab > 0) {
        ctx.save();
        ctx.shadowColor = P.visor;
        ctx.shadowBlur = 10 * cab;
        ctx.strokeStyle = cab >= 1 ? P.visor : '#3a4656';
        ctx.lineWidth = 5;
        ctx.beginPath();
        const sx = px + (i === 0 ? -1 : 1) * 70;
        const ey = 600 - 152 * 1.75;
        ctx.moveTo(sx, 40);
        ctx.quadraticCurveTo(sx, ey - 40, lerp(sx, px, cab), lerp(40, ey, cab));
        ctx.stroke();
        ctx.restore();
      }
      const up = easeOut(clamp((lt - 2.1) / 0.35, 0, 1));
      drawPilot(px, 600, 1.75, 1, { ...P, accent: acc, t: lt, armsUp: up });
      // kẹp giày từ tính đóng lại
      const cl = 1 - easeOut(clamp((lt - 0.2 - i * 0.12) / 0.3, 0, 1));
      for (const sg of [-1, 1]) {
        ctx.fillStyle = '#2c3646';
        const fx0 = px + sg * 17.5;
        rr(fx0 - 16 + sg * cl * 60, 584, 32, 18, 4);
        ctx.fill();
        ctx.fillStyle = cl === 0 ? acc : '#566273';
        ctx.fillRect(fx0 - 16 + sg * cl * 60, 584, 32, 3);
      }
      text(`${P.name} · ${P.side}`, px, 646, { size: 14, weight: 800, align: 'center', color: P.visor });
      // màn hình ba chiều trước mặt
      ctx.save();
      ctx.globalAlpha = clamp((lt - 0.8) / 0.4, 0, 1) * (0.75 + 0.25 * Math.sin(lt * 23 + i));
      for (const sg of [-1, 1]) {
        const hx = px + sg * 105;
        const hy = 420 + Math.sin(lt * 2 + sg) * 4;
        ctx.fillStyle = 'rgba(79,240,255,0.10)';
        ctx.strokeStyle = 'rgba(127,246,255,0.7)';
        ctx.lineWidth = 1;
        rr(hx - 38, hy - 28, 76, 56, 4);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        for (let r = 0; r < 4; r++) {
          const lw = 20 + ((r * 17 + Math.floor(lt * 8)) % 40);
          ctx.moveTo(hx - 30, hy - 14 + r * 10);
          ctx.lineTo(hx - 30 + lw, hy - 14 + r * 10);
        }
        ctx.stroke();
      }
      ctx.restore();
    });
    if (lt > 3.0) {
      const a = clamp(1 - (lt - 3.0) / 0.5, 0, 1);
      ctx.fillStyle = `rgba(230,245,255,${a * 0.7})`;
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }
    ctx.restore();
  }

  // Máy bay vận tải cánh quạt nghiêng (đang treo, hai rotor quay ngửa lên).
  function drawTiltrotor(x, y, s, t, dim, acc) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    // đèn rọi dưới bụng
    const beam = ctx.createLinearGradient(0, 10, 0, 260);
    beam.addColorStop(0, `rgba(255,236,170,${0.22 * (1 - dim)})`);
    beam.addColorStop(1, 'rgba(255,236,170,0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(-6, 12);
    ctx.lineTo(6, 12);
    ctx.lineTo(60, 260);
    ctx.lineTo(-60, 260);
    ctx.closePath();
    ctx.fill();
    const body = shade('#4a5765', -dim * 0.5);
    // cánh + vỏ động cơ
    ctx.fillStyle = shade('#36414d', -dim * 0.5);
    ctx.fillRect(-78, -6, 156, 7);
    for (const sg of [-1, 1]) {
      ctx.fillStyle = body;
      rr(sg * 78 - 7, -26, 14, 30, 5);
      ctx.fill();
      // đĩa rotor mờ
      ctx.fillStyle = `rgba(200,215,230,${0.14 * (1 - dim * 0.6)})`;
      ellipse(sg * 78, -28, 58, 7);
      ctx.fill();
      ctx.strokeStyle = `rgba(230,240,250,${0.5 * (1 - dim * 0.6)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let b = 0; b < 3; b++) {
        const a = t * 40 * sg + (b * PI2) / 3;
        ctx.moveTo(sg * 78, -28);
        ctx.lineTo(sg * 78 + Math.cos(a) * 58, -28 + Math.sin(a) * 7);
      }
      ctx.stroke();
    }
    // thân
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-62, -2);
    ctx.quadraticCurveTo(-60, -16, -30, -16);
    ctx.lineTo(48, -14);
    ctx.quadraticCurveTo(70, -10, 72, 4);
    ctx.quadraticCurveTo(60, 14, 30, 14);
    ctx.lineTo(-40, 12);
    ctx.quadraticCurveTo(-62, 10, -62, -2);
    ctx.fill();
    // đuôi
    ctx.beginPath();
    ctx.moveTo(-50, -10);
    ctx.lineTo(-72, -34);
    ctx.lineTo(-62, -34);
    ctx.lineTo(-38, -12);
    ctx.closePath();
    ctx.fill();
    // kính buồng lái
    ctx.fillStyle = dim > 0.4 ? '#21384c' : '#4f8fb3';
    ctx.beginPath();
    ctx.moveTo(46, -12);
    ctx.quadraticCurveTo(64, -9, 68, 0);
    ctx.lineTo(50, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = acc;
    ctx.fillRect(-30, -2, 60, 3);
    // đèn hàng hải nhấp nháy
    const blink = Math.sin(t * 7 + x * 0.01) > 0.6;
    ctx.fillStyle = blink ? '#ff3b3b' : '#5a1414';
    ellipse(-78, -4, 3, 3);
    ctx.fill();
    ctx.fillStyle = blink ? '#5dffb0' : '#1a4a34';
    ellipse(78, -4, 3, 3);
    ctx.fill();
    ctx.restore();
  }

  function drawAirlift(lt) {
    const D = game.deploy;
    const def = D.def;
    const acc = def.pal.front.accent;
    ctx.save();
    const splashAge = lt - SPLASH_T;
    if (splashAge > 0 && splashAge < 0.8) ctx.translate(rand(-1, 1) * 14 * (1 - splashAge / 0.8), rand(-1, 1) * 10 * (1 - splashAge / 0.8));
    // trời bão
    const sky = ctx.createLinearGradient(0, 0, 0, SEA_Y);
    sky.addColorStop(0, '#040a16');
    sky.addColorStop(1, '#183250');
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.fillStyle = 'rgba(220,235,255,0.85)';
    ellipse(1040, 150, 34, 34);
    ctx.fill();
    if ((lt + 0.6) % 3.1 < 0.09) {
      ctx.fillStyle = 'rgba(200,225,255,0.3)';
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }
    // mây trôi (ba lớp thị sai)
    for (let layer = 0; layer < 3; layer++) {
      const sp = 60 + layer * 90;
      ctx.fillStyle = `rgba(${30 + layer * 14},${44 + layer * 16},${66 + layer * 18},${0.55 + layer * 0.15})`;
      for (let c = 0; c < 6; c++) {
        const cxw = ((c * 330 + 900 - lt * sp) % (W + 400) + W + 400) % (W + 400) - 200;
        const cy = 110 + layer * 90 + (c % 2) * 30;
        ellipse(cxw, cy, 120 + layer * 20, 22 + layer * 6);
        ctx.fill();
        ellipse(cxw + 60, cy - 12, 70, 18);
        ctx.fill();
      }
    }
    // bờ biển thành phố hiện dần bên phải
    const cityIn = clamp((lt - 1) / 3, 0, 1);
    for (let i = 0; i < 18; i++) {
      const bx = W - 380 + i * 24 + (1 - cityIn) * 300;
      const bh = 30 + ((i * 37) % 70);
      ctx.fillStyle = '#0a1422';
      ctx.fillRect(bx, SEA_Y - bh, 20, bh);
      ctx.fillStyle = 'rgba(255,213,138,0.6)';
      for (let wy = SEA_Y - bh + 6; wy < SEA_Y - 6; wy += 9) if ((i * 7 + wy) % 3 === 0) ctx.fillRect(bx + 5, wy, 3, 3);
    }
    // đội bay + Titan
    const gx = lerp(-260, W / 2 - 60, easeOut(clamp(lt / 3.2, 0, 1)));
    const bob = Math.sin(lt * 1.7) * 6;
    const rel = lt - RELEASE_T;
    const titanY = rel > 0 ? Math.min(SEA_Y + 40, HANG_Y + bob + 0.5 * FALL_G * rel * rel) : HANG_Y + bob;
    const sway = rel > 0 ? 0 : Math.sin(lt * 1.3) * 0.03;
    const craft = [
      [-80, -330, 0.75, 0.5],
      [80, -338, 0.75, 0.5],
      [-165, -290, 1, 0],
      [165, -298, 1, 0],
    ];
    const climb = rel > 0 ? rel * rel * 160 : 0;
    const spread = rel > 0 ? rel * 60 : 0;
    const shoulderY = HANG_Y + bob - 178;
    const cables = (front) => {
      craft.forEach(([ox, oy, sc, dim], idx) => {
        if ((dim === 0) !== front) return;
        const ax = gx + ox * (1 + spread / 150);
        const ay = HANG_Y + bob + oy - climb + 12 * sc;
        const hx = gx + (ox < 0 ? -40 : 44);
        const len = rel > 0 ? Math.max(0, 1 - rel / 0.5) : 1;
        if (len <= 0) return;
        ctx.strokeStyle = dim ? 'rgba(120,135,150,0.6)' : '#9aa7b3';
        ctx.lineWidth = dim ? 1.5 : 2.2;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        const ex = lerp(ax, hx, len);
        const ey = lerp(ay, shoulderY + (rel > 0 ? 0 : 0), len);
        ctx.quadraticCurveTo((ax + ex) / 2 + 6, (ay + ey) / 2 + 10, ex, ey);
        ctx.stroke();
        if (idx >= 2 && rel <= 0) {
          ctx.fillStyle = '#ffd36b';
          ellipse(hx, shoulderY, 3, 3);
          ctx.fill();
        }
      });
    };
    craft.forEach(([ox, oy, sc, dim]) => {
      if (dim) drawTiltrotor(gx + ox * (1 + spread / 150), HANG_Y + bob + oy - climb, sc, lt, dim, acc);
    });
    cables(false);
    if (titanY < SEA_Y + 39) {
      ctx.save();
      ctx.translate(gx, titanY);
      ctx.rotate(sway);
      ctx.translate(-gx, -titanY);
      drawTitanAvatar(def, gx, titanY, 0.74, true, 400);
      ctx.restore();
    }
    cables(true);
    craft.forEach(([ox, oy, sc, dim]) => {
      if (!dim) drawTiltrotor(gx + ox * (1 + spread / 150), HANG_Y + bob + oy - climb, sc, lt, dim, acc);
    });
    // biển (lớp trước, che phần Titan chìm dưới nước)
    const sea = ctx.createLinearGradient(0, SEA_Y, 0, H);
    sea.addColorStop(0, 'rgba(20,56,86,0.97)');
    sea.addColorStop(1, 'rgba(3,10,20,1)');
    ctx.fillStyle = sea;
    ctx.fillRect(-20, SEA_Y, W + 40, H - SEA_Y + 20);
    ctx.strokeStyle = 'rgba(160,200,230,0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let r = 0; r < 4; r++) {
      const yy = SEA_Y + 8 + r * 14;
      for (let x = -20; x < W + 20; x += 40) {
        const ox = (x + lt * (40 + r * 20)) % 40;
        ctx.moveTo(x - ox, yy);
        ctx.quadraticCurveTo(x - ox + 10, yy - 3, x - ox + 20, yy);
      }
    }
    ctx.stroke();
    // nước bắn tung
    if (splashAge > 0) {
      for (let i = 0; i < 46; i++) {
        const ang = -Math.PI / 2 + ((i / 46) - 0.5) * 2.2;
        const v = 380 + ((i * 53) % 260);
        const px = gx + Math.cos(ang) * v * splashAge;
        const py = SEA_Y - (Math.sin(-ang) * v * splashAge - 0.5 * 900 * splashAge * splashAge);
        if (py > SEA_Y + 4) continue;
        ctx.fillStyle = `rgba(225,240,255,${clamp(1 - splashAge / 1.6, 0, 1)})`;
        ellipse(px, py, 4 + (i % 3) * 2, 4 + (i % 3) * 2);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(230,245,255,${clamp(0.6 - splashAge, 0, 1)})`;
      ellipse(gx, SEA_Y, 120 + splashAge * 200, 16 + splashAge * 10);
      ctx.fill();
    }
    if (rel > 0 && rel < 1.2) {
      const pop = rel < 0.15 ? lerp(2, 1, rel / 0.15) : 1;
      ctx.save();
      ctx.translate(W / 2 + 330, 340);
      ctx.scale(pop, pop);
      text('THẢ!', 0, 0, { size: 72, weight: 900, align: 'center', color: '#ffffff', glow: '#ff9b3d', blur: 26, alpha: clamp((1.2 - rel) / 0.3, 0, 1) });
      ctx.restore();
    }
    if (splashAge > 0.3) {
      const a = clamp((splashAge - 0.3) / 0.4, 0, 1);
      text(`${def.name.replace('EYERIM ', '')} ĐÃ ĐỔ BỘ`, W / 2, 200, { size: 48, weight: 900, align: 'center', color: '#ffffff', glow: acc, blur: 22, alpha: a });
      text(D.district.toUpperCase(), W / 2, 238, { size: 18, align: 'center', color: '#cfe0f0', alpha: a });
    }
    ctx.restore();
  }

  function drawDeploy() {
    const D = game.deploy;
    const t = D.t;
    let lt;
    let dur;
    let scene;
    if (t < POD_T) {
      lt = t;
      dur = POD_T;
      scene = 0;
      drawSuitUp(lt);
    } else if (t < AIR_T) {
      lt = t - POD_T;
      dur = AIR_T - POD_T;
      scene = 1;
      drawConnPod(lt);
    } else {
      lt = t - AIR_T;
      dur = DEPLOY_END - AIR_T;
      scene = 2;
      drawAirlift(lt);
    }
    drawScanlines(0.025);
    // chuyển cảnh mờ đen
    const fade = Math.max(clamp(1 - lt / 0.35, 0, 1), clamp((lt - (dur - 0.35)) / 0.35, 0, 1));
    if (fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${fade})`;
      ctx.fillRect(0, 0, W, H);
    }
    // khung điện ảnh
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, 56);
    ctx.fillRect(0, H - 56, W, 56);
    const titles = ['TRANG BỊ GIÁP THẦN KINH', 'VÀO BUỒNG LÁI', 'VẬN CHUYỂN ĐƯỜNG KHÔNG'];
    const step = D.full ? `GIAI ĐOẠN ${scene + 1} / 3 · ` : '';
    text(step + titles[scene], 40, 36, { size: 15, weight: 900, color: '#7ff6ff' });
    text(D.def.name, W - 40, 36, { size: 15, weight: 900, align: 'right', color: D.def.pal.front.accent });
    const subs = [
      'Cánh tay robot lắp từng mảnh giáp lên bộ đồ thần kinh của hai phi công',
      'Khóa giày từ tính · nối cáp cột sống · bắt tay thần kinh',
      `Đội bay vận tải đưa Titan tới ${D.district}`,
    ];
    text(subs[scene], 40, H - 22, { size: 14, weight: 500, color: '#cfe0f0' });
    text('ENTER — BỎ QUA', W - 40, H - 22, { size: 14, weight: 800, align: 'right', color: '#ffd36b', alpha: 0.6 + 0.4 * Math.sin(game.t * 4) });
    zone(W - 200, H - 50, 180, 44, () => setupWave());
  }

  // ---------- Huấn luyện phi công: xem từng chiêu thức + chỉ số (không đánh quái) ----------
  const TRAIN_MOVES = ['walk', 'dash', 'guard', 'jab', 'hook', 'blade', 'cannon', 'special', 'ultimate', 'celebrate'];
  const fmtS = (v) => String(Math.round(v * 100) / 100).replace('.', ',') + ' s';

  // Bảng chỉ số cho từng chiêu của một Titan (đọc thẳng từ số liệu chiến đấu).
  function trainMoves(def) {
    const T = { def };
    const mv = (n) => tmove(T, n);
    const timing = (m) => ({ windup: m.windup, active: m.active, recover: m.recover });
    const jab = mv('jab');
    const hook = mv('hook');
    const blade = mv('blade');
    const jet = mv('jet');
    const cannon = mv('cannon');
    const tempest = !!def.missiles;
    return [
      {
        clip: 'walk', key: 'A / D', name: 'DI CHUYỂN', pilot: 'PHI CÔNG 1',
        desc: 'Tiến lùi dọc bờ biển. Giữ quái ở phía biển để bảo vệ thành phố. Link dưới 25% thì Titan chậm chạp.',
        stats: [['TỐC ĐỘ', def.speed + ' đv/s'], ['MÁU TITAN', def.hp + ' HP']],
      },
      {
        clip: 'dash', key: 'W', name: 'LƯỚT NÉ', pilot: 'PHI CÔNG 1',
        desc: 'Lướt nhanh với khung bất tử: né được cả đòn lao húc màu đỏ không đỡ được.',
        stats: [['NĂNG LƯỢNG', '20'], ['BẤT TỬ', fmtS(0.32)], ['THỜI GIAN LƯỚT', fmtS(0.5)]],
      },
      {
        clip: 'guard', key: 'S (giữ)', name: 'ĐỠ ĐÒN', pilot: 'PHI CÔNG 1',
        desc: 'Giảm mạnh sát thương. Đỡ khi đã hết năng lượng thì vỡ thế thủ và lãnh trọn đòn. Không đỡ được lao húc.',
        stats: [['GIẢM SÁT THƯƠNG', '65%'], ['NĂNG LƯỢNG', BLOCK_COST + ' / đòn'], ['HẾT NĂNG LƯỢNG', 'vỡ thế thủ']],
      },
      {
        clip: 'jab', key: 'F', name: 'ĐẤM TRÁI', pilot: 'PHI CÔNG 1', dmg: jab.dmg, ...timing(jab),
        desc: 'Đòn nhanh nhất. Bấm cùng lúc với J để ĐỒNG BỘ: sát thương ×2, đánh trúng quái thì Link +12.',
        stats: [['SÁT THƯƠNG', String(jab.dmg)], ['TẦM ĐÁNH', jab.range + ' đv'], ['ĐẨY LÙI', String(jab.kb)], ['ĐỒNG BỘ F + J', '×2 sát thương']],
      },
      {
        clip: 'hook', key: 'J', name: 'ĐẤM PHẢI', pilot: 'PHI CÔNG 2', dmg: hook.dmg, ...timing(hook),
        desc: 'Đòn tay phải mạnh hơn đấm trái một chút. Kết hợp với F trong cửa sổ đồng bộ.',
        stats: [['SÁT THƯƠNG', String(hook.dmg)], ['TẦM ĐÁNH', hook.range + ' đv'], ['ĐẨY LÙI', String(hook.kb)], ['CỬA SỔ ĐỒNG BỘ', fmtS(SYNC_WINDOW)]],
      },
      {
        clip: 'blade', key: 'K', name: tempest ? 'LƯỠI KÉP CỔ TAY' : 'KIẾM XÍCH', pilot: 'PHI CÔNG 2', dmg: blade.dmg, heavy: true, ...timing(blade),
        desc: tempest ? 'Hai lưỡi bật ra từ cổ tay, chém nhanh và làm quái choáng. Đòn nặng: dùng phản đòn được.' : 'Kiếm xích tầm xa, chém nặng. Đòn nặng: trúng lúc quái đang gồng (!) sẽ phản đòn.',
        stats: [['SÁT THƯƠNG', String(blade.dmg)], ['TẦM ĐÁNH', blade.range + ' đv'], ['ĐẨY LÙI', String(blade.kb)], ['ĐẶC TÍNH', 'đòn nặng · phản đòn']],
      },
      tempest ? {
        clip: 'cannon', key: 'L (giữ 2s)', name: '6 TÊN LỬA', pilot: 'PHI CÔNG 2', dmg: 6 * MISSILE_DMG, ...timing(cannon),
        desc: 'Giữ L đủ 2 giây để khóa mục tiêu rồi thả: ngực phóng 6 tên lửa tự dẫn. Thả sớm là hủy.',
        stats: [['SÁT THƯƠNG', `6 × ${MISSILE_DMG}`], ['NĂNG LƯỢNG', `${CHARGE_MIN} → ${CHARGE_MAX}`], ['THỜI GIAN KHÓA', fmtS(MISSILE_CHARGE)], ['NẠP LẠI', fmtS(MISSILE_RELOAD)]],
      } : {
        clip: 'cannon', key: 'L (giữ)', name: 'PHÁO PLASMA', pilot: 'PHI CÔNG 2', dmg: 52, ...timing(cannon),
        desc: 'Giữ để nạp, thả để bắn. Nạp càng lâu càng mạnh. Từ 60% là đòn nặng. Trúng đòn khi đang nạp thì mất phát bắn.',
        stats: [['SÁT THƯƠNG', '12 → 52'], ['NĂNG LƯỢNG', `${CHARGE_MIN} → ${CHARGE_MAX}`], ['NẠP TỐI THIỂU', fmtS(CHARGE_LOCK)], ['NẠP ĐẦY', fmtS(CHARGE_TIME)]],
      },
      {
        clip: 'special', key: 'I', name: tempest ? 'ĐẬP PHẢN LỰC' : 'ĐẤM PHẢN LỰC', pilot: 'PHI CÔNG 2', dmg: jet.dmg, heavy: true, ...timing(jet),
        desc: tempest ? 'Gồng rồi bay lên bằng thruster, nện thẳng xuống đầu quái. Trúng đòn khi đang gồng thì mất chiêu.' : 'Động cơ khuỷu tay mồi lửa, Titan lao tới giáng đòn. Quái trong tầm thì chắc chắn trúng. Trúng đòn khi đang gồng thì mất chiêu.',
        stats: [['SÁT THƯƠNG', String(jet.dmg)], ['NĂNG LƯỢNG', String(jet.energy)], ['TẦM CHẮC TRÚNG', Math.round(SPECIAL_RANGE) + ' đv'], ['ĐẶC TÍNH', 'đòn nặng · phản đòn']],
      },
      tempest ? {
        clip: 'ultimate', key: 'F+J', name: def.ultName, pilot: 'HAI PHI CÔNG · KHI LINK 100%', dmg: 96,
        desc: 'Khi Link đạt 100% (giữ được 5 giây), đồng bộ F + J để gọi 6 tên lửa vệ tinh rơi xuống quái.',
        stats: [['SÁT THƯƠNG', '6 × 16'], ['ĐẨY LÙI CUỐI', '700'], ['ĐIỀU KIỆN', 'Link 100%'], ['THỜI GIAN GIỮ LINK', fmtS(LINK_HOLD)]],
      } : {
        clip: 'ultimate', key: 'F+J', name: def.ultName, pilot: 'HAI PHI CÔNG · KHI LINK 100%', dmg: 98,
        desc: 'Khi Link đạt 100% (giữ được 5 giây), đồng bộ F + J để bắn chùm tia từ lò phản ứng ngực suốt 1,5 giây.',
        stats: [['SÁT THƯƠNG', '15 × 5,5 + 15'], ['THỜI GIAN BẮN', fmtS(1.5)], ['ĐIỀU KIỆN', 'Link 100%'], ['THỜI GIAN GIỮ LINK', fmtS(LINK_HOLD)]],
      },
      {
        clip: 'celebrate', key: 'TỰ ĐỘNG', name: 'ĂN MỪNG', pilot: 'HAI PHI CÔNG',
        desc: 'Hạ gục quái là Titan bật nhảy bằng thruster, xoay nửa vòng rồi đáp đất dang tay — EYERIIIM!',
        stats: [['ĐIỀU KIỆN', 'hạ gục quái vật']],
      },
    ];
  }

  function openTraining() {
    game.state = 'training';
    game.stateT = 0;
    game.train = { idx: 0, t: 0, titan: game.titanIdx, facing: 1, playing: true };
    sfx.buy();
  }
  function trainSelect(i) {
    const R = game.train;
    if (i === R.idx) return;
    R.idx = i;
    R.t = 0;
    sfx.dash();
  }
  function trainTitan(i) {
    const R = game.train;
    if (i === R.titan) return;
    R.titan = i;
    R.t = 0;
    sfx.dash();
  }
  function updateTraining(dt) {
    const R = game.train;
    if (R.playing) R.t += dt;
    const d = (tapAny('KeyS', 'ArrowDown') ? 1 : 0) - (tapAny('KeyW', 'ArrowUp') ? 1 : 0);
    if (d) trainSelect((R.idx + d + TRAIN_MOVES.length) % TRAIN_MOVES.length);
    TRAIN_MOVES.forEach((m, i) => { if (i < 9 && tapAny('Digit' + (i + 1), 'Numpad' + (i + 1))) trainSelect(i); });
    if (tapAny('Digit0', 'Numpad0')) trainSelect(9);
    const dx = (tapAny('KeyD', 'ArrowRight') ? 1 : 0) - (tapAny('KeyA', 'ArrowLeft') ? 1 : 0);
    if (dx) trainTitan((R.titan + dx + TITANS.length) % TITANS.length);
    if (tap('KeyR')) R.facing *= -1;
    if (tap('Space')) R.playing = !R.playing;
    if (tap('Enter') || tap('NumpadEnter')) {
      R.t = 0;
      R.playing = true;
    }
    if (tap('Escape')) {
      game.titanIdx = R.titan;
      toTitle();
    }
  }

  function drawTraining() {
    dim(0.78);
    drawScanlines(0.03);
    const R = game.train;
    const def = TITANS[R.titan];
    const acc = def.pal.front.accent;
    const moves = trainMoves(def);
    const M = moves[R.idx];
    text('HUẤN LUYỆN PHI CÔNG', 40, 58, { size: 32, weight: 900, color: '#ffffff', glow: '#ffd36b', blur: 14 });
    text('Xưởng chuyển động · xem từng chiêu thức và chỉ số trước khi xuất kích', 40, 82, { size: 13, weight: 500, color: '#9fc1e0' });
    // chọn Titan
    TITANS.forEach((d, i) => {
      const w = 170;
      const x = W - 40 - (TITANS.length - i) * (w + 10);
      const on = i === R.titan;
      const c = d.pal.front.accent;
      if (on) {
        ctx.fillStyle = c;
        rr(x, 34, w, 40, 6);
        ctx.fill();
      } else panel(x, 34, w, 40, 'rgba(120,190,255,0.25)');
      text(d.name.replace('EYERIM ', ''), x + w / 2, 60, { size: 16, weight: 900, align: 'center', color: on ? '#03101a' : '#cfe0f0' });
      zone(x, 34, w, 40, () => trainTitan(i));
    });

    // danh sách chiêu
    const lx = 40;
    const ly = 104;
    const lw = 300;
    const rh = 44;
    moves.forEach((m, i) => {
      const y = ly + i * (rh + 4);
      const on = i === R.idx;
      if (on) {
        ctx.save();
        ctx.shadowColor = acc;
        ctx.shadowBlur = 14;
        ctx.fillStyle = 'rgba(14,30,50,0.95)';
        rr(lx, y, lw, rh, 6);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = acc;
        ctx.lineWidth = 1.5;
        rr(lx, y, lw, rh, 6);
        ctx.stroke();
        ctx.fillStyle = acc;
        rr(lx, y, 4, rh, 2);
        ctx.fill();
      } else panel(lx, y, lw, rh, 'rgba(120,190,255,0.14)');
      text(String((i + 1) % 10), lx + 18, y + 28, { size: 12, color: on ? acc : '#4d6580' });
      text(m.name, lx + 38, y + 21, { size: m.name.length > 16 ? 13 : 15, weight: 800, color: on ? '#ffffff' : '#cfe0f0' });
      text(m.pilot, lx + 38, y + 37, { size: 10, weight: 600, color: '#7f9bb8' });
      ctx.font = `900 11px ${FONT}`;
      const kw = Math.max(26, ctx.measureText(m.key).width + 14);
      ctx.fillStyle = on ? 'rgba(255,211,107,0.22)' : 'rgba(255,211,107,0.1)';
      rr(lx + lw - 12 - kw, y + 12, kw, 20, 4);
      ctx.fill();
      text(m.key, lx + lw - 12 - kw / 2, y + 26, { size: 11, weight: 900, align: 'center', color: '#ffd36b' });
      zone(lx, y, lw, rh, () => trainSelect(i));
    });

    // sân khấu
    const sx = 360;
    const sy = 104;
    const sw = 540;
    const sh = 430;
    const bg = ctx.createLinearGradient(0, sy, 0, sy + sh);
    bg.addColorStop(0, 'rgba(20,40,66,0.95)');
    bg.addColorStop(1, 'rgba(4,10,18,0.98)');
    ctx.fillStyle = bg;
    rr(sx, sy, sw, sh, 8);
    ctx.fill();
    ctx.save();
    rr(sx, sy, sw, sh, 8);
    ctx.clip();
    ctx.strokeStyle = 'rgba(127,246,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = sx; gx < sx + sw; gx += 30) {
      ctx.moveTo(gx, sy);
      ctx.lineTo(gx, sy + sh);
    }
    for (let gy = sy; gy < sy + sh; gy += 30) {
      ctx.moveTo(sx, gy);
      ctx.lineTo(sx + sw, gy);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(79,240,255,0.35)';
    ctx.fillRect(sx, sy + sh * 0.9, sw, 1.5);
    drawTitanClip(def, M.clip, R.t, R.facing, 1, sx, sy, sw, sh);
    ctx.restore();
    drawCorners(sx - 4, sy - 4, sw + 8, sh + 8, acc);
    text(M.name, sx + 18, sy + 30, { size: 18, weight: 900, color: '#ffffff', glow: acc, blur: 10 });
    text(R.playing ? '▶ ĐANG PHÁT' : '❚❚ TẠM DỪNG', sx + sw - 16, sy + 28, { size: 11, weight: 800, align: 'right', color: R.playing ? '#5dffb0' : '#ffd36b' });

    // dòng thời gian gồng / ra đòn / hồi
    const tl = sy + sh + 16;
    if (M.windup != null) {
      const total = M.windup + M.active + M.recover;
      const segs = [['GỒNG', M.windup, '#ffd36b'], ['RA ĐÒN', M.active, '#ff5e4d'], ['HỒI', M.recover, '#6f87a0']];
      let x = sx;
      segs.forEach(([lb, v, c]) => {
        const w = (v / total) * sw;
        ctx.fillStyle = c;
        rr(x + 1, tl, Math.max(2, w - 2), 12, 3);
        ctx.fill();
        if (w > 60) text(`${lb} ${fmtS(v)}`, x + 4, tl + 30, { size: 11, weight: 700, color: c });
        x += w;
      });
      let ph = -1;
      if (['jab', 'hook', 'blade'].includes(M.clip)) {
        const p = R.t % (total + 0.7);
        if (p < total) ph = p;
      } else if (M.clip === 'special') {
        const p = R.t % 3.1;
        if (p < total) ph = p;
      } else if (M.clip === 'cannon') {
        const charge = def.missiles ? MISSILE_CHARGE : CHARGE_TIME;
        const p = (R.t % (charge + 1.3)) - charge;
        if (p >= 0 && p < total) ph = p;
      }
      if (ph >= 0) {
        const mx = sx + (ph / total) * sw;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(mx - 1, tl - 4, 2, 20);
      }
      text(`TỔNG ${fmtS(total)}`, sx + sw, tl + 30, { size: 11, weight: 800, align: 'right', color: '#cfe0f0' });
    } else {
      text('Chiêu không có pha gồng / ra đòn / hồi riêng', sx, tl + 12, { size: 12, weight: 500, color: '#6f87a0' });
    }

    // bảng chỉ số
    const px = 920;
    const pw = W - 40 - px;
    const ph2 = sh + 46;
    panel(px, sy, pw, ph2, acc);
    text(M.pilot, px + 20, sy + 28, { size: 11, color: acc });
    wrapText(M.name, px + 20, sy + 58, pw - 40, 26, { size: 24, weight: 900, color: '#ffffff' });
    ctx.font = `900 13px ${FONT}`;
    const kw = ctx.measureText(M.key).width + 20;
    ctx.fillStyle = 'rgba(255,211,107,0.18)';
    rr(px + 20, sy + 74, kw, 26, 5);
    ctx.fill();
    text(M.key, px + 20 + kw / 2, sy + 92, { size: 13, weight: 900, align: 'center', color: '#ffd36b' });
    wrapText(M.desc, px + 20, sy + 126, pw - 40, 19, { size: 13, weight: 500, color: '#cfe0f0' });
    const st = sy + 228;
    ctx.fillStyle = 'rgba(120,190,255,0.18)';
    ctx.fillRect(px + 20, st - 18, pw - 40, 1);
    text('CHỈ SỐ', px + 20, st, { size: 11, color: '#7f9bb8' });
    M.stats.forEach(([lb, v], i) => {
      const y = st + 28 + i * 30;
      text(lb, px + 20, y, { size: 12, weight: 600, color: '#9fc1e0' });
      text(v, px + pw - 20, y, { size: 15, weight: 900, align: 'right', color: '#ffffff' });
    });
    if (M.dmg != null) {
      const y = st + 28 + M.stats.length * 30 + 4;
      text('SO VỚI CHIÊU MẠNH NHẤT', px + 20, y, { size: 10, color: '#7f9bb8' });
      const top = Math.max(...moves.map((m) => m.dmg || 0));
      bar(px + 20, y + 8, pw - 40, 8, M.dmg / top, M.heavy ? '#ffd36b' : acc);
    }
    text('Lõi plasma (xưởng) +25% cho K, L và chiêu đặc biệt', px + 20, sy + ph2 - 16, { size: 10, weight: 500, color: '#6f87a0' });

    text('W / S hoặc 1–0 chọn chiêu  ·  A / D đổi Titan  ·  SPACE dừng / phát  ·  R lật hướng  ·  ENTER phát lại  ·  ESC về menu', W / 2, H - 22, { size: 13, align: 'center', weight: 600, color: '#9fc1e0' });
    zone(40, H - 46, 140, 36, () => { game.titanIdx = R.titan; toTitle(); });
    text('◀ MENU', 50, H - 22, { size: 13, weight: 900, color: '#ffd36b' });
  }

  // Nhãn chế độ dưới bảng Titan trong trận.
  function drawModeBadge() {
    const m = modeDef();
    let info;
    if (game.mode === 'campaign') info = `ĐỢT ${game.wave + 1}/${WAVES.length}`;
    else if (game.mode === 'rush') info = fmtTime(game.runTime) + (records.rush ? ` · TỐT NHẤT ${fmtTime(records.rush)}` : '');
    else info = `ĐỘ KHÓ ${DIFFS[game.duel.diff].name}`;
    panel(20, 128, 380, 30, m.color);
    ctx.fillStyle = m.color;
    rr(20, 128, 4, 30, 2);
    ctx.fill();
    text(m.name, 34, 148, { size: 12, weight: 900, color: m.color });
    text(info, 384, 148, { size: game.mode === 'rush' ? 14 : 12, align: 'right', color: '#e8f1ff' });
  }

  // Quái vật làm avatar trong thẻ Đấu tự do (dùng chung bộ vẽ trận đấu).
  const avatarKaiju = {};
  function drawKaijuAvatar(def, cx, gy, s) {
    const K = avatarKaiju[def.name] || (avatarKaiju[def.name] = makeKaiju(def));
    K.state = 'idle';
    K.y = 0;
    K.x = game.cam + cx;
    K.facing = -1;
    ctx.save();
    ctx.translate(cx, gy);
    ctx.scale(s, s);
    ctx.translate(-cx, -GROUND);
    drawKaiju(K);
    ctx.restore();
  }

  function drawDuel() {
    dim(0.7);
    drawScanlines(0.03);
    const D = game.duel;
    text('ĐẤU TỰ DO', W / 2, 62, { size: 40, align: 'center', weight: 900, color: '#ffffff', glow: '#ff7bf2', blur: 18 });
    text('Chọn quái vật và độ khó — thắng sẽ được đánh dấu lại', W / 2, 90, { size: 15, align: 'center', weight: 500, color: '#9fc1e0' });
    const cw = 370;
    const ch = 300;
    const top = 116;
    const maxHp = Math.max(...WAVES.map((w) => w.hp));
    const maxSp = Math.max(...WAVES.map((w) => w.speed));
    const maxAg = Math.max(...WAVES.map((w) => w.aggression));
    text('QUÁI VẬT', 61, top - 6, { size: 12, color: D.row === 0 ? '#ff7bf2' : '#7f9bb8' });
    WAVES.forEach((w, i) => {
      const x = 61 + i * (cw + 24);
      const on = i === D.kaiju;
      ctx.save();
      ctx.globalAlpha = on ? 1 : 0.5;
      panel(x, top + 4, cw, ch, on ? w.glow : 'rgba(120,190,255,0.2)');
      if (on && D.row === 0) drawCorners(x - 5, top - 1, cw + 10, ch + 10, w.glow);
      // khung avatar
      ctx.save();
      rr(x + 10, top + 14, cw - 20, 150, 6);
      ctx.clip();
      const g = ctx.createLinearGradient(0, top + 14, 0, top + 164);
      g.addColorStop(0, 'rgba(20,40,64,0.7)');
      g.addColorStop(1, 'rgba(4,10,18,0.95)');
      ctx.fillStyle = g;
      ctx.fillRect(x + 10, top + 14, cw - 20, 150);
      drawKaijuAvatar(w, x + cw / 2 + 20, top + 160, 0.27 / w.scale * 1.15);
      ctx.restore();
      text(w.cat, x + 20, top + 190, { size: 12, color: '#c8909a' });
      text(w.name, x + 20, top + 216, { size: 24, weight: 900, color: w.glow, glow: on ? w.glow : null, blur: 10 });
      [['MÁU', w.hp / maxHp], ['TỐC ĐỘ', w.speed / maxSp], ['HUNG HÃN', w.aggression / maxAg]].forEach(([lb, f], j) => {
        const yy = top + 240 + j * 18;
        text(lb, x + 20, yy + 4, { size: 10, color: '#9fc1e0' });
        bar(x + 100, yy - 4, cw - 190, 7, f, w.glow);
      });
      // các độ khó đã thắng
      DIFFS.forEach((d, j) => {
        ctx.fillStyle = records.duel[i + '-' + j] ? d.color : 'rgba(255,255,255,0.12)';
        ellipse(x + cw - 60 + j * 14, top + 212, 5, 5);
        ctx.fill();
      });
      text(w.moves.length + ' ĐÒN', x + cw - 20, top + 194, { size: 11, align: 'right', color: '#9fc1e0' });
      ctx.restore();
    });
    // đòn của quái đang chọn
    const kw = WAVES[D.kaiju];
    text('ĐÒN: ' + kw.moves.map((m) => MOVE_LABEL[m].split(' — ')[0]).join(' · '), W / 2, top + ch + 34, { size: 13, align: 'center', weight: 600, color: '#cfe0f0' });

    // độ khó
    const dy = top + ch + 62;
    text('ĐỘ KHÓ', 61, dy, { size: 12, color: D.row === 1 ? '#ff7bf2' : '#7f9bb8' });
    const dw = 270;
    const gap = 18;
    const dx0 = W / 2 - (DIFFS.length * dw + (DIFFS.length - 1) * gap) / 2;
    DIFFS.forEach((d, i) => {
      const x = dx0 + i * (dw + gap);
      const on = i === D.diff;
      ctx.save();
      if (on) {
        ctx.shadowColor = d.color;
        ctx.shadowBlur = D.row === 1 ? 18 : 6;
        ctx.fillStyle = d.color;
        rr(x, dy + 12, dw, 48, 6);
        ctx.fill();
      } else panel(x, dy + 12, dw, 48, 'rgba(120,190,255,0.2)');
      ctx.restore();
      text(d.name, x + dw / 2, dy + 43, { size: 18, weight: 900, align: 'center', color: on ? '#03101a' : d.color });
    });
    const d = DIFFS[D.diff];
    text(`Máu quái ×${d.hp} · Sát thương quái ×${d.dmg} · Hung hãn ×${d.aggr}`, W / 2, dy + 92, { size: 14, align: 'center', weight: 600, color: d.color });
    text('W / S đổi hàng  ·  A / D chọn  ·  ENTER chọn Titan  ·  ESC quay lại', W / 2, H - 22, { size: 14, align: 'center', weight: 500, color: '#9fc1e0' });
  }

  // Vẽ Titan làm avatar trong thẻ chọn: đặt chân tại (cx, gy), phóng to theo s.
  const avatarTitans = {};
  // air > 0: Titan lơ lửng (không vẽ bóng đổ dưới chân), dùng khi được máy bay cẩu.
  function drawTitanAvatar(def, cx, gy, s, active, air = 0) {
    const T = avatarTitans[def.id] || (avatarTitans[def.id] = makeTitan(def));
    T.x = game.cam + cx;
    T.facing = 1;
    T.link = active ? 100 : 60;
    T.airY = air;
    ctx.save();
    ctx.translate(cx, gy);
    ctx.scale(s, s);
    ctx.translate(-cx, -GROUND + air);
    drawTitan(T);
    ctx.restore();
  }

  function drawSelect() {
    dim(0.62);
    text('CHỌN TITAN', W / 2, 70, { size: 40, align: 'center', color: '#e8fbff', glow: '#4ff0ff', blur: 20, weight: 900 });
    text(`${modeDef().name}${game.mode === 'duel' ? ` · ${WAVES[game.duel.kaiju].name} · ${DIFFS[game.duel.diff].name}` : ''} — chọn khung giáp cho hai phi công`, W / 2, 98, { size: 15, align: 'center', weight: 500, color: modeDef().color });
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
        const y = top + 136 + j * 34;
        text(label, tx, y, { size: 12, color: '#9fc1e0' });
        for (let n = 0; n < 5; n++) {
          ctx.fillStyle = n < def.stats[k] ? acc : 'rgba(255,255,255,0.1)';
          rr(tx + n * 47, y + 7, 42, 9, 3);
          ctx.fill();
        }
      });
      // thông số kỹ thuật: chiều cao + khối lượng (hư cấu EyeRim, chỉ hiển thị)
      [['CHIỀU CAO', `${def.heightM} m`], ['KHỐI LƯỢNG', `${def.massTonnes.toLocaleString('vi-VN')} tấn`]].forEach(([label, value], j) => {
        const sx = tx + j * 118;
        text(label, sx, top + 280, { size: 11, color: '#9fc1e0' });
        text(value, sx, top + 300, { size: 17, weight: 800, color: '#efe3cc' });
      });
      text(`HP ${def.hp} · TỐC ĐỘ ${def.speed}`, tx, top + 322, { size: 12, weight: 500, color: '#cfe0f0' });
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
    const def = game.kdef;
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
    let line = `PHẾ LIỆU +${r.gain}`;
    if (game.mode === 'rush') line = `TỔNG THỜI GIAN ${fmtTime(r.runTime)}`;
    else if (game.mode === 'duel') line = `THẮNG · ĐỘ KHÓ ${def.diff}`;
    text(line, W / 2, 460, { size: 26, align: 'center', color: '#ffd36b', glow: '#ff9b3d' });
    if (game.newRecord) text(game.mode === 'duel' ? 'LẦN ĐẦU THẮNG!' : 'KỶ LỤC MỚI!', W / 2 + 250, 196, { size: 16, align: 'right', color: '#5dffb0', glow: '#5dffb0', alpha: 0.6 + 0.4 * Math.sin(game.t * 8) });
    let next = 'ENTER — VỀ XƯỞNG SỬA CHỮA';
    if (game.mode === 'campaign' && isLastWave()) next = 'ENTER — HOÀN THÀNH CHIẾN DỊCH';
    else if (game.mode === 'rush') next = isLastWave() ? 'ENTER — XEM KẾT QUẢ' : 'ENTER — ĐỢT TIẾP THEO (đồng hồ đang dừng)';
    else if (game.mode === 'duel') next = 'ENTER — KẾT THÚC TRẬN';
    if (game.stateT > 0.8) text(next, W / 2, 492, { size: 15, align: 'center', color: '#9fc1e0' });
  }

  // ---------- Xưởng sửa chữa: Titan trong khoang + cánh tay robot + terminal chữ xanh ----------
  const MONO = 'Consolas, "Courier New", monospace';
  function mono(str, x, y, size, color, alpha = 1, align = 'left') {
    ctx.save();
    ctx.font = `600 ${size}px ${MONO}`;
    ctx.textAlign = align;
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.restore();
  }
  const hex = (n, w = 4) => (n >>> 0).toString(16).toUpperCase().padStart(w, '0').slice(-w);
  // Log bảo dưỡng giả lập (tiếng Anh, kiểu log hệ thống thật). Xác định theo chỉ số dòng.
  const PARTS = ['L_SHOULDER', 'R_SHOULDER', 'L_ELBOW', 'R_ELBOW', 'L_KNEE', 'R_KNEE', 'L_ANKLE', 'R_ANKLE', 'HIP_YAW', 'NECK_PITCH', 'SPINE_03', 'WRIST_R'];
  const SENSORS = ['chest', 'pauldron_l', 'pauldron_r', 'forearm_r', 'thigh_l', 'visor', 'reactor_housing'];
  const prng = (i, k) => {
    let x = (Math.imul(i, 374761393) + Math.imul(k, 668265263)) >>> 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0;
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  };
  const pickI = (arr, i, k) => arr[Math.floor(prng(i, k) * arr.length)];
  const num = (i, k, lo, hi, d = 1) => (lo + prng(i, k) * (hi - lo)).toFixed(d);
  const TERM_LINES = [
    (i) => `eyerim-hw: actuator ${pickI(PARTS, i, 1)} torque calib ${num(i, 2, 97, 99.9)}% ... OK`,
    (i) => `$ sudo weldctl --bay 03 --seam ${pickI(['LS', 'RS', 'CH', 'BK'], i, 3)}-${10 + Math.floor(prng(i, 4) * 40)} --temp ${num(i, 5, 1480, 1620, 0)}`,
    (i) => `[INFO] weld seam complete, deviation ${num(i, 6, 0.01, 0.09, 2)}mm, porosity 0.${Math.floor(prng(i, 7) * 9)}%`,
    (i) => `diag: scanning sensor array [${pickI(SENSORS, i, 8)}] ........ 0 faults`,
    (i) => `neural-bridge: handshake p1<->p2 latency ${num(i, 9, 3.1, 5.4)}ms jitter ${num(i, 10, 0.1, 0.6)}ms`,
    (i) => `reactor: core ${num(i, 11, 790, 840, 0)}K, output ${num(i, 12, 44, 49)} MW, coolant flow nominal`,
    (i) => `[WARN] hydraulic HPU-${1 + Math.floor(prng(i, 13) * 4)} pressure drop ${num(i, 14, 1.2, 3.4)} bar -> compensating`,
    (i) => `sha256 fw/servo_v4.${Math.floor(prng(i, 15) * 20)}.bin  ${hex(prng(i, 16) * 4294967296, 8).toLowerCase()}${hex(prng(i, 17) * 4294967296, 8).toLowerCase()}  verified`,
    (i) => `$ hydractl flush --line ${pickI(PARTS, i, 18).toLowerCase()} --psi ${num(i, 19, 2900, 3200, 0)}`,
    (i) => `armor: plate ${pickI(['A', 'B', 'C', 'D'], i, 20)}-${100 + Math.floor(prng(i, 21) * 80)} stress ${num(i, 22, 52, 88)}% [${'#'.repeat(3 + Math.floor(prng(i, 23) * 9))}${'.'.repeat(4)}]`,
    (i) => `[  OK  ] Started servo-controller@${pickI(PARTS, i, 24).toLowerCase()}.service`,
    (i) => `can0: rx ${Math.floor(prng(i, 25) * 9000 + 1000)} frames, 0 errors, bus load ${num(i, 26, 21, 48, 0)}%`,
    (i) => `$ diagctl run --suite structural --verbose`,
    (i) => `plasma-core: cell ${1 + Math.floor(prng(i, 27) * 12)}/12 charge ${num(i, 28, 92, 100)}% temp ${num(i, 29, 310, 360, 0)}K`,
  ];
  const termLine = (i) => {
    const ts = (12 + i / 11).toFixed(6).padStart(12, ' ');
    return `[${ts}] ${TERM_LINES[Math.floor(prng(i, 99) * TERM_LINES.length)](i + 7)}`;
  };
  const UPGRADE_KEYS = { armor: 'alloy_armor', reactor: 'reactor_core', blade: 'plasma_core', neural: 'neural_amp' };

  function workshopLog(str, color = '#ffd36b') {
    const ts = (12 + game.stateT).toFixed(6).padStart(12, ' ');
    (game.shopLog || (game.shopLog = [])).push({ str: `[${ts}] ${str}`, color, t: game.stateT });
    if (game.shopLog.length > 3) game.shopLog.shift();
  }

  function buyUpgrade(i) {
    game.shopSel = i;
    const u = UPGRADES[i];
    const cost = upgradeCost(u);
    if (game.upgrades[u.id] < upgradeMax() && game.scrap >= cost) {
      game.scrap -= cost;
      game.upgrades[u.id]++;
      game.weldBoost = 1.2;
      workshopLog(`$ upgradectl install ${UPGRADE_KEYS[u.id]} --level ${game.upgrades[u.id]}  ->  [ DONE ] (-${cost} scrap)`, '#ffd36b');
      sfx.buy();
      sfx.block();
    } else {
      workshopLog(game.upgrades[u.id] >= upgradeMax() ? `[ERROR] ${UPGRADE_KEYS[u.id]}: already at max level (${upgradeMax()})` : `[ERROR] insufficient scrap: need ${cost}, have ${game.scrap}`, '#ff6b5e');
      sfx.deny();
    }
  }

  // Giảm một cấp: hoàn lại đúng số phế liệu đã trả cho cấp đó.
  const refundOf = (u) => (game.upgrades[u.id] > 0 ? u.cost + (game.upgrades[u.id] - 1) * 20 : 0);
  function sellUpgrade(i) {
    game.shopSel = i;
    const u = UPGRADES[i];
    if (game.upgrades[u.id] <= 0) {
      workshopLog(`[ERROR] ${UPGRADE_KEYS[u.id]}: nothing to remove (level 0)`, '#ff6b5e');
      sfx.deny();
      return;
    }
    const refund = refundOf(u);
    game.upgrades[u.id]--;
    game.scrap += refund;
    workshopLog(`$ upgradectl remove ${UPGRADE_KEYS[u.id]} --level ${game.upgrades[u.id]}  ->  [ DONE ] (+${refund} scrap)`, '#7ff6ff');
    sfx.dash();
  }

  // Một cánh tay robot: gốc (bx, by) → khớp → đầu hàn (tx, ty); trả về đầu hàn.
  function drawWeldArm(bx, by, tx, ty, bend, weld) {
    const mx = (bx + tx) / 2 + bend;
    const my = (by + ty) / 2 - Math.abs(bend) * 0.4;
    ctx.lineCap = 'round';
    for (const [w, col] of [[18, '#2a3341'], [8, '#55606f']]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(mx, my);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
    ctx.fillStyle = '#1a212b';
    for (const [jx, jy, r] of [[bx, by, 14], [mx, my, 11]]) {
      ellipse(jx, jy, r, r);
      ctx.fill();
    }
    ctx.fillStyle = '#ffb347';
    ellipse(mx, my, 3, 3);
    ctx.fill();
    // đầu hàn + tia lửa
    ctx.fillStyle = '#8a96a6';
    ellipse(tx, ty, 6, 6);
    ctx.fill();
    if (weld > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, 26 * weld);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.3, 'rgba(160,220,255,0.8)');
      g.addColorStop(1, 'rgba(80,160,255,0)');
      ctx.fillStyle = g;
      ellipse(tx, ty, 26 * weld, 26 * weld);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,210,120,0.9)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      const n = Math.round(7 * weld) + 3;
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI) + Math.PI * 0.05;
        const l = rand(10, 40) * weld;
        const sx = tx + Math.cos(a) * 4;
        const sy = ty + Math.sin(a) * 4;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l + l * 0.3);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawWorkshopBay(x0, y0, w, h) {
    const t = game.t;
    const def = game.titan ? game.titan.def : curDef();
    const acc = def.pal.front.accent;
    ctx.save();
    rr(x0, y0, w, h, 8);
    ctx.clip();
    const bg = ctx.createLinearGradient(0, y0, 0, y0 + h);
    bg.addColorStop(0, '#0b1424');
    bg.addColorStop(1, '#04070d');
    ctx.fillStyle = bg;
    ctx.fillRect(x0, y0, w, h);
    // dầm tường + chữ sơn khoang
    for (let x = x0 + 20; x < x0 + w; x += 120) {
      ctx.fillStyle = '#0f1a2b';
      ctx.fillRect(x, y0, 18, h);
    }
    text('KHOANG 03', x0 + w / 2, y0 + 70, { size: 54, weight: 900, align: 'center', color: 'rgba(120,160,200,0.07)' });
    const gy = y0 + h - 56;
    const cx = x0 + w / 2;
    const s = 1.18;
    // giàn giáo hai bên
    ctx.strokeStyle = '#26303d';
    ctx.lineWidth = 6;
    for (const sx of [cx - 175, cx + 175]) {
      ctx.beginPath();
      ctx.moveTo(sx, gy);
      ctx.lineTo(sx, y0 + 60);
      ctx.stroke();
      for (let yy = gy - 70; yy > y0 + 70; yy -= 80) {
        ctx.beginPath();
        ctx.moveTo(sx - 26, yy);
        ctx.lineTo(sx + 26, yy);
        ctx.stroke();
      }
    }
    // sàn + vạch cảnh báo
    ctx.fillStyle = '#0a0f17';
    ctx.fillRect(x0, gy, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, gy, w, 10);
    ctx.clip();
    for (let x = x0 - 20; x < x0 + w; x += 28) {
      ctx.fillStyle = '#d6a520';
      ctx.beginPath();
      ctx.moveTo(x, gy + 10);
      ctx.lineTo(x + 12, gy);
      ctx.lineTo(x + 24, gy);
      ctx.lineTo(x + 12, gy + 10);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // đèn trần
    const cone = ctx.createLinearGradient(0, y0, 0, gy);
    cone.addColorStop(0, 'rgba(200,230,255,0.14)');
    cone.addColorStop(1, 'rgba(200,230,255,0)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(cx - 40, y0);
    ctx.lineTo(cx + 40, y0);
    ctx.lineTo(cx + 210, gy);
    ctx.lineTo(cx - 210, gy);
    ctx.closePath();
    ctx.fill();
    // Titan
    drawTitanAvatar(def, cx - 6, gy, s, false);
    // tia quét chẩn đoán chạy dọc thân
    const scanY = gy - (0.5 + 0.5 * Math.sin(t * 1.4)) * 330 * s * 0.92;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sg = ctx.createLinearGradient(0, scanY - 14, 0, scanY + 14);
    sg.addColorStop(0, 'rgba(61,255,138,0)');
    sg.addColorStop(0.5, 'rgba(61,255,138,0.35)');
    sg.addColorStop(1, 'rgba(61,255,138,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(cx - 150, scanY - 14, 300, 28);
    ctx.fillStyle = 'rgba(160,255,200,0.9)';
    ctx.fillRect(cx - 150, scanY - 1, 300, 2);
    ctx.restore();
    // ba cánh tay robot di chuyển giữa các điểm cần hàn
    const boost = game.weldBoost || 0;
    const pts = [
      [[-40, -250], [-30, -210], [-55, -160]],
      [[45, -240], [30, -120], [40, -185]],
      [[-20, -60], [25, -90], [-10, -110]],
    ];
    const bases = [[x0 + 40, y0 - 10], [x0 + w - 40, y0 - 10], [x0 + w - 20, gy - 40]];
    pts.forEach((list, i) => {
      const cyc = t * 0.45 + i * 1.3;
      const a = list[Math.floor(cyc) % list.length];
      const b = list[(Math.floor(cyc) + 1) % list.length];
      const k = easeInOut(clamp((cyc % 1) * 1.6 - 0.3, 0, 1));
      const tx = cx + lerp(a[0], b[0], k) * s;
      const ty = gy + lerp(a[1], b[1], k) * s;
      const welding = k <= 0 || k >= 1;
      const weld = (welding ? 0.7 + 0.3 * Math.sin(t * 40 + i) : 0) + boost * 0.8;
      drawWeldArm(bases[i][0], bases[i][1], tx, ty, i === 1 ? -90 : 90, Math.min(1.6, weld));
    });
    // nhãn chẩn đoán
    text(`${def.name.replace('EYERIM ', '')} · ĐANG BẢO DƯỠNG`, x0 + 18, y0 + 28, { size: 13, weight: 900, color: acc });
    const hp = game.titan ? `${game.titan.def.hp + game.upgrades.armor * 30} HP` : '';
    text(`GIÁP ${hp} · ${titanSpecLabel(def)}`, x0 + 18, y0 + 46, { size: 11, weight: 600, color: '#9fc1e0' });
    ctx.restore();
    ctx.strokeStyle = 'rgba(120,190,255,0.25)';
    ctx.lineWidth = 1;
    rr(x0, y0, w, h, 8);
    ctx.stroke();
  }

  function drawTerminal(x0, y0, w, h) {
    const t = game.stateT;
    ctx.save();
    ctx.fillStyle = 'rgba(2,10,6,0.94)';
    rr(x0, y0, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(61,255,138,0.45)';
    ctx.lineWidth = 1;
    rr(x0, y0, w, h, 8);
    ctx.stroke();
    // thanh tiêu đề
    ctx.fillStyle = 'rgba(61,255,138,0.12)';
    ctx.fillRect(x0 + 1, y0 + 1, w - 2, 24);
    for (const [i, c] of [[0, '#ff5e4d'], [1, '#ffd36b'], [2, '#3dff8a']]) {
      ctx.fillStyle = c;
      ellipse(x0 + 16 + i * 16, y0 + 13, 4.5, 4.5);
      ctx.fill();
    }
    const id = (game.titan ? game.titan.def.id : 'titan');
    mono(`tech@eyerim-bay03:~/maint$ ./maintain.sh --titan ${id} --wave ${game.wave + 2}`, x0 + 70, y0 + 17, 12, '#3dff8a', 0.85);
    ctx.beginPath();
    ctx.rect(x0 + 4, y0 + 28, w - 8, h - 32);
    ctx.clip();
    const lh = 16;
    const rows = Math.floor((h - 44) / lh);
    const rate = 11;
    const n = Math.floor(t * rate);
    const part = (t * rate) % 1;
    const logs = game.shopLog || [];
    // chia đôi kiểu tmux: ô trên = log chẩn đoán chạy liên tục, ô dưới = 3 lệnh upgradectl gần nhất
    const PANE = 3;
    const top = rows - PANE - 1;
    const stream = [];
    for (let i = Math.max(0, n - top + 1); i <= n; i++) stream.push(termLine(i));
    stream.forEach((str0, j) => {
      const y = y0 + 46 + j * lh;
      const last = j === stream.length - 1;
      const str = last ? str0.slice(0, Math.floor(str0.length * part)) : str0;
      const age = stream.length - 1 - j;
      mono(str, x0 + 14, y, 12, '#3dff8a', Math.max(0.4, 1 - age * 0.08));
    });
    // cột hex chạy dọc bên phải ô trên
    for (let r = 0; r < top; r++) {
      const v = hex(Math.floor(game.t * 8) * 131 + r * 977, 4);
      mono(v, x0 + w - 14, y0 + 46 + r * lh, 11, '#3dff8a', 0.18 + ((r + Math.floor(game.t * 8)) % 5 === 0 ? 0.4 : 0), 'right');
    }
    // đường chia ô + nhãn ô dưới
    const dy = y0 + 46 + top * lh - 6;
    ctx.fillStyle = 'rgba(61,255,138,0.35)';
    ctx.fillRect(x0 + 8, dy - 4, w - 16, 1);
    mono('[1] upgradectl', x0 + w - 14, dy + 8, 10, '#3dff8a', 0.55, 'right');
    const shown = logs.slice(-PANE);
    const blink = Math.sin(game.t * 10) > 0;
    for (let j = 0; j < PANE; j++) {
      const y = dy + 14 + j * lh;
      const L = shown[j];
      if (L) mono(L.str, x0 + 14, y, 12, L.color, 1);
      else if (j === shown.length) {
        const prompt = 'tech@eyerim-bay03:~/maint$ upgradectl ';
        mono(prompt, x0 + 14, y, 12, '#3dff8a', 0.8);
        if (blink) {
          ctx.save();
          ctx.font = `600 12px ${MONO}`;
          const cw = ctx.measureText(prompt).width;
          ctx.restore();
          ctx.fillStyle = '#3dff8a';
          ctx.fillRect(x0 + 15 + cw, y - 11, 7, 13);
        }
      }
    }
    // vạch quét màn hình CRT
    ctx.fillStyle = 'rgba(61,255,138,0.035)';
    for (let yy = y0 + 28; yy < y0 + h; yy += 3) ctx.fillRect(x0, yy, w, 1);
    const sweep = y0 + 28 + ((game.t * 90) % (h - 28));
    ctx.fillStyle = 'rgba(61,255,138,0.06)';
    ctx.fillRect(x0, sweep, w, 18);
    ctx.restore();
    // tiến độ bảo dưỡng
    const prog = clamp(t / 4, 0, 1);
    const py = y0 + h + 16;
    mono(`MAINTENANCE ${Math.floor(prog * 100)}%`, x0, py + 4, 12, '#3dff8a');
    bar(x0 + 200, py - 6, w - 200, 8, prog, '#3dff8a');
  }

  function drawUpgrade() {
    dim(0.85);
    text('XƯỞNG SỬA CHỮA', 40, 54, { size: 34, weight: 900, color: '#e8fbff', glow: '#4ff0ff', blur: 16 });
    text('Giữa các đợt, giáp Titan được sửa lại đầy đủ và thành phố mới cần bảo vệ.', 40, 78, { size: 13, weight: 500, color: '#9fc1e0' });
    text(`PHẾ LIỆU: ${game.scrap}`, W - 40, 60, { size: 24, weight: 900, align: 'right', color: '#ffd36b', glow: '#ff9b3d', blur: 10 });
    drawWorkshopBay(40, 96, 470, 520);
    drawTerminal(530, 96, 710, 178);
    // thẻ nâng cấp
    const cw = 167;
    const ch = 250;
    const cy = 312;
    UPGRADES.forEach((u, i) => {
      const x = 530 + i * (cw + 14);
      const lvl = game.upgrades[u.id];
      const cost = upgradeCost(u);
      const maxed = lvl >= upgradeMax();
      const can = !maxed && game.scrap >= cost;
      const sel = i === (game.shopSel || 0);
      panel(x, cy, cw, ch, sel ? '#4ff0ff' : can ? 'rgba(255,211,107,0.6)' : undefined);
      if (sel) {
        ctx.save();
        ctx.shadowColor = '#4ff0ff';
        ctx.shadowBlur = 14;
        ctx.strokeStyle = '#4ff0ff';
        ctx.lineWidth = 2;
        rr(x, cy, cw, ch, 10);
        ctx.stroke();
        ctx.restore();
      }
      text(`[${i + 1}]`, x + 16, cy + 30, { size: 15, color: '#ffd36b' });
      text(u.name, x + 16, cy + 60, { size: u.name.length > 14 ? 14 : 16, weight: 900 });
      wrapText(u.desc, x + 16, cy + 86, cw - 30, 18, { size: 12, weight: 500, color: '#cfe0f0' });
      for (let k = 0; k < upgradeMax(); k++) {
        ctx.fillStyle = k < lvl ? '#4ff0ff' : 'rgba(255,255,255,0.12)';
        rr(x + 16 + k * 38, cy + 150, 30, 9, 4);
        ctx.fill();
      }
      text(maxed ? 'NÂNG: TỐI ĐA' : `NÂNG: ${cost}`, x + 16, cy + 182, { size: 13, weight: 900, color: maxed ? '#4ff0ff' : can ? '#ffd36b' : '#7f8ea0' });
      text(lvl > 0 ? `HOÀN: +${refundOf(u)}` : 'HOÀN: —', x + 16, cy + 200, { size: 13, weight: 900, color: lvl > 0 ? '#7ff6ff' : '#4d6580' });
      // nút − / +
      const btn = (bx, label, on, fn) => {
        ctx.fillStyle = on ? 'rgba(79,240,255,0.16)' : 'rgba(255,255,255,0.05)';
        rr(bx, cy + 210, 64, 28, 5);
        ctx.fill();
        ctx.strokeStyle = on ? 'rgba(79,240,255,0.6)' : 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        rr(bx, cy + 210, 64, 28, 5);
        ctx.stroke();
        text(label, bx + 32, cy + 231, { size: 20, weight: 900, align: 'center', color: on ? '#e8fbff' : '#4d6580' });
        if (game.state === 'upgrade') zone(bx, cy + 210, 64, 28, fn);
      };
      if (game.state === 'upgrade') zone(x, cy, cw, ch - 44, () => { game.shopSel = i; });
      btn(x + 14, '−', lvl > 0, () => sellUpgrade(i));
      btn(x + cw - 78, '+', can, () => buyUpgrade(i));
    });
    const next = waveDef(game.wave + 1);
    text(`ENTER — XUẤT KÍCH: ${next.cat} ${next.name}`, 885, 590, { size: 20, weight: 900, align: 'center', color: '#ffd36b', glow: '#ff9b3d' });
    text('A / D chọn  ·  W / + nâng  ·  S / − giảm (hoàn đủ phế liệu)  ·  1–4 nâng nhanh  ·  ESC tạm dừng', 885, 614, { size: 13, align: 'center', weight: 500, color: '#9fc1e0' });
    if (game.state === 'upgrade') {
      zone(885 - 230, 568, 460, 30, () => {
        game.wave++;
        startDeploy(false);
      });
    }
  }

  function drawGameOver() {
    dim(0.6);
    const city = game.reason === 'city';
    text(city ? 'THÀNH PHỐ THẤT THỦ' : 'TITAN-FRAME BỊ HẠ', W / 2, 280, { size: 56, align: 'center', color: '#ff5e4d', glow: '#ff2a1a', weight: 900 });
    text(city ? 'Quá nhiều tòa nhà đã sụp đổ. Hãy giữ quái vật ở phía bờ biển.' : 'Hãy đỡ đòn khi thấy dấu ! vàng, và lướt né đòn lao húc màu đỏ.', W / 2, 330, { size: 18, align: 'center', weight: 500 });
    if (game.mode === 'rush') text(`Đã chạy ${fmtTime(game.runTime)} — thua là phải chạy lại từ đầu`, W / 2, 366, { size: 18, align: 'center', color: '#5dffb0' });
    if (game.stateT > 0.8) {
      const again = game.mode === 'rush' ? 'ENTER — CHẠY LẠI TỪ ĐẦU' : 'ENTER — THỬ LẠI ĐỢT NÀY';
      text(again, W / 2, 410, { size: 22, align: 'center', color: '#ffd36b' });
      text('T — VỀ MÀN HÌNH CHÍNH', W / 2, 446, { size: 16, align: 'center', color: '#9fc1e0' });
    }
  }

  function drawWin() {
    dim(0.65);
    if (game.mode === 'rush') {
      text('VỀ ĐÍCH', W / 2, 230, { size: 60, align: 'center', color: '#e8fbff', glow: '#5dffb0', weight: 900 });
      text(fmtTime(game.result.runTime), W / 2, 320, { size: 72, align: 'center', color: '#5dffb0', glow: '#5dffb0', weight: 900 });
      text(game.newRecord ? 'KỶ LỤC MỚI!' : `Tốt nhất: ${fmtTime(records.rush)}`, W / 2, 370, { size: 22, align: 'center', color: '#ffd36b' });
      if (game.stateT > 1) text('ENTER — VỀ MÀN HÌNH CHÍNH', W / 2, 440, { size: 22, align: 'center', color: '#ffd36b' });
      return;
    }
    if (game.mode === 'duel') {
      const d = game.kdef;
      text('CHIẾN THẮNG', W / 2, 240, { size: 64, align: 'center', color: '#e8fbff', glow: d.glow, weight: 900 });
      text(`${d.name} · ĐỘ KHÓ ${d.diff}`, W / 2, 292, { size: 22, align: 'center', color: d.glow });
      text(`Thời gian ${fmtTime(game.result.time)} · Thành phố còn ${Math.round(game.result.integ * 100)}%`, W / 2, 336, { size: 18, align: 'center', weight: 500 });
      text(`Đã thắng ${duelWins()}/${WAVES.length * DIFFS.length} tổ hợp quái vật × độ khó`, W / 2, 372, { size: 16, align: 'center', color: '#ffd36b' });
      if (game.stateT > 1) {
        text('ENTER — ĐẤU TRẬN KHÁC', W / 2, 440, { size: 22, align: 'center', color: '#ffd36b' });
        text('T — VỀ MÀN HÌNH CHÍNH', W / 2, 476, { size: 16, align: 'center', color: '#9fc1e0' });
      }
      return;
    }
    text('BỜ BIỂN ĐÃ AN TOÀN', W / 2, 260, { size: 60, align: 'center', color: '#e8fbff', glow: '#4ff0ff', weight: 900 });
    text('Ba quái vật Abyssal đã bị đẩy lùi. Khe nứt tạm thời im lặng... lúc này.', W / 2, 310, { size: 18, align: 'center', weight: 500 });
    text(`Tổng phế liệu thu được: ${game.scrap}`, W / 2, 360, { size: 20, align: 'center', color: '#ffd36b' });
    if (game.stateT > 1) text('ENTER — CHƠI LẠI', W / 2, 430, { size: 22, align: 'center', color: '#ffd36b' });
  }

  function render() {
    zonesNext = [];
    if (game.state === 'deploy') {
      drawDeploy();
      zones = zonesNext;
      return;
    }
    const sh = fx.shake;
    ctx.save();
    ctx.translate(rand(-sh, sh), rand(-sh, sh));
    const ud = game.state === 'fight' || game.state === 'paused' ? game.ultDim || 0 : 0;
    if (ud > 0.01 && game.titan) {
      // chiêu đặc biệt: zoom nhẹ vào Titan
      const zx = game.titan.x - game.cam;
      const zy = GROUND - 180;
      const z = 1 + 0.07 * ud;
      ctx.translate(zx, zy);
      ctx.scale(z, z);
      ctx.translate(-zx, -zy);
    }
    drawSky();
    drawFarCity();
    drawBolts();
    drawCranes();
    drawBuildings();
    drawGround();
    if (ud > 0.01) {
      // làm tối hậu cảnh để hiệu ứng nổi bật
      ctx.fillStyle = `rgba(2,6,16,${0.5 * ud})`;
      ctx.fillRect(-100, -100, W + 200, H + 200);
    }
    if (game.kaiju) drawKaiju(game.kaiju);
    if (game.state !== 'select' && game.state !== 'duel' && game.state !== 'training') drawTitan(game.titan);
    drawStrikes();
    drawBeam();
    drawProjectiles();
    drawRings();
    drawParticles();
    drawSea();
    drawTexts();
    ctx.restore();
    drawRain();
    const nearFlash = bolts.reduce((m, b) => (b.depth > 0.7 ? Math.max(m, boltK(b.t)) : m), 0);
    if (nearFlash > 0) {
      ctx.fillStyle = `rgba(200,220,255,${nearFlash * 0.12})`;
      ctx.fillRect(0, 0, W, H);
    }
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
      case 'duel':
        drawDuel();
        break;
      case 'training':
        drawTraining();
        break;
      case 'fight':
        drawHUD();
        drawUltCutin();
        break;
      case 'paused':
        if (game.pauseFrom === 'upgrade') drawUpgrade();
        else {
          drawHUD();
          if (game.pauseFrom === 'clear') drawClear();
        }
        drawPause();
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
    if (game.settingsOpen) {
      zonesNext = []; // chỉ bấm được trong bảng cài đặt
      drawSettings();
    }
    zones = zonesNext;
  }

  // Trang mẫu dùng chính bộ vẽ/IK của game, không chạy AI, nhạc hay vòng lặp chiến đấu.
  // Vẽ Titan đang diễn một động tác trong khung (bx, by, bw, bh) của ctx hiện tại.
  // Dùng chung cho trang mẫu titans/*.html và màn Huấn luyện phi công trong game.
  const CLIPS = ['idle', 'walk', 'guard', 'dash', 'jab', 'hook', 'blade', 'cannon', 'special', 'ultimate', 'celebrate', 'stagger'];
  function drawTitanClip(defIn, clip, time, facing, zoom, bx, by, bw, bh) {
    const saved = { t: game.t, cam: game.cam, titan: game.titan, kaiju: game.kaiju };
    const T = makeTitan(defIn);
    const def = T.def;
    const t = Math.max(0, time);
    T.x = 0; T.facing = facing; T.link = 60;
    game.t = t; game.cam = 0; game.titan = T; game.kaiju = null;
    const attack = (name, at, level = 1) => {
      const m = tmove(T, name);
      T.arms[m.arm] = { name, t: at, windup: m.windup, m, level };
    };
    try {
      if (clip === 'walk') { T.moving = true; T.walkT = t; T.vx = 160 * facing; }
      if (clip === 'guard') T.guard = true;
      if (clip === 'dash') { T.dashT = 0.3; T.vx = 500 * facing; T.moving = true; T.walkT = t * 2; }
      if (['jab', 'hook', 'blade'].includes(clip)) {
        const m = tmove(T, clip); const duration = m.windup + m.active + m.recover;
        const phase = t % (duration + 0.7);
        if (phase < duration) attack(clip, phase);
      }
      if (clip === 'cannon') {
        const duration = def.missiles ? MISSILE_CHARGE : CHARGE_TIME;
        const phase = t % (duration + 1.3);
        if (phase < duration) T.charge = { t: phase, level: Math.min(1, phase / duration) };
        else if (phase < duration + 0.5) {
          attack('cannon', phase - duration); T.muzzle = 0.1;
        }
      }
      if (clip === 'special') {
        const phase = t % 3.1;
        const m = tmove(T, 'jet');
        if (phase < m.windup) attack('jet', phase);
        else if (def.special === 'leap' && phase < m.windup + LEAP.up + LEAP.smash + LEAP.fall) {
          const lt = phase - m.windup;
          T.leap = { t: lt }; T.airY = Math.sin(lt / (LEAP.up + LEAP.smash + LEAP.fall) * Math.PI) * 160;
        } else if (def.special !== 'leap' && phase < m.windup + m.active + m.recover) attack('jet', phase);
      }
      if (clip === 'ultimate') { T.beaming = true; T.link = 100; }
      if (clip === 'celebrate') {
        T.celebrate = { t: t % 3 };
        const phase = celebratePhase(T.celebrate);
        if (phase.name === 'jump') T.airY = Math.sin(phase.k * Math.PI) * 170;
      }
      if (clip === 'stagger') { T.stagger = 0.3; T.hitFlash = Math.sin(t * 8) > 0.8 ? 0.1 : 0; }
      ctx.save();
      const scale = Math.min(bw / 760, bh / 540) * zoom;
      ctx.translate(bx + bw * 0.46, by + bh * 0.9);
      ctx.scale(scale, scale);
      // Đưa gốc mặt đất của game tới đường nền trong khung xem.
      ctx.translate(0, -GROUND);
      drawTitan(T);
      // Effets des armes isolés pour lire clairement chaque animation.
      const phase = t % ((def.missiles ? MISSILE_CHARGE : CHARGE_TIME) + 1.3);
      if (clip === 'cannon' && phase > (def.missiles ? MISSILE_CHARGE : CHARGE_TIME)) {
        ctx.save(); ctx.translate(0, GROUND); ctx.scale(facing, 1);
        if (def.missiles) {
          for (let i = 0; i < 6; i++) {
            const d = (phase - MISSILE_CHARGE) * 430 + i * 21;
            const y = -210 - (i % 2) * 14 - d * 0.22;
            poly([[30 + d, y - 4], [50 + d, y - 4], [57 + d, y], [50 + d, y + 4], [30 + d, y + 4]], '#d9dee4');
            poly([[30 + d, y - 3], [13 + d, y], [30 + d, y + 3]], '#eba96b');
          }
        } else {
          ctx.fillStyle = '#7ff6ff'; ellipse(160 + (phase - CHARGE_TIME) * 460, -206, 19, 14); ctx.fill();
        }
        ctx.restore();
      }
      if (clip === 'ultimate') {
        ctx.save(); ctx.translate(0, GROUND);
        if (def.ult === 'reactor') {
          ctx.fillStyle = '#7ff6ff'; ctx.fillRect(facing > 0 ? 17 : -380, -218, 363, 15);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(facing > 0 ? 17 : -380, -213, 363, 5);
        } else {
          for (let i = 0; i < 4; i++) {
            const x = facing * (140 + i * 65); const y = -370 + ((t * 220 + i * 80) % 365);
            poly([[x - 4, y - 35], [x + 4, y - 35], [x + 4, y - 4], [x, y + 4], [x - 4, y - 4]], '#d7d8cf');
            poly([[x - 3, y - 35], [x, y - 65], [x + 3, y - 35]], '#eba96b');
          }
        }
        ctx.restore();
      }
      ctx.restore();
    } finally {
      game.t = saved.t; game.cam = saved.cam; game.titan = saved.titan; game.kaiju = saved.kaiju;
      fx.particles.length = 0; fx.shake = 0;
    }
  }

  if (titanGallery) {
    window.TitanGallery = {
      clips: CLIPS,
      specs: Object.fromEntries(TITANS.map(def => [def.id, {
        heightM: def.heightM, massTonnes: def.massTonnes, label: titanSpecLabel(def),
        scale: titanDrawScale({ def }), crown: def.model.crown, sole: def.model.sole,
      }])),
      draw(target, id, clip, time, facing = 1, zoom = 1) {
        const savedCtx = ctx;
        ctx = target.getContext('2d');
        try {
          ctx.clearRect(0, 0, target.width, target.height);
          drawTitanClip(TITANS.find(d => d.id === id) || TITANS[0], clip, time, facing, zoom, 0, 0, target.width, target.height);
        } finally {
          ctx = savedCtx;
        }
      },
    };
    return;
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
    window.__TIDEBREAKER_TEST__.damageKaiju = damageKaiju;
    window.__TIDEBREAKER_TEST__.waveDef = waveDef;
    window.__TIDEBREAKER_TEST__.toTitle = toTitle;
    window.__TIDEBREAKER_TEST__.records = records;
    window.__TIDEBREAKER_TEST__.bolts = bolts;
    window.__TIDEBREAKER_TEST__.spawnBolt = spawnBolt;
    window.__TIDEBREAKER_TEST__.trainMoves = trainMoves;
    window.__TIDEBREAKER_TEST__.TITANS = TITANS;
    window.__TIDEBREAKER_TEST__.DEPLOY_END = DEPLOY_END;
    window.__TIDEBREAKER_TEST__.audioCfg = audioCfg;
    window.__TIDEBREAKER_TEST__.sfxGain = () => sfx.out && sfx.out.gain.value;
    window.__TIDEBREAKER_TEST__.sfxMuted = () => sfx.muted;
  }
})();
