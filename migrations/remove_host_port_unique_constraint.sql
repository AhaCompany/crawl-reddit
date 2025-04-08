-- Migration to remove the unique constraint on host and port in proxy_servers table
-- This allows duplicate host+port combinations in proxy_servers table

-- Step 1: First check if the unique constraint exists
DO $$
DECLARE
    constraint_exists BOOLEAN;
BEGIN
    SELECT COUNT(*) > 0 INTO constraint_exists
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    JOIN pg_class cl ON cl.oid = c.conrelid
    WHERE cl.relname = 'proxy_servers'
    AND c.contype = 'u' -- unique constraint
    AND c.conkey @> ARRAY[
        (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attname = 'host'),
        (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attname = 'port')
    ]::smallint[];

    IF constraint_exists THEN
        -- Step 2: Drop the existing constraint
        EXECUTE 'ALTER TABLE proxy_servers DROP CONSTRAINT IF EXISTS proxy_servers_host_port_key';
        RAISE NOTICE 'Removed unique constraint on host and port columns in proxy_servers table';
    ELSE
        RAISE NOTICE 'No unique constraint found on host and port columns in proxy_servers table';
    END IF;
END $$;

-- Step 3: Create a new index for better query performance (without the uniqueness)
CREATE INDEX IF NOT EXISTS idx_proxy_servers_host_port ON proxy_servers(host, port);

-- Step 4: Add a note in the table to mark the migration
DO $$
BEGIN
    -- Create migration_notes table if it doesn't exist
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'migration_notes') THEN
        CREATE TABLE migration_notes (
            id SERIAL PRIMARY KEY,
            migration_name VARCHAR(255) NOT NULL,
            applied_at TIMESTAMP DEFAULT NOW(),
            note TEXT
        );
    END IF;
    
    -- Insert a note about this migration
    INSERT INTO migration_notes (migration_name, note)
    VALUES (
        'remove_host_port_unique_constraint',
        'Removed unique constraint on host and port columns in proxy_servers table to allow duplicate entries.'
    );
END $$;

-- Step 5: Update proxy management logic in application code to check for duplicates if needed
-- Note: This is a comment for the developer and doesn't execute anything