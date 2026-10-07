(function () {
  const originalFetch = window.fetch.bind(window);
  let latest = '';
  const token = () => localStorage.getItem('brand_auth_token') || '';
  const style = document.createElement('style');
  style.textContent = '.similarity-rail{z-index:10001!important;top:auto!important;bottom:16px!important;left:12px!important;writing-mode:horizontal-tb!important;flex-direction:row!important;max-width:calc(100vw - 24px);letter-spacing:0!important}dialog::backdrop{background:rgba(0,0,0,.3)}';
  document.head.append(style);
  function brandName() {
    const select = document.getElementById('brandSelect');
    return select?.value ? select.selectedOptions[0]?.textContent.trim() || '' : '';
  }
  const panel = document.createElement('dialog');
  panel.style.cssText = 'width:min(620px,92vw);max-height:85vh;overflow:auto;border:1px solid #bacac2;border-radius:4px;padding:24px;background:#fff;color:#232728';
  panel.innerHTML = '<form method="dialog"><button style="float:right" aria-label="关闭">×</button></form><h2 style="font-size:20px">文案相似度检查</h2><label><input type="checkbox" id="quality-enabled"> 自动比较品牌历史文案</label><p id="quality-last" style="font-size:14px"></p><label>待检查文案<textarea id="quality-manual" rows="8" style="width:100%;font:inherit"></textarea></label><button type="button" id="quality-run">检查</button><p id="quality-result" style="white-space:pre-wrap;font-size:14px"></p><a href="/workspace.html">内容工作台</a>';
  document.body.append(panel);
  const enabled = panel.querySelector('#quality-enabled');
  enabled.checked = localStorage.getItem('quality_enabled') !== 'false';
  function updateRails() {
    document.querySelectorAll('.similarity-rail strong').forEach(el => { el.textContent = enabled.checked ? '历史检查开启' : '自动检查关闭'; });
  }
  enabled.onchange = () => { localStorage.setItem('quality_enabled', String(enabled.checked)); updateRails(); };
  updateRails();
  window.showSimilarityNotice = function () { panel.querySelector('#quality-manual').value = latest; panel.showModal(); };
  document.querySelectorAll('.similarity-rail').forEach(el => { el.onclick = window.showSimilarityNotice; });
  panel.querySelector('#quality-run').onclick = async function () {
    const result = panel.querySelector('#quality-result'); this.disabled = true;
    try {
      const response = await originalFetch('/api/quality/check', { method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token()},body:JSON.stringify({text:panel.querySelector('#quality-manual').value,brand_name:brandName()}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || data.error);
      result.textContent = `最高文字重合度 ${data.highest}% · 已比较 ${data.compared}份\n${data.review ? '建议调整场景、开头及叙事结构' : '未发现高文字重合'}\n${data.limitation}`;
    } catch(err) { result.textContent = err.message; } finally { this.disabled = false; }
  };
  const link = document.createElement('a'); link.href = '/workspace.html'; link.textContent = '内容工作台';
  link.style.cssText = 'font-size:14px;white-space:nowrap';
  const nav = document.querySelector('nav'); if (nav) nav.append(link);
  window.fetch = async function (url, options) {
    if (url !== '/api/claude' || !options?.body) return originalFetch(url, options);
    let body;
    try { body = JSON.parse(options.body); } catch { return originalFetch(url, options); }
    const prompt = (body.messages || []).filter(m => m.role === 'user').map(m => typeof m.content === 'string' ? m.content : '').join('\n');
    const generation = /生成[^。]*文案|改写|仿写|重写|写一篇|创作[^。]*文案|生成[^。]*卡片|生成[^。]*海报/.test(prompt)
      && !/不要直接写正文|策略矩阵生成|不合法的 JSON|修复.*JSON|你是[^。\n]*分析师/.test(prompt.slice(0, 1500));
    if (generation && enabled.checked) body.quality_context = { enabled:true, brand_name:brandName() };
    const response = await originalFetch(url, { ...options, body:JSON.stringify(body) });
    if (generation && response.ok) {
      const data = await response.clone().json().catch(() => ({}));
      latest = (data.content || []).map(c => c.text || '').join('\n');
      const q = data.quality;
      panel.querySelector('#quality-last').textContent = q ? `最近生成：最高文字重合度${q.highest}% · ${q.compared}份历史 · ${q.review ? '需人工复核' : '未发现高重合'}${q.rewritten ? ' · 已自动重写' : ''}` : '最近生成未进行服务端历史比对，可手动检查。';
    }
    return response;
  };
})();
