import React from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { getLayoutRenderProfile } from "../../theme/layoutAppearance";

export default function LayoutSceneEnvironment({
  theme,
  isCoarsePointer = false,
  isConstrainedDevice = false,
}) {
  const { gl } = useThree();
  const renderProfile = React.useMemo(
    () => getLayoutRenderProfile(theme, { isCoarsePointer, isConstrainedDevice }),
    [isCoarsePointer, isConstrainedDevice, theme]
  );

  React.useEffect(() => {
    gl.toneMapping = renderProfile.toneMapping;
    gl.toneMappingExposure = renderProfile.exposure;
    gl.outputColorSpace = THREE.SRGBColorSpace;
  }, [gl, renderProfile.exposure, renderProfile.toneMapping]);

  return (
    <>
      <ambientLight intensity={renderProfile.ambientIntensity} />
      <hemisphereLight args={["#b5d8ff", "#5f4520", renderProfile.hemisphereIntensity]} />
      <directionalLight position={[50, 150, 50]} intensity={renderProfile.directionalIntensity} />
    </>
  );
}
