# Hệ thống gợi ý tour du lịch AI

Đồ án tốt nghiệp - Xây dựng hệ thống gợi ý tour du lịch cá nhân hóa ứng dụng AI dựa trên dữ liệu thu thập từ các website du lịch.

## Tổng quan

- **Trọng tâm:** Recommendation Engine (không phải website)
- **Thuật toán:** Content-Based Filtering + Cosine Similarity
- **AI:** Gemini API cho phân tích review và Slot Filling
- **Phạm vi:** Tour du lịch nội địa Việt Nam

## Kiến trúc

```
Frontend (React/Vite)
    ↓
Web Service (Node.js/Express)
    ↓
AI Service (Python/FastAPI) ←→ Database (PostgreSQL + pgvector)
    ↑
Crawler (Python/Scrapy)
```

## Các thành phần

### 1. Frontend (`/frontend`)
- React 18 + Vite + TypeScript
- Routing với React Router
- State management với Zustand
- UI: Minimalist, Bento Grid, High-end design

### 2. Web Service (`/web-service`)
- Node.js + Express + TypeScript
- REST API cho Frontend
- JWT Authentication
- Rate limiting, Caching

### 3. AI Service (`/ai-service`)
- Python + FastAPI
- Recommendation Engine (Cosine Similarity)
- LLM Integration (Gemini API)
- Tag Generation từ reviews

### 4. Crawler (`/crawler`)
- Python + Scrapy
- Crawl từ Klook, Traveloka
- Data Preprocessing

### 5. Database (`/database`)
- PostgreSQL + pgvector
- Tables: tours, reviews, tour_tags, users, user_preferences, user_actions

## Bắt đầu

### Yêu cầu
- Node.js 18+
- Python 3.10+
- PostgreSQL 14+

### 1. Setup Database

```bash
# Tạo database
createdb tour_recommendation

# Chạy migration
psql -d postgresql://postgres:password@localhost:5432/tour_recommendation \
  -f database/migrations/001_initial_schema.sql
```

### 2. Copy và setup environment

```bash
cp .env.example .env
# Chỉnh sửa .env với các giá trị thực tế
```

### 3. Chạy từng service

```bash
# Frontend
cd frontend && npm install && npm run dev

# Web Service
cd web-service && npm install && npm run dev

# AI Service
cd ai-service && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000

# Crawler (tùy chọn - để generate sample data)
cd crawler && pip install -r requirements.txt && python scripts/generate_sample_data.py
```

### 4. Mở trình duyệt

Truy cập http://localhost:3000

## Tag Taxonomy

15 tags cố định cho phân loại tour:

| Tag | Ý nghĩa |
|-----|---------|
| family | Phù hợp gia đình |
| romantic | Dành cho cặp đôi |
| adventure | Mạo hiểm, khám phá |
| beach | Biển |
| nature | Thiên nhiên |
| food | Ẩm thực |
| culture | Văn hóa, lịch sử |
| relax | Nghỉ dưỡng |
| budget | Giá rẻ, tiết kiệm |
| luxury | Sang trọng |
| spiritual | Tâm linh |
| photography | Chụp ảnh đẹp |
| shopping | Mua sắm |
| mountain | Núi, cao nguyên |
| city | Thành phố |

## API Endpoints

### Web Service (port 4000)

| Endpoint | Method | Mô tả |
|----------|--------|--------|
| `/api/auth/register` | POST | Đăng ký |
| `/api/auth/login` | POST | Đăng nhập |
| `/api/auth/profile` | GET | Thông tin user |
| `/api/tours` | GET | Danh sách tour |
| `/api/tours/:id` | GET | Chi tiết tour |
| `/api/tours/:id/reviews` | GET | Reviews của tour |
| `/api/recommendations` | GET | Gợi ý tour |
| `/api/actions` | POST | Log hành vi |
| `/api/chat` | POST | Chat với AI |

### AI Service (port 8000)

| Endpoint | Method | Mô tả |
|----------|--------|--------|
| `/health` | GET | Health check |
| `/ai/recommend` | POST | Gợi ý tour |
| `/ai/chat` | POST | Slot Filling |
| `/ai/generate-tags` | POST | Sinh tags |
| `/ai/update-profile` | POST | Cập nhật profile |

## Luồng hoạt động

### 1. Cold Start (User mới)
```
User đăng nhập → Trả về Tour phổ biến → User tương tác → Thu thập preferences
```

### 2. Recommendation
```
User yêu cầu → Extract User Profile → Cosine Similarity → Rank Tours → Top-N
```

### 3. Chat/Slot Filling
```
User gửi message → LLM trích xuất slots → Hỏi ngược nếu thiếu → Đủ info → Recommend
```

## Ghi chú quan trọng

- Crawl dữ liệu chỉ phục vụ mục đích **học thuật**
- Reviews thu thập sẽ được **ẩn danh hóa**
- Không tái phân phối hoặc thương mại hóa dữ liệu

## Cấu trúc thư mục

```
project/
├── frontend/           # React (Vite)
├── web-service/       # Node.js (Express)
├── ai-service/        # Python (FastAPI)
├── crawler/           # Python (Scrapy)
├── database/          # SQL migrations
├── docs/              # Tài liệu thiết kế
├── CLAUDE.md          # Project context
└── README.md
```

## License

Educational Purpose Only.
