import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { NavigationMode, XnavSimulationResult } from '../../shared/types.ts';
import {
  buildProceduralSpacecraftMesh,
  createStarfield,
  createStudioRenderer,
  detectSoftwareGl,
} from './threeUtils.ts';

interface UniverseGpsViewportProps {
  mode: NavigationMode;
  result: XnavSimulationResult;
  dsnDisrupted: boolean;
}

export const UniverseGpsViewport: React.FC<UniverseGpsViewportProps> = ({
  mode,
  result,
  dsnDisrupted,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);
  const stateRef = useRef({ mode, result, dsnDisrupted });
  stateRef.current = { mode, result, dsnDisrupted };
  const rebuildRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    let scene: THREE.Scene;
    let envTex: THREE.Texture;
    const isSoftwareGl = detectSoftwareGl();

    try {
      const studio = createStudioRenderer(container, isSoftwareGl);
      renderer = studio.renderer;
      scene = studio.scene;
      envTex = studio.envTex;
    } catch (err) {
      setWebglError(err instanceof Error ? err.message : 'WebGL initialization failed.');
      return;
    }

    const camera = new THREE.PerspectiveCamera(
      45,
      (container.clientWidth || 700) / (container.clientHeight || 420),
      0.1,
      500
    );
    camera.position.set(16, 13, 21);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 8;
    controls.maxDistance = 60;

    scene.add(new THREE.HemisphereLight(0xbae6fd, 0x0f172a, 0.9));
    const keyLight = new THREE.DirectionalLight(0xf8fafc, 1.8);
    keyLight.position.set(15, 22, 18);
    scene.add(keyLight);

    const stars = createStarfield(800, 140);
    scene.add(stars);

    // Reference Frame Grid (SSB Ecliptic J2000)
    const grid = new THREE.GridHelper(32, 16, 0x1e293b, 0x0f172a);
    grid.position.y = -4.5;
    scene.add(grid);

    const axes = new THREE.AxesHelper(6);
    axes.position.set(0, -4.45, 0);
    scene.add(axes);

    const dynamicGroup = new THREE.Group();
    scene.add(dynamicGroup);

    const pulsePackets: { mesh: THREE.Mesh; dir: THREE.Vector3; phase: number }[] = [];
    const disposableGeos: THREE.BufferGeometry[] = [];
    const disposableMats: THREE.Material[] = [];

    const rebuildScene = () => {
      dynamicGroup.clear();
      pulsePackets.length = 0;

      const { mode: activeMode, result: sim, dsnDisrupted: disrupted } = stateRef.current;

      // Earth marker positioned on -X side of scene baseline
      const earthPos = new THREE.Vector3(-10, 0, 2);
      const earthGeo = new THREE.SphereGeometry(1.15, 24, 18);
      const earthMat = new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        emissive: 0x0c4a6e,
        emissiveIntensity: 0.45,
        roughness: 0.55,
      });
      const earthMesh = new THREE.Mesh(earthGeo, earthMat);
      earthMesh.position.copy(earthPos);
      dynamicGroup.add(earthMesh);
      disposableGeos.push(earthGeo);
      disposableMats.push(earthMat);

      // True Simulated Spacecraft Position at scene focal center (4, 0, -1)
      const trueScPos = new THREE.Vector3(4, 0.4, -1);
      const scMesh = buildProceduralSpacecraftMesh(0x22d3ee, true, 1.35);
      scMesh.position.copy(trueScPos);
      dynamicGroup.add(scMesh);

      // Map physical error vector (exaggerated into visible scene units while keeping direction exact)
      const errVec = sim.positionErrorVectorKm;
      const errMag = Math.sqrt(errVec.x * errVec.x + errVec.y * errVec.y + errVec.z * errVec.z) || 1;
      const visualErrLen = Math.min(3.8, Math.max(0.55, Math.log10(1 + errMag) * 0.95));
      const errDir = new THREE.Vector3(
        errVec.x / errMag,
        errVec.z / errMag,
        -errVec.y / errMag
      ).normalize();
      const estScPos = trueScPos.clone().addScaledVector(errDir, visualErrLen);

      // Estimated position beacon + 1-sigma uncertainty ellipsoid
      const estGeo = new THREE.OctahedronGeometry(0.42, 0);
      const estMat = new THREE.MeshBasicMaterial({
        color: activeMode === 'XNAV' ? 0x10b981 : 0xf59e0b,
      });
      const estMesh = new THREE.Mesh(estGeo, estMat);
      estMesh.position.copy(estScPos);
      dynamicGroup.add(estMesh);
      disposableGeos.push(estGeo);
      disposableMats.push(estMat);

      const uncRadius = Math.min(3.4, Math.max(0.75, Math.log10(1 + sim.uncertainty1SigmaKm) * 0.85));
      const uncGeo = new THREE.SphereGeometry(uncRadius, 18, 14);
      const uncMat = new THREE.MeshBasicMaterial({
        color: activeMode === 'XNAV' ? 0x10b981 : 0xf59e0b,
        wireframe: true,
        transparent: true,
        opacity: 0.28,
      });
      const uncSphere = new THREE.Mesh(uncGeo, uncMat);
      uncSphere.position.copy(estScPos);
      dynamicGroup.add(uncSphere);
      disposableGeos.push(uncGeo);
      disposableMats.push(uncMat);

      // Error Vector line connecting True -> Estimated
      const errLineGeo = new THREE.BufferGeometry().setFromPoints([trueScPos, estScPos]);
      const errLineMat = new THREE.LineBasicMaterial({ color: 0xf59e0b });
      dynamicGroup.add(new THREE.Line(errLineGeo, errLineMat));
      disposableGeos.push(errLineGeo);
      disposableMats.push(errLineMat);

      // Earth DSN Communication Link Beam
      const dsnPoints = [earthPos, trueScPos];
      const dsnGeo = new THREE.BufferGeometry().setFromPoints(dsnPoints);
      const dsnMat = disrupted
        ? new THREE.LineDashedMaterial({
            color: 0xef4444,
            dashSize: 0.5,
            gapSize: 0.45,
            transparent: true,
            opacity: activeMode === 'DSN' ? 0.95 : 0.35,
          })
        : new THREE.LineBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: activeMode === 'DSN' ? 0.95 : 0.3,
          });
      const dsnLine = new THREE.Line(dsnGeo, dsnMat);
      if (disrupted) dsnLine.computeLineDistances();
      dynamicGroup.add(dsnLine);
      disposableGeos.push(dsnGeo);
      disposableMats.push(dsnMat);

      // Pulsar Signal Vectors & Wavefront Beams (at least 4 pulsars)
      sim.pulsarObservations.forEach((obs, idx) => {
        const u = obs.unitVector;
        // Convert ecliptic unit vector (x, y, z) -> Three.js (x, z, -y)
        const dir = new THREE.Vector3(u.x, u.z, -u.y).normalize();
        const sourcePos = trueScPos.clone().addScaledVector(dir, 14.5);

        // Pulsar neutron star beacon
        const starGeo = new THREE.SphereGeometry(0.32, 12, 10);
        const starMat = new THREE.MeshBasicMaterial({
          color: activeMode === 'XNAV' ? 0x22d3ee : 0x475569,
        });
        const starMesh = new THREE.Mesh(starGeo, starMat);
        starMesh.position.copy(sourcePos);
        dynamicGroup.add(starMesh);
        disposableGeos.push(starGeo);
        disposableMats.push(starMat);

        // Beam line from pulsar toward spacecraft
        const beamGeo = new THREE.BufferGeometry().setFromPoints([sourcePos, trueScPos]);
        const beamMat = new THREE.LineBasicMaterial({
          color: activeMode === 'XNAV' ? 0x22d3ee : 0x334155,
          transparent: true,
          opacity: activeMode === 'XNAV' ? 0.72 : 0.25,
        });
        dynamicGroup.add(new THREE.Line(beamGeo, beamMat));
        disposableGeos.push(beamGeo);
        disposableMats.push(beamMat);

        if (activeMode === 'XNAV') {
          const pktGeo = new THREE.SphereGeometry(0.16, 8, 8);
          const pktMat = new THREE.MeshBasicMaterial({ color: 0xa5f3fc });
          const pktMesh = new THREE.Mesh(pktGeo, pktMat);
          dynamicGroup.add(pktMesh);
          pulsePackets.push({ mesh: pktMesh, dir: dir.clone().negate(), phase: idx * 0.23 });
          disposableGeos.push(pktGeo);
          disposableMats.push(pktMat);
        }
      });
    };

    rebuildRef.current = rebuildScene;
    rebuildScene();

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 700;
      const h = container.clientHeight || 420;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const s = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (s === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    };

    const trueScPos = new THREE.Vector3(4, 0.4, -1);

    const tick = () => {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.1);

      for (const pkt of pulsePackets) {
        pkt.phase = (pkt.phase + delta * 0.55) % 1;
        const distFromSource = pkt.phase * 14.5;
        pkt.mesh.position
          .copy(trueScPos)
          .addScaledVector(pkt.dir, -(14.5 - distFromSource));
      }

      controls.update();
      renderer.render(scene, camera);
      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    };

    if (!isSoftwareGl) renderer.compile(scene, camera);
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      disposableGeos.forEach((g) => g.dispose());
      disposableMats.forEach((m) => m.dispose());
      envTex.dispose();
      stars.geometry.dispose();
      (stars.material as THREE.Material).dispose();
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    rebuildRef.current?.();
  }, [mode, result, dsnDisrupted]);

  if (webglError) {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center bg-[#070B14] p-6 text-xs text-amber-400">
        {webglError}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#050811]">
      <div ref={mountRef} className="h-full w-full" aria-label="Universe GPS 3D Pulsar Navigation Scene" />
      <div className="pointer-events-none absolute top-3 left-3 z-10 border border-slate-800 bg-[#070B14]/92 px-3 py-1.5 font-mono text-[11px] text-slate-200">
        {mode === 'XNAV'
          ? 'UNIVERSE GPS ACTIVE · Pulsar X-ray Beams & Onboard Covariance'
          : dsnDisrupted
            ? 'EARTH DSN DISRUPTED · Ground Link Severed (Dead-Reckoning Drift)'
            : 'EARTH DSN TRACKING · Two-Way Radiometric Ground Link'}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-wrap gap-3 border border-slate-800 bg-[#070B14]/90 px-3 py-1.5 font-mono text-[10px] text-slate-400">
        <span className="text-sky-400">■ Earth / DSN Link</span>
        <span className="text-cyan-400">■ Pulsar Beams</span>
        <span className="text-emerald-400">■ Estimated Fix + 1σ Ellipsoid</span>
        <span className="text-amber-400">■ Error Vector</span>
      </div>
    </div>
  );
};
