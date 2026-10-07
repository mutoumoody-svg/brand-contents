# 当前状态

更新时间：2026-10-07

## 本次升级

- 内容工作台：后台持久化任务、逐篇编辑、失败重试和文案导出。
- 统一历史文字重合检查、方法采用统计、发布效果与人工反馈回填。
- 静态文件白名单、持久化随机JWT密钥、统一AI超时处理、版本诊断与备份部署脚本。
- 使用和部署见 `docs/UPGRADE_2026-10-07.md`。
- 下方是早期整理记录，历史配置说明不代表当前线上状态。

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
- 已接入Git仓库；部署状态以线上`/api/health`版本为准。

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
