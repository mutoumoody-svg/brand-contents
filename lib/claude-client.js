function configuration() {
  const url = process.env.CLAUDE_PROXY_URL || 'https://riverline.cc/';
  const parsed = new URL(url);
  const direct = parsed.hostname === 'api.anthropic.com';
  const credential = direct ? process.env.ANTHROPIC_API_KEY : process.env.CLAUDE_WORKER_SECRET;
  return { url, direct, credential, host: parsed.hostname };
}
async function requestClaude(payload) {
  const config = configuration();
  if (!config.credential) throw Object.assign(new Error(config.direct ? '未配置 ANTHROPIC_API_KEY' : '未配置 CLAUDE_WORKER_SECRET'), { status: 503 });
  const response = await fetch(config.url, {
    method: 'POST', signal: AbortSignal.timeout(Number(process.env.CLAUDE_TIMEOUT_MS) || 120000),
    headers: config.direct
      ? { 'Content-Type': 'application/json', 'x-api-key': config.credential, 'anthropic-version': '2023-06-01' }
      : { 'Content-Type': 'application/json', 'x-worker-secret': config.credential },
    body: JSON.stringify(payload),
  }).catch(err => {
    throw Object.assign(new Error(err.name === 'TimeoutError' ? 'AI 请求超时，请重试' : 'AI 中转连接失败，请检查服务器网络及代理配置'), { status: 502 });
  });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { throw Object.assign(new Error(`AI 中转返回非 JSON 响应 (${response.status})`), { status: 502 }); }
  if (!response.ok || data.error) throw Object.assign(new Error(data.error?.message || `AI 请求被拒绝 (${response.status})`), { status: response.ok ? 502 : response.status });
  return data;
}
async function complete(prompt, tokens = 2200) {
  const data = await requestClaude({ model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001', max_tokens: tokens, messages: [{ role: 'user', content: prompt }] });
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  if (!text.trim()) throw new Error('AI 返回空内容');
  if (data.stop_reason === 'max_tokens') throw new Error('AI 输出超出长度，请缩短要求后重试');
  return text;
}
module.exports = { requestClaude, complete, configuration };
