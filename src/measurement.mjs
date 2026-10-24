export const SIDES = { left: [23, 25, 27], right: [24, 26, 28] };
// MediaPipe's 33-landmark topology: face, shoulders, arms, hands, torso, legs and feet.
export const CONNECTIONS = [[0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],[9,10],[11,12],[11,13],[13,15],[15,17],[15,19],[15,21],[17,19],[12,14],[14,16],[16,18],[16,20],[16,22],[18,20],[11,23],[12,24],[23,24],[23,25],[24,26],[25,27],[26,28],[27,29],[28,30],[29,31],[30,32],[27,31],[28,32]];

export function visible(point, threshold = 0.5) {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y)
    && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1
    && Number.isFinite(point.visibility) && point.visibility >= threshold
    && (point.presence == null || Number.isFinite(point.presence) && point.presence >= threshold);
}

export function kneeBend(landmarks, side, width, height) {
  if (!SIDES[side] || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const points = SIDES[side].map(index => landmarks?.[index]);
  if (!points.every(point => visible(point))) return null;
  const [hip, knee, ankle] = points.map(p => ({x:p.x * width, y:p.y * height}));
  const a = {x:hip.x-knee.x, y:hip.y-knee.y};
  const b = {x:ankle.x-knee.x, y:ankle.y-knee.y};
  const upper = Math.hypot(a.x,a.y), lower = Math.hypot(b.x,b.y);
  if (Math.min(upper,lower) < Math.min(width,height)*0.04) return null;
  const cosine = Math.max(-1,Math.min(1,(a.x*b.x+a.y*b.y)/(upper*lower)));
  return 180 - Math.acos(cosine) * 180 / Math.PI;
}

export function mean(values) { return values.reduce((a,b) => a+b,0) / values.length; }
export function robustMean(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a,b) => a-b);
  const trim = Math.floor(sorted.length * 0.15);
  return mean(sorted.slice(trim, sorted.length-trim));
}

export class AngleWindow {
  constructor() { this.samples=[]; this.lastTime=null; }
  reset() { this.samples=[]; this.lastTime=null; }
  add(angle,time) {
    if (!Number.isFinite(angle) || !Number.isFinite(time)) { this.reset(); return null; }
    if (this.lastTime != null && (time-this.lastTime > 400 || time <= this.lastTime)) this.reset();
    this.lastTime=time;
    this.samples=this.samples.filter(p => time-p.time <= 700);
    this.samples.push({angle,time});
    return robustMean(this.samples.map(p=>p.angle));
  }
}

// Smooth drawing coordinates only. Confidence remains current, so lost joints
// disappear immediately instead of being kept visible by historical estimates.
export class LandmarkSmoother {
  constructor() { this.reset(); }
  reset() { this.points=[]; this.lastTime=null; }
  add(landmarks,time) {
    if (!landmarks?.length || !Number.isFinite(time)) { this.reset(); return null; }
    const dt=this.lastTime==null ? 0 : time-this.lastTime;
    if (this.lastTime==null || dt<=0 || dt>400) this.points=[];
    this.lastTime=time;
    const alpha=1-Math.exp(-Math.max(0,dt)/160);
    this.points=landmarks.map((point,index)=>{
      if (!visible(point,0.35)) return null;
      const previous=this.points[index];
      if (!previous) return {...point};
      return {...point,x:previous.x+alpha*(point.x-previous.x),y:previous.y+alpha*(point.y-previous.y)};
    });
    return this.points;
  }
}

export function summariseReading(samples) {
  const valid = samples.filter(p=>Number.isFinite(p.angle) && Number.isFinite(p.time));
  if (valid.length < 5 || valid.at(-1).time-valid[0].time < 600) return null;
  const values=valid.map(p=>p.angle);
  return {angle:robustMean(values), min:Math.min(...values), max:Math.max(...values), count:values.length};
}
