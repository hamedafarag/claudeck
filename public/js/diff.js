// Diff rendering

export function computeLineDiff(oldLines, newLines) {
  const m = oldLines.length, n = newLines.length;
  // Guard against huge diffs
  if (m + n > 1000) return null;

  // LCS via DP
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  const result = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: "context", line: oldLines[i - 1], oldNum: i, newNum: j });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "added", line: newLines[j - 1], newNum: j });
      j--;
    } else {
      result.unshift({ type: "removed", line: oldLines[i - 1], oldNum: i });
      i--;
    }
  }
  return result;
}

export function renderDiffView(oldStr, newStr, filePath) {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const diff = computeLineDiff(oldLines, newLines);
  if (!diff) return null;

  const container = document.createElement("div");
  container.className = "diff-view";

  const header = document.createElement("div");
  header.className = "diff-header";
  header.textContent = filePath || "Edit";
  container.appendChild(header);

  const body = document.createElement("div");
  body.className = "diff-body";

  for (const entry of diff) {
    const line = document.createElement("div");
    line.className = `diff-line diff-${entry.type}`;

    const gutter = document.createElement("span");
    gutter.className = "diff-gutter";
    if (entry.type === "removed") {
      gutter.textContent = entry.oldNum;
    } else if (entry.type === "added") {
      gutter.textContent = entry.newNum;
    } else {
      gutter.textContent = entry.oldNum;
    }

    const sign = document.createElement("span");
    sign.className = "diff-sign";
    sign.textContent = entry.type === "added" ? "+" : entry.type === "removed" ? "-" : " ";

    const content = document.createElement("span");
    content.className = "diff-content";
    content.textContent = entry.line;

    line.appendChild(gutter);
    line.appendChild(sign);
    line.appendChild(content);
    body.appendChild(line);
  }

  container.appendChild(body);
  return container;
}

export function renderAdditionsView(content, filePath) {
  const lines = content.split("\n");
  if (lines.length > 1000) return null;

  const container = document.createElement("div");
  container.className = "diff-view";

  const header = document.createElement("div");
  header.className = "diff-header";
  header.textContent = filePath || "Write (new file)";
  container.appendChild(header);

  const body = document.createElement("div");
  body.className = "diff-body";

  for (let i = 0; i < lines.length; i++) {
    const line = document.createElement("div");
    line.className = "diff-line diff-added";

    const gutter = document.createElement("span");
    gutter.className = "diff-gutter";
    gutter.textContent = i + 1;

    const sign = document.createElement("span");
    sign.className = "diff-sign";
    sign.textContent = "+";

    const lineContent = document.createElement("span");
    lineContent.className = "diff-content";
    lineContent.textContent = lines[i];

    line.appendChild(gutter);
    line.appendChild(sign);
    line.appendChild(lineContent);
    body.appendChild(line);
  }

  container.appendChild(body);
  return container;
}
