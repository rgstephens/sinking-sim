# Sinking Sim

A browser game where you pick a ship and a disaster, then watch it flood and go down.

## Run

Requires [Node.js](https://nodejs.org/).

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

To serve a production build:

```bash
npm run build
npm run preview
```

## Play

1. Choose a ship and an atmosphere.
2. Click **Get Underway**. The ship is already steaming.
3. Steer with `A` / `D` (or the arrow keys). `W` and `S` change throttle.
4. A hazard shows up at random — iceberg, mine, wave, or a boiler running hot. The banner tells you which way to turn, or to cut throttle. Miss it and another one comes. Hit it and the ship floods, lists, and goes down.
5. `C` cycles chase, free, and dock cameras. Drag to orbit in free camera. Scroll to zoom.

The speed slider runs from pause (`0`) through `4×`. **Space** toggles pause. `1`, `2`, and `4` jump to those speeds. **Reset** returns to the setup screen. Shortcuts stay in the lower right. Speed, heading, flood, and list sit in the bubbles along the bottom.
