"""Command-line executor for CELESTIUM Deep-Space Mission Analysis & Autonomous Navigation Workbench."""

import argparse
import json
import sys
from typing import Any

from .communications import analyze_communication_link
from .constants import AU_KM, CENTRAL_BODIES, MODEL_VERSION, SECONDS_PER_DAY
from .orbital import compute_hohmann_transfer, propagate_trajectory, solve_lambert, state_to_orbital_elements
from .scenarios import (
    PRESET_SCENARIOS,
    load_mission_config,
    run_mission_pipeline,
    write_csv_reports,
    write_json_report,
)
from .sources import PULSAR_CATALOG, SPACECRAFT_CATALOG, fetch_horizons_vector
from .space_sonar import SPACE_SONAR_PRESETS, compute_space_sonar_link_budget
from .xnav import run_xnav_simulation


def _parse_vec3(raw: str) -> tuple[float, float, float]:
    parts = [float(x.strip()) for x in raw.split(",")]
    if len(parts) != 3:
        raise ValueError(f"Expected 3 comma-separated floats, got '{raw}'")
    return (parts[0], parts[1], parts[2])


def _print_banner(title: str) -> None:
    print("=" * 76)
    print(f"CELESTIUM CLI v{MODEL_VERSION} | {title}")
    print("=" * 76)


def _print_mission_summary(report: dict[str, Any]) -> None:
    cfg = report["mission_config"]
    prop = report["propagation"]
    xnav = report["xnav"]
    comms = report["communications"]
    hohm = report["hohmann"]
    coe0 = prop["initial_coe"]

    _print_banner(f"MISSION RUN: {cfg['missionName']} ({cfg['spacecraftName']})")
    print(f"Central Body       : {prop['central_body'].upper()} | Frame: {prop['reference_frame']}")
    print(f"Integrator         : {prop['integrator'].upper()} ({prop['accepted_steps']} accepted, {prop['rejected_steps']} rejected)")
    print(f"Energy Drift |de/e|: {prop['conservation_diagnostics']['relative_energy_drift']:.3e}" if "conservation_diagnostics" in prop else f"Energy Drift |de/e|: {prop['relative_energy_drift']:.3e}")
    print(f"Momentum Drift     : {prop['relative_h_drift']:.3e} | Step Sens dr: {prop['step_sensitivity_diff_km']:.3e} km")
    sma_str = f"{coe0['semi_major_axis_km']:.3e} km" if coe0["semi_major_axis_km"] != float("inf") else "Hyperbolic/Parabolic"
    print(f"Initial COE        : a={sma_str}, e={coe0['eccentricity']:.6f}, i={coe0['inclination_deg']:.3f} deg [{coe0['orbit_regime']}]")
    print(f"Final State Radius : {prop['final_state']['radius_km']:.3e} km ({prop['final_state']['speed_km_s']:.4f} km/s)")
    if report.get("horizons_ephemeris"):
        ep = report["horizons_ephemeris"]
        status = ep.get("classification", "ESTIMATED")
        print(f"JPL Horizons Sync  : target={ep.get('target_id')} [{status}] {ep.get('error', 'Vector retrieved')}")
    print("-" * 76)
    print(f"Hohmann Ref Δv     : {hohm['total_delta_v_km_s']:.4f} km/s ({hohm['transfer_time_days']:.2f} days)")
    lam = report["lambert"]
    if lam.get("converged"):
        v1 = lam["v1_km_s"]
        print(f"Lambert Boundary   : converged in {lam['iterations']} iters | v1=({v1[0]:.4f}, {v1[1]:.4f}, {v1[2]:.4f}) km/s")
    print("-" * 76)
    print(f"XNAV Geometry      : pulsars={len(xnav['pulsar_observations'])}, GDOP={xnav['gdop']:.3f}, kappa={xnav['condition_number']:.2f}, rank_def={xnav['rank_deficient']}")
    print(f"XNAV 4-State WLS   : error={xnav['wls_error_km']:.3f} km | clock_bias={xnav['wls_clock_bias_sec']*1e6:.3f} us")
    print(f"XNAV 8-State EKF   : error={xnav['ekf_error_km']:.3f} km (1-sigma ±{xnav['uncertainty_1sigma_km']:.3f} km)")
    print("Architecture Comparison:")
    for row in xnav["architecture_comparison"]:
        print(f"  - {row['label']:<30} pos_err={row['steady_state_pos_error_km']:>8.3f} km | latency={row['update_latency_sec']:>7.2f} s | {row['blackout_resilience']}")
    print("-" * 76)
    fin_c = comms["summary_final"]
    print(f"Final Comms Range  : {fin_c['range_km']:.3e} km ({fin_c['range_au']:.3f} AU) | 1-Way LT={fin_c['one_way_light_time_sec']:.2f} s")
    print(f"RF Link Budget     : FSPL={fin_c['fspl_db']:.2f} dB | C/N0={fin_c['cn0_db_hz']:.2f} dB-Hz | Eb/N0={fin_c['eb_n0_db']:.2f} dB | Margin={fin_c['link_margin_db']:.2f} dB")
    print(f"Visibility         : {fin_c['geometric_visibility']} | Occulted={comms['occulted_points']} | ConjunctionRisk={comms['conjunction_risk_points']}")
    print("=" * 76)


def _cmd_run(args: argparse.Namespace) -> int:
    cfg = load_mission_config(args.scenario, args.config)
    if args.duration_days is not None:
        cfg["durationDays"] = args.duration_days
    if args.integrator is not None:
        cfg["integrator"] = args.integrator
    if args.arch is not None:
        cfg["navArchitecture"] = args.arch
    if args.body is not None:
        cfg["centralBody"] = args.body

    pulsar_ids = [x.strip() for x in args.pulsars.split(",")] if args.pulsars else None
    report = run_mission_pipeline(cfg, sync_horizons=args.sync_horizons, pulsar_ids=pulsar_ids, spacecraft_naif=args.naif_id)

    if args.json_out:
        p = write_json_report(report, args.json_out)
        if not args.quiet:
            print(f"[EXPORT] JSON report written to {p}")
    if args.csv_dir:
        paths = write_csv_reports(report, args.csv_dir)
        if not args.quiet:
            print(f"[EXPORT] CSV datasets written: {', '.join(str(x) for x in paths)}")

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        _print_mission_summary(report)
    return 0


def _cmd_propagate(args: argparse.Namespace) -> int:
    res = propagate_trajectory(
        central_body=args.body,
        initial_position_km=_parse_vec3(args.r0),
        initial_velocity_km_s=_parse_vec3(args.v0),
        duration_days=args.duration_days,
        integrator=args.integrator,
        enable_j2=args.j2,
        enable_srp=args.srp,
        enable_third_body=args.third_body,
    )
    if args.json:
        print(json.dumps(res, indent=2))
    else:
        _print_banner("ORBIT PROPAGATION")
        print(f"Body: {args.body.upper()} | Steps: {res['accepted_steps']} ({res['integrator'].upper()})")
        print(f"Energy Drift: {res['relative_energy_drift']:.3e} | Momentum Drift: {res['relative_h_drift']:.3e}")
        print(f"Final r (km): {res['final_state']['position_km']} | Final v (km/s): {res['final_state']['velocity_km_s']}")
    return 0


def _cmd_lambert(args: argparse.Namespace) -> int:
    res = solve_lambert(args.body, _parse_vec3(args.r1), _parse_vec3(args.r2), args.tof_sec, args.direction)
    if args.json:
        print(json.dumps(res, indent=2))
    else:
        _print_banner("UNIVERSAL-VARIABLE LAMBERT SOLVER")
        print(json.dumps(res, indent=2))
    return 0 if res.get("converged") else 1


def _cmd_hohmann(args: argparse.Namespace) -> int:
    res = compute_hohmann_transfer(args.body, args.r1_km, args.r2_km)
    if args.json:
        print(json.dumps(res, indent=2))
    else:
        _print_banner("HOHMANN TRANSFER ANALYSIS")
        print(f"r1={res['r1_km']:.3e} km -> r2={res['r2_km']:.3e} km ({args.body.upper()})")
        print(f"Δv1={res['delta_v1_km_s']:.4f} km/s | Δv2={res['delta_v2_km_s']:.4f} km/s | Total Δv={res['total_delta_v_km_s']:.4f} km/s")
        print(f"Transfer Time: {res['transfer_time_days']:.3f} days ({res['transfer_time_sec']:.1f} s)")
    return 0


def _cmd_xnav(args: argparse.Namespace) -> int:
    pulsars = [x.strip() for x in args.pulsars.split(",")] if args.pulsars else None
    res = run_xnav_simulation(
        true_position_km=_parse_vec3(args.pos),
        central_body=args.body,
        initial_guess_error_km=args.guess_error_km,
        pulsar_ids=pulsars,
        observation_duration_sec=args.obs_sec,
        toa_noise_multiplier=args.noise_mult,
        dsn_disrupted=args.dsn_blackout,
        architecture=args.arch,
        seed=args.seed,
    )
    if args.json:
        print(json.dumps(res, indent=2))
    else:
        _print_banner("AUTONOMOUS PULSAR NAVIGATION (4-WLS & 8-EKF)")
        if res["geometry_warning"]:
            print(f"[WARNING] {res['geometry_warning']}")
        print(f"GDOP={res['gdop']} | PDOP={res['pdop']} | kappa={res['condition_number']} | RankDef={res['rank_deficient']}")
        print(f"4-State WLS Error: {res['wls_error_km']} km | 8-State EKF Error: {res['ekf_error_km']} km (±{res['uncertainty_1sigma_km']} km)")
    return 0


def _cmd_comms(args: argparse.Namespace) -> int:
    res = analyze_communication_link(
        {
            "frequencyGHz": args.freq_ghz,
            "txPowerW": args.tx_power_w,
            "txAntennaGainDbi": args.tx_gain_dbi,
            "rxAntennaGainDbi": args.rx_gain_dbi,
            "systemLossesDb": args.losses_db,
            "systemNoiseTempK": args.noise_temp_k,
            "dataRateBps": args.rate_bps,
            "requiredEbN0Db": args.req_eb_n0_db,
        },
        range_km=args.range_km,
    )
    if args.json:
        print(json.dumps(res, indent=2))
    else:
        s = res["summary_final"]
        _print_banner("DEEP-SPACE RF / OPTICAL LINK BUDGET")
        print(f"Range: {s['range_km']:.3e} km ({s['range_au']:.3f} AU) | 1-Way Light Time: {s['one_way_light_time_sec']:.3f} s")
        print(f"FSPL: {s['fspl_db']:.2f} dB | Pr: {s['received_power_dbw']:.2f} dBW | C/N0: {s['cn0_db_hz']:.2f} dB-Hz")
        print(f"Eb/N0: {s['eb_n0_db']:.2f} dB | Link Margin: {s['link_margin_db']:.2f} dB")
    return 0


def _cmd_sonar(args: argparse.Namespace) -> int:
    res = compute_space_sonar_link_budget(
        modality=args.modality,
        range_m=args.range_m,
        radial_velocity_m_s=args.vel_ms,
        tx_power_w=args.tx_power_w,
        aperture_m=args.aperture_m,
        bandwidth_mhz=args.bandwidth_mhz,
        integration_ms=args.integration_ms,
        retroreflector=args.retroreflector,
        solar_background=not args.no_solar_bg,
    )
    if args.json:
        print(json.dumps(res, indent=2))
    else:
        _print_banner(f"SPACE SONAR PROXIMITY SENSOR ({res['preset_name']})")
        print(f"Range: {res['range_m']:.1f} m | SNR: {res['snr_db']:.2f} dB | P_det: {res['detection_probability']:.4f} | Closed: {res['link_closed']}")
        print(f"CRLB Range σ: {res['crlb_range_sigma_m']:.4e} m | CRLB Vel σ: {res['crlb_velocity_sigma_m_s']:.4e} m/s | PDOP: {res['pdop']}")
    return 0


def _cmd_ephemeris(args: argparse.Namespace) -> int:
    res = fetch_horizons_vector(args.target, args.date)
    print(json.dumps(res, indent=2))
    return 0


def _cmd_sources(args: argparse.Namespace) -> int:
    payload = {
        "central_bodies": list(CENTRAL_BODIES.keys()),
        "scenarios": list(PRESET_SCENARIOS.keys()),
        "pulsars": [
            {"id": p.id, "name": p.common_name, "period_ms": p.period_ms, "sigma_us": p.timing_precision_us, "source": p.source}
            for p in PULSAR_CATALOG
        ],
        "spacecraft": SPACECRAFT_CATALOG,
        "space_sonar_modalities": list(SPACE_SONAR_PRESETS.keys()),
    }
    if args.json:
        print(json.dumps(payload, indent=2))
    else:
        _print_banner("VERIFIED SOURCES & CATALOGS")
        print("Benchmark Scenarios :", ", ".join(PRESET_SCENARIOS.keys()))
        print("Central Bodies      :", ", ".join(CENTRAL_BODIES.keys()))
        print("ATNF/NICER Pulsars  :")
        for p in PULSAR_CATALOG:
            print(f"  - {p.id:<16} {p.common_name:<30} P={p.period_ms:.4f} ms  σ={p.timing_precision_us} us")
        print("Spacecraft Catalog  :")
        for sc in SPACECRAFT_CATALOG:
            print(f"  - {sc['id']:<22} {sc['name']:<28} NAIF={str(sc['naif_id']):<6} [{sc['agency']}]")
    return 0


def _cmd_interactive(_args: argparse.Namespace) -> int:
    _print_banner("INTERACTIVE MISSION WORKBENCH")
    print("Available benchmark scenarios:", ", ".join(PRESET_SCENARIOS.keys()))
    sc = input("Select scenario [earth-to-mars]: ").strip() or "earth-to-mars"
    cfg = load_mission_config(sc)
    dur_in = input(f"Propagation duration days [{cfg['durationDays']}]: ").strip()
    if dur_in:
        cfg["durationDays"] = float(dur_in)
    integ_in = input(f"Integrator (rk45/rk4) [{cfg['integrator']}]: ").strip().lower()
    if integ_in in ("rk45", "rk4"):
        cfg["integrator"] = integ_in
    sync_in = input("Query live NASA/JPL Horizons ephemeris? (y/N): ").strip().lower() == "y"
    report = run_mission_pipeline(cfg, sync_horizons=sync_in)
    _print_mission_summary(report)
    out_dir = input("Optional CSV export directory (Enter to skip): ").strip()
    if out_dir:
        paths = write_csv_reports(report, out_dir)
        print("Wrote CSV files:", ", ".join(str(p) for p in paths))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="celestium",
        description="CELESTIUM — Deep-Space Mission Analysis & Autonomous Navigation CLI Executor",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_run = sub.add_parser("run", help="Run full end-to-end mission pipeline (or load exported website config JSON)")
    p_run.add_argument("--scenario", default="earth-to-mars", choices=list(PRESET_SCENARIOS.keys()))
    p_run.add_argument("--config", help="Path to website-exported Scenario JSON or MissionConfig JSON")
    p_run.add_argument("--body", choices=list(CENTRAL_BODIES.keys()))
    p_run.add_argument("--duration-days", type=float)
    p_run.add_argument("--integrator", choices=["rk45", "rk4"])
    p_run.add_argument("--arch", choices=["earth-dsn", "autonomous-xnav", "hybrid-dsn-xnav"])
    p_run.add_argument("--pulsars", help="Comma-separated pulsar IDs")
    p_run.add_argument("--sync-horizons", action="store_true", help="Fetch live NASA/JPL Horizons state")
    p_run.add_argument("--naif-id", help="Optional Horizons NAIF ID (e.g. -31, -156)")
    p_run.add_argument("--csv-dir", help="Export trajectory, EKF, and comms CSVs into directory")
    p_run.add_argument("--json-out", help="Write full JSON engineering report to file")
    p_run.add_argument("--json", action="store_true", help="Print JSON output to stdout")
    p_run.add_argument("--quiet", action="store_true")
    p_run.set_defaults(func=_cmd_run)

    p_prop = sub.add_parser("propagate", help="Propagate inertial state vector with RK45/RK4 & perturbations")
    p_prop.add_argument("--body", default="earth", choices=list(CENTRAL_BODIES.keys()))
    p_prop.add_argument("--r0", default="7000,0,0", help="Initial position x,y,z (km)")
    p_prop.add_argument("--v0", default="0,7.546,0", help="Initial velocity vx,vy,vz (km/s)")
    p_prop.add_argument("--duration-days", type=float, default=1.0)
    p_prop.add_argument("--integrator", default="rk45", choices=["rk45", "rk4"])
    p_prop.add_argument("--j2", action="store_true")
    p_prop.add_argument("--srp", action="store_true")
    p_prop.add_argument("--third-body", action="store_true")
    p_prop.add_argument("--json", action="store_true")
    p_prop.set_defaults(func=_cmd_propagate)

    p_lam = sub.add_parser("lambert", help="Solve Universal-Variable Lambert BVP")
    p_lam.add_argument("--body", default="earth", choices=list(CENTRAL_BODIES.keys()))
    p_lam.add_argument("--r1", default="5000,10000,2100")
    p_lam.add_argument("--r2", default="-14600,2500,7000")
    p_lam.add_argument("--tof-sec", type=float, default=3600.0)
    p_lam.add_argument("--direction", default="prograde", choices=["prograde", "retrograde"])
    p_lam.add_argument("--json", action="store_true")
    p_lam.set_defaults(func=_cmd_lambert)

    p_hoh = sub.add_parser("hohmann", help="Compute coplanar circular Hohmann transfer")
    p_hoh.add_argument("--body", default="sun", choices=list(CENTRAL_BODIES.keys()))
    p_hoh.add_argument("--r1-km", type=float, default=AU_KM)
    p_hoh.add_argument("--r2-km", type=float, default=1.52371 * AU_KM)
    p_hoh.add_argument("--json", action="store_true")
    p_hoh.set_defaults(func=_cmd_hohmann)

    p_xnav = sub.add_parser("xnav", help="Run 4-State WLS + 8-State EKF Autonomous Pulsar Navigation")
    p_xnav.add_argument("--body", default="sun", choices=list(CENTRAL_BODIES.keys()))
    p_xnav.add_argument("--pos", default=f"{AU_KM},0,0")
    p_xnav.add_argument("--guess-error-km", type=float, default=1850.0)
    p_xnav.add_argument("--pulsars", help="Comma-separated pulsar IDs")
    p_xnav.add_argument("--obs-sec", type=float, default=3600.0)
    p_xnav.add_argument("--noise-mult", type=float, default=1.0)
    p_xnav.add_argument("--dsn-blackout", action="store_true")
    p_xnav.add_argument("--arch", default="autonomous-xnav", choices=["earth-dsn", "autonomous-xnav", "hybrid-dsn-xnav"])
    p_xnav.add_argument("--seed", type=int, default=20261121)
    p_xnav.add_argument("--json", action="store_true")
    p_xnav.set_defaults(func=_cmd_xnav)

    p_comm = sub.add_parser("comms", help="Evaluate RF/Optical Deep-Space Link Budget")
    p_comm.add_argument("--range-km", type=float, default=AU_KM)
    p_comm.add_argument("--freq-ghz", type=float, default=8.42)
    p_comm.add_argument("--tx-power-w", type=float, default=35.0)
    p_comm.add_argument("--tx-gain-dbi", type=float, default=41.5)
    p_comm.add_argument("--rx-gain-dbi", type=float, default=68.2)
    p_comm.add_argument("--losses-db", type=float, default=2.5)
    p_comm.add_argument("--noise-temp-k", type=float, default=38.0)
    p_comm.add_argument("--rate-bps", type=float, default=16384.0)
    p_comm.add_argument("--req-eb-n0-db", type=float, default=3.2)
    p_comm.add_argument("--json", action="store_true")
    p_comm.set_defaults(func=_cmd_comms)

    p_sonar = sub.add_parser("sonar", help="Evaluate Space Sonar (LiDAR / Coherent RF) CRLB & Link Budget")
    p_sonar.add_argument("--modality", default="fmcw-coherent-lidar", choices=list(SPACE_SONAR_PRESETS.keys()))
    p_sonar.add_argument("--range-m", type=float)
    p_sonar.add_argument("--vel-ms", type=float)
    p_sonar.add_argument("--tx-power-w", type=float)
    p_sonar.add_argument("--aperture-m", type=float)
    p_sonar.add_argument("--bandwidth-mhz", type=float)
    p_sonar.add_argument("--integration-ms", type=float)
    p_sonar.add_argument("--retroreflector", action="store_true", default=None)
    p_sonar.add_argument("--no-solar-bg", action="store_true")
    p_sonar.add_argument("--json", action="store_true")
    p_sonar.set_defaults(func=_cmd_sonar)

    p_eph = sub.add_parser("ephemeris", help="Query live NASA/JPL Horizons state vector by NAIF ID")
    p_eph.add_argument("--target", default="-31", help="NAIF ID (e.g. -31 Voyager 1, -156 Aditya-L1, 499 Mars)")
    p_eph.add_argument("--date", default="2026-11-21")
    p_eph.set_defaults(func=_cmd_ephemeris)

    p_src = sub.add_parser("sources", help="List ATNF/NICER pulsars, ISRO/NASA spacecraft & presets")
    p_src.add_argument("--json", action="store_true")
    p_src.set_defaults(func=_cmd_sources)

    p_int = sub.add_parser("interactive", help="Launch interactive terminal Mission Workbench")
    p_int.set_defaults(func=_cmd_interactive)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
