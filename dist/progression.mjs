import {toKg,validSet} from './core.mjs';

const MAX_AGE=42*24*60*60*1000;
const BODYWEIGHT_IDS=new Set(['push-up','pull-up','chin-up','chest-dip','crunch','hanging-leg-raise','ab-wheel-rollout']);
// Added weight and assistance do not describe total resistance for these movements.
const BODYWEIGHT_NAME=/\b(?:assisted|assistance|counter[ -]?weight(?:ed)?|body[ -]?weight|unweighted)\b|\b(?:pull|chin|push)[ -]?ups?\b|\bdips?\b/i;
const isLoad=weight=>Number.isFinite(weight)&&weight>0&&weight<=10000;

/** An optional starting point for 8–10 reps, never a prediction or an automatic edit. */
export function suggestWeight(workouts,exercise,unit='kg',now=Date.now()){
 if(!Array.isArray(workouts)||!exercise||typeof exercise.id!=='string'||!exercise.id||!['kg','lb'].includes(unit)||!Number.isFinite(now))return null;
 if(BODYWEIGHT_IDS.has(exercise.id)||BODYWEIGHT_NAME.test(exercise.name||''))return null;
 // A newer unusable session must not silently revive advice from an older one.
 const latest=workouts.filter(workout=>{
  const ended=Date.parse(workout?.ended);
  return Number.isFinite(ended)&&ended<=now&&now-ended<=MAX_AGE&&Array.isArray(workout.entries)&&workout.entries.some(entry=>entry.exerciseId===exercise.id);
 }).sort((a,b)=>Date.parse(b.ended)-Date.parse(a.ended))[0];
 if(!latest)return null;
 const sets=latest.entries.filter(entry=>entry.exerciseId===exercise.id).flatMap(entry=>Array.isArray(entry.sets)?entry.sets:[]).filter(set=>set&&set.done===true&&set.type==='normal'&&validSet(set)&&isLoad(set.weight));
 if(!sets.length||sets.some(set=>set.reps>20))return null;
 const referenceWeight=Math.max(...sets.map(set=>set.weight));
 const baseline=sets.filter(set=>set.weight===referenceWeight);
 const referenceReps=Math.min(...baseline.map(set=>set.reps));
 const minReps=Math.min(...sets.map(set=>set.reps)),maxReps=Math.max(...sets.map(set=>set.reps));
 const factor=1/toKg(1,unit),step=unit==='lb'?5:2.5,displayWeight=referenceWeight*factor;
 let weight=referenceWeight,direction='hold',reason='in-range';
 if(minReps>10){
  const ceiling=Math.min(displayWeight*1.1,10000*factor);
  const estimate=Math.min(displayWeight*(30+referenceReps)/39,ceiling);
  const rounded=Math.floor((estimate+1e-9)/step)*step;
  const candidate=toKg(rounded,unit);
  if(isLoad(candidate)&&candidate>referenceWeight&&candidate<=referenceWeight*1.1+1e-9){weight=candidate;direction='increase';reason='above-range'}
  else reason='small-step';
 }else if(referenceReps<8&&maxReps<=10){
  const estimate=Math.max(displayWeight*(30+referenceReps)/39,displayWeight*.9);
  const rounded=Math.ceil((estimate-1e-9)/step)*step;
  const candidate=toKg(rounded,unit);
  if(isLoad(candidate)&&candidate<referenceWeight&&candidate>=referenceWeight*.9-1e-9){weight=candidate;direction='decrease';reason='below-range'}
  else reason='small-step';
 }else if(minReps<8||referenceReps>10)reason='mixed-performance';
 return {exerciseId:exercise.id,weight,referenceWeight,referenceReps,minReps,maxReps,sourceDate:latest.ended,sourceWorkoutId:latest.id,targetMin:8,targetMax:10,targetReps:9,direction,reason,setCount:baseline.length,workingSetCount:sets.length};
}

/** Preserve checked sets and all repetition targets; the caller owns persistence. */
export function applyWeightSuggestion(entry,suggestion){
 if(!entry||!suggestion||entry.exerciseId!==suggestion.exerciseId||!isLoad(suggestion.weight)||!Array.isArray(entry.sets))return null;
 let changed=false;
 const sets=entry.sets.map(set=>{
  if(set?.done!==false||set.type!=='normal'||set.weight===suggestion.weight)return set;
  changed=true;
  return {...set,weight:suggestion.weight};
 });
 return changed?{...entry,sets}:null;
}
