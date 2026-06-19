const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1], [-1, 0], [0, -1], [-1, 1], [-1, -1]];
const LETTERS = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя';

class FilwordGame {
    constructor(size, words) {
        this.size = size;
        this.targetWords = words;
        this.grid = [];
        this.placedWords = [];
        this.foundWords = new Set();
        this.selectedCells = [];
        this.isSelecting = false;
        this.hintsLeft = 3;
        this.startTime = 0;
        this.elapsed = 0;
        this.timerInterval = null;
        this.listeners = {};

        this.generate();
    }

    generate() {
        for (let attempt = 0; attempt < 4000; attempt++) {
            const grid = Array.from({ length: this.size }, () => Array(this.size).fill(null));
            const placed = [];
            const words = [...this.targetWords].sort((a, b) => b.length - a.length);
            let ok = true;

            for (const word of words) {
                const cells = this.findWordCells(grid, word);
                if (!cells) { ok = false; break; }
                for (let i = 0; i < word.length; i++) {
                    grid[cells[i].row][cells[i].col] = word[i];
                }
                placed.push({ word, cells });
            }

            if (ok) {
                for (let r = 0; r < this.size; r++) {
                    for (let c = 0; c < this.size; c++) {
                        if (grid[r][c] === null) {
                            grid[r][c] = LETTERS[Math.floor(Math.random() * LETTERS.length)];
                        }
                    }
                }
                this.grid = grid;
                this.placedWords = placed;

                for (const pw of this.placedWords) {
                    let wordOnGrid = '';
                    for (const { row, col } of pw.cells) {
                        wordOnGrid += this.grid[row][col];
                    }
                    if (wordOnGrid !== pw.word) { ok = false; break; }
                }
                if (ok) return;
            }
        }
        throw new Error('Не удалось сгенерировать поле');
    }

    findWordCells(grid, word) {
        const straightPlacements = [];

        for (const [dr, dc] of DIRS) {
            for (let r = 0; r < this.size; r++) {
                for (let c = 0; c < this.size; c++) {
                    let fit = true;
                    for (let i = 0; i < word.length; i++) {
                        const nr = r + dr * i, nc = c + dc * i;
                        if (nr < 0 || nr >= this.size || nc < 0 || nc >= this.size) { fit = false; break; }
                        if (grid[nr][nc] !== null && grid[nr][nc] !== word[i]) { fit = false; break; }
                    }
                    if (fit) {
                        const cells = [];
                        for (let i = 0; i < word.length; i++) cells.push({ row: r + dr * i, col: c + dc * i });
                        straightPlacements.push(cells);
                    }
                }
            }
        }

        if (word.length >= 3 && straightPlacements.length > 0) {
            const emptyCount = grid.reduce((sum, row) => sum + row.filter(c => c === null).length, 0);
            const emptyRatio = emptyCount / (this.size * this.size);
            const lChance = Math.max(0, 0.4 - (1 - emptyRatio) * 0.6 - Math.max(0, word.length - 4) * 0.05);
            if (Math.random() < lChance) {
                const lCells = this.findLShape(grid, word);
                if (lCells) return lCells;
            }
        }

        if (straightPlacements.length > 0) {
            return straightPlacements[Math.floor(Math.random() * straightPlacements.length)];
        }

        return this.findLShape(grid, word);
    }

    findLShape(grid, word) {
        const N = word.length;
        if (N < 3) return null;
        const cardDirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];

        for (let attempt = 0; attempt < 500; attempt++) {
            const r = Math.floor(Math.random() * this.size);
            const c = Math.floor(Math.random() * this.size);
            const [dr1, dc1] = cardDirs[Math.floor(Math.random() * 4)];
            const split = 1 + Math.floor(Math.random() * (N - 2));

            for (const [dr2, dc2] of [[dc1, -dr1], [-dc1, dr1]]) {
                let ok = true;
                for (let i = 0; i < split; i++) {
                    const nr = r + dr1 * i, nc = c + dc1 * i;
                    if (nr < 0 || nr >= this.size || nc < 0 || nc >= this.size) { ok = false; break; }
                    if (grid[nr][nc] !== null && grid[nr][nc] !== word[i]) { ok = false; break; }
                }
                if (!ok) continue;

                const tr = r + dr1 * (split - 1), tc = c + dc1 * (split - 1);
                for (let i = 1; i <= N - split; i++) {
                    const nr = tr + dr2 * i, nc = tc + dc2 * i;
                    if (nr < 0 || nr >= this.size || nc < 0 || nc >= this.size) { ok = false; break; }
                    if (grid[nr][nc] !== null && grid[nr][nc] !== word[split - 1 + i]) { ok = false; break; }
                }
                if (!ok) continue;

                const cells = [];
                for (let i = 0; i < split; i++) cells.push({ row: r + dr1 * i, col: c + dc1 * i });
                for (let i = 1; i <= N - split; i++) cells.push({ row: tr + dr2 * i, col: tc + dc2 * i });
                return cells;
            }
        }
        return null;
    }

    on(event, fn) {
        (this.listeners[event] = this.listeners[event] || []).push(fn);
    }

    emit(event, data) {
        (this.listeners[event] || []).forEach(fn => fn(data));
    }

    beginSelection(row, col) {
        this.selectedCells = [{ row, col }];
        this.isSelecting = true;
        this.emit('selection-change', this.selectedCells);
    }

    continueSelection(row, col) {
        if (!this.isSelecting) return;
        const last = this.selectedCells[this.selectedCells.length - 1];
        const dr = row - last.row;
        const dc = col - last.col;

        if (Math.abs(dr) > 1 || Math.abs(dc) > 1) return;
        if (dr === 0 && dc === 0) return;

        const prev = this.selectedCells.length >= 2
            ? this.selectedCells[this.selectedCells.length - 2]
            : null;
        if (prev && prev.row === row && prev.col === col) {
            this.selectedCells.pop();
            this.emit('selection-change', this.selectedCells);
            return;
        }

        for (const c of this.selectedCells) {
            if (c.row === row && c.col === col) return;
        }

        this.selectedCells.push({ row, col });
        this.emit('selection-change', this.selectedCells);
    }

    endSelection() {
        this.isSelecting = false;
        if (this.selectedCells.length < 2) {
            this.selectedCells = [];
            this.emit('selection-change', []);
            return null;
        }

        const sel = this.selectedCells;

        let found = null;
        for (const pw of this.placedWords) {
            if (this.foundWords.has(pw.word)) continue;
            if (pw.cells.length !== sel.length) continue;

            let match = true, revMatch = true;
            for (let i = 0; i < sel.length; i++) {
                if (sel[i].row !== pw.cells[i].row || sel[i].col !== pw.cells[i].col) match = false;
                if (sel[i].row !== pw.cells[pw.cells.length - 1 - i].row ||
                    sel[i].col !== pw.cells[pw.cells.length - 1 - i].col) revMatch = false;
            }
            if (match || revMatch) { found = pw.word; break; }
        }

        this.selectedCells = [];
        this.emit('selection-change', []);

        if (found) {
            this.foundWords.add(found);
            this.emit('word-found', found);
            if (this.foundWords.size === this.targetWords.length) {
                this.stopTimer();
                this.emit('game-complete', this.elapsed);
            }
        }

        return found;
    }

    useHint() {
        if (this.hintsLeft <= 0) return null;
        const unfound = this.placedWords.filter(p => !this.foundWords.has(p.word));
        if (unfound.length === 0) return null;

        const target = unfound[Math.floor(Math.random() * unfound.length)];
        const cells = target.cells.map(c => ({ ...c }));

        this.hintsLeft--;
        this.emit('hint', cells);
        return cells;
    }

    getWordCells(word) {
        const pw = this.placedWords.find(p => p.word === word);
        if (!pw) return [];
        return pw.cells.map(c => ({ ...c }));
    }

    startTimer() {
        this.startTime = Date.now();
        this.timerInterval = setInterval(() => {
            this.elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            this.emit('timer', this.elapsed);
        }, 200);
    }

    stopTimer() {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
    }

    formatTime(seconds) {
        const m = String(Math.floor(seconds / 60)).padStart(2, '0');
        const s = String(seconds % 60).padStart(2, '0');
        return `${m}:${s}`;
    }

    destroy() {
        this.stopTimer();
        this.listeners = {};
    }
}
