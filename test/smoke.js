// Smoke test: chạy game trong Node với canvas giả, tự bấm phím qua toàn bộ chiến dịch.
// Dùng: node test/smoke.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};
const gradient = { addColorStop: noop };
const ctx = new Proxy({}, {
  get(target, prop) {
    if (prop in target) return target[prop];
    if (prop === 'measureText') return (s) => ({ width: String(s).length * 8 });
    if (/^create(Linear|Radial)Gradient$/.test(prop)) return () => gradient;
    return noop;
  },
  set(target, prop, value) { target[prop] = value; return true; },
});

const listeners = {};
let rafCb = null;
let now = 0;
const testHook = {};

// AudioContext giả: đủ API để chạy hết code âm thanh và nhạc nền, đếm số nốt được lên lịch.
const audioStats = { started: 0 };
function param(v = 0) {
  return { value: v, setValueAtTime: noop, exponentialRampToValueAtTime: noop, linearRampToValueAtTime: noop, setTargetAtTime: noop };
}
function node(extra = {}) {
  return { connect: noop, disconnect: noop, start: () => { audioStats.started++; }, stop: noop, ...extra };
}
class FakeAudioContext {
  constructor() { this.sampleRate = 8000; this.state = 'running'; this.destination = node(); }
  get currentTime() { return now / 1000; }
  resume() {}
  createGain() { return node({ gain: param(1) }); }
  createOscillator() { return node({ type: 'sine', frequency: param(440), detune: param(0) }); }
  createBiquadFilter() { return node({ type: 'lowpass', frequency: param(1000), Q: param(1) }); }
  createWaveShaper() { return node({ curve: null }); }
  createDelay() { return node({ delayTime: param(0) }); }
  createBufferSource() { return node({ buffer: null }); }
  createBuffer(ch, n) { const data = new Float32Array(n); return { getChannelData: () => data }; }
}

const sandbox = {
  console,
  Math, Set, Map, String, Number, Array, Object, JSON, Float32Array,
  AudioContext: FakeAudioContext,
  performance: { now: () => now },
  requestAnimationFrame: (cb) => { rafCb = cb; },
  document: { getElementById: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) },
  __TIDEBREAKER_TEST__: testHook,
};
sandbox.window = sandbox;
sandbox.innerWidth = 1280;
sandbox.innerHeight = 720;
sandbox.addEventListener = (type, fn) => { (listeners[type] ||= []).push(fn); };

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'game.js'), 'utf8');
vm.runInNewContext(src, sandbox, { filename: 'game.js' });
const game = testHook.game;

const fire = (type, code) => (listeners[type] || []).forEach((fn) => fn({ code, preventDefault: noop }));
const press = (code) => { fire('keydown', code); };
const release = (code) => fire('keyup', code);
function step(frames = 1) {
  for (let i = 0; i < frames; i++) {
    now += 1000 / 60;
    rafCb(now);
  }
}
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
  console.log('ok  -', msg);
}

step(5);
assert(game.state === 'title', 'bắt đầu ở màn hình chính');
press('Enter'); step(1); release('Enter');
assert(game.state === 'fight' && game.wave === 0, 'ENTER bắt đầu đợt 1');

// Bot đơn giản: tiến lại gần, đánh đồng bộ, đỡ khi quái gồng, lướt né khi bị lao húc.
function botFrame(frame) {
  const T = game.titan;
  const K = game.kaiju;
  ['KeyA', 'KeyD', 'KeyS'].forEach(release);
  if (!K || K.dying) return;
  const dist = Math.abs(K.x - T.x);
  if (K.state === 'windup' && K.move === 'charge') {
    if (frame % 6 === 0) { press('KeyK'); release('KeyK'); }
    return;
  }
  if (K.state === 'windup') { press('KeyS'); return; }
  if (dist > 220) press(K.x > T.x ? 'KeyD' : 'KeyA');
  if (frame % 20 === 0) { press('KeyF'); press('KeyJ'); release('KeyF'); release('KeyJ'); }
  if (frame % 47 === 0) { press('KeyK'); release('KeyK'); }
  if (frame % 200 === 100) { press('KeyI'); release('KeyI'); }
  if (frame % 150 === 0) press('KeyL');
  if (frame % 150 === 70) release('KeyL');
}

let sawSync = false;
let sawBeam = false;
let sawCounter = false;
let maxCharge = 0;
let retries = 0;
for (let wave = 0; wave < 3; wave++) {
  let f = 0;
  while (game.state === 'fight' && f < 60 * 240) {
    botFrame(f++);
    step(1);
    if (game.titan.syncCount > 0) sawSync = true;
    if (game.titan.beaming) sawBeam = true;
    if (game.titan.charge) maxCharge = Math.max(maxCharge, game.titan.charge.level);
    if (game.kaiju && game.kaiju.state === 'stun' && game.kaiju.stunDur === 1.3) sawCounter = true;
  }
  ['KeyA', 'KeyD', 'KeyS'].forEach(release);
  if (game.state === 'gameover') {
    console.log(`  (bot thua đợt ${wave + 1}: ${game.reason}) — thử lại`);
    press('Enter'); step(1); release('Enter'); step(60);
    wave--;
    if (++retries > 3) break;
    continue;
  }
  assert(game.state === 'clear', `hạ gục quái vật đợt ${wave + 1} (${(f / 60).toFixed(1)}s, thành phố ${Math.round(game.result.integ * 100)}%)`);
  step(60);
  press('Enter'); step(1); release('Enter');
  if (wave < 2) {
    assert(game.state === 'upgrade', 'vào xưởng nâng cấp');
    const before = game.scrap;
    const lvl = game.upgrades.armor;
    press('Digit1'); step(1); release('Digit1');
    assert(game.upgrades.armor === lvl + 1 && game.scrap < before, `mua được nâng cấp giáp (cấp ${lvl + 1})`);
    step(30);
    press('Enter'); step(1); release('Enter');
    assert(game.state === 'fight' && game.wave === wave + 1, `bắt đầu đợt ${wave + 2}`);
    assert(game.titan.maxHp === 150 + 30 * game.upgrades.armor, 'nâng cấp giáp được áp dụng');
  }
}
assert(game.state === 'win', 'hoàn thành chiến dịch');
assert(sawSync, 'có đòn đồng bộ');
assert(sawBeam, 'TIDEBREAKER đã được kích hoạt');
assert(maxCharge > 0.5, `pháo plasma nạp được lực (tối đa ${Math.round(maxCharge * 100)}%)`);
console.log(sawCounter ? 'ok  - có phản đòn' : 'note - bot chưa phản đòn lần nào');

// Pause + quay về màn hình chính
step(70);
press('Enter'); step(1); release('Enter');
assert(game.state === 'title', 'quay về màn hình chính');
assert(audioStats.started > 2000, `nhạc nền và hiệu ứng âm thanh chạy (${audioStats.started} nốt/âm)`);
console.log('\nTất cả smoke test đều qua.');
