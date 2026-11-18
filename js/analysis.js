// Swing Coach - analysis core. Pure functions, no DOM: player tracking, cleaning and
// smoothing of landmarks, camera-view estimation, swing detection, phases, stroke
// classification and per-swing metrics with confidence.
//
// Conventions (MediaPipe Pose): 33 landmarks. Image landmarks x,y are 0..1 of the frame;
// we store x*aspect so distances are isotropic (units = frame height).
// World landmarks are metres, origin near the hip centre, y pointing DOWN, z = depth
// (smaller = closer to the camera). Axes follow the camera, so anything that must not
// depend on the viewing angle is computed in a body frame built from the hips/shoulders.

export const LM = {
  nose: 0, lEar: 7, rEar: 8, lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16,
  lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28, lHeel: 29, rHeel: 30, lToe: 31, rToe: 32,
};
const LR_PAIRS = [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20],
  [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]];
const NLM = 33, ST = NLM * 3;
const D = 180 / Math.PI;

// ---------- small vector helpers ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const horiz = (a) => [a[0], 0, a[2]];
const UP = [0, -1, 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function angleAt(a, b, c) { // angle ABC in degrees
  const u = sub(a, b), v = sub(c, b);
  const d = dot(u, v) / ((len(u) * len(v)) || 1);
  return Math.acos(clamp(d, -1, 1)) * D;
}
const wrap180 = (a) => { a = ((a + 180) % 360 + 360) % 360 - 180; return a; };
function median(arr) { const a = arr.filter(Number.isFinite).sort((x, y) => x - y); if (!a.length) return NaN; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
function quantile(arr, q) { const a = arr.filter(Number.isFinite).sort((x, y) => x - y); if (!a.length) return NaN; return a[Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))))]; }
function mean(arr) { const a = arr.filter(Number.isFinite); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN; }
function std(arr) { const a = arr.filter(Number.isFinite); if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); }

// ---------- player selection ----------
function poseBox(img, aspect) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const k of [0, 11, 12, 23, 24, 25, 26, 27, 28, 15, 16]) {
    const x = img[k * 3] * aspect, y = img[k * 3 + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const cx = (img[23 * 3] + img[24 * 3]) / 2 * aspect, cy = (img[23 * 3 + 1] + img[24 * 3 + 1]) / 2;
  return { cx, cy, size: Math.hypot(x1 - x0, y1 - y0), x0, y0, x1, y1 };
}

// frames: [{t, poses:[{img:Float32Array(99), world:Float32Array(99)}]}]
// anchor: optional {frame, x, y} (x,y normalized 0..1) chosen by a tap.
// Returns an array (per frame) of the chosen pose index or -1.
export function selectTrack(frames, aspect, anchor) {
  const n = frames.length, pick = new Array(n).fill(-1);
  const boxes = frames.map((f) => f.poses.map((p) => poseBox(p.img, aspect)));
  let a = -1, ai = -1;
  if (anchor && boxes[anchor.frame] && boxes[anchor.frame].length) {
    a = anchor.frame; let best = 1e9;
    boxes[a].forEach((b, i) => {
      const inside = anchor.x * aspect >= b.x0 && anchor.x * aspect <= b.x1 && anchor.y >= b.y0 && anchor.y <= b.y1;
      const d = Math.hypot(b.cx - anchor.x * aspect, b.cy - anchor.y) - (inside ? 1 : 0);
      if (d < best) { best = d; ai = i; }
    });
  } else {
    // largest and most central person, preferring the early part of the clip
    let best = -1;
    const lim = Math.max(1, Math.ceil(n * 0.35));
    for (let f = 0; f < lim; f++) boxes[f].forEach((b, i) => {
      const dc = Math.hypot((b.cx - aspect / 2) / aspect, b.cy - 0.55);
      const s = b.size * (1 - 0.9 * Math.min(1, dc));
      if (s > best) { best = s; a = f; ai = i; }
    });
    if (a < 0) for (let f = 0; f < n; f++) if (boxes[f].length) { a = f; ai = 0; break; }
  }
  if (a < 0) return pick;
  pick[a] = ai;
  const follow = (dir) => {
    let last = boxes[a][ai], miss = 0;
    for (let f = a + dir; f >= 0 && f < n; f += dir) {
      let bi = -1, bd = 1e9;
      boxes[f].forEach((b, i) => {
        const d = Math.hypot(b.cx - last.cx, b.cy - last.cy) / Math.max(0.05, last.size);
        const r = b.size / Math.max(1e-3, last.size);
        if (r > 0.55 && r < 1.8 && d < bd) { bd = d; bi = i; }
      });
      if (bi >= 0 && bd < 0.6 + 0.15 * miss) { pick[f] = bi; last = boxes[f][bi]; miss = 0; } else miss++;
    }
  };
  follow(1); follow(-1);
  return pick;
}

// ---------- One-Euro filter ----------
class OneEuro {
  constructor(minCutoff, beta, dCutoff = 1.0) { this.mc = minCutoff; this.b = beta; this.dc = dCutoff; this.x = null; this.dx = 0; this.t = null; }
  static alpha(dt, cutoff) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  f(x, t) {
    if (this.x === null) { this.x = x; this.t = t; return x; }
    const dt = Math.max(1e-4, Math.abs(t - this.t)); this.t = t;
    const dx = (x - this.x) / dt;
    this.dx = this.dx + OneEuro.alpha(dt, this.dc) * (dx - this.dx);
    const cutoff = this.mc + this.b * Math.abs(this.dx);
    this.x = this.x + OneEuro.alpha(dt, cutoff) * (x - this.x);
    return this.x;
  }
}
// zero-phase: forward and backward pass averaged (offline analysis, so no lag)
function smoothChannel(t, v, ok, minCutoff, beta) {
  const n = v.length, f = new Float32Array(n), b = new Float32Array(n);
  let flt = new OneEuro(minCutoff, beta);
  for (let i = 0; i < n; i++) { if (!ok[i]) { flt = new OneEuro(minCutoff, beta); f[i] = v[i]; continue; } f[i] = flt.f(v[i], t[i]); }
  flt = new OneEuro(minCutoff, beta);
  for (let i = n - 1; i >= 0; i--) { if (!ok[i]) { flt = new OneEuro(minCutoff, beta); b[i] = v[i]; continue; } b[i] = flt.f(v[i], t[i]); }
  for (let i = 0; i < n; i++) v[i] = (f[i] + b[i]) / 2;
}

// Build a clean track for the chosen player: L/R swap fix, gap fill, smoothing.
// Returns {n, t, img(x*aspect,y,vis), world, ok (1 real, 2 filled, 0 missing), aspect}
export function buildTrack(frames, pick, aspect, opts = {}) {
  const n = frames.length;
  const t = new Float64Array(n), img = new Float32Array(n * ST), world = new Float32Array(n * ST), ok = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    t[i] = frames[i].t;
    const k = pick[i]; if (k < 0) continue;
    const p = frames[i].poses[k];
    for (let j = 0; j < NLM; j++) {
      img[i * ST + j * 3] = p.img[j * 3] * aspect; img[i * ST + j * 3 + 1] = p.img[j * 3 + 1]; img[i * ST + j * 3 + 2] = p.img[j * 3 + 2];
      world[i * ST + j * 3] = p.world[j * 3]; world[i * ST + j * 3 + 1] = p.world[j * 3 + 1]; world[i * ST + j * 3 + 2] = p.world[j * 3 + 2];
    }
    ok[i] = 1;
  }
  // left/right label flips: swap a frame's sides when that is far more continuous
  const limbs = [[11, 12], [13, 14], [15, 16], [23, 24], [25, 26], [27, 28]];
  let prev = -1, swaps = 0;
  for (let i = 0; i < n; i++) {
    if (!ok[i]) continue;
    if (prev >= 0 && t[i] - t[prev] < 0.25) {
      let straight = 0, swapped = 0;
      for (const [l, r] of limbs) {
        const dl = (a, b) => Math.hypot(img[i * ST + a * 3] - img[prev * ST + b * 3], img[i * ST + a * 3 + 1] - img[prev * ST + b * 3 + 1]);
        straight += dl(l, l) + dl(r, r); swapped += dl(l, r) + dl(r, l);
      }
      if (straight > 0.12 && swapped < 0.45 * straight) {
        swaps++;
        for (const [l, r] of LR_PAIRS) for (let c = 0; c < 3; c++) {
          for (const arr of [img, world]) { const x = arr[i * ST + l * 3 + c]; arr[i * ST + l * 3 + c] = arr[i * ST + r * 3 + c]; arr[i * ST + r * 3 + c] = x; }
        }
      }
    }
    prev = i;
  }
  // fill short gaps (<= maxGap s) linearly
  const maxGap = opts.maxGap ?? 0.35;
  let last = -1;
  for (let i = 0; i < n; i++) {
    if (!ok[i]) continue;
    if (last >= 0 && i - last > 1 && t[i] - t[last] <= maxGap) {
      for (let g = last + 1; g < i; g++) {
        const a = (t[g] - t[last]) / (t[i] - t[last]);
        for (let c = 0; c < ST; c++) {
          img[g * ST + c] = img[last * ST + c] * (1 - a) + img[i * ST + c] * a;
          world[g * ST + c] = world[last * ST + c] * (1 - a) + world[i * ST + c] * a;
        }
        ok[g] = 2;
      }
    }
    last = i;
  }
  // smoothing (zero-phase One-Euro); visibility is not smoothed
  const ch = new Float32Array(n);
  for (let j = 0; j < NLM; j++) for (let c = 0; c < 3; c++) {
    const cs = opts.cutScale || 1; // slow-motion clips: everything is slower, smooth harder
    for (const [arr, mc, beta, skipVis] of [[img, 2.2 * cs, 1.2, true], [world, 2.2 * cs, 0.8, false]]) {
      if (skipVis && c === 2) continue;
      for (let i = 0; i < n; i++) ch[i] = arr[i * ST + j * 3 + c];
      smoothChannel(t, ch, ok, mc, beta);
      for (let i = 0; i < n; i++) arr[i * ST + j * 3 + c] = ch[i];
    }
  }
  const rk = frames.some((f) => f.rackets) ? frames.map((f) => f.rackets || []) : null;
  return { n, t, img, world, ok, aspect, swaps, rk };
}

// ---------- accessors ----------
const W = (tr, i, k) => [tr.world[i * ST + k * 3], tr.world[i * ST + k * 3 + 1], tr.world[i * ST + k * 3 + 2]];
const I2 = (tr, i, k) => [tr.img[i * ST + k * 3], tr.img[i * ST + k * 3 + 1], 0];
const VIS = (tr, i, k) => tr.img[i * ST + k * 3 + 2];
const hipMidW = (tr, i) => mid(W(tr, i, LM.lHip), W(tr, i, LM.rHip));
const shMidW = (tr, i) => mid(W(tr, i, LM.lSh), W(tr, i, LM.rSh));
const ankMidW = (tr, i) => mid(W(tr, i, LM.lAn), W(tr, i, LM.rAn));
export function sideIdx(hand) {
  return hand === 'L'
    ? { sh: 11, el: 13, wr: 15, hip: 23, kn: 25, an: 27, osh: 12, oel: 14, owr: 16, ohip: 24 }
    : { sh: 12, el: 14, wr: 16, hip: 24, kn: 26, an: 28, osh: 11, oel: 13, owr: 15, ohip: 23 };
}

function bodyHeight(tr) {
  const v = [];
  for (let i = 0; i < tr.n; i++) if (tr.ok[i]) {
    const seg = len(sub(W(tr, i, LM.nose), shMidW(tr, i))) + len(sub(shMidW(tr, i), hipMidW(tr, i)))
      + (len(sub(W(tr, i, LM.lHip), W(tr, i, LM.lKn))) + len(sub(W(tr, i, LM.rHip), W(tr, i, LM.rKn)))) / 2
      + (len(sub(W(tr, i, LM.lKn), W(tr, i, LM.lAn))) + len(sub(W(tr, i, LM.rKn), W(tr, i, LM.rAn)))) / 2;
    v.push(seg * 1.08);
  }
  return median(v) || 1.7;
}
function bodyHeightImg(tr) {
  const v = [];
  for (let i = 0; i < tr.n; i++) if (tr.ok[i]) {
    const P = (k) => I2(tr, i, k);
    const seg = len(sub(P(0), mid(P(11), P(12)))) + len(sub(mid(P(11), P(12)), mid(P(23), P(24))))
      + Math.max(len(sub(P(23), P(25))) + len(sub(P(25), P(27))), len(sub(P(24), P(26))) + len(sub(P(26), P(28))));
    v.push(seg * 1.08);
  }
  return quantile(v, 0.8) || 0.8;
}

// speed of landmark k (world, relative to hips) in body-heights per second of video time
function speedSeries(tr, k, BH) {
  const n = tr.n, s = new Float32Array(n);
  for (let i = 1; i < n - 1; i++) {
    if (!tr.ok[i - 1] || !tr.ok[i + 1]) { s[i] = 0; continue; }
    const p0 = sub(W(tr, i - 1, k), hipMidW(tr, i - 1)), p1 = sub(W(tr, i + 1, k), hipMidW(tr, i + 1));
    s[i] = len(sub(p1, p0)) / Math.max(1e-3, tr.t[i + 1] - tr.t[i - 1]) / BH;
  }
  s[0] = s[1] || 0; s[n - 1] = s[n - 2] || 0;
  return s;
}
function yawSeries(tr, a, b) { // yaw (deg) of horizontal vector a->b, unwrapped
  const n = tr.n, y = new Float32Array(n); let prev = null, off = 0;
  for (let i = 0; i < n; i++) {
    const v = sub(W(tr, i, b), W(tr, i, a));
    let ang = Math.atan2(v[2], v[0]) * D;
    if (prev !== null) { let d = ang + off - prev; if (d > 180) off -= 360; else if (d < -180) off += 360; }
    y[i] = ang + off; prev = y[i];
  }
  return y;
}
function deriv(t, v) {
  const n = v.length, d = new Float32Array(n);
  for (let i = 1; i < n - 1; i++) d[i] = (v[i + 1] - v[i - 1]) / Math.max(1e-3, t[i + 1] - t[i - 1]);
  d[0] = d[1] || 0; d[n - 1] = d[n - 2] || 0; return d;
}
function movAvg(v, w) {
  const n = v.length, o = new Float32Array(n), h = w >> 1;
  for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let j = Math.max(0, i - h); j <= Math.min(n - 1, i + h); j++) { s += v[j]; c++; } o[i] = s / c; }
  return o;
}
const idxAt = (tr, time) => { let lo = 0, hi = tr.n - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (tr.t[m] < time) lo = m + 1; else hi = m; } return lo; };

// ---------- body frame ----------
// Lateral axis points to the player's LEFT; forward = lateral x up, its sign checked
// against the nose (which sits in front of the shoulder line).
function bodyAxes(tr, i0, i1) {
  let lat = [0, 0, 0], noseV = [0, 0, 0];
  for (let i = i0; i <= i1; i++) {
    if (!tr.ok[i]) continue;
    lat = add(lat, horiz(sub(W(tr, i, LM.lHip), W(tr, i, LM.rHip))));
    lat = add(lat, horiz(sub(W(tr, i, LM.lSh), W(tr, i, LM.rSh))));
    noseV = add(noseV, horiz(sub(W(tr, i, LM.nose), shMidW(tr, i))));
  }
  lat = norm(lat);
  let F = norm(cross(lat, UP));
  let flipped = false;
  const nh = len(noseV) / Math.max(1, i1 - i0 + 1);
  if (nh > 0.03 && dot(noseV, F) < 0) { F = mul(F, -1); lat = mul(lat, -1); flipped = true; }
  return { F, lat, flipped };
}
// angle between body forward and the direction towards the camera (0 front .. 180 back)
function viewOf(F) {
  const ang = Math.acos(clamp(dot(F, [0, 0, -1]), -1, 1)) * D;
  let key = 'side';
  if (ang < 30) key = 'front'; else if (ang < 62) key = 'frontDiag'; else if (ang <= 118) key = 'side'; else if (ang <= 150) key = 'backDiag'; else key = 'back';
  return { angle: ang, key };
}

// ---------- metric definitions (heuristic good ranges from coaching practice) ----------
// impact = how much the metric matters for the shot; area = score bucket
export const METRICS = {
  unitTurn: { area: 'prep', unit: 'deg', impact: 0.9 },
  separation: { area: 'prep', unit: 'deg', impact: 0.6 },
  offArm: { area: 'prep', unit: 'pct', impact: 0.45 },
  compact: { area: 'prep', unit: 'pctBH', impact: 0.7 },
  trophyElbow: { area: 'prep', unit: 'deg', impact: 0.7 },
  trophyElbowHeight: { area: 'prep', unit: 'pctBH', impact: 0.5 },
  tossArm: { area: 'prep', unit: 'pctBH', impact: 0.6 },
  kneeBend: { area: 'legs', unit: 'deg', impact: 0.7 },
  legDrive: { area: 'legs', unit: 'pctBH', impact: 0.55 },
  baseWidth: { area: 'balance', unit: 'ratio', impact: 0.45 },
  contactFront: { area: 'contact', unit: 'pctBH', impact: 1.0 },
  contactHeight: { area: 'contact', unit: 'level', impact: 0.6 },
  contactReach: { area: 'contact', unit: 'pctBH', impact: 0.9 },
  elbowAngle: { area: 'contact', unit: 'deg', impact: 0.55 },
  extension: { area: 'contact', unit: 'pct', impact: 0.55 },
  chain: { area: 'power', unit: 'order', impact: 0.8 },
  wristSpeed: { area: 'power', unit: 'speed', impact: 0 },
  headStable: { area: 'balance', unit: 'pctBH', impact: 0.65 },
  trunkLean: { area: 'balance', unit: 'deg', impact: 0.5 },
  finish: { area: 'finish', unit: 'pct', impact: 0.6 },
  recovery: { area: 'finish', unit: 'pctBH', impact: 0.3 },
  racketFace: { area: 'contact', unit: 'face', impact: 0.6, racket: true },
  racketHeadHeight: { area: 'contact', unit: 'pctBH', impact: 0.4, racket: true },
  racketDrop: { area: 'power', unit: 'pctBH', impact: 0.5, racket: true },
  swingPath: { area: 'power', unit: 'deg', impact: 0.5, racket: true },
  racketLag: { area: 'power', unit: 'deg', impact: 0.35, racket: true },
  takeBack: { area: 'prep', unit: 'deg', impact: 0.35, racket: true },
  racketFinish: { area: 'finish', unit: 'pctBH', impact: 0.35, racket: true },
  serveDrop: { area: 'prep', unit: 'pctBH', impact: 0.5, racket: true },
};
export const AREAS = ['prep', 'legs', 'contact', 'power', 'balance', 'finish'];
// [lo, hi, tolerance] per stroke type
const RANGES = {
  forehand: {
    unitTurn: [70, 125, 35], separation: [18, 55, 20], offArm: [0.72, 1.05, 0.3], kneeBend: [22, 65, 18], legDrive: [0.015, 0.15, 0.03],
    baseWidth: [1.2, 2.5, 0.6], contactFront: [0.1, 0.5, 0.15], contactHeight: [0.05, 1.05, 0.45], elbowAngle: [100, 178, 25],
    extension: [0.8, 1.05, 0.2], chain: [2.5, 3, 2], headStable: [0, 0.07, 0.09], trunkLean: [0, 22, 15], finish: [0.7, 1, 0.5], recovery: [0.12, 5, 0.15],
  },
  backhand1: {
    unitTurn: [85, 135, 35], separation: [18, 55, 20], offArm: [0.3, 1.5, 0.25], kneeBend: [22, 65, 18], legDrive: [0.015, 0.15, 0.03],
    baseWidth: [1.2, 2.5, 0.6], contactFront: [0.15, 0.6, 0.15], contactHeight: [0.05, 1.05, 0.45], elbowAngle: [150, 180, 25],
    extension: [0.86, 1.05, 0.2], chain: [2.5, 3, 2], headStable: [0, 0.07, 0.09], trunkLean: [0, 22, 15], finish: [0.7, 1, 0.5], recovery: [0.12, 5, 0.15],
  },
  backhand2: {
    unitTurn: [80, 130, 35], separation: [18, 55, 20], kneeBend: [22, 65, 18], legDrive: [0.015, 0.15, 0.03],
    baseWidth: [1.2, 2.5, 0.6], contactFront: [0.08, 0.45, 0.15], contactHeight: [0.05, 1.05, 0.45], elbowAngle: [100, 175, 25],
    extension: [0.68, 1.05, 0.2], chain: [2.5, 3, 2], headStable: [0, 0.07, 0.09], trunkLean: [0, 22, 15], finish: [0.7, 1, 0.5], recovery: [0.12, 5, 0.15],
  },
  volley: {
    unitTurn: [12, 60, 30], compact: [0, 0.32, 0.2], kneeBend: [18, 65, 18], baseWidth: [1.1, 2.6, 0.6], contactFront: [0.15, 0.65, 0.15],
    contactHeight: [-0.25, 1.25, 0.4], elbowAngle: [100, 170, 25], headStable: [0, 0.06, 0.08], trunkLean: [0, 22, 15], finish: [0.7, 1, 0.5], recovery: [0.12, 5, 0.15],
  },
  serve: {
    trophyElbow: [70, 115, 25], trophyElbowHeight: [-0.07, 0.1, 0.08], tossArm: [0.15, 0.7, 0.15], kneeBend: [18, 60, 15], legDrive: [0.05, 0.25, 0.05],
    contactReach: [0.18, 0.7, 0.1], elbowAngle: [148, 180, 20], extension: [0.86, 1.05, 0.15], chain: [2.5, 3, 2], headStable: [0, 0.09, 0.1],
    trunkLean: [0, 32, 15], finish: [0.7, 1, 0.5],
  },
};
// racket ranges (coaching heuristics; face: negative = closed, positive = open, degrees from vertical)
const RK_GROUND = { racketFace: [-15, 8, 15], racketHeadHeight: [-0.15, 0.15, 0.12], racketDrop: [0.06, 0.4, 0.08], swingPath: [8, 45, 15], racketLag: [15, 80, 25], takeBack: [-10, 100, 40], racketFinish: [-0.05, 0.6, 0.15] };
for (const k of ['forehand', 'backhand1', 'backhand2']) Object.assign(RANGES[k], RK_GROUND);
Object.assign(RANGES.volley, { racketFace: [0, 25, 15], racketHeadHeight: [0.02, 0.4, 0.1], swingPath: [-30, 10, 15] });
Object.assign(RANGES.serve, { racketHeadHeight: [0.1, 0.6, 0.12], serveDrop: [0.05, 0.45, 0.08] });
RANGES.overhead = { ...RANGES.serve }; delete RANGES.overhead.tossArm;
export const STROKES = ['forehand', 'backhand1', 'backhand2', 'volley', 'serve', 'overhead'];
export function rangeFor(type, key) { return (RANGES[type] || RANGES.forehand)[key]; }

function scoreOf(v, r) {
  if (!r || !Number.isFinite(v)) return { score: NaN, dir: null };
  const [lo, hi, tol] = r;
  if (v >= lo && v <= hi) return { score: 1, dir: null };
  const d = v < lo ? lo - v : v - hi;
  return { score: Math.max(0, 1 - d / tol), dir: v < lo ? 'low' : 'high' };
}

// ---------- main analysis ----------
// opts: {hand:'auto'|'R'|'L', slowmo:'auto'|number, overrides:{[key]:type}, sampleFps}
export function analyze(tr, opts = {}) {
  const n = tr.n;
  const valid = tr.ok.reduce((s, x) => s + (x ? 1 : 0), 0);
  if (n < 8 || valid < 8) return { error: 'noPose', swings: [] };
  const dur = tr.t[n - 1] - tr.t[0];
  const fps = (n - 1) / Math.max(1e-3, dur);
  const BH = bodyHeight(tr), BHimg = bodyHeightImg(tr);
  const mw = 1 + 2 * Math.round(Math.max(1, fps * (typeof opts.slowmo === 'number' ? opts.slowmo : 1) / 60));
  const spdL = movAvg(speedSeries(tr, LM.lWr, BH), mw), spdR = movAvg(speedSeries(tr, LM.rWr, BH), mw);
  const peakSum = (s) => { const p = findPeaks(s, 0, Math.max(2, Math.round(fps * 0.5))).map((i) => s[i]).sort((a, b) => b - a); return p.slice(0, 5).reduce((a, b) => a + b, 0); };
  let handAuto = peakSum(spdR) >= peakSum(spdL) ? 'R' : 'L';
  // two-handed strokes move both wrists together, so speed cannot tell the hitting hand apart
  let handUnsure = false;
  {
    const sp = handAuto === 'R' ? spdR : spdL;
    const top = findPeaks(sp, 0, Math.max(2, Math.round(fps * 0.5))).sort((a, b) => sp[b] - sp[a]).slice(0, 6);
    const gaps = top.map((i) => len(sub(W(tr, i, LM.lWr), W(tr, i, LM.rWr))) / BH);
    const ratio = peakSum(spdR) / Math.max(1e-6, peakSum(spdL));
    const near = ratio > 0.8 && ratio < 1.25;
    const together = gaps.filter((g) => g < 0.13).length >= Math.max(2, 0.7 * gaps.length); // nearly every big swing is two-handed
    if ((together && near) || (ratio > 0.9 && ratio < 1.11)) { handUnsure = true; if (together && near) handAuto = 'R'; }
  }
  const hand = opts.hand === 'R' || opts.hand === 'L' ? opts.hand : handAuto;
  const S = sideIdx(hand);
  const spd = hand === 'R' ? spdR : spdL;
  const yawSh = yawSeries(tr, LM.rSh, LM.lSh), yawHip = yawSeries(tr, LM.rHip, LM.lHip);
  const ctx = { tr, BH, BHimg, fps, S, spd, yawSh, yawHip, hand, spdOff: hand === 'R' ? spdL : spdR };
  const RK = tr.rk ? buildRacket(tr, S, BHimg, fps) : null; ctx.RK = RK;

  let sf = typeof opts.slowmo === 'number' && opts.slowmo > 0 ? opts.slowmo : 1;
  let slowAuto = 1;
  let peaks = detectSwings(ctx, sf);
  if (!(typeof opts.slowmo === 'number')) {
    // slow-motion guess: the wrist-speed peak of a real swing is ~0.12-0.3 s wide (FWHM)
    const top = peaks.slice().sort((a, b) => spd[b] - spd[a]).slice(0, 4);
    const m = median(top.map((c) => peakWidth(tr, spd, c)));
    ctx.peakWidth = m;
    const pk = median(top.map((c) => spd[c]));
    // only clear cases are switched automatically; a milder hint is shown in the UI
    if (Number.isFinite(m) && m > 1.0 && pk < 1.5) {
      const r = m / 0.22; slowAuto = r < 2.9 ? 2 : r < 5.7 ? 4 : 8;
      sf = slowAuto; peaks = detectSwings(ctx, sf);
    }
  }
  ctx.sf = sf;
  const swings = [];
  peaks.forEach((c, k) => {
    const prevC = k > 0 ? peaks[k - 1] : -1, nextC = k < peaks.length - 1 ? peaks[k + 1] : n;
    const sw = analyzeSwing(ctx, c, prevC, nextC, opts.overrides || {});
    if (sw) swings.push(sw);
  });
  swings.forEach((s, i) => { s.index = i + 1; });
  // relative wrist speed (vs. best swing of the same type)
  for (const s of swings) {
    const same = swings.filter((o) => o.type === s.type).map((o) => o.metrics.wristSpeed?.v || 0);
    const best = Math.max(...same, 1e-6);
    if (s.metrics.wristSpeed) s.metrics.wristSpeed.rel = s.metrics.wristSpeed.v / best;
  }
  // camera view for the whole clip
  const views = swings.map((s) => s.view);
  let view;
  if (views.length) {
    const counts = {}; views.forEach((v) => { counts[v.key] = (counts[v.key] || 0) + 1; });
    const key = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    view = { key, angle: median(views.filter((v) => v.key === key).map((v) => v.angle)) };
  } else {
    const ax = bodyAxes(tr, 0, Math.min(n - 1, Math.round(fps)));
    view = viewOf(ax.F);
  }
  const consistency = computeConsistency(swings);
  const overall = overallSummary(swings);
  return {
    n, fps, fpsReal: fps * sf, peakWidth: ctx.peakWidth, slowHint: sf === 1 && ctx.peakWidth > 0.6, duration: dur, BH, BHimg, hand, handAuto, handUnsure, slowmo: sf, slowAuto, view, swings, consistency, overall,
    series: { t: tr.t, speed: spd, speedOff: ctx.spdOff, yawSh, yawHip },
    racket: RK ? { hx: RK.hx, hy: RK.hy, ok: RK.ok, face: RK.face, rate: RK.rate } : null,
    tracked: valid / n, swaps: tr.swaps,
  };
}

function findPeaks(s, thr, minSep) {
  const n = s.length, out = [];
  for (let i = 1; i < n - 1; i++) if (s[i] >= thr && s[i] >= s[i - 1] && s[i] > s[i + 1]) out.push(i);
  // keep the highest within minSep
  out.sort((a, b) => s[b] - s[a]);
  const kept = [];
  for (const i of out) if (kept.every((j) => Math.abs(j - i) >= minSep)) kept.push(i);
  return kept.sort((a, b) => a - b);
}
function detectSwings(ctx, sf) {
  const { tr, spd, fps, BH, S } = ctx;
  const n = tr.n;
  let mx = 0; for (let i = 0; i < n; i++) if (spd[i] > mx) mx = spd[i];
  const thr = Math.max(0.3 * mx, 0.35 / sf);
  const cand = findPeaks(spd, thr, Math.max(2, Math.round(fps * 0.6 * sf)));
  // group speed peaks that belong to one stroke (take-back, hit, finish are often separate peaks)
  const groups = [];
  for (const c of cand) {
    const g = groups[groups.length - 1];
    if (g && tr.t[c] - tr.t[g[g.length - 1]] < 1.25 * sf) g.push(c); else groups.push([c]);
  }
  const out = [];
  const step = Math.max(1, Math.round(fps / 30));
  for (const g of groups) {
    // contact = fastest motion forward (or forward-up, for serves) in the player's facing direction
    const a0 = Math.max(0, idxAt(tr, tr.t[g[0]] - 0.35 * sf)), a1 = Math.min(n - 2, idxAt(tr, tr.t[g[g.length - 1]] + 0.25 * sf));
    const ax = bodyAxes(tr, Math.max(0, idxAt(tr, tr.t[g[0]] - 1.5 * sf)), Math.min(n - 1, idxAt(tr, tr.t[g[g.length - 1]] + 1.0 * sf)));
    const FU = norm(add(ax.F, UP));
    let best = -1, bi = g[0], gmax = 0;
    for (const c of g) gmax = Math.max(gmax, spd[c]);
    for (let i = Math.max(1, a0); i <= a1; i++) {
      if (!tr.ok[i - 1] || !tr.ok[i + 1]) continue;
      const v = mul(sub(sub(W(tr, i + 1, S.wr), hipMidW(tr, i + 1)), sub(W(tr, i - 1, S.wr), hipMidW(tr, i - 1))), 1 / Math.max(1e-3, tr.t[i + 1] - tr.t[i - 1]) / BH);
      const d = Math.max(dot(v, ax.F), dot(v, FU)) * 0.7 + 0.3 * spd[i]; // mostly direction, some raw speed
      if (d > best) { best = d; bi = i; }
    }
    // overhead strokes: if the hitting hand goes well above the head in this group, that is the hit
    let hiI = -1, hiV = 0.1;
    for (let i = Math.max(1, a0); i <= a1; i++) {
      if (!tr.ok[i]) continue;
      const h = (W(tr, i, LM.nose)[1] - W(tr, i, S.wr)[1]) / BH;
      if (h > hiV && spd[i] > 0.5 * gmax) { hiV = h; hiI = i; }
    }
    if (hiI >= 0) bi = hiI;
    // snap to the local speed maximum near the forward-drive peak
    let c = bi;
    for (let i = Math.max(0, bi - Math.round(0.08 * fps * sf)); i <= Math.min(n - 1, bi + Math.round(0.08 * fps * sf)); i++) if (spd[i] > spd[c]) c = i;
    // path length on ~30 Hz samples so that jitter does not add up, and enough tracked frames
    const i0 = idxAt(tr, tr.t[c] - 0.5 * sf), i1 = idxAt(tr, tr.t[c] + 0.3 * sf);
    let path = 0, real = 0;
    for (let i = i0 + step; i <= i1; i += step) path += len(sub(sub(W(tr, i, S.wr), hipMidW(tr, i)), sub(W(tr, i - step, S.wr), hipMidW(tr, i - step))));
    for (let i = i0; i <= i1; i++) if (tr.ok[i] === 1) real++;
    if (path / BH > 0.25 && real >= Math.max(3, 0.6 * (i1 - i0))) out.push(c);
  }
  return out;
}
function peakWidth(tr, spd, c) {
  const h = spd[c] / 2; let a = c, b = c;
  while (a > 0 && spd[a] > h) a--;
  while (b < tr.n - 1 && spd[b] > h) b++;
  return tr.t[b] - tr.t[a];
}
function forwardDuration(ctx, c, sf) {
  const { tr, spd } = ctx;
  const i0 = idxAt(tr, tr.t[c] - 1.0 * sf);
  let b = c; for (let i = c - 1; i >= i0; i--) { if (spd[i] < 0.25 * spd[c]) { b = i; break; } }
  return b < c ? tr.t[c] - tr.t[b] : NaN;
}

function windowVis(tr, i0, i1, ks) {
  let s = 0, c = 0;
  for (let i = Math.max(0, i0); i <= Math.min(tr.n - 1, i1); i++) for (const k of ks) { s += VIS(tr, i, k); c++; }
  return c ? clamp(s / c, 0, 1) : 0;
}
function realShare(tr, i0, i1) {
  let r = 0, c = 0; for (let i = Math.max(0, i0); i <= Math.min(tr.n - 1, i1); i++) { c++; if (tr.ok[i] === 1) r++; }
  return c ? r / c : 0;
}
const depthShare = (v) => { const l = len(v); return l > 1e-6 ? Math.abs(v[2]) / l : 0.5; };
const depthF = (share) => 1 - 0.62 * clamp(share, 0, 1);

function analyzeSwing(ctx, c0, prevC, nextC, overrides) {
  let c = c0;
  const { tr, BH, BHimg, fps, S, spd, yawSh, yawHip, sf } = ctx;
  const T = (i) => tr.t[i];
  const n = tr.n;
  let lo = Math.max(prevC >= 0 ? Math.round((prevC + c) / 2) : 0, idxAt(tr, T(c) - 1.7 * sf));
  let hi = Math.min(nextC < n ? Math.round((c + nextC) / 2) : n - 1, idxAt(tr, T(c) + 1.5 * sf));
  // only use the tracked stretch around this swing (no frames across a tracking gap)
  let lo2 = c; while (lo2 > lo && tr.ok[lo2 - 1]) lo2--;
  lo = lo2;
  let hi2 = c; while (hi2 < hi && tr.ok[hi2 + 1]) hi2++;
  hi = hi2;
  if (c - lo < 3) return null;
  // shoulder coil relative to the start of the window
  const base = median([yawSh[lo], yawSh[Math.min(c, lo + 1)], yawSh[Math.min(c, lo + 2)]]);
  let b = lo, coilMax = 0;
  for (let i = lo; i < c; i++) { const cv = Math.abs(yawSh[i] - base); if (cv > coilMax) { coilMax = cv; b = i; } }
  const minSpdBack = () => { let m = 1e9, mi = Math.max(lo, c - 2); for (let i = Math.max(lo, idxAt(tr, T(c) - 0.6 * sf)); i < c - 1; i++) if (spd[i] < m) { m = spd[i]; mi = i; } return mi; };
  if (coilMax < 12 || b >= c - 1) b = minSpdBack();
  let u = lo;
  for (let i = b; i >= lo; i--) { if (Math.abs(yawSh[i] - base) < 0.2 * coilMax) { u = i; break; } }
  if (coilMax < 12) u = Math.max(lo, idxAt(tr, T(b) - 0.35 * sf));
  let fin = Math.min(hi, idxAt(tr, T(c) + 0.8 * sf));
  for (let i = c + 1; i <= hi; i++) if (spd[i] < 0.22 * spd[c]) { fin = i; break; }
  // body frame at the start of this swing
  const ax = bodyAxes(tr, Math.max(lo, u - Math.round(0.1 * fps)), u);
  const F = ax.F, Ld = ctx.hand === 'R' ? mul(ax.lat, -1) : ax.lat; // towards the dominant side
  const view = viewOf(F);
  const rel = (i, k) => sub(W(tr, i, k), hipMidW(tr, i));
  const fwd = (i, k) => dot(rel(i, k), F) / BH;
  const lat = (i, k) => dot(rel(i, k), Ld) / BH;
  const upv = (i, k) => -(W(tr, i, k)[1] - hipMidW(tr, i)[1]) / BH;

  // ---- classification ----
  // overhead strokes: the hitting wrist peaks above the head near the speed peak; contact = highest reach
  let tossUp = -1, trophy = -1;
  for (let i = Math.max(lo, idxAt(tr, T(c) - 1.6 * sf)); i < Math.max(lo + 1, idxAt(tr, T(c) - 0.08 * sf)); i++) {
    const h = (W(tr, i, LM.nose)[1] - W(tr, i, S.owr)[1]) / BH; if (h > tossUp) { tossUp = h; trophy = i; }
  }
  let headUp = -9;
  {
    let hc = c;
    for (let i = Math.max(lo, idxAt(tr, T(c) - 0.12 * sf)); i <= Math.min(hi, idxAt(tr, T(c) + 0.15 * sf)); i++) {
      const h = (W(tr, i, LM.nose)[1] - W(tr, i, S.wr)[1]) / BH; if (h > headUp) { headUp = h; hc = i; }
    }
    // an overhead comes down from above: shortly before the top the wrist is already near shoulder
    // height (a high one-handed backhand finish rises from the waist instead)
    const pre = Math.max(lo, idxAt(tr, T(hc) - 0.15 * sf));
    const preRel = (W(tr, pre, S.sh)[1] - W(tr, pre, S.wr)[1]) / BH;
    if (headUp > 0.1 && preRel > -0.12 && tossUp > 0.14) c = hc;
    else headUp = Math.min(0.09, (W(tr, c, LM.nose)[1] - W(tr, c, S.wr)[1]) / BH);
  }
  const latB = mean([b - 2, b - 1, b, b + 1].filter((i) => i >= lo && i < c).map((i) => lat(i, S.wr)));
  // two hands on the racket: wrists stay together through contact (a one-hander lets go)
  const handsGap = []; for (let i = Math.max(b, c - 2); i <= Math.min(hi, c + 1); i++) handsGap.push(len(sub(W(tr, i, S.wr), W(tr, i, S.owr))) / BH);
  const twoHanded = median(handsGap) < 0.14;
  const backLen = (() => { let m = 0; for (let i = Math.max(lo, idxAt(tr, T(c) - 0.5 * sf)); i < c; i++) m = Math.max(m, len(sub(rel(i, S.wr), rel(c, S.wr))) / BH); return m; })();
  let typeAuto;
  if (headUp > 0.1) typeAuto = 'serve'; // overheads look alike from pose alone; the user can relabel
  else if (coilMax < 38 && backLen < 0.42) typeAuto = 'volley';
  else if (latB < 0) typeAuto = twoHanded ? 'backhand2' : 'backhand1';
  else typeAuto = 'forehand';
  const key = String(Math.round(T(c) * 10));
  const type = overrides[key] && STROKES.includes(overrides[key]) ? overrides[key] : typeAuto;
  const isServe = type === 'serve' || type === 'overhead';
  if (isServe && trophy < 0) trophy = Math.max(lo, c - 3);

  // ---- metrics ----
  const M = {};
  const put = (k, v, conf, frame, extra = {}) => {
    const r = rangeFor(type, k);
    if (!r && k !== 'wristSpeed') return;
    if (!Number.isFinite(v)) return;
    const sc = scoreOf(v, r);
    M[k] = { key: k, v, conf: clamp(conf, 0, 1), frame, time: T(frame), range: r, ...sc, ...METRICS[k], ...extra };
  };
  const visW = (i0, i1, ks) => windowVis(tr, i0, i1, ks);
  const rs = (i0, i1) => 0.6 + 0.4 * realShare(tr, i0, i1);
  const fpsReal = fps * sf;
  const timingF = clamp(fpsReal / 75, 0.3, 1);
  const shVec = (i) => horiz(sub(W(tr, i, LM.lSh), W(tr, i, LM.rSh)));
  const hipVec = (i) => horiz(sub(W(tr, i, LM.lHip), W(tr, i, LM.rHip)));
  const segShare = (i, a, b2) => depthShare(sub(W(tr, i, b2), W(tr, i, a)));
  const kneeAng = (i) => (angleAt(W(tr, i, LM.lHip), W(tr, i, LM.lKn), W(tr, i, LM.lAn)) + angleAt(W(tr, i, LM.rHip), W(tr, i, LM.rKn), W(tr, i, LM.rAn))) / 2;
  const hipHeight = (i) => (ankMidW(tr, i)[1] - hipMidW(tr, i)[1]) / BH;

  if (!isServe) {
    // unit turn and hip-shoulder separation
    const sepBase = wrap180(yawSh[u] - yawHip[u]);
    let sepMax = 0, sepI = b;
    for (let i = u; i <= b; i++) { const s = Math.abs(wrap180(yawSh[i] - yawHip[i]) - sepBase); if (s > sepMax) { sepMax = s; sepI = i; } }
    const turnConf = visW(u, b, [11, 12]) * depthF((depthShare(shVec(u)) + depthShare(shVec(b))) / 2) * rs(u, b);
    put('unitTurn', Math.max(coilMax, Math.abs(yawSh[b] - yawSh[u])), turnConf, b);
    if (type !== 'volley') put('separation', sepMax, 0.65 * turnConf * visW(u, b, [23, 24]) * depthF(depthShare(hipVec(sepI))), sepI);
    if (type === 'volley') put('compact', backLen, visW(b, c, [S.wr, S.el]) * rs(b, c) * 0.9, b);
    // non-hitting arm
    if (type === 'forehand') {
      const armLen = len(sub(W(tr, b, S.oel), W(tr, b, S.osh))) + len(sub(W(tr, b, S.owr), W(tr, b, S.oel)));
      const ext = len(sub(W(tr, b, S.owr), W(tr, b, S.osh))) / Math.max(1e-3, armLen);
      put('offArm', ext, visW(b - 1, b + 1, [S.osh, S.oel, S.owr]) * depthF((segShare(b, S.osh, S.oel) + segShare(b, S.oel, S.owr)) / 2) * rs(b, b), b);
    } else if (type === 'backhand1') {
      const gap = fwd(c, S.wr) - fwd(c, S.owr);
      put('offArm', gap, visW(c - 1, c + 1, [S.owr, S.wr]) * depthF(Math.abs(F[2])) * rs(c, c), c, { unitOverride: 'pctBH' });
    }
    // legs
    let kMin = 999, kI = b;
    for (let i = u; i <= c; i++) { const a = kneeAng(i); if (a < kMin) { kMin = a; kI = i; } }
    const kneeShare = (segShare(kI, LM.lHip, LM.lKn) + segShare(kI, LM.lKn, LM.lAn) + segShare(kI, LM.rHip, LM.rKn) + segShare(kI, LM.rKn, LM.rAn)) / 4;
    put('kneeBend', 180 - kMin, visW(kI - 1, kI + 1, [25, 26, 27, 28]) * depthF(kneeShare) * rs(kI, kI), kI);
    if (type !== 'volley') {
      let hMin = 9, hMinI = u; for (let i = u; i <= c; i++) { const h = hipHeight(i); if (h < hMin) { hMin = h; hMinI = i; } }
      let hMax = -9, hMaxI = c; for (let i = Math.max(hMinI, c - 2); i <= Math.min(hi, idxAt(tr, T(c) + 0.15 * sf)); i++) { const h = hipHeight(i); if (h > hMax) { hMax = h; hMaxI = i; } }
      put('legDrive', hMax - hMin, visW(hMinI, hMaxI, [23, 24, 27, 28]) * 0.85 * rs(hMinI, hMaxI), hMaxI);
    }
    const bw = len(horiz(sub(W(tr, c, LM.lAn), W(tr, c, LM.rAn)))) / Math.max(0.1, len(sub(W(tr, c, LM.lSh), W(tr, c, LM.rSh))));
    put('baseWidth', bw, visW(c - 1, c + 1, [27, 28, 11, 12]) * depthF(depthShare(sub(W(tr, c, LM.lAn), W(tr, c, LM.rAn)))) * rs(c, c), c);
    // contact
    put('contactFront', fwd(c, S.wr), visW(c - 1, c + 1, [S.wr, 23, 24]) * depthF(Math.abs(F[2])) * rs(c - 1, c + 1), c, { lat: lat(c, S.wr) });
    const shUp = upv(c, S.sh) || 0.3;
    put('contactHeight', upv(c, S.wr) / Math.max(0.1, shUp), visW(c - 1, c + 1, [S.wr, S.sh]) * 0.95 * rs(c, c), c);
  } else {
    // serve / overhead
    // trophy: after the toss peaks, the most bent hitting elbow while the hand is still above the elbow
    // (once the hand drops behind the back, it is the racket drop, not the trophy)
    let tr0 = trophy, bestA = 999;
    for (let i = Math.max(lo, idxAt(tr, T(trophy) - 0.15 * sf)); i < Math.max(lo + 1, idxAt(tr, T(c) - 0.08 * sf)); i++) {
      if (W(tr, i, S.wr)[1] > W(tr, i, S.el)[1]) continue;
      const a = angleAt(W(tr, i, S.sh), W(tr, i, S.el), W(tr, i, S.wr)); if (a < bestA) { bestA = a; tr0 = i; }
    }
    trophy = tr0;
    put('trophyElbow', angleAt(W(tr, tr0, S.sh), W(tr, tr0, S.el), W(tr, tr0, S.wr)), visW(tr0 - 1, tr0 + 1, [S.sh, S.el, S.wr]) * depthF((segShare(tr0, S.sh, S.el) + segShare(tr0, S.el, S.wr)) / 2) * rs(tr0, tr0), tr0);
    put('trophyElbowHeight', upv(tr0, S.el) - upv(tr0, S.sh), visW(tr0 - 1, tr0 + 1, [S.sh, S.el]) * 0.9 * rs(tr0, tr0), tr0);
    if (type === 'serve') put('tossArm', tossUp, visW(tr0 - 1, tr0 + 1, [S.owr, 0]) * 0.95 * rs(tr0, tr0), tr0);
    const k0 = Math.max(lo, idxAt(tr, T(tr0) - 0.45 * sf));
    let kMin = 999, kI = tr0;
    for (let i = k0; i <= c; i++) { const a = kneeAng(i); if (a < kMin) { kMin = a; kI = i; } }
    const kneeShare = (segShare(kI, LM.lHip, LM.lKn) + segShare(kI, LM.lKn, LM.lAn) + segShare(kI, LM.rHip, LM.rKn) + segShare(kI, LM.rKn, LM.rAn)) / 4;
    put('kneeBend', 180 - kMin, visW(kI - 1, kI + 1, [25, 26, 27, 28]) * depthF(kneeShare) * rs(kI, kI), kI);
    let hMin = 9, hMinI = kI; for (let i = k0; i <= c; i++) { const h = hipHeight(i); if (h < hMin) { hMin = h; hMinI = i; } }
    let hMax = -9, hMaxI = c; for (let i = hMinI; i <= Math.min(hi, idxAt(tr, T(c) + 0.15 * sf)); i++) { const h = hipHeight(i); if (h > hMax) { hMax = h; hMaxI = i; } }
    // ankles leave the ground on a serve, so hip-to-ankle height drops: use hip rise vs. ankles at the low point
    put('legDrive', hMax - hMin, visW(hMinI, hMaxI, [23, 24, 27, 28]) * 0.8 * rs(hMinI, hMaxI), hMaxI);
    put('contactReach', headUp, visW(c - 1, c + 1, [S.wr, 0]) * 0.95 * rs(c, c), c);
  }
  // elbow and arm extension at contact
  const elb = angleAt(W(tr, c, S.sh), W(tr, c, S.el), W(tr, c, S.wr));
  const armShare = (segShare(c, S.sh, S.el) + segShare(c, S.el, S.wr)) / 2;
  const armConf = visW(c - 1, c + 1, [S.sh, S.el, S.wr]) * depthF(armShare) * rs(c - 1, c + 1);
  put('elbowAngle', elb, armConf, c);
  if (type !== 'volley') {
    const armLen = len(sub(W(tr, c, S.el), W(tr, c, S.sh))) + len(sub(W(tr, c, S.wr), W(tr, c, S.el)));
    put('extension', len(sub(W(tr, c, S.wr), W(tr, c, S.sh))) / Math.max(1e-3, armLen), armConf, c);
  }
  // kinetic chain: peak timing hips -> shoulders -> elbow -> wrist
  let chainInfo = null;
  if (type !== 'volley') {
    const w0 = isServe ? Math.max(lo, trophy) : Math.max(lo, b), w1 = Math.min(hi, idxAt(tr, T(c) + 0.08 * sf));
    if (w1 - w0 >= 3) {
      const hipW = deriv(tr.t, yawHip), shW = deriv(tr.t, yawSh), elS = speedSeries(tr, S.el, BH);
      const pk = (arr, abs = true) => { let m = -1, mi = w0; for (let i = w0; i <= w1; i++) { const v = abs ? Math.abs(arr[i]) : arr[i]; if (v > m) { m = v; mi = i; } } return mi; };
      const order = [pk(hipW), pk(shW), pk(elS), c];
      const tol = 0.5 / fps;
      let ok = 0; for (let j = 0; j < 3; j++) if (T(order[j]) <= T(order[j + 1]) + tol) ok++;
      chainInfo = order.map((i) => (T(i) - T(c)) / sf);
      put('chain', ok, timingF * 0.85 * visW(w0, w1, [11, 12, 23, 24, S.el, S.wr]) * rs(w0, w1), c, { times: chainInfo });
    }
  }
  // wrist speed (info)
  put('wristSpeed', spd[c] * sf, visW(c - 1, c + 1, [S.wr]) * rs(c - 1, c + 1), c);
  // balance: head stillness around contact (2D image), trunk lean at contact
  {
    const h0 = idxAt(tr, T(c) - 0.12 * sf), h1 = Math.min(hi, idxAt(tr, T(c) + 0.12 * sf));
    const p0 = I2(tr, h0, LM.nose); let m = 0;
    for (let i = h0; i <= h1; i++) m = Math.max(m, len(sub(I2(tr, i, LM.nose), p0)));
    // forward motion towards the camera is invisible in 2D, so a front view lowers confidence
    put('headStable', m / BHimg, visW(h0, h1, [0]) * 0.85 * depthF(Math.abs(F[2]) * 0.8) * rs(h0, h1), c);
    const trunk = sub(shMidW(tr, c), hipMidW(tr, c));
    const lean = Math.acos(clamp(dot(norm(trunk), UP), -1, 1)) * D;
    put('trunkLean', lean, visW(c - 1, c + 1, [11, 12, 23, 24]) * depthF(depthShare(trunk) * 0.8) * rs(c, c), c);
  }
  // follow-through finish
  {
    let f = fin; // highest point after contact for groundstrokes, end point for serves
    if (!isServe && type !== 'volley') {
      let best = -9; for (let i = c; i <= Math.min(hi, idxAt(tr, T(c) + 0.7 * sf)); i++) { const h = upv(i, S.wr); if (h > best) { best = h; f = i; } }
    }
    const shU = Math.max(0.1, upv(f, S.sh));
    const hRatio = upv(f, S.wr) / shU, lt = lat(f, S.wr);
    let q;
    if (type === 'forehand') q = 0.5 * clamp(hRatio / 0.85, 0, 1) + 0.5 * clamp((0.12 - lt) / 0.2, 0, 1);
    else if (type === 'backhand1') q = 0.6 * clamp(hRatio / 0.9, 0, 1) + 0.4 * clamp((lt + 0.15) / 0.2, 0, 1);
    else if (type === 'backhand2') q = clamp(hRatio / 0.85, 0, 1);
    else if (type === 'volley') { const trav = len(sub(rel(f, S.wr), rel(c, S.wr))) / BH; q = clamp(1 - (trav - 0.35) / 0.4, 0, 1); }
    else q = 0.5 * clamp((0.9 - hRatio) / 0.7, 0, 1) + 0.5 * clamp((0.1 - lt) / 0.2, 0, 1);
    put('finish', q, visW(f - 1, f + 1, [S.wr, S.sh]) * depthF(depthShare(Ld) * 0.6) * rs(f, f), f, { finishHeight: hRatio, finishLat: lt });
  }
  // recovery: movement of the feet within ~1 s after the finish (needs footage after the swing)
  if (!isServe) {
    const r1 = idxAt(tr, T(fin) + 1.0 * sf);
    if (r1 <= hi && T(hi) - T(fin) >= 0.7 * sf) {
      const a0 = I2(tr, fin, LM.lAn), b0 = I2(tr, fin, LM.rAn); let m = 0;
      for (let i = fin; i <= Math.min(hi, r1); i++) m = Math.max(m, (len(sub(I2(tr, i, LM.lAn), a0)) + len(sub(I2(tr, i, LM.rAn), b0))) / 2);
      put('recovery', m / BHimg, visW(fin, r1, [27, 28]) * 0.6 * rs(fin, r1), fin);
    }
  }
  if (ctx.RK) racketMetrics(ctx, { lo, hi, u, b, c, fin, trophy, type, isServe, F, put, sf });
  // per-area scores
  const areas = {};
  for (const a of AREAS) {
    let s = 0, w = 0, cw = 0, cnt = 0;
    for (const m of Object.values(M)) if (m.area === a && Number.isFinite(m.score) && m.impact > 0) {
      const ww = m.impact * m.conf; s += m.score * ww; w += ww; cw += m.conf; cnt++;
    }
    areas[a] = cnt && w > 0.05 ? { score: s / w, conf: cw / cnt } : null;
  }
  const phases = {
    start: T(lo), ready: T(lo), prep: T(u), forward: T(isServe ? trophy : b), contact: T(c), follow: T(Math.min(c + 1, hi)), recovery: T(fin), end: T(hi),
  };
  return {
    key, type, typeAuto, view, F, idx: { lo, u, b, c, fin, hi, trophy }, phases, metrics: M, areas, coil: coilMax,
    forwardTime: (T(c) - T(isServe ? trophy : b)) / sf, chain: chainInfo, twoHanded, latB,
  };
}

// ---------- issues, strengths, consistency ----------
export const CONF_MIN = 0.45;
export function rankIssues(sw, max = 3) {
  return Object.values(sw.metrics)
    .filter((m) => m.impact > 0 && Number.isFinite(m.score) && m.score < 0.75 && m.conf >= CONF_MIN)
    .map((m) => ({ ...m, severity: (1 - m.score) * m.impact * (0.5 + 0.5 * m.conf) }))
    .sort((a, b) => b.severity - a.severity).slice(0, max);
}
export function rankStrengths(sw, max = 2) {
  return Object.values(sw.metrics)
    .filter((m) => m.impact > 0 && m.score >= 0.95 && m.conf >= 0.55)
    .sort((a, b) => b.impact * b.conf - a.impact * a.conf).slice(0, max);
}
function overallSummary(swings) {
  const agg = {};
  for (const s of swings) for (const m of rankIssues(s, 5)) {
    const k = s.type + '|' + m.key + '|' + m.dir;
    (agg[k] = agg[k] || { type: s.type, key: m.key, dir: m.dir, unit: m.unitOverride || m.unit, sev: 0, swings: [], values: [], frames: [] });
    agg[k].sev += m.severity; agg[k].swings.push(s.index); agg[k].values.push(m.v); agg[k].frames.push(m.time);
  }
  const byType = {}; swings.forEach((s) => { byType[s.type] = (byType[s.type] || 0) + 1; });
  const issues = Object.values(agg).map((a) => ({ ...a, sev: a.sev / byType[a.type] * Math.min(1, 0.5 + a.swings.length / 4), v: median(a.values) }))
    .sort((a, b) => b.sev - a.sev).slice(0, 3);
  const sagg = {};
  for (const s of swings) for (const m of rankStrengths(s, 4)) {
    const k = s.type + '|' + m.key; (sagg[k] = sagg[k] || { type: s.type, key: m.key, unit: m.unitOverride || m.unit, n: 0, values: [] }); sagg[k].n++; sagg[k].values.push(m.v);
  }
  const strengths = Object.values(sagg).filter((a) => a.n >= Math.max(1, Math.ceil(byType[a.type] / 2)))
    .map((a) => ({ ...a, v: median(a.values), w: a.n / byType[a.type] * METRICS[a.key].impact })).sort((a, b) => b.w - a.w).slice(0, 3);
  const areas = {};
  for (const a of AREAS) {
    const v = swings.map((s) => s.areas[a]).filter(Boolean);
    areas[a] = v.length ? { score: mean(v.map((x) => x.score)), conf: mean(v.map((x) => x.conf)) } : null;
  }
  return { issues, strengths, areas, byType };
}
function computeConsistency(swings) {
  const out = [];
  const groups = {};
  swings.forEach((s) => { (groups[s.type] = groups[s.type] || []).push(s); });
  for (const [type, list] of Object.entries(groups)) {
    if (list.length < 2) continue;
    const rows = [];
    for (const [k, tol] of [['contactFront', 0.2], ['contactHeight', 0.6], ['contactReach', 0.15], ['elbowAngle', 35], ['unitTurn', 40], ['kneeBend', 25], ['wristSpeed', null]]) {
      const vals = list.map((s) => s.metrics[k]).filter((m) => m && m.conf >= 0.35).map((m) => m.v);
      if (vals.length < 2) continue;
      const sd = std(vals), mu = mean(vals);
      const t2 = tol ?? Math.max(0.2, 0.35 * mu);
      rows.push({ key: k, mean: mu, sd, score: clamp(1 - sd / t2, 0, 1) });
    }
    const ft = list.map((s) => s.forwardTime).filter(Number.isFinite);
    if (ft.length >= 2) rows.push({ key: 'forwardTime', mean: mean(ft), sd: std(ft), score: clamp(1 - std(ft) / 0.15, 0, 1) });
    out.push({ type, count: list.length, rows, score: rows.length ? mean(rows.map((r) => r.score)) : NaN });
  }
  return out;
}

// interpolated 2D skeleton at time t (for drawing), in normalized image coords (x/aspect)
export function poseAt(tr, time) {
  if (!tr || !tr.n) return null;
  let i = idxAt(tr, time);
  if (i > 0 && Math.abs(tr.t[i - 1] - time) < Math.abs(tr.t[i] - time)) i--;
  if (!tr.ok[i] || Math.abs(tr.t[i] - time) > 0.25) return null;
  const out = new Float32Array(NLM * 3);
  for (let k = 0; k < NLM; k++) { out[k * 3] = tr.img[i * ST + k * 3] / tr.aspect; out[k * 3 + 1] = tr.img[i * ST + k * 3 + 1]; out[k * 3 + 2] = tr.img[i * ST + k * 3 + 2]; }
  return out;
}
export function frameIndexAt(tr, time) { return idxAt(tr, time); }
// joint-angle series for charts
export function angleSeries(tr, hand, i0, i1) {
  const S = sideIdx(hand), o = { t: [], elbow: [], knee: [], trunk: [] };
  for (let i = i0; i <= i1; i++) {
    o.t.push(tr.t[i]);
    if (!tr.ok[i]) { o.elbow.push(NaN); o.knee.push(NaN); o.trunk.push(NaN); continue; }
    o.elbow.push(angleAt(W(tr, i, S.sh), W(tr, i, S.el), W(tr, i, S.wr)));
    o.knee.push((angleAt(W(tr, i, LM.lHip), W(tr, i, LM.lKn), W(tr, i, LM.lAn)) + angleAt(W(tr, i, LM.rHip), W(tr, i, LM.rKn), W(tr, i, LM.rAn))) / 2);
    const trunk = sub(shMidW(tr, i), hipMidW(tr, i));
    o.trunk.push(Math.acos(clamp(dot(norm(trunk), UP), -1, 1)) * D);
  }
  return o;
}
export const _test = { yawSeries, bodyAxes, viewOf, bodyHeight, speedSeries };

// ---------- racket ----------
// Per frame: pick the detected racket box nearest the hitting wrist, estimate the head point
// (edge centroid of the half of the box away from the hand), fill short gaps, smooth.
function buildRacket(tr, S, BHimg, fps) {
  const n = tr.n, A = tr.aspect;
  const hx = new Float32Array(n).fill(NaN), hy = new Float32Array(n).fill(NaN), sc = new Float32Array(n), ang = new Float32Array(n).fill(NaN), ratio = new Float32Array(n).fill(NaN), ok = new Uint8Array(n);
  let found = 0, framesWithPlayer = 0;
  for (let i = 0; i < n; i++) {
    if (!tr.ok[i]) continue; framesWithPlayer++;
    const wx = tr.img[i * ST + S.wr * 3], wy = tr.img[i * ST + S.wr * 3 + 1];
    let best = null, bd = 1e9;
    for (const b of tr.rk[i] || []) {
      const bx = (b.x + b.w / 2) * A, by = b.y + b.h / 2;
      const dx = Math.max(b.x * A - wx, 0, wx - (b.x + b.w) * A), dy = Math.max(b.y - wy, 0, wy - (b.y + b.h));
      const d = Math.hypot(dx, dy) - b.s * 0.05;
      if (d < bd && d < 0.35 * BHimg) { bd = d; best = { b, bx, by }; }
    }
    if (!best) continue;
    const b = best.b;
    // tip = box corner farthest from the hand; head centre about 3/4 of the way out
    const corners = [[b.x * A, b.y], [(b.x + b.w) * A, b.y], [b.x * A, b.y + b.h], [(b.x + b.w) * A, b.y + b.h]];
    let far = corners[0], fd = -1; for (const cpt of corners) { const d = Math.hypot(cpt[0] - wx, cpt[1] - wy); if (d > fd) { fd = d; far = cpt; } }
    const px = wx + 0.75 * (far[0] - wx), py = wy + 0.75 * (far[1] - wy);
    const L = Math.hypot(px - wx, py - wy); if (L > 0.5 * BHimg || L < 0.12 * BHimg) continue;
    // the racket continues roughly from the forearm (lag rarely exceeds ~120 degrees)
    const ex = tr.img[i * ST + S.el * 3], ey = tr.img[i * ST + S.el * 3 + 1];
    const fa = [wx - ex, wy - ey], sh = [px - wx, py - wy];
    const cosA = (fa[0] * sh[0] + fa[1] * sh[1]) / ((Math.hypot(fa[0], fa[1]) * L) || 1);
    if (cosA < -0.5) continue;
    hx[i] = px; hy[i] = py; sc[i] = b.s; ang[i] = b.ang; ratio[i] = b.ratio; ok[i] = 1; found++;
  }
  const maxGap = Math.max(1, Math.round(0.15 * fps)); let last = -1;
  for (let i = 0; i < n; i++) {
    if (ok[i] !== 1) continue;
    if (last >= 0 && i - last > 1 && i - last <= maxGap + 1) for (let g = last + 1; g < i; g++) { const a = (g - last) / (i - last); hx[g] = hx[last] * (1 - a) + hx[i] * a; hy[g] = hy[last] * (1 - a) + hy[i] * a; sc[g] = Math.min(sc[last], sc[i]) * 0.7; ok[g] = 2; }
    last = i;
  }
  const sx = Float32Array.from(hx), sy = Float32Array.from(hy);
  for (let i = 1; i < n - 1; i++) if (ok[i] && ok[i - 1] && ok[i + 1]) { sx[i] = (hx[i - 1] + 2 * hx[i] + hx[i + 1]) / 4; sy[i] = (hy[i - 1] + 2 * hy[i] + hy[i + 1]) / 4; }
  const outx = new Float32Array(n), outy = new Float32Array(n);
  for (let i = 0; i < n; i++) { outx[i] = ok[i] ? sx[i] / A : NaN; outy[i] = ok[i] ? sy[i] : NaN; }
  return { hx: outx, hy: outy, ax: sx, ay: sy, sc, ang, ratio, ok, rate: framesWithPlayer ? found / framesWithPlayer : 0, face: new Float32Array(n).fill(NaN) };
}
function racketMetrics(ctx, { lo, hi, b, c, trophy, type, isServe, F, put, sf }) {
  const { tr, RK, S, BHimg, fps } = ctx; const T = (i) => tr.t[i];
  const W2 = (i, k) => [tr.img[i * ST + k * 3], tr.img[i * ST + k * 3 + 1]];
  const has = (i) => i >= 0 && i < tr.n && RK.ok[i];
  const near = (i, r = 2) => { for (let d = 0; d <= r; d++) { if (has(i - d)) return i - d; if (has(i + d)) return i + d; } return -1; };
  const cover = (i0, i1) => { let k = 0, m = 0; for (let i = Math.max(0, i0); i <= Math.min(tr.n - 1, i1); i++) { m++; if (RK.ok[i] === 1) k++; } return m ? k / m : 0; };
  const fx = F ? F[0] : 0, side = Math.abs(fx), fsg = fx >= 0 ? 1 : -1;
  const blurF = fps * sf >= 50 ? 1 : 0.75;
  const ci = near(c, Math.max(1, Math.round(0.04 * fps)));
  if (ci >= 0) {
    const w = W2(ci, S.wr), hh = (w[1] - RK.ay[ci]) / BHimg;
    put('racketHeadHeight', hh, Math.min(1, RK.sc[ci] + 0.3) * 0.8 * blurF * (RK.ok[ci] === 1 ? 1 : 0.7), ci);
    // face: tilt of the head's long axis from vertical, seen nearly edge-on from a side-ish view
    const fr = []; for (let i = ci - 1; i <= ci + 1; i++) if (has(i) && Number.isFinite(RK.ang[i]) && RK.ratio[i] < 0.55) fr.push(i);
    if (!isServe && fr.length) {
      const vals = fr.map((i) => {
        const a = RK.ang[i] * Math.PI / 180; let tx = Math.cos(a), ty = Math.sin(a); if (ty > 0) { tx = -tx; ty = -ty; }
        const tilt = 90 - Math.abs(RK.ang[i]);
        return (tx * fsg > 0 ? -1 : 1) * tilt;
      });
      const v = vals.reduce((x, y) => x + y, 0) / vals.length;
      const r = fr.reduce((x, i) => x + RK.ratio[i], 0) / fr.length;
      const conf = Math.min(1, RK.sc[ci] + 0.25) * (side > 0.6 ? 0.9 : side > 0.4 ? 0.55 : 0.25) * (r < 0.4 ? 1 : 0.6) * blurF * 0.8;
      put('racketFace', v, conf, ci, { edgeRatio: r });
      RK.face[ci] = v;
    }
  }
  if (!isServe) {
    let maxY = -1, mi = -1; for (let i = b; i < c; i++) if (has(i) && RK.ay[i] > maxY) { maxY = RK.ay[i]; mi = i; }
    if (mi >= 0 && ci >= 0 && type !== 'volley') put('racketDrop', (maxY - RK.ay[ci]) / BHimg, 0.65 * cover(b, c) * blurF * Math.min(1, RK.sc[mi] + 0.2), mi);
    const p0 = near(idxAt(tr, T(c) - 0.08 * sf), 2), p1 = near(idxAt(tr, T(c) + 0.08 * sf), 2);
    if (p0 >= 0 && p1 >= 0 && p1 > p0) {
      const dx = Math.abs(RK.ax[p1] - RK.ax[p0]), dy = RK.ay[p0] - RK.ay[p1];
      if (Math.hypot(dx, dy) > 0.03 * BHimg) put('swingPath', Math.atan2(dy, Math.max(1e-4, dx)) * 180 / Math.PI, 0.8 * (side > 0.75 ? 1 : side > 0.5 ? 0.5 : 0.3) * cover(p0, p1) * blurF, ci >= 0 ? ci : c);
    }
    const li = near(idxAt(tr, T(c) - 0.06 * sf), 1);
    if (li >= 0 && type !== 'volley') {
      const e = W2(li, S.el), w = W2(li, S.wr); const f1 = [w[0] - e[0], w[1] - e[1]], s1 = [RK.ax[li] - w[0], RK.ay[li] - w[1]];
      const d = (f1[0] * s1[0] + f1[1] * s1[1]) / ((Math.hypot(f1[0], f1[1]) * Math.hypot(s1[0], s1[1])) || 1);
      put('racketLag', Math.acos(clamp(d, -1, 1)) * 180 / Math.PI, 0.6 * (side > 0.75 ? 1 : 0.45) * blurF, li);
    }
    const bi = near(b, 2);
    if (bi >= 0 && type !== 'volley') { const w = W2(bi, S.wr); put('takeBack', Math.atan2(w[1] - RK.ay[bi], Math.abs(RK.ax[bi] - w[0]) + 1e-4) * 180 / Math.PI, 0.65 * Math.min(1, RK.sc[bi] + 0.3), bi); }
    let fi = -1, best = 9; for (let i = c; i <= Math.min(hi, idxAt(tr, T(c) + 0.7 * sf)); i++) if (has(i) && RK.ay[i] < best) { best = RK.ay[i]; fi = i; }
    if (fi >= 0 && type !== 'volley') put('racketFinish', (W2(fi, S.sh)[1] - RK.ay[fi]) / BHimg, 0.5 * cover(c, fi) * Math.min(1, RK.sc[fi] + 0.2), fi);
  } else {
    let maxY = -1, mi = -1; for (let i = Math.max(lo, trophy); i < c; i++) if (has(i) && RK.ay[i] > maxY) { maxY = RK.ay[i]; mi = i; }
    if (mi >= 0) put('serveDrop', (maxY - W2(mi, S.sh)[1]) / BHimg, 0.7 * Math.min(1, RK.sc[mi] + 0.3) * blurF * cover(trophy, c), mi);
  }
}
