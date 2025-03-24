import { RedditPost } from '../models/Post';
import { RedditComment } from '../models/Comment';
import { RedditContent, RedditDataType, convertPostToRedditContent, convertCommentToRedditContent } from '../models/RedditContent';
import { config } from '../config/config';
import { SqliteMinerStorage } from '../storage/SqliteMinerStorage';
import { saveToJson } from './fileHelper';
import path from 'path';

// Singleton instance của SqliteMinerStorage
let sqliteStorage: SqliteMinerStorage | null = null;

/**
 * Khởi tạo SqliteMinerStorage
 * @param dbPath Đường dẫn tới file SQLite
 */
export async function initSqliteStorage(dbPath?: string): Promise<SqliteMinerStorage> {
  if (!sqliteStorage) {
    sqliteStorage = new SqliteMinerStorage(dbPath);
    await sqliteStorage.initialize();
  }
  return sqliteStorage;
}

/**
 * Đóng kết nối SqliteMinerStorage
 */
export async function closeSqliteStorage(): Promise<void> {
  if (sqliteStorage) {
    await sqliteStorage.close();
    sqliteStorage = null;
  }
}

/**
 * Lưu trữ bài viết Reddit
 * @param subreddit Tên subreddit
 * @param posts Mảng các bài viết
 * @param filePath Đường dẫn file JSON (chỉ sử dụng với chế độ JSON)
 */
export async function savePosts2Storage(
  subreddit: string, 
  posts: RedditPost[], 
  filePath: string
): Promise<void> {
  // Lưu vào JSON như một backup hoặc theo cấu hình
  if (config.app.storage === 'json' || config.app.storage === 'both') {
    saveToJson(filePath, posts);
  }
  
  // Lưu vào SqliteMinerStorage nếu được cấu hình
  if (config.app.storage === 'sqlite' || config.app.storage === 'both') {
    // Chuyển đổi sang RedditContent
    const redditContents: RedditContent[] = posts.map(post => convertPostToRedditContent(post));
    
    // Khởi tạo storage nếu cần
    const storage = await initSqliteStorage();
    
    // Lưu trữ theo batch
    const savedCount = await storage.storeBatch(redditContents);
    console.log(`Stored ${savedCount}/${redditContents.length} posts to SQLite database`);
  }
}

/**
 * Lưu trữ comments Reddit
 * @param postId ID của bài viết
 * @param comments Mảng các comments
 * @param filePath Đường dẫn file JSON (chỉ sử dụng với chế độ JSON)
 */
export async function saveComments2Storage(
  postId: string,
  comments: RedditComment[],
  filePath: string
): Promise<void> {
  // Lưu vào JSON như một backup hoặc theo cấu hình
  if (config.app.storage === 'json' || config.app.storage === 'both') {
    saveToJson(filePath, comments);
  }
  
  // Lưu vào SqliteMinerStorage nếu được cấu hình
  if (config.app.storage === 'sqlite' || config.app.storage === 'both') {
    // Hàm đệ quy để xử lý cấu trúc nested comments
    const processComments = (commentList: RedditComment[]): RedditContent[] => {
      const result: RedditContent[] = [];
      
      for (const comment of commentList) {
        // Thêm comment chính
        result.push(convertCommentToRedditContent(comment));
        
        // Xử lý các comment con (nếu có)
        if (comment.replies && comment.replies.length > 0) {
          result.push(...processComments(comment.replies));
        }
      }
      
      return result;
    };
    
    // Chuyển đổi tất cả comments (bao gồm cả nested comments) sang RedditContent
    const redditContents = processComments(comments);
    
    // Khởi tạo storage nếu cần
    const storage = await initSqliteStorage();
    
    // Lưu trữ theo batch
    const savedCount = await storage.storeBatch(redditContents);
    console.log(`Stored ${savedCount}/${redditContents.length} comments to SQLite database`);
  }
}