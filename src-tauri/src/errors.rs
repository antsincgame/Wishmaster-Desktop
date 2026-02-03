//! Wishmaster Desktop - Error Types
//!
//! This module defines custom error types for the application.
//! Using thiserror for ergonomic error definitions.

use thiserror::Error;

// ==================== LLM ERRORS ====================

/// Errors related to LLM operations
#[derive(Error, Debug)]
pub enum LlmError {
    #[error("LLM backend not initialized")]
    BackendNotInitialized,

    #[error("No model loaded")]
    ModelNotLoaded,

    #[error("Model file not found: {0}")]
    ModelNotFound(String),

    #[error("Failed to load model: {0}")]
    LoadError(String),

    #[error("Failed to create context: {0}")]
    ContextError(String),

    #[error("Tokenization failed: {0}")]
    TokenizationError(String),

    #[error("Generation failed: {0}")]
    GenerationError(String),

    #[error("Failed to acquire lock: {0}")]
    LockError(String),
}

impl From<LlmError> for String {
    fn from(err: LlmError) -> String {
        err.to_string()
    }
}

// ==================== DATABASE ERRORS ====================

/// Errors related to database operations
#[derive(Error, Debug)]
pub enum DbError {
    #[error("Database not initialized")]
    NotInitialized,

    #[error("Database lock poisoned")]
    LockPoisoned,

    #[error("SQL error: {0}")]
    SqlError(String),

    #[error("Record not found: {0}")]
    NotFound(String),

    #[error("Invalid data: {0}")]
    InvalidData(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),
}

impl From<rusqlite::Error> for DbError {
    fn from(err: rusqlite::Error) -> Self {
        DbError::SqlError(err.to_string())
    }
}

impl From<serde_json::Error> for DbError {
    fn from(err: serde_json::Error) -> Self {
        DbError::SerializationError(err.to_string())
    }
}

impl From<DbError> for String {
    fn from(err: DbError) -> String {
        err.to_string()
    }
}

// ==================== VOICE ERRORS ====================

/// Errors related to voice operations
#[derive(Error, Debug)]
pub enum VoiceError {
    #[error("Recording not in progress")]
    NotRecording,

    #[error("Already recording")]
    AlreadyRecording,

    #[error("TTS not available: {0}")]
    TtsNotAvailable(String),

    #[error("STT not available: {0}")]
    SttNotAvailable(String),

    #[error("Audio error: {0}")]
    AudioError(String),

    #[error("Voice profile not found: {0}")]
    ProfileNotFound(i64),

    #[error("Recording not found: {0}")]
    RecordingNotFound(i64),
}

impl From<VoiceError> for String {
    fn from(err: VoiceError) -> String {
        err.to_string()
    }
}

// ==================== APP ERRORS ====================

/// General application errors
#[derive(Error, Debug)]
pub enum AppError {
    #[error("LLM error: {0}")]
    Llm(#[from] LlmError),

    #[error("Database error: {0}")]
    Database(#[from] DbError),

    #[error("Voice error: {0}")]
    Voice(#[from] VoiceError),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Invalid argument: {0}")]
    InvalidArgument(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl From<AppError> for String {
    fn from(err: AppError) -> String {
        err.to_string()
    }
}

// ==================== RESULT TYPE ALIASES ====================

/// Result type for LLM operations
pub type LlmResult<T> = Result<T, LlmError>;

/// Result type for database operations
pub type DbResult<T> = Result<T, DbError>;

/// Result type for voice operations
pub type VoiceResult<T> = Result<T, VoiceError>;

/// Result type for general app operations
pub type AppResult<T> = Result<T, AppError>;

// ==================== TESTS ====================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_llm_error_display() {
        let err = LlmError::ModelNotFound("/path/to/model.gguf".to_string());
        assert_eq!(err.to_string(), "Model file not found: /path/to/model.gguf");
    }

    #[test]
    fn test_db_error_from_rusqlite() {
        // Create a mock rusqlite error
        let sqlite_err = rusqlite::Error::InvalidQuery;
        let db_err: DbError = sqlite_err.into();
        assert!(matches!(db_err, DbError::SqlError(_)));
    }

    #[test]
    fn test_app_error_from_llm_error() {
        let llm_err = LlmError::BackendNotInitialized;
        let app_err: AppError = llm_err.into();
        assert!(matches!(app_err, AppError::Llm(_)));
    }

    #[test]
    fn test_error_to_string_conversion() {
        let err = LlmError::ModelNotLoaded;
        let s: String = err.into();
        assert_eq!(s, "No model loaded");
    }
}
