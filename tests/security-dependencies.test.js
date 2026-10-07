const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
test('代理信任子网不能把任意IPv4来源当成可信代理', () => {
  const trust = require('proxy-addr').compile('::ffff:10.0.0.0/8');
  assert.equal(trust('203.0.113.7'),false);
  const valid = require('proxy-addr').compile('10.0.0.0/8');
  assert.equal(valid('10.1.2.3'),true);
  assert.equal(valid('203.0.113.7'),false);
});
test('安全参数库override保留Mammoth命令行兼容性', () => {
  const cli=path.join(path.dirname(require.resolve('mammoth/package.json')),'bin','mammoth');
  const result=spawnSync(process.execPath,[cli,'--help'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/docx-path/);
});
