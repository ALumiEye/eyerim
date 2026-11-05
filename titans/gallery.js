/* Trang xem mẫu gọi bộ vẽ thật của game; không có bản sao nhân vật riêng. */
(() => {
  'use strict';
  const id = document.body.dataset.titan;
  const tempest = id === 'tempest';
  const names = {
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
  specs.textContent = `Thông số EyeRim: ${api.specs[id].label} · chiều cao đến đỉnh đầu, không tính vây lưng.`;
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
  function paint() {
    api.draw(hero, id, clip, time, facing, zoom);
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
  api.draw($('left'), id, 'idle', 0, -1, 1.65);
  api.draw($('right'), id, 'idle', 0, 1, 1.65);
  playLabel(); paint();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (playing && !document.hidden) { time += dt * speed; paint(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
