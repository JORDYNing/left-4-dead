# 余光 AFTERLIGHT · 隔离区 04

基于 Three.js 的浏览器第一人称生存射击游戏，入口为 `index.html`。

[在线游玩](https://jordyning.github.io/left-4-dead/)

## 本地运行

在项目目录执行：

```bash
python3 -m http.server 8000
```

然后在桌面浏览器中打开 <http://localhost:8000>。Three.js 从 CDN 加载，需要联网。

## 发布

GitHub Pages 从 `main` 分支根目录发布。推送更新后，页面会自动重新部署。

## 验证

安装 `agent-browser` 及其浏览器后，执行现有的游戏验证脚本：

```bash
mkdir -p logs
agent-browser --session afterlight open http://localhost:8000
agent-browser --session afterlight wait --fn 'Boolean(window.__game)'
node scripts/verify.cjs afterlight
```

验证结果保存在 `logs/verification.json`。
