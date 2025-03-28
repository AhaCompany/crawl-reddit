/**
 * File test đơn giản để kiểm tra account rotation khi crawl Reddit
 */
import { getRedditClient, getAccountStats, closeRedditClient } from './utils/rotatingRedditClient';

async function testAccountCrawl() {
  try {
    console.log('Bắt đầu kiểm tra account crawl...');
    
    // Lấy thống kê tài khoản trước khi crawl
    console.log('\nThông tin tài khoản hiện có:');
    const accountStatsBefore = await getAccountStats();
    console.log(JSON.stringify(accountStatsBefore, null, 2));
    
    // Lấy client Reddit (sẽ tự động lấy tài khoản từ database)
    console.log('\nĐang lấy Reddit client...');
    const client = await getRedditClient();
    
    // Test lấy thông tin subreddit
    console.log('\nTest 1: Lấy thông tin về subreddit');
    const subredditName = 'programming';
    console.log(`Đang lấy thông tin của r/${subredditName}...`);
    const subreddit = await client.getSubreddit(subredditName).fetch();
    console.log(`Thông tin cơ bản của r/${subredditName}:`);
    console.log(`- Tên hiển thị: ${subreddit.display_name}`);
    console.log(`- Title: ${subreddit.title}`);
    console.log(`- Subscribers: ${subreddit.subscribers}`);
    console.log(`- Description: ${subreddit.public_description.substring(0, 100)}...`);
    
    // Test lấy các bài viết mới nhất
    console.log('\nTest 2: Lấy 5 bài viết mới nhất');
    const newPosts = await client.getSubreddit(subredditName).getNew({limit: 5});
    console.log(`Lấy được ${newPosts.length} bài viết mới từ r/${subredditName}:`);
    
    newPosts.forEach((post, index) => {
      console.log(`\n[${index + 1}] ${post.title}`);
      console.log(`- Author: ${post.author.name}`);
      console.log(`- Created: ${new Date(post.created_utc * 1000).toISOString()}`);
      console.log(`- Score: ${post.score}`);
      console.log(`- URL: ${post.url}`);
    });
    
    // Lấy thống kê tài khoản sau khi crawl
    console.log('\nThông tin tài khoản sau khi crawl:');
    const accountStatsAfter = await getAccountStats();
    console.log(JSON.stringify(accountStatsAfter, null, 2));
    
    console.log('\nKiểm tra account crawl hoàn tất!');
  } catch (error) {
    console.error('Lỗi khi kiểm tra account crawl:', error);
  } finally {
    // Đóng kết nối client
    await closeRedditClient();
  }
}

// Chạy hàm test
testAccountCrawl().catch(console.error);