export const DIRECTIONS = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
  left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};

export const formatScore = score => String(score).padStart(2, "0");

export function recordFeedback(score, previousBest) {
  if (score > previousBest) return "恭喜！你创造了新的最佳纪录。";
  if (score === previousBest && previousBest > 0) return `追平最佳纪录 ${formatScore(previousBest)} 分，再来一局突破自己！`;
  if (previousBest - score === 1) return "只差 1 分，再来一局！";
  return `当前纪录 ${formatScore(previousBest)} 分，再来一局挑战自己。`;
}

export class SnakeGame {
  constructor(size = 20, random = Math.random) {
    this.size = size;
    this.random = random;
    this.reset();
  }

  reset() {
    const c = Math.floor(this.size / 2);
    this.snake = [{ x: c, y: c }, { x: c - 1, y: c }, { x: c - 2, y: c }];
    this.direction = DIRECTIONS.right;
    this.queue = [];
    this.score = 0;
    this.status = "idle";
    this.food = this.placeFood();
  }

  start() { if (this.status === "idle") this.status = "playing"; }
  togglePause() {
    if (this.status === "playing") this.status = "paused";
    else if (this.status === "paused") this.status = "playing";
    return this.status;
  }

  setDirection(name) {
    const next = DIRECTIONS[name];
    if (!next || this.status === "over" || this.queue.length >= 2) return false;
    const previous = this.queue.at(-1) || this.direction;
    if (next.x + previous.x === 0 && next.y + previous.y === 0) return false;
    if (next.x === previous.x && next.y === previous.y) return false;
    this.queue.push(next);
    return true;
  }

  placeFood() {
    const free = [];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (!this.snake?.some(part => part.x === x && part.y === y)) free.push({ x, y });
      }
    }
    return free.length ? free[Math.floor(this.random() * free.length)] : null;
  }

  tick() {
    if (this.status !== "playing") return { type: "none" };
    if (this.queue.length) this.direction = this.queue.shift();
    const head = this.snake[0];
    const next = { x: head.x + this.direction.x, y: head.y + this.direction.y };
    const ate = this.food && next.x === this.food.x && next.y === this.food.y;
    const collisionBody = ate ? this.snake : this.snake.slice(0, -1);
    const hitWall = next.x < 0 || next.y < 0 || next.x >= this.size || next.y >= this.size;
    const hitSelf = collisionBody.some(part => part.x === next.x && part.y === next.y);
    if (hitWall || hitSelf) {
      this.status = "over";
      return { type: "over", reason: hitWall ? "wall" : "self" };
    }
    this.snake.unshift(next);
    if (ate) {
      this.score++;
      this.food = this.placeFood();
      if (!this.food) this.status = "over";
      return { type: "eat" };
    }
    this.snake.pop();
    return { type: "move" };
  }

  get interval() {
    if (this.score <= 10) return 220 - this.score * 3;
    return Math.max(130, 190 - (this.score - 10) * 2);
  }
  get speed() { return 220 / this.interval; }
}

const canvas = typeof document !== "undefined" ? document.querySelector("#gameCanvas") : null;
if (canvas) {
  const testMode = new URLSearchParams(window.location.search).has("e2e");
  const ctx = canvas.getContext("2d");
  const game = new SnakeGame(20, testMode ? () => .42 : Math.random);
  const ui = {
    score: document.querySelector("#score"), best: document.querySelector("#best"),
    speed: document.querySelector("#speed"), overlay: document.querySelector("#gameOverlay"),
    kicker: document.querySelector("#overlayKicker"), title: document.querySelector("#overlayTitle"),
    text: document.querySelector("#overlayText"), sound: document.querySelector("#soundToggle"),
    soundState: document.querySelector("#soundState"),
    pause: document.querySelector("#pauseButton"), board: document.querySelector("#boardWrap"),
    dpad: document.querySelector(".dpad"), hero: document.querySelector("#heroButton"),
    heroLabel: document.querySelector("#heroLabel"), status: document.querySelector("#gameStatus"),
    storageNote: document.querySelector("#storageNote"), scoreStat: document.querySelector(".score-stat"),
  };
  function readSaved(key) {
    try { return localStorage.getItem(key); }
    catch { ui.storageNote.hidden = false; return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, String(value)); }
    catch { ui.storageNote.hidden = false; }
  }
  const savedBest = Number(readSaved("qingshe-best"));
  let best = Number.isSafeInteger(savedBest) && savedBest >= 0 ? savedBest : 0;
  let previousBest = best;
  let timer = null;
  let soundOn = readSaved("qingshe-sound") !== "off";
  let audioContext;
  let touchStart;

  function tone(frequency, duration = .06) {
    if (!soundOn || testMode) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    try {
      audioContext ||= new Audio();
      if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(.045, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch { /* Audio availability must not interrupt a game. */ }
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.round(rect.width * ratio);
    if (canvas.width !== width) { canvas.width = width; canvas.height = width; }
    draw();
  }

  function draw() {
    const unit = canvas.width / game.size;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#09130d";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(181, 239, 193, .065)";
    ctx.lineWidth = 1;
    for (let i = 1; i < game.size; i++) {
      const p = Math.round(i * unit) + .5;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, canvas.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(canvas.width, p); ctx.stroke();
    }
    if (game.food) {
      const x = (game.food.x + .5) * unit, y = (game.food.y + .5) * unit;
      ctx.shadowColor = "#fb796b"; ctx.shadowBlur = unit * .45;
      ctx.fillStyle = "#ff8274";
      ctx.beginPath(); ctx.arc(x, y, unit * .29, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#b9f27c"; ctx.lineWidth = Math.max(1, unit * .07);
      ctx.beginPath(); ctx.moveTo(x, y - unit * .2); ctx.quadraticCurveTo(x + unit * .22, y - unit * .43, x + unit * .28, y - unit * .27); ctx.stroke();
    }
    game.snake.forEach((part, index) => {
      const pad = unit * .09;
      ctx.fillStyle = index === 0 ? "#d9ff9d" : `rgba(185, 242, 124, ${Math.max(.35, 1 - index * .027)})`;
      ctx.shadowColor = index === 0 ? "rgba(185, 242, 124, .75)" : "transparent";
      ctx.shadowBlur = index === 0 ? unit * .3 : 0;
      ctx.beginPath();
      ctx.roundRect(part.x * unit + pad, part.y * unit + pad, unit - pad * 2, unit - pad * 2, unit * .12);
      ctx.fill();
      if (index === 0) drawEyes(part, unit);
    });
    ctx.shadowBlur = 0;
  }

  function drawEyes(head, unit) {
    const centerX = (head.x + .5) * unit, centerY = (head.y + .5) * unit;
    const dx = game.direction.x * unit * .22, dy = game.direction.y * unit * .22;
    const sideX = game.direction.y * unit * .13, sideY = -game.direction.x * unit * .13;
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#101b12";
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.arc(centerX + dx + sideX * side, centerY + dy + sideY * side, unit * .055, 0, Math.PI * 2); ctx.fill();
    }
  }

  function updateStats() {
    ui.score.textContent = formatScore(game.score);
    ui.best.textContent = formatScore(best);
    ui.speed.textContent = `${game.speed.toFixed(1)}×`;
  }

  function schedule() {
    clearTimeout(timer);
    if (!testMode && game.status === "playing") timer = setTimeout(loop, game.interval);
  }

  function syncPauseControl() {
    const paused = game.status === "paused";
    const available = game.status === "playing" || paused;
    ui.pause.disabled = !available;
    ui.pause.setAttribute("aria-pressed", String(paused));
    ui.pause.setAttribute("aria-label", paused ? "恢复游戏" : "暂停游戏");
    ui.pause.firstElementChild.textContent = paused ? "▶" : "Ⅱ";
    const labels = { idle: "开始游戏", playing: "暂停游戏", paused: "继续游戏", over: "再来一局" };
    ui.heroLabel.textContent = labels[game.status];
    ui.hero.dataset.state = game.status;
    ui.hero.lastElementChild.textContent = game.status === "playing" ? "Ⅱ" : "→";
    ui.status.textContent = { idle: "等待开始", playing: "游走中", paused: "已暂停", over: "本局结束" }[game.status];
    ui.status.dataset.state = game.status;
    ui.board.dataset.state = game.status;
    ui.overlay.inert = game.status === "playing";
  }

  function togglePause() {
    if (game.status !== "playing" && game.status !== "paused") return;
    const status = game.togglePause();
    ui.overlay.dataset.state = status;
    ui.overlay.classList.toggle("hidden", status !== "paused");
    if (status === "paused") {
      clearTimeout(timer);
      ui.kicker.textContent = "休息一下";
      ui.title.textContent = "已暂停";
      ui.text.textContent = "点击「继续游戏」，回到棋盘。";
      ui.overlay.inert = false;
    } else {
      canvas.focus({ preventScroll: true });
      schedule();
    }
    syncPauseControl();
    if (status === "paused") focusPrimary();
  }

  function focusPrimary() {
    requestAnimationFrame(() => {
      if (game.status !== "paused" && game.status !== "over") return;
      ui.hero.focus({ preventScroll: true });
      const rect = ui.hero.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > innerHeight) ui.hero.scrollIntoView({ block: "nearest", behavior: "instant" });
    });
  }

  function loop() {
    const event = game.tick();
    if (event.type === "eat") {
      tone(640, .08);
      saveBest(); updateStats(); syncPauseControl();
      ui.scoreStat.classList.remove("earned");
      void ui.scoreStat.offsetWidth;
      ui.scoreStat.classList.add("earned");
    }
    draw();
    if (game.status === "over") return gameOver();
    schedule();
  }

  function begin() {
    clearTimeout(timer);
    previousBest = best;
    game.reset(); game.start();
    ui.overlay.dataset.state = "playing";
    ui.overlay.classList.add("hidden");
    ui.scoreStat.classList.remove("earned");
    updateStats(); syncPauseControl(); draw(); tone(420, .05); schedule();
    document.querySelector(".game-shell").classList.add("has-started");
    canvas.focus({ preventScroll: true });
    if (matchMedia("(max-width: 1000px)").matches) {
      document.querySelector(".game-card").scrollIntoView({ block: "nearest", behavior: "instant" });
    }
  }

  function saveBest() {
    if (game.score <= best) return;
    best = game.score;
    save("qingshe-best", best);
  }

  function gameOver() {
    clearTimeout(timer);
    tone(130, .24);
    const isNewBest = game.score > previousBest;
    saveBest();
    updateStats();
    ui.kicker.textContent = isNewBest ? "新的最佳纪录" : "本局结束";
    ui.title.textContent = `${formatScore(game.score)} 分`;
    ui.text.textContent = recordFeedback(game.score, previousBest);
    ui.overlay.dataset.state = "over";
    ui.overlay.classList.remove("hidden");
    syncPauseControl();
    focusPrimary();
  }

  function steer(name) {
    if (game.status === "idle") begin();
    if (game.status === "playing" && game.setDirection(name)) tone(260, .025);
  }

  const keyMap = { ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down", ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right" };
  document.addEventListener("keydown", event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest("input, textarea, select, [contenteditable='true']")) return;
    if (event.code === "Space" && event.repeat) { event.preventDefault(); return; }
    if (keyMap[event.key]) { event.preventDefault(); steer(keyMap[event.key]); }
    if (event.target.closest("button, a")) return;
    if (event.code === "Space") {
      event.preventDefault();
      if (!event.repeat) primaryAction();
    } else if (event.key === "Enter" && !event.repeat && game.status !== "playing") {
      event.preventDefault();
      primaryAction();
    }
  });
  ui.dpad.addEventListener("pointerdown", event => {
    const button = event.target.closest("button");
    if (button?.dataset.direction) {
      event.preventDefault();
      steer(button.dataset.direction);
      return;
    }
    if (button) return;

    event.preventDefault();
    const rect = ui.dpad.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
  });
  ui.dpad.addEventListener("click", event => {
    // Keyboard and assistive activation have no preceding pointerdown.
    const button = event.target.closest("button[data-direction]");
    if (button && event.detail === 0) steer(button.dataset.direction);
  });
  ui.pause.addEventListener("click", togglePause);
  function primaryAction() {
    if (game.status === "paused" || game.status === "playing") togglePause();
    else begin();
  }
  ui.hero.addEventListener("click", primaryAction);
  function syncSound() {
    ui.sound.setAttribute("aria-pressed", String(soundOn));
    ui.sound.title = soundOn ? "关闭音效" : "开启音效";
    ui.soundState.textContent = soundOn ? "开" : "关";
  }
  ui.sound.addEventListener("click", () => {
    soundOn = !soundOn;
    save("qingshe-sound", soundOn ? "on" : "off");
    syncSound();
    if (soundOn) tone(420);
  });
  ui.board.addEventListener("pointerdown", event => {
    if (event.target.closest("button") || !event.isPrimary || event.button !== 0) return;
    touchStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    ui.board.setPointerCapture(event.pointerId);
  });
  ui.board.addEventListener("pointerup", event => {
    if (!touchStart || event.pointerId !== touchStart.id) return;
    const dx = event.clientX - touchStart.x, dy = event.clientY - touchStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
    touchStart = null;
  });
  ui.board.addEventListener("pointercancel", () => { touchStart = null; });
  ui.board.addEventListener("lostpointercapture", () => { touchStart = null; });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && game.status === "playing") togglePause();
  });
  ui.scoreStat.addEventListener("animationend", event => {
    if (event.animationName === "score-rise") ui.scoreStat.classList.remove("earned");
  });
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas(); updateStats(); syncPauseControl(); syncSound();

  if (testMode) {
    const snapshot = () => structuredClone({
      snake: game.snake,
      direction: game.direction,
      queuedDirections: game.queue,
      food: game.food,
      score: game.score,
      status: game.status,
      interval: game.interval,
      speed: game.speed,
      best,
    });

    window.__snakeTest = {
      snapshot,
      step: () => { loop(); return snapshot(); },
      setFoodAhead: () => {
        const head = game.snake[0];
        game.food = { x: head.x + game.direction.x, y: head.y + game.direction.y };
        draw();
        return snapshot();
      },
      forceScore: score => { game.score = score; updateStats(); return snapshot(); },
      prepareTurn: direction => {
        if (!DIRECTIONS[direction]) throw new Error(`Unknown direction: ${direction}`);
        game.queue = [];
        game.direction = DIRECTIONS[direction];
        game.status = "playing";
        return snapshot();
      },
      setScenario: name => {
        game.queue = [];
        game.status = "playing";
        game.food = { x: 0, y: 0 };
        if (name === "wall") {
          game.snake = [{ x: 19, y: 10 }, { x: 18, y: 10 }, { x: 17, y: 10 }];
          game.direction = DIRECTIONS.right;
        } else if (name === "self") {
          game.snake = [
            { x: 3, y: 3 }, { x: 3, y: 4 }, { x: 2, y: 4 },
            { x: 2, y: 3 }, { x: 2, y: 2 }, { x: 3, y: 2 },
          ];
          game.direction = DIRECTIONS.left;
        } else if (name === "full-board") {
          game.snake = [{ x: 0, y: 0 }];
          for (let y = 0; y < game.size; y++) {
            for (let x = 0; x < game.size; x++) {
              if ((x !== 0 || y !== 0) && (x !== 1 || y !== 0)) game.snake.push({ x, y });
            }
          }
          game.direction = DIRECTIONS.right;
          game.food = { x: 1, y: 0 };
          game.score = game.snake.length - 3;
        } else {
          throw new Error(`Unknown test scenario: ${name}`);
        }
        updateStats(); draw();
        return snapshot();
      },
    };
  }
}
