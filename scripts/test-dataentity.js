/**
 * Direct test script for saving to dataentity table
 */
const { Pool } = require('pg');
require('dotenv').config();
const path = require('path');
const fs = require('fs');

// Create test folder
const TEST_DIR = path.join(__dirname, '../data/dataentity-test');
if (!fs.existsSync(TEST_DIR)) {
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

async function main() {
  console.log('Testing direct insert to dataentity table...');
  
  // Initialize PostgreSQL connection
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    database: process.env.PG_DATABASE || 'reddit_data',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
  });
  
  try {
    // Check if table exists
    const tableCheckResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'dataentity'
      );
    `);
    
    const tableExists = tableCheckResult.rows[0].exists;
    console.log(`dataentity table exists: ${tableExists}`);
    
    if (!tableExists) {
      console.log('Creating dataentity table...');
      await pool.query(`
        CREATE TABLE dataentity (
          uri                 TEXT            PRIMARY KEY,
          datetime            TIMESTAMP(6)    NOT NULL,
          timeBucketId        INTEGER         NOT NULL,
          source              INTEGER         NOT NULL,
          label               CHAR(32),
          content             BYTEA           NOT NULL,
          contentSizeBytes    INTEGER         NOT NULL
        )
      `);
      console.log('dataentity table created');
    }
    
    // Create sample content
    console.log('Creating sample content...');
    const now = new Date();
    const testId = 'test-' + Math.floor(Math.random() * 1000000);
    
    const sampleData = {
      id: testId,
      type: 'post',
      url: `https://www.reddit.com/r/test/comments/${testId}/test_post/`,
      username: 'test_user',
      community: 'r/test',
      body: 'This is a test post body',
      created_at: now,
      title: 'Test Post Title'
    };
    
    // Convert to JSON and then to Buffer for BYTEA
    const contentJSON = JSON.stringify(sampleData);
    const contentBuffer = Buffer.from(contentJSON, 'utf8');
    
    // Calculate timeBucketId (hours since unix epoch)
    const timeBucketId = Math.floor(now.getTime() / (1000 * 60 * 60));
    
    // Save sample file for reference
    fs.writeFileSync(path.join(TEST_DIR, 'sample_data.json'), contentJSON);
    
    // Insert directly to dataentity table
    console.log('Inserting into dataentity table...');
    const insertResult = await pool.query(
      `INSERT INTO dataentity 
      (uri, datetime, timeBucketId, source, label, content, contentSizeBytes) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (uri) DO UPDATE SET
        datetime = $2,
        timeBucketId = $3,
        source = $4,
        label = $5,
        content = $6,
        contentSizeBytes = $7
      RETURNING uri`,
      [
        sampleData.url,
        now,
        timeBucketId,
        1, // source = 1 for Reddit
        'test', // label (normalized community name)
        contentBuffer,
        contentBuffer.length
      ]
    );
    
    if (insertResult.rows.length > 0) {
      console.log(`Successfully inserted record with URI: ${insertResult.rows[0].uri}`);
    } else {
      console.log('Insert did not return a URI');
    }
    
    // Verify the data was inserted
    console.log('Verifying insertion...');
    const verifyResult = await pool.query(
      `SELECT uri, datetime, timeBucketId, source, label, contentSizeBytes FROM dataentity WHERE uri = $1`,
      [sampleData.url]
    );
    
    if (verifyResult.rows.length > 0) {
      console.log('Record found in dataentity table:');
      console.log(verifyResult.rows[0]);
      
      // Try to read the content as well
      const contentResult = await pool.query(
        `SELECT content FROM dataentity WHERE uri = $1`,
        [sampleData.url]
      );
      
      if (contentResult.rows.length > 0) {
        const content = contentResult.rows[0].content;
        const contentString = content.toString('utf8');
        console.log('Content successfully retrieved:');
        console.log(contentString);
        
        // Save to file for inspection
        fs.writeFileSync(path.join(TEST_DIR, 'retrieved_content.json'), contentString);
      }
    } else {
      console.log('No record found in dataentity table!');
    }
    
    // Count total records in dataentity
    const countResult = await pool.query('SELECT COUNT(*) FROM dataentity');
    console.log(`Total records in dataentity table: ${countResult.rows[0].count}`);
  } catch (error) {
    console.error('Error in test script:', error);
  } finally {
    await pool.end();
    console.log('Test complete');
  }
}

// Run the test
main();