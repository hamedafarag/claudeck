// Centralized path resolution for CodeDeck
// All user data lives in ~/.codedeck/ (persists across NPX updates)
import { homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, existsSync, copyFileSync, readdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Package root (where defaults ship)
export const packageRoot = join(__dirname, "..");

// User data directory (override with CODEDECK_HOME for testing)
export const userDir = process.env.CODEDECK_HOME || join(homedir(), ".codedeck");
export const userConfigDir = join(userDir, "config");
export const userPluginsDir = join(userDir, "plugins");
export const dbPath = join(userDir, "data.db");

// Default config (ships with the package, read-only reference)
export const defaultConfigDir = join(packageRoot, "config");

// Built-in plugins (shipped with package, read-only)
export const builtinPluginsDir = join(packageRoot, "public/js/plugins");

// Config file helper
export function configPath(filename) {
  return join(userConfigDir, filename);
}

// ── Bootstrap ~/.codedeck/ on first import (synchronous) ────

mkdirSync(userConfigDir, { recursive: true });
mkdirSync(userPluginsDir, { recursive: true });

// Copy default config files if missing in user dir
if (existsSync(defaultConfigDir)) {
  for (const file of readdirSync(defaultConfigDir).filter(f => f.endsWith(".json"))) {
    const dest = join(userConfigDir, file);
    if (!existsSync(dest)) {
      copyFileSync(join(defaultConfigDir, file), dest);
      console.log(`Copied default ${file} to ${userConfigDir}`);
    }
  }
}

// Migrate existing data.db from package root (for existing users)
const packageDb = join(packageRoot, "data.db");
if (!existsSync(dbPath) && existsSync(packageDb)) {
  copyFileSync(packageDb, dbPath);
  for (const ext of ["-shm", "-wal"]) {
    const src = packageDb + ext;
    if (existsSync(src)) copyFileSync(src, dbPath + ext);
  }
  console.log(`Migrated database to ${dbPath}`);
}

// Migrate existing .env from package root
const userEnv = join(userDir, ".env");
const packageEnv = join(packageRoot, ".env");
if (!existsSync(userEnv) && existsSync(packageEnv)) {
  copyFileSync(packageEnv, userEnv);
  console.log(`Migrated .env to ${userDir}`);
}
