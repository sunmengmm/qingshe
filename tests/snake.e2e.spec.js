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
  { name: "compact iPhone Safari", width: 320, height: 480 },
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

const expectFitsOneScreen = async page => {
  const layout = await page.evaluate(() => {
    const viewport = {
      width: window.visualViewport?.width ?? window.innerWidth,
      height: window.visualViewport?.height ?? window.innerHeight,
    };
    const boxes = [".topbar", ".hero h1", ".game-card", ".stats", ".board-wrap", ".dpad"].map(selector => {
      const element = document.querySelector(selector);
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        selector,
        visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
      };
    });
    return {
      viewport,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      boxes,
    };
  });

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewport.width + 1);
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.viewport.height + 1);
  for (const box of layout.boxes) {
    expect(box.visible, `${box.selector} should be visible`).toBe(true);
    expect(box.left, `${box.selector} left edge`).toBeGreaterThanOrEqual(-1);
    expect(box.top, `${box.selector} top edge`).toBeGreaterThanOrEqual(-1);
    expect(box.right, `${box.selector} right edge`).toBeLessThanOrEqual(layout.viewport.width + 1);
    expect(box.bottom, `${box.selector} bottom edge`).toBeLessThanOrEqual(layout.viewport.height + 1);
  }

  await page.evaluate(() => window.scrollTo(9999, 9999));
  expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual({ x: 0, y: 0 });
};

test("mobile UI respects iPhone safe areas and stays scroll locked", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.addStyleTag({ content: ":root { --safe-top: 59px; --safe-bottom: 34px; }" });

  const layout = await page.evaluate(() => {
    const topbar = document.querySelector(".topbar").getBoundingClientRect();
    const shell = document.querySelector(".game-shell").getBoundingClientRect();
    const dpad = document.querySelector(".dpad").getBoundingClientRect();
    return {
      topbarTop: topbar.top,
      shellBottom: shell.bottom,
      dpadBottom: dpad.bottom,
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      bodyMinHeight: getComputedStyle(document.body).minHeight,
      bodyPosition: getComputedStyle(document.body).position,
    };
  });

  expect(layout.topbarTop).toBeGreaterThanOrEqual(67);
  expect(layout.shellBottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
  expect(layout.dpadBottom).toBeLessThanOrEqual(layout.viewportHeight - 42);
  expect(layout.bodyMinHeight).toBe("0px");
  expect(layout.bodyPosition).toBe("fixed");
  await expectFitsOneScreen(page);

  await page.getByRole("button", { name: "开始游戏" }).click();
  await expectFitsOneScreen(page);
  await page.getByRole("button", { name: "暂停游戏" }).click();
  await expectFitsOneScreen(page);
  await page.getByRole("button", { name: "恢复游戏" }).click();
  await page.evaluate(() => window.__snakeTest.setScenario("wall"));
  await step(page);
  await expectFitsOneScreen(page);
});

test("mobile UI explains touch input and exposes pause and sound states", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();

  await expect(page.getByText("点击方向键或滑动控制")).toBeVisible();
  await expect(page.locator(".desktop-instruction")).toBeHidden();
  await expect(page.locator(".keyboard-hint")).toBeHidden();
  await expect(page.locator("#gameOverlay")).toHaveAttribute("data-state", "idle");
  await expect(page.locator("#overlayKicker")).toBeHidden();
  await expect(page.locator("#overlayTitle")).toBeHidden();

  const pause = page.getByRole("button", { name: "暂停游戏" });
  const sound = page.getByRole("button", { name: "关闭声音" });
  for (const control of [pause, sound]) {
    const box = await control.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }

  await page.getByRole("button", { name: "开始游戏" }).click();
  await expect(pause).toBeEnabled();
  await pause.click();
  const paused = await state(page);
  expect(paused.status).toBe("paused");
  expect((await step(page)).snake).toEqual(paused.snake);
  await expect(page.getByRole("button", { name: "恢复游戏" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "恢复游戏" })).toHaveCSS("background-color", "rgb(185, 242, 124)");
  await expect(page.locator("#gameOverlay")).toHaveAttribute("data-state", "paused");

  await page.getByRole("button", { name: "恢复游戏" }).click();
  expect((await state(page)).status).toBe("playing");
  await sound.click();
  await expect(page.getByRole("button", { name: "开启声音" })).toHaveAttribute("aria-pressed", "false");
});

test("mobile secondary text and controls meet contrast and size thresholds", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();

  const metrics = await page.evaluate(() => {
    const parseColor = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
    const luminance = color => {
      const channels = color.map(value => {
        const channel = value / 255;
        return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
      });
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    const contrast = (foreground, background) => {
      const light = Math.max(luminance(foreground), luminance(background));
      const dark = Math.min(luminance(foreground), luminance(background));
      return (light + .05) / (dark + .05);
    };
    const statsLabel = getComputedStyle(document.querySelector(".stats span"));
    const overlayText = getComputedStyle(document.querySelector(".mobile-instruction"));
    const sound = getComputedStyle(document.querySelector("#soundToggle"));
    const pause = getComputedStyle(document.querySelector("#pauseButton"));
    return {
      statsContrast: contrast(parseColor(statsLabel.color), [12, 23, 17]),
      instructionContrast: contrast(parseColor(overlayText.color), [9, 19, 13]),
      soundContrast: contrast(parseColor(sound.color), [8, 16, 12]),
      pauseContrast: contrast(parseColor(pause.color), [16, 28, 22]),
      soundFontSize: parseFloat(sound.fontSize),
      pauseFontSize: parseFloat(pause.fontSize),
    };
  });

  expect(metrics.statsContrast).toBeGreaterThanOrEqual(4.5);
  expect(metrics.instructionContrast).toBeGreaterThanOrEqual(4.5);
  expect(metrics.soundContrast).toBeGreaterThanOrEqual(3);
  expect(metrics.pauseContrast).toBeGreaterThanOrEqual(3);
  expect(metrics.soundFontSize).toBeGreaterThanOrEqual(20);
  expect(metrics.pauseFontSize).toBeGreaterThanOrEqual(18);
});

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
  await expect(page.locator("#speed")).toHaveText(`${after.speed.toFixed(1)}×`);
});

test("speed display follows the relaxed full-game progression curve", async ({ page }) => {
  for (const [score, interval, label] of [
    [0, 220, "1.0×"],
    [6, 202, "1.1×"],
    [10, 190, "1.2×"],
    [20, 170, "1.3×"],
    [40, 130, "1.7×"],
  ]) {
    const snapshot = await page.evaluate(value => window.__snakeTest.forceScore(value), score);
    expect(snapshot.interval).toBe(interval);
    await expect(page.locator("#speed")).toHaveText(label);
  }
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

    await expectFitsOneScreen(page);

    const board = page.locator("#boardWrap");
    const dpad = page.locator(".dpad");
    const boardBox = await board.boundingBox();
    const dpadBox = await dpad.boundingBox();
    expect(Math.abs((dpadBox.x + dpadBox.width / 2) - (boardBox.x + boardBox.width / 2))).toBeLessThanOrEqual(2);
    expect(dpadBox.y - (boardBox.y + boardBox.height)).toBeGreaterThanOrEqual(8);
    expect(dpadBox.y - (boardBox.y + boardBox.height)).toBeLessThanOrEqual(16);

    for (const { label } of Object.values(touchDirections)) {
      const box = await page.getByRole("button", { name: label }).boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(56);
      expect(box.height).toBeGreaterThanOrEqual(56);
    }
    const controlBoxes = Object.fromEntries(await Promise.all([
      ["up", "向上"], ["left", "向左"], ["pause", "暂停游戏"],
      ["right", "向右"], ["down", "向下"],
    ].map(async ([name, label]) => [name, await page.getByRole("button", { name: label }).boundingBox()])));
    const center = box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    const positions = Object.fromEntries(Object.entries(controlBoxes).map(([name, box]) => [name, center(box)]));
    expect(Math.abs(positions.up.x - positions.pause.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(positions.down.x - positions.pause.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(positions.left.y - positions.pause.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(positions.right.y - positions.pause.y)).toBeLessThanOrEqual(1);
    expect(positions.up.y).toBeLessThan(positions.pause.y);
    expect(positions.down.y).toBeGreaterThan(positions.pause.y);
    expect(positions.left.x).toBeLessThan(positions.pause.x);
    expect(positions.right.x).toBeGreaterThan(positions.pause.x);
    expect(controlBoxes.pause.width).toBeGreaterThanOrEqual(56);
    expect(controlBoxes.pause.height).toBeGreaterThanOrEqual(56);
    for (const gap of [
      controlBoxes.pause.y - (controlBoxes.up.y + controlBoxes.up.height),
      controlBoxes.down.y - (controlBoxes.pause.y + controlBoxes.pause.height),
      controlBoxes.pause.x - (controlBoxes.left.x + controlBoxes.left.width),
      controlBoxes.right.x - (controlBoxes.pause.x + controlBoxes.pause.width),
    ]) {
      expect(gap).toBeGreaterThanOrEqual(8);
      expect(gap).toBeLessThanOrEqual(12);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);

    await page.getByRole("button", { name: "开始游戏" }).click();
    await expectFitsOneScreen(page);
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

    await page.keyboard.press("Space");
    await expect(page.getByRole("button", { name: "继续游戏" })).toBeVisible();
    await expectFitsOneScreen(page);
    await page.getByRole("button", { name: "继续游戏" }).click();

    await page.evaluate(() => window.__snakeTest.setScenario("wall"));
    await step(page);
    await expect(page.getByRole("button", { name: "再来一局" })).toBeVisible();
    await expectFitsOneScreen(page);
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
