// Pose tracking with MediaPipe Tasks Vision PoseLandmarker (self-hosted wasm + models).
// The video is stepped frame by frame by seeking (requestVideoFrameCallback confirms the
// new frame where the browser supports it). Each frame is drawn at reduced resolution and
// only landmarks are kept, so memory stays low on phones.
import { FilesetResolver, PoseLandmarker, ObjectDetector } from '../vendor/mediapipe/vision_bundle.js?v=5';

const BASE = new URL('..', import.meta.url).href;
export const QUALITY = {
  fast: { model: 'models/pose_landmarker_lite.task', maxSide: 480, maxFps: 30 },
  balanced: { model: 'models/pose_landmarker_full.task', maxSide: 640, maxFps: 60 },
  precise: { model: 'models/pose_landmarker_heavy.task', maxSide: 720, maxFps: 60 },
};
let fileset = null, current = null, currentKey = '', delegateUsed = '';
let tsBase = 0; // VIDEO mode needs strictly increasing timestamps across runs

// ---------- racket detector (COCO "tennis racket") ----------
let racketDet = null, racketKey = '';
async function getRacketDetector(quality) {
  const key = quality === 'precise' ? 'lite2' : 'lite0';
  if (racketDet && racketKey === key) return racketDet;
  if (racketDet) { try { racketDet.close(); } catch (e) { /* ignore */ } racketDet = null; }
  if (!fileset) fileset = await FilesetResolver.forVisionTasks(BASE + 'vendor/mediapipe/wasm');
  const opts = (delegate) => ({ baseOptions: { modelAssetPath: BASE + `models/efficientdet_${key}.tflite`, delegate }, runningMode: 'VIDEO', scoreThreshold: 0.12, maxResults: 3, categoryAllowlist: ['tennis racket'] });
  try { racketDet = await ObjectDetector.createFromOptions(fileset, opts('GPU')); } catch (e) { racketDet = await ObjectDetector.createFromOptions(fileset, opts('CPU')); }
  racketKey = key;
  return racketDet;
}
// Shape of the racket head inside a detection box: take the half of the box away from the
// nearest wrist, weight pixels by edge strength and fit an ellipse by second moments.
// ang = major-axis angle (deg, image, 0 = horizontal), ratio = minor/major (0 edge-on .. ~0.75 face-on)
function headShape(ctx, bx, by, bw, bh, wx, wy) {
  const long = bw >= bh;
  let x0 = bx, y0 = by, w = bw, h = bh;
  if (long) { w = bw / 2; if (Math.abs(wx - bx) < Math.abs(wx - (bx + bw))) x0 = bx + bw / 2; }
  else { h = bh / 2; if (Math.abs(wy - by) < Math.abs(wy - (by + bh))) y0 = by + bh / 2; }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); w = Math.max(4, Math.min(Math.floor(w), ctx.canvas.width - x0)); h = Math.max(4, Math.min(Math.floor(h), ctx.canvas.height - y0));
  if (w < 6 || h < 6) return null;
  const d = ctx.getImageData(x0, y0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
  const mags = []; const pts = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const gx = g[y * w + x + 1] - g[y * w + x - 1], gy = g[(y + 1) * w + x] - g[(y - 1) * w + x];
    const m = Math.hypot(gx, gy); mags.push(m); pts.push([x, y, m]);
  }
  if (pts.length < 20) return null;
  const sorted = mags.slice().sort((a, b) => a - b); const thr = sorted[Math.floor(sorted.length * 0.75)];
  let sw = 0, mx = 0, my = 0;
  for (const [x, y, m] of pts) if (m > thr) { sw += m; mx += x * m; my += y * m; }
  if (sw <= 0) return null;
  mx /= sw; my /= sw;
  let cxx = 0, cyy = 0, cxy = 0;
  for (const [x, y, m] of pts) if (m > thr) { cxx += m * (x - mx) ** 2; cyy += m * (y - my) ** 2; cxy += m * (x - mx) * (y - my); }
  cxx /= sw; cyy /= sw; cxy /= sw;
  const tr = cxx + cyy, det = cxx * cyy - cxy * cxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l1 = tr / 2 + disc, l2 = Math.max(0, tr / 2 - disc);
  const ang = 0.5 * Math.atan2(2 * cxy, cxx - cyy) * 180 / Math.PI;
  // sharpness (blur): mean gradient of the strong edges relative to contrast
  return { ang, ratio: Math.sqrt(l2 / Math.max(1e-6, l1)), cx: x0 + mx, cy: y0 + my, sharp: thr };
}
async function detectRackets(det, canvas, ctx, ts, poses) {
  const res = det.detectForVideo(canvas, ts);
  const W = canvas.width, H = canvas.height; const out = [];
  const wrists = []; for (const p of poses) for (const k of [15, 16]) wrists.push([p.img[k * 3] * W, p.img[k * 3 + 1] * H]);
  for (const d of (res.detections || []).slice(0, 3)) {
    const b = d.boundingBox; if (!b) continue;
    const bcx = b.originX + b.width / 2, bcy = b.originY + b.height / 2;
    let wx = bcx, wy = bcy + b.height, best = 1e9;
    for (const [x, y] of wrists) { const dd = Math.hypot(x - bcx, y - bcy); if (dd < best) { best = dd; wx = x; wy = y; } }
    let shape = null; try { shape = headShape(ctx, b.originX, b.originY, b.width, b.height, wx, wy); } catch (e) { shape = null; }
    out.push({ x: b.originX / W, y: b.originY / H, w: b.width / W, h: b.height / H, s: d.categories && d.categories[0] ? d.categories[0].score : 0,
      ang: shape ? shape.ang : NaN, ratio: shape ? shape.ratio : NaN, hx: shape ? shape.cx / W : NaN, hy: shape ? shape.cy / H : NaN, sharp: shape ? shape.sharp : 0 });
  }
  return out;
}

export function suggestQuality() {
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (mem <= 2 || cores <= 2) return 'fast';
  if (ios) return 'balanced';
  return 'balanced';
}

async function create(quality, delegate) {
  const q = QUALITY[quality];
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: BASE + q.model, delegate },
    runningMode: 'VIDEO', numPoses: 2,
    minPoseDetectionConfidence: 0.4, minPosePresenceConfidence: 0.4, minTrackingConfidence: 0.4,
    outputSegmentationMasks: false,
  });
}
export async function getLandmarker(quality) {
  const key = quality;
  if (current && currentKey === key) return current;
  if (current) { try { current.close(); } catch (e) { /* ignore */ } current = null; }
  if (!fileset) fileset = await FilesetResolver.forVisionTasks(BASE + 'vendor/mediapipe/wasm');
  try { current = await create(quality, 'GPU'); delegateUsed = 'GPU'; }
  catch (e) { current = await create(quality, 'CPU'); delegateUsed = 'CPU'; }
  currentKey = key;
  return current;
}
export function delegateName() { return delegateUsed; }
async function fallbackToCpu(quality) {
  if (current) { try { current.close(); } catch (e) { /* ignore */ } }
  current = await create(quality, 'CPU'); delegateUsed = 'CPU'; currentKey = quality;
  return current;
}

// requestVideoFrameCallback confirms the decoded frame after a seek; if a browser never
// fires it for paused seeks we stop waiting for it (per video element).
const rvfcState = new WeakMap();
export function seekTo(video, t) {
  return new Promise((resolve) => {
    let done = false;
    const st = rvfcState.get(video) || { hits: 0, misses: 0 };
    rvfcState.set(video, st);
    const finish = () => { if (done) return; done = true; video.removeEventListener('seeked', onSeeked); clearTimeout(guard); resolve(); };
    const onSeeked = () => {
      const useCb = typeof video.requestVideoFrameCallback === 'function' && !(st.misses >= 4 && st.hits === 0);
      if (!useCb) { finish(); return; }
      let fired = false;
      video.requestVideoFrameCallback(() => { fired = true; st.hits++; finish(); });
      setTimeout(() => { if (!fired) st.misses++; finish(); }, 80);
    };
    const guard = setTimeout(finish, 5000);
    video.addEventListener('seeked', onSeeked);
    video.currentTime = t;
  });
}

function copyPoses(res) {
  const out = [];
  const n = res.landmarks ? res.landmarks.length : 0;
  for (let p = 0; p < n; p++) {
    const lm = res.landmarks[p], wl = res.worldLandmarks[p];
    if (!lm || !wl || lm.length < 33) continue;
    const img = new Float32Array(99), world = new Float32Array(99);
    for (let k = 0; k < 33; k++) {
      img[k * 3] = lm[k].x; img[k * 3 + 1] = lm[k].y; img[k * 3 + 2] = lm[k].visibility ?? 1;
      world[k * 3] = wl[k].x; world[k * 3 + 1] = wl[k].y; world[k * 3 + 2] = wl[k].z;
    }
    out.push({ img, world });
  }
  return out;
}

// Runs pose tracking over [start, end]. Returns {frames, aspect, msPerFrame}.
export async function trackClip(video, { start, end, fps, quality, racket = true, onProgress, onPreview, signal }) {
  const q = QUALITY[quality] || QUALITY.balanced;
  let lm = await getLandmarker(quality);
  const W0 = video.videoWidth, H0 = video.videoHeight;
  const sc = Math.min(1, q.maxSide / Math.max(W0, H0));
  const cw = Math.max(2, Math.round(W0 * sc)), ch = Math.max(2, Math.round(H0 * sc));
  const canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: !!racket });
  let rdet = null; if (racket) { try { rdet = await getRacketDetector(quality); } catch (e) { rdet = null; } }
  const vfps = fps || 30;
  const sfps = Math.min(vfps, q.maxFps);
  const step = 1 / sfps;
  const times = [];
  for (let t = start; t <= end + 1e-6; t += step) {
    // aim at the middle of a source frame so seeks never land on a boundary
    const fi = Math.floor(t * vfps);
    times.push(Math.min(video.duration - 0.001, (fi + 0.5) / vfps));
  }
  const frames = [];
  const t0 = performance.now();
  tsBase += 10000;
  for (let i = 0; i < times.length; i++) {
    if (signal && signal.aborted) throw new DOMException('cancelled', 'AbortError');
    await seekTo(video, times[i]);
    ctx.drawImage(video, 0, 0, cw, ch);
    let res;
    try { res = lm.detectForVideo(canvas, Math.round(tsBase + times[i] * 1000 + i)); }
    catch (e) {
      if (delegateUsed === 'GPU') { lm = await fallbackToCpu(quality); tsBase += 100000; res = lm.detectForVideo(canvas, Math.round(tsBase + times[i] * 1000 + i)); }
      else throw e;
    }
    const poses = copyPoses(res);
    let rackets;
    if (rdet) { try { rackets = await detectRackets(rdet, canvas, ctx, Math.round(tsBase + times[i] * 1000 + i), poses); } catch (e) { rackets = []; } }
    frames.push(rackets ? { t: times[i], poses, rackets } : { t: times[i], poses });
    const el = performance.now() - t0;
    if (onProgress) onProgress({ done: i + 1, total: times.length, msPerFrame: el / (i + 1), etaMs: el / (i + 1) * (times.length - i - 1) });
    if (onPreview && (i % 3 === 0 || i === times.length - 1)) onPreview(canvas, poses, rackets);
  }
  tsBase += Math.round((end + 10) * 1000) + times.length;
  return { frames, aspect: W0 / H0, sampleFps: sfps, msPerFrame: (performance.now() - t0) / Math.max(1, times.length), width: W0, height: H0 };
}

// Quick low-resolution pass for the trim bar: motion energy and a few thumbnails.
export async function scanMotion(video, { onProgress, signal } = {}) {
  const dur = video.duration;
  const N = Math.round(Math.max(16, Math.min(120, dur * 3)));
  const sw = 64, sh = Math.max(16, Math.round(64 * video.videoHeight / Math.max(1, video.videoWidth)));
  const c = document.createElement('canvas'); c.width = sw; c.height = sh;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const tc = document.createElement('canvas'); const tw = 120; tc.width = tw; tc.height = Math.round(tw * video.videoHeight / Math.max(1, video.videoWidth));
  const tctx = tc.getContext('2d');
  const thumbs = [], times = [], motion = [];
  let prev = null;
  const thumbEvery = Math.max(1, Math.floor(N / 8));
  for (let i = 0; i < N; i++) {
    if (signal && signal.aborted) break;
    const t = Math.min(dur - 0.01, (i + 0.5) * dur / N);
    await seekTo(video, t);
    ctx.drawImage(video, 0, 0, sw, sh);
    const d = ctx.getImageData(0, 0, sw, sh).data;
    const g = new Float32Array(sw * sh);
    for (let p = 0; p < g.length; p++) g[p] = (d[p * 4] + d[p * 4 + 1] + d[p * 4 + 2]) / 3;
    let m = 0;
    if (prev) { for (let p = 0; p < g.length; p++) { const v = Math.abs(g[p] - prev[p]); if (v > 12) m += v; } m /= g.length; }
    prev = g; times.push(t); motion.push(m);
    if (i % thumbEvery === 0 && thumbs.length < 8) { tctx.drawImage(video, 0, 0, tc.width, tc.height); thumbs.push({ t, url: tc.toDataURL('image/jpeg', 0.6) }); }
    if (onProgress) onProgress((i + 1) / N);
  }
  if (motion.length > 1) motion[0] = motion[1];
  return { times, motion, thumbs };
}

// Suggest a trim range: the span with sustained motion, capped to maxLen seconds.
export function suggestTrim(scan, duration, maxLen = 30) {
  const { times, motion } = scan;
  if (!times.length) return [0, Math.min(duration, maxLen)];
  const sorted = motion.slice().sort((a, b) => a - b);
  const thr = sorted[Math.floor(sorted.length * 0.5)] * 1.4 + 0.2;
  const active = motion.map((m) => m > thr);
  let a = active.indexOf(true), b = active.lastIndexOf(true);
  if (a < 0) return [0, Math.min(duration, maxLen)];
  let s = Math.max(0, times[a] - 0.8), e = Math.min(duration, times[b] + 0.8);
  if (e - s > maxLen) {
    // densest window of maxLen seconds
    let best = -1, bs = s;
    for (let i = 0; i < times.length; i++) {
      const ws = times[i], we = ws + maxLen; if (we > duration + 0.5) break;
      let sum = 0; for (let j = i; j < times.length && times[j] <= we; j++) sum += motion[j];
      if (sum > best) { best = sum; bs = ws; }
    }
    s = Math.max(0, bs); e = Math.min(duration, s + maxLen);
  }
  if (duration <= 12) return [0, duration];
  return [s, e];
}

export async function captureFrame(video, t, width, draw) {
  await seekTo(video, t);
  const c = document.createElement('canvas');
  c.width = width; c.height = Math.round(width * video.videoHeight / Math.max(1, video.videoWidth));
  const ctx = c.getContext('2d');
  ctx.drawImage(video, 0, 0, c.width, c.height);
  if (draw) draw(ctx, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}
