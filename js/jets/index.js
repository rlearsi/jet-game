import * as striker from './striker.js?v=18';
import * as viper from './viper.js?v=18';
import * as phantom from './phantom.js?v=18';
import * as hornet from './hornet.js?v=18';
import * as starfire from './starfire.js?v=18';
import * as sakura from './sakura.js?v=18';
import * as raven from './raven.js?v=18';
import {
  buildJetFromConfig,
  buildFuselage,
  buildWings,
  buildCockpit,
  buildEngines,
  buildTail,
  buildDetails,
} from './builder.js?v=18';
export { buildAirfoilSurface } from './shared.js?v=18';
export {
  buildJetFromConfig,
  buildFuselage,
  buildWings,
  buildCockpit,
  buildEngines,
  buildTail,
  buildDetails,
};

const SHIP_MODULES = {
  striker,
  viper,
  phantom,
  hornet,
  starfire,
  sakura,
  raven,
};

export const SHIP_IDS = ['striker', 'viper', 'phantom', 'hornet', 'starfire', 'sakura', 'raven'];

export const SHIP_CATALOG = Object.fromEntries(
  SHIP_IDS.map((id) => [id, SHIP_MODULES[id].spec])
);

export const SHIP_VISUAL_CONFIGS = Object.fromEntries(
  SHIP_IDS.map((id) => [id, SHIP_MODULES[id].visual])
);

export function buildJetVisualRig(shipId = 'striker', accentOverride = null) {
  const mod = SHIP_MODULES[shipId] || SHIP_MODULES.striker;
  return buildJetFromConfig(mod, accentOverride);
}
