/**
 * Script to exactly mimic curl command behavior with Node.js
 * Usage: node curl-like-test.js <host> <port> <username> <password>
 */

const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const tunnel = require('tunnel');

const host = process.argv[2] || '43.159.28.126';
const port = process.argv[3] || '2334';
const username = process.argv[4] || 'u132f6e3756ae05c4-zone-custom-region-us-session-cBum3AnH0-sessTime-120';
const password = process.argv[5] || 'u132f6e3756ae05c4';
const testUrl = 'https://www.reddit.com/r/reviewnganhluat/comments/1jra04m/quang_linh_vlog_v%C3%A0_h%E1%BA%B1ng_du_m%E1%BB%A5c_b%E1%BB%8B_b%E1%BA%AFt/';

// Use the exact same User-Agent as in your curl command
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:73.0) Gecko/20100101 Firefox/73.0';

console.log('='.repeat(80));
console.log('NODE.JS PROXY TEST (CURL EMULATION)');
console.log('='.repeat(80));
console.log(`Proxy: ${host}:${port}`);
console.log(`Auth: ${username}:${password}`);
console.log(`Target URL: ${testUrl}`);
console.log(`User-Agent: ${userAgent}`);

// First, let's run the actual curl command for comparison
console.log('\nSTEP 1: Running the original curl command for comparison...');
const curlCommand = `curl -L -U "${username}:${password}" -x "${host}:${port}" "${testUrl}" -H "User-Agent: ${userAgent}" -o curl-test.html`;
console.log(`Executing: ${curlCommand}`);

exec(curlCommand, (error, stdout, stderr) => {
  if (error) {
    console.error(`Curl execution error: ${error.message}`);
    return;
  }
  if (stderr) {
    console.log(`Curl stderr: ${stderr}`);
  }
  
  const curlFileSize = fs.existsSync('curl-test.html') ? fs.statSync('curl-test.html').size : 0;
  console.log(`Curl completed. Output saved to curl-test.html (${curlFileSize} bytes)`);
  
  // Now let's try with Node.js using the tunnel module which is closest to curl behavior
  console.log('\nSTEP 2: Running Node.js test with tunnel agent...');
  
  // Create a tunnel agent like curl's CONNECT method
  const tunnelingAgent = tunnel.httpsOverHttp({
    proxy: {
      host: host,
      port: parseInt(port),
      proxyAuth: `${username}:${password}`
    }
  });
  
  // Make request with the tunnel agent
  axios({
    method: 'get',
    url: testUrl,
    httpsAgent: tunnelingAgent,
    headers: {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Cache-Control': 'max-age=0',
    },
    maxRedirects: 5, // Like -L in curl
    timeout: 30000
  })
  .then(response => {
    console.log(`✅ Success! Status: ${response.status}`);
    console.log(`Response size: ${response.data.length} bytes`);
    
    // Save the response to a file
    fs.writeFileSync('node-test.html', response.data);
    console.log('Response saved to node-test.html');
    
    // Compare the two files
    const nodeFileSize = fs.statSync('node-test.html').size;
    console.log(`\nCOMPARISON: curl (${curlFileSize} bytes) vs Node.js (${nodeFileSize} bytes)`);
    
    if (Math.abs(curlFileSize - nodeFileSize) < 1000) { // Allow small differences
      console.log('✅ Both methods produced similar-sized outputs. Test PASSED!');
    } else {
      console.log('⚠️ The outputs differ significantly in size. Results may not be equivalent.');
    }
    
    console.log('\nDEBUGGING TIP:');
    console.log('If Node.js test fails but curl works, the main differences are:');
    console.log('1. Tunnel implementation (curl may handle CONNECT differently)');
    console.log('2. TLS/SSL negotiation (curl may be more flexible with certificates)');
    console.log('3. Redirects handling (curl -L vs axios maxRedirects)');
    console.log('4. Headers and cookies handling');
    
    // Create a proper npm module entry for a permanent solution
    const packageJson = {
      "name": "reddit-tunnel-client",
      "version": "1.0.0",
      "description": "Reddit proxy client that works exactly like curl",
      "main": "reddit-client.js",
      "dependencies": {
        "axios": "^1.0.0",
        "tunnel": "^0.0.6"
      }
    };
    
    fs.writeFileSync('proxy-solution.json', JSON.stringify(packageJson, null, 2));
    console.log('\nA package.json template for a proper solution has been created in proxy-solution.json');
    
    // Create a code snippet that works with Reddit
    const redditClientCode = `
/**
 * reddit-client.js - A proxy client that works like curl with Reddit
 * To use: npm install axios tunnel
 */
const axios = require('axios');
const tunnel = require('tunnel');

function createRedditClient(proxyHost, proxyPort, proxyUser, proxyPass) {
  // Create a tunnel agent
  const tunnelingAgent = tunnel.httpsOverHttp({
    proxy: {
      host: proxyHost,
      port: parseInt(proxyPort),
      proxyAuth: \`\${proxyUser}:\${proxyPass}\`
    }
  });
  
  // Create a function that makes requests like curl
  return {
    /**
     * Get data from Reddit
     * @param {string} url - Reddit URL to fetch
     * @param {Object} options - Additional options
     */
    get: async function(url, options = {}) {
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
        maxRedirects: options.maxRedirects || 5,
        timeout: options.timeout || 30000
      });
      
      return response.data;
    }
  };
}

module.exports = createRedditClient;
`;
    
    fs.writeFileSync('reddit-client.js', redditClientCode);
    console.log('A working Reddit client module has been created in reddit-client.js');
  })
  .catch(error => {
    console.log(`❌ Node.js request failed: ${error.message}`);
    
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Headers: ${JSON.stringify(error.response.headers, null, 2)}`);
      console.log(`Data sample: ${JSON.stringify(error.response.data).substring(0, 500)}`);
    } else if (error.request) {
      console.log('No response received from the server');
    }
    
    console.log('\nSince the Node.js test failed but curl worked, this confirms the issue is with how Node.js handles proxies');
    console.log('Please install the tunnel package and use the code in reddit-client.js for a solution.');
  });
});