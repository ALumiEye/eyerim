# eyerim — TIDEBREAKER

Game hành động 2D chạy trên trình duyệt thuộc hệ dự án alumieye. Hai phi công cùng điều khiển một Titan-Frame cao 80 m để chặn quái vật Abyssal trước khi chúng san phẳng thành phố ven biển.

> Năm 2049, các khe nứt dưới đáy Thái Bình Dương thả ra quái vật Abyssal. Hãy giữ vững bờ biển.

## Chơi

Mở `index.html` bằng trình duyệt. Không cần cài đặt, không cần server, không dùng thư viện ngoài.

## Điều khiển

| Phi công 1 · bán cầu trái | | Phi công 2 · bán cầu phải | |
|---|---|---|---|
| `A` / `D` | di chuyển | `J` | đấm phải |
| `W` | lướt né (20 năng lượng, có khung bất tử) | `K` | kiếm xích (đòn nặng, tầm xa) |
| `S` | giữ để đỡ đòn (tốn 10 năng lượng mỗi đòn) | `L` | giữ để nạp pháo plasma, thả để bắn |
| | | `I` | cú đấm phản lực (25 năng lượng) |
| `F` | đấm trái | | |

`H` hướng dẫn · `P`/`Esc` tạm dừng · `M` bật/tắt âm thanh

Chơi một mình: tay trái dùng `A S D W F`, tay phải dùng `J K L`.

## Cơ chế

- **Neural Link (Đồng bộ):** khi hai phi công ra đòn gần như cùng lúc thì sát thương nhân đôi và Link tăng. Ra đòn lệch nhịp, bị trúng đòn hay bị quái gầm thì Link giảm. Dưới 25% Titan trở nên chậm chạp.
- **Pháo plasma nạp lực:** giữ `L` càng lâu (tối đa 1,4 giây) phát bắn càng to, càng mạnh và càng tốn năng lượng (15 → 50). Nạp từ 60% trở lên là đòn nặng, dùng phản đòn được. Đang nạp thì không đỡ được, và trúng bất kỳ đòn nào (kể cả khi đỡ) là mất phát nạp lẫn năng lượng đã nạp.
- **Năng lượng:** hồi chậm, và ngừng hồi 1,2 giây sau mỗi lần tiêu, nên hãy dùng pháo và lướt né đúng lúc.
- **Cú đấm phản lực:** động cơ ở khuỷu tay mồi lửa trong lúc gồng, vệt dưới đất báo tầm (xanh = trong tầm). Quái trong tầm thì chắc chắn trúng: Titan trượt tới sát quái rồi giáng đòn. Là đòn nặng nên dùng phản đòn được.
- **Ăn mừng:** hạ gục quái là Titan bật nhảy bằng thruster, xoay nửa vòng rồi đáp đất dang tay — EYERIIIM!
- **Vỡ thế thủ:** đỡ đòn khi đã hết năng lượng thì Titan lãnh trọn đòn.
- **TIDEBREAKER:** khi Link đạt 100%, đồng bộ thêm một lần nữa để bắn chùm tia từ lò phản ứng ở ngực.
- **Phản đòn:** dấu `!` hiện lên khi quái vật đang gồng đòn. Dùng đòn nặng (kiếm xích, pháo, đòn đồng bộ) đánh trúng lúc đó sẽ làm nó choáng lâu.
- **Đỡ hay né:** dấu `!` vàng là đòn đỡ được. Đòn **lao húc** đỏ thì không đỡ được: hãy lướt né (tòa nhà phía sau sẽ chịu đòn) hoặc phản đòn trước khi nó lao tới.
- **Bảo vệ thành phố:** quái vật bị đánh văng hay lao trúng tòa nhà đều làm thành phố chịu thiệt hại. Nếu Titan đi xa hoặc vòng ra phía biển, quái vật sẽ tiến thẳng vào thành phố và đập phá. Thành phố còn dưới 40% là thua.
- **Xưởng sửa chữa:** dùng phế liệu nhận được sau mỗi đợt để nâng cấp giáp, lò phản ứng, lõi plasma và bộ khuếch đại Link.

Chiến dịch gồm 3 đợt: **Brinecrawler** (Cấp I), **Gorgemaw** (Cấp II, thêm phun axit và lao húc) và **Leviathrax** (Cấp III, thêm tiếng gầm hút Link). Khi máu xuống dưới 50%, quái vật vào trạng thái *cuồng nộ* và đánh nhanh hơn.

## Nhạc riêng

Đặt file nhạc của bạn vào `music/theme.mp3` (hoặc kéo thả file vào cửa sổ game) để thay nhạc nền tổng hợp. Xem `music/README.md`.

## Cấu trúc

```
index.html      trang chứa canvas
style.css       căn giữa và co giãn canvas
src/game.js     toàn bộ game: logic, AI, đồ họa vẽ bằng code, âm thanh WebAudio
test/smoke.js   bot tự chơi hết chiến dịch trong Node với canvas giả
```

## Kiểm thử

```
node test/smoke.js
```
