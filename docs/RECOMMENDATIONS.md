# Recommendations — Making the App More Professional & AI-Focused

## High Impact — Core AI Features

### 1. ~~Conversation Context / System Prompts per Project~~ ✅ Implemented
- ~~Let each project have a custom system prompt (e.g., "You are an expert in React + TypeScript. This is a monorepo with...")~~
- ~~Store in `folders.json` or a new `project_config` table~~
- Custom system prompts per project via `folders.json` `systemPrompt` field, edit UI with SP badge, `/system-prompt` command

### 2. ~~AI Agent Workflows (Multi-Step Tasks)~~ ✅ Implemented
- ~~Pre-built workflows: "Review PR", "Onboard me to this repo", "Generate migration plan"~~
- ~~Each workflow is a chain of prompts that execute sequentially with context passing~~
- ~~Progress UI with step indicators~~
- 3 pre-built workflows in `workflows.json`, workflow button, step progress dots, slash commands (`/review-pr`, `/onboard-repo`, `/migration-plan`)

### 3. ~~Conversation Search & Semantic History~~ ✅ Implemented
- ~~Full-text search across all sessions~~
- ~~"Ask about past conversations" — query your history with AI~~
- ~~Session summaries auto-generated on completion~~
- Session title search with debounced input, auto-generated titles from first message, search across all sessions or per-project

### 4. ~~Code Diff Viewer~~ ✅ Implemented
- ~~When Claude edits files, show inline diffs (green/red) instead of raw tool output~~
- ~~Accept/reject changes from the UI~~
- LCS-based diff algorithm, green/red line-by-line diff view for Edit tool, all-green additions view for Write tool

### 5. ~~File Context Attachments~~ ✅ Implemented
- ~~Drag-and-drop files or paste code into the chat~~
- ~~"Add context" button to include specific files before sending~~
- Attach button with file picker modal, file search, multi-select, files prepended as `<file>` blocks, `/attach` command

## Medium Impact — Professional UX

### 6. ~~Session Titles (Enhanced)~~ ✅ Implemented
- ~~Use the first message or ask Claude to summarize the session into a title~~
- ~~Replace "Frontend Docs" with meaningful names like "Fix auth bug in login flow"~~
- Auto-generated titles from first message, inline double-click rename, PUT `/api/sessions/:id/title` endpoint

### 7. ~~Cost Dashboard~~ ✅ Implemented
- ~~Charts showing cost over time, per project, per session~~
- ~~Daily/weekly budget alerts~~
- ~~Token breakdown (input vs output)~~
- Cost dashboard modal (click cost display in header), per-session cost table, daily cost bar chart (last 30 days), summary cards (total/project/today), `/costs` command

### 8. ~~Keyboard Shortcuts~~ ✅ Implemented
- ~~`Cmd+K` — quick session search~~
- ~~`Cmd+N` — new session~~
- ~~`Cmd+1-4` — switch parallel panes~~
- `Cmd+K` search, `Cmd+N` new session, `Cmd+/` shortcuts reference modal, `Cmd+1-4` parallel panes, `Escape` close modals, `/shortcuts` command

### 9. ~~Response Formatting~~ ✅ Implemented
- ~~Syntax-highlighted code blocks (use highlight.js or Prism)~~
- ~~Copy button on code blocks~~
- ~~Mermaid diagram rendering~~
- highlight.js syntax highlighting via CDN, copy button on code blocks with "Copied!" feedback, Mermaid diagram rendering (lang-mermaid blocks → SVG)

### 10. ~~Export & Sharing~~ ✅ Implemented
- ~~Export session as PDF or HTML (not just markdown)~~
- ~~Shareable session links (read-only)~~
- `/export md` (default) and `/export html` with styled HTML export, `@media print` styles for clean PDF via browser print, local-only (no shareable links for security)

## Lower Effort, High Polish

### 11. ~~Session Pinning & Favorites~~ ✅ Implemented
- ~~Pin important sessions to top of sidebar~~
- ~~Star/bookmark sessions~~
- Pin/unpin toggle button on sessions, pinned sessions sort to top (ORDER BY pinned DESC), pushpin icon with filled/outline states, `PUT /api/sessions/:id/pin` endpoint

### 12. ~~Prompt Variables / Templates~~ ✅ Implemented
- ~~Prompts with `{{placeholders}}` that open a fill-in form before sending~~
- ~~e.g., "Review the {{file}} focusing on {{concern}}"~~
- `extractVariables()` parses `{{variable}}` tokens, fill-in form overlay with labeled inputs, works from toolbox cards and slash commands

### 13. ~~Streaming Token Counter~~ ✅ Implemented
- ~~Show live token count as Claude responds~~
- ~~Display remaining context window~~
- `~N tokens` estimation in header during streaming (chars/4), pulsing accent animation, auto-hides on completion

### 14. ~~Dark/Light Theme Toggle~~ ✅ Implemented
- ~~CSS variables are already set up, just need a second set~~
- `html[data-theme="light"]` CSS variable overrides, sun/moon toggle in sidebar header, localStorage persistence, Mermaid + highlight.js theme switching, `/theme` command
