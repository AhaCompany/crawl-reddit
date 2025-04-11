# Hướng dẫn thu thập dữ liệu Reddit 30 ngày qua

## Giới thiệu

Công cụ này giúp bạn thu thập dữ liệu từ Reddit trong 30 ngày qua, vượt qua giới hạn của Reddit API (chỉ cho phép lấy 1000 bài viết mới nhất). Công cụ sử dụng Pushshift API - một dịch vụ bên thứ ba lưu trữ lịch sử bài viết Reddit.

Tính năng chính:
- Thu thập bài viết (posts) trong 30 ngày qua từ Pushshift API
- Thu thập comments cho các bài viết từ Reddit API chính thức
- Lưu trữ dữ liệu trong cả file JSON và database

## Cách sử dụng

### Bước 1: Cài đặt

Đầu tiên, hãy đảm bảo bạn đã biên dịch dự án:

```bash
npm run build
```

### Bước 2: Cấu hình thu thập bình luận (Comments)

Mặc định, công cụ sẽ thu thập cả bài viết và bình luận. Bạn có thể điều chỉnh cấu hình này bằng cách thiết lập biến môi trường:

```bash
# Để thu thập cả comments (mặc định)
export CRAWL_COMMENTS=true

# Để chỉ thu thập posts (không thu thập comments)
export CRAWL_COMMENTS=false
```

### Bước 3: Chạy crawl dữ liệu 30 ngày

```bash
npm run historical-month
```

Lệnh này sẽ tự động:
1. Lấy tất cả subreddit đang hoạt động từ database
2. Thu thập dữ liệu trong 30 ngày qua cho từng subreddit
3. Thu thập bình luận cho mỗi bài viết (nếu CRAWL_COMMENTS=true)
4. Lưu dữ liệu vào cả file JSON và database (nếu đã cấu hình)

### Bước 4: Kiểm tra kết quả

Dữ liệu sẽ được lưu vào:
- Thư mục `/data/[subreddit]/` - Chứa các file JSON với dữ liệu bài viết
- Thư mục `/data/[subreddit]/comments/` - Chứa các file JSON với dữ liệu bình luận
- Database (nếu đã cấu hình trong biến môi trường STORAGE_TYPE)

## Cấu hình nâng cao

### Lấy dữ liệu cho một subreddit cụ thể

Nếu bạn muốn lấy dữ liệu cho một subreddit không có trong database:

1. Tạo file mới, ví dụ `crawl-specific-subreddit.js`:

```javascript
// crawl-specific-subreddit.js
const { crawlLastMonthsFromPushshift } = require('./dist/api/pushshiftCrawler');

const subreddit = 'bitcoin'; // Thay thế bằng subreddit bạn muốn crawl
const months = 1; // Số tháng dữ liệu cần lấy

async function run() {
  try {
    console.log(`Crawling ${months} months of data for r/${subreddit}...`);
    await crawlLastMonthsFromPushshift(subreddit, months);
    console.log('Crawl completed!');
  } catch (error) {
    console.error('Error:', error);
  }
}

run();
```

2. Chạy file này:

```bash
node crawl-specific-subreddit.js
```

### Lấy dữ liệu trong khoảng thời gian tuỳ chỉnh

Nếu bạn muốn thu thập dữ liệu trong khoảng thời gian cụ thể:

```javascript
// crawl-custom-timeframe.js
const { crawlHistoricalPostsFromPushshift } = require('./dist/api/pushshiftCrawler');

const subreddit = 'bitcoin'; // Thay thế bằng subreddit bạn muốn crawl

// Chuyển đổi thời gian thành UNIX timestamp (seconds)
const startDate = Math.floor(new Date('2023-03-01').getTime() / 1000);
const endDate = Math.floor(new Date('2023-04-01').getTime() / 1000);

async function run() {
  try {
    console.log(`Crawling data for r/${subreddit} from ${new Date(startDate * 1000).toDateString()} to ${new Date(endDate * 1000).toDateString()}...`);
    await crawlHistoricalPostsFromPushshift(subreddit, startDate, endDate);
    console.log('Crawl completed!');
  } catch (error) {
    console.error('Error:', error);
  }
}

run();
```

## Lưu ý quan trọng

1. **Rate limiting**: 
   - Pushshift API có giới hạn số lượng request, vì vậy mã đã được tối ưu để chờ giữa các request. 
   - Reddit API cũng có giới hạn rate, đặc biệt khi thu thập comments. Hệ thống sử dụng hệ thống xoay vòng tài khoản để giảm thiểu vấn đề này.

2. **Không đầy đủ**: Pushshift đôi khi không lưu trữ 100% bài viết. Nếu dữ liệu rất quan trọng, hãy kết hợp phương pháp này với crawl realtime.

3. **Dữ liệu lai ghép**: Công cụ này sử dụng kết hợp hai nguồn dữ liệu:
   - Bài viết (posts) từ Pushshift API: Cho phép lấy dữ liệu lịch sử
   - Bình luận (comments) từ Reddit API chính thức: Đảm bảo dữ liệu bình luận chính xác và đầy đủ

4. **Thời gian xử lý**: Thu thập comments có thể mất thời gian vì:
   - Mỗi bài viết yêu cầu một request riêng để lấy comments
   - Xử lý theo batch để giảm tải lên Reddit API
   - Cần xử lý bình luận đệ quy (replies của replies)

## Khắc phục sự cố

Nếu bạn gặp lỗi khi sử dụng Pushshift API:

1. **Lỗi 429 (Too Many Requests)**: Hãy tăng thời gian chờ giữa các request (tham số `delay` trong mã).

2. **Dữ liệu trống**: Kiểm tra xem subreddit có tồn tại hoặc có bài viết trong khoảng thời gian bạn yêu cầu không.

3. **Lỗi hết bộ nhớ**: Nếu thu thập quá nhiều dữ liệu, hãy giảm tham số `maxRequests` hoặc `size`.

4. **Pushshift không khả dụng**: Đôi khi API có thể tạm thời không hoạt động. Hãy thử lại sau hoặc kiểm tra tình trạng dịch vụ tại [Pushshift Status](https://status.pushshift.io/).