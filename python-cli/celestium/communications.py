"""Deep-Space RF / Optical Link Budget and Geometric Visibility Analyzer."""

import math
from typing import Any

from .constants import AU_KM, C_KMS, C_MPS, K_BOLTZMANN_JK, RADIUS_EARTH_KM
from .orbital import vec_mag, vec_sub
from .sources import compute_keplerian_earth_km

RAD_TO_DEG = 180.0 / math.pi


def compute_fspl_db(range_km: float, frequency_ghz: float) -> float:
    range_m = max(1.0, range_km * 1000.0)
    freq_hz = max(1e6, frequency_ghz * 1e9)
    wavelength_m = C_MPS / freq_hz
    return 20.0 * math.log10((4.0 * math.pi * range_m) / wavelength_m)


def evaluate_single_link_point(
    frequency_ghz: float,
    tx_power_w: float,
    tx_gain_dbi: float,
    rx_gain_dbi: float,
    system_losses_db: float,
    noise_temp_k: float,
    data_rate_bps: float,
    required_eb_n0_db: float,
    range_km: float,
    elapsed_days: float = 0.0,
    solar_elongation_deg: float = 45.0,
    earth_occulted: bool = False,
    conjunction_threshold_deg: float = 3.0,
) -> dict[str, Any]:
    safe_range = max(1.0, range_km)
    owlt_sec = safe_range / C_KMS
    rtt_sec = 2.0 * owlt_sec
    fspl_db = compute_fspl_db(safe_range, frequency_ghz)

    pt_dbw = 10.0 * math.log10(max(1e-12, tx_power_w))
    pr_dbw = pt_dbw + tx_gain_dbi + rx_gain_dbi - fspl_db - system_losses_db
    n0_dbw_hz = 10.0 * math.log10(K_BOLTZMANN_JK * max(1.0, noise_temp_k))
    cn0_db_hz = pr_dbw - n0_dbw_hz
    eb_n0_db = cn0_db_hz - 10.0 * math.log10(max(1.0, data_rate_bps))
    margin_db = eb_n0_db - required_eb_n0_db

    conj_risk = solar_elongation_deg < conjunction_threshold_deg
    visibility = "OCCULTED" if earth_occulted else "CONJUNCTION_RISK" if conj_risk else "VISIBLE"

    return {
        "elapsed_days": elapsed_days,
        "range_km": safe_range,
        "range_au": safe_range / AU_KM,
        "one_way_light_time_sec": owlt_sec,
        "round_trip_light_time_sec": rtt_sec,
        "fspl_db": fspl_db,
        "received_power_dbw": pr_dbw,
        "cn0_db_hz": cn0_db_hz,
        "eb_n0_db": eb_n0_db,
        "link_margin_db": margin_db,
        "solar_elongation_deg": solar_elongation_deg,
        "earth_occulted": earth_occulted,
        "solar_conjunction_risk": conj_risk,
        "geometric_visibility": visibility,
    }


def analyze_communication_link(
    comm_cfg: dict[str, Any],
    trajectory_states: list[dict[str, Any]] | None = None,
    central_body: str = "sun",
    epoch_iso: str = "2026-11-21T00:00:00Z",
    range_km: float | None = None,
) -> dict[str, Any]:
    freq_ghz = float(comm_cfg.get("frequencyGHz", comm_cfg.get("frequency_ghz", 8.42)))
    tx_power_w = float(comm_cfg.get("txPowerW", comm_cfg.get("tx_power_w", 35.0)))
    tx_gain = float(comm_cfg.get("txAntennaGainDbi", comm_cfg.get("tx_gain_dbi", 41.5)))
    rx_gain = float(comm_cfg.get("rxAntennaGainDbi", comm_cfg.get("rx_gain_dbi", 68.2)))
    losses_db = float(comm_cfg.get("systemLossesDb", comm_cfg.get("system_losses_db", 2.5)))
    noise_k = float(comm_cfg.get("systemNoiseTempK", comm_cfg.get("noise_temp_k", 38.0)))
    rate_bps = float(comm_cfg.get("dataRateBps", comm_cfg.get("data_rate_bps", 16384.0)))
    req_eb_n0 = float(comm_cfg.get("requiredEbN0Db", comm_cfg.get("required_eb_n0_db", 3.2)))
    conj_thresh = float(
        comm_cfg.get("solarConjunctionThresholdDeg", comm_cfg.get("conjunction_threshold_deg", 3.0))
    )

    series: list[dict[str, Any]] = []
    if trajectory_states:
        earth_helio = compute_keplerian_earth_km(epoch_iso)
        for st in trajectory_states:
            pos = st["position_km"]
            r_mag = st["radius_km"]
            solar_elong = 45.0
            occulted = False
            if central_body == "sun":
                sc_earth = vec_sub(pos, earth_helio)
                rng_km = max(100.0, vec_mag(sc_earth))
                sun_earth = (-earth_helio[0], -earth_helio[1], -earth_helio[2])
                r_es = vec_mag(sun_earth)
                dot_v = sc_earth[0] * sun_earth[0] + sc_earth[1] * sun_earth[1] + sc_earth[2] * sun_earth[2]
                cos_a = max(-1.0, min(1.0, dot_v / (rng_km * r_es)))
                ang_deg = math.acos(cos_a) * RAD_TO_DEG
                solar_elong = ang_deg if rng_km > r_es else 90.0
            elif central_body == "earth":
                rng_km = max(100.0, r_mag)
                occulted = pos[0] < -RADIUS_EARTH_KM * 0.5 and math.hypot(pos[1], pos[2]) < RADIUS_EARTH_KM
            else:
                base = 384_400.0 if central_body == "moon" else 1.524 * AU_KM if central_body == "mars" else 5.203 * AU_KM
                rng_km = max(1000.0, base + pos[0])
                r_body = 1737.4 if central_body == "moon" else 3396.19 if central_body == "mars" else 71492.0
                occulted = pos[0] < 0 and math.hypot(pos[1], pos[2]) < r_body

            series.append(
                evaluate_single_link_point(
                    freq_ghz,
                    tx_power_w,
                    tx_gain,
                    rx_gain,
                    losses_db,
                    noise_k,
                    rate_bps,
                    req_eb_n0,
                    rng_km,
                    st["elapsed_days"],
                    solar_elong,
                    occulted,
                    conj_thresh,
                )
            )
    else:
        series.append(
            evaluate_single_link_point(
                freq_ghz,
                tx_power_w,
                tx_gain,
                rx_gain,
                losses_db,
                noise_k,
                rate_bps,
                req_eb_n0,
                range_km if range_km is not None else AU_KM,
                0.0,
                45.0,
                False,
                conj_thresh,
            )
        )

    margins = [p["link_margin_db"] for p in series]
    return {
        "wavelength_m": C_MPS / (max(1e6, freq_ghz * 1e9)),
        "tx_power_dbw": 10.0 * math.log10(max(1e-12, tx_power_w)),
        "eirp_dbw": 10.0 * math.log10(max(1e-12, tx_power_w)) + tx_gain,
        "summary_final": series[-1],
        "min_margin_db": min(margins),
        "max_margin_db": max(margins),
        "max_owlt_sec": max(p["one_way_light_time_sec"] for p in series),
        "occulted_points": sum(1 for p in series if p["earth_occulted"]),
        "conjunction_risk_points": sum(1 for p in series if p["solar_conjunction_risk"]),
        "time_series": series,
    }
