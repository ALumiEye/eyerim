/* Bastion — bộ vẽ Titan. Bản NHÁP thiết kế: titans/bastion.js (trang xưởng titans/bastion.html);
 * bản GAME: src/titans/bastion.js, chỉ cập nhật bằng `npm run promote bastion` (chép nháp → game sau khi test qua).
 * Giáp và pháo bám năm ảnh người dùng; cụm lưng theo ảnh tham chiếu thứ 5.
 * Góc ngang 3/4, tư thế sẵn sàng.
 * Giữ chung các ô chiêu S/W/F/J/K/L/I với Vanguard và Tempest.
 */
(() => {
  'use strict';
  // Trang xưởng: TitanGallery; trong game: EyeRimCore (src/game.js nạp trước file này).
  const base = window.TitanGallery || window.EyeRimCore;
  if (!base) return;
  const normalPalette = {
    edge: '#172125', frame: '#243036', dark: '#34413f', deep: '#404d48',
    armor: '#788174', light: '#b5ba9f', mid: '#969e89', shadow: '#535f54',
    steel: '#7c8d8d', rim: '#d6d7bf', red: '#a84c3b', redDark: '#63372f',
    blue: '#45bee8', glass: '#123747', cream: '#efe3cc',
  };
  // Cùng nhịp lóe giáp trắng của hai Titan cũ, không phủ trắng nền canvas.
  const hitPalette = {
    ...normalPalette, edge: 'rgba(8,14,22,.4)', frame: '#8a96a6', dark: '#b4c0cc',
    deep: '#c4ccd6', armor: '#f4f7fa', light: '#ffffff', mid: '#f4f7fa',
    shadow: '#c4ccd6', steel: '#d8e5e9', rim: '#ffffff', red: '#ffd0a0', redDark: '#c4ccd6',
  };
  let P = normalPalette;
  const names = {
    idle: 'Đứng nghỉ', walk: 'Bước đi', guard: 'S · Đỡ đòn', dash: 'W · Lướt né',
    jab: 'F · Đấm phải', hook: 'J · Đấm trái', blade: 'K · Búa móc lên', cannon: 'L · Tên lửa kép',
    special: 'I · Búa phản lực', ultimate: 'Loạt pháo kép', celebrate: 'Ăn mừng', stagger: 'Trúng đòn',
  };
  // Cùng nhịp F/J của Vanguard; khoảng nghỉ chỉ dành cho vòng xem mẫu.
  const punchTimings = {
    jab: { windup: .07, active: .08, recover: .16, pause: .7 },
    hook: { windup: .1, active: .08, recover: .22, pause: .7 },
  };
  function punchPose(clip, time) {
    const m = punchTimings[clip];
    const duration = m.windup + m.active + m.recover;
    const phase = time % (duration + m.pause);
    return envelope(phase, 0, m.windup, m.windup + m.active, duration);
  }
  // K: tay trái vươn ra → khóa búa dưới eo → móc nhanh lên → thu tay/giáp.
  const hammerPeriod = 2;
  function hammerPose(time) {
    const phase = ((time % hammerPeriod) + hammerPeriod) % hammerPeriod;
    const cock = envelope(phase, 0, .3, .49, .78);
    // Móc trong 0,10 giây, khóa đỉnh ngắn rồi thu; không kéo cả thân đi theo.
    const rise = envelope(phase, .32, .42, .49, .78);
    return {
      morph: envelope(phase, .04, .26, .73, .98),
      upper: 1.14 + cock * .45 - rise * 1.69,
      lower: -.23 + cock * .95 - rise * 1.72,
      extension: rise * 22,
    };
  }
  // Hai quả cùng rời nòng một lúc; dùng thời gian để tua gallery không sinh thêm đạn.
  function missileVolley(time) {
    const phase = ((time % 2.4) + 2.4) % 2.4;
    const age = phase - 1.02;
    if (age < 0 || age >= .72) return [];
    return [
      { x: -32, y: -562, tilt: 1.575 },
      { x: -42, y: -612, tilt: 1.53 },
    ].map((mount, index) => {
      const angle = mount.tilt - Math.PI / 2;
      const distance = 202 + 63 + age * 560;
      return {
        x: mount.x + Math.cos(angle) * distance,
        y: mount.y + Math.sin(angle) * distance,
        angle, age, near: index === 1,
        alpha: 1 - smooth((age - .6) / .12),
      };
    });
  }
  // Chiều cao vẽ độc lập hoàn toàn với số mét ghi trong hồ sơ Titan.
  const crown = 540, sole = 9;
  // Đỉnh mũ y=-540; pháo vai nhô cao không tham gia đo H.
  const modelScale = base.scaleToDrawingHeight(crown, sole);
  // Tầm khóa đòn I đo theo chiều cao vẽ, không lấy số mét hư cấu.
  const jetSlam = { reach: 2 * (crown + sole), period: 3.2, impactAt: 1.08 };
  function jetSlamPose(time) {
    const phase = ((time % jetSlam.period) + jetSlam.period) % jetSlam.period;
    const ready = envelope(phase, .05, .3, 1.18, 1.6);
    const strike = envelope(phase, .87, jetSlam.impactAt, 1.18, 1.6);
    const travel = smooth((phase - .3) / .78) * (1 - smooth((phase - 1.7) / .8));
    const lift = smooth((phase - .22) / .46) * (1 - smooth((phase - .79) / .29));
    // Mép đầu búa chạm mốc khóa mục tiêu đúng lúc hạ đòn.
    const hammerReach = -48 + 80 * Math.cos(.2) + 144 * Math.cos(.7) + 45 * Math.cos(.62);
    return {
      phase, x: (jetSlam.reach - hammerReach) * travel, y: lift > 0 ? -260 * lift : 0,
      upper: 1.86 - ready * 2.81 + strike * 1.15,
      lower: .48 - ready * 1.98 + strike * 2.2,
      morph: envelope(phase, .08, .3, 1.3, 1.65), extension: strike * 35,
      thrust: envelope(phase, .08, .22, .76, .96),
      impact: envelope(phase, 1.04, 1.08, 1.16, 1.44),
    };
  }
  // Đổi đích bàn tay của template chung (khung Vanguard) sang góc khớp, giữ nguyên tỷ lệ tay Bastion.
  function handToward(template, side, sx, sy) {
    const ratio = base.templateRatio(modelScale), target = template.hands[side];
    const tx = target.x * ratio, ty = (target.y - template.bodyLift) * ratio;
    const dx = tx - sx, dy = ty - sy;
    const distance = Math.max(30, Math.min(188.5, Math.hypot(dx, dy)));
    const upper = Math.atan2(dy, dx) + Math.acos((80 * 80 + distance * distance - 109 * 109) / (160 * distance));
    const lower = Math.atan2(ty - sy - Math.sin(upper) * 80, tx - sx - Math.cos(upper) * 80);
    return { upper, lower };
  }
  function staggerPose(time) {
    const reaction = base.staggerPreview(time);
    const ratio = base.templateRatio(modelScale);
    const hand = (side, sx, sy) => handToward(reaction, side, sx, sy);
    return {
      lean: reaction.lean, crouch: reaction.crouch * ratio, flash: reaction.flash,
      far: hand('L', 38, -428), near: hand('R', -48, -422),
    };
  }
  // Ăn mừng: đọc thẳng TEMPLATE DUY NHẤT trong src/game.js (celebrationPreview), chỉ quy đổi tỷ lệ.
  function celebrationPose(time) {
    const cel = base.celebrationPreview(time);
    const ratio = base.templateRatio(modelScale);
    // Bastion vẽ gần chính diện: tay xa ở phía trước (x dương) → nhận đích tay trước (R) của template,
    // tay gần ở phía sau nhận đích tay sau (L); hình vẫn là một tay vung trước, một tay vung sau như Vanguard.
    const far = handToward(cel, 'R', 38, -428), near = handToward(cel, 'L', -48, -422);
    const name = cel.phase.name;
    return {
      phase: time - Math.floor(time / 3) * 3, template: cel, name,
      jumping: name === 'jump', landed: cel.landed, spin: cel.spin, spread: cel.spreadFeet,
      feet: cel.spreadFeet, feetFar: cel.feetFar * ratio, feetNear: cel.feetNear * ratio,
      air: cel.air / modelScale, crouch: cel.crouch * ratio, lean: cel.lean, thrust: cel.thrust,
      farUpper: far.upper, farLower: far.lower, nearUpper: near.upper, nearLower: near.lower,
    };
  }
  let c;
  const clamp = x => Math.max(0, Math.min(1, x));
  const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  const envelope = (t, a, b, d, e) => smooth((t - a) / (b - a)) * (1 - smooth((t - d) / (e - d)));
  function path(points) {
    c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
  }
  function poly(points, fill, width = 1.8) {
    path(points); c.fillStyle = silhouette ? P.edge : fill; c.fill();
    if (width || silhouette) { c.strokeStyle = P.edge; c.lineWidth = width + silhouette; c.stroke(); }
  }
  function line(points, color = P.edge, width = 1.3) {
    c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.strokeStyle = silhouette ? P.edge : color; c.lineWidth = width + silhouette; c.stroke();
  }
  function ellipse(x, y, rx, ry, fill, stroke = P.edge, width = 1.7) {
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = silhouette ? P.edge : fill; c.fill();
    if (stroke || silhouette) { c.strokeStyle = silhouette ? P.edge : stroke; c.lineWidth = width + silhouette; c.stroke(); }
  }
  const NEAR_OUTLINE = 8, BRIGHTEN = .14, BRIGHT_KEYS = ['armor', 'light', 'mid', 'shadow', 'deep', 'steel', 'rim'];
  // ===== Tương phản tay phải (tay gần) với thân: viền tối dày + giáp sáng hơn =====
  // silhouette > 0: mọi nét/tô thành màu viền tối, nét dày thêm silhouette → bóng viền bao quanh cụm tay–vai gần.
  let silhouette = 0;
  const brightCache = new Map();
  function brighten(pal) {
    if (!brightCache.has(pal)) {
      const lift = hex => {
        if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
        const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
        return '#' + v.map(n => Math.round(n + (255 - n) * BRIGHTEN).toString(16).padStart(2, '0')).join('');
      };
      brightCache.set(pal, Object.fromEntries(Object.entries(pal).map(([k, v]) => [k, BRIGHT_KEYS.includes(k) ? lift(v) : v])));
    }
    return brightCache.get(pal);
  }
  function nearArmContrast(draw) {
    const saved = P;
    silhouette = NEAR_OUTLINE; draw(); silhouette = 0;
    P = brighten(saved); draw(); P = saved;
  }
  function rect(x, y, w, h, fill) { c.fillStyle = silhouette ? P.edge : fill; c.fillRect(x, y, w, h); }
  function label(s, x, y, size = 8, color = P.rim) {
    c.fillStyle = silhouette ? P.edge : color; c.font = `800 ${size}px system-ui`; c.fillText(s, x, y);
  }
  function bolt(x, y, r = 2.4) {
    ellipse(x, y, r, r, P.frame, P.steel, .7);
    line([[x - r * .5, y - .3], [x + r * .5, y - .3]], P.mid, .65);
  }
  function joint(x, y, r) {
    ellipse(x, y, r, r, P.edge, P.frame, 2);
    ellipse(x, y, r * .79, r * .79, P.deep, P.steel, 1.6);
    ellipse(x - 1, y - 1, r * .48, r * .48, P.frame, P.shadow, 1);
    ellipse(x - 1.5, y - 2, r * .25, r * .25, P.steel, null);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      bolt(x + Math.cos(a) * r * .62, y + Math.sin(a) * r * .62, 1.5);
    }
  }
  function plate(points, near = true, seed = 0) {
    // Dégradé réservé aux volumes métalliques du personnage, jamais à l'UI.
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, near ? P.light : P.armor);
    g.addColorStop(.22, near ? P.mid : P.shadow);
    g.addColorStop(.55, near ? P.armor : P.deep);
    g.addColorStop(1, near ? P.shadow : P.frame);
    poly(points, g, 2.2);
    line(points.slice(0, 3).map(([x, y]) => [x, y + 1.6]), near ? P.rim : P.steel, 1.1);
    c.save(); path(points); c.clip();
    for (let i = 0; i < 9; i++) {
      const x = x0 + ((i * .618 + seed) % 1) * (x1 - x0);
      const y = y0 + ((i * .371 + seed * .4) % 1) * (y1 - y0);
      line([[x, y], [x + 2 + i % 3, y - 1]], i % 3 ? P.deep : P.light, .6);
    }
    c.restore();
  }
  function slots(x, y, n, width = 20, gap = 5) {
    for (let i = 0; i < n; i++) {
      line([[x, y + i * gap], [x + width, y + i * gap - 3]], P.edge, 3.1);
      line([[x, y + i * gap + 1.8], [x + width, y + i * gap - 1.2]], P.steel, .65);
    }
  }
  function piston(a, b, width = 5) {
    line([a, b], P.edge, width + 5); line([a, b], P.steel, width);
    line([[a[0] - 1, a[1]], [b[0] - 1, b[1]]], P.rim, 1);
  }
  function backFrame() {
    // Khung chịu giật nhô sau lưng, có khe tối tách khỏi giáp vai và hai ray riêng.
    plate([[-141, -457], [-110, -485], [-66, -478], [-53, -428], [-66, -313], [-100, -290], [-141, -315]], false, .4);
    poly([[-136, -430], [-114, -446], [-90, -437], [-91, -315], [-116, -305], [-138, -324]], P.frame);
    for (let i = 0; i < 5; i++) {
      const y = -422 + i * 21;
      plate([[-119, y], [-76, y - 7], [-68, y + 2], [-113, y + 11]], false, i * .12);
    }
    piston([-133, -415], [-127, -309], 6);
    piston([-92, -409], [-85, -299], 4);
    plate([[-142, -329], [-106, -340], [-68, -317], [-73, -294], [-109, -279], [-144, -297]], true, .3);
    bolt(-129, -312, 4); bolt(-87, -308, 3);
    line([[-110, -459], [-95, -440], [-102, -369], [-84, -342]], P.edge, 9);
    line([[-110, -459], [-95, -440], [-102, -369], [-84, -342]], P.steel, 3);
  }
  function backpackJets(power, time) {
    for (const [x, y] of [[-128, -321], [-94, -305]]) {
      plate([[x - 15, y - 24], [x + 13, y - 24], [x + 18, y], [x + 10, y + 12], [x - 14, y + 10], [x - 20, y]], false, .2);
      ellipse(x - 1, y + 10, 13, 5, P.edge, P.steel, 1.5);
      if (power <= 0) continue;
      c.save(); c.globalAlpha *= power;
      const length = (105 + Math.sin(time * 80) * 12) * power;
      poly([[x - 12, y + 12], [x - 26, y + 50], [x - 19, y + 42], [x - 36, y + length], [x + 4, y + 60], [x + 12, y + 27], [x + 10, y + 12]], '#eba15a', 0);
      poly([[x - 7, y + 13], [x - 17, y + 46], [x - 24, y + length * .76], [x + 4, y + 37], [x + 6, y + 13]], '#fff3cc', 0);
      c.restore();
    }
  }
  function cannon(x, y, tilt, recoil, fire, near) {
    c.save(); c.translate(x, y); c.rotate(tilt);
    // Mỗi khẩu là một khối dài tới eo: thân máy, rãnh tản nhiệt, khóa nòng.
    plate([[-20, -18], [18, -22], [25, 15], [22, 114], [30, 137], [24, 165], [-18, 170], [-31, 151], [-28, 124], [-23, 35]], near, .7);
    poly([[12, 11], [22, 16], [19, 119], [26, 141], [20, 159], [10, 160], [10, 132]], P.deep, 1.3);
    plate([[-24, 52], [-10, 43], [7, 49], [8, 109], [-6, 121], [-24, 108]], near, .2);
    slots(-19, 60, 10, 20, 4.7);
    piston([20, 27], [23, 111], 4);
    plate([[-26, 125], [-12, 116], [17, 119], [29, 137], [22, 160], [-15, 165], [-30, 149]], near, .5);
    line([[-24, 134], [-9, 131], [0, 140], [23, 137]], P.frame, 2);
    plate([[-18, 163], [13, 164], [15, 179], [6, 187], [-12, 183], [-23, 174]], false, .4);
    bolt(-16, 128, 3); bolt(16, 147, 3);
    // Réservoir latéral et pivot visibles, comme sur la référence de dos.
    plate([[23, -7], [37, -11], [43, 0], [43, 47], [35, 57], [22, 51]], near, .2);
    line([[25, 5], [41, 5]], P.steel, 2);
    line([[25, 37], [41, 37]], P.frame, 2);
    joint(22, 19, 10);
    joint(0, 0, 25);
    plate([[-24, 2], [-27, -49], [-19, -68], [16, -72], [26, -55], [24, -3], [12, 13]], near, .3);
    poly([[-23, -10], [-17, -61], [-8, -64], [-11, -4]], P.frame, 1);
    piston([-17, -8], [-14, -55], 3);
    c.translate(0, recoil);
    plate([[-17, -54], [-17, -178], [-13, -199], [11, -202], [17, -187], [18, -54]], near, .5);
    poly([[7, -190], [14, -192], [16, -65], [8, -61]], P.deep, 1);
    line([[-10, -189], [-10, -78]], P.rim, 1.2);
    for (const yy of [-64, -95, -175]) {
      plate([[-21, yy], [-21, yy - 9], [16, yy - 11], [21, yy - 6], [19, yy + 2], [-16, yy + 4]], near, .1);
    }
    poly([[-16, -199], [-12, -207], [9, -210], [15, -202], [11, -194], [-11, -192]], P.frame, 1.5);
    ellipse(0, -202, 10.5, 5.4, '#0d181d', P.steel, 1.6);
    ellipse(1, -203, 5.5, 2.8, '#080f14', null);
    if (near) { rect(-7, -153, 5, 27, P.red); rect(-1, -153, 2, 27, P.mid); }
    bolt(14, -36); bolt(13, -55);
    if (fire > 0) {
      c.save(); c.globalAlpha = fire;
      poly([[-10, -210], [-24, -233], [-10, -225], [-8, -261], [1, -242], [10, -265], [12, -227], [25, -238], [10, -210]], '#e99a50', 0);
      poly([[-6, -211], [-9, -233], [1, -251], [8, -229], [5, -211]], '#fff3cc', 0);
      c.restore();
    }
    c.restore();
  }
  function missile(projectile) {
    c.save(); c.translate(projectile.x, projectile.y); c.rotate(projectile.angle);
    c.globalAlpha *= projectile.alpha;
    // Tên lửa hạng nặng: đầu nhọn, thân dài, cánh ổn định và đuôi phản lực.
    const plume = 48 + Math.sin(projectile.age * 95) * 7;
    poly([[-57, -10], [-84, -19], [-76, -7], [-65 - plume, 0], [-79, 8], [-90, 18], [-57, 10]], '#eba15a', 0);
    poly([[-57, -6], [-76, -7], [-99, 0], [-76, 7], [-57, 6]], '#fff3cc', 0);
    plate([[-53, -15], [29, -15], [49, -10], [65, 0], [49, 10], [29, 15], [-53, 15], [-61, 8], [-61, -8]], projectile.near, .4);
    poly([[29, -15], [49, -10], [65, 0], [49, 10], [29, 15], [37, 0]], P.red, 1.5);
    poly([[-51, -12], [-65, -30], [-30, -18], [-19, -12]], P.steel, 1.6);
    poly([[-51, 12], [-65, 30], [-30, 18], [-19, 12]], P.deep, 1.6);
    poly([[-52, -3], [-29, -3], [-18, 0], [-29, 3], [-52, 3]], P.rim, 1);
    rect(13, -14, 6, 28, P.redDark);
    line([[-20, -10], [23, -10]], P.rim, 1.5);
    line([[-17, 10], [24, 10]], P.frame, 1.5);
    bolt(-9, -6, 1.8); bolt(3, 6, 1.8);
    c.restore();
  }
  function shoulder(x, y, near) {
    c.save(); c.translate(x, y); c.scale(1.13, 1.08);
    joint(3, 6, 37);
    // Épaule arrondie: coque extérieure épaisse, flanc et couvercle sur plans distincts.
    plate([[-39, 22], [-48, -5], [-43, -34], [-28, -56], [-5, -63], [23, -52], [42, -31], [46, -1], [33, 28], [7, 40], [-19, 36]], near, .32);
    poly([[-42, -31], [-29, -53], [-9, -59], [8, -54], [-5, -35], [-13, 8], [-20, 32], [-35, 22]], near ? P.mid : P.shadow, 1.2);
    poly([[-10, -59], [0, -59], [13, -48], [5, -41], [-3, -47]], P.red, 1);
    line([[-33, -31], [-23, -46], [-13, -49]], P.rim, 1.3);
    const g = c.createLinearGradient(-1, -30, 39, 29);
    g.addColorStop(0, near ? P.light : P.armor); g.addColorStop(.45, P.armor); g.addColorStop(1, P.deep);
    ellipse(14, -1, 28, 37, g, P.edge, 3);
    ellipse(16, -1, 22, 30, P.shadow, P.mid, 1.4);
    ellipse(17, -1, 16, 24, near ? P.armor : P.deep, P.frame, 1.5);
    ellipse(18, -1, 6, 10, P.deep, P.steel, .8);
    for (const [bx, by] of [[13, -27], [16, 25], [-3, 1], [34, 1]]) bolt(bx, by, 2.2);
    line([[29, -29], [38, -12], [36, 10], [26, 27]], P.light, 1);
    label('34', -24, -28, 11, near ? P.frame : P.steel);
    c.restore();
  }
  function fist(near, clenched) {
    plate([[-4, -19], [11, -24], [36, -19], [46, -8], [46, 13], [31, 22], [1, 20], [-9, 8]], near, .4);
    poly([[6, 5], [35, 9], [43, 16], [31, 22], [2, 20]], P.frame, 1.3);
    for (let i = 0; i < 4; i++) {
      const yy = -14 + i * 8;
      plate([[27, yy], [42, yy + 2], [46, yy + 8], [29, yy + 7]], near, i * .2);
    }
    plate([[5, 12], [20, 12], [28, 20], [24, 29], [9, 28], [-2, 19]], near, .6);
    if (!clenched) line([[34, -10], [44, -6]], P.steel, 1);
    bolt(9, -10, 2.8);
  }
  function hammerHand(near, morph) {
    // Đầu búa thay thế bàn tay, gắn trực tiếp vào cổ tay; không cầm thêm vũ khí.
    c.save(); c.scale(1 - morph * .28, 1 - morph * .28);
    fist(near, true); c.restore();
    c.save(); c.globalAlpha *= smooth(morph / .25);
    const spread = morph * 37, reach = morph * 22;
    piston([8, -10], [29, -18 - spread], 4);
    piston([8, 12], [29, 20 + spread], 4);
    plate([[0, -15], [22, -22], [45 + reach, -15], [51 + reach, 14], [28, 25], [0, 17]], near, .6);
    // Lõi thép liền khối nối hai má búa, không để trông như hai càng rời.
    const height = 20 + spread;
    plate([[23, -height], [49 + reach, -height], [57 + reach, -height + 10], [57 + reach, height - 10], [49 + reach, height], [23, height], [16, height - 12], [16, -height + 12]], near, .7);
    poly([[49 + reach, -height], [57 + reach, -height + 10], [57 + reach, height - 10], [49 + reach, height], [44 + reach, height - 9], [44 + reach, -height + 9]], P.deep, 1.5);
    slots(31, -12, 5, 15 + reach, 6);
    // Hai nửa giáp trượt ngược chiều, tạo khối búa ngang nặng và mặt đập thép.
    for (const side of [-1, 1]) {
      c.save(); c.scale(1, side);
      const y = 12 + spread;
      plate([[9, y - 7], [47 + reach, y - 7], [57 + reach, y + 1], [56 + reach, y + 17], [42 + reach, y + 24], [4, y + 20], [-3, y + 9]], near, .3);
      poly([[-3, y + 9], [4, y + 20], [42 + reach, y + 24], [56 + reach, y + 17], [55 + reach, y + 8], [40 + reach, y + 13], [5, y + 10]], P.steel, 1.5);
      line([[6, y + 17], [40 + reach, y + 20], [51 + reach, y + 14]], P.rim, 1.6);
      poly([[17, y - 6], [25, y - 6], [25, y + 10], [17, y + 9]], P.red, 1);
      bolt(9, y + 1, 2.8); bolt(43 + reach, y + 1, 2.8);
      c.restore();
    }
    plate([[13, -19], [33, -19], [39, -8], [38, 12], [28, 21], [12, 17], [6, 3]], near, .1);
    joint(23, 1, 10);
    line([[43 + reach, -8], [49 + reach, -5], [49 + reach, 7]], P.red, 3);
    c.restore();
  }
  function arm(x, y, upper, lower, near, punch = 0, hammer = 0, extension = 0) {
    c.save(); c.translate(x, y); c.rotate(upper);
    // L'axe local x suit l'os, les deux segments restent réellement articulés.
    joint(0, 0, 25);
    piston([9, 17], [68, 17], 4);
    plate([[8, -24], [55, -27], [78, -13], [77, 14], [55, 24], [12, 22]], near, .2);
    poly([[15, 10], [65, 8], [77, 14], [55, 24], [12, 22]], P.deep, 1.2);
    line([[18, -18], [50, -21], [66, -13]], near ? P.rim : P.steel, 1);
    line([[24, -13], [57, -14]], P.shadow, 1.5);
    c.translate(80, 0); c.rotate(lower - upper);
    joint(0, 0, 21);
    piston([6, 19], [69, 23], 3.5);
    plate([[15, -25], [35, -34], [87, -29], [101, -13], [98, 21], [80, 32], [26, 29], [10, 13]], near, .5);
    poly([[31, 15], [92, 8], [98, 21], [80, 32], [26, 29]], P.deep, 1.4);
    plate([[30, -26], [78, -24], [87, -13], [81, 10], [34, 15], [22, 3]], near, .8);
    poly([[23, -28], [30, -32], [39, -31], [31, 26], [23, 25]], P.red, 1);
    line([[44, -19], [75, -17], [81, -9]], P.rim, 1);
    slots(43, -7, 3, 26, 5);
    joint(27, 24, 10); bolt(85, -16); bolt(82, 19);
    label('CT-34', 49, 21, 5.5, P.steel);
    if (extension > 0) {
      // Ray cổ tay mở thêm khi móc, có piston nối liền chứ không tách bàn tay.
      piston([82, -13], [109 + extension, -13], 5);
      piston([82, 13], [109 + extension, 13], 5);
      plate([[99 + extension, -21], [112 + extension, -21], [117 + extension, -10], [116 + extension, 13], [105 + extension, 21], [98 + extension, 12]], near, .3);
    }
    c.translate(109 + extension, -1); c.rotate(-.08 + punch * .08);
    if (hammer > 0) hammerHand(near, hammer);
    else fist(near, punch > .1);
    c.restore();
  }
  // Chân đứng chuẩn (hông → cổ chân) của từng bên; chiều dài đùi/cẳng chân lấy từ đây và giữ cố định.
  const legRest = { '-24': [-71, -29], '30': [58, -31] };
  function legKnee(hx, hy, fx, fy) {
    // Như ik() của Vanguard/Tempest cho MỌI động tác: chiều dài cố định (+4% để gối luôn hơi gập),
    // nên khi thân hạ, khuỵu, nhấc hay dang chân thì gối gập ra trước, không co rút như ống lồng.
    const [rx, ry] = legRest[hx], rkx = hx + (rx - hx) * .42 + 20, rky = hy * .51 + ry * .49 - 1;
    const slack = base.legTemplate.slack;
    const l1 = Math.hypot(rkx - hx, rky - hy) * slack, l2 = Math.hypot(rx - rkx, ry - rky) * slack;
    const dx = fx - hx, dy = fy - hy;
    const d = Math.max(Math.abs(l1 - l2) + 1, Math.min(l1 + l2 - .5, Math.hypot(dx, dy)));
    const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
    const ang = Math.atan2(dy, dx) - a;
    return [hx + Math.cos(ang) * l1, hy + Math.sin(ang) * l1];
  }
  function leg(hx, hy, fx, fy, near, bend = 0, gait = null) {
    void bend; // độ gập do IK quyết định theo vị trí thân/bàn chân
    // Genou décalé vers l'avant; pied posé à une cible stable, pas de jambes parallèles.
    const [kx, ky] = legKnee(hx, hy, fx, fy);
    function segment(ax, ay, bx, by, shin) {
      const length = Math.hypot(bx - ax, by - ay);
      c.save(); c.translate(ax, ay); c.rotate(Math.atan2(by - ay, bx - ax));
      if (shin) {
        piston([10, 23], [length - 12, 24], 4);
        plate([[12, -29], [32, -35], [length - 20, -28], [length + 4, -15], [length + 8, 21], [length - 4, 34], [34, 33], [9, 21]], near, .5);
        poly([[28, 19], [length - 6, 18], [length + 8, 21], [length - 4, 34], [34, 33]], P.deep, 1);
        plate([[27, -27], [length - 26, -22], [length - 13, -8], [length - 18, 16], [35, 20], [22, 7]], near, .2);
        poly([[27, -29], [39, -28], [40, 20], [29, 22]], P.red, 1);
        slots(46, -10, 4, 23, 5);
        bolt(length - 21, -12); bolt(31, 13);
      } else {
        piston([15, 21], [length - 4, 21], 5);
        plate([[8, -27], [31, -34], [length - 17, -30], [length + 2, -9], [length - 3, 22], [length - 30, 29], [14, 27], [-1, 12]], near, .7);
        poly([[18, 17], [length - 5, 11], [length - 3, 22], [length - 30, 29], [14, 27]], P.deep, 1);
        plate([[20, -27], [length - 26, -23], [length - 16, -7], [length - 24, 11], [26, 15]], near, .4);
        slots(35, -8, 5, 23, 5);
        bolt(19, -15); bolt(length - 22, -13);
      }
      c.restore();
    }
    joint(hx, hy, 27);
    segment(hx, hy, kx, ky, false);
    segment(kx, ky, fx, fy, true);
    joint(kx, ky, 25);
    plate([[kx - 19, ky - 21], [kx + 10, ky - 27], [kx + 38, ky - 15], [kx + 43, ky - 3], [kx + 14, ky - 5], [kx - 8, ky - 11]], near, .2);
    // Nhấc chân thì hếch mũi như Vanguard (-lift·0,25), xoay quanh cổ chân.
    c.save();
    if (gait?.lift) { c.translate(fx, fy); c.rotate(-gait.lift * base.legTemplate.footPitch); c.translate(-fx, -fy); }
    joint(fx, fy, 16);
    plate([[fx - 26, fy - 2], [fx + 16, fy - 8], [fx + 31, fy + 7], [fx + 64, fy + 16], [fx + 66, fy + 30], [fx + 43, fy + 35], [fx - 36, fy + 31], [fx - 38, fy + 16]], near, .3);
    poly([[fx - 36, fy + 25], [fx + 43, fy + 29], [fx + 66, fy + 24], [fx + 66, fy + 33], [fx + 43, fy + 38], [fx - 37, fy + 34]], P.frame, 1.4);
    line([[fx - 27, fy + 29], [fx + 40, fy + 32], [fx + 60, fy + 28]], P.steel, 1);
    for (let i = 0; i < 3; i++) line([[fx + 31 + i * 10, fy + 11 + i * 3], [fx + 29 + i * 10, fy + 28]], P.frame, 1.5);
    c.restore();
  }
  function torso() {
    // Châssis dorsal et cage abdominale, sous les grandes pièces du plastron.
    plate([[-77, -442], [-74, -475], [-44, -492], [4, -484], [26, -454], [22, -362], [-57, -343], [-85, -382]], false, .2);
    slots(-72, -431, 7, 20, 6);
    piston([-70, -385], [-49, -296], 6);
    poly([[-48, -370], [60, -366], [47, -291], [9, -268], [-41, -298]], P.frame);
    for (let i = 0; i < 4; i++) {
      const y = -357 + i * 16;
      plate([[-34 + i * 2, y], [41, y - 6], [49 - i * 2, y + 8], [-23, y + 13], [-40, y + 5]], i % 2 === 0, i * .2);
      line([[-22, y + 10], [34, y + 5]], P.edge, 2);
    }
    piston([43, -351], [40, -297], 4);
    // Plastron massif: face inclinée et tranche latérale distinctes.
    plate([[-72, -442], [-45, -468], [20, -465], [62, -450], [87, -415], [77, -379], [40, -352], [-14, -351], [-66, -378], [-82, -411]], true, .3);
    poly([[-72, -442], [-45, -468], [-28, -462], [-44, -432], [-44, -397], [-20, -361], [-14, -351], [-66, -378], [-82, -411]], P.deep, 1.6);
    plate([[-27, -450], [24, -456], [59, -442], [78, -416], [53, -404], [3, -413], [-36, -429]], true, .6);
    plate([[-34, -424], [0, -414], [46, -404], [65, -395], [39, -366], [1, -365], [-38, -389], [-46, -409]], true, .1);
    poly([[50, -440], [62, -436], [78, -416], [69, -401], [63, -402]], P.deep, 1);
    poly([[13, -454], [21, -456], [31, -435], [27, -420], [20, -420]], P.red, 1);
    line([[25, -421], [37, -400], [36, -375]], P.redDark, 5);
    line([[27, -421], [39, -400], [38, -375]], P.red, 2);
    for (let i = 0; i < 4; i++) line([[-18, -409 + i * 7], [14, -394 + i * 7]], P.deep, 2);
    line([[-30, -445], [8, -449], [40, -438]], P.rim, 1.4);
    line([[-34, -383], [0, -361], [37, -362], [67, -389]], P.steel, 1.2);
    joint(53, -437, 12); joint(44, -369, 7);
    bolt(-20, -439); bolt(-34, -396); bolt(66, -416);
    label('CT / 34', -16, -379, 7, P.deep);
    // Colliers massifs derrière la tête, ouverts sur le cockpit.
    for (const [x, y] of [[-43, -465], [15, -470]]) {
      plate([[x - 13, y + 21], [x - 15, y - 13], [x - 3, y - 33], [x + 8, y - 32], [x + 16, y - 9], [x + 11, y + 18]], true, .5);
      poly([[x - 7, y - 8], [x - 1, y - 24], [x + 4, y - 22], [x + 9, y + 11], [x + 1, y + 14]], P.frame, 1);
    }
  }
  function pelvis() {
    joint(-23, -264, 29); joint(32, -267, 27);
    plate([[-45, -301], [-5, -316], [41, -302], [61, -279], [39, -251], [2, -244], [-43, -267], [-58, -286]], true, .6);
    plate([[-49, -295], [-19, -305], [16, -282], [10, -259], [-20, -267], [-50, -282]], true, .4);
    poly([[-44, -294], [-35, -298], [8, -276], [5, -268]], P.red, 1);
    plate([[18, -293], [40, -291], [51, -274], [37, -233], [17, -232], [6, -257]], true, .8);
    poly([[32, -284], [41, -273], [32, -240], [24, -239], [27, -263]], P.deep, 1);
    bolt(-29, -287); bolt(28, -278);
  }
  function head(turn) {
    c.save(); c.translate(turn, 0);
    joint(23, -471, 17);
    plate([[1, -480], [-7, -502], [-2, -527], [13, -540], [34, -539], [49, -525], [57, -498], [48, -478], [30, -470]], true, .5);
    poly([[1, -480], [-7, -502], [-2, -527], [13, -540], [18, -528], [10, -506], [14, -482]], P.deep, 1.5);
    plate([[19, -529], [33, -533], [45, -521], [52, -499], [43, -481], [28, -480], [18, -498]], true, .4);
    // Fenêtre verticale, montants épais et ramifications hautes en Y.
    poly([[33, -513], [44, -512], [49, -494], [43, -483], [34, -487]], P.glass, 1.6);
    poly([[36, -511], [42, -510], [46, -495], [42, -488], [37, -490]], P.blue, .7);
    poly([[32, -516], [23, -524], [24, -530], [36, -522], [39, -530], [44, -525], [42, -516]], P.blue, 1.7);
    line([[38, -508], [41, -493]], '#bbecf0', 1.2);
    line([[14, -527], [7, -507], [12, -491]], P.steel, 1.5);
    plate([[19, -483], [29, -478], [44, -479], [50, -488], [53, -479], [40, -469], [26, -471]], false, .3);
    slots(23, -478, 2, 11, 3);
    bolt(12, -515, 2); bolt(49, -502, 1.7);
    c.restore();
  }
  // Đứng im / Bước đi: đọc thẳng TEMPLATE trong src/game.js (idlePreview, walkPreview), chỉ quy đổi tỷ lệ.
  const ratioV = () => base.templateRatio(modelScale);
  const walkPeriod = Math.PI * 2 / 6.5;
  function walkPose(time) {
    const w = base.walkPreview(time), ratio = ratioV();
    return { phase: w.phase, ratio, stride: w.stride, bob: w.bob * ratio,
      far: { x: w.far.x * ratio, lift: w.far.lift }, near: { x: w.near.x * ratio, lift: w.near.lift } };
  }
  function idlePose(time) {
    const i = base.idlePreview(time), ratio = ratioV();
    return { bob: i.bob * ratio, far: i.breathe.L * ratio, near: i.breathe.R * ratio };
  }
  // Tính tư thế của một động tác tại thời điểm time (dùng chung cho xưởng và trận đấu).
  function poseAt(clip, time) {
    const t = ((time % 6) + 6) % 6, cycle = t % 2.4;
    const walk = clip === 'walk', guard = clip === 'guard';
    const gait = walk ? walkPose(time) : null;
    const stride = gait ? gait.stride : 0;
    const idle = clip === 'idle' || walk ? idlePose(time) : null;
    const dash = clip === 'dash' ? envelope(cycle, .05, .3, .9, 1.3) : 0;
    const punch = punchTimings[clip] ? punchPose(clip, Math.max(0, time)) : 0;
    const hammer = clip === 'blade' ? hammerPose(time) : null;
    const slam = clip === 'special' ? jetSlamPose(time) : null;
    const firing = ['cannon', 'ultimate'].includes(clip);
    const deploy = firing ? envelope(cycle, 0, .65, 1.7, 2.3) : 0;
    const flash = firing ? Math.max(0, 1 - Math.abs(cycle - 1.08) / .13) : 0;
    const flash2 = clip === 'ultimate' ? Math.max(0, 1 - Math.abs(cycle - 1.42) / .13) : 0;
    const reaction = clip === 'stagger' ? staggerPose(t) : null;
    P = reaction && reaction.flash ? hitPalette : normalPalette;
    const celebration = clip === 'celebrate' ? celebrationPose(time) : null;
    return { clip, time, t, cycle, walk, guard, stride, gait, idle, dash, punch, hammer, slam, firing, deploy, flash, flash2, reaction, celebration };
  }
  function draw(target, clip = 'idle', time = 0, facing = 1, zoom = 1) {
    c = target.getContext('2d');
    const p = poseAt(clip, time);
    P = p.reaction && p.reaction.flash ? hitPalette : normalPalette;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, target.width, target.height);
    rect(0, 0, target.width, target.height, P.cream);
    // Cùng camera/zoom của drawTitanClip; chuẩn hóa đồng nhất X/Y tới đỉnh đầu.
    const scale = Math.min(target.width / 760, target.height / 540) * zoom * modelScale;
    const gx = target.width * .46, gy = target.height * .9;
    c.translate(gx, gy); c.scale(scale * facing, scale);
    stage(p, facing);
    body(p, {});
    c.restore();
  }
  // Nền xưởng: bóng đổ, vạch tầm khóa I, vòng bụi tiếp đất.
  function stage(p, facing) {
    const { slam, celebration } = p;
    if (slam) {
      // Camera rộng cố định riêng khi diễn I: đủ đường bay 2H, không cắt đỉnh pháo/búa.
      c.scale(.72, .72); c.translate(-440, 0);
      line([[0, 15], [jetSlam.reach, 15]], P.shadow, 2);
      line([[jetSlam.reach, -15], [jetSlam.reach, 28]], P.red, 3);
      c.save(); if (facing < 0) { c.translate(jetSlam.reach, 0); c.scale(-1, 1); }
      label('TẦM KHÓA I · 2 × CHIỀU CAO', 210, 42, 15, P.frame); c.restore();
      ellipse(slam.x + 13, 0, 135, 12, '#948c77', null);
    } else {
      // Ăn mừng: cùng camera chung với Vanguard/Tempest (base.celebrationCamera), không thêm hiệu ứng riêng.
      if (celebration) c.scale(base.celebrationCamera, base.celebrationCamera);
      ellipse(13, 0, celebration ? 135 - celebration.air * .08 : 135, 12, '#948c77', null);
    }
  }
  // Thân Titan. Gốc tọa độ: mặt đất dưới chân, đơn vị mô hình Bastion.
  // opts.inPlace (trong trận): vị trí bay/nhảy do game điều khiển, không vẽ tên lửa minh họa của xưởng.
  function body(p, opts) {
    const { clip, time, t, cycle, walk, guard, stride, gait, idle, dash, punch, hammer, flash, flash2, deploy, reaction, celebration } = p;
    // Nhún thân khi đi/đứng im; bàn chân bù lại để vẫn bám đất (trước đây chân lún theo nhịp nhún).
    const bob = gait ? gait.bob : clip === 'idle' ? idle.bob : 0;
    const slam = p.slam && opts.inPlace ? { ...p.slam, x: 0, y: 0 } : p.slam;
    void walk; void cycle;
    c.translate(0, -sole);
    const crouch = celebration ? celebration.crouch : reaction ? reaction.crouch : 0;
    const feetFar = celebration ? celebration.feetFar : 0, feetNear = celebration ? celebration.feetNear : 0;
    if (celebration) c.scale(celebration.spin, 1);
    c.translate((slam ? slam.x : 0) + dash * 24 - flash * 10 - flash2 * 10,
      (slam ? slam.y : celebration ? (opts.inPlace ? 0 : -celebration.air) + crouch : reaction ? crouch + Math.sin(t * 2) * 2.5 : hammer || bob ? bob : clip === 'idle' ? 0 : Math.sin(t * 2) * 1.1)
      + (guard ? 13 : 0) + deploy * 5);
    c.rotate(dash * .12);
    const hipFirst = reaction || celebration;
    if (hipFirst) {
      // Chân bám đất; chỉ thân trên ngả quanh hông như template chung (trúng đòn lùi, ăn mừng lấy đà/ưỡn ngực).
      leg(-24, -264, -71 + (celebration ? feetFar : -crouch * .5), -29 - crouch, false, crouch * .45);
      leg(30, -263, 58 + (celebration ? feetNear : crouch * .6), -31 - crouch, true, crouch * .45);
      pelvis();
      c.translate(0, -264); c.rotate(reaction ? reaction.lean : celebration.lean); c.translate(0, 264);
    }
    // Plan lointain: jambes et bras assombris, puis châssis, puis côté proche.
    backFrame();
    if (slam || celebration) backpackJets(slam ? slam.thrust : celebration.thrust, time);
    if (deploy > 0) {
      // Bệ nâng vẫn nối vào lưng khi đưa cả khối pháo lên trên đầu.
      piston([-105, -431], [-157 + deploy * 115, -455 - deploy * 157], 9);
      piston([-77, -446], [-77 + deploy * 45, -473 - deploy * 89], 7);
      joint(-105, -431, 13);
    }
    cannon(-77 + deploy * 45, -473 - deploy * 89, -.025 + deploy * 1.6, (clip === 'ultimate' ? flash2 : flash) * 8, clip === 'ultimate' ? flash2 : flash, false);
    const lift = gait ? base.legTemplate.lift * gait.ratio : 0;
    if (!hipFirst) leg(-24, -264, -71 + (gait ? gait.far.x : 0) - dash * 19,
      -29 - bob - (gait ? gait.far.lift * lift : 0) - crouch, false, crouch * .45,
      gait ? { rest: [-71, -29], lift: gait.far.lift } : null);
    // Tay trái ở phía xa: cả gốc vai và cánh tay phải nằm sau giáp ngực/đầu.
    if (hammer) arm(38, -428, hammer.upper, hammer.lower, true, 0, hammer.morph, hammer.extension);
    else arm(38, -428,
      celebration ? celebration.farUpper : reaction ? reaction.far.upper : 1.14 + (idle ? idle.far * .005 : 0) - (clip === 'hook' ? punch * 1.1 : 0),
      celebration ? celebration.farLower : reaction ? reaction.far.lower : -.23 + (idle ? idle.far * .012 : 0) - (guard ? .9 : 0) - (clip === 'hook' ? punch * .12 : 0), false, clip !== 'jab' ? punch : 0);
    shoulder(37, -445, false);
    torso();
    if (!hipFirst) leg(30, -263, 58 + (gait ? gait.near.x : 0) + dash * 12,
      -31 - bob - (gait ? gait.near.lift * lift : 0) - crouch, true, crouch * .45,
      gait ? { rest: [58, -31], lift: gait.near.lift } : null);
    if (!hipFirst) pelvis();
    head(0);
    // Bastion đảo tay đấm: F (jab, phi công 1) là tay phải ở phía gần, J (hook, phi công 2) là tay trái ở phía xa.
    // Nhờ vậy F + K (búa tay trái) là hai phi công đánh hai tay khác nhau → đồng bộ hợp lệ.
    // Trong trận, F có thể ra cùng lúc với búa K (đồng bộ): opts.jabTime cho tay phải đấm song song với búa tay trái.
    // Ăn mừng: tay gần vung ra sau theo template → vẽ khẩu pháo gần TRƯỚC để không che mất tay phải.
    const nearCannon = () => cannon(-157 + deploy * 115, -455 - deploy * 157, -.07 + deploy * 1.6, flash * 8, flash, true);
    if (celebration) nearCannon();
    const nearPunch = opts.jabTime != null ? punchPose('jab', opts.jabTime) : clip !== 'hook' ? punch : 0;
    // Tay phải (gần) tách rõ khỏi thân: viền tối dày + giáp sáng hơn.
    nearArmContrast(() => {
      arm(-48, -422,
        slam ? slam.upper : celebration ? celebration.nearUpper : reaction ? reaction.near.upper : 1.86 + (idle ? idle.near * .005 : 0) - nearPunch * .95 - (guard ? .45 : 0),
        slam ? slam.lower : celebration ? celebration.nearLower : reaction ? reaction.near.lower : .48 + (idle ? idle.near * .012 : 0) - nearPunch * .55 - (guard ? 1.55 : 0),
        true, opts.jabTime != null ? nearPunch : punch, slam ? slam.morph : 0, slam ? slam.extension : 0);
      shoulder(-51, -444, true);
    });
    // Khẩu gần nằm ngoài silhouette vai/tay để thân pháo không bị che mất.
    if (!celebration) nearCannon();
    if (clip === 'cannon' && !opts.inPlace) for (const projectile of missileVolley(time)) missile(projectile);
    if (slam && slam.impact > 0) {
      c.save(); c.globalAlpha *= slam.impact;
      // Vệt va chạm cạnh đầu búa và bụi tiếp đất; không đổi lớp vai/ngực.
      const hx = -48 + Math.cos(slam.upper) * 80 + Math.cos(slam.lower) * (109 + slam.extension + 45);
      const hy = -422 + Math.sin(slam.upper) * 80 + Math.sin(slam.lower) * (109 + slam.extension + 45);
      line([[hx - 25, hy + 25], [hx + 8, hy + 54], [hx + 16, hy + 28], [hx + 43, hy + 39]], '#cf8549', 4);
      line([[-66, 1], [-96, -17], [-90, 3], [-119, 9]], P.shadow, 3);
      line([[64, 1], [88, -14], [85, 3], [109, 8]], P.shadow, 3);
      c.restore();
    }
  }
  // Vẽ trong trận / màn chọn: ctx đã đặt gốc tại mặt đất dưới chân, scale theo mô hình Bastion.
  function drawInGame(ctx, clip, time, opts = {}) {
    c = ctx;
    const p = poseAt(clip, time);
    P = opts.hit || (p.reaction && p.reaction.flash && !opts.inPlace) ? hitPalette : normalPalette;
    c.save();
    body(p, opts);
    c.restore();
    P = normalPalette;
  }
  // Vẽ trong khung xem (màn chọn, huấn luyện) với cùng camera của trang xưởng, không tô nền.
  function drawFramed(ctx, clip, time, facing, zoom, bx, by, bw, bh) {
    c = ctx;
    const p = poseAt(clip, time);
    P = p.reaction && p.reaction.flash ? hitPalette : normalPalette;
    const scale = Math.min(bw / 760, bh / 540) * zoom * modelScale;
    c.save();
    c.translate(bx + bw * .46, by + bh * .9); c.scale(scale * facing, scale);
    if (p.slam || p.celebration) c.scale(p.slam ? .72 : base.celebrationCamera, p.slam ? .72 : base.celebrationCamera);
    if (p.slam) c.translate(-440, 0);
    body(p, {});
    c.restore();
    P = normalPalette;
  }
  window.EyeRimBastion = { crown, sole, drawInGame, drawFramed, missile: (ctx, projectile) => { c = ctx; missile(projectile); }, jetSlam, hammerPeriod, walkPose, walkPeriod, idlePose, legKnee, legHips: [[-24, -264], [30, -263]], celebrationPose, staggerPose, scale: modelScale };
  if (!window.TitanGallery) return;
  window.TitanGallery = {
    ...base,
    names: { ...base.names, bastion: names },
    punchTimings, punchPose, hammerPose, hammerPeriod, missileVolley, jetSlam, jetSlamPose, celebrationPose, staggerPose,
    specs: { ...base.specs, bastion: { crown, sole, scale: modelScale, profileZoom: 1.65, label: (base.specs.bastion && base.specs.bastion.label) || 'Thế hệ Eye-1 · 85 m · 2.360 tấn', series: 'Eye-1', note: 'Thế hệ Eye-1 · F: đấm phải · J: đấm trái, cùng bố trí với Bulwark. Dáng ngang 3/4 · giáp hạng nặng · hai pháo sau vai.' } },
    draw(target, id, ...args) { return id === 'bastion' ? draw(target, ...args) : base.draw(target, id, ...args); },
  };
})();
