import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {prepareOffline} from './dist/offline.mjs';

const source=fs.readFileSync(new URL('./dist/sw.js',import.meta.url),'utf8');
const cacheName=source.match(/const CACHE='([^']+)'/)[1];
function workerHarness({hostname='setline.example',installFails=false,networkFails=true,htmlScript=false,cacheFails=false}={}){
 const origin=`https://${hostname}`,handlers={},stores=new Map(),deleted=[],installRequests=[];let claimed=0,skipped=0;
 const key=value=>new URL(typeof value==='string'?value:value.url,origin+'/sw.js').href;
 const response=(path,body='cached')=>new Response(body,{headers:{'content-type':/\.m?js$/.test(key(path))?'application/javascript':/\.css$/.test(key(path))?'text/css':'text/html'}});
 const caches={open:async name=>{
  if(cacheFails)throw Error('Storage unavailable');
  if(!stores.has(name))stores.set(name,new Map());const data=stores.get(name);
  return {addAll:async assets=>{installRequests.push(...assets);if(installFails)throw Error('Offline');for(const asset of assets)data.set(key(asset),response(asset))},match:async request=>data.get(key(request))};
 },keys:async()=>[...stores.keys()],delete:async name=>{deleted.push(name);return stores.delete(name)}};
 const self={location:new URL(origin+'/sw.js'),addEventListener:(type,handler)=>handlers[type]=handler,skipWaiting:async()=>{skipped++},clients:{claim:async()=>{claimed++}}};
 vm.runInNewContext(source,{self,caches,URL,Request,Response,fetch:async request=>{if(networkFails)throw Error('Offline');return response(htmlScript?'index.html':request.url,'network')}});
 const message=async(type,{port=true}={})=>{let promise,reply;handlers.message({data:{type},ports:port?[{postMessage:data=>reply=data}]:[],waitUntil:p=>promise=p});await promise;return reply};
 return {stores,deleted,installRequests,key,message,get claimed(){return claimed},get skipped(){return skipped},async lifecycle(type){let promise;handlers[type]({waitUntil:p=>promise=p});await promise},async request(path,options={}){let promise;handlers.fetch({request:{url:key(path),method:'GET',mode:'cors',...options},respondWith:p=>promise=p});return promise?await promise:null},status:()=>message('SETLINE_OFFLINE_STATUS')};
}
test('worker caches every required asset and reports readiness only for its complete cache',async()=>{
 const h=workerHarness();await h.lifecycle('install');assert.equal(h.skipped,0);assert.equal((await h.status()).ready,true);assert.equal((await h.status()).cache,cacheName);
 for(const asset of ['boot.js','sharing.mjs','routine-sharing.mjs','share-card.mjs','offline.mjs','updates.mjs'])assert.ok(h.stores.get(cacheName).has(h.key(asset)),asset);
 h.stores.get(cacheName).delete(h.key('share-card.mjs'));assert.equal((await h.status()).ready,false);
});
test('installation bypasses stale HTTP cache for every asset without forcing activation, including on localhost',async()=>{
 const h=workerHarness({hostname:'localhost'});await h.lifecycle('install');assert.equal(h.skipped,0);assert.ok(h.installRequests.length>0);for(const request of h.installRequests){assert.ok(request instanceof Request);assert.equal(request.cache,'reload')}
});
test('explicit update activation waits for a complete cache and acknowledges the request',async()=>{
 const h=workerHarness();const incomplete=await h.message('SETLINE_ACTIVATE_UPDATE');assert.equal(incomplete.ready,false);assert.equal(h.skipped,0);
 await h.lifecycle('install');const complete=await h.message('SETLINE_ACTIVATE_UPDATE');assert.equal(complete.type,'SETLINE_ACTIVATE_UPDATE');assert.equal(complete.ready,true);assert.equal(complete.cache,cacheName);assert.equal(h.skipped,1);
});
test('update activation refuses a damaged or unavailable cache and ignores unrelated messages',async()=>{
 const h=workerHarness();await h.lifecycle('install');h.stores.get(cacheName).delete(h.key('app.js'));assert.equal((await h.message('SETLINE_ACTIVATE_UPDATE')).ready,false);assert.equal(await h.message('UNRELATED'),undefined);assert.equal(h.skipped,0);
 const unavailable=workerHarness({cacheFails:true});assert.equal((await unavailable.message('SETLINE_ACTIVATE_UPDATE')).ready,false);assert.equal(unavailable.skipped,0);
});
test('explicit update message also works without a reply port',async()=>{
 const h=workerHarness();await h.lifecycle('install');assert.equal(await h.message('SETLINE_ACTIVATE_UPDATE',{port:false}),undefined);assert.equal(h.skipped,1);
});
test('release versions are deterministic and change for worker-only or asset changes',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'setline-release-test-'));
 try{
  const assets=JSON.parse(source.match(/const ASSETS=(\[[^;]+\]);/)[1].replaceAll("'",'"'));
  for(const asset of assets.filter(name=>name!=='./')){const target=path.join(directory,'dist',asset);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'test asset '+asset)}
  const worker=path.join(directory,'dist','sw.js'),script=path.join(directory,'release.mjs');fs.writeFileSync(worker,source);fs.copyFileSync(new URL('./release.mjs',import.meta.url),script);
  const release=()=>{execFileSync(process.execPath,[script],{stdio:'pipe'});return fs.readFileSync(worker,'utf8').match(/const CACHE='([^']+)'/)[1]};
  const first=release();assert.equal(release(),first);
  fs.appendFileSync(worker,'\n// A worker-only release change.\n');const second=release();assert.notEqual(second,first);assert.equal(release(),second);
  fs.appendFileSync(path.join(directory,'dist','app.js'),'\nchanged asset');const third=release();assert.notEqual(third,second);assert.equal(release(),third);
 }finally{
  const resolved=path.resolve(directory),temporary=path.resolve(os.tmpdir());
  if(path.dirname(resolved)!==temporary||!path.basename(resolved).startsWith('setline-release-test-'))throw Error('Unexpected release test directory');
  fs.rmSync(resolved,{recursive:true,force:true});
 }
});
test('failed worker installation preserves the old offline app and unrelated caches',async()=>{
 const h=workerHarness({installFails:true});h.stores.set('setline-previous',new Map());h.stores.set('another-app',new Map());await assert.rejects(h.lifecycle('install'));assert.ok(h.stores.has('setline-previous'));assert.equal(h.claimed,0);assert.deepEqual(h.deleted,[]);
});
test('activation cleans old app caches only after complete installation',async()=>{
 const h=workerHarness();h.stores.set('setline-previous',new Map());h.stores.set('another-app',new Map());await h.lifecycle('activate');assert.deepEqual(h.deleted,[]);await h.lifecycle('install');await h.lifecycle('activate');assert.deepEqual(h.deleted,['setline-previous']);assert.ok(h.stores.has('another-app'));assert.equal(h.claimed,1);
});
test('offline navigation with query parameters falls back to shell; scripts never receive HTML fallback',async()=>{
 const h=workerHarness();await h.lifecycle('install');assert.equal(await (await h.request('/?shared=routine',{mode:'navigate'})).text(),'cached');assert.equal((await h.request('/missing.mjs')).type,'error');assert.equal(await h.request('/x',{method:'POST'}),null);assert.equal(await h.request('https://other.example/x'),null);
});
test('fetches stay scoped to worker cache and recover online when Cache Storage fails',async()=>{
 const h=workerHarness();h.stores.set('unrelated',new Map([[h.key('core.mjs'),new Response('wrong version')]]));assert.equal((await h.request('core.mjs')).type,'error');const available=workerHarness({cacheFails:true,networkFails:false});assert.equal(await (await available.request('app.js')).text(),'network');const fallback=workerHarness({networkFails:false,htmlScript:true});assert.equal((await fallback.request('missing.mjs')).type,'error');
});

class FakeChannel{
 constructor(){const a={closed:false,close(){this.closed=true}},b={closed:false,close(){this.closed=true}};a.postMessage=data=>queueMicrotask(()=>{if(!b.closed)b.onmessage?.({data})});b.postMessage=data=>queueMicrotask(()=>{if(!a.closed)a.onmessage?.({data})});this.port1=a;this.port2=b}
}
class FakeWorker extends EventTarget{
 constructor(state='activated',ready=true){super();this.state=state;this.ready=ready}
 postMessage(message,ports){assert.equal(message.type,'SETLINE_OFFLINE_STATUS');ports[0].postMessage({type:'SETLINE_OFFLINE_STATUS',cache:cacheName,ready:this.ready})}
}
function browserHarness(t,{active=new FakeWorker(),controller=active,waiting=null,register}={}){
 const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),originalChannel=Object.getOwnPropertyDescriptor(globalThis,'MessageChannel');
 const registration=Object.assign(new EventTarget(),{active,waiting,installing:null}),serviceWorker=Object.assign(new EventTarget(),{controller,register:register||(()=>Promise.resolve(registration))});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker,onLine:false}});Object.defineProperty(globalThis,'MessageChannel',{configurable:true,value:FakeChannel});
 t.after(()=>{if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);else delete globalThis.navigator;if(originalChannel)Object.defineProperty(globalThis,'MessageChannel',originalChannel);else delete globalThis.MessageChannel});return {registration,serviceWorker};
}
test('offline readiness confirms active worker cache even while browser is offline',async t=>{browserHarness(t);assert.equal(await prepareOffline(),true)});
test('offline readiness deadline covers a registration that never settles',async t=>{browserHarness(t,{active:null,controller:null,register:()=>new Promise(()=>{})});t.mock.timers.enable({apis:['setTimeout']});const ready=prepareOffline();t.mock.timers.tick(8000);assert.equal(await ready,false)});
test('waiting cache alone does not claim the current app works offline',async t=>{
 browserHarness(t,{active:new FakeWorker('activated',false),waiting:new FakeWorker('installed',true)});t.mock.timers.enable({apis:['setTimeout']});const ready=prepareOffline();await Promise.resolve();await Promise.resolve();t.mock.timers.tick(8000);assert.equal(await ready,false);
});
test('offline readiness succeeds when an installed first worker activates',async t=>{
 const worker=new FakeWorker('installing'),h=browserHarness(t,{active:null,controller:null});h.registration.installing=worker;const ready=prepareOffline();await Promise.resolve();worker.state='activated';h.registration.active=worker;h.registration.installing=null;h.serviceWorker.controller=worker;worker.dispatchEvent(new Event('statechange'));assert.equal(await ready,true);
});
