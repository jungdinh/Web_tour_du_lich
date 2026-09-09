# Chiến lược Frontend — TourAI

> Cập nhật implementation thực tế ngày **07/09/2026**.

## 1. Vai trò frontend

Frontend là SPA React/Vite tập trung vào trải nghiệm khám phá và cá nhân hóa, không chứa business secret. Mọi dữ liệu đi qua Web Service REST API.

## 2. Các màn hình chính

- Home: tour phổ biến và gợi ý.
- Search: ô tìm kiếm submit bằng nút, tìm gần đúng không dấu, lọc trong nước/quốc tế, điểm đến, thời lượng, giá và phân trang.
- Tour detail: gallery, rich text, itinerary, schedule, included/excluded, favorite, booking và review.
- Chat: hội thoại và card tour trả về từ API; có context history.
- Account: login/register/OTP/Google, profile, favorites và recommendations.
- Admin: sidebar dashboard, quản lý tour, upload ảnh, quản lý user.
- Payment result: kiểm tra trạng thái booking sau redirect SePay.

## 3. Quyết định UX quan trọng

- Mặc định bộ lọc là tour trong nước.
- Không gọi search API theo từng ký tự; chỉ submit khi người dùng chủ động.
- Rating hiển thị theo 5 sao dù database giữ thang 10 để tương thích dữ liệu crawl.
- Review khách hàng và phản hồi admin có kiểu hiển thị khác nhau.
- Nút xóa/khóa/đổi quyền dùng modal xác nhận nhỏ thay vì bảng cảnh báo toàn màn hình.
- Danh sách admin mặc định sắp xếp tour mới nhất trước.
- Mô tả rich text phải sanitize trước khi dùng `dangerouslySetInnerHTML`.

## 4. Chat và loading

Chat hiện nhận JSON theo request/response, chưa triển khai SSE typing effect. UI nên luôn có trạng thái loading, lỗi và fallback card để provider chậm/quota không làm trang trắng.

Các lỗi như CORS, API URL sai hoặc backend timeout phải được kiểm tra ở Network tab trước khi thay đổi prompt/LLM.

## 5. Booking/payment UX

1. User mở modal đặt tour.
2. Nhập ngày, số khách và thông tin liên hệ.
3. Frontend gửi booking, không tự tính giá cuối cùng để tin cậy.
4. Hiển thị QR trực tiếp hoặc nút mở checkout SePay.
5. Trang `/payment-result` polling booking khi đang pending.
6. Chỉ hiển thị “đã xác nhận” khi backend trả `payment_status=paid`.

## 6. Accessibility và an toàn

- Nút đóng modal có `aria-label` và vùng bấm rõ ràng.
- Modal khóa thao tác khi đang submit.
- Không hiển thị secret backend trong bundle.
- Ảnh có fallback và alt text.
- Không render HTML rich text chưa sanitize.
