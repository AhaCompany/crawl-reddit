/**
 * Reddit proxy solution that works exactly like curl
 * This is the recommended implementation for your project
 */
const axios = require('axios');
const tunnel = require('tunnel');

/**
 * Creates a Reddit client with proxy support
 * @param {string} proxyHost - Proxy host
 * @param {string} proxyPort - Proxy port
 * @param {string} proxyUser - Proxy username 
 * @param {string} proxyPass - Proxy password
 * @returns {Object} Reddit client object
 */
function createRedditClient(proxyHost, proxyPort, proxyUser, proxyPass) {
  // Create a tunnel agent for HTTP CONNECT method
  const tunnelingAgent = tunnel.httpsOverHttp({
    proxy: {
      host: proxyHost,
      port: parseInt(proxyPort),
      proxyAuth: `${proxyUser}:${proxyPass}`
    }
  });
  
  return {
    /**
     * Fetch data from Reddit
     * @param {string} url - Reddit URL to fetch
     * @returns {Promise<Object>} Response data
     */
    fetch: async function(url, options = {}) {
      const userAgent = options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:73.0) Gecko/20100101 Firefox/73.0';
      
      const response = await axios({
        method: 'get',
        url: url,
        httpsAgent: tunnelingAgent,
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Cache-Control': 'max-age=0',
          ...options.headers
        },
        maxRedirects: 5,
        timeout: 30000
      });
      
      return response.data;
    }
  };
}

// Example usage
async function example() {
  const redditClient = createRedditClient(
    '43.159.28.126', // host
    '2334',          // port
    'u132f6e3756ae05c4-zone-custom-region-us-session-cBum3AnH0-sessTime-120', // username
    'u132f6e3756ae05c4' // password
  );
  
  try {
    // Fetch a Reddit page
    const data = await redditClient.fetch('https://www.reddit.com/r/programming.json');
    console.log('Fetched data successfully!');
    console.log(`Got ${data.data.children.length} posts`);
    
    // You can also fetch comments
    const commentData = await redditClient.fetch('https://www.reddit.com/r/programming/comments/someid.json');
    
    return data;
  } catch (error) {
    console.error('Error fetching data:', error.message);
  }
}

// How to integrate with your crawler
function integrateWithCrawler() {
  // 1. Install tunnel package
  // npm install tunnel
  
  // 2. Import the createRedditClient function
  // const createRedditClient = require('./reddit-proxy-solution');
  
  // 3. Update your rotatingRedditClient.ts to use tunnel
  // Replace the HttpsProxyAgent with tunnel.httpsOverHttp
  
  // 4. Make requests using the tunneling agent
}

// Only run the example if executed directly
if (require.main === module) {
  example();
}

module.exports = createRedditClient;