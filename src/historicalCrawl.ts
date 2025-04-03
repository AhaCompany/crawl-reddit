/**
 * historicalCrawl.ts
 * Tiện ích crawl dữ liệu lịch sử từ subreddits dựa trên cấu hình trong database
 * Hỗ trợ phân trang để lấy tất cả các bài post trong khoảng thời gian xác định
 */

import { Pool } from 'pg';
import { config } from './config/config';
import { crawlSubredditPostsWithPagination } from './api/paginatedPostCrawler';
import { setupHttpAgents } from './utils/rotatingRedditClient';
import { initializeStorageSystems, closeStorageSystems } from './storage/storageFacade';

// Interface cho cấu hình crawler
interface CrawlerConfig {
  id: number;
  subreddit: string;
  crawl_interval: string;
  post_limit: number;
  sort_by: 'hot' | 'new' | 'top' | 'rising';
  time_range: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
  is_active: boolean;
  start_time: Date | null;
  end_time: Date | null;
  use_pagination: boolean;
  max_pages: number;
}

/**
 * Hàm chính để thực hiện crawl dữ liệu lịch sử
 */
async function runHistoricalCrawl() {
  // Record start time
  const startHistoricalCrawl = Date.now();
  console.log('='.repeat(80));
  console.log('HISTORICAL REDDIT DATA CRAWLER'.padStart(50, ' '));
  console.log('='.repeat(80));
  
  // Thông tin cấu hình
  console.log('[DEBUG] PostgreSQL configuration:', 
    `Host: ${config.postgresql.host}, Port: ${config.postgresql.port}, Database: ${config.postgresql.database}, User: ${config.postgresql.user}`);
  console.log('[DEBUG] PostgreSQL pool config:', 
    `Max connections: ${config.postgresql.max}, Idle timeout: ${config.postgresql.idleTimeoutMillis}ms, Connection timeout: ${config.postgresql.connectionTimeoutMillis}ms`);
  
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
    if (config.app.storage === 'json') {
      console.log('[WARNING] Currently configured to store only JSON files!');
      console.log('[WARNING] Posts will not be saved to database!');
      console.log('[TIP] Set STORAGE_TYPE environment variable to postgresql_miner or both_miner to enable database storage');
    }
    await initializeStorageSystems();
    
    // Lấy tất cả cấu hình crawl từ database
    console.log('\n--- Loading Crawler Configurations ---');
    const result = await pool.query(`
      SELECT id, subreddit, crawl_interval, post_limit, sort_by, time_range, 
             is_active, start_time, end_time, use_pagination, max_pages
      FROM crawl_configs
      WHERE is_active = TRUE AND use_pagination = TRUE
      ORDER BY id
    `);
    
    // Lấy các cấu hình
    const configs: CrawlerConfig[] = result.rows;
    console.log(`[INFO] Found ${configs.length} active historical crawl configurations that use pagination`);
    
    // Log thông tin chi tiết về các cấu hình
    if (configs.length > 0) {
      console.log('\n--- Crawler Configurations ---');
      configs.forEach((config, index) => {
        console.log(`[CONFIG ${index + 1}] ID: ${config.id}, Subreddit: ${config.subreddit}`);
        console.log(`  • Post limit: ${config.post_limit}, Sort: ${config.sort_by}, Time range: ${config.time_range}`);
        console.log(`  • Pagination: ${config.use_pagination ? 'Yes' : 'No'}, Max pages: ${config.max_pages}`);
        console.log(`  • Time window: ${config.start_time ? new Date(config.start_time).toISOString() : 'No start'} to ${config.end_time ? new Date(config.end_time).toISOString() : 'No end'}`);
      });
    }
    
    // Nếu không có cấu hình nào, thoát
    if (configs.length === 0) {
      console.log('No active historical crawl configurations found.');
      return;
    }
    
    // Xử lý từng cấu hình
    for (let i = 0; i < configs.length; i++) {
      const config = configs[i];
      console.log('\n' + '='.repeat(80));
      console.log(`[CRAWL JOB ${i+1}/${configs.length}] Processing crawler for r/${config.subreddit}`);
      console.log('='.repeat(80));
      
      // Format thông tin cấu hình
      console.log(`[CONFIG] ID: ${config.id}`);
      console.log(`[CONFIG] Limit: ${config.post_limit} posts per page`);
      console.log(`[CONFIG] Sort method: ${config.sort_by}`);
      console.log(`[CONFIG] Time range: ${config.time_range}`);
      console.log(`[CONFIG] Pagination: max ${config.max_pages} pages`);
      
      // Format thông tin thời gian
      if (config.start_time) {
        const startDate = new Date(config.start_time);
        console.log(`[CONFIG] Start time: ${startDate.toISOString()} (${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString()})`);
      } else {
        console.log(`[CONFIG] Start time: Not specified (no lower bound)`);
      }
      
      if (config.end_time) {
        const endDate = new Date(config.end_time);
        console.log(`[CONFIG] End time: ${endDate.toISOString()} (${endDate.toLocaleDateString()} ${endDate.toLocaleTimeString()})`);
      } else {
        console.log(`[CONFIG] End time: Not specified (no upper bound)`);
      }
      
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
        
        // Chuyển đổi start_time và end_time sang timestamp
        const startTimestamp = config.start_time ? Math.floor(config.start_time.getTime() / 1000) : null;
        const endTimestamp = config.end_time ? Math.floor(config.end_time.getTime() / 1000) : null;
        
        console.log('\n[CRAWL] Starting historical data crawl...');
        console.log(`[CRAWL] Target: r/${actualSubreddit}`);
        console.log(`[CRAWL] Page size: ${config.post_limit} posts`);
        console.log(`[CRAWL] Maximum pages: ${config.max_pages}`);
        console.log(`[CRAWL] Sort method: ${config.sort_by}, Time range: ${config.time_range}`);
        
        if (startTimestamp) {
          console.log(`[CRAWL] Will stop at posts older than: ${new Date(startTimestamp * 1000).toISOString()}`);
        }
        
        if (endTimestamp) {
          console.log(`[CRAWL] Will skip posts newer than: ${new Date(endTimestamp * 1000).toISOString()}`);
        }
        
        // Record start time to measure performance
        const crawlStartTime = Date.now();
        
        // Thực hiện crawl với phân trang
        await crawlSubredditPostsWithPagination(
          actualSubreddit,
          config.post_limit,
          config.sort_by,
          config.time_range,
          config.max_pages,
          startTimestamp,
          endTimestamp
        );
        
        // Record end time and calculate duration
        const crawlEndTime = Date.now();
        const crawlDuration = (crawlEndTime - crawlStartTime) / 1000; // in seconds
        
        console.log(`\n[COMPLETED] Crawl job for r/${actualSubreddit} finished in ${crawlDuration.toFixed(2)} seconds`);
        
        // Cập nhật trạng thái là đã crawl xong nếu crawl_interval là '@once'
        if (config.crawl_interval === '@once') {
          await pool.query(`
            UPDATE crawl_configs
            SET is_active = FALSE, updated_at = NOW()
            WHERE id = $1
          `, [config.id]);
          
          console.log(`[DB] Marked configuration ${config.id} as inactive (one-time execution)`);
        }
      } catch (error) {
        console.error(`Error processing crawler for r/${config.subreddit}:`, error);
      }
    }
    
    // Tạo report tổng kết
    const totalEndTime = Date.now();
    const totalExecutionTime = ((totalEndTime - startHistoricalCrawl) / 1000).toFixed(2);
    
    console.log('\n' + '='.repeat(80));
    console.log('HISTORICAL CRAWL SUMMARY'.padStart(50, ' '));
    console.log('='.repeat(80));
    console.log(`[SUMMARY] Processed ${configs.length} crawl configurations`);
    console.log(`[SUMMARY] Total execution time: ${totalExecutionTime} seconds`);
    console.log(`[SUMMARY] Storage mode: ${config.app.storage}`);
    console.log(`[SUMMARY] Completed at: ${new Date().toISOString()}`);
    console.log('='.repeat(80));
  } catch (error) {
    console.error('[ERROR] Fatal error in historical crawl process:', error);
  } finally {
    // Đóng storage systems
    console.log('\n[CLEANUP] Closing storage systems...');
    await closeStorageSystems();
    
    // Đóng pool connection
    console.log('[CLEANUP] Closing database connections...');
    await pool.end();
    
    console.log('[DONE] Historical crawl process complete!');
  }
}

// Chạy hàm chính
runHistoricalCrawl().catch(error => {
  console.error('[FATAL ERROR] Historical crawl failed:', error);
  process.exit(1);
});