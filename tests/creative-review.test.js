const {test}=require('node:test');
const assert=require('node:assert/strict');
const {review}=require('../lib/creative-review');
test('创意审校识别换词趋同，失败不可标为通过，限制比较范围',async()=>{
  const candidates=Array.from({length:25},(_,id)=>({id,body:'不同场景的故事'+id,source:'draft'}));
  const q=await review('我的新文案',candidates,async()=>JSON.stringify({review:true,reasons:['样本1观点与推进相同']}));
  assert.equal(q.review,true);assert.equal(q.semantic.compared,20);
  const failed=await review('我的新文案',candidates,async()=>{throw Error('超时');});
  assert.equal(failed.review,true);assert.equal(failed.semantic.status,'unavailable');
  assert.equal((await review('文案',[],async()=>{throw Error('不应调用');})).semantic.status,'no-samples');
});
