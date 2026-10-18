// Read-only probes of the rendered arcade stage. Everything here comes from public output:
// canvas pixels and the letter spans' inline styles. No engine state or debug hooks.

// Resolve a CSS-pixel point on the stage to the client coordinates the pointer handler reads.
export async function canvasSnapshot(tab) {
  return tab.playwright.evaluate(() =>
    document.querySelector('[data-arcade-stage] canvas').toDataURL(),
  );
}

// Solid horizontal runs of a known CSS width: the 10px ball, or the 96px paddle, which is
// the only wide run on the floor rows.
export async function band(tab, width, floorRows) {
  return tab.playwright.evaluate(
    ({ width, floorRows }) => {
      const area = document.querySelector('[data-arcade-stage]');
      const canvas = area.querySelector('canvas');
      const box = area.getBoundingClientRect();
      const scale = canvas.width / box.width;
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const solid = (x, y) =>
        data[(Math.floor(y * scale) * canvas.width + Math.floor(x * scale)) * 4 + 3] > 240;
      for (
        let y = floorRows ? box.height - 38 : 0;
        y < (floorRows ? box.height - 30 : box.height);
        y++
      ) {
        let start = -1;
        for (let x = 0; x <= box.width; x++) {
          const on = x < box.width && solid(x, y);
          if (on && start < 0) start = x;
          else if (!on && start >= 0) {
            const length = x - start;
            if (width ? Math.abs(length - width) <= 1 : length >= 40)
              return { x: box.left + start + length / 2, y: box.top + y + 0.5, left: box.left };
            start = -1;
          }
        }
      }
      return null;
    },
    { width, floorRows },
  );
}

export const ballCenter = (tab) => band(tab, 10, false);

export async function runnerTop(tab) {
  return tab.playwright.evaluate(() => {
    const area = document.querySelector('[data-arcade-stage]');
    const canvas = area.querySelector('canvas');
    const box = area.getBoundingClientRect();
    const scale = canvas.width / box.width;
    const image = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const solid = (x, y) =>
      image[(Math.floor(y * scale) * canvas.width + Math.floor(x * scale)) * 4 + 3] > 240;
    for (let y = 0; y < box.height; y++) {
      let count = 0;
      for (let x = 40; x <= 80; x++) if (solid(x, y)) count++;
      if (count >= 12) return box.top + y;
    }
    return null;
  });
}

export async function invaderPlayerCenter(tab) {
  return tab.playwright.evaluate(() => {
    const area = document.querySelector('[data-arcade-stage]');
    const canvas = area.querySelector('canvas');
    const box = area.getBoundingClientRect();
    const scale = canvas.width / box.width;
    const image = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const solid = (x, y) =>
      image[(Math.floor(y * scale) * canvas.width + Math.floor(x * scale)) * 4 + 3] > 240;
    const floor = box.height - 16;
    let best = null;
    for (let y = Math.max(0, floor - 24); y <= floor - 6; y++) {
      let start = -1;
      for (let x = 0; x <= box.width; x++) {
        const on = x < box.width && solid(x, y);
        if (on && start < 0) start = x;
        else if (!on && start >= 0) {
          const length = x - start;
          if (!best || Math.abs(length - 30) < Math.abs(best.length - 30))
            best = { length, x: box.left + start + length / 2 };
          start = -1;
        }
      }
    }
    return best;
  });
}

export async function aliveLetterCenter(tab) {
  return tab.playwright.evaluate(() => {
    const area = document.querySelector('[data-arcade-stage]');
    const el = [...area.querySelectorAll('[data-game-letter]')].find(
      (node) => node.style.opacity === '1',
    );
    if (!el) return null;
    const box = el.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  });
}

// An active skeet target is a headline span whose live transform left its home position.
export async function activeTargetCenter(tab) {
  return tab.playwright.evaluate(() => {
    const area = document.querySelector('[data-arcade-stage]');
    for (const el of area.querySelectorAll('[data-game-letter]')) {
      if (el.style.opacity !== '1') continue;
      const match = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform);
      if (!match) continue;
      if (Math.abs(Number(match[1])) < 0.5 && Math.abs(Number(match[2])) < 0.5) continue;
      const box = el.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    }
    return null;
  });
}

export async function letterStyles(tab) {
  return tab.playwright.evaluate(() =>
    [...document.querySelectorAll('[data-game-letter]')].map((el) => ({
      opacity: el.style.opacity,
      transform: el.style.transform,
    })),
  );
}
