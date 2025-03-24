import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';
import { RedditContent } from '../models/RedditContent';
import * as constants from './constants';
import * as utils from './utils';
import path from 'path';
import fs from 'fs';

/**
 * Interface cho DataEntity trong SQLite
 */
interface DataEntity {
  uri: string;                 // URI/URL duy nhất của entity
  datetime: string;            // Thời gian tạo (ISO format)
  timeBucketId: number;        // ID của time bucket
  source: number;              // Loại nguồn dữ liệu (từ enum DataSource)
  label: string;               // Label (subreddit)
  content: Buffer;             // Nội dung dưới dạng BLOB
  contentSizeBytes: number;    // Kích thước của content
}

/**
 * Lớp quản lý lưu trữ dữ liệu vào SQLite
 */
export class SqliteMinerStorage {
  private db: Database | null = null;
  private dbPath: string;
  private isInitialized: boolean = false;

  /**
   * Constructor
   * @param dbPath Đường dẫn đến file SQLite (mặc định là data/reddit_miner.db)
   */
  constructor(dbPath: string = constants.DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
  }

  /**
   * Khởi tạo kết nối và cấu trúc database
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Đảm bảo thư mục tồn tại
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Mở kết nối đến database
    this.db = await open({
      filename: this.dbPath,
      driver: sqlite3.Database
    });

    // Tạo bảng nếu chưa tồn tại
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS DataEntity (
        uri                 TEXT            PRIMARY KEY,
        datetime            TIMESTAMP(6)    NOT NULL,
        timeBucketId        INTEGER         NOT NULL,
        source              INTEGER         NOT NULL,
        label               CHAR(${constants.MAX_LABEL_LENGTH}),
        content             BLOB            NOT NULL,
        contentSizeBytes    INTEGER         NOT NULL
      )
    `);

    // Tạo index để tăng tốc truy vấn
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_dataentity_timebucketid ON DataEntity(timeBucketId);
      CREATE INDEX IF NOT EXISTS idx_dataentity_label ON DataEntity(label);
    `);

    this.isInitialized = true;
    console.log(`SQLite database initialized at ${this.dbPath}`);
  }

  /**
   * Đóng kết nối database
   */
  public async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.isInitialized = false;
      console.log('SQLite connection closed');
    }
  }

  /**
   * Chuyển đổi RedditContent thành DataEntity
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
    if (!this.isInitialized || !this.db) {
      await this.initialize();
    }

    try {
      const entity = this.convertToDataEntity(content);
      
      await this.db!.run(
        `INSERT OR REPLACE INTO DataEntity 
        (uri, datetime, timeBucketId, source, label, content, contentSizeBytes) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
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
    }
  }

  /**
   * Lưu trữ nhiều RedditContent cùng lúc
   * @param contents Mảng các đối tượng RedditContent
   * @returns Promise<number> Số lượng đối tượng được lưu thành công
   */
  public async storeBatch(contents: RedditContent[]): Promise<number> {
    if (!this.isInitialized || !this.db) {
      await this.initialize();
    }

    let successCount = 0;
    
    try {
      // Bắt đầu transaction
      await this.db!.run('BEGIN TRANSACTION');
      
      for (const content of contents) {
        try {
          const entity = this.convertToDataEntity(content);
          
          await this.db!.run(
            `INSERT OR REPLACE INTO DataEntity 
            (uri, datetime, timeBucketId, source, label, content, contentSizeBytes) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
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
          // Tiếp tục với item tiếp theo
        }
      }
      
      // Commit transaction
      await this.db!.run('COMMIT');
      
    } catch (error) {
      // Rollback nếu có lỗi
      await this.db!.run('ROLLBACK');
      console.error('Transaction failed:', error);
    }
    
    return successCount;
  }

  /**
   * Lấy số lượng bản ghi trong database
   */
  public async getCount(): Promise<number> {
    if (!this.isInitialized || !this.db) {
      await this.initialize();
    }

    const result = await this.db!.get('SELECT COUNT(*) as count FROM DataEntity');
    return result?.count || 0;
  }

  /**
   * Lấy số lượng bản ghi theo subreddit (label)
   * @param subreddit Tên subreddit (với tiền tố 'r/')
   */
  public async getCountBySubreddit(subreddit: string): Promise<number> {
    if (!this.isInitialized || !this.db) {
      await this.initialize();
    }

    const normalizedLabel = utils.normalize_label(
      subreddit, 
      constants.MAX_LABEL_LENGTH
    );

    const result = await this.db!.get(
      'SELECT COUNT(*) as count FROM DataEntity WHERE label = ?',
      [normalizedLabel]
    );
    
    return result?.count || 0;
  }
}