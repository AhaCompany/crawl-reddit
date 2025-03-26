/**
 * Script đặc biệt để nhập tất cả các bài viết hiện có vào hệ thống theo dõi comments
 * Chạy 1 lần khi muốn nhập dữ liệu ban đầu
 */
import { CommentTracker } from './utils/commentTracker';
import { config } from './config/config';
import { setupHttpAgents } from './utils/proxy';
import { ensureDirectoryExists } from './utils/fileHelper';
import { Pool } from 'pg';

// Đảm bảo thư mục dữ liệu tồn tại
ensureDirectoryExists(config.app.outputDir);

// Cấu hình HTTP agents
setupHttpAgents();

// Tạo instance của CommentTracker
const commentTracker = new CommentTracker();

// Tạo kết nối pool riêng để truy vấn trực tiếp
const pool = new Pool({
  host: config.postgresql.host,
  port: config.postgresql.port,
  database: config.postgresql.database,
  user: config.postgresql.user,
  password: config.postgresql.password,
});

/**
 * Hàm nhập tất cả bài viết hiện có vào theo dõi
 */
async function importAllPosts() {
  try {
    // Khởi tạo CommentTracker
    await commentTracker.initialize();
    
    console.log('='.repeat(50));
    console.log('Mass Import All Posts for Comment Tracking');
    console.log('='.repeat(50));
    
    // Lấy số ngày theo dõi từ tham số dòng lệnh hoặc mặc định là 7
    const trackingDays = process.argv[2] ? parseInt(process.argv[2]) : 7;
    
    // Lấy tần suất quét mặc định từ tham số dòng lệnh hoặc mặc định là 30m
    const frequency = process.argv[3] || '30m';
    
    console.log(`Will import all posts with tracking for ${trackingDays} days and frequency ${frequency}`);
    
    // Lấy tổng số bài viết tiềm năng
    const countResult = await pool.query(`
      SELECT COUNT(*) as total 
      FROM DataEntity 
      WHERE uri LIKE '%/comments/%' 
      AND SUBSTRING(uri FROM 'comments/([^/]+)/') IS NOT NULL
    `);
    
    const totalPosts = parseInt(countResult.rows[0].total);
    console.log(`Found ${totalPosts} potential posts in DataEntity`);
    
    // Lấy số bài viết đã theo dõi
    const trackedResult = await pool.query(`
      SELECT COUNT(*) as tracked 
      FROM post_comment_tracking
    `);
    
    const trackedPosts = parseInt(trackedResult.rows[0].tracked || '0');
    console.log(`Already tracking ${trackedPosts} posts in post_comment_tracking`);
    
    // Tính toán bài viết cần thêm
    const postsToAdd = totalPosts - trackedPosts;
    console.log(`Need to add approximately ${postsToAdd} posts`);
    
    if (postsToAdd <= 0) {
      console.log('No new posts to add. All posts are already being tracked.');
      return;
    }
    
    // Xác nhận từ người dùng
    console.log(`\nWARNING: This will import ALL posts from DataEntity that are not already tracked.`);
    console.log(`This operation may take a long time for large databases.`);
    console.log(`Press Ctrl+C within 5 seconds to cancel...`);
    
    // Chờ 5 giây cho phép hủy
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('\nProceeding with import...');
    
    // Đặt kích thước batch để tránh quá tải
    const batchSize = 1000;
    let importedTotal = 0;
    let offset = 0;
    
    // Xử lý theo batch
    while (true) {
      console.log(`Processing batch at offset ${offset}...`);
      
      // Lấy các bài viết mới từ bảng DataEntity mà chưa có trong tracking
      // Sử dụng datetime trực tiếp mà không chuyển đổi vì có thể đã là timestamp
      const result = await pool.query(
        `SELECT 
          SUBSTRING(uri FROM 'comments/([^/]+)/') AS post_id,
          label AS subreddit,
          datetime AS created_at
        FROM 
          DataEntity
        WHERE 
          uri LIKE '%/comments/%'
          AND SUBSTRING(uri FROM 'comments/([^/]+)/') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM post_comment_tracking 
            WHERE post_id = SUBSTRING(uri FROM 'comments/([^/]+)/')
          )
        ORDER BY 
          datetime DESC
        LIMIT $1
        OFFSET $2`,
        [batchSize, offset]
      );
      
      if (result.rows.length === 0) {
        console.log('No more posts to process. Import completed.');
        break;
      }
      
      console.log(`Found ${result.rows.length} posts to add in current batch`);
      
      // Thêm từng bài viết vào tracking
      let batchCount = 0;
      for (const row of result.rows) {
        try {
          await commentTracker.addPostForTracking(
            row.post_id,
            row.subreddit,
            null, // title chưa biết
            0,    // comment_count ban đầu là 0
            frequency, // tần suất quét mặc định
            trackingDays
          );
          batchCount++;
        } catch (error) {
          console.error(`Error adding post ${row.post_id}:`, error);
        }
      }
      
      importedTotal += batchCount;
      console.log(`Added ${batchCount} posts in current batch. Total so far: ${importedTotal}`);
      
      // Cập nhật offset cho batch tiếp theo
      offset += batchSize;
      
      // Kiểm tra nếu đã xử lý tất cả
      if (result.rows.length < batchSize) {
        console.log('Processed all available posts.');
        break;
      }
    }
    
    // Tóm tắt kết quả
    console.log('\n='.repeat(50));
    console.log('Import Summary:');
    console.log(`- Total posts in database: ${totalPosts}`);
    console.log(`- Already tracked posts: ${trackedPosts}`);
    console.log(`- Newly imported posts: ${importedTotal}`);
    console.log(`- Total posts now tracked: ${trackedPosts + importedTotal}`);
    console.log('='.repeat(50));
    
    console.log('\nMass import completed.');
  } catch (error) {
    console.error('Error in mass import:', error);
  } finally {
    // Đóng kết nối
    await commentTracker.close();
    await pool.end();
  }
}

// Xử lý tắt chương trình
process.on('SIGINT', async () => {
  console.log('\nImport aborted by user.');
  await commentTracker.close();
  await pool.end();
  process.exit(0);
});

// Chạy chương trình
importAllPosts().catch(async (error) => {
  console.error('Fatal error:', error);
  await commentTracker.close();
  await pool.end();
  process.exit(1);
});