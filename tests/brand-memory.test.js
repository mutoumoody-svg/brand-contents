const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),{spawnSync}=require('node:child_process'),Database=require('better-sqlite3');
test('品牌知识导出不含账号，导入可预览、备份、去重并阻止覆盖冲突',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'brand-memory-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const schema=`CREATE TABLE brands(id INTEGER PRIMARY KEY,name TEXT,sample TEXT);CREATE TABLE brand_analyses(id INTEGER PRIMARY KEY,brand_id INTEGER,review_count INTEGER,report TEXT);CREATE TABLE xhs_writing_methods(id INTEGER PRIMARY KEY,title TEXT,structure TEXT,logic TEXT);CREATE TABLE brand_writing_knowledge(id INTEGER PRIMARY KEY,user_id INTEGER,brand_id INTEGER,kind TEXT,source TEXT,result TEXT,rules TEXT,approved INTEGER,version INTEGER);CREATE TABLE users(id INTEGER PRIMARY KEY,password TEXT);`;
  const src=path.join(dir,'src'),dest=path.join(dir,'dest');fs.mkdirSync(src);fs.mkdirSync(dest);
  let db=new Database(path.join(src,'users.db'));db.exec(schema);db.exec("INSERT INTO brands VALUES(10,'测试品牌','历史文案');INSERT INTO brand_analyses VALUES(5,10,12,'{\"insight\":\"旧洞察\"}');INSERT INTO xhs_writing_methods VALUES(3,'方法','结构','逻辑');INSERT INTO users VALUES(1,'private-password')");db.close();
  db=new Database(path.join(dest,'users.db'));db.exec(schema);db.close();
  const file=path.join(dir,'export.json'),script=path.resolve(__dirname,'../scripts/brand-memory.js');
  const run=(data,args)=>spawnSync(process.execPath,[script,...args],{env:{...process.env,DATA_DIR:data},encoding:'utf8'});
  assert.equal(run(src,['--export',file]).status,0);const text=fs.readFileSync(file,'utf8');assert.equal(text.includes('private-password'),false);
  assert.equal(run(dest,['--import',file]).status,0);db=new Database(path.join(dest,'users.db'));assert.equal(db.prepare('SELECT COUNT(*) n FROM brands').get().n,0);db.close();
  assert.equal(run(dest,['--import',file,'--apply']).status,0);assert.equal(run(dest,['--import',file,'--apply']).status,0);
  db=new Database(path.join(dest,'users.db'));assert.equal(db.prepare('SELECT COUNT(*) n FROM brands').get().n,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM brand_analyses').get().n,1);assert.equal(db.prepare('SELECT brand_id FROM brand_analyses').get().brand_id,db.prepare('SELECT id FROM brands').get().id);db.prepare('UPDATE brands SET sample=?').run('本地不同内容');db.close();assert.equal(run(dest,['--import',file,'--apply']).status,1);assert.ok(fs.readdirSync(dest).some(n=>n.includes('before-brand-import')));
});
