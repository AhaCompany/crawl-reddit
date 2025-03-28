import { directCrawlComments } from './utils/direct-comment-crawler';
import { setupHttpAgents } from './utils/rotatingRedditClient';

// Configure HTTP agents to avoid connection issues
// This is now async but we'll make this file work with the old pattern
(async () => {
  try {
    await setupHttpAgents();
  } catch (error) {
    console.error('Error setting up HTTP agents:', error);
  }
})();

async function main() {
  try {
    // Lấy post ID từ tham số dòng lệnh
    const postId = process.argv[2];
    const limit = Number(process.argv[3] || 100);
    
    if (!postId) {
      console.error('ERROR: Post ID is required. Usage: npm run crawl-comments -- <post_id> <limit>');
      process.exit(1);
    }
    
    console.log(`Starting direct comment crawler for post ${postId} (limit: ${limit})`);
    await directCrawlComments(postId, limit);
    console.log('Comment crawling completed successfully!');
    
  } catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch(console.error);