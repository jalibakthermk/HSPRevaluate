/* HSPR core: passing beam (LB) and driving beam (HB) rating
   GTB Recommended Practice SEP2023 (CIE S 021/E:2011 zones).
   Criterion algorithms follow the TU Darmstadt / GTB reference software
   (github.com/HSPR-Software/HSPR), including its search order, nearest-grid lookups,
   flux integration and rounding, so results reproduce the reference.

   Coordinates: x right (+) / left (-), y up, z forward along the road.
   Origin on the road surface on the vehicle centre line.
   Lamp grid: H azimuth -45..45 (+ = right), V elevation -15..15, 0.05° step (as the reference). */
(function (root) {
  "use strict";
  const H0 = -45, V0 = -15;
  // numpy: np.arange(-45, 45.05, 0.05) -> step used for values is (start+step)-start
  const DH = (H0 + 0.05) - H0, DV = (V0 + 0.05) - V0;
  const STEP = 0.05, NH = 1801, NV = 601, H1 = 45, V1 = 15;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;

  // numpy-compatible rounding (round half to even, as np.around)
  function rint(x) { const f = Math.floor(x), d = x - f; if (d > 0.5) return f + 1; if (d < 0.5) return f; return (f % 2 === 0) ? f : f + 1; }
  const around = (x, n) => { const k = Math.pow(10, n); return rint(x * k) / k; };

  // ---------- reference statistics (GTB Tables 5, 6, 7, 12, 13, 15) ----------
  const LB_CRIT = [
    { key: "A", name: "Zone A", desc: "Range, lane guidance (straight road)", unit: "m", p1: 71.6, p2: 95.1, w: 1.5 },
    { key: "B", name: "Zone B", desc: "Range on curves (lines turned 5° right)", unit: "m", p1: 71.5, p2: 138.4, w: 1 },
    { key: "C", name: "Zone C", desc: "Range, offside verge pedestrians", unit: "m", p1: 32.7, p2: 48.4, w: 1 },
    { key: "Doff", name: "Zone D offside", desc: "Width, lane guidance (left)", unit: "m", p1: 4.8, p2: 12.5, w: 0.75 },
    { key: "Dnear", name: "Zone D nearside", desc: "Width, lane guidance (right)", unit: "m", p1: 7.6, p2: 16.3, w: 0.75 },
    { key: "Eoff", name: "Zone E offside", desc: "Width, pedestrians at intersections (left)", unit: "m", p1: 5.9, p2: 9.6, w: 0.5 },
    { key: "Enear", name: "Zone E nearside", desc: "Width, pedestrians at intersections (right)", unit: "m", p1: 6.6, p2: 10.5, w: 0.5 },
    { key: "Flux", name: "Luminous flux", desc: "45°L–45°R, 15°D–5°U", unit: "lm", p1: 747.6, p2: 1785.1, w: 1 },
    { key: "Glare", name: "Glare", desc: "Weighted flux into oncoming eye zone at 50 m", unit: "lm", p1: 0.73, p2: 0.27, w: 1 }
  ];
  const HB_CRIT = [
    { key: "PA", name: "Point A", desc: "Range straight ahead", unit: "m", p1: 133.3, p2: 235.0, w: 2 },
    { key: "PB", name: "Point B", desc: "Range 11.3° left", unit: "m", p1: 29.1, p2: 61.0, w: 0.8 },
    { key: "PC", name: "Point C", desc: "Range upward (signs, about 5°U)", unit: "m", p1: 31.5, p2: 63.3, w: 0.4 },
    { key: "PD", name: "Point D", desc: "Range 11.3° right", unit: "m", p1: 41.9, p2: 81.4, w: 0.8 },
    { key: "PE", name: "Point E", desc: "Range downward (road, about 1°D)", unit: "m", p1: 134.2, p2: 207.7, w: 1 },
    { key: "Eoff", name: "Zone E offside", desc: "Width, pedestrians at intersections (left)", unit: "m", p1: 5.5, p2: 10.5, w: 1 },
    { key: "Enear", name: "Zone E nearside", desc: "Width, pedestrians at intersections (right)", unit: "m", p1: 5.9, p2: 10.9, w: 1 },
    { key: "Flux", name: "Luminous flux", desc: "45°L–45°R, 5°D–10°U", unit: "lm", p1: 1114.1, p2: 3126.1, w: 1 }
  ];
  const BENCH = { LB: [11.15, 17.61], HB: [11.31, 19.23], ADB: [9.35, 20.81] };
  const RANKS = ["Standard", "Good", "Advanced", "Excellent", "Premium", "Premium+"];
  const GLARE_W = [
    [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2],
    [0.2, 0.2, 0.5, 0.5, 0.5, 0.5, 0.5, 0.2],
    [0.2, 0.2, 0.5, 1, 1, 1, 0.5, 0.2],
    [0.2, 0.2, 0.5, 1, 1, 1, 0.5, 0.2],
    [0.2, 0.2, 0.5, 0.5, 0.5, 0.5, 0.5, 0.2]
  ];

  // ---------- IES (IESNA LM-63) parser ----------
  function parseIES(text) {
    const lines = text.split(/\r?\n/);
    const meta = {};
    let i = 0, tilt = null;
    for (; i < lines.length; i++) {
      const l = lines[i].trim();
      const m = l.match(/^\[([^\]]+)\]\s*(.*)$/);
      if (m) { meta[m[1].trim()] = m[2]; continue; }
      if (/^TILT\s*=/i.test(l)) { tilt = l.split("=")[1].trim().toUpperCase(); i++; break; }
    }
    if (tilt === null) throw new Error("No TILT= line found, so this is not an IESNA LM-63 file.");
    const toks = lines.slice(i).join(" ").trim().split(/[\s,]+/).filter(Boolean).map(Number);
    let p = 0;
    if (tilt === "INCLUDE") { p += 1; const n = toks[p++]; p += 2 * n; }
    const nLamps = toks[p++], lumens = toks[p++], mult = toks[p++], nV = toks[p++], nH = toks[p++],
      ptype = toks[p++]; p += 4; // units, width, length, height
    const ballast = toks[p++]; p += 2; // file generation type / future use, input watts
    if (!(nV > 0 && nH > 0)) throw new Error("Could not read the number of angles from the IES header.");
    const V = toks.slice(p, p + nV); p += nV;
    const H = toks.slice(p, p + nH); p += nH;
    const cd = toks.slice(p, p + nV * nH);
    if (cd.length !== nV * nH || cd.some(isNaN)) throw new Error(`Expected ${nV * nH} candela values, found ${cd.length}.`);
    const m1 = isFinite(mult) && mult > 0 ? mult : 1, b1 = isFinite(ballast) && ballast > 0 ? ballast : 1;
    const I = []; // I[h][v]
    for (let h = 0; h < nH; h++) { const row = new Float64Array(nV); for (let v = 0; v < nV; v++) row[v] = cd[h * nV + v] * m1 * b1; I.push(row); }
    return { meta, type: ptype, typeName: { 1: "C", 2: "B", 3: "A" }[ptype] || "?", V, H, I, nLamps, lumens, mult: m1, ballast: b1, tiltInclude: tilt === "INCLUDE" };
  }

  // bilinear on a rectilinear source grid; NaN outside (caller fills 0, like the reference's fill_value=0)
  function makeRectSampler(xs, ys, valAt) {
    const xi = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
    const yi = ys.map((y, i) => [y, i]).sort((a, b) => a[0] - b[0]);
    const X = xi.map(a => a[0]), Y = yi.map(a => a[0]);
    const find = (A, t) => { if (t < A[0] - 1e-9 || t > A[A.length - 1] + 1e-9) return -1; let lo = 0, hi = A.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (A[m] <= t) lo = m; else hi = m; } return lo; };
    return (x, y) => {
      if (X.length === 1 || Y.length === 1) {
        const a = X.length === 1 ? 0 : find(X, x), b = Y.length === 1 ? 0 : find(Y, y);
        if (a < 0 || b < 0) return NaN;
        return valAt(xi[a][1], yi[b][1]);
      }
      const a = find(X, x), b = find(Y, y);
      if (a < 0 || b < 0) return NaN;
      const a1 = Math.min(a + 1, X.length - 1), b1 = Math.min(b + 1, Y.length - 1);
      const tx = X[a1] > X[a] ? (x - X[a]) / (X[a1] - X[a]) : 0, ty = Y[b1] > Y[b] ? (y - Y[b]) / (Y[b1] - Y[b]) : 0;
      const q = (ii, jj) => valAt(xi[ii][1], yi[jj][1]);
      return q(a, b) * (1 - tx) * (1 - ty) + q(a1, b) * tx * (1 - ty) + q(a, b1) * (1 - tx) * ty + q(a1, b1) * tx * ty;
    };
  }

  /* Resample an IES onto the HSPR H/V grid (Type A geometry: H = azimuth in the horizontal plane,
     V = elevation). Options:
       flipH   reverse the H axis of the file (files that use + = left)
       aim     vertical shift in degrees (+ = beam raised)
       typeB   "convert" (default): Type B files are converted to Type A geometry;
               "asA": read as an H/V grid like the reference software does
     Type C: converted; polar axis detected from where the peak lies. */
  function toGrid(ies, opts = {}) {
    const flip = !!opts.flipH, aimV = +opts.aim || 0, typeB = opts.typeB || "convert";
    const data = new Float32Array(NH * NV);
    const notes = [];
    let sampler;
    if (ies.type === 1) {
      let Cs = ies.H.slice(), I = ies.I.slice();
      const Gs = ies.V;
      let cMax = Math.max(...Cs);
      const cMin = Math.min(...Cs);
      // full 0..<360 data without the closing 360° plane: add it so interpolation wraps
      if (cMin === 0 && cMax > 180 && cMax < 360) { Cs.push(360); I.push(I[Cs.indexOf(0)]); cMax = 360; }
      const s = makeRectSampler(Cs, Gs, (h, v) => I[h][v]);
      let best = -1, bg = 0;
      I.forEach(r => r.forEach((val, v) => { if (val > best) { best = val; bg = Gs[v]; } }));
      const forward = bg < 45;
      notes.push(forward ? "Type C file read with the polar axis along the optical axis (γ 0° forward, C 0° right, C 90° up). Check the beam preview." : "Type C file read with a vertical polar axis (γ 0° nadir, C 0° forward, C 90° left). Check the beam preview.");
      const wrapC = c => {
        c = ((c % 360) + 360) % 360;
        if (cMax <= 90 + 1e-6 && cMin >= 0) { if (c > 270) c = 360 - c; else if (c > 180) c = c - 180; else if (c > 90) c = 180 - c; }
        else if (cMax <= 180 + 1e-6 && cMin >= 0) { if (c > 180) c = 360 - c; }
        return c;
      };
      sampler = (Hd, Vd) => {
        const h = Hd * D2R, v = Vd * D2R;
        const x = Math.cos(v) * Math.sin(h), y = Math.sin(v), z = Math.cos(v) * Math.cos(h);
        let C, G;
        if (forward) { G = Math.acos(Math.max(-1, Math.min(1, z))) * R2D; C = Math.atan2(y, x) * R2D; }
        else { G = Math.acos(Math.max(-1, Math.min(1, -y))) * R2D; C = Math.atan2(-x, z) * R2D; }
        let val = s(wrapC(C), G);
        if (isNaN(val) && G < 1e-6) val = s(Cs[0], G);
        return val;
      };
    } else {
      const Hs = ies.H, Vs = ies.V;
      const sym = Math.min(...Hs) >= 0 && Math.max(...Hs) <= 90;
      const s = makeRectSampler(Hs, Vs, (h, v) => ies.I[h][v]);
      const base = sym ? (h, v) => s(Math.abs(h), v) : s;
      if (sym) notes.push("H angles cover one side only; the file is mirrored to the other side (LM-63 lateral symmetry).");
      if (ies.type === 2 && typeB === "convert") {
        // Type B: polar axis horizontal (lateral); V = rotation about the lateral axis, H = angle out of that plane
        sampler = (Hd, Vd) => {
          const h = Hd * D2R, v = Vd * D2R;
          const x = Math.cos(v) * Math.sin(h), y = Math.sin(v), z = Math.cos(v) * Math.cos(h);
          return base(Math.asin(Math.max(-1, Math.min(1, x))) * R2D, Math.atan2(y, z) * R2D);
        };
        notes.push("Type B file converted to the azimuth/elevation (Type A) geometry the rating uses. The reference .exe reads it as Type A without converting.");
      } else {
        sampler = base;
        if (ies.type === 2) notes.push("Type B file read as an H/V grid without conversion, as the reference .exe does.");
      }
    }
    if (ies.mult !== 1 || ies.ballast !== 1) notes.push(`Candela multiplier ${ies.mult} and ballast factor ${ies.ballast} applied. The reference .exe ignores both.`);
    let max = 0, pk = [0, 0];
    for (let iv = 0; iv < NV; iv++) {
      const vv = V0 + iv * DV;
      for (let ih = 0; ih < NH; ih++) {
        const hh = H0 + ih * DH;
        let val = sampler(flip ? -hh : hh, vv - aimV);
        if (!(val > 0)) val = 0;
        data[iv * NH + ih] = val;
        if (val > max) { max = val; pk = [hh, vv]; }
      }
    }
    return { data, max, peakH: pk[0], peakV: pk[1], notes };
  }

  function mirrorGrid(g) {
    const d = new Float32Array(g.data.length);
    for (let j = 0; j < NV; j++) for (let i = 0; i < NH; i++) d[j * NH + i] = g.data[j * NH + (NH - 1 - i)];
    return Object.assign({}, g, { data: d });
  }

  // nearest-grid lookup clamped to the grid edge (reference: find_nearest; beyond ±45°/±15° the edge value is used)
  function Inear(g, a, b) {
    let ih = Math.round((a - H0) / DH), iv = Math.round((b - V0) / DV);
    if (ih < 0) ih = 0; else if (ih >= NH) ih = NH - 1;
    if (iv < 0) iv = 0; else if (iv >= NV) iv = NV - 1;
    return g.data[iv * NH + ih];
  }
  // bilinear lookup (reference: glare)
  function Ibil(g, a, b) {
    let fh = (a - H0) / DH, fv = (b - V0) / DV;
    fh = Math.max(0, Math.min(NH - 1.000001, fh)); fv = Math.max(0, Math.min(NV - 1.000001, fv));
    const ih = Math.floor(fh), iv = Math.floor(fv), th = fh - ih, tv = fv - iv, d = g.data;
    return d[iv * NH + ih] * (1 - th) * (1 - tv) + d[iv * NH + ih + 1] * th * (1 - tv) + d[(iv + 1) * NH + ih] * (1 - th) * tv + d[(iv + 1) * NH + ih + 1] * th * tv;
  }

  // vertical illuminance on a plane facing the vehicle at (x,y,z), summed over all lamps
  function Ev(lamps, x, y, z, look = Inear) {
    let E = 0;
    for (const L of lamps) {
      const dx = x - L.x, dy = y - L.y, dz = z;
      const alpha = Math.atan(dx / dz) * R2D;
      const beta = Math.atan(dy / Math.sqrt(dx * dx + dz * dz)) * R2D;
      const d2 = dx * dx + dy * dy + dz * dz;
      E += look(L.g, alpha, beta) / d2 * (dz / Math.sqrt(d2));
    }
    return E;
  }

  const pts = (v, p1, p2) => (v - p1) / (p2 - p1) + 1;
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

  /* Zones A/B/C: farthest forward distance z where E > 1/3/5 lx, searched inward from 400 m in 0.5 m steps.
     Reference behaviour: when a line never exceeds its level, that line and every line after it
     (in lux-then-line order) drop out of the mean. "literal" counts every unmet line as 0 m. */
  function zoneRange(lamps, lines, y, theta = 0, unmet = "reference", lux = [1, 3, 5], start = 400, step = 0.5) {
    const st = Math.sin(theta * D2R), ct = Math.cos(theta * D2R);
    const detail = [];
    let stopped = false;
    for (const lx of lux) for (const x0 of lines) {
      let found = null;
      for (let s = start; s > 0; s -= step) {
        const x = x0 + s * st, z = s * ct;
        if (Ev(lamps, x, y, z) > lx) { found = z; break; }
      }
      detail.push({ lux: lx, line: x0, value: found == null ? 0 : found, status: found == null ? "notfound" : (stopped ? "skipped" : "ok") });
      if (found == null) stopped = true;
    }
    const used = detail.filter(d => d.status === "ok").map(d => d.value);
    const literal = around(mean(detail.map(d => d.value)), 3);
    const refValue = used.length ? around(Math.abs(mean(used)), 3) : 0;
    const flagged = detail.some(d => d.status !== "ok");
    if (unmet === "zero") {
      detail.forEach(d => { if (d.status === "skipped") d.status = "ok"; });
      return { value: literal, detail, warn: flagged ? `${detail.filter(d => d.status === "notfound").length} of ${detail.length} lines never reached their lux level and count as 0 m. The reference software would report ${refValue} m.` : null };
    }
    return { value: refValue, detail, warn: flagged ? (used.length ? `${detail.length - used.length} of ${detail.length} lines left out: a line never reached its lux level, and the reference drops it and every line after it. Counting unmet lines as 0 m gives ${literal} m.` : "No line reached its lux level.") : null };
  }
  // Zones D/E: lateral reach where E > 3 lx, searched inward from ±20 m in 0.1 m steps at each distance
  function zoneWidth(lamps, side, dists, y, lux = 3) {
    const vals = [], detail = [];
    let miss = false;
    for (const z of dists) {
      let found = 0;
      for (let k = 200; k > 0; k--) {
        const x = side * k * 0.1;
        if (Ev(lamps, x, y, z) > lux) { found = Math.abs(x); break; }
      }
      if (!found) miss = true;
      vals.push(found); detail.push({ dist: z, value: found, status: found ? "ok" : "notfound" });
    }
    return { value: around(Math.abs(mean(vals)), 3), detail, warn: miss ? "3 lx not reached at one distance; counted as 0 m (the reference software would not finish)." : null };
  }
  // HB points: along the ray from the road origin towards (dx, dy, 100 m), from 800 m inward, E > 3 lx
  /* Driving-beam point: largest s (800 m down, 0.5 m steps) where E > 3 lx along a ray towards (dx, dy, 100 m).
     Reference: the ray starts on the road at the vehicle centre (oy = 0). oy = h starts it at lamp height instead. */
  function pointRange(lamps, dx, dy, lux = 3, oy = 0) {
    const ry = dy - oy, n = Math.sqrt(dx * dx + ry * ry + 100 * 100);
    for (let s = 800; s > 0; s -= 0.5) {
      if (Ev(lamps, s * dx / n, oy + s * ry / n, s * 100 / n) > lux) return { value: s };
    }
    return { value: 0, warn: "3 lx not reached along this ray; counted as 0 m (the reference software stops with an error)." };
  }

  /* Luminous flux, reproducing the reference: the two lamps of a pair are merged on a grid widened by
     atan(sep/2 / 1000 m) (left lamp at offset 0, right lamp shifted by the extra columns), the merged
     distribution is bilinearly resampled at 0.01° inside the window (nearest value beyond the last
     source column/row) and summed × tan(0.01°)². No cos(V) term, as in the reference. */
  function interpWeights(src, lo, hi, fine, fw) {
    // weights per source index for Σ over fine points of linear interpolation on src[lo..hi-1]
    const W = new Float64Array(src.length);
    const a = lo, b = hi - 1;
    let k = a; // fine points ascend, so the bracket only moves forward
    for (let q = 0; q < fine.length; q++) {
      const t = fine[q], m = fw ? fw[q] : 1; // fw: optional weight per fine point (cos V)
      if (t <= src[a]) { W[a] += m; continue; }
      if (t >= src[b]) { W[b] += m; continue; }
      while (k < b - 1 && src[k + 1] < t) k++;
      const f = (t - src[k]) / (src[k + 1] - src[k]);
      W[k] += (1 - f) * m; W[k + 1] += f * m;
    }
    return W;
  }
  const argNearest = (arr, v) => { let bi = 0, bd = Infinity; for (let i = 0; i < arr.length; i++) { const d = Math.abs(arr[i] - v); if (d < bd) { bd = d; bi = i; } } return bi; };
  const arangeLen = (start, stop, step) => Math.ceil((stop - start) / step);
  function fineAxis(lo, hi) { const st = (lo + 0.01) - lo, n = arangeLen(lo, hi + 0.01, 0.01), o = []; for (let i = 0; i < n; i++) o.push(around(lo + i * st, 2)); return o; }
  const Hgrid = Array.from({ length: NH }, (_, i) => H0 + i * DH), Vgrid = Array.from({ length: NV }, (_, i) => V0 + i * DV);
  /* Flux as the reference total_luminous_flux: 0.01° resample, every cell the flat solid angle tan(0.01°)².
     cosV = true weights each cell by cos(V), the exact solid angle cos V·dH·dV (not the reference method). */
  function fluxPair(gL, gR, sep, vb, cosV = false) {
    const s = Math.atan(0.5 * sep / 1000) * R2D;
    const start = Hgrid[0] - s, stop = Hgrid[NH - 1] + s + DH;
    const N2 = arangeLen(start, stop, DH), dd = (start + DH) - start;
    const lab = Array.from({ length: N2 }, (_, k) => around(start + k * dd, 2));
    const kL = argNearest(lab, -45), kR = argNearest(lab, 45);
    const jL = argNearest(Vgrid, vb[0]), jU = argNearest(Vgrid, vb[1]);
    const fh = fineAxis(-45, 45), fv = fineAxis(vb[0], vb[1]);
    const Wh = interpWeights(lab, kL, kR, fh), Wv = interpWeights(Vgrid, jL, jU, fv, cosV ? fv.map(t => Math.cos(t * D2R)) : null);
    const sr = Math.tan(Math.abs(fh[0] - fh[1]) * D2R) * 25 * Math.tan(Math.abs(fv[0] - fv[1]) * D2R) * 25 / 625;
    let sum = 0;
    const add = (g, off) => { for (let j = jL; j < jU; j++) { const wv = Wv[j]; if (!wv) continue; let r = 0; const base = j * NH; for (let i = 0; i < NH; i++) { const w = Wh[i + off]; if (w) r += g.data[base + i] * w; } sum += r * wv; } };
    add(gL, 0); add(gR, N2 - NH);
    return sum * sr;
  }
  function flux(pairs, vb, cosV = false) {
    const F = around(pairs.reduce((s, p) => s + fluxPair(p.gL, p.gR, p.sep, vb, cosV), 0), 3);
    return { value: around(F, 2), pointsBasis: F };
  }

  // Passing-beam glare (reference compute_lb_glare): window at 50 m, x -7.9..+1.3 m, height 0.93..1.62 m, 5 × 8 weights
  function lampGlare(L) {
    const h = L.y, hres = 0.01, vres = 0.0138, z = 50;
    const lower = around(around(0.93 - h, 2) + h + vres * 0.5, 3), upper = around(around(1.62 - h, 2) + h - vres * 0.5, 3);
    const left = -7.9 + hres * 0.5, right = 1.3 - hres * 0.5;
    const W = Math.trunc(around((right - left) / hres, 0) + 1), Hn = Math.trunc(around((upper - lower) / vres, 0) + 1);
    let total = 0, y = upper;
    for (let r = 0; r < Hn; r++) {
      let x = left;
      const wr = Math.floor(r / (Hn / 5)) % 5;
      for (let c = 0; c < W; c++) {
        const dx = x - L.x, dy = y - L.y;
        const alpha = Math.atan(dx / z) * R2D, beta = Math.atan(dy / Math.sqrt(dx * dx + z * z)) * R2D;
        const d2 = dx * dx + dy * dy + z * z;
        total += Ibil(L.g, alpha, beta) * (hres * vres) / d2 * GLARE_W[wr][Math.floor(c / (W / 8)) % 8];
        x += hres;
      }
      y -= vres;
    }
    return total;
  }

  // lamp set for one beam; lht mirrors the patterns and swaps the lamps (left-hand traffic rated as right-hand)
  function lampsFrom(gL, gR, height, sep, lht) {
    gR = gR || gL;
    if (lht) { const mL = mirrorGrid(gR), mR = mirrorGrid(gL); gL = mL; gR = mR; }
    return [{ g: gL, x: -sep / 2, y: height }, { g: gR, x: sep / 2, y: height }];
  }

  function score(crit, values, bench, warnings) {
    const rows = crit.map(c => {
      const v = values[c.key], basis = v.pointsBasis != null ? v.pointsBasis : v.value;
      const P = around(pts(basis, c.p1, c.p2), 3);
      return Object.assign({}, c, { value: v.value, points: P, weighted: P * c.w, detail: v.detail, warn: v.warn || null });
    });
    const sum = rows.reduce((s, r) => s + r.weighted, 0);
    const N = around(4 / (bench[1] - bench[0]) * (sum - bench[0]) + 1, 2);
    return { rows, sum, score: N, rank: rankSingle(N), warnings: rows.filter(r => r.warn).map(r => `${r.name}: ${r.warn}`).concat(warnings || []) };
  }
  // GTB Table 18 / note: Standard < 1, Good 1–<2, … Premium+ ≥ 5
  const rankSingle = N => RANKS[Math.max(0, Math.min(5, Math.floor(N)))];
  const rankSystem = S => S < 10 ? RANKS[0] : S >= 50 ? RANKS[5] : RANKS[Math.floor(S / 10)];

  /* LB: lb = {gL, gR, h, sep, lht}; opts.unmet = "reference" (default) | "zero"; opts.flux = "reference" (default) | "cosV" */
  function assessLB(lb, opts = {}) {
    const lamps = lampsFrom(lb.gL, lb.gR, lb.h, lb.sep, lb.lht), v = {}, u = opts.unmet || "reference";
    v.A = zoneRange(lamps, [0, 1.5, 3], 0, 0, u);
    v.B = zoneRange(lamps, [0, 1.5, 3], 0, 5, u);
    v.C = zoneRange(lamps, [-3, -4.5, -6], 0.25, 0, u);
    v.Doff = zoneWidth(lamps, -1, [30, 40, 50], 0);
    v.Dnear = zoneWidth(lamps, 1, [30, 40, 50], 0);
    v.Eoff = zoneWidth(lamps, -1, [10, 20], 0.25);
    v.Enear = zoneWidth(lamps, 1, [10, 20], 0.25);
    v.Flux = flux([{ gL: lamps[0].g, gR: lamps[1].g, sep: lb.sep }], [-15, 5], opts.flux === "cosV");
    const g = lampGlare(lamps[0]) + lampGlare(lamps[1]);
    v.Glare = { value: around(g, 3), pointsBasis: g };
    const res = score(LB_CRIT, v, BENCH.LB);
    res.lamps = lamps;
    return res;
  }
  /* HB: hb = {gL, gR, h, sep, lht}; withLB = same shape for the passing beam that stays on (own position) */
  function assessHB(hb, withLB, opts = {}) {
    let lamps = lampsFrom(hb.gL, hb.gR, hb.h, hb.sep, hb.lht);
    const pairs = [{ gL: lamps[0].g, gR: lamps[1].g, sep: hb.sep }];
    if (withLB) {
      const lb = lampsFrom(withLB.gL, withLB.gR, withLB.h, withLB.sep, withLB.lht);
      lamps = lamps.concat(lb);
      pairs.push({ gL: lb[0].g, gR: lb[1].g, sep: withLB.sep });
    }
    const v = {}, h = hb.h, oy = opts.rays === "lamp" ? h : 0;
    v.PA = pointRange(lamps, 0, h, 3, oy);
    v.PB = pointRange(lamps, -20, h, 3, oy);
    v.PC = pointRange(lamps, 0, 9 + h, 3, oy);
    v.PD = pointRange(lamps, 20, h, 3, oy);
    v.PE = pointRange(lamps, 0, h - 2, 3, oy);
    v.Eoff = zoneWidth(lamps, -1, [10, 20], 0.25);
    v.Enear = zoneWidth(lamps, 1, [10, 20], 0.25);
    v.Flux = flux(pairs, [-5, 10], opts.flux === "cosV");
    const res = score(HB_CRIT, v, BENCH.HB);
    res.lamps = lamps;
    return res;
  }

  // GTB section 8: Effective Performance (rounded to 0.01 m as the reference), MEP, system score (0.1)
  function system({ lb, hb, adb }) {
    const EP = { LB: around(5.80 * lb + 64.17, 2), HB: around(11.71 * hb + 141.27, 2) };
    if (adb != null && isFinite(adb)) EP.ADB = around(10.87 * adb + 94.13, 2);
    const modes = { manual: 0.95 * EP.LB + 0.05 * EP.HB, automatic: 0.80 * EP.LB + 0.20 * EP.HB };
    if (EP.ADB != null) modes.adb = 0.30 * EP.LB + 0.20 * EP.HB + 0.50 * EP.ADB;
    const out = {};
    for (const k in modes) { const s = around(0.626 * modes[k] - 36.42, 1); out[k] = { MEP: modes[k], score: s, rank: rankSystem(s) }; }
    return { EP, modes: out };
  }

  // passing-beam orientation check: in right-hand traffic the kink lifts light above H-H on the right
  function kinkCheck(g) {
    let L = 0, R = 0;
    for (let v = 0.2; v <= 1.5; v += 0.1) for (let h = 1; h <= 5; h += 0.1) { R += Inear(g, h, v); L += Inear(g, -h, v); }
    return { left: L, right: R, ratio: (R + 1) / (L + 1) };
  }

  const api = { parseIES, toGrid, mirrorGrid, assessLB, assessHB, system, kinkCheck, Ev, Inear, lampsFrom, LB_CRIT, HB_CRIT, BENCH, RANKS, rankSingle, rankSystem, pts, around, GRID: { STEP, DH, DV, H0, H1, V0, V1, NH, NV }, _internal: { zoneRange, zoneWidth, pointRange, flux, fluxPair, lampGlare } };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.HSPR = api;
})(typeof self !== "undefined" ? self : this);
