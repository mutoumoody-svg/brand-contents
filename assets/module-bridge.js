(function () {
  'use strict';
  const routes = {'xhs-writing.html':'methods','brand.html':'brands','collection.html':'collection','baowenku.html':'viral','wencai.html':'content','xiaohongshu-poster.html':'posters','xhs-insights.html':'insights','fenxi.html':'analysis','index.html':'quick','fangxie.html':'imitation','admin.html':'users'};
  const file = location.pathname.split('/').pop() || 'index.html';
  if (window === window.top) {
    location.replace('/workspace.html?module=' + (routes[file] || 'quick'));
    return;
  }
  const style = document.createElement('link');
  style.rel = 'stylesheet'; style.href = '/assets/module-theme.css'; document.head.append(style);
  document.documentElement.classList.add('workbench-module');
  document.querySelectorAll('.similarity-rail').forEach(button => document.body.append(button));
  document.addEventListener('click', e => {
    const link = e.target.closest('a');
    if (!link || link.target === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;
    const filename = url.pathname.split('/').pop();
    if (routes[filename] || filename === 'workspace.html') {
      e.preventDefault();
      parent.workbenchOpen?.(routes[filename] || 'home');
    }
  });
  // Authentication failures must leave the entire workbench, not nest its login page.
  if (!localStorage.getItem('brand_auth_token')) top.location.replace('/login.html');
})();
