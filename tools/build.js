// Hai bản phát hành: thư mục tĩnh cho Pages và HTML độc lập có nhạc cho Releases.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function replaceOnce(source, marker, replacement) {
  if (source.split(marker).length !== 2) {
    throw new Error(`Không tìm thấy đúng một vị trí để đóng gói: ${marker}`);
  }
  // Hàm thay thế giữ nguyên các ký tự $ trong mã nguồn.
  return source.replace(marker, () => replacement);
}

function build(outputRoot = ROOT) {
  // Đọc đủ đầu vào trước khi ghi; thiếu MP3 thì build phải báo lỗi, không âm thầm bỏ nhạc.
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');
  const track = fs.readFileSync(path.join(ROOT, 'music/theme.mp3'));
  if (!track.length) throw new Error('music/theme.mp3 đang rỗng.');

  const assets = ['alumieye.png', 'lumi.png', 'favicon.png'];
  const images = new Map(assets.map(name => [name, fs.readFileSync(path.join(ROOT, 'assets', name))]));
  let embeddedHtml = html;
  for (const [name, data] of images) {
    embeddedHtml = replaceOnce(embeddedHtml, `"assets/${name}"`, `"data:image/png;base64,${data.toString('base64')}"`);
  }
  const embeddedJs = replaceOnce(js, "'music/theme.mp3'", JSON.stringify(`data:audio/mpeg;base64,${track.toString('base64')}`));
  const standalone = replaceOnce(
    replaceOnce(embeddedHtml, '  <link rel="stylesheet" href="style.css?v=8">', ''),
    '  <script src="src/game.js?v=22"></script>',
    `  <script>\n${embeddedJs.replace(/<\/script/gi, '<\\/script')}\n  </script>`
  );
  const releaseHtml = replaceOnce(standalone, '</head>', `  <style>\n${css}\n  </style>\n</head>`);

  const pages = path.join(outputRoot, 'dist');
  const releases = path.join(outputRoot, 'release');
  fs.mkdirSync(path.join(pages, 'music'), { recursive: true });
  fs.mkdirSync(path.join(pages, 'src'), { recursive: true });
  fs.mkdirSync(path.join(pages, 'assets'), { recursive: true });
  for (const [name, data] of images) fs.writeFileSync(path.join(pages, 'assets', name), data);
  fs.mkdirSync(releases, { recursive: true });
  fs.writeFileSync(path.join(pages, 'index.html'), html);
  fs.writeFileSync(path.join(pages, 'style.css'), css);
  fs.writeFileSync(path.join(pages, 'src/game.js'), js);
  fs.writeFileSync(path.join(pages, 'music/theme.mp3'), track);
  fs.cpSync(path.join(ROOT, 'titans'), path.join(pages, 'titans'), { recursive: true });
  fs.writeFileSync(path.join(pages, '.nojekyll'), '');
  const releaseFile = path.join(releases, 'eyerim.html');
  fs.writeFileSync(releaseFile, releaseHtml);
  return { pages, releaseFile };
}

if (require.main === module) {
  const { pages, releaseFile } = build();
  console.log(`Pages: ${pages}`);
  console.log(`Release: ${releaseFile} (${(fs.statSync(releaseFile).size / 1024 / 1024).toFixed(1)} MiB, đã nhúng MP3)`);
}

module.exports = { build };
