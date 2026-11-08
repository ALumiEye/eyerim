# eyerim — TIDEBREAKER

Game hành động 2D chạy trên trình duyệt thuộc hệ dự án alumieye. Hai phi công cùng điều khiển một Titan-Frame cao gần 80 m để chặn quái vật Abyssal trước khi chúng san phẳng thành phố ven biển.

> Năm 2049, các khe nứt dưới đáy Thái Bình Dương thả ra quái vật Abyssal. Hãy giữ vững bờ biển.

| | |
|---|---|
| **Chơi ngay trên trình duyệt** | https://alumieye.github.io/eyerim/ |
| **Tải game (chơi offline, 1 file)** | https://github.com/ALumiEye/eyerim/releases/latest/download/eyerim.html |
| Các bản phát hành | https://github.com/ALumiEye/eyerim/releases |

## Chơi

- **Trên trình duyệt:** https://alumieye.github.io/eyerim/
- **Offline, không cần cài:** [tải `eyerim.html`](https://github.com/ALumiEye/eyerim/releases/latest/download/eyerim.html) (bản phát hành mới nhất) rồi bấm đúp để mở. Cả game và nhạc nằm trong một file.
- **Từ mã nguồn:** mở `index.html` bằng trình duyệt. Không cần server hay thư viện ngoài để chơi.

Phiên bản đang chạy hiện ở cạnh dưới khung màn hình (tag Release, hoặc `main · <commit>` trên Pages).

## Chọn Titan

Trước trận là màn chọn kiểu gallery: một Titan lớn ở giữa, `◀ ▶` hoặc `A`/`D` để đổi Titan, phím `1`–`4` nhảy thẳng tới Titan. Bên phải có đủ chỉ số, máu, tốc độ, chiều cao, khối lượng, cốt truyện và vũ khí; dải nhỏ phía dưới cho biết còn những Titan nào. `Enter` xuất kích, `Esc` quay lại.

## Chế độ chơi

Menu chính: `W`/`S` (hoặc `↑`/`↓`, phím `1`–`5`) để chọn, `Enter` để bắt đầu, `H` xem hướng dẫn.

| Chế độ | Cách chơi |
|---|---|
| **Chiến dịch** | 3 đợt quái mạnh dần, có xưởng nâng cấp (tối đa cấp 3) giữa các đợt. Thua đợt nào thì chơi lại đợt đó. |
| **Đua thời gian** | Hạ liền 3 quái bằng Titan gốc, không nâng cấp. Đồng hồ chỉ dừng ở màn tổng kết mỗi đợt. Thua là chạy lại từ đầu; lưu thời gian tốt nhất. |
| **Đấu tự do** | Chọn 1 quái vật và độ khó (Dễ · Thường · Khó · Ác mộng: đổi máu, sát thương và độ hung hãn của quái). Mỗi tổ hợp quái × độ khó đã thắng được đánh dấu. |

Kỷ lục lưu trong `localStorage` của trình duyệt.

**Huấn luyện phi công** (mục 04): xem Titan diễn từng chiêu (đứng im, di chuyển, lướt né, đỡ, đấm trái/phải, vũ khí K, vũ khí L, chiêu I, chiêu đặc biệt, ăn mừng). Kèm bảng chỉ số lấy thẳng từ số liệu chiến đấu: sát thương, tầm, năng lượng, đẩy lùi, thời gian gồng / ra đòn / hồi. Không có quái để đánh. `W`/`S` hoặc `1`–`0` chọn chiêu (phím số chọn nhanh 10 mục đầu), `A`/`D` đổi Titan, `Space` dừng/phát, `R` lật hướng, `Esc` về menu. Ở mục chiêu đặc biệt (`F+J`), nút **▶ Xem với quái thật** (hoặc phím `X`) mở cảnh toàn màn hình với thành phố, bờ biển và một con quái thật: Titan tung chiêu bằng đúng logic trận đấu, hiện sát thương thật rồi tự phát lại; `A`/`D` đổi Titan, `Enter` phát lại, `Esc` quay lại mục đó. Màn Huấn luyện dùng đúng bộ vẽ của trận đấu.

## Điều khiển

| Phi công 1 · bán cầu trái | | Phi công 2 · bán cầu phải | |
|---|---|---|---|
| `A` / `D` | di chuyển | `J` | đấm phải |
| `W` | lướt né (20 năng lượng, có khung bất tử) | `K` | kiếm xích (đòn nặng, tầm xa) |
| `S` | giữ để đỡ đòn (tốn 10 năng lượng mỗi đòn) | `L` | giữ để nạp pháo plasma, thả để bắn |
| | | `I` | cú đấm phản lực (25 năng lượng) |
| `F` | đấm trái | | |

Bảng trên theo Vanguard. Tempest, Bastion và Bulwark dùng cùng phím, khác vũ khí K/L/I (xem mục Bốn Titan). **Thế hệ Eye-1 (Bastion, Bulwark) đảo tay đấm:** `F` đấm tay phải, `J` đấm tay trái.

`H` hướng dẫn · `Esc`/`P` (hoặc nút ⏸ góc phải dưới) mở menu tạm dừng: tiếp tục, cài đặt âm thanh, hướng dẫn, chơi lại, thoát về menu chính · `M` bật/tắt tiếng

**Cài đặt âm thanh** (mục 05 ở menu chính hoặc trong menu tạm dừng): chỉnh riêng âm lượng nhạc nền và hiệu ứng theo 10 nấc, bật/tắt tiếng. Cài đặt lưu trong trình duyệt. Các menu bấm được bằng chuột.

Chơi một mình: tay trái dùng `A S D W F`, tay phải dùng `J K L`.

## Phim xuất kích

Chọn xong Titan sẽ chiếu đoạn phim ngắn khoảng 17 giây, vẽ bằng canvas, gồm 3 cảnh:

1. **Trang bị giáp thần kinh:** cánh tay robot lắp 9 mảnh giáp lên hai phi công, mũ hạ xuống, kính sáng lên.
2. **Vào buồng lái:** khóa giày từ tính, nối cáp cột sống, bắt tay thần kinh đến 100%, buồng lái khóa vào đầu Titan.
3. **Vận chuyển đường không:** bốn máy bay cánh quạt nghiêng cẩu Titan qua biển đêm rồi thả xuống sát thành phố.

Từ đợt thứ hai trở đi chỉ chiếu cảnh 3. Bấm `Enter`, `Space`, `Esc` hoặc nút "BỎ QUA" để bỏ qua.

## Cơ chế

- **Neural Link (Đồng bộ):** khi hai phi công ra đòn gần như cùng lúc thì đòn đó mạnh hơn (đòn nhẹ ×1,4, đòn nặng ×1,4). Mỗi lần đồng bộ phải cách nhau ít nhất 1 giây (vạch mảnh dưới thanh Link sáng lên và nút P1/P2 có vòng sáng khi sẵn sàng; bấm lúc đang hồi thì đòn ra bình thường, không bị trừ Link). Link chỉ tăng khi đòn đồng bộ đó **đánh trúng quái**: cặp hai đòn nhẹ F+J được +6, cặp có đòn nặng (K+F, hoặc F cùng L/I) được +10. Dùng chiêu đặc biệt xong Link về 30%; đồng bộ mà đánh hụt thì không được cộng. Đánh đơn lẻ không bị trừ Link; bị trúng đòn hay bị quái gầm thì Link giảm, và Link trên 40% tự tụt dần. Dưới 25% Titan trở nên chậm chạp.
- **Pháo plasma nạp lực:** giữ `L` càng lâu (tối đa 1,4 giây) phát bắn càng to, càng mạnh và càng tốn năng lượng (15 → 50). Nạp từ 60% trở lên là đòn nặng, dùng phản đòn được. Đang nạp thì không đỡ được, và trúng bất kỳ đòn nào (kể cả khi đỡ) là mất phát nạp lẫn năng lượng đã nạp.
- **Năng lượng:** hồi chậm, và ngừng hồi 1,2 giây sau mỗi lần tiêu, nên hãy dùng pháo và lướt né đúng lúc.
- **Cú đấm phản lực:** động cơ ở khuỷu tay mồi lửa trong lúc gồng, vệt dưới đất báo tầm (xanh = trong tầm). Quái trong tầm thì chắc chắn trúng: Titan trượt tới sát quái rồi giáng đòn. Là đòn nặng nên dùng phản đòn được.
- **Ăn mừng:** hạ gục quái là Titan bật nhảy bằng thruster, xoay nửa vòng rồi đáp đất dang tay — EYERIIIM!
- **Vỡ thế thủ:** đỡ đòn khi đã hết năng lượng thì Titan lãnh trọn đòn.
- **TIDEBREAKER:** khi Link đạt 100%, đồng bộ thêm một lần nữa để bắn chùm tia từ lò phản ứng ở ngực.
- **Phản đòn:** tên đòn hiện lên khi quái bắt đầu gồng; dấu `!` hiện ở **nửa sau** thời gian gồng, đó là cửa sổ phản đòn. Đòn nặng (kiếm, pháo nạp ≥60%, cú đấm phản lực) đánh trúng trong cửa sổ đó làm quái choáng lâu. Nửa đầu quái **gồng cứng**: đánh vào không làm nó khựng. Thời gian gồng dao động ±20% nên phải nhìn, không bấm theo nhịp được.
- **Chuỗi đòn nhẹ:** đấm F/J liên tiếp giảm dần sát thương (mỗi cú −10%, thấp nhất 60%). Ngừng 1 giây hoặc trúng một đòn nặng thì về lại 100%.
- **Đỡ hay né:** dấu `!` vàng là đòn đỡ được. Đòn **lao húc** đỏ thì không đỡ được: lướt né đúng lúc nó lao tới thì cú húc hụt và quái khựng lại, đó là lúc trả đòn. Cũng có thể phản đòn trước khi nó lao tới.
- **Lướt xuyên:** đứng sát quái và lướt về phía nó thì Titan lướt xuyên qua thân quái sang phía bên kia. Dùng cách này để quay về phía thành phố nếu lỡ bị đẩy ra phía biển.
- **Bảo vệ thành phố:** quái vật bị đánh văng hay lao trúng tòa nhà đều làm thành phố chịu thiệt hại. Nếu Titan đi xa hoặc vòng ra phía biển, quái vật sẽ tiến thẳng vào thành phố và đập phá. Thành phố còn dưới 40% là thua.
- **Xưởng sửa chữa:** dùng phế liệu nhận được sau mỗi đợt để nâng cấp giáp, lò phản ứng, lõi plasma và bộ khuếch đại Link. Có thể giảm cấp bất cứ lúc nào trong xưởng (`S` / `−` hoặc nút −) để được hoàn lại đủ phế liệu đã trả.

Chiến dịch gồm 3 đợt: **Brinecrawler** (Cấp I), **Gorgemaw** (Cấp II, thêm phun axit và lao húc) và **Leviathrax** (Cấp III, thêm tiếng gầm hút Link). Khi máu xuống dưới 50%, quái vật vào trạng thái *cuồng nộ* và đánh nhanh hơn.

## Bốn Titan

| Titan | Máu | Tốc độ | K | L | I | Chiêu đặc biệt |
|---|---:|---:|---|---|---|---|
| Vanguard | 150 | 270 | Kiếm xích tầm xa | Pháo plasma nạp lực | Đấm phản lực, lao tới chắc trúng | Xung lò phản ứng |
| Tempest | 125 | 340 | Lưỡi kép cổ tay, nhanh | 6 tên lửa (giữ đủ 2 s) | Đập phản lực từ trên xuống | Mưa tên lửa vệ tinh |
| Bastion | 165 | 235 | Búa móc từ dưới lên, mạnh và xa | Tên lửa kép: nạp lực, 2 tên lửa lớn tự dẫn | Búa phản lực: bay lên phang búa xuống | Loạt pháo kép |
| Bulwark | 165 | 220 | Móc thủy lực tay trái, sét vàng | Phun lửa hai mắt: nạp lực, 2 cầu lửa | Đấm điện lao chéo rồi rơi thẳng xuống | Quá tải hạt nhân |

Bastion **đảo tay đấm**: F đấm tay phải, J đấm tay trái (cùng tay với búa K), nên F+K vẫn là hai phi công đánh hai tay khác nhau. Bastion trâu và đánh đau nhất nhưng chậm, hồi năng lượng chậm hơn (×0,8): hợp lối chơi đứng tấn, đỡ đòn và phản đòn bằng búa.

Bulwark cùng thế hệ Eye-1 nên cũng F tay phải, J tay trái (cùng tay với móc K). Chậm nhất trong bốn Titan, hồi năng lượng ×0,8. K biến hình tay trái thành nắm đấm lớn bọc sét vàng rồi móc lên; I tích điện khi đứng yên rồi lao chéo thẳng vào quái; chiêu đặc biệt Quá tải hạt nhân: toàn thân tích điện, hai vòi dưới nắm đấm phun lửa, hai mắt phóng hai cầu lửa vào quái.

## Thông số kỹ thuật Titan

Thông số hư cấu của EyeRim, không phải số liệu chính thức của nhân vật trong phim.

| Titan | Chiều cao | Khối lượng chiến đấu | Đặc điểm |
|---|---:|---:|---|
| Vanguard | 79 m | 2.050 tấn | Giáp nặng, lò phản ứng ngực, pháo plasma biến hình |
| Tempest | 76 m | 1.780 tấn | Khung nhẹ cơ động, lưỡi kép, bệ phóng tên lửa |
| Bastion | 85 m | 2.360 tấn | Pháo binh hạng nặng: búa thủy lực, hai pháo vai phóng tên lửa lớn |
| Bulwark | 86 m | 2.480 tấn | Thế hệ Eye-1, động cơ hạt nhân, buồng lái vàng trượt trong rãnh ngực |

Chiều cao đo từ đế chân tới đỉnh đầu ở tư thế đứng, không tính vây lưng. Bộ vẽ thu/phóng đồng nhất cả hai trục để mọi Titan cao bằng nhau mà không đổi tỷ lệ đầu, thân hay tay chân. Thông số xuất hiện trên thẻ chọn Titan và trang xem mẫu; không thay đổi HP, tốc độ hay sát thương.

## Nhận diện ALumiEye

Giữ nguyên UI sci-fi TIDEBREAKER: nền tối, cyan, hiệu ứng và bố cục menu/HUD. Vỏ màn hình điều khiển vuông góc bao quanh bốn cạnh canvas, nền kem, viền tím đậm và nhấn cam. Cạnh trên có logo ALumiEye gốc, Lumi đúng tỷ lệ và tên EyeRim; cạnh dưới có nhãn máy, khe trang trí và đèn trạng thái. Canvas tự co theo lòng khung, không che/cắt HUD hay cảnh báo. Dùng favicon mặt Lumi. Ảnh trong `assets/` là bản sao nguyên byte từ EyeTank và được đóng gói vào cả bản Pages lẫn HTML offline.

Kiểm tra bằng Chrome thật: `npm run check:browser` (xem mục Kiểm thử). Ảnh chụp kiểm tra được lưu vào thư mục tạm của máy (in ra cuối lần chạy), không nằm trong repo.

## Nhạc riêng

Đặt file nhạc của bạn vào `music/theme.mp3` (hoặc kéo thả file vào cửa sổ game) để thay nhạc nền tổng hợp. Xem `music/README.md`.

## Build, GitHub Pages và Releases

Cần Node.js 22+ và Chrome (chỉ để kiểm thử trên trình duyệt). Chạy từ thư mục `eyerim/`:

```sh
npm ci          # chỉ cài playwright-core để kiểm thử; game không có dependency
npm run build   # = node tools/build.js
```

Một lệnh build ra cả hai kênh, đều có sẵn nhạc:

- **`dist/` — GitHub Pages:** HTML, CSS, mã game, trang mẫu Titan, `music/theme.mp3`; đường dẫn tương đối chạy được dưới `/eyerim/`.
- **`dist/eyerim.html` — GitHub Releases:** một file nhúng CSS, JavaScript, ảnh và MP3 (Base64), mở trực tiếp để chơi offline. File này cũng có trên Pages tại `/eyerim/eyerim.html`. Trang mẫu Titan không nhúng vào bản một file.

Biến môi trường `GAME_VERSION` đặt chữ phiên bản hiển thị (workflow tự đặt). Nhạc bắt đầu sau thao tác bàn phím/chuột đầu tiên theo chính sách trình duyệt. `music/theme.mp3` phải được commit để GitHub build được; `dist/` là đầu ra nên không commit. Build báo lỗi nếu thiếu nhạc.

### Quy trình phát hành

| Workflow | Khi nào | Làm gì |
|---|---|---|
| `ci.yml` | PR, push `main` | `npm run check`: kiểm thử Node, build, chơi thử Pages + HTML offline trên Chrome |
| `pages.yml` | push `main` | như trên, rồi deploy `dist/` lên Pages (Settings → Pages → Source: **GitHub Actions**) |
| `release.yml` | push tag `vX.Y.Z` | như trên, rồi tạo Release kèm `eyerim.html` và `SHA256SUMS.txt` |

Phát hành bản mới: viết ghi chú ở `docs/releases/vX.Y.Z.md` (không có thì GitHub tự sinh), tăng `version` trong `package.json`, commit, rồi `git tag vX.Y.Z && git push origin vX.Y.Z`. Release chỉ xuất hiện khi build và kiểm thử đã qua. Các file **Source code (zip/tar.gz)** do GitHub tạo là mã nguồn, không phải bản chơi offline.

## Xem mẫu Titan

Mở trực tiếp `titans/vanguard.html`, `tempest.html`, `bastion.html` hoặc `bulwark.html` trong trình duyệt. Mỗi trang có hai hướng nhìn ngang và 12 động tác/chiêu thức, nút phát/dừng, đổi hướng, tốc độ, phóng to và thanh tua thời điểm. Không cần server hay cài thư viện.

`titans/` là **xưởng thiết kế, không ảnh hưởng game**. Bastion và Bulwark có bản nháp `titans/<id>.js` để thử thoải mái; game chỉ dùng bản trong `src/titans/<id>.js`. Duyệt xong thì đưa vào game bằng `npm run promote <id>` (chép nháp sang game, chạy test, hỏng thì tự hoàn tác); `npm run promote` không tham số cho biết bản nào đang khác game. Vanguard/Tempest chưa có bản nháp: trang xem của hai Titan này đọc thẳng bộ vẽ game `src/titans/vanguard.js`, `tempest.js`. Hiệu ứng đạn/tên lửa trên trang mẫu là minh họa chuyển động, không mô phỏng sát thương hay AI. Gallery chỉ dùng tên Vanguard/Tempest và tài nguyên trong repo, không hiển thị tên hay ảnh tham chiếu bên ngoài.

## Cấu trúc

```
index.html      trang chứa canvas
style.css       căn giữa và co giãn canvas
src/game.js     toàn bộ game: logic, AI, đồ họa vẽ bằng code, âm thanh WebAudio
src/titans/     bộ vẽ mỗi Titan mà GAME dùng (vanguard, tempest, bastion, bulwark); common/ là code dùng chung Vanguard/Tempest
titans/         xưởng thiết kế: bản nháp bộ vẽ + mỗi Titan một HTML xem mẫu (gallery.css, gallery.js); không ảnh hưởng game
test/gallery.js kiểm tra mọi động tác/hướng của các trang mẫu
test/smoke.js   bot tự chơi hết chiến dịch trong Node với canvas giả
test/balance.js đo cân bằng: bot spam phải thua, bot chơi khá phải thắng (độ khó THƯỜNG)
test/bots.js    các bot tự chơi dùng chung cho smoke và balance
tools/build.js  build dist/ (Pages) và dist/eyerim.html (Release)
tools/promote.js đưa bản nháp titans/<id>.js vào game src/titans/<id>.js
```

## Kiểm thử

```sh
npm test               # smoke (bot chơi hết chiến dịch), gallery, build — chỉ cần Node
npm run test:balance   # ~3 phút: kiểm tra cân bằng độ khó
npm run check:browser  # build rồi chơi thật trên Chrome: Pages, gallery, HTML offline, nhạc, màn nhỏ
npm run check          # tất cả, như CI
```
