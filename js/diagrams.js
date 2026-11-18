// Correction diagrams: for each metric, a small SVG showing the player's value against the
// ideal zone with an arrow for the fix, plus an overlay drawn on the player's own video frame.
// Drawn for a right-hander and mirrored for left-handers. Colours default to CSS variables
// (light/dark); the summary image passes literal colours.
import { rangeFor } from './analysis.js?v=5';
import { fmtValue, fmtRange } from './coach.js?v=5';

const CSS = { ink: 'var(--text)', muted: 'var(--muted)', line: 'var(--line)', soft: 'var(--surface2)', ideal: 'var(--good)', you: 'var(--bad)', net: 'var(--info)', bg: 'var(--surface)' };
export const LIGHT = { ink: '#13201a', muted: '#5a6a61', line: '#cfd8cc', soft: '#eef3ec', ideal: '#1f8a4c', you: '#c2412d', net: '#2563eb', bg: '#ffffff' };
export const DARK = { ink: '#e6efe9', muted: '#93a69b', line: '#33463c', soft: '#1b2923', ideal: '#46c27c', you: '#ef6b57', net: '#60a5fa', bg: '#141f1a' };

const TX = {
  you: ['你', 'You'], ideal: ['理想', 'Ideal'], zone: ['理想區', 'Ideal zone'], net: ['球網方向', 'Net'], contactZone: ['理想擊球點', 'Ideal contact'],
  waist: ['腰', 'Waist'], chest: ['胸', 'Chest'], shoulder: ['肩', 'Shoulder'], hip: ['髖', 'Hip'], knee: ['膝', 'Knee'], ready: ['準備時', 'At ready'],
  shoulders: ['肩線', 'Shoulders'], hips: ['髖線', 'Hips'], target: ['目標', 'Target'], hips2: ['髖', 'Hips'], sh2: ['肩', 'Shoulders'], elbow: ['肘', 'Elbow'], wrist: ['腕', 'Wrist'],
  contact: ['擊球', 'Contact'], before: ['擊球前（毫秒）', 'ms before contact'], order: ['理想順序', 'Ideal order'], head: ['頭部移動', 'Head movement'], ok: ['可接受', 'OK'],
  upright: ['直立', 'Upright'], finish: ['收拍位置', 'Finish here'], feet: ['雙腳', 'Feet'], reach: ['完全伸展', 'Full reach'], toss: ['拋球手', 'Toss arm'],
  oneOclock: ['1 點鐘方向', '1 o\'clock'], lowAngle: ['此角度僅供參考', 'Rough from this angle'], from: ['由此', 'from'], front: ['前', 'front'], back: ['後', 'back'],
};
const tx = (k, lang) => (TX[k] ? TX[k][lang === 'zh' ? 0 : 1] : k);
const r1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function ctxFor(W, H, hand, P, lang) {
  const L = hand === 'L';
  const X = (x) => (L ? W - x : x);
  const anc = (a) => (!L ? a : a === 'start' ? 'end' : a === 'end' ? 'start' : a);
  const o = [];
  const api = {
    W, H, X, P, lang, o, L,
    line: (x1, y1, x2, y2, c, w = 2, dash = '', extra = '') => o.push(`<line x1="${r1(X(x1))}" y1="${r1(y1)}" x2="${r1(X(x2))}" y2="${r1(y2)}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''} ${extra}/>`),
    poly: (pts, c, w = 2, fill = 'none', dash = '', op = 1) => o.push(`<polyline points="${pts.map(([x, y]) => `${r1(X(x))},${r1(y)}`).join(' ')}" fill="${fill}" stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''} opacity="${op}"/>`),
    circle: (x, y, r, stroke, fill = 'none', w = 2, dash = '', op = 1) => o.push(`<circle cx="${r1(X(x))}" cy="${r1(y)}" r="${r1(r)}" stroke="${stroke}" fill="${fill}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''} opacity="${op}"/>`),
    rect: (x, y, w, h, fill, stroke = 'none', rx = 6, op = 1, dash = '') => { const xx = L ? W - x - w : x; o.push(`<rect x="${r1(xx)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" opacity="${op}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`); },
    path: (d, stroke, fill = 'none', w = 2, dash = '', op = 1) => o.push(`<path d="${d}" stroke="${stroke}" fill="${fill}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''} opacity="${op}" stroke-linejoin="round" stroke-linecap="round"/>`),
    text: (x, y, s, c, size = 12, a = 'middle', weight = 600) => o.push(`<text x="${r1(X(x))}" y="${r1(y)}" fill="${c}" font-size="${size}" font-weight="${weight}" text-anchor="${anc(a)}" font-family="-apple-system,'PingFang TC','Noto Sans TC','Microsoft JhengHei','Segoe UI',sans-serif">${esc(s)}</text>`),
    arrow: (x1, y1, x2, y2, c, w = 2.5) => {
      const d = Math.hypot(x2 - x1, y2 - y1); if (d < 6) return;
      const ux = (x2 - x1) / d, uy = (y2 - y1) / d;
      const bx = x2 - ux * 8, by = y2 - uy * 8;
      o.push(`<line x1="${r1(X(x1))}" y1="${r1(y1)}" x2="${r1(X(bx))}" y2="${r1(by)}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`);
      const p = [[x2, y2], [bx - uy * 5, by + ux * 5], [bx + uy * 5, by - ux * 5]];
      o.push(`<polygon points="${p.map(([x, y]) => `${r1(X(x))},${r1(y)}`).join(' ')}" fill="${c}"/>`);
    },
    // arc / sector in screen angles (deg, 0 = +x, clockwise positive since y is down); mirrored for lefties
    sector: (cx, cy, r, a0, a1, fill, op = 0.2) => {
      const f = (a) => { const t = a * Math.PI / 180; return [X(cx + r * Math.cos(t)), cy + r * Math.sin(t)]; };
      const [x0, y0] = f(a0), [x1, y1] = f(a1); const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
      const sweep = (a1 > a0) !== L ? 1 : 0;
      o.push(`<path d="M${r1(X(cx))},${r1(cy)} L${r1(x0)},${r1(y0)} A${r} ${r} 0 ${large} ${sweep} ${r1(x1)},${r1(y1)} Z" fill="${fill}" opacity="${op}"/>`);
    },
    arc: (cx, cy, r, a0, a1, c, w = 2, arrowEnd = false) => {
      const f = (a) => { const t = a * Math.PI / 180; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; };
      const n = 24, pts = []; for (let i = 0; i <= n; i++) pts.push(f(a0 + (a1 - a0) * i / n));
      api.poly(pts, c, w);
      if (arrowEnd && Math.abs(a1 - a0) > 6) { const a = pts[n - 2], b = pts[n]; api.arrow(a[0], a[1], b[0], b[1], c, w); }
    },
  };
  return api;
}
function wrapSvg(g, title) {
  return `<svg class="dg" viewBox="0 0 ${g.W} ${g.H}" role="img" aria-label="${esc(title || '')}" xmlns="http://www.w3.org/2000/svg">${g.o.join('')}</svg>`;
}
function legend(g, good) {
  const { P, lang } = g;
  const y = g.H - 8;
  g.o.push(`<rect x="8" y="${y - 9}" width="12" height="10" rx="2" fill="${P.ideal}" opacity=".25" stroke="${P.ideal}"/>`);
  g.o.push(`<text x="24" y="${y}" fill="${P.muted}" font-size="11" font-weight="600" font-family="sans-serif">${esc(tx('ideal', lang))}</text>`);
  g.o.push(`<circle cx="${lang === 'zh' ? 62 : 70}" cy="${y - 4}" r="5" fill="${good ? P.ideal : P.you}"/>`);
  g.o.push(`<text x="${lang === 'zh' ? 71 : 79}" y="${y}" fill="${P.muted}" font-size="11" font-weight="600" font-family="sans-serif">${esc(tx('you', lang))}${good ? ' ✓' : ''}</text>`);
}

function header(g, youText, idealText, good) {
  const { P, lang } = g;
  const a = `${tx('you', lang)} ${youText}`, b = `${tx('ideal', lang)} ${idealText}`;
  g.o.push(`<text x="${g.W / 2}" y="16" text-anchor="middle" font-size="12" font-weight="700" font-family="-apple-system,'PingFang TC','Noto Sans TC','Segoe UI',sans-serif"><tspan fill="${good ? P.ideal : P.you}">${esc(a)}</tspan><tspan fill="${P.muted}">  →  </tspan><tspan fill="${P.ideal}">${esc(b)}</tspan></text>`);
}
export function skeletonSvg(pose, aspect) { return overlaySvg({ key: '_none', v: 0 }, 'forehand', { pose, aspect, F: null, BHimg: 0.7 }); }
const NO_MIRROR = new Set(['legDrive', 'offArm', 'compact', 'recovery', 'wristSpeed', 'chain', 'headStable']);

// ---------- body pictograms ----------
function sideFigure(g, x, ground, h, c, w = 3, op = 1, lean = 0, kneeFlex = 15) {
  // side view facing +x; returns key points
  const hipY = ground - h * 0.53, shY = ground - h * 0.82, headY = ground - h * 0.93;
  const t = lean * Math.PI / 180;
  const hip = [x, hipY], sh = [x + Math.sin(t) * (hipY - shY), hipY - Math.cos(t) * (hipY - shY)];
  const head = [x + Math.sin(t) * (hipY - headY), hipY - Math.cos(t) * (hipY - headY)];
  const L = (ground - hipY) / 2 / Math.cos(kneeFlex / 2 * Math.PI / 180) * 0.98;
  const kneeA = (kneeFlex / 2) * Math.PI / 180;
  const knee = [x + Math.sin(kneeA) * L, hipY + Math.cos(kneeA) * L];
  const ankle = [x, ground];
  g.poly([hip, knee, ankle], c, w, 'none', '', op); g.poly([ankle, [ankle[0] + h * 0.07, ground]], c, w, 'none', '', op);
  g.poly([hip, sh], c, w, 'none', '', op); g.circle(head[0], head[1], h * 0.06, c, 'none', w * 0.8, '', op);
  return { hip, sh, head, knee, ankle, hipY, shY };
}
function backFigure(g, cx, ground, h, c, w = 3, op = 1) {
  // seen from behind: the player's right is on screen right
  const hipY = ground - h * 0.53, shY = ground - h * 0.82, headY = ground - h * 0.92;
  const sw = h * 0.13, hw = h * 0.08;
  g.line(cx - sw, shY, cx + sw, shY, c, w); g.line(cx - hw, hipY, cx + hw, hipY, c, w);
  g.line(cx, shY, cx, hipY, c, w);
  g.poly([[cx - hw, hipY], [cx - hw * 1.6, ground]], c, w); g.poly([[cx + hw, hipY], [cx + hw * 1.6, ground]], c, w);
  g.circle(cx, headY, h * 0.06, c, 'none', w * 0.8);
  return { shY, hipY, headY, lSh: [cx - sw, shY], rSh: [cx + sw, shY], lHip: [cx - hw, hipY], rHip: [cx + hw, hipY], headR: h * 0.06 };
}

// ---------- individual diagrams ----------
const D = {};
D.contactFront = (g, m, type, good) => {
  const { P, lang } = g; const s = 230, cx = 150, cy = 166;
  const you = good ? P.ideal : P.you;
  g.line(14, 22, g.W - 14, 22, P.net, 2, '6 5'); g.text(g.W / 2, 16, tx('net', lang) + ' ↑', P.net, 11);
  const r = rangeFor(type, 'contactFront') || [0.1, 0.5];
  const latC = type === 'backhand1' ? -0.2 : type === 'backhand2' ? -0.14 : type === 'volley' ? (Number.isFinite(m.lat) && m.lat < 0 ? -0.18 : 0.2) : 0.24;
  const zx0 = cx + (latC - 0.13) * s, zw = 0.26 * s, zy0 = Math.max(40, cy - Math.min(r[1], 0.7) * s), zh = cy - r[0] * s - zy0;
  g.rect(zx0, zy0, zw, zh, P.ideal, P.ideal, 8, 0.22); g.rect(zx0, zy0, zw, zh, 'none', P.ideal, 8, 1, '5 4');
  g.text(zx0 + zw / 2, zy0 + 14, tx('contactZone', lang), P.ideal, 11);
  // body from above: feet, hips, shoulders, head
  g.rect(cx - 34, cy + 10, 14, 22, P.soft, P.muted, 6); g.rect(cx + 20, cy + 4, 14, 22, P.soft, P.muted, 6);
  g.line(cx - 22, cy + 4, cx + 22, cy + 4, P.muted, 4); g.line(cx - 36, cy - 2, cx + 36, cy - 2, P.ink, 4); g.circle(cx, cy - 2, 11, P.ink, P.bg, 2.5);
  const lat = Number.isFinite(m.lat) ? m.lat : latC;
  const px = clamp(cx + lat * s, 12, g.W - 12), py = clamp(cy - m.v * s, 30, cy + 30);
  const tx0 = clamp(px, zx0 + 10, zx0 + zw - 10), ty0 = clamp(py, zy0 + 20, zy0 + zh - 8);
  if (!good) g.arrow(px, py, tx0, ty0, you);
  g.circle(px, py, 7, '#fff', you, 2);
  g.text(px + (px > cx ? 12 : -12), py + 4, tx('you', lang), you, 11, px > cx ? 'start' : 'end');
};
D.contactHeight = (g, m, type, good) => {
  const { P, lang } = g; const you = good ? P.ideal : P.you;
  const f = sideFigure(g, 80, 182, 160, P.ink, 3, 0.9);
  const lv = (v) => f.hipY - v * (f.hipY - f.shY);
  const r = rangeFor(type, 'contactHeight') || [0.05, 1.05];
  const y0 = lv(Math.min(r[1], 1.25)), y1 = lv(Math.max(r[0], -0.4));
  g.rect(140, y0, 110, y1 - y0, P.ideal, P.ideal, 8, 0.2); g.rect(140, y0, 110, y1 - y0, 'none', P.ideal, 8, 1, '5 4');
  g.text(195, y0 + 14, tx('zone', lang), P.ideal, 11);
  for (const [k, v] of [['shoulder', 1], ['hip', 0]]) { g.line(140, lv(v), 262, lv(v), P.line, 1, '3 3'); g.text(136, lv(v) + 4, tx(k, lang), P.muted, 10, 'end'); }
  const py = clamp(lv(m.v), 14, 178);
  const ty = clamp(py, y0 + 18, y1 - 6);
  g.line(f.sh[0], f.sh[1], 200, py, P.muted, 2.5);
  if (!good) g.arrow(214, py, 214, ty, you);
  g.circle(200, py, 7, '#fff', you, 2);
  g.text(186, py + 4, tx('you', lang), you, 11, 'end');
};
D.contactReach = (g, m, type, good) => {
  const { P, lang } = g; const you = good ? P.ideal : P.you;
  const H = 150, ground = 186; const f = sideFigure(g, 120, ground, H, P.ink, 3, 0.9);
  const noseY = f.head[1];
  const r = rangeFor(type, 'contactReach') || [0.18, 0.7];
  const zy1 = noseY - r[0] * H, zy0 = Math.max(6, noseY - 0.42 * H);
  g.rect(f.head[0] + 6, zy0, 54, zy1 - zy0, P.ideal, P.ideal, 8, 0.22); g.rect(f.head[0] + 6, zy0, 54, zy1 - zy0, 'none', P.ideal, 8, 1, '5 4');
  g.text(f.head[0] + 66, zy0 + 12, tx('reach', lang), P.ideal, 11, 'start'); g.text(f.head[0] + 66, zy0 + 26, tx('oneOclock', lang), P.ideal, 10, 'start');
  const py = clamp(noseY - m.v * H, 8, ground - 20);
  const px = f.head[0] + 22;
  g.line(f.sh[0], f.sh[1], px, py, P.muted, 2.5);
  if (!good) g.arrow(px + 16, py, px + 16, clamp(py, zy0 + 8, zy1 - 4), you);
  g.circle(px, py, 7, '#fff', you, 2);
  g.text(px - 12, py + 4, tx('you', lang), you, 11, 'end');
};
function turnDiagram(g, m, type, good, key) {
  const { P, lang } = g; const you = good ? P.ideal : P.you;
  const cx = 150, cy = 112, R = 66;
  g.line(14, 32, g.W - 14, 32, P.net, 2, '6 5'); g.text(g.W - 16, 44, tx('net', lang) + ' ↑', P.net, 10, 'end');
  g.circle(cx, cy, R, P.line, 'none', 1, '3 4');
  const sgn = type.startsWith('backhand') ? -1 : 1; // forehand: shoulders turn clockwise seen from above
  const r = rangeFor(type, key) || [70, 120];
  const base = key === 'separation' ? 40 * sgn : 0; // hips drawn already turned for separation
  const a0 = base + sgn * r[0], a1 = base + sgn * Math.min(r[1], 150);
  // ideal sector on both ends of the shoulder line
  g.sector(cx, cy, R, Math.min(a0, a1), Math.max(a0, a1), P.ideal, 0.22); g.sector(cx, cy, R, Math.min(a0, a1) + 180, Math.max(a0, a1) + 180, P.ideal, 0.22);
  const L = (a, len, c, w, dash = '') => { const t = a * Math.PI / 180; g.line(cx - Math.cos(t) * len, cy - Math.sin(t) * len, cx + Math.cos(t) * len, cy + Math.sin(t) * len, c, w, dash); };
  if (key === 'separation') { L(base, 46, P.muted, 5); g.text(cx + Math.cos(base * Math.PI / 180) * 60, cy + Math.sin(base * Math.PI / 180) * 60 + 14, tx('hips', lang), P.muted, 10); }
  else { L(0, R, P.line, 1.5, '4 4'); g.text(cx - R + 4, cy - 6, tx('ready', lang), P.muted, 10, 'start'); }
  const mid = (a0 + a1) / 2;
  L(mid, R - 6, P.ideal, 2, '5 4');
  const av = base + sgn * clamp(m.v, 0, 170);
  L(av, R - 4, you, 5);
  const tt = av * Math.PI / 180; g.circle(cx + Math.cos(tt) * (R - 4), cy + Math.sin(tt) * (R - 4), 5, '#fff', you, 1.5);
  g.circle(cx, cy, 10, P.ink, P.bg, 2.5);
  { const lo = Math.min(a0, a1), hi = Math.max(a0, a1); const tgt = av < lo ? lo + 4 : av > hi ? hi - 4 : null; if (!good && tgt !== null) g.arc(cx, cy, R + 10, av, tgt, you, 2.5, true); }
  header(g, `${Math.round(m.v)}°`, `${Math.round(r[0])}–${Math.round(Math.min(r[1], 150))}°`, good);
}
D.unitTurn = (g, m, type, good) => turnDiagram(g, m, type, good, 'unitTurn');
D.separation = (g, m, type, good) => turnDiagram(g, m, type, good, 'separation');
function legDiagram(g, flexYou, flexIdeal, label, good) {
  const { P, lang } = g; const you = good ? P.ideal : P.you;
  const ground = 182, Lg = 44;
  const leg = (flex, x, c, dash, op) => {
    const th = (180 - flex) * Math.PI / 180; const d = 2 * Lg * Math.sin(th / 2);
    const hip = [x, ground - d], knee = [x + Lg * Math.cos(th / 2), ground - d / 2], ank = [x, ground];
    g.poly([[hip[0] - 5, hip[1] - 44], hip, knee, ank, [ank[0] + 14, ground]], c, 4, 'none', dash, op);
    g.circle(hip[0] - 7, hip[1] - 55, 9, c, 'none', 3, dash, op);
    return { hip, knee };
  };
  g.line(20, ground + 2, g.W - 20, ground + 2, P.line, 2);
  const a = leg(flexIdeal, 200, P.ideal, '6 4', 0.9);
  const b = leg(flexYou, 110, you, '', 1);
  header(g, `${Math.round(flexYou)}°`, label, good);
  if (!good) g.arrow(b.hip[0] + 8, b.hip[1] - 30, a.hip[0] - 18, a.hip[1] - 30, you, 2);
}
D.kneeBend = (g, m, type, good) => { const r = rangeFor(type, 'kneeBend') || [25, 60]; legDiagram(g, clamp(m.v, 0, 110), (r[0] + r[1]) / 2, `${r[0]}–${r[1]}°`, good); };
function armDiagram(g, angYou, angIdeal, label, good, up = false, valueText = null) {
  const { P, lang } = g; const you = good ? P.ideal : P.you;
  const sh = [70, up ? 128 : 112], La = 72;
  const el = [sh[0] + La, sh[1]];
  const fore = (ang) => { const bend = (180 - ang) * Math.PI / 180; return [el[0] + Math.cos(-bend) * La, el[1] + Math.sin(-bend) * La]; };
  g.circle(sh[0] - 8, sh[1] - 42, 14, P.muted, 'none', 3); g.line(sh[0] - 8, sh[1] - 26, sh[0] - 8, sh[1] + 60, P.muted, 4);
  const wi = fore(angIdeal), wy = fore(angYou);
  g.poly([sh, el, wi], P.ideal, 4, 'none', '6 4', 0.9);
  g.poly([sh, el, wy], you, 5);
  g.circle(sh[0], sh[1], 5, P.ink, P.ink); g.circle(el[0], el[1], 5, P.ink, P.ink); g.circle(wy[0], wy[1], 6, '#fff', you, 2);
  header(g, valueText ?? `${Math.round(angYou)}°`, label, good);
  g.text(el[0], el[1] + 20, tx('elbow', lang), P.muted, 10);
  if (!good) { const d0 = Math.atan2(wy[1] - el[1], wy[0] - el[0]) * 180 / Math.PI, d1 = Math.atan2(wi[1] - el[1], wi[0] - el[0]) * 180 / Math.PI; g.arc(el[0], el[1], 36, d0, d1, you, 2.5, true); }
}
D.elbowAngle = (g, m, type, good) => { const r = rangeFor(type, 'elbowAngle') || [100, 170]; armDiagram(g, m.v, (r[0] + r[1]) / 2, `${r[0]}–${r[1]}°`, good); };
D.trophyElbow = (g, m, type, good) => { const r = rangeFor(type, 'trophyElbow') || [70, 115]; armDiagram(g, m.v, (r[0] + r[1]) / 2, `${r[0]}–${r[1]}°`, good, true); };
D.extension = (g, m, type, good) => {
  const r = rangeFor(type, 'extension') || [0.8, 1.05];
  const toAng = (x) => 2 * Math.asin(clamp(x, 0.2, 1)) * 180 / Math.PI;
  armDiagram(g, toAng(m.v), toAng(Math.min(1, (r[0] + 1) / 2)), `≥ ${Math.round(r[0] * 100)}%`, good, false, `${Math.round(m.v * 100)}%`);
};
D.trunkLean = (g, m, type, good) => {
  const { P, lang } = g; const you = good ? P.ideal : P.you;
  const r = rangeFor(type, 'trunkLean') || [0, 22];
  const hip = [150, 156], Lt = 92;
  g.sector(hip[0], hip[1], Lt + 8, -90 - r[1], -90 + r[1], P.ideal, 0.2);
  g.line(hip[0], hip[1], hip[0], hip[1] - Lt, P.ideal, 3, '6 4'); g.text(hip[0] - 40, hip[1] - Lt + 6, tx('upright', lang), P.ideal, 11, 'end');
  const t = (-90 + clamp(m.v, 0, 80)) * Math.PI / 180;
  const top = [hip[0] + Math.cos(t) * Lt, hip[1] + Math.sin(t) * Lt];
  g.line(hip[0], hip[1], top[0], top[1], you, 5); g.circle(top[0] + Math.cos(t) * 14, top[1] + Math.sin(t) * 14, 12, you, 'none', 3);
  g.poly([[hip[0], hip[1]], [hip[0] - 20, 186], [hip[0] - 24, 188]], P.muted, 4); g.poly([[hip[0], hip[1]], [hip[0] + 22, 186], [hip[0] + 30, 188]], P.muted, 4);
  header(g, `${Math.round(m.v)}°`, `≤ ${r[1]}°`, good);
  if (!good) g.arc(hip[0], hip[1], 60, -90 + clamp(m.v, 0, 80), -90 + r[1] * 0.5, you, 2.5, true);
};
D.headStable = (g, m, type, good) => {
  const { P, lang } = g; const you = good ? P.ideal : P.you;
  const r = rangeFor(type, 'headStable') || [0, 0.07];
  const s = 500, cx = 150, cy = 106;
  g.circle(cx, cy, r[1] * s, P.ideal, P.ideal, 2, '5 4', 0.25); g.circle(cx, cy, r[1] * s, P.ideal, 'none', 2, '5 4');

  const rv = clamp(m.v * s, 6, 72);
  g.circle(cx, cy, rv, you, 'none', 2.5);
  g.circle(cx, cy, 14, P.ink, P.bg, 3);
  if (!good) g.arrow(cx + rv * 0.7, cy + rv * 0.7, cx + r[1] * s * 0.75, cy + r[1] * s * 0.75, you);
  header(g, `${tx('head', lang)} ${Math.round(m.v * 100)}%`, `≤ ${Math.round(r[1] * 100)}%`, good);
};
D.baseWidth = (g, m, type, good) => {
  const { P, lang } = g; const you = good ? P.ideal : P.you;
  const r = rangeFor(type, 'baseWidth') || [1.2, 2.5]; const u = 34, cx = 150, cy = 110;
  g.line(cx - u / 2 * 2, 52, cx + u / 2 * 2, 52, P.ink, 4); g.text(cx, 42, tx('shoulders', lang), P.muted, 10);
  for (const sgn of [-1, 1]) {
    const a = cx + sgn * r[0] * u, b = cx + sgn * Math.min(r[1], 2.8) * u;
    g.rect(Math.min(a, b) - 8, cy - 6, Math.abs(b - a) + 16, 54, P.ideal, P.ideal, 8, 0.2);
    const fx = cx + sgn * clamp(m.v, 0.2, 3.5) * u;
    g.rect(fx - 8, cy, 16, 40, you, you, 6, 0.9);
    if (!good) g.arrow(fx, cy + 50, cx + sgn * ((r[0] + Math.min(r[1], 2.8)) / 2) * u, cy + 50, you, 2);
  }
  g.text(cx, cy + 74, `${tx('feet', lang)} ${m.v.toFixed(1)}×`, you, 11);
};
D.finish = (g, m, type, good) => {
  const { P, lang } = g; const you = good ? P.ideal : P.you;
  const cx = 150, ground = 186, H = 160; const f = backFigure(g, cx, ground, H, P.ink, 3);
  const u = H; // body-height units in px
  const shY = f.shY, hipY = f.hipY;
  const lv = (h) => hipY - h * (hipY - shY);
  let zx, zy, zr = 22;
  if (type === 'forehand') { zx = f.lSh[0] - 8; zy = shY - 16; }
  else if (type === 'backhand1') { zx = f.rSh[0] + 26; zy = shY - 44; }
  else if (type === 'backhand2') { zx = f.rSh[0] + 10; zy = shY - 22; }
  else if (type === 'volley') { zx = f.rSh[0] + 12; zy = lv(0.75); }
  else { zx = f.lHip[0] - 12; zy = hipY + 6; }
  g.circle(zx, zy, zr, P.ideal, P.ideal, 2, '5 4', 0.25); g.circle(zx, zy, zr, P.ideal, 'none', 2, '5 4');
  g.text(zx, zy - zr - 6, tx('finish', lang), P.ideal, 11);
  const fh = Number.isFinite(m.finishHeight) ? m.finishHeight : 0.5, fl = Number.isFinite(m.finishLat) ? m.finishLat : 0;
  const px = clamp(cx + fl * u, 14, g.W - 14), py = clamp(lv(fh), 12, ground - 10);
  g.line(f.rSh[0], f.rSh[1], px, py, P.muted, 2.5);
  if (!good) g.arrow(px, py, zx + (px - zx) * 0.3, zy + (py - zy) * 0.3, you);
  g.circle(px, py, 7, '#fff', you, 2);
  g.text(px + (px >= cx ? 12 : -12), py + 4, tx('you', lang), you, 11, px >= cx ? 'start' : 'end');
};
D.tossArm = (g, m, type, good) => {
  const { P, lang } = g; const you = good ? P.ideal : P.you;
  const cx = 170, ground = 188, H = 118; const f = backFigure(g, cx, ground, H, P.ink, 3);
  const headY = f.headY; const r = rangeFor(type, 'tossArm') || [0.15, 0.7];
  const zy1 = headY - r[0] * H, zy0 = Math.max(6, headY - 0.5 * H);
  g.rect(f.lSh[0] - 26, zy0, 40, zy1 - zy0, P.ideal, P.ideal, 8, 0.22); g.rect(f.lSh[0] - 26, zy0, 40, zy1 - zy0, 'none', P.ideal, 8, 1, '5 4');
  
  const py = clamp(headY - m.v * H, 8, ground - 30), px = f.lSh[0] - 6;
  g.line(f.lSh[0], f.lSh[1], px, py, you, 4);
  if (!good) g.arrow(px - 34, py, px - 34, clamp(py, zy0 + 6, zy1 - 4), you);
  g.circle(px, py, 6, '#fff', you, 2);
  header(g, `${Math.round(m.v * 100)}%`, `≥ ${Math.round(r[0] * 100)}%`, good);
};
D.trophyElbowHeight = (g, m, type, good) => {
  const { P, lang } = g; const you = good ? P.ideal : P.you;
  const cx = 130, ground = 188, H = 140; const f = backFigure(g, cx, ground, H, P.ink, 3);
  const r = rangeFor(type, 'trophyElbowHeight') || [-0.07, 0.1];
  const y0 = f.shY - r[1] * H, y1 = f.shY - r[0] * H;
  g.rect(f.rSh[0] + 18, y0, 90, y1 - y0, P.ideal, P.ideal, 6, 0.22);
  g.line(f.rSh[0], f.shY, f.rSh[0] + 110, f.shY, P.line, 1, '3 3');
  const ey = clamp(f.shY - m.v * H, 20, ground - 20), ex = f.rSh[0] + 56;
  g.poly([f.rSh, [ex, ey], [ex + 6, ey - 50]], you, 4);
  g.circle(ex, ey, 6, '#fff', you, 2);
  header(g, `${Math.round(m.v * 100)}%`, `${Math.round(r[0] * 100)}–${Math.round(r[1] * 100)}%`, good);
  if (!good) g.arrow(ex + 30, ey, ex + 30, clamp(ey, y0 + 2, y1 - 2), you);
};
D.chain = (g, m, type, good) => {
  const { P, lang } = g; const you = good ? P.ideal : P.you;
  const times = m.times || [-0.15, -0.1, -0.05, 0];
  const t0 = -0.32, t1 = 0.06, X0 = 72, X1 = g.W - 16;
  const X = (t) => X0 + (clamp(t, t0, t1) - t0) / (t1 - t0) * (X1 - X0);
  const rows = ['hips2', 'sh2', 'elbow', 'wrist'], y = (i) => 34 + i * 34;
  const ideal = [-0.16, -0.11, -0.06, 0];
  g.line(X(0), 18, X(0), y(3) + 16, P.muted, 1.5, '4 3'); g.text(X(0), 14, tx('contact', lang), P.muted, 10);
  rows.forEach((k, i) => { g.line(X0, y(i), X1, y(i), P.line, 1); g.text(X0 - 8, y(i) + 4, tx(k, lang), P.ink, 11, 'end'); });
  g.poly(ideal.map((t, i) => [X(t), y(i)]), P.ideal, 2, 'none', '5 4'); ideal.forEach((t, i) => g.circle(X(t), y(i), 6, P.ideal, P.bg, 2));
  const pts = times.map((t, i) => [X(t), y(i)]);
  for (let i = 0; i < 3; i++) g.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], times[i] <= times[i + 1] + 0.01 ? (good ? P.ideal : P.ink) : P.you, 2.5);
  pts.forEach(([x, yy]) => g.circle(x, yy, 6, '#fff', you, 2));
  g.text(X1, y(3) + 24, `${tx('order', lang)}: ${tx('hips2', lang)} → ${tx('sh2', lang)} → ${tx('elbow', lang)} → ${tx('wrist', lang)}`, P.ideal, 10, 'end');
};
function gauge(g, m, type, good, key) {
  const { P, lang } = g; const you = good ? P.ideal : P.you;
  const r = rangeFor(type, key) || [0, 1, 0.5];
  const hi = r[1] >= 1.5 ? r[0] + r[2] * 2 : r[1];
  const lo0 = Math.min(r[0], m.v) - r[2] * 0.6, hi0 = Math.max(hi, m.v) + r[2] * 0.6;
  const X0 = 30, X1 = g.W - 30, Y = 96;
  const X = (v) => X0 + (v - lo0) / (hi0 - lo0) * (X1 - X0);
  g.rect(X0, Y - 8, X1 - X0, 16, P.soft, P.line, 8);
  g.rect(X(r[0]), Y - 12, Math.max(4, X(r[1] >= 1.5 ? hi0 : hi) - X(r[0])), 24, P.ideal, P.ideal, 8, 0.3);
  g.text((X(r[0]) + X(r[1] >= 1.5 ? hi0 : hi)) / 2, Y - 22, tx('zone', lang), P.ideal, 11);
  const px = X(m.v);
  g.o.push(`<polygon points="${[[px, Y + 14], [px - 7, Y + 26], [px + 7, Y + 26]].map(([x, y]) => `${r1(g.X(x))},${y}`).join(' ')}" fill="${you}"/>`);
  g.line(px, Y - 14, px, Y + 14, you, 3);
  g.text(px, Y + 44, tx('you', lang), you, 11);
  const unitOv = m.unitOverride || (m.unit === 'pctBH' ? 'pctBH' : undefined);
  header(g, fmtValue({ ...m, unit: m.unitOverride || m.unit || (key === 'offArm' ? 'pct' : key === 'wristSpeed' ? 'speed' : 'pctBH') }, lang, type), fmtRange(key, type, lang, unitOv), good);
  if (!good) { const tgt = m.v < r[0] ? X(r[0]) + 10 : X(hi) - 10; g.arrow(px, Y - 30, tgt, Y - 30, you); }
}
for (const k of ['legDrive', 'offArm', 'compact', 'recovery', 'wristSpeed']) D[k] = (g, m, type, good) => gauge(g, m, type, good, k);


// ---------- racket diagrams ----------
const RK_COL = '#0891b2';
function racketShape(g, x, y, ang, len, c, w = 3, dash = '', op = 1) {
  // racket from the hand (x,y) along screen angle ang (deg, 0 = +x, y down); head oval at the far end
  const t = ang * Math.PI / 180, ux = Math.cos(t), uy = Math.sin(t);
  const nx = x + ux * len * 0.45, ny = y + uy * len * 0.45, hx = x + ux * len * 0.72, hy = y + uy * len * 0.72;
  g.line(x, y, nx, ny, c, w, dash);
  const rx = len * 0.28, ry = len * 0.19;
  const X = g.X(hx); const a = g.L ? 180 - ang : ang;
  g.o.push(`<ellipse cx="${r1(X)}" cy="${r1(hy)}" rx="${r1(rx)}" ry="${r1(ry)}" transform="rotate(${r1(a)} ${r1(X)} ${r1(hy)})" fill="none" stroke="${c}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''} opacity="${op}"/>`);
  return [hx, hy];
}
D.racketFace = (g, m, type, good) => {
  const { P, lang } = g; const you = good ? P.ideal : P.you;
  const r = rangeFor(type, 'racketFace') || [-15, 8];
  const cx = 150, cy = 110, L = 70;
  g.line(20, 182, g.W - 20, 182, P.line, 2); g.text(g.W - 22, 176, tx('net', lang) + ' →', P.net, 10, 'end');
  // ball on the net side of the strings
  g.circle(cx + 26, cy, 11, '#a3a30a', '#d9f24a', 1.5);
  // face seen from the side: a line; vertical = square, top leaning toward the net = closed (negative)
  const seg = (deg, c, w, dash = '') => { const t = deg * Math.PI / 180; g.line(cx - Math.sin(t) * L, cy + Math.cos(t) * L, cx + Math.sin(t) * L, cy - Math.cos(t) * L, c, w, dash); };
  g.sector(cx, cy, L + 6, -90 - r[1], -90 - r[0], P.ideal, 0.22); g.sector(cx, cy, L + 6, 90 - r[1], 90 - r[0], P.ideal, 0.22);
  seg(-(r[0] + r[1]) / 2, P.ideal, 2.5, '6 4');
  seg(-clamp(m.v, -70, 70), you, 6);
  g.text(cx - 50, cy - L - 2, lang === 'zh' ? '開放' : 'open', P.muted, 10); g.text(cx + 50, cy - L - 2, lang === 'zh' ? '關閉' : 'closed', P.muted, 10);
  header(g, fmtValue(m.unit ? m : { ...m, unit: 'face' }, lang, type), fmtRange('racketFace', type, lang), good);
};
D.swingPath = (g, m, type, good) => {
  const { P, lang } = g; const you = good ? P.ideal : P.you;
  const r = rangeFor(type, 'swingPath') || [8, 45]; const cx = 150, cy = 120, L = 110;
  g.line(20, cy, g.W - 20, cy, P.line, 1, '4 4'); g.text(g.W - 22, cy - 6, tx('net', lang) + ' →', P.net, 10, 'end');
  g.sector(cx, cy, L, -r[1], -r[0], P.ideal, 0.2); g.sector(cx, cy, L, 180 - r[1], 180 - r[0], P.ideal, 0.2);
  g.circle(cx, cy, 10, '#a3a30a', '#d9f24a', 1.5);
  const t = -clamp(m.v, -70, 80) * Math.PI / 180;
  g.arrow(cx - Math.cos(t) * L, cy - Math.sin(t) * L, cx + Math.cos(t) * L, cy + Math.sin(t) * L, you, 4);
  header(g, `${Math.round(m.v)}°`, fmtRange('swingPath', type, lang), good);
  g.text(g.W - 12, 34, lang === 'zh' ? '由下往上 ↗ 為正' : 'low-to-high is positive', P.muted, 10, 'end');
};
D.racketDrop = (g, m, type, good) => {
  const { P, lang } = g; const you = good ? P.ideal : P.you;
  const r = rangeFor(type, 'racketDrop') || [0.06, 0.4]; const s = 220, y0 = 80, x0 = 40, x1 = 260, xc = 205;
  g.circle(xc, y0, 9, '#a3a30a', '#d9f24a', 1.5); g.line(20, y0, g.W - 20, y0, P.line, 1, '3 3');
  g.rect(120, y0 + r[0] * s, 60, (Math.min(r[1], 0.5) - r[0]) * s, P.ideal, P.ideal, 6, 0.22);
  const dy = clamp(m.v, -0.1, 0.5) * s;
  g.path(`M${g.X(x0)},${y0 - 30} Q${g.X(150)},${y0 + dy * 2 - 10} ${g.X(xc)},${y0} T${g.X(x1)},${y0 - 60}`, you, 'none', 4);
  header(g, fmtValue({ ...m, unit: 'pctBH' }, lang, type), fmtRange('racketDrop', type, lang), good);
};
D.racketHeadHeight = (g, m, type, good) => {
  const { P, lang } = g; const you = good ? P.ideal : P.you;
  const r = rangeFor(type, 'racketHeadHeight') || [-0.15, 0.15]; const s = 260, wx = 120, wy = 110;
  g.line(40, wy + 10, wx, wy, P.muted, 5); g.circle(wx, wy, 5, P.ink, P.ink);
  g.rect(190, wy - Math.min(r[1], 0.5) * s, 70, (Math.min(r[1], 0.5) - r[0]) * s, P.ideal, P.ideal, 8, 0.22);
  const hy = wy - clamp(m.v, -0.3, 0.55) * s; const ang = Math.atan2(hy - wy, 105) * 180 / Math.PI;
  racketShape(g, wx, wy, ang, 150, you, 4);
  header(g, fmtValue({ ...m, unit: 'pctBH' }, lang, type), fmtRange('racketHeadHeight', type, lang), good);
};
D.racketLag = (g, m, type, good) => {
  const { P, lang } = g; const you = good ? P.ideal : P.you;
  const r = rangeFor(type, 'racketLag') || [15, 80]; const ex = 60, ey = 110, wx = 140, wy = 110;
  g.line(ex, ey, wx, wy, P.muted, 6); g.circle(wx, wy, 5, P.ink, P.ink);
  g.sector(wx, wy, 120, 180 - r[1], 180 - r[0], P.ideal, 0.18);
  racketShape(g, wx, wy, -((r[0] + r[1]) / 2) + 0, 130, P.ideal, 2.5, '6 4', 0.9);
  racketShape(g, wx, wy, -clamp(m.v, 0, 179), 130, you, 4);
  header(g, `${Math.round(m.v)}°`, fmtRange('racketLag', type, lang), good);
};
D.takeBack = (g, m, type, good) => {
  const { P, lang } = g; const you = good ? P.ideal : P.you;
  const r = rangeFor(type, 'takeBack') || [-10, 100];
  const f = sideFigure(g, 170, 190, 150, P.ink, 3, 0.9); const wx = f.hip[0] - 40, wy = f.hipY - 25;
  g.line(f.sh[0], f.sh[1], wx, wy, P.muted, 3);
  g.sector(wx, wy, 90, 180, 180 + Math.min(r[1], 100), P.ideal, 0.18);
  racketShape(g, wx, wy, 180 + clamp(m.v, -90, 120), 110, you, 4);
  g.text(30, 30, lang === 'zh' ? '↑ 天空' : '↑ sky', P.muted, 10, 'start'); g.text(14, wy + 4, lang === 'zh' ? '← 後方' : '← back', P.muted, 10, 'start');
  header(g, `${Math.round(m.v)}°`, fmtRange('takeBack', type, lang), good);
};
D.racketFinish = (g, m, type, good) => {
  const { P, lang } = g; const you = good ? P.ideal : P.you;
  const r = rangeFor(type, 'racketFinish') || [-0.05, 0.6];
  const f = backFigure(g, 130, 190, 150, P.ink, 3); const s = 150;
  g.rect(f.lSh[0] - 50, f.shY - Math.min(r[1], 0.6) * s, 90, (Math.min(r[1], 0.6) - r[0]) * s, P.ideal, P.ideal, 8, 0.22);
  const hy = f.shY - clamp(m.v, -0.4, 0.7) * s; const hand = [f.lSh[0] + 4, f.shY - 6];
  g.line(f.rSh[0], f.rSh[1], hand[0], hand[1], P.muted, 3);
  racketShape(g, hand[0], hand[1], Math.atan2(hy - hand[1], -40) * 180 / Math.PI, 110, you, 4);
  header(g, fmtValue({ ...m, unit: 'pctBH' }, lang, type), fmtRange('racketFinish', type, lang), good);
};
D.serveDrop = (g, m, type, good) => {
  const { P, lang } = g; const you = good ? P.ideal : P.you;
  const r = rangeFor(type, 'serveDrop') || [0.05, 0.45];
  const f = sideFigure(g, 150, 192, 160, P.ink, 3, 0.9); const s = 160;
  const el = [f.sh[0] - 6, f.sh[1] - 34];
  g.line(f.sh[0], f.sh[1], el[0], el[1], P.muted, 3);
  g.rect(f.sh[0] - 70, f.sh[1] + r[0] * s, 50, (Math.min(r[1], 0.6) - r[0]) * s, P.ideal, P.ideal, 8, 0.22);
  const hy = f.sh[1] + clamp(m.v, -0.1, 0.6) * s, hx = f.sh[0] - 45;
  g.line(el[0], el[1], f.sh[0] - 22, f.sh[1] - 10, P.muted, 3);
  racketShape(g, f.sh[0] - 22, f.sh[1] - 10, Math.atan2(hy - (f.sh[1] - 10), hx - (f.sh[0] - 22)) * 180 / Math.PI, 100, you, 4);
  header(g, fmtValue({ ...m, unit: 'pctBH' }, lang, type), fmtRange('serveDrop', type, lang), good);
};

const METRIC_RACKET = new Set(['racketFace', 'racketHeadHeight', 'racketDrop', 'swingPath', 'racketLag', 'takeBack', 'racketFinish', 'serveDrop']);
export function hasDiagram(key) { return !!D[key]; }
// m: metric {key, v, ...}; opts: {hand, lang, good, palette}
export function diagramSvg(m, type, { hand = 'R', lang = 'zh', good = false, palette } = {}) {
  const fn = D[m.key]; if (!fn || !Number.isFinite(m.v)) return '';
  const g = ctxFor(300, 200, NO_MIRROR.has(m.key) ? 'R' : hand, palette || CSS, lang);
  fn(g, m, type, good);
  legend(g, good);
  return wrapSvg(g, m.key);
}

// ---------- overlay on the player's own frame ----------
// pose: Float32Array(99) normalized (x,y,vis); aspect = W/H; F: world forward [x,y,z]; BHimg in frame-height units
export function overlaySvg(m, type, { pose, aspect, F, BHimg, hand = 'R', lang = 'zh', good = false, rk = null }) {
  if (!pose) return '';
  const W = aspect * 100, H = 100;
  const P = (k) => [pose[k * 3] * W, pose[k * 3 + 1] * H];
  const o = [];
  const you = good ? '#46c27c' : '#ff6b57', ideal = '#4ade80';
  const R = (k) => (hand === 'L' ? { sh: 11, el: 13, wr: 15, osh: 12, owr: 16, hip: 23 } : { sh: 12, el: 14, wr: 16, osh: 11, owr: 15, hip: 24 })[k];
  const bh = (BHimg || 0.7) * H;
  const sw = Math.max(0.5, bh / 140);
  const line = (a, b, c, w, dash = '') => o.push(`<line x1="${r1(a[0])}" y1="${r1(a[1])}" x2="${r1(b[0])}" y2="${r1(b[1])}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`);
  const arrow = (a, b, c) => {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d < 2) return;
    const ux = (b[0] - a[0]) / d, uy = (b[1] - a[1]) / d, hs = Math.max(1.6, sw * 3);
    const bx = b[0] - ux * hs * 1.6, by = b[1] - uy * hs * 1.6;
    line(a, [bx, by], 'rgba(0,0,0,.6)', sw * 3.4); line(a, [bx, by], c, sw * 2);
    o.push(`<polygon points="${r1(b[0])},${r1(b[1])} ${r1(bx - uy * hs)},${r1(by + ux * hs)} ${r1(bx + uy * hs)},${r1(by - ux * hs)}" fill="${c}" stroke="rgba(0,0,0,.5)" stroke-width="${sw * 0.5}"/>`);
  };
  const dot = (p, c) => o.push(`<circle cx="${r1(p[0])}" cy="${r1(p[1])}" r="${r1(sw * 2.6)}" fill="${c}" stroke="#fff" stroke-width="${r1(sw * 0.9)}"/>`);
  const zoneRect = (x0, y0, x1, y1, faded) => o.push(`<rect x="${r1(Math.min(x0, x1))}" y="${r1(Math.min(y0, y1))}" width="${r1(Math.abs(x1 - x0))}" height="${r1(Math.abs(y1 - y0))}" rx="${r1(sw * 3)}" fill="${ideal}" fill-opacity="${faded ? 0.1 : 0.22}" stroke="${ideal}" stroke-width="${r1(sw * 1.2)}" stroke-dasharray="${r1(sw * 3)} ${r1(sw * 2)}" opacity="${faded ? 0.55 : 1}"/>`);
  const zoneCircle = (c, rr, faded) => o.push(`<circle cx="${r1(c[0])}" cy="${r1(c[1])}" r="${r1(rr)}" fill="${ideal}" fill-opacity="${faded ? 0.1 : 0.22}" stroke="${ideal}" stroke-width="${r1(sw * 1.2)}" stroke-dasharray="${r1(sw * 3)} ${r1(sw * 2)}" opacity="${faded ? 0.55 : 1}"/>`);
  const label = (p, s, c) => o.push(`<text x="${r1(p[0])}" y="${r1(p[1])}" fill="${c}" font-size="${r1(Math.max(3.2, sw * 5))}" font-weight="700" text-anchor="middle" stroke="rgba(0,0,0,.65)" stroke-width="${r1(sw * 1.2)}" paint-order="stroke" font-family="-apple-system,'PingFang TC','Noto Sans TC','Segoe UI',sans-serif">${esc(s)}</text>`);
  // skeleton (thin)
  for (const [a, b] of [[11, 12], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [11, 13], [13, 15], [12, 14], [14, 16]]) line(P(a), P(b), 'rgba(255,255,255,.75)', sw * 1.1);
  const hipM = [(P(23)[0] + P(24)[0]) / 2, (P(23)[1] + P(24)[1]) / 2], shM = [(P(11)[0] + P(12)[0]) / 2, (P(11)[1] + P(12)[1]) / 2];
  const wr = P(R('wr'));
  const fx = F ? F[0] : 0, side = Math.abs(fx) > 0.45; const fsg = fx >= 0 ? 1 : -1;
  const level = (v) => hipM[1] - v * (hipM[1] - P(R('sh'))[1]);
  let note = '';
  const k = m.key;
  // racket (if detected near this moment): shaft from the hand to the head
  const RKC = '#22d3ee';
  let head = null;
  if (rk && Number.isFinite(rk.hx) && Number.isFinite(rk.hy)) {
    head = [rk.hx * W, rk.hy * H];
    line(wr, head, 'rgba(0,0,0,.6)', sw * 3.4); line(wr, head, RKC, sw * 2);
    o.push(`<circle cx="${r1(head[0])}" cy="${r1(head[1])}" r="${r1(bh * 0.045)}" fill="none" stroke="${RKC}" stroke-width="${r1(sw * 1.6)}"/>`);
  }
  if (METRIC_RACKET.has(k)) {
    const unitOv = m.unit === 'pctBH' ? 'pctBH' : undefined;
    let vs = ''; try { vs = `${fmtValue(m, lang, type)} → ${fmtRange(k, type, lang, unitOv)}`; } catch (e) { vs = ''; }
    if (head && k === 'racketHeadHeight') {
      const r = rangeFor(type, k) || [-0.15, 0.15];
      zoneRect(head[0] - bh * 0.12, wr[1] - Math.min(r[1], 0.6) * bh, head[0] + bh * 0.12, wr[1] - r[0] * bh, false);
      if (!good) arrow(head, [head[0], clamp(head[1], wr[1] - Math.min(r[1], 0.6) * bh + sw * 3, wr[1] - r[0] * bh - sw * 3)], you);
    }
    if (head && k === 'racketFace' && Number.isFinite(m.v)) {
      const L2 = bh * 0.11, face = (deg, c, w, dash) => { const t = deg * Math.PI / 180; const dx = Math.sin(t) * L2 * fsg, dy = Math.cos(t) * L2; line([head[0] - dx, head[1] + dy], [head[0] + dx, head[1] - dy], c, w, dash); };
      const r = rangeFor(type, k) || [-15, 8]; face(-(r[0] + r[1]) / 2, ideal, sw * 1.6, `${sw * 2} ${sw * 1.5}`); face(-m.v, you, sw * 2.6);
    }
    if (vs) label([clamp((head || wr)[0], bh * 0.4, W - bh * 0.4), Math.max(sw * 6, Math.min((head || wr)[1], wr[1]) - bh * 0.1)], vs, good ? ideal : '#fff');
    if (!head) label([W / 2, H - 4], lang === 'zh' ? '這一刻沒偵測到球拍' : 'No racket found at this moment', '#fde68a');
  } else if (k === 'contactFront' || k === 'contactHeight') {
    const r = rangeFor(type, 'contactFront') || [0.1, 0.5]; const rh = rangeFor(type, 'contactHeight') || [0.05, 1.05];
    const y0 = level(Math.min(rh[1], 1.2)), y1 = level(Math.max(rh[0], -0.3));
    let x0, x1, faded = false;
    if (k === 'contactFront' || side) {
      if (side) { x0 = hipM[0] + fsg * r[0] * bh * Math.abs(fx); x1 = hipM[0] + fsg * Math.min(r[1], 0.6) * bh * Math.abs(fx); }
      else { faded = true; x0 = wr[0] - bh * 0.12; x1 = wr[0] + bh * 0.12; note = lang === 'zh' ? '此角度前後距離不準，僅示意' : 'Depth is rough from this angle'; }
    } else { x0 = wr[0] - bh * 0.15; x1 = wr[0] + bh * 0.15; }
    zoneRect(x0, y0, x1, y1, faded);
    label([(x0 + x1) / 2, y0 - sw * 3], lang === 'zh' ? '理想擊球區' : 'Ideal contact', ideal);
    const tx0 = clamp(wr[0], Math.min(x0, x1) + sw * 4, Math.max(x0, x1) - sw * 4), ty0 = clamp(wr[1], y0 + sw * 4, y1 - sw * 4);
    if (!good) arrow(wr, [tx0, ty0], you);
    dot(wr, you);
  } else if (k === 'contactReach') {
    const r = rangeFor(type, 'contactReach') || [0.18, 0.7];
    const c = [P(0)[0] + (side ? fsg * 0.07 * bh * Math.abs(fx) : 0), P(0)[1] - (r[0] + 0.1) * bh];
    zoneCircle(c, bh * 0.08, false); label([c[0], c[1] - bh * 0.1], lang === 'zh' ? '完全伸展擊球' : 'Full reach', ideal);
    if (!good) arrow(wr, c, you); dot(wr, you);
  } else if (k === 'finish') {
    let c;
    if (type === 'forehand') c = [P(R('osh'))[0], P(R('osh'))[1] - bh * 0.07];
    else if (type === 'backhand1') c = [P(R('sh'))[0], P(R('sh'))[1] - bh * 0.18];
    else if (type === 'backhand2') c = [P(R('sh'))[0], P(R('sh'))[1] - bh * 0.06];
    else if (type === 'serve' || type === 'overhead') c = [P(hand === 'L' ? 24 : 23)[0], P(hand === 'L' ? 24 : 23)[1]];
    else c = [wr[0], wr[1]];
    zoneCircle(c, bh * 0.07, !side && type === 'forehand' ? false : false);
    label([c[0], c[1] - bh * 0.09], lang === 'zh' ? '收拍位置' : 'Finish here', ideal);
    if (!good) arrow(wr, c, you); dot(wr, you);
  } else if (k === 'headStable') {
    const r = rangeFor(type, 'headStable') || [0, 0.07];
    zoneCircle(P(0), r[1] * bh, false); o.push(`<circle cx="${r1(P(0)[0])}" cy="${r1(P(0)[1])}" r="${r1(clamp(m.v, 0.01, 0.3) * bh)}" fill="none" stroke="${you}" stroke-width="${r1(sw * 1.6)}"/>`);
    label([P(0)[0], P(0)[1] - Math.max(r[1], m.v) * bh - sw * 3], lang === 'zh' ? '頭部移動' : 'Head movement', you);
  } else if (k === 'trunkLean') {
    const len = Math.hypot(shM[0] - hipM[0], shM[1] - hipM[1]);
    line(hipM, [hipM[0], hipM[1] - len], ideal, sw * 2, `${sw * 3} ${sw * 2}`); line(hipM, shM, you, sw * 2.4);
    label([hipM[0], hipM[1] - len - sw * 4], lang === 'zh' ? '直立' : 'Upright', ideal);
    if (!good) arrow(shM, [hipM[0] + (shM[0] - hipM[0]) * 0.25, hipM[1] - len * 0.97], you);
  } else if (k === 'tossArm') {
    const r = rangeFor(type, 'tossArm') || [0.15, 0.7]; const ow = P(R('owr'));
    const c = [P(R('osh'))[0], P(0)[1] - (r[0] + 0.08) * bh];
    zoneCircle(c, bh * 0.07, false); label([c[0], c[1] - bh * 0.09], lang === 'zh' ? '拋球手伸直向上' : 'Reach up', ideal);
    if (!good) arrow(ow, c, you); dot(ow, you);
  } else {
    // joint-based metrics: highlight the joint/segments involved and print value vs. ideal
    const map = { kneeBend: [[23, 25, 27], [24, 26, 28]], elbowAngle: [[R('sh'), R('el'), R('wr')]], extension: [[R('sh'), R('el'), R('wr')]], trophyElbow: [[R('sh'), R('el'), R('wr')]],
      trophyElbowHeight: [[R('osh'), R('sh'), R('el')]], offArm: [[R('osh'), hand === 'L' ? 14 : 13, R('owr')]], unitTurn: [[11, 12]], separation: [[11, 12], [23, 24]], baseWidth: [[27, 28]],
      legDrive: [[23, 25, 27], [24, 26, 28]], chain: [[23, 24], [11, 12], [R('sh'), R('el'), R('wr')]], compact: [[R('sh'), R('el'), R('wr')]], recovery: [[27, 28]], wristSpeed: [[R('el'), R('wr')]] };
    for (const seq of map[k] || []) { for (let i = 0; i < seq.length - 1; i++) { line(P(seq[i]), P(seq[i + 1]), 'rgba(0,0,0,.6)', sw * 3.6); line(P(seq[i]), P(seq[i + 1]), you, sw * 2.2); } seq.forEach((j) => dot(P(j), you)); }
    const seqs = map[k] || [];
    if (seqs.length && Number.isFinite(m.v) && k !== '_none') {
      const sq = seqs[0]; const j = P(sq[Math.floor(sq.length / 2)]);
      const unitOv = m.unitOverride || (m.unit === 'pctBH' ? 'pctBH' : undefined);
      let vs = ''; try { vs = `${fmtValue(m, lang, type)} → ${fmtRange(k, type, lang, unitOv)}`; } catch (e) { vs = ''; }
      if (vs) label([clamp(j[0], bh * 0.35, W - bh * 0.35), Math.max(sw * 6, j[1] - bh * 0.1)], vs, good ? ideal : '#fff');
    }
    if ((k === 'kneeBend' || k === 'legDrive') && !good) arrow([hipM[0] + bh * 0.12, hipM[1] - bh * 0.05], [hipM[0] + bh * 0.12, hipM[1] + bh * 0.06], you);
  }
  if (note) label([W / 2, H - 4], note, '#fde68a');
  return `<svg class="ovl" viewBox="0 0 ${r1(W)} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${o.join('')}</svg>`;
}

// ---------- contact-point maps (all swings at once) ----------
export const TYPE_COLORS = { forehand: '#f97316', backhand1: '#8b5cf6', backhand2: '#0ea5e9', volley: '#d4a20b', serve: '#ec4899', overhead: '#ec4899' };
const TYPE_TX = { forehand: ['正拍', 'FH'], backhand1: ['單反', '1H BH'], backhand2: ['雙反', '2H BH'], volley: ['截擊', 'Volley'], serve: ['發球', 'Serve'], overhead: ['高壓', 'Smash'] };
const zoneLat = (type) => (type === 'backhand1' ? -0.2 : type === 'backhand2' ? -0.14 : type === 'volley' ? 0 : 0.24);
function numDot(g, x, y, n, color, sel) {
  if (sel) g.circle(x, y, 13, g.P.ink, 'none', 2.5);
  g.circle(x, y, 9, '#fff', color, 1.5);
  g.o.push(`<text x="${r1(g.X(x))}" y="${r1(y + 3.5)}" fill="#fff" font-size="10" font-weight="800" text-anchor="middle" font-family="sans-serif">${n}</text>`);
}
function typeLegend(g, types) {
  let x = 8;
  for (const t of types) {
    const s = TYPE_TX[t][g.lang === 'zh' ? 0 : 1];
    g.o.push(`<circle cx="${x + 5}" cy="${g.H - 12}" r="5" fill="${TYPE_COLORS[t]}"/><text x="${x + 14}" y="${g.H - 8}" fill="${g.P.muted}" font-size="11" font-weight="600" font-family="sans-serif">${esc(s)}</text>`);
    x += 22 + s.length * (g.lang === 'zh' ? 12 : 7);
  }
}
// pts: [{n, type, fwd, lat, level, conf, sel}]
export function contactTopSvg(pts, { hand = 'R', lang = 'zh', palette, faded = false, note = '' } = {}) {
  const g = ctxFor(300, 230, hand, palette || CSS, lang); const { P } = g;
  const s = 230, cx = 150, cy = 182;
  g.line(14, 22, g.W - 14, 22, P.net, 2, '6 5'); g.text(g.W / 2, 16, tx('net', lang) + ' ↑', P.net, 11);
  const types = [...new Set(pts.map((p) => p.type))];
  for (const t of types) {
    const r = rangeFor(t, 'contactFront') || [0.1, 0.5];
    const zx0 = cx + (zoneLat(t) - 0.13) * s, zw = 0.26 * s, zy0 = Math.max(32, cy - Math.min(r[1], 0.65) * s), zh = cy - r[0] * s - zy0;
    g.rect(zx0, zy0, zw, zh, P.ideal, P.ideal, 8, faded ? 0.1 : 0.2); g.rect(zx0, zy0, zw, zh, 'none', P.ideal, 8, faded ? 0.5 : 1, '5 4');
    g.text(zx0 + zw / 2, zy0 + 13, `${tx('zone', lang)}·${TYPE_TX[t][lang === 'zh' ? 0 : 1]}`, P.ideal, 10);
  }
  g.rect(cx - 34, cy + 10, 14, 22, P.soft, P.muted, 6); g.rect(cx + 20, cy + 4, 14, 22, P.soft, P.muted, 6);
  g.line(cx - 22, cy + 4, cx + 22, cy + 4, P.muted, 4); g.line(cx - 36, cy - 2, cx + 36, cy - 2, P.ink, 4); g.circle(cx, cy - 2, 11, P.ink, P.bg, 2.5);
  const sel = pts.find((p) => p.sel);
  if (sel && Number.isFinite(sel.fwd)) {
    const r = rangeFor(sel.type, 'contactFront') || [0.1, 0.5];
    const px = cx + (Number.isFinite(sel.lat) ? sel.lat : zoneLat(sel.type)) * s, py = cy - sel.fwd * s;
    const ty = clamp(py, cy - Math.min(r[1], 0.65) * s + 20, cy - r[0] * s - 8), tx0 = clamp(px, cx + (zoneLat(sel.type) - 0.1) * s, cx + (zoneLat(sel.type) + 0.1) * s);
    g.arrow(px, py, tx0, ty, P.you);
  }
  for (const p of pts.slice().sort((a, b) => (a.sel ? 1 : 0) - (b.sel ? 1 : 0))) {
    if (!Number.isFinite(p.fwd)) continue;
    const px = clamp(cx + (Number.isFinite(p.lat) ? p.lat : zoneLat(p.type)) * s, 12, g.W - 12), py = clamp(cy - p.fwd * s, 30, cy + 26);
    numDot(g, px, py, p.n, TYPE_COLORS[p.type], p.sel);
  }
  if (note) g.text(g.W / 2, 36, note, P.muted, 10);
  typeLegend(g, types);
  return wrapSvg(g, 'contact');
}
export function contactSideSvg(pts, { hand = 'R', lang = 'zh', palette } = {}) {
  const g = ctxFor(300, 230, hand, palette || CSS, lang); const { P } = g;
  const f = sideFigure(g, 70, 200, 180, P.ink, 3, 0.9);
  const lv = (v) => f.hipY - v * (f.hipY - f.shY);
  const types = [...new Set(pts.map((p) => p.type))];
  const r = rangeFor(types[0] || 'forehand', 'contactHeight') || [0.05, 1.05];
  const y0 = lv(Math.min(r[1], 1.25)), y1 = lv(Math.max(r[0], -0.4));
  g.rect(112, y0, 128, y1 - y0, P.ideal, P.ideal, 8, 0.2); g.rect(112, y0, 128, y1 - y0, 'none', P.ideal, 8, 1, '5 4');
  g.text(176, y0 - 5, tx('zone', lang), P.ideal, 10);
  for (const [k, v] of [['shoulder', 1], ['chest', 0.68], ['waist', 0.34], ['hip', 0]]) { g.line(100, lv(v), 246, lv(v), P.line, 1, '3 3'); g.text(250, lv(v) + 4, tx(k, lang), P.muted, 10, 'start'); }
  const n = pts.length;
  pts.forEach((p, i) => { if (!Number.isFinite(p.level)) return; const x = 124 + (n > 1 ? i * (104 / (n - 1)) : 52); numDot(g, x, clamp(lv(p.level), 14, 196), p.n, TYPE_COLORS[p.type], p.sel); });
  typeLegend(g, types);
  return wrapSvg(g, 'height');
}
export function serveReachSvg(pts, { hand = 'R', lang = 'zh', palette } = {}) {
  const g = ctxFor(300, 230, hand, palette || CSS, lang); const { P } = g;
  const H = 160, ground = 214; const f = sideFigure(g, 110, ground, H, P.ink, 3, 0.9);
  const noseY = f.head[1]; const r = rangeFor('serve', 'contactReach') || [0.18, 0.7];
  const zy1 = noseY - r[0] * H, zy0 = Math.max(6, noseY - 0.42 * H);
  g.rect(f.head[0] + 4, zy0, 70, zy1 - zy0, P.ideal, P.ideal, 8, 0.22); g.rect(f.head[0] + 4, zy0, 70, zy1 - zy0, 'none', P.ideal, 8, 1, '5 4');
  g.text(f.head[0] + 80, zy0 + 12, tx('reach', lang), P.ideal, 11, 'start'); g.text(f.head[0] + 80, zy0 + 26, tx('oneOclock', lang), P.ideal, 10, 'start');
  g.line(f.head[0] - 30, noseY, f.head[0] + 140, noseY, P.line, 1, '3 3');
  const n = pts.length;
  pts.forEach((p, i) => { if (!Number.isFinite(p.reach)) return; numDot(g, f.head[0] + 14 + (n > 1 ? i * (52 / (n - 1)) : 26), clamp(noseY - p.reach * H, 12, ground - 20), p.n, TYPE_COLORS[p.type], p.sel); });
  typeLegend(g, [...new Set(pts.map((p) => p.type))]);
  return wrapSvg(g, 'reach');
}
