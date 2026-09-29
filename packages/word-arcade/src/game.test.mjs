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
    assert(g.bricks.every(b => b.alive && b.x === b.homeX));
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
  const target = g.bricks.find(b => b.active);
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
  g.snake.x = 295; g.snake.y = 120; g.snake.angle = 0;
  g.pointer = { x: 600, y: 120 };
  g.step(0.04);
  assert.equal(g.score, 10);
  assert.equal(g.body.at(-1).text, '玩');
  g.start();
  g.snake.x = 639; g.snake.y = 260; g.snake.angle = 0;
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
  g.score = 80; g.state = 'cleared'; g.start(); g.step(0.01);
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

test('snake self collision follows the displayed width of an eaten title letter', () => {
  const g = game('snake');
  g.snake = { x: 200, y: 300, angle: 0 };
  g.body = Array.from({ length: 5 }, (_, i) => ({ x: i === 4 ? 215 : 100 - i * 16, y: 300, text: i === 4 ? '字' : '', w: i === 4 ? 46 : 14, angle: 0 }));
  g.step(0);
  assert.equal(g.state, 'over');
});
