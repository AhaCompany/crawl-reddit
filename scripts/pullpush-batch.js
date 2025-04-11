const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ensureDirectoryExists, saveToJson } = require('../src/utils/fileHelper');

// Configuration
const ALL_SUBREDDITS = [
  'AskReddit',
  // Add all 71 subreddits here
  // This is just a sample
  'worldnews',
  'science',
  'technology',
  'space'
];

const DAYS_TO_CRAWL = 30;
const MAX_POSTS_PER_REQUEST = 100; // PullPush API limit
const OUTPUT_DIR = path.join(__dirname, '../data/pullpush-data');
const BATCH_SIZE = 5; // Process 5 subreddits at a time
const DELAY_BETWEEN_REQUESTS = 2000; // 2 seconds delay between API requests
const DELAY_BETWEEN_SUBREDDITS = 5000; // 5 seconds delay between subreddits
const DELAY_BETWEEN_BATCHES = 60000; // 1 minute delay between batches
const STATE_FILE = path.join(OUTPUT_DIR, 'processed_subreddits.json');

// Calculate date range (last 30 days)
const endDate = new Date();
const startDate = new Date();
startDate.setDate(startDate.getDate() - DAYS_TO_CRAWL);

// Convert dates to Unix timestamps (seconds)
const after = Math.floor(startDate.getTime() / 1000);
const before = Math.floor(endDate.getTime() / 1000);

/**
 * Sleep function to add delay between requests
 * @param {number} ms Milliseconds to sleep
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Get list of already processed subreddits
 * @returns {Array} List of processed subreddit names
 */
function getProcessedSubreddits() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error reading processed subreddits:', error);
  }
  return [];
}

/**
 * Save a subreddit to the processed list
 * @param {string} subreddit Subreddit name
 */
function saveProcessedSubreddit(subreddit) {
  try {
    const processed = getProcessedSubreddits();
    if (!processed.includes(subreddit)) {
      processed.push(subreddit);
      ensureDirectoryExists(path.dirname(STATE_FILE));
      fs.writeFileSync(STATE_FILE, JSON.stringify(processed, null, 2));
    }
  } catch (error) {
    console.error('Error saving processed subreddit:', error);
  }
}

/**
 * Make request to PullPush API
 * @param {string} subreddit Subreddit name
 * @param {object} params Query parameters
 * @param {number} attempt Current attempt number
 * @returns {Promise<Array>} Array of posts
 */
async function fetchFromPullPush(subreddit, params, attempt = 1) {
  const MAX_ATTEMPTS = 3;
  const url = 'https://api.pullpush.io/reddit/search/submission/';
  
  try {
    console.log(`[${subreddit}] Making request with params:`, params);
    
    const response = await axios.get(url, { 
      params,
      headers: {
        'User-Agent': `Reddit-Historical-Data-Crawler/1.0`
      }
    });
    
    if (response.data && Array.isArray(response.data.data)) {
      console.log(`[${subreddit}] Found ${response.data.data.length} posts`);
      return response.data.data;
    } else {
      console.log(`[${subreddit}] Unexpected response format:`, response.data);
      return [];
    }
  } catch (error) {
    console.error(`[${subreddit}] Attempt ${attempt} failed:`, error.message);
    
    if (attempt < MAX_ATTEMPTS) {
      console.log(`[${subreddit}] Retrying in ${DELAY_BETWEEN_REQUESTS * 2}ms...`);
      await sleep(DELAY_BETWEEN_REQUESTS * 2);
      return fetchFromPullPush(subreddit, params, attempt + 1);
    } else {
      console.error(`[${subreddit}] Max attempts reached, giving up on this request`);
      return [];
    }
  }
}

/**
 * Fetch comments for a post using PullPush API
 * @param {string} postId Reddit post ID
 * @param {number} attempt Current attempt number
 * @returns {Promise<Array>} Array of comments
 */
async function fetchCommentsForPost(postId, attempt = 1) {
  const MAX_ATTEMPTS = 3;
  const url = 'https://api.pullpush.io/reddit/search/comment/';
  
  try {
    console.log(`Fetching comments for post ${postId}`);
    
    const params = {
      link_id: `t3_${postId}`,
      size: 100,
      sort: 'desc'
    };
    
    const response = await axios.get(url, { 
      params,
      headers: {
        'User-Agent': `Reddit-Historical-Data-Crawler/1.0`
      }
    });
    
    if (response.data && Array.isArray(response.data.data)) {
      console.log(`Found ${response.data.data.length} comments for post ${postId}`);
      return response.data.data;
    } else {
      console.log('Unexpected response format for comments:', response.data);
      return [];
    }
  } catch (error) {
    console.error(`Attempt ${attempt} to fetch comments failed:`, error.message);
    
    if (attempt < MAX_ATTEMPTS) {
      console.log(`Retrying comment fetch in ${DELAY_BETWEEN_REQUESTS * 2}ms...`);
      await sleep(DELAY_BETWEEN_REQUESTS * 2);
      return fetchCommentsForPost(postId, attempt + 1);
    } else {
      console.error('Max attempts reached, giving up on comments for this post');
      return [];
    }
  }
}

/**
 * Format post data for storage
 * @param {object} post Raw post data
 * @returns {object} Formatted post
 */
function formatPost(post) {
  return {
    id: post.id,
    subreddit: post.subreddit,
    title: post.title,
    selftext: post.selftext,
    created_utc: post.created_utc,
    author: post.author,
    permalink: post.permalink,
    url: post.url,
    num_comments: post.num_comments || 0,
    score: post.score,
    upvote_ratio: post.upvote_ratio,
    pullpush_data: true // Mark as data from pullpush
  };
}

/**
 * Format comment data for storage
 * @param {object} comment Raw comment data
 * @returns {object} Formatted comment
 */
function formatComment(comment) {
  return {
    id: comment.id,
    post_id: comment.link_id.replace('t3_', ''),
    parent_id: comment.parent_id,
    author: comment.author,
    body: comment.body,
    created_utc: comment.created_utc,
    score: comment.score,
    pullpush_data: true // Mark as data from pullpush
  };
}

/**
 * Crawl and save posts for a single subreddit
 * @param {string} subreddit Subreddit name
 */
async function crawlSubreddit(subreddit) {
  console.log(`\n===== Starting crawl of r/${subreddit} for the last ${DAYS_TO_CRAWL} days =====`);
  console.log(`Date range: ${new Date(after * 1000).toISOString()} to ${new Date(before * 1000).toISOString()}`);

  // Create output directories
  const subredditDir = path.join(OUTPUT_DIR, subreddit);
  const postsDir = path.join(subredditDir, 'posts');
  const commentsDir = path.join(subredditDir, 'comments');
  
  ensureDirectoryExists(postsDir);
  ensureDirectoryExists(commentsDir);
  
  let allPosts = [];
  
  // Base query parameters
  const params = {
    subreddit,
    after,
    before,
    size: MAX_POSTS_PER_REQUEST,
    sort: 'desc',
  };
  
  try {
    // First request
    let posts = await fetchFromPullPush(subreddit, params);
    allPosts = [...allPosts, ...posts];
    
    // If we got the maximum number of posts, we need to paginate
    while (posts.length === MAX_POSTS_PER_REQUEST) {
      await sleep(DELAY_BETWEEN_REQUESTS);
      
      // Get the oldest post's created_utc as the new "before"
      const oldestPost = posts.reduce((min, post) => 
        post.created_utc < min.created_utc ? post : min, posts[0]);
      
      params.before = oldestPost.created_utc;
      
      console.log(`[${subreddit}] Paginating: Getting posts before ${new Date(params.before * 1000).toISOString()}`);
      posts = await fetchFromPullPush(subreddit, params);
      
      // Filter out duplicates based on post ID
      const newPosts = posts.filter(post => 
        !allPosts.some(existingPost => existingPost.id === post.id)
      );
      
      console.log(`[${subreddit}] Found ${newPosts.length} new unique posts (${posts.length - newPosts.length} duplicates filtered out)`);
      
      allPosts = [...allPosts, ...newPosts];
      
      // If we didn't get any new posts, break the loop
      if (newPosts.length === 0) {
        break;
      }
    }
    
    // Format posts
    const formattedPosts = allPosts.map(formatPost);
    
    // Save all posts as a single file
    const postsPath = path.join(postsDir, `${subreddit}_posts.json`);
    saveToJson(postsPath, formattedPosts);
    
    console.log(`[${subreddit}] Saved ${formattedPosts.length} posts to: ${postsPath}`);
    
    // Fetch comments for each post (if needed)
    const FETCH_COMMENTS = process.env.CRAWL_COMMENTS === 'true' || false;
    
    if (FETCH_COMMENTS) {
      console.log(`[${subreddit}] Fetching comments for ${formattedPosts.length} posts...`);
      
      let allComments = [];
      
      for (let i = 0; i < formattedPosts.length; i++) {
        const post = formattedPosts[i];
        console.log(`[${subreddit}] Processing post ${i+1}/${formattedPosts.length} (ID: ${post.id})`);
        
        if (post.num_comments > 0) {
          const comments = await fetchCommentsForPost(post.id);
          const formattedComments = comments.map(formatComment);
          allComments = [...allComments, ...formattedComments];
          
          // Save comments for this post
          if (formattedComments.length > 0) {
            const commentsPath = path.join(commentsDir, `${post.id}_comments.json`);
            saveToJson(commentsPath, formattedComments);
          }
          
          // Add delay between posts
          if (i < formattedPosts.length - 1) {
            await sleep(DELAY_BETWEEN_REQUESTS);
          }
        }
      }
      
      // Save all comments as a single file
      if (allComments.length > 0) {
        const allCommentsPath = path.join(commentsDir, `${subreddit}_all_comments.json`);
        saveToJson(allCommentsPath, allComments);
        console.log(`[${subreddit}] Saved ${allComments.length} comments to: ${allCommentsPath}`);
      }
    }
    
    console.log(`===== Completed crawl of r/${subreddit} =====\n`);
    return true;
    
  } catch (error) {
    console.error(`[${subreddit}] Error in crawl:`, error);
    return false;
  }
}

/**
 * Process all subreddits in batches
 */
async function processBatches() {
  // Create main output directory
  ensureDirectoryExists(OUTPUT_DIR);
  
  // Get already processed subreddits
  const processedSubreddits = getProcessedSubreddits();
  console.log(`Already processed ${processedSubreddits.length} subreddits`);
  
  // Filter out already processed subreddits
  const remainingSubreddits = ALL_SUBREDDITS.filter(
    subreddit => !processedSubreddits.includes(subreddit)
  );
  
  console.log(`Processing ${remainingSubreddits.length} remaining subreddits in batches of ${BATCH_SIZE}\n`);
  
  // Process in batches
  for (let i = 0; i < remainingSubreddits.length; i += BATCH_SIZE) {
    const batch = remainingSubreddits.slice(i, i + BATCH_SIZE);
    console.log(`\n----- Starting batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(remainingSubreddits.length/BATCH_SIZE)} -----`);
    
    // Process each subreddit in the batch
    for (let j = 0; j < batch.length; j++) {
      const subreddit = batch[j];
      console.log(`Processing subreddit ${j+1}/${batch.length} in current batch: r/${subreddit}`);
      
      const success = await crawlSubreddit(subreddit);
      
      if (success) {
        saveProcessedSubreddit(subreddit);
        console.log(`Marked r/${subreddit} as processed`);
      } else {
        console.error(`Failed to process r/${subreddit}`);
      }
      
      // Add delay between subreddits (except for the last one in the batch)
      if (j < batch.length - 1) {
        console.log(`Waiting ${DELAY_BETWEEN_SUBREDDITS/1000}s before next subreddit...\n`);
        await sleep(DELAY_BETWEEN_SUBREDDITS);
      }
    }
    
    // Add delay between batches (except for the last batch)
    if (i + BATCH_SIZE < remainingSubreddits.length) {
      console.log(`\n----- Batch complete. Waiting ${DELAY_BETWEEN_BATCHES/1000}s before next batch... -----\n`);
      await sleep(DELAY_BETWEEN_BATCHES);
    }
  }
  
  console.log('\n===== All subreddits processed! =====');
}

// Create a usage guide
function showUsage() {
  console.log(`
PullPush Reddit Batch Crawler
-----------------------------
This script crawls multiple subreddits using pullpush.io's API to collect historical data.

Environment Variables:
  - CRAWL_COMMENTS: Set to "true" to fetch comments for each post (default: false)

Examples:
  - Crawl posts only:     node scripts/pullpush-batch.js
  - Crawl with comments:  CRAWL_COMMENTS=true node scripts/pullpush-batch.js
  `);
}

// Show usage and run the crawler
showUsage();
processBatches();