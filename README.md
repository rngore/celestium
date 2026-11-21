# CELESTIUM — Deep-Space Mission Analysis & Autonomous Navigation Workbench

**Tagline:** *Explore Beyond Earth. Navigate Beyond Limits.*

CELESTIUM is a full-stack aerospace astrodynamics, autonomous pulsar navigation (XNAV), deep-space RF/optical communications analysis, and ephemeris inspection workbench built with TypeScript, React, Express, Three.js, and Recharts.

---

## Primary Workspaces

1. **Mission Workbench** — Configure inertial state vectors $(\mathbf{r}_0, \mathbf{v}_0)$, central gravitational body ($\mu$), epoch/duration, mass/SRP area, perturbation toggles ($J_2$, SRP, Third-Body), integrator (`RK45` / `RK4`), navigation architecture, and RF communication parameters. Includes 3 self-contained offline benchmark presets (Earth-to-Mars, Voyager Deep-Space XNAV, Earth-to-Moon) and an interactive 3D engineering orbit viewport with coordinate frame axes and $3\sigma$ uncertainty ellipsoid.
2. **Trajectory Analysis** — Dormand–Prince RK45 & fixed RK4 numerical propagation with energy/angular-momentum conservation diagnostics and step-sensitivity cross-check; Classical Orbital Elements (COE) with explicit circular ($e < 10^{-8}$) and equatorial ($\sin i < 10^{-8}$) singularity handling; idealized Hohmann transfer calculator; and Universal-Variable Lambert Boundary-Value Solver using Stumpff $C(z), S(z)$ functions.
3. **Autonomous Navigation** — Simplified TDB/SSB pulsar timing phase model $\phi(t) = \phi_0 + f_0(t - t_0) + \frac{1}{2}\dot{f}_0(t - t_0)^2$, 4-state Weighted Least Squares $[\delta r_x, \delta r_y, \delta r_z, \delta t_{\text{clock}}]^T$ with condition number $\kappa$ & rank-deficiency detection, true 8-state Extended Kalman Filter $[r_x, r_y, r_z, v_x, v_y, v_z, b, d]^T$ coupled with RK4 orbital dynamics & Joseph covariance updates, DSN vs XNAV vs Hybrid architecture comparison, and auxiliary Space Sonar proximity LiDAR/RF CRLB evaluation.
4. **Communication Analysis** — One-way and round-trip light travel time ($R/c$, $2R/c$), Free-Space Path Loss $\text{FSPL(dB)} = 20\log_{10}(4\pi R/\lambda)$, complete RF/optical link budget ($P_r$, $N_0$, $C/N_0$, $E_b/N_0$, link margin), and geometric Earth occultation / solar conjunction visibility along propagated trajectory states.
5. **Spacecraft & Ephemerides** — Server-side NASA/JPL Horizons ephemeris synchronization with 15-minute caching, ISRO/NASA verified mission catalog, reference vs validity epoch distinction, and explicit `OBSERVED`, `COMPUTED`, `ESTIMATED`, and `SIMULATED` provenance tags.
6. **Model Inspector** — Dynamic white-box audit panel inspecting governing equations, variable units, active inputs, live intermediate calculations emitted directly by each solver, assumptions, limitations, provenance, and Vitest validation status.
7. **Reports** — Reproducible manifest generator exporting multi-section PDF engineering reports (`jsPDF`), RFC-4180 CSV time-series datasets (trajectory, 8-state EKF, link budget), and JSON scenario configurations.

---

## Key Mathematical Models & Validation Tolerances

- **Two-Body Conservation (RK45):** Relative energy drift $|\Delta \varepsilon / \varepsilon_0| < 10^{-8}$ and angular momentum drift $|\Delta h / h_0| < 10^{-8}$ verified over circular/elliptical orbits.
- **Lambert BVP:** Validated against Curtis Example 5.2 textbook Earth transfer ($\Delta t = 3600\,\text{s}$) with RK45 forward propagation returning to $\mathbf{r}_2$ within $< 0.05\,\text{km}$.
- **Hohmann Reference:** Earth–Mars baseline ($\approx 258.9\,\text{days}$, $\Delta v \approx 5.59\,\text{km/s}$) and LEO–GEO ($\Delta v \approx 3.935\,\text{km/s}$) verified.
- **Communications & Light Time:** $1\,\text{AU}$ one-way light time verified to $499.005\,\text{s}$ ($c = 299{,}792{,}458\,\text{m/s}$); FSPL, $C/N_0$, and $E_b/N_0$ verified against exact Friis identities.
- **XNAV 4-WLS / 8-EKF:** Synthetic TOA estimation explicitly labeled `SIMULATED`; verifies rank-deficiency alerting for $<4$ or collinear pulsars and EKF convergence across sequential orbital epochs.

---

## Development & Verification Commands

```bash
npm install
npm run dev          # Starts Express + Vite server on port 3000
npx vitest run       # Runs astrodynamics, Lambert, XNAV, comms, API & UI tests
npm run lint         # TypeScript type-checking (tsc --noEmit)
npm run build        # Production Vite bundle
```
