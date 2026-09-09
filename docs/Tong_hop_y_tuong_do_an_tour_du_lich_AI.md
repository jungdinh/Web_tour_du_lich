# Tổng hợp đồ án tốt nghiệp — Hệ thống gợi ý tour du lịch AI

> Cập nhật theo source thực tế ngày **07/09/2026**.
> Trạng thái: source local đang có thay đổi chưa commit/push.
> Tài liệu kỹ thuật chi tiết: [`Cap_nhat_du_an.md`](./Cap_nhat_du_an.md), [`Kien_truc_he_thong.md`](./Kien_truc_he_thong.md), [`sepay-payment.md`](./sepay-payment.md).

## 1. Tên đề tài và định hướng

**Tên đề tài:**

> Xây dựng hệ thống gợi ý tour du lịch cá nhân hóa ứng dụng AI dựa trên dữ liệu thu thập từ BestPrice.

Trọng tâm của đồ án là **Recommendation Engine**, không phải một website CRUD thông thường. Website TourAI là lớp giao diện để thu thập nhu cầu, ghi nhận hành vi, trình bày kết quả và chứng minh khả năng của hệ thống gợi ý.

Mục tiêu chính:

- Thu thập và chuẩn hóa dữ liệu tour/review tiếng Việt.
- Xây dựng hồ sơ tour và hồ sơ sở thích người dùng.
- Xếp hạng tour theo mức độ phù hợp thay vì chỉ theo giá hoặc độ phổ biến.
- Dùng LLM để hiểu ngôn ngữ tự nhiên và giải thích kết quả, nhưng không giao toàn quyền chọn tour cho LLM.
- Xây dựng đầy đủ luồng sử dụng thực tế: tìm kiếm, chat, yêu thích, review, đặt tour, thanh toán QR và quản trị.

## 2. Bài toán nghiên cứu

### 2.1 Vấn đề

Các website du lịch truyền thống thường yêu cầu người dùng tự chọn bộ lọc cứng như điểm đến, giá, thời lượng và ngày đi. Tuy nhiên, hai người cùng tìm tour Đà Lạt có thể có nhu cầu rất khác nhau:

- Gia đình có trẻ nhỏ ưu tiên lịch trình nhẹ, an toàn và tiện nghi.
- Cặp đôi ưu tiên không gian lãng mạn, chụp ảnh và nghỉ dưỡng.
- Người trẻ ưu tiên khám phá, hoạt động ngoài trời và chi phí thấp.

Chỉ dùng filter không thể hiện đầy đủ mức độ phù hợp này.

### 2.2 Câu hỏi nghiên cứu

> Làm thế nào để xây dựng một hệ thống gợi ý tour du lịch cá nhân hóa từ dữ liệu thu thập trên BestPrice, kết hợp hành vi người dùng, Recommendation Engine và AI hội thoại để đưa ra danh sách tour phù hợp, có thể giải thích?

### 2.3 Điểm khác biệt

- Có dữ liệu tour/review riêng được crawl và chuẩn hóa.
- Có Recommendation Engine tự xây, không chỉ gọi API LLM.
- Học sở thích từ `save`, `click` và `search`.
- Có cold-start/fallback khi user mới hoặc AI provider lỗi.
- Có khả năng giải thích “vì sao chọn tour 1 thay vì tour 2”.
- Có luồng sản phẩm tương đối đầy đủ để demo: auth, admin, review và booking/payment.

## 3. Phạm vi

| Tiêu chí | Phạm vi |
|---|---|
| Người dùng | Người Việt Nam |
| Tour | Trong nước và quốc tế dành cho người Việt |
| Ngôn ngữ | Tiếng Việt |
| Tiền tệ | VND |
| Review crawl | Ưu tiên review có ngôn ngữ chủ đạo là tiếng Việt |
| Nguồn crawl hiện tại | BestPrice |
| Recommendation | Content-Based Filtering; chưa dùng Collaborative Filtering |
| Thanh toán | Quét QR/chuyển khoản qua SePay; thẻ/ví khác ngoài phạm vi hiện tại |

## 4. Kiến trúc hệ thống hiện tại

Hệ thống chọn **Service-Based Architecture** để tách web và AI nhưng không tạo quá nhiều microservice.

```text
┌──────────────────────────────────────────────────────┐
│              FRONTEND — React/Vite :5174             │
│ Home · Search · Chat · Tour detail · Profile · Admin │
└───────────────────────┬──────────────────────────────┘
                        │ REST/JSON
                        ▼
┌──────────────────────────────────────────────────────┐
│          WEB SERVICE — Node.js/Express :3000         │
│ Auth · CRUD · Review · Booking · Payment · AI gateway│
└───────────────┬──────────────────────┬───────────────┘
                │ SQL                  │ REST + X-API-Key
                ▼                      ▼
┌────────────────────────┐   ┌─────────────────────────┐
│ PostgreSQL :5432        │◄──│ AI SERVICE :8000       │
│ tours/users/reviews/... │   │ FastAPI · Rank · Chat  │
└────────────▲───────────┘   └─────────────────────────┘
             │
┌────────────┴─────────────┐
│ CRAWLER/SEED — Python    │
│ BestPrice JSON → DB      │
└──────────────────────────┘
```

| Thành phần | Công nghệ | Trách nhiệm |
|---|---|---|
| `web-fe` | React 18, Vite, TypeScript, Zustand | UI, routing, state auth, API client |
| `web-be` | Node.js, Express, TypeScript, `pg` | REST API, JWT, validation, CRUD, payment callback |
| `ai-service` | FastAPI, SQLAlchemy, NumPy, scikit-learn | Recommendation, intent/slot, chat, tag/profile |
| PostgreSQL | PostgreSQL | Dữ liệu dùng chung |
| `crawler` | Python, Playwright/BeautifulSoup, seed scripts | Crawl, normalize và upsert dữ liệu |

Nguyên tắc kiến trúc:

- Frontend không gọi trực tiếp AI Service hoặc LLM provider.
- Web Service là API gateway duy nhất của frontend.
- AI Service dùng `X-API-Key` nội bộ.
- Secret chỉ nằm trong `.env`/Vercel/Railway, không nằm trong bundle frontend.
- Crawler chạy batch, không tham gia request path của người dùng.

## 5. Vai trò của LLM và Recommendation Engine

### 5.1 LLM

LLM chịu trách nhiệm:

- Hiểu câu tiếng Việt tự nhiên.
- Nhận diện intent và thông tin chuyến đi.
- Hỏi bổ sung khi thật sự cần.
- Viết lời giải thích tự nhiên dựa trên tour đã được engine chọn.
- Trả lời câu hỏi theo ngữ cảnh như “tour 1 có gì hay?”, “so sánh tour 1 và 2”, “lịch trình từng ngày”.

LLM **không phải nguồn dữ liệu tour** và **không tự quyết định toàn bộ thứ hạng**.

Provider hiện tại:

- DeepSeek là provider mặc định qua `LLM_PROVIDER=deepseek`.
- Gemini vẫn được giữ làm provider thay thế khi cấu hình `LLM_PROVIDER=gemini`.
- Không giả định hệ thống tự động đổi chéo DeepSeek↔Gemini trong mọi trường hợp quota.
- Intent/slot và câu trả lời có fallback local/rule-based khi provider timeout hoặc không khả dụng.

### 5.2 Recommendation Engine

Recommendation Engine chịu trách nhiệm:

- Đọc hồ sơ sở thích và tag tour.
- Áp dụng filter về điểm đến, giá, thời lượng.
- Tính cosine similarity.
- Xếp hạng Top-N và có thể dùng ML reranker nếu artifact được bật.
- Trả tour phổ biến trong cold-start hoặc fallback.

## 6. Dữ liệu và đạo đức dữ liệu

### 6.1 Nguồn dữ liệu

Nguồn crawl hiện tại là BestPrice, gồm:

- Tên tour, điểm đến, giá và giá gốc.
- Thời lượng, điểm khởi hành/phương tiện.
- Mô tả, highlights, địa danh, chủ đề.
- Gallery, itinerary, included/excluded, schedule.
- Rating tổng, số review và review tiếng Việt khi có.

BestPrice chỉ là **nguồn dữ liệu học thuật**, không phải thương hiệu hiển thị của TourAI. Tour do admin tạo có source `tourai`.

### 6.2 Chuẩn hóa

- Giá được chuyển về số nguyên VND.
- Rating được chuẩn hóa theo thang 10 trong database.
- UI chuyển rating sang thang 5 sao.
- Tour có số ngày bằng 0 được chuẩn hóa tối thiểu thành 1 ngày.
- Dữ liệu mở rộng được lưu bằng `TEXT[]` hoặc `JSONB`.
- Khi recrawl, review user được giữ; chỉ review nhập khẩu được thay thế.
- Aggregate crawl được lưu riêng ở `imported_avg_rating` và `imported_review_count`.

### 6.3 Cam kết sử dụng

- Dữ liệu chỉ phục vụ nghiên cứu/học thuật.
- Không tái phân phối hoặc thương mại hóa dữ liệu crawl.
- Hạn chế lưu dữ liệu cá nhân không cần thiết từ review nguồn.
- Không đưa email, hành vi hoặc secret người dùng vào prompt/log công khai.

## 7. Tag Taxonomy và hồ sơ tour

Hệ thống sử dụng 21 tag cố định để tạo không gian đặc trưng có thể giải thích:

| Nhóm | Tag |
|---|---|
| Đối tượng | `family`, `romantic` |
| Phong cách | `adventure`, `relax`, `spiritual` |
| Cảnh quan | `beach`, `mountain`, `nature`, `city` |
| Trải nghiệm | `culture`, `history`, `festival`, `photography`, `wildlife`, `cruise`, `nightlife`, `water_sports` |
| Ăn uống/mua sắm | `food`, `shopping` |
| Giá | `budget`, `luxury` |

Mỗi tour có vector trọng số:

```text
TourVector = [family, romantic, adventure, ..., water_sports]
```

Nguồn tạo tag:

- Tag đã lưu trong `tour_tags`.
- Review và metadata tour.
- Description/highlights/places/topics làm fallback cho tour ít review.

Tour mới hoặc ít review không bị loại hoàn toàn; hệ thống có thể suy luận tag từ metadata để giải quyết new-item cold-start.

## 8. Hồ sơ người dùng và implicit feedback

Hồ sơ người dùng nằm trong `user_preferences`, cùng không gian 21 tag với tour.

Nguồn tín hiệu hiện tại:

| Hành vi | Trọng số cập nhật | Ý nghĩa |
|---|---:|---|
| `save`/favorite | `0.70` | Tín hiệu quan tâm mạnh nhất |
| `click` | `0.35` | Người dùng chủ động xem tour |
| `search` | `0.18` | Quan tâm tới điểm đến/chủ đề đang tìm |
| `view` | `0.00` | Hiện chỉ ghi log, chưa tăng preference |

Khi user search, backend chuẩn hóa từ khóa không dấu, tìm tối đa ba tour liên quan theo tên/điểm đến rồi học từ tag của các tour đó.

Preference được cập nhật theo EMA để tăng dần nhưng không vượt quá 1:

```text
new_weight = old_weight + action_weight × tour_tag_weight × (1 - old_weight)
```

## 9. Thuật toán gợi ý

### 9.1 Content-Based Filtering

User và tour được biểu diễn thành vector trong cùng không gian tag. Độ phù hợp dùng cosine similarity:

```text
cosine(U, T) = (U · T) / (||U|| × ||T||)
```

- Điểm gần 1: hướng sở thích gần nhau, phù hợp cao.
- Điểm gần 0: ít tương đồng.

Lý do chọn:

- Không cần lượng user lớn như Collaborative Filtering.
- Phù hợp dữ liệu hiện có.
- Có thể giải thích theo tag.
- Dễ kiểm thử bằng kịch bản sở thích giả lập.

### 9.2 Luồng xếp hạng

```text
Request user + filter
        ▼
Đọc user_preferences
        │
        ├─ Có profile → cosine similarity
        └─ Chưa có → preference từ filter hoặc popular
        ▼
Áp dụng ML reranker nếu model artifact sẵn sàng
        ▼
Top-N tours + score + dữ liệu giải thích
```

### 9.3 Tour phổ biến và tour gợi ý

| Loại | Cách xếp | Khi sử dụng |
|---|---|---|
| Tour phổ biến | `avg_rating` giảm dần, sau đó `review_count` | Trang popular, cold-start, fallback AI |
| Tour gợi ý | Similarity tag + filter + reranker | User có sở thích hoặc yêu cầu rõ |

Hai danh sách có thể trùng một phần vì tour tốt/phổ biến cũng có thể phù hợp, nhưng logic tạo danh sách là khác nhau.

### 9.4 Cold-start và filter bubble

**User mới:**

- Nếu có filter/chat request, tạo preference tạm từ điểm đến, tag, budget.
- Nếu chưa có tín hiệu, trả tour phổ biến.

**Tour mới:**

- Suy luận tag từ mô tả/lịch trình/metadata khi chưa đủ review.

**Filter bubble:**

- Giữ một tỷ lệ exploration trong ranking.
- Cho phép user đổi filter và bắt đầu cuộc chat/tìm kiếm mới.
- Có thể mở rộng diversity score trong giai đoạn đánh giá.

## 10. Chat AI và quản lý ngữ cảnh

### 10.1 Luồng chat

```text
User message
    ▼
Web Service lưu vào chat_messages
    ▼
Gửi current_slots + last_recommendations + recent_messages
    ▼
AI Service phân tích intent/slot
    │
    ├─ Câu hỏi theo context → trả lời từ tour đã gợi ý
    ├─ Tìm tour mới → chạy recommendation
    └─ Thiếu thông tin thật sự → hỏi bổ sung ngắn gọn
    ▼
Web Service lưu assistant message và trả JSON
```

### 10.2 Ngữ cảnh tour

Payload recommendation chứa thêm:

- `description`, `highlights`, `places`, `topics`.
- `itinerary` theo ngày.
- `included`, `excluded`.
- `schedule`, `transport`.
- Giá, thời lượng, rating và review count.

Nhờ vậy chatbot có thể trả lời từ dữ liệu tour thay vì tự đoán. Nếu dữ liệu khách sạn hoặc chi tiết nào không có, bot phải nói rõ chưa có dữ liệu và hướng dẫn user xác nhận với đơn vị tổ chức.

### 10.3 Giới hạn hiện tại

- Chat dùng REST request/response, chưa có SSE streaming.
- Web Service timeout request chat khoảng 30 giây; DeepSeek client khoảng 35 giây.
- Context slot/last recommendation được giữ ngắn hạn trong memory; message history vẫn được lưu database.
- LLM có thể hết quota/timeout nên fallback local là bắt buộc.

## 11. Chức năng sản phẩm đã triển khai

### 11.1 Tìm kiếm và khám phá

- Search chỉ chạy khi bấm nút hoặc chọn quick suggestion, không chạy theo mỗi ký tự.
- Backend bỏ dấu và lowercase để tìm gần đúng: `phan thiet` có thể khớp `Phan Thiết`.
- Mặc định hiển thị tour trong nước; có toggle quốc tế.
- Toggle trong nước/quốc tế áp dụng ngay; điểm đến, thời lượng và giá áp dụng bằng nút lọc.
- Danh sách có sort, pagination, skeleton và empty state.

### 11.2 Tour detail và favorite

- Gallery nhiều ảnh, ảnh fallback.
- Mô tả rich text được sanitize.
- Lịch trình từng ngày, ảnh/bữa ăn, highlights và places/topics.
- Included/excluded, schedule, transport và suy luận điểm khởi hành.
- Save/remove favorite; save được dùng làm tín hiệu mạnh cho recommender.

### 11.3 Authentication

- Đăng ký email/mật khẩu.
- Gửi OTP 6 chữ số qua console ở local hoặc Resend ở production.
- Hash OTP, có thời hạn và rate limit gửi lại.
- Chỉ email verified mới đăng nhập local.
- Đăng nhập Google qua Google Identity Services + verify ID token ở backend.
- JWT + bcrypt; tài khoản có role và trạng thái `is_active`.

### 11.4 Review và phản hồi admin

- Review user nhập 1–5 sao; backend lưu quy đổi thang 10.
- Một user chỉ có một review cho mỗi tour.
- User chỉ sửa/xóa review của mình.
- User không reply review của nhau.
- Admin được tạo/sửa/xóa một reply chính thức cho mỗi review.
- Reply admin lưu ở `review_replies`, không ảnh hưởng `avg_rating`, `review_count`, tag hoặc recommendation.
- Review crawl và review TourAI được gắn nhãn nguồn khác nhau trên UI.

### 11.5 Booking và SePay QR

- User chọn một ngày khởi hành trong danh sách các ngày tương lai còn mở, sau đó nhập số khách, họ tên, email, điện thoại và ghi chú.
- Admin có thể thêm nhiều ngày khởi hành tương lai cho mỗi tour; ngày hôm nay, ngày đã qua và ngày trùng bị từ chối.
- API user/admin đều ẩn lịch đã qua; dữ liệu lịch cũ vẫn có thể được giữ trong JSONB để không ảnh hưởng booking lịch sử.
- Backend xác thực ngày đã chọn thuộc đúng tour và còn mở, lấy giá theo dòng lịch khởi hành rồi tự tính tổng.
- Booking có mã booking, mã thanh toán, expiry và trạng thái.
- `SEPAY_PAYMENT_MODE=qr`: hiển thị VietQR trực tiếp.
- `SEPAY_PAYMENT_MODE=gateway`: dùng `sepay-pg-node`, checkout chỉ cho `BANK_TRANSFER`.
- `/payment-result` polling trạng thái booking sau redirect.
- Chỉ IPN/webhook hợp lệ mới đánh dấu `paid`; redirect không phải bằng chứng thanh toán.
- Hiện đã kiểm tra được luồng tạo booking/hiển thị QR; thanh toán ngân hàng thật được để lại cho bước cấu hình tài khoản và webhook public.

### 11.6 Admin dashboard

- Sidebar cổ điển: Tổng quan, Quản lý tour, Người dùng.
- Tour hiển thị dạng card/list, hover có sửa/xóa, mặc định mới nhất trước.
- Filter theo từ khóa, loại trong nước/quốc tế, điểm đến, giá và số ngày.
- Pagination dùng nút trước/sau và nhập số trang.
- Upload JPG/PNG/WEBP tối đa 5 MB; gallery tối đa 12 ảnh theo validation backend.
- Tạo/sửa tour với rich text và dữ liệu mở rộng.
- Trường bắt buộc: tên, điểm đến, giá, số ngày, mùa/nhóm, mô tả, gallery.
- Trường tùy chọn: giá gốc, duration label, highlights, places, topics, itinerary, included/excluded, schedule, transport.
- Quản lý user: tìm kiếm, role, trạng thái, chi tiết favorite/review/chat count, khóa/mở khóa và xóa.
- Không có tab quản lý/xóa review riêng; admin reply tại tour detail.
- Không hiển thị lịch sử search/action chi tiết trong hồ sơ user admin, chỉ giữ số đếm cần thiết để hạn chế xâm phạm riêng tư.

## 12. Database và migration

Các bảng hiện tại:

- `tours`, `reviews`, `review_replies`, `tour_tags`.
- `users`, `email_verification_codes`.
- `user_preferences`, `user_actions`, `favorites`.
- `chat_sessions`, `chat_messages`.
- `bookings`, `payments`.

| Migration | Nội dung |
|---|---|
| `001_initial_schema.sql` | Schema nền và index |
| `002_add_favorites.sql` | Favorites |
| `003_add_bestprice_fields.sql` | Gallery, itinerary, schedule, transport và fields crawl |
| `004_admin_user_management.sql` | `users.is_active` |
| `005_add_bookings_and_sepay.sql` | Booking/payment |
| `006_email_verification.sql` | Email verification |
| `007_google_auth.sql` | Google auth |
| `008_user_tour_reviews.sql` | Review gắn user |
| `009_preserve_imported_review_stats.sql` | Aggregate review crawl |
| `010_admin_review_replies.sql` | Reply chính thức của admin |

Migration phải chạy theo thứ tự. Push source lên GitHub hoặc deploy Railway không tự chạy SQL.

`pgvector` là hướng tối ưu tùy chọn; schema nền hiện comment lệnh tạo extension và recommender đang dùng NumPy/scikit-learn, vì vậy không được mô tả pgvector là điều kiện bắt buộc của bản hiện tại.

## 13. API chính

### 13.1 Web Service — port 3000

| Nhóm | Endpoint chính |
|---|---|
| Auth | `/api/auth/register`, `/login`, `/google`, `/verify-email`, `/resend-verification`, `/profile` |
| Tour | `/api/tours`, `/popular`, `/destinations`, `/search`, `/:id` |
| Review | `/api/tours/:id/reviews`, `/reviews/me`, `/:reviewId`, `/:reviewId/reply` |
| Recommendation | `/api/recommendations` |
| Action | `/api/actions`, `/api/actions/history` |
| Favorite | `/api/favorites`, `/check/:tour_id`, `/:tour_id` |
| Chat | `/api/chat`, `/api/chat/history` |
| Booking | `/api/bookings`, `/api/bookings/:id`, `/:id/cancel` |
| Payment | `/api/payments/sepay/webhook`, `/api/payments/sepay/ipn` |
| Admin | `/api/admin/dashboard`, `/tours`, `/tours/image`, `/users` và route detail/role/status/delete |
| Health | `/health` |

### 13.2 AI Service — port 8000

- `GET /health`.
- `POST /ai/recommend`.
- `POST /ai/chat`.
- `GET /ai/destinations/suggest`.
- `POST /ai/generate-tags`.
- `POST /ai/update-profile`.
- `GET /ai/explain/{tour_id}`.

Các endpoint AI ngoài health yêu cầu `X-API-Key`.

## 14. Giao diện và route frontend

| Trang | Route | Chức năng |
|---|---|---|
| Trang chủ | `/` | Popular và personalized recommendations |
| Khám phá | `/search` | Search, filter, sort, pagination |
| Chi tiết tour | `/tours/:id` | Nội dung tour, favorite, review, booking |
| Chat AI | `/chat` | Hội thoại và card tour |
| Đăng nhập | `/login` | Email/password và Google |
| Đăng ký | `/register` | Đăng ký và OTP verification |
| Hồ sơ | `/profile` | Thông tin user |
| Yêu thích | `/favorites` | Tour đã lưu |
| Gợi ý | `/recommendations` | Danh sách cá nhân hóa |
| Admin | `/admin` | Dashboard, tour, user |
| Kết quả thanh toán | `/payment-result` | Theo dõi trạng thái SePay |

## 15. Biến môi trường và deploy

### 15.1 Backend/Railway

- `DATABASE_URL`, `PORT`, `NODE_ENV`.
- `JWT_SECRET`, thời hạn token.
- `AI_SERVICE_URL`, `AI_SERVICE_API_KEY`.
- `FRONTEND_URL`, `FRONTEND_URLS`, `TRUST_PROXY`.
- `EMAIL_PROVIDER`, `RESEND_API_KEY`, `MAIL_FROM`, verification secret/expiry.
- `GOOGLE_CLIENT_ID`.
- Admin seed variables.
- SePay QR/Gateway/IPN variables.

### 15.2 Frontend/Vercel

- `VITE_API_URL` hoặc `VITE_API_BASE_URL`.
- `VITE_GOOGLE_CLIENT_ID`.

Không đưa secret vào biến `VITE_*` vì giá trị sẽ xuất hiện trong browser bundle.

### 15.3 AI Service

- `DATABASE_URL`.
- `API_KEY` phải khớp `AI_SERVICE_API_KEY` của Web Service.
- `LLM_PROVIDER`.
- `DEEPSEEK_*` hoặc `GEMINI_*`.

Mô hình deploy đã sử dụng:

- Frontend: Vercel.
- Backend và PostgreSQL: Railway.
- AI Service phải có URL mà backend truy cập được; local dùng `http://localhost:8000`.
- SePay IPN/webhook thật cần URL backend public HTTPS.

## 16. Kiểm thử và đánh giá

### 16.1 Xác minh kỹ thuật đã thực hiện

- Backend build: `npm run build` thành công.
- Frontend build: `npm run build` thành công.
- Migration `010_admin_review_replies.sql` đã áp dụng local.
- User thường reply review bị từ chối `403`.
- Admin tạo/sửa/xóa reply thành công.
- Review list public trả nested `admin_reply`.
- Rating/count tour không đổi khi admin reply.
- `git diff --check` pass.

### 16.2 Kịch bản chức năng cần duy trì

1. Search `phan thiet` tìm được `Phan Thiết` và chỉ chạy khi submit.
2. Toggle trong nước không trả tour quốc tế đã nhận diện.
3. User mới nhận popular/filter-aware cold-start.
4. User save/click/search nhiều về Đà Lạt làm profile tăng tag liên quan.
5. Chat trả lời tour 1/2 đúng điểm đến và dùng itinerary khi có.
6. OTP local/Resend, Google login và account lock hoạt động.
7. Review owner CRUD; user khác không sửa/xóa/reply.
8. Admin reply không đổi aggregate.
9. Booking tạo đúng tổng tiền và expiry.
10. Payment chỉ paid sau webhook/IPN hợp lệ.

### 16.3 Đánh giá Recommendation Engine cho báo cáo

Các metric đề xuất:

| Metric | Mục đích |
|---|---|
| Precision@K | Tỷ lệ tour phù hợp trong Top-K |
| Recall@K | Khả năng lấy đủ tour phù hợp |
| Hit Rate@K | Có ít nhất một lựa chọn đúng trong Top-K |
| NDCG@K | Đánh giá chất lượng thứ tự xếp hạng |
| Coverage | Mức độ phủ catalog |
| Diversity | Tránh Top-K quá giống nhau |
| Latency | Thời gian recommendation/chat |

Thiết kế bộ test offline:

- Tạo nhiều persona: gia đình, cặp đôi, budget, luxury, adventure.
- Định nghĩa ground truth tag/filter cho từng persona.
- So sánh popular baseline với personalized ranking.
- Đánh giá thêm cold-start và độ ổn định khi LLM provider lỗi.

## 17. Tiến độ thực hiện

| Giai đoạn | Trạng thái | Kết quả |
|---|---|---|
| Khảo sát và thiết kế | Hoàn thành | Kiến trúc, scope, taxonomy, schema |
| Crawler và dữ liệu | Hoàn thành chức năng chính | Crawl/seed BestPrice, normalize, preserve review user |
| AI và tag | Hoàn thành chức năng chính | DeepSeek/Gemini provider, slot/intent, tag fallback |
| Recommendation Engine | Hoàn thành chức năng chính | Cosine, cold-start, behavior weights, ML reranker hook |
| Website người dùng | Hoàn thành chức năng chính | Search, detail, chat, auth, favorite, recommendation |
| Admin | Hoàn thành chức năng chính | Tour/user dashboard và role/status |
| Review | Hoàn thành | Owner CRUD và admin-only reply |
| Booking/SePay | Hoàn thành luồng code/UI; chưa chốt giao dịch thật | QR, Gateway, IPN, payment result |
| Deployment | Đã triển khai FE/BE/DB; cần duy trì env/migration | Vercel + Railway |
| Đánh giá và báo cáo | Đang thực hiện | Cập nhật tài liệu, chuẩn bị metric/test dataset |

## 18. Điểm mạnh của đồ án

- Phân tách rõ LLM và Recommendation Engine.
- Dùng dữ liệu riêng và có pipeline recrawl an toàn cho review user.
- Recommendation có thể giải thích theo tag/hành vi.
- Có cold-start/fallback, giảm phụ thuộc hoàn toàn vào quota LLM.
- Có đầy đủ luồng sản phẩm để demo end-to-end.
- Review admin reply được thiết kế không làm nhiễu dữ liệu ranking.
- Payment không tin frontend/redirect, tuân thủ nguyên tắc xác nhận server-to-server.

## 19. Giới hạn và hướng mở rộng

### Giới hạn hiện tại

- Chưa có đủ interaction data để triển khai Collaborative Filtering đáng tin cậy.
- Chưa có bộ benchmark/ground truth lớn cho đánh giá offline.
- Chat chưa streaming; provider có thể chậm hoặc hết quota.
- Context ngắn hạn đang giữ trong memory của Web Service.
- Phân loại trong nước/quốc tế hiện dựa keyword/destination list, cần taxonomy địa lý chuẩn hơn.
- Upload ảnh backend local filesystem chưa phù hợp khi scale/deploy stateless; nên dùng object storage.
- Thanh toán thật cần tài khoản SePay/ngân hàng, IPN public và kiểm thử sandbox/production.
- Sender Resend cần verified domain để gửi email tùy ý, không chỉ email tài khoản test.

### Hướng mở rộng

- Hybrid Recommendation khi có nhiều booking/click/rating thật.
- Diversity reranking và explainability chi tiết hơn.
- Redis cho cache/context, queue cho profile update.
- SSE/streaming chat và theo dõi latency/LLM cost.
- Object storage cho gallery.
- Audit log, chính sách privacy và phân quyền admin chi tiết.
- SSR/Next.js nếu cần SEO và thương mại hóa.

## 20. Mapping code và tài liệu

| Nhóm | File chính |
|---|---|
| Recommendation | `ai-service/app/engine/engine_db.py`, `ai-service/app/engine/ml_ranker.py` |
| Chat | `ai-service/app/llm/conversation_agent.py`, `ai-service/app/main.py`, `web-be/src/controllers/chat.ts` |
| Search/action | `web-be/src/controllers/tours.ts`, `web-be/src/controllers/actions.ts`, `web-fe/src/pages/Search.tsx` |
| Auth | `web-be/src/controllers/auth.ts`, `web-be/src/services/email.ts`, `web-fe/src/pages/Login.tsx`, `Register.tsx` |
| Admin | `web-be/src/controllers/admin.ts`, `web-fe/src/pages/Admin.tsx` |
| Review | `web-be/src/controllers/tours.ts`, `web-fe/src/components/TourReviews.tsx`, migrations `008–010` |
| Booking/SePay | `web-be/src/controllers/bookings.ts`, `web-be/src/services/sepay.ts`, `web-fe/src/pages/TourDetail.tsx`, `PaymentResult.tsx` |
| Crawler | `crawler/seed_from_bestprice_json.py` |

Tài liệu liên quan:

- `README.md`: hướng dẫn chạy nhanh.
- `docs/Cap_nhat_du_an.md`: API, migration, deploy, validation.
- `docs/Kien_truc_he_thong.md`: kiến trúc và luồng dữ liệu.
- `docs/sepay-payment.md`: cấu hình thanh toán.
- `CLAUDE.md`: context kỹ thuật cho lần phát triển tiếp theo.

## 21. Trạng thái Git tại thời điểm cập nhật

- Các thay đổi chức năng và tài liệu đang ở working tree local.
- Chưa commit và chưa push.
- Không được add các file `.env`, log, build artifact hoặc secret.
- Trước khi push cần xem `git status`, `git diff --check`, build backend/frontend và kiểm tra danh sách file staged.
