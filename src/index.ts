import { crawlSubredditPosts, crawlPostComments } from './api/postCrawler';
import { config } from './config/config';
import path from 'path';
import fs from 'fs';
import { ensureDirectoryExists } from './utils/fileHelper';
import { setupHttpAgents } from './utils/rotatingRedditClient';
import { closePool } from './utils/postgresHelper';
import { initializeStorageSystems, closeStorageSystems } from './storage/storageFacade';

// Create data directory if it doesn't exist
ensureDirectoryExists(config.app.outputDir);

// Configure HTTP agents to avoid connection issues
(async () => { await setupHttpAgents(); })().catch(err => console.error('Error setting up HTTP agents:', err));

/**
 * Main function to run the Reddit crawler
 */
async function main() {
  // Configure global HTTP agents to avoid connection issues
  setupHttpAgents();
  
  // Initialize all storage systems based on configuration
  await initializeStorageSystems();
  
  console.log(`Using storage type: ${config.app.storage}`);

  // Kiểm tra mode: 'posts' (mặc định) hoặc 'comments'
  const mode = process.argv[2] === 'comments' ? 'comments' : 'posts';
  
  // Kiểm tra xác thực API Reddit
  try {
    if (!config.reddit.clientId || !config.reddit.clientSecret) {
      console.error('ERROR: Reddit API credentials not found. Please set up your .env file based on .env.example');
      return;
    }
    
    if (mode === 'comments') {
      // Chế độ lấy comments từ một bài viết cụ thể
      // Cú pháp: npm start -- comments <post_id> <limit>
      const postId = process.argv[3];
      const commentLimit = Number(process.argv[4]) || 100;
      
      if (!postId) {
        console.error('ERROR: Post ID is required. Usage: npm start -- comments <post_id> <limit>');
        return;
      }
      
      console.log(`Starting Reddit comment crawler for post ${postId} (limit: ${commentLimit})`);
      await crawlPostComments(postId, commentLimit);
      
    } else {
      // Chế độ lấy bài viết từ subreddit (mặc định)
      // Cú pháp: npm start -- <subreddit> <limit> <sort> <timerange> <verbose>
      const subreddit = process.argv[2] || 'programming';
      const limit = Number(process.argv[3]) || 25;
      const sortBy = (process.argv[4] || 'hot') as 'hot' | 'new' | 'top' | 'rising';
      const timeRange = (process.argv[5] || 'week') as 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
      // Tham số verbose kiểm soát việc lấy chi tiết
      const verbose = process.argv[6] !== 'false'; // mặc định là true
      
      console.log(`Starting Reddit crawler for r/${subreddit} (${sortBy}) with verbose mode: ${verbose ? 'ON' : 'OFF'}`);
      await crawlSubredditPosts(subreddit, limit, sortBy, timeRange, verbose);
    }
    
    console.log('Crawling completed successfully!');
  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    // Đóng tất cả kết nối database
    await closeStorageSystems();
    
    // Đóng cả pool PostgreSQL nếu đang sử dụng schema thông thường
    if (config.app.storage === 'postgresql') {
      await closePool();
    }
  }
}

// Run the main function
main().catch(console.error);