/**
 * Script test all proxies from a JSON file by checking IP
 * Usage: node test-proxies-ip.js <proxies.json> [--verbose|-v]
 */

const fs = require('fs');
const axios = require('axios');
const HttpProxyAgent = require('http-proxy-agent');

// URL to test with IP services
const TEST_URLS = [
  'https://api.ipify.org?format=json',  // Returns {"ip":"your.ip.address"}
  'https://ipinfo.io/json',              // Returns detailed IP info
  'https://httpbin.org/ip'               // Returns {"origin":"your.ip.address"}
];
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
console.log('Starting proxy tests with IP verification...');
console.log('='.repeat(80));

// Track results
let working = 0;
let failed = 0;
let pending = proxies.length;
const results = [];

// Get original IP
let originalIP = null;
async function getOriginalIP() {
  try {
    const response = await axios.get('https://api.ipify.org?format=json', { timeout: 10000 });
    originalIP = response.data.ip;
    console.log(`Your original IP: ${originalIP}`);
    console.log('='.repeat(80));
  } catch (error) {
    console.log('Could not determine your original IP:', error.message);
  }
}

// Test a single proxy
async function testProxy(proxy, index) {
  const { host, port, username, password } = proxy;
  const auth = username && password ? `${username}:${password}@` : '';
  const proxyUrl = `http://${auth}${host}:${port}`;

  console.log(`[${index+1}/${proxies.length}] Testing ${host}:${port}...`);
  
  // Always use HttpProxyAgent for both HTTP and HTTPS targets
  const agent = new HttpProxyAgent(proxyUrl);

  const result = {
    proxy: `${host}:${port}`,
    auth: username ? 'Yes' : 'No',
    status: 'Unknown',
    time: 0,
    proxyIP: null,
    error: null,
    details: null
  };

  let successCount = 0;
  for (const testUrl of TEST_URLS) {
    try {
      const config = {
        httpAgent: agent,
        timeout: TIMEOUT,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json',
        },
        validateStatus: () => true
      };

      const startTime = Date.now();
      const response = await axios.get(testUrl, config);
      const duration = Date.now() - startTime;
      
      if (response.status === 200 && response.data) {
        successCount++;
        
        // Extract IP address from response
        let ipAddress = null;
        if (response.data.ip) {
          // ipify or httpbin format
          ipAddress = response.data.ip;
        } else if (response.data.origin) {
          // httpbin format
          ipAddress = response.data.origin;
        }
        
        if (ipAddress) {
          result.proxyIP = ipAddress;
          console.log(`  ✅ Success: ${testUrl} - IP: ${ipAddress} (${duration}ms)`);
          
          // Check if IP is different from original
          if (originalIP && ipAddress === originalIP) {
            console.log(`  ⚠️ Warning: Proxy IP matches your original IP (${ipAddress}), proxy may not be working correctly`);
          }
          
          // Add data to result
          if (!result.details) result.details = {};
          result.details[testUrl] = {
            status: response.status,
            data: response.data,
            time: duration
          };
          
          // Once we have an IP, no need to check other services
          break;
        } else {
          console.log(`  ✅ Success: ${testUrl} - Response received but could not extract IP (${duration}ms)`);
          if (verbose) {
            console.log('Response data:', JSON.stringify(response.data, null, 2));
          }
        }
      } else {
        console.log(`  ❌ Failed: ${testUrl} - HTTP Status: ${response.status}`);
        if (verbose) {
          console.log('Response data:', JSON.stringify(response.data, null, 2));
        }
      }
    } catch (error) {
      console.log(`  ❌ Failed: ${testUrl} - ${error.message}`);
      if (verbose && error.stack) {
        console.log('Error stack:', error.stack);
      }
    }
  }
  
  // Determine if proxy is working based on successful IP check
  if (result.proxyIP) {
    console.log(`✅ Proxy ${host}:${port} is working with IP: ${result.proxyIP}`);
    result.status = 'Working';
    working++;
  } else {
    console.log(`❌ Proxy ${host}:${port} failed all IP checks`);
    result.status = 'Failed';
    result.error = 'Failed to verify IP address';
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
      .forEach((r, i) => console.log(`  ${i+1}. ${r.proxy} - IP: ${r.proxyIP}`));

    // Save working proxies to a file
    const workingProxies = results.filter(r => r.status === 'Working').map(r => {
      const proxy = proxies.find(p => `${p.host}:${p.port}` === r.proxy);
      if (proxy) {
        return {
          ...proxy,
          proxyIP: r.proxyIP
        };
      }
      return null;
    }).filter(Boolean);
    
    if (workingProxies.length > 0) {
      const workingFile = 'working-proxies.json';
      fs.writeFileSync(workingFile, JSON.stringify(workingProxies, null, 2));
      console.log(`\nWorking proxies saved to ${workingFile}`);
    }
  }
  
  if (failed > 0) {
    console.log('\nFailed Proxies:');
    results.filter(r => r.status === 'Failed')
      .forEach((r, i) => console.log(`  ${i+1}. ${r.proxy} - ${r.error || 'Unknown error'}`));
  }
  
  // Save results to file
  const resultsFile = `proxy-ip-test-results-${new Date().toISOString().replace(/:/g, '-').split('.')[0]}.json`;
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\nDetailed results saved to ${resultsFile}`);
  
  // Generate sample curl command for working proxies
  if (working > 0) {
    const firstWorkingProxy = results.find(r => r.status === 'Working');
    if (firstWorkingProxy) {
      const proxyData = proxies.find(p => `${p.host}:${p.port}` === firstWorkingProxy.proxy);
      if (proxyData) {
        const { host, port, username, password } = proxyData;
        const authParam = username && password ? `-U "${username}:${password}" ` : '';
        const curlCmd = `curl -L ${authParam}-x "${host}:${port}" "https://api.ipify.org?format=json"`;
        console.log('\nTest working proxy IP with curl:');
        console.log(curlCmd);
      }
    }
  }
  
  console.log('='.repeat(80));
}

// Run tests with concurrency
(async () => {
  // First get original IP
  await getOriginalIP();
  
  const concurrency = 3; // Limit concurrency for IP services
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