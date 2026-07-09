from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from app.config import get_settings
from app.schemas import (
    TagGenerationRequest, TagGenerationResponse,
    RecommendationRequest, RecommendationResponse,
    ChatRequest, ChatResponse, SlotData
)
from app.engine.recommendation import RecommendationEngine
from app.engine.cosine import CosineSimilarityEngine
from app.llm.gemini import GeminiLLM


settings = get_settings()

app = FastAPI(
    title="AI Service - Tour Recommendation",
    description="Recommendation Engine + LLM Integration"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Chỉ cho phép Frontend trong production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize components
engine = RecommendationEngine(settings.database_url)
cosine_engine = CosineSimilarityEngine()
llm = GeminiLLM(settings.gemini_api_key) if settings.gemini_api_key else None


def verify_api_key(x_api_key: str = Header(None)):
    """Verify internal API key"""
    if x_api_key != settings.api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return True


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "ai-service"}


@app.post("/ai/generate-tags", response_model=TagGenerationResponse)
async def generate_tags(request: TagGenerationRequest, _: bool = verify_api_key):
    """Generate tags cho tour từ reviews"""
    if not llm:
        raise HTTPException(status_code=503, detail="Gemini API not configured")
    
    tags = llm.generate_tags_from_reviews(request.reviews)
    
    return TagGenerationResponse(
        tour_id=request.tour_id,
        tags=tags,
        analyzed_count=len(request.reviews)
    )


@app.post("/ai/recommend", response_model=RecommendationResponse)
async def recommend(request: RecommendationRequest, _: bool = verify_api_key):
    """Get personalized recommendations cho user"""
    recommendations = engine.recommend_for_user(
        user_id=request.user_id,
        filters=request.filters,
        top_k=request.top_k
    )
    
    is_cold_start = len(engine.get_user_preferences(request.user_id)) == 0
    
    return RecommendationResponse(
        recommendations=recommendations,
        is_cold_start=is_cold_start
    )


@app.post("/ai/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, _: bool = verify_api_key):
    """
    Chat với AI sử dụng Slot Filling
    
    Luồng:
    1. LLM trích xuất thông tin từ message
    2. Nếu thiếu thông tin -> hỏi ngược
    3. Nếu đủ thông tin -> gọi Recommendation Engine
    """
    if not llm:
        raise HTTPException(status_code=503, detail="Gemini API not configured")
    
    # Lấy slot data hiện tại từ session (nếu có)
    # TODO: Implement session storage
    
    current_slots = {
        "destination": None,
        "companions": None,
        "budget_min": None,
        "budget_max": None,
        "duration": None,
        "preferences": None,
        "season": None,
    }
    
    # Trích xuất slots từ message
    slot_data = llm.extract_slots(request.message, current_slots)
    
    # Kiểm tra xem đã đủ thông tin chưa
    is_complete = all([
        slot_data.destination,
        slot_data.duration,
        slot_data.budget_min or slot_data.budget_max,
    ])
    
    if is_complete:
        # Đủ thông tin -> gợi ý tour
        filters = {
            "destination": slot_data.destination,
        }
        if slot_data.budget_min:
            filters["min_price"] = slot_data.budget_min
        if slot_data.budget_max:
            filters["max_price"] = slot_data.budget_max
        if slot_data.duration:
            filters["duration"] = slot_data.duration
        
        # Convert preferences to tags
        if slot_data.preferences:
            user_prefs = {p: 1.0 for p in slot_data.preferences}
        else:
            user_prefs = {}
        
        recommendations = engine.recommend_for_user(
            user_id=request.user_id,
            filters=filters,
            top_k=5
        )
        
        # Giải thích kết quả
        explanations = []
        for tour in recommendations[:3]:
            exp = llm.explain_recommendation(tour, user_prefs, slot_data)
            explanations.append(exp)
        
        message = "Dựa trên thông tin của bạn, đây là những gợi ý:\n\n" + "\n\n".join(explanations)
        
        return ChatResponse(
            message=message,
            slot_data=slot_data,
            is_complete=True,
            recommendations=recommendations,
            session_id=request.session_id or 0
        )
    else:
        # Thiếu thông tin -> hỏi ngược
        question = llm.generate_follow_up_question(slot_data)
        
        return ChatResponse(
            message=question,
            slot_data=slot_data,
            is_complete=False,
            recommendations=None,
            session_id=request.session_id or 0
        )


@app.post("/ai/update-profile")
async def update_profile(
    user_id: int,
    action_type: str,
    tour_id: int,
    _: bool = verify_api_key
):
    """Cập nhật user profile từ implicit feedback"""
    tour_tags = engine.get_tour_tags(tour_id)
    
    engine.update_user_preferences(user_id, action_type, tour_tags)
    
    return {"status": "updated", "user_id": user_id}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
