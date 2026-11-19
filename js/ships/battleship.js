import * as THREE from 'three';
import {
  appendColoredGeometry,
  appendLoftedNavalHull,
  appendTaperedSuperstructure,
  appendBridgeWindows,
  appendNavalTurret,
  appendRadarMast,
  buildMergedShipGeometry,
} from './shared.js?v=23';

export const spec = {
  id: 'battleship',
  label: 'HEAVY CRUISER',
  radius: 14.5,
  height: 13.5,
  color: 0x62708a,
};

const HULL_STATIONS = [
  // Broad armored dreadnought/heavy cruiser hull with long forecastle & stern quarterdeck
  { z: -14.2, deckW: 2.65, wlW: 2.55, keelW: 1.45, deckY: 2.75, wlY: 1.10, keelY: 0.0 },
  { z: -9.6,  deckW: 3.65, wlW: 3.55, keelW: 2.15, deckY: 2.80, wlY: 1.10, keelY: 0.0 },
  { z: -3.5,  deckW: 4.10, wlW: 3.95, keelW: 2.45, deckY: 2.95, wlY: 1.14, keelY: 0.0 },
  { z: 3.2,   deckW: 3.95, wlW: 3.78, keelW: 2.35, deckY: 3.15, wlY: 1.18, keelY: 0.0 },
  { z: 8.2,   deckW: 3.10, wlW: 2.75, keelW: 1.50, deckY: 3.50, wlY: 1.24, keelY: 0.0 },
  { z: 12.0,  deckW: 1.75, wlW: 1.30, keelW: 0.55, deckY: 3.85, wlY: 1.30, keelY: 0.0 },
  { z: 14.8,  deckW: 0.10, wlW: 0.06, keelW: 0.02, deckY: 4.25, wlY: 1.36, keelY: 0.05 },
];

export function buildGeometry() {
  const target = { positions: [], normals: [], colors: [] };
  const m = new THREE.Matrix4();

  // 1. Armored battleship/heavy cruiser hull with warm teak-wood deck & deep red lower hull
  appendLoftedNavalHull(target, HULL_STATIONS, {
    hull: 0x56647d,
    hullDark: 0x3e495e,
    waterline: 0x992b22,
    deck: 0x8c6d46, // classic naval teak wood plank deck!
    deckTrim: 0x62718a,
  });

  // 2. Superfiring Forward Main Battery: Turret A (bow) + elevated barbette & Turret B
  appendNavalTurret(target, {
    x: 0,
    y: 3.62,
    z: 9.8,
    scale: 1.12,
    turretColor: 0x76859e,
    barrelColor: 0x262c3b,
    facing: 1,
  });

  const barbetteB = new THREE.CylinderGeometry(1.55, 1.65, 1.35, 8);
  m.makeTranslation(0, 3.82, 5.8);
  appendColoredGeometry(target, barbetteB, 0x5c6a82, m);
  barbetteB.dispose();

  appendNavalTurret(target, {
    x: 0,
    y: 4.48,
    z: 5.8,
    scale: 1.12,
    turretColor: 0x7f8fa8,
    barrelColor: 0x262c3b,
    facing: 1,
  });

  // 3. Aft Main Battery: Turret X facing astern (-Z)
  appendNavalTurret(target, {
    x: 0,
    y: 2.85,
    z: -10.2,
    scale: 1.12,
    turretColor: 0x76859e,
    barrelColor: 0x262c3b,
    facing: -1,
  });

  // 4. Stepped Armored Citadel & Pagoda Command Tower
  appendTaperedSuperstructure(target, {
    x: 0,
    y: 3.05,
    z: -0.8,
    wBot: 5.4,
    wTop: 4.6,
    lenBot: 9.6,
    lenTop: 8.2,
    h: 2.2,
    frontRake: 0.7,
    color: 0x66758f,
    sideColor: 0x54627a,
    topColor: 0x455066,
  });

  // Tier 2 Forward Armored Conning Bridge
  appendTaperedSuperstructure(target, {
    x: 0,
    y: 5.25,
    z: 1.5,
    wBot: 4.2,
    wTop: 3.4,
    lenBot: 3.8,
    lenTop: 3.0,
    h: 2.0,
    frontRake: 0.45,
    color: 0xd5deeb,
    sideColor: 0xbbc6d6,
    topColor: 0x556278,
  });

  appendBridgeWindows(target, {
    x: 0,
    y: 6.1,
    zFront: 3.12,
    w: 3.45,
    h: 0.54,
    rake: 0.14,
    depth: 1.4,
    color: 0x192030,
  });

  // Tier 3 Fire-Control Director Tower
  appendTaperedSuperstructure(target, {
    x: 0,
    y: 7.25,
    z: 1.3,
    wBot: 2.6,
    wTop: 2.1,
    lenBot: 2.4,
    lenTop: 1.9,
    h: 1.6,
    frontRake: 0.25,
    color: 0xe3eaf5,
    sideColor: 0xc5d0e0,
    topColor: 0x58657a,
  });

  // 5. Massive twin armored smokestack funnels amidships + secondary side casemate turrets
  const stackGeo = new THREE.CylinderGeometry(1.05, 1.35, 3.2, 7);
  const capGeo = new THREE.CylinderGeometry(1.10, 1.10, 0.55, 7);
  for (const sz of [-1.4, -4.3]) {
    m.makeTranslation(0, 6.4, sz);
    appendColoredGeometry(target, stackGeo, 0x62718a, m);
    m.makeTranslation(0, 8.05, sz);
    appendColoredGeometry(target, capGeo, 0x202534, m);
  }
  stackGeo.dispose();
  capGeo.dispose();

  // Secondary broadside anti-air turrets on port & starboard flanks
  const secTurretGeo = new THREE.CylinderGeometry(0.62, 0.82, 0.75, 6);
  for (const side of [-1, 1]) {
    for (const sz of [0.6, -2.8]) {
      m.makeTranslation(side * 2.45, 5.45, sz);
      appendColoredGeometry(target, secTurretGeo, 0x8393ad, m);
    }
  }
  secTurretGeo.dispose();

  // 6. High rangefinder radar mast atop the pagoda tower
  appendRadarMast(target, {
    x: 0,
    y: 8.85,
    z: 1.2,
    scale: 1.05,
    mastColor: 0x455066,
    dishColor: 0xf4f7fc,
    accentColor: 0xe34c36,
  });

  return buildMergedShipGeometry(target);
}
