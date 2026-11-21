import { jsPDF } from 'jspdf';
import type { EngineeringReportPayload } from '../types.ts';

/**
 * Generates RFC-4180 compliant CSV strings for trajectory, EKF, and communication time series.
 */
export function buildTrajectoryCsv(payload: EngineeringReportPayload): string {
  const header = [
    'epoch_index',
    'elapsed_sec',
    'elapsed_days',
    'epoch_iso',
    'x_km',
    'y_km',
    'z_km',
    'vx_kms',
    'vy_kms',
    'vz_kms',
    'radius_km',
    'speed_kms',
    'specific_energy_km2_s2',
    'angular_momentum_km2_s',
  ].join(',');

  const rows = payload.propagation.states.map((s) =>
    [
      s.index,
      s.elapsedSec.toFixed(3),
      s.elapsedDays.toFixed(6),
      s.epochIso,
      s.positionKm.x.toFixed(6),
      s.positionKm.y.toFixed(6),
      s.positionKm.z.toFixed(6),
      s.velocityKmS.x.toFixed(8),
      s.velocityKmS.y.toFixed(8),
      s.velocityKmS.z.toFixed(8),
      s.radiusKm.toFixed(6),
      s.speedKmS.toFixed(8),
      s.specificEnergyKm2S2.toFixed(8),
      s.angularMomentumKm2S.toFixed(6),
    ].join(',')
  );

  return [header, ...rows].join('\n');
}

export function buildCommsCsv(payload: EngineeringReportPayload): string {
  const header = [
    'elapsed_days',
    'epoch_iso',
    'range_km',
    'range_au',
    'one_way_light_sec',
    'round_trip_light_sec',
    'fspl_db',
    'received_power_dbw',
    'cn0_dbhz',
    'eb_n0_db',
    'link_margin_db',
    'solar_elongation_deg',
    'visibility',
  ].join(',');

  const rows = payload.communications.timeSeries.map((c) =>
    [
      c.elapsedDays.toFixed(6),
      c.epochIso,
      c.rangeKm.toFixed(3),
      c.rangeAU.toFixed(6),
      c.oneWayLightTimeSec.toFixed(4),
      c.roundTripLightTimeSec.toFixed(4),
      c.fsplDb.toFixed(4),
      c.receivedPowerDbw.toFixed(4),
      c.cn0DbHz.toFixed(4),
      c.ebN0Db.toFixed(4),
      c.linkMarginDb.toFixed(4),
      c.solarElongationDeg.toFixed(3),
      c.geometricVisibility,
    ].join(',')
  );

  return [header, ...rows].join('\n');
}

export function buildEkfCsv(payload: EngineeringReportPayload): string {
  const header = [
    'epoch_index',
    'elapsed_sec',
    'est_x_km',
    'est_y_km',
    'est_z_km',
    'est_vx_kms',
    'est_vy_kms',
    'est_vz_kms',
    'clock_bias_us',
    'pos_error_km',
    'vel_error_kms',
    'uncertainty_1sigma_km',
    'rms_residual_us',
  ].join(',');

  const rows = payload.xnav.ekfHistory.map((e) =>
    [
      e.epochIndex,
      e.elapsedSec,
      e.estimatedPositionKm.x.toFixed(3),
      e.estimatedPositionKm.y.toFixed(3),
      e.estimatedPositionKm.z.toFixed(3),
      e.estimatedVelocityKmS.x.toFixed(6),
      e.estimatedVelocityKmS.y.toFixed(6),
      e.estimatedVelocityKmS.z.toFixed(6),
      (e.estimatedClockBiasSec * 1e6).toFixed(4),
      e.positionErrorKm.toFixed(4),
      e.velocityErrorKmS.toFixed(6),
      e.uncertainty1SigmaKm.toFixed(4),
      e.rmsResidualUs.toFixed(4),
    ].join(',')
  );

  return [header, ...rows].join('\n');
}

/**
 * Generates a real downloadable multi-section engineering PDF report via jsPDF.
 */
export function generateEngineeringPdfBlob(payload: EngineeringReportPayload): Blob {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = 18;
  const left = 15;
  const maxWidth = 180;

  const checkPage = (needed = 12) => {
    if (y + needed > 278) {
      doc.addPage();
      y = 18;
    }
  };

  const addTitle = (text: string) => {
    checkPage(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(14, 116, 144);
    doc.text(text, left, y);
    y += 2;
    doc.setDrawColor(14, 116, 144);
    doc.line(left, y, left + maxWidth, y);
    y += 5;
  };

  const addLine = (label: string, val: string) => {
    checkPage(6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(`${label}:`, left, y);
    doc.setFont('helvetica', 'normal');
    const wrapped = doc.splitTextToSize(val, maxWidth - 52);
    doc.text(wrapped, left + 52, y);
    y += Math.max(5, wrapped.length * 4.2);
  };

  // Header Banner
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text('CELESTIUM — ENGINEERING ANALYSIS REPORT', left, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Generated: ${payload.generatedAtIso}  |  Model Version: v${payload.modelVersion}  |  Seed: ${payload.missionConfig.seed}`,
    left,
    y
  );
  y += 8;

  // 1. Mission Configuration
  addTitle('1. MISSION CONFIGURATION & INITIAL CONDITIONS');
  const cfg = payload.missionConfig;
  addLine('Mission / Spacecraft', `${cfg.missionName} / ${cfg.spacecraftName}`);
  addLine('Central Body / Frame', `${cfg.centralBody.toUpperCase()} (${payload.propagation.referenceFrame})`);
  addLine('Epoch / Duration', `${cfg.epochIso} | ${cfg.durationDays} days`);
  addLine(
    'Initial Position (km)',
    `[${cfg.initialPositionKm.x.toFixed(2)}, ${cfg.initialPositionKm.y.toFixed(2)}, ${cfg.initialPositionKm.z.toFixed(2)}]`
  );
  addLine(
    'Initial Velocity (km/s)',
    `[${cfg.initialVelocityKmS.x.toFixed(5)}, ${cfg.initialVelocityKmS.y.toFixed(5)}, ${cfg.initialVelocityKmS.z.toFixed(5)}]`
  );
  addLine(
    'Force Model',
    `Two-Body + J2:${cfg.enableJ2 ? 'ON' : 'OFF'} + SRP:${cfg.enableSrp ? 'ON' : 'OFF'} + 3rdBody:${cfg.enableThirdBody ? 'ON' : 'OFF'}`
  );
  addLine('Mass / Area / Cr', `${cfg.spacecraftMassKg} kg | ${cfg.areaM2} m² | Cr=${cfg.crReflectivity}`);
  y += 3;

  // 2. Trajectory Propagation & COE
  addTitle('2. TRAJECTORY PROPAGATION & ORBITAL ELEMENTS');
  const prop = payload.propagation;
  const coe = prop.initialOrbitalElements;
  addLine('Integrator', `${prop.integratorUsed.toUpperCase()} (${prop.totalSteps} accepted, ${prop.rejectedSteps} rejected steps)`);
  addLine(
    'Energy / |h| Drift',
    `dE/E0 = ${prop.conservationDiagnostics.relativeEnergyDrift.toExponential(3)} | dh/h0 = ${prop.conservationDiagnostics.relativeAngularMomentumDrift.toExponential(3)}`
  );
  addLine(
    'Step Sensitivity Check',
    `Final Δr = ${prop.stepSensitivityCheck.finalPositionDiffKm.toExponential(3)} km (${prop.stepSensitivityCheck.passed ? 'PASS' : 'CHECK'})`
  );
  addLine(
    'Initial COE',
    `a=${Number.isFinite(coe.semiMajorAxisKm) ? coe.semiMajorAxisKm.toFixed(2) : 'Inf'} km, e=${coe.eccentricity.toFixed(5)}, i=${coe.inclinationDeg.toFixed(3)} deg (${coe.orbitRegime})`
  );
  addLine(
    'Final State Radius/Speed',
    `${prop.finalState.radiusKm.toFixed(2)} km | ${prop.finalState.speedKmS.toFixed(5)} km/s`
  );
  y += 3;

  // 3. Autonomous Navigation (XNAV)
  addTitle('3. AUTONOMOUS NAVIGATION (4-STATE WLS & 8-STATE EKF)');
  const xnav = payload.xnav;
  addLine('Architecture Mode', cfg.navArchitecture);
  addLine('Condition Number / GDOP', `κ = ${xnav.conditionNumber.toFixed(2)} | GDOP = ${xnav.gdop.toFixed(2)} | Rank Deficient: ${xnav.rankDeficient ? 'YES' : 'NO'}`);
  addLine('4-State WLS Pos Error', `${xnav.wlsErrorKm.toFixed(3)} km (Clock bias est: ${(xnav.wlsClockBiasSec * 1e6).toFixed(3)} us)`);
  addLine('8-State EKF Pos Error', `${xnav.ekfErrorKm.toFixed(3)} km (±${xnav.uncertainty1SigmaKm.toFixed(3)} km 1-sigma)`);
  addLine('DSN vs XNAV Summary', `DSN status: ${xnav.dsnComparison.dsnStatus} (${xnav.dsnComparison.dsnModeledErrorKm} km) vs XNAV (${xnav.ekfErrorKm.toFixed(2)} km)`);
  y += 3;

  // 4. Communications Link Analysis
  addTitle('4. COMMUNICATION LINK BUDGET & GEOMETRIC VISIBILITY');
  const com = payload.communications;
  addLine('RF Config', `${com.request.frequencyGHz} GHz | Pt=${com.request.txPowerW} W | Gt=${com.request.txAntennaGainDbi} dBi | Gr=${com.request.rxAntennaGainDbi} dBi | Rb=${com.request.dataRateBps} bps`);
  addLine('Max One-Way Light Time', `${com.maxOneWayLightTimeSec.toFixed(2)} s (${(com.maxOneWayLightTimeSec / 60).toFixed(2)} min)`);
  addLine('Final FSPL / Rx Power', `${com.summaryAtCurrentRange.fsplDb.toFixed(2)} dB | Pr = ${com.summaryAtCurrentRange.receivedPowerDbw.toFixed(2)} dBW`);
  addLine('C/N0 & Eb/N0 Margin', `C/N0=${com.summaryAtCurrentRange.cn0DbHz.toFixed(2)} dB-Hz | Eb/N0=${com.summaryAtCurrentRange.ebN0Db.toFixed(2)} dB | Margin=${com.summaryAtCurrentRange.linkMarginDb.toFixed(2)} dB`);
  addLine('Geometric Occultation', `${com.occultedPointsCount} occulted epochs | ${com.conjunctionRiskPointsCount} solar conjunction epochs (<3 deg)`);
  y += 3;

  // 5. Provenance & Limitations
  addTitle('5. MODEL ASSUMPTIONS, LIMITATIONS & PROVENANCE');
  for (const ins of payload.inspections.slice(0, 4)) {
    checkPage(12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`[${ins.provenance.classification}] ${ins.name} — ${ins.validationStatus}`, left, y);
    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(71, 85, 105);
    const noteLines = doc.splitTextToSize(
      `Eq: ${ins.governingEquations[0]} | Limitation: ${ins.limitations[0] ?? 'See Model Inspector.'}`,
      maxWidth
    );
    doc.text(noteLines, left + 2, y);
    y += noteLines.length * 3.8 + 1.5;
  }

  return doc.output('blob');
}
