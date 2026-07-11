# 当前状态

更新时间：2026-07-11

## 已整理

- 当前目录已作为项目根目录使用。
- 主项目入口为 `server.js`。
- 前端 Claude 调用已统一收口到 `/api/claude`。
- 新增 `/api/health` 健康检查接口。
- 新增 `npm run check` / `npm run doctor` 项目检查命令。
- 新增 `docs/ARCHITECTURE.md` 项目结构说明。
- `better-sqlite3` 已升级到 `^12.11.1`，用于适配当前 Node 24 环境。
- `bcrypt` 已替换为纯 JS 的 `bcryptjs`，避免 Windows ARM64 原生编译失败。
- 新增 `scripts/start-server-background.cmd`，用于 Windows 后台启动服务并写入日志。
- 主项目依赖已安装，已生成 `package-lock.json`。
- 已完成端到端启动验证：`/api/health` 正常返回，`login.html` 可访问。
- 新增“小红书文案”模块：方法库、爆文结构学习、品牌结合生成、保存到内容库。

## 待本地补齐

- 需要复制 `.env.example` 为 `.env`，并填写真实密钥和 token。
- 如需版本管理，当前 `.git` 看起来不是完整仓库，需要重新初始化或接入真实仓库。

## 启动顺序

```powershell
cd "C:\Users\jingz\Documents\Codex\2026-07-02\03-brand-contents"
npm.cmd install
copy .env.example .env
npm.cmd run check
npm.cmd start
```

启动后打开：

```text
http://127.0.0.1:3000
```

健康检查：

```text
http://127.0.0.1:3000/api/health
```
