/* Phần vẽ dùng chung Vanguard/Tempest (khung giáp, tư thế tay, ngả người, vệt chém).
 * Chỉ là code dùng chung trong game; tách nguyên trạng từ src/game.js, không đổi hình.
 */
(() => {
  'use strict';
  const core = window.EyeRimCore && window.EyeRimCore.frame;
  if (!core) return;
  const { BODY_LIFT, celebrationTemplate, clamp, easeInOut, easeOut, game, idleTemplate, LEAP, LEG_TEMPLATE, lerp, linkColor, rand, STAGGER_TEMPLATE, titanDrawScale, walkTemplate } = core;
  let ctx; // canvas hiện tại của game (trang xưởng có thể đổi), lấy lại mỗi lần vẽ

  // Bảng màu khung giáp; flash = lóe trắng khi trúng đòn.
  const MECH = {
    front: { hi: '#f2f5f8', armor: '#c9d1db', lo: '#7d8a99', frame: '#262f3a', frameHi: '#3d4958', accent: '#ff8a1f', line: 'rgba(8,14,22,0.6)' },
    back: { hi: '#9aa5b2', armor: '#76828f', lo: '#4c5663', frame: '#161c24', frameHi: '#252e39', accent: '#a65a17', line: 'rgba(4,7,10,0.6)' },
    flash: { hi: '#ffffff', armor: '#f4f7fa', lo: '#c4ccd6', frame: '#8a96a6', frameHi: '#b4c0cc', accent: '#ffd0a0', line: 'rgba(8,14,22,0.4)' },
  };

  // TEMPEST nút L: đích bàn tay khi bệ ngực mở (khung cơ sở trước BODY_LIFT).
  const TEMPEST_LAUNCH_ARMS = { R: { x: -38, y: -175, back: 24 }, L: { x: -110, y: -260 } };

  function armPose(T, side) {
    const a = T.arms[side];
    const breathe = idleTemplate(game.t).breathe[side];
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
    if (T.def.missiles) {
      // L: hoán đổi hai tư thế cũ: tay phải co thấp, tay trái co cao ra phía sau lưng;
      // cả hai đi cùng nhịp nắp ngực, giữ trống toàn bộ bệ phóng 3×2.
      const retract = easeOut(launcherOpen(T));
      const pose = side === 'R' ? TEMPEST_LAUNCH_ARMS.R : TEMPEST_LAUNCH_ARMS.L;
      if (retract > 0 && (side === 'R' || !a)) return { x: lerp(rest.x, pose.x, retract), y: lerp(rest.y, pose.y, retract) };
    }
    if (side === 'R' && T.charge) return { x: 200, y: -256, charging: true };
    if (!a) {
      if (T.guard) return side === 'L' ? { x: 46, y: -318 } : { x: 92, y: -278 };
      if (T.stagger > 0) return { ...STAGGER_TEMPLATE.hands[side] };
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

  function celebrateArm(T, side) {
    return celebrationTemplate(T.celebrate, game.t).hands[side];
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
    if (T.celebrate) return celebrationTemplate(T.celebrate, game.t).lean;
    let lean = 0;
    for (const side of ['L', 'R']) {
      const a = T.arms[side];
      if (!a) continue;
      const w = a.windup;
      if (a.t < w) lean -= 0.05 * (a.t / w);
      else if (a.t < w + a.m.active + a.m.recover * 0.5) lean += a.name === 'blade' ? 0.12 : a.name === 'jet' ? 0.16 : 0.07;
    }
    if (T.stagger > 0) lean += STAGGER_TEMPLATE.lean;
    if (T.guard) lean -= 0.03;
    if (Math.abs(T.vx) > 300) lean += 0.08 * Math.sign(T.vx) * T.facing;
    return lean;
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

  // Độ mở nắp bệ phóng tên lửa (0 → 1) theo trạng thái nạp/phóng.
  function launcherOpen(T) {
    const a = T.arms.R;
    if (T.charge) return clamp(T.charge.t / 0.15, 0, 1);
    if (a && a.name === 'cannon') return a.t < a.windup + a.m.active ? 1 : 1 - clamp((a.t - a.windup - a.m.active) / a.m.recover, 0, 1);
    return 0;
  }

  // Vẽ khung giáp Vanguard/Tempest (chuyển nguyên trạng từ drawTitan của src/game.js).
  // Gọi khi ctx đã đặt gốc ở mặt đất dưới chân Titan và đã trừ độ cao bay (airY).
  function drawFrameTitan(T, flash) {
    const lc = linkColor(T.link);
    const F = flash ? MECH.flash : T.def.pal.front;
    const B = flash ? MECH.flash : T.def.pal.back;
    // Chu kỳ bước đi: hai chân lệch pha, thân nhún theo nhịp bước.
    const gait = walkTemplate(T.walkT);
    const ph = gait.phase;
    const s1 = gait.near.x / LEG_TEMPLATE.stride;
    const s2 = gait.far.x / LEG_TEMPLATE.stride;
    const bob = T.moving ? gait.bob : idleTemplate(game.t).bob;
    let lift1 = T.moving ? gait.near.lift : 0;
    let lift2 = T.moving ? gait.far.lift : 0;
    let crouch = T.guard ? 14 : T.stagger > 0 ? STAGGER_TEMPLATE.crouch : 0;
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
      const cel = celebrationTemplate(T.celebrate, game.t);
      celPh = cel.phase;
      if (celPh.name !== 'wait') { crouch = cel.crouch; spin = cel.spin; spreadFeet = cel.spreadFeet; }
    }
    const by = bob + crouch;

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
    const body = window.TitanFrames[T.def.id];
    if (!body) return; // thân riêng chưa nạp xong
    const lean = titanLean(T);
    const hip = -158 - BODY_LIFT + by;

    body.drawBody(T, F, B, lc, by, hip, lean, s1, s2, lift1, lift2, crouch, spreadFeet);
  }

  // Mỗi lần game gọi vào: lấy ctx hiện tại của game rồi mới vẽ.
  const withCtx = (fn) => (...args) => { ctx = core.ctx(); return fn(...args); };
  window.TitanFrames = window.TitanFrames || {};
  window.TitanFrames.common = { TEMPEST_LAUNCH_ARMS, armPose: withCtx(armPose), celebrateArm: withCtx(celebrateArm), leapArm: withCtx(leapArm), titanLean: withCtx(titanLean), drawTitan: withCtx(drawFrameTitan), drawSlashTrail: withCtx(drawSlashTrail), launcherOpen: withCtx(launcherOpen) };
})();
