# Hướng dẫn thu thập dữ liệu trực tiếp từ Reddit API

Khi Pushshift API không khả dụng (lỗi 403/404), bạn có thể sử dụng phương pháp này để thu thập dữ liệu trực tiếp từ Reddit API chính thức.

## Giới thiệu

Reddit API chính thức có những hạn chế sau:
- Giới hạn ở 1000 bài viết mới nhất cho mỗi subreddit
- Giới hạn rate: 60 request/phút mỗi tài khoản

Tuy nhiên, chương trình của chúng ta đã có các cơ chế để xử lý những hạn chế này:
- Xoay vòng tài khoản để vượt qua giới hạn rate
- Xoay vòng proxy để tránh giới hạn IP
- Lấy dữ liệu theo nhiều trang để tối đa hóa số lượng bài viết

## Các lệnh thu thập dữ liệu

### 1. Thu thập cho một subreddit

```bash
# Chỉnh sửa tên subreddit trong file scripts/direct-reddit-historical.js
# Tìm dòng: const SUBREDDIT = 'cryptocurrency';
# Thay đổi thành subreddit bạn muốn

# Chạy lệnh
npm run direct-crawl
```

### 2. Thu thập cho nhiều subreddit (theo batch)

```bash
# Chỉnh sửa danh sách subreddit trong file scripts/direct-batch-reddit.js
# Tìm mảng ALL_SUBREDDITS và thêm 71 subreddit của bạn vào đó

# Chạy lệnh
npm run direct-batch
```

## Cấu hình

Cả hai script đều có các tham số cấu hình tương tự:

### Cấu hình thu thập bài viết

```javascript
// Số ngày cần thu thập dữ liệu
const DAYS_TO_COLLECT = 30;

// Số bài viết mỗi trang
const POSTS_PER_PAGE = 100;

// Số trang tối đa mỗi subreddit
const MAX_PAGES = 10;

// Loại sắp xếp: 'new', 'hot', 'top'
const SORT_BY = 'new';

// Khoảng thời gian cho sắp xếp 'top': 'day', 'week', 'month', 'year', 'all'
const TIME_RANGE = 'month';
```

### Cấu hình thu thập comments

```bash
# Bật thu thập comments
export CRAWL_COMMENTS=true

# Tắt thu thập comments
export CRAWL_COMMENTS=false
```

### Cấu hình batch (chỉ áp dụng cho direct-batch)

```javascript
// Số lượng subreddit trong mỗi batch
const BATCH_SIZE = 5;

// Thời gian chờ giữa các batch (milliseconds)
const BATCH_DELAY = 10 * 60 * 1000; // 10 phút
```

## Khả năng phục hồi

Cả hai script đều có cơ chế phục hồi:

1. **direct-crawl**: 
   - Nếu gặp lỗi khi thu thập một trang, đợi 30 giây và thử lại
   - Ghi log chi tiết vào thư mục `/logs`

2. **direct-batch**:
   - Ghi nhớ subreddit đã xử lý thành công
   - Nếu script bị gián đoạn, khi chạy lại sẽ tiếp tục với các subreddit chưa xử lý
   - Xử lý lỗi riêng cho từng subreddit, không ảnh hưởng đến cả batch

## Ưu và nhược điểm

### Ưu điểm
- Dữ liệu luôn mới và chính xác
- Comments luôn đầy đủ
- Không phụ thuộc vào dịch vụ bên thứ ba như Pushshift

### Nhược điểm
- Chỉ lấy được tối đa 1000 bài viết mỗi subreddit
- Cần nhiều tài khoản Reddit để xoay vòng hiệu quả
- Thời gian thu thập lâu hơn, đặc biệt khi lấy comments

## Ví dụ kết quả

Đối với mỗi subreddit, dữ liệu sẽ được lưu vào:
- `/data/[subreddit]/reddit_direct_[sort]_[date].json` - File tổng hợp tất cả bài viết
- `/data/[subreddit]/reddit_[sort]_page[N]_[date].json` - File cho mỗi trang
- `/data/[subreddit]/comments/post_[id]_comments.json` - File comments cho mỗi bài viết

## Theo dõi tiến trình

Bạn có thể theo dõi tiến trình thu thập dữ liệu qua các file log:
- `/logs/direct-reddit-historical.log` - Log cho một subreddit
- `/logs/direct-batch.log` - Log cho nhiều subreddit
- `/logs/direct-batch-errors.log` - Log lỗi cho nhiều subreddit
- `/logs/direct-batch-processed.json` - Danh sách subreddit đã xử lý