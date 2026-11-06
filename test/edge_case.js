// Unmet Zone C lines (test/dark_left.ies): reference behaviour vs counting them as 0 m.
// The reference .exe gives Zone C 48.0 m, 1.975 points and a passing-beam score of 0.87 for this file.
const fs = require("fs"), H = require("../src/hspr-core.js");
const g = H.toGrid(H.parseIES(fs.readFileSync("dark_left.ies", "utf8")), { typeB: "asA" });
for (const unmet of ["reference", "zero"]) {
  const r = H.assessLB({ gL: g, gR: g, h: 0.65, sep: 1.4 }, { unmet });
  const c = r.rows.find(x => x.key === "C");
  console.log(`${unmet.padEnd(9)} Zone C ${c.value} m, ${c.points} pts, LB score ${r.score}`);
}
