"""Seed tours from BestPrice crawl JSON files into PostgreSQL.

Reads every `*.json` under `crawl/details/` (default), parses the same
shape used by `web-fe/src/data/sampleTour.ts`, and UPSERTs into the
`tours` table along with `reviews` and `tour_tags`.

Idempotent: re-running on the same files is a no-op (keyed by
`source_url`). Vietnamese-only reviews are inserted per project scope.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
from glob import glob
from pathlib import Path

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import Json

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

load_dotenv()

DEFAULT_JSON_DIR = Path(__file__).resolve().parents[1] / "crawl" / "details"
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:123@localhost:5432/tour_recommendation")


# ──────────────────────────────────────────────────────────────────────────────
# Parsing helpers (mirror web-fe/src/data/sampleTour.ts to keep both in sync)
# ──────────────────────────────────────────────────────────────────────────────

_NUM = re.compile(r"\D+")


def parse_vnd_price(value) -> int:
    """'935.000đ' -> 935000. None/empty -> 0."""
    if not value:
        return 0
    if isinstance(value, (int, float)):
        return int(value)
    digits = _NUM.sub("", str(value))
    return int(digits) if digits else 0


def parse_rating(value) -> float:
    """'8.8' -> 8.8. Returns 0 when blank or non-finite."""
    if not value:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def extract_tour_id(raw: dict) -> int:
    """Pull the numeric id off the BestPrice filename or URL tail."""
    for source in (raw.get("url") or "",):
        match = re.search(r"-(\d+)\.(html|json)$", source)
        if match:
            return int(match.group(1))
    return 0


def normalize_date(ddmmyyyy: str) -> str:
    """'17/01/2024' -> '2024-01-17'. Returns the raw value if not 3 parts."""
    if not ddmmyyyy or "/" not in ddmmyyyy:
        return ddmmyyyy or ""
    parts = ddmmyyyy.split("/")
    if len(parts) != 3:
        return ddmmyyyy
    d, m, y = parts
    return f"{y}-{int(m):02d}-{int(d):02d}"


# Vietnamese tag taxonomy (matches CLAUDE.md / quick_seed.py)
TAG_TAXONOMY = [
    "family", "romantic", "adventure", "beach", "nature", "food",
    "culture", "relax", "budget", "luxury", "spiritual",
    "photography", "shopping", "mountain", "city",
]

TAG_RULES = {
    "family": ["gia đình", "trẻ em", "con nhỏ", "family"],
    "romantic": ["lãng mạn", "cặp đôi", "honeymoon", "couple"],
    "adventure": ["mạo hiểm", "trekking", "leo núi", "kayak", "adventure"],
    "beach": ["biển", "bãi biển", "đảo", "cát trắng", "tắm biển"],
    "nature": ["thiên nhiên", "rừng", "sinh thái", "phong cảnh"],
    "food": ["ẩm thực", "đặc sản", "food tour", "ẩm thực đường phố"],
    "culture": ["văn hóa", "lịch sử", "di tích", "heritage", "truyền thống"],
    "relax": ["nghỉ dưỡng", "thư giãn", "spa", "resort"],
    "budget": ["tiết kiệm", "giá rẻ", "sinh viên", "budget"],
    "luxury": ["sang trọng", "luxury", "5 sao", "cao cấp", "premium"],
    "spiritual": ["tâm linh", "chùa", "đền", "thiền", "pagoda"],
    "photography": ["check-in", "chụp ảnh", "view đẹp", "sống ảo"],
    "shopping": ["mua sắm", "chợ", "shopping", "outlet"],
    "mountain": ["núi", "cao nguyên", "sapa", "mountain", "phong sương"],
    "city": ["thành phố", "city tour", "đô thị", "downtown"],
}

# Words that should NOT make it into a tag list (negative cues)
NEGATIVE_RULES = {
    "beach": ["không có biển"],
}


def infer_tags_from_raw(raw: dict) -> dict[str, float]:
    """Derive tag weights from title/description/highlights/topics/places.

    BestPrice's `topics` array is a near-direct tag hint when present, so we
    map those first and only fall back to keyword rules.
    """
    scores: dict[str, float] = {}
    haystack_parts = [
        (raw.get("title") or "").lower(),
        (raw.get("description") or "").lower(),
        " ".join(raw.get("highlights") or []).lower(),
        " ".join(raw.get("topics") or []).lower(),
        " ".join(raw.get("places") or []).lower(),
    ]
    haystack = " ".join(haystack_parts)

    # Direct topics -> tag with high confidence
    for topic in raw.get("topics") or []:
        topic_norm = topic.strip().lower()
        if topic_norm in TAG_TAXONOMY:
            scores[topic_norm] = max(scores.get(topic_norm, 0.0), 0.85)

    # Keyword rules on combined text
    for tag, keywords in TAG_RULES.items():
        for kw in keywords:
            if kw.lower() in haystack:
                # Negative cues
                negs = NEGATIVE_RULES.get(tag, [])
                if any(n.lower() in haystack for n in negs):
                    continue
                scores[tag] = max(scores.get(tag, 0.0), 0.7)
                break

    # Floor: at least 2 tags so recommendation engine has signal
    if len(scores) < 2:
        for fallback in ("culture", "city"):
            scores.setdefault(fallback, 0.45)
            if len(scores) >= 2:
                break

    # Clamp 0..1 in case of weird upstream values
    return {t: max(0.0, min(w, 1.0)) for t, w in scores.items()}


def normalize(raw: dict) -> dict:
    """Convert one BestPrice raw object into rows we can insert."""
    tour_id = extract_tour_id(raw)
    duration = (raw.get("duration") or {})
    schedule = [
        {
            "date": row.get("date"),
            "price": parse_vnd_price(row.get("price")),
            "available": bool(row.get("available")),
        }
        for row in (raw.get("schedule") or [])
    ]
    transport = raw.get("transport") or {}
    return {
        "id": tour_id,
        "name": raw.get("title") or "(Chưa có tiêu đề)",
        "destination": raw.get("category") or "Khác",
        "price": parse_vnd_price(raw.get("price")),
        "original_price": parse_vnd_price(raw.get("original_price")) or None,
        "duration": duration.get("days", 0) or 0,
        "duration_label": duration.get("label"),
        "avg_rating": parse_rating(raw.get("rating")),
        "review_count": raw.get("review_count", 0) or 0,
        "image_url": (raw.get("gallery") or [None])[0],
        "description": raw.get("description"),
        "source": "bestprice",
        "source_url": raw.get("url"),
        "highlights": raw.get("highlights") or [],
        "places": raw.get("places") or [],
        "topics": raw.get("topics") or [],
        "gallery": raw.get("gallery") or [],
        "itinerary": raw.get("itinerary") or [],
        "included": raw.get("included") or [],
        "excluded": raw.get("excluded") or [],
        "schedule": schedule,
        "transport": {
            "airline": transport.get("airline") or None,
            "vehicle": transport.get("vehicle") or [],
        },
    }


# ──────────────────────────────────────────────────────────────────────────────
# DB ops
# ──────────────────────────────────────────────────────────────────────────────

UPSERT_TOUR_SQL = """
INSERT INTO tours (
    name, destination, price, original_price, duration, duration_label,
    description, avg_rating, review_count, source, source_url, image_url,
    highlights, places, topics, gallery,
    itinerary, included, excluded, schedule, transport
) VALUES (
    %(name)s, %(destination)s, %(price)s, %(original_price)s, %(duration)s, %(duration_label)s,
    %(description)s, %(avg_rating)s, %(review_count)s, %(source)s, %(source_url)s, %(image_url)s,
    %(highlights)s, %(places)s, %(topics)s, %(gallery)s,
    %(itinerary)s, %(included)s, %(excluded)s, %(schedule)s, %(transport)s
)
ON CONFLICT (source_url) DO UPDATE SET
    name = EXCLUDED.name,
    destination = EXCLUDED.destination,
    price = EXCLUDED.price,
    original_price = EXCLUDED.original_price,
    duration = EXCLUDED.duration,
    duration_label = EXCLUDED.duration_label,
    description = EXCLUDED.description,
    avg_rating = EXCLUDED.avg_rating,
    review_count = EXCLUDED.review_count,
    image_url = EXCLUDED.image_url,
    highlights = EXCLUDED.highlights,
    places = EXCLUDED.places,
    topics = EXCLUDED.topics,
    gallery = EXCLUDED.gallery,
    itinerary = EXCLUDED.itinerary,
    included = EXCLUDED.included,
    excluded = EXCLUDED.excluded,
    schedule = EXCLUDED.schedule,
    transport = EXCLUDED.transport,
    updated_at = CURRENT_TIMESTAMP
RETURNING id;
"""

REVIEW_INSERT_SQL = """
INSERT INTO reviews (tour_id, content, rating, reviewer_name, language, created_at)
VALUES (%s, %s, %s, %s, 'vi', %s);
"""

TAG_UPSERT_SQL = """
INSERT INTO tour_tags (tour_id, tag, weight)
VALUES (%s, %s, %s)
ON CONFLICT (tour_id, tag) DO UPDATE SET weight = EXCLUDED.weight;
"""


def upsert_tour(cur, normalized: dict) -> int | None:
    payload = {
        **normalized,
        "highlights": normalized["highlights"],
        "places": normalized["places"],
        "topics": normalized["topics"],
        "gallery": normalized["gallery"],
        "itinerary": Json(normalized["itinerary"]),
        "included": Json(normalized["included"]),
        "excluded": Json(normalized["excluded"]),
        "schedule": Json(normalized["schedule"]),
        "transport": Json(normalized["transport"]),
    }
    cur.execute(UPSERT_TOUR_SQL, payload)
    row = cur.fetchone()
    return row[0] if row else None


def insert_reviews(cur, tour_id: int, raw: dict, replace_existing: bool) -> int:
    reviews = raw.get("reviews") or []
    if replace_existing:
        cur.execute("DELETE FROM reviews WHERE tour_id = %s", (tour_id,))
    inserted = 0
    for r in reviews:
        content = (r.get("content") or "").strip()
        if not content:
            continue
        cur.execute(
            REVIEW_INSERT_SQL,
            (
                tour_id,
                content,
                parse_rating(r.get("score")),
                r.get("name") or "Người dùng ẩn danh",
                normalize_date(r.get("date") or "") or None,
            ),
        )
        inserted += 1
    return inserted


def upsert_tags(cur, tour_id: int, tags: dict[str, float]) -> int:
    for tag, weight in tags.items():
        cur.execute(TAG_UPSERT_SQL, (tour_id, tag, weight))
    return len(tags)


def seed(json_dir: Path, replace_reviews: bool) -> None:
    files = sorted(glob(str(json_dir / "*.json")))
    if not files:
        log.error("Không tìm thấy file JSON nào trong %s", json_dir)
        sys.exit(1)
    log.info("Tìm thấy %d file JSON", len(files))

    log.info("Kết nối DB: %s", DATABASE_URL.split("@")[-1])
    try:
        conn = psycopg2.connect(DATABASE_URL)
    except psycopg2.OperationalError as exc:
        log.error("Không kết nối được DB: %s", exc)
        log.error("Đảm bảo PostgreSQL đang chạy và DATABASE_URL đúng.")
        sys.exit(1)

    try:
        with conn:
            with conn.cursor() as cur:
                tours_done = reviews_done = tags_done = errors = 0
                for path in files:
                    try:
                        with open(path, encoding="utf-8") as fh:
                            raw = json.load(fh)
                        normalized = normalize(raw)
                        if not normalized["source_url"]:
                            log.warning("Bỏ qua %s: thiếu source_url", path)
                            errors += 1
                            continue
                        # Savepoint per file: nếu 1 file fail thì chỉ rollback
                        # phần đó, các file sau vẫn chạy tiếp.
                        cur.execute("SAVEPOINT sp_file")
                        tour_id = upsert_tour(cur, normalized)
                        if tour_id is None:
                            cur.execute("ROLLBACK TO SAVEPOINT sp_file")
                            errors += 1
                            continue
                        reviews_done += insert_reviews(cur, tour_id, raw, replace_reviews)
                        tags_done += upsert_tags(cur, tour_id, infer_tags_from_raw(raw))
                        cur.execute("RELEASE SAVEPOINT sp_file")
                        tours_done += 1
                        if tours_done % 25 == 0:
                            log.info("Đã xử lý %d tour...", tours_done)
                    except Exception as exc:  # noqa: BLE001
                        try:
                            cur.execute("ROLLBACK TO SAVEPOINT sp_file")
                        except psycopg2.Error:
                            # Savepoint có thể không tồn tại nếu lỗi trước khi tạo.
                            pass
                        log.exception("Lỗi khi xử lý %s: %s", path, exc)
                        errors += 1
        log.info(
            "✅ Xong: %d tour, %d reviews, %d tag. Lỗi: %d",
            tours_done,
            reviews_done,
            tags_done,
            errors,
        )
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dir",
        type=Path,
        default=DEFAULT_JSON_DIR,
        help=f"Thư mục chứa file JSON (mặc định: {DEFAULT_JSON_DIR})",
    )
    parser.add_argument(
        "--replace-reviews",
        action="store_true",
        help="Xoá reviews cũ trước khi insert (mặc định: append)",
    )
    args = parser.parse_args()
    seed(args.dir, replace_reviews=args.replace_reviews)


if __name__ == "__main__":
    main()