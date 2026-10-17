const {test}=require('node:test'),assert=require('node:assert/strict'),{plan,parse}=require('../lib/strategy-plan');
const valid=Array.from({length:3},(_,i)=>({angle:'场景'+i,structure:'结构'+i,voice:'口语'}));
test('策略JSON格式错误自动纠正一次，保留有效字段并检查差异',async()=>{
  let calls=0;const result=await plan('规划',3,async()=>++calls===1?'[{"angle":"坏"引号"}]':'```json\n'+JSON.stringify(valid)+'\n```');
  assert.equal(result.repaired,true);assert.equal(calls,2);assert.equal(result.strategies.length,3);
  assert.throws(()=>parse(JSON.stringify([valid[0],valid[0],valid[0]]),3),/重复/);
  assert.throws(()=>parse(JSON.stringify(valid.slice(0,1)),3),/数量/);
  let failed=0;await assert.rejects(()=>plan('规划',3,async()=>{failed++;return '损坏的JSON';}),/未通过校验/);assert.equal(failed,2);
});
