// Marketplace routes — fetch community plugin registry, install/uninstall plugins
import { Router } from "express";
import { join } from "path";
import { existsSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { pathToFileURL } from "url";
import { userPluginsDir, userConfigDir, packageRoot } from "../paths.js";

const router = Router();

// Reference to Express app (set during mount for hot-mounting plugin server routes)
let _app = null;
export function setApp(app) { _app = app; }

// Track hot-mounted plugin routers so we can swap/remove them on uninstall
const mountedPluginRouters = new Map();

// ── Config ──────────────────────────────────────────────────
const MARKETPLACE_REPO = "hamedafarag/claudeck-marketplace";
const MARKETPLACE_BRANCH = "main";
const MARKETPLACE_FILE = "marketplace.json";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let registryCache = null;
let registryCacheTime = 0;

// ── GET /api/marketplace — fetch registry ───────────────────
router.get("/", async (req, res) => {
  try {
    const now = Date.now();
    const force = req.query.refresh === "true";

    if (!force && registryCache && now - registryCacheTime < CACHE_TTL) {
      return res.json(enrichRegistry(registryCache));
    }

    const url = `https://raw.githubusercontent.com/${MARKETPLACE_REPO}/${MARKETPLACE_BRANCH}/${MARKETPLACE_FILE}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      // Return cached data if available, empty otherwise
      if (registryCache) return res.json(enrichRegistry(registryCache));
      return res.json({ name: "claudeck-marketplace", version: "0.0.0", plugins: [] });
    }

    registryCache = await resp.json();
    registryCacheTime = now;
    res.json(enrichRegistry(registryCache));
  } catch (err) {
    console.error("Marketplace fetch error:", err.message);
    if (registryCache) return res.json(enrichRegistry(registryCache));
    res.json({ name: "claudeck-marketplace", version: "0.0.0", plugins: [] });
  }
});

// ── GET /api/marketplace/installed — list installed community plugins ──
router.get("/installed", (req, res) => {
  const installed = [];
  if (!existsSync(userPluginsDir)) return res.json(installed);

  for (const name of readdirSync(userPluginsDir)) {
    const dir = join(userPluginsDir, name);
    if (!statSync(dir).isDirectory()) continue;
    const manifestPath = join(dir, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      // Only list community plugins (those with _marketplace marker)
      const metaPath = join(dir, ".marketplace");
      if (existsSync(metaPath)) {
        const meta = JSON.parse(readFileSync(metaPath, "utf8"));
        installed.push({ ...manifest, installedFrom: meta.source, installedAt: meta.installedAt });
      }
    } catch {}
  }
  res.json(installed);
});

// Validate plugin ID to prevent path traversal
const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/;

// ── POST /api/marketplace/install — install a community plugin ──
router.post("/install", async (req, res) => {
  const { id, repo, source } = req.body;
  if (!id) return res.status(400).json({ error: "Plugin id required" });
  if (!SAFE_ID.test(id)) return res.status(400).json({ error: "Invalid plugin id" });

  const pluginDir = join(userPluginsDir, id);

  try {
    // Determine download source
    let downloadUrl;
    let isMonorepo = false;

    if (source && source.startsWith("./")) {
      // Monorepo plugin — download from marketplace repo subdirectory
      isMonorepo = true;
      downloadUrl = `https://api.github.com/repos/${MARKETPLACE_REPO}/tarball/${MARKETPLACE_BRANCH}`;
    } else if (repo) {
      // External repo — download tarball
      downloadUrl = `https://api.github.com/repos/${repo}/tarball`;
    } else {
      return res.status(400).json({ error: "Plugin must have 'repo' or 'source'" });
    }

    // Download tarball
    const resp = await fetch(downloadUrl, {
      headers: { "Accept": "application/vnd.github+json", "User-Agent": "claudeck" },
      redirect: "follow",
    });
    if (!resp.ok) {
      return res.status(502).json({ error: `GitHub download failed: ${resp.status} ${resp.statusText}` });
    }

    // Write tarball to temp file
    const tmpTar = join(userPluginsDir, `_tmp_${id}.tar.gz`);
    const tmpDir = join(userPluginsDir, `_tmp_${id}`);
    const buffer = Buffer.from(await resp.arrayBuffer());
    writeFileSync(tmpTar, buffer);

    // Extract tarball
    mkdirSync(tmpDir, { recursive: true });
    const { execSync } = await import("child_process");
    execSync(`tar -xzf "${tmpTar}" -C "${tmpDir}" --no-same-owner --no-same-permissions`, { stdio: "pipe" });

    // Find extracted content (tarball has a root dir like owner-repo-sha/)
    const extracted = readdirSync(tmpDir);
    const rootDir = extracted.length === 1 ? join(tmpDir, extracted[0]) : tmpDir;

    // Determine source directory within extracted content
    let sourceDir;
    if (isMonorepo) {
      // For monorepo plugins, navigate to the plugin subdirectory
      const subPath = source.replace("./", "");
      sourceDir = join(rootDir, subPath);
      if (!existsSync(sourceDir) || !existsSync(join(sourceDir, "client.js"))) {
        // Cleanup
        rmSync(tmpTar, { force: true });
        rmSync(tmpDir, { recursive: true, force: true });
        return res.status(404).json({ error: `Plugin directory not found in marketplace repo: ${subPath}` });
      }
    } else {
      // External repo — root is the plugin
      sourceDir = rootDir;
      if (!existsSync(join(sourceDir, "client.js"))) {
        rmSync(tmpTar, { force: true });
        rmSync(tmpDir, { recursive: true, force: true });
        return res.status(400).json({ error: "Plugin repo must contain client.js at root" });
      }
    }

    // Remove old installation if exists
    if (existsSync(pluginDir)) {
      rmSync(pluginDir, { recursive: true, force: true });
    }

    // Move plugin to final location
    const { cpSync } = await import("fs");
    cpSync(sourceDir, pluginDir, { recursive: true });

    // Patch server.js imports: rewrite relative db.js imports to absolute path
    const serverFilePath = join(pluginDir, "server.js");
    if (existsSync(serverFilePath)) {
      try {
        let code = readFileSync(serverFilePath, "utf8");
        const dbAbsolute = pathToFileURL(join(packageRoot, "db.js")).href;
        // Replace relative imports like ../../db.js, ../db.js, etc.
        code = code.replace(
          /from\s+["'](?:\.\.\/)+db\.js["']/g,
          `from "${dbAbsolute}"`
        );
        writeFileSync(serverFilePath, code);
      } catch (err) {
        console.warn(`Could not patch server.js imports for ${id}:`, err.message);
      }
    }

    // Write marketplace metadata
    writeFileSync(join(pluginDir, ".marketplace"), JSON.stringify({
      source: repo || source,
      installedAt: new Date().toISOString(),
      marketplace: MARKETPLACE_REPO,
    }));

    // Copy default config if plugin ships one
    const configSrc = join(pluginDir, "config.json");
    const configDst = join(userConfigDir, `${id}-config.json`);
    if (existsSync(configSrc) && !existsSync(configDst)) {
      const { copyFileSync } = await import("fs");
      copyFileSync(configSrc, configDst);
    }

    // Cleanup temp files
    rmSync(tmpTar, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });

    // Read installed manifest
    const manifestPath = join(pluginDir, "manifest.json");
    let manifest = null;
    if (existsSync(manifestPath)) {
      try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); } catch {}
    }

    // Hot-mount server routes if plugin has server.js and app is available
    let serverMounted = false;
    const serverFile = join(pluginDir, "server.js");
    if (_app && existsSync(serverFile)) {
      const allowUserServer = process.env.CLAUDECK_USER_SERVER_PLUGINS === "true";
      if (allowUserServer) {
        try {
          // Use cache-busting query to force re-import on reinstall
          const mod = await import(pathToFileURL(serverFile).href + `?t=${Date.now()}`);

          // If already mounted, swap the inner handler; otherwise mount a wrapper
          if (mountedPluginRouters.has(id)) {
            mountedPluginRouters.get(id).inner = mod.default;
          } else {
            const wrapper = { inner: mod.default };
            const wrapperRouter = Router();
            wrapperRouter.use((req, res, next) => {
              if (wrapper.inner) wrapper.inner(req, res, next);
              else next();
            });
            _app.use(`/api/plugins/${id}`, wrapperRouter);
            mountedPluginRouters.set(id, wrapper);
          }
          serverMounted = true;
          console.log(`Hot-mounted plugin routes: /api/plugins/${id}`);
        } catch (err) {
          console.error(`Failed to hot-mount plugin server: ${id}`, err.message);
        }
      }
    }

    res.json({ ok: true, id, manifest, serverMounted });
  } catch (err) {
    // Cleanup on error
    const tmpTar = join(userPluginsDir, `_tmp_${id}.tar.gz`);
    const tmpDir = join(userPluginsDir, `_tmp_${id}`);
    rmSync(tmpTar, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
    console.error(`Marketplace install error (${id}):`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/marketplace/uninstall — remove a community plugin ──
router.post("/uninstall", (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "Plugin id required" });
  if (!SAFE_ID.test(id)) return res.status(400).json({ error: "Invalid plugin id" });

  const pluginDir = join(userPluginsDir, id);
  const marketplaceMeta = join(pluginDir, ".marketplace");

  // Only allow uninstalling community plugins (has .marketplace marker)
  if (!existsSync(marketplaceMeta)) {
    return res.status(400).json({ error: "Plugin is not a community plugin or not installed" });
  }

  try {
    rmSync(pluginDir, { recursive: true, force: true });

    // Disable hot-mounted server routes (wrapper stays but inner is nulled)
    if (mountedPluginRouters.has(id)) {
      mountedPluginRouters.get(id).inner = null;
      console.log(`Disabled plugin routes: /api/plugins/${id}`);
    }

    res.json({ ok: true, id });
  } catch (err) {
    console.error(`Marketplace uninstall error (${id}):`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Helpers ─────────────────────────────────────────────────

/** Enrich registry with installation status and built-in detection */
function enrichRegistry(registry) {
  const builtinDir = join(packageRoot, "plugins");
  const enriched = { ...registry, plugins: [] };
  for (const plugin of registry.plugins || []) {
    // Check if this plugin ships as a built-in
    const isBuiltin = existsSync(join(builtinDir, plugin.id, "client.js"));

    const dir = join(userPluginsDir, plugin.id);
    const installed = existsSync(join(dir, ".marketplace"));
    let installedVersion = null;
    if (installed) {
      const mPath = join(dir, "manifest.json");
      if (existsSync(mPath)) {
        try { installedVersion = JSON.parse(readFileSync(mPath, "utf8")).version; } catch {}
      }
    }
    enriched.plugins.push({
      ...plugin,
      isBuiltin,
      installed,
      installedVersion,
      updateAvailable: installed && installedVersion && semverNewer(plugin.version, installedVersion),
    });
  }
  return enriched;
}

/** Return true if `a` is strictly newer than `b` (simple semver comparison) */
function semverNewer(a, b) {
  const pa = (a || "0.0.0").split(".").map(Number);
  const pb = (b || "0.0.0").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

export default router;
