/**
 * Công cụ quản lý cấu hình crawler từ command line
 */
import { getCrawlerManager } from './dynamicCrawlers';
import { Pool } from 'pg';
import { config } from '../config/config';

/**
 * Class quản lý cấu hình crawler từ command line
 */
export class CrawlerConfigManager {
  private pool: Pool;

  constructor() {
    // Khởi tạo pool connection cho PostgreSQL
    this.pool = new Pool({
      host: config.postgresql.host,
      port: config.postgresql.port,
      database: config.postgresql.database,
      user: config.postgresql.user,
      password: config.postgresql.password,
    });
  }

  /**
   * Liệt kê tất cả cấu hình crawler
   */
  public async listAllConfigs(): Promise<void> {
    try {
      const result = await this.pool.query(`
        SELECT 
          id, 
          subreddit, 
          crawl_interval, 
          post_limit, 
          sort_by, 
          time_range, 
          is_active,
          created_at,
          updated_at
        FROM 
          crawl_configs
        ORDER BY 
          id
      `);

      console.log('='.repeat(100));
      console.log('CRAWLER CONFIGURATIONS');
      console.log('='.repeat(100));
      
      if (result.rowCount === 0) {
        console.log('No crawler configurations found.');
      } else {
        console.log(`Found ${result.rowCount} crawler configurations:`);
        console.log('-'.repeat(100));
        
        // In header
        console.log('ID | Subreddit | Interval | Limit | Sort By | Time Range | Active | Created At | Updated At');
        console.log('-'.repeat(100));
        
        // In dữ liệu
        for (const row of result.rows) {
          console.log(
            `${row.id} | ` +
            `r/${row.subreddit} | ` +
            `${row.crawl_interval} | ` +
            `${row.post_limit} | ` +
            `${row.sort_by} | ` +
            `${row.time_range} | ` +
            `${row.is_active ? 'Yes' : 'No'} | ` +
            `${row.created_at.toISOString().split('T')[0]} | ` +
            `${row.updated_at.toISOString().split('T')[0]}`
          );
        }
      }
      
      console.log('='.repeat(100));
    } catch (error) {
      console.error('Error listing crawler configurations:', error);
    }
  }

  /**
   * Thêm hoặc cập nhật cấu hình crawler
   */
  public async addOrUpdateConfig(
    subreddit: string,
    interval: string,
    limit: number,
    sortBy: string,
    timeRange: string
  ): Promise<void> {
    try {
      // Validation
      if (!subreddit || !interval) {
        console.error('Subreddit and interval are required!');
        return;
      }
      
      // Validate sort_by
      const validSortBy = ['hot', 'new', 'top', 'rising'];
      if (!validSortBy.includes(sortBy)) {
        console.error(`Invalid sort_by: ${sortBy}. Must be one of: ${validSortBy.join(', ')}`);
        return;
      }
      
      // Validate time_range
      const validTimeRange = ['hour', 'day', 'week', 'month', 'year', 'all'];
      if (!validTimeRange.includes(timeRange)) {
        console.error(`Invalid time_range: ${timeRange}. Must be one of: ${validTimeRange.join(', ')}`);
        return;
      }
      
      const crawlerManager = getCrawlerManager();
      const result = await crawlerManager.addCrawlerConfig(
        subreddit,
        interval,
        limit,
        sortBy as any,
        timeRange as any
      );
      
      if (result) {
        console.log(`Successfully added/updated crawler for r/${subreddit}`);
        console.log('Run the dynamic crawler to apply changes');
      } else {
        console.error(`Failed to add/update crawler for r/${subreddit}`);
      }
    } catch (error) {
      console.error('Error adding/updating crawler configuration:', error);
    }
  }

  /**
   * Vô hiệu hóa cấu hình crawler
   */
  public async disableConfig(subreddit: string): Promise<void> {
    try {
      if (!subreddit) {
        console.error('Subreddit is required!');
        return;
      }
      
      const crawlerManager = getCrawlerManager();
      const result = await crawlerManager.disableCrawler(subreddit);
      
      if (result) {
        console.log(`Successfully disabled crawler for r/${subreddit}`);
        console.log('Run the dynamic crawler to apply changes');
      } else {
        console.error(`Failed to disable crawler for r/${subreddit}`);
      }
    } catch (error) {
      console.error('Error disabling crawler configuration:', error);
    }
  }

  /**
   * Xóa cấu hình crawler
   */
  public async deleteConfig(subreddit: string): Promise<void> {
    try {
      if (!subreddit) {
        console.error('Subreddit is required!');
        return;
      }
      
      const result = await this.pool.query(
        'DELETE FROM crawl_configs WHERE subreddit = $1',
        [subreddit]
      );
      
      if (result.rowCount && result.rowCount > 0) {
        console.log(`Successfully deleted crawler for r/${subreddit}`);
        console.log('Run the dynamic crawler to apply changes');
      } else {
        console.error(`No crawler configuration found for r/${subreddit}`);
      }
    } catch (error) {
      console.error('Error deleting crawler configuration:', error);
    }
  }

  /**
   * Đóng kết nối
   */
  public async close(): Promise<void> {
    await this.pool.end();
  }
}