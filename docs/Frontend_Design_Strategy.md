# Chiến lược Thiết kế Frontend (UI/UX)

Tài liệu đặc tả kiến trúc bề mặt và trải nghiệm người dùng (Frontend Experience) cho hệ thống Gợi ý Tour Du lịch AI. Không sử dụng các template dập khuôn, hệ thống sẽ được thiết kế với tư duy của một Agency chuyên nghiệp.

## 1. Triết lý Thiết kế (Design Philosophy - Agency Level)
- **Minimalist & Anti-Slop:** Chịu ảnh hưởng trực tiếp từ phong cách *Editorial Typography* (Tạp chí) và *High-end Visual Design*. Cương quyết loại bỏ các "lỗi sáo rỗng AI mặc định" (neon glow, heavy gradients). Ứng dụng **Spatial Rhythm** (Nhịp điệu không gian): Khoảng trống (Whitespace) được tính toán tỉ lệ để điều hướng mắt tự nhiên.
- **Bento Grid & Haptic Depth:** Các màn hình khám phá Tour (Exploration) hiển thị dạng lưới Bento-box. Phối kết hợp đổ bóng sâu cực mịn (Haptic depth shading) và các viền bo góc sắc nét để thay thế các đường kẻ viền (border) thô ráp rời rạc.

## 2. Hệ thống Nhận diện (Design System)
- **Typography (Kiểu chữ):** Bỏ qua các font hệ thống như `Roboto` hay `Inter`. Sử dụng bộ font thiết kế mang hơi hướng hiện đại như **`Geist`**, **`Outfit`** hoặc **`Satoshi`**. 
  - Khung tiêu đề (Headline): Căn lề chặt (track-tight), kích thước to rõ, độ dày đậm (700-900) tạo búa đập thị giác.
  - Văn bản thường (Body): Giãn dòng rộng (1.65), màu phụ (Secondary) để chống mỏi mắt.
- **Color Palette (Màu sắc):**
  - **Màu Nền (Surface):** Sử dụng `Canvas White` hoặc `Off-black` (với chế độ Darkmode). Hạn chế dùng `#000000` (đen tuyền) hoặc `#FFFFFF` (trắng toát) gây chói mắt màn hình OLED.
  - **Màu Text:** `Charcoal Ink` (Xám than) thay cho đen thuần.
  - **Màu Nhấn (Accent):** Được quy hoạch nghiêm ngặt. Chỉ sử dụng 1 màu nhấn duy nhất (VD: Ngọc bích - Emerald Signal) cho các thẻ Tag, nút Call-to-Action (CTA).

## 3. Trải nghiệm người dùng (UX) đối với Chức năng AI
- **Giao diện Chat (AI Interface):**
  - Không sử dụng dạng bong bóng nổi (Floating chat-head) ở góc màn hình.
  - Khi người dùng muốn tư vấn cá nhân hóa, giao diện sẽ chuyển đổi sang dạng **Split-screen** (chia nửa màn hình) hoặc cửa sổ toàn rạp (Full-space) tương tự ChatGPT. Nửa bên trái là đoạn hội thoại, nửa bên phải tự động render các thẻ (Cards) Tour được AI gợi ý ra.
- **Hiệu ứng truyền tải (Streaming UX):**
  - Không bắt người dùng chờ "màn hình trắng" 5-10 giây để AI suy nghĩ.
  - Tích hợp **SSE (Server-Sent Events)**: Chữ từ LLM sẽ được in ra màn hình từ từ giống con người đang gõ (Typing Effect).
- **Trạng thái Chờ (Loading State):** 
  - Loại bỏ hoàn toàn vòng tròn xoay (Circular Spinners). Thay vào đó sử dụng **Skeletal Shimmer** (Khung xương xám mờ chạy hiệu ứng ánh sáng) cho các thẻ Tour trước khi data loading xong.

## 4. Chuyển động học Cao cấp (High-end GSAP-level Motion)
- Trọng tâm vào vật lý lò xo (**Spring Physics**) và gia tốc tự nhiên. Các nút bấm click/hover có phản hồi vật lý nén `scale(0.98)` theo triết lý phản hồi xúc giác (*Haptic Feedback*). Nói hoàn toàn "KHÔNG" với các hiệu ứng `linear tweening` đều đặn vô hồn.
- Toàn bộ hoạt ảnh (fade-in rèm, slide-up) giới hạn chặt ở mức micro-interaction dưới `200ms` nhằm đạt chuẩn "Blazing Fast" (Nhanh điên cuồng), tối ưu sự tập trung của user thay vì lạm dụng animation quá đà.

## 5. Cân nhắc Học thuật & Nợ Kỹ thuật (Technical Trade-offs)
Để hội đồng phản biện thấy được tư duy hệ thống, FE đã lường trước 2 "hạt sạn" kinh điển của Web App:
- **Hạt sạn 1: Quản lý Trạng thái (Over-rendering):** Việc nhận Streaming chữ từ AI liên tục có thể gây lỗi Re-render toàn bộ trang khiến React bị giật lag. Gỡ rối bằng cách dùng State Manager nhẹ (như **Zustand** thay vì Redux) kết hợp `React.memo` khoanh vùng chính xác component Chat, giữ cho list Tour bên cạnh không bị chớp nháy.
- **Hạt sạn 2: Vấn đề SEO (Search Engine Optimization):** Vite sinh ra ứng dụng Client-Side Rendering (CSR), rất khó cho Google Bot đọc nội dung Tour so với Next.js (SSR). **Đánh đổi có chủ đích:** Vì trọng tâm đồ án là *Trải nghiệm Recommendation cá nhân hóa sau khi đăng nhập*, tốc độ SPA của Vite được đặt lên trên nhu cầu SEO. Hướng mở rộng tương lai sẽ là lên đời Next.js nếu cần thương mại hóa.
