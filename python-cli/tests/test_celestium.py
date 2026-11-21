import json
import math
import tempfile
import unittest
from pathlib import Path

from celestium.cli import main as cli_main
from celestium.communications import analyze_communication_link, compute_fspl_db
from celestium.constants import AU_KM, C_KMS
from celestium.orbital import compute_hohmann_transfer, propagate_trajectory, solve_lambert, state_to_orbital_elements
from celestium.scenarios import load_mission_config, run_mission_pipeline, write_csv_reports
from celestium.sources import PULSAR_CATALOG, parse_horizons_vectors
from celestium.space_sonar import compute_space_sonar_link_budget
from celestium.xnav import run_xnav_simulation


class TestCelestiumCliPhysics(unittest.TestCase):
    def test_rk45_energy_conservation_and_coe_singularities(self):
        prop = propagate_trajectory(
            central_body="earth",
            initial_position_km=(7000.0, 0.0, 0.0),
            initial_velocity_km_s=(0.0, 7.54605329, 0.0),
            duration_days=0.2,
            integrator="rk45",
        )
        self.assertLess(prop["relative_energy_drift"], 1e-8)
        self.assertLess(prop["relative_h_drift"], 1e-8)
        self.assertTrue(prop["initial_coe"]["is_circular"])
        self.assertTrue(prop["initial_coe"]["is_equatorial"])

    def test_hohmann_and_curtis_lambert_round_trip(self):
        hoh = compute_hohmann_transfer("sun", AU_KM, 1.52371 * AU_KM)
        self.assertGreater(hoh["total_delta_v_km_s"], 5.4)
        self.assertLess(hoh["total_delta_v_km_s"], 5.8)

        r1 = (5000.0, 10000.0, 2100.0)
        r2 = (-14600.0, 2500.0, 7000.0)
        lam = solve_lambert("earth", r1, r2, 3600.0, "prograde")
        self.assertTrue(lam["converged"])
        reprop = propagate_trajectory(
            central_body="earth",
            initial_position_km=r1,
            initial_velocity_km_s=lam["v1_km_s"],
            duration_days=3600.0 / 86400.0,
            integrator="rk45",
        )
        rf = reprop["final_state"]["position_km"]
        err_km = math.sqrt((rf[0] - r2[0]) ** 2 + (rf[1] - r2[1]) ** 2 + (rf[2] - r2[2]) ** 2)
        self.assertLess(err_km, 0.5)

    def test_xnav_wls_ekf_and_rank_deficiency(self):
        good = run_xnav_simulation(
            true_position_km=(AU_KM, 0.0, 0.0),
            initial_guess_error_km=1800.0,
            pulsar_ids=[p.id for p in PULSAR_CATALOG[:4]],
            observation_duration_sec=3600.0,
        )
        self.assertFalse(good["rank_deficient"])
        self.assertLess(good["ekf_error_km"], 25.0)

        bad = run_xnav_simulation(
            true_position_km=(AU_KM, 0.0, 0.0),
            pulsar_ids=[p.id for p in PULSAR_CATALOG[:2]],
        )
        self.assertTrue(bad["rank_deficient"])
        self.assertIsNotNone(bad["geometry_warning"])

    def test_comms_light_time_and_space_sonar_crlb(self):
        fspl = compute_fspl_db(AU_KM, 8.42)
        self.assertGreater(fspl, 260.0)
        comm = analyze_communication_link(
            {"frequencyGHz": 8.42, "txPowerW": 35, "txAntennaGainDbi": 41.5, "rxAntennaGainDbi": 68.2, "systemLossesDb": 2.5, "systemNoiseTempK": 38, "dataRateBps": 16384, "requiredEbN0Db": 3.2},
            range_km=AU_KM,
        )
        self.assertAlmostEqual(comm["summary_final"]["one_way_light_time_sec"], AU_KM / C_KMS, places=2)
        sonar = compute_space_sonar_link_budget("fmcw-coherent-lidar", range_m=3500.0)
        self.assertTrue(sonar["link_closed"])
        self.assertLess(sonar["crlb_range_sigma_m"], 0.05)

    def test_horizons_parser_and_cli_end_to_end_export(self):
        raw = """
$$SOE
2461365.500000000 = A.D. 2026-Nov-21 00:00:00.0000 TDB
 X =-3.222398471248619E+01 Y =-1.372255190698938E+02 Z = 9.928482506003020E+01
 VX=-1.195174492387778E-03 VY=-7.861222965025063E-03 VZ= 5.678141366814040E-03
$$EOE"""
        parsed = parse_horizons_vectors(raw, "-31")
        self.assertIsNotNone(parsed)
        self.assertAlmostEqual(parsed["position_au"][0], -32.22398, places=4)

        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            cfg = load_mission_config("earth-to-mars")
            cfg_file = tmp_dir / "site-exported-config.json"
            cfg_file.write_text(json.dumps({"modelVersion": "2.0.0", "missionConfig": cfg}), encoding="utf-8")
            rc = cli_main(["run", "--config", str(cfg_file), "--csv-dir", str(tmp_dir / "csv"), "--quiet"])
            self.assertEqual(rc, 0)
            self.assertTrue((tmp_dir / "csv" / "trajectory.csv").exists())
            self.assertTrue((tmp_dir / "csv" / "xnav_ekf.csv").exists())
            self.assertTrue((tmp_dir / "csv" / "comms_link.csv").exists())


if __name__ == "__main__":
    unittest.main()
