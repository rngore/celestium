import type {
  LambertRequest,
  LambertResult,
  ModelInspectionRecord,
  Vector3D,
} from '../types.ts';
import { CELESTIUM_MODEL_VERSION, CENTRAL_BODIES, SECONDS_PER_DAY } from './constants.ts';
import { stateToOrbitalElements, vec3Cross, vec3Dot, vec3Mag, vec3Scale, vec3Sub } from './orbitalMechanics.ts';

/**
 * Stumpff functions C(z) and S(z) used in the Universal-Variable Lambert formulation
 * (Curtis, Orbital Mechanics for Engineering Students, Ch. 5; Vallado, Algorithm 58).
 */
export function stumpffC(z: number): number {
  if (z > 1e-6) {
    const s = Math.sqrt(z);
    return (1 - Math.cos(s)) / z;
  }
  if (z < -1e-6) {
    const s = Math.sqrt(-z);
    return (Math.cosh(s) - 1) / -z;
  }
  return 0.5 - z / 24 + (z * z) / 720;
}

export function stumpffS(z: number): number {
  if (z > 1e-6) {
    const s = Math.sqrt(z);
    return (s - Math.sin(s)) / (s * s * s);
  }
  if (z < -1e-6) {
    const s = Math.sqrt(-z);
    return (Math.sinh(s) - s) / (s * s * s);
  }
  return 1 / 6 - z / 120 + (z * z) / 5040;
}

/**
 * Solves the zero-revolution Universal-Variable Lambert Boundary-Value Problem:
 * Given r1(km), r2(km), time of flight Δt(s), μ(km^3/s^2), and transfer direction,
 * finds departure velocity v1(km/s) and arrival velocity v2(km/s).
 */
export function solveLambert(req: LambertRequest): LambertResult {
  const body = CENTRAL_BODIES[req.centralBody];
  const mu = body.muKm3S2;
  const r1 = vec3Mag(req.r1Km);
  const r2 = vec3Mag(req.r2Km);

  const fail = (reason: string): LambertResult => ({
    request: req,
    muKm3S2: mu,
    converged: false,
    failureReason: reason,
    iterations: 0,
    zFinal: 0,
    transferAngleDeg: 0,
    v1KmS: { x: 0, y: 0, z: 0 },
    v2KmS: { x: 0, y: 0, z: 0 },
    deltaVDepartureKmS: null,
    deltaVArrivalKmS: null,
    totalDeltaVKmS: null,
    semiMajorAxisKm: null,
    eccentricity: null,
    lagrangeCoefficients: { f: 0, g: 0, gDot: 0 },
    inspection: buildLambertInspection(req, body.name, mu, false, reason, 0, 0, 0, 0, 0, 0, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, null, null),
  });

  if (r1 < 1e-3 || r2 < 1e-3 || req.tofSec <= 0) {
    return fail('Invalid inputs: |r1|, |r2|, and time of flight Δt must all be strictly positive.');
  }

  const c12 = vec3Cross(req.r1Km, req.r2Km);
  const cosDTheta = Math.max(-1, Math.min(1, vec3Dot(req.r1Km, req.r2Km) / (r1 * r2)));
  let dTheta = Math.acos(cosDTheta);

  if (req.direction === 'prograde') {
    if (c12.z < 0) dTheta = 2 * Math.PI - dTheta;
  } else {
    if (c12.z >= 0) dTheta = 2 * Math.PI - dTheta;
  }

  const transferAngleDeg = (dTheta * 180) / Math.PI;
  if (Math.abs(Math.sin(dTheta)) < 1e-7) {
    return fail('Singularity: 0° or 180° transfer angle leaves orbital plane normal undefined in single-plane Lambert.');
  }

  const A = Math.sin(dTheta) * Math.sqrt((r1 * r2) / (1 - Math.cos(dTheta)));
  if (!Number.isFinite(A) || Math.abs(A) < 1e-12) {
    return fail('Lambert geometry constant A vanished.');
  }

  const yOfZ = (z: number): number => {
    const cz = stumpffC(z);
    const sz = stumpffS(z);
    return r1 + r2 + (A * (z * sz - 1)) / Math.sqrt(Math.max(cz, 1e-15));
  };

  const FOfZ = (z: number): number => {
    const y = yOfZ(z);
    if (y <= 0) return Number.NaN;
    const cz = stumpffC(z);
    const sz = stumpffS(z);
    return Math.pow(y / cz, 1.5) * sz + A * Math.sqrt(y) - Math.sqrt(mu) * req.tofSec;
  };

  // Bracket a valid root z in [-4*pi^2, 4*pi^2) where y(z) > 0
  let zLow = -4 * Math.PI * Math.PI;
  let zHigh = 4 * Math.PI * Math.PI - 1e-4;
  while (yOfZ(zLow) <= 0 && zLow < 0) {
    zLow *= 0.5;
  }
  // Ensure bracket covers F(z) = 0
  let fLow = FOfZ(zLow);
  let fHigh = FOfZ(zHigh);
  if (Number.isNaN(fLow)) {
    // Scan upward from -20 to find first positive y(z)
    for (let zScan = -20; zScan < 39; zScan += 0.25) {
      const fVal = FOfZ(zScan);
      if (!Number.isNaN(fVal)) {
        zLow = zScan;
        fLow = fVal;
        break;
      }
    }
  }

  let z = 0;
  // Find better bracket around z=0 by bisection probing if needed
  let f0 = FOfZ(0);
  if (!Number.isNaN(f0) && !Number.isNaN(fHigh) && f0 * fHigh <= 0) {
    zLow = 0;
    fLow = f0;
  } else if (!Number.isNaN(fLow) && !Number.isNaN(f0) && fLow * f0 <= 0) {
    zHigh = 0;
    fHigh = f0;
  } else if (Number.isNaN(fLow) || Number.isNaN(fHigh) || fLow * fHigh > 0) {
    // Sweep to bracket sign change
    let prevZ = zLow;
    let prevF = fLow;
    let bracketFound = false;
    for (let i = 1; i <= 400; i++) {
      const testZ = zLow + (i / 400) * (zHigh - zLow);
      const testF = FOfZ(testZ);
      if (!Number.isNaN(prevF) && !Number.isNaN(testF) && prevF * testF <= 0) {
        zLow = prevZ;
        fLow = prevF;
        zHigh = testZ;
        fHigh = testF;
        bracketFound = true;
        break;
      }
      if (!Number.isNaN(testF)) {
        prevZ = testZ;
        prevF = testF;
      }
    }
    if (!bracketFound) {
      return fail('Failed to bracket Lambert universal variable z root for given Δt and geometry.');
    }
  }

  z = 0.5 * (zLow + zHigh);
  let iterations = 0;
  let converged = false;

  // Safeguarded Newton-Raphson + Bisection (Brent-style)
  for (let iter = 1; iter <= 80; iter++) {
    iterations = iter;
    const F = FOfZ(z);
    if (Number.isNaN(F)) {
      z = 0.5 * (zLow + zHigh);
      continue;
    }
    if (Math.abs(F) < 1e-8) {
      converged = true;
      break;
    }

    if (!Number.isNaN(fLow) && F * fLow <= 0) {
      zHigh = z;
      fHigh = F;
    } else {
      zLow = z;
      fLow = F;
    }

    const cz = stumpffC(z);
    const sz = stumpffS(z);
    const y = yOfZ(z);

    let dFdz: number;
    if (Math.abs(z) < 1e-7) {
      const y0 = yOfZ(0);
      dFdz =
        (Math.sqrt(2) / 40) * Math.pow(y0, 1.5) +
        (A / 8) * (Math.sqrt(y0) + A * Math.sqrt(1 / (2 * y0)));
    } else {
      dFdz =
        Math.pow(y / cz, 1.5) *
          ((1 / (2 * z)) * (cz - (3 * sz) / (2 * cz)) + (3 * sz * sz) / (4 * cz)) +
        (A / 8) * ((3 * sz * Math.sqrt(y)) / cz + A * Math.sqrt(cz / y));
    }

    let zNext = Math.abs(dFdz) > 1e-14 ? z - F / dFdz : 0.5 * (zLow + zHigh);
    if (!Number.isFinite(zNext) || zNext <= zLow || zNext >= zHigh) {
      zNext = 0.5 * (zLow + zHigh);
    }
    if (Math.abs(zNext - z) < 1e-11) {
      z = zNext;
      converged = true;
      break;
    }
    z = zNext;
  }

  if (!converged && Math.abs(zHigh - zLow) < 1e-7) {
    converged = true;
  }

  if (!converged) {
    return fail('Lambert universal-variable solver did not converge within 80 iterations.');
  }

  const yFinal = yOfZ(z);
  const f = 1 - yFinal / r1;
  const g = A * Math.sqrt(yFinal / mu);
  const gDot = 1 - yFinal / r2;

  if (!Number.isFinite(g) || Math.abs(g) < 1e-12) {
    return fail('Degenerate Lagrange g coefficient.');
  }

  const v1KmS: Vector3D = vec3Scale(vec3Sub(req.r2Km, vec3Scale(req.r1Km, f)), 1 / g);
  const v2KmS: Vector3D = vec3Scale(vec3Sub(vec3Scale(req.r2Km, gDot), req.r1Km), 1 / g);

  const coe = stateToOrbitalElements(req.r1Km, v1KmS, req.centralBody);

  const deltaVDepartureKmS = req.initialVelocityKmS
    ? vec3Mag(vec3Sub(v1KmS, req.initialVelocityKmS))
    : null;
  const deltaVArrivalKmS = req.targetVelocityKmS
    ? vec3Mag(vec3Sub(req.targetVelocityKmS, v2KmS))
    : null;
  const totalDeltaVKmS =
    deltaVDepartureKmS !== null && deltaVArrivalKmS !== null
      ? deltaVDepartureKmS + deltaVArrivalKmS
      : deltaVDepartureKmS ?? deltaVArrivalKmS;

  return {
    request: req,
    muKm3S2: mu,
    converged: true,
    failureReason: null,
    iterations,
    zFinal: z,
    transferAngleDeg,
    v1KmS,
    v2KmS,
    deltaVDepartureKmS,
    deltaVArrivalKmS,
    totalDeltaVKmS,
    semiMajorAxisKm: Number.isFinite(coe.semiMajorAxisKm) ? coe.semiMajorAxisKm : null,
    eccentricity: coe.eccentricity,
    lagrangeCoefficients: { f, g, gDot },
    inspection: buildLambertInspection(
      req,
      body.name,
      mu,
      true,
      null,
      iterations,
      z,
      transferAngleDeg,
      f,
      g,
      gDot,
      v1KmS,
      v2KmS,
      deltaVDepartureKmS,
      deltaVArrivalKmS
    ),
  };
}

function buildLambertInspection(
  req: LambertRequest,
  bodyName: string,
  mu: number,
  converged: boolean,
  failureReason: string | null,
  iterations: number,
  zFinal: number,
  transferAngleDeg: number,
  f: number,
  g: number,
  gDot: number,
  v1: Vector3D,
  v2: Vector3D,
  dv1: number | null,
  dv2: number | null
): ModelInspectionRecord {
  return {
    modelId: 'universal-lambert-solver',
    name: 'Universal-Variable Lambert Boundary-Value Solver',
    category: 'Astrodynamics',
    governingEquations: [
      'y(z) = r_1 + r_2 + A (z S(z) - 1) / sqrt(C(z))',
      'F(z) = [y(z) / C(z)]^(3/2) S(z) + A sqrt(y(z)) - sqrt(μ) Δt = 0',
      'f = 1 - y/r_1,   g = A sqrt(y/μ),   g_dot = 1 - y/r_2',
      'v_1 = (r_2 - f r_1) / g,   v_2 = (g_dot r_2 - r_1) / g',
    ],
    variables: [
      { symbol: 'r_1, r_2', name: 'Boundary position vectors', unit: 'km', description: 'Departure and arrival inertial vectors' },
      { symbol: 'Δt', name: 'Time of flight', unit: 's', description: 'Transfer duration' },
      { symbol: 'z', name: 'Universal anomaly squared parameter', unit: 'dimensionless', description: 'z > 0 elliptic, z = 0 parabolic, z < 0 hyperbolic' },
      { symbol: 'C(z), S(z)', name: 'Stumpff functions', unit: 'dimensionless', description: 'Series/trigonometric/hyperbolic basis' },
    ],
    inputs: {
      centralBody: bodyName,
      muKm3S2: mu,
      tofDays: Number((req.tofSec / SECONDS_PER_DAY).toFixed(4)),
      direction: req.direction,
    },
    intermediateSteps: [
      { stepIndex: 1, label: 'Transfer sweep angle Δθ', expression: 'arccos(r_1·r_2 / |r_1||r_2|)', value: `${transferAngleDeg.toFixed(4)} deg` },
      { stepIndex: 2, label: 'Root-finding convergence', expression: 'F(z*) = 0 (Newton + bisection)', value: converged ? `Converged in ${iterations} iters (z = ${zFinal.toFixed(6)})` : `Failed: ${failureReason}` },
      { stepIndex: 3, label: 'Lagrange f, g, g_dot', expression: 'f = 1 - y/r1, g = A*sqrt(y/μ)', value: `f=${f.toFixed(6)}, g=${g.toFixed(3)} s, g_dot=${gDot.toFixed(6)}` },
    ],
    finalOutputs: {
      converged,
      v1KmS: `[${v1.x.toFixed(4)}, ${v1.y.toFixed(4)}, ${v1.z.toFixed(4)}]`,
      v2KmS: `[${v2.x.toFixed(4)}, ${v2.y.toFixed(4)}, ${v2.z.toFixed(4)}]`,
      deltaVDepartureKmS: dv1 !== null ? Number(dv1.toFixed(4)) : 'N/A (no v_init)',
      deltaVArrivalKmS: dv2 !== null ? Number(dv2.toFixed(4)) : 'N/A (no v_target)',
    },
    assumptions: [
      'Zero-revolution (N=0) two-body conic transfer between two specified radius vectors.',
      'Prograde/retrograde ambiguity resolved using z-component of r_1 × r_2.',
    ],
    limitations: [
      'Singularity at exact 180° (π rad) transfer where orbital plane normal r_1 × r_2 vanishes.',
      'Multi-revolution (N ≥ 1) Lambert solutions are excluded.',
    ],
    provenance: {
      source: `CELESTIUM Lambert Solver v${CELESTIUM_MODEL_VERSION}`,
      sourceUrl: 'https://ssd.jpl.nasa.gov/astro_constants.html',
      retrievedAt: new Date().toISOString(),
      observationEpoch: new Date().toISOString(),
      referenceFrame: 'Inertial J2000',
      classification: 'COMPUTED',
    },
    validationStatus: 'VALIDATED_AGAINST_REFERENCE',
    validationReference: 'Curtis Example 5.2 Reference & Propagation Round-Trip Verification (Vitest)',
  };
}
