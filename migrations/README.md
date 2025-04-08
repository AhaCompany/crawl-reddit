# Database Migrations

This directory contains SQL migrations for the Reddit crawler database.

## Available Migrations

1. `add_pagination_columns.sql` - Adds pagination support columns
2. `add_proxy_servers.sql` - Adds proxy server related columns
3. `add_time_range_columns.sql` - Adds time range columns
4. `create_proxy_servers_table.sql` - Creates the proxy_servers table
5. `remove_host_port_unique_constraint.sql` - **NEW** - Removes unique constraint on host+port in proxy_servers table

## Running the Remove Host+Port Unique Constraint Migration

This migration allows you to have multiple entries with the same host and port in the proxy_servers table. This is useful when you need to use the same proxy with different authentication credentials.

### How to Run

```bash
# Run the migration
npm run migrate-proxy-constraints
```

### What the Migration Does

1. Removes the unique constraint on host+port combination in the proxy_servers table
2. Creates a non-unique index on host+port for better query performance
3. Updates the addProxy method in ProxyManager to handle duplicate hosts and ports
4. Creates a note in migration_notes table to track the migration

### After Running the Migration

After running this migration:

1. You'll be able to add multiple proxies with the same host and port but different usernames/passwords
2. The ProxyManager.addProxy method will:
   - Update an existing proxy if host, port, username, and password match
   - Insert a new proxy if any of these differ

### Verifying the Migration

The migration script will:
1. Check if the constraint was successfully removed
2. Try to insert a duplicate proxy entry to verify it works
3. Log the results

If you see "Successfully inserted duplicate proxy" in the logs, the migration was successful.

## Reverting the Migration

If you need to revert this migration and restore the unique constraint:

```sql
-- Run this SQL manually to restore the unique constraint
ALTER TABLE proxy_servers ADD CONSTRAINT proxy_servers_host_port_key UNIQUE(host, port);
```