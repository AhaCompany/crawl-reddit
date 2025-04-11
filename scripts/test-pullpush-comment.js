const axios = require('axios');

// Test specific Reddit post IDs
const testPostIds = [
  '1jvndi5', // Một bài viết từ logs của bạn
  '1juy6wx', // Một bài viết khác từ logs của bạn
  '17a1iam'  // Một bài viết ngẫu nhiên khác từ r/machinelearning có nhiều comments
];

/**
 * Fetch comments for a post using PullPush API
 */
async function fetchCommentsForPost(postId) {
  console.log(`\n======= Thử nghiệm lấy comments cho post ${postId} =======`);
  
  // Thử với cấu trúc URL đường dẫn 1 - link_id parameter
  try {
    const url1 = 'https://api.pullpush.io/reddit/search/comment/';
    const params1 = {
      link_id: `t3_${postId}`,
      size: 100
    };
    
    console.log(`Cấu trúc 1: ${url1} với params`, params1);
    const response1 = await axios.get(url1, { params: params1 });
    
    console.log(`Kết quả cấu trúc 1: ${response1.data.data ? response1.data.data.length : 0} comments`);
    if (response1.data.data && response1.data.data.length > 0) {
      console.log("Mẫu comment đầu tiên:", JSON.stringify(response1.data.data[0], null, 2).substring(0, 200) + "...");
    }
  } catch (error) {
    console.error(`Lỗi cấu trúc 1:`, error.message);
  }
  
  // Thử với cấu trúc URL đường dẫn 2 - subreddit + article parameter
  try {
    const url2 = 'https://api.pullpush.io/reddit/comment/search/';
    const params2 = {
      article: postId,
      size: 100
    };
    
    console.log(`Cấu trúc 2: ${url2} với params`, params2);
    const response2 = await axios.get(url2, { params: params2 });
    
    console.log(`Kết quả cấu trúc 2: ${response2.data.data ? response2.data.data.length : 0} comments`);
    if (response2.data.data && response2.data.data.length > 0) {
      console.log("Mẫu comment đầu tiên:", JSON.stringify(response2.data.data[0], null, 2).substring(0, 200) + "...");
    }
  } catch (error) {
    console.error(`Lỗi cấu trúc 2:`, error.message);
  }
  
  // Thử với cấu trúc URL đường dẫn 3 - sử dụng Reddit API style
  try {
    const url3 = `https://api.pullpush.io/reddit/r/all/comments/${postId}`;
    
    console.log(`Cấu trúc 3: ${url3}`);
    const response3 = await axios.get(url3);
    
    console.log(`Kết quả cấu trúc 3: ${response3.data ? (Array.isArray(response3.data) ? response3.data.length : 'Không phải mảng') : 0} phần tử`);
    if (response3.data && Array.isArray(response3.data) && response3.data.length > 0) {
      console.log("Mẫu dữ liệu:", JSON.stringify(response3.data[0], null, 2).substring(0, 200) + "...");
    }
  } catch (error) {
    console.error(`Lỗi cấu trúc 3:`, error.message);
  }
}

// Thực thi kiểm tra cho mỗi post ID trong danh sách
async function runTests() {
  for (const postId of testPostIds) {
    await fetchCommentsForPost(postId);
  }
}

// Chạy các bài kiểm tra
runTests().catch(console.error);