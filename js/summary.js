// Shareable summary image (canvas PNG), drawn in the current language.
import { t, L, getLang } from './i18n.js?v=5';
import { STROKE_NAMES, VIEW_NAMES, AREA_NAMES, METRIC_NAMES, metricText, fmtValue, fmtRange, areaLabel, contactVerdicts, racketVerdicts, RACKET_KEYS } from './coach.js?v=5';
import { AREAS } from './analysis.js?v=5';
import { diagramSvg, LIGHT, DARK, contactTopSvg, contactSideSvg, serveReachSvg } from './diagrams.js?v=5';
const svgUrl = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

function wrap(ctx, text, maxW) {
  const out = []; let line = '';
  const tokens = getLang() === 'zh' ? Array.from(text) : text.split(/(\s+)/);
  for (const tk of tokens) {
    const test = line + tk;
    if (ctx.measureText(test).width > maxW && line.trim()) { out.push(line.trim()); line = tk.trimStart(); } else line = test;
  }
  if (line.trim()) out.push(line.trim());
  return out;
}
function loadImg(src) { return new Promise((res) => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }

export async function renderSummary(result, { fileName, keyframes, dark, heightCm = 170 }) {
  const W = 1080, H = 3600; // drawn tall, cropped to the used height at the end
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const col = dark
    ? { bg: '#0c1411', card: '#141f1a', text: '#e6efe9', muted: '#93a69b', line: '#25362e', primary: '#3cba7a', ball: '#d4ec3c', good: '#46c27c', mid: '#e0a43c', bad: '#ef6b57' }
    : { bg: '#f3f6f1', card: '#ffffff', text: '#13201a', muted: '#5a6a61', line: '#dfe6dc', primary: '#1f7a4d', ball: '#c9dd2c', good: '#1f8a4c', mid: '#b7791f', bad: '#c2412d' };
  const font = (w, s) => `${w} ${s}px -apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", "Segoe UI", sans-serif`;
  ctx.fillStyle = col.bg; ctx.fillRect(0, 0, W, H);
  // header band
  const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, col.primary); g.addColorStop(1, dark ? '#2a8f5c' : '#2f9a63');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 170);
  ctx.fillStyle = col.ball; ctx.beginPath(); ctx.arc(W - 110, 85, 52, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(W - 170, 85, 52, -0.75, 0.75); ctx.stroke(); ctx.beginPath(); ctx.arc(W - 50, 85, 52, Math.PI - 0.75, Math.PI + 0.75); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = font(800, 58); ctx.fillText(t('appName'), 56, 92);
  ctx.font = font(600, 28); ctx.fillText(t('summaryTitle') + ' · ' + new Date().toLocaleDateString(getLang() === 'zh' ? 'zh-TW' : 'en-US'), 58, 140);
  let y = 210;
  // clip line
  const byType = result.overall.byType || {};
  const types = Object.entries(byType).map(([k, n]) => `${L(STROKE_NAMES[k])} ×${n}`).join('  ·  ');
  ctx.fillStyle = col.text; ctx.font = font(800, 34); ctx.fillText(types || '-', 56, y);
  ctx.fillStyle = col.muted; ctx.font = font(500, 26);
  ctx.fillText(`${L(VIEW_NAMES[result.view.key])} · ${t('handIs', { h: result.hand === 'L' ? t('handL') : t('handR') })}${fileName ? ' · ' + fileName.slice(0, 32) : ''}`, 56, y + 40);
  y += 80;
  // key frames
  const kfs = (keyframes || []).slice(0, 3);
  const imgs = (await Promise.all(kfs.map(async (k) => ({ im: await loadImg(k.src), ov: k.svg ? await loadImg(svgUrl(k.svg)) : null })))).filter((x) => x.im);
  if (imgs.length) {
    const gap = 16, kw = (W - 112 - gap * (imgs.length - 1)) / imgs.length;
    let kh = 0;
    imgs.forEach(({ im, ov }, i) => {
      const h = Math.min(330, kw * im.height / im.width); kh = Math.max(kh, h);
      const x = 56 + i * (kw + gap);
      ctx.save(); roundRect(ctx, x, y, kw, h, 18); ctx.clip(); ctx.drawImage(im, x, y, kw, h); if (ov) ctx.drawImage(ov, x, y, kw, h); ctx.restore();
    });
    y += kh + 30;
  }
  // areas
  ctx.fillStyle = col.text; ctx.font = font(800, 32); ctx.fillText(t('areas'), 56, y + 10); y += 36;
  const areas = result.overall.areas;
  for (const a of AREAS) {
    const v = areas[a]; ctx.font = font(600, 26); ctx.fillStyle = col.text; ctx.fillText(L(AREA_NAMES[a]), 56, y + 26);
    ctx.fillStyle = col.line; roundRect(ctx, 330, y + 8, 520, 22, 11); ctx.fill();
    if (v) {
      const sc = v.score; ctx.fillStyle = sc >= 0.72 ? col.good : sc >= 0.5 ? col.mid : col.bad;
      roundRect(ctx, 330, y + 8, Math.max(22, 520 * sc), 22, 11); ctx.fill();
      ctx.fillStyle = col.text; ctx.font = font(700, 24); ctx.fillText(areaLabel(sc, getLang()), 870, y + 27);
    } else { ctx.fillStyle = col.muted; ctx.font = font(500, 22); ctx.fillText('–', 870, y + 27); }
    y += 42;
  }
  y += 34;
  // contact point: all swings on the maps + verdicts in cm
  {
    const pal = dark ? DARK : LIGHT, opt = { hand: result.hand, lang: getLang(), palette: pal };
    const pt = (s) => ({ n: s.index, type: s.type, fwd: s.metrics.contactFront && s.metrics.contactFront.v, lat: s.metrics.contactFront && s.metrics.contactFront.lat, level: s.metrics.contactHeight && s.metrics.contactHeight.v, reach: s.metrics.contactReach && s.metrics.contactReach.v });
    const ground = result.swings.filter((s) => s.metrics.contactFront || s.metrics.contactHeight), serves = result.swings.filter((s) => s.metrics.contactReach);
    const svgs = [];
    if (ground.length) { const cf = ground.map((s) => s.metrics.contactFront).filter(Boolean); const faded = cf.length && cf.reduce((a, m) => a + m.conf, 0) / cf.length < 0.45; svgs.push(contactTopSvg(ground.map(pt), { ...opt, faded })); svgs.push(contactSideSvg(ground.map(pt), opt)); }
    if (serves.length) svgs.push(serveReachSvg(serves.map(pt), opt));
    const verd = contactVerdicts(result.swings, heightCm, getLang());
    if (svgs.length || verd.length) {
      ctx.fillStyle = col.text; ctx.font = font(800, 32); ctx.fillText((getLang() === 'zh' ? '🎯 擊球點分析' : '🎯 Contact point'), 56, y + 10); y += 30;
      const ims = await Promise.all(svgs.slice(0, 3).map((x) => loadImg(svgUrl(x))));
      const k = Math.max(2, ims.length), iw = (W - 112 - 20) / k, ih = iw * 230 / 300;
      ctx.fillStyle = col.card; roundRect(ctx, 56, y, W - 112, ih + 20, 22); ctx.fill();
      ims.forEach((im, i) => { if (im) ctx.drawImage(im, 56 + 10 + i * iw, y + 10, iw - 6, ih * (iw - 6) / iw); });
      y += ih + 34;
      ctx.font = font(600, 23);
      for (const v of verd) {
        ctx.fillStyle = v.ok ? col.good : v.lowConf ? col.muted : col.bad; ctx.fillText(v.ok ? '✓' : v.lowConf ? '•' : '→', 60, y + 22);
        ctx.fillStyle = col.text;
        for (const ln of wrap(ctx, v.text, W - 150).slice(0, 3)) { ctx.fillText(ln, 92, y + 22); y += 32; }
        y += 6;
      }
      y += 36;
    }
  }
  // racket
  {
    const verd = racketVerdicts(result.swings, getLang()).filter((v) => !v.lowConf).slice(0, 6);
    if (verd.length) {
      const pal = dark ? DARK : LIGHT;
      ctx.fillStyle = col.text; ctx.font = font(800, 32); ctx.fillText((getLang() === 'zh' ? '🎾 拍面與拍頭' : '🎾 Racket'), 56, y + 10); y += 30;
      const svgs = [];
      for (const k of ['racketFace', 'swingPath', 'racketHeadHeight', 'serveDrop']) {
        const s = result.swings.find((x) => x.metrics[k] && x.metrics[k].conf >= 0.45); if (!s || svgs.length >= 2) continue;
        svgs.push(diagramSvg(s.metrics[k], s.type, { hand: result.hand, lang: getLang(), palette: pal, good: !(s.metrics[k].score < 0.75) }));
      }
      if (svgs.length) {
        const ims = await Promise.all(svgs.map((x) => loadImg(svgUrl(x))));
        const iw = (W - 112 - 20) / 2, ih = iw * 200 / 300;
        ctx.fillStyle = col.card; roundRect(ctx, 56, y, W - 112, ih + 20, 22); ctx.fill();
        ims.forEach((im, i) => { if (im) ctx.drawImage(im, 66 + i * iw, y + 10, iw - 6, ih * (iw - 6) / iw); });
        y += ih + 34;
      }
      ctx.font = font(600, 23);
      for (const v of verd) {
        ctx.fillStyle = v.ok ? col.good : col.bad; ctx.fillText(v.ok ? '✓' : '→', 60, y + 22); ctx.fillStyle = col.text;
        for (const ln of wrap(ctx, v.text, W - 150).slice(0, 3)) { ctx.fillText(ln, 92, y + 22); y += 32; }
        y += 6;
      }
      y += 36;
    }
  }
  // top issues
  ctx.fillStyle = col.text; ctx.font = font(800, 32); ctx.fillText(t('topIssues'), 56, y + 10); y += 30;
  const issues = result.overall.issues.slice(0, 3);
  if (!issues.length) { ctx.font = font(500, 26); ctx.fillStyle = col.muted; ctx.fillText(t('noIssues'), 56, y + 30); y += 50; }
  const pal = dark ? DARK : LIGHT;
  const dgs = await Promise.all(issues.map((is) => {
    const sw = result.swings[is.swings[0] - 1]; const m = { ...((sw && sw.metrics[is.key]) || { key: is.key }), v: is.v };
    const svg = diagramSvg(m, is.type, { hand: result.hand, lang: getLang(), palette: pal });
    return svg ? loadImg(svgUrl(svg)) : null;
  }));
  issues.forEach((is, i) => {
    const txt = metricText(is.key, is.type); const d = txt && txt[is.dir];
    const top = y + 10, dw = 390, dh = 260;
    ctx.fillStyle = col.card; roundRect(ctx, 56, top, W - 112, dh + 20, 22); ctx.fill();
    const tx0 = dgs[i] ? 56 + dw + 34 : 110, tw = W - 56 - tx0 - 24;
    if (dgs[i]) ctx.drawImage(dgs[i], 66, top + 10, dw, dh);
    ctx.fillStyle = i === 0 ? col.bad : col.mid; ctx.beginPath(); ctx.arc(tx0 + 18, top + 42, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = font(800, 22); ctx.textAlign = 'center'; ctx.fillText(String(i + 1), tx0 + 18, top + 50); ctx.textAlign = 'left';
    let ty = top + 50;
    ctx.fillStyle = col.text; ctx.font = font(800, 27);
    for (const ln of wrap(ctx, L(METRIC_NAMES[is.key]), tw - 48).slice(0, 2)) { ctx.fillText(ln, tx0 + 48, ty); ty += 34; }
    ctx.fillStyle = col.muted; ctx.font = font(600, 21); ctx.fillText(L(STROKE_NAMES[is.type]), tx0 + 48, ty); ty += 34;
    ctx.font = font(500, 21);
    for (const ln of wrap(ctx, `${fmtValue({ v: is.v, unit: is.unit || metricUnit(is.key) }, getLang(), is.type)} · ${t('ideal', { r: fmtRange(is.key, is.type, getLang(), is.unit === 'pctBH' ? 'pctBH' : undefined) })}`, tw).slice(0, 2)) { ctx.fillText(ln, tx0, ty); ty += 30; }
    if (d) {
      ty += 6; ctx.fillStyle = col.primary; ctx.font = font(700, 23);
      for (const ln of wrap(ctx, L(d.cue), tw).slice(0, 3)) { ctx.fillText(ln, tx0, ty); ty += 32; }
    }
    y = Math.max(top + dh + 20, ty) + 16;
  });
  // strengths
  y += 10;
  if (result.overall.strengths.length) {
    ctx.fillStyle = col.text; ctx.font = font(800, 30); ctx.fillText(t('wellDone'), 56, y + 14); y += 26;
    for (const s of result.overall.strengths.slice(0, 2)) {
      const txt = metricText(s.key, s.type);
      ctx.fillStyle = col.good; ctx.font = font(800, 26); ctx.fillText('✓', 60, y + 34);
      ctx.fillStyle = col.text; ctx.font = font(500, 25); ctx.fillText((txt ? L(txt.good) : L(METRIC_NAMES[s.key])).slice(0, 60), 100, y + 34); y += 42;
    }
  }
  y += 30;
  ctx.fillStyle = col.muted; ctx.font = font(500, 20);
  ctx.fillText(t('privacy'), 56, y + 20);
  ctx.fillText('ywchen0711.github.io/tennis-coach', 56, y + 48);
  const out = document.createElement('canvas'); out.width = W; out.height = Math.min(H, Math.max(1350, y + 76));
  const o2 = out.getContext('2d'); o2.fillStyle = col.bg; o2.fillRect(0, 0, W, out.height); o2.drawImage(c, 0, 0);
  return new Promise((res) => out.toBlob((b) => res(b), 'image/png'));
}
function metricUnit(key) { return ({ unitTurn: 'deg', separation: 'deg', trophyElbow: 'deg', kneeBend: 'deg', elbowAngle: 'deg', trunkLean: 'deg', contactHeight: 'level', chain: 'order', baseWidth: 'ratio', offArm: 'pct', finish: 'pct', extension: 'pct', wristSpeed: 'speed' })[key] || 'pctBH'; }
export { metricUnit };
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
