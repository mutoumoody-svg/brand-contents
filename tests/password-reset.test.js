const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { setupReset } = require('../lib/password-reset');

test('邮箱恢复：限流、过期、错误尝试、单次使用及账号隔离', async t => {
  const db=new Database(':memory:');
  db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT,password TEXT,auth_version INTEGER DEFAULT 0,role TEXT)');
  db.prepare('INSERT INTO users VALUES(1,?,?,0,?)').run('person@example.test',await bcrypt.hash('original-password',4),'pending');
  db.prepare('INSERT INTO users VALUES(2,?,?,0,?)').run('other@example.test',await bcrypt.hash('other-password',4),'user');
  let now=10000000, enabled=true, mail=[];
  const app=express();app.use(express.json());
  setupReset(app,db,'test-only-hmac-secret',{clock:()=>now,configured:()=>enabled,sendCode:async(email,code)=>mail.push({email,code})});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await new Promise(r=>server.close(r));db.close();});
  const base=`http://127.0.0.1:${server.address().port}/api/auth/password-reset`;
  async function post(route,body){const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
  const email='person@example.test';
  enabled=false;assert.equal((await post('/request',{email})).status,503);enabled=true;
  const sent=await post('/request',{email:' Person@Example.Test '});assert.equal(sent.status,202);assert.equal(mail.length,1);
  const stored=db.prepare('SELECT * FROM password_reset_codes').get();assert.notEqual(stored.digest,mail[0].code);
  assert.equal((await post('/request',{email})).status,429);
  const absent=await post('/request',{email:'missing@example.test'});assert.equal(absent.status,sent.status);assert.equal(absent.data.message,sent.data.message);assert.equal(mail.length,1);
  const code=mail[0].code;
  assert.equal((await post('/confirm',{email:'other@example.test',code,password:'new-password'})).status,400);
  assert.equal((await post('/confirm',{email,code,password:'short'})).status,400);
  for(let i=0;i<5;i++)assert.equal((await post('/confirm',{email,code:code==='000000'?'111111':'000000',password:'new-password'})).status,400);
  assert.equal((await post('/confirm',{email,code,password:'new-password'})).status,400);
  now+=60001;await post('/request',{email});const fresh=mail.at(-1).code;
  now+=600001;assert.equal((await post('/confirm',{email,code:fresh,password:'new-password'})).status,400);
  await post('/request',{email});const finalCode=mail.at(-1).code;
  assert.equal((await post('/confirm',{email,code:finalCode,password:'new-password'})).status,200);
  assert.equal((await post('/confirm',{email,code:finalCode,password:'new-password'})).status,400);
  const user=db.prepare('SELECT * FROM users WHERE id=1').get();assert.equal(user.auth_version,1);assert.equal(user.role,'pending');assert.equal(await bcrypt.compare('new-password',user.password),true);
  assert.equal(db.prepare('SELECT auth_version FROM users WHERE id=2').get().auth_version,0);
});
