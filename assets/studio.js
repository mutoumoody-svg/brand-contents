(async function(){
  'use strict';
  const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let token=localStorage.getItem('brand_auth_token'), tab='batch', jobs=[], selected=null, timer, report=null, dirty=false;
  const dirtyDrafts=new Set();
  window.studioCanRewrite=()=>!dirty;
  window.addEventListener('studio-rewritten',()=>refresh().catch(e=>notice(e.message,true)));
  const states={queued:'等待生成',running:'生成中',paused:'已暂停',partial:'部分失败',completed:'已完成',pending:'待生成',ready:'已生成',failed:'失败'};
  const notice=(s,error=false)=>{$('message').textContent=s;$('message').className=error?'error':'';};
  let directionOptions=[];
  const directionInput=$('direction');
  directionInput.previousSibling.textContent='补充要求（选填）';
  directionInput.placeholder='可补充具体场景、情绪或表达要求';
  function updateDirection() {
    const preset=directionOptions.find(d=>d.id===$('directionPreset').value);
    $('directionBrief').textContent=preset?.brief || '';
    directionInput.required=tab==='batch' && preset?.id==='custom';
    directionInput.previousSibling.textContent=preset?.id==='custom'?'自定义方向（必填）':'补充要求（选填）';
  }
  $('directionPreset').onchange=updateDirection;
  try{const r=await fetch('/api/local-preview/session',{method:'POST',headers:{'X-Local-Preview':'1'}});if(r.ok){token=(await r.json()).token;localStorage.setItem('brand_auth_token',token);}}catch{}
  if(!token){location.replace('/login.html');return;}
  async function api(path,body,method){
    if(path==='/api/writing/jobs' && body)Object.assign(body,window.studioSkills?.requestFields()||{});
    if(path==='/api/writing/jobs' && body && tab==='batch') body.directionPreset=$('directionPreset').value;
    const r=await fetch(path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined});
    if(r.status===401){['brand_auth_token','brand_user_name','brand_user_role'].forEach(k=>localStorage.removeItem(k));token=null;dirty=false;location.replace('/login.html');throw Error('登录已失效，请重新登录');}
    const d=await r.json();if(!r.ok){throw Error(d.error?.message||d.error||'请求失败');}return d;
  }
  function switchTab(next){tab=next;document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===tab)));$('screenTitle').textContent={batch:'批量创作',imitate:'爆文仿写',research:'爆文研究'}[tab];$('creation').hidden=tab==='research';$('research').hidden=tab!=='research';$('directionLabel').hidden=tab==='imitate';$('referenceLabel').hidden=tab!=='imitate';$('source').required=tab==='imitate';$('createButton').textContent=tab==='imitate'?'开始仿写':'开始批量创作';if(tab==='research')loadResearch().catch(e=>notice(e.message,true));}
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
  document.querySelector('nav').addEventListener('click',()=>{
    $('presetField').hidden=tab!=='batch';
    $('directionPreset').required=tab==='batch';updateDirection();
  });
  function qHtml(q){return `<p class="${q.review?'warning':'muted'}">${q.review?'建议复核':'未发现高相似'} · 文字重合 ${q.highest||0}%${q.rewritten?' · 已重写一次':''}</p><details><summary>查看检查依据</summary><div class="check-detail">${esc(q.semantic?({passed:'创意审校未发现高相似',review:'创意存在趋同',unavailable:'创意审校未完成','no-samples':'暂无可比较样本'}[q.semantic.status]||'待复核'):'仅有文字检查，创意未审校')}\n${esc((q.semantic?.reasons||[]).join('\n'))}\n${esc((q.matches||[]).map(m=>`${m.source} ${m.title||m.id}：${m.score}%`).join('\n'))}\n${esc(q.limitation||'')}</div></details>`;}
  function render(){const j=jobs.find(j=>j.id===selected);if(!j)return;$('results').innerHTML=`<div class="section-head"><h2>${esc(j.input.topic)}</h2><small>${states[j.status]}</small></div><p class="warning">${esc(j.error)}</p><div class="actions">${j.status!=='completed'?`<button data-job-action="${['running','queued'].includes(j.status)?'pause':'resume'}">${['running','queued'].includes(j.status)?'暂停后续生成':'继续 / 重试失败篇'}</button>`:''}</div>`+j.drafts.map(d=>`<article class="draft" data-id="${d.id}"><div class="section-head"><h3>第${d.ordinal}篇 · ${esc(d.strategy.angle)}</h3><small>${states[d.status]}</small></div><p class="warning">${esc(d.error)}</p>${d.body?`${qHtml(d.quality)}<textarea aria-label="第${d.ordinal}篇文案" data-body>${esc(d.body)}</textarea><div class="actions"><button data-action="save">保存并重新检查</button><button data-action="copy">复制</button><button data-action="content">存入内容库</button></div><details><summary>发布反馈</summary><label>效果记录<textarea data-feedback>${esc(d.feedback)}</textarea></label><label>发布链接<input data-url value="${esc(d.note_url)}"></label><label class="check"><input type="checkbox" data-adopted ${d.adopted?'checked':''}>已采用</label></details>`:d.status==='failed'?'<button data-action="retry">重试此篇</button>':''}</article>`).join('');}
  async function refresh(){const data=await api('/api/writing/jobs');if(!dirty)jobs=data;if(!selected&&jobs.length)selected=jobs[0].id;$('jobs').innerHTML=jobs.map(j=>`<button class="job-link ${selected===j.id?'active':''}" data-job="${j.id}">${esc(j.input.topic)}<small>${states[j.status]} · ${j.drafts.filter(d=>d.body).length}/${j.drafts.length}</small></button>`).join('')||'<p class="muted">暂无任务</p>';if(!dirty)render();clearTimeout(timer);if(data.some(j=>['running','queued'].includes(j.status)))timer=setTimeout(()=>refresh().catch(e=>notice(e.message,true)),4000);}
  $('refresh').onclick=()=>refresh().catch(e=>notice(e.message,true));
  $('jobs').onclick=e=>{const b=e.target.closest('[data-job]');if(!b)return;if(dirty&&!confirm('有未保存的文案，确认切换？'))return;dirty=false;dirtyDrafts.clear();selected=Number(b.dataset.job);refresh().catch(e=>notice(e.message,true));};
  $('results').oninput=e=>{const id=e.target.closest('[data-id]')?.dataset.id;if(id)dirtyDrafts.add(Number(id));dirty=true;};
  $('createForm').onsubmit=async e=>{e.preventDefault();const b=$('createButton');b.disabled=true;try{if(dirty&&!confirm('有未保存的修改，继续创建？'))return;const j=await api('/api/writing/jobs',{mode:tab==='imitate'?'external':'aspiration',semanticCheck:true,brandId:$('brand').value,topic:$('topic').value,count:$('count').value,perspectives:$('direction').value,must:$('facts').value,audience:$('audience').value,goal:$('goal').value,methodIds:$('method').value?[Number($('method').value)]:[],references:tab==='imitate'?[{title:'参考爆文',content:$('source').value}]:[]});selected=j.id;dirty=false;notice('任务已保存，正在规划和生成');await refresh();}catch(e){notice(e.message,true);}finally{b.disabled=false;}};
  $('results').onclick=async e=>{const b=e.target.closest('button');if(!b)return;b.disabled=true;try{const j=jobs.find(j=>j.id===selected);if(b.dataset.jobAction){await api(`/api/writing/jobs/${j.id}/${b.dataset.jobAction}`,{});await refresh();return;}const a=b.closest('[data-id]');if(!a)return;const d=j.drafts.find(d=>d.id===Number(a.dataset.id));const action=b.dataset.action;if(action==='copy'){await navigator.clipboard.writeText(a.querySelector('[data-body]').value);notice('已复制');return;}if(action==='retry'){await api(`/api/writing/drafts/${d.id}/retry`,{});}else{notice('正在保存与审校…');const values={...d,revision:d.revision,body:a.querySelector('[data-body]').value,feedback:a.querySelector('[data-feedback]').value,note_url:a.querySelector('[data-url]').value,adopted:a.querySelector('[data-adopted]').checked};const data=await api(`/api/writing/drafts/${d.id}`,values,'PUT');Object.assign(d,values,{revision:data.revision,quality:data.quality});dirtyDrafts.delete(d.id);if(action==='content')await api(`/api/writing/drafts/${d.id}/save-content`,{});notice('已保存并检查');}dirty=dirtyDrafts.size>0;await refresh();}catch(e){notice(e.message,true);}finally{b.disabled=false;}};
  function addSample(){if($('samples').children.length>=10)return;const el=document.createElement('div');el.className='sample';el.innerHTML='<label>样本标题<input data-title maxlength="200"></label><label>表现数据与背景<input data-metrics maxlength="1000" placeholder="点赞、收藏、曝光、是否投放等"></label><label class="wide">完整文案<textarea data-text required maxlength="6000"></textarea></label><button type="button">移除样本</button>';el.querySelector('button').onclick=()=>el.remove();$('samples').append(el);}
  $('addSample').onclick=addSample;addSample();addSample();
  function renderResearch(r){report=r;$('researchOutput').innerHTML=`<article class="research-report"><h2>${esc(r.title)}</h2>${[['findings','观察到的共性'],['differences','差异与反例'],['hypotheses','待验证的写作假设'],['limitations','数据局限']].map(([k,t])=>`<h3>${t}</h3><ul>${r[k].map(s=>`<li>${esc(s)}</li>`).join('')}</ul>`).join('')}<h3>候选写作方法</h3><label>方法名称<input id="learnedTitle" value="${esc(r.method.title)}" maxlength="200"></label><label>结构<textarea id="learnedStructure">${esc(r.method.structure)}</textarea></label><label>写作逻辑<textarea id="learnedLogic">${esc(r.method.logic)}</textarea></label><div class="actions"><button id="saveMethod">确认并保存到方法库</button></div></article>`;$('saveMethod').onclick=async function(){this.disabled=true;try{const result=await api('/api/xhs-writing/methods',{title:$('learnedTitle').value,structure:$('learnedStructure').value,logic:$('learnedLogic').value,scene:r.method.scene,category:'爆文共性研究',source:'research-reviewed'});await loadMethods();$('method').value=result.id;notice('方法已保存，可用于下一批创作');this.textContent='已保存';}catch(e){notice(e.message,true);this.disabled=false;}};}
  async function loadResearch(){const rows=await api('/api/writing/research');$('researchHistory').innerHTML='';rows.forEach(r=>{const b=document.createElement('button');b.textContent=r.result.title;b.onclick=()=>renderResearch(r.result);$('researchHistory').append(b);});}
  $('researchForm').onsubmit=async e=>{e.preventDefault();$('analyze').disabled=true;notice('正在比较样本与提炼方法…');try{const samples=[...$('samples').children].map(el=>({title:el.querySelector('[data-title]').value,body:el.querySelector('[data-text]').value,metrics:el.querySelector('[data-metrics]').value}));const r=await api('/api/writing/research',{samples});renderResearch(r.result);await loadResearch();notice('分析完成，请审核候选方法');}catch(e){notice(e.message,true);}finally{$('analyze').disabled=false;}};
  async function loadMethods(){const rows=await api('/api/xhs-writing/methods');$('method').innerHTML='<option value="">不指定</option>'+rows.map(m=>`<option value="${m.id}">${esc(m.title)}</option>`).join('');}
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  try{
    directionOptions=await api('/api/writing/directions');
    $('directionPreset').innerHTML=directionOptions.map(d=>`<option value="${esc(d.id)}">${esc(d.title)}</option>`).join('');
    updateDirection();
    const brands=await api('/api/brands');$('brand').innerHTML+=brands.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('');await loadMethods();await refresh();
  }catch(e){notice(e.message,true);}
})();
