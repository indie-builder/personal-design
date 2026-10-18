import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Arcade } from './game.ts';

const layout = [{ text: '玩', x: 300, y: 100, w: 40, h: 40, headline: true }];
function game(kind) {
  const g = new Arcade(kind, 640, 420, layout, () => 0.5);
  g.start();
  return g;
}

test('all five games start, pause without advancing, and reset cleanly', () => {
  for (const kind of ['breakout', 'invaders', 'ducks', 'snake', 'runner']) {
    const g = game(kind);
    g.step(0.1);
    g.pause();
    const before = JSON.stringify(g);
    g.step(2);
    assert.equal(JSON.stringify(g), before);
    g.reset();
    assert.equal(g.state, 'idle');
    assert.equal(g.score, 0);
    assert(g.bricks.every((b) => b.alive && b.x === b.homeX));
  }
});
test('breakout reflects from paddle, hits text, loses a life below the floor', () => {
  const g = game('breakout');
  g.serve = 0;
  g.ball = { x: 320, y: g.floor - 29, vx: 0, vy: 300 };
  g.step(0.03);
  assert(g.ball.vy < 0);
  g.ball = { x: 320, y: 147, vx: 0, vy: -300 };
  g.step(0.03);
  assert.equal(g.score, 10);
  assert.equal(g.state, 'cleared');
  g.start();
  g.serve = 0;
  g.ball = { x: 10, y: g.floor + 8, vx: 0, vy: 300 };
  g.step(0.01);
  assert.equal(g.lives, 2);
  assert.equal(g.state, 'miss');
});
test('raid shots destroy words and enemy bombs cost exactly one life', () => {
  const g = game('invaders');
  g.shots.push({ x: 320, y: 146 });
  g.step(0.02);
  assert.equal(g.score, 10);
  assert.equal(g.state, 'cleared');
  g.start();
  g.bombs.push({ x: g.playerX, y: g.floor - 26 });
  g.step(0.02);
  assert.equal(g.lives, 2);
  assert.equal(g.state, 'miss');
});
test('skeet needs an active target, successful aim scores, escaped target costs life', () => {
  const g = game('ducks');
  g.act(320, 120);
  assert.equal(g.score, 0);
  for (let i = 0; i < 60; i++) g.step(0.01);
  const target = g.bricks.find((b) => b.active);
  assert(target);
  g.act(target.x + target.w / 2, target.y + target.h / 2);
  assert.equal(g.score, 10);
  g.start();
  for (let i = 0; i < 60; i++) g.step(0.01);
  g.bricks[0].y = -100;
  g.bricks[0].age = 20;
  g.step(0.01);
  assert.equal(g.lives, 2);
});
test('snake eats a word into its body and wall contact ends the round', () => {
  const g = game('snake');
  g.snake.x = 295;
  g.snake.y = 120;
  g.snake.angle = 0;
  g.pointer = { x: 600, y: 120 };
  g.step(0.04);
  assert.equal(g.score, 10);
  assert.equal(g.body.at(-1).text, '玩');
  g.start();
  g.snake.x = 639;
  g.snake.y = 260;
  g.snake.angle = 0;
  g.pointer = { x: 1000, y: 260 };
  g.step(0.04);
  assert.equal(g.state, 'over');
});
test('runner jump is grounded-only; collision and cleared hurdle differ', () => {
  const g = game('runner');
  g.act();
  g.step(0.03);
  assert(g.jump > 0);
  const vy = g.rise;
  g.act();
  assert.equal(g.rise, vy);
  g.jump = 0;
  Object.assign(g.bricks[0], { active: true, age: 1, x: 65, w: 25, h: 30 });
  g.step(0.01);
  assert.equal(g.state, 'miss');
  g.start();
  g.jump = 100;
  Object.assign(g.bricks[0], { active: true, age: 1, x: 65, w: 25, h: 30 });
  g.step(0.01);
  assert.equal(g.state, 'playing');
  g.score = 80;
  g.state = 'cleared';
  g.start();
  g.step(0.01);
  assert(g.score >= 80, 'next wave keeps accumulated runner score');
});

test('remaining targets track the win condition, not score or bonus food', () => {
  for (const kind of ['breakout', 'snake', 'invaders', 'ducks', 'runner']) {
    const g = game(kind);
    assert.equal(g.remaining, 1);
    g.score = 50;
    assert.equal(g.remaining, 1, 'bonus points cannot imply completion');
    if (kind === 'runner') g.bricks[0].passed = true;
    else g.bricks[0].alive = false;
    assert.equal(g.remaining, 0);
    g.reset();
    assert.equal(g.remaining, 1);
  }
});

const kinds = ['breakout', 'snake', 'invaders', 'ducks', 'runner'];
const originalLetters = [
  { text: '玩', x: 100, y: 60, w: 40, h: 30, headline: true },
  { text: '字', x: 180, y: 60, w: 50, h: 30, headline: true },
  { text: '游', x: 260, y: 60, w: 30, h: 30, headline: true },
];
const reflowedLetters = [
  { text: '玩', x: 20, y: 90, w: 24, h: 48, headline: true },
  { text: '字', x: 60, y: 90, w: 32, h: 48, headline: true },
  { text: '游', x: 100, y: 90, w: 20, h: 48, headline: true },
];
const snapshot = (g) => JSON.parse(JSON.stringify(g));
function resizeFixture(kind, state, width = 640, height = 420) {
  const g = new Arcade(kind, width, height, originalLetters, () => 0.5);
  Object.assign(g, {
    state,
    score: 120,
    baseScore: 90,
    lives: 2,
    level: 2,
    time: 4,
    serve: 4.3,
    nextMove: 4.4,
    nextFire: 4.2,
    nextSpawn: 4.5,
    direction: -1,
    jump: 33,
    rise: -200,
    distance: 125,
    bonus: 5,
    playerX: 300,
    ball: { x: 80, y: 120, vx: 220, vy: -300 },
    pointer: { x: 200, y: 280 },
    snake: { x: 300, y: 240, angle: 0.7 },
    shots: [{ x: 60, y: 140 }],
    bombs: [{ x: 100, y: 160 }],
    body: [{ x: 280, y: 260, text: '字', w: 46, angle: 0.4 }],
    trail: [{ x: 240, y: 200 }],
    tokens: [{ x: 120, y: 220, text: 'A', born: 1.1 }],
    particles: [{ x: 88, y: 99, vx: 2, vy: -3, life: 0.2 }],
    flashes: [{ x: 44, y: 55, life: 0.1 }],
  });
  Object.assign(g.bricks[0], {
    active: true,
    age: 1.2,
    vx: 123,
    vy: -45,
    rotation: 0.3,
    scale: 0.5,
    x: 240,
    y: 180,
    w: 20,
    h: 15,
  });
  Object.assign(g.bricks[1], {
    alive: false,
    passed: true,
    age: 2.4,
    vx: -67,
    vy: 89,
    rotation: -0.2,
    scale: 0.75,
    x: 200,
    y: 80,
    w: 37.5,
    h: 22.5,
  });
  return g;
}
function unchangedOnResize(g) {
  const rest = snapshot(g);
  for (const field of [
    'width',
    'height',
    'floor',
    'bricks',
    'ball',
    'pointer',
    'snake',
    'shots',
    'bombs',
    'body',
    'trail',
    'tokens',
    'playerX',
  ])
    delete rest[field];
  return rest;
}

for (const kind of kinds) {
  test(`${kind}: resizing idle reinitializes the measured round`, () => {
    const g = resizeFixture(kind, 'idle');
    g.resize(320, 630, reflowedLetters);
    assert.deepEqual(snapshot(g), snapshot(new Arcade(kind, 320, 630, reflowedLetters, () => 0.5)));
  });
  for (const state of ['playing', 'paused', 'miss', 'over', 'cleared']) {
    test(`${kind}: resizing ${state} preserves progress and reflows live coordinates`, () => {
      const g = resizeFixture(kind, state);
      const stable = unchangedOnResize(g);
      const random = g.random;
      const remaining = g.remaining;
      g.resize(320, 630, reflowedLetters);
      assert.deepEqual(unchangedOnResize(g), stable);
      assert.equal(g.random, random);
      assert.equal(g.remaining, remaining);
      assert.deepEqual([g.width, g.height, g.floor, g.playerX], [320, 630, 614, 150]);
      assert.deepEqual(g.bricks, [
        {
          text: '玩',
          headline: true,
          homeX: 20,
          homeY: 90,
          homeW: 24,
          homeH: 48,
          x: 120,
          y: 270,
          w: 12,
          h: 24,
          alive: true,
          active: true,
          passed: false,
          age: 1.2,
          vx: 123,
          vy: -45,
          rotation: 0.3,
          scale: 0.5,
        },
        {
          text: '字',
          headline: true,
          homeX: 60,
          homeY: 90,
          homeW: 32,
          homeH: 48,
          x: 70,
          y: 120,
          w: 24,
          h: 36,
          alive: false,
          active: false,
          passed: true,
          age: 2.4,
          vx: -67,
          vy: 89,
          rotation: -0.2,
          scale: 0.75,
        },
        {
          text: '游',
          headline: true,
          homeX: 100,
          homeY: 90,
          homeW: 20,
          homeH: 48,
          x: 100,
          y: 90,
          w: 20,
          h: 48,
          alive: true,
          active: false,
          passed: false,
          age: 0,
          vx: 0,
          vy: 0,
          rotation: 0,
          scale: 1,
        },
      ]);
      assert.deepEqual(g.ball, { x: 40, y: 180, vx: 220, vy: -300 });
      assert.deepEqual(g.pointer, { x: 100, y: 420 });
      assert.deepEqual(g.snake, { x: 150, y: 360, angle: 0.7 });
      assert.deepEqual(g.shots, [{ x: 30, y: 210 }]);
      assert.deepEqual(g.bombs, [{ x: 50, y: 240 }]);
      assert.deepEqual(g.body, [{ x: 140, y: 390, text: '字', w: 46, angle: 0.4 }]);
      assert.deepEqual(g.trail, [{ x: 120, y: 300 }]);
      assert.deepEqual(g.tokens, [{ x: 60, y: 330, text: 'A', born: 1.1 }]);
      g.reset();
      assert.equal(g.state, 'idle');
      assert.deepEqual([g.score, g.lives, g.level], [0, kind === 'snake' ? 0 : 3, 0]);
      assert.deepEqual(
        g.bricks.map(({ text, x, y, w, h, headline }) => ({ text, x, y, w, h, headline })),
        reflowedLetters,
      );
      assert(g.bricks.every((b) => b.alive && !b.active && !b.passed && b.scale === 1));
    });
  }
  for (const [width, height, x, y] of [
    [0, 420, 80, 180],
    [640, 0, 40, 120],
    [0, 0, 80, 120],
  ]) {
    test(`${kind}: resizing from ${width}x${height} avoids division by zero`, () => {
      const g = resizeFixture(kind, 'paused', width, height);
      g.resize(320, 630, reflowedLetters);
      assert.deepEqual(g.ball, { x, y, vx: 220, vy: -300 });
      const assertFinite = (value) => {
        if (typeof value === 'number') assert(Number.isFinite(value));
        else if (value && typeof value === 'object') Object.values(value).forEach(assertFinite);
      };
      assertFinite(snapshot(g));
      assert.equal(g.state, 'paused');
      g.resize(640, 420, originalLetters);
      assert.deepEqual(g.ball, { x: x * 2, y: (y * 2) / 3, vx: 220, vy: -300 });
    });
  }
}

test('snake self collision follows the displayed width of an eaten title letter', () => {
  const g = game('snake');
  g.snake = { x: 200, y: 300, angle: 0 };
  g.body = Array.from({ length: 5 }, (_, i) => ({
    x: i === 4 ? 215 : 100 - i * 16,
    y: 300,
    text: i === 4 ? '字' : '',
    w: i === 4 ? 46 : 14,
    angle: 0,
  }));
  g.step(0);
  assert.equal(g.state, 'over');
});
