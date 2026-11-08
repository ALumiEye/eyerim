# GAME DESIGN: chỉ số Titan và chiêu thức

Tài liệu thiết kế, chưa áp dụng vào code. Cân bằng chỉ quan tâm chiêu đặc biệt (F+J); các chiêu F, J, K, I, L không chỉnh theo bài cân bằng.

## 1. Chỉ số cơ bản (thang 10)

| Titan | Thế hệ | Tầm xa | Cận chiến | Tốc độ | Giáp | Năng lượng | Tổng |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Tempest | Eye-5 | 10 | 10 | 10 | 9 | 10 | 49 / 50 |
| Vanguard | Eye-3 | 8 | 8 | 7 | 8 | 8 | 39 / 50 |
| Bulwark | Eye-1 | 3 | 10 | 3 | 10 | 10 | 36 / 50 |
| Bastion | Eye-1 | 9 | 6 | 5 | 7 | 7 | 34 / 50 |

Hòa chỉ số là cố ý: Tempest và Bulwark cùng 10 ở Cận chiến và Năng lượng. Mọi công thức bên dưới dùng thẳng giá trị thang 10.

## 2. Mỗi chiêu gồm bốn chỉ số

| Chiêu | Tụ chiêu | Tầm đánh | Sát thương | Hồi chiêu |
|---|---|---|---|---|
| F | cố định, chung | cố định, chung | hàm của cận chiến | cố định, chung |
| J | cố định, chung | cố định, chung | hàm của cận chiến | cố định, chung |
| K | cố định, chung | hằng số riêng từng Titan | hàm của cận chiến (khác F/J) | cố định, chung |
| I | hàm của năng lượng, khối lượng, tốc độ | 2 × H | hàm của cận chiến | cố định, chung |
| L | hàm của năng lượng | vô hạn | hàm của tầm xa, năng lượng; Vanguard/Bulwark tỷ lệ với thời gian nạp | hàm của năng lượng và sát thương **thực tế** |

"Cố định, chung" là cùng một giá trị cho mọi Titan, không phụ thuộc chỉ số.

### Làm tròn

Chỉ **sát thương** được làm tròn, vì sát thương cộng trừ trực tiếp vào máu:

- Sát thương làm tròn lên số nguyên, một lần ở cuối phép tính (sau khi đã nhân chỉ số ẩn và tỷ lệ nạp của L). Ví dụ 36,4 → 37.
- Tầm đánh và thời gian (tụ, hồi) giữ nguyên giá trị tính ra, không làm tròn.
- Hồi chiêu của L tính từ sát thương thực tế **đã làm tròn**.

## 2b. Chỉ số ẩn

Mỗi Titan có thể có một chỉ số ẩn, không hiển thị trên giao diện. Hiện mới có một chỉ số ẩn:

| Titan | Chỉ số ẩn | Áp dụng cho | Cách tính |
|---|---|---|---|
| Bulwark | Sát thương cận chiến | mọi đòn cận chiến: F, J, K, I | sát thương × U(1, 1.36), gieo lại mỗi lần ra đòn |
| Vanguard, Tempest, Bastion | chưa có | — | — |

`U(1, 1.36)` là số ngẫu nhiên phân phối đều từ 1 đến 1,36. Chiêu L không phải đòn cận chiến nên không nhân.

## 3. Chiêu F và J

| Chiêu | Tụ (s) | Tầm | Hồi (s) |
|---|---:|---:|---:|
| F | 0.07 | 170 | 0.16 |
| J | 0.10 | 175 | 0.22 |

```
F: sát thương = 6 · (0.6 + 0.08 · cận chiến)
J: sát thương = 9 · (0.6 + 0.08 · cận chiến)
```

| Titan | Cận chiến | F | J |
|---|:-:|---:|---:|
| Tempest | 10 | 9 | 13 |
| Vanguard | 8 | 8 | 12 |
| Bulwark | 10 | 9 đến 12 (chỉ số ẩn) | 13 đến 18 (chỉ số ẩn) |
| Bastion | 6 | 7 | 10 |

## 4. Chiêu K (đòn nặng)

Tụ và hồi cố định, chung cho mọi Titan. Hoạt cảnh K của từng Titan được co giãn cho khớp hai mốc này.

| Tụ (s) | Hồi (s) |
|---:|---:|
| 0.40 | 0.40 |

**Tầm đánh:** hằng số gán riêng từng Titan, theo thứ tự Vanguard = Bulwark > Tempest = Bastion > F/J.

| Titan | Tầm K |
|---|---:|
| Vanguard | 300 |
| Bulwark | 300 |
| Tempest | 240 |
| Bastion | 240 |

So sánh: F = 170, J = 175.

```
sát thương = 10 + 1.6 · cận chiến
```

| Titan | Cận chiến | Sát thương |
|---|:-:|---:|
| Tempest | 10 | 26 |
| Vanguard | 8 | 23 |
| Bulwark | 10 | 26 đến 36 (chỉ số ẩn) |
| Bastion | 6 | 20 |

## 5. Chiêu I (tốn năng lượng)

```
tụ chiêu   = 0.9 + 0.0002 · khối lượng − 0.03 · tốc độ − 0.03 · năng lượng
tầm đánh   = 2 · H
sát thương = 20 + 2 · cận chiến
hồi chiêu  = 0.7 s (chung)
```

- `khối lượng` là thông số khối lượng của Titan, tính theo **tấn**.
- `H` là chiều cao chuẩn hình vẽ (khoảng 280 px, giống nhau cho mọi Titan), nên tầm I ≈ 560 px. Không phụ thuộc số mét hư cấu.

| Titan | Khối lượng (tấn) | Tụ (s) | Tầm | Sát thương | Hồi (s) |
|---|---:|---:|---:|---:|---:|
| Tempest | 1.780 | 0.656 | 2 × H | 40 | 0.70 |
| Vanguard | 2.050 | 0.860 | 2 × H | 36 | 0.70 |
| Bulwark | 2.480 | 1.006 | 2 × H | 40 đến 55 (chỉ số ẩn) | 0.70 |
| Bastion | 2.360 | 1.012 | 2 × H | 32 | 0.70 |

Titan nặng tụ lâu hơn; tốc độ và năng lượng cao rút ngắn thời gian tụ.

## 6. Chiêu L

```
tụ chiêu (T)           = 2.6 − 0.12 · năng lượng
tầm đánh               = vô hạn
sát thương tối đa      = 12 + 1.8 · tầm xa + 1.2 · năng lượng
hồi chiêu              = 1.0 + 0.04 · sát thương thực tế − 0.08 · năng lượng
nạp tối thiểu          = 0.36 · T   (chỉ Vanguard, Bulwark)
```

Hồi chiêu luôn tính từ **sát thương thực tế** của phát bắn: bắn càng mạnh thì hồi càng lâu; năng lượng cao rút ngắn cả tụ lẫn hồi.

L có hai kiểu nạp:

**Nạp đủ mới bắn: Tempest, Bastion**
- Phải giữ đủ thời gian tụ T mới xuất chiêu. Thả sớm thì hủy, không bắn.
- Sát thương thực tế luôn bằng sát thương tối đa, nên thời gian hồi cố định.

| Titan | Tụ (s) | Sát thương | Hồi (s) |
|---|---:|---:|---:|
| Tempest | 1.40 | 42 | 1.88 |
| Bastion | 1.76 | 37 | 1.92 |

**Nạp theo thời gian giữ: Vanguard, Bulwark**
- Phải giữ tối thiểu `0.36 · T` (36% thời gian nạp tối đa của chính Titan đó) mới bắn được. Thả sớm hơn thì hủy, không bắn.
- Giữ từ mốc tối thiểu trở lên thì thả lúc nào cũng bắn. Sát thương tỷ lệ thuận với thời gian đã nạp `t`:

```
sát thương thực tế = sát thương tối đa · min(t, T) / T      (t ≥ 0.36 · T)
```

- Thời gian hồi thay đổi theo sát thương thực tế của từng phát.

| Titan | T (s) | Nạp tối thiểu (s) | Nạp tối thiểu: sát thương / hồi | Nạp đủ T: sát thương / hồi |
|---|---:|---:|---:|---:|
| Vanguard | 1.64 | 0.5904 | 13 / 0.88 s | 36 / 1.80 s |
| Bulwark | 1.40 | 0.504 | 11 / 0.64 s | 30 / 1.40 s |

## 7. Năng lượng

Giữ nguyên cách thanh năng lượng hoạt động như code hiện tại; chỉ nối vào các mốc mới.

**Chung cho mọi Titan**
- Thanh năng lượng 0–100.
- Sau mỗi lần tiêu năng lượng, ngừng hồi 1,2 s rồi mới hồi tiếp.
- W (lướt) tốn 20, S (đỡ) tốn 10 mỗi đòn đỡ.
- I tốn 25 lúc bấm. Trúng đòn khi đang tụ thì mất chiêu, không hoàn năng lượng.

**Tốc độ hồi: khác nhau theo chỉ số Năng lượng**

```
hồi năng lượng mỗi giây = 7 · (0.8 + 0.055 · năng lượng)      (× nâng cấp Lò phản ứng nếu có)
```

| Titan | Năng lượng | Hệ số | Hồi mỗi giây | Từ 0 tới đầy |
|---|:-:|---:|---:|---:|
| Tempest | 10 | 1.35 | 9.45 | ≈ 10,6 s |
| Bulwark | 10 | 1.35 | 9.45 | ≈ 10,6 s |
| Vanguard | 8 | 1.24 | 8.68 | ≈ 11,5 s |
| Bastion | 7 | 1.185 | 8.30 | ≈ 12,1 s |

**Chiêu L tốn năng lượng theo tỷ lệ đã nạp**

```
năng lượng đã tốn = 15 + 35 · min(t, T) / T
```

Tốn 15 khi bắt đầu nạp, tăng đều tới 50 khi nạp đầy T của Titan đó.

| | Tempest, Bastion (nạp đủ mới bắn) | Vanguard, Bulwark (nạp theo thời gian giữ) |
|---|---|---|
| Điều kiện bắt đầu nạp | có ≥ 50 năng lượng | có ≥ 28 năng lượng (đủ tới mốc 0,36 · T) |
| Thả trước mốc bắn được | hủy, hoàn lại năng lượng đã tốn | hủy, hoàn lại năng lượng đã tốn |
| Thả sau mốc | chỉ bắn khi nạp đủ T, tốn 50 | bắn với mức đã nạp, tốn 28 → 50 |
| Hết năng lượng giữa chừng | không xảy ra nhờ điều kiện bắt đầu | dừng nạp ở mức hiện tại, thả ra vẫn bắn |

Năng lượng giới hạn số lần dùng chiêu trong một khoảng thời gian; hồi chiêu của L (mục 6) giới hạn tốc độ bắn liên tiếp. Hai lớp này tách bạch nhau.

## 8. Ghi chú

- Tên hiển thị dùng tên EyeRim; tên và thông số gốc của robot trong phim không đưa vào repo.
- Chỉ số "Hỏa lực" cũ được thay bằng hai chỉ số **Tầm xa** (chỉ điều khiển L) và **Cận chiến** (điều khiển F, J, K, I).
- Thanh chỉ số trên màn chọn sẽ đổi sang thang 10, đọc từ bảng mục 1.
