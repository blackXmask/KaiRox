//! KAIROX persistence layer.
//!
//! Contract source of truth is `schemas/*.schema.json` at the repo root.
//! These types are the storage-side representation; they are intentionally
//! owned by the data/integration role so that the Windows collector and the
//! detection engine can both write through a single, stable interface.

pub mod database;
pub mod error;
pub mod migrations;
pub mod repositories;
pub mod rows;

pub use error::StorageError;

#[cfg(test)]
mod tests;

use rusqlite::Connection;
use std::path::Path;

/// Open the database at `path`, applying any pending migrations.
///
/// Creates the parent directory if needed. Safe to call more than once;
/// migrations are idempotent.
pub fn open_and_migrate(path: &Path) -> Result<Connection, StorageError> {
    let conn = database::open(path)?;
    migrations::run(&conn)?;
    Ok(conn)
}

/// Open an in-memory database with migrations applied.
/// Intended for tests only.
pub fn open_memory() -> Result<Connection, StorageError> {
    let conn = database::open_in_memory()?;
    migrations::run(&conn)?;
    Ok(conn)
}
