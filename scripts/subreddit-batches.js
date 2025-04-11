/**
 * Quản lý thu thập dữ liệu cho nhiều subreddits theo batch
 */
const fs = require('fs');
const path = require('path');
const { crawlHistoricalPostsFromPushshift } = require('../dist/api/pushshiftCrawler');

// Danh sách 71 subreddit của bạn
// Thay thế danh sách này bằng các subreddit thực của bạn
const allSubreddits = [
  // Thêm 71 subreddit của bạn vào đây
  'bitcoin', 'ethereum', 'cryptocurrency', 
  // ... thêm subreddit khác
];

// Kích thước mỗi batch (số lượng subreddit xử lý trong một lần)
const BATCH_SIZE = 5;

// Thời gian chờ giữa các batch (tính bằng mili giây)
const BATCH_DELAY = 10 * 60 * 1000; // 10 phút

// Thời gian thu thập dữ liệu (30 ngày tính từ thời điểm hiện tại)
const now = Math.floor(Date.now() / 1000);
const thirtyDaysInSeconds = 30 * 24 * 60 * 60;
const startDate = now - thirtyDaysInSeconds;

// Hàm delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Log file
const logFile = path.join(__dirname, '../logs/batch-crawl.log');
const errorFile = path.join(__dirname, '../logs/batch-crawl-errors.log');

// Đảm bảo thư mục logs tồn tại
if (!fs.existsSync(path.join(__dirname, '../logs'))) {
  fs.mkdirSync(path.join(__dirname, '../logs'), { recursive: true });
}

// Hàm ghi log
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  console.log(message);
  fs.appendFileSync(logFile, logMessage);
}

// Hàm ghi lỗi
function logError(subreddit, error) {
  const timestamp = new Date().toISOString();
  const errorMessage = `[${timestamp}] Error crawling ${subreddit}: ${error.message}\n`;
  
  console.error(errorMessage);
  fs.appendFileSync(errorFile, errorMessage);
}

// Đọc trạng thái đã xử lý
function getProcessedSubreddits() {
  const statePath = path.join(__dirname, '../logs/processed-subreddits.json');
  
  if (fs.existsSync(statePath)) {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  }
  
  return [];
}

// Lưu trạng thái đã xử lý
function saveProcessedSubreddit(subreddit) {
  const statePath = path.join(__dirname, '../logs/processed-subreddits.json');
  const processed = getProcessedSubreddits();
  
  if (!processed.includes(subreddit)) {
    processed.push(subreddit);
    fs.writeFileSync(statePath, JSON.stringify(processed, null, 2));
  }
}

/**
 * Hàm chính xử lý các subreddit theo batch
 */
async function processBatches() {
  // Lấy danh sách subreddit đã xử lý
  const processedSubreddits = getProcessedSubreddits();
  
  // Lọc ra các subreddit chưa xử lý
  const remainingSubreddits = allSubreddits.filter(
    subreddit => !processedSubreddits.includes(subreddit)
  );
  
  log(`Starting batch crawl for ${remainingSubreddits.length} remaining subreddits out of ${allSubreddits.length} total`);
  
  // Chia thành các batch
  for (let i = 0; i < remainingSubreddits.length; i += BATCH_SIZE) {
    const batch = remainingSubreddits.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(remainingSubreddits.length / BATCH_SIZE);
    
    log(`Processing batch ${batchNumber}/${totalBatches} (${batch.join(', ')})`);
    
    // Xử lý từng subreddit trong batch một cách tuần tự để tránh quá tải
    for (const subreddit of batch) {
      log(`Crawling data for r/${subreddit}...`);
      
      try {
        // Thu thập dữ liệu với Pushshift API
        await crawlHistoricalPostsFromPushshift(subreddit, startDate, now);
        
        // Đánh dấu subreddit đã xử lý
        saveProcessedSubreddit(subreddit);
        
        log(`Completed r/${subreddit}`);
      } catch (error) {
        logError(subreddit, error);
        log(`Failed to crawl r/${subreddit}, continuing with next subreddit`);
      }
      
      // Đợi 2 phút giữa các subreddit trong cùng một batch
      if (batch.indexOf(subreddit) < batch.length - 1) {
        log(`Waiting 2 minutes before crawling next subreddit...`);
        await delay(2 * 60 * 1000);
      }
    }
    
    // Nếu còn batch khác, đợi trước khi xử lý batch tiếp theo
    if (i + BATCH_SIZE < remainingSubreddits.length) {
      log(`Batch ${batchNumber} completed. Waiting ${BATCH_DELAY/60000} minutes before next batch...`);
      await delay(BATCH_DELAY);
    }
  }
  
  log('All batches completed!');
}

// Khởi chạy hàm chính
processBatches().catch(error => {
  console.error('Fatal error in batch processing:', error);
  fs.appendFileSync(errorFile, `[${new Date().toISOString()}] FATAL: ${error.message}\n`);
});