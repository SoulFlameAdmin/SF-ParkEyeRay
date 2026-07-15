const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const schema=JSON.parse(fs.readFileSync('contracts/parking-submission.schema.json','utf8'));
assert.equal(schema.properties.geometry.properties.type.const,'Polygon');
assert.equal(schema.properties.access.enum.includes('public'),true);

const sql=fs.readFileSync('supabase/migrations/20260715190000_smartcity_parking_foundation.sql','utf8');
assert.match(sql,/pending_soulflame/);
assert.match(sql,/where status = 'approved'/i);
assert.match(sql,/No client policy can approve/i);
assert.match(sql,/enable row level security/i);

const storageData=new Map();
const storage={
  getItem:key=>storageData.has(key)?storageData.get(key):null,
  setItem:(key,value)=>storageData.set(key,value)
};
const window={localStorage:storage,fetch:async()=>{throw new Error('offline')}};
vm.runInNewContext(fs.readFileSync('v2-submission-adapter.js','utf8'),{window,console,Date,JSON,Number,String,Error});
const adapter=window.SFV2SubmissionAdapter;
const proposal={
  id:'proposal-12345678',name:'Тестова зона',access:'public',capacity:12,evidence:'Маркировка и знак',
  geometry:[{lat:42.1,lon:25.1},{lat:42.1,lon:25.2},{lat:42.2,lon:25.2}]
};
const payload=adapter.toSubmission(proposal);
assert.equal(payload.geometry.type,'Polygon');
assert.deepEqual(payload.geometry.coordinates[0][0],payload.geometry.coordinates[0].at(-1));
assert.equal(payload.access,'public');
assert.equal(adapter.STATUS,'pending_soulflame');

adapter.submit(proposal,{fetchImpl:window.fetch,storage}).then(result=>{
  assert.equal(result.status,'pending_soulflame');
  assert.equal(result.delivery,'local-outbox');
  const outbox=JSON.parse(storage.getItem('sf-v2-submission-outbox'));
  assert.equal(outbox.length,1);
  assert.equal(outbox[0].status,'pending_soulflame');
  console.log('V2 contracts OK');
}).catch(error=>{console.error(error);process.exit(1)});
