"""Preset mission scenarios, full end-to-end pipeline execution, JSON config compatibility, and CSV/JSON export."""

import csv
import json
from pathlib import Path
from typing import Any

from .communications import analyze_communication_link
from .constants import AU_KM, MODEL_VERSION, SECONDS_PER_DAY
from .orbital import compute_hohmann_transfer, propagate_trajectory, solve_lambert
from .sources import SPACECRAFT_CATALOG, fetch_horizons_vector
from .xnav import run_xnav_simulation

PRESET_SCENARIOS: dict[str, dict[str, Any]] = {
    "earth-to-mars": {
        "scenarioId": "earth-to-mars",
        "missionName": "Mars Transfer Benchmark (Type-I)",
        "spacecraftName": "Ares-Nav Explorer",
        "centralBody": "sun",
        "targetDestination": "mars",
        "epochIso": "2026-11-21T00:00:00Z",
        "durationDays": 259.0,
        "initialPositionKm": {"x": AU_KM, "y": 0.0, "z": 0.0},
        "initialVelocityKmS": {"x": 0.0, "y": 32.729, "z": 0.45},
        "spacecraftMassKg": 1450.0,
        "areaM2": 14.0,
        "crReflectivity": 1.32,
        "enableJ2": False,
        "enableSrp": True,
        "enableThirdBody": False,
        "integrator": "rk45",
        "navArchitecture": "hybrid-dsn-xnav",
        "seed": 20261121,
        "commConfig": {
            "frequencyGHz": 8.42,
            "txPowerW": 35.0,
            "txAntennaGainDbi": 41.5,
            "rxAntennaGainDbi": 68.2,
            "systemLossesDb": 2.5,
            "systemNoiseTempK": 38.0,
            "dataRateBps": 16384.0,
            "requiredEbN0Db": 3.2,
            "solarConjunctionThresholdDeg": 3.0,
        },
    },
    "voyager-xnav": {
        "scenarioId": "voyager-xnav",
        "missionName": "Heliosphere Autonomous XNAV Study",
        "spacecraftName": "Voyager-Class Deep Probe",
        "centralBody": "sun",
        "targetDestination": "interstellar",
        "epochIso": "2026-11-21T00:00:00Z",
        "durationDays": 180.0,
        "initialPositionKm": {"x": -32.2 * AU_KM, "y": -137.2 * AU_KM, "z": 99.3 * AU_KM},
        "initialVelocityKmS": {"x": -2.07, "y": -13.61, "z": 9.83},
        "spacecraftMassKg": 721.9,
        "areaM2": 10.7,
        "crReflectivity": 1.25,
        "enableJ2": False,
        "enableSrp": False,
        "enableThirdBody": False,
        "integrator": "rk45",
        "navArchitecture": "autonomous-xnav",
        "seed": 19770905,
        "commConfig": {
            "frequencyGHz": 8.415,
            "txPowerW": 22.4,
            "txAntennaGainDbi": 48.0,
            "rxAntennaGainDbi": 74.3,
            "systemLossesDb": 3.0,
            "systemNoiseTempK": 28.0,
            "dataRateBps": 160.0,
            "requiredEbN0Db": 2.5,
            "solarConjunctionThresholdDeg": 3.0,
        },
    },
    "earth-to-moon": {
        "scenarioId": "earth-to-moon",
        "missionName": "Cislunar Transfer & Occultation Analysis",
        "spacecraftName": "Chandrayaan-Class TLI Vehicle",
        "centralBody": "earth",
        "targetDestination": "moon",
        "epochIso": "2026-11-21T00:00:00Z",
        "durationDays": 5.0,
        "initialPositionKm": {"x": 6678.0, "y": 0.0, "z": 0.0},
        "initialVelocityKmS": {"x": 0.0, "y": 10.818, "z": 0.92},
        "spacecraftMassKg": 2150.0,
        "areaM2": 9.5,
        "crReflectivity": 1.3,
        "enableJ2": True,
        "enableSrp": True,
        "enableThirdBody": False,
        "integrator": "rk45",
        "navArchitecture": "hybrid-dsn-xnav",
        "seed": 20230714,
        "commConfig": {
            "frequencyGHz": 2.25,
            "txPowerW": 15.0,
            "txAntennaGainDbi": 22.0,
            "rxAntennaGainDbi": 52.0,
            "systemLossesDb": 2.0,
            "systemNoiseTempK": 110.0,
            "dataRateBps": 262144.0,
            "requiredEbN0Db": 4.5,
            "solarConjunctionThresholdDeg": 3.0,
        },
    },
}


def load_mission_config(scenario_id: str = "earth-to-mars", config_path: str | None = None) -> dict[str, Any]:
    if config_path:
        raw = json.loads(Path(config_path).read_text(encoding="utf-8"))
        # Compatible both with website Reports -> Scenario JSON ({ missionConfig: ... }) and flat MissionConfig
        if isinstance(raw, dict) and "missionConfig" in raw:
            return raw["missionConfig"]
        return raw
    if scenario_id not in PRESET_SCENARIOS:
        raise ValueError(f"Unknown scenario '{scenario_id}'. Choose from: {', '.join(PRESET_SCENARIOS)}")
    return json.loads(json.dumps(PRESET_SCENARIOS[scenario_id]))


def run_mission_pipeline(
    cfg: dict[str, Any],
    sync_horizons: bool = False,
    pulsar_ids: list[str] | None = None,
    spacecraft_naif: str | None = None,
) -> dict[str, Any]:
    r0 = (
        float(cfg["initialPositionKm"]["x"]),
        float(cfg["initialPositionKm"]["y"]),
        float(cfg["initialPositionKm"]["z"]),
    )
    v0 = (
        float(cfg["initialVelocityKmS"]["x"]),
        float(cfg["initialVelocityKmS"]["y"]),
        float(cfg["initialVelocityKmS"]["z"]),
    )
    central = cfg.get("centralBody", "sun")

    horizons_ephem = None
    if sync_horizons:
        target = spacecraft_naif or ("-31" if cfg.get("scenarioId") == "voyager-xnav" else "-156")
        horizons_ephem = fetch_horizons_vector(target, cfg.get("epochIso", "2026-11-21")[:10])
        if horizons_ephem.get("classification") == "OBSERVED" and cfg.get("useHorizonsState"):
            r0 = horizons_ephem["position_km"]
            v0 = horizons_ephem["velocity_km_s"]

    prop = propagate_trajectory(
        central_body=central,
        initial_position_km=r0,
        initial_velocity_km_s=v0,
        duration_days=float(cfg.get("durationDays", 259.0)),
        integrator=cfg.get("integrator", "rk45"),
        enable_j2=bool(cfg.get("enableJ2", False)),
        enable_srp=bool(cfg.get("enableSrp", False)),
        enable_third_body=bool(cfg.get("enableThirdBody", False)),
        mass_kg=float(cfg.get("spacecraftMassKg", 1450.0)),
        area_m2=float(cfg.get("areaM2", 14.0)),
        cr=float(cfg.get("crReflectivity", 1.32)),
        sample_count=60,
    )

    hohmann = (
        compute_hohmann_transfer("earth", 6678.0, 384400.0)
        if central == "earth"
        else compute_hohmann_transfer("sun", AU_KM, 1.52371 * AU_KM)
    )

    lambert = solve_lambert(
        central_body=central,
        r1_km=prop["initial_state"]["position_km"],
        r2_km=prop["final_state"]["position_km"],
        tof_sec=float(cfg.get("durationDays", 259.0)) * SECONDS_PER_DAY,
        direction="prograde",
    )

    xnav = run_xnav_simulation(
        true_position_km=prop["final_state"]["position_km"],
        true_velocity_km_s=prop["final_state"]["velocity_km_s"],
        central_body=central,
        initial_guess_error_km=1850.0,
        pulsar_ids=pulsar_ids,
        observation_duration_sec=3600.0,
        toa_noise_multiplier=1.0,
        dsn_disrupted=cfg.get("scenarioId") == "voyager-xnav",
        architecture=cfg.get("navArchitecture", "autonomous-xnav"),
        seed=int(cfg.get("seed", 20261121)),
    )

    comms = analyze_communication_link(
        cfg.get("commConfig", {}),
        trajectory_states=prop["states"],
        central_body=central,
        epoch_iso=cfg.get("epochIso", "2026-11-21T00:00:00Z"),
    )

    return {
        "model_version": MODEL_VERSION,
        "mission_config": cfg,
        "horizons_ephemeris": horizons_ephem,
        "propagation": prop,
        "hohmann": hohmann,
        "lambert": lambert,
        "xnav": xnav,
        "communications": comms,
        "catalog_summary": {
            "spacecraft_count": len(SPACECRAFT_CATALOG),
            "pulsar_count": len(xnav["pulsar_observations"]),
        },
    }


def write_json_report(report: dict[str, Any], out_path: str) -> Path:
    p = Path(out_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return p


def write_csv_reports(report: dict[str, Any], out_dir: str) -> list[Path]:
    d = Path(out_dir)
    d.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []

    traj_path = d / "trajectory.csv"
    with traj_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["step_index", "elapsed_days", "rx_km", "ry_km", "rz_km", "vx_km_s", "vy_km_s", "vz_km_s", "radius_km", "speed_km_s", "specific_energy_km2_s2"])
        for st in report["propagation"]["states"]:
            r, v = st["position_km"], st["velocity_km_s"]
            w.writerow([st["index"], f"{st['elapsed_days']:.6f}", r[0], r[1], r[2], v[0], v[1], v[2], st["radius_km"], st["speed_km_s"], st["specific_energy_km2_s2"]])
    written.append(traj_path)

    ekf_path = d / "xnav_ekf.csv"
    with ekf_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["epoch_index", "elapsed_sec", "pos_error_km", "vel_error_km_s", "uncertainty_1sigma_km", "clock_bias_error_us", "rms_residual_us"])
        for row in report["xnav"]["ekf_history"]:
            w.writerow([row["epoch_index"], row["elapsed_sec"], row["position_error_km"], row["velocity_error_km_s"], row["uncertainty_1sigma_km"], row["clock_bias_error_us"], row["rms_residual_us"]])
    written.append(ekf_path)

    comms_path = d / "comms_link.csv"
    with comms_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["elapsed_days", "range_km", "owlt_sec", "fspl_db", "cn0_db_hz", "eb_n0_db", "link_margin_db", "visibility"])
        for pt in report["communications"]["time_series"]:
            w.writerow([f"{pt['elapsed_days']:.4f}", pt["range_km"], pt["one_way_light_time_sec"], pt["fspl_db"], pt["cn0_db_hz"], pt["eb_n0_db"], pt["link_margin_db"], pt["geometric_visibility"]])
    written.append(comms_path)

    return written
