import * as THREE from 'three';
import {
  DEFAULT_FUSELAGE_STATIONS,
  createPlanformTexture,
  createCanopyTexture,
  createFinTexture,
  createBrightJetMaterial,
  buildSculptedFuselage,
  buildAirfoilSurface,
  buildVerticalFin,
} from './shared.js?v=20';

function addSymmetricAirfoil(hullGroup, airfoilCfg, mat) {
  if (!airfoilCfg) return;
  const {
    rootLE,
    rootTE,
    tipLE,
    tipTE,
    rootThick,
    tipThick,
    yOff = 0.02,
  } = airfoilCfg;
  for (const side of [-1, 1]) {
    hullGroup.add(
      new THREE.Mesh(
        buildAirfoilSurface(side, rootLE, rootTE, tipLE, tipTE, rootThick, tipThick, yOff),
        mat
      )
    );
  }
}

function applyMeshScale(mesh, scale) {
  if (Array.isArray(scale)) {
    mesh.scale.set(scale[0], scale[1], scale[2]);
  } else if (typeof scale === 'number') {
    mesh.scale.setScalar(scale);
  }
}

/**
 * Builds the continuous sculpted blended-wing-body fuselage from station config.
 */
export function buildFuselage(hullGroup, cfg, mats) {
  const stations = cfg.fuselage?.stations || DEFAULT_FUSELAGE_STATIONS;
  hullGroup.add(new THREE.Mesh(buildSculptedFuselage(stations), mats.bodyMat));
}

/**
 * Builds main swept/forward-swept wings, optional canards, and optional wingtip winglets.
 */
export function buildWings(hullGroup, cfg, mats) {
  const wings = cfg.wings || {};
  addSymmetricAirfoil(hullGroup, wings.main, mats.bodyMat);
  addSymmetricAirfoil(hullGroup, wings.canards, mats.bodyMat);

  if (wings.winglets) {
    const { x, y = 0.03, z = 0.64, scale, cant = 0.28, shape } = wings.winglets;
    const finSpec = shape ? { ...shape, cant } : { cant };
    for (const side of [-1, 1]) {
      const winglet = new THREE.Mesh(buildVerticalFin(side, finSpec), mats.finMat);
      applyMeshScale(winglet, scale);
      winglet.position.set(side * x, y, z);
      hullGroup.add(winglet);
    }
  }
}

/**
 * Builds the raised 3D canopy dome and optional dark metallic framing collar.
 */
export function buildCockpit(hullGroup, cfg, mats) {
  const cockpitCfg = cfg.cockpit;
  if (!cockpitCfg || !cockpitCfg.pos) return;
  const { pos, scale = [0.32, 0.30, 1.05], rim = false } = cockpitCfg;

  if (rim) {
    const rimGeo = new THREE.CylinderGeometry(1.0, 1.04, 0.14, 10);
    const rimMesh = new THREE.Mesh(rimGeo, new THREE.MeshBasicMaterial({ color: 0x25283a }));
    rimMesh.scale.set(scale[0] * 1.08, 1.0, scale[2] * 1.04);
    rimMesh.position.set(pos[0], pos[1] + 0.04, pos[2]);
    hullGroup.add(rimMesh);
  }

  const canopyGeo = new THREE.SphereGeometry(1.0, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const canopy = new THREE.Mesh(canopyGeo, mats.canopyMat);
  canopy.scale.set(scale[0], scale[1], scale[2]);
  canopy.position.set(pos[0], pos[1], pos[2]);
  hullGroup.add(canopy);
}

/**
 * Builds 1 or 2 rear engine nozzles with optional glowing circular exhaust cores.
 */
export function buildEngines(hullGroup, cfg, mats) {
  const eng = cfg.engines || {};
  const {
    count = 2,
    x = 0.40,
    y = 0.0,
    z = 2.60,
    radiusFront = 0.28,
    radiusRear = 0.22,
    length = 0.58,
    segments = 7,
    housingColor = null,
    rimColor = 0x262838,
    glowCore = false,
    glowOuterColor = 0xe67622,
    glowInnerColor = 0xffb648,
  } = eng;

  const xPositions = count === 1 ? [0] : [-x, x];
  const nozzleMaterial = housingColor != null
    ? new THREE.MeshBasicMaterial({ color: housingColor })
    : mats.nozzleMat;

  const nozGeo = new THREE.CylinderGeometry(radiusRear, radiusFront, length, segments);
  nozGeo.rotateX(Math.PI / 2);

  let lipGeo = null;
  let lipMat = null;
  let outerDiscGeo = null;
  let outerDiscMat = null;
  let innerDiscGeo = null;
  let innerDiscMat = null;

  if (glowCore) {
    lipGeo = new THREE.RingGeometry(radiusRear * 0.78, radiusRear * 1.01, segments);
    lipMat = new THREE.MeshBasicMaterial({ color: rimColor });
    outerDiscGeo = new THREE.CircleGeometry(radiusRear * 0.80, segments);
    outerDiscMat = new THREE.MeshBasicMaterial({ color: glowOuterColor });
    innerDiscGeo = new THREE.CircleGeometry(radiusRear * 0.46, segments);
    innerDiscMat = new THREE.MeshBasicMaterial({ color: glowInnerColor });
  }

  const rearZ = z + length * 0.5;
  for (const ex of xPositions) {
    const noz = new THREE.Mesh(nozGeo, nozzleMaterial);
    noz.position.set(ex, y, z);
    hullGroup.add(noz);

    if (glowCore) {
      const lip = new THREE.Mesh(lipGeo, lipMat);
      lip.position.set(ex, y, rearZ + 0.005);
      hullGroup.add(lip);

      const outerGlow = new THREE.Mesh(outerDiscGeo, outerDiscMat);
      outerGlow.position.set(ex, y, rearZ + 0.012);
      hullGroup.add(outerGlow);

      const innerGlow = new THREE.Mesh(innerDiscGeo, innerDiscMat);
      innerGlow.position.set(ex, y, rearZ + 0.020);
      hullGroup.add(innerGlow);
    }
  }
}

/**
 * Builds horizontal tailplanes and single or twin canted vertical stabilizers.
 */
export function buildTail(hullGroup, cfg, mats) {
  const tail = cfg.tail || {};
  addSymmetricAirfoil(hullGroup, tail.tailplanes, mats.bodyMat);

  if (!tail.fins) return;
  const {
    mode = 'twin',
    x = 0.64,
    y = 0.20,
    z = 1.66,
    scale,
    cant = 0.28,
    shape,
  } = tail.fins;

  if (mode === 'single') {
    const finSpec = shape ? { ...shape, cant: 0 } : { cant: 0 };
    const fin = new THREE.Mesh(buildVerticalFin(0, finSpec), mats.finMat);
    applyMeshScale(fin, scale);
    fin.position.set(0, y, z);
    hullGroup.add(fin);
    return;
  }

  const finSpec = shape ? { ...shape, cant } : { cant };
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(buildVerticalFin(side, finSpec), mats.finMat);
    applyMeshScale(fin, scale);
    fin.position.set(side * x, y, z);
    hullGroup.add(fin);
  }
}

/**
 * Builds underwing gun pods and missile pylons/hardpoints.
 */
export function buildDetails(hullGroup, cfg, mats) {
  const details = cfg.details || {};

  if (Array.isArray(details.pods)) {
    for (const podCfg of details.pods) {
      const { x, y, z, radius = 0.16, length = 1.6, segments = 6 } = podCfg;
      const geo = new THREE.CylinderGeometry(radius, radius, length, segments);
      geo.rotateX(Math.PI / 2);
      for (const side of [-1, 1]) {
        const pod = new THREE.Mesh(geo, mats.podMat);
        pod.position.set(side * x, y, z);
        hullGroup.add(pod);
      }
    }
  }

  if (Array.isArray(details.pylons)) {
    for (const pylonCfg of details.pylons) {
      const { x, y, z, length = 1.0, radius = 0.09, railHeight = 0.14 } = pylonCfg;
      const railGeo = new THREE.BoxGeometry(0.08, railHeight, length * 0.65);
      const missileGeo = new THREE.CylinderGeometry(radius * 0.75, radius, length, 6);
      missileGeo.rotateX(Math.PI / 2);
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(railGeo, mats.podMat);
        rail.position.set(side * x, y + railHeight * 0.45, z);
        hullGroup.add(rail);

        const body = new THREE.Mesh(missileGeo, mats.podMat);
        body.position.set(side * x, y, z);
        hullGroup.add(body);
      }
    }
  }
}

/**
 * Master aircraft assembler driven by a ship's `{ spec, visual, buildExtra }` config.
 */
export function buildJetFromConfig(shipDef, accentOverride = null) {
  const { spec, visual: cfg, buildExtra } = shipDef;
  const pal = spec.palette;
  const accentHex = accentOverride || pal.accent;

  const group = new THREE.Group();
  const visualGroup = new THREE.Group();
  const hullGroup = new THREE.Group();
  visualGroup.add(hullGroup);
  group.add(visualGroup);

  group.name = `Fighter_${spec.id}`;
  group.userData.shipId = spec.id;

  const planTex = createPlanformTexture(accentHex, pal, cfg.textureStyle || 'classic');
  const canopyTex = createCanopyTexture(pal);
  const finTex = createFinTexture(accentHex, pal, cfg.finStyle || 'classic');

  const mats = {
    bodyMat: createBrightJetMaterial(planTex, 0xffffff),
    finMat: createBrightJetMaterial(finTex, 0xffffff),
    canopyMat: new THREE.MeshBasicMaterial({ map: canopyTex }),
    nozzleMat: new THREE.MeshBasicMaterial({ color: 0x2c3044 }),
    podMat: new THREE.MeshBasicMaterial({ color: 0x3b4157 }),
  };

  buildFuselage(hullGroup, cfg, mats);
  buildWings(hullGroup, cfg, mats);
  buildCockpit(hullGroup, cfg, mats);
  buildEngines(hullGroup, cfg, mats);
  buildTail(hullGroup, cfg, mats);
  buildDetails(hullGroup, cfg, mats);

  if (typeof buildExtra === 'function') {
    buildExtra({ group, visual: visualGroup, hullGroup, mats, spec, config: cfg });
  }

  const eng = cfg.engines || {};
  const engineCount = eng.count ?? 2;
  const nozzleX = engineCount === 1 ? 0 : (eng.x ?? 0.40);
  const nozzleY = eng.y ?? 0.0;
  const nozzleZ = eng.z ?? 2.60;
  const flameZ = nozzleZ + (eng.flameZOffset ?? 0.22);
  const flameBaseScale = eng.flameScale ?? 1.0;

  const flameOuterMat = new THREE.MeshBasicMaterial({ color: 0xff8026 });
  const flameInnerMat = new THREE.MeshBasicMaterial({ color: 0xfff6a0 });
  const outerConeGeo = new THREE.ConeGeometry(0.23 * flameBaseScale, 2.25 * flameBaseScale, 6);
  outerConeGeo.rotateX(Math.PI / 2);
  outerConeGeo.translate(0, 0, 1.12 * flameBaseScale);

  const innerConeGeo = new THREE.ConeGeometry(0.13 * flameBaseScale, 1.45 * flameBaseScale, 6);
  innerConeGeo.rotateX(Math.PI / 2);
  innerConeGeo.translate(0, 0, 0.72 * flameBaseScale);

  const flameL = new THREE.Group();
  const flameR = new THREE.Group();

  if (engineCount === 1) {
    flameL.position.set(0, nozzleY, flameZ);
    flameL.add(new THREE.Mesh(outerConeGeo, flameOuterMat), new THREE.Mesh(innerConeGeo, flameInnerMat));
    flameR.visible = false;
  } else {
    flameL.position.set(-nozzleX, nozzleY, flameZ);
    flameL.add(new THREE.Mesh(outerConeGeo, flameOuterMat), new THREE.Mesh(innerConeGeo, flameInnerMat));

    flameR.position.set(nozzleX, nozzleY, flameZ);
    flameR.add(new THREE.Mesh(outerConeGeo, flameOuterMat), new THREE.Mesh(innerConeGeo, flameInnerMat));
  }
  visualGroup.add(flameL, flameR);

  const muzzlePos = cfg.muzzlePos || [0.75, 0.0, -1.55];
  const muzzleMat = new THREE.MeshBasicMaterial({ color: 0xfff49e });
  const muzzleFlash = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), muzzleMat);
  muzzleFlash.position.set(muzzlePos[0], muzzlePos[1], muzzlePos[2]);
  muzzleFlash.visible = false;
  visualGroup.add(muzzleFlash);

  return {
    group,
    visual: visualGroup,
    hullGroup,
    flameL,
    flameR,
    muzzleFlash,
    wingtipPoint: cfg.wingtipPoint,
    nozzleX,
    nozzleY,
    nozzleZ,
    engineCount,
    spec,
  };
}
