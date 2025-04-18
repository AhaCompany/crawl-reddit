import { Pool } from 'pg';
import axios from 'axios';
import { config } from '../config/config';
import { RedditDataType, convertCommentToRedditContent } from '../models/RedditContent';
import { RedditComment } from '../models/Comment';
import { PostgresMinerStorage } from '../storage/PostgresMinerStorage';
import * as fs from 'fs';
import * as path from 'path';
import { ensureDirectoryExists } from './fileHelper';

/**
 * Interface cho thông tin theo dõi bài viết
 */
interface PostTracking {
  id: number;
  post_id: string;
  subreddit: string;
  title: string | null;
  comment_count: number;
  last_comment_id: string | null;
  last_crawled_at: Date;
  first_seen_at: Date;
  is_active: boolean;
  priority: number;
  crawl_frequency: string;
  check_until: Date | null;
}

/**
 * Interface cho comment từ Reddit API
 */
interface RedditCommentData {
  id: string;
  body: string;
  author: string;
  subreddit: string;
  created_utc: number;
  permalink: string;
  parent_id: string;
  [key: string]: any;
}

/**
 * Class quản lý việc theo dõi và crawl comments
 */
export class CommentTracker {
  private pool: Pool;
  private postgresStorage: PostgresMinerStorage;
  private isInitialized: boolean = false;

  /**
   * Constructor
   */
  constructor() {
    // Khởi tạo pool connection cho PostgreSQL
    this.pool = new Pool({
      host: config.postgresql.host,
      port: config.postgresql.port,
      database: config.postgresql.database,
      user: config.postgresql.user,
      password: config.postgresql.password,
    });

    // Khởi tạo PostgreSQL storage
    this.postgresStorage = new PostgresMinerStorage();
  }

  /**
   * Khởi tạo
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Khởi tạo PostgreSQL storage
    await this.postgresStorage.initialize();
    this.isInitialized = true;
  }

  /**
   * Đóng kết nối
   */
  public async close(): Promise<void> {
    await this.postgresStorage.close();
    await this.pool.end();
    this.isInitialized = false;
  }

  /**
   * Thêm bài viết mới để theo dõi
   */
  public async addPostForTracking(
    postId: string,
    subreddit: string,
    title: string | null = null,
    initialCommentCount: number = 0,
    crawlFrequency: string = '30m',
    trackingDays: number = 3
  ): Promise<void> {
    try {
      // Tính thời gian kết thúc theo dõi
      const checkUntil = new Date();
      checkUntil.setDate(checkUntil.getDate() + trackingDays);

      await this.pool.query(
        `INSERT INTO post_comment_tracking 
        (post_id, subreddit, title, comment_count, crawl_frequency, check_until) 
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (post_id) DO UPDATE SET
          is_active = TRUE,
          crawl_frequency = $5,
          check_until = $6,
          last_crawled_at = NOW()`,
        [postId, subreddit, title, initialCommentCount, crawlFrequency, checkUntil]
      );

      console.log(`Added post ${postId} for comment tracking`);
    } catch (error) {
      console.error(`Error adding post ${postId} for tracking:`, error);
    }
  }

  /**
   * Vô hiệu hóa theo dõi cho một bài viết
   */
  public async disablePostTracking(postId: string): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE post_comment_tracking SET is_active = FALSE WHERE post_id = $1`,
        [postId]
      );

      console.log(`Disabled tracking for post ${postId}`);
    } catch (error) {
      console.error(`Error disabling tracking for post ${postId}:`, error);
    }
  }
  
  /**
   * Lấy số lượng bài viết đang được theo dõi
   */
  public async getActiveTrackingCount(): Promise<number> {
    try {
      const result = await this.pool.query(
        `SELECT COUNT(*) as count FROM post_comment_tracking WHERE is_active = TRUE`
      );
      return parseInt(result.rows[0].count || '0');
    } catch (error) {
      console.error('Error getting active tracking count:', error);
      return 0;
    }
  }

  /**
   * Lấy danh sách bài viết cần quét comments tiếp theo
   */
  public async getPostsForCommentCrawling(limit: number = 10): Promise<PostTracking[]> {
    try {
      // Lấy các bài viết còn active, sắp xếp theo thứ tự ưu tiên
      // và thời gian quét gần nhất
      const result = await this.pool.query(
        `SELECT * FROM post_comment_tracking
         WHERE is_active = TRUE
         AND (check_until IS NULL OR check_until > NOW())
         ORDER BY 
           priority DESC,
           last_crawled_at ASC
         LIMIT $1`,
        [limit]
      );

      return result.rows;
    } catch (error) {
      console.error('Error getting posts for comment crawling:', error);
      return [];
    }
  }

  /**
   * Crawl comments mới cho một bài viết
   * Sử dụng cơ chế xoay vòng tài khoản để tránh rate limit
   */
  public async crawlNewComments(postTracking: PostTracking): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      console.log(`Crawling new comments for post ${postTracking.post_id}...`);

      // Lấy comment mới nhất đã quét của bài viết
      const lastCommentId = postTracking.last_comment_id;
      
      // Import cần thiết cho rotating client
      // Bọc trong try-catch vì import động có thể gây lỗi
      let executeRedditRequest: any;
      let getAccountManager: any;
      try {
        // Import động để tránh circular dependency
        const rotatingClient = await import('../utils/rotatingRedditClient');
        executeRedditRequest = rotatingClient.executeRedditRequest;
        getAccountManager = rotatingClient.getAccountManager;
      } catch (error) {
        console.error('Error importing rotatingRedditClient:', error);
        throw new Error('Could not import rotatingRedditClient');
      }

      // Mảng lưu trữ các comments đã xử lý
      const allComments: RedditComment[] = [];
      const newComments: RedditComment[] = [];
      let newestCommentId: string | null = lastCommentId;
      let title: string | null = null;

      // Khởi tạo thông tin tài khoản
      const currentAccountInfo = { username: '(unknown)' };
      
      // Sử dụng phương thức xoay vòng tài khoản để gọi API
      await executeRedditRequest(async (client: any) => {
        // Lấy thông tin tài khoản hiện tại từ client
        try {
          // Lấy username từ accountManager
          const accountManager = await getAccountManager();
          const currentAccount = await accountManager.getCurrentAccount();
          if (currentAccount) {
            currentAccountInfo.username = currentAccount.username;
          }
        } catch (error) {
          console.warn('Could not get current account info:', error);
        }
        
        console.log(`Calling Reddit API for post ${postTracking.post_id} with account: ${currentAccountInfo.username}`);
        
        try {
          // PHƯƠNG PHÁP 1: Sử dụng Snoowrap client (đã được xác thực)
          console.log(`Attempting to fetch comments via Snoowrap API for post ${postTracking.post_id}`);
          
          // Sử dụng client (Snoowrap) đã được xác thực từ executeRedditRequest
          const submission = client.getSubmission(postTracking.post_id);
          // Lấy thông tin bài viết
          const postData = await submission.fetch();
          title = postData.title;
          
          // Lấy comments
          const commentsListing = await submission.comments;
          const comments = await commentsListing.fetchAll({ amount: 100 });
          
          console.log(`Fetched ${comments.length} comments via Snoowrap for post ${postTracking.post_id}`);
          
          // Xử lý comments từ Snoowrap API
          const processComment = (comment: any, depth: number = 0): void => {
            // Skip if undefined or not an object
            if (!comment || typeof comment !== 'object') return;
            // Skip if no id or body (likely deleted)
            if (!comment.id || !comment.body) return;
            
            // Tạo đối tượng RedditComment
            const formattedComment: RedditComment = {
              id: comment.id,
              author: comment.author?.name || '[deleted]',
              body: comment.body || '',
              permalink: `https://www.reddit.com${comment.permalink}`,
              created_utc: comment.created_utc || 0,
              score: comment.score || 0,
              subreddit: comment.subreddit?.display_name || '',
              is_submitter: !!comment.is_submitter,
              parent_id: comment.parent_id || '',
              depth,
              replies: []
            };
            
            // Thêm vào danh sách tất cả comments
            allComments.push(formattedComment);
            
            // Xác định xem đây có phải là comment mới hay không
            if (!lastCommentId || comment.id > lastCommentId) {
              newComments.push(formattedComment);
              
              // Cập nhật comment ID mới nhất
              if (!newestCommentId || comment.id > newestCommentId) {
                newestCommentId = comment.id;
              }
            }
            
            // Xử lý các replies nếu có
            if (comment.replies && Array.isArray(comment.replies)) {
              for (const reply of comment.replies) {
                processComment(reply, depth + 1);
              }
            }
          };
          
          // Process all comments
          for (const comment of comments) {
            processComment(comment);
          }
        } catch (error: any) {
          // PHƯƠNG PHÁP 2: Fallback sang phương pháp sử dụng API public
          console.warn(`Error fetching via Snoowrap: ${error.message || 'Unknown error'}, falling back to public API`);
          
          // URL API để lấy comments thông qua public API
          const url = `https://www.reddit.com/comments/${postTracking.post_id}.json?raw_json=1&limit=100`;
          console.log(`Falling back to public API: ${url}`);
          
          // Sử dụng axios trực tiếp - executeRedditRequest sẽ quản lý xác thực và proxy
          const response = await axios.get(url, { 
            timeout: 30000 // 30 giây
          });
          
          if (!Array.isArray(response.data) || response.data.length < 2) {
            console.log('Invalid response format from Reddit API');
            return true;
          }
          
          // Phần tử đầu tiên là thông tin bài viết
          const postData = response.data[0].data.children[0].data;
          title = postData.title;
          
          // Phần tử thứ hai là các comments
          const commentsData = response.data[1].data.children;
          
          // Hàm đệ quy để xử lý comments từ public API
          const processApiComment = (comment: any, depth: number = 0): void => {
            // Bỏ qua các "more" comments
            if (comment.kind === 't1') {
              const data: RedditCommentData = comment.data;
              
              // Tạo đối tượng RedditComment
              const formattedComment: RedditComment = {
                id: data.id,
                author: data.author || '[deleted]',
                body: data.body || '',
                permalink: `https://www.reddit.com${data.permalink}`,
                created_utc: data.created_utc || 0,
                score: data.score || 0,
                subreddit: data.subreddit,
                is_submitter: !!data.is_submitter,
                parent_id: data.parent_id || '',
                depth,
                replies: []
              };
              
              // Thêm vào danh sách tất cả comments
              allComments.push(formattedComment);
              
              // Xác định xem đây có phải là comment mới hay không
              // Nếu không có last_comment_id, coi như tất cả là mới
              if (!lastCommentId || data.id > lastCommentId) {
                newComments.push(formattedComment);
                
                // Cập nhật comment ID mới nhất
                if (!newestCommentId || data.id > newestCommentId) {
                  newestCommentId = data.id;
                }
              }
              
              // Xử lý các replies nếu có
              if (data.replies && data.replies.data && data.replies.data.children) {
                for (const reply of data.replies.data.children) {
                  processApiComment(reply, depth + 1);
                }
              }
            }
          };
          
          // Xử lý tất cả comments ở level cao nhất
          for (const comment of commentsData) {
            processApiComment(comment);
          }
        }
      });
      
      console.log(`Found ${allComments.length} total comments, ${newComments.length} new comments`);
      
      // Xử lý sau khi đã lấy dữ liệu thành công
      if (newComments.length > 0) {
        // Lưu comments mới vào PostgreSQL
        await this.saveNewComments(postTracking.post_id, newComments);
        
        // Cập nhật thông tin theo dõi
        await this.pool.query(
          `UPDATE post_comment_tracking SET
            comment_count = comment_count + $1,
            last_comment_id = $2,
            last_crawled_at = NOW(),
            title = COALESCE($3, title)
          WHERE post_id = $4`,
          [newComments.length, newestCommentId, title, postTracking.post_id]
        );
      } else {
        // Cập nhật thời gian quét gần nhất
        await this.pool.query(
          `UPDATE post_comment_tracking SET
            last_crawled_at = NOW(),
            title = COALESCE($1, title)
          WHERE post_id = $2`,
          [title, postTracking.post_id]
        );
      }
      
      return newComments.length;
    } catch (error) {
      console.error(`Error crawling comments for post ${postTracking.post_id}:`, error);
      
      // Vẫn cập nhật thời gian quét để tránh quét lại ngay lập tức
      try {
        await this.pool.query(
          `UPDATE post_comment_tracking SET last_crawled_at = NOW() WHERE post_id = $1`,
          [postTracking.post_id]
        );
      } catch (updateError) {
        console.error(`Error updating last_crawled_at for post ${postTracking.post_id}:`, updateError);
      }
      
      return 0;
    }
  }

  /**
   * Lưu comments mới vào PostgreSQL
   */
  private async saveNewComments(postId: string, comments: RedditComment[]): Promise<void> {
    try {
      console.log(`Saving ${comments.length} new comments to database...`);
      
      // Chuyển đổi RedditComment sang RedditContent
      const redditContents = comments.map(comment => {
        return convertCommentToRedditContent(comment);
      });
      
      // Lưu vào PostgreSQL
      const savedCount = await this.postgresStorage.storeBatch(redditContents);
      console.log(`Stored ${savedCount}/${redditContents.length} comments to PostgreSQL`);
      
      // Lưu một bản sao dưới dạng JSON
      this.saveCommentsToJson(postId, comments);
    } catch (error) {
      console.error(`Error saving comments for post ${postId}:`, error);
    }
  }

  /**
   * Lưu comments mới vào file JSON để backup
   */
  private saveCommentsToJson(postId: string, comments: RedditComment[]): void {
    try {
      // Tạo thư mục
      const outputDir = path.join(config.app.outputDir, 'comments', postId);
      ensureDirectoryExists(outputDir);
      
      // Tạo tên file với timestamp
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const filePath = path.join(outputDir, `${timestamp}_comments.json`);
      
      // Lưu vào file
      fs.writeFileSync(filePath, JSON.stringify(comments, null, 2));
      console.log(`Comments saved to ${filePath}`);
    } catch (error) {
      console.error(`Error saving comments to JSON for post ${postId}:`, error);
    }
  }

  /**
   * Quét comments cho các bài viết đến hạn
   */
  public async processNextPosts(limit: number = 5): Promise<void> {
    try {
      // Lấy danh sách bài viết cần quét
      const posts = await this.getPostsForCommentCrawling(limit);
      
      if (posts.length === 0) {
        console.log('No posts to crawl at this time');
        return;
      }
      
      console.log(`Processing ${posts.length} posts for comment crawling`);
      
      // Xử lý từng bài viết
      for (const post of posts) {
        const newCommentsCount = await this.crawlNewComments(post);
        
        // Nếu không còn comments mới trong một thời gian dài, có thể giảm mức độ ưu tiên
        if (newCommentsCount === 0) {
          // Giảm độ ưu tiên nếu đã quét mà không có comments mới
          await this.pool.query(
            `UPDATE post_comment_tracking SET
              priority = GREATEST(1, priority - 1)
            WHERE post_id = $1`,
            [post.post_id]
          );
        } else {
          // Tăng độ ưu tiên nếu có comments mới
          await this.pool.query(
            `UPDATE post_comment_tracking SET
              priority = LEAST(10, priority + 1)
            WHERE post_id = $1`,
            [post.post_id]
          );
        }
      }
    } catch (error) {
      console.error('Error processing posts for comment crawling:', error);
    }
  }

  /**
   * Kiểm tra và cập nhật trạng thái theo dõi
   * Vô hiệu hóa bài viết đã hết thời gian theo dõi
   * @returns Số lượng bài viết đã vô hiệu hóa
   */
  public async cleanupTracking(): Promise<number> {
    try {
      // Vô hiệu hóa bài viết đã hết thời gian theo dõi
      const result = await this.pool.query(
        `UPDATE post_comment_tracking SET
          is_active = FALSE
        WHERE is_active = TRUE
        AND check_until IS NOT NULL
        AND check_until < NOW()`
      );
      
      const disabledCount = result.rowCount || 0;
      if (disabledCount > 0) {
        console.log(`Disabled tracking for ${disabledCount} posts that expired`);
      }
      
      return disabledCount;
    } catch (error) {
      console.error('Error cleaning up post tracking:', error);
      return 0;
    }
  }

  /**
   * Thêm các bài viết mới từ DataEntity vào tracking
   * @returns Số lượng bài viết đã thêm vào tracking
   */
  public async addNewPostsFromDataEntity(limit: number = 20, trackingDays: number = 3): Promise<number> {
    try {
      // Lấy các bài viết mới từ bảng DataEntity mà chưa có trong tracking
      const result = await this.pool.query(
        `SELECT 
          SUBSTRING(uri FROM 'comments/([^/]+)/') AS post_id,
          label AS subreddit,
          datetime AS created_at
        FROM 
          DataEntity
        WHERE 
          uri LIKE '%/comments/%'
          AND SUBSTRING(uri FROM 'comments/([^/]+)/') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM post_comment_tracking 
            WHERE post_id = SUBSTRING(uri FROM 'comments/([^/]+)/')
          )
        ORDER BY 
          datetime DESC
        LIMIT $1`,
        [limit]
      );
      
      if (result.rows.length === 0) {
        console.log('No new posts to add for comment tracking');
        return 0;
      }
      
      console.log(`Found ${result.rows.length} new posts to add for comment tracking`);
      
      // Thêm từng bài viết vào tracking
      for (const row of result.rows) {
        await this.addPostForTracking(
          row.post_id,
          row.subreddit,
          null, // title chưa biết
          0,    // comment_count ban đầu là 0
          '15m', // crawl_frequency cao hơn cho bài viết mới
          trackingDays
        );
      }
      
      return result.rows.length;
    } catch (error) {
      console.error('Error adding new posts from DataEntity:', error);
      return 0;
    }
  }
}