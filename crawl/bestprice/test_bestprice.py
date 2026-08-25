from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
import json
import re

URL = "https://www.bestprice.vn/tour/kham-pha-thien-duong-song-ao-phan-thiet-jeep-tour-2n1d-1822.html"


# ============================================================
# Utils
# ============================================================

def clean_text(text):

    if not text:
        return ""

    text = re.sub(r"\s+", " ", text)

    return text.strip()


def parse_price(price):

    if not price:
        return None

    number = re.sub(r"[^\d]", "", price)

    if number == "":
        return None

    return int(number)


def unique(items):

    seen = set()

    result = []

    for item in items:

        if item not in seen:

            seen.add(item)

            result.append(item)

    return result


# ============================================================
# Crawl HTML
# ============================================================

with sync_playwright() as p:

    browser = p.chromium.launch(

        headless=False,

        slow_mo=100

    )

    page = browser.new_page(

        viewport={"width": 1600, "height": 1000}

    )

    print("Opening website...")

    page.goto(

        URL,

        wait_until="networkidle"

    )

    page.wait_for_timeout(5000)

    html = page.content()

    soup = BeautifulSoup(html, "lxml")

    print("Website loaded.")


# ============================================================
# TITLE
# ============================================================

    title = ""

    node = soup.select_one("h1.mktnd_txt_productname")

    if node:

        title = clean_text(node.text)

    print("Title:", title)


# ============================================================
# PRICE
# ============================================================

    price = None

    node = soup.select_one("span.mktnd_txt_sale_price")

    if node:

        price = parse_price(node.text)

    print("Price:", price)


# ============================================================
# RATING
# ============================================================

    rating = None

    node = soup.select_one("span.mktnd_txt_score_review")

    if node:

        try:

            rating = float(node.text.strip())

        except:

            pass

    print("Rating:", rating)


# ============================================================
# DESCRIPTION
# ============================================================

    description = ""

    meta = soup.find(

        "meta",

        attrs={

            "name": "description"

        }

    )

    if meta:

        description = clean_text(

            meta.get("content", "")

        )


# ============================================================
# MAIN IMAGES
# ============================================================

    images = []

    for img in soup.select(

        ".product-gallery img,"

        ".gallery img,"

        ".swiper-slide img,"

        ".tour-gallery img,"

        ".itinerary-photos img"

    ):

        src = (

            img.get("data-src")

            or img.get("src")

        )

        if not src:
            continue

        if src.startswith("//"):

            src = "https:" + src

        if "logo" in src.lower():

            continue

        if "icon" in src.lower():

            continue

        images.append(src)

    images = unique(images)

    print("Images:", len(images))


# ============================================================
# HIGHLIGHTS
# ============================================================

    highlights = []

    for li in soup.select(

        ".highlight-item"

    ):

        txt = clean_text(

            li.get_text()

        )

        if txt:

            highlights.append(txt)

    print("Highlights:", len(highlights))


# ============================================================
# DESTINATIONS + THEMES
# ============================================================

    destinations = []

    themes = []

    info = soup.select(

        ".highlight li"

    )

    if len(info) >= 1:

        text = clean_text(

            info[0].get_text()

        )

        text = text.replace(

            "Điểm tham quan:",

            ""

        )

        destinations = [

            x.strip()

            for x in text.split(",")

            if x.strip()

        ]

    if len(info) >= 2:

        text = clean_text(

            info[1].get_text()

        )

        text = text.replace(

            "Chủ đề:",

            ""

        )

        themes = [

            x.strip()

            for x in text.split(",")

            if x.strip()

        ]

    print("Destinations:", len(destinations))

    print("Themes:", len(themes))
    # ============================================================
# ITINERARY
# ============================================================

    itinerary = []

    day_blocks = soup.select(".itinerary-box")

    print("Itinerary days:", len(day_blocks))

    for day in day_blocks:

        # -------------------------
        # Tiêu đề ngày
        # -------------------------

        day_title = ""

        node = day.select_one(".iti-day-title")

        if node:
            day_title = clean_text(node.get_text())

        # -------------------------
        # Nội dung
        # -------------------------

        content = ""

        node = day.select_one(".itinerary-content")

        if node:

            # clone để xóa ảnh + caption
            clone = BeautifulSoup(
                str(node),
                "lxml"
            )

            # bỏ gallery
            for tag in clone.select(".itinerary-photos"):
                tag.decompose()

            # bỏ icon
            for tag in clone.select("span.ico-chevron-down"):
                tag.decompose()

            content = clean_text(
                clone.get_text("\n")
            )

        # -------------------------
        # Bữa ăn
        # -------------------------

        meals = ""

        node = day.select_one(".margin-bottom-5 b")

        if node:
            meals = clean_text(node.get_text())

        # -------------------------
        # Ảnh trong ngày
        # -------------------------

        photos = []

        for img in day.select(".itinerary-photos img"):

            src = img.get("src") or img.get("data-src")

            if not src:
                continue

            if src.startswith("//"):
                src = "https:" + src

            photos.append(src)

        photos = unique(photos)

        itinerary.append({

            "title": day_title,

            "content": content,

            "meals": meals,

            "photos": photos

        })


# ============================================================
# ACTIVITIES
# ============================================================

    keywords = [

        "Jeep",

        "check in",

        "check-in",

        "trượt cát",

        "tắm biển",

        "tham quan",

        "khám phá",

        "chèo",

        "đi bộ",

        "leo",

        "cắm trại",

        "ngắm",

        "ăn",

        "uống",

        "chụp ảnh",

        "vui chơi"

    ]

    activities = []

    for day in itinerary:

        text = day["content"].lower()

        for keyword in keywords:

            if keyword.lower() in text:

                activities.append(keyword)

    activities = unique(activities)

    print("Activities:", len(activities))


# ============================================================
# REVIEW
# ============================================================

    reviews = []

    review_blocks = soup.select("div.item-rv")

    print("Reviews:", len(review_blocks))

    for review in review_blocks:

        author = ""

        date = ""

        score = None

        content = ""

        review_images = []

        # ---------------------
        # Rating
        # ---------------------

        node = review.select_one(".rv-name")

        if node:

            try:

                score = float(

                    clean_text(node.get_text())

                )

            except:

                pass

        # ---------------------
        # Tên
        # ---------------------

        node = review.select_one(

            ".cus-rv-name span:last-child"

        )

        if node:

            author = clean_text(

                node.get_text()

            )

        # ---------------------
        # Ngày
        # ---------------------

        node = review.select_one(

            ".cus-rv-date"

        )

        if node:

            date = clean_text(

                node.get_text()

            )

        # ---------------------
        # Nội dung review
        # ---------------------

        node = review.select_one(

            ".cus-rv-content span[id$='_short']"

        )

        if node:

            content = clean_text(

                node.get_text(" ")

            )

        # ---------------------
        # Ảnh review
        # ---------------------

        for img in review.select(

            ".cus-rv-content img"

        ):

            src = img.get("src")

            if not src:
                continue

            if src.startswith("//"):

                src = "https:" + src

            review_images.append(src)

        review_images = unique(review_images)

        reviews.append({

            "author": author,

            "date": date,

            "rating": score,

            "content": content,

            "images": review_images

        })
# ============================================================
# REMOVE DUPLICATE IMAGES
# ============================================================

    # Bỏ ảnh itinerary khỏi gallery chính
    itinerary_images = []

    for day in itinerary:
        itinerary_images.extend(day["photos"])

    itinerary_images = set(itinerary_images)

    gallery_images = []

    for img in images:

        if img not in itinerary_images:

            gallery_images.append(img)

    gallery_images = unique(gallery_images)


# ============================================================
# RESULT
# ============================================================

    result = {

        "title": title,

        "price": price,

        "rating": rating,

        "description": description,

        "highlights": highlights,

        "destinations": destinations,

        "themes": themes,

        "activities": activities,

        "images": gallery_images,

        "reviews": reviews,

        "itinerary": itinerary

    }


# ============================================================
# SAVE JSON
# ============================================================

    with open(

        "tour.json",

        "w",

        encoding="utf8"

    ) as f:

        json.dump(

            result,

            f,

            ensure_ascii=False,

            indent=4

        )


# ============================================================
# SUMMARY
# ============================================================

    print()

    print("=" * 60)

    print("CRAWL COMPLETED")

    print("=" * 60)

    print("Title        :", title)

    print("Price        :", price)

    print("Rating       :", rating)

    print("Highlights   :", len(highlights))

    print("Destinations :", len(destinations))

    print("Themes       :", len(themes))

    print("Activities   :", len(activities))

    print("Gallery      :", len(gallery_images))

    print("Reviews      :", len(reviews))

    print("Itinerary    :", len(itinerary))

    print("=" * 60)

    print("Saved to tour.json")

    browser.close()