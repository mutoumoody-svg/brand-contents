const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),file=path.join(root,'brand.env');
require('dotenv').config({path:path.join(root,'.env')});require('dotenv').config({path:file,override:true});
(async()=>{
  if(!process.env.ANTHROPIC_API_KEY)throw Error('请先在本机brand.env中填写ANTHROPIC_API_KEY，不要通过聊天发送');
  process.env.CLAUDE_PROXY_URL='https://api.anthropic.com/v1/messages';
  await require('../lib/claude-client').complete('请仅回复：连接正常',32);
  const original=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
  if(original)fs.writeFileSync(file+'.bak.'+Date.now(),original,{mode:0o600,flag:'wx'});
  const lines=original.split(/\r?\n/).filter(l=>!/^\s*(?:export\s+)?CLAUDE_PROXY_URL\s*=/.test(l));
  lines.push('CLAUDE_PROXY_URL=https://api.anthropic.com/v1/messages');
  const temp=file+'.restore-'+crypto.randomBytes(6).toString('hex');
  fs.writeFileSync(temp,lines.join('\n')+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temp,file);
  console.log('官方直连测试成功，已备份并更新本机brand.env。重启本机服务后生效；不要把该文件上传GitHub或覆盖服务器配置。');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
