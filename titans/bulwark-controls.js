/* Điều khiển thang buồng lái chỉ dành cho mẫu Bulwark trong xưởng. */
(() => {
  'use strict';
  const slider = document.getElementById('cockpit-lift');
  const output = document.getElementById('cockpit-value');
  if (!slider || !window.EyeRimBulwark) return;
  slider.addEventListener('input', () => {
    const lift = Number(slider.value);
    window.EyeRimBulwark.setCockpitLift(lift);
    output.textContent = lift === 1 ? 'Trên · giữa ngực' : lift === 0 ? 'Dưới · cuối rãnh' : 'Đang ở giữa ray';
    // Yêu cầu gallery vẽ lại cả khi chuyển động đang tạm dừng.
    document.getElementById('zoom').dispatchEvent(new Event('input', { bubbles: true }));
    const api = window.TitanGallery, spec = api.specs.bulwark;
    for (const [id, facing] of [['left', -1], ['right', 1]]) {
      api.draw(document.getElementById(id), 'bulwark', 'idle', 0, facing, spec.profileZoom);
    }
  });
})();
