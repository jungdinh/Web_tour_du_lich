import sys
import re
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List, Dict
from sqlalchemy.orm import Session

from .config import get_settings
from .schemas import (
    TagGenerationRequest, TagGenerationResponse,
    RecommendationRequest, RecommendationResponse,
    UpdateProfileRequest,
    ChatRequest, ChatResponse, SlotData, DestinationSuggestion,
)
from .models.database import get_db
from .engine.engine_db import RecommendationEngineDB
from .llm.slot_filling import SlotFillingEngine
from .llm.tag_generator import TagGenerator
from .llm.conversation_agent import ConversationAgent
from .llm.deepseek import DeepSeekLLM

settings = get_settings()

app = FastAPI(
    title="AI Service - Tour Recommendation",
    description="Recommendation Engine + LLM Integration",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize components
# If a Gemini LLM is configured, hand it to the slot-filling engine so that
# Vietnamese intent can be parsed more accurately. The engine still falls back
# to rule-based extraction when the LLM is unavailable or fails.
slot_filling_engine = SlotFillingEngine(llm_client=None)

# LLM client
response_llm = None
tag_generator = TagGenerator()
conversation_agent = ConversationAgent(None, None)
if settings.llm_provider.lower() == "deepseek" and settings.deepseek_api_key:
    try:
        response_llm = DeepSeekLLM(settings.deepseek_api_key, settings.deepseek_base_url, settings.deepseek_model)
        conversation_agent = ConversationAgent(None, response_llm)
        print(f"[LLM] DeepSeek client initialized with {settings.deepseek_model} at {settings.deepseek_base_url} for conversation responses.")
    except Exception as e:
        print(f"Warning: Could not initialize DeepSeek: {e}")
        response_llm = None
elif settings.gemini_api_key:
    try:
        from .llm.gemini import GeminiLLM
        response_llm = GeminiLLM(settings.gemini_api_key, settings.gemini_model, settings.gemini_fallback_model)
        conversation_agent = ConversationAgent(None, response_llm)
        print(f"[LLM] Gemini client initialized with {settings.gemini_model} (fallback: {settings.gemini_fallback_model}) for conversation responses.")
    except Exception as e:
        print(f"Warning: Could not initialize Gemini: {e}")
        response_llm = None


def verify_api_key(x_api_key: str = Header(None)):
    if x_api_key != settings.api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return True


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "ai-service",
        "llm_configured": response_llm is not None,
        "llm_provider": settings.llm_provider,
    }


@app.post("/ai/generate-tags", response_model=TagGenerationResponse)
async def generate_tags(
    request: TagGenerationRequest,
    _: bool = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """Generate tags cho tour từ reviews"""
    tags = tag_generator.generate_tags(
        request.reviews,
        use_llm=False
    )
    
    # Save tags to database
    from .models.database import TourTag
    db.query(TourTag).filter(TourTag.tour_id == request.tour_id).delete()
    
    for tag, weight in tags.items():
        db_tag = TourTag(
            tour_id=request.tour_id,
            tag=tag,
            weight=weight
        )
        db.add(db_tag)
    
    db.commit()
    
    return TagGenerationResponse(
        tour_id=request.tour_id,
        tags=tags,
        analyzed_count=len(request.reviews)
    )


@app.post("/ai/recommend", response_model=RecommendationResponse)
async def recommend(
    request: RecommendationRequest,
    _: bool = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """Get personalized recommendations cho user"""
    engine = RecommendationEngineDB(db)
    
    result = engine.recommend_for_user(
        user_id=request.user_id,
        filters=request.filters,
        top_k=request.top_k
    )
    
    return RecommendationResponse(
        recommendations=result["recommendations"],
        is_cold_start=result["is_cold_start"]
    )


@app.get("/ai/destinations/suggest", response_model=List[DestinationSuggestion])
async def suggest_destinations(
    tags: str,  # comma-separated: "beach,nature"
    limit: int = 5,
    _: bool = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """
    Gợi ý destinations dựa trên tags.

    Ví dụ: GET /ai/destinations/suggest?tags=beach,nature&limit=5
    -> trả về các địa điểm có nhiều tour match beach/nature nhất.
    """
    tag_list = [t.strip() for t in tags.split(",") if t.strip()]
    if not tag_list:
        raise HTTPException(status_code=400, detail="tags parameter is required")

    engine = RecommendationEngineDB(db)
    raw = engine.get_destinations_by_tags(tags=tag_list, limit=limit)
    return [DestinationSuggestion(**s) for s in raw]


def _format_price(value: Optional[int]) -> str:
    if not value or value <= 0:
        return "li\u00ean h\u1ec7"
    return f"{value:,} VND"


def _format_price_vnd(value: Optional[int]) -> str:
    if not value or value <= 0:
        return "li\u00ean h\u1ec7"
    return f"{value:,}".replace(",", ".") + "\u0111/ng\u01b0\u1eddi"


def _format_money_vnd(value: Optional[int]) -> str:
    if not value or value <= 0:
        return "0\u0111"
    return f"{value:,}".replace(",", ".") + "\u0111"


def _format_rating_five(value: Optional[float]) -> str:
    if not value or value <= 0:
        rating = 4.0
    else:
        rating = float(value) / 2 if float(value) > 5 else float(value)
        rating = min(5.0, max(0.0, rating))
    return f"{rating:.1f}/5 sao"


def _tour_summary(tour: Dict) -> str:
    return (
        f"{tour.get('name', 'Tour n\u00e0y')} ({tour.get('destination', 'ch\u01b0a r\u00f5 \u0111i\u1ec3m \u0111\u1ebfn')}) - "
        f"gi\u00e1 {_format_price(tour.get('price'))}, "
        f"{tour.get('duration', 'ch\u01b0a r\u00f5')} ng\u00e0y, "
        f"\u0111\u00e1nh gi\u00e1 {_format_rating_five(tour.get('avg_rating'))}"
    )


def _tag_names(tour: Dict, limit: int = 4) -> List[str]:
    tags = tour.get("tags") or {}
    if isinstance(tags, dict):
        return list(tags.keys())[:limit]
    if isinstance(tags, list):
        return [str(item.get("tag")) for item in tags[:limit] if isinstance(item, dict) and item.get("tag")]
    return []


def _experience_phrases(tour: Dict, limit: int = 4) -> List[str]:
    tag_map = {
        "family": "d\u1ec5 \u0111i c\u00f9ng gia \u0111\u00ecnh, l\u1ecbch tr\u00ecnh thi\u00ean v\u1ec1 s\u1ef1 tho\u1ea3i m\u00e1i",
        "couple": "h\u1ee3p cho c\u1eb7p \u0111\u00f4i mu\u1ed1n c\u00f3 th\u1eddi gian ri\u00eang v\u00e0 kh\u00f4ng kh\u00ed nh\u1eb9 nh\u00e0ng",
        "friends": "ph\u00f9 h\u1ee3p \u0111i c\u00f9ng nh\u00f3m b\u1ea1n, d\u1ec5 ch\u1ee5p \u1ea3nh v\u00e0 tr\u1ea3i nghi\u1ec7m chung",
        "solo": "h\u1ee3p n\u1ebfu b\u1ea1n mu\u1ed1n m\u1ed9t chuy\u1ebfn \u0111i g\u1ecdn, t\u1ef1 do v\u00e0 d\u1ec5 s\u1eafp x\u1ebfp",
        "nature": "c\u00f3 nhi\u1ec1u c\u1ea3m gi\u00e1c g\u1ea7n thi\u00ean nhi\u00ean, h\u1ee3p \u0111\u1ec3 \u0111\u1ed5i kh\u00f4ng kh\u00ed",
        "photography": "c\u00f3 nhi\u1ec1u \u0111i\u1ec3m g\u1ee3i c\u1ea3m h\u1ee9ng ch\u1ee5p \u1ea3nh v\u00e0 l\u01b0u k\u1ef7 ni\u1ec7m",
        "mountain": "mang m\u00e0u s\u1eafc cao nguy\u00ean, kh\u00f4ng kh\u00ed m\u00e1t v\u00e0 c\u1ea3nh quan tho\u00e1ng",
        "relax": "nh\u1ecbp \u0111i nh\u1eb9, h\u1ee3p ngh\u1ec9 ng\u01a1i h\u01a1n l\u00e0 ch\u1ea1y l\u1ecbch tr\u00ecnh d\u00e0y",
        "adventure": "c\u00f3 ch\u1ea5t tr\u1ea3i nghi\u1ec7m n\u0103ng \u0111\u1ed9ng, h\u1ee3p ng\u01b0\u1eddi th\u00edch kh\u00e1m ph\u00e1",
        "wildlife": "c\u00f3 y\u1ebfu t\u1ed1 n\u00f4ng tr\u1ea1i/\u0111\u1ed9ng v\u1eadt, d\u1ec5 t\u1ea1o c\u1ea3m gi\u00e1c vui v\u00e0 g\u1ea7n g\u0169i",
        "culture": "c\u00f3 m\u00e0u s\u1eafc \u0111\u1ecba ph\u01b0\u01a1ng, h\u1ee3p n\u1ebfu b\u1ea1n th\u00edch t\u00ecm hi\u1ec3u v\u0103n h\u00f3a",
        "food": "d\u1ec5 k\u1ebft h\u1ee3p tr\u1ea3i nghi\u1ec7m \u0103n u\u1ed1ng \u0111\u1ecba ph\u01b0\u01a1ng",
        "beach": "h\u1ee3p \u0111\u1ec3 ngh\u1ec9 bi\u1ec3n, th\u01b0 gi\u00e3n v\u00e0 \u0111\u1ed5i gi\u00f3",
        "luxury": "thi\u00ean v\u1ec1 tr\u1ea3i nghi\u1ec7m ch\u1ec9n chu v\u00e0 tho\u1ea3i m\u00e1i h\u01a1n",
        "budget": "gi\u00e1 m\u1ec1m, h\u1ee3p n\u1ebfu b\u1ea1n mu\u1ed1n t\u1ed1i \u01b0u chi ph\u00ed",
    }
    phrases = []
    for tag in _tag_names(tour, 8):
        phrase = tag_map.get(tag.lower())
        if phrase and phrase not in phrases:
            phrases.append(phrase)
        if len(phrases) >= limit:
            break
    return phrases


def _rating_text(tour: Dict) -> str:
    return f"\u0111\u00e1nh gi\u00e1 {_format_rating_five(tour.get('avg_rating'))}"


    score = tour.get("score")
    if isinstance(score, (int, float)):
        return f"điểm phù hợp {score:.2f}"
    return ""


def _tour_itinerary_preview(tour: Dict, max_days: int = 2) -> str:
    itinerary = tour.get("itinerary") or []
    if isinstance(itinerary, dict):
        itinerary = [itinerary]
    if not isinstance(itinerary, list) or not itinerary:
        return ""

    parts = []
    for day in itinerary[:max_days]:
        if not isinstance(day, dict):
            continue
        label = day.get("day") or day.get("title") or "Ng?y"
        content = day.get("content")
        if isinstance(content, list):
            content_text = " ".join(str(item).strip() for item in content if isinstance(item, str))
        elif isinstance(content, str):
            content_text = content.strip()
        else:
            content_text = ""
        content_text = re.sub(r"\s+", " ", content_text).strip()
        if len(content_text) > 220:
            content_text = content_text[:220].rstrip() + "?"
        piece = label
        if content_text:
            piece += f": {content_text}"
        parts.append(piece)

    return " ; ".join(parts)

def _fallback_context_answer(intent: str, recommendations: List[Dict], indexes: List[int]) -> str:
    if not recommendations:
        return "M\u00ecnh ch\u01b0a c\u00f3 danh s\u00e1ch tour tr\u01b0\u1edbc \u0111\u00f3 \u0111\u1ec3 tr\u1ea3 l\u1eddi ch\u00ednh x\u00e1c. B\u1ea1n cho m\u00ecnh bi\u1ebft \u0111i\u1ec3m \u0111\u1ebfn, s\u1ed1 ng\u00e0y v\u00e0 ng\u00e2n s\u00e1ch \u0111\u1ec3 m\u00ecnh g\u1ee3i \u00fd nh\u00e9."

    selected = []
    for index in indexes or [1]:
        if 1 <= index <= len(recommendations):
            selected.append(recommendations[index - 1])
    if not selected:
        selected = [recommendations[0]]

    if intent == "acknowledgement":
        return "Ok, m\u00ecnh gi\u1eef tour n\u00e0y l\u00e0m l\u1ef1a ch\u1ecdn \u01b0u ti\u00ean. N\u1ebfu b\u1ea1n mu\u1ed1n ch\u1eafc h\u01a1n, m\u00ecnh c\u00f3 th\u1ec3 so s\u00e1nh v\u1edbi tour th\u1ee9 2, l\u1ecdc tour r\u1ebb h\u01a1n, ho\u1eb7c t\u00ecm tour h\u1ee3p gia \u0111\u00ecnh/ngh\u1ec9 d\u01b0\u1ee1ng h\u01a1n."

    if intent == "compare_recommendations":
        tours = recommendations[:3] if len(recommendations) >= 3 else recommendations[:2]
        lines = ["M\u00ecnh so s\u00e1nh nhanh c\u00e1c l\u1ef1a ch\u1ecdn n\u1ed5i b\u1eadt \u0111\u1ec3 b\u1ea1n d\u1ec5 ch\u1ed1t h\u01a1n:", ""]
        for position, tour in enumerate(tours, start=1):
            experiences = _experience_phrases(tour, 2)
            highlight = "; ".join(experiences) if experiences else "d\u1ec5 c\u00e2n \u0111\u1ed1i l\u1ecbch tr\u00ecnh v\u00e0 ng\u00e2n s\u00e1ch"
            lines.append(
                f"{position}. {tour.get('name', 'Tour \u0111ang \u0111\u01b0\u1ee3c g\u1ee3i \u00fd')} - {_format_price_vnd(tour.get('price'))}, {tour.get('duration', 'v\u00e0i')} ng\u00e0y. "
                f"Ch\u1ea5t chuy\u1ebfn \u0111i: {highlight}."
            )

        if len(tours) >= 2:
            first, second = tours[0], tours[1]
            notes = []
            if (first.get("price") or 0) and (second.get("price") or 0):
                price_gap = (first.get("price") or 0) - (second.get("price") or 0)
                if price_gap < 0:
                    notes.append(f"L\u1ef1a ch\u1ecdn \u0111\u1ea7u ti\u1ebft ki\u1ec7m kho\u1ea3ng {_format_money_vnd(abs(price_gap))} so v\u1edbi tour th\u1ee9 hai.")
                elif price_gap > 0:
                    notes.append(f"Tour th\u1ee9 hai ti\u1ebft ki\u1ec7m kho\u1ea3ng {_format_money_vnd(price_gap)} so v\u1edbi l\u1ef1a ch\u1ecdn \u0111\u1ea7u.")
            if (first.get("duration") or 0) != (second.get("duration") or 0):
                notes.append(f"Kh\u00e1c bi\u1ec7t th\u1eddi gian n\u1eb1m \u1edf {first.get('duration')} ng\u00e0y v\u00e0 {second.get('duration')} ng\u00e0y.")
            if notes:
                lines.extend(["", "**So v\u1edbi l\u1ef1a ch\u1ecdn kh\u00e1c:**", " ".join(notes)])

        lines.extend(["", "N\u1ebfu mu\u1ed1n ch\u1ecdn nhanh, m\u00ecnh s\u1ebd \u01b0u ti\u00ean ph\u01b0\u01a1ng \u00e1n c\u00e2n b\u1eb1ng nh\u1ea5t gi\u1eefa gi\u00e1, s\u1ed1 ng\u00e0y v\u00e0 ki\u1ec3u tr\u1ea3i nghi\u1ec7m b\u1ea1n \u0111ang t\u00ecm."])
        return "\n".join(lines)

    tour = selected[0]
    experiences = _experience_phrases(tour, 3)
    title = tour.get("name") or "Tour \u0111ang \u0111\u01b0\u1ee3c ch\u1ecdn"
    destination = tour.get("destination") or "\u0111i\u1ec3m \u0111\u1ebfn n\u00e0y"
    duration = tour.get("duration") or "v\u00e0i"
    price = tour.get("price")
    rating = tour.get("avg_rating") or 0
    highlight = "; ".join(experiences) if experiences else "l\u1ecbch tr\u00ecnh r\u00f5 r\u00e0ng, d\u1ec5 c\u00e2n \u0111\u1ed1i th\u1eddi gian v\u00e0 ng\u00e2n s\u00e1ch"
    itinerary_preview = _tour_itinerary_preview(tour)

    lines = [
        f"**{title}**",
        "",
        f"N\u1ebfu b\u1ea1n mu\u1ed1n m\u1ed9t l\u1ef1a ch\u1ecdn g\u1ecdn cho chuy\u1ebfn \u0111i {destination}, ph\u01b0\u01a1ng \u00e1n n\u00e0y kh\u00e1 d\u1ec5 c\u00e2n nh\u1eafc: th\u1eddi gian v\u1eeba ph\u1ea3i, chi ph\u00ed m\u1ec1m v\u00e0 thi\u00ean v\u1ec1 nh\u1ecbp \u0111i kh\u00f4ng qu\u00e1 n\u1eb7ng.",
        "",
        f"\U0001f4b0 Gi\u00e1: **{_format_price_vnd(price)}**",
        f"\u23f1 Th\u1eddi gian: **{duration} ng\u00e0y**",
        f"\U0001f4cd \u0110i\u1ec3m n\u1ed5i b\u1eadt: {highlight}.",
        "",
    ]

    if rating:
        lines.append(f"\u0110i\u1ec3m \u0111\u00e1nh gi\u00e1 kho\u1ea3ng {_format_rating_five(rating)}, n\u00ean \u0111\u00e2y l\u00e0 l\u1ef1a ch\u1ecdn c\u00f3 th\u00eam c\u01a1 s\u1edf \u0111\u1ec3 tham kh\u1ea3o khi so v\u1edbi c\u00e1c tour c\u00f9ng \u0111i\u1ec3m \u0111\u1ebfn.")
    else:
        lines.append("Tour hi\u1ec7n ch\u01b0a c\u00f3 nhi\u1ec1u d\u1eef li\u1ec7u \u0111\u00e1nh gi\u00e1, n\u00ean m\u00ecnh s\u1ebd nh\u00ecn nhi\u1ec1u h\u01a1n v\u00e0o gi\u00e1, th\u1eddi l\u01b0\u1ee3ng v\u00e0 ch\u1ea5t chuy\u1ebfn \u0111i \u0111\u1ec3 t\u01b0 v\u1ea5n.")

    if itinerary_preview:
        lines.append(f"L\u1ecbch tr\u00ecnh n\u1ed5i b\u1eadt: {itinerary_preview}.")
    else:
        lines.append(
            f"L\u1ecbch tr\u00ecnh c\u1ee7a chuy\u1ebfn {destination} n\u00e0y thi\u00ean v\u1ec1 nh\u1ecbp \u0111i nh\u1eb9 nh\u00e0ng: c\u00f3 th\u1eddi gian ngh\u1ec9, c\u00f3 kh\u00f4ng gian \u0111\u1ec3 ch\u1ee5p \u1ea3nh v\u00e0 v\u1eabn \u0111\u1ee7 c\u1ea3m gi\u00e1c \u0111\u1ed5i gi\u00f3. "
            "N\u1ebfu \u0111i c\u00f9ng gia \u0111\u00ecnh ho\u1eb7c ng\u01b0\u1eddi y\u00eau, nh\u1ecbp n\u00e0y th\u01b0\u1eddng d\u1ec5 ch\u1ecbu h\u01a1n m\u1ed9t tour qu\u00e1 d\u00e0y \u0111i\u1ec3m tham quan."
        )

    if len(recommendations) > 1:
        other = recommendations[1]
        comparisons = []
        if price and other.get("price"):
            price_gap = price - (other.get("price") or 0)
            if price_gap < 0:
                comparisons.append(f"V\u1ec1 ng\u00e2n s\u00e1ch, l\u1ef1a ch\u1ecdn n\u00e0y ti\u1ebft ki\u1ec7m kho\u1ea3ng {_format_money_vnd(abs(price_gap))} so v\u1edbi tour th\u1ee9 hai.")
            elif price_gap > 0:
                comparisons.append(f"V\u1ec1 ng\u00e2n s\u00e1ch, l\u1ef1a ch\u1ecdn n\u00e0y cao h\u01a1n tour th\u1ee9 hai kho\u1ea3ng {_format_money_vnd(price_gap)}.")
        if duration and other.get("duration") and duration != other.get("duration"):
            comparisons.append(f"V\u1ec1 th\u1eddi gian, tour n\u00e0y \u0111i {duration} ng\u00e0y, c\u00f2n l\u1ef1a ch\u1ecdn th\u1ee9 hai l\u00e0 {other.get('duration')} ng\u00e0y.")
        if comparisons:
            lines.extend(["", "**So v\u1edbi l\u1ef1a ch\u1ecdn kh\u00e1c:**", " ".join(comparisons)])

    lines.extend([
        "",
        "**Ph\u00f9 h\u1ee3p n\u1ebfu:** b\u1ea1n mu\u1ed1n gi\u1eef chi ph\u00ed v\u1eeba ph\u1ea3i, l\u1ecbch tr\u00ecnh d\u1ec5 \u0111i v\u00e0 \u01b0u ti\u00ean c\u1ea3m gi\u00e1c th\u01b0 gi\u00e3n h\u01a1n l\u00e0 ch\u1ea1y qu\u00e1 nhi\u1ec1u \u0111i\u1ec3m.",
    ])
    return "\n".join(lines)


def _repair_slot_values(slot_data: Dict) -> Dict:
    repaired = dict(slot_data or {})
    for key, value in list(repaired.items()):
        if isinstance(value, str):
            repaired[key] = slot_filling_engine._repair_text_encoding(value)
    return repaired


def _build_filters(slot_data: Dict) -> Dict:
    filters = {}
    if slot_data.get("destination"):
        filters["destination"] = slot_data["destination"]
    if slot_data.get("budget_min"):
        filters["min_price"] = slot_data["budget_min"]
    if slot_data.get("budget_max"):
        filters["max_price"] = slot_data["budget_max"]
    if slot_data.get("duration"):
        filters["duration"] = slot_data["duration"]
    if slot_data.get("duration_min"):
        filters["duration_min"] = slot_data["duration_min"]
    if slot_data.get("duration_max"):
        filters["duration_max"] = slot_data["duration_max"]
    return filters


def _normalize_budget_slots(message: str, slot_data: Dict) -> Dict:
    """Avoid impossible price filters from natural budget phrases.

    Vietnamese users usually mean an upper budget when saying
    "ngân sách 10 triệu" / "chi phí khoảng 10 triệu". Some LLM outputs may
    set both budget_min and budget_max to the same value, which filters tours
    to exactly one price and hides valid cheaper tours.
    """
    import unicodedata

    normalized = dict(slot_data)
    text = unicodedata.normalize("NFD", message.lower().replace("đ", "d"))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    budget_min = normalized.get("budget_min")
    budget_max = normalized.get("budget_max")

    upper_budget_phrase = any(
        phrase in text
        for phrase in ["ngan sach", "chi phi", "khoang", "tam", "duoi", "toi da"]
    )
    lower_budget_phrase = any(
        phrase in text
        for phrase in ["tu ", "tren", "it nhat", "toi thieu"]
    )

    if budget_min and budget_max and budget_min == budget_max and upper_budget_phrase and not lower_budget_phrase:
        normalized["budget_min"] = None

    return normalized



def _fallback_missing_info_question(
    missing: List[str],
    slot_data: Dict,
    destination_suggestions: Optional[List[DestinationSuggestion]] = None,
) -> str:
    destination = slot_data.get("destination")

    if "địa điểm" in missing:
        if destination_suggestions:
            names = [item.destination for item in destination_suggestions[:3]]
            if len(names) == 1:
                return f"Mình đã nắm được gu chuyến đi rồi. Bạn muốn mình thử tìm quanh **{names[0]}** trước không?"
            return f"Mình đã hiểu kiểu trải nghiệm bạn thích. Bạn nghiêng về điểm nào hơn: **{', '.join(names[:-1])}** hay **{names[-1]}**?"
        return "Mình cần thêm điểm đến để tư vấn sát hơn. Bạn muốn đi **Đà Lạt**, đi biển, miền núi hay một nơi nghỉ dưỡng nhẹ nhàng?"

    if "số ngày" in missing:
        place = f" cho chuyến {destination}" if destination else ""
        return f"Bạn muốn đi gọn **3 ngày** hay thong thả hơn **4-5 ngày**{place}? Mình sẽ dựa vào đó để lọc lịch trình vừa nhịp hơn."

    if "ngân sách" in missing:
        place = f" ở {destination}" if destination else ""
        return f"Mình nên giữ ngân sách khoảng bao nhiêu/người{place}? Ví dụ **5 triệu**, **10 triệu** hoặc cao hơn một chút nếu bạn muốn lịch trình thoải mái hơn."

    return "Mình cần thêm một chút gu chuyến đi của bạn: bạn ưu tiên **nghỉ ngơi**, **check-in**, đi cùng gia đình/người yêu hay tối ưu chi phí hơn?"


def _recommend_with_relaxation(engine: RecommendationEngineDB, user_id: int, filters: Dict) -> tuple[List[Dict], Optional[str]]:
    result = engine.recommend_for_user(user_id=user_id, filters=filters, top_k=5)
    recommendations = result["recommendations"]
    if recommendations:
        return recommendations, None

    relaxed_filters = dict(filters)
    relaxed_filters.pop("duration", None)
    result = engine.recommend_for_user(user_id=user_id, filters=relaxed_filters, top_k=5)
    recommendations = result["recommendations"]
    if recommendations:
        return recommendations, "Mình chưa thấy tour khớp chính xác số ngày bạn muốn, nên đã nới tiêu chí thời lượng nhưng vẫn giữ điểm đến/ngân sách."

    if filters.get("max_price"):
        relaxed_filters = dict(filters)
        relaxed_filters.pop("duration", None)
        relaxed_filters.pop("max_price", None)
        result = engine.recommend_for_user(user_id=user_id, filters=relaxed_filters, top_k=5)
        recommendations = result["recommendations"]
        if recommendations:
            return recommendations, "Mình chưa thấy tour khớp đúng số ngày và ngân sách, nên đã nới tiêu chí để bạn có vài lựa chọn gần nhất."

    if filters.get("destination"):
        relaxed_filters = dict(filters)
        relaxed_filters.pop("destination", None)
        relaxed_filters.pop("duration", None)
        relaxed_filters.pop("min_price", None)
        relaxed_filters.pop("max_price", None)
        result = engine.recommend_for_user(user_id=user_id, filters=relaxed_filters, top_k=5)
        recommendations = result["recommendations"]
        if recommendations:
            return recommendations, "Mình chưa có tour đúng điểm đến này trong dữ liệu, nên mình tạm mở rộng sang các lựa chọn gần nhất để bạn tham khảo."

    return [], None
@app.post("/ai/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    _: bool = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """Chat với AI theo hướng LLM-first + RF recommendation ranking."""
    current_slots = _repair_slot_values(request.current_slots or {})
    last_recommendations = request.last_recommendations or []
    recent_messages = request.recent_messages or []

    decision = conversation_agent.analyze(
        user_message=request.message,
        current_slots=current_slots,
        last_recommendations=last_recommendations,
        recent_messages=recent_messages,
    )
    try:
        print(
            "[ChatIntent]",
            {
                "message": request.message,
                "intent": decision.intent,
                "should_recommend": decision.should_recommend,
                "slots_patch": decision.slots_patch,
                "has_last_recommendations": bool(last_recommendations),
            },
        )
    except Exception:
        pass

    if not decision.should_recommend:
        styled_answer = None
        referenced_indexes = decision.referenced_tour_indexes
        if decision.intent == "answer_about_recommendation" and not referenced_indexes:
            import re
            index_match = re.search(r"tour\s*(\d+)", request.message.lower())
            if index_match:
                referenced_indexes = [int(index_match.group(1))]

        if decision.intent in {"answer_about_recommendation", "compare_recommendations"}:
            styled_answer = conversation_agent.write_context_answer(
                user_message=request.message,
                intent=decision.intent,
                current_slots=current_slots,
                last_recommendations=last_recommendations,
                referenced_tour_indexes=referenced_indexes,
                recent_messages=recent_messages,
            )

        if decision.intent in {"answer_about_recommendation", "compare_recommendations"}:
            answer = styled_answer or _fallback_context_answer(
                decision.intent,
                last_recommendations,
                referenced_indexes,
            )
        else:
            answer = decision.answer or _fallback_context_answer(
                decision.intent,
                last_recommendations,
                referenced_indexes,
            )
        return ChatResponse(
            message=answer,
            slot_data=SlotData(**current_slots),
            is_complete=False,
            recommendations=None,
            session_id=request.session_id or 0,
        )

    slot_data = slot_filling_engine.extract_slots(
        request.message,
        current_slots=current_slots,
    )
    slot_data = _normalize_budget_slots(request.message, slot_data)
    for key, value in decision.slots_patch.items():
        if value is None:
            slot_data.pop(key, None)
        else:
            slot_data[key] = value

    slot_data = _normalize_budget_slots(request.message, slot_data)
    slot_data = _repair_slot_values(slot_data)
    is_complete = slot_filling_engine.is_complete(slot_data)

    if not is_complete:
        missing = slot_filling_engine.get_missing_slots(slot_data)
        destination_suggestions: Optional[List[Dict]] = None
        if "\u0111\u1ecba \u0111i\u1ec3m" in missing and slot_data.get("preferences"):
            engine = RecommendationEngineDB(db)
            raw_suggestions = engine.get_destinations_by_tags(
                tags=slot_data["preferences"],
                limit=5,
            )
            if raw_suggestions:
                destination_suggestions = [DestinationSuggestion(**s) for s in raw_suggestions]

        question = decision.answer.strip() if decision.answer and decision.intent == "ask_missing_info" else ""
        if not question:
            question = conversation_agent.write_missing_info_question(
                user_message=request.message,
                current_slots=slot_data,
                missing_slots=missing,
                destination_suggestions=[s.dict() for s in destination_suggestions] if destination_suggestions else None,
                recent_messages=recent_messages,
            ) or _fallback_missing_info_question(missing, slot_data, destination_suggestions)
        return ChatResponse(
            message=question,
            slot_data=SlotData(**slot_data),
            is_complete=False,
            recommendations=None,
            destination_suggestions=destination_suggestions,
            session_id=request.session_id or 0,
        )

    engine = RecommendationEngineDB(db)
    filters = _build_filters(slot_data)
    recommendations, relaxed_reason = _recommend_with_relaxation(engine, request.user_id, filters)
    message = conversation_agent.write_recommendation_response(
        user_message=request.message,
        slot_data=slot_data,
        recommendations=recommendations,
        relaxed_reason=relaxed_reason,
        recent_messages=recent_messages,
    )

    return ChatResponse(
        message=message,
        slot_data=SlotData(**slot_data),
        is_complete=True,
        recommendations=recommendations,
        session_id=request.session_id or 0,
    )

@app.post("/ai/update-profile")
async def update_profile(
    request: UpdateProfileRequest,
    _: bool = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """C?p nh?t user profile t? implicit feedback"""
    engine = RecommendationEngineDB(db)
    user_id = request.user_id
    action_type = request.action_type
    tour_id = request.tour_id
    
    # web-be already stores the raw action; this endpoint only updates learned preferences.
    engine.update_user_preferences(user_id, action_type, tour_id)
    
    return {"status": "updated", "user_id": user_id}


@app.get("/ai/explain/{tour_id}")
async def explain_recommendation(
    tour_id: int,
    _: bool = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """Giải thích lý do gợi ý tour"""
    engine = RecommendationEngineDB(db)
    
    tour_tags = engine.get_tour_tags(tour_id)
    top_tags = sorted(tour_tags.items(), key=lambda x: x[1], reverse=True)[:3]
    
    if not top_tags:
        return {
            "tour_id": tour_id,
            "explanation": "Tour này được gợi ý vì phù hợp với nhu cầu của bạn."
        }
    
    tag_list = ", ".join([f"{tag} ({weight:.0%})" for tag, weight in top_tags])
    
    return {
        "tour_id": tour_id,
        "explanation": f"Tour này nổi bật về: {tag_list}.",
        "tags": tour_tags
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
