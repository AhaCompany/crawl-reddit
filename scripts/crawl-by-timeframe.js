/**
 * Thu thập dữ liệu theo khung thời gian
 * - Chia khoảng thời gian 30 ngày thành các giai đoạn nhỏ hơn
 * - Thực hiện từng giai đoạn một cách tuần tự
 */
const fs = require('fs');
const path = require('path');
const { crawlHistoricalPostsFromPushshift } = require('../dist/api/pushshiftCrawler');

// Subreddit cần thu thập (thay thế bằng subreddit thực của bạn)
// Lưu ý: Script này chỉ xử lý một subreddit mỗi lần
const SUBREDDIT = 'subreddit-name-here';

// Chia thành mấy giai đoạn (mặc định là 3 giai đoạn, mỗi giai đoạn 10 ngày)
const PHASES = 3;

// Thời gian bắt đầu và kết thúc
const now = Math.floor(Date.now() / 1000);
const thirtyDaysInSeconds = 30 * 24 * 60 * 60;
const phaseLength = thirtyDaysInSeconds / PHASES;

// Thư mục logs
const logFile = path.join(__dirname, '../logs/timeframe-crawl.log');
const errorFile = path.join(__dirname, '../logs/timeframe-crawl-errors.log');

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
function logError(phase, error) {
  const timestamp = new Date().toISOString();
  const errorMessage = `[${timestamp}] Error in phase ${phase}: ${error.message}\n`;
  
  console.error(errorMessage);
  fs.appendFileSync(errorFile, errorMessage);
}

/**
 * Hàm chính xử lý theo từng giai đoạn
 */
async function processTimeframes() {
  log(`Starting crawl for r/${SUBREDDIT} in ${PHASES} phases`);
  
  // Tạo các giai đoạn thời gian
  const phases = [];
  for (let i = 0; i < PHASES; i++) {
    const end = i === 0 ? now : phases[i-1].start;
    const start = end - phaseLength;
    
    phases.push({
      phase: i+1,
      start,
      end,
      startDate: new Date(start * 1000).toISOString(),
      endDate: new Date(end * 1000).toISOString(),
    });
  }
  
  // In thông tin các giai đoạn
  log('Crawling schedule:');
  phases.forEach(phase => {
    log(`Phase ${phase.phase}: ${phase.startDate} to ${phase.endDate}`);
  });
  
  // Xử lý từng giai đoạn
  for (const phase of phases) {
    log(`\n===== Starting Phase ${phase.phase}: ${phase.startDate} to ${phase.endDate} =====`);
    
    try {
      await crawlHistoricalPostsFromPushshift(SUBREDDIT, phase.start, phase.end);
      log(`Completed Phase ${phase.phase}`);
    } catch (error) {
      logError(phase.phase, error);
      log(`Failed in Phase ${phase.phase}, continuing with next phase`);
    }
    
    // Nghỉ 10 phút giữa các giai đoạn
    if (phase.phase < PHASES) {
      log(`Waiting 10 minutes before next phase...`);
      await new Promise(resolve => setTimeout(resolve, 10 * 60 * 1000));
    }
  }
  
  log(`Completed all phases for r/${SUBREDDIT}`);
}

// Khởi chạy hàm chính
processTimeframes().catch(error => {
  console.error('Fatal error:', error);
  fs.appendFileSync(errorFile, `[${new Date().toISOString()}] FATAL: ${error.message}\n`);
});