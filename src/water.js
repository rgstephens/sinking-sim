import * as THREE from "three";

/**
 * Open-ocean shader.
 *
 * Geometry: a grid whose spacing grows with distance from the centre, so it
 * reaches the horizon (±1600 units) while staying dense (~0.4) under the ship.
 * Each vertex stores its local spacing; waves too short for that spacing fade
 * out, which keeps the far field from aliasing.
 *
 * Vertex: 8 Gerstner waves with deep-water dispersion (ω = √(g·k)). Normals
 * and the Jacobian are analytic; the Jacobian drives whitecaps where the
 * surface is compressed.
 *
 * Fragment: two scrolling detail normal maps, sky reflection with Schlick
 * Fresnel, a water body colour lit by sky + sun, subsurface glow through wave
 * crests, GGX sun glitter that widens with distance, whitecaps, a hull foam
 * collar, a Kelvin wake from the bow, a turbulent centreline wake from the
 * stern, and haze toward the sky's own horizon colour. From below, the
 * surface shows Snell's window.
 *
 * Units: 1 = 10 m, so g = 0.981.
 */

const G = 0.981;
const WAVES = 8;
const GRID = 320;
const NEAR_EXTENT = 60;
const FAR_EXTENT = 1600;

// wavelength, amplitude, steepness, direction offset from wind (rad)
const WAVE_SET = [
  [62, 0.3, 0.35, 0.0],
  [33, 0.19, 0.45, 0.38],
  [19, 0.11, 0.55, -0.52],
  [11.5, 0.065, 0.6, 0.85],
  [7.1, 0.04, 0.62, -0.95],
  [4.4, 0.026, 0.66, 0.22],
  [2.8, 0.016, 0.7, -0.4],
  [1.8, 0.01, 0.72, 1.25],
];

const VERT = /* glsl */ `
  #define NWAVES ${WAVES}
  uniform float uTime;
  uniform vec2  uOrigin;
  uniform vec4  uWave[NWAVES];  // dir.xy, k, omega
  uniform vec4  uWaveA[NWAVES]; // amplitude, horizontal factor, phase, wavelength

  attribute float aSpacing;

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vJacobian;
  varying float vHeight;

  void main() {
    vec2 P = position.xz + uOrigin;
    vec3 disp = vec3(0.0);
    float dxdx = 0.0, dzdz = 0.0, dxdz = 0.0, dydx = 0.0, dydz = 0.0;

    for (int i = 0; i < NWAVES; i++) {
      vec2 D = uWave[i].xy;
      float k = uWave[i].z;
      float w = uWave[i].w;
      float W = uWaveA[i].w;
      // Need ~5 vertices per wavelength; fade shorter waves out.
      float fade = 1.0 - smoothstep(W * 0.1, W * 0.2, aSpacing);
      float A = uWaveA[i].x * fade;
      float Q = uWaveA[i].y * fade;
      float th = k * dot(D, P) - w * uTime + uWaveA[i].z;
      float c = cos(th);
      float s = sin(th);

      disp.x += Q * D.x * c;
      disp.z += Q * D.y * c;
      disp.y += A * s;

      float qk = Q * k;
      dxdx -= qk * D.x * D.x * s;
      dzdz -= qk * D.y * D.y * s;
      dxdz -= qk * D.x * D.y * s;
      dydx += A * k * D.x * c;
      dydz += A * k * D.y * c;
    }

    vNormal = normalize(vec3(-dydx, 1.0 + dxdx + dzdz, -dydz));
    vJacobian = (1.0 + dxdx) * (1.0 + dzdz) - dxdz * dxdz;
    vHeight = disp.y;

    vec3 local = vec3(position.x + disp.x, disp.y, position.z + disp.z);
    vWorldPos = vec3(P.x + disp.x, disp.y, P.y + disp.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform vec3  uCameraPos;
  uniform samplerCube uEnvMap;
  uniform sampler2D uNormalMap;
  uniform sampler2D uFoamMap;
  uniform float uTime;

  uniform vec3  uDeep;
  uniform vec3  uScatter;
  uniform vec3  uSunDir;
  uniform vec3  uSunColor;
  uniform float uSunIntensity;
  uniform float uEnvIntensity;
  uniform float uFoamAmount;
  uniform float uRoughness;
  uniform float uHaze;

  uniform vec3  uShipPos;
  uniform vec2  uShipFwd;
  uniform vec2  uShipSize;   // half length, half beam
  uniform float uShipSpeed;  // 0..1
  uniform float uShipAfloat; // 0..1
  uniform vec4  uShipBody;   // hull top, superstructure top, super half-beam, super half-length
  uniform vec3  uHullColor;
  uniform vec3  uSuperColor;

  // Refraction: the scene without water, and its depth, at reduced resolution
  uniform sampler2D uRefraction;
  uniform sampler2D uSceneDepth;
  uniform vec2  uScreen;
  uniform float uNear;
  uniform float uFar;
  uniform float uRefractOn;
  uniform vec3  uAbsorb;

  float linearDepth(float d) {
    float z = d * 2.0 - 1.0;
    return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
  }

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vJacobian;
  varying float vHeight;

  const float PI = 3.14159265;

  vec3 env(vec3 dir, float lod) {
    return textureCubeLodEXT(uEnvMap, dir, lod).rgb * uEnvIntensity;
  }

  vec3 detailNormal(vec2 p, float strength) {
    vec2 uv1 = p * 0.11 + vec2(uTime * 0.018, uTime * 0.011);
    vec2 uv2 = p * 0.29 + vec2(-uTime * 0.024, uTime * 0.031);
    vec2 uv3 = p * 0.037 + vec2(uTime * 0.006, -uTime * 0.005);
    vec2 n = (texture2D(uNormalMap, uv1).xy * 2.0 - 1.0)
           + (texture2D(uNormalMap, uv2).xy * 2.0 - 1.0) * 0.7
           + (texture2D(uNormalMap, uv3).xy * 2.0 - 1.0) * 0.5;
    return vec3(n.x, 0.0, n.y) * strength;
  }

  float foamTex(vec2 p) {
    float a = texture2D(uFoamMap, p * 0.09 + vec2(uTime * 0.006, 0.0)).r;
    float b = texture2D(uFoamMap, p * 0.23 - vec2(0.0, uTime * 0.01)).r;
    return clamp(a * 0.6 + b * 0.55, 0.0, 1.0);
  }

  float ggx(float NdH, float a) {
    float a2 = a * a;
    float d = NdH * NdH * (a2 - 1.0) + 1.0;
    return a2 / (PI * d * d);
  }

  // Foam from the ship: hull collar, bow Kelvin arms, stern centreline wake.
  float shipFoam(vec2 p, float grain) {
    if (uShipAfloat <= 0.001) return 0.0;
    vec2 rel = p - uShipPos.xz;
    float a = dot(rel, uShipFwd);
    float b = dot(rel, vec2(-uShipFwd.y, uShipFwd.x));
    float ab = abs(b);
    float hl = uShipSize.x;
    float hb = uShipSize.y;
    float spd = uShipSpeed;

    // Collar where the hull meets the water, heaviest at the bow. The
    // waterplane is full amidships and closes to a point at the stem.
    float along = clamp(a / hl, -1.2, 1.2);
    float width = hb * pow(clamp((hl - abs(a)) / (hl * 0.35), 0.0, 1.0), 0.8);
    float gap = ab - width;
    float band = 0.2 + spd * 0.35;
    float collar = (1.0 - smoothstep(0.0, band, gap)) * step(-0.05, gap);
    collar *= 1.0 - smoothstep(hl, hl + band, abs(a));
    collar *= 0.3 + spd * (0.4 + 0.8 * smoothstep(0.2, 1.0, along));

    // Kelvin arms (19.5°) spreading back from the stem.
    float foam = collar;
    float dB = hl * 0.96 - a;
    if (dB > 0.0) {
      float spread = dB * 0.354 + hb * 0.25;
      float w = 0.18 + dB * 0.02;
      float arm = exp(-pow((ab - spread) / w, 2.0));
      // Transverse crests inside the V
      float inner = smoothstep(spread, spread * 0.4, ab) * (0.5 + 0.5 * sin(dB * 2.2));
      float fade = exp(-dB / (hl * 2.6));
      foam += (arm * (0.4 + 0.6 * grain) + inner * 0.15) * fade * spd * 0.7 * smoothstep(hl * 0.3, hl * 0.8, dB);
    }

    // Churned propeller wash behind the stern.
    float dS = -(a + hl * 0.92);
    if (dS > 0.0) {
      float cw = hb * 0.7 + dS * 0.05;
      float centre = exp(-pow(ab / cw, 2.0));
      float fade = exp(-dS / (hl * 3.5));
      foam += centre * fade * spd * 1.1;
    }

    return clamp(foam, 0.0, 1.0) * uShipAfloat * smoothstep(0.15, 0.7, grain + foam * 0.3);
  }

  // Slab test against an axis-aligned box in ship space. Returns entry t or -1.
  float hitBox(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax) {
    vec3 inv = 1.0 / rd;
    vec3 t0 = (bmin - ro) * inv;
    vec3 t1 = (bmax - ro) * inv;
    vec3 tmin = min(t0, t1);
    vec3 tmax = max(t0, t1);
    float tn = max(max(tmin.x, tmin.y), tmin.z);
    float tf = min(min(tmax.x, tmax.y), tmax.z);
    return (tf > max(tn, 0.0)) ? max(tn, 0.0) : -1.0;
  }

  // Cheap mirror image of the ship: trace the reflected ray against a hull
  // box (tapered at the ends) and a superstructure box.
  vec4 shipReflection(vec3 p, vec3 R, vec3 ambient, vec3 sun) {
    if (uShipAfloat <= 0.001) return vec4(0.0);
    vec2 f = uShipFwd;
    vec2 sd = vec2(-f.y, f.x);
    vec3 rel = p - uShipPos;
    vec3 ro = vec3(dot(rel.xz, f), p.y - uShipPos.y, dot(rel.xz, sd));
    vec3 rd = vec3(dot(R.xz, f), R.y, dot(R.xz, sd));
    float hl = uShipSize.x;
    float hb = uShipSize.y;
    float t = hitBox(ro, rd, vec3(-hl, -0.5, -hb), vec3(hl, uShipBody.x, hb));
    if (t >= 0.0) {
      vec3 h = ro + rd * t;
      float w = hb * clamp((hl - abs(h.x)) / (hl * 0.35), 0.05, 1.0);
      if (abs(h.z) <= w * 1.02) return vec4(uHullColor * (ambient * 0.7 + sun * 0.08), exp(-t * 0.05));
    }
    if (uShipBody.y > uShipBody.x) {
      t = hitBox(ro, rd, vec3(-uShipBody.w, uShipBody.x, -uShipBody.z), vec3(uShipBody.w, uShipBody.y, uShipBody.z));
      if (t >= 0.0) return vec4(uSuperColor * (ambient * 0.8 + sun * 0.25), exp(-t * 0.05));
    }
    return vec4(0.0);
  }

  void main() {
    vec3 toCam = uCameraPos - vWorldPos;
    float dist = length(toCam);
    vec3 V = toCam / dist;

    float nearDetail = 1.0 - smoothstep(30.0, 420.0, dist);
    vec3 N = normalize(vNormal + detailNormal(vWorldPos.xz, 0.2 * (0.45 + 0.55 * nearDetail)));

    vec3 L = normalize(uSunDir);
    vec3 sun = uSunColor * uSunIntensity * smoothstep(-0.02, 0.1, L.y);
    vec3 ambient = env(vec3(0.0, 1.0, 0.0), 7.0);

    if (!gl_FrontFacing) {
      // Looking up from below: Snell's window, otherwise total internal reflection.
      vec3 Nu = -N;
      float cosV = dot(Nu, V);
      float window = smoothstep(0.62, 0.72, cosV);
      vec3 through = env(refract(-V, Nu, 1.0 / 1.33), 2.0) * 0.55;
      vec3 deepU = uDeep * (ambient * 0.6 + sun * 0.08);
      vec3 upCol = mix(deepU, through, window);
      // Murk: the surface fades out a few tens of metres up
      float murk = 1.0 - exp(-pow(dist * 0.055, 1.6));
      gl_FragColor = vec4(mix(upCol, deepU * 1.4, murk), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      return;
    }

    float NdV = max(dot(N, V), 0.0);
    float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);

    vec3 R = reflect(-V, N);
    R.y = abs(R.y) + 0.01;
    float rough = uRoughness + (1.0 - nearDetail) * 0.18;
    vec3 refl = env(R, rough * 6.0);
    // Trace the ship with a calmer normal: fine ripples smear a real reflection.
    vec3 Nc = normalize(mix(vNormal, N, 0.35));
    vec3 Rc = reflect(-V, Nc);
    Rc.y = abs(Rc.y) + 0.01;
    vec4 mirrored = shipReflection(vWorldPos, Rc, ambient, sun);
    refl = mix(refl, mirrored.rgb, mirrored.a * 0.85 * (1.0 - rough * 1.5));

    // Water body: light scattered back out of the column.
    vec3 body = uDeep * (ambient * 0.9 + sun * 0.18 * max(L.y, 0.0));
    vec3 scatterBody = body;
    float crest = clamp(vHeight * 1.8 + 0.35, 0.0, 1.0);
    float sss = pow(max(0.0, dot(V, -normalize(L + N * 0.55))), 3.0);
    body += uScatter * (sun * sss * (0.25 + crest) * 0.55 + ambient * crest * 0.12);

    // Whatever lies under the surface, absorbed by the water in between.
    if (uRefractOn > 0.5) {
      vec2 suv = gl_FragCoord.xy / uScreen;
      float waterD = linearDepth(gl_FragCoord.z);
      float sceneD = linearDepth(texture2D(uSceneDepth, suv).r);
      float thick = sceneD - waterD;
      vec2 duv = suv + N.xz * 0.04 * clamp(thick * 0.3, 0.0, 1.0);
      float thick2 = linearDepth(texture2D(uSceneDepth, duv).r) - waterD;
      if (thick2 > 0.0) { suv = duv; thick = thick2; }
      if (thick > 0.0) {
        vec3 under = texture2D(uRefraction, suv).rgb;
        vec3 trans = exp(-uAbsorb * thick);
        body = under * trans + scatterBody * (1.0 - trans);
      }
    }

    vec3 col = mix(body, refl, F);

    // Sun glitter
    vec3 H = normalize(V + L);
    float NdL = max(dot(N, L), 0.0);
    float a = max(0.02, rough * rough);
    float spec = ggx(max(dot(N, H), 0.0), a) * 0.25;
    float Fs = 0.02 + 0.98 * pow(1.0 - max(dot(V, H), 0.0), 5.0);
    col += sun * min(spec * Fs * NdL, 5.0);

    // Foam: whitecaps where the surface compresses, plus the ship.
    float grain = foamTex(vWorldPos.xz);
    float caps = smoothstep(1.0 - uFoamAmount * 0.55, 0.45, vJacobian);
    caps *= smoothstep(0.25, 0.75, grain);
    float foam = clamp(caps + shipFoam(vWorldPos.xz, grain), 0.0, 1.0);
    foam *= 0.4 + 0.6 * nearDetail;
    vec3 foamLit = vec3(0.95) * (mix(ambient, vec3(dot(ambient, vec3(0.333))), 0.6) * 1.15 + sun * (0.3 + 0.7 * NdL) * 0.35);
    col = mix(col, foamLit, foam * 0.92);

    // Aerial perspective toward the sky's horizon colour.
    vec3 viewDir = -V;
    vec3 horizon = env(normalize(vec3(viewDir.x, 0.035, viewDir.z)), 1.0);
    float haze = 1.0 - exp(-pow(dist * uHaze, 1.4));
    float edge = smoothstep(FAR_EDGE * 0.55, FAR_EDGE * 0.95, length(vWorldPos.xz - uCameraPos.xz));
    col = mix(col, horizon, clamp(max(haze, edge), 0.0, 1.0));

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`.replace(/FAR_EDGE/g, FAR_EXTENT.toFixed(1));

function warp(t) {
  const a = Math.abs(t);
  return Math.sign(t) * (NEAR_EXTENT * a + (FAR_EXTENT - NEAR_EXTENT) * a ** 4);
}

function warpSlope(t) {
  const a = Math.abs(t);
  return NEAR_EXTENT + 4 * (FAR_EXTENT - NEAR_EXTENT) * a ** 3;
}

function buildGrid() {
  const geo = new THREE.PlaneGeometry(2, 2, GRID, GRID);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const spacing = new Float32Array(pos.count);
  const step = 2 / GRID;
  for (let i = 0; i < pos.count; i++) {
    const tx = pos.getX(i);
    const tz = pos.getZ(i);
    pos.setXYZ(i, warp(tx), 0, warp(tz));
    spacing[i] = Math.max(warpSlope(tx), warpSlope(tz)) * step;
  }
  geo.setAttribute("aSpacing", new THREE.BufferAttribute(spacing, 1));
  geo.computeBoundingSphere();
  geo.boundingSphere.radius = FAR_EXTENT * 1.5;
  return geo;
}

// --- Procedural textures (tileable) ---

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Sum of integer-frequency sinusoids → tileable height → normal map. */
function makeRippleNormalMap(size = 256) {
  const rnd = seeded(7);
  const comps = [];
  for (let i = 0; i < 48; i++) {
    let kx = 0;
    let ky = 0;
    while (kx === 0 && ky === 0) {
      kx = Math.round((rnd() * 2 - 1) * 14);
      ky = Math.round((rnd() * 2 - 1) * 14);
    }
    const k = Math.hypot(kx, ky);
    comps.push({ kx, ky, amp: 1 / Math.pow(k, 1.35), ph: rnd() * Math.PI * 2 });
  }
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const c of comps) {
        v += c.amp * Math.sin(((c.kx * x + c.ky * y) / size) * Math.PI * 2 + c.ph);
      }
      h[y * size + x] = v;
    }
  }
  const data = new Uint8Array(size * size * 4);
  const s = 5.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)];
      const r = h[y * size + ((x + 1) % size)];
      const d = h[((y - 1 + size) % size) * size + x];
      const u = h[((y + 1) % size) * size + x];
      const nx = (l - r) * s;
      const ny = (d - u) * s;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Tileable fractal noise, thresholded into clumpy foam with fine lacing. */
function makeFoamMap(size = 256) {
  const rnd = seeded(31);
  const lattice = (period) => {
    const g = new Float32Array(period * period);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    return (x, y) => {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const fx = x - xi;
      const fy = y - yi;
      const ux = fx * fx * (3 - 2 * fx);
      const uy = fy * fy * (3 - 2 * fy);
      const at = (i, j) => g[((j % period) + period) % period * period + (((i % period) + period) % period)];
      const a = at(xi, yi);
      const b = at(xi + 1, yi);
      const c = at(xi, yi + 1);
      const d = at(xi + 1, yi + 1);
      return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    };
  };
  const octaves = [4, 8, 16, 32, 64].map((p) => ({ p, n: lattice(p) }));
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      let amp = 0.5;
      let norm = 0;
      for (const { p, n } of octaves) {
        v += amp * n((x / size) * p, (y / size) * p);
        norm += amp;
        amp *= 0.55;
      }
      v /= norm;
      // Ridges of the fine octave give the lacy edges of real foam.
      const lace = 1 - Math.abs(octaves[3].n((x / size) * 32, (y / size) * 32) * 2 - 1);
      const f = Math.min(1, Math.max(0, (v - 0.38) * 3.2)) * (0.65 + 0.35 * lace);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = f * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export function createOcean({ envMap, windAngle = 0.6 } = {}) {
  const geo = buildGrid();
  const nearSpacing = (NEAR_EXTENT * 2) / GRID;

  const waveDir = WAVE_SET.map(([W, , , off]) => {
    const a = windAngle + off;
    const k = (Math.PI * 2) / W;
    return new THREE.Vector4(Math.cos(a), Math.sin(a), k, Math.sqrt(G * k));
  });
  const waveA = WAVE_SET.map(([W], i) => new THREE.Vector4(0, 0, i * 1.7, W));

  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime: { value: 0 },
      uOrigin: { value: new THREE.Vector2() },
      uWave: { value: waveDir },
      uWaveA: { value: waveA },
      uCameraPos: { value: new THREE.Vector3() },
      uEnvMap: { value: envMap },
      uNormalMap: { value: makeRippleNormalMap() },
      uFoamMap: { value: makeFoamMap() },
      uDeep: { value: new THREE.Color(0x06222f) },
      uScatter: { value: new THREE.Color(0x1f8f7a) },
      uSunDir: { value: new THREE.Vector3(0.3, 0.7, 0.4).normalize() },
      uSunColor: { value: new THREE.Color(0xfff1d6) },
      uSunIntensity: { value: 3.0 },
      uEnvIntensity: { value: 1.0 },
      uFoamAmount: { value: 0.5 },
      uRoughness: { value: 0.12 },
      uHaze: { value: 0.0012 },
      uShipPos: { value: new THREE.Vector3(0, -100, 0) },
      uShipFwd: { value: new THREE.Vector2(-1, 0) },
      uShipSize: { value: new THREE.Vector2(10, 1.4) },
      uShipSpeed: { value: 0 },
      uShipAfloat: { value: 0 },
      uShipBody: { value: new THREE.Vector4(0.8, 0.8, 1, 5) },
      uHullColor: { value: new THREE.Color(0x111111) },
      uSuperColor: { value: new THREE.Color(0xeeeeee) },
      uRefraction: { value: null },
      uSceneDepth: { value: null },
      uScreen: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.1 },
      uFar: { value: 1000 },
      uRefractOn: { value: 0 },
      // Red goes first, then green: a few metres down everything is teal.
      uAbsorb: { value: new THREE.Vector3(0.9, 0.32, 0.22) },
    },
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.name = "ocean";

  // Height-only mirror of the vertex shader for making things ride the swell.
  const heightWaves = WAVE_SET.map(([W], i) => ({
    dir: waveDir[i],
    amp: waveA[i],
    W,
  }));

  function setTurbulence(level) {
    // 0 = glassy calm, 1 = moderate, 2 = storm
    const ampScale = 0.3 + level * 0.75;
    const steepScale = Math.min(1, 0.35 + level * 0.38);
    WAVE_SET.forEach(([W, amp, steep], i) => {
      const k = (Math.PI * 2) / W;
      const A = amp * ampScale;
      waveA[i].x = A;
      waveA[i].y = (steep * steepScale) / (k * WAVES);
    });
    mat.uniforms.uFoamAmount.value = Math.min(1, level * 0.55);
    mat.uniforms.uRoughness.value = 0.08 + level * 0.05;
  }

  function sampleHeight(x, z, minWavelength = 10) {
    const t = mat.uniforms.uTime.value;
    let h = 0;
    for (const w of heightWaves) {
      if (w.W < minWavelength) continue;
      const d = w.dir;
      h += w.amp.x * Math.sin(d.z * (d.x * x + d.y * z) - d.w * t + w.amp.z);
    }
    return h;
  }

  function setEnvMap(envTex) {
    mat.uniforms.uEnvMap.value = envTex;
  }

  function setOrigin(x, z) {
    // Snap to the near-field grid so vertices do not swim across the waves.
    const sx = Math.round(x / nearSpacing) * nearSpacing;
    const sz = Math.round(z / nearSpacing) * nearSpacing;
    mat.uniforms.uOrigin.value.set(sx, sz);
    mesh.position.x = sx;
    mesh.position.z = sz;
  }

  function setSunDirection(v) {
    mat.uniforms.uSunDir.value.copy(v).normalize();
  }

  function setSun(color, intensity) {
    mat.uniforms.uSunColor.value.copy(color);
    mat.uniforms.uSunIntensity.value = intensity;
  }

  function setLook({ deep, scatter, haze }) {
    if (deep != null) mat.uniforms.uDeep.value.setHex(deep);
    if (scatter != null) mat.uniforms.uScatter.value.setHex(scatter);
    if (haze != null) mat.uniforms.uHaze.value = haze;
  }

  /**
   * ship: {x,y,z}, fwd: {x,z} unit bow vector, speed01, afloat01.
   * body (optional): { hullTop, superTop, superHalfBeam, superHalfLen, hullColor, superColor }
   */
  function setShip(pos, fwd, halfLen, halfBeam, speed01, afloat01, body) {
    const u = mat.uniforms;
    if (body) {
      u.uShipBody.value.set(body.hullTop, body.superTop, body.superHalfBeam, body.superHalfLen);
      u.uHullColor.value.setHex(body.hullColor);
      u.uSuperColor.value.setHex(body.superColor);
    }
    u.uShipPos.value.set(pos.x, pos.y, pos.z);
    u.uShipFwd.value.set(fwd.x, fwd.z);
    u.uShipSize.value.set(halfLen, halfBeam);
    u.uShipSpeed.value = speed01;
    u.uShipAfloat.value = afloat01;
  }

  function update(dtSeconds, camera) {
    mat.uniforms.uTime.value += dtSeconds;
    mat.uniforms.uCameraPos.value.copy(camera.position);
    mat.uniforms.uNear.value = camera.near;
    mat.uniforms.uFar.value = camera.far;
  }

  /** target: WebGLRenderTarget with a depthTexture; screen: drawing-buffer size. */
  function setRefraction(target, screenW, screenH) {
    const u = mat.uniforms;
    u.uRefraction.value = target ? target.texture : null;
    u.uSceneDepth.value = target ? target.depthTexture : null;
    u.uScreen.value.set(screenW, screenH);
    u.uRefractOn.value = target ? 1 : 0;
  }

  function windDirection() {
    return { x: Math.cos(windAngle), z: Math.sin(windAngle) };
  }

  function dispose() {
    geo.dispose();
    mat.uniforms.uNormalMap.value.dispose();
    mat.uniforms.uFoamMap.value.dispose();
    mat.dispose();
  }

  setTurbulence(0.6);

  return {
    mesh,
    material: mat,
    update,
    setEnvMap,
    setOrigin,
    setSunDirection,
    setSun,
    setLook,
    setShip,
    setTurbulence,
    setRefraction,
    sampleHeight,
    windDirection,
    dispose,
  };
}
