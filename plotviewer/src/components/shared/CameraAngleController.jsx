import React, { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const TOP_DOWN_PHI_EPS = 0.0001;

export default function CameraAngleController({
  isTopDown,
  controlsRef,
  duration = 360,
  targetPhi3D = Math.PI / 4,
  targetPhi2D = TOP_DOWN_PHI_EPS,
  onStart,
  onComplete,
}) {
  const { camera, controls } = useThree();
  const anim = useRef({ running: false, start: 0, fromPhi: 0, toPhi: 0, fromTheta: null, savedTheta: null, origMinPolar: null, origMaxPolar: null, origEnableRotate: null, origEnableDamping: null, origEnabled: null });

  useEffect(() => {
    const activeControls = (controlsRef && controlsRef.current) ? controlsRef.current : controls;
    if (!activeControls || !camera) return;

    // compute current spherical phi relative to controls.target
    const startTarget = activeControls.target.clone();
    anim.current.target = startTarget;
    const offset = camera.position.clone().sub(startTarget);
    const sph = new THREE.Spherical().setFromVector3(offset);

    const fromPhi = sph.phi;
    const toPhi = isTopDown ? targetPhi2D : targetPhi3D;
    // determine theta to preserve azimuth. when at the pole (phi ~= 0) theta is undefined,
    // so use previously saved theta (from before entering top-down) if available.
    const EPS = 1e-3;
    let fromTheta = typeof activeControls.getAzimuthalAngle === 'function'
      ? activeControls.getAzimuthalAngle()
      : sph.theta;
    if (sph.phi < EPS && anim.current.savedTheta != null) {
      fromTheta = anim.current.savedTheta;
    }

    // store original control constraints/state once (so repeated toggles restore correctly)
    if (typeof anim.current.origMinPolar === 'undefined' || anim.current.origMinPolar === null) {
      anim.current.origMinPolar = activeControls.minPolarAngle;
      anim.current.origMaxPolar = activeControls.maxPolarAngle;
      anim.current.origEnableRotate = activeControls.enableRotate;
      anim.current.origEnableDamping = typeof activeControls.enableDamping !== 'undefined' ? activeControls.enableDamping : false;
      anim.current.origEnabled = typeof activeControls.enabled !== 'undefined' ? activeControls.enabled : true;
    }

    // If we're entering top-down, save the current theta/radius so we can restore azimuth on exit
    if (isTopDown) {
      anim.current.savedTheta = fromTheta;
    }

    // relax polar constraints to allow animation
    activeControls.minPolarAngle = 0;
    activeControls.maxPolarAngle = Math.PI;
    // ensure rotate is enabled during the animation so we can update camera position cleanly
    activeControls.enableRotate = true;
    // disable damping/inertia during animation to avoid jitter
    try { activeControls.enableDamping = false; } catch (e) {}
    // disable input handling while animating (we'll also render a DOM blocker in parent)
    try { activeControls.enabled = false; } catch (e) {}
    activeControls.update();

    // notify parent that animation started
    if (typeof onStart === 'function') onStart();

    anim.current.start = performance.now();
    anim.current.fromPhi = fromPhi;
    anim.current.toPhi = toPhi;
    anim.current.fromTheta = fromTheta;
    anim.current.running = true;
  }, [isTopDown, controlsRef, camera, controls, duration, targetPhi3D, targetPhi2D]);

  useFrame(() => {
    const activeControls = (controlsRef && controlsRef.current) ? controlsRef.current : controls;
    if (!activeControls || !camera) return;
    if (!anim.current.running) return;

    const now = performance.now();
    const elapsed = now - anim.current.start;
    const t = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - t, 4);

    const target = anim.current.target || activeControls.target;
    const offset = camera.position.clone().sub(target);
    const sph = new THREE.Spherical().setFromVector3(offset);

    const newPhi = THREE.MathUtils.lerp(anim.current.fromPhi, anim.current.toPhi, ease);

    // preserve theta/radius when available (prevents azimuth jump when coming from exact top-down)
    if (anim.current.fromTheta != null) {
      sph.theta = anim.current.fromTheta;
    }
    sph.phi = Math.max(0.000001, Math.min(Math.PI - 0.000001, newPhi));

    const newPos = new THREE.Vector3().setFromSpherical(sph).add(target);
    camera.position.copy(newPos);
    activeControls.update();

    if (t >= 1) {
      anim.current.running = false;

      // finalize constraints and rotate state
      if (isTopDown) {
        activeControls.minPolarAngle = targetPhi2D;
        activeControls.maxPolarAngle = targetPhi2D;
        activeControls.enableRotate = false;
      } else {
        if (typeof anim.current.origMinPolar !== 'undefined' && anim.current.origMinPolar !== null) activeControls.minPolarAngle = anim.current.origMinPolar;
        if (typeof anim.current.origMaxPolar !== 'undefined' && anim.current.origMaxPolar !== null) activeControls.maxPolarAngle = anim.current.origMaxPolar;
        if (typeof anim.current.origEnableRotate !== 'undefined' && anim.current.origEnableRotate !== null) activeControls.enableRotate = anim.current.origEnableRotate;
      }
      // restore damping and input handling
      try { activeControls.enableDamping = typeof anim.current.origEnableDamping !== 'undefined' ? anim.current.origEnableDamping : false; } catch (e) {}
      try { activeControls.enabled = typeof anim.current.origEnabled !== 'undefined' ? anim.current.origEnabled : true; } catch (e) {}
      activeControls.update();

      // notify parent that animation finished
      if (typeof onComplete === 'function') onComplete();
        // cleanup transient animation state
        anim.current.fromTheta = null;
        anim.current.target = null;
    }
  });

  return null;
}
