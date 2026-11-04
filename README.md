# HSPRevaluate

Check the HSPR score of a headlamp.

A browser tool that rates a **passing beam (low beam)** and a **driving beam (high beam)** according to the GTB *Headlight Safety Performance Rating (HSPR) – Recommended Practice* (SEP2023), which builds on CIE S 021/E:2011.

Inputs: an IES file per beam (left lamp, optional right lamp), mounting height and lamp separation.
Outputs: every criterion value and its points, the single-function scores (1–5) with verbal rank, Effective Performance, Mean Effective Performance and the headlighting system score for manual, automatic or ADB operation.

## Use it

Open `index.html` in any modern browser. It is one self-contained file, so it also works offline (fonts fall back to system fonts) and on GitHub Pages.

**Privacy:** IES files are read with the browser's `FileReader` and processed in memory on your machine. The page makes no network requests with your data and stores nothing.

## Method

The criterion algorithms are a JavaScript port of the TU Darmstadt reference software ([HSPR-Software/HSPR](https://github.com/HSPR-Software/HSPR)), which defines the passing-beam and driving-beam zones that the GTB text takes over from CIE S 021.

| Beam | Criterion | Definition |
|---|---|---|
| LB | Zone A | Farthest distance of 1, 3, 5 lx on the road along lines 0, 1.5, 3 m right (mean of 9) |
| LB | Zone B | As Zone A, lines rotated 5° to the right |
| LB | Zone C | As Zone A at 250 mm height, lines 3, 4.5, 6 m left |
| LB | Zone D | Lateral reach of 3 lx on the road at 30, 40, 50 m (offside / nearside) |
| LB, HB | Zone E | Lateral reach of 3 lx at 250 mm at 10 and 20 m (offside / nearside) |
| LB | Flux | 45°L–45°R, 15°D–5°U |
| LB | Glare | Weighted flux into x −7.9…+1.3 m, height 0.93…1.62 m at 50 m (5 × 8 weights) |
| HB | Points A–E | Farthest 3 lx along rays from the road origin to (0,h), (−20,h), (0,h+9), (+20,h), (0,h−2) at 100 m |
| HB | Flux | 45°L–45°R, 5°D–10°U |

Illuminance is vertical illuminance on a plane facing the vehicle, summed over both lamps. Intensity is resampled to the reference software's 0.05° grid (45°L–45°R, 15°D–15°U).
Scoring, weighting, benchmarks and EP/MEP formulas follow GTB sections 7 and 8.

Differences from the reference executable:
- The IES candela multiplier and ballast factor are applied. The reference ignores them.
- Type C files are converted to H/V. The reference reads every file as an H/V grid.

## Validation

```bash
cd test
python3 make_ies.py                   # synthetic LB/HB IES files
node js_run.js                        # this tool
python3 ref_run.py /path/to/HSPR/src  # reference software, same files
node gtb_example.js                   # GTB section 8.4 worked example
```

All 17 criterion values match the reference software to three decimals. The GTB example reproduces 4.27 / 4.25 and a system score of 44.1 (Premium).

## Repository layout

- `index.html`: the built tool. Do not edit it directly; run `python3 build.py`.
- `src/hspr-core.js`: IES parser, zone evaluation and scoring, usable in Node and the browser.
- `src/app.html`: page template; `build.py` inlines the core into it.
- `test/`: validation scripts.

## Not covered

Adaptive driving beam (ADB) rating needs the six traffic-scenario light distributions per lamp and is not implemented. An ADB score from elsewhere can be entered to get the ADB-mode system score.

## License

GPL-3.0, as a derivative of the GPL-3.0 HSPR reference software by TU Darmstadt. See `LICENSE`.
