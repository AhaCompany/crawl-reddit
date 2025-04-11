/**
 * Simple test script for PostgresMinerStorage with PullPush data
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Pool } = require('pg');

// Load libs
const { PostgresMinerStorage } = require('../dist/storage/PostgresMinerStorage');
const { RedditDataType } = require('../dist/models/RedditContent');

// Create test data directory
const TEST_DIR = path.join(__dirname, '../data/pullpush-simple-test');
if (!fs.existsSync(TEST_DIR)) {
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

async function main() {
  console.log('Starting simple pullpush test...');
  
  // Initialize PostgresMinerStorage
  const postgresStorage = new PostgresMinerStorage();
  await postgresStorage.initialize();
  console.log('PostgresMinerStorage initialized');
  
  // Fetch one post from PullPush API
  console.log('Fetching post from PullPush API...');
  const url = 'https://api.pullpush.io/reddit/search/submission/';
  const response = await axios.get(url, { 
    params: {
      subreddit: 'programming',
      size: 1,
      sort: 'desc'
    },
    headers: {
      'User-Agent': `Reddit-Historical-Data-Crawler/1.0`
    }
  });
  
  if (!response.data || !Array.isArray(response.data.data) || response.data.data.length === 0) {
    console.error('Failed to get post from PullPush API');
    return;
  }
  
  const post = response.data.data[0];
  console.log(`Got post: ${post.id} - ${post.title}`);
  
  // Save to file for inspection
  fs.writeFileSync(path.join(TEST_DIR, 'sample_post.json'), JSON.stringify(post, null, 2));
  
  // Convert to RedditContent format
  const redditContent = {
    id: post.id,
    url: `https://www.reddit.com${post.permalink}`,
    username: post.author,
    community: `r/${post.subreddit}`,
    body: post.selftext || '',
    created_at: new Date(post.created_utc * 1000),
    data_type: RedditDataType.POST,
    title: post.title
  };
  
  // Save to DataEntity table
  console.log('Saving to DataEntity table...');
  const success = await postgresStorage.storeRedditContent(redditContent);
  
  if (success) {
    console.log('Successfully saved to DataEntity table');
  } else {
    console.error('Failed to save to DataEntity table');
  }
  
  // Store in post_comment_tracking table
  console.log('Saving to post_comment_tracking table...');
  
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    database: process.env.PG_DATABASE || 'reddit_data',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
  });
  
  try {
    // Calculate end date for tracking (3 days from now)
    const checkUntil = new Date();
    checkUntil.setDate(checkUntil.getDate() + 3);

    await pool.query(
      `INSERT INTO post_comment_tracking 
      (post_id, subreddit, title, comment_count, crawl_frequency, check_until) 
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (post_id) DO UPDATE SET
        is_active = TRUE,
        title = $3,
        comment_count = $4,
        crawl_frequency = $5,
        check_until = $6,
        last_crawled_at = NOW()`,
      [post.id, post.subreddit, post.title, post.num_comments || 0, '30m', checkUntil]
    );

    console.log(`Added/updated post ${post.id} in post_comment_tracking table`);
  } catch (error) {
    console.error(`Error adding post ${post.id} to tracking:`, error);
  } finally {
    await pool.end();
  }
  
  // Close PostgresMinerStorage
  await postgresStorage.close();
  console.log('Test complete');
}

// Run the test
main().catch(err => {
  console.error('Error in test script:', err);
});