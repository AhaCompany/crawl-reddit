/**
 * Thu thập dữ liệu lịch sử trực tiếp từ Reddit API (không qua Pushshift)
 * Sử dụng chiến lược xoay vòng tài khoản và phân trang
 */
const fs = require('fs');
const path = require('path');
const { executeRedditRequest, getSubreddit } = require('../dist/utils/rotatingRedditClient');
const { saveToJson, ensureDirectoryExists } = require('../dist/utils/fileHelper');
const { storePosts, storeComments } = require('../dist/storage/storageFacade');
const { formatComments } = require('../dist/utils/comment-fetch');

// === CẤU HÌNH ===
// Tên subreddit cần thu thập dữ liệu
const SUBREDDIT = 'cryptocurrency'; // Thay đổi tên subreddit tại đây

// Số ngày cần thu thập (tối đa)
const DAYS_TO_COLLECT = 30;

// Số bài viết tối đa mỗi request
const LIMIT_PER_REQUEST = 100;

// Kiểu sắp xếp
const SORT_TYPE = 'new'; // Có thể là 'new', 'hot', 'top'

// Thời gian cho kiểu sắp xếp 'top'
const TIME_PERIOD = 'month'; // 'hour', 'day', 'week', 'month', 'year', 'all'

// Xử lý comments
const FETCH_COMMENTS = process.env.CRAWL_COMMENTS === 'true';

// === SETUP ===
// Tạo thư mục logs nếu chưa tồn tại
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
const logFile = path.join(logDir, 'direct-reddit-historical.log');

// Hàm ghi log
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  console.log(message);
  fs.appendFileSync(logFile, logMessage);
}

// Hàm delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Thu thập dữ liệu bài viết từ subreddit
 */
async function collectHistoricalPosts() {
  log(`=== Bắt đầu thu thập dữ liệu lịch sử từ Reddit API ===`);
  log(`Subreddit: r/${SUBREDDIT}`);
  log(`Thời gian: ${DAYS_TO_COLLECT} ngày`);
  log(`Sắp xếp theo: ${SORT_TYPE}${SORT_TYPE === 'top' ? `, thời gian: ${TIME_PERIOD}` : ''}`);
  log(`Thu thập comments: ${FETCH_COMMENTS ? 'Có' : 'Không'}`);
  
  // Tạo thư mục đầu ra
  const outputDir = path.join(process.cwd(), 'data', SUBREDDIT);
  ensureDirectoryExists(outputDir);
  
  // Thư mục cho comments
  const commentsDir = path.join(outputDir, 'comments');
  if (FETCH_COMMENTS) {
    ensureDirectoryExists(commentsDir);
  }
  
  // Tên file dữ liệu chính
  const date = new Date().toISOString().split('T')[0];
  const mainFilePath = path.join(outputDir, `reddit_direct_${SORT_TYPE}_${date}.json`);
  
  // Biến theo dõi
  let allPosts = [];
  let oldestPostDate = null;
  let after = null; // Tham số phân trang
  let pageCount = 0;
  const maxPages = 100; // Giới hạn số trang (an toàn)
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - DAYS_TO_COLLECT);
  const startTimestamp = Math.floor(startDate.getTime() / 1000);
  
  log(`Sẽ dừng khi bài viết cũ hơn: ${new Date(startTimestamp * 1000).toISOString()}`);
  
  // Thu thập dữ liệu theo từng trang
  while (pageCount < maxPages) {
    pageCount++;
    log(`\n[PAGE ${pageCount}] Đang thu thập trang ${pageCount}...`);
    
    try {
      let pagePosts = [];
      
      // Sử dụng executeRedditRequest để xoay vòng tài khoản
      await executeRedditRequest(async (client) => {
        // Lấy subreddit
        const subredditObj = await getSubreddit(SUBREDDIT);
        
        // Chuẩn bị options
        const options = { limit: LIMIT_PER_REQUEST };
        if (after) {
          options.after = after;
        }
        
        // Lấy bài viết theo loại sắp xếp
        if (SORT_TYPE === 'new') {
          pagePosts = await subredditObj.getNew(options);
        } else if (SORT_TYPE === 'hot') {
          pagePosts = await subredditObj.getHot(options);
        } else if (SORT_TYPE === 'top') {
          options.time = TIME_PERIOD;
          pagePosts = await subredditObj.getTop(options);
        }
        
        log(`Đã nhận ${pagePosts.length} bài viết từ r/${SUBREDDIT}`);
        return true;
      });
      
      // Kiểm tra nếu không còn bài viết
      if (!pagePosts || pagePosts.length === 0) {
        log('Không còn bài viết nào. Kết thúc thu thập dữ liệu.');
        break;
      }
      
      // Cập nhật biến phân trang
      if (pagePosts.length > 0) {
        after = 't3_' + pagePosts[pagePosts.length - 1].id;
      }
      
      // Xử lý và định dạng bài viết
      const formattedPosts = pagePosts.map(post => ({
        id: post.id,
        title: post.title || '',
        author: post.author ? (typeof post.author === 'string' ? post.author : post.author.name || '[deleted]') : '[deleted]',
        author_fullname: post.author_fullname,
        selftext: post.selftext || '',
        selftext_html: post.selftext_html || '',
        body: post.selftext || '',
        url: post.url,
        permalink: `https://www.reddit.com${post.permalink}`,
        thumbnail: post.thumbnail !== 'self' && post.thumbnail !== 'default' ? post.thumbnail : undefined,
        created_utc: post.created_utc,
        subreddit: post.subreddit ? (typeof post.subreddit === 'string' ? post.subreddit : post.subreddit.display_name) : '',
        subreddit_id: post.subreddit_id,
        subreddit_type: post.subreddit_type,
        score: post.score || 0,
        num_comments: post.num_comments || 0,
        upvote_ratio: post.upvote_ratio || 0,
        ups: post.ups,
        downs: post.downs,
        is_original_content: !!post.is_original_content,
        is_self: !!post.is_self,
        is_video: !!post.is_video,
        is_gallery: !!post.is_gallery,
        over_18: !!post.over_18,
        spoiler: !!post.spoiler,
        stickied: !!post.stickied,
        archived: !!post.archived,
        locked: !!post.locked,
        link_flair_text: post.link_flair_text,
        link_flair_css_class: post.link_flair_css_class,
        gilded: post.gilded,
        total_awards_received: post.total_awards_received,
      }));
      
      // Lưu bài viết trong trang này
      const pageFilePath = path.join(outputDir, `reddit_${SORT_TYPE}_page${pageCount}_${date}.json`);
      await storePosts(SUBREDDIT, formattedPosts, pageFilePath);
      
      log(`Đã lưu ${formattedPosts.length} bài viết từ trang ${pageCount}`);
      
      // Kiểm tra thời gian bài viết cũ nhất
      if (formattedPosts.length > 0) {
        const oldestPost = formattedPosts.reduce((oldest, post) => 
          post.created_utc < oldest.created_utc ? post : oldest, formattedPosts[0]);
        
        oldestPostDate = new Date(oldestPost.created_utc * 1000);
        log(`Bài viết cũ nhất trong trang này: ${oldestPostDate.toISOString()} (${oldestPost.title})`);
        
        // Kiểm tra xem đã đủ số ngày chưa
        if (oldestPost.created_utc < startTimestamp) {
          log(`Đã đạt đến giới hạn thời gian ${DAYS_TO_COLLECT} ngày. Dừng thu thập.`);
          // Lọc ra các bài viết trong khoảng thời gian
          formattedPosts = formattedPosts.filter(post => post.created_utc >= startTimestamp);
          log(`Còn lại ${formattedPosts.length} bài viết trong khoảng thời gian sau khi lọc`);
          
          // Thêm các bài viết được lọc vào danh sách tổng
          allPosts = [...allPosts, ...formattedPosts];
          break;
        }
      }
      
      // Thêm bài viết vào danh sách tổng
      allPosts = [...allPosts, ...formattedPosts];
      
      // Thu thập comments nếu được bật
      if (FETCH_COMMENTS) {
        await fetchCommentsForPosts(formattedPosts, commentsDir);
      }
      
      // Nghỉ giữa các trang
      log(`Đợi 2 giây trước khi lấy trang tiếp theo...`);
      await delay(2000);
      
    } catch (error) {
      log(`LỖI khi thu thập trang ${pageCount}: ${error.message}`);
      log(`Đợi 30 giây trước khi thử lại...`);
      await delay(30000);
      pageCount--; // Thử lại trang này
    }
  }
  
  // Lưu tất cả bài viết vào một file
  if (allPosts.length > 0) {
    saveToJson(mainFilePath, allPosts);
    log(`Đã lưu tổng cộng ${allPosts.length} bài viết vào ${mainFilePath}`);
  }
  
  log(`\n=== Hoàn thành thu thập dữ liệu ===`);
  log(`Tổng số bài viết đã thu thập: ${allPosts.length}`);
  log(`Số trang đã thu thập: ${pageCount}`);
  if (oldestPostDate) {
    log(`Bài viết cũ nhất: ${oldestPostDate.toISOString()}`);
  }
}

/**
 * Thu thập comments cho nhiều bài viết
 */
async function fetchCommentsForPosts(posts, outputDir) {
  // Số bài viết xử lý song song
  const batchSize = 3;
  log(`\n[COMMENTS] Bắt đầu thu thập comments cho ${posts.length} bài viết...`);
  
  // Xử lý theo batch
  for (let i = 0; i < posts.length; i += batchSize) {
    const batch = posts.slice(i, i + batchSize);
    log(`[COMMENTS] Đang xử lý batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(posts.length/batchSize)} (${batch.length} bài viết)`);
    
    const promises = batch.map(post => fetchCommentsForPost(post.id, outputDir));
    await Promise.all(promises);
    
    // Chờ 2 giây giữa các batch
    if (i + batchSize < posts.length) {
      log(`[COMMENTS] Đợi 2 giây trước batch tiếp theo...`);
      await delay(2000);
    }
  }
  
  log(`[COMMENTS] Đã hoàn thành thu thập comments`);
}

/**
 * Thu thập comments cho một bài viết
 */
async function fetchCommentsForPost(postId, outputDir) {
  try {
    log(`[COMMENTS] Đang lấy comments cho bài viết ${postId}...`);
    
    let commentsList = [];
    
    await executeRedditRequest(async (client) => {
      // Lấy submission
      const submission = await client.getSubmission(postId);
      
      // Lấy toàn bộ comments
      const comments = await submission.comments.fetchAll();
      
      // Chuyển đổi sang định dạng RedditComment
      commentsList = formatComments(comments);
      
      log(`[COMMENTS] Đã nhận ${commentsList.length} comments cho bài viết ${postId}`);
      return true;
    });
    
    // Lưu comments vào file và database
    if (commentsList.length > 0) {
      const commentFilePath = path.join(outputDir, `post_${postId}_comments.json`);
      await storeComments(postId, commentsList, commentFilePath);
      log(`[COMMENTS] Đã lưu ${commentsList.length} comments cho bài viết ${postId}`);
    }
    
  } catch (error) {
    log(`[COMMENTS] LỖI khi lấy comments cho bài viết ${postId}: ${error.message}`);
  }
}

// Xử lý helper function formatComments nếu chưa được export
function formatComments(comments) {
  if (!Array.isArray(comments)) return [];
  
  return comments.map(comment => {
    // Xử lý comment
    const formattedComment = {
      id: comment.id,
      author: comment.author ? (typeof comment.author === 'string' ? comment.author : comment.author.name || '[deleted]') : '[deleted]',
      body: comment.body || '',
      permalink: comment.permalink ? `https://www.reddit.com${comment.permalink}` : '',
      created_utc: comment.created_utc,
      score: comment.score || 0,
      subreddit: comment.subreddit ? (typeof comment.subreddit === 'string' ? comment.subreddit : comment.subreddit.display_name) : '',
      is_submitter: !!comment.is_submitter,
      parent_id: comment.parent_id || '',
      depth: comment.depth || 0
    };
    
    // Xử lý replies
    if (comment.replies && Array.isArray(comment.replies)) {
      formattedComment.replies = formatComments(comment.replies);
    }
    
    return formattedComment;
  });
}

// Chạy script
collectHistoricalPosts().catch(error => {
  log(`LỖI NGHIÊM TRỌNG: ${error.message}`);
  console.error(error);
});