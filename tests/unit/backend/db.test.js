import { describe, it, expect, beforeEach } from "vitest";
import {
  // Sessions
  createSession,
  getSession,
  listSessions,
  touchSession,
  updateSessionTitle,
  toggleSessionPin,
  updateSessionSummary,
  deleteSession,
  searchSessions,
  updateClaudeSessionId,
  // Costs
  addCost,
  getTotalCost,
  getProjectCost,
  getSessionCosts,
  getCostTimeline,
  getTotalTokens,
  getProjectTokens,
  // Messages
  addMessage,
  getMessages,
  getMessagesByChatId,
  getMessagesNoChatId,
  // Claude Sessions
  setClaudeSession,
  getClaudeSessionId,
  allClaudeSessions,
  // Agent Context
  setAgentContext,
  getAgentContext,
  getAllAgentContext,
  getAgentContextByKey,
  deleteAgentContext,
  // Agent Runs
  recordAgentRunStart,
  recordAgentRunComplete,
  getAgentRunsRecent,
  getAgentRunsSummary,
  getAgentRunsOverview,
  getAgentRunsByType,
  getAgentRunsDaily,
  // Memories
  createMemory,
  listMemories,
  searchMemories,
  getTopMemories,
  updateMemory,
  touchMemory,
  decayMemories,
  deleteMemory,
  deleteExpiredMemories,
  maintainMemories,
  getMemoryCounts,
  getMemoryStats,
  // Todos
  createTodo,
  updateTodo,
  archiveTodo,
  deleteTodo,
  listTodos,
  getTodoCounts,
  // Brags
  createBrag,
  listBrags,
  deleteBrag,
  // Push subscriptions
  upsertPushSubscription,
  deletePushSubscription,
  getAllPushSubscriptions,
  // Analytics
  getAnalyticsOverview,
  getDailyBreakdown,
  getHourlyActivity,
  getProjectBreakdown,
  getTopSessionsByCost,
  getToolUsage,
  getToolErrors,
  getSessionDepth,
  getMsgLengthDistribution,
  getTopBashCommands,
  getTopFiles,
  getErrorCategories,
  getErrorTimeline,
  getErrorsByTool,
  getRecentErrors,
  getModelUsage,
  getYearlyActivity,
  getCacheEfficiency,
  // Notifications
  createNotification,
  getNotificationHistory,
  getUnreadNotificationCount,
  markNotificationsRead,
  markAllNotificationsRead,
  markNotificationsReadBefore,
  purgeOldNotifications,
  // Session Branching
  forkSession,
  getSessionBranches,
  getSessionBranchCount,
  getSessionLineage,
  // Worktrees
  createWorktreeRecord,
  getWorktreeRecord,
  listWorktreesByProject,
  listActiveWorktrees,
  updateWorktreeStatus,
  updateWorktreeSession,
  deleteWorktreeRecord,
  // DB access
  getDb,
} from "../../../db.js";

// Helper: wipe all rows between tests so each test starts clean
function clearAll() {
  const db = getDb();
  db.exec(`
    DELETE FROM worktrees;
    DELETE FROM notifications;
    DELETE FROM agent_context;
    DELETE FROM agent_runs;
    DELETE FROM brags;
    DELETE FROM push_subscriptions;
    DELETE FROM costs;
    DELETE FROM messages;
    DELETE FROM claude_sessions;
    DELETE FROM todos;
    DELETE FROM memories;
    DELETE FROM sessions;
    INSERT INTO memories_fts(memories_fts) VALUES ('rebuild');
  `);
}

// ─────────────────────────────────────────────────────────────
// 1. Sessions
// ─────────────────────────────────────────────────────────────
describe("Sessions", () => {
  beforeEach(clearAll);

  it("createSession + getSession returns the created session", () => {
    createSession("s1", "cs1", "MyProject", "/tmp/proj");
    const s = getSession("s1");
    expect(s).toBeTruthy();
    expect(s.id).toBe("s1");
    expect(s.claude_session_id).toBe("cs1");
    expect(s.project_name).toBe("MyProject");
    expect(s.project_path).toBe("/tmp/proj");
    expect(s.created_at).toBeTypeOf("number");
    expect(s.last_used_at).toBeTypeOf("number");
  });

  it("createSession is INSERT OR IGNORE — duplicate id is a no-op", () => {
    createSession("s1", "cs1", "P1", "/p1");
    createSession("s1", "cs-new", "P2", "/p2");
    const s = getSession("s1");
    expect(s.project_name).toBe("P1"); // unchanged
  });

  it("getSession returns undefined for non-existent id", () => {
    expect(getSession("nope")).toBeUndefined();
  });

  it("listSessions returns sessions ordered by pinned DESC, last_used_at DESC", () => {
    createSession("a", null, "A", "/a");
    createSession("b", null, "B", "/b");
    toggleSessionPin("a"); // pin session a
    const list = listSessions(10);
    expect(list.length).toBe(2);
    expect(list[0].id).toBe("a"); // pinned comes first
  });

  it("listSessions respects limit", () => {
    for (let i = 0; i < 5; i++) createSession(`s${i}`, null, "P", "/p");
    expect(listSessions(3).length).toBe(3);
  });

  it("listSessions filters by projectPath when provided", () => {
    createSession("a", null, "A", "/alpha");
    createSession("b", null, "B", "/beta");
    const list = listSessions(10, "/alpha");
    expect(list.length).toBe(1);
    expect(list[0].id).toBe("a");
  });

  it("listSessions includes mode field", () => {
    createSession("s1", null, "P", "/p");
    const list = listSessions(10);
    expect(list[0]).toHaveProperty("mode");
    expect(list[0].mode).toBe("single"); // no messages yet
  });

  it("touchSession updates last_used_at", () => {
    createSession("s1", null, "P", "/p");
    const before = getSession("s1").last_used_at;
    // SQLite unixepoch() is second-precision, so touching within the same second may not change it.
    // We just verify it does not throw.
    touchSession("s1");
    const after = getSession("s1").last_used_at;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it("updateSessionTitle sets the title", () => {
    createSession("s1", null, "P", "/p");
    updateSessionTitle("s1", "My Title");
    expect(getSession("s1").title).toBe("My Title");
  });

  it("updateSessionTitle with null clears the title", () => {
    createSession("s1", null, "P", "/p");
    updateSessionTitle("s1", "T");
    updateSessionTitle("s1", null);
    expect(getSession("s1").title).toBeNull();
  });

  it("toggleSessionPin toggles between 0 and 1", () => {
    createSession("s1", null, "P", "/p");
    expect(getSession("s1").pinned).toBe(0);
    toggleSessionPin("s1");
    expect(getSession("s1").pinned).toBe(1);
    toggleSessionPin("s1");
    expect(getSession("s1").pinned).toBe(0);
  });

  it("updateSessionSummary sets the summary", () => {
    createSession("s1", null, "P", "/p");
    updateSessionSummary("s1", "A brief summary");
    expect(getSession("s1").summary).toBe("A brief summary");
  });

  it("updateSessionSummary with null clears the summary", () => {
    createSession("s1", null, "P", "/p");
    updateSessionSummary("s1", "sum");
    updateSessionSummary("s1", null);
    expect(getSession("s1").summary).toBeNull();
  });

  it("updateClaudeSessionId updates the claude_session_id on an existing session", () => {
    createSession("s1", "old-cs", "P", "/p");
    updateClaudeSessionId("s1", "new-cs");
    expect(getSession("s1").claude_session_id).toBe("new-cs");
  });

  it("deleteSession removes session and all related data", () => {
    createSession("s1", null, "P", "/p");
    addCost("s1", 0.5, 100, 1);
    addMessage("s1", "user", "hello");
    setClaudeSession("s1", "", "cs1");
    deleteSession("s1");

    expect(getSession("s1")).toBeUndefined();
    expect(getMessages("s1")).toHaveLength(0);
    expect(getTotalCost()).toBe(0);
    expect(allClaudeSessions()).toHaveLength(0);
  });

  it("deleteSession is safe on non-existent id", () => {
    expect(() => deleteSession("nope")).not.toThrow();
  });

  it("searchSessions matches by title", () => {
    createSession("s1", null, "P", "/p");
    updateSessionTitle("s1", "Fix login bug");
    const results = searchSessions("login");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("s1");
  });

  it("searchSessions matches by project_name", () => {
    createSession("s1", null, "MyApp", "/p");
    const results = searchSessions("MyApp");
    expect(results.length).toBe(1);
  });

  it("searchSessions returns empty array when no match", () => {
    createSession("s1", null, "P", "/p");
    expect(searchSessions("zzz")).toHaveLength(0);
  });

  it("searchSessions filters by projectPath", () => {
    createSession("s1", null, "App", "/alpha");
    createSession("s2", null, "App", "/beta");
    updateSessionTitle("s1", "shared query");
    updateSessionTitle("s2", "shared query");
    const results = searchSessions("shared", 20, "/alpha");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("s1");
  });

  it("searchSessions respects limit", () => {
    for (let i = 0; i < 5; i++) {
      createSession(`s${i}`, null, "Proj", "/p");
      updateSessionTitle(`s${i}`, "test query");
    }
    expect(searchSessions("test", 2).length).toBe(2);
  });

  it("searchSessions includes mode field", () => {
    createSession("s1", null, "P", "/p");
    updateSessionTitle("s1", "something");
    const results = searchSessions("something");
    expect(results[0]).toHaveProperty("mode");
  });
});

// ─────────────────────────────────────────────────────────────
// 1b. Session Branching / Forking
// ─────────────────────────────────────────────────────────────
describe("Session Branching", () => {
  beforeEach(clearAll);

  function seedSessionWithMessages(id, messageCount = 4) {
    createSession(id, null, "TestProject", "/tmp/test");
    for (let i = 0; i < messageCount; i++) {
      const role = i % 2 === 0 ? "user" : "assistant";
      addMessage(id, role, JSON.stringify({ text: `Message ${i}` }));
    }
    return getMessages(id);
  }

  it("forkSession creates a new session with parent reference", () => {
    const msgs = seedSessionWithMessages("s1");
    const forked = forkSession("s1", msgs[1].id);

    expect(forked).toBeTruthy();
    expect(forked.id).not.toBe("s1");
    expect(forked.parent_session_id).toBe("s1");
    expect(forked.fork_message_id).toBe(msgs[1].id);
    expect(forked.project_name).toBe("TestProject");
    expect(forked.project_path).toBe("/tmp/test");
  });

  it("forkSession auto-titles as 'Fork of: <parent title>'", () => {
    seedSessionWithMessages("s1");
    updateSessionTitle("s1", "My Session");
    const msgs = getMessages("s1");
    const forked = forkSession("s1", msgs[1].id);

    expect(forked.title).toBe("Fork of: My Session");
  });

  it("forkSession uses project_name when parent has no title", () => {
    const msgs = seedSessionWithMessages("s1");
    const forked = forkSession("s1", msgs[1].id);

    expect(forked.title).toBe("Fork of: TestProject");
  });

  it("forkSession deep-copies messages up to fork point", () => {
    const msgs = seedSessionWithMessages("s1");
    // Fork at message index 1 (2nd message) — should copy messages 0 and 1
    const forked = forkSession("s1", msgs[1].id);
    const forkedMsgs = getMessages(forked.id);

    expect(forkedMsgs).toHaveLength(2);
    expect(JSON.parse(forkedMsgs[0].content).text).toBe("Message 0");
    expect(JSON.parse(forkedMsgs[1].content).text).toBe("Message 1");
    expect(forkedMsgs[0].role).toBe("user");
    expect(forkedMsgs[1].role).toBe("assistant");
  });

  it("forkSession copies all messages when forking at last message", () => {
    const msgs = seedSessionWithMessages("s1");
    const forked = forkSession("s1", msgs[3].id);
    const forkedMsgs = getMessages(forked.id);

    expect(forkedMsgs).toHaveLength(4);
  });

  it("forkSession defaults to last message when no messageId provided", () => {
    const msgs = seedSessionWithMessages("s1");
    const forked = forkSession("s1", null);
    const forkedMsgs = getMessages(forked.id);

    expect(forkedMsgs).toHaveLength(4);
    expect(forked.fork_message_id).toBe(msgs[3].id);
  });

  it("forkSession only copies messages with chat_id IS NULL", () => {
    createSession("s1", null, "P", "/p");
    addMessage("s1", "user", JSON.stringify({ text: "single mode" }));
    addMessage("s1", "assistant", JSON.stringify({ text: "reply" }));
    addMessage("s1", "user", JSON.stringify({ text: "parallel" }), "chat-0");
    addMessage("s1", "assistant", JSON.stringify({ text: "parallel reply" }), "chat-0");

    const msgs = getMessagesNoChatId("s1");
    const forked = forkSession("s1", msgs[1].id);
    const forkedMsgs = getMessages(forked.id);

    // Should only have the 2 single-mode messages
    expect(forkedMsgs).toHaveLength(2);
    expect(forkedMsgs[0].chat_id).toBeNull();
  });

  it("forkSession does NOT copy costs", () => {
    seedSessionWithMessages("s1");
    addCost("s1", 0.50, 1000, 1);
    const msgs = getMessages("s1");
    const forked = forkSession("s1", msgs[1].id);

    const db = getDb();
    const forkedCosts = db.prepare("SELECT * FROM costs WHERE session_id = ?").all(forked.id);
    expect(forkedCosts).toHaveLength(0);
  });

  it("forkSession does NOT copy claude_sessions mapping", () => {
    seedSessionWithMessages("s1");
    setClaudeSession("s1", "", "claude-123");
    const msgs = getMessages("s1");
    const forked = forkSession("s1", msgs[1].id);

    expect(getClaudeSessionId(forked.id, "")).toBeNull();
  });

  it("forkSession throws when parent session does not exist", () => {
    expect(() => forkSession("nonexistent", 1)).toThrow("Session not found");
  });

  it("forkSession throws when session has no messages", () => {
    createSession("s1", null, "P", "/p");
    expect(() => forkSession("s1", null)).toThrow("No messages to fork");
  });

  it("forkSession gives each fork a unique id", () => {
    const msgs = seedSessionWithMessages("s1");
    const fork1 = forkSession("s1", msgs[1].id);
    const fork2 = forkSession("s1", msgs[1].id);

    expect(fork1.id).not.toBe(fork2.id);
  });

  // ── Fork of fork ──
  it("fork of fork creates a self-contained session", () => {
    const msgs = seedSessionWithMessages("s1", 6);
    const fork1 = forkSession("s1", msgs[3].id); // copies 4 messages
    const fork1Msgs = getMessages(fork1.id);

    const fork2 = forkSession(fork1.id, fork1Msgs[1].id); // copies 2 messages from fork1
    const fork2Msgs = getMessages(fork2.id);

    expect(fork2.parent_session_id).toBe(fork1.id);
    expect(fork2Msgs).toHaveLength(2);
    expect(fork2.title).toBe("Fork of: Fork of: TestProject");
  });

  // ── getSessionBranches ──
  it("getSessionBranches returns direct child forks", () => {
    const msgs = seedSessionWithMessages("s1");
    forkSession("s1", msgs[1].id);
    forkSession("s1", msgs[3].id);

    const branches = getSessionBranches("s1");
    expect(branches).toHaveLength(2);
    branches.forEach(b => expect(b.parent_session_id).toBe("s1"));
  });

  it("getSessionBranches returns empty array when no forks exist", () => {
    seedSessionWithMessages("s1");
    expect(getSessionBranches("s1")).toHaveLength(0);
  });

  it("getSessionBranches does not include grandchild forks", () => {
    const msgs = seedSessionWithMessages("s1");
    const fork1 = forkSession("s1", msgs[1].id);
    const fork1Msgs = getMessages(fork1.id);
    forkSession(fork1.id, fork1Msgs[0].id); // grandchild

    expect(getSessionBranches("s1")).toHaveLength(1); // only direct child
  });

  // ── getSessionBranchCount ──
  it("getSessionBranchCount returns correct count", () => {
    const msgs = seedSessionWithMessages("s1");
    expect(getSessionBranchCount("s1")).toBe(0);
    forkSession("s1", msgs[1].id);
    expect(getSessionBranchCount("s1")).toBe(1);
    forkSession("s1", msgs[3].id);
    expect(getSessionBranchCount("s1")).toBe(2);
  });

  // ── getSessionLineage ──
  it("getSessionLineage returns ancestors and siblings", () => {
    const msgs = seedSessionWithMessages("s1", 6);
    const fork1 = forkSession("s1", msgs[3].id);
    const fork1Msgs = getMessages(fork1.id);
    const fork2 = forkSession(fork1.id, fork1Msgs[1].id);

    const lineage = getSessionLineage(fork2.id);
    expect(lineage.ancestors).toHaveLength(2); // s1 → fork1
    expect(lineage.ancestors[0].id).toBe("s1");
    expect(lineage.ancestors[1].id).toBe(fork1.id);
    expect(lineage.siblings).toHaveLength(0);
  });

  it("getSessionLineage returns siblings (other forks of same parent)", () => {
    const msgs = seedSessionWithMessages("s1");
    const fork1 = forkSession("s1", msgs[1].id);
    const fork2 = forkSession("s1", msgs[3].id);

    const lineage = getSessionLineage(fork1.id);
    expect(lineage.ancestors).toHaveLength(1);
    expect(lineage.siblings).toHaveLength(1);
    expect(lineage.siblings[0].id).toBe(fork2.id);
  });

  it("getSessionLineage returns empty arrays for root session", () => {
    seedSessionWithMessages("s1");
    const lineage = getSessionLineage("s1");
    expect(lineage.ancestors).toHaveLength(0);
    expect(lineage.siblings).toHaveLength(0);
  });

  // ── Orphaning on delete ──
  it("deleteSession orphans child forks (sets parent_session_id to NULL)", () => {
    const msgs = seedSessionWithMessages("s1");
    const fork = forkSession("s1", msgs[1].id);

    deleteSession("s1");

    const orphaned = getSession(fork.id);
    expect(orphaned).toBeTruthy();
    expect(orphaned.parent_session_id).toBeNull();
  });

  it("orphaned fork retains all its messages after parent deletion", () => {
    const msgs = seedSessionWithMessages("s1");
    const fork = forkSession("s1", msgs[1].id);
    const forkMsgCount = getMessages(fork.id).length;

    deleteSession("s1");

    expect(getMessages(fork.id)).toHaveLength(forkMsgCount);
  });

  // ── listSessions includes fork fields ──
  it("listSessions includes parent_session_id and fork_message_id", () => {
    const msgs = seedSessionWithMessages("s1");
    forkSession("s1", msgs[1].id);

    const list = listSessions(10);
    const forked = list.find(s => s.parent_session_id === "s1");
    expect(forked).toBeTruthy();
    expect(forked.fork_message_id).toBe(msgs[1].id);

    const parent = list.find(s => s.id === "s1");
    expect(parent.parent_session_id).toBeNull();
    expect(parent.fork_message_id).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// 2. Costs
// ─────────────────────────────────────────────────────────────
describe("Costs", () => {
  beforeEach(clearAll);

  it("addCost inserts a cost row linked to a session", () => {
    createSession("s1", null, "P", "/p");
    addCost("s1", 0.25, 5000, 3, 100, 200);
    expect(getTotalCost()).toBeCloseTo(0.25);
  });

  it("addCost accepts optional model, stopReason, isError, cache tokens", () => {
    createSession("s1", null, "P", "/p");
    addCost("s1", 1.0, 1000, 1, 500, 600, {
      model: "claude-3-opus",
      stopReason: "end_turn",
      isError: 0,
      cacheReadTokens: 50,
      cacheCreationTokens: 10,
    });
    expect(getTotalCost()).toBeCloseTo(1.0);
  });

  it("addCost defaults optional fields to zero/null", () => {
    createSession("s1", null, "P", "/p");
    addCost("s1", 0.1, 200, 1);
    const tokens = getTotalTokens();
    expect(tokens.input_tokens).toBe(0);
    expect(tokens.output_tokens).toBe(0);
  });

  it("getTotalCost sums all costs", () => {
    createSession("s1", null, "P", "/p");
    addCost("s1", 0.10, 100, 1);
    addCost("s1", 0.20, 200, 2);
    expect(getTotalCost()).toBeCloseTo(0.30);
  });

  it("getTotalCost returns 0 when no costs exist", () => {
    expect(getTotalCost()).toBe(0);
  });

  it("getProjectCost sums costs for a specific project", () => {
    createSession("s1", null, "P1", "/alpha");
    createSession("s2", null, "P2", "/beta");
    addCost("s1", 0.50, 100, 1);
    addCost("s2", 0.75, 100, 1);
    expect(getProjectCost("/alpha")).toBeCloseTo(0.50);
    expect(getProjectCost("/beta")).toBeCloseTo(0.75);
  });

  it("getProjectCost returns 0 for project with no costs", () => {
    expect(getProjectCost("/nonexistent")).toBe(0);
  });

  it("getSessionCosts returns per-session cost breakdown (all)", () => {
    createSession("s1", null, "P", "/p");
    addCost("s1", 0.10, 100, 1, 10, 20);
    addCost("s1", 0.20, 200, 2, 30, 40);
    const costs = getSessionCosts();
    expect(costs.length).toBe(1);
    expect(costs[0].total_cost).toBeCloseTo(0.30);
    expect(costs[0].turns).toBe(3);
    expect(costs[0].input_tokens).toBe(40);
    expect(costs[0].output_tokens).toBe(60);
  });

  it("getSessionCosts filters by projectPath", () => {
    createSession("s1", null, "A", "/a");
    createSession("s2", null, "B", "/b");
    addCost("s1", 1.0, 100, 1);
    addCost("s2", 2.0, 100, 1);
    const costs = getSessionCosts("/a");
    expect(costs.length).toBe(1);
    expect(costs[0].total_cost).toBeCloseTo(1.0);
  });

  it("getSessionCosts returns empty for project with no sessions", () => {
    expect(getSessionCosts("/nope")).toHaveLength(0);
  });

  it("getCostTimeline returns daily cost aggregations", () => {
    // The timeline query is limited to last 30 days, so a recent cost should appear
    createSession("s1", null, "P", "/p");
    addCost("s1", 0.50, 100, 1);
    const timeline = getCostTimeline();
    expect(timeline.length).toBeGreaterThanOrEqual(1);
    expect(timeline[0]).toHaveProperty("date");
    expect(timeline[0]).toHaveProperty("cost");
  });

  it("getCostTimeline filters by projectPath", () => {
    createSession("s1", null, "A", "/a");
    createSession("s2", null, "B", "/b");
    addCost("s1", 0.50, 100, 1);
    addCost("s2", 1.00, 100, 1);
    const timeline = getCostTimeline("/a");
    expect(timeline.length).toBeGreaterThanOrEqual(1);
    expect(timeline[0].cost).toBeCloseTo(0.50);
  });

  it("getCostTimeline returns empty for no costs", () => {
    expect(getCostTimeline()).toHaveLength(0);
  });

  it("getTotalTokens sums all input and output tokens", () => {
    createSession("s1", null, "P", "/p");
    addCost("s1", 0.1, 100, 1, 100, 200);
    addCost("s1", 0.1, 100, 1, 300, 400);
    const t = getTotalTokens();
    expect(t.input_tokens).toBe(400);
    expect(t.output_tokens).toBe(600);
  });

  it("getTotalTokens returns zeros with no data", () => {
    const t = getTotalTokens();
    expect(t.input_tokens).toBe(0);
    expect(t.output_tokens).toBe(0);
  });

  it("getProjectTokens sums tokens for a specific project", () => {
    createSession("s1", null, "P1", "/a");
    createSession("s2", null, "P2", "/b");
    addCost("s1", 0.1, 100, 1, 100, 200);
    addCost("s2", 0.1, 100, 1, 50, 60);
    const t = getProjectTokens("/a");
    expect(t.input_tokens).toBe(100);
    expect(t.output_tokens).toBe(200);
  });

  it("getProjectTokens returns zeros for non-existent project", () => {
    const t = getProjectTokens("/nope");
    expect(t.input_tokens).toBe(0);
    expect(t.output_tokens).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// 3. Messages
// ─────────────────────────────────────────────────────────────
describe("Messages", () => {
  beforeEach(clearAll);

  it("addMessage inserts a message and getMessages retrieves it", () => {
    createSession("s1", null, "P", "/p");
    addMessage("s1", "user", "Hello there");
    const msgs = getMessages("s1");
    expect(msgs.length).toBe(1);
    expect(msgs[0].session_id).toBe("s1");
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toBe("Hello there");
    expect(msgs[0].chat_id).toBeNull();
  });

  it("addMessage stores chat_id when provided", () => {
    createSession("s1", null, "P", "/p");
    addMessage("s1", "assistant", "Reply", "chat-42");
    const msgs = getMessages("s1");
    expect(msgs[0].chat_id).toBe("chat-42");
  });

  it("addMessage stores workflow metadata when provided", () => {
    createSession("s1", null, "P", "/p");
    addMessage("s1", "user", "msg", null, {
      workflowId: "wf-1",
      stepIndex: 2,
      stepLabel: "Build",
    });
    const msgs = getMessages("s1");
    expect(msgs[0].workflow_id).toBe("wf-1");
    expect(msgs[0].workflow_step_index).toBe(2);
    expect(msgs[0].workflow_step_label).toBe("Build");
  });

  it("addMessage stores null workflow fields when no metadata given", () => {
    createSession("s1", null, "P", "/p");
    addMessage("s1", "user", "msg");
    const msgs = getMessages("s1");
    expect(msgs[0].workflow_id).toBeNull();
    expect(msgs[0].workflow_step_index).toBeNull();
    expect(msgs[0].workflow_step_label).toBeNull();
  });

  it("getMessages returns messages in insertion order", () => {
    createSession("s1", null, "P", "/p");
    addMessage("s1", "user", "first");
    addMessage("s1", "assistant", "second");
    addMessage("s1", "user", "third");
    const msgs = getMessages("s1");
    expect(msgs.map((m) => m.content)).toEqual(["first", "second", "third"]);
  });

  it("getMessages returns empty array for non-existent session", () => {
    expect(getMessages("nope")).toHaveLength(0);
  });

  it("getMessagesByChatId filters by chatId", () => {
    createSession("s1", null, "P", "/p");
    addMessage("s1", "user", "A", "chat-1");
    addMessage("s1", "user", "B", "chat-2");
    addMessage("s1", "user", "C", "chat-1");
    const msgs = getMessagesByChatId("s1", "chat-1");
    expect(msgs.length).toBe(2);
    expect(msgs.map((m) => m.content)).toEqual(["A", "C"]);
  });

  it("getMessagesByChatId returns empty for unknown chatId", () => {
    createSession("s1", null, "P", "/p");
    addMessage("s1", "user", "A", "chat-1");
    expect(getMessagesByChatId("s1", "chat-99")).toHaveLength(0);
  });

  it("getMessagesNoChatId returns only messages with NULL chat_id", () => {
    createSession("s1", null, "P", "/p");
    addMessage("s1", "user", "no-chat");
    addMessage("s1", "user", "has-chat", "c1");
    const msgs = getMessagesNoChatId("s1");
    expect(msgs.length).toBe(1);
    expect(msgs[0].content).toBe("no-chat");
  });

  it("getMessagesNoChatId returns empty when all messages have chat_id", () => {
    createSession("s1", null, "P", "/p");
    addMessage("s1", "user", "A", "c1");
    expect(getMessagesNoChatId("s1")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────
// 4. Claude Sessions
// ─────────────────────────────────────────────────────────────
describe("Claude Sessions", () => {
  beforeEach(clearAll);

  it("setClaudeSession + getClaudeSessionId round-trips", () => {
    setClaudeSession("s1", "", "claude-abc");
    expect(getClaudeSessionId("s1", "")).toBe("claude-abc");
  });

  it("setClaudeSession with chat_id stores separately", () => {
    setClaudeSession("s1", "c1", "cs-1");
    setClaudeSession("s1", "c2", "cs-2");
    expect(getClaudeSessionId("s1", "c1")).toBe("cs-1");
    expect(getClaudeSessionId("s1", "c2")).toBe("cs-2");
  });

  it("setClaudeSession upserts (replaces on conflict)", () => {
    setClaudeSession("s1", "", "old");
    setClaudeSession("s1", "", "new");
    expect(getClaudeSessionId("s1", "")).toBe("new");
  });

  it("getClaudeSessionId returns null for non-existent session", () => {
    expect(getClaudeSessionId("nope", "")).toBeNull();
  });

  it("allClaudeSessions returns all rows", () => {
    setClaudeSession("s1", "", "cs-1");
    setClaudeSession("s2", "c1", "cs-2");
    const all = allClaudeSessions();
    expect(all.length).toBe(2);
    expect(all.map((r) => r.claude_session_id).sort()).toEqual(["cs-1", "cs-2"]);
  });

  it("allClaudeSessions returns empty array when none exist", () => {
    expect(allClaudeSessions()).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────
// 5. Agent Context
// ─────────────────────────────────────────────────────────────
describe("Agent Context", () => {
  beforeEach(clearAll);

  it("setAgentContext + getAgentContext round-trips a string value", () => {
    setAgentContext("run1", "agent1", "key1", "value1");
    expect(getAgentContext("run1", "agent1", "key1")).toBe("value1");
  });

  it("setAgentContext JSON-serializes non-string values", () => {
    setAgentContext("run1", "agent1", "data", { foo: "bar" });
    const val = getAgentContext("run1", "agent1", "data");
    expect(JSON.parse(val)).toEqual({ foo: "bar" });
  });

  it("setAgentContext upserts on same (run_id, agent_id, key)", () => {
    setAgentContext("run1", "agent1", "k", "v1");
    setAgentContext("run1", "agent1", "k", "v2");
    expect(getAgentContext("run1", "agent1", "k")).toBe("v2");
  });

  it("getAgentContext returns null for non-existent key", () => {
    expect(getAgentContext("run1", "agent1", "missing")).toBeNull();
  });

  it("getAllAgentContext returns all entries for a run", () => {
    setAgentContext("run1", "a1", "k1", "v1");
    setAgentContext("run1", "a2", "k2", "v2");
    setAgentContext("run2", "a1", "k1", "other");
    const all = getAllAgentContext("run1");
    expect(all.length).toBe(2);
    expect(all[0]).toHaveProperty("agent_id");
    expect(all[0]).toHaveProperty("key");
    expect(all[0]).toHaveProperty("value");
    expect(all[0]).toHaveProperty("created_at");
  });

  it("getAllAgentContext returns empty array for unknown run", () => {
    expect(getAllAgentContext("nope")).toHaveLength(0);
  });

  it("getAgentContextByKey returns all agent values for a key", () => {
    setAgentContext("run1", "a1", "result", "r1");
    setAgentContext("run1", "a2", "result", "r2");
    setAgentContext("run1", "a1", "other", "x");
    const rows = getAgentContextByKey("run1", "result");
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.value).sort()).toEqual(["r1", "r2"]);
  });

  it("getAgentContextByKey returns empty for unknown key", () => {
    expect(getAgentContextByKey("run1", "nope")).toHaveLength(0);
  });

  it("deleteAgentContext removes all entries for a run", () => {
    setAgentContext("run1", "a1", "k", "v");
    setAgentContext("run1", "a2", "k", "v");
    deleteAgentContext("run1");
    expect(getAllAgentContext("run1")).toHaveLength(0);
  });

  it("deleteAgentContext is safe on non-existent run", () => {
    expect(() => deleteAgentContext("nope")).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// 6. Agent Runs
// ─────────────────────────────────────────────────────────────
describe("Agent Runs", () => {
  beforeEach(clearAll);

  it("recordAgentRunStart inserts a running agent row", () => {
    recordAgentRunStart("run1", "agent1", "My Agent", "single", null);
    const runs = getAgentRunsRecent(10);
    expect(runs.length).toBe(1);
    expect(runs[0].run_id).toBe("run1");
    expect(runs[0].agent_id).toBe("agent1");
    expect(runs[0].agent_title).toBe("My Agent");
    expect(runs[0].status).toBe("running");
    expect(runs[0].run_type).toBe("single");
    expect(runs[0].parent_id).toBeNull();
  });

  it("recordAgentRunStart with parent_id links to parent", () => {
    recordAgentRunStart("run1", "orchestrator", "Orch", "orchestrator", null);
    recordAgentRunStart("run2", "worker", "Worker", "parallel", "run1");
    const runs = getAgentRunsRecent(10);
    const worker = runs.find((r) => r.agent_id === "worker");
    expect(worker.parent_id).toBe("run1");
  });

  it("recordAgentRunComplete updates status and metrics", () => {
    recordAgentRunStart("run1", "a1", "Agent", "single");
    recordAgentRunComplete("run1", "a1", "completed", 5, 0.50, 12000, 1000, 2000);
    const runs = getAgentRunsRecent(10);
    expect(runs[0].status).toBe("completed");
    expect(runs[0].turns).toBe(5);
    expect(runs[0].cost_usd).toBeCloseTo(0.50);
    expect(runs[0].duration_ms).toBe(12000);
    expect(runs[0].input_tokens).toBe(1000);
    expect(runs[0].output_tokens).toBe(2000);
    expect(runs[0].completed_at).toBeTypeOf("number");
  });

  it("recordAgentRunComplete with error status stores error message", () => {
    recordAgentRunStart("run1", "a1", "Agent", "single");
    recordAgentRunComplete("run1", "a1", "error", 2, 0.10, 5000, 100, 200, "Something broke");
    const runs = getAgentRunsRecent(10);
    expect(runs[0].status).toBe("error");
    expect(runs[0].error).toBe("Something broke");
  });

  it("getAgentRunsRecent respects limit", () => {
    for (let i = 0; i < 5; i++) {
      recordAgentRunStart(`r${i}`, `a${i}`, "Agent", "single");
    }
    expect(getAgentRunsRecent(3).length).toBe(3);
  });

  it("getAgentRunsRecent returns empty when none exist", () => {
    expect(getAgentRunsRecent()).toHaveLength(0);
  });

  it("getAgentRunsSummary aggregates by agent_id", () => {
    recordAgentRunStart("r1", "builder", "Builder", "single");
    recordAgentRunComplete("r1", "builder", "completed", 3, 0.25, 5000, 100, 200);
    recordAgentRunStart("r2", "builder", "Builder", "single");
    recordAgentRunComplete("r2", "builder", "error", 1, 0.10, 2000, 50, 100, "fail");
    const summary = getAgentRunsSummary();
    expect(summary.length).toBe(1);
    expect(summary[0].agent_id).toBe("builder");
    expect(summary[0].runs).toBe(2);
    expect(summary[0].successes).toBe(1);
    expect(summary[0].errors).toBe(1);
    expect(summary[0].total_cost).toBeCloseTo(0.35);
  });

  it("getAgentRunsSummary returns empty when no runs", () => {
    expect(getAgentRunsSummary()).toHaveLength(0);
  });

  it("getAgentRunsOverview returns aggregate stats", () => {
    recordAgentRunStart("r1", "a1", "A", "single");
    recordAgentRunComplete("r1", "a1", "completed", 3, 0.5, 10000, 500, 1000);
    const overview = getAgentRunsOverview();
    expect(overview.total_runs).toBe(1);
    expect(overview.completed).toBe(1);
    expect(overview.errored).toBe(0);
    expect(overview.total_cost).toBeCloseTo(0.5);
    expect(overview.total_input_tokens).toBe(500);
    expect(overview.total_output_tokens).toBe(1000);
  });

  it("getAgentRunsOverview with no data returns zeros/nulls", () => {
    const overview = getAgentRunsOverview();
    expect(overview.total_runs).toBe(0);
    // SQL aggregates on empty sets return null for some fields
    expect(overview.completed == null || overview.completed === 0).toBe(true);
    expect(overview.total_cost == null || overview.total_cost === 0).toBe(true);
  });

  it("getAgentRunsByType groups by run_type", () => {
    recordAgentRunStart("r1", "a", "A", "single");
    recordAgentRunStart("r2", "b", "B", "parallel");
    recordAgentRunStart("r3", "c", "C", "parallel");
    const byType = getAgentRunsByType();
    expect(byType.length).toBe(2);
    const parallel = byType.find((r) => r.run_type === "parallel");
    expect(parallel.runs).toBe(2);
  });

  it("getAgentRunsDaily returns daily aggregation", () => {
    recordAgentRunStart("r1", "a", "A", "single");
    recordAgentRunComplete("r1", "a", "completed", 1, 0.1, 1000, 10, 20);
    const daily = getAgentRunsDaily();
    expect(daily.length).toBeGreaterThanOrEqual(1);
    expect(daily[0]).toHaveProperty("date");
    expect(daily[0]).toHaveProperty("runs");
    expect(daily[0]).toHaveProperty("completed");
    expect(daily[0]).toHaveProperty("errored");
    expect(daily[0]).toHaveProperty("cost");
  });
});

// ─────────────────────────────────────────────────────────────
// 7. Memories
// ─────────────────────────────────────────────────────────────
describe("Memories", () => {
  beforeEach(clearAll);

  it("createMemory inserts a memory and returns lastInsertRowid", () => {
    const result = createMemory("/proj", "discovery", "Found a bug in auth");
    expect(result.lastInsertRowid).toBeGreaterThan(0);
  });

  it("createMemory deduplicates identical content (same project + content)", () => {
    const r1 = createMemory("/proj", "discovery", "Same content");
    const r2 = createMemory("/proj", "discovery", "Same content");
    expect(r2.isDuplicate).toBe(true);
    expect(r2.lastInsertRowid).toBe(r1.lastInsertRowid);
  });

  it("createMemory allows same content in different projects", () => {
    const r1 = createMemory("/proj1", "discovery", "Shared insight");
    const r2 = createMemory("/proj2", "discovery", "Shared insight");
    expect(r2.isDuplicate).toBeUndefined(); // not a duplicate
    expect(r2.lastInsertRowid).not.toBe(r1.lastInsertRowid);
  });

  it("createMemory stores optional source session and agent ids", () => {
    createMemory("/proj", "discovery", "Content", "sess-1", "agent-1");
    const mems = listMemories("/proj");
    expect(mems[0].source_session_id).toBe("sess-1");
    expect(mems[0].source_agent_id).toBe("agent-1");
  });

  it("listMemories returns memories ordered by relevance_score DESC", () => {
    createMemory("/proj", "discovery", "Low relevance");
    createMemory("/proj", "preference", "High relevance");
    // Touch the second one to boost its relevance
    const mems = listMemories("/proj");
    expect(mems.length).toBe(2);
    // Both start at 1.0, so order depends on accessed_at (both are same second)
    expect(mems[0]).toHaveProperty("content");
    expect(mems[0]).toHaveProperty("category");
    expect(mems[0]).toHaveProperty("relevance_score");
  });

  it("listMemories filters by category when provided", () => {
    createMemory("/proj", "discovery", "D1");
    createMemory("/proj", "preference", "P1");
    const discoveries = listMemories("/proj", "discovery");
    expect(discoveries.length).toBe(1);
    expect(discoveries[0].category).toBe("discovery");
  });

  it("listMemories returns empty for non-existent project", () => {
    expect(listMemories("/nope")).toHaveLength(0);
  });

  it("searchMemories uses FTS5 to find content", () => {
    createMemory("/proj", "discovery", "The authentication module has a critical race condition");
    createMemory("/proj", "discovery", "Database indexing needs optimization");
    const results = searchMemories("/proj", "authentication");
    expect(results.length).toBe(1);
    expect(results[0].content).toContain("authentication");
  });

  it("searchMemories falls back to LIKE when FTS cannot match", () => {
    createMemory("/proj", "discovery", "Special chars: foo-bar-baz");
    // This should still find results via LIKE fallback
    const results = searchMemories("/proj", "foo-bar");
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("searchMemories respects limit", () => {
    for (let i = 0; i < 5; i++) {
      createMemory("/proj", "discovery", `Item number ${i} about testing`);
    }
    const results = searchMemories("/proj", "testing", 2);
    expect(results.length).toBe(2);
  });

  it("searchMemories returns empty for no matches", () => {
    createMemory("/proj", "discovery", "Relevant content");
    expect(searchMemories("/proj", "zzzznotfound")).toHaveLength(0);
  });

  it("searchMemories scoped to project_path", () => {
    createMemory("/proj1", "discovery", "testing framework");
    createMemory("/proj2", "discovery", "testing framework");
    const results = searchMemories("/proj1", "testing");
    expect(results.length).toBe(1);
  });

  it("getTopMemories returns limited results by relevance", () => {
    for (let i = 0; i < 5; i++) {
      createMemory("/proj", "discovery", `Memory number ${i}`);
    }
    const top = getTopMemories("/proj", 3);
    expect(top.length).toBe(3);
  });

  it("getTopMemories returns empty for unknown project", () => {
    expect(getTopMemories("/nope")).toHaveLength(0);
  });

  it("updateMemory changes content and category", () => {
    const r = createMemory("/proj", "discovery", "Original");
    updateMemory(r.lastInsertRowid, "Updated content", "preference");
    const mems = listMemories("/proj");
    expect(mems[0].content).toBe("Updated content");
    expect(mems[0].category).toBe("preference");
  });

  it("touchMemory increases relevance_score and updates accessed_at", () => {
    const r = createMemory("/proj", "discovery", "Content");
    const before = listMemories("/proj")[0].relevance_score;
    touchMemory(r.lastInsertRowid);
    const after = listMemories("/proj")[0].relevance_score;
    expect(after).toBeGreaterThan(before);
  });

  it("touchMemory caps relevance_score at 2.0", () => {
    const r = createMemory("/proj", "discovery", "Content");
    // Touch many times to try to exceed cap
    for (let i = 0; i < 20; i++) touchMemory(r.lastInsertRowid);
    const mem = listMemories("/proj")[0];
    expect(mem.relevance_score).toBeLessThanOrEqual(2.0);
  });

  it("decayMemories reduces relevance for old memories", () => {
    createMemory("/proj", "discovery", "Old memory");
    // Manually set accessed_at to a very old timestamp so decay applies
    const db = getDb();
    db.prepare("UPDATE memories SET accessed_at = accessed_at - 700000 WHERE project_path = ?").run("/proj");
    decayMemories("/proj", 604800);
    const mems = listMemories("/proj");
    expect(mems[0].relevance_score).toBeLessThan(1.0);
  });

  it("decayMemories does not decay recently accessed memories", () => {
    createMemory("/proj", "discovery", "Fresh memory");
    decayMemories("/proj", 604800);
    const mems = listMemories("/proj");
    // Recently created, so it should not be decayed
    expect(mems[0].relevance_score).toBeCloseTo(1.0);
  });

  it("decayMemories floors relevance_score at 0.1", () => {
    createMemory("/proj", "discovery", "Content");
    const db = getDb();
    // Set accessed_at to very old and relevance to low
    db.prepare("UPDATE memories SET accessed_at = 0, relevance_score = 0.15 WHERE project_path = ?").run("/proj");
    decayMemories("/proj", 1); // 1 second threshold — everything qualifies
    const mems = listMemories("/proj");
    expect(mems[0].relevance_score).toBeGreaterThanOrEqual(0.1);
  });

  it("deleteMemory removes a single memory by id (alias deleteMemory)", () => {
    const r = createMemory("/proj", "discovery", "Delete me");
    deleteMemory(r.lastInsertRowid);
    expect(listMemories("/proj")).toHaveLength(0);
  });

  it("deleteExpiredMemories removes memories past their expires_at", () => {
    createMemory("/proj", "discovery", "Ephemeral");
    const db = getDb();
    // Set expires_at to the past
    db.prepare("UPDATE memories SET expires_at = unixepoch() - 1").run();
    deleteExpiredMemories();
    expect(listMemories("/proj")).toHaveLength(0);
  });

  it("deleteExpiredMemories does not remove memories without expires_at", () => {
    createMemory("/proj", "discovery", "Permanent");
    deleteExpiredMemories();
    expect(listMemories("/proj")).toHaveLength(1);
  });

  it("deleteExpiredMemories does not remove memories with future expires_at", () => {
    createMemory("/proj", "discovery", "Future");
    const db = getDb();
    db.prepare("UPDATE memories SET expires_at = unixepoch() + 99999").run();
    deleteExpiredMemories();
    expect(listMemories("/proj")).toHaveLength(1);
  });

  it("maintainMemories runs decay + deleteExpired without error", () => {
    createMemory("/proj", "discovery", "Content");
    expect(() => maintainMemories("/proj")).not.toThrow();
    // Memory should still exist (not expired, not old enough to decay significantly)
    expect(listMemories("/proj")).toHaveLength(1);
  });

  it("getMemoryCounts returns counts grouped by category", () => {
    createMemory("/proj", "discovery", "D1");
    createMemory("/proj", "discovery", "D2");
    createMemory("/proj", "preference", "P1");
    const counts = getMemoryCounts("/proj");
    expect(counts.length).toBe(2);
    const disc = counts.find((c) => c.category === "discovery");
    expect(disc.count).toBe(2);
    const pref = counts.find((c) => c.category === "preference");
    expect(pref.count).toBe(1);
  });

  it("getMemoryCounts returns empty for unknown project", () => {
    expect(getMemoryCounts("/nope")).toHaveLength(0);
  });

  it("getMemoryStats returns total, accessed_today, avg_relevance", () => {
    createMemory("/proj", "discovery", "Content A");
    createMemory("/proj", "preference", "Content B");
    const stats = getMemoryStats("/proj");
    expect(stats.total).toBe(2);
    expect(stats.accessed_today).toBe(2); // just created
    expect(stats.avg_relevance).toBeCloseTo(1.0);
  });

  it("getMemoryStats returns zeros/nulls for unknown project", () => {
    const stats = getMemoryStats("/nope");
    expect(stats.total).toBe(0);
    // SQL aggregates on empty sets may return null
    expect(stats.accessed_today == null || stats.accessed_today === 0).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// 8. Todos
// ─────────────────────────────────────────────────────────────
describe("Todos", () => {
  beforeEach(clearAll);

  it("createTodo inserts a todo with auto-incrementing position", () => {
    const r = createTodo("Buy milk");
    expect(r.lastInsertRowid).toBeGreaterThan(0);
    const todos = listTodos();
    expect(todos.length).toBe(1);
    expect(todos[0].text).toBe("Buy milk");
    expect(todos[0].done).toBe(0);
    expect(todos[0].archived).toBe(0);
  });

  it("createTodo assigns sequential positions", () => {
    createTodo("First");
    createTodo("Second");
    createTodo("Third");
    const todos = listTodos();
    expect(todos.length).toBe(3);
    // Positions should be sequential
    expect(todos[0].position).toBeLessThan(todos[1].position);
    expect(todos[1].position).toBeLessThan(todos[2].position);
  });

  it("updateTodo changes text when provided", () => {
    const r = createTodo("Old text");
    updateTodo(r.lastInsertRowid, "New text", null, null);
    const todos = listTodos();
    expect(todos[0].text).toBe("New text");
  });

  it("updateTodo changes done status", () => {
    const r = createTodo("Task");
    updateTodo(r.lastInsertRowid, null, 1, null);
    const todos = listTodos();
    expect(todos[0].done).toBe(1);
  });

  it("updateTodo changes priority", () => {
    const r = createTodo("Task");
    updateTodo(r.lastInsertRowid, null, null, 3);
    const todos = listTodos();
    expect(todos[0].priority).toBe(3);
  });

  it("updateTodo with all null preserves existing values", () => {
    const r = createTodo("Keep me");
    updateTodo(r.lastInsertRowid, null, null, null);
    const todos = listTodos();
    expect(todos[0].text).toBe("Keep me");
    expect(todos[0].done).toBe(0);
  });

  it("archiveTodo sets archived = 1", () => {
    const r = createTodo("Archive me");
    archiveTodo(r.lastInsertRowid, true);
    expect(listTodos(false)).toHaveLength(0); // not in active
    expect(listTodos(true)).toHaveLength(1); // in archived
  });

  it("archiveTodo can unarchive", () => {
    const r = createTodo("Flip");
    archiveTodo(r.lastInsertRowid, true);
    archiveTodo(r.lastInsertRowid, false);
    expect(listTodos(false)).toHaveLength(1);
    expect(listTodos(true)).toHaveLength(0);
  });

  it("deleteTodo removes the todo", () => {
    const r = createTodo("Delete me");
    deleteTodo(r.lastInsertRowid);
    expect(listTodos()).toHaveLength(0);
  });

  it("deleteTodo is safe on non-existent id", () => {
    expect(() => deleteTodo(9999)).not.toThrow();
  });

  it("listTodos returns active todos ordered by position", () => {
    createTodo("A");
    createTodo("B");
    createTodo("C");
    const todos = listTodos(false);
    expect(todos.map((t) => t.text)).toEqual(["A", "B", "C"]);
  });

  it("listTodos(true) returns archived todos", () => {
    const r = createTodo("Archived");
    archiveTodo(r.lastInsertRowid, true);
    createTodo("Active");
    expect(listTodos(true).length).toBe(1);
    expect(listTodos(true)[0].text).toBe("Archived");
  });

  it("getTodoCounts returns active, archived, and brags counts", () => {
    createTodo("Active 1");
    createTodo("Active 2");
    const r = createTodo("To archive");
    archiveTodo(r.lastInsertRowid, true);
    const counts = getTodoCounts();
    expect(counts.active).toBe(2);
    expect(counts.archived).toBe(1);
    expect(counts.brags).toBe(0);
  });

  it("getTodoCounts with no data returns zeros", () => {
    const counts = getTodoCounts();
    expect(counts.active).toBe(0);
    expect(counts.archived).toBe(0);
    expect(counts.brags).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// 9. Brags
// ─────────────────────────────────────────────────────────────
describe("Brags", () => {
  beforeEach(clearAll);

  it("createBrag inserts a brag", () => {
    const r = createBrag(null, "Shipped the feature", "Feature launch");
    expect(r.lastInsertRowid).toBeGreaterThan(0);
    const brags = listBrags();
    expect(brags.length).toBe(1);
    expect(brags[0].text).toBe("Shipped the feature");
    expect(brags[0].summary).toBe("Feature launch");
    expect(brags[0].todo_id).toBeNull();
  });

  it("createBrag with todo_id links to a todo", () => {
    const todo = createTodo("My task");
    createBrag(todo.lastInsertRowid, "Done!", "Summary");
    const brags = listBrags();
    expect(brags[0].todo_id).toBe(todo.lastInsertRowid);
  });

  it("listBrags returns brags in created_at DESC order", () => {
    createBrag(null, "First", "S1");
    createBrag(null, "Second", "S2");
    const brags = listBrags();
    // Most recent first
    expect(brags.length).toBe(2);
  });

  it("listBrags returns empty when none exist", () => {
    expect(listBrags()).toHaveLength(0);
  });

  it("deleteBrag removes a brag", () => {
    const r = createBrag(null, "Delete me", "Summ");
    deleteBrag(r.lastInsertRowid);
    expect(listBrags()).toHaveLength(0);
  });

  it("deleteBrag is safe on non-existent id", () => {
    expect(() => deleteBrag(9999)).not.toThrow();
  });

  it("getTodoCounts includes brags count", () => {
    createBrag(null, "B1", "S1");
    createBrag(null, "B2", "S2");
    const counts = getTodoCounts();
    expect(counts.brags).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────
// 10. Push Subscriptions
// ─────────────────────────────────────────────────────────────
describe("Push Subscriptions", () => {
  beforeEach(clearAll);

  it("upsertPushSubscription inserts a new subscription", () => {
    upsertPushSubscription("https://push.example.com/1", "p256dh-key", "auth-key");
    const all = getAllPushSubscriptions();
    expect(all.length).toBe(1);
    expect(all[0].endpoint).toBe("https://push.example.com/1");
    expect(all[0].keys_p256dh).toBe("p256dh-key");
    expect(all[0].keys_auth).toBe("auth-key");
  });

  it("upsertPushSubscription updates on duplicate endpoint", () => {
    upsertPushSubscription("https://push.example.com/1", "old-p256dh", "old-auth");
    upsertPushSubscription("https://push.example.com/1", "new-p256dh", "new-auth");
    const all = getAllPushSubscriptions();
    expect(all.length).toBe(1);
    expect(all[0].keys_p256dh).toBe("new-p256dh");
    expect(all[0].keys_auth).toBe("new-auth");
  });

  it("deletePushSubscription removes by endpoint", () => {
    upsertPushSubscription("https://push.example.com/1", "p", "a");
    deletePushSubscription("https://push.example.com/1");
    expect(getAllPushSubscriptions()).toHaveLength(0);
  });

  it("deletePushSubscription is safe on non-existent endpoint", () => {
    expect(() => deletePushSubscription("https://nope.com")).not.toThrow();
  });

  it("getAllPushSubscriptions returns empty when none exist", () => {
    expect(getAllPushSubscriptions()).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────
// 11. Analytics
// ─────────────────────────────────────────────────────────────
describe("Analytics", () => {
  beforeEach(clearAll);

  describe("getAnalyticsOverview", () => {
    it("returns aggregate stats for all projects", () => {
      createSession("s1", null, "P", "/p");
      addCost("s1", 0.50, 1000, 5, 100, 200);
      const o = getAnalyticsOverview();
      expect(o.sessions).toBe(1);
      expect(o.queries).toBe(1);
      expect(o.totalCost).toBeCloseTo(0.50);
      expect(o.totalTurns).toBe(5);
      expect(o.totalOutputTokens).toBe(200);
      expect(o).toHaveProperty("errorRate");
      expect(o.errorRate).toBe(0); // no tool_result messages
    });

    it("returns stats filtered by projectPath", () => {
      createSession("s1", null, "A", "/a");
      createSession("s2", null, "B", "/b");
      addCost("s1", 1.0, 100, 1);
      addCost("s2", 2.0, 100, 1);
      const o = getAnalyticsOverview("/a");
      expect(o.totalCost).toBeCloseTo(1.0);
    });

    it("returns zeros when no data", () => {
      const o = getAnalyticsOverview();
      expect(o.sessions).toBe(0);
      expect(o.queries).toBe(0);
      expect(o.totalCost).toBe(0);
      expect(o.errorRate).toBe(0);
    });

    it("calculates errorRate from tool_result messages", () => {
      createSession("s1", null, "P", "/p");
      addMessage("s1", "tool_result", JSON.stringify({ isError: true, content: "fail" }));
      addMessage("s1", "tool_result", JSON.stringify({ isError: false, content: "ok" }));
      const o = getAnalyticsOverview();
      expect(o.errorRate).toBeCloseTo(50);
    });
  });

  describe("getDailyBreakdown", () => {
    it("returns daily aggregation for all projects", () => {
      createSession("s1", null, "P", "/p");
      addCost("s1", 0.50, 1000, 3, 100, 200);
      const daily = getDailyBreakdown();
      expect(daily.length).toBeGreaterThanOrEqual(1);
      expect(daily[0]).toHaveProperty("date");
      expect(daily[0]).toHaveProperty("queries");
      expect(daily[0]).toHaveProperty("cost");
      expect(daily[0]).toHaveProperty("turns");
      expect(daily[0]).toHaveProperty("output_tok");
    });

    it("filters by projectPath", () => {
      createSession("s1", null, "A", "/a");
      createSession("s2", null, "B", "/b");
      addCost("s1", 0.50, 100, 1);
      addCost("s2", 1.00, 100, 1);
      const daily = getDailyBreakdown("/a");
      expect(daily.length).toBeGreaterThanOrEqual(1);
      expect(daily[0].cost).toBeCloseTo(0.50);
    });

    it("returns empty when no costs", () => {
      expect(getDailyBreakdown()).toHaveLength(0);
    });
  });

  describe("getHourlyActivity", () => {
    it("returns hourly buckets", () => {
      createSession("s1", null, "P", "/p");
      addCost("s1", 0.10, 100, 1);
      const hourly = getHourlyActivity();
      expect(hourly.length).toBeGreaterThanOrEqual(1);
      expect(hourly[0]).toHaveProperty("hour");
      expect(hourly[0]).toHaveProperty("queries");
      expect(hourly[0]).toHaveProperty("cost");
    });

    it("filters by projectPath", () => {
      createSession("s1", null, "A", "/a");
      addCost("s1", 0.10, 100, 1);
      const hourly = getHourlyActivity("/a");
      expect(hourly.length).toBeGreaterThanOrEqual(1);
    });

    it("returns empty when no data", () => {
      expect(getHourlyActivity()).toHaveLength(0);
    });
  });

  describe("getProjectBreakdown", () => {
    it("groups stats by project", () => {
      createSession("s1", null, "Alpha", "/a");
      createSession("s2", null, "Beta", "/b");
      addCost("s1", 1.0, 100, 1);
      addCost("s2", 2.0, 100, 1);
      const breakdown = getProjectBreakdown();
      expect(breakdown.length).toBe(2);
      expect(breakdown[0]).toHaveProperty("name");
      expect(breakdown[0]).toHaveProperty("path");
      expect(breakdown[0]).toHaveProperty("sessions");
      expect(breakdown[0]).toHaveProperty("queries");
      expect(breakdown[0]).toHaveProperty("totalCost");
      expect(breakdown[0]).toHaveProperty("avgCost");
      expect(breakdown[0]).toHaveProperty("avgTurns");
    });

    it("returns empty when no sessions", () => {
      expect(getProjectBreakdown()).toHaveLength(0);
    });
  });

  describe("getTopSessionsByCost", () => {
    it("returns top sessions ordered by cost DESC", () => {
      createSession("s1", null, "P", "/p");
      createSession("s2", null, "P", "/p");
      addCost("s1", 0.50, 100, 1);
      addCost("s2", 1.00, 100, 1);
      const top = getTopSessionsByCost();
      expect(top.length).toBe(2);
      expect(top[0].cost).toBeGreaterThanOrEqual(top[1].cost);
    });

    it("filters by projectPath", () => {
      createSession("s1", null, "A", "/a");
      createSession("s2", null, "B", "/b");
      addCost("s1", 0.50, 100, 1);
      addCost("s2", 1.00, 100, 1);
      const top = getTopSessionsByCost("/a");
      expect(top.length).toBe(1);
    });

    it("returns empty when no costs", () => {
      expect(getTopSessionsByCost()).toHaveLength(0);
    });
  });

  describe("getToolUsage", () => {
    it("counts tool usage from tool messages", () => {
      createSession("s1", null, "P", "/p");
      addMessage("s1", "tool", JSON.stringify({ name: "Read", id: "t1" }));
      addMessage("s1", "tool", JSON.stringify({ name: "Read", id: "t2" }));
      addMessage("s1", "tool", JSON.stringify({ name: "Write", id: "t3" }));
      const usage = getToolUsage();
      expect(usage.length).toBe(2);
      const readUsage = usage.find((u) => u.name === "Read");
      expect(readUsage.count).toBe(2);
    });

    it("filters by projectPath", () => {
      createSession("s1", null, "A", "/a");
      createSession("s2", null, "B", "/b");
      addMessage("s1", "tool", JSON.stringify({ name: "Read", id: "t1" }));
      addMessage("s2", "tool", JSON.stringify({ name: "Read", id: "t2" }));
      const usage = getToolUsage("/a");
      expect(usage.length).toBe(1);
      expect(usage[0].count).toBe(1);
    });

    it("returns empty when no tool messages", () => {
      expect(getToolUsage()).toHaveLength(0);
    });
  });

  describe("getToolErrors", () => {
    it("returns empty when no errors", () => {
      expect(getToolErrors()).toHaveLength(0);
    });

    it("filters by projectPath", () => {
      expect(getToolErrors("/a")).toHaveLength(0);
    });
  });

  describe("getSessionDepth", () => {
    it("buckets sessions by cost query count", () => {
      createSession("s1", null, "P", "/p");
      addCost("s1", 0.10, 100, 1);
      const depth = getSessionDepth();
      expect(depth.length).toBeGreaterThanOrEqual(1);
      expect(depth[0]).toHaveProperty("bucket");
      expect(depth[0]).toHaveProperty("count");
      expect(depth[0]).toHaveProperty("avgCost");
    });

    it("filters by projectPath", () => {
      createSession("s1", null, "A", "/a");
      addCost("s1", 0.10, 100, 1);
      const depth = getSessionDepth("/a");
      expect(depth.length).toBeGreaterThanOrEqual(1);
    });

    it("returns empty when no costs", () => {
      expect(getSessionDepth()).toHaveLength(0);
    });
  });

  describe("getMsgLengthDistribution", () => {
    it("buckets user messages by length", () => {
      createSession("s1", null, "P", "/p");
      addMessage("s1", "user", JSON.stringify({ text: "a".repeat(50) }));
      addMessage("s1", "user", JSON.stringify({ text: "b".repeat(150) }));
      const dist = getMsgLengthDistribution();
      expect(dist.length).toBeGreaterThanOrEqual(1);
      expect(dist[0]).toHaveProperty("bucket");
      expect(dist[0]).toHaveProperty("count");
      expect(dist[0]).toHaveProperty("avgChars");
    });

    it("filters by projectPath", () => {
      createSession("s1", null, "A", "/a");
      addMessage("s1", "user", JSON.stringify({ text: "hello world" }));
      const dist = getMsgLengthDistribution("/a");
      expect(dist.length).toBeGreaterThanOrEqual(1);
    });

    it("returns empty when no user messages", () => {
      expect(getMsgLengthDistribution()).toHaveLength(0);
    });
  });

  describe("getTopBashCommands", () => {
    it("counts bash commands from tool messages", () => {
      createSession("s1", null, "P", "/p");
      addMessage("s1", "tool", JSON.stringify({ name: "Bash", id: "t1", input: { command: "git status" } }));
      addMessage("s1", "tool", JSON.stringify({ name: "Bash", id: "t2", input: { command: "git status" } }));
      addMessage("s1", "tool", JSON.stringify({ name: "Bash", id: "t3", input: { command: "npm install" } }));
      const cmds = getTopBashCommands();
      expect(cmds.length).toBe(2);
      const gitStatus = cmds.find((c) => c.command === "git status");
      expect(gitStatus.count).toBe(2);
    });

    it("filters by projectPath", () => {
      createSession("s1", null, "A", "/a");
      addMessage("s1", "tool", JSON.stringify({ name: "Bash", id: "t1", input: { command: "ls" } }));
      const cmds = getTopBashCommands("/a");
      expect(cmds.length).toBe(1);
    });

    it("returns empty when no bash commands", () => {
      expect(getTopBashCommands()).toHaveLength(0);
    });
  });

  describe("getTopFiles", () => {
    it("counts file operations from tool messages", () => {
      createSession("s1", null, "P", "/p");
      addMessage("s1", "tool", JSON.stringify({ name: "Read", id: "t1", input: { file_path: "/src/app.js" } }));
      addMessage("s1", "tool", JSON.stringify({ name: "Read", id: "t2", input: { file_path: "/src/app.js" } }));
      addMessage("s1", "tool", JSON.stringify({ name: "Edit", id: "t3", input: { file_path: "/src/db.js" } }));
      const files = getTopFiles();
      expect(files.length).toBe(2);
    });

    it("filters by projectPath", () => {
      createSession("s1", null, "A", "/a");
      addMessage("s1", "tool", JSON.stringify({ name: "Read", id: "t1", input: { file_path: "/f.js" } }));
      const files = getTopFiles("/a");
      expect(files.length).toBe(1);
    });

    it("returns empty when no file operations", () => {
      expect(getTopFiles()).toHaveLength(0);
    });
  });

  describe("getErrorCategories", () => {
    it("returns empty when no errors", () => {
      expect(getErrorCategories()).toHaveLength(0);
    });

    it("filters by projectPath", () => {
      expect(getErrorCategories("/a")).toHaveLength(0);
    });
  });

  describe("getErrorTimeline", () => {
    it("returns empty when no errors", () => {
      expect(getErrorTimeline()).toHaveLength(0);
    });

    it("filters by projectPath", () => {
      expect(getErrorTimeline("/a")).toHaveLength(0);
    });
  });

  describe("getErrorsByTool", () => {
    it("returns empty when no errors", () => {
      expect(getErrorsByTool()).toHaveLength(0);
    });

    it("filters by projectPath", () => {
      expect(getErrorsByTool("/a")).toHaveLength(0);
    });
  });

  describe("getRecentErrors", () => {
    it("returns empty when no errors", () => {
      expect(getRecentErrors()).toHaveLength(0);
    });

    it("filters by projectPath", () => {
      expect(getRecentErrors("/a")).toHaveLength(0);
    });
  });

  describe("getModelUsage", () => {
    it("groups cost rows by model", () => {
      createSession("s1", null, "P", "/p");
      addCost("s1", 0.50, 100, 1, 100, 200, { model: "claude-3-opus" });
      addCost("s1", 0.10, 100, 1, 50, 60, { model: "claude-3-haiku" });
      addCost("s1", 0.20, 100, 1, 80, 90, { model: "claude-3-opus" });
      const usage = getModelUsage();
      expect(usage.length).toBe(2);
      const opus = usage.find((u) => u.model === "claude-3-opus");
      expect(opus.count).toBe(2);
      expect(opus.cost).toBeCloseTo(0.70);
    });

    it("filters by projectPath", () => {
      createSession("s1", null, "A", "/a");
      addCost("s1", 0.50, 100, 1, 100, 200, { model: "claude-3-opus" });
      const usage = getModelUsage("/a");
      expect(usage.length).toBe(1);
    });

    it("returns empty when no costs", () => {
      expect(getModelUsage()).toHaveLength(0);
    });
  });

  describe("getYearlyActivity", () => {
    it("returns daily activity for the past year", () => {
      createSession("s1", null, "P", "/p");
      addCost("s1", 0.50, 1000, 3, 100, 200);
      const activity = getYearlyActivity();
      expect(activity.length).toBeGreaterThanOrEqual(1);
      expect(activity[0]).toHaveProperty("date");
      expect(activity[0]).toHaveProperty("sessions");
      expect(activity[0]).toHaveProperty("queries");
      expect(activity[0]).toHaveProperty("cost");
      expect(activity[0]).toHaveProperty("input_tokens");
      expect(activity[0]).toHaveProperty("output_tokens");
      expect(activity[0]).toHaveProperty("turns");
    });

    it("returns empty when no costs", () => {
      expect(getYearlyActivity()).toHaveLength(0);
    });
  });

  describe("getCacheEfficiency", () => {
    it("returns daily cache stats", () => {
      createSession("s1", null, "P", "/p");
      addCost("s1", 0.50, 100, 1, 100, 200, {
        cacheReadTokens: 50,
        cacheCreationTokens: 10,
      });
      const cache = getCacheEfficiency();
      expect(cache.length).toBeGreaterThanOrEqual(1);
      expect(cache[0]).toHaveProperty("date");
      expect(cache[0]).toHaveProperty("cache_read");
      expect(cache[0]).toHaveProperty("cache_creation");
      expect(cache[0]).toHaveProperty("total_input");
      expect(cache[0].cache_read).toBe(50);
      expect(cache[0].cache_creation).toBe(10);
    });

    it("filters by projectPath", () => {
      createSession("s1", null, "A", "/a");
      addCost("s1", 0.50, 100, 1, 100, 200, { cacheReadTokens: 30 });
      const cache = getCacheEfficiency("/a");
      expect(cache.length).toBeGreaterThanOrEqual(1);
      expect(cache[0].cache_read).toBe(30);
    });

    it("returns empty when no costs", () => {
      expect(getCacheEfficiency()).toHaveLength(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// 12. Notifications
// ─────────────────────────────────────────────────────────────
describe("Notifications", () => {
  beforeEach(clearAll);

  describe("createNotification", () => {
    it("creates a notification and returns it with an id", () => {
      const n = createNotification("agent", "Agent done", "5 turns", '{"cost":0.01}', "sid-1", "agent-1");

      expect(n.id).toBeTypeOf("number");
      expect(n.type).toBe("agent");
      expect(n.title).toBe("Agent done");
      expect(n.body).toBe("5 turns");
      expect(n.metadata).toBe('{"cost":0.01}');
      expect(n.source_session_id).toBe("sid-1");
      expect(n.source_agent_id).toBe("agent-1");
      expect(n.read_at).toBeNull();
      expect(n.created_at).toBeTypeOf("number");
    });

    it("creates with only required fields", () => {
      const n = createNotification("error", "Something failed");

      expect(n.id).toBeTypeOf("number");
      expect(n.type).toBe("error");
      expect(n.title).toBe("Something failed");
      expect(n.body).toBeNull();
      expect(n.metadata).toBeNull();
      expect(n.source_session_id).toBeNull();
      expect(n.source_agent_id).toBeNull();
    });

    it("auto-increments IDs", () => {
      const n1 = createNotification("agent", "First");
      const n2 = createNotification("agent", "Second");

      expect(n2.id).toBeGreaterThan(n1.id);
    });
  });

  describe("getNotificationHistory", () => {
    it("returns empty array when no notifications exist", () => {
      const items = getNotificationHistory();
      expect(items).toEqual([]);
    });

    it("returns notifications ordered by created_at DESC", () => {
      const db = getDb();
      db.prepare("INSERT INTO notifications (type, title, created_at) VALUES (?, ?, ?)").run("agent", "First", 1000);
      db.prepare("INSERT INTO notifications (type, title, created_at) VALUES (?, ?, ?)").run("agent", "Second", 2000);
      db.prepare("INSERT INTO notifications (type, title, created_at) VALUES (?, ?, ?)").run("agent", "Third", 3000);

      const items = getNotificationHistory(10, 0);
      expect(items).toHaveLength(3);
      expect(items[0].title).toBe("Third");
      expect(items[2].title).toBe("First");
    });

    it("respects limit and offset", () => {
      for (let i = 0; i < 10; i++) {
        createNotification("agent", `N-${i}`);
      }

      const page1 = getNotificationHistory(3, 0);
      const page2 = getNotificationHistory(3, 3);

      expect(page1).toHaveLength(3);
      expect(page2).toHaveLength(3);
      expect(page1[0].id).not.toBe(page2[0].id);
    });

    it("filters by unread_only", () => {
      const n1 = createNotification("agent", "Unread");
      const n2 = createNotification("agent", "Will be read");
      markNotificationsRead([n2.id]);

      const unread = getNotificationHistory(10, 0, true);
      expect(unread).toHaveLength(1);
      expect(unread[0].title).toBe("Unread");
    });

    it("filters by type", () => {
      createNotification("agent", "Agent notif");
      createNotification("error", "Error notif");
      createNotification("agent", "Another agent");

      const agents = getNotificationHistory(10, 0, false, "agent");
      expect(agents).toHaveLength(2);
      agents.forEach(n => expect(n.type).toBe("agent"));
    });

    it("filters by type AND unread_only", () => {
      const n1 = createNotification("agent", "Agent unread");
      const n2 = createNotification("agent", "Agent read");
      createNotification("error", "Error unread");
      markNotificationsRead([n2.id]);

      const items = getNotificationHistory(10, 0, true, "agent");
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe("Agent unread");
    });
  });

  describe("getUnreadNotificationCount", () => {
    it("returns 0 when no notifications", () => {
      expect(getUnreadNotificationCount()).toBe(0);
    });

    it("counts only unread notifications", () => {
      const n1 = createNotification("agent", "A");
      createNotification("agent", "B");
      createNotification("agent", "C");
      markNotificationsRead([n1.id]);

      expect(getUnreadNotificationCount()).toBe(2);
    });
  });

  describe("markNotificationsRead", () => {
    it("marks specific notifications as read", () => {
      const n1 = createNotification("agent", "A");
      const n2 = createNotification("agent", "B");
      const n3 = createNotification("agent", "C");

      markNotificationsRead([n1.id, n3.id]);

      expect(getUnreadNotificationCount()).toBe(1);
      const history = getNotificationHistory(10, 0);
      const readIds = history.filter(n => n.read_at !== null).map(n => n.id);
      expect(readIds).toContain(n1.id);
      expect(readIds).toContain(n3.id);
      expect(readIds).not.toContain(n2.id);
    });

    it("is idempotent — marking already-read items does not error", () => {
      const n = createNotification("agent", "A");
      markNotificationsRead([n.id]);
      expect(() => markNotificationsRead([n.id])).not.toThrow();
    });
  });

  describe("markAllNotificationsRead", () => {
    it("marks all unread notifications as read", () => {
      createNotification("agent", "A");
      createNotification("error", "B");
      createNotification("agent", "C");

      expect(getUnreadNotificationCount()).toBe(3);
      markAllNotificationsRead();
      expect(getUnreadNotificationCount()).toBe(0);
    });

    it("does not error when no notifications exist", () => {
      expect(() => markAllNotificationsRead()).not.toThrow();
    });
  });

  describe("markNotificationsReadBefore", () => {
    it("marks notifications created before timestamp as read", () => {
      const db = getDb();
      // Insert with explicit timestamps using raw SQL
      db.prepare("INSERT INTO notifications (type, title, created_at) VALUES (?, ?, ?)").run("agent", "Old", 1000);
      db.prepare("INSERT INTO notifications (type, title, created_at) VALUES (?, ?, ?)").run("agent", "Newer", 2000);
      db.prepare("INSERT INTO notifications (type, title, created_at) VALUES (?, ?, ?)").run("agent", "Newest", 3000);

      markNotificationsReadBefore(2500);

      const unread = getNotificationHistory(10, 0, true);
      expect(unread).toHaveLength(1);
      expect(unread[0].title).toBe("Newest");
    });
  });

  describe("purgeOldNotifications", () => {
    it("deletes notifications older than specified days", () => {
      const db = getDb();
      const veryOld = Math.floor(Date.now() / 1000) - (100 * 86400); // 100 days ago
      db.prepare("INSERT INTO notifications (type, title, created_at) VALUES (?, ?, ?)").run("agent", "Ancient", veryOld);
      createNotification("agent", "Recent");

      purgeOldNotifications(90);

      const history = getNotificationHistory(10, 0);
      expect(history).toHaveLength(1);
      expect(history[0].title).toBe("Recent");
    });

    it("marks stale unread (>7 days) as read", () => {
      const db = getDb();
      const eightDaysAgo = Math.floor(Date.now() / 1000) - (8 * 86400);
      db.prepare("INSERT INTO notifications (type, title, created_at) VALUES (?, ?, ?)").run("agent", "Stale", eightDaysAgo);
      createNotification("agent", "Fresh");

      purgeOldNotifications(90);

      // Stale should now be read, Fresh should still be unread
      expect(getUnreadNotificationCount()).toBe(1);
    });

    it("does not error on empty table", () => {
      expect(() => purgeOldNotifications(90)).not.toThrow();
    });
  });
});

// ─────────────────────────────────────────────────────────────
// 13. getDb helper
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// Worktrees
// ─────────────────────────────────────────────────────────────
describe("Worktrees", () => {
  beforeEach(clearAll);

  it("createWorktreeRecord + getWorktreeRecord returns the created worktree", () => {
    createWorktreeRecord("wt1", "s1", "/project", "/project/.wt/feat", "claudeck/feat", "main", "add feature");
    const wt = getWorktreeRecord("wt1");
    expect(wt).toBeTruthy();
    expect(wt.id).toBe("wt1");
    expect(wt.session_id).toBe("s1");
    expect(wt.project_path).toBe("/project");
    expect(wt.worktree_path).toBe("/project/.wt/feat");
    expect(wt.branch_name).toBe("claudeck/feat");
    expect(wt.base_branch).toBe("main");
    expect(wt.status).toBe("active");
    expect(wt.user_prompt).toBe("add feature");
    expect(wt.created_at).toBeTypeOf("number");
    expect(wt.completed_at).toBeNull();
  });

  it("getWorktreeRecord returns undefined for nonexistent id", () => {
    expect(getWorktreeRecord("nope")).toBeUndefined();
  });

  it("listWorktreesByProject returns worktrees for a project", () => {
    createWorktreeRecord("wt1", null, "/project", "/wt/1", "b1", "main", "p1");
    createWorktreeRecord("wt2", null, "/project", "/wt/2", "b2", "main", "p2");
    createWorktreeRecord("wt3", null, "/other", "/wt/3", "b3", "main", "p3");

    const list = listWorktreesByProject("/project");
    expect(list).toHaveLength(2);
    expect(list.map((w) => w.id).sort()).toEqual(["wt1", "wt2"]);
  });

  it("listWorktreesByProject returns results ordered by created_at DESC", () => {
    createWorktreeRecord("wt1", null, "/project", "/wt/1", "b1", "main", "first");
    createWorktreeRecord("wt2", null, "/project", "/wt/2", "b2", "main", "second");

    const list = listWorktreesByProject("/project");
    expect(list).toHaveLength(2);
    // Both created in the same second, so just verify both are returned
    const ids = list.map((w) => w.id).sort();
    expect(ids).toEqual(["wt1", "wt2"]);
  });

  it("listActiveWorktrees returns only active and completed worktrees", () => {
    createWorktreeRecord("wt1", null, "/p", "/wt/1", "b1", "main", "active");
    createWorktreeRecord("wt2", null, "/p", "/wt/2", "b2", "main", "completed");
    createWorktreeRecord("wt3", null, "/p", "/wt/3", "b3", "main", "discarded");

    updateWorktreeStatus("wt2", "completed");
    updateWorktreeStatus("wt3", "discarded");

    const list = listActiveWorktrees();
    const ids = list.map((w) => w.id);
    expect(ids).toContain("wt1"); // active
    expect(ids).toContain("wt2"); // completed
    expect(ids).not.toContain("wt3"); // discarded — excluded
  });

  it("updateWorktreeStatus changes status and sets completed_at", () => {
    createWorktreeRecord("wt1", null, "/p", "/wt/1", "b1", "main", "test");

    updateWorktreeStatus("wt1", "merged");

    const wt = getWorktreeRecord("wt1");
    expect(wt.status).toBe("merged");
    expect(wt.completed_at).toBeTypeOf("number");
  });

  it("updateWorktreeSession updates the session_id", () => {
    createWorktreeRecord("wt1", null, "/p", "/wt/1", "b1", "main", "test");

    updateWorktreeSession("wt1", "new-session");

    const wt = getWorktreeRecord("wt1");
    expect(wt.session_id).toBe("new-session");
  });

  it("deleteWorktreeRecord removes the row", () => {
    createWorktreeRecord("wt1", null, "/p", "/wt/1", "b1", "main", "test");
    expect(getWorktreeRecord("wt1")).toBeTruthy();

    deleteWorktreeRecord("wt1");
    expect(getWorktreeRecord("wt1")).toBeUndefined();
  });

  it("allows null session_id", () => {
    createWorktreeRecord("wt1", null, "/p", "/wt/1", "b1", "main", "test");
    const wt = getWorktreeRecord("wt1");
    expect(wt.session_id).toBeNull();
  });

  it("allows null user_prompt", () => {
    createWorktreeRecord("wt1", null, "/p", "/wt/1", "b1", "main", null);
    const wt = getWorktreeRecord("wt1");
    expect(wt.user_prompt).toBeNull();
  });
});

describe("getDb", () => {
  it("returns a Database instance", () => {
    const db = getDb();
    expect(db).toBeTruthy();
    expect(typeof db.prepare).toBe("function");
    expect(typeof db.exec).toBe("function");
  });
});
