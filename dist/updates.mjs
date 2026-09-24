// Updates are downloaded in the background, but a page reload always follows an
// explicit choice and a successful save. Other open tabs make their own choice.
export function createUpdates({onChange=()=>{},beforeApply=async()=>true,reload=()=>globalThis.location?.reload(),env={}}={}){
 const nav=env.navigator??globalThis.navigator,win=env.window??globalThis.window,doc=env.document??globalThis.document;
 const schedule=env.setTimeout??globalThis.setTimeout,cancel=env.clearTimeout??globalThis.clearTimeout,now=env.now??Date.now;
 const checkTimeout=env.checkTimeout??8000,activationTimeout=env.activationTimeout??10000,interval=env.checkInterval??60000;
 const serviceWorker=nav?.serviceWorker,watched=new Set(),settlers=new Set();
 let registration,waiting=null,installingWorker=null,installationFailures=0,previousController=serviceWorker?.controller||null,refreshNeeded=false;
 let started=false,listening=false,lastCheck=-Infinity,checkPromise=null,checking=false,applying=false,approved=false,reloaded=false,activationTarget=null,finishActivation=null;
 let state={status:serviceWorker?'current':'unsupported',ready:false,busy:false,message:serviceWorker?'':'App updates are not supported in this browser.'};
 const getState=()=>({...state});
 const publish=changes=>{const next={...state,...changes};if(Object.keys(next).some(key=>next[key]!==state[key])){state=next;onChange(getState())}};
 const online=()=>nav?.onLine!==false;
 const isWaiting=worker=>Boolean(worker&&worker.state==='installed');
 const isInstalling=worker=>Boolean(worker&&['installing','installed','activating'].includes(worker.state));
 const ready=()=>refreshNeeded||isWaiting(waiting);
 const baseMessage=()=>refreshNeeded?'A new version is ready. Save and refresh to use it.':'A new version is ready. Your workout will be saved before updating.';
 const downloading=()=>!ready()&&isInstalling(registration?.installing||installingWorker);
 const showResting=(message='')=>publish({status:ready()?'ready':downloading()?'checking':online()?'current':'offline',ready:ready(),busy:checking||applying||downloading(),message:message||(ready()?baseMessage():downloading()?'Downloading an update…':online()?'Setline is up to date.':'You are offline. Updates will be checked when you reconnect.')});
 const timed=(promise,delay)=>new Promise((resolve,reject)=>{const timer=schedule(()=>reject(Error('timeout')),Math.max(0,delay));Promise.resolve(promise).then(value=>{cancel(timer);resolve(value)},error=>{cancel(timer);reject(error)})});
 const doReload=()=>{if(reloaded)return;reloaded=true;reload()};
 function inspect(){
  if(registration?.installing)installingWorker=registration.installing;
  if(registration?.waiting&&isWaiting(registration.waiting)&&(serviceWorker.controller||registration.active&&registration.active!==registration.waiting))waiting=registration.waiting;
  if(waiting&&!isWaiting(waiting))waiting=null;
  for(const worker of [registration?.installing,registration?.waiting,registration?.active]){
   if(!worker||watched.has(worker))continue;
   watched.add(worker);
   worker.addEventListener('statechange',()=>{
    if(worker===installingWorker&&worker.state==='redundant')installationFailures++;
    if(worker.state==='installed'&&(serviceWorker.controller||registration?.active&&registration.active!==worker))waiting=worker;
    inspect();
   });
  }
  if(ready())publish({status:'ready',ready:true,busy:checking||applying,message:baseMessage()});
  else if(downloading())publish({status:'checking',ready:false,busy:true,message:'Downloading an update…'});
  else if(!checking&&!applying&&(state.ready||state.status==='checking'))showResting();
  for(const settle of settlers)settle();
 }
 function listen(){
  if(listening||!serviceWorker)return;listening=true;
  serviceWorker.addEventListener('controllerchange',()=>{
   const current=serviceWorker.controller;
   if(current&&(previousController&&current!==previousController||applying&&current===activationTarget))refreshNeeded=true;
   previousController=current;
   inspect();
   if(applying&&approved&&refreshNeeded)finishActivation?.(true);
  });
 }
 function observe(result){
  if(registration!==result){registration=result;registration.addEventListener('updatefound',inspect)}
  // A newly opened page may not yet be controlled, even though an older worker
  // already serves this installation. Its replacement still needs a refresh.
  if(!previousController&&registration.active)previousController=registration.active;
  inspect();
 }
 function waitForInstall(){
  const pending=downloading;
  if(!pending())return {promise:Promise.resolve(),cancel:()=>{}};
  let cleanup=()=>{};
  const promise=new Promise((resolve,reject)=>{
   const worker=registration.installing||installingWorker;
   const settle=()=>{if(worker.state==='redundant'){settlers.delete(settle);reject(Error('install failed'))}else if(!pending()){settlers.delete(settle);resolve()}};
   cleanup=()=>settlers.delete(settle);
   settlers.add(settle);settle();
  });
  return {promise,cancel:()=>cleanup()};
 }
 async function runCheck(){
  checking=true;lastCheck=now();publish({status:'checking',busy:true,message:'Checking for updates…'});
  const deadline=now()+checkTimeout,failuresAtStart=installationFailures;
  try{
   if(!registration){
    // getRegistration is local and can discover a downloaded update while offline.
    const result=!online()&&serviceWorker.getRegistration?await timed(serviceWorker.getRegistration('./'),deadline-now()):await timed(serviceWorker.register('./sw.js',{updateViaCache:'none'}),deadline-now());
    if(result)observe(result);
   }
   inspect();
   if(ready())return 'ready';
   if(!online())return 'offline';
   if(!registration)observe(await timed(serviceWorker.register('./sw.js',{updateViaCache:'none'}),deadline-now()));
   await timed(registration.update(),deadline-now());
   inspect();
   const installation=waitForInstall();
   try{await timed(installation.promise,deadline-now())}finally{installation.cancel()}
   if(installationFailures!==failuresAtStart)throw Error('install failed');
   return ready()?'ready':'current';
  }catch(error){
   if(ready())return 'ready';
   publish({status:online()?'error':'offline',message:online()?(error?.message==='timeout'?'The update check took too long. Keep using Setline and try again.':'Could not check for updates. Keep using Setline and try again.'):'You are offline. Updates will be checked when you reconnect.'});
   return state.status;
  }finally{
   checking=false;
   if(ready())showResting();
   else if(state.status==='checking')showResting();
   else publish({busy:applying,ready:ready()});
  }
 }
 function check({force=false}={}){
  if(!serviceWorker)return Promise.resolve('unsupported');
  listen();inspect();
  if(applying)return Promise.resolve(state.status);
  if(checkPromise)return checkPromise;
  if(!force&&now()-lastCheck<interval)return Promise.resolve(state.status);
  checkPromise=runCheck().finally(()=>{checkPromise=null});
  return checkPromise;
 }
 async function apply(){
  listen();inspect();
  if(!ready()||checking||applying||reloaded)return false;
  applying=true;approved=false;activationTarget=waiting;publish({busy:true,message:'Saving your workout before updating…'});
  try{
   if(await beforeApply()!==true){showResting();return false}
   approved=true;
   if(refreshNeeded){doReload();return true}
   if(!isWaiting(waiting)){showResting('The update is no longer waiting. Check for updates again.');return false}
   activationTarget=waiting;
   publish({message:'Applying update…'});
   const activated=await new Promise(resolve=>{
    let timer;
    finishActivation=result=>{cancel(timer);finishActivation=null;resolve(result)};
    timer=schedule(()=>finishActivation?.(false),activationTimeout);
    try{waiting.postMessage({type:'SETLINE_ACTIVATE_UPDATE'})}catch{finishActivation?.(false)}
   });
   if(!activated){publish({message:'The update could not finish. Your workout is saved; try updating again.'});return false}
   doReload();return true;
  }catch{
   publish({message:'Could not save your latest changes. Please try again before updating.'});return false;
  }finally{
   applying=false;approved=false;activationTarget=null;
   publish({status:ready()?'ready':online()?'current':'offline',ready:ready(),busy:false});
  }
 }
 function start(){
  if(started)return;started=true;listen();
  win?.addEventListener('online',()=>void check({force:state.status==='offline'}));
  doc?.addEventListener('visibilitychange',()=>{if(!doc.hidden)void check()});
  void check();
 }
 return {check,apply,getState,start};
}
