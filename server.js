const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(express.json({ limit: '10mb' }));

// ── 静态文件（HTML / CSS / JS）──
app.use(express.static(path.join(__dirname)));

// ── Claude API 中转 ──
app.post('/api/claude', async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({
      error: { message: '服务器未配置 ANTHROPIC_API_KEY 环境变量' },
    });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({
      error: { message: '中转请求失败：' + err.message },
    });
  }
});

// ── 404 ──
app.use((req, res) => {
  res.status(404).send('Not found');
});

app.listen(PORT, () => {
  console.log(`Brand Contents 运行中：http://localhost:${PORT}`);
});
