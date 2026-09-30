import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';

const site='https://youban-coach-web-candidate.yuanqi0805.workers.dev';
function env(onRelay){return {ASSETS:{fetch:async()=>new Response('<h1>有伴</h1>',{headers:{'content-type':'text/html'}})},STUDENT_RELAY:{fetch:onRelay}};}

test('forwards only scoped student APIs with session and rewritten origin',async()=>{
  let seen;
  const binding=env(async request=>{seen=request;return new Response(JSON.stringify({authenticated:true}),{headers:{'content-type':'application/json','set-cookie':'sid=test; HttpOnly; Secure'}});});
  const response=await worker.fetch(new Request(site+'/api/auth/local/login',{method:'POST',headers:{Origin:site,Cookie:'sid=test','content-type':'application/json'}}),binding);
  assert.equal(response.status,200);
  assert.equal(new URL(seen.url).origin,'https://youban-student-relay-candidate.yuanqi0805.workers.dev');
  assert.equal(seen.headers.get('origin'),'https://youban-student-relay-candidate.yuanqi0805.workers.dev');
  assert.equal(seen.headers.get('cookie'),'sid=test');
  assert.match(response.headers.get('set-cookie'),/HttpOnly/);
});

test('rejects cross-site writes and admin route before relay',async()=>{
  let calls=0;const binding=env(async()=>{calls++;return new Response('unexpected');});
  const wrong=await worker.fetch(new Request(site+'/api/auth/local/login',{method:'POST',headers:{Origin:'https://example.org'},body:'{}'}),binding);
  const admin=await worker.fetch(new Request(site+'/api/admin/overview'),binding);
  assert.equal(wrong.status,403);assert.equal(admin.status,404);assert.equal(calls,0);
});

test('static page sets security headers',async()=>{
  const response=await worker.fetch(new Request(site+'/'),env(async()=>new Response('unexpected')));
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
});
