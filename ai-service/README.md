# AI Service — TourAI

FastAPI service chứa Recommendation Engine và lớp trả lời hội thoại. Web Service mới được phép gọi các endpoint AI qua `X-API-Key`; frontend không gọi trực tiếp.

## Thành phần chính

```text
app/
├── main.py                 # FastAPI endpoints và khởi tạo provider
├── config.py               # Settings từ .env
├── engine/
│   ├── engine_db.py        # Ranking, cold-start, profile update
│   ├── recommendation.py   # Logic recommendation bổ trợ
│   ├── ml_ranker.py        # ML reranker nếu có artifact
│   └── tags.py             # Tag taxonomy
├── llm/
│   ├── conversation_agent.py # Intent/context và prompt trả lời
│   ├── deepseek.py           # DeepSeek client, timeout/cooldown
│   ├── gemini.py             # Gemini client thay thế
│   ├── slot_filling.py       # Slot extraction và local fallback
│   └── tag_generator.py      # Sinh tag
└── models/database.py       # SQLAlchemy models
```

## Provider và biến môi trường

- `LLM_PROVIDER=deepseek` là cấu hình hiện tại.
- DeepSeek: `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`.
- Gemini thay thế: `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`.
- `API_KEY` phải khớp `AI_SERVICE_API_KEY` ở Web Service.
- `DATABASE_URL` trỏ tới PostgreSQL dùng chung.

Provider không tự động đổi chéo trong mọi lỗi quota. Khi LLM lỗi, slot/response có fallback local; recommendation có thể fallback popular ở Web Service.

## Chạy

```powershell
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Endpoint

| Endpoint | Auth nội bộ | Mục đích |
|---|:---:|---|
| `GET /health` | Không | Health check và trạng thái provider |
| `POST /ai/recommend` | Có | Gợi ý tour |
| `POST /ai/chat` | Có | Chat, intent/slot và câu trả lời |
| `GET /ai/destinations/suggest` | Có | Gợi ý điểm đến |
| `POST /ai/generate-tags` | Có | Sinh/lưu tag |
| `POST /ai/update-profile` | Có | Học từ hành vi |
| `GET /ai/explain/{tour_id}` | Có | Giải thích tour |

Auth nội bộ dùng header `X-API-Key`.

## Lưu ý vận hành

- DeepSeek client có timeout khoảng 35 giây; Web Service có timeout request riêng.
- Chat hiện dùng REST response, chưa có SSE streaming.
- Không log API key, prompt chứa dữ liệu nhạy cảm hoặc thông tin thanh toán.
- AI Service nên chạy trong private network hoặc có lớp bảo vệ tương đương khi deploy.
