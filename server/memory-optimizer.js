/**
 * Memory optimizer — analyzes and optimizes stored memories using Claude.
 *
 * Two-phase approach:
 * 1. Heuristic pre-filter (instant, no cost) — remove obvious noise
 * 2. Model-based consolidation (Claude Haiku) — merge, rewrite, re-categorize
 */
import { query } from "@anthropic-ai/claude-code";
import { execPath } from "process";
import { listMemories, createMemory, deleteMemory, getDb } from "../db.js";

const VALID_CATEGORIES = new Set(["convention", "decision", "discovery", "warning"]);

// ── Phase 1: Heuristic pre-filter ──────────────────────────

const NOISE_PATTERNS = [
  /^\*\*[A-Z]/,                          // Markdown bold headers
  /^(prettier|eslint|formatted|linted)\s+\d+/i,  // Tool output
  /^(removed|added|updated|created|deleted|kept|skipped)\s+(all|the|\d)/i,  // Action summaries
  /^[-*]\s/,                             // Bare bullet points
  /^\d+\.\s/,                            // Numbered lists without context
  /^(here|this|these|those)\s+(are|is)\b/i,  // Presentational openers
];

function isNoisyMemory(content) {
  if (!content || content.length < 15) return true;
  if (content.length > 500) return true;  // Too verbose to be a useful memory
  if (NOISE_PATTERNS.some(p => p.test(content.trim()))) return true;
  // Markdown-heavy (structural artifact, not a fact)
  const mdChars = (content.match(/[*_`#\[\]|]/g) || []).length;
  if (mdChars > content.length * 0.15) return true;
  return false;
}

/**
 * Phase 1: Remove obvious noise without a model call.
 * Returns { kept, removed } arrays.
 */
export function prefilterMemories(memories) {
  const kept = [];
  const removed = [];
  for (const m of memories) {
    if (isNoisyMemory(m.content)) {
      removed.push({ ...m, reason: "noise" });
    } else {
      kept.push(m);
    }
  }
  return { kept, removed };
}

// ── Phase 2: Model-based optimization ──────────────────────

function buildOptimizePrompt(memories, projectPath) {
  const memoriesJson = JSON.stringify(
    memories.map(m => ({
      id: m.id,
      category: m.category,
      content: m.content,
      created_at: new Date(m.created_at * 1000).toISOString().split("T")[0],
    })),
    null,
    2
  );

  return `You are a memory curator for a coding project's persistent memory system.

## What These Memories Are
These memories are injected into an AI coding assistant's system prompt at the start of every new session. The assistant has a budget of ~10 memories per session. Every low-quality memory wastes a slot that could hold something genuinely useful.

Project path: ${projectPath}

## Your Task
Optimize this memory set. The goal is maximum usefulness per memory slot.

### Step 1: Remove
Delete memories that are:
- **Action logs**: Describe what was done, not what is true ("Refactored 12 files", "Removed exports", "Formatted code")
- **Fragments**: Incomplete sentences, markdown artifacts, bullet points without context ("**Added to service-base.ts:**", "**Kept as-is:**")
- **Derivable from code**: Things the assistant would discover by reading files (import lists, file contents, directory structures)
- **Session-specific**: Only relevant to the task that generated them, not to future work

### Step 2: Merge
Combine memories about the same topic into one. Example:
- "All 12 service files import it for error logging."
- "The factory functions were designed to DRY up the repetitive pattern."
Becomes: "The service layer uses a factory pattern: 12 service files share resolveAndTransform() from service-base.ts for consistent error handling and response shaping."

### Step 3: Rewrite
Each surviving memory must be:
- **A statement of fact** (present tense), not an action description (past tense)
- **Self-contained** — understandable without the session that created it
- **Actionable** — tells the assistant what to do, avoid, or know
- **Concise** — one or two sentences, under 200 characters when possible
- **Specific** — names files, functions, patterns, not vague generalities

### Step 4: Categorize
Assign the correct category:
- \`convention\`: How code should be written (patterns, naming, tools, structure)
- \`decision\`: Why something was chosen over alternatives (include the "why")
- \`warning\`: Pitfalls, constraints, things that break (include consequences)
- \`discovery\`: How the system works (dependencies, data flow, key mechanisms)

### Quality Bar
Ask yourself: "If the assistant didn't know this, would it waste time, make a mistake, or produce worse code?" If the answer is no, remove it.

## Input Memories
${memoriesJson}

## Output
Return ONLY a JSON code block — no other text before or after:

\`\`\`json
{
  "optimized": [
    {"category": "convention", "content": "..."},
    {"category": "decision", "content": "..."}
  ],
  "removed_ids": [1, 5, 8],
  "summary": "Removed N noise entries, merged N related, rewrote N for clarity. Kept N total."
}
\`\`\``;
}

/**
 * Parse the optimizer model output.
 */
function parseOptimizerOutput(text) {
  // Try to find JSON in code block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim();

  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed.optimized)) {
      throw new Error("Missing 'optimized' array");
    }

    // Validate and clean the output
    const optimized = parsed.optimized
      .filter(m => m.content && typeof m.content === "string" && m.content.trim().length > 5)
      .map(m => ({
        category: VALID_CATEGORIES.has(m.category) ? m.category : "discovery",
        content: m.content.trim().slice(0, 300),
      }));

    return {
      optimized,
      removedIds: Array.isArray(parsed.removed_ids) ? parsed.removed_ids : [],
      summary: parsed.summary || `Optimized to ${optimized.length} memories.`,
    };
  } catch (e) {
    throw new Error(`Failed to parse optimizer output: ${e.message}`);
  }
}

/**
 * Run the full optimization pipeline.
 *
 * @param {string} projectPath
 * @param {function} onProgress - Called with status updates
 * @returns {Promise<{preview: object}>} Preview data for user confirmation
 */
export async function optimizeMemories(projectPath, onProgress = () => {}) {
  // 1. Load all memories
  const allMemories = await listMemories(projectPath);
  if (!allMemories.length) {
    return { preview: { before: 0, after: 0, summary: "No memories to optimize." } };
  }

  onProgress({ phase: "prefilter", total: allMemories.length });

  // 2. Phase 1: Heuristic pre-filter
  const { kept, removed: noiseRemoved } = prefilterMemories(allMemories);

  onProgress({ phase: "prefilter_done", kept: kept.length, removed: noiseRemoved.length });

  if (kept.length === 0) {
    return {
      preview: {
        before: allMemories.length,
        after: 0,
        noiseRemoved: noiseRemoved.length,
        optimized: [],
        removedIds: allMemories.map(m => m.id),
        summary: `All ${allMemories.length} memories were noise. Recommend clearing all.`,
      },
    };
  }

  // 3. Phase 2: Model-based optimization
  onProgress({ phase: "model", memoriesCount: kept.length });

  const prompt = buildOptimizePrompt(kept, projectPath);
  let modelOutput = "";

  try {
    const q = query({
      prompt,
      options: {
        model: "claude-haiku-4-5-20251001",
        maxTurns: 1,
        permissionMode: "bypassPermissions",
        executable: execPath,
      },
    });

    for await (const sdkMsg of q) {
      if (sdkMsg.type === "assistant" && sdkMsg.message?.content) {
        for (const block of sdkMsg.message.content) {
          if (block.type === "text" && block.text) {
            modelOutput += block.text;
          }
        }
      }
    }
  } catch (e) {
    throw new Error(`Optimization model call failed: ${e.message}`);
  }

  if (!modelOutput) {
    throw new Error("Model returned empty output");
  }

  onProgress({ phase: "parsing" });

  const result = parseOptimizerOutput(modelOutput);

  // Build preview
  return {
    preview: {
      before: allMemories.length,
      after: result.optimized.length,
      noiseRemoved: noiseRemoved.length,
      modelOptimized: true,
      optimized: result.optimized,
      removedIds: [
        ...noiseRemoved.map(m => m.id),
        ...result.removedIds.filter(id => !noiseRemoved.some(m => m.id === id)),
      ],
      original: allMemories.map(m => ({ id: m.id, category: m.category, content: m.content })),
      summary: result.summary,
    },
  };
}

/**
 * Apply the optimization — replace old memories with optimized ones.
 *
 * @param {string} projectPath
 * @param {Array<{category: string, content: string}>} optimized
 * @returns {{ deleted: number, created: number }}
 */
export async function applyOptimization(projectPath, optimized) {
  const db = getDb();

  // Run in a transaction for atomicity
  const apply = db.transaction(() => {
    // 1. Delete all existing memories for this project
    const existing = listMemories(projectPath);
    for (const m of existing) {
      deleteMemory(m.id);
    }

    // 2. Insert optimized memories
    let created = 0;
    for (const { category, content } of optimized) {
      if (content && content.trim()) {
        const cat = VALID_CATEGORIES.has(category) ? category : "discovery";
        createMemory(projectPath, cat, content.trim(), null, "optimizer");
        created++;
      }
    }

    return { deleted: existing.length, created };
  });

  return apply();
}
