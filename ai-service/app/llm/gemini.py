import os
import google.generativeai as genai
from typing import List, Dict, Optional
from app.engine.tags import TAG_TAXONOMY, TAG_DESCRIPTIONS
from app.schemas import SlotData


class GeminiLLM:
    """Gemini API integration"""
    
    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel("gemini-1.5-flash")
    
    def generate_tags_from_reviews(self, reviews: List[str]) -> Dict[str, float]:
        """
        Phân tích reviews và sinh tag theo Taxonomy
        
        Returns:
            Dict of {tag: weight} với weight = tỷ lệ xuất hiện
        """
        if not reviews:
            return {}
        
        # Build prompt với taxonomy
        taxonomy_text = "\n".join([
            f"- {tag}: {TAG_DESCRIPTIONS[tag]}"
            for tag in TAG_TAXONOMY
        ])
        
        reviews_text = "\n\n".join([
            f"- Review {i+1}: {review}"
            for i, review in enumerate(reviews[:50])  # Giới hạn 50 reviews
        ])
        
        prompt = f"""Bạn là chuyên gia phân tích du lịch. Hãy phân tích các review sau và gán tags phù hợp từ taxonomy đã cho.

TAG TAXONOMY:
{taxonomy_text}

REVIEWS:
{reviews_text}

YÊU CẦU:
1. Đọc kỹ từng review và xác định các tags phù hợp
2. Chỉ sử dụng tags từ taxonomy trên, không tạo tags mới
3. Tính trọng số = (số review gắn tag) / (tổng số review)
4. Trả về JSON theo format: {{"tag_name": weight, ...}}

Chỉ trả về JSON, không có text khác:"""
        
        try:
            response = self.model.generate_content(prompt)
            response_text = response.text.strip()
            
            # Parse JSON response
            import json
            # Remove markdown code blocks if present
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
            
            tags = json.loads(response_text.strip())
            
            # Validate tags
            valid_tags = {}
            for tag, weight in tags.items():
                if tag in TAG_TAXONOMY and 0 <= weight <= 1:
                    valid_tags[tag] = weight
            
            return valid_tags
            
        except Exception as e:
            print(f"Error generating tags: {e}")
            return {}
    
    def extract_slots(self, user_message: str, current_slots: Optional[Dict] = None) -> SlotData:
        """
        Trích xuất thông tin từ message của user (Slot Filling)
        
        Args:
            user_message: Tin nhắn của user
            current_slots: Các slots đã có từ trước
        
        Returns:
            SlotData object với các thông tin đã trích xuất
        """
        current = current_slots or {}
        
        taxonomy_text = "\n".join([
            f"- {tag}: {TAG_DESCRIPTIONS[tag]}"
            for tag in TAG_TAXONOMY
        ])
        
        prompt = f"""Bạn là trợ lý tư vấn du lịch. Hãy trích xuất thông tin từ tin nhắn của user.

TAG TAXONOMY (dùng để nhận diện sở thích):
{taxonomy_text}

Các loại companions:
- family: gia đình, có con, cả nhà
- couple: vợ/chồng, người yêu, cặp đôi
- friends: bạn bè
- solo: một mình

Các mùa:
- spring: xuân (tháng 3-5)
- summer: hè (tháng 6-8)
- autumn: thu (tháng 9-11)
- winter: đông (tháng 12-2)

Tin nhắn user: "{user_message}"

Thông tin đã có: {current}

YÊU CẦU:
1. Trích xuất các thông tin: destination, companions, budget_min, budget_max, duration, preferences, season
2. Giữ nguyên các thông tin đã có từ trước
3. Chỉ trả về JSON theo format:
{{
    "destination": "địa điểm hoặc null",
    "companions": ["family/couple/friends/solo"] hoặc null,
    "budget_min": số hoặc null,
    "budget_max": số hoặc null,
    "duration": số ngày hoặc null,
    "preferences": ["tag1", "tag2"] hoặc null,
    "season": "mùa hoặc null"
}}

Chỉ trả về JSON:"""
        
        try:
            response = self.model.generate_content(prompt)
            response_text = response.text.strip()
            
            import json
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
            
            data = json.loads(response_text.strip())
            return SlotData(**data)
            
        except Exception as e:
            print(f"Error extracting slots: {e}")
            return SlotData()
    
    def generate_follow_up_question(self, slot_data: SlotData) -> str:
        """Tạo câu hỏi để hỏi ngược user về thông tin còn thiếu"""
        
        missing = []
        
        if not slot_data.destination:
            missing.append("địa điểm bạn muốn đi")
        if not slot_data.duration:
            missing.append("số ngày bạn muốn đi")
        if not slot_data.budget_min and not slot_data.budget_max:
            missing.append("ngân sách của bạn")
        if not slot_data.companions:
            missing.append("bạn đi cùng ai")
        
        if not missing:
            return "Bạn có sở thích đặc biệt nào khác không? Ví dụ: biển, núi, ẩm thực, nghỉ dưỡng..."
        
        # Chỉ hỏi 1-2 thứ quan trọng nhất
        if len(missing) > 2:
            missing = missing[:2]
        
        return f"Để tôi tư vấn tốt hơn, bạn có thể cho biết thêm về {', '.join(missing)} không?"
    
    def explain_recommendation(
        self, 
        tour: Dict, 
        user_prefs: Dict[str, float],
        slot_data: SlotData
    ) -> str:
        """Giải thích lý do gợi ý tour này"""
        
        top_tags = sorted(
            tour.get("tags", {}).items(),
            key=lambda x: x[1],
            reverse=True
        )[:3]
        
        tags_text = ", ".join([f"{tag} ({weight:.0%})" for tag, weight in top_tags])
        
        reasons = []
        
        if slot_data.destination:
            reasons.append(f"phù hợp với {slot_data.destination}")
        if slot_data.companions:
            reasons.append(f"tuyệt vời khi đi {', '.join(slot_data.companions)}")
        if slot_data.preferences:
            matching = [p for p in slot_data.preferences if p in tour.get("tags", {})]
            if matching:
                reasons.append(f"đáp ứng sở thích {', '.join(matching)}")
        
        reason_text = ", ".join(reasons) if reasons else "rất phù hợp với nhu cầu của bạn"
        
        return f"**{tour['name']}** được gợi ý vì {reason_text}. Tour này nổi bật về: {tags_text}."
