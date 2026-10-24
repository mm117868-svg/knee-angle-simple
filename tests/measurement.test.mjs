import test from 'node:test';
import assert from 'node:assert/strict';
import { kneeBend, visible, AngleWindow, LandmarkSmoother, summariseReading, CONNECTIONS } from '../src/measurement.mjs';

const p=(x,y,visibility=1)=>({x,y,visibility,presence:1});
function pose(points,side='right'){const out=Array(33).fill(null);const ids=side==='right'?[24,26,28]:[23,25,27];ids.forEach((id,i)=>out[id]=points[i]);return out;}
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<0.000001,`${actual} != ${expected}`);

test('straight knee is zero, right-angle bend is 90, deep bend is 135',()=>{
  close(kneeBend(pose([p(.5,.1),p(.5,.5),p(.5,.9)]),'right',640,480),0);
  close(kneeBend(pose([p(.5,.1),p(.5,.5),p(.8,.5)]),'right',640,480),90);
  close(kneeBend(pose([p(.5,.1),p(.5,.5),p(.7,.3)]),'right',500,500),135);
});
test('aspect-correct geometry is invariant across portrait, landscape and mirror',()=>{
  for(const [w,h] of [[640,480],[480,640],[1280,720]]){
    const points=[p(250/w,100/h),p(250/w,300/h),p(350/w,400/h)];
    close(kneeBend(pose(points),'right',w,h),45);
    close(kneeBend(pose(points.map(q=>({...q,x:1-q.x}))),'right',w,h),45);
  }
});
test('anatomical left/right selection does not substitute the other leg',()=>{
  const points=pose([p(.5,.1),p(.5,.5),p(.8,.5)],'left');
  close(kneeBend(points,'left',640,480),90);
  assert.equal(kneeBend(points,'right',640,480),null);
});
test('missing, hidden, out-of-frame and degenerate joints produce no angle',()=>{
  for(const bad of [null,p(.5,.5,.1),p(-.1,.5),p(NaN,.5),{x:.5,y:.5},{...p(.5,.5),presence:.1}]){
    assert.equal(kneeBend(pose([p(.5,.1),bad,p(.5,.9)]),'right',640,480),null);
  }
  assert.equal(kneeBend(pose([p(.5,.5),p(.5,.5),p(.8,.8)]),'right',640,480),null);
  assert.equal(kneeBend([], 'other',640,480),null);
  assert.equal(kneeBend([], 'right',0,480),null);
  assert.equal(visible({x:.4,y:.5,visibility:NaN}),false);
});
test('short average smooths jitter but resets on tracking loss or long gaps',()=>{
  const w=new AngleWindow();close(w.add(60,0),60);close(w.add(64,100),62);
  assert.equal(w.add(null,200),null);close(w.add(100,250),100);
  close(w.add(30,1000),30);close(w.add(10,900),10);
});
test('reading tolerates jitter, resists outliers and requires distinct time coverage',()=>{
  const samples=[59,61,60,62,59,60,61,58,60,160].map((angle,i)=>({angle,time:i*100}));
  const result=summariseReading(samples);close(result.angle,60.25);
  assert.equal(result.count,10);assert.equal(result.min,58);assert.equal(result.max,160);
  assert.equal(summariseReading(samples.slice(0,4)),null);
  assert.equal(summariseReading(samples.map(p=>({...p,time:0}))),null);
});
test('skeleton covers face, torso, arms, hands, both legs and feet',()=>{
  const ids=new Set(CONNECTIONS.flat());assert.equal(ids.size,33);
});

test('live averaging suppresses alternating noise and follows a sustained angle change',()=>{
  const w=new AngleWindow();const outputs=[];
  for(let t=0;t<=1400;t+=100){const output=w.add(t%200===0?55:65,t);if(t>=700)outputs.push(output);}
  assert.ok(Math.max(...outputs)-Math.min(...outputs)<2);
  let result;for(let t=1500;t<=2300;t+=100)result=w.add(90,t);
  close(result,90);
});
test('skeleton smoothing reduces jitter without modifying input coordinates',()=>{
  const filter=new LandmarkSmoother();const values=[];
  for(let i=0;i<30;i++){
    const input=p(i%2===0?.48:.52,.5);const original={...input};
    const result=filter.add([input],i*65);assert.deepEqual(input,original);
    if(i>10)values.push(result[0].x);
  }
  assert.ok(Math.max(...values)-Math.min(...values)<.015);
});
test('skeleton follows sustained movement consistently at different frame rates',()=>{
  function moved(dt){const f=new LandmarkSmoother();f.add([p(.3,.5)],0);let result;for(let t=dt;t<=500;t+=dt)result=f.add([p(.7,.5)],t);return result[0].x;}
  close(moved(50),moved(100));assert.ok(moved(50)>.68);
});
test('hidden joints and tracking gaps discard skeleton history immediately',()=>{
  const f=new LandmarkSmoother();f.add([p(.3,.5)],0);
  assert.equal(f.add([p(.7,.5,.1)],65)[0],null);
  close(f.add([p(.7,.5)],130)[0].x,.7);
  assert.equal(f.add(null,195),null);close(f.add([p(.2,.5)],260)[0].x,.2);
  close(f.add([p(.8,.5)],1000)[0].x,.8);
  f.reset();close(f.add([p(.4,.5)],1065)[0].x,.4);
});
