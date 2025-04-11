/**
 * pushshiftCrawler.ts
 * Module thu thập dữ liệu lịch sử từ Pushshift API
 * Hỗ trợ thu thập cả bài viết và bình luận
 */
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import { RedditPost } from '../models/Post';
import { RedditComment } from '../models/Comment';
import { saveToJson, ensureDirectoryExists } from '../utils/fileHelper';
import { storePosts, storeComments } from '../storage/storageFacade';
import { config } from '../config/config';
import { getSubmission, executeRedditRequest } from '../utils/rotatingRedditClient';

/**
 * Thiết lập trì hoãn giữa các request
 * @param ms Thời gian trì hoãn tính bằng mili giây
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Lấy dữ liệu từ Pushshift API
 * @param subreddit Tên subreddit
 * @param startDate Ngày bắt đầu (Unix timestamp tính bằng giây)
 * @param endDate Ngày kết thúc (Unix timestamp tính bằng giây)
 * @param size Số lượng bài viết tối đa mỗi request
 * @param maxRequests Số lượng request tối đa
 */
export const crawlHistoricalPostsFromPushshift = async (
  subreddit: string,
  startDate: number,
  endDate: number,
  size: number = 100,
  maxRequests: number = 50
): Promise<void> => {
  try {
    console.log(`[PUSHSHIFT] Crawling historical data for r/${subreddit}`);
    console.log(`[PUSHSHIFT] Time range: ${new Date(startDate * 1000).toISOString()} to ${new Date(endDate * 1000).toISOString()}`);
    console.log(`[PUSHSHIFT] Max requests: ${maxRequests}, Size per request: ${size}`);
    console.log(`[PUSHSHIFT] Crawl comments: ${config.app.crawlComments ? 'Yes' : 'No'}`);
    
    // Tạo thư mục đầu ra
    const outputDir = path.join(config.app.outputDir, subreddit);
    ensureDirectoryExists(outputDir);
    
    // Tên file chính để lưu tất cả bài viết
    const mainFilePath = path.join(
      outputDir, 
      `pushshift_historical_${new Date(startDate * 1000).toISOString().split('T')[0]}_to_${new Date(endDate * 1000).toISOString().split('T')[0]}.json`
    );
    
    let allPosts: RedditPost[] = [];
    let lastTimestamp = endDate;
    let requestCount = 0;
    let totalPostCount = 0;
    
    // Vòng lặp thu thập dữ liệu
    while (requestCount < maxRequests && lastTimestamp > startDate) {
      requestCount++;
      console.log(`\n[PUSHSHIFT] Request ${requestCount}/${maxRequests}`);
      console.log(`[PUSHSHIFT] Fetching posts before ${new Date(lastTimestamp * 1000).toISOString()}`);
      
      try {
        // Cấu hình request
        // Thử tất cả các URL khả dụng của Pushshift API
        const urls = [
          'https://api.pushshift.io/reddit/search/submission',  // API mới nhất
          'https://api.pushshift.io/reddit/submission/search',  // API cũ
          'https://beta.pushshift.io/search/reddit/submissions', // API beta
        ];
        
        const params = {
          subreddit,
          before: lastTimestamp,
          after: startDate,
          size,
          sort: 'desc',
          sort_type: 'created_utc'
        };
        
        // Tạo random user agent để tránh bị chặn
        const userAgents = [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36'
        ];
        const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
        
        let response;
        let successfulUrl;
        let error;
        
        // Thử tất cả các URL cho đến khi thành công
        for (const url of urls) {
          try {
            console.log(`[PUSHSHIFT] Trying API URL: ${url}`);
            console.log(`[PUSHSHIFT] Params: ${JSON.stringify(params)}`);
            
            // Gửi request với user agent và headers đầy đủ
            response = await axios.get(url, { 
              params,
              headers: {
                'User-Agent': randomUserAgent,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Connection': 'keep-alive'
              },
              timeout: 30000 // 30 giây timeout
            });
            
            // Nếu thành công, ghi nhớ URL thành công và thoát vòng lặp
            successfulUrl = url;
            console.log(`[PUSHSHIFT] Successfully connected to: ${url}`);
            break;
          } catch (err) {
            console.error(`[PUSHSHIFT] Failed to connect to ${url}: ${err instanceof Error ? err.message : String(err)}`);
            error = err instanceof Error ? err : new Error(String(err));
            // Chờ 1 giây trước khi thử URL tiếp theo
            await delay(1000);
          }
        }
        
        // Nếu tất cả URL đều thất bại, throw lỗi
        if (!response) {
          throw error || new Error('All Pushshift API endpoints failed');
        }
        
        // Xử lý response tùy theo endpoint
        let posts;
        if (successfulUrl && successfulUrl.includes('beta.pushshift.io')) {
          // API beta có cấu trúc khác
          posts = response.data.data;
        } else {
          // API tiêu chuẩn
          posts = response.data.data;
        }
        
        // Kiểm tra cấu trúc dữ liệu
        if (!posts) {
          // Một số endpoint có thể trả về trực tiếp mảng dữ liệu
          posts = Array.isArray(response.data) ? response.data : [];
        }
        
        if (!posts || posts.length === 0) {
          console.log('[PUSHSHIFT] No more posts found.');
          break;
        }
        
        console.log(`[PUSHSHIFT] Received ${posts.length} posts.`);
        
        // Định dạng lại dữ liệu
        const formattedPosts: RedditPost[] = posts.map((post: any) => ({
          id: post.id,
          title: post.title || '',
          author: post.author || '[deleted]',
          author_fullname: post.author_fullname,
          selftext: post.selftext || '',
          selftext_html: post.selftext_html || '',
          body: post.selftext || '',
          url: post.url || `https://www.reddit.com${post.permalink}`,
          permalink: post.permalink ? `https://www.reddit.com${post.permalink}` : `https://www.reddit.com/r/${subreddit}/comments/${post.id}/`,
          thumbnail: post.thumbnail !== 'self' && post.thumbnail !== 'default' ? post.thumbnail : undefined,
          created_utc: post.created_utc,
          subreddit: post.subreddit || subreddit,
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
        }));
        
        // Lưu trữ dữ liệu cho batch này
        const batchFilePath = path.join(
          outputDir, 
          `pushshift_batch${requestCount}_${new Date(lastTimestamp * 1000).toISOString().split('T')[0]}.json`
        );
        
        // Lưu vào cơ sở dữ liệu và file
        await storePosts(subreddit, formattedPosts, batchFilePath);
        
        // Cập nhật timestamp cho lần tiếp theo
        if (posts.length > 0) {
          const oldestPost = posts[posts.length - 1];
          lastTimestamp = oldestPost.created_utc;
        }
        
        // Thêm vào danh sách tất cả bài viết
        allPosts = [...allPosts, ...formattedPosts];
        totalPostCount += formattedPosts.length;
        
        console.log(`[PUSHSHIFT] Saved ${formattedPosts.length} posts. Total: ${totalPostCount}`);
        console.log(`[PUSHSHIFT] New oldest timestamp: ${new Date(lastTimestamp * 1000).toISOString()}`);
        
        // Trì hoãn giữa các request để tránh rate limit
        console.log('[PUSHSHIFT] Waiting 1 second before next request...');
        await delay(1000);
      } catch (error) {
        console.error(`[PUSHSHIFT] Error in request ${requestCount}:`, error);
        
        // Nếu gặp lỗi, chờ thời gian dài hơn và thử lại
        console.log('[PUSHSHIFT] Waiting 5 seconds before retrying...');
        await delay(5000);
        
        // Nếu lỗi 3 lần liên tiếp, dừng lại
        if (requestCount >= maxRequests) {
          console.error('[PUSHSHIFT] Max retries reached. Stopping.');
          break;
        }
      }
    }
    
    // Lưu tất cả bài viết vào một file
    if (allPosts.length > 0) {
      saveToJson(mainFilePath, allPosts);
      console.log(`[PUSHSHIFT] Saved ${allPosts.length} total posts to ${mainFilePath}`);
    }
    
    console.log(`[PUSHSHIFT] Completed historical data crawl for r/${subreddit}`);
    console.log(`[PUSHSHIFT] Retrieved ${totalPostCount} posts with ${requestCount} requests`);
    
    // Nếu có bài viết và cần crawl comments
    if (allPosts.length > 0 && config.app.crawlComments) {
      await fetchCommentsForPosts(subreddit, allPosts);
    }
  } catch (error) {
    console.error(`[PUSHSHIFT] Fatal error in Pushshift crawler:`, error);
  }
};

/**
 * Lấy dữ liệu từ Pushshift API theo tháng
 * @param subreddit Tên subreddit
 * @param months Số tháng cần lấy dữ liệu (tính từ hiện tại trở về trước)
 */
export const crawlLastMonthsFromPushshift = async (
  subreddit: string,
  months: number = 1
): Promise<void> => {
  // Tính thời gian bắt đầu (X tháng trước)
  const now = Math.floor(Date.now() / 1000);
  const secondsPerMonth = 30 * 24 * 60 * 60; // Ước tính 30 ngày mỗi tháng
  const startTimestamp = now - (months * secondsPerMonth);
  
  // Gọi hàm chính
  await crawlHistoricalPostsFromPushshift(subreddit, startTimestamp, now);
};

/**
 * Thu thập comments cho nhiều bài viết từ Reddit API
 * @param subreddit Tên subreddit
 * @param posts Danh sách bài viết
 */
async function fetchCommentsForPosts(
  subreddit: string,
  posts: RedditPost[]
): Promise<void> {
  try {
    console.log(`\n[COMMENTS] Starting to fetch comments for ${posts.length} posts...`);
    
    // Giới hạn số lượng bài viết để thực hiện song song
    const batchSize = 3; // Số bài viết xử lý cùng lúc
    const outputDir = path.join(config.app.outputDir, subreddit, 'comments');
    ensureDirectoryExists(outputDir);
    
    // Xử lý theo batch
    for (let i = 0; i < posts.length; i += batchSize) {
      const batch = posts.slice(i, i + batchSize);
      console.log(`\n[COMMENTS] Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(posts.length/batchSize)} (${batch.length} posts)`);
      
      // Thu thập comments cho mỗi bài trong batch
      const promises = batch.map(post => fetchCommentsForPost(subreddit, post.id, outputDir));
      await Promise.all(promises);
      
      // Chờ 2 giây để tránh rate limit
      if (i + batchSize < posts.length) {
        console.log(`[COMMENTS] Waiting 2 seconds before next batch...`);
        await delay(2000);
      }
    }
    
    console.log(`\n[COMMENTS] Completed fetching comments for ${posts.length} posts in r/${subreddit}`);
  } catch (error) {
    console.error(`[COMMENTS] Error fetching comments:`, error);
  }
}

/**
 * Thu thập comments cho một bài viết từ Reddit API
 * @param subreddit Tên subreddit
 * @param postId ID của bài viết
 * @param outputDir Thư mục đầu ra
 */
async function fetchCommentsForPost(
  subreddit: string,
  postId: string,
  outputDir: string
): Promise<void> {
  try {
    console.log(`[COMMENTS] Fetching comments for post ${postId}...`);
    
    // Lấy comments từ Reddit API
    let commentsList: RedditComment[] = [];
    
    await executeRedditRequest(async (client) => {
      // Lấy submission từ Reddit API
      const submission = await getSubmission(postId);
      
      // Tải comments
      const comments = await submission.comments.fetchAll();
      
      // Chuyển đổi sang định dạng RedditComment
      commentsList = formatComments(comments);
      
      console.log(`[COMMENTS] Retrieved ${commentsList.length} comments for post ${postId}`);
      return true;
    });
    
    // Nếu có comments, lưu vào file và database
    if (commentsList.length > 0) {
      const commentFilePath = path.join(outputDir, `post_${postId}_comments.json`);
      await storeComments(postId, commentsList, commentFilePath);
      console.log(`[COMMENTS] Saved ${commentsList.length} comments for post ${postId}`);
    }
  } catch (error) {
    console.error(`[COMMENTS] Error fetching comments for post ${postId}:`, error);
  }
}

/**
 * Chuyển đổi comments từ Snoowrap sang định dạng RedditComment
 * @param comments Comments từ Snoowrap
 */
function formatComments(comments: any[]): RedditComment[] {
  if (!Array.isArray(comments)) return [];
  
  return comments.map(comment => {
    const formattedComment: RedditComment = {
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
    
    // Xử lý replies nếu có
    if (comment.replies && Array.isArray(comment.replies)) {
      formattedComment.replies = formatComments(comment.replies);
    }
    
    return formattedComment;
  });
}