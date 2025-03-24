/**
 * Định nghĩa các hằng số sử dụng trong SqliteMinerStorage
 */

// Độ dài tối đa của trường label
export const MAX_LABEL_LENGTH = 32;

// Enum xác định nguồn dữ liệu
export enum DataSource {
  UNKNOWN = 0,
  REDDIT = 1,
  TWITTER = 2,
  // Có thể mở rộng thêm các nguồn khác
}

// Cấu trúc TimeBucket
export class TimeBucket {
  id: number;

  constructor(id: number) {
    this.id = id;
  }

  /**
   * Tạo TimeBucket từ một đối tượng Date
   * @param datetime Thời gian
   * @returns TimeBucket tương ứng
   */
  static from_datetime(datetime: Date): TimeBucket {
    // Tính số giờ kể từ epoch time (1/1/1970)
    const epochHours = Math.floor(datetime.getTime() / (1000 * 60 * 60));
    return new TimeBucket(epochHours);
  }
}

// Đường dẫn mặc định đến file SQLite
export const DEFAULT_DB_PATH = 'data/reddit_miner.db';