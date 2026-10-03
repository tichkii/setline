import test from 'node:test';
import assert from 'node:assert/strict';
import {toKg,toDisplay} from './dist/core.mjs';
import {suggestWeight,applyWeightSuggestion} from './dist/progression.mjs';

const NOW=Date.parse('2026-10-03T12:00:00Z');
const exercise={id:'leg-press',name:'Leg press',muscle:'Legs'};
const set=(weight=93,reps=15,extra={})=>({id:crypto.randomUUID(),weight,reps,type:'normal',done:true,...extra});
const session=(sets=[set()],daysAgo=1,extra={})=>({id:crypto.randomUUID(),started:new Date(NOW-daysAgo*86400000-3600000).toISOString(),ended:new Date(NOW-daysAgo*86400000).toISOString(),entries:[{id:'entry',exerciseId:exercise.id,group:null,sets}],...extra});
const suggest=(workouts,unit='kg')=>suggestWeight(workouts,exercise,unit,NOW);

test('93 kg for 15 reps suggests a rounded 100 kg starting point for 8–10 reps',()=>{
 const history=[session([set(93,15),set(93,16),set(93,15)])],before=structuredClone(history),result=suggest(history);
 assert.equal(result.weight,100);assert.equal(result.direction,'increase');assert.equal(result.reason,'above-range');
 assert.equal(result.referenceWeight,93);assert.equal(result.referenceReps,15);assert.equal(result.setCount,3);
 assert.equal(result.workingSetCount,3);assert.equal(result.sourceDate,history[0].ended);assert.equal(result.sourceWorkoutId,history[0].id);
 assert.equal(result.targetMin,8);assert.equal(result.targetMax,10);assert.equal(result.targetReps,9);
 assert.deepEqual(history,before);
});
test('the weakest working set prevents a best-set-only increase and retains in-range weights',()=>{
 for(const reps of [[15,10,8],[9,9,9],[10],[8]]){
  const result=suggest([session(reps.map(value=>set(93,value)))]);
  assert.equal(result.direction,'hold');assert.equal(result.weight,93);assert.equal(result.referenceReps,Math.min(...reps));
 }
 const mixed=suggest([session([set(93,15),set(93,6)])]);
 assert.equal(mixed.direction,'hold');assert.equal(mixed.reason,'mixed-performance');
});
test('mixed loads use the heaviest baseline while lighter fatigued sets block progression',()=>{
 const progression=suggest([session([set(93,15),set(80,20)])]);
 assert.equal(progression.referenceWeight,93);assert.equal(progression.referenceReps,15);assert.equal(progression.weight,100);
 assert.equal(progression.setCount,1);assert.equal(progression.workingSetCount,2);
 for(const reps of [6,8,10]){
  const result=suggest([session([set(93,15),set(80,reps)])]);
  assert.equal(result.direction,'hold');assert.equal(result.reason,'mixed-performance');
 }
 const duplicateEntry=session([set(93,15)]);duplicateEntry.entries.push({exerciseId:exercise.id,sets:[set(93,8)]});
 assert.equal(suggest([duplicateEntry]).direction,'hold');
});
test('below-range sets lower the load conservatively and very small rounding steps hold',()=>{
 const result=suggest([session([set(93,6),set(93,7)])]);
 assert.equal(result.weight,87.5);assert.equal(result.direction,'decrease');assert.equal(result.reason,'below-range');
 assert.ok(result.weight>=93*.9);
 assert.equal(suggest([session([set(93,1)])]).weight,85);
 for(const reps of [1,7,11,20]){
  const small=suggest([session([set(5,reps)])]);
  assert.equal(small.direction,'hold');assert.equal(small.weight,5);assert.equal(small.reason,'small-step');
 }
});
test('kg and lb rounding uses the displayed unit while weights remain canonical kg',()=>{
 const history=[session([set(toKg(205,'lb'),15)])],before=structuredClone(history);
 const pounds=suggest(history,'lb');
 assert.equal(toDisplay(pounds.referenceWeight,'lb'),205);assert.equal(toDisplay(pounds.weight,'lb'),225);
 assert.equal(pounds.weight,toKg(225,'lb'));assert.ok(pounds.weight<=pounds.referenceWeight*1.1);
 const reduced=suggest([session([set(toKg(205,'lb'),6)])],'lb');
 assert.equal(toDisplay(reduced.weight,'lb'),190);assert.equal(reduced.direction,'decrease');
 const kilograms=suggest(history,'kg');assert.equal(kilograms.weight,100);
 assert.deepEqual(history,before);
});
test('suggestions stay bounded and obey the ten percent cap across practical weights and reps',()=>{
 for(const unit of ['kg','lb'])for(const weight of [.01,1,2.5,5,17.75,50,93,200,500,9999,10000])for(const reps of [1,6,7,8,9,10,11,15,20]){
  const result=suggest([session([set(weight,reps)])],unit);
  assert.ok(Number.isFinite(result.weight));assert.ok(result.weight>0&&result.weight<=10000);
  assert.ok(result.weight>=weight*.9-1e-9&&result.weight<=weight*1.1+1e-9);
  if(result.direction==='increase')assert.ok(reps>10&&result.weight>weight);
  if(result.direction==='decrease')assert.ok(reps<8&&result.weight<weight);
  if(result.direction==='hold')assert.equal(result.weight,weight);
 }
});
test('only the latest completed session supplies evidence, independent of array order',()=>{
 const old=session([set(93,20)],5),latest=session([set(93,9)],1);
 for(const workouts of [[latest,old],[old,latest]]){
  const result=suggest(workouts);assert.equal(result.sourceWorkoutId,latest.id);assert.equal(result.direction,'hold');
 }
 const other=session([set(200,20)],0);other.entries[0].exerciseId='bench-press';
 assert.equal(suggest([old,other,latest]).sourceWorkoutId,latest.id);
 assert.equal(suggest([old,session([set(93,15,{done:false})],1)]),null);
 assert.equal(suggest([old,session([set(93,15,{type:'warmup'})],1)]),null);
});
test('future, stale, invalid and unfinished sessions do not supply evidence',()=>{
 assert.equal(suggest([session([set()],43)]),null);
 assert.ok(suggest([session([set()],42)]));
 assert.equal(suggest([session([set()],42+1/86400000)]),null);
 assert.equal(suggest([session([set()],-1)]),null);
 assert.equal(suggest([session([set()],1,{ended:null})]),null);
 assert.equal(suggest([session([set()],1,{ended:'invalid'})]),null);
 const good=session([set(93,9)],1);
 assert.equal(suggest([session([set()],-1),good]).sourceWorkoutId,good.id);
 for(const now of [NaN,Infinity,'2026-10-03',null])assert.equal(suggestWeight([good],exercise,'kg',now),null);
});
test('warmups, drops, bodyweight, incomplete and invalid values never inflate evidence',()=>{
 const valid=set(93,9),ignored=[set(150,15,{type:'warmup'}),set(80,30,{type:'drop'}),set(200,15,{done:false}),set(0,15),set(-1,10),set(Infinity,10),set(10001,10),set(100,0),set(100,1.5),set(100,1001),set('200',10),set(100,'15')];
 const result=suggest([session([valid,...ignored])]);
 assert.equal(result.direction,'hold');assert.equal(result.referenceWeight,93);assert.equal(result.workingSetCount,1);
 assert.equal(suggest([session(ignored)]),null);
 for(const reps of [21,50,1000])assert.equal(suggest([session([valid,set(93,reps)])]),null);
 for(const input of [null,{},'history'])assert.equal(suggest(input),null);
 assert.equal(suggest([], 'stones'),null);
 assert.equal(suggestWeight([session()],null,'kg',NOW),null);
});
test('bodyweight and assisted movements are excluded even when additional load was recorded',()=>{
 for(const id of ['push-up','pull-up','chin-up','chest-dip','crunch','hanging-leg-raise','ab-wheel-rollout']){
  const history=session();history.entries[0].exerciseId=id;
  assert.equal(suggestWeight([history],{id,name:'Renamed movement'},'kg',NOW),null);
 }
 for(const name of ['Assisted squat','Assistance machine row','Body weight squat','Bodyweight squat','Unweighted squat','Weighted pull-up','Weighted chin ups','Pushups','Weighted dips','Counterweighted movement','Counterweight movement']){
  assert.equal(suggestWeight([session()],{...exercise,name},'kg',NOW),null,name);
 }
 assert.ok(suggestWeight([session()],{...exercise,name:'Hip abductor'},'kg',NOW));
});
test('application changes only unfinished normal weights and preserves all other workout fields',()=>{
 const entry={id:'active',exerciseId:exercise.id,group:'superset',sets:[set(93,15,{done:false}),set(null,null,{done:false}),set(93,9),set(50,12,{type:'warmup',done:false}),set(60,15,{type:'drop',done:false})]};
 const before=structuredClone(entry),suggestion=suggest([session()]),after=applyWeightSuggestion(entry,suggestion);
 assert.notEqual(after,entry);assert.notEqual(after.sets,entry.sets);assert.equal(after.id,entry.id);assert.equal(after.group,entry.group);
 assert.equal(after.sets[0].weight,100);assert.equal(after.sets[1].weight,100);
 after.sets.forEach((value,index)=>assert.deepEqual({...value,weight:entry.sets[index].weight},entry.sets[index]));
 for(const index of [2,3,4])assert.equal(after.sets[index],entry.sets[index]);
 assert.deepEqual(entry,before);
 assert.equal(applyWeightSuggestion(after,suggestion),null);
});
test('application cannot change another exercise, invalid load or completed-only entry',()=>{
 const entry={exerciseId:exercise.id,sets:[set(93,9)]},before=structuredClone(entry),suggestion=suggest([session()]);
 assert.equal(applyWeightSuggestion(entry,suggestion),null);
 entry.sets[0].done=false;
 for(const weight of [null,0,-1,Infinity,NaN,10001,'100'])assert.equal(applyWeightSuggestion(entry,{...suggestion,weight}),null);
 assert.equal(applyWeightSuggestion(entry,{...suggestion,exerciseId:'other'}),null);
 for(const value of [null,{},undefined])assert.equal(applyWeightSuggestion(value,suggestion),null);
 assert.equal(applyWeightSuggestion(entry,null),null);
 assert.deepEqual({...entry,sets:entry.sets.map(value=>({...value,done:true}))},before);
});
