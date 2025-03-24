/**
 * Command-line tool để quản lý việc theo dõi comments
 */
import { CommentTracker } from './utils/commentTracker';
import { Pool } from 'pg';
import { config } from './config/config';

// Phân tích tham số dòng lệnh
const args = process.argv.slice(2);
const command = args[0];

// Tạo instance của CommentTracker
const commentTracker = new CommentTracker();

// Tạo kết nối pool
const pool = new Pool({
  host: config.postgresql.host,
  port: config.postgresql.port,
  database: config.postgresql.database,
  user: config.postgresql.user,
  password: config.postgresql.password,
});

// Xử lý các lệnh
async function processCommand() {
  try {
    if (!command) {
      printHelp();
      return;
    }

    switch (command) {
      case 'list':
        await listTrackedPosts();
        break;

      case 'add':
        if (args.length < 2) {
          console.error('Missing post_id parameter');
          console.log('Usage: npm run comment-track -- add <post_id> [subreddit] [frequency] [days]');
          return;
        }
        
        const postId = args[1];
        const subreddit = args[2] || 'unknown';
        const frequency = args[3] || '30m';
        const days = parseInt(args[4] || '3', 10);
        
        await commentTracker.addPostForTracking(postId, subreddit, null, 0, frequency, days);
        console.log(`Added post ${postId} for comment tracking`);
        break;

      case 'disable':
        if (args.length < 2) {
          console.error('Missing post_id parameter');
          console.log('Usage: npm run comment-track -- disable <post_id>');
          return;
        }
        
        await commentTracker.disablePostTracking(args[1]);
        console.log(`Disabled tracking for post ${args[1]}`);
        break;

      case 'process':
        const limit = parseInt(args[1] || '5', 10);
        console.log(`Processing up to ${limit} posts for comment crawling...`);
        await commentTracker.initialize();
        await commentTracker.processNextPosts(limit);
        await commentTracker.close();
        break;

      case 'scan':
        console.log('Scanning for new posts to track...');
        await commentTracker.initialize();
        await commentTracker.addNewPostsFromDataEntity(
          parseInt(args[1] || '20', 10),
          parseInt(args[2] || '3', 10)
        );
        await commentTracker.close();
        break;

      case 'cleanup':
        console.log('Cleaning up expired tracking...');
        await commentTracker.cleanupTracking();
        break;

      case 'help':
        printHelp();
        break;

      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
    }
  } catch (error) {
    console.error('Error processing command:', error);
  } finally {
    await pool.end();
  }
}

// In danh sách bài viết đang theo dõi
async function listTrackedPosts() {
  try {
    const result = await pool.query(`
      SELECT 
        post_id, 
        subreddit, 
        title, 
        comment_count, 
        last_comment_id,
        last_crawled_at,
        first_seen_at,
        is_active,
        priority,
        crawl_frequency,
        check_until
      FROM 
        post_comment_tracking
      ORDER BY 
        is_active DESC,
        priority DESC,
        last_crawled_at DESC
    `);

    console.log('='.repeat(100));
    console.log('COMMENT TRACKING');
    console.log('='.repeat(100));
    
    if (result.rows.length === 0) {
      console.log('No posts being tracked');
    } else {
      console.log(`Found ${result.rows.length} tracked posts:`);
      console.log('-'.repeat(100));
      
      // In header
      console.log('Post ID | Subreddit | Title | Comments | Last Crawled | Active | Priority | Frequency');
      console.log('-'.repeat(100));
      
      // In dữ liệu
      for (const row of result.rows) {
        // Cắt ngắn tiêu đề nếu quá dài
        const title = row.title ? (row.title.length > 30 ? row.title.substring(0, 27) + '...' : row.title) : '<no title>';
        
        console.log(
          `${row.post_id} | ` +
          `r/${row.subreddit} | ` +
          `${title} | ` +
          `${row.comment_count} | ` +
          `${row.last_crawled_at.toISOString().replace('T', ' ').substring(0, 16)} | ` +
          `${row.is_active ? 'Yes' : 'No'} | ` +
          `${row.priority} | ` +
          `${row.crawl_frequency}`
        );
      }
    }
    
    console.log('='.repeat(100));
  } catch (error) {
    console.error('Error listing tracked posts:', error);
  }
}

// In hướng dẫn sử dụng
function printHelp() {
  console.log(`
Comment Tracking Tool
=========================

Usage: npm run comment-track -- <command> [options]

Commands:
  list                             List all tracked posts
  add <post_id> [subreddit] [frequency] [days]  
                                   Add a post for comment tracking
  disable <post_id>                Disable tracking for a post
  process [limit]                  Process next batch of posts
  scan [limit] [days]              Scan for new posts to track
  cleanup                          Clean up expired tracking
  help                             Show this help message

Examples:
  npm run comment-track -- list
  npm run comment-track -- add 1jdth3j bitcoin 15m 3
  npm run comment-track -- disable 1jdth3j
  npm run comment-track -- process 10
  npm run comment-track -- scan 30 5

Parameters:
  <post_id>    Reddit post ID (from URL)
  [subreddit]  Subreddit name (without r/)
  [frequency]  Crawl frequency (e.g., 5m, 1h, 30s)
  [days]       Number of days to track comments
  [limit]      Number of posts to process
  `);
}

// Thực thi lệnh
processCommand().catch(console.error);