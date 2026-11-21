import { describe, expect, it } from 'vitest';
import {
  analyzeCommunicationLink,
  computeFreeSpacePathLossDb,
  evaluateSingleLinkPoint,
} from '../src/shared/science/communications.ts';
import { AU_KM, C_MPS, K_BOLTZMANN_JK } from '../src/shared/science/constants.ts';
import {
  auPerDayToKms,
  auToKm,
  degToRad,
  kmToAu,
  kmsToAuPerDay,
  radToDeg,
  wattsToDbw,
} from '../src/shared/science/units.ts';

describe('Units & Communication Link Budget Analysis', () => {
  it('performs exact unit round-trips for distance, speed, angle, and power', () => {
    expect(kmToAu(auToKm(2.5))).toBeCloseTo(2.5, 10);
    expect(auPerDayToKms(kmsToAuPerDay(29.78))).toBeCloseTo(29.78, 10);
    expect(radToDeg(degToRad(45))).toBeCloseTo(45, 10);
    expect(wattsToDbw(100)).toBeCloseTo(20, 10);
  });

  it('computes exact FSPL, C/N0, Eb/N0, and link margin from first principles', () => {
    const rangeKm = AU_KM; // 1 AU
    const freqGHz = 8.42;
    const wavelengthM = C_MPS / (freqGHz * 1e9);
    const expectedFspl = 20 * Math.log10((4 * Math.PI * rangeKm * 1000) / wavelengthM);

    expect(computeFreeSpacePathLossDb(rangeKm, freqGHz)).toBeCloseTo(expectedFspl, 6);

    const ptW = 35;
    const gt = 41.5;
    const gr = 68.2;
    const loss = 2.5;
    const tSys = 38;
    const rb = 16384;
    const reqEbN0 = 3.2;

    const pt = evaluateSingleLinkPoint(
      {
        frequencyGHz: freqGHz,
        txPowerW: ptW,
        txAntennaGainDbi: gt,
        rxAntennaGainDbi: gr,
        systemLossesDb: loss,
        systemNoiseTempK: tSys,
        dataRateBps: rb,
        requiredEbN0Db: reqEbN0,
      },
      rangeKm,
      0,
      '2026-11-21T00:00:00Z'
    );

    const expectedPr = wattsToDbw(ptW) + gt + gr - expectedFspl - loss;
    const expectedCn0 = expectedPr - 10 * Math.log10(K_BOLTZMANN_JK * tSys);
    const expectedEbN0 = expectedCn0 - 10 * Math.log10(rb);

    expect(pt.oneWayLightTimeSec).toBeCloseTo(499.00478, 3);
    expect(pt.roundTripLightTimeSec).toBeCloseTo(998.00956, 3);
    expect(pt.receivedPowerDbw).toBeCloseTo(expectedPr, 5);
    expect(pt.cn0DbHz).toBeCloseTo(expectedCn0, 5);
    expect(pt.ebN0Db).toBeCloseTo(expectedEbN0, 5);
    expect(pt.linkMarginDb).toBeCloseTo(expectedEbN0 - reqEbN0, 5);
  });

  it('detects geometric Earth occultation behind central body in Earth-centered orbit', () => {
    const res = analyzeCommunicationLink(
      {
        frequencyGHz: 2.25,
        txPowerW: 15,
        txAntennaGainDbi: 22,
        rxAntennaGainDbi: 52,
        systemLossesDb: 2,
        systemNoiseTempK: 110,
        dataRateBps: 262144,
        requiredEbN0Db: 4.5,
      },
      [
        {
          index: 0,
          elapsedSec: 0,
          elapsedDays: 0,
          epochIso: '2026-11-21T00:00:00Z',
          positionKm: { x: 7000, y: 0, z: 0 },
          velocityKmS: { x: 0, y: 7.5, z: 0 },
          radiusKm: 7000,
          speedKmS: 7.5,
          specificEnergyKm2S2: -28.0,
          angularMomentumKm2S: 52500,
        },
        {
          index: 1,
          elapsedSec: 2700,
          elapsedDays: 2700 / 86400,
          epochIso: '2026-11-21T00:45:00Z',
          positionKm: { x: -7000, y: 100, z: 0 },
          velocityKmS: { x: 0, y: -7.5, z: 0 },
          radiusKm: 7001,
          speedKmS: 7.5,
          specificEnergyKm2S2: -28.0,
          angularMomentumKm2S: 52500,
        },
      ],
      'earth'
    );

    expect(res.occultedPointsCount).toBe(1);
    expect(res.timeSeries[1].geometricVisibility).toBe('OCCULTED');
  });
});
