# CELESTIUM — Python Command-Line Executor (`celestium-cli`)

**Explore Beyond Earth. Navigate Beyond Limits.**

Standalone, zero-dependency Python 3.10+ command-line astrodynamics, autonomous pulsar navigation (XNAV), RF/optical link-budget, Space Sonar CRLB, and NASA/JPL Horizons ephemeris workbench. Produces identical deterministic equations and outputs as the CELESTIUM web workbench and accepts exported Scenario JSON configs directly from the website.

---

## Quick Start (Zero Dependencies)

No external `pip install` packages are required — uses only Python 3.10+ standard library.

```bash
# 1. Inspect available data sources, pulsars (ATNF/NICER), and spacecraft (ISRO/NASA)
python3 run_celestium.py sources

# 2. Run a complete benchmark scenario (earth-to-mars | voyager-xnav | earth-to-moon)
python3 run_celestium.py run --scenario earth-to-mars

# 3. Run a scenario exported from the CELESTIUM website (Reports -> Scenario JSON)
python3 run_celestium.py run --config path/to/mars-transfer-config.json --csv-dir ./exports

# 4. Launch interactive command-line workbench
python3 run_celestium.py interactive
```

Optional editable install (`celestium` shell command):

```bash
pip install -e .
celestium run --scenario voyager-xnav --sync-horizons
```

---

## Subcommands Reference

| Command | Purpose | Example |
|---|---|---|
| `run` | End-to-end trajectory + Hohmann + Lambert + XNAV + Comms pipeline | `python3 run_celestium.py run --scenario earth-to-moon --csv-dir out/` |
| `propagate` | Dormand-Prince RK45 / fixed RK4 propagation with J2, SRP, 3rd-body | `python3 run_celestium.py propagate --body earth --r0 7000,0,0 --v0 0,7.546,0 --j2` |
| `lambert` | Universal-Variable Stumpff Lambert BVP solver | `python3 run_celestium.py lambert --body earth --r1 5000,10000,2100 --r2 -14600,2500,7000 --tof-sec 3600` |
| `hohmann` | Two-impulse Hohmann transfer calculator | `python3 run_celestium.py hohmann --body sun` |
| `xnav` | 4-state WLS + 8-state EKF Autonomous Pulsar Navigation | `python3 run_celestium.py xnav --dsn-blackout --obs-sec 3600` |
| `comms` | Deep-space RF/Optical FSPL, C/N0, Eb/N0, and link margin | `python3 run_celestium.py comms --range-km 149597870.7 --freq-ghz 8.42` |
| `sonar` | Space Sonar active LiDAR / Ka-band RF link budget & CRLB | `python3 run_celestium.py sonar --modality fmcw-coherent-lidar` |
| `ephemeris` | Live NASA/JPL Horizons vector fetch (`ssd.jpl.nasa.gov`) | `python3 run_celestium.py ephemeris --target -31 --date 2026-11-21` |
| `sources` | Print ATNF/NICER pulsar catalog, spacecraft catalog & central bodies | `python3 run_celestium.py sources` |
| `interactive` | Interactive terminal prompt workbench | `python3 run_celestium.py interactive` |

---

## Architecture

```text
python-cli/
├── pyproject.toml
├── requirements.txt
├── run_celestium.py
├── celestium/
│   ├── constants.py        # Exact SI speed of light, Planck/Boltzmann, μ, J2, J2000 elements
│   ├── sources.py          # JPL Horizons client + parser, ATNF/NICER pulsars, ISRO/NASA spacecraft
│   ├── orbital.py          # RK45/RK4 propagation, COE with singularities, Hohmann, Lambert
│   ├── xnav.py             # 4-state WLS + condition number + 8-state EKF (Joseph covariance)
│   ├── communications.py   # FSPL, C/N0, Eb/N0, light-time, Earth occultation & conjunction checks
│   ├── space_sonar.py      # Optical LiDAR / Ka-band PN RF link budget & CRLB benchmark
│   ├── scenarios.py        # Benchmark presets, pipeline runner, JSON/CSV exporters
│   └── cli.py              # argparse CLI & interactive workbench
└── tests/
    └── test_celestium.py   # unittest mathematical verification suite
```

## Verification Tests

```bash
python3 -m unittest discover -s tests -v
```
