const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ensureDirectoryExists, saveToJson } = require('../src/utils/fileHelper');
const { Pool } = require('pg');
// Load environment variables directly
require('dotenv').config();

// Create config object manually since TypeScript config might not work in pure JS
const config = {
  postgresql: {
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    database: process.env.PG_DATABASE || 'reddit_data',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
  },
  app: {
    outputDir: path.join(__dirname, '../data'),
    storage: process.env.STORAGE_TYPE || 'json',
  }
};

// Configuration
const SUBREDDIT = process.env.SUBREDDIT || 'AskReddit'; // Can be set via env var
const DAYS_TO_CRAWL = parseInt(process.env.DAYS_TO_CRAWL || '2', 10); // Can be set via env var
const MAX_POSTS_PER_REQUEST = 100; // PullPush API limit
const OUTPUT_DIR = path.join(__dirname, '../data/pullpush-test');
const POSTS_DIR = path.join(OUTPUT_DIR, SUBREDDIT, 'posts');
const COMMENTS_DIR = path.join(OUTPUT_DIR, SUBREDDIT, 'comments');
const DELAY_BETWEEN_REQUESTS = 2000; // 2 seconds delay to be respectful to the API
const DELAY_BETWEEN_COMMENT_REQUESTS = 1000; // 1 second delay between comment requests

// Initialize PostgreSQL connection
let pool = null;

// Calculate date range
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
 * Initialize database connections
 */
async function initDatabaseConnection() {
  try {
    // Initialize PostgreSQL connection pool
    pool = new Pool({
      host: config.postgresql.host,
      port: config.postgresql.port,
      database: config.postgresql.database,
      user: config.postgresql.user,
      password: config.postgresql.password,
    });
    
    console.log('Connected to PostgreSQL database');
    
    // Check if post_comment_tracking table exists
    const postTrackingTableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'post_comment_tracking'
      )
    `);
    
    if (!postTrackingTableCheck.rows[0].exists) {
      // Create post_comment_tracking table if it doesn't exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS post_comment_tracking (
          id SERIAL PRIMARY KEY,
          post_id TEXT UNIQUE NOT NULL,
          subreddit TEXT NOT NULL,
          title TEXT,
          comment_count INTEGER DEFAULT 0,
          last_comment_id TEXT,
          last_crawled_at TIMESTAMP DEFAULT NOW(),
          first_seen_at TIMESTAMP DEFAULT NOW(),
          is_active BOOLEAN DEFAULT TRUE,
          priority INTEGER DEFAULT 5,
          crawl_frequency TEXT DEFAULT '30m',
          check_until TIMESTAMP
        )
      `);
      console.log('Created post_comment_tracking table');
    }
    
    // Check if dataentity table exists
    const dataEntityTableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'dataentity'
      )
    `);
    
    if (!dataEntityTableCheck.rows[0].exists) {
      // Create dataentity table if it doesn't exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS dataentity (
          uri                 TEXT            PRIMARY KEY,
          datetime            TIMESTAMP(6)    NOT NULL,
          timeBucketId        INTEGER         NOT NULL,
          source              INTEGER         NOT NULL,
          label               CHAR(32),
          content             BYTEA           NOT NULL,
          contentSizeBytes    INTEGER         NOT NULL
        )
      `);
      
      // Create indexes to improve performance
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_dataentity_timebucketid ON dataentity(timeBucketId);
        CREATE INDEX IF NOT EXISTS idx_dataentity_label ON dataentity(label);
      `);
      
      console.log('Created dataentity table with indexes');
    }
    
    // We will insert directly to dataentity table using the pool
    // No need to initialize PostgresMinerStorage anymore
    
    return true;
  } catch (error) {
    console.error('Database connection error:', error);
    return false;
  }
}

/**
 * Make request to PullPush API for submissions
 * @param {object} params Query parameters
 * @param {number} attempt Current attempt number
 * @returns {Promise<Array>} Array of posts
 */
async function fetchFromPullPush(params, attempt = 1) {
  const MAX_ATTEMPTS = 3;
  const url = 'https://api.pullpush.io/reddit/search/submission/';
  
  try {
    console.log(`Making request with params:`, params);
    
    const response = await axios.get(url, { 
      params,
      headers: {
        'User-Agent': `Reddit-Historical-Data-Crawler/1.0`
      }
    });
    
    if (response.data && Array.isArray(response.data.data)) {
      console.log(`Found ${response.data.data.length} posts`);
      return response.data.data;
    } else {
      console.log('Unexpected response format:', response.data);
      return [];
    }
  } catch (error) {
    console.error(`Attempt ${attempt} failed:`, error.message);
    
    if (attempt < MAX_ATTEMPTS) {
      console.log(`Retrying in ${DELAY_BETWEEN_REQUESTS * 2}ms...`);
      await sleep(DELAY_BETWEEN_REQUESTS * 2);
      return fetchFromPullPush(params, attempt + 1);
    } else {
      console.error('Max attempts reached, giving up on this request');
      return [];
    }
  }
}

/**
 * Fetch comments for a post using PullPush API with pagination
 * @param {string} postId Reddit post ID
 * @param {number} attempt Current attempt number
 * @returns {Promise<Array>} Array of comments
 */
async function fetchCommentsForPost(postId, attempt = 1) {
  const MAX_ATTEMPTS = 3;
  // Sử dụng URL API đúng để lấy comments - URL khác với API lấy posts
  const url = 'https://api.pullpush.io/reddit/comment/search/';
  const MAX_COMMENT_PAGES = 10; // Giới hạn số trang để tránh lấy quá nhiều comments
  
  try {
    console.log(`Fetching comments for post ${postId}`);
    
    // Triển khai pagination để lấy tất cả comments
    let allComments = [];
    let hasMore = true;
    let after = null;
    let pageCount = 0;
    
    while (hasMore && pageCount < MAX_COMMENT_PAGES) {
      pageCount++;
      console.log(`Fetching comments page ${pageCount} for post ${postId}`);
      
      // Tham số API đúng là article thay vì link_id
      const params = {
        article: postId,  // Không cần tiền tố t3_
        size: 100,
        sort: 'desc'
      };
      
      // Thêm tham số after nếu không phải page đầu tiên
      if (after) {
        params.after = after;
      }
      
      const response = await axios.get(url, { 
        params,
        headers: {
          'User-Agent': `Reddit-Historical-Data-Crawler/1.0`
        }
      });
      
      if (response.data && Array.isArray(response.data.data)) {
        const comments = response.data.data;
        console.log(`Found ${comments.length} comments for post ${postId} on page ${pageCount}`);
        
        if (comments.length === 0) {
          hasMore = false;
        } else {
          // Thêm comments từ page này vào mảng tổng hợp
          allComments = [...allComments, ...comments];
          
          // Lấy giá trị after từ comment cuối cùng cho page tiếp theo
          const lastComment = comments[comments.length - 1];
          after = lastComment.created_utc;
          
          // Nếu trả về ít hơn kích thước page, không cần lấy thêm
          if (comments.length < 100) {
            hasMore = false;
          }
        }
        
        // Thêm delay nhỏ giữa các page để tránh quá tải API
        await sleep(DELAY_BETWEEN_COMMENT_REQUESTS);
      } else {
        console.log('Unexpected response format for comments:', response.data);
        hasMore = false;
      }
    }
    
    // Loại bỏ trùng lặp nếu có (dựa trên ID comment)
    const uniqueComments = [];
    const commentIds = new Set();
    
    for (const comment of allComments) {
      if (!commentIds.has(comment.id)) {
        commentIds.add(comment.id);
        uniqueComments.push(comment);
      }
    }
    
    console.log(`Total ${uniqueComments.length} unique comments found for post ${postId}`);
    return uniqueComments;
    
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
    parent_id: comment.parent_id,
    link_id: comment.link_id,
    author: comment.author,
    body: comment.body,
    created_utc: comment.created_utc,
    score: comment.score || 0,
    subreddit: comment.subreddit,
    permalink: comment.permalink,
    pullpush_data: true // Mark as data from pullpush
  };
}

/**
 * Add a post to comment tracking table
 * @param {string} postId Post ID
 * @param {string} subreddit Subreddit name
 * @param {string} title Post title
 * @param {number} commentCount Initial comment count
 */
async function addPostToTracking(postId, subreddit, title, commentCount) {
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
      [postId, subreddit, title, commentCount, '30m', checkUntil]
    );

    console.log(`Added/updated post ${postId} in comment tracking table`);
  } catch (error) {
    console.error(`Error adding post ${postId} to tracking:`, error);
  }
}

/**
 * Convert data to RedditContent format for DataEntity storage
 * @param {object} item Post or comment data
 * @param {string} type Type of content ('post' or 'comment')
 * @returns {object} RedditContent object
 */
function convertToRedditContent(item, type) {
  const isPost = type === 'post';
  
  // Convert according to RedditContent interface in src/models/RedditContent.ts
  const redditContent = {
    id: item.id,
    url: `https://www.reddit.com${item.permalink}`,
    username: item.author,
    community: `r/${item.subreddit}`,
    body: isPost ? (item.selftext || '') : (item.body || ''),
    created_at: new Date(item.created_utc * 1000),
    data_type: isPost ? 'post' : 'comment'  // RedditDataType enum
  };
  
  // Add post-specific fields
  if (isPost) {
    redditContent.title = item.title;
  } 
  // Add comment-specific fields
  else {
    redditContent.parent_id = item.parent_id;
  }
  
  return redditContent;
}

/**
 * Save item to DataEntity table
 * @param {Array} items Array of posts or comments
 * @param {string} type Type of content ('post' or 'comment')
 */
async function saveToDataEntity(items, type) {
  try {
    console.log(`Saving ${items.length} ${type}s to DataEntity table...`);
    
    // Save directly to dataentity table without going through PostgresMinerStorage
    let savedCount = 0;
    
    // Get a database connection
    const dbClient = await pool.connect();
    
    try {
      // Start a transaction
      await dbClient.query('BEGIN');
      
      for (const item of items) {
        // Convert to proper format
        const isPost = type === 'post';
        
        // Create content object
        const contentObj = {
          id: item.id,
          type: isPost ? 'post' : 'comment',
          url: `https://www.reddit.com${item.permalink}`,
          username: item.author,
          community: `r/${item.subreddit}`,
          body: isPost ? (item.selftext || '') : (item.body || ''),
          created_at: new Date(item.created_utc * 1000),
          score: item.score || 0
        };
        
        // Add type-specific fields
        if (isPost) {
          contentObj.title = item.title;
          contentObj.num_comments = item.num_comments || 0;
          contentObj.upvote_ratio = item.upvote_ratio;
        } else {
          contentObj.parent_id = item.parent_id;
          contentObj.link_id = item.link_id;
        }
        
        // Convert to JSON and then to Buffer for BYTEA
        const contentJSON = JSON.stringify(contentObj);
        const contentBuffer = Buffer.from(contentJSON, 'utf8');
        
        // Calculate timeBucketId (hours since unix epoch)
        const timeBucketId = Math.floor(contentObj.created_at.getTime() / (1000 * 60 * 60));
        
        // Insert directly to dataentity table
        try {
          console.log(`Saving ${type} ${item.id} to dataentity table...`);
          const insertResult = await dbClient.query(
            `INSERT INTO dataentity 
            (uri, datetime, timeBucketId, source, label, content, contentSizeBytes) 
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (uri) DO UPDATE SET
              datetime = $2,
              timeBucketId = $3,
              source = $4,
              label = $5,
              content = $6,
              contentSizeBytes = $7`,
            [
              contentObj.url,
              contentObj.created_at,
              timeBucketId,
              1, // source = 1 for Reddit
              item.subreddit.substring(0, 32), // max length 32 for label
              contentBuffer,
              contentBuffer.length
            ]
          );
          console.log(`Successfully saved ${type} ${item.id} to dataentity table`);
        } catch (itemError) {
          console.error(`Error saving ${type} ${item.id} to dataentity:`, itemError.message);
          // Continue with the next item, don't throw
        }
        
        savedCount++;
      }
      
      // Commit the transaction
      await dbClient.query('COMMIT');
      console.log(`Stored ${savedCount}/${items.length} ${type}s to DataEntity table`);
    } catch (txError) {
      // Rollback if there's an error
      await dbClient.query('ROLLBACK');
      console.error(`Error in transaction while saving ${type}s to DataEntity:`, txError);
    } finally {
      // Release the client back to the pool
      dbClient.release();
    }
  } catch (error) {
    console.error(`Error saving ${type}s to DataEntity:`, error);
  }
}

/**
 * Main function to crawl and save posts and comments
 */
async function crawlSubreddit() {
  console.log(`Starting crawl of r/${SUBREDDIT} for the last ${DAYS_TO_CRAWL} days`);
  console.log(`Date range: ${new Date(after * 1000).toISOString()} to ${new Date(before * 1000).toISOString()}`);

  // Initialize database connection
  const dbInitialized = await initDatabaseConnection();
  if (!dbInitialized) {
    console.error('Failed to initialize database connection. Exiting...');
    process.exit(1);
  }

  // Create output directories
  ensureDirectoryExists(POSTS_DIR);
  ensureDirectoryExists(COMMENTS_DIR);
  
  let allPosts = [];
  
  // Base query parameters
  const params = {
    subreddit: SUBREDDIT,
    after,
    before,
    size: MAX_POSTS_PER_REQUEST,
    sort: 'desc',
  };
  
  try {
    // Initialize a counter for the batch number
    let batchNumber = 1;
    let totalSavedPosts = 0;
    
    // First request
    console.log(`Fetching batch ${batchNumber} of posts...`);
    let posts = await fetchFromPullPush(params);
    
    // Process and save this batch immediately if we have posts
    if (posts.length > 0) {
      // Format posts
      const formattedBatch = posts.map(formatPost);
      
      // Add to overall posts collection
      allPosts = [...allPosts, ...formattedBatch];
      
      // Save this batch to file (with batch number)
      const batchPath = path.join(POSTS_DIR, `${SUBREDDIT}_posts_batch${batchNumber}.json`);
      saveToJson(batchPath, formattedBatch);
      console.log(`Saved batch ${batchNumber} with ${formattedBatch.length} posts to: ${batchPath}`);
      
      // Save batch to DataEntity table
      console.log(`Saving batch ${batchNumber} to database...`);
      await saveToDataEntity(formattedBatch, 'post');
      
      // Add batch posts to tracking table
      console.log(`Adding batch ${batchNumber} posts to tracking table...`);
      for (const post of formattedBatch) {
        await addPostToTracking(post.id, post.subreddit, post.title, post.num_comments);
      }
      
      totalSavedPosts += formattedBatch.length;
      console.log(`Total posts saved so far: ${totalSavedPosts}`);
    }
    
    // If we got the maximum number of posts, we need to paginate
    while (posts.length === MAX_POSTS_PER_REQUEST) {
      await sleep(DELAY_BETWEEN_REQUESTS);
      
      // Increment batch number
      batchNumber++;
      
      // Get the oldest post's created_utc as the new "before"
      const oldestPost = posts.reduce((min, post) => 
        post.created_utc < min.created_utc ? post : min, posts[0]);
      
      params.before = oldestPost.created_utc;
      
      console.log(`Paginating: Getting posts before ${new Date(params.before * 1000).toISOString()}`);
      console.log(`Fetching batch ${batchNumber} of posts...`);
      posts = await fetchFromPullPush(params);
      
      // Filter out duplicates based on post ID
      const newPosts = posts.filter(post => 
        !allPosts.some(existingPost => existingPost.id === post.id)
      );
      
      console.log(`Found ${newPosts.length} new unique posts (${posts.length - newPosts.length} duplicates filtered out)`);
      
      // Process and save this batch immediately if we have new posts
      if (newPosts.length > 0) {
        // Format posts
        const formattedBatch = newPosts.map(formatPost);
        
        // Add to overall posts collection
        allPosts = [...allPosts, ...formattedBatch];
        
        // Save this batch to file (with batch number)
        const batchPath = path.join(POSTS_DIR, `${SUBREDDIT}_posts_batch${batchNumber}.json`);
        saveToJson(batchPath, formattedBatch);
        console.log(`Saved batch ${batchNumber} with ${formattedBatch.length} posts to: ${batchPath}`);
        
        // Save batch to DataEntity table
        console.log(`Saving batch ${batchNumber} to database...`);
        await saveToDataEntity(formattedBatch, 'post');
        
        // Add batch posts to tracking table
        console.log(`Adding batch ${batchNumber} posts to tracking table...`);
        for (const post of formattedBatch) {
          await addPostToTracking(post.id, post.subreddit, post.title, post.num_comments);
        }
        
        totalSavedPosts += formattedBatch.length;
        console.log(`Total posts saved so far: ${totalSavedPosts}`);
      }
      
      // If we didn't get any new posts, break the loop
      if (newPosts.length === 0) {
        break;
      }
    }
    
    // Save all posts as a single consolidated file at the end
    console.log("Creating consolidated post file...");
    const postsPath = path.join(POSTS_DIR, `${SUBREDDIT}_all_posts.json`);
    saveToJson(postsPath, allPosts.map(formatPost));
    console.log(`Saved consolidated file with ${allPosts.length} posts to: ${postsPath}`);
    
    // Fetch comments for each post if needed
    const FETCH_COMMENTS = process.env.CRAWL_COMMENTS === 'true' || false;
    
    if (FETCH_COMMENTS) {
      console.log(`Fetching comments for ${allPosts.length} posts...`);
      
      let allComments = [];
      
      for (let i = 0; i < allPosts.length; i++) {
        const post = allPosts[i];
        console.log(`Processing post ${i+1}/${allPosts.length} (ID: ${post.id})`);
        
        if (post.num_comments > 0) {
          const comments = await fetchCommentsForPost(post.id);
          const formattedComments = comments.map(formatComment);
          allComments = [...allComments, ...formattedComments];
          
          // Save comments to DataEntity table
          await saveToDataEntity(formattedComments, 'comment');
          
          // Save comments for this post
          if (formattedComments.length > 0) {
            const commentsPath = path.join(COMMENTS_DIR, `${post.id}_comments.json`);
            saveToJson(commentsPath, formattedComments);
            
            // Update comment tracking table with new comment count and last comment ID
            if (formattedComments.length > 0) {
              // Find the newest comment (highest ID)
              const newestComment = formattedComments.reduce((max, comment) => 
                comment.id > max.id ? comment : max, formattedComments[0]);
              
              // Update the tracking table
              await pool.query(
                `UPDATE post_comment_tracking SET
                  comment_count = $1,
                  last_comment_id = $2,
                  last_crawled_at = NOW()
                WHERE post_id = $3`,
                [formattedComments.length, newestComment.id, post.id]
              );
            }
          }
          
          // Add delay between posts
          if (i < allPosts.length - 1) {
            await sleep(DELAY_BETWEEN_COMMENT_REQUESTS);
          }
        }
      }
      
      // Save all comments as a single file
      if (allComments.length > 0) {
        const allCommentsPath = path.join(COMMENTS_DIR, `${SUBREDDIT}_all_comments.json`);
        saveToJson(allCommentsPath, allComments);
        console.log(`Saved ${allComments.length} comments to: ${allCommentsPath}`);
      }
    }
    
    console.log(`Done! Collected ${allPosts.length} posts from r/${SUBREDDIT}`);
    
    // Close database connections
    // We don't use postgresStorage in this script
    if (pool) {
      await pool.end();
    }
    
  } catch (error) {
    console.error('Error in main crawl function:', error);
    // Close database connections on error
    // We don't use postgresStorage in this script
    if (pool) {
      await pool.end();
    }
  }
}

// Run the crawler
crawlSubreddit();