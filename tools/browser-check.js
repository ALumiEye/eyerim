// Kiểm tra thật bằng Chrome (playwright-core trong devDependencies): npm run check:browser
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const { build } = require('./build');
const root = path.resolve(__dirname, '..');
// Ảnh chụp để xem bằng mắt khi kiểm tra: lưu ở thư mục tạm, không ghi vào repo.
const checkShots = path.join(os.tmpdir(), 'eyerim-check-shots');

(async () => {
  const { version } = build();
  fs.mkdirSync(checkShots, { recursive: true });
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
      await page.screenshot({ path: path.join(checkShots, `${filename}-menu.png`) });
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
      await page.screenshot({ path: path.join(checkShots, `${filename}-fight.png`) });
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
      await page.screenshot({ path: path.join(checkShots, `brand-${size.width}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const titan of ['vanguard', 'tempest', 'bastion', 'bulwark']) {
      await page.goto(`${base}/dist/titans/${titan}.html`);
      await page.waitForFunction(() => document.querySelectorAll('#clips button').length === 12);
      await page.locator('#clips button').nth(2).click();
      assert.equal(await page.locator('#clips button').nth(2).getAttribute('aria-pressed'), 'true');
      assert(!/striker|eureka|gipsy|coyote|cherno/i.test(await page.locator('body').innerText()), 'gallery chỉ dùng tên Titan của game');
      assert.equal(await page.locator('details, .reference').count(), 0, 'gallery không có ảnh tham chiếu ngoài');
      assert(await page.locator('#height-frame').isChecked(), 'khung chuẩn H bật mặc định');
      await page.locator('#clips button[data-clip="idle"]').click();
      await page.locator('#timeline').fill('0');
      await page.locator('#hero').screenshot({ path: path.join(checkShots, `${titan}-height-frame.png`) });
      await page.locator('#height-frame').uncheck();
      assert(!(await page.locator('#height-frame').isChecked()), 'tắt được khung đo để xem tạo hình');
      if (['vanguard', 'tempest', 'bastion', 'bulwark'].includes(titan)) {
        await page.locator('[data-clip="walk"]').click();
        for (const direction of [1, -1]) {
          if (direction === -1) await page.locator('#flip').click();
          for (const time of [0, .24, .48, .72, .96, 1.2, 1.44]) {
            await page.locator('#timeline').fill(String(time));
            await page.locator('#hero').screenshot({ path: path.join(checkShots, `${titan}-walk-${time}-${direction}.png`) });
          }
        }
        await page.locator('#flip').click();
        await page.locator('[data-clip="idle"]').click();
        await page.locator('#timeline').fill('0');
      }
      if (['bastion', 'bulwark'].includes(titan)) {
        assert((await page.locator('header').innerText()).includes('Dòng Eye1'), 'hiển thị dòng Eye1 trong thông số');
        assert.equal(await page.locator('[data-clip="jab"]').innerText(), 'F · Đấm phải');
        assert.equal(await page.locator('[data-clip="hook"]').innerText(), 'J · Đấm trái');
      }
      if (titan === 'bulwark') {
        await page.locator('[data-clip="idle"]').click();
        for (const time of [.79, 2.36]) {
          await page.locator('#timeline').fill(String(time));
          await page.locator('#hero').screenshot({ path: path.join(checkShots, `bulwark-idle-breathe-${time}.png`) });
        }
        await page.locator('[data-clip="special"]').click();
        assert.equal(await page.locator('#pose-name').innerText(), 'I · Đấm điện lao chéo');
        for (const direction of [1, -1]) {
          if (direction === -1) await page.locator('#flip').click();
          for (const time of [.2, .55, .86, 1.07, 1.24, 1.7, 1.94, 2.5]) {
            await page.locator('#timeline').fill(String(time));
            await page.locator('#hero').screenshot({ path: path.join(checkShots, `bulwark-diagonal-${time}-${direction}.png`) });
          }
        }
        await page.locator('#flip').click();
        await page.locator('[data-clip="guard"]').click();
        await page.locator('#timeline').fill('0');
        for (const direction of [1, -1]) {
          if (direction === -1) await page.locator('#flip').click();
          const layers = await page.locator('#hero').evaluate(el => {
            const ctx = el.getContext('2d'), original = ctx.moveTo, order = [];
            ctx.moveTo = function(x, y) {
              if (x === -36 && y === -24) order.push('shoulder');
              if (x === 48 && y === -28) order.push('forearm');
              return original.call(this, x, y);
            };
            try { window.TitanGallery.draw(el, 'bulwark', 'guard', 0, 1); }
            finally { ctx.moveTo = original; }
            return order.filter((_, i) => i % 2 === 0);
          });
          // Tay xa 1 lượt + tay gần 2 lượt (viền tương phản rồi giáp sáng): mỗi lượt vai trước, cẳng tay sau.
          assert(layers.length >= 4 && layers.length % 2 === 0, 'đỡ đòn: đủ lượt vẽ hai tay');
          assert(layers.every((l, i) => l === (i % 2 ? 'forearm' : 'shoulder')), 'đỡ đòn: cẳng tay nằm trước giáp vai');
          // Vẽ lại đúng hướng đang chọn qua điều khiển thật.
          await page.locator('#timeline').fill('0.01');
          await page.locator('#hero').screenshot({ path: path.join(checkShots, `bulwark-guard-layer-${direction}.png`) });
        }
        await page.locator('#flip').click();
        const arms = await page.evaluate(() => {
          const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 780;
          const ctx = canvas.getContext('2d'), original = ctx.moveTo;
          let angles = [];
          ctx.moveTo = function(x, y) {
            if (x === 9 && y === -29) {
              const m = this.getTransform(); angles.push(Math.atan2(m.b, m.a));
            }
            return original.call(this, x, y);
          };
          const result = [];
          for (const direction of [1, -1]) {
            const sample = (clip, time) => {
              angles = []; window.TitanGallery.draw(canvas, 'bulwark', clip, time, direction);
              // Mỗi tấm giáp vẽ cùng path hai lần: tô/viền rồi clip vết xước.
              return angles.filter((_, i) => i % 2 === 0);
            };
            result.push({ rest: sample('jab', .6), f: sample('jab', .07), j: sample('hook', .1) });
          }
          return result;
        });
        for (const { rest, f, j } of arms) {
          // Tay xa 1 lượt + tay gần 2 lượt (viền tương phản, giáp sáng) trùng khít góc.
          assert.equal(rest.length, 3, 'đo hai tay thật trên Canvas');
          for (const pose of [rest, f, j]) assert(Math.abs(pose[1] - pose[2]) < 1e-12, 'viền tương phản bám đúng tay phải');
          assert(Math.abs(f[0] - rest[0]) < 1e-9 && Math.abs(f[1] - rest[1]) > 1, 'F chỉ đánh tay phải/gần');
          assert(Math.abs(j[1] - rest[1]) < 1e-9 && Math.abs(j[0] - rest[0]) > 1, 'J chỉ đánh tay trái/xa');
        }
        for (const direction of [1, -1]) {
          if (direction === -1) await page.locator('#flip').click();
          for (const [clip, time] of [['jab', .07], ['hook', .1]]) {
            await page.locator(`[data-clip="${clip}"]`).click();
            await page.locator('#timeline').fill(String(time));
            await page.locator('#hero').screenshot({ path: path.join(checkShots, `bulwark-eye1-${clip}-${direction}.png`) });
          }
        }
        await page.locator('#flip').click();
        await page.locator('[data-clip="cannon"]').click();
        assert.equal(await page.locator('#pose-name').innerText(), 'L · Phun lửa hai mắt');
        for (const direction of [1, -1]) {
          if (direction === -1) await page.locator('#flip').click();
          for (const time of [.3, 1.05, 1.45, 1.9, 2.15, 2.5]) {
            await page.locator('#timeline').fill(String(time));
            if (time === .3 || time === 1.05) {
              const pixels = await page.locator('#hero').evaluate((el, direction) => {
                const ctx = el.getContext('2d');
                const s = Math.min(el.width / 760, el.height / 540) * window.EyeRimBulwark.scale;
                return [[-79, -490], [84, -492]].map(([x, y]) => {
                  const px = Math.round(el.width * .46 + direction * x * s);
                  const py = Math.round(el.height * .9 + (y - 8) * s);
                  return Array.from(ctx.getImageData(px, py, 1, 1).data);
                });
              }, direction);
              for (const [r, g, b] of pixels) {
                assert(r > g && r > b, 'hai mắt tụ màu nóng');
                if (time === 1.05) assert(g > 170, 'hai mắt chuyển vàng trước khi phun');
              }
            }
            await page.locator('#hero').screenshot({ path: path.join(checkShots, `bulwark-fire-${time}-${direction}.png`) });
          }
        }
        await page.locator('#flip').click();
        await page.locator('[data-clip="idle"]').click();
        await page.locator('#timeline').fill('0');
      }
      if (titan === 'tempest') {
        await page.locator('#clips button[data-clip="cannon"]').click();
        for (const direction of [1, -1]) {
          for (const time of [.2, .8, 1.9]) {
            await page.locator('#timeline').evaluate((el, time) => {
              el.value = String(time); el.dispatchEvent(new Event('input', { bubbles: true }));
            }, time);
            const visible = await page.locator('#hero').evaluate((el, { direction, time }) => {
              const scale = Math.min(el.width / 760, el.height / 540) * window.TitanGallery.specs.tempest.scale;
              const ctx = el.getContext('2d');
              let visible = 0;
              for (let row = 0; row < 2; row++) {
                for (let col = 0; col < 3; col++) {
                  const x = Math.round(el.width * .46 + direction * (-16 + col * 21) * scale);
                  const y = Math.round(el.height * .9 + (-342 + row * 24 + Math.sin(time * 2) * 2.5) * scale);
                  const { data } = ctx.getImageData(x - 2, y - 2, 5, 5);
                  let gold = 0;
                  for (let i = 0; i < data.length; i += 4) {
                    if (data[i] > 230 && data[i + 1] > 165 && data[i + 1] < 230 && data[i + 2] < 150) gold++;
                  }
                  if (gold >= 3) visible++;
                }
              }
              return visible;
            }, { direction, time });
            assert.equal(visible, 6, `Tempest L/${time}/${direction}: thấy đủ sáu đầu đạn, tay/vai không che ngực`);
          }
          await page.locator('#hero').screenshot({ path: path.join(checkShots, `tempest-launcher-clear-${direction}.png`) });
          await page.locator('#flip').click();
        }
      }
      if (titan === 'bastion') {
        await page.locator('#clips button[data-clip="idle"]').click();
        await page.locator('#play').click();
        await page.screenshot({ path: path.join(checkShots, 'bastion-gallery.png'), fullPage: true });
        await page.locator('#hero').screenshot({ path: path.join(checkShots, 'bastion-idle.png') });
        for (const clip of ['walk', 'guard', 'dash', 'jab', 'hook', 'blade', 'cannon', 'special', 'ultimate', 'celebrate', 'stagger']) {
          await page.locator(`#clips button[data-clip="${clip}"]`).click();
          await page.locator('#timeline').evaluate(el => { el.value = '1.08'; el.dispatchEvent(new Event('input', { bubbles: true })); });
          assert.equal(await page.locator('#time-value').innerText(), '1.08 s');
        }
        await page.locator('#clips button[data-clip="blade"]').click();
        assert.equal(await page.locator('#pose-name').innerText(), 'K · Búa móc lên');
        for (const direction of [1, -1]) {
          const phases = [], stanceFrames = [], chestFrames = [];
          for (const time of [.12, .3, .42, .52, 1.2]) {
            await page.locator('#timeline').evaluate((el, time) => {
              el.value = String(time); el.dispatchEvent(new Event('input', { bubbles: true }));
            }, time);
            phases.push(await page.locator('#hero').evaluate(el => el.toDataURL()));
            const visorPixels = await page.locator('#hero').evaluate(el => {
              const { data } = el.getContext('2d').getImageData(0, 0, el.width, el.height);
              let count = 0;
              for (let i = 0; i < data.length; i += 4) {
                if (data[i] < 120 && data[i + 1] > 140 && data[i + 2] > 180) count++;
              }
              return count;
            });
            assert(visorPixels > 100, 'K phải thấy kính xanh trên mặt, vai không được che đầu');
            chestFrames.push(await page.locator('#hero').evaluate((el, direction) => {
              const spec = window.TitanGallery.specs.bastion;
              const scale = Math.min(el.width / 760, el.height / 540) * spec.scale;
              // Vùng giáp ngực ngay dưới gốc vai trái phải không đổi khi tay xoay.
              const x = Math.round(el.width * .46 + direction * 40 * scale);
              const y = Math.round(el.height * .9 - (spec.sole + 420) * scale);
              const { data } = el.getContext('2d').getImageData(x - 5, y, 10, 20);
              const mean = [0, 0, 0];
              for (let i = 0; i < data.length; i += 4) {
                for (let channel = 0; channel < 3; channel++) mean[channel] += data[i + channel] / (data.length / 4);
              }
              return mean;
            }, direction));
            stanceFrames.push(await page.locator('#hero').evaluate(el => {
              // So vị trí chân, không so nhiễu khử răng cưa GPU khi đọc canvas nhiều lần.
              const { data } = el.getContext('2d').getImageData(0, 640, el.width, 90);
              let left = el.width, right = -1, top = 90, bottom = -1;
              for (let i = 0; i < data.length; i += 4) {
                if (data[i] > 100 || data[i + 1] > 120 || data[i + 2] > 120) continue;
                const x = (i / 4) % el.width, y = Math.floor(i / 4 / el.width);
                left = Math.min(left, x); right = Math.max(right, x);
                top = Math.min(top, y); bottom = Math.max(bottom, y);
              }
              if (right < left) throw new Error('Không tìm thấy chân Titan trong vùng kiểm tra');
              return JSON.stringify([left, right, top, bottom]);
            }));
            if (time === .52) await page.locator('#hero').screenshot({ path: path.join(checkShots, `bastion-hammer-${direction}.png`) });
          }
          assert.equal(new Set(phases).size, 5, 'K có các pha mở giáp, hạ búa, móc lên và thu tay');
          assert.equal(new Set(stanceFrames).size, 1, 'K giữ Titan đứng im, chân không trượt/nhún');
          for (const frame of chestFrames) {
            assert(frame.every((value, channel) => Math.abs(value - chestFrames[0][channel]) < 2),
              'K không vẽ gốc vai/cánh tay trái đè lên giáp ngực');
          }
          await page.locator('#flip').click();
        }
        await page.locator('#clips button[data-clip="cannon"]').click();
        assert.equal(await page.locator('#pose-name').innerText(), 'L · Tên lửa kép');
        const missileFrames = [];
        for (const time of [.9, 1.08, 1.25, 1.8]) {
          await page.locator('#timeline').evaluate((el, time) => {
            el.value = String(time); el.dispatchEvent(new Event('input', { bubbles: true }));
          }, time);
          assert.equal(await page.evaluate(time => window.TitanGallery.missileVolley(time).length, time),
            time >= 1.02 && time < 1.74 ? 2 : 0, 'L chỉ phóng hai quả trong một loạt');
          missileFrames.push(await page.locator('#hero').evaluate(el => el.toDataURL()));
        }
        assert.equal(new Set(missileFrames).size, 4, 'L chuyển từ nâng pháo sang phóng và tên lửa bay đi');
        await page.locator('#timeline').evaluate(el => { el.value = '1.08'; el.dispatchEvent(new Event('input', { bubbles: true })); });
        await page.locator('#hero').screenshot({ path: path.join(checkShots, 'bastion-cannon.png') });
        const before = await page.locator('#hero').evaluate(el => el.toDataURL());
        await page.locator('#flip').click();
        assert.notEqual(await page.locator('#hero').evaluate(el => el.toDataURL()), before, 'đổi hướng thay hình thật');
        await page.locator('#clips button[data-clip="special"]').click();
        assert.equal(await page.locator('#pose-name').innerText(), 'I · Búa phản lực');
        for (const direction of [-1, 1]) {
          const frames = [];
          for (const [phase, time] of [['boost', .55], ['air', .78], ['slam', 1.08], ['recover', 1.5]]) {
            await page.locator('#timeline').evaluate((el, time) => {
              el.value = String(time); el.dispatchEvent(new Event('input', { bubbles: true }));
            }, time);
            frames.push(await page.locator('#hero').evaluate(el => el.toDataURL()));
            await page.locator('#hero').screenshot({ path: path.join(checkShots, `bastion-jet-${phase}-${direction}.png`) });
          }
          assert.equal(new Set(frames).size, 4, 'I bật ba lô, bay, đập búa rồi hồi phục');
          await page.locator('#flip').click();
        }
        // Ăn mừng: tay phải (gần) vung ra sau → phải vẽ SAU khẩu pháo gần, không bị pháo che.
        const celebrateLayers = await page.evaluate(() => {
          const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 780;
          const ctx = canvas.getContext('2d'), original = ctx.moveTo, order = [];
          ctx.moveTo = function(x, y) {
            if (x === -20 && y === -18) order.push('cannon');
            if (x === 8 && y === -24) order.push('arm');
            return original.call(this, x, y);
          };
          window.TitanGallery.draw(canvas, 'bastion', 'celebrate', 1.7, 1);
          return order;
        });
        assert(celebrateLayers.lastIndexOf('arm') > celebrateLayers.lastIndexOf('cannon'), 'ăn mừng: tay phải nằm trước khẩu pháo gần');
        await page.locator('#clips button[data-clip="celebrate"]').click();
        for (const direction of [-1, 1]) {
          const frames = [];
          for (const [phase, time] of [['crouch', .3], ['jump', .55], ['spin', .725], ['land', 1.1], ['pose', 1.7]]) {
            await page.locator('#timeline').evaluate((el, time) => {
              el.value = String(time); el.dispatchEvent(new Event('input', { bubbles: true }));
            }, time);
            frames.push(await page.locator('#hero').evaluate(el => el.toDataURL()));
            assert(await page.locator('#hero').evaluate(el => {
              const { data } = el.getContext('2d').getImageData(0, 0, el.width, 4);
              for (let i = 0; i < data.length; i += 4) {
                if (data[i] < 180 && data[i + 1] < 180 && data[i + 2] < 180) return false;
              }
              return true;
            }), 'ăn mừng không cắt đầu/pháo ở cạnh trên canvas');
            await page.locator('#hero').screenshot({ path: path.join(checkShots, `bastion-celebrate-${phase}-${direction}.png`) });
          }
          assert.equal(new Set(frames).size, 5, 'ăn mừng có lấy đà, nhảy, xoay, đáp đất và dang tay');
          await page.locator('#flip').click();
        }
        await page.setViewportSize({ width: 390, height: 844 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Bastion không tràn ngang trên điện thoại');
        await page.screenshot({ path: path.join(checkShots, 'bastion-mobile.png'), fullPage: true });
        await page.setViewportSize({ width: 1440, height: 900 });
      }
      if (titan === 'bulwark') {
        // Đo ngay tọa độ bộ vẽ thật, không chỉ so metadata scale tự khai báo.
        for (const facing of [1, -1]) {
          const landmarks = await page.evaluate(facing => {
            const result = {};
            for (const id of ['vanguard', 'bastion', 'bulwark']) {
              const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 780;
              const ctx = canvas.getContext('2d'), ground = canvas.height * .9;
              const move = ctx.moveTo.bind(ctx), oval = ctx.ellipse.bind(ctx);
              ctx.moveTo = (x, y) => {
                const crown = id === 'vanguard' && x === -23 && y === -361 ? -396
                  : id === 'bastion' && x === 1 && y === -480 ? -540 : null;
                if (crown !== null) result[id] = ground - ctx.getTransform().transformPoint({ x: 0, y: crown }).y;
                move(x, y);
              };
              ctx.ellipse = (x, y, rx, ry, ...args) => {
                if (id === 'bulwark' && x === 0 && y === 0 && rx === 26 && ry === 29) {
                  const m = ctx.getTransform(), center = m.transformPoint({ x, y });
                  result[id] = Math.max(result[id] || 0, ground - center.y + Math.hypot(m.b * rx, m.d * ry));
                }
                oval(x, y, rx, ry, ...args);
              };
              window.TitanGallery.draw(canvas, id, 'idle', 0, facing, 1);
            }
            return { ...result, H: window.TitanGallery.drawingHeight * Math.min(1200 / 760, 780 / 540) };
          }, facing);
          for (const id of ['vanguard', 'bastion', 'bulwark']) {
            assert(Math.abs(landmarks[id] - landmarks.H) < .001, `${id}: mốc thật trên Canvas phải bằng H (${facing})`);
          }
        }
        await page.evaluate(() => {
          const row = document.createElement('div'); row.id = 'height-comparison';
          row.style = 'display:flex;background:#efe3cc;color:#3d2141';
          for (const id of ['vanguard', 'bastion', 'bulwark']) {
            const cell = document.createElement('div'); cell.style = 'width:33.333%';
            const label = document.createElement('h3'); label.textContent = id;
            const canvas = document.createElement('canvas'); canvas.width = 760; canvas.height = 780; canvas.style = 'width:100%';
            cell.append(label, canvas); row.append(cell);
            window.TitanGallery.draw(canvas, id, 'idle', 0, 1, 1);
            const ctx = canvas.getContext('2d'), ground = canvas.height * .9;
            ctx.strokeStyle = '#b9513c'; ctx.lineWidth = 1;
            for (const y of [ground, ground - window.TitanGallery.drawingHeight]) {
              ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
            }
          }
          document.body.prepend(row);
        });
        await page.locator('#height-comparison').screenshot({ path: path.join(checkShots, 'titan-height-comparison.png') });
        await page.locator('#height-comparison').evaluate(el => el.remove());
        for (const clip of ['idle', 'walk', 'guard', 'dash', 'jab', 'hook', 'blade', 'cannon', 'special', 'ultimate', 'celebrate']) {
          await page.locator(`#clips button[data-clip="${clip}"]`).click();
          await page.locator('#timeline').evaluate(el => { el.value = '0.55'; el.dispatchEvent(new Event('input', { bubbles: true })); });
          assert.equal(await page.locator('#time-value').innerText(), '0.55 s');
        }
        await page.locator('#clips button[data-clip="idle"]').click();
        await page.locator('#timeline').fill('0');
        await page.screenshot({ path: path.join(checkShots, 'bulwark-gallery.png'), fullPage: true });
        await page.locator('#hero').screenshot({ path: path.join(checkShots, 'bulwark-idle.png') });
        await page.locator('#clips button[data-clip="blade"]').click();
        for (const direction of [1, -1]) {
          for (const time of [.12, .25, .44, .6, .72, 1.2, 1.6]) {
            await page.locator('#timeline').evaluate((el, time) => {
              el.value = String(time); el.dispatchEvent(new Event('input', { bubbles: true }));
            }, time);
            assert.equal(await page.locator('#pose-name').innerText(), 'K · Móc thủy lực');
            await page.locator('#hero').screenshot({ path: path.join(checkShots, `bulwark-uppercut-${time}-${direction}.png`) });
          }
          await page.locator('#flip').click();
        }
        await page.locator('#clips button[data-clip="celebrate"]').click();
        for (const direction of [1, -1]) {
          for (const time of [.3, .55, .725, 1.1, 1.6]) {
            await page.locator('#timeline').evaluate((el, time) => {
              el.value = String(time); el.dispatchEvent(new Event('input', { bubbles: true }));
            }, time);
            await page.locator('#hero').screenshot({ path: path.join(checkShots, `bulwark-celebrate-${time}-${direction}.png`) });
          }
          await page.locator('#flip').click();
        }
        await page.setViewportSize({ width: 390, height: 844 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Bulwark không tràn ngang trên điện thoại');
        await page.screenshot({ path: path.join(checkShots, 'bulwark-mobile.png'), fullPage: true });
        await page.setViewportSize({ width: 1440, height: 900 });
      }
      await page.locator('#clips button[data-clip="stagger"]').click();
      for (const direction of [1, -1]) {
        const brightness = [];
        for (const [phase, time] of [['recoil', 0], ['flash', .2], ['hold', .4]]) {
          await page.locator('#timeline').evaluate((el, time) => {
            el.value = String(time); el.dispatchEvent(new Event('input', { bubbles: true }));
          }, time);
          brightness.push(await page.locator('#hero').evaluate(el => {
            const { data } = el.getContext('2d').getImageData(0, 0, el.width, el.height);
            let total = 0;
            for (let i = 0; i < data.length; i += 4) total += data[i] + data[i + 1] + data[i + 2];
            return total / (data.length / 4);
          }));
          await page.locator('#hero').screenshot({ path: path.join(checkShots, `${titan}-stagger-${phase}-${direction}.png`) });
        }
        assert(brightness[1] > brightness[0] + 1 && brightness[1] > brightness[2] + 1,
          `${titan}: trúng đòn lóe giáp trắng cùng nhịp template`);
        await page.locator('#flip').click();
      }
      console.log(`ok - gallery ${titan}: đủ 12 động tác, trúng đòn/lóe trắng hai hướng, không tải tài nguyên ngoài`);
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
    console.log(`Ảnh kiểm tra (thư mục tạm, không nằm trong repo): ${checkShots}`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
