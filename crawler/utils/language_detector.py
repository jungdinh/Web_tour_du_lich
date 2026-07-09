import re
from typing import Optional


# Simple language detection based on character patterns
def detect_language(text: str) -> str:
    """
    Phát hiện ngôn ngữ của text đơn giản
    
    Returns: 'vi' (Vietnamese), 'en' (English), 'mixed', hoặc 'unknown'
    """
    if not text or len(text.strip()) < 5:
        return 'unknown'
    
    text_lower = text.lower()
    
    # Count Vietnamese-specific characters
    vietnamese_chars = len(re.findall(
        r'[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]',
        text_lower
    ))
    
    # Count common English words
    english_words = len(re.findall(
        r'\b(the|a|an|is|are|was|were|have|has|been|be|to|of|and|in|that|it|for|on|with|this|but|they|we|you|I)\b',
        text_lower
    ))
    
    total_alpha = len([c for c in text if c.isalpha()])
    
    if total_alpha == 0:
        return 'unknown'
    
    vi_ratio = vietnamese_chars / total_alpha
    en_ratio = english_words / (len(text.split()) + 1)
    
    if vi_ratio > 0.2:
        return 'vi'
    elif en_ratio > 0.15 and vietnamese_chars < 3:
        return 'en'
    elif vi_ratio > 0.05 and vi_ratio <= 0.2:
        return 'mixed'
    else:
        return 'unknown'
