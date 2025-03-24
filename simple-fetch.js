// Sử dụng fetch API thay vì Axios hoặc https
const fetch = require('node-fetch');
const fs = require('fs');

async function fetchRedditPost(postId) {
  try {
    console.log(`Fetching post ${postId}...`);
    const url = `https://www.reddit.com/comments/${postId}.json?raw_json=1&limit=20`;
    console.log(`URL: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
      timeout: 30000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Response received and parsed!');
    
    // Lưu vào file tạm thời để phân tích
    fs.writeFileSync(`data/${postId}_raw.json`, JSON.stringify(data, null, 2));
    console.log(`Raw data saved to data/${postId}_raw.json`);
    
    return data;
  } catch (error) {
    console.error('Error fetching Reddit data:', error);
    return null;
  }
}

// Lấy post ID từ tham số dòng lệnh
const postId = process.argv[2];

if (!postId) {
  console.error('Post ID is required. Usage: node simple-fetch.js <post_id>');
  process.exit(1);
}

// Đảm bảo thư mục data tồn tại
if (!fs.existsSync('data')) {
  fs.mkdirSync('data');
}

// Gọi hàm fetch
fetchRedditPost(postId);