import * as THREE from 'three';
import {
  appendColoredGeometry,
  appendLoftedNavalHull,
  appendTaperedSuperstructure,
  appendBridgeWindows,
  appendRadarMast,
  buildMergedShipGeometry,
} from './shared.js?v=23';

export const spec = {
  id: 'cargo',
  label: 'CONTAINER FREIGHTER',
  radius: 14.0,
  height: 13.0,
  color: 0xc95238,
};

const HULL_STATIONS = [
  // Deep-draft merchant freighter hull with flared bulbous bow
  { z: -13.8, deckW: 3.10, wlW: 2.95, keelW: 2.10, deckY: 3.05, wlY: 1.20, keelY: 0.0 },
  { z: -8.5,  deckW: 3.75, wlW: 3.65, keelW: 2.70, deckY: 3.05, wlY: 1.20, keelY: 0.0 },
  { z: 0.0,   deckW: 3.85, wlW: 3.75, keelW: 2.75, deckY: 3.05, wlY: 1.20, keelY: 0.0 },
  { z: 7.2,   deckW: 3.65, wlW: 3.45, keelW: 2.40, deckY: 3.15, wlY: 1.22, keelY: 0.0 },
  { z: 11.4,  deckW: 2.35, wlW: 1.70, keelW: 0.90, deckY: 3.65, wlY: 1.28, keelY: 0.0 },
  { z: 14.4,  deckW: 0.12, wlW: 0.08, keelW: 0.04, deckY: 4.15, wlY: 1.38, keelY: 0.05 },
];

export function buildGeometry() {
  const target = { positions: [], normals: [], colors: [] };
  const m = new THREE.Matrix4();

  // 1. Deep dark-navy/teal merchant hull with bright oxide-red lower boot-top
  appendLoftedNavalHull(target, HULL_STATIONS, {
    hull: 0x26354a,
    hullDark: 0x1b2638,
    waterline: 0xb83d2e,
    deck: 0x3b4454,
    deckTrim: 0xd49b35,
  });

  // 2. Forward raised forecastle windlass deck at the bow
  appendTaperedSuperstructure(target, {
    x: 0,
    y: 3.12,
    z: 10.8,
    wBot: 4.4,
    wTop: 2.4,
    lenBot: 4.6,
    lenTop: 3.4,
    h: 1.05,
    frontRake: -0.6,
    color: 0x32435c,
    sideColor: 0x28364b,
    topColor: 0x4d586b,
  });

  // 3. Multi-layered intermodal shipping container bays along the main cargo deck
  const containerBayA = new THREE.BoxGeometry(2.7, 1.35, 3.8);
  const containerBayB = new THREE.BoxGeometry(2.7, 1.35, 3.8);

  // Authentic maritime shipping container colors (Maersk blue, rust orange, evergreen, ochre gold, cream)
  const bayStacks = [
    // Forward Bay (z = +5.6)
    { x: -1.48, y: 3.72, z: 5.6, col: 0xc94930 },
    { x:  1.48, y: 3.72, z: 5.6, col: 0x2b6ca3 },
    { x: -1.48, y: 5.08, z: 5.6, col: 0xe09f2d },
    { x:  1.48, y: 5.08, z: 5.6, col: 0xc94930 },

    // Mid-Forward Bay (z = +1.2)
    { x: -1.48, y: 3.72, z: 1.2, col: 0x2d7a53 },
    { x:  1.48, y: 3.72, z: 1.2, col: 0xd96b2b },
    { x: -1.48, y: 5.08, z: 1.2, col: 0x2b6ca3 },
    { x:  1.48, y: 5.08, z: 1.2, col: 0xe8e2d5 },
    { x: -1.48, y: 6.44, z: 1.2, col: 0xd96b2b },

    // Mid-Aft Bay (z = -3.2)
    { x: -1.48, y: 3.72, z: -3.2, col: 0xe09f2d },
    { x:  1.48, y: 3.72, z: -3.2, col: 0x2d7a53 },
    { x: -1.48, y: 5.08, z: -3.2, col: 0xc94930 },
    { x:  1.48, y: 5.08, z: -3.2, col: 0x2b6ca3 },
    { x:  1.48, y: 6.44, z: -3.2, col: 0xe09f2d },
  ];

  for (const st of bayStacks) {
    m.makeTranslation(st.x, st.y, st.z);
    appendColoredGeometry(target, containerBayA, st.col, m);
  }
  containerBayA.dispose();
  containerBayB.dispose();

  // 4. Tall Aft White Accommodation & Bridge Tower (classic cargo ship stern castle)
  appendTaperedSuperstructure(target, {
    x: 0,
    y: 3.05,
    z: -8.6,
    wBot: 5.6,
    wTop: 5.2,
    lenBot: 4.8,
    lenTop: 4.2,
    h: 3.2,
    frontRake: 0.25,
    color: 0xf0ece1,
    sideColor: 0xd9d4c7,
    topColor: 0x7d8799,
  });

  // Upper wide navigation bridge wings
  appendTaperedSuperstructure(target, {
    x: 0,
    y: 6.25,
    z: -8.3,
    wBot: 6.4,
    wTop: 6.2,
    lenBot: 2.8,
    lenTop: 2.5,
    h: 1.65,
    frontRake: 0.15,
    color: 0xf7f4eb,
    sideColor: 0xe0dbd0,
    topColor: 0x545e70,
  });

  appendBridgeWindows(target, {
    x: 0,
    y: 6.85,
    zFront: -6.92,
    w: 5.8,
    h: 0.56,
    rake: 0.08,
    depth: 1.4,
    color: 0x1a2234,
  });

  // 5. Tall Orange-Red Merchant Smokestack Funnel behind the bridge
  const funnelGeo = new THREE.CylinderGeometry(0.85, 1.1, 3.1, 6);
  m.makeTranslation(0, 8.8, -9.5);
  appendColoredGeometry(target, funnelGeo, 0xd94e34, m);
  funnelGeo.dispose();

  const funnelCapGeo = new THREE.CylinderGeometry(0.88, 0.88, 0.55, 6);
  m.makeTranslation(0, 10.4, -9.5);
  appendColoredGeometry(target, funnelCapGeo, 0x222634, m);
  funnelCapGeo.dispose();

  appendRadarMast(target, {
    x: 0,
    y: 7.9,
    z: -8.0,
    scale: 0.85,
    mastColor: 0xc8c3b7,
    dishColor: 0xffffff,
    accentColor: 0xd94e34,
  });

  return buildMergedShipGeometry(target);
}
