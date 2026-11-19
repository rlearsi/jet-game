import * as THREE from 'three';

/**
 * Shared InstancedMesh pool rendering Bayer 4x4 dithered particle spheres in 1 draw call.
 * Eliminates per-particle ShaderMaterial, Mesh, Matrix4, and GC churn during combat/flight.
 */
export class DitheredParticlePool {
  constructor(scene, maxCount = 200) {
    this.scene = scene;
    this.maxCount = maxCount;
    this.cursor = 0;

    this.geo = new THREE.IcosahedronGeometry(1.0, 1);
    this.colorAlphaArray = new Float32Array(maxCount * 4);
    this.colorAlphaAttr = new THREE.InstancedBufferAttribute(this.colorAlphaArray, 4);
    this.colorAlphaAttr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aColorAlpha', this.colorAlphaAttr);

    this.mat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute vec4 aColorAlpha;
        varying vec4 vColorAlpha;
        void main() {
          vColorAlpha = aColorAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec4 vColorAlpha;

        float bayer4(vec2 pos) {
          int x = int(mod(pos.x, 4.0));
          int y = int(mod(pos.y, 4.0));
          int idx = y * 4 + x;
          if (idx == 0) return 0.0 / 16.0;
          if (idx == 1) return 8.0 / 16.0;
          if (idx == 2) return 2.0 / 16.0;
          if (idx == 3) return 10.0 / 16.0;
          if (idx == 4) return 12.0 / 16.0;
          if (idx == 5) return 4.0 / 16.0;
          if (idx == 6) return 14.0 / 16.0;
          if (idx == 7) return 6.0 / 16.0;
          if (idx == 8) return 3.0 / 16.0;
          if (idx == 9) return 11.0 / 16.0;
          if (idx == 10) return 1.0 / 16.0;
          if (idx == 11) return 9.0 / 16.0;
          if (idx == 12) return 15.0 / 16.0;
          if (idx == 13) return 7.0 / 16.0;
          if (idx == 14) return 13.0 / 16.0;
          return 5.0 / 16.0;
        }

        void main() {
          if (vColorAlpha.a < bayer4(floor(gl_FragCoord.xy))) discard;
          gl_FragColor = vec4(vColorAlpha.rgb, 1.0);
        }
      `,
    });

    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, maxCount);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
  }

  beginFrame() {
    this.cursor = 0;
  }

  push(x, y, z, scale, r, g, b, alpha) {
    if (this.cursor >= this.maxCount) return;
    const i = this.cursor++;
    const m = this.mesh.instanceMatrix.array;
    const mo = i * 16;
    m[mo] = scale;
    m[mo + 1] = 0;
    m[mo + 2] = 0;
    m[mo + 3] = 0;
    m[mo + 4] = 0;
    m[mo + 5] = scale;
    m[mo + 6] = 0;
    m[mo + 7] = 0;
    m[mo + 8] = 0;
    m[mo + 9] = 0;
    m[mo + 10] = scale;
    m[mo + 11] = 0;
    m[mo + 12] = x;
    m[mo + 13] = y;
    m[mo + 14] = z;
    m[mo + 15] = 1;

    const co = i * 4;
    const ca = this.colorAlphaArray;
    ca[co] = r;
    ca[co + 1] = g;
    ca[co + 2] = b;
    ca[co + 3] = alpha;
  }

  endFrame() {
    this.mesh.count = this.cursor;
    if (this.cursor > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.colorAlphaAttr.needsUpdate = true;
    }
  }

  clear() {
    this.cursor = 0;
    this.mesh.count = 0;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}
