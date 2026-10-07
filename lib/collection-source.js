const tikhub=require('./tikhub-source');
function selected(){return process.env.XHS_DATA_PROVIDER==='custom'?'custom':'tikhub';}
function configured() { return selected()==='tikhub'?tikhub.configured():!!(process.env.XHS_DATA_API_URL && process.env.XHS_DATA_API_TOKEN); }
async function call(method, input) {
  if(selected()==='tikhub')return tikhub[{'search':'search','creator/notes':'creator','note':'detail','comments':'comments'}[method]](input);
  if (!configured()) throw new Error('尚未配置笔记/达人数据服务，请由管理员接入数据源');
  const base = new URL(process.env.XHS_DATA_API_URL);
  if (base.protocol !== 'https:') throw new Error('数据服务地址必须使用HTTPS');
  const response = await fetch(new URL(method, base.href.endsWith('/') ? base : base.href + '/'), {
    method:'POST', signal:AbortSignal.timeout(60000), redirect:'error',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.XHS_DATA_API_TOKEN},
    body:JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`数据源请求失败 (${response.status})`);
  const text=await response.text();
  if(text.length>5e6)throw new Error('数据源响应过大');
  const data=JSON.parse(text);
  if(data.error)throw new Error('数据源返回错误，请检查账号权限与服务状态');
  return data;
}
module.exports = { configured,name:()=>selected()==='tikhub'?'TikHub':'自定义数据服务',search:p=>call('search',p), creator:p=>call('creator/notes',p), detail:p=>call('note',p), comments:p=>call('comments',p) };
