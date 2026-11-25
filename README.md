# HSPRevaluate

Check the HSPR score of a headlamp.

A browser tool that rates a **passing beam (low beam)** and a **driving beam (high beam)** according to the GTB *Headlight Safety Performance Rating (HSPR) – Recommended Practice* (SEP2023), which builds on CIE S 021/E:2011.

Inputs: an IES file per beam (left lamp, optional right lamp), mounting height and lamp separation.
Outputs:
- every criterion value and its points
- the single-function scores (1–5) with verbal rank
- Effective Performance and Mean Effective Performance
- the headlighting system score for manual, automatic or ADB operation

## Use it

Open `index.html` in any modern browser, or use the live page on GitHub Pages. All the calculation code is inside the one file. The look comes from the shared [beamKit](https://jalibakthermk.github.io/beamkit/demo.html) framework, loaded from the portfolio site; offline the page still works, with plain fallback styling.

**Privacy:** IES files are read with the browser's `FileReader` and processed in memory on your machine. The page sends none of your data over the network and stores nothing.

## Method

GTB §4.2 requires the TU Darmstadt software ([HSPR-Software/HSPR](https://github.com/HSPR-Software/HSPR)) for repeatable results. The criterion algorithms here reproduce it, including its search order, nearest-grid lookups, flux integration and rounding. That software also defines the passing-beam and driving-beam zones, which the GTB text takes over from CIE S 021 without restating them.

| Beam | Criterion | Definition |
|---|---|---|
| LB | Zone A | Farthest distance of 1, 3, 5 lx on the road along lines 0, 1.5, 3 m right (mean of 9) |
| LB | Zone B | As Zone A, lines turned 5° to the right |
| LB | Zone C | As Zone A at 250 mm height, lines 3, 4.5, 6 m left |
| LB | Zone D | Lateral reach of 3 lx on the road at 30, 40, 50 m (offside / nearside) |
| LB, HB | Zone E | Lateral reach of 3 lx at 250 mm at 10 and 20 m (offside / nearside) |
| LB | Flux | 45°L–45°R, 15°D–5°U |
| LB | Glare | Weighted flux into x −7.9…+1.3 m, height 0.93…1.62 m at 50 m (5 × 8 weights) |
| HB | Points A–E | Farthest 3 lx along rays from the road origin to (0,h), (−20,h), (0,h+9), (+20,h), (0,h−2) at 100 m |
| HB | Flux | 45°L–45°R, 5°D–10°U |

Illuminance is vertical illuminance on a plane facing the vehicle, summed over the lamps. Intensity comes from the nearest point of the reference's 0.05° grid (45°L–45°R, 15°D–15°U). Beyond that window the edge value is reused, as in the reference.

Scoring, weights, benchmarks and the EP/MEP formulas follow GTB sections 7 and 8. Verbal ranks follow GTB Table 18.

### Where this tool differs from the reference executable

Each of these is flagged on the page when it applies.

| Situation | Reference .exe | This tool |
|---|---|---|
| A Zone A/B/C line never reaches its lux level | Drops that line and every later line from the mean (can inflate the zone value a lot) | Same by default, with a warning and the value when unmet lines count as 0 m; option to count them as 0 m |
| A driving-beam point or width never reaches 3 lx | Stops with an error, or never finishes | Counts 0 m and warns |
| IES Type B file | Read as an H/V (Type A) grid | Converted to Type A geometry (option to read it like the .exe) |
| Candela multiplier / ballast factor ≠ 1 | Ignored | Applied |
| TILT=INCLUDE | Rejected | Read |
| Type C file | Read as an H/V grid (wrong) | Converted (polar axis auto-detected) |
| Passing beam on during driving beam (GTB §6.2) | Not available | Optional, each beam at its own mounting |
| Left-hand traffic | Not available | Mirrors the beams and swaps the lamps |
| Flux solid angle | Every 0.01° cell counts tan²(0.01°) sr | Same by default; option to weight each cell by cos V (the exact solid angle, about 0.3–0.8 % less flux) |
| Verbal rank near a boundary | Rounds to one decimal first, so e.g. 39.6 → Premium | GTB Table 18: 39.6 → Excellent |

## Validation

```bash
cd test
python3 make_ies.py                   # synthetic LB/HB IES files (written as Type B)
node js_run.js                        # this tool, reading Type B like the reference
python3 ref_run.py /path/to/HSPR/src  # reference software, same files
node edge_case.js                     # unmet Zone C lines: reference vs 0 m
node gtb_example.js                   # GTB section 8.4 worked example
```

- On the synthetic files, all 17 criterion values, the points and both scores match the reference software exactly. The same holds for a Type A file, a beam with unmet Zone C lines, and a 3-decimal mounting height (which shifts the reference's glare window).
- `ref_run.py` replaces `scipy.interpolate.interp2d`, which SciPy 1.14 removed, with an equivalent that keeps its linear interpolation, fill value and edge clamping.
- From the GTB §8.4 table values, the driving beam (4.25) and system score (44.1) match. The passing beam gives 4.28 against GTB's 4.27 because GTB rounds its intermediate sum.

## Errors found in the GTB document (SEP2023)

These don't change the passing-beam or driving-beam rating, but they are worth knowing when reading it.

1. **Table 9 (ADB glare): the 1-point and 2-point values are in swapped rows.** The row labelled "2 points = Average − SD" holds 0.28 / 0.35, which are average + SD. The worked example (Table 21: 0.15 lm → 1.79 points, 0.17 lm → 1.96 points) only works with 1 point = 0.28 / 0.35 and 2 points = 0.11 / 0.16.
2. **Equation (2):** the "where:" list has lost its symbols. It should define V (actual value), V₂ (two-point value), V₁ (one-point value) and P (points).
3. **§7.3** says the scores follow from "equations (2) – (4)"; equation (5), the normalisation, is also needed.
4. **§6.1 and §9.1 a)** refer to the operating voltage "as defined in 9.2 d)". In 9.2, d) is a note and the voltage is item e).
5. **§9.1 d)** refers to Figure 13 for the aiming method; the aiming figure is Figure 10.
6. **§6.3.8** refers to "Table 7 and Table 8" for the glare window; it means Figures 7 and 8 ("projected an a 50m wall" should read "on a").
7. **Units:** Table 8 gives the 50 m oncoming flux in [m], and Table 21 gives the oncoming flux and ADB glare in [m]; all three are lumens.
8. **Worked example rounding:** the passing-beam weighted sum is printed as 16.44, while the listed products sum to 16.43. 16.44 would give 4.28, not 4.27. The ADB sums printed as 14.92 / 15.72 / 15.07 recompute to 14.93 / 15.73 / 15.06 (no effect on the 3.06 result). In Table 21 the oncoming ADB glare points (1.79) recompute to 1.76 from the printed 0.15 lm.
9. **Gaps:** the text never states that ADB glare, assessed only at 50 m, is reused in the 100 m and 200 m sums (the example does this). It also refers to CIE S 021 for the passing-beam zones and driving-beam points without defining them.

## Repository layout

- `index.html`: the built tool. Do not edit it directly; run `python3 build.py`.
- `src/hspr-core.js`: IES parser, zone evaluation and scoring, usable in Node and the browser.
- `src/app.html`: page template; `build.py` inlines the core into it.
- `test/`: validation scripts.

## Not covered

Adaptive driving beam (ADB) rating needs the six traffic-scenario light distributions per lamp and is not implemented. You can enter an ADB score obtained elsewhere to get the ADB-mode system score.

## License

GPL-3.0, as a derivative of the GPL-3.0 HSPR reference software by TU Darmstadt. See `LICENSE`.
