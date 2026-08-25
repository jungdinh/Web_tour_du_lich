"""
Recommendation Engine - Core của hệ thống gợi ý
"""
import numpy as np
from typing import List, Dict, Optional, Tuple
from sklearn.metrics.pairwise import cosine_similarity
from .tags import TAG_TAXONOMY


class RecommendationEngine:
    """
    Recommendation Engine sử dụng Content-Based Filtering + Cosine Similarity
    """
    
    def __init__(self, min_reviews_for_tag: int = 5):
        self.tag_to_index = {tag: i for i, tag in enumerate(TAG_TAXONOMY)}
        self.n_tags = len(TAG_TAXONOMY)
        self.min_reviews_for_tag = min_reviews_for_tag
    
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
        tours_with_tags: List[Dict],
        top_k: int = 10,
        exploration_ratio: float = 0.2,
        min_score: float = 0.1
    ) -> List[Dict]:
        """
        Xếp hạng tours dựa trên user preferences
        
        Args:
            user_preferences: Dict of {tag: weight}
            tours_with_tags: List of {id, name, tags: {tag: weight}, ...}
            top_k: Số lượng tour cần lấy
            exploration_ratio: Tỷ lệ khám phá (20% noise)
            min_score: Ngưỡng tối thiểu để include tour
        
        Returns:
            List of ranked tours with similarity scores
        """
        user_vector = self.user_to_vector(user_preferences)
        
        scored_tours = []
        for tour in tours_with_tags:
            tour_vector = self.tour_to_vector(tour.get("tags", {}))
            score = self.calculate_similarity(user_vector, tour_vector)
            
            if score >= min_score:
                scored_tours.append({
                    "tour_id": tour["id"],
                    "name": tour.get("name", ""),
                    "score": float(score),
                    "tags": tour.get("tags", {}),
                    "destination": tour.get("destination", ""),
                    "price": tour.get("price", 0),
                    "avg_rating": tour.get("avg_rating", 0),
                })
        
        # Sắp xếp theo score giảm dần
        scored_tours.sort(key=lambda x: x["score"], reverse=True)
        
        # Exploration: Thêm một phần diversity
        n_exploitation = int(len(scored_tours) * (1 - exploration_ratio))
        exploitation = scored_tours[:n_exploitation]
        
        return exploitation[:top_k]
    
    def explain_recommendation(
        self,
        tour: Dict,
        user_preferences: Dict[str, float]
    ) -> str:
        """Giải thích lý do gợi ý tour"""
        tour_tags = tour.get("tags", {})
        top_tags = sorted(tour_tags.items(), key=lambda x: x[1], reverse=True)[:3]
        
        if not top_tags:
            return f"Tour '{tour['name']}' được gợi ý vì phù hợp với nhu cầu của bạn."
        
        tag_explanations = []
        for tag, weight in top_tags:
            user_pref = user_preferences.get(tag, 0)
            
            if user_pref > 0.5:
                tag_explanations.append(f"bạn thích {tag}")
            elif user_pref > 0:
                tag_explanations.append(f"phù hợp với sở thích {tag}")
            else:
                tag_explanations.append(f"{tag} ({weight:.0%})")
        
        if tag_explanations:
            return f"Tour này được gợi ý vì {', '.join(tag_explanations)}."
        
        return f"Tour '{tour['name']}' phù hợp với nhu cầu của bạn."
    
    def calculate_tag_relevance(
        self,
        tour_tags: Dict[str, float],
        user_preferences: Dict[str, float]
    ) -> Dict[str, float]:
        """Tính độ relevance của từng tag"""
        relevance = {}
        
        for tag, tour_weight in tour_tags.items():
            user_pref = user_preferences.get(tag, 0)
            
            # Relevance = tour_weight * user_preference
            # Cao nếu cả hai đều cao
            relevance[tag] = tour_weight * user_pref
        
        return relevance


class ColdStartHandler:
    """Xử lý Cold Start problem"""
    
    def __init__(self, db_connection):
        self.db = db_connection
    
    def get_popular_tours(self, limit: int = 10) -> List[Dict]:
        """Lấy tour phổ biến cho new user"""
        # TODO: Implement with actual DB query
        return []
    
    def get_trending_tours(self, limit: int = 10) -> List[Dict]:
        """Lấy tour trending gần đây"""
        # TODO: Implement với thêm bảng trending
        return []
    
    def get_diverse_tours(self, limit: int = 10) -> List[Dict]:
        """Lấy tour đa dạng để giới thiệu"""
        # TODO: Random sample từ các destination khác nhau
        return []


class UserProfileBuilder:
    """Xây dựng User Profile từ Implicit Feedback"""
    
    ACTION_WEIGHTS = {
        "click": 0.1,
        "view": 0.2,
        "save": 0.5,
        "search": 0.3,
    }
    
    def __init__(self):
        pass
    
    def update_preferences(
        self,
        current_prefs: Dict[str, float],
        action_type: str,
        tour_tags: Dict[str, float]
    ) -> Dict[str, float]:
        """
        Cập nhật user preferences dựa trên implicit feedback
        
        Sử dụng Exponential Moving Average:
        new_weight = current + learning_rate * (target - current)
        """
        learning_rate = self.ACTION_WEIGHTS.get(action_type, 0.1)
        new_prefs = current_prefs.copy()
        
        for tag, tour_weight in tour_tags.items():
            current = current_prefs.get(tag, 0.0)
            
            # EMA update
            new_weight = current + learning_rate * tour_weight * (1 - current)
            new_weight = min(1.0, max(0.0, new_weight))
            
            new_prefs[tag] = new_weight
        
        return new_prefs
    
    def normalize_preferences(self, prefs: Dict[str, float]) -> Dict[str, float]:
        """Normalize preferences về sum = 1"""
        total = sum(prefs.values())
        if total == 0:
            return prefs
        
        return {k: v / total for k, v in prefs.items()}
