// Browser IO is stubbed; the actual camera UI/state-machine code runs unchanged.
// This checks control flow, not MediaPipe recognition accuracy.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function camera() {
  const nodes = new Map(), storage = new Map();
  let time = 0;
  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const attributes = new Map();
    const el = {value:'',textContent:'',innerHTML:'',dataset:{},hidden:true,disabled:false,
      width:640,height:480,videoWidth:640,videoHeight:480,readyState:2,paused:false,
      classList:{add(){},remove(){},toggle(){},contains(){return false;}},
      style:{setProperty(){}},addEventListener(){},appendChild(){},load(){},pause(){},play:async()=>{},
      setAttribute:(k,v)=>attributes.set(k,v),getAttribute:k=>attributes.get(k),removeAttribute:k=>attributes.delete(k),
      getBoundingClientRect:()=>({width:640,height:480,left:0,top:0}),
      getContext:()=>({setTransform(){}}),
      querySelectorAll:()=>[],scrollIntoView(){}};
    nodes.set(id,el); return el;
  }
  const context = vm.createContext({
    URL,URLSearchParams,Date,console,performance:{now:()=>time},
    location:{href:'http://localhost/?ex=bw_squat&src=app&ret=%2Fapp%2F',hostname:'localhost',protocol:'http:',origin:'http://localhost',search:'?ex=bw_squat&src=app&ret=%2Fapp%2F',hash:''},
    navigator:{userAgent:'Unit test'},
    document:{querySelector:node,querySelectorAll:()=>[],createElement:()=>node(Symbol()),documentElement:node('html'),addEventListener(){}},
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    getComputedStyle:()=>({getPropertyValue:()=> '#12151f'}),
    ResizeObserver:class{observe(){}},MutationObserver:class{observe(){}},
    setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame(){},
    addEventListener(){},matchMedia:()=>({addEventListener(){}}),
    btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),
  });
  context.window=context;
  const html = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  for (let source of scripts.filter(s=>s.includes('Technique analyzers')||s.includes('const EX = '))) {
    if (source.includes('const EX = ')) {
      const end = source.lastIndexOf('})();');
      source = source.slice(0,end)+'window.__testCamera={state,el,infer,beginPreparedSet,stopCamera,recordSet,toApp};\n'+source.slice(end);
    }
    vm.runInContext(source,context);
  }
  return {api:context.__testCamera,storage,time:t=>{time=t;},run:s=>vm.runInContext(s,context)};
}

const rep = () => ({n:1,faultList:[],extra:{},grade:'good'});
test('preparation discards analyzer events and requires a stable frame before starting', async()=>{
  const c=camera(), {state,el,infer,beginPreparedSet}=c.api;
  const kp=Array.from({length:33},()=>({x:200,y:200,score:.9}));
  state.on=true;state.preflight=true;
  state.detector={estimatePoses:async()=>[{keypoints:kp}]};
  state.analyzer={reps:[rep()],update:()=>({status:'track',phase:'top',live:[]}),drain:()=>[{type:'setEnd'}]};
  beginPreparedSet(); assert.equal(state.preflight,true);
  await infer(); assert.equal(state.preflightReady,false);
  c.time(800);await infer();assert.equal(state.preflightReady,true);
  assert.equal(state.sets.length,0);
  beginPreparedSet();assert.equal(state.preflight,false);
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
