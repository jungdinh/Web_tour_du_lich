from typing import Dict, List, Optional
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from .tags import TAG_TAXONOMY
from .cosine import CosineSimilarityEngine


class RecommendationEngine:
    """Recommendation Engine - Core của hệ thống"""
    
    def __init__(self, database_url: str):
        self.engine = create_engine(database_url)
        self.SessionLocal = sessionmaker(bind=self.engine)
        self.cosine_engine = CosineSimilarityEngine()
    
    def get_session(self) -> Session:
        return self.SessionLocal()
    
    def get_user_preferences(self, user_id: int) -> Dict[str, float]:
        """Lấy user preferences từ database"""
        session = self.get_session()
        try:
            result = session.execute(
                f"SELECT tag, weight FROM user_preferences WHERE user_id = {user_id}"
            )
            return {row[0]: row[1] for row in result}
        finally:
            session.close()
    
    def get_tour_tags(self, tour_id: int) -> Dict[str, float]:
        """Lấy tags của một tour"""
        session = self.get_session()
        try:
            result = session.execute(
                f"SELECT tag, weight FROM tour_tags WHERE tour_id = {tour_id}"
            )
            return {row[0]: row[1] for row in result}
        finally:
            session.close()
    
    def get_popular_tours(self, limit: int = 10) -> List[Dict]:
        """Lấy danh sách tour phổ biến (fallback cho cold-start)"""
        session = self.get_session()
        try:
            result = session.execute(
                f"""
                SELECT id, name, destination, price, avg_rating
                FROM tours
                ORDER BY avg_rating DESC, review_count DESC
                LIMIT {limit}
                """
            )
            return [
                {
                    "id": row[0],
                    "name": row[1],
                    "destination": row[2],
                    "price": row[3],
                    "avg_rating": row[4],
                }
                for row in result
            ]
        finally:
            session.close()
    
    def recommend_for_user(
        self,
        user_id: int,
        filters: Optional[Dict] = None,
        top_k: int = 10
    ) -> List[Dict]:
        """
        Gợi ý tour cho user
        
        Args:
            user_id: ID của user
            filters: Các bộ lọc (destination, price_range, duration, tags)
            top_k: Số lượng tour cần lấy
        
        Returns:
            List of recommended tours with scores
        """
        session = self.get_session()
        try:
            # Lấy user preferences
            user_prefs = self.get_user_preferences(user_id)
            
            # Nếu user chưa có preferences, trả về tour phổ biến
            if not user_prefs:
                popular = self.get_popular_tours(limit=top_k)
                return [{"tour": t, "score": 0.0, "reason": "cold_start"} for t in popular]
            
            # Build query để lấy tours với tags
            query = """
                SELECT t.id, t.name, t.destination, t.price, t.avg_rating,
                       COALESCE(json_agg(json_build_object('tag', tt.tag, 'weight', tt.weight))
                           FILTER (WHERE tt.tag IS NOT NULL), '[]') as tags
                FROM tours t
                LEFT JOIN tour_tags tt ON t.id = tt.tour_id
            """
            
            conditions = []
            params = []
            
            if filters:
                if filters.get("destination"):
                    conditions.append("t.destination ILIKE %s")
                    params.append(f"%{filters['destination']}%")
                if filters.get("min_price"):
                    conditions.append("t.price >= %s")
                    params.append(filters["min_price"])
                if filters.get("max_price"):
                    conditions.append("t.price <= %s")
                    params.append(filters["max_price"])
                if filters.get("duration"):
                    conditions.append("t.duration = %s")
                    params.append(filters["duration"])
            
            if conditions:
                query += " WHERE " + " AND ".join(conditions)
            
            query += " GROUP BY t.id ORDER BY t.avg_rating DESC"
            
            result = session.execute(query, params)
            
            tours = []
            for row in result:
                tags_dict = {}
                for tag_item in (row[5] or []):
                    if isinstance(tag_item, dict):
                        tags_dict[tag_item.get("tag", "")] = tag_item.get("weight", 0)
                
                tours.append({
                    "id": row[0],
                    "name": row[1],
                    "destination": row[2],
                    "price": row[3],
                    "avg_rating": row[4],
                    "tags": tags_dict,
                })
            
            # Rank using Cosine Similarity
            ranked = self.cosine_engine.rank_tours(
                user_prefs, tours, top_k=top_k
            )
            
            return ranked
            
        finally:
            session.close()
    
    def update_user_preferences(
        self, 
        user_id: int, 
        action_type: str, 
        tour_tags: Dict[str, float]
    ):
        """
        Cập nhật user preferences dựa trên implicit feedback
        
        Action weights:
        - click: 0.1 (nhẹ)
        - view: 0.2 (trung bình)
        - save: 0.5 (mạnh)
        - search: 0.3 (tùy keyword)
        """
        action_weights = {
            "click": 0.1,
            "view": 0.2,
            "save": 0.5,
            "search": 0.3,
        }
        
        update_weight = action_weights.get(action_type, 0.1)
        
        session = self.get_session()
        try:
            for tag, tour_weight in tour_tags.items():
                # Kiểm tra tag có trong taxonomy không
                if tag not in TAG_TAXONOMY:
                    continue
                
                # Lấy weight hiện tại
                result = session.execute(
                    f"""
                    SELECT weight FROM user_preferences 
                    WHERE user_id = {user_id} AND tag = '{tag}'
                    """
                )
                row = result.fetchone()
                
                current_weight = row[0] if row else 0.0
                
                # Exponential moving average
                new_weight = current_weight + update_weight * tour_weight * (1 - current_weight)
                new_weight = min(1.0, max(0.0, new_weight))
                
                if row:
                    session.execute(
                        f"""
                        UPDATE user_preferences 
                        SET weight = {new_weight}
                        WHERE user_id = {user_id} AND tag = '{tag}'
                        """
                    )
                else:
                    session.execute(
                        f"""
                        INSERT INTO user_preferences (user_id, tag, weight)
                        VALUES ({user_id}, '{tag}', {new_weight})
                        """
                    )
            
            session.commit()
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
