// Bot tự chơi dùng chung cho smoke test và test cân bằng.
// Mỗi bot là hàm (game, io, frame) gọi mỗi khung hình; io = { press, release, rand }.
'use strict';

// Thời gian gồng danh nghĩa của đòn quái (bot ước lượng như người chơi, không biết độ dao động ngẫu nhiên).
const K_WINDUP = { claw: 0.48, tail: 0.6, spit: 0.56, charge: 0.75, roar: 0.85 };
const PHASE2_SPEED = 1.35;
const TITAN_HALF = 35;

// Bot "spam": cứ bấm F+J đều đặn, quái gồng thì giữ S. Không né, không căn phản đòn.
// Dùng để kiểm tra game không thắng được chỉ bằng bấm bừa.
function spamBot(game, io, frame) {
  const { press, release } = io;
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

// Bot "khá": phản ứng chậm như người (reaction giây), căn phản đòn theo thời gian gồng ước lượng,
// lướt né lao húc, đỡ đòn còn lại, đồng bộ khi hết thời gian chờ, xen kẽ đòn nặng.
function makeSkilledBot({ reaction = 0.2, counterRate = 0.7, dodgeRate = 0.8 } = {}) {
  let plan = null; // quyết định cho đòn quái hiện tại: 'counter' | 'block' | 'dodge'
  let planFor = null;
  let lastT = 0;
  return function skilledBot(game, io) {
    const { press, release, rand } = io;
    const tap = (c) => { press(c); release(c); };
    const T = game.titan;
    const K = game.kaiju;
    ['KeyA', 'KeyD', 'KeyW'].forEach(release);
    if (!K || K.dying || !T || T.celebrate) { release('KeyS'); release('KeyL'); return; }
    const blade = T.def.moves.blade || { windup: 0.32, range: 320 };
    const gap = Math.abs(K.x - T.x) - K.half - TITAN_HALF;
    const toward = K.x > T.x ? 'KeyD' : 'KeyA';
    const armsFree = !T.arms.L && !T.arms.R && !T.slide && !T.leap && !T.beaming;

    // đang nạp L: giữ tới ~75% rồi thả; quái gồng thì thả ngay
    if (T.charge) {
      if (K.state === 'windup' || (T.def.missiles ? T.charge.full : T.charge.level >= 0.75)) release('KeyL');
      else press('KeyL');
      return;
    }
    release('KeyL');

    // ---- đứng nhầm phía biển (sau khi lướt xuyên qua): lướt xuyên lại về phía thành phố ngay khi đủ năng lượng
    // (lướt cũng có khung bất tử nên né luôn đòn đang tới), đừng đánh từ sau lưng vì sẽ hất quái vào nhà
    const seaSide = T.x > K.x;
    if (seaSide && gap < 110 && T.energy >= 20 && T.dashT <= 0 && T.stagger <= 0 && !T.arms.L && !T.arms.R) {
      release('KeyS');
      press(toward);
      press('KeyW');
      return;
    }

    // ---- đạn axit đang bay tới: giữ đỡ cho tới khi đạn bay qua
    const incoming = game.projectiles.some((p) => p.owner === 'kaiju' && Math.abs(p.x - T.x) < 700 && Math.sign(T.x - p.x) === Math.sign(p.vx));
    if (incoming && !T.charge) {
      press('KeyS');
      return;
    }

    // ---- phòng thủ / phản đòn
    const threat = K.state === 'windup' || (K.state === 'active' && K.move === 'charge');
    if (threat) {
      // đòn gồng mới: đổi tên đòn, hoặc K.t quay về nhỏ hơn lần trước
      if (K.state === 'windup' && (planFor !== K.move || K.t < lastT)) {
        planFor = K.move;
        const r = rand();
        plan = K.move === 'charge' ? (r < dodgeRate ? 'dodge' : 'counter') : r < counterRate ? 'counter' : 'block';
      }
      lastT = K.state === 'windup' ? K.t : 0;
      if (K.state === 'windup' && K.t < reaction) { release('KeyS'); return; } // chưa kịp nhìn thấy
      const est = (K_WINDUP[K.move] || 0.5) / (K.phase2 ? PHASE2_SPEED : 1);
      if (K.state === 'windup' && plan === 'counter') {
        const land = K.t + blade.windup;
        const inRange = gap < blade.range - 30;
        if (inRange && !T.arms.R && land >= est * 0.55 && land < est * 0.95) {
          tap('KeyK'); // vẫn giữ S: đang đỡ vẫn chém K được
          plan = 'done';
          return;
        }
        if (inRange && !T.arms.R && land < est * 0.55) { press('KeyS'); return; } // vừa đỡ vừa chờ đúng nhịp
        if (K.move !== 'charge') plan = 'block';
        else plan = 'dodge';
      }
      if (K.move === 'charge') {
        release('KeyS');
        // lướt lùi đúng lúc quái lao tới: cú lao hụt, Titan vẫn ở phía thành phố
        if (K.state === 'active' && gap < 90 && T.energy >= 20 && T.dashT <= 0) press('KeyW');
        else if (K.state === 'windup' && gap < 150) press(K.x > T.x ? 'KeyA' : 'KeyD'); // lùi lấy khoảng né
        return;
      }
      if (plan === 'block' || plan === 'done') {
        press('KeyS');
        return;
      }
    }
    release('KeyS');
    planFor = null;
    if (seaSide) { press(toward); return; }

    // ---- tấn công
    if (gap > blade.range - 60) {
      // xa: nạp L nếu dư năng lượng, không thì tiến lại
      if (gap > 420 && armsFree && T.energy > 70 && (!T.def.missiles || T.missileCD <= 0)) { press('KeyL'); return; }
      press(toward);
      return;
    }
    if (!armsFree) return;
    const syncReady = game.t - (T.lastSyncT ?? -99) >= 1.05;
    if (T.link >= 100 && syncReady) { press('KeyF'); press('KeyJ'); release('KeyF'); release('KeyJ'); return; }
    if (T.energy >= 55 && rand() < 0.04) { tap('KeyI'); return; }
    // đồng bộ K+F (đòn nặng: Link +12) là chính, thỉnh thoảng F+J
    if (syncReady && rand() < 0.6) {
      const second = rand() < 0.75 ? 'KeyK' : 'KeyJ';
      press('KeyF'); press(second); release('KeyF'); release(second);
      return;
    }
    const r = rand();
    if (r < 0.45) tap('KeyK');
    else if (r < 0.75) tap('KeyF');
    else tap('KeyJ');
  };
}

module.exports = { spamBot, makeSkilledBot, K_WINDUP };
