import { Arcade, pixelPatterns } from '@personal-design/word-arcade';

/** Cache geometry only: alpha, color and animation time still change every frame. */
export function arcadeBackgroundPaths(width: number, height: number) {
  return Array.from({ length: Math.ceil(width / 30) }, (_, col) =>
    Array.from({ length: Math.ceil(height / 30) }, (_, row) => {
      const path = new Path2D();
      pixelPatterns[(col * 17 + row * 7) % pixelPatterns.length]!.forEach((line, y) => {
        for (let x = 0; x < line.length; x++)
          if (line[x] === 'X') path.rect(col * 30 + x * 2 + 7, row * 30 + y * 2 + 7, 2, 2);
      });
      return path;
    }),
  );
}

/** Source pixel patterns and game primitives, drawn at CSS-pixel scale. */
export function drawArcade(
  ctx: CanvasRenderingContext2D,
  game: Arcade,
  ink: string,
  paper: string,
  reduced: boolean,
  background?: Path2D[][],
) {
  const { width, height, floor, kind, playerX, time } = game;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = ink;
  for (let col = 0; col < Math.ceil(width / 30); col++) {
    for (let row = 0; row < Math.ceil(height / 30); row++) {
      const phase = (row + col * 7 - (reduced ? 0 : time * (4 + (col % 5)))) % 23;
      ctx.globalAlpha = 0.005 + Math.max(0, 1 - Math.abs(phase) / 9) * 0.035;
      if (background) {
        ctx.fill(background[col]![row]!);
        continue;
      }
      const pattern = pixelPatterns[(col * 17 + row * 7) % pixelPatterns.length]!;
      pattern.forEach((line, y) => {
        for (let x = 0; x < line.length; x++)
          if (line[x] === 'X') ctx.fillRect(col * 30 + x * 2 + 7, row * 30 + y * 2 + 7, 2, 2);
      });
    }
  }
  ctx.globalAlpha = 1;
  if (kind === 'breakout') {
    ctx.fillRect(Math.round(playerX - 48), floor - 22, 96, 8);
    ctx.fillRect(Math.round(game.ball.x - 5), Math.round(game.ball.y - 5), 10, 10);
  } else if (kind === 'invaders') {
    const y = floor - 22,
      x = Math.round(playerX);
    ctx.fillRect(x - 15, y + 6, 30, 8);
    ctx.fillRect(x - 9, y + 2, 18, 4);
    ctx.fillRect(x - 2, y - 3, 4, 5);
    for (const p of game.shots) ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 8, 2, 8);
    for (const p of game.bombs)
      for (let i = 0; i < 4; i++)
        ctx.fillRect(Math.round(p.x) + (i % 2 ? 0 : -4), Math.round(p.y) - 12 + i * 4, 4, 4);
  } else if (kind === 'ducks') {
    const x = width / 2,
      y = floor - 20,
      aim = game.pointer;
    const angle = Math.max(-Math.PI + 0.15, Math.min(-0.15, Math.atan2(aim.y - y, aim.x - x)));
    ctx.fillRect(x - 18, floor - 10, 36, 5);
    ctx.fillRect(x - 3, y, 6, 10);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillRect(-8, -5, 14, 10);
    ctx.fillRect(6, -3, 30, 6);
    ctx.fillRect(34, -5, 5, 10);
    ctx.restore();
    if (game.state === 'playing') {
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        ctx.fillRect(
          Math.round(aim.x + Math.cos(a) * 16) - 1,
          Math.round(aim.y + Math.sin(a) * 16) - 1,
          2,
          2,
        );
      }
      ctx.fillRect(aim.x - 12, aim.y - 1, 7, 2);
      ctx.fillRect(aim.x + 5, aim.y - 1, 7, 2);
      ctx.fillRect(aim.x - 1, aim.y - 12, 2, 7);
      ctx.fillRect(aim.x - 1, aim.y + 5, 2, 7);
    }
    for (const p of game.flashes) {
      ctx.globalAlpha = p.life / 0.16;
      const length = Math.hypot(p.x - x, p.y - y);
      for (let at = 40; at < length; at += 8)
        ctx.fillRect(x + ((p.x - x) * at) / length, y + ((p.y - y) * at) / length, 2, 2);
    }
    ctx.globalAlpha = 1;
  } else if (kind === 'snake') {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '500 26px "Albert Sans", system-ui, sans-serif';
    for (const p of game.tokens) ctx.fillText(p.text, p.x, p.y);
    for (const b of game.body) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);
      if (b.text) {
        ctx.font = `400 ${b.w}px "Albert Sans", system-ui, sans-serif`;
        ctx.fillText(b.text, 0, 0);
      } else ctx.fillRect(-7, -7, 14, 14);
      ctx.restore();
    }
    const head = game.body[0];
    if (head) {
      ctx.save();
      ctx.translate(head.x, head.y);
      ctx.rotate(head.angle);
      ctx.fillStyle = paper;
      ctx.fillRect(2, -5, 3, 3);
      ctx.fillRect(2, 2, 3, 3);
      ctx.restore();
      ctx.fillStyle = ink;
    }
  } else {
    ctx.globalAlpha = 0.25;
    ctx.fillRect(24, floor, width - 48, 1);
    for (let i = 0; i < 24; i++)
      ctx.fillRect(
        24 + ((((i * 97 - game.distance) % (width - 48)) + width - 48) % (width - 48)),
        floor + 4 + (i % 5),
        3,
        1,
      );
    ctx.globalAlpha = 1;
    // Reuse the existing timeline walker's exact pixel geometry as this site's runner.
    ctx.save();
    ctx.translate(46, floor - game.jump - 32);
    if (game.jump) ctx.rotate(-0.15);
    for (const [x, y, w, h] of [
      [0, 0, 8, 24],
      [12, 0, 8, 8],
      [7, 4, 16, 4],
      [12, 4, 4, 12],
      [20, 4, 4, 12],
      [7, 12, 20, 4],
      [4, 15, 19, 13],
      [8, 15, 4, 13],
      [16, 20, 4, 8],
    ])
      ctx.fillRect(x!, y!, w!, h!);
    const step = Math.floor(game.distance / 22) % 2;
    ctx.fillRect(step ? 10 : 8, 28, 4, 4);
    ctx.fillRect(step ? 14 : 16, 28, 4, 4);
    ctx.restore();
  }
  if (!reduced)
    for (const p of game.particles) {
      ctx.globalAlpha = Math.min(1, p.life / 0.5);
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 3, 3);
    }
  ctx.globalAlpha = 1;
}
