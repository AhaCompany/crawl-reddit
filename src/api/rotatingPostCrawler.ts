/**
 * Crawler Reddit sử dụng xoay vòng tài khoản để tránh rate limit
 */
import * as path from 'path';
import { getSubreddit, getSubmission, executeRedditRequest } from '../utils/rotatingRedditClient';
import { config } from '../config/config';
import { RedditPost } from '../models/Post';
import { RedditComment } from '../models/Comment';
import { saveToJson } from '../utils/fileHelper';
import { storePosts, storeComments } from '../storage/storageFacade';
import { crawlAndTrackMultiplePosts } from '../utils/immediateCommentTracker';

/**
 * Crawl bài viết từ subreddit và lưu vào storage
 */
export const crawlSubredditPosts = async (
  subreddit: string,
  limit: number = 25,
  sortBy: 'hot' | 'new' | 'top' | 'rising' = 'hot',
  timeRange: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all' = 'all',
  verbose: boolean = true
): Promise<void> => {
  try {
    console.log(`Crawling ${limit} ${sortBy} posts from r/${subreddit}...`);
    
    // Lấy subreddit
    const subredditObj = await getSubreddit(subreddit);
    
    // Lấy posts theo loại sort
    let posts: any[] = [];
    
    // Sử dụng executeRedditRequest để xử lý rate limit tự động
    await executeRedditRequest(async (client) => {
      const options = { limit };
      const topOptions = { time: timeRange, limit };
      
      switch (sortBy) {
        case 'hot':
          posts = await subredditObj.getHot(options);
          break;
        case 'new':
          posts = await subredditObj.getNew(options);
          break;
        case 'top':
          posts = await subredditObj.getTop(topOptions);
          break;
        case 'rising':
          posts = await subredditObj.getRising(options);
          break;
        default:
          posts = await subredditObj.getHot(options);
      }
    });
    
    // Nếu verbose, lấy thông tin chi tiết của từng bài viết
    if (verbose) {
      console.log(`Fetching detailed information for ${posts.length} posts...`);
      
      // Lấy ID của các bài viết
      const postIds = posts.map((post: any) => post.id);
      
      // Sử dụng Promise.allSettled để không dừng lại khi một promise thất bại
      const detailedPostsPromises = postIds.map(async (postId: string) => {
        try {
          const submission = await getSubmission(postId);
          // Fetch chi tiết
          return await executeRedditRequest(async () => {
            return await (submission as any).fetch();
          });
        } catch (error) {
          console.error(`Error fetching details for post ${postId}:`, error);
          // Tìm lại post gốc từ mảng ban đầu nếu có lỗi
          return posts.find((p: any) => p.id === postId) || { id: postId };
        }
      });
      
      const results = await Promise.allSettled(detailedPostsPromises);
      posts = results
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .map(result => result.value);
    }
    
    // Map dữ liệu chi tiết sang RedditPost
    const formattedPosts: RedditPost[] = posts.map((post: any) => {
      // Xử lý an toàn các thuộc tính có thể không tồn tại
      const authorName = post.author ? (typeof post.author === 'string' ? post.author : post.author.name || '[deleted]') : '[deleted]';
      
      return {
        // Thông tin cơ bản
        id: post.id,
        title: post.title,
        author: authorName,
        author_fullname: post.author_fullname,
        
        // Nội dung bài viết
        selftext: post.selftext || '',
        selftext_html: post.selftext_html || '',
        body: post.body || post.selftext || '',
        
        // URLs
        url: post.url,
        permalink: `https://www.reddit.com${post.permalink}`,
        thumbnail: post.thumbnail !== 'self' && post.thumbnail !== 'default' ? post.thumbnail : undefined,
        
        // Thời gian
        created_utc: post.created_utc,
        
        // Thông tin subreddit
        subreddit: post.subreddit ? (typeof post.subreddit === 'string' ? post.subreddit : post.subreddit.display_name) : '',
        subreddit_id: post.subreddit_id,
        subreddit_type: post.subreddit_type,
        
        // Số liệu thống kê
        score: post.score || 0,
        num_comments: post.num_comments || 0,
        upvote_ratio: post.upvote_ratio || 0,
        ups: post.ups,
        downs: post.downs,
        
        // Flags
        is_original_content: !!post.is_original_content,
        is_self: !!post.is_self,
        is_video: !!post.is_video,
        is_gallery: !!post.is_gallery,
        over_18: !!post.over_18,
        spoiler: !!post.spoiler,
        stickied: !!post.stickied,
        archived: !!post.archived,
        locked: !!post.locked,
        
        // Flair và awards
        link_flair_text: post.link_flair_text,
        link_flair_css_class: post.link_flair_css_class,
        gilded: post.gilded,
        total_awards_received: post.total_awards_received,
        
        // Media và galleries
        media: post.media,
        media_metadata: post.media_metadata,
        gallery_data: post.gallery_data,
        
        // Extras
        domain: post.domain,
        suggested_sort: post.suggested_sort,
        crosspost_parent_list: post.crosspost_parent_list
      };
    });
    
    // Lưu vào storage
    const outputDir = path.join(config.app.outputDir, subreddit);
    const filePath = path.join(outputDir, `${sortBy}_${timeRange}_${new Date().toISOString().split('T')[0]}.json`);
    await storePosts(subreddit, formattedPosts, filePath);
    
    // Thêm bước: Crawl comments và track bài viết ngay lập tức
    console.log(`Crawled ${formattedPosts.length} posts from r/${subreddit}, now tracking comments...`);
    
    // Gọi hàm track và crawl comments
    await crawlAndTrackMultiplePosts(formattedPosts, 7); // Theo dõi trong 7 ngày
    
    console.log(`Crawled ${formattedPosts.length} posts and set up comment tracking for r/${subreddit}`);
  } catch (error) {
    console.error(`Error crawling posts from r/${subreddit}:`, error);
  }
};

/**
 * Crawl comments từ bài viết cụ thể
 */
export const crawlPostComments = async (
  postId: string,
  limit: number = 100
): Promise<void> => {
  try {
    console.log(`Crawling comments for post ${postId}...`);
    
    // Lấy submission
    const submission = await getSubmission(postId);
    
    // Lấy comments
    let comments: any = [];
    
    await executeRedditRequest(async () => {
      // Lấy comments listing
      const commentsListing = await submission.comments;
      // Fetch tất cả comments với limit
      comments = await commentsListing.fetchAll({ amount: limit });
    });
    
    // Format comments recursively
    const formatComment = (comment: any, depth: number = 0): RedditComment => {
      // Xử lý an toàn các thuộc tính
      const formattedComment: RedditComment = {
        id: comment.id || '',
        author: comment.author ? (typeof comment.author === 'string' ? comment.author : comment.author.name || '[deleted]') : '[deleted]',
        body: comment.body || '',
        permalink: comment.permalink ? `https://www.reddit.com${comment.permalink}` : '',
        created_utc: comment.created_utc || 0,
        score: comment.score || 0,
        subreddit: typeof comment.subreddit === 'string' ? comment.subreddit : (comment.subreddit?.display_name || ''),
        is_submitter: !!comment.is_submitter,
        parent_id: comment.parent_id || '',
        depth,
        replies: []
      };
      
      // Xử lý replies đệ quy
      if (comment.replies && Array.isArray(comment.replies) && comment.replies.length > 0) {
        formattedComment.replies = comment.replies
          .filter((reply: any) => reply && typeof reply === 'object')
          .map((reply: any) => formatComment(reply, depth + 1));
      } else if (comment.replies && comment.replies.fetchAll) {
        // Handle Snoowrap's Listing objects
        try {
          const fetchedReplies = comment.replies.toArray();
          if (Array.isArray(fetchedReplies) && fetchedReplies.length > 0) {
            formattedComment.replies = fetchedReplies
              .filter((reply: any) => reply && typeof reply === 'object')
              .map((reply: any) => formatComment(reply, depth + 1));
          }
        } catch (error) {
          console.error(`Error processing replies for comment ${comment.id}:`, error);
        }
      }
      
      return formattedComment;
    };
    
    // Format tất cả comments level cao nhất
    const formattedComments = comments.map((comment: any) => formatComment(comment));
    
    // Lưu vào storage
    const outputDir = path.join(config.app.outputDir, 'comments');
    const filePath = path.join(outputDir, `${postId}_${new Date().toISOString().split('T')[0]}.json`);
    await storeComments(postId, formattedComments, filePath);
    
    console.log(`Crawled ${formattedComments.length} comments for post ${postId}`);
  } catch (error) {
    console.error(`Error crawling comments for post ${postId}:`, error);
  }
};