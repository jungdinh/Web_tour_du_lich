"""
Script để generate sample data cho testing
Chạy: python scripts/generate_sample_data.py
"""
import os
import sys
import random

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

try:
    import psycopg2
except ImportError:
    print("psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)

# Sample data
DESTINATIONS = [
    "Hồ Chí Minh", "Hà Nội", "Đà Nẵng", "Nha Trang", "Phú Quốc",
    "Đà Lạt", "Hội An", "Huế", "Cần Thơ", "Vũng Tàu", "Sa Pa"
]

TOUR_TEMPLATES = [
    ("{destination} City Tour", "Khám phá thành phố {destination} với các điểm đến nổi tiếng"),
    ("Tour {destination} 3N2Đ", "Chuyến đi {destination} 3 ngày 2 đêm đầy thú vị"),
    ("{destination} - Thiên đường biển", "Tận hưởng kỳ nghỉ biển tại {destination}"),
    ("Khám phá {destination}", "Hành trình khám phá vẻ đẹp {destination}"),
    ("{destination} Adventure", "Trải nghiệm mạo hiểm tại {destination}"),
    ("{destination} Heritage", "Tour văn hóa lịch sử {destination}"),
]

DESCRIPTIONS = [
    "Tour bao gồm xe đưa đón, khách sạn 3-4 sao, bữa ăn theo chương trình.",
    "Đội ngũ hướng dẫn viên chuyên nghiệp, nhiệt tình.",
    "Tham quan các điểm du lịch nổi tiếng, thưởng thức ẩm thực địa phương.",
    "Lịch trình linh hoạt, phù hợp với gia đình và nhóm bạn.",
    "Combo tiết kiệm - tiết kiệm đến 20% so với đặt lẻ.",
]

SAMPLE_REVIEWS_VI = [
    "Tour rất tuyệt vời, đi cùng gia đình rất vui. Điểm đến đẹp, hướng dẫn viên nhiệt tình.",
    "Chuyến đi này là trải nghiệm đáng nhớ. Cảnh quan thiên nhiên tuyệt đẹp, nước biển trong xanh.",
    "Giá cả hợp lý, chất lượng dịch vụ tốt. Đặc biệt thích chỗ nghỉ ngơi, view đẹp.",
    "Thích hợp cho gia đình có con nhỏ. Con tôi rất vui khi đi biển.",
    "Tour lãng mạn cho cặp đôi. Không gian yên tĩnh, phù hợp nghỉ dưỡng.",
    "Ăn uống ngon, đặc sản địa phương đa dạng. Đáng để thử.",
    "Hoạt động mạo hiểm thú vị, adrenaline rush. Đáng trải nghiệm.",
    "Chùa chiều đẹp, không gian tâm linh. Tour tâm linh rất ý nghĩa.",
    "Góc chụp ảnh đẹp, view check-in siêu xinh. Nhiều điểm đẹp để selfie.",
    "Mua sắm ở đây đa dạng, nhiều hàng hóa. Chợ đêm sôi động.",
    "Khách sạn sang trọng, dịch vụ 5 sao. Đáng giá tiền.",
    "Tour tiết kiệm cho sinh viên. Chất lượng tốt với mức giá phải chăng.",
    "Thành phố sôi động về đêm, nhiều quán bar và club hay.",
    "Núi non hùng vĩ, khí hậu mát mẻ. Điểm đến lý tưởng mùa hè.",
    "Biển đẹp, cát trắng, nước trong. Đúng chuẩn thiên đường biển.",
]

TAG_TAXONOMY = [
    "family", "romantic", "adventure", "beach", "nature", "food",
    "culture", "relax", "budget", "luxury", "spiritual", "photography",
    "shopping", "mountain", "city"
]

def generate_tour_tags(tour_name, description):
    """Simulate AI tag generation based on tour content"""
    tags = {}
    name_lower = tour_name.lower()
    desc_lower = description.lower()
    
    # Simple keyword matching (simulating LLM behavior)
    if any(w in desc_lower for w in ['gia đình', 'con', 'trẻ']):
        tags['family'] = random.uniform(0.6, 0.9)
    if any(w in name_lower for w in ['lãng mạn', 'cặp đôi', 'honeymoon']):
        tags['romantic'] = random.uniform(0.7, 0.95)
    if any(w in name_lower + desc_lower for w in ['mạo hiểm', 'adventure', 'leo núi', 'kayak']):
        tags['adventure'] = random.uniform(0.6, 0.9)
    if any(w in name_lower + desc_lower for w in ['biển', 'beach', 'bơi', 'đảo']):
        tags['beach'] = random.uniform(0.7, 0.95)
    if any(w in name_lower + desc_lower for w in ['thiên nhiên', 'núi', 'rừng']):
        tags['nature'] = random.uniform(0.5, 0.8)
    if any(w in desc_lower for w in ['ẩm thực', 'đặc sản', 'ăn']):
        tags['food'] = random.uniform(0.5, 0.8)
    if any(w in name_lower + desc_lower for w in ['văn hóa', 'lịch sử', 'di tích', 'heritage']):
        tags['culture'] = random.uniform(0.6, 0.9)
    if any(w in desc_lower for w in ['nghỉ dưỡng', 'thư giãn', 'spa', 'resort']):
        tags['relax'] = random.uniform(0.5, 0.85)
    if any(w in name_lower + desc_lower for w in ['tiết kiệm', 'budget', 'sinh viên', 'giá rẻ']):
        tags['budget'] = random.uniform(0.5, 0.8)
    if any(w in name_lower + desc_lower for w in ['sang trọng', 'luxury', '5 sao', 'cao cấp']):
        tags['luxury'] = random.uniform(0.6, 0.9)
    if any(w in name_lower + desc_lower for w in ['tâm linh', 'chùa', 'spiritual']):
        tags['spiritual'] = random.uniform(0.5, 0.8)
    if any(w in name_lower + desc_lower for w in ['check-in', 'chụp ảnh', 'view', 'photo']):
        tags['photography'] = random.uniform(0.5, 0.85)
    if any(w in name_lower + desc_lower for w in ['mua sắm', 'chợ', 'shopping']):
        tags['shopping'] = random.uniform(0.4, 0.7)
    if any(w in name_lower + desc_lower for w in ['núi', 'cao nguyên', 'mountain', 'sapa']):
        tags['mountain'] = random.uniform(0.5, 0.9)
    if any(w in name_lower + desc_lower for w in ['thành phố', 'city', 'tp']):
        tags['city'] = random.uniform(0.5, 0.8)
    
    if len(tags) < 2:
        tags[random.choice(TAG_TAXONOMY)] = random.uniform(0.5, 0.7)
    
    return tags


def main():
    db_url = os.getenv('DATABASE_URL', 'postgresql://postgres:password@localhost:5432/tour_recommendation')
    
    try:
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()
        print("Connected to database")
    except Exception as e:
        print(f"Cannot connect to database: {e}")
        print("Please ensure PostgreSQL is running and DATABASE_URL is set correctly.")
        return
    
    print("Clearing existing data...")
    cursor.execute("TRUNCATE TABLE tour_tags, reviews, tours, users, user_preferences, user_actions, chat_messages, chat_sessions CASCADE")
    
    print("Generating sample tours...")
    tours = []
    
    for destination in DESTINATIONS:
        num_tours = random.randint(3, 6)
        
        for i in range(num_tours):
            template = random.choice(TOUR_TEMPLATES)
            tour_name = template[0].format(destination=destination)
            description = random.choice(DESCRIPTIONS)
            price = random.randint(500000, 15000000)
            duration = random.choice([1, 2, 3, 4, 5])
            avg_rating = round(random.uniform(3.5, 5.0), 1)
            review_count = random.randint(5, 200)
            source = random.choice(['klook', 'traveloka'])
            season = random.choice(['spring', 'summer', 'autumn', 'winter', 'all'])
            
            cursor.execute("""
                INSERT INTO tours (name, destination, price, duration, description, avg_rating, review_count, source, season)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (tour_name, destination, price, duration, description, avg_rating, review_count, source, season))
            
            inserted_id = cursor.fetchone()[0]
            tours.append(inserted_id)
            
            tags = generate_tour_tags(tour_name, description)
            for tag, weight in tags.items():
                cursor.execute("""
                    INSERT INTO tour_tags (tour_id, tag, weight)
                    VALUES (%s, %s, %s)
                """, (inserted_id, tag, weight))
            
            num_reviews = random.randint(3, 15)
            for _ in range(num_reviews):
                review_content = random.choice(SAMPLE_REVIEWS_VI)
                rating = round(random.uniform(3.0, 5.0), 1)
                reviewer_name = f"User{random.randint(1000, 9999)}"
                
                cursor.execute("""
                    INSERT INTO reviews (tour_id, content, language, rating, reviewer_name)
                    VALUES (%s, %s, 'vi', %s, %s)
                """, (inserted_id, review_content, rating, reviewer_name))
    
    conn.commit()
    print(f"Generated {len(tours)} tours with tags and reviews")
    
    print("Generating test user...")
    cursor.execute("""
        INSERT INTO users (name, email, password_hash, role)
        VALUES ('Test User', 'test@example.com', '$2a$10$X8ZzKQHJjKQHJjKQHJjKQOJjKQHJjKQHJjKQHJjKQHJjKQHJjKO', 'user')
        RETURNING id
    """)
    user_id = cursor.fetchone()[0]
    
    user_prefs = {'family': 0.7, 'beach': 0.8, 'food': 0.6, 'relax': 0.5}
    for tag, weight in user_prefs.items():
        cursor.execute("""
            INSERT INTO user_preferences (user_id, tag, weight)
            VALUES (%s, %s, %s)
        """, (user_id, tag, weight))
    
    conn.commit()
    print(f"Generated test user (id={user_id})")
    
    cursor.close()
    conn.close()
    
    print("\nSample data generated successfully!")
    print("Test credentials: test@example.com (any password)")


if __name__ == "__main__":
    main()
