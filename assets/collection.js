(function(){
  const $=id=>document.getElementById(id),token=localStorage.getItem('brand_auth_token');
  if(!token){location.replace('/login.html');return;}
  let jobs=[],selected=null,timer;
  const states={queued:'等待执行',running:'采集中',paused:'已暂停',failed:'失败',partial:'部分资料缺失',completed:'已完成',empty:'无结果',pending:'待处理',ready:'已获取',incomplete:'不完整',not_requested:'未请求'};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const metric=n=>n===null||n===undefined?'未知':n;
  const notice=(text,error=false)=>{$('notice').textContent=text;$('notice').className=error?'review':'';};
  async function api(url,body){const r=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw new Error(d.error?.message||d.error||'请求失败');return d;}
  async function refresh(){jobs=await api('/api/collection/jobs');if(!selected&&jobs.length)selected=jobs[0].id;
    $('jobList').innerHTML=jobs.map(j=>`<button class="job-link ${j.id===selected?'active':''}" data-job="${j.id}">${esc(j.kind==='creator'?'达人账号':j.target)}<br><small>${states[j.status]} · ${j.notes.length}/${j.limit_count}</small></button>`).join('')||'<p class="muted">暂无任务</p>';render();clearTimeout(timer);if(jobs.some(j=>['running','queued'].includes(j.status)))timer=setTimeout(()=>refresh().catch(e=>notice(e.message,true)),4000);
  }
  function render(){const j=jobs.find(j=>j.id===selected);if(!j){$('detail').textContent='暂无结果';return;}
    const filter=$('filter').value.toLowerCase();const notes=j.notes.filter(n=>[n.title,n.author,n.body].join(' ').toLowerCase().includes(filter));
    $('detail').innerHTML=`<h2>${esc(j.target)}</h2><p>${states[j.status]} · ${j.notes.length}篇 · ${j.provider==='coze'?'Coze/飞书':'数据服务'}</p><p class="review">${esc(j.error)}</p><div class="actions"><button data-action="${['running','queued'].includes(j.status)?'pause':'resume'}">${['running','queued'].includes(j.status)?'暂停后续处理':'继续/重试'}</button><button data-action="export">导出笔记与评论JSON</button></div>`+notes.map(n=>`<article class="draft"><h3>${esc(n.title||'未提供标题')}</h3><div class="note-meta"><span>作者：${esc(n.author||'未知')}</span><span>点赞 ${metric(n.likes)}</span><span>收藏 ${metric(n.collects)}</span><span>评论数 ${metric(n.comments)}</span></div><p class="note-body">${esc(n.body||'正文尚未获取')}</p><p class="muted">来源 ${esc(n.source)} · 发布 ${esc(n.published_at||'未知')} · 采集 ${esc(n.fetched_at)}</p><p class="review">${esc(n.error)}</p><div class="actions"><a href="${esc(n.url)}" target="_blank" rel="noopener">原帖</a>${n.author_id&&/^[a-f0-9]{24}$/i.test(n.author_id)?`<a href="https://www.xiaohongshu.com/user/profile/${esc(n.author_id)}" target="_blank" rel="noopener">达人主页</a>`:''}<button data-comments="${esc(n.id)}">评论正文 · ${states[n.comment_status]}</button></div><p class="review">${esc(n.comment_error)}</p><div class="comments" id="comments-${esc(n.id)}" hidden></div></article>`).join('');
  }
  $('kind').onchange=()=>{$('targetLabel').firstChild.textContent=$('kind').value==='creator'?'达人主页或该达人笔记链接':'关键词';if($('kind').value==='creator')$('provider').value='api';};
  $('filter').oninput=render;
  $('jobList').onclick=e=>{const b=e.target.closest('[data-job]');if(b){selected=Number(b.dataset.job);render();}};
  $('refresh').onclick=()=>refresh().catch(e=>notice(e.message,true));
  $('collectForm').onsubmit=async e=>{e.preventDefault();$('submit').disabled=true;try{const j=await api('/api/collection/jobs',{kind:$('kind').value,target:$('target').value.trim(),provider:$('provider').value,limit:$('limit').value,comments:$('comments').value});selected=j.id;notice('采集任务已保存');await refresh();}catch(err){notice(err.message,true);}finally{$('submit').disabled=false;}};
  $('detail').onclick=async e=>{const b=e.target.closest('button');if(!b)return;b.disabled=true;try{
    if(b.dataset.comments){const box=$('comments-'+b.dataset.comments);const rows=await api(`/api/collection/jobs/${selected}/notes/${b.dataset.comments}/comments`);box.innerHTML=rows.map(c=>`<p><b>${esc(c.author||'未知作者')}</b> · 点赞 ${metric(c.likes)}${c.parent_id?' · 回复':''}<br>${esc(c.body)}</p>`).join('')||'<p class="muted">没有已获取的评论正文；不代表原帖没有评论。</p>';box.hidden=false;}
    else if(b.dataset.action==='export'){const r=await fetch(`/api/collection/jobs/${selected}/export`,{headers:{Authorization:'Bearer '+token}});if(!r.ok)throw new Error('导出失败');const url=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=url;a.download=`collection-${selected}.json`;a.click();URL.revokeObjectURL(url);}
    else if(b.dataset.action){await api(`/api/collection/jobs/${selected}/${b.dataset.action}`,{});await refresh();}
  }catch(err){notice(err.message,true);}finally{b.disabled=false;}};
  api('/api/collection/status').then(s=>{$('sourceStatus').textContent=`${s.source||'直接数据服务'}：${s.api?'已配置（待实际采集验证）':'未配置，请管理员填写数据服务API Key'}`;}).catch(e=>notice(e.message,true));
  refresh().catch(e=>notice(e.message,true));
  $('target').value=new URLSearchParams(location.search).get('keyword')||'';
})();
