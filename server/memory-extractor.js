/**
 * Memory extractor — automatically captures memories from session outputs.
 *
 * Analyzes assistant text and tool outputs to extract observations worth
 * remembering across sessions. Uses pattern-based heuristics to categorize
 * and filter meaningful content without requiring a secondary model call.
 */
import { createMemory, maintainMemories } from "../db.js";

const MAX_MEMORY_LENGTH = 300;

// Patterns that indicate different memory categories
const CATEGORY_PATTERNS = {
  convention: [
    /(?:convention|coding style|naming pattern|always use|prefer using|standard is|pattern is|we use|project uses)\b/i,
    /(?:eslint|prettier|format|linting|style guide)\b/i,
    /(?:file structure|folder structure|directory layout|organized as)\b/i,
  ],
  decision: [
    /(?:decided to|decision:|chose|going with|switched to|migrated to|replaced .+ with)\b/i,
    /(?:architecture|design choice|trade-?off|approach:|strategy:)\b/i,
    /(?:because|reason:|rationale:)\b/i,
  ],
  warning: [
    /(?:warning|caution|careful|watch out|don't|do not|avoid|never|breaking|gotcha|pitfall)\b/i,
    /(?:bug|issue|problem|error|fail|broke|broken)\b/i,
    /(?:deprecated|legacy|workaround|hack|TODO|FIXME)\b/i,
  ],
  discovery: [
    /(?:found|discovered|noticed|learned|turns out|interesting|key file|important)\b/i,
    /(?:the .+ is|works by|depends on|connects to|integrated with)\b/i,
  ],
};

// Patterns that indicate content is NOT worth saving
const NOISE_PATTERNS = [
  /^(ok|okay|sure|done|yes|no|thanks|thank you|got it|understood|i see)/i,
  /^(let me|i'll|i will|here's|here is)/i,
  /^(```|<|{|\[)/,  // code blocks, HTML, JSON
  /^\s*$/,
  /^(the file|this file|reading|writing|editing|searching|running)/i,
  /^\*\*[A-Z]/,  // markdown bold headers (often structural, not insights)
  /^(prettier|eslint|formatted|linted|fixed)\s+\d+/i,  // tool output summaries
  /^(removed|added|updated|created|deleted)\s+(all|the)\b/i,  // action summaries
  /^(kept|skipped|ignored)\b/i,  // action summaries
];

/**
 * Extract memorable observations from assistant text.
 * Returns an array of { category, content } objects.
 */
export function extractMemories(text) {
  if (!text || text.length < 50) return [];

  const memories = [];
  const seen = new Set();

  // Split text into sentences/paragraphs
  const segments = text
    .split(/\n{2,}/)
    .flatMap(p => p.split(/(?<=[.!?])\s+/))
    .map(s => s.trim())
    .filter(s => s.length > 30 && s.length < 500);

  for (const segment of segments) {
    // Skip noise
    if (NOISE_PATTERNS.some(p => p.test(segment))) continue;

    // Try to categorize
    let bestCategory = null;
    let bestScore = 0;

    for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
      const score = patterns.filter(p => p.test(segment)).length;
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }

    // Only extract if we found a strong enough signal
    if (bestScore >= 1 && bestCategory) {
      const content = segment.length > MAX_MEMORY_LENGTH
        ? segment.slice(0, MAX_MEMORY_LENGTH - 3) + "..."
        : segment;

      // Deduplicate within this extraction
      const key = content.toLowerCase().replace(/\s+/g, " ").slice(0, 100);
      if (!seen.has(key)) {
        seen.add(key);
        memories.push({ category: bestCategory, content });
      }
    }
  }

  // Cap at 5 memories per extraction to avoid noise
  return memories.slice(0, 5);
}

/**
 * Extract and save memories from a completed session.
 * Call this after a session or agent completes.
 *
 * @param {string} projectPath - The project cwd
 * @param {string} assistantText - The final assistant output text
 * @param {string|null} sessionId - Source session ID
 * @param {string|null} agentId - Source agent ID (for agent runs)
 * @returns {number} Number of new memories saved
 */
export function captureMemories(projectPath, assistantText, sessionId = null, agentId = null) {
  if (!projectPath || !assistantText) return 0;

  const extracted = extractMemories(assistantText);
  let saved = 0;

  for (const { category, content } of extracted) {
    try {
      const result = createMemory(projectPath, category, content, sessionId, agentId);
      if (!result.isDuplicate) saved++;
    } catch {
      // Ignore individual save errors
    }
  }

  return saved;
}

/**
 * Run memory maintenance for a project.
 * Call this on session start to decay stale memories and clean expired ones.
 */
export function runMaintenance(projectPath) {
  if (!projectPath) return;
  try {
    maintainMemories(projectPath);
  } catch {
    // Non-critical — don't break session startup
  }
}
