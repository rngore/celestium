"""Space Sonar (Active Optical LiDAR & Coherent RF Ranging) Link-Budget, CRLB & Trilateration Engine."""

import math
from typing import Any

from .constants import C_MPS, H_PLANCK_JS, K_BOLTZMANN_JK

SPACE_SONAR_PRESETS = {
    "flash-lidar": {
        "name": "Orbital & Landing Flash LiDAR",
        "wavelength_m": 1550e-9,
        "tx_power_w": 12.0,
        "aperture_m": 0.14,
        "bandwidth_mhz": 150.0,
        "integration_ms": 10.0,
        "range_m": 1200.0,
        "velocity_m_s": -4.5,
        "reflectivity": 0.28,
        "retroreflector": False,
        "quantum_efficiency": 0.72,
        "nep_w": 4.5e-13,
        "optical_efficiency": 0.62,
    },
    "fmcw-coherent-lidar": {
        "name": "Coherent FMCW Doppler LiDAR",
        "wavelength_m": 1550e-9,
        "tx_power_w": 4.5,
        "aperture_m": 0.12,
        "bandwidth_mhz": 800.0,
        "integration_ms": 25.0,
        "range_m": 3500.0,
        "velocity_m_s": -1.85,
        "reflectivity": 0.32,
        "retroreflector": False,
        "quantum_efficiency": 0.78,
        "nep_w": 1.5e-13,
        "optical_efficiency": 0.68,
    },
    "optical-twtt": {
        "name": "Deep-Space Optical Two-Way Ranging",
        "wavelength_m": 1064e-9,
        "tx_power_w": 25.0,
        "aperture_m": 0.35,
        "bandwidth_mhz": 250.0,
        "integration_ms": 100.0,
        "range_m": 250_000.0,
        "velocity_m_s": 18.4,
        "reflectivity": 0.9,
        "retroreflector": True,
        "quantum_efficiency": 0.65,
        "nep_w": 8e-15,
        "optical_efficiency": 0.58,
    },
    "ka-band-pn-rf": {
        "name": "Ka-Band Coherent PN RF Ranging",
        "wavelength_m": C_MPS / 32e9,
        "tx_power_w": 45.0,
        "aperture_m": 1.2,
        "bandwidth_mhz": 24.0,
        "integration_ms": 500.0,
        "range_m": 2_500_000.0,
        "velocity_m_s": 42.0,
        "reflectivity": 0.85,
        "retroreflector": True,
        "quantum_efficiency": 0.9,
        "nep_w": 1.2e-17,
        "optical_efficiency": 0.55,
    },
}


def _normal_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _invert_3x3(m: list[list[float]]) -> list[list[float]]:
    a, b, c = m[0]
    d, e, f = m[1]
    g, h, i = m[2]
    A, B, C = e * i - f * h, -(d * i - f * g), d * h - e * g
    D, E, F = -(b * i - c * h), a * i - c * g, -(a * h - b * g)
    G, H, I = b * f - c * e, -(a * f - c * d), a * e - b * d
    det = a * A + b * B + c * C
    if abs(det) < 1e-24:
        return _invert_3x3([[m[r][c2] + (1e-9 if r == c2 else 0.0) for c2 in range(3)] for r in range(3)])
    inv_d = 1.0 / det
    return [
        [A * inv_d, D * inv_d, G * inv_d],
        [B * inv_d, E * inv_d, H * inv_d],
        [C * inv_d, F * inv_d, I * inv_d],
    ]


def compute_space_sonar_link_budget(
    modality: str = "fmcw-coherent-lidar",
    range_m: float | None = None,
    radial_velocity_m_s: float | None = None,
    tx_power_w: float | None = None,
    aperture_m: float | None = None,
    bandwidth_mhz: float | None = None,
    integration_ms: float | None = None,
    reflectivity: float | None = None,
    target_cross_section_m2: float = 2.5,
    retroreflector: bool | None = None,
    solar_background: bool = True,
) -> dict[str, Any]:
    p = SPACE_SONAR_PRESETS[modality]
    R = max(1.0, range_m if range_m is not None else p["range_m"])
    v_r = radial_velocity_m_s if radial_velocity_m_s is not None else p["velocity_m_s"]
    pt = tx_power_w if tx_power_w is not None else p["tx_power_w"]
    D = aperture_m if aperture_m is not None else p["aperture_m"]
    bw_hz = (bandwidth_mhz if bandwidth_mhz is not None else p["bandwidth_mhz"]) * 1e6
    tau_s = (integration_ms if integration_ms is not None else p["integration_ms"]) * 1e-3
    rho = reflectivity if reflectivity is not None else p["reflectivity"]
    retro = retroreflector if retroreflector is not None else p["retroreflector"]

    lam = p["wavelength_m"]
    f0 = C_MPS / lam
    div_rad = max(2.5e-5, (1.22 * lam) / max(0.02, D))
    beam_area = math.pi * (R * div_rad) ** 2
    rx_area = math.pi * (D / 2.0) ** 2
    intercept = min(1.0, target_cross_section_m2 / max(1e-6, beam_area))

    if modality == "ka-band-pn-rf":
        gain = 0.62 * ((math.pi * D) / lam) ** 2
        fspl = (lam / (4.0 * math.pi * R)) ** 2
        relay = 320.0 if retro else (target_cross_section_m2 * 4.0 * math.pi / (lam * lam)) * fspl
        pr_w = pt * gain * gain * fspl * relay * p["optical_efficiency"]
    else:
        retro_gain = 4500.0 if retro else 1.0
        pr_w = pt * intercept * rho * (rx_area / (math.pi * R * R)) * retro_gain * p["optical_efficiency"]

    pr_w = max(1e-24, pr_w)
    photon_j = H_PLANCK_JS * f0
    sig_photons = (p["quantum_efficiency"] * pr_w * tau_s) / photon_j

    bg_photons = 0.0
    if solar_background and modality != "ka-band-pn-rf":
        irrad = 0.66 if lam < 1200e-9 else 0.27
        fov_sr = math.pi * (div_rad * 1.4) ** 2
        bg_w = irrad * 1.5 * rx_area * rho * (fov_sr / math.pi) * p["optical_efficiency"]
        bg_photons = (p["quantum_efficiency"] * bg_w * tau_s) / photon_j

    thermal_w = (
        K_BOLTZMANN_JK * 290.0 * bw_hz
        if modality == "ka-band-pn-rf"
        else p["nep_w"] * math.sqrt(max(1.0, 1.0 / tau_s))
    )
    thermal_e = (
        (thermal_w * tau_s) / photon_j
        if modality == "ka-band-pn-rf"
        else ((p["quantum_efficiency"] * thermal_w * tau_s) / photon_j) ** 2
    )
    snr_lin = (
        pr_w / max(1e-24, thermal_w)
        if modality == "ka-band-pn-rf"
        else (sig_photons * sig_photons) / max(1e-6, sig_photons + bg_photons + thermal_e)
    )
    snr_db = 10.0 * math.log10(max(1e-12, snr_lin))
    p_det = max(0.0, min(1.0, _normal_cdf(math.sqrt(max(0.0, snr_lin)) - 4.753)))

    eff = math.sqrt(2.0 * max(1e-3, snr_lin))
    crlb_r_m = C_MPS / (2.0 * bw_hz * eff)
    crlb_v_ms = lam / (2.0 * tau_s * eff)
    beta = v_r / C_MPS
    doppler_hz = f0 * (math.sqrt((1.0 - beta) / (1.0 + beta)) - 1.0) * 2.0

    # Quick 4-beacon PDOP & CRLB 3D RMS benchmark
    beacons = [
        (R * 0.92, R * 0.35, R * 0.25),
        (-R * 0.85, R * 0.62, -R * 0.18),
        (R * 0.12, -R * 0.78, R * 0.74),
        (-R * 0.28, -R * 0.45, -R * 0.88),
    ]
    pos0 = (R * 0.14, -R * 0.09, R * 0.06)
    HtH = [[0.0] * 3 for _ in range(3)]
    for bx, by, bz in beacons:
        dx, dy, dz = pos0[0] - bx, pos0[1] - by, pos0[2] - bz
        rng = math.sqrt(dx * dx + dy * dy + dz * dz) or 1.0
        u = [dx / rng, dy / rng, dz / rng]
        for r in range(3):
            for c in range(3):
                HtH[r][c] += u[r] * u[c]
    inv_hth = _invert_3x3(HtH)
    pdop = math.sqrt(max(0.0, inv_hth[0][0] + inv_hth[1][1] + inv_hth[2][2]))

    return {
        "modality": modality,
        "preset_name": p["name"],
        "range_m": R,
        "received_power_dbm": round(10.0 * math.log10(pr_w * 1000.0), 2),
        "snr_db": round(snr_db, 2),
        "detection_probability": round(p_det, 4),
        "crlb_range_sigma_m": crlb_r_m,
        "crlb_velocity_sigma_m_s": crlb_v_ms,
        "crlb_3d_rms_m": crlb_r_m * pdop,
        "pdop": round(pdop, 3),
        "two_way_light_time_sec": (2.0 * R) / C_MPS,
        "relativistic_doppler_hz": round(doppler_hz, 2),
        "link_closed": snr_db >= 10.0 and p_det >= 0.9,
    }
