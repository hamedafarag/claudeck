// Database adapter proxy — re-exports the active backend.
// Phase 1: SQLite only. Phase 2: read config to choose adapter.
export * from "./db/sqlite.js";
