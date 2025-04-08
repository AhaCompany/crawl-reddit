/**
 * Script to test a specific proxy with Reddit userless oauth authentication
 * This test is the most similar to what the actual crawler does
 * 
 * Usage: node test-reddit-proxy.js <host> <port> <username> <password>
 */

const axios = require('axios');
const HttpProxyAgent = require('http-proxy-agent');

// Parse command line arguments
const args = process.argv.slice(2);
const proxyHost = args[0];
const proxyPort = args[1];
const proxyUsername = args[2];
const proxyPassword = args[3];

if (!proxyHost || !proxyPort) {
  console.error('Usage: node test-reddit-proxy.js <host> <port> [username] [password]');
  process.exit(1);
}

// Format proxy URL
const auth = proxyUsername && proxyPassword ? `${proxyUsername}:${proxyPassword}@` : '';
const proxyUrl = `http://${auth}${proxyHost}:${proxyPort}`;
console.log(`Testing proxy: ${proxyHost}:${proxyPort}`);

// Create HTTP proxy agent
const httpAgent = new HttpProxyAgent(proxyUrl);

async function testRedditAPI() {
  try {
    console.log('Step 1: Getting IP address through proxy...');
    try {
      const ipResponse = await axios.get('https://api.ipify.org?format=json', {
        httpAgent,
        timeout: 20000
      });
      
      console.log(`✅ Success! Your IP through proxy: ${ipResponse.data.ip}`);
    } catch (error) {
      console.log(`❌ Failed to get IP through proxy: ${error.message}`);
      if (error.response) {
        console.log(`  Status: ${error.response.status}`);
        console.log(`  Data: ${JSON.stringify(error.response.data)}`);
      }
    }

    console.log('\nStep 2: Trying Reddit public API...');
    try {
      // Test 1: Try to access public Reddit JSON API (like the crawler does)
      const redditResponse = await axios.get('https://www.reddit.com/r/programming.json', {
        httpAgent,
        timeout: 20000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      if (redditResponse.status === 200) {
        console.log('✅ Success! Reddit public API returned 200 OK');
        console.log(`  Posts returned: ${redditResponse.data.data.children.length}`);
        console.log(`  First post title: "${redditResponse.data.data.children[0]?.data?.title || 'Unknown'}"`);
      } else {
        console.log(`❌ Reddit returned non-200 status: ${redditResponse.status}`);
      }
    } catch (error) {
      console.log(`❌ Failed to access Reddit public API: ${error.message}`);
      if (error.response) {
        console.log(`  Status: ${error.response.status}`);
        console.log(`  Data: ${JSON.stringify(error.response.data)}`);
      }
    }

    console.log('\nStep 3: Testing Reddit OAuth...');
    
    // Create a unique user agent
    const userAgent = 'ProxyTest/1.0';
    
    // Using a generic client id from a Reddit script app (or use your own)
    // This is just for test - replace with your client ID for real test
    const clientId = 'YOUR_CLIENT_ID';
    const clientSecret = 'YOUR_CLIENT_SECRET';
    
    try {
      // Get user-less OAuth token (Application Only OAuth)
      const tokenResponse = await axios.post(
        'https://www.reddit.com/api/v1/access_token',
        'grant_type=client_credentials',
        {
          auth: {
            username: clientId,
            password: clientSecret
          },
          headers: {
            'User-Agent': userAgent,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          httpAgent,
          timeout: 20000
        }
      );
      
      if (tokenResponse.status === 200 && tokenResponse.data.access_token) {
        console.log('✅ Success! Got OAuth token from Reddit');
        
        // Use the token to make an authenticated request
        const token = tokenResponse.data.access_token;
        const apiResponse = await axios.get(
          'https://oauth.reddit.com/r/programming/hot?limit=5',
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'User-Agent': userAgent
            },
            httpAgent,
            timeout: 20000
          }
        );
        
        if (apiResponse.status === 200) {
          console.log('✅ Success! Authenticated Reddit API call worked');
          console.log(`  Posts returned: ${apiResponse.data.data.children.length}`);
        } else {
          console.log(`❌ Authenticated API call failed with status: ${apiResponse.status}`);
        }
      } else {
        console.log(`❌ Failed to get OAuth token: ${JSON.stringify(tokenResponse.data)}`);
      }
    } catch (error) {
      console.log(`❌ OAuth authentication failed: ${error.message}`);
      if (error.response) {
        console.log(`  Status: ${error.response.status}`);
        console.log(`  Data: ${JSON.stringify(error.response.data)}`);
      }
    }
    
    console.log('\n📋 Proxy Test Summary:');
    console.log('=====================');
    console.log('If Step 1 (IP check) succeeded but Steps 2-3 failed, Reddit is likely blocking the proxy IP.');
    console.log('If all steps failed, the proxy itself may not be working correctly.');
    console.log('\nTip: Try using this proxy with rotating residential proxies or ensure your proxy IP is not on a blocklist.');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testRedditAPI();