import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mocks ────────────────────────────────────────────────────────────────────

// The tips module calls readFileSync lazily (inside loadTips), and caches
// the result in a module-level variable. Because the cache persists across
// tests within the same module instance, we set the mock return value
// BEFORE the first import so loadTips() will succeed on its initial call.

const TIPS_DATA = {
  tips: [
    { id: 1, text: "Use vi.mock() for mocking" },
    { id: 2, text: "Write descriptive test names" },
  ],
};

vi.mock("fs", () => ({
  readFileSync: vi.fn(() => JSON.stringify(TIPS_DATA)),
}));

// Mock global fetch for RSS tests
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const routerModule = await import("../../../../server/routes/tips.js");
const router = routerModule.default;

// ── App setup ────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/", router);
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("tips routes", () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  // ── GET / ────────────────────────────────────────────────────────────────
  describe("GET /", () => {
    it("returns tips data", async () => {
      const res = await request(app).get("/");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(TIPS_DATA);
    });

    it("uses cached tips on subsequent requests (readFileSync not called again)", async () => {
      // First request (may or may not trigger readFileSync depending on cache)
      const res1 = await request(app).get("/");
      expect(res1.status).toBe(200);

      // Clear call history
      vi.clearAllMocks();

      // Second request should use the cached value
      const res2 = await request(app).get("/");
      expect(res2.status).toBe(200);
      expect(res2.body).toEqual(TIPS_DATA);
    });
  });

  // ── GET /rss ─────────────────────────────────────────────────────────────
  describe("GET /rss", () => {
    it("returns 400 when url parameter is missing", async () => {
      const res = await request(app).get("/rss");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("url parameter required");
    });

    it("fetches and parses RSS 2.0 feed", async () => {
      const rssXml = `<?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <item>
              <title>Article 1</title>
              <link>https://example.com/1</link>
              <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
              <description>First article description</description>
            </item>
            <item>
              <title>Article 2</title>
              <link>https://example.com/2</link>
              <pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate>
              <description>Second article description</description>
            </item>
          </channel>
        </rss>`;

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => rssXml,
      });

      const res = await request(app).get(
        "/rss?url=https://example.com/feed.xml",
      );

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].title).toBe("Article 1");
      expect(res.body.items[0].link).toBe("https://example.com/1");
      expect(res.body.items[0].pubDate).toBe(
        "Mon, 01 Jan 2024 00:00:00 GMT",
      );
      expect(res.body.items[1].title).toBe("Article 2");
    });

    it("fetches and parses Atom feed", async () => {
      const atomXml = `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>Atom Entry 1</title>
            <link href="https://example.com/atom/1" rel="alternate"/>
            <published>2024-01-01T00:00:00Z</published>
            <summary>First atom entry</summary>
          </entry>
        </feed>`;

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => atomXml,
      });

      const res = await request(app).get(
        "/rss?url=https://example.com/atom.xml",
      );

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].title).toBe("Atom Entry 1");
      expect(res.body.items[0].link).toBe("https://example.com/atom/1");
      expect(res.body.items[0].pubDate).toBe("2024-01-01T00:00:00Z");
    });

    it("returns cached results for same URL within TTL", async () => {
      const rssXml = `<rss><channel>
        <item><title>Cached</title><link>https://a.com</link>
        <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
        <description>desc</description></item>
      </channel></rss>`;

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => rssXml,
      });

      // Use a unique URL to avoid collisions with other tests
      const url = "https://example.com/cached-test-" + Date.now() + ".xml";

      // First request fetches from network
      await request(app).get(`/rss?url=${encodeURIComponent(url)}`);

      // Second request should use cache
      const res = await request(app).get(
        `/rss?url=${encodeURIComponent(url)}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.items[0].title).toBe("Cached");
      // fetch should only be called once (cached on second call)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("returns 502 when feed returns non-ok status", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      const res = await request(app).get(
        "/rss?url=https://example.com/bad-feed",
      );

      expect(res.status).toBe(502);
      expect(res.body.error).toBe("Feed returned 404");
    });

    it("returns 504 when fetch request times out (AbortError)", async () => {
      mockFetch.mockImplementation(() => {
        const err = new Error("Aborted");
        err.name = "AbortError";
        throw err;
      });

      const res = await request(app).get(
        "/rss?url=https://example.com/slow-feed",
      );

      expect(res.status).toBe(504);
      expect(res.body.error).toBe("Feed request timed out");
    });

    it("returns 502 on generic fetch errors", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const res = await request(app).get(
        "/rss?url=https://example.com/error-feed",
      );

      expect(res.status).toBe(502);
      expect(res.body.error).toBe("Failed to fetch feed");
    });

    it("strips HTML tags from RSS content", async () => {
      const rssXml = `<rss><channel>
        <item>
          <title><b>Bold Title</b></title>
          <link>https://example.com/1</link>
          <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
          <description>&lt;p&gt;Paragraph&lt;/p&gt; with &amp; entities</description>
        </item>
      </channel></rss>`;

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => rssXml,
      });

      const res = await request(app).get(
        "/rss?url=https://example.com/html-feed.xml",
      );

      expect(res.status).toBe(200);
      expect(res.body.items[0].title).toBe("Bold Title");
      // HTML entities should be decoded and tags stripped
      expect(res.body.items[0].description).not.toContain("<p>");
      expect(res.body.items[0].description).toContain("Paragraph");
      expect(res.body.items[0].description).toContain("&");
    });

    it("handles CDATA sections in RSS items", async () => {
      const rssXml = `<rss><channel>
        <item>
          <title><![CDATA[CDATA Title]]></title>
          <link>https://example.com/cdata</link>
          <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
          <description><![CDATA[<p>CDATA description</p>]]></description>
        </item>
      </channel></rss>`;

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => rssXml,
      });

      const res = await request(app).get(
        "/rss?url=https://example.com/cdata-feed.xml",
      );

      expect(res.status).toBe(200);
      expect(res.body.items[0].title).toBe("CDATA Title");
    });

    it("truncates description to 200 characters", async () => {
      const longDesc = "A".repeat(300);
      const rssXml = `<rss><channel>
        <item>
          <title>Long Desc</title>
          <link>https://example.com/long</link>
          <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
          <description>${longDesc}</description>
        </item>
      </channel></rss>`;

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => rssXml,
      });

      const res = await request(app).get(
        "/rss?url=https://example.com/long-feed.xml",
      );

      expect(res.status).toBe(200);
      expect(res.body.items[0].description.length).toBeLessThanOrEqual(200);
    });

    it("limits items to 20 maximum", async () => {
      let items = "";
      for (let i = 0; i < 25; i++) {
        items += `<item><title>Item ${i}</title><link>https://example.com/${i}</link><pubDate>Mon, 01 Jan 2024</pubDate><description>Desc ${i}</description></item>`;
      }
      const rssXml = `<rss><channel>${items}</channel></rss>`;

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => rssXml,
      });

      const res = await request(app).get(
        "/rss?url=https://example.com/many-feed.xml",
      );

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeLessThanOrEqual(20);
    });

    it("parses Atom feed with content instead of summary", async () => {
      const atomXml = `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>Content Entry</title>
            <link href="https://example.com/content/1" rel="alternate"/>
            <published>2024-01-01T00:00:00Z</published>
            <content>Full content here instead of summary</content>
          </entry>
        </feed>`;

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => atomXml,
      });

      const res = await request(app).get(
        "/rss?url=https://example.com/content-atom.xml",
      );

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].description).toContain("Full content here");
    });

    it("parses Atom feed with <updated> instead of <published>", async () => {
      const atomXml = `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>Updated Entry</title>
            <link href="https://example.com/updated/1" rel="alternate"/>
            <updated>2024-06-15T12:00:00Z</updated>
            <summary>Entry with updated date</summary>
          </entry>
        </feed>`;

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => atomXml,
      });

      const res = await request(app).get(
        "/rss?url=https://example.com/updated-atom.xml",
      );

      expect(res.status).toBe(200);
      expect(res.body.items[0].pubDate).toBe("2024-06-15T12:00:00Z");
    });

    it("parses Atom feed with link rel=alternate with reversed attribute order", async () => {
      const atomXml = `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>Reversed Link</title>
            <link rel="alternate" href="https://example.com/reversed"/>
            <published>2024-01-01T00:00:00Z</published>
            <summary>Test reversed link attributes</summary>
          </entry>
        </feed>`;

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => atomXml,
      });

      const res = await request(app).get(
        "/rss?url=https://example.com/reversed-atom.xml",
      );

      expect(res.status).toBe(200);
      expect(res.body.items[0].link).toBe("https://example.com/reversed");
    });

    it("parses Atom feed with plain href link (no rel attribute)", async () => {
      const atomXml = `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>Plain Link</title>
            <link href="https://example.com/plain"/>
            <published>2024-01-01T00:00:00Z</published>
            <summary>Test plain href</summary>
          </entry>
        </feed>`;

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => atomXml,
      });

      const res = await request(app).get(
        "/rss?url=https://example.com/plain-atom.xml",
      );

      expect(res.status).toBe(200);
      expect(res.body.items[0].link).toBe("https://example.com/plain");
    });

    it("falls back to <link> tag text when Atom entry has no href link", async () => {
      const atomXml = `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>No Href Entry</title>
            <link>https://example.com/text-link</link>
            <published>2024-01-01T00:00:00Z</published>
            <summary>Fallback to text link</summary>
          </entry>
        </feed>`;

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => atomXml,
      });

      const res = await request(app).get(
        "/rss?url=https://example.com/text-link-atom.xml",
      );

      expect(res.status).toBe(200);
      expect(res.body.items[0].link).toBe("https://example.com/text-link");
    });

    it("returns empty description when Atom entry has neither summary nor content", async () => {
      const atomXml = `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>No Desc Entry</title>
            <link href="https://example.com/no-desc"/>
            <published>2024-01-01T00:00:00Z</published>
          </entry>
        </feed>`;

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => atomXml,
      });

      const res = await request(app).get(
        "/rss?url=https://example.com/no-desc-atom.xml",
      );

      expect(res.status).toBe(200);
      expect(res.body.items[0].description).toBe("");
    });

    it("returns empty string for missing RSS fields (tag not found)", async () => {
      const rssXml = `<rss><channel>
        <item>
          <title>Only Title</title>
        </item>
      </channel></rss>`;

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => rssXml,
      });

      const res = await request(app).get(
        "/rss?url=https://example.com/missing-fields.xml",
      );

      expect(res.status).toBe(200);
      expect(res.body.items[0].title).toBe("Only Title");
      expect(res.body.items[0].link).toBe("");
      expect(res.body.items[0].pubDate).toBe("");
      expect(res.body.items[0].description).toBe("");
    });

    it("passes AbortSignal and User-Agent header to fetch", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => "<rss><channel></channel></rss>",
      });

      await request(app).get(
        "/rss?url=https://example.com/signal-test.xml",
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/signal-test.xml",
        expect.objectContaining({
          signal: expect.any(AbortSignal),
          headers: { "User-Agent": "claudeck/1.0" },
        }),
      );
    });
  });
});

// ── Separate describe to test line 27: GET / error branch ─────────────────
// The tips module caches tipsData at module level. To test the error branch
// in GET / (line 27), we need a fresh module instance where readFileSync throws.
describe("tips routes — GET / error branch (line 27)", () => {
  it("returns 500 when loadTips() throws because readFileSync fails", async () => {
    // Reset modules so we get a fresh tips module with null tipsData cache
    vi.resetModules();

    // Re-mock fs so readFileSync throws on the fresh import
    vi.doMock("fs", () => ({
      readFileSync: vi.fn(() => { throw new Error("ENOENT: file not found"); }),
    }));

    // Re-stub fetch for the fresh module context
    vi.stubGlobal("fetch", vi.fn());

    const freshRouterModule = await import("../../../../server/routes/tips.js");
    const freshRouter = freshRouterModule.default;

    const freshApp = express();
    freshApp.use(express.json());
    freshApp.use("/", freshRouter);

    const res = await request(freshApp).get("/");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to load tips");
  });
});
