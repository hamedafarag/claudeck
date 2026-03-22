// Skills Marketplace — SkillsMP integration routes
import { Router } from "express";
import { configPath } from "../paths.js";
import { readFile, writeFile, readdir, stat, mkdir, rm, rename } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { existsSync } from "fs";

const router = Router();

const SKILLSMP_BASE = "https://skillsmp.com/api/v1";
const KEY_PREFIX = "sk_live_skillsmp_";

// ── Helpers ─────────────────────────────────────────────

async function readSkillsConfig() {
  try {
    const raw = await readFile(configPath("skillsmp-config.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return { apiKey: "", defaultScope: "project", searchMode: "keyword" };
  }
}

async function writeSkillsConfig(config) {
  await writeFile(configPath("skillsmp-config.json"), JSON.stringify(config, null, 2));
}

function isActivated(config) {
  return typeof config.apiKey === "string" && config.apiKey.startsWith(KEY_PREFIX);
}

function maskKey(key) {
  if (!key || !key.startsWith(KEY_PREFIX)) return "";
  return KEY_PREFIX + "..." + key.slice(-4);
}

// ── Middleware: require valid API key ────────────────────

async function requireApiKey(req, res, next) {
  const config = await readSkillsConfig();
  if (!isActivated(config)) {
    return res.status(403).json({
      error: "Skills Marketplace not activated. Add your API key to get started.",
      code: "NO_API_KEY",
    });
  }
  req.skillsConfig = config;
  next();
}

// ── Config endpoints (always accessible) ────────────────

router.get("/config", async (_req, res) => {
  try {
    const config = await readSkillsConfig();
    res.json({
      activated: isActivated(config),
      apiKey: maskKey(config.apiKey),
      defaultScope: config.defaultScope || "project",
      searchMode: config.searchMode || "keyword",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/config", async (req, res) => {
  try {
    const { apiKey, defaultScope, searchMode } = req.body;
    const config = await readSkillsConfig();

    // Update non-key fields if provided
    if (defaultScope) config.defaultScope = defaultScope;
    if (searchMode) config.searchMode = searchMode;

    // Handle API key change
    if (apiKey !== undefined) {
      if (apiKey === "") {
        // Deactivate
        config.apiKey = "";
        await writeSkillsConfig(config);
        return res.json({ success: true, activated: false });
      }

      // Validate format
      if (!apiKey.startsWith(KEY_PREFIX)) {
        return res.status(400).json({
          error: "Invalid API key format. Key must start with 'sk_live_skillsmp_'",
          code: "INVALID_KEY",
        });
      }

      // Test the key with a lightweight call
      try {
        const testRes = await fetch(
          `${SKILLSMP_BASE}/skills/search?q=test&limit=1`,
          { headers: { Authorization: `Bearer ${apiKey}` } }
        );
        if (!testRes.ok) {
          const body = await testRes.json().catch(() => ({}));
          if (testRes.status === 401 || body?.error?.code === "INVALID_API_KEY") {
            return res.status(400).json({ error: "Invalid API key", code: "INVALID_KEY" });
          }
          return res.status(400).json({
            error: body?.error?.message || "API key validation failed",
            code: "VALIDATION_FAILED",
          });
        }
      } catch (fetchErr) {
        return res.status(400).json({
          error: "Could not reach SkillsMP to validate key: " + fetchErr.message,
          code: "NETWORK_ERROR",
        });
      }

      config.apiKey = apiKey;
    }

    await writeSkillsConfig(config);
    res.json({ success: true, activated: isActivated(config) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Search endpoints (gated) ────────────────────────────

router.get("/search", requireApiKey, async (req, res) => {
  try {
    const { q, page, limit, sortBy } = req.query;
    if (!q) return res.status(400).json({ error: "Search query (q) is required" });

    const params = new URLSearchParams({ q });
    if (page) params.set("page", page);
    if (limit) params.set("limit", limit);
    if (sortBy) params.set("sortBy", sortBy);

    const apiRes = await fetch(`${SKILLSMP_BASE}/skills/search?${params}`, {
      headers: { Authorization: `Bearer ${req.skillsConfig.apiKey}` },
    });

    const body = await apiRes.json();

    // Forward rate limit headers
    const remaining = apiRes.headers.get("X-RateLimit-Daily-Remaining");
    const dailyLimit = apiRes.headers.get("X-RateLimit-Daily-Limit");
    if (remaining) res.set("X-RateLimit-Daily-Remaining", remaining);
    if (dailyLimit) res.set("X-RateLimit-Daily-Limit", dailyLimit);

    res.status(apiRes.status).json(body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/ai-search", requireApiKey, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: "Search query (q) is required" });

    const apiRes = await fetch(`${SKILLSMP_BASE}/skills/ai-search?q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${req.skillsConfig.apiKey}` },
    });

    const body = await apiRes.json();

    const remaining = apiRes.headers.get("X-RateLimit-Daily-Remaining");
    const dailyLimit = apiRes.headers.get("X-RateLimit-Daily-Limit");
    if (remaining) res.set("X-RateLimit-Daily-Remaining", remaining);
    if (dailyLimit) res.set("X-RateLimit-Daily-Limit", dailyLimit);

    res.status(apiRes.status).json(body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GitHub URL parsing ──────────────────────────────────

export function parseGithubUrl(githubUrl) {
  // https://github.com/owner/repo/tree/branch/path/to/skill
  const match = githubUrl.match(
    /github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/
  );
  if (!match) return null;
  return { owner: match[1], repo: match[2], branch: match[3], path: match[4] };
}

function buildRawUrl(owner, repo, branch, path, filename) {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}/${filename}`;
}

async function fetchSkillFiles(owner, repo, branch, skillPath) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${skillPath}?ref=${branch}`;
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github.v3+json" },
  });
  if (!res.ok) {
    if (res.status === 403) throw new Error("GitHub API rate limit exceeded");
    throw new Error(`GitHub API error: ${res.status}`);
  }
  const items = await res.json();
  if (!Array.isArray(items)) return [];
  return items
    .filter((i) => i.type === "file")
    .map((i) => ({ name: i.name, download_url: i.download_url, type: i.type }));
}

// ── Install endpoint (gated) ────────────────────────────

const VALID_NAME = /^[a-z0-9][a-z0-9-]*$/;

// Normalize a skill name to a valid directory name: lowercase, alphanumeric + hyphens
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[_\s]+/g, "-")     // underscores/spaces → hyphens
    .replace(/[^a-z0-9-]/g, "")  // strip invalid chars
    .replace(/^-+|-+$/g, "")     // trim leading/trailing hyphens
    || "skill";
}

// Ensure SKILL.md has frontmatter with name/description (inject if missing)
function ensureFrontmatter(content, name, description) {
  const hasFm = /^---\n[\s\S]*?\n---/.test(content);
  if (hasFm) {
    // Check if description is missing in existing frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch && description) {
      const fm = fmMatch[1];
      if (!fm.match(/^description:/m)) {
        // Add description to existing frontmatter
        const newFm = fm.trimEnd() + `\ndescription: ${description}`;
        return content.replace(/^---\n[\s\S]*?\n---/, `---\n${newFm}\n---`);
      }
    }
    return content;
  }
  // No frontmatter — inject one
  const lines = [`name: ${name}`];
  if (description) lines.push(`description: ${description}`);
  return `---\n${lines.join("\n")}\n---\n\n${content}`;
}

router.post("/install", requireApiKey, async (req, res) => {
  try {
    const { githubUrl, name, scope, projectPath, description } = req.body;

    // Normalize name to valid directory format
    const dirName = normalizeName(name);
    if (!dirName) {
      return res.status(400).json({ error: "Invalid skill name." });
    }

    // Validate scope
    if (!["global", "project"].includes(scope)) {
      return res.status(400).json({ error: "Scope must be 'global' or 'project'" });
    }

    // Validate projectPath for project scope
    if (scope === "project") {
      if (!projectPath || !projectPath.startsWith("/") || projectPath.includes("..")) {
        return res.status(400).json({ error: "Invalid project path" });
      }
    }

    // Parse GitHub URL
    const parsed = parseGithubUrl(githubUrl);
    if (!parsed) {
      return res.status(400).json({ error: "Could not parse GitHub URL" });
    }

    // Determine target directory
    const targetDir =
      scope === "global"
        ? join(homedir(), ".claude", "skills", dirName)
        : join(projectPath, ".claude", "skills", dirName);

    // Create directory
    await mkdir(targetDir, { recursive: true });

    let filesCount = 0;

    // Try fetching all files from GitHub API first
    try {
      const files = await fetchSkillFiles(parsed.owner, parsed.repo, parsed.branch, parsed.path);
      for (const file of files) {
        if (!file.download_url) continue;
        const fileRes = await fetch(file.download_url);
        if (!fileRes.ok) continue;
        let content = await fileRes.text();
        // Normalize SKILL.md filename variations
        const isSkillMd = file.name.toUpperCase() === "SKILL.MD";
        const fileName = isSkillMd ? "SKILL.md" : file.name;
        // Ensure SKILL.md has frontmatter with description
        if (isSkillMd) {
          content = ensureFrontmatter(content, name, description);
        }
        await writeFile(join(targetDir, fileName), content);
        filesCount++;
      }
    } catch {
      // Fallback: just fetch SKILL.md directly via raw URL
      const rawUrl = buildRawUrl(parsed.owner, parsed.repo, parsed.branch, parsed.path, "SKILL.md");
      const fileRes = await fetch(rawUrl);
      if (!fileRes.ok) {
        // Try skill.md (lowercase)
        const altUrl = buildRawUrl(parsed.owner, parsed.repo, parsed.branch, parsed.path, "skill.md");
        const altRes = await fetch(altUrl);
        if (!altRes.ok) {
          return res.status(404).json({ error: "Could not find SKILL.md in the repository" });
        }
        const content = ensureFrontmatter(await altRes.text(), name, description);
        await writeFile(join(targetDir, "SKILL.md"), content);
      } else {
        const content = ensureFrontmatter(await fileRes.text(), name, description);
        await writeFile(join(targetDir, "SKILL.md"), content);
      }
      filesCount = 1;
    }

    res.json({ success: true, path: targetDir, filesCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Uninstall endpoint (gated) ──────────────────────────

router.delete("/:name", requireApiKey, async (req, res) => {
  try {
    const { name } = req.params;
    const { scope, projectPath } = req.query;

    if (!VALID_NAME.test(name)) {
      return res.status(400).json({ error: "Invalid skill name" });
    }

    const skillDir =
      scope === "global"
        ? join(homedir(), ".claude", "skills", name)
        : join(projectPath, ".claude", "skills", name);

    // Safety check: verify it's a skill directory
    const hasSkill =
      existsSync(join(skillDir, "SKILL.md")) ||
      existsSync(join(skillDir, "SKILL.md.disabled"));

    if (!hasSkill) {
      return res.status(404).json({ error: "Skill not found" });
    }

    await rm(skillDir, { recursive: true, force: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Toggle endpoint (gated) ────────────────────────────

router.put("/:name/toggle", requireApiKey, async (req, res) => {
  try {
    const { name } = req.params;
    const { scope, projectPath } = req.query;

    const skillDir =
      scope === "global"
        ? join(homedir(), ".claude", "skills", name)
        : join(projectPath, ".claude", "skills", name);

    const enabledPath = join(skillDir, "SKILL.md");
    const disabledPath = join(skillDir, "SKILL.md.disabled");

    if (existsSync(enabledPath)) {
      await rename(enabledPath, disabledPath);
      res.json({ success: true, enabled: false });
    } else if (existsSync(disabledPath)) {
      await rename(disabledPath, enabledPath);
      res.json({ success: true, enabled: true });
    } else {
      res.status(404).json({ error: "Skill not found" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Installed skills list (gated) ───────────────────────

router.get("/installed", requireApiKey, async (req, res) => {
  try {
    const { projectPath } = req.query;
    const skills = [];

    async function scanDir(baseDir, scope) {
      try {
        const entries = await readdir(baseDir);
        for (const entry of entries) {
          try {
            const entryPath = join(baseDir, entry);
            const s = await stat(entryPath);
            if (!s.isDirectory()) continue;

            const enabledPath = join(entryPath, "SKILL.md");
            const disabledPath = join(entryPath, "SKILL.md.disabled");
            let skillFile = null;
            let enabled = true;

            if (existsSync(enabledPath)) {
              skillFile = enabledPath;
            } else if (existsSync(disabledPath)) {
              skillFile = disabledPath;
              enabled = false;
            } else {
              continue;
            }

            const content = await readFile(skillFile, "utf-8");
            let name = entry;
            let description = "";

            // Parse YAML frontmatter
            const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
            if (fmMatch) {
              const fm = fmMatch[1];
              const nameMatch = fm.match(/^name:\s*(.+)$/m);
              const descMatch = fm.match(/^description:\s*(.+)$/m);
              if (nameMatch) name = nameMatch[1].trim();
              if (descMatch) description = descMatch[1].trim();
            }

            skills.push({ name, dirName: entry, description, scope, enabled, path: entryPath });
          } catch { /* skip unreadable */ }
        }
      } catch { /* directory doesn't exist */ }
    }

    // Scan global skills
    await scanDir(join(homedir(), ".claude", "skills"), "global");

    // Scan project skills
    if (projectPath) {
      await scanDir(join(projectPath, ".claude", "skills"), "project");
    }

    res.json(skills);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
