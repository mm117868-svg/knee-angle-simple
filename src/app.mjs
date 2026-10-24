import { SIDES, CONNECTIONS, visible, kneeBend, kneeBend3D, AngleWindow, LandmarkSmoother, summariseReading } from './measurement.mjs?v=3';

import {WorldView} from './world-view.mjs?v=3';

const $ = id => document.getElementById(id);
const video=$('video'), canvas=$('overlay'), ctx=canvas.getContext('2d');
const useWorld=document.documentElement?.dataset.poseSpace==='world';
const worldView=useWorld ? new WorldView($('world-canvas'),$('coordinates'),$('reset-view')) : null;
const smoother=new AngleWindow();
const skeletonSmoother=new LandmarkSmoother();
let state='idle', generation=0, stream=null, model=null, raf=0;
let lastVideoTime=-1, lastFrameAt=0, lastGoodAt=0, capture=null, captureTimer=0;
let lastReadoutAt=null;

function status(message,tone='') {
  if ($('status').textContent !== message) $('status').textContent=message;
  $('status-dot').dataset.tone=tone;
}

function clearAngle() {
  smoother.reset(); lastGoodAt=0; lastReadoutAt=null;
  $('angle').textContent='--'; $('capture').disabled=true;
}

function cancelCapture(message) {
  capture=null; clearTimeout(captureTimer);
  $('capture-help').hidden=true;
  $('capture').textContent='Save a reading';
  if (message) status(message);
}

function stop(message='Camera stopped. Your last saved reading stays below.') {
  generation++; state='idle'; cancelAnimationFrame(raf); cancelCapture();
  stream?.getTracks().forEach(track=>track.stop()); stream=null;
  video.pause(); video.srcObject=null;
  try { model?.close(); } catch { /* Camera release must still complete. */ }
  model=null;
  skeletonSmoother.reset(); worldView?.reset(); lastFrameAt=0;
  ctx.clearRect(0,0,canvas.width,canvas.height); clearAngle();
  $('start').textContent='Start camera'; $('camera-choice').disabled=false;
  $('camera-empty').hidden=false; $('camera-label').textContent='Camera off';
  status(message);
}

function deadline(promise, ms, message, dispose=()=>{}) {
  let finished=false;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{finished=true;reject(new Error(message));},ms);
    promise.then(value=>{
      if (finished) { dispose(value); return; }
      finished=true; clearTimeout(timer); resolve(value);
    },error=>{if (!finished) {finished=true;clearTimeout(timer);reject(error);}});
  });
}

async function createModel() {
  const {FilesetResolver,PoseLandmarker}=await import('../vendor/vision_bundle.mjs');
  const files=await FilesetResolver.forVisionTasks(new URL('../vendor/wasm',import.meta.url).href);
  const options={
    baseOptions:{modelAssetPath:new URL('../models/pose_landmarker_full.task',import.meta.url).href,delegate:'GPU'},
    runningMode:'VIDEO',numPoses:1,
    minPoseDetectionConfidence:0.5,minPosePresenceConfidence:0.5,minTrackingConfidence:0.5,
    outputSegmentationMasks:false
  };
  try { return await PoseLandmarker.createFromOptions(files,options); }
  catch { options.baseOptions.delegate='CPU'; return await PoseLandmarker.createFromOptions(files,options); }
}

function errorMessage(error) {
  if (['NotAllowedError','PermissionDeniedError'].includes(error.name)) return 'Camera access was not allowed. Allow it in your browser and device privacy settings, then try again.';
  if (error.name==='NotFoundError') return 'No camera was found. Connect a camera or try this page on your iPhone.';
  if (error.name==='NotReadableError') return 'The camera is busy or unavailable. Close other camera apps, then try again.';
  return error.message || 'The camera could not start. Reload the page and try again.';
}

async function start() {
  const current=++generation; state='starting'; clearAngle();
  $('start').textContent='Cancel'; $('camera-choice').disabled=true;
  status('Allow camera access when your browser asks.','busy');
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Open the HTTPS website in Safari or Chrome to use the camera.');
    const newStream=await deadline(navigator.mediaDevices.getUserMedia({
      audio:false,video:{facingMode:{ideal:$('camera-choice').value},width:{ideal:640},height:{ideal:480},frameRate:{ideal:24,max:30}}
    }),25000,'Camera access is taking a while. Allow access and try again.',s=>s.getTracks().forEach(t=>t.stop()));
    if (current!==generation) {newStream.getTracks().forEach(t=>t.stop());return;}
    stream=newStream; video.srcObject=stream; video.muted=true;
    await deadline(video.play(),10000,'The camera preview did not start. Please try again.');
    if (current!==generation) return;
    const track=stream.getVideoTracks()[0];
    $('camera-frame').classList.toggle('mirrored',track.getSettings().facingMode==='user' || (!track.getSettings().facingMode && $('camera-choice').value==='user'));
    $('camera-empty').hidden=true; $('camera-label').textContent='Loading skeleton';
    status('Preparing the movement model. The first load may take a moment.','busy');
    const newModel=await deadline(createModel(),45000,'The movement model could not load in time. Check your connection and try again.',m=>m.close());
    if (current!==generation) {newModel.close();return;}
    model=newModel; state='running'; lastVideoTime=-1; lastFrameAt=0;
    $('start').textContent='Stop camera'; $('camera-label').textContent='Live · on your device';
    status('Keep your whole body in view, with the selected knee facing the camera.');
    track.addEventListener('ended',()=>{if(current===generation)stop('The camera disconnected. Start it again when ready.');},{once:true});
    raf=requestAnimationFrame(loop);
  } catch(error) {
    if (current!==generation) return;
    stop(); status(errorMessage(error),'error');
  }
}

function drawSkeleton(landmarks,side) {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if (!landmarks) return;
  const size=Math.min(canvas.width,canvas.height);
  const point=index=>({x:landmarks[index].x*canvas.width,y:landmarks[index].y*canvas.height});
  ctx.lineCap='round';ctx.lineJoin='round';
  function line(a,b,color,width) {
    if (!visible(landmarks[a],0.35) || !visible(landmarks[b],0.35)) return;
    const p=point(a),q=point(b);
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();
  }
  for (const [a,b] of CONNECTIONS) line(a,b,'rgba(6,24,26,.8)',size*.012);
  for (const [a,b] of CONNECTIONS) line(a,b,'#bce9d9',size*.005);
  for (let i=0;i<landmarks.length;i++) {
    if (!visible(landmarks[i],0.35)) continue;
    const p=point(i);ctx.beginPath();ctx.arc(p.x,p.y,size*.005,0,Math.PI*2);ctx.fillStyle='#f7fff9';ctx.fill();
  }
  const selected=SIDES[side];
  line(selected[0],selected[1],'#ffad72',size*.009);
  line(selected[1],selected[2],'#ffad72',size*.009);
  for (const i of selected) {
    if (!visible(landmarks[i])) continue;
    const p=point(i);ctx.beginPath();ctx.arc(p.x,p.y,size*.011,0,Math.PI*2);ctx.fillStyle='#ffad72';ctx.fill();ctx.lineWidth=size*.004;ctx.strokeStyle='#172123';ctx.stroke();
  }
}

function finishCapture() {
  if (!capture) return;
  const data=capture, result=summariseReading(data.samples);
  cancelCapture();
  $('capture').disabled=state!=='running' || performance.now()-lastGoodAt>700;
  if (!result) {status('Not enough clear views of the knee. Keep the hip, knee and ankle visible and save again.');return;}
  $('saved-angle').textContent=`${Math.round(result.angle)}°`;
  const time=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  $('saved-meta').textContent=`${data.side==='left'?'Left':'Right'} knee · ${time}`;
  $('saved-detail').textContent=`Average of ${result.count} clear frames. Observed bend: ${Math.round(result.min)}° to ${Math.round(result.max)}°. ${useWorld?'Estimated 3D bend from RGB.':'Camera estimate.'}`;
  $('saved').hidden=false;
  status('Reading saved. You can relax your leg.','good');
}

function loop(now) {
  if (state!=='running') return;
  if (video.readyState>=2 && video.currentTime!==lastVideoTime && now-lastFrameAt>=65) {
    lastVideoTime=video.currentTime;lastFrameAt=now;
    try {
      if(canvas.width!==video.videoWidth || canvas.height!==video.videoHeight){canvas.width=video.videoWidth;canvas.height=video.videoHeight;skeletonSmoother.reset();worldView?.reset();clearAngle();}
      const result=model.detectForVideo(video,now);
      const landmarks=result.landmarks?.[0],side=$('side').value;
      drawSkeleton(skeletonSmoother.add(landmarks,now),side);
      worldView?.update(result.worldLandmarks?.[0],landmarks,side,now);
      const angle=useWorld ? kneeBend3D(result.worldLandmarks?.[0],landmarks,side) : kneeBend(landmarks,side,video.videoWidth,video.videoHeight);
      if (angle==null) {
        clearAngle();
        if (!capture) status(`Bring your ${side} hip, knee and ankle clearly into view.`);
      } else {
        const average=smoother.add(angle,now);lastGoodAt=now;
        // Refresh at most four times a second, while averaging every usable frame.
        if(lastReadoutAt==null || now-lastReadoutAt>=250){
          $('angle').textContent=String(Math.round(average)); lastReadoutAt=now;
        }
        $('capture').disabled=!!capture;
        if (capture) {
          capture.samples.push({angle,time:now});
          const remaining=Math.max(1,Math.ceil((2000-(now-capture.started))/1000));
          status(`Taking a reading. Hold comfortably for ${remaining} more ${remaining===1?'second':'seconds'}.`,'busy');
          if(now-capture.started>=2000 && summariseReading(capture.samples)) finishCapture();
        } else if(!['Reading saved. You can relax your leg.'].includes($('status').textContent)) {
          status(`${side==='left'?'Left':'Right'} knee tracked.`,'good');
        }
      }
    } catch {stop('The movement model stopped. Start the camera to try again.');return;}
  }
  raf=requestAnimationFrame(loop);
}

$('start').addEventListener('click',()=>state==='idle'?start():stop(state==='starting'?'Start cancelled. Ready when you are.':undefined));
$('capture').addEventListener('click',()=>{
  if(state!=='running'||capture||performance.now()-lastGoodAt>700)return;
  capture={side:$('side').value,started:performance.now(),samples:[]};
  $('capture').disabled=true; $('capture').textContent='Taking reading…';
  $('capture-help').hidden=false;
  $('capture-help').textContent='Keep this position as comfortably as you can. Small movements are okay.';
  status('Taking a short average. Hold comfortably.','busy');
  captureTimer=setTimeout(finishCapture,4000);
});
$('side').addEventListener('change',()=>{
  cancelCapture();clearAngle();skeletonSmoother.reset();worldView?.reset();ctx.clearRect(0,0,canvas.width,canvas.height);
  $('leg-label').textContent=$('side').selectedOptions[0].textContent;
  status(state==='running'?`Measuring the ${$('side').value} knee. Keep that side facing the camera.`:'Ready when you are. Start the camera to begin.');
});
$('clear').addEventListener('click',()=>{$('saved').hidden=true;});
// A frozen camera must not leave a stale angle labelled as live.
setInterval(()=>{
  if(state==='running' && lastFrameAt && performance.now()-lastFrameAt>700){
    clearAngle();skeletonSmoother.reset();worldView?.reset();lastFrameAt=0;ctx.clearRect(0,0,canvas.width,canvas.height);
    status('Waiting for a fresh view of the knee. Keep your leg visible.');
  }
},250);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state!=='idle')stop('Camera paused while the page was in the background. Start it when ready.');});
window.addEventListener('pagehide',()=>stop());
