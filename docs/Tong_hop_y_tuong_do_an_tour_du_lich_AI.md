# Định hướng đồ án tốt nghiệp

## 1. Ý tưởng tổng quát

**Đề tài tạm thời**

> Xây dựng hệ thống gợi ý tour du lịch cá nhân hóa ứng dụng AI dựa trên dữ liệu thu thập từ BestPrice.

Trọng tâm của đồ án **không phải website**, mà là **Recommendation Engine**. Website là nơi thể hiện khả năng của hệ thống gợi ý.

**Phạm vi dữ liệu:**

- Đối tượng người dùng: Người Việt Nam.
- Tour du lịch: Trong nước và quốc tế (dành cho người Việt Nam đi du lịch).
- Tiền tệ: VND.
- Ngôn ngữ: Tiếng Việt.
- Review: Chỉ thu thập và xử lý review tiếng Việt (xác định theo **ngôn ngữ chủ đạo** của review — review có xen lẫn tên riêng tiếng Anh như tên người, tên địa điểm vẫn được tính là review tiếng Việt).

---

## 2. Mục tiêu

### Mục tiêu chính

Giải quyết bài toán:

> Làm thế nào để gợi ý tour phù hợp với từng người dùng dựa trên nhu cầu, đặc điểm cá nhân và dữ liệu thực tế?

### Điểm khác biệt

- Không chỉ CRUD.
- Không chỉ gọi API ChatGPT/Gemini.
- Có dữ liệu riêng.
- Có Recommendation Engine do tự xây dựng.
- AI hỗ trợ phân tích dữ liệu và giao tiếp.

---

## 3. Góp ý của giảng viên và định hướng

### Góp ý

- Cùng một địa điểm nhưng người trẻ, gia đình có con nhỏ, cặp đôi... sẽ có nhu cầu khác nhau.
- Tìm mô hình gợi ý cá nhân hóa.
- Nếu có thể, tự crawl dữ liệu và xây dựng model thay vì chỉ dùng API.

### Phân tích

Điều giảng viên mong muốn là một hệ thống Recommendation thực sự chứ không phải chatbot.

---

## 4. Kiến trúc đề xuất

```text
Người dùng
      │
      ▼
LLM hiểu yêu cầu
      │
Nếu thiếu thông tin
      ▼
LLM hỏi ngược
      │
Đủ dữ liệu
      ▼
Recommendation Engine
      │
Xếp hạng Tour
      ▼
Top-N Tour
      │
LLM giải thích
      ▼
Website
```

---

## 5. Vai trò từng thành phần

### LLM

Nhiệm vụ

- Hiểu ngôn ngữ tự nhiên.
- Trích xuất thông tin.
- Hỏi bổ sung.
- Giải thích kết quả.

Không quyết định tour.

### Recommendation Engine

Nhiệm vụ

- Phân tích dữ liệu.
- Tính độ phù hợp.
- Xếp hạng.
- Quyết định Top-N tour.

Đây là phần AI cốt lõi của đồ án.

---

## 6. Quy trình hội thoại

Ví dụ

Người dùng:

"Tôi muốn đi Đà Lạt cùng vợ."

LLM nhận ra

- Destination = Đà Lạt
- Couple = True

LLM chỉ hỏi những thông tin còn thiếu

Ví dụ

- Ngân sách?
- Đi mấy ngày?
- Muốn nghỉ dưỡng hay khám phá?

Không hỏi lại những gì đã biết.

Đây là hướng Slot Filling.

---

## 7. Recommendation Algorithm

Đã thống nhất:

Content-Based Filtering

Lý do

- Không cần nhiều dữ liệu người dùng.
- Phù hợp đồ án.
- Dễ giải thích.
- Dễ đánh giá.

Không sử dụng Collaborative Filtering vì không có dữ liệu hành vi lớn.

---

## 8. Similarity Metric — Cosine Similarity

### Nguyên lý

Mỗi User và mỗi Tour đều được biểu diễn thành **một vector số** (dãy số). Cosine Similarity đo **độ tương đồng** giữa 2 vector:

- Score gần **1.0** → 2 vector cùng hướng → **rất phù hợp**.
- Score gần **0.0** → 2 vector vuông góc → **không phù hợp**.

### Ví dụ minh họa

Giả sử có 5 tag: `[Family, Beach, Adventure, Food, Relax]`

```
User Profile:  [0.9,  0.8,  0.1,  0.5,  0.7]
   → Thích gia đình, biển, ăn uống, nghỉ dưỡng. Không thích mạo hiểm.

Tour A:        [0.85, 0.9,  0.2,  0.6,  0.8]
   → Tour biển, phù hợp gia đình, nhiều đồ ăn, nghỉ dưỡng.

Tour B:        [0.1,  0.2,  0.95, 0.3,  0.1]
   → Tour mạo hiểm, leo núi, ít liên quan gia đình.
```

Kết quả:

```
Cosine(User, Tour A) = 0.98  → Rất phù hợp ✅
Cosine(User, Tour B) = 0.35  → Không phù hợp ❌
```

→ Recommendation Engine sẽ gợi ý **Tour A** lên đầu danh sách.

### Lý do chọn Cosine Similarity

- Phổ biến nhất trong Content-Based Filtering.
- Dễ triển khai (có sẵn trong scikit-learn).
- Không bị ảnh hưởng bởi độ lớn vector, chỉ quan tâm **hướng** (sở thích).

---

## 9. Dataset & Đạo đức Dữ liệu (Data Ethics)

### Nguồn crawl

- **BestPrice** (bestprice.vn) — Nền tảng tour du lịch trong nước và quốc tế, nhiều tour, review tiếng Việt.

### Tuyên bố Trách nhiệm Dữ liệu (Dành cho Hội đồng)
Việc crawl dữ liệu từ BestPrice có thể vi phạm Điều khoản Dịch vụ (Terms of Service) của họ. Do đó, đồ án phải được cam kết rõ ràng:
- **Proof of Concept (PoC):** Hệ thống chỉ phục vụ mục đích **Nghiên cứu / Học thuật / Đào tạo (Educational Purpose)**.
- **Phi thương mại & Ẩn danh:** Dữ liệu review người dùng thu thập được sẽ ẩn danh hóa triệt để, dự án cam kết tuyệt đối không tái phân phối hoặc thương mại hóa.
*(Ghi chú: Giới học thuật đánh giá cực lớn các sinh viên có nhận thức về Đạo đức AI & Bản quyền Dữ liệu)*

### Giai đoạn 1 — Dữ liệu cơ bản

Crawler thu thập:

- Tên tour
- Giá (VND)
- Mô tả
- Lịch trình
- Rating
- Review (chỉ lấy tiếng Việt, bỏ qua review tiếng Anh hoặc ngôn ngữ khác)
- Địa điểm

### Giai đoạn sau — Mở rộng nếu cần

- Hình ảnh
- Khách sạn
- Nhà hàng
- Hoạt động
- Thời tiết

Không crawl quá nhiều ngay từ đầu.

### Data Preprocessing — Xử lý dữ liệu thô

Dữ liệu crawl thường "bẩn", cần xử lý trước khi dùng:

| Bước | Mô tả |
|------|-------|
| **Deduplication** | Loại bỏ tour trùng lặp (cùng tên, cùng nguồn hoặc khác nguồn) |
| **Chuẩn hóa giá** | Thống nhất về VND, loại bỏ ký tự thừa |
| **Chuẩn hóa địa điểm** | Thống nhất tên (VD: "TP.HCM" = "Hồ Chí Minh" = "Sài Gòn") |
| **Lọc review không phải tiếng Việt** | Xác định ngôn ngữ chủ đạo, chỉ giữ review tiếng Việt |
| **Lọc review rác/spam** | Loại review quá ngắn (< 10 ký tự), review trùng lặp, review không liên quan |
| **Xử lý missing data** | Điền giá trị mặc định hoặc loại bỏ tour thiếu quá nhiều thông tin |

---

## 10. Xử lý Review và Tag Taxonomy

### Ý tưởng

Không để AI tự quyết định điểm. Thay vào đó, AI đọc review và **phân loại vào các tag đã định nghĩa sẵn**.

### Tag Taxonomy — Bộ tag chuẩn

Định nghĩa trước **21 tag cố định** (mở rộng từ 15 tag ban đầu trong quá trình phát triển). LLM chỉ được map review vào các tag này, không tự tạo tag mới.

| Tag | Ý nghĩa | Ví dụ review |
|-----|---------|-------------|
| `family` | Phù hợp gia đình | "Đi cả nhà rất vui" |
| `romantic` | Dành cho cặp đôi | "Không gian lãng mạn" |
| `adventure` | Mạo hiểm, khám phá | "Leo núi, kayak rất thú vị" |
| `beach` | Biển | "Biển đẹp, nước trong" |
| `nature` | Thiên nhiên | "Cảnh rất đẹp, nhiều cây xanh" |
| `food` | Ẩm thực | "Đồ ăn ngon, đặc sản địa phương" |
| `culture` | Văn hóa chung | "Tham quan di tích, làng nghề" |
| `relax` | Nghỉ dưỡng | "Resort thoải mái, nghỉ ngơi" |
| `budget` | Giá rẻ, tiết kiệm | "Giá hợp lý cho sinh viên" |
| `luxury` | Sang trọng | "Khách sạn 5 sao, dịch vụ tốt" |
| `spiritual` | Tâm linh | "Chùa đẹp, thanh tịnh" |
| `photography` | Chụp ảnh đẹp | "Góc chụp ảnh cực đẹp" |
| `shopping` | Mua sắm | "Chợ đêm nhiều đồ hay" |
| `mountain` | Núi, cao nguyên | "View núi rất đẹp" |
| `city` | Thành phố | "Thành phố sôi động, nhiều quán" |
| `history` | Lịch sử, di tích | "Tham quan chiến trường xưa, triều đại" |
| `festival` | Lễ hội đặc sắc | "Lễ hội té nước, đua ghe" |
| `wildlife` | Động vật hoang dã | "Vườn quốc gia, ngắm voọc" |
| `cruise` | Du thuyền | "Đi du thuyền Hạ Long 2 ngày đêm" |
| `nightlife` | Phố đêm, bar, club | "Phố Tây Bùi Viện nhộn nhịp" |
| `water_sports` | Lặn, kayak, surfing | "Lặn san hô ở Nha Trang" |

### Quy trình sinh tag

```
Review: "Phù hợp cho gia đình, biển đẹp, đồ ăn ngon."
         │
         ▼
   LLM phân tích
         │
         ▼
   Tags: [family, beach, food]
```

LLM sử dụng prompt engineering (few-shot) để đảm bảo chỉ chọn tag trong taxonomy.

---

## 11. Tour Profile — Vector có trọng số

Mỗi tour sẽ có một **vector trọng số** dựa trên tần suất tag xuất hiện trong review.

### Ngưỡng tối thiểu

Tour có quá ít review sẽ cho trọng số **không đáng tin**. Quy định:

- Tour có **≥ 5 review** → Tính trọng số bình thường.
- Tour có **< 5 review** → Dùng giá trị mặc định (trọng số = 0.0 cho tất cả tag, chỉ dùng thuộc tính cơ bản như destination, price, duration để gợi ý).
- **Tag Augmentation:** Với tour có ít review, hệ thống sẽ tự động infer tags từ description bằng LLM hoặc rule-based fallback.

### Cách tính trọng số

```
Ví dụ: Tour "Phú Quốc 3N2Đ" có 100 review (≥ 5, đủ điều kiện).
- 80 review gắn tag "beach"     → beach = 80/100 = 0.80
- 60 review gắn tag "food"      → food  = 60/100 = 0.60
- 45 review gắn tag "family"    → family = 45/100 = 0.45
- 10 review gắn tag "adventure" → adventure = 10/100 = 0.10
```

### Tour Profile Vector

```
Tour "Phú Quốc 3N2Đ":
[family: 0.45, romantic: 0.20, adventure: 0.10, beach: 0.80,
 nature: 0.55, food: 0.60, culture: 0.15, relax: 0.70,
 budget: 0.10, luxury: 0.30, spiritual: 0.05, photography: 0.65,
 shopping: 0.25, mountain: 0.00, city: 0.10]
```

### Các thuộc tính bổ sung (không phải tag)

Ngoài tag vector, mỗi tour còn có:

- Destination (địa điểm)
- Budget range (khoảng giá)
- Duration (số ngày)
- Season (mùa phù hợp)
- Average Rating (điểm trung bình)

Các thuộc tính này dùng để **lọc trước** (filter), sau đó mới dùng tag vector để **xếp hạng** (rank).

---

## 12. User Profile (định hướng)

### Nguồn xây dựng User Profile

**Explicit** — Từ thông tin người dùng cung cấp:

```
"Tôi đi cùng gia đình."     → family = cao
"Tôi thích biển."            → beach = cao
"Mình thích nghỉ dưỡng."     → relax = cao
```

**Implicit** — Từ hành vi người dùng (thu thập dần), lưu vào bảng `user_actions`:

| Hành vi | action_type | Cách cập nhật User Profile |
|---------|------------|---------------------------|
| Click vào xem tour | `click` | Cộng nhẹ trọng số các tag của tour đó vào User Profile |
| Xem tour lâu (> 30s) | `view` | Cộng trung bình trọng số tag |
| Lưu / yêu thích tour | `save` | Cộng mạnh trọng số tag (hành vi rõ ràng nhất) |
| Tìm kiếm từ khóa | `search` | Map từ khóa → tag tương ứng, cộng trọng số |

Mỗi lần user tương tác, hệ thống ghi lại vào bảng `user_actions` và **tự động cập nhật** bảng `user_preferences` (User Profile vector).

Sau đó User Profile vector sẽ được so sánh với Tour Profile vector bằng Cosine Similarity.

---

## 13. Xử lý các bài toán AI kinh điển (Cold-Start & Filter Bubble)

### 13.1. Cold-Start đối với Người dùng mới (New User)

**Vấn đề:** User mới tạo tài khoản, chưa có hành vi → Engine không có vector hồ sơ để so sánh độ tương đồng.

**Giải pháp:**
| Giai đoạn | Cách xử lý |
|-----------|------------|
| **Lần đầu đăng nhập** | Hiển thị **tour phổ biến nhất** (dựa trên rating cao, nhiều lượt đặt/review) |
| **Tương tác đầu tiên** | LLM hỏi nhanh 3-5 câu (Slot Filling) để xây dựng User Profile ban đầu |
| **Dần dần về sau** | Thu thập Implicit Feedback (click, xem, lưu, tìm kiếm) → Cập nhật User Profile → Gợi ý ngày càng chính xác |

### 13.2. Cold-Start đối với Tour mới (New Item)

**Vấn đề:** Khi có một Tour hoàn toàn mới đưa lên hệ thống, chưa có ai Review → LLM không có Review để sinh Tag → Tour mất tích vĩnh viễn khỏi mọi recommendation.

**Giải pháp (Fallback Mechanism):** Nếu tour không có review, Pipeline Data sẽ sử dụng LLM để đọc nội dung **Mô tả (Description) và Lịch trình (Itinerary)** của tour để đoán Tag ban đầu. Mức độ chính xác sẽ được "tinh chỉnh" lại (Refine) khi bắt đầu có Review thực tế.

### 13.3. Vòng lặp bộ lọc (Filter Bubble)

**Vấn đề:** Nếu người dùng chỉ bấm click xem tour Biển, AI sẽ học và chỉ trả về 100% tour Biển. Người dùng bị nhốt trong "lồng kính" sở thích và sẽ chán nản do không có sự bất ngờ.

**Giải pháp (Exploration vs Exploitation):**
Thuật toán sẽ được cấu hình tự động điều chỉnh tỷ lệ hiển thị:
- **80% Tận dụng (Exploitation):** Gợi ý các tour khớp sở thích cao nhất từ Cosine Similarity.
- **20% Khám phá (Exploration):** Cố tình bơm vào một tỷ lệ nhiễu (noise) ngẫu nhiên bằng việc chèn các tour đang Trending hoặc thuộc danh mục user *chưa từng xem*. Điều này giúp gợi mở nhu cầu du lịch mới cho người dùng.

Quy trình cold-start:

```text
User mới đăng nhập
      │
      ▼
Hiển thị tour phổ biến
      │
User bắt đầu tìm kiếm / chat
      │
      ▼
LLM hỏi bổ sung (Slot Filling)
      │
      ▼
Tạo User Profile ban đầu
      │
      ▼
Recommendation Engine gợi ý
      │
User tiếp tục dùng
      │
      ▼
Thu thập hành vi (Implicit Feedback)
      │
      ▼
User Profile ngày càng chính xác
```

---

## 14. Quy trình dữ liệu

```text
Crawler (BestPrice)
    │
    ▼
Dataset thô
    │
    ▼
Data Preprocessing (làm sạch, chuẩn hóa)
    │
    ▼
Dataset sạch
    │
    ▼
LLM phân tích review
    │
Sinh Tag (theo Taxonomy)
    │
    ▼
Tính trọng số tag
    │
    ▼
Tour Profile Vector
    │
    ▼
Recommendation Engine (Cosine Similarity)
    │
    ▼
Top-N Tour
    │
    ▼
LLM giải thích
    │
    ▼
Website
```

---

## 15. Tech Stack

| Thành phần | Công nghệ | Vai trò |
|-----------|-----------|---------|
| **AI Service** | Python (FastAPI) | Recommendation Engine, LLM integration, xử lý tag |
| **Web API** | Node.js (Express/NestJS) | REST API, Authentication, CRUD, xử lý request |
| **Frontend** | React (Vite) | Giao diện người dùng |
| **Database** | PostgreSQL | Lưu trữ tour, user, tag, recommendation |
| **Cache** | Redis *(tùy chọn)* | Cache kết quả gợi ý, tăng tốc — chỉ cần nếu hệ thống có nhiều request |
| **Crawler** | Python (Playwright + BeautifulSoup) | Thu thập dữ liệu từ BestPrice |
| **LLM** | Gemini API | Phân tích review, sinh tag, hỏi ngược, giải thích |
| **ML Library** | Scikit-learn / NumPy | Cosine Similarity, xử lý vector |

---

## 16. Frontend — Giao diện người dùng

### Framework: React (Vite)

Lý do chọn React (Vite):

- Đã có backend riêng (Node.js + Python) → không cần SSR/API routes của Next.js.
- Đồ án demo → không cần SEO.
- 1 người phát triển → ưu tiên đơn giản.
- Vite build nhanh, hot reload nhanh.
- Sử dụng React Router cho routing.

### Các trang chính

| Trang | URL (dự kiến) | Mô tả |
|-------|--------------|-------|
| **Trang chủ** | `/` | Banner, tour phổ biến, tour gợi ý (nếu đã đăng nhập) |
| **Tìm kiếm** | `/search` | Tìm tour theo keyword + bộ lọc (giá, địa điểm, số ngày, tag) |
| **Chi tiết tour** | `/tours/:id` | Thông tin tour, lịch trình, review, tag, tour tương tự |
| **Chat AI** | `/chat` | Giao diện chat với LLM — hỏi đáp, nhận gợi ý tour |
| **Đăng nhập** | `/login` | Form đăng nhập |
| **Đăng ký** | `/register` | Form đăng ký tài khoản |
| **Tài khoản** | `/profile` | Thông tin cá nhân, sở thích, lịch sử tìm kiếm |
| **Tour yêu thích** | `/favorites` | Danh sách tour đã lưu |
| **Kết quả gợi ý** | `/recommendations` | Danh sách tour được Engine gợi ý |

### Chức năng chính của Frontend

**Dành cho người dùng (User):**

- Xem danh sách tour phổ biến / tour gợi ý.
- Tìm kiếm tour với bộ lọc (địa điểm, giá, số ngày, tag).
- Xem chi tiết tour (mô tả, lịch trình, review, tag).
- Chat với AI để nhận gợi ý cá nhân hóa.
- Lưu tour yêu thích.
- Đăng ký, đăng nhập tài khoản.
- Xem lịch sử tìm kiếm và tương tác.

**Dành cho quản trị (Admin) — tùy chọn:**

- Dashboard tổng quan (số tour, số user, số review).
- Quản lý tour (xem, sửa, xóa tour đã crawl).
- Quản lý tag taxonomy.
- Xem log hành vi user.
- Chạy lại Crawler / Tag Generation thủ công.

### Ghi nhận hành vi người dùng (Implicit Feedback)

Frontend tự động ghi nhận và gửi về Web Service:

| Hành vi | Cách ghi nhận |
|---------|--------------|
| Click vào tour | Gửi `action_type = "click"` khi user click |
| Xem tour lâu | Đếm thời gian trên trang, gửi `"view"` nếu > 30 giây |
| Lưu yêu thích | Gửi `"save"` khi user bấm nút lưu |
| Tìm kiếm | Gửi `"search"` kèm từ khóa khi user tìm |

---

## 17. Data Schema sơ bộ

### Bảng `tours`

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| id | INT (PK) | ID tour |
| name | VARCHAR | Tên tour |
| destination | VARCHAR | Địa điểm |
| price | INT | Giá (VND) |
| duration | INT | Số ngày |
| description | TEXT | Mô tả |
| avg_rating | FLOAT | Điểm trung bình |
| review_count | INT | Số lượng review |
| source | VARCHAR | Nguồn crawl (BestPrice) |
| source_url | VARCHAR | Link gốc |
| season | VARCHAR | Mùa phù hợp (spring/summer/autumn/winter/all) |
| created_at | TIMESTAMP | Thời tạo |
| updated_at | TIMESTAMP | Thời cập nhật |

### Bảng `reviews`

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| id | INT (PK) | ID review |
| tour_id | INT (FK) | Tour tương ứng |
| content | TEXT | Nội dung review |
| language | VARCHAR | Ngôn ngữ review (vi, en, ...) |
| rating | FLOAT | Điểm đánh giá |
| reviewer_name | VARCHAR | Tên người review (ẩn danh) |
| created_at | TIMESTAMP | Thời gian |

### Bảng `tour_tags`

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| tour_id | INT (FK) | Tour |
| tag | VARCHAR | Tag (từ taxonomy) |
| weight | FLOAT | Trọng số (0.0 - 1.0) |

### Bảng `users`

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| id | INT (PK) | ID user |
| name | VARCHAR | Tên |
| email | VARCHAR | Email |

### Bảng `user_preferences`

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| user_id | INT (FK) | User |
| tag | VARCHAR | Tag |
| weight | FLOAT | Trọng số sở thích |

### Bảng `user_actions`

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| id | INT (PK) | ID |
| user_id | INT (FK) | User |
| tour_id | INT (FK) | Tour |
| action_type | VARCHAR | Loại hành vi (click, view, save, search) |
| search_query | VARCHAR | Từ khóa tìm kiếm (cho action_type=search) |
| created_at | TIMESTAMP | Thời gian |

### Bảng `favorites`

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| id | INT (PK) | ID |
| user_id | INT (FK) | User |
| tour_id | INT (FK) | Tour |
| created_at | TIMESTAMP | Thời gian thêm yêu thích |

---

## 18. Những điểm mạnh của đồ án

- Có crawler tự thu thập dữ liệu.
- Có dữ liệu riêng (BestPrice).
- Có Recommendation Engine (Content-Based Filtering + Cosine Similarity).
- Có AI hỗ trợ (LLM phân tích review, sinh tag, hỏi ngược, giải thích).
- Có cá nhân hóa (User Profile + Implicit Feedback).
- Có Tag Taxonomy chuẩn hóa.
- Không phụ thuộc hoàn toàn vào API.

---

## 19. Những việc đã chốt

- Website chỉ là nền tảng trình bày.
- Recommendation Engine là trọng tâm.
- Chọn Content-Based Filtering + Cosine Similarity.
- AI sẽ hỏi ngược người dùng nếu thiếu thông tin (Slot Filling).
- AI dùng để phân tích review và sinh tag (theo Tag Taxonomy cố định).
- Tag có trọng số (tính từ tần suất review).
- Recommendation Engine quyết định kết quả, LLM chỉ giải thích.
- Crawl dữ liệu từ BestPrice.
- Phạm vi: Tour du lịch trong nước và quốc tế (dành cho người Việt Nam), tiền VND, tiếng Việt.
- Backend: Python (FastAPI) + Node.js (Express/NestJS).
- Cold-Start: Tour phổ biến lần đầu → Implicit Feedback dần dần.

---

## 20. Evaluation — Đánh giá hệ thống

### Đánh giá Recommendation Engine

| Phương pháp | Cách thực hiện |
|-------------|---------------|
| **Precision@K** | Trong Top-K tour gợi ý, bao nhiêu tour thực sự liên quan đến yêu cầu |
| **LLM-as-Judge** | Dùng LLM khác đánh giá: "Tour này có phù hợp với yêu cầu user không?" (dùng AI đánh giá AI) |
| **A/B Comparison** | So sánh kết quả Engine vs kết quả ngẫu nhiên → đánh giá bên nào tốt hơn |
| **Self-Testing** | Tự tạo nhiều kịch bản (gia đình, cặp đôi, du lịch một mình...) và kiểm tra kết quả gợi ý |

### Đánh giá Tag Generation

| Phương pháp | Cách thực hiện |
|-------------|---------------|
| **LLM Cross-Check** | Dùng LLM khác (hoặc cùng LLM với prompt khác) kiểm tra tag đã gán có chính xác không |
| **Spot Check** | Kiểm tra ngẫu nhiên 20-30 review và tag tương ứng, đánh giá bằng mắt |

---

## 21. Những việc sẽ làm tiếp

### Giai đoạn 1 — Khảo sát & Thiết kế

- Khảo sát BestPrice (cấu trúc trang, dữ liệu có thể crawl).
- Thiết kế database (dựa trên Data Schema sơ bộ).
- Thiết kế Tour Profile và User Profile.
- Hoàn thiện Tag Taxonomy.

### Giai đoạn 2 — Crawler & Dữ liệu

- Xây dựng crawler (Playwright + BeautifulSoup).
- Thu thập dữ liệu tour + review.
- Data Preprocessing (làm sạch, chuẩn hóa, loại trùng lặp).

### Giai đoạn 3 — AI & Tag

- LLM phân tích review.
- Sinh tag theo Taxonomy.
- Tính trọng số tag cho Tour Profile.

### Giai đoạn 4 — Recommendation Engine

- Xây dựng Engine (Cosine Similarity).
- Xây dựng User Profile từ Explicit + Implicit data.
- Xử lý Cold-Start.
- Test và tune kết quả gợi ý.

### Giai đoạn 5 — Website

- Backend API (Python FastAPI + Node.js).
- Frontend (React + Vite).
- Tích hợp Engine + LLM.
- Dashboard quản lý.

### Giai đoạn 6 — Đánh giá & Báo cáo

- Đánh giá hệ thống (Evaluation).
- Viết báo cáo tốt nghiệp.

---

## 22. Hướng mở rộng tương lai

> Trong tương lai, nếu có đủ dữ liệu hành vi người dùng, hệ thống có thể mở rộng thành **Hybrid Filtering** (Content-Based + Collaborative Filtering) để cải thiện chất lượng gợi ý.

---

## 23. Câu hỏi nghiên cứu cốt lõi

> Làm thế nào để xây dựng một hệ thống gợi ý tour du lịch cá nhân hóa từ dữ liệu thu thập trên BestPrice, kết hợp AI để hiểu nhu cầu người dùng và Recommendation Engine để đưa ra danh sách tour phù hợp?

Đây sẽ là kim chỉ nam cho toàn bộ đồ án.

---

## 24. Tiến độ thực hiện (Cập nhật: 2026-07-10)

### Giai đoạn 1 — Khảo sát & Thiết kế ✅ HOÀN THÀNH

- [x] Tạo cấu trúc thư mục dự án
- [x] Tạo file `CLAUDE.md` để lưu context
- [x] Tạo Database Schema (SQL migrations)
- [x] Hoàn thiện Tag Taxonomy (21 tag cố định - mở rộng từ 15)
- [x] Tạo file `.env.example` cho cấu hình
- [x] Tạo README cho từng service
- [x] Cấu hình AI Service (FastAPI) - Core engine
- [x] Cấu hình Web Service (Node.js/Express) - API
- [x] Cấu hình Crawler (Python/Playwright + BeautifulSoup) - Base structure
- [x] Cấu hình Frontend (React/Vite) - UI cơ bản

**File đã tạo:**
```
database/migrations/001_initial_schema.sql
database/migrations/002_add_favorites.sql
.env.example
CLAUDE.md
README.md

ai-service/
├── requirements.txt
├── README.md
├── app/
│   ├── config.py, schemas.py, main.py
│   ├── engine/ (tags.py, cosine.py, recommendation.py, engine_db.py)
│   └── llm/ (gemini.py, slot_filling.py, tag_generator.py)

web-be/
├── package.json, tsconfig.json, tsconfig.build.json
├── src/
│   ├── index.ts, db/index.ts
│   ├── controllers/ (auth, tours, recommendations, actions, chat)
│   ├── routes/ (auth, tours, recommendations, actions, chat)
│   └── middlewares/ (error, rateLimit)

crawler/
├── requirements.txt, settings.py
├── spiders/ (base_spider.py, bestprice_spider.py)
├── preprocessing/ (dedup.py, normalize.py, filter.py)
├── utils/ (language_detector.py)
├── quick_seed.py              # Quick DB check & sample data
└── scripts/
    ├── generate_sample_data.py
    ├── batch_generate_tags.py
    └── run_crawler.py

web-fe/
├── package.json, tsconfig.json, vite.config.ts, index.html
└── src/
    ├── main.tsx, App.tsx, index.css
    ├── types/index.ts, api/index.ts, stores/auth.ts
    ├── components/ (Layout, TourCard)
    └── pages/ (Home, Search, TourDetail, Chat, Login, Register, Profile, Favorites)
```

### Giai đoạn 2 — Crawler & Dữ liệu ✅ HOÀN THÀNH

- [x] Cấu trúc thư mục crawler
- [x] Base spider class
- [x] BestPrice spider
- [x] Preprocessing: dedup, normalize, filter
- [x] Language detector cho Vietnamese
- [x] Quick seed script (`quick_seed.py`)
- [x] Script batch generate tags
- [x] Setup script (setup.bat/setup.sh)

**Hướng dẫn chạy Giai đoạn 2:**
```bash
# 1. Start PostgreSQL
# 2. psql -U postgres -d tour_recommendation -c "CREATE EXTENSION IF NOT EXISTS vector;"
# 3. psql -U postgres -d tour_recommendation -f database/migrations/001_initial_schema.sql
# 4. cd crawler && pip install -r requirements.txt && python quick_seed.py
```

### Giai đoạn 3 — AI & Tag ✅ HOÀN THÀNH

- [x] Tag Taxonomy (21 tag cố định - mở rộng từ 15)
- [x] Tag Generator (LLM + Rule-based)
- [x] Slot Filling Engine
- [x] Batch generate tags script
- [x] Gemini integration (với fallback mock)
- [x] Recommendation Engine core
- [x] User Profile Builder (Implicit Feedback)
- [x] Cold Start Handler

**File đã tạo/thêm:**
```
ai-service/
├── app/llm/
│   ├── gemini.py
│   ├── slot_filling.py      # Slot Filling Engine mới
│   └── tag_generator.py
├── app/engine/
│   ├── recommendation.py
│   ├── engine_db.py         # DB-integrated engine mới
│   └── cosine.py
├── app/models/
│   └── database.py          # SQLAlchemy models mới
├── requirements.txt
└── README.md

crawler/
├── quick_seed.py            # Quick seed script mới
└── scripts/
    ├── generate_sample_data.py
    └── batch_generate_tags.py
```

### Giai đoạn 4 — Recommendation Engine ✅ HOÀN THÀNH

- [x] Cosine Similarity Engine với DB integration
- [x] User Profile Builder từ Implicit Feedback
- [x] Cold Start Handler
- [x] Recommendation Engine hoàn chỉnh với database
- [x] Tag augmentation cho tour thiếu reviews

### Giai đoạn 5 — Website ✅ HOÀN THÀNH

- [x] web-be (Node.js/Express)
  - REST API cho tất cả endpoints
  - JWT Authentication
  - Rate limiting
  - Caching (Node-cache)
  - Error handling
  - Favorites endpoints
- [x] ai-service (Python/FastAPI)
  - Recommendation Engine với DB integration
  - LLM Integration
  - Tag Generation
  - Slot Filling
  - Cold Start handling
- [x] web-fe (React/Vite)
  - Tất cả 8 pages hoàn chỉnh
  - Authentication (Login/Register)
  - Tour listing & search
  - Chat với AI
  - User profile & favorites
- [x] Setup scripts (Windows/Linux)

**Cấu trúc web-be:**
```
web-be/
├── src/
│   ├── index.ts              # Express app
│   ├── db/index.ts           # PostgreSQL connection
│   ├── controllers/
│   │   ├── auth.ts           # Auth: register, login, profile
│   │   ├── tours.ts          # Tour CRUD, search, popular
│   │   ├── recommendations.ts # Gọi AI Service
│   │   ├── actions.ts        # Log implicit feedback
│   │   ├── chat.ts           # Chat với AI
│   │   └── favorites.ts      # Bookmark tour
│   ├── routes/               # Route definitions
│   └── middlewares/          # Error, rate limit
```

**API Endpoints (web-be - port 3000):**
| Endpoint | Method | Auth | Mô tả |
|----------|--------|------|--------|
| `/api/auth/register` | POST | ❌ | Đăng ký |
| `/api/auth/login` | POST | ❌ | Đăng nhập |
| `/api/auth/profile` | GET | ✅ | Thông tin user |
| `/api/tours` | GET | ❌ | Danh sách tour |
| `/api/tours/:id` | GET | ❌ | Chi tiết tour |
| `/api/tours/:id/reviews` | GET | ❌ | Reviews |
| `/api/tours/popular` | GET | ❌ | Tour phổ biến |
| `/api/tours/search` | GET | ❌ | Tìm kiếm |
| `/api/recommendations` | GET | ✅ | Gợi ý tour |
| `/api/favorites` | GET | ✅ | Danh sách tour yêu thích |
| `/api/favorites/:tourId` | POST | ✅ | Thêm/xóa tour yêu thích |
| `/api/actions` | POST | ✅ | Log hành vi |
| `/api/actions/history` | GET | ✅ | Lịch sử hành vi |
| `/api/chat` | POST | ✅ | Chat với AI |
| `/api/chat/history` | GET | ✅ | Lịch sử chat |

### Giai đoạn 6 — Đánh giá & Báo cáo 📋 CHƯA BẮT ĐẦU

- [ ] Đánh giá hệ thống (Evaluation)
- [ ] Viết báo cáo tốt nghiệp
