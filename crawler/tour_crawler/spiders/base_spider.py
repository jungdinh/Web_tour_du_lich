import scrapy
from abc import ABC, abstractmethod
from typing import Iterator, Dict, Any
from bs4 import BeautifulSoup
import re


class BaseTourSpider(scrapy.Spider, ABC):
    """Base spider cho các trang web OTA"""
    
    name = "base_spider"
    allowed_domains = []
    
    # Abstract properties
    @property
    @abstractmethod
    def base_url(self) -> str:
        """URL cơ sở của trang web"""
        pass
    
    @property
    @abstractmethod
    def start_urls(self) -> list:
        """Các URL bắt đầu crawl"""
        pass
    
    def parse(self, response):
        """Override trong subclass"""
        raise NotImplementedError
    
    def parse_tour(self, response) -> Dict[str, Any]:
        """Parse chi tiết một tour"""
        raise NotImplementedError
    
    def parse_review(self, review_element) -> Dict[str, str]:
        """Parse một review"""
        raise NotImplementedError
    
    def normalize_price(self, price_text: str) -> int:
        """Chuẩn hóa giá về số VND"""
        # Remove all non-digit characters
        digits = re.sub(r'[^\d]', '', price_text)
        return int(digits) if digits else 0
    
    def normalize_destination(self, destination: str) -> str:
        """Chuẩn hóa tên địa điểm"""
        # Remove extra spaces
        dest = ' '.join(destination.split())
        
        # Normalize common aliases
        aliases = {
            'TP.HCM': 'Hồ Chí Minh',
            'TP.HCM': 'Sài Gòn',
            'HCM': 'Hồ Chí Minh',
            'Da Nang': 'Đà Nẵng',
            'Nha Trang': 'Nha Trang',
            'Phu Quoc': 'Phú Quốc',
            'Phu Quoc': 'Phú Quốc',
        }
        
        for alias, canonical in aliases.items():
            if alias.lower() in dest.lower():
                return canonical
        
        return dest
    
    def extract_duration(self, duration_text: str) -> int:
        """Trích xuất số ngày từ text"""
        match = re.search(r'(\d+)\s*ngày', duration_text, re.IGNORECASE)
        if match:
            return int(match.group(1))
        
        match = re.search(r'(\d+)D', duration_text, re.IGNORECASE)
        if match:
            return int(match.group(1))
        
        return 1  # Default 1 day
    
    def is_vietnamese_text(self, text: str) -> bool:
        """Kiểm tra xem text có phải tiếng Việt không"""
        # Count Vietnamese characters (including diacritics)
        vietnamese_chars = len(re.findall(r'[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]', text.lower()))
        
        # If more than 30% of characters are Vietnamese, consider it Vietnamese text
        total_chars = len([c for c in text if c.isalpha()])
        if total_chars == 0:
            return False
        
        return vietnamese_chars / total_chars > 0.3
