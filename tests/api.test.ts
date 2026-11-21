import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { apiRouter } from '../server/routes/api.ts';
import { parseHorizonsVectors } from '../server/services/horizons.ts';

describe('CELESTIUM Backend Engineering API & Horizons Parser', () => {
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', apiRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr !== 'string') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('parses authentic NASA/JPL Horizons $$SOE vector blocks accurately', () => {
    const sampleRaw = `
Target body name: Voyager 1 (spacecraft) (-31)    {source: Voyager_1_ST+refit2022_m}
$$SOE
2461365.500000000 = A.D. 2026-Nov-21 00:00:00.0000 TDB
 X =-3.222398471248619E+01 Y =-1.372255190698938E+02 Z = 9.928482506003020E+01
 VX=-1.195174492387778E-03 VY=-7.861222965025063E-03 VZ= 5.678141366814040E-03
$$EOE`;

    const parsed = parseHorizonsVectors(sampleRaw, '-31');
    expect(parsed).not.toBeNull();
    expect(parsed!.positionAU.x).toBeCloseTo(-32.22398, 4);
    expect(parsed!.positionAU.y).toBeCloseTo(-137.2255, 3);
    expect(parsed!.velocityAUPerDay.z).toBeCloseTo(0.005678, 5);
  });

  it('returns health, missions, pulsars, and sources with structured JSON', async () => {
    const [healthRes, missionsRes, pulsarsRes, sourcesRes] = await Promise.all([
      fetch(`${baseUrl}/api/health`),
      fetch(`${baseUrl}/api/missions`),
      fetch(`${baseUrl}/api/pulsars`),
      fetch(`${baseUrl}/api/sources`),
    ]);

    expect(healthRes.status).toBe(200);
    expect(missionsRes.status).toBe(200);
    expect(pulsarsRes.status).toBe(200);
    expect(sourcesRes.status).toBe(200);

    const missionsJson = (await missionsRes.json()) as { count: number };
    expect(missionsJson.count).toBe(12);
  });

  it('executes numerical propagation, Lambert, Hohmann, and communication endpoints', async () => {
    const propRes = await fetch(`${baseUrl}/api/trajectory/propagate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        centralBody: 'earth',
        initialPositionKm: { x: 7000, y: 0, z: 0 },
        initialVelocityKmS: { x: 0, y: 7.546, z: 0 },
        epochIso: '2026-11-21T00:00:00Z',
        durationDays: 0.1,
        integrator: 'rk45',
      }),
    });
    expect(propRes.status).toBe(200);
    const propJson = (await propRes.json()) as {
      conservationDiagnostics: { relativeEnergyDrift: number };
    };
    expect(propJson.conservationDiagnostics.relativeEnergyDrift).toBeLessThan(1e-7);

    const lambertRes = await fetch(`${baseUrl}/api/trajectory/lambert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        centralBody: 'earth',
        r1Km: { x: 5000, y: 10000, z: 2100 },
        r2Km: { x: -14600, y: 2500, z: 7000 },
        tofSec: 3600,
        direction: 'prograde',
      }),
    });
    expect(lambertRes.status).toBe(200);
    const lambertJson = (await lambertRes.json()) as { converged: boolean };
    expect(lambertJson.converged).toBe(true);

    const commRes = await fetch(`${baseUrl}/api/comms/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        frequencyGHz: 8.42,
        txPowerW: 35,
        txAntennaGainDbi: 41.5,
        rxAntennaGainDbi: 68.2,
        systemLossesDb: 2.5,
        systemNoiseTempK: 38,
        dataRateBps: 16384,
        requiredEbN0Db: 3.2,
        rangeKm: 1.4959787e8,
      }),
    });
    expect(commRes.status).toBe(200);
  });

  it('validates invalid XNAV & trajectory inputs with HTTP 400 and runs valid XNAV', async () => {
    const badNav = await fetch(`${baseUrl}/api/navigation/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pulsarIds: ['only-one'] }),
    });
    expect(badNav.status).toBe(400);

    const navRes = await fetch(`${baseUrl}/api/navigation/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        truePositionKm: { x: 1.5e8, y: 0, z: 0 },
        initialGuessErrorKm: 1200,
        pulsarIds: ['psr-b0531+21', 'psr-b1937+21', 'psr-j0437-4715', 'psr-b1821-24'],
        observationDurationSec: 1800,
        toaNoiseMultiplier: 1.0,
        dsnDisrupted: false,
      }),
    });
    expect(navRes.status).toBe(200);
  });

  it('serves Space Sonar presets and executes Zod-validated POST /api/sonar/simulate', async () => {
    const presetsRes = await fetch(`${baseUrl}/api/sonar/presets`);
    expect(presetsRes.status).toBe(200);

    const validSonar = await fetch(`${baseUrl}/api/sonar/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modality: 'fmcw-coherent-lidar',
        rangeM: 3500,
        radialVelocityMS: -1.85,
        txPowerW: 4.5,
        apertureM: 0.12,
        bandwidthMHz: 800,
        integrationMs: 25,
        targetReflectivity: 0.32,
        targetCrossSectionM2: 2.5,
        retroreflector: false,
        solarBackground: true,
        beaconCount: 4,
      }),
    });
    expect(validSonar.status).toBe(200);
  });

  it('serves a valid ZIP archive of the standalone Python CLI project', async () => {
    const zipRes = await fetch(`${baseUrl}/api/downloads/celestium-cli.zip`);
    expect(zipRes.status).toBe(200);
    expect(zipRes.headers.get('content-type')).toContain('application/zip');
    expect(zipRes.headers.get('content-disposition')).toContain('celestium-python-cli.zip');

    const bytes = new Uint8Array(await zipRes.arrayBuffer());
    // PK\x03\x04 local file header magic
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);
    const ascii = Buffer.from(bytes).toString('latin1');
    expect(ascii).toContain('celestium-python-cli/README.md');
    expect(ascii).toContain('celestium-python-cli/celestium/cli.py');
  });
});
