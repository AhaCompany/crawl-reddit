/**
 * Script để tự động thêm bài viết mới vào theo dõi comments
 */
import { CommentTracker } from './utils/commentTracker';
import { config } from './config/config';
import { setupHttpAgents } from './utils/rotatingRedditClient';
import { ensureDirectoryExists } from './utils/fileHelper';
import { initializeStorageSystems, closeStorageSystems } from './storage/storageFacade';

// Đảm bảo thư mục dữ liệu tồn tại
ensureDirectoryExists(config.app.outputDir);

// Cấu hình HTTP agents
(async () => { await setupHttpAgents(); })().catch(err => console.error('Error setting up HTTP agents:', err));

// Tạo instance của CommentTracker
const commentTracker = new CommentTracker();

/**
 * Hàm chính để tự động thêm bài viết mới vào theo dõi
 */
async function autoTrackPosts() {
  try {
    console.log('Initializing storage systems...');
    await initializeStorageSystems();
    
    // Khởi tạo CommentTracker
    await commentTracker.initialize();
    
    // Kiểm tra xác thực Reddit API
    if (!config.reddit.clientId || !config.reddit.clientSecret) {
      console.error('ERROR: Reddit API credentials not found. Please set up your .env file');
      process.exit(1);
    }
    
    console.log('='.repeat(50));
    console.log('Auto Post Tracker');
    console.log(`Storage type: ${config.app.storage}`);
    console.log('='.repeat(50));
    
    // Lấy số lượng bài viết từ tham số dòng lệnh hoặc mặc định là 20
    const limit = process.argv[2] ? parseInt(process.argv[2]) : 20;
    
    // Lấy số ngày theo dõi từ tham số dòng lệnh hoặc mặc định là 3
    const days = process.argv[3] ? parseInt(process.argv[3]) : 3;
    
    console.log(`Looking for ${limit} new posts to track for ${days} days...`);
    
    // Thêm bài viết mới vào theo dõi
    const addedCount = await commentTracker.addNewPostsFromDataEntity(limit, days);
    
    // Dọn dẹp tracking hết hạn
    console.log('Cleaning up expired tracking...');
    const cleanedCount = await commentTracker.cleanupTracking();
    
    console.log(`Auto tracking summary:`);
    console.log(`- Added ${addedCount} new posts for tracking`);
    console.log(`- Cleaned up ${cleanedCount} expired posts`);
    
    // Hiển thị số lượng bài viết đang được theo dõi
    const activeCount = await commentTracker.getActiveTrackingCount();
    console.log(`- Currently tracking ${activeCount} active posts`);
    
    console.log('Auto tracking completed');
  } catch (error) {
    console.error('Error in auto post tracker:', error);
  } finally {
    // Đóng kết nối
    await commentTracker.close();
    await closeStorageSystems();
  }
}

// Xử lý tắt chương trình
process.on('SIGINT', async () => {
  console.log('\nGracefully shutting down...');
  await commentTracker.close();
  await closeStorageSystems();
  console.log('Shutdown complete.');
  process.exit(0);
});

// Chạy chương trình
autoTrackPosts().catch(async (error) => {
  console.error('Fatal error:', error);
  await commentTracker.close();
  await closeStorageSystems();
  process.exit(1);
});