/**
 * Test script for the updated proxy implementation with tunnel
 */
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// Import our compiled code
require('./dist/utils/proxy');

async function testProxyImplementation() {
  try {
    // Load proxies from file
    const proxyFilePath = path.join(process.cwd(), 'proxies.json');
    if (!fs.existsSync(proxyFilePath)) {
      console.error('No proxies file found. Please create proxies.json first.');
      return;
    }
    
    const fileContent = fs.readFileSync(proxyFilePath, 'utf8');
    const proxies = JSON.parse(fileContent);
    
    if (!Array.isArray(proxies) || proxies.length === 0) {
      console.error('No valid proxies found in the JSON file');
      return;
    }
    
    // Initialize the proxy manager
    const { getProxyManager, setupHttpAgentsWithProxy } = require('./dist/utils/proxy');
    const proxyManager = getProxyManager();
    await proxyManager.initialize();
    
    // Get a proxy with our new tunnel implementation
    const agents = await setupHttpAgentsWithProxy();
    
    if (!agents) {
      console.error('Failed to set up HTTP agents with proxy');
      return;
    }
    
    // Test the proxy against Reddit API
    console.log('Testing proxy connection to Reddit...');
    
    const response = await axios({
      method: 'get',
      url: 'https://www.reddit.com/r/programming.json',
      httpsAgent: agents.httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:73.0) Gecko/20100101 Firefox/73.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Cache-Control': 'max-age=0'
      },
      maxRedirects: 5,
      timeout: 30000
    });
    
    console.log('Successfully connected to Reddit!');
    console.log(`Got ${response.data.data.children.length} posts from Reddit`);
    
    // Check the first post title
    if (response.data.data.children.length > 0) {
      const firstPost = response.data.data.children[0].data;
      console.log(`First post title: ${firstPost.title}`);
    }
    
    // Check IP through a service
    console.log('\nChecking our IP address through the proxy...');
    const ipResponse = await axios({
      method: 'get',
      url: 'https://api.ipify.org?format=json',
      httpsAgent: agents.httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:73.0) Gecko/20100101 Firefox/73.0'
      }
    });
    
    console.log(`Our IP address through proxy: ${ipResponse.data.ip}`);
    
    console.log('\nTest completed successfully!');
    
  } catch (error) {
    console.error('Error testing proxy implementation:', error.message);
    
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Headers:`, error.response.headers);
      console.error(`Data:`, error.response.data);
    } else if (error.request) {
      console.error('No response received from server');
    }
  } finally {
    // Clean up
    const { getProxyManager } = require('./dist/utils/proxy');
    const proxyManager = getProxyManager();
    await proxyManager.close();
    process.exit(0);
  }
}

// Run the test
testProxyImplementation();