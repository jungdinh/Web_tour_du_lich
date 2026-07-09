# Kiến trúc hệ thống — Hệ thống gợi ý tour du lịch AI

## 1. Kiến trúc được chọn: Service-Based Architecture

### So sánh các kiến trúc

| Kiến trúc | Mô tả | Phù hợp? | Lý do |
|-----------|-------|-----------|-------|
| **Monolith** | Tất cả code gộp 1 codebase | ❌ | 2 ngôn ngữ (Python + Node.js) → không thể gộp chung |
| **Microservices** | Chia thành hàng chục service nhỏ | ❌ | Quá phức tạp cho 1 người (cần Service Discovery, API Gateway, Message Queue, Kubernetes) |
| **Serverless** | AWS Lambda / Cloud Functions | ❌ | Recommendation Engine xử lý nặng, cold start chậm, giới hạn thời gian chạy |
| **MVC / Layered** | Chia tầng trong 1 app | ⚠️ | Phù hợp bên trong 1 service, không giải quyết multi-language |
| **Service-Based** | 2-3 service lớn, giao tiếp REST | ✅ | Trung gian giữa Monolith và Microservices |

### Vì sao chọn Service-Based Architecture?

**Service-Based Architecture** là kiến trúc **trung gian** giữa Monolith và Microservices:

- Tách hệ thống thành **2-3 service lớn** (không phải hàng chục service nhỏ).
- Mỗi service chạy độc lập, giao tiếp qua **REST API**.
- Đơn giản hơn Microservices nhưng vẫn có **tách biệt rõ ràng**.
- Phù hợp với dự án **1 người phát triển** sử dụng **2 ngôn ngữ khác nhau**.
- Đủ sức phục vụ quy mô **~1000 user** mà không cần infrastructure phức tạp.

---

## 2. Sơ đồ kiến trúc hệ thống

```text
┌─────────────────────────────────────────────────────┐
│                    FRONTEND                         │
│               React (Vite)                          │
│            (Giao diện người dùng)                    │
└───────────────────┬─────────────────────────────────┘
                    │ HTTP Request
                    ▼
┌─────────────────────────────────────────────────────┐
│                  WEB SERVICE                        │
│              Node.js (Express/NestJS)               │
│                                                     │
│  • REST API cho Frontend                            │
│  • Authentication (JWT)                             │
│  • CRUD (Tour, User, Review)                        │
│  • Ghi log hành vi user (user_actions)              │
│  • Gọi AI Service khi cần gợi ý                    │
└───────────────────┬─────────────────────────────────┘
                    │ Internal REST API
                    ▼
┌─────────────────────────────────────────────────────┐
│                  AI SERVICE                         │
│              Python (FastAPI)                       │
│                                                     │
│  • Recommendation Engine (Cosine Similarity)        │
│  • LLM Integration (Gemini API)                     │
│  • Slot Filling (hỏi ngược user)                    │
│  • Tag Generation (phân tích review → sinh tag)     │
│  • Cập nhật User Profile từ hành vi                 │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│                  DATABASE                           │
│          PostgreSQL (+ pgvector extension)          │
│                                                     │
│  tours, reviews, tour_tags, users,                  │
│  user_preferences, user_actions                     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│              CRAWLER (Batch Job)                    │
│          Python (Scrapy / BeautifulSoup)            │
│                                                     │
│  • Thu thập dữ liệu từ Klook, Traveloka            │
│  • Chạy định kỳ (không chạy real-time)              │
│  • Ghi trực tiếp vào Database                       │
└─────────────────────────────────────────────────────┘
```

---

## 3. Chi tiết từng Service

### 3.1 Frontend — React (Vite)

| Chức năng | Mô tả |
|-----------|-------|
| Trang chủ | Hiển thị tour phổ biến, tour gợi ý |
| Tìm kiếm | Tìm tour theo keyword, bộ lọc |
| Chat AI | Giao diện hỏi đáp với LLM (Slot Filling) |
| Chi tiết tour | Thông tin tour, review, tag |
| Tài khoản | Đăng ký, đăng nhập, lịch sử |
| Tour yêu thích | Lưu tour, xem lại |

Giao tiếp với Web Service qua **REST API** (thông thường) và **SSE (Server-Sent Events) hoặc WebSocket** (để Streaming text trả về từ LLM dưới dạng typing effect, gia tăng tối đa UX).

### 3.2 Web Service — Node.js (Express/NestJS)

| Chức năng | API Endpoint (ví dụ) |
|-----------|----------------------|
| Auth | `POST /api/auth/login`, `POST /api/auth/register` |
| Tour CRUD | `GET /api/tours`, `GET /api/tours/:id` |
| Review | `GET /api/tours/:id/reviews` |
| User Actions | `POST /api/actions` (ghi log click, view, save) |
| Gợi ý tour | `GET /api/recommendations` → gọi AI Service |
| Chat | `POST /api/chat` → gọi AI Service |
| Tìm kiếm | `GET /api/tours/search?q=...&destination=...&tag=...` |

**Vai trò chính**: Là cầu nối giữa Frontend và AI Service. Xử lý authentication, validation, ghi log hành vi, và forward request đến AI Service khi cần.

### 3.3 AI Service — Python (FastAPI)

| Chức năng | API Endpoint (ví dụ) |
|-----------|----------------------|
| Gợi ý tour | `POST /ai/recommend` |
| Chat / Slot Filling | `POST /ai/chat` |
| Sinh tag từ review | `POST /ai/generate-tags` |
| Cập nhật User Profile | `POST /ai/update-profile` |
| Health check | `GET /ai/health` |

**Vai trò chính**: Chứa toàn bộ logic AI — Recommendation Engine, LLM, Tag Generation. Chỉ Web Service mới có quyền gọi đến AI Service (không expose trực tiếp ra ngoài).

### 3.4 Crawler — Python (Scrapy / BeautifulSoup)

| Chức năng | Mô tả |
|-----------|-------|
| Crawl tour | Thu thập tour từ Klook, Traveloka |
| Crawl review | Thu thập review tiếng Việt |
| Preprocessing | Làm sạch, chuẩn hóa, lọc trùng lặp, lọc ngôn ngữ |
| Lưu database | Ghi vào bảng `tours`, `reviews` |
| Hạn chế bị Ban | Sử dụng Proxy Rotation, User-Agent Spoofing và Request Delays (tránh scrape quá nhanh) |

**Không phải service chạy liên tục**. Crawler chạy dạng **batch job** (chạy 1 lần hoặc định kỳ hàng tuần) để cập nhật dữ liệu. Do đặc thù các nền tảng OTA bảo mật rất cao, cơ chế chống ban (Anti-ban) trong Crawler là bắt buộc.

---

## 4. Luồng dữ liệu chính

### 4.1 Luồng gợi ý tour (Recommendation Flow)

```text
User mở trang web
      │
      ▼
Frontend gửi request → Web Service
      │
      ▼
Web Service kiểm tra User Profile
      │
      ├─ User mới (chưa có profile) → Trả về tour phổ biến
      │
      └─ User có profile → Gọi AI Service
                                │
                                ▼
                        AI Service nhận User Profile
                                │
                                ▼
                        Cosine Similarity (User Profile vs Tour Profile)
                                │
                                ▼
                        Xếp hạng → Top-N Tour
                                │
                                ▼
                        Trả kết quả về Web Service
                                │
                                ▼
                        Web Service trả về Frontend
                                │
                                ▼
                        Hiển thị danh sách tour gợi ý
```

### 4.2 Luồng chat AI (Slot Filling Flow)

```text
User gõ: "Tôi muốn đi Đà Lạt cùng vợ"
      │
      ▼
Frontend gửi message → Web Service
      │
      ▼
Web Service forward → AI Service
      │
      ▼
AI Service gọi LLM (Gemini)
      │
      ▼
LLM trích xuất: destination=Đà Lạt, couple=true
      │
      ├─ Thiếu thông tin (budget, duration)
      │   → LLM hỏi ngược: "Ngân sách bao nhiêu? Đi mấy ngày?"
      │   → Trả về Frontend → User trả lời → Lặp lại
      │
      └─ Đủ thông tin
          → Tạo User Profile tạm thời
          → Gọi Recommendation Engine
          → LLM giải thích lý do gợi ý (Streaming response)
          → Frontend hiển thị kết quả dần dần qua SSE (Typing effect)
```

### 4.3 Luồng thu thập hành vi (Implicit Feedback Flow)

```text
User click vào Tour A
      │
      ▼
Frontend gửi action → Web Service
      │
      ▼
Web Service ghi vào bảng user_actions
  (user_id, tour_id, action_type="click", timestamp)
      │
      ▼
Web Service gọi AI Service → Cập nhật User Profile
      │
      ▼
AI Service lấy tag của Tour A
  (beach: 0.80, food: 0.60, family: 0.45)
      │
      ▼
Cộng trọng số vào user_preferences
  (với hệ số theo loại action: click=nhẹ, save=mạnh)
      │
      ▼
User Profile được cập nhật
→ Lần gợi ý tiếp theo sẽ chính xác hơn
```

### 4.4 Luồng xử lý dữ liệu (Data Pipeline)

```text
Crawler chạy (batch job)
      │
      ▼
Thu thập tour + review từ Klook, Traveloka
      │
      ▼
Data Preprocessing
  • Deduplication
  • Chuẩn hóa giá, địa điểm
  • Lọc review không phải tiếng Việt
  • Lọc review rác/spam
      │
      ▼
Lưu vào Database (tours, reviews)
      │
      ▼
AI Service chạy Tag Generation
  • Đọc review từ DB
  • LLM phân tích → sinh tag (theo Tag Taxonomy)
  • Tính trọng số tag
  • Lưu vào tour_tags
      │
      ▼
Tour Profile Vector sẵn sàng
→ Recommendation Engine có thể sử dụng
```

---

## 5. Giao tiếp giữa các Service

| Từ | Đến | Giao thức | Mô tả |
|----|-----|-----------|-------|
| Frontend | Web Service | HTTP REST (JSON) | Mọi request từ user |
| Frontend | Web Service | WebSocket *(tùy chọn)* | Chat real-time |
| Web Service | AI Service | HTTP REST (JSON) | Gọi recommendation, chat, update profile |
| Crawler | Database | SQL (direct) | Ghi dữ liệu crawl |
| Web Service | Database | SQL (ORM) | CRUD operations |
| AI Service | Database | SQL (ORM) | Đọc tour/tag, cập nhật user profile |

### Quy tắc giao tiếp

- **Frontend KHÔNG gọi trực tiếp AI Service** → Luôn đi qua Web Service.
- **AI Service KHÔNG expose ra internet** → Chỉ Web Service mới gọi được (internal network).
- **Crawler chạy độc lập** → Không phụ thuộc vào Web Service hay AI Service.

---

## 6. Tối ưu hiệu suất

### 6.1 Tìm kiếm Vector bản địa với `pgvector`

Thay vì tính toán Cosine Similarity bằng code Python thủ công cho từng request, hệ thống sẽ tận dụng sức mạnh tốc độ ở cấp cơ sở dữ liệu:

- Tích hợp extension **`pgvector`** vào PostgreSQL.
- Sau khi có Tag Generation/Embedding, lưu thẳng vector vào kiểu dữ liệu `vector` trực tiếp trong Database.
- AI Service chỉ việc gọi SQL query (dùng toán tử cosine distance `<=>`) để DB xử lý và trả về ngay kết quả xếp hạng. Tốc độ nhánh hơn nhiều lần so với đẩy dữ liệu lên memory của Python để tính toán.

Khi nào cập nhật lại vector: Khi có review mới hoặc crawler chạy lại.

### 6.2 Database Indexing

| Bảng | Index | Lý do |
|------|-------|-------|
| `tours` | `destination` | Lọc theo địa điểm nhanh |
| `tours` | `price` | Lọc theo khoảng giá |
| `tours` | `avg_rating` | Sắp xếp theo rating |
| `reviews` | `tour_id` | Truy vấn review theo tour |
| `tour_tags` | `tour_id` | Lấy tag theo tour |
| `user_actions` | `user_id, created_at` | Truy vấn hành vi theo user |
| `user_preferences` | `user_id` | Lấy profile user |

### 6.3 Pagination

Tất cả API trả về danh sách **phải có pagination**:

```
GET /api/tours?page=1&limit=20
GET /api/tours/:id/reviews?page=1&limit=10
GET /api/recommendations?top=10
```

Không bao giờ trả về toàn bộ dữ liệu trong 1 request.

### 6.4 API Response Caching (Web Service)

Web Service cache một số kết quả thường xuyên truy cập:

| Cache gì | TTL (Time to Live) | Khi nào invalidate |
|----------|-------|-----|
| Danh sách tour phổ biến | 1 giờ | Khi crawler chạy lại |
| Chi tiết tour | 30 phút | Khi có review mới |
| Kết quả tìm kiếm (theo query) | 15 phút | Tự hết hạn |

Dùng **in-memory cache** (Node.js `node-cache`) cho quy mô 1000 user. Nâng lên Redis khi cần scale.

### 6.5 Batch Update User Profile

Không cập nhật User Profile **mỗi lần** user click. Thay vào đó:

- Ghi log hành vi vào `user_actions` ngay lập tức (nhẹ, nhanh).
- **Mỗi 5-10 phút** hoặc khi user **mở trang recommendations**, AI Service mới tổng hợp hành vi gần đây → cập nhật `user_preferences`.

Lý do: Giảm số lần gọi AI Service, tránh tốn tài nguyên tính toán.

---

## 7. Bảo mật cơ bản

### 7.1 Authentication & Authorization

| Thành phần | Giải pháp |
|------------|-----------|
| **Auth method** | JWT (JSON Web Token) |
| **Password** | Hash bằng bcrypt (không lưu plain text) |
| **Token expiry** | Access token: 1 giờ, Refresh token: 7 ngày |
| **Role** | User (mặc định), Admin (quản lý) |

### 7.2 Bảo vệ API

| Biện pháp | Mô tả |
|-----------|-------|
| **CORS** | Chỉ cho phép Frontend domain gọi API |
| **Rate Limiting** | Giới hạn request/phút cho mỗi IP (chống spam) |
| **Input Validation** | Validate tất cả input từ user (XSS, SQL Injection) |
| **AI Service internal** | AI Service chỉ nhận request từ Web Service (kiểm tra API key hoặc IP whitelist) |

### 7.3 Environment Variables

Không hardcode thông tin nhạy cảm trong code:

```
DATABASE_URL=postgresql://user:pass@localhost:5432/tourdb
GEMINI_API_KEY=xxx
JWT_SECRET=xxx
AI_SERVICE_URL=http://localhost:8000
```

Dùng file `.env` + thư viện `dotenv`.

---

## 8. Cấu trúc thư mục dự kiến

```
project/
├── frontend/                  # React (Vite)
│   ├── src/
│   │   ├── components/        # UI components
│   │   ├── pages/             # Các trang
│   │   ├── hooks/             # Custom hooks
│   │   ├── services/          # Gọi API (axios/fetch)
│   │   ├── context/           # React Context (auth, theme)
│   │   └── styles/            # CSS
│   ├── public/                # Static assets
│   └── package.json
│
├── web-service/               # Node.js (Express/NestJS)
│   ├── src/
│   │   ├── controllers/       # Xử lý request
│   │   ├── routes/            # Định nghĩa API routes
│   │   ├── middlewares/       # Auth, validation, rate-limit
│   │   ├── models/            # Database models (ORM)
│   │   ├── services/          # Business logic + gọi AI Service
│   │   ├── cache/             # In-memory cache logic
│   │   └── config/            # Environment config
│   └── package.json
│
├── ai-service/                # Python (FastAPI)
│   ├── app/
│   │   ├── api/               # API endpoints
│   │   ├── engine/            # Recommendation Engine
│   │   │   ├── cosine.py      # Cosine Similarity
│   │   │   └── profile.py     # User/Tour Profile builder
│   │   ├── llm/               # LLM integration (Gemini)
│   │   ├── tag_generator/     # Tag generation logic
│   │   ├── models/            # Database models
│   │   └── config/            # Environment config
│   └── requirements.txt
│
├── crawler/                   # Python (Scrapy/BeautifulSoup)
│   ├── spiders/               # Crawler scripts
│   │   ├── klook_spider.py
│   │   └── traveloka_spider.py
│   ├── preprocessing/         # Data cleaning
│   │   ├── dedup.py           # Deduplication
│   │   ├── normalize.py       # Chuẩn hóa giá, địa điểm
│   │   └── filter.py          # Lọc review rác, ngôn ngữ
│   └── requirements.txt
│
├── database/
│   ├── migrations/            # SQL migration files
│   └── seed/                  # Dữ liệu mẫu
│
├── .env.example               # Template biến môi trường
├── docker-compose.yml         # Chạy tất cả services (tùy chọn)
└── README.md
```

---

## 9. Deployment

### Phát triển (Development)

| Service | Cách chạy | Port mặc định |
|---------|-----------|---------------|
| Frontend | `npm run dev` | 3000 |
| Web Service | `npm run dev` | 4000 |
| AI Service | `uvicorn app.main:app --reload` | 8000 |
| Database | PostgreSQL local hoặc Docker | 5432 |

### Production

| Phương án | Mô tả | Phù hợp khi |
|-----------|-------|-------------|
| **Local** | Chạy trực tiếp trên máy | Demo đồ án |
| **Docker Compose** | Gói tất cả service vào containers | Demo chuyên nghiệp, dễ setup trên máy khác |
| **Cloud** | Deploy lên Render / Railway / GCP | Muốn truy cập từ xa, cho giảng viên test |

---

## 10. Lộ trình mở rộng (Scaling Roadmap)

| Mốc | Cần thêm gì | Lý do |
|-----|-------------|-------|
| **< 1.000 user** | Không cần gì thêm | SBA gốc đủ xử lý |
| **1.000 - 10.000 user** | Redis cache + Nginx reverse proxy | Cache recommendation, phân tải request |
| **10.000 - 100.000 user** | Message Queue + API Gateway + Auto-scaling | Xử lý async, rate limiting, load balancing |
| **> 100.000 user** | Cân nhắc Microservices | Tách service nhỏ hơn, team lớn hơn |

### Kiến trúc nâng cấp (khi cần scale lên 10.000+ user)

```text
┌──────────────────────────────────────────────────────┐
│                      CLIENT                          │
│                  React (Vite)                         │
└──────────────────┬───────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│              API GATEWAY (Nginx)                     │
│   • Rate Limiting  • Load Balancing  • SSL           │
└──────────────────┬───────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
┌───────────────┐    ┌────────────────┐
│  WEB SERVICE  │    │  AI SERVICE    │
│  Node.js      │    │  Python        │
└───────┬───────┘    └───────┬────────┘
        │                    │
        ├────────┬───────────┤
        ▼        ▼           ▼
┌──────────┐ ┌───────┐ ┌──────────┐
│PostgreSQL│ │ Redis │ │  Queue   │
│  (Data)  │ │(Cache)│ │(Async)   │
└──────────┘ └───────┘ └──────────┘
```

Kiến trúc nâng cấp này **không cần triển khai ngay** — chỉ áp dụng khi hệ thống thực sự cần scale.

---

## 11. Tổng kết

| Tiêu chí | Lựa chọn |
|----------|---------|
| **Kiến trúc** | Service-Based Architecture |
| **Quy mô thiết kế** | ~1.000 user |
| **Số service** | 3 (Frontend + Web Service + AI Service) + 1 Crawler batch |
| **Giao tiếp** | REST API (JSON) |
| **Database** | PostgreSQL + pgvector (shared). Lưu ý Nợ kỹ thuật (Technical Debt): Đánh đổi rủi ro Tight Coupling (khi sửa Schema phải sửa đổi cả ở 2 service) để lấy sự đơn giản. |
| **Auth** | JWT + bcrypt |
| **Tối ưu** | Vector DB (`pgvector`), DB indexing, pagination, batch update, in-memory cache, SSE (Streaming UI cho AI), có tính Fault Tolerance (Retry + Fallback nếu Gemini sập). |
| **Ưu điểm** | Tách biệt Python/Node.js, dễ phát triển 1 người, không quá phức tạp, có lộ trình scale bài bản. |
| **Nhược / Đánh đổi**| - Cần quản lý nhiều component hơn Monolith.<br>- Chấp nhận phá vỡ tính Độc lập dữ liệu (Data Independence) để tiết kiệm thời gian triển khai (Shared DB Pattern). |
