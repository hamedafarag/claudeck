// Full-stack plugin loader — discovers and mounts plugin server routes
import { readdirSync, existsSync, statSync, copyFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { userConfigDir, userPluginsDir } from "./paths.js";

export async function mountPluginRoutes(app, pluginsDir) {
  const dirs = [];

  // Built-in full-stack plugins (shipped with package)
  if (existsSync(pluginsDir)) {
    for (const name of readdirSync(pluginsDir)) {
      const dir = join(pluginsDir, name);
      if (statSync(dir).isDirectory()) {
        dirs.push({ name, dir, source: "builtin" });
      }
    }
  }

  // User full-stack plugins (~/.claudeck/plugins/<dir>/)
  const allowUserServer = process.env.CLAUDECK_USER_SERVER_PLUGINS === "true";
  if (existsSync(userPluginsDir)) {
    for (const name of readdirSync(userPluginsDir)) {
      const dir = join(userPluginsDir, name);
      if (!statSync(dir).isDirectory()) continue;
      if (dirs.some(d => d.name === name)) continue; // builtin wins
      dirs.push({ name, dir, source: "user" });
    }
  }

  for (const { name, dir, source } of dirs) {
    // Copy default config if plugin ships one and user doesn't have it yet
    const configSrc = join(dir, "config.json");
    const configDst = join(userConfigDir, `${name}-config.json`);
    if (existsSync(configSrc) && !existsSync(configDst)) {
      copyFileSync(configSrc, configDst);
      console.log(`Copied default config for plugin: ${name}`);
    }

    // Mount server routes if plugin has server.js
    const serverFile = join(dir, "server.js");
    if (existsSync(serverFile)) {
      if (source === "user" && !allowUserServer) {
        console.log(`Skipping server routes for user plugin: ${name} (set CLAUDECK_USER_SERVER_PLUGINS=true to enable)`);
        continue;
      }
      try {
        const mod = await import(pathToFileURL(serverFile).href);
        app.use(`/api/plugins/${name}`, mod.default);
        console.log(`Mounted plugin routes: /api/plugins/${name}`);
      } catch (err) {
        console.error(`Failed to load plugin server: ${name}`, err.message);
      }
    }
  }
}
