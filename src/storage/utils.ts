/**
 * Các hàm tiện ích cho SqliteMinerStorage
 */

/**
 * Làm mờ thời gian đến phút, xóa bỏ thông tin về giây và phần nhỏ hơn
 * @param dateTime Đối tượng Date cần làm mờ
 * @returns Đối tượng Date đã được làm mờ đến phút
 */
export function obfuscate_datetime_to_minute(dateTime: Date): Date {
  const result = new Date(dateTime);
  result.setSeconds(0, 0); // Đặt giây và mili giây về 0
  return result;
}

/**
 * Chuyển đổi đối tượng thành chuỗi JSON và sau đó encode sang UTF-8 bytes
 * @param object Đối tượng cần chuyển đổi
 * @returns Buffer chứa dữ liệu đã được encode
 */
export function object_to_utf8_bytes(object: any): Buffer {
  const jsonString = JSON.stringify(object);
  return Buffer.from(jsonString, 'utf-8');
}

/**
 * Trích xuất kích thước nội dung theo bytes
 * @param contentBytes Buffer chứa nội dung
 * @returns Kích thước tính bằng bytes
 */
export function get_content_size_bytes(contentBytes: Buffer): number {
  return contentBytes.length;
}

/**
 * Chuẩn hóa label để phù hợp với ràng buộc cơ sở dữ liệu
 * @param label Label cần chuẩn hóa
 * @param maxLength Độ dài tối đa cho phép
 * @returns Label đã được chuẩn hóa
 */
export function normalize_label(label: string, maxLength: number): string {
  // Chuyển thành chữ thường và cắt ngắn nếu cần thiết
  return label.toLowerCase().slice(0, maxLength);
}