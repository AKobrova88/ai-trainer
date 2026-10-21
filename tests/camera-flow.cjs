// Browser IO is stubbed; the actual camera UI/state-machine code runs unchanged.
// This checks control flow, not MediaPipe recognition accuracy.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function camera(options={}) {
  const nodes = new Map(), storage = new Map();
  let time = 0;
  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const attributes = new Map(), handlers = new Map();let currentTime=0;
    const el = {value:'',textContent:'',innerHTML:'',dataset:{},hidden:true,disabled:false,
      width:640,height:480,videoWidth:640,videoHeight:480,readyState:2,paused:false,
      classList:{add(){},remove(){},toggle(){},contains(){return false;}},
      style:{setProperty(){}},addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:name=>handlers.delete(name),click:()=>handlers.get('click')?.({target:el}),appendChild(){},load(){},pause(){},play:async()=>{},
      setAttribute:(k,v)=>attributes.set(k,v),getAttribute:k=>attributes.get(k),removeAttribute:k=>attributes.delete(k),
      getBoundingClientRect:()=>({width:640,height:480,left:0,top:0}),
      getContext:()=>({setTransform(){}}),
      querySelectorAll:()=>[],scrollIntoView(){}};
    Object.defineProperty(el,'currentTime',{get:()=>currentTime,set:t=>{currentTime=t;if(options.videoTimers)queueMicrotask(()=>handlers.get('seeked')?.());}});
    nodes.set(id,el); return el;
  }
  const context = vm.createContext({
    URL,URLSearchParams,Date,console:options.quietErrors?{...console,error(){}}:console,performance:{now:()=>time},
    location:{href:'http://localhost/?ex=bw_squat&src=app&ret=%2Fapp%2F',hostname:'localhost',protocol:'http:',origin:'http://localhost',search:'?ex=bw_squat&src=app&ret=%2Fapp%2F',hash:''},
    navigator:{userAgent:'Unit test'},
    document:{querySelector:node,querySelectorAll:()=>[],createElement:()=>node(Symbol()),documentElement:node('html'),addEventListener(){}},
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    getComputedStyle:()=>({getPropertyValue:()=> '#12151f'}),
    ResizeObserver:class{observe(){}},MutationObserver:class{observe(){}},
    setTimeout:(fn,delay)=>{if(options.videoTimers && delay>0 && delay<=34)queueMicrotask(fn);return 0;},clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame(){},
    addEventListener(){},matchMedia:()=>({addEventListener(){}}),
    btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),
  });
  context.window=context;
  const html = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  for (let source of scripts.filter(s=>s.includes('Technique analyzers')||s.includes('const EX = '))) {
    if (source.includes('const EX = ')) {
      const end = source.lastIndexOf('})();');
      source = source.slice(0,end)+'window.__testCamera={state,el,infer,beginPreparedSet,stopCamera,recordSet,toApp,toKp,analyzeVideo,checkSetup,cueState,helperCheck,setExercise};\n'+source.slice(end);
    }
    vm.runInContext(source,context);
  }
  return {api:context.__testCamera,storage,node,time:t=>{time=t;},run:s=>vm.runInContext(s,context)};
}

const rep = () => ({n:1,faultList:[],extra:{},grade:'good'});
test('preparation discards analyzer events and starts automatically only after a stable frame', async()=>{
  const c=camera(), {state,el,infer,beginPreparedSet}=c.api;
  const kp=Array.from({length:33},()=>({x:200,y:200,score:.9}));
  state.on=true;state.preflight=true;
  state.detector={estimatePoses:async()=>[{keypoints:kp}]};
  state.analyzer={reps:[rep()],update:()=>({status:'track',phase:'top',live:[]}),drain:()=>[{type:'setEnd'}]};
  beginPreparedSet(); assert.equal(state.preflight,true);
  await infer(); assert.equal(state.preflightReady,false);
  c.time(800);await infer();assert.equal(state.preflight,false);
  assert.equal(state.sets.length,0);
  assert.equal(state.analyzer.reps.length,0);
  assert.equal(state.sets.length,0);
});

test('closing preparation cannot save movements as a completed set',()=>{
  const c=camera(),{state,stopCamera}=c.api;
  state.on=true;state.preflight=true;
  state.analyzer={reps:[rep()],endSet(){throw Error('Preparation was recorded');}};
  stopCamera();assert.equal(state.sets.length,0);assert.equal(state.preflight,false);
});

test('count-only fallback is stored and exported without a technique grade',()=>{
  const c=camera(),{state,recordSet,toApp}=c.api;
  state.fallback=true;state.analyzer={reps:[rep()],view:'side',meta:()=>({pen:0})};
  recordSet();assert.equal(state.sets[0].n,0);assert.equal(state.sets[0].c,0);
  assert.equal(state.sets[0].countOnly,true);
  assert.match(state.sets[0].note,/Техника не оценивалась/);
  toApp();const entry=JSON.parse(c.storage.get('aitrainer.inbox'))[0];
  assert.equal(entry.free,true);assert.equal(entry.sets[0].n,0);assert.equal(entry.sets[0].c,0);
});

test('3D findings keep limitations and cues on the way to the diary, without a perfect-technique grade',()=>{
  const c=camera(),{state,recordSet,toApp}=c.api;
  state.analyzer={reps:[{...rep(),partial:true,analysisMode:'3d',faultList:['shallow']}],view:'side',meta:()=>({pen:20,title:'Глубина',cue:'Чуть глубже'})};
  recordSet();const s=state.sets[0];
  assert.equal(s.partial,true);assert.equal(s.n,0);assert.equal(s.c,0);assert.equal(s.f.shallow,1);
  assert.equal(s.g.length,0);assert.match(s.note,/предварительные/);assert.match(s.note,/пяток/);
  toApp();const entry=JSON.parse(c.storage.get('aitrainer.inbox'))[0];
  assert.equal(entry.free,false);assert.equal(entry.sets[0].partial,true);assert.equal(entry.sets[0].analysisMode,'3d');
  assert.equal(entry.sets[0].ft[0].c,'Чуть глубже');assert.match(entry.sets[0].note,/предварительные/);
});

test('live inference keeps metric world coordinates and pixel coordinates separately',async()=>{
  const {pose,standing}=require('./helpers/pose-fixtures.cjs');
  const c=camera(),{state,infer}=c.api;let received;
  const raw=pose(standing(),Math.PI/4);
  state.on=true;
  state.detector={estimatePoses:async()=>[raw]};
  state.analyzer={update(kp){received=kp;return {status:'track',phase:'top',live:[]};},drain:()=>[]};
  await infer();
  assert.equal(received[11].world.z,raw.keypoints3D[11].z);
  assert.equal(received[11].x,raw.keypoints[11].x);
  assert.equal(state.frame.kp[11].x,raw.keypoints[11].x);
});

test('uploaded video runs the same 3D pipeline frame by frame and stores a limited assessment',async()=>{
  const {pose,squat,movement}=require('./helpers/pose-fixtures.cjs');
  const c=camera({videoTimers:true}),{state,el,analyzeVideo}=c.api;
  el.vid.duration=5;
  state.detector={estimatePoses:async(v,options,ms)=>[pose(squat(movement(ms/1000,90)),Math.PI/4)]};
  await analyzeVideo(new Blob(['synthetic input; decoding is stubbed']),'upload');
  assert.equal(state.analyzing,false);assert.equal(state.sets.length,1);assert.equal(state.sets[0].r,1);
  assert.equal(state.sets[0].file,true);assert.equal(state.sets[0].analysisMode,'3d');assert.equal(state.sets[0].partial,true);
  assert.equal(state.sets[0].n,0);assert.equal(state.frame.kp.hasWorld,true);
  URL.revokeObjectURL(state.file);
});

test('leg extension setup accepts one working leg and rejects mixed-side or hidden joints',()=>{
  const {pose,workingLegOnly,legExtension}=require('./helpers/pose-fixtures.cjs');
  const c=camera(),{toKp,checkSetup}=c.api,kp=toKp([pose(workingLegOnly(legExtension(0)),Math.PI/6)]);
  const snap={status:'track',phase:'top'};
  assert.equal(checkSetup(kp,640,480,snap,'leg_ext').ready,true);
  assert.equal(checkSetup(kp,640,480,snap,'pushdown').body,false);
  kp[25].score=0;kp[26].score=.98;
  assert.equal(checkSetup(kp,640,480,snap,'leg_ext').body,false);
});

test('live leg extensions start automatically with hidden head and arms, preserving calibration',async()=>{
  const {pose,workingLegOnly,legExtension,movement}=require('./helpers/pose-fixtures.cjs');
  const c=camera(),{state,infer}=c.api;
  state.ex='leg_ext';state.on=true;state.preflight=true;
  state.analyzer=c.run('AT.analyzerFor("leg_ext")');
  state.detector={estimatePoses:async()=>[pose(workingLegOnly(legExtension(movement(Math.max(0,c.run('performance.now()')/1000-1.6),85))),Math.PI/6)]};
  for(let i=0;i<=48;i++){c.time(i/30*1000);await infer();}
  assert.equal(state.preflight,false);assert.ok(state.analyzer.cal);assert.equal(state.analyzer.phase,'top');
  for(let i=49;i<=198;i++){c.time(i/30*1000);await infer();}
  assert.equal(state.analyzer.reps.length,1);assert.equal(state.sets.length,0);
});

test('hidden working knee keeps counting off and explains the missing joint',async()=>{
  const {pose,workingLegOnly,legExtension}=require('./helpers/pose-fixtures.cjs');
  const c=camera(),{state,infer,cueState}=c.api,p=pose(workingLegOnly(legExtension(0)),Math.PI/6);
  p.keypoints[25].score=0;p.keypoints3D[25].score=0;
  state.ex='leg_ext';state.on=true;state.preflight=true;state.analyzer=c.run('AT.analyzerFor("leg_ext")');
  state.detector={estimatePoses:async()=>[p]};
  for(let i=0;i<60;i++){c.time(i/30*1000);await infer();}
  assert.equal(state.preflight,true);assert.equal(state.sets.length,0);
  assert.match(cueState().text,/Счёт пока не включён/);assert.match(cueState().text,/колено/);
});

test('an unfinished repetition cannot suppress the no-result recovery prompt forever',()=>{
  const c=camera(),{state,el,helperCheck}=c.api;
  state.on=true;state.preflight=false;state.analyzer={reps:[],rep:{}};
  state.snap={status:'calib',phase:'setup',live:[]};c.time(26000);
  helperCheck();assert.equal(el.msg.hidden,false);assert.match(el.msgTitle.textContent,/Не получается посчитать/);
});

test('stopping an attempt with zero reps offers recovery even without MediaRecorder',()=>{
  const c=camera(),{state,el}=c.api;
  state.on=true;state.preflight=false;state.analyzer={reps:[]};state.snap={status:'world_lost',phase:'setup'};
  c.node('#mainBtn').click();
  assert.match(el.msgTitle.textContent,/Подход не распознан/);assert.equal(state.sets.length,0);assert.equal(state.on,true);
});

test('switching exercise saves recognized repetitions before replacing the analyzer',()=>{
  const {loadAT,feed,workingLegOnly,legExtension}=require('./helpers/pose-fixtures.cjs');
  const AT=loadAT(),c=camera(),{state,setExercise}=c.api;
  state.ex='leg_ext';state.on=true;state.preflight=false;
  state.analyzer=feed(AT,AT.analyzerFor('leg_ext'),x=>workingLegOnly(legExtension(x)),85,Math.PI/6);
  state.analyzer.setEnded=false;state.analyzer.drain();
  setExercise('db_curl');
  const saved=JSON.parse(c.storage.get('aitrainer.sets'));
  assert.equal(saved.leg_ext.sets[0].r,1);assert.equal(saved.leg_ext.sets.length,1);
  assert.equal(state.ex,'db_curl');assert.equal(state.sets.length,0);
});

test('uploaded seated leg extension at 20 degrees works with only one leg visible',async()=>{
  const {pose,workingLegOnly,legExtension,movement}=require('./helpers/pose-fixtures.cjs');
  const c=camera({videoTimers:true}),{state,el,analyzeVideo}=c.api;
  state.ex='leg_ext';el.vid.duration=5;
  state.detector={estimatePoses:async(v,opts,ms)=>[pose(workingLegOnly(legExtension(movement(ms/1000,85))),Math.PI/9)]};
  await analyzeVideo(new Blob(['synthetic video; decoding stubbed']),'upload');
  assert.equal(state.sets.length,1);assert.equal(state.sets[0].r,1);assert.equal(state.sets[0].partial,true);
  URL.revokeObjectURL(state.file);
});

test('video with unusable world points falls back to a focused 2D count without grading technique',async()=>{
  const {pose,workingLegOnly,legExtension,movement}=require('./helpers/pose-fixtures.cjs');
  const c=camera({videoTimers:true}),{state,el,analyzeVideo}=c.api;
  state.ex='leg_ext';el.vid.duration=10;
  state.detector={estimatePoses:async(v,opts,ms)=>{
    const p=pose(workingLegOnly(legExtension(movement(ms/1000%5,85))),Math.PI/4);
    p.keypoints3D.forEach(k=>k.score=.1);return [p];
  }};
  await analyzeVideo(new Blob(['synthetic video; decoding stubbed']),'upload');
  assert.equal(state.sets.length,1);assert.equal(state.sets[0].r,2);
  assert.equal(state.sets[0].countOnly,true);assert.equal(state.sets[0].n,0);assert.equal(state.sets[0].c,0);
  assert.match(el.msgText.textContent,/Проверь число/);
  URL.revokeObjectURL(state.file);
});

test('a camera frame resolved after closing cannot restore the frame or update the analyzer',async()=>{
  const c=camera(),{state,infer,stopCamera}=c.api;let resolveFrame,updates=0;
  const pending=new Promise(resolve=>{resolveFrame=resolve;});
  state.on=true;state.detector={estimatePoses:()=>pending};
  state.analyzer={reps:[],update(){updates++;},drain:()=>[]};
  const work=infer();stopCamera();resolveFrame([]);await work;
  assert.equal(state.on,false);assert.equal(state.frame,null);assert.equal(updates,0);assert.equal(state.busy,false);
});

test('a camera frame from the previous exercise cannot calibrate the newly selected exercise',async()=>{
  const c=camera(),{state,infer,setExercise}=c.api;let resolveFrame;
  state.on=true;state.detector={estimatePoses:()=>new Promise(resolve=>{resolveFrame=resolve;})};
  state.analyzer={reps:[],drain:()=>[]};
  const work=infer();setExercise('leg_ext');resolveFrame([]);await work;
  assert.equal(state.ex,'leg_ext');assert.equal(state.frame,null);assert.equal(state.snap,null);
  assert.equal(state.analyzer.cal,null);assert.equal(state.analyzer.reps.length,0);
});

test('cancelled video inference cannot resurrect analysis or save a late set',async()=>{
  const c=camera({videoTimers:true}),{state,el,analyzeVideo,stopCamera}=c.api;let resolveFrame,entered;
  const started=new Promise(resolve=>{entered=resolve;});
  state.ex='leg_ext';el.vid.duration=5;
  state.detector={estimatePoses:()=>{entered();return new Promise(resolve=>{resolveFrame=resolve;});}};
  const work=analyzeVideo(new Blob(['synthetic video']),'upload');
  await started;stopCamera();resolveFrame([]);await work;
  assert.equal(state.on,false);assert.equal(state.file,null);assert.equal(state.frame,null);
  assert.equal(state.analyzing,false);assert.equal(state.sets.length,0);
});

test('technical inference errors produce an error message rather than zero-repetition advice',async()=>{
  const c=camera({videoTimers:true,quietErrors:true}),{state,el,analyzeVideo}=c.api;let calls=0;
  state.ex='leg_ext';el.vid.duration=5;
  state.detector={estimatePoses:async()=>{calls++;throw Error('Synthetic decoder/model failure');}};
  await analyzeVideo(new Blob(['synthetic video']),'upload');
  assert.equal(calls,3);assert.equal(state.sets.length,0);assert.equal(state.analyzing,false);
  assert.match(el.msgTitle.textContent,/Не удалось обработать видео/);
  assert.match(el.msgText.textContent,/технической ошибки/);
  URL.revokeObjectURL(state.file);
});
