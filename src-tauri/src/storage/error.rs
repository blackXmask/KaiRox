//! Storage errors shaped to `schemas/error.schema.json`.
//!
//! Every failure surfaced to the frontend carries `code`, `message`,
//! `details` and `retryable` so callers never have to parse free text.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageError {
    pub schema_version: u32,
    pub code: String,
    pub message: String,
    pub details: serde_json::Value,
    pub retryable: bool,
}

impl StorageError {
    pub fn new(code: &str, message: impl Into<String>, retryable: bool) -> Self {
        Self {
            schema_version: 1,
            code: code.to_string(),
            message: message.into(),
            details: serde_json::Value::Null,
            retryable,
        }
    }

    pub fn migration(version: i64, message: impl Into<String>) -> Self {
        let mut err = Self::new("MIGRATION_FAILED", message, false);
        err.details = serde_json::json!({ "version": version });
        err
    }

    pub fn query(message: impl Into<String>) -> Self {
        Self::new("STORAGE_QUERY_FAILED", message, false)
    }

    pub fn constraint(message: impl Into<String>) -> Self {
        Self::new("STORAGE_CONSTRAINT_VIOLATION", message, false)
    }

    /// Transient lock contention - safe to retry.
    pub fn busy(message: impl Into<String>) -> Self {
        Self::new("STORAGE_BUSY", message, true)
    }

    pub fn io(message: impl Into<String>) -> Self {
        Self::new("STORAGE_IO_FAILED", message, false)
    }

    pub fn not_found(entity: &str, id: &str) -> Self {
        let mut err = Self::new("STORAGE_NOT_FOUND", format!("{entity} not found: {id}"), false);
        err.details = serde_json::json!({ "entity": entity, "id": id });
        err
    }
}

impl std::fmt::Display for StorageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for StorageError {}

impl From<rusqlite::Error> for StorageError {
    fn from(err: rusqlite::Error) -> Self {
        use rusqlite::ErrorCode;
        use rusqlite::Error;

        match err {
            Error::SqliteFailure(ref ffi, ref detail) => {
                let text = detail
                    .clone()
                    .unwrap_or_else(|| format!("{:?}", ffi.code));
                match ffi.code {
                    ErrorCode::DatabaseBusy | ErrorCode::DatabaseLocked => Self::busy(text),
                    ErrorCode::ConstraintViolation => Self::constraint(text),
                    ErrorCode::ReadOnly | ErrorCode::CannotOpen | ErrorCode::DiskFull => {
                        Self::io(text)
                    }
                    _ => Self::query(text),
                }
            }
            other => Self::query(other.to_string()),
        }
    }
}
