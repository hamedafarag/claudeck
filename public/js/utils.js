// Pure utility functions

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function getToolDetail(name, input) {
  if (!input) return "";
  if (input.file_path) return escapeHtml(input.file_path);
  if (input.command) return escapeHtml(input.command.slice(0, 80));
  if (input.pattern) return escapeHtml(input.pattern);
  if (input.query) return escapeHtml(input.query);
  if (input.prompt) return escapeHtml(input.prompt.slice(0, 80));
  return "";
}

export function scrollToBottom(pane) {
  pane.messagesDiv.scrollTop = pane.messagesDiv.scrollHeight;
}
