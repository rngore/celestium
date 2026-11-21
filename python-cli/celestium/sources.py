"""Data sources integration for CELESTIUM CLI:
- NASA/JPL Horizons API client (ssd.jpl.nasa.gov/api/horizons.api)
- ATNF Pulsar Catalogue & NASA NICER/SEXTANT reference pulsars
- ISRO & NASA Spacecraft Metadata Catalogue
- Standish J2000 analytical fallback when offline
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import json
import math
import re
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .constants import AU_KM, J2000_JD, PLANET_ELEMENTS_J2000, SECONDS_PER_DAY

HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
OBLIQUITY_RAD = math.radians(23.4392911)


@dataclass(frozen=True)
class PulsarEntry:
    id: str
    common_name: str
    j_name: str
    ra_deg: float
    dec_deg: float
    unit_vector: tuple[float, float, float]
    period_ms: float
    period_sec: float
    p_dot: float
    timing_precision_us: float
    reference_epoch_mjd: float
    source: str


def equatorial_to_ecliptic_unit(ra_deg: float, dec_deg: float) -> tuple[float, float, float]:
    ra = math.radians(ra_deg)
    dec = math.radians(dec_deg)
    x_eq = math.cos(dec) * math.cos(ra)
    y_eq = math.cos(dec) * math.sin(ra)
    z_eq = math.sin(dec)
    cos_e = math.cos(OBLIQUITY_RAD)
    sin_e = math.sin(OBLIQUITY_RAD)
    x_ec = x_eq
    y_ec = y_eq * cos_e + z_eq * sin_e
    z_ec = -y_eq * sin_e + z_eq * cos_e
    n = math.sqrt(x_ec * x_ec + y_ec * y_ec + z_ec * z_ec) or 1.0
    return (round(x_ec / n, 6), round(y_ec / n, 6), round(z_ec / n, 6))


PULSAR_CATALOG: list[PulsarEntry] = [
    PulsarEntry(
        id="psr-b0531+21",
        common_name="Crab Pulsar (PSR B0531+21)",
        j_name="J0534+2200",
        ra_deg=83.63321,
        dec_deg=22.01447,
        unit_vector=equatorial_to_ecliptic_unit(83.63321, 22.01447),
        period_ms=33.3924,
        period_sec=0.0333924,
        p_dot=4.21e-13,
        timing_precision_us=18.0,
        reference_epoch_mjd=57000,
        source="ATNF / NASA HEASARC",
    ),
    PulsarEntry(
        id="psr-b1937+21",
        common_name="PSR B1937+21",
        j_name="J1939+2134",
        ra_deg=294.91067,
        dec_deg=21.58308,
        unit_vector=equatorial_to_ecliptic_unit(294.91067, 21.58308),
        period_ms=1.5578,
        period_sec=0.0015578,
        p_dot=1.05e-19,
        timing_precision_us=4.5,
        reference_epoch_mjd=57500,
        source="ATNF / NASA SEXTANT",
    ),
    PulsarEntry(
        id="psr-j0437-4715",
        common_name="PSR J0437-4715",
        j_name="J0437-4715",
        ra_deg=69.31623,
        dec_deg=-47.25253,
        unit_vector=equatorial_to_ecliptic_unit(69.31623, -47.25253),
        period_ms=5.7575,
        period_sec=0.0057575,
        p_dot=5.73e-20,
        timing_precision_us=3.2,
        reference_epoch_mjd=57600,
        source="ATNF / NASA NICER",
    ),
    PulsarEntry(
        id="psr-b1821-24",
        common_name="PSR B1821-24 (M28A)",
        j_name="J1824-2452A",
        ra_deg=276.13337,
        dec_deg=-24.86964,
        unit_vector=equatorial_to_ecliptic_unit(276.13337, -24.86964),
        period_ms=3.0543,
        period_sec=0.0030543,
        p_dot=1.62e-18,
        timing_precision_us=6.1,
        reference_epoch_mjd=57400,
        source="ATNF / NASA SEXTANT",
    ),
    PulsarEntry(
        id="psr-j0218+4232",
        common_name="PSR J0218+4232",
        j_name="J0218+4232",
        ra_deg=34.52646,
        dec_deg=42.53817,
        unit_vector=equatorial_to_ecliptic_unit(34.52646, 42.53817),
        period_ms=2.3231,
        period_sec=0.0023231,
        p_dot=7.74e-20,
        timing_precision_us=7.8,
        reference_epoch_mjd=57200,
        source="ATNF / NASA NICER",
    ),
    PulsarEntry(
        id="psr-j2124-3358",
        common_name="PSR J2124-3358",
        j_name="J2124-3358",
        ra_deg=321.18271,
        dec_deg=-33.97908,
        unit_vector=equatorial_to_ecliptic_unit(321.18271, -33.97908),
        period_ms=4.9311,
        period_sec=0.0049311,
        p_dot=2.06e-20,
        timing_precision_us=8.5,
        reference_epoch_mjd=57550,
        source="ATNF / NASA SEXTANT",
    ),
]

SPACECRAFT_CATALOG = [
    {"id": "aditya-l1", "name": "Aditya-L1", "agency": "ISRO", "naif_id": "-156", "regime": "Sun-Earth L1 Halo"},
    {"id": "chandrayaan-2-orbiter", "name": "Chandrayaan-2 Orbiter", "agency": "ISRO", "naif_id": "-152", "regime": "Lunar Polar Orbit"},
    {"id": "chandrayaan-3", "name": "Chandrayaan-3", "agency": "ISRO", "naif_id": "-169", "regime": "Lunar South Pole (Historical)"},
    {"id": "xposat", "name": "XPoSat", "agency": "ISRO", "naif_id": None, "regime": "650 km LEO"},
    {"id": "voyager-1", "name": "Voyager 1", "agency": "NASA", "naif_id": "-31", "regime": "Interstellar Medium (>165 AU)"},
    {"id": "voyager-2", "name": "Voyager 2", "agency": "NASA", "naif_id": "-32", "regime": "Interstellar Medium (>140 AU)"},
    {"id": "jwst", "name": "James Webb Space Telescope", "agency": "NASA/ESA/CSA", "naif_id": "-170", "regime": "Sun-Earth L2 Halo"},
    {"id": "mro", "name": "Mars Reconnaissance Orbiter", "agency": "NASA", "naif_id": "-74", "regime": "Low Mars Orbit"},
    {"id": "parker-solar-probe", "name": "Parker Solar Probe", "agency": "NASA", "naif_id": "-96", "regime": "Solar Corona"},
    {"id": "new-horizons", "name": "New Horizons", "agency": "NASA", "naif_id": "-98", "regime": "Kuiper Belt"},
]


def parse_iso_utc(iso_str: str) -> datetime:
    cleaned = iso_str.strip()
    if len(cleaned) == 10:
        cleaned = f"{cleaned}T00:00:00+00:00"
    elif cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(cleaned)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return datetime(2026, 11, 21, 0, 0, 0, tzinfo=timezone.utc)


def datetime_to_jd(dt: datetime) -> float:
    return dt.timestamp() / SECONDS_PER_DAY + 2440587.5


def compute_keplerian_earth_km(epoch_iso: str) -> tuple[float, float, float]:
    """Computes Earth heliocentric ecliptic J2000 position (km) via Standish Keplerian fallback."""
    el = PLANET_ELEMENTS_J2000["earth"]
    jd = datetime_to_jd(parse_iso_utc(epoch_iso))
    d = jd - J2000_JD

    L = math.radians(el["L0_deg"] + el["n_deg_per_day"] * d)
    omega_bar = math.radians(el["omega_bar_deg"])
    node = math.radians(el["node_deg"])
    inc = math.radians(el["i_deg"])
    omega = omega_bar - node
    M = (L - omega_bar) % (2 * math.pi)

    e = el["e"]
    E = M if e < 0.8 else math.pi
    for _ in range(16):
        f = E - e * math.sin(E) - M
        fp = 1.0 - e * math.cos(E)
        delta = f / fp
        E -= delta
        if abs(delta) < 1e-12:
            break

    xp = el["a_au"] * (math.cos(E) - e)
    yp = el["a_au"] * math.sqrt(1.0 - e * e) * math.sin(E)

    cos_o, sin_o = math.cos(node), math.sin(node)
    cos_w, sin_w = math.cos(omega), math.sin(omega)
    cos_i, sin_i = math.cos(inc), math.sin(inc)

    px = cos_o * cos_w - sin_o * sin_w * cos_i
    qx = -cos_o * sin_w - sin_o * cos_w * cos_i
    py = sin_o * cos_w + cos_o * sin_w * cos_i
    qy = -sin_o * sin_w + cos_o * cos_w * cos_i
    pz = sin_w * sin_i
    qz = cos_w * sin_i

    return (
        (px * xp + qx * yp) * AU_KM,
        (py * xp + qy * yp) * AU_KM,
        (pz * xp + qz * yp) * AU_KM,
    )


def parse_horizons_vectors(raw_text: str, target_id: str) -> dict[str, Any] | None:
    """Parses authentic NASA/JPL Horizons $$SOE ... $$EOE state vector blocks."""
    soe_match = re.search(r"\$\$SOE([\s\S]*?)\$\$EOE", raw_text)
    if not soe_match:
        return None
    block = soe_match.group(1)
    pos_m = re.search(
        r"X\s*=\s*([+-]?\d+\.\d+E[+-]\d+)\s+Y\s*=\s*([+-]?\d+\.\d+E[+-]\d+)\s+Z\s*=\s*([+-]?\d+\.\d+E[+-]\d+)",
        block,
        re.IGNORECASE,
    )
    vel_m = re.search(
        r"VX\s*=\s*([+-]?\d+\.\d+E[+-]\d+)\s+VY\s*=\s*([+-]?\d+\.\d+E[+-]\d+)\s+VZ\s*=\s*([+-]?\d+\.\d+E[+-]\d+)",
        block,
        re.IGNORECASE,
    )
    if not pos_m or not vel_m:
        return None

    pos_au = (float(pos_m.group(1)), float(pos_m.group(2)), float(pos_m.group(3)))
    vel_aud = (float(vel_m.group(1)), float(vel_m.group(2)), float(vel_m.group(3)))
    pos_km = tuple(v * AU_KM for v in pos_au)
    vel_kms = tuple((v * AU_KM) / SECONDS_PER_DAY for v in vel_aud)

    return {
        "target_id": target_id,
        "position_au": pos_au,
        "velocity_au_per_day": vel_aud,
        "position_km": pos_km,
        "velocity_km_s": vel_kms,
        "reference_frame": "Heliocentric Ecliptic J2000 (TDB)",
        "classification": "OBSERVED",
    }


def fetch_horizons_vector(target_id: str, date_iso: str = "2026-11-21", timeout_sec: float = 8.0) -> dict[str, Any]:
    """Queries live NASA/JPL Horizons API for target state vectors; gracefully reports offline errors."""
    dt = parse_iso_utc(date_iso)
    start_str = dt.strftime("%Y-%m-%d")
    stop_str = (dt + timedelta(days=1)).strftime("%Y-%m-%d")
    params = urlencode(
        {
            "format": "json",
            "COMMAND": f"'{target_id}'",
            "OBJ_DATA": "'NO'",
            "MAKE_EPHEM": "'YES'",
            "EPHEM_TYPE": "'VECTORS'",
            "CENTER": "'500@10'",
            "START_TIME": f"'{start_str}'",
            "STOP_TIME": f"'{stop_str}'",
            "STEP_SIZE": "'1d'",
            "OUT_UNITS": "'AU-D'",
            "VEC_TABLE": "'2'",
        }
    )
    url = f"{HORIZONS_URL}?{params}"
    try:
        req = Request(url, headers={"User-Agent": "CELESTIUM-CLI/2.0"})
        with urlopen(req, timeout=timeout_sec) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        raw = payload.get("result", "")
        parsed = parse_horizons_vectors(raw, target_id)
        if parsed:
            parsed["epoch"] = start_str
            parsed["source"] = "NASA/JPL Horizons API"
            return parsed
        return {
            "target_id": target_id,
            "epoch": start_str,
            "error": "No ephemeris vector block returned for this target/epoch.",
            "classification": "ESTIMATED",
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "target_id": target_id,
            "epoch": start_str,
            "error": f"Horizons unreachable ({exc}); use local Keplerian fallback or offline presets.",
            "classification": "ESTIMATED",
        }
