"""Fundamental SI physical and astronomical constants for CELESTIUM CLI."""

from dataclasses import dataclass

MODEL_VERSION = "2.0.0"

# Exact SI speed of light in vacuum (m/s)
C_MPS = 299_792_458.0
C_KMS = C_MPS / 1000.0

# Exact SI Planck & Boltzmann constants
H_PLANCK_JS = 6.62607015e-34
K_BOLTZMANN_JK = 1.380649e-23

# Solar radiation pressure at 1 AU (N/m^2)
P_SOLAR_1AU_N_M2 = 4.56e-6

# Exact IAU 2012 Astronomical Unit
AU_METERS = 149_597_870_700.0
AU_KM = AU_METERS / 1000.0

SECONDS_PER_DAY = 86_400.0
J2000_JD = 2_451_545.0

# Standard gravitational parameters (km^3 / s^2)
MU_SUN_KM3_S2 = 1.32712440018e11
MU_EARTH_KM3_S2 = 3.986004418e5
MU_MOON_KM3_S2 = 4.902800066e3
MU_MARS_KM3_S2 = 4.282837e4
MU_JUPITER_KM3_S2 = 1.26686534e8

RADIUS_SUN_KM = 695_700.0
RADIUS_EARTH_KM = 6378.137
RADIUS_MOON_KM = 1737.4
RADIUS_MARS_KM = 3396.19
RADIUS_JUPITER_KM = 71492.0

J2_SUN = 2.0e-7
J2_EARTH = 1.08262668e-3
J2_MOON = 2.027e-4
J2_MARS = 1.96045e-3
J2_JUPITER = 1.4736e-2


@dataclass(frozen=True)
class CentralBodyConstant:
    id: str
    name: str
    naif_id: str
    mu_km3_s2: float
    radius_km: float
    j2: float
    default_frame: str


CENTRAL_BODIES: dict[str, CentralBodyConstant] = {
    "sun": CentralBodyConstant(
        id="sun",
        name="Sun (Heliocentric)",
        naif_id="10",
        mu_km3_s2=MU_SUN_KM3_S2,
        radius_km=RADIUS_SUN_KM,
        j2=J2_SUN,
        default_frame="Heliocentric Ecliptic J2000",
    ),
    "earth": CentralBodyConstant(
        id="earth",
        name="Earth (Geocentric)",
        naif_id="399",
        mu_km3_s2=MU_EARTH_KM3_S2,
        radius_km=RADIUS_EARTH_KM,
        j2=J2_EARTH,
        default_frame="Earth-Centered Inertial (EME2000/GCRF)",
    ),
    "moon": CentralBodyConstant(
        id="moon",
        name="Moon (Selenocentric)",
        naif_id="301",
        mu_km3_s2=MU_MOON_KM3_S2,
        radius_km=RADIUS_MOON_KM,
        j2=J2_MOON,
        default_frame="Selenocentric Inertial J2000",
    ),
    "mars": CentralBodyConstant(
        id="mars",
        name="Mars (Areocentric)",
        naif_id="499",
        mu_km3_s2=MU_MARS_KM3_S2,
        radius_km=RADIUS_MARS_KM,
        j2=J2_MARS,
        default_frame="Mars-Centered Inertial J2000",
    ),
    "jupiter": CentralBodyConstant(
        id="jupiter",
        name="Jupiter (Jovicentric)",
        naif_id="599",
        mu_km3_s2=MU_JUPITER_KM3_S2,
        radius_km=RADIUS_JUPITER_KM,
        j2=J2_JUPITER,
        default_frame="Jupiter-Centered Inertial J2000",
    ),
}

# Standish (1992) / JPL J2000 Keplerian elements (valid 1800-2050 AD)
PLANET_ELEMENTS_J2000 = {
    "earth": {
        "naif_id": "399",
        "name": "Earth",
        "a_au": 1.00000261,
        "e": 0.01671123,
        "i_deg": 0.00001531,
        "omega_bar_deg": 102.93768193,
        "node_deg": 0.0,
        "L0_deg": 100.46457166,
        "n_deg_per_day": 0.9856091,
    },
    "mars": {
        "naif_id": "499",
        "name": "Mars",
        "a_au": 1.52371034,
        "e": 0.0933941,
        "i_deg": 1.84969142,
        "omega_bar_deg": -23.94362959,
        "node_deg": 49.55953891,
        "L0_deg": -4.55343205,
        "n_deg_per_day": 0.52402068,
    },
    "jupiter": {
        "naif_id": "599",
        "name": "Jupiter",
        "a_au": 5.202887,
        "e": 0.04838624,
        "i_deg": 1.30439695,
        "omega_bar_deg": 14.72847983,
        "node_deg": 100.47390909,
        "L0_deg": 34.39644051,
        "n_deg_per_day": 0.08308529,
    },
}
