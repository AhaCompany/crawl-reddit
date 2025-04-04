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
          console.log('Usage: npm run config -- add <subreddit> <interval> [limit] [sort_by] [time_range] [start_time] [end_time] [use_pagination] [max_pages]');
          return;
        }
        
        const subreddit = args[1];
        const interval = args[2];
        const limit = parseInt(args[3] || '50', 10);
        const sortBy = args[4] || 'new';
        const timeRange = args[5] || 'day';
        const startTime = args[6] || null;
        const endTime = args[7] || null;
        const usePagination = args[8] ? args[8].toLowerCase() === 'true' : false;
        const maxPages = parseInt(args[9] || '1', 10);
        
        await configManager.addOrUpdateConfig(subreddit, interval, limit, sortBy, timeRange, startTime, endTime, usePagination, maxPages);
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
  add <subreddit> <interval> [limit] [sort_by] [time_range] [start_time] [end_time] [use_pagination] [max_pages]  
                                   Add or update a crawler configuration
  disable <subreddit>              Disable a crawler
  delete <subreddit>               Delete a crawler configuration
  help                             Show this help message

Examples:
  npm run config -- list
  npm run config -- add bitcoin 5m 25 new day
  npm run config -- add ethereum 10m 50 top week "2024-05-01" "2024-06-01"
  npm run config -- add bitcoin-30days @once 100 new all "2024-03-01" "2024-04-01" true 30
  npm run config -- disable programming
  npm run config -- delete technology

Parameters:
  <subreddit>       Subreddit name (without r/)
  <interval>        Crawl interval (e.g., 5m, 1h, 30s, or @once for one-time execution)
  [limit]           Number of posts to crawl per page (default: 50)
  [sort_by]         Sort method: hot, new, top, rising (default: new)
  [time_range]      Time range: hour, day, week, month, year, all (default: day)
  [start_time]      Optional start time for crawler (YYYY-MM-DD format)
  [end_time]        Optional end time for crawler (YYYY-MM-DD format)
  [use_pagination]  Use pagination for historical crawling: true or false (default: false)
  [max_pages]       Maximum number of pages to crawl when pagination is enabled (default: 1)
  `);
}

// Thực thi lệnh
processCommand().catch(console.error);