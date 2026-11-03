import time
import unittest

from app.engine.engine_db import RecommendationEngineDB
from app.llm.conversation_agent import ConversationAgent
from app.llm.slot_filling import SlotFillingEngine


class ColdStartEngine(RecommendationEngineDB):
    def __init__(self):
        self.received_filters = None

    def get_user_preferences(self, user_id):
        return {}

    def get_popular_tours(self, limit=10, filters=None):
        self.received_filters = filters
        return []


class RecommendationEngineTests(unittest.TestCase):
    def test_cold_start_preserves_requested_filters(self):
        engine = ColdStartEngine()
        filters = {"destination": "Da Lat", "max_price": 5_000_000}

        engine.recommend_for_user(user_id=1, filters=filters, top_k=3)

        self.assertEqual(engine.received_filters, filters)

class SlowLLM:
    def extract_slots(self, message, current_slots):
        time.sleep(0.2)
        return {}


class SlotFillingTests(unittest.TestCase):
    def test_slow_llm_falls_back_to_rules_without_blocking(self):
        engine = SlotFillingEngine(llm_client=SlowLLM())
        engine.llm_timeout_seconds = 0.02

        started_at = time.monotonic()
        slots = engine.extract_slots("Tôi muốn đi Đà Lạt 3 ngày")
        elapsed = time.monotonic() - started_at

        self.assertLess(elapsed, 0.1)
        self.assertEqual(slots["destination"], "Đà Lạt")
        self.assertEqual(slots["duration"], 3)
    def test_extracts_europe_as_destination(self):
        engine = SlotFillingEngine()

        slots = engine.extract_slots("europe")

        self.assertEqual(slots["destination"], "Châu Âu")

    def test_departure_city_does_not_replace_existing_destination(self):
        engine = SlotFillingEngine()

        slots = engine.extract_slots(
            "from tp hcm, private tour",
            current_slots={"destination": "Châu Âu"},
        )

        self.assertEqual(slots["destination"], "Châu Âu")


class ConversationAgentTests(unittest.TestCase):
    def test_explicit_list_request_forces_recommendation(self):
        agent = ConversationAgent()

        decision = agent.analyze(
            "đưa mình xem danh sách tour ngay",
            current_slots={},
        )

        self.assertTrue(decision.should_recommend)
        self.assertTrue(agent.requests_recommendations_now("đưa mình xem danh sách tour ngay"))

if __name__ == "__main__":
    unittest.main()