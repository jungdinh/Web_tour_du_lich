"""ML-based reranker for personalized tour recommendations.

Loads the trained sklearn artifact from app/models/tour_recommender_model.pkl
and scores candidate tours with the same feature order used in Colab.
"""
from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional

import joblib
import numpy as np
import pandas as pd


class MLRanker:
    def __init__(self, model_path: Optional[Path] = None):
        self.model_path = model_path or Path(__file__).resolve().parents[1] / "models" / "tour_recommender_model.pkl"
        self.artifact = None
        self.model = None
        self.features: List[str] = []
        self.threshold = 0.5
        self.enabled = False
        self.load_error: Optional[str] = None
        self._load()

    def _load(self) -> None:
        if not self.model_path.exists():
            self.load_error = f"Model file not found: {self.model_path}"
            return

        try:
            artifact = joblib.load(self.model_path)
            if isinstance(artifact, dict):
                self.artifact = artifact
                self.model = artifact.get("model")
                self.features = list(artifact.get("features") or [])
                self.threshold = float(artifact.get("threshold", 0.5))
            else:
                self.artifact = {"model": artifact}
                self.model = artifact

            if self.model is None or not hasattr(self.model, "predict_proba"):
                self.load_error = "Loaded artifact does not expose predict_proba"
                return

            if not self.features:
                self.features = [
                    "tag_similarity",
                    "destination_match",
                    "price_match",
                    "duration_match",
                    "price",
                    "duration",
                    "avg_rating",
                    "review_count",
                    "budget_max",
                    "preferred_duration",
                ]

            self.enabled = True
        except Exception as exc:  # pragma: no cover - defensive runtime fallback
            self.load_error = str(exc)
            self.enabled = False

    @staticmethod
    def _safe_number(value, default: float = 0.0) -> float:
        if value is None or value == "":
            return default
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _tag_similarity(user_preferences: Dict[str, float], tour_tags: Dict[str, float]) -> float:
        tags = set(user_preferences) | set(tour_tags)
        if not tags:
            return 0.0

        user_vector = np.array([float(user_preferences.get(tag, 0.0)) for tag in tags], dtype=float)
        tour_vector = np.array([float(tour_tags.get(tag, 0.0)) for tag in tags], dtype=float)
        user_norm = np.linalg.norm(user_vector)
        tour_norm = np.linalg.norm(tour_vector)
        if user_norm == 0 or tour_norm == 0:
            return 0.0
        return float(np.dot(user_vector, tour_vector) / (user_norm * tour_norm))

    def build_features(
        self,
        tour: Dict,
        user_preferences: Dict[str, float],
        filters: Optional[Dict] = None,
    ) -> Dict[str, float]:
        filters = filters or {}
        destination = str(filters.get("destination") or "").lower().strip()
        tour_destination = str(tour.get("destination") or "").lower().strip()
        budget_max = self._safe_number(filters.get("max_price"), 0.0)
        preferred_duration = self._safe_number(
            filters.get("duration") or filters.get("duration_min") or filters.get("duration_max"),
            0.0,
        )
        price = self._safe_number(tour.get("price"), 0.0)
        duration = self._safe_number(tour.get("duration"), 0.0)

        return {
            "tag_similarity": self._tag_similarity(user_preferences, tour.get("tags") or {}),
            "destination_match": float(bool(destination and destination in tour_destination)),
            "price_match": float(bool(budget_max and price <= budget_max)),
            "duration_match": float(bool(preferred_duration and duration == preferred_duration)),
            "price": price,
            "duration": duration,
            "avg_rating": self._safe_number(tour.get("avg_rating"), 0.0),
            "review_count": self._safe_number(tour.get("review_count"), 0.0),
            "budget_max": budget_max,
            "preferred_duration": preferred_duration,
        }

    def score(self, feature_values: Dict[str, float]) -> float:
        if not self.enabled or self.model is None:
            return 0.0

        row = pd.DataFrame([[feature_values.get(feature, 0.0) for feature in self.features]], columns=self.features)
        return float(self.model.predict_proba(row)[0, 1])

    def rerank(
        self,
        tours: List[Dict],
        user_preferences: Dict[str, float],
        filters: Optional[Dict] = None,
        top_k: int = 10,
    ) -> List[Dict]:
        if not self.enabled or not tours:
            return tours[:top_k]

        feature_rows = [self.build_features(tour, user_preferences, filters) for tour in tours]
        frame = pd.DataFrame(
            [[row.get(feature, 0.0) for feature in self.features] for row in feature_rows],
            columns=self.features,
        )
        ml_scores = self.model.predict_proba(frame)[:, 1]

        reranked = []
        for tour, feature_values, ml_score in zip(tours, feature_rows, ml_scores):
            ml_score = float(ml_score)
            combined_score = 0.7 * ml_score + 0.3 * float(tour.get("score", feature_values["tag_similarity"]))
            updated = dict(tour)
            updated["ml_score"] = ml_score
            updated["score"] = combined_score
            updated["ranking_source"] = "ml_random_forest"
            reranked.append(updated)

        reranked.sort(key=lambda item: item.get("score", 0.0), reverse=True)
        return reranked[:top_k]
