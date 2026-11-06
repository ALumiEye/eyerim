// Một lệnh build cho hai kênh phát hành:
//   dist/            — website tĩnh cho GitHub Pages
//   dist/eyerim.html — một file HTML nhúng đủ CSS/JS/ảnh/nhạc cho GitHub Releases (cũng có trên Pages)
// Phiên bản hiển thị lấy từ biến môi trường GAME_VERSION (workflow đặt), mặc định "bản dev".
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const VERSION_SLOT = '<span id="game-version">BẢN NGUỒN</span>';

function replaceOnce(source, marker, replacement) {
  const count = typeof marker === 'string' ? source.split(marker).length - 1 : (source.match(new RegExp(marker.source, 'g')) || []).length;
  if (count !== 1) throw new Error(`Không tìm thấy đúng một vị trí để đóng gói: ${marker}`);
  // Hàm thay thế giữ nguyên các ký tự $ trong mã nguồn.
  return source.replace(marker, () => replacement);
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function build(outputRoot = ROOT, version = process.env.GAME_VERSION || 'bản dev') {
  // Đọc đủ đầu vào trước khi ghi; thiếu MP3 thì build phải báo lỗi, không âm thầm bỏ nhạc.
  const source = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');
  // Bộ vẽ Bastion dùng chung giữa trang xưởng và trận đấu: bản offline nhúng ngay sau game.js.
  const bastionJs = fs.readFileSync(path.join(ROOT, 'titans/bastion.js'), 'utf8');
  const track = fs.readFileSync(path.join(ROOT, 'music/theme.mp3'));
  if (!track.length) throw new Error('music/theme.mp3 đang rỗng.');

  const html = replaceOnce(source, VERSION_SLOT, `<span id="game-version">${escapeHtml(version)}</span>`);
  const assets = ['alumieye.png', 'lumi.png', 'favicon.png'];
  const images = new Map(assets.map(name => [name, fs.readFileSync(path.join(ROOT, 'assets', name))]));
  let embeddedHtml = html;
  for (const [name, data] of images) {
    embeddedHtml = replaceOnce(embeddedHtml, `"assets/${name}"`, `"data:image/png;base64,${data.toString('base64')}"`);
  }
  const embeddedJs = replaceOnce(js, "'music/theme.mp3'", JSON.stringify(`data:audio/mpeg;base64,${track.toString('base64')}`));
  const inlineJs = `${embeddedJs}\n;\n${bastionJs}`;
  const standalone = replaceOnce(
    replaceOnce(
      replaceOnce(embeddedHtml, /\n {2}<link rel="stylesheet" href="style\.css(?:\?v=\d+)?">/, ''),
      /\n {2}<script src="titans\/bastion\.js(?:\?v=\d+)?"><\/script>/, ''),
    /<script src="src\/game\.js(?:\?v=\d+)?"><\/script>/,
    `<script>\n${inlineJs.replace(/<\/script/gi, '<\\/script')}\n  </script>`
  );
  const releaseHtml = replaceOnce(standalone, '</head>', `  <style>\n${css}\n  </style>\n</head>`);

  const pages = path.join(outputRoot, 'dist');
  fs.rmSync(pages, { recursive: true, force: true });
  for (const dir of ['music', 'src', 'assets']) fs.mkdirSync(path.join(pages, dir), { recursive: true });
  for (const [name, data] of images) fs.writeFileSync(path.join(pages, 'assets', name), data);
  fs.writeFileSync(path.join(pages, 'index.html'), html);
  fs.writeFileSync(path.join(pages, 'style.css'), css);
  fs.writeFileSync(path.join(pages, 'src/game.js'), js);
  fs.writeFileSync(path.join(pages, 'music/theme.mp3'), track);
  fs.cpSync(path.join(ROOT, 'titans'), path.join(pages, 'titans'), { recursive: true });
  fs.writeFileSync(path.join(pages, '.nojekyll'), '');
  const releaseFile = path.join(pages, 'eyerim.html');
  fs.writeFileSync(releaseFile, releaseHtml);
  return { pages, releaseFile, version };
}

if (require.main === module) {
  const { pages, releaseFile, version } = build();
  console.log(`Pages: ${pages}`);
  console.log(`Release: ${releaseFile} (${(fs.statSync(releaseFile).size / 1024 / 1024).toFixed(1)} MiB, đã nhúng MP3) — phiên bản ${version}`);
}

module.exports = { build };
