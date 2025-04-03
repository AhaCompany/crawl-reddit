import { config } from '../config/config';
import { RedditPost } from '../models/Post';
import { RedditComment } from '../models/Comment';
import path from 'path';
import { saveToJson } from '../utils/fileHelper';
import { storePosts, storeComments } from '../storage/storageFacade';
import { executeRedditRequest, getSubreddit, getSubmission } from '../utils/rotatingRedditClient';

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
    
    // Get the subreddit using rotating client
    const subredditObj = await getSubreddit(subreddit);
    console.log(`Using Reddit account for fetching r/${subreddit} posts`);
    
    // Get posts based on sort type - snoowrap API expects 'limit' parameter
    let posts: any[] = [];
    const options = { limit };
    const topOptions = { time: timeRange, limit };
    
    // Lấy posts sử dụng rotating client
    await executeRedditRequest(async (client) => {
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
      
      console.log(`Successfully fetched ${posts.length} ${sortBy} posts from r/${subreddit}`);
      return true;
    });
    
    // verbose = true sẽ lấy thông tin chi tiết hơn về mỗi bài viết
    // nhưng sẽ tốn nhiều API calls hơn

    // Nếu bài viết cần thêm thông tin chi tiết, fetch riêng từng bài
    if (verbose) {
      console.log(`Fetching detailed information for ${posts.length} posts...`);
      // Lấy ID của các bài viết trước để tránh lỗi tham chiếu vòng tròn
      const postIds = posts.map(post => post.id);
      
      // Sử dụng map tuần tự thay vì Promise.all để tránh quá nhiều requests cùng lúc
      const detailedPosts = [];
      const outputDir = path.join(config.app.outputDir, subreddit);
      
      // Tạo một hàm để lưu trữ một bài post riêng lẻ
      const saveIndividualPost = async (post: any) => {
        try {
          // Format post theo model RedditPost
          const formattedPost: RedditPost = {
            id: post.id,
            title: post.title,
            author: post.author ? (typeof post.author === 'string' ? post.author : post.author.name || '[deleted]') : '[deleted]',
            author_fullname: post.author_fullname,
            selftext: post.selftext || '',
            selftext_html: post.selftext_html || '',
            body: post.body || post.selftext || '',
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
            media: post.media,
            media_metadata: post.media_metadata,
            gallery_data: post.gallery_data,
            domain: post.domain,
            suggested_sort: post.suggested_sort,
            crosspost_parent_list: post.crosspost_parent_list
          };
          
          // Tạo file path riêng cho từng bài post
          const postFilePath = path.join(outputDir, `post_${post.id}_${new Date().toISOString().split('T')[0]}.json`);
          
          // Lưu bài post vào database ngay lập tức
          await storePosts(subreddit, [formattedPost], postFilePath);
          console.log(`Saved post ${post.id} to database immediately`);
          
          return formattedPost;
        } catch (error) {
          console.error(`Error saving post ${post.id}:`, error);
          return null;
        }
      };
      
      for (const postId of postIds) {
        try {
          console.log(`Fetching details for post ${postId}...`);
          
          // Sử dụng rotating client để lấy chi tiết bài viết
          const submission = await getSubmission(postId);
          
          // Sử dụng executeRedditRequest để tự động xử lý rate limit và rotation
          const detailedPost = await executeRedditRequest(async (client) => {
            console.log(`Using Reddit account to fetch details for post ${postId}`);
            return await submission.fetch();
          });
          
          console.log(`Successfully fetched details for post ${postId}`);
          
          // Lưu bài post vào database ngay lập tức
          const formattedPost = await saveIndividualPost(detailedPost);
          if (formattedPost) {
            detailedPosts.push(formattedPost);
          } else {
            // Nếu không thể lưu, sử dụng post gốc
            detailedPosts.push(posts.find((p: any) => p.id === postId) || { id: postId });
          }
          
          // Chờ một khoảng thời gian ngắn giữa các requests
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`Error fetching details for post ${postId}:`, error);
          // Tìm lại post gốc từ mảng ban đầu nếu có lỗi
          detailedPosts.push(posts.find((p: any) => p.id === postId) || { id: postId });
          
          // Chờ lâu hơn nếu có lỗi (có thể là do rate limit)
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // Gán lại posts nhưng bây giờ là các posts đã được format đúng
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
    
    // Nếu không có verbose mode, hoặc các posts chưa được lưu cá nhân, 
    // thì lưu tất cả chúng vào một file tổng hợp
    if (!verbose) {
      // Save to configured storage systems
      const outputDir = path.join(config.app.outputDir, subreddit);
      const filePath = path.join(outputDir, `${sortBy}_${timeRange}_${new Date().toISOString().split('T')[0]}.json`);
      await storePosts(subreddit, formattedPosts, filePath);
    } else {
      // Nếu chạy verbose mode, đã lưu từng bài post riêng lẻ,
      // nên chỉ tạo file JSON tổng hợp nhưng không cần lưu lại vào DB
      const outputDir = path.join(config.app.outputDir, subreddit);
      const filePath = path.join(outputDir, `${sortBy}_${timeRange}_${new Date().toISOString().split('T')[0]}.json`);
      // Chỉ lưu file JSON, không lưu vào DB
      saveToJson(filePath, formattedPosts);
    }
    
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
    
    // Get the submission using rotating client
    const submission = await getSubmission(postId);
    console.log(`Using Reddit account for fetching comments for post ${postId}`);
    
    // Get comments - snoowrap API expects 'amount' not 'limit'
    // Use rotating client and executeRedditRequest
    let commentsListing: any;
    let comments: any[] = [];
    
    await executeRedditRequest(async (client) => {
      console.log(`Using Reddit account to fetch comments for post ${postId}`);
      // Get comments listing
      commentsListing = await submission.comments;
      // Fetch all comments
      const fetchedComments = await commentsListing.fetchAll({ amount: limit });
      // Xác định kiểu comments
      comments = Array.isArray(fetchedComments) ? fetchedComments : [];
      console.log(`Successfully fetched ${comments.length} comments for post ${postId}`);
      return true;
    });
    
    // Đảm bảo comments có dữ liệu
    if (!comments || !Array.isArray(comments)) {
      console.warn(`No comments found or invalid comments data for post ${postId}`);
      comments = [];
    }
    
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