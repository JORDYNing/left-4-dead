# 余光 AFTERLIGHT · 隔离区 04

基于 Three.js 的浏览器第一人称生存射击游戏，入口为 `index.html`。

现版本是洛杉矶废墟街道的夜间关卡：棕榈树、破损商铺、坍塌楼层、烧毁车辆与烟尘。五类僵尸拥有不同体型、装束和动作；搭档林双手持霰弹枪射击，带玩家依次前往诊所、弹药平台和泵站，途中会等待与接应玩家。

- `WASD` 移动，鼠标瞄准，左键射击，右键精确瞄准。
- `F` 开关手电；开局会提示打开手电。场景全面断电，手电是唯一环境照明，照射距离 46 米；场景仅保留补给地点的招牌，正反面文字均为正序，需要照亮才能看清。
- `R` 换弹，`E` 补给 / 扶起队友，`Shift` 冲刺，空格跳跃，`H` 操作提示。
- 出门后约 0.8 秒启动首波，首波 12 只感染者分三批从不同方位出现；在场上限为 48 只，波间整备时间为 6 秒。

玩家步行 / 冲刺调整为 **3.4 / 5.4 米每秒**，队友跟随、等待和接应距离放宽为原来的两倍。敌人会共享发现与枪声信息，执行正面压进、左右包抄、受击退守和借掩体接近；所有体型都按实体碰撞绕过箱子、车辆和建筑。低 / 高掩体按入口、街道和泵站分段交错布置，具体数值与设计意图见 [COMBAT-DESIGN.md](COMBAT-DESIGN.md)。

步枪现已加入完整射击反馈：首发后推、连射上跳与散布、松手回正，右键瞄准时后坐力和散布更小；枪机往复、短促镜头震动、枪口火光、烟气、抛壳及落地弹跳、曳光、表面弹痕与撞击尘雾。枪口火光不额外照亮环境。后坐力会影响实际子弹方向，近处掩体也会挡住枪口。

枪声由火药爆发、扳机与枪机、撞肩低频和破空尾音四层实时合成，带轻微随机变化；声音开关会立即停止播放。普通命中显示白色标记与伤害数字，爆头显示金色标记和 `70!`，击杀显示橙红标记、得分、冲击血雾及有方向惯性的倒地动画，附带落地声、落地点粒子与地面血迹；尸体渐隐回收。队友击杀不会触发玩家的命中标记或伤害跳字。

角色使用 PixelHouse 的 CC BY 3.0 僵尸和 thehumbug 的 CC BY-SA 3.0 幸存者模型，作者、原始下载与修改说明见 [ASSETS.md](ASSETS.md)。地图目前仍为程序化街区，外部洛杉矶场景尚未接入。

[在线游玩](https://jordyning.github.io/left-4-dead/)

## 本地运行

macOS：双击项目目录中的 **`启动游戏.command`**。启动器会启动本地服务并打开浏览器；终端窗口关闭后，游戏服务仍可使用。重复启动会复用本项目的服务，8000 端口被其他程序占用时会自动选择下一个可用端口。

也可以在项目目录执行：

```bash
python3 scripts/serve.py
```

默认地址是 <http://127.0.0.1:8000>，实际地址会打印在终端中。Three.js 与模型随项目本地提供，不需要第三方 CDN。直接双击 `index.html` 得到的 `file://` 地址无法加载 ES 模块与角色模型，请使用启动器打开。启动日志保存在 `logs/server.log`。

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
node scripts/verify-combat.cjs afterlight
node scripts/verify-tactics.cjs afterlight
```

四组脚本共 59 项检查，结果保存在 `logs/verification.json`、`logs/night-verification.json`、`logs/combat-verification.json` 和 `logs/tactics-verification.json`。战术检查包括分散刷新、五种模型、完整带路路线、实体碰撞、包抄 / 退守、死亡回收及 48 只敌人压力。射击检查覆盖 30/60/120 FPS 的射速与回弹、实际射线、瞄准、鼠标输入、抛壳、碰撞、命中/爆头/击杀、特效回收与重开，并通过 OfflineAudioContext 验证四层音频的实际波形。死亡检查验证五类敌人在不同姿态、击杀来源与帧率下立即下落、约 0.2 秒触地、音效与血迹同步，以及模型回收后的再次倒地。另生成 `logs/rifle-preview.wav`，可试听单发和连射。

## 文件

- `index.html`：界面、战斗、波次与游戏主循环。
- `combat.js`：后坐力、枪械动画、射击特效、命中与击杀反馈；效果池在初始化时分配。
- `combat-audio.js`：四层程序化枪声、机械声与命中音，共用一个带压缩器的混音器。
- `district.js`：夜间街景、程序化材质、废墟和环境效果。
- `characters.js`：GLB 加载、独立骨骼克隆、角色动画与持枪瞄准。
- `guide.js`：队友路线、等待和返回接应逻辑。
- `navigation.js`：按体型分开的导航图、路径缓存、墙角与坡道检测。
- `tactics.js`：分散出生点、小队通讯、侧翼目标、掩体占用与受压状态。
