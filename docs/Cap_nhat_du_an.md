# Cập nhật trạng thái dự án TourAI

> Ngày cập nhật: **07/09/2026**  
> Phạm vi: source hiện tại trong working tree, trước khi commit và push.  
> Đây là tài liệu mô tả trạng thái triển khai thực tế; các ý tưởng/roadmap chưa có trong source được ghi rõ là chưa triển khai.

## 1. Tổng quan

TourAI là hệ thống tìm kiếm, gợi ý và tư vấn tour du lịch bằng tiếng Việt. Hệ thống gồm giao diện React, Web Service Express, AI Service FastAPI, PostgreSQL và crawler dữ liệu tour.

Các nhóm chức năng hiện có:

- Khám phá tour: danh sách, tìm kiếm gần đúng không phân biệt dấu, lọc trong nước/quốc tế, giá và thời lượng.
- Gợi ý cá nhân hóa: kết hợp hồ sơ sở thích, hành vi lưu/click/search và bộ xếp hạng tour.
- Chat AI: trích xuất ý định/thông tin chuyến đi, duy trì ngữ cảnh và trả lời tự nhiên dựa trên danh sách tour/lịch trình.
- Tài khoản: đăng ký bằng email có mã xác minh, đăng nhập mật khẩu, đăng nhập Google và JWT.
- Tour detail: gallery, mô tả rich text, lịch trình từng ngày, lịch khởi hành, dịch vụ bao gồm/không bao gồm, yêu thích và review.
- Đặt tour: tạo booking, hiển thị QR VietQR hoặc chuyển sang checkout QR của SePay.
- Quản trị: dashboard, CRUD tour, upload ảnh, quản lý người dùng và phân quyền.
- Review: khách hàng tự viết/sửa/xóa review của mình; chỉ admin được trả lời chính thức.

## 2. Kiến trúc thực tế

```text
React/Vite (web-fe :5174)
            │ REST/JSON
            ▼
Express/TypeScript (web-be :3000)
       │                 │
       │                 └── PostgreSQL :5432
       │
       └── REST nội bộ + X-API-Key
                         ▼
                 FastAPI (ai-service :8000)

Crawler Python ───────────────► PostgreSQL
```

| Thành phần | Công nghệ | Trách nhiệm chính | Cổng local |
|---|---|---|---:|
| `web-fe` | React 18, Vite, TypeScript, Zustand | UI, routing, trạng thái đăng nhập, gọi REST API | `5174` |
| `web-be` | Node.js, Express, TypeScript, `pg` | Auth, validation, CRUD, booking, payment callback, gọi AI | `3000` |
| `ai-service` | Python, FastAPI, SQLAlchemy, NumPy, scikit-learn | Recommendation Engine, chat, slot/intent, tag và profile | `8000` |
| PostgreSQL | PostgreSQL | Dữ liệu tour, tài khoản, hành vi, review, booking | `5432` |
| `crawler` | Python, Playwright/BeautifulSoup và script seed | Chuẩn hóa dữ liệu crawl và ghi vào database | batch job |

Các nguyên tắc biên:

- Frontend không gọi trực tiếp AI Service; mọi request đi qua Web Service.
- AI Service được bảo vệ bằng header `X-API-Key`; không đưa API key LLM vào frontend.
- Web Service dùng SQL parameterized query qua `pg`; AI Service dùng SQLAlchemy.
- Crawler chạy độc lập, không nằm trong request path của người dùng.

## 3. Chức năng người dùng

### 3.1 Khám phá và tìm kiếm tour

- Trang chủ có khu vực tour phổ biến và tour gợi ý cá nhân hóa.
- Ô tìm kiếm chỉ gửi request khi người dùng bấm **Tìm kiếm** hoặc chọn gợi ý nhanh; việc gõ chữ không tự gọi API.
- Tìm kiếm chuẩn hóa Unicode, bỏ dấu tiếng Việt và chuyển về chữ thường. Vì vậy các truy vấn như `phan thiet` và `Phan Thiết` có thể tìm cùng nhóm dữ liệu.
- Bộ lọc có hai lựa chọn **Trong nước** và **Quốc tế**, mặc định là trong nước.
- Nút **Trong nước/Quốc tế** chuyển loại tour ngay; các bộ lọc điểm đến, thời lượng và khoảng giá chỉ áp dụng khi bấm **Lọc kết quả**.
- Danh sách tour có phân trang, sắp xếp theo phổ biến/giá/đánh giá ở phía giao diện.
- Phân loại quốc tế dựa trên danh sách điểm đến và keyword đã cấu hình trong backend; các tour có tên như `tour hè`, `tour 2/9`, `tour no shopping`, `tour tự túc` được xử lý theo danh sách phân loại hiện tại.
- `BestPrice` chỉ là nguồn dữ liệu crawl. Tour do admin tạo được lưu với source `tourai`; không dùng tên nguồn crawl làm thương hiệu trên UI.

### 3.2 Gợi ý tour và tour phổ biến

Hai khái niệm này được tách riêng:

| Loại | Cách chọn | Mục đích |
|---|---|---|
| Tour phổ biến | Xếp theo `avg_rating`, sau đó `review_count` và lấy nhóm đầu | Cold-start hoặc fallback khi chưa biết sở thích/ngắt kết nối AI |
| Tour gợi ý | Xây hồ sơ sở thích, tính tương đồng tag, sau đó có thể qua ML reranker và bộ lọc | Cá nhân hóa theo người dùng và yêu cầu chuyến đi |

Luồng gợi ý hiện tại:

1. Web Service nhận `user_id`, `top` và các filter như điểm đến, giá, thời lượng.
2. AI Service đọc `user_preferences`.
3. Nếu người dùng chưa có preference, hệ thống tạo preference tạm từ filter; nếu vẫn không đủ tín hiệu thì trả tour phổ biến.
4. Nếu có preference, hệ thống biểu diễn tag của user/tour thành vector và tính cosine similarity; ML reranker được dùng khi artifact đã bật.
5. Nếu AI Service lỗi, timeout hoặc trả `503`, Web Service truy vấn tour phổ biến từ PostgreSQL làm fallback.

Tín hiệu hành vi đang được ưu tiên theo trọng số cập nhật preference:

| Hành vi | Trọng số |
|---|---:|
| `save`/yêu thích | `0.70` |
| `click` | `0.35` |
| `search` | `0.18` |
| `view` | `0.00` |

Khi người dùng search, backend tìm tối đa ba tour liên quan theo tên/điểm đến rồi cập nhật profile từ tag của những tour đó. Đây là lý do search nhiều về một nơi có thể ảnh hưởng gợi ý sau này, nhưng kết quả vẫn chịu ảnh hưởng bởi filter và dữ liệu tag.

### 3.3 Chat AI

- Chat yêu cầu người dùng đăng nhập.
- Web Service lưu `chat_sessions` và `chat_messages`, đồng thời giữ một phần ngữ cảnh gần nhất trong bộ nhớ để xử lý các câu như “tour 1”, “so sánh tour 1 và 2” hoặc “lịch trình từng ngày”.
- AI Service hỗ trợ các intent như tìm tour mới, hỏi về tour đang gợi ý và so sánh các lựa chọn.
- Slot/intent có đường fallback local/rule-based khi LLM không phản hồi; không nên coi LLM là nguồn dữ liệu tour duy nhất.
- Khi đủ thông tin, recommendation engine chọn tour; LLM chủ yếu viết lời giải thích tự nhiên dựa trên dữ liệu tour đã có.
- Dữ liệu `itinerary`, `included`, `excluded`, `schedule` và `transport` được đưa vào payload tour để AI có cơ sở trả lời câu hỏi chi tiết.
- Endpoint chat hiện là request/response REST, chưa phải SSE streaming. Vì vậy độ trễ phụ thuộc vào AI provider và timeout của Web Service.

Provider LLM được chọn qua `LLM_PROVIDER`:

- Mặc định hiện tại: DeepSeek (`DEEPSEEK_*`).
- Gemini vẫn được hỗ trợ như provider thay thế (`GEMINI_*`).
- Đây là lựa chọn theo cấu hình, không phải cơ chế tự động đổi provider chéo trong mọi lỗi quota.
- DeepSeek client có timeout nội bộ khoảng 35 giây; Web Service forward request chat với timeout khoảng 30 giây. Đây là giới hạn cần lưu ý khi điều chỉnh hiệu năng.
- Khi provider hết quota/model không khả dụng, code dùng fallback local hoặc fallback nội dung; recommendation endpoint còn có fallback sang tour phổ biến.

### 3.4 Tài khoản và xác thực

- Đăng ký local yêu cầu họ tên, email hợp lệ và mật khẩu tối thiểu 6 ký tự.
- Sau đăng ký, backend sinh mã OTP 6 chữ số, lưu hash và thời hạn trong `email_verification_codes`.
- `EMAIL_PROVIDER=console` dùng khi local để in mã ra log; `EMAIL_PROVIDER=resend` dùng khi deploy và yêu cầu sender/domain hợp lệ.
- Chỉ tài khoản đã xác minh email mới đăng nhập bằng mật khẩu.
- Đăng nhập Google nhận credential từ Google Identity Services ở frontend; backend xác minh ID token bằng `google-auth-library` trước khi tạo/liên kết user.
- JWT chứa `id`, `email`, `role`; password được hash bằng bcrypt.
- Admin được kiểm tra qua `authMiddleware` và `adminMiddleware`; tài khoản có thể bị khóa bằng `is_active`.

Các endpoint auth:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/google`
- `POST /api/auth/verify-email`
- `POST /api/auth/resend-verification`
- `GET /api/auth/profile`

### 3.5 Tour detail, yêu thích và review

Tour detail hiện hỗ trợ:

- Gallery nhiều ảnh và ảnh fallback.
- Mô tả rich text được sanitize trước khi render.
- Timeline lịch trình từng ngày, ảnh theo ngày, bữa ăn.
- Highlights, địa điểm, chủ đề, dịch vụ bao gồm/không bao gồm, phương tiện và lịch khởi hành.
- Lịch khởi hành dùng ngày ISO `YYYY-MM-DD`; API chỉ trả các ngày sau ngày hiện tại theo múi giờ Việt Nam. Ngày đã qua được ẩn ở cả user và admin.
- Suy luận điểm khởi hành từ ngày đầu/lộ trình nếu dữ liệu không có trường riêng.
- Lưu/xóa tour yêu thích; thao tác `save` được gửi cho recommendation engine.

Review được phân biệt theo nguồn:

- Review crawl có `user_id IS NULL` và được gắn nhãn `Đánh giá tham khảo`.
- Review do tài khoản tạo được gắn nhãn `Khách hàng TourAI`.
- Mỗi user chỉ có tối đa một review cho mỗi tour; chỉ chủ review được sửa/xóa.
- Người dùng không reply review của nhau.
- Admin có thể tạo, sửa hoặc xóa **một phản hồi chính thức** cho mỗi review.
- Phản hồi admin nằm ở bảng `review_replies`, không làm tăng `review_count`, không đổi `avg_rating`, không được dùng như review đầu vào để tính độ phù hợp tour.

Điểm rating trong database được chuẩn hóa theo thang 10 để tương thích dữ liệu crawl; UI hiển thị theo thang 5 sao. Review user nhập 1–5 sao và backend lưu quy đổi tương ứng.

### 3.6 Đặt tour và thanh toán QR

Từ trang chi tiết tour, user đăng nhập rồi chọn:

- Một ngày khởi hành trong danh sách các ngày tương lai còn mở; không được nhập ngày tùy ý.
- Số khách (1–20).
- Họ tên, email, số điện thoại và ghi chú.

Backend kiểm tra ngày đã chọn có thuộc lịch của đúng tour, chưa qua và còn mở hay không. Giá được lấy từ dòng lịch khởi hành (fallback về giá tour nếu dòng lịch không có giá), không tin giá do frontend gửi; sau đó tạo booking ở trạng thái `pending_payment` và tạo mã thanh toán duy nhất.

Hai chế độ thanh toán:

| Chế độ | Cấu hình | Cách hiển thị |
|---|---|---|
| QR trực tiếp | `SEPAY_PAYMENT_MODE=qr` | Tạo ảnh VietQR từ ngân hàng/tài khoản cấu hình trong backend |
| SePay Gateway | `SEPAY_PAYMENT_MODE=gateway` | Tạo form checkout đã ký bằng `sepay-pg-node`, chỉ bật `BANK_TRANSFER` để người dùng quét QR/chuyển khoản |

Luồng gateway:

1. Frontend tạo booking.
2. Backend tạo checkout payload và trả về cho frontend.
3. Frontend submit form ẩn tới SePay hoặc hiển thị QR trực tiếp.
4. SePay redirect về `/payment-result`.
5. Backend nhận `POST /api/payments/sepay/ipn`, kiểm tra secret, invoice, số tiền, tiền tệ, phương thức, trạng thái, thời hạn và transaction id.
6. Chỉ IPN hợp lệ mới chuyển booking sang `paid`.

> Redirect trình duyệt không được xem là bằng chứng thanh toán. Với local, có thể xem màn hình QR; webhook/IPN thật cần backend có URL public HTTPS (Railway hoặc tunnel).

Tài liệu chi tiết: [`docs/sepay-payment.md`](./sepay-payment.md).

### 3.7 Admin dashboard

Admin UI dùng sidebar dạng danh sách cổ điển, gồm:

- **Tổng quan:** số tour, user, review, favorite, action, message; điểm đến nổi bật và user gần đây.
- **Quản lý tour:** card/list, mặc định tour mới nhất lên đầu, tìm kiếm/lọc trong nước-quốc tế, điểm đến, giá, số ngày, phân trang trước/sau, thêm/sửa/xóa.
- **Lịch khởi hành:** admin có thể thêm nhiều ngày tương lai cho một tour bằng date picker; ngày hôm nay, ngày đã qua và ngày trùng bị từ chối. Danh sách chỉnh sửa chỉ hiển thị lịch tương lai.
- **Upload ảnh:** chọn file JPG/PNG/WEBP, tối đa 5 MB mỗi file; có thể dùng nhiều URL gallery trong tour.
- **Trường tour:** tên, điểm đến, giá, số ngày, mùa/nhóm, mô tả rich text, gallery là bắt buộc; lịch trình, highlights, places, topics, included/excluded, schedule và transport là tùy chọn.
- **Quản lý user:** tìm kiếm, lọc role/trạng thái, xem chi tiết favorite/review/chat session, đổi role, khóa/mở khóa và xóa tài khoản.
- Không có tab xóa/quản lý review riêng; reply review được thực hiện ngay trong phần review của trang chi tiết tour và chỉ admin có quyền.

## 4. Database và migration

Các bảng chính:

- `tours`: thông tin tour, dữ liệu mở rộng crawl, lịch trình, gallery, lịch khởi hành và thống kê rating.
- `reviews`: review crawl và review user; review user có `user_id`.
- `review_replies`: phản hồi chính thức của admin, tách khỏi review.
- `tour_tags`, `user_preferences`, `user_actions`: dữ liệu cho recommendation.
- `users`, `email_verification_codes`: tài khoản và xác minh email/Google.
- `favorites`: tour đã lưu.
- `chat_sessions`, `chat_messages`: lịch sử chat.
- `bookings`, `payments`: đơn đặt tour và giao dịch SePay.

| Migration | Nội dung |
|---|---|
| `001_initial_schema.sql` | Schema nền: tours, reviews, users, preferences, actions, chat, favorites và index cơ bản |
| `002_add_favorites.sql` | Bổ sung/đảm bảo bảng `favorites` |
| `003_add_bestprice_fields.sql` | `duration_label`, giá gốc, arrays/JSONB cho highlights, gallery, itinerary, schedule, transport và index source |
| `004_admin_user_management.sql` | `users.is_active` và index trạng thái |
| `005_add_bookings_and_sepay.sql` | `bookings`, `payments`, trạng thái đơn/thanh toán và index |
| `006_email_verification.sql` | `email_verified_at`, bảng mã xác minh và thời hạn |
| `007_google_auth.sql` | `google_sub`, `auth_provider`, cho phép password null và unique Google subject |
| `008_user_tour_reviews.sql` | Liên kết review với user, `updated_at`, unique một review/user/tour |
| `009_preserve_imported_review_stats.sql` | Lưu riêng aggregate review crawl để review user không làm mất thống kê nhập khẩu |
| `010_admin_review_replies.sql` | Một reply admin/review, cascade khi review bị xóa |

Migration phải chạy theo thứ tự. Push code lên GitHub/Railway **không tự chạy SQL**; database Railway cần chạy thủ công toàn bộ migration chưa có, đặc biệt `008`, `009` và `010` cho chức năng review hiện tại.

`pgvector` là tùy chọn trong schema nền. Recommendation engine hiện tính vector bằng NumPy/scikit-learn; không được coi việc cài extension là điều kiện bắt buộc để khởi động hệ thống hiện tại.

## 5. API catalog

### 5.1 Web Service

Auth ký hiệu `✅` là yêu cầu Bearer JWT; admin yêu cầu thêm role `admin`.

| Endpoint | Method | Auth | Mục đích |
|---|---|:---:|---|
| `/health` | GET | ❌ | Health check Web Service |
| `/api/auth/register` | POST | ❌ | Tạo tài khoản và gửi mã xác minh |
| `/api/auth/login` | POST | ❌ | Đăng nhập email/mật khẩu |
| `/api/auth/google` | POST | ❌ | Đăng nhập bằng Google credential |
| `/api/auth/verify-email` | POST | ❌ | Xác minh mã OTP |
| `/api/auth/resend-verification` | POST | ❌ | Gửi lại mã OTP |
| `/api/auth/profile` | GET | ✅ | Hồ sơ hiện tại |
| `/api/tours` | GET | ❌ | Danh sách tour, filter, pagination |
| `/api/tours/popular` | GET | ❌ | Tour phổ biến |
| `/api/tours/destinations` | GET | ❌ | Danh sách điểm đến theo loại tour |
| `/api/tours/search` | GET | ❌ | Tìm tour theo keyword/filter |
| `/api/tours/:id` | GET | ❌ | Chi tiết tour |
| `/api/tours/:id/reviews` | GET | ❌ | Danh sách review |
| `/api/tours/:id/reviews/me` | GET | ✅ | Review của user hiện tại |
| `/api/tours/:id/reviews` | POST | ✅ | Tạo review |
| `/api/tours/:id/reviews/:reviewId` | PUT/DELETE | ✅ | Sửa/xóa review của chủ sở hữu |
| `/api/tours/:id/reviews/:reviewId/reply` | PUT/DELETE | ✅ admin | Tạo/sửa/xóa reply chính thức |
| `/api/recommendations` | GET | ✅ | Gọi AI để lấy gợi ý |
| `/api/actions` | POST | ✅ | Ghi click/view/save/search |
| `/api/actions/history` | GET | ✅ | Lịch sử hành vi của user |
| `/api/favorites` | GET/POST | ✅ | Danh sách/thêm yêu thích |
| `/api/favorites/:tour_id` | DELETE | ✅ | Xóa yêu thích |
| `/api/favorites/check/:tour_id` | GET | ✅ | Kiểm tra đã lưu |
| `/api/chat` | POST | ✅ | Gửi tin nhắn chat AI |
| `/api/chat/history` | GET | ✅ | Lấy lịch sử chat |
| `/api/bookings` | GET/POST | ✅ | Danh sách/tạo booking |
| `/api/bookings/:id` | GET | ✅ | Xem booking của user |
| `/api/bookings/:id/cancel` | POST | ✅ | Hủy booking đang chờ |
| `/api/payments/sepay/webhook` | POST | ❌* | Webhook tài khoản ngân hàng legacy |
| `/api/payments/sepay/ipn` | POST | ❌* | IPN SePay Gateway |
| `/api/admin/dashboard` | GET | ✅ admin | Số liệu dashboard |
| `/api/admin/tours` | GET/POST | ✅ admin | Danh sách/tạo tour |
| `/api/admin/tours/:id` | PUT/DELETE | ✅ admin | Sửa/xóa tour |
| `/api/admin/tours/image` | POST | ✅ admin | Upload ảnh tour |
| `/api/admin/users` | GET | ✅ admin | Danh sách user |
| `/api/admin/users/:id` | GET | ✅ admin | Chi tiết user |
| `/api/admin/users/:id/role` | PATCH | ✅ admin | Đổi role |
| `/api/admin/users/:id/status` | PATCH | ✅ admin | Khóa/mở khóa |
| `/api/admin/users/:id` | DELETE | ✅ admin | Xóa user |

`❌*` nghĩa là endpoint không dùng JWT của user; phải dùng cơ chế xác thực/secret riêng của SePay.

### 5.2 AI Service

Các endpoint AI yêu cầu `X-API-Key` trùng cấu hình nội bộ, ngoại trừ health check:

| Endpoint | Method | Mục đích |
|---|---|---|
| `/health` | GET | Kiểm tra service và trạng thái provider |
| `/ai/recommend` | POST | Recommendation Engine |
| `/ai/chat` | POST | Chat, intent/slot và câu trả lời |
| `/ai/destinations/suggest` | GET | Gợi ý điểm đến |
| `/ai/generate-tags` | POST | Sinh/lưu tag cho tour |
| `/ai/update-profile` | POST | Cập nhật preference từ hành vi |
| `/ai/explain/{tour_id}` | GET | Giải thích tour |

## 6. Biến môi trường và triển khai

Không đưa file `.env`, API key, mật khẩu database, secret SePay hoặc secret JWT lên GitHub. Chỉ commit `.env.example` với placeholder.

### Backend (`web-be`/Railway)

- Database: `DATABASE_URL`.
- Server/CORS: `PORT`, `NODE_ENV`, `FRONTEND_URL`, `FRONTEND_URLS`, `TRUST_PROXY`.
- Auth: `JWT_SECRET`, thời hạn JWT.
- AI: `AI_SERVICE_URL`, `AI_SERVICE_API_KEY`.
- Email: `EMAIL_PROVIDER`, `EMAIL_VERIFICATION_EXPIRES_MINUTES`, `EMAIL_VERIFICATION_SECRET`, `RESEND_API_KEY`, `MAIL_FROM`.
- Google: `GOOGLE_CLIENT_ID`.
- SePay: `SEPAY_PAYMENT_MODE`, `SEPAY_ENV`, merchant id/secret, IPN secret, bank/account QR và callback URL.
- Admin seed: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_SYNC_PASSWORD`.

### Frontend (`web-fe`/Vercel)

- `VITE_API_URL` hoặc `VITE_API_BASE_URL`: URL public của Web Service.
- `VITE_GOOGLE_CLIENT_ID`: OAuth client ID dùng cho Google Identity Services.
- Không đặt secret backend hoặc SePay vào biến `VITE_*`, vì các biến này được đóng gói vào browser.

### AI Service

- `DATABASE_URL`.
- `API_KEY`: phải khớp `AI_SERVICE_API_KEY` của Web Service.
- `LLM_PROVIDER=deepseek` hoặc `gemini`.
- DeepSeek: `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`.
- Gemini: `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`.

### Mô hình deploy đã sử dụng

- Frontend: Vercel.
- Backend và PostgreSQL: Railway.
- AI Service: phải có URL mà Railway backend truy cập được; khi chạy local dùng `http://localhost:8000`.
- `FRONTEND_URLS` trên backend phải chứa đúng origin Vercel, không thêm `/api`.
- Sau khi đổi biến môi trường trên Vercel/Railway phải redeploy/restart service.
- SePay IPN chỉ hoạt động đầy đủ khi callback trỏ tới backend public HTTPS.

## 7. Cách chạy và kiểm tra local

Thứ tự khuyến nghị: PostgreSQL → AI Service → Web Service → Frontend.

```powershell
# Web Service
cd web-be
npm install
npm run dev

# Frontend (terminal khác)
cd web-fe
npm install
npm run dev

# AI Service (terminal khác)
cd ai-service
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Chạy migration trên database local hoặc Railway bằng `psql` theo thứ tự tên file:

```powershell
$env:DATABASE_URL = "postgresql://user:password@host:5432/database"
Get-ChildItem database/migrations/*.sql |
  Sort-Object Name |
  ForEach-Object {
    psql $env:DATABASE_URL --set=ON_ERROR_STOP=1 --single-transaction -f $_.FullName
  }
```

Checklist smoke test đã dùng:

1. `GET /health` của Web Service và AI Service trả trạng thái healthy.
2. Đăng ký email mới → nhận/in mã OTP → verify → login.
3. Login Google với client ID đúng origin.
4. Search có dấu/không dấu và kiểm tra nút submit không gọi request khi chỉ gõ.
5. User mới xem fallback tour phổ biến; user đã save/click/search nhận gợi ý có filter.
6. User tạo/sửa/xóa review của mình; user khác nhận `403` khi thử reply.
7. Admin tạo/sửa/xóa reply; kiểm tra rating/count tour không đổi.
8. Tạo booking → hiển thị QR/checkout; kiểm tra `/payment-result` và trạng thái pending.
9. Với gateway sandbox, dùng IPN public để kiểm tra chuyển `pending_payment` → `paid`.

## 8. Kết quả xác minh source hiện tại

- Migration `010_admin_review_replies.sql` đã được áp dụng trên database local.
- `web-be/npm run build` đã chạy thành công.
- `web-fe/npm run build` đã chạy thành công.
- Smoke test quyền review reply: user thường bị `403`; admin tạo/sửa/xóa reply thành công.
- Public review list trả nested `admin_reply`.
- Test reply được dọn sau kiểm tra; không để lại dòng test trong `review_replies`.
- `git diff --check` không phát hiện whitespace error.
- Chưa commit và chưa push ở thời điểm tạo tài liệu này.

## 9. Giới hạn và quyết định cần nhớ

- Redirect từ SePay không chứng minh đã nhận tiền; chỉ IPN/webhook hợp lệ mới cập nhật paid.
- QR local chỉ là màn hình demo nếu chưa cấu hình tài khoản thật và callback public.
- LLM có quota/timeout; recommendation vẫn cần fallback local/DB để không làm mất toàn bộ trải nghiệm.
- Không có cơ chế user reply user; đây là quyết định để reply không làm nhiễu dữ liệu review dùng cho ranking.
- Admin reply không phải review và không được đưa vào thống kê rating.
- Chat hiện chưa streaming SSE; nếu cần giảm cảm giác chậm, có thể tách endpoint streaming ở một thay đổi sau.
- Tài liệu này cập nhật source Markdown. Các file báo cáo `.docx` trong `docs/` là tài liệu học thuật riêng và chưa được tự động chỉnh sửa nội dung.

## 10. Mapping thay đổi theo source

| Nhóm | File/ thư mục chính | Nội dung |
|---|---|---|
| Database | `database/migrations/008_user_tour_reviews.sql` | Liên kết review với tài khoản |
| Database | `database/migrations/009_preserve_imported_review_stats.sql` | Bảo toàn aggregate review crawl |
| Database | `database/migrations/010_admin_review_replies.sql` | Bảng reply chính thức của admin |
| Booking | `web-be/src/controllers/bookings.ts`, `web-be/src/services/sepay.ts` | Tạo booking, QR, checkout, webhook/IPN |
| Review API | `web-be/src/controllers/tours.ts`, `web-be/src/routes/tours.ts` | CRUD review và admin reply |
| Admin API | `web-be/src/controllers/admin.ts`, `web-be/src/routes/admin.ts` | Tour/user/dashboard/upload |
| Auth API | `web-be/src/controllers/auth.ts` | Email OTP, Google, JWT |
| Frontend review | `web-fe/src/components/TourReviews.tsx` | Review user và editor reply admin |
| Frontend booking | `web-fe/src/pages/TourDetail.tsx`, `web-fe/src/pages/PaymentResult.tsx` | Form booking, QR/checkout, theo dõi trạng thái |
| Frontend admin | `web-fe/src/pages/Admin.tsx` | Dashboard, tour/user management |
| Data pipeline | `crawler/seed_from_bestprice_json.py` | Chuẩn hóa rating và giữ review user |

## 11. Tài liệu liên quan

- [`docs/Tong_hop_y_tuong_do_an_tour_du_lich_AI.md`](./Tong_hop_y_tuong_do_an_tour_du_lich_AI.md): bản tổng hợp đồ án phục vụ báo cáo.
- [`README.md`](../README.md): cài đặt nhanh và tổng quan repo.
- [`docs/Kien_truc_he_thong.md`](./Kien_truc_he_thong.md): kiến trúc và các quyết định thiết kế.
- [`docs/sepay-payment.md`](./sepay-payment.md): cấu hình SePay Gateway/IPN và kiểm thử thanh toán.
- [`CLAUDE.md`](../CLAUDE.md): context kỹ thuật dùng khi tiếp tục phát triển.
