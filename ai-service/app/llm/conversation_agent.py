from __future__ import annotations

import json
import re
import unicodedata
from concurrent.futures import TimeoutError as FuturesTimeoutError
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

ChatIntent = Literal[
    "new_search",
    "refine_search",
    "acknowledgement",
    "answer_about_recommendation",
    "compare_recommendations",
    "ask_missing_info",
    "out_of_scope",
]


class ConversationDecision(BaseModel):
    intent: ChatIntent = "new_search"
    slots_patch: Dict[str, Any] = Field(default_factory=dict)
    referenced_tour_indexes: List[int] = Field(default_factory=list)
    answer: str = ""
    should_recommend: bool = True


class ConversationAgent:
    """LLM-first chat controller for tour consultation."""

    RESPONSE_STYLE = """
You are a professional Vietnamese travel consultant.

This style is mandatory for every user-facing chatbot response.

Writing style:
- Always answer in Vietnamese with correct accents.
- Natural, modern, friendly, and professional; not advertising copy.
- Short sentences. Clear ideas. Easy to scan in 5-10 seconds.
- Do not write one long paragraph. Each paragraph has at most 2-3 sentences.
- Avoid repeating phrases like "tour nay", "phu hop", "diem hay", "co nhieu".
- Avoid cliches: "trai nghiem tuyet voi", "hanh trinh dang nho", "kham pha ve dep tuyet voi".
- Do not exaggerate or invent anything outside the provided data.
- Never output raw tags such as family, nature, photography, mountain, relax, wildlife. Convert them to natural Vietnamese travel descriptions.
- If rating/reviews are missing, say it neutrally and gently.
- Format prices as 3.286.000\u0111/ng\u01b0\u1eddi. When comparing prices, say "ti\u1ebft ki\u1ec7m kho\u1ea3ng 804.000\u0111".
- Use controlled **bold** only for important anchors: tour name, price, duration, section label, final takeaway.
- Do not use # headings. Do not use tables. Do not overuse bullets.

Mandatory format when recommending or explaining one tour:
**[Tour name]**

One short opening sentence that tells the user why this option is worth considering.

\U0001f4b0 Gi\u00e1: **...**
\u23f1 Th\u1eddi gian: **...**
\U0001f4cd \u0110i\u1ec3m n\u1ed5i b\u1eadt: ...

2-3 short advisory sentences about: travel feel, who it suits, and what to consider.

If comparing with another option, add:
**So v\u1edbi l\u1ef1a ch\u1ecdn kh\u00e1c:**
1-2 short sentences about the most important difference in price, duration, or travel feel.

End with:
**Ph\u00f9 h\u1ee3p n\u1ebfu:** ...

Mandatory format when asking for missing info:
Ask naturally in 1-2 short sentences. Mention why the info helps. Use bold for suggested values if useful.
"""

    def __init__(self, analysis_llm=None, response_llm=None):
        self.analysis_llm = analysis_llm
        self.response_llm = response_llm if response_llm is not None else analysis_llm

    def _analysis_llm_available(self) -> bool:
        return self.analysis_llm is not None and (not hasattr(self.analysis_llm, "is_available") or self.analysis_llm.is_available())

    def _response_llm_available(self) -> bool:
        return self.response_llm is not None and (not hasattr(self.response_llm, "is_available") or self.response_llm.is_available())

    def analyze(
        self,
        user_message: str,
        current_slots: Optional[Dict[str, Any]] = None,
        last_recommendations: Optional[List[Dict[str, Any]]] = None,
        recent_messages: Optional[List[Dict[str, str]]] = None,
    ) -> ConversationDecision:
        if not self._analysis_llm_available():
            return self._fallback_decision(user_message, last_recommendations)

        prompt = self._build_analysis_prompt(
            user_message=user_message,
            current_slots=current_slots or {},
            last_recommendations=self._compact_recommendations(last_recommendations or []),
            recent_messages=(recent_messages or [])[-10:],
        )

        try:
            response_text = self.analysis_llm._generate_text(prompt)
            data = self._json_from_text(response_text)
            decision = ConversationDecision(**data)
            decision.slots_patch = self._clean_slots(decision.slots_patch)
            return self._guard_context_follow_up(user_message, decision, last_recommendations)
        except FuturesTimeoutError:
            print("[ConversationAgent] Gemini analysis timed out")
        except Exception as exc:
            print(f"[ConversationAgent] Gemini analysis failed: {exc}")

        return self._fallback_decision(user_message, last_recommendations)

    def write_context_answer(
        self,
        user_message: str,
        intent: str,
        current_slots: Dict[str, Any],
        last_recommendations: List[Dict[str, Any]],
        referenced_tour_indexes: Optional[List[int]] = None,
        recent_messages: Optional[List[Dict[str, str]]] = None,
    ) -> Optional[str]:
        if not self._response_llm_available() or not last_recommendations:
            return None

        selected_indexes = referenced_tour_indexes or [1]
        selected_tours = []
        for index in selected_indexes:
            if 1 <= index <= len(last_recommendations):
                selected_tours.append(last_recommendations[index - 1])
        if not selected_tours:
            selected_tours = [last_recommendations[0]]

        locked_destination = selected_tours[0].get("destination") if selected_tours else None
        prompt = f"""{self.RESPONSE_STYLE}

Current task: answer the user's follow-up about the selected tour only.

Hard rules:
- Stay on the selected tour context.
- If locked_destination is available, never mention another city or destination.
- Do not reuse an old destination from prior turns.
- Do not list the whole recommendation set again.
- Keep the answer natural, concise, and specific to the selected tour.

Use this selected tour context:
{self._compact_recommendations(selected_tours)}

If you compare tours, only compare the selected tour(s) and keep the comparison short.

USER_MESSAGE:
{user_message}

INTENT:
{intent}

LOCKED_DESTINATION:
{locked_destination}

CURRENT_SLOTS:
{current_slots}

ALL_RECENT_RECOMMENDATIONS:
{self._compact_recommendations(last_recommendations)}

RECENT_MESSAGES:
{(recent_messages or [])[-4:]}
"""
        try:
            text = self.response_llm._generate_text(prompt)
            if not text:
                return None
            cleaned = text.strip()
            sanitized = self._sanitize_destination_mentions(cleaned, locked_destination, selected_tours, last_recommendations)
            return sanitized.strip() if sanitized else None
        except FuturesTimeoutError:
            print("[ConversationAgent] Gemini context answer timed out")
        except Exception as exc:
            print(f"[ConversationAgent] Gemini context answer failed: {exc}")
        return None

    def write_missing_info_question(
        self,
        user_message: str,
        current_slots: Dict[str, Any],
        missing_slots: List[str],
        destination_suggestions: Optional[List[Any]] = None,
        recent_messages: Optional[List[Dict[str, str]]] = None,
    ) -> Optional[str]:
        if not self._response_llm_available():
            return None

        prompt = f"""{self.RESPONSE_STYLE}

Current task: the user has not provided enough information. Ask a natural follow-up question, not a form-like question.

Rules:
- Ask at most 2 things at once.
- If destination is already known, do not ask destination again.
- If budget is missing, ask in an easy way, e.g. budget per person.
- If duration is missing, ask by trip rhythm, e.g. short 3 days or slower 4-5 days.
- If destination_suggestions exists, lightly suggest 2-3 places.
- Do not use dry phrasing like "please provide more information about...".

USER_MESSAGE:
{user_message}

CURRENT_SLOTS:
{current_slots}

MISSING_SLOTS:
{missing_slots}

DESTINATION_SUGGESTIONS:
{destination_suggestions or []}

RECENT_MESSAGES:
{(recent_messages or [])[-6:]}
"""
        try:
            text = self.response_llm._generate_text(prompt)
            return text.strip() if text else None
        except FuturesTimeoutError:
            print("[ConversationAgent] Gemini missing-info question timed out")
        except Exception as exc:
            print(f"[ConversationAgent] Gemini missing-info question failed: {exc}")
        return None

    def write_recommendation_response(
        self,
        user_message: str,
        slot_data: Dict[str, Any],
        recommendations: List[Dict[str, Any]],
        relaxed_reason: Optional[str] = None,
        recent_messages: Optional[List[Dict[str, str]]] = None,
    ) -> str:
        if not self._response_llm_available():
            return self._fallback_recommendation_message(slot_data, recommendations, relaxed_reason)

        locked_destination = recommendations[0].get("destination") if recommendations else None
        prompt = f"""{self.RESPONSE_STYLE}

Current task: write a short recommendation after RandomForest has ranked tours. Keep the answer centered on the top ranked tour only.

Hard rules:
- Do not mention a different destination than the locked destination.
- Do not list the full tour set again because the UI already shows cards.
- Keep the answer natural, concise, and specific to the top tour.

Use this top-tour context:
{self._compact_recommendations([recommendations[0]] if recommendations else [])}

USER_MESSAGE:
{user_message}

CURRENT_SLOTS:
{slot_data}

LOCKED_DESTINATION:
{locked_destination}

RELAXED_REASON:
{relaxed_reason or ""}

RANKED_TOURS:
{self._compact_recommendations(recommendations)}

RECENT_MESSAGES:
{(recent_messages or [])[-4:]}
"""
        try:
            text = self.response_llm._generate_text(prompt)
            if text:
                cleaned = text.strip()
                sanitized = self._sanitize_destination_mentions(cleaned, locked_destination, recommendations[:1], recommendations)
                if self._looks_like_duplicate_tour_list(sanitized):
                    return self._fallback_recommendation_message(slot_data, recommendations, relaxed_reason)
                return sanitized
        except FuturesTimeoutError:
            print("[ConversationAgent] Gemini recommendation response timed out")
        except Exception as exc:
            print(f"[ConversationAgent] Gemini recommendation response failed: {exc}")

        return self._fallback_recommendation_message(slot_data, recommendations, relaxed_reason)

    def _build_analysis_prompt(
        self,
        user_message: str,
        current_slots: Dict[str, Any],
        last_recommendations: List[Dict[str, Any]],
        recent_messages: List[Dict[str, str]],
    ) -> str:
        return f"""You are the conversation brain for a Vietnamese tour recommendation chatbot.

Understand the user's real intent from context. Do NOT always trigger a new tour search.

Decision rules:
- If the user asks about previous tours, such as "ly do nen chon", "y do nen chon", "tour 1 co gi hay", "khac gi", "dang tien khong", "di voi nguoi yeu/gia dinh on khong", "nen chon tour nao", "lich trinh", "ngay 1", "khach san": set should_recommend=false and answer directly from last_recommendations.
- If the user only acknowledges after advice, such as "ok", "uh", "duoc", "cung on", "cam on": intent=acknowledgement, should_recommend=false. Do not search again.
- If the user changes criteria or wants a new/refined search, such as increasing budget, changing duration/destination, disliking current tour, wanting longer/cheaper/more premium tours: intent=refine_search, should_recommend=true, fill slots_patch.
- If the user starts a new travel need: intent=new_search, should_recommend=true.
- If required information is missing: intent=ask_missing_info, should_recommend=true; the app will ask a slot-filling question.
- If out of travel-tour scope: intent=out_of_scope, should_recommend=false and answer politely back to tour advice.

Data rules:
- Use only current_slots and last_recommendations. Do not invent itinerary, hotel, transport, meals, or attractions.
- You may infer softly from tags, but never output raw tag names. Convert them to natural Vietnamese travel descriptions.
- If avg_rating is 0 or missing, say it does not have enough rating data instead of saying it is bad.
- referenced_tour_indexes are 1-based ranks. If user says "tour nay/cai nay" and no clear reference, prefer tour 1.
- slots_patch may only include: destination, companions, budget_min, budget_max, duration, duration_min, duration_max, preferences, season.
- "ngan sach/chi phi khoang 10 trieu" usually means budget_max=10000000, not budget_min.
- "khong thich 3 ngay, co cai dai hon" means duration=null and duration_min=4.

CURRENT_SLOTS:
{current_slots}

LAST_RECOMMENDATIONS:
{last_recommendations}

RECENT_MESSAGES:
{recent_messages}

USER_MESSAGE:
{user_message}

Return valid JSON only, no markdown:
{{
  "intent": "new_search | refine_search | acknowledgement | answer_about_recommendation | compare_recommendations | ask_missing_info | out_of_scope",
  "slots_patch": {{}},
  "referenced_tour_indexes": [],
  "answer": "Vietnamese answer if should_recommend=false, otherwise empty string",
  "should_recommend": true
}}
"""

    def _compact_recommendations(self, recommendations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        compact = []
        for index, tour in enumerate((recommendations or [])[:5], start=1):
            compact.append({
                "rank": index,
                "id": tour.get("id") or tour.get("tour_id"),
                "name": tour.get("name"),
                "destination": tour.get("destination"),
                "price": tour.get("price"),
                "duration": tour.get("duration"),
                "avg_rating": tour.get("avg_rating"),
                "review_count": tour.get("review_count"),
                "tags": tour.get("tags"),
                "itinerary_preview": self._compact_itinerary(tour),
                "schedule_preview": self._compact_schedule(tour),
            })
        return compact

    @staticmethod
    def _looks_like_duplicate_tour_list(message: str) -> bool:
        normalized = message.lower()
        return (
            normalized.count("tour ") >= 5
            or "tour ph\u00f9 h\u1ee3p:" in normalized
            or "tour phu hop:" in normalized
        )

    @staticmethod
    def _sanitize_destination_mentions(
        message: str,
        locked_destination: Optional[str],
        selected_tours: List[Dict[str, Any]],
        last_recommendations: List[Dict[str, Any]],
    ) -> str:
        if not message or not locked_destination:
            return message

        candidates = []
        for tour in (selected_tours or []) + (last_recommendations or []):
            destination = tour.get("destination")
            if destination and destination != locked_destination and destination not in candidates:
                candidates.append(destination)

        sanitized = message
        for destination in sorted(candidates, key=len, reverse=True):
            pattern = re.compile(re.escape(destination), re.IGNORECASE)
            sanitized = pattern.sub(locked_destination, sanitized)
        return sanitized

    @staticmethod
    def _compact_itinerary(tour: Dict[str, Any], max_days: int = 2) -> Optional[str]:
        itinerary = tour.get("itinerary") or []
        if isinstance(itinerary, dict):
            itinerary = [itinerary]
        if not isinstance(itinerary, list) or not itinerary:
            return None

        chunks = []
        for day in itinerary[:max_days]:
            if not isinstance(day, dict):
                continue
            day_label = day.get("day") or day.get("title") or "Ng?y"
            content = day.get("content")
            if isinstance(content, list):
                content_text = " ".join(str(item).strip() for item in content if isinstance(item, str))
            elif isinstance(content, str):
                content_text = content.strip()
            else:
                content_text = ""
            content_text = re.sub(r"\s+", " ", content_text).strip()
            if len(content_text) > 220:
                content_text = content_text[:220].rstrip() + "?"
            meal = day.get("meal")
            piece = day_label
            if content_text:
                piece += f": {content_text}"
            if meal:
                piece += f" | {meal}"
            chunks.append(piece)

        return " ; ".join(chunks) if chunks else None

    @staticmethod
    def _compact_schedule(tour: Dict[str, Any]) -> Optional[str]:
        schedule = tour.get("schedule") or []
        if isinstance(schedule, dict):
            schedule = [schedule]
        if not isinstance(schedule, list) or not schedule:
            return None

        pieces = []
        for item in schedule[:2]:
            if not isinstance(item, dict):
                continue
            date = item.get("date") or item.get("day") or item.get("title")
            price = item.get("price")
            available = item.get("available")
            chunk = str(date) if date else "L?ch kh?i h?nh"
            if price:
                chunk += f" - {price}"
            if available is not None:
                chunk += " - c?n ch?" if available else " - h?t ch?"
            pieces.append(chunk)

        return " ; ".join(pieces) if pieces else None

    @staticmethod
    def _json_from_text(response_text: str) -> Dict[str, Any]:
        text = response_text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())

    @staticmethod
    def _clean_slots(slots: Dict[str, Any]) -> Dict[str, Any]:
        allowed = {
            "destination", "companions", "budget_min", "budget_max", "duration",
            "duration_min", "duration_max", "preferences", "season",
        }
        return {key: value for key, value in (slots or {}).items() if key in allowed}

    def _guard_context_follow_up(
        self,
        user_message: str,
        decision: ConversationDecision,
        last_recommendations: Optional[List[Dict[str, Any]]] = None,
    ) -> ConversationDecision:
        if not last_recommendations:
            return decision

        text = self._strip_diacritics(user_message)
        slots_patch = self._criteria_slots_patch(text)
        changes_search_criteria = bool(slots_patch) or re.search(
            r"\b(tang|giam|doi|tim|loc|ngan sach|chi phi|trieu|ngay|dai hon|ngan hon|re hon|dat hon|sang hon|di dau|dia diem)\b",
            text,
        )
        asks_about_previous_tours = re.search(
            r"\b(ly do|y do|vi sao|tai sao|nen chon|co gi hay|dang tien|on khong|khac gi|so sanh|tour\s*\d+|cai nay|tour nay|lich trinh|ngay\s*\d+|khach san|o dau|luu tru)\b",
            text,
        )
        asks_to_compare_current_options = re.search(
            r"\b(tour nao|cai nao|lua chon nao).{0,40}\bhon\b",
            text,
        ) or re.search(r"\bso sanh\b", text) or re.search(
            r"\b(hop gia dinh|phu hop gia dinh|phu hop hon|ngon hon|tot hon|de di hon|on hon)\b",
            text,
        )
        acknowledges = re.fullmatch(
            r"\s*(ok|oke|okay|uh|u|roi|duoc|duoc roi|on|cam on|thanks)\s*[.!?]*\s*",
            text,
        )

        if changes_search_criteria:
            merged_patch = {**decision.slots_patch, **slots_patch}
            return ConversationDecision(
                intent="refine_search",
                should_recommend=True,
                slots_patch=merged_patch,
                referenced_tour_indexes=[],
                answer="",
            )

        if acknowledges:
            return ConversationDecision(
                intent="acknowledgement",
                should_recommend=False,
                referenced_tour_indexes=[1],
                answer=(
                    "Ok, m\u00ecnh gi\u1eef tour \u0111\u1ea7u l\u00e0m l\u1ef1a ch\u1ecdn \u01b0u ti\u00ean. "
                    "N\u1ebfu mu\u1ed1n ch\u1eafc h\u01a1n, b\u1ea1n c\u00f3 th\u1ec3 h\u1ecfi m\u00ecnh so s\u00e1nh tour 1 v\u00e0 tour 2."
                ),
            )

        if asks_to_compare_current_options:
            return ConversationDecision(
                intent="compare_recommendations",
                should_recommend=False,
                referenced_tour_indexes=[],
                answer=decision.answer if not decision.should_recommend else "",
            )

        if asks_about_previous_tours:
            tour_match = re.search(r"tour\s*(\d+)", text)
            index = int(tour_match.group(1)) if tour_match else 1
            return ConversationDecision(
                intent="answer_about_recommendation",
                should_recommend=False,
                referenced_tour_indexes=[index],
                answer=decision.answer if not decision.should_recommend else "",
            )

        return decision

    @staticmethod
    def _criteria_slots_patch(normalized_text: str) -> Dict[str, Any]:
        patch: Dict[str, Any] = {}

        duration_match = re.search(r"\b(\d{1,2})\s*ngay\b", normalized_text)
        if duration_match:
            patch["duration"] = int(duration_match.group(1))
            patch["duration_min"] = None
            patch["duration_max"] = None
        elif re.search(r"\b(dai hon|nhieu ngay hon|hon 3 ngay|hon ba ngay)\b", normalized_text):
            patch["duration"] = None
            patch["duration_min"] = 4

        budget_match = re.search(r"\b(\d{1,3})\s*(trieu|tr)\b", normalized_text)
        if budget_match and re.search(r"\b(ngan sach|chi phi|gia|tien|con|khoang|tam|duoi|toi da)\b", normalized_text):
            patch["budget_min"] = None
            patch["budget_max"] = int(budget_match.group(1)) * 1_000_000

        return patch
    @staticmethod
    def _strip_diacritics(text: str) -> str:
        text = unicodedata.normalize("NFD", text.lower())
        text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
        return text.replace("\u0111", "d")

    def _fallback_decision(
        self,
        user_message: str,
        last_recommendations: Optional[List[Dict[str, Any]]] = None,
    ) -> ConversationDecision:
        text = self._strip_diacritics(user_message)
        has_context = bool(last_recommendations)
        slots_patch = self._criteria_slots_patch(text)
        if slots_patch:
            return ConversationDecision(
                intent="refine_search",
                should_recommend=True,
                slots_patch=slots_patch,
                referenced_tour_indexes=[],
                answer="",
            )

        if has_context and re.fullmatch(r"\s*(ok|oke|okay|uh|u|roi|duoc|duoc roi|on|cam on|thanks)\s*[.!?]*\s*", text):
            return ConversationDecision(
                intent="acknowledgement",
                should_recommend=False,
                referenced_tour_indexes=[1],
                answer="Ok, m\u00ecnh gi\u1eef l\u1ef1a ch\u1ecdn n\u00e0y l\u00e0m ph\u01b0\u01a1ng \u00e1n \u01b0u ti\u00ean. N\u1ebfu mu\u1ed1n ch\u1eafc h\u01a1n, b\u1ea1n c\u00f3 th\u1ec3 h\u1ecfi m\u00ecnh so s\u00e1nh tour 1 v\u1edbi tour 2.",
            )

        if has_context and (
            re.search(r"\b(tour nao|cai nao|lua chon nao).{0,40}\bhon\b", text)
            or re.search(r"\bso sanh\b", text)
            or re.search(r"\b(hop gia dinh|phu hop gia dinh|phu hop hon|ngon hon|tot hon|de di hon|on hon)\b", text)
            or re.search(r"\b(tang ngan sach|them ngan sach|ngan sach.*hon)\b", text)
        ):
            return ConversationDecision(
                intent="compare_recommendations",
                should_recommend=False,
                referenced_tour_indexes=[],
                answer="",
            )

        if has_context and re.search(r"\b(ly do|y do|vi sao|co gi hay|dang tien|nen chon|khac gi|tour\s*\d+|cai nay|tour nay|lich trinh|ngay\s*\d+|khach san|o dau|luu tru)\b", text):
            return ConversationDecision(
                intent="answer_about_recommendation",
                should_recommend=False,
                referenced_tour_indexes=[1],
                answer="",
            )

        return ConversationDecision(intent="new_search", should_recommend=True)

    @staticmethod
    def _format_rating_five(value: Optional[float]) -> str:
        if not value or value <= 0:
            rating = 4.0
        else:
            rating = float(value) / 2 if float(value) > 5 else float(value)
            rating = min(5.0, max(0.0, rating))
        return f"{rating:.1f}/5 sao"

    def _fallback_recommendation_message(
        self,
        slot_data: Dict[str, Any],
        recommendations: List[Dict[str, Any]],
        relaxed_reason: Optional[str] = None,
    ) -> str:
        if not recommendations:
            destination = slot_data.get("destination") or "\u0111i\u1ec3m \u0111\u1ebfn n\u00e0y"
            return f"M\u00ecnh ch\u01b0a t\u00ecm th\u1ea5y tour ph\u00f9 h\u1ee3p cho {destination}. B\u1ea1n th\u1eed n\u1edbi ng\u00e2n s\u00e1ch, s\u1ed1 ng\u00e0y ho\u1eb7c \u0111\u1ed5i \u0111i\u1ec3m \u0111\u1ebfn g\u1ea7n t\u01b0\u01a1ng t\u1ef1 nh\u00e9."

        top_tour = recommendations[0]
        prefix = f"{relaxed_reason} " if relaxed_reason else ""
        rating = top_tour.get("avg_rating")
        rating_text = f"\u0111\u00e1nh gi\u00e1 {self._format_rating_five(rating)}"
        return (
            f"{prefix}M\u00ecnh \u0111\u00e3 t\u00ecm \u0111\u01b0\u1ee3c v\u00e0i tour ph\u00f9 h\u1ee3p v\u00e0 x\u1ebfp theo m\u1ee9c \u0111\u1ed9 h\u1ee3p nhu c\u1ea7u c\u1ee7a b\u1ea1n. "
            f"L\u1ef1a ch\u1ecdn n\u1ed5i b\u1eadt hi\u1ec7n t\u1ea1i l\u00e0 {top_tour.get('name')}: gi\u00e1 "
            f"{int(top_tour.get('price') or 0):,} VND, {top_tour.get('duration')} ng\u00e0y, {rating_text}. "
            "B\u1ea1n c\u00f3 th\u1ec3 h\u1ecfi ti\u1ebfp: l\u00fd do n\u00ean ch\u1ecdn tour 1 ho\u1eb7c so s\u00e1nh tour 1 v\u00e0 2."
        )
