import { config } from './config/config';
import { setupHttpAgents } from './utils/proxy';
import { ensureDirectoryExists } from './utils/fileHelper';
import { closePool } from './utils/postgresHelper';
import { initializeStorageSystems, closeStorageSystems } from './storage/storageFacade';
import { getCrawlerManager } from './utils/dynamicCrawlers';

/**
 * Hàm chạy crawler với cấu hình từ database
 */
async function startDynamicCrawlers() {
  try {
    // Configure global HTTP agents to avoid connection issues
    setupHttpAgents();
    
    // Initialize all storage systems based on configuration
    await initializeStorageSystems();
    
    console.log(`Using storage type: ${config.app.storage}`);
    
    // Create data directory if it doesn't exist
    ensureDirectoryExists(config.app.outputDir);
    
    // Kiểm tra xác thực API Reddit
    if (!config.reddit.clientId || !config.reddit.clientSecret) {
      console.error('ERROR: Reddit API credentials not found. Please set up your .env file');
      process.exit(1);
    }
    
    console.log('='.repeat(50));
    console.log('Starting dynamic Reddit crawlers from database configuration');
    console.log('='.repeat(50));
    
    // Lấy singleton instance của crawler manager
    const crawlerManager = getCrawlerManager();
    
    // Phân tích tham số để biết có khởi động PM2 không
    const shouldStartPM2 = process.argv.includes('--pm2');
    
    // Khởi tạo và khởi động tất cả crawler từ database
    await crawlerManager.initializeScheduledCrawlers();
    
    // Nếu có tham số --pm2, khởi động crawlers bằng PM2
    if (shouldStartPM2) {
      console.log('Initializing PM2 crawlers from database...');
      await crawlerManager.startPM2Crawlers();
    }
    
    console.log('Dynamic crawlers initialized. Press Ctrl+C to stop.');
    
    // Xử lý thoát chương trình
    process.on('SIGINT', async () => {
      console.log('\nGracefully shutting down...');
      
      // Đóng tất cả kết nối database
      await closeStorageSystems();
      
      // Đóng cả pool PostgreSQL nếu đang sử dụng schema thông thường
      if (config.app.storage === 'postgresql') {
        await closePool();
      }
      
      // Đóng crawler manager
      await crawlerManager.close();
      
      console.log('Shutdown complete.');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Error starting dynamic crawlers:', error);
    process.exit(1);
  }
}

// Khởi động dynamic crawlers
startDynamicCrawlers().catch(console.error);