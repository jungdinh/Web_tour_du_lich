# AI Service - Python FastAPI

## Cấu trúc thư mục

```
ai-service/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app entry
│   ├── config.py            # Environment config
│   ├── api/
│   │   ├── __init__.py
│   │   ├── routes.py        # API endpoints
│   │   └── deps.py          # Dependencies
│   ├── engine/
│   │   ├── __init__.py
│   │   ├── cosine.py        # Cosine Similarity
│   │   ├── profile.py       # User/Tour Profile
│   │   └── recommendation.py
│   ├── llm/
│   │   ├── __init__.py
│   │   ├── gemini.py        # Gemini API integration
│   │   ├── slot_filling.py  # Slot Filling logic
│   │   └── tag_generator.py # Tag generation from reviews
│   ├── models/
│   │   ├── __init__.py
│   │   └── database.py      # SQLAlchemy models
│   └── services/
│       ├── __init__.py
│       └── profile_service.py
└── requirements.txt
```

## Chạy service

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## API Endpoints

- `GET /health` - Health check
- `POST /ai/recommend` - Get recommendations
- `POST /ai/chat` - Chat với AI (Slot Filling)
- `POST /ai/generate-tags` - Generate tags cho tour
- `POST /ai/update-profile` - Update user profile
