# Đồ án tốt nghiệp: Hệ thống gợi ý tour du lịch AI

## 1. Tổng quan ý tưởng

Xây dựng hệ thống gợi ý tour du lịch cá nhân hóa ứng dụng AI dựa trên dữ liệu thu thập từ BestPrice.

**Trọng tâm:** Recommendation Engine, không phải website.

## 2. Tech Stack

| Thành phần | Công nghệ |
|------------|-----------|
| web-fe | React (Vite) |
| web-be | Node.js (Express) |
| ai-service | Python (FastAPI) |
| crawler | Python (Playwright + BeautifulSoup) — crawl từ BestPrice |
| Database | PostgreSQL + pgvector |
| LLM | Gemini API |

## 3. Kiến trúc

Service-Based Architecture:
```
web-fe → web-be → ai-service → Database
crawler → Database
```

## 4. Các thư mục chính

```
project/
├── web-fe/          # Frontend - React (Vite)
├── web-be/          # Backend - Node.js (Express)
├── ai-service/      # AI Service - Python (FastAPI)
├── crawler/         # Crawler - Python (Playwright + BeautifulSoup) — crawl BestPrice
├── database/        # SQL migrations
└── docs/            # Tài liệu thiết kế
```

## 5. Quy ước quan trọng

### Tag Taxonomy (21 tags cố định - mở rộng từ 15)
- **Đối tượng**: family, romantic
- **Phong cách**: adventure, relax, spiritual
- **Cảnh quan**: beach, mountain, nature, city
- **Trải nghiệm**: culture, history, festival, photography, wildlife, cruise, nightlife, water_sports
- **Ăn uống/Mua sắm**: food, shopping
- **Giá cả**: budget, luxury

### Thuật toán gợi ý
- Content-Based Filtering + Cosine Similarity
- Cold-Start: Tour phổ biến cho user mới

### Luồng chat AI (Slot Filling)
- LLM hỏi ngược nếu thiếu thông tin
- Đủ thông tin → Recommendation Engine → Top-N Tour

**Slot Taxonomy:**
- Required: destination, duration, budget
- Optional: companions, preferences, season

**File:** `ai-service/app/llm/slot_filling.py`

## 6. Commands

### web-fe (Frontend)
```bash
cd web-fe && npm install && npm run dev
```

### web-be (Backend)
```bash
cd web-be && npm install && npm run dev
```

### ai-service
```bash
cd ai-service && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000
```

### crawler
```bash
cd crawler && pip install -r requirements.txt && python quick_seed.py
```

## 7. Database

PostgreSQL với các bảng chính:
- tours, reviews, tour_tags, users, user_preferences, user_actions, favorites

Sử dụng pgvector extension cho vector similarity search.

**Migrations:**
- `database/migrations/001_initial_schema.sql` - Schema ban đầu
- `database/migrations/002_add_favorites.sql` - Thêm bảng favorites

## 8. Phạm vi

- Đối tượng: Người Việt Nam
- Tour: Trong nước và quốc tế (dành cho người Việt Nam đi du lịch)
- Tiền tệ: VND
- Ngôn ngữ: Tiếng Việt
- Reviews: Chỉ tiếng Việt

## 9. Lưu ý khi phát triển

- ai-service không expose ra internet, chỉ web-be gọi được
- web-fe không gọi trực tiếp ai-service
- Rate limiting cho API
- Pagination cho tất cả API trả về danh sách

## 10. Ports

| Service | Port |
|---------|------|
| web-fe | 5174 |
| web-be | 3000 |
| ai-service | 8000 |
| PostgreSQL | 5432 |
