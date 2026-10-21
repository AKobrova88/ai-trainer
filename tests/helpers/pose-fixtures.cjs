// Synthetic skeletons test geometry/control flow, not the model's recognition accuracy.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function loadAT(){
  const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
  const code=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('Technique analyzers'));
  const context=vm.createContext({module:{exports:{}}});vm.runInContext(code,context);
  const AT=context.module.exports;AT.setData(JSON.parse(html.match(/const EX = (.*);/)[1]));return AT;
}
function standing(){
  const points=Array.from({length:33},()=>({x:0,y:0,z:0,score:0}));
  for(const [side,x] of [[0,-.16],[1,.16]]){
    const set=(i,y,z=0,xx=x)=>{points[i+side]={x:xx,y,z,score:.98};};
    set(7,-.67);set(11,-.5);set(13,-.2);set(15,.1);
    set(23,0);set(25,.43);set(27,.86);set(29,.88,-.05);set(31,.88,.14);
  }
  points[0]={x:0,y:-.7,z:.06,score:.98};return points;
}
function curl(flex){
  const p=standing(),r=flex*Math.PI/180;
  for(const i of [15,16]){p[i].y=-.2+.3*Math.cos(r);p[i].z=.3*Math.sin(r);}
  return p;
}
function squat(flex){
  const p=standing(),thigh=flex*Math.PI/180,shin=thigh*.39;
  for(const s of [0,1]){
    p[25+s].y=.43*Math.cos(thigh);p[25+s].z=.43*Math.sin(thigh);
    p[27+s].y=p[25+s].y+.43*Math.cos(shin);p[27+s].z=p[25+s].z-.43*Math.sin(shin);
    p[29+s].y=p[27+s].y+.02;p[29+s].z=p[27+s].z-.05;
    p[31+s].y=p[27+s].y+.02;p[31+s].z=p[27+s].z+.14;
    p[11+s].z=.12*Math.sin(thigh);p[13+s].z=p[11+s].z;p[15+s].z=p[11+s].z;
  }
  return p;
}
function pushup(flex){
  const p=standing(),r=flex*Math.PI/180;
  for(const s of [0,1]){
    Object.assign(p[11+s],{y:-.08,z:.6});Object.assign(p[13+s],{y:.22,z:.6});
    Object.assign(p[15+s],{y:.22+.3*Math.cos(r),z:.6+.3*Math.sin(r)});
    Object.assign(p[25+s],{y:.06,z:-.5});Object.assign(p[27+s],{y:.12,z:-1});
    p[7+s].score=0;
  }
  return p;
}
function lateralRaise(flex){
  const p=standing(),r=flex*Math.PI/180;
  for(const s of [0,1]){
    const sign=s?1:-1,x=p[11+s].x;
    Object.assign(p[13+s],{x:x+sign*.3*Math.sin(r),y:-.5+.3*Math.cos(r)});
    Object.assign(p[15+s],{x:x+sign*.6*Math.sin(r),y:-.5+.6*Math.cos(r)});
  }
  return p;
}
function legExtension(extension){
  const p=standing(),r=extension*Math.PI/180;
  for(const s of [0,1]){
    Object.assign(p[25+s],{y:0,z:.43});
    Object.assign(p[27+s],{y:.43*Math.cos(r),z:.43+.43*Math.sin(r)});
    Object.assign(p[29+s],{y:p[27+s].y+.02,z:p[27+s].z-.05});
    Object.assign(p[31+s],{y:p[27+s].y+.02,z:p[27+s].z+.14});
  }
  return p;
}
function workingLegOnly(points){
  return points.map((p,i)=>({...p,score:[23,25,27].includes(i)?p.score:0}));
}
function pose(points,yaw=0){
  const c=Math.cos(yaw),s=Math.sin(yaw);
  const keypoints3D=points.map(p=>({...p,x:p.x*c+p.z*s,z:-p.x*s+p.z*c}));
  // Deliberately incompatible normalized z: analysis must use keypoints3D instead.
  const keypoints=keypoints3D.map(p=>({x:320+p.x*180,y:200+p.y*180,z:p.z*.01,score:p.score}));
  return {keypoints,keypoints3D};
}
function movement(t,max){
  if(t<1||t>=4)return 0;
  return max*(t<2.5?(t-1)/1.5:(4-t)/1.5);
}
function feed(AT,a,fixture,max,yaw=0){
  for(let i=0;i<=150;i++){
    const t=i/30;a.update(AT.poseToKeypoints([pose(fixture(movement(t,max)),yaw)]),t);
  }
  a.endSet();return a;
}
module.exports={loadAT,standing,curl,squat,pushup,lateralRaise,legExtension,workingLegOnly,pose,movement,feed};
