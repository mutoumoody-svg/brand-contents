const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Database = require('better-sqlite3');
const setup = require('../lib/workspace');
const { score, inspect } = require('../lib/quality');

test('文字检查发现重复且不把空文本当重复', () => {
  assert.equal(score('', ''), 0);
  assert.equal(score('通勤途中带一杯热咖啡', '通勤途中带一杯热咖啡'), 1);
  assert.equal(inspect('通勤途中带一杯热咖啡', [{ body:'通勤途中带一杯热咖啡',id:1 }]).review, true);
});
test('任务保存、权限隔离、失败单篇重试、编辑冲突和反馈', async t => {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE content(id INTEGER PRIMARY KEY,user_id INTEGER,user_name TEXT,type TEXT,brand_name TEXT,style TEXT,title TEXT,body TEXT,context TEXT);
    CREATE TABLE brands(id INTEGER PRIMARY KEY,name TEXT);
    CREATE TABLE xhs_writing_methods(id INTEGER PRIMARY KEY,title TEXT,category TEXT);
    INSERT INTO brands VALUES(1,'测试品牌'); INSERT INTO xhs_writing_methods VALUES(1,'场景写法','故事型');`);
  const app = express(); app.use(express.json());
  const auth = (req,res,next) => { req.user = {id:Number(req.headers['x-user'] || 1),name:'测试用户',role:'admin'};next(); };
  let failOnce = true, calls = 0;
  const prompts = [];
  setup(app, db, auth, auth, async prompt => {
    prompts.push(prompt);
    if(prompt.includes('模拟重写失败'))throw Error('模拟网络失败');
    calls++;
    if (prompt.includes('仅返回JSON数组')) return JSON.stringify(Array.from({length:3},(_,i)=>({angle:'角度'+i,structure:'结构'+i,voice:'语气'+i})));
    if (failOnce) { failOnce = false; throw new Error('模拟超时'); }
    return '测试标题'+calls+'\n事实来自输入，场景为'+calls+'，不虚构产品功效。';
  });
  const server = app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await new Promise(r=>server.close(r));db.close();});
  const url = `http://127.0.0.1:${server.address().port}`;
  async function request(path,body,user=1,method='POST') {
    const res = await fetch(url+path,{method,headers:{'Content-Type':'application/json','x-user':String(user)},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:res.status,data:await res.json()};
  }
  async function waitDone() {
    for (let i=0;i<100;i++) {
      const jobs=(await request('/api/writing/jobs',undefined,1,'GET')).data;
      if (!['queued','running'].includes(jobs[0].status)) return jobs[0];
      await new Promise(r=>setTimeout(r,10));
    }
    throw new Error('任务没有完成');
  }
  const created=await request('/api/writing/jobs',{topic:'杯子',brandId:1,methodIds:[1],count:3}); assert.equal(created.status,202);
  const presets=(await request('/api/writing/directions',undefined,1,'GET')).data;
  assert.equal(presets.length,9);
  assert.equal((await request('/api/writing/jobs',{topic:'测试',directionPreset:'unknown'})).status,400);
  assert.equal((await request('/api/writing/jobs',{topic:'测试',directionPreset:'custom'})).status,400);
  let job=await waitDone(); assert.equal(job.status,'partial'); assert.equal(job.drafts.filter(d=>d.status==='failed').length,1);
  assert.equal((await request('/api/writing/jobs',undefined,2,'GET')).data.length,0);
  assert.equal((await request(`/api/writing/jobs/${job.id}/resume`,{},2)).status,404);
  const failed=job.drafts.find(d=>d.status==='failed');
  assert.equal((await request(`/api/writing/drafts/${failed.id}/retry`,{})).status,200);
  job=await waitDone(); assert.equal(job.status,'completed'); assert.equal(job.drafts.filter(d=>d.body).length,3);
  const d=job.drafts[0];
  assert.equal((await request(`/api/writing/drafts/${d.id}`,{revision:d.revision,body:'修改后的真实文案',adopted:true,note_url:'https://www.xiaohongshu.com/explore/test',likes:12,feedback:'减少广告语气'},1,'PUT')).status,200);
  assert.equal((await request(`/api/writing/drafts/${d.id}`,{revision:d.revision,body:'旧修改'},1,'PUT')).status,409);
  assert.equal((await request(`/api/writing/drafts/${d.id}`,{revision:d.revision,body:'非法修改'},2,'PUT')).status,404);
  const first=await request(`/api/writing/drafts/${d.id}/save-content`,{});
  const second=await request(`/api/writing/drafts/${d.id}/save-content`,{});assert.equal(first.data.id,second.data.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM content').get().n,1);
  const feedback=(await request('/api/writing/method-feedback',undefined,1,'GET')).data[0];
  assert.equal(feedback.adopted,1);assert.equal(feedback.likes,12);assert.equal(feedback.published,1);
  const q=await request('/api/quality/check',{text:'修改后的真实文案',brand_name:'测试品牌'});assert.equal(q.data.highest,100);
  assert.equal((await request('/api/writing/jobs',{topic:'测试',mode:'invalid'})).status,400);
  assert.equal((await request('/api/writing/jobs',{topic:'测试',mode:'external'})).status,400);
  assert.equal((await request('/api/writing/jobs',{topic:'测试',mode:'brand',references:[{content:'样本'}]})).status,400);
  for (const mode of ['external','aspiration','brand']) {
    const createdMode = await request('/api/writing/jobs',{topic:'三路径验证',brandId:1,mode,directionPreset:mode==='aspiration'?'pain':undefined,currentState:'匆忙通勤',desiredState:'从容自主',perspectives:'独处、同行',references:mode === 'aspiration' ? [] : [{content:'已发布的参考样本文案'}]});
    assert.equal(createdMode.status,202);
    const modeJob = await waitDone();
    assert.equal(modeJob.input.mode,mode);
    if(mode==='aspiration')assert.ok(modeJob.input.perspectives.includes('具体麻烦'));
    assert.equal(modeJob.input.references.length,mode === 'aspiration' ? 0 : 1);
  }
  assert.ok(prompts.some(p => p.includes('痛点共鸣') && p.includes('从容自主')));
  assert.ok(prompts.some(p => p.includes('品牌优质内容复创')));
  assert.ok(prompts.some(p => p.includes('他牌爆文借鉴')));
  const rewriteDraft=job.drafts[1];
  assert.equal((await request(`/api/writing/drafts/${rewriteDraft.id}/rewrite`,{revision:rewriteDraft.revision,instructions:'换成旅行场景'},2)).status,404);
  assert.equal((await request(`/api/writing/drafts/${rewriteDraft.id}/rewrite`,{revision:999,instructions:'旅行'})).status,409);
  assert.equal((await request(`/api/writing/drafts/${rewriteDraft.id}/rewrite`,{revision:rewriteDraft.revision,instructions:'换成旅行场景'})).status,200);
  assert.ok(prompts.some(p=>p.includes('修改意见：换成旅行场景')));
  assert.equal(db.prepare('SELECT original_body FROM writing_drafts WHERE id=?').get(rewriteDraft.id).original_body,rewriteDraft.body);
  const beforeFailure=db.prepare('SELECT * FROM writing_drafts WHERE id=?').get(rewriteDraft.id);
  assert.equal((await request(`/api/writing/drafts/${rewriteDraft.id}/rewrite`,{revision:beforeFailure.revision,instructions:'模拟重写失败'})).status,502);
  const afterFailure=db.prepare('SELECT * FROM writing_drafts WHERE id=?').get(rewriteDraft.id);
  assert.equal(afterFailure.body,beforeFailure.body);assert.equal(afterFailure.status,'ready');
  db.prepare("UPDATE writing_jobs SET status='running' WHERE id=?").run(job.id);
  db.prepare("UPDATE writing_drafts SET status='running' WHERE id=?").run(d.id);
  const restarted = express(); setup(restarted,db,auth,auth,async()=> '不会调用');
  assert.equal(db.prepare('SELECT status FROM writing_jobs WHERE id=?').get(job.id).status,'paused');
  assert.equal(db.prepare('SELECT body FROM writing_drafts WHERE id=?').get(d.id).body,'修改后的真实文案');
});
