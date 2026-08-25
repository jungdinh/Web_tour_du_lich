"""
Script để chạy crawler và lưu dữ liệu vào database
Chạy: python scripts/run_crawler.py --source klook --limit 100
"""
import argparse
import json
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

try:
    import psycopg2
except ImportError:
    print("psycopg2 not installed")
    sys.exit(1)


def save_to_database(tours: list, reviews: list):
    """Lưu dữ liệu đã crawl vào database"""
    db_url = os.getenv('DATABASE_URL', 'postgresql://postgres:password@localhost:5432/tour_recommendation')
    
    try:
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()
    except Exception as e:
        print(f"Cannot connect to database: {e}")
        return False
    
    saved_tours = 0
    saved_reviews = 0
    
    for tour in tours:
        try:
            cursor.execute("""
                INSERT INTO tours (
                    name, destination, price, duration, description,
                    avg_rating, review_count, source, source_url, season, image_url
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                RETURNING id
            """, (
                tour.get('name'),
                tour.get('destination'),
                tour.get('price', 0),
                tour.get('duration', 1),
                tour.get('description'),
                tour.get('avg_rating', 0),
                tour.get('review_count', 0),
                tour.get('source'),
                tour.get('source_url'),
                tour.get('season', 'all'),
                tour.get('image_url')
            ))
            
            result = cursor.fetchone()
            if result:
                saved_tours += 1
                tour_id = result[0]
                
                # Save reviews
                tour_reviews = [r for r in reviews if r.get('tour_id') == tour.get('source_url')]
                for review in tour_reviews:
                    cursor.execute("""
                        INSERT INTO reviews (tour_id, content, language, rating, reviewer_name)
                        VALUES (%s, %s, %s, %s, %s)
                    """, (
                        tour_id,
                        review.get('content'),
                        review.get('language', 'vi'),
                        review.get('rating'),
                        review.get('reviewer_name')
                    ))
                    saved_reviews += 1
                    
        except Exception as e:
            print(f"Error saving tour {tour.get('name')}: {e}")
            continue
    
    conn.commit()
    cursor.close()
    conn.close()
    
    return saved_tours, saved_reviews


def main():
    parser = argparse.ArgumentParser(description='Run crawler and save to database')
    parser.add_argument('--source', choices=['klook', 'traveloka', 'all'], default='all',
                        help='Crawl from which source')
    parser.add_argument('--limit', type=int, default=100,
                        help='Maximum number of tours to crawl')
    parser.add_argument('--output', default=None,
                        help='Output file path (default: output/{source}_tours.json)')
    
    args = parser.parse_args()
    
    print("=" * 50)
    print("  Tour Crawler")
    print("=" * 50)
    print()
    
    print("Note: Real crawling requires running Scrapy spiders")
    print()
    print("To crawl data, use these commands:")
    print()
    print("  # Crawl Klook")
    print("  cd crawler")
    print("  scrapy crawl klook -o output/klook_tours.json")
    print()
    print("  # Crawl Traveloka")
    print("  scrapy crawl traveloka -o output/traveloka_tours.json")
    print()
    print("  # Then import to database")
    print("  python scripts/import_data.py --file output/klook_tours.json")
    print()
    print("Currently, you can use sample data instead:")
    print("  python scripts/generate_sample_data.py")
    print()
    
    # For demo, generate sample data
    print("Generating sample data for testing...")
    os.system(f'python "{os.path.join(os.path.dirname(__file__), "generate_sample_data.py")}"')


if __name__ == "__main__":
    main()
