import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createSky } from "./sky.js";
import { createOcean } from "./water.js";
import { SEABED_Y, bowDirection, starboardDirection } from "./physics.js";
import { splitShip } from "./shipMesh.js";

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xb8d0e0, 0.005);

  const camera = new THREE.PerspectiveCamera(
    48,
    window.innerWidth / window.innerHeight,
    0.1,
    600
  );
  camera.position.set(18, 10, 22);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 4;
  controls.maxDistance = 100;
  controls.target.set(0, 0.5, 0);

  // Procedural sky + env map
  const skyCtl = createSky(renderer, scene);
  skyCtl.setSunElevation(16, 220);

  // Lighting — sun tracks the sky's sun direction
  const hemi = new THREE.HemisphereLight(0xc8e0f5, 0x1a3040, 0.45);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  function syncSun() {
    const dir = skyCtl.sunDirection(currentSun.elev, currentSun.azim);
    sun.position.copy(dir).multiplyScalar(60);
    sun.target.position.set(0, 0, 0);
    sun.target.updateMatrixWorld();
    const elev = currentSun.elev;
    if (elev < 5) sun.color.setHex(0xffa060);
    else if (elev < 20) sun.color.setHex(0xffe0b0);
    else if (elev < 45) sun.color.setHex(0xfff5d8);
    else sun.color.setHex(0xffffff);
    ocean.setSunDirection(dir);
  }
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 160;
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(0xa0c4e8, 0.45);
  fill.position.set(-30, 20, -20);
  scene.add(fill);

  const currentSun = { elev: 16, azim: 220 };

  // Ocean — Gerstner waves + custom shader, reflects sky cubemap
  const ocean = createOcean({
    size: 260,
    segments: 220,
    envMap: skyCtl.getCubeRT(),
    hullRadius: 5.0,
  });
  ocean.setSunDirection(skyCtl.sunDirection(16, 220));
  scene.add(ocean.mesh);
  const water = ocean.mesh;

  syncSun();

  // Backdrop underwater plane — only visible where ocean doesn't render
  const deep = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshBasicMaterial({ color: 0x021018 })
  );
  deep.rotation.x = -Math.PI / 2;
  deep.position.y = SEABED_Y - 12;
  scene.add(deep);

  const seabed = new THREE.Group();
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 420, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xc2b48a, roughness: 0.95, metalness: 0 })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = SEABED_Y;
  sand.receiveShadow = true;
  seabed.add(sand);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6e675c, roughness: 0.9 });
  for (let i = 0; i < 28; i++) {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.6 + (i % 5) * 0.35, 0),
      rockMat
    );
    const ang = i * 2.399;
    const rad = 8 + (i % 7) * 9;
    rock.position.set(Math.cos(ang) * rad, SEABED_Y + 0.3, Math.sin(ang) * rad);
    rock.rotation.set(i, i * 0.7, 0);
    rock.castShadow = true;
    rock.receiveShadow = true;
    seabed.add(rock);
  }
  scene.add(seabed);

  // Dock
  const dock = new THREE.Group();
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.45, 3.5),
    new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.88 })
  );
  pier.position.set(-24, 0.35, 16);
  pier.castShadow = true;
  pier.receiveShadow = true;
  dock.add(pier);
  for (const px of [-3.5, -1.2, 1.2, 3.5]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.16, 1.4, 10),
      new THREE.MeshStandardMaterial({ color: 0x3d2914 })
    );
    post.position.set(-24 + px * 0.15, 1.0, 17.4);
    post.castShadow = true;
    dock.add(post);
  }
  scene.add(dock);

  // Tsunami wave — a short curved crest, not a flat wall
  const waveGeo = new THREE.PlaneGeometry(22, 6.5, 48, 10);
  {
    const wp = waveGeo.attributes.position;
    for (let i = 0; i < wp.count; i++) {
      const x = wp.getX(i);
      const y = wp.getY(i);
      const crest = Math.cos((x / 11) * Math.PI * 0.5) * 1.6 * Math.max(0, (y + 3.25) / 6.5);
      wp.setZ(i, crest);
      wp.setY(i, y + crest * 0.45);
    }
    waveGeo.computeVertexNormals();
  }
  const waveMat = new THREE.MeshStandardMaterial({
    color: 0x1c6f96,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
    roughness: 0.18,
    metalness: 0.04,
  });
  const wave = new THREE.Mesh(waveGeo, waveMat);
  wave.position.y = 3.2;
  wave.visible = false;
  scene.add(wave);

  // Smoke particles
  const smokeCount = 120;
  const smokePos = new Float32Array(smokeCount * 3);
  const smokeGeo = new THREE.BufferGeometry();
  smokeGeo.setAttribute("position", new THREE.BufferAttribute(smokePos, 3));
  const smokeTex = smokeSprite();
  const smokeMat = new THREE.PointsMaterial({
    color: 0x9aa0a6,
    size: 1.6,
    map: smokeTex,
    alphaMap: smokeTex,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const smoke = new THREE.Points(smokeGeo, smokeMat);
  smoke.visible = false;
  scene.add(smoke);

  let shipRoot = null;
  let cameraMode = "orbit";
  let wreck = null;
  const debris = [];
  let hazardRoot = null;
  const surfaceFog = { color: scene.fog.color.getHex(), density: scene.fog.density };
  let underWater = false;

  const _chase = new THREE.Vector3();
  const _look = new THREE.Vector3();
  const _sunAt = new THREE.Vector3();
  let visualDt = 0.016;

  function setSun(elev, azim) {
    currentSun.elev = elev;
    currentSun.azim = azim;
    skyCtl.setSunElevation(elev, azim);
    syncSun();
  }

  function setShip(root) {
    if (shipRoot) {
      scene.remove(shipRoot);
      disposeObject(shipRoot);
    }
    wreck = null;
    shipRoot = root;
    if (root) scene.add(root);
  }

  function getShip() {
    return shipRoot;
  }

  function setCameraMode(mode) {
    cameraMode = mode;
    controls.enabled = mode !== "chase";
    if (mode === "dock") {
      camera.position.set(-20, 4.5, 18);
      controls.target.set(0, 1, 0);
      controls.update();
    }
  }

  function updateChase(pos, yaw) {
    if (cameraMode !== "chase") return;
    const bow = bowDirection(yaw);
    const dist = 18;
    const height = pos.y < -2 ? 5.5 : 8;
    _chase.set(pos.x - bow.x * dist, pos.y + height, pos.z - bow.z * dist);
    camera.position.lerp(_chase, 0.12);
    _look.set(pos.x, pos.y + 0.6, pos.z);
    controls.target.lerp(_look, 0.18);
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
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(w, h);
  }

  window.addEventListener("resize", resize);

  function animateWater(dt, shipPos) {
    visualDt = dt;
    ocean.update(dt, camera);
    if (shipPos) {
      ocean.setHullPosition(shipPos);
      ocean.setOrigin(shipPos.x, shipPos.z);
      seabed.position.x = shipPos.x;
      seabed.position.z = shipPos.z;
      deep.position.x = shipPos.x;
      deep.position.z = shipPos.z;
      const dir = skyCtl.sunDirection(currentSun.elev, currentSun.azim);
      _sunAt.set(shipPos.x, 0, shipPos.z);
      sun.position.copy(dir).multiplyScalar(80).add(_sunAt);
      sun.target.position.copy(_sunAt);
      sun.target.updateMatrixWorld();
    }
  }

  function setOceanTurbulence(level) {
    ocean.setTurbulence(level);
  }

  function updateWave(hazard, time) {
    if (!hazard || hazard.kind !== "tsunami" || hazard.resolved) {
      wave.visible = false;
      return;
    }
    wave.visible = true;
    const p = Math.min(1, Math.max(0, hazard.phase));
    const side = hazard.side || 1;
    const right = starboardDirection(hazard.yaw);
    const approach = (1 - p) * 26;
    wave.position.set(
      hazard.position.x + right.x * side * approach,
      3.1 + Math.sin(p * Math.PI) * 0.8,
      hazard.position.z + right.z * side * approach
    );
    wave.rotation.y = hazard.yaw + (side > 0 ? 0 : Math.PI);
    wave.scale.y = 0.85 + Math.sin(p * Math.PI) * 0.45;
    wave.material.opacity = 0.8 * (1 - Math.max(0, p - 0.88) / 0.12);
    wave.rotation.z = Math.sin(time * 1.4) * 0.04;
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
    const bob = hazard.kind === "mine" ? Math.sin(time * 2.2) * 0.12 : 0;
    hazardRoot.position.set(hazard.position.x, hazard.position.y + bob, hazard.position.z);
    hazardRoot.rotation.y = time * (hazard.kind === "mine" ? 0.4 : 0.05);
  }

  function clearHazard() {
    if (!hazardRoot) return;
    scene.remove(hazardRoot);
    disposeObject(hazardRoot);
    hazardRoot = null;
  }

  const funnelTops = [];
  const smokeAge = new Float32Array(smokeCount);
  smokeAge.fill(99);

  function updateSmoke(state, shipMesh) {
    const steaming = state && shipMesh && (state.speed > 0.4 || state.explosionFlash > 0 || state.breachesOpened);
    smoke.visible = Boolean(steaming);
    if (!smoke.visible) return;

    shipMesh.updateMatrixWorld(true);
    for (const piece of debris) piece.updateMatrixWorld(true);

    funnelTops.length = 0;
    const topsFrom = (obj) => {
      obj.traverse((child) => {
        if (child.name !== "funnel") return;
        const top = child.localToWorld(new THREE.Vector3(0, child.userData.topY || 2, 0));
        if (top.y > SEABED_Y + 0.5) funnelTops.push(top);
      });
    };
    topsFrom(shipMesh);
    for (const piece of debris) topsFrom(piece);

    if (funnelTops.length === 0 && shipMesh) {
      funnelTops.push(shipMesh.localToWorld(new THREE.Vector3(0, state.ship.height, 0)));
    }

    const positions = smoke.geometry.attributes.position.array;
    const fire = (state.explosionFlash || 0) > 0.05 || state.breachesOpened;
    const life = 2.4;
    for (let i = 0; i < smokeCount; i++) {
      smokeAge[i] += visualDt;
      if (smokeAge[i] > life) {
        smokeAge[i] = Math.random() * life;
        const top = funnelTops[i % funnelTops.length];
        positions[i * 3] = top.x + (Math.random() - 0.5) * 0.3;
        positions[i * 3 + 1] = top.y;
        positions[i * 3 + 2] = top.z + (Math.random() - 0.5) * 0.3;
      } else {
        positions[i * 3] += 0.15 * 0.016;
        positions[i * 3 + 1] += (0.9 + (fire ? 0.8 : 0)) * 0.016 * 8;
        positions[i * 3 + 2] += Math.sin(smokeAge[i] * 3 + i) * 0.01;
      }
    }
    smoke.geometry.attributes.position.needsUpdate = true;
    smokeMat.color.setHex(fire ? 0x4a4a4a : 0x9aa0a6);
    smokeMat.opacity = fire ? 0.62 : 0.38;
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
    scene.add(holder);
    shipRoot = holder;
    wreck = { holder, bow: parts.bow, stern: parts.stern };
    spawnBreakDebris(holder, root.userData.ship);
    return holder;
  }

  function spawnBreakDebris(holder, ship) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a8175, roughness: 0.7, metalness: 0.4 });
    const origin = new THREE.Vector3();
    holder.getWorldPosition(origin);
    for (let i = 0; i < 10; i++) {
      const bit = new THREE.Mesh(
        new THREE.BoxGeometry(0.25 + Math.random() * 0.45, 0.12, 0.2 + Math.random() * 0.3),
        mat
      );
      bit.position.copy(origin);
      bit.position.x += (Math.random() - 0.5) * ship.beam;
      bit.position.y += ship.height * 0.3;
      bit.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random(), (Math.random() - 0.5) * 3);
      bit.userData.spin = new THREE.Vector3(Math.random(), Math.random(), Math.random());
      scene.add(bit);
      debris.push(bit);
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
    const below = camera.position.y < 0.15;
    if (below && !underWater) {
      surfaceFog.color = scene.fog.color.getHex();
      surfaceFog.density = scene.fog.density;
      scene.fog.color.setHex(0x062433);
      scene.fog.density = 0.055;
      underWater = true;
    } else if (!below && underWater) {
      scene.fog.color.setHex(surfaceFog.color);
      scene.fog.density = surfaceFog.density;
      underWater = false;
    }
    if (cameraMode !== "chase") controls.update();
    renderer.render(scene, camera);
  }

  function buildHazardMesh(kind) {
    const group = new THREE.Group();
    if (kind === "iceberg") {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xd7eef8,
        roughness: 0.35,
        metalness: 0.05,
        emissive: 0x123044,
        emissiveIntensity: 0.15,
      });
      const a = new THREE.Mesh(new THREE.DodecahedronGeometry(3.2, 0), mat);
      a.scale.set(1.1, 1.6, 0.85);
      a.position.y = 1.5;
      const b = new THREE.Mesh(new THREE.DodecahedronGeometry(1.8, 0), mat);
      b.position.set(2.1, 0.6, 0.8);
      b.scale.set(1, 1.3, 1);
      const c = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3, 0), mat);
      c.position.set(-1.8, 0.4, -0.6);
      group.add(a, b, c);
    } else if (kind === "mine") {
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 18, 14),
        new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.45, metalness: 0.7 })
      );
      group.add(body);
      const hornMat = new THREE.MeshStandardMaterial({ color: 0x2a2e34, metalness: 0.6, roughness: 0.4 });
      for (let i = 0; i < 6; i++) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.38, 6), hornMat);
        const phi = (i / 6) * Math.PI * 2;
        horn.position.set(Math.cos(phi) * 0.5, Math.sin(i) * 0.28, Math.sin(phi) * 0.5);
        horn.lookAt(horn.position.x * 2, horn.position.y * 2, horn.position.z * 2);
        group.add(horn);
      }
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.1, 0.03, 6, 24),
        new THREE.MeshBasicMaterial({ color: 0xe8d7a0 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.35;
      group.add(ring);
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
    smoke,
    setShip,
    getShip,
    setCameraMode,
    getCameraMode,
    updateChase,
    setSun,
    getSun: () => ({ ...currentSun }),
    animateWater,
    updateWave,
    syncHazard,
    clearHazard,
    updateSmoke,
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

function smokeSprite() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, "rgba(255,255,255,0.85)");
  grd.addColorStop(0.45, "rgba(255,255,255,0.35)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
