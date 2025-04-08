/**
 * Script to run the migration that removes host+port unique constraint
 * from proxy_servers table
 */
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { config } from '../config/config';

async function runMigration() {
  // Create a connection pool to PostgreSQL
  const pool = new Pool({
    host: config.postgresql.host,
    port: config.postgresql.port,
    database: config.postgresql.database,
    user: config.postgresql.user,
    password: config.postgresql.password,
  });

  try {
    console.log('Starting migration to remove host+port unique constraint from proxy_servers table...');

    // Read the migration SQL file
    const migrationFilePath = path.join(process.cwd(), 'migrations', 'remove_host_port_unique_constraint.sql');
    const migrationSql = fs.readFileSync(migrationFilePath, 'utf8');

    // Execute the migration SQL
    await pool.query(migrationSql);

    console.log('Migration completed successfully!');
    
    // Verify the constraint was removed
    const result = await pool.query(`
      SELECT COUNT(*) 
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      JOIN pg_class cl ON cl.oid = c.conrelid
      WHERE cl.relname = 'proxy_servers'
      AND c.contype = 'u' -- unique constraint
      AND c.conkey @> ARRAY[
          (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attname = 'host'),
          (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attname = 'port')
      ]::smallint[];
    `);

    if (parseInt(result.rows[0].count) === 0) {
      console.log('Verified: Unique constraint has been successfully removed.');
    } else {
      console.warn('Warning: Unique constraint may still exist. Please check manually.');
    }

    // Test inserting a duplicate entry to verify it works
    console.log('Testing if duplicate entries are now allowed...');
    
    // First, get an existing proxy if any
    const existingProxies = await pool.query('SELECT host, port FROM proxy_servers LIMIT 1');
    
    if (existingProxies.rows.length > 0) {
      const proxy = existingProxies.rows[0];
      
      // Try to insert a duplicate
      try {
        await pool.query(`
          INSERT INTO proxy_servers 
          (host, port, protocol, username, password, country) 
          VALUES ($1, $2, 'http', 'test_user', 'test_pass', 'test_country')
        `, [proxy.host, proxy.port]);
        
        console.log(`Successfully inserted duplicate proxy with host=${proxy.host}, port=${proxy.port}`);
      } catch (error) {
        console.error('Failed to insert duplicate proxy:', error instanceof Error ? error.message : String(error));
      }
    } else {
      console.log('No existing proxies found to test duplicate insertion.');
    }

  } catch (error) {
    console.error('Error running migration:', error instanceof Error ? error.message : String(error));
  } finally {
    // Close the database connection
    await pool.end();
    console.log('Database connection closed');
  }
}

// Run the migration when this script is executed directly
if (require.main === module) {
  runMigration().catch(console.error);
}

export default runMigration;