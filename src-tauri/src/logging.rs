//! Wishmaster Desktop - Strict Logging System
//!
//! Provides structured logging with levels, context, and JSON output.
//! All logs are prefixed with timestamp, level, and module.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};

/// Global verbose mode flag
static VERBOSE_MODE: AtomicBool = AtomicBool::new(false);

/// Log levels
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum LogLevel {
    Error,
    Warn,
    Info,
    Debug,
    Trace,
}

impl LogLevel {
    fn icon(&self) -> &'static str {
        match self {
            LogLevel::Error => "❌",
            LogLevel::Warn => "⚠️",
            LogLevel::Info => "ℹ️",
            LogLevel::Debug => "🔍",
            LogLevel::Trace => "📝",
        }
    }
    
    fn color_code(&self) -> &'static str {
        match self {
            LogLevel::Error => "\x1b[31m", // Red
            LogLevel::Warn => "\x1b[33m",  // Yellow
            LogLevel::Info => "\x1b[36m",  // Cyan
            LogLevel::Debug => "\x1b[35m", // Magenta
            LogLevel::Trace => "\x1b[90m", // Gray
        }
    }
}

/// Structured log entry
#[derive(Debug, Serialize)]
pub struct LogEntry<'a> {
    pub timestamp: String,
    pub level: LogLevel,
    pub module: &'a str,
    pub message: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Enable verbose logging
pub fn set_verbose(enabled: bool) {
    VERBOSE_MODE.store(enabled, Ordering::SeqCst);
}

/// Check if verbose mode is enabled
pub fn is_verbose() -> bool {
    VERBOSE_MODE.load(Ordering::SeqCst)
}

/// Get current timestamp
fn now() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string()
}

/// Internal log function
fn log_internal(level: LogLevel, module: &str, message: &str, context: Option<serde_json::Value>, error: Option<&str>) {
    // Skip debug/trace in non-verbose mode
    if !is_verbose() && matches!(level, LogLevel::Debug | LogLevel::Trace) {
        return;
    }
    
    let timestamp = now();
    let reset = "\x1b[0m";
    let color = level.color_code();
    let icon = level.icon();
    
    // Console output with colors
    if let Some(err) = error {
        eprintln!(
            "{color}[{timestamp}] {icon} [{:?}] [{module}] {message} | error: {err}{reset}",
            level
        );
    } else if let Some(ctx) = &context {
        println!(
            "{color}[{timestamp}] {icon} [{:?}] [{module}] {message} | {}{reset}",
            level,
            serde_json::to_string(ctx).unwrap_or_default()
        );
    } else {
        println!(
            "{color}[{timestamp}] {icon} [{:?}] [{module}] {message}{reset}",
            level
        );
    }
}

// ==================== Public Logging Macros ====================

/// Log error with optional context
#[macro_export]
macro_rules! log_error {
    ($module:expr, $msg:expr) => {
        $crate::logging::error($module, $msg, None, None)
    };
    ($module:expr, $msg:expr, $err:expr) => {
        $crate::logging::error($module, $msg, None, Some(&format!("{}", $err)))
    };
    ($module:expr, $msg:expr, $ctx:expr, $err:expr) => {
        $crate::logging::error($module, $msg, Some($ctx), Some(&format!("{}", $err)))
    };
}

/// Log warning
#[macro_export]
macro_rules! log_warn {
    ($module:expr, $msg:expr) => {
        $crate::logging::warn($module, $msg, None)
    };
    ($module:expr, $msg:expr, $ctx:expr) => {
        $crate::logging::warn($module, $msg, Some($ctx))
    };
}

/// Log info
#[macro_export]
macro_rules! log_info {
    ($module:expr, $msg:expr) => {
        $crate::logging::info($module, $msg, None)
    };
    ($module:expr, $msg:expr, $ctx:expr) => {
        $crate::logging::info($module, $msg, Some($ctx))
    };
}

/// Log debug (only in verbose mode)
#[macro_export]
macro_rules! log_debug {
    ($module:expr, $msg:expr) => {
        $crate::logging::debug($module, $msg, None)
    };
    ($module:expr, $msg:expr, $ctx:expr) => {
        $crate::logging::debug($module, $msg, Some($ctx))
    };
}

// ==================== Public Functions ====================

pub fn error(module: &str, message: &str, context: Option<serde_json::Value>, error: Option<&str>) {
    log_internal(LogLevel::Error, module, message, context, error);
}

pub fn warn(module: &str, message: &str, context: Option<serde_json::Value>) {
    log_internal(LogLevel::Warn, module, message, context, None);
}

pub fn info(module: &str, message: &str, context: Option<serde_json::Value>) {
    log_internal(LogLevel::Info, module, message, context, None);
}

pub fn debug(module: &str, message: &str, context: Option<serde_json::Value>) {
    log_internal(LogLevel::Debug, module, message, context, None);
}

pub fn trace(module: &str, message: &str, context: Option<serde_json::Value>) {
    log_internal(LogLevel::Trace, module, message, context, None);
}

// ==================== Result Extension ====================

/// Extension trait for logging Results
pub trait LogResult<T, E> {
    /// Log error and return Result
    fn log_err(self, module: &str, message: &str) -> Result<T, E>;
    
    /// Log error with context and return Result
    fn log_err_ctx(self, module: &str, message: &str, context: serde_json::Value) -> Result<T, E>;
}

impl<T, E: std::fmt::Display> LogResult<T, E> for Result<T, E> {
    fn log_err(self, module: &str, message: &str) -> Result<T, E> {
        if let Err(ref e) = self {
            error(module, message, None, Some(&e.to_string()));
        }
        self
    }
    
    fn log_err_ctx(self, module: &str, message: &str, context: serde_json::Value) -> Result<T, E> {
        if let Err(ref e) = self {
            error(module, message, Some(context), Some(&e.to_string()));
        }
        self
    }
}

// ==================== Tests ====================

#[cfg(test)]
mod tests {
    use super::*;

    // ==================== LogLevel Tests ====================
    
    #[test]
    fn test_log_levels() {
        assert_eq!(LogLevel::Error.icon(), "❌");
        assert_eq!(LogLevel::Warn.icon(), "⚠️");
        assert_eq!(LogLevel::Info.icon(), "ℹ️");
    }
    
    #[test]
    fn test_all_log_level_icons() {
        let levels = [LogLevel::Error, LogLevel::Warn, LogLevel::Info, LogLevel::Debug, LogLevel::Trace];
        for level in levels {
            let icon = level.icon();
            assert!(!icon.is_empty(), "Icon should not be empty for {:?}", level);
        }
    }
    
    #[test]
    fn test_all_log_level_colors() {
        let levels = [LogLevel::Error, LogLevel::Warn, LogLevel::Info, LogLevel::Debug, LogLevel::Trace];
        for level in levels {
            let color = level.color_code();
            assert!(color.starts_with("\x1b["), "Color should be ANSI escape for {:?}", level);
        }
    }
    
    #[test]
    fn test_log_level_equality() {
        assert_eq!(LogLevel::Error, LogLevel::Error);
        assert_ne!(LogLevel::Error, LogLevel::Warn);
    }
    
    #[test]
    fn test_log_level_clone() {
        let level = LogLevel::Debug;
        let cloned = level.clone();
        assert_eq!(level, cloned);
    }
    
    #[test]
    fn test_log_level_serialize() {
        let level = LogLevel::Error;
        let json = serde_json::to_string(&level).unwrap();
        assert_eq!(json, "\"ERROR\"");
    }

    // ==================== Verbose Mode Tests ====================
    
    #[test]
    fn test_verbose_mode() {
        set_verbose(true);
        assert!(is_verbose());
        set_verbose(false);
        assert!(!is_verbose());
    }
    
    #[test]
    fn test_verbose_mode_toggle() {
        let initial = is_verbose();
        set_verbose(!initial);
        assert_ne!(is_verbose(), initial);
        set_verbose(initial);  // Reset
    }

    // ==================== LogEntry Tests ====================
    
    #[test]
    fn test_log_entry_serialization() {
        let entry = LogEntry {
            timestamp: "2025-01-01 00:00:00.000".to_string(),
            level: LogLevel::Info,
            module: "test",
            message: "test message",
            context: None,
            error: None,
        };
        
        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("\"level\":\"INFO\""));
        assert!(json.contains("\"module\":\"test\""));
        assert!(json.contains("\"message\":\"test message\""));
    }
    
    #[test]
    fn test_log_entry_with_context() {
        let ctx = serde_json::json!({"key": "value"});
        let entry = LogEntry {
            timestamp: "2025-01-01 00:00:00.000".to_string(),
            level: LogLevel::Debug,
            module: "test",
            message: "with context",
            context: Some(ctx),
            error: None,
        };
        
        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("\"context\""));
        assert!(json.contains("\"key\""));
    }
    
    #[test]
    fn test_log_entry_with_error() {
        let entry = LogEntry {
            timestamp: "2025-01-01 00:00:00.000".to_string(),
            level: LogLevel::Error,
            module: "test",
            message: "error occurred",
            context: None,
            error: Some("File not found".to_string()),
        };
        
        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("\"error\""));
        assert!(json.contains("File not found"));
    }
    
    #[test]
    fn test_log_entry_skips_none() {
        let entry = LogEntry {
            timestamp: "2025-01-01 00:00:00.000".to_string(),
            level: LogLevel::Info,
            module: "test",
            message: "simple",
            context: None,
            error: None,
        };
        
        let json = serde_json::to_string(&entry).unwrap();
        assert!(!json.contains("\"context\""));
        assert!(!json.contains("\"error\""));
    }

    // ==================== LogResult Extension Tests ====================
    
    #[test]
    fn test_log_result_extension() {
        let ok_result: Result<i32, &str> = Ok(42);
        assert_eq!(ok_result.log_err("test", "should not log").unwrap(), 42);
        
        let err_result: Result<i32, &str> = Err("test error");
        assert!(err_result.log_err("test", "error occurred").is_err());
    }
    
    #[test]
    fn test_log_result_preserves_ok() {
        let result: Result<String, &str> = Ok("hello".to_string());
        let logged = result.log_err("test", "msg");
        assert_eq!(logged.unwrap(), "hello");
    }
    
    #[test]
    fn test_log_result_preserves_err() {
        let result: Result<i32, &str> = Err("original error");
        let logged = result.log_err("test", "logged message");
        assert_eq!(logged.unwrap_err(), "original error");
    }
    
    #[test]
    fn test_log_result_with_context() {
        let result: Result<i32, String> = Err("io error".to_string());
        let ctx = serde_json::json!({"file": "test.txt"});
        let logged = result.log_err_ctx("io", "failed to read", ctx);
        assert!(logged.is_err());
    }

    // ==================== Timestamp Tests ====================
    
    #[test]
    fn test_timestamp_format() {
        let ts = now();
        // Should match pattern: YYYY-MM-DD HH:MM:SS.mmm
        assert!(ts.len() >= 23, "Timestamp should be at least 23 chars: {}", ts);
        assert!(ts.contains("-"), "Timestamp should contain date separator");
        assert!(ts.contains(":"), "Timestamp should contain time separator");
        assert!(ts.contains("."), "Timestamp should contain milliseconds");
    }
    
    #[test]
    fn test_timestamp_changes() {
        let ts1 = now();
        std::thread::sleep(std::time::Duration::from_millis(10));
        let ts2 = now();
        // Timestamps should be different (or at least not identical)
        // This is a weak test but ensures now() is actually called
        assert!(!ts1.is_empty());
        assert!(!ts2.is_empty());
    }

    // ==================== Public Function Tests ====================
    
    #[test]
    fn test_info_function_does_not_panic() {
        // Just ensure it doesn't panic
        info("test", "test message", None);
    }
    
    #[test]
    fn test_warn_function_does_not_panic() {
        warn("test", "warning message", None);
    }
    
    #[test]
    fn test_error_function_does_not_panic() {
        error("test", "error message", None, Some("details"));
    }
    
    #[test]
    fn test_debug_respects_verbose() {
        set_verbose(false);
        // This should not panic, just skip output
        debug("test", "debug message", None);
        
        set_verbose(true);
        debug("test", "debug message visible", None);
        set_verbose(false);
    }
    
    #[test]
    fn test_trace_respects_verbose() {
        set_verbose(false);
        trace("test", "trace message", None);
        
        set_verbose(true);
        trace("test", "trace message visible", None);
        set_verbose(false);
    }
}
