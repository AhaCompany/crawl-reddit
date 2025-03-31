import { Pool, PoolClient } from 'pg';
import { RedditContent } from '../models/RedditContent';
import * as constants from './constants';
import * as utils from './utils';
import { config } from '../config/config';

/**
 * Interface cho DataEntity trong PostgreSQL
 * Cấu trúc giống với SqliteMinerStorage nhưng được triển khai cho PostgreSQL
 */
interface DataEntity {
  uri: string;                 // URI/URL duy nhất của entity
  datetime: string;            // Thời gian tạo (ISO format)
  timeBucketId: number;        // ID của time bucket
  source: number;              // Loại nguồn dữ liệu (từ enum DataSource)
  label: string;               // Label (subreddit)
  content: Buffer;             // Nội dung dưới dạng BYTEA
  contentSizeBytes: number;    // Kích thước của content
}

/**
 * Lớp quản lý lưu trữ dữ liệu vào PostgreSQL với cấu trúc SqliteMinerStorage
 */
export class PostgresMinerStorage {
  private pool: Pool;
  private isInitialized: boolean = false;

  /**
   * Constructor
   */
  constructor() {
    // Tạo pool connection cho PostgreSQL
    this.pool = new Pool({
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
    this.pool.on('error', (err: Error) => {
      console.error('Unexpected error on idle PostgreSQL client', err);
    });
  }

  /**
   * Khởi tạo cấu trúc database
   */
  public async initialize(): Promise<void> {
    console.log('[DEBUG] initialize() called. Checking if already initialized...');
    if (this.isInitialized) {
      console.log('[DEBUG] Already initialized. Skipping initialization.');
      return;
    }

    console.log('[DEBUG] Connecting to PostgreSQL database...');
    console.log(`[DEBUG] Connection details: Host: ${config.postgresql.host}, Port: ${config.postgresql.port}, Database: ${config.postgresql.database}, User: ${config.postgresql.user}`);
    
    let client;
    try {
      client = await this.pool.connect();
      console.log('[DEBUG] Successfully connected to PostgreSQL');
      
      // Test connection
      const testResult = await client.query('SELECT NOW() as time');
      console.log(`[DEBUG] PostgreSQL server time: ${testResult.rows[0].time}`);
      
      console.log('[DEBUG] Starting transaction to create tables...');
      await client.query('BEGIN');
      
      // Tạo bảng DataEntity với cấu trúc giống SqliteMinerStorage
      console.log('[DEBUG] Creating DataEntity table if not exists...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS DataEntity (
          uri                 TEXT            PRIMARY KEY,
          datetime            TIMESTAMP(6)    NOT NULL,
          timeBucketId        INTEGER         NOT NULL,
          source              INTEGER         NOT NULL,
          label               CHAR(${constants.MAX_LABEL_LENGTH}),
          content             BYTEA           NOT NULL,
          contentSizeBytes    INTEGER         NOT NULL
        )
      `);
      console.log('[DEBUG] DataEntity table created or already exists');
      
      // Tạo index để tăng tốc truy vấn
      console.log('[DEBUG] Creating indexes if not exist...');
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_dataentity_timebucketid ON DataEntity(timeBucketId);
        CREATE INDEX IF NOT EXISTS idx_dataentity_label ON DataEntity(label);
      `);
      console.log('[DEBUG] Indexes created or already exist');
      
      await client.query('COMMIT');
      console.log('[DEBUG] Transaction committed successfully');
      
      // Kiểm tra bảng đã tồn tại
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'dataentity'
        );
      `);
      
      if (tableCheck.rows[0].exists) {
        console.log('[DEBUG] Verified that DataEntity table exists');
      } else {
        console.error('[ERROR] DataEntity table does not exist after creation attempt!');
      }
      
      console.log('[INFO] PostgreSQL tables initialized for MinerStorage format');
      this.isInitialized = true;
    } catch (err) {
      const error = err as any;
      console.error('[ERROR] Failed to initialize PostgreSQL tables:', error);
      if (error.code) {
        console.error(`[ERROR] PostgreSQL error code: ${error.code}`);
      }
      if (error.detail) {
        console.error(`[ERROR] PostgreSQL error detail: ${error.detail}`);
      }
      if (client) {
        try {
          console.log('[DEBUG] Rolling back transaction...');
          await client.query('ROLLBACK');
          console.log('[DEBUG] Transaction rolled back successfully');
        } catch (rollbackErr) {
          console.error('[ERROR] Failed to rollback transaction:', rollbackErr);
        }
      }
      throw error;
    } finally {
      if (client) {
        console.log('[DEBUG] Releasing PostgreSQL client back to pool');
        client.release();
      }
    }
  }

  /**
   * Đóng kết nối database
   */
  public async close(): Promise<void> {
    await this.pool.end();
    this.isInitialized = false;
    console.log('PostgreSQL connection closed');
  }

  /**
   * Chuyển đổi RedditContent thành DataEntity
   * Giống với cách SqliteMinerStorage thực hiện
   * @param content Đối tượng RedditContent
   * @returns DataEntity tương ứng
   */
  private convertToDataEntity(content: RedditContent): DataEntity {
    // Làm mờ thời gian đến phút
    const obfuscatedDateTime = utils.obfuscate_datetime_to_minute(content.created_at);
    
    // Tạo bản sao của content để thay đổi created_at
    const contentCopy = { ...content, created_at: obfuscatedDateTime };
    
    // Chuyển đổi thành JSON và encode sang UTF-8
    const contentBytes = utils.object_to_utf8_bytes(contentCopy);
    
    // Tạo TimeBucket từ thời gian gốc (không làm mờ)
    const timeBucket = constants.TimeBucket.from_datetime(content.created_at);
    
    // Chuẩn hóa label (community)
    const normalizedLabel = utils.normalize_label(
      content.community, 
      constants.MAX_LABEL_LENGTH
    );
    
    return {
      uri: content.url,
      datetime: content.created_at.toISOString(),
      timeBucketId: timeBucket.id,
      source: constants.DataSource.REDDIT,
      label: normalizedLabel,
      content: contentBytes,
      contentSizeBytes: utils.get_content_size_bytes(contentBytes)
    };
  }

  /**
   * Lưu trữ một RedditContent vào database
   * @param content Đối tượng RedditContent cần lưu
   * @returns Promise<boolean> true nếu thành công
   */
  public async storeRedditContent(content: RedditContent): Promise<boolean> {
    console.log(`[DEBUG] Attempting to store Reddit content: ${content.id} (${content.url})`);
    
    if (!this.isInitialized) {
      console.log('[DEBUG] PostgresMinerStorage not initialized. Initializing...');
      try {
        await this.initialize();
        console.log('[DEBUG] PostgresMinerStorage initialized successfully');
      } catch (initError) {
        console.error('[ERROR] Failed to initialize PostgresMinerStorage:', initError);
        return false;
      }
    }

    let client;
    try {
      console.log('[DEBUG] Getting PostgreSQL client from pool...');
      client = await this.pool.connect();
      console.log('[DEBUG] PostgreSQL client obtained successfully');
      
      console.log('[DEBUG] Converting Reddit content to DataEntity...');
      const entity = this.convertToDataEntity(content);
      console.log(`[DEBUG] Converted to DataEntity. URI: ${entity.uri}, Label: ${entity.label}, Size: ${entity.contentSizeBytes} bytes`);
      
      console.log('[DEBUG] Executing INSERT/UPDATE query to PostgreSQL...');
      const queryStart = Date.now();
      await client.query(
        `INSERT INTO DataEntity 
        (uri, datetime, timeBucketId, source, label, content, contentSizeBytes) 
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (uri) DO UPDATE SET
          datetime = $2,
          timeBucketId = $3,
          source = $4,
          label = $5,
          content = $6,
          contentSizeBytes = $7`,
        [
          entity.uri,
          entity.datetime,
          entity.timeBucketId,
          entity.source,
          entity.label,
          entity.content,
          entity.contentSizeBytes
        ]
      );
      const queryDuration = Date.now() - queryStart;
      console.log(`[DEBUG] Query executed successfully in ${queryDuration}ms`);
      
      return true;
    } catch (err) {
      const error = err as any;
      console.error('[ERROR] Failed to store Reddit content:', error);
      if (error.code) {
        console.error(`[ERROR] PostgreSQL error code: ${error.code}`);
      }
      if (error.detail) {
        console.error(`[ERROR] PostgreSQL error detail: ${error.detail}`);
      }
      if (error.stack) {
        console.error(`[ERROR] Stack trace: ${error.stack}`);
      }
      return false;
    } finally {
      if (client) {
        console.log('[DEBUG] Releasing PostgreSQL client back to pool');
        client.release();
      }
    }
  }

  /**
   * Lưu trữ nhiều RedditContent cùng lúc
   * @param contents Mảng các đối tượng RedditContent
   * @returns Promise<number> Số lượng đối tượng được lưu thành công
   */
  public async storeBatch(contents: RedditContent[]): Promise<number> {
    console.log(`[DEBUG] Attempting to store batch of ${contents.length} Reddit contents`);
    
    if (!this.isInitialized) {
      console.log('[DEBUG] PostgresMinerStorage not initialized. Initializing...');
      try {
        await this.initialize();
        console.log('[DEBUG] PostgresMinerStorage initialized successfully');
      } catch (initError) {
        console.error('[ERROR] Failed to initialize PostgresMinerStorage:', initError);
        return 0;
      }
    }

    let client;
    let successCount = 0;
    
    try {
      console.log('[DEBUG] Getting PostgreSQL client from pool...');
      client = await this.pool.connect();
      console.log('[DEBUG] PostgreSQL client obtained successfully');
      
      // Bắt đầu transaction
      console.log('[DEBUG] Beginning transaction...');
      await client.query('BEGIN');
      console.log('[DEBUG] Transaction started successfully');
      
      for (const content of contents) {
        try {
          console.log(`[DEBUG] Processing content: ${content.id} (${content.url})`);
          const entity = this.convertToDataEntity(content);
          console.log(`[DEBUG] Converted to DataEntity. URI: ${entity.uri}, Label: ${entity.label}`);
          
          const queryStart = Date.now();
          await client.query(
            `INSERT INTO DataEntity 
            (uri, datetime, timeBucketId, source, label, content, contentSizeBytes) 
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (uri) DO UPDATE SET
              datetime = $2,
              timeBucketId = $3,
              source = $4,
              label = $5,
              content = $6,
              contentSizeBytes = $7`,
            [
              entity.uri,
              entity.datetime,
              entity.timeBucketId,
              entity.source,
              entity.label,
              entity.content,
              entity.contentSizeBytes
            ]
          );
          const queryDuration = Date.now() - queryStart;
          
          successCount++;
          console.log(`[DEBUG] Content ${content.id} stored successfully in ${queryDuration}ms (${successCount}/${contents.length})`);
        } catch (err) {
          const error = err as any;
          console.error(`[ERROR] Failed to store item ${content.id}:`, error);
          if (error.code) {
            console.error(`[ERROR] PostgreSQL error code: ${error.code}`);
          }
          if (error.detail) {
            console.error(`[ERROR] PostgreSQL error detail: ${error.detail}`);
          }
          // Tiếp tục với item tiếp theo mà không phá vỡ transaction
        }
      }
      
      // Commit transaction
      console.log('[DEBUG] Committing transaction...');
      await client.query('COMMIT');
      console.log(`[DEBUG] Transaction committed successfully. Stored ${successCount}/${contents.length} items`);
      
      return successCount;
    } catch (err) {
      // Rollback nếu có lỗi
      const error = err as any;
      console.error('[ERROR] Transaction failed:', error);
      if (error.code) {
        console.error(`[ERROR] PostgreSQL error code: ${error.code}`);
      }
      if (error.stack) {
        console.error(`[ERROR] Stack trace: ${error.stack}`);
      }
      
      if (client) {
        try {
          console.log('[DEBUG] Rolling back transaction...');
          await client.query('ROLLBACK');
          console.log('[DEBUG] Transaction rolled back successfully');
        } catch (rollbackErr) {
          console.error('[ERROR] Failed to rollback transaction:', rollbackErr);
        }
      }
      
      return successCount;
    } finally {
      if (client) {
        console.log('[DEBUG] Releasing PostgreSQL client back to pool');
        client.release();
      }
    }
  }

  /**
   * Lấy số lượng bản ghi trong database
   */
  public async getCount(): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const client = await this.pool.connect();
    
    try {
      const result = await client.query('SELECT COUNT(*) as count FROM DataEntity');
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Error getting count:', error);
      return 0;
    } finally {
      client.release();
    }
  }

  /**
   * Lấy số lượng bản ghi theo subreddit (label)
   * @param subreddit Tên subreddit (với tiền tố 'r/')
   */
  public async getCountBySubreddit(subreddit: string): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const client = await this.pool.connect();
    
    try {
      const normalizedLabel = utils.normalize_label(
        subreddit, 
        constants.MAX_LABEL_LENGTH
      );
      
      const result = await client.query(
        'SELECT COUNT(*) as count FROM DataEntity WHERE label = $1',
        [normalizedLabel]
      );
      
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Error getting count by subreddit:', error);
      return 0;
    } finally {
      client.release();
    }
  }
}