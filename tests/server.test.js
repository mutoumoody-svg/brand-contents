const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
test('服务器启动、静态白名单和登录保护', async t => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(),'brand-test-'));
  const child = spawn(process.execPath,['server.js'], {cwd:path.join(__dirname,'..'),env:{...process.env,PORT:'0',DATA_DIR:data,JWT_SECRET:'',CLAUDE_WORKER_SECRET:''},stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',d=>{stderr+=d;});
  t.after(async()=>{if(child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}fs.rmSync(data,{recursive:true,force:true});});
  const port=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('启动超时 '+stderr)),15000);
    child.once('exit',code=>{clearTimeout(timer);reject(new Error('启动失败 '+code+' '+stderr));});
    child.stdout.on('data',d=>{const m=String(d).match(/localhost:(\d+)/);if(m){clearTimeout(timer);resolve(m[1]);}});
  });
  const base=`http://127.0.0.1:${port}`;
  assert.equal((await fetch(base+'/api/health')).status,200);
  for(const p of ['/server.js','/data/users.db','/brand.env','.env','/package.json','/scripts/deploy.sh'])assert.equal((await fetch(base+(p.startsWith('/')?p:'/'+p))).status,404,p);
  assert.equal((await fetch(base+'/workspace.html')).status,200);
  assert.equal((await fetch(base+'/assets/workspace.js')).status,200);
  assert.equal((await fetch(base+'/api/writing/jobs')).status,401);
});
