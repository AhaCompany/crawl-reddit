import { crawlSubredditPosts, crawlPostComments } from './api/postCrawler';
import { config } from './config/config';
import path from 'path';
import fs from 'fs';
import { ensureDirectoryExists } from './utils/fileHelper';
import { setupHttpAgents } from './utils/proxy';

// Create data directory if it doesn't exist
ensureDirectoryExists(config.app.outputDir);

/**
 * Main function to run the Reddit crawler
 */
async function main() {
  // Configure global HTTP agents to avoid connection issues
  setupHttpAgents();

  // Example usage - change these parameters as needed
  const subreddit = process.argv[2] || 'programming';
  const limit = Number(process.argv[3]) || 25;
  const sortBy = (process.argv[4] || 'hot') as 'hot' | 'new' | 'top' | 'rising';
  const timeRange = (process.argv[5] || 'week') as 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
  
  try {
    if (!config.reddit.clientId || !config.reddit.clientSecret) {
      console.error('ERROR: Reddit API credentials not found. Please set up your .env file based on .env.example');
      return;
    }
    
    console.log(`Starting Reddit crawler for r/${subreddit} (${sortBy})`);
    
    // Crawl posts from subreddit
    await crawlSubredditPosts(subreddit, limit, sortBy, timeRange);
    
    // Example of crawling comments from a post
    // To use this, uncomment and provide a post ID
    // await crawlPostComments('post_id_here');
    
    console.log('Crawling completed successfully!');
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

// Run the main function
main().catch(console.error);