import {
  WHEEL_HARD_OVER,
  ENGINE_ORDERS,
  wheelAngleToHelm,
  helmToWheelAngle,
  orderDialAngle,
  dialAngleToOrderIndex,
  throttleToDialAngle,
} from "./bridge.js";

/**
 * On-screen bridge controls: a teak ship's wheel and a brass engine-order
 * telegraph, both SVG, both dragged with pointer events so mouse, pen and
 * touch behave the same. A drag that starts on either control never reaches
 * the camera controls on the canvas beneath.
 */

const SVG = "http://www.w3.org/2000/svg";
const DEG = 180 / Math.PI;

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

function polar(r, deg) {
  const a = (deg * Math.PI) / 180;
  return [r * Math.sin(a), -r * Math.cos(a)];
}

function arcPath(r, fromDeg, toDeg) {
  const [x0, y0] = polar(r, fromDeg);
  const [x1, y1] = polar(r, toDeg);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  const sweep = toDeg > fromDeg ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} ${sweep} ${x1} ${y1}`;
}

/** Pointer angle around the centre of `node`, radians, clockwise from +x. */
function pointerAngle(node, e) {
  const r = node.getBoundingClientRect();
  const dx = e.clientX - (r.left + r.width / 2);
  const dy = e.clientY - (r.top + r.height / 2);
  return { a: Math.atan2(dy, dx), dist: Math.hypot(dx, dy), dx, dy };
}

/** Keep a drag on the control: capture, no scrolling, no camera orbit. */
function grab(node, { down, move, up }) {
  let id = null;
  node.addEventListener("pointerdown", (e) => {
    if (id !== null) return;
    id = e.pointerId;
    node.setPointerCapture(id);
    e.preventDefault();
    e.stopPropagation();
    node.classList.add("dragging");
    down(e);
  });
  node.addEventListener("pointermove", (e) => {
    if (e.pointerId !== id) return;
    e.preventDefault();
    move(e);
  });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    node.classList.remove("dragging");
    up(e);
  };
  node.addEventListener("pointerup", end);
  node.addEventListener("pointercancel", end);
  node.addEventListener("contextmenu", (e) => e.preventDefault());
}

function defs(svg) {
  const d = el("defs", {}, svg);
  const brass = el("radialGradient", { id: "brass", cx: "35%", cy: "30%", r: "80%" }, d);
  el("stop", { offset: "0%", "stop-color": "#fff1b8" }, brass);
  el("stop", { offset: "45%", "stop-color": "#d4a64a" }, brass);
  el("stop", { offset: "100%", "stop-color": "#6e4d17" }, brass);
  const teak = el("linearGradient", { id: "teak", x1: "0", y1: "0", x2: "1", y2: "1" }, d);
  el("stop", { offset: "0%", "stop-color": "#b0703a" }, teak);
  el("stop", { offset: "55%", "stop-color": "#7a4421" }, teak);
  el("stop", { offset: "100%", "stop-color": "#4a2811" }, teak);
  const face = el("radialGradient", { id: "dialFace", cx: "50%", cy: "45%", r: "60%" }, d);
  el("stop", { offset: "0%", "stop-color": "#fbf4e2" }, face);
  el("stop", { offset: "100%", "stop-color": "#d9ccaa" }, face);
}

/**
 * Ship's wheel. `onHelm(helm)` fires while dragging. The wheel stays where it
 * is left; that angle is the rudder order.
 */
export function createWheel(container, { onHelm }) {
  const root = document.createElement("div");
  root.className = "bridge-wheel";
  root.setAttribute("role", "slider");
  root.setAttribute("aria-label", "Ship's wheel");
  root.setAttribute("aria-valuemin", "-1");
  root.setAttribute("aria-valuemax", "1");
  const svg = el("svg", { viewBox: "-100 -100 200 200" });
  root.appendChild(svg);
  defs(svg);

  // Fixed bezel: port (red) and starboard (green) arcs, amidships and hard-over marks.
  const hard = WHEEL_HARD_OVER * DEG;
  el("path", { d: arcPath(97, -hard, 0), class: "wheel-port" }, svg);
  el("path", { d: arcPath(97, 0, hard), class: "wheel-stbd" }, svg);
  for (const deg of [-hard, 0, hard]) {
    const [x0, y0] = polar(90, deg);
    const [x1, y1] = polar(100, deg);
    el("line", { x1: x0, y1: y0, x2: x1, y2: y1, class: deg === 0 ? "mark-mid" : "mark-hard" }, svg);
  }

  const spin = el("g", {}, svg);
  // Spokes run through the rim and end in turned handles.
  for (let i = 0; i < 8; i++) {
    const deg = i * 45;
    const [x0, y0] = polar(14, deg);
    const [x1, y1] = polar(78, deg);
    el("line", { x1: x0, y1: y0, x2: x1, y2: y1, class: "spoke" }, spin);
    const [hx, hy] = polar(84, deg);
    el("rect", {
      x: hx - 5, y: hy - 9, width: 10, height: 18, rx: 5,
      transform: `rotate(${deg} ${hx} ${hy})`,
      class: i === 0 ? "handle king" : "handle",
    }, spin);
  }
  el("circle", { r: 66, class: "rim" }, spin);
  el("circle", { r: 66, class: "rim-grain" }, spin);
  // King spoke band: brass collar that marks amidships on the wheel itself.
  const [kx, ky] = polar(66, 0);
  el("rect", { x: kx - 4, y: ky - 7, width: 8, height: 14, rx: 2, class: "king-band" }, spin);
  el("circle", { r: 17, class: "hub" }, spin);
  el("circle", { r: 7, class: "hub-cap" }, spin);

  container.appendChild(root);

  let angle = 0;
  let last = 0;
  let shownHelm = null;

  function draw() {
    const shown = shownHelm == null ? angle : helmToWheelAngle(shownHelm);
    spin.setAttribute("transform", `rotate(${shown * DEG})`);
    const helm = wheelAngleToHelm(shown);
    root.setAttribute("aria-valuenow", helm.toFixed(2));
    const pct = Math.round(Math.abs(helm) * 100);
    root.setAttribute(
      "aria-valuetext",
      pct < 3 ? "Amidships" : `${pct}% ${helm > 0 ? "starboard" : "port"}`
    );
  }

  grab(root, {
    down(e) {
      last = pointerAngle(root, e).a;
    },
    move(e) {
      const p = pointerAngle(root, e);
      if (p.dist < 10) return; // near the hub the angle is noise
      let d = p.a - last;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      last = p.a;
      angle = Math.max(-WHEEL_HARD_OVER, Math.min(WHEEL_HARD_OVER, angle + d));
      draw();
      onHelm(wheelAngleToHelm(angle));
    },
    up() {},
  });
  // Double-click or double-tap puts the wheel back amidships.
  root.addEventListener("dblclick", () => {
    angle = 0;
    draw();
    onHelm(0);
  });

  draw();

  return {
    el: root,
    helm: () => wheelAngleToHelm(angle),
    /** Show a helm the keys are forcing, or null to show the wheel's own angle. */
    show(helm) {
      if (helm === shownHelm) return;
      shownHelm = helm;
      draw();
    },
    reset() {
      angle = 0;
      shownHelm = null;
      draw();
    },
  };
}

/**
 * Engine-order telegraph. `onOrder(index)` fires when the handle is released
 * on a detent. `update(throttle, answer)` moves the handle and the answering
 * pointer from the simulation.
 */
export function createTelegraph(container, { onOrder }) {
  const root = document.createElement("div");
  root.className = "bridge-telegraph";
  root.setAttribute("role", "slider");
  root.setAttribute("aria-label", "Engine-order telegraph");
  root.setAttribute("aria-valuemin", "0");
  root.setAttribute("aria-valuemax", String(ENGINE_ORDERS.length - 1));
  const svg = el("svg", { viewBox: "-100 -100 200 200" });
  root.appendChild(svg);
  defs(svg);

  el("circle", { r: 97, class: "dial-rim" }, svg);
  el("circle", { r: 86, class: "dial-face" }, svg);

  const first = orderDialAngle(0) - 15;
  const last = orderDialAngle(ENGINE_ORDERS.length - 1) + 15;
  const stopIndex = ENGINE_ORDERS.findIndex((o) => o.throttle === 0);
  // Astern half tinted red, ahead half plain, as on an Olympic-class dial.
  el("path", { d: `${arcPath(71, first, orderDialAngle(stopIndex) - 15)}`, class: "dial-astern" }, svg);
  el("path", { d: `${arcPath(71, orderDialAngle(stopIndex) + 15, last)}`, class: "dial-ahead" }, svg);

  ENGINE_ORDERS.forEach((order, i) => {
    const mid = orderDialAngle(i);
    for (const edge of [mid - 15, mid + 15]) {
      const [x0, y0] = polar(58, edge);
      const [x1, y1] = polar(84, edge);
      el("line", { x1: x0, y1: y0, x2: x1, y2: y1, class: "dial-div" }, svg);
    }
    const [tx, ty] = polar(71, mid);
    const text = el("text", {
      x: tx, y: ty,
      transform: `rotate(${mid} ${tx} ${ty})`,
      class: i === stopIndex ? "dial-label stop" : "dial-label",
    }, svg);
    text.textContent = order.short;
  });
  // Below the hub, where the handle never rests.
  for (const [label, deg] of [["ASTERN", -152], ["AHEAD", 152]]) {
    const [x, y] = polar(56, deg);
    const t = el("text", { x, y, class: "dial-word" }, svg);
    t.textContent = label;
  }

  const answer = el("g", { class: "answer" }, svg);
  el("path", { d: "M -2 6 L 0 -80 L 2 6 Z" }, answer);

  const handle = el("g", { class: "lever" }, svg);
  el("rect", { x: -5, y: -86, width: 10, height: 92, rx: 4, class: "lever-arm" }, handle);
  el("circle", { cy: -80, r: 15, class: "lever-knob" }, handle);
  el("circle", { r: 13, class: "hub" }, svg);
  el("circle", { r: 5, class: "hub-cap" }, svg);

  const readout = document.createElement("div");
  readout.className = "telegraph-order";
  root.appendChild(readout);
  container.appendChild(root);

  let order = stopIndex;
  let dragAngle = null;
  let handleAngle = orderDialAngle(order);

  function setReadout(i) {
    readout.textContent = ENGINE_ORDERS[i].label.toUpperCase();
    root.setAttribute("aria-valuenow", String(i));
    root.setAttribute("aria-valuetext", ENGINE_ORDERS[i].label);
  }

  function dialAngle(e) {
    const p = pointerAngle(svg, e);
    // 0° at the top, clockwise positive; below the hub, keep to the nearer end.
    let deg = Math.atan2(p.dx, -p.dy) * DEG;
    const limit = orderDialAngle(ENGINE_ORDERS.length - 1) + 12;
    return Math.max(-limit, Math.min(limit, deg));
  }

  grab(root, {
    down(e) {
      dragAngle = dialAngle(e);
      handle.setAttribute("transform", `rotate(${dragAngle})`);
      setReadout(dialAngleToOrderIndex(dragAngle));
    },
    move(e) {
      dragAngle = dialAngle(e);
      handle.setAttribute("transform", `rotate(${dragAngle})`);
      setReadout(dialAngleToOrderIndex(dragAngle));
    },
    up() {
      if (dragAngle == null) return;
      order = dialAngleToOrderIndex(dragAngle);
      dragAngle = null;
      handleAngle = orderDialAngle(order);
      handle.setAttribute("transform", `rotate(${handleAngle})`);
      setReadout(order);
      onOrder(order);
    },
  });

  setReadout(order);
  handle.setAttribute("transform", `rotate(${handleAngle})`);

  return {
    el: root,
    /** Put the handle on an order (e.g. after a W/S nudge). */
    setOrder(i) {
      order = i;
      handleAngle = orderDialAngle(i);
      if (dragAngle == null) {
        handle.setAttribute("transform", `rotate(${handleAngle})`);
        setReadout(i);
      }
    },
    /** Each frame: `throttle` for the handle while keys nudge, `answer` for the engine room. */
    update(throttle, answerThrottle, nudging) {
      if (dragAngle == null && nudging) {
        handleAngle = throttleToDialAngle(throttle);
        handle.setAttribute("transform", `rotate(${handleAngle})`);
        setReadout(dialAngleToOrderIndex(handleAngle));
      }
      answer.setAttribute("transform", `rotate(${throttleToDialAngle(answerThrottle)})`);
    },
  };
}
