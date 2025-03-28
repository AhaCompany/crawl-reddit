/**
 * Tool quản lý tài khoản Reddit từ command line
 */
import { RedditAccountManager } from './utils/accountManager';
import * as fs from 'fs';
import * as path from 'path';

// Tạo instance của account manager
const accountManager = new RedditAccountManager();

/**
 * Hàm lệnh chính
 */
async function main() {
  try {
    await accountManager.initialize();
    
    const args = process.argv.slice(2);
    const command = args[0];
    
    if (!command) {
      printHelp();
      await accountManager.close();
      return;
    }
    
    switch (command) {
      case 'list':
        await listAccounts();
        break;
        
      case 'add':
        if (args.length < 5) {
          console.error('Missing required parameters for add command');
          console.log('Usage: npm run accounts -- add <username> <password> <clientId> <clientSecret> [userAgent]');
          break;
        }
        
        const username = args[1];
        const password = args[2];
        const clientId = args[3];
        const clientSecret = args[4];
        const userAgent = args[5] || `${username} Reddit Bot`;
        
        await addAccount(username, password, clientId, clientSecret, userAgent);
        break;
        
      case 'disable':
        if (args.length < 2) {
          console.error('Missing username parameter');
          console.log('Usage: npm run accounts -- disable <username>');
          break;
        }
        
        await disableAccount(args[1]);
        break;
        
      case 'import':
        if (args.length < 2) {
          console.error('Missing file path parameter');
          console.log('Usage: npm run accounts -- import <filePath>');
          break;
        }
        
        await importAccounts(args[1]);
        break;
        
      case 'stats':
        await showStats();
        break;
        
      case 'test':
        await testNextAccount();
        break;
        
      case 'help':
      default:
        printHelp();
    }
    
    await accountManager.close();
  } catch (error) {
    console.error('Error in account manager tool:', error);
    await accountManager.close();
  }
}

/**
 * Liệt kê tài khoản
 */
async function listAccounts() {
  try {
    const pool = (accountManager as any).pool;
    
    const result = await pool.query(`
      SELECT 
        id, username, last_used, fail_count, success_count, 
        is_disabled, cooldown_until, daily_usage_count, daily_reset_at
      FROM reddit_accounts
      ORDER BY id
    `);
    
    console.log('='.repeat(100));
    console.log('REDDIT ACCOUNTS');
    console.log('='.repeat(100));
    
    if (result.rows.length === 0) {
      console.log('No accounts found.');
      return;
    }
    
    console.log('ID | Username | Last Used | Success | Fails | Active | Cooldown Until | Daily Usage');
    console.log('-'.repeat(100));
    
    for (const acc of result.rows) {
      console.log(
        `${acc.id} | ` +
        `${acc.username} | ` +
        `${acc.last_used.toISOString().replace('T', ' ').substring(0, 19)} | ` +
        `${acc.success_count} | ` +
        `${acc.fail_count} | ` +
        `${!acc.is_disabled ? 'Yes' : 'No'} | ` +
        `${acc.cooldown_until ? acc.cooldown_until.toISOString().replace('T', ' ').substring(0, 19) : 'None'} | ` +
        `${acc.daily_usage_count}`
      );
    }
    
    console.log('='.repeat(100));
  } catch (error) {
    console.error('Error listing accounts:', error);
  }
}

/**
 * Thêm tài khoản
 */
async function addAccount(username: string, password: string, clientId: string, clientSecret: string, userAgent: string) {
  try {
    const success = await accountManager.addAccount(username, password, clientId, clientSecret, userAgent);
    
    if (success) {
      console.log(`Account ${username} added/updated successfully`);
    } else {
      console.error(`Failed to add account ${username}`);
    }
  } catch (error) {
    console.error('Error adding account:', error);
  }
}

/**
 * Vô hiệu hóa tài khoản
 */
async function disableAccount(username: string) {
  try {
    const success = await accountManager.disableAccount(username);
    
    if (success) {
      console.log(`Account ${username} disabled successfully`);
    } else {
      console.error(`Failed to disable account ${username}`);
    }
  } catch (error) {
    console.error('Error disabling account:', error);
  }
}

/**
 * Import tài khoản từ file
 */
async function importAccounts(filePath: string) {
  try {
    // Kiểm tra đường dẫn file
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    
    if (!fs.existsSync(fullPath)) {
      console.error(`File not found: ${fullPath}`);
      return;
    }
    
    // Đọc file
    const fileContent = fs.readFileSync(fullPath, 'utf8');
    const accounts = JSON.parse(fileContent);
    
    if (!Array.isArray(accounts)) {
      console.error('Invalid file format. Expected an array of accounts.');
      return;
    }
    
    console.log(`Found ${accounts.length} accounts in file`);
    
    // Import từng tài khoản
    let successCount = 0;
    for (const acc of accounts) {
      if (!acc.username || !acc.password || !acc.clientId || !acc.clientSecret) {
        console.error(`Skipping invalid account: ${JSON.stringify(acc)}`);
        continue;
      }
      
      const success = await accountManager.addAccount(
        acc.username,
        acc.password,
        acc.clientId,
        acc.clientSecret,
        acc.userAgent || `${acc.username} Reddit Bot`
      );
      
      if (success) {
        successCount++;
      }
    }
    
    console.log(`Successfully imported ${successCount}/${accounts.length} accounts`);
  } catch (error) {
    console.error('Error importing accounts:', error);
  }
}

/**
 * Hiển thị thống kê
 */
async function showStats() {
  try {
    const stats = await accountManager.getAccountStats();
    
    console.log('='.repeat(50));
    console.log('ACCOUNT STATISTICS');
    console.log('='.repeat(50));
    console.log(`Total accounts: ${stats.total}`);
    console.log(`Disabled accounts: ${stats.disabled}`);
    console.log(`Accounts in cooldown: ${stats.in_cooldown}`);
    console.log(`Accounts reached daily limit: ${stats.reached_limit}`);
    console.log(`Total successful requests: ${stats.total_success}`);
    console.log(`Total failed requests: ${stats.total_fail}`);
    console.log('='.repeat(50));
  } catch (error) {
    console.error('Error showing stats:', error);
  }
}

/**
 * Test lấy tài khoản tiếp theo
 */
async function testNextAccount() {
  try {
    const account = await accountManager.getNextAccount();
    
    if (account) {
      console.log('Next account to use:');
      console.log(`- Username: ${account.username}`);
      console.log(`- Client ID: ${account.clientId.substring(0, 5)}...`);
      console.log(`- User Agent: ${account.userAgent}`);
      console.log(`- Last Used: ${account.lastUsed.toISOString()}`);
      console.log(`- Success/Fail: ${account.successCount}/${account.failCount}`);
      console.log(`- Daily Usage: ${account.dailyUsageCount}`);
    } else {
      console.log('No available accounts found');
    }
  } catch (error) {
    console.error('Error testing next account:', error);
  }
}

/**
 * In hướng dẫn sử dụng
 */
function printHelp() {
  console.log(`
Reddit Account Manager
======================

Usage: npm run accounts -- <command> [options]

Commands:
  list                                   List all Reddit accounts
  add <username> <password> <clientId> <clientSecret> [userAgent]  
                                         Add or update a Reddit account
  disable <username>                     Disable a Reddit account
  import <filePath>                      Import accounts from JSON file
  stats                                  Show account usage statistics
  test                                   Test getting next available account
  help                                   Show this help message

Examples:
  npm run accounts -- list
  npm run accounts -- add myusername mypassword clientId123 clientSecret456
  npm run accounts -- disable myusername
  npm run accounts -- import reddit_accounts.json
  npm run accounts -- stats
  npm run accounts -- test
  `);
}

// Chạy chương trình
main().catch(console.error);