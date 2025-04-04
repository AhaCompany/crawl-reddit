/**
 * Utility để crawl comments và thêm post vào tracking ngay sau khi crawl post
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
    
    // 1. Crawl comments ngay lập tức
    await crawlPostComments(post.id);
    
    // 2. Thêm post vào tracking
    const tracker = await getCommentTracker();
    await tracker.addPostForTracking(
      post.id,
      post.subreddit,
      post.title,
      post.num_comments || 0,
      '30m', // Tần suất crawl cho bài mới: 30 phút
      trackingDays
    );
    
    console.log(`Successfully added post ${post.id} to comment tracking for ${trackingDays} days`);
  } catch (error) {
    console.error(`Error in immediate comment crawl and tracking for post ${post.id}:`, error);
  }
}

/**
 * Crawl và track comments cho nhiều bài post cùng lúc
 * @param posts Mảng các bài post vừa crawl được
 * @param trackingDays Số ngày theo dõi comments (mặc định 7 ngày)
 */
export async function crawlAndTrackMultiplePosts(
  posts: RedditPost[],
  trackingDays: number = 7
): Promise<void> {
  // Lấy tracker một lần
  const tracker = await getCommentTracker();
  
  console.log(`Immediate crawl and track for ${posts.length} posts`);
  
  // Xử lý từng post, nhưng không chờ mỗi bài hoàn tất để tránh blocking
  for (const post of posts) {
    // Thêm post vào tracking trước
    await tracker.addPostForTracking(
      post.id,
      post.subreddit,
      post.title,
      post.num_comments || 0,
      '30m', // Tần suất crawl cho bài mới: 30 phút
      trackingDays
    );
    
    // Gọi hàm crawl comments nhưng không chờ hoàn tất
    crawlPostComments(post.id).catch(err => {
      console.error(`Error crawling comments for post ${post.id}:`, err);
    });
  }
  
  console.log(`Successfully added ${posts.length} posts to comment tracking`);
}