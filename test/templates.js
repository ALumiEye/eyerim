// KHÓA TEMPLATE 4 ĐỘNG TÁC CHUNG (Đứng im, Bước đi, Ăn mừng, Trúng đòn) cho MỌI Titan, kể cả Titan thêm sau này.
// Tự nạp mọi bộ vẽ trong titans/ (trừ gallery.js và *-controls.js); mỗi bộ vẽ đăng ký window.EyeRim<Tên>
// phải đọc thẳng template trong src/game.js và chỉ quy đổi tỷ lệ bằng templateRatio(scale).
// Chạy: node test/templates.js
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const noop = () => {};
const ctx = new Proxy({}, {
  get(target, key) {
    if (key in target) return target[key];
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (key === 'measureText') return text => ({ width: String(text).length * 8 });
    return noop;
  },
  set(target, key, value) { target[key] = value; return true; },
});
const canvas = { width: 1200, height: 780, style: {}, getContext: () => ctx };
const sandbox = {
  console, Math, Set, Map, Float32Array,
  document: { getElementById: () => canvas }, performance: { now: () => 0 },
  requestAnimationFrame: noop, addEventListener: noop, innerWidth: 1280, innerHeight: 720,
  __TITAN_GALLERY__: true,
};
sandbox.window = sandbox;
const root = path.join(__dirname, '..');
const gameSource = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8');
vm.runInNewContext(gameSource, sandbox);
const drawerFiles = fs.readdirSync(path.join(root, 'titans'))
  .filter(f => f.endsWith('.js') && f !== 'gallery.js' && !f.endsWith('-controls.js')).sort();
for (const file of drawerFiles) vm.runInNewContext(fs.readFileSync(path.join(root, 'titans', file), 'utf8'), sandbox);

const G = sandbox.TitanGallery;
for (const key of ['idlePreview', 'walkPreview', 'celebrationPreview', 'staggerPreview', 'legTemplate', 'templateRatio', 'celebrationCamera']) {
  assert(G[key] !== undefined, `src/game.js phải xuất template ${key}`);
}
// Vanguard/Tempest trong game cũng chạy qua đúng các template này (không chép công thức ra chỗ khác).
for (const use of ['walkTemplate(T.walkT)', 'idleTemplate(game.t).bob', 'idleTemplate(game.t).breathe[side]',
  'celebrationTemplate(T.celebrate, game.t)']) {
  assert(gameSource.includes(use), `Vanguard/Tempest phải dùng template: ${use}`);
}

const drawers = Object.keys(sandbox).filter(k => /^EyeRim[A-Z]/.test(k) && k !== 'EyeRimCore');
assert(drawers.length >= 2, 'tìm thấy bộ vẽ Titan trong titans/');
const near = (a, b, msg) => assert(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`);
const required = ['scale', 'walkPose', 'walkPeriod', 'idlePose', 'celebrationPose', 'staggerPose', 'legKnee', 'legHips'];
const times = [0, .07, .2, .3, .35, .5, .725, .9, 1.11, 1.6, 2.4, 2.9, 4.2];
for (const name of drawers) {
  const D = sandbox[name], id = name.slice(6).toLowerCase();
  for (const key of required) assert(D[key] !== undefined, `${id}: bộ vẽ phải xuất ${key} (xem "Template chuyển động chung" trong AGENTS.md)`);
  const r = G.templateRatio(D.scale);
  assert(Math.abs(D.walkPeriod - Math.PI * 2 / 6.5) < 1e-12, `${id}: chu kỳ bước như Vanguard`);
  for (const t of times) {
    // ĐỨNG IM
    const idle = G.idlePreview(t), ip = D.idlePose(t);
    near(ip.bob, idle.bob * r, `${id} đứng im: thân thở`);
    near(ip.far, idle.breathe.L * r, `${id} đứng im: tay xa thở`);
    near(ip.near, idle.breathe.R * r, `${id} đứng im: tay gần thở lệch pha`);
    // BƯỚC ĐI
    const walk = G.walkPreview(t), wp = D.walkPose(t);
    near(wp.stride, walk.stride, `${id} bước đi: nhịp`);
    near(wp.bob, walk.bob * r, `${id} bước đi: nhún`);
    for (const side of ['far', 'near']) {
      near(wp[side].x, walk[side].x * r, `${id} bước đi: sải ${side}`);
      near(wp[side].lift, walk[side].lift, `${id} bước đi: nhấc ${side}`);
    }
    // ĂN MỪNG
    const cel = G.celebrationPreview(t), cp = D.celebrationPose(t);
    for (const key of ['spin', 'lean', 'thrust']) near(cp[key], cel[key], `${id} ăn mừng: ${key}`);
    near(cp.crouch, cel.crouch * r, `${id} ăn mừng: khuỵu`);
    near(cp.feetFar, cel.feetFar * r, `${id} ăn mừng: dang chân xa`);
    near(cp.feetNear, cel.feetNear * r, `${id} ăn mừng: dang chân gần`);
    near(cp.air * D.scale, cel.air, `${id} ăn mừng: độ cao nhảy (đơn vị game)`);
    for (const key of ['farUpper', 'farLower', 'nearUpper', 'nearLower']) assert(Number.isFinite(cp[key]), `${id} ăn mừng: góc tay ${key}`);
    // TRÚNG ĐÒN
    const hit = G.staggerPreview(t), sp = D.staggerPose(t);
    near(sp.lean, hit.lean, `${id} trúng đòn: ngả lùi`);
    near(sp.crouch, hit.crouch * r, `${id} trúng đòn: khuỵu`);
    assert.equal(sp.flash, hit.flash, `${id} trúng đòn: nhịp lóe`);
    for (const side of ['far', 'near']) assert([sp[side].upper, sp[side].lower].every(Number.isFinite), `${id} trúng đòn: tay ${side}`);
  }
  // CHÂN: gối IK chiều dài cố định, luôn gập ra trước (như ik() của Vanguard/Tempest) cho mọi động tác.
  for (const [hx, hy] of D.legHips) {
    const lengths = [];
    for (const [dx, dy] of [[-50, 240], [40, 230], [0, 200], [30, 180], [-20, 215]]) {
      const [kx, ky] = D.legKnee(hx, hy, hx + dx, hy + dy);
      lengths.push(Math.hypot(kx - hx, ky - hy));
      assert(kx > hx + dx * (ky - hy) / dy + 5, `${id}: gối gập ra trước đường hông–bàn chân`);
    }
    assert(lengths.every(l => Math.abs(l - lengths[0]) < 1e-9), `${id}: đùi giữ nguyên chiều dài ở mọi tư thế`);
  }
  // Vẽ được cả 4 động tác, hai hướng.
  for (const clip of ['idle', 'walk', 'celebrate', 'stagger']) for (const t of [0, .5, 1.3]) for (const f of [-1, 1]) G.draw(canvas, id, clip, t, f);
  console.log(`ok - ${id}: Đứng im, Bước đi, Ăn mừng, Trúng đòn theo đúng template chung`);
}
