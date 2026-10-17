# 官方插件发布流程

## 发布前

1. 先在应用分支完成修改和回归。共享改动同步到 `main / mac / win`，保留平台适配。
2. 使用宿主已经信任的 Ed25519 私钥签名。私钥只保存在受控本机或发布环境，不提交、不上传、不写日志。不要为了构建成功更换宿主公钥。
3. 在 `mac` 构建 `--platform darwin --arch any` 包，在 `win` 构建 `--platform win32 --arch any` 包；`any` 仅指插件没有内置架构相关二进制，不表示主程序支持任意架构。

以下版本仅为示例；插件版本可以独立于应用版本更新：

```sh
npm run build:assistant-plugin -- --plugin-version 2.0.3 --min-app-version 2.0.2 --platform darwin --arch any --base-url https://github.com/WuXinbo-bo/FreeFlow-WorkBorad/releases/download/plugin-ai-assistant-v2.0.3/
```

Windows 工作树使用相同命令，把 `darwin` 改为 `win32`。签名私钥路径通过 `FREEFLOW_PLUGIN_SIGNING_KEY_FILE` 指定。构建产物位于应用工作树的 `release/plugins/`，不要提交到本分支。

## 上传与切换目录

1. 创建插件 Release 草稿，标签为 `plugin-ai-assistant-v2.0.3`，目标为实际构建源码提交。发布说明分别记录 Mac 和 Windows 的源码提交、包校验值及测试范围。
2. 上传两个 `.ffplugin`。以 `make_latest=false` 发布，保持主程序 `v...` 为 Latest。不要覆盖已经公开的同版本包；修复使用新插件版本。
3. 匿名访问两个固定 HTTPS 下载地址，验证实际包大小、SHA-256、签名。执行对应系统的真实桌面安装测试。
4. 将构建生成的两条目录记录合成 `{ "schemaVersion": 1, "id": "freeflow.ai-assistant", "packages": [...] }`。保存版本快照至 `manifests/freeflow.ai-assistant/<版本>.json`，再更新 `catalog/v1/freeflow.ai-assistant.json`。保留仍受支持的旧版本，以便旧宿主选择最高兼容版本。
5. 更新 `catalog/v1/index.json` 中的插件描述，执行本地和在线验证。包先存在，目录后切换，避免客户端读到不存在的下载地址。
6. 提交并推送 `plugins`。核验 raw 目录可访问及客户端真实安装，之后再宣布在线可用。

GitHub CLI 示例（需要维护者授权，不需要用户同步 Token）：

```sh
gh release create plugin-ai-assistant-v2.0.3 --draft --latest=false --target <源码提交> --title "AI 助手 2.0.3" --notes-file release-notes.md
gh release upload plugin-ai-assistant-v2.0.3 freeflow-ai-assistant-2.0.3-darwin.ffplugin freeflow-ai-assistant-2.0.3-win32.ffplugin
gh release edit plugin-ai-assistant-v2.0.3 --draft=false --latest=false
```

## 撤回与恢复

若新版本不可用，先从活动目录移除该版本或恢复前一个目录提交，停止新的安装。不要修改已发布包内容。客户端安装失败保留旧版本，更新成功后下次启动才启用；已经安装的坏版本不会因目录撤回而自动降级。

重新导入旧版本前先备份会话，确认旧插件支持现有数据库格式。组件代码回退不等于数据库回退。签名密钥轮换需要主程序信任迁移，不能仅修改本分支的公钥。
