import { CommentTracker } from './utils/commentTracker';
import { config } from './config/config';
import { setupHttpAgents } from './utils/proxy';
import { ensureDirectoryExists } from './utils/fileHelper';
import * as cron from 'node-cron';

// Đường dẫn lưu trữ dữ liệu
ensureDirectoryExists(config.app.outputDir);

// Configure HTTP agents to avoid connection issues
setupHttpAgents();

// Tạo instance của CommentTracker
const commentTracker = new CommentTracker();

/**
 * Hàm xử lý crawl comments liên tục
 */
async function runIncrementalCommentCrawl() {
  try {
    console.log('Initializing incremental comment crawler...');
    
    // Khởi tạo CommentTracker
    await commentTracker.initialize();
    
    // Kiểm tra xác thực Reddit API
    if (!config.reddit.clientId || !config.reddit.clientSecret) {
      console.error('ERROR: Reddit API credentials not found. Please set up your .env file');
      process.exit(1);
    }
    
    console.log('='.repeat(50));
    console.log('Starting incremental comment crawler');
    console.log('='.repeat(50));
    
    // Thực hiện các tác vụ ban đầu
    console.log('Looking for new posts to track...');
    await commentTracker.addNewPostsFromDataEntity(20, 3);
    
    console.log('Processing initial batch of posts...');
    await commentTracker.processNextPosts(5);
    
    console.log('Cleaning up expired tracking...');
    await commentTracker.cleanupTracking();
    
    // Tạo lịch quét
    console.log('Setting up crawling schedules...');
    
    // Quét comments mỗi 5 phút
    cron.schedule('*/5 * * * *', async () => {
      console.log('Running scheduled comment crawling...');
      await commentTracker.processNextPosts(5);
    });
    
    // Thêm bài viết mới vào tracking mỗi 30 phút
    cron.schedule('*/30 * * * *', async () => {
      console.log('Looking for new posts to track...');
      await commentTracker.addNewPostsFromDataEntity(20, 3);
    });
    
    // Dọn dẹp tracking hết hạn mỗi 2 giờ
    cron.schedule('0 */2 * * *', async () => {
      console.log('Cleaning up expired tracking...');
      await commentTracker.cleanupTracking();
    });
    
    console.log('Incremental comment crawler initialized');
    console.log('Press Ctrl+C to stop');
    
    // Xử lý thoát chương trình
    process.on('SIGINT', async () => {
      console.log('\nGracefully shutting down...');
      await commentTracker.close();
      console.log('Shutdown complete.');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Error in incremental comment crawler:', error);
    
    await commentTracker.close();
    process.exit(1);
  }
}

// Chạy hàm crawl comments
runIncrementalCommentCrawl().catch(async (error) => {
  console.error('Fatal error:', error);
  await commentTracker.close();
  process.exit(1);
});