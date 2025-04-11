# Hướng dẫn Thu thập Dữ liệu cho 71 Subreddit

Tài liệu này hướng dẫn cách thu thập dữ liệu từ nhiều subreddit (71) trong khoảng thời gian 30 ngày, bao gồm cả bài viết và bình luận.

## Phương pháp tiếp cận

Để tránh quá tải API và đảm bảo thu thập dữ liệu đáng tin cậy, chúng tôi sử dụng hai phương pháp:

1. **Phương pháp Batch**: Xử lý các subreddit theo nhóm nhỏ (5 subreddit mỗi lần)
2. **Phương pháp Timeframe**: Chia khoảng thời gian 30 ngày thành giai đoạn nhỏ hơn

## Hướng dẫn Batch (Thu thập theo Nhóm)

Phương pháp này phù hợp khi bạn cần thu thập dữ liệu từ nhiều subreddit cùng lúc.

### Bước 1: Chuẩn bị danh sách subreddit

Mở file `scripts/subreddit-batches.js` và thay thế danh sách `allSubreddits` với 71 subreddit thực của bạn:

```javascript
const allSubreddits = [
  'bitcoin', 'ethereum', 'cryptocurrency',
  // ... thêm các subreddit khác vào đây
];
```

### Bước 2: Điều chỉnh tham số

Bạn có thể điều chỉnh các thông số sau trong file `scripts/subreddit-batches.js`:

```javascript
// Kích thước mỗi batch (số lượng subreddit xử lý trong một lần)
const BATCH_SIZE = 5;

// Thời gian chờ giữa các batch (tính bằng mili giây)
const BATCH_DELAY = 10 * 60 * 1000; // 10 phút
```

### Bước 3: Cấu hình crawl comments

Quyết định xem bạn muốn thu thập bình luận hay không:

```bash
# Thu thập cả comments (mất nhiều thời gian hơn)
export CRAWL_COMMENTS=true

# Chỉ thu thập bài viết (nhanh hơn)
export CRAWL_COMMENTS=false
```

### Bước 4: Chạy quá trình thu thập dữ liệu

```bash
npm run crawl-batch
```

### Tính năng đặc biệt

- **Khả năng phục hồi**: Script ghi lại các subreddit đã xử lý thành công. Nếu quá trình bị gián đoạn, script sẽ tiếp tục với các subreddit còn lại.
- **Ghi log**: Mỗi hoạt động và lỗi đều được ghi vào log, giúp dễ dàng theo dõi tiến trình.
- **Xử lý tuần tự**: Mỗi subreddit trong batch được xử lý tuần tự để đảm bảo ổn định.

## Hướng dẫn Timeframe (Thu thập theo Khung thời gian)

Phương pháp này phù hợp cho subreddit lớn với nhiều dữ liệu.

### Bước 1: Cấu hình subreddit

Mở file `scripts/crawl-by-timeframe.js` và đặt subreddit cụ thể:

```javascript
const SUBREDDIT = 'tên-subreddit-của-bạn';
```

### Bước 2: Điều chỉnh số lượng giai đoạn

```javascript
// Chia thành mấy giai đoạn (mặc định là 3 giai đoạn, mỗi giai đoạn 10 ngày)
const PHASES = 3;
```

### Bước 3: Chạy script

```bash
npm run crawl-timeframe
```

## Chiến lược tổng thể

Để xử lý hiệu quả 71 subreddit, đề xuất các bước sau:

1. **Phân loại**: Chia subreddit thành hai nhóm:
   - Nhóm subreddit lớn (nhiều bài viết/comments)
   - Nhóm subreddit nhỏ và trung bình

2. **Xử lý nhóm subreddit nhỏ và trung bình**:
   ```bash
   # Sử dụng phương pháp batch
   npm run crawl-batch
   ```

3. **Xử lý các subreddit lớn**:
   - Chỉnh sửa file `crawl-by-timeframe.js` cho mỗi subreddit lớn
   - Chạy riêng cho mỗi subreddit lớn:
   ```bash
   npm run crawl-timeframe
   ```

## Kiểm soát quá trình

Bạn có thể sử dụng các công cụ như `tmux`, `screen` hoặc `nohup` để chạy quá trình trên server mà không bị gián đoạn:

```bash
# Sử dụng nohup
nohup npm run crawl-batch > crawl.log 2>&1 &
```

## Tối ưu hiệu suất

- **Thu thập posts trước**: Chạy với `CRAWL_COMMENTS=false` trước, sau đó chạy lại với `CRAWL_COMMENTS=true`
- **Giảm số lượng subreddit trong batch**: Nếu gặp lỗi rate limit, giảm `BATCH_SIZE` xuống 3 hoặc 2
- **Tăng thời gian delay**: Tăng `BATCH_DELAY` nếu cần thiết
- **Thu thập vào giờ thấp điểm**: Nếu có thể, chạy quá trình vào lúc lưu lượng Reddit thấp

## Xử lý lỗi

Nếu gặp lỗi, hãy kiểm tra các file log trong thư mục `/logs`:
- `batch-crawl.log`: Log chung của quá trình
- `batch-crawl-errors.log`: Log lỗi
- `processed-subreddits.json`: Danh sách subreddit đã xử lý thành công