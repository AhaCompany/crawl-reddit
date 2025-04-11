const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ensureDirectoryExists, saveToJson } = require('../src/utils/fileHelper');

// Configuration
const SUBREDDIT = 'AskReddit'; // Replace with your target subreddit
const DAYS_TO_CRAWL = 2; // Set to 2 days as requested
const MAX_POSTS_PER_REQUEST = 100; // PullPush API limit
const OUTPUT_DIR = path.join(__dirname, '../data/pullpush-test');
const POSTS_DIR = path.join(OUTPUT_DIR, SUBREDDIT, 'posts');
const DELAY_BETWEEN_REQUESTS = 2000; // 2 seconds delay to be respectful to the API

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
 * Make request to PullPush API
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
    num_comments: post.num_comments,
    score: post.score,
    upvote_ratio: post.upvote_ratio,
    pullpush_data: true // Mark as data from pullpush
  };
}

/**
 * Main function to crawl and save posts
 */
async function crawlSubreddit() {
  console.log(`Starting crawl of r/${SUBREDDIT} for the last ${DAYS_TO_CRAWL} days`);
  console.log(`Date range: ${new Date(after * 1000).toISOString()} to ${new Date(before * 1000).toISOString()}`);

  // Create output directories
  ensureDirectoryExists(POSTS_DIR);
  
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
    // First request
    let posts = await fetchFromPullPush(params);
    allPosts = [...allPosts, ...posts];
    
    // If we got the maximum number of posts, we need to paginate using the created_utc
    // of the last post as the new "before" parameter
    while (posts.length === MAX_POSTS_PER_REQUEST) {
      await sleep(DELAY_BETWEEN_REQUESTS);
      
      // Get the oldest post's created_utc as the new "before"
      const oldestPost = posts.reduce((min, post) => 
        post.created_utc < min.created_utc ? post : min, posts[0]);
      
      params.before = oldestPost.created_utc;
      
      console.log(`Paginating: Getting posts before ${new Date(params.before * 1000).toISOString()}`);
      posts = await fetchFromPullPush(params);
      
      // Filter out duplicates based on post ID
      const newPosts = posts.filter(post => 
        !allPosts.some(existingPost => existingPost.id === post.id)
      );
      
      console.log(`Found ${newPosts.length} new unique posts (${posts.length - newPosts.length} duplicates filtered out)`);
      
      allPosts = [...allPosts, ...newPosts];
      
      // If we didn't get any new posts, break the loop
      if (newPosts.length === 0) {
        break;
      }
    }
    
    // Format and save posts
    const formattedPosts = allPosts.map(formatPost);
    
    // Save all posts as a single file
    const outputPath = path.join(POSTS_DIR, `${SUBREDDIT}_posts.json`);
    saveToJson(outputPath, formattedPosts);
    
    console.log(`Done! Collected ${formattedPosts.length} posts from r/${SUBREDDIT}`);
    console.log(`Posts saved to: ${outputPath}`);
    
  } catch (error) {
    console.error('Error in main crawl function:', error);
  }
}

// Run the crawler
crawlSubreddit();