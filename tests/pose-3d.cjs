const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadAT,standing,curl,squat,pushup,lateralRaise,legExtension,workingLegOnly,pose,feed}=require('./helpers/pose-fixtures.cjs');

for(const [key,fixture,max] of [['bw_squat',squat,90],['pushup',pushup,100],['db_curl',curl,130],['lateral_raise',lateralRaise,95]]){
  test(key+': a full cycle counts once from front, back, side and oblique views',()=>{
    const AT=loadAT();let baseline;
    for(const yaw of [0,45,90,135,180,225,270,315]){
      const a=feed(AT,AT.analyzerFor(key),fixture,max,yaw*Math.PI/180);
      assert.ok(a,'Unknown exercise '+key);assert.equal(a.reps.length,1,'yaw '+yaw+' status '+a.status+' phase '+a.phase);
      assert.equal(a.analysisMode,'3d');assert.equal(a.reps[0].partial,true);assert.equal(a.reps[0].score,null);
      const faults=Array.from(a.reps[0].faultList).sort();
      if(baseline)assert.deepEqual(faults,baseline,'faults depend on camera yaw '+yaw);else baseline=faults;
    }
  });
}

test('metric elbow angle is invariant to camera yaw and ignores image-normalized z',()=>{
  const AT=loadAT();
  for(const yaw of [0,Math.PI/4,Math.PI/2,Math.PI]){
    const p=pose(curl(90),yaw);p.keypoints.forEach(k=>{k.x*=3;k.y*=7;k.z=999;});
    const kp=AT.projectWorld(AT.poseToKeypoints([p]),'side');
    assert.ok(Math.abs(AT.angle(kp[11],kp[13],kp[15])-90)<1e-6);
    assert.equal(p.keypoints[11].z,999);
  }
});

test('missing or low-confidence world joints abort the unfinished rep and require recalibration',()=>{
  const AT=loadAT(),a=AT.analyzerFor('db_curl');
  for(let i=0;i<30;i++)a.update(AT.poseToKeypoints([pose(curl(0))]),i/30);
  a.update(AT.poseToKeypoints([pose(curl(100))]),1);assert.ok(a.rep);
  const bad=pose(curl(120));bad.keypoints3D[13].score=.1;bad.keypoints3D[14].score=.1;
  const snap=a.update(AT.poseToKeypoints([bad]),1.1);
  assert.equal(snap.status,'world_lost');assert.equal(a.rep,null);assert.equal(a.cal,null);
  a.update(AT.poseToKeypoints([pose(curl(0))]),1.2);assert.equal(a.reps.length,0);
  const noWorld=pose(curl(0));delete noWorld.keypoints3D;
  assert.equal(a.update(AT.poseToKeypoints([noWorld]),1.3).status,'world_lost');assert.equal(a.analysisMode,'3d');
});

test('corrupt world landmarks cannot be interpreted as a good repetition',()=>{
  const AT=loadAT();
  for(const broken of ['nan','zero','short']){
    const a=AT.analyzerFor('bw_squat'),p=pose(standing());
    if(broken==='nan')p.keypoints3D.forEach(k=>k.x=NaN);
    if(broken==='zero')p.keypoints3D.forEach(k=>Object.assign(k,{x:0,y:0,z:0}));
    if(broken==='short')p.keypoints3D=p.keypoints3D.slice(0,12);
    for(let i=0;i<45;i++)a.update(AT.poseToKeypoints([p]),i/30);
    assert.equal(a.status,'world_lost',broken);assert.equal(a.reps.length,0);assert.equal(a.cal,null);
  }
});

test('2D fallback remains explicit and 2D-to-3D transition cannot complete a mixed-unit rep',()=>{
  const AT=loadAT(),a=AT.analyzerFor('db_curl');
  for(let i=0;i<30;i++){
    const p=pose(curl(0),Math.PI/2);delete p.keypoints3D;a.update(AT.poseToKeypoints([p]),i/30);
  }
  assert.equal(a.analysisMode,'2d');assert.ok(a.cal);
  const bent=pose(curl(100),Math.PI/2);delete bent.keypoints3D;
  a.update(AT.poseToKeypoints([bent]),1);assert.ok(a.rep);
  a.update(AT.poseToKeypoints([pose(curl(0))]),1.1);
  assert.equal(a.reps.length,0);assert.equal(a.rep,null);assert.equal(a.analysisMode,'3d');assert.equal(a.phase,'setup');
});

test('a timestamp gap cannot bridge an unfinished 3D cycle or inflate a plank hold',()=>{
  const AT=loadAT(),a=AT.analyzerFor('db_curl');
  for(let i=0;i<30;i++)a.update(AT.poseToKeypoints([pose(curl(0))]),i/30);
  a.update(AT.poseToKeypoints([pose(curl(100))]),1);
  a.update(AT.poseToKeypoints([pose(curl(0))]),10);
  assert.equal(a.reps.length,0);assert.equal(a.rep,null);
  const plank=AT.analyzerFor('plank');
  for(let i=0;i<=120;i++)plank.update(AT.poseToKeypoints([pose(pushup(0))]),i/30);
  plank.update(AT.poseToKeypoints([pose(pushup(0))]),30);
  assert.equal(plank.reps.length,1);assert.ok(plank.reps[0].extra.secs<=4.01);
});

test('completed reps survive loss of tracking, and a later clean cycle adds just one',()=>{
  const AT=loadAT(),a=feed(AT,AT.analyzerFor('db_curl'),curl,130);
  a.setEnded=false;
  a.update(null,5.1);assert.equal(a.reps.length,1);
  for(let i=0;i<=150;i++){
    const t=i/30,{movement}=require('./helpers/pose-fixtures.cjs');
    a.update(AT.poseToKeypoints([pose(curl(movement(t,130)),Math.PI/4)]),5.2+t);
  }
  assert.equal(a.reps.length,2);
});

test('a side plank with vertically stacked hips remains measurable in 3D',()=>{
  const AT=loadAT(),a=AT.analyzerFor('side_plank'),p=pushup(0);
  p.forEach(k=>{const x=k.x;k.x=0;k.y+=x;});
  for(let i=0;i<=120;i++)a.update(AT.poseToKeypoints([pose(p,Math.PI/4)]),i/30);
  a.endSet();assert.equal(a.reps.length,1);assert.ok(a.reps[0].extra.secs>=3.9);
});

test('seated leg extensions at 20–45 degrees need only hip, knee and ankle of one leg',()=>{
  const AT=loadAT();
  for(const degrees of [20,30,45,90,160]){
    const a=feed(AT,AT.analyzerFor('leg_ext'),x=>workingLegOnly(legExtension(x)),85,degrees*Math.PI/180);
    assert.equal(a.reps.length,1,'yaw '+degrees+' status '+a.status);
    assert.equal(a.reps[0].partial,true);assert.ok(a.reps[0].extra.ext_sig>170);
  }
});

test('the fallback for leg extensions cannot count unrelated arm curls',()=>{
  const AT=loadAT(),a=feed(AT,new AT.FreeAnalyzer('normal','leg_ext',true),curl,130,Math.PI/4);
  assert.equal(a.reps.length,0);
});

test('image-only counter works when world landmarks are unreliable, without switching units',()=>{
  const AT=loadAT(),a=new AT.FreeAnalyzer('normal','leg_ext',true),{movement}=require('./helpers/pose-fixtures.cjs');
  for(let i=0;i<=150;i++){
    const p=pose(workingLegOnly(legExtension(movement(i/30,85))),Math.PI/4);
    p.keypoints3D.forEach(k=>k.score=.1);
    a.update(AT.poseToKeypoints([p]),i/30);
  }
  a.endSet();assert.equal(a.reps.length,1);assert.equal(a.analysisMode,'2d');
});
