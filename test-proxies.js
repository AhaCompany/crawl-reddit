/**
 * Script test all proxies from a JSON file
 * Usage: node test-proxies.js <proxies.json>
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const HttpsProxyAgent = require('https-proxy-agent');
const HttpProxyAgent = require('http-proxy-agent');

// URL to test with
const TEST_URL = 'https://www.reddit.com/r/programming.json';
const TIMEOUT = 30000; // 30 seconds timeout

// Parse command line arguments
const args = process.argv.slice(2);
const proxyFilePath = args[0] || 'proxies.json';
const verbose = args.includes('--verbose') || args.includes('-v');

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

// Test a single proxy
async function testProxy(proxy, index) {
  const { host, port, protocol, username, password } = proxy;
  const proxyProtocol = protocol || 'http';
  const auth = username && password ? `${username}:${password}@` : '';
  const proxyUrl = `${proxyProtocol}://${auth}${host}:${port}`;

  console.log(`[${index+1}/${proxies.length}] Testing ${host}:${port} (${proxyProtocol})...`);
  
  // Create proxy agent
  const agent = proxyProtocol === 'https' 
    ? new HttpsProxyAgent(proxyUrl)
    : new HttpProxyAgent(proxyUrl);

  const result = {
    proxy: `${host}:${port}`,
    protocol: proxyProtocol,
    auth: username ? 'Yes' : 'No',
    status: 'Unknown',
    time: 0,
    error: null,
    details: null
  };

  try {
    // Make a test request
    const startTime = Date.now();
    const response = await axios.get(TEST_URL, {
      httpAgent: proxyProtocol === 'http' ? agent : undefined,
      httpsAgent: proxyProtocol === 'https' ? agent : undefined,
      timeout: TIMEOUT,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      validateStatus: () => true  // Accept any status code
    });
    
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
      .forEach((r, i) => console.log(`  ${i+1}. ${r.proxy} (${r.protocol}) - ${r.time}ms`));
  }
  
  if (failed > 0) {
    console.log('\nFailed Proxies:');
    results.filter(r => r.status === 'Failed')
      .forEach((r, i) => console.log(`  ${i+1}. ${r.proxy} (${r.protocol}) - ${r.error}`));
  }
  
  // Save results to file
  const resultsFile = `proxy-test-results-${new Date().toISOString().replace(/:/g, '-').split('.')[0]}.json`;
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\nDetailed results saved to ${resultsFile}`);
  
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