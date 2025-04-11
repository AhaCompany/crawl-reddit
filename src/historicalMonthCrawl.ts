/**
 * historicalMonthCrawl.ts
 * Tiện ích crawl dữ liệu lịch sử trong 30 ngày qua sử dụng Pushshift API
 */

import { Pool } from 'pg';
import { config } from './config/config';
import { crawlLastMonthsFromPushshift } from './api/pushshiftCrawler';
import { setupHttpAgents } from './utils/rotatingRedditClient';
import { initializeStorageSystems, closeStorageSystems } from './storage/storageFacade';

// Thêm giá trị crawlComments nếu chưa có
if (config.app.crawlComments === undefined) {
  config.app.crawlComments = true; // Mặc định là lấy cả comments
}

// Interface cho cấu hình crawler
interface CrawlerConfig {
  id: number;
  subreddit: string;
  is_active: boolean;
}

/**
 * Hàm chính để thực hiện crawl dữ liệu lịch sử 30 ngày qua
 */
async function runHistoricalMonthCrawl() {
  // Record start time
  const startTime = Date.now();
  console.log('='.repeat(80));
  console.log('HISTORICAL 30-DAY REDDIT DATA CRAWLER'.padStart(50, ' '));
  console.log('='.repeat(80));
  
  // Khởi tạo pool connection cho PostgreSQL
  const pool = new Pool({
    host: config.postgresql.host,
    port: config.postgresql.port,
    database: config.postgresql.database,
    user: config.postgresql.user,
    password: config.postgresql.password,
  });
  
  try {
    console.log('\n--- Initializing Systems ---');
    
    // Thiết lập HTTP agents cho crawling
    await setupHttpAgents();
    
    // Khởi tạo storage systems
    console.log(`[CONFIG] Storage mode: ${config.app.storage}`);
    console.log(`[CONFIG] Crawl comments: ${config.app.crawlComments ? 'Yes' : 'No'}`);
    await initializeStorageSystems();
    
    // Lấy tất cả cấu hình crawl từ database (chỉ những subreddit đang active)
    console.log('\n--- Loading Crawler Configurations ---');
    const result = await pool.query(`
      SELECT id, subreddit, is_active
      FROM crawl_configs
      WHERE is_active = TRUE
      ORDER BY id
    `);
    
    // Lấy các cấu hình
    const configs: CrawlerConfig[] = result.rows;
    console.log(`[INFO] Found ${configs.length} active subreddit configurations`);
    
    // Log thông tin chi tiết về các cấu hình
    if (configs.length > 0) {
      console.log('\n--- Crawler Configurations ---');
      configs.forEach((config, index) => {
        console.log(`[CONFIG ${index + 1}] ID: ${config.id}, Subreddit: ${config.subreddit}`);
      });
    }
    
    // Nếu không có cấu hình nào, thoát
    if (configs.length === 0) {
      console.log('No active crawler configurations found.');
      return;
    }
    
    // Xử lý từng cấu hình
    for (let i = 0; i < configs.length; i++) {
      const config = configs[i];
      console.log('\n' + '='.repeat(80));
      console.log(`[CRAWL JOB ${i+1}/${configs.length}] Processing historical data for r/${config.subreddit}`);
      console.log('='.repeat(80));
      
      try {
        // Xử lý tên subreddit (loại bỏ phần thời gian nếu có)
        let actualSubreddit = config.subreddit;
        
        console.log('\n[SUBREDDIT] Resolving actual subreddit name...');
        
        // Mẫu cho tên subreddit với timestamp (bitcoin-20250328-23)
        const timestampPattern = /^([a-zA-Z0-9_]+)-\d{8}-\d{2}$/;
        
        // Mẫu cho tên subreddit với label (bitcoin-30days, bitcoin-history)
        const labelPattern = /^([a-zA-Z0-9_]+)-([\w-]+)$/;
        
        // Kiểm tra mẫu timestamp trước
        let match = config.subreddit.match(timestampPattern);
        if (match && match[1]) {
          actualSubreddit = match[1];
          console.log(`[SUBREDDIT] Configuration name: ${config.subreddit}`);
          console.log(`[SUBREDDIT] Actual Reddit name: ${actualSubreddit} (identified by timestamp pattern)`);
        } else {
          // Nếu không phải timestamp pattern, kiểm tra label pattern
          match = config.subreddit.match(labelPattern);
          if (match && match[1]) {
            actualSubreddit = match[1];
            console.log(`[SUBREDDIT] Configuration name: ${config.subreddit}`);
            console.log(`[SUBREDDIT] Actual Reddit name: ${actualSubreddit} (identified by label pattern)`);
          } else {
            console.log(`[SUBREDDIT] Using provided name as-is: ${actualSubreddit}`);
          }
        }
        
        // Record start time to measure performance
        const crawlStartTime = Date.now();
        
        // Thực hiện crawl 30 ngày dữ liệu từ Pushshift
        await crawlLastMonthsFromPushshift(actualSubreddit, 1); // 1 tháng
        
        // Record end time and calculate duration
        const crawlEndTime = Date.now();
        const crawlDuration = (crawlEndTime - crawlStartTime) / 1000; // in seconds
        
        console.log(`\n[COMPLETED] Historical crawl for r/${actualSubreddit} finished in ${crawlDuration.toFixed(2)} seconds`);
      } catch (error) {
        console.error(`Error processing crawler for r/${config.subreddit}:`, error);
      }
    }
    
    // Tạo report tổng kết
    const totalEndTime = Date.now();
    const totalExecutionTime = ((totalEndTime - startTime) / 1000).toFixed(2);
    
    console.log('\n' + '='.repeat(80));
    console.log('HISTORICAL 30-DAY CRAWL SUMMARY'.padStart(50, ' '));
    console.log('='.repeat(80));
    console.log(`[SUMMARY] Processed ${configs.length} subreddits`);
    console.log(`[SUMMARY] Total execution time: ${totalExecutionTime} seconds`);
    console.log(`[SUMMARY] Storage mode: ${config.app.storage}`);
    console.log(`[SUMMARY] Completed at: ${new Date().toISOString()}`);
    console.log('='.repeat(80));
  } catch (error) {
    console.error('[ERROR] Fatal error in historical month crawl process:', error);
  } finally {
    // Đóng storage systems
    console.log('\n[CLEANUP] Closing storage systems...');
    await closeStorageSystems();
    
    // Đóng pool connection
    console.log('[CLEANUP] Closing database connections...');
    await pool.end();
    
    console.log('[DONE] Historical month crawl process complete!');
  }
}

// Chạy hàm chính
runHistoricalMonthCrawl().catch(error => {
  console.error('[FATAL ERROR] Historical month crawl failed:', error);
  process.exit(1);
});