# Hệ thống gợi ý tour du lịch AI

Đồ án tốt nghiệp - Xây dựng hệ thống gợi ý tour du lịch cá nhân hóa ứng dụng AI dựa trên dữ liệu thu thập từ các website du lịch.

## Tổng quan

- **Trọng tâm:** Recommendation Engine (không phải website)
- **Thuật toán:** Content-Based Filtering + Cosine Similarity
- **AI:** Gemini API cho phân tích review và Slot Filling
- **Phạm vi:** Tour du lịch trong nước và quốc tế (dành cho người Việt Nam)

## Kiến trúc

```
web-fe (React/Vite) - Port 3000
    ↓ HTTP
web-be (Node.js/Express) - Port 4000
    ↓ HTTP
ai-service (Python/FastAPI) - Port 8000
    ↓
Database (PostgreSQL)
    ↑
crawler (Python/Scrapy)
```

## Cấu trúc thư mục

```
project/
├── web-fe/          # Frontend - React (Vite)
├── web-be/          # Backend - Node.js (Express)
├── ai-service/      # AI Service - Python (FastAPI)
├── crawler/         # Crawler - Python (Scrapy)
├── database/        # SQL migrations
├── scripts/         # Setup scripts
├── docs/            # Tài liệu thiết kế
├── CLAUDE.md        # Project context
└── README.md
```

## Yêu cầu

- Node.js 18+
- Python 3.10+
- PostgreSQL 14+
- pgvector extension (for vector similarity search)

## Ports

| Service | Port |
|---------|------|
| web-fe | 5174 |
| web-be | 3000 |
| ai-service | 8000 |
| PostgreSQL | 5432 |

## Bắt đầu

### 1. Setup Database

```bash
# Tạo database
createdb tour_recommendation

# Enable pgvector extension (required for vector similarity search)
psql -d tour_recommendation -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Chạy migration
psql -d postgresql://postgres:password@localhost:5432/tour_recommendation \
  -f database/migrations/001_initial_schema.sql

# Chạy migration 002 nếu cần (thêm bảng favorites)
psql -d postgresql://postgres:password@localhost:5432/tour_recommendation \
  -f database/migrations/002_add_favorites.sql
```

### 2. Setup environment

```bash
# Copy và chỉnh sửa .env cho từng service
cp web-be/.env web-be/.env.local
cp ai-service/.env ai-service/.env.local
```

### 3. Cài đặt dependencies và chạy

```bash
# web-fe (Frontend) - Port 5174
cd web-fe && npm install && npm run dev

# web-be (Backend) - Port 3000
cd web-be && npm install && npm run dev

# ai-service - Port 8000
cd ai-service && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000

# crawler (để generate sample data)
cd crawler && pip install -r requirements.txt && python scripts/generate_sample_data.py
```

### 4. Truy cập

- Frontend: http://localhost:5174
- Backend API: http://localhost:3000
- AI Service: http://localhost:8000

## Các thành phần

### web-fe (`/web-fe`)
- React 18 + Vite + TypeScript
- Routing với React Router
- State management với Zustand
- UI: Minimalist, Bento Grid, High-end design

### web-be (`/web-be`)
- Node.js + Express + TypeScript
- REST API cho Frontend
- JWT Authentication
- Rate limiting, Caching (node-cache)
- Error handling

### ai-service (`/ai-service`)
- Python + FastAPI
- Recommendation Engine (Cosine Similarity)
- LLM Integration (Gemini API)
- Tag Generation từ reviews
- Slot Filling Engine (trích xuất thông tin từ tin nhắn user)
- Database Integration (SQLAlchemy ORM)

**File chính:**
```
ai-service/app/
├── main.py              # FastAPI app entry
├── config.py            # Configuration
├── schemas.py           # Pydantic schemas
├── engine/
│   ├── recommendation.py  # Core recommendation logic
│   ├── engine_db.py        # DB-integrated engine
│   ├── cosine.py          # Cosine similarity
│   └── tags.py           # Tag taxonomy
├── llm/
│   ├── gemini.py         # Gemini API integration
│   ├── slot_filling.py   # Slot filling engine
│   └── tag_generator.py  # Tag generation
└── models/
    └── database.py       # SQLAlchemy models
```

### crawler (`/crawler`)
- Python + Scrapy + BeautifulSoup
- Crawl từ Klook, Traveloka
- Data Preprocessing
- Quick seed script (`quick_seed.py`)

**Scripts chính:**
```
crawler/
├── quick_seed.py           # Quick DB check & sample data
└── scripts/
    ├── generate_sample_data.py  # Generate tours + reviews
    ├── batch_generate_tags.py   # Batch tag generation
    └── run_crawler.py          # Run crawler
```

## Tag Taxonomy

21 tag cố định cho phân loại tour (mở rộng từ 15 tag ban đầu):

| Tag | Ý nghĩa |
|-----|---------|
| family | Phù hợp gia đình |
| romantic | Dành cho cặp đôi |
| adventure | Mạo hiểm, khám phá |
| beach | Biển |
| nature | Thiên nhiên |
| food | Ẩm thực |
| culture | Văn hóa |
| relax | Nghỉ dưỡng |
| budget | Giá rẻ, tiết kiệm |
| luxury | Sang trọng |
| spiritual | Tâm linh |
| photography | Chụp ảnh đẹp |
| shopping | Mua sắm |
| mountain | Núi, cao nguyên |
| city | Thành phố |
| history | Lịch sử, di tích |
| festival | Lễ hội |
| wildlife | Động vật hoang dã |
| cruise | Du thuyền |
| nightlife | Phố đêm, bar, club |
| water_sports | Lặn, kayak, surfing |

## API Endpoints

### web-be (port 4000)

| Endpoint | Method | Auth | Mô tả |
|----------|--------|------|--------|
| `/api/auth/register` | POST | ❌ | Đăng ký |
| `/api/auth/login` | POST | ❌ | Đăng nhập |
| `/api/auth/profile` | GET | ✅ | Thông tin user |
| `/api/tours` | GET | ❌ | Danh sách tour |
| `/api/tours/:id` | GET | ❌ | Chi tiết tour |
| `/api/tours/:id/reviews` | GET | ❌ | Reviews |
| `/api/tours/popular` | GET | ❌ | Tour phổ biến |
| `/api/tours/search` | GET | ❌ | Tìm kiếm |
| `/api/recommendations` | GET | ✅ | Gợi ý tour |
| `/api/favorites` | GET | ✅ | Danh sách tour yêu thích |
| `/api/favorites/:tourId` | POST | ✅ | Thêm/xóa tour yêu thích |
| `/api/actions` | POST | ✅ | Log hành vi |
| `/api/chat` | POST | ✅ | Chat với AI |

### ai-service (port 8000)

| Endpoint | Method | Mô tả |
|----------|--------|--------|
| `/health` | GET | Health check |
| `/ai/recommend` | POST | Gợi ý tour |
| `/ai/chat` | POST | Slot Filling |
| `/ai/generate-tags` | POST | Sinh tags |
| `/ai/update-profile` | POST | Cập nhật profile |

## Ghi chú quan trọng

- Crawl dữ liệu chỉ phục vụ mục đích **học thuật**
- Reviews thu thập sẽ được **ẩn danh hóa**
- Không tái phân phối hoặc thương mại hóa dữ liệu

## License

Educational Purpose Only.
