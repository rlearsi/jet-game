import * as THREE from 'three';

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _cb = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _c = new THREE.Color();

/**
 * Utility to append a non-indexed or indexed BufferGeometry painted with a single vertex color
 * into a flat positions/normals/colors buffer array (for single-mesh vessel building).
 */
export function appendColoredGeometry(target, geo, hexColor, matrix = null) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (matrix) g.applyMatrix4(matrix);
  g.computeVertexNormals();

  const pos = g.attributes.position;
  const norm = g.attributes.normal;
  _c.setHex(hexColor);

  for (let i = 0; i < pos.count; i++) {
    target.positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    target.normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
    target.colors.push(_c.r, _c.g, _c.b);
  }
  g.dispose();
}

/**
 * Push a single flat-shaded triangle with an explicit vertex color.
 */
export function pushColoredTriangle(target, ax, ay, az, bx, by, bz, cx, cy, cz, hexColor) {
  _vA.set(ax, ay, az);
  _vB.set(bx, by, bz);
  _vC.set(cx, cy, cz);
  _cb.subVectors(_vC, _vB);
  _ab.subVectors(_vA, _vB);
  _cb.cross(_ab).normalize();

  _c.setHex(hexColor);
  const nx = _cb.x;
  const ny = _cb.y;
  const nz = _cb.z;

  target.positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  target.normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  target.colors.push(_c.r, _c.g, _c.b, _c.r, _c.g, _c.b, _c.r, _c.g, _c.b);
}

/**
 * Push a quad (4 points in CCW order seen from outside) as 2 flat-shaded triangles.
 */
export function pushColoredQuad(target, p0, p1, p2, p3, hexColor) {
  pushColoredTriangle(target, p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], hexColor);
  pushColoredTriangle(target, p0[0], p0[1], p0[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2], hexColor);
}

/**
 * Loft a realistic naval ship hull from cross-section stations along the Z axis (+Z = Bow/Front, -Z = Stern/Rear).
 * Each station:
 *  {
 *    z: longitudinal position (+Z bow, -Z stern),
 *    deckW: half-width at main weather deck / gunwale,
 *    wlW: half-width at waterline chine,
 *    keelW: half-width at bottom keel,
 *    deckY: height of main deck at this station (allows raised forecastle bow!),
 *    wlY: height of waterline chine / red anti-fouling boot-top,
 *    keelY: bottom height,
 *  }
 */
export function appendLoftedNavalHull(target, stations, palette) {
  const hullColor = palette.hull ?? 0x4b576e;
  const hullDark = palette.hullDark ?? 0x394357;
  const bootColor = palette.waterline ?? 0xa8382b;
  const deckColor = palette.deck ?? 0x3b4252;
  const trimColor = palette.deckTrim ?? 0x626e85;

  // Build ring vertices for each station:
  // 0: Center Deck, 1: Starboard(+X) Deck edge, 2: Starboard Waterline chine, 3: Starboard Keel,
  // 4: Port(-X) Keel, 5: Port Waterline chine, 6: Port Deck edge
  for (let i = 0; i < stations.length - 1; i++) {
    const s0 = stations[i];
    const s1 = stations[i + 1];

    const inset0 = Math.max(0, s0.deckW - 0.28);
    const inset1 = Math.max(0, s1.deckW - 0.28);

    // 1. Weather Deck surface (center to inner gunwale) + subtle raised coaming/gunwale rim
    for (const side of [-1, 1]) {
      const p0c = [0, s0.deckY, s0.z];
      const p1c = [0, s1.deckY, s1.z];
      const p0i = [side * inset0, s0.deckY, s0.z];
      const p1i = [side * inset1, s1.deckY, s1.z];
      const p0e = [side * s0.deckW, s0.deckY + 0.14, s0.z];
      const p1e = [side * s1.deckW, s1.deckY + 0.14, s1.z];

      if (side > 0) {
        pushColoredQuad(target, p0c, p0i, p1i, p1c, deckColor);
        pushColoredQuad(target, p0i, p0e, p1e, p1i, trimColor);
      } else {
        pushColoredQuad(target, p0c, p1c, p1i, p0i, deckColor);
        pushColoredQuad(target, p0i, p1i, p1e, p0e, trimColor);
      }

      // 2. Upper flared hull freeboard (Deck edge down to Waterline chine)
      const w0 = [side * s0.wlW, s0.wlY, s0.z];
      const w1 = [side * s1.wlW, s1.wlY, s1.z];
      // Mid-chine for subtle stealth/naval tumblehome or flare facet
      const midY0 = (s0.deckY + s0.wlY) * 0.52;
      const midY1 = (s1.deckY + s1.wlY) * 0.52;
      const midW0 = (s0.deckW * 0.58 + s0.wlW * 0.42) * 1.03;
      const midW1 = (s1.deckW * 0.58 + s1.wlW * 0.42) * 1.03;
      const m0 = [side * midW0, midY0, s0.z];
      const m1 = [side * midW1, midY1, s1.z];

      if (side > 0) {
        pushColoredQuad(target, p0e, m0, m1, p1e, hullColor);
        pushColoredQuad(target, m0, w0, w1, m1, hullDark);
      } else {
        pushColoredQuad(target, p0e, p1e, m1, m0, hullColor);
        pushColoredQuad(target, m0, m1, w1, w0, hullDark);
      }

      // 3. Lower crimson anti-fouling boot-top (Waterline down to Keel)
      const k0 = [side * s0.keelW, s0.keelY, s0.z];
      const k1 = [side * s1.keelW, s1.keelY, s1.z];
      if (side > 0) {
        pushColoredQuad(target, w0, k0, k1, w1, bootColor);
      } else {
        pushColoredQuad(target, w0, w1, k1, k0, bootColor);
      }
    }
  }

  // Close Stern transom (station 0) if stern has width > 0.05
  const st = stations[0];
  if (st.deckW > 0.05) {
    for (const side of [-1, 1]) {
      const cDeck = [0, st.deckY + 0.14, st.z];
      const eDeck = [side * st.deckW, st.deckY + 0.14, st.z];
      const eWl = [side * st.wlW, st.wlY, st.z];
      const cWl = [0, st.wlY, st.z];
      const eKeel = [side * st.keelW, st.keelY, st.z];
      const cKeel = [0, st.keelY, st.z];
      if (side > 0) {
        pushColoredQuad(target, cDeck, cWl, eWl, eDeck, hullDark);
        pushColoredQuad(target, cWl, cKeel, eKeel, eWl, bootColor);
      } else {
        pushColoredQuad(target, cDeck, eDeck, eWl, cWl, hullDark);
        pushColoredQuad(target, cWl, eWl, eKeel, cKeel, bootColor);
      }
    }
  }
}

/**
 * Helper to add a sloped/tapered superstructure block (angled front bridge face, not a raw 90-degree Lego brick).
 */
export function appendTaperedSuperstructure(target, {
  x = 0,
  y = 3.0,
  z = 0,
  wBot = 4.2,
  wTop = 3.4,
  lenBot = 6.0,
  lenTop = 4.4,
  h = 2.4,
  frontRake = 0.55, // how much the front wall slopes back
  color = 0xd8dee9,
  sideColor = 0xbec7d6,
  topColor = 0x566175,
}) {
  const hwB = wBot * 0.5;
  const hwT = wTop * 0.5;
  const zFrontB = z + lenBot * 0.5;
  const zBackB = z - lenBot * 0.5;
  const zFrontT = zFrontB - frontRake;
  const zBackT = zFrontT - lenTop;
  const y0 = y;
  const y1 = y + h;

  const bFL = [-hwB + x, y0, zFrontB];
  const bFR = [hwB + x, y0, zFrontB];
  const bBL = [-hwB + x, y0, zBackB];
  const bBR = [hwB + x, y0, zBackB];

  const tFL = [-hwT + x, y1, zFrontT];
  const tFR = [hwT + x, y1, zFrontT];
  const tBL = [-hwT + x, y1, zBackT];
  const tBR = [hwT + x, y1, zBackT];

  // Front raked bridge face (+Z)
  pushColoredQuad(target, bFL, tFL, tFR, bFR, color);
  // Rear wall (-Z)
  pushColoredQuad(target, bBR, tBR, tBL, bBL, sideColor);
  // Starboard wall (+X)
  pushColoredQuad(target, bFR, tFR, tBR, bBR, sideColor);
  // Port wall (-X)
  pushColoredQuad(target, bBL, tBL, tFL, bFL, sideColor);
  // Roof (+Y)
  pushColoredQuad(target, tFL, tBL, tBR, tFR, topColor);
}

/**
 * Helper to add a dark bridge windshield visor band across a tapered cabin front.
 */
export function appendBridgeWindows(target, {
  x = 0,
  y = 4.8,
  zFront = 3.2,
  w = 3.5,
  h = 0.55,
  rake = 0.14,
  depth = 1.6,
  color = 0x1c2436,
}) {
  const hw = w * 0.5 + 0.04;
  const fL0 = [-hw + x, y, zFront + 0.03];
  const fR0 = [hw + x, y, zFront + 0.03];
  const fL1 = [-hw + x, y + h, zFront - rake + 0.03];
  const fR1 = [hw + x, y + h, zFront - rake + 0.03];
  pushColoredQuad(target, fL0, fL1, fR1, fR0, color);

  // Side wrap-around bridge windows
  const sL0 = [-hw + x, y, zFront - depth];
  const sL1 = [-hw + x, y + h, zFront - depth];
  const sR0 = [hw + x, y, zFront - depth];
  const sR1 = [hw + x, y + h, zFront - depth];
  pushColoredQuad(target, sL0, sL1, fL1, fL0, color);
  pushColoredQuad(target, fR0, fR1, sR1, sR0, color);
}

/**
 * Helper to add a naval artillery gun turret ( octagonal turret housing + elevated twin barrels ).
 */
export function appendNavalTurret(target, {
  x = 0,
  y = 3.5,
  z = 7.2,
  scale = 1.0,
  turretColor = 0x6f7c94,
  barrelColor = 0x2d3344,
  facing = 1, // +1 = forward (+Z), -1 = aft (-Z)
}) {
  const m = new THREE.Matrix4();

  // Sloped turret cupola
  const baseGeo = new THREE.CylinderGeometry(1.05 * scale, 1.45 * scale, 1.15 * scale, 7);
  m.makeTranslation(x, y + 0.55 * scale, z);
  appendColoredGeometry(target, baseGeo, turretColor, m);
  baseGeo.dispose();

  // Twin elevated gun barrels
  const barrelGeo = new THREE.CylinderGeometry(0.14 * scale, 0.18 * scale, 3.1 * scale, 6);
  barrelGeo.rotateX(facing * (Math.PI * 0.5 - 0.18));
  for (const bx of [-0.34 * scale, 0.34 * scale]) {
    m.makeTranslation(x + bx, y + 0.78 * scale, z + facing * 1.65 * scale);
    appendColoredGeometry(target, barrelGeo, barrelColor, m);
  }
  barrelGeo.dispose();
}

/**
 * Helper to add a radar mast + rotating/angled crossbar array + communication spire.
 */
export function appendRadarMast(target, {
  x = 0,
  y = 6.2,
  z = 0.5,
  scale = 1.0,
  mastColor = 0x465066,
  dishColor = 0xe8eef7,
  accentColor = 0xd94836,
}) {
  const m = new THREE.Matrix4();

  // Lattice mast tripod/tower
  const mastGeo = new THREE.CylinderGeometry(0.22 * scale, 0.55 * scale, 3.4 * scale, 5);
  m.makeTranslation(x, y + 1.7 * scale, z);
  appendColoredGeometry(target, mastGeo, mastColor, m);
  mastGeo.dispose();

  // Yardarm crossbar
  const yardGeo = new THREE.BoxGeometry(2.6 * scale, 0.18 * scale, 0.22 * scale);
  m.makeTranslation(x, y + 2.45 * scale, z);
  appendColoredGeometry(target, yardGeo, mastColor, m);
  yardGeo.dispose();

  // Upper search radar scanner bar
  const radarGeo = new THREE.BoxGeometry(2.1 * scale, 0.42 * scale, 0.32 * scale);
  m.makeTranslation(x, y + 3.45 * scale, z + 0.1 * scale);
  appendColoredGeometry(target, radarGeo, dishColor, m);
  radarGeo.dispose();

  // Warning beacon cap
  const tipGeo = new THREE.BoxGeometry(0.32 * scale, 0.38 * scale, 0.32 * scale);
  m.makeTranslation(x, y + 3.85 * scale, z);
  appendColoredGeometry(target, tipGeo, accentColor, m);
  tipGeo.dispose();
}

/**
 * Finalizes the target buffer arrays into a Three.js BufferGeometry.
 */
export function buildMergedShipGeometry(target) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(target.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(target.normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(target.colors, 3));
  geo.computeBoundingSphere();
  return geo;
}
