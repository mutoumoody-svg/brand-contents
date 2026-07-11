# brand-contents 启动说明

项目路径：

`C:\Users\jingz\Documents\Codex\2026-07-02\03-brand-contents`

用途：品牌内容中心、品牌文案生成、小红书内容库、飞书同步、Claude 调用。

主要入口：

- `server.js`
- `package.json`
- 页面：`index.html`、`brand.html`、`baowenku.html`、`fangxie.html`、`xhs-insights.html`

启动：

```powershell
cd "C:\Users\jingz\Documents\Codex\2026-07-02\03-brand-contents"
npm install
npm start
```

Windows PowerShell 如果拦截 `npm.ps1`，请使用：

```powershell
npm.cmd install
npm.cmd run check
npm.cmd start
```

通常打开：

`http://127.0.0.1:3000`

健康检查：

`http://127.0.0.1:3000/api/health`

注意：迁移时没有复制 `.env`、key、token。需要调用 Claude、飞书、Coze 时，要在本地补环境变量。
