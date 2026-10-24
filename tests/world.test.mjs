import test from 'node:test';
import assert from 'node:assert/strict';
import {kneeBend3D, WorldSmoother} from '../src/measurement.mjs';
const p=(x,y,z)=>({x,y,z,visibility:1,presence:1});
const image=Array.from({length:33},()=>({x:.5,y:.5,visibility:1,presence:1}));
const pose=(points,ids=[24,26,28])=>{const result=Array(33).fill(null);ids.forEach((id,i)=>result[id]=points[i]);return result;};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('3D angles include depth, with zero for straight and 90 for right-angle bend',()=>{
  close(kneeBend3D(pose([p(0,-.4,0),p(0,0,0),p(0,.4,0)]),image,'right'),0);
  close(kneeBend3D(pose([p(0,-.4,0),p(0,0,0),p(0,0,.4)]),image,'right'),90);
  close(kneeBend3D(pose([p(0,-.4,0),p(0,0,0),p(0,-.3,.3)]),image,'right'),135);
});
test('3D angle is invariant to translation, rotation and uniform scale',()=>{
  const points=[p(0,-.4,0),p(0,0,0),p(.2,.2,.2)];
  const expected=kneeBend3D(pose(points),image,'right');
  for(const theta of [.1,1,2.5]){
    const transformed=points.map(q=>p(2*(q.x*Math.cos(theta)-q.z*Math.sin(theta))+3,2*q.y-4,2*(q.x*Math.sin(theta)+q.z*Math.cos(theta))+5));
    close(kneeBend3D(pose(transformed),image,'right'),expected);
  }
});
test('world geometry rejects missing depth, unreliable images, collapsed segments and wrong side',()=>{
  const world=pose([p(0,-.4,0),p(0,0,0),p(0,0,.4)]);
  assert.equal(kneeBend3D(world,image,'left'),null);
  assert.equal(kneeBend3D(world,image,'unknown'),null);
  for(const bad of [null,{...p(0,0,0),z:NaN},{...p(0,0,0),visibility:.1},{...p(0,0,0),presence:.1}]){
    const invalid=world.slice();invalid[26]=bad;assert.equal(kneeBend3D(invalid,image,'right'),null);
  }
  const hidden=image.map(q=>({...q}));hidden[26].x=-.1;
  assert.equal(kneeBend3D(world,hidden,'right'),null);
  assert.equal(kneeBend3D(pose([p(0,0,0),p(0,0,0),p(0,0,.4)]),image,'right'),null);
  close(kneeBend3D(pose([p(0,-.4,0),p(0,0,0),p(0,0,.4)],[23,25,27]),image,'left'),90);
});
test('world display smooths depth and resets hidden joints and gaps',()=>{
  const filter=new WorldSmoother();const img=[image[0]];
  filter.add([p(-.2,.3,-.4)],img,0);
  const result=filter.add([p(.2,.7,.4)],img,100)[0];
  assert.ok(result.z>-.4 && result.z<.4);assert.ok(result.x>-.2 && result.x<.2);
  assert.equal(filter.add([p(.2,.7,.4)],[{...img[0],visibility:.1}],200)[0],null);
  close(filter.add([p(.2,.7,.4)],img,300)[0].z,.4);
  close(filter.add([p(.2,.7,-.4)],img,900)[0].z,-.4);
  assert.equal(filter.add(null,img,1000),null);
});
