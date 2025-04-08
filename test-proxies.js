/**
 * Script test all proxies from a JSON file - Improved curl-like version
 * Usage: node test-proxies.js <proxies.json> [--verbose|-v]
 */

const fs = require('fs');
const axios = require('axios');
const HttpsProxyAgent = require('https-proxy-agent');
const HttpProxyAgent = require('http-proxy-agent');
const { URL } = require('url');

// URL to test with
const TEST_URL = 'https://www.reddit.com/r/programming.json';
const TIMEOUT = 30000; // 30 seconds timeout

// Parse command line arguments
const args = process.argv.slice(2);
const proxyFilePath = args[0] || 'proxies.json';
const verbose = args.includes('--verbose') || args.includes('-v');

// Choose a realistic User-Agent from a list of common ones
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:73.0) Gecko/20100101 Firefox/73.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Safari/605.1.15",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.131 Safari/537.36",
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:91.0) Gecko/20100101 Firefox/91.0"
];

// Load proxy file
if (!fs.existsSync(proxyFilePath)) {
  console.error(`File not found: ${proxyFilePath}`);
  process.exit(1);
}

const proxyFile = fs.readFileSync(proxyFilePath, 'utf8');
const proxies = JSON.parse(proxyFile);

console.log(`Loaded ${proxies.length} proxies from ${proxyFilePath}`);
console.log('Starting proxy tests...');
console.log('='.repeat(80));

// Track results
let working = 0;
let failed = 0;
let pending = proxies.length;
const results = [];

// Test a single proxy - CURL-like approach
async function testProxy(proxy, index) {
  const { host, port, username, password } = proxy;
  // Always use HTTP protocol for the proxy connection, even for HTTPS targets
  // This is how curl works with -x/--proxy flag
  const targetUrl = new URL(TEST_URL);
  const isHttps = targetUrl.protocol === 'https:';
  
  const auth = username && password ? `${username}:${password}@` : '';
  const proxyUrl = `https://${auth}${host}:${port}`;

  console.log(`[${index+1}/${proxies.length}] Testing ${host}:${port} (https)...`);
  
  // Use HttpsProxyAgent for HTTPS proxy
  const agent = new HttpsProxyAgent(proxyUrl);

  const result = {
    proxy: `${host}:${port}`,
    auth: username ? 'Yes' : 'No',
    status: 'Unknown',
    time: 0,
    error: null,
    details: null
  };

  try {
    // Select a random user agent
    const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    console.log(`Using User-Agent: ${userAgent}`);
    
    // Make a test request
    const startTime = Date.now();
    
    // Setup request config like curl would
    const config = {
      // Use the HTTPS agent for connection to proxy
      httpsAgent: agent,
      // Don't use httpAgent since we're using HTTPS proxy directly
      timeout: TIMEOUT,
      headers: {
        // Use realistic browser headers
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Cache-Control': 'max-age=0',
        'DNT': '1'  // Do Not Track
      },
      validateStatus: () => true  // Accept any status code
    };

    const response = await axios.get(TEST_URL, config);
    
    const duration = Date.now() - startTime;
    result.time = duration;
    
    if (response.status === 200) {
      console.log(`✅ Success: ${host}:${port} (${duration}ms)`);
      result.status = 'Working';
      result.details = {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        dataSize: response.data ? JSON.stringify(response.data).length : 0
      };
      working++;
    } else {
      console.log(`❌ Failed: ${host}:${port} - HTTP Status: ${response.status} ${response.statusText}`);
      result.status = 'Failed';
      result.error = `HTTP Status ${response.status} ${response.statusText}`;
      result.details = {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        responseData: response.data ? (typeof response.data === 'string' ? response.data.substring(0, 500) : JSON.stringify(response.data).substring(0, 500)) : null
      };
      
      if (verbose) {
        console.log('Response Headers:', JSON.stringify(response.headers, null, 2));
        console.log('Response Data Sample:', typeof response.data === 'string' 
          ? response.data.substring(0, 500) 
          : JSON.stringify(response.data).substring(0, 500));
      }
      
      failed++;
    }
  } catch (error) {
    console.log(`❌ Failed: ${host}:${port} - ${error.message}`);
    
    let errorDetails = {
      message: error.message,
      code: error.code,
      errno: error.errno,
      syscall: error.syscall,
      address: error.address,
      port: error.port,
    };
    
    if (error.response) {
      // Server responded with a status code that falls out of the range of 2xx
      errorDetails.status = error.response.status;
      errorDetails.statusText = error.response.statusText;
      errorDetails.headers = error.response.headers;
      errorDetails.data = error.response.data ? 
        (typeof error.response.data === 'string' ? 
          error.response.data.substring(0, 500) : 
          JSON.stringify(error.response.data).substring(0, 500)) : 
        null;
    } else if (error.request) {
      // Request was made but no response was received
      errorDetails.request = 'No response received';
    }
    
    if (verbose) {
      console.log('Error Details:', JSON.stringify(errorDetails, null, 2));
      if (error.stack) {
        console.log('Error Stack:', error.stack);
      }
    }
    
    result.status = 'Failed';
    result.error = error.message;
    result.details = errorDetails;
    
    failed++;
  }
  
  results.push(result);
  pending--;
  
  if (pending === 0) {
    printSummary();
  }
}

// Print summary of results
function printSummary() {
  console.log('='.repeat(80));
  console.log('TEST RESULTS');
  console.log('='.repeat(80));
  console.log(`Total Proxies: ${proxies.length}`);
  console.log(`Working: ${working} (${(working/proxies.length*100).toFixed(2)}%)`);
  console.log(`Failed: ${failed} (${(failed/proxies.length*100).toFixed(2)}%)`);
  
  if (working > 0) {
    console.log('\nWorking Proxies:');
    results.filter(r => r.status === 'Working')
      .sort((a, b) => a.time - b.time)
      .forEach((r, i) => console.log(`  ${i+1}. ${r.proxy} - ${r.time}ms`));

    // Save working proxies to a file
    const workingProxies = results.filter(r => r.status === 'Working').map(r => {
      const proxy = proxies.find(p => `${p.host}:${p.port}` === r.proxy);
      return proxy;
    });
    if (workingProxies.length > 0) {
      const workingFile = 'working-proxies.json';
      fs.writeFileSync(workingFile, JSON.stringify(workingProxies, null, 2));
      console.log(`\nWorking proxies saved to ${workingFile}`);
    }
  }
  
  if (failed > 0) {
    console.log('\nFailed Proxies:');
    results.filter(r => r.status === 'Failed')
      .forEach((r, i) => console.log(`  ${i+1}. ${r.proxy} - ${r.error}`));
  }
  
  // Save results to file
  const resultsFile = `proxy-test-results-${new Date().toISOString().replace(/:/g, '-').split('.')[0]}.json`;
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\nDetailed results saved to ${resultsFile}`);
  
  // Generate curl test command for working proxies
  if (working > 0) {
    const fastestProxy = results.filter(r => r.status === 'Working')
      .sort((a, b) => a.time - b.time)[0];
    
    if (fastestProxy) {
      const proxyData = proxies.find(p => `${p.host}:${p.port}` === fastestProxy.proxy);
      if (proxyData) {
        const { host, port, username, password } = proxyData;
        const userAgent = USER_AGENTS[0]; // Use first user agent for consistency
        const authParam = username && password ? `-U "${username}:${password}" ` : '';
        const curlCmd = `curl -L ${authParam}--proxy-insecure -x "https://${host}:${port}" -A "${userAgent}" "${TEST_URL}"`;
        console.log('\nTest fastest proxy with curl:');
        console.log(curlCmd);
      }
    }
  }
  
  console.log('='.repeat(80));
}

// Run tests with some concurrency control (5 at a time)
(async () => {
  const concurrency = 5;
  const chunks = [];
  
  for (let i = 0; i < proxies.length; i += concurrency) {
    chunks.push(proxies.slice(i, i + concurrency));
  }
  
  for (const chunk of chunks) {
    await Promise.all(chunk.map((proxy, idx) => 
      testProxy(proxy, idx + (chunks.indexOf(chunk) * concurrency))
    ));
  }
})();