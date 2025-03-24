import { Pool, PoolClient } from 'pg';
import format from 'pg-format';
import { config } from '../config/config';
import { RedditPost } from '../models/Post';
import { RedditComment } from '../models/Comment';

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

// Xử lý sự kiện lỗi của pool
pool.on('error', (err: Error) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

/**
 * Tạo cấu trúc bảng ban đầu cho database (nếu chưa tồn tại)
 */
export const initializeTables = async (): Promise<void> => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Tạo bảng subreddits
    await client.query(`
      CREATE TABLE IF NOT EXISTS subreddits (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Tạo bảng posts
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
    await client.query('CREATE INDEX IF NOT EXISTS idx_posts_subreddit ON posts(subreddit)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id)');
    
    await client.query('COMMIT');
    console.log('PostgreSQL tables initialized successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error initializing PostgreSQL tables:', error);
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
  } catch (error) {
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
  } catch (error) {
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