import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';

// Differential golden recorded before optimization. Only the projection adapter
// is synthetic; the actual checked-in spacing function runs across every frame.
class Point {
  fromArray(a, i) {
    this.x = a[i];
    this.y = a[i + 1];
    this.z = a[i + 2];
    return this;
  }
  applyMatrix4(m) {
    const e = m.elements,
      x = this.x,
      y = this.y,
      z = this.z,
      w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
    this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
    this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
    return this;
  }
  project(camera) {
    return this.applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
  }
}
test('atlas spacing preserves the original coordinates across changing frame states', () => {
  const file = new URL(
    '../public/ai-coding-atlas/vendor/static/immutable/chunks/10jcl7iozmh4t.js',
    import.meta.url,
  );
  const source = readFileSync(file, 'utf8');
  const start = source.indexOf('const atlasSpacingOffsets');
  const end = source.indexOf('\nfunction tJ', start);
  assert(start >= 0 && end > start);
  let seed = 17;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const hash = createHash('sha256');
  for (const count of [8, 71]) {
    const env = {
      er: { Vector3: Point },
      tC: { MOTION_COUNT: count },
      tD: new Float32Array(count * 3),
      tF: new Float32Array(count * 4),
      tL: new Float32Array(count),
      tR: new Float32Array(count),
      tP: new Float32Array(count),
      tU: [],
      tW: [],
      tE: { repackState: { active: false } },
      window: { __atlasInstant: false },
    };
    for (let i = 0; i < count; i++) {
      env.tR[i] = 2.2 + random() * 6.5;
      env.tP[i] = env.tR[i] + 3;
      env.tU.push({ title: '文字'.repeat(1 + (i % 14)) });
      env.tW.push(
        new Set(Array.from({ length: count }, (_, j) => j).filter((j) => j % 4 === i % 4)),
      );
    }
    runInNewContext(source.slice(start, end) + '\nglobalThis.run=atlasSpaceFocus;', env);
    for (let f = 0; f < 96; f++) {
      for (let i = 0; i < count; i++) {
        env.tD[3 * i] = (random() - 0.5) * 160;
        env.tD[3 * i + 1] = (random() - 0.5) * 120;
        env.tD[3 * i + 2] = random() * 60 - 15;
        env.tL[i] = f % 9 === 0 ? random() : 1;
        if (f % 12 === 0) env.tD[3 * i] = 0;
        if (f % 16 === 0) env.tD[3 * i + 1] = 0;
      }
      env.window.__atlasInstant = f % 7 === 0;
      env.tE.repackState.active = f % 11 === 0;
      const angle = (f % 4) * 0.15,
        c = Math.cos(angle),
        s = Math.sin(angle),
        z = f % 13 === 0 ? -30 : 150;
      const world = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, z, 1];
      const view = [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, s * z, 0, -c * z, 1];
      const camera = {
        matrixWorld: { elements: world },
        matrixWorldInverse: { elements: view },
        fov: 45 + (f % 4) * 10,
        projectionMatrix: { elements: [1.5, 0, 0, 0, 0, 2, 0, 0, 0, 0, -1, -1, 0, 0, -2, 0] },
      };
      env.run(
        { camera, size: { width: f % 2 ? 390 : 1440, height: f % 2 ? 844 : 900 } },
        f % 8 === 0 ? 0.1 : 1 / 120,
        f % 6 === 0 ? -1 : f % count,
      );
      assert(env.tD.every(Number.isFinite));
      hash.update(new Uint8Array(env.tD.buffer));
      hash.update(new Uint8Array(env.tF.buffer));
    }
  }
  const actual = hash.digest('hex');
  assert.equal(actual, '9933184fe46c929747ce27ee2438ecce2cdbd4847a6d2a7ba8a52480f6f164a4');
});
