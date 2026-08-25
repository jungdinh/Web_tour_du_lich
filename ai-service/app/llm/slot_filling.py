"""
Slot Filling module - Trích xuất thông tin từ tin nhắn user.

Khi LLM được cung cấp, dùng Gemini để extract slots thông minh hơn.
Khi không có LLM hoặc LLM thất bại, fallback về rule-based extraction.
"""
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import Optional, Dict, List, Any
from .tags import TAG_TAXONOMY, TAG_DESCRIPTIONS


LLM_EXECUTOR = ThreadPoolExecutor(max_workers=2)


class SlotFillingEngine:
    """Xử lý Slot Filling cho việc trích xuất thông tin từ tin nhắn user"""

    def __init__(self, llm_client=None):
        self.required_slots = ['destination', 'duration', 'budget']
        self.optional_slots = ['companions', 'preferences', 'season']
        # Optional LLM client (GeminiLLM instance) — graceful fallback if None
        self.llm = llm_client
        self.llm_timeout_seconds = 10.0

    @staticmethod
    def _repair_text_encoding(text: str) -> str:
        """Repair common mojibake from Windows terminal/session state."""
        replacements = {
            "T?y Ninh": "T\u00e2y Ninh",
            "t?y ninh": "t\u00e2y ninh",
            "T\u00c3\u00a2y Ninh": "T\u00e2y Ninh",
            "t\u00c3\u00a2y ninh": "t\u00e2y ninh",
            "m\u00c3\u00acnh": "m\u00ecnh",
        }
        for bad, good in replacements.items():
            text = text.replace(bad, good)
        try:
            if "\u00c3" in text or "\u00c4" in text or "\u00c6" in text:
                repaired = text.encode("latin1").decode("utf-8")
                if repaired:
                    text = repaired
        except UnicodeError:
            pass
        return text

    @staticmethod
    def _no_diacritics(text: str) -> str:
        """Lowercase + strip Vietnamese diacritics for fuzzy matching."""
        text = SlotFillingEngine._repair_text_encoding(text)
        import unicodedata
        import re
        text = text.lower()
        # NFD then strip combining marks
        text = unicodedata.normalize('NFD', text)
        text = ''.join(ch for ch in text if unicodedata.category(ch) != 'Mn')
        # Special manual mappings for Vietnamese đ/Đ which NFD does not decompose
        text = text.replace('đ', 'd').replace('Đ', 'd')
        return text

    def extract_slots(
        self,
        message: str,
        current_slots: Optional[Dict[str, Any]] = None,
        use_llm: bool = True,
    ) -> Dict[str, Any]:
        """
        Trích xuất slots từ tin nhắn của user.

        Strategy:
        1. Try LLM if available & use_llm=True
        2. Always run rule-based extraction
        3. Merge: LLM results take precedence but rule-based fills any blanks

        Returns:
            Dict chứa các slot đã trích xuất
        """
        current = current_slots or {}

        # Rule-based baseline (always runs)
        rule_slots = {
            'destination': self._extract_destination(message),
            'duration': self._extract_duration(message),
            'budget_min': self._extract_budget_min(message),
            'budget_max': self._extract_budget_max(message),
            'companions': self._extract_companions(message),
            'preferences': self._extract_preferences(message),
            'season': self._extract_season(message),
        }

        # LLM extraction (when configured)
        llm_slots: Dict[str, Any] = {}
        if use_llm and self.llm is not None and (not hasattr(self.llm, "is_available") or self.llm.is_available()):
            try:
                future = LLM_EXECUTOR.submit(self.llm.extract_slots, message, current)
                llm_result = future.result(timeout=self.llm_timeout_seconds)
                # llm.extract_slots returns a Pydantic SlotData
                llm_slots = llm_result.model_dump() if hasattr(llm_result, 'model_dump') else dict(llm_result)
            except FuturesTimeoutError:
                print("[SlotFilling] LLM timed out, fallback to rule-based")
                llm_slots = {}
            except Exception as exc:  # pragma: no cover - defensive
                print(f"[SlotFilling] LLM extraction failed, fallback to rule-based: {exc}")
                llm_slots = {}
        # Merge with precedence order:
        # new extraction > existing context. This lets users correct/refine a
        # previous answer, e.g. "10 triệu" after saying "5 triệu".
        merged: Dict[str, Any] = {}
        for key in rule_slots:
            if llm_slots.get(key) is not None:
                merged[key] = llm_slots[key]
            elif rule_slots.get(key) is not None:
                merged[key] = rule_slots[key]
            else:
                merged[key] = current.get(key)

        for key in ("duration_min", "duration_max"):
            if current.get(key) is not None:
                merged[key] = current.get(key)

        return merged

    def _extract_destination(self, text: str) -> Optional[str]:
        """Trích xuất địa điểm"""
        destinations = {
            'hồ chí minh': 'Hồ Chí Minh',
            'tp.hcm': 'Hồ Chí Minh',
            'sài gòn': 'Hồ Chí Minh',
            'saigon': 'Hồ Chí Minh',
            'hà nội': 'Hà Nội',
            'hanoi': 'Hà Nội',
            'đà nẵng': 'Đà Nẵng',
            'da nang': 'Đà Nẵng',
            'nha trang': 'Nha Trang',
            'phú quốc': 'Phú Quốc',
            'đà lạt': 'Đà Lạt',
            'da lat': 'Đà Lạt',
            'hội an': 'Hội An',
            'huế': 'Huế',
            'hue': 'Huế',
            'cần thơ': 'Cần Thơ',
            'vũng tàu': 'Vũng Tàu',
            'sa pa': 'Sa Pa',
            'sapa': 'Sa Pa',
            'quy nhơn': 'Quy Nhơn',
            'phan thiết': 'Phan Thiết',
            'côn đảo': 'Côn Đảo',
            'tay ninh': 'T\u00e2y Ninh',
        }

        text_lower = self._no_diacritics(text)
        for keyword, dest in destinations.items():
            # Compare both strip-normalized strings
            if self._no_diacritics(keyword) in text_lower:
                return dest

        return None

    def _extract_duration(self, text: str) -> Optional[int]:
        """Trích xuất số ngày"""
        import re

        text_nd = self._no_diacritics(text)

        # Try compound formats first: 5n4d, 6n5d
        m = re.search(r'(\d+)\s*n\s*(\d+)\s*d', text_nd)
        if m:
            return int(m.group(1))

        patterns = [
            r'(\d+)\s*ngay',          # ngay / ngày
            r'(\d+)\s*days?',
            r'trong\s*(\d+)\s*ngay',
        ]

        for pattern in patterns:
            match = re.search(pattern, text_nd)
            if match:
                return int(match.group(1))

        return None

    def _extract_budget_min(self, text: str) -> Optional[int]:
        """Trích xuất ngân sách tối thiểu"""
        import re

        text_nd = self._no_diacritics(text)

        patterns = [
            r'tu\s*(\d+)\s*trieu',          # từ X triệu
            r'tren\s*(\d+)\s*trieu',        # trên X triệu
            r'it\s*nhat\s*(\d+)',           # ít nhất X
        ]

        for pattern in patterns:
            match = re.search(pattern, text_nd)
            if match:
                return int(match.group(1)) * 1_000_000

        return None

    def _extract_budget_max(self, text: str) -> Optional[int]:
        """Trích xuất ngân sách tối đa"""
        import re

        text_nd = self._no_diacritics(text)

        patterns = [
            r'duoi\s*(\d+)\s*trieu',        # dưới X triệu
            r'khoang\s*(\d+)\s*trieu',      # khoảng X triệu
            r'khaong\w*\s*(\d+)\s*trieu',   # typo: khaongr/khaong
            r'chi\s*phi\s*(?:khoang\s*)?(\d+)\s*trieu', # chi phí khoảng X triệu
            r'chi\s*phi\s*(?:khaong\w*\s*)?(\d+)\s*trieu', # typo chi phí khaongr X triệu
            r'ngan\s*sach\s*(?:khoang\s*)?(\d+)\s*trieu', # ngân sách khoảng X triệu
            r'con\s*(\d+)\s*trieu',         # c?n X tri?u
            r'toi\s*da\s*(\d+)',            # tối đa X
            r'chi\s*(\d+)\s*trieu',         # chỉ X triệu
            r'^(\d+)\s*trieu$',             # user replies only "10 triệu"
            r'(\d+)\s*trieu\s*troi\s*xuong', # X triệu trở xuống
        ]

        for pattern in patterns:
            match = re.search(pattern, text_nd)
            if match:
                return int(match.group(1)) * 1_000_000

        return None

    def _extract_companions(self, text: str) -> Optional[List[str]]:
        """Trích xuất người đi cùng"""
        companions = []

        if any(w in text for w in ['gia đình', 'cả nhà', 'bố mẹ', 'con', 'vợ chồng', 'với vợ', 'với chồng']):
            companions.append('family')

        if any(w in text for w in ['vợ', 'chồng', 'người yêu', 'bạn trai', 'bạn gái', 'cặp đôi', 'yêu']):
            companions.append('couple')

        if any(w in text for w in ['bạn bè', 'nhóm', 'mấy đứa', 'đám bạn']):
            companions.append('friends')

        if any(w in text for w in ['một mình', 'solo', 'tôi', 'đi một mình']):
            companions.append('solo')

        return companions if companions else None

    def _extract_preferences(self, text: str) -> Optional[List[str]]:
        """Trích xuất sở thích (tags)"""
        preferences = []

        tags_keywords = {
            'family': ['gia đình', 'trẻ em', 'con nhỏ'],
            'romantic': ['lãng mạn', 'tình yêu'],
            'adventure': ['mạo hiểm', 'khám phá', 'phiêu lưu', 'adventure'],
            'beach': ['biển', 'bơi', 'đảo', 'beach'],
            'nature': ['thiên nhiên', 'cảnh đẹp', 'núi', 'rừng'],
            'food': ['?m th?c', '?? ?n', '?n u?ng', 'b?a ?n', '??c s?n'],
            'culture': ['văn hóa', 'làng nghề', 'phong tục'],
            'history': ['lịch sử', 'di tích', 'chiến tranh', 'triều đại', 'thành cổ', 'bảo tàng'],
            'festival': ['lễ hội', 'festival'],
            'relax': ['nghỉ dưỡng', 'thư giãn', 'spa', 'yên tĩnh'],
            'budget': ['giá rẻ', 'tiết kiệm', 'bình dân'],
            'luxury': ['sang trọng', 'cao cấp', '5 sao', 'luxury'],
            'spiritual': ['tâm linh', 'chùa', 'đền', 'hành hương', 'thiền'],
            'photography': ['chụp ảnh', 'check-in', 'view đẹp'],
            'shopping': ['mua sắm', 'chợ', 'quà'],
            'mountain': ['núi', 'cao nguyên', 'leo núi'],
            'city': ['thành phố', 'đô thị', 'phố'],
            'wildlife': ['động vật', 'safari', 'vườn thú', 'thú rừng'],
            'cruise': ['du thuyền', 'tàu', 'cruise'],
            'nightlife': ['bar', 'club', 'phố đêm', 'beer club', 'nightlife'],
            'water_sports': ['lặn biển', 'snorkeling', 'kayak', 'surfing', 'lặn', 'dù lượn'],
        }

        for tag, keywords in tags_keywords.items():
            if any(kw in text for kw in keywords):
                preferences.append(tag)

        return preferences if preferences else None

    def _extract_season(self, text: str) -> Optional[str]:
        """Trích xuất mùa"""
        seasons = {
            'spring': ['xu?n', 'm?a xu?n'],
            'summer': ['h?', 'm?a h?'],
            'autumn': ['thu', 'm?a thu'],
            'winter': ['??ng', 'm?a ??ng'],
        }

        for season, keywords in seasons.items():
            if any(kw in text for kw in keywords):
                return season

        return None

    def is_complete(self, slots: Dict[str, Any]) -> bool:
        """Kiểm tra xem đã có đủ thông tin chưa"""
        return bool(slots.get('destination'))
    def get_missing_slots(self, slots: Dict[str, Any]) -> List[str]:
        """Lấy danh sách các slot còn thiếu"""
        missing = []

        if not slots.get('destination'):
            missing.append('địa điểm')
        if not slots.get('duration') and not slots.get('duration_min') and not slots.get('duration_max'):
            missing.append('số ngày')
        if not slots.get('budget_min') and not slots.get('budget_max'):
            missing.append('ngân sách')

        return missing

    def generate_question(self, missing_slots: List[str]) -> str:
        """Tạo câu hỏi cho các slot còn thiếu"""
        if not missing_slots:
            return "Bạn có sở thích đặc biệt nào khác không?"

        # Use LLM to generate a more natural question if available
        if self.llm is not None:
            try:
                question = self.llm.generate_follow_up_question_simple(missing_slots)
                if question:
                    return question
            except Exception:  # pragma: no cover
                pass

        # Chỉ hỏi tối đa 2 câu mỗi lần
        ask = missing_slots[:2]

        if 'địa điểm' in ask and 'số ngày' in ask:
            return "Bạn muốn đi đâu và đi trong bao lâu?"
        elif 'địa điểm' in ask:
            return "Bạn muốn đi đâu vậy?"
        elif 'số ngày' in ask:
            return "Bạn muốn đi trong bao lâu?"
        elif 'ngân sách' in ask:
            return "Ngân sách của bạn khoảng bao nhiêu?"
        else:
            return "Bạn có thể cho tôi biết thêm thông tin không?"
