// Manufactured joint trajectories; no user images, video or landmark coordinates.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadAT,pose,legExtension,workingLegOnly,curl}=require('./helpers/pose-fixtures.cjs');
function series(t) {
  if(t<24) {
    const n=Math.floor(t/2),u=t%2;
    return u<.8 ? (n?0:-30)+(70-(n?0:-30))*u/.8 : 70*(2-u)/1.2;
  }
  if(t<27)return 0;
  if(t<28)return 70*(t-27);
  if(t<31)return 70+5*Math.sin(t*17);
  if(t<32.2)return 70*(32.2-t)/1.2;
  return 0;
}
function run(a,AT,fn,duration,fps=10,edit=()=>{}) {
  for(let i=0;i<=Math.ceil(duration*fps);i++){
    const t=i/fps,p=pose(workingLegOnly(legExtension(fn(t))),Math.PI/6);edit(p,t);
    a.update(AT.poseToKeypoints([p]),t);a.drain();
  }
  return a;
}
test('continuous seated extensions count 12 + 1 with a deeper initial bend and a noisy final hold',()=>{
  const AT=loadAT();
  for(const fps of [8,10,15,30]) {
    const a=run(AT.analyzerFor('leg_ext'),AT,series,33,fps);
    assert.equal(a.reps.length,13,'fps '+fps);assert.equal(a.reps[12].n,13);
    assert.equal(a.reps[0].partial,true);assert.equal(a.reps[0].score,null);
  }
});
test('image counter also follows directed cycles without counting a held extension twice',()=>{
  const AT=loadAT(),a=run(new AT.LegExtensionAnalyzer('normal',true),AT,series,33,10,
    p=>p.keypoints3D.forEach(k=>k.score=.1));
  assert.equal(a.reps.length,13);assert.equal(a.analysisMode,'2d');
});
test('a clip beginning at the extended position excludes the unseen first ascent',()=>{
  const AT=loadAT(),a=run(AT.analyzerFor('leg_ext'),AT,t=>{
    if(t<1)return 70*(1-t);
    const u=(t-1)%2;return u<1?70*u:70*(2-u);
  },5);
  assert.equal(a.reps.length,2);
});
test('jitter, small movements and unrelated arm curls do not create leg repetitions',()=>{
  const AT=loadAT();
  for(const fn of [t=>60+10*Math.sin(t*8),t=>10+10*Math.sin(t*2),t=>Math.abs(t-2)<.01?85:0]){
    const a=run(AT.analyzerFor('leg_ext'),AT,fn,12);assert.equal(a.reps.length,0);
  }
  const a=AT.analyzerFor('leg_ext');
  for(let i=0;i<100;i++)a.update(AT.poseToKeypoints([pose(curl(70+60*Math.sin(i/8)))]),i/10);
  assert.equal(a.reps.length,0);
});
test('hidden knee and timestamp gaps cannot complete an unfinished extension',()=>{
  const AT=loadAT();
  for(const mode of ['3d','2d']) {
    const a=mode==='3d'?AT.analyzerFor('leg_ext'):new AT.LegExtensionAnalyzer('normal',true);
    const put=(extension,t,bad=false)=>{
      const p=pose(workingLegOnly(legExtension(extension)),Math.PI/6);
      if(bad){p.keypoints[25].score=0;p.keypoints3D[25].score=0;}
      a.update(AT.poseToKeypoints([p]),t);
    };
    [0,15,35,55,70].forEach((x,i)=>put(x,i/10));
    put(65,.5,true);put(0,.6);assert.equal(a.reps.length,0,mode);
    [0,15,35,55,70].forEach((x,i)=>put(x,.7+i/10));
    put(0,8);assert.equal(a.reps.length,0,mode+' gap');
  }
});
test('visibility changes cannot splice two different legs into one cycle',()=>{
  const AT=loadAT(),a=AT.analyzerFor('leg_ext');
  for(let i=0;i<30;i++){
    const p=pose(legExtension(i<10?i*7:0),Math.PI/6);
    if(i>=10)for(const n of [23,25,27]){p.keypoints[n].score=0;p.keypoints3D[n].score=0;}
    a.update(AT.poseToKeypoints([p]),i/10);
  }
  assert.equal(a.reps.length,0);
});
