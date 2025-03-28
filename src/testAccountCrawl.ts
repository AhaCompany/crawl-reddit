/**
 * File test đơn giản để kiểm tra account rotation khi crawl Reddit
 */
import { getAccountStats, closeRedditClient, executeRedditRequest } from './utils/rotatingRedditClient';

// Interface định nghĩa thông tin subreddit đơn giản
interface SubredditInfo {
  display_name: string;
  title: string;
  subscribers: number;
  public_description: string;
}

// Interface định nghĩa thông tin bài post đơn giản
interface PostInfo {
  title: string;
  author: string;
  created_utc: number;
  score: number;
  url: string;
}

async function testAccountCrawl() {
  try {
    console.log('Bắt đầu kiểm tra account crawl...');
    
    // Lấy thống kê tài khoản trước khi crawl
    console.log('\nThông tin tài khoản hiện có:');
    const accountStatsBefore = await getAccountStats();
    console.log(JSON.stringify(accountStatsBefore, null, 2));
    
    // Test lấy thông tin subreddit
    console.log('\nTest 1: Lấy thông tin về subreddit');
    const subredditName = 'programming';
    console.log(`Đang lấy thông tin của r/${subredditName}...`);
    
    // Sử dụng executeRedditRequest để tránh vấn đề circular reference
    const subredditInfo = await executeRedditRequest<SubredditInfo>((client) => {
      // Truy cập subreddit
      const sub = client.getSubreddit(subredditName);
      
      // Sử dụng dạng "raw" promise để tránh circular reference
      return new Promise<SubredditInfo>((resolve) => {
        sub.fetch().then(info => {
          // Chuyển đổi thành object đơn giản để tránh circular reference
          resolve({
            display_name: info.display_name,
            title: info.title,
            subscribers: info.subscribers,
            public_description: info.public_description || ''
          });
        });
      });
    });
    
    console.log(`Thông tin cơ bản của r/${subredditName}:`);
    console.log(`- Tên hiển thị: ${subredditInfo.display_name}`);
    console.log(`- Title: ${subredditInfo.title}`);
    console.log(`- Subscribers: ${subredditInfo.subscribers}`);
    console.log(`- Description: ${subredditInfo.public_description.substring(0, 100)}...`);
    
    // Test lấy các bài viết mới nhất
    console.log('\nTest 2: Lấy 5 bài viết mới nhất');
    
    // Sử dụng executeRedditRequest cho việc lấy bài viết
    const newPosts = await executeRedditRequest<PostInfo[]>((client) => {
      // Truy cập subreddit
      const sub = client.getSubreddit(subredditName);
      
      // Sử dụng dạng "raw" promise để tránh circular reference
      return new Promise<PostInfo[]>((resolve) => {
        sub.getNew({limit: 5}).then(posts => {
          // Chuyển đổi thành mảng các object đơn giản
          const simplePosts = posts.map(post => ({
            title: post.title,
            author: post.author ? post.author.name : '[deleted]',
            created_utc: post.created_utc,
            score: post.score,
            url: post.url
          }));
          resolve(simplePosts);
        });
      });
    });
    
    console.log(`Lấy được ${newPosts.length} bài viết mới từ r/${subredditName}:`);
    
    newPosts.forEach((post: PostInfo, index: number) => {
      console.log(`\n[${index + 1}] ${post.title}`);
      console.log(`- Author: ${post.author}`);
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