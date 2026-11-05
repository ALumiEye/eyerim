# eyerim — TIDEBREAKER

Game hành động 2D chạy trên trình duyệt thuộc hệ dự án alumieye. Hai phi công cùng điều khiển một Titan-Frame cao 80 m để chặn quái vật Abyssal trước khi chúng san phẳng thành phố ven biển.

> Năm 2049, các khe nứt dưới đáy Thái Bình Dương thả ra quái vật Abyssal. Hãy giữ vững bờ biển.

## Chơi

Mở `index.html` bằng trình duyệt. Không cần cài đặt, không cần server, không dùng thư viện ngoài.

## Chế độ chơi

Menu chính: `W`/`S` (hoặc `↑`/`↓`, phím `1`–`5`) để chọn, `Enter` để bắt đầu, `H` xem hướng dẫn.

| Chế độ | Cách chơi |
|---|---|
| **Chiến dịch** | 3 đợt quái mạnh dần, có xưởng nâng cấp (tối đa cấp 3) giữa các đợt. Thua đợt nào thì chơi lại đợt đó. |
| **Đua thời gian** | Hạ liền 3 quái bằng Titan gốc, không nâng cấp. Đồng hồ chỉ dừng ở màn tổng kết mỗi đợt. Thua là chạy lại từ đầu; lưu thời gian tốt nhất. |
| **Đấu tự do** | Chọn 1 quái vật và độ khó (Dễ · Thường · Khó · Ác mộng: đổi máu, sát thương và độ hung hãn của quái). Mỗi tổ hợp quái × độ khó đã thắng được đánh dấu. |

Kỷ lục lưu trong `localStorage` của trình duyệt.

**Huấn luyện phi công** (mục 04): xem Titan diễn từng chiêu (di chuyển, lướt né, đỡ, đấm trái/phải, vũ khí K, vũ khí L, chiêu I, chiêu đặc biệt, ăn mừng). Kèm bảng chỉ số lấy thẳng từ số liệu chiến đấu: sát thương, tầm, năng lượng, đẩy lùi, thời gian gồng / ra đòn / hồi. Không có quái để đánh. `W`/`S` hoặc `1`–`0` chọn chiêu, `A`/`D` đổi Titan, `Space` dừng/phát, `R` lật hướng, `Esc` về menu. Màn này dùng chung bộ vẽ với trang mẫu `titans/*.html`.

## Điều khiển

| Phi công 1 · bán cầu trái | | Phi công 2 · bán cầu phải | |
|---|---|---|---|
| `A` / `D` | di chuyển | `J` | đấm phải |
| `W` | lướt né (20 năng lượng, có khung bất tử) | `K` | kiếm xích (đòn nặng, tầm xa) |
| `S` | giữ để đỡ đòn (tốn 10 năng lượng mỗi đòn) | `L` | giữ để nạp pháo plasma, thả để bắn |
| | | `I` | cú đấm phản lực (25 năng lượng) |
| `F` | đấm trái | | |

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

- **Neural Link (Đồng bộ):** khi hai phi công ra đòn gần như cùng lúc thì sát thương nhân đôi. Link chỉ tăng (+12) khi đòn đồng bộ đó **đánh trúng quái**; đồng bộ mà đánh hụt thì không được cộng. Ra đòn lệch nhịp, bị trúng đòn hay bị quái gầm thì Link giảm. Dưới 25% Titan trở nên chậm chạp.
- **Pháo plasma nạp lực:** giữ `L` càng lâu (tối đa 1,4 giây) phát bắn càng to, càng mạnh và càng tốn năng lượng (15 → 50). Nạp từ 60% trở lên là đòn nặng, dùng phản đòn được. Đang nạp thì không đỡ được, và trúng bất kỳ đòn nào (kể cả khi đỡ) là mất phát nạp lẫn năng lượng đã nạp.
- **Năng lượng:** hồi chậm, và ngừng hồi 1,2 giây sau mỗi lần tiêu, nên hãy dùng pháo và lướt né đúng lúc.
- **Cú đấm phản lực:** động cơ ở khuỷu tay mồi lửa trong lúc gồng, vệt dưới đất báo tầm (xanh = trong tầm). Quái trong tầm thì chắc chắn trúng: Titan trượt tới sát quái rồi giáng đòn. Là đòn nặng nên dùng phản đòn được.
- **Ăn mừng:** hạ gục quái là Titan bật nhảy bằng thruster, xoay nửa vòng rồi đáp đất dang tay — EYERIIIM!
- **Vỡ thế thủ:** đỡ đòn khi đã hết năng lượng thì Titan lãnh trọn đòn.
- **TIDEBREAKER:** khi Link đạt 100%, đồng bộ thêm một lần nữa để bắn chùm tia từ lò phản ứng ở ngực.
- **Phản đòn:** dấu `!` hiện lên khi quái vật đang gồng đòn. Dùng đòn nặng (kiếm xích, pháo, đòn đồng bộ) đánh trúng lúc đó sẽ làm nó choáng lâu.
- **Đỡ hay né:** dấu `!` vàng là đòn đỡ được. Đòn **lao húc** đỏ thì không đỡ được: hãy lướt né (tòa nhà phía sau sẽ chịu đòn) hoặc phản đòn trước khi nó lao tới.
- **Bảo vệ thành phố:** quái vật bị đánh văng hay lao trúng tòa nhà đều làm thành phố chịu thiệt hại. Nếu Titan đi xa hoặc vòng ra phía biển, quái vật sẽ tiến thẳng vào thành phố và đập phá. Thành phố còn dưới 40% là thua.
- **Xưởng sửa chữa:** dùng phế liệu nhận được sau mỗi đợt để nâng cấp giáp, lò phản ứng, lõi plasma và bộ khuếch đại Link. Có thể giảm cấp bất cứ lúc nào trong xưởng (`S` / `−` hoặc nút −) để được hoàn lại đủ phế liệu đã trả.

Chiến dịch gồm 3 đợt: **Brinecrawler** (Cấp I), **Gorgemaw** (Cấp II, thêm phun axit và lao húc) và **Leviathrax** (Cấp III, thêm tiếng gầm hút Link). Khi máu xuống dưới 50%, quái vật vào trạng thái *cuồng nộ* và đánh nhanh hơn.

## Thông số kỹ thuật Titan

Thông số hư cấu của EyeRim, không phải số liệu chính thức của nhân vật trong phim.

| Titan | Chiều cao | Khối lượng chiến đấu | Đặc điểm |
|---|---:|---:|---|
| Vanguard | 80 m | 2.400 tấn | Giáp nặng, lò phản ứng ngực, pháo plasma biến hình |
| Tempest | 80 m | 1.850 tấn | Khung nhẹ cơ động, lưỡi kép, bệ phóng tên lửa |

Chiều cao đo từ đế chân tới đỉnh đầu ở tư thế đứng, không tính vây lưng. Bộ vẽ thu/phóng đồng nhất cả hai trục để hai Titan cao bằng nhau mà không đổi tỷ lệ đầu, thân hay tay chân. Thông số xuất hiện trên thẻ chọn Titan và trang xem mẫu; không thay đổi HP, tốc độ hay sát thương.

## Nhận diện ALumiEye

Giữ nguyên UI sci-fi TIDEBREAKER: nền tối, cyan, hiệu ứng và bố cục menu/HUD. Vỏ màn hình điều khiển vuông góc bao quanh bốn cạnh canvas, nền kem, viền tím đậm và nhấn cam. Cạnh trên có logo ALumiEye gốc, Lumi đúng tỷ lệ và tên EyeRim; cạnh dưới có nhãn máy, khe trang trí và đèn trạng thái. Canvas tự co theo lòng khung, không che/cắt HUD hay cảnh báo. Dùng favicon mặt Lumi. Ảnh trong `assets/` là bản sao nguyên byte từ EyeTank và được đóng gói vào cả bản Pages lẫn HTML offline.

Kiểm tra bằng Chrome thật (dùng `playwright-core` đã có trong `../eyetank/node_modules/`):

```sh
node tools/browser-check.js
```

Lệnh tự build, chạy thử Pages và HTML offline, vào trận bằng bàn phím, kiểm tra nhạc/phím M, logo, tỷ lệ Lumi và màn nhỏ. Ảnh chụp được lưu vào `shots/brand-*.png`.

## Nhạc riêng

Đặt file nhạc của bạn vào `music/theme.mp3` (hoặc kéo thả file vào cửa sổ game) để thay nhạc nền tổng hợp. Xem `music/README.md`.

## Build, GitHub Pages và Releases

Cần Node.js 22 trở lên để build/kiểm thử, không cần cài dependency. Chạy từ thư mục `eyerim/`:

```sh
node tools/build.js
```

Lệnh này tạo hai đầu ra, đều có sẵn nhạc:

- **`dist/` — GitHub Pages:** HTML, CSS, mã game, trang mẫu Titan và `music/theme.mp3`. Deploy nguyên thư mục, không cần chép nhạc thủ công; đường dẫn tương đối chạy được dưới `/tên-repo/`.
- **`release/eyerim.html` — GitHub Releases:** một file HTML nhúng CSS, JavaScript và MP3 Base64. Tải file về, mở trực tiếp để chơi offline; không cần thư mục nhạc hay server. Trang xem mẫu Titan riêng không được nhúng vào bản một file.

Nhạc bắt đầu sau thao tác bàn phím/chuột đầu tiên theo chính sách của trình duyệt. Âm lượng và phím M giữ nguyên. File nguồn `music/theme.mp3` phải được commit cùng mã nguồn để GitHub build được; `dist/` và `release/` là đầu ra sinh tự động nên không commit. Build báo lỗi nếu thiếu nhạc.

### GitHub Pages

1. Trong repo GitHub, vào **Settings → Pages → Build and deployment → Source → GitHub Actions** (thiết lập một lần).
2. Commit/push mã nguồn, MP3 và `.github/workflows/pages.yml` lên `main`.
3. Workflow kiểm thử, build và deploy **chỉ `dist/`** lên Pages. Có thể chạy lại bằng **Actions → GitHub Pages → Run workflow**.

### GitHub Releases

Tạo và **Publish** một GitHub Release, với tag trỏ tới commit đã có các file build/workflow và MP3. Workflow `.github/workflows/release.yml` tự kiểm thử, build và đính kèm **`eyerim.html`** vào mục **Assets** của Release. Bản nháp chưa xuất bản không chạy workflow. Các file **Source code (zip/tar.gz)** do GitHub tạo vẫn là mã nguồn, không phải bản HTML độc lập.

Build/test trên máy không tự push, deploy, tạo tag hay xuất bản Release.

## Xem mẫu Titan

Mở trực tiếp `titans/vanguard.html` hoặc `titans/tempest.html` trong trình duyệt. Mỗi trang có hai hướng nhìn ngang và 12 động tác/chiêu thức, nút phát/dừng, đổi hướng, tốc độ, phóng to và thanh tua thời điểm. Không cần server hay cài thư viện.

Các trang dùng chung hàm vẽ và IK trong `src/game.js`, nên chỉnh nhân vật sẽ cập nhật cả game lẫn trang mẫu. Hiệu ứng đạn/tên lửa trên trang mẫu là minh họa chuyển động, không mô phỏng sát thương hay AI. Tempest bám ảnh `../striker-eureka.jpg`; Vanguard phối hợp ba ảnh ở thư mục gốc: `../gipsy danger.jpeg` (ngang), `../front gipsy.jpg` (trước) và `../back gipsy.webp` (sau).

## Cấu trúc

```
index.html      trang chứa canvas
style.css       căn giữa và co giãn canvas
src/game.js     toàn bộ game: logic, AI, đồ họa vẽ bằng code, âm thanh WebAudio
titans/        mỗi Titan một HTML xem mẫu, dùng chung gallery.css và gallery.js
test/gallery.js kiểm tra mọi động tác/hướng của các trang mẫu
test/smoke.js   bot tự chơi hết chiến dịch trong Node với canvas giả
```

## Kiểm thử

```
node test/smoke.js
node test/gallery.js
node test/build.js
```
