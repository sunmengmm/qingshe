export const DIRECTIONS = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
  left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};

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

  get interval() { return Math.max(65, 145 - this.score * 7); }
  get speed() { return 145 / this.interval; }
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
    text: document.querySelector("#overlayText"), start: document.querySelector("#startButton"),
    startLabel: document.querySelector("#startLabel"), sound: document.querySelector("#soundToggle"),
    pause: document.querySelector("#pauseButton"), board: document.querySelector("#boardWrap"),
  };
  const savedBest = Number(localStorage.getItem("qingshe-best"));
  let best = Number.isSafeInteger(savedBest) && savedBest >= 0 ? savedBest : 0;
  let timer = null;
  let soundOn = true;
  let audioContext;
  let touchStart;

  function tone(frequency, duration = .06) {
    if (!soundOn || testMode) return;
    audioContext ||= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.045, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
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
    ctx.strokeStyle = "rgba(181, 239, 193, .035)";
    ctx.lineWidth = 1;
    for (let i = 1; i < game.size; i++) {
      const p = Math.round(i * unit) + .5;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, canvas.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(canvas.width, p); ctx.stroke();
    }
    if (game.food) {
      const x = (game.food.x + .5) * unit, y = (game.food.y + .5) * unit;
      ctx.shadowColor = "#fb796b"; ctx.shadowBlur = unit * .65;
      ctx.fillStyle = "#ff7667";
      ctx.beginPath(); ctx.arc(x, y, unit * .29, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#b9f27c"; ctx.lineWidth = Math.max(1, unit * .07);
      ctx.beginPath(); ctx.moveTo(x, y - unit * .2); ctx.quadraticCurveTo(x + unit * .22, y - unit * .43, x + unit * .28, y - unit * .27); ctx.stroke();
    }
    game.snake.forEach((part, index) => {
      const pad = unit * .09;
      ctx.fillStyle = index === 0 ? "#d9ff9d" : `rgba(185, 242, 124, ${Math.max(.35, 1 - index * .027)})`;
      ctx.shadowColor = index === 0 ? "rgba(185, 242, 124, .75)" : "transparent";
      ctx.shadowBlur = index === 0 ? unit * .5 : 0;
      ctx.beginPath();
      ctx.roundRect(part.x * unit + pad, part.y * unit + pad, unit - pad * 2, unit - pad * 2, unit * .2);
      ctx.fill();
      if (index === 0) drawEyes(part, unit);
    });
    ctx.shadowBlur = 0;
  }

  function drawEyes(head, unit) {
    const centerX = (head.x + .5) * unit, centerY = (head.y + .5) * unit;
    const dx = game.direction.x * unit * .22, dy = game.direction.y * unit * .22;
    const sideX = game.direction.y * unit * .13, sideY = -game.direction.x * unit * .13;
    ctx.fillStyle = "#101b12";
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.arc(centerX + dx + sideX * side, centerY + dy + sideY * side, unit * .055, 0, Math.PI * 2); ctx.fill();
    }
  }

  function updateStats() {
    ui.score.textContent = String(game.score).padStart(2, "0");
    ui.best.textContent = String(best).padStart(2, "0");
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
      ui.text.textContent = "点击继续，随时回到游戏";
      ui.startLabel.textContent = "继续游戏";
    } else {
      schedule();
    }
    syncPauseControl();
  }

  function loop() {
    const event = game.tick();
    if (event.type === "eat") { tone(640, .08); updateStats(); }
    draw();
    if (game.status === "over") return gameOver();
    schedule();
  }

  function begin() {
    clearTimeout(timer);
    game.reset(); game.start();
    ui.overlay.dataset.state = "playing";
    ui.overlay.classList.add("hidden");
    updateStats(); syncPauseControl(); draw(); tone(420, .05); schedule();
  }

  function gameOver() {
    tone(130, .24);
    const isNewBest = game.score > best;
    if (isNewBest) {
      best = game.score;
      localStorage.setItem("qingshe-best", String(best));
    }
    updateStats();
    ui.kicker.textContent = isNewBest ? "新的最佳记录" : "本局结束";
    ui.title.textContent = `${game.score} 分`;
    ui.text.textContent = game.score ? "差一点，再试一次刷新记录？" : "别着急，找到自己的节奏。";
    ui.startLabel.textContent = "再来一局";
    ui.overlay.dataset.state = "over";
    ui.overlay.classList.remove("hidden");
    syncPauseControl();
  }

  function steer(name) {
    if (game.status === "idle") begin();
    if (game.status === "playing" && game.setDirection(name)) tone(260, .025);
  }

  const keyMap = { ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down", ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right" };
  document.addEventListener("keydown", event => {
    if (keyMap[event.key]) { event.preventDefault(); steer(keyMap[event.key]); }
    if (event.code === "Space" && game.status !== "idle" && game.status !== "over") {
      event.preventDefault();
      togglePause();
    }
  });
  document.querySelectorAll("[data-direction]").forEach(button => button.addEventListener("pointerdown", event => { event.preventDefault(); steer(button.dataset.direction); }));
  ui.pause.addEventListener("click", togglePause);
  ui.start.addEventListener("click", () => {
    if (game.status === "paused") togglePause();
    else begin();
  });
  ui.sound.addEventListener("click", () => {
    soundOn = !soundOn;
    ui.sound.setAttribute("aria-pressed", String(soundOn));
    ui.sound.setAttribute("aria-label", soundOn ? "关闭声音" : "开启声音");
    ui.sound.firstElementChild.textContent = soundOn ? "♪" : "×";
  });
  ui.board.addEventListener("pointerdown", event => { touchStart = { x: event.clientX, y: event.clientY }; });
  ui.board.addEventListener("pointerup", event => {
    if (!touchStart) return;
    const dx = event.clientX - touchStart.x, dy = event.clientY - touchStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
    touchStart = null;
  });
  window.addEventListener("resize", resizeCanvas);
  ui.best.textContent = String(best).padStart(2, "0");
  resizeCanvas(); updateStats(); syncPauseControl();

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
