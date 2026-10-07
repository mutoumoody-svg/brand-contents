const source = require('./collection-source');

function count(value) {
  if(value===null || value===undefined || value==='')return null;
  const match=String(value).trim().replace(/,/g,'').match(/^(\d+(?:\.\d+)?)\s*(万|亿|[kKwWmM])?\+?$/);
  if(!match)return null;
  const unit=match[2]?.toLowerCase(), factor=unit==='万'||unit==='w'?1e4:unit==='亿'?1e8:unit==='k'?1e3:unit==='m'?1e6:1;
  return Math.min(1e12,Math.floor(Number(match[1])*factor));
}
function xhsUrl(value, creator=false) {
  try {
    const u=new URL(value);
    if(u.protocol!=='https:' || u.username || u.password || u.port || !['www.xiaohongshu.com','xiaohongshu.com','xhslink.com'].includes(u.hostname))return '';
    if(creator && !/^\/(?:user\/profile|explore|discovery\/item)\/[a-f0-9]{24}\/?$/i.test(u.pathname))return '';
    return u.href;
  }catch{return '';}
}
function normalize(note) {
  const url=xhsUrl(note.url || note.note_url || note.noteUrl || '');
  const id=String(note.id || note.note_id || note.noteId || url.match(/\/(?:explore|discovery\/item)\/([a-f0-9]{24})/i)?.[1] || '').trim();
  if(!/^[a-f0-9]{24}$/i.test(id))throw new Error('数据源缺少有效笔记ID，无法去重');
  const author=typeof note.author==='object' ? note.author?.nickname : note.author;
  return { id:id.toLowerCase(),url:url || `https://www.xiaohongshu.com/explore/${id}`,
    title:String(note.title || '').slice(0,1000),body:String(note.body ?? note.content ?? note.desc ?? '').slice(0,50000),
    author:String(author || '').slice(0,200),author_id:String(note.author_id || note.author?.userId || '').slice(0,100),
    likes:count(note.likes ?? note.likedCount),comments:count(note.comment_count ?? note.comments ?? note.commentCount),collects:count(note.collects ?? note.collectedCount),
    published_at:note.published_at ? String(note.published_at).slice(0,100) : null,
    cover:xhsUrl(note.cover || '') || '',
  };
}
function setup(app,db,auth,{ provider=source,coze=null }={}) {
  db.exec(`CREATE TABLE IF NOT EXISTS collection_jobs(
    id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,kind TEXT NOT NULL,target TEXT NOT NULL,provider TEXT NOT NULL,
    limit_count INTEGER NOT NULL,comment_limit INTEGER NOT NULL,status TEXT DEFAULT 'queued',error TEXT DEFAULT '',
    search_cursor TEXT DEFAULT '',search_done INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  ); CREATE TABLE IF NOT EXISTS collected_notes(
    id TEXT PRIMARY KEY,url TEXT NOT NULL,title TEXT,body TEXT,author TEXT,author_id TEXT,
    likes INTEGER,comments INTEGER,collects INTEGER,published_at TEXT,cover TEXT,
    source TEXT NOT NULL,fetched_at TEXT DEFAULT CURRENT_TIMESTAMP
  ); CREATE TABLE IF NOT EXISTS collection_items(
    job_id INTEGER NOT NULL,note_id TEXT NOT NULL,status TEXT DEFAULT 'pending',error TEXT DEFAULT '',
    comment_status TEXT DEFAULT 'not_requested',comment_error TEXT DEFAULT '',PRIMARY KEY(job_id,note_id)
  ); CREATE TABLE IF NOT EXISTS collected_comments(
    note_id TEXT NOT NULL,id TEXT NOT NULL,parent_id TEXT DEFAULT '',author TEXT,body TEXT NOT NULL,likes INTEGER,
    published_at TEXT,source TEXT NOT NULL,fetched_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(note_id,id)
  );`);
  const columns=db.prepare('PRAGMA table_info(collection_jobs)').all().map(c=>c.name);
  if(!columns.includes('search_cursor'))db.exec("ALTER TABLE collection_jobs ADD COLUMN search_cursor TEXT DEFAULT ''");
  if(!columns.includes('search_done'))db.exec('ALTER TABLE collection_jobs ADD COLUMN search_done INTEGER DEFAULT 0');
  db.prepare("UPDATE collection_jobs SET status='paused',error='服务重启，进度已保留' WHERE status IN ('queued','running')").run();
  let running=false;
  function owned(id,user) { return db.prepare('SELECT * FROM collection_jobs WHERE id=? AND user_id=?').get(id,user.id); }
  function data(job) {
    const notes=db.prepare('SELECT n.*,i.status,i.error,i.comment_status,i.comment_error FROM collection_items i JOIN collected_notes n ON n.id=i.note_id WHERE i.job_id=? ORDER BY n.likes DESC').all(job.id);
    return {...job,notes};
  }
  function saveNote(note,origin) {
    const n=normalize(note);
    db.prepare(`INSERT INTO collected_notes(id,url,title,body,author,author_id,likes,comments,collects,published_at,cover,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET url=excluded.url,title=COALESCE(NULLIF(excluded.title,''),title),body=COALESCE(NULLIF(excluded.body,''),body),
      author=COALESCE(NULLIF(excluded.author,''),author),author_id=COALESCE(NULLIF(excluded.author_id,''),author_id),likes=COALESCE(excluded.likes,likes),
      comments=COALESCE(excluded.comments,comments),collects=COALESCE(excluded.collects,collects),published_at=COALESCE(excluded.published_at,published_at),source=excluded.source,fetched_at=CURRENT_TIMESTAMP`)
      .run(n.id,n.url,n.title,n.body,n.author,n.author_id,n.likes,n.comments,n.collects,n.published_at,n.cover,origin);
    return n.id;
  }
  async function queue() {
    if(running)return;running=true;
    try {
      let job;
      while((job=db.prepare("SELECT * FROM collection_jobs WHERE status='queued' ORDER BY id LIMIT 1").get())){
        db.prepare("UPDATE collection_jobs SET status='running',error='' WHERE id=?").run(job.id);
        try {
          const origin=job.provider==='coze'?'coze-feishu':'data-api';
          let creatorUrl=job.target;
          if(job.kind==='creator' && /\/(?:explore|discovery\/item)\//.test(job.target)){
            const seed=await provider.detail({url:job.target});
            const creatorId=String(seed.author_id || seed.author?.userId || '');
            if(!/^[a-f0-9]{24}$/i.test(creatorId))throw new Error('笔记详情未返回有效作者ID，请提供达人主页链接');
            creatorUrl=`https://www.xiaohongshu.com/user/profile/${creatorId}`;
          }
          const seen=new Set(db.prepare('SELECT note_id FROM collection_items WHERE job_id=?').all(job.id).map(n=>n.note_id));let cursor=job.search_cursor||'',pages=0;
          if(!job.search_done) {
            do {
              const response=job.provider==='coze' ? await coze(job.target) : job.kind==='keyword'
                ? await provider.search({keyword:job.target,limit:job.limit_count,cursor})
                : await provider.creator({creator_url:creatorUrl,limit:job.limit_count,cursor});
              if(!Array.isArray(response.notes))throw new Error('数据源没有返回notes数组');
              for(const raw of response.notes){
                if(seen.size>=job.limit_count)break;
                if(job.kind==='creator'){
                  const expected=creatorUrl.match(/\/user\/profile\/([a-f0-9]{24})/i)?.[1]?.toLowerCase();
                  const actual=String(raw.author_id || raw.author?.userId || '').toLowerCase();
                  if(!actual || actual!==expected)throw new Error('数据源返回的笔记缺少作者ID或不属于指定达人');
                }
                const id=saveNote(raw,origin);seen.add(id);
                db.prepare('INSERT OR IGNORE INTO collection_items(job_id,note_id) VALUES(?,?)').run(job.id,id);
              }
              const next=String(response.next_cursor || '');const done=!next || next===cursor || seen.size>=job.limit_count;
              db.prepare('UPDATE collection_jobs SET search_cursor=?,search_done=? WHERE id=?').run(next,done?1:0,job.id);
              if(done)break;cursor=next;pages++;
            }while(cursor && pages<10 && seen.size<job.limit_count && db.prepare('SELECT status FROM collection_jobs WHERE id=?').get(job.id).status==='running');
          }
          const items=db.prepare("SELECT * FROM collection_items WHERE job_id=? AND (status<>'ready' OR comment_status='failed')").all(job.id);
          for(const item of items){
            if(db.prepare('SELECT status FROM collection_jobs WHERE id=?').get(job.id).status!=='running')break;
            const n=db.prepare('SELECT * FROM collected_notes WHERE id=?').get(item.note_id);
            try {
              if(!n.body && job.provider!=='coze')saveNote({...await provider.detail({note_id:n.id,url:n.url}),id:n.id},origin);
              const body=db.prepare('SELECT body FROM collected_notes WHERE id=?').get(n.id).body;
              db.prepare('UPDATE collection_items SET status=?,error=? WHERE job_id=? AND note_id=?').run(body?'ready':'incomplete',body?'':'来源未返回完整正文',job.id,n.id);
            }catch(err){db.prepare("UPDATE collection_items SET status='failed',error=? WHERE job_id=? AND note_id=?").run(err.message,job.id,n.id);}
            if(job.comment_limit){
              try{
                if(job.provider==='coze')throw new Error('现有Coze链路仅提供评论数，不提供评论正文');
                let commentCursor='',stored=0,commentPages=0;const commentIds=new Set();
                do {
                  const result=await provider.comments({note_id:n.id,url:n.url,limit:job.comment_limit,cursor:commentCursor});
                  if(!Array.isArray(result.comments))throw new Error('数据源没有返回comments数组');
                  for(const c of result.comments.slice(0,job.comment_limit-stored)){
                    if(!c.id || typeof c.body!=='string')throw new Error('评论缺少ID或正文');
                    if(commentIds.has(String(c.id)))continue;commentIds.add(String(c.id));
                    db.prepare(`INSERT INTO collected_comments(note_id,id,parent_id,author,body,likes,published_at,source) VALUES(?,?,?,?,?,?,?,?)
                      ON CONFLICT(note_id,id) DO UPDATE SET body=excluded.body,likes=excluded.likes,fetched_at=CURRENT_TIMESTAMP`)
                      .run(n.id,String(c.id).slice(0,100),String(c.parent_id||'').slice(0,100),String(c.author||'').slice(0,200),c.body.slice(0,10000),count(c.likes),String(c.published_at||'').slice(0,100),origin);stored++;
                  }
                  const next=String(result.next_cursor||'');if(next===commentCursor)break;commentCursor=next;commentPages++;
                }while(commentCursor && stored<job.comment_limit && commentPages<10);
                db.prepare("UPDATE collection_items SET comment_status='ready',comment_error='' WHERE job_id=? AND note_id=?").run(job.id,n.id);
              }catch(err){db.prepare("UPDATE collection_items SET comment_status='failed',comment_error=? WHERE job_id=? AND note_id=?").run(err.message,job.id,n.id);}
            }
          }
          if(db.prepare('SELECT status FROM collection_jobs WHERE id=?').get(job.id).status==='running') {
            const total=db.prepare('SELECT COUNT(*) n FROM collection_items WHERE job_id=?').get(job.id).n;
            const bad=db.prepare("SELECT COUNT(*) n FROM collection_items WHERE job_id=? AND (status<>'ready' OR comment_status='failed')").get(job.id).n;
            const more=!db.prepare('SELECT search_done FROM collection_jobs WHERE id=?').get(job.id).search_done;
            db.prepare('UPDATE collection_jobs SET status=?,error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(!total?'empty':bad||more?'partial':'completed',more?'本轮分页上限已达到，可以继续采集':!total?'数据源未返回相关笔记':'',job.id);
          }
        }catch(err){db.prepare("UPDATE collection_jobs SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(err.message,job.id);}
      }
    }finally{running=false;}
  }
  app.get('/api/collection/status',auth,(req,res)=>res.json({api:provider.configured(),coze:!!coze && !!(process.env.COZE_PAT&&process.env.COZE_WORKFLOW_ID&&process.env.XHS_COOKIE)}));
  app.get('/api/collection/jobs',auth,(req,res)=>res.json(db.prepare('SELECT * FROM collection_jobs WHERE user_id=? ORDER BY id DESC LIMIT 50').all(req.user.id).map(data)));
  app.post('/api/collection/jobs',auth,(req,res)=>{
    const r=req.body||{},kind=r.kind==='creator'?'creator':'keyword',target=String(r.target||'').trim(),name=r.provider==='coze'?'coze':'api';
    if(!target || target.length>1000 || (kind==='creator'&&!xhsUrl(target,true)))return res.status(400).json({error:'请输入关键词或完整小红书达人主页链接'});
    if(kind==='creator'&&name==='coze')return res.status(400).json({error:'旧Coze工作流不支持达人账号采集'});
    if(name==='api'&&!provider.configured())return res.status(503).json({error:'请先配置支持关键词、达人和评论的数据服务'});
    if(name==='coze'&&!coze)return res.status(503).json({error:'Coze未接入'});
    if(db.prepare("SELECT COUNT(*) n FROM collection_jobs WHERE user_id=? AND status IN ('running','queued')").get(req.user.id).n>=3)return res.status(429).json({error:'请等待已有任务完成'});
    const id=db.prepare('INSERT INTO collection_jobs(user_id,kind,target,provider,limit_count,comment_limit) VALUES(?,?,?,?,?,?)')
      .run(req.user.id,kind,target,name,Math.min(100,Math.max(1,Math.floor(Number(r.limit)||20))),Math.min(100,Math.max(0,Math.floor(Number(r.comments)||0)))).lastInsertRowid;
    res.status(202).json({id});setImmediate(()=>queue().catch(()=>{}));
  });
  app.post('/api/collection/jobs/:id/:action',auth,(req,res)=>{
    const job=owned(req.params.id,req.user);if(!job)return res.status(404).json({error:'任务不存在'});
    const action=req.params.action;if(!['resume','pause'].includes(action))return res.status(400).json({error:'无效操作'});
    if(action==='resume'&&running)return res.status(409).json({error:'有采集任务正在执行，请稍后重试'});
    db.prepare('UPDATE collection_jobs SET status=? WHERE id=?').run(action==='pause'?'paused':'queued',job.id);res.json({ok:true});
    if(action==='resume')setImmediate(()=>queue().catch(()=>{}));
  });
  app.get('/api/collection/jobs/:id/export',auth,(req,res)=>{
    const job=owned(req.params.id,req.user);if(!job)return res.status(404).json({error:'任务不存在'});
    const result=data(job);result.notes=result.notes.map(n=>({...n,comment_items:db.prepare('SELECT * FROM collected_comments WHERE note_id=? ORDER BY likes DESC').all(n.id)}));
    res.set('Content-Disposition',`attachment; filename="collection-${job.id}.json"`).json(result);
  });
  app.get('/api/collection/jobs/:id/notes/:note/comments',auth,(req,res)=>{
    if(!owned(req.params.id,req.user)||!db.prepare('SELECT note_id FROM collection_items WHERE job_id=? AND note_id=?').get(req.params.id,req.params.note))return res.status(404).json({error:'笔记不存在'});
    res.json(db.prepare('SELECT * FROM collected_comments WHERE note_id=? ORDER BY likes DESC LIMIT 100').all(req.params.note));
  });
}
module.exports={setup,count,normalize,xhsUrl};
