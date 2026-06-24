---
title: whaaat2eat 项目踩坑指南
type: troubleshooting
date: 2026-06-22
tags: [whaaat2eat, 前端, 本地服务, Babel, 调试]
---

# whaaat2eat 项目踩坑指南

## 1. 本机没有 `py` 命令，无法启动本地服务

### 现象

在 PowerShell 里运行：

```powershell
py -m http.server 8081
```

会报错：找不到指定文件。

### 原因

当前 Windows 环境没有可用的 `py` 启动器。这个是本机 Python 命令问题，不是项目代码问题。

### 解决办法

使用 Codex 自带 Python 启动静态服务：

```powershell
C:\Users\POLLUX\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m http.server 8081
```

### 验证命令

```powershell
Get-NetTCPConnection -LocalPort 8081 -State Listen
```

看到监听结果后，访问 `http://localhost:8081/index.html`。

## 2. 扩充版页面不再报 Babel 错，但转盘为空

### 现象

页面可以打开，模糊搜索输入框能显示，但转盘显示 `Load`，`开始旋转` 按钮是禁用状态。

### 原因

扩充版初始化逻辑写成了：只有 `items.length > 0` 时才刷新候选池。首次进入页面时 `items` 是空数组，所以候选池永远不会初始化。

### 解决办法

在 `index.html` 中把候选池刷新条件改为：只要当前没有旋转，就重新生成候选池。

### 验证方法

1. 打开 `http://localhost:8081/index.html`。
2. 页面应显示 8 个候选美食。
3. `开始旋转` 按钮应可点击。

## 3. `不要冰的` 同时命中正向冰品标签

### 现象

输入 `不要冰的` 后，页面同时显示：

```text
✓ 冰品
✗ 冰品
```

还可能显示 `✓ 冰淇淋`、`✓ 果茶`、`✓ 奶茶`。

### 原因

模糊搜索是按关键词包含关系匹配的。`不要冰的` 同时包含 `不要冰` 和 `冰的`，导致否定词和正向词一起生效。

### 解决办法

在 `parseFuzzySearch()` 中增加否定优先规则：当输入包含“不要/不想/别/不 + 冰/凉”时，跳过 `冰的`、`凉的`、`冰爽`、`冰淇淋` 等正向冰凉关键词。

### 验证方法

1. 在搜索框输入 `不要冰的`。
2. 页面应显示 `✗ 冰品`。
3. 页面不应再显示 `✓ 冰品` 或 `✓ 冰淇淋`。

## 4. CDN 版本不要使用不固定地址

### 现象

历史扩充版曾出现 Babel 转译失败，页面空白或转盘为空。

### 原因

使用不固定版本的 CDN 地址时，远端资源变化可能导致浏览器端 Babel/React 行为不稳定。

### 解决办法

当前已固定为：

```html
https://unpkg.com/react@18.2.0/umd/react.production.min.js
https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js
https://unpkg.com/@babel/standalone@7.23.5/babel.min.js
```

### 验证方法

打开页面后查看控制台：

1. 允许出现 Tailwind CDN 和 Babel 浏览器端转译的生产提示。
2. 不应出现红色运行错误。
3. 转盘和按钮应能正常交互。

## 5. `不要辣的` 没有排除辣味菜

### 现象

在搜索框输入 `不要辣的` 后，转盘里仍出现 `酸菜鱼`、`酸辣粉` 等带 `辣` 标签的菜。

### 原因

旧规则只识别 `不辣`，没有识别 `不要辣的`、`不想吃辣`、`别太辣` 这类自然表达。结果系统没有生成 `!辣` 排除标签。

### 解决办法

在 `parseFuzzySearch()` 中增加通用否定规则：`不要 / 不想 / 别 / 不 + 口味词` 优先转成排除标签。目前已覆盖 `辣/重口`、`冰/凉/生冷`、`甜`、`油炸`。

### 验证方法

1. 输入 `不要辣的`。
2. 页面应显示 `✗ 辣` 和 `✗ 重口`。
3. 当前候选不应出现带 `辣` 标签的菜，例如 `酸菜鱼`、`酸辣粉`、`麻辣烫`。

## 6. `下午茶` 被当前分类卡住，导致转盘为空

### 现象

页面自动停在 `正餐` 分类时，输入 `下午茶` 后没有候选，`开始旋转` 按钮变成禁用状态。

### 原因

旧逻辑先按顶部分类筛选，再按模糊搜索筛选。`下午茶` 主要命中甜品和饮品，先被 `正餐` 分类筛掉后就没有候选了。

### 解决办法

当搜索框产生模糊标签时，优先从全库筛选，不再先套顶部分类。顶部分类只在没有模糊搜索时生效。

### 验证方法

1. 停在任意顶部分类。
2. 输入 `下午茶`。
3. 页面应显示甜品/饮品候选，`开始旋转` 按钮应可点击。

## 7. 搜索意图和顶部分类不一致

### 现象

停在 `正餐` 分类时输入 `想吃甜的`，转盘会出现甜品，但顶部分类仍高亮 `正餐`。这会让用户误以为甜品被归到了正餐。

### 原因

模糊搜索改为全库筛选后，搜索结果可以跨分类出现，但顶部分类状态没有跟随搜索意图变化。

### 解决办法

增加搜索意图路由：当输入明显指向某个大类时，自动切换顶部分类。

- `想吃甜的`、`下午茶` -> `甜品`
- `想喝的`、`奶茶`、`咖啡` -> `饮料`
- `宵夜`、`夜宵` -> `宵夜`
- `汤汤水水`、`想吃面`、`想吃米饭` -> `正餐`
- `不要辣的`、`不要甜的`、`不要油炸` -> `正餐`

### 验证方法

1. 手动切到 `正餐`。
2. 输入 `想吃甜的`。
3. 顶部高亮应自动切到 `甜品`，候选应为蛋糕、点心、冰淇淋等甜品类。

## 8. 具体主食词被 `主食` 泛标签扩大结果

### 现象

输入 `想吃面` 后，候选里可能出现汉堡、炸鸡等同样带 `主食` 标签的食物。

### 原因

旧映射把 `面`、`米饭`、`粉` 都映射到了泛化标签 `主食`。过滤逻辑是“命中任一标签即可”，所以结果被扩大。

### 解决办法

收紧具体主食词映射：

- `米饭` 只匹配 `米饭`
- `面` / `面条` 只匹配 `面食`、`汤面`
- `粉` 只匹配 `粉类`
- 只有用户明确输入 `主食` 时才使用 `主食` 泛标签

### 验证方法

1. 输入 `想吃面`。
2. 候选应主要是拉面、牛肉面、小面、水饺等面食相关内容。
3. 不应因为 `主食` 泛标签混入汉堡类。

## 9. `不要油腻的` 没有排除冒菜等重口菜

### 现象

输入 `不要油腻的` 后，转盘仍出现 `冒菜`、`麻辣烫`、`酸辣粉` 等重口或偏油的食物。

### 原因

旧规则只覆盖 `不要油炸`，没有覆盖 `油腻`、`太油`、`重油` 这类表达。`冒菜` 本身没有 `油炸` 标签，所以不会被排除。

### 解决办法

把 `不要油腻 / 不想吃太油 / 别油腻` 映射为：

- 包含倾向：`清淡`、`蒸菜`、`汤水`
- 排除标签：`油炸`、`炸鸡`、`重口`、`辣`

这样冒菜、麻辣烫、酸辣粉、麻辣香锅会被排掉。

### 验证方法

1. 输入 `不要油腻的`。
2. 页面应显示 `✗ 油炸`、`✗ 炸鸡`、`✗ 重口`、`✗ 辣`。
3. 候选不应出现 `冒菜`、`麻辣烫`、`酸辣粉`。

## 10. 手机端顶部分类导航显示不全且不可拖动

### 现象

手机宽度下，分类栏只露出 `全部`、`正餐`、`甜品`，后面的 `饮料`、`宵夜` 点不到，也没有明显拖动条。

### 原因

分类按钮使用了 `flex-1`，在窄屏里被挤压；同时隐藏了滚动条，用户不知道可以横向滑动。

### 解决办法

分类容器改为横向滚动，按钮改为固定最小宽度，并显示细滚动条：

- 容器：`overflow-x-auto nav-scrollbar`
- 按钮：`min-w-[72px] shrink-0`
- 滚动条：4px 高度，移动端可触摸横向滑动

### 验证方法

1. 手机宽度打开页面。
2. 分类栏应能看到滚动条或横向可滑动迹象。
3. 横向滑动后可以点击 `饮料`、`宵夜`。

## 11. `不吃鱼` 被理解成想吃鱼

### 现象

输入 `不吃鱼` 后，页面显示 `✓ 海鲜`、`✓ 鱼`，转盘里出现小龙虾、生蚝、寿司等海鲜。

### 原因

旧规则只按关键词包含匹配。`不吃鱼` 包含 `鱼`，所以被正向映射成 `海鲜`、`鱼`。

### 解决办法

增加“忌口/不吃食材”优先规则，并在过滤时同时排除标签和关键词。

已覆盖：

- `不吃鱼 / 不吃海鲜 / 不吃虾蟹`
- `不吃肉 / 不吃牛肉 / 不吃鸡 / 不吃猪 / 不吃羊`
- `不要辣的 / 不要甜的 / 不要油腻的 / 不要冰的`

### 验证方法

1. 输入 `不吃鱼`。
2. 页面应显示 `✗ 海鲜`、`✗ 鱼`、`✗ 虾`、`✗ 蟹` 等排除项。
3. 候选不应出现酸菜鱼、太二酸菜鱼、小龙虾、烤生蚝、寿司等。

## 12. 不要直接长期维护构建后的 `index.html`

### 现象

性能优化后，项目同时存在 `index.html.source` 和 `index.html`，容易不知道该改哪个。

### 原因

`index.html.source` 是源码，保留 JSX 和更易读的结构；`index.html` 是发布文件，已经把 JSX 预编译成普通 JavaScript。

### 解决办法

功能修改优先改 `index.html.source`，再运行构建命令生成 `index.html`：

```powershell
C:\Users\POLLUX\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts/build.mjs
```

### 验证方法

1. 构建后 `index.html` 不应包含 `type="text/babel"`。
2. 构建后 `index.html` 不应加载 `@babel/standalone`。
3. 本地打开页面，转盘和搜索应正常运行。

## 13. 样式已构建但浏览器还显示旧灰块

### 现象

修改 `index.html.source` 并构建后，本地文件和 HTTP 返回内容已经包含新样式，但浏览器截图仍然显示旧版纯灰色控件。

### 原因

浏览器可能仍在使用旧页面缓存。另一个容易混淆的问题是 Tailwind CDN 对 `dark:bg-white/7`、`dark:border-white/12` 这类非标准透明度类不稳定，可能导致样式回退成生硬灰块。

### 解决办法

1. 对关键玻璃质感控件使用显式 CSS 类，例如 `ios-glass`、`ios-glass-soft`、`ios-glass-input`。
2. 构建后用带时间戳的地址强制刷新页面，例如：

```text
http://localhost:8081/index.html?refresh=1
```

### 验证命令

```powershell
$r = Invoke-WebRequest -Uri http://localhost:8081/index.html?check=glass -UseBasicParsing -TimeoutSec 10; $r.Content -like '*ios-glass*'
```

返回 `True` 后，再刷新浏览器页面检查视觉效果。

## 14. 分享海报时弹出“海报生成失败”

### 现象

点击结果弹窗里的 `分享` 后，海报已经生成，但浏览器弹出 `海报生成失败，请稍后重试`。

### 原因

部分浏览器要求 `navigator.share()` 必须紧贴用户点击动作执行。海报生成需要异步等待，等图片生成后再调用系统分享，浏览器可能认为这已经不是用户手势。

### 解决办法

系统分享失败时不要当作海报生成失败处理，自动降级为下载 PNG 海报。

### 验证方法

1. 抽选出结果。
2. 点击 `分享`。
3. 如果浏览器支持系统分享，应弹出系统分享面板；如果不支持或拦截分享，应下载 `选了么-美食名.png`，不应再出现错误弹窗。

## 15. 旧缓存或旧备份缺少偏好字段

### 现象

老用户打开新版页面，或导入旧版备份后，点击 `收藏`、`加入收藏` 等按钮可能报错。

### 原因

早期偏好数据不一定包含 `favoriteItemIds`、`ignoredFavoriteIds`、`sessionBannedIds` 等字段。直接用旧对象覆盖默认偏好后，数组方法会调用到 `undefined`。

### 解决办法

读取本地偏好时先经过 `normalizePrefs()`，把缺失字段补成默认值；收藏相关交互也使用防御式数组读取。

### 验证方法

1. 在控制台或本地缓存里模拟旧偏好：`{"excludedTags":[]}`。
2. 刷新页面并抽选结果。
3. 点击 `收藏` 不应报错，偏好数据应自动补齐。

## 16. `不要辣的` 排除了辣标签，但描述里仍有辣味词

### 现象

输入 `不要辣的` 后，候选没有 `辣` 标签，但仍可能出现描述里写着 `辣椒油`、`香辣` 的食物，例如部分面食或烧烤。

### 原因

只排除标签还不够。部分条目没有打 `辣` 标签，但名称或描述里包含明显辣味关键词。

### 解决办法

`parseFuzzySearch()` 在识别 `不要辣的` 时，同时加入关键词排除：

```text
辣、麻辣、香辣
```

并且 `getRandomBatch()` 判断是否有模糊搜索时，需要把 `excludeKeywords` 也算进去。

### 验证命令

```powershell
C:\Users\POLLUX\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\regression-check.mjs
```

输出中的 `"ok"` 应为 `true`。

## 17. 黑夜模式转盘文字和海报主题切换不明显

### 现象

线上黑夜模式里，转盘上的白色文字容易和深色切片融在一起；结果弹窗里切换海报主题时，页面看起来没有变化。

### 原因

转盘文字如果依赖粗描边提高对比度，小字号文字在旋转后会显得发糊。海报主题只影响导出的图片，没有在结果弹窗里提供实时预览。

### 解决办法

1. 转盘文字回到无描边的高对比填色：黑色切片用白字，白色切片用深色字。
2. 结果弹窗增加 `poster-preview` 预览卡，切换 `极简白 / 暗夜黑 / 锦鲤红` 时即时变化。

### 验证方法

1. 黑夜模式打开页面，检查转盘文字是否有明显反差描边。
2. 抽选结果后切换海报主题，预览卡应立刻变为对应样式。
3. 构建后确认 `index.html` 包含 `poster-preview-black` 且不包含浏览器端 Babel。

## 18. 后期界面参考：zelda-hyrule-ui

### 参考来源

GitHub: `https://github.com/chaos-xxl/zelda-hyrule-ui`

### 使用建议

这个仓库可以作为后期整体界面优化的灵感参考，尤其是装饰边框、状态面板、仪式感按钮、游戏化菜单层级等方向。

### 注意事项

1. 仓库代码许可证为 MIT，但 Zelda / Nintendo 相关商标、角色、图形和游戏 IP 不在授权范围内。
2. 仓库说明中提到原始 UI 素材基于 CC BY 4.0，需要保留署名。
3. 当前项目已经形成黑白高对比、iOS 毛玻璃、金属刻度的视觉方向，后续不建议直接套 Zelda 主题；更适合借鉴“精致装饰逻辑”和“游戏化交互层级”，再转译成自己的风格。

## 19. 线上巡检发现：Tailwind CDN 生产警告

### 现象

浏览器控制台出现警告：`cdn.tailwindcss.com should not be used in production`。

### 原因

当前项目为了保持单文件静态部署，仍在浏览器端加载 Tailwind CDN。它能运行，但不属于 Tailwind 官方推荐的生产构建方式。

### 影响

短期不阻断使用，也不会影响转盘、搜索或分享功能；长期会影响首屏性能、离线稳定性和线上发布质量。

### 后续建议

后期做整体性能优化时，把 Tailwind 改为构建期产物：使用 Tailwind CLI 或 PostCSS 在本地生成 CSS，再由 `index.html` 引入静态 CSS 文件。

### 验证方法

1. 打开浏览器控制台，确认该警告是否仍存在。
2. 改为构建期 CSS 后，线上页面仍应保持原样式。
3. 构建后继续确认 `index.html` 不包含浏览器端 Babel。

## 20. 应用内浏览器自动化标签页漂移，导致点击验收误判

### 现象

使用 Codex 应用内浏览器做自动点击验收时，刚拿到的标签页 ID 可能很快失效，报类似：

```text
Tab not found
Tab is not part of browser session
```

这会导致测试脚本点不到按钮，看起来像功能失效。

### 原因

这是 Codex 应用内浏览器自动化连接状态漂移，不是页面代码本身的问题。尤其在反复刷新、本地构建、重新打开标签页后更容易出现。

### 解决办法

不要把应用内浏览器失败直接当成产品 bug。优先使用项目内 CDP 冒烟测试，它会启动本机 Chrome 并真实点击页面：

```powershell
C:\Users\POLLUX\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\smoke-cdp.mjs
```

### 验证命令

完整验收建议运行：

```powershell
C:\Users\POLLUX\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\build.mjs; C:\Users\POLLUX\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\regression-check.mjs; C:\Users\POLLUX\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\smoke-cdp.mjs
```

## 21. 口语化忌口词没有被自然语言规则覆盖

### 现象

用户输入 `不吃冷的`、`不吃冰淇淋`、`不要雪糕` 后，甜品候选里仍可能出现冰淇淋、DQ、哈根达斯、刨冰、雪糕等冰品。

用户输入 `不吃油的`、`少油一点`、`想吃不油腻的` 后，正餐或宵夜候选里仍可能出现冒菜、麻辣香锅、酸辣粉、炸鸡、鸡排、薯条、油条、炸串等偏油或重口项目。

### 原因

旧规则只覆盖了比较标准的表达，例如 `不要冰的`、`不要油腻的`。但真实输入更口语化，会出现：

- `冷的`、`雪糕`、`冷饮`、`冰淇淋`
- `油的`、`少油`、`别太油腻`、`想吃不油腻的`
- `少糖`、`无糖`
- `没味的`、`别太清淡`

如果只靠关键词包含匹配，否定词和正向词还可能互相打架，例如 `不吃冰淇淋` 被误解成“不要所有甜品”，导致甜品候选池为空。

### 解决办法

在 `parseFuzzySearch()` 里把口语化表达分成三类处理：

1. 否定意图：优先转成 `excludeTags` 和 `excludeKeywords`。
2. 肯定意图：只在没有对应否定词时加入 `includeTags`。
3. 分类推断：饮品相关词优先进入 `饮料`，甜品相关词进入 `甜品`，避免 `想喝冰的` 被误切到甜品。

同时加入分类缓存版本 `eat_tabs_schema_version`。默认分类更新后，页面会自动校正本地旧缓存，避免旧的 `eat_tabs` 把新版分类规则覆盖掉。

### 验证命令

```powershell
C:\Users\POLLUX\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\build.mjs; C:\Users\POLLUX\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\regression-check.mjs; C:\Users\POLLUX\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\smoke-cdp.mjs
```

### 必测用例

- `甜品` + `不吃冷的`：不能出现冰淇淋、DQ、哈根达斯、刨冰、冰粉、雪糕。
- `甜品` + `不吃冰淇淋`：不能把整个甜品候选池清空。
- `饮料` + `不想喝冰的`：不能出现冰品或冷饮。
- `饮料` + `想喝冰的`：候选必须带 `冰品`，不能混入普通热饮。
- `正餐` + `不吃油的`：不能出现冒菜、麻辣香锅、炸鸡、鸡排、薯条、油条、炸串。
- `正餐` + `少油一点`：候选应偏清淡，同时排除油炸、重口、辣。
- `饮料` + `不想喝咖啡`：不能出现咖啡、拿铁、美式、瑞幸、星巴克等。
- `摇摇机` 切换 `正餐 / 饮料 / 宵夜`：三类候选必须随分类变化。

## 22. 规则词表产品化：后置否定和低糖口语必须纳入自动测试

### 现象

用户输入 `不喝酸的`、`酸的别来`、`柠檬就算了`、`咖啡别来`、`三分糖`、`半糖就行`、`辣的别来`、`油腻就算了`、`清淡免了` 这类表达时，如果只靠旧的关键词映射，容易把否定理解成正向偏好，或者完全没有识别出意图。

### 原因

真实输入不总是“不要 + 目标词”的顺序。很多口语会把否定词放在后面，例如“酸的别来”“油腻就算了”。饮品场景里“少糖、无糖、三分糖、半糖”也不是传统否定句，但产品语义上应该接近“避开高甜候选”。

### 解决办法

在 `parseFuzzySearch()` 里维护统一的 `INTENT_GROUPS` 规则词表：

1. 每个口味组都声明 `includeTags`、`excludeTags`、`excludeKeywords`、`positive`、`negative` 和 `blockedMapKeywords`。
2. 先跑意图词表，再跑 `FUZZY_SEARCH_MAP`，并用 `blockedMapKeywords` 防止负向表达又被正向关键词污染。
3. 同时支持前置否定和后置否定：`不喝酸的` 与 `酸的别来` 都应生成 `避开 酸味`。
4. 把低糖表达单独归入甜口回避：`少糖`、`低糖`、`无糖`、`半糖`、`三分糖`、`五分糖`、`不加糖`、`去糖`。

### 验证命令

```powershell
C:\Users\POLLUX\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\build.mjs; C:\Users\POLLUX\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\regression-check.mjs; C:\Users\POLLUX\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\smoke-cdp.mjs
```

### 必测用例

- `饮料` + `不喝酸的`：显示 `避开 酸味`，不能出现 `偏向 酸味` 或酸梅汤、柠檬、百香果。
- `饮料` + `酸的别来`：同样显示 `避开 酸味`，证明后置否定生效。
- `饮料` + `三分糖`：显示 `避开 甜口`，不能出现奶茶、蜜雪、甜啦啦、7分甜等高甜候选。
- `饮料` + `咖啡别来`：显示 `避开 苦味`，不能出现咖啡品牌或拿铁、美式。
- `正餐` + `辣的别来`：显示 `避开 辣味`，不能出现酸辣粉、酸菜鱼、麻辣类。
- `正餐` + `油腻就算了`：显示 `避开 油腻`，不能出现冒菜、麻辣香锅、炸鸡、薯条、炸串。
- `正餐` + `清淡免了`：显示 `避开 清淡`，候选应偏重口或辣。

## 23. 构建脚本替换 Babel 脚本时不能直接插入含 `$` 的字符串

### 现象

运行 `scripts/build.mjs` 后，`index.html` 明明已经去掉了 `@babel/standalone`，但文件里仍然残留 `type="text/babel"`，页面可能变成空白或脚本异常。检查产物时可以看到源码片段被错误插入到了编译后的 JS 字符串里。

### 原因

`String.prototype.replace(match, replacementString)` 的第二个参数如果是字符串，会把 `$&` 解释为“插入完整匹配内容”。当源码里出现正则转义写法 `'\$&'` 或类似字符串时，构建脚本会误把整段 `<script type="text/babel">...</script>` 插进输出。

### 解决办法

构建脚本替换编译结果时必须使用函数式替换：

```js
.replace(scriptMatch[0], () => `<script>\n${transformed}\n</script>`)
```

不要写成：

```js
.replace(scriptMatch[0], `<script>\n${transformed}\n</script>`)
```

### 验证命令

```powershell
C:\Users\POLLUX\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\build.mjs; node -e "const fs=require('fs');const s=fs.readFileSync('index.html','utf8');console.log({hasTypeBabel:s.includes('type=\"text/babel\"'),hasStandalone:s.includes('@babel/standalone')})"
```

期望输出里 `hasTypeBabel` 和 `hasStandalone` 都是 `false`。
