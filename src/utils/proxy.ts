/**
 * This file sets up HTTP/HTTPS global configuration
 * to avoid connection issues in some environments
 */

// Import required modules
import http from 'http';
import https from 'https';

/**
 * Configure global HTTP/HTTPS agents with proper settings
 */
export function setupHttpAgents(): void {
  // Set global agent options for both HTTP and HTTPS
  
  // HTTP agent with longer timeout and keepalive
  const httpAgent = new http.Agent({
    keepAlive: true,
    maxSockets: 25,
    timeout: 60000, // 60 seconds
  });
  
  // HTTPS agent with secure default settings
  const httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 25,
    timeout: 60000, // 60 seconds
    rejectUnauthorized: true, // Validate SSL certificates
  });
  
  // Set the global agents
  http.globalAgent = httpAgent;
  https.globalAgent = httpsAgent;
  
  // Make sure secure contexts validate certificates
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
  
  console.log('HTTP and HTTPS agents configured successfully');
}