import time
import unittest

from app.engine.engine_db import RecommendationEngineDB
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

if __name__ == "__main__":
    unittest.main()