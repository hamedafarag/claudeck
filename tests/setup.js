// Global test setup
// Set CLAUDECK_HOME to a temp directory for test isolation
import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const testDir = mkdtempSync(join(tmpdir(), "claudeck-test-"));
process.env.CLAUDECK_HOME = testDir;
