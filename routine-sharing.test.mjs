import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,startWorkout,newSet,validateBackup} from './dist/core.mjs';
import {createRoutineBundle,validateRoutineBundle,mergeRoutineBundle,MAX_ROUTINE_SHARE_BYTES} from './dist/routine-sharing.mjs';

function fixture() {
  const state = initialState();
  state.settings.unit = 'lb';
  state.exercises.push({id:'custom',name:'Custom cable press',muscle:'Chest'});
  state.routines = [{id:'routine',name:'Cable pair',items:[
    {exerciseId:'custom',group:'pair',sets:[{weight:22.75,reps:8,type:'normal'},{weight:12.125,reps:12,type:'drop'}]},
    {exerciseId:'bench-press',group:'pair',sets:[{weight:null,reps:null,type:'warmup'},{weight:0,reps:20,type:'normal'}]}
  ]}];
  state.draft = startWorkout(state,state.routines[0]);
  state.draft.notes = 'Private notes';
  state.workouts = [{...startWorkout(state),id:'finished',ended:new Date().toISOString(),notes:'Private history',entries:[
    {id:'entry',exerciseId:'bench-press',group:null,sets:[{...newSet(20,5),done:true}]}
  ]}];
  return state;
}

test('share one, multiple, or all routines with only their referenced exercises',() => {
  const state = initialState(),before = structuredClone(state);
  for (const ids of [[state.routines[0].id],state.routines.slice(0,2).map(r => r.id),undefined]) {
    const bundle = createRoutineBundle(state,ids);
    assert.equal(bundle.routines.length,ids?.length ?? state.routines.length);
    assert.deepEqual(new Set(bundle.exercises.map(e => e.id)),new Set(bundle.routines.flatMap(r => r.items.map(e => e.exerciseId))));
    assert.deepEqual(Object.keys(bundle).sort(),['exercises','format','routines','unit','version']);
  }
  assert.deepEqual(state,before);
  assert.throws(() => createRoutineBundle(state,['missing']));
  assert.throws(() => createRoutineBundle(state,[]));
  assert.throws(() => createRoutineBundle(state,'not-an-array'));
});

test('round trip preserves kg decimals, null targets, custom exercises, drops and supersets',() => {
  const source = fixture(),bundle = createRoutineBundle(source);
  assert.equal(bundle.unit,'kg');
  assert.equal(bundle.routines[0].items[0].sets[0].weight,22.75);
  const {state:merged,added} = mergeRoutineBundle(initialState(),JSON.parse(JSON.stringify(bundle)));
  const routine = merged.routines.at(-1);
  assert.equal(added,1);
  assert.deepEqual(routine.items.map(item => item.sets),source.routines[0].items.map(item => item.sets));
  assert.equal(routine.items[0].group,routine.items[1].group);
  assert.notEqual(routine.items[0].group,'pair');
  assert.equal(merged.exercises.find(e => e.id === routine.items[0].exerciseId).name,'Custom cable press');
  assert.deepEqual(validateBackup(merged),merged);
});

test('import preserves existing state and input bundle without sharing mutable objects',() => {
  const state = fixture(),bundle = createRoutineBundle(state),before = structuredClone(state),originalBundle = structuredClone(bundle);
  const {state:merged} = mergeRoutineBundle(state,bundle);
  for (const key of ['draft','workouts','settings','version']) assert.deepEqual(merged[key],state[key]);
  assert.deepEqual(merged.routines.slice(0,state.routines.length),state.routines);
  assert.deepEqual(merged.exercises,state.exercises);
  merged.routines.at(-1).items[0].sets[0].weight = 777;
  merged.draft.notes = 'Edited in the new state';
  assert.deepEqual(state,before);
  assert.deepEqual(bundle,originalBundle);
});

test('exercise matching ignores name and muscle case; ID collisions never replace local records',() => {
  const source = fixture(),target = initialState();
  const bundle = createRoutineBundle(source);
  bundle.exercises.find(e => e.id === 'bench-press').name = '  BENCH PRESS  ';
  bundle.exercises.find(e => e.id === 'bench-press').muscle = 'chest';
  target.exercises.push({id:'custom',name:'Something entirely different',muscle:'Core'});
  target.routines[0].id = 'routine';
  const {state:merged} = mergeRoutineBundle(target,bundle),imported = merged.routines.at(-1);
  assert.equal(imported.items[1].exerciseId,'bench-press');
  assert.notEqual(imported.items[0].exerciseId,'custom');
  assert.notEqual(imported.id,'routine');
  assert.equal(merged.exercises.length,target.exercises.length+1);
  assert.equal(merged.exercises.find(e => e.id === 'custom').name,'Something entirely different');
  const again = mergeRoutineBundle(merged,bundle).state;
  assert.equal(again.routines.length,merged.routines.length+1);
  assert.equal(again.exercises.length,merged.exercises.length);
  assert.notEqual(again.routines.at(-1).id,imported.id);
  assert.notEqual(again.routines.at(-1).items[0].group,imported.items[0].group);
});

test('same exercise name in a different muscle group stays distinct',() => {
  const state = initialState(),bundle = createRoutineBundle(state,[state.routines[0].id]);
  bundle.exercises.find(e => e.id === 'bench-press').muscle = 'Custom';
  const result = mergeRoutineBundle(state,bundle).state;
  assert.notEqual(result.routines.at(-1).items[0].exerciseId,'bench-press');
});

test('normalization drops private and unexpected fields at every level',() => {
  const bundle = createRoutineBundle(fixture());
  Object.assign(bundle,{settings:{secret:true},workouts:[{notes:'private'}]});
  bundle.exercises.push({id:'unused',name:'Unused',muscle:'Core'});
  bundle.exercises[0].privateNotes = 'private';
  bundle.routines[0].notes = 'private';
  bundle.routines[0].items[0].notes = 'private';
  Object.assign(bundle.routines[0].items[0].sets[0],{done:true,id:'private-set'});
  const normalized = validateRoutineBundle(bundle);
  assert.equal(JSON.stringify(normalized).includes('private'),false);
  assert.equal(normalized.exercises.some(e => e.id === 'unused'),false);
  assert.deepEqual(normalized,createRoutineBundle(fixture()));
});

test('malformed formats, references, scalars, and relationships reject atomically',() => {
  const source = fixture(),valid = createRoutineBundle(source),before = structuredClone(source);
  const changes = [
    b => b.format = 'setline-backup', b => b.version = 2, b => b.unit = 'lb',
    b => b.exercises = [null], b => b.routines = [null],
    b => b.exercises.push({...b.exercises[0]}), b => b.routines.push({...b.routines[0]}),
    b => b.exercises[0].id = '<script>', b => b.routines[0].name = ' ',
    b => b.exercises[0].name = 'x'.repeat(121), b => b.exercises[0].muscle = 'x'.repeat(51),
    b => b.routines[0].items[0].exerciseId = 'missing',
    b => b.routines[0].items[0].group = 'orphan', b => b.routines[0].items[0].group = 3,
    b => b.routines[0].items = [], b => b.routines[0].items[0].sets = [],
    b => b.routines[0].items[0].sets[0].type = 'drop',
    b => b.routines[0].items[0].sets[0].type = 'warmup',
    b => b.routines[0].items[0].sets[0].type = 'other',
    ...[-1,10001,Infinity,NaN,'2.5',undefined].map(value => b => b.routines[0].items[0].sets[0].weight = value),
    ...[0,1001,1.5,Infinity,'8',undefined].map(value => b => b.routines[0].items[0].sets[0].reps = value)
  ];
  for (const change of changes) {
    const invalid = structuredClone(valid);change(invalid);
    assert.throws(() => mergeRoutineBundle(source,invalid));
    assert.deepEqual(source,before);
  }
  for (const invalid of [null,[],{},source]) assert.throws(() => validateRoutineBundle(invalid));
});

test('file, collection, and aggregate limits reject before adding anything',() => {
  const state = initialState(),bundle = createRoutineBundle(state,[state.routines[0].id]);
  const oversized = structuredClone(bundle);oversized.padding = 'x'.repeat(MAX_ROUTINE_SHARE_BYTES);
  assert.throws(() => validateRoutineBundle(oversized),/5 MB/);
  const cyclic = structuredClone(bundle);cyclic.self = cyclic;
  assert.throws(() => validateRoutineBundle(cyclic));
  const tooManySets = structuredClone(bundle);tooManySets.routines[0].items[0].sets = Array.from({length:201},() => ({weight:null,reps:null,type:'normal'}));
  assert.throws(() => validateRoutineBundle(tooManySets));
  const tooManyItems = structuredClone(bundle);tooManyItems.routines[0].items = Array.from({length:151},() => structuredClone(tooManyItems.routines[0].items[0]));
  assert.throws(() => validateRoutineBundle(tooManyItems));
  state.routines = Array.from({length:500},(_,index) => ({...structuredClone(state.routines[0]),id:'routine-'+index}));
  const before = structuredClone(state);
  assert.throws(() => mergeRoutineBundle(state,bundle),/500 routines/);
  assert.deepEqual(state,before);
  state.routines = [];
  state.exercises = Array.from({length:2000},(_,index) => ({id:'exercise-'+index,name:'Exercise '+index,muscle:'Core'}));
  const capped = structuredClone(state);
  assert.throws(() => mergeRoutineBundle(state,bundle),/2,000 exercises/);
  assert.deepEqual(state,capped);
});
