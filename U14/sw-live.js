/* ASM70 Live Stats shell cache v1. Only same-origin static app assets, never Supabase APIs. */
const CACHE='asm70-u14-live-v20261107-2';
const SHELL=[
  './live.html',
  './live.css',
  './live-v2.css?v=20261102-cloud-1',
  './live-v2.js?v=20261101-final-report-1',
  './live-quick.js?v=20261101-final-report-1',
  './live-cloud.js?v=20261107-cloud-2'
];
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.allSettled(SHELL.map(async uri=>{
      const req=new Request(new URL(uri,self.registration.scope),{cache:'reload'});
      const response=await fetch(req);
      if(response.ok)await cache.put(req,response);
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('asm70-u14-live-')&&k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  const staticNames=['live.html','live.css','live-v2.css','live-v2.js','live-quick.js','live-cloud.js'];
  if(!staticNames.some(n=>url.pathname.endsWith('/U14/'+n)))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try{
      const res=await fetch(req);
      if(res.ok)await cache.put(req,res.clone());
      return res;
    }catch(e){
      const cached=await cache.match(req,{ignoreSearch:true});
      if(cached)return cached;
      throw e;
    }
  })());
});
