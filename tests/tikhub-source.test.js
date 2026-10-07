const {test}=require('node:test');const assert=require('node:assert/strict');
const source=require('../lib/tikhub-source');
test('直接数据API请求、字段转换与搜索/评论分页',async t=>{
  const before=global.fetch,key=process.env.TIKHUB_API_KEY;process.env.TIKHUB_API_KEY='test-key';
  t.after(()=>{global.fetch=before;if(key===undefined)delete process.env.TIKHUB_API_KEY;else process.env.TIKHUB_API_KEY=key;});
  const id='abcdef1234567890abcdef12',user='1234567890abcdef12345678';const requests=[];
  global.fetch=async(url,options)=>{
    requests.push(url);assert.equal(options.headers.Authorization,'Bearer test-key');
    let data;
    if(url.pathname.endsWith('search_notes'))data={items:[{model_type:'note',note:{id,title:'标题',desc:'摘要',user:{user_id:user,nickname:'作者'},interact_info:{liked_count:'1.2万'}}}],has_more:true,search_id:'s',search_session_id:'ss'};
    else if(url.pathname.endsWith('get_user_posted_notes'))data={notes:[{id,title:'标题'}],has_more:false};
    else if(url.pathname.endsWith('get_note_comments'))data={comments:[{id:'c1',content:'真实评论',user:{nickname:'读者'},like_count:4}],has_more:true,cursor:'next'};
    else data={note:{id,title:'标题',desc:'完整正文',user:{user_id:user,nickname:'作者'}}};
    return new Response(JSON.stringify({code:200,data:{code:0,data}}));
  };
  const search=await source.search({keyword:'咖啡杯'});assert.equal(search.notes[0].body,'');assert.equal(search.notes[0].likes,'1.2万');
  await source.search({keyword:'咖啡杯',cursor:search.next_cursor});assert.equal(requests[1].searchParams.get('page'),'2');assert.equal(requests[1].searchParams.get('search_id'),'s');
  assert.equal((await source.creator({creator_url:'https://www.xiaohongshu.com/user/profile/'+user})).notes[0].author_id,user);
  assert.equal((await source.detail({note_id:id})).body,'完整正文');
  await source.detail({note_id:id,type:'video'});assert.equal(requests.at(-1).pathname.endsWith('get_video_note_detail'),true);
  const comments=await source.comments({note_id:id});assert.equal(comments.comments[0].body,'真实评论');assert.equal(comments.next_cursor,'next');
  global.fetch=async()=>new Response(JSON.stringify({code:200,data:{success:false,code:403}}));await assert.rejects(()=>source.search({keyword:'x'}),/业务请求失败/);
});
