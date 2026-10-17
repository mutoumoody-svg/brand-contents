const { inspect } = require('./quality');
const { modes, direction } = require('./creation-modes');
const directions = require('./writing-directions');

module.exports = function setupWorkspace(app, db, authenticate, admin, complete) {
  const skills = require('./writing-skills');
  skills.setup(app,db,authenticate,complete);
  db.exec(`
    CREATE TABLE IF NOT EXISTS writing_jobs (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, brand_name TEXT NOT NULL DEFAULT '',
      input TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', error TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS writing_drafts (
      id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      ordinal INTEGER NOT NULL, strategy TEXT NOT NULL, body TEXT DEFAULT '', original_body TEXT DEFAULT '',
      status TEXT DEFAULT 'pending', quality TEXT DEFAULT '{}', error TEXT DEFAULT '',
      adopted INTEGER DEFAULT 0, note_url TEXT DEFAULT '', feedback TEXT DEFAULT '',
      likes INTEGER DEFAULT 0, comments INTEGER DEFAULT 0, collects INTEGER DEFAULT 0,
      revision INTEGER DEFAULT 0, content_id INTEGER, updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(job_id, ordinal)
    );
    CREATE INDEX IF NOT EXISTS writing_jobs_user ON writing_jobs(user_id, id);
    CREATE TABLE IF NOT EXISTS generation_history (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, brand_name TEXT DEFAULT '',
      body TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.prepare("UPDATE writing_jobs SET status='paused', error='服务重启，已保存进度，可继续生成' WHERE status IN ('running','queued')").run();
  db.prepare("UPDATE writing_drafts SET status='pending' WHERE status='running'").run();
  db.prepare("UPDATE writing_drafts SET status='ready' WHERE status='rewriting'").run();
  let working = false;
  app.get('/api/writing/directions', authenticate, (req,res) => res.json(directions));
  const ownedJob = (id, user) => db.prepare('SELECT * FROM writing_jobs WHERE id=? AND user_id=?').get(id, user.id);
  const ownedDraft = (id, user) => db.prepare('SELECT * FROM writing_drafts WHERE id=? AND user_id=?').get(id, user.id);
  function history(brand, exclude) {
    const content = db.prepare('SELECT id,title,body FROM content WHERE brand_name=? ORDER BY id DESC LIMIT 150').all(brand);
    const drafts = db.prepare(`SELECT d.id,d.body FROM writing_drafts d JOIN writing_jobs j ON j.id=d.job_id
      WHERE j.brand_name=? AND d.body<>'' AND d.id<>? ORDER BY d.id DESC LIMIT 150`).all(brand, exclude || 0);
    const generated = db.prepare('SELECT id,body FROM generation_history WHERE brand_name=? ORDER BY id DESC LIMIT 100').all(brand);
    return [...content.map(c => ({ ...c, source: 'content' })), ...drafts.map(c => ({ ...c, source: 'draft' })), ...generated.map(c => ({ ...c, source: 'generation' }))];
  }
  function jobData(row) {
    return { ...row, input: JSON.parse(row.input), drafts: db.prepare('SELECT * FROM writing_drafts WHERE job_id=? ORDER BY ordinal').all(row.id)
      .map(d => ({ ...d, strategy: JSON.parse(d.strategy), quality: JSON.parse(d.quality) })) };
  }
  const assess = (body,candidates,input) => input.semanticCheck ? require('./creative-review').review(body,candidates,complete) : Promise.resolve(inspect(body,candidates));
  const produce=(prompt,input)=>input.semanticCheck?require('./note-output').generate(prompt,complete,input.wordCount||200):complete(prompt);
  async function processQueue() {
    if (working) return;
    working = true;
    try {
      let job;
      while ((job = db.prepare("SELECT * FROM writing_jobs WHERE status='queued' ORDER BY id LIMIT 1").get())) {
        db.prepare("UPDATE writing_jobs SET status='running', error='', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(job.id);
        const input = JSON.parse(job.input);
        if (!input.planned) {
          try {
            const prior = db.prepare('SELECT strategy FROM writing_drafts d JOIN writing_jobs j ON j.id=d.job_id WHERE j.brand_name=? AND j.id<>? ORDER BY d.id DESC LIMIT 20').all(job.brand_name, job.id);
            const planResult = await require('./strategy-plan').plan(`${direction(input)}\n参考样本：${JSON.stringify(input.references || [])}\n为主题“${input.topic}”规划${input.count}篇小红书原创笔记。目标：${input.goal}；人群：${input.audience}；差异化：${input.diversity}；已用策略（避开）：${JSON.stringify(prior)}。每篇给出不同场景、观点、结构和语气。不写正文。仅返回JSON数组，每项有angle、structure、voice三个非空字符串。`, input.count, complete);
            const planned=planResult.strategies;
            db.transaction(() => {
              planned.forEach((s,i) => db.prepare('UPDATE writing_drafts SET strategy=? WHERE job_id=? AND ordinal=? AND body=\'\'').run(JSON.stringify(s), job.id, i+1));
              input.planned = true;
              input.planning = {status:'ai',repaired:planResult.repaired};
              db.prepare('UPDATE writing_jobs SET input=? WHERE id=?').run(JSON.stringify(input), job.id);
            })();
          } catch(err) {
            input.planned=true;
            input.planning={status:'fallback'};
            db.prepare('UPDATE writing_jobs SET error=?,input=? WHERE id=?').run('AI策略规划暂未通过校验，已采用预设差异化角度继续生成；相似度检查仍会执行。',JSON.stringify(input),job.id);
          }
        }
        const drafts = db.prepare("SELECT * FROM writing_drafts WHERE job_id=? AND status='pending' ORDER BY ordinal").all(job.id);
        for (const draft of drafts) {
          if (db.prepare('SELECT status FROM writing_jobs WHERE id=?').get(job.id).status !== 'running') break;
          db.prepare("UPDATE writing_drafts SET status='running',error='' WHERE id=?").run(draft.id);
          try {
            const candidates = history(job.brand_name, draft.id);
            const reference = (input.references || []).map((r, i) => ({ id: i, title: r.title, body: r.content || r.body || '', source: 'reference' }));
            const strategy = JSON.parse(draft.strategy);
            const methods = db.prepare('SELECT * FROM xhs_writing_methods').all().filter(m => input.methodIds.includes(m.id));
            const brand = input.brandId ? db.prepare('SELECT * FROM brands WHERE id=?').get(input.brandId) : null;
            const feedback = db.prepare(`SELECT d.feedback,d.adopted FROM writing_drafts d JOIN writing_jobs j ON j.id=d.job_id WHERE j.brand_name=? AND d.feedback<>'' ORDER BY d.id DESC LIMIT 12`).all(job.brand_name);
            const recent = candidates.filter(c => c.source === 'draft').slice(0, 8).concat(candidates.filter(c => c.source === 'content').slice(0, 4)).map(c => c.body.slice(0, 280)).join('\n---\n');
            const prompt = `你是品牌内容策划，写一篇可发布的小红书原创笔记。\n主题：${input.topic}\n目标：${input.goal}\n人群：${input.audience}\n必须强调：${input.must}\n差异化：${input.diversity}\n本篇策略：${JSON.stringify(strategy)}\n品牌事实：${JSON.stringify(brand || {})}\n方法：${JSON.stringify(methods)}\n历史表达（避开开头、叙事顺序及场景）：${recent}\n只学习参考的传播逻辑，禁止仿写：${JSON.stringify(reference.map(r => r.body.slice(0, 500)))}\n改变叙事视角、句长节奏、证据顺序和收尾动作。不要虚构价格、认证、功效或亲身体验。没有依据的信息省略。只输出标题、正文、话题标签，不输出创作说明。`;
            const feedbackPrompt = `${direction(input)}\n${prompt}\n正文目标约${input.wordCount || 200}字（标题和标签另计）。\n已确认的本品牌写作知识（只是表达与需求线索，不作产品事实；保留语气但不要复刻句式）：${JSON.stringify(skills.knowledge(db,input.brandId))}\n本次结构参考（只学习结构）：${input.structureRules || ''}\n历史人工反馈（用于改进写法，不作产品事实）：${JSON.stringify(feedback)}`;
            let body = await produce(feedbackPrompt,input);
            let quality = await assess(body, [...candidates, ...reference], input);
            if (quality.review) {
              body = await produce(`${feedbackPrompt}\n上一版文字重合度${quality.highest}%，审校意见：${JSON.stringify(quality.semantic || {})}。请换开头、核心观点和段落推进、另选场景细节，重新写：\n${body}`,input);
              quality = { ...await assess(body, [...candidates, ...reference], input), rewritten: true };
            }
            db.prepare("UPDATE writing_drafts SET body=?,original_body=?,quality=?,status='ready',revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?")
              .run(body, body, JSON.stringify(quality), draft.id);
          } catch (err) {
            db.prepare("UPDATE writing_drafts SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(err.message, draft.id);
          }
        }
        const current = db.prepare('SELECT status FROM writing_jobs WHERE id=?').get(job.id);
        if (current.status === 'running') {
          const failed = db.prepare("SELECT COUNT(*) n FROM writing_drafts WHERE job_id=? AND status='failed'").get(job.id).n;
          db.prepare('UPDATE writing_jobs SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(failed ? 'partial' : 'completed', job.id);
        }
      }
    } finally { working = false; }
  }
  app.get('/api/writing/jobs', authenticate, (req, res) => {
    res.json(db.prepare('SELECT * FROM writing_jobs WHERE user_id=? ORDER BY id DESC LIMIT 50').all(req.user.id).map(jobData));
  });
  app.post('/api/writing/jobs', authenticate, (req, res) => {
    const raw = req.body || {};
    const preset = raw.directionPreset ? directions.find(d=>d.id===raw.directionPreset) : null;
    if (raw.directionPreset && !preset) return res.status(400).json({error:'请选择有效的创作方向'});
    if (preset?.id === 'custom' && !String(raw.perspectives || '').trim()) return res.status(400).json({error:'请填写自定义创作方向'});
    if (raw.mode && !modes[raw.mode]) return res.status(400).json({ error: '创作模式无效' });
    if (['external','brand'].includes(raw.mode) && !(Array.isArray(raw.references) && raw.references.some(r => r && String(r.content || '').trim()))) return res.status(400).json({ error: '请选择或粘贴参考文案' });
    if (raw.mode === 'brand' && !Number(raw.brandId)) return res.status(400).json({ error: '品牌复创请先选择品牌' });
    if (!String(raw.topic || '').trim()) return res.status(400).json({ error: '请填写主题' });
    if (db.prepare("SELECT COUNT(*) n FROM writing_jobs WHERE user_id=? AND status IN ('running','queued')").get(req.user.id).n >= 3)
      return res.status(429).json({ error: '已有3个任务，请等待完成' });
    const input = {
      mode: raw.mode || 'legacy',
      wordCount: Math.min(1500,Math.max(50,Math.floor(Number(raw.wordCount)||200))),
      structureRules: String(raw.structureRules||'').slice(0,6000),
      directionPreset: preset?.id || null,
      directionTitle: preset?.title || '',
      semanticCheck: raw.semanticCheck === true,
      currentState: String(raw.currentState || '').slice(0, 2000),
      desiredState: String(raw.desiredState || '').slice(0, 2000),
      perspectives: [preset?.instruction, String(raw.perspectives || '').slice(0, 2000)].filter(Boolean).join('\n补充要求：'),
      sampleContext: String(raw.sampleContext || '').slice(0, 2000),
      topic: String(raw.topic).slice(0, 2000), goal: String(raw.goal || '种草转化').slice(0, 200),
      audience: String(raw.audience || '').slice(0, 1000), must: String(raw.must || '').slice(0, 4000),
      diversity: String(raw.diversity || '明显').slice(0, 100), brandId: Number(raw.brandId) || null,
      count: Math.min(10, Math.max(3, Math.floor(Number(raw.count) || 3))),
      methodIds: (Array.isArray(raw.methodIds) ? raw.methodIds : []).map(Number).filter(Number.isInteger).slice(0, 10),
      references: (Array.isArray(raw.references) ? raw.references : []).slice(0, 8).filter(r => r && typeof r === 'object').map(r => ({ title: String(r.title || '').slice(0, 200), content: String(r.content || '').slice(0, 6000) })),
    };
    if (!input.methodIds.length && input.mode === 'legacy') input.methodIds = db.prepare('SELECT id FROM xhs_writing_methods ORDER BY id DESC LIMIT 4').all().map(m => m.id);
    if (!input.references.length && input.mode === 'legacy') {
      const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='viral_posts'").get();
      if (table) input.references = db.prepare('SELECT title,content FROM viral_posts ORDER BY id DESC LIMIT 3').all().map(r => ({ title:r.title,content:String(r.content || '').slice(0,1200) }));
    }
    const brand = input.brandId ? db.prepare('SELECT name FROM brands WHERE id=?').get(input.brandId) : null;
    if (input.mode === 'brand' && !brand) return res.status(400).json({ error: '所选品牌不存在' });
    const angles = ['真实使用场景', '购买前疑问', '反常识观点', '选购对比', '维护与使用技巧', '生活故事', '送礼决策', '长期价值', '常见误区', '用户清单'];
    const structures = ['场景→矛盾→细节→建议', '问题→分析→证据→选择', '观点→反例→解释→讨论', '标准→对比→判断→总结', '清单→步骤→注意事项→收藏'];
    const id = db.transaction(() => {
      const id = db.prepare('INSERT INTO writing_jobs(user_id,brand_name,input) VALUES(?,?,?)').run(req.user.id, brand?.name || '', JSON.stringify(input)).lastInsertRowid;
      for (let i = 0; i < input.count; i++) db.prepare('INSERT INTO writing_drafts(job_id,user_id,ordinal,strategy) VALUES(?,?,?,?)')
        .run(id, req.user.id, i + 1, JSON.stringify({ angle: angles[i], structure: structures[i % structures.length], voice: ['克制客观','轻松口语','简洁直接','细节叙事'][i % 4] }));
      return id;
    })();
    res.status(202).json(jobData(ownedJob(id, req.user)));
    setImmediate(() => processQueue().catch(err => console.error('Writing queue:', err.message)));
  });
  app.post('/api/writing/jobs/:id/resume', authenticate, (req, res) => {
    const job = ownedJob(req.params.id, req.user);
    if (!job) return res.status(404).json({ error: '任务不存在' });
    if (['running','queued'].includes(job.status)) return res.status(409).json({ error: '任务正在执行' });
    if (db.prepare("SELECT id FROM writing_drafts WHERE job_id=? AND status='running'").get(job.id)) return res.status(409).json({ error: '当前篇仍在完成，请稍后继续' });
    db.prepare("UPDATE writing_drafts SET status='pending' WHERE job_id=? AND status='failed'").run(job.id);
    db.prepare("UPDATE writing_jobs SET status='queued',error='' WHERE id=?").run(job.id);
    res.json({ ok: true });
    setImmediate(() => processQueue().catch(err => console.error('Writing queue:', err.message)));
  });
  app.post('/api/writing/jobs/:id/pause', authenticate, (req, res) => {
    const job = ownedJob(req.params.id, req.user);
    if (!job) return res.status(404).json({ error: '任务不存在' });
    db.prepare("UPDATE writing_jobs SET status='paused' WHERE id=?").run(job.id);
    res.json({ ok: true });
  });
  app.put('/api/writing/drafts/:id', authenticate, async (req, res) => {
    const draft = ownedDraft(req.params.id, req.user);
    if (!draft) return res.status(404).json({ error: '文案不存在' });
    if (['running','rewriting'].includes(draft.status)) return res.status(409).json({ error: '生成或重写中，请稍后编辑' });
    const raw = req.body || {};
    if (Number(raw.revision) !== draft.revision) return res.status(409).json({ error: '文案已更新，请刷新后重新编辑' });
    const body = String(raw.body ?? draft.body).slice(0, 30000);
    const url = String(raw.note_url || '').slice(0, 1000);
    if (url && !/^https:\/\//i.test(url)) return res.status(400).json({ error: '发布链接须为 HTTPS 链接' });
    const job = ownedJob(draft.job_id, req.user);
    const input = JSON.parse(job.input);
    const refs = (input.references || []).map((r,i)=>({id:i,body:r.content || '',source:'reference'}));
    const quality = await assess(body, [...history(job.brand_name, draft.id).filter(c => !(c.source === 'content' && c.id === draft.content_id)), ...refs], input);
    if (ownedDraft(draft.id,req.user).revision !== draft.revision) return res.status(409).json({error:'文案已更新，请刷新后重试'});
    const metric = value => Math.max(0, Math.min(1e9, Math.floor(Number(value) || 0)));
    db.transaction(() => {
      db.prepare(`UPDATE writing_drafts SET body=?,quality=?,adopted=?,note_url=?,feedback=?,likes=?,comments=?,collects=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(body, JSON.stringify(quality), raw.adopted ? 1 : 0, url, String(raw.feedback || '').slice(0, 4000), metric(raw.likes), metric(raw.comments), metric(raw.collects), draft.id);
      if (draft.content_id) db.prepare('UPDATE content SET body=? WHERE id=? AND user_id=?').run(body, draft.content_id, req.user.id);
    })();
    res.json({ ok: true, quality, revision: draft.revision + 1 });
  });
  app.post('/api/writing/drafts/:id/rewrite', authenticate, async(req,res)=>{
    const d=ownedDraft(req.params.id,req.user),instructions=String(req.body?.instructions||'').trim().slice(0,2000);
    if(!d)return res.status(404).json({error:'文案不存在'});
    if(!instructions)return res.status(400).json({error:'请填写本篇修改意见'});
    if(d.status!=='ready'||Number(req.body.revision)!==d.revision)return res.status(409).json({error:'文案正在更新，请刷新后重试'});
    const lock=db.prepare("UPDATE writing_drafts SET status='rewriting' WHERE id=? AND revision=? AND status='ready'").run(d.id,d.revision);
    if(!lock.changes)return res.status(409).json({error:'文案正在更新'});
    try{
      const job=ownedJob(d.job_id,req.user),input=JSON.parse(job.input);
      const brand=input.brandId?db.prepare('SELECT * FROM brands WHERE id=?').get(input.brandId):{};
      const refs=(input.references||[]).map((r,i)=>({id:i,body:r.content||'',source:'reference'}));
      const candidates=[...history(job.brand_name,d.id).filter(c=>!(c.source==='content'&&c.id===d.content_id)),...refs];
      const prompt=`定向重写一篇小红书笔记。只输出标题、正文与标签。正文约${input.wordCount||200}字。修改意见不得用于编造事实。\n${direction(input)}\n品牌事实：${JSON.stringify(brand)}\n补充事实：${input.must||''}\n品牌已确认表达规则（不是产品事实）：${JSON.stringify(skills.knowledge(db,input.brandId))}\n原文：${d.body}\n修改意见：${instructions}\n不要沿用参考或历史文案的句式和场景：${JSON.stringify(candidates.slice(0,12).map(c=>c.body.slice(0,600)))}`;
      let body=await produce(prompt,input),quality=await assess(body,candidates,{...input,semanticCheck:true});
      if(quality.review){body=await produce(`${prompt}\n上版需复核：${JSON.stringify(quality)}\n请改变观点和叙事推进后重写：${body}`,input);quality={...await assess(body,candidates,{semanticCheck:true}),rewritten:true};}
      db.transaction(()=>{
        const result=db.prepare("UPDATE writing_drafts SET body=?,quality=?,status='ready',revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=? AND status='rewriting'").run(body,JSON.stringify(quality),d.id,d.revision);
        if(!result.changes)throw Error('文案版本已变化');
        if(d.content_id)db.prepare('UPDATE content SET body=? WHERE id=? AND user_id=?').run(body,d.content_id,req.user.id);
      })();
      res.json({body,quality,revision:d.revision+1});
    }catch(e){res.status(502).json({error:e.message});}
    finally{db.prepare("UPDATE writing_drafts SET status='ready' WHERE id=? AND status='rewriting'").run(d.id);}
  });
  app.post('/api/writing/drafts/:id/retry', authenticate, (req, res) => {
    const draft = ownedDraft(req.params.id, req.user);
    if (!draft || draft.status !== 'failed') return res.status(400).json({ error: '仅失败篇可重试' });
    const job = ownedJob(draft.job_id, req.user);
    if (['running','queued'].includes(job.status) || db.prepare("SELECT id FROM writing_drafts WHERE job_id=? AND status='running'").get(job.id)) return res.status(409).json({ error: '任务正在执行' });
    db.prepare("UPDATE writing_drafts SET status='pending',error='' WHERE id=?").run(draft.id);
    db.prepare("UPDATE writing_jobs SET status='queued' WHERE id=?").run(job.id);
    res.json({ ok:true });
    setImmediate(() => processQueue().catch(err => console.error('Writing queue:', err.message)));
  });
  app.post('/api/writing/drafts/:id/save-content', authenticate, (req, res) => {
    const d = ownedDraft(req.params.id, req.user);
    if (!d || !d.body) return res.status(400).json({ error: '暂无文案可保存' });
    const job = ownedJob(d.job_id, req.user), input = JSON.parse(job.input);
    const id = db.transaction(() => {
      if (d.content_id) return d.content_id;
      const id = db.prepare('INSERT INTO content(user_id,user_name,type,brand_name,style,title,body,context) VALUES(?,?,?,?,?,?,?,?)')
        .run(req.user.id, req.user.name, 'xhs-writing', job.brand_name, JSON.parse(d.strategy).angle, input.topic, d.body, JSON.stringify({ jobId: job.id, methodIds: input.methodIds })).lastInsertRowid;
      db.prepare('UPDATE writing_drafts SET content_id=? WHERE id=?').run(id, d.id);
      return id;
    })();
    res.json({ id });
  });
  app.post('/api/quality/check', authenticate, (req, res) => {
    const { text, brand_name, references } = req.body || {};
    if (!String(text || '').trim()) return res.status(400).json({ error: '请粘贴待检查文案' });
    const brand = String(brand_name || '');
    const refs = (Array.isArray(references) ? references : []).slice(0, 10).map((body, id) => ({ id, body: String(body).slice(0, 30000), source: 'reference' }));
    const candidates = history(brand);
    res.json({ ...inspect(String(text).slice(0, 30000), [...candidates, ...refs]), compared: candidates.length + refs.length });
  });
  app.get('/api/writing/method-feedback', authenticate, (req, res) => {
    const rows = db.prepare(`SELECT j.input,d.adopted,d.likes,d.comments,d.collects,d.note_url,d.feedback FROM writing_drafts d JOIN writing_jobs j ON j.id=d.job_id WHERE d.user_id=? AND d.body<>''`).all(req.user.id);
    const methods = db.prepare('SELECT id,title,category FROM xhs_writing_methods').all().map(m => ({ ...m, generated: 0, adopted: 0, published: 0, likes: 0, comments: 0, collects: 0, feedback: [] }));
    for (const row of rows) for (const id of JSON.parse(row.input).methodIds) {
      const m = methods.find(m => m.id === id); if (!m) continue;
      m.generated++; m.adopted += row.adopted; m.published += row.note_url ? 1 : 0;
      m.likes += row.likes; m.comments += row.comments; m.collects += row.collects;
      if (row.feedback) m.feedback.push(row.feedback);
    }
    res.json(methods);
  });
  app.get('/api/system/status', authenticate, admin, (req, res) => {
    const { configuration } = require('./claude-client');
    let ai;
    try { const c = configuration(); ai = { host: c.host, configured: !!c.credential, direct: c.direct }; } catch { ai = { configured: false, error: '代理地址格式错误' }; }
    res.json({ ai, database: !!db.prepare('SELECT 1').get(), node: process.version, jobs: db.prepare('SELECT status,COUNT(*) count FROM writing_jobs GROUP BY status').all(),
      feishu: !!(process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET), publishing: { automatic: false, mode: 'manual-export' } });
  });
};
