# CELESTIUM

### Deep-Space Mission Analysis & Autonomous Navigation Workbench

**Explore Beyond Earth. Navigate Beyond Limits.**

CELESTIUM is a full-stack aerospace engineering workbench for astrodynamics, autonomous pulsar navigation (XNAV), deep-space RF/optical communications analysis, proximity-ranging concepts, and ephemeris inspection.

It brings mission configuration, trajectory analysis, navigation estimation, communications modelling, interactive 3D visualization, and reproducible reporting into one application.

> **Scientific scope:** CELESTIUM is an analysis and simulation workbench, not a flight-certified navigation or spacecraft-control system. In particular, the project's synthetic XNAV time-of-arrival observations are labelled `SIMULATED`. Always interpret outputs alongside their units, epoch, reference frame, assumptions, and provenance.

---

## Contents

- [Highlights](#highlights)
- [Workspaces](#workspaces)
- [How It Works](#how-it-works)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
- [Environment Configuration](#environment-configuration)
- [Python CLI](#python-cli)
- [GitHub Actions](#github-actions)
- [Validation](#validation)
- [Data Provenance](#data-provenance)
- [Repository Structure](#repository-structure)
- [Limitations](#limitations)
- [Contributing](#contributing)
- [License](#license)

---

## Highlights

- Numerical orbit propagation using Dormand–Prince RK45 and fixed-step RK4.
- Classical Orbital Elements (COE), idealized Hohmann transfers, and a universal-variable Lambert solver.
- Simplified pulsar timing model with a four-state Weighted Least Squares (WLS) estimator and an eight-state Extended Kalman Filter (EKF).
- Modelled comparison of DSN, XNAV, and hybrid navigation architectures.
- Deep-space RF/optical link-budget calculations, including light-time delay, free-space path loss, received power, noise, and link margin.
- Earth occultation and solar-conjunction visibility checks.
- Space Sonar concepts for optical LiDAR and coherent RF ranging, including CRLB analysis.
- NASA/JPL Horizons ephemeris synchronization with caching and analytical fallback paths.
- Interactive 3D views, model inspection, and PDF/CSV/JSON exports.
- A standalone Python command-line executor for benchmark scenarios and exported scenario configurations.

## Workspaces

### 1. Mission Workbench

Configure an initial inertial state, central gravitational body, epoch, propagation duration, spacecraft properties, perturbation settings, numerical integrator, navigation architecture, and RF communication parameters.

Includes three offline benchmark presets:

- Earth-to-Mars
- Voyager Deep-Space XNAV
- Earth-to-Moon

The engineering orbit viewport visualizes trajectories, coordinate-frame axes, and a three-sigma uncertainty ellipsoid.

### 2. Trajectory Analysis

Explore spacecraft motion and transfer calculations with:

- Dormand–Prince RK45 and fixed-step RK4 propagation.
- Energy and angular-momentum conservation diagnostics.
- Step-sensitivity cross-checks.
- Cartesian state-vector to Classical Orbital Elements conversion.
- Circular and equatorial singularity handling.
- Idealized Hohmann transfer calculations.
- Universal-variable Lambert boundary-value solver using Stumpff functions.

### 3. Autonomous Navigation

Explore pulsar-based X-ray navigation concepts through:

- A simplified TDB/SSB pulsar timing phase model.
- Four-state WLS position and clock-offset estimation.
- Rank-deficiency and condition-number diagnostics.
- Eight-state EKF estimation of position, velocity, clock bias, and clock drift.
- RK4-coupled orbital dynamics and Joseph-form covariance updates.
- DSN, XNAV, and hybrid architecture comparisons.

The synthetic time-of-arrival (TOA) observations are simulated inputs and must not be represented as flight measurements.

### 4. Communication Analysis

Evaluate deep-space RF/optical communication constraints:

- One-way and round-trip signal light time.
- Free-Space Path Loss (FSPL).
- Received power and noise spectral density.
- Carrier-to-noise density (`C/N0`).
- Energy-per-bit-to-noise-density (`Eb/N0`).
- Link margin.
- Earth occultation and solar-conjunction visibility along trajectory samples.

### 5. Spacecraft & Ephemerides

Synchronize supported celestial-body and spacecraft vectors through the server-side NASA/JPL Horizons integration.

The application also includes spacecraft and pulsar catalogs, reference/validity epoch metadata, caching, and fallback estimates. Data provenance is exposed in the interface so users can distinguish external ephemerides from model-generated values.

### 6. Model Inspector

Inspect the computational basis of results, including governing equations, variable units, active inputs, intermediate solver values, assumptions, limitations, provenance, and available test status.

### 7. Reports

Export analysis artifacts:

- Multi-section PDF engineering reports.
- CSV time-series data, including trajectory, EKF, and link-budget outputs.
- JSON scenario configurations for reproducible runs.

---

## How It Works

A typical analysis follows this sequence:

1. **Configure a mission** — choose a benchmark preset or enter a spacecraft state, epoch, central body, vehicle properties, and model settings.
2. **Resolve reference data** — retrieve supported ephemerides from NASA/JPL Horizons or use the application's documented fallback models.
3. **Propagate or plan motion** — run numerical propagation or calculate Hohmann/Lambert transfer solutions.
4. **Evaluate navigation** — run the selected pulsar-navigation estimators and inspect uncertainty and geometry diagnostics.
5. **Analyse communications** — calculate signal travel time, link budget, and visibility constraints.
6. **Inspect the model** — review equations, units, intermediate values, assumptions, and provenance.
7. **Export results** — save PDF, CSV, and JSON artifacts for reporting or repeatable execution.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite |
| 3D visualization | Three.js |
| Charts | Recharts |
| Backend | Node.js, Express |
| Scientific core | TypeScript modules for physics, orbital mechanics, XNAV, and Space Sonar |
| PDF reports | jsPDF |
| Validation | Vitest, Testing Library |
| Python executor | Python 3.10+ standard library, `unittest` |
| External ephemerides | NASA/JPL Horizons |

---

## Getting Started

### Prerequisites

- Node.js 22 or later recommended.
- npm.
- Python 3.10+ for the standalone CLI and Python test suite.
- Git.

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/<your-repository>.git
cd <your-repository>
```

### 2. Install dependencies

```bash
npm install
```

The repository includes a `bun.lock`; the commands above follow the npm-based development instructions. If you use Bun, use a Bun version compatible with the lockfile and your project setup.

### 3. Configure environment variables

```bash
cp .env.example .env
```

Review the variables in `.env.example` and provide values only for integrations you intend to use. Never commit `.env` or API credentials.

### 4. Start the application

```bash
npm run dev
```

The project development server is configured to run on port `3000`.

### 5. Run checks locally

```bash
npm run lint
npm test
npm run build
```

---

## Environment Configuration

The repository provides an `.env.example` file. Use it as the source of truth for supported environment variable names and descriptions.

- Keep secrets in local environment files or GitHub Actions Secrets.
- Do not hard-code API keys in source files.
- Do not commit `.env`.
- The application can use offline benchmark presets and fallback models; live external ephemeris synchronization requires network access.

---

## Python CLI

The `python-cli/` directory contains a standalone command-line executor. Its documented core uses Python 3.10+ standard-library modules and does not require third-party packages.

Run commands from the `python-cli/` directory:

```bash
cd python-cli

# Inspect available data sources and catalogs
python3 run_celestium.py sources

# Run a benchmark scenario
python3 run_celestium.py run --scenario earth-to-mars

# Run another included benchmark
python3 run_celestium.py run --scenario voyager-xnav

# Run the Earth-to-Moon benchmark
python3 run_celestium.py run --scenario earth-to-moon

# Launch the interactive terminal workbench
python3 run_celestium.py interactive
```

Run a scenario exported from the web application:

```bash
python3 run_celestium.py run \
  --config path/to/scenario-config.json \
  --csv-dir ./exports
```

### CLI subcommands

| Command | Purpose |
|---|---|
| `run` | Execute an end-to-end scenario pipeline |
| `propagate` | Propagate an orbit with RK45/RK4 and optional perturbations |
| `lambert` | Solve a universal-variable Lambert boundary-value problem |
| `hohmann` | Calculate an idealized two-impulse Hohmann transfer |
| `xnav` | Run WLS/EKF pulsar-navigation analysis |
| `comms` | Calculate deep-space communication link metrics |
| `sonar` | Evaluate active LiDAR/RF ranging and CRLB metrics |
| `ephemeris` | Request a NASA/JPL Horizons vector |
| `sources` | List supported data sources and catalogs |
| `interactive` | Open the interactive terminal workbench |

See [`python-cli/README.md`](python-cli/README.md) for the complete CLI reference.

---

## GitHub Actions

This repository includes a CI workflow at `.github/workflows/ci.yml`.

The workflow runs on pushes and pull requests targeting `main` and `master`. It:

- Installs Node.js dependencies.
- Runs TypeScript type-checking.
- Runs the Vitest suite.
- Builds the production frontend bundle.
- Runs the Python CLI unit tests on Python 3.10 and 3.12.

You can view the workflow results in the repository's **Actions** tab.

### Status badge

After pushing this repository to GitHub, replace `<owner>` and `<repository>` with your GitHub username or organization and repository name:

```markdown
[![CI](https://github.com/<owner>/<repository>/actions/workflows/ci.yml/badge.svg)](https://github.com/<owner>/<repository>/actions/workflows/ci.yml)
```

---

## Validation

The project README documents the following reference checks and tolerances:

| Area | Documented validation |
|---|---|
| Two-body RK45 propagation | Relative energy drift and angular-momentum drift below `1e-8` in stated circular/elliptical tests |
| Lambert solver | Curtis Example 5.2 reference; forward propagation endpoint error below `0.05 km` |
| Hohmann transfer | Earth–Mars baseline around `258.9 days` and total delta-v around `5.59 km/s`; LEO–GEO around `3.935 km/s` |
| Light time | One astronomical unit one-way light time around `499.005 s` |
| Communications | FSPL, `C/N0`, and `Eb/N0` checked against Friis identities |
| XNAV | Synthetic TOA tests cover rank-deficiency alerts and EKF convergence across sequential epochs |

These are project-documented test cases, not independent certification or flight qualification. Run the test suites in your own environment to verify the current checkout.

### Local test commands

```bash
# TypeScript checks
npm run lint

# Frontend, API, and scientific-core tests
npm test

# Python CLI tests
cd python-cli
python3 -m unittest discover -s tests -v
```

---

## Data Provenance

CELESTIUM uses explicit provenance categories:

| Label | Meaning |
|---|---|
| `OBSERVED` | Retrieved from an external source such as NASA/JPL Horizons |
| `COMPUTED` | Calculated by the application from its implemented model |
| `ESTIMATED` | Produced by an approximation or fallback model |
| `SIMULATED` | Generated as synthetic observations or modelled measurements |

When presenting or comparing results, preserve the provenance label and include the epoch, reference frame, and units. Do not describe estimated or simulated values as observed mission data.

---

## Repository Structure

```text
.
├── .github/
│   └── workflows/
│       └── ci.yml
├── server/
│   ├── routes/
│   └── services/
├── src/
│   ├── components/
│   ├── data/
│   └── shared/
│       ├── catalog/
│       └── science/
├── tests/
├── python-cli/
│   ├── celestium/
│   └── tests/
├── .env.example
├── package.json
├── README.md
├── server.ts
└── vite.config.ts
```

---

## Limitations

- CELESTIUM is an engineering analysis and simulation workbench, not a flight-certified navigation or spacecraft-control system.
- The XNAV pulsar phase model is simplified; synthetic TOA estimation is explicitly marked `SIMULATED`.
- Analytical ephemeris fallbacks are approximations and are not interchangeable with fresh high-precision ephemerides.
- Hohmann and Lambert calculations depend on their model assumptions and are not, by themselves, complete operational mission designs.
- RF/optical link-budget results depend on supplied parameters and do not certify physical communications hardware.
- Space Sonar calculations are model-based analyses and do not demonstrate integrated or flight-tested ranging hardware.

Use the Model Inspector and provenance indicators when interpreting outputs.

---

## Contributing

Contributions, issue reports, and technical discussions are welcome.

1. Fork the repository.
2. Create a focused branch: `git checkout -b feature/your-change`.
3. Make the change and add or update tests where appropriate.
4. Run the TypeScript checks, Vitest suite, Python tests, and production build.
5. Open a pull request with a clear summary, rationale, and validation results.

For scientific changes, include units, assumptions, reference cases, and numerical tolerances in the pull request description.

---

## License

No license was identified in the supplied project archive. Until a license is added by the project owner, all rights remain reserved by default. Add a `LICENSE` file before inviting reuse or redistribution.
