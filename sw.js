/* Sempre a REDE primeiro: a versão publicada aparece na próxima abertura.
   A cópia guardada só entra sem internet. (Antes era o contrário -- abria a
   cópia guardada e a versão nova não chegava -- e a lista apontava para uma
   pasta icons/ que não existe, então este arquivo nem chegava a instalar.)
   Mudou o app? Suba o número do CACHE. */
const CACHE='minhas-contas-v4';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.all(ASSETS.map(a=>c.add(a).catch(()=>{})))));self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET'||new URL(req.url).origin!==location.origin)return;
  e.respondWith(fetch(req.url,{cache:'no-cache',credentials:'same-origin'}).then(res=>{
    if(res&&res.ok){const cp=res.clone();caches.open(CACHE).then(c=>c.put(req,cp));}
    return res;
  }).catch(()=>caches.match(req).then(r=>r||caches.match('./index.html'))));
});
