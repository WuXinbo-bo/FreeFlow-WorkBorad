# FreeFlow Canvas Demo Standalone

这是一个完全独立于主项目运行时的静态 Demo 子项目，目标是部署到 GitHub Pages，并作为产品演示窗口嵌入外部页面。

## 特性

- 独立 `package.json` 与 Vite 构建链路
- 画布引擎源码已复制到本子项目内部，不依赖主项目运行时
- 兼容 GitHub Pages 子路径部署
- 通过启动时静态 runtime shim 屏蔽 `/api/*` 与桌面壳依赖

## 启动

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

如需以 GitHub Pages 仓库子路径部署，可在构建时指定：

```bash
DEMO_BASE=/your-repo-name/ npm run build
```
