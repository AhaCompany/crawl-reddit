/**
 * Minimal version of pullpush-db.js for testing
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();

// Configuration
const SUBREDDIT = 'programming'; // Small, technical subreddit
const POSTS_TO_FETCH = 5; // Just a few posts for testing
const OUTPUT_DIR = path.join(__dirname, '../data/minimal-pullpush-test');
const POSTS_DIR = path.join(OUTPUT_DIR, SUBREDDIT, 'posts');

// Create directories
if (!fs.existsSync(POSTS_DIR)) {
  fs.mkdirSync(POSTS_DIR, { recursive: true });
}

// Initialize PostgreSQL connection
let pool = null;

/**
 * Initialize database connection
 */
async function initDatabaseConnection() {
  try {
    // Initialize PostgreSQL connection pool
    pool = new Pool({
      host: process.env.PG_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || '5432', 10),
      database: process.env.PG_DATABASE || 'reddit_data',
      user: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASSWORD || '',
    });
    
    console.log('Connected to PostgreSQL database');
    
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
    
    return true;
  } catch (error) {
    console.error('Database connection error:', error);
    return false;
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
 * Save posts to DataEntity table
 * @param {Array} items Array of posts
 * @param {string} type Type of content (should be 'post')
 */
async function saveToDataEntity(items, type) {
  if (!items || items.length === 0) {
    console.log('No items to save to dataentity');
    return;
  }
  
  try {
    console.log(`Saving ${items.length} ${type}s to DataEntity table...`);
    
    // Save directly to dataentity table
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
          savedCount++;
        } catch (itemError) {
          console.error(`Error saving ${type} ${item.id} to dataentity:`, itemError.message);
          // Continue with the next item, don't throw
        }
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
 * Main function
 */
async function main() {
  console.log(`Starting minimal PullPush test for r/${SUBREDDIT}...`);
  
  // Initialize database connection
  const dbInitialized = await initDatabaseConnection();
  if (!dbInitialized) {
    console.error('Failed to initialize database connection. Exiting...');
    process.exit(1);
  }
  
  try {
    // Fetch posts from PullPush API
    console.log(`Fetching ${POSTS_TO_FETCH} posts from PullPush API...`);
    const url = 'https://api.pullpush.io/reddit/search/submission/';
    const response = await axios.get(url, { 
      params: {
        subreddit: SUBREDDIT,
        size: POSTS_TO_FETCH,
        sort: 'desc'
      },
      headers: {
        'User-Agent': `Reddit-Historical-Data-Crawler/1.0`
      }
    });
    
    if (!response.data || !Array.isArray(response.data.data) || response.data.data.length === 0) {
      console.error('Failed to get posts from PullPush API');
      return;
    }
    
    const posts = response.data.data;
    console.log(`Got ${posts.length} posts from PullPush API`);
    
    // Format posts
    const formattedPosts = posts.map(formatPost);
    
    // Save all posts as a single file
    const postsPath = path.join(POSTS_DIR, `${SUBREDDIT}_posts.json`);
    fs.writeFileSync(postsPath, JSON.stringify(formattedPosts, null, 2));
    console.log(`Saved ${formattedPosts.length} posts to: ${postsPath}`);
    
    // Save posts to DataEntity table
    await saveToDataEntity(formattedPosts, 'post');
    
    // Check database after saving
    const countResult = await pool.query('SELECT COUNT(*) FROM dataentity');
    console.log(`Total records in dataentity table: ${countResult.rows[0].count}`);
    
    // Check records with specific label
    const labelResult = await pool.query(
      `SELECT COUNT(*) FROM dataentity WHERE label = $1`,
      [SUBREDDIT]
    );
    console.log(`Records with label '${SUBREDDIT}': ${labelResult.rows[0].count}`);
    
  } catch (error) {
    console.error('Error in main function:', error);
  } finally {
    // Close database connection
    if (pool) {
      await pool.end();
    }
    console.log('Test complete');
  }
}

// Run the script
main();