import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CENTRAL_BODIES, AU_KM } from '../../shared/science/constants.ts';
import type { CentralBodyId, PropagationResult } from '../../shared/types.ts';
import {
  buildProceduralSpacecraftMesh,
  createProceduralPlanetTexture,
  createStarfield,
  createStudioRenderer,
  detectSoftwareGl,
} from './threeUtils.ts';

interface EngineeringOrbitViewportProps {
  propagation: PropagationResult;
  centralBody: CentralBodyId;
  uncertainty1SigmaKm: number;
  selectedEpochIndex: number;
  showAxes: boolean;
  showTrajectory: boolean;
  showUncertainty: boolean;
  showLabels: boolean;
  cameraPreset: 'overview' | 'spacecraft' | 'origin';
  resetTrigger?: number;
}

export const EngineeringOrbitViewport: React.FC<EngineeringOrbitViewportProps> = ({
  propagation,
  centralBody,
  uncertainty1SigmaKm,
  selectedEpochIndex,
  showAxes,
  showTrajectory,
  showUncertainty,
  showLabels,
  cameraPreset,
  resetTrigger = 0,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  const propsRef = useRef({
    propagation,
    centralBody,
    uncertainty1SigmaKm,
    selectedEpochIndex,
    showAxes,
    showTrajectory,
    showUncertainty,
    cameraPreset,
  });
  propsRef.current = {
    propagation,
    centralBody,
    uncertainty1SigmaKm,
    selectedEpochIndex,
    showAxes,
    showTrajectory,
    showUncertainty,
    cameraPreset,
  };

  const sceneApiRef = useRef<{
    rebuildTrajectory: () => void;
    syncEpoch: () => void;
    applyCameraPreset: (preset: 'overview' | 'spacecraft' | 'origin') => void;
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
      (container.clientWidth || 720) / (container.clientHeight || 420),
      0.1,
      1000
    );
    camera.position.set(0, 38, 56);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 4;
    controls.maxDistance = 260;

    scene.add(new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.8));
    const keyLight = new THREE.DirectionalLight(0xf8fafc, 1.8);
    keyLight.position.set(30, 45, 35);
    scene.add(keyLight);

    const stars = createStarfield(900, 260);
    scene.add(stars);

    const grid = new THREE.GridHelper(80, 16, 0x1e293b, 0x0f172a);
    scene.add(grid);

    const axesHelper = new THREE.AxesHelper(22);
    scene.add(axesHelper);

    const bodyGroup = new THREE.Group();
    const trajGroup = new THREE.Group();
    scene.add(bodyGroup, trajGroup);

    const scMesh = buildProceduralSpacecraftMesh(0x22d3ee, false, 1.05);
    scene.add(scMesh);

    const velArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(),
      4.5,
      0x10b981,
      0.9,
      0.45
    );
    scene.add(velArrow);

    // 3-sigma position uncertainty ellipsoid around spacecraft
    const ellipGeo = new THREE.SphereGeometry(1, 20, 14);
    const ellipMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.22,
      wireframe: true,
    });
    const uncertaintyEllipsoid = new THREE.Mesh(ellipGeo, ellipMat);
    scene.add(uncertaintyEllipsoid);

    const disposableGeos: THREE.BufferGeometry[] = [ellipGeo];
    const disposableMats: THREE.Material[] = [ellipMat];
    const disposableTexs: THREE.Texture[] = [envTex];

    let maxRadiusKm = AU_KM;
    const toSceneVec = (v: { x: number; y: number; z: number }): THREE.Vector3 => {
      const scale = 28 / Math.max(maxRadiusKm, 1);
      // Inertial (X, Y plane, Z pole) -> Three.js (X, Z, -Y)
      return new THREE.Vector3(v.x * scale, v.z * scale, -v.y * scale);
    };

    const rebuildTrajectory = () => {
      trajGroup.clear();
      bodyGroup.clear();

      const { propagation: prop, centralBody: cb } = propsRef.current;
      maxRadiusKm = Math.max(...prop.states.map((s) => s.radiusKm), 1);

      // Central body sphere scaled cleanly for visual legibility
      const bodyMeta = CENTRAL_BODIES[cb];
      const tex = createProceduralPlanetTexture(cb, cb === 'sun' ? '#fbbf24' : cb === 'mars' ? '#ef4444' : '#38bdf8', renderer);
      disposableTexs.push(tex);
      const bodyRadiusScene = cb === 'sun' ? 2.4 : Math.min(4.2, Math.max(1.5, (bodyMeta.radiusKm / maxRadiusKm) * 28));
      const bGeo = new THREE.SphereGeometry(bodyRadiusScene, 24, 18);
      const bMat =
        cb === 'sun'
          ? new THREE.MeshBasicMaterial({ map: tex })
          : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.72, metalness: 0.08 });
      bodyGroup.add(new THREE.Mesh(bGeo, bMat));
      disposableGeos.push(bGeo);
      disposableMats.push(bMat);

      // Propagated trajectory line
      const pts = prop.states.map((s) => toSceneVec(s.positionKm));
      if (pts.length >= 2) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x22d3ee });
        trajGroup.add(new THREE.Line(lineGeo, lineMat));
        disposableGeos.push(lineGeo);
        disposableMats.push(lineMat);

        // Start & end markers
        const sGeo = new THREE.SphereGeometry(0.45, 12, 10);
        const sMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        const sMesh = new THREE.Mesh(sGeo, sMat);
        sMesh.position.copy(pts[0]);
        trajGroup.add(sMesh);

        const eGeo = new THREE.SphereGeometry(0.5, 12, 10);
        const eMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
        const eMesh = new THREE.Mesh(eGeo, eMat);
        eMesh.position.copy(pts[pts.length - 1]);
        trajGroup.add(eMesh);

        disposableGeos.push(sGeo, eGeo);
        disposableMats.push(sMat, eMat);
      }
    };

    const syncEpoch = () => {
      const {
        propagation: prop,
        selectedEpochIndex: idx,
        showAxes: axesVis,
        showTrajectory: trajVis,
        showUncertainty: uncVis,
        uncertainty1SigmaKm: sigKm,
      } = propsRef.current;

      axesHelper.visible = axesVis;
      trajGroup.visible = trajVis;

      const states = prop.states;
      if (states.length === 0) return;
      const safeIdx = Math.max(0, Math.min(states.length - 1, idx));
      const st = states[safeIdx];
      const scPos = toSceneVec(st.positionKm);
      scMesh.position.copy(scPos);

      const vScene = new THREE.Vector3(st.velocityKmS.x, st.velocityKmS.z, -st.velocityKmS.y);
      if (vScene.lengthSq() > 1e-12) {
        velArrow.position.copy(scPos);
        velArrow.setDirection(vScene.normalize());
        velArrow.visible = true;
      } else {
        velArrow.visible = false;
      }

      uncertaintyEllipsoid.visible = uncVis;
      uncertaintyEllipsoid.position.copy(scPos);
      // Exaggerate small km uncertainty slightly so 3-sigma ellipsoid remains visually inspectable
      const visualScale = Math.max(1.2, Math.min(6.5, (sigKm * 3 * 28) / Math.max(maxRadiusKm, 1) + 1.15));
      uncertaintyEllipsoid.scale.set(visualScale, visualScale * 0.72, visualScale * 0.9);
    };

    const applyCameraPreset = (preset: 'overview' | 'spacecraft' | 'origin') => {
      if (preset === 'overview') {
        controls.target.set(0, 0, 0);
        camera.position.set(0, 38, 56);
      } else if (preset === 'origin') {
        controls.target.set(0, 0, 0);
        camera.position.set(12, 10, 14);
      } else {
        controls.target.copy(scMesh.position);
        camera.position.copy(scMesh.position).add(new THREE.Vector3(10, 7, 12));
      }
      controls.update();
    };

    sceneApiRef.current = { rebuildTrajectory, syncEpoch, applyCameraPreset };
    rebuildTrajectory();
    syncEpoch();

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 720;
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
      scMesh.rotation.y += delta * 0.45;
      uncertaintyEllipsoid.rotation.y -= delta * 0.25;
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
      disposableTexs.forEach((t) => t.dispose());
      stars.geometry.dispose();
      (stars.material as THREE.Material).dispose();
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    sceneApiRef.current?.rebuildTrajectory();
    sceneApiRef.current?.syncEpoch();
  }, [propagation, centralBody]);

  useEffect(() => {
    sceneApiRef.current?.syncEpoch();
  }, [selectedEpochIndex, showAxes, showTrajectory, showUncertainty, uncertainty1SigmaKm]);

  useEffect(() => {
    sceneApiRef.current?.applyCameraPreset(cameraPreset);
  }, [cameraPreset, resetTrigger]);

  if (webglError) {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center bg-[#070B14] p-6 text-xs text-amber-400">
        {webglError}
      </div>
    );
  }

  const activeState = propagation.states[Math.max(0, Math.min(propagation.states.length - 1, selectedEpochIndex))];

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#050811]">
      <div ref={mountRef} className="h-full w-full" aria-label="Engineering 3D Orbit Viewport" />
      {showLabels && activeState && (
        <>
          <div className="pointer-events-none absolute top-3 left-3 z-10 border border-slate-800 bg-[#070B14]/92 px-3 py-1.5 font-mono text-[11px] text-slate-200 tabular-nums">
            <div>Frame: {propagation.referenceFrame}</div>
            <div className="text-cyan-300">
              Epoch +{activeState.elapsedDays.toFixed(2)}d · |r|={activeState.radiusKm.toExponential(3)} km
            </div>
          </div>
          <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-wrap gap-3 border border-slate-800 bg-[#070B14]/90 px-3 py-1.5 font-mono text-[10px] text-slate-400">
            <span className="text-cyan-400">■ Propagated Trajectory</span>
            <span className="text-emerald-400">■ Velocity Vector</span>
            <span className="text-amber-400">■ 3σ Uncertainty Envelope (scaled)</span>
            <span>Axes: R=+X, G=+Z, B=-Y</span>
          </div>
        </>
      )}
    </div>
  );
};
