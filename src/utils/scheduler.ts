import cron from 'node-cron';
import { crawlSubredditPosts } from '../api/postCrawler';
import { efficientCrawlSubreddit } from './efficientCrawler';
import { config } from '../config/config';
import { Pool } from 'pg';
import { getCrawlerManager } from './dynamicCrawlers';

/**
 * Thông tin của một task crawl đang chạy
 */
interface CrawlTask {
  subreddit: string;
  limit: number;
  sortBy: 'hot' | 'new' | 'top' | 'rising';
  timeRange: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
  isVerbose: boolean;
  cronExpression: string;
  task: cron.ScheduledTask | any; // Bao gồm cả task thường và task @once
  lastRun?: Date;
  runCount: number;
  errors: number;
  isOneTimeCompleted?: boolean; // Đánh dấu task @once đã hoàn thành chưa
}

/**
 * Quản lý tất cả các tasks crawl đang chạy
 */
class CrawlScheduler {
  private tasks: Map<string, CrawlTask> = new Map();
  private isRunning: boolean = false;
  private pool: Pool;
  private onceTaskQueue: string[] = []; // Hàng đợi cho các task @once
  private isProcessingQueue: boolean = false;
  private maxConcurrentOnceTasks: number = 2; // Giới hạn số task @once chạy song song
  private currentRunningOnceTasks: number = 0;
  
  constructor() {
    // Khởi tạo pool connection cho PostgreSQL
    this.pool = new Pool({
      host: config.postgresql.host,
      port: config.postgresql.port,
      database: config.postgresql.database,
      user: config.postgresql.user,
      password: config.postgresql.password,
    });
  }
  
  /**
   * Thêm một task crawl mới
   * @param taskId ID của task (dùng để tham chiếu sau này)
   * @param subreddit Tên subreddit cần crawl
   * @param cronExpression Biểu thức cron xác định tần suất chạy (ví dụ "0 * * * *" - mỗi giờ)
   * @param limit Số lượng bài viết tối đa cần lấy mỗi lần
   * @param sortBy Cách sắp xếp bài viết
   * @param timeRange Khoảng thời gian cho 'top' sorting
   * @param isVerbose Tham số verbose cho việc lấy chi tiết
   * @returns boolean - true nếu task được thêm thành công
   */
  public addCrawlTask(
    taskId: string,
    subreddit: string,
    cronExpression: string,
    limit: number = 100,
    sortBy: 'hot' | 'new' | 'top' | 'rising' = 'new',
    timeRange: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all' = 'day',
    isVerbose: boolean = true
  ): boolean {
    // Kiểm tra xem biểu thức cron có hợp lệ không
    if (!cron.validate(cronExpression)) {
      console.error(`Invalid cron expression: ${cronExpression}`);
      return false;
    }
    
    // Nếu task đã tồn tại, dừng task cũ
    if (this.tasks.has(taskId)) {
      this.stopTask(taskId);
    }
    
    // Tạo hàm crawl với các tham số đã cho
    const crawlFunction = async () => {
      try {
        const task = this.tasks.get(taskId);
        if (task) {
          console.log(`[${new Date().toISOString()}] Running scheduled crawl for r/${subreddit}`);
          task.lastRun = new Date();
          task.runCount++;
          
          // Thực hiện crawl với phương pháp hiệu quả
          await efficientCrawlSubreddit(subreddit, limit, sortBy, timeRange);
        }
      } catch (error) {
        console.error(`Error in scheduled crawl task ${taskId}:`, error);
        const task = this.tasks.get(taskId);
        if (task) {
          task.errors++;
        }
      }
    };
    
    // Xử lý cấu hình một lần thông qua dữ liệu đặc biệt
    let task;
    
    // Kiểm tra nếu là cấu hình "chạy một lần" 
    // - Từ DB, sẽ là "0 0 31 12 *" (đã được chuyển đổi từ @once)
    // - Trực tiếp từ code, có thể vẫn là "@once"
    const isOnceTask = cronExpression === '0 0 31 12 *' ||
                      (subreddit.includes('-202') && (subreddit.match(/-\d{8}-\d{2}$/) !== null));
    
    if (isOnceTask) {
      console.log(`Setting up one-time task for r/${subreddit}`);
      
      // Tạo cron job hợp lệ cho PM2
      const validCron = '59 23 31 12 *'; // 23:59 ngày 31/12
      task = cron.schedule(validCron, async () => {
        // Dummy function - sẽ không bao giờ được gọi qua cron
      }, {
        scheduled: false
      });
      
      // Lưu tham chiếu đến scheduler để dùng trong các callback
      const scheduler = this;
      
      // Lưu dữ liệu task với cờ đặc biệt
      const taskData: CrawlTask = {
        subreddit,
        limit,
        sortBy,
        timeRange, 
        isVerbose,
        cronExpression: validCron,
        task,
        runCount: 0,
        errors: 0,
        isOneTimeCompleted: false
      };
      
      // Lưu vào map
      this.tasks.set(taskId, taskData);
      
      // Ghi đè phương thức start
      const originalStart = task.start;
      task.start = function() {
        // Gọi start gốc
        originalStart.call(this);
        
        // Thêm task vào hàng đợi thay vì thực thi ngay lập tức
        console.log(`[${new Date().toISOString()}] Adding one-time crawl for r/${subreddit} to queue`);
        
        // Kiểm tra xem đã chạy chưa
        const taskInfo = scheduler.tasks.get(taskId);
        if (taskInfo && taskInfo.isOneTimeCompleted) {
          console.log(`One-time task for r/${subreddit} already executed - skipping`);
          return;
        }
        
        // Thêm vào hàng đợi và xử lý
        scheduler.onceTaskQueue.push(taskId);
        scheduler.processOnceTaskQueue();
      };
      
      // Thêm phương thức thực thi task cho task @once này
      (task as any).executeOnceTask = async function() {
        console.log(`[${new Date().toISOString()}] Running one-time crawl for r/${subreddit} from queue`);
        
        try {
          // Đánh dấu đang chạy
          scheduler.currentRunningOnceTasks++;
          
          // Gọi crawl function (sử dụng hàm hiệu quả trực tiếp thay vì gọi crawlFunction)
          await efficientCrawlSubreddit(
            task.subreddit,
            task.limit,
            task.sortBy,
            task.timeRange
          );
          
          // Đánh dấu đã hoàn thành
          console.log(`One-time crawl for r/${subreddit} completed - auto-disabling config`);
          
          const task = scheduler.tasks.get(taskId);
          if (task) {
            task.isOneTimeCompleted = true;
            task.lastRun = new Date();
            task.runCount++;
          }
          
          // Vô hiệu hóa cấu hình trong DB
          try {
            // Xác định tên subreddit thực từ cấu hình
            let configName = subreddit;
            
            // Nếu đây là task được tạo từ tên cấu hình (@once từ database)
            // thì cần sử dụng tên đầy đủ để vô hiệu hóa đúng cấu hình
            if (taskId.startsWith('dynamic-')) {
              configName = taskId.replace('dynamic-', '');
            }
            
            // Sử dụng crawler manager để vô hiệu hóa
            const crawlerManager = getCrawlerManager();
            const result = await crawlerManager.disableCrawler(configName);
            
            if (result) {
              console.log(`Successfully disabled configuration for ${configName} in database`);
            } else {
              console.error(`Failed to disable configuration for ${configName} in database`);
            }
          } catch (error) {
            console.error(`Error disabling configuration in database:`, error);
          }
        } catch (error) {
          console.error(`Error in one-time crawl for ${subreddit}:`, error);
          
          const task = scheduler.tasks.get(taskId);
          if (task) {
            task.errors++;
          }
        } finally {
          // Đánh dấu đã chạy xong, giảm số lượng task đang chạy
          scheduler.currentRunningOnceTasks--;
          
          // Xử lý queue tiếp
          setTimeout(() => {
            scheduler.processOnceTaskQueue();
          }, 1000); // Chờ 1 giây trước khi xử lý task tiếp theo
        }
      };
      
      task = task;
    } else {
      // Tạo scheduled task bình thường với biểu thức cron
      task = cron.schedule(cronExpression, crawlFunction, {
        scheduled: false // Tạo nhưng chưa chạy
      });
    }
    
    // Nếu không phải task @once, lưu vào map  
    if (cronExpression !== '@once') {
      this.tasks.set(taskId, {
        subreddit,
        limit,
        sortBy,
        timeRange,
        isVerbose,
        cronExpression,
        task,
        runCount: 0,
        errors: 0
      });
    }
    // Với task @once đã được lưu trước đó trong code xử lý đặc biệt
    
    // Nếu scheduler đang chạy, thì chạy task mới luôn
    if (this.isRunning) {
      task.start();
    }
    
    console.log(`Added crawl task ${taskId} for r/${subreddit} with schedule: ${cronExpression}`);
    return true;
  }
  
  /**
   * Dừng một task cụ thể theo ID
   * @param taskId ID của task cần dừng
   * @returns boolean - true nếu task được dừng thành công
   */
  public stopTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (task) {
      task.task.stop();
      console.log(`Stopped crawl task ${taskId} for r/${task.subreddit}`);
      return true;
    }
    return false;
  }
  
  /**
   * Xóa một task khỏi scheduler
   * @param taskId ID của task cần xóa
   * @returns boolean - true nếu task được xóa thành công
   */
  public removeTask(taskId: string): boolean {
    const wasStoppedSuccessfully = this.stopTask(taskId);
    if (wasStoppedSuccessfully) {
      this.tasks.delete(taskId);
      console.log(`Removed crawl task ${taskId}`);
      return true;
    }
    return false;
  }
  
  /**
   * Bắt đầu tất cả các task đã đăng ký
   */
  public startAll(): void {
    if (this.isRunning) {
      console.log('Scheduler is already running');
      return;
    }
    
    // Khởi chạy tất cả các task
    for (const [taskId, task] of this.tasks.entries()) {
      task.task.start();
      console.log(`Started crawl task ${taskId} for r/${task.subreddit}`);
    }
    
    this.isRunning = true;
    console.log('All scheduled crawl tasks started');
  }
  
  /**
   * Dừng tất cả các task đang chạy
   */
  public stopAll(): void {
    if (!this.isRunning) {
      console.log('Scheduler is not running');
      return;
    }
    
    // Dừng tất cả các task
    for (const [taskId, task] of this.tasks.entries()) {
      task.task.stop();
      console.log(`Stopped crawl task ${taskId} for r/${task.subreddit}`);
    }
    
    this.isRunning = false;
    console.log('All scheduled crawl tasks stopped');
  }
  
  /**
   * Chạy một task ngay lập tức mà không cần đợi lịch
   * @param taskId ID của task cần chạy
   * @returns boolean - true nếu task được chạy thành công
   */
  public async runTaskNow(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (task) {
      console.log(`Running task ${taskId} for r/${task.subreddit} immediately`);
      try {
        task.lastRun = new Date();
        task.runCount++;
        await efficientCrawlSubreddit(
          task.subreddit,
          task.limit,
          task.sortBy,
          task.timeRange
        );
        return true;
      } catch (error) {
        console.error(`Error running task ${taskId} immediately:`, error);
        task.errors++;
        return false;
      }
    }
    return false;
  }
  
  /**
   * Lấy thông tin tất cả các task đang chạy
   */
  public getTasksInfo(): { [taskId: string]: any } {
    const tasksInfo: { [taskId: string]: any } = {};
    
    for (const [taskId, task] of this.tasks.entries()) {
      tasksInfo[taskId] = {
        subreddit: task.subreddit,
        schedule: task.cronExpression,
        limit: task.limit,
        sortBy: task.sortBy,
        timeRange: task.timeRange,
        verbose: task.isVerbose,
        isRunning: this.isRunning,
        lastRun: task.lastRun,
        runCount: task.runCount,
        errors: task.errors
      };
    }
    
    return tasksInfo;
  }
  
  /**
   * Trả về số lượng task đang chạy
   */
  public getTaskCount(): number {
    return this.tasks.size;
  }
  
  /**
   * Kiểm tra xem scheduler có đang chạy không
   */
  public isSchedulerRunning(): boolean {
    return this.isRunning;
  }
  
  /**
   * Xử lý hàng đợi các task @once
   */
  private async processOnceTaskQueue(): Promise<void> {
    // Nếu đang xử lý queue rồi thì không làm gì
    if (this.isProcessingQueue) {
      return;
    }
    
    this.isProcessingQueue = true;
    
    try {
      // Kiểm tra xem có còn task trong queue và số lượng task đang chạy < max không
      while (this.onceTaskQueue.length > 0 && this.currentRunningOnceTasks < this.maxConcurrentOnceTasks) {
        // Lấy task ID từ đầu queue
        const taskId = this.onceTaskQueue.shift();
        
        if (!taskId) {
          continue;
        }
        
        // Lấy thông tin task
        const taskInfo = this.tasks.get(taskId);
        
        if (!taskInfo) {
          console.error(`Task ${taskId} not found in task map`);
          continue;
        }
        
        // Kiểm tra nếu task đã hoàn thành thì bỏ qua
        if (taskInfo.isOneTimeCompleted) {
          console.log(`Task ${taskId} already completed, skipping`);
          continue;
        }
        
        // Thực thi task
        console.log(`Executing task ${taskId} from queue. Remaining in queue: ${this.onceTaskQueue.length}`);
        
        // Gọi phương thức thực thi task
        (taskInfo.task as any).executeOnceTask();
      }
    } catch (error) {
      console.error('Error processing once task queue:', error);
    } finally {
      this.isProcessingQueue = false;
      
      // Nếu còn task trong queue và số lượng task đang chạy < max, tiếp tục xử lý
      if (this.onceTaskQueue.length > 0 && this.currentRunningOnceTasks < this.maxConcurrentOnceTasks) {
        setTimeout(() => {
          this.processOnceTaskQueue();
        }, 1000);
      }
    }
  }
  
  /**
   * Đóng kết nối database khi cần thiết
   */
  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      console.log('Database connection pool closed');
    }
  }
}

// Export một instance duy nhất của scheduler
export const crawlScheduler = new CrawlScheduler();