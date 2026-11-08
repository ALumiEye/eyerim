// Đưa bản thiết kế của một Titan từ xưởng (titans/<id>.js) vào game (src/titans/<id>.js).
//   npm run promote             — liệt kê bộ vẽ nào ở xưởng đang khác bản game
//   npm run promote <id>        — chép titans/<id>.js → src/titans/<id>.js, tăng ?v= trong index.html, chạy npm test;
//                                 test hỏng thì tự hoàn tác (game giữ nguyên bản cũ)
// titans/ chỉ là chỗ thiết kế: sửa ở đó KHÔNG ảnh hưởng game cho tới khi chạy lệnh này.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const designDir = path.join(root, 'titans');
const gameDir = path.join(root, 'src', 'titans');
const indexFile = path.join(root, 'index.html');
const read = file => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);

const drafts = fs.readdirSync(designDir)
  .filter(f => f.endsWith('.js') && f !== 'gallery.js' && !f.endsWith('-controls.js'))
  .map(f => f.slice(0, -3)).sort();

function status(id) {
  const game = read(path.join(gameDir, `${id}.js`));
  if (game == null) return 'chưa có trong game';
  return game === read(path.join(designDir, `${id}.js`)) ? 'giống bản game' : 'KHÁC bản game (chưa promote)';
}

const id = process.argv[2];
if (!id) {
  console.log('Bộ vẽ ở xưởng titans/ so với game src/titans/:');
  for (const d of drafts) console.log(`  ${d.padEnd(10)} ${status(d)}`);
  console.log('\nĐưa vào game: npm run promote <id>');
  process.exit(0);
}
if (!drafts.includes(id)) {
  console.error(`Không có bản thiết kế titans/${id}.js. Có: ${drafts.join(', ')}`);
  process.exit(1);
}

const draftFile = path.join(designDir, `${id}.js`);
const gameFile = path.join(gameDir, `${id}.js`);
const draft = read(draftFile);
const oldGame = read(gameFile);
if (oldGame === draft) {
  console.log(`${id}: bản game đã giống bản thiết kế, không có gì để đưa vào.`);
  process.exit(0);
}

const oldIndex = read(indexFile);
const tag = new RegExp(`(<script src="src/titans/${id}\\.js\\?v=)(\\d+)("></script>)`);
const match = oldIndex.match(tag);
if (!match) {
  // Titan mới: game còn cần thẻ <script> trong index.html và mục trong TITANS (src/game.js) — làm bằng tay.
  console.error(`index.html chưa nạp src/titans/${id}.js. Titan mới cần thêm thẻ <script src="src/titans/${id}.js?v=1"></script>`
    + ' sau các bộ vẽ khác và mục trong TITANS (src/game.js) trước khi promote.');
  process.exit(1);
}
const newIndex = oldIndex.replace(tag, (_, a, v, b) => `${a}${Number(v) + 1}${b}`);

fs.mkdirSync(gameDir, { recursive: true });
fs.writeFileSync(gameFile, draft);
fs.writeFileSync(indexFile, newIndex);
console.log(`Đã chép titans/${id}.js → src/titans/${id}.js, index.html ?v=${match[2]} → ${Number(match[2]) + 1}. Đang chạy npm test…`);

const test = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test'], { cwd: root, stdio: 'inherit' });
if (test.status !== 0) {
  if (oldGame == null) fs.rmSync(gameFile); else fs.writeFileSync(gameFile, oldGame);
  fs.writeFileSync(indexFile, oldIndex);
  console.error(`\nTest hỏng → đã hoàn tác, game giữ nguyên bản ${id} cũ. Sửa bản thiết kế titans/${id}.js rồi promote lại.`);
  process.exit(1);
}
console.log(`\n${id}: đã đưa bản thiết kế vào game. Chạy npm run build để cập nhật bản offline.`);
