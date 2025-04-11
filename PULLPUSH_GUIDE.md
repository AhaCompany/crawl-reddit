# Hướng dẫn API PullPush cho Crawling Dữ liệu Reddit

Hướng dẫn này giải thích cách sử dụng API pullpush.io để thu thập dữ liệu Reddit lịch sử như một giải pháp thay thế cho API Pushshift.

## Tổng quan

PullPush.io cung cấp một API để tìm kiếm nội dung Reddit lịch sử (cả bài đăng và bình luận) có thể khả dụng khi API Pushshift thất bại. Nó đặc biệt hữu ích cho:

- Thu thập dữ liệu lịch sử khi API Pushshift trả về lỗi 403 hoặc 404
- Truy xuất dữ liệu từ các khoảng thời gian cụ thể
- Tìm kiếm nội dung cụ thể trên các subreddit

## Thiết lập và Yêu cầu

Không cần xác thực để sử dụng API pullpush.io. Các script sử dụng:

- axios cho các yêu cầu HTTP
- Các thao tác hệ thống tệp tiêu chuẩn

## Các Script Có sẵn

### 1. Script Thử nghiệm cho Một Subreddit

Script `pullpush-test.js` cho phép bạn crawl một subreddit duy nhất cho dữ liệu lịch sử và lưu vào file JSON.

```bash
# Crawl posts only
npm run pullpush-test

# Crawl posts and comments
CRAWL_COMMENTS=true npm run pullpush-test
```

Bạn có thể sửa đổi các biến sau trong script để tùy chỉnh quá trình crawl:
- `SUBREDDIT`: Tên subreddit mục tiêu
- `DAYS_TO_CRAWL`: Số ngày để crawl (mặc định: 30)

### 2. Script Database Integration

Script `pullpush-db.js` cho phép bạn crawl một subreddit và lưu vào cả file JSON và database (bảng dataentity và post_comment_tracking).

```bash
# Crawl posts only
npm run pullpush-db

# Crawl posts and comments
CRAWL_COMMENTS=true npm run pullpush-db

# Specify subreddit and number of days
SUBREDDIT=programming DAYS_TO_CRAWL=10 npm run pullpush-db
```

Cấu hình thêm:
- `SUBREDDIT`: Tên subreddit để crawl (mặc định: AskReddit)
- `DAYS_TO_CRAWL`: Số ngày để crawl (mặc định: 2)

### 3. Script Xử lý Hàng loạt

Script `pullpush-batch.js` cho phép bạn crawl nhiều subreddit theo lô.

```bash
# Crawl posts only
npm run pullpush-batch

# Crawl posts and comments
CRAWL_COMMENTS=true npm run pullpush-batch
```

Các tính năng chính:
- Xử lý subreddit theo kích thước lô có thể cấu hình
- Tiếp tục từ vị trí đã dừng nếu bị gián đoạn
- Duy trì danh sách các subreddit đã xử lý
- Độ trễ có thể cấu hình giữa các yêu cầu, subreddit và lô

## Script Test

Nếu bạn muốn kiểm tra nhanh khả năng lưu vào database:

```bash
# Test lưu số lượng nhỏ records vào dataentity
npm run minimal-pullpush
```

## Các Endpoint API

Các script sử dụng hai endpoint chính:

1. **Submission Search**: `https://api.pullpush.io/reddit/search/submission/`
   - Dùng để tìm kiếm bài đăng Reddit

2. **Comment Search**: `https://api.pullpush.io/reddit/search/comment/`
   - Dùng để tìm kiếm bình luận

## Các Tham số Chính

### Tham số Tìm kiếm Bài đăng

- `subreddit`: Lọc theo subreddit
- `after`: Unix timestamp (giây) cho ngày bắt đầu
- `before`: Unix timestamp (giây) cho ngày kết thúc
- `size`: Số lượng kết quả (tối đa 100)
- `sort`: Thứ tự sắp xếp ('asc' hoặc 'desc')

### Tham số Tìm kiếm Bình luận

- `link_id`: Post ID prefixed with 't3_' (e.g., 't3_abc123')
- `size`: Số lượng kết quả (tối đa 100)
- `sort`: Thứ tự sắp xếp ('asc' hoặc 'desc')

## Lưu trữ Dữ liệu

Dữ liệu được lưu trữ theo nhiều định dạng:

### 1. File JSON
```
data/
  pullpush-data/
    subreddit1/
      posts/
        subreddit1_posts.json
      comments/
        post1_comments.json
        post2_comments.json
        ...
        subreddit1_all_comments.json
    subreddit2/
      ...
```

### 2. Database

Dữ liệu được lưu trong 2 bảng chính trong PostgreSQL:

1. `dataentity` - Lưu trữ tất cả nội dung (posts và comments) với định dạng phù hợp với hệ thống lưu trữ.

2. `post_comment_tracking` - Bảng để theo dõi việc thu thập comment cho mỗi bài viết, hỗ trợ cho hệ thống theo dõi comment tự động.

## Hạn chế

- Tối đa 100 kết quả mỗi yêu cầu
- Không yêu cầu xác thực hoặc khóa API, nhưng hãy tôn trọng tốc độ yêu cầu
- Một số dữ liệu lịch sử có thể bị thiếu so với Pushshift

## Xử lý Lỗi

Các script bao gồm:
- Cơ chế thử lại cho các yêu cầu thất bại
- Ghi log lỗi đúng cách
- Quản lý trạng thái để tiếp tục các quá trình crawl bị gián đoạn

## So sánh với Các Giải pháp Thay thế

| Tính năng | PullPush | Pushshift | API Reddit Trực tiếp |
|---------|----------|----------|-------------------|
| Dữ liệu Lịch sử | Có | Có (khi hoạt động) | Hạn chế |
| Yêu cầu Xác thực | Không | Không | Có |
| Giới hạn Tốc độ | Rộng rãi | Nghiêm ngặt | Rất nghiêm ngặt |
| Kết quả Tối đa/Yêu cầu | 100 | Thay đổi | 100 |
| Truy cập Bình luận | Có | Có | Có |
| Độ tin cậy | Tốt | Không đáng tin cậy gần đây | Tốt |

## Xử lý Sự cố

Nếu bạn gặp vấn đề:

1. **Giới hạn tốc độ**: Tăng độ trễ giữa các yêu cầu
2. **Dữ liệu thiếu**: PullPush có thể không có tất cả dữ liệu lịch sử
3. **Thay đổi định dạng**: Kiểm tra định dạng phản hồi nếu xảy ra lỗi

## Các Thực hành Tốt nhất

- Tôn trọng API bằng cách sử dụng độ trễ hợp lý giữa các yêu cầu
- Đối với quá trình crawl rất lớn, hãy cân nhắc tăng thời gian trễ
- Luôn kiểm tra định dạng phản hồi vì nó có thể thay đổi