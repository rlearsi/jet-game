export const spec = {
  id: 'phantom',
  name: 'B-17 PHANTOM',
  role: 'STEALTH MISSILE BOAT',
  cruiseSpeed: 56,
  abSpeed: 86,
  turnRate: 1.06,
  abTurnRate: 0.84,
  bankMax: 0.96,
  maxHp: 500,
  maxMissiles: 8,
  cannonCd: 0.082,
  cannonDmg: 22,
  palette: {
    base: '#707892',
    shade: '#59607a',
    camo1: '#495069',
    camo2: '#33384d',
    wingPatch: '#838ba6',
    accent: '#ffb842',
    canopyTop: '#ffb842',
    canopyHi: '#ffe59c',
    canopyBot: '#d97a24',
  },
};

export const visual = {
  textureStyle: 'classic',
  finStyle: 'classic',
  fuselage: {
    stations: [
      { z: -3.45, w: 0.06, chineW: 0.08, top: 0.02, midY: 0.0, bot: -0.02 },
      { z: -2.40, w: 0.65, chineW: 0.95, top: 0.22, midY: 0.02, bot: -0.14 },
      { z: -1.10, w: 1.05, chineW: 1.65, top: 0.30, midY: 0.04, bot: -0.18 },
      { z: 0.35, w: 1.25, chineW: 1.85, top: 0.30, midY: 0.04, bot: -0.18 },
      { z: 1.65, w: 1.15, chineW: 1.60, top: 0.24, midY: 0.02, bot: -0.16 },
      { z: 2.38, w: 0.82, chineW: 1.05, top: 0.14, midY: 0.0, bot: -0.12 },
    ],
  },
  wings: {
    main: {
      rootLE: [1.05, -1.75],
      rootTE: [1.05, 1.52],
      tipLE: [4.65, 0.92],
      tipTE: [4.65, 1.75],
      rootThick: 0.26,
      tipThick: 0.08,
      yOff: 0.03,
    },
  },
  tail: {
    fins: {
      mode: 'twin',
      x: 1.15,
      y: 0.16,
      z: 1.48,
      scale: [1.0, 0.78, 1.15],
      cant: 0.28,
    },
  },
  cockpit: {
    pos: [0, 0.22, -1.35],
    scale: [0.32, 0.30, 1.05],
  },
  engines: {
    count: 2,
    x: 0.56,
    y: 0.0,
    z: 2.48,
  },
  wingtipPoint: [4.65, 0.03, 1.72],
};
