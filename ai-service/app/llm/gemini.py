import os
import time
import re
import google.generativeai as genai
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import List, Dict, Optional, Any
from app.engine.tags import TAG_TAXONOMY, TAG_DESCRIPTIONS
from app.schemas import SlotData

LLM_EXECUTOR = ThreadPoolExecutor(max_workers=4)
DEFAULT_QUOTA_COOLDOWN_SECONDS = 90
MAX_QUOTA_COOLDOWN_SECONDS = 300


class GeminiLLM:
    """Gemini API integration"""
    
    def __init__(self, api_key: str, model_name: str = "gemini-2.5-flash", fallback_model_name: str = "gemini-3.5-flash-lite"):
        genai.configure(api_key=api_key)
        self.model_name = model_name
        self.fallback_model_name = fallback_model_name
        self.model = genai.GenerativeModel(model_name)
        self.fallback_model = genai.GenerativeModel(fallback_model_name) if fallback_model_name and fallback_model_name != model_name else None
        self.active_model_name = model_name
        self.timeout_seconds = 12.0
        self.disabled_until = 0.0
        self.disabled_models = {}
        self.last_error = ""

    def is_available(self) -> bool:
        return time.time() >= self.disabled_until

    @staticmethod
    def _is_quota_error(exc: Exception) -> bool:
        message = str(exc).lower()
        return "429" in message or "quota" in message or "rate" in message

    @staticmethod
    def _is_model_unavailable_error(exc: Exception) -> bool:
        message = str(exc).lower()
        return (
            "404" in message
            or "not found" in message
            or "no longer available" in message
            or "not supported" in message
        )

    def _model_available(self, model_name: str) -> bool:
        return time.time() >= self.disabled_models.get(model_name, 0.0)

    def _quota_cooldown_seconds(self, exc: Exception) -> int:
        message = str(exc).lower()
        retry_match = re.search(r"retry in\s+([0-9]+(?:\.[0-9]+)?)s", message)
        if retry_match:
            seconds = int(float(retry_match.group(1))) + 1
        else:
            seconds = DEFAULT_QUOTA_COOLDOWN_SECONDS
        return max(15, min(seconds, MAX_QUOTA_COOLDOWN_SECONDS))

    def _disable_model_temporarily(self, model_name: str, seconds: int = DEFAULT_QUOTA_COOLDOWN_SECONDS) -> None:
        self.disabled_models[model_name] = time.time() + seconds

    def _disable_temporarily(self, reason: str, seconds: int = DEFAULT_QUOTA_COOLDOWN_SECONDS) -> None:
        self.disabled_until = time.time() + seconds
        self.last_error = reason

    def _call_model(self, model, model_name: str, prompt: str, timeout_seconds: Optional[float] = None) -> str:
        if not self._model_available(model_name):
            raise RuntimeError(f"Gemini model {model_name} temporarily disabled")
        future = LLM_EXECUTOR.submit(model.generate_content, prompt)
        response = future.result(timeout=timeout_seconds or self.timeout_seconds)
        self.active_model_name = model_name
        return response.text.strip()

    def _generate_text(self, prompt: str, timeout_seconds: Optional[float] = None) -> str:
        if not self.is_available():
            remaining = int(self.disabled_until - time.time())
            raise RuntimeError(f"Gemini temporarily disabled ({remaining}s left): {self.last_error}")

        try:
            return self._call_model(self.model, self.model_name, prompt, timeout_seconds)
        except Exception as exc:
            if not self._is_quota_error(exc):
                raise

            cooldown_seconds = self._quota_cooldown_seconds(exc)
            self._disable_model_temporarily(self.model_name, seconds=cooldown_seconds)
            if self.fallback_model is not None and self._model_available(self.fallback_model_name):
                print(f"[LLM] {self.model_name} quota/rate limit reached; retrying with {self.fallback_model_name}.")
                try:
                    return self._call_model(self.fallback_model, self.fallback_model_name, prompt, timeout_seconds)
                except Exception as fallback_exc:
                    if self._is_quota_error(fallback_exc):
                        fallback_cooldown = self._quota_cooldown_seconds(fallback_exc)
                        self._disable_model_temporarily(self.fallback_model_name, seconds=fallback_cooldown)
                        self._disable_temporarily("all Gemini models quota/rate limited", seconds=min(cooldown_seconds, fallback_cooldown))
                        raise RuntimeError("All Gemini models quota/rate limited; using local fallback") from fallback_exc
                    if self._is_model_unavailable_error(fallback_exc):
                        self._disable_model_temporarily(self.fallback_model_name, seconds=3600)
                        self._disable_temporarily("Gemini fallback model unavailable", seconds=30)
                        raise RuntimeError(f"Gemini fallback model {self.fallback_model_name} unavailable; using local fallback") from fallback_exc
                    raise

            self._disable_temporarily("Gemini primary model quota/rate limited", seconds=cooldown_seconds)
            raise RuntimeError("Gemini primary model quota/rate limited and no fallback model available") from exc

    @staticmethod
    def _json_from_text(response_text: str) -> Dict[str, Any]:
        import json

        text = response_text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]

        return json.loads(text.strip())
    
    def generate_tags_from_reviews(self, reviews: List[str]) -> Dict[str, float]:
        """
        PhÃ¢n tÃ­ch reviews vÃ  sinh tag theo Taxonomy
        
        Returns:
            Dict of {tag: weight} vá»›i weight = tá»· lá»‡ xuáº¥t hiá»‡n
        """
        if not reviews:
            return {}
        
        # Build prompt vá»›i taxonomy
        taxonomy_text = "\n".join([
            f"- {tag}: {TAG_DESCRIPTIONS[tag]}"
            for tag in TAG_TAXONOMY
        ])
        
        reviews_text = "\n\n".join([
            f"- Review {i+1}: {review}"
            for i, review in enumerate(reviews[:50])  # Giá»›i háº¡n 50 reviews
        ])
        
        prompt = f"""Báº¡n lÃ  chuyÃªn gia phÃ¢n tÃ­ch du lá»‹ch. HÃ£y phÃ¢n tÃ­ch cÃ¡c review sau vÃ  gÃ¡n tags phÃ¹ há»£p tá»« taxonomy Ä‘Ã£ cho.

TAG TAXONOMY:
{taxonomy_text}

REVIEWS:
{reviews_text}

YÃŠU Cáº¦U:
1. Äá»c ká»¹ tá»«ng review vÃ  xÃ¡c Ä‘á»‹nh cÃ¡c tags phÃ¹ há»£p
2. Chá»‰ sá»­ dá»¥ng tags tá»« taxonomy trÃªn, khÃ´ng táº¡o tags má»›i
3. TÃ­nh trá»ng sá»‘ = (sá»‘ review gáº¯n tag) / (tá»•ng sá»‘ review)
4. Tráº£ vá» JSON theo format: {{"tag_name": weight, ...}}

Chá»‰ tráº£ vá» JSON, khÃ´ng cÃ³ text khÃ¡c:"""
        
        try:
            response_text = self._generate_text(prompt)
            
            # Parse JSON response
            tags = self._json_from_text(response_text)
            
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
        TrÃ­ch xuáº¥t thÃ´ng tin tá»« message cá»§a user (Slot Filling)
        
        Args:
            user_message: Tin nháº¯n cá»§a user
            current_slots: CÃ¡c slots Ä‘Ã£ cÃ³ tá»« trÆ°á»›c
        
        Returns:
            SlotData object vá»›i cÃ¡c thÃ´ng tin Ä‘Ã£ trÃ­ch xuáº¥t
        """
        current = current_slots or {}
        
        taxonomy_text = "\n".join([
            f"- {tag}: {TAG_DESCRIPTIONS[tag]}"
            for tag in TAG_TAXONOMY
        ])
        
        prompt = f"""Báº¡n lÃ  trá»£ lÃ½ tÆ° váº¥n du lá»‹ch. HÃ£y trÃ­ch xuáº¥t thÃ´ng tin tá»« tin nháº¯n cá»§a user.

TAG TAXONOMY (dÃ¹ng Ä‘á»ƒ nháº­n diá»‡n sá»Ÿ thÃ­ch):
{taxonomy_text}

CÃ¡c loáº¡i companions:
- family: gia Ä‘Ã¬nh, cÃ³ con, cáº£ nhÃ 
- couple: vá»£/chá»“ng, ngÆ°á»i yÃªu, cáº·p Ä‘Ã´i
- friends: báº¡n bÃ¨
- solo: má»™t mÃ¬nh

CÃ¡c mÃ¹a:
- spring: xuÃ¢n (thÃ¡ng 3-5)
- summer: hÃ¨ (thÃ¡ng 6-8)
- autumn: thu (thÃ¡ng 9-11)
- winter: Ä‘Ã´ng (thÃ¡ng 12-2)

Tin nháº¯n user: "{user_message}"

ThÃ´ng tin Ä‘Ã£ cÃ³: {current}

YÃŠU Cáº¦U:
1. TrÃ­ch xuáº¥t cÃ¡c thÃ´ng tin: destination, companions, budget_min, budget_max, duration, preferences, season
2. Giá»¯ nguyÃªn cÃ¡c thÃ´ng tin Ä‘Ã£ cÃ³ tá»« trÆ°á»›c
3. Chá»‰ tráº£ vá» JSON theo format:
{{
    "destination": "Ä‘á»‹a Ä‘iá»ƒm hoáº·c null",
    "companions": ["family/couple/friends/solo"] hoáº·c null,
    "budget_min": sá»‘ hoáº·c null,
    "budget_max": sá»‘ hoáº·c null,
    "duration": sá»‘ ngÃ y hoáº·c null,
    "preferences": ["tag1", "tag2"] hoáº·c null,
    "season": "mÃ¹a hoáº·c null"
}}

Chá»‰ tráº£ vá» JSON:"""
        
        try:
            response_text = self._generate_text(prompt)
            
            data = self._json_from_text(response_text)
            return SlotData(**data)
            
        except Exception as e:
            print(f"Error extracting slots: {e}")
            return SlotData()

    def generate_follow_up_question_simple(self, missing_slots: list) -> str:
        """Lightweight follow-up generator when only slot labels (Vietnamese) are known."""
        labels = list(missing_slots)[:2]
        return f"?? m?nh g?i ? s?t h?n, b?n cho m?nh bi?t th?m v? {', '.join(labels)} nh??"
    
    def explain_recommendation(
        self, 
        tour: Dict, 
        user_prefs: Dict[str, float],
        slot_data: SlotData
    ) -> str:
        """Giáº£i thÃ­ch lÃ½ do gá»£i Ã½ tour nÃ y"""
        
        top_tags = sorted(
            tour.get("tags", {}).items(),
            key=lambda x: x[1],
            reverse=True
        )[:3]
        
        tags_text = ", ".join([f"{tag} ({weight:.0%})" for tag, weight in top_tags])
        
        reasons = []
        
        if slot_data.destination:
            reasons.append(f"phÃ¹ há»£p vá»›i {slot_data.destination}")
        if slot_data.companions:
            reasons.append(f"tuyá»‡t vá»i khi Ä‘i {', '.join(slot_data.companions)}")
        if slot_data.preferences:
            matching = [p for p in slot_data.preferences if p in tour.get("tags", {})]
            if matching:
                reasons.append(f"Ä‘Ã¡p á»©ng sá»Ÿ thÃ­ch {', '.join(matching)}")
        
        reason_text = ", ".join(reasons) if reasons else "ráº¥t phÃ¹ há»£p vá»›i nhu cáº§u cá»§a báº¡n"
        
        return f"{tour['name']} Ä‘Æ°á»£c gá»£i Ã½ vÃ¬ {reason_text}. Tour nÃ y ná»•i báº­t vá»: {tags_text}."

