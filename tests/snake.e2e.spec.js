import { test, expect } from "@playwright/test";

const runtimeErrors = new WeakMap();

test.beforeEach(async ({ page }) => {
  const errors = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("?e2e=1");
  await expect.poll(() => page.evaluate(() => Boolean(window.__snakeTest))).toBe(true);
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page), "browser should have no page or console errors").toEqual([]);
});

const state = page => page.evaluate(() => window.__snakeTest.snapshot());
const step = page => page.evaluate(() => window.__snakeTest.step());
const mobileViewports = [
  { name: "iPhone SE", width: 320, height: 568 },
  { name: "iPhone 8", width: 375, height: 667 },
  { name: "iPhone 14", width: 390, height: 844 },
  { name: "iPhone 16 Pro Max", width: 430, height: 932 },
];
const touchDirections = {
  up: { label: "向上", vector: { x: 0, y: -1 } },
  left: { label: "向左", vector: { x: -1, y: 0 } },
  down: { label: "向下", vector: { x: 0, y: 1 } },
  right: { label: "向右", vector: { x: 1, y: 0 } },
};

test("1. starts and moves with keyboard controls", async ({ page }) => {
  await page.getByRole("button", { name: "开始游戏" }).click();
  const before = await state(page);
  await page.keyboard.press("KeyW");
  const after = await step(page);
  expect(after.status).toBe("playing");
  expect(after.snake[0]).toEqual({ x: before.snake[0].x, y: before.snake[0].y - 1 });
});

test("2. eating grows the snake, scores, and speeds up", async ({ page }) => {
  await page.getByRole("button", { name: "开始游戏" }).click();
  const before = await state(page);
  await page.evaluate(() => window.__snakeTest.setFoodAhead());
  const after = await step(page);
  expect(after.snake).toHaveLength(before.snake.length + 1);
  expect(after.score).toBe(1);
  expect(after.interval).toBeLessThan(before.interval);
  await expect(page.locator("#score")).toHaveText("01");
  await expect(page.locator("#speed")).not.toHaveText("1.0×");
});

test("3. an immediate reverse direction is rejected", async ({ page }) => {
  await page.getByRole("button", { name: "开始游戏" }).click();
  await page.keyboard.press("ArrowLeft");
  const after = await step(page);
  expect(after.direction).toEqual({ x: 1, y: 0 });
  expect(after.snake[0]).toEqual({ x: 11, y: 10 });
});

test("4. hitting a wall ends the game", async ({ page }) => {
  await page.getByRole("button", { name: "开始游戏" }).click();
  await page.evaluate(() => window.__snakeTest.setScenario("wall"));
  const after = await step(page);
  expect(after.status).toBe("over");
  await expect(page.locator("#overlayKicker")).toHaveText("本局结束");
  await expect(page.getByRole("button", { name: "再来一局" })).toBeVisible();
});

test("5. hitting the snake body ends the game", async ({ page }) => {
  await page.getByRole("button", { name: "开始游戏" }).click();
  await page.evaluate(() => window.__snakeTest.setScenario("self"));
  const after = await step(page);
  expect(after.status).toBe("over");
  await expect(page.getByRole("button", { name: "再来一局" })).toBeVisible();
});

test("6. pause freezes movement and resume continues", async ({ page }) => {
  await page.getByRole("button", { name: "开始游戏" }).click();
  await page.keyboard.press("Space");
  const paused = await state(page);
  expect(paused.status).toBe("paused");
  expect((await step(page)).snake).toEqual(paused.snake);
  await expect(page.locator("#overlayTitle")).toHaveText("已暂停");
  await page.keyboard.press("Space");
  expect((await step(page)).snake[0]).not.toEqual(paused.snake[0]);
});

test("7. restart restores a clean playable game", async ({ page }) => {
  await page.getByRole("button", { name: "开始游戏" }).click();
  await page.evaluate(() => window.__snakeTest.setScenario("wall"));
  await step(page);
  await page.getByRole("button", { name: "再来一局" }).click();
  const restarted = await state(page);
  expect(restarted.status).toBe("playing");
  expect(restarted.score).toBe(0);
  expect(restarted.snake).toHaveLength(3);
  await expect(page.locator("#gameOverlay")).toHaveClass(/hidden/);
});

test("8. a new best score persists after reload", async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "开始游戏" }).click();
  await page.evaluate(() => {
    window.__snakeTest.forceScore(5);
    window.__snakeTest.setScenario("wall");
  });
  await step(page);
  await expect(page.locator("#best")).toHaveText("05");
  await page.reload();
  await expect(page.locator("#best")).toHaveText("05");
});

test("9. a corrupted saved best score falls back to zero", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("qingshe-best", "not-a-score"));
  await page.reload();
  await expect(page.locator("#best")).toHaveText("00");
  expect((await state(page)).best).toBe(0);
});

test("10. filling the board ends the game and offers a restart", async ({ page }) => {
  await page.getByRole("button", { name: "开始游戏" }).click();
  await page.evaluate(() => window.__snakeTest.setScenario("full-board"));
  const after = await step(page);
  expect(after.status).toBe("over");
  expect(after.food).toBeNull();
  await expect(page.getByRole("button", { name: "再来一局" })).toBeVisible();
});

test("touch D-pad and swipe both steer on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("button", { name: "开始游戏" }).click();
  await page.getByRole("button", { name: "向上" }).dispatchEvent("pointerdown", { pointerType: "touch" });
  expect((await step(page)).direction).toEqual({ x: 0, y: -1 });

  const board = page.locator("#boardWrap");
  const box = await board.boundingBox();
  await board.dispatchEvent("pointerdown", {
    pointerType: "touch", clientX: box.x + box.width / 2, clientY: box.y + box.height / 2,
  });
  await board.dispatchEvent("pointerup", {
    pointerType: "touch", clientX: box.x + box.width / 2 - 80, clientY: box.y + box.height / 2,
  });
  expect((await step(page)).direction).toEqual({ x: -1, y: 0 });
});

for (const viewport of mobileViewports) {
  test(`${viewport.name} has roomy and reliable touch controls`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.reload();

    const board = page.locator("#boardWrap");
    const dpad = page.locator(".dpad");
    await dpad.scrollIntoViewIfNeeded();
    const boardBox = await board.boundingBox();
    const dpadBox = await dpad.boundingBox();
    expect(Math.abs((dpadBox.x + dpadBox.width / 2) - (boardBox.x + boardBox.width / 2))).toBeLessThanOrEqual(2);
    expect(dpadBox.y - (boardBox.y + boardBox.height)).toBeGreaterThanOrEqual(12);
    expect(dpadBox.y - (boardBox.y + boardBox.height)).toBeLessThanOrEqual(20);

    for (const { label } of Object.values(touchDirections)) {
      const box = await page.getByRole("button", { name: label }).boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(56);
      expect(box.height).toBeGreaterThanOrEqual(56);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);

    await page.getByRole("button", { name: "开始游戏" }).click();
    const singleTurns = Array.from({ length: 5 }, () => ["up", "left", "down", "right"]).flat();
    for (const name of singleTurns) {
      const direction = touchDirections[name];
      await page.getByRole("button", { name: direction.label }).dispatchEvent("pointerdown", { pointerType: "touch" });
      expect((await step(page)).direction).toEqual(direction.vector);
    }

    const quickTurns = Array.from({ length: 5 }, () => [["up", "left"], ["down", "right"]]).flat();
    for (const names of quickTurns) {
      for (const name of names) {
        await page.getByRole("button", { name: touchDirections[name].label }).dispatchEvent("pointerdown", { pointerType: "touch" });
      }
      expect((await state(page)).queuedDirections).toHaveLength(2);
      expect((await step(page)).direction).toEqual(touchDirections[names[0]].vector);
      expect((await step(page)).direction).toEqual(touchDirections[names[1]].vector);
    }
  });
}

for (const viewport of [
  { name: "desktop", width: 1280, height: 720 },
  ...mobileViewports,
]) {
  test(`${viewport.name} viewport keeps the complete game card in bounds`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.reload();
    const card = page.locator(".game-card");
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    expect(box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await expect(page.getByRole("button", { name: "开始游戏" })).toBeVisible();
    if (viewport.width <= 640) await expect(page.getByRole("button", { name: "向上" })).toBeVisible();
    else await expect(page.locator(".keyboard-hint")).toBeVisible();
  });
}
