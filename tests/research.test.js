const {test}=require('node:test');const assert=require('node:assert/strict');const express=require('express');const Database=require('better-sqlite3');
test('爆文研究验证样本、保存记录与用户隔离',async t=>{
  const db=new Database(':memory:');const app=express();app.use(express.json());
  const auth=(req,res,next)=>{req.user={id:Number(req.headers['x-user']||1)};next();};
  require('../lib/research')(app,db,auth,async()=>JSON.stringify({title:'场景共性',findings:['样本1和2都从通勤切入'],differences:['证据不同'],hypotheses:['测试问题式开头'],limitations:['无曝光数据'],method:{title:'通勤问题法',scene:'通勤',structure:'问题到证据',logic:'减少决策负担'}}));
  const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));t.after(async()=>{await new Promise(r=>s.close(r));db.close();});const base='http://127.0.0.1:'+s.address().port;
  const post=body=>fetch(base+'/api/writing/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await post({samples:[{body:'一篇'}]})).status,400);
  assert.equal((await post({samples:[{body:'文章一'},{body:'文章二'}]})).status,200);
  assert.equal((await(await fetch(base+'/api/writing/research')).json()).length,1);
  assert.equal((await(await fetch(base+'/api/writing/research',{headers:{'x-user':'2'}})).json()).length,0);
});
