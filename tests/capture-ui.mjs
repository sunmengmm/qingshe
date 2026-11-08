import { chromium } from '@playwright/test';
import { mkdir, readdir, writeFile } from 'node:fs/promises';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4173';
const directory = process.env.UI_REVIEW_DIR || 'artifacts/ui-review';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const viewports = [
  ['desktop-1366', 1366, 768], ['desktop-1440', 1440, 900],
  ['mobile-390', 390, 844], ['mobile-430', 430, 932], ['tablet-768', 768, 1024],
];
const report = [];
try {
  for (const [name, width, height] of viewports) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', hasTouch: width <= 1000 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${baseURL}/?e2e=1`);
    await page.evaluate(() => localStorage.setItem('qingshe-best', '5'));
    await page.reload();
    await page.waitForFunction(() => Boolean(window.__snakeTest));
    async function capture(state) {
      const path = `after-${name}-${state}.png`;
      if (state === 'paused' || state === 'over') {
        await page.waitForFunction(() => document.activeElement === document.querySelector('#heroButton'));
      }
      await page.screenshot({ path: `${directory}/${path}`, fullPage: state === 'idle', animations: 'disabled' });
      const layout = await page.evaluate(() => {
        const box = selector => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom };
        };
        return { viewport: { width: innerWidth, height: innerHeight }, scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight, board: box('.board-wrap'), card: box('.game-card'),
          header: box('.topbar'), primaryButton: box('#heroButton'), soundButton: box('#soundToggle'), dpad: box('.dpad'),
          state: window.__snakeTest.snapshot() };
      });
      report.push({ name, state, path, layout, errors: [...errors] });
    }
    await capture('idle');
    await page.locator('#heroButton').click();
    for (const direction of ['right', 'right', 'right', 'up', 'up', 'up', 'left', 'left']) {
      await page.evaluate(direction => {
        window.__snakeTest.prepareTurn(direction);
        window.__snakeTest.setFoodAhead();
        window.__snakeTest.step();
      }, direction);
    }
    await capture('playing');
    await page.keyboard.press('Space');
    await capture('paused');
    await page.locator('#heroButton').click();
    await page.evaluate(() => { window.__snakeTest.setScenario('wall'); window.__snakeTest.step(); });
    await capture('over');
    if (errors.length) throw new Error(errors.join('\n'));
    await context.close();
  }
  await writeFile(`${directory}/layout-report.json`, JSON.stringify(report, null, 2));
  const files = await readdir(directory);
  const oldFiles = ['desktop', 'mobile'].flatMap(device => ['idle', 'playing', 'over'].map(state => `before-${device}-${state}.png`)).filter(path => files.includes(path));
  await writeFile(`${directory}/index.html`, `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>青蛇 · 改版视觉验收</title><style>body{margin:32px;background:#08120d;color:#eaf7ee;font:15px system-ui}h1{font-size:24px}h2{margin-top:40px}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}figure{margin:0}img{width:100%;max-height:540px;object-fit:contain;object-position:top;background:#0c1711;border:1px solid #304539}a{color:#b9f27c}figcaption{margin:10px 0;font-size:12px}</style><h1>青蛇 QING SHE · 视觉验收</h1><p>截图使用固定测试场景展示真实渲染，移动端初始状态为全页截图，游玩状态为启动后视口截图。</p>${oldFiles.length ? '<h2>改版前</h2>' : ''}<section>${oldFiles.map(path => `<figure><a href="${path}"><img src="${path}" alt="${path}" loading="lazy"></a><figcaption>${path}</figcaption></figure>`).join('')}</section><h2>改版后</h2><section>${report.map(({ path }) => `<figure><a href="${path}"><img src="${path}" alt="${path}" loading="lazy"></a><figcaption>${path}</figcaption></figure>`).join('')}</section></html>`);
  console.log(`Saved ${report.length} screenshots and layout-report.json to ${directory}`);
} finally {
  await browser.close();
}
