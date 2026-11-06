// Reproduces the GTB Recommended Practice SEP2023 worked example (section 8.4) from its table values.
// GTB prints 4.27 / 4.25 / 44.1. Recomputing the passing beam from the Table 19 values gives 4.28:
// unrounded points sum to 16.45 (4.28), GTB's rounded points sum to 16.43 (4.27), and GTB prints 16.44.
const H = require("../src/hspr-core.js");
const lb = [91.9, 130.3, 48.2, 18.0, 17.5, 10.75, 10.75, 2357, 0.54];
const hb = [354.5, 58.5, 33.0, 68.5, 200.5, 10.75, 10.75, 3498];
const score = (crit, vals, b) => {
  const sum = crit.reduce((s, c, i) => s + H.pts(vals[i], c.p1, c.p2) * c.w, 0);
  return [sum, 4 / (b[1] - b[0]) * (sum - b[0]) + 1];
};
const [sumLB, sLB] = score(H.LB_CRIT, lb, H.BENCH.LB), [sumHB, sHB] = score(H.HB_CRIT, hb, H.BENCH.HB);
const sys = H.system({ lb: 4.27, hb: 4.25, adb: 3.06 }).modes.adb;
console.log(`LB sum ${sumLB.toFixed(3)} score ${sLB.toFixed(2)} (GTB 16.44 / 4.27)`);
console.log(`HB sum ${sumHB.toFixed(3)} score ${sHB.toFixed(2)} (GTB 17.75 / 4.25)`);
console.log(`System (ADB mode, from GTB scores) ${sys.score} ${sys.rank} (GTB 44.1 Premium)`);
