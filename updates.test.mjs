import test from 'node:test';
import assert from 'node:assert/strict';
import {createUpdates} from './dist/updates.mjs';

const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve()};
class Worker extends EventTarget{
 constructor(state='activated'){super();this.state=state;this.messages=[]}
 postMessage(message){this.messages.push(message);this.onPost?.(message)}
 change(state){this.state=state;this.dispatchEvent(new Event('statechange'))}
}
function harness({controller=new Worker(),waiting=null,online=true,register,update,beforeApply,reload}={}){
 let time=0,nextTimer=0,reloads=0,registrations=0,checks=0;
 const timers=new Map(),changes=[],window=new EventTarget(),document=Object.assign(new EventTarget(),{hidden:false});
 const registration=Object.assign(new EventTarget(),{active:controller,waiting,installing:null,update:async()=>{checks++;return update?update():registration}});
 const serviceWorker=Object.assign(new EventTarget(),{controller,register:async(path,options)=>{registrations++;assert.equal(path,'./sw.js');assert.deepEqual(options,{updateViaCache:'none'});return register?register():registration},getRegistration:async()=>registration});
 const navigator={serviceWorker,onLine:online};
 const env={navigator,window,document,now:()=>time,setTimeout:(callback,delay)=>{const id=++nextTimer;timers.set(id,{callback,due:time+delay});return id},clearTimeout:id=>timers.delete(id)};
 const manager=createUpdates({env,onChange:value=>changes.push(value),beforeApply,reload:()=>{reloads++;reload?.()}});
 const advance=ms=>{time+=ms;for(const [id,timer] of [...timers])if(timer.due<=time){timers.delete(id);timer.callback()}};
 const activate=worker=>{registration.waiting=null;registration.installing=null;registration.active=worker;worker.change('activated');serviceWorker.controller=worker;serviceWorker.dispatchEvent(new Event('controllerchange'))};
 return {manager,changes,registration,serviceWorker,navigator,window,document,advance,activate,get reloads(){return reloads},get checks(){return checks},get registrations(){return registrations}};
}

test('an already downloaded update waits for a successful save, then reloads exactly once',async()=>{
 const worker=new Worker('installed');let saved=false;
 const h=harness({waiting:worker,beforeApply:async()=>{saved=true;assert.equal(worker.messages.length,0);return true}});
 worker.onPost=message=>{assert.equal(saved,true);assert.equal(message.type,'SETLINE_ACTIVATE_UPDATE');h.activate(worker)};
 assert.equal(await h.manager.check(),'ready');assert.equal(h.manager.getState().busy,false);
 assert.equal(await h.manager.apply(),true);assert.equal(h.reloads,1);
 h.serviceWorker.dispatchEvent(new Event('controllerchange'));assert.equal(h.reloads,1);assert.equal(await h.manager.apply(),false);
});

test('declining or failing the save leaves the update available and closes the busy state',async()=>{
 for(const beforeApply of [async()=>false,async()=>{throw Error('disk full')}]){
  const worker=new Worker('installed'),h=harness({waiting:worker,beforeApply});await h.manager.check();
  assert.equal(await h.manager.apply(),false);assert.equal(worker.messages.length,0);assert.equal(h.reloads,0);
  assert.equal(h.manager.getState().ready,true);assert.equal(h.manager.getState().busy,false);assert.doesNotMatch(h.manager.getState().message,/Saving your/);
 }
});

test('first installation never prompts or reloads the newly controlled page',async()=>{
 const h=harness({controller:null});await h.manager.check();const worker=new Worker('installing');
 h.registration.installing=worker;h.registration.dispatchEvent(new Event('updatefound'));
 assert.equal(h.manager.getState().status,'checking');assert.equal(h.manager.getState().ready,false);
 h.registration.waiting=worker;h.registration.installing=null;worker.change('installed');
 assert.equal(h.manager.getState().ready,false);assert.equal(h.reloads,0);
 h.activate(worker);assert.equal(h.manager.getState().ready,false);assert.equal(h.manager.getState().busy,false);assert.equal(h.reloads,0);
});

test('an update applied in another tab offers a refresh and still saves before reloading',async()=>{
 let saved=0;const h=harness({beforeApply:async()=>{saved++;return true}});await h.manager.check();
 h.activate(new Worker());assert.equal(h.reloads,0);assert.equal(h.manager.getState().ready,true);
 assert.equal(await h.manager.apply(),true);assert.equal(saved,1);assert.equal(h.reloads,1);
});

test('an update in another tab during a pending save cannot reload before approval',async()=>{
 let resolveSave;const waiting=new Worker('installed'),h=harness({waiting,beforeApply:()=>new Promise(resolve=>resolveSave=resolve)});
 await h.manager.check();const applying=h.manager.apply();h.activate(waiting);assert.equal(h.reloads,0);
 resolveSave(false);assert.equal(await applying,false);assert.equal(h.reloads,0);assert.equal(h.manager.getState().ready,true);
});

test('offline users can apply an already downloaded update',async()=>{
 const waiting=new Worker('installed'),h=harness({waiting,online:false});waiting.onPost=()=>h.activate(waiting);
 assert.equal(await h.manager.check(),'ready');assert.equal(h.checks,0);assert.equal(h.registrations,0);
 assert.equal(await h.manager.apply(),true);assert.equal(h.reloads,1);
});

test('an initially uncontrolled page can explicitly activate a waiting replacement',async()=>{
 const waiting=new Worker('installed'),h=harness({controller:null,waiting});h.registration.active=new Worker();
 waiting.onPost=()=>h.activate(waiting);assert.equal(await h.manager.check(),'ready');
 assert.equal(await h.manager.apply(),true);assert.equal(h.reloads,1);assert.equal(h.manager.getState().busy,false);
});

test('an initially uncontrolled page notices another tab replacing its existing worker',async()=>{
 const waiting=new Worker('installed'),h=harness({controller:null,waiting});h.registration.active=new Worker();await h.manager.check();
 h.activate(waiting);assert.equal(h.reloads,0);assert.equal(h.manager.getState().ready,true);
 assert.equal(await h.manager.apply(),true);assert.equal(h.reloads,1);
});

test('a failed activation is bounded and the same update can be retried',async()=>{
 const waiting=new Worker('installed'),h=harness({waiting});await h.manager.check();
 const first=h.manager.apply();await flush();h.advance(10000);assert.equal(await first,false);
 assert.equal(h.manager.getState().ready,true);assert.equal(h.manager.getState().busy,false);assert.match(h.manager.getState().message,/try updating again/);
 waiting.onPost=()=>h.activate(waiting);assert.equal(await h.manager.apply(),true);assert.equal(h.reloads,1);
});

test('hanging registration and update calls time out without blocking later checks',async()=>{
 for(const kind of ['register','update']){
  let stuck=true;const options={[kind]:()=>stuck?new Promise(()=>{}):kind==='register'?h.registration:undefined};
  const h=harness(options),checking=h.manager.check();await flush();h.advance(8000);
  assert.equal(await checking,'error');assert.equal(h.manager.getState().busy,false);assert.match(h.manager.getState().message,/too long/);
  stuck=false;assert.equal(await h.manager.check({force:true}),'current');
 }
});

test('a successful network check waits for the new worker to finish installing',async()=>{
 const worker=new Worker('installing'),h=harness({update:()=>{h.registration.installing=worker;h.registration.dispatchEvent(new Event('updatefound'))}});
 const checking=h.manager.check();await flush();assert.equal(h.manager.getState().status,'checking');assert.equal(h.manager.getState().busy,true);
 h.registration.waiting=worker;h.registration.installing=null;worker.change('installed');
 assert.equal(await checking,'ready');assert.equal(h.manager.getState().busy,false);assert.equal(h.reloads,0);
});

test('a timed-out installation can finish later and offer a working retry',async()=>{
 const worker=new Worker('installing');let begin=true;
 const h=harness({update:()=>{if(begin){h.registration.installing=worker;h.registration.dispatchEvent(new Event('updatefound'));begin=false}}});
 const checking=h.manager.check();await flush();h.advance(8000);assert.equal(await checking,'error');assert.equal(h.manager.getState().busy,false);
 h.registration.waiting=worker;h.registration.installing=null;worker.change('installed');assert.equal(h.manager.getState().ready,true);
 worker.onPost=()=>h.activate(worker);assert.equal(await h.manager.apply(),true);assert.equal(h.reloads,1);
});

test('a failed replacement installation reports failure and keeps the current app',async()=>{
 const worker=new Worker('installing'),h=harness({update:()=>{h.registration.installing=worker;h.registration.dispatchEvent(new Event('updatefound'))}});
 const checking=h.manager.check();await flush();h.registration.installing=null;worker.change('redundant');
 assert.equal(await checking,'error');assert.equal(h.manager.getState().ready,false);assert.equal(h.manager.getState().busy,false);assert.equal(h.reloads,0);
});

test('automatic checks are throttled; foreground and reconnect resume checking',async()=>{
 const h=harness();h.manager.start();await flush();assert.equal(h.checks,1);
 h.document.dispatchEvent(new Event('visibilitychange'));await flush();assert.equal(h.checks,1);
 h.advance(60000);h.document.dispatchEvent(new Event('visibilitychange'));await flush();assert.equal(h.checks,2);
 h.navigator.onLine=false;assert.equal(await h.manager.check({force:true}),'offline');
 h.navigator.onLine=true;h.window.dispatchEvent(new Event('online'));await flush();assert.equal(h.checks,3);
 h.manager.start();await flush();assert.equal(h.checks,3);
});

test('unsupported browsers keep working and returned snapshots cannot mutate state',async()=>{
 const manager=createUpdates({env:{navigator:{}}});assert.equal(await manager.check(),'unsupported');assert.equal(await manager.apply(),false);
 const state=manager.getState();state.ready=true;assert.equal(manager.getState().ready,false);
});
