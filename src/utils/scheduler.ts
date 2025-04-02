import cron from 'node-cron';
import { crawlSubredditPosts } from '../api/postCrawler';
import { config } from '../config/config';

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
          
          // Thực hiện crawl
          await crawlSubredditPosts(subreddit, limit, sortBy, timeRange, isVerbose);
        }
      } catch (error) {
        console.error(`Error in scheduled crawl task ${taskId}:`, error);
        const task = this.tasks.get(taskId);
        if (task) {
          task.errors++;
        }
      }
    };
    
    // Xử lý biểu thức cron đặc biệt "@once" để chạy một lần duy nhất
    let task;
    
    if (cronExpression === '@once') {
      // Tạo task giả định sẽ chạy ngay khi khởi động
      const taskObj = {
        isOnce: true,
        hasRun: false,
        start: () => {
          console.log(`[${new Date().toISOString()}] Running one-time crawl for r/${subreddit}`);
          // Thực thi hàm crawl ngay lập tức nếu chưa chạy
          if (!taskObj.hasRun) {
            setTimeout(async () => {
              try {
                await crawlFunction();
                taskObj.hasRun = true;
                
                // Tự động vô hiệu hóa cấu hình sau khi chạy xong
                console.log(`One-time crawl for r/${subreddit} completed - auto-disabling config`);
                
                // Đánh dấu là đã chạy xong
                const task = this.tasks.get(taskId);
                if (task) {
                  task.isOneTimeCompleted = true;
                }
                
                // Chỗ này có thể thêm code để tự vô hiệu hóa cấu hình trong DB
                // TODO: Implement auto-disable in database
              } catch (error) {
                console.error(`Error in one-time crawl for ${subreddit}:`, error);
              }
            }, 100);
          } else {
            console.log(`One-time task for r/${subreddit} already executed - skipping`);
          }
        },
        stop: () => {
          console.log(`Stopped one-time crawl task for r/${subreddit}`);
        }
      };
      
      task = taskObj;
    } else {
      // Tạo scheduled task bình thường với biểu thức cron
      task = cron.schedule(cronExpression, crawlFunction, {
        scheduled: false // Tạo nhưng chưa chạy
      });
    }
    
    // Lưu task vào map
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
        await crawlSubredditPosts(
          task.subreddit,
          task.limit,
          task.sortBy,
          task.timeRange,
          task.isVerbose
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
}

// Export một instance duy nhất của scheduler
export const crawlScheduler = new CrawlScheduler();