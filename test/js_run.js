// Runs this tool's core on the synthetic files (same cases as ref_run.py).
const fs = require("fs"), H = require("../src/hspr-core.js");
// typeB "asA": read Type B as an H/V grid, exactly as the reference does (the test files are Type B)
const g = f => H.toGrid(H.parseIES(fs.readFileSync(f, "utf8")), { typeB: process.argv[2] || "asA" });
const t = Date.now();
const lb = H.assessLB({ gL: g("lb.ies"), gR: g("lb_rh.ies"), h: 0.65, sep: 1.4 });
lb.rows.forEach(r => console.log("LB", r.key, +r.value.toFixed(3), +r.points.toFixed(3)));
console.log("LB score", lb.score, lb.rank);
const gh = g("hb.ies");
const hb = H.assessHB({ gL: gh, gR: gh, h: 0.7, sep: 1.3 });
hb.rows.forEach(r => console.log("HB", r.key, +r.value.toFixed(3), +r.points.toFixed(3)));
console.log("HB score", hb.score, hb.rank, "ms", Date.now() - t);
console.log(JSON.stringify(H.system({ lb: lb.score, hb: hb.score })));
