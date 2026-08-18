# 青蛇

一个无需后端和运行时网络请求的静态浏览器贪吃蛇小游戏。

## 开始游戏

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

然后访问 <http://127.0.0.1:4173/>。方向键或 WASD 控制移动，空格键暂停；移动端支持方向按钮和滑动。

## 自动测试

首次运行先安装开发依赖：

```bash
npm install
```

项目默认使用系统 Google Chrome 运行浏览器测试：

```bash
npm test
npm run test:e2e
npm run test:e2e:reliability
```

`npm test` 运行游戏规则单元测试；`npm run test:e2e` 运行核心游戏流程、触屏控制、持久化、双视口布局和控制台错误检查；`npm run test:e2e:reliability` 将整套浏览器检查重复三次。
