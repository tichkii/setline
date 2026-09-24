// Readiness is confirmed by the worker serving this page, not inferred from connectivity.
// A fully downloaded waiting update cannot serve new assets until it activates.
export function prepareOffline(){
 if(!globalThis.navigator?.serviceWorker||typeof MessageChannel==='undefined')return Promise.resolve(false);
 return new Promise(resolve=>{
  const serviceWorker=navigator.serviceWorker,cleanups=[],watched=new Set(),pending=new Set();
  let registration,finished=false;
  const complete=ready=>{if(finished)return;finished=true;clearTimeout(deadline);for(const cleanup of cleanups)cleanup();resolve(ready)};
  const deadline=setTimeout(()=>complete(false),8000);
  const listen=(target,type,listener)=>{target.addEventListener(type,listener);cleanups.push(()=>target.removeEventListener(type,listener))};
  const probe=worker=>{
   if(!worker||finished||pending.has(worker)||!['activated','installed'].includes(worker.state))return;
   pending.add(worker);const channel=new MessageChannel();let closed=false;
   const close=()=>{if(closed)return;closed=true;clearTimeout(timer);channel.port1.close();channel.port2.close();pending.delete(worker)};
   const timer=setTimeout(close,1500);cleanups.push(close);
   channel.port1.onmessage=event=>{
    close();const status=event.data;
    const current=serviceWorker.controller||registration?.active;
    if(worker===current&&worker.state==='activated'&&status?.type==='SETLINE_OFFLINE_STATUS'&&status.ready===true&&typeof status.cache==='string'&&status.cache.startsWith('setline-'))complete(true);
   };
   try{worker.postMessage({type:'SETLINE_OFFLINE_STATUS'},[channel.port2])}catch{close()}
  };
  const inspect=()=>{
   if(finished)return;
   for(const worker of [serviceWorker.controller,registration?.active,registration?.waiting,registration?.installing]){
    if(!worker)continue;if(!watched.has(worker)){watched.add(worker);listen(worker,'statechange',inspect)}probe(worker);
   }
  };
  listen(serviceWorker,'controllerchange',inspect);
  try{Promise.resolve(serviceWorker.register('./sw.js',{updateViaCache:'none'})).then(result=>{
   if(finished)return;registration=result;listen(registration,'updatefound',inspect);inspect();
  }).catch(()=>{inspect();if(!serviceWorker.controller)complete(false)})}catch{inspect();if(!serviceWorker.controller)complete(false)}
  inspect();
 });
}
