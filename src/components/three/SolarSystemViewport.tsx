import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CelestialBodyData, SolarSystemSnapshot, SpacecraftState } from '../../shared/types.ts';
import {
  buildProceduralSpacecraftMesh,
  createProceduralPlanetTexture,
  createStarfield,
  createStudioRenderer,
  detectSoftwareGl,
  eclipticAuToSceneVec,
} from './threeUtils.ts';

interface SolarSystemViewportProps {
  snapshot: SolarSystemSnapshot;
  selectedId: string | null;
  showOrbits?: boolean;
  agencyFilter?: 'ALL' | 'ISRO' | 'INTERNATIONAL';
  simulationSpeedDaysPerSec?: number;
  isPaused?: boolean;
  resetTrigger?: number;
  compactPreview?: boolean;
  onSelectObject?: (type: 'body' | 'spacecraft', id: string) => void;
}

const PLANET_VISUAL_RADII: Record<string, number> = {
  sun: 3.4,
  mercury: 0.55,
  venus: 0.85,
  earth: 0.95,
  moon: 0.35,
  mars: 0.72,
  jupiter: 2.1,
  saturn: 1.8,
  uranus: 1.3,
  neptune: 1.25,
  'sun-earth-l1': 0.32,
  'sun-earth-l2': 0.32,
};

const _tmpVec = new THREE.Vector3();
const _targetFocus = new THREE.Vector3();

export const SolarSystemViewport: React.FC<SolarSystemViewportProps> = ({
  snapshot,
  selectedId,
  showOrbits = true,
  agencyFilter = 'ALL',
  simulationSpeedDaysPerSec = 0,
  isPaused = true,
  resetTrigger = 0,
  compactPreview = false,
  onSelectObject,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  const propsRef = useRef({
    snapshot,
    selectedId,
    showOrbits,
    agencyFilter,
    simulationSpeedDaysPerSec,
    isPaused,
    onSelectObject,
  });
  propsRef.current = {
    snapshot,
    selectedId,
    showOrbits,
    agencyFilter,
    simulationSpeedDaysPerSec,
    isPaused,
    onSelectObject,
  };

  const sceneStateRef = useRef<{
    syncScene: () => void;
    focusOnId: (id: string | null) => void;
    resetCamera: () => void;
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
      48,
      (container.clientWidth || 800) / (container.clientHeight || 500),
      0.1,
      1800
    );
    camera.position.set(0, compactPreview ? 46 : 58, compactPreview ? 76 : 92);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 6;
    controls.maxDistance = 380;
    controls.target.set(0, 0, 0);

    // Three-point + heliocentric lighting
    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.75);
    scene.add(hemi);
    const sunLight = new THREE.PointLight(0xfffbeb, 3.2, 600, 0.25);
    sunLight.position.set(0, 0, 0);
    scene.add(sunLight);
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.65);
    rimLight.position.set(-40, 50, -35);
    scene.add(rimLight);

    const stars = createStarfield(1300, 420);
    scene.add(stars);

    const orbitGroup = new THREE.Group();
    const bodyGroup = new THREE.Group();
    const spacecraftGroup = new THREE.Group();
    scene.add(orbitGroup, bodyGroup, spacecraftGroup);

    const clickables: THREE.Object3D[] = [];
    const bodyMeshes = new Map<string, THREE.Object3D>();
    const spacecraftMeshes = new Map<string, THREE.Object3D>();
    const texturesToDispose: THREE.Texture[] = [envTex];
    const geometriesToDispose: THREE.BufferGeometry[] = [];
    const materialsToDispose: THREE.Material[] = [];

    // Selection reticle ring
    const reticleGeo = new THREE.RingGeometry(1.4, 1.65, 32);
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const reticle = new THREE.Mesh(reticleGeo, reticleMat);
    reticle.rotation.x = -Math.PI / 2;
    reticle.visible = false;
    scene.add(reticle);
    geometriesToDispose.push(reticleGeo);
    materialsToDispose.push(reticleMat);

    // Camera transition state (smooth exponential damping)
    let cameraAnimating = false;
    const desiredCamTarget = new THREE.Vector3(0, 0, 0);
    const desiredCamPos = new THREE.Vector3().copy(camera.position);

    const onControlsStart = () => {
      cameraAnimating = false;
    };
    controls.addEventListener('start', onControlsStart);

    const buildOrbits = (bodies: CelestialBodyData[]) => {
      orbitGroup.clear();
      for (const body of bodies) {
        if (body.type !== 'planet' || body.semiMajorAxisAU <= 0) continue;
        const pts: THREE.Vector3[] = [];
        const rScene =
          body.semiMajorAxisAU < 0.05
            ? body.semiMajorAxisAU * 220
            : 11 + Math.pow(body.semiMajorAxisAU, 0.44) * 23;
        for (let i = 0; i <= 96; i++) {
          const theta = (i / 96) * Math.PI * 2;
          pts.push(new THREE.Vector3(rScene * Math.cos(theta), 0, rScene * Math.sin(theta)));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({
          color: body.id === 'earth' ? 0x38bdf8 : 0x334155,
          transparent: true,
          opacity: body.id === 'earth' ? 0.52 : 0.38,
        });
        orbitGroup.add(new THREE.LineLoop(geo, mat));
        geometriesToDispose.push(geo);
        materialsToDispose.push(mat);
      }
    };

    let elapsedSimDays = 0;

    const syncScene = () => {
      const { snapshot: snap, showOrbits: orbitsVisible, agencyFilter: filter } = propsRef.current;
      orbitGroup.visible = orbitsVisible;

      if (orbitGroup.children.length === 0) {
        buildOrbits(snap.bodies);
      }

      // Sync Celestial Bodies
      const earthBody = snap.bodies.find((b) => b.id === 'earth');
      const earthScenePos = earthBody
        ? eclipticAuToSceneVec(earthBody.state.positionAU, new THREE.Vector3())
        : new THREE.Vector3(34, 0, 0);

      for (const body of snap.bodies) {
        let obj = bodyMeshes.get(body.id);
        if (!obj) {
          const radius = PLANET_VISUAL_RADII[body.id] ?? 0.6;
          if (body.type === 'lagrange') {
            const octGeo = new THREE.OctahedronGeometry(radius, 0);
            const octMat = new THREE.MeshStandardMaterial({
              color: body.color,
              emissive: body.color,
              emissiveIntensity: 0.7,
              wireframe: true,
            });
            obj = new THREE.Mesh(octGeo, octMat);
            geometriesToDispose.push(octGeo);
            materialsToDispose.push(octMat);
          } else {
            const group = new THREE.Group();
            const tex = createProceduralPlanetTexture(body.id, body.color, renderer);
            texturesToDispose.push(tex);
            const sphereGeo = new THREE.SphereGeometry(radius, 28, 20);
            const mat =
              body.id === 'sun'
                ? new THREE.MeshBasicMaterial({ map: tex })
                : new THREE.MeshStandardMaterial({
                    map: tex,
                    roughness: 0.72,
                    metalness: 0.08,
                  });
            const sphere = new THREE.Mesh(sphereGeo, mat);
            group.add(sphere);
            geometriesToDispose.push(sphereGeo);
            materialsToDispose.push(mat);

            if (body.id === 'sun') {
              const haloGeo = new THREE.SphereGeometry(radius * 1.28, 24, 16);
              const haloMat = new THREE.MeshBasicMaterial({
                color: 0xf59e0b,
                transparent: true,
                opacity: 0.16,
                depthWrite: false,
              });
              group.add(new THREE.Mesh(haloGeo, haloMat));
              geometriesToDispose.push(haloGeo);
              materialsToDispose.push(haloMat);
            }

            if (body.id === 'saturn') {
              const ringGeo = new THREE.RingGeometry(radius * 1.35, radius * 2.25, 48);
              const ringMat = new THREE.MeshStandardMaterial({
                color: 0xfde68a,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.65,
                roughness: 0.7,
              });
              const ring = new THREE.Mesh(ringGeo, ringMat);
              ring.rotation.x = Math.PI / 2.4;
              group.add(ring);
              geometriesToDispose.push(ringGeo);
              materialsToDispose.push(ringMat);
            }

            obj = group;
          }

          obj.userData = {
            kind: 'body',
            id: body.id,
            label: `${body.name} · ${body.state.distanceFromSunAU.toFixed(2)} AU`,
          };
          bodyGroup.add(obj);
          bodyMeshes.set(body.id, obj);
          clickables.push(obj);
        }

        // Compute visual position (keep Moon/L1/L2 clearly offset near Earth for legibility)
        if (body.id === 'moon') {
          _tmpVec.copy(earthScenePos).add(new THREE.Vector3(2.3, 0.3, 1.4));
        } else if (body.id === 'sun-earth-l1') {
          const dirToSun = earthScenePos.clone().normalize();
          _tmpVec.copy(earthScenePos).addScaledVector(dirToSun, -3.4);
        } else if (body.id === 'sun-earth-l2') {
          const dirFromSun = earthScenePos.clone().normalize();
          _tmpVec.copy(earthScenePos).addScaledVector(dirFromSun, 3.6);
        } else {
          eclipticAuToSceneVec(body.state.positionAU, _tmpVec);
        }
        obj.position.copy(_tmpVec);
      }

      // Sync Spacecraft Markers
      const marsBody = snap.bodies.find((b) => b.id === 'mars');
      const marsScenePos = marsBody
        ? eclipticAuToSceneVec(marsBody.state.positionAU, new THREE.Vector3())
        : new THREE.Vector3(40, 0, 0);
      const moonPos = bodyMeshes.get('moon')?.position ?? earthScenePos;
      const l1Pos = bodyMeshes.get('sun-earth-l1')?.position ?? earthScenePos;
      const l2Pos = bodyMeshes.get('sun-earth-l2')?.position ?? earthScenePos;

      for (const sc of snap.spacecraft) {
        let scObj = spacecraftMeshes.get(sc.id);
        if (!scObj) {
          const isIsro = sc.agency === 'ISRO';
          const isDeepRtg = sc.id === 'voyager-1' || sc.id === 'voyager-2' || sc.id === 'new-horizons';
          scObj = buildProceduralSpacecraftMesh(isIsro ? 0xf59e0b : 0x22d3ee, isDeepRtg, 0.92);

          // Invisible click sphere proxy for easy picking
          const hitGeo = new THREE.SphereGeometry(1.35, 10, 8);
          const hitMat = new THREE.MeshBasicMaterial({ visible: false });
          const hitMesh = new THREE.Mesh(hitGeo, hitMat);
          scObj.add(hitMesh);
          geometriesToDispose.push(hitGeo);
          materialsToDispose.push(hitMat);

          scObj.userData = {
            kind: 'spacecraft',
            id: sc.id,
            label: `${sc.name} (${sc.agency}) · ${sc.state.distanceFromEarthAU.toFixed(3)} AU from Earth`,
          };
          spacecraftGroup.add(scObj);
          spacecraftMeshes.set(sc.id, scObj);
          clickables.push(scObj);
        }

        const passesFilter =
          filter === 'ALL' ||
          (filter === 'ISRO' && sc.agency === 'ISRO') ||
          (filter === 'INTERNATIONAL' && sc.agency !== 'ISRO');
        scObj.visible = passesFilter;

        // Place local-planet orbiters clearly separated around their host body in visual space
        const idxOffset = SPACECRAFT_OFFSET_INDEX[sc.id] ?? 0;
        const angle = idxOffset * 1.45;
        if (sc.orbitalFallback.center === 'moon') {
          scObj.position.set(
            moonPos.x + Math.cos(angle) * 1.35,
            moonPos.y + 0.6 + (idxOffset % 2) * 0.45,
            moonPos.z + Math.sin(angle) * 1.35
          );
        } else if (sc.orbitalFallback.center === 'earth') {
          scObj.position.set(
            earthScenePos.x + Math.cos(angle) * 1.85,
            earthScenePos.y + 0.85,
            earthScenePos.z + Math.sin(angle) * 1.85
          );
        } else if (sc.orbitalFallback.center === 'L1') {
          scObj.position.copy(l1Pos).add(new THREE.Vector3(0, 0.75, 0));
        } else if (sc.orbitalFallback.center === 'L2') {
          scObj.position.copy(l2Pos).add(new THREE.Vector3(0, 0.75, 0));
        } else if (sc.orbitalFallback.center === 'mars') {
          scObj.position.set(
            marsScenePos.x + Math.cos(angle) * 1.65,
            marsScenePos.y + 0.55,
            marsScenePos.z + Math.sin(angle) * 1.65
          );
        } else {
          eclipticAuToSceneVec(sc.state.positionAU, scObj.position);
        }
      }
    };

    const focusOnId = (id: string | null) => {
      if (!id) {
        reticle.visible = false;
        return;
      }
      const targetObj = bodyMeshes.get(id) ?? spacecraftMeshes.get(id);
      if (!targetObj) {
        reticle.visible = false;
        return;
      }
      reticle.position.copy(targetObj.position);
      reticle.visible = true;
      desiredCamTarget.copy(targetObj.position);
      desiredCamPos.copy(targetObj.position).add(new THREE.Vector3(12, 9, 14));
      cameraAnimating = true;
    };

    const resetCamera = () => {
      desiredCamTarget.set(0, 0, 0);
      desiredCamPos.set(0, compactPreview ? 46 : 58, compactPreview ? 76 : 92);
      cameraAnimating = true;
    };

    sceneStateRef.current = { syncScene, focusOnId, resetCamera };
    syncScene();
    if (propsRef.current.selectedId) {
      focusOnId(propsRef.current.selectedId);
    }

    // Raycasting for hover & click selection
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };
    let lastMoveTs = 0;

    const findRootMeta = (obj: THREE.Object3D | null): { kind: 'body' | 'spacecraft'; id: string; label: string } | null => {
      let cur: THREE.Object3D | null = obj;
      while (cur) {
        if (cur.userData?.kind && cur.userData?.id) {
          return cur.userData as { kind: 'body' | 'spacecraft'; id: string; label: string };
        }
        cur = cur.parent;
      }
      return null;
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist > 6) return; // Dragging OrbitControls, not clicking

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const hits = raycaster.intersectObjects(clickables, true);
      if (hits.length > 0) {
        const meta = findRootMeta(hits[0].object);
        if (meta && propsRef.current.onSelectObject) {
          propsRef.current.onSelectObject(meta.kind, meta.id);
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastMoveTs < 60) return;
      lastMoveTs = now;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const hits = raycaster.intersectObjects(clickables, true);
      if (hits.length > 0) {
        const meta = findRootMeta(hits[0].object);
        if (meta) {
          renderer.domElement.style.cursor = 'pointer';
          setHoveredLabel(meta.label);
          return;
        }
      }
      renderer.domElement.style.cursor = 'grab';
      setHoveredLabel(null);
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('WebGL context lost. Waiting for GPU restoration.');
    };
    const onContextRestored = () => {
      setWebglError(null);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 500;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    // Animation loop with software WebGL pacing
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
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
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

    const tick = () => {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.1);

      // Gentle planetary self-rotation + optional orbital progression
      if (!propsRef.current.isPaused && propsRef.current.simulationSpeedDaysPerSec > 0) {
        elapsedSimDays += delta * propsRef.current.simulationSpeedDaysPerSec;
        for (const body of propsRef.current.snapshot.bodies) {
          if (body.type === 'planet' && body.orbitalPeriodDays > 0) {
            const mesh = bodyMeshes.get(body.id);
            if (mesh) {
              const ang = (elapsedSimDays / body.orbitalPeriodDays) * Math.PI * 2;
              const base = eclipticAuToSceneVec(body.state.positionAU, _tmpVec);
              const cosA = Math.cos(ang);
              const sinA = Math.sin(ang);
              mesh.position.set(
                base.x * cosA - base.z * sinA,
                base.y,
                base.x * sinA + base.z * cosA
              );
            }
          }
        }
      }

      bodyMeshes.forEach((mesh, id) => {
        if (id !== 'sun-earth-l1' && id !== 'sun-earth-l2') {
          mesh.rotation.y += delta * 0.18;
        }
      });

      spacecraftMeshes.forEach((scMesh) => {
        scMesh.rotation.y += delta * 0.45;
      });

      if (reticle.visible) {
        reticle.rotation.z += delta * 0.7;
        const activeTarget = propsRef.current.selectedId
          ? bodyMeshes.get(propsRef.current.selectedId) ?? spacecraftMeshes.get(propsRef.current.selectedId)
          : null;
        if (activeTarget) {
          reticle.position.copy(activeTarget.position);
        }
      }

      if (cameraAnimating) {
        controls.target.x = THREE.MathUtils.damp(controls.target.x, desiredCamTarget.x, 5.5, delta);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, desiredCamTarget.y, 5.5, delta);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, desiredCamTarget.z, 5.5, delta);

        camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredCamPos.x, 4.5, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, desiredCamPos.y, 4.5, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, desiredCamPos.z, 4.5, delta);

        if (
          camera.position.distanceTo(desiredCamPos) < 0.25 &&
          controls.target.distanceTo(_targetFocus.copy(desiredCamTarget)) < 0.25
        ) {
          cameraAnimating = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', onControlsStart);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      geometriesToDispose.forEach((g) => g.dispose());
      materialsToDispose.forEach((m) => m.dispose());
      texturesToDispose.forEach((t) => t.dispose());
      stars.geometry.dispose();
      (stars.material as THREE.Material).dispose();
      renderer.dispose();
    };
  }, [compactPreview]);

  useEffect(() => {
    sceneStateRef.current?.syncScene();
  }, [snapshot, showOrbits, agencyFilter]);

  useEffect(() => {
    sceneStateRef.current?.focusOnId(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (resetTrigger > 0) {
      sceneStateRef.current?.resetCamera();
    }
  }, [resetTrigger]);

  if (webglError) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center bg-[#070B14] p-6 text-center">
        <p className="font-display text-sm font-semibold text-amber-400">
          3D Viewport Fallback Active
        </p>
        <p className="mt-1 text-xs text-slate-400 max-w-md">{webglError}</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#050811]">
      <div ref={mountRef} className="h-full w-full" aria-label="Interactive 3D Solar System Canvas" />

      {hoveredLabel && (
        <div className="pointer-events-none absolute top-3 left-3 z-10 border border-slate-700/80 bg-[#070B14]/92 px-3 py-1.5 font-mono text-xs text-cyan-300">
          {hoveredLabel}
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 left-3 z-10 border border-slate-800 bg-[#070B14]/90 px-2.5 py-1 font-mono text-[10px] text-slate-400">
        Visual Scale: Compressed Radial AU · Sizes Exaggerated for Inspection · Drag to Orbit · Scroll to Zoom
      </div>
    </div>
  );
};

const SPACECRAFT_OFFSET_INDEX: Record<string, number> = {
  'chandrayaan-1': 0,
  'chandrayaan-2-orbiter': 1,
  'chandrayaan-3': 2,
  'aditya-l1': 0,
  xposat: 3,
  jwst: 0,
  mro: 0,
  'mars-odyssey': 2,
};
