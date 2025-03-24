// Một script đơn giản sử dụng Node.js standard libraries để lấy comments từ Reddit
// Và lưu vào file JSON
const https = require('https');
const fs = require('fs');
const path = require('path');

// Hàm lấy comments từ một bài viết
function fetchComments(postId, callback) {
  console.log(`Fetching comments for post ${postId}...`);
  
  // URL Reddit JSON API
  const url = `https://www.reddit.com/comments/${postId}.json?raw_json=1&limit=50`;
  
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    timeout: 60000 // 60 seconds timeout
  };
  
  console.log(`Calling ${url}`);
  
  https.get(url, options, (res) => {
    let data = '';
    
    // Nhận dữ liệu
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    // Hoàn thành
    res.on('end', () => {
      if (res.statusCode === 200) {
        try {
          const jsonData = JSON.parse(data);
          console.log('Successfully parsed response');
          callback(null, jsonData);
        } catch (error) {
          callback(`Error parsing JSON: ${error.message}`, null);
        }
      } else {
        callback(`Status code: ${res.statusCode}, message: ${res.statusMessage}`, null);
      }
    });
  }).on('error', (error) => {
    callback(`Request error: ${error.message}`, null);
  }).on('timeout', () => {
    callback('Request timed out', null);
  });
}

// Hàm xử lý comments và lưu vào file
function processAndSaveComments(postId) {
  fetchComments(postId, (error, data) => {
    if (error) {
      console.error('Error:', error);
      return;
    }
    
    if (!Array.isArray(data) || data.length < 2) {
      console.error('Invalid response format');
      return;
    }
    
    // Thông tin bài viết
    const postInfo = data[0].data.children[0].data;
    console.log(`Retrieved post: ${postInfo.title}`);
    
    // Comments
    const commentsData = data[1].data.children;
    const processedComments = [];
    
    // Hàm đệ quy xử lý comments
    function processComment(comment, depth = 0) {
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
    
    // Xử lý tất cả comments
    for (const comment of commentsData) {
      processComment(comment);
    }
    
    console.log(`Processed ${processedComments.length} comments`);
    
    // Lưu vào file JSON
    const outputDir = path.join(__dirname, '../../data/comments');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const filePath = path.join(outputDir, `${postId}_comments.json`);
    fs.writeFileSync(filePath, JSON.stringify(processedComments, null, 2));
    console.log(`Comments saved to ${filePath}`);
    
    // In mẫu một vài comments đầu tiên
    if (processedComments.length > 0) {
      console.log('\nSample comment:');
      console.log(JSON.stringify(processedComments[0], null, 2));
    }
  });
}

// Lấy post ID từ tham số dòng lệnh
const postId = process.argv[2];

if (!postId) {
  console.error('Post ID is required. Usage: node comment-fetch.js <post_id>');
  process.exit(1);
}

// Thực hiện lấy và xử lý comments
processAndSaveComments(postId);