import scrapy
import json
import re
from .base_spider import BaseTourSpider


class TravelokaSpider(BaseTourSpider):
    """Spider cho Traveloka.com"""
    
    name = "traveloka"
    allowed_domains = ["traveloka.com"]
    
    # Popular Vietnam destinations
    DESTINATIONS = [
        'ho-chi-minh-city',
        'hanoi',
        'danang',
        'nhatrang',
        'phuquoc',
        'dalat',
        'hoian',
        'hue',
        'cantho',
        'vungtau',
        'sapa',
        'quynhon',
        'phanthiet',
        'condao',
    ]
    
    @property
    def base_url(self) -> str:
        return "https://www.traveloka.com"
    
    @property
    def start_urls(self) -> list:
        return [
            f"{self.base_url}/vi-vn/activities/vietnam/{dest}"
            for dest in self.DESTINATIONS
        ]
    
    def parse(self, response):
        """Parse trang danh sách tour"""
        # Extract tour cards
        tour_cards = response.css('[data-testid="activity-card"]')
        
        for card in tour_cards:
            link = card.css('a::attr(href)').get()
            if link:
                yield response.follow(link, self.parse_tour)
        
        # Follow pagination
        next_page = response.css('[data-testid="next-page"]::attr(href)').get()
        if next_page:
            yield response.follow(next_page, self.parse)
    
    def parse_tour(self, response):
        """Parse chi tiết tour"""
        name = (
            response.css('h1::text').get() or
            response.css('[data-testid="product-title"]::text').get() or
            response.css('title::text').get() or
            ""
        ).strip()
        
        price_text = (
            response.css('[data-testid="price"]::text').get() or
            response.css('.price::text').get() or
            ""
        )
        price = self.normalize_price(price_text)
        
        rating_text = (
            response.css('[data-testid="rating"]::text').get() or
            response.css('.rating::text').get() or
            "0"
        )
        rating = float(re.sub(r'[^\d.]', '', rating_text)) or 0
        
        review_count_text = (
            response.css('[data-testid="review-count"]::text').get() or
            "0"
        )
        review_count = int(re.sub(r'[^\d]', '', review_count_text)) or 0
        
        duration_text = (
            response.css('[data-testid="duration"]::text').get() or
            response.css('.duration::text').get() or
            ""
        )
        duration = self.extract_duration(duration_text)
        
        description = ' '.join(
            response.css('.description p::text').getall() or
            response.css('[data-testid="description"] p::text').getall()
        )
        
        destination = self.extract_destination(response.url)
        
        image_url = (
            response.css('[data-testid="product-image"]::attr(src)').get() or
            response.css('meta[property="og:image"]::attr(content)').get()
        )
        
        yield {
            'name': name,
            'destination': destination,
            'price': price,
            'duration': duration,
            'description': description,
            'avg_rating': rating,
            'review_count': review_count,
            'source': 'traveloka',
            'source_url': response.url,
            'image_url': image_url,
        }
    
    def extract_destination(self, url: str) -> str:
        """Trích xuất địa điểm từ URL"""
        for dest in self.DESTINATIONS:
            if dest in url.lower():
                return self.normalize_destination(dest.replace('-', ' '))
        return 'Vietnam'
