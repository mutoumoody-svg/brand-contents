# Brand Contents

品牌内容中心项目，包含品牌资料管理、品牌文案生成、小红书爆文库、爆文仿写、图片海报、热点洞察、飞书同步和 Claude/Coze 调用相关能力。

## 当前目录

```powershell
C:\Users\jingz\Documents\Codex\2026-07-02\03-brand-contents
```

## 启动

```powershell
npm.cmd install
npm.cmd run check
npm.cmd start
```

打开：

```text
http://127.0.0.1:3000
```

健康检查：

```text
http://127.0.0.1:3000/api/health
```

首次注册的用户会自动成为管理员，后续注册用户需要管理员审核。

## 主要入口

- `server.js`：Express 服务、登录注册、SQLite 数据库、品牌库、内容库、小红书接口、飞书同步、Claude 中转。
- `package.json`：Node 依赖和启动脚本。
- `index.html`：文案生成。
- `xhs-writing.html`：小红书文案学习与产出。
- `brand.html`：品牌管理。
- `fangxie.html`：爆文仿写。
- `baowenku.html`：爆文库。
- `xhs-insights.html`：小红书热点洞察。
- `xiaohongshu-poster.html`：图片海报。
- `admin.html`：用户审核和管理。
- `scripts/xhs_scrape.py`：小红书关键词采集脚本。
- `api/claude.js`：Vercel 风格 Claude serverless 中转函数。
- `social-cards/`：小红书社媒卡片生成子项目。
- `docs/ARCHITECTURE.md`：项目结构说明。
- `docs/PROJECT_STATUS.md`：当前状态和启动顺序。
- `scripts/check-project.js`：项目健康检查脚本。

## 常用命令

```powershell
npm.cmd run check
npm.cmd run doctor
npm.cmd run dev
npm.cmd start
scripts\start-server-background.cmd
```

## 环境变量

复制 `.env.example` 为 `.env` 后填写本地密钥。`.env` 已被 `.gitignore` 忽略，不要提交真实 key/token。

最小本地启动只需要：

```env
JWT_SECRET=change-this-to-a-long-random-string
```

需要 AI、飞书或小红书采集时，再补对应变量：

- Claude：`ANTHROPIC_API_KEY`、可选 `CLAUDE_PROXY_URL`、`CLAUDE_WORKER_SECRET`
- 飞书：`FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`FEISHU_BITABLE_APP_TOKEN` 或 `FEISHU_WIKI_NODE_TOKEN`、`FEISHU_BITABLE_TABLE_ID`
- Coze：`COZE_PAT`、`COZE_WORKFLOW_ID`、`COZE_EXTRACT_WORKFLOW_ID`
- 小红书采集脚本：`BOCHA_API_KEY`，必要时 `XHS_COOKIE`

## 本地数据

运行后会自动创建 `data/users.db`。该目录已在 `.gitignore` 中忽略。

## 检查结果

- 当前项目已整理到本目录，原始迁移目录不再是后续开发基准。
- `server.js` 和 `gen_manual.js` 已通过 Node 语法检查。
- 已新增 `/api/health` 健康检查接口。
- 已新增 `npm run check` / `npm run doctor` 项目检查命令。
- 依赖尚未安装时，文件解析、数据库等运行功能需要先执行 `npm install`。
- 前端页面的 Claude 调用已统一走服务端 `/api/claude`，不再在浏览器里暴露 Worker 地址和共享密钥。
- 已新增“小红书文案”模块，可保存写法方法卡、分析爆文结构，并结合品牌资料与爆文样本生成小红书文案。
