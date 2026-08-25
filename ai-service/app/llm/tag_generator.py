"""
Tag Generator - Phân tích reviews và sinh tags
"""
from typing import List, Dict, Optional
from .tags import TAG_TAXONOMY, TAG_DESCRIPTIONS


class TagGenerator:
    """Generate tags từ reviews sử dụng LLM hoặc rule-based"""
    
    def __init__(self, llm_client=None):
        self.llm = llm_client
        self.taxonomy = TAG_TAXONOMY
        self.descriptions = TAG_DESCRIPTIONS
    
    def generate_tags(self, reviews: List[str], use_llm: bool = False) -> Dict[str, float]:
        """
        Generate tags từ danh sách reviews
        
        Args:
            reviews: Danh sách các review
            use_llm: Sử dụng LLM hay rule-based
        
        Returns:
            Dict of {tag: weight}
        """
        if not reviews:
            return {}
        
        if use_llm and self.llm:
            return self._generate_with_llm(reviews)
        else:
            return self._generate_rule_based(reviews)
    
    def _generate_rule_based(self, reviews: List[str]) -> Dict[str, float]:
        """
        Rule-based tag generation - sử dụng keyword matching
        """
        all_text = ' '.join(reviews).lower()
        total_reviews = len(reviews)
        
        tags = {}
        
        keywords = {
            'family': [
                'gia đình', 'cả nhà', 'bố mẹ', 'con', 'trẻ em', 'nhó',
                'vợ chồng', 'với vợ', 'với chồng', 'đi cả nhà', 'family'
            ],
            'romantic': [
                'lãng mạn', 'vợ', 'chồng', 'người yêu', 'bạn trai', 'bạn gái',
                'cặp đôi', 'tình yêu', 'honeymoon', 'romantic', 'date'
            ],
            'adventure': [
                'mạo hiểm', 'khám phá', 'leo núi', 'kayak', 'lặn', 'phiêu lưu',
                'trekking', 'zipline', 'adventure', 'racing'
            ],
            'beach': [
                'biển', 'bơi', 'đảo', 'bãi biển', 'nước trong', 'sóng',
                'tắm biển', 'beach', 'island', 'sea'
            ],
            'nature': [
                'thiên nhiên', 'cảnh đẹp', 'núi', 'rừng', 'sông', 'hồ',
                'thác', 'cây xanh', 'phong cảnh', 'nature'
            ],
            'food': [
                'ẩm thực', 'đồ ăn', 'ngon', 'đặc sản', 'món', 'ăn',
                'ẩm thực', 'thưởng thức', 'food', 'eating'
            ],
            'culture': [
                'văn hóa', 'lịch sử', 'di tích', 'chùa', 'đền', 'bảo tàng',
                'kiến trúc', 'cổ', 'heritage', 'history', 'culture'
            ],
            'relax': [
                'nghỉ dưỡng', 'thư giãn', 'spa', 'yên tĩnh', 'thoải mái',
                'massage', 'resort', 'relax', 'peaceful'
            ],
            'budget': [
                'giá rẻ', 'tiết kiệm', 'sinh viên', 'hợp lý', 'bình dân',
                'rẻ', 'budget', 'cheap', 'affordable'
            ],
            'luxury': [
                'sang trọng', 'cao cấp', '5 sao', 'premium', 'VIP',
                'luxury', 'deluxe', 'expensive'
            ],
            'spiritual': [
                'tâm linh', 'chùa', 'đền', 'thắp nến', 'cầu nguyện',
                'phật', 'spiritual', 'temple', 'pray'
            ],
            'photography': [
                'chụp ảnh', 'check-in', 'selfie', 'view', 'đẹp',
                'instagram', 'photo', 'picture', 'beautiful scenery'
            ],
            'shopping': [
                'mua sắm', 'chợ', 'quà', 'lưu niệm', 'trung tâm thương mại',
                'market', 'shopping', 'buy', 'souvenir'
            ],
            'mountain': [
                'núi', 'cao nguyên', 'leo núi', 'rừng', 'đỉnh',
                'mountain', 'hill', 'peak', 'highland'
            ],
            'city': [
                'thành phố', 'đô thị', 'phố', 'quán', 'club', 'bar',
                'nightlife', 'city', 'urban'
            ],
            'history': [
                'lịch sử', 'di tích', 'chiến tranh', 'triều đại', 'thành cổ',
                'bảo tàng', 'history', 'historical', 'war', 'museum'
            ],
            'festival': [
                'lễ hội', 'festival', 'thi đấu', 'đua ghe', 'đua bò',
                'hội làng', 'bài chòi', 'lim'
            ],
            'wildlife': [
                'động vật', 'safari', 'vườn thú', 'thú rừng', 'khỉ', 'voọc',
                'chim', 'wildlife', 'animal', 'safari', 'monkey'
            ],
            'cruise': [
                'du thuyền', 'tàu', 'cruise', 'boat', 'ship',
                'ngủ đêm trên tàu', 'vịnh'
            ],
            'nightlife': [
                'bar', 'club', 'phố đêm', 'beer club', 'nhạc sống',
                'quán bar', 'nightlife', 'pub', 'karaoke'
            ],
            'water_sports': [
                'lặn biển', 'snorkeling', 'kayak', 'surfing', 'lặn',
                'dù lượn', 'jet ski', 'paddleboard', 'diving'
            ],
        }
        
        # Count occurrences
        for tag, words in keywords.items():
            count = sum(1 for word in words if word in all_text)
            if count > 0:
                # Weight = ratio of reviews containing the tag
                tags[tag] = min(0.95, 0.3 + (count * 0.1))
        
        return tags
    
    def _generate_with_llm(self, reviews: List[str]) -> Dict[str, float]:
        """
        Generate tags sử dụng LLM (Gemini)
        """
        if not self.llm:
            return self._generate_rule_based(reviews)
        
        return self.llm.generate_tags_from_reviews(reviews)
    
    def validate_tags(self, tags: Dict[str, float]) -> Dict[str, float]:
        """Validate và normalize tags"""
        valid = {}
        
        for tag, weight in tags.items():
            # Chỉ chấp nhận tags trong taxonomy
            if tag not in self.taxonomy:
                continue
            
            # Weight phải trong khoảng 0-1
            weight = max(0.0, min(1.0, weight))
            
            if weight > 0.05:  # Chỉ giữ lại tags có weight > 5%
                valid[tag] = round(weight, 2)
        
        return valid
    
    def merge_tags(self, tags_list: List[Dict[str, float]]) -> Dict[str, float]:
        """
        Merge nhiều dictionaries của tags (cho nhiều reviews)
        Tính trung bình có trọng số
        """
        if not tags_list:
            return {}
        
        # Đếm số lần mỗi tag xuất hiện
        tag_counts = {}
        tag_weights = {}
        
        for tags in tags_list:
            for tag, weight in tags.items():
                if tag not in tag_weights:
                    tag_weights[tag] = 0
                    tag_counts[tag] = 0
                tag_weights[tag] += weight
                tag_counts[tag] += 1
        
        # Tính trung bình
        merged = {}
        for tag, total_weight in tag_weights.items():
            merged[tag] = total_weight / tag_counts[tag]
        
        return self.validate_tags(merged)
