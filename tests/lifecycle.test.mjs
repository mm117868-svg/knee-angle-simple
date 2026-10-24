import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const settle=()=>new Promise(resolve=>setImmediate(resolve));

async function harness(useWorld=false){
  const camera=deferred(), engine=deferred(), elements=new Map(), events={}, frames=new Map(), timers=new Map();
  let serial=0,time=100,stops=0,closes=0;
  const context2d=new Proxy({}, {get:()=>()=>{},set:()=>true});
  function el(id){
    if(!elements.has(id))elements.set(id,{textContent:'',value:'',hidden:false,disabled:false,dataset:{},handlers:{},
      classList:{toggle(){}},selectedOptions:[{textContent:'Right knee'}],
      addEventListener(name,fn){this.handlers[name]=fn;}, getContext:()=>context2d,
      pause(){},async play(){},readyState:4,currentTime:1,videoWidth:640,videoHeight:480});
    return elements.get(id);
  }
  el('side').value='right';el('camera-choice').value='user';
  const track={stop(){stops++;},getSettings:()=>({facingMode:'user'}),addEventListener(){}};
  const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
  const model={close(){closes++;},detectForVideo(){return {landmarks:[]};}};
  const document={documentElement:{dataset:{poseSpace:useWorld?'world':'image'}},hidden:false,getElementById:el,addEventListener:(name,fn)=>events[name]=fn};
  const sandbox=vm.createContext({document,window:{isSecureContext:true,addEventListener:(name,fn)=>events[name]=fn},
    navigator:{mediaDevices:{getUserMedia:()=>camera.promise}},performance:{now:()=>time},URL,Date,Math,console,
    setTimeout:(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
    setInterval:fn=>events.watchdog=fn,requestAnimationFrame:fn=>{const id=++serial;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)});
  const vision=new vm.SyntheticModule(['FilesetResolver','PoseLandmarker'],function(){
    this.setExport('FilesetResolver',{forVisionTasks:async()=>({})});
    this.setExport('PoseLandmarker',{createFromOptions:()=>engine.promise});
  },{context:sandbox});await vision.link(()=>{});await vision.evaluate();
  const geometry=new vm.SourceTextModule(await readFile(new URL('../src/measurement.mjs',import.meta.url),'utf8'),{context:sandbox});
  const app=new vm.SourceTextModule(await readFile(new URL('../src/app.mjs',import.meta.url),'utf8'),{
    context:sandbox,initializeImportMeta:meta=>meta.url=new URL('../src/app.mjs',import.meta.url).href,importModuleDynamically:()=>vision});
  const worldView=new vm.SyntheticModule(['WorldView'],function(){this.setExport('WorldView',class {update(){} reset(){}});},{context:sandbox});
  await app.link(specifier=>specifier.includes('world-view')?worldView:geometry);await app.evaluate();
  return {el,camera,engine,stream,model,events,timers,document,
    click:id=>el(id).handlers.click(),stats:()=>({stops,closes}),
    async ready(){this.click('start');camera.resolve(stream);engine.resolve(model);await settle();},
    frame(at){time=at;el('video').currentTime+=1;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(at));},
    time(at){time=at;},
  };
}

test('camera denial returns to usable controls without displaying an angle',async()=>{
  const h=await harness();const run=h.click('start');
  h.camera.reject(Object.assign(new Error('denied'),{name:'NotAllowedError'}));await run;
  assert.equal(h.el('start').textContent,'Start camera');assert.equal(h.el('angle').textContent,'--');
  assert.match(h.el('status').textContent,/not allowed/);assert.equal(h.el('camera-choice').disabled,false);
});
test('cancelling before camera permission resolves releases a late stream',async()=>{
  const h=await harness();const run=h.click('start');h.click('start');h.camera.resolve(h.stream);await run;
  assert.equal(h.stats().stops,1);assert.equal(h.el('video').srcObject,null);assert.equal(h.el('start').textContent,'Start camera');
});
test('cancelling model loading closes the late model and stops the camera',async()=>{
  const h=await harness();const run=h.click('start');h.camera.resolve(h.stream);await settle();
  h.click('start');h.engine.resolve(h.model);await run;
  assert.deepEqual(h.stats(),{stops:1,closes:1});assert.equal(h.el('video').srcObject,null);
});
test('camera timeout releases a stream granted after the timeout',async()=>{
  const h=await harness();const run=h.click('start');[...h.timers.values()].find(t=>t.ms===25000).fn();await run;
  h.camera.resolve(h.stream);await settle();assert.equal(h.stats().stops,1);assert.match(h.el('status').textContent,/taking a while/);
});
test('missing joints, frozen frames and backgrounding clear live angles',async()=>{
  const h=await harness();await h.ready();
  const landmarks=Array.from({length:33},()=>({x:.5,y:.5,visibility:1,presence:1}));
  landmarks[24].y=.1;landmarks[26].y=.5;landmarks[28].y=.9;
  h.model.detectForVideo=()=>({landmarks:[landmarks]});h.frame(100);
  assert.equal(h.el('angle').textContent,'0');assert.equal(h.el('capture').disabled,false);
  h.time(1000);h.events.watchdog();assert.equal(h.el('angle').textContent,'--');assert.equal(h.el('capture').disabled,true);
  h.frame(1100);assert.equal(h.el('angle').textContent,'0');
  h.model.detectForVideo=()=>({landmarks:[]});h.frame(1200);assert.equal(h.el('angle').textContent,'--');
  h.document.hidden=true;h.events.visibilitychange();assert.deepEqual(h.stats(),{stops:1,closes:1});
});
test('changing anatomical side cancels an in-progress capture',async()=>{
  const h=await harness();await h.ready();
  const landmarks=Array.from({length:33},()=>({x:.5,y:.5,visibility:1,presence:1}));
  landmarks[24].y=.1;landmarks[28].y=.9;h.model.detectForVideo=()=>({landmarks:[landmarks]});h.frame(100);
  h.click('capture');assert.equal(h.el('capture').textContent,'Taking reading…');
  h.el('side').value='left';h.el('side').selectedOptions=[{textContent:'Left knee'}];h.el('side').handlers.change();
  assert.equal(h.el('capture').textContent,'Save a reading');assert.equal(h.el('angle').textContent,'--');
  assert.equal([...h.timers.values()].filter(t=>t.ms===4000).length,0);
});

test('readout updates slowly while invalid tracking still clears it immediately',async()=>{
  const h=await harness();await h.ready();
  const landmarks=Array.from({length:33},()=>({x:.5,y:.5,visibility:1,presence:1}));
  landmarks[24].y=.1;landmarks[28].y=.9;
  h.model.detectForVideo=()=>({landmarks:[landmarks]});h.frame(100);
  assert.equal(h.el('angle').textContent,'0');
  landmarks[28].x=.8;landmarks[28].y=.5;
  h.frame(200);h.frame(300);assert.equal(h.el('angle').textContent,'0');
  h.frame(400);assert.ok(Number(h.el('angle').textContent)>0 && Number(h.el('angle').textContent)<90);
  h.model.detectForVideo=()=>({landmarks:[]});h.frame(500);assert.equal(h.el('angle').textContent,'--');
  h.model.detectForVideo=()=>({landmarks:[landmarks]});h.frame(600);assert.equal(h.el('angle').textContent,'90');
});


test('3D mode uses world depth and never substitutes a 2D angle',async()=>{
  const h=await harness(true);await h.ready();
  const image=Array.from({length:33},()=>({x:.5,y:.5,visibility:1,presence:1}));
  image[24].y=.1;image[28].y=.9;
  const world=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:1}));
  world[24]={x:0,y:-.4,z:0,visibility:1};world[28]={x:0,y:0,z:.4,visibility:1};
  h.model.detectForVideo=()=>({landmarks:[image],worldLandmarks:[world]});h.frame(100);
  assert.equal(h.el('angle').textContent,'90');
  h.click('capture');for(let t=200;t<=2300;t+=100)h.frame(t);
  assert.equal(h.el('saved-angle').textContent,'90°');
  assert.match(h.el('saved-detail').textContent,/Estimated 3D/);
  h.model.detectForVideo=()=>({landmarks:[image]});h.frame(2400);
  assert.equal(h.el('angle').textContent,'--');assert.equal(h.el('capture').disabled,true);
  h.model.detectForVideo=()=>({landmarks:[image],worldLandmarks:[world]});h.frame(2500);
  image[26].visibility=.1;h.frame(2600);assert.equal(h.el('angle').textContent,'--');
});
