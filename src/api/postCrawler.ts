import { redditClient } from './redditClient';
import { config } from '../config/config';
import { RedditPost } from '../models/Post';
import { RedditComment } from '../models/Comment';
import path from 'path';
import { saveToJson } from '../utils/fileHelper';
import { storePosts, storeComments } from '../storage/storageFacade';

/**
 * Crawl posts from a subreddit and save them to JSON
 * @param subreddit Name of the subreddit to crawl
 * @param limit Number of posts to crawl
 * @param sortBy How to sort the posts ('hot', 'new', 'top', 'rising')
 * @param timeRange Time range for 'top' sorting ('hour', 'day', 'week', 'month', 'year', 'all')
 */
export const crawlSubredditPosts = async (
  subreddit: string,
  limit: number = 25,
  sortBy: 'hot' | 'new' | 'top' | 'rising' = 'hot',
  timeRange: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all' = 'all',
  verbose: boolean = true // Thêm tham số verbose để kiểm soát việc lấy chi tiết
): Promise<void> => {
  try {
    console.log(`Crawling ${limit} ${sortBy} posts from r/${subreddit}...`);
    
    // Get the subreddit
    const subredditObj = redditClient.getSubreddit(subreddit);
    
    // Get posts based on sort type - snoowrap API expects 'limit' parameter
    let posts: any[] = [];
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
    
    // verbose = true sẽ lấy thông tin chi tiết hơn về mỗi bài viết
    // nhưng sẽ tốn nhiều API calls hơn

    // Nếu bài viết cần thêm thông tin chi tiết, fetch riêng từng bài
    if (verbose) {
      console.log(`Fetching detailed information for ${posts.length} posts...`);
      // Sử dụng Promise.all để tăng hiệu suất
      // Lấy ID của các bài viết trước để tránh lỗi tham chiếu vòng tròn
      const postIds = posts.map(post => post.id);
      
      const detailedPosts = await Promise.all(
        postIds.map(async (postId: string) => {
          try {
            // Lấy submission và fetch riêng rẽ để tránh lỗi TS1062
            const submission = redditClient.getSubmission(postId);
            // Sử dụng casting để xử lý kiểu tham chiếu
            return await (submission as any).fetch();
          } catch (error) {
            console.error(`Error fetching details for post ${postId}:`, error);
            // Tìm lại post gốc từ mảng ban đầu nếu có lỗi
            return posts.find((p: any) => p.id === postId) || { id: postId };
          }
        })
      );
      posts = detailedPosts;
    }
    
    // Map dữ liệu chi tiết sang mô hình của chúng ta
    const formattedPosts: RedditPost[] = posts.map((post: any) => {
      // Xử lý an toàn các thuộc tính có thể không tồn tại
      const authorName = post.author ? (typeof post.author === 'string' ? post.author : post.author.name || '[deleted]') : '[deleted]';
      
      return {
        // Thông tin cơ bản
        id: post.id,
        title: post.title,
        author: authorName,
        author_fullname: post.author_fullname,
        
        // Nội dung bài viết - đây là nội dung thân bài
        selftext: post.selftext || '',
        selftext_html: post.selftext_html || '',
        body: post.body || post.selftext || '',  // Dùng làm alias
        
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
    
    // Save to configured storage systems
    const outputDir = path.join(config.app.outputDir, subreddit);
    const filePath = path.join(outputDir, `${sortBy}_${timeRange}_${new Date().toISOString().split('T')[0]}.json`);
    await storePosts(subreddit, formattedPosts, filePath);
    
    console.log(`Crawled ${formattedPosts.length} posts from r/${subreddit}`);
  } catch (error) {
    console.error(`Error crawling posts from r/${subreddit}:`, error);
  }
};

/**
 * Crawl comments from a specific post
 * @param postId Reddit post ID
 * @param limit Number of comments to fetch
 */
export const crawlPostComments = async (
  postId: string,
  limit: number = 100
): Promise<void> => {
  try {
    console.log(`Crawling comments for post ${postId}...`);
    
    // Get the submission and comments separately to avoid reference issues
    const submission = redditClient.getSubmission(postId);
    
    // Get comments - snoowrap API expects 'amount' not 'limit'
    // We also need to avoid chaining fetch() to prevent the type reference issue
    const commentsListing = await submission.comments;
    const comments = await commentsListing.fetchAll({ amount: limit });
    
    // Format comments recursively
    const formatComment = (comment: any, depth: number = 0): RedditComment => {
      // Handle potential undefined or null properties safely
      const formattedComment: RedditComment = {
        id: comment.id || '',
        author: comment.author ? (comment.author.name || '[deleted]') : '[deleted]',
        body: comment.body || '',
        permalink: comment.permalink ? `https://www.reddit.com${comment.permalink}` : '',
        created_utc: comment.created_utc || 0,
        score: comment.score || 0,
        subreddit: comment.subreddit?.display_name || '',
        is_submitter: !!comment.is_submitter,
        parent_id: comment.parent_id || '',
        depth,
        replies: []
      };
      
      // Process replies recursively with additional safety checks
      if (comment.replies && Array.isArray(comment.replies) && comment.replies.length > 0) {
        formattedComment.replies = comment.replies
          .filter((reply: any) => reply && typeof reply === 'object')
          .map((reply: any) => formatComment(reply, depth + 1));
      }
      
      return formattedComment;
    };
    
    // Format all top-level comments
    const formattedComments = comments.map((comment: any) => formatComment(comment));
    
    // Save to configured storage systems
    const outputDir = path.join(config.app.outputDir, 'comments');
    const filePath = path.join(outputDir, `${postId}_${new Date().toISOString().split('T')[0]}.json`);
    await storeComments(postId, formattedComments, filePath);
    
    console.log(`Crawled ${formattedComments.length} comments for post ${postId}`);
  } catch (error) {
    console.error(`Error crawling comments for post ${postId}:`, error);
  }
};