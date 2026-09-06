const test = require('node:test');
const assert = require('node:assert/strict');

const {
  makeRobot,
  normalizeAngle,
  enemyInfo,
  projectileInfo,
  applyActions,
  advanceBullets
} = require('../battle-core.js');

test('makeRobot creates both teams with the expected initial state', () => {
  const red = makeRobot('red');
  const blue = makeRobot('blue');

  assert.deepEqual(
    { team: red.team, x: red.x, angle: red.angle, hp: red.hp, alive: red.alive },
    { team: 'red', x: 135, angle: 0, hp: 100, alive: true }
  );
  assert.deepEqual(
    { team: blue.team, x: blue.x, angle: blue.angle, hp: blue.hp, alive: blue.alive },
    { team: 'blue', x: 625, angle: 180, hp: 100, alive: true }
  );
});

test('normalizeAngle wraps angles into the arena range', () => {
  assert.equal(normalizeAngle(181), -179);
  assert.equal(normalizeAngle(-181), 179);
  assert.equal(normalizeAngle(540), 180);
  assert.equal(normalizeAngle(-540), -180);
  assert.equal(normalizeAngle(45), 45);
});

test('enemyInfo reports distance, relative bearing and energy', () => {
  const self = { x: 10, y: 10, angle: 90 };
  const enemy = { x: 40, y: 50, hp: 65 };
  const info = enemyInfo(self, enemy);

  assert.equal(info.distance, 50);
  assert.ok(Math.abs(info.angle - (-36.86989764584402)) < 1e-10);
  assert.equal(info.energy, 65);
});

test('projectileInfo ignores friendly shots and describes an incoming threat', () => {
  const self = { team: 'red', x: 100, y: 100, angle: 0 };
  const bullets = [
    { team: 'red', x: 50, y: 100, vx: 10, vy: 0 },
    { team: 'blue', x: 40, y: 110, vx: 10, vy: 0 }
  ];
  const [threat] = projectileInfo(self, bullets);

  assert.equal(projectileInfo(self, [bullets[0]]).length, 0);
  assert.equal(threat.incoming, true);
  assert.ok(Math.abs(threat.distance - Math.sqrt(3700)) < 1e-10);
  assert.equal(threat.missDistance, 10);
  assert.equal(threat.timeToImpact, 6);
  assert.equal(threat.dodgeAngle, -90);
});

test('applyActions turns, moves and creates a shot with cooldown', () => {
  const robot = makeRobot('red');
  const result = applyActions(robot, { turn: 90, move: 4, fire: true });

  assert.equal(robot.angle, 90);
  assert.equal(robot.x, 135);
  assert.equal(robot.y, 390);
  assert.equal(robot.cooldown, 16);
  assert.equal(result.bullet.team, 'red');
  assert.equal(result.bullet.life, 55);
  assert.ok(Math.abs(result.bullet.x - 135) < 1e-10);
  assert.equal(result.bullet.y, 420);
  assert.equal(result.flash.life, 5);
});

test('applyActions keeps robots inside the arena and respects cooldown', () => {
  const robot = { ...makeRobot('blue'), x: 720, y: 720, angle: 0, cooldown: 3 };
  const result = applyActions(robot, { move: 10, fire: true });

  assert.equal(robot.x, 725);
  assert.equal(robot.y, 720);
  assert.equal(robot.cooldown, 3);
  assert.deepEqual(result, {});
});

test('advanceBullets applies damage and removes bullets that hit', () => {
  const red = { ...makeRobot('red'), x: 100, y: 100 };
  const blue = { ...makeRobot('blue'), x: 150, y: 100 };
  const bullet = { team: 'red', x: 120, y: 100, vx: 10, vy: 0, life: 5 };
  const result = advanceBullets([bullet], [red, blue]);

  assert.equal(blue.hp, 95);
  assert.equal(blue.flash, 4);
  assert.equal(result.bullets.length, 0);
  assert.equal(result.hits.length, 1);
  assert.equal(result.hits[0].target, blue);
});

test('advanceBullets expires old and out-of-bounds projectiles', () => {
  const robots = [makeRobot('red'), makeRobot('blue')];
  const expired = { team: 'red', x: 300, y: 100, vx: 1, vy: 0, life: 1 };
  const outside = { team: 'blue', x: 755, y: 10, vx: 10, vy: 0, life: 5 };

  assert.equal(advanceBullets([expired, outside], robots).bullets.length, 0);
});
