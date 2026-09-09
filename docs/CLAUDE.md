# Đồ án tốt nghiệp: Hệ thống gợi ý tour du lịch AI — TourAI

> Context kỹ thuật hiện tại, cập nhật **07/09/2026**. Tài liệu trạng thái đầy đủ: `docs/Cap_nhat_du_an.md`.

## 1. Mục tiêu

Xây dựng hệ thống tìm kiếm, gợi ý và tư vấn tour du lịch cá nhân hóa bằng tiếng Việt. Trọng tâm là Recommendation Engine; website là lớp trải nghiệm và quản trị dữ liệu.

## 2. Tech stack

| Thành phần | Công nghệ |
|---|---|
| `web-fe` | React 18, Vite, TypeScript, Zustand |
| `web-be` | Node.js, Express, TypeScript, `pg` |
| `ai-service` | Python, FastAPI, SQLAlchemy, NumPy, scikit-learn |
| `crawler` | Python, Playwright/BeautifulSoup và seed scripts |
| Database | PostgreSQL; `pgvector` tùy chọn, không bắt buộc hiện tại |
| LLM | DeepSeek mặc định theo `LLM_PROVIDER`; Gemini là provider thay thế |

## 3. Kiến trúc và cổng

```text
web-fe :5174 → web-be :3000 → ai-service :8000 → PostgreSQL :5432
crawler ────────────────────────────────────────→ PostgreSQL
```

- Frontend không gọi trực tiếp AI Service.
- Web Service là API gateway, bảo vệ AI bằng `X-API-Key`.
- Crawler chạy batch, không nằm trong request path.

## 4. Recommendation Engine

- Popular: xếp theo `avg_rating`/`review_count`, dùng cho cold-start hoặc fallback.
- Personalized: tag profile + cosine similarity + ML reranker khi có artifact.
- Tín hiệu profile: `save=0.70`, `click=0.35`, `search=0.18`, `view=0.00`.
- Search về điểm đến học từ tối đa ba tour khớp tên/điểm đến.
- Nếu AI lỗi/timeout, backend trả popular tours thay vì làm hỏng trang.

## 5. Chat AI

- Chat lưu `chat_sessions`/`chat_messages` và context ngắn hạn trong memory của Web Service.
- Hỗ trợ hỏi tour mới, tour 1/2, so sánh, lịch trình và dữ liệu tour.
- Intent/slot có fallback local/rule-based.
- Provider được chọn bằng `LLM_PROVIDER`; không giả định tự động đổi DeepSeek↔Gemini khi hết quota.
- Chat hiện là REST request/response, chưa phải SSE streaming.

## 6. Tài khoản, review và booking

- Auth: JWT + bcrypt, email OTP (`console` local hoặc Resend production), Google ID token.
- Review user: một review/user/tour, chủ sở hữu mới sửa/xóa.
- Reply review: chỉ admin, một reply/review trong `review_replies`; không ảnh hưởng rating/count/ranking.
- Booking: backend tính giá từ DB; hỗ trợ VietQR trực tiếp hoặc SePay Gateway.
- Chỉ IPN/webhook hợp lệ mới đánh dấu thanh toán `paid`.

## 7. Migrations

Chạy theo thứ tự `001` → `010`:

- `001_initial_schema.sql`: schema nền.
- `002_add_favorites.sql`: favorites.
- `003_add_bestprice_fields.sql`: dữ liệu mở rộng tour.
- `004_admin_user_management.sql`: `is_active`.
- `005_add_bookings_and_sepay.sql`: booking/payment.
- `006_email_verification.sql`: email verification.
- `007_google_auth.sql`: Google auth.
- `008_user_tour_reviews.sql`: review user.
- `009_preserve_imported_review_stats.sql`: aggregate crawl.
- `010_admin_review_replies.sql`: admin reply.

Push/deploy không tự chạy migration Railway.

## 8. Quy ước phát triển

- Dùng parameterized SQL; không ghép input user trực tiếp vào query.
- Validate boundary bằng Zod/Pydantic.
- Không đưa secret vào code, log, Markdown hoặc biến `VITE_*`.
- Rich text phải sanitize trước khi render.
- Danh sách lớn phải có pagination/limit.
- Không đổi review admin reply thành customer review.
- Không coi redirect thanh toán là bằng chứng đã nhận tiền.
- Giữ `source=bestprice` là nguồn dữ liệu, không hiển thị BestPrice như thương hiệu TourAI.

## 9. Commands

```powershell
# web-be
cd web-be
npm install
npm run dev
npm run build

# web-fe
cd ..\web-fe
npm install
npm run dev
npm run build

# ai-service
cd ..\ai-service
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 10. Tài liệu chuẩn

- `README.md`: quick start.
- `docs/Tong_hop_y_tuong_do_an_tour_du_lich_AI.md`: tổng hợp đề tài, thuật toán, chức năng và tiến độ.
- `docs/Cap_nhat_du_an.md`: trạng thái, API, migration, deploy và checklist.
- `docs/Kien_truc_he_thong.md`: kiến trúc và luồng dữ liệu.
- `docs/sepay-payment.md`: SePay Gateway/IPN.
