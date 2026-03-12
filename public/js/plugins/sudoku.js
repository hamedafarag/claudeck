// Sudoku — Tab SDK plugin
// A mini sudoku game to play while waiting for tasks to finish
import { registerTab } from '../ui/tab-sdk.js';

registerTab({
  id: 'sudoku',
  title: 'Sudoku',
  icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>',
  lazy: true,

  init(ctx) {
    const root = document.createElement('div');
    root.className = 'sudoku-tab';
    root.style.cssText = 'display:flex;flex-direction:column;flex:1;overflow:hidden;';

    // ── State ──
    let board = [];        // current board (0 = empty)
    let solution = [];     // full solution
    let fixed = [];        // true if cell was part of the puzzle
    let selectedCell = null;
    let errors = new Set();
    let timerInterval = null;
    let seconds = 0;
    let gameWon = false;

    // ── Sudoku Generator ──
    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    function isValid(grid, row, col, num) {
      for (let i = 0; i < 9; i++) {
        if (grid[row][i] === num || grid[i][col] === num) return false;
      }
      const br = Math.floor(row / 3) * 3, bc = Math.floor(col / 3) * 3;
      for (let r = br; r < br + 3; r++)
        for (let c = bc; c < bc + 3; c++)
          if (grid[r][c] === num) return false;
      return true;
    }

    function solve(grid) {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (grid[r][c] === 0) {
            const nums = shuffle([1,2,3,4,5,6,7,8,9]);
            for (const n of nums) {
              if (isValid(grid, r, c, n)) {
                grid[r][c] = n;
                if (solve(grid)) return true;
                grid[r][c] = 0;
              }
            }
            return false;
          }
        }
      }
      return true;
    }

    function generatePuzzle(clues = 36) {
      const grid = Array.from({length: 9}, () => Array(9).fill(0));
      solve(grid);
      solution = grid.map(r => [...r]);

      board = grid.map(r => [...r]);
      fixed = Array.from({length: 9}, () => Array(9).fill(true));

      const cells = shuffle([...Array(81).keys()]);
      const toRemove = 81 - clues;
      for (let i = 0; i < toRemove; i++) {
        const r = Math.floor(cells[i] / 9), c = cells[i] % 9;
        board[r][c] = 0;
        fixed[r][c] = false;
      }
    }

    // ── Timer ──
    function startTimer() {
      stopTimer();
      seconds = 0;
      gameWon = false;
      timerInterval = setInterval(() => {
        if (!gameWon) {
          seconds++;
          const el = root.querySelector('.sudoku-timer');
          if (el) el.textContent = formatTime(seconds);
        }
      }, 1000);
    }

    function stopTimer() {
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    }

    function formatTime(s) {
      const m = Math.floor(s / 60);
      return `${m}:${String(s % 60).padStart(2, '0')}`;
    }

    // ── Render ──
    function render() {
      const gridEl = root.querySelector('.sudoku-grid');
      if (!gridEl) return;
      gridEl.innerHTML = '';

      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const cell = document.createElement('div');
          cell.className = 'sudoku-cell';
          cell.dataset.row = r;
          cell.dataset.col = c;

          if (fixed[r][c]) cell.classList.add('fixed');
          if (selectedCell && selectedCell[0] === r && selectedCell[1] === c) cell.classList.add('selected');
          if (errors.has(`${r},${c}`)) cell.classList.add('error');

          // Highlight same number
          if (selectedCell && board[r][c] !== 0 && board[selectedCell[0]][selectedCell[1]] === board[r][c]) {
            cell.classList.add('highlight');
          }
          // Highlight same row/col/box
          if (selectedCell) {
            const [sr, sc] = selectedCell;
            const sameRow = r === sr;
            const sameCol = c === sc;
            const sameBox = Math.floor(r/3) === Math.floor(sr/3) && Math.floor(c/3) === Math.floor(sc/3);
            if (sameRow || sameCol || sameBox) cell.classList.add('in-scope');
          }

          // Box borders
          if (c % 3 === 0 && c !== 0) cell.classList.add('box-left');
          if (r % 3 === 0 && r !== 0) cell.classList.add('box-top');

          cell.textContent = board[r][c] || '';
          gridEl.appendChild(cell);
        }
      }

      // Update remaining count
      const remaining = board.flat().filter(v => v === 0).length;
      const remEl = root.querySelector('.sudoku-remaining');
      if (remEl) remEl.textContent = `${remaining} empty`;
    }

    function checkErrors() {
      errors.clear();
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (board[r][c] === 0) continue;
          const val = board[r][c];
          // Check row
          for (let i = 0; i < 9; i++) {
            if (i !== c && board[r][i] === val) { errors.add(`${r},${c}`); errors.add(`${r},${i}`); }
          }
          // Check col
          for (let i = 0; i < 9; i++) {
            if (i !== r && board[i][c] === val) { errors.add(`${r},${c}`); errors.add(`${i},${c}`); }
          }
          // Check box
          const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
          for (let rr = br; rr < br+3; rr++)
            for (let cc = bc; cc < bc+3; cc++)
              if ((rr !== r || cc !== c) && board[rr][cc] === val) { errors.add(`${r},${c}`); errors.add(`${rr},${cc}`); }
        }
      }
    }

    function checkWin() {
      if (board.flat().some(v => v === 0)) return false;
      if (errors.size > 0) return false;
      return true;
    }

    function newGame(difficulty) {
      const clues = difficulty === 'easy' ? 42 : difficulty === 'medium' ? 33 : 26;
      generatePuzzle(clues);
      selectedCell = null;
      errors.clear();
      gameWon = false;
      startTimer();
      render();
      const msg = root.querySelector('.sudoku-message');
      if (msg) msg.textContent = '';
      // Update active difficulty button
      root.querySelectorAll('.sudoku-diff-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.diff === difficulty);
      });
    }

    // ── Build DOM ──
    root.innerHTML = `
      <div class="sudoku-header">
        <div class="sudoku-controls">
          <button class="sudoku-diff-btn active" data-diff="easy">Easy</button>
          <button class="sudoku-diff-btn" data-diff="medium">Medium</button>
          <button class="sudoku-diff-btn" data-diff="hard">Hard</button>
        </div>
        <div class="sudoku-info">
          <span class="sudoku-timer">0:00</span>
          <span class="sudoku-remaining">0 empty</span>
        </div>
      </div>
      <div class="sudoku-board-wrap">
        <div class="sudoku-grid"></div>
      </div>
      <div class="sudoku-numpad"></div>
      <div class="sudoku-actions">
        <button class="sudoku-action-btn" data-action="hint">Hint</button>
        <button class="sudoku-action-btn" data-action="erase">Erase</button>
        <button class="sudoku-action-btn" data-action="check">Check</button>
        <button class="sudoku-action-btn" data-action="new">New Game</button>
      </div>
      <div class="sudoku-message"></div>
    `;

    // Number pad
    const numpad = root.querySelector('.sudoku-numpad');
    for (let n = 1; n <= 9; n++) {
      const btn = document.createElement('button');
      btn.className = 'sudoku-num-btn';
      btn.textContent = n;
      btn.addEventListener('click', () => placeNumber(n));
      numpad.appendChild(btn);
    }

    function placeNumber(n) {
      if (!selectedCell || gameWon) return;
      const [r, c] = selectedCell;
      if (fixed[r][c]) return;
      board[r][c] = n;
      checkErrors();
      render();
      if (checkWin()) {
        gameWon = true;
        stopTimer();
        const msg = root.querySelector('.sudoku-message');
        if (msg) msg.textContent = `Solved in ${formatTime(seconds)}!`;
      }
    }

    // ── Grid click ──
    root.querySelector('.sudoku-grid').addEventListener('click', (e) => {
      const cell = e.target.closest('.sudoku-cell');
      if (!cell || gameWon) return;
      selectedCell = [+cell.dataset.row, +cell.dataset.col];
      render();
    });

    // ── Action buttons ──
    root.querySelector('.sudoku-actions').addEventListener('click', (e) => {
      const btn = e.target.closest('.sudoku-action-btn');
      if (!btn) return;
      const action = btn.dataset.action;

      if (action === 'new') {
        const activeDiff = root.querySelector('.sudoku-diff-btn.active');
        newGame(activeDiff ? activeDiff.dataset.diff : 'easy');
      } else if (action === 'erase') {
        if (!selectedCell) return;
        const [r, c] = selectedCell;
        if (!fixed[r][c]) { board[r][c] = 0; checkErrors(); render(); }
      } else if (action === 'hint') {
        if (!selectedCell || gameWon) return;
        const [r, c] = selectedCell;
        if (fixed[r][c] || board[r][c] === solution[r][c]) return;
        board[r][c] = solution[r][c];
        fixed[r][c] = true;
        checkErrors();
        render();
        if (checkWin()) {
          gameWon = true;
          stopTimer();
          const msg = root.querySelector('.sudoku-message');
          if (msg) msg.textContent = `Solved in ${formatTime(seconds)}!`;
        }
      } else if (action === 'check') {
        checkErrors();
        render();
        const msg = root.querySelector('.sudoku-message');
        if (msg) msg.textContent = errors.size === 0 ? 'No errors found!' : `${errors.size} conflicting cells`;
        setTimeout(() => { if (msg) msg.textContent = ''; }, 2000);
      }
    });

    // ── Difficulty buttons ──
    root.querySelector('.sudoku-controls').addEventListener('click', (e) => {
      const btn = e.target.closest('.sudoku-diff-btn');
      if (!btn) return;
      newGame(btn.dataset.diff);
    });

    // ── Keyboard input ──
    root.addEventListener('keydown', (e) => {
      if (!selectedCell || gameWon) return;
      const [r, c] = selectedCell;

      if (e.key >= '1' && e.key <= '9') {
        placeNumber(+e.key);
      } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
        if (!fixed[r][c]) { board[r][c] = 0; checkErrors(); render(); }
      } else if (e.key === 'ArrowUp' && r > 0) { selectedCell = [r-1, c]; render(); }
      else if (e.key === 'ArrowDown' && r < 8) { selectedCell = [r+1, c]; render(); }
      else if (e.key === 'ArrowLeft' && c > 0) { selectedCell = [r, c-1]; render(); }
      else if (e.key === 'ArrowRight' && c < 8) { selectedCell = [r, c+1]; render(); }
    });

    // Make root focusable for keyboard events
    root.tabIndex = 0;

    // Start first game
    newGame('easy');

    return root;
  },

  onActivate() {
    const root = document.querySelector('.sudoku-tab');
    if (root) root.focus();
  },

  onDestroy() {
    // Timer cleanup handled by closure
  },
});
