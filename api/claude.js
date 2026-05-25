// Vercel Serverless Function — Claude API 中转站
// Key 从 Vercel 环境变量 ANTHROPIC_API_KEY 读取，不出现在代码里

export default async function handler(req, res) {
  // 只允许 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: { message: '服务器未配置 API Key，请在 Vercel 环境变量中设置 ANTHROPIC_API_KEY' },
    });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
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
}
