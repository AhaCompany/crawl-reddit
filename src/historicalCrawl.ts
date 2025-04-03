/**
 * historicalCrawl.ts
 * Tiện ích crawl dữ liệu lịch sử từ subreddits dựa trên cấu hình trong database
 * Hỗ trợ phân trang để lấy tất cả các bài post trong khoảng thời gian xác định
 */

import { Pool } from 'pg';
import { config } from './config/config';
import { crawlSubredditPostsWithPagination } from './api/paginatedPostCrawler';
import { setupHttpAgents } from './utils/rotatingRedditClient';

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
  // Khởi tạo pool connection cho PostgreSQL
  const pool = new Pool({
    host: config.postgresql.host,
    port: config.postgresql.port,
    database: config.postgresql.database,
    user: config.postgresql.user,
    password: config.postgresql.password,
  });
  
  try {
    console.log('Starting historical data crawl...');
    
    // Thiết lập HTTP agents cho crawling
    await setupHttpAgents();
    
    // Lấy tất cả cấu hình crawl từ database
    const result = await pool.query(`
      SELECT id, subreddit, crawl_interval, post_limit, sort_by, time_range, 
             is_active, start_time, end_time, use_pagination, max_pages
      FROM crawl_configs
      WHERE is_active = TRUE AND use_pagination = TRUE
      ORDER BY id
    `);
    
    // Lấy các cấu hình
    const configs: CrawlerConfig[] = result.rows;
    console.log(`Found ${configs.length} active historical crawl configurations`);
    
    // Nếu không có cấu hình nào, thoát
    if (configs.length === 0) {
      console.log('No active historical crawl configurations found.');
      return;
    }
    
    // Xử lý từng cấu hình
    for (const config of configs) {
      console.log(`\n=== Processing crawler for r/${config.subreddit} ===`);
      console.log(`Configuration: limit=${config.post_limit}, sort=${config.sort_by}, time=${config.time_range}`);
      console.log(`Pagination: max ${config.max_pages} pages`);
      
      if (config.start_time) {
        console.log(`Start time: ${config.start_time.toISOString()}`);
      }
      
      if (config.end_time) {
        console.log(`End time: ${config.end_time.toISOString()}`);
      }
      
      try {
        // Xử lý tên subreddit (loại bỏ phần thời gian nếu có)
        let actualSubreddit = config.subreddit;
        const configPattern = /^([a-zA-Z0-9_]+)-\d{8}-\d{2}$/;
        const match = config.subreddit.match(configPattern);
        if (match && match[1]) {
          actualSubreddit = match[1];
          console.log(`Using actual subreddit name ${actualSubreddit} for config ${config.subreddit}`);
        }
        
        // Chuyển đổi start_time và end_time sang timestamp
        const startTimestamp = config.start_time ? Math.floor(config.start_time.getTime() / 1000) : null;
        const endTimestamp = config.end_time ? Math.floor(config.end_time.getTime() / 1000) : null;
        
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
        
        // Cập nhật trạng thái là đã crawl xong nếu crawl_interval là '@once'
        if (config.crawl_interval === '@once') {
          await pool.query(`
            UPDATE crawl_configs
            SET is_active = FALSE, updated_at = NOW()
            WHERE id = $1
          `, [config.id]);
          
          console.log(`Marked configuration ${config.id} as inactive (one-time execution)`);
        }
      } catch (error) {
        console.error(`Error processing crawler for r/${config.subreddit}:`, error);
      }
    }
    
    console.log('\nHistorical crawl completed!');
  } catch (error) {
    console.error('Error in historical crawl process:', error);
  } finally {
    // Đóng pool connection
    await pool.end();
  }
}

// Chạy hàm chính
runHistoricalCrawl().catch(error => {
  console.error('Fatal error in historical crawl:', error);
  process.exit(1);
});