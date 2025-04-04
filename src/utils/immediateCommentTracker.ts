/**
 * Utility để crawl comments và thêm post vào tracking ngay sau khi crawl post
 * Phiên bản tuần tự để tránh rate limit
 */
import { RedditPost } from '../models/Post';
import { CommentTracker } from './commentTracker';
import { crawlPostComments } from '../api/postCrawler';

// Biến lưu trữ instance của CommentTracker
let commentTracker: CommentTracker | null = null;

/**
 * Khởi tạo và lấy instance của CommentTracker
 */
async function getCommentTracker(): Promise<CommentTracker> {
  if (!commentTracker) {
    commentTracker = new CommentTracker();
    await commentTracker.initialize();
  }
  return commentTracker;
}

/**
 * Đóng kết nối CommentTracker nếu cần
 */
export async function closeCommentTracker(): Promise<void> {
  if (commentTracker) {
    await commentTracker.close();
    commentTracker = null;
  }
}

/**
 * Crawl comments và thêm post vào tracking ngay lập tức
 * @param post Bài post vừa crawl được
 * @param trackingDays Số ngày theo dõi comments (mặc định 7 ngày)
 */
export async function crawlAndTrackPostComments(
  post: RedditPost,
  trackingDays: number = 7
): Promise<void> {
  try {
    console.log(`Immediate crawl and track for post ${post.id}`);
    
    // 1. Thêm post vào tracking trước
    const tracker = await getCommentTracker();
    await tracker.addPostForTracking(
      post.id,
      post.subreddit,
      post.title,
      post.num_comments || 0,
      '30m', // Tần suất crawl cho bài mới: 30 phút
      trackingDays
    );
    
    // 2. Crawl comments ngay lập tức - chờ hoàn tất
    await crawlPostComments(post.id);
    
    console.log(`Successfully crawled and added post ${post.id} to comment tracking for ${trackingDays} days`);
  } catch (error) {
    console.error(`Error in immediate comment crawl and tracking for post ${post.id}:`, error);
  }
}

/**
 * Crawl và track comments cho nhiều bài post một cách tuần tự
 * @param posts Mảng các bài post vừa crawl được
 * @param trackingDays Số ngày theo dõi comments (mặc định 7 ngày)
 */
export async function crawlAndTrackMultiplePosts(
  posts: RedditPost[],
  trackingDays: number = 7
): Promise<void> {
  // Lấy tracker một lần
  const tracker = await getCommentTracker();
  
  console.log(`Sequential crawl and track for ${posts.length} posts`);
  
  // Xử lý từng post một cách tuần tự
  for (const post of posts) {
    try {
      console.log(`Processing post ${post.id}`);
      
      // 1. Thêm post vào tracking trước
      await tracker.addPostForTracking(
        post.id,
        post.subreddit,
        post.title,
        post.num_comments || 0,
        '30m', // Tần suất crawl cho bài mới: 30 phút
        trackingDays
      );
      
      // 2. Crawl comments và CHỜ hoàn tất trước khi chuyển sang bài tiếp theo
      // Thêm await ở đây để đảm bảo xử lý tuần tự
      await crawlPostComments(post.id);
      
      console.log(`Successfully processed post ${post.id}`);
      
      // 3. Thêm độ trễ giữa các bài post để tránh rate limit
      const delayMs = 2000; // 2 giây
      console.log(`Waiting ${delayMs}ms before processing next post...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      
    } catch (err) {
      console.error(`Error processing post ${post.id}:`, err);
      // Tiếp tục xử lý post tiếp theo dù có lỗi
      // Chờ lâu hơn khi có lỗi
      await new Promise(resolve => setTimeout(resolve, 5000)); // Chờ 5 giây
    }
  }
  
  console.log(`Successfully added and crawled ${posts.length} posts to comment tracking`);
}