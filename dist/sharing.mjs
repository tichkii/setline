import {workingSets,volume,toDisplay,localDay} from './core.mjs';
import {esc,num,longdate,duration} from './views.mjs';
import {createRoutineBundle,validateRoutineBundle,MAX_ROUTINE_SHARE_BYTES} from './routine-sharing.mjs';
import {renderShareCard} from './share-card.mjs';

const $=selector=>document.querySelector(selector);
const colors={lime:'#c3f078',blue:'#a6c5ff',rose:'#f6afc6',amber:'#f1c778'};
const filename=value=>String(value).normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'setline';
export function saveFile(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function shareable(file){try{return Boolean(file&&navigator.share&&navigator.canShare?.({files:[file]}))}catch{return false}}
function makeFile(parts,name,type){try{return new File(parts,name,{type})}catch{return null}}

export function createSharing({getState,openModal,toast,importBundle}){
  const modal=$('#modal');
  let previewUrl=null,generation=0,importing=false;
  const cleanup=()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null};
  const begin=()=>{generation++;cleanup();return generation};
  const current=(token,node)=>token===generation&&modal.open&&node.isConnected;
  // A close event is queued: an earlier dialog may already have reopened by delivery.
  modal.addEventListener('close',()=>{if(!modal.open){generation++;cleanup()}});
  function textControls(text,token){
    const textarea=modal.querySelector('#share-text'),copy=modal.querySelector('#copy-share'),send=modal.querySelector('#send-text');
    const active=()=>current(token,textarea);
    const manual=message=>{if(!active())return;textarea.closest('details').open=true;textarea.focus();textarea.select();textarea.setSelectionRange(0,textarea.value.length);toast(message)};
    textarea.value=text;
    copy.onclick=async()=>{
      if(!active())return;
      try{await navigator.clipboard.writeText(text);if(active())toast('Copied. Paste it wherever you like.')}
      catch{manual('Select and copy the text below.')}
    };
    send.onclick=async()=>{
      if(!active())return;
      if(!navigator.share){manual('Copy the text below, or save it for later.');return}
      try{await navigator.share({title:'Setline',text})}catch(e){if(e.name!=='AbortError')manual('Sharing is unavailable. Copy the text below or save a file instead.')}
    };
    return {copy,send};
  }
  const textArea=label=>`<details class="share-text-details"><summary>${label}</summary><textarea id="share-text" readonly rows="8" aria-label="${label}"></textarea></details><div class="share-actions"><button class="secondary" id="send-text">Share text</button><button class="secondary" id="copy-share">Copy text</button></div>`;
  async function card(model,text,name){
    const token=begin();
    openModal(model.kind==='workout'?'Share workout':'Share your progress',`<p class="help">Made on your device, even offline. Save now and send later if you have no connection. Session notes are not included.</p><div id="share-preview" class="share-preview" role="status">Creating your card…</div><div class="share-actions"><button class="primary" id="send-card" disabled>Share image</button><button class="secondary" id="save-card" disabled>Save image</button></div><p class="help" id="share-file-help"></p>${textArea('Workout summary')}`);
    textControls(text,token);
    const target=modal.querySelector('#share-preview'),send=modal.querySelector('#send-card'),save=modal.querySelector('#save-card'),help=modal.querySelector('#share-file-help');
    const active=()=>current(token,target);
    try{
      const blob=await renderShareCard(model);
      if(!active())return;
      previewUrl=URL.createObjectURL(blob);
      const img=document.createElement('img');img.src=previewUrl;img.alt=`${model.title}. ${model.metrics.map(m=>m.value+' '+m.label).join('. ')}`;
      target.replaceChildren(img);target.removeAttribute('role');
      const file=makeFile([blob],name,'image/png'),canShare=shareable(file);
      send.disabled=!canShare;
      save.disabled=false;
      save.onclick=()=>{if(!active())return;saveFile(blob,name);toast('Image download started. Keep it in Files or Photos.')};
      help.textContent=`PNG · ${Math.ceil(blob.size/1024)} KB. ${canShare?'Choose an app or save to your device.':'Use Save image, or touch and hold the preview to save it.'}`;
      send.onclick=async()=>{if(!active()||!canShare)return;try{await navigator.share({files:[file],title:model.title})}catch(e){if(active()&&e.name!=='AbortError')toast('Could not open sharing. Save the image or copy the summary instead.')}};
    }catch{
      if(!active())return;
      target.textContent='The image could not be created on this browser. You can still share or copy the full summary below.';
    }
  }
  function workout(id){
    const state=getState(),w=state.workouts.find(w=>w.id===id);if(!w)return;
    const unit=state.settings.unit,weight=n=>`${num(toDisplay(n,unit))} ${unit}`;
    const exercises=w.entries.map(e=>({name:state.exercises.find(x=>x.id===e.exerciseId)?.name||'Exercise',entry:e}));
    const text=[w.name,longdate(w.started),`${duration(w)} min · ${workingSets(w).length} working sets · ${weight(volume(w))} volume`,w.rating?`Workout rating: ${w.rating}/5`:null,...exercises.map(({name,entry:e})=>`${name}${e.group?' (superset)':''}\n${e.sets.filter(s=>s.done).map(s=>`  ${weight(s.weight)} × ${s.reps}${s.type==='normal'?'':` · ${s.type}`}`).join('\n')}`),'Logged with Setline'].filter(Boolean).join('\n\n');
    const rows=exercises.slice(0,6).map(({name,entry:e})=>({label:name,value:e.sets.filter(s=>s.done).map(s=>`${num(toDisplay(s.weight,unit))} × ${s.reps}${s.type==='warmup'?' W':s.type==='drop'?' D':''}`).join(' / ')}));
    return card({kind:'workout',title:w.name,subtitle:longdate(w.started),metrics:[{label:'minutes trained',value:String(duration(w))},{label:'working sets',value:String(workingSets(w).length)},{label:`volume · ${unit}`,value:num(toDisplay(volume(w),unit))},{label:'workout rating',value:w.rating?`${w.rating}/5`:'—'}],rows,accent:colors[state.settings.accent],footer:`Weights in ${unit} · W warmup / D drop${exercises.length>6?` · +${exercises.length-6} more exercises`:''}`},text,filename(w.name)+'-'+localDay(w.started)+'.png');
  }
  function stats(period){
    const state=getState(),cutoff=period?Date.now()-period*864e5:0,ws=state.workouts.filter(w=>Date.parse(w.started)>=cutoff),unit=state.settings.unit;
    const total=ws.reduce((n,w)=>n+volume(w),0),sets=ws.reduce((n,w)=>n+workingSets(w).length,0),minutes=ws.reduce((n,w)=>n+duration(w),0),days=new Set(ws.map(w=>localDay(w.started))).size;
    const groups=new Map();for(const w of ws)for(const e of w.entries){const muscle=state.exercises.find(x=>x.id===e.exerciseId)?.muscle||'Other',count=workingSets({entries:[e]}).length;groups.set(muscle,(groups.get(muscle)||0)+count)}
    const rows=[...groups].filter(([,n])=>n).sort((a,b)=>b[1]-a[1]).map(([label,n])=>({label,value:`${n} working sets`}));
    const subtitle=period?`Last ${period} days`:'All time';
    const text=[`My training · ${subtitle}`,`${ws.length} sessions across ${days} training days`,`${minutes} minutes · ${sets} working sets`,`${num(toDisplay(total,unit))} ${unit} total volume`,...rows.map(r=>`${r.label}: ${r.value}`),'Logged with Setline'].join('\n');
    return card({kind:'stats',title:'The work adds up.',subtitle,metrics:[{label:'sessions',value:String(ws.length)},{label:'minutes trained',value:String(minutes)},{label:'working sets',value:String(sets)},{label:`volume · ${unit}`,value:num(toDisplay(total,unit))}],rows:rows.slice(0,6),accent:colors[state.settings.accent],footer:`${days} training days${rows.length>6?` · +${rows.length-6} more muscle groups`:''}`},text,'setline-progress-'+localDay()+'.png');
  }
  function routines(ids){
    const state=getState(),bundle=createRoutineBundle(state,ids),json=JSON.stringify(bundle),count=bundle.routines.length,token=begin();
    const name=count===1?filename(bundle.routines[0].name):'setline-routines';
    const blob=new Blob([json],{type:'application/json'}),file=makeFile([json],name+'.setline.txt','text/plain'),canShare=shareable(file);
    openModal(count===1?'Share routine':'Share all routines',`<p class="help">${count} ${count===1?'routine':'routines'} · ${Math.ceil(blob.size/1024)} KB. Includes exercise names, targets, supersets and drop sets. Your workout history and notes stay private.</p><ul class="share-routine-list">${bundle.routines.map(r=>`<li>${esc(r.name)} <span>${r.items.length} exercises</span></li>`).join('')}</ul><div class="share-actions"><button class="primary" id="send-routines" ${shareable(file)?'':'disabled'}>Share routine file</button><button class="secondary" id="save-routines">Save routine file</button></div><p class="help">Your friend can save the file, open Setline → Import routines, and choose it. It adds routines alongside their own. Files and import work offline; sending depends on the app you choose.</p>${textArea('Routine import code')}`);
    const {copy,send}=textControls(json,token);send.textContent='Share import code';copy.textContent='Copy import code';
    const save=modal.querySelector('#save-routines'),sendFile=modal.querySelector('#send-routines'),active=()=>current(token,save);
    save.onclick=()=>{if(!active())return;saveFile(blob,name+'.setline.json');toast('Routine file download started')};
    sendFile.onclick=async()=>{if(!active()||!canShare)return;try{await navigator.share({files:[file],title:count===1?bundle.routines[0].name:'Setline routines'})}catch(e){if(active()&&e.name!=='AbortError')toast('Save the routine file or copy its import code instead.')}};
  }
  function importRoutines(){
    if(importing){toast('Finishing the current import. Try again in a moment.');return}
    const token=begin();
    openModal('Import routines',`<p class="help">Choose a shared Setline routine file or paste its import code. This adds routines without replacing your history or current workout. Works offline.</p><label class="file-picker">Choose routine file<input id="routine-file" type="file" accept=".json,.txt,application/json,text/plain"></label><label>Or paste import code<textarea id="routine-code" rows="5" placeholder="Paste the routine code here" spellcheck="false"></textarea></label><button class="secondary wide" id="preview-routines">Preview routines</button><p id="routine-import-error" class="help" role="status"></p><div id="routine-import-preview"></div>`);
    const picker=modal.querySelector('#routine-file'),code=modal.querySelector('#routine-code'),previewButton=modal.querySelector('#preview-routines'),errorNode=modal.querySelector('#routine-import-error'),previewNode=modal.querySelector('#routine-import-preview');
    let request=0;
    const active=()=>current(token,previewNode);
    const latest=serial=>active()&&serial===request;
    const error=(message,serial)=>{if(!latest(serial))return;errorNode.textContent=message;previewNode.replaceChildren()};
    const clear=()=>{errorNode.textContent='';previewNode.replaceChildren()};
    function preview(raw,serial){
      if(!latest(serial))return;
      try{
        if(new Blob([raw]).size>MAX_ROUTINE_SHARE_BYTES)throw Error('Routine files must be 5 MB or smaller.');
        const bundle=validateRoutineBundle(JSON.parse(raw));errorNode.textContent='';
        previewNode.innerHTML=`<ul class="share-routine-list">${bundle.routines.map(r=>`<li>${esc(r.name)} <span>${r.items.length} exercises</span></li>`).join('')}</ul><button class="primary wide" id="add-routines">Add ${bundle.routines.length} ${bundle.routines.length===1?'routine':'routines'}</button>`;
        const button=previewNode.querySelector('#add-routines');
        button.onclick=async()=>{
          if(importing||!latest(serial)||!button.isConnected)return;
          importing=true;
          for(const control of [button,picker,code,previewButton])control.disabled=true;
          try{await importBundle(bundle,()=>latest(serial))}
          catch(e){error(e.message,serial)}
          finally{importing=false;if(latest(serial))for(const control of [button,picker,code,previewButton])if(control.isConnected)control.disabled=false}
        };
      }catch(e){error(e instanceof SyntaxError?'That is not valid routine code. Nothing was imported.':e.message,serial)}
    }
    previewButton.onclick=()=>{if(!active()||importing)return;preview(code.value,++request)};
    code.oninput=()=>{if(!active()||importing)return;request++;clear();picker.value=''};
    picker.onchange=async()=>{
      if(!active()||importing)return;
      const file=picker.files[0],serial=++request;clear();if(!file)return;
      code.value='';
      try{if(file.size>MAX_ROUTINE_SHARE_BYTES)throw Error('Routine files must be 5 MB or smaller.');const raw=await file.text();if(latest(serial))preview(raw,serial)}
      catch(e){error(e.message,serial)}
      finally{if(latest(serial))picker.value=''}
    };
  }
  return {workout,stats,routines,importRoutines};
}
