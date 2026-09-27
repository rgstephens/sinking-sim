import * as THREE from "three";

/**
 * CPU-simulated billboard particles: coal smoke, steam, fire, spray, bubbles.
 *
 * Each pool is one THREE.Points with a small shader that sizes points in
 * world units, rotates the sprite, fades by per-particle alpha, and takes fog.
 * Emission rules live in createEffects(); the pools only integrate motion.
 */

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aRot;
  attribute vec3 aColor;
  uniform float uScale;
  varying float vAlpha;
  varying float vRot;
  varying vec3 vColor;
  #include <fog_pars_vertex>
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize * uScale / max(0.1, -mvPosition.z);
    vAlpha = aAlpha;
    vRot = aRot;
    vColor = aColor;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying float vAlpha;
  varying float vRot;
  varying vec3 vColor;
  #include <fog_pars_fragment>
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float c = cos(vRot), s = sin(vRot);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
    vec4 t = texture2D(uMap, p);
    float a = t.a * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor * t.rgb, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function makePool(max, map, blending) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3);
  const size = new Float32Array(max);
  const alpha = new Float32Array(max);
  const rot = new Float32Array(max);
  const color = new Float32Array(max * 3);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("aRot", new THREE.BufferAttribute(rot, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("aColor", new THREE.BufferAttribute(color, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);

  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uMap: { value: null }, uScale: { value: 600 } },
    ]),
    transparent: true,
    depthWrite: false,
    blending,
    fog: true,
  });
  mat.uniforms.uMap.value = map;

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  // Particle state (structure of arrays)
  const P = {
    n: 0,
    px: new Float32Array(max), py: new Float32Array(max), pz: new Float32Array(max),
    vx: new Float32Array(max), vy: new Float32Array(max), vz: new Float32Array(max),
    age: new Float32Array(max), life: new Float32Array(max),
    s0: new Float32Array(max), s1: new Float32Array(max),
    a0: new Float32Array(max), rot: new Float32Array(max), spin: new Float32Array(max),
    r: new Float32Array(max), g: new Float32Array(max), b: new Float32Array(max),
    grav: new Float32Array(max), drag: new Float32Array(max), wind: new Float32Array(max),
    kill: new Int8Array(max), // 0 none, 1 die above water, 2 die below water
  };

  function emit(o) {
    if (P.n >= max) return;
    const i = P.n++;
    P.px[i] = o.x; P.py[i] = o.y; P.pz[i] = o.z;
    P.vx[i] = o.vx ?? 0; P.vy[i] = o.vy ?? 0; P.vz[i] = o.vz ?? 0;
    P.age[i] = 0;
    P.life[i] = o.life;
    P.s0[i] = o.size0;
    P.s1[i] = o.size1 ?? o.size0;
    P.a0[i] = o.alpha ?? 1;
    P.rot[i] = Math.random() * Math.PI * 2;
    P.spin[i] = (Math.random() - 0.5) * (o.spin ?? 0.4);
    P.r[i] = o.color.r; P.g[i] = o.color.g; P.b[i] = o.color.b;
    P.grav[i] = o.gravity ?? 0;
    P.drag[i] = o.drag ?? 0.5;
    P.wind[i] = o.wind ?? 0;
    P.kill[i] = o.kill ?? 0;
  }

  function copy(dst, src) {
    for (const k of Object.keys(P)) {
      if (k === "n") continue;
      P[k][dst] = P[k][src];
    }
  }

  function update(dt, wind) {
    let i = 0;
    while (i < P.n) {
      P.age[i] += dt;
      const dead =
        P.age[i] >= P.life[i] ||
        (P.kill[i] === 1 && P.py[i] > -0.03) ||
        (P.kill[i] === 2 && P.py[i] < -0.05 && P.vy[i] < 0);
      if (dead) {
        P.n--;
        if (i !== P.n) copy(i, P.n);
        continue;
      }
      const damp = Math.exp(-P.drag[i] * dt);
      P.vx[i] = P.vx[i] * damp + wind.x * P.wind[i] * dt;
      P.vz[i] = P.vz[i] * damp + wind.z * P.wind[i] * dt;
      P.vy[i] = P.vy[i] * damp + P.grav[i] * dt;
      P.px[i] += P.vx[i] * dt;
      P.py[i] += P.vy[i] * dt;
      P.pz[i] += P.vz[i] * dt;
      P.rot[i] += P.spin[i] * dt;
      i++;
    }

    const pos = geo.attributes.position.array;
    const col = geo.attributes.aColor.array;
    for (let j = 0; j < P.n; j++) {
      const t = P.age[j] / P.life[j];
      pos[j * 3] = P.px[j];
      pos[j * 3 + 1] = P.py[j];
      pos[j * 3 + 2] = P.pz[j];
      size[j] = P.s0[j] + (P.s1[j] - P.s0[j]) * Math.sqrt(t);
      const fadeIn = Math.min(1, t / 0.08);
      const fadeOut = 1 - t * t;
      alpha[j] = P.a0[j] * fadeIn * fadeOut;
      rot[j] = P.rot[j];
      col[j * 3] = P.r[j];
      col[j * 3 + 1] = P.g[j];
      col[j * 3 + 2] = P.b[j];
    }
    for (const name of ["position", "aSize", "aAlpha", "aRot", "aColor"]) {
      geo.attributes[name].needsUpdate = true;
    }
    geo.setDrawRange(0, P.n);
  }

  function clear() {
    P.n = 0;
    geo.setDrawRange(0, 0);
  }

  return { points, material: mat, emit, update, clear, count: () => P.n };
}

// --- Sprites ---

function puffTexture() {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  let s = 17;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // Billowy puff: many soft blobs inside a round envelope, lit from above.
  for (let i = 0; i < 38; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * size * 0.26;
    const x = size / 2 + Math.cos(a) * r;
    const y = size / 2 + Math.sin(a) * r;
    const rad = size * (0.1 + rnd() * 0.16);
    const shade = 200 + Math.round((1 - (y / size)) * 55);
    const grd = g.createRadialGradient(x, y - rad * 0.3, rad * 0.1, x, y, rad);
    grd.addColorStop(0, `rgba(${shade},${shade},${shade},0.32)`);
    grd.addColorStop(1, `rgba(${shade - 40},${shade - 40},${shade - 40},0)`);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function softDot(inner = "rgba(255,255,255,1)", mid = 0.35) {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, inner);
  grd.addColorStop(mid, "rgba(255,255,255,0.55)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function bubbleTexture() {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.strokeStyle = "rgba(220,240,255,0.9)";
  g.lineWidth = 3;
  g.beginPath();
  g.arc(32, 32, 24, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.8)";
  g.beginPath();
  g.arc(24, 22, 6, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- Effects controller ---

const COAL = new THREE.Color(0x4d4843);
const COAL_LIGHT = new THREE.Color(0x77716a);
const STEAM = new THREE.Color(0xe8ecef);
const FIRE_HOT = new THREE.Color(0xffc070);
const FIRE = new THREE.Color(0xff6a1a);
const SPRAY = new THREE.Color(0xeef5f8);
const BUBBLE = new THREE.Color(0xcfe8f5);
const _c = new THREE.Color();
const _v = new THREE.Vector3();

export function createEffects(scene) {
  const smoke = makePool(2600, puffTexture(), THREE.NormalBlending);
  const fire = makePool(900, softDot("rgba(255,255,255,1)", 0.25), THREE.AdditiveBlending);
  const spray = makePool(1800, softDot("rgba(255,255,255,0.9)", 0.5), THREE.NormalBlending);
  const bubbles = makePool(900, bubbleTexture(), THREE.NormalBlending);
  scene.add(smoke.points, spray.points, bubbles.points, fire.points);
  // Draw order: smoke over spray, fire last (additive).
  spray.points.renderOrder = 1;
  bubbles.points.renderOrder = 1;
  smoke.points.renderOrder = 2;
  fire.points.renderOrder = 3;

  const flashLight = new THREE.PointLight(0xff8a3a, 0, 60, 2);
  scene.add(flashLight);

  const funnelAcc = new Map();
  let sprayAcc = 0;
  let bubbleAcc = 0;
  let fireAcc = 0;
  let lastFlash = 0;
  let sunTint = new THREE.Color(1, 1, 1);

  function setViewport(heightPx, fovDeg) {
    const scale = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
    for (const p of [smoke, fire, spray, bubbles]) p.material.uniforms.uScale.value = scale;
  }

  function setLight(ambient, sunColor) {
    // Pre-light smoke colours so a golden-hour plume is warm, a storm one grey.
    sunTint.copy(sunColor).lerp(ambient, 0.45);
  }

  function lit(base, lift = 0) {
    return _c.copy(base).lerp(COAL_LIGHT, lift).multiply(sunTint);
  }

  function funnelTops(root, out) {
    root.updateMatrixWorld(true);
    root.traverse((child) => {
      if (child.name !== "funnel" || child.userData.dummy) return;
      const top = child.localToWorld(new THREE.Vector3(0, child.userData.topY || 2, 0));
      out.push({ top, stack: child });
    });
  }

  function emitSmoke(p, vel, strength, dark = true) {
    const base = dark ? COAL : STEAM;
    smoke.emit({
      x: p.x + (Math.random() - 0.5) * 0.25,
      y: p.y + Math.random() * 0.1,
      z: p.z + (Math.random() - 0.5) * 0.25,
      vx: vel.x + (Math.random() - 0.5) * 0.3,
      vy: 1.1 + Math.random() * 0.6 + strength * 0.8,
      vz: vel.z + (Math.random() - 0.5) * 0.3,
      life: 8 + Math.random() * 4,
      size0: 0.45 + strength * 0.2,
      size1: 2.6 + Math.random() * 1.8 + strength * 1.2,
      alpha: dark ? 0.3 : 0.32,
      color: lit(base, dark ? Math.random() * 0.4 : 0),
      gravity: 0.05,
      drag: 0.55,
      wind: 0.9,
      spin: 0.5,
    });
  }

  function explosion(at, underwater) {
    for (let i = 0; i < 90; i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize();
      const sp = 1.5 + Math.random() * 4;
      fire.emit({
        x: at.x, y: Math.max(at.y, 0.1), z: at.z,
        vx: _v.x * sp, vy: _v.y * sp, vz: _v.z * sp,
        life: 0.5 + Math.random() * 0.9,
        size0: 0.8 + Math.random() * 1.2,
        size1: 2.4 + Math.random() * 2.5,
        alpha: 0.9,
        color: Math.random() < 0.4 ? FIRE_HOT : FIRE,
        gravity: -0.4,
        drag: 2.2,
      });
    }
    for (let i = 0; i < 70; i++) {
      smoke.emit({
        x: at.x + (Math.random() - 0.5), y: Math.max(at.y, 0.2), z: at.z + (Math.random() - 0.5),
        vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 3, vz: (Math.random() - 0.5) * 3,
        life: 5 + Math.random() * 5,
        size0: 1.2, size1: 6 + Math.random() * 4,
        alpha: 0.85,
        color: lit(COAL, 0.1),
        drag: 1.2, wind: 0.8, gravity: 0.1,
      });
    }
    // A mine throws up a column of white water.
    const column = underwater ? 420 : 160;
    for (let i = 0; i < column; i++) {
      const r = Math.random() * (underwater ? 1.2 : 2.5);
      const a = Math.random() * Math.PI * 2;
      const up = underwater ? 5 + Math.random() * 7 : 2 + Math.random() * 3;
      spray.emit({
        x: at.x + Math.cos(a) * r, y: 0.05, z: at.z + Math.sin(a) * r,
        vx: Math.cos(a) * (0.4 + Math.random() * 1.8),
        vy: up,
        vz: Math.sin(a) * (0.4 + Math.random() * 1.8),
        life: 2.5 + Math.random() * 1.5,
        size0: 0.35 + Math.random() * 0.4,
        size1: 1.4 + Math.random() * 1.6,
        alpha: 0.85,
        color: SPRAY,
        gravity: -2.2,
        drag: 0.35,
        kill: 2,
      });
    }
  }

  function breachPoints(root) {
    const pts = [];
    root.traverse((o) => {
      if (o.name === "breach") pts.push(o.getWorldPosition(new THREE.Vector3()));
    });
    return pts;
  }

  /**
   * ctx: { state, ship (mesh), debris [], wind {x,z}, dt }
   */
  function update(dt, ctx) {
    const { state, ship: root, debris = [], wind } = ctx;

    if (state && root && dt > 0) {
      const fl = state.explosionFlash || 0;
      const ship = state.ship;

      // Funnel smoke
      const tops = [];
      funnelTops(root, tops);
      for (const piece of debris) funnelTops(piece, tops);
      const bowDir = { x: -Math.cos(state.rotation.yaw), z: Math.sin(state.rotation.yaw) };
      const shipVel = { x: bowDir.x * state.speed * 0.25, z: bowDir.z * state.speed * 0.25 };
      const firing = state.throttle > 0.05 && !state.onSeabed;
      for (const { top, stack } of tops) {
        if (top.y < 0.3) continue;
        const attached = !stack.userData.falling;
        const strength = attached ? Math.max(0, state.throttle) : 0.3;
        let rate = attached ? (firing ? 3 + strength * 7 : 1.5) : 3;
        if (state.breachesOpened && attached) rate += 6;
        const acc = (funnelAcc.get(stack) || 0) + rate * dt;
        const n = Math.floor(acc);
        funnelAcc.set(stack, acc - n);
        const steam = state.disaster?.id === "boiler" && state.breachesOpened && Math.random() < 0.5;
        for (let i = 0; i < n; i++) emitSmoke(top, attached ? shipVel : { x: 0, z: 0 }, strength, !steam);
      }

      // Explosion burst on the rising edge of the flash
      if (fl > 0.9 && lastFlash <= 0.9) {
        const pts = breachPoints(root);
        const at = pts[0] || root.getWorldPosition(new THREE.Vector3());
        explosion(at, state.disaster?.id === "mine");
      }
      lastFlash = fl;

      // Lingering fire at the breach after a blast, until the sea puts it out
      if (state.disaster?.explosion && state.breachesOpened) {
        const pts = breachPoints(root);
        fireAcc += dt * 26;
        while (fireAcc >= 1) {
          fireAcc -= 1;
          const p = pts[Math.floor(Math.random() * pts.length)];
          if (!p) break;
          const deckY = Math.max(p.y + ship.height * 0.55, 0.15);
          if (deckY < 0.2) break;
          fire.emit({
            x: p.x + (Math.random() - 0.5) * 0.6, y: deckY, z: p.z + (Math.random() - 0.5) * 0.6,
            vx: 0, vy: 0.8 + Math.random(), vz: 0,
            life: 0.5 + Math.random() * 0.5,
            size0: 0.6, size1: 1.4,
            alpha: 0.6 * (0.3 + Math.random()),
            color: Math.random() < 0.3 ? FIRE_HOT : FIRE,
            drag: 1.5, wind: 0.5,
          });
          if (Math.random() < 0.35) {
            smoke.emit({
              x: p.x, y: deckY + 0.4, z: p.z,
              vx: 0, vy: 1.2, vz: 0,
              life: 6 + Math.random() * 3,
              size0: 0.8, size1: 5,
              alpha: 0.7,
              color: lit(COAL, 0),
              drag: 0.6, wind: 0.9,
            });
          }
        }
      }

      // Bow spray when making way
      const pos = root.position;
      if (state.speed > 1.2 && pos.y > -0.6) {
        sprayAcc += dt * (state.speed - 1.2) * 14;
        const L = ship.length;
        const stbd = { x: Math.sin(state.rotation.yaw), z: Math.cos(state.rotation.yaw) };
        while (sprayAcc >= 1) {
          sprayAcc -= 1;
          const side = Math.random() < 0.5 ? -1 : 1;
          const back = 0.43 + Math.random() * 0.04;
          const bx = pos.x + bowDir.x * L * back + stbd.x * side * 0.25;
          const bz = pos.z + bowDir.z * L * back + stbd.z * side * 0.25;
          const out = 0.8 + Math.random() * 1.5;
          spray.emit({
            x: bx, y: 0.05, z: bz,
            vx: stbd.x * side * out + bowDir.x * state.speed * 0.4,
            vy: 0.6 + Math.random() * 1.2,
            vz: stbd.z * side * out + bowDir.z * state.speed * 0.4,
            life: 1.1 + Math.random() * 0.6,
            size0: 0.18, size1: 0.9 + Math.random() * 0.6,
            alpha: 0.55,
            color: SPRAY,
            gravity: -2.4,
            drag: 0.6,
            kill: 2,
          });
        }
      }

      // Air escaping a flooding hull once it is under
      if (state.breachesOpened && pos.y < -0.4 && !state.onSeabed) {
        bubbleAcc += dt * 45;
      } else if (state.onSeabed) {
        bubbleAcc += dt * 6;
      }
      while (bubbleAcc >= 1) {
        bubbleAcc -= 1;
        _v.set(
          (Math.random() - 0.5) * ship.length * 0.8,
          ship.height * (0.2 + Math.random() * 0.6),
          (Math.random() - 0.5) * ship.beam * 0.6
        );
        root.localToWorld(_v);
        if (_v.y > -0.1) continue;
        bubbles.emit({
          x: _v.x, y: _v.y, z: _v.z,
          vx: (Math.random() - 0.5) * 0.2, vy: 0.9 + Math.random() * 1.2, vz: (Math.random() - 0.5) * 0.2,
          life: 20,
          size0: 0.06 + Math.random() * 0.14,
          size1: 0.2 + Math.random() * 0.2,
          alpha: 0.7,
          color: BUBBLE,
          drag: 0.4,
          gravity: 0.3,
          kill: 1,
        });
      }

      // Blast lights the hull and water
      const pts = fl > 0.02 ? breachPoints(root) : null;
      if (pts && pts[0]) {
        flashLight.position.copy(pts[0]);
        flashLight.position.y = Math.max(0.5, pts[0].y + ship.height * 0.6);
      }
      flashLight.intensity = fl > 0.02 ? fl * 900 * (0.8 + Math.random() * 0.4) : 0;
    }

    for (const p of ctx.waveSpray || []) {
      spray.emit({
        x: p.x, y: p.y, z: p.z,
        vx: (Math.random() - 0.5) * 1.5, vy: 0.5 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 1.5,
        life: 1.2 + Math.random(),
        size0: 0.5, size1: 2.2 + Math.random() * 1.5,
        alpha: 0.5,
        color: SPRAY,
        gravity: -1.6,
        drag: 0.8,
        wind: 1.5,
        kill: 2,
      });
    }

    const w = wind || { x: 0.6, z: 0.3 };
    smoke.update(dt, w);
    fire.update(dt, w);
    spray.update(dt, w);
    bubbles.update(dt, w);
  }

  function clear() {
    smoke.clear();
    fire.clear();
    spray.clear();
    bubbles.clear();
    funnelAcc.clear();
    flashLight.intensity = 0;
    lastFlash = 0;
  }

  return { update, clear, setViewport, setLight };
}
