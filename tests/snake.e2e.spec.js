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

const expectMobileLayout = async page => {
  const layout = await page.evaluate(() => {
    const board = document.querySelector(".board-wrap").getBoundingClientRect();
    return {
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      board: { width: board.width, height: board.height },
      bodyPosition: getComputedStyle(document.body).position,
      boxes: [".topbar", ".hero h1", ".game-card", ".stats", ".board-wrap", ".dpad"].map(selector => {
        const element = document.querySelector(selector);
        const rect = element.getBoundingClientRect();
        return { selector, hidden: !element.checkVisibility(), width: rect.width, height: rect.height, left: rect.left, right: rect.right,
          top: rect.top + scrollY, bottom: rect.bottom + scrollY };
      }),
    };
  });
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
  expect(layout.bodyPosition).not.toBe("fixed");
  expect(Math.abs(layout.board.width - layout.board.height)).toBeLessThan(1);
  for (const box of layout.boxes) {
    if (box.selector === ".hero h1" && box.hidden) continue;
    expect(box.width, box.selector).toBeGreaterThan(0);
    expect(box.height, box.selector).toBeGreaterThan(0);
    expect(box.left, box.selector).toBeGreaterThanOrEqual(0);
    expect(box.right, box.selector).toBeLessThanOrEqual(layout.width);
    expect(box.top, box.selector).toBeGreaterThanOrEqual(0);
    expect(box.bottom, box.selector).toBeLessThanOrEqual(layout.scrollHeight);
  }
  await page.locator(".dpad").scrollIntoViewIfNeeded();
  await expect(page.locator(".dpad")).toBeInViewport({ ratio: .99 });
};

test("the selected snake SVG replaces the S avatar without changing the brand", async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.reload();
    const metrics = await page.locator(".brand").evaluate(brand => {
      const logo = brand.querySelector(".brand-mark");
      const box = logo.getBoundingClientRect();
      return {
        tagName: logo.tagName,
        width: box.width,
        height: box.height,
        complete: logo.complete,
        naturalWidth: logo.naturalWidth,
        naturalHeight: logo.naturalHeight,
        text: brand.querySelector("span").textContent,
        wrapping: brand.getBoundingClientRect().height > 44,
      };
    });
    expect(metrics).toMatchObject({
      tagName: "IMG", width: 30, height: 30, complete: true,
      text: "青蛇", wrapping: false,
    });
    expect(metrics.naturalWidth).toBeGreaterThan(0);
    expect(metrics.naturalHeight).toBe(metrics.naturalWidth);
  }
});

test("mobile UI respects safe areas and allows content to scroll", async ({ page }) => {
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
  expect(layout.shellBottom).toBeGreaterThanOrEqual(layout.viewportHeight);
  expect(layout.shellBottom - layout.dpadBottom).toBeGreaterThanOrEqual(62);
  expect(parseFloat(layout.bodyMinHeight)).toBeGreaterThan(0);
  expect(layout.bodyPosition).not.toBe("fixed");
  await expectMobileLayout(page);

  await page.locator("#heroButton").click();
  await expectMobileLayout(page);
  await page.locator("#pauseButton").click();
  await expectMobileLayout(page);
  await page.locator("#pauseButton").click();
  await page.evaluate(() => window.__snakeTest.setScenario("wall"));
  await step(page);
  await expectMobileLayout(page);
});

test("mobile UI explains touch input and exposes pause and sound states", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();

  await expect(page.getByText("点击方向键或滑动控制")).toBeVisible();
  await expect(page.locator("#overlayText .desktop-instruction")).toBeHidden();
  await expect(page.locator(".keyboard-hint")).toBeHidden();
  await expect(page.locator("#gameOverlay")).toHaveAttribute("data-state", "idle");
  await expect(page.locator("#overlayKicker")).toBeVisible();
  await expect(page.locator("#overlayTitle")).toBeVisible();

  const pause = page.locator("#pauseButton");
  const sound = page.getByRole("button", { name: "游戏音效" });
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await expect(sound).toHaveAttribute('title', '关闭音效');
  await expect(sound).toHaveText('音效 开');
  await expect(sound.locator('.sound-waves')).toBeVisible();
  await expect(sound.locator('.sound-muted')).toBeHidden();
  for (const control of [pause, sound]) {
    const box = await control.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }

  await page.locator("#heroButton").click();
  await expect(pause).toBeEnabled();
  await pause.click();
  const paused = await state(page);
  expect(paused.status).toBe("paused");
  expect((await step(page)).snake).toEqual(paused.snake);
  await expect(page.locator("#pauseButton")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#pauseButton")).toHaveCSS("background-color", "rgb(185, 242, 124)");
  await expect(page.locator("#gameOverlay")).toHaveAttribute("data-state", "paused");

  await page.locator("#pauseButton").click();
  expect((await state(page)).status).toBe("playing");
  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
  await expect(sound).toHaveAttribute('title', '开启音效');
  await expect(sound).toHaveText('音效 关');
  await expect(sound.locator('.sound-waves')).toBeHidden();
  await expect(sound.locator('.sound-muted')).toBeVisible();
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
    const overlayText = getComputedStyle(document.querySelector("#overlayText .mobile-instruction"));
    const sound = getComputedStyle(document.querySelector("#soundToggle"));
    const pause = getComputedStyle(document.querySelector("#pauseButton"));
    return {
      statsContrast: contrast(parseColor(statsLabel.color), [12, 23, 17]),
      instructionContrast: contrast(parseColor(overlayText.color), [9, 19, 13]),
      soundContrast: contrast(parseColor(sound.color), [8, 16, 12]),
      pauseContrast: contrast(parseColor(pause.color), [16, 28, 22]),
      soundFontSize: parseFloat(sound.fontSize),
      soundIconSize: document.querySelector('.sound-icon').getBoundingClientRect().width,
      pauseFontSize: parseFloat(pause.fontSize),
    };
  });

  expect(metrics.statsContrast).toBeGreaterThanOrEqual(4.5);
  expect(metrics.instructionContrast).toBeGreaterThanOrEqual(4.5);
  expect(metrics.soundContrast).toBeGreaterThanOrEqual(4.5);
  expect(metrics.pauseContrast).toBeGreaterThanOrEqual(3);
  expect(metrics.soundFontSize).toBeGreaterThanOrEqual(12);
  expect(metrics.soundIconSize).toBeGreaterThanOrEqual(18);
  expect(metrics.pauseFontSize).toBeGreaterThanOrEqual(18);
});

test("1. starts and moves with keyboard controls", async ({ page }) => {
  await page.locator("#heroButton").click();
  const before = await state(page);
  await page.keyboard.press("KeyW");
  const after = await step(page);
  expect(after.status).toBe("playing");
  expect(after.snake[0]).toEqual({ x: before.snake[0].x, y: before.snake[0].y - 1 });
});

test("2. eating grows the snake, scores, and speeds up", async ({ page }) => {
  await page.locator("#heroButton").click();
  const before = await state(page);
  await page.evaluate(() => window.__snakeTest.setFoodAhead());
  const after = await step(page);
  expect(after.snake).toHaveLength(before.snake.length + 1);
  expect(after.score).toBe(1);
  expect(after.interval).toBeLessThan(before.interval);
  await expect(page.locator("#score")).toHaveText("01");
  await expect(page.locator('#gameStatus')).toHaveText('游走中');
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
  await page.locator("#heroButton").click();
  await page.keyboard.press("ArrowLeft");
  const after = await step(page);
  expect(after.direction).toEqual({ x: 1, y: 0 });
  expect(after.snake[0]).toEqual({ x: 11, y: 10 });
});

test("4. hitting a wall ends the game", async ({ page }) => {
  await page.locator("#heroButton").click();
  await page.evaluate(() => window.__snakeTest.setScenario("wall"));
  const after = await step(page);
  expect(after.status).toBe("over");
  await expect(page.locator("#overlayKicker")).toHaveText("本局结束");
  await expect(page.locator("#heroButton")).toBeVisible();
});

test("5. hitting the snake body ends the game", async ({ page }) => {
  await page.locator("#heroButton").click();
  await page.evaluate(() => window.__snakeTest.setScenario("self"));
  const after = await step(page);
  expect(after.status).toBe("over");
  await expect(page.locator("#heroButton")).toBeVisible();
});

test("6. pause freezes movement and resume continues", async ({ page }) => {
  await page.locator("#heroButton").click();
  await page.keyboard.press("Space");
  const paused = await state(page);
  expect(paused.status).toBe("paused");
  expect((await step(page)).snake).toEqual(paused.snake);
  await expect(page.locator("#overlayTitle")).toHaveText("已暂停");
  await page.keyboard.press("Space");
  expect((await step(page)).snake[0]).not.toEqual(paused.snake[0]);
});

test("7. restart restores a clean playable game", async ({ page }) => {
  await page.locator("#heroButton").click();
  await page.evaluate(() => window.__snakeTest.setScenario("wall"));
  await step(page);
  await page.locator("#heroButton").click();
  const restarted = await state(page);
  expect(restarted.status).toBe("playing");
  expect(restarted.score).toBe(0);
  expect(restarted.snake).toHaveLength(3);
  await expect(page.locator("#gameOverlay")).toHaveClass(/hidden/);
});

test("8. a new best score persists after reload", async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator("#heroButton").click();
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
  await page.locator("#heroButton").click();
  await page.evaluate(() => window.__snakeTest.setScenario("full-board"));
  const after = await step(page);
  expect(after.status).toBe("over");
  expect(after.food).toBeNull();
  await expect(page.locator("#heroButton")).toBeVisible();
});

test("touch D-pad and swipe both steer on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator("#heroButton").click();
  await page.getByRole("button", { name: "向上" }).dispatchEvent("pointerdown", { pointerType: "touch" });
  expect((await step(page)).direction).toEqual({ x: 0, y: -1 });

  const board = page.locator("#boardWrap");
  const box = await board.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2);
  await page.mouse.up();
  expect((await step(page)).direction).toEqual({ x: -1, y: 0 });
});

test("the compact D-pad maps 36 surrounding touch points to directions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator("#heroButton").click();
  const box = await page.locator(".dpad").boundingBox();
  const samples = {
    up: { initial: "right", xs: [.35, .5, .65], ys: [.05, .2, .3] },
    down: { initial: "right", xs: [.35, .5, .65], ys: [.7, .8, .95] },
    left: { initial: "up", xs: [.05, .2, .3], ys: [.35, .5, .65] },
    right: { initial: "up", xs: [.7, .8, .95], ys: [.35, .5, .65] },
  };

  for (const [name, sample] of Object.entries(samples)) {
    for (const x of sample.xs) {
      for (const y of sample.ys) {
        await page.evaluate(initial => window.__snakeTest.prepareTurn(initial), sample.initial);
        await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
        expect((await state(page)).queuedDirections).toEqual([touchDirections[name].vector]);
      }
    }
  }
});

for (const viewport of mobileViewports) {
  test(`${viewport.name} has roomy and reliable touch controls`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.reload();

    await expectMobileLayout(page);

    const board = page.locator("#boardWrap");
    const dpad = page.locator(".dpad");
    const boardBox = await board.boundingBox();
    const dpadBox = await dpad.boundingBox();
    expect(dpadBox.width).toBeGreaterThanOrEqual(184);
    expect(dpadBox.width).toBeLessThanOrEqual(190);
    expect(dpadBox.height).toBeGreaterThanOrEqual(184);
    expect(dpadBox.height).toBeLessThanOrEqual(190);
    expect(Math.abs((dpadBox.x + dpadBox.width / 2) - (boardBox.x + boardBox.width / 2))).toBeLessThanOrEqual(2);
    expect(dpadBox.y - (boardBox.y + boardBox.height)).toBeGreaterThanOrEqual(40);
    expect(dpadBox.y - (boardBox.y + boardBox.height)).toBeLessThanOrEqual(56);

    for (const { label } of Object.values(touchDirections)) {
      const box = await page.getByRole("button", { name: label }).boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(56);
      expect(box.height).toBeGreaterThanOrEqual(56);
    }
    const controlBoxes = Object.fromEntries(await Promise.all([
      ["up", "向上"], ["left", "向左"], ["pause", "暂停游戏"],
      ["right", "向右"], ["down", "向下"],
    ].map(async ([name, label]) => [name, await dpad.getByRole("button", { name: label }).boundingBox()])));
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

    await page.locator("#heroButton").click();
    await expectMobileLayout(page);
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
    await expect(page.locator("#heroButton")).toBeVisible();
    await expectMobileLayout(page);
    await page.locator("#heroButton").click();

    await page.evaluate(() => window.__snakeTest.setScenario("wall"));
    await step(page);
    await expect(page.locator("#heroButton")).toBeVisible();
    await expectMobileLayout(page);
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
    if (viewport.width > 1000) expect(box.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await expect(page.locator("#heroButton")).toBeVisible();
    if (viewport.width <= 1000) await expect(page.getByRole("button", { name: "向上" })).toBeVisible();
    else await expect(page.locator(".keyboard-hint")).toBeVisible();
  });
}

for (const viewport of [
  { width: 1366, height: 768 }, { width: 1440, height: 900 },
  { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 768, height: 1024 },
]) {
  test(`${viewport.width}×${viewport.height} target layout stays square through all game states`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.reload();
    const checkLayout = async () => {
      const status = (await state(page)).status;
      await expect(page.locator('.primary-button')).toHaveCount(1);
      await expect(page.locator('#gameOverlay button')).toHaveCount(0);
      await expect(page.locator('#heroButton')).toBeVisible();
      await expect(page.locator('#heroLabel')).toHaveText({ idle: '开始游戏', playing: '暂停游戏', paused: '继续游戏', over: '再来一局' }[status]);
      await expect(page.locator('#boardWrap')).toHaveAttribute('data-state', status);
      await expect(page.locator('.game-shell > footer')).toHaveText('◈ 青蛇 · 找到自己的节奏。');
      const metrics = await page.evaluate(() => {
        const box = selector => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom, right: rect.right };
        };
        return { board: box('.board-wrap'), canvas: box('canvas'), card: box('.game-card'),
          hero: box('.hero'), button: box('#heroButton'), dpad: box('.dpad'),
          scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight };
      });
      expect(metrics.scrollWidth).toBeLessThanOrEqual(viewport.width);
      expect(Math.abs(metrics.board.width - metrics.board.height)).toBeLessThan(1);
      expect(Math.abs(metrics.canvas.width - metrics.canvas.height)).toBeLessThan(1);
      expect(metrics.button.width).toBeGreaterThanOrEqual(44);
      expect(metrics.button.height).toBeGreaterThanOrEqual(44);
      expect(metrics.button.x).toBeGreaterThanOrEqual(0);
      expect(metrics.button.right).toBeLessThanOrEqual(viewport.width);
      if (viewport.width > 1000) {
        expect(metrics.hero.right).toBeLessThan(metrics.card.x);
        expect(metrics.card.y).toBeGreaterThanOrEqual(0);
        expect(metrics.card.bottom).toBeLessThanOrEqual(viewport.height);
        expect(metrics.button.bottom).toBeLessThanOrEqual(viewport.height);
        expect(metrics.scrollHeight).toBeLessThanOrEqual(viewport.height);
      } else if (viewport.width >= 390 && status !== 'idle') {
        // The requested phone/tablet viewports keep board and controls together once playing.
        expect(metrics.button.y).toBeGreaterThanOrEqual(0);
        expect(metrics.button.bottom).toBeLessThan(metrics.card.y);
        expect(metrics.board.y).toBeGreaterThanOrEqual(0);
        expect(metrics.dpad.bottom).toBeLessThanOrEqual(viewport.height);
      }
    };
    await checkLayout();
    await page.locator('#heroButton').click();
    await checkLayout();
    await page.keyboard.press('Space');
    await checkLayout();
    await page.locator('#heroButton').click();
    await page.evaluate(() => { window.__snakeTest.setScenario('wall'); window.__snakeTest.step(); });
    await checkLayout();
    await page.locator('#heroButton').click();
    await checkLayout();
  });
}

test('record copy uses the pre-game best and restart preserves history', async ({ page }) => {
  for (const [best, score, message] of [
    [5, 6, '恭喜！你创造了新的最佳纪录。'],
    [5, 4, '只差 1 分，再来一局！'],
    [5, 2, '当前纪录 05 分，再来一局挑战自己。'],
    [5, 5, '追平最佳纪录 05 分，再来一局突破自己！'],
    [0, 0, '当前纪录 00 分，再来一局挑战自己。'],
  ]) {
    await page.evaluate(best => localStorage.setItem('qingshe-best', String(best)), best);
    await page.reload();
    await page.locator('#heroButton').click();
    await page.evaluate(score => {
      window.__snakeTest.forceScore(score);
      window.__snakeTest.setScenario('wall');
      window.__snakeTest.step();
    }, score);
    await expect(page.locator('#overlayText')).toHaveText(message);
    await expect(page.locator('#overlayTitle')).toHaveText(`${String(score).padStart(2, '0')} 分`);
    await expect(page.locator('#heroButton')).toBeFocused();
    await page.locator('#heroButton').click();
    expect((await state(page)).score).toBe(0);
    expect((await state(page)).best).toBe(Math.max(best, score));
    await expect(page.locator('#speed')).toHaveText('1.0×');
  }
});

test('new best is saved immediately after eating, even before a collision', async ({ page }) => {
  await page.locator('#heroButton').click();
  await page.evaluate(() => { window.__snakeTest.setFoodAhead(); window.__snakeTest.step(); });
  await expect(page.locator('#best')).toHaveText('01');
  await expect(page.locator('.score-stat')).toHaveClass(/earned/);
  await page.reload();
  await expect(page.locator('#best')).toHaveText('01');
  await expect(page.locator('#score')).toHaveText('00');
});

test('blocked storage does not prevent play, scoring, or restart', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
  });
  await page.reload();
  await expect(page.locator('#storageNote')).toBeVisible();
  await page.locator('#heroButton').click();
  await page.evaluate(() => {
    window.__snakeTest.setFoodAhead(); window.__snakeTest.step();
    window.__snakeTest.setScenario('wall'); window.__snakeTest.step();
  });
  await expect(page.locator('#overlayText')).toHaveText('恭喜！你创造了新的最佳纪录。');
  await page.locator('#heroButton').click();
  expect((await state(page)).best).toBe(1);
});

test('keyboard focus, the primary action, and held pause keys remain predictable', async ({ page }) => {
  await page.keyboard.press('Enter');
  expect((await state(page)).status).toBe('playing');
  await expect(page.locator('canvas')).toBeFocused();
  await page.keyboard.down('Space');
  await page.keyboard.down('Space');
  expect((await state(page)).status).toBe('paused');
  await page.keyboard.up('Space');
  expect((await state(page)).status).toBe('paused');
  await page.locator('#heroButton').click();
  expect((await state(page)).status).toBe('playing');
  await page.locator('#heroButton').click();
  await expect(page.locator('#heroButton')).toBeFocused();
  await page.keyboard.press('Enter');
  expect((await state(page)).status).toBe('playing');
  // Space on sound must operate the focused button, without also pausing.
  await page.locator('#soundToggle').focus();
  await page.keyboard.press('Space');
  expect((await state(page)).status).toBe('playing');
  await expect(page.locator('#soundToggle')).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.locator('#soundToggle')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#heroButton').click();
  expect((await state(page)).status).toBe('playing');
});

test('playing border stays independent of keyboard focus, and the header sound control is keyboard accessible', async ({ page, browserName }) => {
  const board = page.locator('#boardWrap');
  const canvas = page.locator('canvas');
  const sound = page.getByRole('button', { name: '游戏音效' });
  // macOS WebKit uses Option+Tab to include buttons in keyboard traversal.
  const optionTab = process.platform === 'darwin' && browserName === 'webkit';
  const previous = optionTab ? 'Alt+Shift+Tab' : 'Shift+Tab';
  const next = optionTab ? 'Alt+Tab' : 'Tab';
  const borderColor = () => board.evaluate(element => getComputedStyle(element).borderTopColor);
  const idleBorder = await borderColor();
  await page.locator('#heroButton').click();
  const playingBorder = await borderColor();
  expect(playingBorder).not.toBe(idleBorder);
  await expect(canvas).toBeFocused();
  await expect(canvas).toHaveCSS('outline-style', 'none');
  await page.keyboard.press(previous);
  await expect(page.locator('#heroButton')).toBeFocused();
  await page.keyboard.press(next);
  await expect(canvas).toBeFocused();
  await expect(canvas).toHaveCSS('outline-style', 'dashed');
  expect(await borderColor()).toBe(playingBorder);
  await page.keyboard.press(previous);
  await page.keyboard.press(previous);
  await expect(sound).toBeFocused();
  await expect(sound).toHaveCSS('outline-style', 'solid');
  await expect(canvas).toHaveCSS('outline-style', 'none');
  expect(await borderColor()).toBe(playingBorder);
  await sound.hover();
  await expect(sound).toHaveCSS('border-top-color', 'rgb(185, 242, 124)');
  await page.keyboard.press('Space');
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
  expect((await state(page)).status).toBe('playing');
  await page.locator('#heroButton').click();
  expect(await borderColor()).toBe(idleBorder);
});

test('leaving the tab pauses the game', async ({ page }) => {
  await page.locator('#heroButton').click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect((await state(page)).status).toBe('paused');
  const paused = await state(page);
  expect((await step(page)).snake).toEqual(paused.snake);
});

test('real timer and audio toggle work outside test mode', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  expect(await page.evaluate(() => window.__snakeTest)).toBeUndefined();
  await page.locator('#heroButton').click();
  await page.clock.runFor(250);
  await expect(page.locator('#gameStatus')).toContainText('游走中');
  await page.keyboard.press('Space');
  await page.clock.runFor(5000);
  await expect(page.locator('#overlayTitle')).toHaveText('已暂停');
  await page.locator('#soundToggle').click();
  await expect(page.locator('#soundToggle')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#soundToggle').click();
  await page.locator('#heroButton').click();
  await page.clock.runFor(2400);
  await expect(page.locator('#gameOverlay')).toHaveAttribute('data-state', 'over');
  await page.locator('#heroButton').click();
  await expect(page.locator('#score')).toHaveText('00');
});

test('touchscreen swipe and D-pad prevent scrolling, surrounding content can scroll', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'Native swipe injection uses Chromium CDP; WebKit pointer input is covered separately.');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:4173'}/?e2e=1`);
    const cdp = await context.newCDPSession(page);
    const swipe = async (x, y, dx, dy) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 5, y: y + dy * i / 5, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    // Finish the surrounding-page fling before measuring game gestures.
    await page.evaluate(() => {
      window.__scrollFinished = new Promise(resolve => document.addEventListener('scrollend', () => resolve(true), { once: true }));
    });
    await swipe(8, 600, 0, -160);
    await page.evaluate(() => window.__scrollFinished);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    await page.locator('#heroButton').tap();
    const before = await page.evaluate(() => scrollY);
    const box = await page.locator('#boardWrap').boundingBox();
    await swipe(box.x + box.width / 2, box.y + box.height / 2, 0, -70);
    expect((await step(page)).direction).toEqual({ x: 0, y: -1 });
    expect(await page.evaluate(() => scrollY)).toBe(before);
    await page.getByRole('button', { name: '向左' }).tap();
    expect((await step(page)).direction).toEqual({ x: -1, y: 0 });
    expect(await page.evaluate(() => scrollY)).toBe(before);
    await page.locator('#pauseButton').tap();
    expect((await state(page)).status).toBe('paused');
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('layout remains readable around the tablet-to-desktop breakpoint', async ({ page }) => {
  for (const width of [900, 960, 1000, 1001, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => {
      const title = document.querySelector('h1 em').getBoundingClientRect();
      const card = document.querySelector('.game-card').getBoundingClientRect();
      return { titleRight: title.right, titleBottom: title.bottom, cardLeft: card.left, cardTop: card.top,
        scrollWidth: document.documentElement.scrollWidth };
    });
    expect(layout.scrollWidth).toBeLessThanOrEqual(width);
    if (width > 1000) expect(layout.titleRight + 24).toBeLessThan(layout.cardLeft);
    else expect(layout.titleBottom).toBeLessThan(layout.cardTop);
  }
});
