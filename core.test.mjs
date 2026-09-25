import test from 'node:test';import assert from 'node:assert/strict';
import {initialState,startWorkout,newSet,finishWorkout,validateBackup,volume,bestFor,toDisplay,toKg,activityDays,localDay,csvExport,normalizeGroups,routineEditorFor,routineFromEditor,parseWeightInput,formatElapsed,exercises,muscleGroups,isCustomExercise,updateCustomExercise,previousEntries} from './dist/core.mjs';
function fixture(){const s=initialState();s.settings.schedule=[];s.settings.scheduleHistory=[];s.settings.trackingSince='2026-09-01';const w=startWorkout(s);w.started='2026-09-21T10:00:00Z';w.entries=[{id:'entry',exerciseId:'bench-press',group:null,sets:[{...newSet(100,5),done:true},{...newSet(40,10,'warmup'),done:true},{...newSet(60,10,'drop'),done:true}]}];w.entries[0].sets.splice(1,1);s.workouts=[finishWorkout(w,'2026-09-21T11:00:00Z')];return s}
test('JSON round trip preserves complete state',()=>{const s=fixture();s.draft=startWorkout(s,s.routines[0]);assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(s))),s)});
test('orphan completed drop remains loadable after finish',()=>{const s=initialState(),w=startWorkout(s);w.entries=[{id:'entry',exerciseId:'bench-press',group:null,sets:[newSet(100,5),{...newSet(60,10,'drop'),done:true}]}];s.workouts=[finishWorkout(w)];assert.equal(s.workouts[0].entries[0].sets[0].type,'normal');assert.doesNotThrow(()=>validateBackup(s))});
test('warmup excluded and drop included in volume; drop excluded in PR',()=>{const s=fixture(),w=s.workouts[0];w.entries[0].sets.unshift({...newSet(200,3,'warmup'),done:true});assert.equal(volume(w),1100);assert.equal(bestFor(s.workouts,'bench-press').weight,100);assert.ok(Math.abs(bestFor(s.workouts,'bench-press').e1rm-116.6666666667)<1e-6)});
test('unit display conversion never changes canonical kg',()=>{const s=fixture(),before=JSON.stringify(s.workouts);s.settings.unit='lb';assert.equal(toDisplay(100,'lb'),220.46);s.settings.unit='kg';assert.equal(JSON.stringify(s.workouts),before);assert.ok(Math.abs(toKg(220.462262185,'lb')-100)<1e-10)});
test('weight input accepts decimal dot or comma without truncating fractions',()=>{for(const [raw,value] of [['62.5',62.5],['62,5',62.5],[' 1,25 ',1.25],['.25',.25],[',25',.25],['0',0],['0.125',.125],['1,250',1.25],['20.',20],['20,',20]])assert.equal(parseWeightInput(raw),value);for(const raw of ['', '  ',null,undefined])assert.equal(parseWeightInput(raw),null);assert.equal(parseWeightInput(2.25),2.25)});
test('weight input rejects signs, exponent notation, grouping and invalid values',()=>{for(const raw of ['-1','+1','1e2','0x10','Infinity','NaN','1,234.5','1.234,5','1,234,567','1 234','1\u202f234','.','1..5','2kg',Infinity,NaN,-1,{},[],true])assert.ok(Number.isNaN(parseWeightInput(raw)),String(raw));assert.ok(Number.isNaN(parseWeightInput('9'.repeat(400))))});
test('fractional kg and lb weights survive workout completion and backup restore',()=>{for(const unit of ['kg','lb']){const s=initialState(),w=startWorkout(s);s.settings.unit=unit;const canonical=toKg(parseWeightInput('2,25'),unit);w.entries=[{id:'fractional',exerciseId:'bench-press',group:null,sets:[{...newSet(canonical,8),done:true}]}];s.workouts=[finishWorkout(w)];const restored=validateBackup(JSON.parse(JSON.stringify(s))),weight=restored.workouts[0].entries[0].sets[0].weight;assert.equal(weight,canonical);assert.equal(toDisplay(weight,unit),2.25);assert.equal(volume(restored.workouts[0]),canonical*8)}});
test('elapsed timer floors partial seconds and switches to hours at sixty minutes',()=>{const start='2026-09-24T10:00:00Z',base=Date.parse(start);for(const [elapsed,expected] of [[0,'0:00'],[999,'0:00'],[1000,'0:01'],[59999,'0:59'],[60000,'1:00'],[3599999,'59:59'],[3600000,'1:00:00'],[3661000,'1:01:01'],[90061000,'25:01:01']])assert.equal(formatElapsed(start,base+elapsed),expected);assert.equal(formatElapsed(new Date(base),base+65000),'1:05');assert.equal(formatElapsed(base,base+65000),'1:05')});
test('elapsed timer safely handles invalid timestamps, future start and suspended app gaps',t=>{const base=Date.parse('2026-09-24T10:00:00Z');for(const invalid of ['invalid',null,undefined,NaN,Infinity,new Date(NaN),{}]){assert.equal(formatElapsed(invalid,base),'0:00');if(invalid!==undefined)assert.equal(formatElapsed(base,invalid),'0:00')}assert.equal(formatElapsed(base+1000,base),'0:00');assert.equal(formatElapsed(base,base+2*3600000+7000),'2:00:07');t.mock.method(Date,'now',()=>base+65000);assert.equal(formatElapsed(base),'1:05')});
test('empty, negative and invalid imported records reject',()=>{assert.throws(()=>finishWorkout(startWorkout(initialState())));for(const value of [-1,null,Infinity]){const s=fixture();s.workouts[0].entries[0].sets[0].weight=value;assert.throws(()=>validateBackup(s))}});
test('bad IDs and duplicate references cannot enter storage',()=>{const s=fixture();s.exercises[0].id='x" onclick="evil';assert.throws(()=>validateBackup(s));const t=fixture();t.workouts.push(structuredClone(t.workouts[0]));assert.throws(()=>validateBackup(t))});
test('bodyweight 0 is valid with reps',()=>{const s=fixture();s.workouts[0].entries[0].sets=[{...newSet(0,10),done:true}];assert.doesNotThrow(()=>validateBackup(s));assert.equal(volume(s.workouts[0]),0)});
test('removing a superset member leaves no orphan group',()=>{const entries=[{group:'g'},{group:'g'}];normalizeGroups(entries);assert.equal(entries[0].group,'g');entries.pop();normalizeGroups(entries);assert.equal(entries[0].group,null)});
test('duration buckets add multiple same-day workouts',()=>{const s=fixture(),w=s.workouts[0];w.started='2026-09-21T10:00:00';w.ended='2026-09-21T10:20:00';const copy=structuredClone(w);copy.id='second';copy.started='2026-09-21T12:00:00';copy.ended='2026-09-21T13:20:00';s.workouts.push(copy);const d=activityDays(s,112,new Date('2026-09-24T12:00:00')).find(d=>d.date==='2026-09-21');assert.equal(d.count,2);assert.equal(d.minutes,100);assert.equal(d.level,4)});
test('missed days respect historical schedules and never mark today missed',()=>{const s=initialState();s.settings.trackingSince='2026-09-01';s.settings.schedule=[4];s.settings.scheduleHistory=[{from:'2026-09-01',days:[1]},{from:'2026-09-23',days:[4]}];const days=activityDays(s,112,new Date('2026-09-24T12:00:00'));assert.equal(days.find(d=>d.date==='2026-09-21').status,'missed');assert.equal(days.find(d=>d.date==='2026-09-24').status,'planned');assert.equal(days.find(d=>d.date==='2026-09-25').status,'future')});
test('CSV escapes formulas and quoted names',()=>{const s=fixture();s.workouts[0].name='=SUM(1,2)';s.workouts[0].notes='He said "good"';const csv=csvExport(s);assert.ok(csv.includes("\"'=SUM(1,2)\""));assert.ok(csv.includes('He said ""good""'))});
test('deleting workouts recalculates records without stale state',()=>{const s=fixture();assert.equal(bestFor(s.workouts,'bench-press').weight,100);s.workouts=[];assert.equal(bestFor(s.workouts,'bench-press').weight,null)});
test('legacy migration preserves active session and history without forcing onboarding',()=>{const s=fixture();s.draft=startWorkout(s,s.routines[0]);s.version=1;for(const key of ['appearance','accent','font','setupComplete'])delete s.settings[key];for(const w of [...s.workouts,s.draft])delete w.rating;s.settings.unit='lb';s.settings.rest=120;const migrated=validateBackup(s);assert.equal(migrated.version,2);assert.equal(migrated.settings.setupComplete,true);assert.equal(migrated.settings.unit,'lb');assert.equal(migrated.settings.rest,120);assert.equal(migrated.workouts[0].rating,null);assert.deepEqual(migrated.draft.entries,s.draft.entries);assert.deepEqual(migrated.routines,s.routines);assert.equal(migrated.draft.started,s.draft.started);assert.equal(s.version,1)});
test('fresh setup and customized preferences survive backup round trip',()=>{const s=fixture();assert.equal(s.settings.setupComplete,false);Object.assign(s.settings,{appearance:'light',accent:'rose',font:'manrope',setupComplete:true});s.workouts[0].rating=4;assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(s))),s)});
test('unknown schema and invalid preference values reject without mutating input',()=>{for(const [key,value] of [['accent','red<script>'],['font','missing'],['appearance','system'],['setupComplete','yes']]){const s=fixture();s.settings[key]=value;const before=JSON.stringify(s);assert.throws(()=>validateBackup(s));assert.equal(JSON.stringify(s),before)}const s=fixture();s.version=3;assert.throws(()=>validateBackup(s))});
test('ratings are optional integers one through five and export to CSV',()=>{for(const rating of [0,6,1.5,'5',NaN]){const s=fixture();s.workouts[0].rating=rating;assert.throws(()=>validateBackup(s))}const s=fixture();s.workouts[0].rating=5;assert.match(csvExport(s),/"rating"/);assert.match(csvExport(s),/"5"(?:\r\n|$)/);s.draft=startWorkout(s,s.routines[0]);assert.equal(s.draft.rating,null);s.draft.entries[0].sets[0]={...newSet(50,8),done:true};s.draft.rating=3;assert.equal(finishWorkout(s.draft).rating,3)});
test('routine editor is isolated from its source, active draft and historical sets',()=>{const s=fixture();s.draft=startWorkout(s,s.routines[0]);const before=JSON.stringify(s),editor=routineEditorFor(s.routines[0]);editor.name='Push revised';editor.entries[0].sets[0].weight=65;editor.entries.reverse();assert.equal(JSON.stringify(s),before);const saved=routineFromEditor(editor);assert.equal(saved.id,s.routines[0].id);s.routines[0]=saved;assert.equal(JSON.stringify(s.draft),JSON.parse(before).draft?JSON.stringify(JSON.parse(before).draft):'');assert.deepEqual(validateBackup(s).routines[0],saved)});
test('duplicate routine exercises receive independent temporary IDs and kg stays canonical',()=>{const r={id:'routine',name:'Double bench',items:[{exerciseId:'bench-press',group:null,sets:[{weight:100,reps:5,type:'normal'}]},{exerciseId:'bench-press',group:null,sets:[{weight:80,reps:8,type:'normal'}]}]},editor=routineEditorFor(r);assert.notEqual(editor.entries[0].id,editor.entries[1].id);assert.notEqual(editor.entries[0].sets[0].id,editor.entries[1].sets[0].id);editor.entries.reverse();assert.equal(routineFromEditor(editor).items[0].sets[0].weight,80);assert.equal(toDisplay(editor.entries[1].sets[0].weight,'lb'),220.46);assert.equal(routineFromEditor(editor).items[1].sets[0].weight,100)});
test('routine save rejects empty names, no exercises, and empty set templates',()=>{const editor=routineEditorFor();assert.throws(()=>routineFromEditor(editor));editor.name='My routine';assert.throws(()=>routineFromEditor(editor));editor.entries=[{id:'e',exerciseId:'bench-press',group:null,sets:[]}];assert.throws(()=>routineFromEditor(editor))});
test('routine editing keeps superset/drop structure in backup and repeated workout',()=>{const s=fixture(),editor=routineEditorFor(s.routines[0]);editor.entries[0].group=editor.entries[1].group='superset';editor.entries[0].sets=[newSet(60,8),newSet(40,10,'drop')];s.routines[0]=routineFromEditor(editor);const imported=validateBackup(s),draft=startWorkout(imported,imported.routines[0]);assert.equal(draft.entries[0].group,draft.entries[1].group);assert.equal(draft.entries[0].sets[1].type,'drop');assert.equal(draft.rating,null)});
test('legacy schedule gains historical baseline before future schedule changes',()=>{const s=fixture();s.settings.schedule=[1];delete s.settings.scheduleHistory;const migrated=validateBackup(s);migrated.settings.schedule=[4];migrated.settings.scheduleHistory.push({from:'2026-09-23',days:[4]});const days=activityDays(migrated,112,new Date('2026-09-24T12:00:00'));assert.equal(days.find(d=>d.date==='2026-09-14').status,'missed');assert.equal(days.find(d=>d.date==='2026-09-24').status,'planned')});

function customExerciseFixture(){
 const state=fixture(),exercise={id:'legacy-hip-abductor',name:'Hip abductor',muscle:'Chest'};
 state.exercises.push(exercise);
 state.workouts[0].entries[0].exerciseId=exercise.id;
 state.routines.push({id:'custom-routine',name:'Hip strength',items:[{exerciseId:exercise.id,group:null,sets:[{weight:37.5,reps:12,type:'normal'},{weight:25,reps:15,type:'drop'}]}]});
 state.draft=startWorkout(state,state.routines.at(-1));
 state.draft.entries[0].sets[0].done=true;
 return state;
}
test('editing a custom exercise preserves routine, active and completed workout links and values',()=>{
 const state=customExerciseFixture(),id=state.exercises.at(-1).id,before=structuredClone(state);
 const records=bestFor(state.workouts,id),history=previousEntries(state.workouts,id),total=volume(state.workouts[0]);
 const edited=updateCustomExercise(state,id,{name:'  Seated hip abductor  ',muscle:'Legs'});
 assert.notEqual(edited,state);assert.notEqual(edited.exercises,state.exercises);
 assert.deepEqual(state,before);
 assert.deepEqual(edited.exercises.at(-1),{id,name:'Seated hip abductor',muscle:'Legs'});
 for(const key of ['workouts','draft','routines','settings'])assert.equal(edited[key],state[key]);
 assert.deepEqual(bestFor(edited.workouts,id),records);
 assert.deepEqual(previousEntries(edited.workouts,id),history);
 assert.equal(volume(edited.workouts[0]),total);
 assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(edited))),edited);
 assert.match(csvExport(edited),/"Seated hip abductor","Legs"/);
});
test('legacy and imported UUID custom exercises remain editable without a custom marker',()=>{
 const legacy=customExerciseFixture();legacy.version=1;
 const restored=validateBackup(JSON.parse(JSON.stringify(legacy))),legacyId=restored.exercises.at(-1).id;
 assert.ok(isCustomExercise(restored.exercises.at(-1)));
 assert.equal(updateCustomExercise(restored,legacyId,{name:'Hip abductor',muscle:'Legs'}).exercises.at(-1).muscle,'Legs');
 const imported={id:'32f15a67-cee6-4b33-a186-e82752dc319e',name:'Imported cable movement',muscle:'Other'};
 restored.exercises.push(imported);
 assert.ok(isCustomExercise(imported));
 const edited=updateCustomExercise(restored,imported.id,{name:'Imported cable movement',muscle:'Back'});
 assert.equal(validateBackup(JSON.parse(JSON.stringify(edited))).exercises.at(-1).muscle,'Back');
});
test('every built-in exercise remains protected by canonical ID even if its imported label differs',()=>{
 const state=initialState(),before=structuredClone(state);
 for(const exercise of exercises){
  assert.equal(isCustomExercise(exercise),false);
  assert.throws(()=>updateCustomExercise(state,exercise.id,{name:'Different label',muscle:'Other'}),/Built-in/);
 }
 assert.deepEqual(state,before);
 state.exercises[0]={...state.exercises[0],name:'Renamed in an older backup',muscle:'Other'};
 assert.equal(isCustomExercise(state.exercises[0]),false);
 assert.throws(()=>updateCustomExercise(state,state.exercises[0].id,{name:'Still protected',muscle:'Chest'}),/Built-in/);
 for(const value of [null,undefined,{}, {id:''}, {id:17}])assert.equal(isCustomExercise(value),false);
});
test('renaming an imported exercise can preserve its existing nonstandard muscle group',()=>{
 const state=customExerciseFixture();state.exercises.at(-1).muscle='Glutes';
 const restored=validateBackup(JSON.parse(JSON.stringify(state))),id=restored.exercises.at(-1).id;
 const edited=updateCustomExercise(restored,id,{name:'Seated hip abductor',muscle:'Glutes'});
 assert.equal(edited.exercises.at(-1).muscle,'Glutes');
 assert.equal(edited.exercises.at(-1).name,'Seated hip abductor');
 assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(edited))),edited);
 assert.equal(updateCustomExercise(restored,id,{name:'Hip abductor',muscle:'Legs'}).exercises.at(-1).muscle,'Legs');
 assert.throws(()=>updateCustomExercise(restored,id,{name:'Hip abductor',muscle:'New custom category'}),/valid muscle group/);
 assert.equal(restored.exercises.at(-1).muscle,'Glutes');
});
test('custom exercise edits reject invalid fields and duplicate names without changing state',()=>{
 const state=customExerciseFixture(),id=state.exercises.at(-1).id,before=structuredClone(state);
 for(const changes of [null,{}, {name:'   ',muscle:'Legs'}, {name:12,muscle:'Legs'}, {name:'x'.repeat(121),muscle:'Legs'}, {name:'bench PRESS',muscle:'Legs'}, {name:'Hip abductor',muscle:'Invalid'}, {name:'Hip abductor',muscle:null}]){
  assert.throws(()=>updateCustomExercise(state,id,changes));
  assert.deepEqual(state,before);
 }
 assert.throws(()=>updateCustomExercise(state,'missing-exercise',{name:'Missing',muscle:'Legs'}),/could not be found/);
 assert.deepEqual(state,before);
 const edited=updateCustomExercise(state,id,{name:'HIP ABDUCTOR',muscle:'Legs'});
 assert.equal(edited.exercises.at(-1).name,'HIP ABDUCTOR');
 assert.equal(updateCustomExercise(state,id,{name:'x'.repeat(120),muscle:'Legs'}).exercises.at(-1).name.length,120);
 for(const muscle of muscleGroups)assert.equal(updateCustomExercise(state,id,{name:'Hip abductor',muscle}).exercises.at(-1).muscle,muscle);
});
