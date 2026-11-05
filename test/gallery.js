// Kiểm tra bộ vẽ xem mẫu không khởi động game, và mọi động tác đều vẽ được hai hướng.
// Chạy: node test/gallery.js
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const noop = () => {};
const gradient = { addColorStop: noop };
let depth = 0;
const ctx = new Proxy({}, {
  get(target, key) {
    if (key in target) return target[key];
    if (key === 'save') return () => depth++;
    if (key === 'restore') return () => { depth--; assert(depth >= 0, 'restore phải có save tương ứng'); };
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return (...args) => { assert(args.every(Number.isFinite)); return gradient; };
    if (key === 'ellipse') return (x, y, rx, ry) => assert([x, y, rx, ry].every(Number.isFinite) && rx >= 0 && ry >= 0);
    if (key === 'measureText') return text => ({ width: String(text).length * 8 });
    return noop;
  },
  set(target, key, value) { target[key] = value; return true; },
});
const canvas = { width: 1200, height: 780, style: {}, getContext: () => ctx };
let frames = 0;
const sandbox = {
  console, Math, Set, Map, Float32Array,
  document: { getElementById: () => canvas },
  performance: { now: () => 0 }, requestAnimationFrame: () => frames++,
  addEventListener: noop, innerWidth: 1280, innerHeight: 720,
  __TITAN_GALLERY__: true,
};
sandbox.window = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/game.js'), 'utf8'), sandbox);
assert.equal(frames, 0, 'trang mẫu không chạy vòng lặp chiến đấu');
assert.equal(sandbox.TitanGallery.clips.length, 12);
const specs = sandbox.TitanGallery.specs;
const headHeight = s => (s.crown + s.sole) * s.scale;
assert.equal(specs.vanguard.heightM, 80);
assert.equal(specs.tempest.heightM, 80);
assert.equal(specs.vanguard.massTonnes, 2400);
assert.equal(specs.tempest.massTonnes, 1850);
assert(Math.abs(headHeight(specs.vanguard) - headHeight(specs.tempest)) < 1e-9,
  'hai Titan phải cao bằng nhau từ đế chân đến đỉnh đầu');
let poses = 0;
for (const id of ['vanguard', 'tempest']) {
  for (const clip of sandbox.TitanGallery.clips) {
    for (const t of [0, 0.08, 0.18, 0.4, 0.7, 1.1, 1.4, 1.7, 2.05, 2.4, 2.8, 3.5]) {
      for (const direction of [-1, 1]) {
        sandbox.TitanGallery.draw(canvas, id, clip, t, direction);
        assert.equal(depth, 0, `${id}/${clip}/${t}: cân bằng save/restore`);
        poses++;
      }
    }
  }
  const html = fs.readFileSync(path.join(__dirname, '../titans', id + '.html'), 'utf8');
  assert(html.includes('data-titan="' + id + '"'));
  assert(html.includes('../src/game.js'), 'HTML phải dùng chung bộ vẽ trong game');
}
console.log(`ok - ${poses} tư thế/hướng; 12 động tác mỗi Titan; không chạy vòng lặp chiến đấu`);
