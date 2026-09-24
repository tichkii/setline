import {uid} from './core.mjs';

export const MAX_ROUTINE_SHARE_BYTES = 5_000_000;
const FORMAT = 'setline-routines';
const LIMITS = {exercises:2000, routines:500, items:150, sets:200};
const fail = () => {throw Error('This is not a valid Setline routine file. Nothing was changed.');};
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const text = (value, max, required = false) => typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);
const identity = exercise => JSON.stringify([exercise.name.trim().toLowerCase(), exercise.muscle.trim().toLowerCase()]);

// Keep this format separate from backups: sharing routines never includes history or settings.
export function createRoutineBundle(state, routineIds = state.routines.map(routine => routine.id)) {
  if (!Array.isArray(routineIds) || !routineIds.length || routineIds.some(value => !id(value))) fail();
  const selected = new Set(routineIds);
  const routines = state.routines.filter(routine => selected.has(routine.id));
  if (routines.length !== selected.size) fail();
  const referenced = new Set(routines.flatMap(routine => routine.items.map(item => item.exerciseId)));
  return validateRoutineBundle({
    format:FORMAT, version:1, unit:'kg',
    exercises:state.exercises.filter(exercise => referenced.has(exercise.id)).map(({id,name,muscle}) => ({id,name,muscle})),
    routines:routines.map(routine => ({id:routine.id,name:routine.name,items:routine.items.map(item => ({
      exerciseId:item.exerciseId,group:item.group,
      sets:item.sets.map(({weight,reps,type}) => ({weight,reps,type}))
    }))}))
  });
}

export function validateRoutineBundle(value) {
  if (!record(value) || value.format !== FORMAT || value.version !== 1 || value.unit !== 'kg') fail();
  // Also reject oversized/circular objects when this API is called without the file picker.
  let serialized;
  try {serialized = JSON.stringify(value);} catch {fail();}
  if (!serialized || serialized.length > MAX_ROUTINE_SHARE_BYTES || new TextEncoder().encode(serialized).length > MAX_ROUTINE_SHARE_BYTES) {
    throw Error('Routine files must be 5 MB or smaller. Nothing was changed.');
  }
  if (!Array.isArray(value.exercises) || !value.exercises.length || value.exercises.length > LIMITS.exercises ||
      !Array.isArray(value.routines) || !value.routines.length || value.routines.length > LIMITS.routines) fail();
  const exerciseIds = new Set();
  const exercises = value.exercises.map(exercise => {
    if (!record(exercise) || !id(exercise.id) || exerciseIds.has(exercise.id) || !text(exercise.name,120,true) || !text(exercise.muscle,50)) fail();
    exerciseIds.add(exercise.id);
    return {id:exercise.id,name:exercise.name.trim(),muscle:exercise.muscle.trim()};
  });
  const routineIds = new Set(), referenced = new Set();
  const routines = value.routines.map(routine => {
    if (!record(routine) || !id(routine.id) || routineIds.has(routine.id) || !text(routine.name,120,true) ||
        !Array.isArray(routine.items) || !routine.items.length || routine.items.length > LIMITS.items) fail();
    routineIds.add(routine.id);
    const groups = new Map();
    const items = routine.items.map(item => {
      if (!record(item) || !exerciseIds.has(item.exerciseId) || (item.group !== null && !id(item.group)) ||
          !Array.isArray(item.sets) || !item.sets.length || item.sets.length > LIMITS.sets) fail();
      referenced.add(item.exerciseId);
      if (item.group !== null) groups.set(item.group,(groups.get(item.group) || 0) + 1);
      const sets = item.sets.map((set,index) => {
        if (!record(set) || !['normal','warmup','drop'].includes(set.type) ||
            (set.weight !== null && (!Number.isFinite(set.weight) || set.weight < 0 || set.weight > 10000)) ||
            (set.reps !== null && (!Number.isInteger(set.reps) || set.reps < 1 || set.reps > 1000)) ||
            (set.type === 'drop' && (index === 0 || item.sets[index - 1]?.type === 'warmup'))) fail();
        return {weight:set.weight,reps:set.reps,type:set.type};
      });
      return {exerciseId:item.exerciseId,group:item.group,sets};
    });
    if ([...groups.values()].some(count => count < 2)) fail();
    return {id:routine.id,name:routine.name.trim(),items};
  });
  return {format:FORMAT,version:1,unit:'kg',exercises:exercises.filter(exercise => referenced.has(exercise.id)),routines};
}

export function mergeRoutineBundle(state, value) {
  const bundle = validateRoutineBundle(value);
  if (state.routines.length + bundle.routines.length > LIMITS.routines) {
    throw Error('Import would exceed the limit of 500 routines. Nothing was changed.');
  }
  // Work on a complete clone so failure and later edits cannot alter the source state.
  const result = structuredClone(state);
  const existing = new Map(result.exercises.map(exercise => [identity(exercise),exercise.id]));
  const reserved = new Set(result.exercises.map(exercise => exercise.id));
  for (const routine of result.routines) {
    reserved.add(routine.id);
    for (const item of routine.items) if (item.group) reserved.add(item.group);
  }
  for (const workout of [...result.workouts,...(result.draft ? [result.draft] : [])]) {
    reserved.add(workout.id);
    for (const entry of workout.entries) {
      reserved.add(entry.id);
      if (entry.group) reserved.add(entry.group);
      for (const set of entry.sets) reserved.add(set.id);
    }
  }
  const freshId = () => {
    let candidate;
    do {candidate = uid();} while (reserved.has(candidate));
    reserved.add(candidate);
    return candidate;
  };
  const exerciseMap = new Map();
  for (const exercise of bundle.exercises) {
    const key = identity(exercise);
    let target = existing.get(key);
    if (target === undefined) {
      if (result.exercises.length >= LIMITS.exercises) throw Error('Import would exceed the limit of 2,000 exercises. Nothing was changed.');
      target = freshId();
      result.exercises.push({id:target,name:exercise.name,muscle:exercise.muscle});
      existing.set(key,target);
    }
    exerciseMap.set(exercise.id,target);
  }
  for (const routine of bundle.routines) {
    const groups = new Map();
    result.routines.push({id:freshId(),name:routine.name,items:routine.items.map(item => {
      if (item.group !== null && !groups.has(item.group)) groups.set(item.group,freshId());
      return {exerciseId:exerciseMap.get(item.exerciseId),group:item.group === null ? null : groups.get(item.group),sets:item.sets.map(set => ({...set}))};
    })});
  }
  return {state:result,added:bundle.routines.length};
}
