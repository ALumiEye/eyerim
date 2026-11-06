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
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../titans/bastion.js'), 'utf8'), sandbox);
assert.equal(frames, 0, 'trang mẫu không chạy vòng lặp chiến đấu');
assert.equal(sandbox.TitanGallery.clips.length, 12);
for (const [clip, key] of Object.entries({ guard: 'S', dash: 'W', jab: 'F', hook: 'J', blade: 'K', cannon: 'L', special: 'I' })) {
  assert(sandbox.TitanGallery.names.bastion[clip].startsWith(key + ' · '), `Bastion/${clip} phải khớp nút ${key} của hai Titan cũ`);
}
const { punchPose, punchTimings } = sandbox.TitanGallery;
for (const [clip, expected] of Object.entries({ jab: [.07, .08, .16], hook: [.1, .08, .22] })) {
  const m = punchTimings[clip];
  assert.deepEqual([m.windup, m.active, m.recover], expected, `${clip}: nhịp F/J khớp Vanguard`);
  const duration = m.windup + m.active + m.recover;
  assert.equal(punchPose(clip, 0), 0);
  assert.equal(punchPose(clip, m.windup), 1, 'ra đòn nhanh tới hết tầm');
  assert.equal(punchPose(clip, duration + .001), 0, 'thu tay xong đúng nhịp');
  assert(punchPose(clip, duration + m.pause + m.windup / 2) > 0, 'vòng tiếp theo không phải chờ 2,4 giây');
  assert(Math.abs(punchPose(clip, 6.001) - punchPose(clip, 6.001 + duration + m.pause)) < 1e-10, 'không reset chu kỳ ở mốc 6 giây');
}
const { hammerPose, hammerPeriod } = sandbox.TitanGallery;
assert.equal(sandbox.TitanGallery.names.bastion.blade, 'K · Búa móc lên');
assert.equal(hammerPose(0).morph, 0);
assert.equal(hammerPose(.3).morph, 1, 'búa khóa xong trước khi móc lên');
assert.equal(hammerPose(.52).morph, 1, 'giữ khối búa khi đánh');
assert.equal(hammerPose(1.2).morph, 0, 'thu giáp về bàn tay');
const handPosition = pose => ({
  x: 38 + Math.cos(pose.upper) * 80 + Math.cos(pose.lower) * (109 + pose.extension),
  y: -428 + Math.sin(pose.upper) * 80 + Math.sin(pose.lower) * (109 + pose.extension),
});
const lowHammer = handPosition(hammerPose(.3));
const highHammer = handPosition(hammerPose(.42));
const previousPeak = {
  x: 38 + Math.cos(.35) * 80 + Math.cos(-1.23) * 109,
  y: -428 + Math.sin(.35) * 80 + Math.sin(-1.23) * 109,
};
assert(highHammer.x > previousPeak.x + 30 && highHammer.y < previousPeak.y - 35,
  'K mới đạt đỉnh ở .42s, cao và xa hơn đòn cũ');
assert.equal(hammerPose(.42).extension, 22);
assert.equal(hammerPose(.78).extension, 0, 'ray cổ tay thu về hết sau đòn');
assert(lowHammer.x > 100 && highHammer.x > 100, 'tay trái vươn ra ngoài thân');
assert(highHammer.y < lowHammer.y - 180, 'K móc từ dưới lên, không đập xuống');
for (const t of [0, .12, .3, .42, .52, .75, 1.05, 1.2, 6.001]) {
  const pose = hammerPose(t), repeat = hammerPose(t + hammerPeriod);
  for (const key of ['morph', 'upper', 'lower', 'extension']) assert(Math.abs(pose[key] - repeat[key]) < 1e-10);
  for (const direction of [-1, 1]) {
    sandbox.TitanGallery.draw(canvas, 'bastion', 'blade', t, direction);
    assert.equal(depth, 0, `K/${t}/${direction}: biến hình cân bằng save/restore`);
  }
}
const { missileVolley } = sandbox.TitanGallery;
assert.equal(sandbox.TitanGallery.names.bastion.cannon, 'L · Tên lửa kép');
assert.equal(missileVolley(.99).length, 0, 'chưa phóng khi pháo đang nâng');
assert.equal(missileVolley(1.8).length, 0, 'tên lửa bay khỏi sân khấu rồi kết thúc');
for (const t of [1.02, 1.08, 1.25, 1.5]) {
  const volley = missileVolley(t);
  assert.equal(volley.length, 2, 'L phóng đúng hai quả cùng lúc');
  assert.equal(volley[0].age, volley[1].age);
  assert(Math.abs(volley[0].y - volley[1].y) > 40, 'hai thân tên lửa tách rõ nhau');
  const next = missileVolley(t + .01);
  for (let i = 0; i < 2; i++) {
    assert(next[i].x > volley[i].x, 'tên lửa bay về phía trước');
    assert(Math.abs(volley[i].x - missileVolley(t + 2.4)[i].x) < 1e-9, 'tua/vòng lặp không nhân số đạn');
  }
  for (const direction of [-1, 1]) {
    sandbox.TitanGallery.draw(canvas, 'bastion', 'cannon', t, direction);
    assert.equal(depth, 0, 'tên lửa cân bằng save/restore');
  }
}
const specs = sandbox.TitanGallery.specs;
const headHeight = s => (s.crown + s.sole) * s.scale;
const { jetSlam, jetSlamPose } = sandbox.TitanGallery;
assert.equal(sandbox.TitanGallery.names.bastion.special, 'I · Búa phản lực');
assert.equal(jetSlam.reach * specs.bastion.scale, 2 * headHeight(specs.bastion), 'I khóa tầm đúng hai chiều cao vẽ');
const airborne = jetSlamPose(.7), impact = jetSlamPose(jetSlam.impactAt);
assert(airborne.y < -250 && airborne.thrust > 0, 'ba lô đẩy Titan rời mặt đất');
assert.equal(impact.y, 0, 'hạ thân xuống khi đập búa');
assert.equal(impact.morph, 1, 'tay phải đã biến thành búa trước va chạm');
const slamHandY = pose => pose.y - 422 + 80 * Math.sin(pose.upper) + (109 + pose.extension) * Math.sin(pose.lower);
assert(slamHandY(impact) > slamHandY(airborne) + 300, 'búa đi từ trên xuống, không đấm ngang');
const impactReach = impact.x - 48 + 80 * Math.cos(impact.upper)
  + (109 + impact.extension) * Math.cos(impact.lower) + 45 * Math.cos(impact.lower - .08);
assert(Math.abs(impactReach - jetSlam.reach) < 1e-9, 'đầu búa đến mốc 2H ở thời điểm đánh');
assert.equal(jetSlamPose(2.6).x, 0);
assert.equal(jetSlamPose(2.6).y, 0);
for (const t of [.22, .55, .7, .87, 1, 1.08, 1.3, 2.6]) {
  for (const direction of [-1, 1]) {
    sandbox.TitanGallery.draw(canvas, 'bastion', 'special', t, direction);
    assert.equal(depth, 0, 'I bay/đập búa cân bằng save/restore');
  }
}
const { celebrationPose } = sandbox.TitanGallery;
assert(celebrationPose(.3).crouch > 35 && celebrationPose(.3).air === 0, 'ăn mừng lấy đà .35s');
const jumpPeak = celebrationPose(.725);
assert(jumpPeak.jumping && jumpPeak.thrust > .99, 'nhảy bằng phản lực trong .75s');
assert(Math.abs(jumpPeak.air * specs.bastion.scale - 170) < 1e-9, 'độ cao nhảy khớp template');
assert.equal(Math.abs(jumpPeak.spin), .12, 'xoay ngang giữ silhouette tối thiểu');
assert(celebrationPose(.9).spin < 0, 'xoay nửa vòng trước khi đáp');
assert.equal(celebrationPose(1.1).air, 0);
assert.equal(celebrationPose(1.1).spin, -1);
assert.equal(celebrationPose(1.1).landing, 1);
assert.equal(celebrationPose(1.6).spread, 1);
assert.equal(celebrationPose(1.6).feet, 1);
assert.equal(celebrationPose(1.6).crouch, 0);
for (const time of [0, .3, .35, .55, .725, .9, 1.09, 1.1, 1.3, 1.6, 2.9]) {
  const pose = celebrationPose(time), repeated = celebrationPose(time + 3);
  for (const key of ['air', 'spin', 'crouch', 'spread', 'feet', 'farUpper', 'farLower', 'nearUpper', 'nearLower']) {
    assert(Math.abs(pose[key] - repeated[key]) < 1e-9, `ăn mừng lặp 3s: ${key}`);
  }
  for (const direction of [-1, 1]) {
    sandbox.TitanGallery.draw(canvas, 'bastion', 'celebrate', time, direction);
    assert.equal(depth, 0, 'ăn mừng cân bằng save/restore');
  }
}
const { staggerPose, staggerPreview } = sandbox.TitanGallery;
for (const time of [0, .2, .4, .9, 1.2, 2.05]) {
  const common = staggerPreview(time), bastion = staggerPose(time);
  assert.equal(bastion.lean, -.12, 'trúng đòn ngả lùi quanh hông như hai Titan cũ');
  assert.equal(bastion.flash, common.flash, 'trúng đòn dùng chung nhịp lóe trắng');
  assert(Math.abs(bastion.crouch * specs.bastion.scale - 10 * .64) < 1e-9, 'độ khuỵu chuẩn hóa theo template');
  for (const side of ['far', 'near']) {
    assert(Number.isFinite(bastion[side].upper) && Number.isFinite(bastion[side].lower));
    assert.deepEqual(bastion[side], staggerPose(0)[side], 'không lắc tay/đầu riêng theo sóng sin');
  }
  for (const direction of [-1, 1]) {
    sandbox.TitanGallery.draw(canvas, 'bastion', 'stagger', time, direction);
    assert.equal(depth, 0, 'trúng đòn cân bằng save/restore');
  }
}
assert.equal(staggerPose(0).flash, false);
assert.equal(staggerPose(.2).flash, true);
assert.equal(specs.vanguard.heightM, 80);
assert.equal(specs.tempest.heightM, 80);
assert.equal(specs.vanguard.massTonnes, 2400);
assert.equal(specs.tempest.massTonnes, 1850);
for (const [id, spec] of Object.entries(specs)) {
  assert(Math.abs(headHeight(specs.vanguard) - headHeight(spec)) < 1e-9,
    `${id}: mọi Titan phải cao bằng nhau khi vẽ từ đất tới đỉnh đầu, không tính phụ kiện`);
}
const bastionHeight = headHeight(specs.bastion);
specs.bastion.heightM = 123; // Số mét hư cấu không được tham gia chuẩn hóa bản vẽ.
assert.equal(headHeight(specs.bastion), bastionHeight);
let poses = 0;
for (const id of ['vanguard', 'tempest', 'bastion']) {
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
