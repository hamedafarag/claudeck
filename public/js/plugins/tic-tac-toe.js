// Tic Tac Toe — Tab SDK plugin
// A classic tic-tac-toe game vs AI or a friend
import { registerTab } from '../ui/tab-sdk.js';

registerTab({
  id: 'tic-tac-toe',
  title: 'Tic Tac Toe',
  icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="2" x2="8" y2="22"/><line x1="16" y1="2" x2="16" y2="22"/><line x1="2" y1="8" x2="22" y2="8"/><line x1="2" y1="16" x2="22" y2="16"/></svg>',
  lazy: true,

  init(ctx) {
    const root = document.createElement('div');
    root.className = 'tic-tac-toe-tab';
    root.style.cssText = 'display:flex;flex-direction:column;flex:1;overflow:hidden;';

    // ── State ──
    let board = Array(9).fill(null); // 'X', 'O', or null
    let currentPlayer = 'X';        // X always goes first
    const mode = 'ai';
    let difficulty = 'hard';        // 'easy', 'medium', 'hard'
    let gameOver = false;
    let winLine = null;
    let scores = { X: 0, O: 0, draw: 0 };

    const WIN_COMBOS = [
      [0,1,2],[3,4,5],[6,7,8], // rows
      [0,3,6],[1,4,7],[2,5,8], // cols
      [0,4,8],[2,4,6],         // diags
    ];

    function checkWin(b) {
      for (const combo of WIN_COMBOS) {
        const [a, c, d] = combo;
        if (b[a] && b[a] === b[c] && b[a] === b[d]) return combo;
      }
      return null;
    }

    function isDraw(b) {
      return b.every(cell => cell !== null) && !checkWin(b);
    }

    // ── AI (minimax) ──
    function minimax(b, isMax, depth) {
      const win = checkWin(b);
      if (win) return b[win[0]] === 'O' ? 10 - depth : depth - 10;
      if (b.every(c => c !== null)) return 0;

      if (isMax) {
        let best = -Infinity;
        for (let i = 0; i < 9; i++) {
          if (!b[i]) { b[i] = 'O'; best = Math.max(best, minimax(b, false, depth + 1)); b[i] = null; }
        }
        return best;
      } else {
        let best = Infinity;
        for (let i = 0; i < 9; i++) {
          if (!b[i]) { b[i] = 'X'; best = Math.min(best, minimax(b, true, depth + 1)); b[i] = null; }
        }
        return best;
      }
    }

    function getAiMove() {
      const empty = board.map((v, i) => v === null ? i : -1).filter(i => i >= 0);
      if (empty.length === 0) return -1;

      if (difficulty === 'easy') {
        // Random move
        return empty[Math.floor(Math.random() * empty.length)];
      }

      if (difficulty === 'medium') {
        // 50% chance of optimal, 50% random
        if (Math.random() < 0.5) return empty[Math.floor(Math.random() * empty.length)];
      }

      // Hard: full minimax
      let bestScore = -Infinity;
      let bestMove = empty[0];
      for (const i of empty) {
        board[i] = 'O';
        const score = minimax(board, false, 0);
        board[i] = null;
        if (score > bestScore) { bestScore = score; bestMove = i; }
      }
      return bestMove;
    }

    // ── Game logic ──
    function makeMove(index) {
      if (board[index] || gameOver) return;
      board[index] = currentPlayer;
      const win = checkWin(board);
      if (win) {
        winLine = win;
        gameOver = true;
        scores[currentPlayer]++;
        render();
        return;
      }
      if (isDraw(board)) {
        gameOver = true;
        scores.draw++;
        render();
        return;
      }
      currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
      render();

      // AI turn
      if (mode === 'ai' && currentPlayer === 'O' && !gameOver) {
        setTimeout(() => {
          const move = getAiMove();
          if (move >= 0) makeMove(move);
        }, 200);
      }
    }

    function resetBoard() {
      board = Array(9).fill(null);
      currentPlayer = 'X';
      gameOver = false;
      winLine = null;
      render();
    }

    function resetScores() {
      scores = { X: 0, O: 0, draw: 0 };
      resetBoard();
    }

    // ── Render ──
    function getStatusText() {
      if (gameOver) {
        const win = checkWin(board);
        if (win) {
          const winner = board[win[0]];
          return winner === 'X' ? 'You win!' : 'AI wins!';
        }
        return "It's a draw!";
      }
      return currentPlayer === 'X' ? 'Your turn (X)' : 'AI thinking...';
    }

    function render() {
      const gridEl = root.querySelector('.ttt-grid');
      const statusEl = root.querySelector('.ttt-status');
      const scoreEl = root.querySelector('.ttt-scores');

      if (!gridEl) return;

      // Grid
      gridEl.innerHTML = '';
      for (let i = 0; i < 9; i++) {
        const cell = document.createElement('div');
        cell.className = 'ttt-cell';
        cell.dataset.index = i;
        if (board[i]) {
          cell.textContent = board[i];
          cell.classList.add(board[i] === 'X' ? 'is-x' : 'is-o');
        }
        if (winLine && winLine.includes(i)) cell.classList.add('winner');
        if (!board[i] && !gameOver) cell.classList.add('empty');
        gridEl.appendChild(cell);
      }

      // Status
      if (statusEl) {
        statusEl.textContent = getStatusText();
        statusEl.className = 'ttt-status';
        if (gameOver) {
          const win = checkWin(board);
          if (win) {
            const w = board[win[0]];
            statusEl.classList.add(w === 'X' ? 'status-win' : 'status-lose');
          } else {
            statusEl.classList.add('status-draw');
          }
        }
      }

      // Scores
      if (scoreEl) {
        scoreEl.innerHTML = `
          <span class="ttt-score-item"><span class="ttt-score-x">You</span> ${scores.X}</span>
          <span class="ttt-score-sep">·</span>
          <span class="ttt-score-item"><span class="ttt-score-draw">Draw</span> ${scores.draw}</span>
          <span class="ttt-score-sep">·</span>
          <span class="ttt-score-item"><span class="ttt-score-o">AI</span> ${scores.O}</span>
        `;
      }
    }

    // ── Build DOM ──
    root.innerHTML = `
      <div class="ttt-header">
        <div class="ttt-diff-btns">
          <button class="ttt-diff-btn" data-diff="easy">Easy</button>
          <button class="ttt-diff-btn" data-diff="medium">Med</button>
          <button class="ttt-diff-btn active" data-diff="hard">Hard</button>
        </div>
      </div>
      <div class="ttt-status">Your turn (X)</div>
      <div class="ttt-board-wrap">
        <div class="ttt-grid"></div>
      </div>
      <div class="ttt-scores"></div>
      <div class="ttt-actions">
        <button class="ttt-action-btn" data-action="restart">New Round</button>
        <button class="ttt-action-btn" data-action="reset">Reset Scores</button>
      </div>
    `;

    // ── Events ──
    root.querySelector('.ttt-grid').addEventListener('click', (e) => {
      const cell = e.target.closest('.ttt-cell');
      if (!cell) return;
      if (currentPlayer === 'O') return; // AI's turn
      makeMove(+cell.dataset.index);
    });

    root.querySelector('.ttt-diff-btns').addEventListener('click', (e) => {
      const btn = e.target.closest('.ttt-diff-btn');
      if (!btn) return;
      difficulty = btn.dataset.diff;
      root.querySelectorAll('.ttt-diff-btn').forEach(b => b.classList.toggle('active', b === btn));
      resetBoard();
    });

    root.querySelector('.ttt-actions').addEventListener('click', (e) => {
      const btn = e.target.closest('.ttt-action-btn');
      if (!btn) return;
      if (btn.dataset.action === 'restart') resetBoard();
      else if (btn.dataset.action === 'reset') resetScores();
    });

    render();
    return root;
  },
});
