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


class ChatRequest(BaseModel):
    user_id: int
    message: str
    session_id: Optional[int] = None


class SlotData(BaseModel):
    destination: Optional[str] = None
    companions: Optional[List[str]] = None  # family, couple, friends, solo
    budget_min: Optional[int] = None
    budget_max: Optional[int] = None
    duration: Optional[int] = None  # in days
    preferences: Optional[List[str]] = None  # beach, adventure, etc.
    season: Optional[str] = None


class ChatResponse(BaseModel):
    message: str
    slot_data: SlotData
    is_complete: bool  # True if enough info to recommend
    recommendations: Optional[List[Dict]] = None
    session_id: int
