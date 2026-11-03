# GIẢI THÍCH CHỨC NĂNG TƯ VẤN DU LỊCH BẰNG AI

**Ngày cập nhật:** 06/10/2026  
**Dự án:** Hệ thống tư vấn và gợi ý tour du lịch

## 1. Tổng quan

Chức năng tư vấn AI của dự án được chia thành ba phần:

1. **Giao diện trò chuyện:** nhận câu hỏi, hiển thị câu trả lời và danh sách tour.
2. **Backend chính:** kiểm tra đăng nhập, quản lý cuộc trò chuyện, lưu lịch sử và chuyển câu hỏi sang dịch vụ AI.
3. **Dịch vụ AI:** hiểu nhu cầu, tìm tour trong database, sắp xếp tour phù hợp và viết câu trả lời bằng tiếng Việt.

Luồng xử lý:

```text
Người dùng nhập câu hỏi
        ↓
Trang Chat gửi câu hỏi tới backend
        ↓
Backend lưu câu hỏi vào database
        ↓
Backend gửi câu hỏi và nội dung trước đó sang AI Service
        ↓
AI Service hiểu nhu cầu, tìm và sắp xếp tour
        ↓
AI Service viết câu trả lời
        ↓
Backend lưu câu trả lời
        ↓
Trang Chat hiển thị câu trả lời và các thẻ tour
```

DeepSeek hoặc Gemini không tự tạo danh sách tour. Tour thật luôn được lấy từ database. AI bên ngoài chủ yếu giúp câu trả lời tự nhiên và giống nhân viên tư vấn hơn.

## 2. Giao diện tư vấn AI

### File `web-fe/src/pages/Chat.tsx`

Đây là file chính tạo màn hình trò chuyện với TourAI Assistant. File chịu trách nhiệm:

- Hiển thị màn hình chào mừng và các câu hỏi gợi ý.
- Nhận nội dung người dùng nhập.
- Gửi câu hỏi tới backend.
- Hiển thị trạng thái AI đang xử lý.
- Hiển thị câu trả lời và danh sách tour.
- Gửi các câu hỏi tiếp theo về tour vừa được tư vấn.
- Ghi nhận khi người dùng bấm vào một tour.

Tại `web-fe/src/pages/Chat.tsx:12`, giao diện khai báo các hành trình mẫu như nghỉ dưỡng Phú Quốc, Đà Lạt cho cặp đôi, Sapa săn mây và Đà Nẵng - Hội An cho gia đình. Mỗi thẻ chứa một câu hỏi hoàn chỉnh; khi bấm vào, câu hỏi được gửi giống như người dùng tự nhập.

`QUICK_TOPICS` tại `web-fe/src/pages/Chat.tsx:44` cung cấp các nút hỏi nhanh như tour Phú Quốc, tour Đà Lạt, tour dưới 3 triệu hoặc tour cho gia đình.

Tại `web-fe/src/pages/Chat.tsx:274`, trang Chat giữ:

- `messages`: danh sách tin nhắn đang hiển thị.
- `input`: nội dung đang nhập.
- `loading`: AI có đang xử lý hay không.
- `sessionId`: mã cuộc trò chuyện hiện tại.

### Ghi nhớ cuộc trò chuyện trên trình duyệt

Tại `web-fe/src/pages/Chat.tsx:293`, trang Chat đọc và lưu dữ liệu bằng `sessionStorage`. Dữ liệu được lưu theo tên:

```text
tourai-chat:<mã người dùng>
```

Nội dung gồm danh sách tin nhắn và mã cuộc trò chuyện. Khi tải lại trang trong cùng phiên trình duyệt, nội dung chat có thể được phục hồi. Đây chỉ là vùng lưu tạm; lịch sử chính thức vẫn được backend lưu trong database.

### Gửi câu hỏi

Hàm `handleSend()` tại `web-fe/src/pages/Chat.tsx:356` thực hiện:

1. Lấy nội dung người dùng nhập.
2. Không gửi nếu nội dung rỗng.
3. Không cho gửi thêm nếu AI đang xử lý câu trước.
4. Hiển thị ngay tin nhắn của người dùng.
5. Gọi `chatApi.sendMessage()`.
6. Chờ backend trả kết quả.
7. Thêm câu trả lời AI vào màn hình.

Kết quả có thể chứa nội dung trả lời, mã cuộc trò chuyện, danh sách tour, các điểm đến gợi ý và trạng thái đã đủ thông tin hay chưa.

### Hiển thị tour và câu hỏi tiếp theo

`TourCarousel` tại `web-fe/src/pages/Chat.tsx:163` hiển thị tour theo dạng thẻ kéo ngang. Mỗi thẻ có thể chứa ảnh, tên, điểm đến, giá, thời gian và đánh giá.

Khi người dùng bấm vào tour, `handleTourCardClick()` tại `web-fe/src/pages/Chat.tsx:437` gửi hành động đó tới backend để hệ thống học sở thích.

Các nút hỏi tiếp tại `web-fe/src/pages/Chat.tsx:656` cho phép xem lịch trình từng ngày, tìm tour rẻ hơn hoặc hỏi về đặc sản. Những câu này được gửi vào cùng cuộc trò chuyện nên hệ thống có thể dựa trên danh sách tour trước đó để trả lời.

Trang Chat yêu cầu đăng nhập để hệ thống xác định người đang trò chuyện, sở thích và lịch sử thuộc về tài khoản nào.

## 3. File giao tiếp với backend

### File `web-fe/src/api/index.ts`

Phần chat nằm tại `web-fe/src/api/index.ts:242`.

```ts
chatApi.sendMessage(message, sessionId)
```

Hàm gửi câu hỏi và mã cuộc trò chuyện tới `POST /api/chat`. Sau khi nhận kết quả, file làm sạch dữ liệu tour để giao diện nhận được cấu trúc thống nhất.

File còn có `chatApi.getHistory(sessionId)` để lấy lịch sử từ backend. Tuy nhiên, trang Chat hiện chủ yếu phục hồi từ `sessionStorage`, chưa tự gọi hàm này khi mở trang.

### File `web-fe/src/types/index.ts`

Cấu trúc tin nhắn tại `web-fe/src/types/index.ts:140` gồm mã tin nhắn, người gửi, nội dung, thời gian, các điểm đến gợi ý, danh sách tour và trạng thái đã đủ thông tin hay chưa.

## 4. Backend quản lý cuộc trò chuyện

### File `web-be/src/routes/chat.ts`

File khai báo:

```text
POST /api/chat
GET  /api/chat/history
```

- `POST /api/chat`: gửi câu hỏi mới.
- `GET /api/chat/history`: lấy lịch sử trò chuyện.

Cả hai yêu cầu đăng nhập. Đường dẫn được đăng ký tại `web-be/src/index.ts:71`.

### File `web-be/src/controllers/chat.ts`

Đây là cầu nối giữa giao diện và AI Service.

Hàm `chat()` tại `web-be/src/controllers/chat.ts:30` nhận mã người dùng, câu hỏi và mã cuộc trò chuyện. Nếu chưa có cuộc trò chuyện, backend tạo một dòng trong bảng `chat_sessions`.

Backend tạo vùng nhớ tạm tại `web-be/src/controllers/chat.ts:28`, gồm:

- Mã cuộc trò chuyện.
- Những thông tin đã hiểu từ các câu trước.
- Các tour vừa gợi ý.
- Các tin nhắn gần nhất.

Trước khi gọi AI, backend lưu câu hỏi vào bảng `chat_messages` tại `web-be/src/controllers/chat.ts:54`. Backend chỉ giữ tối đa tám tin nhắn gần nhất trong vùng nhớ tạm để AI hiểu nội dung tiếp theo mà không phải đọc lịch sử quá dài.

Backend gọi `POST /ai/chat` với dữ liệu tại `web-be/src/controllers/chat.ts:61`:

- `user_id`: người đang hỏi.
- `message`: câu hỏi mới.
- `session_id`: mã cuộc trò chuyện.
- `current_slots`: các thông tin đã hiểu.
- `last_recommendations`: các tour vừa gợi ý.
- `recent_messages`: các tin nhắn gần nhất.

Có thể hiểu `current_slots` là tờ ghi chú nhu cầu của khách:

```json
{
  "destination": "Đà Lạt",
  "duration": 3,
  "budget_max": 5000000,
  "companions": ["couple"],
  "preferences": ["photography", "relax"]
}
```

Người dùng không cần cung cấp toàn bộ nhu cầu trong một câu. Backend ghép thông tin mới vào thông tin cũ qua từng lượt chat.

Sau khi AI trả kết quả, backend lưu câu trả lời, cập nhật thông tin đã hiểu, ghi nhớ danh sách tour mới nhất và trả dữ liệu về giao diện.

Hàm `getChatHistory()` tại `web-be/src/controllers/chat.ts:123` đọc lịch sử từ database và chỉ trả dữ liệu thuộc tài khoản đang đăng nhập.

## 5. File điều khiển chính của AI Service

### File `ai-service/app/main.py`

Đây là file kết nối phần hiểu câu hỏi, lấy nhu cầu, tìm tour, sắp xếp tour, viết câu trả lời và database.

Tại `ai-service/app/main.py:54`, hệ thống chọn DeepSeek nếu được cấu hình và có khóa; nếu không thì thử Gemini; nếu cả hai không hoạt động thì dùng câu trả lời dự phòng trong code.

Các đường dẫn AI yêu cầu mã bí mật tại `ai-service/app/main.py:76`. Frontend không gọi trực tiếp AI Service. Luồng đúng là:

```text
Frontend → Backend → AI Service
```

### Xử lý một câu hỏi

Đường xử lý chính nằm tại `ai-service/app/main.py:494`.

**Bước 1: Nhận nội dung cũ.** AI Service nhận nhu cầu đã hiểu, danh sách tour vừa gợi ý và các tin nhắn gần nhất. Nhờ vậy nó hiểu các câu như “tour thứ hai có gì hay?” hoặc “có tour nào rẻ hơn?”.

**Bước 2: Xác định mục đích câu hỏi.** Tại `ai-service/app/main.py:505`, hệ thống nhận biết người dùng đang tìm mới, thay đổi yêu cầu, hỏi về tour cũ, so sánh tour, nói cảm ơn hoặc hỏi nội dung không liên quan.

**Bước 3: Lấy nhu cầu.** Tại `ai-service/app/main.py:564`, hệ thống tìm điểm đến, số ngày, ngân sách, người đi cùng, sở thích và mùa muốn đi.

Ví dụ câu “Tôi muốn đi Đà Lạt 3 ngày với người yêu, ngân sách khoảng 5 triệu, thích check-in” có thể được hiểu thành Đà Lạt, 3 ngày, tối đa 5 triệu, đi theo cặp đôi và thích chụp ảnh.

**Bước 4: Hỏi thêm.** Nếu chưa có điểm đến, hệ thống hỏi thêm tại `ai-service/app/main.py:579`. Nếu người dùng chỉ nói thích biển hoặc nghỉ dưỡng, hệ thống có thể gợi ý các điểm đến phù hợp.

**Bước 5: Tạo điều kiện tìm tour.** Hàm `_build_filters()` tại `ai-service/app/main.py:385` tạo điều kiện theo điểm đến, giá và số ngày.

**Bước 6: Nới điều kiện.** Hàm `_recommend_with_relaxation()` tại `ai-service/app/main.py:460` lần lượt thử bỏ số ngày chính xác, bỏ giới hạn ngân sách và mở rộng điểm đến nếu không tìm thấy tour. Hệ thống thông báo rõ khi kết quả đã được nới điều kiện.

**Bước 7: Viết câu trả lời.** Sau khi có danh sách tour, hệ thống gọi `ConversationAgent` tại `ai-service/app/main.py:612` và trả nội dung tư vấn cùng danh sách tour.

## 6. File hiểu câu hỏi và viết câu trả lời

### File `ai-service/app/llm/conversation_agent.py`

File xác định người dùng đang muốn làm gì và viết câu trả lời giống nhân viên tư vấn.

Các trường hợp tại `ai-service/app/llm/conversation_agent.py:11` gồm:

- `new_search`: tìm tour mới.
- `refine_search`: thay đổi yêu cầu.
- `acknowledgement`: nói “ok”, “được”, “cảm ơn”.
- `answer_about_recommendation`: hỏi về tour vừa gợi ý.
- `compare_recommendations`: so sánh tour.
- `ask_missing_info`: cần hỏi thêm.
- `out_of_scope`: câu hỏi ngoài chức năng.

Ví dụ:

- “Tìm tour Đà Lạt 3 ngày” → tìm mới.
- “Tăng ngân sách lên 7 triệu” → thay đổi yêu cầu.
- “Tour 1 có phù hợp gia đình không?” → hỏi về kết quả trước.

Tại `ai-service/app/llm/conversation_agent.py:33`, file yêu cầu câu trả lời bằng tiếng Việt, câu ngắn, dễ đọc, không phóng đại, không bịa thông tin và trình bày giá theo tiền Việt Nam.

Khi người dùng hỏi “tour 2 có đáng tiền không?”, `write_context_answer()` chỉ dùng dữ liệu tour thứ hai để trả lời, không tìm danh sách mới.

Nếu DeepSeek hoặc Gemini lỗi, file có cách nhận biết câu hỏi bằng từ khóa tại `ai-service/app/llm/conversation_agent.py:571` và có câu trả lời dự phòng.

## 7. File lấy nhu cầu từ câu nói

### File `ai-service/app/llm/slot_filling.py`

File biến câu nói tự nhiên thành thông tin cụ thể để tìm tour.

Ví dụ:

```text
Tôi muốn đi biển 4 ngày cùng gia đình, chi phí dưới 8 triệu.
```

Được tách thành:

```text
Thời gian: 4 ngày
Ngân sách tối đa: 8 triệu
Người đi cùng: gia đình
Sở thích: biển
```

Tại `ai-service/app/llm/slot_filling.py:80`, file tìm điểm đến, thời gian, ngân sách, người đi cùng, sở thích và mùa du lịch.

File nhận cả thông tin cũ và câu mới nên có thể ghép nhu cầu qua nhiều lượt chat.

Hàm `is_complete()` tại `ai-service/app/llm/slot_filling.py:307` hiện chỉ kiểm tra đã có điểm đến hay chưa. Có điểm đến là hệ thống có thể bắt đầu gợi ý tour dù chưa biết số ngày hoặc ngân sách.

## 8. File tìm và sắp xếp tour

### File `ai-service/app/engine/engine_db.py`

File trực tiếp đọc database và lựa chọn tour:

1. Lấy sở thích người dùng.
2. Lọc tour theo điểm đến, giá và số ngày.
3. So sánh sở thích với đặc điểm từng tour.
4. Sắp xếp tour phù hợp lên trước.
5. Trả về các tour tốt nhất.

Tại `ai-service/app/engine/engine_db.py:72`, hệ thống đọc sở thích từ bảng `user_preferences`.

Mỗi tour có các đặc điểm trong bảng `tour_tags`, ví dụ biển, gia đình, nghỉ dưỡng, ẩm thực, lịch sử hoặc check-in. Nếu người dùng thích biển và nghỉ dưỡng, tour Phú Quốc có khả năng được xếp cao hơn tour leo núi.

Tại `ai-service/app/engine/engine_db.py:88`, hệ thống lọc theo điểm đến hoặc tên tour, giá và số ngày.

Nếu tour có ít đánh giá, phần xử lý tại `ai-service/app/engine/engine_db.py:120` đọc mô tả để đoán thêm đặc điểm. Nhờ đó tour mới vẫn có cơ hội được gợi ý.

Người dùng chưa có sở thích được xử lý tại `ai-service/app/engine/engine_db.py:362`. Hệ thống tạm đoán sở thích từ câu hỏi; nếu chưa đủ, nó lấy các tour phổ biến và được đánh giá tốt nhưng vẫn giữ điều kiện tìm kiếm.

## 9. Mô hình sắp xếp tour

### File `ai-service/app/engine/ml_ranker.py`

File tải mô hình từ:

```text
ai-service/app/models/tour_recommender_model.pkl
```

Mô hình xem xét mức hợp sở thích, điểm đến, ngân sách, số ngày, giá, thời lượng, điểm đánh giá và số lượt đánh giá.

Kết quả cuối kết hợp 70% điểm từ mô hình đã huấn luyện và 30% mức giống nhau giữa sở thích người dùng với đặc điểm tour.

Nếu file mô hình bị thiếu hoặc không đọc được, hệ thống vẫn hoạt động bằng cách so sánh sở thích và đặc điểm tour theo cách thông thường.

## 10. Vai trò của DeepSeek và Gemini

### File `ai-service/app/llm/deepseek.py`

File gửi hướng dẫn và dữ liệu tour tới DeepSeek, nhận câu trả lời tiếng Việt, giới hạn thời gian chờ, phát hiện lỗi giới hạn sử dụng và chuyển sang cách trả lời dự phòng khi cần.

DeepSeek không tự đọc database. Dữ liệu tour phải được hệ thống chuẩn bị trước.

### File `ai-service/app/llm/gemini.py`

File có vai trò tương tự nhưng dùng Gemini. Cấu hình lựa chọn nằm trong `ai-service/app/config.py`.

### Cách hoạt động thực tế hiện tại

Trong `ai-service/app/main.py:51`, phần lấy điểm đến, số ngày, ngân sách và sở thích được khởi tạo mà không truyền DeepSeek hoặc Gemini vào.

Trong `ai-service/app/main.py:60` và `ai-service/app/main.py:69`, DeepSeek hoặc Gemini chủ yếu được dùng để viết câu trả lời.

Vì vậy:

- Việc hiểu điểm đến, số ngày và ngân sách chủ yếu dựa trên từ khóa và quy tắc trong code.
- DeepSeek hoặc Gemini chủ yếu làm câu trả lời tự nhiên hơn.
- Nếu AI bên ngoài lỗi, hệ thống vẫn có thể tìm tour và trả lời cơ bản.

## 11. Hệ thống học sở thích

### File `web-be/src/controllers/actions.ts`

Backend lưu các hành động vào bảng `user_actions`:

- `click`: bấm vào tour.
- `view`: xem tour.
- `save`: lưu tour yêu thích.
- `search`: tìm kiếm.

Sau khi lưu, backend gửi thông tin sang AI Service để cập nhật sở thích.

Tại `ai-service/app/engine/engine_db.py:411`, mức ảnh hưởng là:

- Lưu tour: `0.7`.
- Bấm vào tour: `0.35`.
- Tìm kiếm: `0.18`.
- Chỉ xem: `0`.

Nếu người dùng thường lưu tour biển, mức quan tâm đến biển và nghỉ dưỡng tăng. Các lần tư vấn sau, tour biển có khả năng được xếp cao hơn.

## 12. Các bảng database liên quan

Các bảng được mô tả trong `ai-service/app/models/database.py`:

- `tours`: lưu tên, điểm đến, giá, số ngày, mô tả, đánh giá, ảnh và lịch trình.
- `tour_tags`: lưu đặc điểm tour như biển, gia đình, nghỉ dưỡng hoặc ẩm thực.
- `user_preferences`: lưu sở thích đã học được của từng người dùng.
- `user_actions`: lưu các hành động bấm, xem, lưu và tìm kiếm.
- `chat_sessions`: lưu từng cuộc trò chuyện.
- `chat_messages`: lưu người gửi, nội dung và thời gian của từng tin nhắn.

## 13. Ví dụ toàn bộ quá trình

Người dùng nhập:

```text
Tôi muốn đi Đà Lạt với người yêu.
```

Hệ thống thực hiện:

1. `Chat.tsx` hiển thị câu hỏi.
2. `chatApi` gửi câu hỏi đến backend.
3. Backend tạo phiên và lưu câu hỏi.
4. Backend gửi câu hỏi cùng nội dung cũ sang AI Service.
5. `conversation_agent.py` nhận biết đây là yêu cầu tìm tour.
6. `slot_filling.py` lấy điểm đến Đà Lạt và người đi cùng là cặp đôi.
7. `engine_db.py` lấy các tour Đà Lạt.
8. Hệ thống đọc sở thích trước đây của người dùng.
9. `ml_ranker.py` sắp xếp các tour.
10. `conversation_agent.py` viết câu trả lời.
11. Backend lưu câu trả lời.
12. `Chat.tsx` hiển thị lời tư vấn và các thẻ tour.

Nếu người dùng hỏi “tour thứ nhất có gì nổi bật?”, hệ thống dùng tour thứ nhất trong danh sách trước để trả lời, không tìm danh sách mới.

Nếu người dùng hỏi “có tour nào rẻ hơn không?”, hệ thống hiểu đây là thay đổi yêu cầu, cập nhật điều kiện giá rồi tìm lại tour.

## 14. Các điểm cần lưu ý trong phiên bản hiện tại

### Cuộc trò chuyện mới chưa tách hoàn toàn ở backend

Nút “Cuộc trò chuyện mới” tại `web-fe/src/pages/Chat.tsx:340` xóa dữ liệu trên giao diện và đặt `sessionId` về rỗng. Tuy nhiên, backend vẫn giữ vùng nhớ tạm cho người dùng tại `web-be/src/controllers/chat.ts:28`. Giao diện có thể trông như chat mới nhưng backend vẫn còn nhớ nội dung cũ.

### Backend khởi động lại sẽ mất phần ghi nhớ tạm

Tin nhắn vẫn còn trong database, nhưng điều kiện đã hiểu, danh sách tour vừa gợi ý và tám tin nhắn gần nhất đang nằm trong bộ nhớ backend. Khi backend khởi động lại, phần này bị mất và chưa tự phục hồi từ database.

### Giao diện chưa tự tải lịch sử từ database

Backend đã có chức năng lấy lịch sử và frontend có `chatApi.getHistory()`, nhưng `Chat.tsx` hiện chủ yếu phục hồi từ `sessionStorage`. Người dùng đăng nhập trên máy hoặc trình duyệt khác chưa tự thấy lịch sử chat cũ.

### Hệ thống chỉ bắt buộc điểm đến

Mặc dù hệ thống có thể đọc số ngày và ngân sách, `is_complete()` hiện chỉ yêu cầu điểm đến. Câu “tìm tour Đà Lạt” đã có thể làm hệ thống gợi ý dù chưa biết số ngày và ngân sách.

### Sở thích trong câu chat chưa được dùng đầy đủ

Hệ thống có thể nhận biết sở thích như biển, nghỉ dưỡng, ẩm thực hoặc check-in. Tuy nhiên, phần tạo điều kiện tại `ai-service/app/main.py:385` tập trung chủ yếu vào điểm đến, giá và số ngày.

Sở thích được dùng trong việc gợi ý điểm đến và hồ sơ sở thích đã lưu, nhưng chưa được truyền đầy đủ vào mọi lần sắp xếp tour trực tiếp từ nội dung chat.

## 15. Kết luận

Chức năng tư vấn AI là sự kết hợp của ba nhóm công việc:

1. **Trò chuyện:** ghi nhớ câu trước và xác định người dùng đang tìm mới hay hỏi tiếp.
2. **Chọn tour:** lọc tour từ database và sắp xếp tour phù hợp lên trước.
3. **Viết câu trả lời:** DeepSeek hoặc Gemini biến dữ liệu thành lời tư vấn tiếng Việt tự nhiên.

Điểm tốt của thiết kế này là AI bên ngoài không tự bịa danh sách tour. Tour vẫn được lấy từ database. Nếu AI bên ngoài gặp lỗi, hệ thống vẫn có thể tiếp tục hoạt động bằng các quy tắc, dữ liệu và câu trả lời dự phòng có sẵn.

---

## 16. AI được xây dựng và quyết định kết quả như thế nào?

Nếu được hỏi AI của dự án được xây dựng như thế nào, cần giải thích rằng đây không phải là một AI duy nhất tự làm tất cả công việc. Hệ thống được kết hợp từ nhiều phần:

1. Phần đọc hiểu câu hỏi của người dùng.
2. Phần lọc các tour không phù hợp.
3. Phần học máy dùng để chấm điểm và xếp hạng tour.
4. DeepSeek hoặc Gemini dùng để viết kết quả thành lời tư vấn tự nhiên.

Có thể tóm tắt:

```text
Câu hỏi người dùng
        ↓
Lấy điểm đến, ngân sách, số ngày và sở thích
        ↓
Lọc tour trong database
        ↓
Đọc sở thích đã học được của người dùng
        ↓
Random Forest chấm điểm các tour
        ↓
Sắp xếp tour theo điểm từ cao xuống thấp
        ↓
DeepSeek hoặc Gemini viết lời tư vấn
```

### 16.1. File tạo dữ liệu huấn luyện

#### File `scripts/generate_synthetic_tour_dataset.py`

Đây là file tạo bộ dữ liệu ban đầu để huấn luyện mô hình gợi ý tour.

File tạo ra:

- Người dùng mô phỏng.
- Tour mô phỏng.
- Sở thích của từng người dùng.
- Các hành động xem, bấm và lưu tour.
- Các cặp người dùng - tour.
- Kết quả người dùng có khả năng thích tour hay không.

Phần quan trọng nằm tại `scripts/generate_synthetic_tour_dataset.py:230`.

File tính mức phù hợp của một người dùng với một tour theo công thức:

```text
42%: Sở thích người dùng có giống đặc điểm tour không
18%: Tour có đúng điểm đến yêu thích không
16%: Tour có nằm trong ngân sách không
14%: Số ngày có phù hợp không
10%: Điểm đánh giá của tour
```

Công thức trong code:

```python
0.42 * tag_score
+ 0.18 * destination_score
+ 0.16 * price_score
+ 0.14 * duration_score
+ 0.10 * rating_score
```

Sau đó file thêm một mức thay đổi ngẫu nhiên để dữ liệu không hoàn toàn giống nhau.

Nếu kết quả từ `0.58` trở lên, cặp người dùng - tour được đánh dấu:

```text
label = 1
```

Nghĩa là người dùng có khả năng thích hoặc có tương tác tích cực với tour.

Nếu nhỏ hơn `0.58`:

```text
label = 0
```

Nghĩa là tour chưa đủ phù hợp với người dùng đó.

### 16.2. Dữ liệu dùng để huấn luyện

#### File `datasets/synthetic_tour_recommendation/training_interactions.csv`

Đây là file dữ liệu chính dùng để huấn luyện mô hình. Phiên bản hiện tại có khoảng 8.400 cặp người dùng - tour.

Mỗi dòng chứa:

- `tag_similarity`: sở thích người dùng giống đặc điểm tour đến mức nào.
- `destination_match`: tour có đúng điểm đến không.
- `price_match`: giá tour có nằm trong ngân sách không.
- `duration_match`: số ngày có khớp không.
- `price`: giá tour.
- `duration`: số ngày của tour.
- `avg_rating`: điểm đánh giá.
- `review_count`: số lượt đánh giá.
- `budget_max`: ngân sách tối đa.
- `preferred_duration`: số ngày mong muốn.
- `label`: người dùng có khả năng thích tour hay không.

Ví dụ:

```text
Người dùng thích thành phố, ẩm thực và chụp ảnh.
Tour đúng ngân sách, đúng số ngày và được đánh giá tốt.
→ label = 1
```

Mô hình học từ nhiều ví dụ như vậy để nhận biết các trường hợp tương tự.

### 16.3. File huấn luyện mô hình

#### File `notebooks/tour_recommender_training_colab.ipynb`

Đây là notebook dùng để huấn luyện mô hình trên Google Colab.

Notebook thực hiện:

1. Đọc `training_interactions.csv`.
2. Chọn các thông tin dùng để học.
3. Chia 80% dữ liệu để huấn luyện và 20% để kiểm tra.
4. Tạo mô hình Random Forest.
5. Cho mô hình học từ dữ liệu.
6. Kiểm tra khả năng dự đoán.
7. Lưu mô hình thành file `.pkl`.

Mô hình được cấu hình:

```python
RandomForestClassifier(
    n_estimators=300,
    max_depth=10,
    min_samples_leaf=4,
    random_state=42,
    class_weight='balanced',
    n_jobs=-1,
)
```

Có thể giải thích đơn giản rằng mô hình tạo ra 300 cách đánh giá nhỏ. Mỗi cách xem xét giá, số ngày, điểm đến, đánh giá và sở thích. Kết quả của các cách đánh giá được tổng hợp để tính khả năng người dùng thích tour.

Mô hình sau khi học được lưu thành:

```text
tour_recommender_model.pkl
```

### 16.4. File mô hình đã học

#### File `ai-service/app/models/tour_recommender_model.pkl`

Đây là mô hình Random Forest đã được huấn luyện xong. File không chứa code thông thường mà chứa những gì mô hình đã học được từ dữ liệu.

Khi hệ thống chạy thật, nó không huấn luyện lại mỗi khi người dùng hỏi. Hệ thống chỉ tải file này lên và dùng nó để chấm điểm tour.

File được tải tại `ai-service/app/engine/ml_ranker.py:18`.

Dự án còn có:

```text
ai-service/app/models/tour_recommender_xgb.pkl
```

Đây là mô hình XGBoost thử nghiệm. Tuy nhiên, code đang chạy mặc định sử dụng `tour_recommender_model.pkl`, tức mô hình Random Forest.

### 16.5. File quyết định người dùng đang muốn gì

#### File `ai-service/app/llm/conversation_agent.py`

File xác định mục đích câu hỏi:

- Tìm tour mới.
- Thay đổi yêu cầu.
- Hỏi thêm về tour trước.
- So sánh các tour.
- Chỉ nói “ok” hoặc “cảm ơn”.
- Cần hỏi thêm thông tin.
- Câu hỏi ngoài chức năng.

Ví dụ:

```text
Tìm tour Đà Lạt 3 ngày
```

Được hiểu là tìm mới.

```text
Có tour nào rẻ hơn không?
```

Được hiểu là thay đổi yêu cầu hiện tại.

```text
Tour 2 có phù hợp với gia đình không?
```

Được hiểu là hỏi về danh sách tour trước đó.

Phần nhận biết dự phòng nằm tại `ai-service/app/llm/conversation_agent.py:571`.

#### File `ai-service/app/llm/slot_filling.py`

File lấy các thông tin cụ thể từ câu hỏi.

Ví dụ:

```text
Tôi muốn đi Đà Lạt 3 ngày với người yêu,
ngân sách dưới 5 triệu, thích check-in.
```

Được tách thành:

```text
Điểm đến: Đà Lạt
Số ngày: 3
Ngân sách tối đa: 5.000.000 đồng
Người đi cùng: cặp đôi
Sở thích: chụp ảnh
```

Phần lấy thông tin nằm tại `ai-service/app/llm/slot_filling.py:60`.

Theo cách khởi tạo hiện tại, phần lấy điểm đến, số ngày và ngân sách chủ yếu dựa trên danh sách từ khóa và các quy tắc trong code. DeepSeek hoặc Gemini chưa trực tiếp quyết định toàn bộ phần này.

### 16.6. File lọc các tour được phép tham gia xếp hạng

#### File `ai-service/app/main.py`

Sau khi lấy được nhu cầu, hàm `_build_filters()` tại `ai-service/app/main.py:385` chuyển chúng thành điều kiện tìm kiếm.

Ví dụ:

```json
{
  "destination": "Đà Lạt",
  "max_price": 5000000,
  "duration": 3
}
```

Những tour không vượt qua bước lọc sẽ không được mô hình Random Forest chấm điểm.

Ví dụ, người dùng yêu cầu tour Đà Lạt dưới 5 triệu:

- Tour Phú Quốc bị loại vì sai điểm đến.
- Tour Đà Lạt 8 triệu bị loại vì vượt ngân sách.
- Chỉ các tour phù hợp điều kiện mới được đưa sang bước xếp hạng.

Vì vậy, thứ tự xử lý là:

```text
Lọc tour trước
→ Sau đó mới dùng mô hình để xếp hạng
```

### 16.7. File trực tiếp lựa chọn tour

#### File `ai-service/app/engine/engine_db.py`

Đây là một trong những file quan trọng nhất quyết định kết quả.

File thực hiện:

1. Đọc sở thích của người dùng.
2. Đọc đặc điểm của tour.
3. Lọc tour theo điều kiện.
4. Tính mức giống nhau giữa người dùng và tour.
5. Gửi tour sang mô hình Random Forest.
6. Trả danh sách đã được sắp xếp.

Hàm `get_user_preferences()` tại `ai-service/app/engine/engine_db.py:72` đọc bảng `user_preferences`.

Ví dụ:

```text
Biển: 0.9
Nghỉ dưỡng: 0.8
Ẩm thực: 0.7
Mạo hiểm: 0.2
```

Hàm `get_tour_tags()` tại `ai-service/app/engine/engine_db.py:80` đọc đặc điểm của tour từ bảng `tour_tags`.

Ví dụ tour Phú Quốc:

```text
Biển: 0.95
Nghỉ dưỡng: 0.85
Ẩm thực: 0.7
Sang trọng: 0.65
```

Phần tính mức giống nhau nằm tại `ai-service/app/engine/engine_db.py:269`.

Có thể giải thích đơn giản:

> Hệ thống đo xem sở thích của người dùng và đặc điểm của tour giống nhau đến mức nào. Hai bên càng giống nhau thì tour càng có điểm cao.

### 16.8. Random Forest chấm điểm tour

#### File `ai-service/app/engine/ml_ranker.py`

File tải mô hình đã huấn luyện và dùng nó để chấm điểm các tour.

Mỗi tour được chuyển thành các thông tin tại `ai-service/app/engine/ml_ranker.py:89`:

- Mức hợp sở thích.
- Có đúng điểm đến không.
- Có đúng ngân sách không.
- Có đúng số ngày không.
- Giá tour.
- Số ngày.
- Điểm đánh giá.
- Số lượt đánh giá.
- Ngân sách người dùng.
- Số ngày người dùng mong muốn.

Mô hình trả về khả năng người dùng thích từng tour, ví dụ:

```text
Tour A: 0.86
Tour B: 0.72
Tour C: 0.58
```

Tour A có khả năng được xếp đầu.

Điểm cuối được tính tại `ai-service/app/engine/ml_ranker.py:146`:

```python
combined_score = 0.7 * ml_score + 0.3 * similarity_score
```

Nghĩa là:

```text
70%: Kết quả từ mô hình Random Forest
30%: Mức giống nhau giữa sở thích người dùng và đặc điểm tour
```

Sau đó hệ thống sắp xếp điểm từ cao xuống thấp tại `ai-service/app/engine/ml_ranker.py:153`.

### 16.9. Quy trình quyết định kết quả hoàn chỉnh

Giả sử người dùng hỏi:

```text
Tìm tour Đà Lạt 3 ngày dưới 5 triệu cho cặp đôi,
ưu tiên nhiều điểm check-in.
```

Hệ thống xử lý:

1. `conversation_agent.py` xác định đây là yêu cầu tìm tour mới.
2. `slot_filling.py` lấy điểm đến, số ngày, ngân sách, người đi cùng và sở thích.
3. `main.py` tạo điều kiện lọc Đà Lạt, 3 ngày, dưới 5 triệu.
4. `engine_db.py` lấy các tour vượt qua điều kiện.
5. `engine_db.py` đọc sở thích đã học được của người dùng.
6. Hệ thống tính mức giống nhau giữa sở thích và từng tour.
7. `ml_ranker.py` gửi thông tin từng tour vào `tour_recommender_model.pkl`.
8. Random Forest trả khả năng người dùng thích từng tour.
9. Hệ thống tính điểm cuối theo tỷ lệ 70% và 30%.
10. Tour có điểm cao nhất được đưa lên đầu.
11. `conversation_agent.py` dùng DeepSeek hoặc Gemini để viết lời tư vấn.

### 16.10. DeepSeek hoặc Gemini có quyết định tour không?

Câu trả lời chính xác là:

> DeepSeek hoặc Gemini không phải thành phần chính quyết định tour đứng đầu. Chúng chủ yếu viết câu trả lời dựa trên kết quả đã được hệ thống lọc và xếp hạng.

Các file liên quan:

- `ai-service/app/llm/deepseek.py`
- `ai-service/app/llm/gemini.py`
- `ai-service/app/llm/conversation_agent.py`

Nếu DeepSeek hoặc Gemini bị lỗi, hệ thống vẫn có thể chọn tour. Phần câu trả lời chỉ trở nên đơn giản hơn vì hệ thống phải dùng nội dung dự phòng trong code.

### 16.11. Hệ thống học sở thích người dùng

File `web-be/src/controllers/actions.ts` ghi nhận các hành động:

- Bấm vào tour.
- Xem tour.
- Lưu tour.
- Tìm kiếm.

Hàm `update_user_preferences()` tại `ai-service/app/engine/engine_db.py:404` cập nhật sở thích với mức ảnh hưởng:

```text
Lưu tour: 0.70
Bấm tour: 0.35
Tìm kiếm: 0.18
Chỉ xem: 0
```

Nếu người dùng lưu một tour có đặc điểm biển, nghỉ dưỡng và ẩm thực, hệ thống tăng mức quan tâm đối với các đặc điểm đó. Những lần tư vấn sau, các tour tương tự có khả năng được xếp cao hơn.

### 16.12. Người dùng mới được tư vấn như thế nào?

Nếu người dùng chưa có lịch sử, bảng `user_preferences` chưa có dữ liệu.

Phần xử lý nằm tại `ai-service/app/engine/engine_db.py:362`.

Hệ thống:

1. Dùng câu hỏi hiện tại để tạm đoán sở thích.
2. Dùng điểm đến để liên kết với một số đặc điểm thường gặp.
3. Dùng mô hình để chấm điểm nếu có đủ thông tin.
4. Nếu vẫn chưa đủ, lấy các tour phổ biến và được đánh giá tốt.

Ví dụ, Đà Lạt được tạm liên kết với thiên nhiên, chụp ảnh, lãng mạn, nghỉ dưỡng và núi.

### 16.13. Dữ liệu huấn luyện hiện tại

Mô hình hiện tại được huấn luyện chủ yếu từ dữ liệu mô phỏng trong:

```text
datasets/synthetic_tour_recommendation/
```

Bộ dữ liệu gồm khoảng:

- 240 tour mô phỏng.
- 120 người dùng mô phỏng.
- 8.400 cặp người dùng - tour để huấn luyện.
- Các hành động, sở thích và đánh giá mô phỏng.

Dữ liệu này phù hợp để:

- Chứng minh quy trình xây dựng hệ thống gợi ý.
- Kiểm thử cách xếp hạng.
- Làm mô hình demo cho đồ án.
- Chứng minh hệ thống có thể học từ dữ liệu.

Tuy nhiên, chưa thể khẳng định mô hình phản ánh hoàn toàn hành vi khách hàng thật.

Khi có nhiều dữ liệu thật, hướng phát triển là:

1. Thu thập hành động người dùng thật.
2. Dùng dữ liệu bấm, lưu, đặt tour và đánh giá thật.
3. Tạo lại dữ liệu huấn luyện.
4. Huấn luyện lại Random Forest.
5. So sánh mô hình cũ và mới.
6. Thay file `tour_recommender_model.pkl`.

### 16.14. Các file quan trọng theo thứ tự

#### Nhóm xây dựng mô hình

1. `scripts/generate_synthetic_tour_dataset.py`: tạo dữ liệu và cách đánh dấu tour phù hợp.
2. `datasets/synthetic_tour_recommendation/training_interactions.csv`: dữ liệu mô hình học.
3. `notebooks/tour_recommender_training_colab.ipynb`: huấn luyện Random Forest.
4. `ai-service/app/models/tour_recommender_model.pkl`: mô hình đã học xong.

#### Nhóm quyết định khi người dùng hỏi

1. `ai-service/app/llm/conversation_agent.py`: xác định người dùng đang muốn làm gì.
2. `ai-service/app/llm/slot_filling.py`: lấy điểm đến, ngân sách, số ngày và sở thích.
3. `ai-service/app/main.py`: điều khiển quá trình và tạo điều kiện lọc.
4. `ai-service/app/engine/engine_db.py`: lấy tour, đọc sở thích và chuẩn bị danh sách.
5. `ai-service/app/engine/ml_ranker.py`: dùng Random Forest để chấm điểm và xếp hạng.
6. `ai-service/app/models/tour_recommender_model.pkl`: chứa những gì mô hình đã học.
7. `ai-service/app/llm/deepseek.py` hoặc `gemini.py`: viết kết quả thành lời tư vấn tự nhiên.

### 16.15. Câu trả lời mẫu khi bảo vệ

Nếu được hỏi “AI của em được xây dựng và quyết định kết quả như thế nào?”, có thể trả lời:

> Hệ thống AI tư vấn của em được xây dựng theo mô hình kết hợp. Đầu tiên, hệ thống phân tích câu hỏi để lấy điểm đến, ngân sách, số ngày và sở thích. Sau đó hệ thống lọc các tour trong database theo các điều kiện bắt buộc. Các tour còn lại được so sánh với hồ sơ sở thích của người dùng và được mô hình Random Forest chấm điểm. Điểm cuối gồm 70% kết quả Random Forest và 30% mức tương đồng giữa sở thích người dùng với đặc điểm tour. Tour có điểm cao nhất được đưa lên đầu. Cuối cùng, DeepSeek hoặc Gemini nhận dữ liệu của tour đã chọn để viết thành lời tư vấn tự nhiên. Vì vậy, DeepSeek hoặc Gemini không tự quyết định hoặc tự bịa tour; kết quả chính được quyết định bởi dữ liệu, điều kiện lọc, hồ sơ người dùng và mô hình Random Forest.

Nếu được hỏi mô hình học từ đâu, có thể trả lời:

> Mô hình Random Forest được huấn luyện trong notebook Colab từ file `training_interactions.csv`. Mỗi dòng là một cặp người dùng - tour, gồm mức hợp sở thích, điểm đến, ngân sách, số ngày, giá và đánh giá. Phiên bản hiện tại dùng dữ liệu mô phỏng để chứng minh đầy đủ quy trình AI. Khi hệ thống có đủ dữ liệu người dùng thật, có thể huấn luyện lại mô hình bằng hành động bấm, lưu, đặt tour và đánh giá thật.

Nếu được hỏi thành phần nào quyết định kết quả nhiều nhất, có thể trả lời:

> Điều kiện lọc quyết định tour nào được tham gia xếp hạng. Sau đó `engine_db.py`, `ml_ranker.py` và file mô hình `tour_recommender_model.pkl` quyết định thứ tự tour. DeepSeek hoặc Gemini chủ yếu quyết định cách diễn đạt câu trả lời, không quyết định danh sách tour chính.
