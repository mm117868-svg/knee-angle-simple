import {CONNECTIONS, SIDES, visible, worldVisible, WorldSmoother} from './measurement.mjs?v=3';

// An orthographic inspection view of the model's estimates, not a depth scan.
export class WorldView {
  constructor(canvas, coordinates, resetButton) {
    this.canvas=canvas; this.ctx=canvas.getContext('2d'); this.coordinates=coordinates;
    this.filter=new WorldSmoother(); this.yaw=.5; this.pitch=-.1; this.points=null;
    this.side='right'; this.lastTable=null; this.drag=null;
    canvas.addEventListener('pointerdown',event=>{
      this.drag={x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove',event=>{
      if (!this.drag) return;
      this.yaw+=(event.clientX-this.drag.x)*.01;
      this.pitch=Math.max(-1.2,Math.min(1.2,this.pitch+(event.clientY-this.drag.y)*.01));
      this.drag={x:event.clientX,y:event.clientY};this.draw();
    });
    for (const name of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(name,()=>this.drag=null);
    canvas.addEventListener('keydown',event=>{
      if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      this.yaw+=event.key==='ArrowLeft'?-.15:event.key==='ArrowRight'?.15:0;
      this.pitch=Math.max(-1.2,Math.min(1.2,this.pitch+(event.key==='ArrowUp'?-.15:event.key==='ArrowDown'?.15:0)));
      this.draw();
    });
    resetButton.addEventListener('click',()=>{this.yaw=.5;this.pitch=-.1;this.draw();});
    this.observer=new ResizeObserver(()=>this.draw());this.observer.observe(canvas);
    this.reset();
  }
  reset() {
    this.filter.reset();this.points=null;this.lastTable=null;
    this.coordinates.querySelectorAll('[data-coordinate]').forEach(cell=>cell.textContent='--');
    this.draw();
  }
  update(world,image,side,time) {
    this.side=side;this.points=this.filter.add(world,image,time);this.draw();
    const ids=SIDES[side];
    const refresh=this.lastTable==null || time-this.lastTable>=250;
    ids.forEach((id,row)=>{
      const point=this.points?.[id];
      const valid=worldVisible(point) && visible(image?.[id]);
      for (const key of ['x','y','z']) {
        const cell=this.coordinates.querySelector(`[data-coordinate="${row}-${key}"]`);
        if (!valid) cell.textContent='--';
        else if (refresh) cell.textContent=(point[key]*100).toFixed(1);
      }
    });
    if (refresh) this.lastTable=time;
  }
  draw() {
    const {canvas,ctx}=this;
    const width=canvas.clientWidth || 500,height=canvas.clientHeight || 320;
    const dpr=Math.min(window.devicePixelRatio || 1,2);
    if(canvas.width!==Math.round(width*dpr) || canvas.height!==Math.round(height*dpr)){
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    }
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    const scale=Math.min(width/2.4,height/2.5);
    const project=p=>{
      const x=p.x*Math.cos(this.yaw)+p.z*Math.sin(this.yaw);
      const z=-p.x*Math.sin(this.yaw)+p.z*Math.cos(this.yaw);
      const y=p.y*Math.cos(this.pitch)-z*Math.sin(this.pitch);
      return {x:width/2+x*scale,y:height/2+y*scale};
    };
    const line=(a,b,colour,size)=>{
      const p=project(a),q=project(b);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);
      ctx.strokeStyle=colour;ctx.lineWidth=size;ctx.stroke();
    };
    const origin={x:0,y:0,z:0};ctx.font='11px system-ui';
    for (const [key,colour] of [['x','#ad5741'],['y','#4b7e67'],['z','#4b75a1']]){
      const end={...origin,[key]:.35};line(origin,end,colour,1);
      const p=project(end);ctx.fillStyle=colour;ctx.fillText(key.toUpperCase(),p.x+5,p.y-5);
    }
    if (!this.points?.some(Boolean)) {
      ctx.fillStyle='#666c6c';ctx.textAlign='center';
      ctx.fillText('3D skeleton appears when the camera is tracking.',width/2,height-24);ctx.textAlign='start';return;
    }
    ctx.lineCap='round';
    for (const [a,b] of CONNECTIONS) if(this.points[a] && this.points[b]) line(this.points[a],this.points[b],'#8caaa0',2);
    const selected=SIDES[this.side];
    for (const [a,b] of [[selected[0],selected[1]],[selected[1],selected[2]]])
      if(this.points[a] && this.points[b]) line(this.points[a],this.points[b],'#bd5d34',4);
    this.points.forEach((p,i)=>{
      if(!p)return;const q=project(p);ctx.beginPath();ctx.arc(q.x,q.y,selected.includes(i)?5:2.5,0,Math.PI*2);
      ctx.fillStyle=selected.includes(i)?'#bd5d34':'#41685b';ctx.fill();
    });
  }
}
