import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { MissionPlanResult } from '../../shared/types.ts';
import {
  buildProceduralSpacecraftMesh,
  createStarfield,
  createStudioRenderer,
  detectSoftwareGl,
  eclipticAuToSceneVec,
} from './threeUtils.ts';

interface TrajectoryViewportProps {
  plan: MissionPlanResult;
  timelineFraction: number;
  showPulsarRefs: boolean;
}

export const TrajectoryViewport: React.FC<TrajectoryViewportProps> = ({
  plan,
  timelineFraction,
  showPulsarRefs,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  const stateRef = useRef({ plan, timelineFraction, showPulsarRefs });
  stateRef.current = { plan, timelineFraction, showPulsarRefs };
  const handlersRef = useRef<{
    rebuildRoute: () => void;
    updateSpacecraftPos: () => void;
  } | null>(null);

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
      46,
      (container.clientWidth || 700) / (container.clientHeight || 420),
      0.1,
      900
    );
    camera.position.set(0, 44, 62);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 10;
    controls.maxDistance = 240;

    scene.add(new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.75));
    const sunLight = new THREE.PointLight(0xfffbeb, 2.8, 350, 0.25);
    scene.add(sunLight);

    const stars = createStarfield(950, 260);
    scene.add(stars);

    // Sun core
    const sunGeo = new THREE.SphereGeometry(2.6, 24, 18);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    scene.add(new THREE.Mesh(sunGeo, sunMat));

    const routeGroup = new THREE.Group();
    scene.add(routeGroup);

    const scMesh = buildProceduralSpacecraftMesh(0x22d3ee, false, 1.15);
    scene.add(scMesh);

    const earthGeo = new THREE.SphereGeometry(0.95, 18, 14);
    const earthMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.6 });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    scene.add(earthMesh);

    const commLineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const commLineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8 });
    const commLine = new THREE.Line(commLineGeo, commLineMat);
    scene.add(commLine);

    const dirArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(),
      3.5,
      0x10b981,
      0.8,
      0.45
    );
    scene.add(dirArrow);

    const disposableGeos: THREE.BufferGeometry[] = [sunGeo, earthGeo, commLineGeo];
    const disposableMats: THREE.Material[] = [sunMat, earthMat, commLineMat];

    const rebuildRoute = () => {
      routeGroup.clear();
      const { plan: p, showPulsarRefs: pulsars } = stateRef.current;

      const addOrbitRing = (ptsAU: typeof p.originOrbitAU, color: number, opacity: number) => {
        const pts = ptsAU.map((pt) => eclipticAuToSceneVec(pt, new THREE.Vector3()));
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
        routeGroup.add(new THREE.Line(geo, mat));
        disposableGeos.push(geo);
        disposableMats.push(mat);
      };

      addOrbitRing(p.originOrbitAU, 0x38bdf8, 0.45);
      addOrbitRing(p.destinationOrbitAU, 0xf59e0b, 0.45);

      // Transfer arc tube
      const arcPts = p.waypoints.map((w) => eclipticAuToSceneVec(w.positionAU, new THREE.Vector3()));
      if (arcPts.length >= 2) {
        const curve = new THREE.CatmullRomCurve3(arcPts);
        const tubeGeo = new THREE.TubeGeometry(curve, 64, 0.22, 8, false);
        const tubeMat = new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.82,
        });
        routeGroup.add(new THREE.Mesh(tubeGeo, tubeMat));
        disposableGeos.push(tubeGeo);
        disposableMats.push(tubeMat);

        // Origin & Destination markers
        const startGeo = new THREE.SphereGeometry(1.1, 18, 14);
        const startMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.5 });
        const startM = new THREE.Mesh(startGeo, startMat);
        startM.position.copy(arcPts[0]);
        routeGroup.add(startM);

        const endGeo = new THREE.SphereGeometry(1.2, 18, 14);
        const endMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.5 });
        const endM = new THREE.Mesh(endGeo, endMat);
        endM.position.copy(arcPts[arcPts.length - 1]);
        routeGroup.add(endM);

        disposableGeos.push(startGeo, endGeo);
        disposableMats.push(startMat, endMat);
      }

      if (pulsars) {
        const dirs = [
          new THREE.Vector3(0.4, 0.7, -0.5).normalize(),
          new THREE.Vector3(-0.7, 0.5, 0.4).normalize(),
          new THREE.Vector3(0.5, -0.6, 0.6).normalize(),
          new THREE.Vector3(-0.3, -0.5, -0.8).normalize(),
        ];
        dirs.forEach((d) => {
          const g = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            d.clone().multiplyScalar(55),
          ]);
          const m = new THREE.LineBasicMaterial({
            color: 0x06b6d4,
            transparent: true,
            opacity: 0.22,
          });
          routeGroup.add(new THREE.Line(g, m));
          disposableGeos.push(g);
          disposableMats.push(m);
        });
      }
    };

    const updateSpacecraftPos = () => {
      const { plan: p, timelineFraction: frac } = stateRef.current;
      const wps = p.waypoints;
      if (wps.length === 0) return;

      const idxFloat = Math.max(0, Math.min(1, frac)) * (wps.length - 1);
      const i0 = Math.floor(idxFloat);
      const i1 = Math.min(wps.length - 1, i0 + 1);
      const alpha = idxFloat - i0;

      const p0 = eclipticAuToSceneVec(wps[i0].positionAU, new THREE.Vector3());
      const p1 = eclipticAuToSceneVec(wps[i1].positionAU, new THREE.Vector3());
      const curPos = p0.lerp(p1, alpha);
      scMesh.position.copy(curPos);

      const e0 = eclipticAuToSceneVec(wps[i0].earthPositionAU, new THREE.Vector3());
      const e1 = eclipticAuToSceneVec(wps[i1].earthPositionAU, new THREE.Vector3());
      const curEarth = e0.lerp(e1, alpha);
      earthMesh.position.copy(curEarth);

      // Update Earth communication link
      const posAttr = commLine.geometry.getAttribute('position') as THREE.BufferAttribute;
      posAttr.setXYZ(0, curEarth.x, curEarth.y, curEarth.z);
      posAttr.setXYZ(1, curPos.x, curPos.y, curPos.z);
      posAttr.needsUpdate = true;

      const blackout = wps[i0].modeledBlackoutRisk;
      commLineMat.color.setHex(blackout ? 0xf59e0b : 0x38bdf8);

      // Direction of travel vector
      const nextIdx = Math.min(wps.length - 1, i0 + 1);
      const prevIdx = Math.max(0, nextIdx - 1);
      const a0 = eclipticAuToSceneVec(wps[prevIdx].positionAU, new THREE.Vector3());
      const a1 = eclipticAuToSceneVec(wps[nextIdx].positionAU, new THREE.Vector3());
      const tangent = a1.sub(a0);
      if (tangent.lengthSq() > 1e-6) {
        tangent.normalize();
        dirArrow.position.copy(curPos);
        dirArrow.setDirection(tangent);
        dirArrow.visible = true;
      } else {
        dirArrow.visible = false;
      }
    };

    handlersRef.current = { rebuildRoute, updateSpacecraftPos };
    rebuildRoute();
    updateSpacecraftPos();

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
      scMesh.rotation.y += delta * 0.5;
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
    handlersRef.current?.rebuildRoute();
    handlersRef.current?.updateSpacecraftPos();
  }, [plan, showPulsarRefs]);

  useEffect(() => {
    handlersRef.current?.updateSpacecraftPos();
  }, [timelineFraction]);

  if (webglError) {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center bg-[#070B14] p-6 text-xs text-amber-400">
        {webglError}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#050811]">
      <div ref={mountRef} className="h-full w-full" aria-label="Mission Trajectory 3D Scene" />
      <div className="pointer-events-none absolute top-3 left-3 z-10 border border-slate-800 bg-[#070B14]/92 px-3 py-1.5 font-mono text-[11px] text-slate-200">
        {plan.originName} → {plan.destinationName} · Analytical Transfer Model
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-wrap gap-3 border border-slate-800 bg-[#070B14]/90 px-3 py-1.5 font-mono text-[10px] text-slate-400">
        <span className="text-sky-400">■ Origin Orbit / Earth Link</span>
        <span className="text-cyan-400">■ Transfer Arc</span>
        <span className="text-emerald-400">■ Velocity Vector</span>
        <span className="text-amber-400">■ Destination Orbit / Conjunction</span>
      </div>
    </div>
  );
};
