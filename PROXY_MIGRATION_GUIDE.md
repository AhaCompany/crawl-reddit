# Proxy Migration Guide

This guide explains how to use the new proxy migration to support multiple proxy entries with the same host and port but different authentication credentials.

## Step 1: Run the migration

First, you need to run the migration that removes the unique constraint on host and port in the proxy_servers table:

```bash
npm run migrate-proxy-constraints
```

This will:
1. Remove the unique constraint on the host and port columns
2. Create a non-unique index on these columns for better query performance
3. Test that duplicate entries can be inserted

## Step 2: Import proxies with duplicate host+port

Now you can import proxies with the same host and port but different usernames and passwords:

```bash
# Using the example file
npm run import-proxies proxies-duplicates-example.json

# Or using your own file
npm run import-proxies path/to/your/proxies.json
```

## Example proxies file

We've provided an example file `proxies-duplicates-example.json` that demonstrates how to structure your proxy file with duplicate host+port values:

```json
[
  {
    "host": "43.159.28.126",
    "port": 2334,
    "protocol": "http",
    "username": "user1",
    "password": "pass1",
    "country": "US"
  },
  {
    "host": "43.159.28.126",
    "port": 2334,
    "protocol": "http",
    "username": "user2",
    "password": "pass2",
    "country": "US"
  },
  {
    "host": "43.159.28.126",
    "port": 2334,
    "protocol": "http",
    "username": "user3",
    "password": "pass3",
    "country": "US"
  }
]
```

## How it works

The proxy manager has been updated to:

1. Check if a proxy with the same host, port, username, and password already exists
2. If it exists, update its protocol, country, and is_disabled status
3. If it doesn't exist, insert a new proxy record

This allows you to:
- Use the same proxy server with different authentication credentials
- Rotate between different credentials for the same proxy server
- Increase the number of available proxies without adding new servers

## Verifying proxies in the database

You can check the proxies in the database with:

```bash
npm run proxy
```

This will show you all proxies, including those with duplicate host+port values.

## Using proxies with the crawler

No changes are needed to use the crawler with duplicate proxies. The proxy manager will automatically rotate through all available proxies, including those with duplicate host+port values.