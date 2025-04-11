/**
 * Debug script for pullpush-db.js
 * This script will run pullpush-db.js with a smaller dataset for testing
 */

require('dotenv').config();
const { Pool } = require('pg');

async function checkDatabase() {
  try {
    // Initialize PostgreSQL connection pool
    const pool = new Pool({
      host: process.env.PG_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || '5432', 10),
      database: process.env.PG_DATABASE || 'reddit_data',
      user: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASSWORD || '',
    });
    
    console.log('Connected to PostgreSQL database');
    
    // Check post_comment_tracking table
    const postTrackingResult = await pool.query('SELECT COUNT(*) FROM post_comment_tracking');
    console.log(`post_comment_tracking table contains ${postTrackingResult.rows[0].count} rows`);
    
    // Check a sample from post_comment_tracking
    const sampleTracking = await pool.query('SELECT * FROM post_comment_tracking LIMIT 5');
    console.log('Sample data from post_comment_tracking:');
    console.log(JSON.stringify(sampleTracking.rows, null, 2));
    
    // Check DataEntity table
    try {
      let dataEntityResult;
      
      // Try both capitalization variants
      try {
        dataEntityResult = await pool.query('SELECT COUNT(*) FROM "DataEntity"');
        console.log(`DataEntity table (capitalized) contains ${dataEntityResult.rows[0].count} rows`);
        
        // Check a sample from DataEntity
        const sampleDataEntity = await pool.query('SELECT * FROM "DataEntity" LIMIT 5');
        console.log('Sample data from DataEntity:');
        console.log(JSON.stringify(sampleDataEntity.rows, null, 2));
      } catch (err) {
        console.log('Could not query "DataEntity" table (capitalized):', err.message);
        try {
          dataEntityResult = await pool.query('SELECT COUNT(*) FROM dataentity');
          console.log(`dataentity table (lowercase) contains ${dataEntityResult.rows[0].count} rows`);
          
          // Check a sample from dataentity
          const sampleDataEntity = await pool.query('SELECT * FROM dataentity LIMIT 5');
          console.log('Sample data from dataentity:');
          console.log(JSON.stringify(sampleDataEntity.rows, null, 2));
        } catch (lowerErr) {
          console.log('Could not query "dataentity" table (lowercase):', lowerErr.message);
        }
      }
    } catch (err) {
      console.log('Could not query DataEntity table:', err.message);
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error querying database:', error);
  }
}

// Run the check
checkDatabase().then(() => {
  console.log('Database check complete');
}).catch(err => {
  console.error('Error during database check:', err);
});