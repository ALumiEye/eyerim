/* Vanguard — bộ vẽ của GAME. Tách nguyên trạng từ src/game.js (refactor, không đổi hình).
 * Phần dùng chung với Tempest: src/titans/common/frame.js.
 */
(() => {
  'use strict';
  const core = window.EyeRimCore && window.EyeRimCore.frame;
  const common = window.TitanFrames && window.TitanFrames.common;
  if (!core || !common) return;
  const { BODY_LIFT, PI2, clamp, clipPoly, easeInOut, easeOut, ellipse, fx, game, ik, lerp, poly, rainSheen, rr, seg, vGrad } = core;
  const { armPose, drawSlashTrail } = common;
  let ctx; // canvas hiện tại của game (trang xưởng có thể đổi), lấy lại mỗi lần vẽ

  // Độ ngả người theo đòn đang đánh (cho cảm giác có trọng lượng).
  // Động cơ phản lực ở khuỷu tay: lửa phụt ngược hướng cẳng tay.
  function drawElbowJet(p, k, lc) {
    const a = p.a;
    const w = a.windup;
    let power;
    if (a.t < w) power = 0.25 + 0.5 * (a.t / w);
    else if (a.t < w + a.m.active + 0.12) power = 1.25;
    else power = Math.max(0, 1 - (a.t - w - a.m.active - 0.12) / (a.m.recover * 0.6));
    if (power <= 0) return;
    const ang = Math.atan2(k.ey - k.jy, k.ex - k.jx) + Math.PI; // ngược hướng cú đấm
    ctx.save();
    ctx.translate(k.jx, k.jy);
    ctx.rotate(ang);
    // vòi phun
    rr(-6, -13, 22, 26, 5);
    ctx.fillStyle = '#262f3a';
    ctx.fill();
    ctx.fillStyle = '#ff8a1f';
    ctx.fillRect(10, -13, 5, 26);
    ctx.globalCompositeOperation = 'lighter';
    const flick = 0.85 + Math.random() * 0.3;
    const L = (60 + 150 * power) * flick;
    const Wd = 12 + 8 * power;
    const g = ctx.createLinearGradient(16, 0, 16 + L, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.18, 'rgba(255,220,120,0.9)');
    g.addColorStop(0.55, 'rgba(255,120,30,0.6)');
    g.addColorStop(1, 'rgba(255,60,10,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(16, -Wd);
    ctx.quadraticCurveTo(16 + L * 0.5, -Wd * 1.2, 16 + L, 0);
    ctx.quadraticCurveTo(16 + L * 0.5, Wd * 1.2, 16, Wd);
    ctx.closePath();
    ctx.fill();
    // lõi xanh nóng + vành sốc
    ctx.fillStyle = `rgba(150,220,255,${0.6 * power})`;
    ellipse(24, 0, 10 + 6 * power, 6 + 3 * power);
    ctx.fill();
    if (power > 1) {
      ctx.strokeStyle = 'rgba(255,230,180,0.6)';
      ctx.lineWidth = 3;
      for (let i = 1; i <= 3; i++) {
        ellipse(16 + i * 34, 0, 5, Wd * (1.1 - i * 0.2));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // VANGUARD: giáp xanh thép nhiều lớp, không đổi bộ vẽ Tempest.
  function drawVanguardJoint(x, y, r, P) {
    const steel = P.steel || '#d8e5e9';
    ctx.fillStyle = P.frame;
    ellipse(x, y, r + 3, r + 3); ctx.fill();
    ctx.fillStyle = vGrad(y - r, y + r, steel, P.frameHi, P.lo);
    ellipse(x, y, r, r); ctx.fill();
    ctx.strokeStyle = steel; ctx.lineWidth = 1.5;
    ellipse(x, y, r - 3, r - 3); ctx.stroke();
    ctx.fillStyle = P.frame;
    ellipse(x, y, r * 0.55, r * 0.55); ctx.fill();
    ctx.fillStyle = P.frameHi;
    ellipse(x, y, r * 0.34, r * 0.34); ctx.fill();
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      ctx.fillStyle = steel;
      ellipse(x + Math.cos(a) * r * 0.77, y + Math.sin(a) * r * 0.77, 1.1, 1.1); ctx.fill();
    }
  }

  // Đường ráp và cạnh bắt sáng dùng chung cho các tấm giáp Vanguard.
  function vanguardSeam(points, color, width = 1) {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.stroke();
  }

  // Đường chia tấm, ốc chìm và vết xước ngắn; cắt trong từng tấm giáp.
  function vanguardPanel(points, P, seed = 0) {
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    clipPoly(points, () => {
      for (let i = 1; i <= 3; i++) {
        const y = y0 + (y1 - y0) * i / 4;
        vanguardSeam([[x0, y], [x1, y + 2]], P.line, 0.65);
        vanguardSeam([[x0, y + 1], [x1, y + 3]], P.frameHi, 0.55);
      }
      for (let i = 0; i < 6; i++) {
        const x = x0 + 5 + ((i * 0.381 + seed) % 1) * Math.max(1, x1 - x0 - 10);
        const y = y0 + 6 + ((i * 0.273 + seed) % 1) * Math.max(1, y1 - y0 - 12);
        ctx.fillStyle = P.frame; ellipse(x, y, 1.4, 1.4); ctx.fill();
        vanguardSeam([[x - 1, y - 1], [x + 0.5, y - 1]], P.steel || P.hi, 0.8);
        if (i % 2 === 0) vanguardSeam([[x + 3, y + 4], [x + 7, y + 3]], P.frameHi, 0.6);
      }
    });
  }

  function drawVanguardArm(T, side, sx, sy, P, lc) {
    const p = armPose(T, side);
    if (p.charging) p.ch = T.charge;
    const cannon = p.cannon || p.charging;
    const k = ik(sx, sy, p.x, p.y, cannon ? 96 : 83, cannon ? 120 : 108, 1);
    const steel = P.steel || '#d8e5e9';
    seg(sx, sy, k.jx, k.jy, len => {
      poly([[-12, -19], [len - 5, -20], [len + 7, 16], [-4, 23]], P.frame, P.line);
      // Thanh truyền sáng nằm giữa giáp và bắp tay, không tô đặc cả khớp.
      poly([[8, 12], [len - 3, 9], [len + 1, 20], [12, 27]], P.frameHi, P.line);
      vanguardSeam([[18, 18], [len - 8, 15]], steel, 4);
      poly([[-7, -25], [25, -30], [len - 12, -24], [len - 4, -8], [len - 19, 14], [0, 18]], vGrad(-30, 18, P.hi, P.armor, P.lo), P.line, 2);
      poly([[-7, -25], [25, -30], [len - 12, -24], [len - 18, -17], [19, -18]], P.hi, P.line, 0.8);
      poly([[11, 1], [len - 18, -5], [len - 19, 14], [0, 18]], P.lo, P.line);
      vanguardSeam([[9, -20], [28, -23], [len - 18, -17]], steel);
      vanguardSeam([[11, 6], [len - 24, 2]], P.accent, 2);
      // Sọc trắng đôi trên bắp tay theo ảnh mặt trước.
      for (const x of [21, 32]) poly([[x, -27], [x + 5, -27], [x + 8, -4], [x + 3, -3]], steel, P.line, 0.5);
      vanguardPanel([[38, -20], [len - 17, -19], [len - 19, -5], [42, -3]], P, 0.19);
      for (let i = 0; i < 3; i++) {
        const x = 24 + i * 10;
        vanguardSeam([[x, -12], [x + 5, -2]], P.frame, 2);
      }
    });
    if (p.jet) drawElbowJet(p, k, lc);
    drawVanguardJoint(k.jx, k.jy, 14, P);
    seg(k.jx, k.jy, k.ex, k.ey, len => {
      if (cannon) {
        drawVanguardPlasma(p, len, P);
        return;
      }
      // Giáp cẳng tay vát dài, hai thanh dẫn và bàn tay có đốt.
      poly([[-7, -13], [len + 12, -14], [len + 17, 17], [-8, 19]], P.frame, P.line);
      poly([[4, 13], [len - 10, 14], [len - 8, 24], [17, 27]], P.frameHi, P.line);
      vanguardSeam([[19, 19], [len - 18, 18]], steel, 3);
      poly([[-9, -21], [18, -32], [len * 0.67, -30], [len + 2, -15], [len + 7, 9], [len - 14, 23], [21, 24], [-10, 10]], vGrad(-32, 24, P.hi, P.armor, P.lo), P.line, 2);
      poly([[18, -32], [len * 0.67, -30], [len + 2, -15], [len - 9, -11], [len * 0.59, -21], [10, -23]], P.hi, P.line, 0.8);
      poly([[13, 3], [len - 6, -2], [len + 7, 9], [len - 14, 23], [21, 24]], P.lo, P.line);
      poly([[17, -18], [len * 0.59, -18], [len - 20, -8], [len - 25, 3], [21, 6], [5, -2]], P.armor, P.line);
      vanguardSeam([[19, -16], [len * 0.57, -16], [len - 24, -7]], steel, 1.5);
      // Mảng đỏ dày chạy sát mép giáp và vây bảo vệ ngoài cẳng tay.
      poly([[16, -29], [27, -30], [len - 25, -26], [len - 21, -20], [29, -23], [19, -19]], P.accent, P.line, 0.8);
      poly([[3, 18], [27, 27], [len - 22, 27], [len - 9, 18], [len - 24, 35], [25, 35], [-6, 23]], P.lo, P.line);
      vanguardSeam([[10, 24], [29, 31], [len - 26, 31]], steel, 1.2);
      vanguardSeam([[23, 10], [len - 23, 7], [len - 14, 16]], P.accent, 2);
      vanguardPanel([[20, -17], [len * 0.57, -17], [len - 24, -7], [len - 27, 2], [23, 5]], P, 0.31);
      for (const x of [18, len - 26]) {
        ctx.fillStyle = steel; ellipse(x, -8, 2, 2); ctx.fill();
      }
      // Hai vòng cổ tay, bốn đốt ngón nằm dưới mu bàn tay bọc giáp.
      poly([[len - 9, -16], [len + 5, -15], [len + 9, 17], [len - 7, 20]], steel, P.line);
      poly([[len + 4, -15], [len + 26, -12], [len + 34, -1], [len + 28, 17], [len + 8, 18]], P.armor, P.line, 2);
      poly([[len + 8, -13], [len + 26, -12], [len + 30, -5], [len + 10, -4]], P.hi);
      for (let i = 0; i < 4; i++) {
        const x = len + 8 + i * 5;
        poly([[x, 3], [x + 4, 2], [x + 5, 15], [x + 1, 19]], P.frameHi, P.line, 0.8);
      }
      poly([[len - 1, 14], [len + 6, 13], [len + 12, 27], [len + 4, 29], [len - 3, 23]], P.lo, P.line);
      if (p.blade) drawChainSword(p, len, lc, P);
    });
  }

  function drawVanguardLeg(hx, hy, fx, fy, P, lift) {
    const k = ik(hx, hy, fx, fy - 26, 99, 101, -1);
    const steel = P.steel || '#d8e5e9';
    seg(hx, hy, k.jx, k.jy, len => {
      poly([[-10, -21], [len, -17], [len + 4, 22], [-8, 26]], P.frame, P.line);
      poly([[8, 18], [len - 12, 16], [len - 8, 26], [15, 33]], P.frameHi, P.line);
      vanguardSeam([[18, 25], [len - 17, 22]], steel, 4);
      poly([[-11, -27], [18, -35], [len * 0.66, -31], [len - 9, -19], [len - 6, 8], [len - 20, 21], [9, 26], [-15, 9]], vGrad(-35, 26, P.hi, P.armor, P.lo), P.line, 2);
      poly([[-11, -27], [18, -35], [len * 0.66, -31], [len * 0.61, -21], [17, -23], [-5, -15]], P.hi, P.line, 0.8);
      poly([[6, 2], [len * 0.66, -8], [len - 6, 8], [len - 20, 21], [9, 26]], P.lo, P.line);
      poly([[15, -19], [len * 0.62, -19], [len - 23, -8], [len - 29, 7], [14, 14]], P.armor, P.line);
      vanguardSeam([[7, -22], [20, -28], [len * 0.55, -25]], steel, 1.2);
      vanguardSeam([[16, 12], [len - 29, 5], [len - 23, 13]], P.accent, 2.5);
      poly([[4, -28], [16, -31], [30, -28], [27, -23], [14, -25], [7, -22]], P.accent, P.line, 0.6);
      poly([[30, -18], [len - 25, -14], [len - 23, 2], [len - 35, 9], [29, 7]], P.lo, P.line);
      vanguardPanel([[32, -15], [len - 29, -11], [len - 27, 0], [len - 36, 6], [32, 4]], P, 0.24);
      poly([[len - 31, -15], [len - 23, -12], [len - 25, -7]], steel);
      for (let i = 0; i < 4; i++) {
        const x = len * 0.5 + i * 7;
        vanguardSeam([[x, -14], [x + 7, -6]], P.frame, 1.4);
      }
    });
    seg(k.jx, k.jy, k.ex, k.ey, len => {
      poly([[-7, -17], [len + 5, -14], [len + 6, 22], [-4, 24]], P.frame, P.line);
      // Sau bắp chân lộ cơ khí; mặt trước là tấm giáp lớn vát cạnh.
      poly([[14, 15], [len - 10, 14], [len - 5, 27], [26, 34]], P.frameHi, P.line);
      vanguardSeam([[29, 27], [len - 13, 22]], steel, 4);
      for (let i = 0; i < 5; i++) {
        const x = 30 + i * 10;
        vanguardSeam([[x, 20], [x + 5, 31]], P.frame, 3);
      }
      poly([[-7, -23], [20, -37], [48, -35], [len - 18, -24], [len + 1, -11], [len + 6, 12], [len - 11, 26], [38, 30], [9, 14]], vGrad(-37, 30, P.hi, P.armor, P.lo), P.line, 2);
      poly([[20, -37], [48, -35], [len - 18, -24], [len + 1, -11], [len - 12, -5], [len - 26, -17], [23, -25]], P.hi, P.line, 0.8);
      poly([[14, 0], [len - 20, -3], [len + 6, 12], [len - 11, 26], [38, 30], [9, 14]], P.lo, P.line);
      poly([[24, -24], [len - 30, -18], [len - 16, -3], [len - 21, 14], [41, 19], [22, 7]], P.armor, P.line);
      vanguardSeam([[31, -19], [len - 35, -14], [len - 25, -3], [len - 29, 12]], P.accent, 3);
      vanguardSeam([[27, -27], [47, -26], [len - 24, -16]], steel, 1.2);
      // Chia giáp ống chân thành hai khoang, viền trắng và dải đỏ ngang.
      poly([[42, -29], [48, -28], [51, 17], [45, 20]], P.lo, P.line);
      poly([[43, -29], [47, -28], [49, -18], [45, -19]], steel);
      poly([[50, -27], [54, -26], [55, -18], [51, -18]], P.accent);
      vanguardPanel([[26, -22], [40, -22], [42, 15], [27, 11]], P, 0.43);
      vanguardPanel([[54, -20], [len - 31, -16], [len - 20, -3], [len - 24, 14], [55, 18]], P, 0.08);
      poly([[len - 17, -24], [len - 10, -18], [len - 11, -11], [len - 19, -17]], P.visor || '#f1d084');
      for (const [x, y] of [[24, -16], [43, 15], [len - 17, 8]]) {
        ctx.fillStyle = steel; ellipse(x, y, 1.5, 1.5); ctx.fill();
      }
    });
    // Gối kép có thanh truyền chéo, giáp gối tách khỏi giáp đùi.
    drawVanguardJoint(k.jx - 9, k.jy - 2, 14, P);
    poly([[k.jx - 7, k.jy - 19], [k.jx + 16, k.jy - 21], [k.jx + 28, k.jy - 6], [k.jx + 18, k.jy + 6]], steel, P.line);
    drawVanguardJoint(k.jx + 19, k.jy - 7, 10, P);
    poly([[k.jx + 7, k.jy - 28], [k.jx + 31, k.jy - 24], [k.jx + 39, k.jy - 11], [k.jx + 21, k.jy - 14]], P.armor, P.line);
    ctx.save(); ctx.translate(k.ex, k.ey); ctx.rotate(-lift * 0.25);
    poly([[-22, 1], [-9, -10], [13, -8], [28, 7], [57, 17], [63, 24], [58, 28], [-36, 28], [-40, 20], [-31, 11]], vGrad(-10, 28, P.hi, P.armor, P.lo), P.line, 2);
    poly([[12, -5], [28, 7], [57, 17], [40, 19], [9, 8], [-5, 7]], P.hi, P.line);
    poly([[-39, 22], [59, 22], [63, 27], [58, 30], [-39, 30]], P.frame, P.line);
    vanguardSeam([[-25, 19], [9, 18], [37, 24], [55, 24]], steel, 1.2);
    drawVanguardJoint(0, 0, 12, P);
    poly([[-15, 5], [-7, 12], [-10, 22], [-22, 20], [-27, 12]], P.lo, P.line);
    drawVanguardJoint(-17, 14, 6, P);
    ctx.restore();
  }

  function drawVanguardBody(T, F, B, lc, by, hip, lean, s1, s2, lift1, lift2, crouch, spreadFeet) {
    const steel = F.steel || '#d8e5e9';
    drawVanguardLeg(-19, hip + 6, -35 - 44 * spreadFeet + s2 * (T.moving ? 24 : 0) - crouch * 0.5, -lift2 * 22, B, lift2);
    drawVanguardLeg(17, hip + 6, 25 + 50 * spreadFeet + s1 * (T.moving ? 24 : 0) + crouch * 0.6, -lift1 * 22, F, lift1);
    poly([[-44, hip - 19], [24, hip - 23], [44, hip - 3], [29, hip + 24], [-29, hip + 23], [-47, hip + 6]], F.frame, F.line, 2);
    drawVanguardJoint(-22, hip + 5, 16, F);
    poly([[-38, hip - 15], [-10, hip - 22], [18, hip - 13], [27, hip + 3], [13, hip + 19], [-15, hip + 12], [-37, hip + 14]], F.armor, F.line);
    poly([[-35, hip - 15], [-10, hip - 22], [18, hip - 13], [12, hip - 6], [-13, hip - 10]], F.hi);
    poly([[17, hip - 12], [34, hip - 13], [45, hip + 2], [29, hip + 26], [18, hip + 17]], F.lo, F.line);
    vanguardSeam([[-26, hip - 8], [-8, hip - 13], [11, hip - 5]], F.accent, 2);

    ctx.save();
    ctx.translate(0, hip); ctx.rotate(lean); ctx.translate(0, -hip - BODY_LIFT + by);
    drawVanguardArm(T, 'L', -31, -302, B, lc);
    // Ba tấm tản nhiệt xòe sau cổ và vai theo ảnh lưng.
    poly([[-54, -330], [-60, -386], [-43, -414], [-20, -408], [-25, -349]], B.lo, F.line, 2);
    poly([[-57, -385], [-43, -409], [-24, -405], [-33, -375], [-33, -344]], F.armor, F.line);
    vanguardPanel([[-54, -383], [-42, -405], [-28, -402], [-36, -374], [-37, -351]], F, 0.37);
    vanguardSeam([[-43, -403], [-43, -386], [-39, -371]], F.accent, 1.8);
    poly([[-52, -338], [-86, -377], [-100, -373], [-88, -346], [-66, -320]], B.armor, F.line, 2);
    poly([[-87, -372], [-98, -369], [-84, -348], [-65, -330], [-62, -338]], F.hi, F.line);
    poly([[-35, -350], [-20, -398], [-7, -407], [0, -405], [-13, -381], [-13, -344]], F.lo, F.line);
    vanguardSeam([[-19, -394], [-8, -403], [-1, -402]], steel, 1.5);
    // Trục cơ khí và lò xo màu đồng nằm giữa các mảng giáp lưng.
    poly([[-69, -325], [-51, -329], [-35, -302], [-40, -245], [-58, -230], [-73, -247]], B.frame, F.line);
    for (let i = 0; i < 7; i++) {
      const y = -309 + i * 10;
      poly([[-64, y], [-49, y - 3], [-45, y + 4], [-60, y + 7]], B.frameHi, F.line, 0.7);
      vanguardSeam([[-68, y + 1], [-60, y + 5]], '#9b926e', 2);
    }
    poly([[-75, -315], [-59, -326], [-49, -312], [-53, -284], [-66, -279], [-79, -292]], F.armor, F.line);
    vanguardPanel([[-73, -311], [-60, -319], [-55, -309], [-59, -289], [-68, -286]], F, 0.17);
    // Eo cơ khí gọn, ba vòng giáp bụng xếp chéo nối xuống hông.
    poly([[-37, -236], [31, -238], [29, -162], [-27, -155], [-42, -186]], F.frame, F.line);
    vanguardSeam([[-29, -230], [-33, -178]], steel, 4);
    for (let i = 0; i < 4; i++) {
      const y = -224 + i * 15;
      poly([[-24, y], [24, y - 7], [32, y + 2], [25, y + 12], [-23, y + 15], [-32, y + 6]], vGrad(y - 7, y + 15, F.armor, F.lo, F.frame), F.line);
      vanguardSeam([[-19, y + 2], [22, y - 4]], F.frameHi, 1.5);
    }
    // Ngực nở thành vòm ngang, các đường sườn hội tụ vào lò phản ứng.
    poly([[-53, -317], [-30, -345], [5, -348], [43, -330], [68, -304], [73, -282], [51, -260], [13, -252], [-39, -266]], vGrad(-348, -252, F.hi, F.armor, F.lo), F.line, 2);
    poly([[-27, -338], [7, -340], [43, -324], [65, -303], [67, -293], [29, -310], [-15, -319]], F.armor, F.line);
    vanguardPanel([[-20, -332], [7, -335], [39, -321], [58, -305], [29, -315], [-13, -322]], F, 0.22);
    vanguardSeam([[-16, -324], [21, -320], [52, -306], [65, -294]], steel, 1.5);
    vanguardSeam([[-15, -294], [29, -279], [64, -286]], F.frame, 3);
    // Thân ngực có chiều sâu: lưng tối, giáp cổ và ngực trước chia mặt vát.
    poly([[-52, -306], [-38, -340], [-9, -351], [23, -337], [43, -304], [53, -269], [35, -231], [-10, -220], [-41, -238], [-57, -270]], vGrad(-351, -220, F.hi, F.armor, F.lo), F.line, 2);
    poly([[-38, -340], [-9, -351], [23, -337], [39, -313], [11, -316], [-16, -329], [-43, -321]], F.armor, F.line);
    poly([[-9, -351], [23, -337], [39, -313], [25, -317], [10, -335]], F.hi, F.line, 0.8);
    poly([[-42, -315], [-12, -323], [18, -309], [38, -289], [33, -277], [-7, -284], [-44, -275]], F.lo, F.line);
    for (let i = 0; i < 4; i++) vanguardSeam([[-28, -307 + i * 6], [9, -306 + i * 6]], F.frameHi, 2);
    poly([[14, -310], [38, -305], [51, -278], [44, -260], [27, -271], [13, -289]], F.armor, F.line);
    vanguardSeam([[22, -302], [37, -296], [44, -279]], steel, 1.2);
    poly([[-44, -271], [-10, -278], [31, -256], [35, -231], [8, -220], [-30, -230], [-48, -250]], F.armor, F.line);
    poly([[-43, -263], [-15, -268], [14, -251], [18, -241], [-16, -248]], F.hi, F.line, 0.8);
    vanguardSeam([[-32, -248], [-13, -238], [18, -237]], F.accent, 2.5);
    // Giáp bụng dọc che một phần ống xếp, vẫn để lộ eo cơ khí phía sau.
    poly([[-4, -231], [17, -236], [28, -221], [22, -177], [12, -161], [0, -171]], F.armor, F.line);
    poly([[3, -227], [11, -229], [15, -216], [12, -179], [7, -171]], F.hi, F.line, 0.8);
    vanguardPanel([[15, -223], [23, -218], [18, -184], [14, -176]], F, 0.18);
    // Lò cam tua-bin như ảnh mới; chuyển sang trắng nóng khi tung tuyệt chiêu.
    // Giữ (29,-264) trùng điểm xuất phát chùm tia tối thượng.
    ctx.save(); ctx.translate(29, -264); ctx.scale(0.76, 1);
    drawVanguardJoint(0, 0, 28, F);
    const boost = reactorBoost(T);
    ctx.shadowColor = '#ff9b35'; ctx.shadowBlur = 10 + boost * 40;
    ctx.fillStyle = '#913917'; ellipse(0, 0, 22, 22); ctx.fill();
    ctx.strokeStyle = '#eaaa4a'; ctx.lineWidth = 2; ellipse(0, 0, 20, 20); ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const a = i * PI2 / 12 + game.t * (boost ? 8 : 0.3);
      ctx.save(); ctx.rotate(a);
      poly([[4, -1], [10, -8], [19, -9], [20, -4], [13, -4], [6, 2]], i % 2 ? '#f4a33d' : '#cc6a22', '#ffc064', 0.6);
      ctx.restore();
    }
    ctx.fillStyle = boost ? '#fff8db' : '#ffd77a'; ellipse(0, 0, 5 + boost * 2, 5 + boost * 2); ctx.fill();
    ctx.restore();
    // Cổ có piston, mũ giáp cong và kính vàng hẹp hướng về trước.
    poly([[-13, -340], [-12, -360], [13, -359], [26, -337], [14, -329]], F.frameHi, F.line);
    vanguardSeam([[-5, -354], [5, -337]], steel, 4);
    poly([[-23, -361], [-23, -376], [-13, -390], [5, -396], [23, -390], [34, -379], [37, -366], [30, -349], [12, -341], [-3, -347]], vGrad(-396, -341, F.hi, F.armor, F.lo), F.line, 2);
    poly([[-23, -376], [-13, -390], [5, -396], [23, -390], [30, -381], [8, -385], [-8, -381]], F.armor, F.line, 0.8);
    vanguardSeam([[-14, -386], [4, -391], [19, -386]], steel, 1.5);
    poly([[3, -380], [29, -379], [37, -370], [34, -358], [21, -355], [6, -362], [-1, -370]], F.frame, F.line);
    ctx.save(); ctx.shadowColor = '#f5cf79'; ctx.shadowBlur = 4;
    poly([[8, -373], [27, -373], [32, -368], [28, -365], [20, -363], [9, -367], [5, -370]], F.visor || '#f1d084');
    ctx.restore();
    vanguardSeam([[9, -373], [27, -372], [31, -368]], '#fff0ba', 1.5);
    vanguardSeam([[18, -376], [17, -362]], F.frameHi, 1.4);
    poly([[2, -361], [11, -353], [28, -352], [22, -342], [12, -339], [-2, -348]], F.armor, F.line);
    for (let i = 0; i < 3; i++) vanguardSeam([[12, -350 + i * 3], [23, -351 + i * 3]], F.frame, 1.2);
    drawVanguardJoint(-14, -365, 6, F);
    poly([[0, -393], [4, -394], [9, -381], [5, -380]], F.accent, F.line, 0.7);
    // Mặt nạ cơ khí và lưới tản nhiệt bên dưới kính.
    poly([[10, -360], [17, -357], [21, -346], [16, -341], [8, -348]], F.frameHi, F.line);
    for (let i = 0; i < 4; i++) vanguardSeam([[11 + i * 2, -354], [13 + i * 2, -346]], F.frame, 0.8);
    // Vai gần rộng và nghiêng, phủ lên cánh tay nhưng không che đầu.
    drawSlashTrail(T, -27, -304);
    drawVanguardArm(T, 'R', -27, -304, F, lc);
    // Vai dạng khiên: đỉnh gần ngang, cạnh dưới chéo và hai sọc sáng.
    drawVanguardJoint(-54, -321, 16, F);
    poly([[-67, -340], [-53, -355], [-15, -354], [8, -342], [16, -323], [5, -297], [-13, -278], [-57, -292], [-71, -314]], vGrad(-355, -278, F.hi, F.armor, F.lo), F.line, 2);
    poly([[-67, -340], [-53, -355], [-15, -354], [8, -342], [9, -334], [-19, -343], [-51, -343], [-64, -329]], F.hi, F.line, 0.8);
    poly([[-62, -331], [-51, -340], [-20, -339], [6, -330], [4, -311], [-16, -287], [-54, -299]], F.armor, F.line);
    poly([[-65, -320], [-54, -299], [-16, -287], [4, -311], [5, -297], [-13, -278], [-57, -292], [-71, -314]], F.lo, F.line);
    for (const x of [-47, -35]) poly([[x, -351], [x + 5, -351], [x + 9, -337], [x + 5, -303], [x, -297], [x - 1, -309], [x + 3, -337]], steel, F.line, 0.5);
    vanguardPanel([[-60, -330], [-49, -337], [-22, -335], [-1, -327], [-3, -313], [-19, -292], [-52, -302]], F, 0.49);
    vanguardSeam([[-61, -325], [-54, -303], [-16, -291], [0, -311]], steel, 1);
    vanguardSeam([[-62, -316], [-57, -296], [-16, -283]], F.accent, 1.5);
    ctx.save(); ctx.translate(-21, -307); ctx.rotate(0.14);
    ctx.font = '900 18px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#acb8b8'; ctx.fillText('34', 0, 0); ctx.restore();
    if (T.hp / T.maxHp < 0.7) vanguardSeam([[-16, -332], [-8, -319], [-14, -306]], F.frame, 2);
    rainSheen(-43, 24, -335, -230, 0.13);
    ctx.restore();
  }

  // KIẾM XÍCH: lưỡi kiếm cứng nhiều đốt. Khi rút, các đốt trượt ra nối tiếp nhau dọc một đường thẳng
  // (lộ dây xích năng lượng ở khe nối), rồi khóa chặt thành một lưỡi liền.
  function drawChainSword(p, len, lc, P) {
    const a = p.a;
    const w = a.windup;
    const act = a.m.active;
    let ext;
    if (a.t < w) ext = easeOut(clamp(a.t / w, 0, 1));
    else if (a.t < w + act) ext = 1;
    else ext = 1 - easeInOut(clamp((a.t - w - act) / a.m.recover, 0, 1));
    const n = 7;
    const segLen = 28;
    const base = len + 34;
    const locked = ext > 0.98;
    // vị trí từng đốt: đốt sau chỉ trượt ra khi đốt trước đã ra
    const xs = [];
    let x = base;
    for (let i = 0; i < n; i++) {
      const e = clamp(ext * (n + 2) / 2 - i * 0.5, 0, 1);
      xs.push(x);
      x += lerp(4, segLen + (locked ? 0 : 5), e);
    }
    const tipX = x;
    ctx.save();
    // dây xích năng lượng chạy dọc sống lưỡi
    ctx.shadowColor = lc;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = lc;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(base, 0);
    ctx.lineTo(tipX, 0);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // các đốt lưỡi (thon dần về mũi)
    for (let i = n - 1; i >= 0; i--) {
      const x0 = xs[i];
      const hw = lerp(15, 8, i / (n - 1));
      const hw2 = lerp(15, 8, (i + 1) / (n - 1));
      if (i === n - 1) {
        poly([[x0, -hw], [x0 + segLen, -hw2 * 0.6], [x0 + segLen + 34, 0], [x0 + segLen, hw2 * 0.6], [x0, hw]], P.hi, P.line);
      } else {
        poly([[x0, -hw], [x0 + segLen, -hw2], [x0 + segLen + 4, 0], [x0 + segLen, hw2], [x0, hw]], P.armor, P.line);
      }
      // gờ lưỡi sắc phát sáng
      ctx.save();
      ctx.shadowColor = lc;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = lc;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0, hw);
      ctx.lineTo(x0 + segLen + (i === n - 1 ? 34 : 4), i === n - 1 ? 0 : hw2);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = P.frame;
      ctx.fillRect(x0 + 4, -3, 10, 6);
    }
    // chuôi gắn vào cẳng tay
    rr(len + 20, -18, 18, 36, 4);
    ctx.fillStyle = P.frame;
    ctx.fill();
    ctx.fillStyle = P.accent;
    ctx.fillRect(len + 24, -18, 6, 36);
    ctx.restore();
  }

  // VANGUARD theo plasma.jpeg: giáp mở hai bên, cáp lộ ra, ngón tay tách quanh họng.
  function drawVanguardPlasma(p, len, P) {
    const a = p.a;
    const deploy = p.ch
      ? easeOut(clamp(p.ch.t / 0.2, 0, 1))
      : 1 - easeInOut(clamp((a.t - a.windup - a.m.active) / a.m.recover, 0, 1));
    const charge = clamp(p.ch ? p.ch.level : a.level || 0, 0, 1);
    const firing = !!a && a.t >= a.windup && a.t < a.windup + a.m.active + 0.06;
    const steel = P.steel || P.hi;
    const muzzle = len + 24;
    // Khung cẳng tay giữ nguyên độ dài, không mọc thêm một nòng súng dài.
    poly([[-8, -17], [len - 7, -20], [len + 24, -12], [len + 26, 13], [len - 7, 23], [-7, 18]], P.frame, P.line, 2);
    poly([[3, -17], [24, -24], [42, -20], [43, 18], [23, 24], [0, 16]], P.armor, P.line);
    poly([[9, -18], [24, -24], [40, -20], [37, -14], [18, -11]], P.hi, P.line, 0.7);
    // Ba ray dọc và bó cáp uốn thành nhánh trước vòng tụ plasma.
    for (let i = 0; i < 3; i++) {
      const y = -11 + i * 11;
      poly([[32, y - 3], [len - 10, y - 3], [len + 6, y], [len - 10, y + 3], [32, y + 3]], P.frameHi, P.line, 0.8);
      vanguardSeam([[35, y - 1], [len - 14, y - 1], [len + 3, y + 1]], steel, 1);
    }
    for (let i = 0; i < 5; i++) {
      const y = -14 + i * 7;
      const points = [[38, y], [58, y - 3], [76, y + (i % 2 ? 4 : -5)], [len - 34, y * 0.8], [len - 8, y * 0.65]];
      vanguardSeam(points, P.frame, 4);
      vanguardSeam(points, i % 2 ? steel : P.frameHi, 1.5);
    }
    // Hai nắp giáp lớn có bản lề, mở lên trên và xuống dưới cẳng tay.
    for (const side of [-1, 1]) {
      ctx.save(); ctx.scale(1, side);
      const gap = 15 * deploy;
      poly([[22, 18], [36, 18 + gap], [len - 26, 25 + gap], [len - 5, 18], [len - 16, 9], [42, 9]], P.frameHi, P.line);
      for (const x of [40, len - 32]) {
        vanguardSeam([[x, 11], [x + 6, 21 + gap]], steel, 3);
        drawVanguardJoint(x + 6, 21 + gap, 4, P);
      }
      const plate = [[15, 22 + gap], [34, 33 + gap], [len - 30, 35 + gap], [len - 7, 25 + gap], [len - 19, 16 + gap], [39, 15 + gap]];
      poly(plate, vGrad(15 + gap, 35 + gap, P.hi, P.armor, P.lo), P.line, 2);
      poly([[34, 33 + gap], [len - 30, 35 + gap], [len - 7, 25 + gap], [len - 16, 36 + gap], [len - 32, 44 + gap], [36, 41 + gap]], P.lo, P.line);
      vanguardSeam([[23, 25 + gap], [42, 21 + gap], [len - 23, 22 + gap]], steel, 1.2);
      vanguardPanel(plate, P, side < 0 ? 0.18 : 0.56);
      // Ngàm/ngón tay mở ra phía trước, có bản lề và hai đốt rõ ràng.
      const spread = 13 * deploy;
      poly([[len - 22, 13], [len - 5, 17 + spread], [len + 24, 25 + spread], [len + 47, 20 + spread], [len + 51, 12 + spread], [len + 27, 17 + spread], [len + 2, 9 + spread], [len - 18, 6]], P.armor, P.line, 1.5);
      vanguardSeam([[len - 7, 16 + spread], [len + 24, 22 + spread], [len + 44, 17 + spread]], steel, 1.4);
      drawVanguardJoint(len - 8, 12 + spread, 6, P);
      drawVanguardJoint(len + 25, 21 + spread, 4, P);
      // Cụm ngón phía sau gập ra ngoài, để lộ khoảng rỗng trong lòng bàn tay.
      poly([[len - 29, 26 + gap], [len - 23, 44 + gap], [len - 4, 49 + gap], [len + 10, 42 + gap], [len + 9, 28 + gap], [len - 1, 24 + gap]], P.lo, P.line);
      poly([[len - 19, 30 + gap], [len - 15, 40 + gap], [len - 5, 42 + gap], [len + 3, 37 + gap], [len + 2, 29 + gap]], P.frame, steel, 0.7);
      ctx.restore();
    }
    // Vòng cổ ngắn, họng elip nhìn nghiêng và thấu kính trắng ở tâm.
    poly([[len - 10, -18], [muzzle, -19], [muzzle + 3, 18], [len - 10, 20]], P.lo, P.line);
    vanguardSeam([[len - 5, -17], [len - 5, 18]], steel, 3);
    ctx.fillStyle = P.frame; ellipse(muzzle, 0, 11, 22); ctx.fill();
    ctx.strokeStyle = steel; ctx.lineWidth = 3; ellipse(muzzle + 1, 0, 9, 19); ctx.stroke();
    ctx.save();
    ctx.shadowColor = '#429dff'; ctx.shadowBlur = 12 + charge * 18;
    ctx.fillStyle = '#1956ad'; ellipse(muzzle + 3, 0, 8, 17); ctx.fill();
    ctx.strokeStyle = '#65c8ff'; ctx.lineWidth = 2; ellipse(muzzle + 4, 0, 6, 14); ctx.stroke();
    ctx.fillStyle = '#e6faff'; ellipse(muzzle + 5, 0, 4 + charge * 2, 10 + charge * 3); ctx.fill();
    // Hồ quang xanh không đều giữa các ngàm, sáng mạnh khi nạp đầy.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const angle = game.t * 7 + i * PI2 / 5;
      const reach = 19 + charge * 20 + (firing ? 12 : 0);
      const y = Math.sin(angle) * reach;
      const x = muzzle + Math.cos(angle) * reach * 0.6;
      vanguardSeam([[muzzle + 4, 0], [muzzle + 7 + Math.sin(game.t * 28 + i) * 6, y * 0.35], [x - 5, y * 0.65], [x + 3, y]], i % 2 ? '#89d4ff' : '#397aff', 1.2 + charge);
    }
    if (firing) {
      const g = ctx.createRadialGradient(muzzle + 8, 0, 1, muzzle + 8, 0, 54);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, '#afddff'); g.addColorStop(1, 'rgba(40,100,255,0)');
      ctx.fillStyle = g; ellipse(muzzle + 8, 0, 54, 42); ctx.fill();
    }
    ctx.restore();
  }

  // 0 → 1: lò phản ứng sáng rực khi VANGUARD tung chiêu đặc biệt
  function reactorBoost(T) {
    return T.beaming && T.def.ult === 'reactor' ? 1 : 0;
  }

  // Mỗi lần game gọi vào: lấy ctx hiện tại của game rồi mới vẽ.
  const withCtx = (fn) => (...args) => { ctx = core.ctx(); return fn(...args); };
  window.TitanFrames = window.TitanFrames || {};
  window.TitanFrames.vanguard = { drawBody: withCtx(drawVanguardBody), reactorBoost: withCtx(reactorBoost) };
})();
