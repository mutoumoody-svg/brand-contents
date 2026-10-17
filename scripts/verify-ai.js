const path=require('path'),root=path.resolve(__dirname,'..');
require('dotenv').config({path:path.join(root,'.env')});require('dotenv').config({path:path.join(root,'brand.env'),override:true});
(async()=>{const ai=require('../lib/claude-client'),c=ai.configuration();console.log(JSON.stringify({host:c.host,mode:c.direct?'official-direct':'worker',credentialConfigured:!!c.credential}));await ai.complete('请仅回复：连接正常',32);console.log('实际AI调用成功');})().catch(e=>{console.error('AI调用未通过：'+e.message);process.exitCode=1;});
