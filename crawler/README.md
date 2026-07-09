# Crawler - Python Scrapy

## Cấu trúc thư mục

```
crawler/
├── spiders/
│   ├── __init__.py
│   ├── base_spider.py      # Base spider class
│   ├── klook_spider.py     # Klook crawler
│   └── traveloka_spider.py # Traveloka crawler
├── preprocessing/
│   ├── __init__.py
│   ├── dedup.py            # Deduplication
│   ├── normalize.py        # Chuẩn hóa giá, địa điểm
│   └── filter.py           # Lọc review rác
├── utils/
│   ├── __init__.py
│   ├── language_detector.py # Phát hiện ngôn ngữ
│   └── proxy_rotator.py    # Proxy rotation
├── items.py                # Scrapy items
├── pipelines.py            # Scrapy pipelines
└── requirements.txt
```

## Chạy crawler

```bash
pip install -r requirements.txt

# Crawl Klook
scrapy crawl klook -o output/klook_tours.json

# Crawl Traveloka
scrapy crawl traveloka -o output/traveloka_tours.json
```

## Lưu ý

- Crawler chạy dạng batch job, không real-time
- Sử dụng proxy rotation để tránh ban
- Request delay giữa các requests
