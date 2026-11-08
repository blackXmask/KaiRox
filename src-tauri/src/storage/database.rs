//! Connection management and pragmas.
//!
//! WAL is mandatory: the collector writes while the dashboard reads.
//! `foreign_keys = ON` is mandatory: it is OFF by default in SQLite, so
//! without it every ON DELETE CASCADE in the schema silently does nothing.

use crate::storage::StorageError;
use rusqlite::Connection;
use std::path::Path;

/// Open (creating if necessary) and configure a database file.
pub fn open(path: &Path) -> Result<Connection, StorageError> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| {
                StorageError::io(format!("cannot create database directory {}: {e}", parent.display()))
            })?;
        }
    }

    let conn = Connection::open(path).map_err(|e| {
        StorageError::io(format!("cannot open database {}: {e}", path.display()))
    })?;

    configure(&conn)?;
    Ok(conn)
}

/// Open an in-memory database. Tests only.
pub fn open_in_memory() -> Result<Connection, StorageError> {
    let conn = Connection::open_in_memory()?;
    configure(&conn)?;
    Ok(conn)
}

fn configure(conn: &Connection) -> Result<(), StorageError> {
    // `PRAGMA journal_mode` returns the resulting mode as a row, so it must be
    // read back rather than executed as a silent statement. In-memory databases
    // stay on "memory"; that is expected.
    let _: String = conn.query_row("PRAGMA journal_mode = WAL", [], |row| row.get(0))?;

    conn.execute_batch(
        "
        PRAGMA foreign_keys = ON;
        PRAGMA synchronous = NORMAL;
        PRAGMA busy_timeout = 5000;
        ",
    )?;

    Ok(())
}

/// Run `body` inside a single immediate transaction, rolling back on error.
///
/// Uses explicit BEGIN/COMMIT so the repository API can stay on `&Connection`
/// and still get atomicity for batch writes.
pub fn in_transaction<F, T>(conn: &Connection, body: F) -> Result<T, StorageError>
where
    F: FnOnce(&Connection) -> Result<T, StorageError>,
{
    conn.execute_batch("BEGIN IMMEDIATE;")?;
    match body(conn) {
        Ok(value) => {
            conn.execute_batch("COMMIT;")?;
            Ok(value)
        }
        Err(err) => {
            // Rollback failure must not mask the original error.
            let _ = conn.execute_batch("ROLLBACK;");
            Err(err)
        }
    }
}

/// Current UTC timestamp in RFC 3339 / ISO-8601 form.
pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
