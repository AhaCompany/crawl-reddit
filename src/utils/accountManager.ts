/**
 * Quản lý và xoay vòng nhiều tài khoản Reddit để tránh rate limit
 */
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { config } from '../config/config';

interface RedditAccount {
  id: number;
  username: string;
  password: string;
  clientId: string;
  clientSecret: string;
  userAgent: string;
  lastUsed: Date;
  failCount: number;
  successCount: number;
  isDisabled: boolean;
  cooldownUntil: Date | null;
  dailyUsageCount: number;
  dailyResetAt: Date;
}

export class RedditAccountManager {
  private accounts: RedditAccount[] = [];
  private currentAccountIndex: number = 0;
  private pool: Pool;
  private isInitialized: boolean = false;
  private accountTableName: string = 'reddit_accounts';
  private MAX_DAILY_USAGE = 800; // Giới hạn số lần sử dụng trong ngày
  private RATE_LIMIT_COOLDOWN = 10 * 60 * 1000; // 10 phút cooldown khi gặp rate limit
  
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
   * Khởi tạo manager và tải tài khoản từ database
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      // Tạo bảng nếu chưa tồn tại
      await this.createAccountTableIfNotExists();
      
      // Tải tài khoản từ database
      await this.loadAccountsFromDatabase();
      
      // Nếu không có tài khoản nào, thử tải từ file
      if (this.accounts.length === 0) {
        await this.importAccountsFromJsonFile();
      }
      
      console.log(`Loaded ${this.accounts.length} Reddit accounts`);
      this.isInitialized = true;
      
      // Reset usage count hàng ngày
      this.scheduleUsageReset();
    } catch (error) {
      console.error('Error initializing Reddit account manager:', error);
      throw error;
    }
  }
  
  /**
   * Tạo bảng reddit_accounts nếu chưa tồn tại
   */
  private async createAccountTableIfNotExists(): Promise<void> {
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS ${this.accountTableName} (
          id SERIAL PRIMARY KEY,
          username VARCHAR(100) NOT NULL UNIQUE,
          password VARCHAR(100) NOT NULL,
          client_id VARCHAR(100) NOT NULL,
          client_secret VARCHAR(100) NOT NULL,
          user_agent VARCHAR(200) NOT NULL,
          last_used TIMESTAMP DEFAULT NOW(),
          fail_count INTEGER DEFAULT 0,
          success_count INTEGER DEFAULT 0,
          is_disabled BOOLEAN DEFAULT FALSE,
          cooldown_until TIMESTAMP,
          daily_usage_count INTEGER DEFAULT 0,
          daily_reset_at TIMESTAMP DEFAULT NOW()
        );
      `);
    } catch (error) {
      console.error('Error creating account table:', error);
      throw error;
    }
  }
  
  /**
   * Tải tài khoản từ database
   */
  private async loadAccountsFromDatabase(): Promise<void> {
    try {
      const result = await this.pool.query(`
        SELECT 
          id, username, password, client_id, client_secret, user_agent,
          last_used, fail_count, success_count, is_disabled, cooldown_until,
          daily_usage_count, daily_reset_at
        FROM ${this.accountTableName}
        WHERE is_disabled = FALSE
        ORDER BY last_used ASC
      `);
      
      this.accounts = result.rows.map(row => ({
        id: row.id,
        username: row.username,
        password: row.password,
        clientId: row.client_id,
        clientSecret: row.client_secret,
        userAgent: row.user_agent,
        lastUsed: new Date(row.last_used),
        failCount: row.fail_count,
        successCount: row.success_count,
        isDisabled: row.is_disabled,
        cooldownUntil: row.cooldown_until ? new Date(row.cooldown_until) : null,
        dailyUsageCount: row.daily_usage_count,
        dailyResetAt: new Date(row.daily_reset_at)
      }));
    } catch (error) {
      console.error('Error loading accounts from database:', error);
      throw error;
    }
  }
  
  /**
   * Import tài khoản từ file JSON
   */
  private async importAccountsFromJsonFile(): Promise<void> {
    try {
      const accountsFilePath = path.join(process.cwd(), 'reddit_accounts.json');
      
      if (!fs.existsSync(accountsFilePath)) {
        console.log('No accounts file found at:', accountsFilePath);
        return;
      }
      
      const fileContent = fs.readFileSync(accountsFilePath, 'utf8');
      const accountsData = JSON.parse(fileContent);
      
      if (!Array.isArray(accountsData) || accountsData.length === 0) {
        console.log('No accounts found in the JSON file');
        return;
      }
      
      for (const account of accountsData) {
        await this.addAccount(
          account.username,
          account.password,
          account.clientId,
          account.clientSecret,
          account.userAgent || `${account.username} Reddit Bot`
        );
      }
      
      console.log(`Imported ${accountsData.length} accounts from JSON file`);
    } catch (error) {
      console.error('Error importing accounts from JSON file:', error);
    }
  }
  
  /**
   * Thêm tài khoản mới
   */
  public async addAccount(
    username: string,
    password: string,
    clientId: string,
    clientSecret: string,
    userAgent: string
  ): Promise<boolean> {
    try {
      const result = await this.pool.query(`
        INSERT INTO ${this.accountTableName}
        (username, password, client_id, client_secret, user_agent)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (username) 
        DO UPDATE SET
          password = $2,
          client_id = $3,
          client_secret = $4,
          user_agent = $5,
          is_disabled = FALSE
        RETURNING id
      `, [username, password, clientId, clientSecret, userAgent]);
      
      // Tải lại tài khoản từ database
      await this.loadAccountsFromDatabase();
      
      return true;
    } catch (error) {
      console.error(`Error adding account ${username}:`, error);
      return false;
    }
  }
  
  /**
   * Vô hiệu hóa tài khoản
   */
  public async disableAccount(username: string): Promise<boolean> {
    try {
      await this.pool.query(`
        UPDATE ${this.accountTableName}
        SET is_disabled = TRUE
        WHERE username = $1
      `, [username]);
      
      // Tải lại tài khoản từ database
      await this.loadAccountsFromDatabase();
      
      return true;
    } catch (error) {
      console.error(`Error disabling account ${username}:`, error);
      return false;
    }
  }
  
  /**
   * Ghi nhận thành công cho tài khoản
   */
  public async recordSuccess(username: string): Promise<void> {
    try {
      await this.pool.query(`
        UPDATE ${this.accountTableName}
        SET 
          success_count = success_count + 1,
          last_used = NOW(),
          daily_usage_count = daily_usage_count + 1
        WHERE username = $1
      `, [username]);
      
      // Cập nhật cache
      const account = this.accounts.find(a => a.username === username);
      if (account) {
        account.lastUsed = new Date();
        account.successCount++;
        account.dailyUsageCount++;
      }
    } catch (error) {
      console.error(`Error recording success for account ${username}:`, error);
    }
  }
  
  /**
   * Ghi nhận thất bại cho tài khoản
   */
  public async recordFailure(username: string, isRateLimit: boolean = false): Promise<void> {
    try {
      let query = `
        UPDATE ${this.accountTableName}
        SET 
          fail_count = fail_count + 1,
          last_used = NOW()
      `;
      
      // Nếu là rate limit, đặt cooldown
      if (isRateLimit) {
        const cooldownUntil = new Date(Date.now() + this.RATE_LIMIT_COOLDOWN);
        query += `, cooldown_until = $2`;
        
        await this.pool.query(query, [username, cooldownUntil]);
        
        // Cập nhật cache
        const account = this.accounts.find(a => a.username === username);
        if (account) {
          account.lastUsed = new Date();
          account.failCount++;
          account.cooldownUntil = cooldownUntil;
        }
      } else {
        await this.pool.query(query, [username]);
        
        // Cập nhật cache
        const account = this.accounts.find(a => a.username === username);
        if (account) {
          account.lastUsed = new Date();
          account.failCount++;
        }
      }
    } catch (error) {
      console.error(`Error recording failure for account ${username}:`, error);
    }
  }
  
  /**
   * Lấy tài khoản tiếp theo để sử dụng
   */
  public async getNextAccount(): Promise<RedditAccount | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    if (this.accounts.length === 0) {
      console.error('No Reddit accounts available');
      return null;
    }
    
    // Lọc ra các tài khoản có thể sử dụng
    const now = new Date();
    const availableAccounts = this.accounts.filter(account => 
      !account.isDisabled && 
      (!account.cooldownUntil || account.cooldownUntil < now) &&
      account.dailyUsageCount < this.MAX_DAILY_USAGE
    );
    
    if (availableAccounts.length === 0) {
      console.error('No available Reddit accounts (all may be in cooldown or reached daily limit)');
      return null;
    }
    
    // Sắp xếp tài khoản theo thời gian sử dụng cuối cùng (lâu nhất lên đầu)
    availableAccounts.sort((a, b) => a.lastUsed.getTime() - b.lastUsed.getTime());
    
    // Lấy tài khoản đầu tiên
    const account = availableAccounts[0];
    
    // Cập nhật thời gian sử dụng
    account.lastUsed = new Date();
    
    return account;
  }
  
  /**
   * Lên lịch reset số lần sử dụng hàng ngày
   */
  private scheduleUsageReset(): void {
    setInterval(async () => {
      try {
        const now = new Date();
        
        // Lấy danh sách tài khoản cần reset
        const accountsToReset = this.accounts.filter(account => {
          const daysSinceReset = (now.getTime() - account.dailyResetAt.getTime()) / (24 * 60 * 60 * 1000);
          return daysSinceReset >= 1;
        });
        
        if (accountsToReset.length > 0) {
          await this.pool.query(`
            UPDATE ${this.accountTableName}
            SET 
              daily_usage_count = 0,
              daily_reset_at = NOW()
            WHERE daily_reset_at < NOW() - INTERVAL '1 day'
          `);
          
          console.log(`Reset daily usage count for ${accountsToReset.length} accounts`);
          
          // Cập nhật cache
          for (const account of accountsToReset) {
            account.dailyUsageCount = 0;
            account.dailyResetAt = now;
          }
        }
      } catch (error) {
        console.error('Error resetting daily usage counts:', error);
      }
    }, 60 * 60 * 1000); // Kiểm tra mỗi giờ
  }
  
  /**
   * Lấy thống kê sử dụng tài khoản
   */
  public async getAccountStats(): Promise<any> {
    try {
      const result = await this.pool.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN is_disabled THEN 1 ELSE 0 END) as disabled,
          SUM(CASE WHEN cooldown_until > NOW() THEN 1 ELSE 0 END) as in_cooldown,
          SUM(CASE WHEN daily_usage_count >= ${this.MAX_DAILY_USAGE} THEN 1 ELSE 0 END) as reached_limit,
          SUM(success_count) as total_success,
          SUM(fail_count) as total_fail
        FROM ${this.accountTableName}
      `);
      
      return result.rows[0];
    } catch (error) {
      console.error('Error getting account stats:', error);
      return {
        total: this.accounts.length,
        disabled: this.accounts.filter(a => a.isDisabled).length,
        in_cooldown: this.accounts.filter(a => a.cooldownUntil && a.cooldownUntil > new Date()).length,
        reached_limit: this.accounts.filter(a => a.dailyUsageCount >= this.MAX_DAILY_USAGE).length
      };
    }
  }
  
  /**
   * Đóng kết nối
   */
  public async close(): Promise<void> {
    await this.pool.end();
    console.log('Reddit account manager closed');
    this.isInitialized = false;
  }
}