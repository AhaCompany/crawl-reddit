/**
 * Test script to save a small batch of data to dataentity table
 */
const { Pool } = require('pg');
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// Create test folder
const TEST_DIR = path.join(__dirname, '../data/batch-dataentity-test');
if (!fs.existsSync(TEST_DIR)) {
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

async function main() {
  console.log('Testing batch insert to dataentity table...');
  
  // Initialize PostgreSQL connection
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    database: process.env.PG_DATABASE || 'reddit_data',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
  });
  
  try {
    // Fetch a few posts from PullPush API for testing
    console.log('Fetching posts from PullPush API...');
    const url = 'https://api.pullpush.io/reddit/search/submission/';
    const response = await axios.get(url, { 
      params: {
        subreddit: 'programming',
        size: 10, // Get 10 posts for testing
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
    
    // Save a reference file for inspection
    fs.writeFileSync(path.join(TEST_DIR, 'sample_posts.json'), JSON.stringify(posts, null, 2));
    
    // Use a transaction to insert the batch
    console.log('Starting transaction to insert posts to dataentity table...');
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      let savedCount = 0;
      
      // Process each post
      for (const post of posts) {
        // Create content object
        const contentObj = {
          id: post.id,
          type: 'post',
          url: `https://www.reddit.com${post.permalink}`,
          username: post.author,
          community: `r/${post.subreddit}`,
          body: post.selftext || '',
          created_at: new Date(post.created_utc * 1000),
          score: post.score || 0,
          title: post.title,
          num_comments: post.num_comments || 0,
          upvote_ratio: post.upvote_ratio
        };
        
        // Convert to JSON and then to Buffer for BYTEA
        const contentJSON = JSON.stringify(contentObj);
        const contentBuffer = Buffer.from(contentJSON, 'utf8');
        
        // Calculate timeBucketId (hours since unix epoch)
        const timeBucketId = Math.floor(contentObj.created_at.getTime() / (1000 * 60 * 60));
        
        console.log(`Saving post ${post.id} to dataentity table...`);
        
        // Insert directly to dataentity table
        const insertResult = await client.query(
          `INSERT INTO dataentity 
          (uri, datetime, timeBucketId, source, label, content, contentSizeBytes) 
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (uri) DO UPDATE SET
            datetime = $2,
            timeBucketId = $3,
            source = $4,
            label = $5,
            content = $6,
            contentSizeBytes = $7
          RETURNING uri`,
          [
            contentObj.url,
            contentObj.created_at,
            timeBucketId,
            1, // source = 1 for Reddit
            post.subreddit.substring(0, 32), // max length 32 for label
            contentBuffer,
            contentBuffer.length
          ]
        );
        
        console.log(`Successfully saved post ${post.id} with URI: ${insertResult.rows[0].uri}`);
        savedCount++;
      }
      
      // Commit the transaction
      await client.query('COMMIT');
      console.log(`Committed transaction. Saved ${savedCount}/${posts.length} posts to dataentity table`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error in transaction:', error);
    } finally {
      client.release();
    }
    
    // Verify the data was inserted
    console.log('Verifying data in dataentity table...');
    const countResult = await pool.query('SELECT COUNT(*) FROM dataentity');
    console.log(`Total records in dataentity table: ${countResult.rows[0].count}`);
    
    // Check records with label 'programming'
    const labelResult = await pool.query(
      `SELECT COUNT(*) FROM dataentity WHERE label = $1`,
      ['programming']
    );
    console.log(`Records with label 'programming': ${labelResult.rows[0].count}`);
    
    // Fetch a sample
    const sampleResult = await pool.query(
      `SELECT uri, datetime, timeBucketId, source, label, contentSizeBytes FROM dataentity 
      WHERE label = $1 LIMIT 5`,
      ['programming']
    );
    
    console.log('Sample records from dataentity:');
    console.log(sampleResult.rows);
    
  } catch (error) {
    console.error('Error in test script:', error);
  } finally {
    await pool.end();
    console.log('Test complete');
  }
}

// Run the test
main();