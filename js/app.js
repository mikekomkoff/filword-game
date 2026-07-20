const WORD_COLORS = [
    '#E74C3C',
    '#2ECC71',
    '#3498DB',
    '#F39C12',
    '#9B59B6',
    '#1ABC9C',
    '#E67E22',
    '#2980B9',
];

const App = {
    game: null,
    difficulty: 'easy',
    cellSize: 48,
    gridGap: 3,
    isLevelComplete: false,
    hintTimeout: null,
    revealWordsTimeout: null,
    wordsRevealLeft: 0,
    selectedTopics: new Set(),
    audioCtx: null,

    init() {
        this.setupTelegram();
        this.setupTheme();
        this.bindStartScreen();
        this.bindGameScreen();
        this.bindWinScreen();
        this.renderTopics();
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

    getAudioCtx() {
        if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        return this.audioCtx;
    },

    playTone(freq, duration, startTime, type) {
        const ctx = this.getAudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
    },

    playFound() {
        const ctx = this.getAudioCtx();
        const t = ctx.currentTime;
        this.playTone(523, 0.08, t, 'sine');
        this.playTone(659, 0.08, t + 0.06, 'sine');
        this.playTone(784, 0.12, t + 0.12, 'sine');
    },

    playError() {
        const ctx = this.getAudioCtx();
        const t = ctx.currentTime;
        this.playTone(200, 0.15, t, 'square');
    },

    playComplete() {
        const ctx = this.getAudioCtx();
        const t = ctx.currentTime;
        [523, 587, 659, 784, 1047].forEach((f, i) => {
            this.playTone(f, 0.15, t + i * 0.1, 'sine');
        });
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

        document.getElementById('reveal-words-btn').addEventListener('click', () => {
            this.revealWords();
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
                this.playError();
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
        if (this.hintTimeout) {
            clearTimeout(this.hintTimeout);
            this.hintTimeout = null;
        }
        if (this.revealWordsTimeout) {
            clearTimeout(this.revealWordsTimeout);
            this.revealWordsTimeout = null;
        }
        if (this.game) this.game.destroy();
        this.game = null;
        this.isLevelComplete = false;
        this.showScreen('start-screen');
    },

    startGame() {
        if (this.hintTimeout) {
            clearTimeout(this.hintTimeout);
            this.hintTimeout = null;
        }
        if (this.revealWordsTimeout) {
            clearTimeout(this.revealWordsTimeout);
            this.revealWordsTimeout = null;
        }

        const config = WORDS_BY_DIFFICULTY[this.difficulty];
        let sets = config.sets;
        if (this.selectedTopics.size > 0) {
            sets = sets.filter(s => this.selectedTopics.has(s.topic));
        }
        if (sets.length === 0) {
            alert('Нет наборов по выбранным темам. Выберите другие темы или нажмите «Все темы».');
            return;
        }
        const chosen = sets[Math.floor(Math.random() * sets.length)];
        const wordSet = chosen.words;
        const topic = chosen.topic;

        if (this.game) this.game.destroy();

        try {
            this.game = new FilwordGame(config.size, wordSet);
        } catch (e) {
            alert('Ошибка генерации поля. Попробуйте ещё раз.');
            return;
        }

        this.isLevelComplete = false;
        this.calculateCellSize();

        const topicEl = document.getElementById('topic-label');
        topicEl.textContent = topic;
        topicEl.style.display = '';

        const revealBtn = document.getElementById('reveal-words-btn');
        const isRevealLevel = this.difficulty === 'medium' || this.difficulty === 'hard';
        revealBtn.style.display = isRevealLevel ? '' : 'none';
        this.wordsRevealLeft = isRevealLevel ? 3 : 0;
        this.updateWordsRevealCount();

        const revealedEl = document.getElementById('revealed-words');
        revealedEl.classList.remove('visible');
        revealedEl.innerHTML = '';

        this.game.on('timer', (seconds) => {
            document.getElementById('timer').textContent = this.game.formatTime(seconds);
        });

        this.game.on('word-found', () => {
            this.haptic('success');
            this.playFound();
            this.renderWordList();
            this.renderFoundCells();
            this.updateProgress();
        });

        this.game.on('game-complete', (time) => {
            this.isLevelComplete = true;
            this.haptic('success');
            this.playComplete();
            document.getElementById('final-time').textContent = this.game.formatTime(time);
            setTimeout(() => this.showScreen('win-screen'), 500);
        });

        this.renderGrid();
        this.renderWordList();
        this.updateHintsCount();
        this.updateProgress();
        this.showScreen('game-screen');
        this.game.startTimer();
    },

    calculateCellSize() {
        if (!this.game) return;
        const size = this.game.size;
        const gapStr = getComputedStyle(document.documentElement).getPropertyValue('--grid-gap');
        const gap = parseInt(gapStr) || 3;
        const gapTotal = gap * (size - 1);
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
                cell.style.animationDelay = (r * this.game.size + c) * 15 + 'ms';
                cell.classList.add('cell-appear');
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
        document.querySelectorAll('.grid-cell.found').forEach(el => {
            el.classList.remove('found');
            el.style.background = '';
            el.style.color = '';
        });

        for (let i = 0; i < this.game.placedWords.length; i++) {
            const pw = this.game.placedWords[i];
            if (!this.game.foundWords.has(pw.word)) continue;
            const color = WORD_COLORS[i % WORD_COLORS.length];
            for (const { row, col } of pw.cells) {
                const cell = document.querySelector(`.grid-cell[data-row="${row}"][data-col="${col}"]`);
                if (cell) {
                    cell.classList.add('found');
                    cell.style.background = color;
                    cell.style.color = '#fff';
                }
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
        for (let i = 0; i < this.game.targetWords.length; i++) {
            const word = this.game.targetWords[i];
            const chip = document.createElement('span');
            chip.className = 'word-chip';
            chip.textContent = word;
            if (this.game.foundWords.has(word)) {
                chip.classList.add('found');
                const color = WORD_COLORS[i % WORD_COLORS.length];
                chip.style.background = color;
                chip.style.color = '#fff';
                chip.style.borderColor = color;
            }
            listEl.appendChild(chip);
        }
    },

    updateHintsCount() {
        if (!this.game) return;
        const el = document.getElementById('hints-count');
        el.textContent = '\uD83D\uDCA1' + this.game.hintsLeft;
    },

    updateProgress() {
        if (!this.game) return;
        const found = this.game.foundWords.size;
        const total = this.game.targetWords.length;
        const bar = document.getElementById('progress-fill');
        const text = document.getElementById('progress-text');
        if (bar) bar.style.width = (total > 0 ? (found / total) * 100 : 0) + '%';
        if (text) text.textContent = found + '/' + total;
    },

    flashHint(cells) {
        if (this.hintTimeout) {
            clearTimeout(this.hintTimeout);
            document.querySelectorAll('.grid-cell.hint').forEach(el => el.classList.remove('hint'));
        }

        cells.forEach(({ row, col }) => {
            const cell = document.querySelector(`.grid-cell[data-row="${row}"][data-col="${col}"]`);
            if (cell) cell.classList.add('hint');
        });

        this.hintTimeout = setTimeout(() => {
            document.querySelectorAll('.grid-cell.hint').forEach(el => el.classList.remove('hint'));
            this.hintTimeout = null;
        }, 1200);
    },

    updateWordsRevealCount() {
        const el = document.getElementById('reveal-count');
        if (el) el.textContent = this.wordsRevealLeft;
    },

    revealWords() {
        if (!this.game || this.isLevelComplete || this.wordsRevealLeft <= 0) return;
        this.wordsRevealLeft--;
        this.updateWordsRevealCount();

        const unfound = this.game.targetWords.filter(w => !this.game.foundWords.has(w));
        if (unfound.length === 0) return;

        const revealedEl = document.getElementById('revealed-words');
        revealedEl.innerHTML = '';
        for (const word of unfound) {
            const chip = document.createElement('span');
            chip.className = 'word-chip';
            chip.textContent = word;
            revealedEl.appendChild(chip);
        }
        revealedEl.classList.add('visible');
        this.haptic('light');

        if (this.revealWordsTimeout) clearTimeout(this.revealWordsTimeout);
        this.revealWordsTimeout = setTimeout(() => {
            revealedEl.classList.remove('visible');
            this.revealWordsTimeout = null;
        }, 2500);
    },

    renderTopics() {
        const listEl = document.getElementById('topic-list');
        listEl.innerHTML = '';

        const allBtn = document.createElement('button');
        allBtn.className = 'topic-chip' + (this.selectedTopics.size === 0 ? ' active' : '');
        allBtn.textContent = 'Все темы';
        allBtn.addEventListener('click', () => {
            this.selectedTopics.clear();
            this.renderTopics();
        });
        listEl.appendChild(allBtn);

        for (const topic of TOPICS) {
            const chip = document.createElement('button');
            chip.className = 'topic-chip' + (this.selectedTopics.has(topic) ? ' active' : '');
            chip.textContent = topic;
            chip.addEventListener('click', () => {
                if (this.selectedTopics.has(topic)) {
                    this.selectedTopics.delete(topic);
                } else {
                    this.selectedTopics.add(topic);
                }
                this.renderTopics();
            });
            listEl.appendChild(chip);
        }
    },

    showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
