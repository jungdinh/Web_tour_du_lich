from typing import List, Dict, Any
import re


def deduplicate_tours(tours: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Loại bỏ các tour trùng lặp dựa trên tên và nguồn"""
    seen = set()
    unique_tours = []
    
    for tour in tours:
        # Tạo key từ tên (lowercase, không dấu) và nguồn
        name_key = re.sub(r'[^\w\s]', '', tour.get('name', '').lower())
        name_key = re.sub(r'\s+', ' ', name_key).strip()
        source = tour.get('source', '')
        
        key = f"{name_key}|{source}"
        
        if key not in seen:
            seen.add(key)
            unique_tours.append(tour)
    
    return unique_tours


def deduplicate_reviews(reviews: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Loại bỏ các review trùng lặp dựa trên nội dung"""
    seen = set()
    unique_reviews = []
    
    for review in reviews:
        content = review.get('content', '').strip().lower()
        
        if not content or len(content) < 10:
            continue
        
        if content not in seen:
            seen.add(content)
            unique_reviews.append(review)
    
    return unique_reviews
