/**
 * Test thu thập dữ liệu cho một subreddit
 * Script này giúp kiểm tra quá trình thu thập dữ liệu hoạt động đúng
 */
const fs = require('fs');
const path = require('path');
const { crawlHistoricalPostsFromPushshift } = require('../dist/api/pushshiftCrawler');

// === CẤU HÌNH TEST ===
// Nhập tên subreddit cần test ở đây
const TEST_SUBREDDIT = 'cryptocurrency'; // Thay đổi thành subreddit bạn muốn test

// Thời gian thu thập (mặc định 7 ngày để test nhanh)
const TEST_DAYS = 2;

// === THỰC HIỆN TEST ===
// Tính timestamp cho khoảng thời gian
const now = Math.floor(Date.now() / 1000);
const testPeriodInSeconds = TEST_DAYS * 24 * 60 * 60;
const startTimestamp = now - testPeriodInSeconds;

// Thư mục logs
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
const logFile = path.join(logDir, 'test-subreddit.log');

// Hàm ghi log
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  console.log(message);
  fs.appendFileSync(logFile, logMessage);
}

// Thông tin test
log(`=== BẮT ĐẦU TEST THU THẬP DỮ LIỆU ===`);
log(`Subreddit: r/${TEST_SUBREDDIT}`);
log(`Thời gian thu thập: ${TEST_DAYS} ngày (${new Date(startTimestamp * 1000).toISOString()} đến nay)`);
log(`Thu thập comment: ${process.env.CRAWL_COMMENTS === 'true' ? 'Có' : 'Không'}`);
log(`Thư mục lưu dữ liệu: ${path.join(process.cwd(), 'data', TEST_SUBREDDIT)}`);

// Chạy crawl
async function runTest() {
  const startTime = Date.now();
  log('Bắt đầu quá trình thu thập dữ liệu...');
  
  try {
    // Thực hiện crawl
    await crawlHistoricalPostsFromPushshift(TEST_SUBREDDIT, startTimestamp, now);
    
    // Tính thời gian hoàn thành
    const endTime = Date.now();
    const durationMinutes = ((endTime - startTime) / 60000).toFixed(2);
    
    log(`\n=== KẾT QUẢ TEST ===`);
    log(`Đã hoàn thành sau ${durationMinutes} phút`);
    
    // Kiểm tra dữ liệu đã lưu
    const outputDir = path.join(process.cwd(), 'data', TEST_SUBREDDIT);
    if (fs.existsSync(outputDir)) {
      const files = fs.readdirSync(outputDir);
      const postFiles = files.filter(f => f.endsWith('.json') && !f.includes('comment'));
      log(`Đã lưu ${postFiles.length} file JSON bài viết`);
      
      // Kiểm tra dữ liệu comment
      if (process.env.CRAWL_COMMENTS === 'true') {
        const commentDir = path.join(outputDir, 'comments');
        if (fs.existsSync(commentDir)) {
          const commentFiles = fs.readdirSync(commentDir);
          log(`Đã lưu ${commentFiles.length} file JSON comments`);
        } else {
          log('Không tìm thấy thư mục comments');
        }
      }
    } else {
      log('Không tìm thấy thư mục dữ liệu');
    }
    
    log('Test đã hoàn thành thành công!');
  } catch (error) {
    log(`\n=== LỖI ===`);
    log(`Thu thập dữ liệu thất bại: ${error.message}`);
    log(`Stack trace: ${error.stack}`);
  }
}

// Chạy test
runTest().catch(err => {
  log(`Lỗi không mong muốn: ${err.message}`);
  process.exit(1);
});