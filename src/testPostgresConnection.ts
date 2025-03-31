/**
 * File test đơn giản để kiểm tra kết nối PostgreSQL
 */
import { Pool } from 'pg';
import { config } from './config/config';

async function testPostgresConnection() {
  console.log('===== POSTGRESQL CONNECTION TEST =====');
  console.log(`[INFO] Host: ${config.postgresql.host}`);
  console.log(`[INFO] Port: ${config.postgresql.port}`);
  console.log(`[INFO] Database: ${config.postgresql.database}`);
  console.log(`[INFO] User: ${config.postgresql.user}`);
  console.log('[INFO] Creating connection pool...');
  
  const pool = new Pool({
    host: config.postgresql.host,
    port: config.postgresql.port,
    database: config.postgresql.database,
    user: config.postgresql.user,
    password: config.postgresql.password,
    // Connection timeout - fail quickly if cannot connect
    connectionTimeoutMillis: 5000,
  });
  
  let client;
  try {
    console.log('[INFO] Attempting to connect...');
    client = await pool.connect();
    console.log('[INFO] Successfully connected to PostgreSQL server');
    
    // 1. Test basic query
    try {
      console.log('[INFO] Testing basic query (SELECT NOW())...');
      const result = await client.query('SELECT NOW() as time');
      console.log(`[INFO] Server time: ${result.rows[0].time}`);
    } catch (err) {
      const queryError = err as any;
      console.error('[ERROR] Basic query failed:', queryError);
      throw queryError;
    }
    
    // 2. Test database existence
    try {
      console.log('[INFO] Checking database existence...');
      const dbResult = await client.query(`
        SELECT datname FROM pg_database WHERE datname = $1
      `, [config.postgresql.database]);
      
      if (dbResult.rowCount && dbResult.rowCount > 0) {
        console.log(`[INFO] Database '${config.postgresql.database}' exists`);
      } else {
        console.error(`[ERROR] Database '${config.postgresql.database}' does not exist!`);
      }
    } catch (err) {
      const dbError = err as any;
      console.error('[ERROR] Database check failed:', dbError);
    }
    
    // 3. Test database permissions
    try {
      console.log('[INFO] Testing write permissions...');
      // Create a test table
      await client.query(`
        CREATE TABLE IF NOT EXISTS _connection_test (
          id SERIAL PRIMARY KEY,
          test_time TIMESTAMP DEFAULT NOW()
        )
      `);
      
      // Insert a record
      await client.query(`
        INSERT INTO _connection_test (test_time) VALUES (NOW())
      `);
      
      // Read it back
      const readResult = await client.query(`
        SELECT * FROM _connection_test ORDER BY id DESC LIMIT 1
      `);
      
      console.log(`[INFO] Write test successful. Last record: `, readResult.rows[0]);
      
      // Clean up
      console.log('[INFO] Cleaning up test table...');
      await client.query(`DROP TABLE _connection_test`);
      console.log('[INFO] Test table dropped');
    } catch (err) {
      const permError = err as any;
      console.error('[ERROR] Permission test failed:', permError);
      if (permError.code) {
        console.error(`[ERROR] PostgreSQL error code: ${permError.code}`);
      }
      if (permError.detail) {
        console.error(`[ERROR] PostgreSQL error detail: ${permError.detail}`);
      }
    }
    
    // 4. Test tables existence
    try {
      console.log('[INFO] Checking main tables existence...');
      const tablesResult = await client.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('subreddits', 'posts', 'comments', 'dataentity')
      `);
      
      if (tablesResult.rowCount && tablesResult.rowCount > 0) {
        const tables = tablesResult.rows.map(row => row.table_name).join(', ');
        console.log(`[INFO] Found tables: ${tables}`);
      } else {
        console.log('[WARN] No required tables found. They may need to be created.');
      }
    } catch (err) {
      const tableError = err as any;
      console.error('[ERROR] Table check failed:', tableError);
    }
    
    console.log('[SUCCESS] All PostgreSQL connection tests completed successfully');
  } catch (err) {
    const error = err as any;
    console.error('[ERROR] PostgreSQL connection failed:');
    console.error(error);
    if (error.code) {
      // Common PostgreSQL error codes:
      // ECONNREFUSED: Server not running or wrong host/port
      // ETIMEDOUT: Network route issue or firewall
      // 28P01: Wrong password
      // 28000: Authentication problem
      // 3D000: Database doesn't exist
      // 42501: Permission denied
      console.error(`[ERROR] Error code: ${error.code}`);
      
      switch (error.code) {
        case 'ECONNREFUSED':
          console.error('[HELP] Connection refused. Check if PostgreSQL is running and the host/port are correct.');
          break;
        case 'ETIMEDOUT':
          console.error('[HELP] Connection timed out. Check network connectivity, firewall settings, or pg_hba.conf.');
          break;
        case '28P01':
          console.error('[HELP] Authentication failed. Check your username and password.');
          break;
        case '28000':
          console.error('[HELP] Authentication rejected. Check pg_hba.conf settings.');
          break;
        case '3D000':
          console.error('[HELP] Database does not exist. Create it first.');
          break;
        case '42501':
          console.error('[HELP] Permission denied. Check user privileges.');
          break;
      }
    }
  } finally {
    if (client) {
      client.release();
      console.log('[INFO] Database client released');
    }
    
    try {
      await pool.end();
      console.log('[INFO] Connection pool closed');
    } catch (endError) {
      console.error('[ERROR] Error closing pool:', endError);
    }
  }
}

// Run the test
testPostgresConnection().catch(err => {
  console.error('Test failed with unhandled error:', err);
  process.exit(1);
});