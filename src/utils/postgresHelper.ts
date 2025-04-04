import { Pool, PoolClient } from 'pg';
import format from 'pg-format';
import { config } from '../config/config';
import { RedditPost } from '../models/Post';
import { RedditComment } from '../models/Comment';
import * as fs from 'fs';
import * as path from 'path';

// Log cấu hình PostgreSQL (che bớt password)
console.log(`[DEBUG] PostgreSQL configuration: Host: ${config.postgresql.host}, Port: ${config.postgresql.port}, Database: ${config.postgresql.database}, User: ${config.postgresql.user}`);
console.log(`[DEBUG] PostgreSQL pool config: Max connections: ${config.postgresql.max}, Idle timeout: ${config.postgresql.idleTimeoutMillis}ms, Connection timeout: ${config.postgresql.connectionTimeoutMillis}ms`);

// Tạo pool kết nối PostgreSQL
const pool = new Pool({
  host: config.postgresql.host,
  port: config.postgresql.port,
  database: config.postgresql.database,
  user: config.postgresql.user,
  password: config.postgresql.password,
  max: config.postgresql.max,
  idleTimeoutMillis: config.postgresql.idleTimeoutMillis,
  connectionTimeoutMillis: config.postgresql.connectionTimeoutMillis,
});

// Thêm event listeners để debug kết nối
pool.on('connect', (client) => {
  console.log('[DEBUG] New PostgreSQL client connected');
});

pool.on('acquire', (client) => {
  console.log('[DEBUG] PostgreSQL client acquired from pool');
});

pool.on('remove', (client) => {
  console.log('[DEBUG] PostgreSQL client removed from pool');
});

// Xử lý sự kiện lỗi của pool
pool.on('error', (err: Error) => {
  console.error('[ERROR] Unexpected error on idle PostgreSQL client:', err);
  if (err.stack) {
    console.error('[ERROR] Stack trace:', err.stack);
  }
  process.exit(-1);
});

/**
 * Test kết nối đến PostgreSQL database
 */
export const testConnection = async (): Promise<boolean> => {
  console.log('[DEBUG] Testing PostgreSQL connection...');
  let client;
  
  try {
    console.log('[DEBUG] Attempting to connect to PostgreSQL...');
    client = await pool.connect();
    console.log('[DEBUG] Successfully connected to PostgreSQL');
    
    // Test simple query
    const result = await client.query('SELECT NOW() as time');
    console.log(`[DEBUG] PostgreSQL server time: ${result.rows[0].time}`);
    
    // Test database existence
    const dbResult = await client.query(`
      SELECT datname FROM pg_database WHERE datname = $1
    `, [config.postgresql.database]);
    
    if (dbResult.rowCount && dbResult.rowCount > 0) {
      console.log(`[DEBUG] Database '${config.postgresql.database}' exists`);
    } else {
      console.error(`[ERROR] Database '${config.postgresql.database}' does not exist!`);
      return false;
    }
    
    // Test user permissions
    try {
      await client.query('CREATE TABLE IF NOT EXISTS _test_permissions (id SERIAL PRIMARY KEY)');
      await client.query('DROP TABLE _test_permissions');
      console.log('[DEBUG] User has CREATE/DROP table permissions');
    } catch (permError) {
      console.error('[ERROR] User permissions test failed:', permError);
      return false;
    }
    
    console.log('[DEBUG] PostgreSQL connection test successful');
    return true;
  } catch (err) {
    const error = err as any;
    console.error('[ERROR] PostgreSQL connection test failed:', error);
    if (error.code) {
      console.error(`[ERROR] PostgreSQL error code: ${error.code}`);
    }
    if (error.detail) {
      console.error(`[ERROR] PostgreSQL error detail: ${error.detail}`);
    }
    return false;
  } finally {
    if (client) {
      client.release();
      console.log('[DEBUG] PostgreSQL test client released');
    }
  }
};

/**
 * Tạo cấu trúc bảng ban đầu cho database (nếu chưa tồn tại)
 */
export const initializeTables = async (): Promise<void> => {
  console.log('[DEBUG] Initializing PostgreSQL tables...');
  
  // Test connection first
  const connectionOk = await testConnection();
  if (!connectionOk) {
    console.error('[ERROR] Cannot initialize tables due to connection failure');
    throw new Error('PostgreSQL connection failed during initialization');
  }
  
  console.log('[DEBUG] Getting client from pool for table initialization...');
  const client = await pool.connect();
  
  try {
    console.log('[DEBUG] Beginning transaction...');
    await client.query('BEGIN');
    
    // Tạo bảng subreddits
    console.log('[DEBUG] Creating subreddits table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS subreddits (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Tạo bảng posts
    console.log('[DEBUG] Creating posts table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id VARCHAR(50) PRIMARY KEY,
        title TEXT NOT NULL,
        author VARCHAR(255),
        author_fullname VARCHAR(255),
        selftext TEXT,
        selftext_html TEXT,
        url TEXT,
        permalink TEXT,
        thumbnail TEXT,
        created_utc BIGINT,
        subreddit VARCHAR(255) REFERENCES subreddits(name),
        subreddit_id VARCHAR(50),
        score INTEGER,
        num_comments INTEGER,
        upvote_ratio FLOAT,
        is_original_content BOOLEAN,
        is_self BOOLEAN,
        over_18 BOOLEAN,
        is_video BOOLEAN,
        spoiler BOOLEAN,
        link_flair_text TEXT,
        media JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        data JSONB
      )
    `);
    
    // Tạo bảng comments
    console.log('[DEBUG] Creating comments table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id VARCHAR(50) PRIMARY KEY,
        post_id VARCHAR(50) REFERENCES posts(id),
        author VARCHAR(255),
        body TEXT,
        permalink TEXT,
        created_utc BIGINT,
        score INTEGER,
        subreddit VARCHAR(255) REFERENCES subreddits(name),
        is_submitter BOOLEAN,
        parent_id VARCHAR(50),
        depth INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        data JSONB
      )
    `);
    
    // Tạo index để tìm kiếm nhanh hơn
    console.log('[DEBUG] Creating indexes...');
    await client.query('CREATE INDEX IF NOT EXISTS idx_posts_subreddit ON posts(subreddit)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id)');
    
    console.log('[DEBUG] Committing transaction...');
    await client.query('COMMIT');
    
    // Verify tables exist
    const tablesCheck = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('subreddits', 'posts', 'comments')
    `);
    
    const existingTables = tablesCheck.rows.map(row => row.table_name);
    console.log(`[DEBUG] Verified tables exist: ${existingTables.join(', ')}`);
    
    console.log('[INFO] PostgreSQL tables initialized successfully');
  } catch (err) {
    const error = err as any;
    console.error('[ERROR] Error initializing PostgreSQL tables:', error);
    if (error.code) {
      console.error(`[ERROR] PostgreSQL error code: ${error.code}`);
    }
    if (error.detail) {
      console.error(`[ERROR] PostgreSQL error detail: ${error.detail}`);
    }
    
    try {
      console.log('[DEBUG] Rolling back transaction...');
      await client.query('ROLLBACK');
      console.log('[DEBUG] Transaction rolled back successfully');
    } catch (rollbackErr) {
      console.error('[ERROR] Failed to rollback transaction:', rollbackErr);
    }
    
    throw error;
  } finally {
    console.log('[DEBUG] Releasing client back to pool');
    client.release();
  }
};

/**
 * Chạy tất cả các file SQL trong thư mục migrations
 */
export const runMigrations = async (): Promise<void> => {
  const client = await pool.connect();
  
  try {
    // Tạo bảng migrations để theo dõi các migration đã chạy
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Lấy danh sách các file SQL trong thư mục migrations
    const migrationsDir = path.join(process.cwd(), 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Đảm bảo thứ tự chạy theo alphabet
    
    // Lấy danh sách các migration đã chạy
    const result = await client.query('SELECT filename FROM migrations');
    const appliedMigrations = result.rows.map(row => row.filename);
    
    // Chạy từng file SQL nếu chưa được áp dụng
    for (const file of files) {
      if (!appliedMigrations.includes(file)) {
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');
        
        await client.query('BEGIN');
        try {
          // Thực thi SQL
          await client.query(sql);
          
          // Ghi nhận migration đã được áp dụng
          await client.query(
            'INSERT INTO migrations(filename) VALUES($1)',
            [file]
          );
          
          await client.query('COMMIT');
          console.log(`Applied migration: ${file}`);
        } catch (err) {
          const error = err as any;
          await client.query('ROLLBACK');
          console.error(`Error applying migration ${file}:`, error);
          throw error;
        }
      } else {
        console.log(`Migration already applied: ${file}`);
      }
    }
    
    console.log('All migrations completed successfully');
  } catch (err) {
    const error = err as any;
    console.error('Error running migrations:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Lưu trữ mảng bài viết vào PostgreSQL
 * @param subreddit Tên subreddit
 * @param posts Mảng các bài viết cần lưu
 */
export const savePosts = async (subreddit: string, posts: RedditPost[]): Promise<void> => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Đảm bảo subreddit đã tồn tại
    await client.query(
      'INSERT INTO subreddits(name) VALUES($1) ON CONFLICT (name) DO NOTHING',
      [subreddit]
    );
    
    // Lưu từng bài viết
    for (const post of posts) {
      // Lưu thông tin cơ bản vào các cột riêng biệt
      // Lưu toàn bộ dữ liệu gốc vào cột JSONB 'data'
      await client.query(`
        INSERT INTO posts(
          id, title, author, author_fullname, selftext, selftext_html, 
          url, permalink, thumbnail, created_utc, subreddit, subreddit_id,
          score, num_comments, upvote_ratio, is_original_content, is_self, 
          over_18, is_video, spoiler, link_flair_text, media, data
        ) 
        VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
        ON CONFLICT (id) DO UPDATE SET
          score = $13,
          num_comments = $14,
          upvote_ratio = $15,
          data = $23,
          created_at = CURRENT_TIMESTAMP
      `, [
        post.id,
        post.title,
        post.author,
        post.author_fullname,
        post.selftext,
        post.selftext_html,
        post.url,
        post.permalink,
        post.thumbnail,
        post.created_utc,
        post.subreddit,
        post.subreddit_id,
        post.score,
        post.num_comments,
        post.upvote_ratio,
        post.is_original_content,
        post.is_self,
        post.over_18,
        post.is_video,
        post.spoiler,
        post.link_flair_text,
        post.media ? JSON.stringify(post.media) : null,
        JSON.stringify(post)
      ]);
    }
    
    await client.query('COMMIT');
    console.log(`Saved ${posts.length} posts from r/${subreddit} to PostgreSQL`);
  } catch (err) {
    const error = err as any;
    await client.query('ROLLBACK');
    console.error('Error saving posts to PostgreSQL:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Lưu trữ comments vào PostgreSQL
 * @param postId ID của bài viết mà comments thuộc về
 * @param comments Mảng comments cần lưu
 */
export const saveComments = async (postId: string, comments: RedditComment[]): Promise<void> => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Kiểm tra nếu post_id tồn tại
    const postCheck = await client.query('SELECT id, subreddit FROM posts WHERE id = $1', [postId]);
    
    if (postCheck.rows.length === 0) {
      // Nếu post chưa tồn tại, tạo một placeholder post
      console.log(`Post ${postId} not found in database, creating placeholder...`);
      
      // Lấy tên subreddit từ comment đầu tiên (nếu có)
      const subredditName = comments.length > 0 ? comments[0].subreddit : 'unknown';
      
      // Đảm bảo subreddit đã tồn tại
      await client.query(
        'INSERT INTO subreddits(name) VALUES($1) ON CONFLICT (name) DO NOTHING',
        [subredditName]
      );
      
      // Tạo placeholder post
      await client.query(`
        INSERT INTO posts(id, title, subreddit, selftext)
        VALUES($1, $2, $3, $4)
        ON CONFLICT (id) DO NOTHING
      `, [postId, 'Placeholder for unknown post', subredditName, '']);
    } else {
      const subreddit = postCheck.rows[0].subreddit;
      // Đảm bảo subreddit đã tồn tại (để tránh lỗi foreign key)
      await client.query(
        'INSERT INTO subreddits(name) VALUES($1) ON CONFLICT (name) DO NOTHING',
        [subreddit]
      );
    }
    
    // Hàm đệ quy để xử lý cấu trúc nested comments
    const processComments = async (commentList: RedditComment[], client: PoolClient): Promise<void> => {
      for (const comment of commentList) {
        // Lưu comment chính
        await client.query(`
          INSERT INTO comments(
            id, post_id, author, body, permalink, created_utc,
            score, subreddit, is_submitter, parent_id, depth, data
          )
          VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (id) DO UPDATE SET
            score = $7,
            data = $12,
            created_at = CURRENT_TIMESTAMP
        `, [
          comment.id,
          postId,
          comment.author,
          comment.body,
          comment.permalink,
          comment.created_utc,
          comment.score,
          comment.subreddit,
          comment.is_submitter,
          comment.parent_id,
          comment.depth,
          JSON.stringify(comment)
        ]);
        
        // Xử lý các comment con (nếu có)
        if (comment.replies && comment.replies.length > 0) {
          await processComments(comment.replies, client);
        }
      }
    };
    
    // Bắt đầu xử lý comments
    await processComments(comments, client);
    
    await client.query('COMMIT');
    console.log(`Saved comments for post ${postId} to PostgreSQL`);
  } catch (err) {
    const error = err as any;
    await client.query('ROLLBACK');
    console.error('Error saving comments to PostgreSQL:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Đóng kết nối pool khi ứng dụng kết thúc
 */
export const closePool = async (): Promise<void> => {
  await pool.end();
  console.log('PostgreSQL connection pool closed');
};