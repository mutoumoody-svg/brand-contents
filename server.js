const express  = require('express');
const path      = require('path');
const fs        = require('fs');
const bcrypt    = require('bcrypt');
const jwt       = require('jsonwebtoken');
const Database  = require('better-sqlite3');

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

// 获取全部内容（按时间倒序）
app.get('/api/content', authenticateToken, (req, res) => {
  const rows = db.prepare(
    'SELECT id, user_id, user_name, type, brand_name, style, title, body, context, created_at FROM content ORDER BY created_at DESC LIMIT 300'
  ).all();
  res.json(rows);
});

// 保存内容
app.post('/api/content', authenticateToken, (req, res) => {
  const { type, brand_name, style, title, body, context } = req.body || {};
  if (!body) return res.status(400).json({ error: '内容不能为空' });
  const result = db.prepare(
    'INSERT INTO content (user_id, user_name, type, brand_name, style, title, body, context) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
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
//  Claude API 中转（需登录）
// ══════════════════════════════════════════
app.post('/api/claude', authenticateToken, async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: { message: '服务器未配置 ANTHROPIC_API_KEY' } });
  }
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: { message: '中转失败：' + err.message } });
  }
});

// ── 静态文件 ──
app.use(express.static(path.join(__dirname)));

app.use((req, res) => res.status(404).send('Not found'));

app.listen(PORT, () => {
  console.log(`Brand Contents 运行中：http://localhost:${PORT}`);
});
