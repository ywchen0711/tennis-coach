// Tiny canvas line charts (crisp on retina, theme-aware) and the skeleton renderer.
export function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

export function fitCanvas(c, cssH) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const w = c.clientWidth || c.parentElement.clientWidth || 300, h = cssH || c.clientHeight || 160;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

// opts: {x0, x1, y0, y1, series:[{x,y,color,width,label}], markers:[{x,color,label}], cursor, bands:[{a,b,color}], yFmt}
export function lineChart(c, opts) {
  const { ctx, w, h } = fitCanvas(c);
  const pad = { l: 34, r: 8, t: 10, b: 20 };
  const X = (x) => pad.l + (x - opts.x0) / Math.max(1e-6, opts.x1 - opts.x0) * (w - pad.l - pad.r);
  const Y = (y) => pad.t + (1 - (y - opts.y0) / Math.max(1e-6, opts.y1 - opts.y0)) * (h - pad.t - pad.b);
  ctx.clearRect(0, 0, w, h);
  const line = cssVar('--line'), muted = cssVar('--muted');
  ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = muted; ctx.textBaseline = 'middle';
  for (const b of opts.bands || []) { ctx.fillStyle = b.color; ctx.fillRect(X(b.a), pad.t, Math.max(1, X(b.b) - X(b.a)), h - pad.t - pad.b); }
  // grid
  ctx.strokeStyle = line; ctx.lineWidth = 1;
  const ticks = opts.yTicks || niceTicks(opts.y0, opts.y1, 4);
  ctx.fillStyle = muted;
  for (const v of ticks) {
    const y = Y(v); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillText(opts.yFmt ? opts.yFmt(v) : String(v), pad.l - 5, y);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  for (const v of niceTicks(opts.x0, opts.x1, 5)) { ctx.fillText(opts.xFmt ? opts.xFmt(v) : v.toFixed(1), X(v), h - 5); }
  for (const m of opts.markers || []) {
    const x = X(m.x); ctx.strokeStyle = m.color; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b); ctx.stroke(); ctx.setLineDash([]);
    if (m.label) { ctx.fillStyle = m.color; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.fillText(m.label, x, pad.t + 9); ctx.font = '11px system-ui, sans-serif'; }
  }
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const s of opts.series) {
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2; ctx.beginPath();
    let started = false;
    for (let i = 0; i < s.x.length; i++) {
      const y = s.y[i]; if (!Number.isFinite(y)) { started = false; continue; }
      const px = X(s.x[i]), py = Y(Math.max(opts.y0, Math.min(opts.y1, y)));
      if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  if (Number.isFinite(opts.cursor) && opts.cursor >= opts.x0 && opts.cursor <= opts.x1) {
    ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1.5; const x = X(opts.cursor);
    ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b); ctx.stroke();
  }
  return { xToValue: (px) => opts.x0 + (px - pad.l) / (w - pad.l - pad.r) * (opts.x1 - opts.x0) };
}
function niceTicks(a, b, n) {
  const span = b - a; if (!(span > 0)) return [a];
  const raw = span / n, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  const out = []; for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

// --- skeleton ---
const BONES = [[11, 12], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32]];
const ARM_L = [[11, 13], [13, 15], [15, 19]], ARM_R = [[12, 14], [14, 16], [16, 20]];
// pose: Float32Array 99 (x,y normalized 0..1, vis); rect: {x,y,w,h} of the video picture
export function drawSkeleton(ctx, pose, rect, hand = 'R', o = {}) {
  if (!pose) return;
  const P = (k) => [rect.x + pose[k * 3] * rect.w, rect.y + pose[k * 3 + 1] * rect.h];
  const lw = o.lineWidth || Math.max(2, rect.h / 140);
  const dom = hand === 'L' ? ARM_L : ARM_R, off = hand === 'L' ? ARM_R : ARM_L;
  ctx.save(); ctx.globalAlpha = o.alpha ?? 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const seg = (list, color, width) => {
    ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = width + 2.5; ctx.beginPath();
    for (const [a, b] of list) { const p = P(a), q = P(b); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); } ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
    for (const [a, b] of list) { const p = P(a), q = P(b); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); } ctx.stroke();
  };
  seg(BONES, o.body || '#ffffff', lw);
  seg(off, o.off || '#7cc4ff', lw);
  seg(dom, o.dom || '#d9f24a', lw * 1.25);
  // head
  const n = P(0), e1 = P(7), e2 = P(8);
  const r = Math.max(lw * 2, Math.hypot(e1[0] - e2[0], e1[1] - e2[1]) * 0.75);
  ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = lw + 2.5; ctx.beginPath(); ctx.arc(n[0], n[1], r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = o.body || '#ffffff'; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(n[0], n[1], r, 0, Math.PI * 2); ctx.stroke();
  // joints
  for (const k of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    const p = P(k); ctx.fillStyle = (hand === 'L' ? [11, 13, 15] : [12, 14, 16]).includes(k) ? (o.dom || '#d9f24a') : '#ffffff';
    ctx.beginPath(); ctx.arc(p[0], p[1], lw * 0.9, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
export function drawTrail(ctx, pts, rect, color = '#d9f24a') {
  if (pts.length < 2) return;
  ctx.save(); ctx.lineCap = 'round';
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    ctx.strokeStyle = color; ctx.globalAlpha = 0.15 + 0.75 * i / pts.length; ctx.lineWidth = 2 + 3 * i / pts.length;
    ctx.beginPath(); ctx.moveTo(rect.x + a[0] * rect.w, rect.y + a[1] * rect.h); ctx.lineTo(rect.x + b[0] * rect.w, rect.y + b[1] * rect.h); ctx.stroke();
  }
  ctx.restore();
}
