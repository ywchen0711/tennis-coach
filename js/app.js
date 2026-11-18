// Swing Coach - UI controller.
import { t, L, setLang, getLang, applyI18n, fmtDuration, fmtTime } from './i18n.js';
import { probeVideo } from './mp4.js';
import { getLandmarker, trackClip, scanMotion, suggestTrim, captureFrame, seekTo, QUALITY, suggestQuality, delegateName } from './pose.js';
import { selectTrack, buildTrack, analyze, poseAt, angleSeries, rankIssues, rankStrengths, AREAS, STROKES, CONF_MIN, sideIdx } from './analysis.js';
import { STROKE_NAMES, STROKE_SHORT, VIEW_NAMES, VIEW_NOTES, AREA_NAMES, PHASE_NAMES, METRIC_NAMES, metricText, fmtValue, fmtRange, CONF_LABEL, areaLabel } from './coach.js';
import { lineChart, drawSkeleton, drawTrail, cssVar, fitCanvas } from './charts.js';
import { saveAnalysis, listAnalyses, deleteAnalysis, clearAnalyses } from './store.js';
import { renderSummary } from './summary.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };

const state = {
  file: null, url: '', fps: 30, duration: 0, scan: null, trim: [0, 0], suggested: null,
  quality: store.get('sc-quality') || suggestQuality(), hand: 'auto', slow: 'auto',
  frames: null, aspect: 16 / 9, sampleFps: 30, anchor: null, track: null, result: null, multi: 0,
  sel: 0, tab: 'coach', overrides: {}, kf: {}, recId: null, fromHistory: false, prevView: 'home', abort: null, picking: false,
};

// a rendered (tiny, nearly invisible) video used for seeking/decoding; visible elements are for display
const work = document.createElement('video');
work.muted = true; work.playsInline = true; work.setAttribute('playsinline', ''); work.preload = 'auto';
Object.assign(work.style, { position: 'fixed', left: '0', bottom: '0', width: '4px', height: '4px', opacity: '0.01', pointerEvents: 'none', zIndex: '-1' });
document.body.appendChild(work);

// ---------- views ----------
function show(id) {
  const cur = $$('.view').find((v) => !v.hidden);
  if (cur && cur.id !== id && cur.id !== 'history') state.prevView = cur.id;
  $$('.view').forEach((v) => { v.hidden = v.id !== id; });
  window.scrollTo(0, 0);
  if (id !== 'results') { try { $('#resVideo').pause(); } catch (e) { /* ignore */ } }
}
function toast(msg, ms = 2600) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------- theme / language ----------
function effectiveDark() {
  const th = document.documentElement.dataset.theme;
  if (th) return th === 'dark';
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}
$('#btnTheme').addEventListener('click', () => {
  const next = effectiveDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next; store.set('sc-theme', next);
  redrawAll();
});
setLang(store.get('sc-lang') || 'zh');
applyI18n();
$('#btnLang').addEventListener('click', () => {
  setLang(getLang() === 'zh' ? 'en' : 'zh'); store.set('sc-lang', getLang()); applyI18n();
  if (state.result) renderResults(); updateEstimate(); renderHistoryIfOpen();
});
$('#brand').addEventListener('click', () => { if (state.abort) return; show('home'); });
$$('[data-go]').forEach((b) => b.addEventListener('click', () => {
  const to = b.dataset.go === 'back' ? (state.prevView && state.prevView !== 'history' ? state.prevView : 'home') : b.dataset.go;
  show(to === 'processing' ? 'home' : to);
}));

// ---------- file input / drag and drop ----------
$('#fileInput').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) loadFile(f); });
const drop = $('#drop');
['dragenter', 'dragover'].forEach((ev) => window.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => window.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'dragleave' && e.relatedTarget) return; drop.classList.remove('over'); }));
window.addEventListener('drop', (e) => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f && (/^video\//.test(f.type) || /\.(mov|mp4|m4v|webm|ogv)$/i.test(f.name))) loadFile(f); });

function waitEvent(el, names, ms) {
  return new Promise((res, rej) => {
    const ok = () => { clean(); res(); }, bad = () => { clean(); rej(new Error('media')); };
    const to = setTimeout(() => { clean(); rej(new Error('timeout')); }, ms);
    const clean = () => { clearTimeout(to); names.forEach((n) => el.removeEventListener(n, ok)); el.removeEventListener('error', bad); };
    names.forEach((n) => el.addEventListener(n, ok, { once: true })); el.addEventListener('error', bad, { once: true });
  });
}
async function primeVideo(v, url) {
  v.src = url; v.load();
  await waitEvent(v, ['loadedmetadata'], 15000);
  if (v.readyState < 2) { try { await v.play(); v.pause(); } catch (e) { /* autoplay may be refused; seeking still loads */ } }
  if (v.readyState < 2) { try { await seekTo(v, Math.min(0.05, v.duration / 2)); } catch (e) { /* ignore */ } }
  if (!v.videoWidth) throw new Error('decode');
}

async function loadFile(file) {
  if (state.abort) return;
  if (state.url) URL.revokeObjectURL(state.url);
  Object.assign(state, { file, url: URL.createObjectURL(file), frames: null, track: null, result: null, anchor: null, overrides: {}, kf: {}, sel: 0, fromHistory: false, recId: null, scan: null });
  const pv = $('#prepVideo');
  show('prepare');
  $('#scanMsg').hidden = false; $('#thumbs').innerHTML = '';
  try {
    await primeVideo(pv, state.url);
    await primeVideo(work, state.url);
  } catch (e) {
    toast(t('decodeErr'), 7000); show('home'); return;
  }
  state.duration = work.duration;
  const probe = await probeVideo(file);
  state.fps = probe && probe.fps > 5 && probe.fps < 1000 ? probe.fps : 30;
  state.trim = [0, Math.min(state.duration, 30)];
  setSeg('#segQuality', state.quality); setSeg('#segHand', state.hand); setSeg('#segSlow', state.slow);
  drawTrim(); updateEstimate();
  // motion scan for the trim suggestion
  const ac = new AbortController(); state.scanAbort = ac;
  try {
    const scan = await scanMotion(work, { signal: ac.signal });
    if (state.file !== file) return;
    state.scan = scan;
    state.suggested = suggestTrim(scan, state.duration, 30);
    state.trim = state.suggested.slice();
    $('#thumbs').innerHTML = scan.thumbs.map((th) => `<img src="${th.url}" alt="">`).join('');
  } catch (e) { /* trimming still works without the scan */ }
  $('#scanMsg').hidden = true;
  drawTrim(); updateEstimate();
  try { pv.currentTime = state.trim[0] + 0.01; } catch (e) { /* ignore */ }
}

// ---------- prepare: trim + settings ----------
function setSeg(sel, v) { $$(sel + ' button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(v))); }
function segListen(sel, fn) { $$(sel + ' button').forEach((b) => b.addEventListener('click', () => { setSeg(sel, b.dataset.v); fn(b.dataset.v); })); }
segListen('#segQuality', (v) => { state.quality = v; store.set('sc-quality', v); updateEstimate(); });
segListen('#segHand', (v) => { state.hand = v; });
segListen('#segSlow', (v) => { state.slow = v; });

function drawTrim() {
  const strip = $('#strip'), c = $('#motionCanvas');
  const { ctx, w, h } = fitCanvas(c, strip.clientHeight);
  ctx.clearRect(0, 0, w, h);
  const D = state.duration || 1;
  if (state.scan && state.scan.motion.length) {
    const m = state.scan.motion, mx = Math.max(...m, 1e-6);
    ctx.beginPath(); ctx.moveTo(0, h);
    state.scan.times.forEach((tt, i) => ctx.lineTo(tt / D * w, h - 4 - (m[i] / mx) * (h - 14)));
    ctx.lineTo(w, h); ctx.closePath();
    ctx.fillStyle = 'rgba(31,122,77,.35)'; ctx.fill();
    ctx.strokeStyle = cssVar('--primary'); ctx.lineWidth = 2; ctx.stroke();
  }
  const [s, e] = state.trim;
  const sel = $('#trimSel'); sel.style.left = (s / D * 100) + '%'; sel.style.width = ((e - s) / D * 100) + '%';
  $('#hStart').style.left = (s / D * 100) + '%'; $('#hEnd').style.left = (e / D * 100) + '%';
  $('#trimLabel').textContent = `${fmtTime(s)} – ${fmtTime(e)}  (${(e - s).toFixed(1)} s)`;
}
function bindHandle(el, which) {
  let active = false;
  const move = (ev) => {
    if (!active) return;
    const r = $('#strip').getBoundingClientRect();
    const tt = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * state.duration;
    if (which === 0) state.trim[0] = Math.min(tt, state.trim[1] - 0.5); else state.trim[1] = Math.max(tt, state.trim[0] + 0.5);
    state.trim[0] = Math.max(0, state.trim[0]); state.trim[1] = Math.min(state.duration, state.trim[1]);
    drawTrim(); updateEstimate();
    const pv = $('#prepVideo'); try { pv.currentTime = state.trim[which]; } catch (e) { /* ignore */ }
  };
  el.addEventListener('pointerdown', (ev) => { active = true; el.setPointerCapture(ev.pointerId); ev.preventDefault(); });
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', () => { active = false; });
  el.addEventListener('pointercancel', () => { active = false; });
  el.addEventListener('keydown', (ev) => {
    const d = ev.key === 'ArrowLeft' ? -0.2 : ev.key === 'ArrowRight' ? 0.2 : 0; if (!d) return;
    state.trim[which] = Math.max(0, Math.min(state.duration, state.trim[which] + d)); if (state.trim[1] - state.trim[0] < 0.5) state.trim[which] -= d;
    drawTrim(); updateEstimate(); ev.preventDefault();
  });
}
bindHandle($('#hStart'), 0); bindHandle($('#hEnd'), 1);
$('#strip').addEventListener('pointerdown', (ev) => {
  if (ev.target.classList.contains('handle')) return;
  const r = $('#strip').getBoundingClientRect(); const tt = (ev.clientX - r.left) / r.width * state.duration;
  const which = Math.abs(tt - state.trim[0]) < Math.abs(tt - state.trim[1]) ? 0 : 1;
  state.trim[which] = tt; if (state.trim[1] - state.trim[0] < 0.5) state.trim = which ? [state.trim[0], state.trim[0] + 0.5] : [state.trim[1] - 0.5, state.trim[1]];
  state.trim = [Math.max(0, state.trim[0]), Math.min(state.duration, state.trim[1])];
  drawTrim(); updateEstimate(); try { $('#prepVideo').currentTime = state.trim[which]; } catch (e) { /* ignore */ }
});
$('#btnSuggest').addEventListener('click', () => { if (state.suggested) { state.trim = state.suggested.slice(); drawTrim(); updateEstimate(); } });
$('#btnAll').addEventListener('click', () => { state.trim = [0, state.duration]; drawTrim(); updateEstimate(); });
window.addEventListener('resize', () => { if (!$('#prepare').hidden) drawTrim(); if (!$('#results').hidden) { layoutOverlay(); redrawAll(); } });

function updateEstimate() {
  if (!state.duration) { $('#estimate').textContent = ''; return; }
  const q = QUALITY[state.quality];
  const n = Math.round((state.trim[1] - state.trim[0]) * Math.min(state.fps, q.maxFps));
  const measured = parseFloat(store.get('sc-ms-' + state.quality));
  const ms = Number.isFinite(measured) ? measured : ({ fast: 45, balanced: 70, precise: 170 })[state.quality];
  let s = t('estimate', { n, t: fmtDuration(n * ms) });
  if (n * ms > 120000) s += ' ' + t('longWarn');
  $('#estimate').textContent = s + ` · ${Math.round(state.fps)} fps`;
}

// ---------- processing ----------
$('#btnStart').addEventListener('click', runAnalysis);
$('#btnCancel').addEventListener('click', () => { if (state.abort) state.abort.abort(); });

async function runAnalysis() {
  if (!state.file || state.abort) return;
  if (state.scanAbort) state.scanAbort.abort();
  $('#prepVideo').pause();
  show('processing');
  $('#progFill').style.width = '0%'; $('#procFrames').textContent = ''; $('#procEta').textContent = '';
  $('#procStatus').textContent = t('loadingModel');
  const ac = new AbortController(); state.abort = ac;
  const pc = $('#procCanvas'); const pctx = pc.getContext('2d');
  try {
    try { await getLandmarker(state.quality); } catch (e) { console.warn(e); toast(t('modelErr'), 5000); show('prepare'); return; }
    $('#procStatus').textContent = t('delegate', { d: delegateName() });
    const res = await trackClip(work, {
      start: state.trim[0], end: state.trim[1], fps: state.fps, quality: state.quality, signal: ac.signal,
      onProgress: (p) => {
        $('#progFill').style.width = (p.done / p.total * 100).toFixed(1) + '%';
        $('#procFrames').textContent = t('frames', { a: p.done, b: p.total });
        if (p.done > 4) $('#procEta').textContent = t('eta', { t: fmtDuration(p.etaMs) });
      },
      onPreview: (canvas, poses) => {
        if (pc.width !== canvas.width) { pc.width = canvas.width; pc.height = canvas.height; }
        pctx.drawImage(canvas, 0, 0);
        const rect = { x: 0, y: 0, w: pc.width, h: pc.height };
        poses.forEach((p, i) => drawSkeleton(pctx, p.img, rect, 'R', { alpha: i ? 0.5 : 1 }));
      },
    });
    store.set('sc-ms-' + state.quality, String(Math.round(res.msPerFrame + 5)));
    state.frames = res.frames; state.aspect = res.aspect; state.sampleFps = res.sampleFps;
    state.multi = res.frames.filter((f) => f.poses.length > 1).length / Math.max(1, res.frames.length);
    state.anchor = null; state.overrides = {}; state.kf = {}; state.sel = 0; state.fromHistory = false;
    state.recId = 'a' + Date.now();
    compute();
    if (state.result.error === 'noPose') { toast(t('noPose'), 6000); show('prepare'); return; }
    await enterResults();
    if (!state.result.swings.length) toast(t('noSwing'), 6000);
    else if (state.multi > 0.15) toast(t('multiPeople'), 4500);
  } catch (e) {
    if (e && e.name === 'AbortError') { toast(t('cancelled')); show('prepare'); }
    else { console.error(e); toast(String(e && e.message || e), 6000); show('prepare'); }
  } finally { state.abort = null; }
}

function compute() {
  const pick = selectTrack(state.frames, state.aspect, state.anchor);
  let track = buildTrack(state.frames, pick, state.aspect);
  const slowOpt = state.slow === 'auto' ? 'auto' : Number(state.slow);
  const opts = { hand: state.hand, slowmo: slowOpt, overrides: state.overrides };
  let r = analyze(track, opts);
  if (!r.error && r.slowmo !== 1) {
    track = buildTrack(state.frames, pick, state.aspect, { cutScale: 1 / r.slowmo });
    const r2 = analyze(track, { ...opts, slowmo: r.slowmo });
    r2.slowAuto = r.slowAuto; r = r2;
  }
  state.track = track; state.result = r; state.pick = pick;
  if (state.sel > r.swings.length) state.sel = 0;
}

// ---------- results ----------
async function enterResults() {
  const rv = $('#resVideo');
  $('#noVideo').hidden = true; rv.hidden = false;
  if (rv.src !== state.url) { try { await primeVideo(rv, state.url); } catch (e) { /* display only */ } }
  try { await seekTo(rv, state.result.swings[0] ? state.result.swings[0].phases.contact : state.trim[0]); } catch (e) { /* ignore */ }
  show('results');
  layoutOverlay();
  renderResults();
  saveHistory();
  captureKeyframes();
}

function renderResults() {
  const r = state.result; if (!r) return;
  applyI18n($('#results'));
  renderBadges(); renderChips(); renderTab(); drawTimeline(); drawOverlay();
  $$('.ctrl, #scrub, #timeline, .time-row').forEach((el) => { el.hidden = state.fromHistory; });
  $('.tabs [data-tab="charts"]').hidden = state.fromHistory;
}
function selSwing() { return state.sel > 0 ? state.result.swings[state.sel - 1] : null; }

function renderBadges() {
  const r = state.result; const b = [];
  const vk = r.view.key;
  b.push(`<button class="badge" type="button" id="bView"><span class="dot"></span>${esc(t('view'))}: ${esc(L(VIEW_NAMES[vk]))} <span class="muted">${esc(t('viewConf'))}</span></button>`);
  const hn = r.hand === 'L' ? t('handL') : t('handR');
  b.push(`<button class="badge" type="button" id="bHand" ${state.fromHistory ? 'disabled' : ''}>✋ ${esc(t('handIs', { h: hn }))} · ${esc(t('handSwitch'))}</button>`);
  if (r.handUnsure && state.hand === 'auto' && !state.fromHistory) b.push(`<span class="badge warn">⚠ ${esc(t('handUnsure'))}</span>`);
  if (r.slowmo !== 1) b.push(`<span class="badge warn">🎞 ${esc(t('slowIs', { n: r.slowmo }))}</span>`);
  if (!state.fromHistory) {
    if (Number.isFinite(r.tracked)) b.push(`<span class="badge">${esc(t('tracked', { p: Math.round(r.tracked * 100) }))}</span>`);
    if (state.multi > 0.02) b.push(`<button class="badge" type="button" id="bPick">👆 ${esc(t('pickPlayer'))}</button>`);
  }
  $('#badges').innerHTML = b.join('');
  $('#bView').onclick = () => toast(L(VIEW_NOTES[vk]), 6000);
  if (!state.fromHistory) $('#bHand').onclick = () => { state.hand = r.hand === 'R' ? 'L' : 'R'; recompute(); };
  const bp = $('#bPick'); if (bp) bp.onclick = startPicking;
}
function recompute() {
  if (state.fromHistory || !state.frames) return;
  compute(); state.kf = {}; renderResults(); saveHistory(); captureKeyframes();
}
function renderChips() {
  const r = state.result;
  const chips = [`<button class="chip ${state.sel === 0 ? 'on' : ''}" data-sel="0" type="button">${esc(t('overall'))}</button>`];
  r.swings.forEach((s, i) => chips.push(`<button class="chip ${state.sel === i + 1 ? 'on' : ''}" data-sel="${i + 1}" type="button">#${i + 1}<span class="typ">${esc(L(STROKE_SHORT[s.type]))}</span></button>`));
  $('#swingChips').innerHTML = chips.join('');
  $$('#swingChips .chip').forEach((c) => c.addEventListener('click', () => {
    state.sel = +c.dataset.sel; renderChips(); renderTab(); drawTimeline();
    const s = selSwing(); if (s && !state.fromHistory) seekVideo(s.phases.contact);
  }));
}
$$('.tabs button').forEach((b) => b.addEventListener('click', () => {
  state.tab = b.dataset.tab; $$('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
  $$('.tab-body').forEach((x) => { x.hidden = x.id !== 'tab-' + state.tab; });
  renderTab();
}));
function renderTab() {
  stopCompare();
  $$('.tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === state.tab));
  $$('.tab-body').forEach((x) => { x.hidden = x.id !== 'tab-' + state.tab; });
  if (state.tab === 'coach') renderCoach();
  else if (state.tab === 'metrics') renderMetrics();
  else if (state.tab === 'charts') { applyI18n($('#tab-charts')); drawCharts(); }
  else if (state.tab === 'compare') renderCompare();
}

const lang = () => getLang();
function confBadge(c) { const k = c >= 0.7 ? 'high' : c >= CONF_MIN ? 'medium' : 'low'; return `<span class="conf ${k}">${esc(CONF_LABEL(c, lang()))}</span>`; }
function scoreColor(s) { return s >= 0.72 ? 'var(--good)' : s >= 0.5 ? 'var(--mid)' : 'var(--bad)'; }
function areasHtml(areas) {
  return `<div class="card"><h3>${esc(t('areas'))}</h3><div class="areas">${AREAS.map((a) => {
    const v = areas[a];
    if (!v) return `<div class="area na"><span>${esc(L(AREA_NAMES[a]))}</span><div class="bar-bg"></div><span class="lbl">–</span></div>`;
    return `<div class="area"><span>${esc(L(AREA_NAMES[a]))}</span><div class="bar-bg"><div class="bar-fg" style="width:${Math.max(6, v.score * 100).toFixed(0)}%;background:${scoreColor(v.score)}"></div></div><span class="lbl" style="color:${scoreColor(v.score)}">${esc(areaLabel(v.score, lang()))}</span></div>`;
  }).join('')}</div><p class="note" style="margin-top:8px">${esc(t('areasNote'))}</p></div>`;
}
function issueCard(i, m, type, extra = '') {
  const txt = metricText(m.key, type); const d = txt && txt[m.dir];
  const unitOv = m.unitOverride || (m.unit === 'pctBH' ? 'pctBH' : undefined);
  const val = fmtValue(m, lang(), type);
  return `<div class="card issue ${i > 0 ? 'sev2' : ''}">
    <h3><span style="display:flex;align-items:center"><span class="rank">${i + 1}</span>${esc(L(METRIC_NAMES[m.key]))}</span></h3>
    <dl>
      <dt>${esc(t('saw'))}</dt><dd class="saw"><span><b>${esc(val)}</b> · ${esc(t('ideal', { r: fmtRange(m.key, type, lang(), unitOv) }))}${extra}</span>
        ${state.fromHistory ? '' : `<button class="chip" type="button" data-seek="${m.time}">▶ ${esc(t('seeFrame'))} ${esc(fmtTime(m.time))}</button>`}</dd>
      ${d ? `<dt>${esc(t('why'))}</dt><dd>${esc(L(d.why))}</dd>
      <dt>${esc(t('cue'))}</dt><dd class="cue">${esc(L(d.cue))}</dd>
      <dt>${esc(t('drill'))}</dt><dd>${esc(L(d.drill))}</dd>` : ''}
    </dl></div>`;
}
function bindSeeks(root) {
  root.querySelectorAll('[data-seek]').forEach((b) => b.addEventListener('click', () => {
    seekVideo(+b.dataset.seek); $('#resVideo').pause();
    if (window.innerWidth < 960 && !(window.matchMedia('(orientation: landscape)').matches && window.innerHeight < 540)) $('#videoWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}
function renderCoach() {
  const r = state.result, el = $('#tab-coach'); const s = selSwing(); const h = [];
  if (!r.swings.length) { el.innerHTML = `<div class="card"><p>${esc(t('noSwing'))}</p></div>`; return; }
  if (r.slowHint && !state.fromHistory) h.push(`<div class="banner"><span>${esc(t('slowHint'))}</span><span class="seg" id="slowFix"><button type="button" data-v="4">×4</button><button type="button" data-v="8">×8</button></span></div>`);
  if (!s) {
    const types = Object.entries(r.overall.byType).map(([k, n]) => `${L(STROKE_NAMES[k])} ×${n}`).join(' · ');
    h.push(`<div class="card"><div class="sum-line"><span class="big">${esc(t('swingsFound', { n: r.swings.length }))}</span><span class="muted">${esc(types)}</span></div><p class="note" style="margin-top:6px">${esc(L(VIEW_NOTES[r.view.key]))}</p></div>`);
    h.push(areasHtml(r.overall.areas));
    h.push(`<h3 style="margin:6px 2px 0">${esc(t('topIssues'))}</h3>`);
    if (!r.overall.issues.length) h.push(`<div class="card"><p>${esc(t('noIssues'))}</p></div>`);
    r.overall.issues.forEach((is, i) => {
      const m = { key: is.key, v: is.v, dir: is.dir, unit: is.unit, time: is.frames[0] };
      h.push(issueCard(i, m, is.type, ` · ${esc(L(STROKE_NAMES[is.type]))} · ${esc(t('inSwings', { s: is.swings.join(', ') }))}`));
    });
    if (r.overall.strengths.length) h.push(`<div class="card"><h3>${esc(t('wellDone'))}</h3><ul class="good-list">${r.overall.strengths.map((g) => { const tx = metricText(g.key, g.type); return `<li><span><b>${esc(L(METRIC_NAMES[g.key]))}</b> · ${esc(L(STROKE_NAMES[g.type]))}<br>${esc(tx ? L(tx.good) : '')}</span></li>`; }).join('')}</ul></div>`);
    h.push(consistencyHtml());
  } else {
    h.push(`<div class="card"><div class="type-pick"><b>${esc(t('strokeType'))}</b><select id="typeSel" ${state.fromHistory ? 'disabled' : ''}>${STROKES.map((k) => `<option value="${k}" ${k === s.type ? 'selected' : ''}>${esc(L(STROKE_NAMES[k]))}</option>`).join('')}</select><span class="note">${esc(t('strokeFix'))}</span></div></div>`);
    if (!state.fromHistory) h.push(keyframesHtml(s));
    h.push(areasHtml(s.areas));
    const issues = rankIssues(s, 3);
    h.push(`<h3 style="margin:6px 2px 0">${esc(t('topIssues'))}</h3>`);
    if (!issues.length) h.push(`<div class="card"><p>${esc(t('noIssues'))}</p></div>`);
    issues.forEach((m, i) => h.push(issueCard(i, m, s.type)));
    const good = rankStrengths(s, 3);
    if (good.length) h.push(`<div class="card"><h3>${esc(t('wellDone'))}</h3><ul class="good-list">${good.map((g) => { const tx = metricText(g.key, s.type); return `<li><span><b>${esc(L(METRIC_NAMES[g.key]))}</b> ${esc(fmtValue(g, lang(), s.type))}<br>${esc(tx ? L(tx.good) : '')}</span></li>`; }).join('')}</ul></div>`);
    const weak = Object.values(s.metrics).filter((m) => m.conf < CONF_MIN && m.impact > 0);
    if (weak.length) h.push(`<div class="card"><p class="note"><span class="warn-ico">⚠</span> ${esc(t('angleWarn'))} ${weak.map((m) => esc(L(METRIC_NAMES[m.key]))).join('、')}. ${esc(t('lowConfNote'))}</p></div>`);
  }
  h.push(`<p class="note">${esc(t('heuristicNote'))}</p>`);
  el.innerHTML = h.join('');
  bindSeeks(el);
  el.querySelectorAll('#slowFix button').forEach((b) => b.addEventListener('click', () => { state.slow = b.dataset.v; recompute(); toast(t('slowIs', { n: b.dataset.v })); }));
  const ts = $('#typeSel'); if (ts) ts.addEventListener('change', () => { const sw = selSwing(); state.overrides[sw.key] = ts.value; recompute(); });
  el.querySelectorAll('.kf figure').forEach((f) => f.addEventListener('click', () => { seekVideo(+f.dataset.t); $('#resVideo').pause(); }));
}
function keyframesHtml(s) {
  const kf = state.kf[s.key] || {};
  const isServe = s.type === 'serve' || s.type === 'overhead';
  const items = [[isServe ? 'kfTrophy' : 'kfBack', isServe ? s.idx.trophy : s.idx.b, kf.back], ['kfContact', s.idx.c, kf.contact], ['kfFinish', s.idx.fin, kf.finish]];
  return `<div class="card"><h3>${esc(t('keyframes'))}</h3><div class="kf">${items.map(([lbl, i, src]) => {
    const tt = state.track.t[Math.max(0, i)];
    return `<figure data-t="${tt}">${src ? `<img src="${src}" alt="">` : `<div style="aspect-ratio:${state.aspect};background:var(--surface2);border-radius:10px"></div>`}<figcaption>${esc(t(lbl))} · ${esc(fmtTime(tt))}</figcaption></figure>`;
  }).join('')}</div></div>`;
}
function consistencyHtml() {
  const cons = state.result.consistency; if (!cons.length) return '';
  return `<div class="card"><h3>${esc(t('consistency'))}</h3>${cons.map((g) => `<div style="margin-bottom:8px"><b>${esc(L(STROKE_NAMES[g.type]))} ×${g.count}</b>${g.rows.map((row) => {
    const lbl = row.score >= 0.7 ? t('consHigh') : row.score >= 0.4 ? t('consMid') : t('consLow');
    const name = row.key === 'forwardTime' ? t('forwardTime') : L(METRIC_NAMES[row.key]);
    const sd = row.key === 'forwardTime' ? `±${Math.round(row.sd * 1000)} ms` : row.key === 'wristSpeed' ? `±${row.sd.toFixed(1)}` : row.key === 'contactHeight' ? `±${Math.round(row.sd * 100)}%` : /Turn|elbow|knee/.test(row.key) ? `±${Math.round(row.sd)}°` : `±${Math.round(row.sd * 100)}%`;
    return `<div class="cons-row"><span>${esc(name)} <span class="muted">${esc(sd)}</span></span><span style="color:${scoreColor(row.score)};font-weight:800">${esc(lbl)}</span></div>`;
  }).join('')}</div>`).join('')}</div>`;
}
const METRIC_ORDER = ['unitTurn', 'separation', 'offArm', 'compact', 'trophyElbow', 'trophyElbowHeight', 'tossArm', 'kneeBend', 'legDrive', 'baseWidth', 'contactFront', 'contactHeight', 'contactReach', 'elbowAngle', 'extension', 'chain', 'wristSpeed', 'headStable', 'trunkLean', 'finish', 'recovery'];
function cellVal(m, type) {
  let v = esc(fmtValue(m, lang(), type));
  if (m.key === 'wristSpeed' && Number.isFinite(m.rel)) v += `<br><span class="muted small">${esc(t('speedRel', { p: Math.round(m.rel * 100) }))}</span>`;
  if (m.key === 'chain' && m.times) v += `<br><span class="muted small">${esc(t('chainTimes', { a: Math.round(m.times[0] * 1000), b: Math.round(m.times[1] * 1000), c: Math.round(m.times[2] * 1000) }))}</span>`;
  return v;
}
function renderMetrics() {
  const r = state.result, el = $('#tab-metrics'); const s = selSwing();
  if (!r.swings.length) { el.innerHTML = ''; return; }
  if (s) {
    const rows = METRIC_ORDER.filter((k) => s.metrics[k]).map((k) => {
      const m = s.metrics[k];
      const dot = Number.isFinite(m.score) && m.impact > 0 ? `<span class="score-dot" style="background:${scoreColor(m.score)}"></span>` : '';
      const unitOv = m.unitOverride || (m.unit === 'pctBH' ? 'pctBH' : undefined);
      return `<tr><td>${dot}${esc(L(METRIC_NAMES[k]))}${m.conf < CONF_MIN ? ` <span class="warn-ico" title="${esc(t('unreliable'))}">⚠</span>` : ''}</td><td class="v">${cellVal(m, s.type)}</td><td>${m.range ? esc(fmtRange(k, s.type, lang(), unitOv)) : '–'}</td><td>${confBadge(m.conf)}${m.conf < CONF_MIN ? `<br><span class="small muted">${esc(t('unreliable'))}</span>` : ''}</td></tr>`;
    }).join('');
    el.innerHTML = `<div class="card" style="overflow-x:auto"><h3>${esc(t('swingN', { n: s.index }))} · ${esc(L(STROKE_NAMES[s.type]))} · ${esc(fmtTime(s.phases.contact))}</h3>
      <table class="mt"><thead><tr><th>${esc(t('metric'))}</th><th>${esc(t('value'))}</th><th>${esc(t('range'))}</th><th>${esc(t('confidence'))}</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="note" style="margin-top:8px">${esc(t('lowConfNote'))} ${esc(t('heuristicNote'))}</p></div>`;
  } else {
    const keys = METRIC_ORDER.filter((k) => r.swings.some((sw) => sw.metrics[k]));
    const head = r.swings.map((sw) => `<th>#${sw.index}<br>${esc(L(STROKE_SHORT[sw.type]))}</th>`).join('');
    const rows = keys.map((k) => `<tr><td>${esc(L(METRIC_NAMES[k]))}</td>${r.swings.map((sw) => {
      const m = sw.metrics[k]; if (!m) return '<td class="muted">–</td>';
      const col = Number.isFinite(m.score) && m.impact > 0 ? scoreColor(m.score) : 'inherit';
      return `<td class="v" style="color:${m.conf < CONF_MIN ? 'var(--muted)' : col}">${esc(fmtValue(m, lang(), sw.type))}${m.conf < CONF_MIN ? ' ⚠' : ''}</td>`;
    }).join('')}</tr>`).join('');
    el.innerHTML = `<div class="card" style="overflow-x:auto"><table class="mt"><thead><tr><th>${esc(t('metric'))}</th>${head}</tr></thead><tbody>${rows}</tbody></table><p class="note" style="margin-top:8px">⚠ ${esc(t('unreliable'))} · ${esc(t('heuristicNote'))}</p></div>`;
  }
}

// ---------- charts ----------
let speedMap = null, angleMap = null, angleRange = null;
function drawCharts() {
  const r = state.result; if (!r || !r.series || state.tab !== 'charts' || state.fromHistory) return;
  const tr = state.track; const sf = r.slowmo;
  const ts = Array.from(r.series.t);
  const sp = Array.from(r.series.speed, (v, i) => tr.ok[i] ? v * sf : NaN), so = Array.from(r.series.speedOff, (v, i) => tr.ok[i] ? v * sf : NaN);
  const ymax = Math.max(1, ...sp.filter(Number.isFinite)) * 1.1;
  const cur = $('#resVideo').currentTime;
  const markers = r.swings.map((s) => ({ x: s.phases.contact, color: s.index === state.sel ? cssVar('--bad') : cssVar('--muted'), label: '#' + s.index }));
  const bands = r.swings.filter((s) => s.index === state.sel).map((s) => ({ a: s.phases.prep, b: s.phases.recovery, color: 'rgba(59,130,246,.10)' }));
  speedMap = lineChart($('#chartSpeed'), {
    x0: ts[0], x1: ts[ts.length - 1], y0: 0, y1: ymax, cursor: cur, markers, bands, xFmt: (v) => v.toFixed(1) + 's', yFmt: (v) => v.toFixed(0),
    series: [{ x: ts, y: so, color: cssVar('--info'), width: 1.2 }, { x: ts, y: sp, color: cssVar('--primary'), width: 2.4 }],
  });
  const s = selSwing() || r.swings[0];
  if (!s) return;
  const a = angleSeries(tr, r.hand, s.idx.lo, s.idx.hi);
  const base = r.series.yawSh[s.idx.lo];
  const turn = []; for (let i = s.idx.lo; i <= s.idx.hi; i++) turn.push(tr.ok[i] ? Math.abs(r.series.yawSh[i] - base) : NaN);
  angleRange = [a.t[0], a.t[a.t.length - 1]];
  const pm = [['prep', '--ph-prep'], ['forward', '--ph-forward'], ['contact', '--ph-contact'], ['recovery', '--ph-recovery']].map(([k, c]) => ({ x: s.phases[k], color: cssVar(c) }));
  const cols = { elbow: '#f59e0b', knee: '#3b82f6', trunk: '#8b5cf6', turn: cssVar('--primary') };
  angleMap = lineChart($('#chartAngles'), {
    x0: a.t[0], x1: a.t[a.t.length - 1], y0: 0, y1: 180, cursor: cur, markers: pm, yTicks: [0, 45, 90, 135, 180], xFmt: (v) => v.toFixed(1) + 's', yFmt: (v) => v + '°',
    series: [{ x: a.t, y: a.elbow, color: cols.elbow }, { x: a.t, y: a.knee, color: cols.knee }, { x: a.t, y: a.trunk, color: cols.trunk }, { x: a.t, y: turn, color: cols.turn }],
  });
  $('#anglesTitle').textContent = `${t('chartAngles')} · #${s.index} ${L(STROKE_SHORT[s.type])}`;
  $('#anglesLegend').innerHTML = [['elbow', cols.elbow], ['knee', cols.knee], ['trunk', cols.trunk], ['shoulderTurn', cols.turn]].map(([k, c]) => `<span><i style="background:${c}"></i>${esc(t(k))}</span>`).join('')
    + [['prep', '--ph-prep'], ['forward', '--ph-forward'], ['contact', '--ph-contact'], ['recovery', '--ph-recovery']].map(([k, c]) => `<span><i style="background:${cssVar(c)};height:10px;width:2px"></i>${esc(L(PHASE_NAMES[k]))}</span>`).join('');
}
for (const [id, get] of [['#chartSpeed', () => speedMap], ['#chartAngles', () => angleMap]]) {
  $(id).addEventListener('click', (ev) => { const m = get(); if (!m) return; const r = ev.currentTarget.getBoundingClientRect(); seekVideo(m.xToValue(ev.clientX - r.left)); $('#resVideo').pause(); });
}

// ---------- compare ----------
let cmpRaf = 0;
function stopCompare() { cancelAnimationFrame(cmpRaf); cmpRaf = 0; }
function renderCompare() {
  const r = state.result, el = $('#tab-compare');
  if (r.swings.length < 2) { el.innerHTML = `<div class="card"><p>${esc(t('needTwo'))}</p></div>${consistencyHtml()}`; return; }
  if (!state.cmp || state.cmp[0] > r.swings.length || state.cmp[1] > r.swings.length) {
    const s = selSwing() || r.swings[0];
    const other = r.swings.find((o) => o !== s && o.type === s.type) || r.swings.find((o) => o !== s);
    state.cmp = [s.index, other.index];
  }
  const opt = (sel) => r.swings.map((s) => `<option value="${s.index}" ${s.index === sel ? 'selected' : ''}>#${s.index} ${esc(L(STROKE_NAMES[s.type]))}</option>`).join('');
  const A = r.swings[state.cmp[0] - 1], B = r.swings[state.cmp[1] - 1];
  const keys = METRIC_ORDER.filter((k) => A.metrics[k] || B.metrics[k]);
  const rows = keys.map((k) => {
    const a = A.metrics[k], b = B.metrics[k];
    const cls = (x, y) => (x && y && Number.isFinite(x.score) && Number.isFinite(y.score) && x.impact > 0 && Math.abs(x.score - y.score) > 0.1) ? (x.score > y.score ? 'better' : 'worse') : '';
    return `<tr><td>${esc(L(METRIC_NAMES[k]))}</td><td class="v ${cls(a, b)}">${a ? esc(fmtValue(a, lang(), A.type)) + (a.conf < CONF_MIN ? ' ⚠' : '') : '–'}</td><td class="v ${cls(b, a)}">${b ? esc(fmtValue(b, lang(), B.type)) + (b.conf < CONF_MIN ? ' ⚠' : '') : '–'}</td></tr>`;
  }).join('');
  el.innerHTML = `<div class="card"><div class="cmp-sel"><label>A <select id="cmpA">${opt(state.cmp[0])}</select></label><label>B <select id="cmpB">${opt(state.cmp[1])}</select></label></div>
    ${state.fromHistory ? '' : `<div class="cmp-anim" style="margin-top:10px"><div><canvas id="cmpCa"></canvas><div class="cap">A · #${A.index}</div></div><div><canvas id="cmpCb"></canvas><div class="cap">B · #${B.index}</div></div></div><p class="note" style="margin-top:6px">${esc(t('compareNote'))}</p>`}</div>
    <div class="card" style="overflow-x:auto"><table class="mt"><thead><tr><th>${esc(t('metric'))}</th><th>A #${A.index}</th><th>B #${B.index}</th></tr></thead><tbody>${rows}</tbody></table></div>${consistencyHtml()}`;
  $('#cmpA').addEventListener('change', (e) => { state.cmp[0] = +e.target.value; renderCompare(); });
  $('#cmpB').addEventListener('change', (e) => { state.cmp[1] = +e.target.value; renderCompare(); });
  if (!state.fromHistory) animateCompare(A, B);
}
function animateCompare(A, B) {
  stopCompare();
  const tr = state.track, r = state.result;
  const pre = Math.max(A.phases.contact - A.phases.prep, B.phases.contact - B.phases.prep, 0.4) + 0.15;
  const post = Math.max(A.phases.recovery - A.phases.contact, B.phases.recovery - B.phases.contact, 0.3) + 0.25;
  const span = pre + post; const t0 = performance.now();
  const ca = $('#cmpCa'), cb = $('#cmpCb');
  const draw = (c, s, rel) => {
    const { ctx, w, h } = fitCanvas(c, (c.clientWidth || 160) * 4 / 3);
    ctx.clearRect(0, 0, w, h);
    const p = poseAt(tr, s.phases.contact + rel); if (!p) return;
    // normalise: hips at centre, body height to 80% of the canvas
    const hip = [(p[23 * 3] + p[24 * 3]) / 2, (p[23 * 3 + 1] + p[24 * 3 + 1]) / 2];
    const scale = 0.8 * h / Math.max(0.05, r.BHimg); // BHimg is in frame-height units
    const ar = state.aspect;
    const rect = { x: w / 2 - hip[0] * ar * scale, y: h * 0.52 - hip[1] * scale, w: ar * scale, h: scale };
    drawSkeleton(ctx, p, rect, r.hand, { lineWidth: 4, body: cssVar('--text'), off: '#3b82f6', dom: effectiveDark() ? '#d4ec3c' : '#7a9a00' });
    ctx.fillStyle = cssVar('--muted'); ctx.font = 'bold 12px system-ui'; ctx.fillText((rel >= 0 ? '+' : '') + Math.round(rel / r.slowmo * 1000) + ' ms', 8, 16);
    if (Math.abs(rel) < 0.03 * r.slowmo) { ctx.fillStyle = cssVar('--bad'); ctx.fillText(t('kfContact'), 8, 32); }
  };
  const loop = () => {
    const el = ((performance.now() - t0) / 1000 * 0.35) % span; // 0.35x speed
    const rel = (el - pre) * r.slowmo;
    draw(ca, A, rel); draw(cb, B, rel);
    cmpRaf = requestAnimationFrame(loop);
  };
  loop();
}

// ---------- video, overlay, timeline ----------
const rv = $('#resVideo'), ov = $('#overlay');
let picRect = { x: 0, y: 0, w: 1, h: 1 };
function layoutOverlay() {
  const wrap = $('#videoWrap');
  const vw = rv.clientWidth, vh = rv.clientHeight;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  ov.style.width = vw + 'px'; ov.style.height = vh + 'px';
  ov.style.left = rv.offsetLeft + 'px'; ov.style.top = rv.offsetTop + 'px';
  ov.width = Math.round(vw * dpr); ov.height = Math.round(vh * dpr);
  const ar = (rv.videoWidth || 16) / (rv.videoHeight || 9);
  let w = vw, h = vw / ar; if (h > vh) { h = vh; w = vh * ar; }
  picRect = { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
  void wrap;
}
rv.addEventListener('loadedmetadata', layoutOverlay);
let skelOn = true;
$('#btnSkel').addEventListener('click', (e) => { skelOn = !skelOn; e.currentTarget.classList.toggle('on', skelOn); drawOverlay(); });
function drawOverlay() {
  const ctx = ov.getContext('2d'); const dpr = ov.width / Math.max(1, ov.clientWidth || 1);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, ov.width, ov.height);
  if (!state.track || state.fromHistory) return;
  const tt = rv.currentTime;
  if (state.picking) {
    // show every detected person to choose from
    const fi = nearestFrame(tt); const f = state.frames[fi];
    if (f) f.poses.forEach((p) => drawSkeleton(ctx, p.img, picRect, 'R', { body: '#ffeb3b', off: '#ffeb3b', dom: '#ffeb3b' }));
    return;
  }
  if (!skelOn) return;
  const r = state.result;
  const p = poseAt(state.track, tt);
  if (p) {
    // wrist trail over the last 0.35 s (scaled for slow-motion)
    const S = sideIdx(r.hand); const pts = [];
    for (let k = 12; k >= 0; k--) { const q = poseAt(state.track, tt - k * 0.03 * r.slowmo); if (q) pts.push([q[S.wr * 3], q[S.wr * 3 + 1]]); }
    drawTrail(ctx, pts, picRect);
    drawSkeleton(ctx, p, picRect, r.hand);
  }
}
function nearestFrame(tt) { const fr = state.frames; let best = 0, bd = 1e9; for (let i = 0; i < fr.length; i++) { const d = Math.abs(fr[i].t - tt); if (d < bd) { bd = d; best = i; } } return best; }
function phaseAt(tt) {
  for (const s of state.result.swings) {
    const P = s.phases; if (tt < P.ready || tt > P.end) continue;
    const isServe = s.type === 'serve' || s.type === 'overhead';
    if (Math.abs(tt - P.contact) < 0.5 / state.sampleFps + 0.01) return { s, k: 'contact' };
    if (tt < P.prep) return { s, k: 'ready' };
    if (tt < P.forward) return { s, k: isServe ? 'prepServe' : 'prep' };
    if (tt < P.contact) return { s, k: 'forward' };
    if (tt < P.recovery) return { s, k: 'follow' };
    return { s, k: 'recovery' };
  }
  return null;
}
function drawTimeline() {
  const c = $('#timeline'); if (!state.result || state.fromHistory) return;
  const { ctx, w, h } = fitCanvas(c, c.clientHeight || 46);
  const [a, b] = [state.track.t[0], state.track.t[state.track.n - 1]];
  const X = (x) => (x - a) / Math.max(1e-6, b - a) * w;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = cssVar('--surface2'); ctx.fillRect(0, 12, w, h - 24);
  for (const s of state.result.swings) {
    const P = s.phases; const isSel = s.index === state.sel;
    const segs = [[P.ready, P.prep, '--ph-ready'], [P.prep, P.forward, '--ph-prep'], [P.forward, P.contact, '--ph-forward'], [P.contact, P.recovery, '--ph-follow'], [P.recovery, P.end, '--ph-recovery']];
    ctx.globalAlpha = state.sel && !isSel ? 0.35 : 0.9;
    for (const [x0, x1, col] of segs) { ctx.fillStyle = cssVar(col); ctx.fillRect(X(x0), 16, Math.max(1, X(x1) - X(x0)), h - 32); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = cssVar('--ph-contact'); ctx.fillRect(X(P.contact) - 1.5, 8, 3, h - 16);
    ctx.fillStyle = cssVar('--text'); ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('#' + s.index, X(P.contact), 9);
  }
  const x = X(rv.currentTime); ctx.fillStyle = cssVar('--text'); ctx.fillRect(x - 1, 0, 2, h);
  ctx.beginPath(); ctx.moveTo(x - 6, h); ctx.lineTo(x + 6, h); ctx.lineTo(x, h - 7); ctx.fill();
}
function timelineSeek(ev) {
  const c = $('#timeline'); const r = c.getBoundingClientRect();
  const [a, b] = [state.track.t[0], state.track.t[state.track.n - 1]];
  seekVideo(a + (ev.clientX - r.left) / r.width * (b - a));
}
$('#timeline').addEventListener('pointerdown', (ev) => {
  if (!state.track) return; rv.pause(); timelineSeek(ev);
  const c = ev.currentTarget; c.setPointerCapture(ev.pointerId);
  const mv = (e) => timelineSeek(e); const up = () => { c.removeEventListener('pointermove', mv); c.removeEventListener('pointerup', up); };
  c.addEventListener('pointermove', mv); c.addEventListener('pointerup', up);
});
let seekBusy = false, seekWant = null;
async function seekVideo(tt) {
  if (!state.track) return;
  const [a, b] = [state.track.t[0], state.track.t[state.track.n - 1]];
  tt = Math.max(a, Math.min(b, tt));
  seekWant = tt; if (seekBusy) return; seekBusy = true;
  while (seekWant !== null) { const x = seekWant; seekWant = null; try { await seekTo(rv, x); } catch (e) { /* ignore */ } onTime(); }
  seekBusy = false;
}
function onTime() {
  if (!state.track) return;
  const [a, b] = [state.track.t[0], state.track.t[state.track.n - 1]];
  const tt = rv.currentTime;
  $('#scrub').value = String(Math.round((tt - a) / Math.max(1e-6, b - a) * 1000));
  $('#timeNow').textContent = fmtTime(tt);
  const ph = state.result && phaseAt(tt);
  $('#phaseNow').textContent = ph ? `#${ph.s.index} ${L(STROKE_SHORT[ph.s.type])} · ${L(PHASE_NAMES[ph.k])}` : '';
  drawOverlay(); drawTimeline();
  if (state.tab === 'charts' && !$('#tab-charts').hidden) drawCharts();
}
$('#scrub').addEventListener('input', (e) => {
  rv.pause(); const [a, b] = [state.track.t[0], state.track.t[state.track.n - 1]];
  seekVideo(a + (+e.target.value / 1000) * (b - a));
});
rv.addEventListener('seeked', onTime);
rv.addEventListener('play', () => { setPlayIcon(true); tick(); });
rv.addEventListener('pause', () => { setPlayIcon(false); onTime(); });
function setPlayIcon(playing) { $('#playIco').innerHTML = playing ? '<path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/>' : '<path d="M8 5v14l11-7z" fill="currentColor"/>'; }
function tick() {
  if (rv.paused) return;
  const b = state.track ? state.track.t[state.track.n - 1] : rv.duration;
  if (rv.currentTime >= b) { rv.currentTime = state.track.t[0]; }
  onTime();
  if (typeof rv.requestVideoFrameCallback === 'function') rv.requestVideoFrameCallback(tick); else requestAnimationFrame(tick);
}
$('#btnPlay').addEventListener('click', () => {
  if (rv.paused) { if (state.track && rv.currentTime >= state.track.t[state.track.n - 1] - 0.05) rv.currentTime = state.track.t[0]; rv.play().catch(() => {}); } else rv.pause();
});
$$('#segRate button').forEach((b) => b.addEventListener('click', () => { setSeg('#segRate', b.dataset.v); rv.playbackRate = +b.dataset.v; }));
setSeg('#segRate', '1');
const stepFrame = (d) => { rv.pause(); seekVideo(rv.currentTime + d / (state.sampleFps || 30)); };
$('#btnPrev').addEventListener('click', () => stepFrame(-1));
$('#btnNext').addEventListener('click', () => stepFrame(1));
$('#btnContact').addEventListener('click', () => {
  const r = state.result; if (!r || !r.swings.length) return;
  let s = selSwing();
  if (!s) s = r.swings.find((x) => x.phases.contact > rv.currentTime + 0.05) || r.swings[0];
  rv.pause(); seekVideo(s.phases.contact);
});
document.addEventListener('keydown', (e) => {
  if ($('#results').hidden || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if (e.key === 'ArrowLeft') { stepFrame(-1); e.preventDefault(); } else if (e.key === 'ArrowRight') { stepFrame(1); e.preventDefault(); } else if (e.key === ' ') { $('#btnPlay').click(); e.preventDefault(); }
});

// player picking
function startPicking() {
  state.picking = true; rv.pause(); $('#videoWrap').classList.add('picking'); $('#tapMsg').hidden = false; drawOverlay();
}
ov.addEventListener('click', (ev) => {
  if (!state.picking) return;
  const r = ov.getBoundingClientRect();
  const x = (ev.clientX - r.left - picRect.x) / picRect.w, y = (ev.clientY - r.top - picRect.y) / picRect.h;
  state.picking = false; $('#videoWrap').classList.remove('picking'); $('#tapMsg').hidden = true;
  if (x < 0 || x > 1 || y < 0 || y > 1) { drawOverlay(); return; }
  state.anchor = { frame: nearestFrame(rv.currentTime), x, y };
  state.overrides = {};
  recompute(); toast(t('playerChanged'));
});

// key frames (small JPEGs with the skeleton) captured from the decoding video
async function captureKeyframes() {
  const r = state.result; if (!r || state.fromHistory) return;
  const token = state.recId + ':' + r.hand + ':' + r.swings.map((s) => s.key + s.type).join(',');
  state.kfToken = token;
  const list = r.swings.slice(0, 12);
  for (const s of list) {
    if (state.kfToken !== token) return;
    const isServe = s.type === 'serve' || s.type === 'overhead';
    const want = { back: isServe ? s.idx.trophy : s.idx.b, contact: s.idx.c, finish: s.idx.fin };
    const out = {};
    for (const [k, i] of Object.entries(want)) {
      const tt = state.track.t[Math.max(0, i)];
      try {
        out[k] = await captureFrame(work, tt, 240, (ctx, w, h) => drawSkeleton(ctx, poseAt(state.track, tt), { x: 0, y: 0, w, h }, r.hand, { lineWidth: 2.5 }));
      } catch (e) { /* ignore */ }
    }
    if (state.kfToken !== token) return;
    state.kf[s.key] = out;
    if (state.tab === 'coach' && selSwing() === s) renderCoach();
  }
}

// ---------- summary image ----------
$('#btnSave').addEventListener('click', async () => {
  const r = state.result; if (!r) return;
  const kfs = r.swings.slice(0, 3).map((s) => state.kf[s.key] && state.kf[s.key].contact).filter(Boolean);
  const blob = await renderSummary(r, { fileName: state.file ? state.file.name : '', keyframes: kfs, dark: effectiveDark() });
  if (!blob) return;
  const name = `swing-coach-${new Date().toISOString().slice(0, 10)}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    try { await navigator.share({ files: [file], title: t('summaryTitle') }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(t('savedOk'));
});
$('#btnNew').addEventListener('click', () => { show('home'); });

// ---------- history ----------
function slimResult(r) {
  const { series, ...rest } = r; void series;
  return { ...rest, swings: r.swings.map((s) => { const { F, ...o } = s; void F; return o; }) };
}
async function saveHistory() {
  const r = state.result; if (!r || !r.swings.length || state.fromHistory) return;
  await saveAnalysis({ id: state.recId, date: Date.now(), fileName: state.file ? state.file.name : '', duration: state.trim[1] - state.trim[0], result: slimResult(r) });
}
$('#btnHistory').addEventListener('click', async () => { if (state.abort) return; show('history'); await renderHistory(); });
async function renderHistory() {
  const list = await listAnalyses(); const el = $('#historyList');
  applyI18n($('#history'));
  if (!list.length) { el.innerHTML = `<div class="card"><p class="muted">${esc(t('historyEmpty'))}</p></div>`; $('#btnDelAll').hidden = true; return; }
  $('#btnDelAll').hidden = false;
  el.innerHTML = list.map((rec) => {
    const r = rec.result; const types = Object.entries(r.overall.byType).map(([k, n]) => `${L(STROKE_SHORT[k])}×${n}`).join(' ');
    const d = new Date(rec.date).toLocaleString(getLang() === 'zh' ? 'zh-TW' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
    return `<div class="card hist"><div><div class="t">${esc(d)}</div><div class="s">${esc(rec.fileName || '')} · ${esc(types)} · ${esc(L(VIEW_NAMES[r.view.key]))}</div></div>
      <div class="b"><button class="chip" type="button" data-open="${esc(rec.id)}">${esc(t('open'))}</button><button class="chip danger" type="button" data-del="${esc(rec.id)}">${esc(t('del'))}</button></div></div>`;
  }).join('');
  el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => { await deleteAnalysis(b.dataset.del); renderHistory(); }));
  el.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openHistory(list.find((x) => x.id === b.dataset.open))));
}
function renderHistoryIfOpen() { if (!$('#history').hidden) renderHistory(); }
$('#btnDelAll').addEventListener('click', async () => { if (confirm(t('confirmDelAll'))) { await clearAnalyses(); renderHistory(); } });
function openHistory(rec) {
  if (!rec) return;
  const live = state.recId === rec.id && state.frames && state.track;
  if (live) { state.fromHistory = false; show('results'); layoutOverlay(); renderResults(); return; }
  state.fromHistory = true; state.result = rec.result; state.track = null; state.sel = 0; state.tab = state.tab === 'charts' ? 'coach' : state.tab;
  $('#resVideo').removeAttribute('src'); $('#resVideo').hidden = true; $('#noVideo').hidden = false;
  show('results'); renderResults();
}

function redrawAll() {
  if (!$('#prepare').hidden) drawTrim();
  if (!$('#results').hidden && state.result) { drawOverlay(); drawTimeline(); if (state.tab === 'charts') drawCharts(); if (state.tab === 'compare') renderCompare(); }
}
window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', redrawAll);

// debug/test hook (used by automated tests only)
window.__swingCoach = { state, loadFile, compute, enterResults };
