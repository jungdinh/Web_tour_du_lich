from pydantic import BaseModel
from typing import List, Dict, Optional


class TagGenerationRequest(BaseModel):
    tour_id: int
    reviews: List[str]


class TagGenerationResponse(BaseModel):
    tour_id: int
    tags: Dict[str, float]  # {tag: weight}
    analyzed_count: int


class RecommendationRequest(BaseModel):
    user_id: int
    filters: Optional[Dict] = None
    top_k: int = 10


class RecommendationResponse(BaseModel):
    recommendations: List[Dict]
    is_cold_start: bool = False


class UpdateProfileRequest(BaseModel):
    user_id: int
    action_type: str
    tour_id: int

class ChatRequest(BaseModel):
    user_id: int
    message: str
    session_id: Optional[int] = None
    current_slots: Optional[Dict] = None  # slots từ session trước (để merge)
    last_recommendations: Optional[List[Dict]] = None
    recent_messages: Optional[List[Dict]] = None


class SlotData(BaseModel):
    destination: Optional[str] = None
    companions: Optional[List[str]] = None  # family, couple, friends, solo
    budget_min: Optional[int] = None
    budget_max: Optional[int] = None
    duration: Optional[int] = None  # in days
    duration_min: Optional[int] = None
    duration_max: Optional[int] = None
    preferences: Optional[List[str]] = None  # beach, adventure, etc.
    season: Optional[str] = None

    class Config:
        extra = "ignore"


class DestinationSuggestion(BaseModel):
    destination: str
    tour_count: int
    avg_rating: Optional[float] = None
    sample_tour_names: List[str] = []


class ChatResponse(BaseModel):
    message: str
    slot_data: SlotData
    is_complete: bool  # True if enough info to recommend
    recommendations: Optional[List[Dict]] = None
    destination_suggestions: Optional[List[DestinationSuggestion]] = None
    session_id: int
