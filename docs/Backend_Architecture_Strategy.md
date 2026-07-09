# Phân mảng Kiến trúc Backend (Node.js & Python)

Tài liệu đặc tả giải pháp phân chia trách nhiệm (Separation of Concerns) cấp độ hệ thống Backend. Để đáp ứng một hệ thống vừa cần tốc độ tương tác cao, vừa cần khả năng xử lý toán học/NLP phức tạp, Backend được chủ động chẻ làm hai Service chuyên biệt kết nối qua mạng nội bộ.

## 1. Vai trò của Core Web Service (Node.js / Express)
Đóng vai trò là **"Hệ Thần Kinh Ngoại Biên"** (API Gateway & Manager).

### A. Nhiệm vụ chính
- Chịu trách nhiệm trực tiếp giao tiếp với Frontend. Toàn bộ Request từ Internet đổ vào phải đi qua cửa ngõ này.
- **Xử lý nhanh (I/O-Intensive):** Phục vụ các API có độ trễ cực thấp như: Lấy danh sách Tour phổ biến, CRUD tài khoản, xác thực Authentication (JWT).
- **Nuôi AI (Implicit Logging):** Lắng nghe trong im lặng. Mỗi cú lưu tour, mỗi 30s dừng ở trang, Node.js sẽ lập tức chèn 1 bản ghi vào bảng `user_actions` cực kỳ nhẹ nhàng mà user không cảm nhận thấy.

### B. Tại sao lại là Node.js?
Node.js sử dụng kiến trúc Event-Driven tĩnh và Non-blocking I/O. Nhờ đó, một instance nhỏ bé của Node.js vẫn dễ dàng điều phối hàng ngàn request đọc/ghi Database đồng thời, rất phù hợp cho nhiệm vụ "Người điều phối" (Orchestrator).

## 2. Vai trò của AI Component Service (Python / FastAPI)
Đóng vai trò là **"Bộ Não Phân Tích"** (Heavy-lifter).

### A. Nhiệm vụ chính
- **Không đứng trước mặt tiền:** Python service được giấu kỹ hoàn toàn phía sau Node.js. Nó không nhận bất kỳ request nào đến từ Frontend để đảo bảo bảo mật tuyệt đối cho LLM API Keys.
- **NLP & Parsing:** Dùng prompt engineering giao tiếp với Gemini, dịch review thô thành JSON cấu trúc chuẩn, lọc các Tag theo Taxonomy 15 chiều.
- **Giao tiếp pgvector:** Dịch cấu trúc Tag ra chuẩn Embedding Vector để bắn thẳng vào PostgreSQL, kích hoạt Index `HNSW` tìm kiếm Tour phù hợp cho User.

### B. Tại sao lại là Python?
- Node.js không được sinh ra cho xử lý đồng bộ mảng (arrays) lớn hoặc phép tính ma trận. Python (với `numpy`, `scikit-learn`, `fastapi`) là bá chủ sinh thái AI. Chạy FastAPI nội bộ mang lại trải nghiệm tính toán cực kỳ tối ưu và cấu trúc code vô cùng tinh gọn.

## 3. Luồng Giao tiếp Liên Dịch vụ (Inter-Service Protocol)

- **Request Đồng bộ (Synchronous Auth):** Khi FE hỏi Node.js "cho tôi danh sách đề xuất của user này". Node.js gọi HTTP sang Python. Python lấy ID từ DB, truy vấn `pgvector`, lấy danh sách mảng ID Tour trả về cho Node.js, Node.js fetch Detail trả cho FE.
- **Request Bất đồng bộ (Streaming AI Chat):** 
  1. FE gửi chuỗi tin nhắn "Tôi muốn đi Sapa" tới Node.js.
  2. Node.js chuyển luồng sang Python.
  3. Python gọi Gemini API (Chế độ `stream=True`).
  4. Mỗi khi Gemini nhả ra 1 chữ (Token), Python đẩy cục đó về lại Node.js.
  5. Node.js dùng **SSE (Server-Sent Events) Pipeline** tuôn thẳng chữ đó về trình duyệt Frontend (cơ chế gõ phím theo thời gian thực), khắc phục triệt để tình trạng Time-out HTTP.

## 4. Chiến lược Chống chịu đứt gãy (Fault Tolerance & Resilience)
Đồ án học thuật thường hay "chết yểu" lúc Demo do sập API 3rd-party. Hệ thống này được xây dựng cơ chế phòng vệ:
1. **Fallback Recommendation (Kế hoạch B):** Nếu Python Service chết hoặc mất mạng, Node.js sẽ bắt được `catch()` và thay vì báo rớt trang, nó tự động query DB lấy **Top 10 Tour được đánh giá cao nhất (Popular Tours)** trả về thay thế.
2. **Circuit Breaker cho Chat:** Nếu Gemini API hết giới hạn Free-Tier, Backend sẽ tự động trả câu hồi đáp lịch sự: *"Hệ thống AI hiện đang nghỉ ngơi đôi chút. Xin vui lòng tham khảo các tour hot dưới đây nhé!"* thay vì quăng lỗi 500 đỏ rực trên UI người dùng.

## 5. Xử lý "Hạt sạn" Backend chuyên sâu (Dành cho Phản biện)
Hệ thống được thiết kế để chống lại 2 lỗ hổng kinh điển của kiến trúc BE:
1. **Hạt sạn Spam Click (Concurrency/Race Condition):** Nếu user cố tình click chuột 100 lần/giây vào 1 Tour để hack đẩy Vector Sở thích.
   - *Giải pháp:* Node.js sẽ áp dụng **Rate Limiting** (giới hạn tần suất) kết hợp **Debouncing** trên API lưu log. Ngoài ra, việc lưu hành vi được đưa vào một **In-memory Queue/Batching** nhỏ trong Node, gom 10 request rồi tống vào Database 1 lần chặn nghẽn cổ chai (bottleneck).
2. **Hạt sạn Giả mạo Gốc (Cross-Origin AI Injection):** Kiến trúc tách rời dễ bị attacker dùng Postman bắn API thẳng vào Node.js để bơm Request rác.
   - *Giải pháp:* Thiết lập **Strict CORS** (chỉ cho phép đích danh Domain của Frontend được truy cập API) và bắt buộc cài Token (JWT Auth Guard) trên mọi endpoint, khoá chết cánh cửa đối với các Client lạ.
