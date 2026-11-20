export const spec = {
  id: 'hornet',
  name: 'F-14 HORNET',
  role: 'HEAVY GUNSHIP',
  cruiseSpeed: 60,
  abSpeed: 94,
  turnRate: 1.22,
  abTurnRate: 0.96,
  bankMax: 1.08,
  maxHp: 480,
  maxMissiles: 6,
  cannonCd: 0.064,
  cannonDmg: 18,
  palette: {
    base: '#eee0b8',
    shade: '#d8c79b',
    camo1: '#88866c',
    camo2: '#64634c',
    wingPatch: '#b4ad86',
    accent: '#e8682c',
    canopyTop: '#f8d84e',
    canopyHi: '#fff7c4',
    canopyBot: '#e3a12a',
  },
};

export const visual = {
  textureStyle: 'classic',
  finStyle: 'classic',
  wings: {
    main: {
      rootLE: [0.88, -1.32],
      rootTE: [0.88, 1.10],
      tipLE: [4.35, -0.18],
      tipTE: [4.35, 0.46],
      rootThick: 0.25,
      tipThick: 0.08,
      yOff: 0.03,
    },
  },
  tail: {
    tailplanes: {
      rootLE: [0.78, 1.40],
      rootTE: [0.78, 2.34],
      tipLE: [2.42, 1.96],
      tipTE: [2.42, 2.48],
      rootThick: 0.15,
      tipThick: 0.06,
      yOff: 0.01,
    },
    fins: {
      mode: 'twin',
      x: 0.88,
      y: 0.20,
      z: 1.66,
      scale: [1.0, 1.1, 1.05],
      cant: 0.28,
    },
  },
  cockpit: {
    pos: [0, 0.25, -1.58],
    scale: [0.32, 0.30, 1.05],
  },
  engines: {
    count: 2,
    x: 0.46,
    y: 0.0,
    z: 2.62,
  },
  details: {
    pods: [{ x: 1.85, y: -0.18, z: 0.12, radius: 0.16, length: 1.6, segments: 6 }],
  },
  wingtipPoint: [4.35, 0.04, 0.42],
};
