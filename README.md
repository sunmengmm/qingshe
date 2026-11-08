# 青蛇

一个无需后端和运行时网络请求的静态浏览器贪吃蛇小游戏。

## 在线游玩

<https://sunmengmm.github.io/qingshe/>

## 开始游戏

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

然后访问 <http://127.0.0.1:4173/>。方向键或 WASD 控制移动，空格键暂停；移动端支持方向按钮和滑动。

点击「开始游戏」，或按 Enter / 空格键开始。同一个主按钮随游戏状态切换为暂停、继续或再来一局；桌面位于左侧，手机和平板位于棋盘上方。棋盘覆盖层只展示状态与提示。手机和平板开始后收起介绍，保留主按钮；点击品牌可回到初始页面。切换到其他标签页时会自动暂停。

游戏仍使用 20×20 棋盘、初始三节蛇身，每颗果实加一分，沿用原来的碰撞规则和加速曲线。最佳纪录在得分时保存到浏览器，音效开关也会记住；如果浏览器禁止存储，仍可正常游戏，页面会提示无法持久保存。

## 自动测试

首次运行先安装开发依赖：

```bash
npm install
```

项目使用已有的 Playwright，在系统 Google Chrome 和 Playwright WebKit 中运行浏览器测试：

```bash
npm test
npm run test:e2e
npm run test:e2e:reliability
```

`npm test` 运行游戏规则与纪录反馈单元测试；`npm run test:e2e` 检查游戏流程、触控、键盘焦点、持久化、存储异常、真实计时和控制台错误。布局覆盖 1366×768、1440×900、390×844、430×932、768×1024，并保留更小手机的回归。原生触屏滑动通过 Chromium CDP 验证，WebKit 验证指针滑动与方向按钮。`npm run test:e2e:reliability` 将整套浏览器检查重复三次。

测试默认自行启动静态服务器。如果本地 4173 端口已有预览服务，可以运行 `BASE_URL=http://127.0.0.1:4173 npm run test:e2e`。

## 视觉验收

先启动本地预览，再运行：

```bash
npm run test:visual
```

截图脚本在五个目标视口生成初始、进行中、暂停、结束状态，共 20 张截图，并输出尺寸和状态数据。打开 `artifacts/ui-review/index.html` 查看前后对照；`before-*` 为本次改版前保存的本地基线，脚本只更新 `after-*`。截图使用 `?e2e=1` 固定场景，正常页面不暴露测试接口，也不暂停真实计时。

可以用 `UI_REVIEW_DIR=artifacts/ui-review/round-2 npm run test:visual` 将新一轮截图存入独立目录，保留上轮结果。

项目是无构建步骤的静态站点，发布文件仍为 `index.html`、`styles.css`、`game.js` 和 `assets/`，不需要新增运行依赖。
