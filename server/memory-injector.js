/**
 * Memory injector — retrieves persistent memories and formats them
 * for injection into Claude's system prompt.
 *
 * Supports both top-N retrieval and query-relevant retrieval using FTS5.
 */
import { getTopMemories, searchMemories, touchMemory, createMemory } from "../db.js";

const CATEGORY_LABELS = {
  convention: "Convention",
  decision: "Decision",
  discovery: "Discovery",
  warning: "Warning",
};

const VALID_CATEGORIES = new Set(Object.keys(CATEGORY_LABELS));

/**
 * Deduplicate memories by ID.
 */
function dedup(memories) {
  const seen = new Set();
  return memories.filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

/**
 * Build a prompt section from stored memories for a project.
 * Combines top-N relevant memories with query-matched memories.
 *
 * @param {string} projectPath - The project cwd
 * @param {number} limit - Max memories to include
 * @param {string|null} userMessage - Current user message for relevance matching
 * @returns {{ prompt: string|null, count: number }}
 */
export async function buildMemoryPrompt(projectPath, limit = 10, userMessage = null) {
  if (!projectPath) return { prompt: null, count: 0 };

  // Get top memories by relevance score
  let memories = await getTopMemories(projectPath, limit);

  // If we have a user message, also search for query-relevant memories
  if (userMessage && userMessage.length > 10) {
    try {
      // Extract keywords (skip common words)
      const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'but', 'not', 'with', 'this', 'that', 'it', 'i', 'you', 'we', 'my', 'do', 'how', 'what', 'why', 'can', 'will', 'would', 'should', 'could', 'please', 'me', 'be', 'have', 'has', 'had']);
      const keywords = userMessage.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w));

      if (keywords.length > 0) {
        const queryRelevant = await searchMemories(projectPath, keywords.join(' '), limit);
        memories = dedup([...memories, ...queryRelevant]);
      }
    } catch {
      // FTS search failed — continue with top memories only
    }
  }

  if (!memories || memories.length === 0) return { prompt: null, count: 0 };

  // Cap to limit
  memories = memories.slice(0, limit);

  // Touch each memory to boost relevance on access
  for (const m of memories) {
    await touchMemory(m.id);
  }

  let prompt = `## Project Memory (persistent knowledge from previous sessions)\n`;
  prompt += `The following are observations and decisions from prior work on this project. Use them to inform your approach.\n\n`;

  for (const m of memories) {
    const label = CATEGORY_LABELS[m.category] || m.category;
    prompt += `- **[${label}]** ${m.content}\n`;
  }

  // Instruction for Claude to save new memories
  prompt += `\n### Saving Memories\n`;
  prompt += `If you discover something important about this project that would be useful in future sessions, `;
  prompt += `output a memory block like this:\n\n`;
  prompt += `\`\`\`memory\n{"category": "discovery|convention|decision|warning", "content": "what to remember"}\n\`\`\`\n\n`;
  prompt += `Only save truly important, reusable observations — not routine actions. Categories:\n`;
  prompt += `- **convention**: coding patterns, naming conventions, project structure\n`;
  prompt += `- **decision**: architectural choices, trade-offs, why something was done\n`;
  prompt += `- **warning**: pitfalls, gotchas, things to avoid\n`;
  prompt += `- **discovery**: how things work, dependencies, key files\n`;

  return {
    prompt,
    count: memories.length,
    memories: memories.map(m => ({ id: m.id, category: m.category, content: m.content })),
  };
}

/**
 * Build a shorter memory section for agent prompts (tighter budget).
 */
export async function buildAgentMemoryPrompt(projectPath, limit = 8) {
  if (!projectPath) return null;

  const memories = await getTopMemories(projectPath, limit);
  if (!memories || memories.length === 0) return null;

  for (const m of memories) {
    await touchMemory(m.id);
  }

  let prompt = `## Prior Knowledge\n`;
  prompt += `Key observations from previous sessions on this project:\n\n`;

  for (const m of memories) {
    prompt += `- [${m.category}] ${m.content}\n`;
  }

  return prompt;
}

/**
 * Parse memory blocks from assistant text.
 * Looks for ```memory code blocks with JSON content.
 *
 * @param {string} text - Assistant output text
 * @returns {Array<{category: string, content: string}>}
 */
export function parseMemoryBlocks(text) {
  if (!text) return [];

  const blocks = [];
  const regex = /```memory\s*\n([\s\S]*?)```/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.content && typeof parsed.content === 'string') {
        const category = VALID_CATEGORIES.has(parsed.category) ? parsed.category : 'discovery';
        blocks.push({ category, content: parsed.content.trim().slice(0, 300) });
      }
    } catch {
      // Skip malformed blocks
    }
  }

  return blocks;
}

/**
 * Save memories that Claude explicitly requested to save via ```memory blocks.
 *
 * @param {string} projectPath
 * @param {string} assistantText
 * @param {string|null} sessionId
 * @returns {number} count of saved memories
 */
export async function saveExplicitMemories(projectPath, assistantText, sessionId = null) {
  if (!projectPath || !assistantText) return 0;

  const blocks = parseMemoryBlocks(assistantText);
  let saved = 0;

  for (const { category, content } of blocks) {
    try {
      const result = await createMemory(projectPath, category, content, sessionId, null);
      if (!result.isDuplicate) saved++;
    } catch {
      // Ignore individual save errors
    }
  }

  return saved;
}

/**
 * Parse a user "/remember" command and save it as a memory.
 *
 * Supported formats:
 *   /remember this project uses GraphQL
 *   /remember [warning] never run migrations without backup
 *   /remember [decision] switched to PostgreSQL because...
 *
 * @param {string} message - User message
 * @param {string} projectPath - Project path
 * @param {string|null} sessionId
 * @returns {{ saved: boolean, content: string, category: string }|null}
 */
export async function parseRememberCommand(message, projectPath, sessionId = null) {
  if (!message || !projectPath) return null;

  const trimmed = message.trim();

  // Check for /remember command
  if (!trimmed.toLowerCase().startsWith('/remember ')) return null;

  let text = trimmed.slice('/remember '.length).trim();
  if (!text) return null;

  // Check for [category] prefix
  let category = 'discovery';
  const catMatch = text.match(/^\[(convention|decision|discovery|warning)\]\s*/i);
  if (catMatch) {
    category = catMatch[1].toLowerCase();
    text = text.slice(catMatch[0].length).trim();
  }

  if (!text || text.length < 5) return null;

  // Truncate to max length
  const content = text.slice(0, 300);

  try {
    const result = await createMemory(projectPath, category, content, sessionId, null);
    return { saved: !result.isDuplicate, content, category };
  } catch {
    return null;
  }
}
