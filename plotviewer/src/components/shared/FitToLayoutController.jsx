import React, { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

const TOP_DOWN_PHI_EPS = 0.0001;
const MIN_HOME_DURATION = 1600;
const HOME_ZOOM_PHASE_3D = 0.62;
const HOME_ZOOM_PHASE_2D = 0.78;

const shortestAngleDiff = (from, to) => {
  let diff = to - from;
  while (diff < -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return diff;
};

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const easeOutQuart = (t) => 1 - Math.pow(1 - clamp01(t), 4);
const easeInOutSine = (t) => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;

export default function FitToLayoutController({ fitKey, isTopDown, image, layout, scale = 0.05, duration = MIN_HOME_DURATION, onStart, onComplete }) {
  const { camera, controls } = useThree();

  useEffect(() => {
    if (typeof fitKey === 'undefined' || fitKey === null) return;
    if (!camera || !controls) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    const analysisW = layout?.meta?.analysisWidth || image?.width || 1000;
    const analysisH = layout?.meta?.analysisHeight || image?.height || 1000;

    const target = new THREE.Vector3(0, 0, 0);

    const fov = (camera.fov || 45) * (Math.PI / 180);
    const aspect = camera.aspect || (window.innerWidth / window.innerHeight);

    const halfW = (analysisW * scale) / 2;
    const halfH = (analysisH * scale) / 2;

    const distForH = halfH / Math.tan(fov / 2);
    const distForW = halfW / (Math.tan(fov / 2) * aspect);
    const dist = Math.max(distForH, distForW) * 1.2;

    const totalDuration = Math.max(duration, MIN_HOME_DURATION);
    const startTarget = controls.target.clone();
    const startPos = camera.position.clone();
    const startOffset = startPos.clone().sub(startTarget);
    const startSpherical = new THREE.Spherical().setFromVector3(startOffset);
    const targetPolar = isTopDown ? TOP_DOWN_PHI_EPS : Math.PI / 4;
    let startAzimuth = -Math.PI / 4;
    try { startAzimuth = controls.getAzimuthalAngle(); } catch (e) { startAzimuth = startSpherical.theta; }
    const endAzimuth = isTopDown ? startAzimuth : 0;
    const zoomPhase = isTopDown ? HOME_ZOOM_PHASE_2D : HOME_ZOOM_PHASE_3D;

    // save and relax some control flags
    const prevEnableRotate = controls.enableRotate;
    const prevEnablePan = controls.enablePan;
    const prevEnableDamping = typeof controls.enableDamping !== 'undefined' ? controls.enableDamping : false;
    const prevMinPolar = controls.minPolarAngle;
    const prevMaxPolar = controls.maxPolarAngle;
    const prevEnabled = typeof controls.enabled !== 'undefined' ? controls.enabled : true;

    controls.enableRotate = false;
    controls.enablePan = false;
    try { controls.enableDamping = false; } catch (e) {}
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
    try { controls.enabled = false; } catch (e) {}
    controls.update();

    if (typeof onStart === 'function') onStart();

    let cancelled = false;
    const cancelOnInteract = () => { cancelled = true; };
    controls.addEventListener('start', cancelOnInteract);

    const startTime = performance.now();
    let frameId = null;

    const animate = (now) => {
      if (cancelled) return;
      const elapsed = now - startTime;
      const t = Math.min(elapsed / totalDuration, 1);
      const framingEase = easeOutQuart(t / zoomPhase);
      const straightenEase = easeInOutSine((t - zoomPhase) / (1 - zoomPhase || 1));
      const currentTarget = new THREE.Vector3().lerpVectors(startTarget, target, framingEase);
      const currentDist = THREE.MathUtils.lerp(startSpherical.radius, dist, framingEase);
      const currentPolar = THREE.MathUtils.lerp(startSpherical.phi, targetPolar, framingEase);
      const currentAzimuth = startAzimuth + shortestAngleDiff(startAzimuth, endAzimuth) * straightenEase;

      const currentPos = new THREE.Vector3().setFromSpherical(
        new THREE.Spherical(
          currentDist,
          Math.max(TOP_DOWN_PHI_EPS, Math.min(Math.PI - TOP_DOWN_PHI_EPS, currentPolar)),
          currentAzimuth
        )
      ).add(currentTarget);

      controls.target.copy(currentTarget);
      camera.position.copy(currentPos);
      controls.update();

      if (t < 1) frameId = requestAnimationFrame(animate);
      else {
        // finalize
        if (isTopDown) {
          controls.minPolarAngle = TOP_DOWN_PHI_EPS;
          controls.maxPolarAngle = TOP_DOWN_PHI_EPS;
          controls.enableRotate = false;
        } else {
          controls.minPolarAngle = Math.PI / 4 - 0.0005;
          controls.maxPolarAngle = Math.PI / 4 + 0.0005;
          controls.enableRotate = prevEnableRotate;
        }
        controls.enablePan = prevEnablePan;
        try { controls.enableDamping = prevEnableDamping; } catch (e) {}
        try { controls.enabled = prevEnabled; } catch (e) {}
        controls.update();
        controls.removeEventListener('start', cancelOnInteract);
        if (typeof onComplete === 'function') onComplete();
      }
    };

    frameId = requestAnimationFrame(animate);

    return () => {
      cancelled = true;
      if (frameId) cancelAnimationFrame(frameId);
      controls.removeEventListener('start', cancelOnInteract);
      controls.enableRotate = prevEnableRotate;
      controls.enablePan = prevEnablePan;
      try { controls.enableDamping = prevEnableDamping; } catch (e) {}
      controls.minPolarAngle = prevMinPolar;
      controls.maxPolarAngle = prevMaxPolar;
      try { controls.enabled = prevEnabled; } catch (e) {}
      controls.update();
    };
  }, [fitKey]);

  return null;
}
