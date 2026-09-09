# 余光 AFTERLIGHT · 隔离区 04

基于 Three.js 的浏览器第一人称生存射击游戏，入口为 `index.html`。

现版本是洛杉矶废墟街道的夜间关卡：棕榈树、破损商铺、坍塌楼层、烧毁车辆与烟尘。三类僵尸拥有不同体型和动作；搭档林双手持霰弹枪射击，带玩家依次前往诊所、弹药平台和泵站，途中会等待与接应玩家。

- `WASD` 移动，鼠标瞄准，左键射击，右键精确瞄准。
- `F` 开关手电；开局会提示打开手电。
- `R` 换弹，`E` 补给 / 扶起队友，`Shift` 冲刺，空格跳跃，`H` 操作提示。
- 出门后 0.8 秒启动首波，首波 6 只僵尸按 0.42 秒间隔出现；波间整备时间为 6 秒。

角色使用 PixelHouse 的 CC BY 3.0 僵尸和 thehumbug 的 CC BY-SA 3.0 幸存者模型，作者、原始下载与修改说明见 [ASSETS.md](ASSETS.md)。地图目前仍为程序化街区，外部洛杉矶场景尚未接入。

[在线游玩](https://jordyning.github.io/left-4-dead/)

## 本地运行

在项目目录执行：

```bash
python3 -m http.server 8000
```

然后在桌面浏览器中打开 <http://localhost:8000>。Three.js 与模型随项目本地提供，不需要第三方 CDN。请通过 HTTP 服务器运行，不能直接双击 HTML 文件。

## 发布

GitHub Pages 从 `main` 分支根目录发布。推送更新后，页面会自动重新部署。

## 验证

安装 `agent-browser` 及其浏览器后，执行现有的游戏验证脚本：

```bash
mkdir -p logs
agent-browser --session afterlight open 'http://localhost:8000/?test=1'
agent-browser --session afterlight wait --fn 'Boolean(window.__game)'
node scripts/verify.cjs afterlight
node scripts/verify-night.cjs afterlight
```

验证结果保存在 `logs/verification.json` 和 `logs/night-verification.json`。后者覆盖 F 键提示、首波刷怪速度、队友等待与全程走路导航、枪口与曳光对齐、角色池、死亡动画回收和重新开始。两组脚本共 26 项检查。

## 文件

- `index.html`：界面、战斗、波次与游戏主循环。
- `district.js`：夜间街景、程序化材质、废墟和环境效果。
- `characters.js`：GLB 加载、独立骨骼克隆、角色动画与持枪瞄准。
- `guide.js`：队友路线、等待和返回接应逻辑。
