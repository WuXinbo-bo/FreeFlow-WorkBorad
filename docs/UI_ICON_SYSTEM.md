# 功能图标规范

FreeFlow 的功能图标共用 `public/src/ui/icons/iconNodes.mjs`，采用 24×24 画板、1.75 线宽、圆角端点与转角，颜色跟随控件的 `currentColor`。产品 Logo、文件扩展名、快捷键键帽及用户文档内容不属于功能图标。

## 使用方式

- React：`AppIcon`，来自 `public/src/ui/icons/AppIcon.jsx`。
- DOM 模板：`renderAppIcon`，来自 `public/src/ui/icons/appIcons.mjs`。
- Canvas 绘制：`drawAppIcon`，复用缓存的 Path2D，并恢复绘图上下文状态。
- 静态 HTML：使用 `data-ui-icon`，执行 `npm run build:ui-icons` 同步几何。桌面构建也会自动同步。

常用尺寸为 18px，密集工具栏与面板控制为 16px，辅助箭头为 14px，状态小标记为 12px，插件或空状态展示为 24px。尺寸只改变图形，不缩小按钮点击区域。统一样式 `public/ui.icons.css` 只针对 `app-icon`；状态隐藏规则仍由具体控件管理。

新增图标应加入共享图形表并沿用上述接口，避免新增 emoji、字体字符、CSS 伪元素或另一套手写 SVG 图标。原有伪元素在迁移时必须同步禁用，展开、收起、快速重复切换都应检查，防止重复图形或恢复遗漏。

## 验证

`npm run test:ui-icons` 检查图形有效性、源码名称引用、React/DOM 几何一致性、模板转义、静态同步以及 Canvas 路径缓存与状态恢复。界面验证还需检查浅色/深色、密集工具栏对齐、各开关状态与点击行为。图标随应用提供，无额外网络加载、图标字体或第三方运行时依赖。

图形基于项目已采用的 Lucide 图标，授权说明位于 `public/src/ui/icons/LUCIDE_LICENSE`。
