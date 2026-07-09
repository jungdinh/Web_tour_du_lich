import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from typing import List, Dict, Optional
from .tags import TAG_TAXONOMY


class CosineSimilarityEngine:
    """Content-Based Filtering bằng Cosine Similarity"""
    
    def __init__(self):
        self.tag_to_index = {tag: i for i, tag in enumerate(TAG_TAXONOMY)}
        self.n_tags = len(TAG_TAXONOMY)
    
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
        """Tính cosine similarity giữa user và tour"""
        # Trường hợp vector toàn 0
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
        exploration_ratio: float = 0.2
    ) -> List[Dict]:
        """
        Xếp hạng tours dựa trên user preferences
        
        Args:
            user_preferences: Dict of {tag: weight}
            tours_with_tags: List of {id, name, tags: {tag: weight}, ...}
            top_k: Số lượng tour cần lấy
            exploration_ratio: Tỷ lệ khám phá (20% noise)
        
        Returns:
            List of ranked tours with similarity scores
        """
        user_vector = self.user_to_vector(user_preferences)
        
        scored_tours = []
        for tour in tours_with_tags:
            tour_vector = self.tour_to_vector(tour.get("tags", {}))
            score = self.calculate_similarity(user_vector, tour_vector)
            
            scored_tours.append({
                "tour_id": tour["id"],
                "name": tour.get("name", ""),
                "score": float(score),
                "tags": tour.get("tags", {}),
                "destination": tour.get("destination", ""),
                "price": tour.get("price", 0),
            })
        
        # Sắp xếp theo score giảm dần
        scored_tours.sort(key=lambda x: x["score"], reverse=True)
        
        # Exploration: Trộn một phần với tours trending
        n_exploitation = int(len(scored_tours) * (1 - exploration_ratio))
        exploitation = scored_tours[:n_exploitation]
        
        # Giữ nguyên thứ tự exploitation
        return exploitation[:top_k]
