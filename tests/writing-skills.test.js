const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3');
test('品牌学习：人工确认、版本冲突、品牌隔离、评论引用和删除权限',async t=>{
  const db=new Database(':memory:');db.exec("CREATE TABLE brands(id INTEGER PRIMARY KEY,name TEXT); INSERT INTO brands VALUES(1,'甲'),(2,'乙')");
  const app=express();app.use(express.json());const auth=(req,res,next)=>{req.user={id:Number(req.headers['x-user']||1)};next();};
  const {setup,knowledge}=require('../lib/writing-skills');setup(app,db,auth,async()=>JSON.stringify({title:'评论洞察',findings:['用户重视便利'],evidence:['好清洗','不存在的评论'],cautions:[],rules:'多写具体使用细节，不编造经历'}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));db.close();});const base='http://127.0.0.1:'+server.address().port;
  async function request(url,body,user=1,method=body?'POST':'GET'){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json','x-user':String(user)},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json()};}
  assert.equal((await request('/api/writing/skills/analyze',{kind:'comments',source:'好清洗'})).status,400);
  const record=(await request('/api/writing/skills/analyze',{brandId:1,kind:'comments',source:'好清洗，通勤方便'})).data;
  assert.deepEqual(record.result.evidence,['好清洗']);assert.equal(knowledge(db,1).length,0);
  assert.equal((await request(`/api/writing/skills/${record.id}/approve`,{version:0,rules:'具体细节'} ,2)).status,404);
  assert.equal((await request(`/api/writing/skills/${record.id}/approve`,{version:0,rules:'具体细节'})).status,200);
  assert.equal(knowledge(db,1).length,1);assert.equal(knowledge(db,2).length,0);
  assert.equal((await request(`/api/writing/skills/${record.id}/approve`,{version:0,rules:'旧版本'})).status,409);
  assert.equal((await request(`/api/writing/skills/${record.id}`,undefined,2,'DELETE')).status,404);
  assert.equal((await request(`/api/writing/skills/${record.id}`,undefined,1,'DELETE')).status,200);assert.equal(knowledge(db,1).length,0);
  db.exec("CREATE TABLE brand_analyses(id INTEGER PRIMARY KEY,brand_id INTEGER,report TEXT,review_count INTEGER,created_at TEXT);INSERT INTO brand_analyses VALUES(1,1,'旧品牌洞察',5,'2026-01-01')");
  assert.equal(knowledge(db,1)[0].kind,'legacy-comment-report');assert.equal(knowledge(db,2).length,0);
  const memory=(await request('/api/writing/brand-memory?brandId=1')).data;assert.equal(memory.reports.length,1);assert.equal(memory.profile.name,'甲');
});
