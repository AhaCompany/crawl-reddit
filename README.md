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

#### Crawl bài viết từ subreddit (một lần)

```bash
npm start -- programming 25 hot week true
```

Các tham số:
1. Tên subreddit (mặc định: programming)
2. Số bài viết cần crawl (mặc định: 25)
3. Cách sắp xếp: hot, new, top, rising (mặc định: hot)
4. Khoảng thời gian (cho top): hour, day, week, month, year, all (mặc định: week)
5. Verbose mode (true/false): nếu là true (mặc định), sẽ lấy thông tin chi tiết cho mỗi bài viết bao gồm nội dung đầy đủ của bài viết (selftext, selftext_html). Nếu là false, chỉ lấy thông tin cơ bản (nhanh hơn, ít API calls hơn)

Ví dụ lấy thông tin tóm tắt (nhanh hơn):
```bash
npm start -- programming 50 hot day false
```

Ví dụ lấy thông tin chi tiết (đầy đủ nội dung bài viết):
```bash
npm start -- programming 25 top week true
```

#### Crawl bài viết liên tục (theo khoảng thời gian)

Để crawl một subreddit liên tục theo thời gian thực, bạn có thể sử dụng chế độ continuous:

```bash
npm run continuous-crawl -- <subreddit> <interval> [limit] [sort] [timeRange]
```

Các tham số:
1. `<subreddit>`: Tên subreddit cần crawl (bắt buộc)
2. `<interval>`: Khoảng thời gian giữa các lần crawl (bắt buộc)
   - Định dạng: số + đơn vị (s: giây, m: phút, h: giờ)
   - Ví dụ: 30s, 5m, 1h
   - Lưu ý: Khoảng thời gian tối thiểu là 10s (10 giây)
3. `[limit]`: Số bài viết tối đa lấy mỗi lần (mặc định: 100)
4. `[sort]`: Cách sắp xếp (mặc định: new)
5. `[timeRange]`: Khoảng thời gian cho 'top' (mặc định: day)

Ví dụ:
```bash
# Crawl r/programming mỗi 5 phút, mỗi lần lấy 50 bài mới nhất
npm run continuous-crawl -- programming 5m 50 new

# Crawl r/wallstreetbets mỗi 10 phút, mỗi lần lấy 100 bài hot nhất trong ngày
npm run continuous-crawl -- wallstreetbets 10m 100 hot day

# Crawl r/news mỗi 1 giờ, mỗi lần lấy 200 bài top trong tuần
npm run continuous-crawl -- news 1h 200 top week
```

Chương trình sẽ chạy liên tục cho đến khi bạn dừng lại (nhấn Ctrl+C). Dữ liệu sẽ được lưu trữ sau mỗi lần crawl theo cấu hình storage của bạn (JSON hoặc PostgreSQL).

#### Crawl comments từ một bài viết

Để lấy comments từ một bài viết, sử dụng lệnh:

```bash
npm start -- comments <post_id> <limit>
```

Trong đó:
- `<post_id>`: ID của bài viết Reddit (không phải URL đầy đủ, chỉ phần ID)
- `<limit>`: Số lượng comments tối đa cần lấy (mặc định: 100)

Ví dụ:
```bash
npm start -- comments abc123 200
```

**Lưu ý**: Để lấy ID bài viết, bạn có thể:
1. Từ URL của bài viết trên Reddit (ví dụ: https://www.reddit.com/r/programming/comments/abc123/title_here), `abc123` chính là ID
2. Hoặc từ kết quả crawl bài viết đã thực hiện trước đó, mỗi bài viết đều có trường `id`

## Kết quả

Dữ liệu đã crawl sẽ được lưu trong thư mục `data` dưới dạng file JSON.

## Lưu trữ dữ liệu

Ứng dụng hỗ trợ lưu trữ dữ liệu bằng nhiều cách:

### 1. Lưu trữ dưới dạng file JSON (mặc định)

Đây là chế độ mặc định, dữ liệu sẽ được lưu thành các file JSON trong thư mục `data/`.

### 2. Lưu trữ vào PostgreSQL

Để lưu dữ liệu vào PostgreSQL, bạn cần:

1. Cài đặt và cấu hình PostgreSQL server
2. Tạo database mới (mặc định là `reddit_data`)
3. Cập nhật thông tin kết nối trong file `.env`:

```
# Chọn chế độ lưu trữ
STORAGE_TYPE=postgresql

# Thông tin kết nối PostgreSQL
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=reddit_data
PG_USER=postgres
PG_PASSWORD=your_password
```

### 3. Lưu trữ vào PostgreSQL với cấu trúc MinerStorage

Đây là chế độ lưu trữ dữ liệu vào PostgreSQL với cấu trúc mapping giống như SqliteMinerStorage:

1. Cài đặt và cấu hình PostgreSQL server
2. Tạo database mới (mặc định là `reddit_data`)
3. Cập nhật file `.env`:

```
# Chọn chế độ lưu trữ 
STORAGE_TYPE=postgresql_miner

# Thông tin kết nối PostgreSQL
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=reddit_data
PG_USER=postgres
PG_PASSWORD=your_password
```

### 4. Lưu trữ vào SQLite theo cấu trúc MinerStorage

Đây là chế độ lưu trữ dữ liệu vào file SQLite database với cấu trúc mapping phù hợp với MinerStorage:

1. Cập nhật file `.env`:

```
# Chọn chế độ lưu trữ
STORAGE_TYPE=sqlite

# Đường dẫn tới file SQLite (tùy chọn)
SQLITE_DB_PATH=data/reddit_miner.db
```

### 5. Lưu trữ song song

Bạn có thể chọn lưu trữ cùng lúc vào nhiều hệ thống lưu trữ:

```
# Lưu vào cả JSON và SQLite
STORAGE_TYPE=both

# Lưu vào cả JSON và PostgreSQL với MinerStorage schema
STORAGE_TYPE=both_miner
```

#### Cấu trúc MinerStorage

Dữ liệu được lưu vào bảng `DataEntity` với cấu trúc:

```sql
CREATE TABLE DataEntity (
  uri                 TEXT            PRIMARY KEY,
  datetime            TIMESTAMP(6)    NOT NULL,
  timeBucketId        INTEGER         NOT NULL,
  source              INTEGER         NOT NULL,
  label               CHAR(32)                ,
  content             BLOB/BYTEA      NOT NULL,
  contentSizeBytes    INTEGER         NOT NULL
)
```

Mapping dữ liệu từ Reddit:

1. `uri`: URL đầy đủ của post/comment
2. `datetime`: Thời gian tạo post/comment (chính xác đến giây)
3. `timeBucketId`: ID của time bucket (tính bằng số giờ từ epoch)
4. `source`: Luôn là `1` (DataSource.REDDIT)
5. `label`: Tên subreddit (chuẩn hóa, tối đa 32 ký tự)
6. `content`: Dữ liệu JSON của RedditContent (với created_at đã làm mờ đến phút)
7. `contentSizeBytes`: Kích thước của content tính bằng byte

### Cấu trúc database PostgreSQL

Ứng dụng sẽ tự động tạo các bảng cần thiết trong PostgreSQL:

- `subreddits`: Thông tin về các subreddit
- `posts`: Bài viết từ Reddit
- `comments`: Comments của các bài viết

## Lưu ý

Để sử dụng Reddit API, bạn cần tạo một ứng dụng Reddit tại https://www.reddit.com/prefs/apps và lấy thông tin client ID và client secret.# crawl-reddit
