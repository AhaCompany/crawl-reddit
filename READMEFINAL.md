# Hướng dẫn Crawl Dữ liệu Reddit

Tài liệu này hướng dẫn chi tiết cách crawl dữ liệu từ một subreddit bất kỳ trong một khoảng thời gian xác định, kèm theo tất cả các bài post và comment.

## Chuẩn bị

### 1. Chạy migration để cập nhật cấu trúc cơ sở dữ liệu

```bash
npm run migrate
```

### 2. Thêm tài khoản Reddit

Đảm bảo có ít nhất một tài khoản Reddit trong hệ thống để thực hiện crawl:

```bash
npm run accounts
```

Khi chạy lệnh này, bạn sẽ thấy menu tương tác. Chọn "Add account" và nhập thông tin tài khoản Reddit:
- username
- password
- clientId (từ Reddit Developer App)
- clientSecret (từ Reddit Developer App)
- userAgent (ví dụ: "MyRedditCrawler:v1.0.0 (by /u/username)")

### 3. (Tùy chọn) Cấu hình proxy nếu cần

Nếu muốn sử dụng proxy để tránh rate limit, cấu hình các proxy:

```bash
npm run proxy
```

## Crawl Subreddit Trong Khoảng Thời Gian

### 1. Thêm cấu hình crawl cho subreddit

Để crawl tất cả bài viết của một subreddit từ hôm nay đến 1 tháng trước:

```bash
npm run config -- add SUBREDDIT_NAME 1h 1000 new all $(date -d "1 month ago" +%Y-%m-%d) $(date +%Y-%m-%d)
```

Trong đó:
- `SUBREDDIT_NAME`: Tên subreddit (không cần tiền tố r/)
- `1h`: Tần suất crawl (cứ 1 giờ sẽ crawl một lần)
- `1000`: Số bài tối đa mỗi lần crawl
- `new`: Sắp xếp bài viết theo thời gian đăng (mới nhất)
- `all`: Phạm vi thời gian không giới hạn
- Hai tham số cuối là thời gian bắt đầu (1 tháng trước) và thời gian kết thúc (hôm nay)

**Lưu ý cho macOS**: Thay `date -d "1 month ago"` bằng `date -v-1m`

### 2. Chạy dynamic crawler để crawl bài viết

```bash
npm run dynamic-crawl
```

Hoặc nếu muốn chạy liên tục với PM2:

```bash
pm2 start npm --name "reddit-dynamic-crawler" -- run dynamic-crawl
```

### 3. Chạy comment crawler để lấy tất cả comment của các bài viết

```bash
npm run crawl-comments
```

Hoặc với PM2:

```bash
pm2 start npm --name "reddit-comment-crawler" -- run crawl-comments
```

## Các Tham Số Quan Trọng

### Cú pháp đầy đủ của lệnh thêm cấu hình:

```
npm run config -- add <subreddit> <interval> [limit] [sort_by] [time_range] [start_time] [end_time]
```

- `<subreddit>`: Tên subreddit (không có r/)
- `<interval>`: Khoảng thời gian giữa các lần crawl (5m, 1h, 1d,...)
- `[limit]`: Số bài tối đa mỗi lần (mặc định: 50)
- `[sort_by]`: Cách sắp xếp (new, hot, top, rising)
- `[time_range]`: Phạm vi thời gian (hour, day, week, month, year, all)
- `[start_time]`: Thời gian bắt đầu (YYYY-MM-DD)
- `[end_time]`: Thời gian kết thúc (YYYY-MM-DD)

### Ví dụ crawl theo từng loại cụ thể:

1. **Crawl bài hot trong tuần qua:**
   ```bash
   npm run config -- add programming 2h 100 hot week
   ```

2. **Crawl bài top trong tháng qua:**
   ```bash
   npm run config -- add science 6h 200 top month
   ```

3. **Crawl subreddit với thời gian cụ thể:**
   ```bash
   npm run config -- add worldnews 1h 1000 new all 2023-01-01 2023-12-31
   ```

## Kiểm Tra Tài Khoản và Proxy

Để kiểm tra xem tài khoản và proxy có hoạt động không:

```bash
npm run test-account
```

## Quản Lý Crawl Process với PM2

### Các lệnh PM2 cơ bản:

```bash
# Xem trạng thái
pm2 status

# Xem log
pm2 logs reddit-dynamic-crawler

# Dừng crawler
pm2 stop reddit-dynamic-crawler

# Khởi động lại
pm2 restart reddit-dynamic-crawler

# Lưu cấu hình (để tự động khởi động lại sau khi server reboot)
pm2 save
pm2 startup
```

## Xem Báo Cáo Thống Kê

### Thống kê tài khoản:

```bash
npm run accounts -- stats
```

### Thống kê proxy (nếu sử dụng):

```bash
npm run proxy -- stats
```

## Khắc Phục Sự Cố

- **Reddit API Rate Limits**: Hệ thống đã tự động xử lý rate limit bằng cách luân chuyển tài khoản và proxy
- **Lỗi Database**: Kiểm tra kết nối database trong file `.env`
- **Lỗi Xác Thực**: Đảm bảo tài khoản Reddit còn hiệu lực và có quyền truy cập API