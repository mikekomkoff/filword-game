const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
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
        for (let attempt = 0; attempt < 2000; attempt++) {
            const grid = Array.from({ length: this.size }, () => Array(this.size).fill(null));
            const placed = [];
            const words = [...this.targetWords].sort((a, b) => b.length - a.length);
            let ok = true;

            for (const word of words) {
                const placements = [];

                for (const [dr, dc] of DIRS) {
                    for (let r = 0; r < this.size; r++) {
                        for (let c = 0; c < this.size; c++) {
                            let fit = true;
                            for (let i = 0; i < word.length; i++) {
                                const nr = r + dr * i;
                                const nc = c + dc * i;
                                if (nr < 0 || nr >= this.size || nc < 0 || nc >= this.size) { fit = false; break; }
                                if (grid[nr][nc] !== null && grid[nr][nc] !== word[i]) { fit = false; break; }
                            }
                            if (fit) placements.push({ row: r, col: c, dr, dc });
                        }
                    }
                }

                if (placements.length === 0) { ok = false; break; }

                const p = placements[Math.floor(Math.random() * placements.length)];
                for (let i = 0; i < word.length; i++) {
                    grid[p.row + p.dr * i][p.col + p.dc * i] = word[i];
                }
                placed.push({ word, ...p });
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
                return;
            }
        }
        throw new Error('Не удалось сгенерировать поле');
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

        if (this.selectedCells.length >= 2) {
            const prev = this.selectedCells[this.selectedCells.length - 2];
            if (prev.row === row && prev.col === col) {
                this.selectedCells.pop();
                this.emit('selection-change', this.selectedCells);
                return;
            }
        }

        if (this.selectedCells.length >= 2) {
            const f = this.selectedCells[0];
            const s = this.selectedCells[1];
            const dirR = s.row - f.row;
            const dirC = s.col - f.col;
            const expectedR = last.row + dirR;
            const expectedC = last.col + dirC;
            if (row !== expectedR || col !== expectedC) return;
        }

        this.selectedCells.push({ row, col });
        this.emit('selection-change', this.selectedCells);
    }

    endSelection() {
        this.isSelecting = false;
        if (this.selectedCells.length < 2) {
            this.selectedCells = [];
            this.emit('selection-change', this.selectedCells);
            return null;
        }

        const word = this.selectedCells.map(({ row, col }) => this.grid[row][col]).join('');
        const reversed = word.split('').reverse().join('');

        let found = null;
        for (const w of this.targetWords) {
            if (this.foundWords.has(w)) continue;
            if (w === word || w === reversed) { found = w; break; }
        }

        this.selectedCells = [];

        if (found) {
            this.foundWords.add(found);
            this.emit('word-found', found);
            if (this.foundWords.size === this.targetWords.length) {
                this.stopTimer();
                this.emit('game-complete', this.elapsed);
            }
        } else {
            this.emit('selection-change', []);
        }

        return found;
    }

    cancelSelection() {
        this.isSelecting = false;
        this.selectedCells = [];
        this.emit('selection-change', []);
    }

    useHint() {
        if (this.hintsLeft <= 0) return null;
        const unfound = this.placedWords.filter(p => !this.foundWords.has(p.word));
        if (unfound.length === 0) return null;

        const target = unfound[Math.floor(Math.random() * unfound.length)];
        const cells = [];
        for (let i = 0; i < target.word.length; i++) {
            cells.push({ row: target.row + target.dr * i, col: target.col + target.dc * i });
        }

        this.hintsLeft--;
        this.emit('hint', cells);
        return cells;
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
