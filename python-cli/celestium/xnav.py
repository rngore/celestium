"""Autonomous X-ray Pulsar Navigation (XNAV) engine for CELESTIUM CLI:
- Pulsar timing phase prediction in SSB/TDB
- 4-state Weighted Least Squares (WLS) solver [dr_x, dr_y, dr_z, dt_clock]
  with Jacobi eigenvalue condition-number inspection & rank-deficiency detection
- True 8-state Extended Kalman Filter (EKF) [rx, ry, rz, vx, vy, vz, b, d]
  with RK4 orbital propagation, 8x8 STM, and Joseph-form symmetric covariance update
- Ground DSN vs Autonomous XNAV vs Hybrid DSN+XNAV comparison
"""

import math
from typing import Any

from .constants import AU_KM, CENTRAL_BODIES, C_KMS
from .orbital import vec_mag, vec_sub
from .sources import PULSAR_CATALOG, PulsarEntry


def _create_mulberry32(seed: int):
    state = seed & 0xFFFFFFFF

    def next_float() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = ((state ^ (state >> 15)) * (1 | state)) & 0xFFFFFFFF
        t32 = ((t ^ (t >> 7)) * (61 | t)) & 0xFFFFFFFF
        t = (t ^ t32) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return next_float


def _sample_gaussian(rng, sigma: float) -> float:
    u1 = max(1e-12, rng())
    u2 = rng()
    return math.sqrt(-2.0 * math.log(u1)) * math.cos(2.0 * math.pi * u2) * sigma


def _zeros(rows: int, cols: int) -> list[list[float]]:
    return [[0.0] * cols for _ in range(rows)]


def _identity(n: int) -> list[list[float]]:
    m = _zeros(n, n)
    for i in range(n):
        m[i][i] = 1.0
    return m


def _mat_mul(A: list[list[float]], B: list[list[float]]) -> list[list[float]]:
    r, k_len, c = len(A), len(A[0]), len(B[0])
    out = _zeros(r, c)
    for i in range(r):
        for k in range(k_len):
            aik = A[i][k]
            if aik == 0.0:
                continue
            for j in range(c):
                out[i][j] += aik * B[k][j]
    return out


def _mat_transpose(A: list[list[float]]) -> list[list[float]]:
    r, c = len(A), len(A[0])
    return [[A[i][j] for i in range(r)] for j in range(c)]


def _mat_vec_mul(A: list[list[float]], v: list[float]) -> list[float]:
    return [sum(val * v[idx] for idx, val in enumerate(row)) for row in A]


def _mat_add(A: list[list[float]], B: list[list[float]]) -> list[list[float]]:
    return [[A[i][j] + B[i][j] for j in range(len(A[0]))] for i in range(len(A))]


def _invert_matrix(M: list[list[float]]) -> tuple[list[list[float]], bool, float]:
    n = len(M)
    ident = _identity(n)
    aug = [list(M[i]) + list(ident[i]) for i in range(n)]
    min_pivot = float("inf")
    max_diag = max((abs(M[i][i]) for i in range(n)), default=0.0)

    for col in range(n):
        pivot_row = col
        pivot_val = abs(aug[col][col])
        for r in range(col + 1, n):
            v = abs(aug[r][col])
            if v > pivot_val:
                pivot_val = v
                pivot_row = r
        min_pivot = min(min_pivot, pivot_val)
        if pivot_val < 1e-18 * max(1.0, max_diag):
            return _identity(n), True, pivot_val
        if pivot_row != col:
            aug[col], aug[pivot_row] = aug[pivot_row], aug[col]
        div = aug[col][col]
        for j in range(2 * n):
            aug[col][j] /= div
        for r in range(n):
            if r == col:
                continue
            fac = aug[r][col]
            if fac == 0.0:
                continue
            for j in range(2 * n):
                aug[r][j] -= fac * aug[col][j]

    return [row[n:] for row in aug], False, min_pivot


def _symmetric_eigenvalues(A: list[list[float]]) -> list[float]:
    n = len(A)
    D = [list(r) for r in A]
    for _ in range(50 * n * n):
        p, q, max_off = 0, 1, 0.0
        for i in range(n):
            for j in range(i + 1, n):
                val = abs(D[i][j])
                if val > max_off:
                    max_off = val
                    p, q = i, j
        if max_off < 1e-16:
            break
        app, aqq, apq = D[p][p], D[q][q], D[p][q]
        tau = (aqq - app) / (2.0 * apq)
        t = (
            1.0 / (tau + math.sqrt(1.0 + tau * tau))
            if tau >= 0
            else -1.0 / (-tau + math.sqrt(1.0 + tau * tau))
        )
        c = 1.0 / math.sqrt(1.0 + t * t)
        s = t * c
        D[p][p] = app - t * apq
        D[q][q] = aqq + t * apq
        D[p][q] = 0.0
        D[q][p] = 0.0
        for r in range(n):
            if r == p or r == q:
                continue
            drp, drq = D[r][p], D[r][q]
            D[r][p] = c * drp - s * drq
            D[p][r] = D[r][p]
            D[r][q] = s * drp + c * drq
            D[q][r] = D[r][q]
    return sorted(D[i][i] for i in range(n))


def compute_pulsar_phase_prediction(pulsar: PulsarEntry, delta_t_sec: float, phi0: float = 0.0) -> dict[str, Any]:
    f0 = 1.0 / pulsar.period_sec
    f_dot = -pulsar.p_dot / (pulsar.period_sec * pulsar.period_sec)
    cycles = phi0 + f0 * delta_t_sec + 0.5 * f_dot * delta_t_sec * delta_t_sec
    return {
        "pulsar_id": pulsar.id,
        "common_name": pulsar.common_name,
        "reference_epoch_mjd": pulsar.reference_epoch_mjd,
        "delta_t_sec": delta_t_sec,
        "f0_hz": f0,
        "f_dot_hz_s": f_dot,
        "predicted_cycles": cycles,
        "fractional_phase": cycles % 1.0,
    }


def _propagate_8state(x: list[float], dt_sec: float, mu_km3_s2: float) -> list[float]:
    def deriv(s: list[float]) -> list[float]:
        r2 = s[0] * s[0] + s[1] * s[1] + s[2] * s[2]
        r = math.sqrt(max(r2, 1e-6))
        inv_r3 = -mu_km3_s2 / (r2 * r)
        return [s[3], s[4], s[5], inv_r3 * s[0], inv_r3 * s[1], inv_r3 * s[2], s[7], 0.0]

    steps = max(1, math.ceil(abs(dt_sec) / 120.0))
    h = dt_sec / steps
    cur = list(x)
    for _ in range(steps):
        k1 = deriv(cur)
        k2 = deriv([cur[i] + 0.5 * h * k1[i] for i in range(8)])
        k3 = deriv([cur[i] + 0.5 * h * k2[i] for i in range(8)])
        k4 = deriv([cur[i] + h * k3[i] for i in range(8)])
        cur = [cur[i] + (h / 6.0) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) for i in range(8)]
    return cur


def _build_8x8_stm(x: list[float], dt_sec: float, mu_km3_s2: float) -> list[list[float]]:
    rx, ry, rz = x[0], x[1], x[2]
    r2 = rx * rx + ry * ry + rz * rz
    r = math.sqrt(max(r2, 1e-6))
    r5 = r2 * r2 * r
    r3 = r2 * r

    Gxx = mu_km3_s2 * ((3.0 * rx * rx) / r5 - 1.0 / r3)
    Gxy = mu_km3_s2 * ((3.0 * rx * ry) / r5)
    Gxz = mu_km3_s2 * ((3.0 * rx * rz) / r5)
    Gyy = mu_km3_s2 * ((3.0 * ry * ry) / r5 - 1.0 / r3)
    Gyz = mu_km3_s2 * ((3.0 * ry * rz) / r5)
    Gzz = mu_km3_s2 * ((3.0 * rz * rz) / r5 - 1.0 / r3)

    F = _zeros(8, 8)
    F[0][3] = F[1][4] = F[2][5] = 1.0
    F[3][0], F[3][1], F[3][2] = Gxx, Gxy, Gxz
    F[4][0], F[4][1], F[4][2] = Gxy, Gyy, Gyz
    F[5][0], F[5][1], F[5][2] = Gxz, Gyz, Gzz
    F[6][7] = 1.0

    Fdt = [[v * dt_sec for v in row] for row in F]
    Fdt2 = [[0.5 * v for v in row] for row in _mat_mul(Fdt, Fdt)]
    return _mat_add(_mat_add(_identity(8), Fdt), Fdt2)


def run_xnav_simulation(
    true_position_km: tuple[float, float, float],
    true_velocity_km_s: tuple[float, float, float] | None = None,
    central_body: str = "sun",
    initial_guess_error_km: float = 1850.0,
    pulsar_ids: list[str] | None = None,
    observation_duration_sec: float = 3600.0,
    toa_noise_multiplier: float = 1.0,
    dsn_disrupted: bool = False,
    architecture: str = "autonomous-xnav",
    seed: int = 20261121,
    initial_clock_bias_sec: float = 2.5e-6,
    initial_clock_drift_ss: float = 1.5e-11,
) -> dict[str, Any]:
    if pulsar_ids:
        selected = [p for p in PULSAR_CATALOG if p.id in pulsar_ids]
        pulsars = selected if selected else PULSAR_CATALOG[:4]
    else:
        pulsars = PULSAR_CATALOG[:4]

    rng = _create_mulberry32(seed)
    mu = CENTRAL_BODIES[central_body].mu_km3_s2

    r_true = true_position_km
    r_mag = vec_mag(r_true)
    v_circ = math.sqrt(mu / max(r_mag, 1000.0))
    v_true = (
        true_velocity_km_s
        if true_velocity_km_s is not None
        else ((-r_true[1] / max(r_mag, 1.0)) * v_circ, (r_true[0] / max(r_mag, 1.0)) * v_circ, 0.05 * v_circ)
    )

    raw_off = (rng() - 0.5 or 0.42, rng() - 0.5 or -0.61, rng() - 0.5 or 0.35)
    off_mag = vec_mag(raw_off) or 1.0
    initial_guess_km = (
        r_true[0] + (raw_off[0] / off_mag) * initial_guess_error_km,
        r_true[1] + (raw_off[1] / off_mag) * initial_guess_error_km,
        r_true[2] + (raw_off[2] / off_mag) * initial_guess_error_km,
    )

    integ_gain = math.sqrt(max(60.0, observation_duration_sec) / 600.0)
    observations: list[dict[str, Any]] = []
    for p in pulsars:
        u = p.unit_vector
        sigma_us = (p.timing_precision_us * toa_noise_multiplier) / integ_gain
        sigma_range_km = C_KMS * sigma_us * 1e-6
        true_range_km = u[0] * r_true[0] + u[1] * r_true[1] + u[2] * r_true[2]
        noise_us = _sample_gaussian(rng, sigma_us)
        meas_range_km = true_range_km + C_KMS * noise_us * 1e-6
        weight = 1.0 / max(1e-6, sigma_range_km * sigma_range_km)
        observations.append(
            {
                "pulsar_id": p.id,
                "common_name": p.common_name,
                "unit_vector": u,
                "period_ms": p.period_ms,
                "true_range_km": round(true_range_km, 3),
                "measured_range_km": round(meas_range_km, 3),
                "timing_residual_us": round(noise_us, 3),
                "sigma_us": round(sigma_us, 3),
                "weight": weight,
                "phase_prediction": compute_pulsar_phase_prediction(p, observation_duration_sec),
            }
        )

    n_obs = len(observations)
    H_km: list[list[float]] = []
    HtWH_km = _zeros(4, 4)
    HtH_unit = _zeros(4, 4)

    for obs in observations:
        u = obs["unit_vector"]
        row_km = [u[0], u[1], u[2], 1.0]
        H_km.append(row_km)
        for r in range(4):
            for c in range(4):
                HtH_unit[r][c] += row_km[r] * row_km[c]
                HtWH_km[r][c] += row_km[r] * row_km[c] * obs["weight"]

    eigs = _symmetric_eigenvalues(HtH_unit)
    min_eig, max_eig = eigs[0], eigs[-1]
    cond_num = max_eig / min_eig if min_eig > 1e-12 else float("inf")
    inv_htwh, sing_w, _ = _invert_matrix(HtWH_km)
    inv_hth, sing_u, _ = _invert_matrix(HtH_unit)

    rank_deficient = n_obs < 4 or sing_w or sing_u or cond_num > 1e5 or min_eig < 1e-6
    geometry_warning = None
    if n_obs < 4:
        geometry_warning = (
            f"Rank-deficient 4-state system: {n_obs} pulsars selected (minimum 4 non-coplanar pulsars required)."
        )
    elif rank_deficient:
        geometry_warning = f"Ill-conditioned pulsar geometry detected (kappa = {cond_num:.2e})."

    pdop = math.sqrt(max(0.0, inv_hth[0][0] + inv_hth[1][1] + inv_hth[2][2])) if not rank_deficient else float("inf")
    tdop = math.sqrt(max(0.0, inv_hth[3][3])) if not rank_deficient else float("inf")
    gdop = math.sqrt(max(0.0, pdop * pdop + tdop * tdop)) if not rank_deficient else float("inf")

    r_wls = [initial_guess_km[0], initial_guess_km[1], initial_guess_km[2]]
    wls_clock_bias_sec = 0.0
    iters_used = 0
    converged = False

    if not rank_deficient:
        for it in range(1, 9):
            iters_used = it
            rhs = [0.0, 0.0, 0.0, 0.0]
            for i, obs in enumerate(observations):
                u = obs["unit_vector"]
                meas_clk = obs["measured_range_km"] + C_KMS * initial_clock_bias_sec
                pred = u[0] * r_wls[0] + u[1] * r_wls[1] + u[2] * r_wls[2] + C_KMS * wls_clock_bias_sec
                y_km = meas_clk - pred
                for r in range(4):
                    rhs[r] += H_km[i][r] * obs["weight"] * y_km
            delta = _mat_vec_mul(inv_htwh, rhs)
            r_wls = [r_wls[0] + delta[0], r_wls[1] + delta[1], r_wls[2] + delta[2]]
            wls_clock_bias_sec += delta[3] / C_KMS
            if math.sqrt(sum(d * d for d in delta)) < 1e-4:
                converged = True
                break

    wls_est = (round(r_wls[0], 3), round(r_wls[1], 3), round(r_wls[2], 3))
    wls_error_km = vec_mag(vec_sub(wls_est, r_true))
    cov_wls_3x3 = [inv_htwh[r][:3] for r in range(3)]

    # 8-State EKF
    ekf_epochs = 8
    dt_epoch = observation_duration_sec / ekf_epochs
    x_true8 = [r_true[0], r_true[1], r_true[2], v_true[0], v_true[1], v_true[2], initial_clock_bias_sec, initial_clock_drift_ss]
    x_est8 = [
        initial_guess_km[0],
        initial_guess_km[1],
        initial_guess_km[2],
        v_true[0] * 1.002,
        v_true[1] * 0.998,
        v_true[2],
        0.0,
        0.0,
    ]

    pos_var0 = max(100.0, initial_guess_error_km * initial_guess_error_km)
    vel_var0 = max(1e-4, (vec_mag(v_true) * 0.01) ** 2)
    P8 = _zeros(8, 8)
    P8[0][0] = P8[1][1] = P8[2][2] = pos_var0
    P8[3][3] = P8[4][4] = P8[5][5] = vel_var0
    P8[6][6] = 1e-8
    P8[7][7] = 1e-18

    Q8 = _zeros(8, 8)
    Q8[0][0] = Q8[1][1] = Q8[2][2] = 1e-4
    Q8[3][3] = Q8[4][4] = Q8[5][5] = 1e-10
    Q8[6][6] = 1e-16
    Q8[7][7] = 1e-24

    ekf_history: list[dict[str, Any]] = []
    for k in range(1, ekf_epochs + 1):
        x_true8 = _propagate_8state(x_true8, dt_epoch, mu)
        x_est8 = _propagate_8state(x_est8, dt_epoch, mu)
        Phi = _build_8x8_stm(x_est8, dt_epoch, mu)
        P8 = _mat_add(_mat_mul(_mat_mul(Phi, P8), _mat_transpose(Phi)), Q8)

        sum_sq_res_us = 0.0
        for p in pulsars:
            u = p.unit_vector
            sigma_us_ep = (p.timing_precision_us * toa_noise_multiplier) / math.sqrt(max(30.0, dt_epoch) / 600.0)
            sigma_r_km = C_KMS * sigma_us_ep * 1e-6
            R_scalar = sigma_r_km * sigma_r_km

            z_true = u[0] * x_true8[0] + u[1] * x_true8[1] + u[2] * x_true8[2] + C_KMS * x_true8[6]
            z_meas = z_true + C_KMS * _sample_gaussian(rng, sigma_us_ep) * 1e-6
            h_row = [u[0], u[1], u[2], 0.0, 0.0, 0.0, C_KMS, 0.0]
            z_pred = h_row[0] * x_est8[0] + h_row[1] * x_est8[1] + h_row[2] * x_est8[2] + h_row[6] * x_est8[6]
            inn_km = z_meas - z_pred
            inn_us = (inn_km / C_KMS) * 1e6
            sum_sq_res_us += inn_us * inn_us

            Ph = _mat_vec_mul(P8, h_row)
            S = sum(h_row[idx] * Ph[idx] for idx in range(8)) + R_scalar
            K = [v / S for v in Ph]
            x_est8 = [x_est8[idx] + K[idx] * inn_km for idx in range(8)]

            I_KH = _identity(8)
            KRKt = _zeros(8, 8)
            for r in range(8):
                for c in range(8):
                    I_KH[r][c] -= K[r] * h_row[c]
                    KRKt[r][c] = K[r] * R_scalar * K[c]
            P8 = _mat_add(_mat_mul(_mat_mul(I_KH, P8), _mat_transpose(I_KH)), KRKt)

        if architecture == "hybrid-dsn-xnav" and not dsn_disrupted and k % 2 == 0:
            diff = (x_est8[0] - AU_KM, x_est8[1], x_est8[2])
            rho_est = max(1.0, vec_mag(diff))
            los = [diff[0] / rho_est, diff[1] / rho_est, diff[2] / rho_est]
            rho_true = vec_mag((x_true8[0] - AU_KM, x_true8[1], x_true8[2]))
            dsn_sigma = 0.015
            z_meas = rho_true + _sample_gaussian(rng, dsn_sigma)
            h_row = [los[0], los[1], los[2], 0.0, 0.0, 0.0, 0.0, 0.0]
            inn = z_meas - rho_est
            Ph = _mat_vec_mul(P8, h_row)
            S = sum(h_row[idx] * Ph[idx] for idx in range(8)) + dsn_sigma * dsn_sigma
            K = [v / S for v in Ph]
            x_est8 = [x_est8[idx] + K[idx] * inn for idx in range(8)]
            I_KH = _identity(8)
            for r in range(8):
                for c in range(8):
                    I_KH[r][c] -= K[r] * h_row[c]
            P8 = _mat_mul(_mat_mul(I_KH, P8), _mat_transpose(I_KH))

        est_pos = (round(x_est8[0], 3), round(x_est8[1], 3), round(x_est8[2], 3))
        est_vel = (round(x_est8[3], 6), round(x_est8[4], 6), round(x_est8[5], 6))
        pos_err = vec_mag(vec_sub(est_pos, (x_true8[0], x_true8[1], x_true8[2])))
        vel_err = vec_mag(vec_sub(est_vel, (x_true8[3], x_true8[4], x_true8[5])))
        sigma1_km = math.sqrt(max(0.0, P8[0][0] + P8[1][1] + P8[2][2]))

        ekf_history.append(
            {
                "epoch_index": k,
                "elapsed_sec": round(k * dt_epoch),
                "estimated_position_km": est_pos,
                "estimated_velocity_km_s": est_vel,
                "estimated_clock_bias_sec": x_est8[6],
                "estimated_clock_drift_ss": x_est8[7],
                "position_error_km": round(pos_err, 3),
                "velocity_error_km_s": round(vel_err, 6),
                "clock_bias_error_us": round(abs(x_est8[6] - x_true8[6]) * 1e6, 3),
                "uncertainty_1sigma_km": round(sigma1_km, 3),
                "rms_residual_us": round(math.sqrt(sum_sq_res_us / len(pulsars)), 3),
            }
        )

    final_ekf = ekf_history[-1]
    wls_sigma1 = math.sqrt(max(0.0, cov_wls_3x3[0][0] + cov_wls_3x3[1][1] + cov_wls_3x3[2][2]))
    uncertainty_1sigma_km = round(min(wls_sigma1, final_ekf["uncertainty_1sigma_km"]), 3)

    dist_earth_km = vec_mag(vec_sub(r_true, (AU_KM, 0.0, 0.0)))
    owlt_sec = dist_earth_km / C_KMS
    dsn_base_err = max(0.25, dist_earth_km * 2.5e-9 + 0.35)
    dsn_modeled_err = round(dsn_base_err + observation_duration_sec * 0.035, 2) if dsn_disrupted else round(dsn_base_err, 2)
    ekf_err = final_ekf["position_error_km"]

    architecture_comparison = [
        {
            "architecture": "earth-dsn",
            "label": "Ground DSN Radiometric",
            "steady_state_pos_error_km": dsn_modeled_err,
            "steady_state_vel_error_m_s": 2.8 if dsn_disrupted else 0.08,
            "update_latency_sec": round(2 * owlt_sec + 420.0, 1),
            "blackout_resilience": "FAILS (Outage / Drift)" if dsn_disrupted else "Vulnerable to Solar Conjunction",
        },
        {
            "architecture": "autonomous-xnav",
            "label": "Autonomous XNAV (8-State EKF)",
            "steady_state_pos_error_km": ekf_err,
            "steady_state_vel_error_m_s": round(final_ekf["velocity_error_km_s"] * 1000.0, 3),
            "update_latency_sec": 0.02,
            "blackout_resilience": "IMMUNE (Local Onboard Photon Timing)",
        },
        {
            "architecture": "hybrid-dsn-xnav",
            "label": "Hybrid DSN + XNAV Fusion",
            "steady_state_pos_error_km": round(min(dsn_base_err, ekf_err) * 0.68, 3),
            "steady_state_vel_error_m_s": round(final_ekf["velocity_error_km_s"] * 650.0, 3),
            "update_latency_sec": 0.02 if dsn_disrupted else round(owlt_sec, 1),
            "blackout_resilience": "GRACEFUL FALLBACK TO XNAV",
        },
    ]

    return {
        "central_body": central_body,
        "reference_frame": "Solar System Barycentric (SSB) Ecliptic J2000",
        "true_position_km": r_true,
        "initial_guess_km": initial_guess_km,
        "wls_estimate_km": wls_est,
        "wls_clock_bias_sec": wls_clock_bias_sec,
        "wls_error_km": round(wls_error_km, 3),
        "ekf_estimate_km": final_ekf["estimated_position_km"],
        "ekf_velocity_km_s": final_ekf["estimated_velocity_km_s"],
        "ekf_error_km": ekf_err,
        "uncertainty_1sigma_km": uncertainty_1sigma_km,
        "gdop": round(gdop, 3) if math.isfinite(gdop) else 9999.0,
        "pdop": round(pdop, 3) if math.isfinite(pdop) else 9999.0,
        "tdop": round(tdop, 3) if math.isfinite(tdop) else 9999.0,
        "condition_number": round(cond_num, 3) if math.isfinite(cond_num) else 1e12,
        "rank_deficient": rank_deficient,
        "geometry_warning": geometry_warning,
        "converged": converged,
        "iterations_used": iters_used,
        "pulsar_observations": observations,
        "ekf_history": ekf_history,
        "architecture_comparison": architecture_comparison,
    }
