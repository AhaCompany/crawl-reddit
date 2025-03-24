// Một script đơn giản để thử nghiệm crawl comments và lưu vào PostgreSQL
const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();

// Kết nối PostgreSQL
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'reddit_data',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '',
});

// Function để lấy được time bucket ID từ datetime
function getTimeBucketId(date) {
  // Lấy giờ từ date
  const hour = date.getUTCHours();
  // Tính time bucket ID (1-24)
  return hour + 1;
}

// Function để làm mờ thời gian đến phút
function obfuscateDatetimeToMinute(date) {
  const newDate = new Date(date);
  newDate.setUTCSeconds(0);
  newDate.setUTCMilliseconds(0);
  return newDate;
}

// Function để chuyển đổi đối tượng sang JSON bytes
function objectToUtf8Bytes(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8');
}

// Function để crawl comments từ một bài viết
async function crawlComments(postId) {
  try {
    console.log(`Crawling comments for post ${postId}...`);
    
    // URL API của Reddit để lấy bài viết và comments
    const url = `https://www.reddit.com/comments/${postId}.json`;
    
    // Headers để tránh bị chặn
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    };
    
    // Gọi API
    const response = await axios.get(url, { headers });
    
    if (!Array.isArray(response.data) || response.data.length < 2) {
      throw new Error('Invalid response format from Reddit API');
    }
    
    // Phần tử đầu tiên là thông tin bài viết
    const postData = response.data[0].data.children[0].data;
    const subreddit = postData.subreddit;
    
    // Phần tử thứ hai là các comments
    const commentsData = response.data[1].data.children;
    
    // Mảng lưu trữ các comments đã xử lý
    const processedComments = [];
    
    // Hàm đệ quy để xử lý comments
    function processComment(comment, depth = 0) {
      // Bỏ qua các "more" comments
      if (comment.kind === 't1') {
        const data = comment.data;
        
        // Tạo đối tượng comment
        const commentContent = {
          id: data.id,
          url: `https://www.reddit.com${data.permalink}`,
          username: data.author || '[deleted]',
          community: `r/${data.subreddit}`,
          body: data.body || '',
          createdAt: new Date(data.created_utc * 1000).toISOString(),
          dataType: "comment",
          parentId: data.parent_id
        };
        
        // Thêm vào mảng
        processedComments.push(commentContent);
        
        // Xử lý các replies nếu có
        if (data.replies && data.replies.data && data.replies.data.children) {
          for (const reply of data.replies.data.children) {
            processComment(reply, depth + 1);
          }
        }
      }
    }
    
    // Xử lý tất cả comments ở level cao nhất
    for (const comment of commentsData) {
      processComment(comment);
    }
    
    console.log(`Processed ${processedComments.length} comments for post ${postId}`);
    
    // Lưu vào PostgreSQL
    for (const comment of processedComments) {
      // Chuyển đổi datetime
      const createdDate = new Date(comment.createdAt);
      const obfuscatedDate = obfuscateDatetimeToMinute(createdDate);
      
      // Clone comment và cập nhật thời gian đã làm mờ
      const commentCopy = {
        ...comment,
        createdAt: obfuscatedDate.toISOString()
      };
      
      // Chuyển đổi thành JSON và encode sang UTF-8
      const contentBytes = objectToUtf8Bytes(commentCopy);
      
      // Tạo TimeBucket từ thời gian gốc (không làm mờ)
      const timeBucketId = getTimeBucketId(createdDate);
      
      // Chuẩn hóa label (community) - lấy phần sau "r/"
      const community = comment.community;
      const label = community.toLowerCase();
      
      try {
        // Insert vào bảng DataEntity
        await pool.query(
          `INSERT INTO DataEntity 
          (uri, datetime, timeBucketId, source, label, content, contentSizeBytes) 
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (uri) DO UPDATE SET
            datetime = $2,
            timeBucketId = $3,
            source = $4,
            label = $5,
            content = $6,
            contentSizeBytes = $7`,
          [
            comment.url,
            createdDate.toISOString(),
            timeBucketId,
            1, // Reddit = 1
            label,
            contentBytes,
            contentBytes.length
          ]
        );
      } catch (error) {
        console.error(`Error storing comment ${comment.id}:`, error);
      }
    }
    
    console.log(`Stored ${processedComments.length} comments to PostgreSQL`);
    return processedComments;
  } catch (error) {
    console.error('Error crawling comments:', error);
    return [];
  } finally {
    // Đóng pool
    await pool.end();
  }
}

// Lấy post ID từ tham số dòng lệnh
const postId = process.argv[2];

if (!postId) {
  console.error('Post ID is required. Usage: node comment-test.js <post_id>');
  process.exit(1);
}

// Chạy hàm crawl
crawlComments(postId)
  .then(() => {
    console.log('Crawling completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });