(function (root, factory) {
  const battleCore = factory();
  if (typeof module === 'object' && module.exports) module.exports = battleCore;
  else root.BattleCore = battleCore;
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function makeRobot(team) {
    const red = team === 'red';
    return {
      team,
      x: red ? 135 : 625,
      y: 380,
      angle: red ? 0 : 180,
      hp: 100,
      cooldown: 0,
      flash: 0,
      alive: true,
      color: red ? '#ff3b30' : '#18a9ff'
    };
  }

  function normalizeAngle(angle) {
    let result = angle % 360;
    if (result > 180) result -= 360;
    if (result < -180) result += 360;
    return result;
  }

  function enemyInfo(self, enemy) {
    const dx = enemy.x - self.x;
    const dy = enemy.y - self.y;
    const bearing = Math.atan2(dy, dx) * 180 / Math.PI;
    return {
      distance: Math.hypot(dx, dy),
      angle: normalizeAngle(bearing - self.angle),
      energy: enemy.hp
    };
  }

  function projectileInfo(self, bullets) {
    return bullets
      .filter(bullet => bullet.team !== self.team)
      .map(bullet => {
        const toRobotX = self.x - bullet.x;
        const toRobotY = self.y - bullet.y;
        const distance = Math.hypot(toRobotX, toRobotY);
        const speedSquared = bullet.vx ** 2 + bullet.vy ** 2;
        const approach = bullet.vx * toRobotX + bullet.vy * toRobotY;
        const timeToImpact = approach / speedSquared;
        const closestX = bullet.x + bullet.vx * Math.max(0, timeToImpact);
        const closestY = bullet.y + bullet.vy * Math.max(0, timeToImpact);
        const heading = Math.atan2(bullet.vy, bullet.vx) * 180 / Math.PI;
        const side = ((bullet.x - self.x) * bullet.vy - (bullet.y - self.y) * bullet.vx) >= 0 ? 1 : -1;

        return {
          distance,
          incoming: timeToImpact > 0,
          missDistance: Math.hypot(closestX - self.x, closestY - self.y),
          timeToImpact,
          dodgeAngle: normalizeAngle(heading + side * 90 - self.angle)
        };
      });
  }

  function applyActions(robot, actions) {
    robot.angle = normalizeAngle(robot.angle + (actions.turn || 0));
    const radians = robot.angle * Math.PI / 180;
    const nextX = robot.x + Math.cos(radians) * (actions.move || 0) * 2.5;
    const nextY = robot.y + Math.sin(radians) * (actions.move || 0) * 2.5;
    robot.x = Math.max(35, Math.min(725, nextX));
    robot.y = Math.max(35, Math.min(725, nextY));

    if (!actions.fire || robot.cooldown !== 0) return {};

    robot.cooldown = 16;
    return {
      bullet: {
        x: robot.x + Math.cos(radians) * 30,
        y: robot.y + Math.sin(radians) * 30,
        vx: Math.cos(radians) * 17,
        vy: Math.sin(radians) * 17,
        team: robot.team,
        color: robot.color,
        life: 55
      },
      flash: {
        x: robot.x + Math.cos(radians) * 34,
        y: robot.y + Math.sin(radians) * 34,
        life: 5,
        color: robot.color
      }
    };
  }

  function advanceBullets(bullets, robots) {
    const hits = [];
    bullets.forEach(bullet => {
      bullet.x += bullet.vx;
      bullet.y += bullet.vy;
      bullet.life--;
      const target = robots.find(robot => robot.team !== bullet.team);
      if (target?.alive && Math.hypot(bullet.x - target.x, bullet.y - target.y) < 29) {
        target.hp = Math.max(0, target.hp - 5);
        target.flash = 4;
        bullet.life = 0;
        hits.push({ bullet, target });
      }
      if (bullet.x < 0 || bullet.x > 760 || bullet.y < 0 || bullet.y > 760) bullet.life = 0;
    });
    return { bullets: bullets.filter(bullet => bullet.life > 0), hits };
  }

  return { makeRobot, normalizeAngle, enemyInfo, projectileInfo, applyActions, advanceBullets };
}));
