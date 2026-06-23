# 选了么 - 今天吃什么

一个移动端优先的美食转盘工具，用来快速决定今天吃什么。支持分类转盘、自然语言搜索、忌口过滤、收藏、历史记录和海报分享。

当前版本重点：

- 180 个左右内置美食候选。
- 支持 `不要辣的`、`不吃鱼`、`不要油腻的`、`想吃甜的` 等自然语言意图。
- 手机首屏固定，无页面滚动；主界面、结果弹窗和二级弹窗统一为黑白高对比 + iOS 毛玻璃风格。
- 发布文件已预编译，不依赖浏览器端 Babel 转译。

## 快速开始

本地预览：

```powershell
C:\Users\POLLUX\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m http.server 8081
```

访问：

```text
http://localhost:8081/
```

## 构建

源码文件是 `index.html.source`，发布文件是 `index.html`。

构建命令：

```powershell
C:\Users\POLLUX\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts/build.mjs
```

构建会把源码里的 JSX 预编译成普通 JavaScript，减少浏览器端 Babel 转译开销。

## 回归检查

发布前建议先跑：

```powershell
C:\Users\POLLUX\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts/regression-check.mjs
```

这会检查高风险自然语言输入，例如：

- `不要辣的`
- `不吃鱼`
- `不要油腻的`
- `想吃甜的`
- `想吃面`
- `不要冰的`

脚本会确认候选池里没有明显违背意图的食物。

## 发布前检查

1. 修改 `index.html.source`。
2. 运行构建命令。
3. 运行回归检查命令。
4. 检查发布文件没有浏览器端 Babel 残留：

```powershell
Select-String -Path index.html -Pattern '@babel/standalone|type="text/babel"'
```

正常情况下这条命令不输出任何结果。

## 部署

当前适合 GitHub Pages 或任意静态托管平台。部署根目录即可，入口文件是 `index.html`。

## 维护说明

- 修改功能时优先改 `index.html.source`，再运行构建命令。
- 不要手动编辑构建后的 `index.html` 作为长期源码，否则下次构建会覆盖。
- 规则类问题请同步记录到 `docs/troubleshooting-guide.md`。
