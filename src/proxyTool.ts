/**
 * Tool quản lý proxy từ command line
 */
import { getProxyManager } from './utils/proxy';
import * as fs from 'fs';
import * as path from 'path';

// Tạo instance của proxy manager
const proxyManager = getProxyManager();

/**
 * Hàm lệnh chính
 */
async function main() {
  try {
    await proxyManager.initialize();
    
    const args = process.argv.slice(2);
    const command = args[0];
    
    if (!command) {
      printHelp();
      await proxyManager.close();
      return;
    }
    
    switch (command) {
      case 'list':
        await listProxies();
        break;
        
      case 'add':
        if (args.length < 3) {
          console.error('Missing required parameters for add command');
          console.log('Usage: npm run proxy -- add <host> <port> [protocol] [username] [password] [country]');
          break;
        }
        
        const host = args[1];
        const port = parseInt(args[2], 10);
        const protocol = (args[3] || 'http') as 'http' | 'https' | 'socks';
        const username = args[4] || undefined;
        const password = args[5] || undefined;
        const country = args[6] || undefined;
        
        await addProxy(host, port, protocol, username, password, country);
        break;
        
      case 'disable':
        if (args.length < 3) {
          console.error('Missing host/port parameters');
          console.log('Usage: npm run proxy -- disable <host> <port>');
          break;
        }
        
        await disableProxy(args[1], parseInt(args[2], 10));
        break;
        
      case 'import':
        if (args.length < 2) {
          console.error('Missing file path parameter');
          console.log('Usage: npm run proxy -- import <filePath>');
          break;
        }
        
        await importProxies(args[1]);
        break;
        
      case 'stats':
        await showStats();
        break;
        
      case 'test':
        await testNextProxy();
        break;
        
      case 'help':
      default:
        printHelp();
    }
    
    await proxyManager.close();
  } catch (error) {
    console.error('Error in proxy manager tool:', error);
    await proxyManager.close();
  }
}

/**
 * Liệt kê proxy
 */
async function listProxies() {
  try {
    const pool = (proxyManager as any).pool;
    
    const result = await pool.query(`
      SELECT 
        id, host, port, protocol, username, password, country, 
        last_used, fail_count, success_count, 
        is_disabled, cooldown_until
      FROM proxy_servers
      ORDER BY id
    `);
    
    console.log('='.repeat(100));
    console.log('PROXY SERVERS');
    console.log('='.repeat(100));
    
    if (result.rows.length === 0) {
      console.log('No proxies found.');
      return;
    }
    
    console.log('ID | Host | Port | Protocol | Auth | Country | Last Used | Success | Fails | Active | Cooldown');
    console.log('-'.repeat(100));
    
    for (const proxy of result.rows) {
      console.log(
        `${proxy.id} | ` +
        `${proxy.host} | ` +
        `${proxy.port} | ` +
        `${proxy.protocol} | ` +
        `${proxy.username ? 'Yes' : 'No'} | ` +
        `${proxy.country || 'Unknown'} | ` +
        `${proxy.last_used.toISOString().replace('T', ' ').substring(0, 19)} | ` +
        `${proxy.success_count} | ` +
        `${proxy.fail_count} | ` +
        `${!proxy.is_disabled ? 'Yes' : 'No'} | ` +
        `${proxy.cooldown_until ? proxy.cooldown_until.toISOString().replace('T', ' ').substring(0, 19) : 'None'}`
      );
    }
    
    console.log('='.repeat(100));
  } catch (error) {
    console.error('Error listing proxies:', error);
  }
}

/**
 * Thêm proxy
 */
async function addProxy(
  host: string, 
  port: number, 
  protocol: 'http' | 'https' | 'socks' = 'http',
  username?: string,
  password?: string,
  country?: string
) {
  try {
    const success = await proxyManager.addProxy(host, port, protocol, username, password, country);
    
    if (success) {
      console.log(`Proxy ${host}:${port} added/updated successfully`);
    } else {
      console.error(`Failed to add proxy ${host}:${port}`);
    }
  } catch (error) {
    console.error('Error adding proxy:', error);
  }
}

/**
 * Vô hiệu hóa proxy
 */
async function disableProxy(host: string, port: number) {
  try {
    const success = await proxyManager.disableProxy(host, port);
    
    if (success) {
      console.log(`Proxy ${host}:${port} disabled successfully`);
    } else {
      console.error(`Failed to disable proxy ${host}:${port}`);
    }
  } catch (error) {
    console.error('Error disabling proxy:', error);
  }
}

/**
 * Import proxy từ file
 */
async function importProxies(filePath: string) {
  try {
    // Kiểm tra đường dẫn file
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    
    if (!fs.existsSync(fullPath)) {
      console.error(`File not found: ${fullPath}`);
      return;
    }
    
    // Đọc file
    const fileContent = fs.readFileSync(fullPath, 'utf8');
    let proxies: any[] = [];
    
    // Có thể là JSON hoặc text format
    if (filePath.toLowerCase().endsWith('.json')) {
      proxies = JSON.parse(fileContent);
    } else {
      // Định dạng mỗi dòng: host:port hoặc host:port:username:password
      const lines = fileContent.split('\n').filter(line => line.trim().length > 0);
      
      proxies = lines.map(line => {
        const parts = line.split(':');
        if (parts.length >= 2) {
          return {
            host: parts[0].trim(),
            port: parseInt(parts[1].trim(), 10),
            username: parts.length > 2 ? parts[2].trim() : undefined,
            password: parts.length > 3 ? parts[3].trim() : undefined
          };
        }
        return null;
      }).filter(proxy => proxy !== null);
    }
    
    if (proxies.length === 0) {
      console.error('No valid proxies found in the file');
      return;
    }
    
    console.log(`Found ${proxies.length} proxies in file`);
    
    // Import từng proxy
    let successCount = 0;
    for (const proxy of proxies) {
      if (!proxy.host || !proxy.port) {
        console.error(`Skipping invalid proxy: ${JSON.stringify(proxy)}`);
        continue;
      }
      
      const success = await proxyManager.addProxy(
        proxy.host,
        proxy.port,
        proxy.protocol || 'http',
        proxy.username,
        proxy.password,
        proxy.country
      );
      
      if (success) {
        successCount++;
      }
    }
    
    console.log(`Successfully imported ${successCount}/${proxies.length} proxies`);
  } catch (error) {
    console.error('Error importing proxies:', error);
  }
}

/**
 * Hiển thị thống kê
 */
async function showStats() {
  try {
    const stats = await proxyManager.getProxyStats();
    
    console.log('='.repeat(50));
    console.log('PROXY STATISTICS');
    console.log('='.repeat(50));
    console.log(`Total proxies: ${stats.total}`);
    console.log(`Disabled proxies: ${stats.disabled}`);
    console.log(`Proxies in cooldown: ${stats.in_cooldown}`);
    console.log(`Total successful requests: ${stats.total_success}`);
    console.log(`Total failed requests: ${stats.total_fail}`);
    console.log('='.repeat(50));
  } catch (error) {
    console.error('Error showing stats:', error);
  }
}

/**
 * Test lấy proxy tiếp theo
 */
async function testNextProxy() {
  try {
    const proxy = await proxyManager.getNextProxy();
    
    if (proxy) {
      console.log('Next proxy to use:');
      console.log(`- Host: ${proxy.host}`);
      console.log(`- Port: ${proxy.port}`);
      console.log(`- Protocol: ${proxy.protocol}`);
      console.log(`- Auth: ${proxy.username ? 'Yes' : 'No'}`);
      console.log(`- Country: ${proxy.country || 'Unknown'}`);
      console.log(`- Last Used: ${proxy.lastUsed.toISOString()}`);
      console.log(`- Success/Fail: ${proxy.successCount}/${proxy.failCount}`);
    } else {
      console.log('No available proxies found');
    }
  } catch (error) {
    console.error('Error testing next proxy:', error);
  }
}

/**
 * In hướng dẫn sử dụng
 */
function printHelp() {
  console.log(`
Proxy Manager
======================

Usage: npm run proxy -- <command> [options]

Commands:
  list                                   List all proxies
  add <host> <port> [protocol] [username] [password] [country]  
                                         Add or update a proxy
  disable <host> <port>                  Disable a proxy
  import <filePath>                      Import proxies from file (JSON or text)
  stats                                  Show proxy usage statistics
  test                                   Test getting next available proxy
  help                                   Show this help message

Examples:
  npm run proxy -- list
  npm run proxy -- add 192.168.1.1 8080 http
  npm run proxy -- add proxy.example.com 8080 https username password US
  npm run proxy -- disable 192.168.1.1 8080
  npm run proxy -- import proxies.json
  npm run proxy -- import proxies.txt
  npm run proxy -- stats
  npm run proxy -- test

Notes:
  - For text import, format each line as: host:port or host:port:username:password
  - JSON import should have an array of objects with host, port, protocol, username, password fields
  `);
}

// Chạy chương trình
main().catch(console.error);