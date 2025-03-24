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
    if (this.isInitialized) {
      return;
    }

    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Tạo bảng DataEntity với cấu trúc giống SqliteMinerStorage
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
      
      // Tạo index để tăng tốc truy vấn
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_dataentity_timebucketid ON DataEntity(timeBucketId);
        CREATE INDEX IF NOT EXISTS idx_dataentity_label ON DataEntity(label);
      `);
      
      await client.query('COMMIT');
      console.log('PostgreSQL tables initialized for MinerStorage format');
      this.isInitialized = true;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error initializing PostgreSQL tables:', error);
      throw error;
    } finally {
      client.release();
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
    if (!this.isInitialized) {
      await this.initialize();
    }

    const client = await this.pool.connect();
    
    try {
      const entity = this.convertToDataEntity(content);
      
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
      
      return true;
    } catch (error) {
      console.error('Error storing Reddit content:', error);
      return false;
    } finally {
      client.release();
    }
  }

  /**
   * Lưu trữ nhiều RedditContent cùng lúc
   * @param contents Mảng các đối tượng RedditContent
   * @returns Promise<number> Số lượng đối tượng được lưu thành công
   */
  public async storeBatch(contents: RedditContent[]): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const client = await this.pool.connect();
    let successCount = 0;
    
    try {
      // Bắt đầu transaction
      await client.query('BEGIN');
      
      for (const content of contents) {
        try {
          const entity = this.convertToDataEntity(content);
          
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
          
          successCount++;
        } catch (error) {
          console.error(`Error storing item ${content.id}:`, error);
          // Tiếp tục với item tiếp theo mà không phá vỡ transaction
        }
      }
      
      // Commit transaction
      await client.query('COMMIT');
      
      return successCount;
    } catch (error) {
      // Rollback nếu có lỗi
      await client.query('ROLLBACK');
      console.error('Transaction failed:', error);
      return successCount;
    } finally {
      client.release();
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