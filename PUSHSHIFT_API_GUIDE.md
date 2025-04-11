# Hướng dẫn về Pushshift API và Xử lý Lỗi 403

Tài liệu này giải thích tình trạng của Pushshift API, các vấn đề phổ biến và cách khắc phục.

## Tình trạng Pushshift API

Pushshift API là một dịch vụ bên thứ ba lưu trữ dữ liệu lịch sử Reddit. Gần đây, Pushshift đã trải qua một số thay đổi:

1. Thay đổi endpoint: Một số endpoint cũ không còn hoạt động
2. Giới hạn truy cập: Tăng giới hạn rate limit và yêu cầu User-Agent
3. Thời gian ngừng hoạt động: Có thể gặp lúc API không khả dụng

## Xử lý lỗi 403 (Forbidden)

Nếu bạn nhận được lỗi 403 (Forbidden) từ Pushshift API, hãy thử các giải pháp sau:

### 1. Sử dụng nhiều endpoint

Mã của chúng tôi đã được cập nhật để thử các endpoint khác nhau:
```javascript
const urls = [
  'https://api.pushshift.io/reddit/search/submission',  // API mới nhất
  'https://api.pushshift.io/reddit/submission/search',  // API cũ
  'https://beta.pushshift.io/search/reddit/submissions', // API beta
];
```

### 2. Thêm User-Agent hợp lệ

Pushshift yêu cầu User-Agent hợp lệ, tốt nhất là giống trình duyệt:
```javascript
headers: {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...',
  'Accept': 'application/json'
}
```

### 3. Sử dụng proxy

Nếu địa chỉ IP của bạn bị giới hạn, hãy sử dụng proxy:
```bash
# Đảm bảo USE_PROXIES=true trong cấu hình
export USE_PROXIES=true
```

### 4. Chờ và thử lại

Đôi khi Pushshift API tạm thời không khả dụng. Mã đã được cập nhật để:
- Thử nhiều URL
- Tăng thời gian chờ giữa các yêu cầu
- Tự động thử lại khi gặp lỗi

## Giải pháp thay thế nếu Pushshift không khả dụng

Nếu Pushshift API hoàn toàn không khả dụng, bạn có thể:

### 1. Thu thập trực tiếp từ Reddit API

- Sử dụng Reddit API chính thức (giới hạn 1000 bài viết mới nhất)
- Sử dụng xoay vòng tài khoản Reddit để lấy nhiều dữ liệu hơn

```bash
# Chạy thu thập dữ liệu từ Reddit API
npm run dynamic-crawl
```

### 2. Điều chỉnh thời gian thu thập

- Thu thập dữ liệu trong khoảng thời gian ngắn hơn (1-2 tuần thay vì 30 ngày)
- Chia nhỏ khoảng thời gian thu thập

### 3. Sử dụng lưu trữ web

Nếu muốn xem dữ liệu Reddit trong quá khứ:
- [archive.org](https://archive.org/web/) - Internet Archive
- [timemachine.betamax.app](https://timemachine.betamax.app) - Reddit Time Machine

## Kiểm tra trạng thái Pushshift API

Trước khi chạy thu thập dữ liệu lớn, bạn có thể kiểm tra trạng thái Pushshift API:

```bash
curl -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" https://api.pushshift.io/meta
```

Hoặc kiểm tra bằng script test của chúng tôi:

```bash
npm run test-subreddit
```

## Tài nguyên bổ sung

- [Pushshift API Documentation](https://github.com/pushshift/api)
- [Pushshift Status](https://status.pushshift.io)
- [Reddit API Documentation](https://www.reddit.com/dev/api/)