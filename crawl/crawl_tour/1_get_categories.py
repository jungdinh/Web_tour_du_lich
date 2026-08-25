from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
import json

URL = "https://www.bestprice.vn/tour"

with sync_playwright() as p:

    browser = p.chromium.launch(headless=False)

    page = browser.new_page()

    page.goto(URL, wait_until="networkidle")

    page.wait_for_timeout(3000)

    html = page.content()

    browser.close()

soup = BeautifulSoup(html, "lxml")

categories = {}

for a in soup.select("a[href^='/tour/']"):

    href = a.get("href", "")

    if href.endswith(".html"):
        continue

    href = "https://www.bestprice.vn" + href

    title = a.get_text(" ", strip=True)

    if len(title) < 2:
        continue

    categories[href] = {
        "name": title,
        "url": href
    }

categories = list(categories.values())

print(f"Found {len(categories)} categories")

for c in categories:
    print(c)

with open(
    "categories.json",
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        categories,
        f,
        ensure_ascii=False,
        indent=4
    )

print("Saved categories.json")