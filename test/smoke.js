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
    // Kiểm tra chặt như canvas thật: tham số sai sẽ ném lỗi và làm đứng game trên trình duyệt.
    if (prop === 'createRadialGradient') return (x0, y0, r0, x1, y1, r1) => { if (!(r0 >= 0 && r1 >= 0) || ![x0, y0, x1, y1].every(Number.isFinite)) throw new Error('createRadialGradient: tham số sai ' + [x0, y0, r0, x1, y1, r1]); return gradient; };
    if (prop === 'createLinearGradient') return (...a) => { if (!a.every(Number.isFinite)) throw new Error('createLinearGradient: tham số không hữu hạn ' + a); return gradient; };
    if (prop === 'ellipse') return (x, y, rx, ry) => { if (!(rx >= 0 && ry >= 0)) throw new Error('ellipse: bán kính âm ' + [rx, ry]); };
    if (prop === 'arc') return (x, y, r) => { if (!(r >= 0)) throw new Error('arc: bán kính âm ' + r); };
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
assert(game.state === 'select', 'ENTER mở màn hình chọn Titan');
step(20);
press('Enter'); step(1); release('Enter');
assert(game.state === 'fight' && game.wave === 0 && game.titan.def.id === 'vanguard', 'chọn VANGUARD, bắt đầu đợt 1');

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
  if (frame % 150 === 135) release('KeyL');
}

// Chiêu I: đứng thật xa quái, bấm I → phải trúng chắc chắn và đứng lại trong tầm chém của vũ khí K.
// Chiêu I: bấm 1 lần là tụ chiêu; bị trúng đòn trong lúc tụ thì mất chiêu (không hoàn năng lượng).
function checkSpecialInterrupt(label) {
  let f = 0;
  while (f++ < 60 * 30) {
    const T = game.titan;
    const K = game.kaiju;
    ['KeyA', 'KeyD', 'KeyS', 'KeyL'].forEach(release);
    if (K && !K.dying && K.state !== 'emerge' && !T.arms.R && !T.arms.L && !T.charge && !T.leap && !T.slide && !T.beaming) break;
    step(1);
  }
  const T = game.titan;
  const K = game.kaiju;
  T.energy = 100;
  T.x = K.x - K.half - 300;
  const kx = K.x;
  const hp0 = K.hp;
  press('KeyI'); release('KeyI');
  for (let i = 0; i < 30; i++) { K.cooldown = 5; K.x = kx; step(1); }
  assert(T.arms.R && T.arms.R.name === 'jet' && !T.arms.R.fired, `${label}: bấm I một lần là bắt đầu tụ chiêu`);
  testHook.hitTitan(5, 0, 1);
  for (let i = 0; i < 120; i++) { K.cooldown = 5; K.x = kx; step(1); }
  assert(game.kaiju.hp === hp0 && !T.leap && !T.slide && !T.arms.R, `${label}: trúng đòn khi đang tụ → mất chiêu`);
  assert(T.energy < 100, `${label}: mất chiêu thì không hoàn năng lượng`);
}

// Chiêu đặc biệt (Link 100% + đồng bộ): VANGUARD = xung lò phản ứng, TEMPEST = mưa tên lửa vệ tinh.
function checkUlt(label, kind) {
  let f = 0;
  while (f++ < 60 * 30) {
    const T = game.titan;
    const K = game.kaiju;
    ['KeyA', 'KeyD', 'KeyS', 'KeyL'].forEach(release);
    if (K && !K.dying && K.state !== 'emerge' && !T.arms.R && !T.arms.L && !T.charge && !T.leap && !T.slide && !T.beaming) break;
    step(1);
  }
  const T = game.titan;
  const K = game.kaiju;
  T.link = 100;
  T.x = K.x - K.half - 200;
  const hp0 = K.hp;
  press('KeyF'); press('KeyJ'); step(1); release('KeyF'); release('KeyJ');
  assert(T.beaming && T.def.ult === kind, `${label}: Link 100% + đồng bộ → tung chiêu đặc biệt (${T.def.ultName})`);
  if (kind === 'orbital') assert(game.strikes.length === 6, `${label}: gọi 6 tên lửa vệ tinh`);
  f = 0;
  while (T.beaming && f++ < 60 * 5) { K.cooldown = Math.max(K.cooldown, 1); step(1); }
  assert(!T.beaming && game.kaiju.hp < hp0, `${label}: chiêu đặc biệt gây ${Math.round(hp0 - game.kaiju.hp)} sát thương rồi kết thúc`);
}

// Link chạm 100% → giữ 5 giây (trúng đòn không mất), hết giờ mà chưa dùng thì tụt.
function checkLinkHold(label) {
  let f = 0;
  while (f++ < 60 * 30) {
    const T = game.titan;
    const K = game.kaiju;
    ['KeyA', 'KeyD', 'KeyS', 'KeyL'].forEach(release);
    if (K && !K.dying && K.state !== 'emerge' && !T.arms.R && !T.arms.L && !T.charge && !T.leap && !T.slide && !T.beaming) break;
    step(1);
  }
  const T = game.titan;
  const K = game.kaiju;
  T.x = K.x - K.half - 500;
  const kx = K.x;
  T.link = 95;
  T.linkHold = 0;
  // bấm F + J cùng lúc (lặp lại nếu khung hình bị nuốt bởi hitstop)
  for (let i = 0; i < 30 && !T.arms.L; i++) { press('KeyF'); press('KeyJ'); step(1); release('KeyF'); release('KeyJ'); }
  assert(T.link === 100 && T.linkHold > 4.9, `${label}: Link chạm 100% → khóa ${T.linkHold.toFixed(1)}s`);
  for (let i = 0; i < 60; i++) { K.cooldown = 5; K.x = kx; step(1); }
  testHook.hitTitan(5, 0, 1, { linkDrain: 20 });
  for (let i = 0; i < 60 * 3; i++) { K.cooldown = 5; K.x = kx; step(1); }
  assert(T.link === 100, `${label}: trong 5s bị trúng đòn vẫn giữ Link 100%`);
  for (let i = 0; i < 60 * 1.2; i++) { K.cooldown = 5; K.x = kx; step(1); }
  assert(T.link < 100 && T.linkHold === 0, `${label}: hết 5s chưa dùng chiêu → Link tụt (${Math.round(T.link)}%)`);
}

function checkSpecial(label, gapFromRange = -20) {
  let f = 0;
  while (f++ < 60 * 30) {
    const T = game.titan;
    const K = game.kaiju;
    ['KeyA', 'KeyD', 'KeyS', 'KeyL'].forEach(release);
    if (K && !K.dying && K.state !== 'emerge' && !T.arms.R && !T.arms.L && !T.charge && !T.leap && !T.slide && !T.beaming) break;
    step(1);
  }
  const T = game.titan;
  const K = game.kaiju;
  T.energy = 100;
  const RANGE = 2 * 450 * 0.64; // 2 lần chiều cao Titan
  T.x = K.x - K.half - (RANGE + gapFromRange); // mép thân quái cách Titan đúng (tầm + gapFromRange)
  K.cooldown = 5;
  const hp0 = K.hp;
  press('KeyI'); release('KeyI');
  f = 0;
  const x0 = T.x;
  const kx = K.x;
  // giữ quái đứng yên & không ra đòn để đo đúng tầm lúc chiêu được tung ra
  do { K.cooldown = Math.max(K.cooldown, 1); if (!game.kaiju.dying && game.kaiju.hp === hp0) K.x = kx; step(1); } while ((T.arms.R || T.leap || T.slide) && f++ < 300);
  step(10);
  if (gapFromRange > 0) {
    assert(game.kaiju.hp === hp0, `${label}: ngoài tầm ${Math.round(RANGE)}px (+${gapFromRange}px) thì chiêu I hụt`);
    return;
  }
  assert(game.kaiju.hp < hp0, `${label}: chiêu I trúng chắc chắn ở mép tầm ${Math.round(RANGE)}px (-${Math.round(hp0 - game.kaiju.hp)} HP)`);
  const blade = T.def.moves.blade || { range: 320 };
  const dx = Math.abs(game.kaiju.x - T.x);
  assert(dx < blade.range + game.kaiju.half, `${label}: sau chiêu I đứng sát quái, trong tầm chém K (${Math.round(dx)} < ${Math.round(blade.range + game.kaiju.half)})`);
}
checkSpecial('VANGUARD');
checkSpecialInterrupt('VANGUARD');
checkUlt('VANGUARD', 'reactor');
checkLinkHold('VANGUARD');
checkSpecial('VANGUARD', 60);

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
    assert(game.titan.maxHp === game.titan.def.hp + 30 * game.upgrades.armor, 'nâng cấp giáp được áp dụng');
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

// Chọn TEMPEST, chơi đợt 1: lưỡi kép cổ tay + tên lửa ngực.
press('Enter'); step(1); release('Enter');
step(20);
press('KeyD'); step(1); release('KeyD');
assert(game.pick === 1, 'D chuyển sang Titan thứ hai');
press('Enter'); step(1); release('Enter');
assert(game.state === 'fight' && game.titan.def.id === 'tempest' && game.titan.maxHp === 115, 'chọn TEMPEST, HP 115');
checkSpecial('TEMPEST');
checkSpecialInterrupt('TEMPEST');
checkUlt('TEMPEST', 'orbital');
checkSpecial('TEMPEST', 60);
let sawMissile = 0;
let sawWrist = false;
{
  // Bot riêng cho TEMPEST: thử lần lượt đập phản lực (I) → 6 tên lửa (giữ L đủ 2s) → lưỡi kép (K).
  let f = 0;
  let holdingL = false;
  while (game.state === 'fight' && f < 60 * 240) {
    f++;
    const TT = game.titan;
    const KK = game.kaiju;
    ['KeyA', 'KeyD', 'KeyS'].forEach(release);
    if (KK && !KK.dying && KK.state !== 'emerge') {
      const dist = Math.abs(KK.x - TT.x);
      const busy = TT.arms.R || TT.leap;
      if (!TT.leapHits) {
        if (!busy && TT.energy >= 25) { press('KeyI'); release('KeyI'); }
        else if (dist > 260) press(KK.x > TT.x ? 'KeyD' : 'KeyA');
      } else if (!sawMissile) {
        // giữ quái không ra đòn trong lúc kiểm tra nạp đủ 2s (bot không biết né)
        KK.cooldown = Math.max(KK.cooldown, 0.5);
        // đang giữ L mà phát nạp đã mất (bị đánh trúng) → nhả ra để thử lại
        if (holdingL && !TT.charge) { release('KeyL'); holdingL = false; }
        else if (holdingL && TT.charge.full) { release('KeyL'); holdingL = false; }
        // lùi ra xa tầm vuốt/quật đuôi rồi mới đứng nạp 2s
        else if (!holdingL && dist < 450) press(KK.x > TT.x ? 'KeyA' : 'KeyD');
        else if (!holdingL && !busy && !TT.charge && TT.energy >= 60 && TT.missileCD <= 0) { release('KeyL'); press('KeyL'); holdingL = 'starting'; }
      } else if (!sawWrist) {
        if (dist > 220) press(KK.x > TT.x ? 'KeyD' : 'KeyA');
        else if (!busy && !TT.charge) { press('KeyK'); release('KeyK'); }
      } else {
        botFrame(f);
      }
    }
    step(1);
    if (holdingL === 'starting') holdingL = true;
    sawMissile = Math.max(sawMissile, game.projectiles.filter((p) => p.missile).length);
    const a = game.titan.arms.R;
    if (a && a.name === 'blade' && a.fired) sawWrist = true;
  }
  release('KeyL');
}
assert(sawMissile === 6, `TEMPEST phóng loạt tên lửa (${sawMissile} quả cùng lúc)`);
assert(sawWrist, 'TEMPEST chém bằng lưỡi kép');
assert(game.titan.leapHits > 0, `TEMPEST đập phản lực (I) trúng đầu quái (${game.titan.leapHits} lần)`);
console.log(`${game.state === 'clear' ? 'ok  ' : 'note'} - TEMPEST đợt 1 kết thúc: ${game.state}`);
assert(audioStats.started > 2000, `nhạc nền và hiệu ứng âm thanh chạy (${audioStats.started} nốt/âm)`);
console.log('\nTất cả smoke test đều qua.');
