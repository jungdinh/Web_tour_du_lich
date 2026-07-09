# Đồ án tốt nghiệp: Hệ thống gợi ý tour du lịch AI

## 1. Tổng quan ý tưởng

Xây dựng hệ thống gợi ý tour du lịch cá nhân hóa ứng dụng AI dựa trên dữ liệu thu thập từ các website du lịch (Klook, Traveloka).

**Trọng tâm:** Recommendation Engine, không phải website.

## 2. Tech Stack

| Thành phần | Công nghệ |
|------------|-----------|
| AI Service | Python (FastAPI) |
| Web Service | Node.js (Express) |
| Frontend | React (Vite) |
| Database | PostgreSQL + pgvector |
| Crawler | Python (Scrapy/BeautifulSoup) |
| LLM | Gemini API |

## 3. Kiến trúc

Service-Based Architecture:
- Frontend → Web Service → AI Service → Database
- Crawler ghi trực tiếp vào Database

## 4. Các thư mục chính

```
project/
├── frontend/           # React (Vite)
├── web-service/        # Node.js (Express)
├── ai-service/         # Python (FastAPI)
├── crawler/            # Python (Scrapy)
├── database/           # SQL migrations
└── docs/               # Tài liệu thiết kế
```

## 5. Quy ước quan trọng

### Tag Taxonomy (15 tags cố định)
- family, romantic, adventure, beach, nature, food, culture, relax, budget, luxury, spiritual, photography, shopping, mountain, city

### Thuật toán gợi ý
- Content-Based Filtering + Cosine Similarity
- Cold-Start: Tour phổ biến cho user mới

### Luồng chat AI (Slot Filling)
- LLM hỏi ngược nếu thiếu thông tin
- Đủ thông tin → Recommendation Engine → Top-N Tour

## 6. Commands

### Frontend
```bash
cd frontend && npm install && npm run dev
```

### Web Service
```bash
cd web-service && npm install && npm run dev
```

### AI Service
```bash
cd ai-service && pip install -r requirements.txt && uvicorn app.main:app --reload
```

### Crawler
```bash
cd crawler && pip install -r requirements.txt && python -m scrapy crawl klook
```

## 7. Database

PostgreSQL với các bảng chính:
- tours, reviews, tour_tags, users, user_preferences, user_actions

Sử dụng pgvector extension cho vector similarity search.

## 8. Phạm vi

- Đối tượng: Người Việt Nam
- Tour: Nội địa Việt Nam
- Tiền tệ: VND
- Ngôn ngữ: Tiếng Việt
- Reviews: Chỉ tiếng Việt

## 9. Lưu ý khi phát triển

- AI Service không expose ra internet, chỉ Web Service gọi được
- Frontend không gọi trực tiếp AI Service
- Rate limiting cho API
- Pagination cho tất cả API trả về danh sách
