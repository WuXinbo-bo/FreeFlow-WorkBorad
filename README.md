# FreeFlow 官方插件目录

为知识与工作落地而生。

这里是 [FreeFlow](https://github.com/WuXinbo-bo/FreeFlow-WorkBorad) 的官方插件分发分支。它保存插件清单、兼容信息与发布规范；安装包保存在 GitHub Releases，插件源码及测试保存在应用代码分支。

| 插件 | 用途 | 安装方式 |
| --- | --- | --- |
| AI 助手 `freeflow.ai-assistant` | 可选的模型连接、对话及 CLI 工作能力 | FreeFlow 设置 → 画布插件 → 安装 |

AI 镜像属于主程序，不需要安装 AI 助手。当前只接受官方签名插件，尚不支持任意第三方插件接入。首次安装自检通过后，下次启动应用启用；停用和卸载保留会话与配置。

## 目录入口

- [全部插件](catalog/v1/index.json)
- [AI 助手兼容版本](catalog/v1/freeflow.ai-assistant.json)
- [版本清单](manifests/freeflow.ai-assistant/)
- [发布流程](docs/publishing.md)
- [兼容与生命周期](docs/compatibility.md)
- [签名与安全边界](docs/security.md)
- [当前目录结构规范](schemas/catalog-v1.schema.json)

目录采用稳定地址；每个安装包采用固定版本 Release 地址。应用无需 GitHub 账号或个人访问令牌即可读取公开目录。插件下载不会访问用户的画布同步仓库。

后续官方插件沿用独立 ID、目录记录、版本快照与固定 Release 附件的结构；先在宿主实现相应接口、权限和生命周期，再加入索引与校验工具。当前宿主仅注册 AI 助手，不能仅向索引放一个任意脚本就让应用执行。

## 分支约定

`main` 是通用开发基线，`mac` 是 macOS 适配分支，`win` 是 Windows 发布分支。`plugins` 不参与应用代码合并，不是另一个桌面版本。旧的应用分支不需要合并本分支。

应用标签沿用 `v<版本>`；插件使用 `plugin-ai-assistant-v<版本>`。GitHub Releases 与标签属于整个仓库，插件 Release 必须设置 `make_latest=false`，不得替换应用的 Latest。

## 验证目录

需要 Node.js 24 或更新版本，无需安装 npm 依赖：

```sh
node tools/validate-catalog.cjs
node tools/validate-catalog.cjs --online
```

第一条验证清单、签名与兼容描述，第二条还实际下载各平台包并校验大小、SHA-256 和包内签名。目录验证不代替 Mac、Windows 原生安装与功能回归。

本项目采用非商业许可，详见 [LICENSE.md](LICENSE.md)。官方签名表示来源经过确认，不表示插件是系统安全沙箱中的不可信代码。
