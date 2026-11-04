/* HSPR core — passing beam (LB) and driving beam (HB) rating
   Port of the TU Darmstadt / GTB open-source HSPR software (github.com/HSPR-Software/HSPR),
   GTB Recommended Practice SEP2023 (CIE S 021/E:2011 zones).
   Coordinates: x right (+) / left (-), y up, z forward along road; origin = road surface on vehicle axis.
   Lamp grid: H azimuth (-45..45, + = right), V elevation (-15..15), 0.05° step (as reference). */
(function (root) {
  "use strict";
  const STEP = 0.05, H0 = -45, H1 = 45, V0 = -15, V1 = 15;
  const NH = Math.round((H1 - H0) / STEP) + 1, NV = Math.round((V1 - V0) / STEP) + 1;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;

  // ---------- reference statistics (GTB Tables 5,6,7,12,13,15) ----------
  const LB_CRIT = [
    { key: "A", name: "Zone A", desc: "Range, lane guidance (straight road)", unit: "m", p1: 71.6, p2: 95.1, w: 1.5, avg: 83.4, sd: 11.8 },
    { key: "B", name: "Zone B", desc: "Range on curves (5° right)", unit: "m", p1: 71.5, p2: 138.4, w: 1, avg: 105.0, sd: 33.5 },
    { key: "C", name: "Zone C", desc: "Range, offside verge pedestrians", unit: "m", p1: 32.7, p2: 48.4, w: 1, avg: 40.6, sd: 7.9 },
    { key: "Doff", name: "Zone D offside", desc: "Width, lane guidance (left)", unit: "m", p1: 4.8, p2: 12.5, w: 0.75, avg: 8.6, sd: 3.9 },
    { key: "Dnear", name: "Zone D nearside", desc: "Width, lane guidance (right)", unit: "m", p1: 7.6, p2: 16.3, w: 0.75, avg: 12.0, sd: 4.3 },
    { key: "Eoff", name: "Zone E offside", desc: "Width, pedestrians at intersections (left)", unit: "m", p1: 5.9, p2: 9.6, w: 0.5, avg: 7.8, sd: 1.8 },
    { key: "Enear", name: "Zone E nearside", desc: "Width, pedestrians at intersections (right)", unit: "m", p1: 6.6, p2: 10.5, w: 0.5, avg: 8.5, sd: 2.0 },
    { key: "Flux", name: "Luminous flux", desc: "45°L–45°R, 15°D–5°U", unit: "lm", p1: 747.6, p2: 1785.1, w: 1, avg: 1266.4, sd: 518.7 },
    { key: "Glare", name: "Glare", desc: "Weighted flux into oncoming eye zone at 50 m", unit: "lm", p1: 0.73, p2: 0.27, w: 1, avg: 0.50, sd: 0.23 }
  ];
  const HB_CRIT = [
    { key: "PA", name: "Point A", desc: "Range straight ahead", unit: "m", p1: 133.3, p2: 235.0, w: 2, avg: 184.2, sd: 50.9 },
    { key: "PB", name: "Point B", desc: "Range 11.3° left", unit: "m", p1: 29.1, p2: 61.0, w: 0.8, avg: 45.1, sd: 15.9 },
    { key: "PC", name: "Point C", desc: "Range upward (signs, ~5°U)", unit: "m", p1: 31.5, p2: 63.3, w: 0.4, avg: 47.4, sd: 15.9 },
    { key: "PD", name: "Point D", desc: "Range 11.3° right", unit: "m", p1: 41.9, p2: 81.4, w: 0.8, avg: 61.7, sd: 19.8 },
    { key: "PE", name: "Point E", desc: "Range downward (road, ~1°D)", unit: "m", p1: 134.2, p2: 207.7, w: 1, avg: 170.9, sd: 36.7 },
    { key: "Eoff", name: "Zone E offside", desc: "Width, pedestrians at intersections (left)", unit: "m", p1: 5.5, p2: 10.5, w: 1, avg: 8.0, sd: 2.5 },
    { key: "Enear", name: "Zone E nearside", desc: "Width, pedestrians at intersections (right)", unit: "m", p1: 5.9, p2: 10.9, w: 1, avg: 8.4, sd: 2.5 },
    { key: "Flux", name: "Luminous flux", desc: "45°L–45°R, 5°D–10°U", unit: "lm", p1: 1114.1, p2: 3126.1, w: 1, avg: 2120.1, sd: 1006.0 }
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
    if (tilt === null) throw new Error("No TILT= line found — not an IESNA LM-63 file.");
    let toks = lines.slice(i).join(" ").trim().split(/[\s,]+/).filter(Boolean).map(Number);
    let p = 0;
    if (tilt === "INCLUDE") { p += 1; const n = toks[p++]; p += 2 * n; }
    const nLamps = toks[p++], lumens = toks[p++], mult = toks[p++], nV = toks[p++], nH = toks[p++],
      ptype = toks[p++]; p += 4; // units, width, length, height
    const ballast = toks[p++]; p += 2; // file gen type / future, input watts
    if (!(nV > 0 && nH > 0)) throw new Error("Could not read number of angles from IES header.");
    const V = toks.slice(p, p + nV); p += nV;
    const H = toks.slice(p, p + nH); p += nH;
    const cd = toks.slice(p, p + nV * nH);
    if (cd.length !== nV * nH || cd.some(isNaN)) throw new Error(`Expected ${nV * nH} candela values, found ${cd.length}.`);
    const k = (isFinite(mult) && mult > 0 ? mult : 1) * (isFinite(ballast) && ballast > 0 ? ballast : 1);
    const I = []; // I[h][v]
    for (let h = 0; h < nH; h++) { const row = new Float64Array(nV); for (let v = 0; v < nV; v++) row[v] = cd[h * nV + v] * k; I.push(row); }
    return { meta, type: ptype, typeName: { 1: "C", 2: "B", 3: "A" }[ptype] || "?", V, H, I, nLamps, lumens, mult };
  }

  // bilinear on a rectilinear (sorted) source grid; returns NaN when outside
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

  /* Resample an IES onto the HSPR H/V grid (0.05°).
     opts.mirror: flip left/right; opts.aim: vertical shift in degrees (negative = beam lowered);
     opts.aimH: horizontal shift. Type A/B used as H/V grids directly (as the reference software does);
     Type C converted (polar axis auto-detected: vertical or along optical axis). */
  function toGrid(ies, opts = {}) {
    const mirror = !!opts.mirror, aimV = +opts.aim || 0, aimH = +opts.aimH || 0;
    const data = new Float32Array(NH * NV);
    let sampler, note = "";
    if (ies.type === 1) {
      const Cs = ies.H, Gs = ies.V;
      const cMax = Math.max(...Cs), cMin = Math.min(...Cs);
      const s = makeRectSampler(Cs, Gs, (h, v) => ies.I[h][v]);
      // detect polar axis: peak gamma near 90 → vertical axis (nadir=0); near 0 → forward axis
      let best = -1, bg = 0;
      ies.I.forEach(r => r.forEach((val, v) => { if (val > best) { best = val; bg = Gs[v]; } }));
      const forward = bg < 45;
      note = forward ? "Type C, polar axis along optical axis (γ=0 forward, C0 right, C90 up)" : "Type C, vertical polar axis (γ=0 nadir, C0 forward, C90 left)";
      const wrapC = c => {
        c = ((c % 360) + 360) % 360;
        if (cMax <= 90 + 1e-6 && cMin >= 0) { if (c > 270) c = 360 - c; else if (c > 180) c = c - 180; else if (c > 90) c = 180 - c; }
        else if (cMax <= 180 + 1e-6 && cMin >= 0) { if (c > 180) c = 360 - c; }
        if (c > cMax && cMax < 360 && Math.abs(c - 360) < 1e-6) c = 0;
        return c;
      };
      sampler = (Hd, Vd) => {
        const h = Hd * D2R, v = Vd * D2R;
        const x = Math.cos(v) * Math.sin(h), y = Math.sin(v), z = Math.cos(v) * Math.cos(h);
        let C, G;
        if (forward) { G = Math.acos(Math.max(-1, Math.min(1, z))) * R2D; C = Math.atan2(y, x) * R2D; }
        else { G = Math.acos(Math.max(-1, Math.min(1, -y))) * R2D; C = Math.atan2(-x, z) * R2D; }
        let c = wrapC(C), val = s(c, G);
        if (isNaN(val) && G < 1e-6) val = s(Cs[0], G);
        return val;
      };
    } else {
      const H = ies.H, V = ies.V;
      const sym = Math.min(...H) >= 0 && Math.max(...H) <= 90;
      const s = makeRectSampler(H, V, (h, v) => ies.I[h][v]);
      sampler = sym ? (h, v) => s(Math.abs(h), v) : s;
      note = `Type ${ies.typeName} (H/V grid)` + (sym ? ", one-sided H data mirrored" : "");
    }
    let max = 0, pk = [0, 0];
    for (let iv = 0; iv < NV; iv++) {
      const vv = V0 + iv * STEP;
      for (let ih = 0; ih < NH; ih++) {
        const hh = H0 + ih * STEP;
        let val = sampler(mirror ? -(hh - aimH) : hh - aimH, vv - aimV);
        if (!(val > 0)) val = 0; // interp2d fill_value = 0 outside the source data
        data[iv * NH + ih] = val;
        if (val > max) { max = val; pk = [hh, vv]; }
      }
    }
    return { data, max, peakH: pk[0], peakV: pk[1], note };
  }

  // nearest-grid lookup with edge clamping (reference: find_nearest on the 0.05° grid)
  function Inear(g, a, b) {
    let ih = Math.round((a - H0) / STEP), iv = Math.round((b - V0) / STEP);
    if (ih < 0) ih = 0; else if (ih >= NH) ih = NH - 1;
    if (iv < 0) iv = 0; else if (iv >= NV) iv = NV - 1;
    return g.data[iv * NH + ih];
  }
  // bilinear lookup (reference uses it for glare)
  function Ibil(g, a, b) {
    let fh = (a - H0) / STEP, fv = (b - V0) / STEP;
    fh = Math.max(0, Math.min(NH - 1.000001, fh)); fv = Math.max(0, Math.min(NV - 1.000001, fv));
    const ih = Math.floor(fh), iv = Math.floor(fv), th = fh - ih, tv = fv - iv, d = g.data;
    return d[iv * NH + ih] * (1 - th) * (1 - tv) + d[iv * NH + ih + 1] * th * (1 - tv) + d[(iv + 1) * NH + ih] * (1 - th) * tv + d[(iv + 1) * NH + ih + 1] * th * tv;
  }

  // vertical illuminance (on plane facing the vehicle) at point (x,y,z) from all lamps
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

  // Zones A/B/C: farthest distance (searching from 400 m inward, 0.5 m steps) where E > 1/3/5 lx
  function zoneRange(lamps, lines, y, theta = 0, lux = [1, 3, 5], start = 400, step = 0.5) {
    const vals = [], detail = [];
    const st = Math.sin(theta * D2R), ct = Math.cos(theta * D2R);
    for (const lx of lux) for (const x0 of lines) {
      let found = 0;
      for (let s = start; s > 0; s -= step) {
        const x = x0 + s * st, z = s * ct;
        if (Ev(lamps, x, y, z) > lx) { found = z; break; }
      }
      vals.push(found); detail.push({ lux: lx, line: x0, value: found });
    }
    return { value: mean(vals), detail };
  }
  // Zones D/E: lateral width — search from ±20 m inward (0.1 m) where E > 3 lx, at given distances
  function zoneWidth(lamps, side, dists, y, lux = 3) {
    const vals = [], detail = [];
    for (const z of dists) {
      let found = 0;
      for (let k = 200; k > 0; k--) { // 20.0 → 0.1
        const x = side * k * 0.1;
        if (Ev(lamps, x, y, z) > lux) { found = Math.abs(x); break; }
      }
      vals.push(found); detail.push({ dist: z, value: found });
    }
    return { value: mean(vals), detail };
  }
  // HB points: along ray from road origin in direction (dx, dy, 100); from 800 m inward, E > 3 lx
  function pointRange(lamps, dx, dy, lux = 3) {
    const n = Math.sqrt(dx * dx + dy * dy + 100 * 100);
    for (let s = 800; s > 0; s -= 0.5) {
      const x = s * dx / n, y = s * dy / n, z = s * 100 / n;
      if (Ev(lamps, x, y, z) > lux) return s;
    }
    return 0;
  }
  // Luminous flux in box (reference: sum I·ΔH·ΔV in radians, no cos V term)
  function flux(lamps, hb, vb) {
    let F = 0;
    for (const L of lamps) {
      const i0 = Math.round((hb[0] - H0) / STEP), i1 = Math.round((hb[1] - H0) / STEP);
      const j0 = Math.round((vb[0] - V0) / STEP), j1 = Math.round((vb[1] - V0) / STEP);
      let s = 0;
      for (let j = j0; j <= j1; j++) {
        const wj = (j === j0 || j === j1) ? 0.5 : 1;
        for (let i = i0; i <= i1; i++) s += L.g.data[j * NH + i] * wj * ((i === i0 || i === i1) ? 0.5 : 1);
      }
      F += s;
    }
    const dA = Math.pow(Math.tan(STEP * D2R), 2);
    return F * dA;
  }
  // Passing-beam glare: oncoming driver eye zone at 50 m, x -7.9..1.3 m, y 0.93..1.62 m, 5x8 weights
  function lbGlare(lamps) {
    const hres = 0.01, vres = 0.0138, z = 50;
    const lower = 0.93 + vres / 2, upper = 1.62 - vres / 2, left = -7.9 + hres / 2, right = 1.3 - hres / 2;
    const W = Math.round((right - left) / hres) + 1, Hn = Math.round((upper - lower) / vres) + 1;
    let total = 0;
    for (const L of lamps) {
      let y = upper;
      for (let r = 0; r < Hn; r++) {
        let x = left;
        const wr = Math.floor(r / (Hn / 5));
        for (let c = 0; c < W; c++) {
          const dx = x - L.x, dy = y - L.y;
          const alpha = Math.atan(dx / z) * R2D, beta = Math.atan(dy / Math.sqrt(dx * dx + z * z)) * R2D;
          const d2 = dx * dx + dy * dy + z * z;
          total += Ibil(L.g, alpha, beta) * (hres * vres) / d2 * GLARE_W[wr][Math.floor(c / (W / 8))];
          x += hres;
        }
        y -= vres;
      }
    }
    return total;
  }

  function score(crit, values, bench) {
    const rows = crit.map(c => {
      const v = values[c.key].value, P = pts(v, c.p1, c.p2);
      return Object.assign({}, c, { value: v, points: P, weighted: P * c.w, detail: values[c.key].detail });
    });
    const sum = rows.reduce((s, r) => s + r.weighted, 0);
    const N = 4 / (bench[1] - bench[0]) * (sum - bench[0]) + 1;
    return { rows, sum, score: N, rank: rankSingle(N) };
  }
  const rankSingle = N => RANKS[Math.max(0, Math.min(5, Math.floor(N)))];
  const rankSystem = S => S < 10 ? RANKS[0] : S >= 50 ? RANKS[5] : RANKS[Math.floor(S / 10)];

  function lampsFrom(gL, gR, height, sep) {
    return [{ g: gL, x: -sep / 2, y: height }, { g: gR || gL, x: sep / 2, y: height }];
  }

  function assessLB(gL, gR, height, sep) {
    const lamps = lampsFrom(gL, gR, height, sep), v = {};
    v.A = zoneRange(lamps, [0, 1.5, 3], 0);
    v.B = zoneRange(lamps, [0, 1.5, 3], 0, 5);
    v.C = zoneRange(lamps, [-3, -4.5, -6], 0.25);
    v.Doff = zoneWidth(lamps, -1, [30, 40, 50], 0);
    v.Dnear = zoneWidth(lamps, 1, [30, 40, 50], 0);
    v.Eoff = zoneWidth(lamps, -1, [10, 20], 0.25);
    v.Enear = zoneWidth(lamps, 1, [10, 20], 0.25);
    v.Flux = { value: flux(lamps, [-45, 45], [-15, 5]) };
    v.Glare = { value: lbGlare(lamps) };
    return score(LB_CRIT, v, BENCH.LB);
  }
  function assessHB(gL, gR, height, sep) {
    const lamps = lampsFrom(gL, gR, height, sep), v = {}, h = height;
    v.PA = { value: pointRange(lamps, 0, h) };
    v.PB = { value: pointRange(lamps, -20, h) };
    v.PC = { value: pointRange(lamps, 0, 9 + h) };
    v.PD = { value: pointRange(lamps, 20, h) };
    v.PE = { value: pointRange(lamps, 0, h - 2) };
    v.Eoff = zoneWidth(lamps, -1, [10, 20], 0.25);
    v.Enear = zoneWidth(lamps, 1, [10, 20], 0.25);
    v.Flux = { value: flux(lamps, [-45, 45], [-5, 10]) };
    return score(HB_CRIT, v, BENCH.HB);
  }
  // combine passing beam into driving beam (real-driving scenario: LB stays on with HB)
  function addGrids(a, b) { const d = new Float32Array(a.data.length); for (let i = 0; i < d.length; i++) d[i] = a.data[i] + b.data[i]; return { data: d }; }

  // GTB section 8: effective performance, MEP, system score
  function system({ lb, hb, adb }) {
    const EP = { LB: 5.80 * lb + 64.17, HB: 11.71 * hb + 141.27 };
    if (adb != null && isFinite(adb)) EP.ADB = 10.87 * adb + 94.13;
    const modes = {
      manual: 0.95 * EP.LB + 0.05 * EP.HB,
      automatic: 0.80 * EP.LB + 0.20 * EP.HB
    };
    if (EP.ADB != null) modes.adb = 0.30 * EP.LB + 0.20 * EP.HB + 0.50 * EP.ADB;
    const out = {};
    for (const k in modes) { const s = 0.626 * modes[k] - 36.42; out[k] = { MEP: modes[k], score: s, rank: rankSystem(s) }; }
    return { EP, modes: out };
  }

  // passing-beam orientation sanity check: RHT kink lifts light above HH on the right
  function kinkCheck(g) {
    let L = 0, R = 0;
    for (let v = 0.2; v <= 1.5; v += 0.1) for (let h = 1; h <= 5; h += 0.1) { R += Inear(g, h, v); L += Inear(g, -h, v); }
    return { left: L, right: R, ratio: (R + 1) / (L + 1) };
  }

  const api = { parseIES, toGrid, assessLB, assessHB, addGrids, system, kinkCheck, Ev, Inear, lampsFrom, LB_CRIT, HB_CRIT, BENCH, RANKS, rankSingle, rankSystem, pts, GRID: { STEP, H0, H1, V0, V1, NH, NV }, _internal: { zoneRange, zoneWidth, pointRange, flux, lbGlare } };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.HSPR = api;
})(typeof self !== "undefined" ? self : this);
