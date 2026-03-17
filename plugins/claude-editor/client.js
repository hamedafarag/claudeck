// CLAUDE.md Editor — Tab SDK plugin
import { registerTab } from '/js/ui/tab-sdk.js';
import { escapeHtml } from '/js/core/utils.js';

registerTab({
  id: 'claude-md',
  title: 'CLAUDE.md',
  icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
  lazy: true,

  init(ctx) {
    let editor, statusEl, fileSelectEl, saveBtn, reloadBtn;
    let currentFile = 'CLAUDE.md';
    let originalContent = '';
    let isDirty = false;

    const FILES = [
      { value: 'CLAUDE.md', label: 'CLAUDE.md (project root)' },
    ];

    // ── Build DOM ─────────────────────────────────────
    const root = document.createElement('div');
    root.className = 'claude-editor-tab';

    root.innerHTML = `
      <div class="claude-editor-toolbar">
        <select class="claude-editor-file-select">
          ${FILES.map(f => `<option value="${escapeHtml(f.value)}">${escapeHtml(f.label)}</option>`).join('')}
        </select>
        <div class="claude-editor-actions">
          <button class="claude-editor-btn claude-editor-reload" title="Reload from disk">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          </button>
          <button class="claude-editor-btn claude-editor-save" title="Save (Cmd+S)" disabled>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Save
          </button>
        </div>
      </div>
      <div class="claude-editor-status">
        <span class="claude-editor-status-text">No project selected</span>
      </div>
      <div class="claude-editor-wrap">
        <textarea class="claude-editor-textarea" placeholder="# CLAUDE.md\n\nAdd project instructions for Claude here..." spellcheck="false"></textarea>
      </div>
      <div class="claude-editor-hints">
        <p>This file is automatically included by the Claude Code SDK as context for every conversation in this project.</p>
        <p>Common uses: coding standards, project structure, preferred patterns, things to avoid.</p>
      </div>
    `;

    editor = root.querySelector('.claude-editor-textarea');
    statusEl = root.querySelector('.claude-editor-status-text');
    fileSelectEl = root.querySelector('.claude-editor-file-select');
    saveBtn = root.querySelector('.claude-editor-save');
    reloadBtn = root.querySelector('.claude-editor-reload');

    // ── State helpers ─────────────────────────────────
    function setDirty(dirty) {
      isDirty = dirty;
      saveBtn.disabled = !dirty;
      saveBtn.classList.toggle('claude-editor-save--dirty', dirty);
    }

    function setStatus(text, type = 'info') {
      statusEl.textContent = text;
      statusEl.className = 'claude-editor-status-text';
      if (type === 'success') statusEl.classList.add('claude-editor-status--success');
      if (type === 'error') statusEl.classList.add('claude-editor-status--error');
      if (type === 'warning') statusEl.classList.add('claude-editor-status--warning');
    }

    // ── Load file ─────────────────────────────────────
    async function loadFile() {
      const projectPath = ctx.getProjectPath();
      if (!projectPath) {
        setStatus('No project selected');
        editor.value = '';
        editor.disabled = true;
        setDirty(false);
        return;
      }

      editor.disabled = false;
      setStatus(`Loading ${currentFile}...`);

      try {
        const data = await ctx.api.fetchFileContent(projectPath, currentFile);
        originalContent = data.content;
        editor.value = originalContent;
        setDirty(false);
        setStatus(`${currentFile} loaded`, 'success');
      } catch (err) {
        if (err.message.includes('ENOENT') || err.message.includes('not found') || err.message.includes('no such file')) {
          originalContent = '';
          editor.value = '';
          setDirty(false);
          setStatus(`${currentFile} not found — create it by typing and saving`, 'warning');
        } else {
          setStatus(`Error: ${err.message}`, 'error');
        }
      }
    }

    // ── Save file ─────────────────────────────────────
    async function saveFile() {
      const projectPath = ctx.getProjectPath();
      if (!projectPath || !isDirty) return;

      setStatus(`Saving ${currentFile}...`);
      saveBtn.disabled = true;

      try {
        await ctx.api.writeFileContent(projectPath, currentFile, editor.value);
        originalContent = editor.value;
        setDirty(false);
        setStatus(`${currentFile} saved`, 'success');
      } catch (err) {
        setStatus(`Save failed: ${err.message}`, 'error');
        saveBtn.disabled = false;
      }
    }

    // ── Event bindings ────────────────────────────────
    editor.addEventListener('input', () => {
      setDirty(editor.value !== originalContent);
    });

    saveBtn.addEventListener('click', saveFile);
    reloadBtn.addEventListener('click', loadFile);

    fileSelectEl.addEventListener('change', () => {
      if (isDirty && !confirm('You have unsaved changes. Discard them?')) {
        fileSelectEl.value = currentFile;
        return;
      }
      currentFile = fileSelectEl.value;
      loadFile();
    });

    // Cmd+S / Ctrl+S to save
    editor.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty) saveFile();
      }
    });

    // Tab key inserts spaces
    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
        editor.selectionStart = editor.selectionEnd = start + 2;
        setDirty(editor.value !== originalContent);
      }
    });

    // Reload when project changes
    ctx.on('projectChanged', () => {
      if (isDirty && !confirm('You have unsaved CLAUDE.md changes. Discard them?')) return;
      loadFile();
    });

    // Also reload when projects data arrives (covers initial page load)
    ctx.onState('projectsData', () => {
      setTimeout(() => loadFile(), 0);
    });

    // Initial load
    loadFile();

    return root;
  },

  onActivate() {},
  onDeactivate() {},
});
