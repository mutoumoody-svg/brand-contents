(async function () {
  try {
    const response = await fetch('/api/local-preview/session', { method:'POST', headers:{'X-Local-Preview':'1'} });
    if (response.ok) {
      const data = await response.json();
      localStorage.setItem('brand_auth_token', data.token);
    }
  } catch (_) { /* Normal authentication remains available when preview is disabled. */ }
  for (const name of ['workspace.js','workbench.js']) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = '/assets/' + name;
      script.onload = resolve; script.onerror = reject; document.head.append(script);
    });
  }
})();
