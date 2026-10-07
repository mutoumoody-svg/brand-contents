const PREFIX='/api/v1/xiaohongshu/app_v2/';
function configured(){return !!process.env.TIKHUB_API_KEY;}
async function request(method,params){
  if(!configured())throw new Error('未配置TIKHUB_API_KEY，请在服务器填写数据服务凭据');
  const url=new URL(PREFIX+method,'https://api.tikhub.io');
  for(const [key,value]of Object.entries(params))if(value!==undefined&&value!==null&&value!=='')url.searchParams.set(key,String(value));
  let response;
  try{response=await fetch(url,{headers:{Authorization:'Bearer '+process.env.TIKHUB_API_KEY},signal:AbortSignal.timeout(60000),redirect:'error'});}
  catch{throw new Error('数据服务连接失败或超时');}
  if(!response.ok)throw new Error(response.status===401?'数据服务凭据无效':response.status===402?'数据服务额度不足':response.status===429?'数据服务限流，请稍后重试':`数据服务请求失败 (${response.status})`);
  const text=await response.text();if(text.length>5e6)throw new Error('数据服务响应过大');
  let value;try{value=JSON.parse(text);}catch{throw new Error('数据服务响应不是JSON');}
  for(let i=0;i<3;i++){
    if(value?.success===false||(value?.code!==undefined&&![0,200].includes(Number(value.code))))throw new Error('数据源业务请求失败，请核对权限或额度');
    if(value?.data && typeof value.data==='object')value=value.data;else break;
  }
  if(!value || typeof value!=='object')throw new Error('数据源返回无效结果');
  return value;
}
function note(raw,expectedAuthor){
  const n=raw.note_card||raw.note||raw;
  const user=n.user||n.author||{},stats=n.interact_info||n.interactInfo||n;
  const id=n.note_id||n.noteId||n.id||raw.id;
  return {id,title:n.title||n.display_title||'',body:n.desc??n.description??n.content??'',
    author:user.nickname||user.nick_name||user.name||'',author_id:user.user_id||user.userId||user.id||expectedAuthor||'',
    url:n.note_url||n.share_url||`https://www.xiaohongshu.com/explore/${id}`,
    likes:stats.liked_count??stats.likedCount??stats.likes,
    comment_count:stats.comment_count??stats.commentCount,collects:stats.collected_count??stats.collectedCount,
    published_at:n.time||n.publish_time||null,type:n.type||'',
  };
}
function list(data,keys){if(Array.isArray(data))return data;for(const key of keys)if(Array.isArray(data[key]))return data[key];throw new Error('数据源列表结构变化，需更新适配器');}
function decodeCursor(value){if(!value)return {};try{return JSON.parse(value);}catch{throw new Error('分页游标无效');}}
async function search(input){
  const c=decodeCursor(input.cursor),page=Number(c.page)||1;
  const data=await request('search_notes',{keyword:input.keyword,page,sort_type:'general',search_id:c.search_id,search_session_id:c.search_session_id});
  const items=list(data,['items','notes','note_list']);
  const notes=items.filter(n=>['note','image','video',undefined].includes(n.model_type)).map(n=>({...note(n),body:''}));
  const more=data.has_more===true||data.has_more===1;
  return {notes,next_cursor:more?JSON.stringify({page:page+1,search_id:data.search_id||c.search_id,search_session_id:data.search_session_id||c.search_session_id}):''};
}
async function creator(input){
  const userId=new URL(input.creator_url).pathname.match(/\/user\/profile\/([a-f0-9]{24})/i)?.[1];
  if(!userId)throw new Error('达人主页ID无效');
  const data=await request('get_user_posted_notes',{user_id:userId,cursor:input.cursor});
  const items=list(data,['notes','items','note_list']);
  return {notes:items.map(n=>({...note(n,userId),body:''})),next_cursor:data.has_more===true||data.has_more===1?String(data.cursor||data.next_cursor||''):''};
}
async function detail(input){
  const params=input.url?{share_text:input.url}:{note_id:input.note_id};
  const method=input.type==='video'?'get_video_note_detail':'get_image_note_detail';
  const data=await request(method,params);
  const raw=data.note||data.note_card||data.items?.[0]||data.notes?.[0]||data;
  const result=note(raw);if(!result.id||!result.body)throw new Error('数据源未提供完整笔记详情，未自动补写');return result;
}
async function comments(input){
  const data=await request('get_note_comments',{note_id:input.note_id,cursor:input.cursor});
  const items=list(data,['comments','items']);
  return {comments:items.map(c=>({id:c.id||c.comment_id,parent_id:c.parent_id||'',author:c.user?.nickname||c.user_info?.nickname||'',
    body:c.content??c.text,likes:c.like_count??c.likes,published_at:c.create_time||c.time||null})),
    next_cursor:data.has_more===true||data.has_more===1?String(data.cursor||data.next_cursor||''):''};
}
module.exports={name:'TikHub',configured,search,creator,detail,comments,note};
