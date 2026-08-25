# BÁO CÁO ĐĂNG KÝ ĐỀ TÀI TỐT NGHIỆP

## ĐỀ TÀI: HỆ THỐNG GỢI Ý TOUR DU LỊCH AI CÁ NHÂN HÓA CHO NGƯỜI VIỆT

---

## 1. TÊN ĐỀ TÀI

**Hệ thống gợi ý tour du lịch cá nhân hóa ứng dụng AI dựa trên dữ liệu thu thập từ BestPrice**

---

## 2. MÔ TẢ ĐỀ TÀI

### 2.1. Bài toán thực tế

Hiện nay, các website du lịch như BestPrice chỉ cung cấp **tìm kiếm theo bộ lọc cứng** (điểm đến, ngày, giá). Người dùng phải tự lọc qua hàng trăm tour để tìm được tour phù hợp.

**Vấn đề cốt lõi:**
- Không có gợi ý cá nhân hóa dựa trên sở thích, hoàn cảnh thực tế của người dùng
- Cùng một địa điểm nhưng người trẻ, gia đình có con nhỏ, cặp đôi sẽ có nhu cầu hoàn toàn khác nhau
- Người dùng phải tự suy nghĩ và lọc thủ công

### 2.2. Giải pháp đề xuất

Xây dựng hệ thống cho phép người dùng:

1. **Chat với AI bằng tiếng Việt tự nhiên**
   - Ví dụ: *"Tôi muốn đi biển 3 ngày với gia đình, tầm 5 triệu"*
   - AI tự động trích xuất: destination=biển, duration=3 ngày, companions=gia đình, budget=5 triệu

2. **AI hỏi ngược nếu thiếu thông tin**
   - AI chỉ hỏi những gì chưa biết, không hỏi lại những gì đã biết
   - Ví dụ: *"Bạn muốn nghỉ dưỡng hay khám phá?"*

3. **Trả về Top-N tour phù hợp nhất kèm lý do**
   - AI giải thích tại sao tour này phù hợp với người dùng

---

## 3. CÔNG NGHỆ SỬ DỤNG

| Thành phần | Công nghệ | Vai trò |
|------------|-----------|---------|
| **Frontend** | React + Vite | Giao diện người dùng |
| **Backend** | Node.js + Express | REST API, Authentication |
| **AI Service** | Python + FastAPI | Recommendation Engine, LLM |
| **Database** | PostgreSQL + pgvector | Lưu trữ, vector similarity |
| **Crawler** | Python + Playwright + BeautifulSoup | Thu thập dữ liệu |
| **LLM** | Gemini API | Phân tích, sinh tag, chat |

---

## 4. KIẾN TRÚC HỆ THỐNG

```
┌─────────────────────────────────────────────┐
│              FRONTEND (React)                │
│     Trang chủ, Tìm kiếm, Chat AI, Profile   │
└─────────────────────┬───────────────────────┘
                      │ HTTP Request
                      ▼
┌─────────────────────────────────────────────┐
│           WEB SERVICE (Node.js)              │
│  Auth, CRUD Tour, Ghi log hành vi, Cache     │
└─────────────────────┬───────────────────────┘
                      │ Internal API
                      ▼
┌─────────────────────────────────────────────┐
│            AI SERVICE (Python)               │
│  Recommendation Engine, LLM, Tag Generator   │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│     DATABASE (PostgreSQL + pgvector)         │
│     Tours, Reviews, Users, Preferences       │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│          CRAWLER (Python Batch)              │
│   Thu thập tours + reviews từ BestPrice →      │
│   Database                                       │
└─────────────────────────────────────────────┘
```

---

## 5. THUẬT TOÁN GỢI Ý

### 5.1. Content-Based Filtering + Cosine Similarity

**Cách hoạt động:**

Mỗi tour và mỗi user được biểu diễn thành **vector số** (dãy số). Cosine Similarity đo độ tương đồng giữa 2 vector:

- Score gần **1.0** → Vector cùng hướng → **rất phù hợp**
- Score gần **0.0** → Vector vuông góc → **không phù hợp**

**Ví dụ:**
```
User Profile: [family: 0.9, beach: 0.8, food: 0.5, adventure: 0.1]
   → Thích gia đình, biển, ăn uống. Không thích mạo hiểm.

Tour A: [family: 0.85, beach: 0.9, food: 0.6, adventure: 0.2]
   → Tour biển, phù hợp gia đình, nhiều đồ ăn.

Tour B: [family: 0.1, beach: 0.2, food: 0.3, adventure: 0.95]
   → Tour mạo hiểm, leo núi.

Kết quả:
- Cosine(User, Tour A) = 0.98 → Rất phù hợp ✅
- Cosine(User, Tour B) = 0.35 → Không phù hợp ❌
```

### 5.2. Tag Taxonomy — 21 tag phân loại tour (mở rộng từ 15 tag ban đầu)

| Tag | Ý nghĩa | Ví dụ |
|-----|---------|-------|
| family | Phù hợp gia đình | "Đi cả nhà rất vui" |
| romantic | Dành cho cặp đôi | "Không gian lãng mạn" |
| adventure | Mạo hiểm, khám phá | "Leo núi, kayak rất thú vị" |
| beach | Biển | "Biển đẹp, nước trong" |
| nature | Thiên nhiên | "Cảnh rất đẹp, nhiều cây xanh" |
| food | Ẩm thực | "Đồ ăn ngon, đặc sản địa phương" |
| culture | Văn hóa | "Tham quan làng nghề, di sản" |
| relax | Nghỉ dưỡng | "Resort thoải mái, nghỉ ngơi" |
| budget | Giá rẻ, tiết kiệm | "Giá hợp lý cho sinh viên" |
| luxury | Sang trọng | "Khách sạn 5 sao, dịch vụ tốt" |
| spiritual | Tâm linh | "Chùa đẹp, thanh tịnh" |
| photography | Chụp ảnh đẹp | "Góc chụp ảnh cực đẹp" |
| shopping | Mua sắm | "Chợ đêm nhiều đồ hay" |
| mountain | Núi, cao nguyên | "View núi rất đẹp" |
| city | Thành phố | "Thành phố sôi động, nhiều quán" |
| history | Lịch sử, di tích | "Tham quan chiến trường xưa, địa điểm lịch sử" |
| festival | Lễ hội | "Lễ hội té nước, đua ghe, đầu năm mới" |
| wildlife | Động vật hoang dã | "Vườn quốc gia, ngắm voọc, chim" |
| cruise | Du thuyền | "Đi du thuyền Hạ Long 2 ngày đêm" |
| nightlife | Phố đêm, bar, club | "Phố Tây Bùi Viện nhộn nhịp" |
| water_sports | Lặn, kayak, surfing | "Lặn san hô ở Nha Trang, kayak ở Hạ Long" |

### 5.3. User Profile — Explicit + Implicit

**Explicit (từ lời nói user):**
```
"Tôi đi cùng gia đình" → family = cao
"Tôi thích biển" → beach = cao
```

**Implicit (từ hành vi):**
| Hành vi | Cập nhật |
|---------|----------|
| Click vào tour | Cộng nhẹ trọng số |
| Xem tour lâu (>30s) | Cộng trung bình |
| Lưu yêu thích | Cộng mạnh |
| Tìm kiếm từ khóa | Map → tag tương ứng |

---

## 6. LUỒNG HOẠT ĐỘNG

### 6.1. Luồng gợi ý tour

```
User mở trang web
      │
      ▼
┌─ User mới? ─┐
│              │
├─ YES ───────┤
│ Hiển thị tour phổ biến (Cold-Start)
│              │
├─ NO ───────────────┐
│                    │
▼                    ▼
Gọi AI Service   Gọi AI Service
      │                 │
      ▼                 ▼
Cosine Similarity
(User Profile vs Tour Profile)
      │
      ▼
Xếp hạng → Top-N Tour
      │
      ▼
Trả về Frontend
      │
      ▼
Hiển thị danh sách tour
```

### 6.2. Luồng chat AI (Slot Filling)

```
User: "Tôi muốn đi Đà Lạt cùng vợ"
      │
      ▼
AI trích xuất: destination=Đà Lạt, couple=true
      │
      ├─ Thiếu: budget, duration
      │   → AI hỏi: "Ngân sách bao nhiêu? Đi mấy ngày?"
      │   → User trả lời → Lặp lại
      │
      └─ Đủ thông tin
          → Tạo User Profile tạm
          → Gọi Recommendation Engine
          → Trả về Top-N Tour kèm lý do
```

### 6.3. Luồng thu thập dữ liệu

```
Crawler chạy (batch job)
      │
      ▼
Thu thập tour + review từ BestPrice
      │
      ▼
Data Preprocessing
  - Loại trùng lặp
  - Chuẩn hóa giá, địa điểm
  - Lọc review không phải tiếng Việt
  - Lọc review rác/spam
      │
      ▼
LLM phân tích review → Sinh tag (21 tag - mở rộng từ 15)
      │
      ▼
Tính trọng số tag → Tour Profile Vector
      │
      ▼
Lưu Database → Sẵn sàng gợi ý
```

---

## 7. XỬ LÝ CÁC BÀI TOÁN AI

### 7.1. Cold-Start (User mới)

**Vấn đề:** User mới chưa có hành vi → không có profile để so sánh.

**Giải pháp:**
- Lần đầu: Hiển thị tour phổ biến (rating cao, nhiều review)
- Tương tác đầu: AI hỏi nhanh 3-5 câu để xây dựng profile ban đầu
- Dần dần: Thu thập implicit feedback → Profile ngày càng chính xác

### 7.2. Filter Bubble

**Vấn đề:** Nếu user chỉ xem tour biển, AI chỉ gợi 100% tour biển → nhàm chán.

**Giải pháp (Exploration vs Exploitation):**
- 80% Gợi ý theo sở thích cao nhất
- 20% Bơm vào tour trending hoặc danh mục mới → gợi mở nhu cầu mới

---

## 8. NGUỒN DỮ LIỆU

### 8.1. Crawler

- **BestPrice** (bestprice.vn) — Nền tảng tour du lịch trong nước và quốc tế, nhiều tour, review tiếng Việt

### 8.2. Dữ liệu thu thập

- Tên tour, giá (VND), mô tả, lịch trình
- Rating, review tiếng Việt
- Địa điểm, hình ảnh

### 8.3. Cam kết đạo đức dữ liệu

> **Chỉ phục vụ mục đích học thuật / đào tạo (Educational Purpose)**
> - Dữ liệu review sẽ ẩn danh hóa triệt để
> - Cam kết tuyệt đối không tái phân phối hoặc thương mại hóa dữ liệu

---

## 9. CƠ SỞ DỮ LIỆU

### 9.1. Các bảng chính

| Bảng | Mô tả |
|------|-------|
| `tours` | Thông tin tour (tên, giá, mô tả, rating...) |
| `reviews` | Review người dùng (content, rating...) |
| `tour_tags` | Tag + trọng số của mỗi tour |
| `users` | Tài khoản người dùng |
| `user_preferences` | Profile vector của user |
| `user_actions` | Lịch sử hành vi (click, view, save) |
| `favorites` | Tour yêu thích |

### 9.2. pgvector

Sử dụng extension pgvector của PostgreSQL để:
- Lưu vector tour/user profile
- Tính Cosine Similarity trực tiếp trong SQL
- Tốc độ nhanh hơn nhiều so với tính bằng Python

---

## 10. API ENDPOINTS

### Web Service (Node.js) — Port 3000

| Endpoint | Method | Auth | Mô tả |
|----------|--------|------|-------|
| `/api/auth/register` | POST | ❌ | Đăng ký |
| `/api/auth/login` | POST | ❌ | Đăng nhập |
| `/api/auth/profile` | GET | ✅ | Thông tin user |
| `/api/tours` | GET | ❌ | Danh sách tour |
| `/api/tours/:id` | GET | ❌ | Chi tiết tour |
| `/api/tours/popular` | GET | ❌ | Tour phổ biến |
| `/api/tours/search` | GET | ❌ | Tìm kiếm |
| `/api/recommendations` | GET | ✅ | Gợi ý tour |
| `/api/favorites` | GET | ✅ | Tour yêu thích |
| `/api/actions` | POST | ✅ | Log hành vi |
| `/api/chat` | POST | ✅ | Chat với AI |

### AI Service (Python) — Port 8000

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/health` | GET | Health check |
| `/ai/recommend` | POST | Gợi ý tour |
| `/ai/chat` | POST | Slot Filling |
| `/ai/generate-tags` | POST | Sinh tags |
| `/ai/update-profile` | POST | Cập nhật profile |

---

## 11. GIAO DIỆN NGƯỜI DÙNG

### Các trang chính

| Trang | URL | Mô tả |
|-------|-----|-------|
| Trang chủ | `/` | Banner, tour phổ biến, tour gợi ý |
| Tìm kiếm | `/search` | Tìm tour theo bộ lọc |
| Chi tiết tour | `/tours/:id` | Thông tin, review, tag |
| Chat AI | `/chat` | Hỏi đáp với AI |
| Đăng nhập | `/login` | Form đăng nhập |
| Đăng ký | `/register` | Form đăng ký |
| Tài khoản | `/profile` | Thông tin, lịch sử |
| Yêu thích | `/favorites` | Tour đã lưu |

---

## 12. ĐIỂM MỚI CỦA ĐỀ TÀI

1. **Tìm kiếm bằng chat tự nhiên** — Thay vì form cứng, user nói chuyện với AI
2. **Cá nhân hóa thực sự** — Dựa trên cả lời nói và hành vi
3. **Tag Taxonomy chuẩn hóa** — 21 tag cố định (mở rộng từ 15), LLM chỉ map vào tags có sẵn
4. **Recommendation Engine tự xây** — Không chỉ gọi API ChatGPT/Gemini
5. **Dữ liệu riêng** — Crawl từ BestPrice, xử lý chuyên biệt

---

## 13. TIẾN ĐỘ THỰC HIỆN

### Giai đoạn 1: Khảo sát & Thiết kế ✅ HOÀN THÀNH
- Database schema, Tag taxonomy, Kiến trúc hệ thống

### Giai đoạn 2: Crawler & Dữ liệu ✅ HOÀN THÀNH  
- Crawler structure, Preprocessing, Quick seed script

### Giai đoạn 3: AI & Tag ✅ HOÀN THÀNH
- Tag Generator, Slot Filling, Gemini integration

### Giai đoạn 4: Recommendation Engine ✅ HOÀN THÀNH
- Cosine Similarity, User Profile Builder, Cold Start

### Giai đoạn 5: Website ✅ HOÀN THÀNH
- Frontend, Backend, API endpoints, Authentication

### Giai đoạn 6: Đánh giá & Báo cáo 📋 SẮP TỚI
- Evaluation metrics, Báo cáo tốt nghiệp

---

## 14. CẤU TRÚC THƯ MỤC

```
project/
├── web-fe/              # React (Vite) - Frontend
├── web-be/              # Node.js (Express) - Backend API
├── ai-service/          # Python (FastAPI) - AI Engine
├── crawler/             # Python (Playwright + BeautifulSoup) - Data Collection
├── database/            # SQL migrations
├── docs/                # Tài liệu thiết kế
├── CLAUDE.md            # Project context
└── README.md
```

---

## 15. PHẠM VI ĐỀ TÀI

| Tiêu chí | Phạm vi |
|----------|---------|
| Đối tượng | Người Việt Nam |
| Tour | Trong nước và quốc tế (dành cho người Việt Nam đi du lịch) |
| Tiền tệ | VND |
| Ngôn ngữ | Tiếng Việt |
| Reviews | Chỉ tiếng Việt |

---

## 16. HƯỚNG MỞ RỘNG TƯƠNG LAI

Nếu có đủ dữ liệu hành vi người dùng:
- Mở rộng thành **Hybrid Filtering** (Content-Based + Collaborative Filtering)
- Cải thiện chất lượng gợi ý bằng cách kết hợp cả sở thích cá nhân và hành vi của cộng đồng

---

## 17. CÂU HỎI NGHIÊN CỨU

> **Làm thế nào để xây dựng một hệ thống gợi ý tour du lịch cá nhân hóa từ dữ liệu thu thập trên BestPrice, kết hợp AI để hiểu nhu cầu người dùng và Recommendation Engine để đưa ra danh sách tour phù hợp?**

---

**Người thực hiện:** [Tên sinh viên]
**Ngày nộp:** [Ngày nộp]
**GVHD:** [Tên giảng viên]
