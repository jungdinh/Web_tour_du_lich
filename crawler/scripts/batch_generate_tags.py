"""
Batch generate tags cho tất cả tours bằng Gemini API.

Flow:
  1. Backup tất cả tags hiện tại ra JSON
  2. Xóa tags KHÔNG nằm trong taxonomy (vd: 'history')
  3. Với mỗi tour: gọi Gemini -> validate -> xóa tags cũ -> insert tags mới

Usage:
  cd crawler && python scripts/batch_generate_tags.py
"""
import os
import sys
import json
import time
from datetime import datetime
from typing import List, Dict

# Force UTF-8 for Windows console
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass


def log(msg: str):
    """Print với flush=True để hiện progress real-time"""
    print(msg, flush=True)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Thêm ai-service vào path để import tag taxonomy
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..', 'ai-service'))

# Load env from ai-service/.env
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..', 'ai-service', '.env'))

try:
    import psycopg2
except ImportError:
    print("ERROR: psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)

import google.generativeai as genai

# Tag Taxonomy: import từ ai-service/app/llm/tags.py (21 tags)
from app.llm.tags import TAG_TAXONOMY, TAG_DESCRIPTIONS

GEMINI_MODEL = "gemini-3.1-flash-lite"  # free tier rate limit cao nhất (May 2026)
SLEEP_BETWEEN = 6  # seconds - tránh rate limit Gemini free tier
MAX_RETRIES = 1  # không retry nhiều lần khi rate limit (fail → fallback)


def backup_existing_tags(cursor) -> str:
    """Backup tất cả tags ra file JSON, return filename"""
    cursor.execute("SELECT COUNT(*) FROM tour_tags")
    count = cursor.fetchone()[0]
    if count == 0:
        return ""

    backup_file = f"tour_tags_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    cursor.execute("SELECT tour_id, tag, weight FROM tour_tags ORDER BY tour_id, tag")
    rows = cursor.fetchall()
    backup_data = [
        {"tour_id": r[0], "tag": r[1], "weight": float(r[2])}
        for r in rows
    ]
    with open(backup_file, 'w', encoding='utf-8') as f:
        json.dump(backup_data, f, ensure_ascii=False, indent=2)
    print(f"  Backed up {count} tags to {backup_file}")
    return backup_file


def cleanup_invalid_tags(cursor) -> int:
    """Xóa tags không nằm trong taxonomy (vd: 'history')"""
    cursor.execute("""
        DELETE FROM tour_tags
        WHERE tag NOT IN ({})
    """.format(','.join(['%s'] * len(TAG_TAXONOMY))), TAG_TAXONOMY)
    deleted = cursor.rowcount
    if deleted > 0:
        print(f"  Cleaned up {deleted} invalid tags (not in taxonomy)")
    return deleted


def get_tours(cursor) -> List[Dict]:
    """Lấy tất cả tours"""
    cursor.execute("SELECT id, name, destination, duration FROM tours ORDER BY id")
    return [
        {'id': r[0], 'name': r[1], 'destination': r[2], 'duration': r[3]}
        for r in cursor.fetchall()
    ]


def get_reviews_for_tour(cursor, tour_id: int) -> List[str]:
    """Lấy reviews của 1 tour"""
    cursor.execute("""
        SELECT content FROM reviews
        WHERE tour_id = %s AND content IS NOT NULL AND content != ''
        ORDER BY id LIMIT 10
    """, (tour_id,))
    return [r[0] for r in cursor.fetchall()]


def generate_tags_with_gemini(tour: Dict, reviews: List[str], api_key: str) -> Dict[str, float]:
    """Generate tags sử dụng Gemini"""
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(GEMINI_MODEL)

    taxonomy_text = "\n".join([f"- {tag}: {TAG_DESCRIPTIONS[tag]}" for tag in TAG_TAXONOMY])

    context_parts = [f"Tour: {tour['name']}"]
    if tour.get('destination'):
        context_parts.append(f"Destination: {tour['destination']}")
    if tour.get('duration'):
        context_parts.append(f"Duration: {tour['duration']}")
    context_text = "\n".join(context_parts)

    reviews_text = ""
    if reviews:
        reviews_text = "\n\nReviews (sample):\n" + "\n".join([f"- {r[:200]}" for r in reviews[:10]])

    prompt = f"""Bạn là chuyên gia phân tích du lịch Việt Nam. Phân tích tour sau và gán tags phù hợp.

{context_text}
{reviews_text}

21 TAGS (chỉ chọn từ danh sách này):
{taxonomy_text}

NHIỆM VỤ: Trả về JSON object dạng {{"tag_name": weight}}.
- Tag name phải là 1 trong 21 tags ở trên
- Weight là số thập phân từ 0.3 đến 0.95 (cao = rất liên quan)
- Gán 3-7 tags phù hợp nhất

VÍ DỤ OUTPUT ĐÚNG:
{{"beach": 0.9, "relax": 0.8, "food": 0.6}}

CHỈ TRẢ VỀ JSON, KHÔNG GIẢI THÍCH:"""

    for attempt in range(MAX_RETRIES):
        try:
            response = model.generate_content(prompt, request_options={"timeout": 30})
            text = response.text.strip()

            # Strip markdown
            if text.startswith("```"):
                lines = text.split("\n")
                text = "\n".join(lines[1:-1]) if len(lines) > 2 else lines[1]
                text = text.replace("```json", "").replace("```", "").strip()

            raw_tags = json.loads(text)

            # Validate + clamp weights
            valid_tags = {}
            for tag, weight in raw_tags.items():
                if tag in TAG_TAXONOMY:
                    try:
                        w = float(weight)
                        w = max(0.3, min(0.95, w))
                        valid_tags[tag] = w
                    except (ValueError, TypeError):
                        continue

            if valid_tags:
                return valid_tags

            print(f"    No valid tags in response (attempt {attempt+1})")
            time.sleep(2)

        except json.JSONDecodeError as e:
            print(f"    JSON parse error (attempt {attempt+1}): {str(e)[:80]}")
            time.sleep(2)
        except Exception as e:
            err = str(e)
            if "429" in err or "ResourceExhausted" in err:
                wait = 60  # đợi 60s khi rate limit, fallback sẽ chạy
                print(f"    Rate limit hit. Waiting {wait}s then fallback...")
                time.sleep(wait)
            else:
                print(f"    Error: {err[:120]}")
                time.sleep(5)
    return {}


def generate_tags_fallback(tour: Dict, reviews: List[str]) -> Dict[str, float]:
    """Fallback: keyword matching - 21 tags"""
    text = f"{tour['name']} {tour.get('destination', '')} {' '.join(reviews)}".lower()

    keywords = {
        # Đối tượng
        'family': ['gia đình', 'con nhỏ', 'trẻ em', 'bố mẹ', 'cả nhà'],
        'romantic': ['lãng mạn', 'cô dâu', 'chú rể', 'honeymoon', 'cặp đôi'],
        # Phong cách
        'adventure': ['mạo hiểm', 'khám phá', 'leo núi', 'kayak', 'lặn', 'zipline', 'trekking'],
        'relax': ['nghỉ dưỡng', 'spa', 'thư giãn', 'resort', 'yên tĩnh'],
        'spiritual': ['chùa', 'đền', 'tâm linh', 'hành hương', 'thiền'],
        # Cảnh quan
        'beach': ['biển', 'đảo', 'bãi tắm', 'tắm biển'],
        'mountain': ['núi', 'cao nguyên', 'đỉnh', 'fansipan'],
        'nature': ['thiên nhiên', 'cảnh đẹp', 'rừng', 'ruộng bậc thang'],
        'city': ['thành phố', 'phố đi bộ', 'đô thị'],
        # Trải nghiệm
        'culture': ['văn hóa', 'làng nghề', 'phong tục'],
        'history': ['lịch sử', 'di tích', 'chiến tranh', 'triều đại', 'thành cổ', 'bảo tàng'],
        'festival': ['lễ hội', 'festival', 'đua ghe', 'đua bò'],
        'photography': ['check-in', 'sống ảo', 'view đẹp', 'săn mây'],
        'wildlife': ['động vật', 'safari', 'vườn thú', 'thú rừng', 'voọc'],
        'cruise': ['du thuyền', 'tàu', 'cruise', 'vịnh'],
        'nightlife': ['bar', 'club', 'phố đêm', 'beer club', 'nightlife'],
        'water_sports': ['lặn biển', 'snorkeling', 'kayak', 'surfing', 'dù lượn', 'jet ski'],
        # Ăn uống/Mua sắm
        'food': ['ẩm thực', 'đặc sản', 'món ngon', 'ăn uống', 'chợ đêm'],
        'shopping': ['mua sắm', 'chợ', 'trung tâm thương mại'],
        # Giá cả
        'budget': ['giá rẻ', 'tiết kiệm', 'sinh viên', 'bình dân'],
        'luxury': ['sang trọng', '5 sao', 'cao cấp', 'resort 5 sao'],
    }

    tags = {}
    for tag, words in keywords.items():
        if any(w in text for w in words):
            count = sum(1 for w in words if w in text)
            tags[tag] = min(0.95, 0.4 + count * 0.1)

    return tags


def save_tags(cursor, tour_id: int, tags: Dict[str, float]):
    """Xóa tags cũ của tour + insert tags mới"""
    cursor.execute("DELETE FROM tour_tags WHERE tour_id = %s", (tour_id,))
    for tag, weight in tags.items():
        cursor.execute(
            "INSERT INTO tour_tags (tour_id, tag, weight) VALUES (%s, %s, %s)",
            (tour_id, tag, weight)
        )


def main():
    db_url = os.getenv('DATABASE_URL', 'postgresql://postgres:password@localhost:5432/tour_recommendation')
    api_key = os.getenv('GEMINI_API_KEY', '')

    if not api_key:
        log("ERROR: GEMINI_API_KEY not set in ../ai-service/.env")
        return

    log(f"Model: {GEMINI_MODEL}")
    log(f"DB: {db_url.split('@')[-1] if '@' in db_url else db_url}")
    log("")

    try:
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()
        log("Connected to database\n")
    except Exception as e:
        log(f"Cannot connect to database: {e}")
        return

    # Bước 1: Backup
    log("[1/3] Backing up existing tags...")
    backup_file = backup_existing_tags(cursor)

    # Bước 2: Cleanup invalid tags
    log("\n[2/3] Cleaning up invalid tags (not in taxonomy)...")
    cleanup_invalid_tags(cursor)
    conn.commit()

    # Bước 3: Get tours + regenerate tags
    log("\n[3/3] Generating new tags with Gemini...")
    tours = get_tours(cursor)
    log(f"  Found {len(tours)} tours\n")

    if not tours:
        log("No tours found.")
        cursor.close()
        conn.close()
        return

    success_count = 0
    fail_count = 0
    fallback_count = 0

    for i, tour in enumerate(tours, 1):
        # In progress mỗi 10 tours
        prefix = f"[{i}/{len(tours)}]"
        log(f"{prefix} {tour['name'][:60]}")

        reviews = get_reviews_for_tour(cursor, tour['id'])

        # Gọi Gemini
        tags = generate_tags_with_gemini(tour, reviews, api_key)

        # Fallback nếu Gemini fail
        if not tags:
            tags = generate_tags_fallback(tour, reviews)
            if tags:
                fallback_count += 1
                log(f"    -> fallback mock")
            else:
                fail_count += 1
                log(f"    -> FAILED")
                continue

        # Save vào DB
        save_tags(cursor, tour['id'], tags)
        conn.commit()

        top_3 = sorted(tags.items(), key=lambda x: x[1], reverse=True)[:3]
        log(f"    OK: {', '.join([f'{t}({w:.0%})' for t, w in top_3])}")
        success_count += 1

        # Rate limit
        if i < len(tours):
            time.sleep(SLEEP_BETWEEN)

    cursor.close()
    conn.close()

    log("")
    log("=" * 60)
    log(f"DONE")
    log(f"  Success:       {success_count}/{len(tours)}")
    log(f"  Fallback mock: {fallback_count}")
    log(f"  Failed:        {fail_count}")
    if backup_file:
        log(f"  Backup:        {backup_file}")


if __name__ == "__main__":
    main()