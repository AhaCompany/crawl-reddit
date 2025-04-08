/**
 * Script to import proxies from a JSON file into the database
 * Supports importing proxies with the same host+port but different credentials
 */
import fs from 'fs';
import path from 'path';
import { getProxyManager } from '../utils/proxy';

interface ProxyRecord {
  host: string;
  port: number;
  protocol?: 'http' | 'https' | 'socks';
  username?: string;
  password?: string;
  country?: string;
}

async function importProxies(filePath?: string) {
  try {
    // Default to proxies.json if no file path is provided
    const proxyFilePath = filePath || path.join(process.cwd(), 'proxies.json');
    
    if (!fs.existsSync(proxyFilePath)) {
      console.error(`Proxy file not found: ${proxyFilePath}`);
      console.log('Usage: npm run import-proxies [path/to/proxies.json]');
      return;
    }
    
    console.log(`Importing proxies from: ${proxyFilePath}`);
    
    // Read and parse the JSON file
    const fileContent = fs.readFileSync(proxyFilePath, 'utf8');
    const proxies: ProxyRecord[] = JSON.parse(fileContent);
    
    if (!Array.isArray(proxies)) {
      console.error('Invalid proxy file format. Expected an array of proxy objects.');
      return;
    }
    
    console.log(`Found ${proxies.length} proxies in the file`);
    
    // Initialize the proxy manager
    const proxyManager = getProxyManager();
    await proxyManager.initialize();
    
    // Import each proxy
    let imported = 0;
    let failed = 0;
    
    for (const proxy of proxies) {
      if (!proxy.host || !proxy.port) {
        console.error(`Invalid proxy entry: ${JSON.stringify(proxy)}`);
        failed++;
        continue;
      }
      
      const success = await proxyManager.addProxy(
        proxy.host,
        proxy.port,
        proxy.protocol || 'http',
        proxy.username,
        proxy.password,
        proxy.country
      );
      
      if (success) {
        imported++;
      } else {
        failed++;
      }
    }
    
    console.log(`Import completed: ${imported} proxies imported, ${failed} failed`);
    
    // Close the proxy manager connection
    await proxyManager.close();
    
  } catch (error) {
    console.error('Error importing proxies:', error instanceof Error ? error.message : String(error));
  }
}

// Get the file path from command line arguments
const filePath = process.argv[2];

// Run the import function
if (require.main === module) {
  importProxies(filePath).catch(error => {
    console.error('Unhandled error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

export default importProxies;