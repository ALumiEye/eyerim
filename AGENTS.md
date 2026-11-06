# EyeRim — quy tắc cho trợ lý AI

## Nơi lưu quy tắc

Mọi rule vẽ riêng của EyeRim nằm trong repo này, tại `AGENTS.md`; `CLAUDE.md` trỏ tới file này. Không lưu bản gốc rule EyeRim ở thư mục cha hoặc cấu hình global. Thư mục cha chỉ giữ quy tắc dùng chung giữa các game và liên kết tới đây.

## Nhân vật và tạo hình

- Giữ nguyên tạo hình Vanguard/Tempest. Vanguard bám ảnh Gipsy Danger ở thư mục cha; Tempest theo Striker Eureka: giáp bạc xám, đầu nhỏ kính tối, vai rộng, ngực tên lửa, lưỡi kép cổ tay. Ngoại lệ giáp kim loại chỉ áp dụng cho nhân vật.
- Gallery public chỉ dùng tên **Vanguard/Tempest/Bastion**; không đưa tên Gipsy Danger/Striker Eureka/Coyote Tango hoặc ảnh tham chiếu ngoài repo lên gallery.
- **Tempest — L**: khi mở/nạp/phóng bệ ngực, hai tay **hoán đổi tư thế cũ**: **tay phải co thấp, co vừa phải và nép sát thân** để lấp khoảng trống giữa tay và ngực (khớp vai lùi nhẹ), nhưng không che ống phóng nào; không co xa khỏi thân, **tay trái co cao ra phía sau lưng** (lộ sau vai, không đưa ra trước ngực). Không để tay phải co cao/tay trái thấp (Titan trông gầy). Phải thấy đủ **sáu tên lửa (3×2)**; hai tay đi cùng nhịp nắp mở, giữ trong lúc phóng rồi về tư thế nghỉ. Đích bàn tay ở `TEMPEST_LAUNCH_ARMS` trong `src/game.js`. Không đổi số đạn, thời gian nạp hay sát thương vì thay tư thế.
- **Bastion** (đổi tên từ Coyote theo yêu cầu, id `bastion`, file `titans/bastion.*`) bám năm ảnh ở thư mục cha: `coyote1.jpeg`, `coyote2.jpeg`, `coyote3.jpg`, `coyote4.avif`, `coyote5.JPG`. Giáp xám ô-liu, vạch đỏ, vai tròn lớn, đầu nhỏ kính xanh dọc, eo hẹp, tay dài; dáng ngang 3/4 thủ thế, giáp vai/ngực dày, tay gập nắm đấm lớn và chân trước–sau vững. Không dùng dáng chính diện mảnh, tay buông/chân khép hoặc giáp phẳng vụn.
- Cụm lưng/hai pháo Bastion phải đọc rõ như ảnh 5: thân pháo dài xuống eo, khóa nòng, ray/bệ chịu giật, xi-lanh, trục xoay riêng; đặt lệch lớp để không chỉ thấy hai ống trên vai.
- Bộ chiêu Bastion khớp ô/nút hai Titan cũ: **S** đỡ, **W** lướt, **F/J** đấm **phải/trái** (đảo so với hai Titan cũ để F + K là hai tay khác nhau: búa K là tay trái); **K** tay trái biến thành búa lớn rồi móc dứt khoát từ dưới lên, tầm cao/xa, tay vươn dài, rõ khối búa/quỹ đạo, thân đứng nguyên vị trí không nhún/bước/nhảy, tay còn lại thủ; **L** phóng đồng thời đúng hai tên lửa lớn từ hai pháo vai, rõ thân/cánh/đuôi phản lực; **I** ba lô phản lực đưa Titan bay lên rồi búa **tay phải** phang từ trên xuống, tầm khóa bằng **hai lần chiều cao vẽ**, không thay búa trái K. Chiêu đặc biệt là loạt pháo kép (`ult: 'salvo'`, `SALVO` trong `src/game.js`): hai pháo vai luân phiên phóng 14 tên lửa rời nòng ngang rồi ngóc lên trời, kéo vệt khói trắng dài, bổ nhào xuống quái; mỗi lần lóe nòng của bộ vẽ khớp một quả rời nòng. Nhãn phải hiện phím tương ứng; không đổi ô I thành chiêu pháo.

## Chiều cao vẽ — mọi Titan/robot, kể cả mẫu mới

**Chiều cao từ đất tới đỉnh đầu của tất cả Titan bằng nhau khi vẽ.** So ở tư thế đứng chuẩn, cùng camera và cùng zoom; không tính pháo vai, vây, ăng-ten hoặc phụ kiện nhô lên. Chuẩn hóa bằng scale đồng nhất X/Y, giữ tỷ lệ tạo hình, cùng đường mặt đất; áp dụng gallery lẫn game. Chiều cao hiển thị **độc lập thông số hư cấu**: số mét/khối lượng có thể khác nhau, không dùng số mét quyết định kích thước vẽ. Cúi/nhảy vẫn chuyển động tự nhiên.

## Giao diện — ngoại lệ được duyệt

- Giữ UI sci-fi hiện tại của TIDEBREAKER: nền tối, cyan, màu cảnh báo, gradient/glow, bo góc, bố cục menu/HUD và chuyển động. Không đổi toàn bộ nút/thẻ sang kem/tím/cam.
- ALumiEye là lớp nhận diện bổ sung: logo ảnh gốc, EyeRim tím/cam trên nền kem cùng Lumi đúng tỷ lệ, favicon mặt Lumi. Không tự vẽ lại logo/Lumi. File gốc logo/Lumi ở `../eyetank/src/client/`, bản sao trong `assets/`; favicon là mặt Lumi.
- Vỏ màn hình điều khiển vuông góc bao đủ bốn cạnh: nền kem `#efe3cc`, viền tím đậm `#3d2141`, nhấn cam `#eba96b`, logo/tên ở cạnh trên; nhãn máy/khe trang trí/đèn trạng thái cạnh dưới. Khung nằm ngoài canvas, không che HUD/cảnh báo. TIDEBREAKER vẫn là tiêu đề chính.
- Logo góc trên trái mọi màn hình, `alt="ALumiEye"`, dùng nguyên ảnh đúng tỷ lệ, không thêm vòng viền hoặc `border-radius` cắt đỉnh tam giác. Lumi luôn giữ tỷ lệ gốc.
- Nhúng đầy đủ tài nguyên nhận diện vào HTML offline và sao chép vào bản Pages.

## Template chuyển động chung cho mọi Titan

- **Ăn mừng và Trúng đòn dùng chung template cho tất cả Titan**, gồm Vanguard, Tempest, Bastion và mọi Titan thêm sau này. Không tự tạo một kiểu ăn mừng/trúng đòn riêng cho mẫu mới.
- **Ăn mừng**: khuỵu gối lấy đà **0,35 giây** → bật phản lực, nhảy xoay **nửa vòng trong 0,75 giây** → đáp đất, dang hai tay, mở chân đứng vững và giữ tư thế **1,9 giây**. Theo template Vanguard/Tempest trong `src/game.js`; không thay bằng giơ một tay/chào.
- **Trúng đòn**: theo `STAGGER_TEMPLATE` và `staggerPreview` trong `src/game.js`: thân trên ngả lùi **0,12 rad quanh hông**, khuỵu gối **10 đơn vị khung cơ sở**, hai tay chuyển về thế bị đánh bật, giáp lóe trắng theo cùng nhịp. Chân vẫn bám đất, không xoay cả Titan quanh bàn chân hoặc lắc đầu độc lập. Gallery giữ tư thế trúng đòn và nhịp lóe như hai Titan hiện có; thời lượng choáng trong trận do trạng thái chiến đấu điều khiển.
- Có thể đổi tọa độ template sang góc khớp và tỷ lệ riêng để giữ nguyên tạo hình/tỷ lệ của từng Titan. Không thay giáp, vũ khí, kích thước chuẩn hóa hoặc lớp che khuất: tay/vai phía xa phải ở sau giáp ngực và đầu.
- Khi sửa template, kiểm tra cả ba Titan, hai hướng, các pha chuyển động và ảnh chụp thật trên Chrome. Không chỉ kiểm tra mã chạy được.

## Phạm vi và phát hành

- Bastion đã vào roster chiến đấu (Titan thứ ba trong `TITANS`, `src/game.js`). Bộ vẽ duy nhất vẫn là `titans/bastion.js`, dùng chung cho trang xưởng và trận đấu: game nạp file này sau `src/game.js` (`index.html`, bản offline nhúng qua `tools/build.js`, các test nạp vào sandbox) và gọi `window.EyeRimBastion`. `bastionClip` trong `src/game.js` ánh xạ trạng thái chiến đấu sang động tác + thời điểm của bộ vẽ; sửa nhịp chiêu Bastion thì sửa cả hai nơi cho khớp. Ô `arm` của đòn theo **phi công** (L = phi công 1: F; R = phi công 2: J/K/L/I), không theo tay được vẽ; đồng bộ là hai phi công cùng ra đòn. Búa K của Bastion vẫn ở ô `R`; vì búa là tay trái nên Bastion đảo tay đấm (F tay phải, J tay trái) để F + K không dùng chung một tay.
- Repo **không có thư mục `shots/`** (đã xóa theo yêu cầu). Mọi ảnh chụp khi kiểm tra (nhận diện, động tác, tư thế, so sánh) lưu ở thư mục tạm của máy (`checkShots` trong `tools/browser-check.js`, hoặc scratchpad); không tạo lại `shots/` và không commit ảnh chụp kiểm tra.
- Không commit, push, tag hay tạo Release nếu chưa có lệnh rõ ràng từ người dùng.
