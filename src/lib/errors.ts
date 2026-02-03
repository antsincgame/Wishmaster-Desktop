/**
 * Wishmaster Desktop - Error Handling Utilities
 *
 * This module provides utilities for consistent error handling
 * throughout the application.
 *
 * @module lib/errors
 */

/**
 * Application error codes
 */
export enum ErrorCode {
  // General errors
  UNKNOWN = 'UNKNOWN',
  NETWORK = 'NETWORK',
  TIMEOUT = 'TIMEOUT',

  // Model errors
  MODEL_NOT_LOADED = 'MODEL_NOT_LOADED',
  MODEL_LOAD_FAILED = 'MODEL_LOAD_FAILED',
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',

  // Session errors
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_CREATE_FAILED = 'SESSION_CREATE_FAILED',

  // Generation errors
  GENERATION_FAILED = 'GENERATION_FAILED',
  GENERATION_STOPPED = 'GENERATION_STOPPED',

  // Voice errors
  VOICE_NOT_AVAILABLE = 'VOICE_NOT_AVAILABLE',
  RECORDING_FAILED = 'RECORDING_FAILED',
  TTS_FAILED = 'TTS_FAILED',

  // Database errors
  DB_ERROR = 'DB_ERROR',
  DB_NOT_INITIALIZED = 'DB_NOT_INITIALIZED',

  // Settings errors
  SETTINGS_SAVE_FAILED = 'SETTINGS_SAVE_FAILED',
  SETTINGS_LOAD_FAILED = 'SETTINGS_LOAD_FAILED',
}

/**
 * Application error class with code and details
 */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }

  /**
   * Create error from unknown error type
   */
  static from(error: unknown, code: ErrorCode = ErrorCode.UNKNOWN): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof Error) {
      return new AppError(code, error.message, undefined, error);
    }

    return new AppError(code, String(error));
  }

  /**
   * Check if error is of specific code
   */
  is(code: ErrorCode): boolean {
    return this.code === code;
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(): string {
    switch (this.code) {
      case ErrorCode.MODEL_NOT_LOADED:
        return 'Модель не загружена. Загрузите модель в разделе "Модели".';
      case ErrorCode.MODEL_LOAD_FAILED:
        return 'Не удалось загрузить модель. Проверьте путь к файлу.';
      case ErrorCode.MODEL_NOT_FOUND:
        return 'Файл модели не найден.';
      case ErrorCode.SESSION_NOT_FOUND:
        return 'Сессия не найдена.';
      case ErrorCode.GENERATION_FAILED:
        return 'Ошибка генерации ответа.';
      case ErrorCode.VOICE_NOT_AVAILABLE:
        return 'Голосовой движок недоступен.';
      case ErrorCode.RECORDING_FAILED:
        return 'Не удалось записать голос.';
      case ErrorCode.TTS_FAILED:
        return 'Не удалось озвучить текст.';
      case ErrorCode.DB_ERROR:
        return 'Ошибка базы данных.';
      case ErrorCode.SETTINGS_SAVE_FAILED:
        return 'Не удалось сохранить настройки.';
      case ErrorCode.NETWORK:
        return 'Ошибка сети.';
      case ErrorCode.TIMEOUT:
        return 'Превышено время ожидания.';
      default:
        return this.message || 'Произошла неизвестная ошибка.';
    }
  }

  /**
   * Convert to JSON for logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      cause: this.cause instanceof Error ? this.cause.message : this.cause,
    };
  }
}

/**
 * Error handler type
 */
export type ErrorHandler = (error: AppError) => void;

/**
 * Default error handler - logs to console
 */
export const defaultErrorHandler: ErrorHandler = (error) => {
  console.error('[AppError]', error.toJSON());
};

/**
 * Create a wrapped async function with error handling
 *
 * @param fn - Async function to wrap
 * @param code - Error code to use on failure
 * @param onError - Optional error handler
 * @returns Wrapped function
 */
export function withErrorHandling<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  code: ErrorCode,
  onError?: ErrorHandler
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      const appError = AppError.from(error, code);
      (onError ?? defaultErrorHandler)(appError);
      throw appError;
    }
  };
}

/**
 * Try to execute an async function, returning null on error
 *
 * @param fn - Async function to execute
 * @param onError - Optional error handler
 * @returns Result or null
 */
export async function tryAsync<T>(
  fn: () => Promise<T>,
  onError?: ErrorHandler
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    const appError = AppError.from(error);
    (onError ?? defaultErrorHandler)(appError);
    return null;
  }
}

/**
 * Extract error message from unknown error type
 *
 * @param error - Unknown error
 * @returns Error message string
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.getUserMessage();
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Log error with context
 *
 * @param context - Context string (e.g., function name)
 * @param error - Error to log
 */
export function logError(context: string, error: unknown): void {
  const message = getErrorMessage(error);
  console.error(`[${context}] ${message}`, error);
}

/**
 * Assert condition and throw if false
 *
 * @param condition - Condition to check
 * @param code - Error code
 * @param message - Error message
 */
export function assert(
  condition: unknown,
  code: ErrorCode,
  message: string
): asserts condition {
  if (!condition) {
    throw new AppError(code, message);
  }
}

/**
 * Ensure value is not null/undefined
 *
 * @param value - Value to check
 * @param code - Error code
 * @param message - Error message
 * @returns Non-null value
 */
export function ensureNotNull<T>(
  value: T | null | undefined,
  code: ErrorCode,
  message: string
): T {
  if (value === null || value === undefined) {
    throw new AppError(code, message);
  }
  return value;
}
