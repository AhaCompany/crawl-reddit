/**
 * Command-line tool để quản lý cấu hình crawler
 */
import { CrawlerConfigManager } from './utils/crawlerConfigManager';

// Phân tích tham số dòng lệnh
const args = process.argv.slice(2);
const command = args[0];

// Tạo instance của crawler config manager
const configManager = new CrawlerConfigManager();

// Xử lý các lệnh
async function processCommand() {
  try {
    if (!command) {
      printHelp();
      return;
    }

    switch (command) {
      case 'list':
        await configManager.listAllConfigs();
        break;

      case 'add':
        if (args.length < 3) {
          console.error('Missing required parameters for add command');
          console.log('Usage: npm run config -- add <subreddit> <interval> [limit] [sort_by] [time_range]');
          return;
        }
        
        const subreddit = args[1];
        const interval = args[2];
        const limit = parseInt(args[3] || '50', 10);
        const sortBy = args[4] || 'new';
        const timeRange = args[5] || 'day';
        
        await configManager.addOrUpdateConfig(subreddit, interval, limit, sortBy, timeRange);
        break;

      case 'disable':
        if (args.length < 2) {
          console.error('Missing subreddit parameter for disable command');
          console.log('Usage: npm run config -- disable <subreddit>');
          return;
        }
        
        await configManager.disableConfig(args[1]);
        break;

      case 'delete':
        if (args.length < 2) {
          console.error('Missing subreddit parameter for delete command');
          console.log('Usage: npm run config -- delete <subreddit>');
          return;
        }
        
        await configManager.deleteConfig(args[1]);
        break;

      case 'help':
        printHelp();
        break;

      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
    }
  } catch (error) {
    console.error('Error processing command:', error);
  } finally {
    await configManager.close();
  }
}

// In hướng dẫn sử dụng
function printHelp() {
  console.log(`
Crawler Configuration Tool
=========================

Usage: npm run config -- <command> [options]

Commands:
  list                             List all crawler configurations
  add <subreddit> <interval> [limit] [sort_by] [time_range]  
                                   Add or update a crawler configuration
  disable <subreddit>              Disable a crawler
  delete <subreddit>               Delete a crawler configuration
  help                             Show this help message

Examples:
  npm run config -- list
  npm run config -- add bitcoin 5m 25 new day
  npm run config -- disable programming
  npm run config -- delete technology

Parameters:
  <subreddit>   Subreddit name (without r/)
  <interval>    Crawl interval (e.g., 5m, 1h, 30s)
  [limit]       Number of posts to crawl (default: 50)
  [sort_by]     Sort method: hot, new, top, rising (default: new)
  [time_range]  Time range: hour, day, week, month, year, all (default: day)
  `);
}

// Thực thi lệnh
processCommand().catch(console.error);