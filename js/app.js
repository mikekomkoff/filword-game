const App = {
    game: null,
    difficulty: 'easy',
    cellSize: 48,
    gridGap: 3,
    isLevelComplete: false,
    hintTimeout: null,

    init() {
        this.setupTelegram();
        this.setupTheme();
        this.bindStartScreen();
        this.bindGameScreen();
        this.bindWinScreen();
        this.showScreen('start-screen');

        window.addEventListener('resize', () => {
            if (this.game) this.calculateCellSize();
        });
    },

    setupTelegram() {
        if (window.Telegram && Telegram.WebApp) {
            Telegram.WebApp.ready();
            Telegram.WebApp.expand();
            this.tg = Telegram.WebApp;
        }
    },

    haptic(type) {
        if (this.tg && this.tg.HapticFeedback) {
            if (type === 'success') this.tg.HapticFeedback.notificationOccurred('success');
            else if (type === 'error') this.tg.HapticFeedback.notificationOccurred('error');
            else this.tg.HapticFeedback.impactOccurred('light');
        }
    },

    setupTheme() {
        if (!window.Telegram || !Telegram.WebApp) return;
        const tp = Telegram.WebApp.themeParams;
        const map = {
            '--tg-theme-bg-color': tp.bg_color,
            '--tg-theme-text-color': tp.text_color,
            '--tg-theme-button-color': tp.button_color,
            '--tg-theme-button-text-color': tp.button_text_color,
            '--tg-theme-secondary-bg-color': tp.secondary_bg_color,
            '--tg-theme-hint-color': tp.hint_color,
            '--tg-theme-section-bg-color': tp.section_bg_color,
        };
        Object.entries(map).forEach(([key, val]) => {
            if (val) document.documentElement.style.setProperty(key, val);
        });
        const inset = Telegram.WebApp.safeAreaInset;
        if (inset) {
            document.documentElement.style.setProperty('--safe-bottom', inset.bottom + 'px');
        }
    },

    bindStartScreen() {
        const btns = document.querySelectorAll('.diff-btn');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                btns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.difficulty = btn.dataset.level;
            });
        });

        document.getElementById('start-btn').addEventListener('click', () => {
            this.startGame();
        });
    },

    bindGameScreen() {
        document.getElementById('back-btn').addEventListener('click', () => {
            this.exitGame();
        });

        document.getElementById('hint-btn').addEventListener('click', () => {
            if (!this.game || this.isLevelComplete) return;
            const cells = this.game.useHint();
            if (cells) {
                this.haptic('light');
                this.flashHint(cells);
                this.updateHintsCount();
            }
        });

        document.getElementById('new-game-btn').addEventListener('click', () => {
            if (this.game) this.game.destroy();
            this.startGame();
        });

        this._onPointerMove = (e) => {
            if (!this.game || !this.game.isSelecting || this.isLevelComplete) return;
            const el = document.elementFromPoint(e.clientX, e.clientY);
            const cell = el?.closest('.grid-cell');
            if (!cell) return;
            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.col);
            this.game.continueSelection(row, col);
            this.syncCellVisuals();
        };

        this._onPointerUp = () => {
            if (!this.game || !this.game.isSelecting) return;
            const selectLen = this.game.selectedCells.length;
            const found = this.game.endSelection();
            this.syncCellVisuals();
            this.renderWordList();
            if (!found && selectLen >= 2) {
                this.haptic('error');
            }
        };

        this._onPointerDown = (e) => {
            if (!this.game || this.isLevelComplete) return;
            const cell = e.target.closest('.grid-cell');
            if (!cell) return;
            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.col);
            this.game.beginSelection(row, col);
            this.syncCellVisuals();
        };

        const gridEl = document.getElementById('grid');
        gridEl.addEventListener('pointerdown', this._onPointerDown);
        gridEl.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
        document.addEventListener('pointermove', this._onPointerMove);
        document.addEventListener('pointerup', this._onPointerUp);
    },

    bindWinScreen() {
        document.getElementById('next-level-btn').addEventListener('click', () => {
            const levels = ['easy', 'normal', 'medium', 'hard'];
            const idx = levels.indexOf(this.difficulty);
            if (idx < levels.length - 1) {
                this.difficulty = levels[idx + 1];
                document.querySelectorAll('.diff-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.level === this.difficulty);
                });
            }
            this.startGame();
        });

        document.getElementById('new-game-win-btn').addEventListener('click', () => {
            this.startGame();
        });

        document.getElementById('menu-btn').addEventListener('click', () => {
            this.exitGame();
        });
    },

    exitGame() {
        if (this.game) this.game.destroy();
        this.game = null;
        this.isLevelComplete = false;
        this.showScreen('start-screen');
    },

    startGame() {
        const config = WORDS_BY_DIFFICULTY[this.difficulty];
        const sets = config.sets;
        const wordSet = sets[Math.floor(Math.random() * sets.length)];

        if (this.game) this.game.destroy();

        try {
            this.game = new FilwordGame(config.size, wordSet);
        } catch (e) {
            alert('Ошибка генерации поля. Попробуйте ещё раз.');
            return;
        }

        this.isLevelComplete = false;
        this.calculateCellSize();

        this.game.on('timer', (seconds) => {
            document.getElementById('timer').textContent = this.game.formatTime(seconds);
        });

        this.game.on('word-found', () => {
            this.haptic('success');
            this.renderWordList();
            this.renderFoundCells();
        });

        this.game.on('game-complete', (time) => {
            this.isLevelComplete = true;
            document.getElementById('final-time').textContent = this.game.formatTime(time);
            setTimeout(() => this.showScreen('win-screen'), 500);
        });

        this.renderGrid();
        this.renderWordList();
        this.updateHintsCount();
        this.showScreen('game-screen');
        this.game.startTimer();
    },

    calculateCellSize() {
        if (!this.game) return;
        const size = this.game.size;
        const gapTotal = this.gridGap * (size - 1);
        const maxW = window.innerWidth - 32;
        const maxH = window.innerHeight * 0.52;
        const cellW = Math.floor((maxW - gapTotal) / size);
        const cellH = Math.floor((maxH - gapTotal) / size);
        this.cellSize = Math.max(28, Math.min(cellW, cellH, 58));
        document.documentElement.style.setProperty('--cell-size', this.cellSize + 'px');
    },

    renderGrid() {
        if (!this.game) return;
        const gridEl = document.getElementById('grid');
        gridEl.innerHTML = '';
        const cols = `repeat(${this.game.size}, var(--cell-size))`;
        gridEl.style.gridTemplateColumns = cols;
        gridEl.style.gridTemplateRows = cols;

        for (let r = 0; r < this.game.size; r++) {
            for (let c = 0; c < this.game.size; c++) {
                const cell = document.createElement('div');
                cell.className = 'grid-cell';
                cell.dataset.row = r;
                cell.dataset.col = c;
                cell.textContent = this.game.grid[r][c].toUpperCase();
                gridEl.appendChild(cell);
            }
        }
    },

    syncCellVisuals() {
        document.querySelectorAll('.grid-cell.selected').forEach(el => el.classList.remove('selected'));

        if (!this.game || !this.game.selectedCells) return;
        for (const { row, col } of this.game.selectedCells) {
            const cell = document.querySelector(`.grid-cell[data-row="${row}"][data-col="${col}"]`);
            if (cell) cell.classList.add('selected');
        }
    },

    renderFoundCells() {
        if (!this.game) return;
        document.querySelectorAll('.grid-cell.found').forEach(el => el.classList.remove('found'));

        for (const pw of this.game.placedWords) {
            if (!this.game.foundWords.has(pw.word)) continue;
            for (const { row, col } of pw.cells) {
                const cell = document.querySelector(`.grid-cell[data-row="${row}"][data-col="${col}"]`);
                if (cell) cell.classList.add('found');
            }
        }
    },

    renderWordList() {
        if (!this.game) return;
        const listEl = document.getElementById('word-list');
        if (this.difficulty === 'medium' || this.difficulty === 'hard') {
            listEl.style.display = 'none';
            return;
        }
        listEl.style.display = '';
        listEl.innerHTML = '';
        for (const word of this.game.targetWords) {
            const chip = document.createElement('span');
            chip.className = 'word-chip';
            if (this.game.foundWords.has(word)) chip.classList.add('found');
            chip.textContent = word;
            listEl.appendChild(chip);
        }
    },

    updateHintsCount() {
        if (!this.game) return;
        const el = document.getElementById('hints-count');
        el.textContent = '\uD83D\uDCA1' + this.game.hintsLeft;
    },

    flashHint(cells) {
        if (this.hintTimeout) clearTimeout(this.hintTimeout);

        cells.forEach(({ row, col }) => {
            const cell = document.querySelector(`.grid-cell[data-row="${row}"][data-col="${col}"]`);
            if (cell) cell.classList.add('hint');
        });

        this.hintTimeout = setTimeout(() => {
            document.querySelectorAll('.grid-cell.hint').forEach(el => el.classList.remove('hint'));
            this.hintTimeout = null;
        }, 1200);
    },

    showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
