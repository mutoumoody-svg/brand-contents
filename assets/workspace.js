'use strict';
const $ = id => document.getElementById(id);
const token = localStorage.getItem('brand_auth_token');
if (!token) location.replace('/login.html');
let jobs = [], selectedId = Number(new URLSearchParams(location.search).get('job')) || null, polling = null, editing = false;
let samples = [];
const modeNames = {external:'他牌爆文借鉴',aspiration:'用户向往式创作',brand:'品牌优质内容复创'};
const creationMode = () => document.querySelector('[name=creationMode]:checked').value;
window.workbenchCanLeave = () => !editing || confirm('创作文案有尚未保存的修改，仍要切换？');
function updateMode() {
  const mode = creationMode();
  $('aspirationFields').hidden = mode !== 'aspiration';
  $('sampleFields').hidden = mode === 'aspiration';
  $('savedSampleLabel').hidden = mode !== 'brand';
  $('creationReference').required = mode !== 'aspiration';
  $('brand').required = mode === 'brand';
}
let previousMode = 'external';
const sampleBuffers = {};
$('creationModes').addEventListener('change', () => {
  sampleBuffers[previousMode] = [$('creationReference').value, $('sampleTitle').value, $('sampleContext').value];
  const values = sampleBuffers[creationMode()] || ['', '', ''];
  ['creationReference','sampleTitle','sampleContext'].forEach((id,i) => { $(id).value = values[i]; });
  $('savedSample').value = '';
  previousMode = creationMode(); updateMode();
});
$('brand').addEventListener('change', async () => {
  if (creationMode() === 'brand') { $('creationReference').value = ''; $('sampleTitle').value = ''; }
  samples = []; $('savedSample').innerHTML = '<option value="">选择已有内容</option>';
  const brand = $('brand').selectedOptions[0]?.textContent;
  if (!$('brand').value) return;
  try {
    const brandId = $('brand').value;
    const rows = await api('/api/content?brand_name=' + encodeURIComponent(brand));
    if ($('brand').value !== brandId) return;
    samples = rows;
    $('savedSample').innerHTML += samples.map(s => `<option value="${s.id}">${esc(s.title || '未命名内容')}</option>`).join('');
  } catch(err) { notice(err.message, true); }
});
$('savedSample').addEventListener('change', () => {
  const sample = samples.find(s => s.id === Number($('savedSample').value));
  if (sample) { $('creationReference').value = sample.body.slice(0,6000); $('sampleTitle').value = sample.title || ''; }
});
updateMode();
const labels = { queued:'等待生成',running:'生成中',paused:'已暂停',partial:'部分失败',completed:'已完成',pending:'待生成',ready:'已保存',failed:'失败' };
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function notice(text, error = false) { $('notice').textContent = text; $('notice').className = error ? 'error' : ''; }
async function api(url, options = {}) {
  const r = await fetch(url, { ...options, headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}` } });
  if(r.status===401){['brand_auth_token','brand_user_name','brand_user_role'].forEach(k=>localStorage.removeItem(k));editing=false;location.replace('/login.html');throw new Error('登录已失效，请重新登录');}
  const data = await r.json();
  if (!r.ok) { throw new Error(data.error?.message || data.error || '请求失败'); }
  return data;
}
function qualityHtml(q) {
  return `<p class="${q.review ? 'review' : 'muted'}">文字重合度：${q.highest || 0}% · ${q.review ? '需复核' : '未发现高重合'}${q.rewritten ? ' · 已自动重写' : ''}</p>${(q.matches || []).map(m => `<small>${esc(m.source)}：${esc(m.title || m.id)} · ${m.score}%</small>`).join('<br>')}`;
}
async function refresh() {
  const updated = await api('/api/writing/jobs');
  const held = editing ? jobs.find(j => j.id === selectedId) : null;
  jobs = updated.map(j => held && j.id === held.id ? held : j);
  if (!selectedId && jobs.length) selectedId = jobs[0].id;
  $('jobList').innerHTML = jobs.map(j => `<button class="job-link ${j.id === selectedId ? 'active' : ''}" data-job="${j.id}">${esc(j.input.topic)}<br><small>${esc(j.brand_name)} · ${labels[j.status]} · ${j.drafts.filter(d => d.body).length}/${j.drafts.length}</small></button>`).join('') || '<p class="muted">暂无任务</p>';
  if (!editing) renderJob();
  clearTimeout(polling);
  if (jobs.some(j => ['running','queued'].includes(j.status) || j.drafts.some(d => d.status === 'running'))) polling = setTimeout(() => refresh().catch(e => notice(e.message,true)), 4000);
}
function renderJob() {
  const job = jobs.find(j => j.id === selectedId); if (!job) return;
  const active = ['running','queued'].includes(job.status);
  $('jobDetail').innerHTML = `<div class="draft-head"><h2>${esc(job.input.topic)}</h2><span>${labels[job.status]}</span></div><p class="review">${esc(job.error)}</p><div class="actions"><button data-action="${active ? 'pause' : 'resume'}">${active ? '暂停后续生成' : '继续 / 重试失败篇'}</button><button data-action="export">导出文案</button><a href="https://creator.xiaohongshu.com/" target="_blank" rel="noopener">前往小红书发布</a></div>` + job.drafts.map(d => `<article class="draft" data-draft="${d.id}"><div class="draft-head"><h3>第${d.ordinal}篇 · ${esc(d.strategy.angle)}</h3><small>${labels[d.status]}</small></div><small>${esc(d.strategy.structure)} · ${esc(d.strategy.voice)}</small><p class="review">${esc(d.error)}</p>${d.body ? `${qualityHtml(d.quality)}<textarea data-field="body" aria-label="第${d.ordinal}篇文案">${esc(d.body)}</textarea><div class="feedback-grid"><label class="check"><input type="checkbox" data-field="adopted" ${d.adopted ? 'checked' : ''}>采用此篇</label><label class="wide">发布链接<input data-field="note_url" value="${esc(d.note_url)}"></label>${['likes','comments','collects'].map((f,i) => `<label>${['点赞','评论','收藏'][i]}<input type="number" min="0" max="1000000000" data-field="${f}" value="${d[f]}"></label>`).join('')}<label class="wide">修改意见与效果反馈<textarea data-field="feedback" rows="2">${esc(d.feedback)}</textarea></label></div><div class="actions"><button class="primary" data-action="save">保存修改与反馈</button><button data-action="content">保存到内容库</button><button data-action="copy">复制文案</button><button data-action="check">重新检查</button></div>` : ''}</article>`).join('');
  for (const d of job.drafts.filter(d => d.status === 'failed')) {
    const button = document.createElement('button'); button.dataset.action = 'retry'; button.textContent = '重试此篇';
    $('jobDetail').querySelector(`[data-draft="${d.id}"]`).append(button);
  }
  if (job.status === 'completed') $('jobDetail').querySelector('[data-action=resume]')?.remove();
  const modeLabel = document.createElement('p'); modeLabel.className = 'muted';
  modeLabel.textContent = modeNames[job.input.mode] || '历史创作任务';
  $('jobDetail').prepend(modeLabel);
  if (!job.drafts.some(d => d.body)) $('jobDetail').querySelector('[data-action=export]').disabled = true;
}
async function saveDraft(article) {
  const id = Number(article.dataset.draft), job = jobs.find(j => j.id === selectedId), draft = job.drafts.find(d => d.id === id);
  const value = { revision: draft.revision };
  for (const el of article.querySelectorAll('[data-field]')) value[el.dataset.field] = el.type === 'checkbox' ? el.checked : el.value;
  const result = await api(`/api/writing/drafts/${id}`, {method:'PUT',body:JSON.stringify(value)});
  Object.assign(draft, value, { revision: result.revision, quality: result.quality });
  editing = false;
  return draft;
}
$('jobDetail').addEventListener('input', () => { editing = true; });
$('jobDetail').addEventListener('click', async e => {
  const btn = e.target.closest('[data-action]'); if (!btn) return;
  btn.disabled = true;
  try {
    const action = btn.dataset.action, article = btn.closest('[data-draft]');
    if (article) {
      if (action === 'retry') { await api(`/api/writing/drafts/${article.dataset.draft}/retry`,{method:'POST',body:'{}'}); await refresh(); return; }
      if (action === 'copy') { await navigator.clipboard.writeText(article.querySelector('[data-field=body]').value); notice('已复制'); return; }
      const draft = await saveDraft(article);
      if (action === 'content') await api(`/api/writing/drafts/${draft.id}/save-content`, { method:'POST', body:'{}' });
      notice(action === 'check' ? '已重新检查并保存' : '已保存');
    } else if (action === 'export') {
      if (editing) { notice('请先保存修改再导出',true); return; }
      const job = jobs.find(j => j.id === selectedId);
      const text = job.drafts.filter(d => d.body).map(d => d.body).join('\n\n---\n\n');
      const url = URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
      const a = document.createElement('a'); a.href = url; a.download = `小红书文案-${job.id}.txt`; a.click(); URL.revokeObjectURL(url);
    } else await api(`/api/writing/jobs/${selectedId}/${action}`, { method:'POST', body:'{}' });
    await refresh();
  } catch (err) { notice(err.message,true); } finally { btn.disabled = false; }
});
$('jobList').addEventListener('click', e => {
  const b = e.target.closest('[data-job]'); if (!b) return;
  if (editing && !confirm('尚有未保存修改，离开此篇？')) return;
  editing = false; selectedId = Number(b.dataset.job); refresh().catch(e => notice(e.message,true));
});
$('jobForm').addEventListener('submit', async e => {
  e.preventDefault(); const btn = e.submitter; btn.disabled = true;
  try {
    if (editing && !confirm('尚有未保存修改，继续创建新任务？')) return;
    const body = { brandId: $('brand').value, topic:$('topic').value, goal:$('goal').value, audience:$('audience').value, count:$('count').value, diversity:$('diversity').value, must:$('must').value, methodIds: [...$('methods').querySelectorAll(':checked')].map(el => Number(el.value)) };
    Object.assign(body, { mode:creationMode(), currentState:$('currentState').value, desiredState:$('desiredState').value, perspectives:$('perspectives').value, sampleContext:$('sampleContext').value, references:creationMode() === 'aspiration' ? [] : [{title:$('sampleTitle').value,content:$('creationReference').value}] });
    const job = await api('/api/writing/jobs',{method:'POST',body:JSON.stringify(body)});
    selectedId = job.id; editing = false; notice('任务已保存'); await refresh();
  } catch (err) { notice(err.message,true); } finally { btn.disabled = false; }
});
$('qualityForm').addEventListener('submit', async e => {
  e.preventDefault(); e.submitter.disabled = true;
  try { const q = await api('/api/quality/check',{method:'POST',body:JSON.stringify({text:$('qualityText').value,brand_name:$('qualityBrand').value,references:[$('reference').value].filter(Boolean)})}); $('qualityResult').innerHTML = qualityHtml(q) + `<p class="muted">已比较${q.compared}份内容。${esc(q.limitation)}</p>`; }
  catch(err){notice(err.message,true);} finally {e.submitter.disabled=false;}
});
document.querySelector('.tabs').addEventListener('click', async e => {
  const btn = e.target.closest('[data-view]'); if (!btn) return;
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected',String(b===btn)));
  document.querySelectorAll('.view').forEach(v => {v.hidden = v.id !== `view-${btn.dataset.view}`;});
  try {
    if (btn.dataset.view === 'feedback') {
      const rows = await api('/api/writing/method-feedback');
      $('feedbackRows').innerHTML = rows.map(m => `<tr>${[m.title,m.category,m.generated,m.adopted,m.published,m.likes,m.comments,m.collects,m.feedback.join('\n')].map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="9">暂无方法反馈</td></tr>';
    }
    if (btn.dataset.view === 'system') {
      const s = await api('/api/system/status');
      $('systemStatus').innerHTML = [['AI配置',s.ai.configured?'已配置（尚未验证实际调用）':'缺少配置'],['代理域名',s.ai.host||s.ai.error],['数据库',s.database?'正常':'异常'],['Node',s.node],['飞书基础凭证',s.feishu?'已配置':'未配置'],['小红书发布','人工发布 / 文案导出']].map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
    }
  } catch(err){notice(err.message,true);}
});
$('refresh').onclick = () => refresh().catch(e => notice(e.message,true));
$('logout').onclick = () => { localStorage.removeItem('brand_auth_token'); location.replace('/login.html'); };
window.addEventListener('beforeunload', e => { if(editing){e.preventDefault();e.returnValue='';} });
(async () => {
  const [brands, methods, health, user] = await Promise.all([api('/api/brands'),api('/api/xhs-writing/methods'),api('/api/health'),api('/api/auth/verify')]);
  $('brand').innerHTML += brands.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
  $('qualityBrand').innerHTML = '<option value="">未指定品牌</option>' + brands.map(b => `<option>${esc(b.name)}</option>`).join('');
  $('methods').innerHTML = methods.map(m => `<label><input type="checkbox" value="${m.id}">${esc(m.title)}</label>`).join('') || '<a href="/xhs-writing.html">新建写作方法</a>';
  $('version').textContent = `${health.release} · ${health.revision}`;
  $('systemTab').hidden = user.user.role !== 'admin';
  $('usersNav').hidden = user.user.role !== 'admin';
  if (sessionStorage.getItem('quality-text')) { $('qualityText').value = sessionStorage.getItem('quality-text'); sessionStorage.removeItem('quality-text'); }
  if (location.hash === '#quality') document.querySelector('[data-view=quality]').click();
  await refresh();
})().catch(err => notice(err.message,true));
