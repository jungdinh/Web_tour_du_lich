"""
Recommendation Engine với Database Integration
"""
import numpy as np
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from sklearn.metrics.pairwise import cosine_similarity

from .tags import TAG_TAXONOMY
from .ml_ranker import MLRanker
from ..llm.tag_generator import TagGenerator
from ..models.database import Tour, TourTag, User, UserPreference, UserAction
from ..config import get_settings


_SHARED_ML_RANKER = MLRanker()
_SHARED_TAG_GENERATOR = TagGenerator()

class RecommendationEngineDB:
    """
    Recommendation Engine với database integration
    """

    def __init__(self, db: Session, min_reviews_for_tag: Optional[int] = None):
        self.db = db
        settings = get_settings()
        self.min_reviews_for_tag = (
            min_reviews_for_tag
            if min_reviews_for_tag is not None
            else settings.min_reviews_for_tag
        )
        self.tag_to_index = {tag: i for i, tag in enumerate(TAG_TAXONOMY)}
        self.n_tags = len(TAG_TAXONOMY)
        self.ml_ranker = _SHARED_ML_RANKER

    def _tour_payload(self, tour: Tour, tags: Optional[Dict[str, float]] = None) -> Dict:
        return {
            "id": tour.id,
            "name": tour.name,
            "destination": tour.destination,
            "price": tour.price,
            "duration": tour.duration,
            "duration_label": getattr(tour, "duration_label", None),
            "original_price": getattr(tour, "original_price", None),
            "description": tour.description,
            "avg_rating": tour.avg_rating,
            "review_count": tour.review_count or 0,
            "image_url": tour.image_url,
            "highlights": getattr(tour, "highlights", None),
            "places": getattr(tour, "places", None),
            "topics": getattr(tour, "topics", None),
            "gallery": getattr(tour, "gallery", None),
            "itinerary": getattr(tour, "itinerary", None),
            "included": getattr(tour, "included", None),
            "excluded": getattr(tour, "excluded", None),
            "schedule": getattr(tour, "schedule", None),
            "transport": getattr(tour, "transport", None),
            "tags": tags if tags is not None else self.get_tour_tags(tour.id),
        }

    def _apply_destination_filter(self, query, destination: str):
        pattern = f"%{destination}%"
        return query.filter(
            or_(
                Tour.destination.ilike(pattern),
                Tour.name.ilike(pattern),
            )
        )

    
    def get_user_preferences(self, user_id: int) -> Dict[str, float]:
        """Lấy user preferences từ database"""
        prefs = self.db.query(UserPreference).filter(
            UserPreference.user_id == user_id
        ).all()
        
        return {pref.tag: pref.weight for pref in prefs}
    
    def get_tour_tags(self, tour_id: int) -> Dict[str, float]:
        """Lấy tags của một tour"""
        tags = self.db.query(TourTag).filter(
            TourTag.tour_id == tour_id
        ).all()
        
        return {tag.tag: tag.weight for tag in tags}
    
    def get_all_tours_with_tags(self, filters: Optional[Dict] = None) -> List[Dict]:
        """Lấy tất cả tours với tags"""
        query = self.db.query(Tour)

        if filters:
            if filters.get("destination"):
                query = self._apply_destination_filter(query, filters["destination"])
            if filters.get("min_price"):
                query = query.filter(Tour.price >= filters["min_price"])
            if filters.get("max_price"):
                query = query.filter(Tour.price <= filters["max_price"])
            if filters.get("duration"):
                query = query.filter(Tour.duration == filters["duration"])
            if filters.get("duration_min"):
                query = query.filter(Tour.duration >= filters["duration_min"])
            if filters.get("duration_max"):
                query = query.filter(Tour.duration <= filters["duration_max"])

        tours = query.all()
        tour_ids = [tour.id for tour in tours]
        tags_by_tour: Dict[int, Dict[str, float]] = {tour_id: {} for tour_id in tour_ids}

        if tour_ids:
            tag_rows = self.db.query(TourTag).filter(TourTag.tour_id.in_(tour_ids)).all()
            for tag_row in tag_rows:
                tags_by_tour.setdefault(tag_row.tour_id, {})[tag_row.tag] = tag_row.weight

        result = []
        for tour in tours:
            tags = dict(tags_by_tour.get(tour.id, {}))
            review_count = tour.review_count or 0

            # P2: Cold-start fallback. Tours with very few reviews have
            # unreliable tag distributions because the rule-based/LLM tagger
            # hasn't had enough signal. Boost their tag coverage by inferring
            # tags from the tour description (uses LLM when available).
            if review_count < self.min_reviews_for_tag:
                tags = self._augment_tags_from_description(
                    description=tour.description or "",
                    existing_tags=tags,
                )

            result.append(self._tour_payload(tour, tags))

        return result

    def _augment_tags_from_description(
        self,
        description: str,
        existing_tags: Dict[str, float],
    ) -> Dict[str, float]:
        """
        Infer tags for a tour that doesn't yet have enough review signal.

        Strategy:
        - Try the LLM (Gemini) via TagGenerator if it is available.
        - Otherwise fall back to a deterministic keyword scan over the
          taxonomy descriptions that mirrors the rule-based TagGenerator.
        - Merge inferred tags with existing_tags, giving precedence to the
          higher weight between the two sources so we don't overwrite better
          review-derived tags.
        """
        if not description:
            return existing_tags

        inferred = _SHARED_TAG_GENERATOR._generate_rule_based([description]) or {}

        # Merge: keep existing weight if higher, else use inferred.
        merged = dict(existing_tags)
        for tag, weight in inferred.items():
            if merged.get(tag, 0) < weight:
                merged[tag] = weight
        return merged
    
    def get_popular_tours(
        self,
        limit: int = 10,
        filters: Optional[Dict] = None,
    ) -> List[Dict]:
        """Lấy tour phổ biến, vẫn tôn trọng filter của người dùng mới."""
        query = self.db.query(Tour)
        if filters:
            if filters.get("destination"):
                query = self._apply_destination_filter(query, filters["destination"])
            if filters.get("min_price"):
                query = query.filter(Tour.price >= filters["min_price"])
            if filters.get("max_price"):
                query = query.filter(Tour.price <= filters["max_price"])
            if filters.get("duration"):
                query = query.filter(Tour.duration == filters["duration"])
            if filters.get("duration_min"):
                query = query.filter(Tour.duration >= filters["duration_min"])
            if filters.get("duration_max"):
                query = query.filter(Tour.duration <= filters["duration_max"])

        tours = query.order_by(
            Tour.avg_rating.desc(),
            Tour.review_count.desc()
        ).limit(limit).all()

        return [self._tour_payload(t) for t in tours]
    def get_destinations_by_tags(
        self,
        tags: List[str],
        limit: int = 5,
    ) -> List[Dict]:
        """
        Gợi ý destinations dựa trên tags user quan tâm.

        Dùng khi user nói "đi biển" mà chưa rõ đi đâu cụ thể —
        trả về top destinations có tour match các tag đó.

        Returns:
            List of {destination, tour_count, avg_rating, sample_tour_names}
            Sắp xếp theo số tour + rating trung bình.
        """
        if not tags:
            return []

        # Subquery: tour IDs có bất kỳ tag nào match
        tag_tour_subq = (
            self.db.query(TourTag.tour_id)
            .filter(TourTag.tag.in_(tags))
            .distinct()
            .subquery()
        )

        rows = (
            self.db.query(
                Tour.destination,
                func.count(Tour.id).label("tour_count"),
                func.avg(Tour.avg_rating).label("avg_rating"),
            )
            .filter(Tour.id.in_(tag_tour_subq))
            .group_by(Tour.destination)
            .order_by(
                func.count(Tour.id).desc(),
                func.avg(Tour.avg_rating).desc(),
            )
            .limit(limit)
            .all()
        )

        result = []
        for r in rows:
            # Lấy tên 2-3 tour mẫu ở destination này
            sample_tours = (
                self.db.query(Tour.name)
                .filter(
                    Tour.destination == r.destination,
                    Tour.id.in_(tag_tour_subq),
                )
                .order_by(Tour.avg_rating.desc())
                .limit(3)
                .all()
            )
            result.append({
                "destination": r.destination,
                "tour_count": int(r.tour_count),
                "avg_rating": float(r.avg_rating) if r.avg_rating else None,
                "sample_tour_names": [t.name for t in sample_tours],
            })

        return result

    def user_to_vector(self, user_preferences: Dict[str, float]) -> np.ndarray:
        """Chuyển user preferences thành vector"""
        vector = np.zeros(self.n_tags)
        for tag, weight in user_preferences.items():
            if tag in self.tag_to_index:
                vector[self.tag_to_index[tag]] = weight
        return vector
    
    def tour_to_vector(self, tour_tags: Dict[str, float]) -> np.ndarray:
        """Chuyển tour tags thành vector"""
        vector = np.zeros(self.n_tags)
        for tag, weight in tour_tags.items():
            if tag in self.tag_to_index:
                vector[self.tag_to_index[tag]] = weight
        return vector
    
    def calculate_similarity(
        self,
        user_vector: np.ndarray,
        tour_vector: np.ndarray
    ) -> float:
        """Tính cosine similarity"""
        norm_user = np.linalg.norm(user_vector)
        norm_tour = np.linalg.norm(tour_vector)
        
        if norm_user == 0 or norm_tour == 0:
            return 0.0
        
        return cosine_similarity(
            user_vector.reshape(1, -1),
            tour_vector.reshape(1, -1)
        )[0][0]
    
    def rank_tours(
        self,
        user_preferences: Dict[str, float],
        tours: List[Dict],
        top_k: int = 10,
        exploration_ratio: float = 0.2,
        filters: Optional[Dict] = None,
    ) -> List[Dict]:
        """Xếp hạng tours dựa trên user preferences"""
        user_vector = self.user_to_vector(user_preferences)
        
        scored_tours = []
        for tour in tours:
            tour_vector = self.tour_to_vector(tour.get("tags", {}))
            score = self.calculate_similarity(user_vector, tour_vector)
            
            scored_tours.append({
                **tour,
                "tour_id": tour["id"],
                "score": float(score),
            })
        
        # Sắp xếp theo score giảm dần
        scored_tours.sort(key=lambda x: x["score"], reverse=True)
        
        # Exploration
        n_exploitation = max(1, int(len(scored_tours) * (1 - exploration_ratio))) if scored_tours else 0
        exploitation = scored_tours[:n_exploitation]

        if self.ml_ranker.enabled:
            return self.ml_ranker.rerank(
                exploitation,
                user_preferences=user_preferences,
                filters=filters,
                top_k=top_k,
            )

        return exploitation[:top_k]

    def preferences_from_filters(self, filters: Optional[Dict]) -> Dict[str, float]:
        """Build lightweight preferences for cold-start chat/search filters."""
        filters = filters or {}
        preferences: Dict[str, float] = {}

        for tag in filters.get("preferences") or filters.get("tags") or []:
            if tag in TAG_TAXONOMY:
                preferences[tag] = max(preferences.get(tag, 0.0), 0.85)

        destination = str(filters.get("destination") or "").lower()
        destination_tag_map = {
            "đà lạt": ["nature", "photography", "romantic", "relax", "mountain"],
            "da lat": ["nature", "photography", "romantic", "relax", "mountain"],
            "đà nẵng": ["beach", "city", "family", "food", "water_sports"],
            "da nang": ["beach", "city", "family", "food", "water_sports"],
            "phú quốc": ["beach", "relax", "luxury", "family", "romantic"],
            "phu quoc": ["beach", "relax", "luxury", "family", "romantic"],
            "sapa": ["mountain", "nature", "adventure", "photography", "culture"],
            "sa pa": ["mountain", "nature", "adventure", "photography", "culture"],
            "hạ long": ["cruise", "beach", "family", "luxury", "photography"],
            "ha long": ["cruise", "beach", "family", "luxury", "photography"],
            "nha trang": ["beach", "water_sports", "nightlife", "family", "food"],
            "huế": ["history", "culture", "food", "spiritual", "city"],
            "hue": ["history", "culture", "food", "spiritual", "city"],
            "hội an": ["culture", "history", "food", "photography", "romantic"],
            "hoi an": ["culture", "history", "food", "photography", "romantic"],
        }
        for keyword, tags in destination_tag_map.items():
            if keyword in destination:
                for tag in tags:
                    preferences[tag] = max(preferences.get(tag, 0.0), 0.65)

        if filters.get("max_price"):
            preferences["budget"] = max(preferences.get("budget", 0.0), 0.55)

        return preferences
    
    def recommend_for_user(
        self,
        user_id: int,
        filters: Optional[Dict] = None,
        top_k: int = 10
    ) -> Dict:
        """Gợi ý tour cho user"""
        user_prefs = self.get_user_preferences(user_id)
        
        # Cold start: user chưa có preferences
        if not user_prefs:
            filter_prefs = self.preferences_from_filters(filters)
            if filter_prefs and self.ml_ranker.enabled:
                tours = self.get_all_tours_with_tags(filters)
                reranked = self.ml_ranker.rerank(
                    tours,
                    user_preferences=filter_prefs,
                    filters=filters,
                    top_k=top_k,
                )
                return {
                    "recommendations": reranked,
                    "is_cold_start": True,
                }

            popular = self.get_popular_tours(limit=top_k, filters=filters)
            return {
                "recommendations": popular,
                "is_cold_start": True,
            }
        
        # Lấy tours theo filters
        tours = self.get_all_tours_with_tags(filters)
        
        # Rank
        ranked = self.rank_tours(user_prefs, tours, top_k, filters=filters)
        
        return {
            "recommendations": ranked,
            "is_cold_start": False,
        }
    
    def update_user_preferences(
        self,
        user_id: int,
        action_type: str,
        tour_id: int
    ):
        """Cập nhật user preferences từ implicit feedback"""
        ACTION_WEIGHTS = {
            "save": 0.7,
            "click": 0.35,
            "search": 0.18,
            "view": 0.0,
        }
        
        update_weight = ACTION_WEIGHTS.get(action_type, 0.0)
        if update_weight <= 0:
            return

        tour_tags = self.get_tour_tags(tour_id)
        
        for tag, tour_weight in tour_tags.items():
            if tag not in TAG_TAXONOMY:
                continue
            
            # Lấy hoặc tạo preference
            pref = self.db.query(UserPreference).filter(
                UserPreference.user_id == user_id,
                UserPreference.tag == tag
            ).first()
            
            if pref:
                # EMA update
                new_weight = pref.weight + update_weight * tour_weight * (1 - pref.weight)
                pref.weight = min(1.0, max(0.0, new_weight))
            else:
                new_pref = UserPreference(
                    user_id=user_id,
                    tag=tag,
                    weight=update_weight * tour_weight
                )
                self.db.add(new_pref)
        
        self.db.commit()
    
    def log_action(
        self,
        user_id: int,
        action_type: str,
        tour_id: Optional[int] = None,
        search_query: Optional[str] = None
    ):
        """Log action vào database"""
        action = UserAction(
            user_id=user_id,
            tour_id=tour_id,
            action_type=action_type,
            search_query=search_query
        )
        self.db.add(action)
        self.db.commit()
