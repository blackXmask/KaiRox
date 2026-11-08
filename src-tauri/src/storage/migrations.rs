//! Versioned SQL migrations.
//!
//! Rules:
//! - never edit a migration that has been applied; add a new numbered file
//! - each migration runs inside its own transaction
//! - embedded with include_str! so migrations ship inside the binary

use crate::storage::error::StorageError;
use rusqlite::Connection;
use std::collections::HashSet;

const MIGRATIONS: &[(i64, &str)] = &[(1, include_str!("migrations/0001_init.sql"))];

/// Apply any migrations that have not yet run.
pub fn run(conn: &Connection) -> Result<(), StorageError> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
             version    INTEGER PRIMARY KEY,
             applied_at TEXT NOT NULL
         );",
    )?;

    let applied: HashSet<i64> = {
        let mut stmt = conn.prepare("SELECT version FROM schema_migrations")?;
        let rows = stmt.query_map([], |row| row.get::<_, i64>(0))?;
        rows.collect::<Result<HashSet<_>, _>>()?
    };

    for (version, sql) in MIGRATIONS {
        if applied.contains(version) {
            continue;
        }

        conn.execute_batch("BEGIN IMMEDIATE;")?;
        if let Err(err) = conn.execute_batch(sql) {
            let _ = conn.execute_batch("ROLLBACK;");
            return Err(StorageError::migration(*version, err.to_string()));
        }

        if let Err(err) = conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, ?2)",
            rusqlite::params![version, crate::storage::database::now_iso()],
        ) {
            let _ = conn.execute_batch("ROLLBACK;");
            return Err(StorageError::migration(*version, err.to_string()));
        }

        conn.execute_batch("COMMIT;")?;
    }

    Ok(())
}

/// Versions recorded as applied. Useful for tests and diagnostics.
pub fn applied_versions(conn: &Connection) -> Result<Vec<i64>, StorageError> {
    let mut stmt = conn.prepare("SELECT version FROM schema_migrations ORDER BY version")?;
    let rows = stmt.query_map([], |row| row.get::<_, i64>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Total migration count compiled into this build.
pub fn defined_count() -> usize {
    MIGRATIONS.len()
}
