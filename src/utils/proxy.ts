/**
 * Quản lý và xoay vòng proxy servers
 */

// Import required modules
import http from 'http';
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
import tunnel from 'tunnel';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { config } from '../config/config';

interface ProxyConfig {
  id: number;
  host: string;
  port: number;
  protocol: 'http' | 'https' | 'socks';
  username?: string;
  password?: string;
  country?: string;
  lastUsed: Date;
  failCount: number;
  successCount: number;
  isDisabled: boolean;
  cooldownUntil: Date | null;
}

export class ProxyManager {
  private proxies: ProxyConfig[] = [];
  private currentProxyIndex: number = 0;
  private pool: Pool;
  private isInitialized: boolean = false;
  private proxyTableName: string = 'proxy_servers';
  private RATE_LIMIT_COOLDOWN = 10 * 60 * 1000; // 10 phút cooldown khi gặp lỗi
  
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
   * Khởi tạo manager và tải proxy từ database
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      // Tạo bảng nếu chưa tồn tại
      await this.createProxyTableIfNotExists();
      
      // Tải proxy từ database
      await this.loadProxiesFromDatabase();
      
      // Nếu không có proxy nào, thử tải từ file
      if (this.proxies.length === 0) {
        await this.importProxiesFromFile();
      }
      
      console.log(`Loaded ${this.proxies.length} proxies`);
      this.isInitialized = true;
    } catch (error) {
      console.error('Error initializing proxy manager:', error);
      throw error;
    }
  }
  
  /**
   * Tạo bảng proxy_servers nếu chưa tồn tại
   */
  private async createProxyTableIfNotExists(): Promise<void> {
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS ${this.proxyTableName} (
          id SERIAL PRIMARY KEY,
          host VARCHAR(100) NOT NULL,
          port INTEGER NOT NULL,
          protocol VARCHAR(10) NOT NULL DEFAULT 'http',
          username VARCHAR(100),
          password VARCHAR(100),
          country VARCHAR(50),
          last_used TIMESTAMP DEFAULT NOW(),
          fail_count INTEGER DEFAULT 0,
          success_count INTEGER DEFAULT 0,
          is_disabled BOOLEAN DEFAULT FALSE,
          cooldown_until TIMESTAMP,
          UNIQUE(host, port)
        );
      `);
    } catch (error) {
      console.error('Error creating proxy table:', error);
      throw error;
    }
  }
  
  /**
   * Tải proxy từ database
   */
  private async loadProxiesFromDatabase(): Promise<void> {
    try {
      const result = await this.pool.query(`
        SELECT 
          id, host, port, protocol, username, password, country,
          last_used, fail_count, success_count, is_disabled, cooldown_until
        FROM ${this.proxyTableName}
        WHERE is_disabled = FALSE
        ORDER BY last_used ASC
      `);
      
      this.proxies = result.rows.map(row => ({
        id: row.id,
        host: row.host,
        port: row.port,
        protocol: row.protocol,
        username: row.username,
        password: row.password,
        country: row.country,
        lastUsed: new Date(row.last_used),
        failCount: row.fail_count,
        successCount: row.success_count,
        isDisabled: row.is_disabled,
        cooldownUntil: row.cooldown_until ? new Date(row.cooldown_until) : null
      }));
    } catch (error) {
      console.error('Error loading proxies from database:', error);
      throw error;
    }
  }
  
  /**
   * Import proxy từ file
   */
  private async importProxiesFromFile(): Promise<void> {
    try {
      const proxyFilePath = path.join(process.cwd(), 'proxies.json');
      
      if (!fs.existsSync(proxyFilePath)) {
        console.log('No proxies file found at:', proxyFilePath);
        return;
      }
      
      const fileContent = fs.readFileSync(proxyFilePath, 'utf8');
      const proxiesData = JSON.parse(fileContent);
      
      if (!Array.isArray(proxiesData) || proxiesData.length === 0) {
        console.log('No proxies found in the JSON file');
        return;
      }
      
      for (const proxy of proxiesData) {
        if (!proxy.host || !proxy.port) {
          console.error(`Skipping invalid proxy: ${JSON.stringify(proxy)}`);
          continue;
        }
        
        await this.addProxy(
          proxy.host,
          proxy.port,
          proxy.protocol || 'http',
          proxy.username,
          proxy.password,
          proxy.country
        );
      }
      
      console.log(`Imported ${proxiesData.length} proxies from JSON file`);
    } catch (error) {
      console.error('Error importing proxies from file:', error);
    }
  }
  
  /**
   * Thêm proxy mới
   */
  public async addProxy(
    host: string,
    port: number,
    protocol: 'http' | 'https' | 'socks' = 'http',
    username?: string,
    password?: string,
    country?: string
  ): Promise<boolean> {
    try {
      console.log(`Đang thêm proxy: ${host}:${port}, protocol=${protocol}, username=${username}, country=${country}`);
      
      // Thêm mới proxy trực tiếp mà không kiểm tra trùng lặp
      // Do chúng ta đã xóa ràng buộc unique, việc này sẽ hoạt động tốt
      const result = await this.pool.query(`
        INSERT INTO ${this.proxyTableName}
        (host, port, protocol, username, password, country)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [host, port, protocol, username, password, country]);
      
      console.log(`Đã thêm proxy mới ${host}:${port} (ID: ${result.rows[0].id})`);
      
      // Tải lại proxy từ database
      await this.loadProxiesFromDatabase();
      
      return true;
    } catch (error) {
      console.error(`Lỗi khi thêm proxy ${host}:${port}:`, error);
      
      // Nếu vẫn gặp lỗi unique constraint, thử cập nhật thay vì chèn mới
      try {
        console.log(`Thử cập nhật proxy hiện có thay vì chèn mới...`);
        
        const updateResult = await this.pool.query(`
          UPDATE ${this.proxyTableName}
          SET protocol = $3, username = $4, password = $5, country = $6, is_disabled = FALSE
          WHERE host = $1 AND port = $2
          RETURNING id
        `, [host, port, protocol, username, password, country]);
        
        if (updateResult.rowCount && updateResult.rowCount > 0) {
          console.log(`Đã cập nhật proxy ${host}:${port} (ID: ${updateResult.rows[0].id})`);
          
          // Tải lại proxy từ database
          await this.loadProxiesFromDatabase();
          
          return true;
        }
      } catch (updateError) {
        console.error(`Cũng không thể cập nhật proxy ${host}:${port}:`, updateError);
      }
      
      return false;
    }
  }
  
  /**
   * Vô hiệu hóa proxy
   */
  public async disableProxy(host: string, port: number): Promise<boolean> {
    try {
      await this.pool.query(`
        UPDATE ${this.proxyTableName}
        SET is_disabled = TRUE
        WHERE host = $1 AND port = $2
      `, [host, port]);
      
      // Tải lại proxy từ database
      await this.loadProxiesFromDatabase();
      
      return true;
    } catch (error) {
      console.error(`Error disabling proxy ${host}:${port}:`, error);
      return false;
    }
  }
  
  /**
   * Ghi nhận thành công cho proxy
   */
  public async recordSuccess(host: string, port: number): Promise<void> {
    try {
      await this.pool.query(`
        UPDATE ${this.proxyTableName}
        SET 
          success_count = success_count + 1,
          last_used = NOW()
        WHERE host = $1 AND port = $2
      `, [host, port]);
      
      // Cập nhật cache
      const proxy = this.proxies.find(p => p.host === host && p.port === port);
      if (proxy) {
        proxy.lastUsed = new Date();
        proxy.successCount++;
      }
    } catch (error) {
      console.error(`Error recording success for proxy ${host}:${port}:`, error);
    }
  }
  
  /**
   * Ghi nhận thất bại cho proxy
   */
  public async recordFailure(host: string, port: number, isFatal: boolean = false): Promise<void> {
    try {
      let query = `
        UPDATE ${this.proxyTableName}
        SET 
          fail_count = fail_count + 1,
          last_used = NOW()
      `;
      
      // Nếu là lỗi nghiêm trọng, đặt cooldown hoặc vô hiệu hóa
      if (isFatal) {
        const cooldownUntil = new Date(Date.now() + this.RATE_LIMIT_COOLDOWN);
        query += `, cooldown_until = $3`;
        
        await this.pool.query(query, [host, port, cooldownUntil]);
        
        // Cập nhật cache
        const proxy = this.proxies.find(p => p.host === host && p.port === port);
        if (proxy) {
          proxy.lastUsed = new Date();
          proxy.failCount++;
          proxy.cooldownUntil = cooldownUntil;
        }
      } else {
        await this.pool.query(query, [host, port]);
        
        // Cập nhật cache
        const proxy = this.proxies.find(p => p.host === host && p.port === port);
        if (proxy) {
          proxy.lastUsed = new Date();
          proxy.failCount++;
        }
      }
    } catch (error) {
      console.error(`Error recording failure for proxy ${host}:${port}:`, error);
    }
  }
  
  /**
   * Lấy proxy tiếp theo để sử dụng
   */
  public async getNextProxy(): Promise<ProxyConfig | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    if (this.proxies.length === 0) {
      console.error('No proxies available');
      return null;
    }
    
    // Lọc ra các proxy có thể sử dụng
    const now = new Date();
    const availableProxies = this.proxies.filter(proxy => 
      !proxy.isDisabled && 
      (!proxy.cooldownUntil || proxy.cooldownUntil < now)
    );
    
    if (availableProxies.length === 0) {
      console.error('No available proxies (all may be in cooldown)');
      return null;
    }
    
    // Sắp xếp proxy theo thời gian sử dụng cuối cùng (lâu nhất lên đầu)
    availableProxies.sort((a, b) => a.lastUsed.getTime() - b.lastUsed.getTime());
    
    // Lấy proxy đầu tiên
    const proxy = availableProxies[0];
    
    // Cập nhật thời gian sử dụng
    proxy.lastUsed = new Date();
    
    return proxy;
  }
  
  /**
   * Lấy thống kê sử dụng proxy
   */
  public async getProxyStats(): Promise<any> {
    try {
      const result = await this.pool.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN is_disabled THEN 1 ELSE 0 END) as disabled,
          SUM(CASE WHEN cooldown_until > NOW() THEN 1 ELSE 0 END) as in_cooldown,
          SUM(success_count) as total_success,
          SUM(fail_count) as total_fail
        FROM ${this.proxyTableName}
      `);
      
      return result.rows[0];
    } catch (error) {
      console.error('Error getting proxy stats:', error);
      return {
        total: this.proxies.length,
        disabled: this.proxies.filter(p => p.isDisabled).length,
        in_cooldown: this.proxies.filter(p => p.cooldownUntil && p.cooldownUntil > new Date()).length
      };
    }
  }
  
  /**
   * Đóng kết nối
   */
  public async close(): Promise<void> {
    await this.pool.end();
    console.log('Proxy manager closed');
    this.isInitialized = false;
  }
}

// Singleton instance
let proxyManager: ProxyManager | null = null;

/**
 * Lấy instance của ProxyManager
 */
export function getProxyManager(): ProxyManager {
  if (!proxyManager) {
    proxyManager = new ProxyManager();
  }
  return proxyManager;
}

/**
 * Thiết lập HTTP agent với proxy
 */
export async function setupHttpAgentsWithProxy(): Promise<{
  httpAgent: http.Agent | HttpProxyAgent;
  httpsAgent: any; // Use any type for tunneling agent
} | null> {
  try {
    // Lấy proxy tiếp theo
    const manager = getProxyManager();
    const proxy = await manager.getNextProxy();
    
    if (!proxy) {
      // Nếu không có proxy, sử dụng agent mặc định
      setupDefaultHttpAgents();
      return null;
    }
    
    console.log(`Using proxy: ${proxy.host}:${proxy.port} (${proxy.protocol})`);
    
    // Cấu hình proxy
    const proxyConfig = {
      host: proxy.host,
      port: proxy.port
    };
    
    // Thêm xác thực nếu có
    if (proxy.username && proxy.password) {
      Object.assign(proxyConfig, {
        proxyAuth: `${proxy.username}:${proxy.password}`
      });
    }
    
    // Tạo HTTP proxy agent
    const httpAgent = new HttpProxyAgent(`${proxy.protocol}://${proxy.host}:${proxy.port}`);
    
    // Tạo HTTPS over HTTP tunnel agent - giải quyết vấn đề SSL/TLS
    const tunnelAgent = tunnel.httpsOverHttp({
      proxy: proxyConfig
    });
    
    // Đặt làm global agents
    http.globalAgent = httpAgent;
    // Không gán tunnelAgent trực tiếp vào globalAgent vì khác kiểu
    // https.globalAgent sẽ được giữ nguyên
    
    // Đảm bảo các kết nối an toàn kiểm tra chứng chỉ
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
    
    console.log('HTTP and HTTPS agents configured with tunnel proxy');
    
    // Trả về cặp agent để sử dụng trong Snoowrap
    // tunnelAgent được gán vào httpsAgent để trả về cho người gọi sử dụng
    return { httpAgent, httpsAgent: tunnelAgent as any };
  } catch (error) {
    console.error('Error setting up proxy HTTP agents:', error);
    // Fallback to default agents
    setupDefaultHttpAgents();
    return null;
  }
}

/**
 * Thiết lập HTTP agents mặc định
 */
export function setupDefaultHttpAgents(): void {
  // HTTP agent với timeout dài hơn và keepalive
  const httpAgent = new http.Agent({
    keepAlive: true,
    maxSockets: 25,
    timeout: 60000, // 60 seconds
  });
  
  // HTTPS agent với cấu hình bảo mật mặc định
  const httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 25,
    timeout: 60000, // 60 seconds
    rejectUnauthorized: true, // Validate SSL certificates
  });
  
  // Đặt làm global agents
  http.globalAgent = httpAgent;
  https.globalAgent = httpsAgent;
  
  // Đảm bảo các kết nối an toàn kiểm tra chứng chỉ
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
  
  console.log('Default HTTP and HTTPS agents configured successfully');
}

/**
 * Ghi nhận thành công cho proxy hiện tại
 */
export async function recordProxySuccess(host: string, port: number): Promise<void> {
  const manager = getProxyManager();
  await manager.recordSuccess(host, port);
}

/**
 * Ghi nhận thất bại cho proxy hiện tại
 */
export async function recordProxyFailure(host: string, port: number, isFatal: boolean = false): Promise<void> {
  const manager = getProxyManager();
  await manager.recordFailure(host, port, isFatal);
}