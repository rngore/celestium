import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { SPACECRAFT_CATALOG } from '../../src/shared/catalog/missions.ts';
import { PULSAR_CATALOG } from '../../src/shared/catalog/pulsars.ts';
import { analyzeCommunicationLink } from '../../src/shared/science/communications.ts';
import { solveLambert } from '../../src/shared/science/lambert.ts';
import {
  computeHohmannTransfer,
  propagateTrajectory,
  stateToOrbitalElements,
} from '../../src/shared/science/orbitalMechanics.ts';
import { computeMissionPlan } from '../../src/shared/science/physics.ts';
import {
  SPACE_SONAR_PRESETS,
  runSpaceSonarSimulation,
} from '../../src/shared/science/spaceSonar.ts';
import { runXnavSimulation } from '../../src/shared/science/xnav.ts';
import type { DataSourceStatus } from '../../src/shared/types.ts';
import {
  clearHorizonsCache,
  getHorizonsProviderStatus,
  getHorizonsVector,
} from '../services/horizons.ts';
import { buildSolarSystemSnapshot } from '../services/solarSystem.ts';
import { buildZipArchive, collectDirectoryEntries } from '../services/zipBuilder.ts';

export const apiRouter = Router();

const vec3Schema = z.object({
  x: z.number().finite().min(-1e13).max(1e13),
  y: z.number().finite().min(-1e13).max(1e13),
  z: z.number().finite().min(-1e13).max(1e13),
});

const centralBodySchema = z.enum(['sun', 'earth', 'moon', 'mars', 'jupiter']);

const dateQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  refresh: z.enum(['true', 'false']).optional(),
});

const propagationSchema = z.object({
  centralBody: centralBodySchema,
  initialPositionKm: vec3Schema,
  initialVelocityKmS: vec3Schema,
  epochIso: z.string().min(8).max(40),
  durationDays: z.number().finite().min(0.01).max(3650),
  stepSizeSec: z.number().finite().min(0.1).max(864000).optional(),
  toleranceKm: z.number().finite().min(1e-12).max(1000).optional(),
  integrator: z.enum(['rk45', 'rk4']).optional(),
  sampleCount: z.number().int().min(12).max(240).optional(),
  enableJ2: z.boolean().optional(),
  enableSrp: z.boolean().optional(),
  enableThirdBody: z.boolean().optional(),
  spacecraftMassKg: z.number().finite().min(1).max(1e6).optional(),
  areaM2: z.number().finite().min(0.01).max(1e4).optional(),
  crReflectivity: z.number().finite().min(0).max(2.5).optional(),
});

const coeSchema = z.object({
  centralBody: centralBodySchema,
  rKm: vec3Schema,
  vKmS: vec3Schema,
});

const hohmannSchema = z.object({
  centralBody: centralBodySchema,
  r1Km: z.number().finite().positive().max(1e12),
  r2Km: z.number().finite().positive().max(1e12),
});

const lambertSchema = z.object({
  centralBody: centralBodySchema,
  r1Km: vec3Schema,
  r2Km: vec3Schema,
  tofSec: z.number().finite().positive().max(3.15e9),
  direction: z.enum(['prograde', 'retrograde']),
  initialVelocityKmS: vec3Schema.optional(),
  targetVelocityKmS: vec3Schema.optional(),
});

const xnavRequestSchema = z.object({
  spacecraftId: z.string().max(64).optional(),
  truePositionKm: vec3Schema,
  trueVelocityKmS: vec3Schema.optional(),
  centralBody: centralBodySchema.optional(),
  initialGuessErrorKm: z.number().finite().min(1).max(5_000_000),
  initialClockBiasSec: z.number().finite().min(-1).max(1).optional(),
  initialClockDriftSecPerSec: z.number().finite().min(-1e-3).max(1e-3).optional(),
  pulsarIds: z.array(z.string()).min(2).max(6),
  observationDurationSec: z.number().finite().min(60).max(86400),
  toaNoiseMultiplier: z.number().finite().min(0.1).max(10),
  dsnDisrupted: z.boolean(),
  architecture: z.enum(['earth-dsn', 'autonomous-xnav', 'hybrid-dsn-xnav']).optional(),
  seed: z.number().int().optional(),
});

const commAnalyzeSchema = z.object({
  frequencyGHz: z.number().finite().min(0.1).max(400_000),
  txPowerW: z.number().finite().min(0.01).max(1e5),
  txAntennaGainDbi: z.number().finite().min(-20).max(100),
  rxAntennaGainDbi: z.number().finite().min(-20).max(120),
  systemLossesDb: z.number().finite().min(0).max(40),
  systemNoiseTempK: z.number().finite().min(1).max(5000),
  dataRateBps: z.number().finite().min(1).max(1e10),
  requiredEbN0Db: z.number().finite().min(-10).max(30),
  rangeKm: z.number().finite().positive().max(1e12).optional(),
  solarConjunctionThresholdDeg: z.number().finite().min(0.5).max(30).optional(),
  centralBody: centralBodySchema.optional(),
});

const missionPlanSchema = z.object({
  origin: z.enum(['earth', 'moon', 'mars', 'jupiter', 'sun-earth-l1', 'sun-earth-l2']),
  destination: z.enum(['earth', 'moon', 'mars', 'jupiter', 'sun-earth-l1', 'sun-earth-l2']).refine(
    (v) => v !== 'earth',
    { message: 'Destination must be Moon, Mars, Jupiter, Sun-Earth L1, or Sun-Earth L2.' }
  ),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  deltaVBoostKmS: z.number().finite().min(0).max(12),
  propulsionType: z.enum(['chemical', 'solar-electric', 'nuclear-thermal']),
  navigationMethod: z.enum(['earth-dsn', 'universe-gps-xnav', 'hybrid-dsn-xnav']),
  relayBeacon: z.enum([
    'none',
    'l1-optical-relay',
    'mars-areostationary-relay',
    'lunar-south-pole-relay',
  ]),
});

function defaultTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

apiRouter.get('/health', (_req, res) => {
  const horizons = getHorizonsProviderStatus();
  res.json({
    status: horizons.status === 'OFFLINE' ? 'DEGRADED' : 'NOMINAL',
    service: 'CELESTIUM Deep-Space Mission Analysis & Navigation Server',
    utcTime: new Date().toISOString(),
    horizonsStatus: horizons.status,
  });
});

apiRouter.get('/missions', (_req, res) => {
  res.json({
    count: SPACECRAFT_CATALOG.length,
    missions: SPACECRAFT_CATALOG,
    provenance: {
      source: 'ISRO Spacecraft Missions & NASA Science Mission Catalogues',
      sourceUrl: 'https://www.isro.gov.in/SpacecraftMissions.html',
      classification: 'OBSERVED',
    },
  });
});

apiRouter.get('/missions/:id', (req, res) => {
  const mission = SPACECRAFT_CATALOG.find((m) => m.id === req.params.id);
  if (!mission) {
    res.status(404).json({ error: `Mission '${req.params.id}' not found in catalog.` });
    return;
  }
  res.json({ mission });
});

apiRouter.get('/spacecraft', async (req, res) => {
  const parsed = dateQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.flatten() });
    return;
  }
  const dateIso = parsed.data.date ?? defaultTodayIso();
  const refresh = parsed.data.refresh === 'true';
  if (refresh) clearHorizonsCache();

  try {
    const snapshot = await buildSolarSystemSnapshot(dateIso, refresh);
    res.json({
      requestedDate: snapshot.requestedDate,
      generatedAt: snapshot.generatedAt,
      spacecraft: snapshot.spacecraft,
      summary: snapshot.summary,
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to retrieve spacecraft snapshot',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

apiRouter.get('/ephemeris/:target', async (req, res) => {
  const target = req.params.target.trim();
  if (!/^[a-zA-Z0-9_-]{1,16}$/.test(target)) {
    res.status(400).json({ error: 'Invalid NAIF/target identifier.' });
    return;
  }

  const parsed = dateQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.flatten() });
    return;
  }

  const dateIso = parsed.data.date ?? defaultTodayIso();
  const refresh = parsed.data.refresh === 'true';
  const result = await getHorizonsVector(target, dateIso, refresh);

  if (!result.sample) {
    res.status(404).json({
      target,
      date: dateIso,
      available: false,
      error: result.error ?? 'Ephemeris unavailable for requested target and epoch.',
    });
    return;
  }

  res.json({
    target,
    date: dateIso,
    available: true,
    cached: result.cached,
    ephemeris: result.sample,
    classification: 'OBSERVED',
  });
});

apiRouter.get('/solar-system', async (req, res) => {
  const parsed = dateQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.flatten() });
    return;
  }

  const dateIso = parsed.data.date ?? defaultTodayIso();
  const refresh = parsed.data.refresh === 'true';
  if (refresh) clearHorizonsCache();

  try {
    const snapshot = await buildSolarSystemSnapshot(dateIso, refresh);
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({
      error: 'Failed to build solar system snapshot',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

apiRouter.get('/pulsars', (_req, res) => {
  res.json({
    count: PULSAR_CATALOG.length,
    referenceFrame: 'Heliocentric Ecliptic J2000 (converted from ICRS RA/Dec)',
    pulsars: PULSAR_CATALOG,
    source: 'ATNF Pulsar Catalogue & NASA NICER/SEXTANT Literature',
    sourceUrl: 'https://www.atnf.csiro.au/research/pulsar/psrcat/',
    classification: 'OBSERVED',
  });
});

apiRouter.post('/trajectory/propagate', (req, res) => {
  const parsed = propagationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid propagation parameters', details: parsed.error.flatten() });
    return;
  }
  const result = propagateTrajectory(parsed.data);
  res.json(result);
});

apiRouter.post('/trajectory/coe', (req, res) => {
  const parsed = coeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid state vector for COE', details: parsed.error.flatten() });
    return;
  }
  const result = stateToOrbitalElements(parsed.data.rKm, parsed.data.vKmS, parsed.data.centralBody);
  res.json(result);
});

apiRouter.post('/trajectory/hohmann', (req, res) => {
  const parsed = hohmannSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid Hohmann transfer parameters', details: parsed.error.flatten() });
    return;
  }
  const result = computeHohmannTransfer(parsed.data);
  res.json(result);
});

apiRouter.post('/trajectory/lambert', (req, res) => {
  const parsed = lambertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid Lambert solver parameters', details: parsed.error.flatten() });
    return;
  }
  const result = solveLambert(parsed.data);
  res.json(result);
});

apiRouter.post('/navigation/simulate', (req, res) => {
  const parsed = xnavRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid XNAV simulation parameters', details: parsed.error.flatten() });
    return;
  }

  const result = runXnavSimulation(parsed.data);
  res.json(result);
});

apiRouter.post('/comms/analyze', (req, res) => {
  const parsed = commAnalyzeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid communications parameters', details: parsed.error.flatten() });
    return;
  }
  const result = analyzeCommunicationLink(parsed.data, undefined, parsed.data.centralBody ?? 'sun');
  res.json(result);
});

apiRouter.post('/trajectory/plan', (req, res) => {
  const parsed = missionPlanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid mission plan parameters', details: parsed.error.flatten() });
    return;
  }

  if (parsed.data.origin === parsed.data.destination) {
    res.status(400).json({ error: 'Origin and destination bodies must be different.' });
    return;
  }

  const result = computeMissionPlan({
    ...parsed.data,
    destination: parsed.data.destination as 'moon' | 'mars' | 'jupiter' | 'sun-earth-l1' | 'sun-earth-l2',
  });
  res.json(result);
});

apiRouter.get('/sources', (_req, res) => {
  const horizons = getHorizonsProviderStatus();
  const sources: DataSourceStatus[] = [
    horizons,
    {
      id: 'isro-missions',
      provider: 'ISRO Spacecraft Missions Catalogue',
      categories: ['Indian Space Mission Metadata', 'Launch Dates', 'Verified Operational Status'],
      officialUrl: 'https://www.isro.gov.in/SpacecraftMissions.html',
      status: 'STATIC_VERIFIED',
      lastSuccessfulRequest: null,
      cacheEntries: 5,
      cacheTtlSeconds: 0,
      lastError: null,
      notes:
        'Verified static catalog of ISRO missions (Chandrayaan-1/2/3, Aditya-L1, XPoSat). Live ephemeris for Aditya-L1 (-156) and Chandrayaan-2 (-152) retrieved via JPL Horizons.',
    },
    {
      id: 'nasa-missions-dsn',
      provider: 'NASA Science & Deep Space Network (DSN) Reference',
      categories: ['International Mission Metadata', 'DSN Link Characteristics'],
      officialUrl: 'https://www.nasa.gov/communicating-with-missions/dsn/',
      status: 'STATIC_VERIFIED',
      lastSuccessfulRequest: null,
      cacheEntries: 7,
      cacheTtlSeconds: 0,
      lastError: null,
      notes:
        'Mission metadata verified from NASA Science. Ground-station links and disruption scenarios are explicitly modeled as SIMULATED.',
    },
    {
      id: 'atnf-pulsar-catalogue',
      provider: 'ATNF Pulsar Catalogue & NASA NICER/SEXTANT References',
      categories: ['Millisecond Pulsar Coordinates', 'Spin Periods', 'Timing Precision'],
      officialUrl: 'https://www.atnf.csiro.au/research/pulsar/psrcat/',
      status: 'STATIC_VERIFIED',
      lastSuccessfulRequest: null,
      cacheEntries: PULSAR_CATALOG.length,
      cacheTtlSeconds: 0,
      lastError: null,
      notes:
        'Published pulsar parameters combined with CELESTIUM synthetic X-ray TOA observation generator (SIMULATED).',
    },
  ];

  res.json({
    checkedAt: new Date().toISOString(),
    sources,
  });
});

const spaceSonarSchema = z.object({
  modality: z.enum(['flash-lidar', 'fmcw-coherent-lidar', 'optical-twtt', 'ka-band-pn-rf']),
  rangeM: z.number().finite().min(5).max(1e9),
  radialVelocityMS: z.number().finite().min(-50000).max(50000),
  txPowerW: z.number().finite().min(0.05).max(5000),
  apertureM: z.number().finite().min(0.02).max(15),
  bandwidthMHz: z.number().finite().min(0.1).max(5000),
  integrationMs: z.number().finite().min(0.1).max(10000),
  targetReflectivity: z.number().finite().min(0.01).max(1),
  targetCrossSectionM2: z.number().finite().min(0.01).max(1000),
  retroreflector: z.boolean(),
  solarBackground: z.boolean(),
  beaconCount: z.number().int().min(4).max(6),
  seed: z.number().int().optional(),
});

apiRouter.get('/sonar/presets', (_req, res) => {
  res.json({
    presets: Object.values(SPACE_SONAR_PRESETS),
  });
});

apiRouter.post('/sonar/simulate', (req, res) => {
  const parsed = spaceSonarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid Space Sonar parameters', details: parsed.error.flatten() });
    return;
  }
  const result = runSpaceSonarSimulation(parsed.data);
  res.json(result);
});

apiRouter.get('/downloads/celestium-cli.zip', (_req, res) => {
  const pythonCliDir = path.resolve(process.cwd(), 'python-cli');
  const entries = collectDirectoryEntries(pythonCliDir, 'celestium-python-cli');
  if (entries.length === 0) {
    res.status(404).json({ error: 'Python CLI project files not found on server.' });
    return;
  }
  const zipBuffer = buildZipArchive(entries);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="celestium-python-cli.zip"');
  res.setHeader('Content-Length', String(zipBuffer.length));
  res.send(zipBuffer);
});
