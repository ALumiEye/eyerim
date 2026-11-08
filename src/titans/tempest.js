/* Tempest — bộ vẽ của GAME. Tách nguyên trạng từ src/game.js (refactor, không đổi hình).
 * Phần dùng chung với Vanguard: src/titans/common/frame.js.
 */
(() => {
  'use strict';
  const core = window.EyeRimCore && window.EyeRimCore.frame;
  const common = window.TitanFrames && window.TitanFrames.common;
  if (!core || !common) return;
  const { BODY_LIFT, LAUNCHER, MISSILE_RELOAD, clamp, easeOut, ellipse, fx, ik, poly, rr, seg, vGrad } = core;
  const { TEMPEST_LAUNCH_ARMS, armPose, drawSlashTrail, launcherOpen } = common;
  let ctx; // canvas hiện tại của game (trang xưởng có thể đổi), lấy lại mỗi lần vẽ

  // TEMPEST: góc nghiêng khí động học, vai vòm và đường viền vàng/xanh.
  function drawTempestShoulder(x, y, P, side) {
    ctx.save(); ctx.translate(x, y); ctx.scale(side, 1);
    poly([[-23, 10], [-30, -9], [-25, -32], [-11, -43], [16, -45], [35, -35], [44, -18], [41, 4], [27, 18], [3, 22]], P.armor, P.line, 2);
    poly([[-25, -32], [-11, -43], [16, -45], [35, -35], [40, -23], [12, -31], [-10, -27]], P.accent, P.line);
    poly([[-10, -27], [12, -31], [40, -23], [41, -3], [27, 18], [3, 22], [-15, 10]], P.hi, P.line);
    poly([[24, -22], [40, -23], [41, -3], [27, 18], [15, 17]], P.armor);
    ctx.strokeStyle = P.trim || P.lo; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-19, -25); ctx.lineTo(11, -35); ctx.lineTo(34, -29); ctx.stroke();
    ctx.strokeStyle = P.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(5, -5); ctx.lineTo(26, 5); ctx.stroke();
    ctx.restore();
  }

  function drawTempestArm(T, side, sx, sy, P, lc) {
    const p = armPose(T, side);
    const k = ik(sx, sy, p.x, p.y, 83, 94, 1);
    seg(sx, sy, k.jx, k.jy, (len) => {
      poly([[-8, -16], [len + 4, -15], [len + 4, 17], [-8, 18]], P.frame, P.line);
      poly([[3, -22], [len * 0.6, -24], [len - 5, -13], [len - 9, 14], [0, 15]], P.armor, P.line);
      poly([[3, -22], [len * 0.6, -24], [len * 0.55, -14], [2, -12]], P.hi);
      poly([[len * 0.48, -24], [len * 0.74, -20], [len * 0.78, 14], [len * 0.56, 17]], P.accent, P.line, 1);
      ctx.strokeStyle = P.trim || P.lo; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(len * 0.56, -22); ctx.lineTo(len * 0.63, 14); ctx.stroke();
      ctx.fillStyle = P.hi; ctx.fillRect(12, 14, Math.max(1, len - 30), 3);
    });
    drawJointDisc(k.jx, k.jy, 15, P);
    seg(k.jx, k.jy, k.ex, k.ey, (len) => {
      poly([[-10, -16], [len + 9, -15], [len + 12, 17], [-4, 19]], P.frame, P.line);
      // Cẳng tay hình khiên lớn, hai vây ngắn phía sau và ổ trục tròn xanh lam.
      for (let i = 0; i < 2; i++) {
        const x = 13 + i * 27;
        poly([[x, 12], [x + 10, 35], [x + 22, 36], [x + 25, 17]], P.armor, P.line);
        poly([[x + 7, 27], [x + 10, 35], [x + 22, 36], [x + 23, 29]], P.accent);
      }
      poly([[-5, -21], [25, -31], [len - 18, -25], [len + 4, -8], [len - 5, 23], [len * 0.45, 30], [4, 17]], P.armor, P.line, 2);
      poly([[-5, -21], [25, -31], [len - 18, -25], [len - 25, -16], [22, -19]], P.hi, P.line, 1);
      ctx.fillStyle = P.trim || P.lo; ellipse(len * 0.44, -1, 17, 17); ctx.fill();
      ctx.strokeStyle = P.hi; ctx.lineWidth = 2; ellipse(len * 0.44, -1, 12, 12); ctx.stroke();
      ctx.fillStyle = P.accent; ellipse(len * 0.44, -1, 9, 9); ctx.fill();
      ctx.strokeStyle = P.frame; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(len * 0.44 - 1, -8); ctx.lineTo(len * 0.44 - 1, 6); ctx.stroke();
      poly([[len - 8, -16], [len + 25, -15], [len + 32, -3], [len + 24, 18], [len - 7, 17]], P.frame, P.line);
      for (let i = 0; i < 3; i++) poly([[len + 12, -12 + i * 10], [len + 26, -10 + i * 10], [len + 23, -4 + i * 10], [len + 10, -5 + i * 10]], P.lo, P.line, 1);
      drawWristBlade(p, len, P);
    });
  }

  function drawTempestBody(T, F, B, lc, by, hip, lean, s1, s2, lift1, lift2, crouch, spreadFeet) {
    drawTitanLeg(-22, hip + 6, -28 - 44 * spreadFeet + s2 * (T.moving ? 24 : 0) - crouch * 0.5, -lift2 * 22, B, lift2);
    ctx.save();
    ctx.translate(0, hip); ctx.rotate(lean); ctx.translate(0, -hip - BODY_LIFT);
    drawTempestArm(T, 'L', -30, -292 + by, B, lc);
    drawTempestShoulder(-34, -301 + by, B, -1);
    ctx.restore();
    drawTitanLeg(22, hip + 6, 31 + 50 * spreadFeet + s1 * (T.moving ? 24 : 0) + crouch * 0.6, -lift1 * 22, F, lift1);
    // Hông hẹp với giáp nhọn, tương phản với hai vai rộng.
    poly([[-43, hip - 19], [35, hip - 19], [44, hip + 7], [14, hip + 27], [-37, hip + 18]], F.frame, F.line);
    poly([[-42, hip - 15], [-8, hip - 19], [-12, hip + 16], [-34, hip + 23], [-46, hip + 6]], B.armor, B.line);
    poly([[0, hip - 19], [36, hip - 15], [45, hip + 5], [19, hip + 23], [3, hip + 11]], F.armor, F.line);
    poly([[-6, hip - 12], [11, hip - 11], [17, hip + 11], [4, hip + 27], [-9, hip + 8]], F.lo, F.line);
    ctx.save();
    ctx.translate(0, hip); ctx.rotate(lean); ctx.translate(0, -hip - BODY_LIFT + by);
    // Vây lưng dạng lưỡi nhọn sau hai vai.
    poly([[-62, -271], [-77, -337], [-70, -397], [-44, -415], [-43, -352], [-27, -301]], B.armor, B.line, 2);
    poly([[-70, -397], [-44, -415], [-43, -401], [-63, -385]], B.hi, B.line, 1);
    poly([[-74, -321], [-90, -309], [-82, -269], [-55, -257]], B.armor, B.line);
    poly([[-74, -266], [-81, -208], [-66, -196], [-50, -257]], B.lo, B.line);
    ctx.strokeStyle = B.line; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(-64, -384 + i * 12); ctx.lineTo(-49, -392 + i * 12); ctx.stroke();
    }
    poly([[-34, -232], [37, -232], [28, -166], [-25, -166]], F.frame, F.line);
    // Bụng cơ khí chia đốt hình chữ V.
    for (let i = 0; i < 4; i++) {
      const y = -221 + i * 13;
      const w = 31 - i * 2;
      poly([[-w, y], [0, y + 5], [w, y - 1], [w - 2, y + 8], [0, y + 14], [-w + 2, y + 8]], i % 2 ? F.lo : F.frameHi, F.line, 1);
    }
    // Giáp ngực rộng hình tam giác, không có lò phản ứng tròn.
    poly([[-46, -310], [-23, -330], [21, -328], [54, -301], [68, -268], [50, -237], [18, -216], [-30, -231], [-48, -269]], F.armor, F.line, 2);
    poly([[-23, -330], [21, -328], [54, -301], [61, -281], [26, -288], [-25, -305]], F.hi, F.line);
    poly([[26, -288], [61, -281], [68, -268], [50, -237], [18, -216], [23, -247]], F.lo, F.line);
    poly([[-48, -269], [-22, -277], [-10, -237], [18, -216], [-30, -231]], F.lo, F.line);
    ctx.strokeStyle = F.trim; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-21, -308); ctx.lineTo(23, -294); ctx.lineTo(57, -280); ctx.stroke();
    poly([[-17, -323], [8, -326], [22, -303], [12, -291], [-16, -293], [-26, -306]], F.frame, F.line);
    ctx.fillStyle = F.accent;
    ctx.fillRect(-12, -309, 23, 3);
    // Sáu tên lửa vẫn thẳng với tọa độ phóng trong logic hiện tại.
    drawChestLauncher(T, 0, F, lc);
    // Đèn đỏ nằm dọc mép ngực vát như ảnh tham chiếu, không che các ống phóng.
    poly([[39, -282], [54, -275], [51, -251], [37, -242]], F.frame, F.line);
    ctx.fillStyle = '#dc4849';
    for (let i = 0; i < 4; i++) {
      poly([[40, -275 + i * 6], [48, -273 + i * 6], [47, -270 + i * 6], [40, -271 + i * 6]], '#dc4849');
    }
    // Cổ giáp cao bao hai bên đầu nhỏ.
    poly([[-38, -316], [-35, -346], [-22, -352], [-13, -328], [0, -318]], F.armor, F.line);
    poly([[27, -327], [40, -352], [48, -344], [50, -317], [33, -307]], F.lo, F.line);
    drawSensorHead(-340, F, lc);
    // Ký hiệu nhỏ trên ngực.
    ctx.save(); ctx.translate(-43, -294); ctx.rotate(-0.12);
    ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = F.frame; ctx.fillText('TEMPEST', 0, 0); ctx.fillText('E-05', 0, 10); ctx.restore();
    drawSlashTrail(T, -18, -291);
    // L: cả khớp vai phải lùi ra sau cùng tay, không che ống phóng góc trên bên trái.
    const shoulderBack = TEMPEST_LAUNCH_ARMS.R.back * easeOut(launcherOpen(T));
    drawTempestArm(T, 'R', -18 - shoulderBack, -291, F, lc);
    drawTempestShoulder(-21 - shoulderBack, -303, F, 1);
    if (T.hp / T.maxHp < 0.7) {
      ctx.strokeStyle = F.frame; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-53, -312); ctx.lineTo(-43, -294); ctx.lineTo(-49, -281); ctx.stroke();
    }
    ctx.restore();
  }

  // Vệt chém sáng (vẽ trong hệ toạ độ thân Titan, quanh vai trước).
  // TEMPEST: lưỡi kim loại gập dọc mặt ngoài cẳng tay; khi chém thì bật ra phía trước nắm đấm.
  function drawWristBlade(p, len, P) {
    let ext = 0;
    if (p.wrist && p.a) {
      const a = p.a;
      const w = a.windup;
      if (a.t < w) ext = a.t / w;
      else if (a.t < w + a.m.active + a.m.recover * 0.5) ext = 1;
      else ext = 1 - clamp((a.t - w - a.m.active - a.m.recover * 0.5) / (a.m.recover * 0.5), 0, 1);
    }
    ext = easeOut(ext);
    const base = len * 0.2;
    const L = len * 0.85 + 95 * ext;
    const yOff = -30 + 16 * ext; // bật từ mép giáp ra thẳng trục cẳng tay
    // Hai lưỡi song song, sống tối và lưỡi vát bạc của Tempest.
    for (const dy of [-8, 8]) {
      const tip = base + L - (dy > 0 ? 12 : 0);
      poly([[base, yOff + dy - 3], [tip - 28, yOff + dy - 7], [tip + 18, yOff + dy], [tip - 22, yOff + dy + 6], [base, yOff + dy + 5]], P.lo, P.line);
      poly([[base + 7, yOff + dy - 1], [tip - 27, yOff + dy - 4], [tip + 18, yOff + dy], [tip - 22, yOff + dy + 2]], P.hi);
      ctx.fillStyle = P.accent;
      ctx.fillRect(base + 8, yOff + dy, 20, 3);
    }
  }

  // Khớp tròn cơ khí (gối, cổ chân): vòng khung tối, đĩa giáp, trục giữa.
  function drawJointDisc(x, y, r, P) {
    ellipse(x, y, r, r);
    ctx.fillStyle = P.frame;
    ctx.fill();
    ellipse(x, y, r * 0.72, r * 0.72);
    ctx.fillStyle = vGrad(y - r, y + r, P.frameHi, P.lo, P.frame);
    ctx.fill();
    ctx.strokeStyle = P.line;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ellipse(x, y, r * 0.3, r * 0.3);
    ctx.fillStyle = P.hi;
    ctx.fill();
  }

  // Chân hạng nặng: đùi khối, khớp gối tròn lớn, ống chân giáp nhiều lớp có khe tản nhiệt,
  // khớp cổ chân tròn và bàn chân to bè.
  function drawTitanLeg(hx, hy, fx, fy, P, lift) {
    // Tổng chiều dài chân ≈ khoảng cách hông–cổ chân khi đứng → chân gần như thẳng;
    // chỉ gập gối khi thủ, nhún hoặc nhấc chân bước.
    const k = ik(hx, hy, fx, fy - 26, 94, 100, -1);
    const armorG = (a, b) => vGrad(a, b, P.hi, P.armor, P.lo);
    // đùi: khung + piston thủy lực phía sau + giáp trước
    seg(hx, hy, k.jx, k.jy, (len) => {
      ctx.scale(1, 1.35); // đùi dày
      rr(-10, -20, len + 14, 40, 14);
      ctx.fillStyle = P.frame;
      ctx.fill();
      // piston (mặt sau đùi)
      ctx.fillStyle = P.frameHi;
      ctx.fillRect(len * 0.15, 12, len * 0.6, 8);
      ctx.fillStyle = P.lo;
      ctx.fillRect(len * 0.55, 14, len * 0.35, 4);
      // giáp đùi trước, hai lớp chồng
      poly([[0, -26], [len * 0.55, -28], [len * 0.62, -6], [4, 2]], armorG(-28, 2), P.line);
      poly([[len * 0.5, -25], [len - 2, -22], [len + 2, -2], [len * 0.56, -4]], armorG(-25, -2), P.line);
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(8, -18);
      ctx.lineTo(len * 0.5, -20);
      ctx.stroke();
    });
    // ống chân: khung + giáp lớn loe dần về cổ chân
    seg(k.jx, k.jy, k.ex, k.ey, (len) => {
      ctx.scale(1, 1.3); // ống chân dày
      rr(-6, -16, len + 8, 32, 10);
      ctx.fillStyle = P.frame;
      ctx.fill();
      poly([[2, -24], [len * 0.45, -28], [len - 2, -30], [len + 6, -20], [len + 4, 10], [len * 0.5, 6], [4, 4]], armorG(-30, 10), P.line);
      // tấm giáp phụ phía sau bắp chân
      poly([[len * 0.15, 8], [len * 0.7, 10], [len * 0.62, 24], [len * 0.2, 20]], armorG(8, 24), P.line);
      // khe tản nhiệt
      ctx.strokeStyle = P.frame;
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 4; i++) {
        const x = len * (0.5 + i * 0.1);
        ctx.beginPath();
        ctx.moveTo(x, -22);
        ctx.lineTo(x + 6, -8);
        ctx.stroke();
      }
      // chỉ màu dọc mép giáp
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(6, -20);
      ctx.lineTo(len * 0.42, -24);
      ctx.stroke();
    });
    // khớp gối tròn lớn + mảnh giáp chụp phía trên
    drawJointDisc(k.jx, k.jy, 23, P);
    ctx.save();
    ctx.translate(k.jx, k.jy);
    ctx.scale(1.25, 1.25);
    poly([[4, -26], [22, -20], [28, -4], [18, 0], [8, -12]], armorG(-26, 0), P.line);
    ctx.restore();
    // bàn chân
    ctx.save();
    ctx.translate(k.ex, k.ey);
    ctx.rotate(-lift * 0.25);
    ctx.translate(0, 26);
    ctx.scale(1.2, 1.2);
    ctx.translate(0, -26);
    poly([[-34, 26], [52, 26], [50, 14], [30, 4], [8, -6], [-18, -6], [-32, 8]], P.frame, P.line);
    // giáp mu bàn chân
    poly([[-10, -4], [16, -8], [40, 8], [36, 16], [-6, 14]], armorG(-8, 16), P.line);
    // mũi chân + gót
    poly([[34, 12], [54, 16], [54, 26], [32, 26]], P.lo, P.line);
    poly([[-36, 14], [-20, 10], [-20, 26], [-38, 26]], P.lo, P.line);
    ctx.fillStyle = P.accent;
    ctx.fillRect(4, 16, 22, 3);
    ctx.restore();
    // khớp cổ chân tròn (vẽ sau cùng để nằm trên bàn chân)
    drawJointDisc(k.ex, k.ey, 16, P);
  }

  // TEMPEST: đầu nhỏ thấp giữa cổ giáp, kính đen hẹp, không mắt tròn.
  function drawSensorHead(hy, F, lc) {
    ctx.save();
    ctx.translate(7, hy + 4);
    // Gáy vát và hai má giáp ôm sát đầu.
    poly([[-29, -12], [-21, -30], [-5, -36], [20, -31], [32, -18], [34, 0], [21, 13], [-12, 12], [-25, 2]], F.armor, F.line);
    poly([[-21, -30], [-5, -36], [20, -31], [29, -21], [4, -24], [-14, -21]], F.hi, F.line, 1);
    poly([[-29, -12], [-14, -21], [-12, 6], [-22, 5]], F.lo, F.line);
    poly([[-9, -17], [27, -17], [32, -8], [22, -2], [-9, -5]], F.frame, F.line);
    // Hai khe mắt rất hẹp, ngăn nhau bởi sống mũi bọc giáp.
    ctx.fillStyle = '#a8c9c6';
    ctx.fillRect(-4, -12, 12, 2);
    ctx.fillRect(15, -11, 11, 2);
    poly([[9, -18], [14, -17], [17, 0], [10, 5], [5, 0]], F.hi, F.line, 1);
    poly([[-9, -3], [6, 3], [21, 0], [24, 8], [14, 14], [-4, 10]], F.lo, F.line);
    ctx.fillStyle = F.frame;
    for (let i = 0; i < 3; i++) ctx.fillRect(0, 4 + i * 3, 11, 1);
    poly([[25, -20], [34, -14], [36, 1], [27, 9], [24, 0]], F.armor, F.line);
    ctx.restore();
  }

  // TEMPEST: ngực là bệ phóng 6 ống (3×2). Hai nắp giáp trượt lên/xuống để lộ đầu đạn.
  function drawChestLauncher(T, by, F, lc) {
    const open = easeOut(launcherOpen(T));
    const cx = LAUNCHER.x;
    const cy = LAUNCHER.y + by;
    const w = 66;
    const h = 50;
    ctx.save();
    ctx.translate(cx, cy);
    // khung bệ
    poly([[-w / 2 - 6, -h / 2 - 4], [w / 2 + 8, -h / 2 - 6], [w / 2 + 12, h / 2 + 2], [-w / 2 - 4, h / 2 + 6]], F.frameHi, F.line, 2);
    rr(-w / 2, -h / 2, w, h, 5);
    ctx.fillStyle = '#0b0d10';
    ctx.fill();
    // 6 ống phóng + đầu đạn
    const ready = T.missileCD > 0 ? Math.floor(6 * (1 - T.missileCD / MISSILE_RELOAD)) : 6;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        const loaded = r * 3 + c < ready;
        const x = -w / 2 + 12 + c * 21;
        const y = -h / 2 + 13 + r * 24;
        ellipse(x, y, 8.5, 8.5);
        ctx.fillStyle = F.frame;
        ctx.fill();
        ctx.strokeStyle = F.frameHi;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        if (loaded) {
          ellipse(x, y, 5, 5);
          ctx.fillStyle = '#d9dee4';
          ctx.fill();
          ellipse(x, y, 2.4, 2.4);
          ctx.fillStyle = open > 0.5 ? '#ffd36b' : F.accent;
          ctx.fill();
        }
      }
    }
    // hai nắp giáp trượt ra trên/dưới
    const slide = open * (h / 2 + 2);
    ctx.save();
    rr(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 5);
    ctx.clip();
    poly([[-w / 2 - 2, -h / 2 - 2 - slide], [w / 2 + 2, -h / 2 - 2 - slide], [w / 2 + 2, -slide], [-w / 2 - 2, -slide]], vGrad(-h / 2, 0, F.hi, F.armor, F.lo), F.line);
    poly([[-w / 2 - 2, slide], [w / 2 + 2, slide], [w / 2 + 2, h / 2 + 2 + slide], [-w / 2 - 2, h / 2 + 2 + slide]], vGrad(0, h / 2, F.armor, F.lo, F.lo), F.line);
    ctx.fillStyle = F.accent;
    ctx.fillRect(-w / 2 + 6, -6 - slide, w - 12, 3);
    ctx.fillRect(-w / 2 + 6, 3 + slide, w - 12, 3);
    ctx.restore();
    // đèn trạng thái hai bên (theo màu Link)
    ctx.save();
    ctx.shadowColor = lc;
    ctx.shadowBlur = 14;
    ctx.fillStyle = lc;
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(-w / 2 - 12, -h / 2 + 6 + i * 14, 4, 8);
      ctx.fillRect(w / 2 + 10, -h / 2 + 6 + i * 14, 4, 8);
    }
    ctx.restore();
    // khói/chớp lửa khi vừa phóng
    if (T.muzzle > 0 && T.def.missiles) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,210,120,${T.muzzle / 0.12 * 0.8})`;
      ellipse(0, 0, w * 0.7, h * 0.7);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // Mỗi lần game gọi vào: lấy ctx hiện tại của game rồi mới vẽ.
  const withCtx = (fn) => (...args) => { ctx = core.ctx(); return fn(...args); };
  window.TitanFrames = window.TitanFrames || {};
  window.TitanFrames.tempest = { drawBody: withCtx(drawTempestBody) };
})();
