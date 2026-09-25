/* Radial collision correction supplements the original motion; tD/tF also drive hit testing. */
const atlasSpacingOffsets = new Float32Array(tC.MOTION_COUNT * 3);
const atlasSpacingPoint = new er.Vector3();
function atlasSpaceFocus(frame, delta, selected) {
  const { camera, size } = frame;
  const matrix = camera.matrixWorld.elements;
  const mix = 1 - Math.exp(-Math.min(delta, 0.05) / 0.16);
  const nodes = [];
  if (selected >= 0 && !tE.repackState.active) {
    const neighbors = tW[selected];
    for (let index = 0; index < tC.MOTION_COUNT; index++) {
      if (tL[index] < 0.5) continue;
      atlasSpacingPoint.fromArray(tD, 3 * index).applyMatrix4(camera.matrixWorldInverse);
      const depth = -atlasSpacingPoint.z;
      if (depth <= 0) continue;
      const pixels = size.height / (2 * Math.tan((camera.fov * Math.PI) / 360) * depth);
      atlasSpacingPoint.fromArray(tD, 3 * index).project(camera);
      const baseX = ((atlasSpacingPoint.x + 1) * size.width) / 2;
      const baseY = ((1 - atlasSpacingPoint.y) * size.height) / 2;
      const radius = tR[index] * pixels;
      const related = index === selected || neighbors.has(index);
      const parts = [{ x: 0, y: 0, w: radius + 6, h: radius + 6, disk: true }];
      // Only readable foreground labels reserve space; background discs still cannot cover them.
      if (related) {
        const font =
          (2.1 + (2 * (tR[index] - 2.2)) / 6.5) * pixels * (index === selected ? 1.15 : 1);
        atlasSpacingPoint.fromArray(tD, 3 * index);
        atlasSpacingPoint.x += matrix[4] * tP[index];
        atlasSpacingPoint.y += matrix[5] * tP[index];
        atlasSpacingPoint.z += matrix[6] * tP[index];
        atlasSpacingPoint.project(camera);
        parts.push({
          x: ((atlasSpacingPoint.x + 1) * size.width) / 2 - baseX,
          y: ((1 - atlasSpacingPoint.y) * size.height) / 2 - baseY - font * 0.6,
          w: tU[index].title.length * font * 0.31 + 4,
          h: font * 0.6 + 4,
          disk: false,
        });
      }
      nodes.push({ index, baseX, baseY, pixels, parts, related, x: baseX, y: baseY });
    }
    const center = nodes.find((node) => node.index === selected);
    if (center) {
      for (const node of nodes) {
        const dx = node.baseX - center.baseX,
          dy = node.baseY - center.baseY;
        node.radius = Math.hypot(dx, dy);
        node.ux = node.radius ? dx / node.radius : Math.cos(node.index * 2.39996);
        node.uy = node.radius ? dy / node.radius : Math.sin(node.index * 2.39996);
      }
      nodes.sort(
        (a, b) =>
          (a.index === selected ? -1 : b.index === selected ? 1 : 0) ||
          Number(b.related) - Number(a.related) ||
          a.radius - b.radius ||
          a.index - b.index,
      );
      const placed = [];
      for (const node of nodes) {
        if (node !== center) {
          // Find the first unoccupied distance on this node's original ray, without rotating it.
          const blocked = [];
          for (const other of placed)
            for (const part of node.parts)
              for (const obstacle of other.parts) {
                const x = other.x + obstacle.x - center.baseX - part.x;
                const y = other.y + obstacle.y - center.baseY - part.y;
                let near, far;
                if (part.disk && obstacle.disk) {
                  const along = x * node.ux + y * node.uy;
                  const across = x * node.uy - y * node.ux;
                  const reach = (part.w + obstacle.w) ** 2 - across ** 2;
                  if (reach <= 0) continue;
                  near = along - Math.sqrt(reach);
                  far = along + Math.sqrt(reach);
                } else {
                  const w = part.w + obstacle.w,
                    h = part.h + obstacle.h;
                  if (
                    (Math.abs(node.ux) < 1e-6 && Math.abs(x) >= w) ||
                    (Math.abs(node.uy) < 1e-6 && Math.abs(y) >= h)
                  )
                    continue;
                  const xs =
                    Math.abs(node.ux) < 1e-6
                      ? [-Infinity, Infinity]
                      : [(x - w) / node.ux, (x + w) / node.ux].sort((a, b) => a - b);
                  const ys =
                    Math.abs(node.uy) < 1e-6
                      ? [-Infinity, Infinity]
                      : [(y - h) / node.uy, (y + h) / node.uy].sort((a, b) => a - b);
                  near = Math.max(xs[0], ys[0]);
                  far = Math.min(xs[1], ys[1]);
                }
                if (near < far && far + 1 > node.radius) blocked.push([near - 1, far + 1]);
              }
          blocked.sort((a, b) => a[0] - b[0]);
          for (const [near, far] of blocked)
            if (node.radius > near && node.radius < far) node.radius = far + 1;
          node.x = center.baseX + node.ux * node.radius;
          node.y = center.baseY + node.uy * node.radius;
        }
        placed.push(node);
      }
    }
  }
  const targets = new Map(nodes.map((node) => [node.index, node]));
  for (let index = 0; index < tC.MOTION_COUNT; index++) {
    const node = targets.get(index);
    const dx = node ? (node.x - node.baseX) / node.pixels : 0;
    const dy = node ? -(node.y - node.baseY) / node.pixels : 0;
    for (let axis = 0; axis < 3; axis++) {
      const offset = 3 * index + axis;
      const target = matrix[axis] * dx + matrix[4 + axis] * dy;
      atlasSpacingOffsets[offset] += (target - atlasSpacingOffsets[offset]) * mix;
      tD[offset] += atlasSpacingOffsets[offset];
      tF[4 * index + axis] = tD[offset];
    }
  }
}
