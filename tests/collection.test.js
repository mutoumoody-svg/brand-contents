const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const Database=require('better-sqlite3');
const {setup,count,xhsUrl}=require('../lib/collection');
test('互动数规范与链接校验',()=>{
  assert.equal(count('1.2万'),12000);assert.equal(count('2,345'),2345);assert.equal(count('1.5k'),1500);assert.equal(count(''),null);assert.equal(count('未知'),null);assert.equal(count(0),0);
  assert.equal(xhsUrl('https://example.com/user/profile/123'), '');assert.equal(xhsUrl('https://www.xiaohongshu.com@evil.example/explore/123'), '');
});
test('关键词/达人任务、评论采集、笔记去重及导出权限',async t=>{
  const app=express();app.use(express.json());const db=new Database(':memory:');
  const creatorId='1234567890abcdef12345678',noteId='abcdef1234567890abcdef12';
  const note={id:noteId,title:'真实标题',body:'真实正文',author:'达人',author_id:creatorId,likes:'1.2万',comment_count:3};
  const auth=(q,r,next)=>{q.user={id:Number(q.headers['x-user']||1)};next();};
  let searches=0;
  const provider={configured:()=>true,search:async()=>{searches++;return {notes:[note,note]};},creator:async p=>{assert.match(p.creator_url,new RegExp(creatorId));return {notes:[note]};},detail:async()=>note,comments:async()=>({comments:[{id:'c1',author:'读者',body:'真实评论',likes:4},{id:'c1',author:'读者',body:'真实评论',likes:4}]})};
  setup(app,db,auth,{provider});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));db.close();});
  const base=`http://127.0.0.1:${server.address().port}/api/collection`;
  const req=async(path,body,user=1)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-user':String(user)},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  async function completed(id){for(let i=0;i<100;i++){const job=(await req('/jobs')).data.find(j=>j.id===id);if(!['queued','running'].includes(job.status))return job;await new Promise(r=>setTimeout(r,10));}throw new Error('timeout');}
  const a=await req('/jobs',{kind:'keyword',target:'咖啡杯',limit:20,comments:20});assert.equal(a.status,202);
  const first=await completed(a.data.id);assert.equal(first.status,'completed');assert.equal(first.notes.length,1);assert.equal(first.notes[0].likes,12000);
  assert.equal((await req(`/jobs/${a.data.id}/notes/${noteId}/comments`)).data.length,1);
  const b=await req('/jobs',{kind:'creator',target:`https://www.xiaohongshu.com/explore/${noteId}`,comments:20});
  assert.equal((await completed(b.data.id)).status,'completed');assert.equal(db.prepare('SELECT COUNT(*) n FROM collected_notes').get().n,1);
  assert.equal((await req(`/jobs/${b.data.id}/export`,undefined,2)).status,404);
  assert.equal((await req(`/jobs/${b.data.id}/export`)).data.notes[0].comment_items[0].body,'真实评论');
  assert.equal((await req('/jobs',undefined,2)).data.length,0);
  assert.equal((await req('/jobs',{kind:'creator',target:`https://www.xiaohongshu.com/user/profile/${creatorId}`,provider:'coze'})).status,400);
  assert.equal(searches,1);
});
