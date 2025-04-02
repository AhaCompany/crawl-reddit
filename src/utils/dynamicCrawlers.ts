import { Pool } from 'pg';
import { config } from '../config/config';
import { crawlScheduler } from './scheduler';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import cron from 'node-cron';

// Interface cho cấu hình crawler
interface CrawlerConfig {
  id: number;
  subreddit: string;
  crawl_interval: string; // Ví dụ: "5m", "1h"
  post_limit: number;
  sort_by: 'hot' | 'new' | 'top' | 'rising';
  time_range: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
  is_active: boolean;
  start_time: Date | null; // Thời gian bắt đầu crawl
  end_time: Date | null;   // Thời gian kết thúc crawl
}

// Class quản lý dynamic crawlers
export class DynamicCrawlerManager {
  private pool: Pool;
  private configsCache: CrawlerConfig[] = [];
  private lastConfigCheck: number = 0;
  private readonly CHECK_INTERVAL = 60000; // 1 phút
  private pm2ConfigPath: string;

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

    // Path cho file cấu hình PM2
    this.pm2ConfigPath = path.join(process.cwd(), 'dynamic-ecosystem.config.js');
  }

  /**
   * Lấy danh sách cấu hình crawler từ database
   */
  public async loadCrawlerConfigs(): Promise<CrawlerConfig[]> {
    try {
      // Chỉ load lại nếu đã qua interval hoặc chưa load bao giờ
      const now = Date.now();
      if (this.configsCache.length === 0 || now - this.lastConfigCheck > this.CHECK_INTERVAL) {
        const result = await this.pool.query(`
          SELECT id, subreddit, crawl_interval, post_limit, sort_by, time_range, is_active, start_time, end_time
          FROM crawl_configs
          ORDER BY id
        `);

        this.configsCache = result.rows;
        this.lastConfigCheck = now;
        console.log(`Loaded ${this.configsCache.length} crawler configurations from database`);
      }

      return this.configsCache;
    } catch (error) {
      console.error('Error loading crawler configurations:', error);
      return [];
    }
  }

  /**
   * Khởi tạo tất cả crawler từ database
   */
  public async initializeScheduledCrawlers(): Promise<void> {
    try {
      const configs = await this.loadCrawlerConfigs();

      // Dừng tất cả crawler hiện tại
      crawlScheduler.stopAll();

      // Tạo crawler mới từ cấu hình
      for (const config of configs) {
        if (config.is_active) {
          try {
            const cronExpression = this.parseIntervalToCron(config.crawl_interval);
            const taskId = `dynamic-${config.subreddit}`;

            console.log(`Setting up crawler for r/${config.subreddit} - Interval: ${config.crawl_interval} (${cronExpression})`);
            
            // Thêm vào scheduler
            crawlScheduler.addCrawlTask(
              taskId,
              config.subreddit,
              cronExpression,
              config.post_limit,
              config.sort_by as any,
              config.time_range as any,
              true // verbose
            );
          } catch (error) {
            console.error(`Error setting up crawler for r/${config.subreddit}:`, error);
          }
        }
      }

      // Khởi động tất cả crawler
      crawlScheduler.startAll();

      // Tạo file cấu hình PM2 động
      await this.generatePM2Config(configs);

      console.log(`Initialized ${configs.filter(c => c.is_active).length} crawlers from database`);
    } catch (error) {
      console.error('Error initializing scheduled crawlers:', error);
    }
  }

  /**
   * Tạo file cấu hình PM2 dựa trên danh sách crawler
   */
  private async generatePM2Config(configs: CrawlerConfig[]): Promise<void> {
    try {
      const now = new Date();
      const activeConfigs = configs.filter(config => {
        // Kiểm tra xem có nằm trong khoảng thời gian crawl không
        if (!config.is_active) return false;
        
        // Nếu không có khoảng thời gian giới hạn, luôn active
        if (!config.start_time && !config.end_time) return true;
        
        // Kiểm tra giới hạn thời gian
        const afterStart = !config.start_time || now >= new Date(config.start_time);
        const beforeEnd = !config.end_time || now <= new Date(config.end_time);
        
        return afterStart && beforeEnd;
      });
      
      const apps = activeConfigs.map(config => ({
        name: `reddit-crawler-${config.subreddit}`,
        script: 'npm',
        args: `run continuous-crawl -- ${config.subreddit} ${config.crawl_interval} ${config.post_limit} ${config.sort_by} ${config.time_range}`,
        watch: false,
        autorestart: true,
        max_memory_restart: '500M',
        env: {
          NODE_ENV: 'production',
        },
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
      }));

      const configContent = `
// File này được tạo tự động, không sửa trực tiếp
// Thêm/sửa cấu hình trong database bảng crawl_configs
// Tạo lúc: ${new Date().toISOString()}
module.exports = {
  apps: ${JSON.stringify(apps, null, 2)}
};`;

      fs.writeFileSync(this.pm2ConfigPath, configContent);
      console.log(`Generated PM2 configuration file: ${this.pm2ConfigPath}`);
    } catch (error) {
      console.error('Error generating PM2 configuration:', error);
    }
  }

  /**
   * Khởi động PM2 với file cấu hình đã tạo
   */
  public async startPM2Crawlers(): Promise<void> {
    if (!fs.existsSync(this.pm2ConfigPath)) {
      throw new Error('PM2 configuration file not found. Run initializeScheduledCrawlers first.');
    }

    console.log('Starting PM2 crawlers...');
    const pm2Process = spawn('pm2', ['start', this.pm2ConfigPath], {
      stdio: 'inherit',
      shell: true
    });

    pm2Process.on('close', (code) => {
      if (code === 0) {
        console.log('PM2 crawlers started successfully');
      } else {
        console.error(`PM2 start process exited with code ${code}`);
      }
    });
  }

  /**
   * Đóng kết nối database
   */
  public async close(): Promise<void> {
    await this.pool.end();
    console.log('DynamicCrawlerManager closed');
  }

  /**
   * Parse interval string to cron expression
   * @param interval Interval string (e.g. "5m", "1h", "30s", "@once")
   * @returns Cron expression string
   */
  private parseIntervalToCron(interval: string): string {
    // Xử lý trường hợp đặc biệt "@once" - chạy một lần duy nhất
    if (interval === '@once') {
      // Sử dụng cron expression hợp lệ để chạy ở tương lai xa
      // "0 0 31 12 *" ~ chạy lúc 00:00 vào ngày 31/12 (nhưng sẽ ghi đè trong code)
      return "0 0 31 12 *";
    }
    
    // Xử lý cron expression trực tiếp nếu được cung cấp (ví dụ "0 */6 * * *")
    if (interval.includes(' ') && interval.split(' ').length === 5) {
      try {
        // Validate cron expression
        if (cron.validate(interval)) {
          return interval;
        }
      } catch (error) {
        console.error(`Invalid cron expression: ${interval}. Using default 5m.`);
        return '*/5 * * * *';
      }
    }
    
    const match = interval.match(/^(\d+)([smh])$/);
    if (!match) {
      throw new Error(`Invalid interval format: ${interval}. Use format like "30s", "5m", or "1h", or "@once" for one-time execution`);
    }
    
    const value = parseInt(match[1], 10);
    const unit = match[2];
    
    switch (unit) {
      case 's': // seconds
        if (value < 10) throw new Error('Minimum interval is 10 seconds');
        if (value < 60) {
          // For intervals less than a minute, run every N seconds
          return `*/${value} * * * * *`;
        } else {
          // Convert to minutes for larger values
          return `*/${Math.floor(value / 60)} * * * *`;
        }
      case 'm': // minutes
        return `*/${value} * * * *`;
      case 'h': // hours
        return `0 */${value} * * *`;
      default:
        throw new Error(`Unknown interval unit: ${unit}`);
    }
  }

  /**
   * Thêm cấu hình crawler mới vào database
   */
  public async addCrawlerConfig(
    subreddit: string,
    crawlInterval: string = '30m',
    postLimit: number = 50,
    sortBy: 'hot' | 'new' | 'top' | 'rising' = 'new',
    timeRange: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all' = 'day',
    startTime: Date | null = null,
    endTime: Date | null = null
  ): Promise<boolean> {
    try {
      await this.pool.query(`
        INSERT INTO crawl_configs 
        (subreddit, crawl_interval, post_limit, sort_by, time_range, start_time, end_time) 
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (subreddit) DO UPDATE SET
          crawl_interval = $2,
          post_limit = $3,
          sort_by = $4,
          time_range = $5,
          start_time = $6,
          end_time = $7,
          is_active = TRUE,
          updated_at = NOW()
      `, [subreddit, crawlInterval, postLimit, sortBy, timeRange, startTime, endTime]);

      // Reset cache to force reload
      this.lastConfigCheck = 0;
      
      console.log(`Added/updated crawler config for r/${subreddit}`);
      return true;
    } catch (error) {
      console.error(`Error adding crawler config for r/${subreddit}:`, error);
      return false;
    }
  }

  /**
   * Vô hiệu hóa một crawler
   */
  public async disableCrawler(subreddit: string): Promise<boolean> {
    try {
      await this.pool.query(`
        UPDATE crawl_configs 
        SET is_active = FALSE, updated_at = NOW()
        WHERE subreddit = $1
      `, [subreddit]);

      // Reset cache to force reload
      this.lastConfigCheck = 0;
      
      console.log(`Disabled crawler for r/${subreddit}`);
      return true;
    } catch (error) {
      console.error(`Error disabling crawler for r/${subreddit}:`, error);
      return false;
    }
  }
}

// Singleton instance
let crawlerManager: DynamicCrawlerManager | null = null;

/**
 * Lấy instance của DynamicCrawlerManager
 */
export function getCrawlerManager(): DynamicCrawlerManager {
  if (!crawlerManager) {
    crawlerManager = new DynamicCrawlerManager();
  }
  return crawlerManager;
}