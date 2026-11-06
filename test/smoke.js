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
// Phim xuất kích sau khi chọn Titan / giữa các đợt: bỏ qua bằng ENTER.
function skipDeploy(label = '') {
  if (game.state !== 'deploy') { console.error('FAIL: không vào phim xuất kích', label, game.state); process.exit(1); }
  step(25);
  fire('keydown', 'Enter'); step(1); fire('keyup', 'Enter');
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
assert(game.state === 'deploy' && game.deploy.full && game.deploy.t === 0, 'chọn Titan → phim xuất kích đầy đủ (giáp, buồng lái, máy bay)');
{
  // xem hết phim, không bỏ qua: phải tự vào trận
  let f = 0;
  const seen = new Set();
  while (game.state === 'deploy' && f++ < 60 * 30) {
    step(1);
    if (game.deploy) seen.add(game.deploy.t < 6.5 ? 'giáp' : game.deploy.t < 10.5 ? 'buồng lái' : 'máy bay');
  }
  assert(seen.size === 3 && f > 60 * (testHook.DEPLOY_END - 1), `phim chạy đủ 3 cảnh (${[...seen].join(', ')}, ${(f / 60).toFixed(1)}s)`);
}
assert(game.state === 'fight' && game.wave === 0 && game.titan.def.id === 'vanguard', 'hết phim → bắt đầu đợt 1 với VANGUARD');

// Bot chơi khá (test/bots.js): phản đòn, né lao húc, đồng bộ đúng nhịp.
const { makeSkilledBot } = require('./bots');
const skilled = makeSkilledBot();
const botIo = { press, release, rand: Math.random };
function botFrame(frame) { skilled(game, botIo, frame); }

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
  const kx = K.x;
  const syncFJ = (link) => {
    // chờ hết thời gian hồi đồng bộ, đặt Link nếu cần
    for (let i = 0; i < 62; i++) { K.cooldown = 5; K.x = kx; step(1); }
    if (link != null) { T.link = link; T.linkHold = 0; }
    // bấm F + J cùng lúc (lặp lại nếu khung hình bị nuốt bởi hitstop), rồi chờ đòn ra xong
    for (let i = 0; i < 30 && !T.arms.L; i++) { press('KeyF'); press('KeyJ'); step(1); release('KeyF'); release('KeyJ'); }
    for (let i = 0; i < 40 && (T.arms.L || T.arms.R); i++) { K.cooldown = 5; K.x = kx; step(1); }
  };
  // đồng bộ nhưng đứng ngoài tầm → hụt → không cộng Link
  T.x = K.x - K.half - 500;
  const sc0 = T.syncCount;
  syncFJ(70);
  assert(T.syncCount === sc0 + 1 && T.link <= 70, `${label}: đồng bộ đánh hụt → Link không tăng (${Math.round(T.link)}%)`);
  // đồng bộ F+J trong tầm → trúng → Link +6 (cặp có đòn nặng mới +12)
  T.x = K.x - K.half - 100;
  syncFJ(70);
  assert(T.link > 74 && T.link <= 76, `${label}: đồng bộ F+J đánh trúng → Link +6 (${Math.round(T.link)}%)`);
  // đồng bộ lần nữa ngay lập tức (chưa hết thời gian hồi) → không tính là đồng bộ
  const sc1 = T.syncCount;
  for (let i = 0; i < 30 && !T.arms.L; i++) { press('KeyF'); press('KeyJ'); step(1); release('KeyF'); release('KeyJ'); }
  assert(T.syncCount === sc1 && !T.syncPending, `${label}: đồng bộ khi đang hồi không được tính, cũng không bị trừ Link`);
  syncFJ(95);
  assert(T.link === 100 && T.linkHold > 4.5, `${label}: Link chạm 100% → khóa ${T.linkHold.toFixed(1)}s`);
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
    press('KeyS'); step(1); release('KeyS');
    assert(game.upgrades.armor === lvl && game.scrap === before, `S giảm cấp giáp, hoàn đủ phế liệu (${before})`);
    press('KeyD'); step(1); release('KeyD');
    press('KeyS'); step(1); release('KeyS');
    assert(game.shopSel === 1 && game.scrap === before, 'giảm cấp khi đang cấp 0 thì không được gì');
    press('KeyA'); step(1); release('KeyA');
    press('KeyW'); step(1); release('KeyW');
    assert(game.upgrades.armor === lvl + 1, 'W nâng lại cấp giáp');
    step(30);
    press('Enter'); step(1); release('Enter');
    assert(game.state === 'deploy' && !game.deploy.full, 'ra đợt mới: chỉ chiếu cảnh máy bay đưa Titan');
    skipDeploy('đợt mới');
    assert(game.state === 'fight' && game.wave === wave + 1, `bắt đầu đợt ${wave + 2}`);
    assert(game.titan.maxHp === game.titan.def.hp + 30 * game.upgrades.armor, 'nâng cấp giáp được áp dụng');
  }
}
assert(game.state === 'win', 'hoàn thành chiến dịch');
assert(sawSync, 'có đòn đồng bộ');
console.log(sawBeam ? 'ok  - TIDEBREAKER đã được kích hoạt trong chiến dịch' : 'note - bot chưa đầy Link trong chiến dịch (chiêu đặc biệt đã kiểm tra riêng ở checkUlt)');
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
skipDeploy('tempest');
assert(game.state === 'fight' && game.titan.def.id === 'tempest' && game.titan.maxHp === 125, 'chọn TEMPEST, HP 125');
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
// ===== Menu, huấn luyện, Đua thời gian, Đấu tự do =====
const tapKey = (c) => { press(c); step(1); release(c); };
['KeyA', 'KeyD', 'KeyS', 'KeyL', 'KeyF', 'KeyJ', 'KeyK'].forEach(release);
function killKaiju() {
  let f = 0;
  while (game.kaiju.state === 'emerge' && f++ < 600) step(1);
  game.kaiju.hp = 1;
  testHook.damageKaiju(50, 0, false, game.kaiju.x, 300, 1);
  f = 0;
  while (game.state === 'fight' && f++ < 60 * 8) step(1);
}
function killTitan() {
  let f = 0;
  while (game.state === 'fight' && f++ < 60 * 6) {
    game.titan.inv = 0;
    game.titan.guard = false;
    testHook.hitTitan(500, 0, 1);
    step(1);
  }
}

testHook.toTitle(); step(2);
assert(game.state === 'title' && game.menu === 0, 'menu chính: mặc định chọn CHIẾN DỊCH');
tapKey('KeyS');
assert(game.menu === 1, 'S chuyển xuống ĐUA THỜI GIAN');
tapKey('KeyW'); tapKey('KeyW');
assert(game.menu === 4, 'W ở đầu danh sách thì vòng xuống mục cuối (CÀI ĐẶT)');
tapKey('Enter');
assert(game.settingsOpen && game.state === 'title', 'ENTER ở CÀI ĐẶT mở bảng âm thanh');
{
  const cfg = testHook.audioCfg;
  const m0 = cfg.music;
  tapKey('KeyA');
  assert(Math.abs(cfg.music - (m0 - 0.1)) < 1e-9, `A giảm nhạc nền (${Math.round(m0 * 100)}% → ${Math.round(cfg.music * 100)}%)`);
  tapKey('KeyS');
  const s0 = cfg.sfx;
  tapKey('KeyA'); tapKey('KeyA');
  assert(Math.abs(cfg.sfx - (s0 - 0.2)) < 1e-9, `A giảm hiệu ứng (${Math.round(s0 * 100)}% → ${Math.round(cfg.sfx * 100)}%)`);
  assert(Math.abs(testHook.sfxGain() - 0.45 * cfg.sfx) < 1e-9, 'âm lượng hiệu ứng áp dụng vào bus WebAudio');
  tapKey('KeyS'); tapKey('Enter');
  assert(cfg.muted && testHook.sfxMuted(), 'bật TẮT TIẾNG');
  tapKey('KeyM');
  assert(!cfg.muted && !testHook.sfxMuted(), 'phím M đồng bộ với cài đặt tắt tiếng');
  tapKey('Escape');
  assert(!game.settingsOpen && game.state === 'title', 'ESC đóng cài đặt, vẫn ở menu');
}
tapKey('Digit2');
assert(game.menu === 1, 'phím số chọn nhanh chế độ');
tapKey('KeyH');
assert(game.showHelp, 'H mở hướng dẫn ở menu');
tapKey('Escape');
assert(!game.showHelp && game.state === 'title', 'ESC đóng hướng dẫn, vẫn ở menu');

// Huấn luyện phi công: xem chiêu thức + chỉ số, không đánh quái
game.titanIdx = 0;
tapKey('Digit4');
assert(game.menu === 3, 'phím 4: HUẤN LUYỆN PHI CÔNG');
tapKey('Enter');
assert(game.state === 'training' && game.train.idx === 0 && !game.kaiju, 'vào màn huấn luyện (không có quái)');
step(30);
for (let i = 0; i < 10; i++) { tapKey('KeyS'); step(20); }
assert(game.train.idx === 0, 'S đi hết 10 chiêu rồi vòng lại');
tapKey('Digit6');
assert(game.train.idx === 5, 'phím số chọn nhanh chiêu');
tapKey('KeyD'); step(30);
assert(game.train.titan === 1, 'D đổi sang TEMPEST');
for (const def of testHook.TITANS) {
  const moves = testHook.trainMoves(def);
  assert(moves.length === 10 && moves.every((m) => m.name && m.key && m.desc && m.stats.length > 0),
    `${def.id}: đủ 10 chiêu, mỗi chiêu có phím, mô tả, chỉ số`);
  const blade = moves.find((m) => m.clip === 'blade');
  const want = (def.moves.blade || { dmg: 24 }).dmg;
  assert(blade.dmg === want && blade.stats[0][1] === String(want), `${def.id}: chỉ số K lấy từ số liệu chiến đấu (${want})`);
}
{
  // diễn từng chiêu của cả hai Titan trên sân khấu (bắt lỗi vẽ)
  for (let ti = 0; ti < 2; ti++) {
    for (let i = 0; i < 10; i++) {
      game.train.titan = ti; game.train.idx = i; game.train.t = 0;
      step(150);
    }
  }
  console.log('ok  - diễn đủ 10 chiêu × 2 Titan trên sân khấu huấn luyện');
}
tapKey('Space');
const tFrozen = game.train.t;
step(30);
assert(game.train.t === tFrozen, 'SPACE tạm dừng chuyển động');
tapKey('Escape');
assert(game.state === 'title' && game.titanIdx === 1, 'ESC về menu, giữ Titan đang xem');
game.titanIdx = 0;

// Tạm dừng → thoát về menu chính (cần xác nhận 2 lần)
testHook.toTitle(); step(2);
tapKey('Digit1'); tapKey('Enter'); step(20); tapKey('Enter');
skipDeploy('chiến dịch');
assert(game.state === 'fight' && game.mode === 'campaign', 'vào trận chiến dịch');
tapKey('Escape');
assert(game.state === 'paused' && game.pauseIdx === 0, 'ESC trong trận mở menu tạm dừng');
tapKey('Enter');
assert(game.state === 'fight', 'TIẾP TỤC quay lại trận');
tapKey('KeyP');
tapKey('KeyS');
tapKey('Enter');
assert(game.settingsOpen && game.state === 'paused', 'mở cài đặt âm thanh từ menu tạm dừng');
tapKey('Escape');
assert(!game.settingsOpen && game.state === 'paused', 'đóng cài đặt quay lại menu tạm dừng');
tapKey('KeyW'); tapKey('KeyW');
assert(game.pauseIdx === 4, 'W vòng lên mục cuối: THOÁT VỀ MENU CHÍNH');
tapKey('Enter');
assert(game.state === 'paused' && game.pauseConfirm === 'quit', 'bấm THOÁT lần 1 chỉ hỏi xác nhận');
tapKey('KeyW'); tapKey('KeyS');
assert(game.pauseConfirm === null, 'chuyển mục thì hủy xác nhận');
tapKey('Enter'); tapKey('Enter');
assert(game.state === 'title', 'bấm THOÁT lần 2 về menu chính');
// Thoát từ xưởng nâng cấp
tapKey('Enter'); step(20); tapKey('Enter');
skipDeploy('thoát từ xưởng');
killKaiju(); step(60); tapKey('Enter');
assert(game.state === 'upgrade', 'vào xưởng sau đợt 1');
tapKey('Escape');
assert(game.state === 'paused' && game.pauseFrom === 'upgrade', 'ESC ở xưởng mở menu tạm dừng');
tapKey('KeyW'); tapKey('Enter'); tapKey('Enter');
assert(game.state === 'title', 'thoát từ xưởng về menu chính');

// Đua thời gian
testHook.toTitle(); step(2);
tapKey('Digit2'); tapKey('Enter');
assert(game.state === 'select' && game.mode === 'rush', 'chọn ĐUA THỜI GIAN');
step(20); tapKey('Enter');
skipDeploy('đua thời gian');
for (let w = 0; w < 3; w++) {
  assert(game.state === 'fight' && game.wave === w, `đua thời gian: đợt ${w + 1}`);
  killKaiju();
  assert(game.state === 'clear', `đua thời gian: hạ đợt ${w + 1} (tổng ${game.result.runTime.toFixed(1)}s)`);
  const frozen = game.runTime;
  step(60);
  assert(game.runTime === frozen, 'đua thời gian: đồng hồ dừng ở màn tổng kết');
  tapKey('Enter');
}
assert(game.state === 'win' && testHook.records.rush > 0, `đua thời gian: về đích, lưu kỷ lục ${testHook.records.rush.toFixed(1)}s`);
step(70); tapKey('Enter');
assert(game.state === 'title', 'đua thời gian: ENTER về menu');

// Đấu tự do
tapKey('Digit3'); tapKey('Enter');
assert(game.state === 'duel', 'chọn ĐẤU TỰ DO → màn chọn quái');
step(20);
tapKey('KeyD'); tapKey('KeyD');
tapKey('KeyS'); tapKey('KeyD');
assert(game.duel.kaiju === 2 && game.duel.diff === 2, 'đấu tự do: chọn LEVIATHRAX, độ khó KHÓ');
tapKey('Enter');
assert(game.state === 'select', 'đấu tự do: sang chọn Titan');
tapKey('Escape');
assert(game.state === 'duel', 'đấu tự do: ESC ở chọn Titan quay lại chọn quái');
step(20); tapKey('Enter'); step(20); tapKey('Enter');
skipDeploy('đấu tự do');
assert(game.state === 'fight' && game.kaiju.def.name === 'LEVIATHRAX' && game.kaiju.maxHp === Math.round(860 * 1.35), `đấu tự do: đấu LEVIATHRAX HP ${game.kaiju.maxHp}`);
killKaiju();
assert(game.state === 'clear' && testHook.records.duel['2-2'], 'đấu tự do: thắng được đánh dấu');
step(60); tapKey('Enter');
assert(game.state === 'win', 'đấu tự do: màn chiến thắng');
step(70); tapKey('Enter');
assert(game.state === 'duel', 'đấu tự do: ENTER để đấu trận khác');

{
  // sấm chớp: tạo tia sét, có nhánh, làm sáng trời, tự tắt sau ~0,5s
  const n0 = testHook.bolts.length;
  testHook.spawnBolt();
  const b = testHook.bolts[testHook.bolts.length - 1];
  assert(testHook.bolts.length === n0 + 1 && b.main.length >= 12 && b.branches.length >= 1 && game.lightning > 0.4,
    `sấm chớp: tia sét ${b.main.length} đoạn, ${b.branches.length} nhánh, trời sáng ${game.lightning.toFixed(2)}`);
  step(45);
  assert(!testHook.bolts.includes(b), 'sấm chớp: tia sét tắt sau chưa tới 1 giây');
  let seen = 0;
  for (let i = 0; i < 60 * 25; i++) { step(1); if (testHook.bolts.length) seen++; }
  assert(seen > 0, 'sấm chớp ngẫu nhiên tự xuất hiện trong 25 giây');
}
assert(audioStats.started > 2000, `nhạc nền và hiệu ứng âm thanh chạy (${audioStats.started} nốt/âm)`);
console.log('\nTất cả smoke test đều qua.');
