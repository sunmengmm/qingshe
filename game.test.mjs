import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DIRECTIONS, SnakeGame } from "./game.js";

test("starts with three segments and advances", () => {
  const game = new SnakeGame(10, () => 0);
  game.start();
  assert.equal(game.tick().type, "move");
  assert.deepEqual(game.snake[0], { x: 6, y: 5 });
  assert.equal(game.snake.length, 3);
});

test("eating grows the snake and increases score", () => {
  const game = new SnakeGame(10, () => 0);
  game.food = { x: 6, y: 5 };
  const startingInterval = game.interval;
  game.start();
  assert.equal(game.tick().type, "eat");
  assert.equal(game.score, 1);
  assert.equal(game.snake.length, 4);
  assert.ok(game.interval < startingInterval);
});

test("uses a relaxed full-game speed curve with a safe maximum", () => {
  const game = new SnakeGame();
  const expectedIntervals = new Map([
    [0, 220], [6, 202], [10, 190], [11, 188], [20, 170], [40, 130], [80, 130],
  ]);
  for (const [score, interval] of expectedIntervals) {
    game.score = score;
    assert.equal(game.interval, interval, `score ${score}`);
  }

  let previous = 220;
  for (let score = 1; score <= 80; score++) {
    game.score = score;
    assert.ok(game.interval <= previous, `score ${score} should not slow down`);
    assert.ok(previous - game.interval <= 3, `score ${score} should change by at most 3ms`);
    assert.ok(game.interval >= 130, `score ${score} should stay at or above 130ms`);
    previous = game.interval;
  }

  game.score = 6;
  assert.equal(game.speed.toFixed(1), "1.1");
});

test("rejects an immediate reverse turn", () => {
  const game = new SnakeGame();
  game.start();
  assert.equal(game.setDirection("left"), false);
  assert.equal(game.setDirection("up"), true);
  game.tick();
  assert.deepEqual(game.direction, { x: 0, y: -1 });
});

test("applies 20 consecutive valid turns on the next movement tick", () => {
  const game = new SnakeGame(100, () => 0);
  game.food = { x: 0, y: 0 };
  game.start();

  for (let turn = 0; turn < 20; turn++) {
    const name = turn % 2 === 0 ? "up" : "right";
    assert.equal(game.setDirection(name), true, `turn ${turn + 1} should be accepted`);
    assert.equal(game.tick().type, "move", `turn ${turn + 1} should advance safely`);
    assert.deepEqual(game.direction, DIRECTIONS[name], `turn ${turn + 1} should apply on the next tick`);
  }
});

test("ends when the snake hits a wall", () => {
  const game = new SnakeGame(4, () => 0);
  game.snake = [{ x: 3, y: 2 }, { x: 2, y: 2 }, { x: 1, y: 2 }];
  game.start();
  assert.deepEqual(game.tick(), { type: "over", reason: "wall" });
  assert.equal(game.status, "over");
});

test("ends when the snake hits itself", () => {
  const game = new SnakeGame(8, () => 0);
  game.snake = [
    { x: 3, y: 3 }, { x: 3, y: 4 }, { x: 2, y: 4 },
    { x: 2, y: 3 }, { x: 2, y: 2 }, { x: 3, y: 2 },
  ];
  game.direction = { x: 0, y: -1 };
  game.queue = [{ x: -1, y: 0 }];
  game.food = { x: 7, y: 7 };
  game.start();
  assert.deepEqual(game.tick(), { type: "over", reason: "self" });
});

test("pause stops movement and reset restores a fresh game", () => {
  const game = new SnakeGame(10, () => 0);
  game.start();
  assert.equal(game.togglePause(), "paused");
  const before = structuredClone(game.snake);
  assert.equal(game.tick().type, "none");
  assert.deepEqual(game.snake, before);
  game.reset();
  assert.equal(game.status, "idle");
  assert.equal(game.score, 0);
  assert.equal(game.snake.length, 3);
});

test("food is never placed on the snake", () => {
  const game = new SnakeGame(5, () => .5);
  assert.equal(game.snake.some(part => part.x === game.food.x && part.y === game.food.y), false);
});

test("completes a start, eat, game-over, and restart lifecycle", () => {
  const game = new SnakeGame(6, () => 0);
  game.food = { x: 4, y: 3 };
  game.start();
  assert.equal(game.tick().type, "eat");
  assert.equal(game.score, 1);
  const acceleratedInterval = game.interval;
  game.snake = [{ x: 5, y: 3 }, { x: 4, y: 3 }, { x: 3, y: 3 }];
  game.direction = { x: 1, y: 0 };
  assert.equal(game.tick().type, "over");
  game.reset();
  assert.equal(game.status, "idle");
  assert.equal(game.score, 0);
  assert.ok(acceleratedInterval < game.interval);
});

test("page exposes keyboard, touch, pause, score, and restart controls", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  const pagesWorkflow = readFileSync(new URL("./.github/workflows/pages.yml", import.meta.url), "utf8");
  for (const required of [
    'id="gameCanvas"', 'id="score"', 'id="best"', 'id="speed"',
    'id="startButton"', 'data-direction="up"', 'data-direction="down"',
    'data-direction="left"', 'data-direction="right"', 'id="pauseButton"',
  ]) assert.ok(html.includes(required), `missing ${required}`);
  assert.match(html, /方向键 \/ WASD/);
  assert.match(html, /点击方向键或滑动控制/);
  assert.match(html, /空格键暂停/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(css, /\.game-card \{ width: min\(100%, 560px\)/);
  assert.match(css, /@media \(max-height: 820px\) and \(min-width: 641px\)/);
  assert.match(css, /--safe-top: env\(safe-area-inset-top/);
  assert.match(css, /--safe-bottom: env\(safe-area-inset-bottom/);
  assert.match(css, /\.board-wrap \{ width: clamp\(140px, calc\(100dvh - 374px/);
  assert.match(html, /<img class="brand-mark" src="assets\/qingshe-logo\.svg\?v=20260821-1" alt="" width="30" height="30"/);
  assert.doesNotMatch(html, /class="brand-mark"[^>]*>S<\/span>/);
  const logo = readFileSync(new URL("./assets/qingshe-logo.svg", import.meta.url));
  assert.equal(createHash("sha256").update(logo).digest("hex"), "2ff5429b08cce5ee1184d29220c0ce8b8862b1b8f6afd425e492e45a633809df");
  assert.match(pagesWorkflow, /cp -R assets _site\//);
});
