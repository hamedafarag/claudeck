import { Router } from "express";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

// Cache for tips.json
let tipsData = null;

function loadTips() {
  if (!tipsData) {
    const filePath = join(__dirname, "../../public/data/tips.json");
    tipsData = JSON.parse(readFileSync(filePath, "utf-8"));
  }
  return tipsData;
}

// GET /api/tips — serve tips data
router.get("/", (req, res) => {
  try {
    res.json(loadTips());
  } catch (err) {
    res.status(500).json({ error: "Failed to load tips" });
  }
});

// RSS proxy cache: url -> { data, timestamp }
const rssCache = new Map();
const RSS_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function stripHtml(str) {
  return str
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&#8212;/g, "—")
    .replace(/&#\d+;/g, "")
    .replace(/<[^>]*>/g, "")  // strip any decoded tags
    .replace(/\s+/g, " ")
    .trim();
}

// Simple regex-based XML parser — handles RSS 2.0 (<item>) and Atom (<entry>)
function parseRssXml(xml) {
  const items = [];

  // Helper to extract tag content (CDATA or plain)
  const getTag = (block, tag) => {
    const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i"))
      || block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
    return m ? m[1].trim() : "";
  };

  // Helper to extract Atom <link href="..."/>
  const getAtomLink = (block) => {
    const m = block.match(/<link[^>]*href="([^"]*)"[^>]*rel="alternate"/i)
      || block.match(/<link[^>]*rel="alternate"[^>]*href="([^"]*)"/i)
      || block.match(/<link[^>]*href="([^"]*)"/i);
    return m ? m[1].trim() : "";
  };

  // Try RSS 2.0 first (<item>)
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < 20) {
    const block = match[1];
    items.push({
      title: stripHtml(getTag(block, "title")),
      link: getTag(block, "link"),
      pubDate: getTag(block, "pubDate"),
      description: stripHtml(getTag(block, "description")).slice(0, 200),
    });
  }

  // Fall back to Atom (<entry>) if no RSS items found
  if (items.length === 0) {
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    while ((match = entryRegex.exec(xml)) !== null && items.length < 20) {
      const block = match[1];
      const desc = getTag(block, "summary") || getTag(block, "content");
      items.push({
        title: stripHtml(getTag(block, "title")),
        link: getAtomLink(block) || getTag(block, "link"),
        pubDate: getTag(block, "published") || getTag(block, "updated"),
        description: stripHtml(desc).slice(0, 200),
      });
    }
  }

  return items;
}

// GET /api/tips/rss?url=<encoded> — proxy RSS feed
router.get("/rss", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "url parameter required" });

  // Check cache
  const cached = rssCache.get(url);
  if (cached && Date.now() - cached.timestamp < RSS_CACHE_TTL) {
    return res.json({ items: cached.data });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "claudeck/1.0" },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(502).json({ error: `Feed returned ${response.status}` });
    }

    const xml = await response.text();
    const items = parseRssXml(xml);

    // Cache the result
    rssCache.set(url, { data: items, timestamp: Date.now() });

    res.json({ items });
  } catch (err) {
    if (err.name === "AbortError") {
      return res.status(504).json({ error: "Feed request timed out" });
    }
    res.status(502).json({ error: "Failed to fetch feed" });
  }
});

export default router;
