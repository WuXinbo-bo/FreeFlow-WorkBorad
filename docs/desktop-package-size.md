# 桌面包体积维护

## 边界

- 浏览器侧 React、Lucide、Markdown、Mermaid、Prism、KaTeX、DOMPurify、html2canvas 在构建时打包或复制到 `public`，列为开发依赖。离线运行不依赖这些 npm 原目录。
- 构建机使用完整 `npm ci`，不能使用 `--omit=dev`；安装后的应用无需 npm、Node 或网络即可使用本地画布、预览、公式和转换能力。
- 保留服务端 `docx`、`latex-to-omml`、PDF、XLSX、sharp、原生 Canvas 及其依赖。MathJax 保留完整 `unpacked` 分发，删除重复的根目录分发，不裁剪公式扩展。
- 移除 source map、类型声明和无用演示依赖；保留 Electron 语言包、KaTeX 字体、PDF 字体/cmaps/wasm 和现有应用入口。
- 浏览器运行库许可证由 `check-desktop-runtime-assets.js --prepare` 生成并随应用分发；依赖更新后重新生成和提交。
- Koffi 是 Windows 外部窗口能力依赖，Windows 必须保留。Mac 分支仅在 `beforePack` 向已归一化的公共白名单追加排除项。不要使用只有否定项的 `mac.files`，否则 electron-builder 会生成额外的全目录匹配器，混入开发工具、历史包和本机文件。

## 验证

```sh
npm ci
npm run prepare:desktop-build
npm run test:desktop-runtime-assets
npm run test:mathjax-packaging
npm run check:desktop-packaging
npm test
```

打包完成后检查真实归档（Windows 使用 `--platform win32`）：

```sh
node scripts/check-desktop-runtime-assets.js --asar-file /绝对路径/app.asar --platform darwin
node scripts/check-assistant-plugin-packaging.js --asar-file /绝对路径/app.asar
npm run test:packaged-desktop -- /绝对路径/FreeFlow.app
```

`test:packaged-desktop` 直接启动成品入口，在临时目录隔离数据，验证原生文件转换、取消后恢复、错误后重试、Word 可编辑公式、离线前端库/PDF Worker/文档预览、画布导出、设置反复开关及刷新。测试报告和夹具路径在控制台输出，不会读取用户画布。浏览器外网请求通过不可达代理隔离，不能借助 CDN 掩盖资源遗漏。

## 体积比较口径

以 `.app` 内非符号链接的普通文件逻辑字节总和为准；同时报告使用相同 `ditto -c -k --sequesterRsrc --keepParent` 参数生成的 ZIP 大小。不要混用 Finder 分配空间、十进制 MB 和二进制 MiB；备份旧产物再比较。应用体积与内存占用是不同指标，本轮减重不代表同等比例的内存下降。

## 本轮实测（2026-10-17）

| 产物 | 优化前 | 优化后 | 减少 |
| --- | ---: | ---: | ---: |
| `.app` 普通文件逻辑总字节 | 785,976,270 | 436,604,105 | 349,372,165（44.45%） |
| ZIP，同一压缩参数 | 250,703,486 | 167,424,898 | 83,278,588（33.22%） |
| app.asar | 380,331,838 | 119,198,010 | 261,133,828 |

完整 `npm test`、发布版本/升级兼容检查、macOS 桌面/后端/前端检查、真实归档边界检查及代码签名验证通过。真实 ARM64 成品连续两轮隔离配置回归通过，覆盖 Markdown/DOMPurify/Mermaid/KaTeX/14 种 Prism 语言、PDF Worker、DOCX 预览、原生文件转换、可编辑 Word 公式、取消/错误恢复、设置开关和重载，未发现渲染异常。

Mac 专属打包过滤另运行 `node scripts/check-macos-package-policy.js`，确认同一白名单拒绝旧产物/工具/本机数据，且只在 darwin 排除 Koffi。

Apple Silicon 应用使用本地 ad-hoc 签名，尚未公证；没有发布到远程。Windows 保留原生依赖，当前机器不能替代 Windows 真机打包与外部窗口嵌入测试。
