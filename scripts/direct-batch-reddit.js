/**
 * Thu thập dữ liệu lịch sử cho nhiều subreddit trực tiếp từ Reddit API
 * (Giải pháp thay thế khi Pushshift API không khả dụng)
 */
const fs = require('fs');
const path = require('path');
const { executeRedditRequest, getSubreddit } = require('../dist/utils/rotatingRedditClient');
const { saveToJson, ensureDirectoryExists } = require('../dist/utils/fileHelper');
const { storePosts, storeComments } = require('../dist/storage/storageFacade');

// === CẤU HÌNH ===
// Danh sách subreddit
const ALL_SUBREDDITS = [
  // Thay đổi danh sách của bạn tại đây
  'cryptocurrency',
  'bitcoin',
  'ethtrader',
  // Thêm các subreddit khác...
];

// Số lượng subreddit trong mỗi batch
const BATCH_SIZE = 5;

// Thời gian chờ giữa các batch (milliseconds)
const BATCH_DELAY = 10 * 60 * 1000; // 10 phút

// Số ngày cần thu thập dữ liệu
const DAYS_TO_COLLECT = 30;

// Cấu hình thu thập bài viết
const POSTS_PER_PAGE = 100;
const MAX_PAGES = 10; // Số trang tối đa mỗi subreddit
const SORT_BY = 'new'; // 'new', 'hot', 'top'
const TIME_RANGE = 'month'; // cho 'top' sorting: 'day', 'week', 'month', 'year', 'all'

// Có thu thập comments hay không
const FETCH_COMMENTS = process.env.CRAWL_COMMENTS === 'true';

// === THIẾT LẬP LOGGING ===
// Thư mục logs
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
const logFile = path.join(logDir, 'direct-batch.log');
const errorFile = path.join(logDir, 'direct-batch-errors.log');
const processedFile = path.join(logDir, 'direct-batch-processed.json');

// Hàm ghi log
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  console.log(message);
  fs.appendFileSync(logFile, logMessage);
}

// Hàm ghi lỗi
function logError(subreddit, error) {
  const timestamp = new Date().toISOString();
  const errorMessage = `[${timestamp}] ERROR [${subreddit}]: ${error.message}\n`;
  
  console.error(errorMessage);
  fs.appendFileSync(errorFile, errorMessage);
}

// Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Lấy và lưu trạng thái các subreddit đã xử lý
function getProcessedSubreddits() {
  if (fs.existsSync(processedFile)) {
    return JSON.parse(fs.readFileSync(processedFile, 'utf8'));
  }
  return [];
}

function saveProcessedSubreddit(subreddit) {
  const processed = getProcessedSubreddits();
  if (!processed.includes(subreddit)) {
    processed.push(subreddit);
    fs.writeFileSync(processedFile, JSON.stringify(processed, null, 2));
  }
}

/**
 * Thu thập bài viết từ một subreddit
 */
async function collectSubredditData(subreddit) {
  log(`=== Bắt đầu thu thập dữ liệu cho r/${subreddit} ===`);
  
  try {
    // Tạo thư mục đầu ra
    const outputDir = path.join(process.cwd(), 'data', subreddit);
    ensureDirectoryExists(outputDir);
    
    if (FETCH_COMMENTS) {
      ensureDirectoryExists(path.join(outputDir, 'comments'));
    }
    
    // Tính khoảng thời gian
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - DAYS_TO_COLLECT);
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    
    // Tên file dữ liệu chính
    const date = new Date().toISOString().split('T')[0];
    const mainFilePath = path.join(outputDir, `reddit_direct_${SORT_BY}_${date}.json`);
    
    // Biến theo dõi
    let allPosts = [];
    let oldestPostDate = null;
    let after = null; // Tham số phân trang
    let reachedTimeLimit = false;
    
    // Thu thập theo từng trang
    for (let page = 1; page <= MAX_PAGES && !reachedTimeLimit; page++) {
      log(`\n[${subreddit}] [TRANG ${page}/${MAX_PAGES}] Đang thu thập...`);
      
      try {
        let pagePosts = [];
        
        // Sử dụng ExecuteRedditRequest để xoay vòng tài khoản
        await executeRedditRequest(async (client) => {
          // Lấy subreddit
          const subredditObj = await getSubreddit(subreddit);
          
          // Chuẩn bị options
          const options = { limit: POSTS_PER_PAGE };
          if (after) {
            options.after = after;
          }
          
          // Lấy bài viết theo loại sắp xếp
          if (SORT_BY === 'new') {
            pagePosts = await subredditObj.getNew(options);
          } else if (SORT_BY === 'hot') {
            pagePosts = await subredditObj.getHot(options);
          } else if (SORT_BY === 'top') {
            options.time = TIME_RANGE;
            pagePosts = await subredditObj.getTop(options);
          }
          
          log(`[${subreddit}] Đã nhận ${pagePosts.length} bài viết`);
          return true;
        });
        
        // Kiểm tra nếu không còn bài viết
        if (!pagePosts || pagePosts.length === 0) {
          log(`[${subreddit}] Không còn bài viết nào. Kết thúc.`);
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
        const pageFilePath = path.join(outputDir, `reddit_${SORT_BY}_page${page}_${date}.json`);
        await storePosts(subreddit, formattedPosts, pageFilePath);
        
        log(`[${subreddit}] Đã lưu ${formattedPosts.length} bài viết từ trang ${page}`);
        
        // Kiểm tra bài viết cũ nhất
        if (formattedPosts.length > 0) {
          const oldestPost = formattedPosts.reduce((oldest, post) => 
            post.created_utc < oldest.created_utc ? post : oldest, formattedPosts[0]);
          
          oldestPostDate = new Date(oldestPost.created_utc * 1000);
          log(`[${subreddit}] Bài viết cũ nhất trong trang này: ${oldestPostDate.toISOString()}`);
          
          // Kiểm tra giới hạn thời gian
          if (oldestPost.created_utc < startTimestamp) {
            log(`[${subreddit}] Đã đạt đến giới hạn thời gian ${DAYS_TO_COLLECT} ngày. Dừng lại.`);
            reachedTimeLimit = true;
            
            // Lọc ra bài viết trong khoảng thời gian
            const filteredPosts = formattedPosts.filter(post => post.created_utc >= startTimestamp);
            log(`[${subreddit}] Còn lại ${filteredPosts.length} bài viết sau khi lọc theo thời gian`);
            
            // Thêm vào danh sách tổng
            allPosts = [...allPosts, ...filteredPosts];
            break;
          }
        }
        
        // Thêm vào danh sách tổng
        allPosts = [...allPosts, ...formattedPosts];
        
        // Thu thập comments nếu được yêu cầu
        if (FETCH_COMMENTS) {
          await fetchCommentsForPosts(subreddit, formattedPosts, path.join(outputDir, 'comments'));
        }
        
        // Đợi giữa các trang
        if (page < MAX_PAGES && !reachedTimeLimit) {
          log(`[${subreddit}] Đợi 2 giây trước trang tiếp theo...`);
          await delay(2000);
        }
        
      } catch (error) {
        logError(subreddit, error);
        log(`[${subreddit}] LỖI khi thu thập trang ${page}. Đợi 30 giây...`);
        await delay(30000);
        page--; // Thử lại trang này
      }
    }
    
    // Lưu tất cả bài viết vào một file
    if (allPosts.length > 0) {
      saveToJson(mainFilePath, allPosts);
      log(`[${subreddit}] Đã lưu tổng cộng ${allPosts.length} bài viết`);
    }
    
    log(`\n=== Hoàn thành thu thập dữ liệu cho r/${subreddit} ===`);
    if (oldestPostDate) {
      log(`[${subreddit}] Bài viết cũ nhất: ${oldestPostDate.toISOString()}`);
    }
    
    // Đánh dấu đã hoàn thành
    saveProcessedSubreddit(subreddit);
    
    return true;
  } catch (error) {
    logError(subreddit, error);
    log(`[${subreddit}] LỖI NGHIÊM TRỌNG: ${error.message}`);
    return false;
  }
}

/**
 * Thu thập comments cho nhiều bài viết
 */
async function fetchCommentsForPosts(subreddit, posts, outputDir) {
  // Số bài viết xử lý song song
  const batchSize = 3;
  log(`[${subreddit}] [COMMENTS] Bắt đầu thu thập comments cho ${posts.length} bài viết...`);
  
  // Xử lý theo batch
  for (let i = 0; i < posts.length; i += batchSize) {
    const batch = posts.slice(i, i + batchSize);
    log(`[${subreddit}] [COMMENTS] Đang xử lý batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(posts.length/batchSize)} (${batch.length} bài viết)`);
    
    const promises = batch.map(post => fetchCommentsForPost(subreddit, post.id, outputDir));
    await Promise.all(promises);
    
    // Chờ 2 giây giữa các batch
    if (i + batchSize < posts.length) {
      log(`[${subreddit}] [COMMENTS] Đợi 2 giây trước batch tiếp theo...`);
      await delay(2000);
    }
  }
  
  log(`[${subreddit}] [COMMENTS] Đã hoàn thành thu thập comments`);
}

/**
 * Thu thập comments cho một bài viết
 */
async function fetchCommentsForPost(subreddit, postId, outputDir) {
  try {
    log(`[${subreddit}] [COMMENTS] Đang lấy comments cho bài viết ${postId}...`);
    
    let commentsList = [];
    
    await executeRedditRequest(async (client) => {
      // Lấy submission
      const submission = await client.getSubmission(postId);
      
      // Lấy toàn bộ comments
      const comments = await submission.comments.fetchAll();
      
      // Chuyển đổi sang định dạng RedditComment
      commentsList = formatComments(comments);
      
      log(`[${subreddit}] [COMMENTS] Đã nhận ${commentsList.length} comments cho bài viết ${postId}`);
      return true;
    });
    
    // Lưu comments vào file và database
    if (commentsList.length > 0) {
      const commentFilePath = path.join(outputDir, `post_${postId}_comments.json`);
      await storeComments(postId, commentsList, commentFilePath);
      log(`[${subreddit}] [COMMENTS] Đã lưu ${commentsList.length} comments cho bài viết ${postId}`);
    }
    
  } catch (error) {
    log(`[${subreddit}] [COMMENTS] LỖI khi lấy comments cho bài viết ${postId}: ${error.message}`);
  }
}

/**
 * Định dạng comments từ Snoowrap
 */
function formatComments(comments) {
  if (!Array.isArray(comments)) return [];
  
  return comments.map(comment => {
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

/**
 * Xử lý theo batch các subreddit
 */
async function processBatches() {
  log(`=== BẮT ĐẦU THU THẬP DỮ LIỆU THEO BATCH ===`);
  log(`Tổng số subreddit: ${ALL_SUBREDDITS.length}`);
  log(`Kích thước batch: ${BATCH_SIZE}`);
  log(`Thu thập dữ liệu ${DAYS_TO_COLLECT} ngày, sắp xếp theo ${SORT_BY}`);
  log(`Thu thập comments: ${FETCH_COMMENTS ? 'Có' : 'Không'}`);
  
  // Lấy danh sách đã xử lý
  const processedSubreddits = getProcessedSubreddits();
  log(`Đã xử lý trước đó: ${processedSubreddits.length} subreddit`);
  
  // Lọc ra các subreddit chưa xử lý
  const remainingSubreddits = ALL_SUBREDDITS.filter(
    subreddit => !processedSubreddits.includes(subreddit)
  );
  
  if (remainingSubreddits.length === 0) {
    log(`Tất cả subreddit đã được xử lý. Không còn gì để làm.`);
    return;
  }
  
  log(`Còn lại ${remainingSubreddits.length} subreddit để xử lý`);
  
  // Xử lý theo batch
  for (let i = 0; i < remainingSubreddits.length; i += BATCH_SIZE) {
    const batch = remainingSubreddits.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(remainingSubreddits.length / BATCH_SIZE);
    
    log(`\n=== BATCH ${batchNumber}/${totalBatches} ===`);
    log(`Subreddits: ${batch.join(', ')}`);
    
    // Xử lý từng subreddit trong batch
    for (const subreddit of batch) {
      log(`\n>>> Đang xử lý r/${subreddit}...`);
      await collectSubredditData(subreddit);
      
      // Chờ giữa các subreddit
      if (batch.indexOf(subreddit) < batch.length - 1) {
        log(`Đợi 2 phút trước subreddit tiếp theo...`);
        await delay(2 * 60 * 1000);
      }
    }
    
    // Nếu còn batch tiếp theo, chờ trước khi xử lý
    if (i + BATCH_SIZE < remainingSubreddits.length) {
      log(`\n=== BATCH ${batchNumber}/${totalBatches} HOÀN THÀNH ===`);
      log(`Đợi ${BATCH_DELAY/60000} phút trước batch tiếp theo...`);
      await delay(BATCH_DELAY);
    }
  }
  
  log(`\n=== THU THẬP DỮ LIỆU HOÀN THÀNH ===`);
  const finalProcessed = getProcessedSubreddits();
  log(`Tổng số subreddit đã xử lý: ${finalProcessed.length}/${ALL_SUBREDDITS.length}`);
}

// Chạy tiến trình chính
processBatches().catch(error => {
  log(`LỖI NGHIÊM TRỌNG: ${error.message}`);
  console.error(error);
});