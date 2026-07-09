from typing import List, Dict, Any
import re


def is_vietnamese_text(text: str) -> bool:
    """Kiểm tra xem text có phải tiếng Việt không (dựa trên tỷ lệ ký tự tiếng Việt)"""
    if not text or len(text) < 5:
        return False
    
    # Vietnamese diacritics pattern
    vietnamese_chars = len(re.findall(
        r'[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]',
        text.lower()
    ))
    
    total_chars = len([c for c in text if c.isalpha()])
    if total_chars == 0:
        return False
    
    return vietnamese_chars / total_chars > 0.3


def filter_vietnamese_reviews(reviews: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Lọc chỉ giữ lại reviews tiếng Việt"""
    filtered = []
    
    for review in reviews:
        content = review.get('content', '')
        
        if is_vietnamese_text(content):
            review['language'] = 'vi'
            filtered.append(review)
    
    return filtered


def filter_short_reviews(reviews: List[Dict[str, Any]], min_length: int = 10) -> List[Dict[str, Any]]:
    """Loại bỏ reviews quá ngắn (có thể là spam)"""
    return [
        r for r in reviews
        if len(r.get('content', '').strip()) >= min_length
    ]


def filter_spam_reviews(reviews: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Loại bỏ các review có dấu hiệu spam"""
    spam_patterns = [
        r'^\s*$',  # Empty or whitespace only
        r'^[a-zA-Z]+$',  # Only English letters (likely not Vietnamese)
        r'^(.{0,20})\1{3,}$',  # Repeated patterns
        r'http[s]?://',  # Contains URLs
        r'(?i)(contact|buy|sell|call me|phone|email)\s*:?',  # Suspicious keywords
    ]
    
    filtered = []
    
    for review in reviews:
        content = review.get('content', '')
        is_spam = False
        
        for pattern in spam_patterns:
            if re.search(pattern, content):
                is_spam = True
                break
        
        if not is_spam:
            filtered.append(review)
    
    return filtered
