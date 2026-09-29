/** Small, deterministic simulation. DOM measurement and drawing stay in the web app. */
export type GameKind = 'breakout' | 'snake' | 'invaders' | 'ducks' | 'runner';
export type GameState = 'idle' | 'playing' | 'paused' | 'miss' | 'over' | 'cleared';
export type Point = { x: number; y: number };
export type LetterLayout = Point & { w: number; h: number; text: string; headline: boolean };
export type Brick = LetterLayout & {
  homeX: number;
  homeY: number;
  homeW: number;
  homeH: number;
  alive: boolean;
  active: boolean;
  passed: boolean;
  age: number;
  vx: number;
  vy: number;
  rotation: number;
  scale: number;
};
type Particle = Point & { vx: number; vy: number; life: number };
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
const inside = (p: Point, b: LetterLayout, margin = 0) =>
  p.x >= b.x - margin &&
  p.x <= b.x + b.w + margin &&
  p.y >= b.y - margin &&
  p.y <= b.y + b.h + margin;

export class Arcade {
  kind: GameKind;
  width: number;
  height: number;
  floor: number;
  ceiling = 16;
  bricks: Brick[] = [];
  state: GameState = 'idle';
  score = 0;
  baseScore = 0;
  lives = 3;
  level = 0;
  time = 0;
  pointer: Point;
  playerX = 0;
  ball = { x: 0, y: 0, vx: 0, vy: 0 };
  serve = 0.3;
  shots: Point[] = [];
  bombs: Point[] = [];
  particles: Particle[] = [];
  flashes: (Point & { life: number })[] = [];
  direction = 1;
  nextMove = 0.4;
  nextFire = 0.2;
  nextSpawn = 0.5;
  snake = { x: 0, y: 0, angle: 0 };
  body: (Point & { text: string; w: number; angle: number })[] = [];
  trail: Point[] = [];
  tokens: (Point & { text: string; born: number })[] = [];
  jump = 0;
  rise = 0;
  distance = 0;
  bonus = 0;
  random: () => number;

  constructor(
    kind: GameKind,
    width: number,
    height: number,
    layout: LetterLayout[],
    random = Math.random,
  ) {
    this.kind = kind;
    this.width = width;
    this.height = height;
    this.floor = height - 16;
    this.random = random;
    this.pointer = { x: width / 2, y: height * 0.6 };
    this.setLetters(layout);
    this.reset();
  }
  get remaining() {
    return this.bricks.filter((b) =>
      this.kind === 'runner'
        ? b.headline && !b.passed
        : b.alive && (this.kind !== 'ducks' || b.headline),
    ).length;
  }
  get pace() {
    return Math.min(1.75, 1 + this.level * 0.15);
  }
  setLetters(layout: LetterLayout[]) {
    this.bricks = layout.map((b) => ({
      ...b,
      homeX: b.x,
      homeY: b.y,
      homeW: b.w,
      homeH: b.h,
      alive: true,
      active: false,
      passed: false,
      age: 0,
      vx: 0,
      vy: 0,
      rotation: 0,
      scale: 1,
    }));
  }
  reset() {
    this.score = 0;
    this.level = 0;
    this.lives = this.kind === 'snake' ? 0 : 3;
    this.resetRound();
    this.state = 'idle';
  }
  resetRound() {
    this.baseScore = this.score;
    this.time = 0;
    this.playerX = this.width / 2;
    this.pointer = { x: this.width / 2, y: this.height * 0.6 };
    this.shots = [];
    this.bombs = [];
    this.particles = [];
    this.flashes = [];
    this.direction = 1;
    this.nextMove = 0.4;
    this.nextFire = 0.2;
    this.nextSpawn = 0.5;
    this.serve = 0.3;
    this.jump = 0;
    this.rise = 0;
    this.distance = 0;
    this.bonus = 0;
    for (const b of this.bricks)
      Object.assign(b, {
        x: b.homeX,
        y: b.homeY,
        w: b.homeW,
        h: b.homeH,
        alive: true,
        active: false,
        passed: false,
        age: 0,
        rotation: 0,
        scale: 1,
      });
    this.ball = { x: this.playerX, y: this.floor - 28, vx: 0, vy: 0 };
    const bottom = Math.max(this.ceiling, ...this.bricks.map((b) => b.y + b.h));
    this.snake = { x: this.width / 2, y: (bottom + this.floor) / 2, angle: 0 };
    this.body = Array.from({ length: 3 }, (_, i) => ({
      x: this.snake.x - i * 16,
      y: this.snake.y,
      text: '',
      w: 14,
      angle: 0,
    }));
    this.trail = Array.from({ length: 40 }, (_, i) => ({
      x: this.snake.x - i * 2,
      y: this.snake.y,
    }));
    this.tokens = [];
    if (this.kind === 'snake') this.pointer = { x: this.snake.x + 100, y: this.snake.y };
  }
  start() {
    if (this.state === 'cleared') {
      this.level++;
      this.resetRound();
    } else if (this.state === 'over') this.reset();
    else if (this.state === 'miss') {
      this.bombs = [];
      this.shots = [];
      this.serve = this.time + 0.3;
      this.nextSpawn = this.time + 0.5;
      this.jump = 0;
      this.rise = 0;
      if (this.kind === 'runner') for (const b of this.bricks) if (b.active) this.returnLetter(b);
    }
    this.state = 'playing';
  }
  pause() {
    if (this.state === 'playing') this.state = 'paused';
  }
  act(x = this.pointer.x, y = this.pointer.y) {
    if (this.state !== 'playing') {
      this.start();
      return;
    }
    if (this.kind === 'runner' && this.jump === 0) this.rise = 580;
    if (this.kind !== 'ducks') return;
    this.flashes.push({ x, y, life: 0.16 });
    const hit = this.bricks.find((b) => b.alive && b.active && inside({ x, y }, b, 12));
    if (hit) this.hit(hit);
  }
  hit(b: Brick) {
    b.alive = false;
    b.active = false;
    this.score += 10;
    this.spark(b.x + b.w / 2, b.y + b.h / 2);
    const remaining = this.kind === 'ducks' ? this.bricks.filter((b) => b.headline) : this.bricks;
    if (remaining.every((b) => !b.alive)) this.state = 'cleared';
  }
  miss() {
    this.lives = Math.max(0, this.lives - 1);
    this.state = this.lives ? 'miss' : 'over';
    this.spark(this.playerX, this.floor - 20);
  }
  spark(x: number, y: number) {
    for (let i = 0; i < 12; i++) {
      const a = this.random() * Math.PI * 2,
        speed = 80 + this.random() * 180;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 120,
        life: 0.6,
      });
    }
  }
  step(dt: number) {
    if (this.state !== 'playing') return;
    // Bound time and substep collisions; background time must never consume a life.
    dt = clamp(dt, 0, 0.05);
    this.time += dt;
    this.particles = this.particles.filter((p) => (p.life -= dt) > 0);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 900 * dt;
    }
    this.flashes = this.flashes.filter((p) => (p.life -= dt) > 0);
    if (this.kind === 'breakout') this.breakout(dt);
    else if (this.kind === 'invaders') this.invaders(dt);
    else if (this.kind === 'ducks') this.ducks(dt);
    else if (this.kind === 'snake') this.moveSnake(dt);
    else this.runner(dt);
  }
  breakout(dt: number) {
    const paddleY = this.floor - 22,
      radius = 5;
    this.playerX +=
      (clamp(this.pointer.x, 48, this.width - 48) - this.playerX) * Math.min(1, 18 * dt);
    if (this.serve > this.time) {
      this.ball.x = this.playerX;
      this.ball.y = paddleY - 6;
      return;
    }
    const speed = 400 * this.pace;
    if (this.serve !== 0) {
      const target =
        this.bricks.find((b) => b.alive && b.headline) ?? this.bricks.find((b) => b.alive);
      const angle = target
        ? clamp(
            Math.atan2(target.x + target.w / 2 - this.ball.x, this.ball.y - target.y),
            -0.95,
            0.95,
          )
        : 0.3;
      this.ball.vx = speed * Math.sin(angle);
      this.ball.vy = -speed * Math.cos(angle);
      this.serve = 0;
    }
    const steps = Math.ceil((dt * speed) / 4) || 1;
    for (let i = 0; i < steps; i++) {
      const p = this.ball,
        oldX = p.x,
        oldY = p.y;
      p.x += (p.vx * dt) / steps;
      p.y += (p.vy * dt) / steps;
      if (p.x < radius || p.x > this.width - radius) {
        p.x = clamp(p.x, radius, this.width - radius);
        p.vx *= -1;
      }
      if (p.y < this.ceiling + radius) {
        p.y = this.ceiling + radius;
        p.vy = Math.abs(p.vy);
      }
      if (
        p.vy > 0 &&
        p.y + radius >= paddleY &&
        oldY - radius <= paddleY + 8 &&
        Math.abs(p.x - this.playerX) <= 53
      ) {
        let angle = (clamp((p.x - this.playerX) / 48, -1, 1) * Math.PI) / 3;
        if (Math.abs(angle) < 0.16) angle = 0.16 * (this.random() < 0.5 ? -1 : 1);
        p.vx = speed * Math.sin(angle);
        p.vy = -speed * Math.cos(angle);
        p.y = paddleY - radius;
      }
      if (p.y - radius > this.floor) {
        this.miss();
        return;
      }
      const b = this.bricks.find(
        (b) =>
          b.alive &&
          (p.x - clamp(p.x, b.x, b.x + b.w)) ** 2 + (p.y - clamp(p.y, b.y, b.y + b.h)) ** 2 <
            radius ** 2,
      );
      if (b) {
        if (oldX <= b.x - radius || oldX >= b.x + b.w + radius) p.vx *= -1;
        else p.vy *= -1;
        this.hit(b);
        if (this.state !== 'playing') return;
      }
    }
  }
  invaders(dt: number) {
    this.playerX +=
      (clamp(this.pointer.x, 19, this.width - 19) - this.playerX) * Math.min(1, 18 * dt);
    const alive = this.bricks.filter((b) => b.alive),
      top = this.floor - 22;
    if (!alive.length) {
      this.state = 'cleared';
      return;
    }
    const fraction = alive.length / this.bricks.length;
    if (this.time >= this.nextMove) {
      this.nextMove = this.time + (0.09 + 0.56 * fraction) / this.pace;
      const edge =
        this.direction > 0
          ? Math.max(...alive.map((b) => b.x + b.w)) + 12 > this.width - 8
          : Math.min(...alive.map((b) => b.x)) - 12 < 8;
      if (edge) this.direction *= -1;
      for (const b of alive) {
        if (edge) b.y += 8;
        else b.x += this.direction * 12;
      }
    }
    if (alive.some((b) => b.y + b.h >= top - 4)) {
      this.state = 'over';
      return;
    }
    if (this.time >= this.nextFire && this.shots.length < 2) {
      this.shots.push({ x: this.playerX, y: top - 6 });
      this.nextFire = this.time + 0.35;
    }
    this.shots = this.shots.filter((p) => {
      const oldY = p.y;
      p.y -= 620 * dt;
      const hit = alive.find(
        (b) => b.alive && p.x >= b.x && p.x <= b.x + b.w && oldY >= b.y && p.y <= b.y + b.h,
      );
      if (hit) this.hit(hit);
      return !hit && p.y > this.ceiling;
    });
    if (this.state !== 'playing') return;
    if (this.time >= this.nextSpawn) {
      const b = alive[Math.floor(this.random() * alive.length)]!;
      this.bombs.push({ x: b.x + b.w / 2, y: b.y + b.h });
      this.nextSpawn = this.time + (0.45 + 0.9 * this.random() * fraction) / this.pace;
    }
    this.bombs = this.bombs.filter((p) => (p.y += 220 * this.pace * dt) < this.floor);
    if (
      this.bombs.some(
        (p) => Math.abs(p.x - this.playerX) < 19 && p.y >= top && p.y - 12 <= top + 14,
      )
    ) {
      this.bombs = [];
      this.shots = [];
      this.miss();
    }
  }
  ducks(dt: number) {
    const queue = this.bricks.filter((b) => b.headline && b.alive && !b.active);
    const active = this.bricks.filter((b) => b.active);
    const total = this.bricks.filter((b) => b.headline).length || 1;
    const progress = 1 - queue.length / total;
    if (this.time >= this.nextSpawn && active.length < Math.min(3, 1 + Math.floor(progress * 3))) {
      const b = queue[0];
      if (b) {
        const speed = (150 + progress * 120) * this.pace;
        b.active = true;
        b.age = 0;
        b.vx = (this.random() < 0.5 ? -1 : 1) * speed * (0.6 + this.random() * 0.4);
        b.vy = -speed * 0.8;
      }
      this.nextSpawn = this.time + (1.3 - progress * 0.7) / this.pace;
    }
    for (const b of this.bricks.filter((b) => b.active)) {
      const stay = (4.2 - progress * 2.2) / this.pace;
      const escaping = b.age > stay;
      b.age += dt;
      if (!escaping && b.age > stay) {
        b.vx *= 0.4;
        b.vy = -Math.abs(b.vy) * 1.8 - 120;
      }
      b.x += b.vx * dt;
      b.y += (b.vy + 60 * Math.sin(b.age * 7)) * dt;
      if (b.x < 0 || b.x + b.w > this.width) {
        b.x = clamp(b.x, 0, this.width - b.w);
        b.vx *= -1;
      }
      if (!escaping && (b.y < this.ceiling || b.y + b.h > this.floor)) {
        b.y = clamp(b.y, this.ceiling, this.floor - b.h);
        b.vy *= -1;
      }
      b.rotation = 0.2 * Math.sin(b.age * 9);
      if (b.y + b.h < this.ceiling) {
        b.alive = false;
        b.active = false;
        this.miss();
        return;
      }
    }
    if (this.bricks.filter((b) => b.headline).every((b) => !b.alive)) this.state = 'cleared';
  }
  moveSnake(dt: number) {
    const s = this.snake,
      speed = (185 + (this.body.length - 3) * 4 + this.level * 20) * Math.min(1, this.width / 600);
    if (Math.hypot(this.pointer.x - s.x, this.pointer.y - s.y) > 12) {
      const desired = Math.atan2(this.pointer.y - s.y, this.pointer.x - s.x);
      const turn = Math.atan2(Math.sin(desired - s.angle), Math.cos(desired - s.angle));
      s.angle += clamp(turn, -4.6 * dt, 4.6 * dt);
    }
    s.x += Math.cos(s.angle) * speed * dt;
    s.y += Math.sin(s.angle) * speed * dt;
    if (
      s.x < 7 ||
      s.x > this.width - 7 ||
      s.y < this.ceiling + 7 ||
      s.y > this.floor - 7 ||
      this.body.slice(4).some((b) => Math.hypot(s.x - b.x, s.y - b.y) < b.w * 0.4)
    ) {
      this.state = 'over';
      return;
    }
    const word = this.bricks.find((b) => b.alive && inside(s, b, 4));
    if (word) {
      word.alive = false;
      this.score += 10;
      this.spark(s.x, s.y);
      this.body.push({ x: s.x, y: s.y, text: word.text, w: word.w, angle: s.angle });
      if (this.bricks.every((b) => !b.alive)) this.state = 'cleared';
    }
    const food = this.tokens.find((p) => Math.hypot(s.x - p.x, s.y - p.y) < 18);
    if (food) {
      this.tokens = this.tokens.filter((p) => p !== food);
      this.score += 10;
      this.body.push({ x: s.x, y: s.y, text: food.text, w: 22, angle: s.angle });
      this.spark(s.x, s.y);
    }
    this.tokens = this.tokens.filter((p) => this.time - p.born < 10);
    if (this.time >= this.nextSpawn && this.tokens.length < 5) {
      this.nextSpawn = this.time + 1.4;
      const bottom = Math.max(...this.bricks.map((b) => b.homeY + b.h), 100);
      const p = {
        x: 28 + this.random() * (this.width - 56),
        y: bottom + 28 + this.random() * Math.max(0, this.floor - bottom - 56),
        text: String.fromCharCode(65 + Math.floor(this.random() * 26)),
        born: this.time,
      };
      if (Math.hypot(p.x - s.x, p.y - s.y) > 60) this.tokens.push(p);
    }
    this.trail.unshift({ x: s.x, y: s.y });
    let offset = 0,
      walked = 0,
      at = 0;
    this.body.forEach((b, i) => {
      if (i) offset += (this.body[i - 1]!.w + b.w) / 2 + 2;
      while (at < this.trail.length - 2) {
        const p = this.trail[at]!,
          q = this.trail[at + 1]!,
          distance = Math.hypot(p.x - q.x, p.y - q.y);
        if (walked + distance >= offset) break;
        walked += distance;
        at++;
      }
      const p = this.trail[at]!,
        q = this.trail[Math.min(at + 1, this.trail.length - 1)]!;
      const ratio = clamp((offset - walked) / (Math.hypot(p.x - q.x, p.y - q.y) || 1), 0, 1);
      b.x = p.x + (q.x - p.x) * ratio;
      b.y = p.y + (q.y - p.y) * ratio;
      b.angle = Math.atan2(p.y - q.y, p.x - q.x);
    });
    this.trail.length = Math.min(this.trail.length, at + 80);
  }
  returnLetter(b: Brick) {
    Object.assign(b, {
      active: false,
      x: b.homeX,
      y: b.homeY,
      w: b.homeW,
      h: b.homeH,
      scale: 1,
      rotation: 0,
    });
  }
  runner(dt: number) {
    const speed = Math.min(720, 280 + this.time * 9) * this.pace * Math.min(1, this.width / 650);
    this.distance += speed * dt;
    this.rise -= 1750 * dt;
    this.jump = Math.max(0, this.jump + this.rise * dt);
    if (!this.jump) this.rise = Math.max(0, this.rise);
    const runnerX = 60;
    if (this.time >= this.nextSpawn) {
      const b =
        this.bricks.find((b) => b.headline && !b.active && !b.passed) ??
        this.bricks.find((b) => !b.active && !b.passed);
      if (b) {
        b.active = true;
        b.age = 0;
        b.scale = Math.min(1, 30 / b.homeH);
        b.w = b.homeW * b.scale;
        b.h = b.homeH * b.scale;
      }
      this.nextSpawn = this.time + 1.1 + this.random() * 0.8;
    }
    for (const b of this.bricks.filter((b) => b.active)) {
      b.age += dt;
      if (b.age < 0.45) {
        const ratio = b.age / 0.45;
        b.x = b.homeX + (this.width - b.w - 12 - b.homeX) * ratio;
        b.y = b.homeY + (this.floor - b.h - b.homeY) * ratio - 60 * Math.sin(Math.PI * ratio);
      } else {
        b.x -= speed * dt;
        b.y = this.floor - b.h;
        b.rotation = -this.distance / (b.h / 2);
        if (Math.abs(b.x + b.w / 2 - runnerX) < (b.w + 34) / 2 - 8 && this.jump < b.h - 4) {
          this.playerX = runnerX;
          this.miss();
          return;
        }
        if (!b.passed && b.x + b.w < runnerX - 17) {
          b.passed = true;
          this.bonus += 5;
        }
        if (b.x + b.w < 0) this.returnLetter(b);
      }
    }
    this.score = this.baseScore + Math.floor(this.distance / 25) + this.bonus;
    if (this.bricks.filter((b) => b.headline).every((b) => b.passed)) this.state = 'cleared';
  }
}
