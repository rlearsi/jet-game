import * as THREE from 'three';
import * as destroyer from './destroyer.js?v=35';
import * as carrier from './carrier.js?v=35';
import * as cargo from './cargo.js?v=35';
import * as battleship from './battleship.js?v=35';

export const SHIP_STYLES = [
  destroyer,
  carrier,
  cargo,
  battleship,
];

/**
 * Creates batched InstancedMeshes for all 4 naval ship styles (1 draw call per style, 4 draw calls total).
 * Each ship style has its own sculpted BufferGeometry with per-vertex colors and flat Lambert shading.
 */
export function createNavalFleetMeshes(scene, maxPerStyle = 24) {
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
  });

  const styleMeshes = SHIP_STYLES.map((styleMod) => {
    const geo = styleMod.buildGeometry();
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, maxPerStyle));
    im.count = 0;
    im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(im);
    return {
      id: styleMod.spec.id,
      spec: styleMod.spec,
      mesh: im,
    };
  });

  return styleMeshes;
}
