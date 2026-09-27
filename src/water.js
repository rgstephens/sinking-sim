import * as THREE from "three";

/**
 * Gerstner-wave ocean shader.
 *
 * 4 stacked Gerstner waves displace the plane in the vertex shader; normals
 * are computed analytically from the wave derivatives. The fragment shader
 * reflects the env map (sky) along the surface normal, blends toward a deep
 * ocean color at glancing angles (Fresnel), adds specular sun glints,
 * Fresnel-driven foam at crests, and a screen-space foam halo near a
 * configurable "hull" position (the ship).
 *
 * The geometry is a flat plane in XZ — the shader does all vertical work.
 *
 * Usage:
 *   const ocean = createOcean({ size: 240, segments: 220, hullPos });
 *   scene.add(ocean.mesh);
 *   ocean.update(dtSeconds); // each frame
 */

const VERT = /* glsl */ `
  uniform float uTime;
  uniform vec2  uOrigin;
  uniform vec4  uWave[4]; // .xy = dir, .z = wavelength, .w = steepness
  uniform vec4  uWaveA[4]; // .x = amplitude, .y = speed, .z = phase, .w = unused

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vCrest;

  // Returns displaced position and analytic normal from 4 Gerstner waves.
  // D = direction (xz), W = wavelength, S = steepness, A = amplitude,
  // s = speed, p = phase. Wave vector k = 2π/W, dot = D · P, θ = dot * k + t*s + p.
  vec3 gerstner(vec2 pos, out vec3 nrm) {
    vec3 disp = vec3(0.0);
    vec3 n = vec3(0.0, 1.0, 0.0);
    for (int i = 0; i < 4; i++) {
      vec2 D = normalize(uWave[i].xy);
      float W = uWave[i].z;
      float S = uWave[i].w;
      float A = uWaveA[i].x;
      float sp = uWaveA[i].y;
      float ph = uWaveA[i].z;
      float k = 6.28318530718 / W;
      float dot = D.x * pos.x + D.y * pos.y;
      float th = dot * k + uTime * sp + ph;
      float c = cos(th);
      float s = sin(th);

      // displacement
      disp.x += S * A * D.x * c;
      disp.z += S * A * D.y * c;
      disp.y += A * s;

      // partial derivatives for normal
      // d(disp.y)/dx = A * k * D.x * cos(th)
      // d(disp.y)/dz = A * k * D.y * cos(th)
      // d(disp.x)/dx = -S * A * k * D.x * D.x * sin(th)
      // d(disp.z)/dz = -S * A * k * D.y * D.y * sin(th)
      // Tangent vectors:
      //   Tx = (1 + dDx/dx, dDy/dx, 0)
      //   Tz = (dDx/dz, dDy/dz, 1 + dDz/dz)
      // Normal = normalize(cross(Tz, Tx))
      float dDx_dx = -S * A * k * D.x * D.x * s;
      float dDy_dx = A * k * D.x * c;
      float dDx_dz = -S * A * k * D.x * D.y * s;
      float dDy_dz = A * k * D.y * c;
      float dDz_dz = -S * A * k * D.y * D.y * s;

      vec3 Tx = vec3(1.0 + dDx_dx, dDy_dx, 0.0);
      vec3 Tz = vec3(dDx_dz, dDy_dz, 1.0 + dDz_dz);
      vec3 ni = normalize(cross(Tz, Tx));
      // accumulate (additive — waves are small, this is fine)
      n = normalize(n + ni);
    }
    nrm = n;
    return disp;
  }

  void main() {
    vec2 worldXZ = position.xz + uOrigin;
    vec3 disp = gerstner(worldXZ, vNormal);
    vec3 local = vec3(position.x + disp.x, disp.y, position.z + disp.z);
    vWorldPos = vec3(worldXZ.x + disp.x, disp.y, worldXZ.y + disp.z);
    vCrest = clamp(disp.y * 0.6 + 0.5, 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform vec3  uCameraPos;
  uniform samplerCube uEnvMap;
  uniform vec3  uShallow;
  uniform vec3  uDeep;
  uniform vec3  uFoamColor;
  uniform vec3  uHullPos;
  uniform float uHullRadius;
  uniform float uTime;
  uniform vec3  uSunDir;
  uniform vec3  uSunColor;
  uniform float uSunIntensity;
  uniform float uEnvIntensity;

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vCrest;

  // Schlick Fresnel
  float fresnel(vec3 n, vec3 v, float F0) {
    float c = 1.0 - max(dot(n, v), 0.0);
    return F0 + (1.0 - F0) * pow(c, 5.0);
  }

  // Small hash for foam texture
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(uCameraPos - vWorldPos);
    vec3 R = reflect(-V, N);

    // Sky / env reflection
    vec3 skyCol = textureCube(uEnvMap, R).rgb * uEnvIntensity;

    // Fresnel: water is mostly reflective at glancing angles, transmissive up close
    float F = fresnel(N, V, 0.02);

    // Deep ocean color — get bluer/darker with depth (approximated by view angle)
    float depthMix = smoothstep(0.0, 0.85, dot(N, V));
    vec3 waterCol = mix(uShallow, uDeep, depthMix);

    // Sun specular (Blinn-Phong-ish)
    vec3 H = normalize(V + uSunDir);
    float spec = pow(max(dot(N, H), 0.0), 220.0);
    vec3 sunSpec = uSunColor * spec * uSunIntensity * 2.0;

    // Base = reflection over water
    vec3 base = mix(waterCol, skyCol, F);

    // Foam at crests
    float crestFoam = smoothstep(0.62, 0.92, vCrest);
    // Add moving noise to break up uniform foam
    float foamN = noise(vWorldPos.xz * 0.6 + vec2(uTime * 0.4, uTime * -0.25));
    crestFoam *= 0.6 + 0.4 * foamN;
    crestFoam = clamp(crestFoam, 0.0, 1.0);

    // Foam halo around hull (ship wake)
    float dHull = length(vWorldPos.xz - uHullPos.xz);
    float wake = smoothstep(uHullRadius, uHullRadius * 0.4, dHull);
    wake *= 0.45 + 0.55 * noise(vWorldPos.xz * 0.9 + uTime * 0.6);

    float foam = max(crestFoam, wake);

    vec3 col = base + sunSpec;
    col = mix(col, uFoamColor, foam);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createOcean({
  size = 240,
  segments = 220,
  envMap,
  hullPos = new THREE.Vector3(),
  hullRadius = 6.0,
} = {}) {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const uTime = { value: 0 };

  // 4 Gerstner waves: direction xy, wavelength z, steepness w
  const uWave = {
    value: [
      new THREE.Vector4(1.0, 0.0, 28.0, 0.55),  // long swell along x
      new THREE.Vector4(0.8, 0.6, 14.0, 0.45),  // mid wave diagonal
      new THREE.Vector4(-0.4, 0.9, 7.0, 0.35),  // short chop
      new THREE.Vector4(0.6, -0.8, 4.0, 0.25),  // ripple
    ],
  };
  // amplitude, speed, phase, _
  const uWaveA = {
    value: [
      new THREE.Vector4(0.42, 0.45, 0.0, 0),
      new THREE.Vector4(0.22, 0.7, 1.2, 0),
      new THREE.Vector4(0.12, 1.1, 2.4, 0),
      new THREE.Vector4(0.06, 1.6, 0.8, 0),
    ],
  };

  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime: uTime,
      uOrigin: { value: new THREE.Vector2() },
      uWave: uWave,
      uWaveA: uWaveA,
      uCameraPos: { value: new THREE.Vector3() },
      uEnvMap: { value: envMap },
      uShallow: { value: new THREE.Color(0x1a4868) },
      uDeep: { value: new THREE.Color(0x031020) },
      uFoamColor: { value: new THREE.Color(0xe8f0f8) },
      uHullPos: { value: hullPos.clone() },
      uHullRadius: { value: hullRadius },
      uSunDir: { value: new THREE.Vector3(0.3, 0.7, 0.4).normalize() },
      uSunColor: { value: new THREE.Color(0xfff1d6) },
      uSunIntensity: { value: 1.0 },
      uEnvIntensity: { value: 1.0 },
    },
    transparent: false,
    side: THREE.FrontSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = false;
  mesh.name = "ocean";
  mesh.position.y = 0;

  // Cube env map is what we want — Sky env is equirect, so we sample as
  // texture2D equirect in the fragment shader if uEnvMap is an equirect texture.
  // Three's PMREM output is a TextureCubeMap internally; textureCube works
  // when the source is cubemap. For equirect, switch to texture2D with eq projection.
  // (Resolved below in setEnvMap.)
  let isCube = false;

  function setEnvMap(envTex) {
    mat.uniforms.uEnvMap.value = envTex;
    isCube = envTex && envTex.isCubeTexture;
    mat.needsUpdate = true;
  }

  function setHullPosition(v) {
    mat.uniforms.uHullPos.value.copy(v);
  }

  function setOrigin(x, z) {
    mat.uniforms.uOrigin.value.set(x, z);
    mesh.position.x = x;
    mesh.position.z = z;
  }

  function setSunDirection(v) {
    mat.uniforms.uSunDir.value.copy(v).normalize();
  }

  function setTurbulence(level) {
    // 0 = glassy calm, 1 = normal, 2 = storm
    const k = level;
    const amps = uWaveA.value;
    amps[0].x = 0.42 * (0.4 + k * 0.8);
    amps[1].x = 0.22 * (0.4 + k * 0.8);
    amps[2].x = 0.12 * (0.4 + k * 0.8);
    amps[3].x = 0.06 * (0.4 + k * 0.8);
  }

  function update(dtSeconds, camera) {
    uTime.value += dtSeconds;
    mat.uniforms.uCameraPos.value.copy(camera.position);
  }

  function dispose() {
    geo.dispose();
    mat.dispose();
  }

  return {
    mesh,
    material: mat,
    update,
    setEnvMap,
    setHullPosition,
    setOrigin,
    setSunDirection,
    setTurbulence,
    dispose,
  };
}
