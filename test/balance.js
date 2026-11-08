// Test cân bằng: cho bot đấu từng quái ở độ khó THƯỜNG, nhiều lượt với seed cố định.
//   - bot spam (bấm bừa F+J, giữ S) phải THUA quái Cấp II và Cấp III
//   - bot khá (phản đòn, né, đồng bộ đúng nhịp) phải THẮNG phần lớn trận, mỗi trận 20–120s (bản trước khi cân bằng: ~6s)
// Dùng: node test/balance.js          (in bảng kết quả + kiểm tra mục tiêu)
//       node test/balance.js --report (chỉ in bảng, không kiểm tra)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spamBot, makeSkilledBot } = require('./bots');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'game.js'), 'utf8');
const SCRIPT = new vm.Script(SRC, { filename: 'game.js' });
// Bộ vẽ Titan của game (src/titans/…, không phải bản nháp titans/): đúng danh sách và thứ tự thẻ <script> trong index.html.
const GAME_DRAWERS = [...fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').matchAll(/<script src="(src\/titans\/[\w/-]+\.js)/g)].map((m) => m[1]);
const DRAWERS = GAME_DRAWERS.map((file) => new vm.Script(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { filename: file }));

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Nạp game vào một sandbox riêng: canvas và âm thanh giả, Math.random theo seed.
function createGame(seed) {
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const ctx = new Proxy({}, {
    get(t, p) { if (p in t) return t[p]; if (p === 'measureText') return (s) => ({ width: String(s).length * 8 }); if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => gradient; return noop; },
    set(t, p, v) { t[p] = v; return true; },
  });
  const param = () => ({ value: 0, setValueAtTime: noop, exponentialRampToValueAtTime: noop, linearRampToValueAtTime: noop, setTargetAtTime: noop });
  const node = (x = {}) => ({ connect: noop, disconnect: noop, start: noop, stop: noop, ...x });
  let now = 0;
  class AC {
    constructor() { this.sampleRate = 8000; this.state = 'running'; this.destination = node(); }
    get currentTime() { return now / 1000; }
    resume() {}
    createGain() { return node({ gain: param() }); }
    createOscillator() { return node({ frequency: param(), detune: param() }); }
    createBiquadFilter() { return node({ frequency: param(), Q: param() }); }
    createWaveShaper() { return node(); }
    createDelay() { return node({ delayTime: param() }); }
    createBufferSource() { return node(); }
    createBuffer(c, n) { const d = new Float32Array(n); return { getChannelData: () => d }; }
  }
  const rng = mulberry32(seed);
  const SeededMath = Object.create(Math);
  SeededMath.random = rng;
  const listeners = {};
  let raf = null;
  const hook = {};
  const sb = {
    console, Math: SeededMath, Set, Map, String, Number, Array, Object, JSON, Float32Array,
    AudioContext: AC, performance: { now: () => now }, requestAnimationFrame: (cb) => { raf = cb; },
    document: { getElementById: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) },
    __TIDEBREAKER_TEST__: hook, innerWidth: 1280, innerHeight: 720,
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
  };
  sb.window = sb;
  SCRIPT.runInNewContext(sb);
  for (const d of DRAWERS) d.runInContext(sb);
  const fire = (type, code) => (listeners[type] || []).forEach((fn) => fn({ code, preventDefault: noop }));
  const botRng = mulberry32(seed ^ 0x9e3779b9);
  return {
    game: hook.game,
    hook,
    io: { press: (c) => fire('keydown', c), release: (c) => fire('keyup', c), rand: botRng },
    step() { now += 1000 / 60; raf(now); },
  };
}

// Một trận đấu tự do: trả về { win, time, hpLeft, city, reason }.
function duel({ kaiju, diff = 1, titan = 0, bot, seed, limit = 180 }) {
  const H = createGame(seed);
  const { game } = H;
  for (let i = 0; i < 3; i++) H.step();
  game.mode = 'duel';
  game.duel = { kaiju, diff, row: 0 };
  game.titanIdx = titan;
  game.wave = 0;
  game.upgrades = { armor: 0, reactor: 0, blade: 0, neural: 0 };
  H.hook.setupWave();
  let f = 0;
  while (game.state === 'fight' && f < 60 * limit) {
    bot(game, H.io, f++);
    H.step();
  }
  const T = game.titan;
  return {
    win: game.state === 'clear',
    time: f / 60,
    hpLeft: T.hp / T.maxHp,
    reason: game.state === 'gameover' ? game.reason : game.state === 'fight' ? 'timeout' : '',
  };
}

const KAIJU = ['BRINECRAWLER', 'GORGEMAW', 'LEVIATHRAX'];
const TITANS = ['VANGUARD', 'TEMPEST', 'BASTION', 'BULWARK'];
const RUNS = Number(process.env.BAL_RUNS) || 8;

function summarize(label, bot, kaiju, titan) {
  const rs = [];
  for (let s = 0; s < RUNS; s++) rs.push(duel({ kaiju, titan, bot: typeof bot === 'function' && bot.length === 0 ? bot() : bot, seed: 1000 + s * 77 + kaiju * 7 + titan }));
  const wins = rs.filter((r) => r.win);
  const avg = (a, k) => (a.length ? a.reduce((s, r) => s + r[k], 0) / a.length : 0);
  const out = {
    label, kaiju: KAIJU[kaiju], titan: TITANS[titan],
    winRate: wins.length / RUNS,
    time: avg(wins, 'time'),
    hpLeft: avg(wins, 'hpLeft'),
    losses: rs.filter((r) => !r.win).map((r) => r.reason),
  };
  console.log(
    `${label.padEnd(8)} ${out.titan.padEnd(9)} ${out.kaiju.padEnd(13)} thắng ${String(wins.length).padStart(2)}/${RUNS}` +
    (wins.length ? `  thời gian TB ${out.time.toFixed(1).padStart(5)}s  máu còn TB ${Math.round(out.hpLeft * 100)}%` : '') +
    (out.losses.length ? `  thua: ${[...new Set(out.losses)].join(', ')}` : ''),
  );
  return out;
}

const reportOnly = process.argv.includes('--report');
const fails = [];
const check = (cond, msg) => { if (!cond) fails.push(msg); };

console.log(`Độ khó THƯỜNG · ${RUNS} trận mỗi ô · không nâng cấp\n`);
for (let t = 0; t < TITANS.length; t++) {
  if (process.env.BAL_TITAN && TITANS[t] !== process.env.BAL_TITAN.toUpperCase()) continue; // chỉ đo một Titan
  for (let k = 0; k < KAIJU.length; k++) {
    const spam = summarize('spam', spamBot, k, t);
    if (k >= 1) check(spam.winRate <= 0.25, `bot spam thắng ${TITANS[t]} vs ${KAIJU[k]} quá dễ (${spam.winRate * 100}%)`);
  }
  for (let k = 0; k < KAIJU.length; k++) {
    const sk = summarize('khá', () => makeSkilledBot(), k, t);
    check(sk.winRate >= 0.6, `bot khá chỉ thắng ${TITANS[t]} vs ${KAIJU[k]} ${sk.winRate * 100}% (cần ≥ 60%)`);
    if (sk.winRate > 0) check(sk.time >= 20 && sk.time <= 120, `${TITANS[t]} vs ${KAIJU[k]}: thời gian trận ${sk.time.toFixed(1)}s ngoài khoảng 20–120s`);
  }
  console.log('');
}

if (reportOnly) process.exit(0);
if (fails.length) {
  fails.forEach((m) => console.error('FAIL:', m));
  process.exit(1);
}
console.log('Cân bằng đạt mục tiêu.');
