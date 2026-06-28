try { require('dotenv').config(); } catch (e) {}
const express  = require('express');
const path      = require('path');
const fs        = require('fs');
const bcrypt    = require('bcrypt');
const jwt       = require('jsonwebtoken');
const Database  = require('better-sqlite3');
// 文件解析包（懒加载，缺包时不影响主服务启动）
let multer, pdfParse, mammoth, JSZip;
try { multer   = require('multer');    } catch(e) {}
try { pdfParse = require('pdf-parse'); } catch(e) {}
try { mammoth  = require('mammoth');   } catch(e) {}
try { JSZip    = require('jszip');     } catch(e) {}

const app        = express();
const PORT       = process.env.PORT       || 3000;
const API_KEY    = process.env.ANTHROPIC_API_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'brand-center-change-this-in-env';

// ── 数据库初始化 ──
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'users.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT    UNIQUE NOT NULL,
    password   TEXT    NOT NULL,
    name       TEXT    NOT NULL,
    role       TEXT    DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

app.use(express.json({ limit: '10mb' }));

// upload 中间件（multer 加载后才初始化）
function getUpload() {
  if (!multer) return null;
  return multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
}

// ── Auth 中间件 ──
function authenticateToken(req, res, next) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: { message: '请先登录' } });
  try {
    const user = jwt.verify(token, JWT_SECRET);
    if (user.role === 'pending') {
      return res.status(403).json({ error: { message: '账号待管理员审核，请耐心等待' } });
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: { message: '登录已过期，请重新登录' } });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: { message: '需要管理员权限' } });
  }
  next();
}

// ══════════════════════════════════════════
//  Auth 路由
// ══════════════════════════════════════════

// 注册
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password || !name) {
    return res.status(400).json({ error: '请填写所有字段' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少 6 位' });
  }
  try {
    const hash  = await bcrypt.hash(password, 10);
    const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    // 第一个注册的用户自动成为管理员
    const role  = count === 0 ? 'admin' : 'pending';
    db.prepare('INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)')
      .run(email, hash, name, role);
    res.json({
      message: role === 'admin'
        ? '注册成功！你是第一位用户，已自动成为管理员，请去登录。'
        : '注册申请已提交，等待管理员审核后即可登录。',
      role,
    });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: '该邮箱已注册' });
    }
    res.status(500).json({ error: '注册失败：' + err.message });
  }
});

// 登录
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: '邮箱或密码错误' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: '邮箱或密码错误' });
  if (user.role === 'pending') {
    return res.status(403).json({ error: '账号正在等待管理员审核，请耐心等待' });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({ token, name: user.name, role: user.role });
});

// 验证 Token
app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// ══════════════════════════════════════════
//  管理员路由
// ══════════════════════════════════════════

// 用户列表
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  const users = db.prepare(
    'SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC'
  ).all();
  res.json(users);
});

// 审核通过
app.post('/api/admin/users/:id/approve', authenticateToken, requireAdmin, (req, res) => {
  db.prepare("UPDATE users SET role = 'user' WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// 设为管理员
app.post('/api/admin/users/:id/promote', authenticateToken, requireAdmin, (req, res) => {
  db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// 删除用户（不能删除自己）
app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, (req, res) => {
  if (String(req.params.id) === String(req.user.id)) {
    return res.status(400).json({ error: '不能删除自己' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ══════════════════════════════════════════
//  共享内容库
// ══════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS content (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    user_name  TEXT    NOT NULL,
    type       TEXT    DEFAULT 'fangxie',
    brand_name TEXT    DEFAULT '',
    style      TEXT    DEFAULT '',
    title      TEXT    DEFAULT '',
    body       TEXT    NOT NULL,
    context    TEXT    DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 获取内容（支持 ?brand_name= 和 ?type= 过滤）
app.get('/api/content', authenticateToken, (req, res) => {
  const brand = req.query.brand_name;
  const type  = req.query.type;
  const where = [], params = [];
  if (brand !== undefined && brand !== '') { where.push('brand_name = ?'); params.push(brand); }
  if (type)  { where.push('type = ?'); params.push(type); }
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = db.prepare(
    `SELECT id, user_id, user_name, type, brand_name, style, title, body, context, created_at FROM content ${clause} ORDER BY created_at DESC LIMIT 300`
  ).all(...params);
  res.json(rows);
});

// 保存内容
app.post('/api/content', authenticateToken, (req, res) => {
  const { type, brand_name, style, title, body, context } = req.body || {};
  if (!body) return res.status(400).json({ error: '内容不能为空' });
  const result = db.prepare(
    "INSERT INTO content (user_id, user_name, type, brand_name, style, title, body, context, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))"
  ).run(req.user.id, req.user.name, type || 'fangxie', brand_name || '', style || '', title || '', body, context || '');
  res.json({ id: result.lastInsertRowid });
});

// 删除内容（只能删自己的，管理员可删任意）
app.delete('/api/content/:id', authenticateToken, (req, res) => {
  const item = db.prepare('SELECT user_id FROM content WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: '内容不存在' });
  if (item.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: '只能删除自己的内容' });
  }
  db.prepare('DELETE FROM content WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ══════════════════════════════════════════
//  品牌库（共享，所有用户可读写）
// ══════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS brands (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    slogan         TEXT DEFAULT '',
    industry       TEXT DEFAULT '',
    price          TEXT DEFAULT '',
    age            TEXT DEFAULT '',
    gender         TEXT DEFAULT '',
    audience       TEXT DEFAULT '',
    tones          TEXT DEFAULT '[]',
    keywords       TEXT DEFAULT '[]',
    forbidden      TEXT DEFAULT '[]',
    value          TEXT DEFAULT '',
    story          TEXT DEFAULT '',
    sample         TEXT DEFAULT '',
    concern        TEXT DEFAULT '',
    afterbuy       TEXT DEFAULT '',
    consumer_voice TEXT DEFAULT '',
    trigger        TEXT DEFAULT '',
    share          TEXT DEFAULT '',
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 获取全部品牌
app.get('/api/brands', authenticateToken, (req, res) => {
  const rows = db.prepare('SELECT * FROM brands ORDER BY name ASC').all();
  const brands = rows.map(r => ({
    ...r,
    tones:        JSON.parse(r.tones    || '[]'),
    keywords:     JSON.parse(r.keywords || '[]'),
    forbidden:    JSON.parse(r.forbidden|| '[]'),
    consumerVoice: r.consumer_voice,
  }));
  res.json(brands);
});

// 新建品牌
app.post('/api/brands', authenticateToken, (req, res) => {
  const { name, slogan, industry, price, age, gender, audience,
          tones, keywords, forbidden, value, story, sample,
          concern, afterbuy, consumerVoice, trigger, share } = req.body || {};
  if (!name) return res.status(400).json({ error: '品牌名称不能为空' });
  const result = db.prepare(`
    INSERT INTO brands
      (name, slogan, industry, price, age, gender, audience,
       tones, keywords, forbidden, value, story, sample,
       concern, afterbuy, consumer_voice, trigger, share)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    name, slogan||'', industry||'', price||'', age||'', gender||'', audience||'',
    JSON.stringify(tones||[]), JSON.stringify(keywords||[]), JSON.stringify(forbidden||[]),
    value||'', story||'', sample||'',
    concern||'', afterbuy||'', consumerVoice||'', trigger||'', share||''
  );
  res.json({ id: result.lastInsertRowid });
});

// 更新品牌
app.put('/api/brands/:id', authenticateToken, (req, res) => {
  const { name, slogan, industry, price, age, gender, audience,
          tones, keywords, forbidden, value, story, sample,
          concern, afterbuy, consumerVoice, trigger, share } = req.body || {};
  if (!name) return res.status(400).json({ error: '品牌名称不能为空' });
  db.prepare(`
    UPDATE brands SET
      name=?, slogan=?, industry=?, price=?, age=?, gender=?, audience=?,
      tones=?, keywords=?, forbidden=?,
      value=?, story=?, sample=?,
      concern=?, afterbuy=?, consumer_voice=?, trigger=?, share=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    name, slogan||'', industry||'', price||'', age||'', gender||'', audience||'',
    JSON.stringify(tones||[]), JSON.stringify(keywords||[]), JSON.stringify(forbidden||[]),
    value||'', story||'', sample||'',
    concern||'', afterbuy||'', consumerVoice||'', trigger||'', share||'',
    req.params.id
  );
  res.json({ ok: true });
});

// 删除品牌
app.delete('/api/brands/:id', authenticateToken, (req, res) => {
  db.prepare('DELETE FROM brands WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ══════════════════════════════════════════
//  消费者评论分析报告
// ══════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS brand_analyses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_id     INTEGER NOT NULL,
    review_count INTEGER DEFAULT 0,
    report       TEXT    NOT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 获取某品牌的历史分析列表
app.get('/api/brands/:id/analyses', authenticateToken, (req, res) => {
  const rows = db.prepare(
    'SELECT id, review_count, created_at, report FROM brand_analyses WHERE brand_id=? ORDER BY created_at DESC LIMIT 20'
  ).all(req.params.id);
  res.json(rows.map(r => ({ ...r, report: JSON.parse(r.report || '{}') })));
});

// 保存分析报告
app.post('/api/brands/:id/analyses', authenticateToken, (req, res) => {
  const { report, review_count } = req.body || {};
  if (!report) return res.status(400).json({ error: '报告不能为空' });
  const result = db.prepare(
    'INSERT INTO brand_analyses (brand_id, review_count, report) VALUES (?,?,?)'
  ).run(req.params.id, review_count || 0, JSON.stringify(report));
  res.json({ id: result.lastInsertRowid });
});

// 删除分析报告
app.delete('/api/brands/:id/analyses/:aid', authenticateToken, (req, res) => {
  db.prepare('DELETE FROM brand_analyses WHERE id=? AND brand_id=?').run(req.params.aid, req.params.id);
  res.json({ ok: true });
});

// ══════════════════════════════════════════
//  爆文风格库
// ══════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS viral_posts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT    DEFAULT '',
    content    TEXT    NOT NULL,
    platform   TEXT    DEFAULT '小红书',
    tags       TEXT    DEFAULT '[]',
    likes      INTEGER DEFAULT 0,
    analysis   TEXT    DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

app.get('/api/viral-posts', authenticateToken, (req, res) => {
  const rows = db.prepare('SELECT * FROM viral_posts ORDER BY created_at DESC').all();
  res.json(rows.map(r => ({
    ...r,
    tags:     JSON.parse(r.tags     || '[]'),
    analysis: r.analysis ? JSON.parse(r.analysis) : null,
  })));
});

app.post('/api/viral-posts', authenticateToken, (req, res) => {
  const { title, content, platform, tags, likes, analysis } = req.body || {};
  if (!content) return res.status(400).json({ error: '内容不能为空' });
  const result = db.prepare(
    'INSERT INTO viral_posts (title, content, platform, tags, likes, analysis) VALUES (?,?,?,?,?,?)'
  ).run(
    title || '', content,
    platform || '小红书',
    JSON.stringify(tags || []),
    likes || 0,
    analysis ? JSON.stringify(analysis) : null
  );
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/viral-posts/:id', authenticateToken, (req, res) => {
  const { title, tags, likes, analysis } = req.body || {};
  db.prepare('UPDATE viral_posts SET title=?, tags=?, likes=?, analysis=? WHERE id=?')
    .run(title || '', JSON.stringify(tags || []), likes || 0,
         analysis ? JSON.stringify(analysis) : null, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/viral-posts/:id', authenticateToken, (req, res) => {
  db.prepare('DELETE FROM viral_posts WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ══════════════════════════════════════════
//  小红书热点洞察（飞书多维表格同步）
// ══════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS xhs_notes (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    feishu_record_id TEXT UNIQUE,
    keyword          TEXT DEFAULT '',
    title            TEXT DEFAULT '',
    body             TEXT DEFAULT '',
    author           TEXT DEFAULT '',
    note_url         TEXT DEFAULT '',
    cover_image      TEXT DEFAULT '',
    tags             TEXT DEFAULT '[]',
    likes            INTEGER DEFAULT 0,
    comments         INTEGER DEFAULT 0,
    collects         INTEGER DEFAULT 0,
    synced_at        DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
// 兼容旧表：补充直接采集需要的列（已存在则忽略报错）
try { db.exec("ALTER TABLE xhs_notes ADD COLUMN note_id TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE xhs_notes ADD COLUMN source TEXT DEFAULT 'feishu'"); } catch (e) {}
try { db.exec("ALTER TABLE xhs_notes ADD COLUMN total_engagement INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE xhs_notes ADD COLUMN published_at INTEGER"); } catch (e) {}
try { db.exec("ALTER TABLE xhs_notes ADD COLUMN fetched_at INTEGER"); } catch (e) {}

// 飞书多维表格字段名映射：你的表格列名跟这里不一致时，在服务器环境变量里覆盖（如 FEISHU_FIELD_TITLE=笔记标题）
const FEISHU_FIELD_MAP = {
  keyword:    process.env.FEISHU_FIELD_KEYWORD  || '关键词',
  title:      process.env.FEISHU_FIELD_TITLE    || '标题',
  body:       process.env.FEISHU_FIELD_BODY     || '文案',
  author:     process.env.FEISHU_FIELD_AUTHOR   || '博主',
  noteUrl:    process.env.FEISHU_FIELD_URL      || '笔记链接',
  coverImage: process.env.FEISHU_FIELD_COVER    || '封面图',
  tags:       process.env.FEISHU_FIELD_TAGS     || '标签',
  likes:      process.env.FEISHU_FIELD_LIKES    || '点赞',
  comments:   process.env.FEISHU_FIELD_COMMENTS || '评论',
  collects:   process.env.FEISHU_FIELD_COLLECTS || '收藏',
  totalEngagement: process.env.FEISHU_FIELD_TOTAL_ENGAGEMENT || '总互动量',
  publishedAt:     process.env.FEISHU_FIELD_PUBLISHED_AT     || '发布时间',
  fetchedAt:       process.env.FEISHU_FIELD_FETCHED_AT       || '数据获取时间',
};

// 飞书多维表格字段值可能是字符串/数字/富文本数组/附件数组，统一转成文字
function feishuFieldText(fields, name) {
  const v = fields[name];
  if (v === undefined || v === null) return '';
  if (typeof v === 'string' || typeof v === 'number') return v;
  if (Array.isArray(v)) {
    return v.map(item => {
      if (typeof item === 'string') return item;
      if (item?.text) return item.text;
      if (item?.name) return item.name;
      if (item?.url)  return item.url;
      return '';
    }).filter(Boolean).join(v.length > 1 ? '、' : '');
  }
  if (typeof v === 'object') return v.text || v.link || '';
  return String(v);
}

let _feishuToken = null, _feishuTokenExpiry = 0;
async function getFeishuToken() {
  if (_feishuToken && Date.now() < _feishuTokenExpiry) return _feishuToken;
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id:     process.env.FEISHU_APP_ID,
      app_secret: process.env.FEISHU_APP_SECRET,
    }),
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error('飞书 Token 获取失败：' + data.msg);
  _feishuToken = data.tenant_access_token;
  _feishuTokenExpiry = Date.now() + (data.expire - 60) * 1000;
  return _feishuToken;
}

// 如果多维表格是建在飞书"知识库"里的，URL 里拿不到 app_token，只能拿到 wiki 节点 token，
// 需要先调用 wiki API 把节点 token 换成真正的 obj_token（即 bitable 的 app_token）
let _resolvedAppToken = null;
async function resolveFeishuAppToken() {
  if (process.env.FEISHU_BITABLE_APP_TOKEN) return process.env.FEISHU_BITABLE_APP_TOKEN;
  if (_resolvedAppToken) return _resolvedAppToken;

  const nodeToken = process.env.FEISHU_WIKI_NODE_TOKEN;
  if (!nodeToken) throw new Error('未配置 FEISHU_BITABLE_APP_TOKEN 或 FEISHU_WIKI_NODE_TOKEN');

  const token = await getFeishuToken();
  const res = await fetch(`https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(nodeToken)}`, {
    headers: { 'Authorization': 'Bearer ' + token },
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error('飞书 Wiki 节点解析失败：' + data.msg);
  if (data.data.node.obj_type !== 'bitable') throw new Error('该 Wiki 节点不是多维表格类型，实际类型：' + data.data.node.obj_type);

  _resolvedAppToken = data.data.node.obj_token;
  console.log('[飞书] Wiki 节点已解析为 app_token：', _resolvedAppToken);
  return _resolvedAppToken;
}

async function fetchAllFeishuRecords() {
  const token    = await getFeishuToken();
  const appToken = await resolveFeishuAppToken();
  const tableId  = process.env.FEISHU_BITABLE_TABLE_ID;
  if (!appToken || !tableId) throw new Error('未配置 FEISHU_BITABLE_APP_TOKEN(或FEISHU_WIKI_NODE_TOKEN) / FEISHU_BITABLE_TABLE_ID');

  let records = [], pageToken = '';
  do {
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=500` + (pageToken ? `&page_token=${pageToken}` : '');
    const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
    const data = await res.json();
    if (data.code !== 0) throw new Error('飞书读取失败：' + data.msg);
    records.push(...(data.data.items || []));
    pageToken = data.data.has_more ? data.data.page_token : '';
  } while (pageToken);
  return records;
}

async function syncFeishuNotes() {
  const records = await fetchAllFeishuRecords();
  let inserted = 0, updated = 0;

  for (const rec of records) {
    const f = rec.fields || {};
    const tagsRaw = String(feishuFieldText(f, FEISHU_FIELD_MAP.tags) || '');
    const row = {
      feishu_record_id: rec.record_id,
      keyword:     String(feishuFieldText(f, FEISHU_FIELD_MAP.keyword)    || ''),
      title:       String(feishuFieldText(f, FEISHU_FIELD_MAP.title)      || ''),
      body:        String(feishuFieldText(f, FEISHU_FIELD_MAP.body)       || ''),
      author:      String(feishuFieldText(f, FEISHU_FIELD_MAP.author)     || ''),
      note_url:    String(feishuFieldText(f, FEISHU_FIELD_MAP.noteUrl)    || ''),
      cover_image: String(feishuFieldText(f, FEISHU_FIELD_MAP.coverImage) || ''),
      tags:        JSON.stringify(tagsRaw.split(/[,，、\s#]+/).filter(Boolean)),
      likes:       parseInt(feishuFieldText(f, FEISHU_FIELD_MAP.likes))    || 0,
      comments:    parseInt(feishuFieldText(f, FEISHU_FIELD_MAP.comments)) || 0,
      collects:    parseInt(feishuFieldText(f, FEISHU_FIELD_MAP.collects)) || 0,
      total_engagement: parseInt(feishuFieldText(f, FEISHU_FIELD_MAP.totalEngagement)) || 0,
      published_at:     parseInt(feishuFieldText(f, FEISHU_FIELD_MAP.publishedAt))     || null,
      fetched_at:        parseInt(feishuFieldText(f, FEISHU_FIELD_MAP.fetchedAt))       || null,
    };

    const existing = db.prepare('SELECT id FROM xhs_notes WHERE feishu_record_id = ?').get(row.feishu_record_id);
    if (existing) {
      db.prepare(`UPDATE xhs_notes SET keyword=?, title=?, body=?, author=?, note_url=?, cover_image=?, tags=?, likes=?, comments=?, collects=?, total_engagement=?, published_at=?, fetched_at=?, synced_at=datetime('now','+8 hours') WHERE id=?`)
        .run(row.keyword, row.title, row.body, row.author, row.note_url, row.cover_image, row.tags, row.likes, row.comments, row.collects, row.total_engagement, row.published_at, row.fetched_at, existing.id);
      updated++;
    } else {
      db.prepare(`INSERT INTO xhs_notes (feishu_record_id, keyword, title, body, author, note_url, cover_image, tags, likes, comments, collects, total_engagement, published_at, fetched_at, synced_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now','+8 hours'))`)
        .run(row.feishu_record_id, row.keyword, row.title, row.body, row.author, row.note_url, row.cover_image, row.tags, row.likes, row.comments, row.collects, row.total_engagement, row.published_at, row.fetched_at);
      inserted++;
    }
  }
  return { total: records.length, inserted, updated };
}

// 手动触发同步
app.post('/api/xhs/sync', authenticateToken, async (req, res) => {
  if (!process.env.FEISHU_APP_ID || !process.env.FEISHU_APP_SECRET) {
    return res.status(500).json({ error: '服务器未配置 FEISHU_APP_ID / FEISHU_APP_SECRET 环境变量' });
  }
  try {
    const result = await syncFeishuNotes();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: '同步失败：' + err.message });
  }
});

// 关键词采集：调用 Coze 工作流（小红书搜索+详情 → 写入飞书多维表格），再把飞书最新数据同步进本地库
async function runCozeScrapeWorkflow(keyword) {
  if (!process.env.COZE_PAT || !process.env.COZE_WORKFLOW_ID) {
    throw new Error('服务器未配置 COZE_PAT / COZE_WORKFLOW_ID 环境变量');
  }
  if (!process.env.XHS_COOKIE) {
    throw new Error('服务器未配置 XHS_COOKIE 环境变量（小红书登录态，过期需手动更新）');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  let res;
  try {
    res = await fetch('https://api.coze.cn/v1/workflow/run', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.COZE_PAT,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow_id: process.env.COZE_WORKFLOW_ID,
        parameters: { keyword, cookie: process.env.XHS_COOKIE },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json();
  if (data.code !== 0) throw new Error('Coze 工作流调用失败：' + data.msg);
  return data;
}

// Coze 工作流单次运行要 30-50 秒，容易被反向代理超时打断，导致请求"看起来失败"但后台其实跑完了。
// 改成提交即返回 + 前端轮询状态，避免长时间挂住一个 HTTP 请求。
const scrapeJobs = {}; // keyword -> { status: 'running'|'success'|'failed', startedAt, finishedAt, error, result, keywordCount }

app.post('/api/xhs/scrape', authenticateToken, (req, res) => {
  const keyword = String(req.body?.keyword || '').trim();
  if (!keyword) return res.status(400).json({ error: '请输入关键词' });

  scrapeJobs[keyword] = { status: 'running', startedAt: Date.now() };
  res.json({ status: 'started', keyword });

  (async () => {
    try {
      await runCozeScrapeWorkflow(keyword);
      const result = await syncFeishuNotes();
      const keywordCount = db.prepare('SELECT COUNT(*) as c FROM xhs_notes WHERE keyword = ?').get(keyword).c;
      scrapeJobs[keyword] = { status: 'success', finishedAt: Date.now(), result, keywordCount };
    } catch (err) {
      scrapeJobs[keyword] = { status: 'failed', finishedAt: Date.now(), error: err.message };
    }
  })();
});

app.get('/api/xhs/scrape/status', authenticateToken, (req, res) => {
  const keyword = String(req.query.keyword || '').trim();
  res.json(scrapeJobs[keyword] || { status: 'unknown' });
});

// 笔记列表（支持 ?keyword= 过滤，按点赞数排序）
app.get('/api/xhs/notes', authenticateToken, (req, res) => {
  const keyword = req.query.keyword;
  const where  = keyword ? 'WHERE keyword = ?' : '';
  const params = keyword ? [keyword] : [];
  const rows = db.prepare(`SELECT * FROM xhs_notes ${where} ORDER BY likes DESC LIMIT 500`).all(...params);
  res.json(rows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') })));
});

// 关键词聚合统计（笔记数 / 平均点赞）
app.get('/api/xhs/keywords', authenticateToken, (req, res) => {
  const rows = db.prepare(`SELECT keyword, COUNT(*) as count, ROUND(AVG(likes)) as avg_likes FROM xhs_notes WHERE keyword != '' GROUP BY keyword ORDER BY count DESC`).all();
  res.json(rows);
});

// 删除单条笔记记录
app.delete('/api/xhs/notes/:id', authenticateToken, (req, res) => {
  db.prepare('DELETE FROM xhs_notes WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// 若已配置飞书凭证，每 30 分钟自动同步一次
if (process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET && process.env.FEISHU_BITABLE_APP_TOKEN && process.env.FEISHU_BITABLE_TABLE_ID) {
  setInterval(() => {
    syncFeishuNotes()
      .then(r => console.log('[飞书自动同步]', r))
      .catch(e => console.error('[飞书自动同步失败]', e.message));
  }, 30 * 60 * 1000);
}

// ══════════════════════════════════════════
//  文件解析 → 品牌信息提取
// ══════════════════════════════════════════

// 从 PPTX buffer 中提取纯文字
async function extractPptxText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort();
  const texts = [];
  for (const name of slideFiles) {
    const xml = await zip.files[name].async('string');
    // 提取所有 <a:t> 标签内的文字
    const matches = xml.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) || [];
    const slideText = matches.map(m => m.replace(/<[^>]+>/g, '')).join(' ');
    if (slideText.trim()) texts.push(slideText.trim());
  }
  return texts.join('\n');
}

app.post('/api/brands/parse-file', authenticateToken, (req, res, next) => {
  const upload = getUpload();
  if (!upload) return res.status(500).json({ error: '服务器缺少文件解析模块，请先运行 npm install' });
  upload.single('file')(req, res, next);
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传文件' });

  const { originalname, mimetype, buffer } = req.file;
  const ext = path.extname(originalname).toLowerCase();
  let rawText = '';

  try {
    if (ext === '.pdf' || mimetype === 'application/pdf') {
      const data = await pdfParse(buffer);
      rawText = data.text;

    } else if (ext === '.docx' || mimetype.includes('wordprocessingml')) {
      const result = await mammoth.extractRawText({ buffer });
      rawText = result.value;

    } else if (ext === '.pptx' || mimetype.includes('presentationml')) {
      rawText = await extractPptxText(buffer);

    } else if (ext === '.txt' || mimetype.startsWith('text/')) {
      rawText = buffer.toString('utf-8');

    } else {
      return res.status(400).json({ error: `暂不支持 ${ext} 格式，请上传 PDF / Word / PPT / TXT` });
    }
  } catch (err) {
    return res.status(500).json({ error: '文件解析失败：' + err.message });
  }

  if (!rawText.trim()) {
    return res.status(400).json({ error: '文件内容为空或无法提取文字' });
  }

  // 截断超长文本，避免 token 超限（6000字符约 4000 token）
  const trimmedText = rawText.slice(0, 6000);

  // 服务器只负责提取文字，Claude 分析交给浏览器端完成（绕过 VPS 网络限制）
  res.json({ text: trimmedText, chars: rawText.length });
});

// ══════════════════════════════════════════
//  Claude API 中转（需登录）
// ══════════════════════════════════════════
app.post('/api/claude', authenticateToken, async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: { message: '服务器未配置 ANTHROPIC_API_KEY，请在 VPS 上设置环境变量后重启服务' } });
  }
  // CLAUDE_PROXY_URL 可在环境变量里设置自定义域名，默认用 workers.dev
  const PROXY_URL = process.env.CLAUDE_PROXY_URL || 'https://anthorpic-proxy.mutoumoody.workers.dev/';
  try {
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-secret': 'brand-worker-nz-2024',
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: { message: 'API 请求失败：' + err.message } });
  }
});

// 内部专用 Claude 中转：仅供本机后台脚本调用（如 xhs_scrape.py），
// 不要求用户登录态，靠共享密钥 + 仅限本机 IP 兜底防护。
// 背景：服务器到 anthorpic-proxy.mutoumoody.workers.dev 的直连 DNS 被污染，
// Node 进程因为早先缓存了正确解析结果还能连通，但新进程（curl/python）连不上，
// 所以让脚本绕一圈走本机这个已经能用的 Node 出口，而不是直连外部域名。
app.post('/api/internal/claude', (req, res) => {
  const ip = (req.ip || '').replace('::ffff:', '');
  if (ip !== '127.0.0.1' && ip !== '::1') {
    return res.status(403).json({ error: { message: '仅限本机调用' } });
  }
  if (req.headers['x-worker-secret'] !== 'brand-worker-nz-2024') {
    return res.status(403).json({ error: { message: '密钥错误' } });
  }
  if (!API_KEY) {
    return res.status(500).json({ error: { message: '服务器未配置 ANTHROPIC_API_KEY' } });
  }
  const PROXY_URL = process.env.CLAUDE_PROXY_URL || 'https://anthorpic-proxy.mutoumoody.workers.dev/';
  fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-worker-secret': 'brand-worker-nz-2024' },
    body: JSON.stringify(req.body),
  })
    .then(async (response) => {
      const data = await response.json();
      res.status(response.status).json(data);
    })
    .catch((err) => res.status(500).json({ error: { message: 'API 请求失败：' + err.message } }));
});

// ── 静态文件 ──
app.use(express.static(path.join(__dirname)));

app.use((req, res) => res.status(404).send('Not found'));

app.listen(PORT, () => {
  console.log(`Brand Contents 运行中：http://localhost:${PORT}`);
});
