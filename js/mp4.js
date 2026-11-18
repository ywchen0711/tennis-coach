// Reads the video track's frame rate from an MP4 / MOV (iPhone) file header without
// loading the whole file: walks the boxes, reads moov, then mdhd timescale + stts deltas.
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts']);

async function readBytes(file, start, n) {
  const buf = await file.slice(start, Math.min(file.size, start + n)).arrayBuffer();
  return new DataView(buf);
}
function type4(dv, o) { return String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3)); }
function boxSize(dv, o, end) {
  let size = dv.getUint32(o), hdr = 8;
  if (size === 1) { size = Number(dv.getBigUint64(o + 8)); hdr = 16; } else if (size === 0) size = end - o;
  return { size, hdr };
}

export async function probeVideo(file) {
  try {
    // find moov at top level
    let off = 0, moov = null;
    for (let guard = 0; off < file.size && guard < 200; guard++) {
      const h = await readBytes(file, off, 16);
      if (h.byteLength < 8) break;
      let size = h.getUint32(0); const t = type4(h, 4);
      if (size === 1) size = Number(h.getBigUint64(8)); else if (size === 0) size = file.size - off;
      if (size < 8) break;
      if (t === 'moov') { if (size > 64e6) return null; moov = await readBytes(file, off, size); break; }
      off += size;
    }
    if (!moov) return null;
    const tracks = [];
    const walk = (dv, start, end, cur) => {
      let o = start;
      while (o + 8 <= end) {
        const { size, hdr } = boxSize(dv, o, end); const t = type4(dv, o + 4);
        if (size < 8 || o + size > end) break;
        if (t === 'trak') { const tr = {}; tracks.push(tr); walk(dv, o + hdr, o + size, tr); }
        else if (CONTAINERS.has(t)) walk(dv, o + hdr, o + size, cur);
        else if (cur && t === 'hdlr') cur.handler = type4(dv, o + hdr + 8);
        else if (cur && t === 'mdhd') {
          const v = dv.getUint8(o + hdr);
          if (v === 1) { cur.timescale = dv.getUint32(o + hdr + 20); cur.duration = Number(dv.getBigUint64(o + hdr + 24)); }
          else { cur.timescale = dv.getUint32(o + hdr + 12); cur.duration = dv.getUint32(o + hdr + 16); }
        } else if (cur && t === 'stts') {
          const n = dv.getUint32(o + hdr + 4); let samples = 0, best = 0, bestDelta = 0, total = 0;
          for (let i = 0; i < n && i < 50000; i++) {
            const c = dv.getUint32(o + hdr + 8 + i * 8), d = dv.getUint32(o + hdr + 12 + i * 8);
            samples += c; total += c * d; if (c > best) { best = c; bestDelta = d; }
          }
          cur.samples = samples; cur.delta = bestDelta; cur.total = total;
        } else if (cur && t === 'tkhd') {
          const v = dv.getUint8(o + hdr); const wOff = o + hdr + (v === 1 ? 88 : 76);
          if (wOff + 8 <= o + size) { cur.w = dv.getUint32(wOff) / 65536; cur.h = dv.getUint32(wOff + 4) / 65536; }
        }
        o += size;
      }
    };
    walk(moov, 8, moov.byteLength, null);
    const v = tracks.find((t) => t.handler === 'vide' && t.timescale && t.delta);
    if (!v) return null;
    const fpsMode = v.timescale / v.delta;
    const fpsAvg = v.total ? v.samples * v.timescale / v.total : fpsMode;
    return { fps: Math.round(fpsMode * 100) / 100, fpsAvg, frames: v.samples, duration: v.duration / v.timescale };
  } catch (e) {
    return null;
  }
}
