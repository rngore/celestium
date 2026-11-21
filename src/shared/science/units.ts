import { AU_KM, AU_METERS, SECONDS_PER_DAY } from './constants.ts';
import type { UnitDisplayMode, Vector3D } from '../types.ts';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export function kmToM(km: number): number {
  return km * 1000;
}

export function mToKm(m: number): number {
  return m / 1000;
}

export function kmToAu(km: number): number {
  return km / AU_KM;
}

export function auToKm(au: number): number {
  return au * AU_KM;
}

export function mToAu(m: number): number {
  return m / AU_METERS;
}

export function auToM(au: number): number {
  return au * AU_METERS;
}

export function kmsToMs(kms: number): number {
  return kms * 1000;
}

export function msToKms(ms: number): number {
  return ms / 1000;
}

export function kmsToAuPerDay(kms: number): number {
  return (kms * SECONDS_PER_DAY) / AU_KM;
}

export function auPerDayToKms(auPerDay: number): number {
  return (auPerDay * AU_KM) / SECONDS_PER_DAY;
}

export function degToRad(deg: number): number {
  return deg * DEG_TO_RAD;
}

export function radToDeg(rad: number): number {
  return rad * RAD_TO_DEG;
}

export function wattsToDbw(watts: number): number {
  return 10 * Math.log10(Math.max(1e-30, watts));
}

export function dbwToWatts(dbw: number): number {
  return Math.pow(10, dbw / 10);
}

export function wattsToDbm(watts: number): number {
  return 10 * Math.log10(Math.max(1e-30, watts * 1000));
}

export function secondsToDays(sec: number): number {
  return sec / SECONDS_PER_DAY;
}

export function daysToSeconds(days: number): number {
  return days * SECONDS_PER_DAY;
}

export function isoToJd(iso: string): number {
  const t = new Date(iso).getTime();
  const safeMs = Number.isFinite(t) ? t : new Date('2026-11-21T00:00:00Z').getTime();
  return safeMs / (SECONDS_PER_DAY * 1000) + 2440587.5;
}

export function jdToIso(jd: number): string {
  const ms = (jd - 2440587.5) * SECONDS_PER_DAY * 1000;
  return new Date(ms).toISOString();
}

export function formatDistanceByUnit(km: number, mode: UnitDisplayMode): { value: string; unit: string } {
  if (mode === 'au') {
    return { value: kmToAu(km).toFixed(6), unit: 'AU' };
  }
  if (mode === 'si') {
    return { value: kmToM(km).toExponential(5), unit: 'm' };
  }
  return {
    value: Math.abs(km) >= 1e7 ? km.toExponential(5) : km.toFixed(3),
    unit: 'km',
  };
}

export function formatVelocityByUnit(kms: number, mode: UnitDisplayMode): { value: string; unit: string } {
  if (mode === 'au') {
    return { value: kmsToAuPerDay(kms).toFixed(6), unit: 'AU/d' };
  }
  if (mode === 'si') {
    return { value: kmsToMs(kms).toFixed(2), unit: 'm/s' };
  }
  return { value: kms.toFixed(5), unit: 'km/s' };
}

export function convertVecKmToUnit(v: Vector3D, mode: UnitDisplayMode): Vector3D {
  if (mode === 'au') return { x: kmToAu(v.x), y: kmToAu(v.y), z: kmToAu(v.z) };
  if (mode === 'si') return { x: kmToM(v.x), y: kmToM(v.y), z: kmToM(v.z) };
  return { ...v };
}
