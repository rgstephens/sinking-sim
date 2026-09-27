import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";

/**
 * Procedural sky + environment maps.
 *
 * - Sky.js: atmospheric-scattering sky mesh added to scene
 * - pmremEnv: PMREM texture for MeshStandardMaterial env reflection
 *   (applied as scene.environment)
 * - cubeRT: WebGLCubeRenderTarget from CubeCamera for custom shaders that
 *   sample env as `textureCube` (e.g. the water shader)
 *
 * `setSunElevation(elevDeg, azimDeg)` drives the sky and rebuilds both env maps.
 */

export function createSky(renderer, scene) {
  // Sky-only scene so PMREM and CubeCamera capture only the sky,
  // not dock/deep/etc from the main scene.
  const skyScene = new THREE.Scene();
  const sky = new Sky();
  sky.scale.setScalar(450);
  skyScene.add(sky);

  // Add to main scene so it's visible during regular renders too
  scene.add(sky);

  const u = sky.material.uniforms;
  u.turbidity.value = 4;
  u.rayleigh.value = 2.4;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.85;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  // Cube camera for direct `textureCube` sampling in custom shaders
  const cubeRT = new THREE.WebGLCubeRenderTarget(256, {
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const cubeCam = new THREE.CubeCamera(0.1, 1000, cubeRT);

  let pmremRT = null;

  function sunDirection(elevationDeg, azimuthDeg) {
    const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
    const theta = THREE.MathUtils.degToRad(azimuthDeg);
    const v = new THREE.Vector3();
    v.setFromSphericalCoords(1, phi, theta);
    return v;
  }

  function setSunElevation(elevationDeg = 12, azimuthDeg = 140) {
    const dir = sunDirection(elevationDeg, azimuthDeg);
    u.sunPosition.value.copy(dir);

    // Cube map: render sky-only scene (for water shader to sample)
    cubeCam.position.set(0, 2, 0);
    cubeCam.update(renderer, skyScene);

    // PMREM: prefiltered env for MeshStandardMaterial IBL
    if (pmremRT) pmremRT.dispose();
    pmremRT = pmrem.fromScene(skyScene);
    scene.environment = pmremRT.texture;
    // Background is the Sky mesh itself (renders a proper atmospheric sky).
    // Do NOT use the PMREM texture as scene.background — it's prefiltered
    // for IBL and renders incorrectly as a flat backdrop.
  }

  function getCubeRT() {
    return cubeRT.texture;
  }

  function getPMREM() {
    return pmremRT ? pmremRT.texture : null;
  }

  function dispose() {
    if (pmremRT) pmremRT.dispose();
    pmrem.dispose();
    cubeRT.dispose();
    sky.geometry.dispose();
    sky.material.dispose();
  }

  return {
    sky,
    sunDirection,
    setSunElevation,
    getCubeRT,
    getPMREM,
    dispose,
  };
}
