# Reddit Data Crawler

Ứng dụng Node.js/TypeScript để crawl dữ liệu từ Reddit sử dụng Reddit API.

## Cài đặt

1. Clone repository này
2. Cài đặt các dependencies:

```bash
npm install
```

3. Sao chép file `.env.example` thành `.env` và điền thông tin tài khoản Reddit API:

```bash
cp .env.example .env
```

4. Chỉnh sửa file `.env` với thông tin xác thực Reddit của bạn

## Sử dụng

### Bước 1: Tạo Reddit App

1. Đăng nhập vào Reddit
2. Truy cập: https://www.reddit.com/prefs/apps
3. Cuộn xuống dưới và nhấp vào "create another app..."
4. Điền thông tin:
   - Name: tên ứng dụng của bạn
   - App type: chọn "script"
   - Description: mô tả ngắn
   - About URL: có thể để trống
   - Redirect URI: http://localhost
5. Nhấp "create app"
6. Ghi lại Client ID (chuỗi ký tự dưới "personal use script") và Client Secret

### Bước 2: Cập nhật file .env

Mở file `.env` và điền thông tin:
```
REDDIT_CLIENT_ID=your_client_id_here
REDDIT_CLIENT_SECRET=your_client_secret_here
REDDIT_USERNAME=your_reddit_username
REDDIT_PASSWORD=your_reddit_password
REDDIT_USER_AGENT=nodejs:reddit-crawler:v1.0 (by /u/your_username)
```

### Bước 3: Chạy ứng dụng

#### Crawl bài viết từ subreddit

```bash
npm start -- programming 25 hot week
```

Các tham số:
1. Tên subreddit (mặc định: programming)
2. Số bài viết cần crawl (mặc định: 25)
3. Cách sắp xếp: hot, new, top, rising (mặc định: hot)
4. Khoảng thời gian (cho top): hour, day, week, month, year, all (mặc định: week)

#### Crawl comments từ một bài viết

Sửa file `src/index.ts` để bỏ comment dòng sau và thay `post_id_here` bằng ID của bài viết bạn muốn crawl comments:

```typescript
await crawlPostComments('post_id_here');
```

## Kết quả

Dữ liệu đã crawl sẽ được lưu trong thư mục `data` dưới dạng file JSON.

## Lưu ý

Để sử dụng Reddit API, bạn cần tạo một ứng dụng Reddit tại https://www.reddit.com/prefs/apps và lấy thông tin client ID và client secret.# crawl-reddit
