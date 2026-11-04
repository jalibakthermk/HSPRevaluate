// Reproduces the GTB Recommended Practice SEP2023 worked example (section 8.4).
// Expected: passing beam 4.27, driving beam 4.25, ADB-mode system score 44.1 (Premium).
const H = require("../src/hspr-core.js");
const lb = [91.9, 130.3, 48.2, 18.0, 17.5, 10.75, 10.75, 2357, 0.54];
const hb = [354.5, 58.5, 33.0, 68.5, 200.5, 10.75, 10.75, 3498];
const score = (crit, vals, b) => {
  const sum = crit.reduce((s, c, i) => s + H.pts(vals[i], c.p1, c.p2) * c.w, 0);
  return 4 / (b[1] - b[0]) * (sum - b[0]) + 1;
};
const sLB = score(H.LB_CRIT, lb, H.BENCH.LB), sHB = score(H.HB_CRIT, hb, H.BENCH.HB);
const sys = H.system({ lb: 4.27, hb: 4.25, adb: 3.06 }).modes.adb;
console.log(`LB ${sLB.toFixed(2)} (GTB 4.27)  HB ${sHB.toFixed(2)} (GTB 4.25)  system ${sys.score.toFixed(1)} ${sys.rank} (GTB 44.1 Premium)`);
