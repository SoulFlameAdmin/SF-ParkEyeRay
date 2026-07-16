const { test, expect } = require('@playwright/test');

const supabaseStub = String.raw`
(() => {
  const proposal = {
    id:'11111111-1111-4111-8111-111111111111',name:'Паркинг пред тестов обект',status:'pending_soulflame',
    geometry:{type:'Polygon',coordinates:[[[26.32,42.68],[26.321,42.68],[26.321,42.681],[26.32,42.68]]]},
    vehicle_entrance:null,pedestrian_exit:null,access:'public',capacity:18,fee:'no',opening_hours:null,
    created_by:'de35fedf-f922-42b2-bf14-9320c11fb2a4',created_at:'2026-07-16T01:00:00Z',updated_at:'2026-07-16T01:00:00Z',verified_at:null,verified_by:null
  };
  const evidence = [{id:'22222222-2222-4222-8222-222222222222',storage_path:null,note:'Има маркировка и постоянен знак.',captured_at:'2026-07-16T01:00:00Z',created_at:'2026-07-16T01:00:00Z'}];
  let events = [];
  window.__moderationCalls = [];

  function responseFor(table, filters) {
    if (table === 'parking_moderators') return { data:{role:'owner',active:true}, error:null };
    if (table === 'parking_zones') {
      const status = filters.find(item => item[0] === 'status')?.[1];
      return { data: status === proposal.status ? [proposal] : [], error:null };
    }
    if (table === 'parking_evidence') return { data:evidence, error:null };
    if (table === 'parking_moderation_events') return { data:events, error:null };
    return { data:[], error:null };
  }

  function builder(table) {
    const filters=[];
    const chain={
      select(){return chain},eq(key,value){filters.push([key,value]);return chain},order(){return chain},limit(){return chain},
      maybeSingle(){return Promise.resolve(responseFor(table,filters))},single(){return Promise.resolve(responseFor(table,filters))},
      then(resolve,reject){return Promise.resolve(responseFor(table,filters)).then(resolve,reject)}
    };
    return chain;
  }

  const client={
    auth:{
      getSession:async()=>({data:{session:{access_token:'test',user:{id:'de35fedf-f922-42b2-bf14-9320c11fb2a4',email:'moderator@example.test',user_metadata:{full_name:'SoulFlame Moderator'}}}},error:null}),
      onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
      signInWithOAuth:async()=>({data:{},error:null}),signInWithOtp:async()=>({data:{},error:null}),signOut:async()=>({error:null})
    },
    from:table=>builder(table),
    rpc:async(name,args)=>{
      window.__moderationCalls.push({name,args});
      proposal.status=args.next_status;
      proposal.verified_at=args.next_status==='approved'?'2026-07-16T02:00:00Z':null;
      events=[{id:'33333333-3333-4333-8333-333333333333',action:args.next_status,from_status:'pending_soulflame',to_status:args.next_status,reason:args.moderation_reason,actor_id:'de35fedf-f922-42b2-bf14-9320c11fb2a4',created_at:'2026-07-16T02:00:00Z'}];
      return {data:[{id:proposal.id,status:proposal.status,verified_at:proposal.verified_at,verified_by:proposal.created_by,updated_at:'2026-07-16T02:00:00Z'}],error:null};
    },
    storage:{from:()=>({createSignedUrl:async()=>({data:null,error:null})})}
  };
  window.supabase={createClient:()=>client};
})();`;

test('moderator reviews evidence and approves a pending parking zone', async ({ page }) => {
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.fulfill({status:200,contentType:'application/javascript',body:supabaseStub}));
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort());
  await page.goto('/moderation.html');

  await expect(page.locator('#login-gate')).toHaveClass(/hidden/);
  await expect(page.locator('#dashboard')).not.toHaveClass(/hidden/);
  await expect(page.locator('.proposal-card')).toHaveCount(1);
  await expect(page.locator('.proposal-card')).toContainText('Паркинг пред тестов обект');

  await page.locator('.proposal-card').click();
  await expect(page.locator('#detail')).toHaveClass(/active/);
  await expect(page.locator('#proposal-status')).toHaveText('Чака SoulFlame');
  await expect(page.locator('#proposal-capacity')).toHaveText('18');
  await expect(page.locator('#evidence')).toContainText('постоянен знак');
  await expect(page.locator('#history')).toContainText('Няма решение');
  await expect(page.locator('#proposal-map')).toBeVisible();

  await page.locator('#approve').click();
  await expect(page.locator('#action-notice')).toContainText('одобрена');
  await expect(page.locator('#history')).toContainText('Одобрено');

  const calls = await page.evaluate(() => window.__moderationCalls);
  expect(calls).toHaveLength(1);
  expect(calls[0].name).toBe('moderate_parking_proposal_auth');
  expect(calls[0].args.next_status).toBe('approved');
  expect(calls[0].args.proposal_id).toBe('11111111-1111-4111-8111-111111111111');
});
