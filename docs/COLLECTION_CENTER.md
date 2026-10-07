# 关键词与达人采集中心

## 当前直接采集版本

已移除Coze执行依赖；原有Coze任务仅作为历史记录保留，不能恢复执行。
现有飞书读取与历史热点笔记仍保留，关键词按钮转到新采集中心。
旧仿写页面的链接提取已改为直接数据服务，不再调用Coze。

默认适配TikHub的App V2接口，属于第三方数据源，不是小红书官方API。未配置凭据时不能真实搜索或采集。
只实现可替换的数据服务适配，不自带站内搜索权限，不保证供应商长期稳定。

服务器brand.env增加：

```env
XHS_DATA_PROVIDER=tikhub
TIKHUB_API_KEY=由你在服务商控制台取得的Key
```

Key仅填服务器文件；不要发送到聊天或提交Git。费用和可用额度以服务商账户为准。本轮没有购买服务或发送付费采集请求。
首次验收建议关键词“咖啡杯”取3篇、每篇最多20条评论；核对正文、作者ID、原帖与互动数，再测试达人链接。
搜索列表仅作发现，之后逐篇读取详情；不将列表摘要冒充完整正文。
图文和视频按来源类型分别读取；目前评论采集为一级评论，未自动分页抓取二级回复。
没有评论结果不代表原帖无评论；响应结构变化会明确失败，需更新适配器。

核验来源：
- https://github.com/TikHub/TikHub-API-Python-SDK/blob/main/docs/reference.md
- https://github.com/TikHub/TikHub-API-Python-SDK/blob/main/src/tikhub/resources/xiaohongshu_app_v2.py

如使用自定义适配服务，设置XHS_DATA_PROVIDER=custom，并配置下方契约中的URL和TOKEN。
以下是初版框架说明；其中Coze支持描述仅适用于旧版本，当前已经停用。

入口：`/collection.html`。两种任务：关键词搜索、指定达人账号。
达人入口接受完整`https://www.xiaohongshu.com/user/profile/账号ID`；也支持该达人的笔记链接，先由数据服务读取作者ID。
短分享链接需先打开为完整笔记/主页链接；昵称不是唯一标识。

## 已实现

- SQLite后台队列，重启暂停、记录进度、按笔记ID去重、多关键词/账号任务独立关联。
- 标题、正文、作者、账号ID、原帖链接、点赞数、收藏数、评论数、发布时间及采集时间。
- 计数支持数字、1.2万、k等格式；缺失字段为未知，不自动补0。
- 评论正文、评论ID、作者、点赞数、时间和父评论ID；查看与JSON导出。
- 任务内按标题/作者/正文筛选、暂停、重试与分页继续。
- Coze仍作为关键词来源使用。旧链路不支持达人及评论正文，选择评论采集时会提示明确的缺失原因。

## 实际数据源尚需接通

新系统不自带小红书官方全站搜索权限，也没有内置绕过验证码或访问限制的逻辑。
没有可用数据服务时，达人入口会明确提示未配置，不能声称已采集真实账号内容。
现有Coze仍可用，但其真实运行、插件返回字段和登录态有效性需要现场验证。
外部网页摘要和AI生成文本不在此资料库中冒充原帖。

## 数据服务适配契约

`XHS_DATA_API_URL`和`XHS_DATA_API_TOKEN`指向管理员控制的HTTPS适配服务。这里的路径是本项目定义的契约，**不是小红书官方接口，也不是任意第三方供应商的直接API地址**。
选定供应商后需将它的真实API映射到此契约，或替换`lib/collection-source.js`。

所有接口POST JSON，Authorization: Bearer凭据。

| 路径 | 输入 | 返回 |
| --- | --- | --- |
| search | keyword、limit、cursor | notes数组、next_cursor |
| creator/notes | creator_url、limit、cursor | notes数组、next_cursor |
| note | note_id或url | 单篇笔记 |
| comments | note_id、url、limit、cursor | comments数组、next_cursor |

笔记字段：id（24位hex笔记ID）、url、title、body、author、author_id、likes、comment_count、collects、published_at。
评论字段：id、parent_id、author、body、likes、published_at。正文须为来源返回的真实内容。
评论每篇上限100条，不保证拿到全部评论；空结果不等于原帖没有评论。

任务目标是采集上限，不能保证搜索一定有足够结果。来源必须支持分页且明确next_cursor；每轮最多10页。
任务按单进程顺序执行，其他任务运行期间不能恢复暂停任务；支持最多3个等待/运行任务/用户。
暂停在当前请求或篇处理完成后生效，不会取消已付费的供应商请求。
界面“已配置”仅表示环境参数存在，不保证权限与网络正常。

## 本次验证边界

回归测试使用模拟数据源检查关键词、达人解析、评论、计数、去重、用户权限及导出；真实供应商接口未接入。
用户提供的“swallow爱生活”笔记无法通过当前浏览工具读取正文，尚未确认其主页ID或采集成功率。
飞书现有记录仍在原热点页面；新资料库尚未加入飞书写回或自动转爆文库功能。
