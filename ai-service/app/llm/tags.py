"""
Tag taxonomy - Tập các tag được dùng để phân loại tour.
Mỗi tag có một mô tả ngắn (TAG_DESCRIPTIONS) để dùng cho LLM prompt
và cho cold-start fallback dựa trên description.

Version: 2.0 (21 tags - mở rộng từ 15 tags ban đầu)
Cập nhật: 2026-08-08 - Thêm history, festival, wildlife, cruise, nightlife, water_sports
"""

TAG_TAXONOMY = [
    # Đối tượng
    "family",          # Gia đình có trẻ nhỏ
    "romantic",        # Cặp đôi, honeymoon

    # Phong cách
    "adventure",       # Mạo hiểm, khám phá chung
    "relax",           # Nghỉ dưỡng, spa
    "spiritual",       # Tâm linh, hành hương

    # Cảnh quan
    "beach",           # Biển, đảo
    "mountain",        # Núi, cao nguyên
    "nature",          # Thiên nhiên, rừng, công viên
    "city",            # Thành phố, đô thị

    # Trải nghiệm
    "culture",         # Văn hóa, di sản chung
    "history",         # Lịch sử, di tích chiến tranh, triều đại
    "festival",        # Lễ hội đặc sắc
    "photography",     # Check-in, view đẹp
    "wildlife",        # Động vật hoang dã, safari, vườn thú
    "cruise",          # Du thuyền
    "nightlife",       # Bar, club, phố đêm
    "water_sports",    # Lặn biển, kayak, surfing

    # Ăn uống / Mua sắm
    "food",            # Ẩm thực, đặc sản
    "shopping",        # Mua sắm, chợ

    # Giá cả
    "budget",          # Giá rẻ, tiết kiệm
    "luxury",          # Sang trọng, 5 sao
]


TAG_DESCRIPTIONS = {
    "family": "Tour phù hợp cho cả gia đình, có trẻ em, người lớn tuổi, hoạt động nhẹ nhàng.",
    "romantic": "Tour lãng mạn dành cho cặp đôi, kỷ niệm tình yêu, honeymoon.",
    "adventure": "Tour mạo hiểm, khám phá, hoạt động thể thao mạo hiểm như leo núi, trekking, zipline.",
    "relax": "Tour nghỉ dưỡng, spa, resort, thư giãn, yên tĩnh.",
    "spiritual": "Tour tâm linh, hành hương, chùa đền, thiền, lễ Phật.",
    "beach": "Tour biển đảo, tắm biển, lặn san hô, nghỉ dưỡng ven biển.",
    "mountain": "Tour núi, cao nguyên, leo núi, trekking, săn mây.",
    "nature": "Tour thiên nhiên, rừng, công viên quốc gia, cảnh quan xanh, ruộng bậc thang.",
    "city": "Tour thành phố, đô thị, phố đi bộ, kiến trúc hiện đại, tham quan thủ đô.",
    "culture": "Tour văn hóa chung, làng nghề, phong tục, nghệ thuật truyền thống.",
    "history": "Tour lịch sử, di tích chiến tranh, bảo tàng, triều đại, thành cổ.",
    "festival": "Tour lễ hội đặc sắc như Festival Huế, Lim, Bài Chòi, đua ghe, đua bò.",
    "photography": "Tour có view đẹp, check-in nổi tiếng, săn ảnh, cảnh quan ấn tượng.",
    "wildlife": "Tour động vật hoang dã, safari, vườn thú, ngắn thú rừng, chim quý hiếm.",
    "cruise": "Tour du thuyền qua vịnh, nghỉ đêm trên tàu, ngắm cảnh trên sông nước.",
    "nightlife": "Tour phố đêm, quán bar, club, beer club, chợ đêm, ăn uống về đêm.",
    "water_sports": "Tour lặn biển, snorkeling, kayak, surfing, dù lượn, jet ski, paddleboard.",
    "food": "Tour ẩm thực, khám phá đặc sản, chợ đêm, lớp nấu ăn, street food.",
    "shopping": "Tour mua sắm, chợ, trung tâm thương mại, quà lưu niệm.",
    "budget": "Tour giá rẻ, tiết kiệm, hostel, phượt, backpacking.",
    "luxury": "Tour cao cấp, resort 5 sao, dịch vụ VIP, hạng sang.",
}