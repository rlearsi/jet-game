import * as THREE from 'three';
import {
  appendColoredGeometry,
  appendLoftedNavalHull,
  appendTaperedSuperstructure,
  appendBridgeWindows,
  appendNavalTurret,
  appendRadarMast,
  buildMergedShipGeometry,
} from './shared.js?v=27';

export const spec = {
  id: 'destroyer',
  label: 'NAVAL DESTROYER',
  radius: 13.5,
  height: 12.5,
  color: 0x5c6b84,
};

const HULL_STATIONS = [
  // Stern transom (-Z) to sharp Clipper Bow (+Z)
  { z: -13.4, deckW: 2.35, wlW: 2.25, keelW: 1.10, deckY: 2.65, wlY: 1.05, keelY: 0.0 },
  { z: -9.8,  deckW: 3.15, wlW: 3.00, keelW: 1.65, deckY: 2.70, wlY: 1.05, keelY: 0.0 },
  { z: -4.2,  deckW: 3.45, wlW: 3.30, keelW: 1.85, deckY: 2.85, wlY: 1.08, keelY: 0.0 },
  { z: 1.5,   deckW: 3.40, wlW: 3.22, keelW: 1.80, deckY: 3.00, wlY: 1.12, keelY: 0.0 },
  { z: 6.4,   deckW: 2.85, wlW: 2.55, keelW: 1.25, deckY: 3.35, wlY: 1.18, keelY: 0.0 },
  { z: 10.6,  deckW: 1.65, wlW: 1.25, keelW: 0.55, deckY: 3.72, wlY: 1.24, keelY: 0.0 },
  { z: 13.8,  deckW: 0.08, wlW: 0.05, keelW: 0.02, deckY: 4.10, wlY: 1.32, keelY: 0.05 },
];

export function buildGeometry() {
  const target = { positions: [], normals: [], colors: [] };
  const m = new THREE.Matrix4();

  // 1. Sleek tapered naval destroyer hull with raised forecastle bow & crimson boot-top
  appendLoftedNavalHull(target, HULL_STATIONS, {
    hull: 0x5b6a82,
    hullDark: 0x455268,
    waterline: 0xa63429,
    deck: 0x394050,
    deckTrim: 0x73829c,
  });

  // 2. Forward VLS (Vertical Launch System) armored hatch deck plate
  const vlsGeo = new THREE.BoxGeometry(2.4, 0.35, 2.8);
  m.makeTranslation(0, 3.38, 5.2);
  appendColoredGeometry(target, vlsGeo, 0x8794ab, m);
  vlsGeo.dispose();

  // 3. Forward main 127mm dual-purpose naval gun turret on the bow
  appendNavalTurret(target, {
    x: 0,
    y: 3.42,
    z: 8.6,
    scale: 1.0,
    turretColor: 0x7a88a1,
    barrelColor: 0x293040,
    facing: 1,
  });

  // 4. Lower forward citadel superstructure (sloped stealth armor faces)
  appendTaperedSuperstructure(target, {
    x: 0,
    y: 2.92,
    z: 0.3,
    wBot: 4.8,
    wTop: 4.1,
    lenBot: 7.4,
    lenTop: 5.8,
    h: 2.1,
    frontRake: 0.9,
    color: 0x718099,
    sideColor: 0x5e6c85,
    topColor: 0x495469,
  });

  // 5. Upper command bridge cabin + dark wrap-around armored windows
  appendTaperedSuperstructure(target, {
    x: 0,
    y: 5.02,
    z: 1.1,
    wBot: 3.9,
    wTop: 3.3,
    lenBot: 4.2,
    lenTop: 3.2,
    h: 1.85,
    frontRake: 0.55,
    color: 0xd9e1ec,
    sideColor: 0xbfc9d9,
    topColor: 0x58657a,
  });

  appendBridgeWindows(target, {
    x: 0,
    y: 5.75,
    zFront: 2.85,
    w: 3.48,
    h: 0.56,
    rake: 0.16,
    depth: 1.5,
    color: 0x1b2334,
  });

  // 6. Raked twin exhaust smokestacks (amidships-aft) with black soot caps
  const stackGeo = new THREE.CylinderGeometry(0.88, 1.15, 2.8, 6);
  const capGeo = new THREE.CylinderGeometry(0.92, 0.92, 0.48, 6);
  for (const sz of [-1.4, -4.4]) {
    m.makeTranslation(0, 5.8, sz);
    appendColoredGeometry(target, stackGeo, 0x697791, m);
    m.makeTranslation(0, 7.25, sz);
    appendColoredGeometry(target, capGeo, 0x242938, m);
  }
  stackGeo.dispose();
  capGeo.dispose();

  // 7. Aft helicopter hangar & CIWS Phalanx dome + stern helipad markings
  appendTaperedSuperstructure(target, {
    x: 0,
    y: 2.75,
    z: -6.2,
    wBot: 4.4,
    wTop: 3.8,
    lenBot: 4.6,
    lenTop: 3.8,
    h: 1.85,
    frontRake: 0.35,
    color: 0x68768f,
    sideColor: 0x56637a,
    topColor: 0x444f63,
  });

  const ciwsDome = new THREE.CylinderGeometry(0.52, 0.62, 1.35, 6);
  m.makeTranslation(0, 5.15, -5.8);
  appendColoredGeometry(target, ciwsDome, 0xedf2fa, m);
  ciwsDome.dispose();

  // Helipad landing strip marker on stern
  const padGeo = new THREE.CylinderGeometry(1.65, 1.65, 0.08, 8);
  m.makeTranslation(0, 2.74, -10.6);
  appendColoredGeometry(target, padGeo, 0xd9a838, m);
  padGeo.dispose();

  // 8. Main radar mast spire above the bridge
  appendRadarMast(target, {
    x: 0,
    y: 6.85,
    z: 0.8,
    scale: 1.0,
    mastColor: 0x455066,
    dishColor: 0xf0f4fc,
    accentColor: 0xe34c36,
  });

  return buildMergedShipGeometry(target);
}
