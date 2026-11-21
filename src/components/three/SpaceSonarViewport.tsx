import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SpaceSonarSimulationResult } from '../../shared/types.ts';
import {
  buildProceduralSpacecraftMesh,
  createStarfield,
  createStudioRenderer,
  detectSoftwareGl,
} from './threeUtils.ts';

interface SpaceSonarViewportProps {
  result: SpaceSonarSimulationResult;
}

export const SpaceSonarViewport: React.FC<SpaceSonarViewportProps> = ({ result }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);
  const resultRef = useRef(result);
  resultRef.current = result;
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
      44,
      (container.clientWidth || 640) / (container.clientHeight || 360),
      0.1,
      400
    );
    camera.position.set(18, 14, 22);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 8;
    controls.maxDistance = 65;

    scene.add(new THREE.HemisphereLight(0xbae6fd, 0x0f172a, 0.9));
    const keyLight = new THREE.DirectionalLight(0xf8fafc, 1.8);
    keyLight.position.set(16, 20, 14);
    scene.add(keyLight);

    const stars = createStarfield(500, 120);
    scene.add(stars);

    const grid = new THREE.GridHelper(28, 14, 0x1e293b, 0x0f172a);
    grid.position.y = -6;
    scene.add(grid);

    const axes = new THREE.AxesHelper(5);
    axes.position.set(0, -5.95, 0);
    scene.add(axes);

    const dynamicGroup = new THREE.Group();
    scene.add(dynamicGroup);

    const pulsePackets: { mesh: THREE.Mesh; start: THREE.Vector3; end: THREE.Vector3; phase: number }[] = [];
    const disposableGeos: THREE.BufferGeometry[] = [];
    const disposableMats: THREE.Material[] = [];

    const rebuild = () => {
      dynamicGroup.clear();
      pulsePackets.length = 0;

      const sim = resultRef.current;
      const scale = 10 / Math.max(1, sim.request.rangeM);
      const toScene = (v: { x: number; y: number; z: number }) =>
        new THREE.Vector3(v.x * scale, v.z * scale, -v.y * scale);

      const truePos = toScene(sim.truePositionM);
      const estPosRaw = toScene(sim.estimatedPositionM);

      // Exaggerate tiny sub-meter error visually only for inspection while keeping direction exact
      const errDir = estPosRaw.clone().sub(truePos);
      const errLen = errDir.length();
      const visualEstPos =
        errLen > 1e-6
          ? truePos.clone().addScaledVector(errDir.normalize(), Math.min(2.2, Math.max(0.32, errLen)))
          : truePos.clone().add(new THREE.Vector3(0.25, 0.15, 0));

      const scGroup = buildProceduralSpacecraftMesh(
        sim.linkBudget.linkClosed ? 0x22d3ee : 0xf59e0b,
        sim.request.modality === 'optical-twtt' || sim.request.modality === 'ka-band-pn-rf',
        1.15
      );
      scGroup.position.copy(truePos);
      dynamicGroup.add(scGroup);

      // Estimated position + 3-sigma covariance ellipsoid
      const estGeo = new THREE.OctahedronGeometry(0.32, 0);
      const estMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
      const estMesh = new THREE.Mesh(estGeo, estMat);
      estMesh.position.copy(visualEstPos);
      dynamicGroup.add(estMesh);
      disposableGeos.push(estGeo);
      disposableMats.push(estMat);

      const [s1, s2, s3] = sim.principalAxis3SigmaM;
      const maxS = Math.max(s1, s2, s3, 1e-9);
      const ellipBase = 1.1;
      const ellipGeo = new THREE.SphereGeometry(ellipBase, 18, 12);
      const ellipMat = new THREE.MeshBasicMaterial({
        color: sim.linkBudget.linkClosed ? 0x10b981 : 0xf59e0b,
        wireframe: true,
        transparent: true,
        opacity: 0.3,
      });
      const ellipMesh = new THREE.Mesh(ellipGeo, ellipMat);
      ellipMesh.position.copy(visualEstPos);
      ellipMesh.scale.set(
        Math.max(0.35, s1 / maxS),
        Math.max(0.35, s3 / maxS),
        Math.max(0.35, s2 / maxS)
      );
      dynamicGroup.add(ellipMesh);
      disposableGeos.push(ellipGeo);
      disposableMats.push(ellipMat);

      // Beacons & active laser/RF ranging beams
      const beamColor =
        sim.request.modality === 'ka-band-pn-rf'
          ? 0x38bdf8
          : sim.linkBudget.linkClosed
            ? 0x22d3ee
            : 0xf59e0b;

      sim.beacons.forEach((b, idx) => {
        const bPos = toScene(b.positionM);
        const bGeo = new THREE.BoxGeometry(0.65, 0.65, 0.65);
        const bMat = new THREE.MeshStandardMaterial({
          color: 0xe2e8f0,
          emissive: beamColor,
          emissiveIntensity: 0.35,
          metalness: 0.7,
          roughness: 0.3,
        });
        const bMesh = new THREE.Mesh(bGeo, bMat);
        bMesh.position.copy(bPos);
        dynamicGroup.add(bMesh);
        disposableGeos.push(bGeo);
        disposableMats.push(bMat);

        const lineGeo = new THREE.BufferGeometry().setFromPoints([truePos, bPos]);
        const lineMat = new THREE.LineBasicMaterial({
          color: beamColor,
          transparent: true,
          opacity: 0.72,
        });
        dynamicGroup.add(new THREE.Line(lineGeo, lineMat));
        disposableGeos.push(lineGeo);
        disposableMats.push(lineMat);

        // Two-way ranging ping packet
        const pGeo = new THREE.SphereGeometry(0.15, 8, 8);
        const pMat = new THREE.MeshBasicMaterial({ color: 0xa5f3fc });
        const pMesh = new THREE.Mesh(pGeo, pMat);
        dynamicGroup.add(pMesh);
        pulsePackets.push({ mesh: pMesh, start: truePos.clone(), end: bPos.clone(), phase: idx * 0.2 });
        disposableGeos.push(pGeo);
        disposableMats.push(pMat);
      });
    };

    rebuildRef.current = rebuild;
    rebuild();

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 640;
      const h = container.clientHeight || 360;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

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
          if (s === gl.UNSIGNALED) frameId = window.setTimeout(poll, 5);
          else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    };

    const tick = () => {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.1);
      for (const pkt of pulsePackets) {
        pkt.phase = (pkt.phase + delta * 0.7) % 1;
        // Two-way ping: 0..0.5 outbound, 0.5..1.0 return echo
        const u = pkt.phase < 0.5 ? pkt.phase * 2 : (1 - pkt.phase) * 2;
        pkt.mesh.position.lerpVectors(pkt.start, pkt.end, u);
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
      ro.disconnect();
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
  }, [result]);

  if (webglError) {
    return (
      <div className="flex h-full items-center justify-center bg-[#070B14] p-4 text-xs text-amber-400">
        {webglError}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#050811]">
      <div ref={mountRef} className="h-full w-full" aria-label="Space Sonar 3D Ranging Geometry" />
      <div className="pointer-events-none absolute top-3 left-3 z-10 border border-slate-800 bg-[#070B14]/92 px-3 py-1.5 font-mono text-[11px] text-slate-200">
        LVLH Ranging Geometry · {result.beacons.length} Beacons · PDOP {result.pdop.toFixed(2)}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-wrap gap-3 border border-slate-800 bg-[#070B14]/90 px-3 py-1.5 font-mono text-[10px] text-slate-400">
        <span className="text-cyan-400">■ Active Two-Way Beams</span>
        <span className="text-emerald-400">■ WNLS Fix &amp; 3σ Principal Ellipsoid</span>
      </div>
    </div>
  );
};
