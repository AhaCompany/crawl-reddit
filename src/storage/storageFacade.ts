import { RedditContent } from '../models/RedditContent';
import { RedditPost } from '../models/Post';
import { RedditComment } from '../models/Comment';
import { config } from '../config/config';
import { saveToJson } from '../utils/fileHelper';
import { SqliteMinerStorage } from './SqliteMinerStorage';
import { PostgresMinerStorage } from './PostgresMinerStorage';
import { convertPostToRedditContent, convertCommentToRedditContent } from '../models/RedditContent';

// Singleton instances của storage
let sqliteStorage: SqliteMinerStorage | null = null;
let postgresStorage: PostgresMinerStorage | null = null;

/**
 * Khởi tạo storage systems dựa trên cấu hình
 */
export async function initializeStorageSystems(): Promise<void> {
  // Khởi tạo SQLite nếu cần
  if (['sqlite', 'both'].includes(config.app.storage)) {
    if (!sqliteStorage) {
      sqliteStorage = new SqliteMinerStorage(config.sqlite.dbPath);
      await sqliteStorage.initialize();
    }
  }
  
  // Khởi tạo PostgreSQL với MinerStorage schema nếu cần
  if (['postgresql_miner', 'both_miner'].includes(config.app.storage)) {
    if (!postgresStorage) {
      postgresStorage = new PostgresMinerStorage();
      await postgresStorage.initialize();
    }
  }
}

/**
 * Đóng kết nối đến tất cả storage systems
 */
export async function closeStorageSystems(): Promise<void> {
  if (sqliteStorage) {
    await sqliteStorage.close();
    sqliteStorage = null;
  }
  
  if (postgresStorage) {
    await postgresStorage.close();
    postgresStorage = null;
  }
}

/**
 * Lưu trữ bài viết Reddit vào các storage systems đã cấu hình
 * @param subreddit Tên subreddit
 * @param posts Mảng các bài viết
 * @param filePath Đường dẫn JSON file
 */
export async function storePosts(
  subreddit: string,
  posts: RedditPost[],
  filePath: string
): Promise<void> {
  // Luôn lưu JSON như một backup
  saveToJson(filePath, posts);
  
  // Chuyển đổi sang RedditContent
  const redditContents: RedditContent[] = posts.map(post => convertPostToRedditContent(post));
  
  // Lưu vào SQLite
  if (['sqlite', 'both'].includes(config.app.storage) && sqliteStorage) {
    const savedCount = await sqliteStorage.storeBatch(redditContents);
    console.log(`Stored ${savedCount}/${redditContents.length} posts to SQLite database`);
  }
  
  // Lưu vào PostgreSQL với MinerStorage schema
  if (['postgresql_miner', 'both_miner'].includes(config.app.storage) && postgresStorage) {
    const savedCount = await postgresStorage.storeBatch(redditContents);
    console.log(`Stored ${savedCount}/${redditContents.length} posts to PostgreSQL database with MinerStorage schema`);
  }
}

/**
 * Lưu trữ comments Reddit vào các storage systems đã cấu hình
 * @param postId ID của bài viết
 * @param comments Mảng các comments
 * @param filePath Đường dẫn JSON file
 */
export async function storeComments(
  postId: string,
  comments: RedditComment[],
  filePath: string
): Promise<void> {
  // Luôn lưu JSON như một backup
  saveToJson(filePath, comments);
  
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
  
  // Lưu vào SQLite
  if (['sqlite', 'both'].includes(config.app.storage) && sqliteStorage) {
    const savedCount = await sqliteStorage.storeBatch(redditContents);
    console.log(`Stored ${savedCount}/${redditContents.length} comments to SQLite database`);
  }
  
  // Lưu vào PostgreSQL với MinerStorage schema
  if (['postgresql_miner', 'both_miner'].includes(config.app.storage) && postgresStorage) {
    const savedCount = await postgresStorage.storeBatch(redditContents);
    console.log(`Stored ${savedCount}/${redditContents.length} comments to PostgreSQL database with MinerStorage schema`);
  }
}