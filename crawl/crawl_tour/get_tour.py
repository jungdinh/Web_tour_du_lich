from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
import json
import os
import re
import time
import traceback

# =====================================================
# CONFIG
# =====================================================

HEADLESS = False

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

INPUT_FILE = os.path.join(BASE_DIR, "tours.json")

OUTPUT_FOLDER = os.path.join(BASE_DIR, "details")

TIMEOUT = 120000

WAIT_TIME = 3000

SCROLL_WAIT = 1500

RETRY = 3

MAX_REVIEWS_PER_TOUR = 8


# =====================================================
# CREATE FOLDER
# =====================================================

if not os.path.exists(OUTPUT_FOLDER):
    os.makedirs(OUTPUT_FOLDER)


# =====================================================
# LOAD TOUR LIST
# =====================================================

with open(INPUT_FILE, "r", encoding="utf-8") as f:
    TOURS = json.load(f)

print("=" * 80)
print("TOTAL TOUR :", len(TOURS))
print("=" * 80)


# =====================================================
# HELPER
# =====================================================

def clean_text(text):

    if text is None:
        return ""

    text = text.replace("\xa0", " ")

    text = text.replace("\n", " ")

    text = re.sub(r"\s+", " ", text)

    return text.strip()


def absolute(url):

    if not url:
        return ""

    if url.startswith("//"):
        return "https:" + url

    if url.startswith("/"):
        return "https://www.bestprice.vn" + url

    return url


def unique(items):

    result = []

    seen = set()

    for item in items:

        if item in seen:
            continue

        seen.add(item)

        result.append(item)

    return result


def safe_text(node):

    if node is None:
        return ""

    return clean_text(node.get_text(" ", strip=True))


def save_json(filename, data):

    os.makedirs(OUTPUT_FOLDER, exist_ok=True)

    path = os.path.join(OUTPUT_FOLDER, filename)

    with open(path, "w", encoding="utf-8") as f:

        json.dump(
            data,
            f,
            ensure_ascii=False,
            indent=4
        )


# =====================================================
# AUTO SCROLL
# =====================================================

def auto_scroll(page):

    last_height = 0

    while True:

        page.evaluate(
            "window.scrollTo(0, document.body.scrollHeight)"
        )

        page.wait_for_timeout(SCROLL_WAIT)

        height = page.evaluate(
            "document.body.scrollHeight"
        )

        if height == last_height:
            break

        last_height = height


# =====================================================
# SWITCH TO REVIEW TAB
# =====================================================

def switch_to_review_tab(page):

    """Click tab 'Đánh giá' / 'Phản hồi của khách hàng' để tránh click nhầm 'Xem thêm' của tab Hỏi đáp."""

    labels = [

        "Đánh giá",

        "Phản hồi của khách hàng",

        "Reviews"

    ]

    for label in labels:

        try:

            tab = page.locator(

                f"a:has-text('{label}'), button:has-text('{label}'), li:has-text('{label}')"

            ).first

            if tab.count() > 0:

                tab.click(timeout=2000)

                page.wait_for_timeout(1500)

                return

        except:

            pass


# =====================================================
# CLICK ALL "XEM THÊM"
# =====================================================

def expand_all(page, max_reviews=MAX_REVIEWS_PER_TOUR):

    max_iterations = 20

    iteration = 0

    while iteration < max_iterations:

        iteration += 1

        current = page.locator(".cus-rv-content").count()

        if current >= max_reviews:

            break

        # Nếu không có .item-rv (đang ở tab Hỏi đáp/tab khác) thì KHÔNG click

        if page.locator(".item-rv").count() == 0:

            break

        clicked = False

        texts = [

            "Xem thêm",

            "Xem tất cả",

            "Hiển thị thêm",

            "Xem đánh giá",

            "Đọc thêm"

        ]

        for txt in texts:

            try:

                btn = page.locator(f"text={txt}")

                count = btn.count()

                if count == 0:
                    continue

                for i in range(count):

                    try:

                        btn.nth(i).click(timeout=1000)

                        page.wait_for_timeout(500)

                        clicked = True

                    except:
                        pass

            except:
                pass

        if not clicked:
            break


# =====================================================
# PARSE IMAGE
# =====================================================

def parse_images(node):

    images = []

    if node is None:
        return images

    for img in node.select("img"):

        src = (
            img.get("src")
            or img.get("data-src")
            or img.get("data-original")
        )

        src = absolute(src)

        if not src:
            continue

        lower = src.lower()

        if "logo" in lower:
            continue

        if "icon" in lower:
            continue

        if "avatar" in lower:
            continue

        if src not in images:
            images.append(src)

    return images


# =====================================================
# OPEN TOUR
# =====================================================

def open_page(page, url):

    page.goto(
        url,
        wait_until="networkidle",
        timeout=TIMEOUT
    )

    page.wait_for_timeout(WAIT_TIME)

    auto_scroll(page)

    switch_to_review_tab(page)

    expand_all(page)

    page.wait_for_timeout(1000)

    return BeautifulSoup(
        page.content(),
        "lxml"
    )
# =====================================================
# BASIC INFO
# =====================================================

def parse_title(soup):

    node = soup.select_one("h1.mktnd_txt_productname")

    return safe_text(node)


def parse_price(soup):

    node = soup.select_one("span.mktnd_txt_sale_price")

    return safe_text(node)


def parse_rating(soup):

    node = soup.select_one("span.mktnd_txt_score_review")

    return safe_text(node)


# =====================================================
# DURATION (số ngày / số đêm)
# =====================================================

def parse_duration(soup, title):
    """
    BestPrice có 2 dạng:
      1. Text '4 ngày 3 đêm' / '9 ngày 8 đêm'
      2. Trong title '9N8Đ', '4N3Đ'
    Trả về dict {"days": int, "nights": int, "label": "9N8Đ"}
    Ưu tiên parse từ text dạng 'X ngày Y đêm', fallback từ title.
    """

    text = soup.get_text(" ", strip=True)

    # 1) Match dạng "4 ngày 3 đêm"
    m = re.search(r"(\d+)\s*ngày\s*(\d+)\s*đêm", text, re.IGNORECASE)

    if m:
        days = int(m.group(1))
        nights = int(m.group(2))
        return {
            "days": days,
            "nights": nights,
            "label": f"{days}N{nights}Đ"
        }

    # 2) Match dạng "X ngày" (không có đêm)
    m = re.search(r"(\d+)\s*ngày", text, re.IGNORECASE)

    if m:
        days = int(m.group(1))
        nights = max(0, days - 1)
        return {
            "days": days,
            "nights": nights,
            "label": f"{days}N{nights}Đ"
        }

    # 3) Match trong title dạng "9N8Đ" — N = ngày, Đ = đêm
    if title:
        m = re.search(r"(\d+)\s*N\s*(\d+)\s*Đ", title, re.IGNORECASE)

        if m:
            days = int(m.group(1))
            nights = int(m.group(2))
            return {
                "days": days,
                "nights": nights,
                "label": f"{days}N{nights}Đ"
            }

    return {
        "days": 0,
        "nights": 0,
        "label": ""
    }


# =====================================================
# DEPARTURE (điểm khởi hành)
# =====================================================

def parse_departure(soup):
    """
    BestPrice hiển thị dạng:
      'Khởi hành từ: Hồ Chí Minh'
      'Khởi hành từ: Hà Nội'
    Trả về list các điểm khởi hành (lọc trùng).
    """

    departures = []

    # Các thành phố khởi hành phổ biến (ưu tiên match exact)
    KNOWN_CITIES = [
        "Hà Nội",
        "Hồ Chí Minh",
        "Đà Nẵng",
        "Hải Phòng",
        "Nha Trang",
        "Cần Thơ",
        "Đà Lạt",
        "Quy Nhơn",
        "Huế",
        "Vinh",
        "Buôn Ma Thuột",
        "Pleiku",
    ]

    # Các từ khóa để skip (thường theo sau tên thành phố)
    NOISE_AFTER = [
        "Vietnam Airlines",
        "VietJet",
        "Bamboo",
        "Ô tô",
        "Máy bay",
        "Tàu",
        "khứ hồi",
        "chiều về",
        "Tour",
        "Bay",
        "Hãng",
    ]

    text = soup.get_text("\n", strip=True)

    for line in text.split("\n"):
        line = clean_text(line)

        # Match dạng "Khởi hành từ: <city>"
        m = re.match(r"^Khởi\s*hành\s*từ\s*:\s*(.+)$", line, re.IGNORECASE)
        if not m:
            continue

        rest = clean_text(m.group(1))

        # Cắt bỏ các từ khóa nhiễu phía sau
        for noise in NOISE_AFTER:
            idx = rest.lower().find(noise.lower())
            if idx > 0:
                rest = rest[:idx]

        # Tách nhiều thành phố theo dấu phẩy, chấm phẩy, gạch chéo
        parts = re.split(r"[,;|/]", rest)

        for p in parts:
            p = clean_text(p)
            if not p:
                continue

            # Ưu tiên match với KNOWN_CITIES
            matched = None
            for city in KNOWN_CITIES:
                if city.lower() in p.lower():
                    matched = city
                    break

            # Nếu không match, lấy phần trước dấu cách đầu tiên (skip chữ số)
            if not matched:
                # Bỏ nếu chứa số (giá tiền, ngày tháng)
                if re.search(r"\d", p):
                    continue
                if len(p) < 3 or len(p) > 30:
                    continue
                matched = p

            if matched and matched not in departures:
                departures.append(matched)

    return departures


def normalize_city(city):
    """Chuẩn hóa tên thành phố."""

    city = clean_text(city)
    mapping = {
        "HCM": "Hồ Chí Minh",
        "HN": "Hà Nội",
        "Sài Gòn": "Hồ Chí Minh",
        "Saigon": "Hồ Chí Minh",
        "TP.HCM": "Hồ Chí Minh",
        "TPHCM": "Hồ Chí Minh"
    }
    return mapping.get(city, city)


# =====================================================
# TRANSPORT (phương tiện)
# =====================================================

def parse_transport(soup, title):
    """
    Trả về dict {"airline": "Vietnam Airlines", "vehicle": ["Ô tô", "Tàu hỏa"]}

    Chiến lược:
    - airline: chỉ tìm trong title + description + included (tránh nhiễu từ
      các tour khác quảng cáo trong sidebar/footer).
    - vehicle: chỉ tìm trong included/excluded (nơi chắc chắn liệt kê phương
      tiện tour này dùng). Nếu trống, fallback title + description.
    """

    included_excluded = parse_included_excluded(soup)
    included_text = " ".join(included_excluded.get("included", []))
    excluded_text = " ".join(included_excluded.get("excluded", []))
    description = parse_description(soup) or ""

    # Scope hẹp để tìm hãng bay
    airline_scope = " ".join(
        [title or "", description, included_text, excluded_text]
    )

    # Hãng bay phổ biến tại BestPrice (ưu tiên match dài hơn trước)
    airlines = [
        "Vietnam Airlines",
        "VietJet Air",
        "Bamboo Airways",
        "Vietravel Airlines",
        "Pacific Airlines",
        "Turkish Airlines",
        "Singapore Airlines",
        "Korean Air",
        "Asiana Airlines",
        "Cathay Pacific",
        "Emirates",
        "Qatar Airways",
        "Thai Airways",
        "AirAsia",
        "China Airlines",
        "EVA Air",
        "China Southern Airlines",
        "China Eastern Airlines",
        "Scoot",
        "Malaysia Airlines",
        "Philippine Airlines",
        "Lion Air",
        "Cebu Pacific",
        "VietJet",
    ]

    airline = ""
    for a in airlines:
        if a.lower() in airline_scope.lower():
            airline = a
            break

    # Scope để tìm phương tiện: ưu tiên included > title+description
    vehicle_scope = included_text or " ".join([title or "", description])

    scope_lower = vehicle_scope.lower()
    vehicles = []

    if airline:
        vehicles.append("Máy bay")

    if "máy bay" in scope_lower or "hang không" in scope_lower or "hàng không" in scope_lower:
        if "Máy bay" not in vehicles:
            vehicles.append("Máy bay")

    if "ô tô" in scope_lower or "xe du lịch" in scope_lower or "xe máy lạnh" in scope_lower:
        vehicles.append("Ô tô")

    if "tàu hỏa" in scope_lower or "tàu hoả" in scope_lower:
        vehicles.append("Tàu hỏa")

    if "du thuyền" in scope_lower or "cruise" in scope_lower:
        vehicles.append("Du thuyền")

    if "cano" in scope_lower or "ca nô" in scope_lower:
        vehicles.append("Cano")

    if "thuyền" in scope_lower and "du thuyền" not in scope_lower:
        vehicles.append("Thuyền")

    if not vehicles:
        vehicles.append("Ô tô")

    return {
        "airline": airline,
        "vehicle": unique(vehicles)
    }


# =====================================================
# SCHEDULE (lịch khởi hành)
# =====================================================

def parse_schedule(soup):
    """
    BestPrice có 2 dạng:
      1. Sidebar: 'Lịch khởi hành: 01/08, 08/08, 15/08, 12/09, 19/09'
      2. Bảng giá: '01/08/2026 Còn chỗ | Vietnam Airlines | 13.990.000đ 12.990.000đ'
    Trả về list các dict {"date": "2026-08-01", "price": "12.990.000đ", "available": True}
    """

    schedules = []

    # Regex giá: bắt buộc có dấu chấm phân cách nghìn (vd 1.490.000đ)
    # để tránh match nhầm "14.900đ" (chỉ 1 dấu chấm)
    price_re = re.compile(r"(\d{1,3}(?:\.\d{3})+)\s*đ")

    # 1) Bảng giá (đầy đủ nhất)
    for row in soup.select("table tr"):
        cells = row.select("td")
        if len(cells) < 2:
            continue

        # Cell đầu: "01/08/2026 Còn chỗ"
        first_cell = safe_text(cells[0])

        date_match = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", first_cell)
        if not date_match:
            continue

        day, month, year = date_match.groups()
        available = "còn chỗ" in first_cell.lower() or "còn" in first_cell.lower()

        # Gom text của toàn bộ row để bắt cả 2 giá (gốc + KM)
        row_text = " ".join(safe_text(c) for c in cells)

        # Bắt tất cả giá có dấu phân cách nghìn đầy đủ
        prices = price_re.findall(row_text)
        price = ""
        if prices:
            try:
                nums = [int(p.replace(".", "")) for p in prices]
                # Lọc bỏ giá phi lý (< 100k) - thường là giá phụ thu/child
                # bị BestPrice render trong cùng cell
                valid_nums = [n for n in nums if n >= 100000]
                if valid_nums:
                    min_price = min(valid_nums)
                    price = f"{min_price:,}đ".replace(",", ".")
                elif nums:
                    # Fallback: lấy giá nhỏ nhất trong tất cả
                    min_price = min(nums)
                    price = f"{min_price:,}đ".replace(",", ".")
            except Exception:
                price = prices[-1] + "đ"

        schedules.append({
            "date": f"{year}-{int(month):02d}-{int(day):02d}",
            "price": price,
            "available": available
        })

    # 2) Sidebar text "Lịch khởi hành: 01/08, 08/08, ..."
    if not schedules:
        text = soup.get_text(" ", strip=True)
        m = re.search(r"Lịch\s*khởi\s*hành\s*:?\s*([\d/\s,]+?)(?:\n|Chọn|Giá|$)", text)

        if m:
            block = m.group(1)
            for date_str in re.findall(r"(\d{1,2})/(\d{1,2})", block):
                day, month = date_str
                # Assume năm hiện tại + 1 nếu tháng < tháng hiện tại
                year = 2026
                if month.isdigit() and int(month) < 7:
                    year = 2026
                schedules.append({
                    "date": f"{year}-{int(month):02d}-{int(day):02d}",
                    "price": "",
                    "available": True
                })

    return schedules


# =====================================================
# ORIGINAL PRICE (giá gốc)
# =====================================================

def parse_original_price(soup):
    """
    BestPrice hiển thị:
      'Giá từ 12.390.000đ 11.390.000đ'
    Trong đó 12.390.000đ là giá gốc, 11.390.000đ là giá KM.
    Trả về string giá gốc.
    """

    text = soup.get_text(" ", strip=True)

    # Match "Giá từ X Y" với X là giá gốc
    m = re.search(r"Giá\s*từ\s*([\d\.]+)\s*đ\s*([\d\.]+)\s*đ", text)

    if m:
        return m.group(1) + "đ"

    return ""


# =====================================================
# INCLUDED / EXCLUDED
# =====================================================

def parse_included_excluded(soup):
    """
    BestPrice có 2 section:
      'Giá bao gồm'  -> list items
      'Giá không bao gồm' -> list items
    Trả về dict {"included": [...], "excluded": [...]}
    """

    result = {
        "included": [],
        "excluded": []
    }

    # Tìm theo heading text
    for heading in soup.find_all(
        string=re.compile(r"^\s*Giá\s+(bao\s*gồm|không\s*bao\s*gồm)\s*$", re.IGNORECASE)
    ):
        heading_text = clean_text(heading)
        is_included = "không" not in heading_text.lower()

        # Lấy ul/ol ngay sau heading
        container = heading.find_parent()
        if not container:
            continue

        next_node = container.find_next_sibling()

        # Có thể là <ul> trực tiếp hoặc ul nằm trong div
        ul = None
        if next_node and next_node.name in ("ul", "ol"):
            ul = next_node
        elif next_node:
            ul = next_node.find(["ul", "ol"]) if hasattr(next_node, "find") else None

        # Nếu chưa có, tìm trong container cha
        if not ul:
            parent = container.parent
            if parent:
                ul = parent.find_next(["ul", "ol"])

        if not ul:
            continue

        items = []
        for li in ul.find_all("li"):
            txt = safe_text(li)
            if txt:
                items.append(txt)

        if is_included:
            result["included"] = unique(items)
        else:
            result["excluded"] = unique(items)

    return result


def parse_description(soup):

    meta = soup.find("meta", attrs={"name": "description"})

    if meta:

        return clean_text(meta.get("content", ""))

    return ""


# =====================================================
# HIGHLIGHTS
# =====================================================

def parse_highlights(soup):

    data = []

    for li in soup.select(".list-highlight li"):

        txt = safe_text(li)

        if txt:

            data.append(txt)

    return unique(data)


# =====================================================
# PLACES + TOPIC
# =====================================================

def parse_places_topics(soup):

    places = []

    topics = []

    for li in soup.select(".trip-highlight-v2 ul.highlight li"):

        text = safe_text(li)

        lower = text.lower()

        if "điểm tham quan" in lower:

            text = text.replace("Điểm tham quan:", "")

            arr = text.split(",")

            for item in arr:

                item = clean_text(item)

                if item:

                    places.append(item)

        elif "chủ đề" in lower:

            text = text.replace("Chủ đề:", "")

            arr = text.split(",")

            for item in arr:

                item = clean_text(item)

                if item:

                    topics.append(item)

    return unique(places), unique(topics)


# =====================================================
# ACTIVITIES
# =====================================================

def parse_activities(soup):
    """
    Trích hoạt động hoàn chỉnh từ highlights + description + itinerary
    (không lấy từ đơn lẻ).

    Chiến lược:
    - Trích từng "đoạn" (câu/phrase) chứa keyword hoạt động.
    - Mỗi đoạn tối đa ~80 ký tự để vẫn là 1 activity ngắn gọn.
    - Loại bỏ duplicate (case-insensitive).
    """

    keywords = [
        "check in",
        "check-in",
        "tắm biển",
        "leo núi",
        "tham quan",
        "chèo thuyền",
        "chèo kayak",
        "kayak",
        "lặn ngắm san hô",
        "lặn biển",
        "lặn",
        "cắm trại",
        "ngắm hoàng hôn",
        "ngắm bình minh",
        "đi bộ",
        "trekking",
        "đạp xe",
        "cano",
        "ca nô",
        "câu cá",
        "mua sắm",
        "trượt cát",
        "trượt tuyết",
        "đi xe jeep",
        "đi jeep",
        "jeep",
        "thưởng thức ẩm thực",
        "ẩm thực",
        "xông hơi",
        "massage",
        "buffet",
        "show diễn",
        "biểu diễn",
        "tham gia lễ hội",
        "tham gia tour",
        "du ngoạn",
        "khám phá",
        "trải nghiệm",
        "nghỉ dưỡng",
        "tắm bùn",
        "tắm khoáng",
        "team building",
        "chinh phục",
        "chụp ảnh",
        "sống ảo",
        "picnic",
        "dã ngoại",
        "nếm thử",
        "nếm",
        "skydive",
        "nhảy dù",
        "zipline",
        "đu dây",
        "lướt ván",
        "surf",
        "lướt sóng",
        "đi thuyền",
        "du thuyền",
        "xem san hô",
        "xem cá heo",
        "xem cá voi",
        "cưỡi ngựa",
        "cưỡi voi",
        "xem đua",
        "tham dự",
        "đốt lửa trại",
        "đêm lửa trại",
        "nấu ăn",
        "học nấu ăn",
        "hát karaoke",
        "karaoke",
        "đánh golf",
        "golf",
        "trượt nước",
        "nhảy múa",
        "múa",
    ]

    activities = []

    # Lấy text từ highlights + description + itinerary
    sources = []

    # Highlights: thường nằm trong list ngắn gọn
    for hl in soup.find_all(string=re.compile(r".+")):
        if not hl.parent:
            continue
        # Chỉ lấy các phần tử ngắn (highlights có format ngắn)
        txt = clean_text(hl)
        if 5 <= len(txt) <= 200 and txt not in sources:
            sources.append(txt)

    # Thêm full text để bắt các hoạt động trong itinerary
    full_text = soup.get_text(" ", strip=True)

    def extract_phrases(text, kw):
        """Tìm các phrase ngắn chứa keyword, trả về list phrases."""
        results = []
        text_lower = text.lower()
        for k in keywords:
            if k in text_lower:
                # Tìm vị trí keyword rồi extract phrase xung quanh
                idx = 0
                while True:
                    pos = text_lower.find(k, idx)
                    if pos < 0:
                        break
                    # Lấy phrase từ đầu câu gần nhất đến hết câu
                    start = max(
                        text.rfind(".", 0, pos),
                        text.rfind("\n", 0, pos),
                        text.rfind("•", 0, pos),
                        text.rfind("- ", 0, pos),
                        text.rfind("  ", 0, pos),
                    )
                    start = start + 1 if start >= 0 else 0
                    end = text.find(".", pos + len(k))
                    if end < 0:
                        end = len(text)
                    phrase = text[start:end].strip(" -\n•")
                    if 5 <= len(phrase) <= 120:
                        results.append(phrase)
                    idx = pos + len(k)
        return results

    seen = set()

    for src in sources:
        for phrase in extract_phrases(src, kw=None):
            key = phrase.lower()
            if key not in seen:
                seen.add(key)
                activities.append(phrase)

    # Backup: lấy từ full text nếu chưa đủ
    if len(activities) < 3:
        for phrase in extract_phrases(full_text, kw=None):
            key = phrase.lower()
            if key not in seen:
                seen.add(key)
                activities.append(phrase)

    # Cap tối đa 12 activities
    return activities[:12]


# =====================================================
# GALLERY IMAGE
# =====================================================

def parse_gallery(soup):

    images = []

    for img in soup.select("img"):

        src = img.get("src") or img.get("data-src")

        src = absolute(src)

        if not src:

            continue

        if "uploads/" not in src:

            continue

        if "reviews" in src:

            continue

        if src not in images:

            images.append(src)

    return images

# =====================================================
# ITINERARY
# =====================================================

def parse_itinerary(soup):

    result = []

    boxes = soup.select("div.itinerary-box")

    for box in boxes:

        item = {}

        # ---------- Day ----------
        day = box.select_one(".iti-day-title")
        item["day"] = safe_text(day)

        # ---------- Content ----------
        content_div = box.select_one(".itinerary-content")

        paragraphs = []

        if content_div:

            for p in content_div.select("p"):

                txt = safe_text(p)

                if txt:
                    paragraphs.append(txt)

        item["content"] = paragraphs

        # ---------- Meal ----------
        meal = ""

        if content_div:

            for b in content_div.select("b"):

                txt = safe_text(b)

                if "Bữa" in txt:

                    meal = txt

                    break

        item["meal"] = meal

        # ---------- Images ----------
        imgs = []

        if content_div:

            for img in content_div.select(".itinerary-photos img"):

                src = img.get("src") or img.get("data-src")

                src = absolute(src)

                if src:

                    imgs.append(src)

        item["images"] = unique(imgs)

        result.append(item)

    return result


# =====================================================
# REVIEW
# =====================================================

def parse_reviews(soup):

    reviews = []

    items = soup.select(".item-rv")

    for rv in items:

        data = {}

        # ----------------------------
        # score
        # ----------------------------

        score = rv.select_one(".rv-name")

        data["score"] = safe_text(score)

        # ----------------------------
        # name
        # ----------------------------

        name = rv.select_one(".cus-rv-name span:last-child")

        data["name"] = safe_text(name)

        # ----------------------------
        # date
        # ----------------------------

        date = rv.select_one(".cus-rv-date")

        data["date"] = safe_text(date)

        # ----------------------------
        # content
        # ----------------------------

        content = ""

        short = rv.select_one("span[id$='_short']")

        if short:

            content = short.get_text(" ", strip=True)

            content = content.replace("Xem thêm »", "")

        else:

            div = rv.select_one(".cus-rv-content")

            if div:

                content = div.get_text(" ", strip=True)

        data["content"] = clean_text(content)

        # ----------------------------
        # review images
        # ----------------------------

        imgs = []

        for img in rv.select("img"):

            src = img.get("src") or img.get("data-src")

            src = absolute(src)

            if src:

                imgs.append(src)

        data["images"] = unique(imgs)

        reviews.append(data)

    return reviews[:MAX_REVIEWS_PER_TOUR]


# =====================================================
# REVIEW COUNT
# =====================================================

def parse_review_count(soup):

    text = soup.get_text(" ", strip=True)

    m = re.search(r"([0-9]+)\s*đánh giá", text)

    if m:

        return int(m.group(1))

    return len(parse_reviews(soup))


# =====================================================
# BUILD TOUR DATA
# =====================================================

def parse_tour(soup, url, category):

    places, topics = parse_places_topics(soup)
    title = parse_title(soup)
    duration = parse_duration(soup, title)
    departures = parse_departure(soup)
    transport = parse_transport(soup, title)
    schedule = parse_schedule(soup)
    included_excluded = parse_included_excluded(soup)

    tour = {

        "url": url,

        "category": category,

        "title": title,

        "price": parse_price(soup),

        "original_price": parse_original_price(soup),

        "rating": parse_rating(soup),

        "review_count": parse_review_count(soup),

        "description": parse_description(soup),

        "duration": duration,

        "departure": departures,

        "transport": transport,

        "schedule": schedule,

        "highlights": parse_highlights(soup),

        "places": places,

        "topics": topics,

        "activities": parse_activities(soup),

        "gallery": parse_gallery(soup),

        "itinerary": parse_itinerary(soup),

        "included": included_excluded["included"],

        "excluded": included_excluded["excluded"],

        "reviews": parse_reviews(soup)

    }

    return tour

if __name__ == "__main__":
    # =====================================================
    # MAIN
    # =====================================================

    with sync_playwright() as p:

        browser = p.chromium.launch(
            headless=HEADLESS
        )

        page = browser.new_page()

        for index, tour in enumerate(TOURS):

            try:

                url = tour["url"]

                category = tour.get("category", "")

                print("=" * 80)
                print(f"[{index+1}/{len(TOURS)}]")
                print(url)

                soup = open_page(page, url)

                data = parse_tour(
                    soup,
                    url,
                    category
                )

                filename = url.split("/")[-1].replace(".html", ".json")

                save_json(
                    filename,
                    data
                )

                print("Saved:", filename)

            except Exception as e:

                print(e)

                traceback.print_exc()

        browser.close()

    print("DONE")