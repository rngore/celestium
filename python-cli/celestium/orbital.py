"""Astrodynamics solvers for CELESTIUM CLI:
- Dormand-Prince RK45 & fixed-step RK4 orbit propagation (with J2, SRP, 3rd-body)
- Cartesian state (r, v) -> Classical Orbital Elements (COE) with singularity checks
- Idealized Hohmann transfer calculator
- Universal-Variable Lambert Boundary-Value Solver (Stumpff C(z), S(z))
"""

import math
from typing import Any

from .constants import (
    AU_KM,
    CENTRAL_BODIES,
    MU_JUPITER_KM3_S2,
    MU_SUN_KM3_S2,
    P_SOLAR_1AU_N_M2,
    SECONDS_PER_DAY,
)


def vec_mag(v: tuple[float, float, float]) -> float:
    return math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])


def vec_dot(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def vec_cross(a: tuple[float, float, float], b: tuple[float, float, float]) -> tuple[float, float, float]:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def vec_sub(a: tuple[float, float, float], b: tuple[float, float, float]) -> tuple[float, float, float]:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def vec_scale(v: tuple[float, float, float], s: float) -> tuple[float, float, float]:
    return (v[0] * s, v[1] * s, v[2] * s)


def state_to_orbital_elements(
    r_km: tuple[float, float, float],
    v_km_s: tuple[float, float, float],
    central_body: str = "sun",
) -> dict[str, Any]:
    body = CENTRAL_BODIES[central_body]
    mu = body.mu_km3_s2
    r = max(vec_mag(r_km), 1e-9)
    v = vec_mag(v_km_s)

    h_vec = vec_cross(r_km, v_km_s)
    h = vec_mag(h_vec)
    n_vec = (-h_vec[1], h_vec[0], 0.0)
    n = vec_mag(n_vec)

    r_dot_v = vec_dot(r_km, v_km_s)
    ecc_vec = vec_sub(
        vec_scale(r_km, (v * v) / mu - 1.0 / r),
        vec_scale(v_km_s, r_dot_v / mu),
    )
    e = vec_mag(ecc_vec)

    energy = (v * v) / 2.0 - mu / r
    is_parabolic = abs(energy) < 1e-10
    a_km = float("inf") if is_parabolic else -mu / (2.0 * energy)

    cos_i = max(-1.0, min(1.0, h_vec[2] / h)) if h > 1e-12 else 1.0
    inc_rad = math.acos(cos_i)
    inc_deg = math.degrees(inc_rad)

    is_circular = e < 1e-8
    is_equatorial = math.sin(inc_rad) < 1e-8
    notes: list[str] = []

    raan_deg: float | None = None
    if not is_equatorial and n > 1e-12:
        omega_big = math.acos(max(-1.0, min(1.0, n_vec[0] / n)))
        if n_vec[1] < 0:
            omega_big = 2.0 * math.pi - omega_big
        raan_deg = math.degrees(omega_big)
    else:
        notes.append("Equatorial orbit (sin i < 1e-8): RAAN undefined.")

    arg_p_deg: float | None = None
    if not is_circular and not is_equatorial and n > 1e-12 and e > 1e-12:
        w = math.acos(max(-1.0, min(1.0, vec_dot(n_vec, ecc_vec) / (n * e))))
        if ecc_vec[2] < 0:
            w = 2.0 * math.pi - w
        arg_p_deg = math.degrees(w)
    elif is_circular:
        notes.append("Circular orbit (e < 1e-8): argument of periapsis undefined.")

    true_anom_deg: float | None = None
    true_long_deg: float | None = None
    if not is_circular and e > 1e-12:
        nu = math.acos(max(-1.0, min(1.0, vec_dot(ecc_vec, r_km) / (e * r))))
        if r_dot_v < 0:
            nu = 2.0 * math.pi - nu
        true_anom_deg = math.degrees(nu)
    elif not is_equatorial and n > 1e-12:
        u = math.acos(max(-1.0, min(1.0, vec_dot(n_vec, r_km) / (n * r))))
        if r_km[2] < 0:
            u = 2.0 * math.pi - u
        true_long_deg = math.degrees(u)
        notes.append("Circular inclined orbit: argument of latitude reported.")
    else:
        l_ang = math.acos(max(-1.0, min(1.0, r_km[0] / r)))
        if r_km[1] < 0:
            l_ang = 2.0 * math.pi - l_ang
        true_long_deg = math.degrees(l_ang)
        notes.append("Circular equatorial orbit: true longitude reported.")

    regime = (
        "circular"
        if is_circular
        else "elliptical"
        if e < 1.0 - 1e-7
        else "parabolic"
        if abs(e - 1.0) <= 1e-7
        else "hyperbolic"
    )
    period_sec = (
        2.0 * math.pi * math.sqrt((a_km**3) / mu)
        if regime in ("circular", "elliptical") and a_km > 0
        else None
    )

    return {
        "central_body": central_body,
        "mu_km3_s2": mu,
        "semi_major_axis_km": a_km,
        "eccentricity": e,
        "inclination_deg": inc_deg,
        "raan_deg": raan_deg,
        "arg_periapsis_deg": arg_p_deg,
        "true_anomaly_deg": true_anom_deg,
        "true_longitude_deg": true_long_deg,
        "specific_energy_km2_s2": energy,
        "angular_momentum_km2_s": h,
        "orbital_period_sec": period_sec,
        "orbit_regime": regime,
        "is_circular": is_circular,
        "is_equatorial": is_equatorial,
        "edge_case_notes": notes,
        "h_vec_km2_s": h_vec,
        "n_vec_km2_s": n_vec,
        "ecc_vec": ecc_vec,
    }


def _compute_acceleration(
    r: tuple[float, float, float],
    t_sec: float,
    central_body: str,
    enable_j2: bool,
    enable_srp: bool,
    enable_third_body: bool,
    mass_kg: float,
    area_m2: float,
    cr: float,
) -> tuple[float, float, float]:
    body = CENTRAL_BODIES[central_body]
    mu = body.mu_km3_s2
    r2 = r[0] * r[0] + r[1] * r[1] + r[2] * r[2]
    r_mag = math.sqrt(max(r2, 1e-12))
    inv_r3 = -mu / (r2 * r_mag)
    ax, ay, az = inv_r3 * r[0], inv_r3 * r[1], inv_r3 * r[2]

    if enable_j2 and body.j2 > 0:
        z2_r2 = (r[2] * r[2]) / r2
        fac = (1.5 * body.j2 * mu * body.radius_km * body.radius_km) / (r_mag**5)
        ax += fac * r[0] * (5.0 * z2_r2 - 1.0)
        ay += fac * r[1] * (5.0 * z2_r2 - 1.0)
        az += fac * r[2] * (5.0 * z2_r2 - 3.0)

    if enable_srp and mass_kg > 0 and area_m2 > 0:
        if central_body == "sun":
            srp_mag = ((P_SOLAR_1AU_N_M2 * cr * area_m2) / mass_kg) * ((AU_KM / r_mag) ** 2) * 1e-3
            ax += (srp_mag * r[0]) / r_mag
            ay += (srp_mag * r[1]) / r_mag
            az += (srp_mag * r[2]) / r_mag
        else:
            n_sun = (2.0 * math.pi) / (365.256 * SECONDS_PER_DAY)
            srp_mag = ((P_SOLAR_1AU_N_M2 * cr * area_m2) / mass_kg) * 1e-3
            ax -= srp_mag * math.cos(n_sun * t_sec)
            ay -= srp_mag * math.sin(n_sun * t_sec)

    if enable_third_body:
        if central_body == "sun":
            r_j = 5.202887 * AU_KM
            n_j = math.sqrt(MU_SUN_KM3_S2 / (r_j**3))
            th = n_j * t_sec + 0.6
            r3b = (r_j * math.cos(th), r_j * math.sin(th), 0.0)
            mu_3b = MU_JUPITER_KM3_S2
        else:
            scale_au = 1.5237 if central_body == "mars" else 5.203 if central_body == "jupiter" else 1.0
            r_s = scale_au * AU_KM
            n_s = math.sqrt(MU_SUN_KM3_S2 / (r_s**3))
            th = n_s * t_sec
            r3b = (r_s * math.cos(th), r_s * math.sin(th), 0.0)
            mu_3b = MU_SUN_KM3_S2
        d = vec_sub(r3b, r)
        d3 = max(vec_mag(d), 1e3) ** 3
        r3b3 = vec_mag(r3b) ** 3
        ax += mu_3b * (d[0] / d3 - r3b[0] / r3b3)
        ay += mu_3b * (d[1] / d3 - r3b[1] / r3b3)
        az += mu_3b * (d[2] / d3 - r3b[2] / r3b3)

    return (ax, ay, az)


def propagate_trajectory(
    central_body: str,
    initial_position_km: tuple[float, float, float],
    initial_velocity_km_s: tuple[float, float, float],
    duration_days: float,
    integrator: str = "rk45",
    enable_j2: bool = False,
    enable_srp: bool = False,
    enable_third_body: bool = False,
    mass_kg: float = 1200.0,
    area_m2: float = 12.0,
    cr: float = 1.3,
    sample_count: int = 60,
    fixed_step_sec: float | None = None,
) -> dict[str, Any]:
    body = CENTRAL_BODIES[central_body]
    mu = body.mu_km3_s2
    total_sec = max(1.0, duration_days * SECONDS_PER_DAY)
    r0 = vec_mag(initial_position_km)
    est_period = 2.0 * math.pi * math.sqrt((max(r0, body.radius_km) ** 3) / mu)
    h_default = min(max(5.0, est_period / 240.0), total_sec / 40.0)
    h_init = fixed_step_sec if fixed_step_sec is not None else h_default
    pos_tol = max(1e-7, r0 * 1e-11)

    def deriv(s: list[float], t: float) -> list[float]:
        acc = _compute_acceleration(
            (s[0], s[1], s[2]),
            t,
            central_body,
            enable_j2,
            enable_srp,
            enable_third_body,
            mass_kg,
            area_m2,
            cr,
        )
        return [s[3], s[4], s[5], acc[0], acc[1], acc[2]]

    def rk4_step(s: list[float], t: float, h: float) -> list[float]:
        k1 = deriv(s, t)
        k2 = deriv([s[i] + 0.5 * h * k1[i] for i in range(6)], t + 0.5 * h)
        k3 = deriv([s[i] + 0.5 * h * k2[i] for i in range(6)], t + 0.5 * h)
        k4 = deriv([s[i] + h * k3[i] for i in range(6)], t + h)
        return [s[i] + (h / 6.0) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) for i in range(6)]

    def rk45_step(s: list[float], t: float, h: float) -> tuple[list[float], float, float]:
        k1 = deriv(s, t)
        k2 = deriv([s[i] + h * (1 / 5) * k1[i] for i in range(6)], t + h / 5)
        k3 = deriv([s[i] + h * ((3 / 40) * k1[i] + (9 / 40) * k2[i]) for i in range(6)], t + 3 * h / 10)
        k4 = deriv([s[i] + h * ((44 / 45) * k1[i] - (56 / 15) * k2[i] + (32 / 9) * k3[i]) for i in range(6)], t + 4 * h / 5)
        k5 = deriv([s[i] + h * ((19372 / 6561) * k1[i] - (25360 / 2187) * k2[i] + (64448 / 6561) * k3[i] - (212 / 729) * k4[i]) for i in range(6)], t + 8 * h / 9)
        k6 = deriv([s[i] + h * ((9017 / 3168) * k1[i] - (355 / 33) * k2[i] + (46732 / 5247) * k3[i] + (49 / 176) * k4[i] - (5103 / 18656) * k5[i]) for i in range(6)], t + h)
        nxt = [s[i] + h * ((35 / 384) * k1[i] + (500 / 1113) * k3[i] + (125 / 192) * k4[i] - (2187 / 6784) * k5[i] + (11 / 84) * k6[i]) for i in range(6)]
        k7 = deriv(nxt, t + h)
        err = [
            h * ((71 / 57600) * k1[i] - (71 / 16695) * k3[i] + (71 / 1920) * k4[i] - (17253 / 339200) * k5[i] + (22 / 525) * k6[i] - (1 / 40) * k7[i])
            for i in range(6)
        ]
        return nxt, math.sqrt(err[0] ** 2 + err[1] ** 2 + err[2] ** 2), math.sqrt(err[3] ** 2 + err[4] ** 2 + err[5] ** 2)

    sample_times = [(i / sample_count) * total_sec for i in range(sample_count + 1)]
    s0 = [
        initial_position_km[0],
        initial_position_km[1],
        initial_position_km[2],
        initial_velocity_km_s[0],
        initial_velocity_km_s[1],
        initial_velocity_km_s[2],
    ]

    def run_integrator(mode: str, step0: float, tol: float, targets: list[float]):
        t = 0.0
        cur = list(s0)
        h = min(max(1.0, step0), total_sec)
        accepted = 0
        rejected = 0
        out: list[tuple[float, list[float]]] = []
        s_idx = 0
        while s_idx < len(targets) and targets[s_idx] <= 0:
            out.append((0.0, list(cur)))
            s_idx += 1

        guard = 0
        while t < total_sec - 1e-9 and guard < 250_000:
            guard += 1
            rem = total_sec - t
            tgt = targets[s_idx] if s_idx < len(targets) else total_sec
            if mode == "rk4":
                step = min(step0, rem, max(1e-6, tgt - t))
                cur = rk4_step(cur, t, step)
                t += step
                accepted += 1
            else:
                step = min(h, rem, max(1e-6, tgt - t))
                nxt, ep, ev = rk45_step(cur, t, step)
                ratio = max(ep / tol, ev / max(tol * 1e-3, 1e-12), 1e-16)
                if ratio <= 1.0 or step <= 1e-3:
                    cur = nxt
                    t += step
                    accepted += 1
                    fac = min(4.0, max(0.2, 0.9 * (ratio ** -0.2)))
                    if step >= h * 0.999:
                        h = min(total_sec / 10.0, max(1e-2, step * fac))
                else:
                    rejected += 1
                    h = max(1e-3, step * max(0.1, 0.9 * (ratio ** -0.25)))
                    continue
            while s_idx < len(targets) and t >= targets[s_idx] - 1e-7:
                out.append((targets[s_idx], list(cur)))
                s_idx += 1
        while len(out) < len(targets):
            out.append((total_sec, list(cur)))
        return out, cur, accepted, rejected

    samples, final_s, accepted, rejected = run_integrator(integrator, h_init, pos_tol, sample_times)
    _, ref_final, _, _ = run_integrator("rk45", max(1.0, h_init * 0.5), pos_tol * 0.1, [0.0, total_sec])
    sens_diff_km = math.sqrt(sum((final_s[i] - ref_final[i]) ** 2 for i in range(3)))

    def format_epoch(idx: int, t_s: float, s: list[float]) -> dict[str, Any]:
        pos = (s[0], s[1], s[2])
        vel = (s[3], s[4], s[5])
        r_m = vec_mag(pos)
        v_m = vec_mag(vel)
        h_m = vec_mag(vec_cross(pos, vel))
        eps = (v_m * v_m) / 2.0 - mu / max(r_m, 1e-9)
        return {
            "index": idx,
            "elapsed_sec": t_s,
            "elapsed_days": t_s / SECONDS_PER_DAY,
            "position_km": pos,
            "velocity_km_s": vel,
            "radius_km": r_m,
            "speed_km_s": v_m,
            "specific_energy_km2_s2": eps,
            "angular_momentum_km2_s": h_m,
        }

    states = [format_epoch(i, t_s, st) for i, (t_s, st) in enumerate(samples)]
    init_st, end_st = states[0], states[-1]
    e0, ef = init_st["specific_energy_km2_s2"], end_st["specific_energy_km2_s2"]
    h0, hf = init_st["angular_momentum_km2_s"], end_st["angular_momentum_km2_s"]

    return {
        "central_body": central_body,
        "reference_frame": body.default_frame,
        "integrator": integrator,
        "accepted_steps": accepted,
        "rejected_steps": rejected,
        "initial_state": init_st,
        "final_state": end_st,
        "initial_coe": state_to_orbital_elements(init_st["position_km"], init_st["velocity_km_s"], central_body),
        "final_coe": state_to_orbital_elements(end_st["position_km"], end_st["velocity_km_s"], central_body),
        "relative_energy_drift": abs(ef - e0) / abs(e0) if abs(e0) > 1e-12 else abs(ef - e0),
        "relative_h_drift": abs(hf - h0) / abs(h0) if abs(h0) > 1e-12 else abs(hf - h0),
        "step_sensitivity_diff_km": sens_diff_km,
        "states": states,
    }


def compute_hohmann_transfer(central_body: str, r1_km: float, r2_km: float) -> dict[str, Any]:
    mu = CENTRAL_BODIES[central_body].mu_km3_s2
    a_t = 0.5 * (r1_km + r2_km)
    vc1 = math.sqrt(mu / r1_km)
    vc2 = math.sqrt(mu / r2_km)
    vt1 = math.sqrt(mu * (2.0 / r1_km - 1.0 / a_t))
    vt2 = math.sqrt(mu * (2.0 / r2_km - 1.0 / a_t))
    dv1 = abs(vt1 - vc1)
    dv2 = abs(vc2 - vt2)
    t_sec = math.pi * math.sqrt((a_t**3) / mu)
    return {
        "central_body": central_body,
        "r1_km": r1_km,
        "r2_km": r2_km,
        "a_transfer_km": a_t,
        "vc1_km_s": vc1,
        "vc2_km_s": vc2,
        "vt1_km_s": vt1,
        "vt2_km_s": vt2,
        "delta_v1_km_s": dv1,
        "delta_v2_km_s": dv2,
        "total_delta_v_km_s": dv1 + dv2,
        "transfer_time_sec": t_sec,
        "transfer_time_days": t_sec / SECONDS_PER_DAY,
    }


def stumpff_c(z: float) -> float:
    if z > 1e-6:
        s = math.sqrt(z)
        return (1.0 - math.cos(s)) / z
    if z < -1e-6:
        s = math.sqrt(-z)
        return (math.cosh(s) - 1.0) / (-z)
    return 0.5 - z / 24.0 + (z * z) / 720.0


def stumpff_s(z: float) -> float:
    if z > 1e-6:
        s = math.sqrt(z)
        return (s - math.sin(s)) / (s**3)
    if z < -1e-6:
        s = math.sqrt(-z)
        return (math.sinh(s) - s) / (s**3)
    return 1.0 / 6.0 - z / 120.0 + (z * z) / 5040.0


def solve_lambert(
    central_body: str,
    r1_km: tuple[float, float, float],
    r2_km: tuple[float, float, float],
    tof_sec: float,
    direction: str = "prograde",
) -> dict[str, Any]:
    mu = CENTRAL_BODIES[central_body].mu_km3_s2
    r1 = vec_mag(r1_km)
    r2 = vec_mag(r2_km)
    if r1 < 1e-3 or r2 < 1e-3 or tof_sec <= 0:
        return {"converged": False, "failure_reason": "r1, r2, and tof_sec must be strictly positive."}

    c12 = vec_cross(r1_km, r2_km)
    cos_dt = max(-1.0, min(1.0, vec_dot(r1_km, r2_km) / (r1 * r2)))
    d_theta = math.acos(cos_dt)
    if direction == "prograde":
        if c12[2] < 0:
            d_theta = 2.0 * math.pi - d_theta
    else:
        if c12[2] >= 0:
            d_theta = 2.0 * math.pi - d_theta

    if abs(math.sin(d_theta)) < 1e-7:
        return {"converged": False, "failure_reason": "Singularity: 0 or 180 deg transfer angle."}

    A = math.sin(d_theta) * math.sqrt((r1 * r2) / (1.0 - math.cos(d_theta)))

    def y_of_z(z: float) -> float:
        cz = stumpff_c(z)
        sz = stumpff_s(z)
        return r1 + r2 + (A * (z * sz - 1.0)) / math.sqrt(max(cz, 1e-15))

    def f_of_z(z: float) -> float:
        y = y_of_z(z)
        if y <= 0:
            return float("nan")
        cz = stumpff_c(z)
        sz = stumpff_s(z)
        return ((y / cz) ** 1.5) * sz + A * math.sqrt(y) - math.sqrt(mu) * tof_sec

    z_low = -4.0 * math.pi * math.pi
    z_high = 4.0 * math.pi * math.pi - 1e-4
    while y_of_z(z_low) <= 0 and z_low < 0:
        z_low *= 0.5
    f_low = f_of_z(z_low)
    f_high = f_of_z(z_high)
    if math.isnan(f_low):
        for z_scan in [i * 0.25 - 20.0 for i in range(236)]:
            fv = f_of_z(z_scan)
            if not math.isnan(fv):
                z_low, f_low = z_scan, fv
                break

    f0 = f_of_z(0.0)
    if not math.isnan(f0) and not math.isnan(f_high) and f0 * f_high <= 0:
        z_low, f_low = 0.0, f0
    elif not math.isnan(f_low) and not math.isnan(f0) and f_low * f0 <= 0:
        z_high, f_high = 0.0, f0
    elif math.isnan(f_low) or math.isnan(f_high) or f_low * f_high > 0:
        prev_z, prev_f = z_low, f_low
        found = False
        for i in range(1, 401):
            tz = z_low + (i / 400.0) * (z_high - z_low)
            tf = f_of_z(tz)
            if not math.isnan(prev_f) and not math.isnan(tf) and prev_f * tf <= 0:
                z_low, f_low, z_high, f_high = prev_z, prev_f, tz, tf
                found = True
                break
            if not math.isnan(tf):
                prev_z, prev_f = tz, tf
        if not found:
            return {"converged": False, "failure_reason": "Failed to bracket Lambert universal variable root."}

    z = 0.5 * (z_low + z_high)
    converged = False
    iters = 0
    for it in range(1, 81):
        iters = it
        F = f_of_z(z)
        if math.isnan(F):
            z = 0.5 * (z_low + z_high)
            continue
        if abs(F) < 1e-8:
            converged = True
            break
        if not math.isnan(f_low) and F * f_low <= 0:
            z_high, f_high = z, F
        else:
            z_low, f_low = z, F

        cz, sz, y = stumpff_c(z), stumpff_s(z), y_of_z(z)
        if abs(z) < 1e-7:
            y0 = y_of_z(0.0)
            dfdz = (math.sqrt(2.0) / 40.0) * (y0**1.5) + (A / 8.0) * (math.sqrt(y0) + A * math.sqrt(1.0 / (2.0 * y0)))
        else:
            dfdz = ((y / cz) ** 1.5) * ((1.0 / (2.0 * z)) * (cz - (3.0 * sz) / (2.0 * cz)) + (3.0 * sz * sz) / (4.0 * cz)) + (A / 8.0) * ((3.0 * sz * math.sqrt(y)) / cz + A * math.sqrt(cz / y))
        z_next = z - F / dfdz if abs(dfdz) > 1e-14 else 0.5 * (z_low + z_high)
        if not math.isfinite(z_next) or z_next <= z_low or z_next >= z_high:
            z_next = 0.5 * (z_low + z_high)
        if abs(z_next - z) < 1e-11:
            z = z_next
            converged = True
            break
        z = z_next

    if not converged and abs(z_high - z_low) < 1e-7:
        converged = True
    if not converged:
        return {"converged": False, "failure_reason": "Lambert solver did not converge in 80 iterations."}

    y_f = y_of_z(z)
    f = 1.0 - y_f / r1
    g = A * math.sqrt(y_f / mu)
    g_dot = 1.0 - y_f / r2
    v1 = vec_scale(vec_sub(r2_km, vec_scale(r1_km, f)), 1.0 / g)
    v2 = vec_scale(vec_sub(vec_scale(r2_km, g_dot), r1_km), 1.0 / g)

    return {
        "converged": True,
        "failure_reason": None,
        "iterations": iters,
        "z_final": z,
        "transfer_angle_deg": math.degrees(d_theta),
        "v1_km_s": v1,
        "v2_km_s": v2,
        "lagrange_f": f,
        "lagrange_g": g,
        "lagrange_g_dot": g_dot,
    }
