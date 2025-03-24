import { config } from './config/config';
import { setupHttpAgents } from './utils/proxy';
import { ensureDirectoryExists } from './utils/fileHelper';
import { crawlScheduler } from './utils/scheduler';
import { closePool } from './utils/postgresHelper';
import { initializeStorageSystems, closeStorageSystems } from './storage/storageFacade';

/**
 * Parse interval string to cron expression
 * @param interval Interval string (e.g. "5m", "1h", "30s")
 * @returns Cron expression string
 */
function parseIntervalToCron(interval: string): string {
  const match = interval.match(/^(\d+)([smh])$/);
  if (!match) {
    throw new Error(`Invalid interval format: ${interval}. Use format like "30s", "5m", or "1h"`);
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
 * Main function to start continuous crawling
 */
async function startContinuousCrawling() {
  try {
    // Configure HTTP agents
    setupHttpAgents();
    
    // Initialize all storage systems based on configuration
    await initializeStorageSystems();
    
    console.log(`Using storage type: ${config.app.storage}`);
    
    // Create data directory
    ensureDirectoryExists(config.app.outputDir);
    
    // Validate Reddit API credentials
    if (!config.reddit.clientId || !config.reddit.clientSecret) {
      console.error('ERROR: Reddit API credentials not found. Please set up your .env file');
      process.exit(1);
    }
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
      console.error('Usage: npm run continuous-crawl -- <subreddit> <interval> [limit] [sort] [timeRange]');
      console.error('Example: npm run continuous-crawl -- programming 10m 50 new day');
      console.error('Intervals: 30s, 1m, 5m, 1h, etc. (minimum 10 seconds)');
      process.exit(1);
    }
    
    const subreddit = args[0];
    const intervalStr = args[1];
    const limit = args[2] ? parseInt(args[2], 10) : 100;
    const sortBy = (args[3] || 'new') as 'hot' | 'new' | 'top' | 'rising';
    const timeRange = (args[4] || 'day') as 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
    
    try {
      // Convert interval to cron expression
      const cronExpression = parseIntervalToCron(intervalStr);
      
      console.log('='.repeat(50));
      console.log(`Starting continuous crawl for r/${subreddit}`);
      console.log(`Interval: ${intervalStr} (cron: ${cronExpression})`);
      console.log(`Limit: ${limit} posts per crawl`);
      console.log(`Sort: ${sortBy} ${sortBy === 'top' ? `(${timeRange})` : ''}`);
      console.log(`Storage: ${config.app.storage}`);
      console.log('='.repeat(50));
      
      // Add and start the crawl task
      crawlScheduler.addCrawlTask(
        `continuous-${subreddit}`,
        subreddit,
        cronExpression,
        limit,
        sortBy,
        timeRange,
        true // verbose
      );
      
      // Start the scheduler
      crawlScheduler.startAll();
      
      // Run immediately for the first time
      await crawlScheduler.runTaskNow(`continuous-${subreddit}`);
      
      console.log(`Continuous crawling started. Press Ctrl+C to stop.`);
      
      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        console.log('\nGracefully shutting down...');
        crawlScheduler.stopAll();
        
        // Đóng tất cả kết nối database
        await closeStorageSystems();
        
        // Đóng cả pool PostgreSQL nếu đang sử dụng schema thông thường
        if (config.app.storage === 'postgresql') {
          await closePool();
        }
        
        console.log('Shutdown complete.');
        process.exit(0);
      });
      
    } catch (error) {
      console.error('Error setting up continuous crawling:', error);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
  }
}

// Start the continuous crawling
startContinuousCrawling().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});