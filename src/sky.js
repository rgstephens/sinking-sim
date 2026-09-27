import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";

/**
 * Procedural sky + environment maps.
 *
 * - Sky.js: atmospheric-scattering sky with drifting clouds, added to scene
 * - pmremEnv: PMREM texture for MeshStandardMaterial env reflection
 *   (applied as scene.environment)
 * - cubeRT: WebGLCubeRenderTarget from CubeCamera for custom shaders that
 *   sample env as `textureCube` (e.g. the water shader)
 *
 * The env captures use a second mesh that shares the sky's geometry and
 * material. An Object3D can only have one parent, so the visible sky cannot
 * also live in the capture scene.
 *
 * `setSunElevation(elevDeg, azimDeg)` drives the sky and rebuilds both env maps.
 */

export function createSky(renderer, scene) {
  const sky = new Sky();
  sky.scale.setScalar(4000);
  // The stock disc is ~760× sky radiance: fine for a tone-mapped still, but
  // it floods the bloom pass. Keep it bright enough to bloom, not to white out.
  // Preetham can't do an overcast sky, so blend toward a grey, streaked
  // cloud deck for storm and fog presets.
  sky.material.uniforms.uOvercast = { value: 0 };
  sky.material.uniforms.uOvercastColor = { value: new THREE.Color(0.5, 0.52, 0.55) };
  sky.material.fragmentShader = sky.material.fragmentShader
    .replace("760.0 * sundisc", "18.0 * sundisc")
    .replace(
      "uniform float time;",
      `uniform float time;
      uniform float uOvercast;
      uniform vec3 uOvercastColor;`
    )
    .replace(
      "gl_FragColor = vec4( texColor, 1.0 );",
      `if ( uOvercast > 0.0 ) {
        float up = max( direction.y, 0.0 );
        vec2 deck = direction.xz / ( up + 0.08 ) * 0.9 + time * 0.004;
        float n = fbm( deck, time * 0.01 ) * 0.5 + 0.5;
        float streak = fbm( deck * vec2( 3.0, 0.8 ) + 11.0, time * 0.02 ) * 0.5 + 0.5;
        vec3 deckCol = uOvercastColor * ( 0.55 + 0.6 * n - 0.25 * streak * n );
        deckCol *= mix( 0.75, 1.15, smoothstep( 0.0, 0.6, up ) );
        // A faint bright patch where the sun is behind the cloud
        deckCol += uOvercastColor * 0.35 * pow( max( cosTheta, 0.0 ), 12.0 ) * ( 1.0 - n * 0.6 );
        texColor = mix( texColor, deckCol, uOvercast );
      }
      gl_FragColor = vec4( texColor, 1.0 );`
    );
  scene.add(sky);

  // Capture scene: the same sky, plus a dark sea below the horizon so IBL
  // lights hull bottoms with ocean bounce instead of a mirrored bright sky.
  const skyScene = new THREE.Scene();
  const skyEnv = new THREE.Mesh(sky.geometry, sky.material);
  skyEnv.scale.setScalar(4000);
  skyScene.add(skyEnv);
  const seaMat = new THREE.MeshBasicMaterial({ color: 0x0b2233, side: THREE.DoubleSide });
  const sea = new THREE.Mesh(new THREE.CircleGeometry(1800, 48), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -1;
  skyScene.add(sea);

  const u = sky.material.uniforms;
  u.turbidity.value = 4;
  u.rayleigh.value = 2.4;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.85;
  u.cloudCoverage.value = 0.35;
  u.cloudDensity.value = 0.45;
  u.cloudElevation.value = 0.55;
  u.cloudScale.value = 0.00022;
  u.cloudSpeed.value = 0.00003;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  // Cube camera for direct `textureCube` sampling in custom shaders
  const cubeRT = new THREE.WebGLCubeRenderTarget(256, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const cubeCam = new THREE.CubeCamera(0.5, 10000, cubeRT);

  let pmremRT = null;
  const current = { elev: 12, azim: 140 };

  function sunDirection(elevationDeg, azimuthDeg) {
    const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
    const theta = THREE.MathUtils.degToRad(azimuthDeg);
    const v = new THREE.Vector3();
    v.setFromSphericalCoords(1, phi, theta);
    return v;
  }

  function capture() {
    // The sun disc is handled analytically by lights and the water shader;
    // leaving it in the capture produces a hard hot spot in every reflection.
    u.showSunDisc.value = 0;
    cubeCam.position.set(0, 2, 0);
    cubeCam.update(renderer, skyScene);
    if (pmremRT) pmremRT.dispose();
    pmremRT = pmrem.fromScene(skyScene, 0, 0.5, 10000);
    scene.environment = pmremRT.texture;
    u.showSunDisc.value = 1;
  }

  function setSunElevation(elevationDeg = 12, azimuthDeg = 140) {
    current.elev = elevationDeg;
    current.azim = azimuthDeg;
    u.sunPosition.value.copy(sunDirection(elevationDeg, azimuthDeg));
    capture();
  }

  function setAtmosphere({ turbidity, rayleigh, mie, clouds, cloudDensity, seaColor, overcast, overcastColor }) {
    u.uOvercast.value = overcast ?? 0;
    if (overcastColor != null) u.uOvercastColor.value.setHex(overcastColor);
    if (turbidity != null) u.turbidity.value = turbidity;
    if (rayleigh != null) u.rayleigh.value = rayleigh;
    if (mie != null) u.mieCoefficient.value = mie;
    if (clouds != null) u.cloudCoverage.value = clouds;
    if (cloudDensity != null) u.cloudDensity.value = cloudDensity;
    if (seaColor != null) seaMat.color.setHex(seaColor);
    capture();
  }

  function update(dt) {
    u.time.value += dt;
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
    sea.geometry.dispose();
    seaMat.dispose();
  }

  return {
    sky,
    sunDirection,
    setSunElevation,
    setAtmosphere,
    update,
    getCubeRT,
    getPMREM,
    dispose,
  };
}
