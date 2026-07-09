from typing import Dict, Any
import re


# Mapping các alias của địa điểm
DESTINATION_ALIASES = {
    # TP.HCM variants
    'tp.hcm': 'Hồ Chí Minh',
    'tp hcm': 'Hồ Chí Minh',
    'ho chi minh': 'Hồ Chí Minh',
    'hochiminh': 'Hồ Chí Minh',
    'hcm': 'Hồ Chí Minh',
    'sài gòn': 'Hồ Chí Minh',
    'sai gon': 'Hồ Chí Minh',
    'saigon': 'Hồ Chí Minh',
    
    # Hà Nội variants
    'ha noi': 'Hà Nội',
    'hanoi': 'Hà Nội',
    
    # Đà Nẵng variants
    'da nang': 'Đà Nẵng',
    'danang': 'Đà Nẵng',
    
    # Nha Trang variants
    'nha trang': 'Nha Trang',
    'nhatrang': 'Nha Trang',
    
    # Phú Quốc variants
    'phu quoc': 'Phú Quốc',
    'phuquoc': 'Phú Quốc',
    
    # Đà Lạt variants
    'da lat': 'Đà Lạt',
    'dalat': 'Đà Lạt',
    
    # Hội An variants
    'hoi an': 'Hội An',
    'hoian': 'Hội An',
    
    # Huế variants
    'hue': 'Huế',
    'huế': 'Huế',
    
    # Cần Thơ variants
    'can tho': 'Cần Thơ',
    'cantho': 'Cần Thơ',
    
    # Vũng Tàu variants
    'vung tau': 'Vũng Tàu',
    'vungtau': 'Vũng Tàu',
    
    # Sa Pa variants
    'sa pa': 'Sa Pa',
    'sapa': 'Sa Pa',
    'sě pa': 'Sa Pa',
    
    # Quy Nhơn variants
    'quy nhon': 'Quy Nhơn',
    'quynhon': 'Quy Nhơn',
    
    # Phan Thiết variants
    'phan thiet': 'Phan Thiết',
    'phanthiet': 'Phan Thiết',
    
    # Côn Đảo variants
    'con dao': 'Côn Đảo',
    'condao': 'Côn Đảo',
    
    # Phan Rang variants
    'phan rang': 'Phan Rang',
    'phanrang': 'Phan Rang',
}


def normalize_destination(destination: str) -> str:
    """Chuẩn hóa tên địa điểm"""
    if not destination:
        return ''
    
    # Lowercase và loại bỏ extra spaces
    dest = ' '.join(destination.lower().split())
    
    # Tìm trong aliases
    for alias, canonical in DESTINATION_ALIASES.items():
        if alias in dest:
            return canonical
    
    # Nếu không tìm thấy, capitalize first letter of each word
    return dest.title()


def normalize_price(price: Any) -> int:
    """Chuẩn hóa giá về số nguyên VND"""
    if isinstance(price, int):
        return price
    
    if isinstance(price, str):
        # Remove all non-digit characters
        digits = re.sub(r'[^\d]', '', price)
        return int(digits) if digits else 0
    
    return 0


def normalize_duration(duration: Any) -> int:
    """Chuẩn hóa duration về số ngày"""
    if isinstance(duration, int):
        return max(1, duration)
    
    if isinstance(duration, str):
        # Try to extract number of days
        match = re.search(r'(\d+)\s*ngày', duration, re.IGNORECASE)
        if match:
            return int(match.group(1))
        
        match = re.search(r'(\d+)D', duration, re.IGNORECASE)
        if match:
            return int(match.group(1))
        
        # Check for hours
        match = re.search(r'(\d+)\s*giờ', duration, re.IGNORECASE)
        if match:
            hours = int(match.group(1))
            return max(1, hours // 24)  # Convert hours to days (min 1)
    
    return 1


def normalize_rating(rating: Any) -> float:
    """Chuẩn hóa rating về float trong khoảng 0-5"""
    if isinstance(rating, (int, float)):
        return max(0, min(5, float(rating)))
    
    if isinstance(rating, str):
        # Extract number
        match = re.search(r'[\d.]+', rating)
        if match:
            return max(0, min(5, float(match.group())))
    
    return 0.0
