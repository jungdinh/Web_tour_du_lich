from __future__ import annotations

import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import Any, Dict, List, Optional

import httpx
from app.engine.tags import TAG_DESCRIPTIONS, TAG_TAXONOMY
from app.schemas import SlotData

LLM_EXECUTOR = ThreadPoolExecutor(max_workers=4)
DEFAULT_QUOTA_COOLDOWN_SECONDS = 90
MAX_QUOTA_COOLDOWN_SECONDS = 300


class DeepSeekLLM:
    """DeepSeek API integration for natural chat responses."""

    def __init__(self, api_key: str, base_url: str = "https://api.deepseek.com", model_name: str = "deepseek-v4-flash"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model_name = model_name
        self.timeout_seconds = 35.0
        self.disabled_until = 0.0
        self.last_error = ""
        self.active_model_name = model_name

    def is_available(self) -> bool:
        return time.time() >= self.disabled_until

    @staticmethod
    def _is_quota_error(exc: Exception) -> bool:
        message = str(exc).lower()
        return any(token in message for token in ("429", "quota", "rate limit", "rate"))

    @staticmethod
    def _is_model_unavailable_error(exc: Exception) -> bool:
        message = str(exc).lower()
        return any(token in message for token in ("404", "not found", "unsupported", "unavailable"))

    def _quota_cooldown_seconds(self, exc: Exception) -> int:
        message = str(exc).lower()
        retry_match = re.search(r"retry in\s+([0-9]+(?:\.[0-9]+)?)s", message)
        if retry_match:
            seconds = int(float(retry_match.group(1))) + 1
        else:
            seconds = DEFAULT_QUOTA_COOLDOWN_SECONDS
        return max(15, min(seconds, MAX_QUOTA_COOLDOWN_SECONDS))

    def _disable_temporarily(self, reason: str, seconds: int) -> None:
        self.disabled_until = time.time() + seconds
        self.last_error = reason

    def _chat_completions(self, prompt: str, timeout_seconds: Optional[float] = None) -> str:
        if not self.is_available():
            remaining = int(self.disabled_until - time.time())
            raise RuntimeError(f"DeepSeek temporarily disabled ({remaining}s left): {self.last_error}")

        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.3,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        try:
            future = LLM_EXECUTOR.submit(
                lambda: httpx.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=timeout_seconds or self.timeout_seconds,
                )
            )
            response = future.result(timeout=timeout_seconds or self.timeout_seconds)
            if response.status_code >= 400:
                raise RuntimeError(f"DeepSeek API error {response.status_code}: {response.text}")
            data = response.json()
            choices = data.get("choices") or []
            if not choices:
                raise RuntimeError("DeepSeek returned no choices")
            message = choices[0].get("message") or {}
            content = message.get("content") or ""
            return str(content).strip()
        except FuturesTimeoutError as exc:
            raise RuntimeError("DeepSeek request timed out") from exc
        except Exception as exc:
            if self._is_quota_error(exc):
                cooldown_seconds = self._quota_cooldown_seconds(exc)
                self._disable_temporarily("DeepSeek quota/rate limited", cooldown_seconds)
                raise RuntimeError("DeepSeek quota/rate limited; using local fallback") from exc
            if self._is_model_unavailable_error(exc):
                self._disable_temporarily("DeepSeek model unavailable", 300)
                raise RuntimeError("DeepSeek model unavailable; using local fallback") from exc
            raise

    def _generate_text(self, prompt: str, timeout_seconds: Optional[float] = None) -> str:
        return self._chat_completions(prompt, timeout_seconds)

    @staticmethod
    def _json_from_text(response_text: str) -> Dict[str, Any]:
        text = response_text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())

    def generate_follow_up_question_simple(self, missing_slots: list) -> str:
        labels = list(missing_slots)[:2]
        return f"?? m?nh g?i ? s?t h?n, b?n cho m?nh bi?t th?m v? {', '.join(labels)} nh??"

    def explain_recommendation(self, tour: Dict, user_prefs: Dict[str, float], slot_data: SlotData) -> str:
        top_tags = sorted((tour.get("tags", {}) or {}).items(), key=lambda x: x[1], reverse=True)[:3]
        tags_text = ", ".join([f"{tag} ({weight:.0%})" for tag, weight in top_tags])
        reasons = []
        if slot_data.destination:
            reasons.append(f"ph? h?p v?i {slot_data.destination}")
        if slot_data.companions:
            reasons.append(f"?i c?ng {', '.join(slot_data.companions)}")
        if slot_data.preferences:
            matching = [p for p in slot_data.preferences if p in (tour.get("tags", {}) or {})]
            if matching:
                reasons.append(f"??p ?ng s? th?ch {', '.join(matching)}")
        reason_text = ", ".join(reasons) if reasons else "kh? s?t v?i nhu c?u c?a b?n"
        return f"{tour['name']} ???c g?i ? v? {reason_text}. ?i?m n?i b?t: {tags_text}."

    def generate_tags_from_reviews(self, reviews: List[str]) -> Dict[str, float]:
        if not reviews:
            return {}
        taxonomy_text = "\n".join([f"- {tag}: {TAG_DESCRIPTIONS[tag]}" for tag in TAG_TAXONOMY])
        reviews_text = "\n\n".join([f"- Review {i+1}: {review}" for i, review in enumerate(reviews[:50])])
        prompt = f"""B?n l? chuy?n gia ph?n t?ch du l?ch. H?y ph?n t?ch c?c review sau v? g?n tags ph? h?p t? taxonomy ?? cho.

TAG TAXONOMY:
{taxonomy_text}

REVIEWS:
{reviews_text}

Y?U C?U:
1. ??c k? t?ng review v? x?c ??nh c?c tags ph? h?p
2. Ch? s? d?ng tags t? taxonomy tr?n, kh?ng t?o tags m?i
3. T?nh tr?ng s? = (s? review g?n tag) / (t?ng s? review)
4. Tr? v? JSON theo format: {{"tag_name": weight, ...}}

Ch? tr? v? JSON, kh?ng c? text kh?c:"""
        try:
            response_text = self._generate_text(prompt)
            tags = self._json_from_text(response_text)
            valid_tags = {}
            for tag, weight in tags.items():
                if tag in TAG_TAXONOMY and 0 <= weight <= 1:
                    valid_tags[tag] = weight
            return valid_tags
        except Exception as exc:
            print(f"Error generating tags: {exc}")
            return {}

    def extract_slots(self, user_message: str, current_slots: Optional[Dict] = None) -> SlotData:
        current = current_slots or {}
        taxonomy_text = "\n".join([f"- {tag}: {TAG_DESCRIPTIONS[tag]}" for tag in TAG_TAXONOMY])
        prompt = f"""B?n l? tr? l? t? v?n du l?ch. H?y tr?ch xu?t th?ng tin t? tin nh?n c?a user.

TAG TAXONOMY (d?ng ?? nh?n di?n s? th?ch):
{taxonomy_text}

C?c lo?i companions:
- family: gia ??nh, c? con, c? nh?
- couple: v?/ch?ng, ng??i y?u, c?p ??i
- friends: b?n b?
- solo: m?t m?nh

C?c m?a:
- spring: xu?n (th?ng 3-5)
- summer: h? (th?ng 6-8)
- autumn: thu (th?ng 9-11)
- winter: ??ng (th?ng 12-2)

Tin nh?n user: "{user_message}"

Th?ng tin ?? c?: {current}

Y?U C?U:
1. Tr?ch xu?t c?c th?ng tin: destination, companions, budget_min, budget_max, duration, preferences, season
2. Gi? nguy?n c?c th?ng tin ?? c? t? tr??c
3. Ch? tr? v? JSON theo format:
{{
    "destination": "??a ?i?m ho?c null",
    "companions": ["family/couple/friends/solo"] ho?c null,
    "budget_min": s? ho?c null,
    "budget_max": s? ho?c null,
    "duration": s? ng?y ho?c null,
    "preferences": ["tag1", "tag2"] ho?c null,
    "season": "m?a ho?c null"
}}

Ch? tr? v? JSON:"""
        try:
            response_text = self._generate_text(prompt)
            data = self._json_from_text(response_text)
            return SlotData(**data)
        except Exception as exc:
            print(f"Error extracting slots: {exc}")
            return SlotData()
