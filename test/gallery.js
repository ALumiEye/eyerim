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
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../titans/bulwark.js'), 'utf8'), sandbox);
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
assert.equal(sandbox.TitanGallery.drawingHeight, headHeight(specs.vanguard), 'H cố định theo đầu Vanguard, không tính vây');
for (const id of ['bastion', 'bulwark']) {
  const spec = specs[id];
  assert.equal(spec.scale, sandbox.TitanGallery.scaleToDrawingHeight(spec.eyeTop ?? spec.crown, spec.sole), `${id}: dùng chung công thức chuẩn H`);
}
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
const { celebrationPose, celebrationPreview } = sandbox.TitanGallery;
// Ăn mừng: Bastion đọc thẳng template duy nhất của game (celebrationPreview), chỉ quy đổi tỷ lệ.
const bastionCelRatio = sandbox.TitanGallery.templateRatio(specs.bastion.scale); // quy đổi duy nhất: cùng kích thước hiển thị
assert.equal(celebrationPreview(.3).phase.name, 'crouch', 'ăn mừng lấy đà .35s');
assert(celebrationPreview(.3).lean > 0, 'lấy đà ngả người tới trước');
const jumpPeak = celebrationPose(.725);
assert(jumpPeak.jumping, 'nhảy trong .75s');
assert(Math.abs(jumpPeak.air * specs.bastion.scale - 170) < 1e-9, 'độ cao nhảy khớp template');
assert.equal(Math.abs(jumpPeak.spin), .12, 'xoay ngang giữ silhouette tối thiểu');
assert(celebrationPose(.9).spin < 0, 'xoay nửa vòng trước khi đáp');
assert.equal(celebrationPose(1.11).air, 0);
assert.equal(celebrationPose(1.11).spin, 1, 'đáp xong quay lại hướng nhìn như Vanguard');
assert(celebrationPose(1.11).landed && celebrationPreview(1.6).lean < 0, 'đáp đất ưỡn ngực như Vanguard');
assert(celebrationPreview(.75).hands.R.y < -350, 'đang bay giơ tay lên trên đầu như Vanguard');
for (const time of [0, .1, .3, .35, .55, .725, .9, 1.09, 1.1, 1.3, 1.6, 2.9]) {
  const cel = celebrationPreview(time), pose = celebrationPose(time), repeated = celebrationPose(time + 3);
  assert(Math.abs(pose.crouch - cel.crouch * bastionCelRatio) < 1e-9, 'Bastion: độ khuỵu = template');
  assert(Math.abs(pose.feetFar - cel.feetFar * bastionCelRatio) < 1e-9 && Math.abs(pose.feetNear - cel.feetNear * bastionCelRatio) < 1e-9, 'Bastion: dang chân = template');
  assert.equal(pose.lean, cel.lean); assert.equal(pose.spin, cel.spin); assert.equal(pose.thrust, cel.thrust);
  for (const key of ['air', 'spin', 'crouch', 'feetFar', 'feetNear', 'lean', 'farUpper', 'farLower', 'nearUpper', 'nearLower']) {
    assert(Math.abs(pose[key] - repeated[key]) < 1e-6, `ăn mừng lặp 3s: ${key}`);
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
  assert(Math.abs(bastion.crouch * specs.bastion.scale - 10 * specs.vanguard.scale) < 1e-9, 'độ khuỵu hiển thị bằng Vanguard');
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
assert.equal(specs.vanguard.heightM, 79);
assert.equal(specs.tempest.heightM, 76);
assert.equal(specs.vanguard.massTonnes, 2050);
assert.equal(specs.tempest.massTonnes, 1780);
for (const [id, spec] of Object.entries(specs)) {
  const measuredHeight = ((spec.eyeTop ?? spec.crown) + spec.sole) * spec.scale;
  assert(Math.abs(headHeight(specs.vanguard) - measuredHeight) < 1e-9,
    `${id}: mốc chiều cao vẽ bằng chuẩn; riêng Bulwark đo tới cạnh trên hai mắt tròn`);
}
const bastionDrawer = sandbox.EyeRimBastion;
for (let i = 0; i <= 200; i++) {
  const time = i / 200 * bastionDrawer.walkPeriod, gait = bastionDrawer.walkPose(time), next = bastionDrawer.walkPose(time + .002);
  assert(Math.abs(gait.stride - Math.sin(time * 6.5)) < 1e-12, 'Bastion: cùng nhịp bước t·6,5 như Vanguard/Tempest');
  assert(Math.abs(gait.bob * specs.bastion.scale - (4 - 8 * Math.abs(Math.cos(time * 6.5))) * specs.vanguard.scale) < 1e-9, 'Bastion: nhún cùng biên độ vẽ');
  for (const side of ['far', 'near']) {
    if (gait[side].lift > .02) assert(next[side].x > gait[side].x, `Bastion ${side}: nhấc chân khi vung tới trước`);
    else if (gait[side].lift === 0 && next[side].lift === 0) assert(next[side].x <= gait[side].x + 1e-9, `Bastion ${side}: chân trụ đẩy về sau`);
  }
  assert(gait.far.lift === 0 || gait.near.lift === 0, 'Bastion: hai chân không cùng nhấc');
  for (const direction of [-1, 1]) {
    sandbox.TitanGallery.draw(canvas, 'bastion', 'walk', time, direction);
    assert.equal(depth, 0);
  }
}
for (const time of [0, .4, .785, 1.57, 3.14]) {
  const idle = bastionDrawer.idlePose(time), ratio = specs.vanguard.scale / specs.bastion.scale;
  assert(Math.abs(idle.bob - Math.sin(time * 2) * 2.5 * ratio) < 1e-9, 'Bastion: thở thân như Vanguard đứng im');
  assert(Math.abs(idle.near - Math.sin(time * 2 + 1.2) * 3 * ratio) < 1e-9, 'Bastion: hai tay thở lệch pha');
}
assert.equal(bastionDrawer.idlePose(0).bob, 0, 'Bastion: mốc đo chiều cao t=0 không lệch');
// Gối IK chiều dài cố định cho mọi động tác (như Vanguard/Tempest): đo bằng cách chặn moveTo khi vẽ thật.
for (const [id, drawer, legs] of [['bastion', sandbox.EyeRimBastion, [[-24, -264], [30, -263]]], ['bulwark', sandbox.EyeRimBulwark, [[-37, -277], [40, -277]]]]) {
  for (const [hx, hy] of legs) {
    const lengths = [];
    for (const [fx, fy] of [[hx - 50, hy + 240], [hx + 40, hy + 230], [hx, hy + 200], [hx + 30, hy + 180]]) {
      const [kx, ky] = drawer.legKnee(hx, hy, fx, fy);
      lengths.push(Math.hypot(kx - hx, ky - hy));
      const ay = id === 'bulwark' ? fy - 24 : fy;
      // Gối nằm phía trước đường hông–cổ chân (tích chéo dương theo hướng nhìn +x).
      assert((fx - hx) * (ky - hy) - (ay - hy) * (kx - hx) < 0, `${id}: gối gập ra trước`);
    }
    assert(lengths.every(l => Math.abs(l - lengths[0]) < 1e-9), `${id}: đùi giữ nguyên chiều dài ở mọi tư thế`);
  }
}
const bulwark = sandbox.EyeRimBulwark;
assert(bulwark, 'Bulwark đã đăng ký bộ vẽ ở xưởng');
for (let i = 0; i <= 200; i++) {
  const time = i / 200 * bulwark.walkPeriod, gait = bulwark.walkPose(time), next = bulwark.walkPose(time + .002);
  const repeat = bulwark.walkPose(time + bulwark.walkPeriod);
  assert(Math.abs(gait.stride - Math.sin(time * 6.5)) < 1e-12, 'cùng nhịp bước t·6,5 như Vanguard/Tempest');
  const expected = (4 - 8 * Math.abs(Math.cos(time * 6.5))) * specs.vanguard.scale;
  assert(Math.abs(gait.bob * bulwark.scale - expected) < 1e-9, 'đường nhún và biên độ vẽ như Vanguard/Tempest');
  assert(Math.abs(gait.near.x * bulwark.scale - Math.sin(time * 6.5) * 24 * specs.vanguard.scale) < 1e-9, 'sải chân cùng cỡ vẽ');
  for (const side of ['far', 'near']) {
    assert(Math.abs(gait[side].x - repeat[side].x) < 1e-9 && Math.abs(gait[side].lift - repeat[side].lift) < 1e-9);
    // Chân chỉ nhấc khi đang vung tới trước; khi chạm đất thì đẩy về sau, không lê bàn chân lên trước.
    if (gait[side].lift > .02) assert(next[side].x > gait[side].x, `${side}: nhấc chân khi vung tới trước`);
    else if (gait[side].lift === 0 && next[side].lift === 0) assert(next[side].x <= gait[side].x + 1e-9, `${side}: chân trụ đẩy về sau`);
  }
  assert(gait.far.lift === 0 || gait.near.lift === 0, 'hai chân không cùng nhấc');
  for (const direction of [-1, 1]) {
    sandbox.TitanGallery.draw(canvas, 'bulwark', 'walk', time, direction);
    assert.equal(depth, 0, 'dáng đi cân bằng save/restore');
  }
}
assert.equal(bulwark.poseAt('idle', 1).gait, null, 'nhịp bước không đổi tư thế các chiêu khác');
for (const time of [0, .4, .785, 1.57, 2.5, 3.14]) {
  const idle = bulwark.idlePose(time), ratio = specs.vanguard.scale / bulwark.scale;
  assert(Math.abs(idle.bob - Math.sin(time * 2) * 2.5 * ratio) < 1e-9, 'thân thở cùng nhịp/biên độ vẽ như Vanguard đứng im');
  assert(Math.abs(idle.near - Math.sin(time * 2 + 1.2) * 3 * ratio) < 1e-9, 'hai tay thở lệch pha như Vanguard');
  for (const direction of [-1, 1]) {
    sandbox.TitanGallery.draw(canvas, 'bulwark', 'idle', time, direction);
    assert.equal(depth, 0);
  }
}
assert.equal(bulwark.poseAt('guard', 1).idle, null, 'thở tay chỉ khi đứng nghỉ/đi như Vanguard');
assert.equal(bulwark.idlePose(0).bob, 0, 'mốc đo chiều cao t=0 không lệch');
const chargedI = bulwark.diagonalPunchPose(.86);
assert.equal(chargedI.side, 'left');
assert.equal(chargedI.x, 0, 'tụ điện trước khi lao');
assert.equal(chargedI.y, 0, 'không nhảy lấy đà');
assert(chargedI.extension === 100 && chargedI.lock === 1 && chargedI.electric > .99, 'nắm đấm trái vươn dài, khóa giáp, tích điện xong trước khi lao');
for (const time of [.95, 1.05, 1.15, 1.24]) {
  const p = bulwark.diagonalPunchPose(time);
  assert(p.x > 0 && p.y < 0);
  assert(Math.abs(p.y / p.x + 125 / 285) < 1e-9, 'đường lao chéo thẳng, không ngang hoặc vòng cung');
}
const hoverI = bulwark.diagonalPunchPose(1.4), fallI = bulwark.diagonalPunchPose(1.7), landI = bulwark.diagonalPunchPose(1.92);
assert.equal(hoverI.x, fallI.x, 'rơi xuống sau khi lao, không lướt ngược');
assert(fallI.y > hoverI.y && fallI.y < 0 && Math.abs(landI.y) < 1e-9);
assert.equal(bulwark.poseAt('special', 1).uppercut, null, 'I không dùng tư thế uppercut K');
assert.equal(bulwark.poseAt('special', 1).heavy, 0, 'không dùng lại I cũ');
assert.equal(bulwark.poseAt('blade', 1).diagonal, null, 'K giữ nguyên');
for (const time of [0, .2, .5, .86, 1.05, 1.24, 1.7, 1.92, 2.3, 3.3]) {
  const p = bulwark.diagonalPunchPose(time), repeat = bulwark.diagonalPunchPose(time + bulwark.diagonalPunchPeriod);
  for (const key of ['x', 'y', 'upper', 'lower', 'extension', 'spread', 'slide', 'lock', 'electric']) {
    assert(Number.isFinite(p[key]) && Math.abs(p[key] - repeat[key]) < 1e-9);
  }
  for (const direction of [-1, 1]) {
    sandbox.TitanGallery.draw(canvas, 'bulwark', 'special', time, direction);
    assert.equal(depth, 0, 'I lao chéo cân bằng save/restore');
  }
}
for (const id of ['bastion', 'bulwark']) {
  assert.equal(specs[id].series, 'Eye-1', `${id}: thuộc thế hệ Eye-1`);
  assert(specs[id].note.includes('Thế hệ Eye-1'), 'thông số hiển thị thế hệ Eye-1');
  assert.equal(sandbox.TitanGallery.names[id].jab, 'F · Đấm phải');
  assert.equal(sandbox.TitanGallery.names[id].hook, 'J · Đấm trái');
}
for (const [clip, side, peak] of [['jab', 'right', .07], ['hook', 'left', .1]]) {
  assert.equal(bulwark.poseAt(clip, peak).punchArm, side, `${clip}: đúng tay của thế hệ Eye-1`);
  assert.equal(bulwark.poseAt(clip, peak).punch, 1, 'giữ nguyên nhịp F/J');
}
assert.equal(bulwark.poseAt('blade', .72).punchArm, null, 'không áp dụng đổi tay F/J sang K');
assert.equal(sandbox.TitanGallery.names.bulwark.cannon, 'L · Phun lửa hai mắt');
const fireRed = bulwark.eyeFirePose(.3), fireYellow = bulwark.eyeFirePose(1.05);
assert(fireRed.glow > 0 && fireRed.heat === 0, 'mắt sáng đỏ trước');
assert(fireYellow.glow > fireRed.glow && fireYellow.heat === 1, 'tụ sáng dần sang vàng');
assert.equal(fireYellow.streams.length, 0, 'tụ xong mới phun');
const fireJet = bulwark.eyeFirePose(1.62), fireCurl = bulwark.eyeFirePose(2.15);
assert.equal(fireJet.streams.length, 2, 'đúng hai luồng từ hai mắt');
assert.equal(fireJet.curl, 0, 'phun dài trước, không có cầu ngay');
assert(fireJet.streams.every(s => s.distance > 300 && s.radius === 0 && !s.launched));
assert(fireCurl.curl > .8 && fireCurl.streams.every(s => s.radius > 25 && !s.launched), 'cuộn thành cầu trước khi bắn');
const fireShot = bulwark.eyeFirePose(2.5), fireNext = bulwark.eyeFirePose(2.6);
for (let i = 0; i < 2; i++) {
  assert(fireShot.streams[i].launched && fireNext.streams[i].ballX > fireShot.streams[i].ballX, 'hai cầu bay về phía trước');
  assert.equal(fireShot.streams[i].x, i ? 84 : -79, 'đúng tâm mắt');
}
assert(Math.abs(fireShot.streams[0].ballY - fireShot.streams[1].ballY) > 100, 'hai cầu tách rõ');
assert.equal(bulwark.eyeFirePose(3.4).streams.length, 0, 'kết thúc và không tích đạn giữa các vòng');
assert.equal(bulwark.eyeFirePose(3.4).glow, 0);
assert.equal(bulwark.poseAt('blade', 1.6).eyeFire, null, 'lửa chỉ thuộc L');
for (const time of [0, .3, 1.05, 1.3, 1.62, 1.9, 2.15, 2.25, 2.5, 2.9, 3.4]) {
  const p = bulwark.eyeFirePose(time), repeat = bulwark.eyeFirePose(time + bulwark.eyeFirePeriod);
  for (const key of ['glow', 'heat', 'jet', 'curl']) assert(Math.abs(p[key] - repeat[key]) < 1e-9, `L lặp liên tục: ${key}`);
  for (const direction of [-1, 1]) {
    sandbox.TitanGallery.draw(canvas, 'bulwark', 'cannon', time, direction);
    assert.equal(depth, 0, 'Bulwark L cân bằng save/restore ở mọi pha');
  }
}
const lowUppercut = bulwark.uppercutPose(.44), highUppercut = bulwark.uppercutPose(.72);
const uppercutHand = p => ({
  x: 91 + 104 * Math.cos(p.upper) + (130 + p.extension) * Math.cos(p.lower),
  y: -424 + 104 * Math.sin(p.upper) + (130 + p.extension) * Math.sin(p.lower),
});
for (const [side, shoulderY] of [['far', -424], ['near', -423]]) {
  const rest = bulwark.restArms[side];
  const handY = shoulderY + 104 * Math.sin(rest.upper) + 130 * Math.sin(rest.lower);
  assert(handY > -350 && handY < -300, 'hai tay giữ ngang bụng, không buông ngang đùi');
}
for (const key of ['upper', 'lower']) {
  assert.equal(bulwark.uppercutPose(0)[key], bulwark.restArms.far[key]);
  assert.equal(bulwark.uppercutPose(1.6)[key], bulwark.restArms.far[key], 'K thu về đúng thế co tay');
}
assert.equal(lowUppercut.side, 'left', 'K dùng tay trái, không phải tay phải');
assert.equal(lowUppercut.spread, 1, 'vỏ giáp tách hết trước khi đánh');
assert.equal(lowUppercut.slide, 1, 'cụm ngón trượt ra trước khi đánh');
assert.equal(lowUppercut.lock, 1, 'giáp khóa lại trước khi móc');
assert(bulwark.uppercutPose(.12).spread > 0 && bulwark.uppercutPose(.12).slide === 0, 'mở vỏ trước rồi mới trượt');
assert(bulwark.uppercutPose(.25).slide > 0 && bulwark.uppercutPose(.25).lock === 0, 'trượt ngón trước rồi khóa');
assert.equal(highUppercut.lock, 1, 'giữ ngàm khóa khi đánh');
assert(!('fistScale' in highUppercut), 'biến hình từng mảnh, không scale bàn tay');
assert.equal(highUppercut.extension, 66, 'piston giãn rõ, không kéo giãn giáp cẳng tay');
assert(highUppercut.extension > lowUppercut.extension);
assert(uppercutHand(highUppercut).y < uppercutHand(lowUppercut).y - 290, 'K móc từ dưới lên');
assert(uppercutHand(highUppercut).x > 130, 'nắm đấm vươn khỏi thân');
assert.equal(bulwark.poseAt('blade', .56).heavy, 0, 'K không dùng lại tư thế I/ultimate');
assert.equal(bulwark.poseAt('special', .56).uppercut, null, 'K không đổi chiêu I');
for (const time of [0, .12, .28, .32, .44, .56, .7, .95, 1.26, 2.79, 6.001]) {
  const p = bulwark.uppercutPose(time), repeated = bulwark.uppercutPose(time + bulwark.uppercutPeriod);
  for (const key of ['upper', 'lower', 'extension', 'spread', 'slide', 'lock', 'power', 'electric']) {
    assert(Number.isFinite(p[key]));
    assert(Math.abs(p[key] - repeated[key]) < 1e-9, `Bulwark K lặp liên tục: ${key}`);
  }
  for (const direction of [-1, 1]) {
    sandbox.TitanGallery.draw(canvas, 'bulwark', 'blade', time, direction);
    assert.equal(depth, 0, 'Bulwark K cân bằng save/restore');
  }
}
const lightning = bulwark.fistLightning(highUppercut);
assert.equal(lightning.length, 5, 'sét bao nhiều phía quanh nắm đấm K');
assert(highUppercut.electric > lowUppercut.electric, 'điện mạnh nhất khi móc lên');
assert.equal(bulwark.fistLightning(null).length, 0, 'tay thường không có sét K');
assert.equal(bulwark.fistLightning(bulwark.uppercutPose(0)).length, 0);
assert.notDeepEqual(lightning, bulwark.fistLightning(bulwark.uppercutPose(.78)), 'sét đổi hình khi thời gian chạy');
assert.deepEqual(lightning, bulwark.fistLightning(bulwark.uppercutPose(.72)), 'tua cùng thời điểm giữ nguyên hình sét');
for (const arc of lightning) for (const point of arc) assert(point.every(Number.isFinite));
for (const key of ['spread', 'slide', 'lock', 'extension', 'electric']) {
  assert.equal(bulwark.uppercutPose(1.6)[key], 0, 'cơ cấu thu về sau đòn: ' + key);
}
assert.equal(bulwark.cockpitPose(1).y, -418, 'buồng lái khóa giữa ngực ở đầu trên');
assert.equal(bulwark.cockpitPose(0).y, -351, 'buồng lái hạ dọc rãnh giữa thân');
assert.equal(bulwark.cockpitPose(.5).y, -384.5, 'cabin trượt liên tục trên ray');
for (const lift of [-1, 0, .5, 1, 2, NaN]) {
  bulwark.setCockpitLift(lift);
  assert(bulwark.cockpitPose().lift >= 0 && bulwark.cockpitPose().lift <= 1);
  for (const facing of [-1, 1]) sandbox.TitanGallery.draw(canvas, 'bulwark', 'idle', 0, facing);
  assert.equal(depth, 0);
}
bulwark.setCockpitLift(1);
assert(Math.abs(bulwark.eyeTop - (492 + Math.hypot(26 * Math.sin(.14), 29 * Math.cos(.14)))) < 1e-9,
  'mốc Bulwark nằm đúng cạnh trên mắt tròn của bản vẽ');
assert(headHeight(specs.bulwark) > headHeight(specs.vanguard) * 1.14,
  'đỉnh trụ Bulwark cao hơn chuẩn khi căn chiều cao theo mắt');
for (const time of [0, .3, .35, .55, .725, .9, 1.1, 1.6, 2.9]) {
  const cel = celebrationPreview(time), actual = bulwark.celebrationPose(time);
  const r = sandbox.TitanGallery.templateRatio(bulwark.scale);
  for (const key of ['spin', 'lean', 'thrust']) assert.equal(actual[key], cel[key], `Bulwark: ăn mừng dùng chung template ${key}`);
  assert(Math.abs(actual.crouch - cel.crouch * r) < 1e-9 && Math.abs(actual.feetNear - cel.feetNear * r) < 1e-9, 'Bulwark: khuỵu/dang chân = template');
  assert(Math.abs(actual.air * specs.bulwark.scale - cel.air) < 1e-9, 'Bulwark: độ cao nhảy = template');
  for (const key of ['farUpper', 'farLower', 'nearUpper', 'nearLower']) assert(Number.isFinite(actual[key]));
}
for (const time of [0, .2, .4, .9]) {
  const expected = staggerPreview(time), actual = bulwark.staggerPose(time);
  assert.equal(actual.flash, expected.flash);
  assert.equal(actual.lean, expected.lean);
  assert(Math.abs(actual.crouch * specs.bulwark.scale - 10 * specs.vanguard.scale) < 1e-9, 'độ khuỵu hiển thị bằng Vanguard');
  for (const side of ['far', 'near']) assert([actual[side].upper, actual[side].lower].every(Number.isFinite));
}
const bastionHeight = headHeight(specs.bastion);
specs.bastion.heightM = 123; // Số mét hư cấu không được tham gia chuẩn hóa bản vẽ.
assert.equal(headHeight(specs.bastion), bastionHeight);
let poses = 0;
for (const id of ['vanguard', 'tempest', 'bastion', 'bulwark']) {
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
