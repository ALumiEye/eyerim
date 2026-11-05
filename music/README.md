# Nhạc riêng của bạn

Đặt file nhạc vào thư mục này với tên `theme.mp3` (hoặc `theme.ogg`, `theme.m4a`). Game sẽ chơi file đó thay cho nhạc nền tổng hợp sẵn có.

Cách khác: kéo thả một file nhạc bất kỳ vào cửa sổ game khi đang chơi.

`theme.mp3` là nhạc nền mặc định, được phép theo dõi trong Git để GitHub Actions build được. Các file nhạc khác vẫn bị `.gitignore` loại trừ.

Chạy `node tools/build.js` từ thư mục `eyerim/` sẽ sao chép MP3 vào `dist/music/theme.mp3` cho GitHub Pages, đồng thời nhúng MP3 vào `dist/eyerim.html` cho GitHub Releases. Build sẽ báo lỗi nếu thiếu MP3; không tự tạo bản phát hành thiếu nhạc.
