const axios = require('axios');

// Bài post có nhiều comments để kiểm tra phân trang
const TEST_POST_ID = '17a1iam'; // Một bài viết từ r/machinelearning có nhiều comments

/**
 * Kiểm tra phân trang của comments sử dụng PullPush API
 */
async function testCommentPagination() {
  const url = 'https://api.pullpush.io/reddit/comment/search/';
  const allComments = [];
  let totalRequests = 0;
  
  let hasMore = true;
  let after = null;
  
  while (hasMore) {
    totalRequests++;
    console.log(`Request #${totalRequests}, after=${after || 'null'}`);
    
    try {
      const params = {
        article: TEST_POST_ID,
        size: 100,
        sort: 'desc'
      };
      
      // Thêm tham số after nếu không phải request đầu tiên
      if (after) {
        params.after = after;
      }
      
      const response = await axios.get(url, { params });
      
      if (!response.data || !Array.isArray(response.data.data)) {
        console.log('Response không đúng định dạng');
        break;
      }
      
      const comments = response.data.data;
      console.log(`Nhận được ${comments.length} comments trong request này.`);
      
      if (comments.length === 0) {
        hasMore = false;
        console.log('Không còn comments');
        break;
      }
      
      // Thêm comments vào mảng tổng
      allComments.push(...comments);
      
      // Lấy giá trị after từ comment cuối cùng
      if (comments.length > 0) {
        const lastComment = comments[comments.length - 1];
        after = lastComment.created_utc;
        console.log(`Timestamp của comment cuối: ${after}`);
        console.log(`Comment ID cuối: ${lastComment.id}`);
      } else {
        hasMore = false;
      }
      
      // Nếu trả về ít hơn 100 comments, chắc chắn là không còn comments nữa
      if (comments.length < 100) {
        hasMore = false;
        console.log('Lấy xong tất cả comments (batch size < 100)');
      }
      
      // Tạm dừng để tránh quá tải API
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error('Lỗi khi lấy comments:', error.message);
      hasMore = false;
    }
  }
  
  // In kết quả
  console.log(`\n===== KẾT QUẢ =====`);
  console.log(`Tổng số comments lấy được: ${allComments.length}`);
  console.log(`Tổng số requests: ${totalRequests}`);
  
  // Kiểm tra comment IDs có bị trùng lặp không
  const uniqueIds = new Set(allComments.map(c => c.id));
  console.log(`Số lượng comment IDs duy nhất: ${uniqueIds.size}`);
  console.log(`Số lượng comment IDs trùng lặp: ${allComments.length - uniqueIds.size}`);
  
  // In ra một mẫu vài comments đầu và cuối để kiểm tra
  console.log(`\nMẫu COMMENTS ĐẦU TIÊN:`);
  for (let i = 0; i < Math.min(3, allComments.length); i++) {
    console.log(`[${i}] ID: ${allComments[i].id}, Time: ${new Date(allComments[i].created_utc * 1000).toISOString()}`);
  }
  
  console.log(`\nMẫu COMMENTS CUỐI CÙNG:`);
  for (let i = Math.max(0, allComments.length - 3); i < allComments.length; i++) {
    console.log(`[${i}] ID: ${allComments[i].id}, Time: ${new Date(allComments[i].created_utc * 1000).toISOString()}`);
  }
}

// Chạy kiểm tra
testCommentPagination().catch(console.error);