import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { createSky } from "./sky.js";
import { createOcean } from "./water.js";
import { createEffects } from "./effects.js";
import { SEABED_Y, bowDirection } from "./physics.js";
import { splitShip, setShipLights } from "./shipMesh.js";

const MAX_PIXEL_RATIO = 2;

// Vignette + gentle filmic grade, applied in linear HDR before tone mapping.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.32 },
    uUnderwater: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uUnderwater;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float d = length(vUv - 0.5) * 1.35;
      c.rgb *= mix(1.0, smoothstep(1.05, 0.25, d), uVignette);
      // Under the surface, red is absorbed first.
      c.rgb *= mix(vec3(1.0), vec3(0.35, 0.75, 0.9), uUnderwater);
      gl_FragColor = c;
    }
  `,
};

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
  });
  const pixelRatio = () => Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.6;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xb8c8d4, 0.004);

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.25,
    6000
  );
  camera.position.set(18, 10, 22);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 4;
  controls.maxDistance = 120;
  controls.target.set(0, 0.5, 0);

  // Post: HDR multisampled target → bloom → grade → tone map + sRGB.
  const target = new THREE.WebGLRenderTarget(
    window.innerWidth * pixelRatio(),
    window.innerHeight * pixelRatio(),
    { type: THREE.HalfFloatType, samples: 4 }
  );
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(pixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.3,
    0.35,
    4.0
  );
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  // Procedural sky + env map
  const skyCtl = createSky(renderer, scene);

  const hemi = new THREE.HemisphereLight(0xc8e0f5, 0x0c2230, 0.15);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1d6, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  sun.shadow.camera.left = -42;
  sun.shadow.camera.right = 42;
  sun.shadow.camera.top = 42;
  sun.shadow.camera.bottom = -42;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  scene.add(sun);
  scene.add(sun.target);

  const currentSun = { elev: 16, azim: 220 };
  const sunDir = new THREE.Vector3();

  const ocean = createOcean({ envMap: skyCtl.getCubeRT() });
  scene.add(ocean.mesh);
  const water = ocean.mesh;

  // Refraction: everything but the water, with depth. Full resolution: at
  // half, the waterline on a sinking hull turns into stair steps.
  const refraction = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    depthTexture: new THREE.DepthTexture(1, 1, THREE.FloatType),
  });
  function sizeRefraction() {
    const w = Math.floor(window.innerWidth * pixelRatio());
    const h = Math.floor(window.innerHeight * pixelRatio());
    refraction.setSize(Math.max(1, w), Math.max(1, h));
    ocean.setRefraction(refraction, w, h);
  }
  sizeRefraction();

  const effects = createEffects(scene);

  // Sea floor: rolling sand with scattered rock, following the ship.
  const seabed = buildSeabed();
  scene.add(seabed);

  // Dock
  const dock = new THREE.Group();
  const timber = new THREE.MeshStandardMaterial({ color: 0x5c4636, roughness: 0.9 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 0.45, 3.5), timber);
  pier.position.set(-24, 0.35, 16);
  pier.castShadow = true;
  pier.receiveShadow = true;
  dock.add(pier);
  const pileMat = new THREE.MeshStandardMaterial({ color: 0x33271c, roughness: 0.95 });
  for (let i = 0; i < 6; i++) {
    for (const zz of [14.4, 17.6]) {
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 3.2, 10), pileMat);
      pile.position.set(-28.6 + i * 1.85, -0.9, zz);
      pile.castShadow = true;
      dock.add(pile);
    }
  }
  scene.add(dock);

  // Tsunami wave — a curling crest with a foam lip, rippled like the sea
  const wave = buildTsunami();
  wave.material.normalMap = ocean.material.uniforms.uNormalMap.value;
  wave.material.normalScale.set(0.6, 0.6);
  wave.visible = false;
  scene.add(wave);

  let shipRoot = null;
  let cameraMode = "orbit";
  let wreck = null;
  const debris = [];
  let hazardRoot = null;
  const surfaceFog = { color: scene.fog.color.getHex(), density: scene.fog.density };
  let underWater = false;
  let windowGlow = 0;

  const _chase = new THREE.Vector3();
  const _look = new THREE.Vector3();
  const _sunAt = new THREE.Vector3();
  let visualDt = 0.016;

  function syncSun() {
    sunDir.copy(skyCtl.sunDirection(currentSun.elev, currentSun.azim));
    ocean.setSunDirection(sunDir);
    ocean.setSun(sun.color, sun.intensity);
    effects.setLight(hemi.color, sun.color);
  }

  function setSun(elev, azim) {
    currentSun.elev = elev;
    currentSun.azim = azim;
    skyCtl.setSunElevation(elev, azim);
    syncSun();
  }

  /** Everything an atmosphere preset controls, in one place. */
  function setLighting(p) {
    skyCtl.setAtmosphere({
      turbidity: p.turbidity,
      rayleigh: p.rayleigh,
      mie: p.mie,
      clouds: p.clouds,
      cloudDensity: p.cloudDensity,
      seaColor: p.envSea,
      overcast: p.overcast,
      overcastColor: p.overcastColor,
    });
    setSun(p.sunElev, p.sunAzim);
    sun.color.setHex(p.sunColor);
    sun.intensity = p.sunIntensity;
    hemi.color.setHex(p.hemi.sky);
    hemi.groundColor.setHex(p.hemi.ground);
    hemi.intensity = p.hemi.intensity;
    scene.environmentIntensity = p.envIntensity;
    scene.fog.color.setHex(p.fogColor);
    scene.fog.density = p.fogDensity;
    surfaceFog.color = p.fogColor;
    surfaceFog.density = p.fogDensity;
    renderer.toneMappingExposure = p.exposure;
    // Bloom sees pre-exposure HDR, so key its threshold to exposure: only
    // what ends up well past white after tone mapping should glow.
    bloom.strength = p.bloom;
    bloom.threshold = 4 / p.exposure;
    ocean.setTurbulence(p.oceanTurbulence);
    ocean.setLook({ deep: p.waterDeep, scatter: p.waterScatter, haze: p.haze });
    windowGlow = p.windowGlow;
    if (shipRoot) setShipLights(shipRoot, windowGlow);
    syncSun();
  }

  /** Scale window glow, e.g. as power fails while the ship goes down. */
  function dimShipLights(factor) {
    if (shipRoot) setShipLights(shipRoot, windowGlow * factor);
  }

  function setShip(root) {
    if (shipRoot) {
      scene.remove(shipRoot);
      disposeObject(shipRoot);
    }
    wreck = null;
    shipRoot = root;
    if (root) {
      setShipLights(root, windowGlow);
      scene.add(root);
    }
    effects.clear();
  }

  function getShip() {
    return shipRoot;
  }

  function setCameraMode(mode) {
    cameraMode = mode;
    controls.enabled = mode !== "chase";
    if (mode === "dock") {
      camera.position.set(-20, 2.2, 18);
      controls.target.set(0, 1, 0);
      controls.update();
    }
  }

  function updateChase(pos, yaw, ship) {
    if (cameraMode !== "chase") return;
    const bow = bowDirection(yaw);
    const len = ship ? ship.length : 26;
    const dist = 10 + len * 0.55;
    const height = pos.y < -2 ? 4.5 : 3.2 + len * 0.16;
    // Sit a little off the quarter so the hull reads in three dimensions.
    const side = { x: -bow.z, z: bow.x };
    _chase.set(
      pos.x - bow.x * dist + side.x * dist * 0.28,
      pos.y + height,
      pos.z - bow.z * dist + side.z * dist * 0.28
    );
    camera.position.lerp(_chase, 0.08);
    _look.set(pos.x + bow.x * len * 0.12, pos.y + 1.0, pos.z + bow.z * len * 0.12);
    controls.target.lerp(_look, 0.14);
    camera.lookAt(controls.target);
  }

  function getCameraMode() {
    return cameraMode;
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(w, h);
    composer.setPixelRatio(pixelRatio());
    composer.setSize(w, h);
    sizeRefraction();
    effects.setViewport(h * pixelRatio(), camera.fov);
  }

  window.addEventListener("resize", resize);
  effects.setViewport(window.innerHeight * pixelRatio(), camera.fov);

  /**
   * shipInfo: { pos, yaw, halfLen, halfBeam, speed01, afloat01 } or null
   */
  function animateWater(dt, shipInfo) {
    visualDt = dt;
    ocean.update(dt, camera);
    skyCtl.update(dt);
    if (shipInfo) {
      const p = shipInfo.pos;
      ocean.setOrigin(p.x, p.z);
      ocean.setShip(
        p,
        bowDirection(shipInfo.yaw),
        shipInfo.halfLen,
        shipInfo.halfBeam,
        shipInfo.speed01,
        shipInfo.afloat01,
        shipInfo.body
      );
      seabed.position.x = p.x;
      seabed.position.z = p.z;
      _sunAt.set(p.x, 0, p.z);
      sun.position.copy(sunDir).multiplyScalar(110).add(_sunAt);
      sun.target.position.copy(_sunAt);
      sun.target.updateMatrixWorld();
    }
  }

  function setOceanTurbulence(level) {
    ocean.setTurbulence(level);
  }

  function sampleWave(x, z, minWavelength) {
    return ocean.sampleHeight(x, z, minWavelength);
  }

  function updateWave(hazard, time) {
    if (!hazard || hazard.kind !== "tsunami" || hazard.resolved) {
      wave.visible = false;
      return;
    }
    wave.visible = true;
    const p = Math.min(1, Math.max(0, hazard.phase));
    const side = hazard.side || 1;
    const right = { x: Math.sin(hazard.yaw), z: Math.cos(hazard.yaw) };
    const approach = (1 - p) * 34;
    wave.position.set(
      hazard.position.x + right.x * side * approach,
      -0.6,
      hazard.position.z + right.z * side * approach
    );
    wave.rotation.y = hazard.yaw + (side > 0 ? 0 : Math.PI);
    const rise = 0.55 + Math.sin(Math.min(1, p * 1.3) * Math.PI * 0.5) * 0.65;
    wave.scale.set(1, rise, 1 + p * 0.3);
    wave.material.opacity = 1 - Math.max(0, p - 0.9) / 0.1;
    wave.userData.time = time;
  }

  function syncHazard(hazard, time) {
    if (!hazard || hazard.resolved || hazard.kind === "boiler") {
      clearHazard();
      return;
    }
    if (!hazardRoot || hazardRoot.userData.kind !== hazard.kind) {
      clearHazard();
      hazardRoot = buildHazardMesh(hazard.kind);
      hazardRoot.userData.kind = hazard.kind;
      scene.add(hazardRoot);
    }
    const x = hazard.position.x;
    const z = hazard.position.z;
    const swell = ocean.sampleHeight(x, z, 6);
    if (hazard.kind === "mine") {
      hazardRoot.position.set(x, swell - 0.28, z);
      hazardRoot.rotation.set(Math.sin(time * 1.3) * 0.15, time * 0.2, Math.cos(time * 1.1) * 0.15);
    } else {
      // A berg this size barely rides the swell.
      hazardRoot.position.set(x, swell * 0.15, z);
      hazardRoot.rotation.set(0, hazard.yaw * 0.3 + 0.8 + time * 0.004, 0);
    }
  }

  function clearHazard() {
    if (!hazardRoot) return;
    scene.remove(hazardRoot);
    disposeObject(hazardRoot);
    hazardRoot = null;
  }

  function updateEffects(state, shipMesh) {
    if (wave.visible) {
      // Spray blowing off the lip as it comes in.
      const lip = wave.userData.lip;
      wave.updateMatrixWorld(true);
      for (let i = 0; i < 6; i++) {
        const p = lip.clone();
        p.x = (Math.random() - 0.5) * wave.userData.width * 0.8;
        wave.localToWorld(p);
        wave.userData.spray.push(p);
      }
    }
    effects.update(visualDt, {
      state,
      ship: shipMesh,
      debris,
      wind: ocean.windDirection(),
      waveSpray: wave.visible ? wave.userData.spray.splice(0) : null,
    });
  }

  function releaseStacks(root, count) {
    const stacks = [];
    root.traverse((obj) => {
      if (obj.name === "funnel" && !obj.userData.falling) stacks.push(obj);
    });
    const victims = stacks.slice(0, count);
    for (const stack of victims) {
      const wp = new THREE.Vector3();
      const wq = new THREE.Quaternion();
      stack.getWorldPosition(wp);
      stack.getWorldQuaternion(wq);
      stack.parent.remove(stack);
      stack.position.copy(wp);
      stack.quaternion.copy(wq);
      stack.userData.falling = true;
      stack.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 1.4, 1.1, (Math.random() - 0.5) * 1.4);
      stack.userData.spin = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.4, Math.random() - 0.5);
      scene.add(stack);
      debris.push(stack);
    }
  }

  function updateDebris(dt) {
    for (const piece of debris) {
      const vel = piece.userData.vel;
      const spin = piece.userData.spin;
      if (!vel) continue;
      if (piece.position.y <= SEABED_Y + 0.45) {
        piece.position.y = SEABED_Y + 0.45;
        vel.y = 0;
        vel.x *= 0.9;
        vel.z *= 0.9;
        continue;
      }
      vel.y -= 1.7 * dt;
      if (piece.position.y < 0 && vel.y < 0) vel.y *= 0.92;
      piece.position.addScaledVector(vel, dt);
      if (spin) piece.rotation.x += spin.x * dt;
      if (spin) piece.rotation.z += spin.z * dt;
    }
  }

  function clearDebris() {
    for (const piece of debris) {
      scene.remove(piece);
      disposeObject(piece);
    }
    debris.length = 0;
    effects.clear();
  }

  function beginBreakup(root) {
    if (wreck) return wreck.holder;
    const parts = splitShip(root);
    const holder = new THREE.Group();
    holder.name = "wreck";
    holder.position.copy(root.position);
    holder.quaternion.copy(root.quaternion);
    parts.bow.position.set(0, 0, 0);
    parts.stern.position.set(0, 0, 0);
    holder.add(parts.bow);
    holder.add(parts.stern);
    const volumes = [...(parts.bow.userData.waterVolumes || []), ...(parts.stern.userData.waterVolumes || [])];
    volumes.sort((a, b) => (a.userData.compartment ?? 0) - (b.userData.compartment ?? 0));
    holder.userData.ship = root.userData.ship;
    holder.userData.waterVolumes = volumes;
    scene.remove(root);
    disposeObject(root);
    setShipLights(holder, windowGlow);
    scene.add(holder);
    shipRoot = holder;
    wreck = { holder, bow: parts.bow, stern: parts.stern, breakX: parts.breakX };
    spawnBreakDebris(holder, root.userData.ship);
    return holder;
  }

  function spawnBreakDebris(holder, ship) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.7, metalness: 0.5 });
    const white = new THREE.MeshStandardMaterial({ color: 0xd8d2c6, roughness: 0.6 });
    const origin = new THREE.Vector3(wreck?.breakX ?? 0, ship.height * 0.3, 0);
    holder.localToWorld(origin);
    for (let i = 0; i < 16; i++) {
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.2 + Math.random() * 0.5, 0.03 + Math.random() * 0.05, 0.15 + Math.random() * 0.4),
        i % 3 === 0 ? white : mat
      );
      plate.castShadow = true;
      plate.position.copy(origin);
      plate.position.x += (Math.random() - 0.5) * ship.beam;
      plate.position.z += (Math.random() - 0.5) * ship.beam;
      plate.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 3);
      plate.userData.spin = new THREE.Vector3(Math.random() * 3, Math.random(), Math.random() * 3);
      scene.add(plate);
      debris.push(plate);
    }
  }

  function updateBreak(amount) {
    if (!wreck) return;
    const ship = wreck.holder.userData.ship;
    const sep = amount * ship.length * 0.16;
    wreck.bow.position.x = -sep;
    wreck.bow.rotation.z = amount * 0.5;
    wreck.stern.position.x = sep * 0.4;
    wreck.stern.position.y = -amount * ship.height * 0.15;
    wreck.stern.rotation.z = -amount * 0.18;
  }

  function isBroken() {
    return Boolean(wreck);
  }

  function clearWreckFlag() {
    wreck = null;
  }

  function render() {
    const surface = ocean.sampleHeight(camera.position.x, camera.position.z, 0);
    const below = camera.position.y < surface + 0.05;
    if (below && !underWater) {
      scene.fog.color.setHex(0x0b3a48);
      scene.fog.density = 0.05;
      underWater = true;
    } else if (!below && underWater) {
      scene.fog.color.setHex(surfaceFog.color);
      scene.fog.density = surfaceFog.density;
      underWater = false;
    }
    grade.uniforms.uUnderwater.value = underWater ? 1 : 0;
    if (cameraMode !== "chase") controls.update();
    // Refraction source only matters when looking down through the surface.
    if (!underWater) {
      water.visible = false;
      renderer.setRenderTarget(refraction);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      water.visible = true;
    }
    composer.render();
  }

  function buildHazardMesh(kind) {
    const group = new THREE.Group();
    if (kind === "iceberg") {
      group.add(buildIceberg());
    } else if (kind === "mine") {
      const shell = new THREE.MeshStandardMaterial({ color: 0x2b2622, roughness: 0.62, metalness: 0.55 });
      const rust = new THREE.MeshStandardMaterial({ color: 0x5a3421, roughness: 0.85, metalness: 0.25 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 28, 20), shell);
      group.add(body);
      const seam = new THREE.Mesh(new THREE.TorusGeometry(0.555, 0.025, 8, 40), rust);
      seam.rotation.x = Math.PI / 2;
      group.add(seam);
      const hornGeo = new THREE.CylinderGeometry(0.035, 0.07, 0.24, 10);
      const capGeo = new THREE.SphereGeometry(0.045, 10, 8);
      const dirs = [
        [0, 1, 0], [0.7, 0.7, 0], [-0.7, 0.7, 0], [0, 0.7, 0.7], [0, 0.7, -0.7],
        [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
      ];
      for (const d of dirs) {
        const n = new THREE.Vector3(...d).normalize();
        const horn = new THREE.Mesh(hornGeo, rust);
        horn.position.copy(n).multiplyScalar(0.6);
        horn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
        const cap = new THREE.Mesh(capGeo, shell);
        cap.position.copy(n).multiplyScalar(0.72);
        group.add(horn, cap);
      }
    }
    group.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    return group;
  }

  return {
    scene,
    camera,
    controls,
    renderer,
    water,
    wave,
    setShip,
    getShip,
    dimShipLights,
    setCameraMode,
    getCameraMode,
    updateChase,
    setSun,
    setLighting,
    getSun: () => ({ ...currentSun }),
    animateWater,
    sampleWave,
    updateWave,
    syncHazard,
    clearHazard,
    updateEffects,
    releaseStacks,
    updateDebris,
    clearDebris,
    beginBreakup,
    updateBreak,
    isBroken,
    clearWreckFlag,
    setOceanTurbulence,
    render,
    resize,
  };
}

// --- Builders ---

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function vnoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm3(x, y, z, oct = 5) {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    v += amp * (vnoise(x * f + z * 1.7, y * f - z * 0.9) * 0.5 + vnoise(y * f + 3.1, z * f + x * 0.4) * 0.5);
    f *= 2.03;
    amp *= 0.5;
  }
  return v;
}

function buildSeabed() {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(440, 440, 180, 180);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color(0x8f8466);
  const silt = new THREE.Color(0x5b5a4c);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const dunes = Math.sin(x * 0.35 + vnoise(x * 0.05, z * 0.05) * 4) * 0.12;
    const h = (fbm3(x * 0.03, z * 0.03, 0, 4) - 0.5) * 3.2 + dunes;
    pos.setY(i, SEABED_Y + h);
    c.copy(sand).lerp(silt, Math.min(1, Math.max(0, fbm3(x * 0.08, z * 0.08, 5, 3) * 1.4 - 0.2)));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const floor = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })
  );
  floor.receiveShadow = true;
  group.add(floor);

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x4f4b44, roughness: 0.95, flatShading: true });
  for (let i = 0; i < 36; i++) {
    const g = new THREE.IcosahedronGeometry(0.5 + (i % 5) * 0.35, 1);
    const p = g.attributes.position;
    // Non-indexed: key the jitter by position so shared corners move together.
    for (let j = 0; j < p.count; j++) {
      const x = p.getX(j);
      const y = p.getY(j);
      const z = p.getZ(j);
      const k = 0.75 + hash2(x * 3.1 + i, y * 2.7 + z * 1.9) * 0.5;
      p.setXYZ(j, x * k, y * k * 0.6, z * k);
    }
    g.computeVertexNormals();
    const rock = new THREE.Mesh(g, rockMat);
    const ang = i * 2.399;
    const rad = 8 + (i % 7) * 9;
    rock.position.set(Math.cos(ang) * rad, SEABED_Y + 0.1, Math.sin(ang) * rad);
    rock.rotation.set(0, i * 0.7, 0);
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);
  }
  return group;
}

function buildIceberg() {
  const geo = new THREE.IcosahedronGeometry(1, 5);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const white = new THREE.Color(0xf4f9fc);
  const blue = new THREE.Color(0x5fb8d8);
  const wet = new THREE.Color(0x8fd0e0);
  const c = new THREE.Color();
  // Shared vertices in a non-indexed icosahedron: key noise by position so
  // coincident corners move together and the surface stays closed.
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm3(v.x * 1.6 + 4, v.y * 1.6, v.z * 1.6, 5);
    const ridge = 1 - Math.abs(fbm3(v.x * 3.1, v.y * 3.1 + 7, v.z * 3.1, 3) * 2 - 1);
    let r = 0.72 + n * 0.55 + ridge * 0.12;
    // Pinnacle berg: taller spire off-centre, sheer faces, flat-ish base.
    const spire = Math.exp(-((v.x - 0.25) ** 2 + (v.z + 0.1) ** 2) * 2.2) * 0.55;
    v.multiplyScalar(r);
    v.y = v.y > 0 ? v.y * (1.15 + spire * 1.4) : v.y * 1.4;
    v.x *= 3.3;
    v.z *= 2.6;
    v.y *= 2.5;
    pos.setXYZ(i, v.x, v.y, v.z);
    const crevice = Math.min(1, Math.max(0, (0.95 - r) * 2.2));
    c.copy(white).lerp(blue, crevice * 0.85);
    if (v.y < 0.6) c.lerp(wet, Math.min(1, (0.6 - v.y) * 0.8));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.5,
    sheen: 0.4,
    sheenColor: new THREE.Color(0x9fdcf0),
    flatShading: true,
  });
  const berg = new THREE.Mesh(geo, mat);
  berg.position.y = 0.4;
  return berg;
}

function buildTsunami() {
  const width = 46;
  const cols = 140;
  const rows = 36;
  const H = 6.5;
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const deep = new THREE.Color(0x0a3544);
  const face = new THREE.Color(0x1f7f86);
  const foam = new THREE.Color(0xe9f3f6);
  const c = new THREE.Color();
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const x = (u - 0.5) * width;
      const env = Math.pow(Math.cos((u - 0.5) * Math.PI), 0.6);
      // Profile: long back slope → steep face → lip curling forward (−Z).
      const ang = v * Math.PI * 1.15;
      const r = H * env;
      let y;
      let z;
      if (ang <= Math.PI * 0.5) {
        y = Math.sin(ang) * r;
        z = -(1 - Math.cos(ang)) * r * 0.35;
      } else {
        const t = (ang - Math.PI * 0.5) / (Math.PI * 0.65);
        y = r - (1 - Math.cos(t * Math.PI * 0.5)) * r * 0.45;
        z = -r * 0.35 - Math.sin(t * Math.PI * 0.5) * r * 0.55;
      }
      const wob = vnoise(x * 0.35, v * 3) * 0.5;
      positions.push(x, y + wob * env, z - wob * 0.6 + r * 0.6);
      uvs.push(x / 9, v * 2.5);
      const lip = Math.min(1, Math.max(0, (v - 0.72) / 0.18)) * (0.6 + vnoise(x * 0.9, v * 6) * 0.6);
      c.copy(deep).lerp(face, Math.min(1, v * 1.4)).lerp(foam, Math.min(1, lip) * env);
      colors.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i;
      const b = a + 1;
      const d = a + cols + 1;
      const e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.18,
    metalness: 0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
    sheen: 0.6,
    sheenColor: new THREE.Color(0x3fb6a8),
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.userData.width = width;
  mesh.userData.lip = new THREE.Vector3(0, H * 0.85, -H * 0.35);
  mesh.userData.spray = [];
  return mesh;
}

function disposeObject(obj) {
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material.dispose();
    }
  });
}
