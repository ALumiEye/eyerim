// Kiểm tra cả hai đầu ra và khởi động bản HTML độc lập với Audio giả.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('../tools/build');

const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eyerim-build-'));
try {
  const { pages, releaseFile } = build(temp);
  for (const file of ['index.html', 'style.css', 'src/game.js', 'music/theme.mp3',
    'titans/vanguard.html', 'titans/tempest.html', 'titans/gallery.css', 'titans/gallery.js',
    'assets/alumieye.png', 'assets/lumi.png', 'assets/favicon.png']) {
    assert.deepEqual(fs.readFileSync(path.join(pages, file)), fs.readFileSync(path.join(root, file)), file);
  }
  assert(fs.existsSync(path.join(pages, '.nojekyll')));
  const html = fs.readFileSync(releaseFile, 'utf8');
  assert(!/<script\b[^>]*\bsrc\s*=/i.test(html), 'không tải JavaScript bên ngoài');
  assert(!/<link\b[^>]*\brel="stylesheet"/i.test(html), 'không tải CSS bên ngoài');
  assert(html.includes(fs.readFileSync(path.join(root, 'style.css'), 'utf8')));
  for (const name of ['alumieye.png', 'lumi.png', 'favicon.png']) {
    const data = fs.readFileSync(path.join(root, 'assets', name));
    assert(html.includes(`data:image/png;base64,${data.toString('base64')}`), `${name} được nhúng nguyên bản`);
  }
  assert(!/(?:src|href)="assets\//.test(html), 'HTML offline không phụ thuộc thư mục assets');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1);
  const noop = () => {};
  const listeners = {};
  let audio;
  class FakeAudio {
    constructor() { audio = this; this.handlers = {}; this.paused = true; this.volume = 1; }
    addEventListener(type, fn) { this.handlers[type] = fn; }
    play() { this.paused = false; return Promise.resolve(); }
  }
  const ctx = new Proxy({}, {
    get: (_, key) => {
      if (key === 'measureText') return s => ({ width: s.length * 8 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: noop });
      return noop;
    },
  });
  let frame;
  const hooks = {};
  const sandbox = {
    Audio: FakeAudio,
    document: { getElementById: () => ({ style: {}, getContext: () => ctx }) },
    performance: { now: () => 0 },
    requestAnimationFrame: cb => { frame = cb; },
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    innerWidth: 1280, innerHeight: 720,
    __TIDEBREAKER_TEST__: hooks,
  };
  sandbox.window = sandbox;
  vm.runInNewContext(scripts[0][1], sandbox, { filename: 'eyerim-inline.js' });
  assert.equal(hooks.game.state, 'title', 'HTML độc lập khởi động ở menu');
  assert.equal(typeof frame, 'function');
  assert.equal(audio.loop, true, 'nhạc phát lặp');
  assert(audio.src.startsWith('data:audio/mpeg;base64,'), 'Audio nhận nhạc nhúng, không phải đường dẫn ngoài');
  assert.deepEqual(Buffer.from(audio.src.split(',')[1], 'base64'), fs.readFileSync(path.join(root, 'music/theme.mp3')),
    'nhạc nhúng khớp từng byte với MP3 nguồn');
  audio.handlers.canplay();
  assert.equal(audio.paused, true, 'không tự phát trước thao tác người chơi');
  assert.equal(typeof listeners.keydown[0], 'function');
  console.log('ok - Pages đủ tài nguyên; HTML độc lập khởi động và nạp đúng MP3 nhúng, có phát lặp');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
