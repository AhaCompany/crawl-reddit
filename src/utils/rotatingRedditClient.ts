/**
 * Client Reddit với khả năng xoay vòng tài khoản để tránh rate limit
 */
import Snoowrap from 'snoowrap';
import { RedditAccountManager } from './accountManager';
import { config } from '../config/config';
import { getProxyManager, setupHttpAgentsWithProxy, setupDefaultHttpAgents, recordProxySuccess, recordProxyFailure } from './proxy';

// Biến lưu trữ instance của RedditAccountManager
let accountManager: RedditAccountManager | null = null;

// Biến lưu trữ instance của client hiện tại
let currentClient: Snoowrap | null = null;
let currentUsername: string | null = null;

// Biến lưu trữ thông tin proxy hiện tại
let currentProxyHost: string | null = null;
let currentProxyPort: number | null = null;

// Cờ hiệu sử dụng proxy
const useProxies = config.app.useProxies === true;

/**
 * Khởi tạo và lấy instance của RedditAccountManager
 */
export async function getAccountManager(): Promise<RedditAccountManager> {
  if (!accountManager) {
    accountManager = new RedditAccountManager();
    await accountManager.initialize();
  }
  return accountManager;
}

/**
 * Thiết lập HTTP agents
 * Có thể sử dụng proxy hoặc không tùy theo cấu hình
 */
export async function setupHttpAgents(): Promise<void> {
  if (useProxies) {
    // Nếu sử dụng proxy, thiết lập agents với proxy
    const proxyManager = getProxyManager();
    await proxyManager.initialize();
    
    const result = await setupHttpAgentsWithProxy();
    if (result) {
      // Lưu thông tin proxy hiện tại
      const proxy = await proxyManager.getNextProxy();
      if (proxy) {
        currentProxyHost = proxy.host;
        currentProxyPort = proxy.port;
        console.log(`Using proxy: ${proxy.host}:${proxy.port}`);
      }
    } else {
      // Nếu không có proxy khả dụng, sử dụng agents mặc định
      setupDefaultHttpAgents();
      currentProxyHost = null;
      currentProxyPort = null;
    }
  } else {
    // Nếu không sử dụng proxy, thiết lập agents mặc định
    setupDefaultHttpAgents();
    currentProxyHost = null;
    currentProxyPort = null;
  }
}

/**
 * Khởi tạo hoặc lấy client Reddit hiện tại
 */
export async function getRedditClient(): Promise<Snoowrap> {
  try {
    // Nếu đã có client, trả về
    if (currentClient) {
      return currentClient;
    }
    
    // Cấu hình HTTP agents
    await setupHttpAgents();
    
    // Lấy tài khoản từ RedditAccountManager
    const manager = await getAccountManager();
    const account = await manager.getNextAccount();
    
    if (!account) {
      throw new Error('No Reddit accounts available');
    }
    
    // Lưu username hiện tại
    currentUsername = account.username;
    
    // Tạo client mới
    currentClient = new Snoowrap({
      userAgent: account.userAgent,
      clientId: account.clientId,
      clientSecret: account.clientSecret,
      username: account.username,
      password: account.password
    });
    
    // Cấu hình client
    currentClient.config({
      requestDelay: 2000,          // 2 giây giữa các requests để giảm khả năng bị rate limit
      continueAfterRatelimitError: false,
      retryErrorCodes: [502, 503, 504, 500],
      maxRetryAttempts: 3,
      debug: false
    });
    
    console.log(`Using Reddit account: ${account.username}${currentProxyHost ? ` with proxy ${currentProxyHost}:${currentProxyPort}` : ''} [${account.dailyUsageCount}/${account.successCount + account.failCount} requests]`);
    
    return currentClient;
  } catch (error) {
    console.error('Error getting Reddit client:', error);
    throw error;
  }
}

/**
 * Xử lý khi gặp rate limit hoặc lỗi xác thực
 */
export async function handleRateLimitError(error: any): Promise<Snoowrap> {
  // Kiểm tra xem có phải rate limit không
  const isRateLimit = error.message?.includes('rate limit') || 
                      error.message?.includes('429') ||
                      error.statusCode === 429;
  
  // Kiểm tra xem có phải lỗi xác thực không
  const isAuthError = error.message?.includes('401') || 
                       error.message?.includes('Unauthorized') ||
                       error.statusCode === 401;

  // Kiểm tra xem có phải lỗi proxy không
  const isProxyError = error.message?.includes('ECONNREFUSED') ||
                       error.message?.includes('ETIMEDOUT') ||
                       error.message?.includes('socket hang up') ||
                       error.code === 'ECONNRESET';
  
  // Ghi nhận lỗi cho tài khoản hiện tại
  if (currentUsername) {
    const manager = await getAccountManager();
    
    if (isRateLimit) {
      await manager.recordFailure(currentUsername, true); // Đánh dấu là rate limit
    } else {
      await manager.recordFailure(currentUsername, false);
    }
  }

  // Ghi nhận lỗi cho proxy hiện tại
  if (currentProxyHost && currentProxyPort) {
    if (isProxyError) {
      // Lỗi proxy nghiêm trọng
      await recordProxyFailure(currentProxyHost, currentProxyPort, true);
    } else if (isRateLimit) {
      // Rate limit có thể do proxy
      await recordProxyFailure(currentProxyHost, currentProxyPort, true);
    } else {
      // Lỗi khác
      await recordProxyFailure(currentProxyHost, currentProxyPort, false);
    }
  }
  
  // Reset client và proxy
  currentClient = null;
  currentUsername = null;
  currentProxyHost = null;
  currentProxyPort = null;
  
  // Lấy client mới (sẽ tự động lấy proxy mới nếu cần)
  return await getRedditClient();
}

/**
 * Ghi nhận thành công
 */
export async function recordSuccess(): Promise<void> {
  // Ghi nhận thành công cho tài khoản
  if (currentUsername) {
    const manager = await getAccountManager();
    await manager.recordSuccess(currentUsername);
  }

  // Ghi nhận thành công cho proxy
  if (currentProxyHost && currentProxyPort) {
    await recordProxySuccess(currentProxyHost, currentProxyPort);
  }
}

/**
 * Đóng kết nối
 */
export async function closeRedditClient(): Promise<void> {
  currentClient = null;
  currentUsername = null;
  currentProxyHost = null;
  currentProxyPort = null;
  
  if (accountManager) {
    await accountManager.close();
    accountManager = null;
  }

  // Đóng proxy manager nếu đã sử dụng
  if (useProxies) {
    const proxyManager = getProxyManager();
    await proxyManager.close();
  }
}

/**
 * Lấy thống kê sử dụng tài khoản
 */
export async function getAccountStats(): Promise<any> {
  const manager = await getAccountManager();
  return await manager.getAccountStats();
}

/**
 * Lấy thống kê sử dụng proxy
 */
export async function getProxyStats(): Promise<any> {
  if (!useProxies) {
    return { enabled: false, message: "Proxy system is not enabled" };
  }
  
  const proxyManager = getProxyManager();
  return await proxyManager.getProxyStats();
}

// Hàm bọc để lấy subreddit từ client với cơ chế xử lý lỗi
export async function getSubreddit(subredditName: string): Promise<any> {
  return executeRedditRequest<any>(async (client) => {
    // Get the subreddit
    return client.getSubreddit(subredditName) as any;
  });
}

// Hàm bọc để lấy submission từ client với cơ chế xử lý lỗi
export async function getSubmission(submissionId: string): Promise<any> {
  return executeRedditRequest<any>(async (client) => {
    // Get the submission
    return client.getSubmission(submissionId) as any;
  });
}

/**
 * API chung để thực hiện yêu cầu với xử lý rate limit
 */
export async function executeRedditRequest<T>(requestFn: (client: Snoowrap) => Promise<T>): Promise<T> {
  let retryCount = 0;
  const maxRetries = 3;
  
  while (retryCount <= maxRetries) {
    try {
      // Lấy client mới cho mỗi lần request, với thông tin tài khoản hiện tại
      const client = await getRedditClient();
      
      // Lấy thông tin tài khoản và proxy đang sử dụng để log
      const accountInfo = `${currentUsername || 'unknown'}${currentProxyHost ? ` with proxy ${currentProxyHost}:${currentProxyPort}` : ''}`;
      console.log(`[Request] Using account ${accountInfo} (attempt ${retryCount + 1}/${maxRetries + 1})`);
      
      // Thực hiện request
      const result = await requestFn(client);
      
      // Ghi nhận thành công
      await recordSuccess();
      console.log(`[Success] Account ${accountInfo} completed request successfully`);
      
      // Force typecasting to break circular reference
      return result as unknown as T;
    } catch (error: any) {
      console.error(`Error executing Reddit request (attempt ${retryCount + 1}/${maxRetries + 1}):`, error);
      retryCount++;
      
      // Nếu đã vượt quá số lần thử lại, ném lại lỗi
      if (retryCount > maxRetries) {
        throw error;
      }
      
      // Xử lý lỗi và tiếp tục vòng lặp với client mới
      console.log(`[Rotating] Switching to next account due to error`);
      await handleRateLimitError(error);
      
      // Chờ thêm thời gian trước khi thử lại
      const backoffTime = retryCount * 2000; // 2s, 4s, 6s
      console.log(`Waiting ${backoffTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, backoffTime));
    }
  }
  
  throw new Error(`Failed to execute Reddit request after ${maxRetries + 1} attempts`);
}