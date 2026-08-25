from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
import json

# ==============================
# Đọc danh sách category
# ==============================

with open("categories.json", "r", encoding="utf-8") as f:
    categories = json.load(f)

all_tours = {}


# ==============================
# Auto Scroll
# ==============================

def auto_scroll(page):
    last_height = 0

    while True:
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(2000)

        new_height = page.evaluate("document.body.scrollHeight")

        if new_height == last_height:
            break

        last_height = new_height


# ==============================
# Crawl
# ==============================

with sync_playwright() as p:

    browser = p.chromium.launch(
        headless=False
    )

    page = browser.new_page(
        viewport={
            "width": 1400,
            "height": 900
        }
    )

    for index, cat in enumerate(categories):

        print("=" * 80)
        print(f"[{index+1}/{len(categories)}]")
        print(cat["name"])
        print(cat["url"])

        try:

            page.goto(
                cat["url"],
                wait_until="networkidle",
                timeout=120000
            )

            page.wait_for_timeout(3000)

            auto_scroll(page)

            html = page.content()

            soup = BeautifulSoup(html, "lxml")

            links = soup.select("a[href$='.html']")

            print("Found:", len(links), "html links")

            for a in links:

                href = a.get("href")

                if not href:
                    continue

                if href.startswith("/"):
                    href = "https://www.bestprice.vn" + href

                # Chỉ lấy tour
                if "/tour/" not in href:
                    continue

                # Bỏ blog
                if "/blog/" in href:
                    continue

                title = a.get_text(" ", strip=True)

                if href not in all_tours:

                    all_tours[href] = {
                        "title": title,
                        "url": href,
                        "category": cat["name"]
                    }

        except Exception as e:

            print("ERROR:", e)

    browser.close()

# ==============================
# Lưu file
# ==============================

tours = sorted(
    all_tours.values(),
    key=lambda x: x["url"]
)

print()
print("=" * 80)
print("TOTAL UNIQUE TOURS:", len(tours))
print("=" * 80)

with open(
    "tours.json",
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        tours,
        f,
        ensure_ascii=False,
        indent=4
    )

print("Saved tours.json")