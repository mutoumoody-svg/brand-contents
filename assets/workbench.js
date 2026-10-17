(function () {
  'use strict';
  const modules = {
    methods: ['写作方法与爆文分析', 'xhs-writing.html'],
    brands: ['品牌资料', 'brand.html'],
    collection: ['素材采集', 'collection.html'],
    viral: ['爆文素材', 'baowenku.html'],
    content: ['内容库', 'wencai.html'],
    posters: ['图片海报', 'xiaohongshu-poster.html'],
    insights: ['热点与飞书', 'xhs-insights.html'],
    analysis: ['文案分析', 'fenxi.html'],
    quick: ['快速生成与改写', 'index.html'],
    imitation: ['参考仿写', 'fangxie.html'],
    users: ['用户管理', 'admin.html']
  };
  const frames = new Map();
  const host = document.getElementById('moduleHost');
  let active = '';
  function open(key, push = true) {
    if (!modules[key]) return;
    if (typeof window.workbenchCanLeave === 'function' && !window.workbenchCanLeave()) return;
    active = key;
    document.querySelectorAll('main > .view').forEach(v => { v.hidden = true; });
    document.getElementById('view-module').hidden = false;
    document.getElementById('workspaceTabs').hidden = true;
    document.getElementById('workspaceTitle').textContent = modules[key][0];
    document.querySelectorAll('header nav a').forEach(a => {
      if (a.dataset.module === key) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
    });
    if (!frames.has(key)) {
      const frame = document.createElement('iframe');
      frame.title = modules[key][0]; frame.src = '/' + modules[key][1];
      frame.dataset.module = key;
      frame.addEventListener('load', () => {
        const url = new URL(frame.contentWindow.location.href);
        if (['/login.html','/forgot-password.html','/workspace.html'].includes(url.pathname)) {
          location.assign(url.pathname + url.search + url.hash);
        }
      });
      host.append(frame); frames.set(key, frame);
    }
    frames.forEach((frame,k) => { frame.hidden = k !== key; });
    document.getElementById('moduleOpen').href = '/' + modules[key][1];
    if (push) history.pushState({}, '', '/workspace.html?module=' + key);
  }
  function home(push = true) {
    if (typeof window.workbenchCanLeave === 'function' && !window.workbenchCanLeave()) return;
    active = '';
    document.getElementById('view-module').hidden = true;
    document.getElementById('workspaceTabs').hidden = false;
    document.getElementById('workspaceTitle').textContent = '内容工作台';
    document.querySelector('[data-view=jobs]').click();
    document.querySelectorAll('header nav a').forEach(a => a.removeAttribute('aria-current'));
    document.querySelector('header nav a[href="/workspace.html"]').setAttribute('aria-current','page');
    if (push) history.pushState({}, '', '/workspace.html');
  }
  document.addEventListener('click', e => {
    const link = e.target.closest('a');
    if (!link || e.ctrlKey || e.metaKey || e.shiftKey || link.target === '_blank') return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;
    const key = Object.keys(modules).find(k => '/' + modules[k][1] === url.pathname);
    if (key) { e.preventDefault(); open(key); }
    else if (url.pathname === '/workspace.html' && active) { e.preventDefault(); home(); }
  });
  window.workbenchOpen = key => key === 'home' ? home() : open(key);
  window.workbenchResolve = filename => Object.keys(modules).find(k => modules[k][1] === filename);
  document.getElementById('moduleReload').onclick = () => {
    if (confirm('重新加载会丢失当前模块尚未保存的输入，继续？')) {
      const frame = frames.get(active); if (frame) frame.src = frame.src;
    }
  };
  window.addEventListener('popstate', () => {
    const key = new URLSearchParams(location.search).get('module');
    if (modules[key]) open(key, false); else home(false);
  });
  const initial = new URLSearchParams(location.search).get('module');
  if (modules[initial]) open(initial, false);
})();
