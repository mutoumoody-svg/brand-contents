# 项目结构

Brand Contents 是一个 Express + SQLite + 静态 HTML 的本地品牌内容中心。

## 运行入口

- `server.js`：主服务入口，负责认证、SQLite 数据库、内容 API、品牌 API、小红书 API、飞书同步、Claude 中转和静态页面服务。
- `package.json`：项目依赖与命令。
- `.env.example`：本地环境变量模板。

## 页面入口

- `login.html` / `register.html`：登录和注册。
- `admin.html`：用户审核与管理。
- `brand.html`：品牌资料管理。
- `index.html` / `wencai.html`：品牌文案生成。
- `fangxie.html`：爆文仿写。
- `baowenku.html`：爆文库。
- `fenxi.html`：文案分析。
- `xiaohongshu-poster.html`：图片海报。
- `xhs-insights.html`：小红书热点洞察。

## 数据

服务启动后会自动创建 `data/users.db`。其中包含用户、内容、品牌、爆文、小红书笔记等表。`data/` 已加入 `.gitignore`，不应提交。

## 外部能力

- Claude：前端统一调用 `/api/claude`，后端再转发到 `CLAUDE_PROXY_URL`。
- 飞书：通过 `FEISHU_*` 环境变量同步多维表格。
- Coze：通过 `COZE_*` 环境变量调用小红书相关工作流。
- 小红书采集：`scripts/xhs_scrape.py` 使用 `BOCHA_API_KEY` 和本机 Claude 内部转发辅助提取。

## 子项目

`social-cards/` 下包含两套小红书社媒卡片生成项目，各自带 `package.json` 和渲染脚本。它们与主服务相对独立。
