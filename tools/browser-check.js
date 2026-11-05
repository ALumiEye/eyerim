// Kiểm tra thật bằng Chrome (playwright-core trong devDependencies): npm run check:browser
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const { build } = require('./build');
const root = path.resolve(__dirname, '..');
const shots = path.join(root, 'shots');

(async () => {
  const { version } = build();
  fs.mkdirSync(shots, { recursive: true });
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    fs.readFile(file, (error, data) => {
      if (error) return res.writeHead(404).end();
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.mp3': 'audio/mpeg' })[path.extname(file)] || 'application/octet-stream');
      res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.addInitScript(() => {
      window.__TIDEBREAKER_TEST__ = {};
      const NativeAudio = window.Audio;
      window.Audio = function (...args) { const audio = new NativeAudio(...args); window.__track = audio; return audio; };
    });
    async function checkBrand(label) {
      await page.waitForFunction(() => ['brand', 'brand-lumi'].every(id => document.getElementById(id)?.naturalWidth > 0));
      await page.waitForFunction(() => {
        const field = document.getElementById('game').getBoundingClientRect();
        const bar = document.getElementById('brand-bar').getBoundingClientRect();
        return field.top >= bar.bottom && field.bottom <= innerHeight + 1;
      });
      const result = await page.evaluate(() => {
        const brand = document.getElementById('brand');
        const lumi = document.getElementById('brand-lumi');
        const bar = document.getElementById('brand-bar').getBoundingClientRect();
        const field = document.getElementById('game').getBoundingClientRect();
        const logo = brand.getBoundingClientRect();
        const face = lumi.getBoundingClientRect();
        return {
          alt: brand.alt, top: logo.top, left: logo.left,
          clear: field.top >= bar.bottom && field.bottom <= innerHeight + 1,
          ratio: Math.abs(face.width / face.height - lumi.naturalWidth / lumi.naturalHeight),
          noOverflow: document.documentElement.scrollWidth <= innerWidth,
        };
      });
      assert.equal(result.alt, 'ALumiEye');
      assert(result.top < 20 && result.left < 20);
      assert(result.clear, 'logo không đè canvas/HUD, canvas không bị cắt');
      assert(result.ratio < 0.001, 'Lumi đúng tỷ lệ');
      assert(await page.evaluate(() => {
        const logo = document.getElementById('brand');
        const style = getComputedStyle(logo);
        const rect = logo.getBoundingClientRect();
        return style.borderRadius === '0px' && style.borderTopWidth === '0px' &&
          Math.abs(rect.width / rect.height - logo.naturalWidth / logo.naturalHeight) < 0.001;
      }), 'logo nguyên tỷ lệ, không cắt tròn đỉnh tam giác, không thêm vòng viền');
      assert(result.noOverflow, 'không tràn ngang');
      assert(await page.evaluate(() => {
        const frame = document.getElementById('console');
        const bezel = document.getElementById('screen-bezel');
        const screen = document.getElementById('game').getBoundingClientRect();
        const inner = bezel.getBoundingClientRect();
        const outer = frame.getBoundingClientRect();
        const base = document.getElementById('console-base').getBoundingClientRect();
        return getComputedStyle(frame).borderRadius === '0px' &&
          getComputedStyle(frame).backgroundColor === 'rgb(239, 227, 204)' &&
          screen.left >= inner.left + bezel.clientLeft && screen.right <= inner.right - bezel.clientLeft + 1 &&
          screen.top >= inner.top + bezel.clientTop && screen.bottom <= inner.bottom - bezel.clientTop + 1 &&
          base.top >= inner.bottom && outer.left >= 0 && outer.right <= innerWidth && outer.bottom <= innerHeight;
      }), 'khung màn hình vuông góc màu thương hiệu bao trọn canvas, không bị cắt');
      console.log(`ok - ${label}: khung điều khiển đủ bốn cạnh, logo góc trái, Lumi đúng tỷ lệ, không che canvas`);
    }
    async function play(label, filename) {
      await page.waitForFunction(() => window.__TIDEBREAKER_TEST__.game?.state === 'title' && window.__track?.readyState >= 3);
      await checkBrand(`${label} menu`);
      await page.screenshot({ path: path.join(shots, `${filename}-menu.png`) });
      await page.keyboard.press('Enter', { delay: 100 });
      await page.waitForFunction(() => window.__TIDEBREAKER_TEST__.game.state === 'select' && window.__TIDEBREAKER_TEST__.game.stateT > 0.3);
      await page.keyboard.press('Enter', { delay: 100 });
      await page.waitForFunction(() => window.__TIDEBREAKER_TEST__.game.state === 'deploy' && window.__TIDEBREAKER_TEST__.game.deploy.t > 0.4).catch(async error => {
        console.error('Trạng thái khi chờ xuất kích:', await page.evaluate(() => ({ state: window.__TIDEBREAKER_TEST__.game.state, deploy: window.__TIDEBREAKER_TEST__.game.deploy })), errors);
        throw error;
      });
      await page.keyboard.press('Enter', { delay: 100 });
      await page.waitForFunction(() => window.__TIDEBREAKER_TEST__.game.state === 'fight');
      await page.waitForFunction(() => !window.__track.paused && window.__track.currentTime > 0.1);
      await checkBrand(`${label} giao tranh`);
      await page.screenshot({ path: path.join(shots, `${filename}-fight.png`) });
      await page.keyboard.press('KeyM', { delay: 100 });
      await page.waitForFunction(() => window.__track.volume < 0.01);
      await page.keyboard.press('KeyM', { delay: 100 });
      await page.waitForFunction(() => window.__track.volume > 0.1);
      console.log(`ok - ${label}: vào trận bằng phím thật, MP3 phát và M bật/tắt âm lượng`);
    }
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${base}/dist/index.html`);
    await play('Pages', 'brand-pages');
    assert.equal(await page.locator('#game-version').innerText(), version, 'Pages hiển thị phiên bản build');
    for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      await page.reload();
      await page.waitForFunction(() => window.__TIDEBREAKER_TEST__.game?.state === 'title');
      await checkBrand(`${size.width}×${size.height}`);
      await page.screenshot({ path: path.join(shots, `brand-${size.width}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const titan of ['vanguard', 'tempest']) {
      await page.goto(`${base}/dist/titans/${titan}.html`);
      await page.waitForFunction(() => document.querySelectorAll('#clips button').length === 12);
      await page.locator('#clips button').nth(2).click();
      assert.equal(await page.locator('#clips button').nth(2).getAttribute('aria-pressed'), 'true');
      assert(!/striker|eureka|gipsy/i.test(await page.locator('body').innerText()), 'gallery chỉ dùng tên Titan của game');
      assert.equal(await page.locator('details, .reference').count(), 0, 'gallery không có ảnh tham chiếu ngoài');
      console.log(`ok - gallery ${titan}: đủ 12 động tác, đổi chiêu được, không tải tài nguyên ngoài`);
    }
    await page.context().setOffline(true);
    await page.goto(pathToFileURL(path.join(root, 'dist/eyerim.html')).href);
    await play('HTML offline', 'brand-offline');
    assert(await page.evaluate(() => document.getElementById('brand').src.startsWith('data:image/png') &&
      document.getElementById('brand-lumi').src.startsWith('data:image/png') &&
      document.querySelector('link[rel="icon"]').href.startsWith('data:image/png') &&
      window.__track.src.startsWith('data:audio/mpeg;base64,')));
    assert.deepEqual(errors, [], 'không lỗi JavaScript hoặc tài nguyên');
    console.log('ok - chơi offline thật, logo/Lumi/favicon/MP3 đều nhúng; không lỗi console');
    console.log(`Ảnh kiểm tra: ${shots}`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
