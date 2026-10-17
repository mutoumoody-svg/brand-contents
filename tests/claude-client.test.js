const { test } = require('node:test');
const assert = require('node:assert/strict');
const { requestClaude } = require('../lib/claude-client');
test('Worker模式无需服务器API Key，异常响应正确报错', async t => {
  const originalFetch=global.fetch;
  const saved={CLAUDE_PROXY_URL:process.env.CLAUDE_PROXY_URL,CLAUDE_WORKER_SECRET:process.env.CLAUDE_WORKER_SECRET,ANTHROPIC_API_KEY:process.env.ANTHROPIC_API_KEY};
  t.after(()=>{global.fetch=originalFetch;for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
  process.env.CLAUDE_PROXY_URL='https://example.test/';process.env.CLAUDE_WORKER_SECRET='test-only-secret';delete process.env.ANTHROPIC_API_KEY;
  global.fetch=async(url,options)=>{assert.equal(options.headers['x-worker-secret'],'test-only-secret');assert.equal(options.headers['x-api-key'],undefined);return new Response(JSON.stringify({content:[{type:'text',text:'成功'}]}));};
  assert.equal((await requestClaude({messages:[]})).content[0].text,'成功');
  global.fetch=async(url,options)=>{assert.equal(JSON.parse(options.body).system,'只输出一篇');return new Response(JSON.stringify({content:[{type:'text',text:'成功'}]}));};
  assert.equal(await require('../lib/claude-client').complete('测试',32,'只输出一篇'),'成功');
  global.fetch=async()=>new Response('upstream unavailable',{status:502});
  await assert.rejects(()=>requestClaude({}),/非 JSON/);
  global.fetch=async()=>new Response(JSON.stringify({error:{message:'请求不允许'}}),{status:403});
  await assert.rejects(()=>requestClaude({}),/请求不允许/);
  process.env.CLAUDE_PROXY_URL='https://api.anthropic.com/v1/messages';
  await assert.rejects(()=>requestClaude({}),/ANTHROPIC_API_KEY/);
});
