const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

function mailConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM);
}
async function sendCode(email, code) {
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465, requireTLS: port !== 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
    disableFileAccess: true, disableUrlAccess: true,
  });
  await transport.sendMail({ from: process.env.SMTP_FROM, to: email,
    subject: 'Brand Center 密码重置验证码',
    text: `你的密码重置验证码是：${code}\n10分钟内有效，重发后旧验证码失效。\n请勿向他人透露验证码。如非本人操作，请忽略此邮件。`,
  });
}
function setupReset(app, db, secret, options = {}) {
  const clock = options.clock || Date.now;
  const sender = options.sendCode || sendCode;
  const configured = options.configured || mailConfigured;
  const digest = value => crypto.createHmac('sha256', secret).update(value).digest('hex');
  db.exec(`CREATE TABLE IF NOT EXISTS password_reset_codes (
    email TEXT PRIMARY KEY, nonce TEXT NOT NULL, digest TEXT NOT NULL, expires INTEGER NOT NULL,
    attempts INTEGER DEFAULT 0, sent_at INTEGER NOT NULL, used INTEGER DEFAULT 0
  ); CREATE TABLE IF NOT EXISTS password_reset_limits (
    key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL
  );`);
  function limit(key, max, ttl) {
    const now = clock(), hashed = digest(key);
    db.prepare('DELETE FROM password_reset_limits WHERE expires<=?').run(now);
    const row = db.prepare('SELECT * FROM password_reset_limits WHERE key=?').get(hashed);
    if (row && row.count >= max) return false;
    db.prepare(`INSERT INTO password_reset_limits(key,count,expires) VALUES(?,1,?)
      ON CONFLICT(key) DO UPDATE SET count=count+1`).run(hashed, now + ttl);
    return true;
  }
  const emailOf = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
  const validEmail = value => value.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value);
  const userOf = email => {
    const rows = db.prepare('SELECT id,email,auth_version FROM users WHERE lower(trim(email))=?').all(email);
    return rows.length === 1 ? rows[0] : null;
  };
  app.get('/api/auth/password-reset/status', (req, res) => res.json({ enabled: configured() }));
  app.post('/api/auth/password-reset/request', async (req, res) => {
    const email = emailOf(req.body?.email);
    if (!validEmail(email)) return res.status(400).json({ error: '请输入有效的注册邮箱' });
    if (!configured()) return res.status(503).json({ error: '邮件服务尚未配置，请联系管理员' });
    const now = clock(), ip = req.socket.remoteAddress || 'unknown';
    if (!limit('send-ip:'+ip, 60, 3600000) || !limit('cooldown:'+email,1,60000) || !limit('send-email:'+email,5,3600000))
      return res.status(429).json({ error: '发送过于频繁，请稍后重试' });
    db.prepare('DELETE FROM password_reset_codes WHERE expires<?').run(now - 3600000);
    const user = userOf(email);
    if (user) {
      const code = crypto.randomInt(0,1000000).toString().padStart(6,'0');
      const nonce = crypto.randomUUID();
      db.prepare(`INSERT INTO password_reset_codes(email,nonce,digest,expires,sent_at) VALUES(?,?,?,?,?)
        ON CONFLICT(email) DO UPDATE SET nonce=excluded.nonce,digest=excluded.digest,expires=excluded.expires,sent_at=excluded.sent_at,attempts=0,used=0`)
        .run(email,nonce,digest(email+':'+nonce+':'+code),now+600000,now);
      try { await sender(user.email.trim(),code); }
      catch (err) {
        db.prepare('UPDATE password_reset_codes SET used=1 WHERE email=? AND nonce=?').run(email,nonce);
        console.error('Password reset email failed:', err.code || 'SMTP_ERROR');
      }
    }
    res.status(202).json({ message: '若邮箱已注册，将收到验证码。请检查收件箱和垃圾邮件。', retryAfter:60 });
  });
  app.post('/api/auth/password-reset/confirm', async (req, res) => {
    const email = emailOf(req.body?.email), code = req.body?.code, password = req.body?.password;
    if (!validEmail(email) || typeof code !== 'string' || !/^\d{6}$/.test(code)) return res.status(400).json({ error: '请输入注册邮箱和6位验证码' });
    if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password,'utf8') > 72)
      return res.status(400).json({ error: '新密码至少8个字符，最多72个UTF-8字节' });
    if (!limit('confirm-ip:'+(req.socket.remoteAddress || 'unknown'),60,3600000) || !limit('confirm-email:'+email,20,3600000))
      return res.status(429).json({ error: '尝试过于频繁，请稍后重试' });
    const row = db.prepare('SELECT * FROM password_reset_codes WHERE email=?').get(email);
    const invalid = () => res.status(400).json({ error:'验证码无效、已过期或尝试次数过多，请重新获取' });
    if (!row || row.used || row.expires <= clock() || row.attempts >= 5) return invalid();
    db.prepare('UPDATE password_reset_codes SET attempts=attempts+1 WHERE email=?').run(email);
    const hash = digest(email+':'+row.nonce+':'+code);
    if (!crypto.timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(row.digest,'hex'))) return invalid();
    try {
      const passwordHash = await bcrypt.hash(password,12);
      const changed = db.transaction(() => {
        const current = db.prepare('SELECT * FROM password_reset_codes WHERE email=?').get(email);
        const user = userOf(email);
        if (!user || current.used || current.nonce !== row.nonce || current.expires <= clock() || current.attempts > 5) return false;
        db.prepare('UPDATE users SET password=?,auth_version=auth_version+1 WHERE id=?').run(passwordHash,user.id);
        db.prepare('UPDATE password_reset_codes SET used=1 WHERE email=?').run(email);
        return true;
      })();
      if (!changed) return invalid();
      res.json({ message:'密码已重置，请使用新密码登录' });
    } catch { res.status(500).json({ error:'密码重置失败，请稍后重试' }); }
  });
}
module.exports = { setupReset, mailConfigured };
