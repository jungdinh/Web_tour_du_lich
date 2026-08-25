import scrapy
import json
import re
from .base_spider import BaseTourSpider


class KlookSpider(BaseTourSpider):
    """Spider cho Klook.com"""
    
    name = "klook"
    allowed_domains = ["klook.com"]
    
    # Popular Vietnam destinations
    DESTINATIONS = [
        'ho-chi-minh',
        'ha-noi',
        'da-nang',
        'nha-trang',
        'phu-quoc',
        'da-lat',
        'hoi-an',
        'hue',
        'can-tho',
        'vung-tau',
        'sapa',
        'quy-nhon',
        'phan-thiet',
        'con-dao',
        'phanrang',
    ]
    
    @property
    def base_url(self) -> str:
        return "https://www.klook.com"
    
    @property
    def start_urls(self) -> list:
        return [
            f"{self.base_url}/vi/activities/?keyword={dest}"
            for dest in self.DESTINATIONS
        ]
    
    def parse(self, response):
        """Parse trang danh sách tour"""
        # Extract tour links
        tour_links = response.css('a.activity-card::attr(href)').getall()
        
        for link in tour_links:
            if link:
                yield response.follow(link, self.parse_tour)
        
        # Follow pagination
        next_page = response.css('a.next::attr(href)').get()
        if next_page:
            yield response.follow(next_page, self.parse)
    
    def parse_tour(self, response):
        """Parse chi tiết tour"""
        # Try to extract JSON-LD data first
        json_ld = response.css('script[type="application/ld+json"]::text').get()
        if json_ld:
            try:
                data = json.loads(json_ld)
                yield from self.parse_json_ld(data, response)
                return
            except json.JSONDecodeError:
                pass
        
        # Fallback to HTML parsing
        name = response.css('h1::text').get() or response.css('title::text').get()
        name = name.strip() if name else ""
        
        price_text = response.css('.price::text').get() or response.css('[data-selector="price"]::text').get() or ""
        price = self.normalize_price(price_text)
        
        rating_text = response.css('.rating-score::text').get() or "0"
        rating = float(re.sub(r'[^\d.]', '', rating_text)) or 0
        
        review_count_text = response.css('.review-count::text').get() or "0"
        review_count = int(re.sub(r'[^\d]', '', review_count_text)) or 0
        
        duration_text = response.css('.duration::text').get() or ""
        duration = self.extract_duration(duration_text)
        
        description = ' '.join(response.css('.description p::text').getall()) or ""
        
        destination = self.extract_destination(response.url)
        
        yield {
            'name': name,
            'destination': destination,
            'price': price,
            'duration': duration,
            'description': description,
            'avg_rating': rating,
            'review_count': review_count,
            'source': 'klook',
            'source_url': response.url,
            'image_url': response.css('meta[property="og:image"]::attr(content)').get(),
        }
    
    def parse_json_ld(self, data, response):
        """Parse JSON-LD structured data"""
        if isinstance(data, dict):
            if data.get('@type') == 'Product':
                yield {
                    'name': data.get('name', ''),
                    'description': data.get('description', ''),
                    'destination': self.extract_destination(response.url),
                    'price': self.normalize_price(
                        str(data.get('offers', {}).get('price', 0))
                    ),
                    'avg_rating': float(data.get('aggregateRating', {}).get('ratingValue', 0)),
                    'review_count': int(data.get('aggregateRating', {}).get('reviewCount', 0)),
                    'source': 'klook',
                    'source_url': response.url,
                }
            elif data.get('@type') == 'ItemList':
                for item in data.get('itemListElement', []):
                    if isinstance(item, dict):
                        url = item.get('url', '')
                        if url:
                            yield response.follow(url, self.parse_tour)
    
    def extract_destination(self, url: str) -> str:
        """Trích xuất địa điểm từ URL"""
        for dest in self.DESTINATIONS:
            if dest in url.lower():
                return self.normalize_destination(dest.replace('-', ' '))
        return 'Vietnam'
