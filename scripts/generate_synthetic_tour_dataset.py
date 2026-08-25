"""Generate a synthetic tour recommendation dataset matching the project DB schema.

Output: datasets/synthetic_tour_recommendation/*.csv
Use this when the local database is sparse but you need a consistent dataset for
training a recommender/ranker in Google Colab.
"""
from __future__ import annotations

import csv
import hashlib
import json
import math
import random
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "datasets" / "synthetic_tour_recommendation"
RANDOM_SEED = 20260813
random.seed(RANDOM_SEED)

TAGS = [
    "family", "romantic", "adventure", "beach", "nature", "food", "culture",
    "relax", "budget", "luxury", "spiritual", "photography", "shopping",
    "mountain", "city", "history", "festival", "wildlife", "cruise",
    "nightlife", "water_sports",
]

DESTINATION_PROFILES = {
    "Đà Lạt": {"tags": ["nature", "photography", "romantic", "relax", "mountain", "food"], "price": (3200000, 8200000), "duration": [3, 4, 5], "season": "winter"},
    "Đà Nẵng": {"tags": ["beach", "city", "family", "food", "photography", "water_sports"], "price": (3500000, 9500000), "duration": [3, 4, 5], "season": "summer"},
    "Phú Quốc": {"tags": ["beach", "relax", "luxury", "family", "water_sports", "romantic"], "price": (5200000, 16000000), "duration": [3, 4, 5], "season": "summer"},
    "Sa Pa": {"tags": ["mountain", "nature", "adventure", "culture", "photography"], "price": (2800000, 7800000), "duration": [2, 3, 4], "season": "winter"},
    "Hạ Long": {"tags": ["cruise", "beach", "family", "luxury", "photography"], "price": (4200000, 12500000), "duration": [2, 3, 4], "season": "summer"},
    "Nha Trang": {"tags": ["beach", "water_sports", "nightlife", "family", "food"], "price": (3600000, 10500000), "duration": [3, 4, 5], "season": "summer"},
    "Huế": {"tags": ["history", "culture", "food", "spiritual", "city"], "price": (2600000, 7600000), "duration": [2, 3, 4], "season": "spring"},
    "Hội An": {"tags": ["culture", "history", "food", "photography", "romantic"], "price": (3000000, 9000000), "duration": [2, 3, 4], "season": "autumn"},
    "Hà Nội": {"tags": ["city", "history", "culture", "food", "shopping"], "price": (2200000, 7200000), "duration": [2, 3, 4], "season": "autumn"},
    "TP. Hồ Chí Minh": {"tags": ["city", "food", "shopping", "nightlife", "history"], "price": (2200000, 8200000), "duration": [2, 3, 4], "season": "all"},
    "Côn Đảo": {"tags": ["beach", "history", "spiritual", "nature", "relax"], "price": (5200000, 14500000), "duration": [3, 4, 5], "season": "summer"},
    "Cao Bằng": {"tags": ["mountain", "nature", "adventure", "photography", "culture"], "price": (4200000, 9800000), "duration": [3, 4, 5], "season": "autumn"},
}

PERSONAS = {
    "family_budget": ["family", "budget", "beach", "city", "food"],
    "couple_relax": ["romantic", "relax", "photography", "beach", "food"],
    "adventure_nature": ["adventure", "nature", "mountain", "photography", "wildlife"],
    "luxury_resort": ["luxury", "relax", "cruise", "beach", "romantic"],
    "culture_food": ["culture", "history", "food", "spiritual", "city"],
    "young_city": ["city", "nightlife", "shopping", "food", "photography"],
}

REVIEW_TEMPLATES = [
    "Tour {destination} lịch trình hợp lý, hướng dẫn viên nhiệt tình, trải nghiệm {tag} rất rõ.",
    "Mình thích phần {tag}, giá phù hợp và dịch vụ ổn so với kỳ vọng.",
    "Đi {destination} khá vui, điểm tham quan đẹp, phù hợp nhóm thích {tag}.",
    "Khách sạn và di chuyển ổn, tour có nhiều hoạt động {tag}, đáng cân nhắc.",
    "Gia đình mình hài lòng với tour {destination}, nhịp đi vừa phải và dễ tham gia.",
]

@dataclass
class Tour:
    id: int
    destination: str
    price: int
    duration: int
    avg_rating: float
    review_count: int
    tags: Dict[str, float]


def stable_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def write_csv(path: Path, rows: Iterable[Dict]) -> None:
    rows = list(rows)
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def weighted_tags(destination: str) -> Dict[str, float]:
    profile_tags = DESTINATION_PROFILES[destination]["tags"]
    tags: Dict[str, float] = {}
    for tag in profile_tags:
        tags[tag] = round(random.uniform(0.58, 0.98), 3)
    for tag in random.sample([t for t in TAGS if t not in tags], random.randint(1, 3)):
        tags[tag] = round(random.uniform(0.18, 0.48), 3)
    return dict(sorted(tags.items(), key=lambda item: item[1], reverse=True))


def generate_tours(count: int = 240) -> Tuple[List[Dict], List[Dict], List[Dict], List[Tour]]:
    tours_rows, tag_rows, review_rows, tours = [], [], [], []
    now = datetime(2026, 8, 13, 8, 0, 0)
    tour_id = tag_id = review_id = 1
    styles = ["Tiết Kiệm", "Trọn Gói", "Cao Cấp", "Khám Phá", "Nghỉ Dưỡng", "Ẩm Thực", "Gia Đình", "Check-in"]

    for _ in range(count):
        destination = random.choice(list(DESTINATION_PROFILES.keys()))
        profile = DESTINATION_PROFILES[destination]
        duration = random.choice(profile["duration"])
        price_min, price_max = profile["price"]
        price = int(round(random.randint(price_min, price_max) / 10000) * 10000)
        original_price = int(price * random.uniform(1.0, 1.25))
        tags = weighted_tags(destination)
        avg_rating = round(random.uniform(7.4, 9.7), 1)
        review_count = random.randint(4, 120)
        style = random.choice(styles)
        duration_label = f"{duration}N{max(duration - 1, 1)}Đ"
        top_tag = next(iter(tags))
        name = f"Tour {destination} {duration_label}: {style} {top_tag.replace('_', ' ').title()}"
        description = f"Hành trình {destination} {duration} ngày dành cho du khách yêu thích {', '.join(list(tags)[:3])}."
        source = random.choice(["bestprice", "klook", "traveloka"])
        source_url = f"https://synthetic.example.com/tours/{tour_id}"
        created_at = now - timedelta(days=random.randint(1, 720))

        tours_rows.append({
            "id": tour_id,
            "name": name,
            "destination": destination,
            "price": price,
            "duration": duration,
            "description": description,
            "avg_rating": avg_rating,
            "review_count": review_count,
            "source": source,
            "source_url": source_url,
            "season": profile["season"],
            "image_url": f"https://picsum.photos/seed/tour-{tour_id}/900/600",
            "created_at": created_at.isoformat(sep=" "),
            "updated_at": (created_at + timedelta(days=random.randint(0, 30))).isoformat(sep=" "),
            "duration_label": duration_label,
            "original_price": original_price,
            "highlights": json.dumps([f"Trải nghiệm {tag}" for tag in list(tags)[:3]], ensure_ascii=False),
            "places": json.dumps([destination], ensure_ascii=False),
            "topics": json.dumps(list(tags)[:4], ensure_ascii=False),
            "gallery": json.dumps([f"https://picsum.photos/seed/tour-{tour_id}-{i}/900/600" for i in range(1, 4)], ensure_ascii=False),
            "itinerary": json.dumps([{"day": day, "title": f"Ngày {day} tại {destination}"} for day in range(1, duration + 1)], ensure_ascii=False),
            "included": json.dumps(["Xe đưa đón", "Hướng dẫn viên", "Vé tham quan"], ensure_ascii=False),
            "excluded": json.dumps(["Chi phí cá nhân", "VAT"], ensure_ascii=False),
            "schedule": json.dumps([{"month": m, "available": True} for m in [3, 6, 9, 12]], ensure_ascii=False),
            "transport": json.dumps({"type": random.choice(["bus", "flight", "car", "cruise"])}, ensure_ascii=False),
        })

        for tag, weight in tags.items():
            tag_rows.append({"id": tag_id, "tour_id": tour_id, "tag": tag, "weight": weight})
            tag_id += 1

        for _ in range(random.randint(2, 6)):
            review_tag = random.choice(list(tags.keys()))
            rating = round(clamp(random.gauss(avg_rating / 10, 0.08), 0.4, 1.0) * 10, 1)
            review_rows.append({
                "id": review_id,
                "tour_id": tour_id,
                "content": random.choice(REVIEW_TEMPLATES).format(destination=destination, tag=review_tag),
                "language": "vi",
                "rating": rating,
                "reviewer_name": random.choice(["Minh Anh", "Hoàng Nam", "Thu Hà", "Gia Huy", "Phương Linh", "Quốc Bảo"]),
                "created_at": (now - timedelta(days=random.randint(1, 600))).isoformat(sep=" "),
            })
            review_id += 1

        tours.append(Tour(tour_id, destination, price, duration, avg_rating, review_count, tags))
        tour_id += 1

    return tours_rows, tag_rows, review_rows, tours


def generate_users(count: int = 120) -> Tuple[List[Dict], Dict[int, Dict[str, float]], Dict[int, str]]:
    users, preference_vectors, personas = [], {}, {}
    now = datetime(2026, 8, 13, 8, 0, 0)
    pref_id = 1
    user_preferences_rows = []

    for user_id in range(1, count + 1):
        persona_name, persona_tags = random.choice(list(PERSONAS.items()))
        personas[user_id] = persona_name
        vector = {tag: 0.0 for tag in TAGS}
        for tag in persona_tags:
            vector[tag] = round(random.uniform(0.55, 1.0), 3)
        for tag in random.sample([tag for tag in TAGS if tag not in persona_tags], random.randint(1, 4)):
            vector[tag] = round(random.uniform(0.1, 0.35), 3)
        preference_vectors[user_id] = vector

        created_at = now - timedelta(days=random.randint(5, 540))
        users.append({
            "id": user_id,
            "name": f"Synthetic User {user_id:03d}",
            "email": f"synthetic_user_{user_id:03d}@example.com",
            "password_hash": stable_hash(f"synthetic-password-{user_id}"),
            "role": "user",
            "created_at": created_at.isoformat(sep=" "),
            "updated_at": created_at.isoformat(sep=" "),
        })

        for tag, weight in vector.items():
            if weight > 0:
                user_preferences_rows.append({
                    "id": pref_id,
                    "user_id": user_id,
                    "tag": tag,
                    "weight": weight,
                })
                pref_id += 1

    return users, preference_vectors, personas, user_preferences_rows


def cosine_similarity(left: Dict[str, float], right: Dict[str, float]) -> float:
    dot = sum(left.get(tag, 0.0) * right.get(tag, 0.0) for tag in TAGS)
    left_norm = math.sqrt(sum(left.get(tag, 0.0) ** 2 for tag in TAGS))
    right_norm = math.sqrt(sum(right.get(tag, 0.0) ** 2 for tag in TAGS))
    if not left_norm or not right_norm:
        return 0.0
    return dot / (left_norm * right_norm)


def match_score(user_vector: Dict[str, float], tour: Tour, preferred_destinations: List[str], budget_max: int, preferred_duration: int) -> float:
    tag_score = cosine_similarity(user_vector, tour.tags)
    destination_score = 1.0 if tour.destination in preferred_destinations else 0.0
    price_score = 1.0 if tour.price <= budget_max else max(0.0, 1 - (tour.price - budget_max) / max(budget_max, 1))
    duration_score = max(0.0, 1 - abs(tour.duration - preferred_duration) / 5)
    rating_score = tour.avg_rating / 10
    return clamp(0.42 * tag_score + 0.18 * destination_score + 0.16 * price_score + 0.14 * duration_score + 0.10 * rating_score)


def generate_interactions(tours: List[Tour], user_vectors: Dict[int, Dict[str, float]]) -> Tuple[List[Dict], List[Dict], List[Dict]]:
    actions, favorites, training_rows = [], [], []
    action_id = favorite_id = 1
    now = datetime(2026, 8, 13, 8, 0, 0)

    destination_names = list(DESTINATION_PROFILES.keys())
    for user_id, vector in user_vectors.items():
        preferred_destinations = random.sample(destination_names, random.randint(2, 4))
        budget_max = random.choice([4000000, 6000000, 8000000, 10000000, 14000000, 18000000])
        preferred_duration = random.choice([2, 3, 4, 5])
        sampled_tours = random.sample(tours, min(70, len(tours)))

        scored = []
        for tour in sampled_tours:
            score = match_score(vector, tour, preferred_destinations, budget_max, preferred_duration)
            probability = clamp(score + random.uniform(-0.18, 0.18))
            label = 1 if probability >= 0.58 else 0
            scored.append((tour, score, label))

            tag_similarity = cosine_similarity(vector, tour.tags)
            training_rows.append({
                "user_id": user_id,
                "tour_id": tour.id,
                "tag_similarity": round(tag_similarity, 5),
                "destination_match": int(tour.destination in preferred_destinations),
                "price_match": int(tour.price <= budget_max),
                "duration_match": int(tour.duration == preferred_duration),
                "price": tour.price,
                "duration": tour.duration,
                "avg_rating": tour.avg_rating,
                "review_count": tour.review_count,
                "budget_max": budget_max,
                "preferred_duration": preferred_duration,
                "persona": "|".join(sorted([tag for tag, weight in vector.items() if weight >= 0.5])),
                "label": label,
                "target_score": round(score, 5),
            })

        positives = [item for item in scored if item[2] == 1]
        random.shuffle(positives)
        for tour, score, _ in positives[: random.randint(8, 18)]:
            created_at = now - timedelta(days=random.randint(1, 240), hours=random.randint(0, 23))
            action_type = random.choices(["view", "click", "save"], weights=[0.45, 0.35, 0.20], k=1)[0]
            actions.append({
                "id": action_id,
                "user_id": user_id,
                "tour_id": tour.id,
                "action_type": action_type,
                "search_query": "",
                "created_at": created_at.isoformat(sep=" "),
            })
            action_id += 1

            if action_type == "save" or score > 0.78:
                favorites.append({
                    "id": favorite_id,
                    "user_id": user_id,
                    "tour_id": tour.id,
                    "created_at": created_at.isoformat(sep=" "),
                })
                favorite_id += 1

        for destination in preferred_destinations[:2]:
            actions.append({
                "id": action_id,
                "user_id": user_id,
                "tour_id": "",
                "action_type": "search",
                "search_query": f"tour {destination} {preferred_duration} ngày dưới {budget_max // 1000000} triệu",
                "created_at": (now - timedelta(days=random.randint(1, 180))).isoformat(sep=" "),
            })
            action_id += 1

    unique_favorites = {}
    for favorite in favorites:
        unique_favorites[(favorite["user_id"], favorite["tour_id"])] = favorite
    favorites = []
    for new_id, favorite in enumerate(unique_favorites.values(), start=1):
        favorite["id"] = new_id
        favorites.append(favorite)

    return actions, favorites, training_rows


def generate_chat(users: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
    sessions, messages = [], []
    session_id = message_id = 1
    now = datetime(2026, 8, 13, 8, 0, 0)
    samples = [
        ("Tôi muốn đi Đà Lạt 3 ngày, ngân sách 5 triệu", "Mình sẽ tìm các tour Đà Lạt gần ngân sách và thời lượng của bạn."),
        ("Gia đình mình muốn đi biển, khoảng 4 ngày", "Bạn cho mình biết thêm ngân sách dự kiến để lọc tour phù hợp hơn nhé."),
        ("Tour đầu có gì hay?", "Tour đầu nổi bật ở điểm đến, mức giá và nhóm trải nghiệm phù hợp với sở thích của bạn."),
    ]
    for user in users[:40]:
        created_at = now - timedelta(days=random.randint(1, 90))
        sessions.append({"id": session_id, "user_id": user["id"], "created_at": created_at.isoformat(sep=" ")})
        for role, content in [("user", samples[user["id"] % len(samples)][0]), ("assistant", samples[user["id"] % len(samples)][1])]:
            messages.append({
                "id": message_id,
                "session_id": session_id,
                "role": role,
                "content": content,
                "created_at": (created_at + timedelta(minutes=message_id % 8)).isoformat(sep=" "),
            })
            message_id += 1
        session_id += 1
    return sessions, messages


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tours_rows, tag_rows, review_rows, tours = generate_tours()
    users, user_vectors, _personas, preference_rows = generate_users()
    action_rows, favorite_rows, training_rows = generate_interactions(tours, user_vectors)
    chat_sessions, chat_messages = generate_chat(users)

    files = {
        "tours.csv": tours_rows,
        "tour_tags.csv": tag_rows,
        "reviews.csv": review_rows,
        "users.csv": users,
        "user_preferences.csv": preference_rows,
        "user_actions.csv": action_rows,
        "favorites.csv": favorite_rows,
        "chat_sessions.csv": chat_sessions,
        "chat_messages.csv": chat_messages,
        "training_interactions.csv": training_rows,
    }
    for filename, rows in files.items():
        write_csv(OUT_DIR / filename, rows)
        print(f"{filename}: {len(rows)} rows")

    metadata = {
        "random_seed": RANDOM_SEED,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "description": "Synthetic dataset matching the tour recommendation DB schema plus training_interactions.csv for ML ranking.",
        "tables": {filename: len(rows) for filename, rows in files.items()},
    }
    (OUT_DIR / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nOutput directory: {OUT_DIR}")


if __name__ == "__main__":
    main()
