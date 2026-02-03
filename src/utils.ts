/**
 * Wishmaster Desktop - Utility Functions
 *
 * This module contains general-purpose utility functions used throughout
 * the application for formatting, string manipulation, and other common tasks.
 *
 * @module utils
 */

/**
 * Format a Unix timestamp to a time string in HH:MM format
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted time string (e.g., "14:30")
 *
 * @example
 * ```ts
 * const time = formatTime(Date.now());
 * console.log(time); // "14:30"
 * ```
 */
export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a Unix timestamp to a date string
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted date string (e.g., "15.01.2024")
 *
 * @example
 * ```ts
 * const date = formatDate(Date.now());
 * console.log(date); // "15.01.2024"
 * ```
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('ru-RU');
}

/**
 * Format a Unix timestamp to a full datetime string
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted datetime string (e.g., "15.01.2024, 14:30")
 *
 * @example
 * ```ts
 * const datetime = formatDateTime(Date.now());
 * console.log(datetime); // "15.01.2024, 14:30"
 * ```
 */
export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format bytes to human-readable size string
 *
 * @param bytes - Size in bytes
 * @returns Formatted size string with appropriate unit (B, KB, MB, GB)
 *
 * @example
 * ```ts
 * formatSize(1024);       // "1 KB"
 * formatSize(1048576);    // "1 MB"
 * formatSize(1073741824); // "1.0 GB"
 * ```
 */
export function formatSize(bytes: number): string {
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;

  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) return `${Math.round(bytes / KB)} KB`;
  if (bytes < GB) return `${Math.round(bytes / MB)} MB`;
  return `${(bytes / GB).toFixed(1)} GB`;
}

/**
 * Truncate a string to a maximum length, adding ellipsis if truncated
 *
 * @param str - Input string
 * @param maxLength - Maximum length including ellipsis
 * @returns Truncated string with "..." if original was longer
 *
 * @example
 * ```ts
 * truncate("Hello World", 8); // "Hello..."
 * truncate("Hello", 10);      // "Hello"
 * ```
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Debounce a function call
 *
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 *
 * @example
 * ```ts
 * const debouncedSearch = debounce((query) => search(query), 300);
 * input.addEventListener('input', (e) => debouncedSearch(e.target.value));
 * ```
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Throttle a function call
 *
 * @param fn - Function to throttle
 * @param limit - Minimum time between calls in milliseconds
 * @returns Throttled function
 *
 * @example
 * ```ts
 * const throttledScroll = throttle(() => handleScroll(), 100);
 * window.addEventListener('scroll', throttledScroll);
 * ```
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Generate a unique ID
 *
 * @returns Unique string identifier
 *
 * @example
 * ```ts
 * const id = generateId(); // "1707123456789_abc123"
 * ```
 */
export function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Sleep for a specified duration
 *
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the duration
 *
 * @example
 * ```ts
 * await sleep(1000); // Wait 1 second
 * ```
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if a string contains Cyrillic characters
 *
 * @param text - Text to check
 * @returns True if text contains Cyrillic characters
 *
 * @example
 * ```ts
 * hasCyrillic("Привет");  // true
 * hasCyrillic("Hello");   // false
 * ```
 */
export function hasCyrillic(text: string): boolean {
  return /[а-яА-ЯёЁ]/.test(text);
}

/**
 * Capitalize the first letter of a string
 *
 * @param str - Input string
 * @returns String with first letter capitalized
 *
 * @example
 * ```ts
 * capitalize("hello"); // "Hello"
 * ```
 */
export function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Clamp a number between min and max values
 *
 * @param value - Number to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value
 *
 * @example
 * ```ts
 * clamp(5, 0, 10);   // 5
 * clamp(-5, 0, 10);  // 0
 * clamp(15, 0, 10);  // 10
 * ```
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Parse JSON safely with a fallback value
 *
 * @param json - JSON string to parse
 * @param fallback - Fallback value if parsing fails
 * @returns Parsed value or fallback
 *
 * @example
 * ```ts
 * safeJsonParse('{"a": 1}', {});  // { a: 1 }
 * safeJsonParse('invalid', {});   // {}
 * ```
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Check if a value is a non-empty string
 *
 * @param value - Value to check
 * @returns True if value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Estimate token count for a string (rough approximation)
 * Uses ~4 characters per token as a rough estimate
 *
 * @param text - Text to estimate
 * @returns Estimated token count
 *
 * @example
 * ```ts
 * estimateTokens("Hello world"); // ~3
 * ```
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
