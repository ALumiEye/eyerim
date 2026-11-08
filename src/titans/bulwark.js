/* Bulwark — bộ vẽ Titan. Bản NHÁP thiết kế: titans/bulwark.js (trang xưởng titans/bulwark.html);
 * bản GAME: src/titans/bulwark.js, chỉ cập nhật bằng `npm run promote bulwark` (chép nháp → game sau khi test qua).
 * Tạo hình pháo đài hạt nhân của Bulwark; Titan thứ tư trong roster.
 * Ăn mừng/trúng đòn lấy template chung, không tạo biến thể riêng.
 */
(() => {
  'use strict';
  // Trang xưởng: TitanGallery; trong game: EyeRimCore (src/game.js nạp trước file này).
  const base = window.TitanGallery || window.EyeRimCore;
  if (!base?.celebrationPreview) return;
  const crown = 600, sole = 8;
  // Riêng Bulwark: mốc chuẩn là cạnh trên hai mắt tròn, không phải đỉnh trụ.
  // Mắt gần: tâm y = -492, bán kính dọc 29, nghiêng -0,14 rad.
  const eyeTop = 492 + Math.hypot(26 * Math.sin(.14), 29 * Math.cos(.14));
  const scale = base.scaleToDrawingHeight(eyeTop, sole);
  const normal = {
    edge: '#142722', frame: '#263b34', dark: '#304a3d', shadow: '#3b5747',
    armor: '#4e7055', mid: '#6b8865', light: '#98aa81', steel: '#8c9b92',
    rim: '#b6c3a4', red: '#b9513c', black: '#182a24', amber: '#ffe269',
  };
  const white = Object.fromEntries(Object.keys(normal).map(k => [k,
    ['edge', 'black'].includes(k) ? '#6d7c83' : k === 'amber' ? '#fff4d7' : '#f5fbff']));
  let c, P = normal;
  let cockpitLift = 1; // 1: khóa ở giữa ngực; 0: hạ xuống theo ray.
  const clamp = x => Math.max(0, Math.min(1, x));
  const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  const env = (t, a, b, d, e) => smooth((t - a) / (b - a)) * (1 - smooth((t - d) / (e - d)));
  const mod = (x, n) => ((x % n) + n) % n;
  function path(points) {
    c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
  }
  function poly(points, fill, width = 2) {
    path(points); c.fillStyle = silhouette ? P.edge : fill; c.fill();
    if (width || silhouette) { c.strokeStyle = P.edge; c.lineWidth = width + silhouette; c.stroke(); }
  }
  function line(points, color = P.edge, width = 2) {
    c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.strokeStyle = silhouette ? P.edge : color; c.lineWidth = width + silhouette; c.stroke();
  }
  function ellipse(x, y, rx, ry, fill, stroke = P.edge, width = 2) {
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fillStyle = silhouette ? P.edge : fill; c.fill();
    if (stroke || silhouette) { c.strokeStyle = silhouette ? P.edge : stroke; c.lineWidth = width + silhouette; c.stroke(); }
  }
  const NEAR_OUTLINE = 8, BRIGHTEN = .14, BRIGHT_KEYS = ['armor', 'light', 'mid', 'shadow', 'dark', 'steel', 'rim'];
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
  function text(s, x, y, size = 8, color = P.rim) {
    c.fillStyle = silhouette ? P.edge : color; c.font = `800 ${size}px system-ui`; c.fillText(s, x, y);
  }
  function plate(points, near = true, seed = 0) {
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y;
    const g = c.createLinearGradient(x, y, x + w, y + h * .2);
    g.addColorStop(0, near ? P.light : P.armor); g.addColorStop(.18, near ? P.mid : P.shadow);
    g.addColorStop(.65, near ? P.armor : P.dark); g.addColorStop(1, P.shadow);
    poly(points, g, 2.5);
    line(points.slice(0, 3).map(([a, b]) => [a, b + 2]), P.rim, 1.1);
    c.save(); path(points); c.clip();
    // Éraflures déterministes: même usure dans chaque image et à chaque sens.
    for (let i = 0; i < 22; i++) {
      const a = x + mod(i * .618 + seed, 1) * w, b = y + mod(i * .347 + seed, 1) * h;
      line([[a, b], [a + 2 + i % 5, b - 1 - i % 3]], i % 4 ? P.shadow : P.rim, .7);
    }
    c.restore();
  }
  function bolt(x, y, r = 2.5) {
    ellipse(x, y, r, r, P.frame, P.steel, .8);
    line([[x - r * .5, y], [x + r * .5, y]], P.mid, .8);
  }
  function joint(x, y, r, near = true) {
    ellipse(x, y, r, r, P.black, P.edge, 3);
    ellipse(x, y, r * .8, r * .8, near ? P.shadow : P.dark, P.steel, 1.5);
    ellipse(x, y, r * .53, r * .53, P.frame, P.armor, 2);
    ellipse(x, y, r * .27, r * .27, P.steel, P.edge, 1);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3; bolt(x + Math.cos(a) * r * .65, y + Math.sin(a) * r * .65, 1.6);
    }
  }
  function piston(a, b, w = 5) {
    line([a, b], P.edge, w + 6); line([a, b], P.steel, w);
    line([[a[0] - 1, a[1]], [b[0] - 1, b[1]]], P.rim, 1.3);
  }
  function star(x, y, r) {
    poly(Array.from({ length: 10 }, (_, i) => {
      const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r * .44 : r;
      return [x + Math.cos(a) * d, y + Math.sin(a) * d];
    }), P.red, 0);
  }
  const eyeFirePeriod = 4.2;
  const fireEyes = [{ x: -79, y: -490, angle: -.32, reach: 400 }, { x: 84, y: -492, angle: .04, reach: 330 }];
  function eyeFirePose(time) {
    const phase = mod(time, eyeFirePeriod);
    const charge = smooth(phase / 1.08);
    const heat = smooth((phase - .35) / .65);
    const glow = charge * (1 - smooth((phase - 2.25) / .35));
    const jet = smooth((phase - 1.1) / .52) * (1 - smooth((phase - 1.88) / .37));
    const curl = smooth((phase - 1.72) / .48);
    const flight = Math.max(0, phase - 2.25);
    const alpha = 1 - smooth((phase - 2.95) / .35);
    const streams = phase >= 1.1 && phase < 3.3 ? fireEyes.map((eye, i) => {
      const distance = eye.reach * smooth((phase - 1.1) / .52);
      const travel = flight * 430;
      return { ...eye, id: i, distance, ballX: eye.x + Math.cos(eye.angle) * (distance + travel),
        ballY: eye.y + Math.sin(eye.angle) * (distance + travel), radius: 35 * curl,
        alpha, launched: phase >= 2.25 };
    }) : [];
    return { phase, charge, heat, glow, jet, curl, flight, streams };
  }
  function eyeHeat(fire) {
    if (!fire?.glow) return;
    c.save(); c.globalAlpha *= fire.glow;
    const color = `rgb(255, ${Math.round(48 + fire.heat * 179)}, ${Math.round(18 + fire.heat * 67)})`;
    const halo = c.createRadialGradient(0, 0, 6, 0, 0, 43);
    halo.addColorStop(0, color); halo.addColorStop(1, 'rgba(255,85,12,0)');
    ellipse(0, 0, 43, 43, halo, null);
    ellipse(1, 0, 20, 23, color, null);
    ellipse(4, -2, 11 * fire.heat, 15 * fire.heat, '#fff4b0', null);
    c.restore();
  }
  // Rubans de feu déterministes: l'extrémité se replie en spirale avant le tir.
  function eyeFlames(fire) {
    if (!fire?.streams.length) return;
    for (const stream of fire.streams) {
      c.save(); c.globalAlpha *= stream.alpha;
      c.translate(stream.x, stream.y); c.rotate(stream.angle);
      const phase = fire.phase, id = stream.id;
      const colors = ['#b93c20', '#f16b20', '#ffb72e', '#fff0a1'];
      if (fire.jet > 0) {
        for (let layer = 0; layer < 4; layer++) {
          const length = stream.distance;
          const width = (23 - layer * 5) * fire.jet;
          const edge = side => Array.from({ length: 33 }, (_, i) => {
            const u = i / 32;
            const wave = Math.sin(u * 27 - phase * 24 + id * 3) * 5
              + Math.sin(u * 53 - phase * 37) * 3;
            const taper = .36 + Math.sin(u * Math.PI * .84) * .64;
            return [u * length, wave * u + side * width * taper * (1 + Math.sin(u * 43 - phase * 31) * .18)];
          });
          poly([...edge(-1), ...edge(1).reverse()], colors[layer], 0);
        }
        // Langues de feu libres et étincelles, sans une barre droite rigide.
        for (let i = 0; i < 17; i++) {
          const u = mod(i * .137 + phase * .8, 1), x = u * stream.distance;
          const y = Math.sin(i * 5 + phase * 12) * (15 + u * 17);
          poly([[x - 14, y], [x + 12, y - 3], [x + 4, y + 4]], i % 2 ? '#ffbd39' : '#e46325', 0);
        }
      }
      // Trong trận (fire.inPlace): quả cầu đã rời mắt do game vẽ như một viên đạn thật.
      if (fire.curl > 0 && stream.radius > 0 && !(fire.inPlace && stream.launched)) {
        fireball(stream.distance + fire.flight * 430, stream.radius, fire.curl, phase, id, fire.flight, stream.launched);
      }
      c.restore();
    }
  }
  // Quả cầu lửa cuộn ở đầu luồng (tâm cx trên trục bắn); dùng chung cho xưởng và đạn trong trận.
  function fireball(cx, radius, curl, phase, id, flight, launched) {
    const colors = ['#b93c20', '#f16b20', '#ffb72e', '#fff0a1'];
    // Les rubans de la pointe s'enroulent progressivement, puis la boule se détache.
    for (let layer = 0; layer < 3; layer++) {
      const points = Array.from({ length: 65 }, (_, i) => {
        const u = i / 64, angle = u * Math.PI * 3.5 - phase * 13 + id * 2;
        const r = radius * (1.35 - u * .95);
        return [cx + Math.cos(angle) * r, Math.sin(angle) * r];
      });
      c.lineCap = 'round'; c.lineJoin = 'round';
      line(points, colors[layer + 1], (13 - layer * 4) * curl);
    }
    c.save(); c.translate(cx, 0);
    // Une silhouette de flammes tourne autour du noyau chaud, pas un disque lisse.
    const shell = Array.from({ length: 46 }, (_, i) => {
      const angle = i / 46 * Math.PI * 2;
      const r = radius * (1 + .12 * Math.sin(i * 2.3 + phase * 28) + .08 * Math.sin(i * 4.7 - phase * 19));
      return [Math.cos(angle) * r, Math.sin(angle) * r];
    });
    poly(shell, '#f57421', 0);
    ellipse(-3, -2, radius * .7, radius * .65, '#ffc23b', null);
    ellipse(1, -3, radius * .36, radius * .39, '#fff2b5', null);
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI * 2 / 7 + phase * 8;
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
      poly([[x, y], [x - radius * (.6 + flight), y + Math.sin(angle + 1) * 16],
        [x - 9, y + 7]], i % 2 ? '#ffb52e' : '#e95b20', 0);
    }
    c.restore();
    if (launched) {
      for (let i = 0; i < 19; i++) {
        const u = mod(i * .173 + phase * 1.5, 1);
        const x = cx - radius - u * Math.min(170, flight * 370);
        const y = Math.sin(i * 13 + phase * 8) * 22 * u;
        c.save(); c.globalAlpha *= (1 - u) * .8;
        poly([[x - 18, y], [x + 8, y - 3], [x + 2, y + 4]], i % 2 ? '#ffb72e' : '#ed6825', 0);
        c.restore();
      }
    }
  }
  function vent(x, y, near, fire) {
    c.save(); c.translate(x, y); c.rotate(-.14);
    ellipse(0, 0, 26, 29, P.shadow, P.steel, 3);
    ellipse(1, 0, 21, 24, P.black, P.edge, 2);
    for (const dy of [-13, -4, 5, 14]) line([[-14, dy], [15, dy]], P.steel, near ? 3 : 2);
    line([[0, -21], [0, 21]], P.frame, 5);
    bolt(0, -24, 2); bolt(0, 24, 2);
    eyeHeat(fire); c.restore();
  }
  // Đứng im / Bước đi: đọc thẳng TEMPLATE trong src/game.js (idlePreview, walkPreview), chỉ quy đổi tỷ lệ.
  const ratioV = () => base.templateRatio(scale);
  const walkPeriod = Math.PI * 2 / 6.5;
  function walkPose(time) {
    const w = base.walkPreview(time), ratio = ratioV();
    return { phase: w.phase, ratio, stride: w.stride, bob: w.bob * ratio,
      far: { x: w.far.x * ratio, lift: w.far.lift }, near: { x: w.near.x * ratio, lift: w.near.lift } };
  }
  // Chân đứng chuẩn (hông → cổ chân) của từng bên; chiều dài đùi/cẳng chân lấy từ đây và giữ cố định.
  const legRest = { '-37': [-88, 0], '40': [82, 0] };
  function legKnee(hx, hy, fx, fy) {
    // Như ik() của Vanguard/Tempest cho MỌI động tác: chiều dài cố định (+4% để gối luôn hơi gập),
    // nên khi thân hạ, khuỵu, nhấc hay dang chân thì gối gập ra trước, không co rút như ống lồng.
    const [rx, ry] = legRest[hx], rk = [hx + (rx - hx) * .5 + 13, (hy + ry) * .5];
    const slack = base.legTemplate.slack;
    const l1 = Math.hypot(rk[0] - hx, rk[1] - hy) * slack, l2 = Math.hypot(rx - rk[0], ry - 24 - rk[1]) * slack;
    const dx = fx - hx, dy = fy - 24 - hy;
    const d = Math.max(Math.abs(l1 - l2) + 1, Math.min(l1 + l2 - .5, Math.hypot(dx, dy)));
    const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
    const ang = Math.atan2(dy, dx) - a; // gối về phía trước
    return [hx + Math.cos(ang) * l1, hy + Math.sin(ang) * l1];
  }
  function leg(hx, hy, fx, fy, near, bend = 0, gait = null) {
    void bend; // độ gập do IK quyết định theo vị trí thân/bàn chân
    const knee = legKnee(hx, hy, fx, fy);
    joint(hx, hy, 27, near);
    // Deux segments articulés, sans étirer les plaques de blindage.
    for (const [a, b, upper] of [[[hx, hy], knee, true], [knee, [fx, fy - 24], false]]) {
      const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
      c.save(); c.translate(...a); c.rotate(Math.atan2(dy, dx) - Math.PI / 2);
      piston([-18, 10], [-18, length - 7], 5);
      plate([[-29, 12], [-23, -12], [25, -9], [32, 22], [27, length - 15], [16, length + 3], [-28, length - 9]], near, upper ? .2 : .6);
      plate([[-18, 18], [15, 17], [19, length - 22], [-12, length - 13]], near, .3);
      poly([[-28, 24], [-22, 21], [-21, length - 18], [-28, length - 10]], P.dark, 1);
      line([[9, 24], [13, length - 29]], P.red, 2);
      if (upper) for (let i = 0; i < 4; i++) line([[-12 + i * 6, 24], [-10 + i * 6, 59]], P.frame, 3);
      else { line([[-16, length - 18], [13, length - 24], [26, length - 10]], P.rim, 2); text('BW / 01', -14, 45, 6, P.dark); }
      bolt(-20, 12); bolt(22, length - 16); c.restore();
    }
    joint(...knee, 23, near);
    plate([[knee[0] - 29, knee[1] - 19], [knee[0] + 20, knee[1] - 24], [knee[0] + 34, knee[1] - 3], [knee[0] + 21, knee[1] + 15], [knee[0] - 29, knee[1] + 11]], near, .4);
    c.save(); c.translate(fx, fy);
    // Nhấc chân thì hếch mũi như Vanguard (-lift·0,25), xoay quanh cổ chân.
    if (gait?.lift) { c.translate(0, -27); c.rotate(-gait.lift * base.legTemplate.footPitch); c.translate(0, 27); }
    // Đế bè liền khối: tăng diện tích bám, giữ nguyên mốc chạm đất y = sole.
    plate([[-55, -19], [-35, -37], [27, -34], [48, -23], [83, -19],
      [91, -7], [87, 8], [-56, 8], [-62, -4]], near, .8);
    poly([[-60, -10], [89, -10], [91, -3], [87, 8], [-56, 8], [-62, -4]], P.frame, 2);
    line([[-56, -8], [85, -8]], P.steel, 2);
    // Gót chống lật, hai má kẹp cổ chân và giằng chịu tải xuống đế.
    plate([[-58, -21], [-43, -34], [-27, -29], [-34, -8], [-59, -7]], near, .3);
    piston([-23, -39], [-41, -15], 6);
    piston([20, -37], [48, -14], 6);
    joint(0, -27, 21, near);
    plate([[-29, -43], [-8, -48], [22, -40], [25, -23], [13, -17], [-23, -23]], near, .5);
    plate([[20, -31], [44, -30], [58, -21], [84, -19], [87, -11], [38, -11], [24, -18]], near, .7);
    line([[35, -24], [49, -17], [77, -16]], P.red, 3);
    // Ngàm thép ngắn, phẳng sát đất: cảm giác có thể chốt cả thân xuống sàn.
    for (const x of [-49, -26, -3, 20, 43, 66, 81]) {
      poly([[x - 5, -7], [x + 5, -7], [x + 4, 8], [x - 6, 8]], P.dark, 1);
      line([[x - 4, -5], [x + 3, -5]], P.steel, 1.4);
    }
    bolt(-45, -18, 3); bolt(37, -19, 3); bolt(76, -15, 3);
    c.restore();
  }
  function fistLightning(mechanism) {
    if (!mechanism || mechanism.electric <= 0) return [];
    const tick = Math.floor(mechanism.phase * 24);
    const cx = 12 + mechanism.slide * 18;
    const rx = 61 + mechanism.slide * 18, ry = 47 + mechanism.spread * 15;
    return Array.from({ length: 5 }, (_, arc) => {
      const start = arc * Math.PI * 2 / 5 + Math.sin(tick * 1.7 + arc) * .16;
      return Array.from({ length: 7 }, (_, i) => {
        const angle = start + i * .14;
        const jag = i === 0 || i === 6 ? 0 : Math.sin(tick * 2.3 + arc * 11 + i * 7) * 10;
        return [cx + Math.cos(angle) * (rx + jag), 3 + Math.sin(angle) * (ry + jag)];
      });
    });
  }
  function fist(x, y, near, power, mechanism = null) {
    c.save(); c.translate(x, y);
    const { spread = 0, slide = 0, lock = 0 } = mechanism || {};
    // Khung trong lộ ra khi hai vỏ giáp tách; không scale nguyên bàn tay.
    const reach = slide * 30, gap = spread * 19;
    if (spread > 0) {
      poly([[-31, -22 - gap], [42 + reach, -22 - gap], [62 + reach, 0],
        [49 + reach, 33 + gap], [-28, 25 + gap]], P.black, 2);
      for (const side of [-1, 1]) {
        piston([-19, side * 8], [-19, side * (22 + gap)], 4);
        piston([3, side * 11], [40 + reach, side * (19 + gap)], 4);
        line([[-21, side * (19 + gap)], [42 + reach, side * (19 + gap)]], P.steel, 3);
      }
    }
    // Hai vỏ giáp cứng trên bản lề: mở, trượt rồi khóa.
    for (const side of [-1, 1]) {
      c.save(); c.translate(reach * .35, side * gap);
      c.rotate(side * spread * (1 - lock) * .24);
      if (side < 0) {
        plate([[-29, -29], [10, -34], [44, -23], [58, -7], [36, 1], [-37, 7]], near, .6);
        plate([[-25, -24], [12, -27], [40, -15], [25, -5], [-27, 7]], near, .2);
        line([[-23, -19], [-9, -24], [14, -22]], P.red, 2.5);
      } else {
        plate([[-37, 7], [36, 1], [58, -7], [55, 29], [13, 38], [-25, 27]], near, .6);
        plate([[-27, 7], [25, -5], [34, 11], [-3, 17]], near, .2);
      }
      bolt(-23, side * 14, 3); c.restore();
    }
    if (spread > 0) {
      // Giáp dự trữ trượt phủ khung giữa; không để một khoảng đen rỗng khi khóa.
      c.save(); c.translate(reach * .6, 0);
      plate([[-21, -16], [23, -24], [50, -13], [47, 16], [13, 27], [-22, 15]], near, .3);
      line([[-13, -11], [21, -16], [36, -9]], P.red, 2);
      for (const y of [-8, 4, 16]) line([[20, y], [43, y - 6]], P.steel, 2);
      c.restore();
    }
    // Các đốt ngón trượt trên ray riêng rồi gập khóa thành mặt đấm lớn.
    for (let i = 0; i < 4; i++) {
      const a = 4 + i * 12, fan = (i - 1.5) * spread * (1 - lock) * 7;
      piston([a, 12], [a + reach, 16 + gap * .6 + fan], 3);
      c.save(); c.translate(reach, gap * .6 + fan);
      c.translate(a, 13); c.rotate(-spread * (1 - lock) * .5); c.translate(-a, -13);
      plate([[a, 13], [a + 10, 9], [a + 13, 28], [a + 3, 34], [a - 1, 26]], near, i * .1);
      line([[a + 2, 24], [a + 11, 21]], P.steel, 1.5);
      if (lock > 0) line([[a, 12], [a + 10, 9]], P.rim, 1 + lock);
      c.restore();
    }
    c.save(); c.translate(-spread * 12, gap * .65); c.rotate(spread * (1 - lock) * .25);
    plate([[-30, 4], [-17, 10], [-12, 30], [-23, 36], [-36, 19]], near); c.restore();
    joint(-4, -5, 16, near);
    const arcs = fistLightning(mechanism);
    if (arcs.length) {
      c.save(); c.globalAlpha *= mechanism.electric * (.84 + .16 * Math.sin(mechanism.phase * 73));
      c.lineJoin = 'round'; c.lineCap = 'round';
      for (const points of arcs) {
        line(points, '#bc7b19', 5);
        line(points, '#ffdc38', 3.2);
        line(points, '#fff7b0', 1.1);
        const fork = points[3], next = points[4];
        line([fork, [fork[0] + 7, fork[1] - 11], [next[0] + 13, next[1] - 17]], '#ffdc38', 1.8);
      }
      c.restore();
    }
    if (power > 0 && !mechanism) {
      c.save(); c.globalAlpha *= power;
      for (let i = 0; i < 3; i++) line([[44, -21 + i * 17], [54, -27 + i * 17], [63, -12 + i * 17]], P.amber, 2.8);
      c.restore();
    }
    c.restore();
  }
  // ===== CHIÊU ĐẶC BIỆT · QUÁ TẢI HẠT NHÂN =====
  // Hai vòi phun lửa gắn DƯỚI nắm đấm (khung cẳng tay): giá treo gập xuống trên bản lề, ống lồng trượt ra trước,
  // loa phun nằm ngay dưới mặt đấm. Hai mắt tụ nhiệt và phóng 2 cầu lửa đúng nhịp chiêu L (eyeFirePose);
  // toàn thân phủ tia sét vàng. Mọi luồng lửa và cầu lửa hướng về phía quái.
  const ultimatePeriod = eyeFirePeriod; // 4,2 s: cầu lửa rời mắt ở 2,25 s như L
  // Hai tay lệch tầng để thấy rõ HAI vòi/HAI luồng: tay xa cao hơn, hơi chếch lên; tay gần thấp, thẳng ra trước.
  const ULT_ARMS = { far: { upper: 2.02, lower: -.13 }, near: { upper: 1.86, lower: .02 } };
  const NOZZLE = { hingeX: 72, hingeY: 30, drop: 14, tip: 152 }; // đầu loa phun: x = 72 + 152, y = 30 + 14 (dưới nắm đấm)
  function ultimatePose(time) {
    const t = mod(time, ultimatePeriod);
    return {
      phase: t,
      raise: env(t, .02, .45, 3.3, 3.8), // hai tay đưa thẳng ra trước, hướng về quái
      deploy: env(t, .3, .85, 2.95, 3.4), // vòi gập xuống và trượt ra
      spray: env(t, 1.0, 1.25, 2.7, 3.0), // phun lửa
      grow: smooth((t - 1.0) / .35), // luồng lửa vươn dần tới quái
      electric: env(t, .1, .6, 3.0, 3.6), // toàn thân tích điện
      eyes: eyeFirePose(t),
    };
  }
  // Đầu loa phun trong khung thân (để tính luồng lửa dài tới đúng quái trong trận).
  function nozzleTip(sx, sy, q) {
    const ex = sx + Math.cos(q.upper) * 104, ey = sy + Math.sin(q.upper) * 104;
    const fx = NOZZLE.hingeX + NOZZLE.tip, fy = NOZZLE.hingeY + NOZZLE.drop;
    return { x: ex + Math.cos(q.lower) * fx - Math.sin(q.lower) * fy, y: ey + Math.sin(q.lower) * fx + Math.cos(q.lower) * fy };
  }
  function flameNozzle(n) {
    const d = n.deploy;
    if (d <= 0) return;
    c.save(); c.translate(NOZZLE.hingeX, NOZZLE.hingeY);
    c.rotate((1 - d) * -.55); // gập từ sát cẳng tay xuống vị trí phun
    const y = NOZZLE.drop * d, len = 40 + (NOZZLE.tip - 58) * d;
    poly([[-10, -7], [26, -7], [30, y + 4], [-6, y + 4]], P.frame, 1.5); // giá treo
    piston([2, -3], [20, y - 2], 3);
    poly([[0, y - 10], [60, y - 11], [60, y + 11], [0, y + 10]], P.dark, 2); // ống ngoài
    for (const x of [12, 33, 52]) line([[x, y - 9], [x, y + 9]], P.steel, 2);
    poly([[56, y - 7], [len, y - 6], [len, y + 6], [56, y + 7]], P.steel, 1.6); // ống lồng trượt ra
    line([[58, y - 4], [len - 2, y - 4]], P.rim, 1);
    poly([[len, y - 6], [len + 18, y - 12], [len + 18, y + 12], [len, y + 6]], P.shadow, 1.8); // loa phun
    ellipse(len + 18, y, 4, 12, P.black, P.edge, 1.2);
    if (n.spray > 0) ellipse(len + 18, y, 5, 9 * n.spray, '#ffb72e', null); // lửa mồi
    // Lượt viền tối của tay gần không vẽ luồng lửa.
    if (!silhouette && n.spray > 0) {
      c.save(); c.translate(len + 18, y);
      flameJet(Math.max(60, n.reach * n.grow), n.spray, n.phase, n.id);
      c.restore();
    }
    c.restore();
  }
  // Luồng súng phun lửa: loe dần theo khoảng cách, gợn sóng, có lưỡi lửa rời; đầu luồng bùng tròn ở mục tiêu.
  function flameJet(length, k, phase, id) {
    const colors = ['#b93c20', '#f16b20', '#ffb72e', '#fff0a1'];
    for (let layer = 0; layer < 4; layer++) {
      const width = (24 - layer * 5.5) * k;
      const edge = side => Array.from({ length: 41 }, (_, i) => {
        const u = i / 40;
        const wave = Math.sin(u * 23 - phase * 26 + id * 2) * 6 + Math.sin(u * 47 - phase * 39 + id) * 3;
        return [u * length, wave * u + side * width * (.3 + u * 1.15) * (1 + Math.sin(u * 37 - phase * 29) * .15)];
      });
      poly([...edge(-1), ...edge(1).reverse()], colors[layer], 0);
    }
    for (let i = 0; i < 22; i++) {
      const u = mod(i * .113 + phase * 1.1 + id * .3, 1), x = u * length;
      const y = Math.sin(i * 7 + phase * 14) * (8 + u * 34);
      poly([[x - 16, y], [x + 14, y - 4], [x + 5, y + 5]], i % 2 ? '#ffbd39' : '#e46325', 0);
    }
    const r = (26 + 8 * Math.sin(phase * 31 + id)) * k;
    ellipse(length, 0, r * 1.1, r * 1.25, '#f57421', null);
    ellipse(length - 4, -2, r * .7, r * .8, '#ffc23b', null);
    ellipse(length - 6, -3, r * .35, r * .4, '#fff2b5', null);
  }
  // Viền sét vàng chạy quanh toàn thân (điểm theo đường bao đầu trụ – vai – thân – chân), nhấp nháy theo nhịp.
  const BODY_OUTLINE = [[-55, -592], [10, -606], [68, -588], [74, -512], [112, -474], [130, -430], [114, -380],
    [82, -330], [64, -292], [72, -200], [96, -100], [104, -18], [60, -6], [32, -120], [4, -252], [-30, -120],
    [-70, -10], [-112, -20], [-98, -120], [-72, -232], [-64, -300], [-104, -360], [-128, -430], [-102, -472], [-72, -502]];
  function bodyElectric(e, phase) {
    if (e <= 0) return;
    const tick = Math.floor(phase * 22);
    const hash = n => mod(Math.sin(n * 12.9898) * 43758.5453, 1);
    c.save();
    // Toàn thân sáng lên: quầng vàng cộng sáng phủ cả robot.
    c.globalCompositeOperation = 'lighter';
    // Quầng bầu dục ôm dáng robot (cao hơn rộng), không phải một đĩa tròn.
    c.save(); c.translate(10, -310); c.scale(.62, 1);
    const glow = c.createRadialGradient(0, 0, 20, 0, 0, 330);
    glow.addColorStop(0, `rgba(255,226,90,${.3 * e})`);
    glow.addColorStop(.55, `rgba(255,200,60,${.13 * e})`);
    glow.addColorStop(1, 'rgba(255,200,60,0)');
    c.fillStyle = glow; c.fillRect(-340, -340, 680, 680); c.restore();
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha *= e * (.82 + .18 * Math.sin(phase * 71));
    c.lineJoin = 'round'; c.lineCap = 'round';
    const n = BODY_OUTLINE.length;
    for (let i = 0; i < n; i++) {
      if (hash(i * 7.1 + tick) < .3) continue; // từng đoạn tắt/bật ngẫu nhiên → nhấp nháy
      const [ax, ay] = BODY_OUTLINE[i], [bx, by] = BODY_OUTLINE[(i + 1) % n];
      const nx = -(by - ay), ny = bx - ax, nl = Math.hypot(nx, ny) || 1;
      const pts = Array.from({ length: 6 }, (_, j) => {
        const u = j / 5, off = j === 0 || j === 5 ? 0 : (hash(i * 3.3 + j * 1.7 + tick * .61) - .5) * 26;
        return [ax + (bx - ax) * u + nx / nl * off, ay + (by - ay) * u + ny / nl * off];
      });
      line(pts, '#bc7b19', 5); line(pts, '#ffdc38', 3); line(pts, '#fff7b0', 1.1);
      if (hash(i + tick * 1.3) > .6) { // nhánh phụ bắn ra ngoài
        const [fx, fy] = pts[2];
        line([[fx, fy], [fx + nx / nl * 18 + 6, fy + ny / nl * 18 - 8], [fx + nx / nl * 30, fy + ny / nl * 30 + 4]], '#ffdc38', 1.8);
      }
    }
    c.restore();
  }
  function shoulder(sx, sy, near) {
    c.save(); c.translate(sx - 4, sy - 5);
    plate([[-36, -24], [-19, -42], [16, -39], [37, -19], [36, 22], [19, 35], [-24, 30], [-39, 9]], near, .15);
    joint(-4, -4, 25, near); star(-4, -4, 7); c.restore();
  }
  function arm(sx, sy, upper, lower, near, power = 0, extension = 0, mechanism = null, guarding = false, nozzle = null) {
    c.save(); c.translate(sx, sy);
    joint(0, 0, 34, near);
    c.save(); c.rotate(upper);
    piston([9, -14], [95, -14], 7);
    plate([[9, -29], [28, -36], [81, -29], [103, -14], [99, 22], [67, 31], [15, 25]], near, .35);
    plate([[28, -26], [71, -24], [87, -12], [81, 12], [31, 15]], near, .7);
    line([[24, 19], [79, 23]], P.red, 3); bolt(30, -20); c.restore();
    const ex = Math.cos(upper) * 104, ey = Math.sin(upper) * 104;
    // Đỡ đòn: vai vẫn che bắp tay, nhưng cẳng tay/nắm đấm gập lên ở phía trước vai.
    if (guarding) shoulder(0, 0, near);
    joint(ex, ey, 25, near);
    c.translate(ex, ey); c.rotate(lower);
    // Ty piston trượt khỏi xi-lanh; khối giáp cẳng tay giữ nguyên hình dạng.
    for (const dy of [-18, -6, 7, 19]) {
      piston([3, dy], [62 + extension, dy], 4);
      line([[4, dy], [30, dy]], P.frame, 9);
      line([[5, dy - 2], [29, dy - 2]], P.shadow, 2);
    }
    for (let i = 0; i < 4; i++) line([[18 + i * 9, -23], [18 + i * 9, 24]], P.frame, 3);
    c.save(); c.translate(extension, 0);
    plate([[48, -28], [68, -39], [111, -33], [132, -19], [128, 29], [94, 38], [49, 27]], near, .5);
    plate([[61, -24], [91, -30], [112, -18], [108, 16], [69, 24]], near, .25);
    line([[60, 27], [105, 31]], P.red, 3);
    bolt(59, -17); bolt(115, 20); fist(130, 0, near, power, mechanism);
    if (nozzle) flameNozzle(nozzle);
    c.restore(); c.restore();
    if (!guarding) shoulder(sx, sy, near);
  }
  function pelvis() {
    plate([[-54, -309], [6, -321], [61, -299], [64, -268], [21, -244], [-33, -251], [-61, -274]], true, .3);
    plate([[-45, -300], [-18, -306], [-6, -276], [-22, -252], [-48, -272]], true, .5);
    plate([[0, -299], [32, -301], [48, -281], [30, -246], [9, -248], [-3, -269]], true, .2);
    poly([[10, -285], [28, -286], [30, -271], [18, -257], [10, -264]], P.frame);
    joint(-43, -275, 17); joint(50, -277, 16);
  }
  function torso() {
    // Cage thoracique large sous le col; quatre blocs de radiateurs superposés.
    poly([[-95, -434], [-60, -464], [53, -459], [111, -417], [78, -341], [34, -306], [-33, -310], [-88, -359]], P.frame, 3);
    for (const side of [-1, 1]) {
      c.save(); c.translate(side < 0 ? -55 : 55, -408); c.rotate(side < 0 ? .1 : -.1);
      for (let row = 0; row < 2; row++) {
        const y = row * 34;
        poly([[-32, y - 14], [30, y - 14], [32, y + 13], [-30, y + 15]], P.black, 1);
        // Quatre traverses mécaniques épaisses, extrémités circulaires comme l'image 5.
        line([[-25, y], [22, y]], P.shadow, 18);
        line([[-25, y - 3], [22, y - 3]], P.steel, 10);
        line([[-24, y - 7], [18, y - 7]], P.rim, 1);
        ellipse(side < 0 ? 20 : -22, y, 11, 13, P.steel, P.frame, 2);
        ellipse(side < 0 ? 20 : -22, y, 5, 7, P.frame, P.shadow, 1);
        line([[-27, y + 9], [20, y + 9]], P.dark, 2);
      }
      c.restore();
    }
    // Hai khối giáp ngực ngang dày theo ảnh 5, không bóp ngực thành hình chữ V.
    plate([[-106, -465], [-13, -465], [-12, -439], [-27, -423], [-75, -427], [-100, -441]], true, .2);
    plate([[15, -465], [95, -465], [112, -451], [106, -429], [69, -420], [17, -434]], true, .4);
    line([[-66, -461], [-63, -441]], P.red, 5);
    line([[66, -461], [69, -439]], P.red, 5);
    // Buồng lái nằm trong rãnh giữa thân, vẽ sau cổ giáp để lộ đường ray.
    plate([[-60, -346], [-27, -361], [8, -349], [36, -356], [69, -339], [48, -310], [15, -299], [-32, -312]], true, .4);
    plate([[-29, -321], [-10, -338], [22, -333], [36, -311], [23, -289], [-2, -283], [-28, -298]], true, .8);
    line([[-5, -329], [2, -299], [15, -294]], P.frame, 5);
    bolt(-46, -331); bolt(52, -332); text('BW—01', -29, -320, 7, P.dark);
  }
  function cockpitPose(lift = cockpitLift) {
    const position = clamp(Number.isFinite(lift) ? lift : 1);
    return { lift: position, y: -351 - position * 67 };
  }
  function cockpit() {
    // Ảnh 5: khe dẫn hướng rất hẹp trên trụ; không phải dải đen to chạy tới bụng.
    poly([[-4, -600], [8, -600], [8, -441], [-4, -441]], P.frame, 0);
    line([[-4, -599], [-4, -441]], P.shadow, 1.2);
    line([[8, -599], [8, -441]], P.steel, 1);
    line([[2, -592], [2, -440]], P.black, 3);
    for (let y = -581; y < -444; y += 11) line([[0, y], [4, y]], P.steel, .7);
    // Giếng cabin ở ngực: mở giữa hai khối giáp, giữ cùng trục thẳng x=2.
    poly([[-16, -441], [20, -441], [20, -328], [-16, -328]], P.dark, 0);
    poly([[-11, -441], [15, -441], [15, -330], [-11, -330]], P.black, 0);
    for (const x of [-13, 17]) line([[x, -439], [x, -330]], P.shadow, 2);
    // Fond blindé sombre, sans échelle/fermeture éclair apparente sur le ventre.
    poly([[-10, -393], [14, -393], [14, -330], [-10, -330]], P.dark, 0);
    line([[2, -392], [2, -331]], P.frame, 3);
    const { y } = cockpitPose();
    line([[2, -441], [2, y - 12]], P.steel, 1.5);
    c.save();
    path([[-16, -441], [20, -441], [20, -329], [-16, -329]]); c.clip();
    c.translate(2, y);
    // Kính vàng ngang, phần dưới thuôn: hình chữ T như điểm nhấn vàng ở ảnh 5.
    poly([[-16, -13], [15, -13], [17, -8], [15, 1], [10, 3], [8, 17], [-6, 17], [-9, 3], [-16, 1]], P.edge, 1.5);
    const glass = c.createLinearGradient(-13, -11, 10, 15);
    glass.addColorStop(0, P === white ? '#ffffff' : '#fff7b4');
    glass.addColorStop(.45, P === white ? '#ffffff' : '#ffe66a');
    glass.addColorStop(1, P === white ? '#edf5ff' : '#d2a92f');
    poly([[-14, -11], [13, -11], [14, -1], [7, 1], [6, 14], [-4, 14], [-6, 1], [-14, -1]], glass, .8);
    line([[-12, -8], [11, -8]], '#fff8c8', 1.2);
    line([[1, -11], [1, 0]], P.shadow, 1);
    line([[-5, 3], [6, 3]], P.shadow, .8);
    c.restore();
    // Mép giáp che hai bên cabin, không vẽ khung bạc dạng hộp nổi.
    line([[-17, -439], [-17, -331]], P.armor, 2);
    line([[21, -439], [21, -331]], P.armor, 2);
  }
  function head(fire) {
    // Tête-réacteur cylindrique, aucun petit casque ou visage humanoïde.
    plate([[-88, -459], [-70, -499], [-52, -517], [-55, -584], [-41, -597], [20, -600], [66, -584], [71, -506], [98, -482], [111, -449], [66, -430], [12, -449], [-30, -435], [-92, -447]], true, .19);
    poly([[-55, -584], [-41, -591], [-23, -592], [-22, -509], [-37, -468], [-68, -451], [-88, -456], [-70, -493], [-52, -514]], P.shadow, 1.5);
    plate([[3, -590], [29, -593], [62, -581], [67, -512], [89, -481], [102, -456], [65, -441], [24, -453], [13, -480]], true, .6);
    ellipse(6, -588, 60, 12, P.armor, P.rim, 1.7);
    line([[-50, -576], [-18, -568], [20, -568], [64, -578]], P.shadow, 1.3);
    // Rãnh thẳng xuyên suốt đầu–ngực được vẽ một lần trong cockpit().
    star(43, -558, 8);
    line([[27, -579], [54, -573], [57, -529], [32, -515]], P.shadow, 1.5);
    line([[-38, -571], [-37, -528], [-23, -510]], P.dark, 1.5);
    line([[40, -506], [57, -489], [88, -469]], P.red, 2);
    line([[-42, -492], [-49, -467], [-73, -457]], P.red, 2);
    // Hai mắt tròn giữ nguyên hình dạng; L tụ nhiệt và phun lửa từ tâm mắt.
    plate([[-99, -498], [-76, -514], [-53, -504], [-51, -478], [-78, -462], [-99, -474]], false);
    vent(-79, -490, false, fire);
    plate([[58, -512], [83, -519], [108, -497], [106, -471], [81, -463], [60, -480]], true);
    vent(84, -492, true, fire);
    for (const [x, y] of [[-44, -581], [56, -582], [-78, -451], [91, -453]]) bolt(x, y, 2);
    for (let i = 0; i < 4; i++) line([[46 + i * 6, -460], [51 + i * 6, -450]], P.frame, 2);
    text('BULWARK', 27, -474, 5, P.dark);
  }
  // Đích bàn tay của template chung (khung Vanguard) → góc khớp tay Bulwark (vai/độ dài tay riêng).
  function handToward(p, side, sx, sy) {
    const ratio = ratioV();
    const tx = p.hands[side].x * ratio, ty = (p.hands[side].y - p.bodyLift) * ratio;
    const dx = tx - sx, dy = ty - sy, d = Math.max(30, Math.min(233, Math.hypot(dx, dy)));
    const upper = Math.atan2(dy, dx) + Math.acos((104 ** 2 + d ** 2 - 130 ** 2) / (208 * d));
    return { upper, lower: Math.atan2(ty - sy - Math.sin(upper) * 104, tx - sx - Math.cos(upper) * 104) };
  }
  // Ăn mừng: đọc thẳng TEMPLATE DUY NHẤT trong src/game.js, tự giải IK tay Bulwark (không mượn góc tay Bastion).
  function celebrationPose(time) {
    const cel = base.celebrationPreview(time);
    const ratio = ratioV();
    // Vai xa ở phía trước (x dương) → đích tay trước (R); vai gần phía sau → đích tay sau (L).
    const far = handToward(cel, 'R', 91, -424), near = handToward(cel, 'L', -84, -423);
    return {
      template: cel, name: cel.phase.name, jumping: cel.phase.name === 'jump', landed: cel.landed,
      spin: cel.spin, spread: cel.spreadFeet, feet: cel.spreadFeet,
      feetFar: cel.feetFar * ratio, feetNear: cel.feetNear * ratio,
      air: cel.air / scale, crouch: cel.crouch * ratio, lean: cel.lean, thrust: cel.thrust,
      farUpper: far.upper, farLower: far.lower, nearUpper: near.upper, nearLower: near.lower,
    };
  }
  function staggerPose(time) {
    const p = base.staggerPreview(time), ratio = ratioV();
    return { ...p, crouch: p.crouch * ratio, far: handToward(p, 'L', 91, -424), near: handToward(p, 'R', -84, -423) };
  }
  const restArms = {
    far: { upper: 2.15, lower: .1 },
    near: { upper: 1.9, lower: -.12 },
  };
  const uppercutPeriod = 2.8;
  function uppercutPose(time) {
    const t = mod(time, uppercutPeriod);
    // Tay trái (phía xa): tách vỏ → trượt ngón → khóa giáp rồi mới móc.
    const cock = env(t, 0, .44, .86, 1.5);
    const rise = env(t, .5, .72, .86, 1.36);
    return {
      side: 'left', phase: t,
      electric: env(t, .3, .44, 1.02, 1.32) * (.65 + .35 * rise),
      upper: restArms.far.upper - cock * 1.2 - rise * .57,
      lower: restArms.far.lower + cock * .76 - rise * 1.72,
      extension: cock * 18 + rise * 48,
      spread: env(t, .04, .2, 1.3, 1.58),
      slide: env(t, .15, .34, 1.16, 1.46),
      lock: env(t, .3, .44, 1.02, 1.2),
      power: rise,
    };
  }
  const diagonalPunchPeriod = 3.6;
  function diagonalPunchPose(time) {
    const phase = mod(time, diagonalPunchPeriod);
    const ready = env(phase, .05, .78, 1.95, 2.5);
    const launch = smooth((phase - .9) / .34);
    const fall = clamp((phase - 1.4) / .52);
    const landing = env(phase, 1.92, 2.02, 2.08, 2.34);
    return { side: 'left', phase,
      // Cùng một hệ số X/Y: đường lao là đoạn chéo thẳng, không vòng cung.
      x: 285 * launch, y: -125 * launch + 125 * fall * fall,
      tilt: .19 * env(phase, .85, 1.08, 1.65, 1.94),
      landing, thrust: env(phase, .86, .98, 1.22, 1.4),
      // Khi bay, nắm đấm chĩa theo đường chéo; hai chân kéo về sau.
      fly: env(phase, .86, 1.0, 1.42, 1.78),
      upper: restArms.far.upper - ready * 1.95 - env(phase, .86, 1.0, 1.42, 1.78) * .3,
      lower: restArms.far.lower - ready * .43 - env(phase, .86, 1.0, 1.42, 1.78) * .45,
      extension: 100 * env(phase, .24, .78, 1.62, 2.15),
      spread: env(phase, .03, .22, 1.95, 2.45),
      slide: env(phase, .16, .4, 1.85, 2.35),
      lock: env(phase, .36, .58, 1.76, 2.2),
      electric: env(phase, .4, .86, 1.45, 2.02),
      power: env(phase, .9, 1.08, 1.38, 1.9),
      // Chỉ mờ/reset tại cuối vòng xem mẫu, không lướt ngược về chỗ cũ.
      visibility: 1 - smooth((phase - 3.2) / .4) };
  }
  function diagonalTrail(p) {
    if (!p || p.thrust <= 0) return;
    c.save(); c.globalAlpha *= p.thrust;
    for (const y of [-390, -345]) {
      poly([[-56, y - 15], [-190, y + 41], [-94, y + 16], [-60, y + 13]], '#da853d', 0);
      poly([[-57, y - 7], [-156, y + 31], [-63, y + 5]], '#fff0b5', 0);
    }
    for (let i = 0; i < 5; i++) {
      const x = -110 - mod(p.phase * 490 + i * 47, 170);
      line([[x, -280 - i * 37], [x + 55, -303 - i * 37]], '#d0b47e', 2);
    }
    c.restore();
  }
  function idlePose(time) {
    const i = base.idlePreview(time), ratio = ratioV();
    return { bob: i.bob * ratio, far: i.breathe.L * ratio, near: i.breathe.R * ratio };
  }
  // Cùng nhịp F/J với Bastion (thế hệ Eye-1); khoảng nghỉ chỉ dành cho vòng xem mẫu.
  // Không phụ thuộc bastion.js: trong trận bộ vẽ này chạy độc lập trên EyeRimCore.
  const punchTimings = {
    jab: { windup: .07, active: .08, recover: .16, pause: .7 },
    hook: { windup: .1, active: .08, recover: .22, pause: .7 },
  };
  function punchPose(clip, time) {
    const m = punchTimings[clip], duration = m.windup + m.active + m.recover;
    return env(mod(time, duration + m.pause), 0, m.windup, m.windup + m.active, duration);
  }
  function poseAt(clip, time) {
    const t = mod(time, 2.8), gait = clip === 'walk' ? walkPose(time) : null;
    // Vanguard thở tay theo game.t cả khi đứng lẫn khi đi; nhún thân lúc đi do walkPose quyết định.
    const idle = clip === 'idle' || clip === 'walk' ? idlePose(time) : null;
    const walk = gait ? gait.stride : 0;
    const hit = clip === 'stagger' ? staggerPose(time) : null;
    const celebration = clip === 'celebrate' ? celebrationPose(time) : null;
    const punch = ['jab', 'hook'].includes(clip) ? punchPose(clip, time) : 0;
    const ult = clip === 'ultimate' ? ultimatePose(time) : null;
    const heavy = ult ? ult.raise : 0;
    const diagonal = clip === 'special' ? diagonalPunchPose(time) : null;
    const uppercut = clip === 'blade' ? uppercutPose(time) : null;
    // Thế hệ Eye-1: F dùng tay phải (gần), J dùng tay trái (xa), như Bastion.
    const punchArm = clip === 'jab' ? 'right' : clip === 'hook' ? 'left' : null;
    return { clip, t, time, walk, gait, idle, hit, celebration, punch, punchArm, heavy, ult, uppercut, diagonal,
      eyeFire: clip === 'cannon' ? eyeFirePose(time) : ult ? ult.eyes : null,
      guard: clip === 'guard' ? 1 : 0, dash: clip === 'dash' ? env(t, .05, .22, .6, .95) : 0,
      cannon: clip === 'cannon' ? env(mod(time, eyeFirePeriod), .05, .5, 2.3, 2.75) : 0 };
  }
  function jets(power, time) {
    if (!power) return;
    for (const x of [-64, 47]) {
      poly([[x - 13, -329], [x + 11, -329], [x + 5, -302 + power * (64 + Math.sin(time * 45) * 10)], [x - 9, -310]], '#d88943', 0);
      poly([[x - 7, -327], [x + 6, -327], [x, -305 + power * 43]], '#fff1c2', 0);
    }
  }
  // opts.inPlace (trong trận): vị trí bay/nhảy do game điều khiển (T.x, T.airY), không dời thân trong bộ vẽ;
  // quả cầu lửa đã rời mắt do game vẽ như đạn. opts.jabTime: F (tay phải) đấm song song với móc K khi đồng bộ.
  function body(p, opts = {}) {
    const { walk, hit, celebration: a, ult, uppercut, guard, dash, cannon } = p;
    const gait = p.gait, diagonal = p.diagonal;
    const jabSync = opts.jabTime != null;
    const punchArm = jabSync ? 'right' : p.punchArm;
    const punch = jabSync ? punchPose('jab', opts.jabTime) : p.punch;
    const moveX = opts.inPlace ? 0 : 1;
    const mechanism = uppercut || diagonal;
    const crouch = hit ? hit.crouch : a ? a.crouch : guard * 10 + (diagonal ? diagonal.landing * 16 : 0);
    const idle = p.idle;
    const bob = gait ? gait.bob : idle ? idle.bob : 0;
    const feetFar = a ? a.feetFar : 0, feetNear = a ? a.feetNear : 0;
    c.save();
    if (a) c.scale(a.spin, 1);
    c.translate((dash * 32 + (diagonal ? diagonal.x : 0)) * moveX,
      -sole - (a && !opts.inPlace ? a.air : 0) + crouch + bob + (diagonal && !opts.inPlace ? diagonal.y : 0));
    // Bù riêng bàn chân: thân nhún nhưng chân trụ vẫn ở mặt đất, nhịp bước giữ như cũ.
    const lift = gait ? base.legTemplate.lift * gait.ratio : 0;
    const fyFar = -crouch - bob - (gait ? gait.far.lift * lift : 0);
    const fyNear = -crouch - bob - (gait ? gait.near.lift * lift : 0);
    const fly = diagonal ? diagonal.fly : 0;
    leg(-37, -277, -88 + (gait ? gait.far.x : 0) + feetFar - fly * 42, fyFar - fly * 26, false, crouch * .5 + fly * 14,
      gait ? { rest: [-88, 0], lift: gait.far.lift } : null);
    leg(40, -277, 82 + (gait ? gait.near.x : 0) + feetNear - fly * 34, fyNear - fly * 12, true, crouch * .5 + fly * 10,
      gait ? { rest: [82, 0], lift: gait.near.lift } : null);
    pelvis();
    // Seul le haut du corps tourne autour du bassin pour le template trúng đòn.
    c.save(); c.translate(0, -280); c.rotate(hit ? hit.lean : a ? a.lean : dash * .11 + (diagonal ? diagonal.tilt : 0)); c.translate(0, 280);
    jets(a ? a.thrust : 0, p.time);
    diagonalTrail(diagonal);
    // Chiêu đặc biệt: hai tay đưa thẳng ra trước theo ULT_ARMS, vòi phun dưới nắm đấm hướng về quái.
    const toUlt = (side, q) => (ult ? {
      upper: q.upper + (ULT_ARMS[side].upper - restArms[side].upper) * ult.raise,
      lower: q.lower + (ULT_ARMS[side].lower - restArms[side].lower) * ult.raise,
    } : q);
    const nozzle = (id, sx, sy, q) => {
      if (!ult || ult.deploy <= 0) return null;
      // Trong trận: luồng lửa dài tới đúng mép quái (opts.flameTargetX, khung thân); xưởng: 600 đv mô hình.
      const reach = opts.flameTargetX != null ? Math.max(80, Math.min(1800, opts.flameTargetX - nozzleTip(sx, sy, q).x)) : 600;
      return { deploy: ult.deploy, spray: ult.spray, grow: ult.grow, phase: p.time, id, reach };
    };
    const power = ult ? ult.electric : 0;
    const far = hit ? hit.far : a ? { upper: a.farUpper, lower: a.farLower } : mechanism || toUlt('far', {
      upper: restArms.far.upper - (punchArm === 'left' ? punch * 1.83 : 0) - guard * 1.08 - cannon * .98 + (idle ? idle.far * .005 : 0),
      lower: restArms.far.lower - (punchArm === 'left' ? punch * .67 : 0) - guard * 1.22 + (idle ? idle.far * .012 : 0),
    });
    arm(91, -424, far.upper, far.lower, false, mechanism ? mechanism.power : power,
      mechanism?.extension ?? 0, mechanism, guard > 0, nozzle(0, 91, -424, far));
    head(p.eyeFire); torso(); cockpit();
    const near = hit ? hit.near : a ? { upper: a.nearUpper, lower: a.nearLower } : toUlt('near', {
      upper: restArms.near.upper - (punchArm === 'right' ? punch * 1.61 : 0) - guard * .34 + (idle ? idle.near * .005 : 0),
      lower: restArms.near.lower + (punchArm === 'right' ? punch * .04 : 0) - guard * 1.11 + (idle ? idle.near * .012 : 0),
    });
    // Tay phải (gần) tách rõ khỏi thân: viền tối dày + giáp sáng hơn.
    const nearNozzle = nozzle(1, -84, -423, near);
    nearArmContrast(() => arm(-84, -423, near.upper, near.lower, true, power, 0, null, guard > 0, nearNozzle));
    eyeFlames(p.eyeFire && opts.inPlace ? { ...p.eyeFire, inPlace: true } : p.eyeFire);
    if (ult) bodyElectric(ult.electric, p.time);
    c.restore(); c.restore();
  }
  function draw(target, clip = 'idle', time = 0, facing = 1, zoom = 1) {
    c = target.getContext('2d'); const p = poseAt(clip, time);
    P = p.hit?.flash ? white : normal;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, target.width, target.height);
    c.fillStyle = '#efe3cc'; c.fillRect(0, 0, target.width, target.height);
    const s = Math.min(target.width / 760, target.height / 540) * zoom * scale;
    c.translate(target.width * .46, target.height * .9); c.scale(s * facing, s);
    if (p.diagonal) c.scale(.82, .82);
    if (p.celebration) c.scale(base.celebrationCamera, base.celebrationCamera); // cùng camera ăn mừng mọi Titan
    if (p.diagonal) c.globalAlpha *= p.diagonal.visibility;
    const shadowScale = p.diagonal ? 1 + p.diagonal.y / 450 : 1;
    ellipse(12 + (p.diagonal ? p.diagonal.x : 0), 0, 182 * shadowScale, 12 * shadowScale, '#a49b85', null);
    if (p.diagonal?.landing > 0) {
      c.save(); c.globalAlpha *= p.diagonal.landing;
      ellipse(p.diagonal.x, 0, 130 + (1 - p.diagonal.landing) * 100, 9, 'transparent', '#ac9773', 4);
      c.restore();
    }
    body(p); c.restore(); P = normal;
  }
  const names = {
    idle: 'Đứng nghỉ', walk: 'Bước đi', guard: 'S · Đỡ đòn', dash: 'W · Lướt né',
    jab: 'F · Đấm phải', hook: 'J · Đấm trái', blade: 'K · Móc thủy lực',
    cannon: 'L · Phun lửa hai mắt', special: 'I · Đấm điện lao chéo', ultimate: 'Quá tải hạt nhân',
    celebrate: 'Ăn mừng', stagger: 'Trúng đòn',
  };
  // Vẽ trong trận: ctx đã đặt gốc tại mặt đất dưới chân, scale theo mô hình Bulwark (titanDrawScale).
  function drawInGame(ctx, clip, time, opts = {}) {
    c = ctx; const p = poseAt(clip, time);
    P = opts.hit ? white : normal;
    c.save(); body(p, { ...opts, inPlace: true }); c.restore(); P = normal;
  }
  // Vẽ trong khung xem (màn chọn, huấn luyện) cùng camera trang xưởng, không tô nền.
  function drawFramed(ctx, clip, time, facing, zoom, bx, by, bw, bh) {
    c = ctx; const p = poseAt(clip, time);
    P = p.hit?.flash ? white : normal;
    const s = Math.min(bw / 760, bh / 540) * zoom * scale;
    c.save(); c.translate(bx + bw * .46, by + bh * .9); c.scale(s * facing, s);
    if (p.diagonal) c.scale(.82, .82);
    if (p.celebration) c.scale(base.celebrationCamera, base.celebrationCamera);
    if (p.diagonal) c.globalAlpha *= p.diagonal.visibility;
    body(p); c.restore(); P = normal;
  }
  // Tâm hai quả cầu lửa lúc rời mắt (đơn vị mô hình, gốc mặt đất, trục x hướng mặt Titan).
  const fireLaunch = fireEyes.map(eye => ({ x: eye.x + Math.cos(eye.angle) * eye.reach,
    y: eye.y + Math.sin(eye.angle) * eye.reach - sole, angle: eye.angle, radius: 35 }));
  window.EyeRimBulwark = {
    crown, sole, eyeTop, scale, drawInGame, drawFramed, fireLaunch, ultimatePose, ultimatePeriod, punchTimings, punchPose,
    fireball(ctx, f) { c = ctx; c.save(); c.rotate(f.angle || 0); fireball(0, f.radius, 1, f.phase, f.id || 0, f.flight, true); c.restore(); }, celebrationPose, staggerPose, poseAt, cockpitPose, restArms, uppercutPose, uppercutPeriod, fistLightning, eyeFirePose, eyeFirePeriod, walkPose, walkPeriod, idlePose, legKnee, legHips: [[-37, -277], [40, -277]], diagonalPunchPose, diagonalPunchPeriod,
    setCockpitLift(value) { cockpitLift = cockpitPose(value).lift; },
  };
  if (!window.TitanGallery) return;
  window.TitanGallery = {
    ...base, names: { ...base.names, bulwark: names },
    specs: { ...base.specs, bulwark: { crown, sole, eyeTop, scale, profileZoom: 1.65, series: 'Eye-1',
      note: 'Thế hệ Eye-1 · F: đấm phải · J: đấm trái, cùng bố trí với Bastion. Động cơ hạt nhân. Mốc chiều cao vẽ: từ mặt đất tới cạnh trên hai mắt tròn. Phần đầu trụ nhô cao hơn mốc này.' } },
    draw(target, id, ...args) { return id === 'bulwark' ? draw(target, ...args) : base.draw(target, id, ...args); },
  };
})();
