const CACHE='setline-6c792df3983c';
const ASSETS=['./','./index.html','./styles.css','./base.css','./boot.js','./app.js','./core.mjs','./views.mjs','./sharing.mjs','./routine-sharing.mjs','./share-card.mjs','./offline.mjs','./favicon.svg','./manifest.webmanifest','./icon-192.png','./icon-512.png','./preferences.mjs','./routines.mjs','./fonts/space-grotesk-latin-variable.woff2','./fonts/manrope-latin-variable.woff2'];
const isCode=path=>/\.(?:m?js|css)$/.test(new URL(path,self.location.href).pathname);
const usable=(response,path)=>Boolean(response&&response.ok&&(!isCode(path)||!response.headers.get('content-type')?.includes('text/html')));
async function cacheComplete(){const cache=await caches.open(CACHE);const results=await Promise.all(ASSETS.map(async path=>usable(await cache.match(path),path)));return results.every(Boolean)}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);await cache.addAll(ASSETS);
 if(!await cacheComplete())throw Error('The complete Setline app could not be saved for offline use.');
 if(self.location.hostname==='127.0.0.1'||self.location.hostname==='localhost')await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 // A failed installation leaves the previous worker and its cache available.
 if(!await cacheComplete())return;
 const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('setline-')&&k!==CACHE).map(k=>caches.delete(k)));
 await self.clients.claim();
})()));
self.addEventListener('message',event=>{
 if(event.data?.type!=='SETLINE_OFFLINE_STATUS'||!event.ports?.[0])return;
 event.waitUntil(cacheComplete().then(ready=>event.ports[0].postMessage({type:'SETLINE_OFFLINE_STATUS',cache:CACHE,ready})).catch(()=>event.ports[0].postMessage({type:'SETLINE_OFFLINE_STATUS',cache:CACHE,ready:false})));
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith((async()=>{
  let cache;try{cache=await caches.open(CACHE);const hit=await cache.match(event.request);if(usable(hit,event.request.url))return hit}catch{}
  try{const response=await fetch(event.request);return isCode(event.request.url)&&response.headers.get('content-type')?.includes('text/html')?Response.error():response}
  catch{try{if(event.request.mode==='navigate'&&cache)return(await cache.match('./'))||Response.error()}catch{}return Response.error()}
 })());
});
