# Hướng dẫn crawl dữ liệu BestPrice

## Mục tiêu

Xây dựng crawler lấy toàn bộ tour từ BestPrice và lưu JSON phục vụ
website/AI.

## Quy trình

1.  Crawl danh mục (category)

-   Thu thập URL các category tour.
-   Ví dụ:
    -   https://www.bestprice.vn/tour/hokkaido
    -   https://www.bestprice.vn/tour/ha-long

2.  Crawl danh sách tour

-   Dùng Playwright.
-   Scroll tới cuối trang.
-   Thu tất cả liên kết:

``` js
Array.from(document.querySelectorAll("a[href$='.html']")).map(a=>a.href)
```

-   Chỉ giữ URL chứa `/tour/` và kết thúc `.html`.
-   Loại bỏ trùng.

3.  Crawl chi tiết từng tour Dùng Playwright + BeautifulSoup.

### Thông tin lấy

-   title (`h1.mktnd_txt_productname`)
-   price (`span.mktnd_txt_sale_price`)
-   rating (`span.mktnd_txt_score_review`)
-   description (`meta[name=description]`)
-   highlights (`.list-highlight li`)
-   places / topics (`.trip-highlight-v2 ul.highlight li`)
-   gallery (`img`)
-   itinerary (`.itinerary-box`)
-   reviews (`.item-rv`)

### Review

Mỗi review gồm: - score - name - date - content - images

### Itinerary

Mỗi ngày gồm: - day - content\[\] - meal - images\[\]

## Kỹ thuật

### Playwright

-   headless=False khi debug.
-   wait_until="networkidle".
-   auto scroll.
-   click toàn bộ nút "Xem thêm".

### BeautifulSoup

Parse HTML sau khi Playwright render.

## Cấu trúc JSON

``` json
{
  "url": "",
  "category": "",
  "title": "",
  "price": "11.390.000đ",
  "original_price": "12.390.000đ",
  "rating": "9.2",
  "review_count": 12,
  "description": "",
  "duration": {
    "days": 4,
    "nights": 3,
    "label": "3N4Đ"
  },
  "departure": ["Hồ Chí Minh"],
  "transport": {
    "airline": "Vietnam Airlines",
    "vehicle": ["Máy bay", "Ô tô"]
  },
  "schedule": [
    { "date": "2026-08-01", "price": "12.990.000đ", "available": true }
  ],
  "highlights": [],
  "places": [],
  "topics": [],
  "activities": [],
  "gallery": [],
  "itinerary": [],
  "included": [],
  "excluded": [],
  "reviews": []
}
```

## Dữ liệu nên bổ sung

- ✅ duration (số ngày/đêm, parse từ text "X ngày Y đêm" hoặc title "9N8Đ")
- ✅ departure (điểm khởi hành, parse từ "Khởi hành từ: ...")
- ✅ transport (hãng bay + phương tiện, regex)
- ✅ original_price (giá gốc, parse từ "Giá từ X Yđ")
- ✅ schedule (lịch khởi hành từ bảng giá)
- ✅ included / excluded (Giá bao gồm / Giá không bao gồm)
- ❌ hotel (chưa crawl)
- ❌ cancellation_policy (chưa crawl)
- ❌ child_policy (chưa crawl)

## Kinh nghiệm

-   Không dùng requests vì nội dung render động.
-   Dùng Playwright để render rồi mới parse.
-   Scroll trước khi lấy HTML.
-   Expand itinerary/review trước khi parse.
-   Dùng `a[href$='.html']` hiệu quả hơn selector theo class.
-   Lưu mỗi tour thành một file JSON.

## Công nghệ

-   Python
-   Playwright
-   BeautifulSoup4
-   lxml
-   json
-   os
-   re

## Pipeline

Category → Tour URLs → Detail → Parse → JSON → Database/AI

## Mục tiêu AI

Từ dữ liệu đã crawl có thể: - Gợi ý tour theo ngân sách. - Gợi ý theo
địa điểm. - Gợi ý theo hoạt động. - Gợi ý theo lịch trình. - Tìm tour
chứa địa danh trong itinerary.
