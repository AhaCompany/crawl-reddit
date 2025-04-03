const fs = require('fs');
const path = require('path');
const Snoowrap = require('snoowrap');

// Load account data from reddit_accounts.json
async function loadAccounts() {
  try {
    const accountsPath = path.join(__dirname, 'reddit_accounts.json');
    const accountsData = fs.readFileSync(accountsPath, 'utf8');
    return JSON.parse(accountsData);
  } catch (error) {
    console.error('Error loading accounts:', error);
    return [];
  }
}

// Test a single account
async function testAccount(account) {
  console.log(`Testing account: ${account.username}`);
  
  try {
    // Create a Snoowrap client with the account credentials
    const client = new Snoowrap({
      userAgent: account.userAgent,
      clientId: account.clientId,
      clientSecret: account.clientSecret,
      username: account.username,
      password: account.password
    });
    
    // Set a short timeout to fail fast
    client.config({
      requestTimeout: 10000,
      continueAfterRatelimitError: false
    });
    
    // Make a simple API call to check if credentials are valid
    // Using getMe() is a good test as it requires authentication
    const me = await client.getMe();
    console.log(`✅ Account ${account.username} is VALID. Username: ${me.name}`);
    return { account, valid: true };
  } catch (error) {
    console.error(`❌ Account ${account.username} is INVALID: ${error.message}`);
    return { account, valid: false, error: error.message };
  }
}

// Test all accounts
async function testAllAccounts() {
  const accounts = await loadAccounts();
  
  console.log(`Found ${accounts.length} accounts to test\n`);
  
  const results = {
    valid: [],
    invalid: []
  };
  
  for (const account of accounts) {
    const result = await testAccount(account);
    
    if (result.valid) {
      results.valid.push(account.username);
    } else {
      results.invalid.push({
        username: account.username,
        error: result.error
      });
    }
    
    // Add a small delay between tests to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Print summary
  console.log('\n===== SUMMARY =====');
  console.log(`Valid accounts: ${results.valid.length}`);
  console.log(`Invalid accounts: ${results.invalid.length}`);
  
  if (results.invalid.length > 0) {
    console.log('\nInvalid accounts details:');
    results.invalid.forEach(acc => {
      console.log(`- ${acc.username}: ${acc.error}`);
    });
  }
  
  return results;
}

// Run the test
testAllAccounts().catch(error => {
  console.error('Error testing accounts:', error);
});