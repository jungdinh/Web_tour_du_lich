# Kiến trúc hệ thống — Hệ thống gợi ý tour du lịch AI

> Cập nhật theo source thực tế ngày **07/09/2026**. Bảng API, migration và checklist triển khai chi tiết hơn nằm trong [`docs/Cap_nhat_du_an.md`](./Cap_nhat_du_an.md).

## 1. Kiến trúc được chọn: Service-Based Architecture

### So sánh các lựa chọn

| Kiến trúc | Phù hợp? | Lý do |
|---|:---:|---|
| Monolith | ❌ | Hệ thống dùng cả TypeScript/Node.js và Python/FastAPI; gộp chung làm giảm ranh giới công nghệ. |
| Microservices | ❌ | Quá nhiều service và hạ tầng cho quy mô đồ án một người. |
| Serverless toàn bộ | ❌ | Recommendation/chat có truy vấn database và phụ thuộc LLM, cần kiểm soát timeout/fallback. |
| MVC/Layered đơn nhất | ⚠️ | Hữu ích trong từng service nhưng không giải quyết việc tách Node.js và Python. |
| **Service-Based** | **✅** | Chỉ có các service lớn, giao tiếp REST, dễ chạy local và dễ deploy riêng. |

Service-Based Architecture cho phép:

- Frontend chỉ biết Web Service.
- Web Service chịu trách nhiệm authentication, validation, CRUD, booking và orchestration.
- AI Service cô lập logic recommendation/LLM và dùng chung PostgreSQL.
- Crawler chạy batch, không làm chậm request của người dùng.

## 2. Sơ đồ triển khai hiện tại

```text
┌──────────────────────────────────────────────────────┐
│              FRONTEND — React/Vite :5174             │
│  Search · Recommendation · Chat · Tour detail · Admin│
└───────────────────────┬──────────────────────────────┘
                        │ REST/JSON
                        ▼
┌──────────────────────────────────────────────────────┐
│           WEB SERVICE — Node.js/Express :3000        │
│ Auth/JWT · CORS · Rate limit · CRUD · Booking/SePay  │
│ Review · Admin · Action logging · AI orchestration   │
└───────────────┬──────────────────────┬───────────────┘
                │ SQL                  │ REST + X-API-Key
                ▼                      ▼
┌────────────────────────┐   ┌─────────────────────────┐
│ PostgreSQL :5432        │   │ AI SERVICE — FastAPI :8000│
│ tours/users/reviews/... │◄──│ ranking · chat · tags    │
└────────────▲───────────┘   └─────────────────────────┘
             │
┌────────────┴─────────────┐
│ CRAWLER / SEED — Python  │
│ batch chuẩn hóa dữ liệu  │
└──────────────────────────┘
```

### Cổng local

| Thành phần | Port |
|---|---:|
| Frontend | `5174` |
| Web Service | `3000` |
| AI Service | `8000` |
| PostgreSQL | `5432` |

`PORT` của backend nên được khai báo rõ trong `.env`. Nếu deploy Railway, Railway có thể inject port runtime.

## 3. Trách nhiệm từng service

### 3.1 Frontend — `web-fe`

- React Router cho home, search, tour detail, chat, profile, favorites, recommendations, admin và payment result.
- Axios API client gắn JWT từ Zustand/local storage.
- Hiển thị gallery, itinerary, schedule, rating 5 sao, review và modal booking.
- Google Identity Services trả credential cho backend xác minh; secret không nằm trong frontend.
- Search dùng nút submit; bộ lọc trong nước/quốc tế, điểm đến, thời lượng và giá được áp dụng khi bấm lọc.
- Trang admin dùng sidebar/list, filter, pagination, modal xác nhận và upload ảnh.
- Chat hiện dùng request/response REST; chưa có SSE streaming.

### 3.2 Web Service — `web-be`

Express là API gateway duy nhất của frontend. Service này:

- Xác thực local/Google, email OTP, JWT, bcrypt, role và `is_active`.
- Đọc/ghi PostgreSQL bằng parameterized query qua `pg`.
- Cung cấp tour/search/favorite/action/review/admin/booking/payment endpoints.
- Gọi AI Service với `AI_SERVICE_URL` và `AI_SERVICE_API_KEY`.
- Có fallback truy vấn tour phổ biến nếu AI recommendation unavailable/timeout.
- Tạo QR VietQR hoặc payload checkout SePay Gateway mà không lộ merchant secret.
- Nhận và xác thực webhook/IPN trước khi đổi trạng thái booking.

### 3.3 AI Service — `ai-service`

FastAPI đảm nhiệm:

- Content-based recommendation bằng tag vector và cosine similarity.
- ML reranker nếu model artifact được bật.
- Cold-start từ filter hoặc tour phổ biến.
- Chat intent/slot, context follow-up, giải thích tour và gợi ý điểm đến.
- Cập nhật `user_preferences` từ hành vi.
- Sinh/lưu tag tour.

Provider LLM được chọn bằng `LLM_PROVIDER`:

- `deepseek`: provider mặc định hiện tại cho câu trả lời tự nhiên.
- `gemini`: provider thay thế nếu cấu hình `GEMINI_API_KEY`.
- Local/rule-based fallback vẫn cần thiết khi provider hết quota, timeout hoặc model không khả dụng.

### 3.4 Crawler — `crawler`

Crawler/seed script đọc JSON crawl từ BestPrice, chuẩn hóa giá/rating/ngày, lưu các trường mở rộng và cập nhật database. BestPrice là nguồn dữ liệu học thuật, không phải thương hiệu sản phẩm trong UI.

Khi seed lại:

- Review nhập khẩu (`user_id IS NULL`) có thể được thay thế.
- Review user (`user_id IS NOT NULL`) được giữ nguyên.
- Aggregate nhập khẩu được lưu ở `imported_avg_rating` và `imported_review_count`.

## 4. Các luồng dữ liệu chính

### 4.1 Gợi ý tour

```text
User mở Recommendations
        │
        ▼
web-fe → GET /api/recommendations
        │ JWT
        ▼
web-be → POST /ai/recommend
        │ user_id + filters + top_k
        ▼
ai-service đọc preferences/tags/tours
        │
        ├─ Không có profile → filter-aware cold-start hoặc popular
        └─ Có profile → vector cosine → ML rerank (nếu bật)
        │
        ▼
web-be trả recommendations về frontend
        │
        └─ AI lỗi/timeout → query popular tours từ PostgreSQL
```

Tour phổ biến và tour gợi ý không phải cùng một danh sách cố định. Popular xếp theo rating/count để phục vụ cold-start; recommendation ưu tiên sự tương đồng với sở thích và filter.

### 4.2 Học từ hành vi

Frontend/backend ghi `user_actions` cho `click`, `view`, `save`, `search`.

- `save`: trọng số `0.70`.
- `click`: trọng số `0.35`.
- `search`: trọng số `0.18`; backend tìm tối đa ba tour khớp query rồi học từ tag.
- `view`: hiện chỉ ghi log, trọng số cập nhật `0.00`.

Web Service gọi `/ai/update-profile` best-effort; nếu AI tạm thời lỗi, hành vi vẫn được lưu để có thể xử lý trong lần sau.

### 4.3 Chat AI

```text
web-fe → POST /api/chat
        │ session_id + message
        ▼
web-be lưu user message
        │ recent context + slots + last recommendations
        ▼
ai-service phân tích intent/slot và gọi provider nếu cần
        │
        ├─ Thiếu dữ liệu → hỏi ngắn gọn phần còn thiếu
        ├─ Có yêu cầu tour → recommendation engine
        └─ Hỏi tour 1/2/lịch trình → dùng last recommendations + payload tour
        ▼
web-be lưu assistant message và trả JSON về frontend
```

Lịch sử được lưu ở `chat_sessions`/`chat_messages`. Context ngắn hạn hiện giữ trong memory của Web Service; khi process restart, database vẫn còn lịch sử nhưng state slot/last recommendation trong memory có thể cần khôi phục từ UI/session.

### 4.4 Review và admin reply

- User đăng nhập gửi review 1–5 sao; backend lưu quy đổi theo thang 10.
- Transaction cập nhật aggregate tour dựa trên thống kê review nhập khẩu và review user.
- User chỉ sửa/xóa review của mình.
- Admin reply đi vào `review_replies`, unique theo `review_id`.
- Reply không được tính như review và không ảnh hưởng rating/count/ranking.

### 4.5 Booking và SePay

```text
User điền form booking
        ▼
POST /api/bookings
        ▼
Backend lấy giá từ DB, tạo pending booking + payment code
        │
        ├─ qr      → trả qr_url VietQR
        └─ gateway → trả form checkout đã ký
        ▼
Frontend hiển thị QR/submit checkout
        ▼
SePay redirect về /payment-result (chỉ UX)
        ▼
SePay IPN/webhook → backend xác thực → booking paid
```

Redirect không được dùng để đánh dấu paid. Các kiểm tra IPN gồm invoice, amount, currency, payment method, status, expiry và transaction id.

### 4.6 Email/Google authentication

- Local registration tạo user chưa verified, hash mã OTP bằng HMAC và gửi qua console/Resend.
- Verify thành công cập nhật `email_verified_at`.
- Google credential được backend verify với `GOOGLE_CLIENT_ID`, sau đó tạo hoặc liên kết `google_sub`.
- JWT là access token hiện tại; chưa có refresh-token endpoint riêng trong flow source hiện tại.

## 5. Mô hình dữ liệu và migration

```text
tours ──< reviews ──1 review_replies
  │          │
  │          └── users (review owner/admin reply)
  ├──< tour_tags
  ├──< favorites >── users
  ├──< user_actions >── users
  └──< bookings ──< payments

users ──< user_preferences
users ──< chat_sessions ──< chat_messages
users ──< email_verification_codes
```

Migration chạy theo thứ tự:

1. `001_initial_schema.sql` — schema nền và index.
2. `002_add_favorites.sql` — favorites.
3. `003_add_bestprice_fields.sql` — dữ liệu mở rộng JSONB/array.
4. `004_admin_user_management.sql` — `is_active`.
5. `005_add_bookings_and_sepay.sql` — booking/payment.
6. `006_email_verification.sql` — email verification.
7. `007_google_auth.sql` — Google auth.
8. `008_user_tour_reviews.sql` — user review.
9. `009_preserve_imported_review_stats.sql` — aggregate crawl.
10. `010_admin_review_replies.sql` — admin reply.

Schema nền không bắt buộc `pgvector`; recommendation hiện dùng NumPy/scikit-learn. `JSONB` được dùng cho itinerary, included/excluded, schedule và transport vì dữ liệu chủ yếu read-mostly và phù hợp phạm vi đồ án.

## 6. Giao tiếp và bảo mật

| Luồng | Giao thức | Bảo vệ |
|---|---|---|
| Frontend → Web Service | HTTP REST/JSON | CORS, JWT khi cần, rate limit |
| Web Service → AI Service | HTTP REST/JSON | `X-API-Key`, timeout |
| Web Service → PostgreSQL | SQL qua `pg` | Parameterized query, secret trong env |
| AI Service → PostgreSQL | SQLAlchemy | `DATABASE_URL` trong env |
| SePay → Web Service | HTTPS webhook/IPN | API key hoặc IPN secret, kiểm tra payload |
| Crawler → PostgreSQL | SQL batch | Chạy ngoài request path |

Các biện pháp đang có:

- `helmet`, `cors`, `compression`, rate limiting ở backend.
- Zod validation cho auth, review, tour admin, booking và IPN.
- Bcrypt cho password; không lưu password plain text.
- Rich text tour được sanitize trước khi render.
- Admin route yêu cầu cả JWT và role `admin`.
- Không đặt `RESEND_API_KEY`, `SEPAY_SECRET_KEY`, `JWT_SECRET` hoặc database password trong `VITE_*`.

## 7. Hiệu năng và khả năng chịu lỗi

- Cache in-memory bằng `node-cache` cho popular, detail và search với TTL cấu hình.
- Danh sách tour/review/admin dùng pagination hoặc giới hạn kết quả.
- AI recommendation fallback về popular tours khi AI Service chết/timeout.
- Slot/intent và câu trả lời có đường fallback local khi LLM lỗi.
- DeepSeek client có timeout khoảng 35 giây; request chat từ Web Service khoảng 30 giây. Đây là điểm cần cân nhắc nếu muốn giảm độ trễ.
- Chat chưa streaming SSE; muốn có typing effect thật cần thiết kế API streaming riêng.
- Khi scale trên khoảng 1.000 user, có thể chuyển cache sang Redis, thêm queue cho action/profile và dùng reverse proxy/API gateway.

## 8. Triển khai

### Local

```text
PostgreSQL → ai-service :8000 → web-be :3000 → web-fe :5174
```

### Production hiện định hướng

- Frontend deploy Vercel.
- Backend và PostgreSQL deploy Railway.
- AI Service phải có network URL mà backend Railway gọi được; nếu AI chạy local thì chỉ dùng cho local development.
- Railway cần chạy migration thủ công; deploy source không tự cập nhật schema.
- `FRONTEND_URLS` phải chứa origin Vercel chính xác, không thêm `/api`.
- SePay IPN cần URL HTTPS public.

## 9. Lộ trình mở rộng

| Mốc | Hướng mở rộng |
|---|---|
| Hiện tại | Service-Based Architecture, PostgreSQL dùng chung, cache memory, fallback local/DB |
| 1.000–10.000 user | Redis, reverse proxy, queue cho action/profile, quan sát latency |
| 10.000–100.000 user | API gateway, worker, autoscaling, tách workload AI |
| Khi sản phẩm thương mại hóa | Cân nhắc SSR/Next.js, quản lý media object storage, audit log và chính sách dữ liệu |

## 10. Kết luận

Kiến trúc hiện tại ưu tiên ranh giới rõ giữa UI, API nghiệp vụ và AI nhưng vẫn đơn giản để một người phát triển, kiểm thử và demo. Những quyết định quan trọng cần giữ ổn định là:

- Frontend không gọi LLM trực tiếp.
- Popular chỉ là cold-start/fallback, không thay thế recommendation cá nhân hóa.
- Customer review và admin reply là hai loại dữ liệu khác nhau.
- Booking chỉ paid sau IPN/webhook hợp lệ.
- Secret chỉ nằm trong environment/deployment platform.
