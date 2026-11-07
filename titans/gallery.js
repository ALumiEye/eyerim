/* Trang xem mẫu gọi bộ vẽ thật của game; không có bản sao nhân vật riêng. */
(() => {
  'use strict';
  const id = document.body.dataset.titan;
  const tempest = id === 'tempest';
  const names = window.TitanGallery?.names?.[id] || {
    idle: 'Đứng nghỉ', walk: 'Bước đi', guard: 'S · Đỡ đòn', dash: 'W · Lướt né',
    jab: 'F · Đấm trái', hook: 'J · Đấm phải',
    blade: tempest ? 'K · Lưỡi kép' : 'K · Kiếm xích',
    cannon: tempest ? 'L · Phóng tên lửa' : 'L · Pháo plasma',
    special: tempest ? 'I · Đập phản lực' : 'I · Đấm phản lực',
    ultimate: tempest ? 'Mưa tên lửa vệ tinh' : 'Xung lò phản ứng',
    celebrate: 'Ăn mừng', stagger: 'Trúng đòn',
  };
  const $ = id => document.getElementById(id);
  const hero = $('hero');
  let clip = 'idle', time = 0, facing = 1, zoom = 1, speed = 1;
  let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = performance.now();
  const api = window.TitanGallery;
  if (!api) { $('pose-name').textContent = 'Không tải được bộ vẽ. Hãy mở trang trong thư mục dự án.'; return; }
  const specs = document.createElement('p');
  specs.textContent = api.specs[id].note
    ? api.specs[id].note
    : `Thông số EyeRim: ${api.specs[id].label} · chiều cao đến đỉnh đầu, không tính vây lưng.`;
  document.querySelector('header > div').append(specs);
  function playLabel() { $('play').textContent = playing ? 'Tạm dừng' : 'Tiếp tục'; }
  for (const key of api.clips) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = names[key]; button.dataset.clip = key;
    button.setAttribute('aria-pressed', String(key === clip));
    button.addEventListener('click', () => {
      clip = key; time = 0; playing = true; playLabel();
      $('pose-name').textContent = names[key];
      for (const b of $('clips').children) b.setAttribute('aria-pressed', String(b === button));
      paint();
    });
    $('clips').append(button);
  }
  const measureLabel = document.createElement('label');
  measureLabel.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:16px';
  const measure = document.createElement('input');
  measure.type = 'checkbox'; measure.id = 'height-frame'; measure.checked = true;
  measure.style.cssText = 'width:auto;margin:0';
  measureLabel.append(measure, document.createTextNode('Khung pixel · chuẩn H'));
  document.querySelector('aside').append(measureLabel);
  const measureNote = document.createElement('p'); measureNote.className = 'hint';
  measureNote.textContent = 'So ở Đứng nghỉ, cùng zoom. H: đất → đỉnh đầu Vanguard (không tính vây); Bastion không tính pháo; Bulwark lấy mép trên mắt tròn. Pixel ghi theo canvas gốc, không phải pixel màn hình.';
  document.querySelector('aside').append(measureNote);
  function heightFrame() {
    if (!measure.checked) return;
    const ctx = hero.getContext('2d');
    const camera = clip === 'celebrate' ? api.celebrationCamera
      : clip === 'special' ? (id === 'bastion' ? .72 : id === 'bulwark' ? .82 : 1) : 1;
    const h = api.drawingHeight * Math.min(hero.width / 760, hero.height / 540) * zoom * camera;
    const ground = hero.height * .9, top = ground - h, center = hero.width * .46;
    const left = center - h * .48, right = center + h * .48;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = '#a84c3b'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
    ctx.strokeRect(left, top, right - left, h); ctx.setLineDash([]);
    for (const y of [top, ground]) {
      ctx.beginPath(); ctx.moveTo(left - 12, y); ctx.lineTo(right + 12, y); ctx.stroke();
    }
    for (let px = 50; px < h; px += 50) {
      const y = ground - px;
      ctx.beginPath(); ctx.moveTo(left - 8, y); ctx.lineTo(left + 5, y); ctx.stroke();
    }
    ctx.font = '700 16px system-ui'; ctx.textAlign = 'left';
    for (const [label, y] of [[`H = ${h.toFixed(1)} px`, top - 12], ['0 px · mặt đất', ground + 25]]) {
      const w = ctx.measureText(label).width;
      ctx.fillStyle = '#efe3cc'; ctx.fillRect(left - 4, y - 18, w + 8, 24);
      ctx.fillStyle = '#59325d'; ctx.fillText(label, left, y);
    }
    ctx.restore();
  }
  measure.addEventListener('change', paint);
  function paint() {
    api.draw(hero, id, clip, time, facing, zoom);
    heightFrame();
    $('timeline').value = String(time % 6);
    $('time-value').textContent = (time % 6).toFixed(2) + ' s';
  }
  function toggle() { playing = !playing; playLabel(); }
  $('play').addEventListener('click', toggle);
  $('restart').addEventListener('click', () => { time = 0; paint(); });
  $('flip').addEventListener('click', () => { facing *= -1; paint(); });
  $('speed').addEventListener('input', e => { speed = Number(e.target.value); $('speed-value').textContent = speed + '×'; });
  $('zoom').addEventListener('input', e => { zoom = Number(e.target.value); $('zoom-value').textContent = zoom.toFixed(2) + '×'; paint(); });
  $('timeline').addEventListener('input', e => { time = Number(e.target.value); playing = false; playLabel(); paint(); });
  document.addEventListener('keydown', e => {
    if (['INPUT', 'BUTTON', 'A', 'SUMMARY'].includes(e.target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault(); playing = false; time = Math.max(0, time + (e.code === 'ArrowRight' ? 1 : -1) / 60); playLabel(); paint();
    }
  });
  const profileZoom = api.specs[id].profileZoom || 1.65;
  api.draw($('left'), id, 'idle', 0, -1, profileZoom);
  api.draw($('right'), id, 'idle', 0, 1, profileZoom);
  playLabel(); paint();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (playing && !document.hidden) { time += dt * speed; paint(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
