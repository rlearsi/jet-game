import * as THREE from 'three';
import {
  appendColoredGeometry,
  appendLoftedNavalHull,
  appendTaperedSuperstructure,
  appendBridgeWindows,
  appendRadarMast,
  buildMergedShipGeometry,
} from './shared.js?v=33';

export const spec = {
  id: 'carrier',
  label: 'AIRCRAFT CARRIER',
  radius: 15.0,
  height: 14.0,
  color: 0x525e75,
};

const HULL_STATIONS = [
  // Lower hull stations underneath the flared flight deck
  { z: -14.5, deckW: 3.30, wlW: 3.00, keelW: 1.90, deckY: 3.10, wlY: 1.15, keelY: 0.0 },
  { z: -9.5,  deckW: 4.10, wlW: 3.70, keelW: 2.35, deckY: 3.18, wlY: 1.15, keelY: 0.0 },
  { z: -2.0,  deckW: 4.35, wlW: 3.90, keelW: 2.50, deckY: 3.25, wlY: 1.18, keelY: 0.0 },
  { z: 5.5,   deckW: 3.95, wlW: 3.45, keelW: 2.00, deckY: 3.32, wlY: 1.22, keelY: 0.0 },
  { z: 11.2,  deckW: 2.35, wlW: 1.75, keelW: 0.85, deckY: 3.42, wlY: 1.26, keelY: 0.0 },
  { z: 15.0,  deckW: 0.55, wlW: 0.14, keelW: 0.04, deckY: 3.55, wlY: 1.32, keelY: 0.05 },
];

export function buildGeometry() {
  const target = { positions: [], normals: [], colors: [] };
  const m = new THREE.Matrix4();

  // 1. Heavy armored carrier lower hull with deep crimson waterline
  appendLoftedNavalHull(target, HULL_STATIONS, {
    hull: 0x4f5c73,
    hullDark: 0x3b4559,
    waterline: 0x9c2e24,
    deck: 0x323746,
    deckTrim: 0x59667d,
  });

  // 2. Overhanging armored flight deck platform + port angled waist sponson + bow ski-jump ramp
  const mainRunway = new THREE.BoxGeometry(8.8, 0.55, 27.6);
  m.makeTranslation(0, 3.65, -0.2);
  appendColoredGeometry(target, mainRunway, 0x303645, m);
  mainRunway.dispose();

  // Port-side (-X) angled recovery deck sponson overhang
  const sponson = new THREE.BoxGeometry(2.1, 0.50, 17.5);
  m.makeRotationY(0.08);
  m.setPosition(-4.85, 3.64, -1.2);
  appendColoredGeometry(target, sponson, 0x363c4d, m);
  sponson.dispose();

  // Forward ski-jump bow flight ramp (+Z)
  appendTaperedSuperstructure(target, {
    x: 0,
    y: 3.45,
    z: 13.8,
    wBot: 6.4,
    wTop: 4.8,
    lenBot: 3.6,
    lenTop: 2.8,
    h: 0.92,
    frontRake: -0.4,
    color: 0x3b4254,
    sideColor: 0x4a556b,
    topColor: 0x303645,
  });

  // 3. Flight deck runway lines (white & golden-amber arrestor/catapult tracks)
  const stripeGeo = new THREE.BoxGeometry(0.36, 0.08, 3.2);
  for (let sz = -11.5; sz <= 10.5; sz += 4.4) {
    m.makeTranslation(-1.15, 3.96, sz);
    appendColoredGeometry(target, stripeGeo, 0xf2f4f8, m);
  }
  stripeGeo.dispose();

  const catLineGeo = new THREE.BoxGeometry(0.28, 0.08, 22.5);
  m.makeTranslation(1.1, 3.96, 0.5);
  appendColoredGeometry(target, catLineGeo, 0xe8ab36, m);
  catLineGeo.dispose();

  // 4. Starboard (+X) Command Island Tower (iconic aircraft carrier side tower!)
  appendTaperedSuperstructure(target, {
    x: 3.25,
    y: 3.92,
    z: -1.4,
    wBot: 2.1,
    wTop: 1.85,
    lenBot: 7.2,
    lenTop: 5.8,
    h: 2.8,
    frontRake: 0.65,
    color: 0x74839c,
    sideColor: 0x5f6d85,
    topColor: 0x4b566b,
  });

  // Island upper air-boss bridge deck
  appendTaperedSuperstructure(target, {
    x: 3.25,
    y: 6.72,
    z: -1.1,
    wBot: 2.15,
    wTop: 1.9,
    lenBot: 4.4,
    lenTop: 3.6,
    h: 1.75,
    frontRake: 0.35,
    color: 0xdce4f0,
    sideColor: 0xc2ccd9,
    topColor: 0x536075,
  });

  appendBridgeWindows(target, {
    x: 3.25,
    y: 7.35,
    zFront: 0.9,
    w: 1.95,
    h: 0.52,
    rake: 0.12,
    depth: 1.8,
    color: 0x1a2234,
  });

  // Radar mast atop the starboard island
  appendRadarMast(target, {
    x: 3.25,
    y: 8.45,
    z: -1.3,
    scale: 0.95,
    mastColor: 0x434d63,
    dishColor: 0xf4f7fc,
    accentColor: 0xe64a35,
  });

  // 5. Miniature parked carrier jets on the flight deck!
  const miniFuseGeo = new THREE.ConeGeometry(0.55, 2.5, 4);
  miniFuseGeo.rotateX(Math.PI * 0.5);
  const miniWingGeo = new THREE.BoxGeometry(2.1, 0.12, 0.95);
  const parkedSpots = [
    [-3.6, -7.8, 0.35, 0xd8e0ed],
    [-3.6, -3.6, 0.35, 0x9aa6bd],
    [-3.5, 0.8, 0.35, 0xd8e0ed],
    [1.1, -9.8, 0.0, 0xe35539],
  ];
  for (const [px, pz, rotY, col] of parkedSpots) {
    m.makeRotationY(rotY);
    m.setPosition(px, 4.22, pz);
    appendColoredGeometry(target, miniFuseGeo, col, m);
    m.setPosition(px, 4.18, pz - 0.2);
    appendColoredGeometry(target, miniWingGeo, col, m);
  }
  miniFuseGeo.dispose();
  miniWingGeo.dispose();

  return buildMergedShipGeometry(target);
}
