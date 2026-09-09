# Hệ thống gợi ý tour du lịch AI — TourAI

> Tài liệu này mô tả source hiện tại của dự án tại ngày **07/09/2026**. Source chưa được commit/push ở thời điểm cập nhật.

TourAI là hệ thống tìm kiếm, gợi ý và tư vấn tour du lịch bằng tiếng Việt. Trọng tâm của đồ án là Recommendation Engine cá nhân hóa, kết hợp dữ liệu tour crawl, hành vi người dùng, review và hội thoại AI.

## Kiến trúc hiện tại

```text
web-fe (React/Vite :5174)
        │ REST/JSON
        ▼
web-be (Node.js/Express :3000) ─────── PostgreSQL :5432
        │
        └── X-API-Key + REST nội bộ
                         ▼
                 ai-service (FastAPI :8000)

crawler (Python batch job) ───────────► PostgreSQL
```

| Thành phần | Công nghệ | Vai trò | Port local |
|---|---|---|---:|
| `web-fe` | React 18, Vite, TypeScript, Zustand | Giao diện, routing, trạng thái và thao tác người dùng | `5174` |
| `web-be` | Node.js, Express, TypeScript, `pg` | REST API, auth, CRUD, booking, payment callback, gọi AI | `3000` |
| `ai-service` | Python, FastAPI, SQLAlchemy, NumPy, scikit-learn | Recommendation Engine, chat, tag và profile | `8000` |
| PostgreSQL | PostgreSQL | CSDL dùng chung cho Web/AI/Crawler | `5432` |
| `crawler` | Python, Playwright/BeautifulSoup và seed scripts | Crawl, chuẩn hóa và nạp dữ liệu | Batch |

Frontend không gọi trực tiếp AI Service. Web Service là cổng duy nhất của frontend; AI Service dùng `X-API-Key` nội bộ.

## Yêu cầu

- Node.js `>= 22` cho `web-be` và Node.js 18+ cho frontend.
- Python 3.10+.
- PostgreSQL 14+.
- `pgvector` là tùy chọn; recommender hiện tính bằng NumPy/scikit-learn nên không bắt buộc extension này để chạy.

## Cổng local

| Service | URL |
|---|---|
| Frontend | `http://localhost:5174` |
| Web API | `http://localhost:3000` |
| AI Service | `http://localhost:8000` |
| PostgreSQL | `localhost:5432` |

## Cài đặt nhanh

### 1. Cài dependency

```powershell
cd web-be
npm install

cd ..\web-fe
npm install

cd ..\ai-service
pip install -r requirements.txt
```

### 2. Cấu hình môi trường

Mỗi service có file `.env` riêng. Root `.env.example` chỉ là template tham khảo; không commit các file `.env` thật.

Các nhóm biến quan trọng:

- Backend: `DATABASE_URL`, `PORT`, `JWT_SECRET`, `AI_SERVICE_URL`, `AI_SERVICE_API_KEY`, `FRONTEND_URLS`.
- Email: `EMAIL_PROVIDER=console` ở local hoặc `resend` khi deploy, kèm `RESEND_API_KEY` và `MAIL_FROM`.
- Google: `GOOGLE_CLIENT_ID` ở backend và `VITE_GOOGLE_CLIENT_ID` ở frontend.
- AI: `LLM_PROVIDER`, `DEEPSEEK_*`, hoặc `GEMINI_*`, cùng `API_KEY` cho bảo vệ AI Service.
- Payment: `SEPAY_PAYMENT_MODE`, merchant/IPN secret hoặc thông tin VietQR.
- Admin seed: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `ADMIN_SYNC_PASSWORD`.

Chi tiết đầy đủ nằm trong [`docs/Cap_nhat_du_an.md`](docs/Cap_nhat_du_an.md).

### 3. Tạo database và chạy migration

Migration phải chạy theo thứ tự `001` đến `010`. Push code không tự chạy SQL trên Railway.

```powershell
$env:DATABASE_URL = "postgresql://user:password@host:5432/database"
Get-ChildItem database/migrations/*.sql |
  Sort-Object Name |
  ForEach-Object {
    psql $env:DATABASE_URL --set=ON_ERROR_STOP=1 --single-transaction -f $_.FullName
  }
```

Các migration hiện có:

1. `001_initial_schema.sql`: schema nền.
2. `002_add_favorites.sql`: favorites.
3. `003_add_bestprice_fields.sql`: gallery, itinerary, schedule và dữ liệu mở rộng.
4. `004_admin_user_management.sql`: trạng thái tài khoản.
5. `005_add_bookings_and_sepay.sql`: booking/payment.
6. `006_email_verification.sql`: xác minh email.
7. `007_google_auth.sql`: Google OAuth.
8. `008_user_tour_reviews.sql`: review gắn với user.
9. `009_preserve_imported_review_stats.sql`: bảo toàn thống kê review crawl.
10. `010_admin_review_replies.sql`: reply chính thức của admin.

### 4. Chạy các service

Mở bốn terminal theo thứ tự PostgreSQL → AI → backend → frontend:

```powershell
# AI Service
cd ai-service
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Web Service
cd web-be
npm run dev

# Frontend
cd web-fe
npm run dev
```

## Chức năng đã triển khai

### Người dùng

- Tìm tour bằng nút submit, tìm gần đúng không phân biệt dấu.
- Lọc trong nước/quốc tế, điểm đến, thời lượng và khoảng giá.
- Xem gallery, mô tả rich text, lịch trình từng ngày, điểm nổi bật, dịch vụ, phương tiện và lịch khởi hành.
- Lưu/xóa yêu thích; hành vi `save`, `click`, `search` được dùng để học sở thích.
- Nhận gợi ý cá nhân hóa hoặc tour phổ biến khi cold-start/fallback.
- Chat AI theo ngữ cảnh; hỗ trợ hỏi “tour 1”, so sánh và hỏi chi tiết lịch trình.
- Đăng ký email có OTP, đăng nhập mật khẩu hoặc Google.
- Tạo booking và xem màn hình QR thanh toán.
- Viết/sửa/xóa review của chính mình.

### Recommendation Engine

- **Tour phổ biến:** xếp theo `avg_rating` và `review_count`, dùng cho cold-start hoặc khi AI không sẵn sàng.
- **Tour gợi ý:** dùng tag, `user_preferences`, cosine similarity và ML reranker khi khả dụng.
- Trọng số hành vi hiện tại: `save=0.70`, `click=0.35`, `search=0.18`, `view=0.00`.
- Search về một điểm đến có thể cập nhật profile qua tối đa ba tour khớp tên/điểm đến.

### Review

- Review crawl và review user được đánh dấu khác nhau.
- Mỗi user chỉ có một review cho mỗi tour.
- Chỉ chủ review được sửa/xóa.
- Chỉ admin được reply; mỗi review có tối đa một reply chính thức.
- Reply admin nằm riêng trong `review_replies`, không tham gia tính rating/count/ranking.
- Database lưu rating theo thang 10 để tương thích dữ liệu crawl; giao diện hiển thị thang 5 sao.

### Booking và SePay

- Chọn ngày khởi hành từ danh sách ngày tương lai còn mở; không cho nhập ngày tùy ý.
- Admin có thể thêm nhiều ngày khởi hành bằng date picker; ngày đã qua không hiển thị ở user/admin và ngày trùng bị từ chối.
- Backend xác thực ngày thuộc đúng tour, kiểm tra trạng thái mở và lấy giá theo ngày trước khi tự tính tổng tiền.
- `SEPAY_PAYMENT_MODE=qr`: tạo VietQR trực tiếp.
- `SEPAY_PAYMENT_MODE=gateway`: dùng `sepay-pg-node`, checkout chỉ bật `BANK_TRANSFER`.
- Chỉ webhook/IPN hợp lệ mới chuyển booking sang `paid`; redirect trình duyệt không phải bằng chứng thanh toán.
- Trang frontend xử lý kết quả: `/payment-result`.

### Admin

- Dashboard số liệu tổng quan.
- Quản lý tour dạng list/card, tour mới nhất ở đầu, filter và phân trang.
- Upload ảnh JPG/PNG/WEBP tối đa 5 MB mỗi file; gallery nhiều ảnh.
- Tạo/sửa tour với các trường bắt buộc: tên, điểm đến, giá, số ngày, mùa/nhóm, mô tả và gallery.
- Quản lý user: tìm kiếm, role, trạng thái, chi tiết, khóa/mở khóa và xóa.
- Không có tab quản lý review riêng; admin reply ngay tại trang chi tiết tour.

## API chính

### Web Service

- Auth: `/api/auth/register`, `/login`, `/google`, `/verify-email`, `/resend-verification`, `/profile`.
- Tour: `/api/tours`, `/popular`, `/destinations`, `/search`, `/:id`.
- Review: `/api/tours/:id/reviews`, `/reviews/me`, `/:reviewId`, `/:reviewId/reply`.
- Recommendation/chat: `/api/recommendations`, `/api/chat`, `/api/chat/history`.
- Hành vi/yêu thích: `/api/actions`, `/api/actions/history`, `/api/favorites`.
- Booking: `/api/bookings`, `/api/bookings/:id`, `/cancel`.
- Payment: `/api/payments/sepay/webhook`, `/api/payments/sepay/ipn`.
- Admin: `/api/admin/dashboard`, `/tours`, `/tours/image`, `/users` và các route role/status/detail.
- Health: `/health`.

### AI Service

- `/health`
- `POST /ai/recommend`
- `POST /ai/chat`
- `GET /ai/destinations/suggest`
- `POST /ai/generate-tags`
- `POST /ai/update-profile`
- `GET /ai/explain/{tour_id}`

Bảng endpoint đầy đủ, auth và payload tham khảo tại [`docs/Cap_nhat_du_an.md`](docs/Cap_nhat_du_an.md).

## Crawler và dữ liệu

- `crawler/seed_from_bestprice_json.py` chuẩn hóa giá, rating, ngày và dữ liệu mở rộng từ JSON crawl.
- Rating crawl được quy đổi về thang 10; rating/count nhập khẩu được giữ riêng trong `imported_avg_rating` và `imported_review_count`.
- Khi seed lại, review user (`user_id IS NOT NULL`) được giữ nguyên; chỉ review nhập khẩu được thay thế.
- `BestPrice` là nguồn dữ liệu học thuật, không phải thương hiệu hiển thị trên sản phẩm.

## Kiểm tra trước khi push

```powershell
cd web-be
npm run build

cd ..\web-fe
npm run build

cd ..
git diff --check
git status --short
```

Đã xác minh trong working tree hiện tại:

- Build backend thành công.
- Build frontend thành công.
- Migration `010` và smoke test admin reply đã chạy.
- Chưa commit và chưa push.

## Tài liệu liên quan

- [`docs/Tong_hop_y_tuong_do_an_tour_du_lich_AI.md`](docs/Tong_hop_y_tuong_do_an_tour_du_lich_AI.md): bản tổng hợp đồ án, thuật toán, chức năng, tiến độ và kế hoạch đánh giá.
- [`docs/Cap_nhat_du_an.md`](docs/Cap_nhat_du_an.md): tài liệu trạng thái đầy đủ, migration, API, deploy và checklist test.
- [`docs/Kien_truc_he_thong.md`](docs/Kien_truc_he_thong.md): kiến trúc và luồng dữ liệu.
- [`docs/sepay-payment.md`](docs/sepay-payment.md): cấu hình SePay Gateway/IPN.
- [`CLAUDE.md`](CLAUDE.md): context kỹ thuật cho các lần phát triển tiếp theo.

## Ghi chú bảo mật

- Không commit `.env`, API key, password database, secret JWT, Resend hoặc SePay.
- Không đặt secret backend trong biến `VITE_*`.
- CORS production phải khai báo đúng origin frontend, không thêm `/api`.
- AI Service không nên expose trực tiếp ra internet nếu không có lớp bảo vệ phù hợp.

## License

Educational Purpose Only.
