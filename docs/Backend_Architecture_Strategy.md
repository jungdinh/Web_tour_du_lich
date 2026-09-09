# Phân mảng kiến trúc Backend — TourAI

> Cập nhật **07/09/2026**. Đây là mô tả implementation hiện tại, không phải cam kết cho các phần roadmap chưa có trong source.

## 1. Core Web Service — Node.js/Express

Web Service là API gateway và business layer:

- Nhận toàn bộ request từ frontend.
- Xác thực JWT, Google credential, email verification và role admin.
- Validate input bằng Zod, truy vấn PostgreSQL qua parameterized SQL.
- Quản lý tour, search, favorites, actions, reviews, users, booking và payment callback.
- Gọi AI Service qua REST với `X-API-Key`.
- Trả popular tours khi recommendation service lỗi hoặc timeout.

## 2. AI Service — Python/FastAPI

AI Service là lớp tính toán và ngôn ngữ:

- Recommendation bằng tag vector/cosine similarity và ML reranker tùy cấu hình.
- Cold-start từ filter hoặc popular tours.
- Intent/slot và câu trả lời chat; có local/rule-based fallback.
- Cập nhật `user_preferences` từ save/click/search.
- Provider LLM hiện chọn qua `LLM_PROVIDER`: DeepSeek mặc định, Gemini thay thế.

`pgvector` có trong dependency nhưng schema/recommender hiện tại không bắt buộc extension; tính cosine hiện dùng NumPy/scikit-learn.

## 3. Luồng request

### Recommendation

```text
FE → GET /api/recommendations → BE → POST /ai/recommend → AI/DB
                                                   │
                                      lỗi/timeout ──┴→ BE query popular
```

### Chat

```text
FE → POST /api/chat → BE lưu message/context → AI /ai/chat → BE lưu response → FE
```

Chat hiện là request/response REST, chưa có SSE streaming. Vì vậy timeout của cả Web Service và provider cần được theo dõi riêng.

### Payment

```text
FE tạo booking → BE tính giá từ DB → QR/SePay checkout
SePay IPN/webhook → BE kiểm tra payload → cập nhật paid
```

Redirect trình duyệt chỉ dùng để điều hướng UX, không đánh dấu thanh toán thành công.

## 4. Fault tolerance

1. Recommendation: fallback popular tours khi AI service unavailable/timeout.
2. Chat: local/rule-based fallback hoặc thông báo lỗi có kiểm soát khi provider không khả dụng.
3. Booking: chỉ transaction/IPN hợp lệ cập nhật payment; không tin số tiền từ frontend.
4. Review: admin reply tách bảng, không làm nhiễu aggregate/ranking.

## 5. Bảo mật

- Secret chỉ ở environment.
- CORS giới hạn theo `FRONTEND_URLS`.
- Helmet, rate limit và compression bật ở Web Service.
- Admin route yêu cầu JWT + role.
- SePay IPN dùng secret/API key riêng.
- Rich text tour được sanitize ở frontend.

## 6. Hướng mở rộng

- Redis thay in-memory cache.
- Queue/worker cho action và profile update.
- SSE hoặc streaming endpoint nếu cần giảm cảm giác chờ chat.
- API gateway/reverse proxy khi traffic tăng.
