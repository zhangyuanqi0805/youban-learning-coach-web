const upstreamOrigin = 'https://youban-student-relay-candidate.yuanqi0805.workers.dev';
const methods = new Set(['GET', 'HEAD', 'POST', 'PUT']);
const apiPath = /^\/api\/(?:auth\/(?:status|local\/(?:login|register)|logout)|profile|pilot\/v1\/(?:jobs(?:\/[0-9a-f-]{36})?|history|mistakes(?:\/retest)?|exams\/[0-9a-f-]{36}(?:\/submit)?|attempts\/[0-9a-f-]{36}\/report|files\/[0-9a-f-]{36}\/(?:confirm|source)|vision\/(?:jobs|sources|files\/[0-9a-f-]{36}\/confirm))|learning\/library\/(?:courses(?:\/[0-9a-f-]{36}(?:\/files)?)?|files\/[0-9a-f-]{36}\/(?:original|prepare|retry)))$/i;
const json = (status, error) => new Response(JSON.stringify({error, message: error === 'invalid_origin' ? '请从当前有伴页面操作。' : '这个请求不在测试范围内。'}), {status, headers: {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (!methods.has(request.method) || !apiPath.test(url.pathname)) return json(404, 'not_found');
      if (!['GET','HEAD'].includes(request.method) && request.headers.get('Origin') !== url.origin) return json(403, 'invalid_origin');
      const target = new URL(url.pathname + url.search, upstreamOrigin);
      const headers = new Headers();
      for (const key of ['accept','content-type','cookie','x-csrf-token','x-file-name']) {
        const value = request.headers.get(key);
        if (value !== null) headers.set(key, value);
      }
      if (!['GET','HEAD'].includes(request.method)) headers.set('Origin', upstreamOrigin);
      const forwarded = new Request(target, {method:request.method, headers, body:['GET','HEAD'].includes(request.method)?undefined:request.body, redirect:'manual'});
      let response;
      try { response = await env.STUDENT_RELAY.fetch(forwarded); }
      catch { return new Response(JSON.stringify({error:'backend_unavailable',message:'这台 Mac 暂时无法连接。已有资料仍保存在原处，请稍后刷新状态。'}), {status:503, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}}); }
      const out = new Headers(response.headers);
      out.set('cache-control','no-store');
      out.set('x-content-type-options','nosniff');
      out.delete('access-control-allow-origin');
      return new Response(response.body,{status:response.status,headers:out});
    }
    const asset = await env.ASSETS.fetch(request);
    const out = new Headers(asset.headers);
    out.set('cache-control','no-store');
    out.set('x-content-type-options','nosniff');
    out.set('referrer-policy','strict-origin-when-cross-origin');
    out.set('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    return new Response(asset.body,{status:asset.status,headers:out});
  }
};
